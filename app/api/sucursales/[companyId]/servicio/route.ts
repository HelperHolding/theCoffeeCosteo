import { hoyLocal } from '@/lib/sucursales/datos';
import { DIAS_PERIODO_LARGO, autorizar, invalido, json, leerPeriodo } from '@/lib/sucursales/rutas';
import { mismaHoraQueRappi } from '@/lib/sucursales/rappi-pos';
import { construirServicio, type RpcServicio } from '@/lib/sucursales/servicio';
import { leerPublicadoHasta, recortarAlPublicado } from '@/lib/sucursales/servicio-publicado';
import { enZona } from '@/lib/sucursales/tiempo';

export const runtime = 'nodejs';

/**
 * Sección «Nivel de servicio» · indicadores, reclamos y conectividad de Rappi leídos del portal de Partners
 * (docs/rappi-portal/08). Los guarda el cron de n8n; aquí solo se leen bajo el acceso del usuario a la sucursal (la RPC
 * lo vuelve a exigir). Hasta 62 días. Sin tienda en el portal: 404, como la pestaña Rappi.
 *
 * Rappi publica cada día con 1 a 2 días de retraso: los indicadores se cortan en el último día publicado
 * (`publicadoHasta`) y los días siguientes, que el importador guarda en ceros, no cuentan. Con `?ultimo=1` el periodo es
 * ese último día (la conectividad llega hasta hoy). Se vuelve a leer cada 5 min, así que avanza solo cuando Rappi publica.
 */
export async function GET(req: Request, { params }: { params: Promise<{ companyId: string }> }) {
  const a = await autorizar(params);
  if (!a.ok) return a.respuesta;
  if (!a.cfg.rappiPortal) return json({ error: 'Esta sucursal no está conectada al portal de Rappi.' }, 404);
  const q = new URL(req.url).searchParams;
  const publicadoHasta = await leerPublicadoHasta(
    a.db,
    a.companias,
    enZona(new Date(), 'America/Mexico_City').fecha,
  );
  let periodo: { desde: string; hasta: string };
  if (q.get('ultimo') === '1') {
    const hoy = hoyLocal(a.cfg).fecha;
    periodo = { desde: publicadoHasta && publicadoHasta < hoy ? publicadoHasta : hoy, hasta: hoy };
  } else {
    const p = leerPeriodo(q, a.cfg, DIAS_PERIODO_LARGO);
    if (typeof p === 'string') return invalido(p);
    periodo = p;
  }
  const r = await a.db.rpc('sucursales_nivel_servicio', {
    p_company: a.cfg.companyId,
    p_desde: periodo.desde,
    p_hasta: periodo.hasta,
  });
  if (r.error) return json({ error: 'No se pudo leer el nivel de servicio de Rappi.' }, 503);
  if (!r.data) return json({ error: 'Sucursal no disponible.' }, 404);
  // Indicadores hasta el último día publicado; sin saberlo (lectura fallida) se muestra todo, como antes.
  const corte = publicadoHasta && publicadoHasta < periodo.hasta ? publicadoHasta : periodo.hasta;
  const rpc = r.data as unknown as RpcServicio;
  return json({
    ...construirServicio(
      corte === periodo.hasta ? rpc : recortarAlPublicado(rpc, corte),
      periodo.desde,
      periodo.hasta,
      a.cfg.zona,
      !mismaHoraQueRappi(a.cfg.zona, periodo.hasta),
    ),
    publicadoHasta,
    indicadoresHasta: corte < periodo.desde ? null : corte,
  });
}
