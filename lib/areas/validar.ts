import type { z } from 'zod';
import { ArqueoCajaEsquema, TicketCompletoEsquema, type ArqueoCaja, type TicketCompleto } from './tipos';

const TOLERANCIA = 0.011;
const casi = (a: number, b: number) => Math.abs(a - b) <= TOLERANCIA;
const suma = (xs: number[]) => xs.reduce((s, x) => s + Math.round(x * 100), 0) / 100;
const plano = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();

function textos(x: unknown, ruta = ''): [string, string][] {
  if (typeof x === 'string') return [[ruta, x]];
  if (Array.isArray(x)) return x.flatMap((v, i) => textos(v, `${ruta}[${i}]`));
  if (x && typeof x === 'object')
    return Object.entries(x).flatMap(([k, v]) => textos(v, ruta ? `${ruta}.${k}` : k));
  return [];
}

/** ¿El texto contiene alguno de los nombres prohibidos (sin distinguir mayúsculas ni acentos)? */
export const contieneNombre = (texto: string, prohibidos: string[]) =>
  prohibidos.map(plano).some((n) => n !== '' && plano(texto).includes(n));

/**
 * Ningún texto puede contener el nombre de la tienda. El motivo dice DÓNDE está, nunca repite el texto: el motivo
 * termina en reporte.md y sería otra fuga.
 */
function anonimato(x: unknown, prohibidos: string[]): string[] {
  const malo = textos(x).find(([, t]) => contieneNombre(t, prohibidos));
  return malo ? [`Anonimato: ${malo[0]} contiene el nombre de la tienda`] : [];
}

const forma = (r: z.ZodSafeParseResult<unknown>) =>
  r.success ? [] : r.error.issues.map((i) => `${i.path.map(String).join('.')}: ${i.message}`);

/** Motivos por los que el ticket no se puede mandar; vacío = válido. */
export function validarTicket(t: TicketCompleto, prohibidos: string[]): string[] {
  const motivos = forma(TicketCompletoEsquema.safeParse(t));
  if (motivos.length) return [...motivos, ...anonimato(t, prohibidos)];
  const venta = t.Cabecera.IMP_VEN;
  for (const f of t.FormasDePago)
    if (!casi(f.IMP_FPG, f.IMP_DIV * f.CAM_MON))
      motivos.push(`IMP_FPG de la forma ${f.NUM_ORD} no es IMP_DIV × CAM_MON`);
  if (!casi(suma(t.FormasDePago.map((f) => f.IMP_FPG)), venta))
    motivos.push('La suma de las formas de pago no es IMP_VEN');
  if (!casi(suma(t.Detalles.map((d) => d.PRE_FIN)) - t.Cabecera.IMP_DTG, venta))
    motivos.push('Σ PRE_FIN − IMP_DTG no es IMP_VEN');
  for (const d of t.Detalles)
    if (!casi(d.IMP_IVA, d.PRE_FIN - d.BAS_IVA))
      motivos.push(`IMP_IVA de la línea ${d.NUM_LIN} no es PRE_FIN − BAS_IVA`);
  return [...motivos, ...anonimato(t, prohibidos)];
}

/** Motivos por los que el arqueo no se puede mandar; vacío = válido. */
export function validarArqueo(a: ArqueoCaja, tickets: TicketCompleto[], prohibidos: string[]): string[] {
  const motivos = forma(ArqueoCajaEsquema.safeParse(a));
  if (!casi(a.Monto, suma(tickets.map((t) => t.Cabecera.IMP_VEN))))
    motivos.push('Monto no es la suma de IMP_VEN de los tickets del día');
  return [...motivos, ...anonimato(a, prohibidos)];
}
