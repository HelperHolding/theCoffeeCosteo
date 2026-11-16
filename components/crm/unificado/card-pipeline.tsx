'use client';
import Link from 'next/link';
import { cn } from 'cn';
import { Lock, LockOpen, CircleCheck, Clock, Paperclip, StickyNote, Store, UserRound } from 'lucide-react';
import {
  AREAS,
  cuando,
  estadoCandado,
  textoVencimiento,
  type CardPipeline,
  type EtapaGeneral,
} from '@/lib/crm/unificado/modelo';
import { Avatar, Chip, Medidor } from '@/components/crm/unificado/piezas';

export const rutaCard = (c: Pick<CardPipeline, 'id' | 'tipo'>) =>
  c.tipo === 'franquiciatario' ? `/crm/franquiciatarios/${c.id}` : `/crm/sucursales/${c.id}`;

/** Estado del candado con ícono y texto: el color solo acompaña. */
export function Candado({
  card,
  etapa,
  compacto,
}: {
  card: Pick<CardPipeline, 'requisitos' | 'liberado'>;
  etapa?: EtapaGeneral;
  compacto?: boolean;
}) {
  const estado = estadoCandado(card, etapa);
  if (estado === 'sin-candado') return null;
  const { listos, total, faltante } = card.requisitos;
  const base = 'inline-flex items-center gap-1.5 text-[12px] leading-tight';
  if (estado === 'lista')
    return (
      <p className={cn(base, 'text-ok')}>
        <CircleCheck size={13} aria-hidden="true" className="shrink-0" />
        <span className="font-semibold">Lista para avanzar</span>
      </p>
    );
  if (estado === 'liberada')
    return (
      <p className={cn(base, 'text-warn')}>
        <LockOpen size={13} aria-hidden="true" className="shrink-0" />
        <span className="font-semibold">Candado liberado</span>
        {!compacto && (
          <span className="text-muted-foreground">
            · {listos}/{total}
          </span>
        )}
      </p>
    );
  return (
    <p className={cn(base, 'text-ink-2')}>
      <Lock size={13} aria-hidden="true" className="shrink-0 text-bad" />
      <span>
        <span className="font-semibold text-bad">Bloqueada</span>{' '}
        <span className="tabular text-muted-foreground">
          {listos}/{total}
        </span>
        {faltante && !compacto && (
          <>
            <span className="text-muted-foreground"> · falta </span>
            {faltante.nombre} <span className="text-muted-foreground">({AREAS[faltante.area].nombre})</span>
          </>
        )}
      </span>
    </p>
  );
}

/** Chip de etapa con el color del área responsable (punto de color, texto en tinta). */
export function ChipEtapa({ etapa, className }: { etapa: EtapaGeneral; className?: string }) {
  const area = AREAS[etapa.area];
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2',
        className,
      )}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: area.color }} />
      <span className="truncate">
        {etapa.numero ? `${etapa.numero} · ` : etapa.paso ? `${etapa.paso} · ` : ''}
        {etapa.nombre}
      </span>
    </span>
  );
}

export function CardPipelineVista({
  card,
  etapa,
  ahora,
  asa,
  acciones,
  origen,
  flotante,
}: {
  card: CardPipeline;
  etapa: EtapaGeneral;
  ahora?: Date;
  /** Asa de arrastre (Pipeline editable). */
  asa?: React.ReactNode;
  /** Menú «Mover a…» u otras acciones. */
  acciones?: React.ReactNode;
  /** La card se está arrastrando: aquí queda su hueco. */
  origen?: boolean;
  /** Copia que sigue al cursor mientras se arrastra. */
  flotante?: boolean;
}) {
  const Icono = card.tipo === 'franquiciatario' ? UserRound : Store;
  const v = card.vencimiento;
  const conCandado = estadoCandado(card, etapa) !== 'sin-candado';
  return (
    <article
      className={cn(
        'tablero-card relative px-3 pb-2.5 pt-3',
        card.liberado && 'ring-1 ring-warn/40',
        flotante && 'tablero-flotante',
      )}
      data-origen={origen || undefined}
      aria-label={`${card.tipo === 'franquiciatario' ? 'Franquiciatario' : 'Sucursal'} ${card.nombre}`}
    >
      <div className="flex items-start gap-1.5">
        {asa ?? (
          <span className="grid size-6 shrink-0 place-items-center text-muted-foreground">
            <Icono size={14} strokeWidth={1.75} aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0 flex-1 pt-0.5">
          <h3 className="line-clamp-2 text-[13.5px] font-semibold leading-snug tracking-[-0.005em] [text-wrap:balance]">
            <Link href={rutaCard(card)} className="hover:underline focus-visible:underline" draggable={false}>
              {card.nombre}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-[12px] text-muted-foreground">
            {[card.tipo === 'sucursal' ? card.franquiciatario : null, card.ciudad]
              .filter(Boolean)
              .join(' · ') || 'Sin ciudad'}
          </p>
        </div>
        {card.muestra && (
          <span className="mt-0.5 shrink-0 rounded-full border border-line-strong/70 px-1.5 py-px text-[10px] font-semibold text-muted-foreground">
            Muestra
          </span>
        )}
        {acciones}
      </div>

      {conCandado && (
        <div className="mt-2.5 space-y-1.5 rounded-[10px] bg-surface-2/60 px-2.5 py-2">
          <Candado card={card} etapa={etapa} compacto />
          <Medidor listos={card.requisitos.listos} total={card.requisitos.total} />
          {card.requisitos.faltante && !card.liberado && (
            <p className="flex min-w-0 items-center gap-1.5 text-[11px] text-ink-2">
              <span className="shrink-0 text-muted-foreground">Falta</span>
              <Chip color={AREAS[card.requisitos.faltante.area].color} className="min-w-0 bg-surface">
                {card.requisitos.faltante.nombre}
              </Chip>
            </p>
          )}
        </div>
      )}
      {v && (
        <p
          className={cn(
            'mt-2 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11.5px]',
            v.dias < 0
              ? 'bg-bad-soft font-semibold text-bad'
              : v.dias <= 7
                ? 'bg-warn-soft text-warn'
                : 'bg-surface-2 text-ink-2',
          )}
        >
          <Clock size={12} strokeWidth={1.75} aria-hidden="true" className="shrink-0" />
          {textoVencimiento(v)}
        </p>
      )}

      <footer className="mt-2.5 flex items-center gap-3 px-0.5 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1 tabular" title="Archivos">
          <Paperclip size={12} strokeWidth={1.75} aria-hidden="true" /> <span className="sr-only">Archivos:</span>
          {card.archivos}
        </span>
        <span className="inline-flex items-center gap-1 tabular" title="Notas">
          <StickyNote size={12} strokeWidth={1.75} aria-hidden="true" /> <span className="sr-only">Notas:</span>
          {card.notas}
        </span>
        {card.ultimo && (
          <span className="ml-auto flex min-w-0 items-center gap-1.5" title="Último movimiento">
            <Avatar nombre={card.ultimo.actor} tam={18} />
            <span className="truncate">{cuando(card.ultimo.fecha, ahora)}</span>
          </span>
        )}
      </footer>
    </article>
  );
}
