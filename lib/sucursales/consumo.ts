import { CODIGO_GENERICO, ES_TAMANO, identificador, type CatalogoNombres } from './metricas';
import type { PedidoNormal } from './normalizar';
import { cambiosPersonalizaciones, tamanoVerificado } from './costeo';

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
  /** Líneas que entran al consumo y las que no (por motivo). */
  lineas: number;
  excluidas: Record<MotivoExcluido, number>;
  tamanos: { tamano: string; lineas: number }[];
  insumos: CantidadInsumo[];
}
export interface CoberturaConsumo {
  /** A: todas las líneas del periodo (unidades vendidas). */
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
export interface ResultadoConsumo {
  cobertura: CoberturaConsumo;
  insumos: (CantidadInsumo & { productos: number })[];
  categorias: { categoria: string; insumos: number; totales: { unidad: string; cantidad: number }[] }[];
  productos: ConsumoProducto[];
  tamanos: { tamano: string; lineas: number }[];
  diario: { fecha: string; lineas: number; incluidas: number; cantidades: Record<string, number> }[];
}

const claveReceta = (recetaId: string, tamano: string) => `${recetaId}:${tamano}`;
export const claveConsumo = claveReceta;
const motivosVacios = (): Record<MotivoExcluido, number> => ({ tamano: 0, personalizacion: 0, receta: 0 });
const redondear = (x: number) => Math.round(x * 1000) / 1000;

/** `ps`: pedidos ya filtrados por origen; `evidencia`: todos los del periodo (ver identificador). */
export function consumir(
  ps: PedidoNormal[],
  datos: DatosConsumo,
  evidencia: PedidoNormal[] = ps,
  catalogo?: CatalogoNombres,
  fechas: string[] = [],
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
  const insumos = new Map<string, CantidadInsumo & { productos: Set<string> }>();
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
    for (const l of p.lineas) {
      cob.lineas++;
      dia.lineas++;
      const id = identidad(l);
      if (id.sinCodigo) {
        cob.sinCodigo++;
        continue;
      }
      if (id.codigo === CODIGO_GENERICO) {
        cob.generico++;
        continue;
      }
      const enlace = datos.enlaces.get(id.codigo);
      if (!enlace) {
        cob.sinEnlace++;
        continue;
      }
      cob.conReceta++;
      let x = productos.get(id.clave);
      if (!x) {
        x = {
          clave: id.clave,
          ...enlace,
          lineas: 0,
          excluidas: motivosVacios(),
          tamanos: new Map(),
          insumos: new Map(),
        };
        productos.set(id.clave, x);
      }
      const tamano = tamanoVerificado(l, enlace.recetaId, datos);
      const base = tamano ? datos.recetas.get(claveReceta(enlace.recetaId, tamano)) : undefined;
      const cambios = tamano
        ? cambiosPersonalizaciones(
            enlace.recetaId,
            l.customs.filter((c) => !ES_TAMANO.test(c.nombre)).map((c) => c.nombre),
            datos.lineas?.get(claveReceta(enlace.recetaId, tamano)),
          )
        : null;
      const receta = base?.length && cambios ? conCambios(base, cambios, datos.sustitutos) : null;
      const motivo: MotivoExcluido | null = !tamano
        ? 'tamano'
        : !cambios
          ? 'personalizacion'
          : !base?.length
            ? 'receta'
            : !receta
              ? 'personalizacion'
              : null;
      if (motivo) {
        excluidas[motivo]++;
        x.excluidas[motivo]++;
        continue;
      }
      cob.incluidas++;
      if (cambios!.size) cob.ajustadas++;
      dia.incluidas++;
      x.lineas++;
      x.tamanos.set(tamano!, (x.tamanos.get(tamano!) ?? 0) + 1);
      tamanos.set(tamano!, (tamanos.get(tamano!) ?? 0) + 1);
      for (const r of receta!) {
        const t = insumos.get(r.insumoId) ?? { ...r, cantidad: 0, productos: new Set<string>() };
        t.cantidad += r.cantidad;
        t.productos.add(id.clave);
        insumos.set(r.insumoId, t);
        const pi = x.insumos.get(r.insumoId) ?? { ...r, cantidad: 0 };
        pi.cantidad += r.cantidad;
        x.insumos.set(r.insumoId, pi);
        dia.cantidades[r.insumoId] = (dia.cantidades[r.insumoId] ?? 0) + r.cantidad;
      }
    }
  }
  const identificables = cob.lineas - cob.generico;
  const listaInsumos = [...insumos.values()]
    .map(({ productos: ps, ...r }) => ({ ...r, cantidad: redondear(r.cantidad), productos: ps.size }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es-MX') || b.cantidad - a.cantidad);
  const categorias = new Map<string, { insumos: number; totales: Map<string, number> }>();
  for (const i of listaInsumos) {
    const c = categorias.get(i.categoria) ?? { insumos: 0, totales: new Map() };
    c.insumos++;
    c.totales.set(i.unidad, (c.totales.get(i.unidad) ?? 0) + i.cantidad);
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
    categorias: [...categorias]
      .map(([categoria, c]) => ({
        categoria,
        insumos: c.insumos,
        totales: [...c.totales].map(([unidad, cantidad]) => ({ unidad, cantidad: redondear(cantidad) })),
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
