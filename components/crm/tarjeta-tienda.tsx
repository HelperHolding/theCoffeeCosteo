'use client';
import Link from 'next/link';
import { useState } from 'react';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  ArrowRightLeft,
  CalendarClock,
  GripVertical,
  ListChecks,
  Paperclip,
  StickyNote,
  TriangleAlert,
} from 'lucide-react';
import { cn } from 'cn';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import type { TarjetaTienda as Datos } from '@/lib/crm/kanban';
import { TIPOS_FRANQUICIA } from '@/lib/crm/tipos';

export type EtapaMenu = { id: string; nombre: string };

const fecha = (s: string) =>
  new Intl.DateTimeFormat('es-MX', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${s}T00:00:00Z`));

/** Menú accesible "Mover a…": la alternativa al arrastre (teclado, lector de pantalla y touch). */
export function MoverA({
  tarjeta,
  etapas,
  alMover,
  deshabilitado,
}: {
  tarjeta: Pick<Datos, 'id' | 'nombre' | 'etapa_id'>;
  etapas: EtapaMenu[];
  alMover: (etapa: string) => void;
  deshabilitado?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger
        disabled={deshabilitado}
        aria-label={`Mover ${tarjeta.nombre} a otra etapa`}
        className="grid size-7 place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink disabled:opacity-40"
      >
        <ArrowRightLeft size={14} aria-hidden="true" />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-1">
        <p className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Mover a…</p>
        <ul role="list">
          {etapas
            .filter((e) => e.id !== tarjeta.etapa_id)
            .map((e) => (
              <li key={e.id}>
                <button
                  type="button"
                  className="w-full rounded-md px-2 py-1.5 text-left text-sm hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:outline-none"
                  onClick={() => {
                    setAbierto(false);
                    alMover(e.id);
                  }}
                >
                  {e.nombre}
                </button>
              </li>
            ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function TarjetaTienda({
  tarjeta,
  etapas,
  editable,
  alMover,
  arrastrando,
}: {
  tarjeta: Datos;
  etapas: EtapaMenu[];
  editable: boolean;
  alMover: (etapa: string) => void;
  arrastrando?: boolean;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } =
    useSortable({
      id: tarjeta.id,
      data: { tipo: 'tarjeta', etapa: tarjeta.etapa_id },
      disabled: !editable,
    });
  const { hechos, total } = tarjeta.checklist;
  const subtitulo = [tarjeta.franquiciatario, tarjeta.ciudad].filter(Boolean).join(' · ');
  return (
    <article
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={cn(
        'group rounded-xl border border-line bg-surface p-3 shadow-card motion-safe:transition-shadow',
        (isDragging || arrastrando) && 'opacity-60 ring-2 ring-crema/40',
      )}
      aria-roledescription="tarjeta de tienda"
    >
      <div className="flex items-start gap-1.5">
        {editable && (
          <button
            ref={setActivatorNodeRef}
            type="button"
            {...attributes}
            {...listeners}
            aria-label={`Arrastrar ${tarjeta.nombre}`}
            className="-ml-1 mt-0.5 grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink active:cursor-grabbing"
          >
            <GripVertical size={14} aria-hidden="true" />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold leading-snug">
            <Link href={`/crm/tiendas/${tarjeta.id}`} className="hover:underline focus-visible:underline">
              {tarjeta.nombre}
            </Link>
          </h3>
          {subtitulo && <p className="mt-0.5 truncate text-xs text-muted-foreground">{subtitulo}</p>}
        </div>
        {editable && <MoverA tarjeta={tarjeta} etapas={etapas} alMover={alMover} />}
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
        {tarjeta.tipo_franquicia && (
          <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-medium text-ink-2">
            {TIPOS_FRANQUICIA[tarjeta.tipo_franquicia]}
          </span>
        )}
        {tarjeta.revisar.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2 py-0.5 text-[11px] font-semibold text-warn">
            <TriangleAlert size={11} aria-hidden="true" /> Revisar
          </span>
        )}
        {tarjeta.fecha_programada_arranque && (
          <span className="text-[11px] text-muted-foreground">
            Arranque {fecha(tarjeta.fecha_programada_arranque)}
          </span>
        )}
      </div>

      {total > 0 && (
        <div className="mt-2.5" aria-label={`Checklist: ${hechos} de ${total}`}>
          <div className="h-1.5 rounded-full bg-surface-2" aria-hidden="true">
            <div className="h-full rounded-full bg-ink" style={{ width: `${(hechos / total) * 100}%` }} />
          </div>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {Math.round((hechos / total) * 100)} % · faltan {total - hechos}
          </p>
        </div>
      )}

      <ul
        className="mt-2.5 flex items-center gap-3 text-[11px] text-muted-foreground"
        aria-label="Contadores"
      >
        <li className="inline-flex items-center gap-1" title="Notas">
          <StickyNote size={12} aria-hidden="true" /> <span className="sr-only">Notas:</span> {tarjeta.notas}
        </li>
        <li className="inline-flex items-center gap-1" title="Archivos">
          <Paperclip size={12} aria-hidden="true" /> <span className="sr-only">Archivos:</span>{' '}
          {tarjeta.archivos}
        </li>
        <li className="inline-flex items-center gap-1" title="Checklist">
          <ListChecks size={12} aria-hidden="true" /> <span className="sr-only">Checklist:</span> {hechos}/
          {total}
        </li>
        <li className="inline-flex items-center gap-1" title="Actividades abiertas">
          <CalendarClock size={12} aria-hidden="true" />{' '}
          <span className="sr-only">Actividades abiertas:</span> {tarjeta.actividadesAbiertas}
        </li>
      </ul>
    </article>
  );
}
