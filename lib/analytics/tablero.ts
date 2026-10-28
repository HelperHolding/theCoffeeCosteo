import { enZona, sumarDias } from '../sucursales/tiempo';
import { estadoDia, fechasEntre, resumir, type FilaKpi, type Resumen } from './contrato';

/** Filas tal como salen de la base (vista analytics_ventas_kpi y tablas analytics_*). */
export interface FilaKpiDb extends FilaKpi {
  company_id: number;
  fecha: string;
  provisional: boolean;
  leido_en: string;
  mostrador_cent: number;
  app_cent: number;
  rappi_pos_tickets: number;
  rappi_pos_cent: number;
  sin_origen_tickets: number;
}
export interface TiendaDb {
  company_id: number;
  store_id: number;
  nombre: string;
}
export interface RappiZohoDb {
  company_id: number;
  fecha: string;
  venta_cent: number;
  tickets: number;
}
export interface DatosSemana {
  tiendas: TiendaDb[];
  kpi: FilaKpiDb[];
  rappiZoho: RappiZohoDb[];
}

/**
 * futuro: aún no empieza · sin-lectura: ninguna tienda leída · parcial: faltan tiendas ·
 * provisional: día abierto, leído mientras seguía abierto · pendiente-cierre: el día ya terminó pero su
 * última lectura completa se hizo con el día abierto · cerrado: leído después de terminar el día.
 * "Sin ventas" no es un estado: es un día leído con 0 tickets. "Lectura completa" (todas las páginas de la
 * API) no implica "día cerrado".
 */
export type EstadoDiaTablero =
  'futuro' | 'sin-lectura' | 'parcial' | 'provisional' | 'pendiente-cierre' | 'cerrado';

/** Texto de cada estado (lo usan componentes de servidor y de cliente: no puede vivir en un módulo 'use client'). */
export const TEXTO_ESTADO: Record<EstadoDiaTablero, string> = {
  cerrado: 'Cerrado',
  provisional: 'Provisional',
  'pendiente-cierre': 'Pendiente de cierre',
  parcial: 'Lectura parcial',
  'sin-lectura': 'Sin lectura',
  futuro: 'Por venir',
};

/** Una lectura provisional con más de esta edad se marca como desactualizada. */
export const EDAD_MAXIMA_PROVISIONAL_MS = 3 * 3600_000;

/** Venta por canal (centavos con IVA); mostrador + app = venta del KPI. */
export interface Canales {
  mostrador_cent: number;
  app_cent: number;
}
export interface DiaTablero {
  fecha: string;
  estado: EstadoDiaTablero;
  tiendasLeidas: number;
  resumen: Resumen | null;
  canales: Canales | null;
}
export interface FilaTienda extends TiendaDb {
  diasLeidos: number;
  resumen: Resumen | null;
  canales: Canales | null;
}
/** Estado de cada tienda en un día transcurrido, en el orden de `Tablero.tiendas`. */
export type CeldaCobertura = 'ventas' | 'sin-ventas' | 'sin-lectura';
export interface Tablero {
  semana: { desde: string; hasta: string; anterior: string; siguiente: string | null };
  dias: DiaTablero[];
  total: Resumen | null;
  tiendasEsperadas: number;
  lecturasEsperadas: number;
  lecturasObtenidas: number;
  faltantes: { fecha: string; tiendas: number }[];
  ultimaLectura: string | null;
  hayProvisional: boolean;
  /** Días terminados cuya última lectura se hizo con el día abierto (falta la lectura de cierre). */
  pendientesCierre: string[];
  /** Hay datos del día en curso con lectura más antigua que EDAD_MAXIMA_PROVISIONAL_MS. */
  desactualizado: boolean;
  tiendas: FilaTienda[];
  cobertura: { fecha: string; celdas: CeldaCobertura[] }[];
  excluido: {
    rappiPos: { tickets: number; venta_cent: number };
    sinOrigenTickets: number;
    rappiZoho: { tickets: number; venta_cent: number; fechas: string[] };
  };
}

