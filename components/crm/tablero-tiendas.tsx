'use client';
import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  closestCorners,
  useDroppable,
  useSensor,
  useSensors,
  type Announcements,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core';
import { SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Columns3, Search, Table2 } from 'lucide-react';
import { cn } from 'cn';
import {
  columnas,
  coincide,
  mover,
  sinFiltros,
  type Columna,
  type Filtros,
  type TarjetaTienda as Datos,
} from '@/lib/crm/kanban';
import { TIPOS_FRANQUICIA } from '@/lib/crm/tipos';
import { moverTienda } from '@/app/(crm)/crm/acciones';
import { TarjetaTienda, MoverA } from './tarjeta-tienda';

type EtapaTablero = Columna['etapa'];

function ColumnaKanban({
  columna,
  visibles,
  etapas,
  editable,
  alMover,
}: {
  columna: Columna;
  visibles: Datos[];
  etapas: EtapaTablero[];
  editable: boolean;
  alMover: (tienda: string, etapa: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: columna.etapa.id, data: { tipo: 'columna' } });
  const tono = {
    abierta: 'border-t-ink',
    ganada: 'border-t-ok',
    lateral: 'border-t-warn',
    perdida: 'border-t-line-strong',
  }[columna.etapa.tipo];
  return (
    <section
      aria-labelledby={`columna-${columna.etapa.id}`}
      className={cn(
        'flex w-[272px] shrink-0 snap-start flex-col rounded-2xl border border-t-[3px] border-line bg-surface-2/60',
        tono,
        isOver && 'ring-2 ring-crema/40',
      )}
    >
      <header className="flex items-center justify-between gap-2 px-3 pb-2 pt-3">
        <h2 id={`columna-${columna.etapa.id}`} className="text-[13px] font-semibold leading-tight">
          {columna.etapa.nombre}
        </h2>
        <span className="rounded-full bg-surface px-2 py-0.5 text-xs font-semibold tabular text-ink-2">
          {visibles.length}
          {visibles.length !== columna.tarjetas.length && (
            <span className="font-normal text-muted-foreground">/{columna.tarjetas.length}</span>
          )}
        </span>
      </header>
      <SortableContext items={visibles.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        <ul
          ref={setNodeRef}
          className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-3"
          aria-label={columna.etapa.nombre}
        >
          {visibles.map((t) => (
            <li key={t.id}>
              <TarjetaTienda
                tarjeta={t}
                etapas={etapas}
                editable={editable}
                alMover={(e) => alMover(t.id, e)}
              />
            </li>
          ))}
          {visibles.length === 0 && (
            <li className="rounded-xl border border-dashed border-line px-3 py-6 text-center text-xs text-muted-foreground">
              Sin tiendas
            </li>
          )}
        </ul>
      </SortableContext>
    </section>
  );
}

export function TableroTiendas({
  etapas,
  tarjetas,
  editable,
}: {
  etapas: EtapaTablero[];
  tarjetas: Datos[];
  editable: boolean;
}) {
  const [tablero, setTablero] = useState(() => columnas(etapas, tarjetas));
  const [filtros, setFiltros] = useState<Filtros>(sinFiltros);
  const [vista, setVista] = useState<'kanban' | 'tabla'>('kanban');
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null);
  const [activa, setActiva] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const ordenadas = useMemo(() => [...etapas].sort((a, b) => a.orden - b.orden), [etapas]);
  const nombreEtapa = (id: string) => ordenadas.find((e) => e.id === id)?.nombre ?? '';
  const todas = tablero.flatMap((c) => c.tarjetas);
  const nombreTienda = (id: string | number) => todas.find((t) => t.id === id)?.nombre ?? 'la tienda';
  const etapaDe = (id: string) =>
    tablero.find((c) => c.etapa.id === id || c.tarjetas.some((t) => t.id === id))?.etapa;

  const sensores = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 6 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  /** Movimiento optimista con rollback visible si la base lo rechaza. */
  function aplicar(tiendaId: string, etapaDestino: string, indice: number) {
    const antes = tablero;
    const tarjeta = todas.find((t) => t.id === tiendaId);
    const r = mover(tablero, tiendaId, etapaDestino, indice);
    if (!r || !tarjeta) return;
    setTablero(r.tablero);
    const destino = nombreEtapa(etapaDestino);
    iniciar(async () => {
      const res = await moverTienda(tiendaId, etapaDestino, r.posicion, tarjeta.version);
      if (res.error !== undefined) {
        setTablero(antes);
        setAviso({ tipo: 'error', texto: `No se movió ${tarjeta.nombre}: ${res.error}` });
        return;
      }
      const { version, posicion } = res;
      setTablero((actual) =>
        actual.map((c) => ({
          ...c,
          tarjetas: c.tarjetas.map((t) => (t.id === tiendaId ? { ...t, version, posicion } : t)),
        })),
      );
      setAviso({ tipo: 'ok', texto: `${tarjeta.nombre} se movió a ${destino}.` });
    });
  }

  const alMoverMenu = (tienda: string, etapa: string) =>
    aplicar(tienda, etapa, tablero.find((c) => c.etapa.id === etapa)?.tarjetas.length ?? 0);

  function alSoltar(e: DragEndEvent) {
    setActiva(null);
    if (!e.over) return;
    const tienda = String(e.active.id);
    const sobre = String(e.over.id);
    const destino = etapaDe(sobre);
    if (!destino) return;
    const columna = tablero.find((c) => c.etapa.id === destino.id)!;
    // Índice en la columna completa (no en la filtrada) para no perder tarjetas ocultas por los filtros.
    const sinActiva = columna.tarjetas.filter((t) => t.id !== tienda);
    const iSobre = sinActiva.findIndex((t) => t.id === sobre);
    const origen = columna.tarjetas.findIndex((t) => t.id === tienda);
    const iOriginalSobre = columna.tarjetas.findIndex((t) => t.id === sobre);
    const indice =
      iSobre === -1 ? sinActiva.length : origen !== -1 && origen < iOriginalSobre ? iSobre + 1 : iSobre;
    if (origen !== -1 && origen === (iSobre === -1 ? columna.tarjetas.length - 1 : iOriginalSobre)) return;
    aplicar(tienda, destino.id, indice);
  }

  const anuncios: Announcements = {
    onDragStart: ({ active }) => `Tomaste ${nombreTienda(active.id)}.`,
    onDragOver: ({ active, over }) =>
      over ? `${nombreTienda(active.id)} está sobre ${etapaDe(String(over.id))?.nombre ?? ''}.` : undefined,
    onDragEnd: ({ active, over }) =>
      over
        ? `Soltaste ${nombreTienda(active.id)} en ${etapaDe(String(over.id))?.nombre ?? ''}.`
        : 'Movimiento cancelado.',
    onDragCancel: ({ active }) => `Se canceló el movimiento de ${nombreTienda(active.id)}.`,
  };

  const visiblesDe = (c: Columna) => c.tarjetas.filter((t) => coincide(t, filtros));
  const totalVisibles = tablero.reduce((n, c) => n + visiblesDe(c).length, 0);
  const tarjetaActiva = activa ? todas.find((t) => t.id === activa) : undefined;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-56 flex-1 items-center sm:max-w-sm">
          <span className="sr-only">Buscar tienda</span>
          <Search size={15} aria-hidden="true" className="absolute left-3 text-muted-foreground" />
          <input
            type="search"
            value={filtros.texto}
            onChange={(e) => setFiltros({ ...filtros, texto: e.target.value })}
            placeholder="Buscar tienda, franquiciatario o ciudad"
            className="h-10 w-full rounded-[10px] border border-line-strong bg-surface pl-9 pr-3 text-sm shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
          />
        </label>
        <label className="sr-only" htmlFor="filtro-tipo">
          Tipo de franquicia
        </label>
        <select
          id="filtro-tipo"
          value={filtros.tipo}
          onChange={(e) => setFiltros({ ...filtros, tipo: e.target.value as Filtros['tipo'] })}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm shadow-card"
        >
          <option value="">Todos los tipos</option>
          {Object.entries(TIPOS_FRANQUICIA).map(([v, n]) => (
            <option key={v} value={v}>
              {n}
            </option>
          ))}
          <option value="sin">Sin tipo</option>
        </select>
        <label className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm shadow-card">
          <input
            type="checkbox"
            checked={filtros.revisar}
            onChange={(e) => setFiltros({ ...filtros, revisar: e.target.checked })}
          />
          Por revisar
        </label>
        <div
          className="ml-auto inline-flex rounded-[10px] border border-line-strong bg-surface p-0.5 shadow-card"
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
                'inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-sm font-medium',
                vista === v ? 'bg-ink text-white' : 'text-ink-2 hover:bg-surface-2',
              )}
            >
              <Icono size={14} aria-hidden="true" /> {nombre}
            </button>
          ))}
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        {totalVisibles} de {todas.length} tiendas
        {editable && vista === 'kanban' && ' · Arrastra con el asa o usa "Mover a…" en cada tarjeta.'}
      </p>
      <div
        role="status"
        aria-live="polite"
        className={cn(
          'rounded-xl px-3 py-2 text-sm',
          !aviso && 'sr-only',
          aviso?.tipo === 'error' && 'bg-bad-soft text-bad',
          aviso?.tipo === 'ok' && 'bg-ok-soft text-ok',
        )}
      >
        {aviso?.texto}
      </div>

      {vista === 'kanban' ? (
        <DndContext
          sensors={sensores}
          collisionDetection={closestCorners}
          onDragStart={(e: DragStartEvent) => setActiva(String(e.active.id))}
          onDragCancel={() => setActiva(null)}
          onDragEnd={alSoltar}
          accessibility={{
            announcements: anuncios,
            screenReaderInstructions: {
              draggable:
                'Para mover una tienda, presiona espacio para tomarla, usa las flechas para cambiar de lugar o de etapa, espacio para soltar y Escape para cancelar.',
            },
          }}
        >
          <div className="relative -mx-4 flex snap-x gap-3 overflow-x-auto px-4 pb-4 md:-mx-8 md:px-8">
            {tablero.map((c) => (
              <ColumnaKanban
                key={c.etapa.id}
                columna={c}
                visibles={visiblesDe(c)}
                etapas={ordenadas}
                editable={editable}
                alMover={alMoverMenu}
              />
            ))}
          </div>
          <DragOverlay>
            {tarjetaActiva && (
              <div className="w-[256px] rotate-1 rounded-xl border border-line bg-surface p-3 shadow-lift">
                <p className="text-[13.5px] font-semibold">{tarjetaActiva.nombre}</p>
              </div>
            )}
          </DragOverlay>
        </DndContext>
      ) : (
        <div className="relative overflow-x-auto rounded-2xl border border-line bg-surface shadow-card">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="border-b border-line text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-3 font-medium">Tienda</th>
                <th className="px-4 py-3 font-medium">Etapa</th>
                <th className="px-4 py-3 font-medium">Franquiciatario</th>
                <th className="px-4 py-3 font-medium">Ciudad</th>
                <th className="px-4 py-3 font-medium">Tipo</th>
                <th className="px-4 py-3 text-right font-medium">Checklist</th>
                {editable && (
                  <th className="px-4 py-3">
                    <span className="sr-only">Acciones</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {tablero.flatMap((c) =>
                visiblesDe(c).map((t) => (
                  <tr key={t.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2.5 font-medium">
                      <Link href={`/crm/tiendas/${t.id}`} className="hover:underline">
                        {t.nombre}
                      </Link>
                    </td>
                    <td className="px-4 py-2.5">{c.etapa.nombre}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.franquiciatario ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-2">{t.ciudad ?? '—'}</td>
                    <td className="px-4 py-2.5 text-ink-2">
                      {t.tipo_franquicia ? TIPOS_FRANQUICIA[t.tipo_franquicia] : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-right tabular">
                      {t.checklist.total ? `${t.checklist.hechos}/${t.checklist.total}` : '—'}
                    </td>
                    {editable && (
                      <td className="px-2 py-2.5 text-right">
                        <MoverA tarjeta={t} etapas={ordenadas} alMover={(e) => alMoverMenu(t.id, e)} />
                      </td>
                    )}
                  </tr>
                )),
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
