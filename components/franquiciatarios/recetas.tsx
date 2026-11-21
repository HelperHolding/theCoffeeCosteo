'use client';
import { useMemo, useState } from 'react';
import {
  ChevronDown,
  Coffee,
  Cookie,
  Croissant,
  CupSoda,
  Leaf,
  Package,
  Sandwich,
  Search,
  Snowflake,
  Sparkles,
  type LucideIcon,
} from 'lucide-react';
import { cn } from 'cn';
import {
  cantidadTexto,
  type Ficha,
  type LineaFicha,
  type ProductoFicha,
} from '@/lib/franquiciatarios/recetas';
import { Vacio } from '@/components/portal/piezas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { TONO, TONOS_CICLO, type Tono } from './colores';

const normal = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('es-MX');

/** Ícono por palabra clave de la categoría o del producto (sin significado de estado). */
function iconoDe(texto: string): LucideIcon {
  const t = normal(texto);
  if (/matcha|\bte\b|chai/.test(t)) return Leaf;
  if (/frio|iced|frappe|cold|fresh|soda/.test(t)) return CupSoda;
  if (/caliente|cafe|latte|espresso|americano|bebida/.test(t)) return Coffee;
  if (/sandwich|sándwich|focaccia|croque|panini|salado/.test(t)) return Sandwich;
  if (/croissant|pan|panaderia|kouign|brioche/.test(t)) return Croissant;
  if (/cookie|galleta|brownie|postre|cake|panque/.test(t)) return Cookie;
  if (/hielo|gelato|helado/.test(t)) return Snowflake;
  if (/tienda|tumbler|bolsa|retail/.test(t)) return Package;
  return Sparkles;
}

