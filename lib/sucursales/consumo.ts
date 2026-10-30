import { CODIGO_GENERICO, ES_TAMANO, identificador, type CatalogoNombres } from './metricas';
import type { LineaNormal, PedidoNormal } from './normalizar';
import { cambiosPersonalizaciones, tamanoVerificado } from './costeo';
import { partesCombo } from './combos';
import { ajusteVerificado, personalizacionNeutra } from './personalizaciones-verificadas';

/**
 * Consumo TEÓRICO según receta de las ventas de Sucursales (docs/sucursales/13). Puro: no lee la base.
 * - No es inventario ni merma: es lo que las recetas de Costeo dicen que lleva cada unidad vendida.
 * - Solo cantidades, nunca dinero. Cobertura en LÍNEAS (unidades): A = todas y B = A − GENERIC.
 * - Mismo criterio que el costeo completo: una línea entra al consumo si su código está enlazado, su tamaño está
 *   verificado para esa receta y cada personalización es neutra o tiene un ajuste verificado (personalizaciones-
 *   verificadas.ts). El ajuste mueve las MISMAS cantidades que Costeo sobre las líneas directas de la receta
 *   (cambiosPersonalizaciones), p. ej. «Lactose free» descuenta deslactosada en lugar de entera. Además, la receta
 *   debe tener cantidades para ese tamaño. Diferencia con Costeo: un insumo inactivo no saca la línea (no hay costo).
 *   Piloto de Namóra: una personalización que aún no se calcula no saca la línea (ver recetaDe).
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
  /** Por qué quedaron fuera esas unidades (mismo texto que el cuadre de cada insumo). */
  razones: { motivo: MotivoExcluido; razon: string; unidades: number }[];
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
  /** De las incluidas, cuántas con una opción con costo extra que aún no se calcula (piloto; p. ej. mayonesa, avena). */
  sinContar: number;
  /** incluidas ÷ A e incluidas ÷ B (null si el denominador es 0). */
  sobreTotal: number | null;
  sobreIdentificable: number | null;
}
/**
 * Un insumo del periodo, cuadrado: cuánto se consume (y cuánto de Rappi; el resto es del POS), qué productos lo
 * consumen y qué unidades vendidas que lo llevan quedaron fuera y por qué. Vendidas = Σ detalle.unidades + Σ fuera.unidades.
 */
