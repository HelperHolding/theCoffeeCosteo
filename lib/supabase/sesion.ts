import { cache } from 'react';
import { redirect } from 'next/navigation';
import { servidor } from './servidor';
import { puede, type Area } from '../portal/permisos';
import { tieneCosteo } from '../portal/roles';
import type { Accesos } from '../portal/modulos';

type Db = Awaited<ReturnType<typeof servidor>>;

const leerAccesos = async (db: Db, userId: string): Promise<Accesos> => {
  const r = await db.from('perfil_modulos').select('modulo,nivel').eq('user_id', userId);
  // Falla cerrado: cualquier error (p. ej. tabla aún sin migrar) = sin acceso.
  if (!r || r.error || !Array.isArray(r.data)) return {};
  return Object.fromEntries(r.data.map((f) => [f.modulo, f.nivel]));
};

/**
 * Identidad, perfil y accesos una sola vez por petición: el layout y la página la comparten
 * (`cache` memoriza dentro del mismo render del servidor). Perfil y accesos van en paralelo.
 */
const contexto = cache(async () => {
  const db = await servidor();
  const { data, error } = await db.auth.getUser();
  if (error || !data.user) return { db, usuario: null } as const;
  const [perfil, accesos] = await Promise.all([
    db.from('perfiles').select('*').eq('user_id', data.user.id).maybeSingle(),
    leerAccesos(db, data.user.id),
  ]);
  return { db, usuario: data.user, perfil, accesos } as const;
});

/**
 * Sesión del portal. Los roles sin Costeo (sucursales, migración 24; interno, franquiciado y proveedor, migración 44)
 * solo pasan donde se permite explícitamente (`sinCosteo`: Inicio, CRM). En Costeo, 'sucursales' va a /sucursales y
 * los demás a Inicio, o la acción falla. La RLS de Costeo también los niega.
 */
export async function sesion(
  area?: Area,
  redirigir = true,
  { sinCosteo = false }: { sinCosteo?: boolean } = {},
) {
  const c = await contexto();
  if (!c.usuario) {
    if (redirigir) redirect('/login');
    throw new Error('La sesión venció. Inicia sesión en otra pestaña.');
  }
  const r = c.perfil;
  if (r.error) throw new Error('No se pudo consultar tu perfil. Intenta de nuevo.');
  if (!r.data?.activo) {
    if (redirigir) redirect('/login?aviso=perfil');
    throw new Error('Tu cuenta necesita un perfil activo.');
  }
  if (!sinCosteo && !tieneCosteo(r.data.rol)) {
    if (redirigir) redirect(r.data.rol === 'sucursales' ? '/sucursales' : '/');
    throw new Error('Tu perfil no tiene acceso a Costeo.');
  }
  if (area && !puede(r.data.rol, area)) throw new Error('No tienes permiso para esta acción');
  return { db: c.db, perfil: r.data };
}

/** Accesos por módulo del usuario (ya leídos junto con la sesión de esta petición). */
export async function accesos(db: Db, userId: string): Promise<Accesos> {
  const c = await contexto();
  return c.usuario && c.usuario.id === userId ? c.accesos : leerAccesos(db, userId);
}

/** Sesión del CRM: exige acceso al módulo en cada página y acción (la RLS lo vuelve a exigir en la base). */
export async function sesionCrm(redirigir = true) {
  const s = await sesion(undefined, redirigir, { sinCosteo: true });
  const a = await accesos(s.db, s.perfil.user_id);
  if (!a.crm) {
    if (redirigir) redirect('/');
    throw new Error('No tienes acceso al CRM');
  }
  return { ...s, accesos: a, nivel: a.crm };
}

/** company_id asignadas al usuario en perfil_sucursales. Falla cerrado: cualquier error al leer = ninguna. */
const companiasAsignadas = async (db: Db, userId: string): Promise<number[]> => {
  const r = await db.from('perfil_sucursales').select('company_id').eq('user_id', userId);
  return !r || r.error || !Array.isArray(r.data)
    ? []
    : r.data.map((f) => Number(f.company_id)).filter((n) => Number.isSafeInteger(n) && n > 0);
};

type DenegacionSucursales = { ok: false; status: 401 | 403; destino: string; mensaje: string };

/**
 * Acceso al módulo Sucursales sin redirigir (para route handlers): perfil activo, fila explícita en
 * perfil_modulos y las company_id asignadas en perfil_sucursales. Admin no tiene acceso implícito.
 * Falla cerrado: cualquier error al leer las asignaciones = ninguna sucursal.
 */
export async function accesoSucursales(): Promise<
  | { ok: true; db: Db; perfil: { user_id: string; nombre: string; rol: string }; companias: number[] }
  | DenegacionSucursales
> {
  const c = await contexto();
  if (!c.usuario) return { ok: false, status: 401, destino: '/login', mensaje: 'La sesión venció.' };
  if (c.perfil.error || !c.perfil.data?.activo)
    return {
      ok: false,
      status: 403,
      destino: '/login?aviso=perfil',
      mensaje: 'Tu cuenta necesita un perfil activo.',
    };
  if (!c.accesos.sucursales)
    return { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso a Sucursales.' };
  const companias = await companiasAsignadas(c.db, c.usuario.id);
  return { ok: true, db: c.db, perfil: c.perfil.data, companias };
}

/** Sesión de páginas de Sucursales: redirige como el resto del portal. */
export async function sesionSucursales(redirigir = true) {
  const a = await accesoSucursales();
  if (!a.ok) {
    if (redirigir) redirect(a.destino);
    throw new Error(a.mensaje);
  }
  return a;
}

/**
 * Acceso al módulo BI sin redirigir (para route handlers): como accesoSucursales, pero con la fila 'bi' en
 * perfil_modulos. Las company_id vienen de perfil_sucursales; admin no tiene acceso implícito.
 */
export async function accesoBi(): Promise<
  | { ok: true; db: Db; perfil: { user_id: string; nombre: string; rol: string }; companias: number[] }
  | DenegacionSucursales
> {
  const c = await contexto();
  if (!c.usuario) return { ok: false, status: 401, destino: '/login', mensaje: 'La sesión venció.' };
  if (c.perfil.error || !c.perfil.data?.activo)
    return {
      ok: false,
      status: 403,
      destino: '/login?aviso=perfil',
      mensaje: 'Tu cuenta necesita un perfil activo.',
    };
  if (!c.accesos.bi) return { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso al BI.' };
  const companias = await companiasAsignadas(c.db, c.usuario.id);
  return { ok: true, db: c.db, perfil: c.perfil.data, companias };
}

/** Sesión de páginas del BI: redirige como el resto del portal. */
export async function sesionBi(redirigir = true) {
  const a = await accesoBi();
  if (!a.ok) {
    if (redirigir) redirect(a.destino);
    throw new Error(a.mensaje);
  }
  return a;
}
