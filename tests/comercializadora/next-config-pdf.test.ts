// tests/comercializadora/next-config-pdf.test.ts
import { describe, expect, it } from 'vitest';
import config from '../../next.config';

describe('empaquetado de Chromium para el PDF', () => {
  it('la ruta de descarga incluye los binarios comprimidos de @sparticuz/chromium', () => {
    // En Vercel faltó /var/task/node_modules/@sparticuz/chromium/bin: el rastreo de archivos no los incluye solo.
    const incluye = config.outputFileTracingIncludes?.['/comercializadora/reporte-semanal/descargar'] ?? [];
    expect(incluye).toContain('./node_modules/@sparticuz/chromium/bin/**/*');
  });
  it('la descarga del tablero de compras también los incluye', () => {
    const incluye = config.outputFileTracingIncludes?.['/comercializadora/compras/descargar'] ?? [];
    expect(incluye).toContain('./node_modules/@sparticuz/chromium/bin/**/*');
  });
});
