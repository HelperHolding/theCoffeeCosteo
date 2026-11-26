import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 98: pagos de Sucursales propias (spec 2026-11-25-sucursales-propias-pagos-design.md §3 y §6).
async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const corrida = (llave: string, estado = 'cuadra') => ({
  archivo: 'SUCURSALES 20NOV26.zip',
  n_resumen: 1,
  total_resumen: 100.5,
  n_recibos: 1,
  total_recibos: 100.5,
  avisos: ['aviso de prueba'],
  transferencias: [
    {
      llave,
      tipo: 'SPEI',
      clabe: '012320000000001234',
      alias: 'PROVEEDOR UNO',
      concepto: 'PAGO FACTURAS',
      monto: 100.5,
      fecha_operacion: '2026-11-20',
      proveedor_zoho_id: 'v1',
      proveedor_nombre: 'Proveedor Uno',
      sugerido: true,
      estado,
      asignaciones: [
        { bill_id: 'b1', bill_numero: 'A1', ubicacion: 'DARIO', fecha: '2026-11-06', saldo: 60, monto: 60 },
        {
          bill_id: 'b2',
          bill_numero: 'A2',
          ubicacion: 'NAMORA',
          fecha: '2026-11-07',
          saldo: 40.5,
          monto: 40.5,
        },
      ],
    },
  ],
});

const registrar = (db: PGlite, p: object) =>
  db.query<{ r: { corrida_id: number; rutas: { llave: string; ruta: string }[] } }>(
    'select suc_pagos_registrar_corrida($1::jsonb) r',
    [JSON.stringify(p)],
  );

