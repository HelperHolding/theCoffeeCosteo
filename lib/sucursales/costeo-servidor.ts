import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { Rol } from '../supabase/database.types';
import { centavos } from './normalizar';
import { claveCosto, type DatosCosteo } from './costeo';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Quién ve costos de Costeo dentro de Sucursales. Hoy, cualquier perfil activo con rol de Costeo (el mismo criterio
 * con que entra a Costeo y con que la RLS deja leer recetas, enlaces y costos). Se decide en el SERVIDOR: si no
 * puede, la respuesta no lleva receta, costo ni margen (no basta con ocultarlo en el navegador).
 */
const ROLES_COSTEO: readonly Rol[] = ['compras', 'operaciones', 'finanzas', 'admin'];
export const puedeVerCostos = (perfil: { rol: string } | null | undefined) =>
  !!perfil && (ROLES_COSTEO as readonly string[]).includes(perfil.rol);

/**
 * Enlaces, costos actuales y tamaños de Costeo con la sesión del usuario (bajo RLS, sin service role). Falla cerrado:
 * sin permiso o ante cualquier error de lectura devuelve null y la respuesta sale sin costeo.
 */
export async function leerDatosCosteo(
  db: Db,
  perfil: { rol: string } | null | undefined,
  ahora = () => new Date(),
): Promise<DatosCosteo | null> {
  if (!puedeVerCostos(perfil)) return null;
  try {
    const [enlaces, tamanos, parametros] = await Promise.all([
      db.from('producto_codigo_pos').select('codigo, receta_id'),
      db.from('tamanos').select('id, nombre'),
      db.from('parametros').select('iva').limit(1).maybeSingle(),
    ]);
    if (enlaces.error || tamanos.error || parametros.error || !parametros.data) return null;
    const ids = [...new Set(enlaces.data.map((e) => e.receta_id))];
    const [recetas, costos, vendidos] = ids.length
      ? await Promise.all([
          db.from('recetas').select('id, nombre').in('id', ids),
          db
            .from('v_costo_producto')
            .select('producto_id, tamano_id, costo, usa_inactivo')
            .in('producto_id', ids),
          db.from('producto_tamanos').select('producto_id, tamano_id').in('producto_id', ids),
        ])
      : [null, null, null];
    if (recetas?.error || costos?.error || vendidos?.error) return null;
    const nombreReceta = new Map((recetas?.data ?? []).map((r) => [r.id, r.nombre]));
    const nombreTamano = new Map(tamanos.data.map((t) => [t.id, t.nombre]));
    const datos: DatosCosteo = {
      leidoEn: ahora().toISOString(),
      iva: Number(parametros.data.iva),
      enlaces: new Map(),
      costos: new Map(),
      unicas: new Set(),
    };
    for (const e of enlaces.data) {
      const receta = nombreReceta.get(e.receta_id);
      // Una receta que la RLS no deja leer no se enlaza: el código cuenta como «sin enlace».
      if (receta) datos.enlaces.set(e.codigo, { recetaId: e.receta_id, receta });
    }
    for (const c of costos?.data ?? []) {
      const tamano = nombreTamano.get(c.tamano_id);
      if (tamano)
        datos.costos.set(claveCosto(c.producto_id, tamano), {
          costoCent: centavos(Number(c.costo)),
          usaInactivo: !!c.usa_inactivo,
        });
    }
    const tamanosDe = new Map<string, Set<string>>();
    for (const v of vendidos?.data ?? [])
      tamanosDe.set(
        v.producto_id,
        (tamanosDe.get(v.producto_id) ?? new Set()).add(nombreTamano.get(v.tamano_id) ?? ''),
      );
    for (const [id, ts] of tamanosDe) if (ts.size === 1 && ts.has('Único')) datos.unicas.add(id);
    return datos;
  } catch {
    return null;
  }
}
