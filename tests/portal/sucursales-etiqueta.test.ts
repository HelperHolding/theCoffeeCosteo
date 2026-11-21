import { describe, expect, it } from 'vitest';
import { datosEtiquetas, htmlEtiquetas } from '@/lib/sucursales/etiqueta';
import type { PedidoVista } from '@/lib/sucursales/contratos';

const c = (nombre: string) => ({ codigo: 'X', nombre, importeCent: 0, descuentoPct: 0 });
const pedido: PedidoVista = {
  id: 2490326996,
  fecha: '2026-11-20',
  hora: '17:15:36',
  ventaCent: 24600,
  descuentoCent: 0,
  origen: 'rappi',
  pago: 'Rappi',
  metodo: 'RAPPI',
  numeroPedidoRappi: '2490326996',
  lineas: [
    {
      codigo: 'CHAI',
      nombre: 'Chai Iced Latte',
      importeCent: 9200,
      descuentoPct: 0,
      customs: [c('Regular - 440ml'), c('Café: Con Café'), c('Lactose free'), c('Without Honey')],
    },
    {
      codigo: 'CR',
      nombre: 'Croissant <relleno> & "jamón"',
      importeCent: 4380,
      descuentoPct: 40,
      customs: [],
    },
  ],
};

describe('etiqueta de pedido', () => {
  it('una etiqueta por producto, con tamaño aparte, opciones y para quién es; sin precios', () => {
    const e = datosEtiquetas(pedido, 'Essentia');
    expect(e).toHaveLength(2);
    expect(e[0]).toEqual({
      producto: 'Chai Iced Latte',
      tamano: 'Regular - 440ml',
      opciones: ['Café: Con Café', 'Lactose free', 'Without Honey'],
      para: 'Rappi #2490326996',
      cuando: '17:15 · 20 nov',
      numero: 1,
      total: 2,
      sucursal: 'Essentia',
    });
    expect(JSON.stringify(e)).not.toMatch(/92|9200|\$/);
  });

  it('solo los productos pedidos; mostrador lleva el número del POS', () => {
    const e = datosEtiquetas({ ...pedido, origen: 'mostrador', numeroPedidoRappi: null }, 'Essentia', [1]);
    expect(e.map((x) => [x.producto, x.numero, x.total, x.para])).toEqual([
      ['Croissant <relleno> & "jamón"', 2, 2, 'Mostrador · #2490326996'],
    ]);
  });

  it('el HTML escapa el texto y define el tamaño de la etiqueta', () => {
    const html = htmlEtiquetas(datosEtiquetas(pedido, 'Essentia'));
    expect(html).toContain('@page { size: 58mm 80mm');
    expect(html).toContain('Croissant &lt;relleno&gt; &amp; &quot;jamón&quot;');
    expect(html).not.toContain('<relleno>');
    expect(html.match(/class="et"/g)).toHaveLength(2);
    expect(html).toContain('the coffee.');
  });
});
