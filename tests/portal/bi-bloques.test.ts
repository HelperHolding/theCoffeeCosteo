import { describe, expect, it } from 'vitest';
import {
  avisos, cociente, conShare, kpiTiendas, numerosClave, pagoPorTienda, promociones, rankingPorMes, tendenciaAnual,
  tendenciaSemanal,
} from '@/lib/bi/bloques';
import type { RpcOpciones, RpcTablero, TiendaBi } from '@/lib/bi/tipos';

const vacio: RpcTablero = {
  cargas: { esperados: 0, con_carga: 0, incompletos: 0 },
  kpis: { venta_cent: 0, venta_bruta_cent: 0, tickets: 0, lineas: 0, unidades: 0 },
  por_grupo: [], por_cafe: [], por_master: [], por_fecha: [], por_dia: [], por_hora: [], por_pago: [],
  por_pago_tienda: [], por_tienda_dia: [], promociones: [], ranking: [], fuentes: [],
};
const tiendas: TiendaBi[] = [
  { company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' },
  { company_id: 612, store_id: 498, nombre: 'Juárez', franquiciatario: 'Chihuahua', tipo: 'Franquicia' },
];
const t: RpcTablero = {
  ...vacio,
  cargas: { esperados: 10, con_carga: 8, incompletos: 1 },
  kpis: { venta_cent: 30000, venta_bruta_cent: 31000, tickets: 4, lineas: 6, unidades: 7 },
  por_grupo: [{ grupo: 'Bebida', venta_cent: 20000 }, { grupo: 'Comida', venta_cent: 10000 }],
  por_tienda_dia: [
    { company_id: 384, dow: 1, venta_cent: 15000, tickets: 2 },
    { company_id: 384, dow: 2, venta_cent: 5000, tickets: 1 },
    { company_id: 612, dow: 1, venta_cent: 10000, tickets: 1 },
  ],
  promociones: [
    { company_id: 384, promocion: 'Promoción café', unidades: 1, venta_cent: 400 },
    { company_id: 384, promocion: 'Producto regular', unidades: 4, venta_cent: 19600 },
    { company_id: 612, promocion: 'Promoción alimentos y bebidas', unidades: 2, venta_cent: 1000 },
    { company_id: 612, promocion: 'Producto regular', unidades: 1, venta_cent: 9000 },
  ],
  por_pago_tienda: [
    { etiqueta: 'TABLET - CARD', company_id: 384, venta_cent: 15000 },
    { etiqueta: 'APP - WALLET', company_id: 384, venta_cent: 5000 },
  ],
  ranking: [
    { codigo: 'B', nombre: 'Brownie', mes: '2026-10-01', unidades: 1, venta_cent: 1000, lineas: 1 },
    { codigo: 'A', nombre: 'Latte', mes: '2026-10-01', unidades: 3, venta_cent: 3000, lineas: 3 },
    { codigo: 'A', nombre: 'Latte', mes: '2026-11-01', unidades: 1, venta_cent: 500, lineas: 1 },
  ],
};

describe('bloques', () => {
  it('cociente: nunca NaN ni Infinity', () => {
    expect(cociente(10, 0)).toBeNull();
    expect(cociente(0, 0)).toBeNull();
    expect(cociente(10, 4)).toBe(2.5);
  });

  it('números clave: ticket promedio y UPT como cociente de sumas', () => {
    expect(numerosClave(t)).toEqual({
      ventaCent: 30000, cobradoCent: 31000, tickets: 4, ticketPromedioCent: 7500, upt: 1.5, unidades: 7,
    });
    expect(numerosClave(vacio)).toMatchObject({ ticketPromedioCent: null, upt: null });
  });

  it('shares sobre la suma de las filas', () => {
    expect(conShare(t.por_grupo).map((x) => x.share)).toEqual([2 / 3, 1 / 3]);
    expect(conShare([])).toEqual([]);
    expect(conShare([{ venta_cent: 0 }])[0].share).toBeNull();
  });

  it('KPI por tienda: agrupa por tipo y suma los días', () => {
    const k = kpiTiendas(t, tiendas);
    expect(k.map((g) => g.tipo)).toEqual(['Sucursales Propias', 'Franquicia']);
    expect(k[0].tiendas[0]).toEqual({ companyId: 384, nombre: 'Ventura', ventaCent: 20000, tickets: 3,
      ticketPromedioCent: 20000 / 3, share: 20000 / 30000 });
    expect(k[1].ventaCent).toBe(10000);
  });

  it('una tienda sin nombre en opciones se muestra con su número', () => {
    const k = kpiTiendas({ ...t, por_tienda_dia: [{ company_id: 999, dow: 1, venta_cent: 1, tickets: 1 }] }, tiendas);
    expect(k[0]).toMatchObject({ tipo: 'Sin tipo', tiendas: [{ companyId: 999, nombre: 'Tienda 999' }] });
  });

  it('promociones contra 6 % y 1 %', () => {
    const p = promociones(t, tiendas);
    expect(p.red).toEqual([
      { promocion: 'Promoción alimentos y bebidas', share: 1000 / 30000, meta: 0.06, unidades: 2 },
      { promocion: 'Promoción café', share: 400 / 30000, meta: 0.01, unidades: 1 },
    ]);
    expect(p.porTienda.find((x) => x.companyId === 384)!.promos['Promoción café']).toEqual({ share: 400 / 20000, unidades: 1 });
  });

  it('ranking por mes con share dentro del mes', () => {
    const r = rankingPorMes(t);
    expect(r.map((m) => m.mes)).toEqual(['2026-11-01', '2026-10-01']); // el más reciente primero
    expect(r[1].productos.map((p) => [p.nombre, p.share])).toEqual([['Latte', 0.75], ['Brownie', 0.25]]);
  });

  it('pago por tienda', () => {
    expect(pagoPorTienda(t, tiendas)[0]).toEqual({ companyId: 384, nombre: 'Ventura', ventaCent: 20000, pagos: [
      { etiqueta: 'TABLET - CARD', ventaCent: 15000, share: 0.75 }, { etiqueta: 'APP - WALLET', ventaCent: 5000, share: 0.25 }] });
  });

  it('tendencias: 12 meses y 53 semanas con null donde no hay venta', () => {
    const r = { por_mes: [{ anio: 2025, mes: 3, venta_cent: 10 }], por_semana: [{ anio: 2026, semana: 53, venta_cent: 5 }] };
    expect(tendenciaAnual(r)).toEqual([{ anio: 2025, meses: [null, null, 10, null, null, null, null, null, null, null, null, null] }]);
    expect(tendenciaSemanal(r)[0].semanas[52]).toBe(5);
    expect(tendenciaSemanal(r)[0].semanas).toHaveLength(53);
  });

  it('avisos de frescura y Rappi', () => {
    const o = { tiendas_sin_rappi: 2, ultimo_corte: '2026-11-05T15:10:00Z' } as RpcOpciones;
    expect(avisos(t, o)).toEqual({ faltantes: 2, esperados: 10, incompletos: 1, rappiPendiente: true,
      ultimoCorte: '2026-11-05T15:10:00Z' });
  });
});
