import type { Origen, PedidoNormal } from '../sucursales/normalizar';
import { enZona, sumarDias } from '../sucursales/tiempo';

/**
 * Contrato de Analytics (docs/analytics-zoho/02 y 05). Agregados diarios por tienda × fecha × fuente × canal,
 * en centavos enteros. Los KPI usan solo POS mostrador + app; Rappi (POS o Zoho) queda fuera (D5).
 */
export type Fuente = 'pos' | 'zoho_rappi';
export type CanalPos = Origen;
export type CanalZohoRappi = 'rappi' | 'rappi_turbo';
export const CANALES_POS: readonly CanalPos[] = ['app', 'desconocido', 'mostrador', 'rappi'];
export const CANALES_ZOHO_RAPPI: readonly CanalZohoRappi[] = ['rappi', 'rappi_turbo'];

export const VERSION_POS = 'pos-diario-v1';
export const CRITERIO_FECHA_POS =
  'createdAt del POS = hora local de la tienda etiquetada con Z; fecha = sus primeros 10 caracteres';

export interface VentaCanal {
  canal: string;
  venta_cent: number;
  tickets: number;
  unidades: number;
}

/** Cuerpo de public.analytics_guardar_lectura(jsonb). */
export interface LecturaDiaria {
  fuente: Fuente;
  company_id: number;
  fecha: string;
  leido_en: string;
  provisional: boolean;
  completa: true;
  version_calculo: string;
  criterio_fecha: string;
  origen: string;
  carga_id: string;
  canales: VentaCanal[];
}

export type EstadoDia = 'cerrado' | 'provisional' | 'futuro';

/**
 * Zonas IANA contempladas: todas las de México (incluidas las fronterizas con horario de verano de EE. UU.).
 * No se infiere ninguna "más atrasada": el fin de un día se calcula en cada una y se toma el último.
 * La misma lista está en la función SQL analytics_guardar_lectura (migración 23).
 */
export const ZONAS_MEXICO = [
  'America/Bahia_Banderas',
  'America/Cancun',
  'America/Chihuahua',
  'America/Ciudad_Juarez',
  'America/Hermosillo',
  'America/Matamoros',
  'America/Mazatlan',
  'America/Merida',
  'America/Mexico_City',
  'America/Monterrey',
  'America/Ojinaga',
  'America/Tijuana',
] as const;

/** Instante UTC en que empieza `fecha` (00:00:00 local) en `zona`. Exacto también en días de cambio de horario. */
export function inicioLocal(fecha: string, zona: string): Date {
  const [a, m, d] = fecha.split('-').map(Number);
  const objetivo = Date.UTC(a, m - 1, d);
  let t = objetivo;
  for (let i = 0; i < 3; i++) {
    const l = enZona(new Date(t), zona);
    const [la, lm, ld] = l.fecha.split('-').map(Number);
    t += objetivo - (Date.UTC(la, lm - 1, ld) + l.segundo * 1000);
  }
  return new Date(t);
}

/** Instantes en que la fecha empieza en la primera zona y termina en la última de las contempladas. */
export function ventanaDia(fecha: string): { inicio: Date; fin: Date } {
  const inicios = ZONAS_MEXICO.map((z) => inicioLocal(fecha, z).getTime());
  const fines = ZONAS_MEXICO.map((z) => inicioLocal(sumarDias(fecha, 1), z).getTime());
  return { inicio: new Date(Math.min(...inicios)), fin: new Date(Math.max(...fines)) };
}

/**
 * futuro: la fecha aún no empieza en ninguna zona · provisional: empezó en alguna y no ha terminado en todas ·
 * cerrado: ya terminó en todas las zonas contempladas.
 */
export function estadoDia(fecha: string, ahora: Date): EstadoDia {
  const { inicio, fin } = ventanaDia(fecha);
  if (ahora < inicio) return 'futuro';
  if (ahora < fin) return 'provisional';
  return 'cerrado';
}

/** Fechas de una ventana inclusiva. */
export function fechasEntre(desde: string, hasta: string): string[] {
  const r: string[] = [];
  for (let f = desde; f <= hasta; f = sumarDias(f, 1)) r.push(f);
  return r;
}

/**
 * Agrega pedidos normalizados por fecha y canal. Cada fecha pedida devuelve los 4 canales, aunque estén en
 * cero ("sin ventas" es un dato). Unidades = líneas de producto (1 línea = 1 unidad; = SUM(Products) de Zoho).
 */
export function agregarPos(pedidos: PedidoNormal[], fechas: string[]): Map<string, VentaCanal[]> {
  const r = new Map<string, Map<CanalPos, VentaCanal>>();
  for (const f of fechas)
    r.set(f, new Map(CANALES_POS.map((c) => [c, { canal: c, venta_cent: 0, tickets: 0, unidades: 0 }])));
  for (const p of pedidos) {
    const dia = r.get(p.fecha);
    if (!dia) throw new Error(`Pedido ${p.id} fuera de las fechas pedidas (${p.fecha})`);
    const v = dia.get(p.origen)!;
    v.venta_cent += p.ventaCent;
    v.tickets += 1;
    v.unidades += p.lineas.length;
  }
  return new Map([...r].map(([f, m]) => [f, CANALES_POS.map((c) => m.get(c)!)]));
}

export interface FilaKpi {
  venta_cent: number;
  tickets: number;
  unidades: number;
}

export interface Resumen extends FilaKpi {
  /** Cociente de sumas; null sin tickets (nunca 0). */
  ticketPromedioCent: number | null;
  unidadesPorTicket: number | null;
}

export function resumir(filas: FilaKpi[]): Resumen {
  const t = filas.reduce(
    (a, f) => ({
      venta_cent: a.venta_cent + Number(f.venta_cent),
      tickets: a.tickets + Number(f.tickets),
      unidades: a.unidades + Number(f.unidades),
    }),
    { venta_cent: 0, tickets: 0, unidades: 0 },
  );
  return {
    ...t,
    ticketPromedioCent: t.tickets ? t.venta_cent / t.tickets : null,
    unidadesPorTicket: t.tickets ? t.unidades / t.tickets : null,
  };
}
