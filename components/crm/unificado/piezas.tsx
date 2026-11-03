import Link from 'next/link';
import { cn } from 'cn';
import { ChevronRight } from 'lucide-react';
import { AREAS, type EtapaGeneral } from '@/lib/crm/unificado/modelo';
import type { ClaveArea } from '@/lib/crm/tipos';

// Piezas visuales del CRM (rediseño 2026-11-03). Sin estado: sirven en el servidor y en el arnés.
// Color por entidad (área) dentro de los objetos; el texto siempre en tinta; los estados (ok/warn/bad)
// solo para candados y vencimientos, con ícono o texto, nunca color solo.

export const iniciales = (nombre: string | null | undefined) =>
  (nombre ?? '?')
    .replace(/[^\p{L}\p{N} ]/gu, ' ')
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p[0]?.toLocaleUpperCase('es') ?? '')
    .join('') || '?';

/** Círculo con iniciales; el aro y el tinte toman el color del área si la hay. */
export function Avatar({
  nombre,
  area,
  tam = 28,
  className,
}: {
  nombre: string | null | undefined;
  area?: ClaveArea | null;
  tam?: number;
  className?: string;
}) {
  const color = area && AREAS[area] ? AREAS[area].color : null;
  return (
    <span
      aria-hidden="true"
      className={cn('grid shrink-0 place-items-center rounded-full font-semibold text-ink', className)}
      style={{
        width: tam,
        height: tam,
        fontSize: Math.round(tam * 0.38),
        background: color ? `${color}24` : 'var(--color-surface-2)',
        boxShadow: color ? `inset 0 0 0 1.5px ${color}` : 'inset 0 0 0 1px var(--color-line-strong)',
      }}
    >
      {iniciales(nombre)}
    </span>
  );
}

/** Recuadro de sección: título, contador, acción opcional y cuerpo. */
export function Seccion({
  titulo,
  descripcion,
  contador,
  accion,
  children,
  className,
  cuerpo = true,
}: {
  titulo: React.ReactNode;
  descripcion?: React.ReactNode;
  contador?: number | string;
  accion?: { href: string; texto: string };
  children: React.ReactNode;
  className?: string;
  cuerpo?: boolean;
}) {
  return (
    <section
      className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-card', className)}
    >
      <header className="flex items-start gap-3 px-5 pb-3 pt-4">
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2">
            {titulo}
            {contador !== undefined && (
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs font-semibold tabular text-ink-2">
                {typeof contador === 'number' ? contador.toLocaleString('es-MX') : contador}
              </span>
            )}
          </h2>
          {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {accion && (
          <Link
            href={accion.href}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs font-semibold text-crema-strong hover:underline"
          >
            {accion.texto}
            <ChevronRight size={13} aria-hidden="true" />
          </Link>
        )}
      </header>
      <div className={cn('min-w-0 flex-1', cuerpo && 'px-5 pb-5')}>{children}</div>
    </section>
  );
}

type Tono = 'ok' | 'warn' | 'bad';
const PUNTO: Record<Tono, string> = { ok: 'bg-ok', warn: 'bg-warn', bad: 'bg-bad' };

/** Cifras clave en un solo recuadro dividido por líneas finas (no N tarjetas iguales). */
export function PanelCifras({
  cifras,
}: {
  cifras: { etiqueta: string; valor: number | string; nota?: string; tono?: Tono; href?: string }[];
}) {
  return (
    <section
      aria-label="Cifras clave"
      className="grid grid-cols-2 overflow-hidden rounded-2xl border border-line bg-surface shadow-card lg:grid-cols-4"
    >
      {cifras.map((c, i) => {
        const cuerpo = (
          <>
            <p className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
              {c.tono && <span aria-hidden="true" className={cn('size-2 rounded-full', PUNTO[c.tono])} />}
              {c.etiqueta}
            </p>
            <p className="mt-1.5 font-display text-[1.9rem] font-black leading-none tracking-tight tabular">
              {typeof c.valor === 'number' ? c.valor.toLocaleString('es-MX') : c.valor}
            </p>
            {c.nota && <p className="mt-1.5 text-[11px] text-muted-foreground">{c.nota}</p>}
          </>
        );
        const clase = cn(
          'block min-w-0 px-5 py-4',
          i % 2 === 1 && 'border-l border-line',
          i >= 2 && 'border-t border-line lg:border-t-0',
          i >= 1 && 'lg:border-l',
          c.href && 'transition-colors hover:bg-surface-2/60',
        );
        return c.href ? (
          <Link key={c.etiqueta} href={c.href} className={clase}>
            {cuerpo}
          </Link>
        ) : (
          <div key={c.etiqueta} className={clase}>
            {cuerpo}
          </div>
        );
      })}
    </section>
  );
}

/** Barra apilada horizontal con leyenda: proporciones con hueco de 2 px entre segmentos. */
export function BarraSegmentada({
  segmentos,
  alto = 12,
  etiqueta,
}: {
  segmentos: { etiqueta: string; valor: number; color: string }[];
  alto?: number;
  etiqueta: string;
}) {
  const total = segmentos.reduce((n, s) => n + s.valor, 0);
  return (
    <figure className="space-y-3">
      <div
        className="flex w-full gap-[2px] overflow-hidden rounded-full bg-surface-2"
        style={{ height: alto }}
        role="img"
        aria-label={`${etiqueta}: ${segmentos.map((s) => `${s.etiqueta} ${s.valor}`).join(', ')}`}
      >
        {total > 0 &&
          segmentos
            .filter((s) => s.valor > 0)
            .map((s) => (
              <span
                key={s.etiqueta}
                className="h-full first:rounded-l-full last:rounded-r-full"
                style={{ width: `${(s.valor / total) * 100}%`, minWidth: 4, background: s.color }}
                title={`${s.etiqueta}: ${s.valor.toLocaleString('es-MX')}`}
              />
            ))}
      </div>
      <figcaption>
        <ul role="list" className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs">
          {segmentos.map((s) => (
            <li key={s.etiqueta} className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="text-ink-2">{s.etiqueta}</span>
              <span className="font-semibold tabular">{s.valor.toLocaleString('es-MX')}</span>
            </li>
          ))}
        </ul>
      </figcaption>
    </figure>
  );
}

/** Avance de requisitos: un bloque por requisito (lleno = listo). */
export function Medidor({ listos, total, tono }: { listos: number; total: number; tono?: Tono }) {
  if (!total) return null;
  const color = tono === 'bad' ? 'bg-bad' : tono === 'warn' ? 'bg-warn' : 'bg-ok';
  return (
    <span className="flex gap-[3px]" role="img" aria-label={`${listos} de ${total} requisitos listos`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={cn('h-1.5 flex-1 rounded-full', i < listos ? color : 'bg-line')} />
      ))}
    </span>
  );
}

