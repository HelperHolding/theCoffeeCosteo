const n = (x: unknown) => Number(x) || 0;

export interface MovTraspaso {
  id: string;
  folio: string | null;
  fecha: string | null;
  sku: string;
  cantidad: number | null;
  cantidad_original: number | null;
  origen: string | null;
  destino: string | null;
  estado: string | null;
}
export interface GrupoTraspaso {
  folio: string;
  fecha: string | null;
  origen: string | null;
  destino: string | null;
  estado: 'ordenado' | 'ingresado';
  skus: number;
  uds: number;
  items: MovTraspaso[];
}
export const LUGARES = ['CEDIS', 'Yulius'] as const;
export interface FormTraspaso {
  folio: string;
  fecha: string;
  origen: string;
  destino: string;
  lineas: { sku: string; cantidad: number }[];
}

/** agrupar() de renderComTraspasos: piezas = lo ordenado (cantidad_original ?? cantidad). */
export function agruparTraspasos(filas: MovTraspaso[]): GrupoTraspaso[] {
  const g = new Map<string, MovTraspaso[]>();
  for (const r of filas) {
    const k = r.folio ?? '—';
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.entries()]
    .map(([folio, items]) => ({
      folio,
      fecha: items[0].fecha,
      origen: items[0].origen,
      destino: items[0].destino,
      estado: items.every((x) => x.estado === 'ingresado') ? ('ingresado' as const) : ('ordenado' as const),
      skus: items.length,
      uds: items.reduce((s, x) => s + n(x.cantidad_original ?? x.cantidad), 0),
      items,
    }))
    .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
}

/** Detalle del viejo: ordenado = original; ingresado = cantidad solo si ya hay original guardado. */
export function detalleTraspaso(r: MovTraspaso) {
  const ord = n(r.cantidad_original ?? r.cantidad);
  const ing = r.cantidad_original != null ? n(r.cantidad) : ord;
  return { ord, ing, dif: ing - ord };
}

/** Decisión 6: origen ≠ destino y SKUs del catálogo (el viejo no lo revisaba). */
export function validarTraspaso(f: FormTraspaso, skus: Set<string>): string | null {
  if (!f.folio.trim()) return 'Pon la referencia del traspaso';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return 'Pon la fecha del traspaso';
  const lugar = (x: string) => (LUGARES as readonly string[]).includes(x);
  if (!lugar(f.origen) || !lugar(f.destino)) return 'Elige el origen y el destino';
  if (f.origen === f.destino) return 'El origen y el destino deben ser distintos';
  const lineas = f.lineas.filter((l) => l.sku.trim() && Number(l.cantidad) > 0);
  if (!lineas.length) return 'Agrega al menos un artículo con cantidad';
  const malo = lineas.find((l) => !skus.has(l.sku.trim()));
  if (malo) return `SKU no encontrado: ${malo.sku.trim()}`;
  return null;
}

/** 'T-' + día (CDMX) + 3 dígitos al azar, como _comNuevoTraspaso. */
export const folioTraspaso = (hoy: string, azar: () => number = Math.random) =>
  `T-${hoy.replace(/-/g, '')}${Math.floor(azar() * 900) + 100}`;
