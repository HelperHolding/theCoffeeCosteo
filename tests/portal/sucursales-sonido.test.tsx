import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { MAX_SONIDOS, useSonidoVentas } from '../../components/sucursales/sonido-ventas';

let reproducidos: string[];
beforeEach(() => {
  vi.useFakeTimers();
  reproducidos = [];
  vi.stubGlobal(
    'Audio',
    class {
      constructor(private src: string) {}
      play() {
        reproducidos.push(this.src);
        return Promise.resolve();
      }
    },
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const montar = (src: string | null = '/sonidos/venta-612.mp3') =>
  renderHook(
    ({ fecha, pedidos }: { fecha: string | null; pedidos: number | null }) =>
      useSonidoVentas(src, fecha, pedidos),
    {
      initialProps: { fecha: '2026-10-22', pedidos: 10 } as { fecha: string | null; pedidos: number | null },
    },
  );
const correr = () => act(() => vi.runAllTimers());

it('apagado al abrir; activarlo suena una vez de confirmación y luego un cuac por pedido nuevo', () => {
  const h = montar();
  h.rerender({ fecha: '2026-10-22', pedidos: 11 });
  correr();
  expect(reproducidos).toEqual([]); // apagado: no suena
  act(() => h.result.current.alternar());
  correr();
  expect(reproducidos).toHaveLength(1); // confirmación
  h.rerender({ fecha: '2026-10-22', pedidos: 13 });
  correr();
  expect(reproducidos).toHaveLength(3); // +2 pedidos
});

it('tope de sonidos seguidos, sin sonido por cambio de día ni por lecturas con error', () => {
  const h = montar();
  act(() => h.result.current.alternar());
  correr();
  reproducidos = [];
  h.rerender({ fecha: '2026-10-22', pedidos: 30 });
  correr();
  expect(reproducidos).toHaveLength(MAX_SONIDOS);
  reproducidos = [];
  h.rerender({ fecha: '2026-10-23', pedidos: 2 }); // nuevo día
  correr();
  expect(reproducidos).toEqual([]);
  h.rerender({ fecha: null, pedidos: null }); // lectura con error: no cambia la referencia
  h.rerender({ fecha: '2026-10-23', pedidos: 4 });
  correr();
  expect(reproducidos).toHaveLength(2);
});

it('sin audio configurado no hay botón ni sonido', () => {
  const h = montar(null);
  expect(h.result.current.disponible).toBe(false);
  act(() => h.result.current.alternar());
  h.rerender({ fecha: '2026-10-22', pedidos: 12 });
  correr();
  expect(reproducidos).toEqual([]);
});
