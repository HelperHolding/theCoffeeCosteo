import { type SupabaseClient, todo } from "./db.ts";
import { difDias, sumarDias } from "./fechas.ts";

export type Cierre = { id: number; vendor_id: string; vendor_name?: string; ini: string; fin: string; skus: string[] | null;
  cancelado: boolean; aviso7_at?: string | null; aviso0_at?: string | null };
export type Periodo = { id: number; ini: string; fin: string };
export type Cobertura = { periodo: Periodo; dia: string; R: string; U: string; tarde: boolean };

const lt0 = (lt: number) => Math.max(0, Math.ceil(Number.isFinite(lt) ? lt : 0));

export function aplica(c: Cierre, sku: string, vendorId: string | null): boolean {
  if (!vendorId || c.vendor_id !== vendorId) return false;
  return !c.skus || c.skus.length === 0 || c.skus.includes(sku);
}

/** Periodos vigentes (no cancelados, fin ≥ hoy) que aplican al artículo, ordenados y fusionados si se traslapan o se tocan. */
export function periodosDe(cierres: Cierre[], sku: string, vendorId: string | null, hoy: string): Periodo[] {
  const ps = cierres.filter((c) => !c.cancelado && c.fin >= hoy && aplica(c, sku, vendorId))
    .map((c) => ({ id: c.id, ini: c.ini.slice(0, 10), fin: c.fin.slice(0, 10) }))
    .sort((a, b) => a.ini.localeCompare(b.ini) || a.id - b.id);
  const out: Periodo[] = [];
  for (const p of ps) {
    const u = out[out.length - 1];
    if (u && p.ini <= sumarDias(u.fin, 1)) { if (p.fin > u.fin) u.fin = p.fin; } else out.push({ ...p });
  }
  return out;
}

export function cerradoEn(ps: Periodo[], fecha: string): Periodo | null {
  return ps.find((p) => fecha >= p.ini && fecha <= p.fin) ?? null;
}

/** Una entrega que cae en un cierre se recorre al día que reabre. */
export function llegadaAjustada(ps: Periodo[], fecha: string): string {
  const p = cerradoEn(ps, fecha);
  return p ? sumarDias(p.fin, 1) : fecha;
}

/** Último día en que una compra todavía llega antes del cierre. */
export function ultimoDiaPedido(ini: string, lt: number): string {
  return sumarDias(ini, -lt0(lt) - 1);
}

/**
 * Día de compra efectivo de cada periodo (mismo orden que `ps`; null = sin cobertura).
 * Normalmente es U, o hoy si U ya pasó. Si ese día cae dentro de un periodo anterior q (dos cierres a menos de un
 * lead time), la compra se adelanta al día efectivo de q: una sola compra antes del primer cierre llega hasta el R
 * del segundo. Si q tampoco tiene día (hoy está dentro de q), el periodo queda sin cobertura y la regla normal
 * retoma al reabrir.
 */
function diasEfectivos(ps: Periodo[], hoy: string, lt: number): (string | null)[] {
  const dias: (string | null)[] = [];
  for (const [i, p] of ps.entries()) {
    const U = ultimoDiaPedido(p.ini, lt);
    let dia: string | null = U < hoy ? hoy : U;
    const q = cerradoEn(ps, dia);
    if (q) {
      const k = ps.indexOf(q);
      dia = k >= 0 && k < i ? dias[k] : null; // q === p (hoy dentro del propio periodo) → sin cobertura
    }
    dias.push(dia);
  }
  return dias;
}

/**
 * Compras de cobertura: a lo más una por día. Cada periodo compra en su día efectivo (ver `diasEfectivos`).
 * Si dos periodos caen el mismo día queda una sola entrada con el R más tardío; `periodo` y `U` son los del
 * periodo posterior y `tarde` es true si cualquiera de los dos lo era.
 */
export function coberturas(ps: Periodo[], hoy: string, lt: number): Cobertura[] {
  const dias = diasEfectivos(ps, hoy, lt);
  const porDia = new Map<string, Cobertura>();
  for (const [i, p] of ps.entries()) {
    const dia = dias[i];
    if (dia == null) continue;
    const U = ultimoDiaPedido(p.ini, lt);
    const c: Cobertura = { periodo: p, dia, U, R: sumarDias(p.fin, 1 + lt0(lt)), tarde: dia > U };
    const prev = porDia.get(dia);
    if (prev) c.tarde = c.tarde || prev.tarde; // ps viene ordenado: el posterior tiene el R más tardío
    porDia.set(dia, c);
  }
  return [...porDia.values()].sort((a, b) => a.dia.localeCompare(b.dia));
}

/** Día efectivo en que se compra la cobertura del periodo que contiene `fecha` (null si no aplica cobertura). */
export function diaPedidoEfectivo(ps: Periodo[], fecha: string, hoy: string, lt: number): string | null {
  const p = cerradoEn(ps, fecha);
  return p ? diasEfectivos(ps, hoy, lt)[ps.indexOf(p)] : null;
}

/**
 * Día "pide antes del" que se reporta para el periodo que contiene `fecha` (resumen del servidor y la app).
 * Regla: si un cierre anterior adelanta la compra, se reporta ese día efectivo (null si tampoco hay día ahí);
 * si no, se reporta U tal cual, aunque ya haya pasado, para que la app pueda decir "Ya no alcanza".
 * Usa el inicio del periodo fusionado: con cierres traslapados la compra se hace antes del primero.
 */
export function diaPedidoReportado(ps: Periodo[], fecha: string, hoy: string, lt: number): string | null {
  const p = cerradoEn(ps, fecha);
  if (!p) return null;
  const U = ultimoDiaPedido(p.ini, lt);
  const q = cerradoEn(ps, U < hoy ? hoy : U);
  return q && q !== p ? diaPedidoEfectivo(ps, fecha, hoy, lt) : U;
}

/** Días desde hoy hasta la primera entrega posible después del cierre vigente más lejano (para extender demanda y kits). */
export function alcanceCierres(cierres: Cierre[], hoy: string, ltMax: number): number {
  let m = 0;
  for (const c of cierres) {
    if (c.cancelado || c.fin < hoy) continue;
    m = Math.max(m, difDias(hoy, sumarDias(c.fin.slice(0, 10), 1 + lt0(ltMax))));
  }
  return m;
}

export async function cargarCierres(db: SupabaseClient, hoy: string): Promise<Cierre[]> {
  const rows = await todo<Record<string, unknown>>((a, b) => db.from("com_proveedor_cierre")
    .select("id,vendor_id,vendor_name,ini,fin,skus,cancelado,aviso7_at,aviso0_at").eq("cancelado", false).gte("fin", hoy)
    .order("id").range(a, b));
  return rows.map((r) => ({ id: Number(r.id), vendor_id: String(r.vendor_id), vendor_name: String(r.vendor_name ?? ""),
    ini: String(r.ini).slice(0, 10), fin: String(r.fin).slice(0, 10), skus: Array.isArray(r.skus) ? (r.skus as string[]) : null,
    cancelado: !!r.cancelado, aviso7_at: (r.aviso7_at as string) ?? null, aviso0_at: (r.aviso0_at as string) ?? null }));
}
