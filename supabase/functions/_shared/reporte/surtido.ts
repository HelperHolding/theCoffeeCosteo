// supabase/functions/_shared/reporte/surtido.ts
import { type ConfigReporte, en, esPropia, norm, pct, tipoEnvio } from "./config.ts";
import { diasHabiles, enRango, finSemana } from "./fechas.ts";
import type { Ov, Paquete } from "./tipos.ts";

export type Origen = "stock" | "pickeo" | "paqueteria" | "otro";
export type FilaIncidencia = { ov: string; sucursal: string; cliente: string; origen: Origen; tipo: string; resolucion: string };
export type Indicador = { valor: number | null; meta: number; cumple: boolean | null };
export type Surtido = {
  enviados: number; conFaltante: number; incidenciasTotal: number;
  fill: Indicador; stock: Indicador; pickeo: Indicador; fisica: Indicador;
  casos: Record<Origen, number>;
  envio: Indicador & {
    universo: number; enMeta: number; buckets: [number, number, number, number];
    fuera: { ov: string; sucursal: string; fecha: string; envio: string; dias: number }[];
  };
  incidencias: FilaIncidencia[];
};

export function origenIncidencia(t: string): Origen | null {
  const n = norm(t);
  if (!n) return null;
  if (n.includes("SIN STOCK")) return "stock";
  if (n === "PEDIDO INCOMPLETO") return "pickeo";
  if (/DERRAME|EXTRAV|DANO|DANAD|PAQUETER/.test(n)) return "paqueteria";
  return "otro";
}

export function primerEnvio(paquetes: Paquete[]): Map<string, string> {
  const m = new Map<string, string>();
  for (const p of paquetes) {
    if (!p.envio) continue;
    const a = m.get(p.ov);
    if (!a || p.envio < a) m.set(p.ov, p.envio);
  }
  return m;
}

export const ovValida = (o: Ov, cfg: ConfigReporte) => o.estado !== "void" && !en(cfg.excluir_ventas, o.cliente);

const ORDEN: Origen[] = ["paqueteria", "pickeo", "stock", "otro"];
const ind = (valor: number | null, meta: number, mayor: boolean): Indicador =>
  ({ valor, meta, cumple: valor === null ? null : mayor ? valor * 100 >= meta : valor * 100 <= meta });

export function calcularSurtido(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Surtido {
  const fin = finSemana(lunes);
  // Paquetes posteriores al domingo no cuentan: la semana se ve como estaba al cerrar.
  const pe = primerEnvio(paquetes.filter((p) => !p.envio || p.envio <= fin));
  const universo = ovs.filter((o) => {
    if (!ovValida(o, cfg)) return false;
    const e = pe.get(o.numero);
    return e ? enRango(e, lunes, fin) : enRango(o.fecha, lunes, fin) && !!origenIncidencia(o.incidencia);
  });
  const n = universo.length;
  const casos: Record<Origen, number> = { stock: 0, pickeo: 0, paqueteria: 0, otro: 0 };
  const incidencias: FilaIncidencia[] = [];
  for (const o of universo) {
    const org = origenIncidencia(o.incidencia);
    if (!org) continue;
    casos[org]++;
    incidencias.push({ ov: o.numero, sucursal: o.sucursal.trim(), cliente: o.cliente, origen: org, tipo: o.incidencia, resolucion: o.resolucion });
  }
  incidencias.sort((a, b) => ORDEN.indexOf(a.origen) - ORDEN.indexOf(b.origen) || a.ov.localeCompare(b.ov));
  const conFaltante = casos.stock + casos.pickeo;

  const externos = universo.filter((o) => pe.has(o.numero) && !esPropia(o.cliente) && tipoEnvio(o.tipoEnvio) !== "Apertura");
  const buckets: [number, number, number, number] = [0, 0, 0, 0];
  const fuera: Surtido["envio"]["fuera"] = [];
  let enMeta = 0;
  for (const o of externos) {
    const envio = pe.get(o.numero)!;
    const dias = diasHabiles(o.fecha, envio);
    buckets[Math.min(dias, 3)]++;
    if (dias <= cfg.metas.dias_envio) enMeta++;
    else fuera.push({ ov: o.numero, sucursal: o.sucursal.trim(), fecha: o.fecha, envio, dias });
  }
  const m = cfg.metas;
  return {
    enviados: n, conFaltante, incidenciasTotal: incidencias.length, casos, incidencias,
    fill: ind(pct(n - conFaltante, n), m.fill, true),
    stock: ind(pct(casos.stock, n), m.stock, false),
    pickeo: ind(n ? 1 - casos.pickeo / n : null, m.pickeo, true),
    fisica: ind(pct(casos.paqueteria, n), m.fisica, false),
    envio: { ...ind(pct(enMeta, externos.length), m.envio, true), universo: externos.length, enMeta, buckets, fuera },
  };
}
