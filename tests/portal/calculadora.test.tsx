import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it } from 'vitest';
import { CalculadoraPromociones } from '../../components/recetas/calculadora-promociones';

const productos = [
  { id: 'americano:u', nombre: 'Americano · Único', costo: 10, precioLista: 50 },
  { id: 'croissant:u', nombre: 'Croissant · Único', costo: 15, precioLista: 60 },
  { id: 'nuevo:u', nombre: 'Nuevo · Único', costo: null, precioLista: 40 },
];

it('simula un combo de varios productos con costo total y ahorro frente a precios de lista', async () => {
  render(<CalculadoraPromociones productos={productos} canales={[]} ivaDefault={16} objetivoDefault={50} />);
  await userEvent.click(screen.getByRole('radio', { name: 'Combo de varios productos' }));
  expect(screen.queryByLabelText('Costo por unidad, sin IVA')).toBeNull();
  expect(screen.getByText('Elige los productos del combo con cantidades enteras positivas.')).toBeVisible();

  await userEvent.selectOptions(screen.getByLabelText('Producto 1 del combo'), 'americano:u');
  await userEvent.clear(screen.getByLabelText('Cantidad del producto 1'));
  await userEvent.type(screen.getByLabelText('Cantidad del producto 1'), '2');
  await userEvent.selectOptions(screen.getByLabelText('Producto 2 del combo'), 'croissant:u');

  const combo = screen.getByRole('group', { name: 'Productos del combo' });
  expect(within(combo).getByText('$35.00')).toBeVisible(); // 2 × 10 + 15
  expect(within(combo).getByText('$160.00')).toBeVisible(); // 2 × 50 + 60
  // Sin precio capturado, se propone la suma de precios de lista.
  expect(screen.getByLabelText('Precio total del combo, con IVA')).toHaveValue(160);
  // La propuesta sigue al combo mientras no se capture un precio propio.
  await userEvent.clear(screen.getByLabelText('Cantidad del producto 2'));
  await userEvent.type(screen.getByLabelText('Cantidad del producto 2'), '2');
  expect(screen.getByLabelText('Precio total del combo, con IVA')).toHaveValue(220);
  await userEvent.clear(screen.getByLabelText('Cantidad del producto 2'));
  await userEvent.type(screen.getByLabelText('Cantidad del producto 2'), '1');

  await userEvent.clear(screen.getByLabelText('Precio total del combo, con IVA'));
  await userEvent.type(screen.getByLabelText('Precio total del combo, con IVA'), '116');
  expect(screen.getByText('Costo de productos').nextSibling).toHaveTextContent('$35.00');
  expect(screen.getByText('Ahorro para el cliente vs. precios de lista').nextSibling).toHaveTextContent(
    '$44.00',
  );
  // 116 con IVA = 100 neto; 100 − 35 = 65.
  expect(screen.getByText('$65.00')).toBeVisible();

  await userEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
  await userEvent.selectOptions(screen.getByLabelText('Producto 3 del combo'), 'nuevo:u');
  expect(screen.getByText(/no tiene costo registrado/)).toBeVisible();
  expect(screen.queryByText('Costo de productos')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Quitar producto 3 del combo' }));
  expect(screen.getByText('Costo de productos')).toBeVisible();
});
