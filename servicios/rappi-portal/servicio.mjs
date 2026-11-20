// Convierte lo que devuelven las consultas de Nivel de servicio y Conectividad del portal de Rappi Partners al lote de
// public.rappi_importar_servicio (docs/rappi-portal/08). Funciones puras: el lector hace las consultas.

const entero = (v) => (Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v)) : null);
const decimal = (v) =>
  Number.isFinite(Number(v)) && v !== null && v !== '' ? Math.round(Number(v) * 100) / 100 : null;
/** ID numérico del portal (1930384164) al de rappi_tiendas (MX1930384164). */
export const tiendaMX = (id) => (/^MX\d+$/.test(String(id)) ? String(id) : `MX${id}`);
/** Al revés, para las consultas que piden el número. */
export const tiendaNum = (t) => Number(String(t).replace(/^MX/, ''));

const RECHAZOS = {
  REJECTION_CBPI: 'rech_cbpi',
  REJECTION_CBPR: 'rech_cbpr',
  REJECTION_CLOSED_STORE: 'rech_tienda_cerrada',
  REJECTION_STOCK_OUT: 'rech_sin_stock',
  REJECTION_DELAY_IN_STORE: 'rech_demora',
};
const RECLAMOS = {
  ERROR_DAMAGED: 'recl_mal_estado',
  ERROR_MISSING: 'recl_faltante',
  ERROR_WRONG: 'recl_incorrecto',
};

/**
 * indicators/v2/summary/metrics de UNA tienda (display_mode DAYS: rangos de hasta 31 días) → una fila por día.
 * Con MONTHS (rango largo) no sirve por día: se rechaza para no guardar un mes como si fuera un día.
 */
export function diasDeMetricas(tienda, j) {
  if (!j || j.display_mode !== 'DAYS')
    throw new Error(`Métricas de ${tienda}: se esperaba DAYS (${j?.display_mode}).`);
  const dias = new Map();
  const fila = (fecha) => {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error(`Métricas de ${tienda}: fecha ${fecha}.`);
    if (!dias.has(fecha)) dias.set(fecha, { tienda, fecha });
    return dias.get(fecha);
  };
  for (const c of j.rejection_metrics?.columns ?? []) {
    const f = fila(c.col_key);
    f.pedidos = entero(c.total_orders);
    for (const p of c.partitions ?? []) if (RECHAZOS[p.type]) f[RECHAZOS[p.type]] = entero(p.quantity) ?? 0;
  }
  for (const c of j.error_metrics?.columns ?? []) {
    const f = fila(c.col_key);
    f.finalizados = entero(c.total_orders);
    for (const p of c.partitions ?? []) if (RECLAMOS[p.type]) f[RECLAMOS[p.type]] = entero(p.quantity) ?? 0;
  }
  for (const c of j.availability_metrics?.columns ?? []) {
    const p = (c.partitions ?? []).find((x) => x.type === 'AVAILABILITY');
    if (p) fila(c.col_key).disponibilidad = decimal(p.percentage);
  }
  for (const c of j.unavailability_metrics?.columns ?? []) {
    const p = (c.partitions ?? []).find((x) => x.type === 'UNAVAILABILITY');
    if (p) fila(c.col_key).indisponibilidad = decimal(p.percentage);
  }
  for (const c of j.cooking_time_metrics?.columns ?? []) {
    const f = fila(c.col_key);
    f.cocina_pedidos = entero(c.total_orders);
    const p = (c.partitions ?? []).find((x) => x.type === 'COOKINGTIME_DELAY');
    f.cocina_demorada = p ? (entero(p.quantity) ?? 0) : 0;
  }
  return [...dias.values()];
}

/** indicators/unavailability/metrics de UN día (todas las tiendas) → minutos y eventos por franja. */
export const indisponibilidadDia = (fecha, j) =>
  (Array.isArray(j) ? j : []).map((x) => ({
    tienda: tiendaMX(x.store_id),
    fecha,
    sin_disp_minutos: entero(x.total_unavailability) ?? 0,
    sin_disp_franjas: {
      madrugada: entero(x.early_morning) ?? 0,
      manana: entero(x.morning) ?? 0,
      mediodia: entero(x.noon) ?? 0,
      tarde: entero(x.afternoon) ?? 0,
      noche: entero(x.night) ?? 0,
    },
  }));

/** summary/sales/indicators de UNA tienda y UN día → espera promedio del repartidor (minutos). */
export function esperaDia(tienda, fecha, j) {
  const v = decimal(j?.rt_wait_time?.average?.value);
  return v === null ? null : { tienda, fecha, espera_repartidor: v };
}

/**
 * Reclamos de indicators/defects. La tienda sale del pedido (si el lector lo listó) o del nombre de la tienda; si no
 * se puede saber, el reclamo va a `sinTienda` (se reporta, no se adivina).
 */
