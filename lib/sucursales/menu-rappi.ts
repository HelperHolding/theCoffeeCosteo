import type { CanalServicio } from './servicio';

/**
 * Menú/Carta de Rappi (docs/rappi-portal/09): productos y toppings encendidos y apagados de cada tienda, leídos del portal
 * de Partners cada 30 min. Funciones puras: lo que devuelven las RPC sucursales_menu_rappi y sucursales_menu_nacional y
 * cómo se arma para la pantalla.
 * - Rappi NO dice desde cuándo está apagado algo: el «desde» sale de nuestras lecturas (tramos). Si ya estaba apagado en
 *   la primera lectura, se dice «desde antes de» esa lectura; nunca se inventa una hora.
 * - `activo: false` (inactivo o eliminado) no cuenta como apagado; los eliminados ni llegan.
 */

/** Un apagado de este tiempo o más pasa a «por revisar». */
export const HORAS_REVISAR = 24;
/** Sin lectura en este tiempo, la lectura está retrasada (el lector corre cada 30 min). */
export const MINUTOS_RETRASO = 45;
/** Apagado en esta parte o más de las tiendas que lo tienen: posible falta de abasto. */
export const PARTE_ABASTO = 0.3;

// ── Lo que devuelven las RPC ──────────────────────────────────────────────────────────────────────────────────────
export interface ProductoMenuRpc {
  tienda: string;
  id: string;
  nombre: string;
  nombre_norm: string;
  categoria: string | null;
  categoria_activa: boolean | null;
  precio: number | null;
  precio_anterior: number | null;
  disponible: boolean;
  activo: boolean;
  tiene_foto: boolean;
  tiene_descripcion: boolean;
  /** Grupos obligatorios (mínimo ≥ 1) sin ninguna opción disponible: el producto no se puede pedir. */
  sin_opcion_obligatoria: string[] | null;
  /** Desde cuándo está en su estado actual, según nuestras lecturas (tramo vigente). */
  desde: string | null;
}
export interface ToppingMenuRpc {
  tienda: string;
  id: string;
  nombre: string;
  nombre_norm: string;
  grupo: string | null;
  grupo_minimo: number | null;
  precio: number | null;
  disponible: boolean;
  activo: boolean;
  /** De cuántos productos es opción. */
  productos: number;
  desde: string | null;
}
export interface CorridaMenuRpc {
  inicio: string;
  fin: string | null;
  tiendas: number;
  leidas: number;
  fallidas: number;
  completa: boolean;
  detalle: { tienda: string; motivo?: string | null }[] | null;
}
export interface CambioMenuRpc {
  tienda: string;
  tipo: 'producto' | 'topping';
  item_id: string;
  disponible: boolean;
  desde: string;
  hasta: string | null;
}
export interface TiendaMenuRpc {
  id: string;
  nombre: string;
  canal: CanalServicio;
}
export interface RpcMenuRappi {
  tiendas: TiendaMenuRpc[];
  productos: ProductoMenuRpc[];
  toppings: ToppingMenuRpc[];
  /** La lectura más vieja de estas tiendas: antes de ella no sabemos nada. */
  primera_lectura: string | null;
  corrida: CorridaMenuRpc | null;
  /** Tramos de los últimos 7 días (se apagó / se prendió). */
  cambios: CambioMenuRpc[];
}

