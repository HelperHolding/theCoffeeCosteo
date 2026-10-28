import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import {
  aplicarCarga,
  ErrorConciliacion,
  revertirCarga,
  guardarLecturas,
  guardarTiendas,
  type Db,
} from '../../scripts/analytics/persistencia';
import type { LecturaDiaria } from '../../lib/analytics/contrato';
import { comoUsuario, crearUsuario, num } from './utilidades';

let db: PGlite;
let admin: string, adminInactivo: string, finanzas: string;
const T0 = Date.now();
const hace = (h: number) => new Date(T0 - h * 3600_000).toISOString();
const ayer = () => new Date(Date.now() - 3 * 86400_000).toISOString().slice(0, 10);

const pos = (
  o: Partial<LecturaDiaria> & { mostrador?: number; app?: number; rappi?: number } = {},
): LecturaDiaria => ({
  fuente: 'pos',
  company_id: 612,
  fecha: ayer(),
  leido_en: hace(6),
  provisional: false,
  completa: true,
  version_calculo: 'pos-diario-v1',
  criterio_fecha: 'prueba',
  origen: 'prueba',
  carga_id: randomUUID(),
  canales: [
    { canal: 'mostrador', venta_cent: o.mostrador ?? 10_000, tickets: 2, unidades: 3 },
    { canal: 'app', venta_cent: o.app ?? 5_050, tickets: 1, unidades: 1 },
    { canal: 'rappi', venta_cent: o.rappi ?? 9_900, tickets: 1, unidades: 2 },
    { canal: 'desconocido', venta_cent: 0, tickets: 0, unidades: 0 },
  ],
  ...o,
});

const filasVenta = async () =>
  (
    await db.query<{ n: number; v: number }>(
      `select count(*) n, coalesce(sum(venta_cent),0) v from analytics_ventas_diarias where company_id = 612`,
    )
  ).rows[0];

beforeAll(async () => {
  db = await crearDbLocal();
  admin = await crearUsuario(db, 'admin');
  adminInactivo = await crearUsuario(db, 'admin');
  finanzas = await crearUsuario(db, 'finanzas');
  await db.query('update perfiles set activo = false where user_id = $1', [adminInactivo]);
  await guardarTiendas(
    db as unknown as Db,
    [
      { company_id: 612, store_id: 477, nombre: 'Cd. Juárez', relaciones: ['zoho', 'crm'] },
      { company_id: 532, store_id: 455, nombre: 'Rubén Darío', relaciones: ['zoho', 'crm'] },
    ],
    '2026-10-27T18:00:00Z',
  );
});
afterAll(async () => db.close());

