import 'server-only';
import type { ConfigSucursal } from '../sucursales/config';
import { recetasServicio } from '../sucursales/consumo-mes-servidor';
import { catalogoServicio, clienteServicio, rappiServicio } from '../sucursales/corte-servidor';
import { leerDias } from '../sucursales/datos';
import { consumoVentana } from '../comercializadora/ovConsumo';
import type { Db } from './servidor';
import {
  compararMermas,
  toleranciasVigentes,
  vigentesMerma,
  type FilaMerma,
  type InsumoCosteo,
} from './mermas';
import type { FranqInsumo, FranqMerma, FranqMermasCierre } from './tipos';

export interface MermasDia {
  dia: string;
  insumos: FranqInsumo[];
  /** Registros vigentes del día (sin costos): los ve toda la sucursal. */
  registros: FranqMerma[];
  cierre: FranqMermasCierre | null;
  /** Solo gestores: comparación contra el consumo teórico, tolerancia y valor a costo. */
  filas: FilaMerma[] | null;
  /** Aviso cuando el consumo teórico no se pudo calcular o la lectura de ventas quedó incompleta. */
  aviso: string | null;
}

/**
 * Mermas de un día. Las tablas del módulo se leen con la sesión del usuario (RLS). Para la gerencia, el consumo teórico
 * del día sale del MISMO motor que Sucursales y la OV sugerida (consumoVentana: ventas del POS + Rappi del portal ×
 * recetas) y el costo de Costeo se lee con la llave de servicio, SOLO después de que la página exigió rol de gestor.
 */
export async function leerMermasDia(
  db: Db,
  cfg: ConfigSucursal,
  dia: string,
  gestor: boolean,
): Promise<MermasDia | null> {
  const [insumos, mermas, cierre, tolerancias] = await Promise.all([
    db.from('franq_insumos').select('*').eq('company_id', cfg.companyId),
    db.from('franq_mermas').select('*').eq('company_id', cfg.companyId).eq('dia', dia).order('id'),
    db.from('franq_mermas_cierre').select('*').eq('company_id', cfg.companyId).eq('dia', dia).maybeSingle(),
    gestor
      ? db.from('franq_merma_tolerancias').select('*').eq('company_id', cfg.companyId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (insumos.error || mermas.error || cierre.error || tolerancias.error) return null;
  const base = {
    dia,
    insumos: insumos.data ?? [],
    registros: vigentesMerma(mermas.data ?? []),
    cierre: cierre.data ?? null,
  };
  if (!gestor) return { ...base, filas: null, aviso: null };

  let consumo: Map<string, number> | null = null;
  const costeo = new Map<string, InsumoCosteo>();
  let aviso: string | null = null;
  const servicio = clienteServicio();
  const deCosteo = [...new Set(base.insumos.map((i) => i.insumo_id).filter((x): x is string => !!x))];
  if (!servicio) aviso = 'No se pudo calcular el consumo teórico (falta la llave de servicio).';
  else {
    const [datos, catalogo, c] = await Promise.all([
      recetasServicio(servicio),
      catalogoServicio(servicio).catch(() => undefined),
      deCosteo.length
        ? servicio.from('insumos').select('id,presentacion,costo_unitario').in('id', deCosteo)
        : Promise.resolve({ data: [], error: null }),
    ]);
    for (const x of (c.data ?? []) as { id: string; presentacion: number; costo_unitario: number | null }[])
      costeo.set(x.id, {
        presentacion: Number(x.presentacion) || 1,
        costoUnitario: x.costo_unitario === null ? null : Number(x.costo_unitario),
      });
    if (!datos) aviso = 'No se pudieron leer las recetas para el consumo teórico.';
    else {
      const r = await consumoVentana({
        cfg,
        desde: dia,
        hasta: dia,
        datos,
        catalogo,
        deps: { leer: leerDias, rappi: (x) => rappiServicio(servicio, x) },
      });
      if (!r.ok) aviso = `No se pudo calcular el consumo teórico: ${r.motivo}`;
      else {
        consumo = new Map(r.insumos.map((i) => [i.insumoId, i.cantidad]));
        if (!r.completa)
          aviso = 'Las ventas del día llegaron incompletas: el consumo teórico puede quedar corto.';
      }
    }
  }
  return {
    ...base,
    filas: compararMermas({
      insumos: base.insumos,
      mermas: mermas.data ?? [],
      tolerancias: toleranciasVigentes(tolerancias.data ?? []),
      consumo,
      costeo,
    }),
    aviso,
  };
}
