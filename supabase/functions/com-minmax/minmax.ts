import { type Apertura, fechasKit, kitApertura, type MapaSku, minMax, normalizarNombre, type Pedido } from "../_shared/calculo.ts";
import { aPlanCfg, leerConfig, type PlanCfg, registrar, type SupabaseClient, todo } from "../_shared/db.ts";
import { proyectarYGuardar, type ResumenCierre } from "./pagos.ts";
import { avisarCierres } from "./avisosCierre.ts";
import { hoyCdmx, sumarDias } from "../_shared/fechas.ts";
import { demandaPlan, demandaPlanCurva, medianocheCdmx, mergeCfg, serieDiaria } from "../_shared/planEngine.ts";

export type Entradas = {
  // deno-lint-ignore no-explicit-any
  hoy: string; cfg: PlanCfg; plan: any; // plan: configuración completa del Plan (mergeCfg), la que usa el motor de pronóstico
  catalogo: { sku: string; estatus: string; created_at: string | null; zoho_lead_time: number | null; cantidad_por_apertura?: number | null; dias_seguridad?: number | null }[];
  leadTimes: Record<string, number>;
  pedidos: Pedido[]; idsApertura: string[]; mapa: MapaSku;
  mapaPlan: { shopify_nombre: string; sku: string }[]; // com_sku_mapping tal cual (el Plan busca por nombre exacto)
  primerPedido: string | null; // fecha del primer pedido de la base: limita la historia que ve el motor
  aperturas: Apertura[]; kitManual: Record<string, number | null>;
};
export type Resultado = {
  kits: { sku: string; promedio_calc: number; aperturas_muestra: number }[];
  minmax: { sku: string; venta_diaria: number; lead_time: number; kits_min: number; kits_max: number;
    minimo_calc: number; maximo_calc: number; nota: string | null }[];
  sinMapa: number; aperturasProximas: number;
  kitUsado: Record<string, number>; fechasKit: string[]; // kit por SKU (manual o promedio) y fechas de aperturas próximas, para la proyección de pagos
  serie: Serie; // serie de ventas que usó el cálculo: solo interna (la reutiliza la proyección), nunca se escribe en la base
};
export type Serie = ReturnType<typeof serieDiaria>;

const r2 = (x: number) => Math.round(x * 100) / 100;

// Serie diaria de ventas regulares como la arma el Plan (los pedidos de apertura nunca cuentan: entran como kits).
// Con hist = ventana el motor da lo mismo que en la app (que lee ≥ 84 días): la tasa solo mira min(ventana, vida, historia real).
function serieDe(e: Entradas): Serie {
  return serieDiaria({ cfg: e.plan, hoy: e.hoy, hist: Number(e.plan.consumo.ventana), primerPedido: e.primerPedido,
    pedidos: e.pedidos, catalogo: e.catalogo, mapa: e.mapaPlan, pedidosApertura: e.idsApertura, aperturas: e.aperturas });
}

// Demanda acumulada D(h) del pronóstico del Plan para h = 0..H por SKU (la que usa el mín/máx, ahora para toda la proyección),
// en una sola pasada por SKU y con la serie que ya armó calcular().
export function curvasDemanda(e: Entradas, serie: Serie, H: number, skus: string[]): Record<string, number[]> {
  return Object.fromEntries(skus.map((sku) =>
    [sku, demandaPlanCurva(e.plan, sku, serie.u[sku] ?? [], serie.hist, e.hoy, serie.vida[sku], H)]));
}

