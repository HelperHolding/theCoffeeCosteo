// supabase/functions/_shared/compras/zohoCompras.ts
// Solo Edge: lectura incremental de Zoho por last_modified_time, con tope de detalles y de tiempo por corrida.
import type { ZohoClient } from "../zoho.ts";

// deno-lint-ignore no-explicit-any
type J = any;
export const LIMITE_DETALLES = 60;
const LOTE = 4;
const PAUSA_MS = 4000;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const t = (x: J) => Date.parse(String(x?.last_modified_time ?? "")) || 0;

/** Marca incremental: el último last_modified_time procesado y los ids ya procesados en ese mismo segundo (empates). */
export type Marca = { t: string | null; ids: string[] };

export function pendientesDesde(lista: J[], marca: Marca, idKey: string): J[] {
  const corte = marca.t ? Date.parse(marca.t) : -Infinity;
  const hechos = new Set(marca.ids);
  return lista
    .filter((x) => t(x) > corte || (t(x) === corte && !hechos.has(String(x[idKey]))))
    .sort((a, b) => t(a) - t(b));
}

/** Siempre con date_start (el periodo guardado) y ordenado por modificación, del más reciente al más viejo (verificado en Zoho). */
export async function leerModificados(z: ZohoClient, path: "/purchaseorders" | "/invoices", key: "purchaseorders" | "invoices",
  marca: Marca, inicio: string, idKey: string): Promise<J[]> {
  const params: Record<string, string> = { date_start: inicio, sort_column: "last_modified_time", sort_order: "D" };
  if (!marca.t) return pendientesDesde(await z.listAll<J>(path, key, params), marca, idKey);
  const corte = Date.parse(marca.t);
  const out: J[] = [];
  for (let page = 1; ; page++) {
    const j = await z.get<Record<string, unknown>>(path, { ...params, page: String(page), per_page: "200" });
    const filas = (j[key] as J[]) ?? [];
    out.push(...filas);
    // Se para solo al ver algo anterior a la marca (no igual): los empates del segundo de la marca siguen en la lista.
    const cruzo = filas.some((x) => t(x) < corte);
    if (cruzo || !(j.page_context as { has_more_page?: boolean } | undefined)?.has_more_page) break;
  }
  return pendientesDesde(out, marca, idKey);
}

export type Lote<T> = { filas: T[]; omitidos: string[]; marca: Marca | null; pendientes: boolean; error: string | null };
type Opciones = { pausa?: (ms: number) => Promise<void>; limite?: number; reloj?: () => number };

/**
 * Lee en serie (la marca avanza en orden estricto); 4 s de pausa cada 4 detalles ≈ 50–60 llamadas por minuto.
 * Se detiene al llegar al cupo, al pasar el tiempo límite o en el primer error que no sea 404 (documento borrado: se salta).
 */
export async function detallar<T>(xs: J[], cupo: number, idKey: string, leer: (x: J) => Promise<T>, op: Opciones = {}): Promise<Lote<T>> {
  const pausa = op.pausa ?? dormir;
  const reloj = op.reloj ?? Date.now;
  const inicio = reloj();
  const toma = xs.slice(0, cupo);
  const filas: T[] = [];
  const omitidos: string[] = [];
  let marca: Marca | null = null;
  const avanzar = (x: J) => {
    const tx = String(x.last_modified_time);
    marca = marca && marca.t === tx ? { t: tx, ids: [...marca.ids, String(x[idKey])] } : { t: tx, ids: [String(x[idKey])] };
  };
  for (let i = 0; i < toma.length; i++) {
    if (op.limite != null && reloj() - inicio >= op.limite) return { filas, omitidos, marca, pendientes: true, error: null };
    if (i > 0 && i % LOTE === 0) await pausa(PAUSA_MS);
    const x = toma[i];
    try {
      filas.push(await leer(x));
      avanzar(x);
    } catch (e) {
      if ((e as { status?: number })?.status === 404) { omitidos.push(String(x[idKey])); avanzar(x); continue; }
      return { filas, omitidos, marca, pendientes: true, error: String((e as Error)?.message ?? e) };
    }
  }
  return { filas, omitidos, marca, pendientes: xs.length > toma.length, error: null };
}
