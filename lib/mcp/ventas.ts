import { z } from 'zod';
import type { Db } from '../portal/consultas';
import { configDe, type ConfigSucursal } from '../sucursales/config';
import { armarHoy, type PorOrigen, type RpcHoy, type RpcPeriodo, type TotalesOrigen } from '../sucursales/resumen';
import { enZona } from '../sucursales/tiempo';
import {
  aPesos,
  consulta,
  diasEntre,
  ErrorConsulta,
  exigir,
  fecha,
  limite,
  listaSucursales,
  pagina,
  resultadoPagina,
  type Consulta,
} from './consulta';

/** Herramientas de ventas (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.2). Solo para /mcp. */

type Modulo = 'sucursales' | 'bi';
interface SucursalVentas {
  company_id: number;
  nombre_bi: string | null;
  modulos: Modulo[];
}
interface RpcSucursales {
  client_id: string | null;
  autorizado: boolean;
  sucursales: SucursalVentas[];
}
interface DiaVentas {
  company_id: number;
  fecha: string;
  completa: boolean;
  corte_segundo: number;
  origenes: PorOrigen<TotalesOrigen>;
  horas?: PorOrigen<[number[], number[]]>;
}

const MAX_DIAS = 120;
const CANALES = 'Canales: mostrador (POS en tienda), app (app The Coffee) y rappi (portal de Rappi).';
const MONTOS = 'Montos en MXN con IVA, como en el portal. Fechas AAAA-MM-DD en la hora local de cada sucursal.';
const NO_ESTIMA = 'Un día con completa=false no se leyó entero: no se estima lo que falta.';

const cero = (): TotalesOrigen => ({ pedidos: 0, venta_cent: 0, descuento_cent: 0, lineas: 0 });
export const sumar = (a: TotalesOrigen, b: TotalesOrigen): TotalesOrigen => ({
  pedidos: a.pedidos + b.pedidos,
  venta_cent: a.venta_cent + b.venta_cent,
  descuento_cent: a.descuento_cent + b.descuento_cent,
  lineas: a.lineas + b.lineas,
});
const totalDe = (o: PorOrigen<TotalesOrigen>) => Object.values(o).reduce<TotalesOrigen>((t, x) => sumar(t, x!), cero());
const sumarPorCanal = (acc: PorOrigen<TotalesOrigen>, o: PorOrigen<TotalesOrigen>) => {
  for (const [k, v] of Object.entries(o) as [keyof typeof o, TotalesOrigen][]) acc[k] = sumar(acc[k] ?? cero(), v);
  return acc;
};

async function visibles(db: Db): Promise<SucursalVentas[]> {
  const r = exigir(await db.rpc('mcp_ventas_sucursales')) as unknown as RpcSucursales;
  if (!r.autorizado)
    throw new ErrorConsulta(
      `Este conector no tiene ventas autorizadas. Pide al administrador que agregue el client_id ${r.client_id} a mcp_ventas_clientes.`,
    );
  if (!r.sucursales.length) throw new ErrorConsulta('Tu cuenta no tiene sucursales asignadas con ventas.');
  return r.sucursales;
}

function elegir(todas: SucursalVentas[], modulo: Modulo, pedidas?: number[]) {
  const con = todas.filter((s) => s.modulos.includes(modulo)).map((s) => s.company_id);
  const companias = pedidas ? pedidas.filter((c) => con.includes(c)) : con;
  const ignoradas = pedidas ? pedidas.filter((c) => !con.includes(c)) : [];
  if (!companias.length) throw new ErrorConsulta('Ninguna de las sucursales pedidas está disponible para esta cuenta.');
  return { companias, ignoradas };
}

/** Solo las configuradas en el portal tienen zona horaria; las demás van a `ignoradas`. */
function configuradas(companias: number[]) {
  const cfgs = companias.map(configDe).filter((c): c is ConfigSucursal => c !== null);
  return { cfgs, sinConfig: companias.filter((c) => !configDe(c)) };
}

const nombreDe = (s: { company_id: number; nombre_bi?: string | null }) =>
  configDe(s.company_id)?.nombre ?? s.nombre_bi ?? `Sucursal ${s.company_id}`;

function rango(e: { desde?: string; hasta?: string }, max = MAX_DIAS) {
  if (!e.desde || !e.hasta) throw new ErrorConsulta('Indica desde y hasta (AAAA-MM-DD).');
  if (e.desde > e.hasta) throw new ErrorConsulta('La fecha desde debe ser anterior o igual a hasta.');
  if (diasEntre(e.desde, e.hasta) > max - 1) throw new ErrorConsulta(`El periodo máximo es de ${max} días.`);
  return { desde: e.desde, hasta: e.hasta };
}