describe('analytics_guardar_lectura', () => {
  it('inserta, y reejecutar la misma lectura no duplica nada', async () => {
    expect(await guardarLecturas(db as unknown as Db, [pos()])).toEqual({
      insertada: 1,
      actualizada: 0,
      ignorada: 0,
    });
    const antes = await filasVenta();
    expect(await guardarLecturas(db as unknown as Db, [pos(), pos()])).toEqual({
      insertada: 0,
      actualizada: 0,
      ignorada: 2,
    });
    expect(await filasVenta()).toEqual(antes);
    expect(num(antes.n)).toBe(4);
  });

  it('una lectura más reciente reemplaza todos sus canales; una más antigua se ignora', async () => {
    const r = await guardarLecturas(db as unknown as Db, [pos({ leido_en: hace(4), mostrador: 20_000 })]);
    expect(r.actualizada).toBe(1);
    expect(num((await filasVenta()).v)).toBe(20_000 + 5_050 + 9_900);
    const vieja = await guardarLecturas(db as unknown as Db, [pos({ leido_en: hace(8), mostrador: 1 })]);
    expect(vieja.ignorada).toBe(1);
    expect(num((await filasVenta()).v)).toBe(20_000 + 5_050 + 9_900);
  });

  it('rechaza lecturas incompletas sin tocar la buena', async () => {
    const mala = { ...pos({ leido_en: hace(2), mostrador: 1 }), completa: false } as unknown as LecturaDiaria;
    await expect(guardarLecturas(db as unknown as Db, [mala])).rejects.toThrow(/lecturas completas/);
    const sinCanal = pos({ leido_en: hace(2) });
    sinCanal.canales = sinCanal.canales.slice(0, 3);
    await expect(guardarLecturas(db as unknown as Db, [sinCanal])).rejects.toThrow(/exactamente los canales/);
    const repetido = pos({ leido_en: hace(2) });
    repetido.canales[3] = { ...repetido.canales[0] };
    await expect(guardarLecturas(db as unknown as Db, [repetido])).rejects.toThrow(/exactamente los canales/);
    expect(num((await filasVenta()).v)).toBe(20_000 + 5_050 + 9_900);
  });

  it('rechaza fechas futuras y días abiertos sin marca de provisional; acepta el día abierto provisional', async () => {
    const manana = new Date(Date.now() + 2 * 86400_000).toISOString().slice(0, 10);
    await expect(
      guardarLecturas(db as unknown as Db, [pos({ fecha: manana, provisional: true })]),
    ).rejects.toThrow(/futura/);
    const hoy = (
      await db.query<{ d: string }>(
        `select min((now() at time zone z)::date)::text d from unnest(array['America/Tijuana','America/Cancun','America/Ciudad_Juarez','America/Hermosillo']) z`,
      )
    ).rows[0].d;
    await expect(
      guardarLecturas(db as unknown as Db, [pos({ fecha: hoy, leido_en: new Date().toISOString() })]),
    ).rejects.toThrow(/provisional/);
    expect(
      (
        await guardarLecturas(db as unknown as Db, [
          pos({ fecha: hoy, provisional: true, leido_en: new Date().toISOString() }),
        ])
      ).insertada,
    ).toBe(1);
  });

  it('valida canales por fuente y tienda incluida', async () => {
    await expect(guardarLecturas(db as unknown as Db, [pos({ company_id: 999 })])).rejects.toThrow(
      /foreign key/,
    );
    const rappiMal = { ...pos(), fuente: 'zoho_rappi' } as LecturaDiaria;
    await expect(guardarLecturas(db as unknown as Db, [rappiMal])).rejects.toThrow(/exactamente los canales/);
  });

  it('la vista de KPI excluye Rappi del POS y toda la fuente zoho_rappi', async () => {
    await guardarLecturas(db as unknown as Db, [
      {
        ...pos({ company_id: 532 }),
        fuente: 'zoho_rappi',
        canales: [
          { canal: 'rappi', venta_cent: 466_680, tickets: 24, unidades: 30 },
          { canal: 'rappi_turbo', venta_cent: 1, tickets: 1, unidades: 1 },
        ],
      },
    ]);
    const k = (
      await db.query<Record<string, unknown>>(
        `select company_id, venta_cent, tickets, unidades, rappi_pos_tickets from analytics_ventas_kpi where fecha = $1 order by 1`,
        [ayer()],
      )
    ).rows;
    expect(
      k.map((r) => [
        num(r.company_id),
        num(r.venta_cent),
        num(r.tickets),
        num(r.unidades),
        num(r.rappi_pos_tickets),
      ]),
    ).toEqual([[612, 25_050, 3, 4, 1]]);
  });
});

