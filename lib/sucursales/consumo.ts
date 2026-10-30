import { CODIGO_GENERICO, ES_TAMANO, identificador, type CatalogoNombres } from './metricas';
import type { LineaNormal, PedidoNormal } from './normalizar';
import { cambiosPersonalizaciones, tamanoVerificado } from './costeo';
import { partesCombo } from './combos';

/**
 * Consumo TEÓRICO según receta de las ventas de Sucursales (docs/sucursales/13). Puro: no lee la base.
 * - No es inventario ni merma: es lo que las recetas de Costeo dicen que lleva cada unidad vendida.
 * - Solo cantidades, nunca dinero. Cobertura en LÍNEAS (unidades): A = todas y B = A − GENERIC.
 * - Mismo criterio que el costeo completo: una línea entra al consumo si su código está enlazado, su tamaño está
 *   verificado para esa receta y cada personalización es neutra o tiene un ajuste verificado (personalizaciones-
 *   verificadas.ts). El ajuste mueve las MISMAS cantidades que Costeo sobre las líneas directas de la receta
 *   (cambiosPersonalizaciones), p. ej. «Lactose free» descuenta deslactosada en lugar de entera. Además, la receta
 *   debe tener cantidades para ese tamaño. Diferencia con Costeo: un insumo inactivo no saca la línea (no hay costo).
 * - Misma identidad de líneas que Productos y Costeo (`identificador` con la evidencia de todo el periodo).
 */
export interface InsumoReceta {
  insumoId: string;
  insumo: string;
  unidad: string;
  categoria: string;
  /** Cantidad por unidad vendida, con sub-recetas expandidas. */
  cantidad: number;
}
export interface DatosConsumo {
  leidoEn: string;
  enlaces: Map<string, { recetaId: string; receta: string }>;
  unicas: Set<string>;
  /** `${recetaId}:${tamaño}` → insumos por unidad. */
  recetas: Map<string, InsumoReceta[]>;
  /** Líneas DIRECTAS (nombre de insumo y cantidad) por receta y tamaño, para los ajustes. Desde la migración 27. */
  lineas?: Map<string, { insumo: string; cantidad: number }[]>;
  /** Insumo nuevo de un ajuste cuando la receta no lo lleva (lista cerrada de sustitutos). Desde la migración 27. */
  sustitutos?: Map<string, Omit<InsumoReceta, 'cantidad'>>;
}

/** Receta expandida de una unidad con los cambios de sus personalizaciones; null si falta el insumo nuevo. */
function conCambios(
  receta: InsumoReceta[],
  cambios: Map<string, number>,
  sustitutos: DatosConsumo['sustitutos'],
): InsumoReceta[] | null {
  if (!cambios.size) return receta;
  const r = receta.map((x) => ({ ...x }));
  for (const [insumo, dq] of cambios) {
    const x = r.find((y) => y.insumo === insumo);
    if (x) x.cantidad += dq;
    else {
      const s = sustitutos?.get(insumo);
      if (!s || dq < 0) return null;
      r.push({ ...s, cantidad: dq });
    }
  }
  // Un cambio nunca deja cantidades negativas: la receta expandida incluye las líneas directas que se mueven.
  if (r.some((x) => x.cantidad < -1e-9)) return null;
  return r.filter((x) => x.cantidad > 1e-9);
}

export const CATEGORIA_LECHE = 'LECHE';
export type MotivoExcluido = 'tamano' | 'personalizacion' | 'receta';

