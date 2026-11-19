'use server';
import { cookies, headers } from 'next/headers';
import { refresh } from 'next/cache';
import {
  COOKIE_VER_COMO,
  ROLES_VISTA,
  sesionFranquiciatarios,
  esGestorFranq,
  type RolFranq,
} from '@/lib/supabase/sesion';
import { cookieBarista } from '@/lib/franquiciatarios/servidor';
import type { SeccionClave, TipoFirma } from '@/lib/franquiciatarios/tipos';

export type Resultado = { ok: true } | { error: string };

const SECCIONES: SeccionClave[] = ['apertura', 'cambio', 'cierre'];
const FIRMAS: TipoFirma[] = ['responsable', 'entrega', 'recibe'];
const SIN_ACCESO = 'No tienes acceso a esta sucursal.';

/** Sesión del módulo y rol en la sucursal pedida; null si no la tiene (la base lo vuelve a exigir). */
async function contexto(companyId: number) {
  const s = await sesionFranquiciatarios(false).catch(() => null);
  if (!s) return null;
  const rol = Number.isSafeInteger(companyId) ? s.sucursales.get(companyId) : undefined;
  return rol ? { ...s, rol } : null;
}

const dispositivo = async () => (await headers()).get('user-agent')?.slice(0, 300) ?? null;

/** Barista declarado en este dispositivo (solo la cuenta de baristas lo necesita; la base valida que esté activo). */
async function barista(companyId: number, rol: RolFranq): Promise<number | null> {
  if (rol !== 'barista') return null;
  const v = Number((await cookies()).get(cookieBarista(companyId))?.value);
  return Number.isSafeInteger(v) && v > 0 ? v : null;
}

/** Mensaje para la persona: los de la base ya vienen en español; cualquier otro, genérico. */
const fallo = (e: unknown): { error: string } => {
  const x = (e && typeof e === 'object' ? e : {}) as { message?: unknown; code?: unknown };
  const m = typeof x.message === 'string' ? x.message : '';
  // P0001: mensajes que escribimos en las funciones de la migración 75 (ya en español, para la persona).
  if (x.code === 'P0001' && m.length < 300) return { error: m };
  if (x.code === '42501') return { error: m.startsWith('Solo') ? m : SIN_ACCESO };
  // Dos dispositivos registraron lo mismo a la vez: lo otro ya quedó.
  if (x.code === '23505') return { error: 'Alguien más lo acaba de registrar. Actualiza la pantalla.' };
  if (x.code) return { error: 'No se pudo guardar. Intenta de nuevo o avisa al gerente.' };
  return { error: 'No se guardó. Revisa la conexión e intenta de nuevo.' };
};

async function ejecutar(fn: () => PromiseLike<{ error: { message: string } | null }>): Promise<Resultado> {
  try {
    const r = await fn();
    if (r.error) return fallo(r.error);
    refresh();
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** Solo el admin del módulo: elige con qué rol ver las pantallas (vista previa). Sus permisos no cambian. */
export async function verComo(rol: RolFranq): Promise<Resultado> {
  const s = await sesionFranquiciatarios(false).catch(() => null);
  if (!s?.admin) return { error: 'Solo el administrador del módulo usa la vista previa.' };
  if (!ROLES_VISTA.includes(rol)) return { error: 'Rol inválido.' };
  const jar = await cookies();
  if (rol === 'admin') jar.delete(COOKIE_VER_COMO);
  else
    jar.set(COOKIE_VER_COMO, rol, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 12,
    });
  refresh();
  return { ok: true };
}

/** La cuenta de baristas declara quién está usando el dispositivo. null = cambiar de persona. */
export async function elegirBarista(companyId: number, baristaId: number | null): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const jar = await cookies();
  if (baristaId === null) {
    jar.delete(cookieBarista(companyId));
    refresh();
    return { ok: true };
  }
  const r = await c.db
    .from('franq_baristas')
    .select('id')
    .eq('id', baristaId)
    .eq('company_id', companyId)
    .eq('activo', true)
    .maybeSingle();
  if (r.error || !r.data) return { error: 'Ese nombre ya no está activo. Elige otro.' };
  jar.set(cookieBarista(companyId), String(baristaId), {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 14, // un turno largo; al día siguiente se vuelve a elegir
  });
  refresh();
  return { ok: true };
}

export async function responder(datos: {
  companyId: number;
  seccion: SeccionClave;
  punto: number;
  cumple: boolean;
  observacion?: string | null;
  motivo?: string | null;
}): Promise<Resultado> {
  if (!SECCIONES.includes(datos.seccion) || typeof datos.cumple !== 'boolean')
    return { error: 'Datos inválidos.' };
  const c = await contexto(datos.companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(datos.companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_responder', {
      p_company: datos.companyId,
      p_seccion: datos.seccion,
      p_punto: datos.punto,
      p_cumple: datos.cumple,
      p_observacion: datos.observacion ?? null,
      p_barista: b,
      p_dispositivo: disp,
      p_motivo: datos.motivo ?? null,
    }),
  );
}

export async function firmar(companyId: number, seccion: SeccionClave, tipo: TipoFirma): Promise<Resultado> {
  if (!SECCIONES.includes(seccion) || !FIRMAS.includes(tipo)) return { error: 'Datos inválidos.' };
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de firmar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_firmar', {
      p_company: companyId,
      p_seccion: seccion,
      p_tipo: tipo,
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

export async function registrarIncidencia(companyId: number, texto: string): Promise<Resultado> {
  const c = await contexto(companyId);
  if (!c) return { error: SIN_ACCESO };
  const b = await barista(companyId, c.rol);
  if (c.rol === 'barista' && !b) return { error: 'Elige tu nombre antes de registrar.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_incidencia', {
      p_company: companyId,
      p_texto: String(texto ?? ''),
      p_barista: b,
      p_dispositivo: disp,
    }),
  );
}

export async function corregir(datos: {
  companyId: number;
  respuesta: number;
  cumple: boolean;
  observacion?: string | null;
  motivo: string;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario corrigen registros.' };
  const disp = await dispositivo();
  return ejecutar(() =>
    c.db.rpc('franq_corregir', {
      p_respuesta: datos.respuesta,
      p_cumple: datos.cumple,
      p_observacion: datos.observacion ?? null,
      p_motivo: String(datos.motivo ?? ''),
      p_dispositivo: disp,
    }),
  );
}

export async function guardarBarista(datos: {
  companyId: number;
  id: number | null;
  nombre: string;
  activo: boolean;
}): Promise<Resultado> {
  const c = await contexto(datos.companyId);
  if (!c || !esGestorFranq(c.rol))
    return { error: 'Solo el gerente o el franquiciatario administran los nombres.' };
  return ejecutar(() =>
    c.db.rpc('franq_barista_guardar', {
      p_company: datos.companyId,
      p_id: datos.id,
      p_nombre: String(datos.nombre ?? ''),
      p_activo: datos.activo,
    }),
  );
}