describe('acceso a Analytics', () => {
  const leer = (u: string) =>
    comoUsuario(db, u, async () => ({
      kpi: (await db.query('select * from analytics_ventas_kpi')).rows.length,
      lecturas: (await db.query('select * from analytics_lecturas')).rows.length,
      ventas: (await db.query('select * from analytics_ventas_diarias')).rows.length,
      tiendas: (await db.query('select * from analytics_tiendas')).rows.length,
    }));

  it('solo un admin activo lee', async () => {
    const a = await leer(admin);
    expect(a.kpi).toBeGreaterThan(0);
    expect(a.tiendas).toBe(2);
    expect(await leer(adminInactivo)).toEqual({ kpi: 0, lecturas: 0, ventas: 0, tiendas: 0 });
    expect(await leer(finanzas)).toEqual({ kpi: 0, lecturas: 0, ventas: 0, tiendas: 0 });
  });

  it('anon no lee nada', async () => {
    await db.exec('set role anon');
    try {
      for (const t of [
        'analytics_ventas_kpi',
        'analytics_lecturas',
        'analytics_ventas_diarias',
        'analytics_tiendas',
      ])
        await expect(db.query(`select * from ${t}`)).rejects.toThrow(/permission denied/);
    } finally {
      await db.exec('reset role');
    }
  });

  it('nadie escribe ni ejecuta la carga desde el portal (ni admin)', async () => {
    await expect(
      comoUsuario(db, admin, () =>
        db.query(`select analytics_guardar_lectura($1::jsonb)`, [JSON.stringify(pos())]),
      ),
    ).rejects.toThrow(/permission denied/);
    for (const sql of [
      `delete from analytics_ventas_diarias`,
      `update analytics_lecturas set provisional = true`,
      `insert into analytics_tiendas (company_id, store_id, nombre, relaciones, verificado_en) values (1, 1, 'x', '{crm}', now())`,
    ])
      await expect(comoUsuario(db, admin, () => db.query(sql))).rejects.toThrow(/permission denied/);
  });

  it('un token OAuth (MCP) no lee aunque sea admin', async () => {
    await db.query(`select set_config('request.jwt.claims', '{"client_id":"mcp"}', false)`);
    try {
      expect((await leer(admin)).lecturas).toBe(0);
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });
});

describe('seguridad de objetos', () => {
  it('la vista KPI es security_invoker y la función no es SECURITY DEFINER, con search_path vacío', async () => {
    const v = (
      await db.query<{ o: string[] | null }>(
        `select reloptions o from pg_class where oid = 'public.analytics_ventas_kpi'::regclass`,
      )
    ).rows[0];
    expect(v.o).toContain('security_invoker=true');
    const f = (
      await db.query<{ definer: boolean; config: string[] | null }>(
        `select prosecdef definer, proconfig config from pg_proc where oid = 'public.analytics_guardar_lectura(jsonb)'::regprocedure`,
      )
    ).rows[0];
    expect(f.definer).toBe(false);
    expect(f.config).toEqual(['search_path=""']);
  });

  it('anon y authenticated no pueden ejecutar la función', async () => {
    const p = (
      await db.query<{ anon: boolean; auth: boolean }>(
        `select has_function_privilege('anon', 'public.analytics_guardar_lectura(jsonb)', 'execute') anon,
              has_function_privilege('authenticated', 'public.analytics_guardar_lectura(jsonb)', 'execute') auth`,
      )
    ).rows[0];
    expect(p).toEqual({ anon: false, auth: false });
    await db.exec('set role anon');
    try {
      await expect(db.query(`select analytics_guardar_lectura('{}'::jsonb)`)).rejects.toThrow(
        /permission denied/,
      );
    } finally {
      await db.exec('reset role');
    }
  });
});

describe('aplicarCarga (transacción completa)', () => {
  const tiendas = [
    { company_id: 583, store_id: 498, nombre: 'Bonampak', relaciones: ['zoho', 'crm'] as ('zoho' | 'crm')[] },
  ];
  const lectura = (o: Parameters<typeof pos>[0] = {}) =>
    pos({ company_id: 583, fecha: hace(72).slice(0, 10), ...o });

  it('confirma cuando todo concilia y es idempotente', async () => {
    const r = await aplicarCarga(db as unknown as Db, tiendas, hace(1), [lectura()]);
    expect(r.primera.insertada).toBe(1);
    expect(r.segunda.ignorada).toBe(1);
    expect(r.conciliacion.ok).toBe(true);
  });

  it('si la conciliación falla, hace ROLLBACK de TODO (tiendas incluidas)', async () => {
    // En la base hay una lectura MÁS RECIENTE de 583: la del archivo se ignora y no concilia.
    await guardarLecturas(db as unknown as Db, [lectura({ leido_en: hace(0.5), mostrador: 77_700 })]);
    const nueva = {
      company_id: 584,
      store_id: 499,
      nombre: 'Nueva',
      relaciones: ['zoho'] as ('zoho' | 'crm')[],
    };
    await expect(
      aplicarCarga(db as unknown as Db, [...tiendas, nueva], hace(1), [lectura({ leido_en: hace(5) })]),
    ).rejects.toBeInstanceOf(ErrorConciliacion);
    expect((await db.query(`select 1 from analytics_tiendas where company_id = 584`)).rows).toEqual([]);
    const v = await db.query<{ v: number }>(
      `select venta_cent v from analytics_ventas_diarias where company_id = 583 and canal = 'mostrador'`,
    );
    expect(v.rows.map((r) => num(r.v))).toEqual([77_700]);
  });

  it('un error a mitad de la carga también deja la base como estaba', async () => {
    const antes = (await db.query(`select count(*) n from analytics_lecturas`)).rows;
    const mala = {
      ...lectura({ fecha: hace(96).slice(0, 10) }),
      completa: false,
    } as unknown as LecturaDiaria;
    await expect(
      aplicarCarga(db as unknown as Db, tiendas, hace(1), [lectura({ fecha: hace(120).slice(0, 10) }), mala]),
    ).rejects.toThrow(/lecturas completas/);
    expect((await db.query(`select count(*) n from analytics_lecturas`)).rows).toEqual(antes);
  });
});

describe('revertirCarga restaura, no solo borra', () => {
  it('una carga que reemplaza una versión previa se revierte a esa versión exacta, y las altas se quitan', async () => {
    const tiendaPrevia = {
      company_id: 700,
      store_id: 600,
      nombre: 'Previa',
      relaciones: ['crm'] as ('zoho' | 'crm')[],
    };
    const fecha = hace(150).slice(0, 10);
    const previa = pos({ company_id: 700, fecha, leido_en: hace(140), mostrador: 11_100 });
    await aplicarCarga(db as unknown as Db, [tiendaPrevia], hace(140), [previa]);
    const foto = async () =>
      (
        await db.query(
          `select l.carga_id::text, l.leido_en, v.canal, v.venta_cent from analytics_lecturas l
           join analytics_ventas_diarias v using (fuente, company_id, fecha)
           where l.company_id in (700, 701) order by 1, 3`,
        )
      ).rows;
    const antes = await foto();

    const nuevaTienda = {
      company_id: 701,
      store_id: 601,
      nombre: 'Alta',
      relaciones: ['zoho'] as ('zoho' | 'crm')[],
    };
    const carga = '00000000-0000-4000-8000-000000000001';
    const r = await aplicarCarga(
      db as unknown as Db,
      [{ ...tiendaPrevia, nombre: 'Renombrada' }, nuevaTienda],
      hace(1),
      [
        pos({ company_id: 700, fecha, leido_en: hace(2), mostrador: 99_900, carga_id: carga }),
        pos({ company_id: 701, fecha, leido_en: hace(2), carga_id: carga }),
      ],
    );
    expect(r.primera.actualizada).toBe(1);
    expect(r.respaldo.lecturas).toHaveLength(1);
    expect(r.respaldo.tiendas.map((t) => t.company_id)).toEqual([700]);

    const rev = await revertirCarga(db as unknown as Db, [carga], r.respaldo, [700, 701]);
    expect(rev).toMatchObject({ borradas: 2, restauradas: { insertada: 1 }, tiendasBorradas: 1 });
    expect(await foto()).toEqual(antes);
    expect((await db.query(`select nombre from analytics_tiendas where company_id = 700`)).rows).toEqual([
      { nombre: 'Previa' },
    ]);
    expect((await db.query(`select 1 from analytics_tiendas where company_id = 701`)).rows).toEqual([]);
  });
});
