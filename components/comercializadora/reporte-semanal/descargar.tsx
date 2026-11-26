// components/comercializadora/reporte-semanal/descargar.tsx
'use client';
import { Descargar } from '@/components/comercializadora/descargar';

/** El Reporte semanal de la semana elegida (spec descargas §4). */
export function DescargarReporte({ semana }: { semana: string }) {
  return <Descargar base={`/comercializadora/reporte-semanal/descargar?semana=${semana}`} archivoPdf={`reporte-ventas-${semana}.pdf`} />;
}
