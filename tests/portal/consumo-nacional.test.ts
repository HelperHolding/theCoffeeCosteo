import { describe, expect, it } from 'vitest';
import { configDe } from '../../lib/sucursales/config';
import {
  armarConsumoNacional,
  armarDesglose,
  vistaConsumo,
  type RpcConsumoNacional,
} from '../../lib/sucursales/consumo-nacional';

const rpc: RpcConsumoNacional = {
  meses: ['2026-10-01', '2026-09-01'],
  sucursales: [
    { company_id: 513, calculado_en: 'x', recetas_leidas_en: 'y', completa: true,
      cobertura: { mostrador: { lineas: 100, incluidas: 90, generico: 2, sinCodigo: 3, sinEnlace: 5 }, rappi: { lineas: 20, incluidas: 20, generico: 0, sinCodigo: 0, sinEnlace: 0 } },
      sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 4, sinCodigo: false }] } },
    { company_id: 612, calculado_en: 'x', recetas_leidas_en: 'y', completa: false,
      cobertura: { mostrador: { lineas: 50, incluidas: 40, generico: 0, sinCodigo: 0, sinEnlace: 10 } },
      sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 6, sinCodigo: false }] } },
  ],
  insumos: [
    { insumo_id: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, origen: 'mostrador', cantidad: 300000, sucursales: 2 },
    { insumo_id: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, origen: 'rappi', cantidad: 12500, sucursales: 1 },
    { insumo_id: 'cf', insumo: 'CAFÉ BLACK', unidad: 'gr', categoria: 'INGREDIENTES', presentacion: 1500, origen: 'mostrador', cantidad: 45000, sucursales: 2 },
    { insumo_id: 'vj', insumo: 'INSUMO VIEJO', unidad: 'pza', categoria: 'INSUMOS', presentacion: null, origen: 'app', cantidad: 5, sucursales: 1 },
  ],
  anterior: [{ insumo_id: 'le', origen: 'mostrador', cantidad: 250000 }],
  sucursales_anterior: 1,
};
const d = armarConsumoNacional(rpc, '2026-10-01', [configDe(513)!, configDe(612)!], '2026-11-05T00:00:00Z');

describe('consumo nacional', () => {
  it('agrupa por insumo con sus orígenes y nombre/ciudad de cada sucursal', () => {
    expect(d.insumos.find((i) => i.insumoId === 'le')!.porOrigen).toEqual({ mostrador: 300000, rappi: 12500 });
    expect(d.sucursales.map((s) => [s.nombre, s.ciudad])).toEqual([
      ['Namóra', 'Guadalajara'],
      ['Cd. Juárez', 'Ciudad Juárez'],
    ]);
  });

  it('vista Todos: categorías, presentaciones, cobertura y cambio contra el mes anterior', () => {
    const v = vistaConsumo(d, 'todos');
    expect(v.categorias.map((c) => c.categoria)).toEqual(['INGREDIENTES', 'INSUMOS', 'PERECEDEROS']);
    const le = v.categorias.find((c) => c.categoria === 'PERECEDEROS')!.filas[0];
    expect(le.cantidad).toBe(312500);
    expect(le.presentaciones).toBeCloseTo(312.5);
    // Anterior solo mostrador (250,000): cambio de 312,500 contra 250,000.
    expect(le.cambio).toBeCloseTo(0.25);
    const viejo = v.categorias.find((c) => c.categoria === 'INSUMOS')!.filas[0];
    expect(viejo.presentaciones).toBeNull();
    expect(v.cobertura).toBeCloseTo((90 + 20 + 40) / (100 + 20 + 50));
    expect(v.incompletas).toBe(1);
    expect(v.sinReceta).toEqual([{ nombre: 'Sandwich', unidades: 10, sucursales: 2, sinCodigo: false }]);
  });

  it('filtro de origen: Rappi solo suma Rappi y oculta insumos sin consumo', () => {
    const v = vistaConsumo(d, 'rappi');
    expect(v.categorias.flatMap((c) => c.filas.map((f) => [f.insumoId, f.cantidad]))).toEqual([['le', 12500]]);
    expect(v.cobertura).toBe(1);
    expect(v.sinReceta).toEqual([]);
  });

  it('sin mes anterior calculado no hay cambio (no es cero)', () => {
    const sin = armarConsumoNacional({ ...rpc, anterior: [], sucursales_anterior: 0 }, '2026-10-01', [configDe(513)!], 'x');
    expect(vistaConsumo(sin, 'todos').categorias.flatMap((c) => c.filas).every((f) => f.cambio === null)).toBe(true);
  });

  it('desglose de un insumo por ciudad y sucursal con su parte', () => {
    const r = armarDesglose(
      [
        { companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 200000 },
        { companyId: 513, insumoId: 'le', origen: 'rappi', cantidad: 12500 },
        { companyId: 612, insumoId: 'le', origen: 'mostrador', cantidad: 100000 },
      ],
      'le',
      'todos',
      d.sucursales,
    );
    expect(r.sucursales.map((s) => [s.nombre, s.cantidad])).toEqual([
      ['Namóra', 212500],
      ['Cd. Juárez', 100000],
    ]);
    expect(r.ciudades[0]).toEqual({ ciudad: 'Guadalajara', cantidad: 212500, parte: 212500 / 312500 });
  });
});
