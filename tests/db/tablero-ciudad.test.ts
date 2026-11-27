import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';

/**
 * Migración 99 (docs/sucursales/18 y 19): el Tablero Guadalajara lo ve completo todo usuario con el módulo Sucursales,
 * aunque no tenga esas sucursales asignadas; sin el módulo, nada. Las RPC de siempre siguen con el acceso por sucursal
 * y dan lo mismo que antes (sus pruebas de siempre corren sobre esta migración). Las bases no se llaman desde el portal.
 */
let db: PGlite;
let soloModulo: string; // módulo Sucursales con una sucursal que NO es de GDL
let sinModulo: string; // rol de Costeo, sin módulo Sucursales
let conCosteo: string; // operaciones + módulo, sin sucursales asignadas
let todas: string; // módulo con 513, 514 y 545 asignadas
const GDL = sucursalesConfiguradas.filter((s) => s.ciudad === 'Guadalajara').map((s) => s.companyId);
const PEDIDAS = [513, 514, 545]; // 545 (Polanco) no es de GDL
const HOYS = ['2026-11-26', '2026-11-26', '2026-11-26'];

const uno = async <T>(usuario: string, sql: string, args: unknown[] = []) =>
  comoUsuario(db, usuario, async () => (await db.query<{ r: T }>(sql, args)).rows[0].r);
const origenes = (ventaCent: number) =>
  JSON.stringify({ mostrador: { pedidos: 1, venta_cent: ventaCent, descuento_cent: 0, lineas: 1 } });

beforeAll(async () => {
  db = await crearDbLocal();
  soloModulo = await crearUsuario(db, 'sucursales');
  sinModulo = await crearUsuario(db, 'operaciones');
  conCosteo = await crearUsuario(db, 'operaciones');
  todas = await crearUsuario(db, 'sucursales');
  for (const u of [soloModulo, conCosteo, todas]) await darModulo(db, u, 'sucursales', 'lectura');
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 545)', [soloModulo]);
  await db.query(
    'insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($1, 514), ($1, 545)',
    [todas],
  );
  // Resumen de ventas: hoy y hace 7 días para las tres.
  for (const [c, v] of [
    [513, 10000],
    [514, 20000],
    [545, 99900],
  ] as const)
    for (const f of ['2026-11-26', '2026-11-19'])
      await db.query(
        `insert into sucursales_resumen_dia (company_id, fecha, leido_en, corte_segundo, completa, origenes, horas, tramos, productos)
         values ($1, $2, now(), 43200, true, $3, '{}', '[]', '[]')`,
        [c, f, origenes(v)],
      );
  // Nivel de servicio: una tienda de GDL (Essentia) y una de Polanco.
  await db.query(
    `insert into rappi_servicio_dia (rappi_tienda_id, fecha, pedidos, finalizados) values
       ('MX1930270836', '2026-11-25', 10, 9), ('MX1930270759', '2026-11-25', 50, 50)`,
  );
  // Consumo de octubre: 513 y 545.
  for (const c of [513, 545]) {
    await db.query(
      `insert into sucursales_consumo_mes_sucursal (mes, company_id, recetas_leidas_en, completa, cobertura, sin_receta)
       values ('2026-10-01', $1, now(), true, '{}', '{}')`,
      [c],
    );
    await db.query(
      `insert into sucursales_consumo_mes (mes, company_id, origen, insumo_id, insumo, unidad, categoria, cantidad)
       values ('2026-10-01', $1, 'mostrador', '00000000-0000-0000-0000-000000000001', 'LECHE ENTERA', 'ml', 'LECHE', $2)`,
      [c, c === 513 ? 1000 : 5000],
    );
  }
  // Menú: un producto apagado en GDL y otro en Polanco.
  for (const [tienda, nombre] of [
    ['MX1930270836', 'Brownie'],
    ['MX1930270759', 'Bagel'],
  ])
    await db.query(
      `insert into rappi_menu_productos (rappi_tienda_id, producto_id, nombre, nombre_norm, disponible, visto_en)
       values ($1, 1, $2, lower($2), false, now())`,
      [tienda, nombre],
    );
  // Costeo de octubre para 513 y 545.
  await db.exec('set role service_role');
  try {
    for (const c of [513, 545])
      await db.query('select public.sucursales_guardar_costeo_mes($1, $2, $3)', [
        '2026-10-01',
        c,
        JSON.stringify({
          costos_leidos_en: '2026-11-27T12:00:00Z',
          completa: true,
          resumen: { todos: {} },
          productos: [],
        }),
      ]);
  } finally {
    await db.exec('reset role');
  }
});
afterAll(async () => db.close());

