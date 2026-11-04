import type { ConfigSucursal } from './config';
import type { CoberturaMes, SinRecetaMes } from './consumo-mes';
import type { ConsumoNacional, DesgloseConsumo, InsumoNacional, SucursalConsumoMes } from './contratos';
import type { FiltroOrigen } from './metricas';
import type { Origen } from './normalizar';

/** Consumo nacional (docs/sucursales/17): de las RPC de la migración 38 a la vista. Puro; el filtro de origen se aplica aquí. */
export interface RpcConsumoNacional {
  meses: string[];
  sucursales: {
    company_id: number;
    calculado_en: string;
    recetas_leidas_en: string;
    completa: boolean;
    cobertura: Partial<Record<Origen, CoberturaMes>>;
    sin_receta: Partial<Record<Origen, SinRecetaMes[]>>;
  }[];
  insumos: {
    insumo_id: string;
    insumo: string;
    unidad: string;
    categoria: string;
    presentacion: number | string | null;
    origen: Origen;
    cantidad: number | string;
  }[];
  /** Mes anterior y mes actual, ambos solo de las sucursales que tienen los dos meses calculados. */
  anterior: { insumo_id: string; origen: Origen; cantidad: number | string }[];
  actual_comun: { insumo_id: string; origen: Origen; cantidad: number | string }[];
  sucursales_anterior: number;
}

export function armarConsumoNacional(
  rpc: RpcConsumoNacional,
  mes: string | null,
  sucursales: ConfigSucursal[],
  generadoEn: string,
): ConsumoNacional {
  const cfg = new Map(sucursales.map((s) => [s.companyId, s]));
  const insumos = new Map<string, InsumoNacional>();
  for (const x of rpc.insumos) {
    const i = insumos.get(x.insumo_id) ?? {
      insumoId: x.insumo_id,
      insumo: x.insumo,
      unidad: x.unidad,
      categoria: x.categoria,
      presentacion: x.presentacion === null ? null : Number(x.presentacion),
      porOrigen: {},
      anterior: {},
      actualComun: {},
    };
    i.porOrigen[x.origen] = Number(x.cantidad);
    insumos.set(x.insumo_id, i);
  }
  for (const a of rpc.anterior) {
    const i = insumos.get(a.insumo_id);
    if (i) i.anterior[a.origen] = Number(a.cantidad);
  }
  for (const a of rpc.actual_comun) {
    const i = insumos.get(a.insumo_id);
    if (i) i.actualComun[a.origen] = Number(a.cantidad);
  }
  return {
    generadoEn,
    mes,
    meses: rpc.meses,
    sucursalesAnterior: rpc.sucursales_anterior,
    sucursalesEsperadas: sucursales.length,
    sucursales: rpc.sucursales.map(
      (s): SucursalConsumoMes => ({
        companyId: s.company_id,
        nombre: cfg.get(s.company_id)?.nombre ?? String(s.company_id),
        ciudad: cfg.get(s.company_id)?.ciudad ?? 'Sin ciudad',
        completa: s.completa,
        calculadoEn: s.calculado_en,
        recetasLeidasEn: s.recetas_leidas_en,
        cobertura: s.cobertura,
        sinReceta: s.sin_receta,
      }),
    ),
    insumos: [...insumos.values()],
  };
}

export const sumarOrigen = (x: Partial<Record<Origen, number>>, f: FiltroOrigen) =>
  f === 'todos' ? Object.values(x).reduce((a: number, v) => a + (v ?? 0), 0) : (x[f] ?? 0);

const enOrigen = <T>(x: Partial<Record<Origen, T>>, f: FiltroOrigen): T[] =>
  (f === 'todos' ? Object.values(x) : [x[f]]).filter((v): v is T => v !== undefined);

export interface FilaInsumo {
  insumoId: string;
  insumo: string;
  unidad: string;
  categoria: string;
  cantidad: number;
  presentaciones: number | null;
  presentacion: number | null;
  cambio: number | null;
}
export interface VistaConsumo {
  categorias: { categoria: string; filas: FilaInsumo[] }[];
  ingredientes: number;
  sucursales: number;
  incompletas: number;
  cobertura: number | null;
  sinReceta: { nombre: string; unidades: number; sucursales: number; sinCodigo: boolean }[];
}

