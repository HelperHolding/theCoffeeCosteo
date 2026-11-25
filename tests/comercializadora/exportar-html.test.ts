// tests/comercializadora/exportar-html.test.ts
import { describe, expect, it } from 'vitest';
import { barrasApiladas, celda, crudo, documento, esc, nombreArchivo, seccion, tabla } from '@/lib/comercializadora/exportar/html';

describe('piezas de HTML para exportar', () => {
  it('esc escapa los caracteres de HTML', () => {
    expect(esc(`<b>"A&B"</b> 'x'`)).toBe('&lt;b&gt;&quot;A&amp;B&quot;&lt;/b&gt; &#39;x&#39;');
    expect(esc(null)).toBe('');
  });
  it('celda: texto escapado, número tal cual, crudo sin tocar', () => {
    expect(celda('a<b')).toBe('a&lt;b');
    expect(celda(12)).toBe('12');
    expect(celda(crudo('<i>x</i>'))).toBe('<i>x</i>');
  });
  it('tabla con encabezado, columnas a la derecha y fila de total', () => {
    const h = tabla(['Cliente', 'Saldo'], [['Mop & Co', '$1.00']], { derecha: [1], total: ['Total', '$1.00'] });
    expect(h).toContain('<th>Cliente</th>');
    expect(h).toContain('<td>Mop &amp; Co</td>');
    expect(h).toContain('<td class="der">$1.00</td>');
    expect(h).toContain('<tr class="total">');
  });
  it('documento completo, imprimible, sin scripts ni recursos externos', () => {
    const d = documento({ titulo: 'Reporte <1>', subtitulo: 'Semana', meta: ['Leído hoy'], cuerpo: seccion('01', 'Ventas', '<p>x</p>'), pie: 'Fuente: Zoho' });
    expect(d.startsWith('<!doctype html>')).toBe(true);
    expect(d).toContain('<meta charset="utf-8">');
    expect(d).toContain('@page');
    expect(d).toContain('<title>Reporte &lt;1&gt;</title>');
    expect(d).toContain('<span class="num">01</span>');
    expect(d).not.toMatch(/<script|<link|src="http|href="http/);
  });
  it('barrasApiladas dibuja un SVG con un rect por parte con valor', () => {
    const s = barrasApiladas([
      { etiqueta: '16 nov', total: '$10', partes: [{ nombre: 'Ordinario', valor: 6, color: '#111' }, { nombre: 'Apertura', valor: 4, color: '#2f7a4f' }] },
      { etiqueta: '23 nov', total: '$0', partes: [{ nombre: 'Ordinario', valor: 0, color: '#111' }] },
    ]);
    expect(s.startsWith('<svg')).toBe(true);
    expect((s.match(/<rect /g) ?? []).length).toBe(2);
    expect(s).toContain('16 nov');
  });
  it('nombreArchivo sin acentos ni espacios', () => {
    expect(nombreArchivo(['Reporte ventas', '2026-11-16'], 'pdf')).toBe('reporte-ventas-2026-11-16.pdf');
    expect(nombreArchivo(['compras', 'Café', 'Ávila Camacho'], 'html')).toBe('compras-cafe-avila-camacho.html');
  });
});
