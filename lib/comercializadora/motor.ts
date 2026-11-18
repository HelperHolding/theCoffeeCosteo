import 'server-only';
import { com, leerTodoCom, ultimaProyeccion } from './consultas';
import type { Config } from './config';
import { hoyCdmx } from './fechas';
import {
  aperturasConPedidoLegado,
  aperturasPlanLegado,
  pedidosAperturaLegado,
  pedidosPlanLegado,
  primerPedidoLegado,
  type Lectura,
} from './legado';
import {
  fechaLocal,
  medianocheCdmx,
  PLAN_AP_FUERA,
  planEngDia,
  planEngDifDias,
} from '../../supabase/functions/_shared/planEngine.ts';
import {
  normalizarCfgMotor,
  planHistNecesaria,
  type DatosPlan,
  type LineaBorrador,
  type Servidor,
} from '../../supabase/functions/_shared/planDatos.ts';
import { kpiAbCalc } from '../../supabase/functions/_shared/planKpi.ts';
import { impCorrer, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import {
  cafeCorrer,
  cafeOrdenes,
  type CorridaCafe,
  type PlanCafe,
} from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal, type PlanProv } from '../../supabase/functions/_shared/planProv.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

export const SIN_DATOS_PLAN = 'No se pudieron leer los datos del plan. Intenta de nuevo.';
export const SIN_CONFIG = 'No se pudo leer la configuración del plan. Intenta de nuevo.';
const VIDA_MS = 10 * 60 * 1000; // como _planAsegurar: los datos crudos se reutilizan 10 minutos

// com_catalogo con las columnas que usa el plan (el viejo leía '*').
const CATALOGO =
  'sku,nombre,estatus,categoria,costo_unitario,saldo_cedis,saldo_yulius,zoho_stock,zoho_stock_fisico,zoho_sync_at,' +
  'zoho_actualizado,cantidad_por_apertura,minimo_compra_pzas,multiplo_compra,dias_seguridad,created_at,' +
  'proveedor_preferido,origen,zoho_vendor_id,clasificacion_detallada';

/** _planSrvMotivo: corrida vacía o con distinto número de filas que las que el log dice que guardó. */
export function planSrvMotivo(resumen: { filas?: unknown } | null, n: number): string | null {
  if (!resumen || resumen.filas == null) return null;
  const esp = Number(resumen.filas);
  if (esp === 0) return 'corrida vacía';
  if (Number.isFinite(esp) && n !== esp) return 'corrida incompleta (se está recalculando)';
  return null;
}

const SIN_SRV = (motivo: string | null, calc: string | null = null): Servidor => ({
  ok: false,
  motivo,
  calc,
  compras: [],
  pagos: [],
  sinCosto: [],
  sinProveedor: [],
});

/** La simulación del servidor (com-proyeccion), si hay una corrida de menos de 36 h (bloque R.srv de _planDatCargar). */
export async function servidorPlan(db: unknown, ahora: number): Promise<Servidor> {
  try {
    const p = await ultimaProyeccion(db);
    const calc = p?.resumen.calculado_at ?? null;
    if (!calc) return SIN_SRV('sin corrida');
    const edad = (ahora - new Date(calc).getTime()) / 36e5;
    if (!(edad <= 36)) return SIN_SRV(`corrida de hace ${isNaN(edad) ? '?' : Math.round(edad)} h`, calc);
    const filas = await leerTodoCom<Fila>(
      db,
      'com_pago_proyectado',
      'id,sku,tipo,fecha_oc,fecha_pago,cantidad,monto',
      'id',
      (q) => q.eq('calculado_at', calc),
    );
    const mot = planSrvMotivo(p!.resumen, filas.length);
    if (mot) return SIN_SRV(mot, calc);
    const r = p!.resumen as Fila;
    return {
      ok: true,
      motivo: null,
      calc,
      compras: filas
        .filter((x) => x.tipo === 'proyectado')
        .map((x) => ({ sku: x.sku, fecha_oc: x.fecha_oc, cantidad: x.cantidad, monto: x.monto })),
      pagos: filas.map((x) => ({ sku: x.sku, tipo: x.tipo, fecha_pago: x.fecha_pago, monto: x.monto })),
      sinCosto: Array.isArray(r.sinCosto) ? r.sinCosto : [],
      sinProveedor: Array.isArray(r.sinProveedor) ? r.sinProveedor : [],
    };
  } catch (e) {
    return SIN_SRV('error: ' + ((e as Error)?.message || String(e)));
  }
}

/** Pipeline de aperturas (como Inicio del viejo): lo que no está operando, cancelado ni es corporativo está en proceso. */
export const normalizarAperturas = <A extends { estatus: string | null }>(aps: A[]) =>
  aps.map((a) => ({
    ...a,
    estatusOrig: a.estatus,
    estatus: PLAN_AP_FUERA[a.estatus as string] ? a.estatus : 'en_proceso',
  }));

