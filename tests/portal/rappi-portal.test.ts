import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { claseEstado, construirRappiPortal, type RpcRappiPortal } from '@/lib/sucursales/rappi-portal';
import { configDe } from '@/lib/sucursales/config';
import { sucursalInfo } from '@/lib/sucursales/datos';
import { pestanasDe } from '@/components/sucursales/ventas-pos';

const producto = (
  nombre: string,
  precio: number,
  opciones: [string, string, number?][] = [],
  unidades = 1,
) => ({
  nombre,
  unidades,
  precio,
  opciones: opciones.map(([categoria, descripcion, p = 0]) => ({
    categoria,
    descripcion,
    precio: p,
    unidades: 1,
  })),
});
const pedido = (
  id: string,
  tienda: string,
  estado: string,
  bruto: number,
  productos: ReturnType<typeof producto>[],
) => ({
  id,
  tienda,
  creado: '2026-10-27T07:43:02',
  fecha: '2026-10-27',
  estado,
  estado_nombre: /^cancel/.test(estado) ? 'Cancelada' : 'Terminada',
  en_disputa: false,
  estado_disputa: null,
  metodo_pago: 'Tarjeta de Crédito',
  bruto,
  descuento_aliado: null,
  estado_anterior: null,
  revisar: false,
  cambios: 0,
  productos,
});

const rpc: RpcRappiPortal = {
  tiendas: [
    { id: 'MX1', nombre: 'The Coffee Namóra', canal: 'normal' },
    { id: 'MX2', nombre: 'The Coffee Namóra - Turbo', canal: 'turbo' },
  ],
  ultima_corrida: { inicio: '2026-10-29T16:00:00Z', tipo: 'vivo', estado: 'ok', mensaje: null },
  ultima_ok: '2026-10-29T16:00:00Z',
  conteos: [
    { tienda: 'MX1', fecha: '2026-10-27', total_rows: 13, devueltos: 11 },
    { tienda: 'MX2', fecha: '2026-10-27', total_rows: 16, devueltos: 16 },
  ],
  pedidos: [
    pedido('1', 'MX1', 'pending_review', 221, [
      producto('Crea tu The Coffee ', 221, [
        ['Elige tu Bebida ', 'True White', 10],
        ['Leche.', 'Entera'],
      ]),
    ]),
    pedido('2', 'MX2', 'finished', 212, [
      // La tienda Turbo lo escribe «Crea Tu» (visto el 2026-10-29): debe agruparse con el de la normal.
      producto('Crea Tu The Coffee', 212, [
        ['Elige tu Bebida', 'Iced Latte'],
        ['Leche.', 'Deslactosada', 13],
      ]),
    ]),
    pedido('3', 'MX2', 'canceled', 135, [producto('Pumpkin Iced Latte', 135)]),
    pedido('4', 'MX1', 'pending_review', 270, [producto('Pumpkin Iced Latte', 270, [], 2)]),
  ],
};

describe('construirRappiPortal', () => {
  const v = construirRappiPortal(rpc, '2026-10-27', '2026-10-27');

  it('venta = productos de pedidos terminados; cancelados aparte; separa tienda normal y Turbo', () => {
    expect(v.totales).toMatchObject({
      pedidos: 3,
      ventaCent: 70_300,
      cancelados: 1,
      canceladosCent: 13_500,
      unidades: 4,
    });
    expect(v.porCanal.normal).toMatchObject({ pedidos: 2, ventaCent: 49_100 });
    expect(v.porCanal.turbo).toMatchObject({ pedidos: 1, ventaCent: 21_200, cancelados: 1 });
  });

  it('agrupa productos sin espacios sobrantes y cuenta sus opciones por categoría', () => {
    const crea = v.productos.find((p) => p.nombre === 'Crea tu The Coffee');
    expect(crea).toMatchObject({ unidades: 2, ventaCent: 43_300, porCanal: { normal: 1, turbo: 1 } });
    expect(crea?.opciones).toEqual([
      { categoria: 'Elige tu Bebida', descripcion: 'Iced Latte', veces: 1 },
      { categoria: 'Elige tu Bebida', descripcion: 'True White', veces: 1 },
      { categoria: 'Leche', descripcion: 'Deslactosada', veces: 1 },
      { categoria: 'Leche', descripcion: 'Entera', veces: 1 },
    ]);
    // El cancelado no entra a productos.
    expect(v.productos.find((p) => p.nombre === 'Pumpkin Iced Latte')?.unidades).toBe(2);
  });

  it('marca los días en que el listado de Rappi devolvió menos de lo que contó', () => {
    expect(v.faltantes).toEqual([{ fecha: '2026-10-27', canal: 'normal', total: 13, devueltos: 11 }]);
  });

  it('clasifica los estados observados en el portal', () => {
    expect(
      [
        'pending_review',
        'finished',
        'canceled',
        'canceled_with_charge',
        'canceled_by_automation',
        'canceled_partner_order_refused',
        'in_progress',
      ].map(claseEstado),
    ).toEqual(['terminado', 'terminado', 'cancelado', 'cancelado', 'cancelado', 'cancelado', 'otro']);
  });
});

describe('pestaña Rappi', () => {
  it('Namóra la tiene por el portal; una sucursal sin Rappi en la API ni portal no', () => {
    const namora = sucursalInfo(configDe(513)!);
    expect(namora).toMatchObject({ rappi: false, rappiPortal: true });
    expect(pestanasDe(namora).map((p) => p.id)).toContain('rappi');
    expect(pestanasDe(sucursalInfo(configDe(384)!)).map((p) => p.id)).not.toContain('rappi');
    expect(pestanasDe(sucursalInfo(configDe(532)!)).map((p) => p.id)).toContain('rappi');
  });
});
