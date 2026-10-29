import 'server-only';
import { CacheTtl } from './cache';
import { VERSION_DATOS, type ConfigSucursal } from './config';
import type {
  LecturaInfo,
  PedidoVista,
  RespuestaConsumo,
  RespuestaCosteo,
  RespuestaPedidos,
  RespuestaProductos,
  RespuestaTendencias,
  SemanaTendencia,
  RespuestaVivo,
  SucursalInfo,
} from './contratos';
import {
  conciliar,
  conteoDiaHora,
  curvaAcumulada,
  enVentana,
  etiquetaPago,
  filtrarOrigen,
  hastaCorte,
  insightsVivo,
  nombreDia,
  origenes,
  pagos,
  personalizaciones,
  porHora,
  productos,
  resumen,
  semanasCerradas,
  variacion,
  type CatalogoNombres,
  type FiltroOrigen,
} from './metricas';
import { costear, type DatosCosteo } from './costeo';
import { consumir, type DatosConsumo } from './consumo';
import { normalizar, type PedidoNormal } from './normalizar';
import {
  dependenciasReales,
  leerCatalogo,
  leerPedidos,
  mensajeError,
  type CodigoError,
  type Dependencias,
  type SucursalApi,
} from './proveedor';
import { diasEntre, enZona, sumarDias, textoHora } from './tiempo';

/**
 * Datos de Sucursales del lado del servidor. SOLO se llama después de autorizar usuario y sucursal
 * (lib/sucursales/acceso.ts); las claves de caché no llevan datos de sesión porque el contenido
 * es el mismo para cualquier usuario autorizado a esa sucursal.
 */
export interface LecturaNormal {
  desde: string;
  hasta: string;
  leidoEn: number;
  estado: LecturaInfo['estado'];
  error: CodigoError | null;
  avisos: string[];
  totalDeclarado: number | null;
  pedidos: PedidoNormal[];
}

let deps: Dependencias = dependenciasReales;
// Un día por entrada: 13 sucursales × 62 días caben (Productos, Costeo y Consumo leen por días; docs/sucursales/13).
const lecturas = new CacheTtl<LecturaNormal>(1_000);
const catalogo = new CacheTtl<{ ok: true; sucursales: SucursalApi[] } | { ok: false; error: CodigoError }>(1);

/** Solo para pruebas: dependencias falsas y cachés vacías. */
export function __reiniciarParaPruebas(d: Dependencias = dependenciasReales) {
  deps = d;
  lecturas.limpiar();
  catalogo.limpiar();
}

export const hoyLocal = (cfg: ConfigSucursal) => enZona(new Date(deps.ahora()), cfg.zona);

/** TTL: hoy 45 s; cerrada reciente (≤ 3 días) 10 min; cerrada antigua 6 h; parcial o error 15 s. */
function ttl(cfg: ConfigSucursal, l: LecturaNormal) {
  if (l.estado !== 'completa') return 15_000;
  const hoy = hoyLocal(cfg).fecha;
  if (l.hasta >= hoy) return 45_000;
  return diasEntre(l.hasta, hoy) <= 3 ? 600_000 : 21_600_000;
}

async function verificarIdentidad(cfg: ConfigSucursal): Promise<CodigoError | null> {
  const c = await catalogo.obtener(
    'catalogo',
    async () => {
      const r = await leerCatalogo(deps);
      return r.ok ? r : { ok: false as const, error: r.error.codigo };
    },
    (v) => (v.ok ? 6 * 3_600_000 : 30_000),
  );
  if (!c.ok) return c.error;
  const s = c.sucursales.find((x) => x.id === cfg.companyId);
  return s && s.lookerStoreId === cfg.lookerStoreId ? null : 'identidad-discrepante';
}

