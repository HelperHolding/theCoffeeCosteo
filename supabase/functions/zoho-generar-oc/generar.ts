import { cantidadAPedir } from "../_shared/calculo.ts";
import { enviarCorreo } from "../_shared/correo.ts";
import { cargarConfig, esColumnaFaltante, type SupabaseClient, todo } from "../_shared/db.ts";
import { type Cierre, cargarCierres, cerradoEn, periodosDe } from "../_shared/cierres.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import type { FilaPago } from "../_shared/proyeccion.ts";
import type { ZohoClient } from "../_shared/zoho.ts";
import { cargarFilas, type Fila } from "../_shared/posicion.ts";
import { recalcular } from "../com-minmax/minmax.ts";

export type { Fila };
export { enviarCorreo };

export type Linea = {
  sku: string; nombre: string; item_id: string; cantidad: number; costo: number; disponible: number; enCamino: number;
  minimo: number; maximo: number; venta_diaria: number; kits: number;
  adelanto_cierre?: boolean; cierre_tarde?: boolean; adelanto_minimo?: boolean;
};
export type Propuesta = {
  porProveedor: { vendor_id: string; vendor_name: string; lineas: Linea[]; monto: number; bajo_minimo?: boolean; minimo?: number }[];
  aCorregir: { sku: string; nombre: string; cantidad: number; motivo: string }[];
};

export const MSG_MODO_SIMULACION = "Las OCs automáticas están en modo simulación; cámbialo a Real en Configuración";

const r2 = (x: number) => Math.round(x * 100) / 100;
const pesos = (x: number) => "$" + x.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export type AjusteCierre = {
  cerrados: Set<string>;
  cobertura: Map<string, { cantidad: number; cierre_id: number; adelanto: boolean; tarde: boolean }>;
};

/** SKUs cuyo proveedor está cerrado hoy (no se les pide nada). */
export function skusCerrados(filas: Fila[], cierres: Cierre[], hoy: string): Set<string> {
  const out = new Set<string>();
  for (const f of filas) if (cerradoEn(periodosDe(cierres, f.sku, f.zoho_vendor_id, hoy), hoy)) out.add(f.sku);
  return out;
}

/** Compras de cobertura de la simulación que caen hoy: la OC automática pide lo mismo que el día 0 de la proyección. */
export function ajusteDesdeProyeccion(
  pagos: Pick<FilaPago, "tipo" | "sku" | "fecha_oc" | "cantidad" | "cierre_id" | "adelanto_cierre" | "cierre_tarde" | "adelanto_minimo">[],
  hoy: string, cerrados: Set<string>,
): AjusteCierre {
  const cobertura: AjusteCierre["cobertura"] = new Map();
  for (const p of pagos) {
    if (p.tipo !== "proyectado" || p.cierre_id == null || p.fecha_oc > hoy || p.adelanto_minimo) continue; // lo adelantado por mínimo va en `extra`
    const c = cobertura.get(p.sku);
    if (c) { c.cantidad += Number(p.cantidad); c.adelanto ||= !!p.adelanto_cierre; c.tarde ||= !!p.cierre_tarde; }
    else cobertura.set(p.sku, { cantidad: Number(p.cantidad), cierre_id: p.cierre_id, adelanto: !!p.adelanto_cierre, tarde: !!p.cierre_tarde });
  }
  return { cerrados, cobertura };
}

/** Mínimo de compra por proveedor: compras que la simulación adelantó a hoy (extra por SKU) y proveedores que no llegan al mínimo. */
export type AjusteMinimo = { extra: Map<string, number>; bajo: Set<string> };

export function ajusteMinimoDesdeProyeccion(
  pagos: Pick<FilaPago, "tipo" | "sku" | "vendor_id" | "fecha_oc" | "cantidad" | "adelanto_minimo" | "bajo_minimo">[], hoy: string,
): AjusteMinimo {
  const extra = new Map<string, number>();
  const bajo = new Set<string>();
  for (const p of pagos) {
    if (p.tipo !== "proyectado" || p.fecha_oc > hoy) continue;
    if (p.adelanto_minimo) extra.set(p.sku, (extra.get(p.sku) ?? 0) + Number(p.cantidad));
    if (p.bajo_minimo) bajo.add(p.vendor_id);
  }
  return { extra, bajo };
}

