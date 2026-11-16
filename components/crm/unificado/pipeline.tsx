'use client';
import './tablero.css';
import { memo, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  defaultDropAnimationSideEffects,
  pointerWithin,
  rectIntersection,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type CollisionDetection,
  type DragEndEvent,
  type DragStartEvent,
  type DropAnimation,
} from '@dnd-kit/core';
import { cn } from 'cn';
import { ChevronLeft, ChevronRight, Columns3, GripVertical, Search, Table2 } from 'lucide-react';
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
/** Mientras se arrastra: la columna acepta la card, no la acepta, o es de donde salió. */
type EstadoDestino = 'si' | 'no' | 'origen' | null;

const SIN_CARDS: CardPipeline[] = [];

/** Primero la columna bajo el cursor; con teclado (sin cursor), la que más se encima. */
const colision: CollisionDetection = (args) => {
  const bajo = pointerWithin(args);
  return bajo.length ? bajo : rectIntersection(args);
};

const soltar: DropAnimation = {
  duration: 220,
  easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
  sideEffects: defaultDropAnimationSideEffects({ styles: { active: { opacity: '0.38' } } }),
};

function useMovimientoReducido() {
  const [reducido, setReducido] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    const leer = () => setReducido(m.matches);
    leer();
    m.addEventListener('change', leer);
    return () => m.removeEventListener('change', leer);
  }, []);
  return reducido;
}

const CardArrastrable = memo(function CardArrastrable({
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
  const posibles = useMemo(
    () => (editable ? destinos(etapas, etapa, card.tipo, card.etapaPreviaId) : []),
    [editable, etapas, etapa, card.tipo, card.etapaPreviaId],
  );
  // La card no se mueve en su lugar (ahí la cortaba el borde de la columna): la sigue una copia.
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, isDragging } = useDraggable({
    id: card.id,
    data: { etapa: card.etapaId },
    disabled: !posibles.length,
  });
  return (
    <div ref={setNodeRef}>
      <CardPipelineVista
        card={card}
        etapa={etapa}
        ahora={ahora}
        origen={isDragging}
        asa={
          posibles.length ? (
            <button
              ref={setActivatorNodeRef}
              type="button"
              {...attributes}
              {...listeners}
              aria-label={`Arrastrar ${card.nombre}`}
              className="tablero-asa grid size-6 shrink-0 cursor-grab touch-none place-items-center rounded-md text-muted-foreground hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
            >
              <GripVertical size={14} strokeWidth={1.75} aria-hidden="true" />
            </button>
          ) : undefined
        }
        acciones={<MenuMover nombre={card.nombre} destinos={posibles} alElegir={(d) => alMover(card, d)} />}
      />
    </div>
  );
});