export function consultasVentas(db: Db): Consulta[] {
  return [
    consulta(
      'ventas_sucursales',
      'Sucursales The Coffee cuyas ventas puede consultar esta cuenta: company_id, nombre, ciudad, zona horaria y módulos (sucursales = ventas del corte; bi = tablero BI). Úsala primero para conocer los company_id.',
      z.object({}),
      async () => ({
        sucursales: (await visibles(db)).map((s) => {
          const cfg = configDe(s.company_id);
          return {
            company_id: s.company_id,
            nombre: nombreDe(s),
            ciudad: cfg?.ciudad ?? null,
            zona: cfg?.zona ?? null,
            modulos: s.modulos,
          };
        }),
      }),
    ),
    consulta(
      'ventas_resumen',
      `Venta, pedidos, descuentos y líneas por canal. Sin fechas: HOY en vivo por sucursal (corte cada 10 min), con la semana pasada a la misma hora (comparable). Con desde y hasta (máximo ${MAX_DIAS} días): agrupar=sucursal (por omisión), dia o sucursal_dia (paginado). sucursales: lista de company_id; si se omite, todas. ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        sucursales: listaSucursales,
        agrupar: z.enum(['sucursal', 'dia', 'sucursal_dia']).default('sucursal'),
        pagina,
        limite,
      }),
      async (e) => {
        const todas = await visibles(db);
        const { companias, ignoradas } = elegir(todas, 'sucursales', e.sucursales);
        if (!e.desde && !e.hasta) {
          const { cfgs, sinConfig } = configuradas(companias);
          if (!cfgs.length) throw new ErrorConsulta('Ninguna de las sucursales pedidas tiene ventas en vivo configuradas.');
          const ahora = new Date();
          const rpc = exigir(
            await db.rpc('sucursales_tablero_hoy', {
              p_companias: cfgs.map((c) => c.companyId),
              p_hoys: cfgs.map((c) => enZona(ahora, c.zona).fecha),
            }),
          ) as unknown as RpcHoy;
          const t = armarHoy(rpc, cfgs);
          return aPesos({
            modo: 'hoy',
            ultimo_corte: t.ultimoCorte,
            ignoradas: [...ignoradas, ...sinConfig],
            sucursales: t.sucursales.map((s) => ({
              company_id: s.companyId,
              nombre: s.nombre,
              ciudad: s.ciudad,
              sin_corte: s.sinCorte,
              completa: s.completa,
              corte_segundo: s.corteSegundo,
              hoy: s.hoy,
              comparable: s.comparable,
              comparado_a_segundo: s.comparadoA,
            })),
          }) as Record<string, unknown>;
        }
        const p = rango(e);
        const dias = exigir(
          await db.rpc('mcp_ventas_dias', { p_companias: companias, p_desde: p.desde, p_hasta: p.hasta, p_horas: false }),
        ) as unknown as DiaVentas[];
        const nombres = new Map(todas.map((s) => [s.company_id, nombreDe(s)]));
        let filas: Record<string, unknown>[];
        if (e.agrupar === 'sucursal_dia') {
          filas = dias.map((d) => ({
            company_id: d.company_id,
            nombre: nombres.get(d.company_id),
            fecha: d.fecha,
            completa: d.completa,
            total: totalDe(d.origenes),
            por_canal: d.origenes,
          }));
        } else {
          const clave = (d: DiaVentas) => (e.agrupar === 'dia' ? d.fecha : String(d.company_id));
          const grupos = new Map<string, DiaVentas[]>();
          for (const d of dias) grupos.set(clave(d), [...(grupos.get(clave(d)) ?? []), d]);
          filas = [...grupos.values()].map((ds) => {
            const por_canal = ds.reduce<PorOrigen<TotalesOrigen>>((acc, d) => sumarPorCanal(acc, d.origenes), {});
            const base =
              e.agrupar === 'dia'
                ? { fecha: ds[0].fecha, sucursales: ds.length }
                : { company_id: ds[0].company_id, nombre: nombres.get(ds[0].company_id), dias: ds.length };
            return {
              ...base,
              total: totalDe(por_canal),
              por_canal,
              dias_incompletos:
                e.agrupar === 'dia'
                  ? ds.filter((d) => !d.completa).map((d) => d.company_id)
                  : ds.filter((d) => !d.completa).map((d) => d.fecha),
            };
          });
          if (e.agrupar === 'sucursal')
            filas.sort((a, b) => (b.total as TotalesOrigen).venta_cent - (a.total as TotalesOrigen).venta_cent);
        }
        const desde = (e.pagina - 1) * e.limite;
        return aPesos({
          modo: 'periodo',
          ...p,
          agrupar: e.agrupar,
          ignoradas,
          ...resultadoPagina(filas.slice(desde, desde + e.limite + 1), e.pagina, e.limite),
        }) as Record<string, unknown>;
      },
    ),
    consulta(
      'ventas_por_hora',
      `Pedidos y venta por hora local (0–23) de UN día, sumando las sucursales pedidas (o todas), separados por canal. Para una sola sucursal, pásala en sucursales. ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({ fecha, sucursales: listaSucursales }),
      async (e) => {
        const { companias, ignoradas } = elegir(await visibles(db), 'sucursales', e.sucursales);
        const dias = exigir(
          await db.rpc('mcp_ventas_dias', { p_companias: companias, p_desde: e.fecha, p_hasta: e.fecha, p_horas: true }),
        ) as unknown as DiaVentas[];
        const horas = Array.from({ length: 24 }, (_, hora) => ({
          hora,
          pedidos: 0,
          venta_cent: 0,
          por_canal: {} as Record<string, { pedidos: number; venta_cent: number }>,
        }));
        for (const d of dias)
          for (const [canal, [pedidos, venta]] of Object.entries(d.horas ?? {}))
            for (let h = 0; h < 24; h++) {
              if (!pedidos[h] && !venta[h]) continue;
              const x = horas[h];
              x.pedidos += pedidos[h];
              x.venta_cent += venta[h];
              const c = (x.por_canal[canal] ??= { pedidos: 0, venta_cent: 0 });
              c.pedidos += pedidos[h];
              c.venta_cent += venta[h];
            }
        return aPesos({
          fecha: e.fecha,
          sucursales_con_datos: dias.length,
          incompletas: dias.filter((d) => !d.completa).map((d) => d.company_id),
          ignoradas,
          horas,
        }) as Record<string, unknown>;
      },
    ),
    consulta(
      'ventas_por_producto',
      `Productos vendidos en un periodo (máximo ${MAX_DIAS} días), ordenados por importe: código, nombre, líneas vendidas, importe, en cuántas sucursales se vendió y desglose por canal. canal filtra un solo canal. Paginado (máximo 50 por página). ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({
        desde: fecha,
        hasta: fecha,
        sucursales: listaSucursales,
        canal: z.enum(['mostrador', 'app', 'rappi']).optional(),
        pagina,
        limite,
      }),
      async (e) => {
        const p = rango(e);
        const { companias, ignoradas } = elegir(await visibles(db), 'sucursales', e.sucursales);
        const r = exigir(
          await db.rpc('sucursales_tablero_periodo', { p_companias: companias, p_desde: p.desde, p_hasta: p.hasta }),
        ) as unknown as RpcPeriodo;
        const productos = new Map<
          string,
          { codigo: string; nombre: string; lineas: number; importe_cent: number; sucursales: number; por_canal: Record<string, { lineas: number; importe_cent: number }> }
        >();
        for (const x of r.productos) {
          if (e.canal && x.origen !== e.canal) continue;
          const prod = productos.get(x.clave) ?? { codigo: x.codigo, nombre: x.nombre, lineas: 0, importe_cent: 0, sucursales: x.sucursales, por_canal: {} };
          prod.lineas += x.lineas;
          prod.importe_cent += x.importe_cent;
          prod.por_canal[x.origen] = { lineas: x.lineas, importe_cent: x.importe_cent };
          productos.set(x.clave, prod);
        }
        const filas = [...productos.values()].sort((a, b) => b.importe_cent - a.importe_cent || a.codigo.localeCompare(b.codigo));
        const desde = (e.pagina - 1) * e.limite;
        return aPesos({
          ...p,
          canal: e.canal ?? null,
          dias_leidos: r.dias_leidos,
          dias_incompletos: r.incompletos,
          ignoradas,
          ...resultadoPagina(filas.slice(desde, desde + e.limite + 1), e.pagina, e.limite),
        }) as Record<string, unknown>;
      },
    ),
  ];
}
