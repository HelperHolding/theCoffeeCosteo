import 'server-only';
import { NextResponse } from 'next/server';
import { accesoFranquiciatarios, esGestorFranq } from '../supabase/sesion';
import { resolverFranq } from './servidor';

export const SIN_CACHE = { 'Cache-Control': 'private, no-store' } as const;
export const json = (cuerpo: unknown, status = 200) => NextResponse.json(cuerpo, { status, headers: SIN_CACHE });

/**
 * Autoriza una ruta del módulo: sin sesión 401, sin módulo 403, sucursal ajena o inexistente 404 (sin revelar si
 * existe). `soloGestor` responde 404 también a la cuenta de baristas.
 */
export async function autorizarFranq(params: Promise<{ companyId: string }>, { soloGestor = false } = {}) {
  const a = await accesoFranquiciatarios();
  if (!a.ok) return { ok: false, respuesta: json({ error: a.mensaje }, a.status) } as const;
  const r = resolverFranq((await params).companyId, a.sucursales);
  if (!r || (soloGestor && !esGestorFranq(r.rol))) return { ok: false, respuesta: json({ error: 'No encontrada' }, 404) } as const;
  return { ...a, ok: true, cfg: r.cfg, rol: r.rol } as const;
}