const Columna = memo(function Columna({
  etapa,
  etapas,
  cards,
  total,
  editable,
  ahora,
  destino,
  alMover,
}: {
  etapa: EtapaGeneral;
  etapas: EtapaGeneral[];
  cards: CardPipeline[];
  total: number;
  editable: boolean;
  ahora?: Date;
  destino: EstadoDestino;
  alMover: (card: CardPipeline, d: Destino) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: etapa.id });
  const bloqueadas = useMemo(
    () => cards.filter((c) => estadoCandado(c, etapa) === 'bloqueada').length,
    [cards, etapa],
  );
  const area = AREAS[etapa.area];
  const numero = etapa.numero ?? etapa.paso;
  const sobre = isOver && destino && destino !== 'origen' ? destino : undefined;
  return (
    <section
      ref={setNodeRef}
      aria-labelledby={`col-${etapa.id}`}
      className="tablero-columna flex w-[18rem] shrink-0 flex-col"
      style={{ ['--area' as string]: area.color }}
      data-destino={destino ?? undefined}
      data-sobre={sobre}
    >
      <span aria-hidden="true" className="tablero-acento" />
      <header className="px-3.5 pb-2.5 pt-3.5">
        <div className="flex items-start gap-2">
          {numero ? <span className="tablero-numero mt-px">{numero}</span> : null}
          <h3 id={`col-${etapa.id}`} className="min-w-0 flex-1 pt-0.5 text-[13px] font-semibold leading-snug">
            {etapa.nombre}
          </h3>
          <span className="mt-px rounded-full bg-white/90 px-2 py-0.5 text-xs font-bold tabular shadow-[0_1px_2px_rgb(60_40_20/0.1)]">
            {total.toLocaleString('es-MX')}
          </span>
        </div>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
          <span className="font-medium text-ink-2">{etapa.funcion ?? area.nombre}</span>
          {etapa.opcional && <span>· opcional</span>}
          {bloqueadas > 0 && (
            <span>
              · {bloqueadas} bloqueada{bloqueadas > 1 ? 's' : ''}
            </span>
          )}
        </p>
      </header>
      <ul
        role="list"
        className="tablero-lista flex-1 space-y-2 overflow-y-auto px-2 pb-2"
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
      {sobre && (
        <p
          aria-hidden="true"
          className={cn(
            'mx-2 mb-2 rounded-lg px-2 py-1.5 text-center text-[11.5px] font-semibold',
            sobre === 'si' ? 'bg-white/90 text-ink' : 'bg-bad-soft text-bad',
          )}
        >
          {sobre === 'si' ? `Soltar para pasar a ${etapa.nombre}` : 'No puede pasar a esta etapa'}
        </p>
      )}
      {total > Math.min(cards.length, POR_COLUMNA) && (
        <Link
          href={`/crm/pipeline?vista=tabla&etapa=${etapa.clave}`}
          className="mx-2 mb-2 rounded-lg px-3 py-2 text-center text-xs font-semibold text-ink-2 hover:bg-white/70 hover:text-ink"
        >
          Ver las {total.toLocaleString('es-MX')} en tabla
        </Link>
      )}
    </section>
  );
});

