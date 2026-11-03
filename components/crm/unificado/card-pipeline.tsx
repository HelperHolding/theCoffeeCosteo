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
        {etapa.numero ? `${etapa.numero} · ` : ''}
        {etapa.nombre}
      </span>
      {etapa.provisional && <span className="text-muted-foreground">· provisional</span>}
    </span>
  );
}

export function CardPipelineVista({
  card,
  etapa,
  ahora,
  asa,
  acciones,
  arrastrando,
}: {
  card: CardPipeline;
  etapa: EtapaGeneral;
  ahora?: Date;
  /** Asa de arrastre (Pipeline editable). */
  asa?: React.ReactNode;
  /** Menú «Mover a…» u otras acciones. */
  acciones?: React.ReactNode;
  arrastrando?: boolean;
}) {
  const area = AREAS[etapa.area];
  const Icono = card.tipo === 'franquiciatario' ? UserRound : Store;
  const v = card.vencimiento;
  return (
    <article
      className={cn(
        'relative overflow-hidden rounded-xl border border-line bg-surface py-3 pl-4 pr-3 shadow-card',
        card.liberado && 'ring-1 ring-warn/40',
        arrastrando && 'opacity-60 ring-2 ring-crema/40',
      )}
      aria-label={`${card.tipo === 'franquiciatario' ? 'Franquiciatario' : 'Sucursal'} ${card.nombre}`}
    >
      {/* Barra del área responsable de la etapa: identidad, nunca el único indicador. */}
      <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1" style={{ background: area.color }} />
      <div className="flex items-start gap-2">
        {asa ?? <Icono size={14} aria-hidden="true" className="mt-0.5 shrink-0 text-muted-foreground" />}
        <div className="min-w-0 flex-1">
          <h3 className="text-[13.5px] font-semibold leading-snug">
            <Link href={rutaCard(card)} className="hover:underline focus-visible:underline">
              {card.nombre}
            </Link>
          </h3>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {[card.tipo === 'sucursal' ? card.franquiciatario : null, card.ciudad]
              .filter(Boolean)
              .join(' · ') || 'Sin ciudad'}
          </p>
        </div>
        {card.muestra && (
          <span className="shrink-0 rounded-md bg-surface-2 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            Muestra
          </span>
        )}
        {acciones}
      </div>

      <div className="mt-2.5 space-y-1.5">
        <Candado card={card} etapa={etapa} />
        {v && (
          <p
            className={cn(
              'inline-flex items-center gap-1.5 text-[12px]',
              v.dias < 0 ? 'font-semibold text-bad' : v.dias <= 7 ? 'text-warn' : 'text-muted-foreground',
            )}
          >
            <Clock size={13} aria-hidden="true" className="shrink-0" />
            {textoVencimiento(v)}
          </p>
        )}
      </div>

      <footer className="mt-2.5 flex items-center gap-3 border-t border-line pt-2 text-[11px] text-muted-foreground">
        <span className="inline-flex items-center gap-1" title="Archivos">
          <Paperclip size={12} aria-hidden="true" /> <span className="sr-only">Archivos:</span>
          {card.archivos}
        </span>
        <span className="inline-flex items-center gap-1" title="Notas">
          <StickyNote size={12} aria-hidden="true" /> <span className="sr-only">Notas:</span>
          {card.notas}
        </span>
        {card.ultimo && (
          <span className="ml-auto truncate" title="Último movimiento">
            {card.ultimo.actor} · {cuando(card.ultimo.fecha, ahora)}
          </span>
        )}
      </footer>
    </article>
  );
}
