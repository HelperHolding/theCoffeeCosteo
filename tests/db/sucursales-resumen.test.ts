import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';
import { configDe } from '../../lib/sucursales/config';
import type { Origen, PedidoNormal } from '../../lib/sucursales/normalizar';
import {
  armarHoy,
  armarPeriodo,
  filtrar,
  resumirDia,
  type FilaResumen,
  type RpcHoy,
  type RpcPeriodo,
} from '../../lib/sucursales/resumen';

// Migración 37: el corte guarda totales por sucursal y día; el tablero los lee con el acceso de cada usuario.
let db: PGlite;
let gdl: string;
let ajeno: string;
let id = 1;
const pedido = (
  fecha: string,
  hhmm: string,
  ventaCent: number,
  origen: Origen,
  codigo = '5IL',
): PedidoNormal => {
  const [h, m] = hhmm.split(':').map(Number);
  return {
    id: id++,
    fecha,
    segundo: h * 3600 + m * 60,
    hora: `${hhmm}:00`,
    origen,
    ventaCent,
    netoCent: null,
    descuentoCent: 0,
    metodo: origen === 'rappi' ? 'RAPPI' : 'CARTAO',
    tipo: 'EMV',
    lineas: [
      {
        codigo,
        nombre: codigo === '5IL' ? 'Iced Latte' : 'Americano',
        importeCent: ventaCent,
        descuentoPct: 0,
        customs: [],
      },
    ],
    numeroPedidoRappi: null,
    cuadra: true,
  };
};
const fila = (companyId: number, fecha: string, corte: number, pedidos: PedidoNormal[], completa = true) =>
  resumirDia({
    companyId,
    fecha,
    leidoEn: new Date('2026-11-03T16:40:00Z'),
    corteSegundo: corte,
    completa,
    pedidos,
  });
const guardar = async (filas: FilaResumen[]) => {
  await db.exec('set role service_role');
  try {
    for (const f of filas)
      await db.query(
        `insert into sucursales_resumen_dia (company_id, fecha, leido_en, corte_segundo, completa, origenes, horas, tramos, productos)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         on conflict (company_id, fecha) do update set origenes = excluded.origenes, tramos = excluded.tramos`,
        [
          f.company_id,
          f.fecha,
          f.leido_en,
          f.corte_segundo,
          f.completa,
          JSON.stringify(f.origenes),
          JSON.stringify(f.horas),
          JSON.stringify(f.tramos),
          JSON.stringify(f.productos),
        ],
      );
    await db.query(
      `insert into sucursales_cortes (inicio, fechas, sucursales, completas) values (now(), 'hoy', 2, 2)`,
    );
  } finally {
    await db.exec('reset role');
  }
};
const hoyRpc = (u: string, companias: number[], hoys: string[]) =>
  comoUsuario(
    db,
    u,
    async () =>
      (await db.query<{ r: RpcHoy }>('select public.sucursales_tablero_hoy($1, $2) r', [companias, hoys]))
        .rows[0].r,
  );
const periodoRpc = (u: string, companias: number[], desde: string, hasta: string) =>
  comoUsuario(
    db,
    u,
    async () =>
      (
        await db.query<{ r: RpcPeriodo }>('select public.sucursales_tablero_periodo($1, $2, $3) r', [
          companias,
          desde,
          hasta,
        ])
      ).rows[0].r,
  );

beforeAll(async () => {
  db = await crearDbLocal();
  gdl = await crearUsuario(db, 'sucursales');
  ajeno = await crearUsuario(db, 'sucursales');
  for (const u of [gdl, ajeno])
    await db.query(
      `insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`,
      [u],
    );
  await db.query(
    'insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($1, 384), ($2, 532)',
    [gdl, ajeno],
  );
  // Hoy (martes 3-nov) cortado a las 10:35 en Namóra; la semana pasada (martes 27-oct) completa.
  await guardar([
    fila(513, '2026-11-03', 10 * 3600 + 35 * 60, [
      pedido('2026-11-03', '08:00', 10_000, 'mostrador'),
      pedido('2026-11-03', '09:15', 4_000, 'app'),
      pedido('2026-11-03', '10:32', 5_000, 'mostrador'), // tramo en curso: no entra a la comparación
      pedido('2026-11-03', '10:05', 7_000, 'rappi', '2AM'),
    ]),
    fila(513, '2026-10-27', 86400, [
      pedido('2026-10-27', '09:00', 8_000, 'mostrador'),
      pedido('2026-10-27', '10:31', 4_000, 'mostrador'),
      pedido('2026-10-27', '12:00', 20_000, 'rappi', '2AM'),
    ]),
    fila(384, '2026-11-03', 10 * 3600 + 35 * 60, [pedido('2026-11-03', '07:30', 3_000, 'mostrador')], false),
    fila(532, '2026-11-03', 10 * 3600 + 35 * 60, [pedido('2026-11-03', '07:30', 99_000, 'mostrador')]),
    // Semana del lunes 26-oct: dos días de 513 y uno de 384.
    fila(513, '2026-10-26', 86400, [pedido('2026-10-26', '09:00', 1_000, 'mostrador')]),
    fila(384, '2026-10-28', 86400, [pedido('2026-10-28', '09:00', 2_000, 'app', '2AM')]),
    fila(513, '2026-11-02', 86400, [pedido('2026-11-02', '09:00', 6_000, 'rappi')]),
  ]);
});
afterAll(async () => db.close());

