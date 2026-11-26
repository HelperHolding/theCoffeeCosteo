// lib/comercializadora/compras/filtros.ts
import { type Cat, ETIQUETA_CAT, type FiltrosCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';

export type ParamsCompras = Record<string, string | string[] | undefined>;
const RUTA = '/comercializadora/compras';
const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v)?.trim() || null;

export function filtrosDeUrl(sp: ParamsCompras): FiltrosCompras {
  const cat = uno(sp.categoria);
  return {
    periodo: uno(sp.periodo) ?? '',
    categoria: cat && cat in ETIQUETA_CAT ? (cat as Cat) : null,
    proveedor: uno(sp.proveedor),
    comprador: uno(sp.comprador),
  };
}

export function hrefCompras(f: FiltrosCompras, cambio: Partial<FiltrosCompras> = {}): string {
  const x = { ...f, ...cambio };
  const q = new URLSearchParams();
  if (x.periodo) q.set('periodo', x.periodo);
  if (x.categoria) q.set('categoria', x.categoria);
  if (x.proveedor) q.set('proveedor', x.proveedor);
  if (x.comprador) q.set('comprador', x.comprador);
  const s = q.toString();
  return s ? `${RUTA}?${s}` : RUTA;
}

export function textoFiltros(f: FiltrosCompras, etiquetaPeriodo: string): string {
  return [
    etiquetaPeriodo,
    f.categoria ? ETIQUETA_CAT[f.categoria] : 'Todas las categorías',
    f.proveedor ? `Proveedor: ${f.proveedor}` : null,
    f.comprador ? `Comprador: ${f.comprador}` : null,
  ].filter(Boolean).join(' · ');
}
