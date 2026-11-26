// tests/comercializadora/compras-filtros.test.ts
import { describe, expect, it } from 'vitest';
import { filtrosDeUrl, hrefCompras, hrefDescargaCompras, textoFiltros } from '@/lib/comercializadora/compras/filtros';

describe('filtros del tablero de compras', () => {
  it('lee la URL; categoría desconocida o vacía es Todas', () => {
    expect(filtrosDeUrl({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'Prov A', comprador: 'CC' }))
      .toEqual({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'Prov A', comprador: 'CC' });
    expect(filtrosDeUrl({ categoria: 'XYZ', proveedor: '' })).toEqual({ periodo: '', categoria: null, proveedor: null, comprador: null });
    expect(filtrosDeUrl({ categoria: ['BEB', 'CAF'] }).categoria).toBe('BEB');
  });
  it('arma el enlace solo con los filtros puestos y codifica acentos', () => {
    const f = { periodo: '2026-11-16', categoria: null, proveedor: 'JOSÉ & HIJOS', comprador: null };
    expect(hrefCompras(f)).toBe('/comercializadora/compras?periodo=2026-11-16&proveedor=JOS%C3%89+%26+HIJOS');
    expect(hrefCompras(f, { proveedor: null, categoria: 'DES' })).toBe('/comercializadora/compras?periodo=2026-11-16&categoria=DES');
  });
  it('describe los filtros para el encabezado', () => {
    expect(textoFiltros({ periodo: 'x', categoria: 'CAF', proveedor: 'Prov A', comprador: null }, '16 – 22 nov 2026'))
      .toBe('16 – 22 nov 2026 · Café · Proveedor: Prov A');
    expect(textoFiltros({ periodo: 'x', categoria: null, proveedor: null, comprador: 'CC' }, 'Noviembre 2026'))
      .toBe('Noviembre 2026 · Todas las categorías · Comprador: CC');
  });
  it('enlace de descarga con los mismos filtros, codificados', () => {
    expect(hrefDescargaCompras({ periodo: '2026-11-16', categoria: 'CAF', proveedor: 'JOSÉ & HIJOS', comprador: null }))
      .toBe('/comercializadora/compras/descargar?periodo=2026-11-16&categoria=CAF&proveedor=JOS%C3%89+%26+HIJOS');
    expect(hrefDescargaCompras({ periodo: '', categoria: null, proveedor: null, comprador: null })).toBe('/comercializadora/compras/descargar');
  });
});
