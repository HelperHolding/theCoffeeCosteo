import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { Rol } from '../supabase/database.types';
import { centavos } from './normalizar';
import { claveCosto, type DatosCosteo } from './costeo';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Quién ve el Costeo de una sucursal (docs/sucursales/13): quien ve la sucursal Y tiene rol de Costeo o el módulo
 * `sucursales_costeo` (lectura). Lo decide la base (RPC security definer de la migración 24); el portal solo lo
 * pide con la sesión del usuario. Si no puede, la respuesta no lleva receta, costo ni margen.
 */
const ROLES_COSTEO: readonly Rol[] = ['compras', 'operaciones', 'finanzas', 'admin'];
export const puedeVerCostos = (perfil: { rol: string } | null | undefined) =>
  !!perfil && (ROLES_COSTEO as readonly string[]).includes(perfil.rol);

/** La RPC aún no existe (migración 24 sin aplicar): se usa la lectura anterior bajo RLS. */
export const rpcAusente = (e: { code?: string } | null) => e?.code === 'PGRST202' || e?.code === '42883';

export type LecturaCosteo =
  { estado: 'ok'; datos: DatosCosteo } | { estado: 'sin-permiso' } | { estado: 'error' };

interface CosteoRpc {
  iva: number | string;
  enlaces: { codigo: string; receta_id: string; receta: string }[];
  costos: { receta_id: string; tamano: string; costo: number | string; usa_inactivo: boolean }[];
  unicas: string[];
}

/** ¿Puede ver el Costeo de esta sucursal? Para mostrar u ocultar la sección (la API lo vuelve a exigir). */
export async function puedeCostear(db: Db, companyId: number, perfil: { rol: string }): Promise<boolean> {
  try {
    const r = await db.rpc('sucursales_puede_costeo', { p_company: companyId });
    if (!r.error) return r.data === true;
    return rpcAusente(r.error) && puedeVerCostos(perfil);
  } catch {
    return false;
  }
}

/** Enlaces, costos actuales y tamaños de Costeo de una sucursal. Falla cerrado. */
export async function leerDatosCosteo(
  db: Db,
  perfil: { rol: string } | null | undefined,
  companyId: number,
  ahora = () => new Date(),
): Promise<LecturaCosteo> {
  try {
    const r = await db.rpc('sucursales_datos_costeo', { p_company: companyId });
    if (!r.error) {
      if (!r.data) return { estado: 'sin-permiso' };
      const d = r.data as unknown as CosteoRpc;
      const datos: DatosCosteo = {
        leidoEn: ahora().toISOString(),
        iva: Number(d.iva),
        enlaces: new Map(d.enlaces.map((e) => [e.codigo, { recetaId: e.receta_id, receta: e.receta }])),
        costos: new Map(
          d.costos.map((c) => [
            claveCosto(c.receta_id, c.tamano),
            { costoCent: centavos(Number(c.costo)), usaInactivo: !!c.usa_inactivo },
          ]),
        ),
        unicas: new Set(d.unicas),
      };
      return Number.isFinite(datos.iva) ? { estado: 'ok', datos } : { estado: 'error' };
    }
    if (!rpcAusente(r.error)) return { estado: 'error' };
  } catch {
    return { estado: 'error' };
  }
  if (!puedeVerCostos(perfil)) return { estado: 'sin-permiso' };
  const datos = await leerDatosCosteoRls(db, ahora);
  return datos ? { estado: 'ok', datos } : { estado: 'error' };
}

/** Lectura anterior (bajo RLS con rol de Costeo): solo mientras la migración 24 no esté aplicada. */
async function leerDatosCosteoRls(db: Db, ahora: () => Date): Promise<DatosCosteo | null> {
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
