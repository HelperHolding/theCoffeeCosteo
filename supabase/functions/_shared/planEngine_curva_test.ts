// deno-lint-ignore-file no-explicit-any
import { assertAlmostEquals, assertEquals } from "@std/assert";
import { demandaPlan, demandaPlanCurva, mergeCfg } from "./planEngine.ts";

// Serie de 60 días con semanas dispares (para que mediana/percentil sean robustos) y un pico.
const u = Array.from({ length: 60 }, (_, k) => (k % 7 === 0 ? 9 : 2 + (k % 3)) + (k === 10 ? 40 : 0));
const casos: { nombre: string; cfg: any; u: number[]; vida: any }[] = [
  { nombre: "promedio", cfg: mergeCfg({ consumo: { ventana: 56, metodo: "promedio" } }), u, vida: 400 },
  { nombre: "promedio recortado", cfg: mergeCfg({ consumo: { ventana: 56, metodo: "promedio" }, picos: { manejo: "recortar" } }), u, vida: 400 },
  { nombre: "mediana", cfg: mergeCfg({ consumo: { ventana: 56, metodo: "mediana" } }), u, vida: 400 },
  { nombre: "percentil", cfg: mergeCfg({ consumo: { ventana: 56, metodo: "percentil", pctl: 80 } }), u, vida: 400 },
  { nombre: "ponderado", cfg: mergeCfg({ consumo: { ventana: 56, metodo: "ponderado" } }), u, vida: 400 },
  { nombre: "temporalidad", cfg: mergeCfg({ consumo: { ventana: 30 }, temp: { activa: true, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 2.5, 0.5], prefijo: {} } }), u, vida: 400 },
  { nombre: "crecimiento 5", cfg: mergeCfg({ consumo: { ventana: 30, crecimiento: 5 } }), u, vida: 400 },
  { nombre: "vida corta", cfg: mergeCfg({ consumo: { ventana: 30, divisor: "vida" } }), u, vida: 4 },
  { nombre: "sin ventas", cfg: mergeCfg({ consumo: { ventana: 30 } }), u: [], vida: null },
];

for (const c of casos) {
  Deno.test(`demandaPlanCurva = demandaPlan(h).D para h = 0..120 (${c.nombre})`, () => {
    const curva = demandaPlanCurva(c.cfg, "V", c.u, 60, "2026-10-30", c.vida, 120);
    assertEquals(curva.length, 121);
    assertEquals(curva[0], 0);
    for (let h = 0; h <= 120; h++) assertAlmostEquals(curva[h], demandaPlan(c.cfg, "V", c.u, 60, "2026-10-30", c.vida, h).D, 1e-9);
  });
}