/** Recetas estándar de la sucursal: insumos y cantidades por tamaño, sin costos. */
export function RecetasFranq({ ficha }: { ficha: Ficha }) {
  const [busca, setBusca] = useState('');
  const [categoria, setCategoria] = useState<string | null>(null);
  const [abierto, setAbierto] = useState<ProductoFicha | null>(null);
  const categorias = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of ficha.productos) m.set(p.categoria, (m.get(p.categoria) ?? 0) + 1);
    return [...m].map(([nombre, n], i) => ({ nombre, n, tono: TONOS_CICLO[i % TONOS_CICLO.length] }));
  }, [ficha]);
  const tonoCat = new Map(categorias.map((c) => [c.nombre, c.tono]));
  const visibles = ficha.productos.filter(
    (p) => (!categoria || p.categoria === categoria) && (!busca || normal(p.nombre).includes(normal(busca))),
  );
  const grupos = categorias
    .map((c) => ({ ...c, productos: visibles.filter((p) => p.categoria === c.nombre) }))
    .filter((g) => g.productos.length);

  if (!ficha.productos.length)
    return <Vacio titulo="Sin recetas">Todavía no hay productos con receta ligados al POS.</Vacio>;
  return (
    <div className="space-y-6">
      <div className="space-y-3">
        <label className="relative block max-w-xl">
          <span className="sr-only">Buscar producto</span>
          <Search
            size={17}
            className="pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <input
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Busca un producto: latte, matcha, croissant…"
            className="h-12 w-full rounded-2xl border border-line-strong bg-surface pr-4 pl-10 text-base text-ink shadow-card outline-none focus-visible:ring-[3px] focus-visible:ring-crema/35"
          />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Categoría">
          <Chip activo={categoria === null} onClick={() => setCategoria(null)}>
            Todas <span className="tabular opacity-70">{ficha.productos.length}</span>
          </Chip>
          {categorias.map((c) => {
            const Icono = iconoDe(c.nombre);
            return (
              <Chip
                key={c.nombre}
                activo={categoria === c.nombre}
                tono={c.tono}
                onClick={() => setCategoria(categoria === c.nombre ? null : c.nombre)}
              >
                <Icono size={14} aria-hidden="true" className={TONO[c.tono].texto} />
                {c.nombre} <span className="tabular opacity-70">{c.n}</span>
              </Chip>
            );
          })}
        </div>
      </div>

      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Ningún producto coincide con la búsqueda.</p>
      ) : (
        grupos.map((g) => {
          const t = TONO[g.tono];
          const Icono = iconoDe(g.nombre);
          return (
            <section key={g.nombre} aria-label={g.nombre} className="space-y-3">
              <h2 className="flex items-center gap-2.5 text-lg">
                <span
                  className={cn('grid size-8 place-items-center rounded-xl text-primary-foreground', t.marca)}
                >
                  <Icono size={16} aria-hidden="true" />
                </span>
                {g.nombre}
                <span className="text-sm font-normal text-ink-2">
                  {g.productos.length} {g.productos.length === 1 ? 'producto' : 'productos'}
                </span>
              </h2>
              <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                {g.productos.map((p) => (
                  <li key={p.id}>
                    <Tarjeta p={p} tono={g.tono} alAbrir={() => setAbierto(p)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <Receta
        producto={abierto}
        tono={abierto ? (tonoCat.get(abierto.categoria) ?? 'ventas') : 'ventas'}
        ficha={ficha}
        alCerrar={() => setAbierto(null)}
      />
    </div>
  );
}

function Chip({
  activo,
  tono,
  onClick,
  children,
}: {
  activo: boolean;
  tono?: Tono;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={activo}
      onClick={onClick}
      className={cn(
        'inline-flex h-9 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors',
        activo
          ? tono
            ? cn(TONO[tono].suave, TONO[tono].borde, 'text-ink')
            : 'border-ink bg-ink text-surface'
          : 'border-line-strong bg-surface text-ink-2 hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function Tarjeta({ p, tono, alAbrir }: { p: ProductoFicha; tono: Tono; alAbrir: () => void }) {
  const t = TONO[tono];
  const Icono = iconoDe(`${p.nombre} ${p.categoria}`);
  const insumos = Math.max(0, ...p.tamanos.map((x) => x.lineas.length));
  return (
    <button
      type="button"
      onClick={alAbrir}
      className={cn(
        'group relative flex h-full w-full flex-col gap-3 overflow-hidden rounded-2xl border p-4 text-left shadow-card transition-[box-shadow,border-color] hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
        t.brillo,
        t.borde,
      )}
    >
      <span className="flex items-start gap-3">
        <span className={cn('grid size-11 shrink-0 place-items-center rounded-xl', t.suave)}>
          <Icono size={20} aria-hidden="true" className={t.texto} />
        </span>
        <span className="min-w-0">
          <span className="block font-display text-base leading-tight font-bold">{p.nombre}</span>
          <span className="mt-0.5 block text-xs text-ink-2">
            {insumos} {insumos === 1 ? 'insumo' : 'insumos'}
          </span>
        </span>
      </span>
      <span className="mt-auto flex flex-wrap gap-1.5">
        {p.tamanos.map((x) => (
          <span
            key={x.tamano}
            className="rounded-full border border-line-strong bg-surface/80 px-2.5 py-0.5 text-xs font-semibold"
          >
            {x.tamano}
          </span>
        ))}
      </span>
    </button>
  );
}

function Receta({
  producto,
  tono,
  ficha,
  alCerrar,
}: {
  producto: ProductoFicha | null;
  tono: Tono;
  ficha: Ficha;
  alCerrar: () => void;
}) {
  const [tamano, setTamano] = useState<string | null>(null);
  const t = TONO[tono];
  const elegido = producto?.tamanos.find((x) => x.tamano === tamano) ?? producto?.tamanos[0];
  const Icono = producto ? iconoDe(`${producto.nombre} ${producto.categoria}`) : Sparkles;
  return (
    <Dialog
      open={producto !== null}
      onOpenChange={(o) => {
        if (!o) {
          alCerrar();
          setTamano(null);
        }
      }}
    >
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-line bg-surface p-0 sm:max-w-lg">
        {producto && (
          <>
            <DialogHeader className={cn('relative space-y-2 border-b p-5', t.brillo, t.borde)}>
              <span
                className={cn('grid size-12 place-items-center rounded-2xl text-primary-foreground', t.marca)}
              >
                <Icono size={22} aria-hidden="true" />
              </span>
              <DialogTitle className="font-display text-2xl leading-tight">{producto.nombre}</DialogTitle>
              <DialogDescription>{producto.categoria} · cantidades por unidad vendida</DialogDescription>
            </DialogHeader>
            <div className="space-y-4 p-5">
              {producto.tamanos.length > 1 && (
                <div
                  className="grid gap-1 rounded-2xl bg-surface-2 p-1"
                  style={{ gridTemplateColumns: `repeat(${producto.tamanos.length}, minmax(0, 1fr))` }}
                  role="tablist"
                  aria-label="Tamaño"
                >
                  {producto.tamanos.map((x) => {
                    const activo = x.tamano === elegido?.tamano;
                    return (
                      <button
                        key={x.tamano}
                        type="button"
                        role="tab"
                        aria-selected={activo}
                        onClick={() => setTamano(x.tamano)}
                        className={cn(
                          'h-10 rounded-xl text-sm font-semibold transition-colors',
                          activo
                            ? cn('text-primary-foreground shadow-card', t.marca)
                            : 'text-ink-2 hover:text-ink',
                        )}
                      >
                        {x.tamano}
                      </button>
                    );
                  })}
                </div>
              )}
              {elegido && elegido.lineas.length ? (
                <ul className="space-y-2">
                  {elegido.lineas.map((l, i) => (
                    <Linea key={`${l.nombre}-${i}`} l={l} ficha={ficha} tono={tono} />
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-muted-foreground">Este tamaño no tiene insumos capturados.</p>
              )}
              <p className="text-xs text-muted-foreground">
                Del recetario de Costeo. Sin pasos de preparación todavía.
              </p>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Cantidad({ l, tono }: { l: LineaFicha; tono: Tono }) {
  return (
    <span className={cn('shrink-0 rounded-xl px-2.5 py-1 text-right tabular', TONO[tono].suave)}>
      <span className="font-display text-base font-black">{cantidadTexto(l.cantidad)}</span>{' '}
      <span className="text-xs font-semibold text-ink-2">{l.unidad}</span>
    </span>
  );
}

function Linea({ l, ficha, tono }: { l: LineaFicha; ficha: Ficha; tono: Tono }) {
  const [abierta, setAbierta] = useState(false);
  const sub = l.subrecetaId ? ficha.subrecetas[l.subrecetaId] : undefined;
  const nombre = (
    <span className="min-w-0 text-sm font-medium text-ink capitalize">
      {l.nombre.toLocaleLowerCase('es-MX')}
    </span>
  );
  if (!sub)
    return (
      <li className="flex items-center justify-between gap-3 rounded-xl border border-line px-3 py-2">
        {nombre}
        <Cantidad l={l} tono={tono} />
      </li>
    );
  return (
    <li className="overflow-hidden rounded-xl border border-dashed border-line-strong">
      <button
        type="button"
        aria-expanded={abierta}
        onClick={() => setAbierta((x) => !x)}
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
      >
        <span className="flex min-w-0 items-center gap-1.5">
          <ChevronDown
            size={15}
            aria-hidden="true"
            className={cn('shrink-0 text-ink-2 transition-transform', abierta && 'rotate-180')}
          />
          {nombre}
          <span className="shrink-0 rounded-full bg-surface-2 px-2 py-0.5 text-[11px] font-semibold text-ink-2">
            Preparación
          </span>
        </span>
        <Cantidad l={l} tono={tono} />
      </button>
      {abierta && (
        <div className="space-y-1.5 border-t border-line bg-surface-2/50 px-3 py-2.5">
          <p className="text-xs font-semibold text-ink-2">
            Lote de {cantidadTexto(sub.rendimiento)} {sub.unidad}
          </p>
          <ul className="divide-y divide-line">
            {sub.lineas.map((x, i) => (
              <li
                key={`${x.nombre}-${i}`}
                className="flex items-baseline justify-between gap-3 py-1.5 text-sm"
              >
                <span className="capitalize">{x.nombre.toLocaleLowerCase('es-MX')}</span>
                <span className="tabular font-semibold">
                  {cantidadTexto(x.cantidad)} {x.unidad}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}
