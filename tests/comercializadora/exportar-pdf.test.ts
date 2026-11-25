// tests/comercializadora/exportar-pdf.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { htmlAPdf, opcionesServidor, OPCIONES_PDF } from '@/lib/comercializadora/exportar/pdf';

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
  it('si Chromium falla, cierra, registra el detalle y lanza un mensaje fijo sin datos internos', async () => {
    let cerrado = false;
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const lanzar = async () => ({
      newPage: async () => ({ setContent: async () => { throw new Error('crash en /var/task/bin libnss3.so'); }, pdf: async () => new Uint8Array() }),
      close: async () => { cerrado = true; },
    });
    const e = await htmlAPdf('<p>x</p>', { lanzar }).catch((x: Error) => x);
    expect((e as Error).message).toBe('No se pudo generar el PDF. Baja el HTML.');
    expect(cerrado).toBe(true);
    expect(String(log.mock.calls[0]?.join(' '))).toContain('libnss3.so');
    log.mockRestore();
  });
  it('en servidor lanza Chromium como pide @sparticuz/chromium: headless "shell" con defaultArgs', async () => {
    const llamadas: unknown[] = [];
    const op = await opcionesServidor({ args: ['--a'], executablePath: async () => '/tmp/chromium' },
      async (o) => { llamadas.push(o); return ['--a', '--b']; });
    expect(llamadas).toEqual([{ args: ['--a'], headless: 'shell' }]);
    expect(op).toEqual({ args: ['--a', '--b'], executablePath: '/tmp/chromium', headless: 'shell' });
  });
});
