// Mínimos de compra por proveedor: reglas puras (spec 2026-11-12 §4 y §5).
import type { FilaPago } from "./proyeccion.ts";
import { difDias } from "./fechas.ts";

/** Fila de salida: siempre lleva ambas marcas. (Compatible con FilaPago cuando ésta las incorpore.) */
export type FilaMin = FilaPago & { adelanto_minimo?: boolean; bajo_minimo?: boolean };

export type Reprogramar = (f: FilaPago, nuevaFechaOc: string) => { fecha_llegada: string; fecha_pago: string };
export type OpcionesMinimos = { minimos: Record<string, number>; hoy: string; ventana: number; modo: "consolidar" | "avisar";
  reprogramar: Reprogramar; cerradoPara: (sku: string, vendorId: string, fecha: string) => boolean };

export function aplicarMinimos(filas: FilaPago[], o: OpcionesMinimos): FilaMin[] {
  const out: FilaMin[] = filas.map((f) => ({ ...f, adelanto_minimo: false, bajo_minimo: false }));
  const vendors = new Set(out.filter((f) => f.tipo === "proyectado" && (o.minimos[f.vendor_id] ?? 0) > 0).map((f) => f.vendor_id));
  for (const v of vendors) {
    const min = o.minimos[v];
    const proy = () => out.filter((f) => f.tipo === "proyectado" && f.vendor_id === v);
    const dias = [...new Set(proy().map((f) => f.fecha_oc))].sort();
    for (const dia of dias) {
      const grupo = proy().filter((f) => f.fecha_oc === dia);
      if (!grupo.length) continue; // día vaciado por un adelanto: ya no es OC
      let suma = grupo.reduce((s, f) => s + f.monto, 0);
      if (suma >= min) continue;
      if (o.modo === "avisar") { for (const f of grupo) f.bajo_minimo = true; continue; }
      const cand = proy()
        .filter((f) => f.fecha_oc > dia && difDias(dia, f.fecha_oc) <= o.ventana && !o.cerradoPara(f.sku, v, dia))
        .sort((a, b) => a.fecha_oc < b.fecha_oc ? -1 : a.fecha_oc > b.fecha_oc ? 1 : a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0);
      for (const f of cand) {
        if (suma >= min) break;
        const r = o.reprogramar(f, dia);
        f.fecha_oc = dia; f.fecha_llegada = r.fecha_llegada; f.fecha_pago = r.fecha_pago; f.adelanto_minimo = true;
        grupo.push(f); suma += f.monto;
      }
      if (suma < min) for (const f of grupo) f.bajo_minimo = true;
    }
  }
  return out;
}

export type EstadoMinimo = { minimo_compra: number; minimo_zoho_visto: number | null; minimo_pendiente: boolean; minimo_editado_at: string | null };
export type Conciliacion = { accion: "nada" | "aplicar_zoho" | "reenviar"; valor: number };

export function conciliarMinimo(est: EstadoMinimo, z: number | null, zModificado: string | null): Conciliacion {
  const nada: Conciliacion = { accion: "nada", valor: est.minimo_compra };
  const reenviar: Conciliacion = { accion: "reenviar", valor: est.minimo_compra };
  // Sin base en Zoho todavía (migrado o nunca enviado) y con valor pendiente: la plataforma gana a la primera vista.
  if (est.minimo_zoho_visto === null && est.minimo_pendiente) return reenviar;
  if (z === null) return nada;
  if (z !== est.minimo_zoho_visto) {
    if (!est.minimo_pendiente) return { accion: "aplicar_zoho", valor: z };
    const tz = zModificado ? Date.parse(zModificado) : NaN;
    const tp = est.minimo_editado_at ? Date.parse(est.minimo_editado_at) : NaN;
    if (Number.isNaN(tp) || Number.isNaN(tz) || tz >= tp) return { accion: "aplicar_zoho", valor: z };
    return reenviar;
  }
  return est.minimo_pendiente ? reenviar : nada;
}
