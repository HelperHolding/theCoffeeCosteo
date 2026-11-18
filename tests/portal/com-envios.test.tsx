import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { marcarEnviado } from '../../app/(comercializadora)/comercializadora/acciones';
import { agruparVentas, conteoEnvios, filtrarEnvios } from '../../lib/comercializadora/envios';
import { Envios } from '../../components/comercializadora/envios';

const v = (o: Record<string, unknown>) => ({
  id: String(Math.random()),
  tipo: 'venta',
  folio: 'V1',
  sucursal: 'Polanco',
  fecha: '2026-11-01',
  fecha_envio: '2026-11-10',
  sku: 'A',
  cantidad: 2,
  estado: 'por_enviar',
  ...o,
});

describe('Envíos (port de renderComEnvios)', () => {
  const filas = [
    v({ folio: 'V1' }),
    v({ folio: 'V1', sku: 'B', cantidad: 3 }),
    v({ folio: 'V2', estado: 'enviado', fecha_envio: '2026-11-05' }),
    v({ folio: 'V3', estado: 'cancelado', fecha_envio: '2026-11-01' }),
  ];

  it('agrupa por folio, por fecha de envío; "por enviar" es solo estado por_enviar (no los cancelados)', () => {
    const g = agruparVentas(filas as never);
    expect(g.map((x) => [x.folio, x.estado, x.skus, x.uds, x.pendientes])).toEqual([
      ['V3', 'otro', 1, 2, 0],
      ['V2', 'enviado', 1, 2, 0],
      ['V1', 'por_enviar', 2, 5, 2],
    ]);
    expect(g[0].textoEstado).toBe('cancelado');
  });

  it('las pestañas cuentan folios, no líneas', () => {
    const g = agruparVentas(filas as never);
    expect(conteoEnvios(g)).toEqual({ por_enviar: 1, enviados: 1, todos: 3 });
    expect(filtrarEnvios(g, 'enviados').map((x) => x.folio)).toEqual(['V2']);
  });

  describe('marcarEnviado', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
    });
    it('marca solo las líneas por_enviar de ese folio de venta', async () => {
      const f = dbFalsa({
        com_movimientos: [...filas.map((x) => ({ ...x })), v({ tipo: 'compra', folio: 'V1' })],
      });
      m.db = f.db;
      expect(await marcarEnviado('V1')).toEqual({ ok: true, lineas: 2 });
      const t = f.tablas.com_movimientos;
      expect(
        t.filter((x) => x.folio === 'V1' && x.tipo === 'venta').every((x) => x.estado === 'enviado'),
      ).toBe(true);
      expect(t.find((x) => x.tipo === 'compra')?.estado).toBe('por_enviar');
      expect(t.find((x) => x.folio === 'V3')?.estado).toBe('cancelado');
    });
    it('dos veces: la segunda avisa que ya no hay nada por enviar', async () => {
      m.db = dbFalsa({ com_movimientos: [v({})] }).db;
      await marcarEnviado('V1');
      expect(await marcarEnviado('V1')).toEqual({
        error: 'Ese pedido ya no tiene líneas por enviar; recarga la página',
      });
    });
    it('solo lectura: no toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_movimientos: [v({})] });
      m.db = f.db;
      expect(await marcarEnviado('V1')).toEqual({
        error: 'Tu acceso a Comercializadora es de solo lectura.',
      });
      expect(f.consultas).toEqual([]);
    });
  });
});

describe('pantalla Envíos', () => {
  const grupos = agruparVentas([v({ folio: 'V1' }), v({ folio: 'V2', estado: 'enviado' })] as never);
  it('por omisión muestra lo por enviar; la pestaña Enviados cambia la lista', () => {
    render(<Envios grupos={grupos} editable={false} />);
    expect(screen.getByText('V1')).toBeInTheDocument();
    expect(screen.queryByText('V2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enviados \(1\)/ }));
    expect(screen.getByText('V2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marcar enviado/ })).not.toBeInTheDocument();
  });
});
