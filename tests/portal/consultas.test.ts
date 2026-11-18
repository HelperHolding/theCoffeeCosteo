import { expect, it, vi } from 'vitest';
import { leerPaginas, todas, type Db, dinero, porcentaje } from '../../lib/portal/consultas';
const filas = (n: number, desde = 0) => ({
  data: Array.from({ length: n }, (_, i) => ({ id: String(desde + i) })),
  error: null,
});
it('consulta todas las páginas y falla si el API falla en una página posterior', async () => {
  const range = vi.fn().mockResolvedValueOnce(filas(1000)).mockResolvedValueOnce(filas(1, 1000));
  const q = { order: vi.fn().mockReturnThis(), range };
  const db = { from: vi.fn().mockReturnValue({ select: () => q }) } as unknown as Db;
  expect(await todas(db, 'insumos', 'id')).toHaveLength(1001);
  expect(range).toHaveBeenLastCalledWith(1000, 1999);
  range.mockResolvedValueOnce(filas(1000)).mockResolvedValueOnce({ data: null, error: { message: 'error' } });
  await expect(todas(db, 'insumos', 'id')).rejects.toThrow('No se pudo consultar');
});
it('lee más de 1,000 filas: páginas en paralelo hasta la primera corta (el tope de PostgREST no recorta)', async () => {
  // 3,850 cards como crm_v_candados: 4 páginas en una sola ronda.
  const pagina = vi.fn(async (desde: number) => filas(Math.max(0, Math.min(1000, 3850 - desde)), desde));
  const r = await leerPaginas<{ id: string }>(pagina);
  expect(r).toHaveLength(3850);
  expect(new Set(r.map((x) => x.id)).size).toBe(3850);
  expect(pagina).toHaveBeenCalledTimes(4);
  // Exactamente 4,000: la cuarta página llega llena y se pide otra ronda, que viene vacía.
  const exacto = vi.fn(async (desde: number) => filas(Math.max(0, Math.min(1000, 4000 - desde)), desde));
  expect(await leerPaginas(exacto, { lote: 2 })).toHaveLength(4000);
  expect(exacto).toHaveBeenLastCalledWith(5000, 5999);
});
it('filtra en la base antes de ordenar y paginar', async () => {
  const llamadas: string[] = [];
  const q = {
    eq: vi.fn((c: string, v: string) => (llamadas.push(`eq:${c}=${v}`), q)),
    order: vi.fn((c: string) => (llamadas.push(`order:${c}`), q)),
    range: vi
      .fn()
      .mockResolvedValueOnce({ data: [{ producto_id: 'p1' }], error: null })
      .mockResolvedValue({ data: [], error: null }),
  };
  const db = { from: vi.fn().mockReturnValue({ select: () => q }) } as unknown as Db;
  expect(await todas(db, 'v_resumen', 'producto_id,tamano_id', { producto_id: 'p1' })).toHaveLength(1);
  // Cada página (van dos en paralelo) filtra antes de ordenar.
  expect(llamadas.slice(0, 3)).toEqual(['eq:producto_id=p1', 'order:producto_id', 'order:tamano_id']);
});
it('preserva nulo frente a cero', () => {
  expect(dinero(null)).toBe('Sin precio');
  expect(dinero(0)).toContain('0.00');
  expect(porcentaje(null)).toBe('—');
});
