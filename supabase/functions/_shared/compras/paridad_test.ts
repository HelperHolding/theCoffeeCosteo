// supabase/functions/_shared/compras/paridad_test.ts
// Paridad contra el tablero «Gestión de Compras» (Gestion_Compras_Comercializadora_41.html, datos de Zoho al 23 nov 2026).
import { assertEquals } from "@std/assert";
import { CATEGORIAS, facturaDesdeDetalle, ocDesdeDetalle, ventaSemana } from "./reglas.ts";

const d = JSON.parse(await Deno.readTextFile(new URL("../pruebas/compras-2026-11.json", import.meta.url)));
const excluir = ["DODO PIZZA", "Compras The Coffee"];
const facturas = d.facturas.map(facturaDesdeDetalle);
const ocs = d.ocs.map((po: unknown) => ocDesdeDetalle(po, d.recepciones ?? {}));
const enSemana = (f: string, l: string, fin: string) => f >= l && f <= fin;

// __DATA__.semanas del tablero.
const TABLERO = {
  "2026-11-16": {
    vt: 1193333.39, vc: { CAF: 399850, BEB: 213405, DES: 279340, DEL: 43885, BA: 86757, LIM: 22101, FOD: 17622, RTD: 16633 },
    rx: 477634, rxc: { CAF: 252000, BEB: 107940, DES: 37061, DEL: 13311, BA: 1518, LIM: 10604, FOD: 24679, RTD: 20357 },
    oc_n: 20, reg_n: 2,
  },
};

Deno.test("paridad: venta por categoría 16–22 nov igual al tablero", () => {
  const t = TABLERO["2026-11-16"];
  const v = ventaSemana(facturas, "2026-11-16", excluir);
  assertEquals(Math.round(v.venta_total_ci * 100) / 100, t.vt);
  for (const c of CATEGORIAS) assertEquals(Math.round(v.por_categoria_ci[c] ?? 0), t.vc[c], c);
});

Deno.test("paridad: compras recibidas 16–22 nov (sin OCs de registro) igual al tablero", () => {
  const t = TABLERO["2026-11-16"];
  const recs = ocs.filter((x: { oc: { es_registro: boolean } }) => !x.oc.es_registro)
    .flatMap((x: { recepciones: { fecha: string; monto: number; por_categoria: Record<string, number> }[] }) => x.recepciones)
    .filter((r: { fecha: string }) => enSemana(r.fecha, "2026-11-16", "2026-11-22"));
  assertEquals(Math.round(recs.reduce((a: number, r: { monto: number }) => a + r.monto, 0)), t.rx);
  // Por categoría el tablero redondea distinto (limpieza 10,604 vs 10,604.6): tolerancia de un peso.
  for (const c of CATEGORIAS) {
    const x = recs.reduce((a: number, r: { por_categoria: Record<string, number> }) => a + (r.por_categoria[c] ?? 0), 0);
    assertEquals(Math.abs(x - t.rxc[c]) <= 1, true, `${c}: ${x} vs ${t.rxc[c]}`);
  }
});

Deno.test("paridad: OCs elaboradas y de registro 16–22 nov igual al tablero (sin borradores)", () => {
  const t = TABLERO["2026-11-16"];
  const sem = ocs.filter((x: { oc: { emision: string; estado: string } }) => enSemana(x.oc.emision, "2026-11-16", "2026-11-22") && x.oc.estado !== "draft");
  assertEquals(sem.filter((x: { oc: { es_registro: boolean } }) => !x.oc.es_registro).length, t.oc_n);
  assertEquals(sem.filter((x: { oc: { es_registro: boolean } }) => x.oc.es_registro).length, t.reg_n);
});
