/**
 * Nivel de servicio y Conectividad de Rappi de una sucursal (docs/rappi-portal/08): lo que devuelve la RPC
 * sucursales_nivel_servicio y cómo se arma para la sección y su Excel. Funciones puras.
 * - Los indicadores son los de Rappi por día (hora del centro); aquí solo se suman. Las tasas son cocientes de sumas;
 *   la disponibilidad del periodo es el promedio de los días y la espera del repartidor se pondera por pedidos
 *   finalizados (así lo dice la etiqueta en pantalla). Un dato que no vino queda en null, no en cero.
 * - La conectividad son tramos armados con la foto de cada 10 min; se cortan por día en la zona de la sucursal.
 */
import { enZona, sumarDias } from './tiempo';

export type CanalServicio = 'normal' | 'turbo';
export type TipoReclamo = 'mal_estado' | 'faltante' | 'incorrecto';
export type TipoRechazo = 'cbpi' | 'cbpr' | 'tienda_cerrada' | 'sin_stock' | 'demora';

/** Nombres de Rappi (portal en español, 2026-11-20). CBPI y CBPR los explica el propio portal. */
export const TIPOS_RECLAMO: Record<TipoReclamo, string> = {
  mal_estado: 'Mal estado',
  faltante: 'Ítem faltante',
  incorrecto: 'Ítem diferente',
};
export const TIPOS_RECHAZO: Record<TipoRechazo, string> = {
  cbpi: 'Inactividad en la tablet',
  cbpr: 'Rechazado por la tienda',
  tienda_cerrada: 'Tienda cerrada',
  sin_stock: 'Sin producto',
  demora: 'Demora en tienda',
};
export const MOTIVO_TIPO: Record<string, TipoReclamo> = {
  damaged_item: 'mal_estado',
  missing_item: 'faltante',
  wrong_item: 'incorrecto',
};
/** Subtipos de reclamo que manda Rappi (los vistos del 10-ago al 20-nov). Uno nuevo se muestra tal cual. */
export const SUBTIPOS: Record<string, string> = {
  poorly_transported_not_edible: 'Mal transportado, no se puede consumir',
  poorly_transported_edible: 'Mal transportado, se puede consumir',
  unpleasant_taste: 'Sabor desagradable',
  incorrect_temperature: 'Temperatura incorrecta',
  raw_or_poor_condition: 'Crudo o en mal estado',
  strange_objects_in_product: 'Objeto extraño en el producto',
  not_arrived_bag_closed: 'No llegó (bolsa cerrada)',
  not_arrived_bag_open: 'No llegó (bolsa abierta)',
  missing_ingredient: 'Faltó un ingrediente',
  open_seal_opened_or_manipulated: 'Bolsa sin sello, abierta o manipulada',
  closed_seal_opened_or_manipulated: 'Bolsa sellada, abierta o manipulada',
  totally_different_product: 'Producto totalmente diferente',
  wrong_taste: 'Sabor equivocado',
  different_size_than_ordered: 'Tamaño distinto al pedido',
  size_does_not_match: 'El tamaño no corresponde',
};
export const nombreSubtipo = (s: string | null) => (s ? (SUBTIPOS[s.toLowerCase()] ?? s) : null);
/** «1. Top 5%» → «Top 5 %»; las demás categorías de Rappi con su nombre en español. */
export function nombreTop(c: string | null): string | null {
  if (!c) return null;
  const sin = c.replace(/^\d+\.\s*/, '').trim();
  const m = /^Top (\d+)%$/.exec(sin);
  if (m) return `Top ${m[1]} %`;
  return { Beginner: 'Principiante', Warning: 'En advertencia' }[sin] ?? sin;
}

