import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FiltrosBi } from '@/components/bi/filtros';
import { leerUrl } from '@/lib/bi/url';
import type { RpcOpciones } from '@/lib/bi/tipos';

const opciones = {
  tiendas: [{ company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' }],
  franquiciatarios: [], tipos: ['Sucursales Propias'], categorias: ['Fraps'], grupos: ['Bebida'], productos: ['Iced Latte'],
  pagos: ['APP - WALLET'], semanas: ['W45 2026'], ultimo_corte: null, tiendas_sin_rappi: 0,
} as RpcOpciones;
const url = (q = '') => leerUrl(new URLSearchParams(q));
const pildora = (nombre: RegExp | string) => screen.getByRole('button', { name: nombre });
const pintar = (q = '', alCambiar = vi.fn()) => {
  render(<FiltrosBi filtros={url(q)} opciones={opciones} alCambiar={alCambiar} />);
  return alCambiar;
};

describe('<FiltrosBi> en píldoras', () => {
  it('5 píldoras visibles y «Más filtros» despliega las 12 restantes', () => {
    pintar();
    for (const n of [/^Esta semana/, /^Comparable/, /^Años Operando/, /^Rango de Fechas/, /^Día de la Semana/]) expect(pildora(n)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Nombre de Tienda/ })).toBeNull();
    const mas = pildora(/^Más filtros/);
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mas);
    for (const n of ['Nombre de Tienda', 'Franquiciatario', 'Franquicia o Sucursales Propias', 'Categoría Master Franchise MX',
      'Comida, Bebida, Combo y Merch', 'Contiene Café', 'Product', 'Método de Pago', 'Hora', 'Estatus de Maduración',
      'Net Amount (Local)', 'Semanas y año'])
      expect(pildora(new RegExp(`^${n.replace(/[()]/g, '\\$&')}`))).toBeTruthy();
  });

  it('«Más filtros» cuenta los activos escondidos aunque esté cerrado', () => {
    pintar('cafe=si&tiendas=384');
    expect(pildora(/^Más filtros · 2 activos/)).toBeTruthy();
  });

  it('Fecha Relativa: 15 opciones, aplica al elegir y limpia el rango', () => {
    const alCambiar = pintar('desde=2026-10-01&hasta=2026-10-07');
    fireEvent.click(pildora(/^2026-10-01 – 2026-10-07|^Fecha Relativa/));
    const dialogo = screen.getByRole('dialog', { name: 'Fecha Relativa' });
    expect(within(dialogo).getAllByRole('option')).toHaveLength(15);
    fireEvent.click(within(dialogo).getByRole('option', { name: 'Mes anterior' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: 'mes-anterior', desde: undefined, hasta: undefined }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Comparable con etiquetas de Zoho', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Comparable/));
    const d = screen.getByRole('dialog', { name: 'Comparable' });
    expect(within(d).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Comparable', 'No Comparable']);
    fireEvent.click(within(d).getByRole('option', { name: 'No Comparable' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ comparable: false }));
  });

  it('píldora activa: rellena con valor y ✕ que lo quita', () => {
    const alCambiar = pintar('tiendas=384&cafe=si');
    fireEvent.click(pildora(/^Más filtros/));
    expect(pildora(/^Nombre de Tienda: Ventura/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Nombre de Tienda: Ventura' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ companias: [], cafe: ['Sí'] }));
  });

  it('varios valores se resumen: «Día de la Semana: 2»', () => {
    pintar('dias=0,1');
    expect(pildora(/^Día de la Semana: 2/)).toBeTruthy();
  });

  it('lista múltiple: casillas, búsqueda, Escape cierra y regresa el foco a la píldora', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Más filtros/));
    const p = pildora(/^Product/);
    fireEvent.click(p);
    expect(p.getAttribute('aria-expanded')).toBe('true');
    const d = screen.getByRole('dialog', { name: 'Product' });
    fireEvent.click(within(d).getByLabelText('Iced Latte'));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ productos: ['Iced Latte'] }));
    fireEvent.keyDown(within(d).getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(p);
  });

  it('clic fuera cierra el recuadro', () => {
    pintar();
    fireEvent.click(pildora(/^Comparable/));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Rango de Fechas: Aplicar valida; error dentro del recuadro; correcto aplica y quita la relativa', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Rango de Fechas/));
    const d = screen.getByRole('dialog', { name: 'Rango de Fechas' });
    fireEvent.change(within(d).getByLabelText('Desde'), { target: { value: '2026-10-10' } });
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).not.toHaveBeenCalled();
    expect(within(d).getByRole('alert').textContent).toMatch(/periodo no es válido/i);
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-12' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: undefined, desde: '2026-10-10', hasta: '2026-10-12' }));
  });

  it('más de 1,100 días: mensaje y no aplica', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Rango de Fechas/));
    const d = screen.getByRole('dialog', { name: 'Rango de Fechas' });
    fireEvent.change(within(d).getByLabelText('Desde'), { target: { value: '2023-01-01' } });
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).not.toHaveBeenCalled();
    expect(within(d).getByRole('alert').textContent).toMatch(/1,100 días/);
  });

  it('Net Amount: Aplicar con mínimo y máximo; la píldora lo resume', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Más filtros/));
    fireEvent.click(pildora(/^Net Amount \(Local\)/));
    const d = screen.getByRole('dialog', { name: 'Net Amount (Local)' });
    const min = within(d).getByLabelText('Net Amount mínimo');
    expect(min.getAttribute('min')).toBe('0');
    expect(min.getAttribute('step')).toBe('0.01');
    fireEvent.change(min, { target: { value: '10' } });
    fireEvent.change(within(d).getByLabelText('Net Amount máximo'), { target: { value: '250.5' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ montoMin: 10, montoMax: 250.5 }));
  });

  it('Limpiar solo aparece con algo activo y regresa a Esta semana', () => {
    pintar();
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
    document.body.innerHTML = '';
    const alCambiar = pintar('cafe=si&fr=mes-anterior');
    fireEvent.click(pildora('Limpiar'));
    expect(alCambiar).toHaveBeenLastCalledWith(url());
  });

  it('✕ de todas las píldoras dice «Quitar <filtro>: <valor>»', () => {
    pintar('comp=no&min=10&max=20&desde=2026-10-01&hasta=2026-10-07');
    fireEvent.click(pildora(/^Más filtros/));
    for (const n of [
      'Quitar Comparable: No Comparable',
      'Quitar Net Amount (Local): $10 – $20',
      'Quitar Rango de Fechas: 2026-10-01 – 2026-10-07',
      'Quitar Fecha Relativa: 2026-10-01 – 2026-10-07',
    ])
      expect(screen.getByRole('button', { name: n })).toBeTruthy();
  });

  it('cambiar una fecha limpia el error del rango', () => {
    pintar();
    fireEvent.click(pildora(/^Rango de Fechas/));
    const d = screen.getByRole('dialog', { name: 'Rango de Fechas' });
    fireEvent.change(within(d).getByLabelText('Desde'), { target: { value: '2026-10-10' } });
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(within(d).getByRole('alert')).toBeTruthy();
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-12' } });
    expect(within(d).queryByRole('alert')).toBeNull();
  });

  it('ya no hay fila de chips', () => {
    pintar('cafe=si');
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).toBeNull();
  });
});
