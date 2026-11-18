'use client';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';

const useIso = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * Posición del elemento elegido dentro de un contenedor (`position: relative`), para deslizar un indicador
 * (pastilla de Segmentos, subrayado de Pestanas) con transform. Se vuelve a medir al cambiar `clave` o el tamaño.
 * `animar` es falso en la primera medida, para que el indicador aparezca en su lugar y no se deslice desde la orilla.
 */
export function usePastilla<T extends HTMLElement>(selector: string, clave: unknown) {
  const ref = useRef<T>(null);
  const [pos, setPos] = useState<{ x: number; ancho: number } | null>(null);
  const [animar, setAnimar] = useState(false);

  useIso(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const elegido = el.querySelector<HTMLElement>(selector);
      setPos(elegido ? { x: elegido.offsetLeft, ancho: elegido.offsetWidth } : null);
    };
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, [selector, clave]);

  useEffect(() => {
    if (!pos || animar) return;
    const id = requestAnimationFrame(() => setAnimar(true));
    return () => cancelAnimationFrame(id);
  }, [pos, animar]);

  const estilo = pos ? { transform: `translateX(${pos.x}px)`, width: pos.ancho } : undefined;
  return { ref, medido: pos !== null, animar, estilo };
}
