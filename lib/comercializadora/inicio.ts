import { difDias, fechaCorta, hoyCdmx, masDias } from './fechas';
import { comprometido } from './inventario';
import { agruparOcs, resumenOcs, type MovCompra, type OcGrupo } from './ordenes';
import { saldoCedis } from './quepedir';
import type { ArticuloCatalogo } from './tipos';

export type Tono = 'ok' | 'bajo' | 'pierde' | 'neutro';
const n = (x: unknown) => Number(x) || 0;

export interface ArticuloInicio extends ArticuloCatalogo {
  estatus: string | null;
  categoria: string | null;
  created_at: string | null;
}
export interface VentaMov {
  folio: string | null;
  sku: string;
  cantidad: number | null;
  estado: string | null;
  fecha_envio: string | null;
}
export interface PedidoMonto {
  fecha_pedido: string | null;
  monto: unknown;
  items: unknown;
}

/** Día de CDMX de un timestamptz (el viejo comparaba el ISO en UTC). Una fecha sin hora se deja igual. */
export const diaCdmx = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : hoyCdmx(new Date(iso)));

/** _pedMonto: monto si es > 0; si no, Σ precio × cantidad de los items (pueden venir como texto JSON). */
export function montoPedido(p: { monto: unknown; items: unknown }): number {
  if (n(p.monto) > 0) return Number(p.monto);
  try {
    const its = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
    if (Array.isArray(its))
      return its.reduce((s: number, it) => s + (parseFloat(it?.precio ?? 0) || 0) * n(it?.cantidad), 0);
  } catch {
    // JSON inválido: el pedido cuenta 0, como el viejo.
  }
  return 0;
}

/**
 * _montoOCsPorFolio(rows, true): el monto va en una fila del folio (gana el último no nulo); fuera los folios con
 * algún artículo de categoría Equipo (H-60: un equipo no es gasto operativo). `folios` = OCs distintas del periodo.
 */
export function montoOcsOperativas(
  filas: { folio: string | null; monto: number | null; sku: string }[],
  categoria: Record<string, string | null>,
): { monto: number; folios: number } {
  const monto = new Map<string, number>();
  const equipo = new Set<string>();
  const folios = new Set<string>();
  for (const r of filas) {
    if (!r.folio) continue;
    folios.add(r.folio);
    if (r.monto) monto.set(r.folio, Number(r.monto));
    if (categoria[r.sku] === 'Equipo') equipo.add(r.folio);
  }
  let total = 0;
  for (const [f, v] of monto) if (!equipo.has(f)) total += v;
  return { monto: total, folios: folios.size };
}

/** % Compras/Ventas (decisión 6: un solo semáforo para el KPI y la tendencia). */
export function pctCompras(
  compras: number,
  ventas: number,
): { pct: number | null; tono: Tono; texto: string } {
  const pct = ventas > 0 ? Math.round((compras / ventas) * 100) : null;
  if (pct === null) return { pct, tono: 'neutro', texto: 'Sin datos suficientes' };
  if (pct >= 45 && pct <= 55) return { pct, tono: 'ok', texto: 'Rango óptimo (45–55 %)' };
  if (pct > 55 && pct <= 65) return { pct, tono: 'bajo', texto: 'Por encima: revisar' };
  return { pct, tono: 'pierde', texto: 'Fuera de rango' };
}

/** Los n meses (YYYY-MM) que terminan en el mes de hoy. */
export function mesesHasta(hoy: string, cuantos: number): string[] {
  const [a, m] = hoy.split('-').map(Number);
  return Array.from({ length: cuantos }, (_, i) =>
    new Date(Date.UTC(a, m - 1 - (cuantos - 1 - i), 1)).toISOString().slice(0, 7),
  );
}

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export interface FilaTendencia {
  mes: string;
  etiqueta: string;
  ventas: number;
  compras: number;
  pct: number | null;
  tono: Tono;
  texto: string;
  pedidos: number;
  ocs: number;
  sinMonto: boolean;
  actual: boolean;
}

/** Tendencia de 5 meses de renderComInicio; el último es el mes en curso (sus KPIs financieros). */
export function tendencia(
  hoy: string,
  pedidos: PedidoMonto[],
  compras: MovCompra[],
  categoria: Record<string, string | null>,
): FilaTendencia[] {
  const meses = mesesHasta(hoy, 5);
  return meses.map((mes, i) => {
    const ped = pedidos.filter((p) => p.fecha_pedido && diaCdmx(p.fecha_pedido).startsWith(mes));
    const filas = compras.filter((r) => String(r.fecha ?? '').startsWith(mes));
    const ventas = ped.reduce((s, p) => s + montoPedido(p), 0);
    const c = montoOcsOperativas(filas, categoria);
    return {
      mes,
      etiqueta: `${MES[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`,
      ventas,
      compras: c.monto,
      ...pctCompras(c.monto, ventas),
      pedidos: ped.length,
      ocs: c.folios,
      sinMonto: c.monto === 0 && filas.length > 0,
      actual: i === meses.length - 1,
    };
  });
}

