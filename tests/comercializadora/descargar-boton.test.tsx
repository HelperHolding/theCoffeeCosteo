// tests/comercializadora/descargar-boton.test.tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { DescargarReporte } from '@/components/comercializadora/reporte-semanal/descargar';

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
});