export function proponer(filas: Fila[], sumarYulius: boolean, ajuste?: AjusteCierre, minimos?: AjusteMinimo): Propuesta {
  const grupos = new Map<string, Propuesta["porProveedor"][number]>();
  const aCorregir: Propuesta["aCorregir"] = [];
  for (const f of filas) {
    if (ajuste?.cerrados.has(f.sku)) continue;
    // El disponible es el inventario físico en mano de Zoho (actual_available_stock). Por decisión, NO se resta
    // lo comprometido en pedidos aún no enviados.
    const disponible = f.fisico + (sumarYulius ? f.saldo_yulius : 0);
    const cob = ajuste?.cobertura.get(f.sku);
    const qBase = cob ? cob.cantidad : cantidadAPedir({ disponible, enCamino: f.enCamino, minimo: f.minimo, maximo: f.maximo,
      multiplo: f.multiplo, minimoPzas: f.minimoPzas, enOcAbierta: f.enOcAbierta });
    const extra = minimos?.extra.get(f.sku) ?? 0; // adelantado a hoy por el mínimo del proveedor
    const q = qBase + extra;
    if (q <= 0) continue;
    const motivo = !f.zoho_item_id ? "no está ligado a Zoho" : !f.zoho_vendor_id ? "sin proveedor en Zoho" : !f.costo ? "sin costo" : null;
    if (motivo) { aCorregir.push({ sku: f.sku, nombre: f.nombre, cantidad: q, motivo }); continue; }
    const g = grupos.get(f.zoho_vendor_id!) ?? { vendor_id: f.zoho_vendor_id!, vendor_name: f.zoho_vendor_name ?? "", lineas: [], monto: 0,
      ...(minimos?.bajo.has(f.zoho_vendor_id!) ? { bajo_minimo: true } : {}) };
    g.lineas.push({ sku: f.sku, nombre: f.nombre, item_id: f.zoho_item_id!, cantidad: q, costo: f.costo!, disponible: r2(disponible),
      enCamino: f.enCamino, minimo: f.minimo, maximo: f.maximo, venta_diaria: f.venta_diaria, kits: f.kits_max,
      ...(cob?.adelanto ? { adelanto_cierre: true } : {}), ...(cob?.tarde ? { cierre_tarde: true } : {}),
      ...(extra > 0 ? { adelanto_minimo: true } : {}) });
    g.monto = r2(g.monto + q * f.costo!);
    grupos.set(f.zoho_vendor_id!, g);
  }
  aCorregir.sort((a, b) => a.sku.localeCompare(b.sku));
  return { porProveedor: [...grupos.values()].sort((a, b) => a.vendor_id.localeCompare(b.vendor_id)), aCorregir };
}

export function cuerpoOc(p: Propuesta["porProveedor"][number], fecha: string, locationId: string | null): Record<string, unknown> {
  const notas = p.lineas.map((l) =>
    `${l.sku}: disp ${l.disponible}, en camino ${l.enCamino}, mín ${l.minimo}, máx ${l.maximo}, venta/día ${l.venta_diaria}` +
    (l.kits ? `, kits ${l.kits}` : "")).join("\n");
  const b: Record<string, unknown> = {
    vendor_id: p.vendor_id,
    reference_number: "AUTO-" + fecha.replaceAll("-", ""),
    date: fecha,
    line_items: p.lineas.map((l) => ({ item_id: l.item_id, quantity: l.cantidad, rate: l.costo })),
    notes: `OC generada automáticamente por thecoffeemexico.com (borrador).\n${notas}`.slice(0, 5000),
  };
  if (locationId) b.location_id = locationId;
  return b;
}