const MES = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' });
const DIA_SEMANA = new Intl.DateTimeFormat('es-MX', { weekday: 'short', timeZone: 'UTC' });

/** Ficha de calendario: día grande, mes y día de la semana. */
export function FichaFecha({ fecha, tono }: { fecha: string; tono?: Tono }) {
  const d = new Date(`${fecha.slice(0, 10)}T00:00:00Z`);
  return (
    <span
      className={cn(
        'grid w-12 shrink-0 overflow-hidden rounded-xl border text-center leading-none',
        tono === 'bad' ? 'border-bad/40' : tono === 'warn' ? 'border-warn/40' : 'border-line-strong',
      )}
    >
      <span
        className={cn(
          'py-1 text-[10px] font-semibold uppercase tracking-wide',
          tono === 'bad'
            ? 'bg-bad-soft text-bad'
            : tono === 'warn'
              ? 'bg-warn-soft text-warn'
              : 'bg-surface-2 text-ink-2',
        )}
      >
        {MES.format(d).replace('.', '')}
      </span>
      <span className="bg-surface py-1">
        <span className="block font-display text-lg font-black tabular">{d.getUTCDate()}</span>
        <span className="block pt-0.5 text-[10px] text-muted-foreground">
          {DIA_SEMANA.format(d).replace('.', '')}
        </span>
      </span>
    </span>
  );
}

/** Etiqueta con punto de color (área u otra entidad); el texto en tinta. */
export function Chip({
  children,
  color,
  className,
}: {
  children: React.ReactNode;
  color?: string;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex max-w-full items-center gap-1.5 rounded-full border border-line bg-surface px-2 py-0.5 text-[11px] font-medium text-ink-2',
        className,
      )}
    >
      {color && (
        <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ background: color }} />
      )}
      <span className="truncate">{children}</span>
    </span>
  );
}

