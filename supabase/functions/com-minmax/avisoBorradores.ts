import { enviarCorreo } from "../_shared/correo.ts";
import type { SupabaseClient } from "../_shared/db.ts";
import { difDias } from "../_shared/fechas.ts";
import { medianocheCdmx } from "../_shared/planEngine.ts";

/** OCs en borrador en Zoho con esta edad (días desde su fecha) o más se avisan por correo (pedido del usuario, 2026-11-18). */
export const DIAS_BORRADOR = 2;

/** Renglón de com_zoho_oc_lineas con status 'draft'. */
export interface LineaBorrador {
  zoho_po_id: string; po_number: string; vendor_name: string | null; fecha_oc: string | null;
  cantidad: number | null; precio: number | null; es_auto: boolean | null;
}
export interface Borrador { po: string; numero: string; proveedor: string; fecha: string; dias: number; monto: number; auto: boolean }

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmt = (iso: string) => `${Number(iso.slice(8, 10))} ${MESES[Number(iso.slice(5, 7)) - 1]}`;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const pesos = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const n = (x: unknown) => Number(x) || 0;

/** Una entrada por OC en borrador con DIAS_BORRADOR días o más; la más vieja primero. Sin fecha de OC no se avisa. */
export function borradoresViejos(lineas: LineaBorrador[], hoy: string, dias = DIAS_BORRADOR): Borrador[] {
  const g = new Map<string, Borrador>();
  for (const l of lineas) {
    if (!l.fecha_oc) continue;
    const b = g.get(l.zoho_po_id) ?? {
      po: l.zoho_po_id, numero: l.po_number, proveedor: l.vendor_name ?? "(sin proveedor)", fecha: l.fecha_oc.slice(0, 10),
      dias: difDias(l.fecha_oc, hoy), monto: 0, auto: !!l.es_auto,
    };
    b.monto += n(l.cantidad) * n(l.precio);
    g.set(l.zoho_po_id, b);
  }
  return [...g.values()]
    .filter((b) => b.dias >= dias)
    .map((b) => ({ ...b, monto: Math.round(b.monto * 100) / 100 }))
    .sort((a, b) => b.dias - a.dias || a.numero.localeCompare(b.numero));
}

export function correoBorradoresHtml(hoy: string, bs: Borrador[]): string {
  const fila = (b: Borrador) =>
    `<tr><td>${esc(b.numero)}</td><td>${esc(b.proveedor)}</td><td>${esc(fmt(b.fecha))}</td>` +
    `<td style="text-align:right">${b.dias}</td><td style="text-align:right">${pesos(b.monto)}</td>` +
    `<td>${b.auto ? "Automática" : "Manual"}</td></tr>`;
  return `<p>Al ${esc(fmt(hoy))} hay órdenes de compra en borrador en Zoho con ${DIAS_BORRADOR} días o más sin enviar. ` +
    `Revísalas y envíalas al proveedor (o elimínalas si ya no se necesitan).</p>` +
    `<table border="1" cellpadding="6" cellspacing="0" style="border-collapse:collapse">` +
    `<tr><th>OC</th><th>Proveedor</th><th>Fecha</th><th>Días en borrador</th><th>Monto (sin IVA)</th><th>Origen</th></tr>` +
    bs.map(fila).join("") + `</table>`;
}

/**
 * ¿Ya salió hoy (día de CDMX) el correo de borradores? com-minmax también corre al guardar la configuración o recalcular a
 * mano: el aviso sale una sola vez al día, en la primera corrida que encuentre borradores viejos.
 */
export async function avisadoHoy(db: SupabaseClient, hoy: string): Promise<boolean> {
  const { data, error } = await db.from("com_sync_log").select("id").eq("proceso", "com-minmax").eq("ok", true)
    .gte("inicio", new Date(medianocheCdmx(hoy)).toISOString()).eq("resumen->borradores->>enviados", "1").limit(1);
  if (error) throw error;
  return !!data?.length;
}

/** Un correo con todas las OCs en borrador viejas. Se repite cada día mientras sigan en borrador. Nunca lanza por el envío. */
export async function avisarBorradores(
  correos: string[], hoy: string, lineas: LineaBorrador[],
  enviar: (to: string[], asunto: string, html: string) => Promise<boolean> = enviarCorreo,
): Promise<{ enviados: number; borradores: number; error?: string }> {
  const bs = borradoresViejos(lineas, hoy);
  if (!bs.length) return { enviados: 0, borradores: 0 };
  if (!correos.length) return { enviados: 0, borradores: bs.length, error: "sin destinatarios de alertas" };
  const ok = await enviar(correos, `OCs en borrador sin enviar: ${bs.length} con ${DIAS_BORRADOR} días o más`, correoBorradoresHtml(hoy, bs));
  return ok ? { enviados: 1, borradores: bs.length } : { enviados: 0, borradores: bs.length, error: "falló el envío del correo" };
}
