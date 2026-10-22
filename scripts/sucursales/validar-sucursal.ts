import { leerEnvLocal } from '../zoho/cliente';
import { leerCatalogo, leerPedidos, dependenciasReales } from '../../lib/sucursales/proveedor';
import { normalizar } from '../../lib/sucursales/normalizar';
import { conciliar, origenes, pagos, porHora, resumen } from '../../lib/sucursales/metricas';
import type { ModoTiempo } from '../../lib/sucursales/tiempo';

/**
 * E2 · Validación de una sucursal candidata antes de habilitarla (solo GET, solo agregados).
 * Lee 1 día cerrado con el MISMO pipeline del portal y reporta:
 * identidad, cobertura, horario de pedidos, cuadre gross = líneas + customs, pedidos fuera de ventana,
 * mezcla de origen y pago, y campos/valores no vistos en la piloto (p. ej. otros canales).
 *
 *   npx tsx --conditions=react-server scripts/sucursales/validar-sucursal.ts \
 *     --company 613 --jestor 482 --zona America/Tijuana --fecha 2026-10-21 [--modo local-etiquetada-z]
 */
const a = Object.fromEntries(
  process.argv
    .slice(2)
    .map((x, i, arr) => (x.startsWith('--') ? [x.slice(2), arr[i + 1]] : null))
    .filter(Boolean) as [string, string][],
);
const companyId = Number(a.company);
const fecha = a.fecha;
const zona = a.zona;
const modo = (a.modo ?? 'local-etiquetada-z') as ModoTiempo;
if (!companyId || !fecha || !zona) throw new Error('Faltan --company, --fecha o --zona');
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

const catalogo = await leerCatalogo(dependenciasReales);
const entrada = catalogo.ok ? catalogo.sucursales.find((s) => s.id === companyId) : undefined;
const cruda = await leerPedidos(companyId, fecha, fecha, dependenciasReales);
const n = normalizar(cruda.registros, { companyId, modoTiempo: modo, zona }, { desde: fecha, hasta: fecha });
const ps = n.pedidos;
const horas = porHora(ps).filter((h) => h.pedidos > 0);
const conocidos = {
  pedido: new Set([
    'id',
    'companyId',
    'lookerStoreId',
    'fromSmartphone',
    'netAmout',
    'grossAmount',
    'percentageOfTransfer',
    'refundId',
    'discount',
    'paymentMethod',
    'paymentType',
    'items',
    'createdAt',
  ]),
  metodos: new Set(['CARTAO', 'DINHEIRO', 'VIRTUAL_WALLET', 'WALLET_BALANCE']),
  tipos: new Set(['CONTACTLESS_EMV', 'EMV', 'CONTINGENCY', 'WALLET']),
};
const camposNuevos = [...new Set(cruda.registros.flatMap((r) => Object.keys(r)))].filter(
  (k) => !conocidos.pedido.has(k),
);
const metodosNuevos = [...new Set(cruda.registros.map((r) => String(r.paymentMethod)))].filter(
  (m) => !conocidos.metodos.has(m),
);
const tiposNuevos = [...new Set(cruda.registros.map((r) => String(r.paymentType)))].filter(
  (m) => !conocidos.tipos.has(m),
);
const r = resumen(ps);
const c = conciliar(ps);
const primera = horas[0]?.hora ?? null;
const ultima = horas.at(-1)?.hora ?? null;
const alertas = [
  !entrada && 'company_id no está en /company/list/all',
  a.jestor && entrada && entrada.lookerStoreId !== Number(a.jestor) && 'lookerStoreId ≠ Jestor del CRM',
  !cruda.completo && `lectura incompleta: ${cruda.errores.map((e) => e.codigo).join(', ')}`,
  n.invalidos && `${n.invalidos} registros inválidos`,
  n.fueraDeVentana && `${n.fueraDeVentana} pedidos fuera del día: revisar zona/modo`,
  primera !== null && (primera < 6 || primera > 9) && `primer pedido a las ${primera}h (atípico)`,
  ultima !== null && (ultima < 18 || ultima > 23) && `último pedido a las ${ultima}h (atípico)`,
  c.diferenciaCent !== 0 && `venta ≠ productos por ${c.diferenciaCent} centavos`,
  camposNuevos.length && `campos no vistos en la piloto: ${camposNuevos.join(', ')}`,
  metodosNuevos.length && `métodos de pago no vistos: ${metodosNuevos.join(', ')}`,
  tiposNuevos.length && `tipos de pago no vistos: ${tiposNuevos.join(', ')}`,
].filter(Boolean);

console.log(
  JSON.stringify(
    {
      ejecutado: new Date().toISOString(),
      companyId,
      api: entrada ?? null,
      fecha,
      zona,
      modo,
      lectura: { completo: cruda.completo, totalDeclarado: cruda.totalDeclarado, paginas: cruda.paginas },
      pedidos: r.pedidos,
      ventaCent: r.ventaCent,
      ticketCent: r.ticketCent,
      descuentoCent: r.descuentoCent,
      horario: {
        primerPedidoHora: primera,
        ultimoPedidoHora: ultima,
        porHora: horas.map((h) => [h.hora, h.pedidos]),
      },
      origenes: origenes(ps).map((o) => [o.origen, o.pedidos]),
      pagos: pagos(ps).map((p) => [p.metodo, p.pedidos]),
      conciliacion: c,
      alertas,
      veredicto: alertas.length ? 'REVISAR' : 'APTA',
    },
    null,
    2,
  ),
);
