'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { Plus } from 'lucide-react';
import { cn } from 'cn';
import { Button } from '@/components/ui/button';
import { cambiarEstadoActividad, crearActividad } from '@/app/(crm)/crm/acciones';
import { ESTADOS_ACTIVIDAD, PRIORIDADES, type Actividad } from '@/lib/crm/tipos';
import { claseCampo } from '@/lib/crm/formato';
import { fechaCorta, vencida } from '@/lib/crm/formato';

export function EstadoActividad({ actividad, editable }: { actividad: Actividad; editable: boolean }) {
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (!editable) return <span className="text-sm">{ESTADOS_ACTIVIDAD[actividad.estado]}</span>;
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <label className="sr-only" htmlFor={`estado-${actividad.id}`}>
        Estado de {actividad.asunto}
      </label>
      <select
        id={`estado-${actividad.id}`}
        value={actividad.estado}
        disabled={pendiente}
        onChange={(e) =>
          iniciar(async () => {
            setError('');
            const r = await cambiarEstadoActividad(actividad.id, actividad.version, e.target.value);
            if (r.error !== undefined) return setError(r.error);
            router.refresh();
          })
        }
        className="h-8 rounded-lg border border-line-strong bg-surface px-2 text-xs"
      >
        {Object.entries(ESTADOS_ACTIVIDAD).map(([v, n]) => (
          <option key={v} value={v}>
            {n}
          </option>
        ))}
      </select>
      {error && (
        <span role="alert" className="text-xs text-bad">
          {error}
        </span>
      )}
    </span>
  );
}

export function ActividadesTienda({
  tienda,
  actividades,
  editable,
}: {
  tienda: string;
  actividades: Actividad[];
  editable: boolean;
}) {
  const [nueva, setNueva] = useState(false);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const abiertas = actividades.filter((a) => a.estado !== 'Completed');
  const cerradas = actividades.filter((a) => a.estado === 'Completed');
  const lista = (titulo: string, filas: Actividad[]) => (
    <section className="space-y-2">
      <h3 className="text-sm font-semibold text-ink-2">
        {titulo} ({filas.length})
      </h3>
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ninguna.</p>
      ) : (
        <ul className="divide-y divide-line rounded-2xl border border-line bg-surface shadow-card">
          {filas.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-medium">{a.asunto}</p>
                <p className={cn('text-xs', vencida(a) ? 'font-semibold text-bad' : 'text-muted-foreground')}>
                  {a.fecha_vencimiento ? `Vence ${fechaCorta(a.fecha_vencimiento)}` : 'Sin fecha'}
                  {vencida(a) && ' · vencida'}
                  {a.prioridad && ` · Prioridad ${PRIORIDADES[a.prioridad].toLowerCase()}`}
                </p>
              </div>
              <EstadoActividad actividad={a} editable={editable} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
  return (
    <div className="space-y-6 rounded-2xl border border-line bg-surface p-5 shadow-card">
      {editable &&
        (nueva ? (
          <form
            className="grid gap-3 rounded-2xl border border-line bg-surface p-4 shadow-card sm:grid-cols-[minmax(0,1fr)_auto_auto_auto]"
            action={(form) =>
              iniciar(async () => {
                setError('');
                const r = await crearActividad({ tienda_id: tienda }, Object.fromEntries(form));
                if (r.error !== undefined) return setError(r.error);
                setNueva(false);
                router.refresh();
              })
            }
          >
            <label className="sr-only" htmlFor="actividad-asunto">
              Asunto
            </label>
            <input
              id="actividad-asunto"
              name="asunto"
              required
              maxLength={300}
              placeholder="Asunto"
              className={claseCampo}
            />
            <label className="sr-only" htmlFor="actividad-fecha">
              Fecha de vencimiento
            </label>
            <input id="actividad-fecha" name="fecha_vencimiento" type="date" className={claseCampo} />
            <label className="sr-only" htmlFor="actividad-prioridad">
              Prioridad
            </label>
            <select id="actividad-prioridad" name="prioridad" defaultValue="Normal" className={claseCampo}>
              {Object.entries(PRIORIDADES).map(([v, n]) => (
                <option key={v} value={v}>
                  {n}
                </option>
              ))}
            </select>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setNueva(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={pendiente}>
                Guardar
              </Button>
            </div>
            {error && (
              <p role="alert" className="text-sm text-bad sm:col-span-4">
                {error}
              </p>
            )}
          </form>
        ) : (
          <Button variant="outline" onClick={() => setNueva(true)}>
            <Plus aria-hidden="true" /> Nueva actividad
          </Button>
        ))}
      {lista('Abiertas', abiertas)}
      {lista('Completadas', cerradas)}
    </div>
  );
}
