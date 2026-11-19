import { describe, expect, it } from 'vitest';
import { asuntoOvs, correoOvs, type TiendaCorreo } from '../../lib/comercializadora/ovCorreo';
import { pesos } from '../../lib/comercializadora/formato';
import type { LineaOv } from '../../lib/comercializadora/ovSugerida';

const linea = (o: Partial<LineaOv> = {}): LineaOv => ({
  sku: 'INS-CAF-003',
  nombre: 'Cafe en Grano White 1.5 Kg',
  origen: 'receta',
  k: 1.2,
  diario: 1.2,
  necesidad: 16.8,
  ya_pedido: 0,
  arrastre: 0.1,
  sugerido: 13,
  monto: 5460,
  ...o,
});
const tienda = (o: Partial<TiendaCorreo> = {}): TiendaCorreo => ({
  nombre: 'La Mexicana',
  estado: 'ok',
  error: null,
  cadencia: 14,
  cadenciaPorDefecto: false,
  ultimoPedido: '2026-11-09',
  cobertura: 0.91,
  lineas: [linea()],
  medicion: null,
  inactivos: [],
  sinMapeo: [],
  avisos: [],
  ...o,
});
const SEMANA = '2026-11-16';

describe('correo de la OV sugerida', () => {
  it('asunto con el lunes de la semana', () => {
    expect(asuntoOvs(SEMANA)).toBe('Orden de venta sugerida (piloto) — semana del 16 nov 2026');
    expect(correoOvs(SEMANA, [tienda()]).asunto).toBe(asuntoOvs(SEMANA));
  });

  it('encabezado y tabla por tienda: solo lo sugerido, por monto, con total y sin costo aparte', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({
        lineas: [
          linea({ sku: 'INS-DES-021', nombre: 'Vaso 12 oz', k: 1, sugerido: 2, monto: 1136.38 }),
          linea(),
          linea({ sku: 'INS-DES-002', nombre: 'Vaso Espresso', sugerido: 0, monto: 0 }),
          linea({
            sku: 'MP-OPE-022',
            nombre: 'Acrilico',
            origen: 'historial',
            k: null,
            sugerido: 2,
            monto: null,
          }),
        ],
      }),
    ]);
    expect(html).toContain('La Mexicana');
    expect(html).toContain('Cadencia: 14 días');
    expect(html).toContain('Último pedido: 9 nov 2026');
    expect(html).toContain('Cobertura de recetas de sus ventas: 91 %');
    expect(html).not.toContain('INS-DES-002');
    expect(html.indexOf('INS-CAF-003')).toBeLessThan(html.indexOf('INS-DES-021'));
    expect(html).toContain('1.20');
    expect(html).toContain('historial');
    expect(html).toContain('sin costo');
    expect(html).toContain(pesos(5460 + 1136.38));
    expect(html).toContain('1 sin costo en el catálogo (no suman al total).');
  });

  it('medición contra la semana anterior, o el aviso de primera semana', () => {
    const con = correoOvs(SEMANA, [
      tienda({
        medicion: {
          desde: '2026-11-09',
          filas: [{ sku: 'INS-CAF-003', nombre: 'Cafe', sugerido: 13, pedido: 12, diferencia: -1 }],
          montoSugerido: 5460,
          montoPedido: 5040,
        },
      }),
    ]).html;
    expect(con).toContain(
      `La semana pasada (9 nov 2026) sugerimos ${pesos(5460)}; desde entonces pidió ${pesos(5040)}.`,
    );
    expect(con).toMatch(/>-1</);
    expect(correoOvs(SEMANA, [tienda()]).html).toContain('Primera semana del piloto para esta tienda');
  });

  it('avisos: inactivos, insumos sin SKU, cadencia por omisión, lectura incompleta y tienda que falló', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({
        cadenciaPorDefecto: true,
        inactivos: [{ sku: 'INS-BEB-032', nombre: 'Pulpa de Maracuya 500ml' }],
        sinMapeo: ['LECHE ENTERA'],
        avisos: [
          'Lectura del POS incompleta (el consumo puede quedar bajo): 2 de 28 días con lectura incompleta.',
        ],
      }),
      tienda({
        nombre: 'Avándaro',
        estado: 'error',
        error: 'POS: El proveedor no respondió.',
        cadencia: null,
        lineas: [],
      }),
    ]);
    expect(html).toContain(
      'Inactivos en el catálogo que la receta pide: INS-BEB-032 (Pulpa de Maracuya 500ml)',
    );
    expect(html).toContain('Insumos de receta sin SKU (no entran): LECHE ENTERA');
    expect(html).toContain('cadencia por omisión de 14 días');
    expect(html).toContain('Lectura del POS incompleta');
    expect(html).toContain('Avándaro');
    expect(html).toContain('No se calculó esta semana: POS: El proveedor no respondió.');
  });

  it('escapa el HTML de nombres y motivos', () => {
    const { html } = correoOvs(SEMANA, [
      tienda({ nombre: '<script>alert(1)</script> & Co', lineas: [linea({ nombre: 'Vaso "12" <b>' })] }),
      tienda({ nombre: 'Otra', estado: 'error', error: '<img src=x onerror=alert(1)>', lineas: [] }),
    ]);
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).not.toContain('<b>');
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt; &amp; Co');
    expect(html).toContain('Vaso &quot;12&quot; &lt;b&gt;');
  });
});
