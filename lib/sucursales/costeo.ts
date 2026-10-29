import { CODIGO_GENERICO, ES_TAMANO, identificador, type CatalogoNombres } from './metricas';
import { importeLinea, type LineaNormal, type PedidoNormal } from './normalizar';
import { ajusteVerificado, personalizacionNeutra } from './personalizaciones-verificadas';
import { TAMANOS_VERIFICADOS } from './tamanos-verificados';

/**
 * Costeo de las ventas de Sucursales con las recetas de Costeo (docs/conciliacion-brasil/27 §2). Puro: no lee la base.
 * - Lo de la API no se toca: nombres, códigos e importes se muestran como llegan; el costeo va aparte.
 * - Cobertura con dos denominadores: A = toda la venta y B = A − GENERIC (identificable).
 * - Una línea es una UNIDAD (la API repite la línea por unidad; sucursales/03). Solo es de costeo COMPLETO si su
 *   código está enlazado, su tamaño está verificado para esa receta y cada personalización es neutra o tiene un
 *   ajuste verificado para esa receta (listas explícitas en personalizaciones-verificadas.ts). El ajuste suma al costo
 *   la diferencia calculada con las líneas directas de la receta y el costo actual de los insumos. Cualquier otra
 *   personalización, o un ajuste sin datos para calcularlo, vuelve PARCIAL la línea.
 * - Margen bruto teórico = importe cobrado ÷ (1 + IVA) − costo, la convención de `v_resumen` (precio con IVA, margen
 *   sobre la venta sin IVA). Antes de comisiones. Provisional hasta confirmar si los costos de insumos llevan IVA (K5).
 * - Solo las líneas de costeo completo entran al costo y al margen agregados; las parciales se informan aparte.
 * - Son costos ACTUALES de Costeo aplicados al periodo consultado, no el margen histórico real.
 */
export interface DatosCosteo {
  /** Fecha y hora de lectura de los costos (ISO). */
  leidoEn: string;
  iva: number;
  /** Código POS → receta enlazada (tabla producto_codigo_pos). */
  enlaces: Map<string, { recetaId: string; receta: string }>;
  /** Costo actual por receta y nombre de tamaño («Chica», «Grande», «Único»), en centavos. */
  costos: Map<string, { costoCent: number; usaInactivo: boolean }>;
  /** Recetas que solo se venden en tamaño Único. */
  unicas: Set<string>;
  /**
   * Líneas DIRECTAS de insumo (sin sub-recetas) por `claveCosto(receta, tamaño)`, con el costo unitario actual (pesos
   * por unidad del insumo). Vienen de la RPC desde la migración 25; ausentes con la lectura anterior bajo RLS.
   * Para ajustar personalizaciones que cambian un insumo (etapa 1b, docs/conciliacion-brasil/33).
   */
  lineas?: Map<string, LineaInsumo[]>;
  /**
   * Costo actual de la lista cerrada de insumos sustitutos (leches, granos, miel), por nombre. Viene de la RPC desde la
   * migración 26: es el costo del insumo nuevo cuando una personalización cambia uno de la receta por otro.
   */
  sustitutos?: Map<string, { costoUnitario: number; activo: boolean }>;
}

export interface LineaInsumo {
  lineaId: string;
  insumoId: string;
  insumo: string;
  unidad: string;
  cantidad: number;
  costoUnitario: number;
  activo: boolean;
}

export type MotivoParcial = 'tamano' | 'personalizacion' | 'costo';
export interface CosteoCompleto {
  lineas: number;
  importeCent: number;
  ventaSinIvaCent: number;
  costoCent: number;
  margenCent: number;
}
export interface CosteoParcial {
  lineas: number;
  importeCent: number;
  /** Líneas por motivo: tamaño sin verificar, personalización sin catálogo, costo no disponible o con insumo inactivo. */
  motivos: Record<MotivoParcial, number>;
}
export interface CosteoProducto {
  recetaId: string;
  receta: string;
  completo: CosteoCompleto;
  parcial: CosteoParcial;
}
export interface CosteoResumen {
  leidoEn: string;
  iva: number;
  cobertura: {
    /** A: toda la venta (Σ líneas + personalizaciones). */
    totalCent: number;
    genericoCent: number;
    /** B: A − GENERIC. */
    identificableCent: number;
    /** Líneas sin defaultCode que no se pudieron unir a un código único (siguen en B). */
    sinCodigoCent: number;
    /** Código sin receta enlazada. */
    sinEnlaceCent: number;
    conRecetaCent: number;
    /** conReceta ÷ A y conReceta ÷ B (null si el denominador es 0). */
    sobreTotal: number | null;
    sobreIdentificable: number | null;
  };
  completo: CosteoCompleto & { margenPct: number | null };
  parcial: CosteoParcial;
}

