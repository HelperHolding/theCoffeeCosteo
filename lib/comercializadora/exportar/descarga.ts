// lib/comercializadora/exportar/descarga.ts
import { semanaDeUrl } from '@/lib/comercializadora/reporteSemanal';

export type Formato = 'html' | 'pdf';

export function parametrosDescarga(url: string, hoy: string): { semana: string; formato: Formato } {
  const p = new URL(url).searchParams;
  return { semana: semanaDeUrl(p.get('semana'), hoy), formato: p.get('formato') === 'pdf' ? 'pdf' : 'html' };
}

export function respuestaArchivo(cuerpo: string | Uint8Array, nombre: string, formato: Formato): Response {
  return new Response(cuerpo as BodyInit, {
    headers: {
      'Content-Type': formato === 'pdf' ? 'application/pdf' : 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="${nombre}"`,
      'Cache-Control': 'no-store',
    },
  });
}

export const respuestaError = (estado: 401 | 403 | 409 | 500 | 502, mensaje: string) =>
  new Response(mensaje, { status: estado, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } });
