'use client';
import { useState, useTransition } from 'react';
import { LoaderCircle, MessageSquareWarning } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { registrarIncidencia } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { Dia } from '@/lib/franquiciatarios/dia';
import { hora } from './formato';
import { Franja } from './colores';

/** Incidencias y pendientes del día: texto libre con nombre y hora. No se editan ni se borran. */
export function Incidencias({
  companyId,
  incidencias,
  editable,
}: {
  companyId: number;
  incidencias: Dia['incidencias'];
  editable: boolean;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  return (
    <section
      aria-labelledby="incidencias"
      className="rounded-2xl border border-incidencia/40 bg-linear-to-t from-incidencia/25 via-incidencia/8 via-45% to-surface p-4 shadow-card sm:p-5"
    >
      <div className="flex items-start gap-3">
        <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-incidencia text-primary-foreground">
          <MessageSquareWarning size={18} aria-hidden="true" />
        </span>
        <div>
          <h2 id="incidencias" className="text-lg">
            Incidencias y pendientes del día
          </h2>
          <p className="mt-0.5 text-sm text-ink-2">Lo que el gerente y el siguiente turno deben saber.</p>
        </div>
      </div>
      {editable && (
        <form
          className="mt-4 space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            iniciar(async () => {
              try {
                if (navigator.onLine === false) throw new Error();
                const r = await registrarIncidencia(companyId, texto);
                if ('error' in r) setError(r.error);
                else setTexto('');
              } catch {
                setError('No se guardó: no hay conexión. El texto sigue aquí; reintenta.');
              }
            });
          }}
        >
          <label className="sr-only" htmlFor="nueva-incidencia">
            Nueva incidencia
          </label>
          <textarea
            id="nueva-incidencia"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Ej.: se terminó la leche de avena; se pidió a la comercializadora"
            className="w-full rounded-xl border border-line-strong bg-surface px-3 py-2.5 text-[15px] text-ink outline-none placeholder:text-muted-foreground focus-visible:ring-[3px] focus-visible:ring-crema/35"
          />
          <Button size="lg" type="submit" disabled={pendiente || texto.trim().length < 3}>
            {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
            Registrar incidencia
          </Button>
          {error && (
            <p role="alert" className="text-sm font-medium text-bad">
              {error}
            </p>
          )}
        </form>
      )}
      {incidencias.length === 0 ? (
        <p className="mt-4 text-sm text-ink-2">Sin incidencias registradas.</p>
      ) : (
        <ul className="mt-4 space-y-2">
          {incidencias.map((i) => (
            <li key={i.id} className="relative overflow-hidden rounded-xl bg-surface px-4 py-3 pl-5">
              <Franja tono="incidencia" />
              <p className="whitespace-pre-line text-[15px] text-ink">{i.texto}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {i.nombre} · {hora(i.registrado_en)}
              </p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