export interface CantidadInsumo {
  insumoId: string;
  insumo: string;
  unidad: string;
  categoria: string;
  cantidad: number;
}
export interface ConsumoProducto {
  clave: string;
  recetaId: string;
  receta: string;
  /** Si el producto se vendió dentro de un combo, el nombre del combo (trazabilidad de la venta). */
  combo?: string;
  /** Unidades que entran al consumo y las que no (por motivo). */
  lineas: number;
  excluidas: Record<MotivoExcluido, number>;
  tamanos: { tamano: string; lineas: number }[];
  insumos: CantidadInsumo[];
}
export interface CoberturaConsumo {
  /** A: todas las unidades del periodo. Un combo cuenta como sus productos (bebida y pan, cada uno una unidad). */
  lineas: number;
  generico: number;
  /** B: A − GENERIC. */
  identificables: number;
  sinCodigo: number;
  sinEnlace: number;
  conReceta: number;
  /** Con receta pero fuera del consumo, por motivo. */
  excluidas: Record<MotivoExcluido, number>;
  /** Líneas que sí entran al consumo. */
  incluidas: number;
  /** De las incluidas, cuántas con una personalización que cambió la receta (ajuste verificado). */
  ajustadas: number;
  /** incluidas ÷ A e incluidas ÷ B (null si el denominador es 0). */
  sobreTotal: number | null;
  sobreIdentificable: number | null;
}
/** Un insumo del periodo: total, cuánto viene de Rappi (el resto es del POS) y qué productos lo consumen. */
export interface InsumoConsumo extends CantidadInsumo {
  productos: number;
  rappi: number;
  /** Por producto (y combo en el que se vendió, si aplica). */
  detalle: { receta: string; combo?: string; cantidad: number; rappi: number }[];
}
/**
 * Producto vendido que aún no suma al consumo porque no tiene receta enlazada (o, sin código, no se identifica). En
 * cuanto su código tenga receta, sus unidades entran solas: no se guarda nada aparte.
 */
export interface SinReceta {
  nombre: string;
  unidades: number;
  rappi: number;
  sinCodigo: boolean;
}
export interface ResultadoConsumo {
  cobertura: CoberturaConsumo;
  insumos: InsumoConsumo[];
  sinReceta: SinReceta[];
  categorias: {
    categoria: string;
    insumos: number;
    totales: { unidad: string; cantidad: number; rappi: number }[];
  }[];
  productos: ConsumoProducto[];
  tamanos: { tamano: string; lineas: number }[];
  diario: { fecha: string; lineas: number; incluidas: number; cantidades: Record<string, number> }[];
}

const claveReceta = (recetaId: string, tamano: string) => `${recetaId}:${tamano}`;
export const claveConsumo = claveReceta;
const motivosVacios = (): Record<MotivoExcluido, number> => ({ tamano: 0, personalizacion: 0, receta: 0 });
const redondear = (x: number) => Math.round(x * 1000) / 1000;

/**
 * Insumos de una línea (o de una parte de un combo de Rappi) según su receta, tamaño verificado y personalizaciones, o
 * por qué queda fuera. Mismo orden de motivos de siempre: tamaño → personalización → receta → personalización.
 */
function recetaDe(
  l: Pick<LineaNormal, 'customs'>,
  recetaId: string,
  datos: DatosConsumo,
): { motivo: MotivoExcluido } | { tamano: string; receta: InsumoReceta[]; ajustada: boolean } {
  const tamano = tamanoVerificado(l, recetaId, datos);
  if (!tamano) return { motivo: 'tamano' };
  const base = datos.recetas.get(claveReceta(recetaId, tamano));
  const cambios = cambiosPersonalizaciones(
    recetaId,
    l.customs.filter((c) => !ES_TAMANO.test(c.nombre)).map((c) => c.nombre),
    datos.lineas?.get(claveReceta(recetaId, tamano)),
  );
  if (!cambios) return { motivo: 'personalizacion' };
  if (!base?.length) return { motivo: 'receta' };
  const receta = conCambios(base, cambios, datos.sustitutos);
  if (!receta) return { motivo: 'personalizacion' };
  return { tamano, receta, ajustada: cambios.size > 0 };
}

