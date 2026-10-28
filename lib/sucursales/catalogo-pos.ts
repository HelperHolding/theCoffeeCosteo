import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { CatalogoNombres } from './metricas';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Nombres del POS de nuestros enlaces (producto_codigo_pos.nombre_observado) → código, con la sesión del usuario (RLS).
 * Solo entran los nombres con UN código: un nombre repetido no sirve de evidencia. Ante cualquier error devuelve null y
 * la identidad usa solo las ventas del periodo (comportamiento anterior).
 */
export async function leerCatalogoPos(db: Db): Promise<CatalogoNombres | null> {
  try {
    const r = await db.from('producto_codigo_pos').select('codigo, nombre_observado');
    if (r.error || !Array.isArray(r.data)) return null;
    const codigos = new Map<string, Set<string>>();
    for (const e of r.data)
      if (e.nombre_observado && e.codigo)
        codigos.set(e.nombre_observado, (codigos.get(e.nombre_observado) ?? new Set<string>()).add(e.codigo));
    return new Map(
      [...codigos].filter(([, cs]) => cs.size === 1).map(([nombre, cs]) => [nombre, [...cs][0]]),
    );
  } catch {
    return null;
  }
}
