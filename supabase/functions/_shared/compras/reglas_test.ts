// supabase/functions/_shared/compras/reglas_test.ts
import { assertEquals } from "@std/assert";
import { categoriaSku, facturaDesdeDetalle, insumos, ocDesdeDetalle, sumar, ventaSemana } from "./reglas.ts";

Deno.test("categoriaSku: familias de insumo y RTD; lo demás es otros", () => {
  assertEquals(["INS-CAF-001", "INS-BEB-2", "INS-DES-019", "INS-DEL-1", "INS-BA-075", "INS-LIM-3", "INS-FOD-9", "RTD-ZOÉ-1", "RTD-PER-2", "ENV-1", "INS-PUB-1", ""].map(categoriaSku),
    ["CAF", "BEB", "DES", "DEL", "BA", "LIM", "FOD", "RTD", "RTD", "otros", "otros", "otros"]);
});

Deno.test("sumar redondea a centavos e insumos excluye otros", () => {
  const p = sumar([{ sku: "INS-CAF-1", monto: 10.006 }, { sku: "INS-CAF-2", monto: 1 }, { sku: "ENV-1", monto: 5 }]);
  assertEquals(p, { CAF: 11.01, otros: 5 });
  assertEquals(insumos(p), 11.01);
});

const po = (o: Record<string, unknown> = {}) => ({
  purchaseorder_id: "P1", purchaseorder_number: "COM-OC-1", vendor_name: "Prov", vendor_id: "V1", created_by_name: "Victor",
  date: "2026-11-18", delivery_date: "2026-11-20", status: "open", received_status: "partially_received", currency_code: "MXN",
  total: 0, last_modified_time: "2026-11-24T10:00:00-0600", bills: [], purchasereceives: [],
  line_items: [
    { sku: "INS-DES-001", rate: 100, quantity: 10, quantity_received: 6, tax_percentage: 16 },
    { sku: "ENV-001", rate: 50, quantity: 2, quantity_received: 2, tax_percentage: 0 },
  ],
  ...o,
});

Deno.test("ocDesdeDetalle: montos con IVA, una recepción toma quantity_received", () => {
  const { oc, recepciones } = ocDesdeDetalle(po({ purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }] }), {});
  assertEquals(oc.por_categoria, { DES: 1160, otros: 100 });
  assertEquals(oc.monto_ins, 1160);
  assertEquals(oc.es_registro, false);
  assertEquals(oc.comprador, "Victor");
  assertEquals(recepciones, [{ zoho_receive_id: "R1", zoho_po_id: "P1", folio_oc: "COM-OC-1", fecha: "2026-11-19", monto: 796, por_categoria: { DES: 696, otros: 100 } }]);
});

Deno.test("ocDesdeDetalle: varias recepciones usan su detalle con el rate de la línea", () => {
  const { recepciones } = ocDesdeDetalle(po({ purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }, { receive_id: "R2", date: "2026-11-21" }] }), {
    R1: { line_items: [{ sku: "INS-DES-001", quantity: 4 }] },
    R2: { line_items: [{ sku: "INS-DES-001", quantity: 2 }, { sku: "ENV-001", quantity: 2 }] },
  });
  assertEquals(recepciones.map((r) => [r.zoho_receive_id, r.monto]), [["R1", 464], ["R2", 332]]);
});

Deno.test("ocDesdeDetalle: varias recepciones se relacionan por item_id aunque el SKU se repita con otro precio", () => {
  const { recepciones } = ocDesdeDetalle(po({
    line_items: [
      { item_id: "I1", sku: "INS-DES-001", rate: 100, quantity: 10, quantity_received: 0, tax_percentage: 16 },
      { item_id: "I2", sku: "INS-DES-001", rate: 10, quantity: 10, quantity_received: 0, tax_percentage: 16 },
    ],
    purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }, { receive_id: "R2", date: "2026-11-21" }],
  }), {
    R1: { line_items: [{ item_id: "I1", sku: "INS-DES-001", quantity: 1 }] },
    R2: { line_items: [{ item_id: "I2", sku: "INS-DES-001", quantity: 1 }] },
  });
  assertEquals(recepciones.map((r) => r.monto), [116, 11.6]);
});

Deno.test("ocDesdeDetalle: OC de registro por arribo muy anterior o factura previa; sin arribo no rompe", () => {
  assertEquals(ocDesdeDetalle(po({ delivery_date: "2026-11-05" }), {}).oc.es_registro, true);
  assertEquals(ocDesdeDetalle(po({ delivery_date: "2026-11-12" }), {}).oc.es_registro, false);
  const conFactura = ocDesdeDetalle(po({ bills: [{ date: "2026-11-10" }] }), {}).oc;
  assertEquals([conFactura.es_registro, conFactura.factura_previa], [true, "2026-11-10"]);
  const sinArribo = ocDesdeDetalle(po({ delivery_date: "" }), {}).oc;
  assertEquals([sinArribo.arribo, sinArribo.es_registro], [null, false]);
});

Deno.test("ocDesdeDetalle: el arribo esperado sale del campo «Fecha de Arribo Esperada» de Zoho", () => {
  const conCampo = po({ delivery_date: "", custom_fields: [{ api_name: "cf_fecha_de_arribo_esperada", value: "2026-09-28" }], date: "2026-10-15" });
  const oc = ocDesdeDetalle(conCampo, {}).oc;
  assertEquals([oc.arribo, oc.es_registro], ["2026-09-28", true]);
  assertEquals(ocDesdeDetalle(po({ delivery_date: "", cf_fecha_de_arribo_esperada: "2026-11-20" }), {}).oc.arribo, "2026-11-20");
});

Deno.test("ocDesdeDetalle: moneda distinta de MXN no suma montos", () => {
  const { oc, recepciones } = ocDesdeDetalle(po({ currency_code: "USD", purchasereceives: [{ receive_id: "R1", date: "2026-11-19" }] }), {});
  assertEquals([oc.monto_ins, oc.por_categoria, recepciones[0].monto], [0, {}, 0]);
});

const inv = (o: Record<string, unknown> = {}) => ({
  invoice_id: "F1", date: "2026-11-17", customer_name: "MAGNOLIA GC", status: "paid", total: 1116,
  last_modified_time: "2026-11-24T10:00:00-0600",
  line_items: [{ sku: "INS-CAF-1", item_total: 500, tax_percentage: 0 }, { sku: "INS-DES-1", item_total: 500, tax_percentage: 16 }, { sku: "ENV-1", item_total: 36, tax_percentage: 0 }],
  ...o,
});

Deno.test("facturaDesdeDetalle y ventaSemana: categorías con IVA por línea; sin excluidas ni anuladas", () => {
  const f = facturaDesdeDetalle(inv());
  assertEquals(f.por_categoria_ci, { CAF: 500, DES: 580, otros: 36 });
  const v = ventaSemana([
    f,
    facturaDesdeDetalle(inv({ invoice_id: "F2", customer_name: "DODO PIZZA", total: 99 })),
    facturaDesdeDetalle(inv({ invoice_id: "F3", status: "void", total: 77 })),
    facturaDesdeDetalle(inv({ invoice_id: "F4", date: "2026-11-23", total: 55 })),
  ], "2026-11-16", ["DODO PIZZA", "Compras The Coffee"]);
  assertEquals(v, { semana: "2026-11-16", venta_total_ci: 1116, facturas: 1, por_categoria_ci: { CAF: 500, DES: 580, otros: 36 } });
});
