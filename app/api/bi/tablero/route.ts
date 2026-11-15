import type { Json } from '@/lib/supabase/database.types';
import { accesoBi } from '@/lib/supabase/sesion';
import { aJsonRpc } from '@/lib/bi/filtros';
import { aFiltrosBi, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import { json } from '@/lib/sucursales/rutas';
import type { RespuestaTablero, RpcOpciones, RpcTablero } from '@/lib/bi/tipos';

export const runtime = 'nodejs';

/**
 * Tablero «The Coffee México» (docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md §3): filtros de la URL,
 * hoy en CDMX y solo las tiendas con bi_acceso (la base lo vuelve a exigir).
 */
export async function GET(req: Request) {
  const a = await accesoBi();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const hoy = hoyMexico(new Date());
  const f = leerUrl(new URL(req.url).searchParams);
  const periodo = resolverPeriodo(f, hoy);
  if (!periodo.ok) return json({ error: periodo.error }, 400);
  const p = { desde: periodo.desde, hasta: periodo.hasta };
  const o = await a.db.rpc('bi_opciones', { p });
  if (o.error || !o.data) {
    console.error('[bi] opciones', o.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  const opciones = o.data as unknown as RpcOpciones;
  const conAcceso = opciones.tiendas.map((t) => t.company_id);
  const companias = f.companias.length ? f.companias.filter((c) => conAcceso.includes(c)) : conAcceso;
  if (!companias.length) return json<RespuestaTablero>({ periodo: p, hoy, tablero: null, opciones });
  const t = await a.db.rpc('bi_tablero', { p: aJsonRpc(aFiltrosBi(f, p, companias, hoy)) as Json });
  if (t.error || !t.data) {
    console.error('[bi] tablero', t.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  return json<RespuestaTablero>({ periodo: p, hoy, tablero: t.data as unknown as RpcTablero, opciones });
}
