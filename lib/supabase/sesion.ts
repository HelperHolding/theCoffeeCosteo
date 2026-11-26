import { cache } from 'react';
import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { servidor } from './servidor';
import { puede, type Area } from '../portal/permisos';
import { tieneCosteo } from '../portal/roles';
import { puedeAplicarPagos, puedeVerPagos, type Accesos } from '../portal/modulos';
import type { NivelModulo } from './database.types';
import { sucursalesConfiguradas } from '../sucursales/config';

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
    if (redirigir)
      redirect(
        r.data.rol === 'sucursales' ? '/sucursales' : r.data.rol === 'tienda' ? '/franquiciatarios' : '/',
      );
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

/** Comercializadora: cualquier rol con el módulo en perfil_modulos (lectura ve; edicion/desarrollador editan). */
export async function sesionComercializadora(redirigir = true) {
  const s = await sesion(undefined, redirigir, { sinCosteo: true });
  const a = await accesos(s.db, s.perfil.user_id);
  if (!a.comercializadora) {
    if (redirigir) redirect('/');
    throw new Error('No tienes acceso a Comercializadora');
  }
  return { ...s, accesos: a, nivel: a.comercializadora };
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
  | {
      ok: true;
      db: Db;
      perfil: { user_id: string; nombre: string; rol: string };
      companias: number[];
      /** Ve la Red (ventas): tiene el módulo 'sucursales'. */
      red: boolean;
      /** Ve Sucursales propias (pagos): empleado Holding con 'sucursales_pagos'. */
      propias: boolean;
    }
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
  const propias = puedeVerPagos(c.accesos, c.perfil.data.rol);
  if (!c.accesos.sucursales && !propias)
    return { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso a Sucursales.' };
  // Sin el módulo de ventas no hay sucursales: pagos-only no debe ver datos de POS/Rappi por perfil_sucursales (p. ej. las de BI).
  const red = !!c.accesos.sucursales;
  const companias = red ? await companiasAsignadas(c.db, c.usuario.id) : [];
  return { ok: true, db: c.db, perfil: c.perfil.data, companias, red, propias };
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

/** Pagos de Sucursales propias (spec §3): empleado Holding con 'sucursales_pagos'. Sin redirigir, para route handlers. */
export async function accesoPagos(): Promise<
  | {
      ok: true;
      db: Db;
      perfil: { user_id: string; nombre: string; rol: string };
      nivel: NivelModulo;
      puedeAplicar: boolean;
    }
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
  if (!puedeVerPagos(c.accesos, c.perfil.data.rol))
    return {
      ok: false,
      status: 403,
      destino: '/sucursales',
      mensaje: 'No tienes acceso a Pagos de Sucursales propias.',
    };
  return {
    ok: true,
    db: c.db,
    perfil: c.perfil.data,
    nivel: c.accesos.sucursales_pagos!,
    puedeAplicar: puedeAplicarPagos(c.accesos, c.perfil.data.rol),
  };
}

export async function sesionPagos(redirigir = true) {
  const a = await accesoPagos();
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

/** Rol dentro del módulo Franquiciatarios en una sucursal. 'admin' = fila del módulo con nivel desarrollador. */
export type RolFranq = 'admin' | 'franquiciatario' | 'gerente' | 'barista';
export const esGestorFranq = (rol: RolFranq) => rol !== 'barista';
/** Vista previa del admin del módulo: con qué rol ve las pantallas (sus permisos en la base no cambian). */
export const COOKIE_VER_COMO = 'franq_ver_como';
export const ROLES_VISTA: RolFranq[] = ['admin', 'franquiciatario', 'gerente', 'barista'];

async function verComoAdmin(): Promise<RolFranq> {
  try {
    const v = (await cookies()).get(COOKIE_VER_COMO)?.value as RolFranq | undefined;
    return v && ROLES_VISTA.includes(v) ? v : 'admin';
  } catch {
    return 'admin'; // fuera de una petición (pruebas): sin vista previa
  }
}

/**
 * Acceso al módulo Franquiciatarios sin redirigir (para route handlers): perfil activo, fila del módulo y, por
 * sucursal, una membresía activa en franq_miembros (el admin del módulo ve todas las configuradas). Falla cerrado:
 * cualquier error al leer las membresías = ninguna sucursal. La base vuelve a exigirlo con franq_rol.
 */
export async function accesoFranquiciatarios(): Promise<
  | {
      ok: true;
      db: Db;
      perfil: { user_id: string; nombre: string; rol: string };
      /** company_id → rol del usuario en esa sucursal. */
      sucursales: Map<number, RolFranq>;
      admin: boolean;
      /** Solo el admin: rol con el que está viendo las pantallas ('admin' = sin vista previa). */
      verComo: RolFranq;
    }
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
  const nivel = c.accesos.franquiciatarios;
  if (!nivel)
    return { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso a Franquiciatarios.' };
  const sucursales = new Map<number, RolFranq>();
  const admin = nivel === 'desarrollador';
  const verComo: RolFranq = admin ? await verComoAdmin() : 'admin';
  if (admin) {
    for (const s of sucursalesConfiguradas) sucursales.set(s.companyId, verComo);
  } else {
    const r = await c.db
      .from('franq_miembros')
      .select('company_id,rol')
      .eq('user_id', c.usuario.id)
      .eq('activo', true);
    if (r && !r.error && Array.isArray(r.data))
      for (const f of r.data) {
        const id = Number(f.company_id);
        if (Number.isSafeInteger(id) && id > 0 && ['franquiciatario', 'gerente', 'barista'].includes(f.rol))
          sucursales.set(id, f.rol as RolFranq);
      }
  }
  return { ok: true, db: c.db, perfil: c.perfil.data, sucursales, admin, verComo };
}

/** Sesión de páginas de Franquiciatarios: redirige como el resto del portal. */
export async function sesionFranquiciatarios(redirigir = true) {
  const a = await accesoFranquiciatarios();
  if (!a.ok) {
    if (redirigir) redirect(a.destino);
    throw new Error(a.mensaje);
  }
  return a;
}
