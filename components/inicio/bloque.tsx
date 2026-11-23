import Link from 'next/link';
import { ArrowUpRight, CircleAlert } from 'lucide-react';
import { cn } from 'cn';
import { modulos, type IdModulo } from '@/lib/portal/modulos';
import { ESTILO_MODULO } from '@/components/portal/modulos-ui';
import './inicio.css';

/**
 * Marco de un bloque del dashboard de Inicio: color e ícono del módulo, su nombre y un acceso al módulo. La luz sube
 * desde abajo en el color del módulo (inicio.css, sin borde de color); el texto siempre queda en tinta.
 */
export function Bloque({
  modulo,
  titulo,
  subtitulo,
  href,
  className,
  children,
}: {
  modulo: IdModulo;
  titulo?: string;
  subtitulo?: string;
  href?: string;
  className?: string;
  children: React.ReactNode;
}) {
  const m = modulos.find((x) => x.id === modulo)!;
  const e = ESTILO_MODULO[modulo];
  const Icono = e.icono;
  return (
    <section
      aria-label={titulo ?? m.nombre}
      className={cn(
        'luz-modulo relative flex flex-col overflow-hidden rounded-3xl p-5 shadow-card',
        className,
      )}
      style={{ '--tono': e.tono } as React.CSSProperties}
    >
      <header className="mb-4 flex items-center gap-3">
        <span
          className={cn(
            'grid size-10 shrink-0 place-items-center rounded-2xl text-primary-foreground',
            e.marca,
          )}
        >
          <Icono size={19} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-[1.05rem] leading-tight font-bold">
            {titulo ?? m.nombre}
          </span>
          {subtitulo && <span className="block truncate text-xs text-ink-2">{subtitulo}</span>}
        </span>
        <Link
          href={href ?? m.href}
          className="inline-flex shrink-0 items-center gap-1 rounded-full border border-line-strong bg-surface/70 px-3 py-1.5 text-xs font-semibold text-ink-2 transition-colors hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
        >
          Abrir <ArrowUpRight size={13} aria-hidden="true" />
        </Link>
      </header>
      <div className="flex flex-1 flex-col">{children}</div>
    </section>
  );
}

/** Esqueleto de un bloque mientras su módulo responde (cada bloque carga por su cuenta). */
export function EsqueletoBloque({ modulo, className }: { modulo: IdModulo; className?: string }) {
  const e = ESTILO_MODULO[modulo];
  return (
    <div
      role="status"
      aria-label="Cargando"
      className={cn('luz-modulo rounded-3xl p-5 shadow-card', className)}
      style={{ '--tono': e.tono } as React.CSSProperties}
    >
      <div className="flex items-center gap-3">
        <span className={cn('size-10 rounded-2xl opacity-60', e.marca)} />
        <span className="h-4 w-32 rounded-full bg-surface-2 motion-safe:animate-pulse" />
      </div>
      <div className="mt-6 h-10 w-40 rounded-xl bg-surface-2 motion-safe:animate-pulse" />
      <div className="mt-4 space-y-2">
        <div className="h-3 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-3 w-4/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
        <div className="h-3 w-3/5 rounded-full bg-surface-2 motion-safe:animate-pulse" />
      </div>
    </div>
  );
}

export function FalloBloque({ texto }: { texto: string }) {
  return (
    <p
      role="alert"
      className="flex items-start gap-2 rounded-2xl border border-bad/30 bg-bad-soft p-3 text-sm"
    >
      <CircleAlert size={15} className="mt-0.5 shrink-0 text-bad" aria-hidden="true" /> {texto}
    </p>
  );
}

/** Cifra principal del bloque: número grande y su etiqueta. */
export function Principal({
  valor,
  etiqueta,
  children,
}: {
  valor: string;
  etiqueta: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-4">
      <p className="text-xs font-semibold text-ink-2">{etiqueta}</p>
      <p className="font-display text-[2.4rem] leading-none font-black tracking-tight tabular">{valor}</p>
      {children && (
        <div className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-ink-2">{children}</div>
      )}
    </div>
  );
}

/** Mini cifra en fila (pastilla con número y etiqueta). */
export function Mini({
  valor,
  etiqueta,
  tono,
}: {
  valor: string;
  etiqueta: string;
  tono?: 'bad' | 'warn' | 'ok';
}) {
  return (
    <div
      className={cn(
        'rounded-2xl border border-line/60 bg-surface/35 px-3 py-2',
        tono === 'bad' && 'border-bad/25 bg-bad-soft/60',
        tono === 'warn' && 'border-warn/25 bg-warn-soft/60',
        tono === 'ok' && 'border-ok/25 bg-ok-soft/60',
      )}
    >
      <p className="font-display text-lg leading-tight font-black tabular">{valor}</p>
      <p className="text-[11px] leading-tight text-ink-2">{etiqueta}</p>
    </div>
  );
}