export interface InsumoConsumo extends CantidadInsumo {
  productos: number;
  rappi: number;
  /** Unidades que entran y llevan este insumo. */
  unidades: number;
  /**
   * Por producto (y combo en el que se vendió, si aplica). `sinContar`: unidades que entraron con una opción con costo
   * extra que aún no se calcula (p. ej. mayonesa de chipotle): se contó su receta sin esa opción.
   */
  detalle: {
    receta: string;
    combo?: string;
    unidades: number;
    cantidad: number;
    rappi: number;
    sinContar: { nombre: string; unidades: number }[];
  }[];
  /** Unidades vendidas cuya receta lleva este insumo pero quedaron fuera, con el motivo explicado. */
  fuera: {
    receta: string;
    combo?: string;
    unidades: number;
    rappi: number;
    motivo: MotivoExcluido;
    razon: string;
  }[];
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
 * Insumos de una línea (o de una parte de un combo) según su receta, tamaño verificado y personalizaciones, o por qué
 * queda fuera (con la razón explicada). Mismo orden de motivos de siempre: tamaño → personalización → receta.
 *
 * Piloto de Namóra (Carlo, 2026-10-30: «que no se eliminen; esos detalles los vemos más adelante con las recetas ya
 * bien establecidas por Brasil»): una personalización que aún no se calcula NO saca la unidad. Entra con su receta y
 * con los ajustes que sí están verificados; de las que no se calculan, solo las que traen costo extra quedan anotadas
 * (`sinContar`) para verlas en el detalle. Fuera del piloto, la regla estricta de siempre (la misma de Costeo).
 */
function recetaDe(
  l: Pick<LineaNormal, 'customs'>,
  recetaId: string,
  datos: DatosConsumo,
  piloto: boolean,
):
  | { motivo: MotivoExcluido; razon: string }
  | { tamano: string; receta: InsumoReceta[]; ajustada: boolean; sinContar: string[] } {
  const tamano = tamanoVerificado(l, recetaId, datos);
  if (!tamano) {
    const vasos = l.customs.filter((c) => ES_TAMANO.test(c.nombre)).map((c) => c.nombre);
    return {
      motivo: 'tamano',
      razon: vasos.length
        ? `el vaso ${vasos.join(' y ')} aún no está verificado para esta receta`
        : 'el ticket no trae vaso y la receta tiene más de un tamaño',
    };
  }
  const base = datos.recetas.get(claveReceta(recetaId, tamano));
  const sinCantidades = { motivo: 'receta' as const, razon: `la receta no tiene cantidades para ${tamano}` };
  const directas = datos.lineas?.get(claveReceta(recetaId, tamano));
  const personalizaciones = l.customs.filter((c) => !ES_TAMANO.test(c.nombre));
  const nombres = [...new Set(personalizaciones.map((c) => c.nombre))];
  const calculable = (n: string) => personalizacionNeutra(recetaId, n) || !!ajusteVerificado(recetaId, n);
  if (!piloto) {
    const cambios = cambiosPersonalizaciones(recetaId, nombres, directas);
    const pendientes = () => nombres.filter((n) => !calculable(n));
    const porPersonalizacion = () => ({
      motivo: 'personalizacion' as const,
      razon: pendientes().length
        ? `lleva ${pendientes()
            .map((n) => `«${n}»`)
            .join(' y ')}, que aún no se calcula`
        : 'faltan datos de la receta para calcular sus personalizaciones',
    });
    if (!cambios) return porPersonalizacion();
    if (!base?.length) return sinCantidades;
    const receta = conCambios(base, cambios, datos.sustitutos);
    if (!receta) return porPersonalizacion();
    return { tamano, receta, ajustada: cambios.size > 0, sinContar: [] };
  }
  if (!base?.length) return sinCantidades;
  // Piloto: se aplican los ajustes verificados; si aun así no se pueden aplicar, se cuenta la receta tal cual.
  const cambios = cambiosPersonalizaciones(recetaId, nombres.filter(calculable), directas);
  const conAjustes = cambios && conCambios(base, cambios, datos.sustitutos);
  const aplicados = conAjustes
    ? nombres.filter(calculable)
    : nombres.filter((n) => personalizacionNeutra(recetaId, n));
  const sinContar = [
    ...new Set(
      personalizaciones
        .filter((c) => !aplicados.includes(c.nombre) && c.importeCent > 0)
        .map((c) => c.nombre),
    ),
  ];
  return { tamano, receta: conAjustes ?? base, ajustada: !!conAjustes && cambios!.size > 0, sinContar };
}

/** `ps`: pedidos ya filtrados por origen; `evidencia`: todos los del periodo (ver identificador). */
export function consumir(
  ps: PedidoNormal[],
  datos: DatosConsumo,
  evidencia: PedidoNormal[] = ps,
  catalogo?: CatalogoNombres,
  fechas: string[] = [],
  /**
   * Piloto de Namóra (rappiPortal): los combos del POS cuentan por sus productos (COMBOS_POS) y una personalización
   * que aún no se calcula no saca la unidad (ver recetaDe). Luego se replica a las demás sucursales.
   */
  piloto = false,
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
    sinContar: 0,
  };
  const excluidas = motivosVacios();
  type Fila = InsumoConsumo['detalle'][number] & { extras: Map<string, number> };
  type Fuera = InsumoConsumo['fuera'][number];
  const insumos = new Map<
    string,
    CantidadInsumo & {
      rappi: number;
      unidades: number;
      productos: Set<string>;
      detalle: Map<string, Fila>;
      fuera: Map<string, Fuera>;
    }
  >();
  // Insumos que lleva cada receta en cualquiera de sus tamaños: para cuadrar las unidades que quedan fuera.
  const deReceta = new Map<string, Map<string, InsumoReceta>>();
  for (const [k, receta] of datos.recetas) {
    const recetaId = k.slice(0, k.lastIndexOf(':'));
    const m = deReceta.get(recetaId) ?? new Map<string, InsumoReceta>();
    for (const i of receta) if (!m.has(i.insumoId)) m.set(i.insumoId, i);
    deReceta.set(recetaId, m);
  }
  const insumo = (i: InsumoReceta) => {
    const t = insumos.get(i.insumoId) ?? {
      ...i,
      cantidad: 0,
      rappi: 0,
      unidades: 0,
      productos: new Set<string>(),
      detalle: new Map<string, Fila>(),
      fuera: new Map<string, Fuera>(),
    };
    insumos.set(i.insumoId, t);
    return t;
  };
  const sinReceta = new Map<string, SinReceta>();
  const anotarSinReceta = (clave: string, nombre: string, deRappi: boolean, sinCodigo: boolean) => {
    const s = sinReceta.get(clave) ?? { nombre, unidades: 0, rappi: 0, sinCodigo };
    s.unidades++;
    if (deRappi) s.rappi++;
    sinReceta.set(clave, s);
  };
  const productos = new Map<
    string,
    Omit<ConsumoProducto, 'tamanos' | 'insumos' | 'razones'> & {
      razones: Map<string, ConsumoProducto['razones'][number]>;
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
          razones: new Map(),
          tamanos: new Map(),
          insumos: new Map(),
        };
        productos.set(clave, x);
      }
      const r = recetaDe(u, enlace.recetaId, datos, piloto);
      // En el cuadre de cada insumo, una fila por receta y combo (dos códigos de la misma receta no se repiten).
      const fila = `${enlace.recetaId}|${combo ?? ''}`;
      if ('motivo' in r) {
        excluidas[r.motivo]++;
        x.excluidas[r.motivo]++;
        const kr = `${r.motivo}|${r.razon}`;
        const rz = x.razones.get(kr) ?? { motivo: r.motivo, razon: r.razon, unidades: 0 };
        rz.unidades++;
        x.razones.set(kr, rz);
        // Cuadre: la unidad queda anotada, con su razón, en cada insumo que lleva su receta.
        for (const i of deReceta.get(enlace.recetaId)?.values() ?? []) {
          const f = insumo(i).fuera;
          const k = `${fila}|${r.motivo}|${r.razon}`;
          const e = f.get(k) ?? {
            receta: x.receta,
            ...(combo ? { combo } : {}),
            unidades: 0,
            rappi: 0,
            motivo: r.motivo,
            razon: r.razon,
          };
          e.unidades++;
          if (deRappi) e.rappi++;
          f.set(k, e);
        }
        return;
      }
      cob.incluidas++;
      if (r.ajustada) cob.ajustadas++;
      if (r.sinContar.length) cob.sinContar++;
      dia.incluidas++;
      x.lineas++;
      x.tamanos.set(r.tamano, (x.tamanos.get(r.tamano) ?? 0) + 1);
      tamanos.set(r.tamano, (tamanos.get(r.tamano) ?? 0) + 1);
      const vistos = new Set<string>();
      for (const i of r.receta) {
        const t = insumo(i);
        t.cantidad += i.cantidad;
        if (deRappi) t.rappi += i.cantidad;
        t.productos.add(clave);
        const d = t.detalle.get(fila) ?? {
          receta: x.receta,
          ...(combo ? { combo } : {}),
          unidades: 0,
          cantidad: 0,
          rappi: 0,
          sinContar: [],
          extras: new Map<string, number>(),
        };
        // Una unidad cuenta una vez por insumo, aunque la receta lo lleve en varias líneas.
        if (!vistos.has(i.insumoId)) {
          vistos.add(i.insumoId);
          t.unidades++;
          d.unidades++;
          for (const n of r.sinContar) d.extras.set(n, (d.extras.get(n) ?? 0) + 1);
        }
        d.cantidad += i.cantidad;
        if (deRappi) d.rappi += i.cantidad;
        t.detalle.set(fila, d);
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
      const partes = l.partes ?? (piloto ? partesCombo(id.codigo, l) : undefined);
      if (partes) for (const pt of partes) contar(pt, `${id.clave}>${pt.codigo}`, l.nombre);
      else contar({ codigo: id.codigo, nombre: l.nombre, customs: l.customs }, id.clave);
    }
  }
  const identificables = cob.lineas - cob.generico;
  const listaInsumos: InsumoConsumo[] = [...insumos.values()]
    .map(({ productos: ps, detalle, fuera, ...r }) => ({
      ...r,
      cantidad: redondear(r.cantidad),
      rappi: redondear(r.rappi),
      productos: ps.size,
      detalle: [...detalle.values()]
        .map(({ extras, ...d }) => ({
          ...d,
          cantidad: redondear(d.cantidad),
          rappi: redondear(d.rappi),
          sinContar: [...extras]
            .map(([nombre, unidades]) => ({ nombre, unidades }))
            .sort((a, b) => b.unidades - a.unidades || a.nombre.localeCompare(b.nombre, 'es-MX')),
        }))
        .sort((a, b) => b.cantidad - a.cantidad || a.receta.localeCompare(b.receta, 'es-MX')),
      fuera: [...fuera.values()].sort(
        (a, b) => b.unidades - a.unidades || a.receta.localeCompare(b.receta, 'es-MX'),
      ),
    }))
    .sort((a, b) => a.categoria.localeCompare(b.categoria, 'es-MX') || b.cantidad - a.cantidad);
  const categorias = new Map<
    string,
    { insumos: number; totales: Map<string, { cantidad: number; rappi: number }> }
  >();
  // Las categorías suman lo que se consume: un insumo que solo aparece por unidades fuera no cuenta aquí.
  for (const i of listaInsumos.filter((x) => x.unidades > 0)) {
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
        razones: [...x.razones.values()].sort((a, b) => b.unidades - a.unidades),
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
