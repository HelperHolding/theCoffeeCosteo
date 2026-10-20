import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { Navegacion } from '../../components/portal/navegacion';

const ruta = vi.hoisted(() => ({ actual: '/costeo' }));
vi.mock('next/navigation', () => ({
  usePathname: () => ruta.actual,
  useSearchParams: () => new URLSearchParams(),
}));

it('en Costeo el Tablero vive en /costeo y el grupo Portal lleva a Inicio y al CRM', () => {
  render(<Navegacion seccion="costeo" visibles={['costeo', 'crm']} />);
  expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('href', '/costeo');
  expect(screen.getByRole('link', { name: 'Tablero' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Inicio' })).toHaveAttribute('href', '/');
  expect(screen.getByRole('link', { name: 'CRM Franquicias' })).toHaveAttribute('href', '/crm');
  expect(screen.queryByRole('link', { name: 'Costeo' })).toBeNull();
});

it('en Inicio el menú solo lleva a Inicio: los módulos van en las tarjetas', () => {
  ruta.actual = '/';
  render(<Navegacion seccion="inicio" visibles={['costeo', 'crm']} />);
  expect(screen.getAllByRole('link').map((l) => l.textContent)).toEqual(['Inicio']);
  ruta.actual = '/costeo';
});

it('sin acceso al CRM no aparece su enlace', () => {
  render(<Navegacion seccion="costeo" visibles={['costeo']} />);
  expect(screen.queryByRole('link', { name: 'CRM Franquicias' })).toBeNull();
});

it('en el CRM muestra su panel y el regreso a Costeo, sin las pantallas de Costeo', () => {
  ruta.actual = '/crm';
  render(<Navegacion seccion="crm" visibles={['costeo', 'crm']} />);
  expect(screen.getByRole('link', { name: 'Panel' })).toHaveAttribute('aria-current', 'page');
  expect(screen.getByRole('link', { name: 'Costeo' })).toHaveAttribute('href', '/costeo');
  expect(screen.queryByRole('link', { name: 'Insumos' })).toBeNull();
});
