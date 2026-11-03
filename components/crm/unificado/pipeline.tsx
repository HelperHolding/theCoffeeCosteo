'use client';
import { useMemo, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
} from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import { cn } from 'cn';
import { Columns3, GripVertical, Search, Table2 } from 'lucide-react';
import { CardPipelineVista, Candado, ChipEtapa, rutaCard } from './card-pipeline';
import { DialogoMovimiento, MenuMover } from './mover';
import { avanzarCard } from '@/app/(crm)/crm/acciones-pipeline';
import { destinos, type Destino } from '@/lib/crm/unificado/reglas';
import {
  POR_COLUMNA,
  AREAS,
  cuando,
  estadoCandado,
  textoVencimiento,
  tramos as calcularTramos,
  type CardPipeline,
  type EtapaGeneral,
  type Tramo,
} from '@/lib/crm/unificado/modelo';

type FiltroCandado = 'todas' | 'bloqueada' | 'lista' | 'liberada';
type Pendiente = { card: CardPipeline; destino: Destino };

function CardArrastrable({
  card,
  etapa,
  etapas,
  editable,
  ahora,
  alMover,
}: {
  card: CardPipeline;
  etapa: EtapaGeneral;
  etapas: EtapaGeneral[];
  editable: boolean;
  ahora?: Date;
  alMover: (card: CardPipeline, d: Destino) => void;
}) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging } = useDraggable({
    id: card.id,
    data: { etapa: card.etapaId },
    disabled: !editable,
  });
  const posibles = editable ? destinos(etapas, etapa, card.tipo, card.etapaPreviaId) : [];
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform) }}
      className={cn(isDragging && 'relative z-10')}
    >
      <CardPipelineVista
        card={card}
        etapa={etapa}
        ahora={ahora}
        arrastrando={isDragging}
        asa={
          editable && posibles.length ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Arrastrar ${card.nombre}`}
              className="-ml-1 grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
            >
              <GripVertical size={14} aria-hidden="true" />
            </button>
          ) : undefined
        }
        acciones={<MenuMover nombre={card.nombre} destinos={posibles} alElegir={(d) => alMover(card, d)} />}
      />
    </div>
  );
}

function Columna({
  etapa,
  etapas,
  cards,
  total,
  editable,
  ahora,
  alMover,
}: {
  etapa: EtapaGeneral;
  etapas: EtapaGeneral[];
  cards: CardPipeline[];
  total: number;
  editable: boolean;
  ahora?: Date;
  alMover: (card: CardPipeline, d: Destino) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const bloqueadas = cards.filter((c) => estadoCandado(c, etapa) === 'bloqueada').length;
  const area = AREAS[etapa.area];
  return (
    <section
      aria-labelledby={`col-${etapa.id}`}
      className={cn(
        'flex w-[17.5rem] shrink-0 flex-col rounded-2xl border border-line bg-surface-2',
        isOver && 'ring-2 ring-crema/50',
      )}
    >
      <header className="space-y-1 border-b border-line px-3 pb-2.5 pt-3">
        <div className="flex items-start gap-2">
          <h3 id={`col-${etapa.id}`} className="min-w-0 flex-1 text-[13px] font-semibold leading-snug">
            {etapa.numero ? <span className="text-muted-foreground">{etapa.numero} · </span> : null}
            {etapa.nombre}
          </h3>
          <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular">
            {total.toLocaleString('es-MX')}
          </span>
        </div>
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <span aria-hidden="true" className="size-2 rounded-full" style={{ background: area.color }} />
            {etapa.funcion ?? area.nombre}
          </span>
          {etapa.opcional && <span>· opcional</span>}
          {etapa.provisional && <span>· provisional</span>}
          {bloqueadas > 0 && (
            <span>
              · {bloqueadas} bloqueada{bloqueadas > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </header>
      <ul
        ref={setNodeRef}
        role="list"
        className="flex-1 space-y-2 overflow-y-auto p-2"
        style={{ maxHeight: '38rem', minHeight: '6rem' }}
      >
        {cards.slice(0, POR_COLUMNA).map((c) => (
          <li key={c.id}>
            <CardArrastrable
              card={c}
              etapa={etapa}
              etapas={etapas}
              editable={editable}
              ahora={ahora}
              alMover={alMover}
            />
          </li>
        ))}
        {cards.length === 0 && (
          <li className="rounded-xl border border-dashed border-line-strong px-3 py-6 text-center text-xs text-muted-foreground">
            Sin cards con estos filtros
          </li>
        )}
      </ul>
      {total > Math.min(cards.length, POR_COLUMNA) && (
        <Link
          href={`/crm/pipeline?vista=tabla&etapa=${etapa.clave}`}
          className="border-t border-line px-3 py-2 text-center text-xs font-semibold text-ink-2 hover:bg-surface hover:underline"
        >
          Ver las {total.toLocaleString('es-MX')} en tabla
        </Link>
      )}
    </section>
  );
}

export function TablaCards({
  cards,
  etapas,
  ahora,
}: {
  cards: CardPipeline[];
  etapas: EtapaGeneral[];
  ahora?: Date;
}) {
  const etapaDe = new Map(etapas.map((e) => [e.id, e]));
  return (
    <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
      <table className="w-full min-w-[56rem] text-sm">
        <thead className="border-b border-line bg-surface-2 text-left text-xs text-muted-foreground">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Card</th>
            <th className="px-4 py-2.5 font-semibold">Etapa</th>
            <th className="px-4 py-2.5 font-semibold">Candado</th>
            <th className="px-4 py-2.5 font-semibold">Vencimiento</th>
            <th className="px-4 py-2.5 font-semibold">Último movimiento</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-line">
          {cards.map((c) => {
            const e = etapaDe.get(c.etapaId);
            return (
              <tr key={c.id}>
                <td className="px-4 py-2.5">
                  <Link href={rutaCard(c)} className="font-semibold hover:underline">
                    {c.nombre}
                  </Link>
                  <span className="block text-xs text-muted-foreground">
                    {c.tipo === 'franquiciatario'
                      ? 'Franquiciatario'
                      : `Sucursal · ${c.franquiciatario ?? '—'}`}
                    {c.ciudad ? ` · ${c.ciudad}` : ''}
                    {c.muestra ? ' · muestra' : ''}
                  </span>
                </td>
                <td className="px-4 py-2.5">{e && <ChipEtapa etapa={e} />}</td>
                <td className="px-4 py-2.5">{e && <Candado card={c} etapa={e} />}</td>
                <td className="px-4 py-2.5 text-xs">
                  {c.vencimiento ? textoVencimiento(c.vencimiento) : '—'}
                </td>
                <td className="px-4 py-2.5 text-xs text-muted-foreground">
                  {c.ultimo ? `${c.ultimo.actor} · ${cuando(c.ultimo.fecha, ahora)}` : '—'}
                </td>
              </tr>
            );
          })}
          {cards.length === 0 && (
            <tr>
              <td colSpan={5} className="px-4 py-10 text-center text-sm text-muted-foreground">
                Sin cards con estos filtros.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function PipelineGeneral({
  etapas,
  cards,
  totales,
  ahora,
  editable = false,
  tramoInicial = 'todos',
}: {
  etapas: EtapaGeneral[];
  cards: CardPipeline[];
  /** Total real por etapa (las cards cargadas pueden ser solo las primeras). */
  totales?: Record<string, number>;
  ahora?: Date;
  editable?: boolean;
  tramoInicial?: Tramo['clave'] | 'todos';
}) {
  const todos = useMemo(() => calcularTramos(etapas), [etapas]);
  const router = useRouter();
  const [tramo, setTramo] = useState<Tramo['clave'] | 'todos'>(tramoInicial);
  const [vista, setVista] = useState<'kanban' | 'tabla'>('kanban');
  const [buscar, setBuscar] = useState('');
  const [candado, setCandado] = useState<FiltroCandado>('todas');
  const [sinMuestra, setSinMuestra] = useState(false);
  const [locales, setLocales] = useState(cards);
  const [recibidas, setRecibidas] = useState(cards);
  if (recibidas !== cards) {
    // Datos nuevos del servidor (router.refresh) mandan sobre el estado optimista.
    setRecibidas(cards);
    setLocales(cards);
  }
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const etapaDe = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);

  const ejecutar = (card: CardPipeline, d: Destino, motivo: string | null, sucursal: string | null) =>
    iniciar(async () => {
      // Optimista: la card cambia de columna de inmediato y regresa (solo ella) si la base la rechaza.
      setLocales((xs) => xs.map((x) => (x.id === card.id ? { ...x, etapaId: d.etapa.id } : x)));
      const r = await avanzarCard(card.tipo, card.id, d.etapa.clave, card.version, motivo, sucursal);
      if (r.error !== undefined) {
        setLocales((xs) => xs.map((x) => (x.id === card.id ? { ...x, etapaId: card.etapaId } : x)));
        setErrorDialogo(r.error);
        setAviso({ tipo: 'error', texto: `${card.nombre} no se movió: ${r.error}` });
        return;
      }
      setPendiente(null);
      setErrorDialogo('');
      setAviso({ tipo: 'ok', texto: `${card.nombre} pasó a ${d.etapa.nombre}.` });
      router.refresh();
    });
  const mover = (card: CardPipeline, d: Destino) => {
    setAviso(null);
    if (d.requiereMotivo || d.pideSucursal) {
      setErrorDialogo('');
      setPendiente({ card, destino: d });
    } else ejecutar(card, d, null, null);
  };

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor),
  );
  const nombreCard = (id: string | number) => locales.find((c) => c.id === id)?.nombre ?? 'la card';
  const nombreCol = (id: string | number | undefined) =>
    (id ? etapaDe.get(String(id))?.nombre : undefined) ?? '';
  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${nombreCard(active.id)}.`,
    onDragOver: ({ active, over }) => (over ? `${nombreCard(active.id)} sobre ${nombreCol(over.id)}.` : ''),
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${nombreCard(active.id)} en ${nombreCol(over.id)}.`
        : `${nombreCard(active.id)} regresó a su lugar.`,
    onDragCancel: ({ active }) => `Se canceló. ${nombreCard(active.id)} regresó a su lugar.`,
  };
  const alSoltar = ({ active, over }: DragEndEvent) => {
    if (!over) return;
    const card = locales.find((c) => c.id === active.id);
    const actual = card && etapaDe.get(card.etapaId);
    if (!card || !actual || over.id === card.etapaId) return;
    const d = destinos(etapas, actual, card.tipo, card.etapaPreviaId).find((x) => x.etapa.id === over.id);
    if (!d) {
      setAviso({
        tipo: 'error',
        texto: `${card.nombre} no puede pasar de «${actual.nombre}» a «${nombreCol(over.id)}».`,
      });
      return;
    }
    mover(card, d);
  };

  const visibles = locales.filter((c) => {
    const e = etapaDe.get(c.etapaId);
    if (!e) return false;
    if (sinMuestra && c.muestra) return false;
    if (candado !== 'todas' && estadoCandado(c, e) !== candado) return false;
    const q = buscar.trim().toLocaleLowerCase('es');
    return !q || [c.nombre, c.franquiciatario, c.ciudad].some((s) => s?.toLocaleLowerCase('es').includes(q));
  });
  const filtrando = buscar.trim() !== '' || candado !== 'todas' || sinMuestra;
  const mostrados = tramo === 'todos' ? todos : todos.filter((t) => t.clave === tramo);
  const enTramo = (c: CardPipeline) => mostrados.some((t) => t.etapas.some((e) => e.id === c.etapaId));

  return (
    <div className="space-y-4">
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <label className="min-w-48 flex-1">
          <span className="sr-only">Buscar</span>
          <span className="relative block">
            <Search
              size={15}
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Franquiciatario, sucursal o ciudad"
              className="!pl-9"
            />
          </span>
        </label>
        <label className="w-44">
          Candado
          <select value={candado} onChange={(e) => setCandado(e.target.value as FiltroCandado)}>
            <option value="todas">Todas</option>
            <option value="bloqueada">Bloqueadas</option>
            <option value="lista">Listas para avanzar</option>
            <option value="liberada">Con candado liberado</option>
          </select>
        </label>
        <label className="flex items-center gap-2 pb-2.5 text-sm font-medium">
          <input type="checkbox" checked={sinMuestra} onChange={(e) => setSinMuestra(e.target.checked)} />
          Ocultar muestra
        </label>
        <div
          className="inline-flex rounded-[10px] border border-line-strong bg-surface p-0.5"
          role="group"
          aria-label="Vista"
        >
          {(
            [
              ['kanban', 'Kanban', Columns3],
              ['tabla', 'Tabla', Table2],
            ] as const
          ).map(([v, nombre, Icono]) => (
            <button
              key={v}
              type="button"
              aria-pressed={vista === v}
              onClick={() => setVista(v)}
              className={cn(
                'inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[13px] font-semibold',
                vista === v ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              <Icono size={14} aria-hidden="true" /> {nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Selector de tramo: en teléfono enfoca un tramo; en escritorio filtra el tablero. */}
      <div role="group" aria-label="Tramo del proceso" className="flex gap-1.5 overflow-x-auto pb-1">
        {[{ clave: 'todos' as const, nombre: 'Todo el proceso', area: null }, ...todos].map((t) => (
          <button
            key={t.clave}
            type="button"
            aria-pressed={tramo === t.clave}
            onClick={() => setTramo(t.clave)}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-[13px] font-medium',
              tramo === t.clave
                ? 'border-ink bg-ink text-white'
                : 'border-line-strong bg-surface text-ink-2 hover:bg-surface-2',
            )}
          >
            {t.area && (
              <span
                aria-hidden="true"
                className="size-2 rounded-full"
                style={{ background: AREAS[t.area].color }}
              />
            )}
            {t.nombre}
          </button>
        ))}
      </div>

      {aviso && (
        <p
          aria-live="polite"
          className={cn(
            'placa px-3 py-2 text-sm font-medium',
            aviso.tipo === 'error' ? 'text-bad' : 'text-ok',
          )}
        >
          {aviso.texto}
        </p>
      )}

      {vista === 'tabla' ? (
        <TablaCards cards={visibles.filter(enTramo)} etapas={etapas} ahora={ahora} />
      ) : (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCorners}
          onDragEnd={alSoltar}
          accessibility={{ announcements: anuncios }}
        >
          {/* El desplazamiento horizontal vive dentro del contenedor, nunca en la página. */}
          <div className="relative -mx-1 overflow-x-auto pb-3" aria-busy={guardando}>
            <div className="flex w-max gap-6 px-1">
              {mostrados.map((t) => (
                <div key={t.clave} className="space-y-2">
                  <h2 className="placa inline-flex items-center gap-2 px-3 py-1.5 text-sm">
                    {t.area && (
                      <span
                        aria-hidden="true"
                        className="h-3 w-6 rounded-sm"
                        style={{ background: AREAS[t.area].color }}
                      />
                    )}
                    {t.nombre}
                  </h2>
                  <div className="flex gap-3">
                    {t.etapas.map((e) => {
                      const cs = visibles.filter((c) => c.etapaId === e.id);
                      return (
                        <Columna
                          key={e.id}
                          etapa={e}
                          etapas={etapas}
                          cards={cs}
                          total={filtrando ? cs.length : (totales?.[e.id] ?? cs.length)}
                          editable={editable}
                          ahora={ahora}
                          alMover={mover}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </DndContext>
      )}

      <DialogoMovimiento
        destino={pendiente?.destino ?? null}
        nombre={pendiente?.card.nombre ?? ''}
        ciudad={pendiente?.card.ciudad}
        pendiente={guardando}
        error={errorDialogo}
        alCerrar={() => {
          setPendiente(null);
          setErrorDialogo('');
        }}
        alConfirmar={(motivo, sucursal) =>
          pendiente && ejecutar(pendiente.card, pendiente.destino, motivo, sucursal)
        }
      />
    </div>
  );
}