// ── Lo que devuelve la RPC ─────────────────────────────────────────────────────────────────────────────────────
export interface FilaDiaRpc {
  tienda: string;
  fecha: string;
  pedidos: number | null;
  rech_cbpi: number | null;
  rech_cbpr: number | null;
  rech_tienda_cerrada: number | null;
  rech_sin_stock: number | null;
  rech_demora: number | null;
  finalizados: number | null;
  recl_mal_estado: number | null;
  recl_faltante: number | null;
  recl_incorrecto: number | null;
  disponibilidad: number | null;
  indisponibilidad: number | null;
  cocina_pedidos: number | null;
  cocina_demorada: number | null;
  sin_disp_minutos: number | null;
  espera_repartidor: number | null;
}
export interface ReclamoRpc {
  pedido: string;
  tienda: string;
  fecha: string;
  motivo: string;
  subtipo: string | null;
  producto: string | null;
  comentario: string | null;
  monto: number | null;
}
export interface TramoRpc {
  tienda: string;
  estado: string;
  motivo: string | null;
  cierra: string | null;
  desde: string;
  visto: string;
  hasta?: string | null;
}
export interface RpcServicio {
  tiendas: { id: string; nombre: string; canal: CanalServicio }[];
  dias: FilaDiaRpc[];
  reclamos: ReclamoRpc[];
  conectividad: TramoRpc[];
  vigente: TramoRpc[];
  primera_foto: string | null;
  semana: { tienda: string; fecha: string; matriz: Record<string, Record<string, number>> }[];
  top: { tienda: string; fecha: string; categoria: string; proxima: string | null }[];
  leido_en: string | null;
}

// ── Lo que ve la pantalla ──────────────────────────────────────────────────────────────────────────────────────
export interface Totales {
  /** Tienda-días con dato de Rappi. */
  dias: number;
  pedidos: number;
  finalizados: number;
  rechazos: Record<TipoRechazo, number>;
  rechazosTotal: number;
  reclamos: Record<TipoReclamo, number>;
  reclamosTotal: number;
  /** Reclamos / pedidos finalizados. */
  tasaReclamos: number | null;
  /** Rechazos / pedidos creados. */
  tasaRechazos: number | null;
  sinDispMinutos: number | null;
  /** Promedio de la disponibilidad diaria de Rappi (%). */
  disponibilidad: number | null;
  cocinaPedidos: number;
  cocinaDemorada: number;
  tasaCocina: number | null;
  /** Espera del repartidor (min), ponderada por pedidos finalizados. */
  espera: number | null;
}
export interface EstadoAhora {
  canal: CanalServicio;
  /** activa = ACTIVE de Rappi; inactiva = cualquier otro estado (con su motivo). */
  activa: boolean;
  estadoRappi: string;
  motivo: string | null;
  /** «20:30» en la zona de la sucursal, si Rappi dio la hora de cierre de hoy. */
  cierra: string | null;
  desde: string;
  visto: string;
}
export interface TramoCinta {
  canal: CanalServicio;
  /** Segundos del día local. */
  inicio: number;
  fin: number;
  estado: 'activa' | 'inactiva' | 'sin_dato';
  motivo: string | null;
}
export interface ReclamoUi {
  pedido: string;
  fecha: string;
  canal: CanalServicio;
  producto: string | null;
  tipo: TipoReclamo | null;
  detalle: string | null;
  comentario: string | null;
  monto: number | null;
}
export interface DiaServicio {
  fecha: string;
  total: Totales;
}
export interface RespuestaServicio {
  desde: string;
  hasta: string;
  zona: string;
  /** El portal cuenta los días en hora del centro; en otra zona el corte del día no coincide con el local. */
  diasEnHoraCentro: boolean;
  leidoEn: string | null;
  canales: {
    canal: CanalServicio;
    id: string;
    nombre: string;
    ahora: EstadoAhora | null;
    top: { categoria: string; proxima: string | null; fecha: string } | null;
  }[];
  totales: Totales;
  porCanal: Partial<Record<CanalServicio, Totales>>;
  dias: DiaServicio[];
  reclamos: ReclamoUi[];
  compensado: number;
  productos: { producto: string; reclamos: number; tipos: Record<TipoReclamo, number> }[];
  /** Cintas de conectividad por día local (los últimos 7 días del periodo), desde la primera foto. */
  cintas: { fecha: string; tramos: TramoCinta[] }[];
  conectividadDesde: string | null;
  /** Tramos para el Excel, en hora local. */
  tramos: {
    canal: CanalServicio;
    estado: string;
    motivo: string | null;
    desde: string;
    hasta: string | null;
    minutos: number;
  }[];
  semana: { canal: CanalServicio; fecha: string; matriz: Record<string, Record<string, number>> }[];
}

