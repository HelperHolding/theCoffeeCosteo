import { importeLinea, type Origen, type PedidoNormal } from './normalizar';
import { sumarDias } from './tiempo';

/** Funciones puras sobre pedidos normalizados (todas en centavos). Mismo conjunto para KPIs, gráficas y tablas. */
/** 'todos' = todas las ventas (Mostrador + App + Rappi). Cada origen también se puede ver por separado. */
export type FiltroOrigen = 'todos' | 'mostrador' | 'app' | 'rappi';
/** Opciones del selector de origen (arriba de las pestañas). */
export const filtrosOrigen: FiltroOrigen[] = ['todos', 'mostrador', 'app', 'rappi'];
/** Orígenes aceptados por las rutas de datos. */
export const origenesValidos: FiltroOrigen[] = ['todos', 'mostrador', 'app', 'rappi'];
export const etiquetaOrigen: Record<Origen | 'todos', string> = {
  todos: 'Mostrador + App + Rappi',
  mostrador: 'Mostrador',
  app: 'App The Coffee',
  rappi: 'Rappi',
  desconocido: 'Origen sin dato',
};

/** 'todos' = todos los pedidos (incluye Rappi); cualquier otro valor filtra a ese origen. */
export const filtrarOrigen = (ps: PedidoNormal[], o: FiltroOrigen) =>
  o === 'todos' ? ps : ps.filter((p) => p.origen === o);

export interface Resumen {
  ventaCent: number;
  pedidos: number;
  ticketCent: number | null;
  descuentoCent: number;
  /** descuento / (venta cobrada + descuento): parte del precio de lista que se descontó. */
  tasaDescuento: number | null;
  pedidosConDescuento: number;
  lineas: number;
  /** Σ netAmout (neto reportado por la API); null si algún pedido no lo trae. */
  netoCent: number | null;
}

export function resumen(ps: PedidoNormal[]): Resumen {
  let ventaCent = 0;
  let descuentoCent = 0;
  let lineas = 0;
  let pedidosConDescuento = 0;
  let netoCent: number | null = 0;
  for (const p of ps) {
    netoCent = netoCent === null || p.netoCent === null ? null : netoCent + p.netoCent;
    ventaCent += p.ventaCent;
    descuentoCent += p.descuentoCent;
    lineas += p.lineas.length;
    if (p.descuentoCent > 0) pedidosConDescuento++;
  }
  const lista = ventaCent + descuentoCent;
  return {
    ventaCent,
    pedidos: ps.length,
    ticketCent: ps.length ? Math.round(ventaCent / ps.length) : null,
    descuentoCent,
    tasaDescuento: lista > 0 ? descuentoCent / lista : null,
    pedidosConDescuento,
    lineas,
    netoCent,
  };
}

/** Pedidos con hora local menor o igual al corte (segundos desde la medianoche, inclusivo). */
export const hastaCorte = (ps: PedidoNormal[], corte: number) => ps.filter((p) => p.segundo <= corte);

/** Variación relativa; null = sin base comparable (nunca divide entre cero). */
export const variacion = (actual: number, base: number | null) =>
  base === null || base === 0 ? null : (actual - base) / base;

/** Venta acumulada al cierre de cada hora (24 valores). */
export function curvaAcumulada(ps: PedidoNormal[]): number[] {
  const porHora = Array<number>(24).fill(0);
  for (const p of ps) porHora[Math.floor(p.segundo / 3600)] += p.ventaCent;
  let acc = 0;
  return porHora.map((v) => (acc += v));
}

export function porHora(ps: PedidoNormal[]) {
  const h = Array.from({ length: 24 }, (_, hora) => ({ hora, pedidos: 0, ventaCent: 0 }));
  for (const p of ps) {
    const x = h[Math.floor(p.segundo / 3600)];
    x.pedidos++;
    x.ventaCent += p.ventaCent;
  }
  return h;
}

/** Pedidos en (corte − ventana, corte]. */
export const enVentana = (ps: PedidoNormal[], corte: number, segundos: number) =>
  ps.filter((p) => p.segundo <= corte && p.segundo > corte - segundos).length;

const ES_TAMANO = /\b\d{2,4}\s?ml\b/i;

export interface ProductoResumen {
  codigo: string;
  nombre: string;
  /** Línea + sus customs, una sola vez. */
  importeCent: number;
  extraCustomsCent: number;
  lineas: number;
  pedidos: number;
  participacion: number | null;
  tamanos: { nombre: string; lineas: number }[];
  customs: { nombre: string; veces: number; importeCent: number }[];
}

