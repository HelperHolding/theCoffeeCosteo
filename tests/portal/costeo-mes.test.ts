import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { calcularMes } from '../../lib/sucursales/consumo-mes-servidor';
import { claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { claveCosto, costear, type DatosCosteo } from '../../lib/sucursales/costeo';
import {
  armarCosteoCiudad,
  costeoMesSucursal,
  type CosteoCiudadRpc,
  type FilaCosteoMes,
} from '../../lib/sucursales/costeo-mes';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import type { Origen, PedidoNormal } from '../../lib/sucursales/normalizar';

/** Costeo por mes cerrado (docs/sucursales/19): mismo costear() que la sección Costeo, por origen, sumado por ciudad. */
const BROWNIE = 'b0000000-0000-4000-8000-000000000001';
const costeo: DatosCosteo = {
  leidoEn: '2026-11-27T12:00:00.000Z',
  iva: 0.16,
  enlaces: new Map([['BRO', { recetaId: BROWNIE, receta: 'Brownie' }]]),
  costos: new Map([[claveCosto(BROWNIE, 'Único'), { costoCent: 3000, usaInactivo: false }]]),
  unicas: new Set([BROWNIE]),
};
const consumo: DatosConsumo = {
  leidoEn: '2026-11-27T12:00:00.000Z',
  enlaces: new Map([['BRO', { recetaId: BROWNIE, receta: 'Brownie' }]]),
  unicas: new Set([BROWNIE]),
  recetas: new Map([[claveConsumo(BROWNIE, 'Único'), []]]),
};
let id = 1;
const p = (origen: Origen, importeCent = 5800, codigo = 'BRO'): PedidoNormal => ({
  id: id++,
  fecha: '2026-10-05',
  segundo: 36000,
  hora: '10:00:00',
  origen,
  ventaCent: importeCent,
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'EMV',
  lineas: [
    { codigo, nombre: codigo === 'BRO' ? 'Brownie' : 'Galleta', importeCent, descuentoPct: 0, customs: [] },
  ],
  numeroPedidoRappi: null,
  cuadra: true,
});
const lectura = (pedidos: PedidoNormal[], estado: LecturaNormal['estado'] = 'completa'): LecturaNormal => ({
  desde: '2026-10-01',
  hasta: '2026-10-31',
  leidoEn: 0,
  estado,
  error: null,
  avisos: [],
  totalDeclarado: null,
  pedidos,
});

describe('costeo de un mes de una sucursal', () => {
  it('«todos» es el costear() de la sección; cada origen con sus pedidos; los productos llevan su costeo', () => {
    const ps = [p('mostrador'), p('mostrador'), p('rappi', 7000), p('app', 4000, 'GAL')];
    const f = costeoMesSucursal({ mes: '2026-10-01', companyId: 513, lectura: lectura(ps), datos: costeo });
    expect(f.resumen.todos).toEqual(costear(ps, costeo).resumen);
    // Brownie a $58 con IVA: venta sin IVA 5000 ¢, costo 3000 ¢, margen 2000 ¢ (40 %).
    expect(f.resumen.mostrador?.completo).toMatchObject({
      lineas: 2,
      ventaSinIvaCent: 10000,
      costoCent: 6000,
    });
    expect(f.resumen.mostrador?.completo.margenPct).toBeCloseTo(0.4);
    expect(f.resumen.rappi?.completo.lineas).toBe(1);
    // La galleta no tiene receta: cuenta en la venta del app, no en el costeo.
    expect(f.resumen.app?.completo.lineas).toBe(0);
    expect(f.resumen.app?.cobertura.totalCent).toBe(4000);
    expect(f.productos.find((x) => x.codigo === 'BRO')?.costeo?.completo.lineas).toBe(3);
    expect(f.productos.find((x) => x.codigo === 'GAL')?.costeo).toBeNull();
    expect(f).toMatchObject({ completa: true, costosLeidosEn: costeo.leidoEn });
  });

  it('el recorrido del mes guarda el costeo con la misma lectura del consumo, solo si se pide', async () => {
    const consumos: unknown[] = [];
    const costeos: FilaCosteoMes[] = [];
    const deps = {
      leer: async () => lectura([p('mostrador')]),
      rappi: () => undefined,
      guardar: async (f: unknown) => (consumos.push(f), 0),
    };
    await calcularMes({ mes: '2026-10-01', sucursales: [configDe(513)!], datos: consumo, deps });
    expect(consumos).toHaveLength(1);
    await calcularMes({
      mes: '2026-10-01',
      sucursales: [configDe(513)!, configDe(514)!],
      datos: consumo,
      costeo,
      deps: { ...deps, guardarCosteo: async (f) => void costeos.push(f) },
    });
    expect(costeos.map((f) => f.companyId)).toEqual([513, 514]);
    expect(consumos).toHaveLength(3);
  });
});

describe('costeo de la ciudad', () => {
  const fila = (companyId: number, ps: PedidoNormal[]) => {
    const f = costeoMesSucursal({ mes: '2026-10-01', companyId, lectura: lectura(ps), datos: costeo });
    return {
      company_id: companyId,
      calculado_en: '2026-11-27T13:00:00Z',
      costos_leidos_en: f.costosLeidosEn,
      completa: f.completa,
      resumen: f.resumen,
      productos: f.productos,
    };
  };
  const rpc: CosteoCiudadRpc = {
    mes: '2026-10-01',
    meses: ['2026-10-01'],
    // 513 vende Brownie a $58 (40 %); 514 lo vende a $69.60 (50 %). 545 no es de la ciudad: no entra.
    sucursales: [fila(513, [p('mostrador')]), fila(514, [p('mostrador', 6960)]), fila(545, [p('mostrador')])],
  };
  const suc = [
    { companyId: 513, nombre: 'Namóra' },
    { companyId: 514, nombre: 'Essentia' },
    { companyId: 515, nombre: 'Chapu 67' },
  ];

  it('suma las sucursales de la ciudad, las ordena por margen y avisa las que no tienen ese mes', () => {
    const r = armarCosteoCiudad(rpc, suc, 'todos');
    expect(r.sucursales.map((s) => [s.nombre, Math.round((s.completo.margenPct ?? 0) * 100)])).toEqual([
      ['Essentia', 50],
      ['Namóra', 40],
    ]);
    expect(r.totales.completo).toMatchObject({ ventaSinIvaCent: 11000, costoCent: 6000, margenCent: 5000 });
    expect(r.totales.completo.margenPct).toBeCloseTo(5000 / 11000);
    expect(r.sinCalcular).toEqual(['Chapu 67']);
    expect(r.productos).toEqual([
      expect.objectContaining({ nombre: 'Brownie', sucursales: 2, lineas: 2, importeCent: 5800 + 6960 }),
    ]);
  });

  it('un origen sin pedidos en una sucursal no la cuenta', () => {
    expect(armarCosteoCiudad(rpc, suc, 'rappi').sucursales).toEqual([]);
  });
});
