// tests/comercializadora/exportar-pdf.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { htmlAPdf, OPCIONES_PDF } from '@/lib/comercializadora/exportar/pdf';

describe('htmlAPdf', () => {
  it('carga el HTML, imprime carta con márgenes y número de página, y cierra el navegador', async () => {
    const pasos: string[] = [];
    const lanzar = async () => ({
      newPage: async () => ({
        setContent: async (h: string) => { pasos.push(`contenido:${h.length}`); },
        pdf: async (o: object) => { pasos.push(`pdf:${JSON.stringify(o).includes('letter')}`); return new Uint8Array([37, 80, 68, 70]); },
      }),
      close: async () => { pasos.push('cerrado'); },
    });
    const pdf = await htmlAPdf('<p>x</p>', { lanzar });
    expect(Array.from(pdf.slice(0, 4))).toEqual([37, 80, 68, 70]);
    expect(pasos).toEqual(['contenido:8', 'pdf:true', 'cerrado']);
    expect(OPCIONES_PDF.footerTemplate).toContain('pageNumber');
    expect(OPCIONES_PDF.margin).toEqual({ top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' });
  });
  it('si Chromium falla, cierra y lanza un error claro', async () => {
    let cerrado = false;
    const lanzar = async () => ({
      newPage: async () => ({ setContent: async () => { throw new Error('crash'); }, pdf: async () => new Uint8Array() }),
      close: async () => { cerrado = true; },
    });
    await expect(htmlAPdf('<p>x</p>', { lanzar })).rejects.toThrow('No se pudo generar el PDF: crash');
    expect(cerrado).toBe(true);
  });
});