export function vistaConsumo(d: ConsumoNacional, f: FiltroOrigen): VistaConsumo {
  const filas: FilaInsumo[] = [];
  for (const i of d.insumos) {
    const cantidad = sumarOrigen(i.porOrigen, f);
    if (cantidad <= 0) continue;
    // El cambio compara el mismo conjunto de sucursales: lo actual de las que tienen ambos meses contra su mes anterior.
    const antes = sumarOrigen(i.anterior, f);
    const comun = sumarOrigen(i.actualComun, f);
    filas.push({
      insumoId: i.insumoId,
      insumo: i.insumo,
      unidad: i.unidad,
      categoria: i.categoria,
      cantidad,
      presentacion: i.presentacion,
      presentaciones: i.presentacion && i.presentacion > 0 ? cantidad / i.presentacion : null,
      cambio: d.sucursalesAnterior > 0 && antes > 0 ? comun / antes - 1 : null,
    });
  }
  const porCategoria = new Map<string, FilaInsumo[]>();
  for (const x of filas) porCategoria.set(x.categoria, [...(porCategoria.get(x.categoria) ?? []), x]);
  let lineas = 0;
  let incluidas = 0;
  const sin = new Map<string, { nombre: string; unidades: number; sucursales: Set<number>; sinCodigo: boolean }>();
  for (const s of d.sucursales) {
    for (const c of enOrigen(s.cobertura, f)) {
      lineas += c.lineas;
      incluidas += c.incluidas;
    }
    for (const lista of enOrigen(s.sinReceta, f))
      for (const x of lista) {
        const y = sin.get(x.nombre) ?? { nombre: x.nombre, unidades: 0, sucursales: new Set<number>(), sinCodigo: x.sinCodigo };
        y.unidades += x.unidades;
        y.sucursales.add(s.companyId);
        sin.set(x.nombre, y);
      }
  }
  return {
    categorias: [...porCategoria]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([categoria, fs]) => ({ categoria, filas: fs.sort((a, b) => b.cantidad - a.cantidad || a.insumo.localeCompare(b.insumo, 'es')) })),
    ingredientes: filas.length,
    sucursales: d.sucursales.length,
    incompletas: d.sucursales.filter((s) => !s.completa).length,
    cobertura: lineas ? incluidas / lineas : null,
    sinReceta: [...sin.values()]
      .map((x) => ({ nombre: x.nombre, unidades: x.unidades, sucursales: x.sucursales.size, sinCodigo: x.sinCodigo }))
      .sort((a, b) => b.unidades - a.unidades),
  };
}

export function armarDesglose(
  filas: DesgloseConsumo['filas'],
  insumoId: string,
  f: FiltroOrigen,
  sucursales: SucursalConsumoMes[],
) {
  const info = new Map(sucursales.map((s) => [s.companyId, s]));
  const porSucursal = new Map<number, number>();
  for (const x of filas)
    if (x.insumoId === insumoId && (f === 'todos' || x.origen === f))
      porSucursal.set(x.companyId, (porSucursal.get(x.companyId) ?? 0) + x.cantidad);
  const total = [...porSucursal.values()].reduce((a, b) => a + b, 0) || 1;
  const lista = [...porSucursal].map(([companyId, cantidad]) => ({
    companyId,
    nombre: info.get(companyId)?.nombre ?? String(companyId),
    ciudad: info.get(companyId)?.ciudad ?? 'Sin ciudad',
    cantidad,
    parte: cantidad / total,
  }));
  const ciudades = new Map<string, number>();
  for (const s of lista) ciudades.set(s.ciudad, (ciudades.get(s.ciudad) ?? 0) + s.cantidad);
  return {
    ciudades: [...ciudades]
      .map(([ciudad, cantidad]) => ({ ciudad, cantidad, parte: cantidad / total }))
      .sort((a, b) => b.cantidad - a.cantidad),
    sucursales: lista.sort((a, b) => b.cantidad - a.cantidad),
  };
}