// ── Lo que ve la pantalla ─────────────────────────────────────────────────────────────────────────────────────────
export type EstadoLectura = 'al-dia' | 'retrasada' | 'sin';
export interface LecturaMenu {
  fin: string | null;
  /** Minutos desde la última lectura terminada. */
  minutos: number | null;
  estado: EstadoLectura;
  completa: boolean;
  /** Tiendas (de las que se ven aquí) que fallaron en la última corrida. */
  fallidas: string[];
  primera: string | null;
}
export interface ConteoMenu {
  productos: number;
  apagados: number;
  toppings: number;
  toppingsApagados: number;
  /** Disponibles que no se pueden pedir (grupo obligatorio sin opciones). */
  noSePuedenPedir: number;
  /** Apagados (productos y toppings) hace HORAS_REVISAR o más. */
  revisar: number;
  sinFoto: number;
  sinDescripcion: number;
}
export type Nivel = 'grave' | 'alto' | 'medio' | 'info';
export interface ItemRevisar {
  nivel: Nivel;
  motivo: string;
  canal: CanalServicio;
  tienda: string;
  tipo: 'producto' | 'topping';
  nombre: string;
  categoria: string | null;
  precio: number | null;
  /** Desde cuándo (lectura); null si ya estaba así en la primera lectura o no aplica. */
  desde: string | null;
  /** Ya estaba así en la primera lectura: el tiempo es «al menos». */
  previo: boolean;
  /** Horas en ese estado (al menos, si `previo`); null si no aplica. */
  horas: number | null;
}
export interface RespuestaMenu {
  lectura: LecturaMenu;
  canales: { canal: CanalServicio; id: string; nombre: string; conteo: ConteoMenu }[];
  totales: ConteoMenu;
  revisar: ItemRevisar[];
  toppingsApagados: {
    grupo: string;
    items: {
      nombre: string;
      canal: CanalServicio;
      previo: boolean;
      horas: number | null;
      productos: number;
    }[];
  }[];
  /** Cambios de las últimas 24 h, el más reciente primero (sin la foto inicial). */
  cambios: {
    cuando: string;
    canal: CanalServicio;
    tipo: 'producto' | 'topping';
    nombre: string;
    disponible: boolean;
  }[];
}

const RANGO: Record<Nivel, number> = { grave: 0, alto: 1, medio: 2, info: 3 };
const HORA_MS = 3_600_000;

export function lecturaDe(
  corrida: CorridaMenuRpc | null,
  primera: string | null,
  nombreDe: (tienda: string) => string | null,
  ahora: Date,
): LecturaMenu {
  const fin = corrida?.fin ?? null;
  const minutos = fin ? Math.max(0, Math.round((ahora.getTime() - Date.parse(fin)) / 60_000)) : null;
  const fallidas = (corrida?.detalle ?? []).map((x) => nombreDe(x.tienda)).filter((x): x is string => !!x);
  return {
    fin,
    minutos,
    estado: minutos === null ? 'sin' : minutos > MINUTOS_RETRASO ? 'retrasada' : 'al-dia',
    completa: corrida?.completa ?? false,
    fallidas,
    primera,
  };
}

/** ¿Desde cuándo? `previo` si el estado ya estaba en la primera lectura (o no hay tramo). */
export function tiempoDe(desde: string | null, primera: string | null, ahora: Date) {
  const previo = !desde || (!!primera && Date.parse(desde) <= Date.parse(primera) + 60_000);
  const base = previo ? primera : desde;
  return {
    previo,
    desde: previo ? null : desde,
    horas: base ? (ahora.getTime() - Date.parse(base)) / HORA_MS : null,
  };
}

const vacio = (): ConteoMenu => ({
  productos: 0,
  apagados: 0,
  toppings: 0,
  toppingsApagados: 0,
  noSePuedenPedir: 0,
  revisar: 0,
  sinFoto: 0,
  sinDescripcion: 0,
});
export function sumarConteos(cs: ConteoMenu[]): ConteoMenu {
  const t = vacio();
  for (const c of cs) for (const k of Object.keys(t) as (keyof ConteoMenu)[]) t[k] += c[k];
  return t;
}

const ordenar = (a: ItemRevisar, b: ItemRevisar) =>
  RANGO[a.nivel] - RANGO[b.nivel] || (b.horas ?? -1) - (a.horas ?? -1) || a.nombre.localeCompare(b.nombre);
const dinero = (x: number | null) => (x === null ? '—' : `$${Number(x).toLocaleString('es-MX')}`);

