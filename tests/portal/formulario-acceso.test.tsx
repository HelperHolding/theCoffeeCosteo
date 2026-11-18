import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/app/(auth)/login/actions', () => ({ entrar: vi.fn(), establecer: vi.fn() }));
import { FormularioAcceso } from '../../components/portal/formulario-acceso';

it('el acceso pide correo o usuario en un campo de texto', () => {
  render(<FormularioAcceso />);
  const campo = screen.getByLabelText('Correo o usuario');
  expect(campo).toHaveAttribute('type', 'text');
  expect(campo).toHaveAttribute('name', 'email');
  expect(campo).toHaveAttribute('autocapitalize', 'none');
});
