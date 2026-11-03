import type { ConfigSucursal } from './config';
import { productos, type CatalogoNombres, type FiltroOrigen } from './metricas';
import type { Origen, PedidoNormal } from './normalizar';

/**
 * Tablero de México (docs/sucursales/16). El corte guarda un renglón por sucursal y día (tabla
 * sucursales_resumen_dia, migración 37) con SOLO totales, calculados con las mismas funciones que la página de cada
 * sucursal: venta y pedidos como `resumen`, productos como `productos` (misma identidad de línea). El tablero suma
 * esos renglones; nunca relee pedidos ni estima lo que falta.
 */

/** Tramos de 10 minutos del día: la comparación «a esta hora» se hace en el límite de un tramo, exacta en los dos días. */
export const TRAMO_SEGUNDOS = 600;
export const TRAMOS = 86400 / TRAMO_SEGUNDOS;

export interface TotalesOrigen {
  pedidos: number;
  venta_cent: number;
  descuento_cent: number;
  lineas: number;
}
/** [pedidos por intervalo, venta_cent por intervalo]. */
export type Serie = [number[], number[]];
export type PorOrigen<T> = Partial<Record<Origen, T>>;
/** [clave, codigo, nombre, {origen: [lineas, importe_cent]}]. */
export type ProductoDia = [string, string, string, PorOrigen<[number, number]>];

export interface FilaResumen {
  company_id: number;
  fecha: string;
  leido_en: string;
  corte_segundo: number;
  completa: boolean;
  origenes: PorOrigen<TotalesOrigen>;
  horas: PorOrigen<Serie>;
  tramos: PorOrigen<Serie> | null;
  productos: ProductoDia[];
}

const serie = (n: number): Serie => [Array<number>(n).fill(0), Array<number>(n).fill(0)];

/** Resumen de UN día de UNA sucursal (POS y, si aplica, Rappi del portal ya sumado con conRappi). */
export function resumirDia(a: {
  companyId: number;
  fecha: string;
  leidoEn: Date;
  corteSegundo: number;
  completa: boolean;
  pedidos: PedidoNormal[];
  catalogo?: CatalogoNombres;
}): FilaResumen {
  const origenes: PorOrigen<TotalesOrigen> = {};
  const horas: PorOrigen<Serie> = {};
  const tramos: PorOrigen<Serie> = {};
  for (const p of a.pedidos) {
    const t = (origenes[p.origen] ??= { pedidos: 0, venta_cent: 0, descuento_cent: 0, lineas: 0 });
    t.pedidos++;
    t.venta_cent += p.ventaCent;
    t.descuento_cent += p.descuentoCent;
    t.lineas += p.lineas.length;
    const h = (horas[p.origen] ??= serie(24));
    const i = Math.min(23, Math.floor(p.segundo / 3600));
    h[0][i]++;
    h[1][i] += p.ventaCent;
    const x = (tramos[p.origen] ??= serie(TRAMOS));
    const j = Math.min(TRAMOS - 1, Math.floor(p.segundo / TRAMO_SEGUNDOS));
    x[0][j]++;
    x[1][j] += p.ventaCent;
  }
  // Misma identidad que la página: la evidencia son todos los pedidos del día, antes de separar por origen.
  const prods = new Map<string, ProductoDia>();
  for (const o of Object.keys(origenes) as Origen[])
    for (const p of productos(
      a.pedidos.filter((x) => x.origen === o),
      a.pedidos,
      a.catalogo,
    )) {
      const fila = prods.get(p.clave) ?? [p.clave, p.codigo, p.nombre, {}];
      fila[3][o] = [p.lineas, p.importeCent];
      prods.set(p.clave, fila);
    }
  return {
    company_id: a.companyId,
    fecha: a.fecha,
    leido_en: a.leidoEn.toISOString(),
    corte_segundo: a.corteSegundo,
    completa: a.completa,
    origenes,
    horas,
    tramos,
    productos: [...prods.values()],
  };
}

// ——— Lo que devuelven las RPC (migración 37) ———

