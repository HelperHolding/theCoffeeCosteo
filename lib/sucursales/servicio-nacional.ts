/**
 * Nivel de servicio de Rappi en el Tablero de México (docs/rappi-portal/08, fase 3): todas las sucursales del usuario.
 * La RPC sucursales_servicio_nacional ya suma por tienda y por día; aquí se juntan por sucursal y en total con los
 * mismos cocientes que la sección de una sucursal (totalesDeSuma). Las sucursales sin tienda en el portal se listan
 * aparte: nunca cuentan como cero.
 */
import {
  MOTIVO_TIPO,
  nombreSubtipo,
  totalesDeSuma,
  type CanalServicio,
  type ReclamoRpc,
  type SumaServicio,
  type TipoReclamo,
  type Totales,
  type TramoRpc,
} from './servicio';

export interface RpcServicioNacional {
  tiendas: { id: string; company_id: number; nombre: string; canal: CanalServicio }[];
  por_tienda: (SumaServicio & { tienda: string })[];
  por_dia: (SumaServicio & { fecha: string })[];
  reclamos: ReclamoRpc[];
  vigente: TramoRpc[];
  top: { tienda: string; fecha: string; categoria: string; proxima: string | null }[];
  leido_en: string | null;
}

export interface SucursalNacional {
  companyId: number;
  nombre: string;
  ciudad: string;
}

export interface FilaSucursalServicio extends SucursalNacional {
  totales: Totales;
  /** Estado de ahora por tienda: true activa, false desactivada; sin la tienda o sin foto no aparece. */
  ahora: Partial<Record<CanalServicio, { activa: boolean; motivo: string | null; desde: string }>>;
  top: string | null;
}

export interface RespuestaServicioNacional {
  desde: string;
  hasta: string;
  leidoEn: string | null;
  totales: Totales;
  dias: { fecha: string; total: Totales }[];
  ahora: {
    canal: CanalServicio;
    activas: number;
    tiendas: number;
  }[];
  /** Tiendas desactivadas ahora, la más antigua primero. */
  desactivadas: {
    companyId: number;
    sucursal: string;
    canal: CanalServicio;
    estado: string;
    motivo: string | null;
    desde: string;
  }[];
  sucursales: FilaSucursalServicio[];
  sinPortal: SucursalNacional[];
  /** Tiendas por categoría de Top Restaurantes (actual, según la última lectura). */
  top: { categoria: string; tiendas: number }[];
  reclamos: {
    pedido: string;
    fecha: string;
    companyId: number;
    sucursal: string;
    canal: CanalServicio;
    producto: string | null;
    tipo: TipoReclamo | null;
    detalle: string | null;
    comentario: string | null;
    monto: number | null;
  }[];
  compensado: number;
  productos: { producto: string; reclamos: number; tipos: Record<TipoReclamo, number> }[];
}

const VACIA: SumaServicio = {
  dias: 0,
  pedidos: 0,
  rech_cbpi: 0,
  rech_cbpr: 0,
  rech_tienda_cerrada: 0,
  rech_sin_stock: 0,
  rech_demora: 0,
  finalizados: 0,
  recl_mal_estado: 0,
  recl_faltante: 0,
  recl_incorrecto: 0,
  cocina_pedidos: 0,
  cocina_demorada: 0,
  sin_disp_minutos: null,
  disp_suma: 0,
  disp_n: 0,
  espera_suma: 0,
  espera_peso: 0,
};

/** Suma de sumas (la RPC manda números como texto o número según el tipo: se convierten). */
export function sumarSumas(lista: SumaServicio[]): SumaServicio {
  const s: SumaServicio = { ...VACIA };
  for (const x of lista)
    for (const k of Object.keys(VACIA) as (keyof SumaServicio)[]) {
      if (k === 'sin_disp_minutos') {
        if (x.sin_disp_minutos !== null && x.sin_disp_minutos !== undefined)
          s.sin_disp_minutos = (s.sin_disp_minutos ?? 0) + Number(x.sin_disp_minutos);
      } else s[k] += Number(x[k] ?? 0);
    }
  return s;
}

const ORDEN_TOP = (c: string) => Number(/^(\d+)\./.exec(c)?.[1] ?? 9);