describe('sucursales de la ciudad', () => {
  it('la tabla de ciudades es exactamente la config (ciudad Guadalajara)', async () => {
    const r = await db.query<{ company_id: number }>(
      `select company_id from sucursales_ciudades where ciudad = 'guadalajara' order by 1`,
    );
    expect(r.rows.map((x) => x.company_id)).toEqual([...GDL].sort((a, b) => a - b));
    expect(GDL).toHaveLength(11);
  });

  it('con el módulo: las 11 de GDL aunque no tenga ninguna asignada; sin el módulo o por OAuth, ninguna', async () => {
    expect(await uno<number[]>(soloModulo, `select sucursales_ciudad_companias('guadalajara') r`)).toEqual(
      [...GDL].sort((a, b) => a - b),
    );
    expect(await uno<number[]>(sinModulo, `select sucursales_ciudad_companias('guadalajara') r`)).toEqual([]);
    expect(await uno<number[]>(soloModulo, `select sucursales_ciudad_companias('monterrey') r`)).toEqual([]);
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ sub: soloModulo, client_id: 'grok' }),
    ]);
    try {
      expect(await uno<number[]>(soloModulo, `select sucursales_ciudad_companias('guadalajara') r`)).toEqual(
        [],
      );
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });

  it('las bases y las tablas no se leen desde el portal', async () => {
    for (const sql of [
      `select sucursales_tablero_hoy_base('{513}', '{2026-11-26}')`,
      `select sucursales_tablero_periodo_base('{513}', '2026-11-20', '2026-11-26')`,
      `select sucursales_servicio_nacional_base('{513}', '2026-11-20', '2026-11-26')`,
      `select sucursales_consumo_nacional_base('2026-10-01', '{513}')`,
      `select sucursales_menu_nacional_base('{513}')`,
      `select sucursales_datos_costeo_datos()`,
      `select * from sucursales_ciudades`,
      `select * from sucursales_costeo_mes_sucursal`,
    ])
      await expect(comoUsuario(db, conCosteo, () => db.query(sql))).rejects.toThrow(/permission denied/);
  });
});

