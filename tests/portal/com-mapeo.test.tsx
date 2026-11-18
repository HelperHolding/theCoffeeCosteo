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
import { borrarMapeo, guardarMapeo } from '../../app/(comercializadora)/comercializadora/acciones';
import { filasMapeo, filtrarMapeo, nombresDePedidos } from '../../lib/comercializadora/mapeo';
import { Mapeo } from '../../components/comercializadora/mapeo';

const catalogo = [
  { sku: 'A', nombre: 'Café molido', categoria: 'Insumos' },
  { sku: 'B', nombre: 'Vaso 12 oz', categoria: 'Desechables' },
];

describe('Mapeo SKU (port de renderComMapeo)', () => {
  it('nombres de los pedidos: items_editados || items, también como texto JSON; sin vacíos ni repetidos', () => {
    expect(
      nombresDePedidos([
        { items: [{ nombre: 'Café 1 kg' }], items_editados: [{ nombre: 'Café 500 g' }] },
        { items: '[{"nombre":"Vaso 12 oz"},{"nombre":"  "}]', items_editados: null },
        { items: 'roto', items_editados: null },
        { items: [{ nombre: 'Vaso 12 oz' }, { sku: 'x' }], items_editados: null },
      ]),
    ).toEqual(['Café 500 g', 'Vaso 12 oz']);
  });

  it('filas: unión de mapeados y vistos en pedidos, ordenadas, con la categoría del SKU', () => {
    const f = filasMapeo(
      ['Vaso 12 oz', 'Café 1 kg'],
      [
        { shopify_nombre: 'Café 1 kg', sku: 'A', notas: 'kg' },
        { shopify_nombre: 'Azúcar', sku: null, notas: null },
      ],
      catalogo,
    );
    expect(f.map((x) => [x.nombre, x.sku, x.mapeado, x.categoria])).toEqual([
      ['Azúcar', null, false, null],
      ['Café 1 kg', 'A', true, 'Insumos'],
      ['Vaso 12 oz', null, false, null],
    ]);
  });

  it('filtro: texto sin acentos (nombre o SKU), estado y categoría', () => {
    const f = filasMapeo(['Vaso 12 oz'], [{ shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }], catalogo);
    expect(filtrarMapeo(f, { texto: 'cafe', estado: '', categoria: '' }).map((x) => x.nombre)).toEqual([
      'Café 1 kg',
    ]);
    expect(filtrarMapeo(f, { texto: '', estado: 'pendiente', categoria: '' }).map((x) => x.nombre)).toEqual([
      'Vaso 12 oz',
    ]);
    expect(filtrarMapeo(f, { texto: '', estado: '', categoria: 'Insumos' }).map((x) => x.nombre)).toEqual([
      'Café 1 kg',
    ]);
  });

  describe('acciones', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
    });
    it('guardar: inserta un mapeo nuevo y actualiza uno existente por nombre exacto', async () => {
      const f = dbFalsa({
        com_catalogo: catalogo,
        com_sku_mapping: [{ id: '1', shopify_nombre: 'Café 1 kg', sku: 'B', notas: null }],
      });
      m.db = f.db;
      expect(await guardarMapeo('Café 1 kg', 'A', ' por kilo ')).toEqual({ ok: true });
      expect(await guardarMapeo('Vaso 12 oz', 'B', '')).toEqual({ ok: true });
      expect(f.tablas.com_sku_mapping.map((x) => [x.shopify_nombre, x.sku, x.notas])).toEqual([
        ['Café 1 kg', 'A', 'por kilo'],
        ['Vaso 12 oz', 'B', null],
      ]);
    });
    it('guardar: rechaza un SKU que no está en el catálogo', async () => {
      m.db = dbFalsa({ com_catalogo: catalogo, com_sku_mapping: [] }).db;
      expect(await guardarMapeo('Café 1 kg', 'ZZ', '')).toEqual({ error: 'Elige un SKU del catálogo' });
    });
    it('borrar quita el mapeo de ese nombre', async () => {
      const f = dbFalsa({
        com_sku_mapping: [{ id: '1', shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }],
      });
      m.db = f.db;
      expect(await borrarMapeo('Café 1 kg')).toEqual({ ok: true });
      expect(f.tablas.com_sku_mapping).toEqual([]);
    });
    it('solo lectura: no toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_catalogo: catalogo, com_sku_mapping: [] });
      m.db = f.db;
      const SL = { error: 'Tu acceso a Comercializadora es de solo lectura.' };
      expect(await guardarMapeo('X', 'A', '')).toEqual(SL);
      expect(await borrarMapeo('X')).toEqual(SL);
      expect(f.consultas).toEqual([]);
    });
  });
});

describe('pantalla Mapeo', () => {
  const filas = filasMapeo(
    ['Vaso 12 oz'],
    [{ shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }],
    catalogo,
  );
  it('muestra el conteo de pendientes y el aviso si no se pudieron leer los pedidos', () => {
    render(
      <Mapeo
        filas={filas}
        catalogo={catalogo}
        editable={false}
        aviso="No se pudieron leer los pedidos del sitio viejo."
      />,
    );
    expect(screen.getByText(/1 producto sin mapear/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer los pedidos del sitio viejo.');
    expect(screen.queryByRole('button', { name: /Asignar SKU/ })).not.toBeInTheDocument();
  });
  it('el filtro Pendiente deja solo los sin SKU', () => {
    render(<Mapeo filas={filas} catalogo={catalogo} editable aviso={null} />);
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'pendiente' } });
    expect(screen.getByText('Vaso 12 oz')).toBeInTheDocument();
    expect(screen.queryByText('Café 1 kg')).not.toBeInTheDocument();
  });
});
