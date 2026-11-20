import type { Alerta } from "./consolidar.ts";

export type ResultadoConsolidada = {
  vendor_name: string; nueva: string | null;
  borradores: { po_number: string; cancelada: boolean; error?: string }[];
  lineas: { sku: string; nombre: string; antes: number | null; ahora: number; origen: "nuevo" | "recalculado" | "borrador" }[];
  quitados: { sku: string; nombre: string; antes: number }[];
  monto_antes: number; monto: number; error?: string;
};

const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pesos = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function asuntoConsolidar(fecha: string, modo: "simulacion" | "real"): string {
  return `OC automática ${fecha}: consolidaciones y alertas${modo === "simulacion" ? " (simulación)" : ""}`;
}

export function correoConsolidarHtml(a: { fecha: string; modo: "simulacion" | "real"; consolidadas: ResultadoConsolidada[]; alertas: Alerta[] }): string {
  const cons = a.consolidadas.map((c) => {
    const viejas = c.borradores.map((b) => esc(b.po_number)).join(", ");
    // Solo hay algo que cancelar a mano si la OC nueva sí se creó.
    const manos = c.nueva ? c.borradores.filter((b) => !b.cancelada).map((b) => b.error?.startsWith("ya no es borrador")
      ? `<li><b>revisar a mano ${esc(b.po_number)}</b>: ${esc(b.error)}</li>`
      : `<li><b>cancelar a mano ${esc(b.po_number)}</b>${b.error ? ` (${esc(b.error)})` : ""}</li>`).join("") : "";
    const filas = c.lineas.map((l) =>
      `<tr><td>${esc(l.sku)} ${esc(l.nombre)}</td><td>${l.antes == null ? "—" : l.antes} → ${l.ahora}</td><td>${l.origen === "nuevo" ? "nuevo" : l.origen === "recalculado" ? (l.antes === l.ahora ? "sin cambio" : "recalculado") : "del borrador"}</td></tr>`)
      .concat(c.quitados.map((q) => `<tr><td>${esc(q.sku)} ${esc(q.nombre)}</td><td>${q.antes} → 0</td><td>quitado: ya no hace falta</td></tr>`)).join("");
    return `<h3>${esc(c.vendor_name)}</h3>
<p>${viejas} → ${c.nueva ? esc(c.nueva) : a.modo === "simulacion" ? "(simulación)" : "<b>no se creó</b>"} · total ${pesos(c.monto_antes)} → ${pesos(c.monto)}</p>
${c.error ? `<p><b>Error:</b> ${esc(c.error)}. No se canceló nada.</p>` : ""}
${manos ? `<ul>${manos}</ul>` : ""}
<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>SKU</th><th>Antes → ahora</th><th>Motivo</th></tr>${filas}</table>`;
  }).join("");
  const alertas = a.alertas.map((x) => {
    const emi = x.emitidas.map((e) => `${esc(e.po_number)}${e.fecha_oc ? ` del ${esc(e.fecha_oc)}` : ""}`).join(", ");
    const skus = x.skus.map((s) => `<li>${esc(s.sku)} ${esc(s.nombre)} (${s.cantidad})</li>`).join("");
    return `<p><b>${esc(x.vendor_name)}</b> ya tiene la OC emitida ${emi}; se pidió aparte:</p><ul>${skus}</ul>`;
  }).join("");
  return `<div style="font-family:sans-serif;font-size:14px">
<h2>${esc(asuntoConsolidar(a.fecha, a.modo))}</h2>
${a.modo === "simulacion" ? "<p><b>SIMULACIÓN — no se creó ni canceló nada en Zoho</b></p>" : ""}
${cons ? `<h2>${a.modo === "simulacion" ? "Consolidaciones (simulación: se cancelarían los borradores viejos)" : "Consolidadas (la OC nueva reemplaza a los borradores viejos)"}</h2>${cons}` : ""}
${alertas ? `<h2>Alertas: proveedor con OC emitida</h2>${alertas}` : ""}
</div>`;
}
