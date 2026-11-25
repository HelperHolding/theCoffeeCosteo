// supabase/functions/_shared/reporte/atencion.ts
import { type ConfigReporte, esPropia, norm, titulo, tipoEnvio } from "./config.ts";
import { enRango, finSemana, lunesDe } from "./fechas.ts";
import { origenIncidencia, ovValida, primerEnvio } from "./surtido.ts";
import type { NotaCredito, Ov, Paquete } from "./tipos.ts";

export type Caso = { ov: string; fecha: string; sucursal: string; cliente: string; tipo: string; resolucion: string; resuelto: boolean; descripcion: string };
export type GrupoAtencion = { abiertas: number; resueltasSemana: number; semanas: { lunes: string; casos: Caso[] }[] };
export type Atencion = { propias: GrupoAtencion; externos: GrupoAtencion };
export type Notas = { filas: NotaCredito[]; total: number };
export type Apertura = { ov: string; fecha: string; sucursal: string; cliente: string; envio: string | null; estadoEnvio: string };

const resuelto = (o: Ov) => norm(o.resolucion) === "RESUELTO";

/** OVs que aparecen en Atención: también decide qué detalles de OV se leen de Zoho (descripción). */
export function casosAtencion(ovs: Ov[], cfg: ConfigReporte, lunes: string): Ov[] {
  const fin = finSemana(lunes);
  return ovs.filter((o) => ovValida(o, cfg) && origenIncidencia(o.incidencia) && (!resuelto(o) || enRango(o.fecha, lunes, fin)));
}

function grupo(ovs: Ov[], desc: Record<string, string>): GrupoAtencion {
  const porSemana = new Map<string, Caso[]>();
  for (const o of ovs) {
    const l = lunesDe(o.fecha);
    const c: Caso = { ov: o.numero, fecha: o.fecha, sucursal: o.sucursal.trim(), cliente: titulo(o.cliente), tipo: o.incidencia,
      resolucion: o.resolucion || "Sin estatus", resuelto: resuelto(o), descripcion: (desc[o.id] ?? "").trim() };
    porSemana.set(l, [...(porSemana.get(l) ?? []), c]);
  }
  const semanas = [...porSemana].sort((a, b) => b[0].localeCompare(a[0]))
    .map(([lunes, casos]) => ({ lunes, casos: casos.sort((a, b) => a.ov.localeCompare(b.ov)) }));
  return { abiertas: ovs.filter((o) => !resuelto(o)).length, resueltasSemana: ovs.filter(resuelto).length, semanas };
}

export function calcularAtencion(ovs: Ov[], descripciones: Record<string, string>, cfg: ConfigReporte, lunes: string): Atencion {
  const casos = casosAtencion(ovs, cfg, lunes);
  return {
    propias: grupo(casos.filter((o) => esPropia(o.cliente)), descripciones),
    externos: grupo(casos.filter((o) => !esPropia(o.cliente)), descripciones),
  };
}

export function calcularNotas(notas: NotaCredito[], lunes: string): Notas {
  const fin = finSemana(lunes);
  const filas = notas.filter((n) => n.estado !== "void" && enRango(n.fecha, lunes, fin))
    .sort((a, b) => b.numero.localeCompare(a.numero));
  return { filas, total: filas.reduce((a, n) => a + n.total, 0) };
}

export function calcularAperturas(ovs: Ov[], paquetes: Paquete[], cfg: ConfigReporte, lunes: string): Apertura[] {
  const fin = finSemana(lunes);
  const pe = primerEnvio(paquetes);
  return ovs.filter((o) => ovValida(o, cfg) && tipoEnvio(o.tipoEnvio) === "Apertura")
    .filter((o) => { const e = pe.get(o.numero); return !e || enRango(e, lunes, fin) || enRango(o.fecha, lunes, fin) || o.fecha > fin; })
    .filter((o) => pe.has(o.numero) || o.fecha >= lunes)
    .map((o) => ({ ov: o.numero, fecha: o.fecha, sucursal: o.sucursal.trim(), cliente: titulo(o.cliente), envio: pe.get(o.numero) ?? null, estadoEnvio: o.estadoEnvio }))
    .sort((a, b) => b.fecha.localeCompare(a.fecha));
}
