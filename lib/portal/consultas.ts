import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '../supabase/database.types';
export type Db = SupabaseClient<Database>;
type Fuente = keyof Database['public']['Tables'] | keyof Database['public']['Views'];
type Fila<T extends Fuente> = T extends keyof Database['public']['Tables']
  ? Database['public']['Tables'][T]['Row']
  : T extends keyof Database['public']['Views']
    ? Database['public']['Views'][T]['Row']
    : never;
/** Filas por página: igual a `max_rows` de PostgREST (supabase/config.toml, y medido en producción). */
export const POR_PAGINA = 1000;

/**
 * Lee una consulta completa sin el tope silencioso de PostgREST (`max_rows` = 1,000, aunque se pida `.limit(20000)`).
 * Pide `lote` páginas a la vez, en paralelo, hasta la primera página corta. `pagina` debe ordenar por una llave
 * única; si no, las páginas pueden repetir o saltar filas.
 */
export async function leerPaginas<R>(
  pagina: (desde: number, hasta: number) => PromiseLike<{ data: unknown; error: unknown }>,
  {
    lote = 4,
    error = 'No se pudo consultar la base. Intenta de nuevo.',
  }: { lote?: number; error?: string } = {},
): Promise<R[]> {
  const filas: R[] = [];
  for (let base = 0; ; base += POR_PAGINA * lote) {
    const respuestas = await Promise.all(
      Array.from({ length: lote }, (_, i) => {
        const desde = base + i * POR_PAGINA;
        return pagina(desde, desde + POR_PAGINA - 1);
      }),
    );
    for (const r of respuestas) {
      if (r.error) throw new Error(error);
      const datos = (r.data ?? []) as R[];
      filas.push(...datos);
      if (datos.length < POR_PAGINA) return filas;
    }
  }
}

// Orden estable y páginas en paralelo (de dos en dos: en vistas calculadas cada página recalcula la vista).
// `igual` filtra en la base (columna = valor): en vistas como v_resumen evita recalcular todos los productos.
export async function todas<T extends Fuente>(
  db: Db,
  tabla: T,
  orden: string,
  igual: Record<string, string> = {},
): Promise<Fila<T>[]> {
  return leerPaginas<Fila<T>>(
    (desde, hasta) => {
      // La sobrecarga del SDK separa tablas/vistas; Fuente limita los nombres válidos.
      let q = db.from(tabla as keyof Database['public']['Tables']).select('*');
      for (const [columna, valor] of Object.entries(igual)) q = q.eq(columna as never, valor as never);
      for (const campo of orden.split(',')) q = q.order(campo);
      return q.range(desde, hasta);
    },
    { lote: 2, error: `No se pudo consultar ${tabla}. Intenta de nuevo.` },
  );
}
// Solo para mostrar: los textos que vienen de la base se leen en mayúsculas sin cambiar lo guardado.
export const mayusculas = (s: string) => s.toLocaleUpperCase('es');
export const dinero = (n: number | null) =>
  n === null
    ? 'Sin precio'
    : new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(n);
export const porcentaje = (n: number | null) =>
  n === null ? '—' : new Intl.NumberFormat('es-MX', { style: 'percent', maximumFractionDigits: 1 }).format(n);
