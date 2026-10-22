import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { leerCatalogo, leerPedidos, type Dependencias } from '../../lib/sucursales/proveedor';
import { apiFalsa, envelope, pedido } from './sucursales-fixtures';

function deps(
  fetchFalso: typeof fetch,
  token: string | null = 'tk-prueba',
): Dependencias & { esperas: number[] } {
  let t = 0;
  const esperas: number[] = [];
  return {
    fetch: fetchFalso,
    esperar: async (ms) => {
      esperas.push(ms);
      t += ms;
    },
    ahora: () => t,
    token: () => token ?? undefined,
    esperas,
  };
}
const respuestas = (...rs: (() => Response | Promise<Response>)[]) => {
  const f = vi.fn<typeof fetch>();
  for (const r of rs) f.mockImplementationOnce(async () => r());
  return f;
};

describe('paginación', () => {
  it('recorre hasta totalPages, deduplica por id y declara completa solo si únicos = totalItems', async () => {
    const ps = Array.from({ length: 1203 }, (_, i) =>
      pedido(
        '2026-10-21',
        `${String(7 + Math.floor(i / 100)).padStart(2, '0')}:00:${String(i % 60).padStart(2, '0')}`,
      ),
    );
    const api = apiFalsa({ '2026-10-21': ps });
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(api.fetch));
    expect(r.completo).toBe(true);
    expect(r.paginas).toBe(3);
    expect(r.registros).toHaveLength(1203);
    expect(r.totalDeclarado).toBe(1203);
    // El token viaja solo en el header, nunca en la URL.
    expect(api.llamadas.every((l) => l.auth === 'Bearer tk-prueba' && !l.url.includes('tk-prueba'))).toBe(
      true,
    );
    expect(api.llamadas[0].url).toContain('perPage=500');
  });

  it('periodo sin pedidos es un vacío válido y completo', async () => {
    const r = await leerPedidos(612, '2026-11-20', '2026-11-21', deps(apiFalsa({}).fetch));
    expect(r).toMatchObject({ completo: true, registros: [], totalDeclarado: 0, errores: [] });
  });

  it('página repetida o vacía antes de terminar: lectura incompleta', async () => {
    const a = pedido('2026-10-21', '09:00:00');
    const repetida = respuestas(
      () => Response.json(envelope([a], 1, 1, 3)),
      () => Response.json(envelope([a], 2, 1, 3)),
    );
    const r1 = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(repetida));
    expect(r1.completo).toBe(false);
    expect(r1.errores.map((e) => e.codigo)).toContain('pagina-repetida');
    const vacia = respuestas(
      () => Response.json(envelope([a], 1, 1, 3)),
      () => Response.json(envelope([], 2, 1, 3)),
    );
    const r2 = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(vacia));
    expect(r2.completo).toBe(false);
    expect(r2.errores.map((e) => e.codigo)).toContain('pagina-vacia-inesperada');
  });

  it('total cambiante: repite la lectura una vez; si sigue cambiando, queda incompleta', async () => {
    const a = pedido('2026-10-21', '09:00:00');
    const b = pedido('2026-10-21', '09:01:00');
    const estable = respuestas(
      () => Response.json(envelope([a], 1, 1, 2)),
      () => Response.json(envelope([b], 2, 1, 3)),
      () => Response.json(envelope([a], 1, 1, 2)),
      () => Response.json(envelope([b], 2, 1, 2)),
    );
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(estable));
    expect(r.completo).toBe(true);
    expect(estable).toHaveBeenCalledTimes(4);
    const inestable = vi.fn<typeof fetch>(async (u) => {
      const pag = Number(new URL(String(u)).searchParams.get('page'));
      return Response.json(envelope([pag === 1 ? a : b], pag, 1, pag === 1 ? 2 : 3));
    });
    const r2 = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(inestable));
    expect(r2.completo).toBe(false);
    expect(r2.errores.map((e) => e.codigo)).toEqual(['total-cambiante']);
  });

  it('registros de otra company o sin id: se excluyen y la lectura no es completa', async () => {
    const f = respuestas(() =>
      Response.json(
        envelope(
          [
            pedido('2026-10-21', '09:00:00'),
            pedido('2026-10-21', '09:01:00', { companyId: 384 }),
            { companyId: 612 },
          ],
          1,
          500,
          3,
        ),
      ),
    );
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(f));
    expect(r.registros).toHaveLength(1);
    expect(r.completo).toBe(false);
    expect(r.errores.map((e) => e.codigo).sort()).toEqual(['identidad-discrepante', 'registros-invalidos']);
  });

  it('respeta el tope de páginas', async () => {
    const f = vi.fn<typeof fetch>(async (u) => {
      const pag = Number(new URL(String(u)).searchParams.get('page'));
      return Response.json(envelope([pedido('2026-10-21', '09:00:00')], pag, 1, 50));
    });
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(f));
    expect(r.completo).toBe(false);
    expect(r.paginas).toBe(20);
    expect(r.errores[0]).toMatchObject({ codigo: 'tope-alcanzado' });
  });
});

