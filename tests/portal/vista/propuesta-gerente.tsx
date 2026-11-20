import { useState } from 'react';
import {
  Banknote,
  Boxes,
  ClipboardList,
  PackageCheck,
  ReceiptText,
  Thermometer,
  Trash2,
  UsersRound,
  Wrench,
} from 'lucide-react';
import { cn } from 'cn';
import { Button } from '../../../components/ui/button';
import { dinero } from '../../../components/sucursales/formato';

/**
 * PROTOTIPO de la propuesta del gerente (docs/franquiciatarios/02-PROPUESTA-GERENTE.md). Solo en el arnés: nada se
 * guarda. Muestra el mapa de apartados y dos pantallas de ejemplo (arqueo por denominación y mermas).
 */
const APARTADOS = [
  {
    id: 'arqueo',
    nombre: 'Arqueo y cierre del día',
    prioridad: 'P1',
    icono: Banknote,
    texto: 'Conteo por denominación contra el efectivo del POS; recibe otra persona.',
  },
  {
    id: 'gastos',
    nombre: 'Gastos y caja chica',
    prioridad: 'P1',
    icono: ReceiptText,
    texto: 'Gasto con comprobante y foto; el gerente marca la reposición.',
  },
  {
    id: 'mermas',
    nombre: 'Mermas',
    prioridad: 'P1',
    icono: Trash2,
    texto: 'Producto del catálogo de Costeo, cantidad y motivo; cierre diario.',
  },
  {
    id: 'inventario',
    nombre: 'Inventarios y conteos',
    prioridad: 'P2',
    icono: Boxes,
    texto: 'Conteo contra el consumo teórico de las recetas.',
  },
  {
    id: 'recepciones',
    nombre: 'Recepciones',
    prioridad: 'P2',
    icono: PackageCheck,
    texto: 'Lo que llega de la Comercializadora, con diferencias.',
  },
  {
    id: 'bitacoras',
    nombre: 'Bitácoras',
    prioridad: 'P2',
    icono: Thermometer,
    texto: 'Temperaturas, baños y limpieza profunda; fuera de rango = aviso.',
  },
  {
    id: 'turnos',
    nombre: 'Equipo y turnos',
    prioridad: 'P3',
    icono: UsersRound,
    texto: 'Turnos, asistencia y PIN opcional de baristas.',
  },
  {
    id: 'activos',
    nombre: 'Activos',
    prioridad: 'P3',
    icono: Wrench,
    texto: 'Equipos y mantenimientos con evidencia.',
  },
  {
    id: 'reportes',
    nombre: 'Reportes',
    prioridad: 'P3',
    icono: ClipboardList,
    texto: 'Semana de la tienda: venta, cumplimiento, mermas, arqueos.',
  },
] as const;

const DENOMINACIONES = [1000, 500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5];

export function PropuestaGerente() {
  const [abierto, setAbierto] = useState<'arqueo' | 'mermas' | null>('arqueo');
  return (
    <div className="space-y-6">
      <p className="rounded-xl border border-line bg-surface-2 px-4 py-3 text-sm text-ink-2">
        Prototipo de la propuesta: los apartados del gerente que faltan, en orden de prioridad. Nada de esto
        se guarda.
      </p>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {APARTADOS.map((a) => (
          <li key={a.id}>
            <button
              type="button"
              onClick={() => (a.id === 'arqueo' || a.id === 'mermas') && setAbierto(a.id)}
              className={cn(
                'flex h-full w-full items-start gap-3 rounded-2xl border bg-surface p-4 text-left shadow-card',
                abierto === a.id ? 'border-ink' : 'border-line hover:border-line-strong',
              )}
            >
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink">
                <a.icono size={18} aria-hidden="true" />
              </span>
              <span>
                <span className="flex items-center gap-2 font-display font-bold">
                  {a.nombre}
                  <span className="rounded-full bg-crema-soft px-2 py-0.5 text-[11px] font-semibold text-crema-strong">
                    {a.prioridad}
                  </span>
                </span>
                <span className="mt-1 block text-sm text-muted-foreground">{a.texto}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
      {abierto === 'arqueo' ? <Arqueo /> : abierto === 'mermas' ? <Mermas /> : null}
    </div>
  );
}

function Arqueo() {
  const [conteo, setConteo] = useState<Record<number, string>>({});
  const contado = DENOMINACIONES.reduce((s, d) => s + d * (Number(conteo[d]) || 0), 0);
  const esperado = 2_000 + 4_160 - 1_500; // fondo + efectivo del POS − retiros (ejemplo)
  const diferencia = contado - esperado;
  return (
    <section className="rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 className="text-lg">Arqueo de cierre (ejemplo)</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        Efectivo esperado = fondo {dinero(200_000)} + ventas en efectivo del POS {dinero(416_000)} − retiros{' '}
        {dinero(150_000)}.
      </p>
      <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-6">
        {DENOMINACIONES.map((d) => (
          <label key={d} className="text-sm font-medium text-ink">
            ${d}
            <input
              inputMode="numeric"
              value={conteo[d] ?? ''}
              onChange={(e) => setConteo((c) => ({ ...c, [d]: e.target.value.replace(/\D/g, '') }))}
              className="mt-1 block h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-base tabular"
              placeholder="0"
            />
          </label>
        ))}
      </div>
      <p
        className={cn(
          'mt-4 rounded-xl px-4 py-3 text-base font-semibold',
          diferencia === 0 ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
        )}
        aria-live="polite"
      >
        Contado {dinero(contado * 100)} ·{' '}
        {diferencia === 0
          ? 'la caja cuadra'
          : diferencia < 0
            ? `faltan ${dinero(-diferencia * 100)}`
            : `sobran ${dinero(diferencia * 100)}`}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <Button size="lg">Entregar arqueo</Button>
        <p className="self-center text-sm text-muted-foreground">
          Lo recibe otra persona con su propia sesión.
        </p>
      </div>
    </section>
  );
}

function Mermas() {
  const filas = [
    ['Croissant', '3 pza', 'Caducidad', 'Ana López', '22:10'],
    ['Leche entera', '0.8 l', 'Preparación', 'Beto Ruiz', '18:42'],
    ['Pumpkin Latte (Grande)', '1 pza', 'Devolución', 'Carla Ortiz', '13:05'],
  ];
  return (
    <section className="rounded-2xl border border-line bg-surface shadow-card">
      <h2 className="border-b border-line px-5 py-3 text-lg">Mermas de hoy (ejemplo)</h2>
      <table className="tabla">
        <thead>
          <tr>
            <th>Producto o insumo</th>
            <th>Cantidad</th>
            <th>Motivo</th>
            <th>Registró</th>
          </tr>
        </thead>
        <tbody>
          {filas.map(([p, c, m, n, h]) => (
            <tr key={p}>
              <td>{p}</td>
              <td className="tabular">{c}</td>
              <td>{m}</td>
              <td>
                {n} · {h}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="px-5 py-3 text-sm text-muted-foreground">
        El gerente cierra las mermas del día; después ya no se agregan.
      </p>
    </section>
  );
}
