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
  expect(screen.getAllByText('$65.00').length).toBeGreaterThan(0);

  await userEvent.click(screen.getByRole('button', { name: 'Agregar producto' }));
  await userEvent.selectOptions(screen.getByLabelText('Producto 3 del combo'), 'nuevo:u');
  expect(screen.getByText(/no tiene costo registrado/)).toBeVisible();
  expect(screen.queryByText('Costo de productos')).toBeNull();
  await userEvent.click(screen.getByRole('button', { name: 'Quitar producto 3 del combo' }));
  expect(screen.getByText('Costo de productos')).toBeVisible();
});

it('prueba el precio Rappi con costo, IVA, comisión sobre cobro y envase configurados', async () => {
  render(
    <CalculadoraPromociones
      productos={[
        ...productos,
        { id: 'acai:u', nombre: 'Acai bowl', costo: 43.74, precioLista: 150, precioRappi: 188 },
      ]}
      canales={[{ id: 'rappi', nombre: 'Rappi', comisionPct: 20, costoEnvase: 5 }]}
      ivaDefault={16}
      objetivoDefault={50}
    />,
  );
  await userEvent.click(screen.getByRole('radio', { name: 'Precio Rappi' }));
  expect(screen.queryByLabelText('Comisión del canal (%)')).toBeNull();
  await userEvent.selectOptions(screen.getByLabelText('Producto Rappi'), 'acai:u');
  const precio = screen.getByLabelText('Precio de venta Rappi, con IVA');
  expect(precio).toHaveValue(188);
  const indicadores = screen.getByLabelText('Márgenes de la simulación');
  expect(indicadores.querySelectorAll('dt')).toHaveLength(2);
  // 188 / 1.16 − 43.74 − 5 − 188 × .20 = 75.729...
  expect(within(indicadores).getByText('Margen con comisión Rappi').nextSibling).toHaveTextContent('$75.73');
  await userEvent.clear(precio);
  expect(screen.queryByLabelText('Márgenes de la simulación')).toBeNull();
  await userEvent.type(precio, '116');
  expect(screen.getByText('Margen con comisión Rappi').nextSibling).toHaveTextContent('$28.06');
  expect(screen.getByText('Margen bruto Rappi').nextSibling).toHaveTextContent('$51.26');
  await userEvent.type(precio, '-');
  await userEvent.selectOptions(screen.getByLabelText('Producto Rappi'), 'nuevo:u');
  expect(screen.getByText(/Este producto no tiene costo registrado/)).toBeVisible();
  expect(screen.queryByLabelText('Márgenes de la simulación')).toBeNull();
  await userEvent.click(screen.getByRole('radio', { name: 'Un producto' }));
  await userEvent.selectOptions(screen.getByLabelText('Producto de referencia'), 'americano:u');
  expect(screen.getByLabelText('Márgenes de la simulación')).toBeVisible();
});

it('compara cuatro márgenes por canal en producto y combo al mismo precio', async () => {
  render(
    <CalculadoraPromociones
      productos={productos}
      canales={[
        { id: 'mostrador', nombre: 'Mostrador', comisionPct: 0, costoEnvase: 0 },
        { id: 'rappi', nombre: 'Rappi', comisionPct: 20, costoEnvase: 5 },
      ]}
      ivaDefault={16}
      objetivoDefault={50}
    />,
  );
  await userEvent.selectOptions(screen.getByLabelText('Producto de referencia'), 'americano:u');
  const precio = screen.getByLabelText('Precio total de la promoción, con IVA');
  await userEvent.clear(precio);
  await userEvent.type(precio, '116');
  expect(screen.getByLabelText('Márgenes de la simulación').querySelectorAll('dt')).toHaveLength(4);
  expect(screen.getByText('Margen bruto Mostrador/App').nextSibling).toHaveTextContent('$90.00');
  expect(screen.getByText('Margen con comisión Mostrador/App').nextSibling).toHaveTextContent('$90.00');
  expect(screen.getByText('Margen bruto Rappi').nextSibling).toHaveTextContent('$85.00');
  expect(screen.getByText('Margen con comisión Rappi').nextSibling).toHaveTextContent('$61.80');
  await userEvent.selectOptions(screen.getByLabelText('Canal de referencia'), 'rappi');
  expect(screen.getByText('Margen bruto Mostrador/App').nextSibling).toHaveTextContent('$90.00');
  expect(screen.getByText('Margen con comisión Rappi').nextSibling).toHaveTextContent('$61.80');
  await userEvent.click(screen.getByRole('radio', { name: 'Combo de varios productos' }));
  await userEvent.selectOptions(screen.getByLabelText('Producto 1 del combo'), 'americano:u');
  await userEvent.selectOptions(screen.getByLabelText('Producto 2 del combo'), 'croissant:u');
  const precioCombo = screen.getByLabelText('Precio total del combo, con IVA');
  await userEvent.clear(precioCombo);
  await userEvent.type(precioCombo, '116');
  expect(screen.getByText('Margen bruto Mostrador/App').nextSibling).toHaveTextContent('$75.00');
  expect(screen.getByText('Margen con comisión Rappi').nextSibling).toHaveTextContent('$46.80');
});