export function productos(ps: PedidoNormal[]): ProductoResumen[] {
  const m = new Map<
    string,
    {
      codigo: string;
      nombre: string;
      importeCent: number;
      extraCustomsCent: number;
      lineas: number;
      pedidos: Set<number>;
      tamanos: Map<string, number>;
      customs: Map<string, { veces: number; importeCent: number }>;
    }
  >();
  let total = 0;
  for (const p of ps)
    for (const l of p.lineas) {
      let x = m.get(l.codigo);
      if (!x) {
        x = {
          codigo: l.codigo,
          nombre: l.nombre,
          importeCent: 0,
          extraCustomsCent: 0,
          lineas: 0,
          pedidos: new Set(),
          tamanos: new Map(),
          customs: new Map(),
        };
        m.set(l.codigo, x);
      }
      const imp = importeLinea(l);
      x.importeCent += imp;
      x.extraCustomsCent += imp - l.importeCent;
      total += imp;
      x.lineas++;
      x.pedidos.add(p.id);
      for (const c of l.customs) {
        if (ES_TAMANO.test(c.nombre)) x.tamanos.set(c.nombre, (x.tamanos.get(c.nombre) ?? 0) + 1);
        else {
          const y = x.customs.get(c.nombre) ?? { veces: 0, importeCent: 0 };
          y.veces++;
          y.importeCent += c.importeCent;
          x.customs.set(c.nombre, y);
        }
      }
    }
  return [...m.values()]
    .map((x) => ({
      codigo: x.codigo,
      nombre: x.nombre,
      importeCent: x.importeCent,
      extraCustomsCent: x.extraCustomsCent,
      lineas: x.lineas,
      pedidos: x.pedidos.size,
      participacion: total > 0 ? x.importeCent / total : null,
      tamanos: [...x.tamanos]
        .map(([nombre, lineas]) => ({ nombre, lineas }))
        .sort((a, b) => b.lineas - a.lineas),
      customs: [...x.customs]
        .map(([nombre, v]) => ({ nombre, ...v }))
        .sort((a, b) => b.veces - a.veces)
        .slice(0, 8),
    }))
    .sort((a, b) => b.importeCent - a.importeCent || a.nombre.localeCompare(b.nombre));
}

/** Personalizaciones de todo el periodo (sin tamaños): frecuencia e importe adicional. */
export function personalizaciones(ps: PedidoNormal[]) {
  const m = new Map<string, { nombre: string; veces: number; importeCent: number }>();
  for (const p of ps)
    for (const l of p.lineas)
      for (const c of l.customs) {
        if (ES_TAMANO.test(c.nombre)) continue;
        const x = m.get(c.nombre) ?? { nombre: c.nombre, veces: 0, importeCent: 0 };
        x.veces++;
        x.importeCent += c.importeCent;
        m.set(c.nombre, x);
      }
  return [...m.values()].sort((a, b) => b.veces - a.veces);
}

const PAGOS: Record<string, string> = {
  CARTAO: 'Tarjeta',
  DINHEIRO: 'Efectivo',
  VIRTUAL_WALLET: 'Monedero virtual',
  WALLET_BALANCE: 'Saldo en app',
  RAPPI: 'Rappi',
};
export const etiquetaPago = (metodo: string) => PAGOS[metodo] ?? (metodo || 'Sin dato');
export const metodosPago = Object.keys(PAGOS);

export function pagos(ps: PedidoNormal[]) {
  const total = ps.reduce((s, p) => s + p.ventaCent, 0);
  const m = new Map<string, { metodo: string; etiqueta: string; pedidos: number; ventaCent: number }>();
  for (const p of ps) {
    const x = m.get(p.metodo) ?? {
      metodo: p.metodo,
      etiqueta: etiquetaPago(p.metodo),
      pedidos: 0,
      ventaCent: 0,
    };
    x.pedidos++;
    x.ventaCent += p.ventaCent;
    m.set(p.metodo, x);
  }
  return [...m.values()]
    .map((x) => ({ ...x, participacion: total > 0 ? x.ventaCent / total : null }))
    .sort((a, b) => b.ventaCent - a.ventaCent);
}

/** Desglose por origen (mostrador / app / sin dato), solo orígenes con pedidos. */
export function origenes(ps: PedidoNormal[]) {
  const total = ps.reduce((s, p) => s + p.ventaCent, 0);
  return (['mostrador', 'app', 'rappi', 'desconocido'] as Origen[])
    .map((origen) => {
      const de = ps.filter((p) => p.origen === origen);
      const ventaCent = de.reduce((s, p) => s + p.ventaCent, 0);
      return { origen, pedidos: de.length, ventaCent, participacion: total > 0 ? ventaCent / total : null };
    })
    .filter((o) => o.pedidos > 0);
}

