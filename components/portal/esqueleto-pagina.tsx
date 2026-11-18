/**
 * Esqueleto inmediato mientras llega una pantalla (Costeo, BI): encabezado, fila de tarjetas y un bloque grande con la
 * forma de una tabla o gráfica. Así navegar no se siente congelado mientras el servidor consulta.
 */
export function EsqueletoPagina({ tarjetas = 4 }: { tarjetas?: number }) {
  const bloque = 'rounded-2xl bg-white/60 motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" aria-label="Cargando" className="space-y-7">
      <div className="space-y-3">
        <div className={`${bloque} h-3 w-32`} />
        <div className={`${bloque} h-8 w-64`} />
        <div className={`${bloque} h-3 w-96 max-w-full`} />
      </div>
      {tarjetas > 0 && (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: tarjetas }, (_, i) => (
            <div key={i} className={`${bloque} h-32`} />
          ))}
        </div>
      )}
      <div className={`${bloque} h-96`} />
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
