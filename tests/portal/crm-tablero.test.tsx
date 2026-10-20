import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import type { TarjetaTienda } from '../../lib/crm/kanban';

const mover = vi.hoisted(() => vi.fn());
vi.mock('../../app/(crm)/crm/acciones', () => ({ moverTienda: mover }));
vi.mock('next/link', () => ({ default: (p: React.ComponentProps<'a'>) => <a {...p} /> }));
import { TableroTiendas } from '../../components/crm/tablero-tiendas';

const etapas = [
  { id: 'firma', nombre: 'Firma de contrato', orden: 1, tipo: 'abierta' as const },
  { id: 'local', nombre: 'En búsqueda de local', orden: 2, tipo: 'abierta' as const },
  { id: 'operando', nombre: 'Operando', orden: 3, tipo: 'ganada' as const },
];
const tienda = (
  id: string,
  nombre: string,
  etapa: string,
  extra: Partial<TarjetaTienda> = {},
): TarjetaTienda => ({
  id,
  nombre,
  etapa_id: etapa,
  posicion: 1024,
  version: 3,
  franquiciatario: null,
  ciudad: 'Querétaro',
  tipo_franquicia: null,
  fecha_programada_arranque: null,
  revisar: [],
  notas: 2,
  archivos: 1,
  checklist: { hechos: 1, total: 4 },
  actividadesAbiertas: 0,
  ...extra,
});
const columna = (nombre: string) => screen.getByRole('list', { name: nombre });

beforeEach(() => mover.mockReset());

it('mueve con el menú accesible "Mover a…" y anuncia el resultado', async () => {
  mover.mockResolvedValue({ version: 4, posicion: 1024 });
  render(<TableroTiendas etapas={etapas} tarjetas={[tienda('t1', 'Centro', 'firma')]} editable />);
  await userEvent.click(screen.getByRole('button', { name: 'Mover Centro a otra etapa' }));
  await userEvent.click(screen.getByRole('button', { name: 'Operando' }));
  expect(within(columna('Operando')).getByText('Centro')).toBeVisible();
  expect(mover).toHaveBeenCalledWith('t1', 'operando', 1024, 3);
  expect(await screen.findByText('Centro se movió a Operando.')).toBeInTheDocument();
});

it('si la base rechaza el movimiento, la tarjeta regresa y se muestra el error', async () => {
  mover.mockResolvedValue({ error: 'La tienda cambió mientras tanto. Recarga para ver la versión actual.' });
  render(<TableroTiendas etapas={etapas} tarjetas={[tienda('t1', 'Centro', 'firma')]} editable />);
  await userEvent.click(screen.getByRole('button', { name: 'Mover Centro a otra etapa' }));
  await userEvent.click(screen.getByRole('button', { name: 'Operando' }));
  expect(await screen.findByText(/No se movió Centro: La tienda cambió/)).toBeInTheDocument();
  expect(within(columna('Firma de contrato')).getByText('Centro')).toBeVisible();
  expect(within(columna('Operando')).queryByText('Centro')).toBeNull();
});

it('filtra sin perder las tarjetas ocultas y respeta el modo de solo lectura', async () => {
  render(
    <TableroTiendas
      etapas={etapas}
      tarjetas={[
        tienda('t1', 'Centro', 'firma', { tipo_franquicia: 'maestra' }),
        tienda('t2', 'Norte', 'firma', { revisar: ['fecha_apertura'] }),
      ]}
      editable={false}
    />,
  );
  expect(screen.queryByRole('button', { name: /Mover .* a otra etapa/ })).toBeNull();
  await userEvent.click(screen.getByRole('checkbox', { name: 'Por revisar' }));
  expect(within(columna('Firma de contrato')).queryByText('Centro')).toBeNull();
  expect(within(columna('Firma de contrato')).getByText('Norte')).toBeVisible();
  expect(screen.getByText('1 de 2 tiendas')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: /Tabla/ }));
  expect(screen.getByRole('table')).toHaveTextContent('Norte');
});
