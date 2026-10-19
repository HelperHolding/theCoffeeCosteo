import { redirect } from 'next/navigation';
import { servidor } from './servidor';
import { puede, type Area } from '../portal/permisos';
import type { Accesos } from '../portal/modulos';
export async function sesion(area?: Area, redirigir = true) {
  const db = await servidor();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) {
    if (redirigir) redirect('/login');
    throw new Error('La sesión venció. Inicia sesión en otra pestaña.');
  }
  const r = await db.from('perfiles').select('*').eq('user_id', data.user.id).maybeSingle();
  if (r.error) throw new Error('No se pudo consultar tu perfil. Intenta de nuevo.');
  if (!r.data?.activo) {
    if (redirigir) redirect('/login?aviso=perfil');
    throw new Error('Tu cuenta necesita un perfil activo.');
  }
  if (area && !puede(r.data.rol, area)) throw new Error('No tienes permiso para esta acción');
  return { db, perfil: r.data };
}

type Db = Awaited<ReturnType<typeof sesion>>['db'];

/** Accesos por módulo del usuario. Falla cerrado: cualquier error (p. ej. tabla aún sin migrar) = sin acceso. */
export async function accesos(db: Db, userId: string): Promise<Accesos> {
  const r = await db.from('perfil_modulos').select('modulo,nivel').eq('user_id', userId);
  if (r.error || !r.data) return {};
  return Object.fromEntries(r.data.map((f) => [f.modulo, f.nivel]));
}

/** Sesión del CRM: exige acceso al módulo en cada página y acción (la RLS lo vuelve a exigir en la base). */
export async function sesionCrm(redirigir = true) {
  const s = await sesion(undefined, redirigir);
  const a = await accesos(s.db, s.perfil.user_id);
  if (!a.crm) {
    if (redirigir) redirect('/');
    throw new Error('No tienes acceso al CRM');
  }
  return { ...s, accesos: a, nivel: a.crm };
}
