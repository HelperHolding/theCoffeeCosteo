import { describe, expect, it } from 'vitest';
import { agruparOcs, estadoOc, resumenOcs, validarOc } from '../../lib/comercializadora/ordenes';

const mov = (o: Record<string, unknown>) => ({
  id: 'x',
  folio: 'OC-1',
  fecha: '2026-11-01',
  sku: 'A',
  cantidad: 10,
  cantidad_recibida: 0,
  monto: null,
  destino: 'CEDIS',
  fecha_arribo: '2026-11-20',
  proveedor: 'Prov',
  estado: 'emitida',
  ...o,
});

describe('órdenes (_ocEstadoCalculado, agrupar, _ocResumenHtml)', () => {
  it('estado por lo recibido del folio completo', () => {
    expect(estadoOc([{ cantidad: 10, cantidad_recibida: 0 }])).toBe('emitida');
    expect(
      estadoOc([
        { cantidad: 10, cantidad_recibida: 4 },
        { cantidad: 5, cantidad_recibida: 0 },
      ]),
    ).toBe('parcial');
    expect(
      estadoOc([
        { cantidad: 10, cantidad_recibida: 10 },
        { cantidad: 5, cantidad_recibida: 6 },
      ]),
    ).toBe('recibida');
  });
  it('agrupa por folio con SKUs, unidades y monto (solo el de las filas que lo traen)', () => {
    const [g] = agruparOcs([mov({ id: '1', monto: 500 }), mov({ id: '2', sku: 'B', cantidad: 3 })] as never);
    expect(g).toMatchObject({ folio: 'OC-1', skus: 2, uds: 13, monto: 500, estado: 'emitida' });
  });
  it('KPIs: abiertas con monto, y atrasadas si la fecha de arribo ya pasó', () => {
    const r = resumenOcs(
      [
        mov({ id: '1', monto: 500 }),
        mov({ id: '2', folio: 'OC-2', monto: 200, fecha_arribo: '2026-11-30' }),
        mov({ id: '3', folio: 'OC-3', monto: 90, cantidad_recibida: 10 }),
      ] as never,
      '2026-11-25',
    );
    expect(r).toEqual({ abiertas: 2, montoAbiertas: 700, atrasadas: 1, montoAtrasadas: 500 });
  });
  it('validación de una OC nueva', () => {
    const f = {
      folio: 'OC-9',
      proveedor: 'Prov',
      fecha: '2026-11-13',
      fecha_arribo: '2026-11-20',
      destino: 'CEDIS',
      monto: 100,
      lineas: [{ sku: 'A', cantidad: 5 }],
    };
    expect(validarOc(f)).toBeNull();
    expect(validarOc({ ...f, folio: ' ' })).toBe('Pon el folio de la OC');
    expect(validarOc({ ...f, lineas: [] })).toBe('Agrega al menos un artículo con cantidad');
    expect(validarOc({ ...f, monto: 0 })).toBe('Pon el monto total de la OC');
  });
});