export function construirServicioNacional(
  rpc: RpcServicioNacional,
  desde: string,
  hasta: string,
  sucursales: SucursalNacional[],
): RespuestaServicioNacional {
  const tiendaDe = new Map(rpc.tiendas.map((t) => [t.id, t]));
  const nombreDe = new Map(sucursales.map((s) => [s.companyId, s]));
  const sumaDe = new Map(rpc.por_tienda.map((x) => [x.tienda, x]));
  const vigenteDe = new Map(rpc.vigente.map((v) => [v.tienda, v]));
  const topDe = new Map(rpc.top.map((x) => [x.tienda, x]));

  const conTienda = new Set(rpc.tiendas.map((t) => t.company_id));
  const filas: FilaSucursalServicio[] = sucursales
    .filter((s) => conTienda.has(s.companyId))
    .map((s) => {
      const suyas = rpc.tiendas.filter((t) => t.company_id === s.companyId);
      const ahora: FilaSucursalServicio['ahora'] = {};
      for (const t of suyas) {
        const v = vigenteDe.get(t.id);
        if (v) ahora[t.canal] = { activa: v.estado === 'ACTIVE', motivo: v.motivo, desde: v.desde };
      }
      const normal = suyas.find((t) => t.canal === 'normal');
      return {
        companyId: s.companyId,
        nombre: s.nombre,
        ciudad: s.ciudad,
        totales: totalesDeSuma(sumarSumas(suyas.map((t) => sumaDe.get(t.id)).filter((x) => !!x))),
        ahora,
        top: normal ? (topDe.get(normal.id)?.categoria ?? null) : null,
      };
    })
    .sort((a, b) => b.totales.pedidos - a.totales.pedidos || a.nombre.localeCompare(b.nombre));

  const ahora = (['normal', 'turbo'] as const)
    .map((canal) => {
      const ts = rpc.tiendas.filter((t) => t.canal === canal);
      return {
        canal,
        tiendas: ts.length,
        activas: ts.filter((t) => vigenteDe.get(t.id)?.estado === 'ACTIVE').length,
      };
    })
    .filter((x) => x.tiendas > 0);
  const desactivadas = rpc.vigente
    .filter((v) => v.estado !== 'ACTIVE' && tiendaDe.has(v.tienda))
    .map((v) => {
      const t = tiendaDe.get(v.tienda)!;
      return {
        companyId: t.company_id,
        sucursal: nombreDe.get(t.company_id)?.nombre ?? t.nombre,
        canal: t.canal,
        estado: v.estado,
        motivo: v.motivo,
        desde: v.desde,
      };
    })
    .sort((a, b) => a.desde.localeCompare(b.desde));

  const cuentaTop = new Map<string, number>();
  for (const t of rpc.tiendas.filter((x) => x.canal === 'normal')) {
    const c = topDe.get(t.id)?.categoria;
    if (c) cuentaTop.set(c, (cuentaTop.get(c) ?? 0) + 1);
  }

  const reclamos: RespuestaServicioNacional['reclamos'] = rpc.reclamos
    .filter((r) => tiendaDe.has(r.tienda))
    .map((r) => {
      const t = tiendaDe.get(r.tienda)!;
      return {
        pedido: r.pedido,
        fecha: r.fecha,
        companyId: t.company_id,
        sucursal: nombreDe.get(t.company_id)?.nombre ?? t.nombre,
        canal: t.canal,
        producto: r.producto,
        tipo: MOTIVO_TIPO[r.motivo] ?? null,
        detalle: nombreSubtipo(r.subtipo),
        comentario: r.comentario,
        monto: r.monto === null ? null : Number(r.monto),
      };
    });
  const productos = new Map<string, RespuestaServicioNacional['productos'][number]>();
  for (const r of reclamos) {
    if (!r.producto) continue;
    const p = productos.get(r.producto) ?? {
      producto: r.producto,
      reclamos: 0,
      tipos: { mal_estado: 0, faltante: 0, incorrecto: 0 },
    };
    p.reclamos++;
    if (r.tipo) p.tipos[r.tipo]++;
    productos.set(r.producto, p);
  }

  return {
    desde,
    hasta,
    leidoEn: rpc.leido_en,
    totales: totalesDeSuma(sumarSumas(rpc.por_tienda.filter((x) => tiendaDe.has(x.tienda)))),
    dias: rpc.por_dia.map((x) => ({ fecha: x.fecha, total: totalesDeSuma(sumarSumas([x])) })),
    ahora,
    desactivadas,
    sucursales: filas,
    sinPortal: sucursales
      .filter((s) => !conTienda.has(s.companyId))
      .map(({ companyId, nombre, ciudad }) => ({ companyId, nombre, ciudad }))
      .sort((a, b) => a.nombre.localeCompare(b.nombre)),
    top: [...cuentaTop.entries()]
      .map(([categoria, tiendas]) => ({ categoria, tiendas }))
      .sort((a, b) => ORDEN_TOP(a.categoria) - ORDEN_TOP(b.categoria)),
    reclamos,
    compensado: Math.round(reclamos.reduce((a, r) => a + (r.monto ?? 0), 0) * 100) / 100,
    productos: [...productos.values()].sort(
      (a, b) => b.reclamos - a.reclamos || a.producto.localeCompare(b.producto),
    ),
  };
}