const cero = <K extends string>(claves: readonly K[]) =>
  Object.fromEntries(claves.map((k) => [k, 0])) as Record<K, number>;
const CLAVES_RECLAMO = Object.keys(TIPOS_RECLAMO) as TipoReclamo[];
const div = (a: number, b: number) => (b > 0 ? a / b : null);

/**
 * Sumas crudas de tienda-días de Rappi: lo que la RPC nacional ya devuelve sumado por tienda y por día, y lo que
 * `sumar` acumula de las filas de una sucursal. `totalesDeSuma` saca los cocientes de las sumas, igual en los dos.
 */
export interface SumaServicio {
  dias: number;
  pedidos: number;
  rech_cbpi: number;
  rech_cbpr: number;
  rech_tienda_cerrada: number;
  rech_sin_stock: number;
  rech_demora: number;
  finalizados: number;
  recl_mal_estado: number;
  recl_faltante: number;
  recl_incorrecto: number;
  cocina_pedidos: number;
  cocina_demorada: number;
  /** null si ningún día trajo el dato. */
  sin_disp_minutos: number | null;
  disp_suma: number;
  disp_n: number;
  espera_suma: number;
  espera_peso: number;
}

const n = (x: number | string | null | undefined) => (x === null || x === undefined ? 0 : Number(x));

export function acumular(filas: FilaDiaRpc[]): SumaServicio {
  const s: SumaServicio = {
    dias: filas.length,
    pedidos: 0,
    rech_cbpi: 0,
    rech_cbpr: 0,
    rech_tienda_cerrada: 0,
    rech_sin_stock: 0,
    rech_demora: 0,
    finalizados: 0,
    recl_mal_estado: 0,
    recl_faltante: 0,
    recl_incorrecto: 0,
    cocina_pedidos: 0,
    cocina_demorada: 0,
    sin_disp_minutos: null,
    disp_suma: 0,
    disp_n: 0,
    espera_suma: 0,
    espera_peso: 0,
  };
  for (const f of filas) {
    for (const k of [
      'pedidos',
      'rech_cbpi',
      'rech_cbpr',
      'rech_tienda_cerrada',
      'rech_sin_stock',
      'rech_demora',
      'finalizados',
      'recl_mal_estado',
      'recl_faltante',
      'recl_incorrecto',
      'cocina_pedidos',
      'cocina_demorada',
    ] as const)
      s[k] += n(f[k]);
    if (f.sin_disp_minutos !== null) s.sin_disp_minutos = (s.sin_disp_minutos ?? 0) + n(f.sin_disp_minutos);
    if (f.disponibilidad !== null) {
      s.disp_suma += n(f.disponibilidad);
      s.disp_n++;
    }
    if (f.espera_repartidor !== null && n(f.finalizados) > 0) {
      s.espera_suma += n(f.espera_repartidor) * n(f.finalizados);
      s.espera_peso += n(f.finalizados);
    }
  }
  return s;
}