export function construirMenu(rpc: RpcMenuRappi, ahora = new Date()): RespuestaMenu {
  const canalDe = new Map(rpc.tiendas.map((t) => [t.id, t.canal]));
  const primera = rpc.primera_lectura;
  const productos = rpc.productos.filter((p) => p.activo !== false && canalDe.has(p.tienda));
  const toppings = rpc.toppings.filter((t) => t.activo !== false && canalDe.has(t.tienda));
  const conteo = new Map<string, ConteoMenu>(rpc.tiendas.map((t) => [t.id, vacio()]));
  const revisar: ItemRevisar[] = [];

  for (const p of productos) {
    const c = conteo.get(p.tienda)!;
    const canal = canalDe.get(p.tienda)!;
    const t = tiempoDe(p.desde, primera, ahora);
    const base = {
      canal,
      tienda: p.tienda,
      tipo: 'producto' as const,
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
    };
    c.productos++;
    if (!p.tiene_foto) c.sinFoto++;
    if (!p.tiene_descripcion) c.sinDescripcion++;
    const grupos = p.sin_opcion_obligatoria ?? [];
    if (!p.disponible) {
      c.apagados++;
      const viejo = t.horas !== null && t.horas >= HORAS_REVISAR;
      if (viejo) c.revisar++;
      revisar.push({
        ...base,
        ...t,
        nivel: viejo ? 'alto' : 'medio',
        motivo: viejo ? `Apagado hace más de ${HORAS_REVISAR} h` : 'Apagado',
      });
    } else if (grupos.length) {
      c.noSePuedenPedir++;
      revisar.push({
        ...base,
        ...t,
        nivel: 'grave',
        motivo: `No se puede pedir: ${grupos.map((g) => `«${g}»`).join(', ')} sin opciones`,
      });
    }
    if (!p.tiene_foto)
      revisar.push({ ...base, nivel: 'info', motivo: 'Sin foto', desde: null, previo: false, horas: null });
    if (!p.tiene_descripcion)
      revisar.push({
        ...base,
        nivel: 'info',
        motivo: 'Sin descripción',
        desde: null,
        previo: false,
        horas: null,
      });
  }

  // Mismo producto (por nombre) con precio distinto entre Rappi y Turbo: se avisa una vez.
  const porNombre = new Map<string, ProductoMenuRpc[]>();
  for (const p of productos) porNombre.set(p.nombre_norm, [...(porNombre.get(p.nombre_norm) ?? []), p]);
  for (const lista of porNombre.values()) {
    const precios = new Set(lista.map((p) => Number(p.precio)));
    const canales = new Set(lista.map((p) => canalDe.get(p.tienda)));
    if (canales.size < 2 || precios.size < 2) continue;
    const p = lista.find((x) => canalDe.get(x.tienda) === 'normal') ?? lista[0];
    revisar.push({
      canal: canalDe.get(p.tienda)!,
      tienda: p.tienda,
      tipo: 'producto',
      nombre: p.nombre,
      categoria: p.categoria,
      precio: p.precio,
      nivel: 'info',
      motivo: `Precio distinto: ${lista.map((x) => `${dinero(x.precio)} en ${canalDe.get(x.tienda) === 'turbo' ? 'Turbo' : 'Rappi'}`).join(', ')}`,
      desde: null,
      previo: false,
      horas: null,
    });
  }

  const grupos = new Map<string, RespuestaMenu['toppingsApagados'][number]['items']>();
  for (const x of toppings) {
    const c = conteo.get(x.tienda)!;
    c.toppings++;
    if (x.disponible) continue;
    c.toppingsApagados++;
    const t = tiempoDe(x.desde, primera, ahora);
    const viejo = t.horas !== null && t.horas >= HORAS_REVISAR;
    if (viejo) c.revisar++;
    const canal = canalDe.get(x.tienda)!;
    revisar.push({
      canal,
      tienda: x.tienda,
      tipo: 'topping',
      nombre: x.nombre,
      categoria: x.grupo,
      precio: x.precio,
      ...t,
      nivel: viejo ? 'alto' : 'medio',
      motivo: viejo ? `Topping apagado hace más de ${HORAS_REVISAR} h` : 'Topping apagado',
    });
    const g = x.grupo || 'Sin grupo';
    grupos.set(g, [
      ...(grupos.get(g) ?? []),
      { nombre: x.nombre, canal, previo: t.previo, horas: t.horas, productos: x.productos },
    ]);
  }

  // Cambios de las últimas 24 h; la foto inicial (tramos que empiezan en la primera lectura) no es un cambio.
  const nombreDe = new Map<string, string>([
    ...productos.map((p) => [`producto|${p.tienda}|${p.id}`, p.nombre] as const),
    ...toppings.map((t) => [`topping|${t.tienda}|${t.id}`, t.nombre] as const),
  ]);
  const cambios = rpc.cambios
    .filter((x) => canalDe.has(x.tienda) && ahora.getTime() - Date.parse(x.desde) <= 24 * HORA_MS)
    .filter((x) => !tiempoDe(x.desde, primera, ahora).previo)
    .map((x) => ({
      cuando: x.desde,
      canal: canalDe.get(x.tienda)!,
      tipo: x.tipo,
      nombre: nombreDe.get(`${x.tipo}|${x.tienda}|${x.item_id}`) ?? x.item_id,
      disponible: x.disponible,
    }))
    .sort((a, b) => b.cuando.localeCompare(a.cuando));

  const canales = rpc.tiendas
    .map((t) => ({ canal: t.canal, id: t.id, nombre: t.nombre, conteo: conteo.get(t.id)! }))
    .sort((a, b) => a.canal.localeCompare(b.canal));
  return {
    lectura: lecturaDe(
      rpc.corrida,
      primera,
      (id) => rpc.tiendas.find((t) => t.id === id)?.nombre ?? null,
      ahora,
    ),
    canales,
    totales: sumarConteos(canales.map((c) => c.conteo)),
    revisar: revisar.sort(ordenar),
    toppingsApagados: [...grupos.entries()]
      .map(([grupo, items]) => ({ grupo, items: items.sort((a, b) => a.nombre.localeCompare(b.nombre)) }))
      .sort((a, b) => b.items.length - a.items.length || a.grupo.localeCompare(b.grupo)),
    cambios,
  };
}

