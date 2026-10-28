'use client';
import { useState } from 'react';
import { Calculator, Milk, ReceiptText, type LucideIcon } from 'lucide-react';
import { cn } from 'cn';
import type { SucursalInfo } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { VentasPos } from './ventas-pos';
import { SeccionCosteo } from './seccion-costeo';
import { SeccionConsumo } from './consumo';
import { guardarPeriodoEnUrl, type Periodo } from './periodo';

export type IdSeccion = 'ventas' | 'costeo' | 'consumo';
const SECCIONES: { id: IdSeccion; nombre: string; detalle: string; icono: LucideIcon }[] = [
  { id: 'ventas', nombre: 'Ventas', detalle: 'En vivo, tendencias, productos y pedidos', icono: ReceiptText },
  {
    id: 'costeo',
    nombre: 'Costeo',
    detalle: 'Costo actual de las recetas y margen teórico',
    icono: Calculator,
  },
  { id: 'consumo', nombre: 'Consumo', detalle: 'Insumos que piden las recetas de lo vendido', icono: Milk },
];

/** Sin Rappi en la API no hay filtro de Rappi, y «todos» es Mostrador + App. */
const opcionesOrigen = (rappi: boolean) => filtrosOrigen.filter((o) => rappi || o !== 'rappi');
const nombreOrigen = (o: FiltroOrigen, rappi: boolean) =>
  o === 'todos' && !rappi ? 'Mostrador + App' : etiquetaOrigen[o];

const conParametro = (nombre: string, valor: string | null) => {
  const params = new URLSearchParams(window.location.search);
  if (valor === null) params.delete(nombre);
  else params.set(nombre, valor);
  const s = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
};

/**
 * Una sucursal en tres secciones (docs/sucursales/13): Ventas (sin cambios), Costeo (solo con permiso; lo decide el
 * servidor y la API lo vuelve a exigir) y Consumo. El origen y el periodo son de la sucursal: se conservan al cambiar
 * de sección y viajan en la URL (?seccion, ?origen, ?periodo o ?desde/&hasta), así que un enlace abre lo mismo.
 */
export function SeccionesSucursal({
  sucursal,
  puedeCostear,
  seccionInicial,
  tabInicial,
  origenInicial,
  periodoInicial,
}: {
  sucursal: SucursalInfo;
  puedeCostear: boolean;
  seccionInicial: IdSeccion;
  tabInicial: string;
  origenInicial: FiltroOrigen;
  periodoInicial: Periodo;
}) {
  const visibles = SECCIONES.filter((s) => s.id !== 'costeo' || puedeCostear);
  const [seccion, setSeccion] = useState<IdSeccion>(
    visibles.some((s) => s.id === seccionInicial) ? seccionInicial : 'ventas',
  );
  const [tab, setTab] = useState(tabInicial);
  const origenes = opcionesOrigen(sucursal.rappi);
  const [origen, setOrigen] = useState<FiltroOrigen>(
    origenes.includes(origenInicial) ? origenInicial : 'todos',
  );
  const [periodo, setPeriodo] = useState<Periodo>(periodoInicial);

  const elegirSeccion = (s: IdSeccion) => {
    setSeccion(s);
    conParametro('seccion', s === 'ventas' ? null : s);
  };
  const elegirOrigen = (o: FiltroOrigen) => {
    setOrigen(o);
    conParametro('origen', o === 'todos' ? null : o);
  };
  const elegirPeriodo = (p: Periodo) => {
    setPeriodo(p);
    guardarPeriodoEnUrl(p);
  };
  const sinOrigen = seccion === 'ventas' && tab === 'rappi';

  return (
    <div className="space-y-6">
      <nav aria-label="Secciones de la sucursal" className="rounded-2xl bg-ink p-1.5 shadow-card">
        {/* En móvil, una fila compacta (icono sobre nombre); desde sm, con su descripción. */}
        <ul className="grid auto-cols-fr grid-flow-col gap-1.5">
          {visibles.map((s) => {
            const activa = s.id === seccion;
            const Icono = s.icono;
            return (
              <li key={s.id} className="min-w-0">
                <button
                  type="button"
                  aria-current={activa ? 'page' : undefined}
                  onClick={() => elegirSeccion(s.id)}
                  className={cn(
                    'flex h-full w-full flex-col items-center gap-1.5 rounded-xl px-2 py-2.5 text-center transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-crema sm:flex-row sm:gap-3 sm:px-4 sm:py-3 sm:text-left',
                    activa
                      ? 'bg-crema text-ink shadow-card'
                      : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <span
                    className={cn(
                      'grid size-9 shrink-0 place-items-center rounded-lg',
                      activa ? 'bg-ink text-crema' : 'bg-white/10',
                    )}
                  >
                    <Icono size={18} aria-hidden="true" />
                  </span>
                  <span className="min-w-0 max-w-full">
                    <span className="block font-display text-sm font-bold leading-tight sm:text-base">
                      {s.nombre}
                    </span>
                    <span
                      className={cn(
                        'hidden truncate text-xs sm:block',
                        activa ? 'text-ink-2' : 'text-white/60',
                      )}
                    >
                      {s.detalle}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line bg-surface px-4 py-3 shadow-card">
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="rounded-full bg-ink px-2.5 py-1 font-semibold text-white">
            API The Coffee · {sucursal.moneda}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-2">
            Hora local · {sucursal.zona}
          </span>
          <span className="rounded-full border border-line px-2.5 py-1 text-ink-2" title={sucursal.alcance}>
            {sucursal.rappi ? 'Incluye Rappi' : 'Sin Rappi en la API'}
          </span>
        </div>
        <fieldset className={cn('flex flex-wrap items-center gap-2', sinOrigen && 'hidden')}>
          <legend className="sr-only">Origen de los pedidos</legend>
          <span aria-hidden="true" className="text-xs font-medium text-muted-foreground">
            Origen
          </span>
          <div className="flex flex-wrap rounded-[10px] border border-line-strong bg-paper p-0.5">
            {origenes.map((o) => (
              <label
                key={o}
                className={cn(
                  'cursor-pointer rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-ink',
                  origen === o ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink',
                )}
              >
                <input
                  type="radio"
                  name="origen"
                  value={o}
                  checked={origen === o}
                  onChange={() => elegirOrigen(o)}
                  className="sr-only"
                />
                {nombreOrigen(o, sucursal.rappi)}
              </label>
            ))}
          </div>
        </fieldset>
      </div>
      <p className="placa px-3 py-2 text-xs text-muted-foreground">{sucursal.alcance}</p>

      {seccion === 'ventas' ? (
        <VentasPos
          sucursal={sucursal}
          tab={tab}
          alCambiarTab={setTab}
          origen={origen}
          periodo={periodo}
          alCambiarPeriodo={elegirPeriodo}
        />
      ) : seccion === 'costeo' ? (
        <SeccionCosteo
          key={`${sucursal.companyId}-${origen}`}
          sucursal={sucursal}
          origen={origen}
          periodo={periodo}
          alCambiarPeriodo={elegirPeriodo}
        />
      ) : (
        <SeccionConsumo
          key={`${sucursal.companyId}-${origen}`}
          sucursal={sucursal}
          origen={origen}
          periodo={periodo}
          alCambiarPeriodo={elegirPeriodo}
        />
      )}
    </div>
  );
}
