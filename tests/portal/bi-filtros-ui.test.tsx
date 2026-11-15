import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { FiltrosBi } from '@/components/bi/filtros';
import { SelectorMultiple } from '@/components/bi/selector-multiple';
import { leerUrl } from '@/lib/bi/url';
import type { RpcOpciones } from '@/lib/bi/tipos';

const opciones = {
  tiendas: [{ company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' }],
  franquiciatarios: [], tipos: ['Sucursales Propias'], categorias: ['Fraps'], grupos: ['Bebida'], productos: ['Iced Latte'],
  pagos: ['APP - WALLET'], semanas: ['W45 2026'], ultimo_corte: null, tiendas_sin_rappi: 0,
} as RpcOpciones;

const base = () => leerUrl(new URLSearchParams());

afterEach(() => vi.useRealTimers());

describe('<FiltrosBi>', () => {
  it('muestra los 5 visibles y despliega los 12 con los nombres de Zoho', () => {
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={() => {}} />);
    // Comparable también es una opción del select; las etiquetas se buscan por control.
    for (const n of ['Fecha Relativa', 'Comparable', 'Años Operando', 'Día de la Semana'])
      expect(screen.getByLabelText(n)).toBeTruthy();
    expect(screen.getByText('Rango de Fechas')).toBeTruthy();
    expect(screen.queryByText('Nombre de Tienda')).toBeNull();
    const boton = screen.getByRole('button', { name: /Mostrar más filtros/ });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    for (const n of ['Nombre de Tienda', 'Franquiciatario', 'Franquicia o Sucursales Propias', 'Categoría Master Franchise MX',
      'Comida, Bebida, Combo y Merch', 'Contiene Café', 'Product', 'Método de Pago', 'Hora', 'Estatus de Maduración',
      'Semanas y año'])
      expect(screen.getByLabelText(n)).toBeTruthy();
    expect(screen.getByText('Net Amount (Local)')).toBeTruthy();
  });

  it('Fecha Relativa tiene las 15 opciones y Comparable usa las etiquetas de Zoho', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    expect(screen.getByLabelText('Fecha Relativa').querySelectorAll('option')).toHaveLength(15);
    const comp = screen.getByLabelText('Comparable') as HTMLSelectElement;
    expect([...comp.options].map((o) => o.text)).toEqual(['Todas', 'Comparable', 'No Comparable']);
    fireEvent.change(comp, { target: { value: 'no' } });
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ comparable: false }));
    fireEvent.change(comp, { target: { value: 'si' } });
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ comparable: true }));
    fireEvent.change(comp, { target: { value: '' } });
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ comparable: undefined }));
  });

  it('elegir una Fecha Relativa limpia el rango; Limpiar vuelve a Esta semana', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams('desde=2026-10-01&hasta=2026-10-07&cafe=si'))} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.change(screen.getByLabelText('Fecha Relativa'), { target: { value: 'mes-anterior' } });
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: 'mes-anterior', desde: undefined, hasta: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(leerUrl(new URLSearchParams()));
  });

  it('llenar el rango quita la relativa', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: '2026-10-01' } });
    expect(alCambiar).not.toHaveBeenCalled(); // falta el otro extremo
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-07' } });
    expect(alCambiar).toHaveBeenLastCalledWith(
      expect.objectContaining({ fr: undefined, desde: '2026-10-01', hasta: '2026-10-07' }),
    );
  });

  it('un chip por filtro activo, que se puede quitar', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams('cafe=si&tiendas=384'))} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Nombre de Tienda: Ventura' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ companias: [], cafe: ['Sí'] }));
  });

  it('chips legibles para días y monto', () => {
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams('dias=0&min=10&max=250.5'))} opciones={opciones} alCambiar={() => {}} />);
    expect(screen.getByRole('button', { name: 'Quitar Día de la Semana: Domingo' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Quitar Net Amount (Local): $10 – $250.50' })).toBeTruthy();
  });

  it('el monto se aplica con retraso de 400 ms', () => {
    vi.useFakeTimers();
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar más filtros/ }));
    const min = screen.getByLabelText('Net Amount mínimo');
    expect(min.getAttribute('min')).toBe('0');
    expect(min.getAttribute('step')).toBe('0.01');
    fireEvent.change(min, { target: { value: '15' } });
    act(() => { vi.advanceTimersByTime(399); });
    expect(alCambiar).not.toHaveBeenCalled();
    act(() => { vi.advanceTimersByTime(1); });
    expect(alCambiar).toHaveBeenCalledTimes(1);
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ montoMin: 15 }));
  });

  it('un monto pendiente viaja con el siguiente filtro', () => {
    vi.useFakeTimers();
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar más filtros/ }));
    fireEvent.change(screen.getByLabelText('Net Amount mínimo'), { target: { value: '15' } });
    fireEvent.change(screen.getByLabelText('Fecha Relativa'), { target: { value: 'mes-anterior' } });
    expect(alCambiar).toHaveBeenCalledTimes(1);
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: 'mes-anterior', montoMin: 15 }));
    act(() => { vi.advanceTimersByTime(500); });
    expect(alCambiar).toHaveBeenCalledTimes(1);
  });

  it('Limpiar reinicia los borradores de monto', () => {
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Mostrar más filtros/ }));
    const min = screen.getByLabelText('Net Amount mínimo') as HTMLInputElement;
    fireEvent.change(min, { target: { value: '15' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(min.value).toBe('');
  });
});

