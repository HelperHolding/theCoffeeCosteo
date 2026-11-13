const n = (x: unknown) => Number(x) || 0;

export interface MovVenta {
  id: string;
  folio: string | null;
  sucursal: string | null;
  fecha: string | null;
  fecha_envio: string | null;
  sku: string;
  cantidad: number | null;
  estado: string | null;
}
export interface GrupoVenta {
  folio: string;
  sucursal: string | null;
  fecha_envio: string | null;
  skus: number;
  uds: number;
  pendientes: number;
  estado: 'por_enviar' | 'enviado' | 'otro';
  textoEstado: string;
  items: MovVenta[];
}
export type VistaEnvios = 'por_enviar' | 'enviados' | 'todos';

/** agrupar() de renderComEnvios. Decisión 6: por enviar = alguna línea 'por_enviar' (el viejo contaba los cancelados). */
export function agruparVentas(filas: MovVenta[]): GrupoVenta[] {
  const g = new Map<string, MovVenta[]>();
  for (const r of filas) {
    const k = r.folio ?? '—';
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.entries()]
    .map(([folio, items]) => {
      const pendientes = items.filter((x) => x.estado === 'por_enviar').length;
      const estado: GrupoVenta['estado'] = pendientes
        ? 'por_enviar'
        : items.every((x) => x.estado === 'enviado')
          ? 'enviado'
          : 'otro';
      return {
        folio,
        sucursal: items[0].sucursal,
        fecha_envio: items[0].fecha_envio ?? items[0].fecha,
        skus: items.length,
        uds: items.reduce((s, x) => s + n(x.cantidad), 0),
        pendientes,
        estado,
        textoEstado:
          estado === 'por_enviar'
            ? 'Por enviar'
            : estado === 'enviado'
              ? 'Enviado'
              : String(items[0].estado ?? '—'),
        items,
      };
    })
    .sort((a, b) => String(a.fecha_envio ?? '').localeCompare(String(b.fecha_envio ?? '')));
}

export function filtrarEnvios(g: GrupoVenta[], v: VistaEnvios): GrupoVenta[] {
  if (v === 'todos') return g;
  return g.filter((x) => x.estado === (v === 'enviados' ? 'enviado' : 'por_enviar'));
}

export function conteoEnvios(g: GrupoVenta[]): Record<VistaEnvios, number> {
  return {
    por_enviar: filtrarEnvios(g, 'por_enviar').length,
    enviados: filtrarEnvios(g, 'enviados').length,
    todos: g.length,
  };
}
