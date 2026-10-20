import Link from 'next/link';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { claseCampo } from './nueva-tienda';

export const POR_PAGINA = 25;

/** Texto seguro para un filtro `or` de PostgREST (sin comas, paréntesis ni comodines). */
export const textoBusqueda = (q: string | undefined) =>
  (q ?? '')
    .replace(/[,()*%\\]/g, ' ')
    .trim()
    .slice(0, 80);

const conParams = (ruta: string, params: Record<string, string | undefined>) => {
  const p = new URLSearchParams(Object.entries(params).filter(([, v]) => v) as [string, string][]);
  const s = p.toString();
  return s ? `${ruta}?${s}` : ruta;
};

/** Buscador por GET: la búsqueda y los filtros viven en la URL (enlazables y sin JS). */
export function Buscador({
  ruta,
  q,
  placeholder,
  children,
}: {
  ruta: string;
  q?: string;
  placeholder: string;
  children?: React.ReactNode;
}) {
  return (
    <form action={ruta} className="flex flex-wrap items-center gap-2" role="search">
      <label className="relative flex min-w-56 flex-1 items-center sm:max-w-sm">
        <span className="sr-only">{placeholder}</span>
        <Search size={15} aria-hidden="true" className="absolute left-3 text-muted-foreground" />
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder={placeholder}
          className={`${claseCampo} pl-9`}
        />
      </label>
      {children}
      <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
        Buscar
      </button>
    </form>
  );
}

export function Paginacion({
  ruta,
  params,
  pagina,
  total,
}: {
  ruta: string;
  params: Record<string, string | undefined>;
  pagina: number;
  total: number;
}) {
  // Sin registros, el estado vacío de la lista ya lo explica.
  if (total === 0) return null;
  const paginas = Math.max(1, Math.ceil(total / POR_PAGINA));
  const enlace = (n: number) => conParams(ruta, { ...params, pagina: n > 1 ? String(n) : undefined });
  const clase =
    'inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 text-sm';
  return (
    <nav
      aria-label="Paginación"
      className="flex items-center justify-between gap-3 text-sm text-muted-foreground"
    >
      <span>
        {total === 0
          ? 'Sin resultados'
          : `${(pagina - 1) * POR_PAGINA + 1}–${Math.min(pagina * POR_PAGINA, total)} de ${total}`}
      </span>
      <span className="flex gap-2">
        {pagina > 1 ? (
          <Link href={enlace(pagina - 1)} className={clase} rel="prev">
            <ChevronLeft size={14} aria-hidden="true" /> Anterior
          </Link>
        ) : null}
        {pagina < paginas ? (
          <Link href={enlace(pagina + 1)} className={clase} rel="next">
            Siguiente <ChevronRight size={14} aria-hidden="true" />
          </Link>
        ) : null}
      </span>
    </nav>
  );
}

export const paginaDe = (s: string | undefined) =>
  Math.max(1, Math.min(10000, Number.parseInt(s ?? '1', 10) || 1));
