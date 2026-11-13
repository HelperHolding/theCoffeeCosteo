export type CampoCatalogo = 'lt' | 'apertura' | 'minimo' | 'multiplo' | 'dseg';

/** _planEditarCampo: columna destino, mínimo permitido y qué significa "vacío". */
export const CAMPOS_CATALOGO: Record<
  CampoCatalogo,
  { etiqueta: string; columna: string; min: number; vacio: number | null; entero: boolean }
> = {
  lt: { etiqueta: 'Lead time (días)', columna: 'dias', min: 0, vacio: 0, entero: true },
  apertura: {
    etiqueta: 'Piezas por apertura',
    columna: 'cantidad_por_apertura',
    min: 0,
    vacio: 0,
    entero: false,
  },
  minimo: {
    etiqueta: 'Mínimo de compra (pzas)',
    columna: 'minimo_compra_pzas',
    min: 0,
    vacio: 0,
    entero: false,
  },
  multiplo: { etiqueta: 'Múltiplo de compra', columna: 'multiplo_compra', min: 1, vacio: 1, entero: false },
  dseg: { etiqueta: 'Días de seguridad', columna: 'dias_seguridad', min: 0, vacio: null, entero: false },
};

const num = (txt: string) => {
  const t = String(txt ?? '')
    .trim()
    .replace(',', '.');
  return t === '' ? null : Number(t);
};

export function validarCampo(
  campo: CampoCatalogo,
  txt: string,
): { valor: number | null } | { error: string } {
  const c = CAMPOS_CATALOGO[campo];
  const v = num(txt);
  if (v === null) return { valor: c.vacio };
  if (campo === 'lt') {
    if (!Number.isFinite(v) || v < 0 || v > 365)
      return { error: 'El lead time debe ser un número de 0 a 365 días (vacío o 0 = sin capturar)' };
    return { valor: Math.round(v) };
  }
  if (!Number.isFinite(v) || v < c.min) return { error: `Ingresa un número mayor o igual a ${c.min}` };
  return { valor: c.entero ? Math.round(v) : v };
}

/** _comEditarMinMax: vacío = usar el calculado (null); ambos ≥ 0 y máx ≥ mín cuando los dos van. */
export function validarMinMax(
  minTxt: string,
  maxTxt: string,
): { min: number | null; max: number | null } | { error: string } {
  const min = num(minTxt);
  const max = num(maxTxt);
  if (
    (min !== null && (!Number.isFinite(min) || min < 0)) ||
    (max !== null && (!Number.isFinite(max) || max < 0))
  )
    return { error: 'Valores inválidos: el mínimo y el máximo deben ser números de 0 o más.' };
  if (min !== null && max !== null && max < min)
    return { error: 'Valores inválidos: el máximo debe ser ≥ mínimo.' };
  return { min, max };
}
