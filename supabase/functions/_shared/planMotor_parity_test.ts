// deno-lint-ignore-file no-explicit-any
// Paridad del motor completo: _planEngAperturasDetalle, _planEngSku y _planEngine de la app contra planMotor.ts.
// Mismo código portado, mismas operaciones: la salida debe ser IDÉNTICA (assertEquals), no "cercana".
import { assert, assertEquals } from "@std/assert";
import { planEngAperturasDetalle, planEngine, planEngSku } from "./planMotor.ts";
import { app, NOMBRES_MOTOR, serie, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";

const HOY = "2026-11-02";
const A = SIN_APP ? null : app(NOMBRES_MOTOR, STUBS_MOTOR, HOY);

const CFGS: Record<string, any> = {
  defecto: {},
  estadistico: { consumo: { ventana: 84 }, seg: { metodo: "estadistico", servicio: 0.99, revision: 5, lt_cv: 0.2, prefijo: { "INS-VAS": 15 } } },
  bloqueo_si_cubre: { compra: { bloqueo_oc: "si_cubre", bloqueo_umbral: 0.3, semanas: 26, bt_semanas: 8, prox_dias: 7 } },
  bloqueo_nunca: { compra: { bloqueo_oc: "nunca", ciclo_nac: 21, h_max: 30 }, inv: { base: "fisico", yulius: true } },
  aper_tasa: { aper: { modo: "tasa", por_mes: 8, horizonte: 20, horizonte_auto: true } },
  aper_mayor: { aper: { modo: "mayor", por_mes: 2, antelacion: 10, peso_sin_fecha: 0.25,
    ajustes: { ap3: { incluir: true, fecha: "2026-11-20", peso: 2 }, ap2: { incluir: false } } } },
  sin_aper: { aper: { incluir: false }, compra: { prox_dias: 14, bt_semanas: 12 } },
  temporada: { consumo: { crecimiento: 5, divisor: "vida" }, temp: { activa: true, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1.2, 1.5, 2] },
    eventos: [{ id: "bf", ini: "2026-11-10", fin: "2026-11-20", factor: 1.8, alcance: "todos" }] },
};

const APERTURAS = [
  { id: "ap1", fecha: "2026-11-15", estatus: "en_proceso", kit: false },
  { id: "ap2", fecha: "2026-12-20", estatus: "en_proceso", kit: false },
  { id: "ap3", fecha: null, estatus: "activa", kit: false },
  { id: "ap4", fecha: null, estatus: "en_proceso", kit: false },
  { id: "ap5", fecha: "2026-08-01", estatus: "en_proceso", kit: false },   // vencida (> 45 días)
  { id: "ap6", fecha: "2026-11-05", estatus: "en_proceso", kit: true },    // ya hizo su kit
];

const TIPOS = ["regular", "picos", "esporadico", "cero", "nuevo", "sube"];
function skus(): any[] {
  const out: any[] = [];
  TIPOS.forEach((t, i) => {
    const u = serie(t, i + 1);
    out.push(
      { sku: `INS-VAS-00${i}`, u, vida: 400, fisico: 40, comprometido: 5, yulius: 12, enOC: 0, costo: 18, lt: 7, porApertura: 2, minPzas: 0, multiplo: 1 },
      { sku: `ALI-JAR-00${i}`, u, vida: i === 4 ? 9 : null, fisico: "x", comprometido: null, yulius: "", enOC: 30, costo: -4, lt: "12.5", porApertura: 0, minPzas: 24, multiplo: 6, diasSeg: "5" },
      { sku: `IMP-TER-00${i}`, u, vida: 30, fisico: 500, comprometido: 0, yulius: 0, enOC: 100, costo: 90, lt: 60, porApertura: 1, minPzas: 0, multiplo: 1, diasSeg: 0 },
      { sku: `EMP-TAP-00${i}`, u, vida: 200, fisico: -3, comprometido: 2, yulius: 0, enOC: 0, costo: 2, lt: 0, porApertura: 0, minPzas: 10, multiplo: 1 },
    );
  });
  out.push({ sku: "AGO-001", u: serie("regular", 9), estatus: "Hasta Agotar Existencias", fisico: 1 });
  out.push({ sku: "INA-001", u: serie("regular", 9), estatus: "Inactivo", fisico: 1 });
  return out;
}

Deno.test({ name: "paridad: planEngine (todas las filas, todos los campos) = _planEngine", ignore: SIN_APP }, () => {
  let filas = 0;
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const hist of [120, 84, 20]) {
      const cfg = A._planCfgNormalizar(c0);
      if (n === "bloqueo_nunca") { cfg.compra.ciclo_imp = 45; cfg.compra.bloqueo_oc_imp = "siempre"; } // claves que el motor lee aunque la configuración no las tenga
      const raw = { hoy: HOY, hist, skus: skus(), aperturas: APERTURAS };
      const app = A._planEngine(cfg, raw), srv = planEngine(cfg, raw);
      assertEquals(srv, app, `${n} hist=${hist}`);
      assertEquals(planEngAperturasDetalle(cfg, raw), A._planEngAperturasDetalle(cfg, raw), `${n} aperturas`);
      filas += srv.rows.length;
    }
  }
  assert(filas >= 500);
});

Deno.test({ name: "paridad: el motor sí ejercita cada rama (acciones, urgencias, bloqueo, estadística, seguimiento)", ignore: SIN_APP }, () => {
  const vistos = new Set<string>();
  for (const [n, c0] of Object.entries(CFGS)) {
    const cfg = A._planCfgNormalizar(c0);
    const r = planEngine(cfg, { hoy: HOY, hist: 120, skus: skus(), aperturas: APERTURAS });
    for (const x of r.rows) {
      vistos.add("accion:" + x.accion); vistos.add("urg:" + x.urgencia); vistos.add("seg:" + x.seg_efectiva);
      if (x.bloqueado) vistos.add("bloqueado");
      if (x.importacion) vistos.add("importacion");
      if (x.paraAper > 0) vistos.add("aperturas:" + n);
      if (x.datos_invalidos.length) vistos.add("invalidos");
      if (x.btProy.some((p: number | null) => p !== null)) vistos.add("bt");
      if (x.sem.slice(2).some((q: number) => q > 0)) vistos.add("semanas>2");
    }
  }
  for (const v of ["accion:PEDIR", "accion:PRÓXIMA", "accion:PRÓXIMA (OC emitida)", "accion:OK", "urg:Urgente", "urg:Pronto",
    "urg:Normal", "seg:estadistico", "bloqueado", "importacion", "aperturas:aper_tasa", "aperturas:aper_mayor", "invalidos", "bt", "semanas>2"]) {
    assert(vistos.has(v), "no se ejercitó " + v);
  }
});

Deno.test({ name: "paridad: planEngSku con aperturas a mano (sin fecha con tope por mes)", ignore: SIN_APP }, () => {
  const cfg = A._planCfgNormalizar(CFGS.aper_mayor);
  const raw = { hoy: HOY, hist: 84, skus: [] };
  const s0 = { sku: "INS-VAS-001", u: serie("regular", 3), vida: 400, fisico: 10, porApertura: 3, lt: 9 };
  for (const aper of [{ con: [], sinSuma: 0 }, { con: [{ dias: 5, peso: 1 }, { dias: 70, peso: 2 }], sinSuma: 3.5 }]) {
    assertEquals(planEngSku(cfg, raw, s0, aper), A._planEngSku(cfg, raw, s0, aper));
  }
});
