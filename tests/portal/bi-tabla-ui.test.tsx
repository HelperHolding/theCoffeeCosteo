import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TablaBi, type ColumnaBi } from '@/components/bi/tabla-bi';

type F = { n: string; v: number; t: number };
const col: ColumnaBi<F>[] = [
  { clave: 'n', titulo: 'Tienda', celda: (f) => f.n },
  { clave: 'v', titulo: 'Venta', numero: true, orden: (f) => f.v, celda: (f) => String(f.v) },
  { clave: 't', titulo: 'Tickets', numero: true, orden: (f) => f.t, celda: (f) => String(f.t) },
];
const filas = (pre: string, k: number) => Array.from({ length: k }, (_, i) => ({ n: `${pre}${i}`, v: (i + 1) * 10, t: k - i }));
const nombres = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent);

describe('<TablaBi>', () => {
  it('columnaFila elige el encabezado de fila y alinea a la derecha la primera si es numérica', () => {
    const c: ColumnaBi<F>[] = [{ clave: 'v', titulo: '#', numero: true, celda: (f) => String(f.v) }, { clave: 'n', titulo: 'Tienda', celda: (f) => f.n }];
    render(<TablaBi resumen="x" columnas={c} secciones={[{ clave: 'a', filas: filas('T', 1) }]} claveFila={(f) => f.n} ordenInicial="v" primeras={10} columnaFila="n" />);
    expect(screen.getByRole('rowheader').textContent).toBe('T0');
    expect(screen.getByRole('cell', { name: '10' }).className).toContain('numero');
  });

  it('ordena por la columna inicial (mayor a menor) y alterna con clic, con aria-sort', () => {
    render(<TablaBi resumen="x" columnas={col} secciones={[{ clave: 'a', filas: filas('T', 3) }]} claveFila={(f) => f.n} ordenInicial="v" primeras={10} />);
    expect(nombres()).toEqual(['T2', 'T1', 'T0'].map((p) => expect.stringContaining(p))); // venta 30, 20, 10
    const venta = screen.getByRole('columnheader', { name: /Venta/ });
    expect(venta.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(within(venta).getByRole('button'));
    expect(venta.getAttribute('aria-sort')).toBe('ascending');
    expect(nombres()[0]).toContain('T0');
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Tickets/ })).getByRole('button'));
    expect(nombres()[0]).toContain('T0'); // tickets: T0 tiene 3, el mayor
  });

  it('muestra las primeras N por sección y «Ver todas (N)» despliega el resto', () => {
    render(<TablaBi resumen="x" columnas={col} secciones={[{ clave: 'a', filas: filas('T', 14) }]} claveFila={(f) => f.n} ordenInicial="v" primeras={10} />);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas (14)' }));
    expect(screen.getAllByRole('row')).toHaveLength(15);
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('tabla agrupada: subtotal arriba de cada grupo, orden dentro del grupo y límite por grupo', () => {
    const cab = (t: string) => <tr><th scope="rowgroup">{t}</th><td /><td /></tr>;
    render(
      <TablaBi resumen="x" columnas={col} claveFila={(f) => f.n} ordenInicial="v" primeras={5}
        secciones={[{ clave: 'p', cabecera: cab('Propias'), filas: filas('P', 7) }, { clave: 'f', cabecera: cab('Franquicia'), filas: filas('F', 7) }]} />,
    );
    const textos = nombres();
    expect(textos).toHaveLength(12); // 2 subtotales + 5 + 5
    expect(textos[0]).toBe('Propias');
    expect(textos[6]).toBe('Franquicia');
    expect(textos[1]).toContain('P6'); // la mayor venta del grupo
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Venta/ })).getByRole('button'));
    const despues = nombres();
    expect(despues[0]).toBe('Propias');
    expect(despues[1]).toContain('P0');
    expect(despues[6]).toBe('Franquicia');
    expect(screen.getByRole('button', { name: 'Ver todas (14)' })).toBeTruthy();
  });
});
