import 'server-only';
import type { ConfigSucursal } from '../sucursales/config';
import type { SucursalInfo } from '../sucursales/contratos';
import { conRappi, hoyLocal, leerDias, sucursalInfo, type FuenteRappi } from '../sucursales/datos';
import { catalogoServicio, clienteServicio, rappiServicio } from '../sucursales/corte-servidor';
import {
  conciliar,
  filtrarOrigen,
  origenes,
  pagos,
  productos,
  resumen,
  type CatalogoNombres,
  type FiltroOrigen,
} from '../sucursales/metricas';
import type { Origen } from '../sucursales/normalizar';
import { textoHora } from '../sucursales/tiempo';

/**
 * Ventas del módulo Franquiciatarios con las MISMAS funciones que Sucursales (leerVentana/leerDias, conRappi,
 * filtrarOrigen, resumen, productos, pagos, conciliar), para que las cifras coincidan. Rappi del portal y el catálogo de
 * nombres se leen con la llave de servicio SOLO después de autorizar la sucursal con la sesión del usuario (la cuenta de
 * baristas no tiene el módulo Sucursales, que piden sus RPC). Las mismas tablas, la misma conversión (pedidoRappiAPos).
 */
export async function fuentesFranq(
  cfg: ConfigSucursal,
): Promise<{ rappi?: FuenteRappi; catalogo?: CatalogoNombres }> {
  const db = clienteServicio();
  if (!db) {
    // Sin llave de servicio no se inventa Rappi en cero: la lectura queda parcial.
    return { rappi: cfg.rappiPortal ? async () => null : undefined };
  }
  return { rappi: rappiServicio(db, cfg), catalogo: await catalogoCompartido(db) };
}

// El catálogo de nombres es el mismo para todas las sucursales y cambia solo por lote: 10 min en memoria.
let catalogoCache: { hasta: number; valor: CatalogoNombres | undefined } | null = null;
async function catalogoCompartido(db: NonNullable<ReturnType<typeof clienteServicio>>) {
  if (catalogoCache && catalogoCache.hasta > Date.now()) return catalogoCache.valor;
  const valor = await catalogoServicio(db).catch(() => undefined);
  // Un error no se guarda: el siguiente intento vuelve a leer.
  if (valor) catalogoCache = { hasta: Date.now() + 10 * 60_000, valor };
  return valor;
}

/** Campos que el módulo nunca devuelve: costos, márgenes y el neto de la API (en Rappi deja ver la comisión). */
const SENSIBLE = /^(neto|costo|margen|utilidad|comision)/i;

/** Copia sin claves sensibles a cualquier profundidad (defensa extra sobre los contratos sin costos). */
export function sinDatosSensibles<T>(x: T): T {
  if (Array.isArray(x)) return x.map(sinDatosSensibles) as T;
  if (x && typeof x === 'object')
    return Object.fromEntries(
      Object.entries(x as Record<string, unknown>)
        .filter(([k]) => !SENSIBLE.test(k))
        .map(([k, v]) => [k, sinDatosSensibles(v)]),
    ) as T;
  return x;
}

/** Días que el módulo deja consultar en ventas y tira: hoy y los 6 anteriores. */
export const DIAS_TIRA = 7;

export interface Tira {
  sucursal: Pick<SucursalInfo, 'companyId' | 'nombre' | 'ciudad' | 'moneda' | 'alcance' | 'rappi'>;
  dia: string;
  origen: FiltroOrigen;
  /** El día aún no termina en la sucursal: la tira es parcial hasta `corte`. */
  parcial: boolean;
  corte: string;
  generadoEn: number;
  lectura: { estado: 'completa' | 'parcial' | 'error'; avisos: string[] };
  totales: { ventaCent: number; pedidos: number; ticketCent: number | null; descuentoCent: number };
  origenes: { origen: Origen; pedidos: number; ventaCent: number }[];
  pagos: { metodo: string; etiqueta: string; pedidos: number; ventaCent: number }[];
  productos: { clave: string; nombre: string; lineas: number; importeCent: number }[];
  conciliacion: { diferenciaCent: number; pedidosNoCuadran: number; soloRedondeo: boolean };
}

/**
 * Tira de venta de un día: los mismos datos que Productos y En vivo de Sucursales para ese día y origen. Sin
 * estimaciones: solo lo que reporta la fuente. Productos con la identidad de todo el día (antes del filtro de origen).
 */
export async function construirTira(
  cfg: ConfigSucursal,
  dia: string,
  origen: FiltroOrigen,
  fuentes: { rappi?: FuenteRappi; catalogo?: CatalogoNombres },
): Promise<Tira> {
  const l = await conRappi(await leerDias(cfg, dia, dia), fuentes.rappi);
  const ps = filtrarOrigen(l.pedidos, origen);
  const r = resumen(ps);
  const ahora = hoyLocal(cfg);
  const s = sucursalInfo(cfg);
  const c = conciliar(ps);
  return {
    sucursal: {
      companyId: s.companyId,
      nombre: s.nombre,
      ciudad: s.ciudad,
      moneda: s.moneda,
      alcance: s.alcance,
      rappi: s.rappi,
    },
    dia,
    origen,
    parcial: dia >= ahora.fecha,
    corte: textoHora(ahora.segundo),
    generadoEn: Date.now(),
    // Sin el catálogo de nombres del POS, las líneas sin código pueden agruparse distinto que en Sucursales.
    lectura: fuentes.catalogo
      ? { estado: l.estado, avisos: l.avisos }
      : {
          estado: l.estado === 'error' ? 'error' : 'parcial',
          avisos: [
            'No se pudo leer el catálogo de nombres del POS; algunos productos pueden aparecer separados.',
            ...l.avisos,
          ],
        },
    totales: {
      ventaCent: r.ventaCent,
      pedidos: r.pedidos,
      ticketCent: r.ticketCent,
      descuentoCent: r.descuentoCent,
    },
    origenes: origenes(ps).map(({ origen: o, pedidos: n, ventaCent }) => ({
      origen: o,
      pedidos: n,
      ventaCent,
    })),
    pagos: pagos(ps).map(({ metodo, etiqueta, pedidos: n, ventaCent }) => ({
      metodo,
      etiqueta,
      pedidos: n,
      ventaCent,
    })),
    productos: productos(ps, l.pedidos, fuentes.catalogo).map((p) => ({
      clave: p.clave,
      nombre: p.nombre,
      lineas: p.lineas,
      importeCent: p.importeCent,
    })),
    conciliacion: {
      diferenciaCent: c.diferenciaCent,
      pedidosNoCuadran: c.pedidosNoCuadran,
      soloRedondeo: c.soloRedondeo,
    },
  };
}
