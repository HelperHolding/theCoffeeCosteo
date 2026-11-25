// supabase/functions/_shared/reporte/surtido_test.ts
import { assertEquals, assertAlmostEquals } from "@std/assert";
import { calcularSurtido, origenIncidencia, primerEnvio } from "./surtido.ts";
import { configReporteDef } from "./config.ts";
import type { Ov, Paquete } from "./tipos.ts";

const ov = (o: Partial<Ov>): Ov => ({ id: "1", numero: "OV-1", fecha: "2026-11-16", cliente: "CLIENTE X", sucursal: "S", tipoEnvio: "Ordinario", incidencia: "", resolucion: "", estado: "invoiced", estadoEnvio: "fulfilled", ...o });
const pk = (ovn: string, envio: string): Paquete => ({ ov: ovn, fecha: envio || "2026-11-16", envio });
const cfg = configReporteDef();

Deno.test("origenIncidencia: valores de Zoho", () => {
  assertEquals(origenIncidencia("Sin stock - Pedido incompleto"), "stock");
  assertEquals(origenIncidencia("Pedido Incompleto"), "pickeo");
  assertEquals(origenIncidencia("Derrame de Produto"), "paqueteria");
  assertEquals(origenIncidencia("Extravío"), "paqueteria");
  assertEquals(origenIncidencia(""), null);
  assertEquals(origenIncidencia("Otra cosa"), "otro");
});

Deno.test("primerEnvio: el menor shipment_date por OV, ignora los no enviados", () => {
  const m = primerEnvio([pk("A", "2026-11-20"), pk("A", "2026-11-17"), pk("B", "")]);
  assertEquals(m.get("A"), "2026-11-17");
  assertEquals(m.has("B"), false);
});

Deno.test("surtido: un paquete posterior al domingo no saca de la semana a la OV con incidencia sin enviar", () => {
  const s = calcularSurtido(
    [ov({ numero: "A", fecha: "2026-11-20", incidencia: "Sin stock - Pedido incompleto" }), ov({ numero: "B", fecha: "2026-11-24" })],
    [pk("A", "2026-11-24"), pk("B", "2026-11-24")],
    cfg, "2026-11-16");
  assertEquals(s.enviados, 1);
  assertEquals(s.casos.stock, 1);
  assertEquals(s.envio.universo, 0);
});

Deno.test("surtido: universo por primer envío; reposición de OV vieja no cuenta", () => {
  const s = calcularSurtido(
    [ov({ numero: "A" }), ov({ numero: "B", incidencia: "Sin stock - Pedido incompleto" }), ov({ numero: "C", fecha: "2026-11-02" }),
     ov({ numero: "D", incidencia: "Pedido Incompleto" }), ov({ numero: "E", incidencia: "Derrame de Produto" })],
    [pk("A", "2026-11-17"), pk("B", "2026-11-18"), pk("C", "2026-11-04"), pk("C", "2026-11-19"), pk("E", "2026-11-18")],
    cfg, "2026-11-16");
  // A, B, E por envío; D por incidencia sin enviar; C excluida (su primer envío fue antes).
  assertEquals(s.enviados, 4);
  assertEquals(s.casos, { stock: 1, pickeo: 1, paqueteria: 1, otro: 0 });
  assertEquals(s.conFaltante, 2);
  assertEquals(s.incidenciasTotal, 3);
  assertAlmostEquals(s.fill.valor!, 0.5, 1e-9);
  assertEquals(s.fill.cumple, false);
  assertAlmostEquals(s.pickeo.valor!, 0.75, 1e-9);
  assertEquals(s.incidencias.map((i) => i.ov), ["E", "D", "B"]);
});

Deno.test("surtido: envío ≤2 días hábiles solo externos sin aperturas", () => {
  const s = calcularSurtido(
    [ov({ numero: "A", fecha: "2026-11-12" }), ov({ numero: "B" }), ov({ numero: "C", cliente: "SUCURSALES THE COFFEE-VENTURA", fecha: "2026-11-02" }),
     ov({ numero: "D", tipoEnvio: "Apertura", fecha: "2026-11-02" })],
    [pk("A", "2026-11-18"), pk("B", "2026-11-17"), pk("C", "2026-11-17"), pk("D", "2026-11-17")],
    cfg, "2026-11-16");
  assertEquals(s.envio.universo, 2);
  assertEquals(s.envio.enMeta, 1);
  assertEquals(s.envio.buckets, [0, 1, 0, 1]);
  assertEquals(s.envio.fuera, [{ ov: "A", sucursal: "S", fecha: "2026-11-12", envio: "2026-11-18", dias: 4 }]);
});

Deno.test("surtido: sin OVs no da NaN", () => {
  const s = calcularSurtido([], [], cfg, "2026-11-16");
  assertEquals(s.fill.valor, null);
  assertEquals(s.fill.cumple, null);
  assertEquals(s.envio.valor, null);
});
