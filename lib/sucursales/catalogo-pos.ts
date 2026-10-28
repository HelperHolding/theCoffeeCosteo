import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { CatalogoNombres } from './metricas';
import { rpcAusente } from './costeo-servidor';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Nombres del POS de nuestros enlaces (producto_codigo_pos.nombre_observado) → código. Por la RPC de la migración 24
 * (igual para todo perfil que ve la sucursal, con o sin rol de Costeo); si aún no existe, bajo RLS como antes.
 * Solo entran los nombres con UN código: un nombre repetido no sirve de evidencia. Ante cualquier error devuelve null y
 * la identidad usa solo las ventas del periodo (comportamiento anterior).
 */
export async function leerCatalogoPos(db: Db, companyId: number): Promise<CatalogoNombres | null> {
  try {
    const rpc = await db.rpc('sucursales_catalogo_pos', { p_company: companyId });
    let filas: { codigo: string; nombre_observado: string | null }[] | null = null;
    if (!rpc.error) filas = Array.isArray(rpc.data) ? (rpc.data as unknown as typeof filas) : null;
    else if (rpcAusente(rpc.error)) {
      const r = await db.from('producto_codigo_pos').select('codigo, nombre_observado');
      filas = !r.error && Array.isArray(r.data) ? r.data : null;
    }
    if (!filas) return null;
    const codigos = new Map<string, Set<string>>();
    for (const e of filas)
      if (e.nombre_observado && e.codigo)
        codigos.set(e.nombre_observado, (codigos.get(e.nombre_observado) ?? new Set<string>()).add(e.codigo));
    return new Map(
      [...codigos].filter(([, cs]) => cs.size === 1).map(([nombre, cs]) => [nombre, [...cs][0]]),
    );
  } catch {
    return null;
  }
}
