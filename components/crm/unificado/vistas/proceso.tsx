'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { cn } from 'cn';
import {
  ArrowLeft,
  ArrowRight,
  BellRing,
  CalendarDays,
  FileText,
  Lock,
  MapPin,
  PenLine,
  ShieldCheck,
  Type,
  UsersRound,
} from 'lucide-react';
import { AREAS } from '@/lib/crm/unificado/modelo';
import { FASES, numeroPaso, type FaseProceso, type PasoProceso } from '@/lib/crm/unificado/proceso';
import { Chip } from '@/components/crm/unificado/piezas';

const TIPO = {
  documento: { texto: 'Documento', icono: FileText },
  fecha: { texto: 'Fecha', icono: CalendarDays },
  validacion: { texto: 'Validación', icono: ShieldCheck },
  firma: { texto: 'Firma y fecha', icono: PenLine },
  dato: { texto: 'Dato de la ficha', icono: Type },
} as const;

/** Mapa interactivo del proceso: fases y pasos a la izquierda; qué se hace, registra, quién, dónde y qué sigue a la derecha. */
export function VistaProceso({ pasos, inicial }: { pasos: PasoProceso[]; inicial?: string }) {
  const [clave, setClave] = useState(
    pasos.some((p) => p.etapa.clave === inicial) ? inicial! : pasos[0]?.etapa.clave,
  );
  const i = pasos.findIndex((p) => p.etapa.clave === clave);
  const paso = pasos[i];
  // El paso elegido vive en la URL: el enlace se puede compartir.
  useEffect(() => {
    const p = new URLSearchParams(window.location.search);
    p.set('paso', clave);
    window.history.replaceState(null, '', `${window.location.pathname}?${p}`);
  }, [clave]);
  const fases = (Object.keys(FASES) as FaseProceso[])
    .map((f) => ({ fase: f, pasos: pasos.filter((p) => p.contenido.fase === f) }))
    .filter((f) => f.pasos.length);

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
      <nav aria-label="Etapas del proceso" className="min-w-0 space-y-3">
        {fases.map(({ fase, pasos: ps }) => {
          const area = FASES[fase].area;
          return (
            <section
              key={fase}
              className={cn(
                'relative overflow-hidden rounded-2xl border bg-surface p-3 pl-5 shadow-card',
                fase === 'legal' ? 'border-dashed border-line-strong' : 'border-line',
              )}
            >
              <span
                aria-hidden="true"
                className="absolute inset-y-0 left-0 w-1.5"
                style={{ background: area ? AREAS[area].color : 'var(--color-line-strong)' }}
              />
              <h2 className="mb-2 flex items-baseline justify-between gap-2 px-1 text-sm font-semibold">
                {FASES[fase].nombre}
                {fase === 'legal' && (
                  <span className="text-[11px] font-normal text-muted-foreground">
                    corre junto a 26.1–26.7
                  </span>
                )}
              </h2>
              <ol role="list" className="space-y-1">
                {ps.map((p) => {
                  const activo = p.etapa.clave === clave;
                  const candados = p.requisitos.filter((r) => r.obligatorio).length;
                  return (
                    <li key={p.etapa.id}>
                      <button
                        type="button"
                        onClick={() => setClave(p.etapa.clave)}
                        aria-current={activo ? 'step' : undefined}
                        className={cn(
                          'flex w-full items-center gap-3 rounded-xl px-2 py-2 text-left transition-colors',
                          activo ? 'bg-ink text-white' : 'hover:bg-surface-2',
                        )}
                      >
                        <span
                          className={cn(
                            'grid h-7 min-w-7 shrink-0 place-items-center rounded-full px-1.5 text-[11px] font-bold tabular',
                            activo ? 'bg-white text-ink' : 'bg-surface-2 text-ink',
                          )}
                          style={
                            activo
                              ? undefined
                              : { boxShadow: `inset 0 0 0 1.5px ${AREAS[p.etapa.area].color}` }
                          }
                        >
                          {numeroPaso(p.etapa) || '✓'}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium">{p.etapa.nombre}</span>
                        {candados > 0 && (
                          <span
                            className={cn(
                              'inline-flex shrink-0 items-center gap-1 text-[11px] tabular',
                              activo ? 'text-white/75' : 'text-muted-foreground',
                            )}
                            title={`${candados} requisitos obligatorios`}
                          >
                            <Lock size={11} aria-hidden="true" />
                            {candados}
                          </span>
                        )}
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>
          );
        })}
      </nav>

      {paso && (
        <article
          aria-live="polite"
          className="min-w-0 space-y-5 rounded-2xl border border-line bg-surface p-5 shadow-card xl:sticky xl:top-20"
        >
          <header className="flex items-start gap-4">
            <span
              className="grid h-12 min-w-12 shrink-0 place-items-center rounded-2xl px-2 font-display text-lg font-black tabular text-white"
              style={{ background: AREAS[paso.etapa.area].color }}
            >
              {numeroPaso(paso.etapa) || '✓'}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{FASES[paso.contenido.fase].nombre}</p>
              <h2 className="font-display text-xl font-black leading-tight">{paso.etapa.nombre}</h2>
              <p className="mt-1 inline-flex items-center gap-1.5 text-xs text-ink-2">
                <UsersRound size={13} aria-hidden="true" /> {paso.contenido.quien}
              </p>
            </div>
          </header>

          <section>
            <h3 className="text-sm font-semibold">Qué se hace</h3>
            <ol className="mt-2 space-y-1.5 text-sm text-ink-2">
              {paso.contenido.hace.map((h, n) => (
                <li key={n} className="flex gap-2">
                  <span className="mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-surface-2 text-[10px] font-bold tabular text-ink">
                    {n + 1}
                  </span>
                  <span>{h}</span>
                </li>
              ))}
            </ol>
          </section>

          <section>
            <h3 className="text-sm font-semibold">Qué se registra en el CRM</h3>
            {paso.requisitos.length ? (
              <ul role="list" className="mt-2 divide-y divide-line rounded-xl border border-line">
                {paso.requisitos.map((r) => {
                  const t = TIPO[r.tipo as keyof typeof TIPO] ?? TIPO.dato;
                  return (
                    <li key={r.nombre} className="flex items-start gap-3 px-3 py-2.5">
                      <t.icono
                        size={15}
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{r.nombre}</p>
                        <p className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-muted-foreground">
                          <span>{t.texto}</span>
                          <Chip color={AREAS[r.area_cumple].color}>
                            Registra {AREAS[r.area_cumple].nombre}
                          </Chip>
                          {r.area_valida !== r.area_cumple && (
                            <Chip color={AREAS[r.area_valida].color}>
                              Valida {AREAS[r.area_valida].nombre}
                            </Chip>
                          )}
                        </p>
                      </div>
                      {r.obligatorio ? (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-semibold text-ink-2">
                          <Lock size={12} aria-hidden="true" /> Candado
                        </span>
                      ) : (
                        <span className="shrink-0 text-[11px] text-muted-foreground">Aviso</span>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-muted-foreground">Esta etapa no registra requisitos propios.</p>
            )}
          </section>

          {paso.contenido.candado && (
            <p className="flex gap-2 rounded-xl border-l-4 border-bad bg-bad-soft px-3 py-2.5 text-sm text-ink">
              <Lock size={15} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
              <span>
                <span className="font-semibold">Condición obligatoria: </span>
                {paso.contenido.candado}
              </span>
            </p>
          )}
          {paso.contenido.avisos?.length ? (
            <div className="rounded-xl border-l-4 border-warn bg-warn-soft px-3 py-2.5 text-sm text-ink">
              <p className="flex items-center gap-2 font-semibold">
                <BellRing size={15} aria-hidden="true" className="text-warn" /> El CRM avisa solo
              </p>
              <ul className="mt-1 list-disc space-y-0.5 pl-6 text-ink-2">
                {paso.contenido.avisos.map((a) => (
                  <li key={a}>{a}</li>
                ))}
              </ul>
            </div>
          ) : null}

          <dl className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-surface-2/70 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <MapPin size={13} aria-hidden="true" /> Dónde se trabaja
              </dt>
              <dd className="mt-1 text-sm font-medium">{paso.contenido.donde}</dd>
              {paso.contenido.fase !== 'legal' && (
                <dd className="mt-2">
                  <Link
                    href={`/crm/pipeline?vista=tabla&etapa=${paso.etapa.clave}`}
                    className="text-xs font-semibold text-crema-strong hover:underline"
                  >
                    Ver las {paso.cards.toLocaleString('es-MX')} cards en esta etapa
                  </Link>
                </dd>
              )}
              {paso.contenido.fase === 'legal' && (
                <dd className="mt-2">
                  <Link
                    href="/crm/carril-legal"
                    className="text-xs font-semibold text-crema-strong hover:underline"
                  >
                    Abrir el tablero de COF y contrato
                  </Link>
                </dd>
              )}
            </div>
            <div className="rounded-xl bg-surface-2/70 p-3">
              <dt className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <ArrowRight size={13} aria-hidden="true" /> Qué sigue
              </dt>
              <dd className="mt-1 text-sm font-medium">{paso.contenido.sigue}</dd>
            </div>
          </dl>

          <footer className="flex items-center justify-between gap-2 border-t border-line pt-3">
            <button
              type="button"
              disabled={i <= 0}
              onClick={() => setClave(pasos[i - 1].etapa.clave)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              <ArrowLeft size={15} aria-hidden="true" /> Anterior
            </button>
            <span className="text-xs tabular text-muted-foreground">
              {i + 1} de {pasos.length}
            </span>
            <button
              type="button"
              disabled={i >= pasos.length - 1}
              onClick={() => setClave(pasos[i + 1].etapa.clave)}
              className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-sm font-semibold text-ink-2 hover:bg-surface-2 disabled:opacity-40"
            >
              Siguiente <ArrowRight size={15} aria-hidden="true" />
            </button>
          </footer>
        </article>
      )}
    </div>
  );
}
