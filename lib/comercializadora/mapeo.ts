export interface Mapeo {
  shopify_nombre: string;
  sku: string | null;
  notas: string | null;
}
export interface FilaMapeo {
  nombre: string;
  sku: string | null;
  notas: string | null;
  categoria: string | null;
  nombreSku: string | null;
  mapeado: boolean;
}

/** Nombres de producto de los pedidos (items_editados || items; pueden venir como texto JSON). Exactos: decisión 9. */
export function nombresDePedidos(pedidos: { items: unknown; items_editados: unknown }[]): string[] {
  const s = new Set<string>();
  for (const p of pedidos) {
    let its: unknown = p.items_editados || p.items;
    if (typeof its === 'string') {
      try {
        its = JSON.parse(its);
      } catch {
        its = null;
      }
    }
    if (!Array.isArray(its)) continue;
    for (const it of its) {
      const nombre = (it as { nombre?: unknown } | null)?.nombre;
      if (typeof nombre === 'string' && nombre.trim()) s.add(nombre);
    }
  }
  return [...s];
}

export function filasMapeo(
  nombres: string[],
  mapeos: Mapeo[],
  catalogo: { sku: string; nombre: string | null; categoria: string | null }[],
): FilaMapeo[] {
  const m = new Map(mapeos.map((x) => [x.shopify_nombre, x]));
  const c = new Map(catalogo.map((x) => [x.sku, x]));
  return [...new Set([...mapeos.map((x) => x.shopify_nombre), ...nombres])]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((nombre) => {
      const x = m.get(nombre);
      const art = x?.sku ? c.get(x.sku) : undefined;
      return {
        nombre,
        sku: x?.sku ?? null,
        notas: x?.notas ?? null,
        categoria: art?.categoria ?? null,
        nombreSku: art?.nombre ?? null,
        mapeado: !!x?.sku,
      };
    });
}

/** norm() del viejo: sin acentos y en minúsculas. */
export const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

export function filtrarMapeo(
  filas: FilaMapeo[],
  f: { texto: string; estado: '' | 'mapeado' | 'pendiente'; categoria: string },
): FilaMapeo[] {
  const t = sinAcentos(f.texto.trim());
  return filas.filter(
    (x) =>
      (!t || sinAcentos(x.nombre).includes(t) || sinAcentos(x.sku ?? '').includes(t)) &&
      (!f.estado || (f.estado === 'mapeado') === x.mapeado) &&
      (!f.categoria || x.categoria === f.categoria),
  );
}
