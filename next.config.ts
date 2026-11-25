import type { NextConfig } from 'next';
const config: NextConfig = {
  poweredByHeader: false,
  // El PDF lanza @sparticuz/chromium: sus binarios comprimidos (bin/*.br) no entran solos al paquete de la función.
  outputFileTracingIncludes: {
    '/comercializadora/reporte-semanal/descargar': ['./node_modules/@sparticuz/chromium/bin/**/*'],
  },
};
export default config;
