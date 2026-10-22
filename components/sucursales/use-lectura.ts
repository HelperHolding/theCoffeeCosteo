'use client';
import { useCallback, useEffect, useRef, useState } from 'react';

export interface ErrorLecturaUi {
  status: number;
  mensaje: string;
}

interface Estado<T> {
  clave: string | null;
  datos: T | null;
  error: ErrorLecturaUi | null;
  cargando: boolean;
  /** Reloj del cliente al recibir la última respuesta válida. */
  recibidoEn: number | null;
}

/**
 * Lectura de un route handler de Sucursales.
 * - Al cambiar la URL (sucursal, filtros, periodo) se vacía el estado: nunca se muestran datos de otra clave.
 * - Las respuestas tardías se descartan por número de petición y AbortController.
 * - Sin solapes: el refresco periódico no lanza otra petición si hay una en vuelo.
 * - El refresco periódico solo corre con la pestaña visible.
 * - Un error conserva el último resultado válido de la MISMA clave (con su antigüedad), salvo
 *   401/403/404, que lo borran.
 */
export function useLectura<T>(url: string | null, { intervaloMs }: { intervaloMs?: number } = {}) {
  const [estado, setEstado] = useState<Estado<T>>({
    clave: url,
    datos: null,
    error: null,
    cargando: !!url,
    recibidoEn: null,
  });
  const seq = useRef(0);
  const enVuelo = useRef<AbortController | null>(null);

  const cargar = useCallback(
    async (forzar = false) => {
      if (!url) return;
      if (enVuelo.current && !forzar) return;
      enVuelo.current?.abort();
      const ctrl = new AbortController();
      enVuelo.current = ctrl;
      const mio = ++seq.current;
      setEstado((e) => (e.clave === url ? { ...e, cargando: true } : e));
      try {
        const destino = forzar ? `${url}${url.includes('?') ? '&' : '?'}fresco=1` : url;
        const res = await fetch(destino, {
          signal: ctrl.signal,
          cache: 'no-store',
          credentials: 'same-origin',
        });
        const cuerpo = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
        if (mio !== seq.current) return;
        if (!res.ok || cuerpo === null) {
          const borrar = res.status === 401 || res.status === 403 || res.status === 404;
          setEstado((e) => ({
            clave: url,
            datos: borrar || e.clave !== url ? null : e.datos,
            recibidoEn: borrar || e.clave !== url ? null : e.recibidoEn,
            cargando: false,
            error: { status: res.status, mensaje: cuerpo?.error ?? 'No se pudo cargar la información.' },
          }));
          return;
        }
        setEstado({ clave: url, datos: cuerpo, error: null, cargando: false, recibidoEn: Date.now() });
      } catch {
        if (mio !== seq.current || ctrl.signal.aborted) return;
        setEstado((e) => ({
          ...e,
          clave: url,
          cargando: false,
          error: { status: 0, mensaje: 'Sin conexión con el portal.' },
        }));
      } finally {
        if (enVuelo.current === ctrl) enVuelo.current = null;
      }
    },
    [url],
  );

  useEffect(() => {
    seq.current++;
    enVuelo.current?.abort();
    enVuelo.current = null;
    setEstado({ clave: url, datos: null, error: null, cargando: !!url, recibidoEn: null });
    void cargar();
    return () => {
      seq.current++;
      enVuelo.current?.abort();
      enVuelo.current = null;
    };
  }, [url, cargar]);

  useEffect(() => {
    if (!intervaloMs || !url) return;
    const visible = () => document.visibilityState === 'visible';
    const id = window.setInterval(() => visible() && void cargar(), intervaloMs);
    const alVolver = () => visible() && void cargar();
    document.addEventListener('visibilitychange', alVolver);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', alVolver);
    };
  }, [url, intervaloMs, cargar]);

  const propio = estado.clave === url;
  return {
    datos: propio ? estado.datos : null,
    error: propio ? estado.error : null,
    cargando: propio ? estado.cargando : true,
    recibidoEn: propio ? estado.recibidoEn : null,
    recargar: () => cargar(true),
  };
}