describe('migración 98: pagos de Sucursales propias', () => {
  let db: PGlite;
  let editor: string;
  let lector: string;
  let tienda: string;
  let sinModulo: string;
  let idT: number;

  beforeAll(async () => {
    db = await crearDbLocal();
    editor = await crearUsuario(db, 'finanzas');
    await darModulo(db, editor, 'sucursales_pagos', 'edicion');
    lector = await crearUsuario(db, 'interno');
    await darModulo(db, lector, 'sucursales_pagos', 'lectura');
    tienda = await crearUsuario(db, 'tienda');
    await darModulo(db, tienda, 'sucursales_pagos', 'edicion');
    sinModulo = await crearUsuario(db, 'admin');
  });
  afterAll(async () => db.close());

  it('el editor registra una corrida completa en una transacción', async () => {
    const r = await comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-AAA1')));
    const { corrida_id, rutas } = r.rows[0].r;
    expect(corrida_id).toBeGreaterThan(0);
    expect(rutas).toHaveLength(1);
    expect(rutas[0].ruta).toMatch(new RegExp(`^${corrida_id}/[0-9a-f]{32}\\.pdf$`));
    const t = await comoUsuario(db, editor, () =>
      db.query<{ id: number; n: number }>(
        `select t.id, (select count(*)::int from suc_pago_asignacion a where a.transferencia_id = t.id) n
         from suc_pago_transferencia t where t.llave = '058-20/11/2026/20-AAA1'`,
      ),
    );
    idT = t.rows[0].id;
    expect(t.rows[0].n).toBe(2);
  });

  it('una llave no se registra dos veces, ni en otra corrida', async () => {
    await expect(
      comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-AAA1'))),
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it('lectura ve la corrida pero no puede registrar', async () => {
    const n = await comoUsuario(db, lector, () =>
      db.query<{ n: number }>('select count(*)::int n from suc_pago_transferencia'),
    );
    expect(n.rows[0].n).toBe(1);
    await expect(comoUsuario(db, lector, () => registrar(db, corrida('L-1')))).rejects.toThrow(
      /solo lectura|permission denied|row-level security/,
    );
  });

  it('rol tienda con el acceso asignado y usuario sin acceso no ven nada', async () => {
    for (const u of [tienda, sinModulo]) {
      const n = await comoUsuario(db, u, () =>
        db.query<{ n: number }>('select count(*)::int n from suc_pago_corrida'),
      );
      expect(n.rows[0].n).toBe(0);
      const nivel = await comoUsuario(db, u, () =>
        db.query<{ n: string | null }>('select suc_pagos_nivel() n'),
      );
      expect(nivel.rows[0].n).toBeNull();
    }
  });

  it('el usuario no puede escribir el resultado de Zoho ni marcar aplicada', async () => {
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`update suc_pago_transferencia set zoho_vendorpayment_id = 'x' where id = $1`, [idT]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`update suc_pago_transferencia set estado = 'aplicada' where id = $1`, [idT]),
      ),
    ).rejects.toThrow(/row-level security|violates/);
  });

  it('reemplazar asignaciones funciona antes de aplicar y se bloquea después', async () => {
    const asig = JSON.stringify([
      { bill_id: 'b1', bill_numero: 'A1', ubicacion: 'DARIO', fecha: null, saldo: 60, monto: 60 },
    ]);
    await comoUsuario(db, editor, () =>
      db.query(
        `select suc_pagos_reemplazar_asignaciones($1, 'no_cuadra', 'v1', 'Proveedor Uno', false, $2::jsonb)`,
        [idT, asig],
      ),
    );
    const n = await comoUsuario(db, editor, () =>
      db.query<{ n: number }>('select count(*)::int n from suc_pago_asignacion where transferencia_id = $1', [
        idT,
      ]),
    );
    expect(n.rows[0].n).toBe(1);
    await comoServicio(db, () =>
      db.query(`update suc_pago_transferencia set estado = 'aplicada' where id = $1`, [idT]),
    );
    await expect(
      comoUsuario(db, editor, () =>
        db.query(
          `select suc_pagos_reemplazar_asignaciones($1, 'cuadra', 'v1', 'Proveedor Uno', false, $2::jsonb)`,
          [idT, asig],
        ),
      ),
    ).rejects.toThrow(/ya no se puede cambiar/);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(`select suc_pagos_reemplazar_asignaciones($1, 'cuadra', 'v1', 'P', false, '[]'::jsonb)`, [
          idT,
        ]),
      ),
    ).rejects.toThrow(/solo lectura/);
  });

  it('la CLABE de una equivalencia debe tener 18 dígitos; lectura no la escribe', async () => {
    await comoUsuario(db, editor, () =>
      db.query(
        `insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('030320900000001111', 'v2', 'Refugio')`,
      ),
    );
    await expect(
      comoUsuario(db, editor, () =>
        db.query(
          `insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('123', 'v2', 'X')`,
        ),
      ),
    ).rejects.toThrow(/check/);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(
          `insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('030320900000002222', 'v3', 'X')`,
        ),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it('el bucket solo acepta recibos de transferencias registradas y antes de aplicar', async () => {
    const r = await comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-BBB2')));
    const ruta = r.rows[0].r.rutas[0].ruta;
    await comoUsuario(db, editor, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('suc-pagos-recibos', $1)`, [ruta]),
    );
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('suc-pagos-recibos', '1/otro.pdf')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const visto = await comoUsuario(db, lector, () =>
      db.query<{ n: number }>(`select count(*)::int n from storage.objects where name = $1`, [ruta]),
    );
    expect(visto.rows[0].n).toBe(1);
  });

  it('la configuración trae el nombre de la cuenta y solo el servicio guarda su id', async () => {
    const c = await comoUsuario(db, lector, () =>
      db.query<{ cuenta_nombre: string }>('select cuenta_nombre from suc_pago_config'),
    );
    expect(c.rows[0].cuenta_nombre).toBe('BANREGIO - CONSOLIDADO SUCURSALES PROPIAS');
    await expect(
      comoUsuario(db, editor, () => db.query(`update suc_pago_config set cuenta_zoho_id = 'x'`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('el insert directo no puede fijar la ruta del recibo ni los campos de Zoho', async () => {
    const ins = (cols: string, vals: string) =>
      comoUsuario(db, editor, () =>
        db.query(
          `insert into suc_pago_transferencia (corrida_id, llave, tipo, alias, monto, fecha_operacion, estado, ${cols})
           select id, 'DIR-' || md5(random()::text), 'SPEI', 'X', 10, '2026-11-20', 'cuadra', ${vals} from suc_pago_corrida limit 1`,
        ),
      );
    await expect(ins('archivo_pdf', `'1/otro.pdf'`)).rejects.toThrow(/row-level security/);
    await expect(ins('archivo_pdf, error', `'1/otro.pdf', 'x'`)).rejects.toThrow(/permission denied/);
    await expect(ins('archivo_pdf, aplicado_en', `'1/otro.pdf', now()`)).rejects.toThrow(/permission denied/);
  });

  it('una transferencia solo cuadra si lo asignado suma su monto', async () => {
    await comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-CCC3', 'no_cuadra')));
    const { id } = (
      await comoUsuario(db, editor, () =>
        db.query<{ id: number }>(
          `select id from suc_pago_transferencia where llave = '058-20/11/2026/20-CCC3'`,
        ),
      )
    ).rows[0];
    const mal = JSON.stringify([
      { bill_id: 'b1', bill_numero: 'A1', ubicacion: 'D', fecha: null, saldo: 60, monto: 60 },
    ]);
    const bien = JSON.stringify([
      { bill_id: 'b1', bill_numero: 'A1', ubicacion: 'D', fecha: null, saldo: 60, monto: 60 },
      { bill_id: 'b2', bill_numero: 'A2', ubicacion: 'N', fecha: null, saldo: 40.5, monto: 40.5 },
    ]);
    const reemplazar = (estado: string, asig: string) =>
      comoUsuario(db, editor, () =>
        db.query(
          `select suc_pagos_reemplazar_asignaciones($1, $2, 'v1', 'Proveedor Uno', false, $3::jsonb)`,
          [id, estado, asig],
        ),
      );
    await expect(reemplazar('cuadra', mal)).rejects.toThrow(/no es igual a la transferencia/);
    await reemplazar('cuadra', bien);
    const e = await db.query<{ estado: string }>('select estado from suc_pago_transferencia where id = $1', [
      id,
    ]);
    expect(e.rows[0].estado).toBe('cuadra');
  });
});
