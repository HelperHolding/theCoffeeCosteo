const mxn = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
export const pesos = (x: number) => mxn.format(Number(x) || 0);
export const numero = (x: number | null) => (x == null ? '—' : num.format(x));

/** CSV con BOM (Excel en español abre bien los acentos), separador coma y CRLF. */
export function aCsv(filas: Record<string, unknown>[], columnas: [clave: string, titulo: string][]): string {
  const celda = (v: unknown) => {
    const t = v == null ? '' : String(v);
    return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
  };
  const lineas = [columnas.map(([, t]) => celda(t)).join(',')];
  for (const f of filas) lineas.push(columnas.map(([k]) => celda(f[k])).join(','));
  return '﻿' + lineas.join('\r\n') + '\r\n';
}
