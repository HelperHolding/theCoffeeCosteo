import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { SEMANAS_PERMITIDAS, hoyLocal } from '@/lib/sucursales/datos';
import { diaLunes } from '@/lib/sucursales/metricas';
import { armarHoy, armarPeriodo, armarRango, type RpcHoy, type RpcPeriodo } from '@/lib/sucursales/resumen';
import { json } from '@/lib/sucursales/rutas';
import { leerConsulta } from '@/lib/sucursales/tablero-fechas';
import { sumarDias } from '@/lib/sucursales/tiempo';
import type { TableroMexico } from '@/lib/sucursales/contratos';

export const runtime = 'nodejs';

/**
 * Tablero de México (docs/sucursales/16): solo lee los totales que guarda el corte, de las sucursales asignadas Y
 * configuradas del usuario (sucursales_acceso en la base, además del filtro aquí). Nunca lee pedidos.
 * Sin fechas es hoy en vivo; con `dia` es un día cerrado y con `desde` y `hasta`, un rango de días cerrados.
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const q = new URL(req.url).searchParams;
  const semanas = Number(q.get('semanas') ?? '8');
  if (!(SEMANAS_PERMITIDAS as readonly number[]).includes(semanas))
    return json({ error: 'Semanas: 4, 8 o 12.' }, 400);

  const hoys = sucursales.map((s) => hoyLocal(s).fecha);
  // Último día cerrado en todas las zonas: el anterior al «hoy» más temprano.
  const consulta = leerConsulta(
    q,
    sumarDias(
      hoys.reduce((m, f) => (f < m ? f : m)),
      -1,
    ),
  );
  if ('error' in consulta) return json({ error: consulta.error }, 400);

  // Semanas completas (lunes a domingo) hasta el domingo pasado, en la fecha de la Ciudad de México.
  const hoy = hoys.reduce((m, f) => (f > m ? f : m));
  const lunes = sumarDias(hoy, -diaLunes(hoy));
  const hasta = sumarDias(lunes, -1);
  const desde = sumarDias(lunes, -7 * semanas);
  const companias = sucursales.map((s) => s.companyId);
  const periodo = (d: string, h: string) =>
    a.db.rpc('sucursales_tablero_periodo', { p_companias: companias, p_desde: d, p_hasta: h });
  const [h, p, r, rp] = await Promise.all([
    consulta.modo === 'rango'
      ? null
      : a.db.rpc('sucursales_tablero_hoy', {
          p_companias: companias,
          p_hoys: consulta.modo === 'dia' ? companias.map(() => consulta.dia) : hoys,
        }),
    periodo(desde, hasta),
    consulta.modo === 'rango' ? periodo(consulta.desde, consulta.hasta) : null,
    consulta.modo === 'rango' ? periodo(consulta.previoDesde, consulta.previoHasta) : null,
  ]);
  const fallo = [h, p, r, rp].find((x) => x && (x.error || !x.data));
  if (fallo) {
    console.error('[sucursales] tablero', fallo.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  const base = {
    generadoEn: new Date().toISOString(),
    semanas,
    periodo: armarPeriodo(p.data as unknown as RpcPeriodo, desde, hasta, sucursales),
  };
  if (consulta.modo === 'rango') {
    const actual = armarPeriodo(r!.data as unknown as RpcPeriodo, consulta.desde, consulta.hasta, sucursales);
    const previo = armarPeriodo(
      rp!.data as unknown as RpcPeriodo,
      consulta.previoDesde,
      consulta.previoHasta,
      sucursales,
    );
    return json<TableroMexico>({
      ...base,
      modo: 'rango',
      rango: {
        desde: consulta.desde,
        hasta: consulta.hasta,
        previoDesde: consulta.previoDesde,
        previoHasta: consulta.previoHasta,
        dias: actual.dias,
        diasPrevio: previo.dias,
        productos: actual.productos,
        diasLeidos: actual.diasLeidos,
        incompletos: actual.incompletos,
      },
      hoy: armarRango(actual, previo, sucursales),
    });
  }
  return json<TableroMexico>({
    ...base,
    modo: consulta.modo,
    ...(consulta.modo === 'dia' ? { fecha: consulta.dia } : {}),
    hoy: armarHoy(h!.data as unknown as RpcHoy, sucursales),
  });
}
