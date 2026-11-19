'use client';
import { useState, useTransition } from 'react';
import { LoaderCircle, UserRound } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { elegirBarista } from '@/app/(franquiciatarios)/franquiciatarios/acciones';

/**
 * Pantalla de la cuenta de baristas: cada quien toca su nombre antes de registrar. El nombre es declarado (no hay
 * PIN): se guarda en cada registro junto con la cuenta, la hora y el dispositivo.
 */
export function QuienEres({
  companyId,
  nombres,
}: {
  companyId: number;
  nombres: { id: number; nombre: string }[];
}) {
  const [eligiendo, setEligiendo] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  if (nombres.length === 0)
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <p className="font-display text-lg font-bold">Todavía no hay baristas en la lista</p>
        <p className="mt-2 text-sm text-muted-foreground">
          Pide al gerente que agregue tu nombre en «Baristas». Después podrás registrar el checklist.
        </p>
      </div>
    );
  return (
    <section aria-labelledby="quien" className="space-y-4">
      <div>
        <h2 id="quien" className="text-xl">
          ¿Quién eres?
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Toca tu nombre. Todo lo que registres en este dispositivo quedará a tu nombre hasta que cambies de
          persona.
        </p>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {nombres.map((n) => (
          <li key={n.id}>
            <button
              type="button"
              disabled={eligiendo !== null}
              onClick={() => {
                setEligiendo(n.id);
                setError(null);
                iniciar(async () => {
                  try {
                    const r = await elegirBarista(companyId, n.id);
                    if ('error' in r) setError(r.error);
                  } catch {
                    setError('No hay conexión. Intenta de nuevo.');
                  } finally {
                    setEligiendo(null);
                  }
                });
              }}
              className={cn(
                'flex min-h-16 w-full items-center gap-3 rounded-2xl border border-line bg-surface px-4 py-3 text-left font-semibold text-ink shadow-card transition-colors outline-none hover:border-ink/40 focus-visible:ring-[3px] focus-visible:ring-crema/45',
                eligiendo === n.id && 'border-ink',
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 font-display text-base font-bold text-ink">
                {eligiendo === n.id ? (
                  <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
                ) : (
                  n.nombre.slice(0, 1).toUpperCase()
                )}
              </span>
              <span className="min-w-0 break-words">{n.nombre}</span>
            </button>
          </li>
        ))}
      </ul>
      {error && (
        <p role="alert" className="text-sm font-medium text-bad">
          {error}
        </p>
      )}
    </section>
  );
}

/** Franja con el nombre declarado y el botón para cambiar de persona. */
export function NombreDeclarado({ companyId, nombre }: { companyId: number; nombre: string }) {
  const [pendiente, iniciar] = useTransition();
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
      <p className="flex items-center gap-3 text-sm">
        <span className="grid size-9 place-items-center rounded-full bg-crema text-[#111111]">
          <UserRound size={18} aria-hidden="true" />
        </span>
        <span>
          <span className="block font-semibold text-ink">{nombre}</span>
          <span className="text-xs text-muted-foreground">Nombre declarado en este dispositivo</span>
        </span>
      </p>
      <Button
        variant="outline"
        disabled={pendiente}
        onClick={() => iniciar(async () => void (await elegirBarista(companyId, null).catch(() => null)))}
      >
        {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
        Cambiar de persona
      </Button>
    </div>
  );
}