export async function leerVentana(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
  { forzar = false }: { forzar?: boolean } = {},
): Promise<LecturaNormal> {
  const clave = [VERSION_DATOS, cfg.companyId, desde, hasta, cfg.modoTiempo, cfg.zona].join('|');
  return lecturas.obtener(
    clave,
    async () => {
      const identidad = await verificarIdentidad(cfg);
      if (identidad) return fallo(desde, hasta, identidad);
      const cruda = await leerPedidos(cfg.companyId, desde, hasta, deps);
      const n = normalizar(cruda.registros, cfg, { desde, hasta });
      const codigos = cruda.errores.map((e) => e.codigo);
      const avisos = [...new Set(codigos)].map((c) => mensajeError[c]);
      if (n.invalidos) avisos.push(`${n.invalidos} pedidos con datos inválidos se excluyeron.`);
      if (n.fueraDeVentana)
        avisos.push(
          `${n.fueraDeVentana} pedidos con fecha fuera del periodo: revisar la interpretación horaria.`,
        );
      const completa = cruda.completo && !n.invalidos && !n.fueraDeVentana;
      if (cruda.paginas === 0 && codigos.length) return fallo(desde, hasta, codigos[0]);
      if (!cruda.completo && cruda.errores.length)
        console.warn('[sucursales] lectura parcial', cfg.companyId, desde, hasta, cruda.errores);
      return {
        desde,
        hasta,
        leidoEn: cruda.leidoEn,
        estado: completa ? 'completa' : 'parcial',
        error: null,
        avisos,
        totalDeclarado: cruda.totalDeclarado,
        pedidos: n.pedidos,
      };
    },
    (l) => ttl(cfg, l),
    { forzar },
  );
}

/**
 * Periodo largo (hasta 62 días) leído DÍA POR DÍA: cada día cerrado queda en caché con su TTL largo y solo hoy se
 * relee a los 45 s. En 532, 62 días: 16 s en una sola lectura frente a 6.8 s por días (4 en paralelo, el semáforo del
 * proveedor). Mismos pedidos que una lectura única; si falla algún día, el periodo es parcial (nunca venta cero).
 */
export async function leerDias(cfg: ConfigSucursal, desde: string, hasta: string): Promise<LecturaNormal> {
  const n = diasEntre(desde, hasta) + 1;
  const fechas = Array.from({ length: n }, (_, i) => sumarDias(hasta, -i));
  const dias = await Promise.all(fechas.map((f) => leerVentana(cfg, f, f)));
  if (dias.every((d) => d.estado === 'error'))
    return { ...fallo(desde, hasta, dias[0].error!), avisos: dias[0].avisos };
  const incompletos = dias.filter((d) => d.estado !== 'completa').length;
  const avisos = [...new Set(dias.flatMap((d) => d.avisos))];
  if (incompletos) avisos.unshift(`${incompletos} de ${n} días con lectura incompleta.`);
  return {
    desde,
    hasta,
    leidoEn: Math.min(...dias.map((d) => d.leidoEn)),
    estado: incompletos ? 'parcial' : 'completa',
    error: null,
    avisos,
    totalDeclarado: dias.some((d) => d.totalDeclarado === null)
      ? null
      : dias.reduce((a, d) => a + d.totalDeclarado!, 0),
    // Cada día ya viene del más reciente al más antiguo y los días van de `hasta` hacia atrás.
    pedidos: dias.flatMap((d) => d.pedidos),
  };
}

function fallo(desde: string, hasta: string, codigo: CodigoError): LecturaNormal {
  if (codigo === 'credenciales-proveedor' || codigo === 'sin-configuracion')
    console.error('[sucursales] integración con la API The Coffee no disponible:', codigo);
  return {
    desde,
    hasta,
    leidoEn: deps.ahora(),
    estado: 'error',
    error: codigo,
    avisos: [mensajeError[codigo]],
    totalDeclarado: null,
    pedidos: [],
  };
}

const info = (l: LecturaNormal, pedidos: number): LecturaInfo => ({
  desde: l.desde,
  hasta: l.hasta,
  leidoEn: l.leidoEn,
  estado: l.estado,
  error: l.error ? mensajeError[l.error] : null,
  avisos: l.avisos,
  totalDeclarado: l.totalDeclarado,
  pedidos,
});

export const sucursalInfo = (cfg: ConfigSucursal): SucursalInfo => ({
  companyId: cfg.companyId,
  nombre: cfg.nombre,
  ciudad: cfg.ciudad,
  moneda: cfg.moneda,
  zona: cfg.zona,
  alcance: cfg.alcance,
  rappi: cfg.rappi,
  rappiPortal: cfg.rappiPortal ?? false,
  sonidoVenta: cfg.sonidoVenta ?? null,
});

export const vistaPedido = (p: PedidoNormal): PedidoVista => ({
  id: p.id,
  fecha: p.fecha,
  hora: p.hora,
  ventaCent: p.ventaCent,
  descuentoCent: p.descuentoCent,
  origen: p.origen,
  pago: etiquetaPago(p.metodo),
  metodo: p.metodo,
  numeroPedidoRappi: p.numeroPedidoRappi,
  lineas: p.lineas.map((l) => ({
    codigo: l.codigo,
    nombre: l.nombre,
    importeCent: l.importeCent,
    descuentoPct: l.descuentoPct,
    customs: l.customs.map((c) => ({ ...c })),
  })),
});