export function correoHtml(a: {
  fecha: string; modo: "simulacion" | "real";
  creadas: { vendor_name: string; po_number: string | null; zoho_po_id?: string | null; monto: number; lineas: number;
    marcadas?: { sku: string; adelanto_cierre?: boolean; cierre_tarde?: boolean; adelanto_minimo?: boolean }[];
    minimo?: number; bajo_minimo?: boolean }[];
  aCorregir: Propuesta["aCorregir"]; errores: string[];
}): string {
  const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
  const titulo = a.modo === "simulacion" ? "SIMULACIÓN — no se creó nada en Zoho" : "Borradores creados en Zoho";
  const marcas = (c: (typeof a.creadas)[number]) => (c.marcadas ?? []).map((l) =>
    `<br><small>${esc(l.sku)}${l.adelanto_cierre ? " (adelanto por cierre)" : ""}${l.cierre_tarde ? " (cierre: ya no llega antes)" : ""}${l.adelanto_minimo ? " (adelantado por mínimo)" : ""}</small>`).join("");
  const minimoTxt = (c: (typeof a.creadas)[number]) => (c.minimo ? `<br><small>Mínimo ${pesos(c.minimo)} · OC ${pesos(c.monto)}</small>` : "") +
    (c.bajo_minimo ? "<br><small><b>no llega al mínimo</b></small>" : "");
  const filas = a.creadas.map((c) =>
    `<tr><td>${esc(c.vendor_name)}${minimoTxt(c)}${marcas(c)}</td><td>${c.po_number ? (c.zoho_po_id ? `<a href="https://books.zoho.com/app/891749429#/purchaseorders/${esc(c.zoho_po_id)}">${esc(c.po_number)}</a>` : esc(c.po_number)) : "—"}</td><td>${c.lineas}</td><td style="text-align:right">${pesos(c.monto)}</td></tr>`).join("");
  const pend = a.aCorregir.map((x) => `<li>${esc(x.sku)} ${esc(x.nombre)} (${x.cantidad}): ${esc(x.motivo)}</li>`).join("");
  const err = a.errores.map((e) => `<li>${esc(e)}</li>`).join("");
  return `<div style="font-family:sans-serif;font-size:14px">
<h2>OCs automáticas ${a.fecha}</h2><p><b>${titulo}</b></p>
${a.creadas.length ? `<table border="1" cellpadding="6" style="border-collapse:collapse"><tr><th>Proveedor</th><th>OC Zoho</th><th>Artículos</th><th>Monto</th></tr>${filas}</table>` : "<p>No hay artículos por debajo del mínimo.</p>"}
${pend ? `<h3>A corregir (no se pidieron)</h3><ul>${pend}</ul>` : ""}
${err ? `<h3>Errores</h3><ul>${err}</ul><p>Si un error fue 5xx de Zoho, la OC pudo haberse creado: revisa en Zoho las OCs con referencia AUTO-${a.fecha.replaceAll("-", "")} antes de volver a correr.</p>` : ""}
<p>Revisa y emite los borradores en Zoho Books → Compras → Órdenes de compra.</p></div>`;
}

