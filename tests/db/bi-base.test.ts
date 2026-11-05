import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';
import zoho from '../../docs/bi/zoho/filtros.json';

// Migración 40: base del BI. Tablas cerradas; un día se guarda y reemplaza por RPC de servicio.
let db: PGlite;
let u: string;
const linea = (pedido: string, n: number, extra: Record<string, unknown> = {}) => ({
  pedido,
  linea: n,
  hora: 9,
  canal: 'mostrador',
  metodo_pago: 'CARTAO',
  tipo_pago: 'EMV',
  smartphone: false,
  opcion_consumo: null,
  codigo: '5IL',
  nombre: 'Iced Latte',
  unidades: 1,
  importe_cent: 8000,
  descuento_cent: 0,
  ...extra,
});
const guardar = async (fuente: string, company: number, fecha: string, lineas: unknown[], completa = true) => {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ n: number }>('select public.bi_guardar_dia($1, $2, $3, $4, now(), $5) n', [
        fuente,
        company,
        fecha,
        completa,
        JSON.stringify(lineas),
      ])
    ).rows[0].n;
  } finally {
    await db.exec('reset role');
  }
};

beforeAll(async () => {
  db = await crearDbLocal();
  u = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513)', [u]);
});
afterAll(async () => db.close());

describe('migración 40: base del BI', () => {
  it('un fallo al re-guardar un día ya cargado deja intactas sus líneas y su carga (rollback)', async () => {
    await guardar('pos', 513, '2026-10-10', [linea('1', 1), linea('2', 1)]);
    const sel = `select pedido, linea from bi_lineas where company_id = 513 and fecha = '2026-10-10' order by 1, 2`;
    const antes = await db.query(sel);
    await expect(guardar('pos', 513, '2026-10-10', [linea('7', 1), linea('7', 1)])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-10', [linea('7', 1, { hora: 24 })])).rejects.toThrow();
    const despues = await db.query(sel);
    expect(despues.rows).toEqual(antes.rows);
    expect(despues.rows.length).toBe(2);
    const c = await db.query<{ lineas: number }>(
      `select lineas from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-10'`,
    );
    expect(c.rows[0].lineas).toBe(2);
  });

  it('re-guardar pos de una tienda y día no toca zoho_rappi ni otras tiendas o fechas', async () => {
    await guardar('pos', 513, '2026-10-11', [linea('1', 1)]);
    await guardar('zoho_rappi', 513, '2026-10-11', [linea('R1', 1, { canal: 'rappi', metodo_pago: 'RAPPI' })]);
    await guardar('pos', 514, '2026-10-11', [linea('1', 1)]);
    await guardar('pos', 513, '2026-10-12', [linea('1', 1)]);
    await guardar('pos', 513, '2026-10-11', [linea('2', 1), linea('2', 2)]);
    const r = await db.query<{ fuente: string; company_id: number; fecha: string; n: number }>(
      `select fuente, company_id, to_char(fecha, 'YYYY-MM-DD') fecha, count(*)::int n from bi_lineas
       where fecha in ('2026-10-11', '2026-10-12') group by 1, 2, 3 order by 1, 2, 3`,
    );
    expect(r.rows).toEqual([
      { fuente: 'pos', company_id: 513, fecha: '2026-10-11', n: 2 },
      { fuente: 'pos', company_id: 513, fecha: '2026-10-12', n: 1 },
      { fuente: 'pos', company_id: 514, fecha: '2026-10-11', n: 1 },
      { fuente: 'zoho_rappi', company_id: 513, fecha: '2026-10-11', n: 1 },
    ]);
  });

  it('rechaza p_lineas nulo o que no sea arreglo, sin registrar el día', async () => {
    await db.exec('set role service_role');
    try {
      await expect(
        db.query(`select public.bi_guardar_dia('pos', 513, '2026-10-13', true, now(), null)`),
      ).rejects.toThrow(/arreglo/i);
      await expect(
        db.query(`select public.bi_guardar_dia('pos', 513, '2026-10-13', true, now(), '{}'::jsonb)`),
      ).rejects.toThrow(/arreglo/i);
    } finally {
      await db.exec('reset role');
    }
    const c = await db.query(`select 1 from bi_cargas where company_id = 513 and fecha = '2026-10-13'`);
    expect(c.rows.length).toBe(0);
  });

  it('tablas y guardado cerrados al portal', async () => {
    for (const t of ['bi_lineas', 'bi_cargas', 'bi_tiendas', 'bi_clasificacion_producto', 'bi_mapeo_pago', 'bi_metas', 'bi_punto_equilibrio'])
      await expect(comoUsuario(db, u, () => db.query(`select * from ${t}`))).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, u, () => db.query(`select public.bi_guardar_dia('pos', 513, '2026-10-01', true, now(), '[]')`)),
    ).rejects.toThrow(/permission denied/);
  });

  it('guarda un día con su carga y marca si trae Rappi', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('1', 1), linea('1', 2, { codigo: 'BRO13', nombre: 'Brownie' }), linea('2', 1, { canal: 'rappi', metodo_pago: 'RAPPI' })])).toBe(3);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: true, rappi_en_pos: true });
  });

  it('volver a guardar el día lo reemplaza: sin duplicados ni líneas viejas', async () => {
    expect(await guardar('pos', 513, '2026-10-01', [linea('9', 1)], false)).toBe(1);
    const r = await db.query<{ pedido: string }>(`select pedido from bi_lineas where company_id = 513 and fecha = '2026-10-01'`);
    expect(r.rows.map((x) => x.pedido)).toEqual(['9']);
    const c = await db.query<{ completa: boolean; rappi_en_pos: boolean }>(
      `select completa, rappi_en_pos from bi_cargas where fuente = 'pos' and company_id = 513 and fecha = '2026-10-01'`,
    );
    expect(c.rows[0]).toEqual({ completa: false, rappi_en_pos: false });
  });

  it('rechaza fuente, canal u hora inválidos', async () => {
    await expect(guardar('uber', 513, '2026-10-02', [])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { canal: 'uber' })])).rejects.toThrow();
    await expect(guardar('pos', 513, '2026-10-02', [linea('1', 1, { hora: 24 })])).rejects.toThrow();
  });
});

