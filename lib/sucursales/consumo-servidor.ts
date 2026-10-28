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
}

/**
 * Recetas (solo cantidades) para el consumo teórico de una sucursal, por la RPC de la migración 24: la base exige que
 * el usuario vea esa sucursal. Sin la RPC, sin permiso o ante cualquier error: null (la sección dice «no disponible»).
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
    return {
      leidoEn: ahora().toISOString(),
      enlaces: new Map(d.enlaces.map((e) => [e.codigo, { recetaId: e.receta_id, receta: e.receta }])),
      unicas: new Set(d.unicas),
      recetas,
    };
  } catch {
    return null;
  }
}