/** "En vivo": hoy hasta el corte vs el mismo día de la semana anterior hasta el mismo corte. */
export async function construirVivo(
  cfg: ConfigSucursal,
  origen: FiltroOrigen,
  opciones: { forzar?: boolean; catalogo?: CatalogoNombres | null } = {},
): Promise<RespuestaVivo> {
  const ahora = hoyLocal(cfg);
  const baseFecha = sumarDias(ahora.fecha, -7);
  const [lh, lb] = await Promise.all([
    leerVentana(cfg, ahora.fecha, ahora.fecha, opciones),
    leerVentana(cfg, baseFecha, baseFecha),
  ]);
  const corte = ahora.segundo;
  const todosHoy = filtrarOrigen(lh.pedidos, origen);
  const hoy = hastaCorte(todosHoy, corte);
  // Identidad de las líneas sin código: todo el día hasta el corte, antes de filtrar por origen (como en Productos).
  const evidencia = hastaCorte(lh.pedidos, corte);
  const catalogo = opciones.catalogo ?? undefined;
  const base = filtrarOrigen(lb.pedidos, origen);
  const completos = lh.estado === 'completa' && lb.estado === 'completa';
  const kpis = resumen(hoy);
  const kpisBase = lb.estado === 'completa' ? resumen(hastaCorte(base, corte)) : null;
  const horaCorte = Math.floor(corte / 3600);
  const ultimo = hoy[0] ?? null;
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    corte: { fecha: ahora.fecha, segundo: corte, hora: textoHora(corte, true), generadoEn: deps.ahora() },
    base: { fecha: baseFecha, dia: nombreDia(baseFecha) },
    lecturas: { hoy: info(lh, hoy.length), base: info(lb, base.length) },
    kpis,
    kpisBase,
    comparativo:
      completos && kpisBase
        ? {
            venta: variacion(kpis.ventaCent, kpisBase.pedidos ? kpisBase.ventaCent : null),
            pedidos: variacion(kpis.pedidos, kpisBase.pedidos || null),
            ticket: kpis.ticketCent === null ? null : variacion(kpis.ticketCent, kpisBase.ticketCent),
          }
        : null,
    curva: {
      hoy: curvaAcumulada(hoy).map((v, h) => (h <= horaCorte ? v : null)),
      base: lb.estado === 'completa' ? curvaAcumulada(base) : null,
    },
    porHora: {
      hoy: porHora(hoy).map(({ pedidos, ventaCent }) => ({ pedidos, ventaCent })),
      base:
        lb.estado === 'completa'
          ? porHora(base).map(({ pedidos, ventaCent }) => ({ pedidos, ventaCent }))
          : null,
    },
    origenes: origenes(filtrarOrigen(hastaCorte(lh.pedidos, corte), 'todos')),
    ritmo: { ultimos15: enVentana(hoy, corte, 900), ultimos60: enVentana(hoy, corte, 3600) },
    ultimoPedido: ultimo ? { hora: ultimo.hora, haceSeg: corte - ultimo.segundo } : null,
    posterioresAlCorte: todosHoy.length - hoy.length,
    productosTop: productos(hoy, evidencia, catalogo).slice(0, 5),
    ultimosPedidos: hoy.slice(0, 10).map(vistaPedido),
    pagos: pagos(hoy),
    insights:
      lh.estado === 'error'
        ? []
        : insightsVivo({ hoy, base, baseFecha, corte, completos, evidencia, catalogo }),
    conciliacion: conciliar(hoy),
  };
}

/** Ventas · Productos. El costeo ya no viaja aquí: tiene su sección y su API (exige permiso de Costeo). */
export async function construirProductos(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
  origen: FiltroOrigen,
  /** Nombres del POS de nuestros enlaces (ver identificador); null/undefined: solo la evidencia del periodo. */
  catalogo?: CatalogoNombres | null,
): Promise<RespuestaProductos> {
  const l = await leerDias(cfg, desde, hasta);
  const ps = filtrarOrigen(l.pedidos, origen);
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    lectura: info(l, ps.length),
    totales: resumen(ps),
    // La identidad de las líneas sin código se aprende de todo el periodo, no solo del origen filtrado.
    productos: productos(ps, l.pedidos, catalogo ?? undefined),
    personalizaciones: personalizaciones(ps).slice(0, 30),
    conciliacion: conciliar(ps),
  };
}

