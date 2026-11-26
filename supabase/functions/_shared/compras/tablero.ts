// supabase/functions/_shared/compras/tablero.ts
// Cálculo puro del tablero de compras (spec compras §3). Sin Deno ni Supabase: el portal y la descarga (fase 4) lo importan.
import { type Categoria, type FilaOc, type PorCategoria } from "./reglas.ts";
import { dif, enRango, finSemana, lunesDe, sumar } from "../reporte/fechas.ts";

export type Cat = Exclude<Categoria, "otros">;
export type FiltrosCompras = { periodo: string; categoria: Cat | null; proveedor: string | null; comprador: string | null };
export type OcT = Pick<FilaOc, "zoho_po_id" | "folio" | "proveedor" | "comprador" | "emision" | "arribo" | "estado" | "received_status" | "monto_ins" | "por_categoria" | "es_registro">;
export type RecT = { zoho_po_id: string; fecha: string; monto: number; por_categoria: PorCategoria };
export type VentaT = { semana: string; venta_total_ci: number; por_categoria_ci: PorCategoria };
export type LineaAbierta = { zoho_po_id: string; sku: string; nombre: string; pendiente: number };
export type DatosCompras = { ocs: OcT[]; recepciones: RecT[]; ventas: VentaT[]; lineas: LineaAbierta[] };
export type Periodo = { clave: string; tipo: "semana" | "mes"; etiqueta: string; lunes: string[]; ini: string; fin: string };
export type Semaforo = "ok" | "cerca" | "fuera";
export type Indicadores = {
  venta: number; compras: number; ratio: number | null; semaforo: Semaforo | null;
  llegaron: { n: number; mismas: number; antes: number };
  entregas: { aTiempo: number; tarde: number; sinFecha: number; pct: number | null };
  lead: number | null;
  mayor: { proveedor: string; monto: number } | null;
};
export type FilaProveedor = { proveedor: string; ocs: number; monto: number; registro: number; recibidas: number; aTiempo: number; atrasadas: number; pendVencidas: number; pendEnPlazo: number; lead: number | null };
export type OcPorLlegar = { folio: string; proveedor: string; arribo: string | null; estado: "Vencida" | "En plazo" | "Sin fecha"; monto: number; articulos: { sku: string; nombre: string; pendiente: number }[] };
export type PuntoSerie = { semana: string; venta: number; compras: number; presupuesto: number };
export type TableroCompras = {
  periodo: Periodo; anterior: Periodo; filtros: FiltrosCompras; hoy: string;
  k: Indicadores; kAnt: Indicadores;
  vencidas: { n: number; monto: number };
  porLlegar: OcPorLlegar[]; proveedores: FilaProveedor[]; serie: PuntoSerie[];
  /** Folios de OCs cuyo recibido en el periodo se contó con el respaldo de recepciones (ver recepcionesSinDetalle). */
  sinDetalle: string[];
  opciones: { periodos: Periodo[]; proveedores: string[]; compradores: string[] };
};

export const ETIQUETA_CAT: Record<Cat, string> = {
  CAF: "Café", BEB: "Bebidas", DES: "Desechables", DEL: "Delivery", BA: "Barra (incluye bases frappé)", LIM: "Limpieza", FOD: "Foods", RTD: "RTD",
};
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const MES_CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const r1 = (x: number) => Math.round(x * 10) / 10;
const dia = (iso: string) => `${Number(iso.slice(8, 10))} ${MES_CORTO[Number(iso.slice(5, 7)) - 1]}`;

function semana(lunes: string): Periodo {
  const fin = finSemana(lunes);
  return { clave: lunes, tipo: "semana", etiqueta: `${dia(lunes)} – ${dia(fin)} ${fin.slice(0, 4)}`, lunes: [lunes], ini: lunes, fin };
}
function mes(clave: string): Periodo {
  const primero = `${clave}-01`;
  let l = lunesDe(primero);
  if (l < primero) l = sumar(l, 7);
  const lunes: string[] = [];
  for (; l.slice(0, 7) === clave; l = sumar(l, 7)) lunes.push(l);
  const m = Number(clave.slice(5, 7));
  const etiqueta = `${MESES[m - 1][0].toUpperCase()}${MESES[m - 1].slice(1)} ${clave.slice(0, 4)}`;
  return { clave, tipo: "mes", etiqueta, lunes, ini: lunes[0], fin: finSemana(lunes[lunes.length - 1]) };
}

export function periodoDe(clave: string | null | undefined, hoy: string): Periodo {
  const c = String(clave ?? "");
  if (/^\d{4}-(0[1-9]|1[0-2])$/.test(c)) return mes(c);
  if (/^\d{4}-\d{2}-\d{2}$/.test(c) && !Number.isNaN(Date.parse(`${c}T00:00:00Z`))) return semana(lunesDe(c));
  return semana(sumar(lunesDe(hoy), -7));
}
export function periodoAnterior(p: Periodo): Periodo {
  if (p.tipo === "semana") return semana(sumar(p.ini, -7));
  const [a, m] = p.clave.split("-").map(Number);
  return mes(m === 1 ? `${a - 1}-12` : `${a}-${String(m - 1).padStart(2, "0")}`);
}
export function periodos(semanas: string[]): Periodo[] {
  const ls = [...new Set(semanas)].sort().reverse();
  const meses = [...new Set(ls.map((l) => l.slice(0, 7)))];
  return [...ls.map(semana), ...meses.map(mes)];
}

