// deno-lint-ignore-file no-explicit-any
// Paridad de "Sugerir piezas por apertura": _planPzasApCalc de la app contra planPiezas.ts.
import { assert, assertEquals } from "@std/assert";
import { normalizarCfgMotor } from "./planDatos.ts";
import { planPzasApCalc, preseleccionar } from "./planPiezas.ts";
import { app, rng, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { aperturasNorm, CAT, HOY, MAPA, NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";

const A = SIN_APP ? null : app([...NOMBRES_DATOS, "_planPzasApCalc"], STUBS_MOTOR, HOY);

/** 30 aperturas con su kit (una o dos órdenes), algunas sin fecha, más pedidos de kit sin sucursal y resurtido. */
function escenario() {
  const r = rng(5), aperturas: any[] = [], pedidos: any[] = [], pedAper: any[] = [];
  for (let i = 0; i < 30; i++) {
    const id = "A" + String(i).padStart(2, "0"), fecha = i % 7 === 0 ? null : `2026-${String(1 + (i % 10)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`;
    aperturas.push({ id, estatus: i % 3 ? "activa" : "en_proceso", fecha });
    for (let k = 0; k < 1 + (i % 2); k++) {
      const items = [{ sku: "INS-VAS-001", cantidad: 50 + Math.round(r() * 100) }, { nombre: "Mermelada", cantidad: i === 4 ? 500 : Math.round(r() * 6) },
        { nombre: "Tapa", cantidad: r() < 0.3 ? 2 : 0 }, { sku: "ins-nue-005", cantidad: r() < 0.1 ? "x" : 1 }];
      const pid = `${id}-${k}`;
      pedidos.push({ id: pid, apertura_id: id, fecha_pedido: `2026-0${1 + (i % 9)}-15T18:00:00Z`, status: "enviado", items, items_editados: null,
        notas_shopify: k ? "Kit de apertura (2a parte)" : null });
      if (i % 4 === 0) pedAper.push({ pedido_id: pid });
    }
  }
  pedidos.push({ id: "suelto", apertura_id: null, fecha_pedido: "2026-10-01T18:00:00Z", status: "enviado", notas_shopify: "pedido de apertura", items: [{ sku: "INS-VAS-001", cantidad: 9 }] });
  pedidos.push({ id: "resurtido", apertura_id: "A01", fecha_pedido: "2026-11-01T18:00:00Z", status: "enviado", items: [{ sku: "INS-VAS-001", cantidad: 9 }] });
  return { pedidos, R: { aperturas: aperturasNorm(aperturas), pedAper, map: MAPA, cat: CAT } };
}

Deno.test({ name: "paridad: planPzasApCalc = _planPzasApCalc", ignore: SIN_APP }, () => {
  const { pedidos, R } = escenario();
  for (const c0 of [{}, { consumo: { items: "originales" }, aper: { gracia_dias: 0, vencida_max: 10 } }]) {
    for (const n of [3, 20, 200]) {
      const cfg = normalizarCfgMotor(c0);
      assertEquals(planPzasApCalc(pedidos, R, cfg, n), A._planPzasApCalc(pedidos, R, A._planCfgNormalizar(c0), n), `${JSON.stringify(c0)} n=${n}`);
    }
  }
});

Deno.test("piezas: tope de 3 veces la mediana, kits sin sucursal aparte y preselección", () => {
  const { pedidos, R } = escenario();
  const res = planPzasApCalc(pedidos, R, normalizarCfgMotor({}), 20);
  assertEquals(res.N, 20);
  assertEquals(res.sinAtribuir, 1);
  const mer = res.filas.find((f) => f.sku === "ALI-JAR-003")!;
  assert(mer.sug <= 3 * mer.mediana);
  const vaso = res.filas.find((f) => f.sku === "INS-VAS-001")!;
  assertEquals(preseleccionar(vaso), Math.abs(vaso.sug - 100) / 100 > 0.15);
  assertEquals(preseleccionar({ ...vaso, n: 2 }), false);
  assertEquals(preseleccionar({ ...vaso, actual: 0 }), true);
});
