import 'server-only';
import { accesoSucursales } from '../supabase/sesion';
import { resolverSucursal } from './acceso';
import type { ConfigSucursal } from './config';
import type { RespuestaError } from './contratos';
import { hoyLocal } from './datos';
import { origenesValidos, type FiltroOrigen } from './metricas';
import { diasEntre, fechaValida } from './tiempo';

/** Respuestas personalizadas por permisos: nunca a una CDN ni a la caché del navegador. */
export const json = <T>(cuerpo: T, status = 200) =>
  Response.json(cuerpo, { status, headers: { 'Cache-Control': 'private, no-store' } });
const error = (status: number, mensaje: string) => json<RespuestaError>({ error: mensaje }, status);

/**
 * Autoriza ANTES de tocar caché o proveedor: sesión (401), perfil activo y módulo (403),
 * sucursal asignada y configurada (404 genérico, sin revelar si existe).
 */
export async function autorizar(params: Promise<{ companyId: string }>): Promise<
  | {
      ok: true;
      cfg: ConfigSucursal;
      /** Sesión y perfil del usuario: para lecturas adicionales bajo su RLS (p. ej. costos de Costeo). */
      db: Extract<Awaited<ReturnType<typeof accesoSucursales>>, { ok: true }>['db'];
      perfil: { rol: string };
    }
  | { ok: false; respuesta: Response }
> {
  const a = await accesoSucursales();
  if (!a.ok) return { ok: false, respuesta: error(a.status, a.mensaje) };
  const cfg = resolverSucursal((await params).companyId, a.companias);
  if (!cfg) return { ok: false, respuesta: error(404, 'Sucursal no disponible.') };
  return { ok: true, cfg, db: a.db, perfil: a.perfil };
}

export const invalido = (mensaje: string) => error(400, mensaje);

export function leerOrigen(q: URLSearchParams): FiltroOrigen | null {
  const o = q.get('origen') ?? 'todos';
  return (origenesValidos as string[]).includes(o) ? (o as FiltroOrigen) : null;
}

/** Periodo cerrado o abierto hasta hoy (local de la sucursal), con máximo de días. */
/** Productos, Costeo y Consumo: hasta 62 días (docs/sucursales/13). Pedidos sigue en 7. */
export const DIAS_PERIODO_LARGO = 62;

export function leerPeriodo(
  q: URLSearchParams,
  cfg: ConfigSucursal,
  maxDias: number,
): { desde: string; hasta: string } | string {
  const hoy = hoyLocal(cfg).fecha;
  const desde = q.get('desde') ?? hoy;
  const hasta = q.get('hasta') ?? desde;
  if (!fechaValida(desde) || !fechaValida(hasta)) return 'Fecha inválida (usa AAAA-MM-DD).';
  if (desde > hasta) return 'La fecha inicial es posterior a la final.';
  if (hasta > hoy) return 'El periodo no puede incluir fechas futuras.';
  if (diasEntre(desde, hasta) >= maxDias) return `El periodo máximo es de ${maxDias} días.`;
  return { desde, hasta };
}
