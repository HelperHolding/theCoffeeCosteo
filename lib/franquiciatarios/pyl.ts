// P&L mensual de la sucursal (F5) y metas de venta: cálculo puro. Lo ven gerente, franquiciatario y admin.
// Fuentes: ventas del POS + Rappi (mismas funciones que Sucursales), compras a la Comercializadora (pedidos del sitio
// viejo), caja chica, gastos fijos (Zoho «Gastos Sucursales» o captura de la gerencia) y metas de BI (Zoho).
import { sumarDias } from './dia';

export const CONCEPTOS_FIJOS = [
  { clave: 'renta', nombre: 'Renta' },
  { clave: 'nomina', nombre: 'Nómina' },
  { clave: 'energia', nombre: 'Energía eléctrica' },
  { clave: 'servicios', nombre: 'Agua y teléfono' },
  { clave: 'pos', nombre: 'Comisión del POS' },
  { clave: 'suscripciones', nombre: 'Suscripciones' },
  { clave: 'regalias', nombre: 'Regalías' },
  { clave: 'marketing', nombre: 'Marketing' },
  { clave: 'mantenimiento', nombre: 'Mantenimiento' },
  { clave: 'otros', nombre: 'Otros' },
] as const;
export type ConceptoFijo = (typeof CONCEPTOS_FIJOS)[number]['clave'];

export interface FijoVigente {
  concepto: string;
  monto: number;
  origen: 'manual' | 'zoho';
  nombre: string;
  registrado_en: string;
}

/** El registro vigente de cada concepto del mes es el último capturado. */
export function fijosVigentes<
  T extends {
    id: number;
    concepto: string;
    monto: number | string;
    origen: string;
    nombre: string;
    registrado_en: string;
  },
>(filas: T[]): FijoVigente[] {
  const m = new Map<string, T>();
  for (const f of [...filas].sort((a, b) => a.id - b.id)) m.set(f.concepto, f);
  return CONCEPTOS_FIJOS.flatMap(({ clave }) => {
    const f = m.get(clave);
    return f
      ? [
          {
            concepto: clave,
            monto: Number(f.monto),
            origen: f.origen === 'zoho' ? 'zoho' : 'manual',
            nombre: f.nombre,
            registrado_en: f.registrado_en,
          } as FijoVigente,
        ]
      : [];
  });
}

export interface EntradaPyl {
  /** Días del mes y días transcurridos (con venta posible) a la fecha del cálculo. */
  diasMes: number;
  diasTranscurridos: number;
  ventaCent: number;
  descuentoCent: number;
  ventaRappiCent: number;
  /** Comisión de cobro que reporta el POS (venta − neto) de los pedidos que la traen. */
  comisionPosCent: number;
  iva: number;
  comisionRappi: number;
  /** Compras a la Comercializadora del mes, con IVA (pesos). */
  compras: number;
  cajaChica: number;
  fijos: FijoVigente[];
}

export interface LineaPyl {
  clave: string;
  nombre: string;
  /** Mes a la fecha. */
  real: number;
  /** Proyección al cierre del mes (las variables escalan con los días; los fijos van completos). */
  proyeccion: number;
  tipo: 'ingreso' | 'costo' | 'subtotal' | 'resultado';
  nota?: string;
}
export interface Pyl {
  lineas: LineaPyl[];
  /** Venta con IVA para cubrir los gastos fijos del mes (null si el margen no alcanza). */
  puntoEquilibrio: number | null;
  margenContribucion: number | null;
  avanceMes: number;
}

const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * Estado de resultados del mes. Todo en pesos y SIN IVA salvo la primera línea (venta con IVA) y el punto de
 * equilibrio (en venta con IVA, para compararlo con lo que reporta la caja). Supuestos marcados en cada línea.
 */
