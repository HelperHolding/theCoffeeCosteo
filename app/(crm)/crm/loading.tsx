/** Esqueleto inmediato mientras llega la pantalla del CRM (navegar no se siente congelado). */
export default function Cargando() {
  const bloque = 'rounded-2xl bg-white/60 motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" aria-label="Cargando" className="space-y-7">
      <div className="space-y-3">
        <div className={`${bloque} h-3 w-32`} />
        <div className={`${bloque} h-8 w-64`} />
        <div className={`${bloque} h-3 w-96 max-w-full`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloque} h-32`} />
        ))}
      </div>
      <div className="flex gap-3 overflow-hidden">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloque} h-72 w-[272px] shrink-0`} />
        ))}
      </div>
      <span className="sr-only">Cargando…</span>
    </div>
  );
}
