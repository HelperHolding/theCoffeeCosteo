import type { Json } from '@/lib/supabase/database.types';
import { accesoBi } from '@/lib/supabase/sesion';
import { aJsonRpc } from '@/lib/bi/filtros';
import { aFiltrosBi, hoyMexico, leerUrl } from '@/lib/bi/url';
import { json } from '@/lib/sucursales/rutas';
import type { RespuestaTendencias, RpcOpciones, RpcTendencias } from '@/lib/bi/tipos';

export const runtime = 'nodejs';

/**
 * Tendencias del BI: la RPC ignora las fechas, así que no se valida el periodo. Las semanas se quitan de los
 * filtros. Las opciones se leen solo para saber qué tiendas tiene con acceso, y esas no dependen del periodo: se piden
 * con el día de hoy. Con el año en curso, bi_opciones recorría todas las líneas del año (productos, pagos, semanas) y
 * tardaba de 4 a 20 s, más que el límite de 8 s de la base para un usuario (medido el 2026-11-24).
 */
export async function GET(req: Request) {
  const a = await accesoBi();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const hoy = hoyMexico(new Date());
  const f = leerUrl(new URL(req.url).searchParams);
  const o = await a.db.rpc('bi_opciones', { p: { desde: hoy, hasta: hoy } });
  if (o.error || !o.data) {
    console.error('[bi] opciones', o.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  const opciones = o.data as unknown as RpcOpciones;
  const conAcceso = opciones.tiendas.map((t) => t.company_id);
  const companias = f.companias.length ? f.companias.filter((c) => conAcceso.includes(c)) : conAcceso;
  if (!companias.length) return json<RespuestaTendencias>({ hoy, tendencias: null });
  const filtros = aFiltrosBi({ ...f, semanas: [] }, { desde: hoy, hasta: hoy }, companias, hoy);
  const t = await a.db.rpc('bi_tendencias', { p: aJsonRpc(filtros) as Json });
  if (t.error || !t.data) {
    console.error('[bi] tendencias', t.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  return json<RespuestaTendencias>({ hoy, tendencias: t.data as unknown as RpcTendencias });
}