export function semaforo(ratio: number | null): Semaforo | null {
  if (ratio == null) return null;
  const r = Math.round(ratio * 1e4) / 1e4;
  if (r >= 0.45 && r <= 0.55) return "ok";
  if (r >= 0.4 && r <= 0.6) return "cerca";
  return "fuera";
}

const valida = (o: OcT) => o.estado !== "draft" && o.estado !== "cancelled";
const pasa = (o: OcT, f: FiltrosCompras) =>
  valida(o) && (!f.proveedor || o.proveedor === f.proveedor) && (!f.comprador || o.comprador === f.comprador) &&
  (!f.categoria || (o.por_categoria[f.categoria] ?? 0) > 0);
const montoCat = (pc: PorCategoria, total: number, cat: Cat | null) => (cat ? pc[cat] ?? 0 : total);

function primeras(d: DatosCompras): Map<string, string> {
  const m = new Map<string, string>();
  for (const r of d.recepciones) { const ya = m.get(r.zoho_po_id); if (!ya || r.fecha < ya) m.set(r.zoho_po_id, r.fecha); }
  return m;
}
function comprasPorProveedor(d: DatosCompras, f: FiltrosCompras, ini: string, fin: string): Map<string, number> {
  const ocs = new Map(d.ocs.filter((o) => pasa(o, f) && !o.es_registro).map((o) => [o.zoho_po_id, o]));
  const m = new Map<string, number>();
  for (const r of d.recepciones) {
    const o = ocs.get(r.zoho_po_id);
    if (!o || !enRango(r.fecha, ini, fin)) continue;
    m.set(o.proveedor, (m.get(o.proveedor) ?? 0) + montoCat(r.por_categoria, r.monto, f.categoria));
  }
  return m;
}
function venta(d: DatosCompras, f: FiltrosCompras, lunes: string[]): number {
  const s = new Set(lunes);
  return d.ventas.filter((v) => s.has(v.semana)).reduce((a, v) => a + montoCat(v.por_categoria_ci, v.venta_total_ci, f.categoria), 0);
}

export function indicadores(d: DatosCompras, f: FiltrosCompras, p: Periodo): Indicadores {
  const porProv = comprasPorProveedor(d, f, p.ini, p.fin);
  const compras = [...porProv.values()].reduce((a, x) => a + x, 0);
  const v = venta(d, f, p.lunes);
  const ratio = v > 0 ? compras / v : null;
  const prim = primeras(d);
  const llegadas = d.ocs.filter((o) => pasa(o, f) && !o.es_registro && enRango(prim.get(o.zoho_po_id) ?? "", p.ini, p.fin));
  const mismas = llegadas.filter((o) => o.emision >= p.ini).length;
  let aTiempo = 0, tarde = 0, sinFecha = 0, lead = 0;
  for (const o of llegadas) {
    const pr = prim.get(o.zoho_po_id)!;
    lead += dif(o.emision, pr);
    if (!o.arribo) sinFecha++; else if (pr <= o.arribo) aTiempo++; else tarde++;
  }
  let mayor: Indicadores["mayor"] = null;
  for (const [proveedor, monto] of porProv) if (monto > 0 && (!mayor || monto > mayor.monto)) mayor = { proveedor, monto };
  return {
    venta: v, compras, ratio, semaforo: semaforo(ratio),
    llegaron: { n: llegadas.length, mismas, antes: llegadas.length - mismas },
    entregas: { aTiempo, tarde, sinFecha, pct: aTiempo + tarde ? aTiempo / (aTiempo + tarde) : null },
    lead: llegadas.length ? r1(lead / llegadas.length) : null,
    mayor,
  };
}

/** Sigue esperando mercancía: no recibida y no cerrada a mano en Zoho. Un solo criterio para vencidas, por llegar y pendientes. */
const abierta = (o: OcT) => o.received_status !== "received" && o.estado !== "closed";

/** Primera sincronización incompleta: sin OCs o sin venta guardada, el tablero saldría en ceros (spec §5). */
export const faltanDatos = (d: DatosCompras) => d.ocs.length === 0 || d.ventas.length === 0;

/**
 * OCs cuyo recibido se contó con el respaldo (Zoho no dio el detalle de cada recepción): varias recepciones,
 * todas en 0 salvo una, y esa cae en el periodo. Sus compras recibidas pueden estar en la semana equivocada.
 */