/** `ps`: pedidos ya filtrados por origen; `evidencia`: todos los del periodo (ver identificador). */
export function consumir(
  ps: PedidoNormal[],
  datos: DatosConsumo,
  evidencia: PedidoNormal[] = ps,
  catalogo?: CatalogoNombres,
  fechas: string[] = [],
  /** Contar los combos del POS por sus productos (COMBOS_POS). Hoy solo el piloto de Namóra (rappiPortal). */
  combosPorProducto = false,
): ResultadoConsumo {
  const identidad = identificador(evidencia, catalogo);
  const cob = {
    lineas: 0,
    generico: 0,
    sinCodigo: 0,
    sinEnlace: 0,
    conReceta: 0,
    incluidas: 0,
    ajustadas: 0,
  };
  const excluidas = motivosVacios();
  const insumos = new Map<
    string,
    CantidadInsumo & {
      rappi: number;
      productos: Set<string>;
      detalle: Map<string, { receta: string; combo?: string; cantidad: number; rappi: number }>;
    }
  >();
  const sinReceta = new Map<string, SinReceta>();
  const anotarSinReceta = (clave: string, nombre: string, deRappi: boolean, sinCodigo: boolean) => {
    const s = sinReceta.get(clave) ?? { nombre, unidades: 0, rappi: 0, sinCodigo };
    s.unidades++;
    if (deRappi) s.rappi++;
    sinReceta.set(clave, s);
  };
  const productos = new Map<
    string,
    Omit<ConsumoProducto, 'tamanos' | 'insumos'> & {
      tamanos: Map<string, number>;
      insumos: Map<string, CantidadInsumo>;
    }
  >();
  const tamanos = new Map<string, number>();
  const diario = new Map(
    fechas.map((f) => [f, { fecha: f, lineas: 0, incluidas: 0, cantidades: {} as Record<string, number> }]),
  );
  for (const p of ps) {
    let dia = diario.get(p.fecha);
    if (!dia) {
      dia = { fecha: p.fecha, lineas: 0, incluidas: 0, cantidades: {} };
      diario.set(p.fecha, dia);
    }
    const deRappi = p.origen === 'rappi';
    /**
     * Cuenta una unidad con su receta: un producto suelto o un producto dentro de un combo. Cada producto entra o queda
     * fuera por sí mismo (el croissant de un combo suma aunque la bebida lleve algo que aún no se calcula) y conserva
     * de qué venta salió (`combo`).
     */
    const contar = (
      u: { codigo: string; nombre: string; customs: LineaNormal['customs'] },
      clave: string,
      combo?: string,
    ) => {
      cob.lineas++;
      dia.lineas++;
      const enlace = datos.enlaces.get(u.codigo);
      if (!enlace) {
        cob.sinEnlace++;
        anotarSinReceta(combo ? `parte:${u.codigo}` : clave, u.nombre, deRappi, false);
        return;
      }
      cob.conReceta++;
      let x = productos.get(clave);
      if (!x) {
        x = {
          clave,
          ...enlace,
          ...(combo ? { combo } : {}),
          lineas: 0,
          excluidas: motivosVacios(),
          tamanos: new Map(),
          insumos: new Map(),
        };
        productos.set(clave, x);
      }
      const r = recetaDe(u, enlace.recetaId, datos);
      if ('motivo' in r) {
        excluidas[r.motivo]++;
        x.excluidas[r.motivo]++;
        return;
      }
      cob.incluidas++;
      if (r.ajustada) cob.ajustadas++;
      dia.incluidas++;
      x.lineas++;
      x.tamanos.set(r.tamano, (x.tamanos.get(r.tamano) ?? 0) + 1);
      tamanos.set(r.tamano, (tamanos.get(r.tamano) ?? 0) + 1);
      for (const i of r.receta) {
        const t = insumos.get(i.insumoId) ?? {
          ...i,
          cantidad: 0,
          rappi: 0,
          productos: new Set<string>(),
          detalle: new Map(),
        };
        t.cantidad += i.cantidad;
        if (deRappi) t.rappi += i.cantidad;
        t.productos.add(clave);
        const d = t.detalle.get(clave) ?? {
          receta: x.receta,
          ...(combo ? { combo } : {}),
          cantidad: 0,
          rappi: 0,
        };
        d.cantidad += i.cantidad;
        if (deRappi) d.rappi += i.cantidad;
        t.detalle.set(clave, d);
        insumos.set(i.insumoId, t);
        const pi = x.insumos.get(i.insumoId) ?? { ...i, cantidad: 0 };
        pi.cantidad += i.cantidad;
        x.insumos.set(i.insumoId, pi);
        dia.cantidades[i.insumoId] = (dia.cantidades[i.insumoId] ?? 0) + i.cantidad;
      }
    };
    for (const l of p.lineas) {
      const id = identidad(l);
      if (id.sinCodigo || id.codigo === CODIGO_GENERICO) {
        cob.lineas++;
        dia.lineas++;
        if (id.sinCodigo) {
          cob.sinCodigo++;
          anotarSinReceta(id.clave, l.nombre, deRappi, true);
        } else cob.generico++;
        continue;
      }
      // Un combo cuenta como sus productos: los de Rappi traen sus partes; los del POS se arman con COMBOS_POS
      // (solo donde se activa, hoy el piloto de Namóra).
      const partes = l.partes ?? (combosPorProducto ? partesCombo(id.codigo, l) : undefined);
      if (partes) for (const pt of partes) contar(pt, `${id.clave}>${pt.codigo}`, l.nombre);
      else contar({ codigo: id.codigo, nombre: l.nombre, customs: l.customs }, id.clave);
    }
  }
  const identificables = cob.lineas - cob.generico;
  const listaInsumos: InsumoConsumo[] = [...insumos.values()]
    .map(({ productos: ps, detalle, ...r }) => ({
      ...r,
      cantidad: redondear(r.cantidad),
      rappi: redondear(r.rappi),
      productos: ps.size,
      detalle: [...detalle.values()]
        .map((d) => ({ ...d, cantidad: redondear(d.cantidad), rappi: redondear(d.rappi) }))
        .sort((a, b) => b.cantidad - a.cantidad || a.receta.localeCompare(b.receta, 'es-MX')),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es-MX') || b.cantidad - a.cantidad);
  const categorias = new Map<
    string,
    { insumos: number; totales: Map<string, { cantidad: number; rappi: number }> }
  >();
  for (const i of listaInsumos) {
    const c = categorias.get(i.categoria) ?? { insumos: 0, totales: new Map() };
    c.insumos++;
    const t = c.totales.get(i.unidad) ?? { cantidad: 0, rappi: 0 };
    t.cantidad += i.cantidad;
    t.rappi += i.rappi;
    c.totales.set(i.unidad, t);
    categorias.set(i.categoria, c);
  }
  return {
    cobertura: {
      ...cob,
      identificables,
      excluidas,
      sobreTotal: cob.lineas > 0 ? cob.incluidas / cob.lineas : null,
      sobreIdentificable: identificables > 0 ? cob.incluidas / identificables : null,
    },
    insumos: listaInsumos,
    sinReceta: [...sinReceta.values()].sort(
      (a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, 'es-MX'),
    ),
    categorias: [...categorias]
      .map(([categoria, c]) => ({
        categoria,
        insumos: c.insumos,
        totales: [...c.totales].map(([unidad, t]) => ({
          unidad,
          cantidad: redondear(t.cantidad),
          rappi: redondear(t.rappi),
        })),
      }))
      .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es-MX')),
    productos: [...productos.values()]
      .map((x) => ({
        ...x,
        tamanos: [...x.tamanos].map(([tamano, lineas]) => ({ tamano, lineas })),
        insumos: [...x.insumos.values()]
          .map((i) => ({ ...i, cantidad: redondear(i.cantidad) }))
          .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es-MX') || b.cantidad - a.cantidad),
      }))
      .sort((a, b) => b.lineas - a.lineas || a.receta.localeCompare(b.receta, 'es-MX')),
    tamanos: [...tamanos].map(([tamano, lineas]) => ({ tamano, lineas })).sort((a, b) => b.lineas - a.lineas),
    diario: [...diario.values()]
      .map((d) => ({
        ...d,
        cantidades: Object.fromEntries(Object.entries(d.cantidades).map(([k, v]) => [k, redondear(v)])),
      }))
      .sort((a, b) => (a.fecha < b.fecha ? -1 : 1)),
  };
}
