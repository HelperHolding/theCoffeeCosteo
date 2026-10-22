'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

/** Máximo de sonidos seguidos en un refresco (si entran muchos pedidos juntos). */
export const MAX_SONIDOS = 5;
const SEPARACION_MS = 650;

/**
 * TEMPORAL (pedido por Carlo, 2026-10-22): suena una vez por cada pedido nuevo de hoy.
 * - Desactivado al abrir: el navegador solo permite audio después de un clic, y activarlo lo confirma.
 * - Solo suena por aumentos del conteo dentro del MISMO día; la primera lectura y el cambio de día no suenan.
 * - Una lectura con error (pedidos = null) no cambia la referencia: al recuperarse suena por lo que entró.
 */
export function useSonidoVentas(src: string | null, fecha: string | null, pedidos: number | null) {
  const [activo, setActivo] = useState(false);
  const previo = useRef<{ fecha: string; pedidos: number } | null>(null);
  const timers = useRef<number[]>([]);

  const sonar = useCallback(
    (veces: number) => {
      if (!src) return;
      for (let i = 0; i < Math.min(veces, MAX_SONIDOS); i++) {
        timers.current.push(
          window.setTimeout(() => {
            void new Audio(src).play().catch(() => {});
          }, i * SEPARACION_MS),
        );
      }
    },
    [src],
  );

  useEffect(() => {
    if (fecha === null || pedidos === null) return;
    const p = previo.current;
    previo.current = { fecha, pedidos };
    if (!activo || !p || p.fecha !== fecha) return;
    const nuevos = pedidos - p.pedidos;
    if (nuevos > 0) sonar(nuevos);
  }, [fecha, pedidos, activo, sonar]);

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t));
      timers.current = [];
    },
    [],
  );

  const alternar = () => {
    if (!activo) sonar(1); // el clic habilita el audio y confirma que se oye
    setActivo(!activo);
  };

  return { disponible: src !== null, activo, alternar };
}
