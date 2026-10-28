import 'server-only';
import type { servidor } from '../supabase/servidor';
import { claveConsumo, type DatosConsumo, type InsumoReceta } from './consumo';

type Db = Awaited<ReturnType<typeof servidor>>;

interface ConsumoRpc {
  enlaces: { codigo: string; receta_id: string; receta: string }[];
  unicas: string[];
  insumos: {
    receta_id: string;
    tamano: string;
    insumo_id: string;
    insumo: string;
    unidad: string;
    categoria: string | null;
    cantidad: number | string;
  }[];
  /** Desde la migración 27. */
  lineas?: { receta_id: string; tamano: string; insumo: string; cantidad: number | string }[];
  /** Desde la migración 27. */
  sustitutos?: { insumo_id: string; insumo: string; unidad: string; categoria: string | null }[];
}

/**
 * Recetas (solo cantidades) para el consumo teórico de una sucursal, por la RPC de la migración 24 (27: líneas
 * directas y sustitutos para los ajustes): la base exige que el usuario vea esa sucursal. Sin la RPC, sin permiso o
 * ante cualquier error: null (la sección dice «no disponible»).
 */
export async function leerDatosConsumo(
  db: Db,
  companyId: number,
  ahora = () => new Date(),
): Promise<DatosConsumo | null> {
  try {
    const r = await db.rpc('sucursales_recetas_consumo', { p_company: companyId });
    if (r.error || !r.data) return null;
    const d = r.data as unknown as ConsumoRpc;
    const recetas = new Map<string, InsumoReceta[]>();
    for (const i of d.insumos) {
      const k = claveConsumo(i.receta_id, i.tamano);
      const lista = recetas.get(k) ?? [];
      lista.push({
        insumoId: i.insumo_id,
        insumo: i.insumo,
        unidad: i.unidad,
        categoria: i.categoria ?? 'Sin categoría',
        cantidad: Number(i.cantidad),
      });
      recetas.set(k, lista);
    }
    const lineas = new Map<string, { insumo: string; cantidad: number }[]>();
    for (const l of d.lineas ?? []) {
      const k = claveConsumo(l.receta_id, l.tamano);
      lineas.set(k, [...(lineas.get(k) ?? []), { insumo: l.insumo, cantidad: Number(l.cantidad) }]);
    }
    return {
      leidoEn: ahora().toISOString(),
      enlaces: new Map(d.enlaces.map((e) => [e.codigo, { recetaId: e.receta_id, receta: e.receta }])),
      unicas: new Set(d.unicas),
      recetas,
      ...(d.lineas ? { lineas } : {}),
      ...(d.sustitutos
        ? {
            sustitutos: new Map(
              d.sustitutos.map((s) => [
                s.insumo,
                {
                  insumoId: s.insumo_id,
                  insumo: s.insumo,
                  unidad: s.unidad,
                  categoria: s.categoria ?? 'Sin categoría',
                },
              ]),
            ),
          }
        : {}),
    };
  } catch {
    return null;
  }
}