// ── Nacional (Tablero de México) ─────────────────────────────────────────────────────────────────────────────────
export interface RpcMenuNacional {
  tiendas: (TiendaMenuRpc & { company_id: number })[];
  por_tienda: {
    tienda: string;
    productos: number;
    apagados: number;
    toppings: number;
    toppings_apagados: number;
    sin_opcion: number;
    sin_foto: number;
    sin_descripcion: number;
  }[];
  /** Productos y toppings apagados (activos, no eliminados), con su «desde». */
  apagados: {
    tienda: string;
    tipo: 'producto' | 'topping';
    id: string;
    nombre: string;
    nombre_norm: string;
    categoria: string | null;
    desde: string | null;
  }[];
  /** Disponibles que no se pueden pedir. */
  sin_opcion: { tienda: string; nombre: string; categoria: string | null; grupos: string[] }[];
  /** En cuántas tiendas existe cada producto (activo), por nombre normalizado. */
  presencia: { nombre_norm: string; tiendas: number }[];
  primera_lectura: string | null;
  corrida: CorridaMenuRpc | null;
}
export interface SucursalMenuInfo {
  companyId: number;
  nombre: string;
  ciudad: string;
  rappiPortal?: boolean;
}
export interface FilaSucursalMenu extends SucursalMenuInfo {
  conteo: ConteoMenu;
  /** Parte del menú (productos) apagada. */
  parte: number | null;
  /** El apagado más antiguo (horas, al menos si `previo`). */
  masAntiguo: { horas: number | null; previo: boolean } | null;
}
export interface RespuestaMenuNacional {
  lectura: LecturaMenu;
  totales: ConteoMenu;
  sucursales: FilaSucursalMenu[];
  enVarias: {
    nombre: string;
    nombre_norm: string;
    sucursales: { companyId: number; nombre: string }[];
    tiendasApagado: number;
    tiendasConProducto: number;
    parte: number | null;
    abasto: boolean;
  }[];
  revisar: (ItemRevisar & { companyId: number; sucursal: string })[];
  sinTienda: string[];
  sinLectura: string[];
}

