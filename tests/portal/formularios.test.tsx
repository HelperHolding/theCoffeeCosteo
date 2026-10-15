import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({
  registro: vi.fn(async () => ({ ok: true })),
  receta: vi.fn(async () => ({ error: 'La receta cambió; borrador conservado' })),
  push: vi.fn(),
  refresh: vi.fn(),
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }) }));
vi.mock('../../app/(portal)/configuracion/actions', () => ({ guardarRegistro: mocks.registro }));
vi.mock('../../app/(portal)/productos/actions', () => ({ guardarReceta: mocks.receta }));
import { FormularioRegistro } from '../../components/portal/formulario-registro';
import { campos } from '../../lib/portal/configuracion';
import { EditorReceta } from '../../components/recetas/editor-receta';
it('convierte porcentajes y guarda solo el payload de configuración', async () => {
  render(
    <FormularioRegistro
      tabla="parametros"
      id={1}
      inicial={{ iva: 0.16, margen_objetivo: 0.55 }}
      campos={campos.parametros}
      editable
    />,
  );
  expect(screen.getByRole('spinbutton', { name: 'IVA (%)' })).toHaveValue(16);
  fireEvent.change(screen.getByRole('spinbutton', { name: 'IVA (%)' }), { target: { value: '18' } });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
  await waitFor(() =>
    expect(mocks.registro).toHaveBeenCalledWith('parametros', 1, { iva: 0.18, margen_objetivo: 0.55 }),
  );
});
it('deshabilita formulario de consulta', () => {
  render(
    <FormularioRegistro
      tabla="proveedores"
      id="i"
      inicial={{ nombre: 'Proveedor', activo: true }}
      campos={campos.proveedores}
      editable={false}
    />,
  );
  expect(screen.getByLabelText('Nombre')).toBeDisabled();
  expect(screen.queryByRole('button')).toBeNull();
});
it('los tamaños se marcan y desmarcan sin diálogo; al guardar solo van los tamaños marcados', async () => {
  const confirmar = vi.spyOn(window, 'confirm').mockReturnValue(false);
  mocks.receta.mockClear();
  const tamanos = [
    { id: 'u', nombre: 'Único', orden: 1 },
    { id: 'ch', nombre: 'Chica', orden: 2 },
    { id: 'g', nombre: 'Grande', orden: 3 },
  ];
  render(
    <EditorReceta
      inicial={{
        id: 'p',
        version: 1,
        nombre: 'Latte',
        tipo: 'producto',
        categoria_id: 'c',
        rendimiento: null,
        unidad_rendimiento: null,
        activo: true,
        tamanos: ['u', 'ch', 'g'],
        lineas: [
          {
            insumo_id: 'cafe',
            subreceta_id: null,
            orden: 0,
            cantidades: [
              { tamano_id: 'u', cantidad: 0 },
              { tamano_id: 'ch', cantidad: 7 },
              { tamano_id: 'g', cantidad: 14 },
            ],
          },
        ],
      }}
      opciones={[{ id: 'cafe', nombre: 'Café', tipo: 'insumo', unidad: 'gr', costo: 1, activo: true }]}
      categorias={[{ id: 'c', nombre: 'Bebidas', activo: true }]}
      tamanos={tamanos}
      editable
    />,
  );
  const unico = screen.getByRole('checkbox', { name: 'Único' });
  await userEvent.click(unico);
  expect(unico).not.toBeChecked();
  expect(confirmar).not.toHaveBeenCalled();
  expect(screen.queryByRole('columnheader', { name: 'Único' })).toBeNull();
  expect(screen.getByText(/Al guardar se eliminan .* de: Único/)).toBeVisible();
  // Desmarcar y volver a marcar conserva lo capturado.
  await userEvent.click(screen.getByRole('checkbox', { name: 'Chica' }));
  await userEvent.click(screen.getByRole('checkbox', { name: 'Chica' }));
  expect(screen.getByLabelText('Cantidad línea 1 Chica')).toHaveValue(7);
  expect(screen.getByText('Chica: $7.00')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Guardar receta completa' }));
  await waitFor(() => expect(mocks.receta).toHaveBeenCalled());
  const [[enviado]] = mocks.receta.mock.calls as unknown as [
    [{ tamanos: string[]; lineas: { cantidades: { tamano_id: string }[] }[] }],
  ];
  expect(enviado.tamanos.sort()).toEqual(['ch', 'g']);
  expect(enviado.lineas[0].cantidades.map((c) => c.tamano_id).sort()).toEqual(['ch', 'g']);
  confirmar.mockRestore();
});
it('conserva nombre editado ante conflicto y consulta no permite guardar', async () => {
  const inicial = {
    id: 'r',
    version: 2,
    nombre: 'Mix',
    tipo: 'subreceta' as const,
    categoria_id: null,
    rendimiento: 100,
    unidad_rendimiento: 'ml' as const,
    activo: true,
    tamanos: [],
    lineas: [],
  };
  const { rerender } = render(
    <EditorReceta inicial={inicial} opciones={[]} categorias={[]} tamanos={[]} editable />,
  );
  fireEvent.change(screen.getByLabelText('Nombre'), { target: { value: 'Mix editado' } });
  await userEvent.click(screen.getByRole('button', { name: 'Guardar receta completa' }));
  await screen.findByRole('alert');
  expect(screen.getByLabelText('Nombre')).toHaveValue('Mix editado');
  rerender(
    <EditorReceta
      inicial={{ ...inicial, version: 3, nombre: 'Mix remoto' }}
      opciones={[]}
      categorias={[]}
      tamanos={[]}
      editable={false}
    />,
  );
  expect(screen.getByLabelText('Nombre')).toHaveValue('Mix editado');
  expect(screen.queryByRole('button', { name: 'Guardar receta completa' })).toBeNull();
});
