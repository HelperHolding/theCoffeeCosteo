'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { ArrowRightLeft, FilePlus2, History, ListChecks, StickyNote } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { agregarNota } from '@/app/(crm)/crm/acciones';
import type { Historial, Nota } from '@/lib/crm/tipos';
import { fechaHora } from '@/lib/crm/formato';

const iconos = {
  etapa: ArrowRightLeft,
  nota: StickyNote,
  checklist: ListChecks,
  archivo: FilePlus2,
} as const;
const origen = { crm: '', importacion: ' · importado de Zoho', zoho: ' · en Zoho' } as const;

/** Notas (con su contenido) y la línea de tiempo del historial, de lo más reciente a lo más antiguo. */
export function ActividadTienda({
  relacion,
  notas,
  historial,
  editable,
  nombres,
}: {
  relacion: { tienda_id?: string; prospecto_id?: string; contacto_id?: string };
  notas: Nota[];
  historial: Historial[];
  editable: boolean;
  nombres: Record<string, string>;
}) {
  const [texto, setTexto] = useState('');
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const autor = (id: string | null) => (id ? (nombres[id] ?? 'Usuario') : 'Sistema');
  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <section
        aria-labelledby="titulo-notas"
        className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
      >
        <h2 id="titulo-notas" className="text-base">
          Notas
        </h2>
        {editable && (
          <form
            className="space-y-2"
            action={() =>
              iniciar(async () => {
                setError('');
                const r = await agregarNota(relacion, texto);
                if (r.error !== undefined) return setError(r.error);
                setTexto('');
                router.refresh();
              })
            }
          >
            <label htmlFor="nueva-nota" className="sr-only">
              Nueva nota
            </label>
            <textarea
              id="nueva-nota"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              rows={3}
              maxLength={10000}
              placeholder="Escribe una nota…"
              className="w-full rounded-[10px] border border-line-strong bg-surface p-3 text-sm shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
            />
            {error && (
              <p role="alert" className="text-sm text-bad">
                {error}
              </p>
            )}
            <div className="flex justify-end">
              <Button type="submit" size="sm" disabled={pendiente || !texto.trim()}>
                {pendiente ? 'Guardando…' : 'Agregar nota'}
              </Button>
            </div>
          </form>
        )}
        {notas.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin notas todavía.</p>
        ) : (
          <ul className="space-y-3">
            {notas.map((n) => (
              <li key={n.id} className="rounded-xl border border-line bg-surface p-4 shadow-card">
                {n.titulo && <p className="mb-1 text-sm font-semibold">{n.titulo}</p>}
                <p className="whitespace-pre-wrap text-sm leading-relaxed">{n.contenido}</p>
                <p className="mt-2 text-xs text-muted-foreground">
                  {n.autor_id || !n.imported_at ? autor(n.autor_id) : 'De Zoho'} ·{' '}
                  {fechaHora(n.zoho_created_at ?? n.creado_en)}
                </p>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section
        aria-labelledby="titulo-historial"
        className="space-y-4 rounded-2xl border border-line bg-surface p-5 shadow-card"
      >
        <h2 id="titulo-historial" className="text-base">
          Historial
        </h2>
        {historial.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin movimientos registrados.</p>
        ) : (
          <ol className="relative space-y-4 border-l border-line pl-5">
            {historial.map((h) => {
              const Icono = iconos[h.accion as keyof typeof iconos] ?? History;
              return (
                <li key={h.id} className="relative">
                  <span className="absolute -left-[29px] grid size-[18px] place-items-center rounded-full border border-line bg-surface text-ink-2">
                    <Icono size={10} aria-hidden="true" />
                  </span>
                  <p className="text-sm">{h.resumen}</p>
                  <p className="text-xs text-muted-foreground">
                    {autor(h.actor_id)} · {fechaHora(h.fecha)}
                    {origen[h.origen]}
                  </p>
                </li>
              );
            })}
          </ol>
        )}
      </section>
    </div>
  );
}