const opcional = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/**
 * Port de _planDatCargar: lee com_* con la sesión y los pedidos del sitio viejo por el puente (llave de servicio).
 * Catálogo, lead times, mapeo, compras, por enviar y pedidos son obligatorios; aperturas, pedidos de apertura, kits,
 * conteos, borradores de Zoho y la simulación del servidor degradan con un aviso.
 */
export async function cargarDatosPlan(
  db: unknown,
  hoy: string,
  hist: number,
  ahora: number,
): Promise<Lectura<DatosPlan>> {
  // _planDiaAtras(hist-1).toISOString(): la medianoche de CDMX de hace hist-1 días.
  const corte = new Date(medianocheCdmx(planEngDia(hoy, -(hist - 1)))).toISOString();
  let base: [
    Fila[],
    { sku: string; dias: number | null }[],
    { shopify_nombre: string; sku: string }[],
    Fila[],
    Fila[],
  ];
  try {
    base = await Promise.all([
      leerTodoCom<Fila>(db, 'com_catalogo', CATALOGO, 'sku', (q) => q.neq('estatus', 'Inactivo')),
      leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
      leerTodoCom<{ shopify_nombre: string; sku: string }>(
        db,
        'com_sku_mapping',
        'shopify_nombre,sku',
        'shopify_nombre',
      ),
      leerTodoCom<Fila>(
        db,
        'com_movimientos',
        'id,sku,folio,fecha,fecha_arribo,cantidad,cantidad_recibida,monto,proveedor',
        'id',
        (q) => q.eq('tipo', 'compra'),
      ),
      leerTodoCom<Fila>(
        db,
        'com_movimientos',
        'id,sku,folio,cantidad,fecha,fecha_envio,created_at',
        'id',
        (q) => q.eq('tipo', 'venta').eq('estado', 'por_enviar'),
      ),
    ]);
  } catch {
    return { ok: false, error: SIN_DATOS_PLAN };
  }
  const [cat, lt, map, oc, comp] = base;
  const [pedidos, primero, aperturas, pedAper, conteos, borr, srv, zprov] = await Promise.all([
    pedidosPlanLegado((q) => q.gte('fecha_pedido', corte)),
    primerPedidoLegado(),
    aperturasPlanLegado(),
    pedidosAperturaLegado(),
    opcional(
      leerTodoCom<Fila>(db, 'com_movimientos', 'id,sku,origen,fecha_conteo,fecha,created_at', 'id', (q) =>
        q.eq('tipo', 'ajuste').eq('motivo', 'Conteo físico'),
      ),
    ),
    opcional(
      leerTodoCom<LineaBorrador>(
        db,
        'com_zoho_oc_lineas',
        'zoho_po_id,po_number,sku,vendor_name,fecha_oc,cantidad,cantidad_recibida,precio,synced_at',
        'zoho_po_id',
        (q) => q.eq('status', 'draft').order('sku'),
      ),
    ),
    servidorPlan(db, ahora),
    // Plan 3e: mínimos de proveedor de Zoho para la agrupación por proveedor (Qué pedir de café), como R.zprov del viejo.
    // Plan 3f: también los días de crédito, para el viernes de pago de Esta semana.
    opcional(
      leerTodoCom<{
        vendor_id: string;
        nombre: string | null;
        minimo_compra: number | null;
        dias_credito: number | null;
      }>(db, 'com_zoho_proveedor', 'vendor_id,nombre,minimo_compra,dias_credito', 'vendor_id'),
    ),
  ]);
  if (!pedidos.ok) return { ok: false, error: pedidos.error };
  const avisos: string[] = [];
  if (!aperturas.ok) avisos.push('aperturas');
  if (!pedAper.ok) avisos.push('pedidos_apertura');
  if (!conteos) avisos.push('conteos');
  if (!borr) avisos.push('borradores de Zoho');
  if (!zprov) avisos.push('mínimos de proveedor');
  const aps = normalizarAperturas(aperturas.ok ? aperturas.datos : []);
  // Historia real: días desde el primer pedido de la base (si no se pudo leer, alcanza la ventana pedida).
  let histReal = hist;
  const fp = primero.ok && primero.datos ? new Date(primero.datos).getTime() : NaN;
  if (!isNaN(fp)) histReal = Math.max(1, planEngDifDias(hoy, fechaLocal(fp)) + 1);
  // Aperturas por abrir que ya hicieron su pedido de kit (en cualquier fecha): no vuelven a sumar demanda de apertura.
  const kit: Record<string, boolean> = {};
  const ids = aps.filter((a) => a.estatus === 'en_proceso' || !a.estatus).map((a) => a.id);
  if (ids.length) {
    const k = await aperturasConPedidoLegado(ids);
    if (k.ok) k.datos.forEach((id) => (kit[id] = true));
    else avisos.push('kits');
  }
  // Último conteo por artículo y ubicación (CEDIS / Yulius): contar una bodega no cuenta como contar la otra.
  const conteoUlt: DatosPlan['conteoUlt'] = { cedis: {}, yulius: {} };
  (conteos ?? []).forEach((x) => {
    const f = String(x.fecha_conteo || x.fecha || x.created_at || '').slice(0, 10);
    const ub = String(x.origen || 'CEDIS').toLowerCase() === 'yulius' ? 'yulius' : 'cedis';
    if (f && (!conteoUlt[ub][x.sku] || f > conteoUlt[ub][x.sku])) conteoUlt[ub][x.sku] = f;
  });
  return {
    ok: true,
    datos: {
      hoy,
      hist,
      histReal,
      cat,
      pedidos: pedidos.datos,
      lt,
      map,
      oc,
      comp,
      aperturas: aps,
      pedAper: pedAper.ok ? pedAper.datos : [],
      kit,
      conteoUlt,
      ocZohoBorr: borr ?? [],
      zprov: zprov ?? [],
      srv,
      avisos,
      cargadoEn: ahora,
    },
  };
}

