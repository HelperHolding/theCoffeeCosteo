import { cargarAbiertas, cargarFilas } from "../_shared/posicion.ts";
import { type FilaPago, fechaPago, proyectar } from "../_shared/proyeccion.ts";
import { aplicarMinimos } from "../_shared/minimos.ts";
import { sumarDias } from "../_shared/fechas.ts";
import { esColumnaFaltante, type SupabaseClient, todo } from "../_shared/db.ts";
import { alcanceCierres, aplica, cargarCierres, cerradoEn, diaPedidoReportado, llegadaAjustada, periodosDe } from "../_shared/cierres.ts";
import { curvasDemanda, type Entradas, type Resultado } from "./minmax.ts";

export type ResumenCierre = { id: number; vendor_id: string; vendor_name: string; ini: string; fin: string;
  u: string | null; skus_afectados: number; monto_adelanto: number; aviso7_at: string | null; aviso0_at: string | null };

export async function guardarProyeccion(db: SupabaseClient, filas: FilaPago[], calculadoAt: string): Promise<void> {
  if (!filas.length) return; // una proyección vacía nunca borra la anterior
  try {
    // Sin la migración de mínimos faltan las columnas adelanto_minimo/bajo_minimo: se reintenta sin ellas (una vez detectado, para todos los lotes).
    let sinMarcas = false;
    const quitar = (f: FilaPago) => { const { adelanto_minimo: _a, bajo_minimo: _b, ...r } = f as FilaPago & { adelanto_minimo?: boolean; bajo_minimo?: boolean }; return r; };
    for (let i = 0; i < filas.length; i += 500) {
      const lote = filas.slice(i, i + 500);
      const armar = () => lote.map((f) => ({ ...(sinMarcas ? quitar(f) : f), calculado_at: calculadoAt }));
      let { error } = await db.from("com_pago_proyectado").insert(armar());
      if (error && !sinMarcas && esColumnaFaltante(error)) {
        sinMarcas = true;
        ({ error } = await db.from("com_pago_proyectado").insert(armar()));
      }
      if (error) throw error;
    }
  } catch (err) {
    await db.from("com_pago_proyectado").delete().eq("calculado_at", calculadoAt); // nunca dejar una corrida a medias
    throw err;
  }
  const { error } = await db.from("com_pago_proyectado").delete().lt("calculado_at", calculadoAt);
  if (error) throw error;
}

