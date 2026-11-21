'use client';
import { useMemo, useState } from 'react';
import { ChevronDown, Search } from 'lucide-react';
import { cn } from 'cn';
import {
  cantidadTexto,
  type Ficha,
  type LineaFicha,
  type ProductoFicha,
} from '@/lib/franquiciatarios/recetas';
import { Vacio } from '@/components/portal/piezas';

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');

/** Recetas estándar de la sucursal: insumos y cantidades por tamaño, sin costos. */
export function RecetasFranq({ ficha }: { ficha: Ficha }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(ficha.productos.map((p) => p.categoria))], [ficha]);
  const visibles = ficha.productos.filter(
    (p) => (!categoria || p.categoria === categoria) && (!busca || normal(p.nombre).includes(normal(busca))),
  );
  if (!ficha.productos.length)
    return <Vacio titulo="Sin recetas">Todavía no hay productos con receta ligados al POS.</Vacio>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative min-w-0 flex-1 basis-60">
          <span className="sr-only">Buscar producto</span>
          <Search
            size={16}
            className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar producto"
            className="h-10 w-full rounded-[10px] border border-line-strong bg-surface pr-3 pl-9 text-sm text-ink outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
          />
        </label>
        <div className="flex flex-wrap gap-1.5" role="group" aria-label="Categoría">
          {[null, ...categorias].map((c) => (
            <button
              key={c ?? 'todas'}
              type="button"
              aria-pressed={categoria === c}
              onClick={() => setCategoria(c)}
              className={cn(
                'h-9 rounded-full border px-3 text-sm',
                categoria === c
                  ? 'border-ink bg-ink text-surface'
                  : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
              )}
            >
              {c ?? 'Todas'}
            </button>
          ))}
        </div>
      </div>
      {visibles.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún producto coincide con la búsqueda.</p>
      ) : (
        <ul className="space-y-2">
          {visibles.map((p) => (
            <Producto key={p.id} p={p} ficha={ficha} />
          ))}
        </ul>
      )}
    </div>
  );
}

function Producto({ p, ficha }: { p: ProductoFicha; ficha: Ficha }) {
  const [abierto, setAbierto] = useState(false);
  const [tamano, setTamano] = useState(p.tamanos[0]?.tamano ?? '');
  const actual = p.tamanos.find((t) => t.tamano === tamano);
  return (
    <li className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <button
        type="button"
        aria-expanded={abierto}
        onClick={() => setAbierto((x) => !x)}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <span className="min-w-0 flex-1">
          <span className="block font-semibold text-ink">{p.nombre}</span>
          <span className="block text-xs text-ink-2">
            {p.categoria} · {p.tamanos.map((t) => t.tamano).join(', ')}
          </span>
        </span>
        <ChevronDown
          size={18}
          className={cn('shrink-0 text-ink-2 transition-transform', abierto && 'rotate-180')}
          aria-hidden="true"
        />
      </button>
      {abierto && (
        <div className="space-y-3 border-t border-line px-4 py-3">
          {p.tamanos.length > 1 && (
            <div className="flex gap-1.5" role="tablist" aria-label={`Tamaños de ${p.nombre}`}>
              {p.tamanos.map((t) => (
                <button
                  key={t.tamano}
                  type="button"
                  role="tab"
                  aria-selected={t.tamano === tamano}
                  onClick={() => setTamano(t.tamano)}
                  className={cn(
                    'h-9 rounded-[10px] border px-3 text-sm',
                    t.tamano === tamano
                      ? 'border-ink bg-ink text-surface'
                      : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
                  )}
                >
                  {t.tamano}
                </button>
              ))}
            </div>
          )}
          {actual && actual.lineas.length ? (
            <Lineas lineas={actual.lineas} ficha={ficha} />
          ) : (
            <p className="text-sm text-muted-foreground">Este tamaño no tiene insumos capturados.</p>
          )}
        </div>
      )}
    </li>
  );
}

function Lineas({ lineas, ficha, anidada }: { lineas: LineaFicha[]; ficha: Ficha; anidada?: boolean }) {
  return (
    <ul className={cn('divide-y divide-line', anidada && 'rounded-xl bg-surface-2/60 px-3')}>
      {lineas.map((l, i) => (
        <Linea key={`${l.nombre}-${i}`} l={l} ficha={ficha} />
      ))}
    </ul>
  );
}

function Linea({ l, ficha }: { l: LineaFicha; ficha: Ficha }) {
  const [abierta, setAbierta] = useState(false);
  const sub = l.subrecetaId ? ficha.subrecetas[l.subrecetaId] : undefined;
  const cifra = (
    <span className="shrink-0 tabular font-semibold text-ink">
      {cantidadTexto(l.cantidad)} {l.unidad}
    </span>
  );
  if (!sub)
    return (
      <li className="flex items-baseline justify-between gap-3 py-2 text-sm">
        <span className="min-w-0 text-ink">{l.nombre}</span>
        {cifra}
      </li>
    );
  return (
    <li className="py-2 text-sm">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => setAbierta((x) => !x)}
        className="flex w-full items-baseline justify-between gap-3 text-left"
      >
        <span className="min-w-0 text-ink">
          {l.nombre}{' '}
          <span className="text-xs text-ink-2 underline underline-offset-2">
            {abierta ? 'ocultar preparación' : 'ver preparación'}
          </span>
        </span>
        {cifra}
      </button>
      {abierta && (
        <div className="mt-2 space-y-1">
          <p className="text-xs text-ink-2">
            Lote de {cantidadTexto(sub.rendimiento)} {sub.unidad}:
          </p>
          <Lineas lineas={sub.lineas} ficha={ficha} anidada />
        </div>
      )}
    </li>
  );
}