/** OCs con arribo en los próximos 7 días (agrupadas por folio, sin recibir). */
export function ocsProximas(grupos: OcGrupo[], hoy: string) {
  const fin = masDias(hoy, 7);
  const g = grupos.filter((x) => {
    const a = x.fecha_arribo?.slice(0, 10);
    return x.estado !== 'recibida' && !!a && a >= hoy && a <= fin;
  });
  return { folios: g.map((x) => x.folio), monto: g.reduce((s, x) => s + x.monto, 0) };
}

/** OCs en tránsito: sin recibir, por fecha de arribo (las que no tienen fecha, al final). */
export const enTransito = (grupos: OcGrupo[]) =>
  grupos
    .filter((g) => g.estado !== 'recibida')
    .sort((a, b) => String(a.fecha_arribo ?? '9').localeCompare(String(b.fecha_arribo ?? '9')));

/** _promDiario: enviados de 90 días ÷ min(90, días de vida del artículo); sin fecha de alta, 90. */
export function ventaDiaria(
  c: { sku: string; created_at: string | null },
  enviados: Record<string, number>,
  hoy: string,
) {
  const vida = c.created_at ? Math.max(1, difDias(diaCdmx(c.created_at), hoy)) : 90;
  return n(enviados[c.sku]) / Math.min(90, vida);
}

/** dohSem de renderComInicio. */
export function estadoDoh(saldo: number, venta: number, lt: number | undefined) {
  if (venta < 0.01) return 'sin_venta' as const;
  const doh = saldo / venta;
  const l = lt || 7;
  return doh <= l ? ('urgente' as const) : doh <= Math.max(2 * l, 14) ? ('pronto' as const) : ('ok' as const);
}

export interface FilaInv {
  sku: string;
  nombre: string;
  saldo: number;
  venta: number;
  comprometido: number;
  faltante: number;
}

/** Paneles de inventario de Inicio (decisiones 6 y 8: el conteo de críticos no se corta). */
export function resumenInventario(d: {
  hoy: string;
  catalogo: ArticuloInicio[];
  ventas90: VentaMov[];
  porEnviar: VentaMov[];
  leadTimes: { sku: string; dias: number | null }[];
}) {
  const activos = d.catalogo.filter((c) => c.estatus !== 'Inactivo');
  const enviados: Record<string, number> = {};
  for (const v of d.ventas90)
    if (v.estado === 'enviado') enviados[v.sku] = (enviados[v.sku] ?? 0) + n(v.cantidad);
  const lt = Object.fromEntries(d.leadTimes.map((l) => [l.sku, n(l.dias)]));
  const comp = comprometido(d.porEnviar.map((v) => ({ sku: v.sku, cantidad: n(v.cantidad) })));
  const filas = activos.map((c) => {
    const saldo = saldoCedis(c);
    const venta = ventaDiaria(c, enviados, d.hoy);
    const cmp = n(comp[c.sku]);
    return {
      sku: c.sku,
      nombre: c.nombre ?? c.sku,
      saldo,
      venta,
      comprometido: cmp,
      faltante: saldo > 0 && saldo - cmp < 0 ? cmp - saldo : 0,
      doh: estadoDoh(saldo, venta, lt[c.sku]),
    };
  });
  const criticos = new Set(filas.filter((f) => f.doh === 'urgente' || f.doh === 'pronto').map((f) => f.sku));
  const conFaltante = new Set(filas.filter((f) => f.faltante > 0).map((f) => f.sku));
  const faltantes = filas
    .filter((f) => f.faltante > 0 && !criticos.has(f.sku))
    .sort((a, b) => b.faltante - a.faltante);
  const stockBajo = filas
    .filter(
      (f) =>
        f.saldo > 0 && f.saldo <= 10 && !criticos.has(f.sku) && !conFaltante.has(f.sku) && f.venta < 0.01,
    )
    .sort((a, b) => a.saldo - b.saldo);
  const sinDoh = (f: (typeof filas)[number]): FilaInv => ({
    sku: f.sku,
    nombre: f.nombre,
    saldo: f.saldo,
    venta: f.venta,
    comprometido: f.comprometido,
    faltante: f.faltante,
  });
  return {
    sinStock: filas.filter((f) => f.saldo === 0).map(sinDoh),
    criticos: criticos.size,
    faltantes: faltantes.map(sinDoh),
    stockBajo: stockBajo.map(sinDoh),
    cedisTotal: filas.reduce((s, f) => s + f.saldo, 0),
    activos: activos.length,
  };
}

