// Empate de una transferencia con su proveedor de Zoho y sus facturas abiertas (spec §4 paso 2). Puro.
import { centavos } from './recibos';

export interface Proveedor {
  id: string;
  nombre: string;
}

/** Factura de proveedor con saldo, tal como la devuelve la Edge Function zoho-suc-pagos (acción "facturas"). */
export interface Factura {
  billId: string;
  vendorId: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  saldo: number;
  ubicacion: string;
  notas: string;
}

export interface Asignacion {
  billId: string;
  numero: string;
  ubicacion: string;
  fecha: string;
  saldo: number;
  monto: number;
}

export type EstadoPrevio = 'cuadra' | 'no_cuadra' | 'desconocido' | 'sin_facturas';

export interface Empate {
  estado: EstadoPrevio;
  proveedor: Proveedor | null;
  /** true si el proveedor salió por nombre parecido (la equivalencia por CLABE se guarda al aplicar). */
  sugerido: boolean;
  asignaciones: Asignacion[];
}

/**
 * Razón social al final del nombre: SA, SAPI o S DE RL, con o sin "DE CV", y con letras sueltas ("S A DE C V").
 * Una "S" sola al final no cuenta: puede ser la inicial de un apellido ("JUAN PEREZ S").
 */
const RAZON_SOCIAL = / (?:S ?A ?P ?I|S ?A|S DE R ?L)(?: DE C ?V)?$/;

export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(RAZON_SOCIAL, '')
    .trim();
}

/** Contiene la secuencia de palabras completa (mínimo 2 palabras, para no empatar por una sola). */
const contiene = (largo: string, corto: string) =>
  corto.split(' ').length >= 2 && ` ${largo} `.includes(` ${corto} `);

export function sugerirProveedor(alias: string, proveedores: Proveedor[]): Proveedor | null {
  const a = normalizarNombre(alias);
  if (!a) return null;
  const exactos = proveedores.filter((p) => normalizarNombre(p.nombre) === a);
  if (exactos.length) return exactos.length === 1 ? exactos[0] : null;
  const parciales = proveedores.filter((p) => {
    const n = normalizarNombre(p.nombre);
    return n !== '' && (contiene(a, n) || contiene(n, a));
  });
  return parciales.length === 1 ? parciales[0] : null;
}

const porAntiguedad = (a: Factura, b: Factura) =>
  a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero);

export const aAsignacion = (f: Factura, monto: number): Asignacion => ({
  billId: f.billId,
  numero: f.numero,
  ubicacion: f.ubicacion,
  fecha: f.fecha,
  saldo: f.saldo,
  monto,
});

/** Reparte el monto de la factura más antigua a la más nueva, sin pasar el saldo de cada una. */
export function repartir(monto: number, facturas: Factura[]): Asignacion[] {
  let resta = centavos(monto);
  const out: Asignacion[] = [];
  for (const f of [...facturas].sort(porAntiguedad)) {
    if (resta <= 0) break;
    const c = Math.min(resta, centavos(f.saldo));
    if (c <= 0) continue;
    out.push(aAsignacion(f, c / 100));
    resta -= c;
  }
  return out;
}

export function conProveedor(
  monto: number,
  proveedor: Proveedor,
  sugerido: boolean,
  facturas: Factura[],
): Empate {
  const abiertas = facturas.filter((f) => f.vendorId === proveedor.id && centavos(f.saldo) > 0);
  if (!abiertas.length) return { estado: 'sin_facturas', proveedor, sugerido, asignaciones: [] };
  const suma = abiertas.reduce((s, f) => s + centavos(f.saldo), 0);
  if (suma === centavos(monto))
    return {
      estado: 'cuadra',
      proveedor,
      sugerido,
      asignaciones: [...abiertas].sort(porAntiguedad).map((f) => aAsignacion(f, f.saldo)),
    };
  return { estado: 'no_cuadra', proveedor, sugerido, asignaciones: repartir(monto, abiertas) };
}

export function empatar(
  t: { clabe: string | null; alias: string; monto: number },
  equivalencias: Map<string, Proveedor>,
  proveedores: Proveedor[],
  facturas: Factura[],
): Empate {
  const fijo = t.clabe ? (equivalencias.get(t.clabe) ?? null) : null;
  const proveedor = fijo ?? sugerirProveedor(t.alias, proveedores);
  if (!proveedor) return { estado: 'desconocido', proveedor: null, sugerido: false, asignaciones: [] };
  return conProveedor(t.monto, proveedor, !fijo, facturas);
}

/** null si el reparto manual es válido; si no, el motivo en lenguaje claro. */
export function validarAsignaciones(
  monto: number,
  asignaciones: { billId: string; monto: number }[],
  facturas: Factura[],
): string | null {
  if (!asignaciones.length) return 'Elige al menos una factura.';
  const vistas = new Set<string>();
  let suma = 0;
  for (const a of asignaciones) {
    const f = facturas.find((x) => x.billId === a.billId);
    if (!f) return 'Una de las facturas ya no está abierta en Zoho.';
    if (vistas.has(a.billId)) return `La factura ${f.numero} aparece dos veces.`;
    vistas.add(a.billId);
    const c = centavos(a.monto);
    if (!(c > 0)) return `El abono a ${f.numero} debe ser mayor a cero.`;
    if (c > centavos(f.saldo))
      return `El abono a ${f.numero} es mayor que su saldo ($${f.saldo.toFixed(2)}).`;
    suma += c;
  }
  if (suma !== centavos(monto))
    return `Lo asignado ($${(suma / 100).toFixed(2)}) no es igual a la transferencia ($${monto.toFixed(2)}).`;
  return null;
}