export function totalesDeSuma(x: SumaServicio): Totales {
  const s = Object.fromEntries(
    Object.entries(x).map(([k, v]) => [k, v === null ? null : Number(v)]),
  ) as unknown as SumaServicio;
  const rechazos: Record<TipoRechazo, number> = {
    cbpi: s.rech_cbpi,
    cbpr: s.rech_cbpr,
    tienda_cerrada: s.rech_tienda_cerrada,
    sin_stock: s.rech_sin_stock,
    demora: s.rech_demora,
  };
  const reclamos: Record<TipoReclamo, number> = {
    mal_estado: s.recl_mal_estado,
    faltante: s.recl_faltante,
    incorrecto: s.recl_incorrecto,
  };
  const rechazosTotal = Object.values(rechazos).reduce((a, b) => a + b, 0);
  const reclamosTotal = Object.values(reclamos).reduce((a, b) => a + b, 0);
  return {
    dias: s.dias,
    pedidos: s.pedidos,
    finalizados: s.finalizados,
    rechazos,
    rechazosTotal,
    reclamos,
    reclamosTotal,
    tasaReclamos: div(reclamosTotal, s.finalizados),
    tasaRechazos: div(rechazosTotal, s.pedidos),
    sinDispMinutos: s.sin_disp_minutos,
    disponibilidad: s.disp_n ? s.disp_suma / s.disp_n : null,
    cocinaPedidos: s.cocina_pedidos,
    cocinaDemorada: s.cocina_demorada,
    tasaCocina: div(s.cocina_demorada, s.cocina_pedidos),
    espera: s.espera_peso ? s.espera_suma / s.espera_peso : null,
  };
}

/** Suma de tienda-días de Rappi (los cocientes se calculan sobre las sumas). */
export const sumar = (filas: FilaDiaRpc[]): Totales => totalesDeSuma(acumular(filas));