describe('migración 37: resumen para el Tablero de México', () => {
  it('las tablas no se leen desde el portal; las RPC solo dan las sucursales del usuario', async () => {
    await expect(
      comoUsuario(db, gdl, () => db.query('select * from sucursales_resumen_dia')),
    ).rejects.toThrow(/permission denied/);
    const r = await hoyRpc(gdl, [513, 384, 532], ['2026-11-03', '2026-11-03', '2026-11-03']);
    expect([...new Set(r.dias.map((d) => d.company_id))].sort()).toEqual([384, 513]);
    const p = await periodoRpc(ajeno, [513, 384, 532], '2026-10-26', '2026-11-02');
    expect(p.semanas.every((s) => s.company_id === 532)).toBe(true);
    await expect(periodoRpc(gdl, [513], '2026-01-01', '2026-11-02')).rejects.toThrow(/Periodo inválido/);
  });

  it('hoy contra la semana pasada hasta el mismo tramo de 10 min, sin estimar lo que falta', async () => {
    const t = armarHoy(await hoyRpc(gdl, [513, 384], ['2026-11-03', '2026-11-03']), [
      configDe(513)!,
      configDe(384)!,
    ]);
    expect(t.ultimoCorte).not.toBeNull();
    const n = t.sucursales.find((s) => s.companyId === 513)!;
    // Hoy completo hasta el corte: 10,000 + 4,000 + 5,000 + 7,000.
    expect(filtrar(n.hoy, 'todos').venta_cent).toBe(26_000);
    // Comparación al inicio del tramo en curso (10:30): hoy sin el pedido de 10:32; la semana pasada sin 10:31 y 12:00.
    expect(n.comparadoA).toBe(10 * 3600 + 30 * 60);
    expect(filtrar(n.comparable!.hoy, 'todos').venta_cent).toBe(21_000);
    expect(filtrar(n.comparable!.base, 'todos').venta_cent).toBe(8_000);
    expect(filtrar(n.comparable!.hoy, 'rappi').venta_cent).toBe(7_000);
    // 384 no tiene la semana pasada: no se compara (no es cero).
    const v = t.sucursales.find((s) => s.companyId === 384)!;
    expect(v.comparable).toBeNull();
    expect(v.completa).toBe(false);
    expect(t.curva.hastaTramo).toBe(63);
  });

  it('periodo: semanas de lunes, días y productos sumados entre sucursales, por origen', async () => {
    const p = armarPeriodo(
      await periodoRpc(gdl, [513, 384], '2026-10-26', '2026-11-02'),
      '2026-10-26',
      '2026-11-02',
      [configDe(513)!, configDe(384)!],
    );
    expect(p.diasLeidos).toBe(4);
    // El lunes 2-nov ya es otra semana.
    expect(p.semanas.map((s) => [s.semana, filtrar(s.cifras, 'todos').venta_cent])).toEqual([
      ['2026-10-26', 1_000 + 12_000 + 20_000 + 2_000],
      ['2026-11-02', 6_000],
    ]);
    expect(filtrar(p.semanas[0].cifras, 'rappi').venta_cent).toBe(20_000);
    expect(p.dias.map((d) => d.fecha)).toEqual(['2026-10-26', '2026-10-27', '2026-10-28', '2026-11-02']);
    expect(p.sucursales.map((s) => [s.companyId, filtrar(s.cifras, 'todos').pedidos])).toEqual([
      [513, 5],
      [384, 1],
    ]);
    const am = p.productos.find((x) => x.codigo === '2AM')!;
    expect(am.sucursales).toBe(2);
    expect(am.por).toEqual({ rappi: [1, 20_000], app: [1, 2_000] });
  });
});