describe('semana y maduración como en Zoho', () => {
  it('bi_semana reproduce weekofyear de Zoho en todas las muestras', async () => {
    for (const m of zoho.semana.muestras) {
      const r = await db.query<{ s: number }>('select public.bi_semana($1::date) s', [m.fecha]);
      expect([m.fecha, r.rows[0].s]).toEqual([m.fecha, m.semana]);
    }
  });
  it('bi_anio_semana es el año calendario (Zoho rotula W1 2025 al 2025-12-31)', async () => {
    const r = await db.query<{ a: number; b: number }>(
      `select public.bi_anio_semana('2025-12-31') a, public.bi_anio_semana('2026-01-01') b`,
    );
    expect(r.rows[0]).toEqual({ a: 2025, b: 2026 });
  });
  it('bi_meses_operando da los meses completos de los ejemplos de Zoho', async () => {
    for (const e of zoho.mesesOperando.ejemplos) {
      const r = await db.query<{ m: number }>('select public.bi_meses_operando($1::date, $2::date) m', [e.primera, e.hoy]);
      expect([e.primera, r.rows[0].m]).toEqual([e.primera, e.meses]);
    }
  });
  it('bi_maduracion aplica los tramos de Zoho y devuelve null sin apertura', async () => {
    for (const t of zoho.maduracion) {
      const r = await db.query<{ m: string }>(
        `select public.bi_maduracion('2026-01-01'::date, ('2026-01-01'::date + make_interval(months => $1::int))::date) m`,
        [t.minMeses],
      );
      expect(r.rows[0].m).toBe(t.etiqueta);
    }
    const lim = await db.query<{ a: string; b: string; n: string | null }>(
      `select public.bi_maduracion('2026-01-01', '2026-03-31') a, public.bi_maduracion('2026-01-01', '2026-04-01') b,
              public.bi_maduracion(null, '2026-04-01') n`,
    );
    expect(lim.rows[0]).toEqual({ a: 'Menor de 3 meses', b: 'Mayor de 3 meses', n: null });
  });
  it('marca Rappi del portal en un día sin ventas Rappi (solo servicio)', async () => {
    await guardar('pos', 513, '2026-10-03', [linea('1', 1)]);
    await expect(
      comoUsuario(db, u, () => db.query(`select public.bi_marcar_rappi_portal(513, '2026-10-03')`)),
    ).rejects.toThrow(/permission denied/);
    await db.exec('set role service_role');
    await db.query(`select public.bi_marcar_rappi_portal(513, '2026-10-03')`);
    await db.exec('reset role');
    const c = await db.query<{ r: boolean }>(
      `select rappi_en_pos r from bi_cargas where fuente='pos' and company_id=513 and fecha='2026-10-03'`,
    );
    expect(c.rows[0].r).toBe(true);
  });
});
