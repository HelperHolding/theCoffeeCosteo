/**
 * Nuestros códigos externos de forma de pago (CODFPTPVEXT). Areas los traduce a los suyos; 101 Efectivo ya está en su
 * tabla. Evidencia de las combinaciones: docs/bi/zoho/pagos.json (pedidos de Rubén Darío y Polanco del 2026-11-03).
 */
export const FORMAS_PAGO = [
  { codigo: 101, descripcion: 'Efectivo' },
  { codigo: 102, descripcion: 'Tarjeta' },
  { codigo: 103, descripcion: 'App - Tarjeta' },
  { codigo: 104, descripcion: 'App - Saldo' },
  { codigo: 105, descripcion: 'Rappi' },
];

const TARJETA_FISICA = new Set(['EMV', 'CONTACTLESS_EMV', 'CONTINGENCY']);

/** null = combinación sin mapeo: el ticket se descarta y sale en el reporte para agregarla. */
export function codigoPago(p: { metodo: string; tipo: string }): number | null {
  switch (p.metodo) {
    case 'DINHEIRO':
      return 101;
    case 'CARTAO':
      return p.tipo === 'WALLET' ? 103 : TARJETA_FISICA.has(p.tipo) ? 102 : null;
    case 'VIRTUAL_WALLET':
      return p.tipo === 'WALLET' ? 103 : null;
    case 'WALLET_BALANCE':
      return 104;
    case 'RAPPI':
      return 105;
    default:
      return null;
  }
}
