import { fechaCorta } from './fechas';
import type { Tono } from './inicio';
import { KPI_AB_CAMPOS, KPI_AB_DEF } from '../../supabase/functions/_shared/planDatos.ts';
import { planMoneyCorto } from '../../supabase/functions/_shared/planKpi.ts';

export { KPI_AB_CAMPOS, KPI_AB_DEF };

export type DetalleKpi = 'fc' | 'cv' | 'inv' | 'exc' | 'disp' | 'datos';
const DETALLES: DetalleKpi[] = ['fc', 'cv', 'inv', 'exc', 'disp', 'datos'];
export const esDetalle = (x: string | undefined): x is DetalleKpi => DETALLES.includes(x as DetalleKpi);

/** Tono de la tarjeta según _kpiAbEstados: cumple → ok, cerca → bajo, no cumple → pierde, sin datos → neutro. */
export const tonoKpi = (e: boolean | null | undefined): Tono =>
  e === true ? 'ok' : e === false ? 'pierde' : e === null ? 'bajo' : 'neutro';

/** _planMoneyCorto: $1.2 M, $35 k, $820. */
export const dineroCorto = (x: number) => planMoneyCorto(x);
/** _kpiAbPct: +12%, −3%, — */
export const pctTxt = (x: number | null | undefined, dec = 0) =>
  x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(dec)}%`;
/** _kpiAbSemTxt: 27 oct – 2 nov */
export const semanaTxt = (ini: string | null, fin: string | null) =>
  ini && fin ? `${fechaCorta(ini)} – ${fechaCorta(fin)}` : '';

/**
 * Validación de _kpiAbMetasGuardar: cada meta en su rango (las enteras se redondean) y, en los pares, el mínimo menor que
 * el máximo. Acepta coma decimal, como el resto de la configuración del portal.
 */
export function validarMetas(
  txt: Record<string, string>,
): { vals: Record<string, number> } | { error: string } {
  const vals: Record<string, number> = {};
  for (const [clave, etiqueta, , , min, max, entero] of KPI_AB_CAMPOS) {
    const t = String(txt[clave] ?? '')
      .trim()
      .replace(',', '.');
    const v = Number(t);
    if (t === '' || !Number.isFinite(v) || v < min || v > max)
      return { error: `"${etiqueta}" debe ser un número entre ${min} y ${max}.` };
    vals[clave] = entero ? Math.round(v) : v;
  }
  if (vals.cv_min >= vals.cv_max)
    return { error: 'En "Compras vs venta" el mínimo debe ser menor que el máximo.' };
  if (vals.dias_min >= vals.dias_max)
    return { error: 'En "Cobertura de inventario" el mínimo debe ser menor que el máximo.' };
  return { vals };
}

// El cálculo es el port con paridad de supabase/functions/_shared/planKpi.ts; las pantallas lo importan desde aquí.
export {
  kpiAbCalc,
  kpiAbEstados,
  kpiAbMetas,
  kpiAbTraza,
  kpiAbVentanas,
  type CheckDatos,
  type Traza,
} from '../../supabase/functions/_shared/planKpi.ts';
export { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';

/**
 * Decisión 12: "OCs en camino al día con Zoho" con la última corrida buena de zoho-sync (el viejo usaba la conciliación
 * por archivo, que el portal no tiene). Mismos umbrales que la revisión de inventario: ≤ 3 días ok, ≤ 7 aviso, si no mal.
 * Devuelve una copia: K es el resultado en memoria de la caché compartida.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conRevisionOcSync<T extends { datos?: { checks: any[]; ok: number; total: number } }>(
  K: T,
  ultimoSync: string | null,
  ahora: number,
): T {
  const i = K.datos?.checks.findIndex((c) => c.id === 'oc') ?? -1;
  if (!K.datos || i < 0) return K;
  const d = ultimoSync ? Math.round((ahora - new Date(ultimoSync).getTime()) / 864e5) : null;
  const est = d == null || d > 7 ? 'mal' : d > 3 ? 'aviso' : 'ok';
  const checks = K.datos.checks.map((c, j) =>
    j === i
      ? {
          ...c,
          valor: d == null ? 'sin sincronizar' : `sincronizadas hace ${d} día${d === 1 ? '' : 's'}`,
          est,
          detalle:
            'Zoho se sincroniza cada 30 minutos. Lo que está "en camino" reduce lo que hay que pedir: si la sincronización está vieja, el plan pide de menos o de más.',
        }
      : c,
  );
  return { ...K, datos: { ...K.datos, checks, ok: checks.filter((c) => c.est === 'ok').length } };
}
