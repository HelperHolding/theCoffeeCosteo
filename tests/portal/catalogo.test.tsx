import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { CatalogoRecetas } from '../../components/recetas/catalogo';
import { Navegacion } from '../../components/portal/navegacion';
vi.mock('next/navigation', () => ({
  usePathname: () => '/productos/receta-1',
  useSearchParams: () => new URLSearchParams(),
}));
it('pagina, filtra desde la segunda página y permite consultar a usuarios sin edición', async () => {
  const filas = Array.from({ length: 30 }, (_, i) => ({
    id: String(i),
    nombre: `Receta ${i}`,
    activo: i !== 29,
  }));
  render(<CatalogoRecetas filas={filas} tipo="producto" editable={false} />);
  expect(screen.queryByRole('link', { name: /Crear producto/ })).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('1–25 de 30');
  await userEvent.click(screen.getByRole('button', { name: 'Siguiente' }));
  expect(screen.getByRole('link', { name: 'RECETA 29' })).toHaveAttribute('href', '/productos/29');
  await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar por nombre' }), 'Receta 0');
  expect(screen.getByRole('status')).toHaveTextContent('1–1 de 1');
  await userEvent.selectOptions(screen.getByLabelText('Estado'), 'inactivos');
  expect(screen.getByText('No hay resultados')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Siguiente' })).toBeDisabled();
});
it('muestra productos en mayúsculas con costo y precio por canal y tamaño', () => {
  render(
    <CatalogoRecetas
      tipo="producto"
      editable={false}
      canales={[
        { id: 'm', nombre: 'Mostrador' },
        { id: 'r', nombre: 'Rappi' },
        { id: 'a', nombre: 'App propia' },
      ]}
      filas={[
        {
          id: '1',
          nombre: 'Açaí Bowl',
          activo: true,
          categoria: 'Bowls',
          precios: [
            { tamano: 'Chica', costo: 10, canales: { m: 50, r: 70, a: 50 } },
            { tamano: 'Grande', costo: 15.5, canales: { m: 65, r: null, a: 65 } },
          ],
        },
      ]}
    />,
  );
  expect(screen.getByRole('link', { name: 'AÇAÍ BOWL' })).toBeVisible();
  expect(screen.getByText('BOWLS')).toBeVisible();
  for (const encabezado of ['Costo', 'Mostrador', 'Rappi', 'App propia'])
    expect(screen.getByRole('columnheader', { name: encabezado })).toBeVisible();
  const [fila] = screen.getAllByRole('row').slice(1);
  expect(fila).toHaveTextContent('CHICA$10.00');
  expect(fila).toHaveTextContent('GRANDE$15.50');
  expect(fila).toHaveTextContent('CHICA$70.00GRANDE—');
});
it('ofrece alta de sub-receta y conserva el filtro inicial', () => {
  render(
    <CatalogoRecetas
      filas={[{ id: '1', nombre: 'Mix', activo: true }]}
      tipo="subreceta"
      editable
      consulta="Mix"
    />,
  );
  expect(screen.getByRole('link', { name: /Crear sub-receta/ })).toHaveAttribute('href', '/subrecetas/nueva');
  expect(screen.getByRole('searchbox')).toHaveValue('Mix');
});
it('resalta Productos también dentro de su ficha', () => {
  render(<Navegacion />);
  expect(screen.getByRole('link', { name: 'Productos' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Tablero' })).not.toHaveAttribute('aria-current');
});
