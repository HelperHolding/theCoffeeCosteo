import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { dependenciasReales, leerCatalogo, leerPedidos, type Dependencias } from '../../lib/sucursales/proveedor';
import { normalizar } from '../../lib/sucursales/normalizar';

/**
 * Complemento Generic · Lee UN día de una sucursal con el adaptador del portal (paginación completa, tope de llamadas),
 * busca un pedido POS por id y lo compara con una orden Rappi esperada. Imprime solo campos del pedido (sin PII; la API
 * no trae clientes) y, para el resto del día, la forma de `refundId` por método de pago, nunca sus valores.
 *   npx tsx --conditions=react-server scripts/conciliacion/pedido-rappi.ts 532 2026-10-23 31893730 2482647582
 */
const [companyId, fecha, pedidoId, ordenRappi] = process.argv.slice(2);
if (!ordenRappi) throw new Error('Uso: pedido-rappi.ts <companyId> <fecha> <pedidoPOS> <ordenRappi>');
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

let llamadas = 0;
const deps: Dependencias = { ...dependenciasReales, fetch: (...a) => {
  if (++llamadas > 6) throw new Error('Tope de 6 llamadas alcanzado');
  return dependenciasReales.fetch(...a);
} };
const cfg = configDe(Number(companyId));
if (!cfg) throw new Error('Sucursal no configurada');
const cat = await leerCatalogo(deps);
const api = cat.ok ? cat.sucursales.find((s) => s.id === cfg.companyId) : undefined;
const r = await leerPedidos(cfg.companyId, fecha, fecha, deps);
const n = normalizar(r.registros, cfg, { desde: fecha, hasta: fecha });
const crudo = r.registros.find((p) => String(p.id) === pedidoId) as Record<string, unknown> | undefined;
const normal = n.pedidos.find((p) => String(p.id) === pedidoId);

const forma = (v: unknown) => (typeof v !== 'string' ? typeof v : v === '' ? 'vacío' : /^\d{10}$/.test(v) ? '10 dígitos'
  : /^[0-9a-f-]{36}$/i.test(v) ? 'UUID' : `otro (${v.length} car.)`);
const formas: Record<string, Record<string, number>> = {};
for (const p of r.registros) { const k = `${p.paymentMethod}|${p.paymentType}`; formas[k] ??= {}; const f = forma(p.refundId); formas[k][f] = (formas[k][f] ?? 0) + 1; }
const coincidenRefund = r.registros.filter((p) => p.refundId === ordenRappi).map((p) => p.id);

console.log(JSON.stringify({
  identidad: { companyId: cfg.companyId, lookerConfig: cfg.lookerStoreId, lookerApi: api?.lookerStoreId ?? null, nombreApi: api?.name ?? null },
  lectura: { fecha, completo: r.completo, totalDeclarado: r.totalDeclarado, registros: r.registros.length, paginas: r.paginas, llamadas, errores: r.errores },
  encontrado: !!crudo,
  pedido: crudo && {
    camposPresentes: Object.keys(crudo).sort(),
    id: crudo.id, companyId: crudo.companyId, lookerStoreId: crudo.lookerStoreId, createdAt: crudo.createdAt,
    fromSmartphone: crudo.fromSmartphone, paymentMethod: crudo.paymentMethod, paymentType: crudo.paymentType,
    grossAmount: crudo.grossAmount, netAmout: crudo.netAmout, discount: crudo.discount, percentageOfTransfer: crudo.percentageOfTransfer,
    refundIdForma: forma(crudo.refundId), refundIdIgualOrdenRappi: crudo.refundId === ordenRappi,
    items: crudo.items,
  },
  normalizado: normal && { origen: normal.origen, fecha: normal.fecha, hora: normal.hora, ventaCent: normal.ventaCent, cuadra: normal.cuadra,
    sumaLineasCent: normal.lineas.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0), 0) },
  pedidosConRefundIgualOrdenRappi: coincidenRefund,
  formaRefundIdPorPago: formas,
}, null, 1));
