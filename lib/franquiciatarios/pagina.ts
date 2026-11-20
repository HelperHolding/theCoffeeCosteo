import 'server-only';
import { notFound } from 'next/navigation';
import { esGestorFranq, sesionFranquiciatarios } from '../supabase/sesion';
import { resolverFranq } from './servidor';

/**
 * Contexto de una página de sucursal: sesión del módulo (redirige si no hay) y la sucursal de la URL con el rol del
 * usuario en ella. Otra sucursal o una que no existe = el mismo 404.
 */
export async function contextoSucursal(params: Promise<{ companyId: string }>) {
  const s = await sesionFranquiciatarios();
  const r = resolverFranq((await params).companyId, s.sucursales);
  if (!r) notFound();
  return { ...s, cfg: r.cfg, rol: r.rol, gestor: esGestorFranq(r.rol), companyId: r.cfg.companyId };
}

/** Páginas solo para gerente, franquiciatario o admin: a la cuenta de baristas le responden 404. */
export async function contextoGestor(params: Promise<{ companyId: string }>) {
  const c = await contextoSucursal(params);
  if (!c.gestor) notFound();
  return c;
}