export function armarPyl(e: EntradaPyl): Pyl {
  const avance = e.diasMes > 0 ? Math.min(1, Math.max(e.diasTranscurridos, 0) / e.diasMes) : 1;
  const escala = (x: number) => (avance > 0 ? x / avance : 0);
  const sinIva = (x: number) => x / (1 + e.iva);
  const venta = e.ventaCent / 100;
  const netas = sinIva(venta);
  const comisiones = sinIva((e.ventaRappiCent / 100) * e.comisionRappi + e.comisionPosCent / 100);
  const compras = sinIva(e.compras);
  const bruto = netas - comisiones - compras;
  const contribucion = bruto - e.cajaChica;
  const fijos = e.fijos.reduce((s, f) => s + f.monto, 0);
  const utilidad = contribucion - fijos;
  const L = (
    clave: string,
    nombre: string,
    real: number,
    tipo: LineaPyl['tipo'],
    fijo = false,
    nota?: string,
  ): LineaPyl => ({
    clave,
    nombre,
    real: r2(real),
    proyeccion: r2(fijo ? real : escala(real)),
    tipo,
    ...(nota ? { nota } : {}),
  });
  const lineas: LineaPyl[] = [
    L('venta', 'Venta con IVA', venta, 'ingreso', false, 'POS y Rappi, igual que Sucursales'),
    L(
      'descuentos',
      'Descuentos otorgados',
      e.descuentoCent / 100,
      'ingreso',
      false,
      'Ya restados de la venta',
    ),
    L('netas', 'Venta neta sin IVA', netas, 'subtotal'),
    L(
      'comisiones',
      'Comisiones (Rappi y cobro)',
      comisiones,
      'costo',
      false,
      `Rappi ${Math.round(e.comisionRappi * 100)} % estimado + cobro del POS`,
    ),
    L('compras', 'Compras a la Comercializadora', compras, 'costo', false, 'Pedidos del mes, sin IVA'),
    L('bruto', 'Margen bruto', bruto, 'subtotal'),
    L('caja', 'Caja chica', e.cajaChica, 'costo', false, 'Gastos vigentes del mes'),
    L('contribucion', 'Contribución', contribucion, 'subtotal'),
    ...e.fijos.map((f) =>
      L(
        `fijo-${f.concepto}`,
        CONCEPTOS_FIJOS.find((c) => c.clave === f.concepto)?.nombre ?? f.concepto,
        f.monto,
        'costo',
        true,
        f.origen === 'zoho' ? 'Zoho · Gastos Sucursales' : `Capturado por ${f.nombre}`,
      ),
    ),
    {
      clave: 'utilidad',
      nombre: 'Utilidad de operación',
      real: r2(contribucion - fijos),
      proyeccion: r2(escala(contribucion) - fijos),
      tipo: 'resultado',
    },
  ];
  // Margen de contribución por peso vendido (con IVA) → venta necesaria para cubrir los fijos.
  const margen = venta > 0 ? contribucion / venta : null;
  return {
    lineas: lineas.filter((l) => l.clave !== 'descuentos' || l.real > 0),
    puntoEquilibrio: margen && margen > 0 ? r2(fijos / margen) : null,
    margenContribucion: margen,
    avanceMes: avance,
  };
}

export interface MetaDia {
  fecha: string;
  venta_cent: number;
  tickets: number;
}
export interface Metas {
  dia: number | null;
  semana: number | null;
  mes: number | null;
  /** Lunes a domingo de la semana del día. */
  semanaDesde: string;
  semanaHasta: string;
}

/** Lunes (AAAA-MM-DD) de la semana de un día. */
export function lunesDe(dia: string): string {
  const d = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 = domingo
  return sumarDias(dia, -((d + 6) % 7));
}

/**
 * Metas de venta (pesos, con IVA) del día, la semana (lunes a domingo) y el mes, a partir de las metas diarias de BI.
 * null cuando no hay meta cargada para ese periodo (nunca cero).
 */
export function metasDe(dia: string, diarias: MetaDia[], metaMesCent: number | null): Metas {
  const desde = lunesDe(dia);
  const hasta = sumarDias(desde, 6);
  const porFecha = new Map(diarias.map((d) => [d.fecha, Number(d.venta_cent)]));
  const hoy = porFecha.get(dia);
  const semana = diarias.filter((d) => d.fecha >= desde && d.fecha <= hasta);
  return {
    dia: hoy === undefined ? null : hoy / 100,
    semana: semana.length ? semana.reduce((s, d) => s + Number(d.venta_cent), 0) / 100 : null,
    mes: metaMesCent === null ? null : metaMesCent / 100,
    semanaDesde: desde,
    semanaHasta: hasta,
  };
}
