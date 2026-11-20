import type { Json } from '@/lib/supabase/database.types';
import { accesoBi } from '@/lib/supabase/sesion';
import { aJsonRpc } from '@/lib/bi/filtros';
import { horaCorte, periodoAnterior } from '@/lib/bi/comparacion';
import { aFiltrosBi, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import { json } from '@/lib/sucursales/rutas';
import type { RespuestaKpis, RpcKpis, RpcOpciones } from '@/lib/bi/tipos';

export const runtime = 'nodejs';

/**
 * KPI del periodo anterior para la comparación del tablero (spec 2026-11-19-bi-estilo-metabase §2 y §5): mismos
 * filtros y tiendas que /api/bi/tablero; si el periodo termina hoy, el último día se recorta a la hora del corte.
 */
export async function GET(req: Request) {
  const a = await accesoBi();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const hoy = hoyMexico(new Date());
  const f = leerUrl(new URL(req.url).searchParams);
  const periodo = resolverPeriodo(f, hoy);
  if (!periodo.ok) return json({ error: periodo.error }, 400);
  if (f.semanas.length) return json<RespuestaKpis>({ sinComparacion: 'semanas' });
  const actual = { desde: periodo.desde, hasta: periodo.hasta };
  const anterior = periodoAnterior(f.fr, actual);
  const o = await a.db.rpc('bi_opciones', { p: actual });
  if (o.error || !o.data) {
    console.error('[bi] opciones (kpis)', o.error);
    return json({ error: 'No se pudo leer la comparación.' }, 503);
  }
  const opciones = o.data as unknown as RpcOpciones;
  const conAcceso = opciones.tiendas.map((t) => t.company_id);
  const companias = f.companias.length ? f.companias.filter((c) => conAcceso.includes(c)) : conAcceso;
  const hora = horaCorte(opciones.ultimo_corte, actual.hasta, hoy);
  if (!companias.length) return json<RespuestaKpis>({ periodo: anterior, horaCorte: hora, kpis: null, cargas: null });
  const k = await a.db.rpc('bi_kpis', {
    p: aJsonRpc(aFiltrosBi(f, anterior, companias, hoy)) as Json,
    p_hora_corte: hora,
  });
  if (k.error || !k.data) {
    console.error('[bi] kpis', k.error);
    return json({ error: 'No se pudo leer la comparación.' }, 503);
  }
  const r = k.data as unknown as RpcKpis;
  return json<RespuestaKpis>({ periodo: anterior, horaCorte: hora, kpis: r.kpis, cargas: r.cargas });
}