export function recepcionesSinDetalle(d: DatosCompras, p: Periodo): string[] {
  const porOc = new Map<string, RecT[]>();
  for (const r of d.recepciones) porOc.set(r.zoho_po_id, [...(porOc.get(r.zoho_po_id) ?? []), r]);
  const folio = new Map(d.ocs.map((o) => [o.zoho_po_id, o.folio]));
  const out: string[] = [];
  for (const [id, rs] of porOc) {
    const con = rs.filter((r) => r.monto !== 0);
    if (rs.length > 1 && con.length === 1 && enRango(con[0].fecha, p.ini, p.fin)) out.push(folio.get(id) ?? id);
  }
  return out.sort();
}

export function vencidas(d: DatosCompras, f: FiltrosCompras, hoy: string) {
  const xs = d.ocs.filter((o) => pasa(o, f) && !o.es_registro && abierta(o) && !!o.arribo && o.arribo < hoy);
  return { n: xs.length, monto: xs.reduce((a, o) => a + montoCat(o.por_categoria, o.monto_ins, f.categoria), 0) };
}

export function porLlegar(d: DatosCompras, f: FiltrosCompras, hoy: string): OcPorLlegar[] {
  const lineas = new Map<string, LineaAbierta[]>();
  for (const l of d.lineas) if (l.pendiente > 0) lineas.set(l.zoho_po_id, [...(lineas.get(l.zoho_po_id) ?? []), l]);
  return d.ocs
    .filter((o) => pasa(o, f) && !o.es_registro && abierta(o))
    .map((o): OcPorLlegar => ({
      folio: o.folio, proveedor: o.proveedor, arribo: o.arribo,
      estado: !o.arribo ? "Sin fecha" : o.arribo < hoy ? "Vencida" : "En plazo",
      monto: montoCat(o.por_categoria, o.monto_ins, f.categoria),
      articulos: (lineas.get(o.zoho_po_id) ?? []).map(({ sku, nombre, pendiente }) => ({ sku, nombre, pendiente })),
    }))
    .sort((a, b) => (a.arribo ?? "9999").localeCompare(b.arribo ?? "9999") || a.folio.localeCompare(b.folio));
}

export function proveedores(d: DatosCompras, f: FiltrosCompras, p: Periodo, hoy: string): FilaProveedor[] {
  const prim = primeras(d);
  const m = new Map<string, FilaProveedor & { leadSuma: number }>();
  for (const o of d.ocs) {
    if (!pasa(o, f) || !enRango(o.emision, p.ini, p.fin)) continue;
    const x = m.get(o.proveedor) ?? { proveedor: o.proveedor, ocs: 0, monto: 0, registro: 0, recibidas: 0, aTiempo: 0, atrasadas: 0, pendVencidas: 0, pendEnPlazo: 0, lead: null, leadSuma: 0 };
    m.set(o.proveedor, x);
    if (o.es_registro) { x.registro++; continue; }
    x.ocs++;
    x.monto += montoCat(o.por_categoria, o.monto_ins, f.categoria);
    const pr = prim.get(o.zoho_po_id);
    if (pr) {
      x.recibidas++;
      x.leadSuma += dif(o.emision, pr);
      if (o.arribo && pr <= o.arribo) x.aTiempo++;
      else if (o.arribo) x.atrasadas++;
    } else if (!abierta(o)) continue;
    else if (o.arribo && o.arribo < hoy) x.pendVencidas++;
    else x.pendEnPlazo++;
  }
  return [...m.values()]
    .map(({ leadSuma, ...x }) => ({ ...x, lead: x.recibidas ? r1(leadSuma / x.recibidas) : null }))
    .sort((a, b) => b.monto - a.monto || a.proveedor.localeCompare(b.proveedor, "es"));
}

export function serie(d: DatosCompras, f: FiltrosCompras, p: Periodo, n = 16): PuntoSerie[] {
  const ultimo = p.lunes[p.lunes.length - 1];
  return Array.from({ length: n }, (_, i) => sumar(ultimo, -7 * (n - 1 - i))).map((l) => {
    const v = venta(d, f, [l]);
    const c = [...comprasPorProveedor(d, f, l, finSemana(l)).values()].reduce((a, x) => a + x, 0);
    return { semana: l, venta: v, compras: c, presupuesto: v * 0.5 };
  });
}

const unicos = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
export function armarTablero(d: DatosCompras, f: FiltrosCompras, hoy: string): TableroCompras {
  const periodo = periodoDe(f.periodo, hoy);
  const anterior = periodoAnterior(periodo);
  const validas = d.ocs.filter(valida);
  return {
    periodo, anterior, filtros: { ...f, periodo: periodo.clave }, hoy,
    k: indicadores(d, f, periodo), kAnt: indicadores(d, f, anterior),
    vencidas: vencidas(d, f, hoy),
    porLlegar: porLlegar(d, f, hoy),
    proveedores: proveedores(d, f, periodo, hoy),
    serie: serie(d, f, periodo),
    sinDetalle: recepcionesSinDetalle(d, periodo),
    opciones: { periodos: periodos(d.ventas.map((v) => v.semana)), proveedores: unicos(validas.map((o) => o.proveedor)), compradores: unicos(validas.map((o) => o.comprador)) },
  };
}
