// Arqueo y caja chica (migración 84): cálculo puro de lo esperado en caja y del resumen que ve la gerencia.
import { CORTE_DIA_HORAS, sumarDias } from './dia';

/** Método de pago del POS para efectivo. */
export const EFECTIVO = 'DINHEIRO';

export const CATEGORIAS_GASTO = [
  { clave: 'insumos', nombre: 'Insumos' },
  { clave: 'limpieza', nombre: 'Limpieza' },
  { clave: 'mantenimiento', nombre: 'Mantenimiento' },
  { clave: 'papeleria', nombre: 'Papelería' },
  { clave: 'transporte', nombre: 'Transporte' },
  { clave: 'otro', nombre: 'Otro' },
] as const;
export type CategoriaGasto = (typeof CATEGORIAS_GASTO)[number]['clave'];

export interface MomentoLocal {
  fecha: string;
  segundo: number;
}
export interface PedidoCaja {
  fecha: string;
  segundo: number;
  metodo: string;
  ventaCent: number;
}
export interface GastoCaja {
  id: number;
  dia: string;
  concepto: string | null;
  categoria: string | null;
  monto: number | string | null;
  en_efectivo: boolean;
  comprobante: boolean;
  nota: string | null;
  anula_id: number | null;
  nombre: string;
  registrado_en: string;
}

const clave = (m: MomentoLocal) => `${m.fecha}|${String(m.segundo).padStart(5, '0')}`;
const CORTE = CORTE_DIA_HORAS * 3600;

/**
 * Efectivo cobrado en el POS durante el día de operación `dia` (de las 4:00 a las 4:00 del día siguiente, hora de la
 * tienda) hasta el instante `hasta`, en centavos.
 */
export function efectivoHasta(pedidos: PedidoCaja[], dia: string, hasta: MomentoLocal): number {
  const inicio = clave({ fecha: dia, segundo: CORTE });
  const fin = clave({ fecha: sumarDias(dia, 1), segundo: CORTE });
  const tope = clave(hasta) < fin ? clave(hasta) : fin;
  return pedidos
    .filter((p) => p.metodo === EFECTIVO)
    .filter((p) => {
      const k = clave(p);
      return k >= inicio && k <= tope && k < fin;
    })
    .reduce((s, p) => s + p.ventaCent, 0);
}

/** Gastos vigentes: sin las anulaciones ni los gastos anulados. */
export function gastosVigentes<T extends GastoCaja>(gastos: T[]): T[] {
  const anulados = new Set(gastos.map((g) => g.anula_id).filter((x) => x !== null));
  return gastos.filter((g) => g.anula_id === null && !anulados.has(g.id));
}

/** Gastos en efectivo registrados hasta un instante (ISO), en pesos. */
export const gastosEfectivoHasta = (gastos: GastoCaja[], hastaIso: string) =>
  gastosVigentes(gastos)
    .filter((g) => g.en_efectivo && g.registrado_en <= hastaIso)
    .reduce((s, g) => s + Number(g.monto ?? 0), 0);

export interface ResumenArqueo {
  contado: number;
  fondo: number;
  efectivoPos: number;
  gastos: number;
  esperado: number;
  diferencia: number;
  /** La diferencia pasa la tolerancia configurada. */
  fuera: boolean;
}

/** Esperado = fondo + efectivo del POS − gastos en efectivo. Diferencia = contado − esperado (en pesos, 2 decimales). */
export function resumenArqueo(a: {
  contado: number;
  fondo: number;
  tolerancia: number;
  efectivoCent: number;
  gastos: number;
}): ResumenArqueo {
  const r2 = (x: number) => Math.round(x * 100) / 100;
  const efectivoPos = r2(a.efectivoCent / 100);
  const esperado = r2(a.fondo + efectivoPos - a.gastos);
  const diferencia = r2(a.contado - esperado);
  return {
    contado: r2(a.contado),
    fondo: r2(a.fondo),
    efectivoPos,
    gastos: r2(a.gastos),
    esperado,
    diferencia,
    fuera: Math.abs(diferencia) > a.tolerancia,
  };
}