describe('errores del proveedor', () => {
  it('401/403: credenciales del portal, sin reintentos', async () => {
    const f = respuestas(() => new Response('{}', { status: 401 }));
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(f));
    expect(f).toHaveBeenCalledTimes(1);
    expect(r).toMatchObject({ completo: false, paginas: 0, errores: [{ codigo: 'credenciales-proveedor' }] });
  });

  it('404 de company: error explícito, no vacío', async () => {
    const r = await leerPedidos(999, '2026-10-21', '2026-10-21', deps(apiFalsa({}).fetch));
    expect(r.errores[0].codigo).toBe('sucursal-no-encontrada');
    expect(r.completo).toBe(false);
  });

  it('429 con Retry-After y 5xx: reintentos acotados con espera', async () => {
    const ok = () => Response.json(envelope([], 1, 500, 0));
    const f = respuestas(
      () => new Response('', { status: 429, headers: { 'Retry-After': '2' } }),
      () => new Response('', { status: 503 }),
      ok,
    );
    const d = deps(f);
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', d);
    expect(r.completo).toBe(true);
    expect(d.esperas).toEqual([2000, 1000]);
    const siempre500 = vi.fn<typeof fetch>(async () => new Response('', { status: 500 }));
    const r2 = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(siempre500));
    expect(siempre500).toHaveBeenCalledTimes(3);
    expect(r2.errores[0].codigo).toBe('proveedor-no-disponible');
  });

  it('error de red y timeout: reintenta y termina sin bucles', async () => {
    const red = vi.fn<typeof fetch>(async () => {
      throw new TypeError('fetch failed');
    });
    const r = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(red));
    expect(red).toHaveBeenCalledTimes(3);
    expect(r.errores[0].codigo).toBe('proveedor-no-disponible');
    const colgado = vi.fn<typeof fetch>(
      (_u, init) =>
        new Promise((_, rechazar) =>
          init!.signal!.addEventListener('abort', () => rechazar(new DOMException('abort', 'AbortError'))),
        ),
    );
    vi.useFakeTimers();
    const p = leerPedidos(612, '2026-10-21', '2026-10-21', deps(colgado));
    await vi.advanceTimersByTimeAsync(40_000);
    const r2 = await p;
    vi.useRealTimers();
    expect(r2.errores[0].codigo).toBe('tiempo-agotado');
  });

  it('respuesta con formato inesperado y token ausente', async () => {
    const r = await leerPedidos(
      612,
      '2026-10-21',
      '2026-10-21',
      deps(respuestas(() => Response.json([pedido('2026-10-21', '09:00:00')]))),
    );
    expect(r.errores[0]).toMatchObject({ codigo: 'respuesta-invalida' });
    const sinToken = vi.fn<typeof fetch>();
    const r2 = await leerPedidos(612, '2026-10-21', '2026-10-21', deps(sinToken, null));
    expect(sinToken).not.toHaveBeenCalled();
    expect(r2.errores[0].codigo).toBe('sin-configuracion');
  });

  it('rechaza ventanas inválidas antes de llamar', async () => {
    const f = vi.fn<typeof fetch>();
    await expect(leerPedidos(612, '2026-10-22', '2026-10-21', deps(f))).rejects.toThrow();
    await expect(leerPedidos(612, '2026-09-01', '2026-10-21', deps(f))).rejects.toThrow('31');
    await expect(leerPedidos(-1, '2026-10-21', '2026-10-21', deps(f))).rejects.toThrow();
    expect(f).not.toHaveBeenCalled();
  });

  it('catálogo validado', async () => {
    const r = await leerCatalogo(deps(apiFalsa({}).fetch));
    expect(r.ok && r.sucursales.find((s) => s.id === 612)?.lookerStoreId).toBe(477);
  });
});
