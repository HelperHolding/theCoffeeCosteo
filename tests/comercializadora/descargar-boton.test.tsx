// tests/comercializadora/descargar-boton.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DescargarReporte } from '@/components/comercializadora/reporte-semanal/descargar';
import { Descargar } from '@/components/comercializadora/descargar';

const HTML = '/comercializadora/reporte-semanal/descargar?semana=2026-11-16&formato=html';

describe('botón Descargar', () => {
  it('HTML es un enlace directo a la ruta con la semana', () => {
    render(<DescargarReporte semana="2026-11-16" />);
    expect(screen.getByRole('link', { name: 'HTML' }).getAttribute('href')).toBe(HTML);
  });
  it('si el PDF falla, muestra el error y ofrece el HTML', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('No se pudo generar el PDF: crash', { status: 502 })));
    render(<DescargarReporte semana="2026-11-16" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('No se pudo generar el PDF: crash'));
    expect(screen.getByRole('alert').querySelector('a')?.getAttribute('href')).toBe(HTML);
    vi.unstubAllGlobals();
  });
  it('el enlace temporal del PDF se revoca después del clic, no en el mismo instante', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const revocar = vi.fn();
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 })));
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => 'blob:x', revokeObjectURL: revocar }));
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    render(<DescargarReporte semana="2026-11-16" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(clic).toHaveBeenCalled());
    expect(revocar).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1500);
    expect(revocar).toHaveBeenCalledWith('blob:x');
    clic.mockRestore();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });
});

describe('botón Descargar genérico', () => {
  it('agrega formato con & si la base ya trae filtros, o con ? si no', () => {
    const { unmount } = render(<Descargar base="/comercializadora/compras/descargar?periodo=2026-11-16" archivoPdf="compras-2026-11-16-todas.pdf" />);
    expect(screen.getByRole('link', { name: 'HTML' }).getAttribute('href')).toBe('/comercializadora/compras/descargar?periodo=2026-11-16&formato=html');
    unmount();
    render(<Descargar base="/comercializadora/compras/descargar" archivoPdf="compras.pdf" />);
    expect(screen.getByRole('link', { name: 'HTML' }).getAttribute('href')).toBe('/comercializadora/compras/descargar?formato=html');
  });
  it('el PDF se baja con el nombre que le pasan', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(new Blob(['%PDF']), { status: 200 })));
    vi.stubGlobal('URL', Object.assign(Object.create(URL), { createObjectURL: () => 'blob:x', revokeObjectURL: vi.fn() }));
    let nombre = '';
    const clic = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) { nombre = this.download; });
    render(<Descargar base="/comercializadora/compras/descargar?periodo=2026-11-16" archivoPdf="compras-2026-11-16-todas.pdf" />);
    fireEvent.click(screen.getByRole('button', { name: /PDF/ }));
    await waitFor(() => expect(clic).toHaveBeenCalled());
    expect(nombre).toBe('compras-2026-11-16-todas.pdf');
    clic.mockRestore();
    vi.unstubAllGlobals();
  });
});