export interface DiaHoyRpc {
  company_id: number;
  fecha: string;
  hoy: boolean;
  leido_en: string;
  corte_segundo: number;
  completa: boolean;
  origenes: PorOrigen<TotalesOrigen>;
  horas: PorOrigen<Serie>;
  tramos: PorOrigen<Serie> | null;
}
export interface RpcHoy {
  ultimo_corte: string | null;
  dias: DiaHoyRpc[];
}
export interface RpcPeriodo {
  dias_leidos: number;
  incompletos: number;
  semanas: {
    company_id: number;
    semana: string;
    origen: Origen;
    pedidos: number;
    venta_cent: number;
    descuento_cent: number;
    lineas: number;
    dias: number;
  }[];
  dias: { fecha: string; origen: Origen; pedidos: number; venta_cent: number }[];
  productos: {
    clave: string;
    codigo: string;
    nombre: string;
    origen: Origen;
    lineas: number;
    importe_cent: number;
    sucursales: number;
  }[];
}

// ——— Vista del tablero: cada cifra separada por origen, para filtrar en el navegador sin volver a leer ———

export type Cifras = PorOrigen<TotalesOrigen>;

export interface SucursalTablero {
  companyId: number;
  nombre: string;
  ciudad: string;
  /** Sin renglón de hoy: el corte aún no la lee (o falló); no se cuenta como venta cero. */
  sinCorte: boolean;
  completa: boolean;
  corteSegundo: number | null;
  hoy: Cifras;
  /** Hoy y la semana pasada hasta el mismo tramo de 10 min (null si no hay renglón de la semana pasada). */
  comparable: { hoy: Cifras; base: Cifras } | null;
  /** Hora local de la comparación, en segundos (inicio del tramo en curso). */
  comparadoA: number | null;
}

export interface TableroHoy {
  ultimoCorte: string | null;
  sucursales: SucursalTablero[];
  /**
   * Pedidos y venta por tramo de 10 min y por origen, sumando sucursales: hoy solo hasta el último tramo completo de
   * cada sucursal; la semana pasada, el día completo.
   */
  curva: { hoy: PorOrigen<Serie>; base: PorOrigen<Serie>; hastaTramo: number };
}

export interface TableroPeriodo {
  desde: string;
  hasta: string;
  diasLeidos: number;
  incompletos: number;
  semanas: { semana: string; cifras: Cifras; dias: number }[];
  dias: { fecha: string; venta: PorOrigen<number>; pedidos: PorOrigen<number> }[];
  sucursales: { companyId: number; nombre: string; ciudad: string; cifras: Cifras }[];
  productos: {
    clave: string;
    codigo: string;
    nombre: string;
    sucursales: number;
    por: PorOrigen<[number, number]>;
  }[];
}

const sumarEn = (c: Cifras, o: Origen, t: TotalesOrigen) => {
  const x = (c[o] ??= { pedidos: 0, venta_cent: 0, descuento_cent: 0, lineas: 0 });
  x.pedidos += t.pedidos;
  x.venta_cent += t.venta_cent;
  x.descuento_cent += t.descuento_cent;
  x.lineas += t.lineas;
};

/** Totales por origen de los tramos [0, hasta) de un renglón. */
function hastaTramo(tramos: PorOrigen<Serie>, hasta: number): Cifras {
  const c: Cifras = {};
  for (const [o, [p, v]] of Object.entries(tramos) as [Origen, Serie][]) {
    let pedidos = 0;
    let venta = 0;
    for (let i = 0; i < hasta; i++) {
      pedidos += p[i];
      venta += v[i];
    }
    if (pedidos) c[o] = { pedidos, venta_cent: venta, descuento_cent: 0, lineas: 0 };
  }
  return c;
}

export function armarHoy(rpc: RpcHoy, sucursales: ConfigSucursal[]): TableroHoy {
  const curva = { hoy: {} as PorOrigen<Serie>, base: {} as PorOrigen<Serie>, hastaTramo: 0 };
  const acumular = (destino: PorOrigen<Serie>, tramos: PorOrigen<Serie>, hasta: number) => {
    for (const [o, [p, v]] of Object.entries(tramos) as [Origen, Serie][]) {
      const d = (destino[o] ??= serie(TRAMOS));
      for (let i = 0; i < hasta; i++) {
        d[0][i] += p[i];
        d[1][i] += v[i];
      }
    }
  };
  const filas = sucursales.map((cfg): SucursalTablero => {
    const hoy = rpc.dias.find((d) => d.company_id === cfg.companyId && d.hoy);
    const base = rpc.dias.find((d) => d.company_id === cfg.companyId && !d.hoy);
    const c: Cifras = {};
    for (const [o, t] of Object.entries(hoy?.origenes ?? {}) as [Origen, TotalesOrigen][]) sumarEn(c, o, t);
    // Tramos completos: la comparación llega al inicio del tramo en curso, igual en los dos días.
    const k = hoy ? Math.floor(hoy.corte_segundo / TRAMO_SEGUNDOS) : 0;
    const comparable =
      hoy?.tramos && base?.tramos
        ? { hoy: hastaTramo(hoy.tramos, k), base: hastaTramo(base.tramos, k) }
        : null;
    if (hoy?.tramos) acumular(curva.hoy, hoy.tramos, k);
    if (base?.tramos) acumular(curva.base, base.tramos, TRAMOS);
    curva.hastaTramo = Math.max(curva.hastaTramo, k);
    return {
      companyId: cfg.companyId,
      nombre: cfg.nombre,
      ciudad: cfg.ciudad,
      sinCorte: !hoy,
      completa: hoy?.completa ?? false,
      corteSegundo: hoy?.corte_segundo ?? null,
      hoy: c,
      comparable,
      comparadoA: comparable ? k * TRAMO_SEGUNDOS : null,
    };
  });
  return { ultimoCorte: rpc.ultimo_corte, sucursales: filas, curva };
}

