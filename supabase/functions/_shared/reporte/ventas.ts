import { type ConfigReporte, en, esPropia, pct, TIPOS_ENVIO, tipoEnvio, titulo } from "./config.ts";
import { enRango, finSemana, sumar } from "./fechas.ts";
import type { Factura } from "./tipos.ts";

export type SemanaVentas = { lunes: string; total: number; porTipo: Record<string, number> };
export type ClienteTop = { nombre: string; sucursales: string[]; total: number };
export type Ventas = {
  total: number; sinIva: number; pedidos: number; top: ClienteTop[]; semanas: SemanaVentas[];
  vsAnterior: number | null; difAnterior: number; vsAnteriorOrdinario: number | null; difAnteriorOrdinario: number;
  promedio: number; vsPromedio: number | null;
};

const IVA = 1.16;
const TOP = 9;

export const facturaVendida = (f: Factura, cfg: ConfigReporte) =>
  f.estado !== "void" && f.estado !== "draft" && !en(cfg.excluir_ventas, f.cliente);

function grupo(cliente: string, cfg: ConfigReporte): string {
  if (en(cfg.corporativo_ap, cliente)) return "Corporativo AP (MJA + SEJ)";
  if (esPropia(cliente)) return "The Coffee Sucursales";
  return titulo(cliente);
}

function semana(fs: Factura[], lunes: string): SemanaVentas {
  const fin = finSemana(lunes);
  const porTipo: Record<string, number> = Object.fromEntries(TIPOS_ENVIO.map((t) => [t, 0]));
  let total = 0;
  for (const f of fs) {
    if (!enRango(f.fecha, lunes, fin)) continue;
    total += f.total;
    const t = tipoEnvio(f.tipoEnvio);
    porTipo[t] = (porTipo[t] ?? 0) + f.total;
  }
  return { lunes, total, porTipo };
}

export function calcularVentas(facturas: Factura[], cfg: ConfigReporte, lunes: string): Ventas {
  const fs = facturas.filter((f) => facturaVendida(f, cfg));
  const semanas = [28, 21, 14, 7, 0].map((d) => semana(fs, sumar(lunes, -d)));
  const actual = semanas[4], anterior = semanas[3];
  const fin = finSemana(lunes);
  const deLaSemana = fs.filter((f) => enRango(f.fecha, lunes, fin));

  const grupos = new Map<string, { total: number; suc: Map<string, number> }>();
  for (const f of deLaSemana) {
    const g = grupo(f.cliente, cfg);
    const x = grupos.get(g) ?? { total: 0, suc: new Map() };
    x.total += f.total;
    if (f.sucursal.trim()) x.suc.set(f.sucursal.trim(), (x.suc.get(f.sucursal.trim()) ?? 0) + f.total);
    grupos.set(g, x);
  }
  const top = [...grupos].map(([nombre, x]) => ({
    nombre, total: x.total, sucursales: [...x.suc].sort((a, b) => b[1] - a[1]).map(([s]) => s),
  })).sort((a, b) => b.total - a.total).slice(0, TOP);

  const promedio = semanas.reduce((a, s) => a + s.total, 0) / semanas.length;
  const ord = (s: SemanaVentas) => s.porTipo["Ordinario"] ?? 0;
  return {
    total: actual.total, sinIva: actual.total / IVA, pedidos: deLaSemana.length, top, semanas,
    difAnterior: actual.total - anterior.total, vsAnterior: pct(actual.total - anterior.total, anterior.total),
    difAnteriorOrdinario: ord(actual) - ord(anterior), vsAnteriorOrdinario: pct(ord(actual) - ord(anterior), ord(anterior)),
    promedio, vsPromedio: pct(actual.total - promedio, promedio),
  };
}