/** Costeo: las mismas ventas y la misma identidad que Productos, con el costo ACTUAL de Costeo. */
export async function construirCosteo(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
  origen: FiltroOrigen,
  datos: DatosCosteo,
  catalogo?: CatalogoNombres | null,
): Promise<RespuestaCosteo> {
  const l = await leerDias(cfg, desde, hasta);
  const ps = filtrarOrigen(l.pedidos, origen);
  const c = costear(ps, datos, l.pedidos, catalogo ?? undefined);
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    lectura: info(l, ps.length),
    totales: resumen(ps),
    costeo: c.resumen,
    productos: productos(ps, l.pedidos, catalogo ?? undefined).map((x) => ({
      clave: x.clave,
      codigo: x.codigo,
      nombre: x.nombre,
      sinCodigo: x.sinCodigo,
      importeCent: x.importeCent,
      lineas: x.lineas,
      participacion: x.participacion,
      costeo: c.porClave.get(x.clave) ?? null,
    })),
  };
}

/** Consumo teórico según receta (solo cantidades), con la misma identidad de líneas que Productos y Costeo. */
export async function construirConsumo(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
  origen: FiltroOrigen,
  datos: DatosConsumo,
  catalogo?: CatalogoNombres | null,
): Promise<RespuestaConsumo> {
  const l = await leerDias(cfg, desde, hasta);
  const ps = filtrarOrigen(l.pedidos, origen);
  const fechas = Array.from({ length: diasEntre(desde, hasta) + 1 }, (_, i) => sumarDias(desde, i));
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    lectura: info(l, ps.length),
    recetasLeidasEn: datos.leidoEn,
    ...consumir(ps, datos, l.pedidos, catalogo ?? undefined, fechas),
  };
}

export const POR_PAGINA_PEDIDOS = 25;

export async function construirPedidos(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
  origen: FiltroOrigen,
  pago: string | null,
  pagina: number,
): Promise<RespuestaPedidos> {
  const l = await leerVentana(cfg, desde, hasta);
  const porOrigen = filtrarOrigen(l.pedidos, origen);
  const ps = pago ? porOrigen.filter((p) => p.metodo === pago) : porOrigen;
  const paginas = Math.max(1, Math.ceil(ps.length / POR_PAGINA_PEDIDOS));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const metodos = [...new Set(porOrigen.map((p) => p.metodo))]
    .map((metodo) => ({ metodo, etiqueta: etiquetaPago(metodo) }))
    .sort((a, b) => a.etiqueta.localeCompare(b.etiqueta));
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    pago,
    lectura: info(l, ps.length),
    total: ps.length,
    pagina: actual,
    paginas,
    porPagina: POR_PAGINA_PEDIDOS,
    pedidos: ps.slice((actual - 1) * POR_PAGINA_PEDIDOS, actual * POR_PAGINA_PEDIDOS).map(vistaPedido),
    metodos,
  };
}

export const SEMANAS_PERMITIDAS = [4, 8, 12] as const;

/** Tendencias: semanas cerradas lunes–domingo, cada una con su propia lectura (y caché). */
export async function construirTendencias(
  cfg: ConfigSucursal,
  n: (typeof SEMANAS_PERMITIDAS)[number],
  origen: FiltroOrigen,
): Promise<RespuestaTendencias> {
  const ventanas = semanasCerradas(hoyLocal(cfg).fecha, n);
  const lecturas = await Promise.all(ventanas.map((v) => leerVentana(cfg, v.desde, v.hasta)));
  const completas: PedidoNormal[] = [];
  let semanasCompletas = 0;
  const semanas: SemanaTendencia[] = lecturas.map((l, i) => {
    const ps = filtrarOrigen(l.pedidos, origen);
    const completa = l.estado === 'completa';
    if (completa) {
      semanasCompletas++;
      completas.push(...ps);
    }
    return {
      desde: ventanas[i].desde,
      hasta: ventanas[i].hasta,
      lectura: info(l, ps.length),
      kpis: completa ? resumen(ps) : null,
      pagos: completa ? pagos(ps) : [],
      origenes: completa ? origenes(ps) : [],
      variacionVenta: null,
    };
  });
  for (let i = 1; i < semanas.length; i++) {
    const a = semanas[i].kpis;
    const b = semanas[i - 1].kpis;
    semanas[i].variacionVenta = a && b ? variacion(a.ventaCent, b.pedidos ? b.ventaCent : null) : null;
  }
  const conteo = conteoDiaHora(completas);
  return {
    sucursal: sucursalInfo(cfg),
    origen,
    semanas,
    semanasCompletas,
    totales: resumen(completas),
    mapa: conteo.map((fila) => fila.map((v) => (semanasCompletas ? v / semanasCompletas : null))),
    conciliacion: conciliar(completas),
  };
}
