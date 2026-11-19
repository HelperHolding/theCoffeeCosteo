'use client';
import { useState, useTransition } from 'react';
import { CircleAlert, LoaderCircle, MessageSquareWarning, Pencil } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { corregir } from '@/app/(franquiciatarios)/franquiciatarios/acciones';
import type { FranqAviso } from '@/lib/franquiciatarios/tipos';
import { diaLargo, hora } from './formato';

const SECCION: Record<string, string> = { apertura: 'Apertura', cambio: 'Cambio de turno', cierre: 'Cierre' };

/** «No» vigentes e incidencias, agrupados por día. El gerente o el franquiciatario corrigen un «No» con motivo. */
export function Avisos({ companyId, avisos }: { companyId: number; avisos: FranqAviso[] }) {
  if (avisos.length === 0)
    return (
      <div className="rounded-2xl border border-line bg-surface p-8 text-center shadow-card">
        <p className="font-display text-lg font-bold">Sin «No» ni incidencias en el periodo</p>
        <p className="mt-2 text-sm text-muted-foreground">Todos los puntos respondidos se cumplieron.</p>
      </div>
    );
  const dias = [...new Set(avisos.map((a) => a.dia))];
  return (
    <div className="space-y-6">
      {dias.map((d) => (
        <section
          key={d}
          aria-labelledby={`d-${d}`}
          className="rounded-2xl border border-line bg-surface shadow-card"
        >
          <h2
            id={`d-${d}`}
            className="border-b border-line px-5 py-3 font-display text-base font-bold first-letter:uppercase"
          >
            {diaLargo(d)}
          </h2>
          <ul className="divide-y divide-line">
            {avisos
              .filter((a) => a.dia === d)
              .map((a, i) => (
                <Aviso key={`${a.respuesta_id ?? 'i'}-${i}`} companyId={companyId} a={a} />
              ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Aviso({ companyId, a }: { companyId: number; a: FranqAviso }) {
  const [abierto, setAbierto] = useState(false);
  const [cumple, setCumple] = useState(true);
  const [obs, setObs] = useState(a.observacion ?? '');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const esNo = a.tipo === 'no';
  return (
    <li className="px-5 py-4">
      <div className="flex items-start gap-3">
        <span
          className={`mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg ${esNo ? 'bg-bad-soft text-bad' : 'bg-warn-soft text-warn'}`}
        >
          {esNo ? (
            <CircleAlert size={16} aria-hidden="true" />
          ) : (
            <MessageSquareWarning size={16} aria-hidden="true" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-muted-foreground">
            {esNo ? `«No» en ${SECCION[a.seccion ?? ''] ?? a.seccion}` : 'Incidencia'}
          </p>
          {esNo && <p className="font-medium text-ink">{a.punto}</p>}
          {esNo && <p className="text-xs text-muted-foreground">Estándar: {a.estandar}</p>}
          <p className="mt-1 whitespace-pre-line text-[15px] text-ink-2">
            {esNo ? `«${a.observacion}»` : a.observacion}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {a.nombre} · {hora(a.registrado_en)}
          </p>
        </div>
        {esNo && a.respuesta_id !== null && !abierto && (
          <Button variant="ghost" size="sm" onClick={() => setAbierto(true)}>
            <Pencil aria-hidden="true" /> Corregir
          </Button>
        )}
      </div>
      {abierto && (
        <form
          className="mt-3 space-y-3 rounded-xl border border-line bg-surface-2 p-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            iniciar(async () => {
              try {
                const r = await corregir({
                  companyId,
                  respuesta: a.respuesta_id!,
                  cumple,
                  observacion: cumple ? null : obs,
                  motivo,
                });
                if ('error' in r) setError(r.error);
                else setAbierto(false);
              } catch {
                setError('No se guardó: no hay conexión. Intenta de nuevo.');
              }
            });
          }}
        >
          <fieldset>
            <legend className="text-sm font-medium text-ink">Respuesta correcta</legend>
            <div className="mt-2 flex gap-4 text-sm">
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`c-${a.respuesta_id}`}
                  checked={cumple}
                  onChange={() => setCumple(true)}
                />{' '}
                Sí se cumplió
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`c-${a.respuesta_id}`}
                  checked={!cumple}
                  onChange={() => setCumple(false)}
                />{' '}
                No (cambiar la observación)
              </label>
            </div>
          </fieldset>
          {!cumple && (
            <label className="block text-sm font-medium text-ink">
              Observación
              <textarea
                value={obs}
                onChange={(e) => setObs(e.target.value)}
                rows={2}
                className="mt-1 w-full rounded-xl border border-line-strong bg-surface px-3 py-2 text-[15px] font-normal outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
              />
            </label>
          )}
          <label className="block text-sm font-medium text-ink">
            Motivo de la corrección
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={500}
              placeholder="Queda junto al registro original"
              className="mt-1 h-11 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] font-normal outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
            />
          </label>
          <div className="flex gap-2">
            <Button
              type="submit"
              disabled={pendiente || motivo.trim().length < 3 || (!cumple && obs.trim().length < 3)}
            >
              {pendiente && <LoaderCircle className="animate-spin" aria-hidden="true" />}
              Guardar corrección
            </Button>
            <Button type="button" variant="ghost" onClick={() => setAbierto(false)}>
              Cancelar
            </Button>
          </div>
          {error && (
            <p role="alert" className="text-sm font-medium text-bad">
              {error}
            </p>
          )}
        </form>
      )}
    </li>
  );
}
