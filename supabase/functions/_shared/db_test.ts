import { assertEquals } from "@std/assert";
import { aPlanCfg } from "./db.ts";

Deno.test("aPlanCfg: pagos_horizonte no numérico usa 90; los numéricos se acotan a [30, 180]", () => {
  const h = (v: unknown) => aPlanCfg({ auto: { pagos_horizonte: v } }).auto.pagos_horizonte;
  assertEquals(h("abc"), 90);
  assertEquals(h(NaN), 90);
  assertEquals(h(Infinity), 90);
  assertEquals(h(undefined), 90);
  assertEquals(h(10), 30);
  assertEquals(h(500), 180);
  assertEquals(h("120"), 120);
});

Deno.test("aPlanCfg: defaults de mínimos de proveedor (consolidar, 14 días, campo de Zoho)", () => {
  const c = aPlanCfg({});
  assertEquals([c.compra.min_prov, c.compra.min_ventana_dias, c.auto.zoho_cf_minimo], ["consolidar", 14, "cf_minimo_de_compra_mxn"]);
  const d = aPlanCfg({ compra: { min_prov: "avisar", min_ventana_dias: "21" }, auto: { zoho_cf_minimo: "cf_x" } });
  assertEquals([d.compra.min_prov, d.compra.min_ventana_dias, d.auto.zoho_cf_minimo], ["avisar", 21, "cf_x"]);
  assertEquals(aPlanCfg({ compra: { min_prov: "otro", min_ventana_dias: "abc" } }).compra.min_ventana_dias, 14);
});