export async function generar(db: SupabaseClient, crearZoho: (() => ZohoClient) | null,
  opts: { origen: "cron" | "manual"; modo?: "simulacion" | "real"; ahora?: Date; recalcular?: typeof recalcular }) {
  const cfg = await cargarConfig(db);
  // Solo la configuración guardada habilita crear OCs reales; el cron siempre sigue la configuración.
  const pedido = opts.origen === "cron" ? undefined : opts.modo;
  if (pedido === "real" && cfg.auto.modo !== "real") throw new Error(MSG_MODO_SIMULACION);
  const modo = pedido ?? cfg.auto.modo;
  const ahora = opts.ahora ?? new Date();
  const fecha = hoyCdmx(ahora);
  const corrida = crypto.randomUUID();

  // El último sync TERMINADO debe ser exitoso y reciente: si el último falló a media escritura,
  // las líneas de OC pueden estar incompletas y se pediría de más.
  const { data: ult } = await db.from("com_sync_log").select("inicio,fin,ok").eq("proceso", "zoho-sync").not("fin", "is", null)
    .order("inicio", { ascending: false }).limit(1).maybeSingle();
  const edadH = ult?.fin ? (ahora.getTime() - new Date(ult.fin).getTime()) / 3_600_000 : Infinity;
  if (ult && ult.ok === false || edadH > cfg.auto.max_edad_sync_horas) {
    const motivo = ult && ult.ok === false ? "el último sync con Zoho falló"
      : `datos de Zoho viejos (${Number.isFinite(edadH) ? edadH.toFixed(1) + " h" : "sin sync"})`;
    await enviarCorreo(cfg.auto.correos, `⚠ OCs automáticas ${fecha}: no se generaron`, `<p>No se generaron OCs: ${motivo}. Revisa la conexión con Zoho.</p>`);
    throw new Error(motivo);
  }

  // Candado diario del cron: cualquier OC real creada hoy (por cron o a mano) cuenta.
  if (opts.origen === "cron" && modo === "real") {
    const { count, error } = await db.from("com_oc_auto").select("id", { count: "exact", head: true })
      .eq("fecha", fecha).eq("modo", "real").eq("estado", "creada");
    if (error) throw error;
    if ((count ?? 0) > 0) return { corrida, modo, ocs: 0, lineas: 0, aCorregir: 0, errores: [] as string[], omitida: "ya corrió hoy" };
  }

  const rec = await (opts.recalcular ?? recalcular)(db, fecha);
  const filas = await cargarFilas(db, ult!.inicio);
  const errores: string[] = [];
  // Mínimo de compra por proveedor, para el correo y para avisar si la simulación no pudo adelantar compras.
  const minimoDe = new Map<string, number>();
  // Si falta la migración de mínimos (columna inexistente), la OC sale igual y sin ajuste por mínimo.
  const AVISO_MIGRACION = "mínimos de proveedor: falta aplicar la migración";
  let sinMigracion = false;
  const avisarMigracion = () => { if (!sinMigracion) { sinMigracion = true; errores.push(AVISO_MIGRACION); } };
  let provs: { vendor_id: string; minimo_compra: number | null }[] = [];
  try {
    provs = await todo<{ vendor_id: string; minimo_compra: number | null }>((a, b) => db.from("com_zoho_proveedor")
      .select("vendor_id,minimo_compra").gt("minimo_compra", 0).order("vendor_id").range(a, b));
  } catch (e) {
    if (!esColumnaFaltante(e)) throw e;
    avisarMigracion();
  }
  const enPropuesta = new Set(filas.map((x) => x.zoho_vendor_id).filter(Boolean));
  for (const v of provs) if (enPropuesta.has(v.vendor_id) && Number(v.minimo_compra) > 0) minimoDe.set(v.vendor_id, Number(v.minimo_compra));
  // Cierres de proveedor y mínimos: mismo ajuste que la simulación (día 0 de la proyección = esta OC).
  const cierres = await cargarCierres(db, fecha);
  const cerrados = cierres.length ? skusCerrados(filas, cierres, fecha) : new Set<string>();
  let ajuste: AjusteCierre | undefined;
  let ajusteMin: AjusteMinimo | undefined;
  const proy = rec?.proyeccion as { error?: string } | undefined;
  if (proy?.error) {
    if (cierres.length) {
      ajuste = { cerrados, cobertura: new Map() };
      errores.push("la simulación falló: las compras de cobertura por cierre no se incluyeron");
    }
    if (minimoDe.size) errores.push("la simulación falló: no se adelantaron compras por mínimo de proveedor");
  } else {
    // La corrida que recalcular acaba de escribir; solo si falta (p. ej. recalcular simulado) se usa la más reciente.
    let calculadoAt = (rec?.proyeccion as { calculado_at?: string } | undefined)?.calculado_at;
    if (!calculadoAt) {
      const { data: u, error: eu } = await db.from("com_pago_proyectado").select("calculado_at")
        .order("calculado_at", { ascending: false }).limit(1).maybeSingle();
      if (eu) throw eu;
      calculadoAt = u?.calculado_at;
    }
    type Pago = Parameters<typeof ajusteDesdeProyeccion>[0][number] & Parameters<typeof ajusteMinimoDesdeProyeccion>[0][number];
    let pagos: Pago[] = [];
    if (calculadoAt) {
      try {
        pagos = await todo<Pago>((a, b) => db.from("com_pago_proyectado")
          .select("tipo,sku,vendor_id,fecha_oc,cantidad,cierre_id,adelanto_cierre,cierre_tarde,adelanto_minimo,bajo_minimo")
          .eq("calculado_at", calculadoAt).eq("tipo", "proyectado")
          .or("cierre_id.not.is.null,adelanto_minimo.eq.true,bajo_minimo.eq.true").lte("fecha_oc", fecha)
          .order("sku").order("id").range(a, b)); // id desempata: la paginación no repite ni salta filas
      } catch (e) {
        if (!esColumnaFaltante(e)) throw e;
        // Sin las columnas de mínimos: solo la cobertura por cierre, como antes de la migración.
        avisarMigracion();
        const viejas = await todo<Omit<Pago, "adelanto_minimo" | "bajo_minimo">>((a, b) => db.from("com_pago_proyectado")
          .select("tipo,sku,vendor_id,fecha_oc,cantidad,cierre_id,adelanto_cierre,cierre_tarde")
          .eq("calculado_at", calculadoAt).eq("tipo", "proyectado")
          .not("cierre_id", "is", null).lte("fecha_oc", fecha)
          .order("sku").order("id").range(a, b));
        pagos = viejas.map((p) => ({ ...p, adelanto_minimo: false, bajo_minimo: false }));
      }
    }
    // ajusteDesdeProyeccion ignora las filas sin cierre_id; ajusteMinimoDesdeProyeccion solo mira las marcas de mínimo.
    if (cierres.length) ajuste = ajusteDesdeProyeccion(pagos, fecha, cerrados);
    ajusteMin = ajusteMinimoDesdeProyeccion(pagos, fecha);
  }
  const prop = proponer(filas, cfg.inv.yulius, ajuste, ajusteMin);
  for (const g of prop.porProveedor) { const m = minimoDe.get(g.vendor_id); if (m) g.minimo = m; }
  const locationId = Deno.env.get("ZOHO_LOCATION_ID") ?? null;

  const creadas: Parameters<typeof correoHtml>[0]["creadas"] = [];
  const marcadasDe = (g: Propuesta["porProveedor"][number]) => {
    const m = g.lineas.filter((l) => l.adelanto_cierre || l.cierre_tarde || l.adelanto_minimo)
      .map((l) => ({ sku: l.sku, adelanto_cierre: l.adelanto_cierre, cierre_tarde: l.cierre_tarde, adelanto_minimo: l.adelanto_minimo }));
    return { ...(m.length ? { marcadas: m } : {}), ...(g.minimo ? { minimo: g.minimo } : {}), ...(g.bajo_minimo ? { bajo_minimo: true } : {}) };
  };
  if (modo === "real" && !crearZoho) throw new Error("modo real sin cliente de Zoho");
  const z = modo === "real" ? crearZoho!() : null;
  for (const g of prop.porProveedor) {
    const fila = { corrida_id: corrida, origen: opts.origen, modo, vendor_id: g.vendor_id, vendor_name: g.vendor_name,
      lineas: g.lineas, monto: g.monto, fecha };
    if (!z) {
      const { error } = await db.from("com_oc_auto").insert({ ...fila, estado: "simulada" });
      if (error) throw error;
      creadas.push({ vendor_name: g.vendor_name, po_number: null, monto: g.monto, lineas: g.lineas.length, ...marcadasDe(g) });
      continue;
    }
    let po: { purchaseorder_id: string; purchaseorder_number: string };
    try {
      po = (await z.post<{ purchaseorder: { purchaseorder_id: string; purchaseorder_number: string } }>("/purchaseorders", cuerpoOc(g, fecha, locationId))).purchaseorder;
    } catch (e) {
      const msg = `${g.vendor_name}: ${(e as Error).message}`;
      errores.push(msg);
      const { error } = await db.from("com_oc_auto").insert({ ...fila, estado: "error", error: msg });
      if (error) throw error;
      continue;
    }
    // La OC ya existe en Zoho: si no se puede registrar, se reporta en el correo en vez de perderla.
    const { error } = await db.from("com_oc_auto").insert({ ...fila, estado: "creada", zoho_po_id: po.purchaseorder_id, po_number: po.purchaseorder_number });
    if (error) errores.push(`${g.vendor_name}: OC ${po.purchaseorder_number} creada en Zoho pero no se registró: ${(error as { message?: string }).message ?? String(error)}`);
    creadas.push({ vendor_name: g.vendor_name, po_number: po.purchaseorder_number, zoho_po_id: po.purchaseorder_id, monto: g.monto, lineas: g.lineas.length, ...marcadasDe(g) });
  }

  const enviado = await enviarCorreo(cfg.auto.correos, `OCs automáticas ${fecha}${modo === "simulacion" ? " (simulación)" : ""}: ${creadas.length} proveedor(es)`,
    correoHtml({ fecha, modo, creadas, aCorregir: prop.aCorregir, errores }));
  if (!enviado) errores.push("no se pudo enviar el correo");
  return { corrida, modo, ocs: creadas.length, lineas: prop.porProveedor.reduce((s, g) => s + g.lineas.length, 0), aCorregir: prop.aCorregir.length, errores };
}
