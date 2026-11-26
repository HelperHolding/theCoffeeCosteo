// lib/comercializadora/exportar/reporteCompras.ts
// El tablero de compras con los filtros elegidos como HTML autocontenido (spec compras §4).
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { tarjetasIndicadores } from '@/lib/comercializadora/compras/indicadores';
import { textoFiltros } from '@/lib/comercializadora/compras/filtros';
import { COLORES_GRAFICA, graficaCompras } from '@/lib/comercializadora/compras/grafica';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import type { TableroCompras } from '../../../supabase/functions/_shared/compras/tablero.ts';
import { documento, esc, leyenda, nombreArchivo, seccion, tabla } from './html';

export const archivoCompras = (t: TableroCompras, ext: 'html' | 'pdf') =>
  nombreArchivo(['compras', t.periodo.clave, t.filtros.categoria ?? 'todas', t.filtros.proveedor ?? '', t.filtros.comprador ?? ''].filter(Boolean), ext);

const hora = (iso: string) => new Date(iso).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }).replace('.', '');
const tarjeta = (et: string, va: string, no = '', clase = '') =>
  `<div class="tarjeta"><div class="et">${esc(et)}</div><div class="va ${clase}">${esc(va)}</div><div class="no">${esc(no)}</div></div>`;
const fecha = (iso: string | null) => (iso ? fechaCorta(iso) : '—');

function plan(p: PlanCompra, t: TableroCompras): string {
  const porLlegar = t.porLlegar.reduce((a, o) => a + o.monto, 0);
  return `<div class="tarjetas">${tarjeta('Urgentes (menos de 5 días)', String(p.urgentes.n), pesos(p.urgentes.monto), 'mal')}`
    + `${tarjeta('Pronto (5 a 10 días)', String(p.pronto.n), pesos(p.pronto.monto))}${tarjeta('Insumos por llegar', String(t.porLlegar.length), pesos(porLlegar))}</div>`
    + (p.filas.length === 0 ? '<p>El plan no pide nada esta semana ni la próxima con estos filtros.</p>' : tabla(
      ['Urgencia', 'Artículo', 'SKU', 'Proveedor', 'Decisión', 'Inventario', 'Días', 'Pedir esta', 'Costo esta', 'Pedir próxima', 'Costo próxima', 'Llega'],
      p.filas.map((f) => [
        f.urgencia, f.nombre, f.sku, f.proveedor, f.decision,
        f.faltaSurtir > 0 ? `${numero(f.inventario)} (faltan ${numero(f.faltaSurtir)})` : numero(f.inventario),
        f.dias == null ? '—' : numero(Math.round(f.dias * 10) / 10),
        numero(f.pedir[0]), pesos(f.costo[0]), numero(f.pedir[1]), pesos(f.costo[1]),
        f.llega ? `${fechaCorta(f.llega)}${f.llegaVencida ? ' (vencida)' : ''}` : '—',
      ]),
      { derecha: [5, 6, 7, 8, 9, 10] },
    ));
}

export function htmlTableroCompras(t: TableroCompras, o: { plan: PlanCompra | null; errorPlan: string | null; leidoEn: string; ultimaSync: string | null }): string {
  const ind = tarjetasIndicadores(t, o.plan ? o.plan.faltan : null)
    .map((x) => tarjeta(x.etiqueta, x.valor, x.nota, x.tono === 'ok' ? 'ok' : x.tono === 'pierde' ? 'mal' : '')).join('');
  const aviso = t.sinDetalle.length
    ? `<p class="aviso">Compras recibidas aproximadas: Zoho no dio el detalle de cada recepción de ${esc(t.sinDetalle.join(', '))}. Lo recibido de esas OCs se cuenta completo en su recepción más reciente, aunque haya llegado en varias semanas.</p>`
    : '';
  const evolucion = '<p class="peq">Con IVA, sin DODO Pizza ni Compras The Coffee. Presupuesto = 50% de la venta.</p>'
    + leyenda([{ nombre: 'Venta', color: COLORES_GRAFICA.venta }, { nombre: 'Compras recibidas', color: COLORES_GRAFICA.compras }, { nombre: 'Presupuesto (50%)', color: COLORES_GRAFICA.presupuesto }])
    + graficaCompras(t.serie);
  const proveedores = tabla(
    ['Proveedor', 'OCs', 'Monto', 'Registro', 'A tiempo', 'Atrasadas', 'Pendientes (vencidas / en plazo)', 'Lead time'],
    t.proveedores.map((p) => [p.proveedor, String(p.ocs), pesos(p.monto), String(p.registro), String(p.aTiempo), String(p.atrasadas), `${p.pendVencidas} / ${p.pendEnPlazo}`, p.lead == null ? '—' : `${numero(p.lead)} días`]),
    { derecha: [1, 2, 3, 4, 5, 6, 7] },
  );
  const porLlegar = tabla(
    ['Folio', 'Proveedor', 'Arribo', 'Estado', 'Monto', 'Artículos'],
    t.porLlegar.map((x) => [x.folio, x.proveedor, fecha(x.arribo), x.estado, pesos(x.monto), x.articulos.map((a) => `${a.sku} · ${a.nombre} ×${numero(a.pendiente)}`).join('; ')]),
    { derecha: [4] },
  );
  const cuerpo = aviso
    + seccion('01', `Indicadores · ${t.periodo.etiqueta}`, `<div class="tarjetas">${ind}</div>`)
    + seccion('02', 'Evolución', evolucion)
    + '<div class="salto"></div>'
    + seccion('03', 'Plan de compra · Plan de abastos', o.plan ? plan(o.plan, t) : `<p class="error">No se pudo calcular el plan de compra: ${esc(o.errorPlan ?? '')}</p>`)
    + '<div class="salto"></div>'
    + seccion('04', 'OCs por proveedor del periodo', t.proveedores.length ? proveedores : '<p>Sin OCs emitidas en el periodo.</p>')
    + seccion('05', 'OCs por llegar', t.porLlegar.length ? porLlegar : '<p>No hay OCs por llegar.</p>');
  return documento({
    titulo: 'Compras · Comercializadora',
    subtitulo: 'Venta, compras recibidas y entregas de proveedores',
    meta: [
      `Filtros: ${textoFiltros(t.filtros, t.periodo.etiqueta)}`,
      `Leído de Supabase el ${hora(o.leidoEn)}${o.ultimaSync ? ` · sincronizado con Zoho el ${hora(o.ultimaSync)}` : ''}`,
    ],
    cuerpo,
    pie: 'Fuente: Zoho Books (OCs, recepciones y facturas) sincronizado en Supabase; plan de compra del Plan de abastos. Compras = mercancía de órdenes de compra recibida, no pagos. Montos con IVA. Los meses suman las semanas que empiezan en ese mes.',
  });
}
