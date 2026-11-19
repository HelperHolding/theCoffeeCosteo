'use client';
import { useState, useTransition } from 'react';
import { LoaderCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { registrarIncidencia } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { Dia } from '@/lib/franquiciatarios/dia';
import { hora } from './formato';

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
    <section aria-labelledby="incidencias" className="rounded-2xl border border-line bg-surface p-4 shadow-card sm:p-5">
      <h2 id="incidencias" className="text-lg">
        Incidencias y pendientes del día
      </h2>
      <p className="mt-1 text-sm text-muted-foreground">Lo que el gerente y el siguiente turno deben saber.</p>
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
        <p className="mt-4 text-sm text-muted-foreground">Sin incidencias registradas.</p>
      ) : (
        <ul className="mt-4 divide-y divide-line">
          {incidencias.map((i) => (
            <li key={i.id} className="py-3">
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
