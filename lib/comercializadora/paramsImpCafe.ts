// Parámetros de Importaciones y Café (plan 3e): normalización (port de _impCfgNorm/_cafeCfgNorm), lo que pintan los
// editores. Sin 'server-only' y sin el motor: lo importan los editores, que son client components.
import {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  cafeCfgNorm,
  impCafeEtq,
  impCfgNorm,
  impMesTxt,
} from '../../supabase/functions/_shared/impCafeCfg.ts';

export {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  cafeCfgNorm,
  impCafeEtq,
  impCfgNorm,
  impMesTxt,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * _impEdit: lo que se escribió en un campo numérico. Vacío: null si el campo lo acepta (usa el valor general), si no el
 * valor anterior; texto que no es número: el anterior; fuera de rango se acota; los enteros se redondean.
 */
export function numeroParam(
  txt: string,
  r: { min: number; max: number; entero?: boolean; nulo?: boolean },
  previo: number | null,
): number | null {
  const t = String(txt ?? '').trim();
  if (t === '') return r.nulo ? null : previo;
  const n = Number(t.replace(',', '.'));
  if (!isFinite(n)) return previo;
  const v = Math.min(r.max, Math.max(r.min, n));
  return r.entero ? Math.round(v) : v;
}

export interface FilaRed {
  key: string;
  pipeline: number;
  plan: number;
  cierres: number;
  considerada: number;
  fuente: string;
}
/**
 * La tabla de _impParamRed recalculada con el borrador (el bucle de _impRed): el pipeline por mes no depende de la sección
 * imp, así que el servidor lo manda una vez y aquí se combina con el plan de Dirección y el cumplimiento del escenario.
 */
export function redConsiderada(
  pipeline: number[],
  claves: string[],
  imp: X,
  esc: string,
  aperIncluir: boolean,
): FilaRed[] {
  const E = imp.escenarios[esc];
  return claves.map((key, m) => {
    const plan = imp.red.plan[key] !== undefined ? imp.red.plan[key] : imp.red.plan_def,
      cierres = imp.red.cierres[key] || 0;
    const pr = pipeline[m] * Math.min(1, E.cumpl),
      pn = plan * E.cumpl;
    let considerada: number, fuente: string;
    if (m < imp.red.meses_pipeline || pr >= pn) {
      considerada = Math.round(pr);
      fuente = 'pipeline';
    } else {
      considerada = Math.round(pn);
      fuente = 'plan';
    }
    if (!aperIncluir) {
      considerada = 0;
      fuente = 'sin aperturas';
    }
    return { key, pipeline: pipeline[m], plan, cierres, considerada, fuente };
  });
}

/** Lo que el editor de artículos muestra junto a cada valor: lo que dice la plataforma y el catálogo. */
export interface MetaItemImp {
  vPlat: number | null;
  kPlat: number | null;
  ocN: number;
  ocQ: number;
  cat: { estatus: string; origen: string; lt: number | null; costo: number; multiplo: number } | null;
}
/** Importado del catálogo que no está en el plan, con el renglón que se agregaría (_impAgregar). */
export interface CandidatoImp {
  sku: string;
  nombre: string;
  estatus: string;
  proveedor: string;
  inventario: number;
  item: X;
}
/** Datos de la plataforma para el editor de Importaciones, calculados en el servidor con lo guardado. */
export interface ContextoParamsImp {
  claves: string[];
  pipeline: number[];
  pl: { total: number; vencidas: number; sinFecha: number; despues: number };
  sucHoyAuto: number;
  aperIncluir: boolean;
  entregaMax: number;
  meta: Record<string, MetaItemImp>;
  candidatos: CandidatoImp[];
}

/** _impUsarPlat / _impUsarPlatTodos: copia la venta o el kit de la plataforma (4 decimales) a uno o a todos. */
export function usarPlataforma(
  imp: X,
  meta: Record<string, MetaItemImp>,
  campo: 'venta' | 'kit',
  sku?: string,
) {
  const items = { ...imp.items };
  let n = 0;
  for (const k of sku ? [sku] : imp.orden) {
    const mt = meta[k],
      v = mt ? (campo === 'venta' ? mt.vPlat : mt.kPlat) : null;
    if (v === null || v === undefined || !items[k]) continue;
    items[k] = { ...items[k], [campo]: Math.round(v * 10000) / 10000 };
    n++;
  }
  return { imp: { ...imp, items }, n };
}

/** Arranque del año de café que sale de la plataforma (para _cafeParamEsc y _cafeParamAper), con lo guardado. */
export interface ContextoParamsCafe {
  anio: number;
  ini: number;
  a0: number;
  pipeAnio: number[];
}