export function calcular(e: Entradas): Resultado {
  const ids = new Set(e.idsApertura);
  const serie = serieDe(e);
  const kitUsado: Record<string, number> = {};
  const kitsCalc = kitApertura(e.pedidos.filter((p) => ids.has(p.id)), e.mapa);
  const fechas = fechasKit(e.aperturas, e.hoy, e.cfg.aper.antelacion, e.cfg.aper.vencida_max);

  const kits = Object.entries(kitsCalc).map(([sku, k]) => ({ sku, promedio_calc: r2(k.promedio), aperturas_muestra: k.muestra }))
    .sort((a, b) => a.sku.localeCompare(b.sku));

  const minmax: Resultado["minmax"] = [];
  for (const c of e.catalogo) {
    if (c.estatus !== "Compra Recurrente") continue;
    if (e.cfg.compra.excluir_cafe && c.sku.startsWith("INS-CAF-")) continue;
    let nota: string | null = null;
    let lt = c.zoho_lead_time ?? e.leadTimes[c.sku];
    if (lt == null) { lt = e.cfg.compra.lt_default; nota = "lead time por defecto"; }
    const kitCat = c.cantidad_por_apertura == null ? null : Number(c.cantidad_por_apertura);
    const kit = e.kitManual[c.sku] ?? (kitCat != null && Number.isFinite(kitCat) && kitCat > 0 ? kitCat : undefined) ?? kitsCalc[c.sku]?.promedio ?? 0;
    kitUsado[c.sku] = kit;
    const segSku = c.dias_seguridad == null ? null : Number(c.dias_seguridad);
    const seg = segSku != null && Number.isFinite(segSku) && segSku >= 0 ? segSku : e.cfg.seg.dias;
    const cobertura = e.cfg.auto.cobertura_dias;
    // Horizonte en días enteros como H en el Plan: min(h_max, ⌈⌈LT⌉ + días⌉).
    const horizonte = (dias: number) => Math.min(Number(e.plan.compra.h_max), Math.ceil(Math.ceil(lt!) + dias));
    const hMin = horizonte(seg), hMax = horizonte(seg + cobertura);
    const demanda = (h: number) => demandaPlan(e.plan, c.sku, serie.u[c.sku] ?? [], serie.hist, e.hoy, serie.vida[c.sku], h).D;
    const demandaMin = demanda(hMin), demandaMax = demanda(hMax);
    const v = hMin > 0 ? demandaMin / hMin : 0; // pronóstico promedio por día en el horizonte del mínimo
    const m = minMax({ demandaMin, demandaMax, lt, seg, cobertura, kit, fechas, hoy: e.hoy });
    minmax.push({ sku: c.sku, venta_diaria: r2(v), lead_time: lt, kits_min: r2(m.kitsMin), kits_max: r2(m.kitsMax),
      minimo_calc: r2(m.minimo), maximo_calc: r2(m.maximo), nota });
  }
  return { kits, minmax, sinMapa: serie.sinMapa, aperturasProximas: fechas.length, kitUsado, fechasKit: fechas, serie };
}

