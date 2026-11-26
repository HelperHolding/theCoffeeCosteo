// app/(comercializadora)/comercializadora/compras/descargar/route.ts
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { leerDatosCompras } from '@/lib/comercializadora/compras/datos';
import { semDelMotor } from '@/lib/comercializadora/compras/motor';
import { filtrosDeUrl } from '@/lib/comercializadora/compras/filtros';
import { SIN_DATOS } from '@/lib/comercializadora/compras/sync';
import { planCompra } from '@/lib/comercializadora/compras/plan';
import { archivoCompras, htmlTableroCompras } from '@/lib/comercializadora/exportar/reporteCompras';
import { htmlAPdf, MENSAJE_FALLA_PDF } from '@/lib/comercializadora/exportar/pdf';
import { respuestaArchivo, respuestaError } from '@/lib/comercializadora/exportar/descarga';
import { armarTablero, faltanDatos } from '../../../../../supabase/functions/_shared/compras/tablero.ts';

export const runtime = 'nodejs';
// Solo Supabase (sin Zoho) y luego Chromium.
export const maxDuration = 60;


export async function GET(req: Request) {
  let db;
  try {
    ({ db } = await sesionComercializadora(false));
  } catch (e) {
    const m = e instanceof Error ? e.message : 'Sin sesión';
    return respuestaError(/sesión venció/i.test(m) ? 401 : 403, m);
  }
  const sp = new URL(req.url).searchParams;
  const formato = sp.get('formato') === 'pdf' ? 'pdf' : 'html';
  const hoy = hoyCdmx();
  let leido;
  try {
    leido = await Promise.all([leerDatosCompras(db), semDelMotor(db)]);
  } catch (e) {
    return respuestaError(500, e instanceof Error ? e.message : 'No se pudieron leer los datos de compras.');
  }
  const [{ datos, ultimaSync }, motor] = leido;
  if (faltanDatos(datos)) return respuestaError(409, SIN_DATOS);
  const t = armarTablero(datos, filtrosDeUrl(Object.fromEntries(sp)), hoy);
  const html = htmlTableroCompras(t, {
    plan: motor.ok ? planCompra(motor.S, t.filtros, hoy) : null,
    errorPlan: motor.ok ? null : motor.error,
    leidoEn: new Date().toISOString(),
    ultimaSync,
  });
  if (formato === 'html') return respuestaArchivo(html, archivoCompras(t, 'html'), 'html');
  try {
    return respuestaArchivo(await htmlAPdf(html), archivoCompras(t, 'pdf'), 'pdf');
  } catch {
    // htmlAPdf ya registró el detalle; al usuario solo el mensaje fijo.
    return respuestaError(502, MENSAJE_FALLA_PDF);
  }
}
