/**
 * Rappi leído del portal de Partners (docs/rappi-portal): lo que devuelve la RPC sucursales_rappi_portal y su resumen
 * para la pestaña Rappi. Solo datos del portal: venta = suma de productos antes de descuentos
 * (order_product_total_price); nada se estima ni se renombra (no hay comisión ni neto por pedido).
 */

export type CanalRappi = 'normal' | 'turbo';

export interface OpcionRappi {
  categoria: string;
  descripcion: string;
  precio: number;
  unidades: number;
}

export interface ProductoRappi {
  nombre: string;
  unidades: number;
  precio: number;
  opciones: OpcionRappi[];
}

export interface PedidoRappi {
  id: string;
  tienda: string;
  creado: string;
  fecha: string;
  estado: string;
  estado_nombre: string;
  en_disputa: boolean;
  estado_disputa: string | null;
  metodo_pago: string | null;
  bruto: number;
  descuento_aliado: number | null;
  estado_anterior: string | null;
  revisar: boolean;
  cambios: number;
  productos: ProductoRappi[];
}

export interface RpcRappiPortal {
  tiendas: { id: string; nombre: string; canal: CanalRappi }[];
  ultima_corrida: { inicio: string; tipo: string; estado: string; mensaje: string | null } | null;
  ultima_ok: string | null;
  conteos: { tienda: string; fecha: string; total_rows: number; devueltos: number }[];
  pedidos: PedidoRappi[];
}

/** Estados del portal (doc 01 §4). «Terminada» = finished o pending_review; «Cancelada» o «Rechazada» = canceled*. */
export type ClaseEstado = 'terminado' | 'cancelado' | 'otro';
export const claseEstado = (estado: string): ClaseEstado =>
  /^cancel/.test(estado)
    ? 'cancelado'
    : estado === 'finished' || estado === 'pending_review'
      ? 'terminado'
      : 'otro';

const cent = (pesos: number) => Math.round(pesos * 100);
/** Nombres del menú de Rappi con espacios sobrantes («Crea tu The Coffee »): se agrupan sin ellos. */
export const nombreRappi = (s: string) => s.replace(/\s+/g, ' ').trim();

export interface TotalesRappi {
  pedidos: number;
  ventaCent: number;
  cancelados: number;
  canceladosCent: number;
  otros: number;
  enDisputa: number;
  unidades: number;
}

export interface OpcionResumen {
  categoria: string;
  descripcion: string;
  veces: number;
}

export interface ProductoResumen {
  nombre: string;
  unidades: number;
  ventaCent: number;
  porCanal: Record<CanalRappi, number>;
  /** Opciones elegidas en las unidades terminadas, por categoría del menú de Rappi. */
  opciones: OpcionResumen[];
}

export interface RappiPortalVista {
  desde: string;
  hasta: string;
  tiendas: RpcRappiPortal['tiendas'];
  ultimaCorrida: RpcRappiPortal['ultima_corrida'];
  ultimaOk: string | null;
  totales: TotalesRappi;
  porCanal: Record<CanalRappi, TotalesRappi>;
  productos: ProductoResumen[];
  pedidos: (PedidoRappi & { canal: CanalRappi; clase: ClaseEstado })[];
  /** Días en que el listado del portal devolvió menos pedidos de los que contó (no se pueden mostrar). */
  faltantes: { fecha: string; canal: CanalRappi; total: number; devueltos: number }[];
}

const vacio = (): TotalesRappi => ({
  pedidos: 0,
  ventaCent: 0,
  cancelados: 0,
  canceladosCent: 0,
  otros: 0,
  enDisputa: 0,
  unidades: 0,
});

export function construirRappiPortal(r: RpcRappiPortal, desde: string, hasta: string): RappiPortalVista {
  const canalDe = new Map(r.tiendas.map((t) => [t.id, t.canal]));
  const totales = vacio();
  const porCanal: Record<CanalRappi, TotalesRappi> = { normal: vacio(), turbo: vacio() };
  const productos = new Map<string, ProductoResumen & { _opc: Map<string, OpcionResumen> }>();
  const pedidos = r.pedidos.map((p) => ({
    ...p,
    canal: canalDe.get(p.tienda) ?? 'normal',
    clase: claseEstado(p.estado),
  }));
  for (const p of pedidos) {
    for (const t of [totales, porCanal[p.canal]]) {
      if (p.en_disputa) t.enDisputa++;
      if (p.clase === 'cancelado') {
        t.cancelados++;
        t.canceladosCent += cent(p.bruto);
      } else if (p.clase === 'otro') t.otros++;
      else {
        t.pedidos++;
        t.ventaCent += cent(p.bruto);
        t.unidades += p.productos.reduce((s, x) => s + x.unidades, 0);
      }
    }
    if (p.clase !== 'terminado') continue;
    for (const x of p.productos) {
      // La tienda normal y la Turbo escriben distinto el mismo producto («Crea tu» / «Crea Tu»): se agrupa sin
      // distinguir mayúsculas y se muestra el primer nombre visto.
      const nombre = nombreRappi(x.nombre);
      const clave = nombre.toLocaleLowerCase('es-MX');
      const e = productos.get(clave) ?? {
        nombre,
        unidades: 0,
        ventaCent: 0,
        porCanal: { normal: 0, turbo: 0 },
        opciones: [],
        _opc: new Map<string, OpcionResumen>(),
      };
      e.unidades += x.unidades;
      e.ventaCent += cent(x.precio);
      e.porCanal[p.canal] += x.unidades;
      for (const o of x.opciones) {
        const categoria = nombreRappi(o.categoria).replace(/\.$/, '');
        const descripcion = nombreRappi(o.descripcion);
        const k = `${categoria}\u0000${descripcion}`.toLocaleLowerCase('es-MX');
        const op = e._opc.get(k) ?? { categoria, descripcion, veces: 0 };
        op.veces += x.unidades * Math.max(1, o.unidades);
        e._opc.set(k, op);
      }
      productos.set(clave, e);
    }
  }
  const faltantes = r.conteos
    .filter((c) => c.total_rows > c.devueltos)
    .map((c) => ({
      fecha: c.fecha,
      canal: canalDe.get(c.tienda) ?? ('normal' as CanalRappi),
      total: c.total_rows,
      devueltos: c.devueltos,
    }));
  return {
    desde,
    hasta,
    tiendas: r.tiendas,
    ultimaCorrida: r.ultima_corrida,
    ultimaOk: r.ultima_ok,
    totales,
    porCanal,
    productos: [...productos.values()]
      .map(({ _opc, ...p }) => ({
        ...p,
        opciones: [..._opc.values()].sort(
          (a, b) =>
            a.categoria.localeCompare(b.categoria, 'es-MX') ||
            b.veces - a.veces ||
            a.descripcion.localeCompare(b.descripcion, 'es-MX'),
        ),
      }))
      .sort((a, b) => b.ventaCent - a.ventaCent || b.unidades - a.unidades),
    pedidos,
    faltantes,
  };
}
