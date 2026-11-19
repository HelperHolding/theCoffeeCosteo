import { expect, it } from 'vitest';
import { z } from 'zod';
import { aPesos, consulta, diasEntre, ErrorConsulta, fecha } from '../../lib/mcp/consulta';

it('aPesos convierte toda clave _cent a pesos, en objetos y arreglos anidados', () => {
  expect(
    aPesos({ venta_cent: 12345, pedidos: 3, x: [{ importe_cent: 99 }], hoy: { mostrador: { descuento_cent: 0 } } }),
  ).toEqual({ venta: 123.45, pedidos: 3, x: [{ importe: 0.99 }], hoy: { mostrador: { descuento: 0 } } });
  expect(aPesos(null)).toBeNull();
  expect(aPesos({ venta_cent: null })).toEqual({ venta_cent: null });
});

it('fecha acepta solo AAAA-MM-DD existentes', () => {
  expect(fecha.parse('2026-11-19')).toBe('2026-11-19');
  for (const f of ['2026-02-30', '19/11/2026', '2026-13-01', ''])
    expect(() => fecha.parse(f)).toThrow(/Fecha/);
});

it('diasEntre cuenta días calendario', () => {
  expect(diasEntre('2026-11-01', '2026-11-01')).toBe(0);
  expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
});

it('consulta valida la entrada y convierte errores de zod en ErrorConsulta legible', async () => {
  const c = consulta('x', 'y', z.object({ f: fecha }), async (e) => ({ f: e.f }));
  expect(await c.ejecutar({ f: '2026-11-19' })).toEqual({ f: '2026-11-19' });
  await expect(c.ejecutar({ f: '2026-02-30' })).rejects.toBeInstanceOf(ErrorConsulta);
  await expect(c.ejecutar({ f: '2026-02-30' })).rejects.toThrow(/Fecha/);
});