const vacioCompleto = (): CosteoCompleto => ({
  lineas: 0,
  importeCent: 0,
  ventaSinIvaCent: 0,
  costoCent: 0,
  margenCent: 0,
});
const vacioParcial = (): CosteoParcial => ({
  lineas: 0,
  importeCent: 0,
  motivos: { tamano: 0, personalizacion: 0, costo: 0 },
});
const clave = (recetaId: string, tamano: string) => `${recetaId}:${tamano}`;
export const claveCosto = clave;

/** Tamaño de Costeo de una línea, o null si no está verificado para esa receta. */
export function tamanoVerificado(
  l: Pick<LineaNormal, 'customs'>,
  recetaId: string,
  datos: Pick<DatosCosteo, 'unicas'>,
): string | null {
  const vasos = l.customs.filter((c) => ES_TAMANO.test(c.nombre));
  if (vasos.length === 0) return datos.unicas.has(recetaId) ? 'Único' : null;
  if (vasos.length > 1) return null;
  const vaso = vasos[0].nombre.startsWith('Regular') ? 'Regular' : 'Large';
  return TAMANOS_VERIFICADOS[recetaId]?.[vaso] ?? null;
}

/**
 * Cambio de cantidades (por nombre de insumo de Costeo) que causan las personalizaciones de una línea sobre las líneas
 * DIRECTAS de su receta y tamaño, o null si no se puede calcular. Las neutras no cuentan. Las demás necesitan un
 * ajuste verificado para la receta y las líneas de la receta en ese tamaño. Es la regla común de Costeo (que lo
 * multiplica por el costo) y de Consumo (que lo suma a la receta expandida).
 */
export function cambiosPersonalizaciones(
  recetaId: string,
  nombres: string[],
  lineas: readonly { insumo: string; cantidad: number }[] | undefined,
): Map<string, number> | null {
  const ajustes = [...new Set(nombres)]
    .filter((n) => !personalizacionNeutra(recetaId, n))
    .map((n) => ajusteVerificado(recetaId, n));
  if (!ajustes.length) return new Map();
  if (ajustes.some((a) => !a) || !lineas) return null;
  const antes = new Map<string, number>();
  for (const l of lineas) antes.set(l.insumo, (antes.get(l.insumo) ?? 0) + l.cantidad);
  const despues = new Map(antes);
  for (const a of ajustes) {
    if ('cambia' in a!) {
      const q = despues.get(a.cambia.de);
      if (!q) return null;
      despues.set(a.cambia.de, 0);
      despues.set(a.cambia.a, (despues.get(a.cambia.a) ?? 0) + q);
    } else {
      if (!despues.get(a!.cantidad.insumo)) return null;
      despues.set(a!.cantidad.insumo, a!.cantidad.valor);
    }
  }
  const cambios = new Map<string, number>();
  for (const [insumo, q] of despues) {
    const dq = q - (antes.get(insumo) ?? 0);
    if (dq) cambios.set(insumo, dq);
  }
  return cambios;
}

/**
 * Diferencia de costo (centavos) que causan las personalizaciones de una línea, o por qué no se puede calcular
 * (ver cambiosPersonalizaciones). El costo del insumo nuevo sale de la receta o de los sustitutos. Un insumo
 * inactivo que se agrega → 'costo'.
 */
export function ajustePersonalizaciones(
  recetaId: string,
  tamano: string,
  nombres: string[],
  datos: Pick<DatosCosteo, 'lineas' | 'sustitutos'>,
): { deltaCent: number } | { motivo: MotivoParcial } {
  const lineas = datos.lineas?.get(clave(recetaId, tamano));
  const cambios = cambiosPersonalizaciones(recetaId, nombres, lineas);
  if (!cambios) return { motivo: 'personalizacion' };
  const costo = new Map<string, { costoUnitario: number; activo: boolean }>();
  for (const l of lineas ?? []) costo.set(l.insumo, l);
  let delta = 0;
  for (const [insumo, dq] of cambios) {
    const c = costo.get(insumo) ?? datos.sustitutos?.get(insumo);
    if (!c) return { motivo: 'personalizacion' };
    if (dq > 0 && !c.activo) return { motivo: 'costo' };
    delta += dq * c.costoUnitario;
  }
  return { deltaCent: Math.round(delta * 100) };
}