export function reclamosDe(ordenes, { tiendaDePedido, tiendaDeNombre }) {
  const reclamos = [];
  const sinTienda = [];
  for (const o of ordenes ?? []) {
    const pedido = String(o.order_id ?? '').replace(/^MX/, '');
    const fecha = String(o.order_date ?? '').slice(0, 10);
    if (!/^\d{5,20}$/.test(pedido) || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) continue;
    const tienda = tiendaDePedido.get(pedido) ?? tiendaDeNombre.get(String(o.store_name ?? '').trim());
    if (!tienda) {
      sinTienda.push(pedido);
      continue;
    }
    reclamos.push({
      pedido,
      tienda,
      fecha,
      motivo: String(o.reason ?? ''),
      subtipo: o.level_1 ?? null,
      producto: o.product_name ?? null,
      comentario: o.comments ?? null,
      monto: decimal(o.amount_local_currency),
    });
  }
  return { reclamos, sinTienda };
}

/** store-status-detail/retrieve → foto de conectividad. */
export const conectividadDe = (j) =>
  (Array.isArray(j) ? j : []).map((x) => ({
    tienda: tiendaMX(x.store_id),
    estado: String(x.status ?? ''),
    motivo: x.second_message && x.second_message !== '-' ? String(x.second_message) : '',
    cierre: x.first_message && x.first_message !== '-' ? String(x.first_message) : '',
  }));

const DIAS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
/** availability-monitoring → {"06:00": {"mon": 0, …, "sun": 1}, …} (fracción del tiempo disponible, 15 días). */
export function matrizSemana(j) {
  const m = {};
  for (const [hora, dias] of Object.entries(j?.availability ?? {})) {
    if (!/^\d{2}:\d{2}$/.test(hora) || !Array.isArray(dias)) continue;
    m[hora] = {};
    for (const d of dias)
      if (DIAS.includes(d.day)) m[hora][d.day] = Math.round(Number(d.value) * 1000) / 1000;
  }
  return m;
}

/** rests-score/performance-system → categoría actual y próxima por tienda. */
export const topDe = (fecha, j) =>
  (j?.performance ?? [])
    .filter((x) => x.store_id && x.cal_actual)
    .map((x) => ({
      tienda: tiendaMX(x.store_id),
      fecha,
      categoria: String(x.cal_actual),
      proxima: x.prox_cal ?? null,
    }));

const sumarDias = (fecha, n) => {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

/**
 * Qué lee de Nivel de servicio cada corrida (docs/rappi-portal/08 §2). `hoy` es la fecha en México y `minuto` el minuto
 * de la hora en México: en vivo, los indicadores de hoy solo en la corrida de cada hora (la de :07).
 * - vivo: conectividad siempre; cada hora, indicadores, espera del repartidor y reclamos de hoy, y Top Restaurantes.
 * - cierre: conectividad; indicadores y reclamos de los 7 días anteriores (Rappi corrige tarde), espera de ayer, calor de
 *   15 días y Top Restaurantes.
 * - repaso: conectividad; indicadores y reclamos de los 14 días anteriores.
 * - manual: solo si se pide (`servicio`), los días pedidos; `espera` agrega la espera por tienda y día.
 * @param {{ tipo: string, desde?: string, hasta?: string, servicio?: boolean, espera?: boolean, hoy: string,
 *   minuto: number }} a
 */
export function planServicio({ tipo, desde, hasta, servicio = false, espera = false, hoy, minuto }) {
  const rango = (d, h) => ({ desde: d, hasta: h });
  if (tipo === 'vivo') {
    const cadaHora = minuto < 10;
    return {
      conectividad: true,
      dias: cadaHora ? rango(hoy, hoy) : null,
      espera: cadaHora ? [hoy] : [],
      reclamos: cadaHora ? rango(hoy, hoy) : null,
      semana: false,
      top: cadaHora,
    };
  }
  if (tipo === 'cierre') {
    const r = rango(sumarDias(hoy, -7), sumarDias(hoy, -1));
    return {
      conectividad: true,
      dias: r,
      espera: [sumarDias(hoy, -1)],
      reclamos: r,
      semana: true,
      top: true,
    };
  }
  if (tipo === 'repaso') {
    const r = rango(sumarDias(hoy, -14), sumarDias(hoy, -1));
    return { conectividad: true, dias: r, espera: [], reclamos: r, semana: false, top: false };
  }
  if (tipo === 'manual' && servicio) {
    const dias = [];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) dias.push(d);
    return {
      conectividad: false,
      dias: rango(desde, hasta),
      espera: espera ? dias : [],
      reclamos: rango(desde, hasta),
      semana: false,
      top: false,
    };
  }
  return null;
}
