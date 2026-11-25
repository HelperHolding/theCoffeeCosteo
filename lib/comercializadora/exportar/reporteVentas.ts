// lib/comercializadora/exportar/reporteVentas.ts
// El Reporte semanal completo como HTML autocontenido (spec descargas §4).
import { pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import type { Reporte } from '../../../supabase/functions/_shared/reporte/reporte.ts';
import type { Seccion } from '../../../supabase/functions/_shared/reporte/tipos.ts';
import type { Ventas } from '../../../supabase/functions/_shared/reporte/ventas.ts';
import type { Indicador, Origen, Surtido } from '../../../supabase/functions/_shared/reporte/surtido.ts';
import type { Apertura, Atencion, GrupoAtencion, Notas } from '../../../supabase/functions/_shared/reporte/atencion.ts';
import type { SaldoCliente, SaldosExternos, SaldosSucursales } from '../../../supabase/functions/_shared/reporte/saldos.ts';
import { finSemana } from '../../../supabase/functions/_shared/reporte/fechas.ts';
import { barrasApiladas, crudo, documento, esc, leyenda, nombreArchivo, seccion, tabla } from './html';

export const archivoVentas = (semana: string, ext: 'html' | 'pdf') => nombreArchivo(['reporte-ventas', semana], ext);

const pct = (x: number | null, d = 1) => (x == null ? '—' : `${(x * 100).toFixed(d)}%`);
const vari = (x: number | null) => (x == null ? '—' : `${x >= 0 ? '▲' : '▼'} ${Math.abs(x * 100).toFixed(1)}%`);
const rango = (l: string) => `${fechaCorta(l)} – ${fechaCorta(finSemana(l))}`;
const COLOR: Record<string, string> = { Ordinario: '#1b1b1b', 'Llenado de canal': '#8c5f36', Apertura: '#2f7a4f', 'Sin clasificar': '#9a958c' };
const ORIGEN: Record<Origen, string> = { stock: 'Error de surtido (falta de stock)', pickeo: 'Error de pickeo', paqueteria: 'Paquetería', otro: 'Sin clasificar' };

function o<T>(s: Seccion<T>, f: (d: T) => string): string {
  return s.ok ? f(s.datos) : `<p class="error">No se pudo leer esta sección: ${esc(s.error)}</p>`;
}
const tarjeta = (et: string, va: string, no = '', clase = '') =>
  `<div class="tarjeta"><div class="et">${esc(et)}</div><div class="va ${clase}">${esc(va)}</div><div class="no">${esc(no)}</div></div>`;
const meta = (i: Indicador, signo: string) => `Meta: ${signo}${i.meta}%`;
const clase = (i: Indicador) => (i.cumple == null ? '' : i.cumple ? 'ok' : 'mal');

function ventas(v: Ventas): string {
  const grafica = barrasApiladas(v.semanas.map((s) => ({
    etiqueta: fechaCorta(s.lunes), total: pesos(s.total),
    partes: Object.entries(s.porTipo).map(([nombre, valor]) => ({ nombre, valor, color: COLOR[nombre] ?? '#9a958c' })),
  })));
  return `<div class="tarjetas">${tarjeta('Ventas con IVA', pesos(v.total), `~${pesos(v.sinIva)} sin IVA`)}${tarjeta('Pedidos facturados', String(v.pedidos))}`
    + `${tarjeta('Vs semana anterior', vari(v.vsAnterior), pesos(v.difAnterior))}${tarjeta('Vs promedio 5 semanas', vari(v.vsPromedio), pesos(v.promedio))}</div>`
    + tabla(['#', 'Cliente', 'Sucursales', 'Total'], v.top.map((t, i) => [String(i + 1).padStart(2, '0'), t.nombre, t.sucursales.join(', '), pesos(t.total)]), { derecha: [3] })
    + `<p class="peq">Últimas 5 semanas, con IVA, por tipo de envío.</p>${grafica}`
    + leyenda(Object.entries(COLOR).map(([nombre, color]) => ({ nombre, color })))
    + `<p class="peq">Solo ordinario vs semana anterior: ${esc(pesos(v.difAnteriorOrdinario))} ${esc(vari(v.vsAnteriorOrdinario))}</p>`;
}

function surtido(s: Surtido): string {
  const fuera = s.envio.fuera.map((f) => `${f.sucursal} ${f.ov} (${fechaCorta(f.fecha)} → ${fechaCorta(f.envio)}, ${f.dias} días)`);
  return `<p>${s.enviados} pedidos enviados en la semana.</p><div class="tarjetas">`
    + tarjeta('Fill rate', pct(s.fill.valor), `${meta(s.fill, '≥')} · ${s.conFaltante} con faltante`, clase(s.fill))
    + tarjeta('Faltante por stock', pct(s.stock.valor), `${meta(s.stock, '≤')} · ${s.casos.stock} casos`, clase(s.stock))
    + tarjeta('Precisión de pickeo', pct(s.pickeo.valor), `${meta(s.pickeo, '≥')} · ${s.casos.pickeo} casos`, clase(s.pickeo))
    + tarjeta('Calidad física', pct(s.fisica.valor), `${meta(s.fisica, '≤')} · ${s.casos.paqueteria} casos`, clase(s.fisica))
    + `</div><div class="tarjetas">${tarjeta('Envío en tiempo', pct(s.envio.valor), `${s.envio.enMeta} de ${s.envio.universo} · mismo día ${s.envio.buckets[0]} · 1 día ${s.envio.buckets[1]} · 2 días ${s.envio.buckets[2]} · más ${s.envio.buckets[3]}`, clase(s.envio))}</div>`
    + (fuera.length ? `<p class="peq mal">Fuera de meta: ${esc(fuera.join('; '))}</p>` : '')
    + `<p class="peq">Incidencias por origen: ${s.incidenciasTotal} (${pct(s.enviados ? s.incidenciasTotal / s.enviados : null)} de los pedidos).</p>`
    + tabla(['OV', 'Sucursal', 'Origen', 'Estatus'], s.incidencias.map((f) => [f.ov, f.sucursal, ORIGEN[f.origen], f.resolucion || 'Abierta']));
}

function grupo(titulo: string, g: GrupoAtencion, conCliente: boolean): string {
  const filas = g.semanas.flatMap((s) => s.casos.map((c) => [
    rango(s.lunes), c.ov, conCliente && c.sucursal ? `${c.sucursal} (${c.cliente})` : c.sucursal || c.cliente,
    `${c.tipo} · ${c.resolucion}`, crudo(`<span class="desc">${esc(c.descripcion)}</span>`),
  ]));
  return `<h3>${esc(titulo)} · ${g.abiertas} abiertas · ${g.resueltasSemana} resueltas esta semana</h3>`
    + (filas.length ? tabla(['Semana', 'OV', 'Sucursal', 'Tipo · estatus', 'Descripción'], filas) : '<p class="peq">Sin incidencias abiertas.</p>');
}
const atencion = (a: Atencion) => grupo('Sucursales propias', a.propias, false) + grupo('Clientes externos', a.externos, true);

const notas = (n: Notas) => n.filas.length
  ? tabla(['Folio', 'Cliente', 'Sucursal', 'Descripción', 'Total'], n.filas.map((f) => [f.numero, f.cliente, f.sucursal, f.descripcion, pesos(f.total)]), { derecha: [4], total: ['Total NC', '', '', '', pesos(n.total)] })
  : '<p class="peq">Sin notas de crédito esta semana.</p>';

const sucursales = (s: SaldosSucursales, excluidas: string[]) =>
  `<p>${esc(pesos(s.total))} en ${s.facturas} facturas abiertas${excluidas.length ? ` · excluye ${esc(excluidas.join(', '))}` : ''}.</p>`
  + tabla(['Sucursal', 'Dentro de crédito', `Fuera de crédito ${s.anio}`, `Antes de ${s.anio}`],
    s.filas.map((f) => [f.sucursal, pesos(f.dentro), pesos(f.fueraAnio), pesos(f.anteriores)]), { derecha: [1, 2, 3], total: ['Total', pesos(s.dentro), pesos(s.fueraAnio), pesos(s.anteriores)] });

const filasCliente = (fs: SaldoCliente[]) => fs.map((f) => [
  f.nota ? `${f.cliente} — ${f.nota}` : f.cliente,
  f.llenado > 0 ? (Math.abs(f.llenado - f.saldo) < 0.01 ? '100% llenado canal' : `Llenado canal ${pesos(f.llenado)}`) : '',
  fechaCorta(f.masAntigua), f.dias, pesos(f.saldo),
]);
function externos(e: SaldosExternos & { anterior: number | null }, corte: string): string {
  const enc = ['Cliente', 'Llenado de canal', 'Más antigua', 'Días', 'Saldo'];
  return `<p>Saldos de clientes externos: <b>${esc(pesos(e.total))}</b>${e.anterior != null ? ` (era ${esc(pesos(e.anterior))} la semana pasada)` : ''}, de los cuales ${esc(pesos(e.subtotalCreditos))} son créditos activos. Saldo al ${esc(fechaCorta(corte))}.</p>`
    + tabla(enc, filasCliente(e.filas), { derecha: [3, 4], total: ['Subtotal sin créditos activos', '', '', '', pesos(e.subtotal)] })
    + `<h3>Créditos activos</h3>` + tabla(enc, filasCliente(e.creditos), { derecha: [3, 4], total: ['Subtotal créditos activos', '', '', '', pesos(e.subtotalCreditos)] })
    + `<h3>Deuda interna · mismo corporativo</h3>` + tabla(enc, filasCliente(e.interna), { derecha: [3, 4], total: ['Total deuda interna', '', '', '', pesos(e.totalInterna)] })
    + (e.excluidos.length ? `<p class="peq">Excluye ${esc(e.excluidos.map((x) => `${x.cliente} (${pesos(x.saldo)})`).join(', '))}.</p>` : '');
}

const aperturas = (a: Apertura[]) => a.length
  ? tabla(['Sucursal', 'Franquiciatario', 'OV', 'Pedido', 'Estatus'], a.map((x) => [x.sucursal, x.cliente, x.ov, fechaCorta(x.fecha), x.envio ? `Enviado ${fechaCorta(x.envio)}` : 'Por enviar']))
  : '<p class="peq">Sin aperturas en curso.</p>';

export function htmlReporteVentas(r: Reporte, opc: { excluidasSucursales: string[]; aviso: string | null }): string {
  const leido = new Date(r.leidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' });
  const avisos = (opc.aviso ? `<p class="aviso">${esc(opc.aviso)}</p>` : '')
    + (r.sinClasificar.length ? `<p class="aviso">Valores de Zoho sin clasificar (se cuentan aparte): ${esc(r.sinClasificar.join('; '))}.</p>` : '');
  const cuerpo = avisos
    + seccion('01', 'Ventas de la semana', o(r.ventas, ventas))
    + seccion('02', 'Calidad de surtido', o(r.surtido, surtido))
    + `<div class="salto"></div>` + seccion('03', 'Atención al cliente · incidencias abiertas', o(r.atencion, atencion))
    + seccion('04', 'Notas de crédito', o(r.notas, notas))
    + seccion('05', 'Saldos de sucursales propias', o(r.sucursales, (s) => sucursales(s, opc.excluidasSucursales)))
    + seccion('06', 'Saldos pendientes · clientes externos', o(r.externos, (e) => externos(e, r.corte)))
    + seccion('07', 'Aperturas · seguimiento', o(r.aperturas, aperturas));
  return documento({
    titulo: 'Reporte semanal · Comercializadora',
    subtitulo: `Ventas y supply chain · ${rango(r.lunes)}`,
    meta: [`Leído de Zoho Books el ${leido}`],
    cuerpo,
    pie: 'Fuente: Zoho Books (facturas, órdenes de venta, paquetes, notas de crédito y saldos). Las incidencias se capturan días después de la entrega; estas cifras pueden moverse.',
  });
}
