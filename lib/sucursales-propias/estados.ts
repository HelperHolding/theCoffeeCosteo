// Estados de una transferencia (spec §6) y cómo se muestran.
export type EstadoTransferencia =
  | 'cuadra'
  | 'no_cuadra'
  | 'desconocido'
  | 'sin_facturas'
  | 'aplicando'
  | 'aplicada'
  | 'aplicada_sin_adjunto'
  | 'error'
  | 'ya_aplicada';

export const ESTADOS: Record<EstadoTransferencia, { texto: string; tono: 'ok' | 'warn' | 'bad' | 'muted' }> =
  {
    cuadra: { texto: 'Cuadra', tono: 'ok' },
    no_cuadra: { texto: 'No cuadra', tono: 'warn' },
    desconocido: { texto: 'Proveedor desconocido', tono: 'warn' },
    sin_facturas: { texto: 'Sin facturas abiertas', tono: 'muted' },
    aplicando: { texto: 'Aplicando…', tono: 'muted' },
    aplicada: { texto: 'Aplicada', tono: 'ok' },
    aplicada_sin_adjunto: { texto: 'Aplicada · falta el recibo', tono: 'warn' },
    error: { texto: 'Error', tono: 'bad' },
    ya_aplicada: { texto: 'Ya estaba en Zoho', tono: 'ok' },
  };

export const PREVIOS = [
  'cuadra',
  'no_cuadra',
  'desconocido',
  'sin_facturas',
] as const satisfies readonly EstadoTransferencia[];
export const APLICADAS = [
  'aplicada',
  'aplicada_sin_adjunto',
  'ya_aplicada',
] as const satisfies readonly EstadoTransferencia[];

export function contar(estados: string[]) {
  const en = (lista: readonly string[]) => estados.filter((e) => lista.includes(e)).length;
  return {
    total: estados.length,
    aplicadas: en(APLICADAS),
    listas: en(['cuadra']),
    revisar: en(['no_cuadra', 'desconocido', 'sin_facturas', 'error']),
  };
}
