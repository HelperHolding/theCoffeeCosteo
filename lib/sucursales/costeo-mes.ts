// lib/sucursales/costeo-mes.ts
import type { ConfigSucursal } from './config';
import {
  costear,
  type CosteoCompleto,
  type CosteoProducto,
  type CosteoResumen,
  type DatosCosteo,
} from './costeo';
import type { LecturaNormal } from './datos';
import { productos, type CatalogoNombres } from './metricas';
import type { Origen } from './normalizar';

/**
 * Costeo por mes cerrado (docs/sucursales/19): el de UNA sucursal con el MISMO cálculo que la sección Costeo
 * (costear, con la identidad de Productos) y los costos del día en que se calcula. Puro: no lee la API ni la base.
 * Lo guarda scripts/sucursales/consumo-mes.ts con la misma lectura del consumo; el Tablero de ciudad lo suma.
 */
export type OrigenCosteo = 'todos' | 'mostrador' | 'app' | 'rappi';
export const ORIGENES_COSTEO: OrigenCosteo[] = ['todos', 'mostrador', 'app', 'rappi'];

export interface ProductoCosteoMes {
  clave: string;
  codigo: string;
  nombre: string;
  sinCodigo: boolean;
  importeCent: number;
  lineas: number;
  costeo: CosteoProducto | null;
}

export interface FilaCosteoMes {
  mes: string;
  companyId: number;
  completa: boolean;
  costosLeidosEn: string;
  /** Por origen; un origen sin pedidos no va. */
  resumen: Partial<Record<OrigenCosteo, CosteoResumen>>;
  /** Todos los orígenes. */
  productos: ProductoCosteoMes[];
}

export function costeoMesSucursal(a: {
  mes: string;
  companyId: number;
  lectura: LecturaNormal;
  datos: DatosCosteo;
  catalogo?: CatalogoNombres;
}): FilaCosteoMes {
  const todos = a.lectura.pedidos;
  const t = costear(todos, a.datos, todos, a.catalogo);
  const resumen: FilaCosteoMes['resumen'] = { todos: t.resumen };
  for (const o of ['mostrador', 'app', 'rappi'] as const) {
    const ps = todos.filter((p) => p.origen === (o as Origen));
    if (ps.length) resumen[o] = costear(ps, a.datos, todos, a.catalogo).resumen;
  }
  return {
    mes: a.mes,
    companyId: a.companyId,
    completa: a.lectura.estado === 'completa',
    costosLeidosEn: a.datos.leidoEn,
    resumen,
    productos: productos(todos, todos, a.catalogo).map((x) => ({
      clave: x.clave,
      codigo: x.codigo,
      nombre: x.nombre,
      sinCodigo: !!x.sinCodigo,
      importeCent: x.importeCent,
      lineas: x.lineas,
      costeo: t.porClave.get(x.clave) ?? null,
    })),
  };
}

// ── Lectura de la ciudad (RPC sucursales_ciudad_costeo) ─────────────────────────────────────────────────────────

export interface CosteoCiudadRpc {
  mes: string | null;
  meses: string[];
  sucursales: {
    company_id: number;
    calculado_en: string;
    costos_leidos_en: string;
    completa: boolean;
    resumen: Partial<Record<OrigenCosteo, CosteoResumen>>;
    productos: ProductoCosteoMes[];
  }[];
}

export interface CosteoSucursalCiudad {
  companyId: number;
  nombre: string;
  completa: boolean;
  /** Venta total del origen (toda la venta, con y sin receta). */
  ventaCent: number;
  /** Solo las líneas de costeo completo: venta sin IVA, costo, margen y margen %. */
  completo: CosteoCompleto & { margenPct: number | null };
  /** Parte de la venta identificable que tiene receta (sobreIdentificable). */
  cobertura: number | null;
}

export interface ProductoCosteoCiudad {
  clave: string;
  nombre: string;
  importeCent: number;
  lineas: number;
  sucursales: number;
  completo: CosteoCompleto & { margenPct: number | null };
}