/** Lunes (fecha local de Ciudad de México) de la semana que contiene `ahora`. */
export function lunesDe(fecha: string): string {
  const dow = new Date(`${fecha}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(fecha, dow === 0 ? -6 : 1 - dow);
}
export const semanaActual = (ahora: Date) => lunesDe(enZona(ahora, 'America/Mexico_City').fecha);

const canales = (filas: FilaKpiDb[]): Canales | null =>
  filas.length
    ? {
        mostrador_cent: filas.reduce((s, f) => s + Number(f.mostrador_cent), 0),
        app_cent: filas.reduce((s, f) => s + Number(f.app_cent), 0),
      }
    : null;

export function construirTablero(d: DatosSemana, lunes: string, ahora: Date): Tablero {
  const fechas = fechasEntre(lunes, sumarDias(lunes, 6));
  const esperadas = d.tiendas.length;
  const porFecha = new Map<string, FilaKpiDb[]>();
  for (const k of d.kpi) (porFecha.get(k.fecha) ?? porFecha.set(k.fecha, []).get(k.fecha)!).push(k);

  const dias: DiaTablero[] = fechas.map((fecha) => {
    const filas = porFecha.get(fecha) ?? [];
    const base = estadoDia(fecha, ahora);
    if (base === 'futuro') return { fecha, estado: 'futuro', tiendasLeidas: 0, resumen: null, canales: null };
    if (!filas.length)
      return { fecha, estado: 'sin-lectura', tiendasLeidas: 0, resumen: null, canales: null };
    const estado: EstadoDiaTablero =
      filas.length < esperadas
        ? 'parcial'
        : !filas.some((f) => f.provisional)
          ? 'cerrado'
          : base === 'cerrado'
            ? 'pendiente-cierre'
            : 'provisional';
    return { fecha, estado, tiendasLeidas: filas.length, resumen: resumir(filas), canales: canales(filas) };
  });
  const transcurridos = dias.filter((x) => x.estado !== 'futuro');
  const leidas = d.kpi.filter((k) => fechas.includes(k.fecha));
  const porTienda = new Map<number, FilaKpiDb[]>();
  for (const k of leidas)
    (porTienda.get(k.company_id) ?? porTienda.set(k.company_id, []).get(k.company_id)!).push(k);
  const sumar = <K extends keyof FilaKpiDb>(k: K) => leidas.reduce((s, f) => s + Number(f[k]), 0);
  const zoho = d.rappiZoho.filter((r) => fechas.includes(r.fecha));
  const tiendas: FilaTienda[] = d.tiendas
    .map((t) => {
      const f = porTienda.get(t.company_id) ?? [];
      return { ...t, diasLeidos: f.length, resumen: f.length ? resumir(f) : null, canales: canales(f) };
    })
    .sort(
      (a, b) =>
        (b.resumen?.venta_cent ?? -1) - (a.resumen?.venta_cent ?? -1) ||
        a.nombre.localeCompare(b.nombre, 'es-MX'),
    );
  const hoy = enZona(ahora, 'America/Mexico_City').fecha;
  const siguiente = sumarDias(lunes, 7);
  return {
    semana: {
      desde: lunes,
      hasta: fechas[6],
      anterior: sumarDias(lunes, -7),
      siguiente: siguiente <= hoy ? siguiente : null,
    },
    dias,
    total: leidas.length ? resumir(leidas) : null,
    tiendasEsperadas: esperadas,
    lecturasEsperadas: esperadas * transcurridos.length,
    lecturasObtenidas: leidas.length,
    faltantes: transcurridos
      .filter((x) => x.tiendasLeidas < esperadas)
      .map((x) => ({ fecha: x.fecha, tiendas: esperadas - x.tiendasLeidas })),
    ultimaLectura: leidas.reduce<string | null>((m, f) => (!m || f.leido_en > m ? f.leido_en : m), null),
    hayProvisional: leidas.some((f) => f.provisional),
    pendientesCierre: [
      ...new Set(
        leidas.filter((f) => f.provisional && estadoDia(f.fecha, ahora) === 'cerrado').map((f) => f.fecha),
      ),
    ].sort(),
    desactualizado: leidas.some(
      (f) =>
        f.provisional &&
        estadoDia(f.fecha, ahora) === 'provisional' &&
        ahora.getTime() - new Date(f.leido_en).getTime() > EDAD_MAXIMA_PROVISIONAL_MS,
    ),
    tiendas,
    cobertura: transcurridos.map((x) => {
      const filas = new Map((porFecha.get(x.fecha) ?? []).map((f) => [f.company_id, f]));
      return {
        fecha: x.fecha,
        celdas: tiendas.map((t): CeldaCobertura => {
          const f = filas.get(t.company_id);
          return !f ? 'sin-lectura' : Number(f.tickets) > 0 ? 'ventas' : 'sin-ventas';
        }),
      };
    }),
    excluido: {
      rappiPos: { tickets: sumar('rappi_pos_tickets'), venta_cent: sumar('rappi_pos_cent') },
      sinOrigenTickets: sumar('sin_origen_tickets'),
      rappiZoho: {
        tickets: zoho.reduce((s, r) => s + Number(r.tickets), 0),
        venta_cent: zoho.reduce((s, r) => s + Number(r.venta_cent), 0),
        fechas: [...new Set(zoho.map((r) => r.fecha))].sort(),
      },
    },
  };
}