/**
 * Costo actual de una línea (o de una parte de un combo de Rappi) con su receta: tamaño verificado, costo de Costeo y
 * personalizaciones. Mismo orden de motivos de siempre: tamaño → personalización → costo.
 */
function costoDe(
  l: Pick<LineaNormal, 'customs'>,
  recetaId: string,
  datos: DatosCosteo,
): { motivo: MotivoParcial } | { costoCent: number } {
  const tamano = tamanoVerificado(l, recetaId, datos);
  if (!tamano) return { motivo: 'tamano' };
  const costo = datos.costos.get(clave(recetaId, tamano));
  const ajuste = ajustePersonalizaciones(
    recetaId,
    tamano,
    l.customs.filter((c) => !ES_TAMANO.test(c.nombre)).map((c) => c.nombre),
    datos,
  );
  if ('motivo' in ajuste) return ajuste;
  if (!costo || costo.usaInactivo) return { motivo: 'costo' };
  return { costoCent: costo.costoCent + ajuste.deltaCent };
}

/** `evidencia`: pedidos del periodo sin filtrar por origen, la misma que usa `productos` (ver identificador). */
export function costear(
  ps: PedidoNormal[],
  datos: DatosCosteo,
  evidencia: PedidoNormal[] = ps,
  catalogo?: CatalogoNombres,
) {
  const identidad = identificador(evidencia, catalogo);
  const porClave = new Map<string, CosteoProducto>();
  const cob = { totalCent: 0, genericoCent: 0, sinCodigoCent: 0, sinEnlaceCent: 0, conRecetaCent: 0 };
  const completo = vacioCompleto();
  const parcial = vacioParcial();
  for (const p of ps)
    for (const l of p.lineas) {
      const imp = importeLinea(l);
      cob.totalCent += imp;
      const id = identidad(l);
      if (id.sinCodigo) {
        cob.sinCodigoCent += imp;
        continue;
      }
      if (id.codigo === CODIGO_GENERICO) {
        cob.genericoCent += imp;
        continue;
      }
      // Combo de Rappi armado con partes: necesita receta en TODAS sus partes; su costo es la suma de las partes.
      const partes = l.partes?.map((pt) => ({ pt, enlace: datos.enlaces.get(pt.codigo) }));
      const enlace = partes ? undefined : datos.enlaces.get(id.codigo);
      if (partes ? partes.some((x) => !x.enlace) : !enlace) {
        cob.sinEnlaceCent += imp;
        continue;
      }
      cob.conRecetaCent += imp;
      let x = porClave.get(id.clave);
      if (!x) {
        x = {
          ...(enlace ?? { recetaId: id.codigo, receta: l.nombre }),
          completo: vacioCompleto(),
          parcial: vacioParcial(),
        };
        porClave.set(id.clave, x);
      }
      const costos = partes
        ? partes.map(({ pt, enlace: e }) => costoDe(pt, e!.recetaId, datos))
        : [costoDe(l, enlace!.recetaId, datos)];
      const fallo = costos.find((c) => 'motivo' in c);
      const motivo: MotivoParcial | null = fallo && 'motivo' in fallo ? fallo.motivo : null;
      if (motivo) {
        for (const t of [x.parcial, parcial]) {
          t.lineas++;
          t.importeCent += imp;
          t.motivos[motivo]++;
        }
        continue;
      }
      const ventaSinIvaCent = Math.round(imp / (1 + datos.iva));
      const costoCent = costos.reduce((s, c) => s + ('costoCent' in c ? c.costoCent : 0), 0);
      for (const t of [x.completo, completo]) {
        t.lineas++;
        t.importeCent += imp;
        t.ventaSinIvaCent += ventaSinIvaCent;
        t.costoCent += costoCent;
        t.margenCent += ventaSinIvaCent - costoCent;
      }
    }
  const identificableCent = cob.totalCent - cob.genericoCent;
  const resumen: CosteoResumen = {
    leidoEn: datos.leidoEn,
    iva: datos.iva,
    cobertura: {
      ...cob,
      identificableCent,
      sobreTotal: cob.totalCent > 0 ? cob.conRecetaCent / cob.totalCent : null,
      sobreIdentificable: identificableCent > 0 ? cob.conRecetaCent / identificableCent : null,
    },
    completo: {
      ...completo,
      margenPct: completo.ventaSinIvaCent > 0 ? completo.margenCent / completo.ventaSinIvaCent : null,
    },
    parcial,
  };
  return { resumen, porClave };
}
