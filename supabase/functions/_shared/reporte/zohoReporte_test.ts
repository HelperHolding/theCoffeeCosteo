import { assertEquals } from "@std/assert";
import { ZohoClient } from "../zoho.ts";
import { aFactura, aNota, aOv, aPaquete, descripcionDe, leerZoho } from "./zohoReporte.ts";
import { configReporteDef } from "./config.ts";

Deno.test("mapeos desde el JSON de Zoho Books", () => {
  assertEquals(aFactura({ invoice_number: "COM-FAC-1", reference_number: "COM-OV-1", date: "2026-11-20", due_date: "2026-12-05",
    customer_name: "SUCURSALES THE COFFEE-ALEDEN", cf_sucursal: "Aleden ", cf_tipo_de_envio: "Ordinario", total: 760, balance: 760, status: "sent" }),
    { numero: "COM-FAC-1", ov: "COM-OV-1", fecha: "2026-11-20", vence: "2026-12-05", cliente: "SUCURSALES THE COFFEE-ALEDEN", sucursal: "Aleden", tipoEnvio: "Ordinario", total: 760, saldo: 760, estado: "sent" });
  assertEquals(aPaquete({ salesorder_number: "COM-OV-1", date: "2026-11-20", shipment_date: "" }), { ov: "COM-OV-1", fecha: "2026-11-20", envio: "" });
  assertEquals(aOv({ salesorder_id: "9", salesorder_number: "COM-OV-4883", date: "2026-11-17", customer_name: "VIRTUO", cf_sucursal: "Ávila Camacho ",
    cf_tipo_de_envio: "Ordinario", cf_tipo_de_incidencia: "Pedido Incompleto", cf_resoluci_n: "En Proceso", status: "invoiced", shipped_status: "partially_shipped" }).incidencia, "Pedido Incompleto");
  assertEquals(descripcionDe({ custom_fields: [{ api_name: "cf_descripci_n_incidencia", value: " Falta vaso " }] }), "Falta vaso");
  assertEquals(aNota({ creditnote_number: "CN-1", date: "2026-11-20", customer_name: "MOP", total: 196.04, status: "open",
    custom_fields: [{ api_name: "cf_sucursal", value: "Marina Vallarta" }], line_items: [{ description: "" }, { description: "Base neutra rota" }] }),
    { numero: "CN-1", fecha: "2026-11-20", cliente: "MOP", sucursal: "Marina Vallarta", total: 196.04, estado: "open", descripcion: "Base neutra rota" });
});

Deno.test("leerZoho: rangos de fechas, detalles solo de OVs de atención y fallas por fuente", async () => {
  const llamadas: string[] = [];
  const fetchFn = (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })));
    llamadas.push(`${u.pathname.replace("/books/v3", "")}?${u.searchParams.get("date_start") ?? ""}`);
    const j = (b: unknown) => Promise.resolve(new Response(JSON.stringify({ code: 0, ...b as object, page_context: { has_more_page: false } })));
    if (u.pathname.endsWith("/creditnotes")) return Promise.resolve(new Response(JSON.stringify({ code: 57, message: "falla" }), { status: 400 }));
    if (u.pathname.endsWith("/salesorders")) return j({ salesorders: [
      { salesorder_id: "1", salesorder_number: "A", date: "2026-11-17", customer_name: "X", cf_tipo_de_incidencia: "Pedido Incompleto", cf_resoluci_n: "En Proceso", status: "open" },
      { salesorder_id: "2", salesorder_number: "B", date: "2026-11-17", customer_name: "X", status: "open" }] });
    if (u.pathname.endsWith("/salesorders/1")) return j({ salesorder: { custom_fields: [{ api_name: "cf_descripci_n_incidencia", value: "falta" }] } });
    return j({ invoices: [], packages: [] });
  };
  const z = new ZohoClient({ clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "o", fetchFn: fetchFn as typeof fetch, sleep: () => Promise.resolve(), soloLectura: true });
  const l = await leerZoho(z, configReporteDef(), "2026-11-16");
  assertEquals(l.descripciones, { ok: true, datos: { "1": "falta" } });
  assertEquals(l.notas.ok, false);
  assertEquals(l.facturas.ok, true);
  assertEquals(llamadas.includes("/invoices?2026-10-19"), true);
  assertEquals(llamadas.includes("/salesorders?2026-09-17"), true);
  assertEquals(llamadas.filter((c) => c.startsWith("/salesorders/")), ["/salesorders/1?"]);
});

Deno.test("leerZoho: un detalle de OV que falla deja descripción vacía y la sección sigue ok; pausa entre lotes de 4", async () => {
  const ovs = Array.from({ length: 6 }, (_, i) => ({ salesorder_id: String(i + 1), salesorder_number: `A${i + 1}`, date: "2026-11-17", customer_name: "X", cf_tipo_de_incidencia: "Pedido Incompleto", cf_resoluci_n: "En Proceso", status: "open" }));
  const fetchFn = (url: string | URL | Request) => {
    const u = new URL(String(url));
    if (u.pathname.endsWith("/token")) return Promise.resolve(new Response(JSON.stringify({ access_token: "t", expires_in: 3600 })));
    const j = (b: unknown) => Promise.resolve(new Response(JSON.stringify({ code: 0, ...b as object, page_context: { has_more_page: false } })));
    if (u.pathname.endsWith("/salesorders")) return j({ salesorders: ovs });
    if (u.pathname.endsWith("/salesorders/2")) return Promise.resolve(new Response(JSON.stringify({ code: 57, message: "falla" }), { status: 400 }));
    if (/\/salesorders\/\d+$/.test(u.pathname)) return j({ salesorder: { custom_fields: [{ api_name: "cf_descripci_n_incidencia", value: "d" + u.pathname.slice(-1) }] } });
    return j({ invoices: [], packages: [], creditnotes: [] });
  };
  const z = new ZohoClient({ clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "o", fetchFn: fetchFn as typeof fetch, sleep: () => Promise.resolve(), soloLectura: true });
  const pausas: number[] = [];
  const l = await leerZoho(z, configReporteDef(), "2026-11-16", (ms) => { pausas.push(ms); return Promise.resolve(); });
  assertEquals(l.descripciones.ok, true);
  assertEquals(l.descripciones.ok && l.descripciones.datos, { "1": "d1", "2": "", "3": "d3", "4": "d4", "5": "d5", "6": "d6" });
  assertEquals(pausas, [500]); // 6 detalles = 2 lotes de 4: una pausa entre ellos
});