export async function proyectarYGuardar(db: SupabaseClient, e: Entradas, r: Resultado) {
  const { data: ult } = await db.from("com_sync_log").select("inicio").eq("proceso", "zoho-sync").eq("ok", true)
    .not("fin", "is", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
  type Prov = { vendor_id: string; nombre: string | null; dias_credito: number; minimo_compra: number | null };
  const cargarProvs = async (): Promise<Prov[]> => {
    try {
      return await todo<Prov>((a, b) => db.from("com_zoho_proveedor").select("vendor_id,nombre,dias_credito,minimo_compra").order("vendor_id").range(a, b));
    } catch (err) {
      if (!esColumnaFaltante(err)) throw err;
      // Falta la migración de mínimos: sin mínimos (la proyección se guarda igual).
      const filas = await todo<Omit<Prov, "minimo_compra">>((a, b) => db.from("com_zoho_proveedor").select("vendor_id,nombre,dias_credito").order("vendor_id").range(a, b));
      return filas.map((v) => ({ ...v, minimo_compra: null }));
    }
  };
  const [filas, abiertas, provs, cierres] = await Promise.all([
    cargarFilas(db, ult?.inicio ?? new Date().toISOString()),
    cargarAbiertas(db),
    cargarProvs(),
    cargarCierres(db, e.hoy),
  ]);
  const H = e.cfg.auto.pagos_horizonte;
  // La cobertura de un cierre mira la demanda hasta R, que puede pasar de H: las curvas se extienden hasta ahí.
  const ltMax = filas.reduce((m, f) => Math.max(m, Number(f.lead_time) || 0), 0);
  const Hc = Math.min(H + 400, H + alcanceCierres(cierres, e.hoy, ltMax));
  const p = proyectar({
    hoy: e.hoy, horizonte: H, base: e.cfg.auto.pagos_base, sumarYulius: e.cfg.inv.yulius, filas,
    curvas: curvasDemanda(e, r.serie, Hc, filas.map((f) => f.sku)), kit: r.kitUsado, fechasKit: r.fechasKit,
    credito: Object.fromEntries(provs.map((v) => [v.vendor_id, Number(v.dias_credito) || 0])), abiertas, ltDefault: e.cfg.compra.lt_default,
    cierres,
  });
  // Mínimos de compra por proveedor: la simulación adelanta compras para alcanzarlos (o solo avisa) antes de guardar.
  const minimos = Object.fromEntries(provs.filter((v) => Number(v.minimo_compra) > 0).map((v) => [v.vendor_id, Number(v.minimo_compra)]));
  const credito = Object.fromEntries(provs.map((v) => [v.vendor_id, Number(v.dias_credito) || 0]));
  const ltPorSku = new Map(filas.map((f) => [f.sku, f.lead_time]));
  const ajustadas = aplicarMinimos(p.filas, {
    minimos, hoy: e.hoy, ventana: e.cfg.compra.min_ventana_dias, modo: e.cfg.compra.min_prov,
    reprogramar: (f, nueva) => {
      const lt = ltPorSku.get(f.sku) ?? e.cfg.compra.lt_default;
      const llegada = llegadaAjustada(periodosDe(cierres, f.sku, f.vendor_id, e.hoy), sumarDias(nueva, lt));
      return { fecha_llegada: llegada, fecha_pago: fechaPago(e.cfg.auto.pagos_base, credito, f.vendor_id, nueva, llegada) };
    },
    cerradoPara: (sku, v, d) => !!cerradoEn(periodosDe(cierres, sku, v, e.hoy), d),
  });
  const resumenCierres: ResumenCierre[] = [...cierres].sort((a, b) => a.ini.localeCompare(b.ini) || a.id - b.id).map((c) => {
    const afectadas = filas.filter((f) => aplica(c, f.sku, f.zoho_vendor_id));
    // u = el día "pide antes del" más temprano entre los artículos afectados (ver diaPedidoReportado: día efectivo si un
    // cierre anterior adelanta la compra; si no, U tal cual aunque ya haya pasado).
    const u = afectadas.map((f) => diaPedidoReportado(periodosDe(cierres, f.sku, f.zoho_vendor_id, e.hoy), c.ini, e.hoy, f.lead_time))
      .filter((d): d is string => d != null).sort()[0] ?? null;
    const monto = ajustadas.filter((f) => f.cierre_id === c.id && f.adelanto_cierre).reduce((s, f) => s + f.monto, 0);
    return { id: c.id, vendor_id: c.vendor_id, vendor_name: c.vendor_name ?? "", ini: c.ini, fin: c.fin, u, skus_afectados: afectadas.length,
      monto_adelanto: Math.round(monto * 100) / 100, aviso7_at: c.aviso7_at ?? null, aviso0_at: c.aviso0_at ?? null };
  });
  const calculado_at = new Date().toISOString();
  await guardarProyeccion(db, ajustadas, calculado_at);
  const resumenMinimos = provs.filter((v) => Number(v.minimo_compra) > 0).map((v) => {
    const fv = ajustadas.filter((f) => f.tipo === "proyectado" && f.vendor_id === v.vendor_id);
    const bajo = new Set(fv.filter((f) => f.bajo_minimo).map((f) => f.fecha_oc));
    const adel = fv.filter((f) => f.adelanto_minimo).reduce((s, f) => s + f.monto, 0);
    return { vendor_id: v.vendor_id, vendor_name: v.nombre ?? "", minimo: Number(v.minimo_compra), ocs_bajo_minimo: bajo.size,
      monto_adelantado: Math.round(adel * 100) / 100 };
  });
  const suma = (t: string) => Math.round(ajustadas.filter((f) => f.tipo === t).reduce((s, f) => s + f.monto, 0) * 100) / 100;
  return { calculado_at, filas: ajustadas.length, proyectado: suma("proyectado"), comprometido: suma("comprometido"),
    sinCosto: p.sinCosto, sinProveedor: p.sinProveedor, cierres: resumenCierres, minimos: resumenMinimos };
}
