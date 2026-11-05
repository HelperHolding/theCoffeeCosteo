import { describe, expect, it } from 'vitest';
import { hojasConsumo } from '../../lib/sucursales/consumo-excel';
import type { ConsumoNacional } from '../../lib/sucursales/contratos';

const datos = {
  generadoEn: 'x', mes: '2026-10-01', meses: ['2026-10-01'], sucursalesAnterior: 0, sucursalesEsperadas: 1,
  sucursales: [{ companyId: 513, nombre: 'Namóra', ciudad: 'Guadalajara', completa: true, calculadoEn: 'x', recetasLeidasEn: 'y', cobertura: {}, sinReceta: {} }],
  insumos: [{ insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, porOrigen: { mostrador: 3000, rappi: 500 }, anterior: {}, actualComun: {} }],
} satisfies ConsumoNacional;

describe('exportar consumo', () => {
  it('hoja de consumo y hoja por sucursal con el filtro de origen', () => {
    const h = hojasConsumo({
      datos,
      origen: 'rappi',
      filas: [{ insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', cantidad: 500, presentaciones: 0.5, presentacion: 1000, cambio: null }],
      desglose: [
        { companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 3000 },
        { companyId: 513, insumoId: 'le', origen: 'rappi', cantidad: 500 },
      ],
    });
    expect(h.nombreArchivo).toBe('consumo-nacional-2026-10-rappi.xlsx');
    expect(h.resumen).toEqual([
      { Categoría: 'PERECEDEROS', Ingrediente: 'LECHE ENTERA', Unidad: 'ml', Consumo: 500, Presentación: 1000, Presentaciones: 0.5, 'Vs mes anterior (%)': '' },
    ]);
    expect(h.porSucursal).toEqual([
      { Sucursal: 'Namóra', Ciudad: 'Guadalajara', Categoría: 'PERECEDEROS', Ingrediente: 'LECHE ENTERA', Unidad: 'ml', Consumo: 500 },
    ]);
  });

  it('Todos suma los orígenes por sucursal e ingrediente y descarta los de cero', () => {
    const h = hojasConsumo({
      datos,
      origen: 'todos',
      filas: [],
      desglose: [
        { companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 3000 },
        { companyId: 513, insumoId: 'le', origen: 'rappi', cantidad: 500 },
        { companyId: 513, insumoId: 'ca', origen: 'app', cantidad: 0 },
      ],
    });
    expect(h.porSucursal.map((x) => [x.Ingrediente, x.Consumo])).toEqual([['LECHE ENTERA', 3500]]);
  });

  it('el cambio sale como porcentaje con un decimal', () => {
    const h = hojasConsumo({
      datos,
      origen: 'todos',
      filas: [
        { insumoId: 'a', insumo: 'A', unidad: 'ml', categoria: 'C', cantidad: 1, presentaciones: null, presentacion: null, cambio: 0.25 },
        { insumoId: 'b', insumo: 'B', unidad: 'ml', categoria: 'C', cantidad: 1, presentaciones: null, presentacion: null, cambio: -0.123456 },
      ],
      desglose: [],
    });
    expect(h.resumen.map((x) => x['Vs mes anterior (%)'])).toEqual([25, -12.3]);
  });
});
