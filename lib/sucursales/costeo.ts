import { CODIGO_GENERICO, ES_TAMANO, identificador, type CatalogoNombres } from './metricas';
import { importeLinea, type LineaNormal, type PedidoNormal } from './normalizar';
import { personalizacionNeutra } from './personalizaciones-verificadas';
import { TAMANOS_VERIFICADOS } from './tamanos-verificados';

/**
 * Costeo de las ventas de Sucursales con las recetas de Costeo (docs/conciliacion-brasil/27 §2). Puro: no lee la base.
 * - Lo de la API no se toca: nombres, códigos e importes se muestran como llegan; el costeo va aparte.
 * - Cobertura con dos denominadores: A = toda la venta y B = A − GENERIC (identificable).
 * - Una línea es una UNIDAD (la API repite la línea por unidad; sucursales/03). Solo es de costeo COMPLETO si su
 *   código está enlazado, su tamaño está verificado para esa receta y todas sus personalizaciones son neutras para
 *   esa receta (lista explícita en personalizaciones-verificadas.ts). Cualquier otra la vuelve PARCIAL: Costeo aún
 *   no calcula lo que cambia una personalización.
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
export function tamanoVerificado(l: LineaNormal, recetaId: string, datos: DatosCosteo): string | null {
  const vasos = l.customs.filter((c) => ES_TAMANO.test(c.nombre));
  if (vasos.length === 0) return datos.unicas.has(recetaId) ? 'Único' : null;
  if (vasos.length > 1) return null;
  const vaso = vasos[0].nombre.startsWith('Regular') ? 'Regular' : 'Large';
  return TAMANOS_VERIFICADOS[recetaId]?.[vaso] ?? null;
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
      const enlace = datos.enlaces.get(id.codigo);
      if (!enlace) {
        cob.sinEnlaceCent += imp;
        continue;
      }
      cob.conRecetaCent += imp;
      let x = porClave.get(id.clave);
      if (!x) {
        x = { ...enlace, completo: vacioCompleto(), parcial: vacioParcial() };
        porClave.set(id.clave, x);
      }
      const tamano = tamanoVerificado(l, enlace.recetaId, datos);
      const costo = tamano ? datos.costos.get(clave(enlace.recetaId, tamano)) : undefined;
      const motivo: MotivoParcial | null = !tamano
        ? 'tamano'
        : l.customs.some(
              (c) => !ES_TAMANO.test(c.nombre) && !personalizacionNeutra(enlace.recetaId, c.nombre),
            )
          ? 'personalizacion'
          : !costo || costo.usaInactivo
            ? 'costo'
            : null;
      if (motivo) {
        for (const t of [x.parcial, parcial]) {
          t.lineas++;
          t.importeCent += imp;
          t.motivos[motivo]++;
        }
        continue;
      }
      const ventaSinIvaCent = Math.round(imp / (1 + datos.iva));
      for (const t of [x.completo, completo]) {
        t.lineas++;
        t.importeCent += imp;
        t.ventaSinIvaCent += ventaSinIvaCent;
        t.costoCent += costo!.costoCent;
        t.margenCent += ventaSinIvaCent - costo!.costoCent;
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