export function armarPeriodo(
  rpc: RpcPeriodo,
  desde: string,
  hasta: string,
  sucursales: ConfigSucursal[],
): TableroPeriodo {
  const semanas = new Map<string, { cifras: Cifras; dias: number }>();
  const porSucursal = new Map<number, Cifras>();
  for (const s of rpc.semanas) {
    const t = {
      pedidos: s.pedidos,
      venta_cent: s.venta_cent,
      descuento_cent: s.descuento_cent,
      lineas: s.lineas,
    };
    const w = semanas.get(s.semana) ?? { cifras: {}, dias: 0 };
    sumarEn(w.cifras, s.origen, t);
    w.dias = Math.max(w.dias, s.dias);
    semanas.set(s.semana, w);
    const c = porSucursal.get(s.company_id) ?? {};
    sumarEn(c, s.origen, t);
    porSucursal.set(s.company_id, c);
  }
  const dias = new Map<string, { fecha: string; venta: PorOrigen<number>; pedidos: PorOrigen<number> }>();
  for (const d of rpc.dias) {
    const x = dias.get(d.fecha) ?? { fecha: d.fecha, venta: {}, pedidos: {} };
    x.venta[d.origen] = (x.venta[d.origen] ?? 0) + d.venta_cent;
    x.pedidos[d.origen] = (x.pedidos[d.origen] ?? 0) + d.pedidos;
    dias.set(d.fecha, x);
  }
  const prods = new Map<string, TableroPeriodo['productos'][number]>();
  for (const p of rpc.productos) {
    const x = prods.get(p.clave) ?? {
      clave: p.clave,
      codigo: p.codigo,
      nombre: p.nombre,
      sucursales: 0,
      por: {},
    };
    x.por[p.origen] = [p.lineas, p.importe_cent];
    x.sucursales = Math.max(x.sucursales, p.sucursales);
    prods.set(p.clave, x);
  }
  return {
    desde,
    hasta,
    diasLeidos: rpc.dias_leidos,
    incompletos: rpc.incompletos,
    semanas: [...semanas]
      .map(([semana, w]) => ({ semana, ...w }))
      .sort((a, b) => a.semana.localeCompare(b.semana)),
    dias: [...dias.values()].sort((a, b) => a.fecha.localeCompare(b.fecha)),
    sucursales: sucursales
      .filter((s) => porSucursal.has(s.companyId))
      .map((s) => ({
        companyId: s.companyId,
        nombre: s.nombre,
        ciudad: s.ciudad,
        cifras: porSucursal.get(s.companyId)!,
      })),
    productos: [...prods.values()],
  };
}

/** Suma de las cifras que deja pasar el filtro de origen (el mismo filtro de la página de cada sucursal). */
export function filtrar(c: Cifras, filtro: FiltroOrigen): TotalesOrigen {
  const t = { pedidos: 0, venta_cent: 0, descuento_cent: 0, lineas: 0 };
  for (const [o, x] of Object.entries(c) as [Origen, TotalesOrigen][])
    if (filtro === 'todos' || o === filtro) {
      t.pedidos += x.pedidos;
      t.venta_cent += x.venta_cent;
      t.descuento_cent += x.descuento_cent;
      t.lineas += x.lineas;
    }
  return t;
}

/** Suma de un valor por origen con el filtro. */
export const sumaFiltrada = <T extends number>(v: PorOrigen<T>, filtro: FiltroOrigen) =>
  (Object.entries(v) as [Origen, T][]).reduce(
    (a, [o, x]) => (filtro === 'todos' || o === filtro ? a + x : a),
    0,
  );