/** Σ venta frente a Σ importe atribuible por productos. Si no cuadra, se reporta: no se ajusta. */
export function conciliar(ps: PedidoNormal[]) {
  const ventaCent = ps.reduce((s, p) => s + p.ventaCent, 0);
  const productosCent = ps.reduce((s, p) => s + p.lineas.reduce((t, l) => t + importeLinea(l), 0), 0);
  // El proveedor redondea el total cuando hay % de descuento en líneas y personalizaciones:
  // diferencias de ±1 centavo por pedido se clasifican como redondeo, no como descuadre.
  let soloRedondeo = true;
  for (const p of ps)
    if (!p.cuadra && Math.abs(p.ventaCent - p.lineas.reduce((t, l) => t + importeLinea(l), 0)) > 1)
      soloRedondeo = false;
  return {
    ventaCent,
    productosCent,
    diferenciaCent: ventaCent - productosCent,
    pedidosNoCuadran: ps.filter((p) => !p.cuadra).length,
    soloRedondeo,
  };
}

const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
export const nombreDia = (fecha: string) => DIAS[new Date(`${fecha}T12:00:00Z`).getUTCDay()];

export interface Insight {
  id: string;
  texto: string;
  tono: 'ok' | 'bajo' | 'neutro';
}
const pct = (x: number) => `${x >= 0 ? '+' : '−'}${Math.abs(x * 100).toFixed(1)}%`;

/**
 * Frases calculadas para "En vivo". Solo describen variaciones; nunca atribuyen causas.
 * Sin comparativos si alguna lectura está incompleta.
 */
export function insightsVivo(a: {
  hoy: PedidoNormal[];
  base: PedidoNormal[];
  baseFecha: string;
  corte: number;
  completos: boolean;
}): Insight[] {
  const out: Insight[] = [];
  const h = resumen(a.hoy);
  const dia = nombreDia(a.baseFecha);
  if (a.completos) {
    const b = resumen(hastaCorte(a.base, a.corte));
    const v = variacion(h.ventaCent, b.pedidos ? b.ventaCent : null);
    out.push(
      v === null
        ? {
            id: 'comparativo',
            texto: `Sin base comparable: el ${dia} pasado no tenía pedidos a esta hora.`,
            tono: 'neutro',
          }
        : {
            id: 'comparativo',
            texto: `Venta ${pct(v)} contra el ${dia} pasado a esta hora (${h.pedidos} vs ${b.pedidos} pedidos).`,
            tono: v >= 0 ? 'ok' : 'bajo',
          },
    );
    const hoyHora = enVentana(a.hoy, a.corte, 3600);
    const baseHora = enVentana(a.base, a.corte, 3600);
    out.push({
      id: 'ritmo',
      texto: `Última hora: ${hoyHora} pedidos (el ${dia} pasado en la misma hora: ${baseHora}).`,
      tono: 'neutro',
    });
    const hoy30 = enVentana(a.hoy, a.corte, 1800);
    const base30 = enVentana(a.base, a.corte, 1800);
    if (hoy30 === 0 && base30 >= 5)
      out.push({
        id: 'silencio',
        texto: `Sin pedidos en los últimos 30 min; el ${dia} pasado en ese tramo hubo ${base30}.`,
        tono: 'bajo',
      });
    if (
      h.tasaDescuento !== null &&
      b.tasaDescuento !== null &&
      Math.abs(h.tasaDescuento - b.tasaDescuento) >= 0.01
    )
      out.push({
        id: 'descuentos',
        texto: `Descuentos: ${(h.tasaDescuento * 100).toFixed(1)}% del precio de lista hoy vs ${(b.tasaDescuento * 100).toFixed(1)}% el ${dia} pasado a esta hora.`,
        tono: 'neutro',
      });
  }
  const top = productos(a.hoy)[0];
  if (top?.participacion)
    out.push({
      id: 'top',
      texto: `${top.nombre} aporta el ${(top.participacion * 100).toFixed(0)}% de la venta de hoy.`,
      tono: 'neutro',
    });
  return out;
}

/**
 * Semanas cerradas lunes–domingo (fechas locales), de la más antigua a la más reciente.
 * La última termina el domingo anterior a `hoy` (si hoy es lunes, ayer).
 */
export function semanasCerradas(hoy: string, n: number) {
  const dia = new Date(`${hoy}T12:00:00Z`).getUTCDay(); // 0 = domingo
  const ultimoDomingo = sumarDias(hoy, -(dia === 0 ? 7 : dia));
  return Array.from({ length: n }, (_, i) => {
    const hasta = sumarDias(ultimoDomingo, -7 * (n - 1 - i));
    return { desde: sumarDias(hasta, -6), hasta };
  });
}

/** Índice de día con lunes = 0 … domingo = 6. */
export const diaLunes = (fecha: string) => (new Date(`${fecha}T12:00:00Z`).getUTCDay() + 6) % 7;

/** Conteo de pedidos por día de la semana (lunes = 0) y hora local. */
export function conteoDiaHora(ps: PedidoNormal[]) {
  const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  for (const p of ps) m[diaLunes(p.fecha)][Math.floor(p.segundo / 3600)]++;
  return m;
}