/** Riel horizontal del tablero: flechas propias y bordes que se desvanecen donde hay más columnas. */
function Riel({ children, ocupado }: { children: React.ReactNode; ocupado: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const [lados, setLados] = useState({ izq: false, der: false });
  const reducido = useMovimientoReducido();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const medir = () => {
      const izq = el.scrollLeft > 4;
      const der = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
      setLados((x) => (x.izq === izq && x.der === der ? x : { izq, der }));
    };
    medir();
    el.addEventListener('scroll', medir, { passive: true });
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    if (el.firstElementChild) ro.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', medir);
      ro.disconnect();
    };
  }, []);
  const desplazar = (sentido: 1 | -1) =>
    ref.current?.scrollBy({
      left: sentido * Math.max(300, ref.current.clientWidth * 0.75),
      behavior: reducido ? 'auto' : 'smooth',
    });
  return (
    <div className="relative">
      <div
        ref={ref}
        className="tablero-riel -mx-1"
        data-izq={lados.izq || undefined}
        data-der={lados.der || undefined}
        aria-busy={ocupado}
      >
        {children}
      </div>
      <button
        type="button"
        className="tablero-flecha"
        data-lado="izq"
        data-oculta={!lados.izq || undefined}
        tabIndex={lados.izq ? 0 : -1}
        aria-hidden={!lados.izq}
        aria-label="Ver las etapas anteriores"
        onClick={() => desplazar(-1)}
      >
        <ChevronLeft size={18} strokeWidth={2} aria-hidden="true" />
      </button>
      <button
        type="button"
        className="tablero-flecha"
        data-lado="der"
        data-oculta={!lados.der || undefined}
        tabIndex={lados.der ? 0 : -1}
        aria-hidden={!lados.der}
        aria-label="Ver las etapas siguientes"
        onClick={() => desplazar(1)}
      >
        <ChevronRight size={18} strokeWidth={2} aria-hidden="true" />
      </button>
    </div>
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
  movibles,
  tramoInicial = 'todos',
}: {
  etapas: EtapaGeneral[];
  cards: CardPipeline[];
  /** Total real por etapa (las cards cargadas pueden ser solo las primeras). */
  totales?: Record<string, number>;
  ahora?: Date;
  editable?: boolean;
  /** Etapas que el usuario puede mover (su área y función); sin lista, todas las editables. */
  movibles?: string[];
  tramoInicial?: Tramo['clave'] | 'todos';
}) {
  const todos = useMemo(() => calcularTramos(etapas), [etapas]);
  const router = useRouter();
  const reducido = useMovimientoReducido();
  const [montado, setMontado] = useState(false);
  useEffect(() => setMontado(true), []);
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
  const [activa, setActiva] = useState<CardPipeline | null>(null);
  const [pendiente, setPendiente] = useState<Pendiente | null>(null);
  const [errorDialogo, setErrorDialogo] = useState('');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [guardando, iniciar] = useTransition();
  const etapaDe = useMemo(() => new Map(etapas.map((e) => [e.id, e])), [etapas]);

  const ejecutar = (card: CardPipeline, d: Destino, motivo: string | null, sucursal: string | null) => {
    // Optimista: la card cambia de columna en el mismo instante en que se suelta, y regresa (solo
    // ella) si la base la rechaza.
    setLocales((xs) => xs.map((x) => (x.id === card.id ? { ...x, etapaId: d.etapa.id } : x)));
    iniciar(async () => {
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
  };
  const mover = (card: CardPipeline, d: Destino) => {
    setAviso(null);
    if (d.requiereMotivo || d.pideSucursal) {
      setErrorDialogo('');
      setPendiente({ card, destino: d });
    } else ejecutar(card, d, null, null);
  };
  // Referencia estable para las cards memorizadas: no se vuelven a pintar al cambiar los filtros.
  const moverRef = useRef(mover);
  useEffect(() => {
    moverRef.current = mover;
  });
  const alMover = useCallback((card: CardPipeline, d: Destino) => moverRef.current(card, d), []);

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 160, tolerance: 6 } }),
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
  const validos = useMemo(() => {
    const e = activa && etapaDe.get(activa.etapaId);
    return activa && e
      ? new Set(destinos(etapas, e, activa.tipo, activa.etapaPreviaId).map((d) => d.etapa.id))
      : null;
  }, [activa, etapaDe, etapas]);
  const alTomar = ({ active }: DragStartEvent) => {
    setAviso(null);
    setActiva(locales.find((c) => c.id === active.id) ?? null);
  };
  const alSoltar = ({ active, over }: DragEndEvent) => {
    setActiva(null);
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

  const q = buscar.trim().toLocaleLowerCase('es');
  const visibles = useMemo(
    () =>
      locales.filter((c) => {
        const e = etapaDe.get(c.etapaId);
        if (!e) return false;
        if (sinMuestra && c.muestra) return false;
        if (candado !== 'todas' && estadoCandado(c, e) !== candado) return false;
        return (
          !q || [c.nombre, c.franquiciatario, c.ciudad].some((s) => s?.toLocaleLowerCase('es').includes(q))
        );
      }),
    [locales, etapaDe, sinMuestra, candado, q],
  );
  // Cards por columna, calculadas una sola vez (antes cada columna filtraba la lista completa).
  const porEtapa = useMemo(() => {
    const m = new Map<string, CardPipeline[]>();
    for (const c of visibles) {
      const xs = m.get(c.etapaId);
      if (xs) xs.push(c);
      else m.set(c.etapaId, [c]);
    }
    return m;
  }, [visibles]);
  const filtrando = q !== '' || candado !== 'todas' || sinMuestra;
  const mostrados = tramo === 'todos' ? todos : todos.filter((t) => t.clave === tramo);
  const enTramo = (c: CardPipeline) => mostrados.some((t) => t.etapas.some((e) => e.id === c.etapaId));
  const estadoDe = (e: EtapaGeneral): EstadoDestino =>
    !validos || !activa ? null : e.id === activa.etapaId ? 'origen' : validos.has(e.id) ? 'si' : 'no';
  const etapaActiva = activa ? etapaDe.get(activa.etapaId) : undefined;

  return (
    <div className="tablero space-y-4">
      <div className="tablero-barra flex flex-wrap items-center gap-2.5 p-2.5">
        <label className="min-w-52 flex-1">
          <span className="sr-only">Buscar</span>
          <span className="relative block">
            <Search
              size={15}
              strokeWidth={1.75}
              aria-hidden="true"
              className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground"
            />
            <input
              type="search"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
              placeholder="Franquiciatario, sucursal o ciudad"
              className="tablero-campo !mt-0 !pl-10"
            />
          </span>
        </label>
        <label className="flex items-center gap-2 text-[13px] font-semibold">
          <span className="text-muted-foreground">Candado</span>
          <select
            value={candado}
            onChange={(e) => setCandado(e.target.value as FiltroCandado)}
            className="tablero-campo !mt-0 w-48 !py-0 !pl-4"
          >
            <option value="todas">Todas</option>
            <option value="bloqueada">Bloqueadas</option>
            <option value="lista">Listas para avanzar</option>
            <option value="liberada">Con candado liberado</option>
          </select>
        </label>
        <button
          type="button"
          role="switch"
          aria-checked={sinMuestra}
          onClick={() => setSinMuestra((x) => !x)}
          className="inline-flex h-10 items-center gap-2 rounded-full px-2 text-[13px] font-semibold text-ink-2"
        >
          <span aria-hidden="true" className="tablero-interruptor" />
          Ocultar muestra
        </button>
        <div className="tablero-segmento ml-auto" role="group" aria-label="Vista">
          {(
            [
              ['kanban', 'Kanban', Columns3],
              ['tabla', 'Tabla', Table2],
            ] as const
          ).map(([v, nombre, Icono]) => (
            <button key={v} type="button" aria-pressed={vista === v} onClick={() => setVista(v)}>
              <Icono size={14} strokeWidth={1.75} aria-hidden="true" /> {nombre}
            </button>
          ))}
        </div>
      </div>

      {/* Selector de tramo: en teléfono enfoca un tramo; en escritorio filtra el tablero. */}
      <div className="max-w-full overflow-x-auto pb-1">
        <div role="group" aria-label="Tramo del proceso" className="tablero-segmento tablero-segmento-suelto">
          {[{ clave: 'todos' as const, nombre: 'Todo el proceso', area: null }, ...todos].map((t) => (
            <button key={t.clave} type="button" aria-pressed={tramo === t.clave} onClick={() => setTramo(t.clave)}>
              {t.area && (
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full ring-2 ring-white/70"
                  style={{ background: AREAS[t.area].color }}
                />
              )}
              {t.nombre}
            </button>
          ))}
        </div>
      </div>

      {aviso && (
        <p
          aria-live="polite"
          className={cn(
            'tablero-barra px-4 py-2.5 text-sm font-medium',
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
          collisionDetection={colision}
          onDragStart={alTomar}
          onDragEnd={alSoltar}
          onDragCancel={() => setActiva(null)}
          autoScroll={{ threshold: { x: 0.12, y: 0.18 }, acceleration: 14 }}
          accessibility={{ announcements: anuncios }}
        >
          {/* El desplazamiento horizontal vive dentro del riel, nunca en la página. */}
          <Riel ocupado={guardando}>
            <div className="flex w-max gap-7 px-1 pt-1">
              {mostrados.map((t) => (
                <div key={t.clave} className="space-y-3">
                  <h2 className="tablero-tramo">
                    {t.area && (
                      <span
                        aria-hidden="true"
                        className="size-2.5 rounded-full"
                        style={{ background: AREAS[t.area].color }}
                      />
                    )}
                    {t.nombre}
                  </h2>
                  <div className="flex gap-3">
                    {t.etapas.map((e) => {
                      const cs = porEtapa.get(e.id) ?? SIN_CARDS;
                      return (
                        <Columna
                          key={e.id}
                          etapa={e}
                          etapas={etapas}
                          cards={cs}
                          total={filtrando ? cs.length : (totales?.[e.id] ?? cs.length)}
                          editable={editable && (!movibles || movibles.includes(e.id))}
                          ahora={ahora}
                          destino={estadoDe(e)}
                          alMover={alMover}
                        />
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
          </Riel>
          {/* La copia flota en el body: ningún contenedor con scroll o recorte la tapa. */}
          {montado &&
            createPortal(
              <DragOverlay dropAnimation={reducido ? null : soltar} zIndex={80}>
                {activa && etapaActiva ? (
                  // Dentro de .tablero para heredar sus variables (el portal la saca del árbol).
                  <div className="tablero">
                    <CardPipelineVista card={activa} etapa={etapaActiva} ahora={ahora} flotante />
                  </div>
                ) : null}
              </DragOverlay>,
              document.body,
            )}
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
