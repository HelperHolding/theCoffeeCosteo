import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { catalogoServicio } from '../../lib/sucursales/corte-servidor';

// Cliente falso de PostgREST: tope de 1,000 filas por petición, como max-rows.
const clienteCon = (filas: { codigo: string; nombre_observado: string | null }[], falloEnPagina?: number) => {
  const pedidas: [number, number][] = [];
  const db = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (desde: number, hasta: number) => {
            pedidas.push([desde, hasta]);
            if (falloEnPagina === pedidas.length) return { data: null, error: { message: 'caída' } };
            return { data: filas.slice(desde, Math.min(hasta, desde + 999) + 1), error: null };
          },
        }),
      }),
    }),
  };
  return { db: db as never, pedidas };
};

describe('catalogoServicio', () => {
  it('pagina de 1,000 en 1,000 hasta una página corta, sin truncar', async () => {
    const filas = Array.from({ length: 2500 }, (_, i) => ({ codigo: `C${i}`, nombre_observado: `Producto ${i}` }));
    const { db, pedidas } = clienteCon(filas);
    const cat = await catalogoServicio(db);
    expect(cat!.size).toBe(2500);
    expect(cat!.get('Producto 2499')).toBe('C2499');
    expect(pedidas).toEqual([[0, 999], [1000, 1999], [2000, 2999]]);
  });

  it('con un múltiplo exacto de 1,000 pide una página más y termina', async () => {
    const filas = Array.from({ length: 1000 }, (_, i) => ({ codigo: `C${i}`, nombre_observado: `P${i}` }));
    const { db, pedidas } = clienteCon(filas);
    expect((await catalogoServicio(db))!.size).toBe(1000);
    expect(pedidas).toHaveLength(2);
  });

  it('un nombre con dos códigos distintos queda fuera, aunque estén en páginas distintas', async () => {
    const relleno = Array.from({ length: 1000 }, (_, i) => ({ codigo: `R${i}`, nombre_observado: `R${i}` }));
    const { db } = clienteCon([{ codigo: 'A', nombre_observado: 'Doble' }, ...relleno, { codigo: 'B', nombre_observado: 'Doble' }]);
    const cat = await catalogoServicio(db);
    expect(cat!.has('Doble')).toBe(false);
    expect(cat!.size).toBe(1000);
  });

  it('si una página falla no devuelve un catálogo a medias', async () => {
    const filas = Array.from({ length: 2500 }, (_, i) => ({ codigo: `C${i}`, nombre_observado: `P${i}` }));
    const { db } = clienteCon(filas, 2);
    expect(await catalogoServicio(db)).toBeUndefined();
  });
});
