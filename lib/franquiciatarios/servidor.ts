import 'server-only';
import { cookies } from 'next/headers';
import type { servidor } from '../supabase/servidor';
import { configDe, type ConfigSucursal } from '../sucursales/config';
import type { RolFranq } from '../supabase/sesion';
import { armarDia, plantillaVigente, type Dia } from './dia';
import type { FranqBarista } from './tipos';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Sucursal de la URL: entero positivo, con rol del usuario en ella y configurada. Cualquier otro caso = null y la
 * página responde el mismo 404 que Sucursales (sin revelar si existe).
 */
export function resolverFranq(
  raw: string,
  sucursales: Map<number, RolFranq>,
): { cfg: ConfigSucursal; rol: RolFranq } | null {
  if (!/^[1-9]\d{0,8}$/.test(raw)) return null;
  const id = Number(raw);
  const rol = sucursales.get(id);
  const cfg = rol ? configDe(id) : null;
  return cfg && rol ? { cfg, rol } : null;
}

const falla = (que: string, e: { message: string } | null) => {
  if (e) throw new Error(`No se pudo leer ${que}. Intenta de nuevo.`);
};

/** Estado del checklist de un día de operación (RLS: solo de las sucursales del usuario). */
export async function leerDia(db: Db, companyId: number, dia: string): Promise<Dia> {
  const [plantillas, checklists, incidencias] = await Promise.all([
    db.from('franq_plantillas').select('id,company_id,version,vigente'),
    db.from('franq_checklists').select('id,seccion,seccion_id').eq('company_id', companyId).eq('dia', dia),
    db.from('franq_incidencias').select('*').eq('company_id', companyId).eq('dia', dia),
  ]);
  falla('la plantilla', plantillas.error);
  falla('los checklists', checklists.error);
  falla('las incidencias', incidencias.error);
  const vigente = plantillaVigente(plantillas.data ?? [], companyId);
  const ids = (checklists.data ?? []).map((c) => c.id);
  const seccionIds = (checklists.data ?? []).map((c) => c.seccion_id);
  const [secciones, respuestas, firmas] = await Promise.all([
    vigente === null && seccionIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : db
          .from('franq_plantilla_secciones')
          .select('*')
          .or(
            [
              vigente !== null ? `plantilla_id.eq.${vigente}` : null,
              seccionIds.length ? `id.in.(${seccionIds.join(',')})` : null,
            ]
              .filter(Boolean)
              .join(','),
          ),
    ids.length
      ? db.from('franq_respuestas').select('*').in('checklist_id', ids)
      : Promise.resolve({ data: [], error: null }),
    ids.length
      ? db.from('franq_firmas').select('*').in('checklist_id', ids)
      : Promise.resolve({ data: [], error: null }),
  ]);
  falla('las secciones', secciones.error);
  falla('las respuestas', respuestas.error);
  falla('las firmas', firmas.error);
  const sids = (secciones.data ?? []).map((s) => s.id);
  const puntos = sids.length
    ? await db.from('franq_plantilla_puntos').select('*').in('seccion_id', sids)
    : { data: [], error: null };
  falla('los puntos', puntos.error);
  return armarDia({
    dia,
    secciones: secciones.data ?? [],
    puntos: puntos.data ?? [],
    checklists: checklists.data ?? [],
    respuestas: respuestas.data ?? [],
    firmas: firmas.data ?? [],
    incidencias: incidencias.data ?? [],
    vigente,
  });
}

export async function leerBaristas(db: Db, companyId: number): Promise<FranqBarista[]> {
  const r = await db.from('franq_baristas').select('*').eq('company_id', companyId).order('nombre');
  falla('los baristas', r.error);
  return r.data ?? [];
}

/** Cookie con el nombre declarado en la cuenta de baristas (una por sucursal). */
export const cookieBarista = (companyId: number) => `franq_barista_${companyId}`;

/** Barista declarado en este dispositivo, solo si sigue activo en esa sucursal. */
export async function baristaElegido(baristas: FranqBarista[], companyId: number): Promise<FranqBarista | null> {
  const v = Number((await cookies()).get(cookieBarista(companyId))?.value);
  return baristas.find((b) => b.id === v && b.activo) ?? null;
}
