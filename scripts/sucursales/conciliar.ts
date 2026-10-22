import { leerEnvLocal } from '../zoho/cliente';
import { configDe } from '../../lib/sucursales/config';
import { construirVivo, leerVentana } from '../../lib/sucursales/datos';
import { conciliar, productos, resumen } from '../../lib/sucursales/metricas';

/**
 * Conciliación con datos reales (solo GET, solo agregados en la salida; el token no se imprime).
 * Compara el pipeline del portal (proveedor → normalizar → métricas) contra una extracción
 * independiente que suma grossAmount directamente del JSON crudo.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/conciliar.ts 612 2026-10-21 [--vivo]
 */
const [companyIdTxt, fecha] = process.argv.slice(2);
const cfg = configDe(Number(companyIdTxt));
if (!cfg || !fecha) throw new Error('Uso: conciliar.ts <companyId configurado> <AAAA-MM-DD> [--vivo]');
const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

// 1) Extracción independiente: perPage 100, sin el cliente del portal.
const vistos = new Map<number, { grossAmount: number }>();
let total = -1;
for (let page = 1; page <= 30; page++) {
  const q = new URLSearchParams({ dateStart: fecha, dateEnd: fecha, perPage: '100', page: String(page) });
  const res = await fetch(`https://api.thecoffee.jp/order/company/${cfg.companyId}?${q}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Extracción independiente: HTTP ${res.status}`);
  const env = (await res.json()) as {
    totalItems: number;
    totalPages: number;
    data: { id: number; grossAmount: number }[];
  };
  total = env.totalItems;
  for (const p of env.data) vistos.set(p.id, p);
  if (page >= env.totalPages) break;
}
const independiente = [...vistos.values()].reduce((s, p) => s + Math.round(p.grossAmount * 100), 0);

// 2) Pipeline del portal.
const l = await leerVentana(cfg, fecha, fecha);
const r = resumen(l.pedidos);
const c = conciliar(l.pedidos);
const sumaProductos = productos(l.pedidos).reduce((s, p) => s + p.importeCent, 0);

console.log(
  JSON.stringify(
    {
      ejecutado: new Date().toISOString(),
      companyId: cfg.companyId,
      fecha,
      independiente: { totalItems: total, unicos: vistos.size, ventaCent: independiente },
      portal: {
        estado: l.estado,
        avisos: l.avisos,
        totalDeclarado: l.totalDeclarado,
        pedidos: r.pedidos,
        ventaCent: r.ventaCent,
        descuentoCent: r.descuentoCent,
        ticketCent: r.ticketCent,
        sumaProductosCent: sumaProductos,
        diferenciaVentaVsProductosCent: c.diferenciaCent,
        pedidosQueNoCuadran: c.pedidosNoCuadran,
      },
      diferenciaPortalVsIndependienteCent: r.ventaCent - independiente,
      pedidosPortalVsIndependiente: r.pedidos - vistos.size,
    },
    null,
    2,
  ),
);

if (process.argv.includes('--vivo')) {
  const v = await construirVivo(cfg, 'todos');
  console.log(
    JSON.stringify(
      {
        vivo: {
          corte: v.corte,
          base: v.base,
          lecturas: { hoy: v.lecturas.hoy.estado, base: v.lecturas.base.estado },
          kpis: v.kpis,
          kpisBase: v.kpisBase,
          comparativo: v.comparativo,
          ultimoPedido: v.ultimoPedido,
          posterioresAlCorte: v.posterioresAlCorte,
          ritmo: v.ritmo,
          conciliacion: v.conciliacion,
          insights: v.insights.map((i) => i.texto),
          topProductos: v.productosTop.map((p) => p.nombre),
          pagos: v.pagos.map((p) => `${p.etiqueta} ${p.pedidos}`),
        },
      },
      null,
      2,
    ),
  );
}
