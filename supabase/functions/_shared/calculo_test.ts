import { assertEquals } from "@std/assert";
import { difDias, sumarDias, hoyCdmx } from "./fechas.ts";
import {
  cantidadAPedir, contarHasta, fechasKit, itemsDe, kitApertura, minMax, skuDe, type Pedido,
} from "./calculo.ts";

const mapa = { "vaso 12 oz": "INS-DES-021", "cafe white": "INS-CAF-003" };
const ped = (id: string, fecha: string, items: unknown, extra: Partial<Pedido> = {}): Pedido =>
  ({ id, fecha_pedido: fecha + "T12:00:00Z", status: "enviado", items: items as never, items_editados: null, ...extra });

Deno.test("fechas", () => {
  assertEquals(difDias("2026-10-01", "2026-10-31"), 30);
  assertEquals(sumarDias("2026-10-30", 3), "2026-11-02");
  assertEquals(hoyCdmx(new Date("2026-10-31T03:00:00Z")), "2026-10-30");
});

Deno.test("skuDe usa sku del ítem o el mapeo por nombre", () => {
  assertEquals(skuDe({ sku: "A-1", cantidad: 1 }, mapa), "A-1");
  assertEquals(skuDe({ nombre: "  Vaso 12 OZ ", cantidad: 1 }, mapa), "INS-DES-021");
  assertEquals(skuDe({ nombre: "desconocido", cantidad: 1 }, mapa), null);
});

Deno.test("kitApertura promedia incluyendo ceros", () => {
  const k = kitApertura([
    ped("a", "2026-09-01", [{ nombre: "vaso 12 oz", cantidad: 3 }, { nombre: "cafe white", cantidad: 18 }]),
    ped("b", "2026-10-01", [{ nombre: "cafe white", cantidad: 17 }]),
  ], mapa);
  assertEquals(k["INS-DES-021"], { promedio: 1.5, muestra: 1 });
  assertEquals(k["INS-CAF-003"], { promedio: 17.5, muestra: 2 });
});

Deno.test("fechasKit filtra estatus, pedido hecho, sin fecha y vencidas", () => {
  const f = fechasKit([
    { id: "1", estatus: "en_proceso", fecha: "2026-12-14", conPedido: false }, // kit 2026-11-14
    { id: "2", estatus: "en_proceso", fecha: "2026-11-10", conPedido: false }, // kit pasada → hoy
    { id: "3", estatus: "activa", fecha: "2026-12-01", conPedido: false },
    { id: "4", estatus: "en_proceso", fecha: "2026-12-01", conPedido: true },
    { id: "5", estatus: "en_proceso", fecha: null, conPedido: false },
    { id: "6", estatus: "firmada", fecha: "2026-09-01", conPedido: false },    // vencida 59 días
  ], "2026-10-30", 30, 45);
  assertEquals(f.sort(), ["2026-10-30", "2026-11-14"]);
});

Deno.test("contarHasta incluye el límite", () => {
  assertEquals(contarHasta(["2026-10-30", "2026-11-14", "2026-12-20"], "2026-10-30", 15), 2);
});

Deno.test("minMax según la fórmula acordada", () => {
  const r = minMax({ demandaMin: 340, demandaMax: 640, lt: 7, seg: 10, cobertura: 15, kit: 2,
    fechas: ["2026-11-05", "2026-11-20"], hoy: "2026-10-30" });
  assertEquals(r.kitsMin, 2);   // solo 2026-11-05 cae en 17 días
  assertEquals(r.kitsMax, 4);   // ambas caen en 32 días
  assertEquals(r.minimo, 342);  // D(17) + 2
  assertEquals(r.maximo, 644);  // D(32) + 4
});

Deno.test("cantidadAPedir: no pide arriba del mínimo ni con OC abierta", () => {
  const base = { minimo: 340, maximo: 640, multiplo: null, minimoPzas: null, enOcAbierta: false };
  assertEquals(cantidadAPedir({ ...base, disponible: 341, enCamino: 0 }), 0);
  assertEquals(cantidadAPedir({ ...base, disponible: 100, enCamino: 0, enOcAbierta: true }), 0);
  assertEquals(cantidadAPedir({ ...base, disponible: 300, enCamino: 40 }), 300);
});

Deno.test("cantidadAPedir redondea a entero, múltiplo y mínimo de piezas", () => {
  assertEquals(cantidadAPedir({ disponible: 0, enCamino: 0, minimo: 0.4, maximo: 1.3, multiplo: null, minimoPzas: null, enOcAbierta: false }), 2);
  assertEquals(cantidadAPedir({ disponible: 0, enCamino: 0, minimo: 5, maximo: 13, multiplo: 6, minimoPzas: null, enOcAbierta: false }), 18);
  assertEquals(cantidadAPedir({ disponible: 0, enCamino: 0, minimo: 1, maximo: 3, multiplo: null, minimoPzas: 10, enOcAbierta: false }), 10);
});

Deno.test("cantidadAPedir con venta cero y mínimo cero no pide", () => {
  assertEquals(cantidadAPedir({ disponible: 0, enCamino: 0, minimo: 0, maximo: 0, multiplo: null, minimoPzas: null, enOcAbierta: false }), 0);
});

Deno.test("itemsDe ignora JSON que no es arreglo y cae a items", () => {
  const p = ped("1", "2026-10-20", [{ nombre: "vaso 12 oz", cantidad: 5 }], { items_editados: '{"a":1}' });
  assertEquals(itemsDe(p).length, 1);
  assertEquals(itemsDe(ped("2", "2026-10-20", '"texto"')), []);
  assertEquals(itemsDe(ped("3", "2026-10-20", { no: "arreglo" })), []);
});

Deno.test("cantidades no numéricas cuentan 0 (kit nunca NaN)", () => {
  const pedidos = [ped("1", "2026-10-20", [{ nombre: "vaso 12 oz", cantidad: "abc" }, { nombre: "vaso 12 oz", cantidad: 30 },
    { nombre: "vaso 12 oz", cantidad: Infinity }])];
  assertEquals(kitApertura(pedidos, mapa)["INS-DES-021"], { promedio: 30, muestra: 1 });
});

Deno.test("cantidadAPedir con máximo menor que el mínimo usa el mínimo como máximo", () => {
  assertEquals(cantidadAPedir({ disponible: 0, enCamino: 0, minimo: 50, maximo: 10, multiplo: null, minimoPzas: null, enOcAbierta: false }), 50);
});
