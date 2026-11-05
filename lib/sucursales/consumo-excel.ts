import type { FilaInsumo } from './consumo-nacional';
import type { ConsumoNacional, DesgloseConsumo } from './contratos';
import type { FiltroOrigen } from './metricas';

/** Hojas del Excel de consumo nacional (docs/sucursales/17): el mes y el origen que se ven en pantalla. */
export function hojasConsumo(a: {
  datos: ConsumoNacional;
  origen: FiltroOrigen;
  filas: FilaInsumo[];
  desglose: DesgloseConsumo['filas'];
}) {
  const insumo = new Map(a.datos.insumos.map((i) => [i.insumoId, i]));
  const sucursal = new Map(a.datos.sucursales.map((s) => [s.companyId, s]));
  const suma = new Map<string, number>();
  for (const x of a.desglose)
    if (a.origen === 'todos' || x.origen === a.origen) {
      const k = `${x.companyId}|${x.insumoId}`;
      suma.set(k, (suma.get(k) ?? 0) + x.cantidad);
    }
  return {
    nombreArchivo: `consumo-nacional-${a.datos.mes!.slice(0, 7)}-${a.origen}.xlsx`,
    resumen: a.filas.map((f) => ({
      Categoría: f.categoria,
      Ingrediente: f.insumo,
      Unidad: f.unidad,
      Consumo: f.cantidad,
      Presentación: f.presentacion ?? '',
      Presentaciones: f.presentaciones ?? '',
      // Porcentaje con un decimal (25 = +25 %), no la fracción.
      'Vs mes anterior (%)': f.cambio === null ? '' : Math.round(f.cambio * 1000) / 10,
    })),
    porSucursal: [...suma]
      .filter(([, c]) => c > 0)
      .map(([k, c]) => {
        const [companyId, insumoId] = k.split('|');
        const s = sucursal.get(Number(companyId));
        const i = insumo.get(insumoId);
        return {
          Sucursal: s?.nombre ?? companyId,
          Ciudad: s?.ciudad ?? '',
          Categoría: i?.categoria ?? '',
          Ingrediente: i?.insumo ?? insumoId,
          Unidad: i?.unidad ?? '',
          Consumo: c,
        };
      })
      .sort((x, y) => String(x.Sucursal).localeCompare(String(y.Sucursal), 'es') || String(x.Ingrediente).localeCompare(String(y.Ingrediente), 'es')),
  };
}