export interface RespuestaCosteoCiudad {
  mes: string | null;
  meses: string[];
  origen: OrigenCosteo;
  calculadoEn: string | null;
  costosLeidosEn: string | null;
  sucursales: CosteoSucursalCiudad[];
  /** Sucursales de la ciudad sin costeo de ese mes. */
  sinCalcular: string[];
  totales: {
    ventaCent: number;
    completo: CosteoCompleto & { margenPct: number | null };
    cobertura: number | null;
  };
  /** Productos de la ciudad con costeo completo, por venta. */
  productos: ProductoCosteoCiudad[];
}

const vacio = (): CosteoCompleto => ({
  lineas: 0,
  importeCent: 0,
  ventaSinIvaCent: 0,
  costoCent: 0,
  margenCent: 0,
});
const sumar = (a: CosteoCompleto, b: CosteoCompleto) => {
  a.lineas += b.lineas;
  a.importeCent += b.importeCent;
  a.ventaSinIvaCent += b.ventaSinIvaCent;
  a.costoCent += b.costoCent;
  a.margenCent += b.margenCent;
};
const conPct = (c: CosteoCompleto) => ({
  ...c,
  margenPct: c.ventaSinIvaCent > 0 ? c.margenCent / c.ventaSinIvaCent : null,
});

/** Suma la ciudad: por sucursal (ordenadas por margen %), totales y productos. */
export function armarCosteoCiudad(
  rpc: CosteoCiudadRpc,
  sucursales: Pick<ConfigSucursal, 'companyId' | 'nombre'>[],
  origen: OrigenCosteo,
): RespuestaCosteoCiudad {
  const nombre = new Map(sucursales.map((s) => [s.companyId, s.nombre]));
  const filas = rpc.sucursales.filter((s) => nombre.has(s.company_id));
  const total = vacio();
  let ventaCent = 0;
  let conReceta = 0;
  let identificable = 0;
  const porSucursal: CosteoSucursalCiudad[] = [];
  for (const s of filas) {
    const r = s.resumen[origen];
    if (!r) continue;
    sumar(total, r.completo);
    ventaCent += r.cobertura.totalCent;
    conReceta += r.cobertura.conRecetaCent;
    identificable += r.cobertura.identificableCent;
    porSucursal.push({
      companyId: s.company_id,
      nombre: nombre.get(s.company_id)!,
      completa: s.completa,
      ventaCent: r.cobertura.totalCent,
      completo: conPct(r.completo),
      cobertura: r.cobertura.sobreIdentificable,
    });
  }
  porSucursal.sort((a, b) => (b.completo.margenPct ?? -1) - (a.completo.margenPct ?? -1));

  const prods = new Map<string, ProductoCosteoCiudad & { suc: Set<number> }>();
  for (const s of filas)
    for (const p of s.productos) {
      if (!p.costeo || p.costeo.completo.lineas === 0) continue;
      const x = prods.get(p.clave) ?? {
        clave: p.clave,
        nombre: p.costeo.receta || p.nombre,
        importeCent: 0,
        lineas: 0,
        sucursales: 0,
        completo: { ...vacio(), margenPct: null },
        suc: new Set<number>(),
      };
      x.importeCent += p.importeCent;
      x.lineas += p.lineas;
      sumar(x.completo, p.costeo.completo);
      x.suc.add(s.company_id);
      prods.set(p.clave, x);
    }
  const lista = [...prods.values()]
    .map(({ suc, ...x }) => ({ ...x, sucursales: suc.size, completo: conPct(x.completo) }))
    .sort((a, b) => b.importeCent - a.importeCent);

  const fechas = (k: 'calculado_en' | 'costos_leidos_en') =>
    filas.length ? filas.map((f) => f[k]).sort()[0] : null;
  return {
    mes: rpc.mes,
    meses: rpc.meses,
    origen,
    calculadoEn: fechas('calculado_en'),
    costosLeidosEn: fechas('costos_leidos_en'),
    sucursales: porSucursal,
    sinCalcular: sucursales
      .filter((s) => !filas.some((f) => f.company_id === s.companyId))
      .map((s) => s.nombre),
    totales: {
      ventaCent,
      completo: conPct(total),
      cobertura: identificable > 0 ? conReceta / identificable : null,
    },
    productos: lista,
  };
}