describe('RPC de la ciudad', () => {
  type Hoy = { dias: { company_id: number; fecha: string; hoy: boolean }[] };
  const hoy = (u: string) =>
    uno<Hoy>(u, `select sucursales_ciudad_tablero_hoy('guadalajara', $1, $2) r`, [PEDIDAS, HOYS]);

  it('tablero de hoy: solo GDL aunque se pida Polanco, para quien no tiene ninguna; vacío sin módulo', async () => {
    const r = await hoy(soloModulo);
    expect([...new Set(r.dias.map((d) => d.company_id))]).toEqual([513, 514]);
    expect(r.dias.filter((d) => d.hoy)).toHaveLength(2);
    expect((await hoy(sinModulo)).dias).toEqual([]);
  });

  it('mismo resultado que el tablero de siempre para quien sí tiene esas sucursales', async () => {
    const ciudad = await uno<Hoy>(todas, `select sucursales_ciudad_tablero_hoy('guadalajara', $1, $2) r`, [
      [513, 514],
      HOYS.slice(0, 2),
    ]);
    const siempre = await uno<Hoy>(todas, `select sucursales_tablero_hoy($1, $2) r`, [
      [513, 514],
      HOYS.slice(0, 2),
    ]);
    expect(ciudad).toEqual(siempre);
    type Periodo = { semanas: { company_id: number; venta_cent: number }[]; dias_leidos: number };
    const p1 = await uno<Periodo>(
      todas,
      `select sucursales_ciudad_tablero_periodo('guadalajara', $1, '2026-11-16', '2026-11-29') r`,
      [PEDIDAS],
    );
    const p2 = await uno<Periodo>(
      todas,
      `select sucursales_tablero_periodo($1, '2026-11-16', '2026-11-29') r`,
      [[513, 514]],
    );
    expect(p1).toEqual(p2);
    expect(p1.dias_leidos).toBe(4);
  });

  it('servicio, consumo, desglose y menú: solo GDL para quien tiene el módulo; vacío sin él', async () => {
    type Servicio = { tiendas: { company_id: number }[]; por_tienda: { tienda: string; pedidos: number }[] };
    const s = await uno<Servicio>(
      soloModulo,
      `select sucursales_ciudad_servicio('guadalajara', $1, '2026-11-20', '2026-11-26') r`,
      [PEDIDAS],
    );
    expect([...new Set(s.tiendas.map((t) => t.company_id))].sort()).toEqual([513, 514]);
    expect(s.por_tienda).toEqual([expect.objectContaining({ tienda: 'MX1930270836', pedidos: 10 })]);
    const s0 = await uno<Servicio>(
      sinModulo,
      `select sucursales_ciudad_servicio('guadalajara', $1, '2026-11-20', '2026-11-26') r`,
      [PEDIDAS],
    );
    expect(s0.tiendas).toEqual([]);

    type Consumo = { sucursales: { company_id: number }[]; insumos: { cantidad: number }[] };
    const c = await uno<Consumo>(
      soloModulo,
      `select sucursales_ciudad_consumo('guadalajara', '2026-10-01', $1) r`,
      [PEDIDAS],
    );
    expect(c.sucursales.map((x) => x.company_id)).toEqual([513]);
    expect(c.insumos.map((x) => Number(x.cantidad))).toEqual([1000]);
    const d = await uno<{ company_id: number }[]>(
      soloModulo,
      `select sucursales_ciudad_consumo_desglose('guadalajara', '2026-10-01', $1, null) r`,
      [PEDIDAS],
    );
    expect(d.map((x) => x.company_id)).toEqual([513]);

    type Menu = { apagados: { tienda: string; nombre: string }[] };
    const m = await uno<Menu>(soloModulo, `select sucursales_ciudad_menu('guadalajara', $1) r`, [PEDIDAS]);
    expect(m.apagados.map((x) => x.nombre)).toEqual(['Brownie']);
    expect(
      (await uno<Menu>(sinModulo, `select sucursales_ciudad_menu('guadalajara', $1) r`, [PEDIDAS])).apagados,
    ).toEqual([]);
  });

  it('costeo: módulo Y permiso de Costeo; solo GDL; sin mes, el último calculado', async () => {
    type Costeo = { mes: string; meses: string[]; sucursales: { company_id: number }[] } | null;
    expect(
      await uno<Costeo>(soloModulo, `select sucursales_ciudad_costeo('guadalajara', null) r`),
    ).toBeNull();
    expect(await uno<Costeo>(sinModulo, `select sucursales_ciudad_costeo('guadalajara', null) r`)).toBeNull();
    const r = await uno<Costeo>(conCosteo, `select sucursales_ciudad_costeo('guadalajara', null) r`);
    expect(r?.sucursales.map((x) => x.company_id)).toEqual([513]);
    expect(r?.meses).toEqual(['2026-10-01']);
    // El módulo sucursales_costeo también da el permiso, sin rol de Costeo.
    await darModulo(db, soloModulo, 'sucursales_costeo', 'lectura');
    const r2 = await uno<Costeo>(
      soloModulo,
      `select sucursales_ciudad_costeo('guadalajara', '2026-10-01') r`,
    );
    expect(r2?.sucursales.map((x) => x.company_id)).toEqual([513]);
  });
});