export function construirMenuNacional(
  rpc: RpcMenuNacional,
  sucursales: SucursalMenuInfo[],
  ahora = new Date(),
): RespuestaMenuNacional {
  const tienda = new Map(rpc.tiendas.map((t) => [t.id, t]));
  const suc = new Map(sucursales.map((s) => [s.companyId, s]));
  const primera = rpc.primera_lectura;
  const conteo = new Map<number, ConteoMenu>();
  const de = (companyId: number) => conteo.get(companyId) ?? conteo.set(companyId, vacio()).get(companyId)!;
  for (const x of rpc.por_tienda) {
    const t = tienda.get(x.tienda);
    if (!t || !suc.has(t.company_id)) continue;
    const c = de(t.company_id);
    c.productos += Number(x.productos);
    c.apagados += Number(x.apagados);
    c.toppings += Number(x.toppings);
    c.toppingsApagados += Number(x.toppings_apagados);
    c.noSePuedenPedir += Number(x.sin_opcion);
    c.sinFoto += Number(x.sin_foto);
    c.sinDescripcion += Number(x.sin_descripcion);
  }

  const revisar: RespuestaMenuNacional['revisar'] = [];
  const antiguo = new Map<number, { horas: number | null; previo: boolean }>();
  const porNombre = new Map<string, { nombre: string; tiendas: Set<string>; companias: Set<number> }>();
  for (const a of rpc.apagados) {
    const t = tienda.get(a.tienda);
    const s = t && suc.get(t.company_id);
    if (!t || !s) continue;
    const tm = tiempoDe(a.desde, primera, ahora);
    const viejo = tm.horas !== null && tm.horas >= HORAS_REVISAR;
    if (viejo) de(t.company_id).revisar++;
    const previo = antiguo.get(t.company_id);
    if (!previo || (tm.horas ?? -1) > (previo.horas ?? -1))
      antiguo.set(t.company_id, { horas: tm.horas, previo: tm.previo });
    if (viejo)
      revisar.push({
        companyId: s.companyId,
        sucursal: s.nombre,
        canal: t.canal,
        tienda: a.tienda,
        tipo: a.tipo,
        nombre: a.nombre,
        categoria: a.categoria,
        precio: null,
        ...tm,
        nivel: 'alto',
        motivo: `${a.tipo === 'topping' ? 'Topping apagado' : 'Apagado'} hace más de ${HORAS_REVISAR} h`,
      });
    if (a.tipo === 'producto') {
      const n = porNombre.get(a.nombre_norm) ?? {
        nombre: a.nombre,
        tiendas: new Set(),
        companias: new Set(),
      };
      n.tiendas.add(a.tienda);
      n.companias.add(s.companyId);
      porNombre.set(a.nombre_norm, n);
    }
  }
  for (const x of rpc.sin_opcion) {
    const t = tienda.get(x.tienda);
    const s = t && suc.get(t.company_id);
    if (!t || !s) continue;
    revisar.push({
      companyId: s.companyId,
      sucursal: s.nombre,
      canal: t.canal,
      tienda: x.tienda,
      tipo: 'producto',
      nombre: x.nombre,
      categoria: x.categoria,
      precio: null,
      desde: null,
      previo: false,
      horas: null,
      nivel: 'grave',
      motivo: `No se puede pedir: ${x.grupos.map((g) => `«${g}»`).join(', ')} sin opciones`,
    });
  }

  const presencia = new Map(rpc.presencia.map((p) => [p.nombre_norm, Number(p.tiendas)]));
  const enVarias = [...porNombre.entries()]
    .filter(([, n]) => n.companias.size >= 2)
    .map(([nombre_norm, n]) => {
      const con = presencia.get(nombre_norm) ?? n.tiendas.size;
      const parte = con ? n.tiendas.size / con : null;
      return {
        nombre: n.nombre,
        nombre_norm,
        sucursales: [...n.companias]
          .map((id) => ({ companyId: id, nombre: suc.get(id)!.nombre }))
          .sort((a, b) => a.nombre.localeCompare(b.nombre)),
        tiendasApagado: n.tiendas.size,
        tiendasConProducto: con,
        parte,
        abasto: parte !== null && parte >= PARTE_ABASTO,
      };
    })
    .sort((a, b) => b.sucursales.length - a.sucursales.length || a.nombre.localeCompare(b.nombre));

  const filas: FilaSucursalMenu[] = [...conteo.entries()]
    .map(([companyId, c]) => ({
      ...suc.get(companyId)!,
      conteo: c,
      parte: c.productos ? c.apagados / c.productos : null,
      masAntiguo: antiguo.get(companyId) ?? null,
    }))
    .sort(
      (a, b) =>
        b.conteo.apagados - a.conteo.apagados ||
        (b.parte ?? 0) - (a.parte ?? 0) ||
        a.nombre.localeCompare(b.nombre),
    );
  const conFila = new Set(filas.map((f) => f.companyId));
  return {
    lectura: lecturaDe(
      rpc.corrida,
      primera,
      (id) => {
        const t = tienda.get(id);
        return t ? (suc.get(t.company_id)?.nombre ?? t.nombre) : null;
      },
      ahora,
    ),
    totales: sumarConteos(filas.map((f) => f.conteo)),
    sucursales: filas,
    enVarias,
    revisar: revisar.sort(
      (a, b) =>
        RANGO[a.nivel] - RANGO[b.nivel] ||
        (b.horas ?? -1) - (a.horas ?? -1) ||
        a.sucursal.localeCompare(b.sucursal),
    ),
    sinTienda: sucursales.filter((s) => s.rappiPortal === false).map((s) => s.nombre),
    sinLectura: sucursales
      .filter((s) => s.rappiPortal !== false && !conFila.has(s.companyId))
      .map((s) => s.nombre),
  };
}
