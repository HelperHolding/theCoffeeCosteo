import { enviarCorreo } from "../_shared/correo.ts";
import type { SupabaseClient } from "../_shared/db.ts";
import { difDias } from "../_shared/fechas.ts";
import type { ResumenCierre } from "./pagos.ts";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pesos = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function porAvisar(cs: ResumenCierre[], hoy: string): { siete: ResumenCierre[]; ultimo: ResumenCierre[] } {
  const vivos = cs.filter((c) => c.u != null && hoy < c.ini);
  return {
    siete: vivos.filter((c) => difDias(hoy, c.u!) <= 7 && !c.aviso7_at),
    ultimo: vivos.filter((c) => hoy >= c.u! && !c.aviso0_at),
  };
}

export function correoCierresHtml(a: { hoy: string; siete: ResumenCierre[]; ultimo: ResumenCierre[] }): string {
  const fila = (c: ResumenCierre) => {
    const u = c.u == null ? "—" : a.hoy > c.u ? `${esc(fmt(c.u))} (Ya no alcanza)` : esc(fmt(c.u));
    return `<tr><td>${esc(c.vendor_name)}</td><td>${esc(fmt(c.ini))} al ${esc(fmt(c.fin))}</td><td>${u}</td>` +
      `<td style="text-align:right">${c.skus_afectados}</td><td style="text-align:right">${pesos(c.monto_adelanto)}</td></tr>`;
  };
  const tabla = (titulo: string, cs: ResumenCierre[]) => !cs.length ? "" :
    `<h3>${esc(titulo)}</h3><table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">` +
    `<tr><th>Proveedor</th><th>Cierre</th><th>Último día para pedir</th><th>Artículos afectados</th><th>Adelanto</th></tr>` +
    cs.map(fila).join("") + `</table>`;
  return `<p>Hay proveedores que cerrarán pronto. Revisa los pedidos antes del último día.</p>` +
    tabla("Último día para pedir en 7 días o menos", a.siete) + tabla("Último día para pedir: hoy o ya pasó", a.ultimo);
}

export async function avisarCierres(
  db: SupabaseClient, correos: string[], hoy: string, cs: ResumenCierre[],
  enviar: (to: string[], asunto: string, html: string) => Promise<boolean> = enviarCorreo,
): Promise<{ enviados: number; error?: string }> {
  const { siete, ultimo } = porAvisar(cs, hoy);
  const n = new Set([...siete, ...ultimo].map((c) => c.id)).size;
  if (!n) return { enviados: 0 };
  if (!correos.length) return { enviados: 0, error: "sin destinatarios de alertas" };
  const ok = await enviar(correos, `Proveedores sin stock: ${n} cierre(s) por atender`, correoCierresHtml({ hoy, siete, ultimo }));
  if (!ok) return { enviados: 0, error: "falló el envío del correo" };
  const ahora = new Date().toISOString();
  for (const [col, lista] of [["aviso7_at", siete], ["aviso0_at", ultimo]] as const) {
    if (!lista.length) continue;
    const { error } = await db.from("com_proveedor_cierre").update({ [col]: ahora }).in("id", lista.map((c) => c.id));
    if (error) return { enviados: 1, error: String(error.message ?? error) };
  }
  return { enviados: 1 };
}
