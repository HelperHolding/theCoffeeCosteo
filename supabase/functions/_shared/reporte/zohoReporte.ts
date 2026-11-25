// supabase/functions/_shared/reporte/zohoReporte.ts
// Solo Edge: importa el cliente de Zoho. El portal NO importa este archivo.
import type { ZohoClient } from "../zoho.ts";
import { casosAtencion } from "./atencion.ts";
import type { ConfigReporte } from "./config.ts";
import { finSemana, sumar } from "./fechas.ts";
import type { Lectura } from "./reporte.ts";
import type { Factura, NotaCredito, Ov, Paquete, Seccion } from "./tipos.ts";

// deno-lint-ignore no-explicit-any
type J = any;
const s = (x: unknown) => String(x ?? "").trim();
const n = (x: unknown) => Number(x) || 0;
const cf = (d: J, api: string) => s((d?.custom_fields ?? []).find((c: J) => c?.api_name === api)?.value);

export const aFactura = (x: J): Factura => ({
  numero: s(x.invoice_number), ov: s(x.reference_number), fecha: s(x.date), vence: s(x.due_date), cliente: s(x.customer_name),
  sucursal: s(x.cf_sucursal), tipoEnvio: s(x.cf_tipo_de_envio), total: n(x.total), saldo: n(x.balance), estado: s(x.status),
});
export const aPaquete = (x: J): Paquete => ({ ov: s(x.salesorder_number), fecha: s(x.date), envio: s(x.shipment_date) });
export const aOv = (x: J): Ov => ({
  id: s(x.salesorder_id), numero: s(x.salesorder_number), fecha: s(x.date), cliente: s(x.customer_name), sucursal: s(x.cf_sucursal),
  tipoEnvio: s(x.cf_tipo_de_envio), incidencia: s(x.cf_tipo_de_incidencia), resolucion: s(x.cf_resoluci_n),
  estado: s(x.status), estadoEnvio: s(x.shipped_status),
});
export const descripcionDe = (d: J) => cf(d, "cf_descripci_n_incidencia");
export const aNota = (x: J): NotaCredito => ({
  numero: s(x.creditnote_number), fecha: s(x.date), cliente: s(x.customer_name), sucursal: s(x.cf_sucursal) || cf(x, "cf_sucursal"),
  total: n(x.total), estado: s(x.status), descripcion: s((x.line_items ?? []).find((l: J) => s(l?.description))?.description),
});

async function intentar<T>(fn: () => Promise<T>): Promise<Seccion<T>> {
  try { return { ok: true, datos: await fn() }; }
  catch (e) { return { ok: false, error: `Zoho no respondió: ${String((e as Error)?.message ?? e)}` }; }
}

/** De a pocos para no gastar la cuota de Zoho (100/min, compartida con zoho-sync). */
const PAUSA_LOTE_MS = 500;
const dormir = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
async function enLotes<T, R>(xs: T[], tam: number, fn: (x: T) => Promise<R>, pausa: (ms: number) => Promise<void>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < xs.length; i += tam) {
    out.push(...await Promise.all(xs.slice(i, i + tam).map(fn)));
    if (i + tam < xs.length) await pausa(PAUSA_LOTE_MS);
  }
  return out;
}

/**
 * hasta: día de corte (hoy). OVs y paquetes se leen hasta ahí para mostrar aperturas próximas y su envío;
 * surtido y atención se acotan a la semana en su propio cálculo.
 */
export async function leerZoho(z: ZohoClient, cfg: ConfigReporte, lunes: string, pausa: (ms: number) => Promise<void> = dormir, hasta?: string): Promise<Lectura> {
  const fin = finSemana(lunes);
  const finOvs = hasta && hasta > fin ? hasta : fin;
  const desdeOvs = sumar(lunes, -cfg.dias_incidencias);
  const facturas = await intentar(async () =>
    (await z.listAll<J>("/invoices", "invoices", { date_start: sumar(lunes, -28), date_end: fin })).map(aFactura));
  const paquetes = await intentar(async () =>
    (await z.listAll<J>("/packages", "packages", { date_start: desdeOvs, date_end: finOvs })).map(aPaquete));
  const ovs = await intentar(async () =>
    (await z.listAll<J>("/salesorders", "salesorders", { date_start: desdeOvs, date_end: finOvs })).map(aOv));
  const descripciones: Seccion<Record<string, string>> = ovs.ok
    ? await intentar(async () => {
      const casos = casosAtencion(ovs.datos, cfg, lunes);
      // Mejor esfuerzo: un detalle que falla deja la descripción vacía, no tumba la sección.
      const pares = await enLotes(casos, 4, async (o) => {
        try { return [o.id, descripcionDe((await z.get<J>(`/salesorders/${o.id}`)).salesorder)] as const; }
        catch { return [o.id, ""] as const; }
      }, pausa);
      return Object.fromEntries(pares);
    })
    : { ok: false, error: ovs.error };
  const notas = await intentar(async () => {
    const lista = await z.listAll<J>("/creditnotes", "creditnotes", { date_start: lunes, date_end: fin });
    return enLotes(lista, 4, async (x) => aNota({ ...x, ...(await z.get<J>(`/creditnotes/${x.creditnote_id}`)).creditnote }), pausa);
  });
  const pendientes = await intentar(async () =>
    (await z.listAll<J>("/invoices", "invoices", { filter_by: "Status.Unpaid" })).map(aFactura));
  return { facturas, paquetes, ovs, descripciones, notas, pendientes };
}
