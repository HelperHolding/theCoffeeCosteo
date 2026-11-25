export type CreditoActivo = { cliente: string; sucursal: string; nota: string };
export type ConfigReporte = {
  excluir_ventas: string[]; corporativo_ap: string[]; excluir_saldos: string[];
  excluir_saldos_sucursales: string[]; deuda_interna: string[]; creditos_activos: CreditoActivo[];
  metas: { fill: number; stock: number; pickeo: number; fisica: number; envio: number; dias_envio: number };
  dias_incidencias: number;
};

export const configReporteDef = (): ConfigReporte => ({
  excluir_ventas: ["DODO PIZZA", "Compras The Coffee"],
  corporativo_ap: ["OPERADORA DE FRANQUICIAS MJA", "OPERADORA DE CAFETERIAS SEJ"],
  excluir_saldos: ["SEINOMARIN PROJECTS", "DODO PIZZA"],
  excluir_saldos_sucursales: ["Polanco"],
  deuda_interna: ["MARKETING", "OFICINA PRINCIPAL", "Compras The Coffee"],
  creditos_activos: [],
  metas: { fill: 98, stock: 1, pickeo: 98, fisica: 1, envio: 100, dias_envio: 2 },
  dias_incidencias: 60,
});

export const norm = (s: string) =>
  String(s ?? "").normalize("NFD").replace(/\p{M}/gu, "").toUpperCase().replace(/\s+/g, " ").trim();
export const en = (lista: string[], nombre: string) => { const n = norm(nombre); return lista.some((l) => norm(l) === n); };

const PREFIJO_PROPIA = "SUCURSALES THE COFFEE";
export const esPropia = (cliente: string) => norm(cliente).startsWith(PREFIJO_PROPIA);
/** Nombre de la sucursal propia: el campo Sucursal de Zoho o, si viene vacío, lo que sigue al prefijo del cliente. */
export function sucursalPropia(f: { cliente: string; sucursal: string }): string {
  if (f.sucursal.trim()) return f.sucursal.trim();
  return titulo(f.cliente.trim().slice(PREFIJO_PROPIA.length).replace(/^[\s-]+/, ""));
}

const CONECTORES = new Set(["de", "del", "la", "las", "los", "y", "e"]);
export function titulo(s: string): string {
  return String(s ?? "").trim().toLowerCase().split(/\s+/).map((p, i) => {
    if (i > 0 && CONECTORES.has(p)) return p;
    if (!/[aeiouáéíóú]/.test(p)) return p.toUpperCase();
    return p.charAt(0).toUpperCase() + p.slice(1);
  }).join(" ");
}

export const TIPOS_ENVIO = ["Ordinario", "Llenado de canal", "Apertura"] as const;
export const SIN_CLASIFICAR = "Sin clasificar";
export function tipoEnvio(t: string): string {
  const n = norm(t);
  return TIPOS_ENVIO.find((x) => norm(x) === n) ?? SIN_CLASIFICAR;
}

export const pct = (a: number, b: number): number | null => (b ? a / b : null);

const lista = (x: unknown, def: string[]): string[] =>
  Array.isArray(x) ? [...new Set(x.filter((v) => typeof v === "string").map((v) => v.trim()).filter(Boolean))] : def;
const num = (x: unknown, def: number, min: number, max: number) => {
  const n = Number(x);
  return Number.isFinite(n) && x !== null && x !== "" ? Math.min(max, Math.max(min, n)) : def;
};

// deno-lint-ignore no-explicit-any
export function normalizarConfigReporte(x: any): ConfigReporte {
  const d = configReporteDef();
  if (!x || typeof x !== "object") return d;
  const m = x.metas ?? {};
  return {
    excluir_ventas: lista(x.excluir_ventas, d.excluir_ventas),
    corporativo_ap: lista(x.corporativo_ap, d.corporativo_ap),
    excluir_saldos: lista(x.excluir_saldos, d.excluir_saldos),
    excluir_saldos_sucursales: lista(x.excluir_saldos_sucursales, d.excluir_saldos_sucursales),
    deuda_interna: lista(x.deuda_interna, d.deuda_interna),
    creditos_activos: Array.isArray(x.creditos_activos)
      ? x.creditos_activos
        // deno-lint-ignore no-explicit-any
        .filter((c: any) => c && typeof c.cliente === "string" && c.cliente.trim())
        // deno-lint-ignore no-explicit-any
        .map((c: any) => ({ cliente: c.cliente.trim(), sucursal: String(c.sucursal ?? "").trim(), nota: String(c.nota ?? "").trim() }))
      : d.creditos_activos,
    metas: {
      fill: num(m.fill, d.metas.fill, 0, 100), stock: num(m.stock, d.metas.stock, 0, 100),
      pickeo: num(m.pickeo, d.metas.pickeo, 0, 100), fisica: num(m.fisica, d.metas.fisica, 0, 100),
      envio: num(m.envio, d.metas.envio, 0, 100), dias_envio: Math.round(num(m.dias_envio, d.metas.dias_envio, 0, 15)),
    },
    dias_incidencias: Math.round(num(x.dias_incidencias, d.dias_incidencias, 14, 180)),
  };
}
