// app/(comercializadora)/comercializadora/reporte-semanal/descargar/route.ts
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerReporteSemanal } from '@/lib/comercializadora/reporteSemanal';
import { com } from '@/lib/comercializadora/consultas';
import { normalizarConfigReporte } from '../../../../../supabase/functions/_shared/reporte/config.ts';
import { archivoVentas, htmlReporteVentas } from '@/lib/comercializadora/exportar/reporteVentas';
import { htmlAPdf, MENSAJE_FALLA_PDF } from '@/lib/comercializadora/exportar/pdf';
import { parametrosDescarga, respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';

export const runtime = 'nodejs';
// Puede leer Zoho si la copia de la función venció (hasta 150 s) y luego arrancar Chromium.
export const maxDuration = 300;

export async function GET(req: Request) {
  let db;
  try {
    ({ db } = await sesionComercializadora(false));
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Sin sesión';
    return respuestaError(/sesión venció/i.test(m) ? 401 : 403, m);
  }
  const { semana, formato } = parametrosDescarga(req.url, hoyCdmx());
  const [r, cfgR] = await Promise.all([
    leerReporteSemanal(semana, false),
    com(db).from('com_reporte_config').select('config').eq('id', 1).maybeSingle(),
  ]);
  if (!r.ok) return respuestaError(502, r.error);
  const html = htmlReporteVentas(r.reporte, {
    excluidasSucursales: normalizarConfigReporte(cfgR.data?.config).excluir_saldos_sucursales,
    aviso: r.aviso,
  });
  if (formato === 'html') return respuestaArchivo(html, archivoVentas(semana, 'html'), 'html');
  try {
    return respuestaArchivo(await htmlAPdf(html), archivoVentas(semana, 'pdf'), 'pdf');
  } catch {
    // htmlAPdf ya registró el detalle; al usuario solo el mensaje fijo.
    return respuestaError(502, MENSAJE_FALLA_PDF);
  }
}