export type Motor = { ok: true; R: DatosPlan; cfg: Config; version: number } | { ok: false; error: string };

// Caché en memoria del servidor, compartida entre usuarios (decisión 4): com_* se protege por módulo, no por usuario, así
// que todos los que pueden leer Comercializadora ven los mismos datos. Se pierde al reiniciar la instancia.
let cache: { t: number; R: DatosPlan } | null = null;
let memo = new Map<string, unknown>();
// Revisión 3d (I2): una sola carga a la vez por día + historia; las visitas simultáneas esperan la misma.
let enCurso: { k: string; p: ReturnType<typeof cargarDatosPlan> } | null = null;

/** "Actualizar": la siguiente lectura vuelve a la base y al puente. */
export function limpiarMotor() {
  cache = null;
  memo = new Map();
  enCurso = null;
}

/**
 * Datos crudos y configuración guardada para el motor (_planAsegurar). La configuración se lee siempre (una fila); los
 * datos se reutilizan si son del mismo día de CDMX, alcanzan la historia que pide la configuración y tienen < 10 min.
 */
export async function motorPlan(db: unknown, ahora: Date = new Date()): Promise<Motor> {
  const c = await com(db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
  if (c.error) return { ok: false, error: SIN_CONFIG };
  const cfg = normalizarCfgMotor(c.data?.config ?? null);
  const hoy = hoyCdmx(ahora);
  const hist = planHistNecesaria(cfg);
  const t = ahora.getTime();
  if (!cache || cache.R.hoy !== hoy || cache.R.hist < hist || t - cache.t > VIDA_MS) {
    const k = `${hoy}|${hist}`;
    if (!enCurso || enCurso.k !== k) {
      const p = cargarDatosPlan(db, hoy, hist, t).finally(() => {
        if (enCurso?.p === p) enCurso = null;
      });
      enCurso = { k, p };
    }
    const r = await enCurso.p;
    if (!r.ok) return r;
    if (cache?.R !== r.datos) {
      cache = { t, R: r.datos };
      memo = new Map();
    }
  }
  return { ok: true, R: cache.R, cfg, version: Number(c.data?.version ?? 0) };
}

/** Resultado de un cálculo sobre el motor, una vez por datos + configuración (_kpiAbObtener; hasta 6 a la vez). */
export function memoMotor<T>(m: { R: DatosPlan; cfg: Config }, tipo: string, fn: () => T): T {
  const k = `${tipo}|${m.R.cargadoEn}|${JSON.stringify(m.cfg)}`;
  if (memo.has(k)) return memo.get(k) as T;
  if (memo.size > 6) memo.clear();
  const v = fn();
  memo.set(k, v);
  return v;
}

export type MotorListo = Extract<Motor, { ok: true }>;
/** Indicadores de abasto y riesgo de quiebre (_kpiAbCalc) del motor: una vez por datos + configuración. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const indicadoresMotor = (m: MotorListo): any =>
  memoMotor(m, 'kpi', () => kpiAbCalc(m.R, m.cfg, Date.now()));

/** Importaciones (plan 3e): la corrida del modelo de la Sheet con el escenario de la vista, una vez por datos + configuración. */
export const importacionesMotor = (m: MotorListo, esc?: string | null): CorridaImp =>
  memoMotor(m, `imp|${esc ?? ''}`, () => impCorrer(m.R, m.cfg, esc));
/** Café (plan 3e): la proyección del año con el escenario de la vista. */
export const cafeMotor = (m: MotorListo, esc?: string | null): CorridaCafe =>
  memoMotor(m, `cafe|${esc ?? ''}`, () => cafeCorrer(m.R, m.cfg, esc));
/** Qué pedir de café (plan 3e): el plan de abasto solo con café tostado, agrupado por proveedor. */
export const cafeOrdenesMotor = (m: MotorListo): PlanCafe =>
  memoMotor(m, 'cafe-ordenes', () => cafeOrdenes(m.R, m.cfg));
/**
 * Plan local completo (plan 3f, Plan de abastos y Esta semana): con la simulación del servidor si está vigente (≤ 36 h y
 * completa) y agrupado por proveedor. A diferencia de DOH e Indicadores (decisión 5 del 3d), no usa planSinSrv.
 */
export const planLocalMotor = (m: MotorListo): PlanProv =>
  memoMotor(m, 'plan-local', () => planLocal(m.R, m.cfg));
