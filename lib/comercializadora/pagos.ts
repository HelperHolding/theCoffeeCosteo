import { fechaCorta, isoUtc, masDias, msUtc, nombreMes } from './fechas';

export interface PagoFila {
  tipo: 'proyectado' | 'comprometido';
  sku: string;
  nombre: string | null;
  vendor_id: string | null;
  vendor_name: string | null;
  fecha_oc: string;
  fecha_pago: string;
  fecha_llegada?: string;
  cantidad: number;
  monto: number;
  zoho_po_id?: string | null;
}
export type ModoPeriodo = 'semana' | 'quincena' | 'mes';
export interface Periodo {
  clave: string;
  ini: string;
  fin: string;
  etiqueta: string;
}

/** _pagPeriodo: semana lunes–domingo, quincena 1–15 / 16–fin, mes. */
export function periodoPago(fecha: string, modo: ModoPeriodo): Periodo {
  const ms = msUtc(fecha);
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth();
  let ini: number, fin: number, etiqueta: string;
  if (modo === 'mes') {
    ini = Date.UTC(y, m, 1);
    fin = Date.UTC(y, m + 1, 0);
    etiqueta = `${nombreMes(m)} ${y}`;
  } else if (modo === 'quincena') {
    const seg = d.getUTCDate() > 15;
    ini = Date.UTC(y, m, seg ? 16 : 1);
    fin = seg ? Date.UTC(y, m + 1, 0) : Date.UTC(y, m, 15);
    etiqueta = `${new Date(ini).getUTCDate()}–${new Date(fin).getUTCDate()} ${nombreMes(m)}`;
  } else {
    ini = ms - ((d.getUTCDay() + 6) % 7) * 864e5;
    fin = ini + 6 * 864e5;
    etiqueta = fechaCorta(isoUtc(ini));
  }
  const i = isoUtc(ini);
  return { clave: i, ini: i, fin: isoUtc(fin), etiqueta };
}

type Celda = { proy: number; comp: number; cant: number };
export interface ProvPagos {
  vendor: string;
  nombre: string;
  total: number;
  celdas: Record<string, Celda>;
  skus: { sku: string; nombre: string; total: number; cantidad: number; celdas: Record<string, Celda> }[];
}

/** _pagAgrupar: proveedor × periodo, del periodo de hoy al último con datos; una fecha anterior cuenta en hoy. */
export function agruparPagos(
  filas: PagoFila[],
  modo: ModoPeriodo,
  campoFecha: 'fecha_pago' | 'fecha_oc',
  conComprometido: boolean,
  hoy: string,
) {
  const hoyP = periodoPago(hoy, modo);
  let ultimo = hoyP.ini;
  const porProv = new Map<string, ProvPagos & { porSku: Map<string, ProvPagos['skus'][number]> }>();
  const tot: Record<string, Celda> = {};
  const celda = (o: Record<string, Celda>, k: string) => (o[k] ??= { proy: 0, comp: 0, cant: 0 });
  for (const r of filas) {
    const comp = r.tipo === 'comprometido';
    if (comp && !conComprometido) continue;
    const f = r[campoFecha]?.slice(0, 10);
    const per = f && f >= hoyP.ini ? periodoPago(f, modo) : hoyP;
    const monto = Number(r.monto) || 0;
    const cant = Number(r.cantidad) || 0;
    if (per.ini > ultimo) ultimo = per.ini;
    const vk = String(r.vendor_id || r.vendor_name || '(sin proveedor)');
    const g = porProv.get(vk) ?? {
      vendor: vk,
      nombre: r.vendor_name || '(sin proveedor)',
      total: 0,
      celdas: {},
      skus: [],
      porSku: new Map(),
    };
    const sk = String(r.sku ?? '');
    const a = g.porSku.get(sk) ?? { sku: sk, nombre: r.nombre ?? '', total: 0, cantidad: 0, celdas: {} };
    for (const c of [celda(g.celdas, per.clave), celda(a.celdas, per.clave), celda(tot, per.clave)]) {
      c[comp ? 'comp' : 'proy'] += monto;
      c.cant += cant;
    }
    g.total += monto;
    a.total += monto;
    a.cantidad += cant;
    g.porSku.set(sk, a);
    porProv.set(vk, g);
  }
  const periodos: Periodo[] = [];
  for (let p = hoyP, n = 0; p.ini <= ultimo && n < 400; p = periodoPago(masDias(p.fin, 1), modo), n++)
    periodos.push(p);
  const desc = (a: { total: number }, b: { total: number }) => b.total - a.total;
  const provs = [...porProv.values()]
    .map(({ porSku, ...g }) => ({ ...g, skus: [...porSku.values()].sort(desc) }))
    .sort(desc);
  return { periodos, provs, tot };
}

/**
 * KPIs de renderComPagos con los filtros de la pantalla: esta semana (hasta el domingo; lo vencido cuenta) y 30 días
 * respetan "incluir comprometido"; el periodo más pesado usa el modo y el campo de fecha elegidos.
 */
export function kpisPagos(
  filas: PagoFila[],
  hoy: string,
  o: { comp: boolean; modo: ModoPeriodo; campoFecha: 'fecha_pago' | 'fecha_oc' } = {
    comp: true,
    modo: 'semana',
    campoFecha: 'fecha_pago',
  },
) {
  const domingo = periodoPago(hoy, 'semana').fin;
  const en30 = masDias(hoy, 30);
  let estaSemana = 0,
    proximos30 = 0,
    comprometido = 0;
  for (const r of filas) {
    const monto = Number(r.monto) || 0;
    const esComp = r.tipo === 'comprometido';
    if (esComp) comprometido += monto;
    if (esComp && !o.comp) continue;
    const f = String(r.fecha_pago ?? '').slice(0, 10);
    if (!f) continue;
    if (f <= domingo) estaSemana += monto;
    if (f <= en30) proximos30 += monto;
  }
  const g = agruparPagos(filas, o.modo, o.campoFecha, o.comp, hoy);
  let pesado: { etiqueta: string; monto: number } | null = null;
  for (const per of g.periodos) {
    const c = g.tot[per.clave];
    const m = c ? c.proy + c.comp : 0;
    if (m > 0 && (!pesado || m > pesado.monto)) pesado = { etiqueta: per.etiqueta, monto: m };
  }
  return { estaSemana, proximos30, pesado, comprometido };
}
