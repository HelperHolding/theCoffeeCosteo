import { cn } from 'cn';
import type { Origen } from '@/lib/sucursales/normalizar';

/**
 * Colores de datos de Sucursales (skill dataviz, paleta de referencia validada con
 * validate_palette.js sobre la superficie #ffffff del portal). El color sigue a la ENTIDAD, nunca al
 * rango: Tarjeta siempre es aqua, App siempre naranja, aunque cambien filtros u orden.
 * - Origen (2, todos los pares): PASS en todas las pruebas.
 * - Pagos (4, adyacentes en barra apilada): PASS; aqua/amarillo/magenta < 3:1 → siempre con etiqueta visible.
 * - Hoy vs semana pasada: azul contra gris de referencia (gris = "comparación", no una categoría).
 * El texto nunca usa el color de la serie: el color va en la marca (punto, barra, línea) junto al texto.
 */
export const COLOR_ORIGEN: Record<Origen, string> = {
  mostrador: '#6250d6',
  app: '#eb6834',
  rappi: '#e34948',
  desconocido: '#a39e94',
};

const PAGOS: Record<string, string> = {
  CARTAO: '#1baf7a',
  DINHEIRO: '#eda100',
  VIRTUAL_WALLET: '#e87ba4',
  WALLET_BALANCE: '#008300',
  RAPPI: '#e34948',
};
export const colorPago = (metodo: string) => PAGOS[metodo] ?? '#a39e94';

export const SERIE_HOY = '#2a78d6';
export const SERIE_BASE = '#a39e94';
/** Rampa secuencial azul (magnitud): barras en línea y celdas de intensidad. */
export const AZUL = { claro: '#cde2fb', medio: '#86b6ef', fuerte: '#2a78d6', profundo: '#184f95' };

export type TipoPersonalizacion = 'tamano' | 'leche' | 'cafe' | 'temperatura' | 'dulzor' | 'extra';
export const TIPOS: Record<TipoPersonalizacion, { nombre: string; color: string }> = {
  tamano: { nombre: 'Tamaño', color: '#6250d6' },
  leche: { nombre: 'Leche', color: '#1baf7a' },
  cafe: { nombre: 'Café', color: '#2a78d6' },
  temperatura: { nombre: 'Temperatura', color: '#eb6834' },
  dulzor: { nombre: 'Dulzor', color: '#e87ba4' },
  extra: { nombre: 'Extra', color: '#eda100' },
};

/** Clasificación por nombre (heurística visual; no cambia ninguna cifra). */
export function tipoPersonalizacion(nombre: string): TipoPersonalizacion {
  const n = nombre.toLocaleLowerCase('es-MX');
  if (/\b\d{2,4}\s?ml\b/.test(n)) return 'tamano';
  if (/milk|leche|lactose|deslact|almond|almendra|oat|avena|coco|soy|soya/.test(n)) return 'leche';
  if (/shot|espresso|decaf|descaf|caf[eé]/.test(n)) return 'cafe';
  if (/[º°]c|hot|iced|fr[ií]o|caliente|temp/.test(n)) return 'temperatura';
  if (/honey|miel|sugar|az[uú]car|syrup|jarabe|sweet|stevia|splenda/.test(n)) return 'dulzor';
  return 'extra';
}

/** Etiqueta con punto de color y fondo teñido; el texto queda en tinta (contraste AA). */
export function Etiqueta({
  color,
  children,
  className,
  titulo,
}: {
  color: string;
  children: React.ReactNode;
  className?: string;
  titulo?: string;
}) {
  return (
    <span
      title={titulo}
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium text-ink-2',
        className,
      )}
      style={{ backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}40` }}
    >
      <span aria-hidden="true" className="size-2 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      {children}
    </span>
  );
}

/** Barra de magnitud dentro de una celda: el número va al lado, en tinta. */
export function BarraCelda({
  valor,
  max,
  color = AZUL.fuerte,
}: {
  valor: number;
  max: number;
  color?: string;
}) {
  const pct = max > 0 ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span
      aria-hidden="true"
      className="block h-1.5 w-full min-w-16 overflow-hidden rounded-full bg-surface-2"
    >
      <span className="block h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: color }} />
    </span>
  );
}

/** Variación con flecha + texto (estado: verde sube, rojo baja; nunca color solo). */
export function Delta({ valor, sufijo }: { valor: number | null; sufijo?: string }) {
  if (valor === null)
    return (
      <span className="text-xs text-muted-foreground">sin base comparable{sufijo ? ` ${sufijo}` : ''}</span>
    );
  const sube = valor >= 0;
  const pct = new Intl.NumberFormat('es-MX', {
    style: 'percent',
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  }).format(Math.abs(valor));
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
      <span
        className={cn(
          'inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold tabular',
          sube ? 'bg-ok-soft text-ok' : 'bg-bad-soft text-bad',
        )}
      >
        <span aria-hidden="true">{sube ? '▲' : '▼'}</span>
        <span className="sr-only">{sube ? 'sube' : 'baja'}</span>
        {pct}
      </span>
      {sufijo}
    </span>
  );
}
