import 'server-only';
import { difDias, masDias } from './fechas';
import type { ResumenProyeccion } from './tipos';

// Plan 3, decisión 8: las tablas com_* no están en database.types; se leen sin tipos y se tipan por pantalla.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type SinTipos = { from: (tabla: string) => any; rpc: (fn: string, args?: object) => any };
export const com = (db: unknown) => db as SinTipos;

/** Lee todas las filas en páginas de 1000 (PostgREST corta en 1000). `orden` debe ser una columna única o estable. */
export async function leerTodoCom<R>(
  db: unknown,
  tabla: string,
  columnas: string,
  orden: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  filtro?: (q: any) => any,
): Promise<R[]> {
  const filas: R[] = [];
  for (let desde = 0; ; desde += 1000) {
    let q = com(db).from(tabla).select(columnas).order(orden);
    if (filtro) q = filtro(q);
    const r = await q.range(desde, desde + 999);
    if (r.error) throw new Error('No se pudieron leer los datos de Comercializadora. Intenta de nuevo.');
    filas.push(...(r.data as R[]));
    if (r.data.length < 1000) return filas;
  }
}

/** Última corrida buena de la proyección (com-minmax registra 'com-proyeccion' con calculado_at en el resumen). */
export async function ultimaProyeccion(
  db: unknown,
): Promise<{ inicio: string; resumen: ResumenProyeccion } | null> {
  const r = await com(db)
    .from('com_sync_log')
    .select('inicio,resumen')
    .eq('proceso', 'com-proyeccion')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(1);
  if (r.error) throw new Error('No se pudo leer la proyección. Intenta de nuevo.');
  const fila = r.data?.[0];
  return fila?.resumen?.calculado_at ? { inicio: fila.inicio, resumen: fila.resumen } : null;
}

export const edadHoras = (iso: string, ahora: Date = new Date()) =>
  (ahora.getTime() - new Date(iso).getTime()) / 36e5;

export interface AvisoCierre {
  id: number;
  vendor_name: string;
  ini: string;
  fin: string;
  u: string | null;
}

/** Cierres no cancelados que no han terminado, con su último día para pedir de la última proyección (_cieAvisos). */
export async function cierresVigentes(
  db: unknown,
  hoy: string,
  resumen: ResumenProyeccion | null,
): Promise<AvisoCierre[]> {
  const r = await com(db)
    .from('com_proveedor_cierre')
    .select('id,vendor_name,ini,fin')
    .eq('cancelado', false)
    .gte('fin', hoy)
    .order('ini');
  if (r.error) throw new Error('No se pudieron leer los proveedores sin stock. Intenta de nuevo.');
  const porId = new Map((resumen?.cierres ?? []).map((c) => [c.id, c]));
  return (r.data as Omit<AvisoCierre, 'u'>[]).map((c) => {
    const s = porId.get(c.id);
    let u = s?.u ? String(s.u).slice(0, 10) : null;
    // _cieAvisos: si las fechas se movieron después de la última corrida, el último día se recorre igual que ini.
    if (u && s?.ini && s.ini.slice(0, 10) !== c.ini.slice(0, 10))
      u = masDias(u, difDias(s.ini.slice(0, 10), c.ini.slice(0, 10)));
    return { ...c, u };
  });
}