const hhmm = (instante: string, zona: string) => {
  const s = enZona(new Date(instante), zona).segundo;
  return `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
const localTexto = (instante: string, zona: string) => {
  const m = enZona(new Date(instante), zona);
  const s = m.segundo;
  return `${m.fecha} ${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
};
/** Si entre la última foto de un estado y la primera del siguiente pasan más de 20 min, ese hueco es «sin dato». */
const HUECO_MS = 20 * 60_000;

/** Parte [a, b) (instantes) en pedazos por día local: [{fecha, inicio, fin}] en segundos del día. */
function porDia(a: Date, b: Date, zona: string) {
  const out: { fecha: string; inicio: number; fin: number }[] = [];
  if (b <= a) return out;
  const ia = enZona(a, zona);
  const ib = enZona(b, zona);
  for (let f = ia.fecha; f <= ib.fecha; f = sumarDias(f, 1)) {
    const inicio = f === ia.fecha ? ia.segundo : 0;
    const fin = f === ib.fecha ? ib.segundo : 86_400;
    if (fin > inicio) out.push({ fecha: f, inicio, fin });
  }
  return out;
}

export function construirServicio(
  rpc: RpcServicio,
  desde: string,
  hasta: string,
  zona: string,
  diasEnHoraCentro: boolean,
): RespuestaServicio {
  const canalDe = new Map(rpc.tiendas.map((t) => [t.id, t.canal]));
  const filas = rpc.dias.filter((d) => canalDe.has(d.tienda));
  const porFecha = new Map<string, FilaDiaRpc[]>();
  for (const f of filas) porFecha.set(f.fecha, [...(porFecha.get(f.fecha) ?? []), f]);
  const porCanal: Partial<Record<CanalServicio, Totales>> = {};
  for (const t of rpc.tiendas) {
    const suyas = filas.filter((f) => f.tienda === t.id);
    if (suyas.length) porCanal[t.canal] = sumar(suyas);
  }

  const reclamos: ReclamoUi[] = rpc.reclamos
    .filter((r) => canalDe.has(r.tienda))
    .map((r) => ({
      pedido: r.pedido,
      fecha: r.fecha,
      canal: canalDe.get(r.tienda)!,
      producto: r.producto,
      tipo: MOTIVO_TIPO[r.motivo] ?? null,
      detalle: nombreSubtipo(r.subtipo),
      comentario: r.comentario,
      monto: r.monto === null ? null : Number(r.monto),
    }));
  const productos = new Map<
    string,
    { producto: string; reclamos: number; tipos: Record<TipoReclamo, number> }
  >();
  for (const r of reclamos) {
    if (!r.producto) continue;
    const p = productos.get(r.producto) ?? { producto: r.producto, reclamos: 0, tipos: cero(CLAVES_RECLAMO) };
    p.reclamos++;
    if (r.tipo) p.tipos[r.tipo]++;
    productos.set(r.producto, p);
  }

  // Conectividad: tramos por día local, con «sin dato» en los huecos entre fotos.
  const ultimosDias = new Set<string>();
  for (let f = hasta, i = 0; f >= desde && i < 7; f = sumarDias(f, -1), i++) ultimosDias.add(f);
  const cintas = new Map<string, TramoCinta[]>([...ultimosDias].sort().map((f) => [f, []]));
  const tramos: RespuestaServicio['tramos'] = [];
  for (const t of rpc.conectividad) {
    const canal = canalDe.get(t.tienda);
    if (!canal) continue;
    const ini = new Date(t.desde);
    const visto = new Date(t.visto);
    const sig = t.hasta ? new Date(t.hasta) : null;
    // El estado vale desde su primera foto hasta la siguiente (si llegó a tiempo) o hasta su última foto.
    const fin = sig && sig.getTime() - visto.getTime() <= HUECO_MS ? sig : visto;
    const estado: TramoCinta['estado'] = t.estado === 'ACTIVE' ? 'activa' : 'inactiva';
    for (const p of porDia(ini, fin, zona))
      cintas.get(p.fecha)?.push({ canal, inicio: p.inicio, fin: p.fin, estado, motivo: t.motivo });
    if (sig && fin === visto)
      for (const p of porDia(visto, sig, zona))
        cintas.get(p.fecha)?.push({ canal, inicio: p.inicio, fin: p.fin, estado: 'sin_dato', motivo: null });
    const lf = enZona(ini, zona).fecha;
    if (lf <= hasta && enZona(fin, zona).fecha >= desde)
      tramos.push({
        canal,
        estado: t.estado,
        motivo: t.motivo,
        desde: localTexto(t.desde, zona),
        hasta: t.hasta ? localTexto(fin.toISOString(), zona) : null,
        minutos: Math.round((fin.getTime() - ini.getTime()) / 60_000),
      });
  }

  const ahora = new Map(rpc.vigente.map((v) => [v.tienda, v]));
  const top = new Map(rpc.top.map((x) => [x.tienda, x]));
  return {
    desde,
    hasta,
    zona,
    diasEnHoraCentro,
    leidoEn: rpc.leido_en,
    canales: rpc.tiendas.map((t) => {
      const v = ahora.get(t.id);
      const x = top.get(t.id);
      return {
        canal: t.canal,
        id: t.id,
        nombre: t.nombre,
        ahora: v
          ? {
              canal: t.canal,
              activa: v.estado === 'ACTIVE',
              estadoRappi: v.estado,
              motivo: v.motivo,
              cierra: v.cierra ? hhmm(v.cierra, zona) : null,
              desde: v.desde,
              visto: v.visto,
            }
          : null,
        top: x ? { categoria: x.categoria, proxima: x.proxima, fecha: x.fecha } : null,
      };
    }),
    totales: sumar(filas),
    porCanal,
    dias: [...porFecha.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([fecha, f]) => ({ fecha, total: sumar(f) })),
    reclamos,
    compensado: Math.round(reclamos.reduce((a, r) => a + (r.monto ?? 0), 0) * 100) / 100,
    productos: [...productos.values()].sort(
      (a, b) => b.reclamos - a.reclamos || a.producto.localeCompare(b.producto),
    ),
    cintas: [...cintas.entries()].map(([fecha, t]) => ({
      fecha,
      tramos: t.sort((a, b) => a.canal.localeCompare(b.canal) || a.inicio - b.inicio),
    })),
    conectividadDesde: rpc.primera_foto,
    tramos,
    semana: rpc.semana
      .filter((s) => canalDe.has(s.tienda))
      .map((s) => ({ canal: canalDe.get(s.tienda)!, fecha: s.fecha, matriz: s.matriz })),
  };
}