export async function cargarEntradas(db: SupabaseClient, hoy: string): Promise<Entradas> {
  const guardada = await leerConfig(db);
  const cfg = aPlanCfg(guardada), plan = mergeCfg(guardada);
  // Mismo corte que el Plan: medianoche (CDMX) de hace hist−1 días.
  const corte = new Date(medianocheCdmx(sumarDias(hoy, -(Number(plan.consumo.ventana) - 1)))).toISOString();
  const [catalogo, lts, mapa, pedApe, aperturas, kitMan, primero] = await Promise.all([
    todo<{ sku: string; estatus: string; created_at: string | null; zoho_lead_time: number | null; cantidad_por_apertura: number | null; dias_seguridad: number | null }>((a, b) =>
      db.from("com_catalogo").select("sku,estatus,created_at,zoho_lead_time,cantidad_por_apertura,dias_seguridad").neq("estatus", "Inactivo").order("sku").range(a, b)),
    todo<{ sku: string; dias: number }>((a, b) => db.from("com_lead_times").select("sku,dias").order("sku").range(a, b)),
    todo<{ shopify_nombre: string; sku: string }>((a, b) => db.from("com_sku_mapping").select("shopify_nombre,sku").order("shopify_nombre").range(a, b)),
    todo<{ pedido_id: string }>((a, b) => db.from("pedidos_apertura").select("pedido_id").not("pedido_id", "is", null).order("pedido_id").range(a, b)),
    todo<{ id: string; estatus: string | null; fecha: string | null }>((a, b) => db.from("aperturas").select("id,estatus,fecha").order("id").range(a, b)),
    todo<{ sku: string; manual: number | null }>((a, b) => db.from("com_kit_apertura").select("sku,manual").order("sku").range(a, b)),
    // Primer pedido de la base (como el Plan: si la consulta falla se asume que la historia alcanza la ventana).
    db.from("pedidos").select("fecha_pedido").order("fecha_pedido", { ascending: true }).limit(1),
  ]);
  const idsApertura = pedApe.map((p) => String(p.pedido_id));
  const cols = "id,apertura_id,fecha_pedido,status,items,items_editados,franquiciatario_email,notas_shopify,es_llenado_canal,marketing_proyecto_id";
  const recientes = await todo<Pedido>((a, b) => db.from("pedidos").select(cols).gte("fecha_pedido", corte).order("id").range(a, b));
  const deApertura: Pedido[] = [];
  for (let i = 0; i < idsApertura.length; i += 100) {
    const { data, error } = await db.from("pedidos").select(cols).in("id", idsApertura.slice(i, i + 100));
    if (error) throw error;
    deApertura.push(...((data ?? []) as Pedido[]));
  }
  const vistos = new Set(recientes.map((p) => p.id));
  const pedidos = [...recientes, ...deApertura.filter((p) => !vistos.has(p.id))];

  const enPipeline = aperturas.map((a) => String(a.id));
  const conPedido = new Set<string>();
  // Paginado: las aperturas ya abiertas acumulan cientos de pedidos y un solo request se corta en 1000 filas.
  for (let i = 0; i < enPipeline.length; i += 100) {
    const lote = enPipeline.slice(i, i + 100);
    const data = await todo<{ apertura_id: string }>((a, b) => db.from("pedidos").select("apertura_id")
      .in("apertura_id", lote).not("status", "in", '("cancelado","cancelacion_pendiente")').order("id").range(a, b));
    for (const p of data) conPedido.add(String(p.apertura_id));
  }

  return {
    hoy, cfg, plan, catalogo,
    leadTimes: Object.fromEntries(lts.map((l) => [l.sku, Number(l.dias)])),
    pedidos, idsApertura,
    mapa: Object.fromEntries(mapa.map((m) => [normalizarNombre(m.shopify_nombre), m.sku])),
    mapaPlan: mapa,
    primerPedido: primero.error ? null : (primero.data?.[0]?.fecha_pedido ?? null),
    aperturas: aperturas.map((a) => ({ id: String(a.id), estatus: a.estatus, fecha: a.fecha ? String(a.fecha).slice(0, 10) : null, conPedido: conPedido.has(String(a.id)) })),
    kitManual: Object.fromEntries(kitMan.filter((k) => k.manual != null).map((k) => [k.sku, Number(k.manual)])),
  };
}

export async function escribir(db: SupabaseClient, r: Resultado, ahora: string): Promise<void> {
  if (r.kits.length) {
    const { error } = await db.from("com_kit_apertura").upsert(r.kits.map((k) => ({ ...k, calculado_at: ahora })), { onConflict: "sku" });
    if (error) throw error;
  }
  for (let i = 0; i < r.minmax.length; i += 500) {
    const { error } = await db.from("com_minmax").upsert(r.minmax.slice(i, i + 500).map((m) => ({ ...m, calculado_at: ahora })), { onConflict: "sku" });
    if (error) throw error;
  }
  // Un cálculo vacío (p. ej. catálogo que no cargó) nunca debe vaciar la tabla ni borrar los mín/máx manuales.
  if (!r.minmax.length) return;
  const vigentes = r.minmax.map((m) => m.sku);
  const { error } = await db.from("com_minmax").delete().not("sku", "in", `(${vigentes.map((s) => `"${s}"`).join(",")})`);
  if (error) throw error;
}

export async function recalcular(db: SupabaseClient, hoy = hoyCdmx()) {
  const e = await cargarEntradas(db, hoy);
  const r = calcular(e);
  await escribir(db, r, new Date().toISOString());
  // La proyección de pagos nunca frena el mín/máx ni las OCs: si falla queda registrada y la pantalla conserva la anterior.
  const proyeccion = await registrar(db, "com-proyeccion", () => proyectarYGuardar(db, e, r))
    .catch((err) => ({ error: String((err as Error)?.message ?? err) }));
  // Los avisos de cierres nunca tumban el recálculo.
  let avisos: { enviados: number; error?: string } | undefined;
  const cierres = (proyeccion as { cierres?: ResumenCierre[]; error?: string });
  if (!cierres.error && Array.isArray(cierres.cierres)) {
    try { avisos = await avisarCierres(db, e.cfg.auto.correos, hoy, cierres.cierres); }
    catch (err) { avisos = { enviados: 0, error: String((err as Error)?.message ?? err) }; }
  }
  return { skus: r.minmax.length, sinMapa: r.sinMapa, aperturasProximas: r.aperturasProximas, proyeccion, avisos };
}