describe('<SelectorMultiple>', () => {
  it('muestra Todos / N elegidos, marca casillas y cierra con Escape', () => {
    const alCambiar = vi.fn();
    render(<SelectorMultiple etiqueta="Producto" valores={['a', 'b']} elegidos={['a']} alCambiar={alCambiar} buscar />);
    const boton = screen.getByLabelText('Producto');
    expect(boton.textContent).toContain('1 elegidos');
    fireEvent.click(boton);
    expect(boton.getAttribute('aria-expanded')).toBe('true');
    fireEvent.click(screen.getByLabelText('b'));
    expect(alCambiar).toHaveBeenLastCalledWith(['a', 'b']);
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'b' } });
    expect(screen.queryByLabelText('a')).toBeNull();
    fireEvent.keyDown(boton, { key: 'Escape' });
    expect(boton.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(boton);
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('');
  });

  it('cierra con clic fuera', () => {
    render(<SelectorMultiple etiqueta="X" valores={['a']} elegidos={[]} alCambiar={() => {}} />);
    const boton = screen.getByLabelText('X');
    expect(boton.textContent).toContain('Todos');
    fireEvent.click(boton);
    fireEvent.mouseDown(document.body);
    expect(boton.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('<FiltrosBi> periodo inválido', () => {
  const escribir = (desde: string, hasta: string) => {
    fireEvent.change(screen.getByLabelText('Desde'), { target: { value: desde } });
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: hasta } });
  };

  it('desde mayor que hasta: mensaje junto al filtro y no llama a alCambiar', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    escribir('2026-10-10', '2026-10-01');
    expect(alCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/periodo no es válido/i);
  });

  it('más de 1,100 días: mensaje y no llama a alCambiar', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    escribir('2023-01-01', '2026-10-01');
    expect(alCambiar).not.toHaveBeenCalled();
    expect(screen.getByRole('alert').textContent).toMatch(/1,100 días/);
  });

  it('al corregir el rango el mensaje desaparece y se aplica', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={base()} opciones={opciones} alCambiar={alCambiar} />);
    escribir('2026-10-10', '2026-10-01');
    fireEvent.change(screen.getByLabelText('Hasta'), { target: { value: '2026-10-12' } });
    expect(screen.queryByRole('alert')).toBeNull();
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ desde: '2026-10-10', hasta: '2026-10-12' }));
  });
});
