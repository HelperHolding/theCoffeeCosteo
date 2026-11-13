import { fechaCorta, masDias } from './fechas';

/** _cieU: último día para pedir = ini − ceil(LT) − 1 (LT inválido cuenta como 0). */
export function ultimoDiaPedir(ini: string, lt: number): string {
  const x = Number(lt);
  return masDias(ini.slice(0, 10), -(Number.isFinite(x) ? Math.max(0, Math.ceil(x)) : 0) - 1);
}

export type EstadoCierre = {
  k: 'cancelado' | 'terminado' | 'encierre' | 'tarde' | 'ultimo' | 'proximo';
  txt: string;
};

/** _cieEstado: u = el último día para pedir más temprano de sus artículos (o null). */
export function estadoCierre(
  c: { ini: string; fin: string; cancelado: boolean },
  hoy: string,
  u: string | null,
): EstadoCierre {
  const ini = c.ini.slice(0, 10);
  const fin = c.fin.slice(0, 10);
  if (c.cancelado) return { k: 'cancelado', txt: 'Cancelado' };
  if (hoy > fin) return { k: 'terminado', txt: 'Terminado' };
  if (hoy >= ini) return { k: 'encierre', txt: `En cierre hasta ${fechaCorta(fin)}` };
  if (u && hoy > u) return { k: 'tarde', txt: 'Ya no alcanza' };
  if (u && u === hoy) return { k: 'ultimo', txt: 'Último día hoy' };
  return { k: 'proximo', txt: u ? `Pide antes del ${fechaCorta(u)}` : 'Sin artículos afectados' };
}

export interface FormCierre {
  id?: number;
  vendor_id: string;
  vendor_name: string;
  ini: string;
  fin: string;
  motivo: string;
  todo: boolean;
  skus: string[];
  notas: string;
}

/** _cieValidar. */
export function validarCierre(
  f: Pick<FormCierre, 'vendor_id' | 'ini' | 'fin' | 'todo' | 'skus' | 'notas'>,
  hoy: string,
  esNuevo: boolean,
): string | null {
  if (!f.vendor_id) return 'Elige un proveedor';
  if (!f.ini || !f.fin) return 'Pon las fechas';
  if (f.fin < f.ini) return 'La fecha final no puede ser antes de la inicial';
  if (esNuevo && f.fin < hoy) return 'Ya terminó: la fecha final es antes de hoy';
  if (!f.todo && !(Array.isArray(f.skus) && f.skus.length))
    return 'Elige al menos un artículo o marca todo el proveedor';
  if (String(f.notas ?? '').length > 500) return 'Las notas son de máximo 500 caracteres';
  return null;
}

/** _cieAfectados: artículos no inactivos del proveedor, o solo los de la lista. */
export function afectados<T extends { sku: string; zoho_vendor_id: string | null; estatus?: string | null }>(
  c: { vendor_id: string; skus: string[] | null },
  catalogo: T[],
): T[] {
  const s = Array.isArray(c.skus) && c.skus.length ? c.skus : null;
  return catalogo.filter(
    (a) =>
      a.estatus !== 'Inactivo' &&
      a.zoho_vendor_id != null &&
      String(a.zoho_vendor_id) === String(c.vendor_id) &&
      (!s || s.includes(a.sku)),
  );
}

/** _cieUPeriodo: el último día del servidor si la proyección es del mismo periodo; si no, el calculado aquí. */
export function uPeriodo(
  c: { ini: string; fin: string },
  s: { u: string | null; ini: string; fin: string } | undefined,
  uLocal: string | null,
): string | null {
  const d10 = (x: string | null | undefined) => String(x ?? '').slice(0, 10);
  if (s?.u && d10(s.ini) === d10(c.ini) && d10(s.fin) === d10(c.fin)) return d10(s.u);
  return uLocal;
}

export const MOTIVOS: [string, string][] = [
  ['vacaciones', 'Vacaciones'],
  ['inventario', 'Inventario'],
  ['agotado', 'Agotado en fábrica'],
  ['otro', 'Otro'],
];

/** _cieFechasCambiaron: ¿cambió ini o fin (comparando solo la fecha)? */
export function fechasCambiaron(
  antes: { ini: string; fin: string },
  f: { ini: string; fin: string },
): boolean {
  const d10 = (x: string | null | undefined) => String(x ?? '').slice(0, 10);
  return d10(antes.ini) !== d10(f.ini) || d10(antes.fin) !== d10(f.fin);
}

/** _cieAlcanceCambio: ¿cambió el proveedor o el conjunto de artículos? (sin orden ni repetidos; null = lista vacía). */
export function alcanceCambio(
  antes: { vendor_id: string | null; skus: string[] | null },
  f: { vendor_id: string | null; skus: string[] | null },
): boolean {
  const v = (x: { vendor_id: string | null }) => String(x.vendor_id ?? '');
  const s = (x: { skus: string[] | null }) => [...new Set((x.skus ?? []).map(String))].sort().join('\u0001');
  return v(antes) !== v(f) || s(antes) !== s(f);
}
