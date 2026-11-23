import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Navegacion } from '../../components/portal/navegacion';

const ruta = vi.hoisted(() => ({ actual: '/costeo' }));
vi.mock('next/navigation', () => ({
  usePathname: () => ruta.actual,
  useSearchParams: () => new URLSearchParams(),
}));

it('en Costeo el Tablero vive en /costeo y el grupo Módulos lleva a Inicio, a Costeo (activo) y al CRM', () => {
  render(<Navegacion seccion="costeo" visibles={['costeo', 'crm']} />);
  expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/costeo');
  expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'CRM Franquicias' })).toHaveAttribute('href', '/crm');
  expect(screen.getByRole('link', { name: 'Costeo' })).toHaveAttribute('aria-current', 'page');
});

it('en Inicio el panel lleva a Inicio y a los módulos visibles, en su orden', () => {
  ruta.actual = '/';
  render(<Navegacion seccion="inicio" visibles={['costeo', 'crm']} />);
  expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual([
    'Inicio',
    'Costeo',
    'CRM Franquicias',
  ]);
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('aria-current', 'page');
  ruta.actual = '/costeo';
});

it('Costeo se marca activo en cualquier pantalla de Costeo (no solo en /costeo)', () => {
  ruta.actual = '/productos';
  render(<Navegacion seccion="costeo" visibles={['costeo', 'sucursales']} />);
  expect(screen.getByRole('link', { name: 'Costeo' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Sucursales' })).not.toHaveAttribute('aria-current');
  ruta.actual = '/costeo';
});

it('Franquiciatarios con solo ese módulo no muestra el grupo Módulos', () => {
  ruta.actual = '/franquiciatarios/514';
  render(
    <Navegacion
      seccion="franquiciatarios"
      visibles={['franquiciatarios']}
      franquicia={{ companyId: 514, nombre: 'Essentia', gestor: false, varias: false }}
    />,
  );
  expect(screen.queryByRole('link', { name: 'Inicio' })).toBeNull();
  expect(screen.getByRole('link', { name: 'Hoy' })).toHaveAttribute('aria-current', 'page');
  ruta.actual = '/costeo';
});

it('sin acceso al CRM no aparece su enlace', () => {
  render(<Navegacion seccion="costeo" visibles={['costeo']} />);
  expect(screen.queryByRole('link', { name: 'CRM Franquicias' })).toBeNull();
});

it('en el CRM muestra su panel y el acceso a Costeo, sin las pantallas de Costeo', () => {
  ruta.actual = '/crm';
  render(<Navegacion seccion="crm" visibles={['costeo', 'crm']} />);
  expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Costeo' })).toHaveAttribute('href', '/costeo');
  expect(screen.queryByRole('link', { name: 'Insumos' })).toBeNull();
});
