// supabase/functions/_shared/compras/zohoCompras.ts
// Solo Edge: lectura incremental de Zoho por last_modified_time, con tope de detalles por corrida (cuota compartida).
import type { ZohoClient } from "../zoho.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const LIMITE_DETALLES = 60;
const LOTE = 4;
const PAUSA_MS = 4000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const t = (x: J) => Date.parse(String(x?.last_modified_time ?? "")) || 0;

export function pendientesDesde(lista: J[], desde: string | null): J[] {
  const corte = desde ? Date.parse(desde) : -Infinity;
  return lista.filter((x) => t(x) > corte).sort((a, b) => t(a) - t(b));
}

export async function leerModificados(z: ZohoClient, path: "/purchaseorders" | "/invoices", key: "purchaseorders" | "invoices",
  desde: string | null, inicio: string): Promise<J[]> {
  // Sin marca: todo desde la fecha de inicio. Con marca: lo más reciente primero hasta cruzar la marca.
  const params: Record<string, string> = desde
    ? { sort_column: "last_modified_time", sort_order: "D" }
    : { date_start: inicio, sort_column: "last_modified_time", sort_order: "D" };
  if (!desde) return pendientesDesde(await z.listAll<J>(path, key, params), null);
  const out: J[] = [];
  for (let page = 1; ; page++) {
    const j = await z.get<Record<string, unknown>>(path, { ...params, page: String(page), per_page: "200" });
    const filas = (j[key] as J[]) ?? [];
    out.push(...filas);
    const cruzo = filas.some((x) => t(x) <= Date.parse(desde));
    if (cruzo || !(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page) break;
  }
  return pendientesDesde(out, desde);
}

export type Lote<T> = { filas: T[]; marca: string | null; pendientes: boolean; error: string | null };

/** Lee en serie (la marca avanza en orden estricto); 4 s de pausa cada 4 detalles ≈ 50–60 llamadas por minuto. */
export async function detallar<T>(xs: J[], cupo: number, leer: (x: J) => Promise<T>, pausa: (ms: number) => Promise<void> = dormir): Promise<Lote<T>> {
  const toma = xs.slice(0, cupo);
  const filas: T[] = [];
  let marca: string | null = null;
  for (let i = 0; i < toma.length; i += LOTE) {
    if (i > 0) await pausa(PAUSA_MS);
    for (const x of toma.slice(i, i + LOTE)) {
      try {
        filas.push(await leer(x));
        marca = String(x.last_modified_time);
      } catch (e) {
        return { filas, marca, pendientes: true, error: String((e as Error)?.message ?? e) };
      }
    }
  }
  return { filas, marca, pendientes: xs.length > toma.length, error: null };
}
