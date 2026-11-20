import { fechaCorta } from './fechas';
import { pesos } from './formato';
import type { LineaOv, Medicion } from './ovSugerida';

/**
 * Correo quincenal del piloto de OV sugerida (spec §7). Todo texto que viene de datos (nombres, motivos) pasa por esc.
 * Sin datos de clientes del POS: solo cantidades y montos por SKU.
 */
export interface TiendaCorreo {
  nombre: string;
  estado: 'ok' | 'error';
  error: string | null;
  cadencia: number | null;
  cadenciaPorDefecto: boolean;
  ultimoPedido: string | null;
  cobertura: number | null;
  lineas: LineaOv[];
  medicion: Medicion | null;
  inactivos: { sku: string; nombre: string | null }[];
  sinMapeo: string[];
  avisos: string[];
}

const ESC: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
export const esc = (s: unknown) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

const fechaLarga = (iso: string) => `${fechaCorta(iso)} ${iso.slice(0, 4)}`;
const pct = (x: number | null) => (x == null ? '—' : `${Math.round(x * 100)} %`);
const conSigno = (n: number) => `${n > 0 ? '+' : ''}${n}`;
const TABLA = 'style="border-collapse:collapse;margin:8px 0"';
const TH = 'style="padding:4px 8px;text-align:left;background:#f3f4f6;border-bottom:1px solid #d1d5db"';
const TD = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb"';
const TDN = 'style="padding:4px 8px;border-bottom:1px solid #e5e7eb;text-align:right"';
const celdas = (xs: string[], estilo = TD) => xs.map((x) => `<td ${estilo}>${x}</td>`).join('');
const encabezado = (xs: string[]) => `<tr>${xs.map((x) => `<th ${TH}>${x}</th>`).join('')}</tr>`;

export const asuntoOvs = (semana: string) =>
  `Orden de venta sugerida (piloto) — semana del ${fechaLarga(semana)}`;

function tablaSugerido(lineas: LineaOv[]): string {
  const filas = lineas
    .filter((l) => l.sugerido > 0)
    .sort((x, y) => (y.monto ?? 0) - (x.monto ?? 0) || x.sku.localeCompare(y.sku));
  if (!filas.length) return '<p>En estos 14 días no hay nada que sugerir.</p>';
  const total = filas.reduce((s, l) => s + (l.monto ?? 0), 0);
  const sinCosto = filas.filter((l) => l.monto == null).length;
  const cuerpo = filas
    .map(
      (l) =>
        `<tr>${celdas([esc(l.sku), esc(l.nombre ?? '')])}${celdas([String(l.sugerido)], TDN)}${celdas([
          l.origen,
        ])}${celdas([l.k == null ? '—' : l.k.toFixed(2), l.monto == null ? 'sin costo' : esc(pesos(l.monto))], TDN)}</tr>`,
    )
    .join('');
  return (
    `<table ${TABLA}><thead>${encabezado(['SKU', 'Producto', 'Sugerido (paquetes)', 'Origen', 'k', 'Monto aprox.'])}</thead>` +
    `<tbody>${cuerpo}</tbody><tfoot><tr><td ${TD} colspan="5"><strong>Total</strong></td><td ${TDN}><strong>${esc(
      pesos(total),
    )}</strong></td></tr></tfoot></table>` +
    (sinCosto ? `<p>${sinCosto} sin costo en el catálogo (no suman al total).</p>` : '')
  );
}

function tablaMedicion(m: Medicion | null): string {
  if (!m)
    return '<p>Primera corrida del piloto para esta tienda: todavía no hay sugerencia anterior con qué comparar.</p>';
  const resumen = `<p>En la corrida anterior (${fechaLarga(m.desde)}) sugerimos ${esc(pesos(m.montoSugerido))}; desde entonces pidió ${esc(
    pesos(m.montoPedido),
  )}.</p>`;
  if (!m.filas.length) return resumen;
  const cuerpo = m.filas
    .map(
      (f) =>
        `<tr>${celdas([esc(f.sku), esc(f.nombre ?? '')])}${celdas(
          [String(f.sugerido), String(f.pedido), conSigno(f.diferencia)],
          TDN,
        )}</tr>`,
    )
    .join('');
  return (
    resumen +
    `<table ${TABLA}><thead>${encabezado(['SKU', 'Producto', 'Sugerimos', 'Pidió', 'Diferencia'])}</thead><tbody>${cuerpo}</tbody></table>`
  );
}

function avisos(t: TiendaCorreo): string {
  const xs: string[] = [];
  if (t.inactivos.length)
    xs.push(
      `Inactivos en el catálogo que la receta pide: ${t.inactivos
        .map((i) => `${esc(i.sku)} (${esc(i.nombre ?? 'sin nombre')})`)
        .join(', ')}`,
    );
  if (t.sinMapeo.length) xs.push(`Insumos de receta sin SKU (no entran): ${t.sinMapeo.map(esc).join(', ')}`);
  if (t.cadenciaPorDefecto)
    xs.push('Menos de 2 pedidos de resurtido en 90 días: cadencia por omisión de 14 días.');
  xs.push(...t.avisos.map(esc));
  return xs.length ? `<h3>Avisos</h3><ul>${xs.map((x) => `<li>${x}</li>`).join('')}</ul>` : '';
}

function seccionTienda(t: TiendaCorreo): string {
  const titulo = `<h2 style="font-size:16px;margin:16px 0 4px">${esc(t.nombre)}</h2>`;
  if (t.estado === 'error')
    return `${titulo}<p style="color:#b91c1c">No se calculó esta semana: ${esc(t.error)}</p>`;
  const datos = `<p>Cadencia: ${t.cadencia} días · Último pedido: ${
    t.ultimoPedido ? fechaLarga(t.ultimoPedido) : 'sin pedidos en 90 días'
  } · Cobertura de recetas de sus ventas: ${pct(t.cobertura)}</p>`;
  return `${titulo}${datos}${tablaSugerido(t.lineas)}<h3>Medición</h3>${tablaMedicion(t.medicion)}${avisos(t)}`;
}

export function correoOvs(semana: string, tiendas: TiendaCorreo[]): { asunto: string; html: string } {
  const asunto = asuntoOvs(semana);
  const html =
    `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;color:#111827">` +
    `<h1 style="font-size:18px">${esc(asunto)}</h1>` +
    '<p>Piloto interno: sugerencia calculada con las ventas del POS de los últimos 28 días, las recetas y el historial ' +
    'de pedidos de cada tienda. No se envió nada al franquiciatario.</p>' +
    tiendas.map(seccionTienda).join('<hr>') +
    '</div>';
  return { asunto, html };
}