/** Segmento de filtro (enlaces): la opción activa en tinta. */
export function Segmentos({
  opciones,
  activo,
  etiqueta,
}: {
  opciones: { valor: string; texto: string; href: string; contador?: number }[];
  activo: string;
  etiqueta: string;
}) {
  return (
    <nav
      aria-label={etiqueta}
      className="flex gap-1 overflow-x-auto rounded-xl border border-line bg-surface p-1 shadow-card"
    >
      {opciones.map((o) => (
        <Link
          key={o.valor}
          href={o.href}
          aria-current={o.valor === activo ? 'page' : undefined}
          className={cn(
            'inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
            o.valor === activo ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2',
          )}
        >
          {o.texto}
          {o.contador !== undefined && (
            <span
              className={cn(
                'tabular text-xs',
                o.valor === activo ? 'text-white/70' : 'text-muted-foreground',
              )}
            >
              {o.contador.toLocaleString('es-MX')}
            </span>
          )}
        </Link>
      ))}
    </nav>
  );
}

/** Estado vacío dentro de un recuadro: conserva el marco y dice qué hacer. */
export function VacioBreve({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-xl border border-dashed border-line-strong px-4 py-6 text-center text-sm text-muted-foreground">
      {children}
    </p>
  );
}

/**
 * Recorrido de la card por las etapas numeradas de su tipo (1–5 franquiciatario, 6–10 sucursal).
 * Hechas = punto lleno en tinta; actual = aro del color del área; Proyectos (provisional) entre la 8 y la 9.
 */
export function RecorridoEtapas({
  etapas,
  actual,
  tipo,
}: {
  etapas: EtapaGeneral[];
  actual: EtapaGeneral;
  tipo: 'franquiciatario' | 'sucursal';
}) {
  const numeradas = etapas
    .filter((e) => e.numero && e.tipo === 'abierta' && e.card === tipo)
    .sort((a, b) => a.orden - b.orden);
  const nodos: { clave: string; numero: string; nombre: string; area: ClaveArea; ref: number }[] =
    numeradas.map((e) => ({
      clave: e.clave,
      numero: String(e.numero),
      nombre: e.nombre,
      area: e.area,
      ref: e.numero!,
    }));
  if (tipo === 'sucursal') {
    const i = nodos.findIndex((n) => n.ref >= 9);
    nodos.splice(i < 0 ? nodos.length : i, 0, {
      clave: 'proyectos',
      numero: 'P',
      nombre: 'Proyectos',
      area: 'proyectos',
      ref: 8.5,
    });
  }
  // Posición de referencia de la etapa actual en la escala de números.
  const posicion = actual.numero
    ? actual.numero
    : actual.provisional
      ? 8.5
      : actual.tipo === 'ganada'
        ? 99
        : -1;
  return (
    <ol role="list" aria-label="Recorrido de etapas" className="flex items-start overflow-x-auto pb-1">
      {nodos.map((n, i) => {
        const hecha = posicion > n.ref;
        const esActual = posicion === n.ref;
        const color = AREAS[n.area].color;
        return (
          <li
            key={n.clave}
            className="flex min-w-[2.25rem] flex-1 flex-col items-center text-center sm:min-w-[4.5rem]"
          >
            <span className="flex w-full items-center">
              <span
                className={cn(
                  'h-0.5 flex-1',
                  i === 0 ? 'invisible' : hecha || esActual ? 'bg-ink' : 'bg-line',
                )}
              />
              <span
                aria-current={esActual ? 'step' : undefined}
                className={cn(
                  'grid size-8 shrink-0 place-items-center rounded-full text-xs font-bold tabular',
                  hecha
                    ? 'bg-ink text-white'
                    : esActual
                      ? 'bg-surface text-ink'
                      : 'border border-line-strong bg-surface text-muted-foreground',
                )}
                style={esActual ? { boxShadow: `0 0 0 3px ${color}` } : undefined}
              >
                {hecha ? '✓' : n.numero}
              </span>
              <span
                className={cn(
                  'h-0.5 flex-1',
                  i === nodos.length - 1 ? 'invisible' : hecha ? 'bg-ink' : 'bg-line',
                )}
              />
            </span>
            <span
              className={cn(
                // En el teléfono solo los números: el nombre de la etapa actual ya está en su recuadro.
                'mt-1.5 hidden px-1 text-[11px] leading-tight sm:line-clamp-2',
                esActual ? 'font-semibold text-ink' : 'text-muted-foreground',
              )}
            >
              {n.nombre}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
