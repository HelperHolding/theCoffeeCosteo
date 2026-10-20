import Link from 'next/link';
import {
  ChevronRight,
  CircleCheck,
  CircleAlert,
  TriangleAlert,
  CircleDashed,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';

export function Encabezado({
  area,
  titulo,
  descripcion,
  migas,
  children,
}: {
  area?: string;
  titulo: string;
  descripcion?: React.ReactNode;
  migas?: { href: string; nombre: string }[];
  children?: React.ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        {migas?.length ? (
          <nav
            aria-label="Migas de pan"
            className="mb-3 flex items-center gap-1 text-xs text-muted-foreground"
          >
            {migas.map((m) => (
              <span key={m.href} className="flex items-center gap-1">
                <Link href={m.href} className="hover:text-ink hover:underline">
                  {m.nombre}
                </Link>
                <ChevronRight size={12} aria-hidden="true" />
              </span>
            ))}
            <span className="text-ink-2">{titulo}</span>
          </nav>
        ) : (
          area && <p className="eyebrow mb-2">{area}</p>
        )}
        <h1>{titulo}</h1>
        {descripcion && <p className="mt-2 max-w-2xl text-sm text-muted-foreground">{descripcion}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </header>
  );
}

export function Tarjeta({
  titulo,
  descripcion,
  acciones,
  className,
  cuerpo = true,
  children,
}: {
  titulo?: React.ReactNode;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
  className?: string;
  cuerpo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={cn('rounded-2xl border border-line bg-surface shadow-card', className)}>
      {(titulo || acciones) && (
        <header className="flex flex-wrap items-start justify-between gap-3 px-5 pt-5">
          <div>
            {titulo && <h2>{titulo}</h2>}
            {descripcion && <p className="mt-1 text-xs text-muted-foreground">{descripcion}</p>}
          </div>
          {acciones}
        </header>
      )}
      <div className={cuerpo ? 'p-5' : ''}>{children}</div>
    </section>
  );
}

export type Estado = 'ok' | 'bajo' | 'pierde' | 'sin-precio' | 'neutro';
const estados: Record<Estado, { clase: string; icono: LucideIcon; texto: string }> = {
  ok: { clase: 'bg-ok-soft text-ok', icono: CircleCheck, texto: 'En objetivo' },
  bajo: { clase: 'bg-warn-soft text-warn', icono: CircleAlert, texto: 'Bajo objetivo' },
  pierde: { clase: 'bg-bad-soft text-bad', icono: TriangleAlert, texto: 'Pierde dinero' },
  'sin-precio': { clase: 'bg-surface-2 text-muted-foreground', icono: CircleDashed, texto: 'Sin precio' },
  neutro: { clase: 'bg-surface-2 text-ink-2', icono: CircleDashed, texto: '' },
};
export const textoEstado = (estado: Estado) => estados[estado].texto;
export function estadoMargen(f: {
  precio_canal: number | null;
  margen: number | null;
  margen_pct: number | null;
  margen_objetivo: number;
}): Estado {
  if (f.precio_canal === null || f.margen_pct === null) return 'sin-precio';
  if (f.margen !== null && f.margen < 0) return 'pierde';
  if (f.margen_pct < f.margen_objetivo) return 'bajo';
  return 'ok';
}
export function Pill({
  estado,
  children,
  className,
}: {
  estado: Estado;
  children?: React.ReactNode;
  className?: string;
}) {
  const { clase, icono: Icono, texto } = estados[estado];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold',
        clase,
        className,
      )}
    >
      <Icono size={13} aria-hidden="true" />
      {children ?? texto}
    </span>
  );
}

export function Insignia({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-surface px-2.5 py-0.5 text-xs font-medium text-ink-2',
        className,
      )}
    >
      {children}
    </span>
  );
}

/** Barra horizontal con marca de objetivo. valor y objetivo en la misma escala (0–max). */
export function Barra({
  valor,
  max,
  objetivo,
  estado = 'neutro',
  className,
}: {
  valor: number;
  max: number;
  objetivo?: number;
  estado?: Estado;
  className?: string;
}) {
  const pct = (n: number) => `${Math.max(0, Math.min(100, (n / (max || 1)) * 100))}%`;
  const color = {
    ok: 'bg-ok',
    bajo: 'bg-warn',
    pierde: 'bg-bad',
    'sin-precio': 'bg-line-strong',
    neutro: 'bg-ink',
  }[estado];
  return (
    <div className={cn('relative h-2 w-full rounded-full bg-surface-2', className)} aria-hidden="true">
      <div
        className={cn('h-full rounded-full transition-[width] duration-500', color)}
        style={{ width: pct(valor) }}
      />
      {objetivo !== undefined && (
        <div className="absolute -top-1 h-4 w-0.5 rounded-full bg-ink" style={{ left: pct(objetivo) }} />
      )}
    </div>
  );
}

export function Kpi({
  etiqueta,
  valor,
  nota,
  href,
  icono: Icono,
  tono = 'neutro',
  children,
}: {
  etiqueta: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
  href?: string;
  icono: LucideIcon;
  tono?: Estado;
  children?: React.ReactNode;
}) {
  const fondo = {
    ok: 'bg-ok-soft text-ok',
    bajo: 'bg-warn-soft text-warn',
    pierde: 'bg-bad-soft text-bad',
    'sin-precio': 'bg-surface-2 text-ink-2',
    neutro: 'bg-crema-soft text-crema-strong',
  }[tono];
  const contenido = (
    <>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm font-medium text-ink-2">{etiqueta}</p>
        <span className={cn('grid size-9 place-items-center rounded-xl', fondo)}>
          <Icono size={18} aria-hidden="true" />
        </span>
      </div>
      <p className="mt-3 font-display text-[2.1rem] font-black leading-none tracking-tight tabular">
        {valor}
      </p>
      {children && <div className="mt-4">{children}</div>}
      {nota && <p className="mt-3 text-xs text-muted-foreground">{nota}</p>}
      {href && (
        <span className="mt-4 inline-flex items-center gap-1 text-xs font-semibold text-crema-strong">
          Ver detalle{' '}
          <ChevronRight
            size={13}
            aria-hidden="true"
            className="transition-transform group-hover:translate-x-0.5"
          />
        </span>
      )}
    </>
  );
  const clase =
    'group block rounded-2xl border border-line bg-surface p-5 shadow-card transition-[box-shadow,transform,border-color] duration-200';
  return href ? (
    <Link
      href={href}
      className={cn(clase, 'hover:-translate-y-0.5 hover:border-line-strong hover:shadow-lift')}
    >
      {contenido}
    </Link>
  ) : (
    <div className={clase}>{contenido}</div>
  );
}

export function Vacio({ titulo, children }: { titulo: string; children?: React.ReactNode }) {
  return (
    <div className="px-5 py-14 text-center">
      <p className="font-display font-bold">{titulo}</p>
      {children && <div className="mt-2 text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}