/** Salidas de 30 días: OVs enviadas con fecha de envío desde hoy − 30. */
export function salidas30(ventas: VentaMov[], hoy: string) {
  const desde = masDias(hoy, -30);
  const v = ventas.filter((m) => m.estado === 'enviado' && String(m.fecha_envio ?? '') >= desde);
  return {
    folios: new Set(v.map((m) => m.folio).filter(Boolean)).size,
    uds: v.reduce((s, m) => s + n(m.cantidad), 0),
  };
}

/** Lead time prometido (KPIs · Compras): promedio de arribo − emisión, en días, de las OCs con ambas fechas. */
export function leadTimePrometido(grupos: OcGrupo[]) {
  const d = grupos
    .filter((g) => g.fecha && g.fecha_arribo)
    .map((g) => difDias(String(g.fecha).slice(0, 10), String(g.fecha_arribo).slice(0, 10)));
  return { dias: d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null, ocs: d.length };
}

/** Mermas (%) de KPIs: Σ|cantidad| × costo del momento ÷ valor del inventario CEDIS (saldo × costo), 2 decimales. */
export function porcentajeMermas(
  mermas: { cantidad: number | null; costo_unitario_momento: number | null }[],
  catalogo: ArticuloInicio[],
) {
  const valor = mermas.reduce((s, r) => s + Math.abs(n(r.cantidad)) * n(r.costo_unitario_momento), 0);
  const inventario = catalogo.reduce((s, c) => s + saldoCedis(c) * n(c.costo_unitario), 0);
  return { pct: inventario > 0 ? Math.round((valor / inventario) * 10000) / 100 : null, n: mermas.length };
}

/** fmtD de renderComInicio: Hoy, Mañana, Hace N d o la fecha corta. */
export function relativo(fecha: string | null, hoy: string): string {
  if (!fecha) return '—';
  const d = difDias(hoy, fecha.slice(0, 10));
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d < 0) return `Hace ${-d} d`;
  return fechaCorta(fecha.slice(0, 10));
}

/** PED_STATUS_LABEL del viejo, con el tono de la pastilla. */
export const ESTADOS_PEDIDO: Record<string, { texto: string; tono: Tono }> = {
  recibido: { texto: 'Recibido', tono: 'neutro' },
  pagado: { texto: 'Pagado', tono: 'neutro' },
  empacado: { texto: 'Empacado', tono: 'bajo' },
  enviado: { texto: 'Enviado', tono: 'ok' },
  entregado: { texto: 'Entregado', tono: 'ok' },
  terminado: { texto: 'Terminado', tono: 'ok' },
  con_incidencia: { texto: 'Con incidencia', tono: 'pierde' },
  cancelado: { texto: 'Cancelado', tono: 'pierde' },
};

export interface PedidoActivo {
  id: string;
  numero: string;
  status: string;
  sucursal: string;
  monto: number;
  fecha: string | null;
}

export interface DatosInicio {
  hoy: string;
  catalogo: ArticuloInicio[];
  porEnviar: VentaMov[];
  ventas90: VentaMov[];
  compras: MovCompra[];
  leadTimes: { sku: string; dias: number | null }[];
  mermas: { cantidad: number | null; costo_unitario_momento: number | null }[];
  /** null: el puente no respondió (ventas sin dato). */
  pedidos: PedidoMonto[] | null;
}

export function armarInicio(d: DatosInicio) {
  const categoria = Object.fromEntries(d.catalogo.map((c) => [c.sku, c.categoria]));
  const tend = tendencia(d.hoy, d.pedidos ?? [], d.compras, categoria);
  const grupos = agruparOcs(d.compras);
  return {
    tendencia: tend,
    mes: tend[tend.length - 1],
    proximas: ocsProximas(grupos, d.hoy),
    transito: enTransito(grupos),
    inventario: resumenInventario(d),
    salidas: salidas30(d.ventas90, d.hoy),
    compras: { ...resumenOcs(d.compras, d.hoy), leadTime: leadTimePrometido(grupos) },
    mermas: porcentajeMermas(d.mermas, d.catalogo),
  };
}
export type ResultadoInicio = ReturnType<typeof armarInicio>;
