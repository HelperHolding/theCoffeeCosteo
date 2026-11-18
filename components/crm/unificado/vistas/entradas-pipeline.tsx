import Link from 'next/link';
import { ArrowRight, Columns3, Scale } from 'lucide-react';
import { AREAS, type ClaveArea } from '@/lib/crm/unificado/modelo';

export interface EntradaTramo {
  clave: string;
  nombre: string;
  area: ClaveArea | null;
  total: number;
  bloqueadas: number;
  listas: number;
  /** Las etapas con más cards, para saber dónde se acumulan. */
  principales: { nombre: string; numero: string; n: number }[];
}

/** Lugar de las tarjetas mientras llegan las cifras: mismo tamaño, sin brillo animado. */
export function EsqueletoEntradas() {
  return (
    <div role="status" aria-label="Cargando las cifras del Pipeline" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[13.5rem] rounded-2xl border border-line bg-surface/70" />
      ))}
      <span className="sr-only">Cargando…</span>
    </div>
  );
}

/** Entrada del Pipeline: un atajo por tramo antes del tablero completo (doc 41 §7). */
export function VistaEntradasPipeline({
  tramos,
  carril,
}: {
  tramos: EntradaTramo[];
  carril: { total: number; completos: number };
}) {
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tramos.map((t) => (
          <Link
            key={t.clave}
            href={`/crm/pipeline?tramo=${t.clave}`}
            className="group relative flex flex-col overflow-hidden rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-line-strong"
          >
            <span
              aria-hidden="true"
              className="absolute inset-x-0 top-0 h-1.5"
              style={{ background: t.area ? AREAS[t.area].color : 'var(--color-line-strong)' }}
            />
            <span className="flex items-start justify-between gap-3">
              <span className="text-sm font-semibold">{t.nombre}</span>
              <ArrowRight
                size={16}
                aria-hidden="true"
                className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
              />
            </span>
            <span className="mt-2 font-display text-4xl font-black leading-none tabular">
              {t.total.toLocaleString('es-MX')}
            </span>
            <span className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-bad" />
                <span className="font-semibold tabular">{t.bloqueadas.toLocaleString('es-MX')}</span>{' '}
                bloqueadas
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span aria-hidden="true" className="size-2 rounded-full bg-ok" />
                <span className="font-semibold tabular">{t.listas.toLocaleString('es-MX')}</span> listas
              </span>
            </span>
            {t.principales.length > 0 && (
              <span className="mt-4 block space-y-1 border-t border-line pt-3">
                {t.principales.map((e) => (
                  <span key={e.nombre} className="flex items-center justify-between gap-2 text-xs">
                    <span className="truncate text-ink-2">
                      {e.numero ? (e.numero.includes('.') ? `${e.numero} ` : `${e.numero}. `) : ''}
                      {e.nombre}
                    </span>
                    <span className="shrink-0 font-semibold tabular">{e.n.toLocaleString('es-MX')}</span>
                  </span>
                ))}
              </span>
            )}
            <span className="mt-auto pt-4 text-xs font-semibold text-crema-strong">Abrir este tramo</span>
          </Link>
        ))}

        <Link
          href="/crm/carril-legal"
          className="group relative flex flex-col overflow-hidden rounded-2xl border border-dashed border-line-strong bg-surface p-5 shadow-card hover:border-ink/30"
        >
          <span className="flex items-start justify-between gap-3">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Scale size={16} aria-hidden="true" style={{ color: AREAS.legal.color }} /> COF y contrato
            </span>
            <ArrowRight size={16} aria-hidden="true" className="shrink-0 text-muted-foreground" />
          </span>
          <span className="mt-2 font-display text-4xl font-black leading-none tabular">
            {carril.total.toLocaleString('es-MX')}
          </span>
          <span className="mt-2 text-xs text-ink-2">
            sucursales en el carril Legal ·{' '}
            <span className="font-semibold tabular">{carril.completos.toLocaleString('es-MX')}</span> con todo
            listo
          </span>
          <span className="mt-auto pt-4 text-xs text-muted-foreground">
            Corre en paralelo a Proyectos: Legal registra la COF, el contrato y la liberación.
          </span>
        </Link>
      </div>

      <Link
        href="/crm/pipeline?tramo=todos"
        className="flex items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-5 py-4 text-sm font-semibold shadow-card hover:border-line-strong"
      >
        <span className="inline-flex items-center gap-2">
          <Columns3 size={16} aria-hidden="true" /> Ver el tablero completo (todas las etapas)
        </span>
        <ArrowRight size={16} aria-hidden="true" className="text-muted-foreground" />
      </Link>
    </>
  );
}
