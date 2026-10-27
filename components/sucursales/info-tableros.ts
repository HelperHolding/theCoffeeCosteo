import type {
  RespuestaPedidos,
  RespuestaProductos,
  RespuestaTendencias,
  RespuestaVivo,
} from '@/lib/sucursales/contratos';
import { etiquetaOrigen, type Resumen } from '@/lib/sucursales/metricas';
import type { CosteoResumen } from '@/lib/sucursales/costeo';
import type { InfoTablero } from '@/components/portal/con-info';
import { dinero, numero, porcentaje, variacionTexto } from './formato';

// Textos de los pop-ups de los tableros de Sucursales: qué mide cada tarjeta, cifras de contexto
// calculadas con los mismos datos que ya muestra la pantalla, y cómo se calcula.

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];
const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
const mayor = <T>(xs: T[], valor: (x: T) => number | null) =>
  xs.reduce<T | null>((a, x) => {
    const v = valor(x);
    return v !== null && (a === null || v > valor(a)!) ? x : a;
  }, null);
const menor = <T>(xs: T[], valor: (x: T) => number | null) =>
  mayor(xs, (x) => (valor(x) === null ? null : -valor(x)!));

export function infoTendencias(
  d: RespuestaTendencias,
  ss: (RespuestaTendencias['semanas'][number] & { etiqueta: string })[],
): Record<string, InfoTablero> {
  const m = d.sucursal.moneda;
  const n = d.semanasCompletas;
  const completas = ss.filter((s) => s.kpis);
  const mejor = mayor(completas, (s) => s.kpis!.ventaCent);
  const peor = menor(completas, (s) => s.kpis!.ventaCent);
  const masPedidos = mayor(completas, (s) => s.kpis!.pedidos);
  const ticketAlto = mayor(completas, (s) => s.kpis!.ticketCent);
  const ticketBajo = menor(completas, (s) => s.kpis!.ticketCent);
  const ultima = ss.at(-1);
  const anterior = ss.at(-2);
  const primera = completas[0];
  const cambio =
    primera && ultima?.kpis && primera !== ultima && primera.kpis!.ventaCent > 0
      ? (ultima.kpis.ventaCent - primera.kpis!.ventaCent) / primera.kpis!.ventaCent
      : null;
  const celdas = d.mapa.flatMap((fila, dia) => fila.map((v, hora) => ({ dia, hora, v })));
  const pico = mayor(celdas, (c) => c.v);
  const porDia = d.mapa.map((fila, dia) => ({ dia, total: fila.reduce<number>((s, v) => s + (v ?? 0), 0) }));
  const diaFuerte = mayor(porDia, (x) => x.total);
  const diaFlojo = menor(porDia, (x) => x.total);
  const pagoUltima = ultima ? mayor(ultima.pagos, (p) => p.participacion) : null;
  const fuente = `Semanas de lunes a domingo, hora local ${d.sucursal.zona}. Solo cuentan las semanas con lectura completa.`;
  const semana = (s: { etiqueta: string; kpis: Resumen | null } | null, valor: (k: Resumen) => string) =>
    s?.kpis ? `${s.etiqueta} · ${valor(s.kpis)}` : '—';
  return {
    venta: {
      titulo: `Venta de ${n} semanas`,
      mide: 'Todo lo cobrado en las semanas completas del periodo elegido.',
      cifras: [
        { etiqueta: 'Total', valor: dinero(d.totales.ventaCent, m) },
        { etiqueta: 'Promedio semanal', valor: dinero(Math.round(d.totales.ventaCent / n), m) },
        { etiqueta: 'Mejor semana', valor: semana(mejor, (k) => dinero(k.ventaCent, m, false)) },
        { etiqueta: 'Semana más baja', valor: semana(peor, (k) => dinero(k.ventaCent, m, false)) },
      ],
      calculo: fuente,
    },
    pedidos: {
      titulo: 'Pedidos',
      mide: 'Cuántos pedidos se cobraron en el periodo y cuántos salen por día.',
      cifras: [
        { etiqueta: 'Total', valor: numero(d.totales.pedidos) },
        { etiqueta: 'Por día', valor: numero(Math.round(d.totales.pedidos / (n * 7))) },
        { etiqueta: 'Semana con más pedidos', valor: semana(masPedidos, (k) => numero(k.pedidos)) },
      ],
      calculo: fuente,
    },
    ticket: {
      titulo: 'Ticket promedio',
      mide: 'Lo que deja en promedio cada pedido en el periodo.',
      cifras: [
        { etiqueta: 'Periodo', valor: d.totales.ticketCent === null ? '—' : dinero(d.totales.ticketCent, m) },
        { etiqueta: 'Semana más alta', valor: semana(ticketAlto, (k) => dinero(k.ticketCent, m)) },
        { etiqueta: 'Semana más baja', valor: semana(ticketBajo, (k) => dinero(k.ticketCent, m)) },
        { etiqueta: 'Descuento sobre precio de lista', valor: porcentaje(d.totales.tasaDescuento) },
      ],
      calculo: `Venta cobrada ÷ pedidos. ${fuente}`,
    },
    ultima: {
      titulo: 'Última semana',
      mide: 'La venta de la semana más reciente contra la semana anterior.',
      cifras: [
        {
          etiqueta: ultima?.etiqueta ?? 'Última',
          valor: ultima?.kpis ? dinero(ultima.kpis.ventaCent, m) : 'Lectura incompleta',
        },
        {
          etiqueta: anterior?.etiqueta ?? 'Anterior',
          valor: anterior?.kpis ? dinero(anterior.kpis.ventaCent, m) : '—',
        },
        { etiqueta: 'Variación', valor: variacionTexto(ultima?.variacionVenta ?? null) },
        { etiqueta: 'Pedidos', valor: ultima?.kpis ? numero(ultima.kpis.pedidos) : '—' },
      ],
      calculo: fuente,
    },
    ventaSemana: {
      titulo: 'Venta por semana',
      mide: 'Cómo se mueve la venta de una semana a otra.',
      cifras: [
        { etiqueta: 'Mejor semana', valor: semana(mejor, (k) => dinero(k.ventaCent, m, false)) },
        { etiqueta: 'Semana más baja', valor: semana(peor, (k) => dinero(k.ventaCent, m, false)) },
        { etiqueta: 'Primera contra última', valor: variacionTexto(cambio) },
      ],
      calculo: `Una semana rayada tuvo lectura incompleta y no cuenta en los totales. ${fuente}`,
    },
    ticketSemana: {
      titulo: 'Ticket promedio por semana',
      mide: 'Si cada pedido deja más o menos dinero con el paso de las semanas.',
      cifras: [
        { etiqueta: 'Semana más alta', valor: semana(ticketAlto, (k) => dinero(k.ticketCent, m)) },
        { etiqueta: 'Semana más baja', valor: semana(ticketBajo, (k) => dinero(k.ticketCent, m)) },
      ],
      calculo:
        'Venta cobrada ÷ pedidos de cada semana. Si sube con los mismos pedidos, la gente pide más o más caro.',
    },
    mapa: {
      titulo: '¿Cuándo se vende?',
      mide: 'Los días y horas con más pedidos. Sirve para acomodar turnos, producción y promociones.',
      cifras: [
        {
          etiqueta: 'Hora más fuerte',
          valor: pico?.v ? `${DIAS[pico.dia]} ${hh(pico.hora)} · ${pico.v.toFixed(1)} pedidos` : '—',
        },
        {
          etiqueta: 'Día más fuerte',
          valor: diaFuerte?.total ? `${DIAS[diaFuerte.dia]} · ${diaFuerte.total.toFixed(0)} pedidos` : '—',
        },
        {
          etiqueta: 'Día más flojo',
          valor: diaFlojo ? `${DIAS[diaFlojo.dia]} · ${diaFlojo.total.toFixed(0)} pedidos` : '—',
        },
      ],
      calculo: `Promedio de pedidos por día de la semana y hora en ${n} semanas completas.`,
    },
    pagos: {
      titulo: 'Formas de pago por semana',
      mide: 'Con qué se paga y si eso cambia de una semana a otra.',
      cifras: pagoUltima
        ? [
            {
              etiqueta: `Principal en ${ultima!.etiqueta}`,
              valor: `${pagoUltima.etiqueta} · ${porcentaje(pagoUltima.participacion)}`,
            },
          ]
        : [],
      calculo: 'Participación de cada forma de pago en la venta cobrada de cada semana.',
    },
    origen: {
      titulo: 'Origen por semana',
      mide: 'Cuánto de la venta llega por mostrador, por la App The Coffee y por Rappi.',
      cifras: (ultima?.origenes ?? []).map((o) => ({
        etiqueta: `${etiquetaOrigen[o.origen]} en ${ultima!.etiqueta}`,
        valor: porcentaje(o.participacion),
      })),
      calculo: 'Participación de cada origen en la venta cobrada de cada semana.',
    },
    detalle: {
      titulo: 'Detalle por semana',
      mide: 'Las cifras de cada semana en una tabla, para comparar o copiar.',
      cifras: [
        { etiqueta: 'Semanas completas', valor: `${n} de ${ss.length}` },
        { etiqueta: 'Descuento del periodo', valor: dinero(d.totales.descuentoCent, m) },
      ],
      calculo:
        'La variación de cada semana es contra la semana anterior; una semana incompleta no se compara.',
    },
  };
}

export function infoProductos(d: RespuestaProductos): Record<string, InfoTablero> {
  const m = d.sucursal.moneda;
  const total = d.productos.reduce((s, p) => s + p.importeCent, 0);
  const ordenados = [...d.productos].sort((a, b) => b.importeCent - a.importeCent);
  const top5 = ordenados.slice(0, 5).reduce((s, p) => s + p.importeCent, 0);
  const masVeces = mayor(d.personalizaciones, (c) => c.veces);
  const extra = d.personalizaciones.reduce((s, c) => s + c.importeCent, 0);
  return {
    productos: {
      titulo: 'Productos',
      mide: 'Qué productos dejan más dinero en el periodo y qué tanto depende la venta de unos pocos.',
      cifras: [
        { etiqueta: 'Productos vendidos', valor: numero(d.productos.length) },
        { etiqueta: 'Primer lugar', valor: ordenados[0]?.nombre ?? '—' },
        { etiqueta: 'Los 5 primeros', valor: total ? `${porcentaje(top5 / total)} de la venta` : '—' },
      ],
      calculo:
        'Importe atribuible = precio del producto + sus personalizaciones, contado una sola vez. Usa el buscador y el orden para encontrar uno.',
    },
    personalizaciones: {
      titulo: 'Personalizaciones',
      mide: 'Los extras que se piden (leches, shots, jarabes) y cuánto suman a la venta.',
      cifras: [
        {
          etiqueta: 'La más pedida',
          valor: masVeces ? `${masVeces.nombre} · ${numero(masVeces.veces)}` : '—',
        },
        { etiqueta: 'Importe adicional', valor: dinero(extra, m) },
        {
          etiqueta: 'Parte de la venta',
          valor: d.totales.ventaCent ? porcentaje(extra / d.totales.ventaCent) : '—',
        },
      ],
      calculo: 'Frecuencia e importe adicional cobrado de cada personalización; los tamaños no cuentan aquí.',
    },
  };
}

export function infoPedidos(d: RespuestaPedidos): InfoTablero {
  return {
    titulo: 'Pedidos',
    mide: 'Cada pedido del periodo con su hora, forma de pago e importe. Toca uno para ver qué llevaba.',
    cifras: [
      { etiqueta: 'Pedidos del periodo', valor: numero(d.total) },
      { etiqueta: 'Página', valor: `${d.pagina} de ${d.paginas}` },
      { etiqueta: 'Lectura', valor: d.lectura.estado === 'completa' ? 'Completa' : 'Parcial' },
    ],
    calculo:
      'Filtra por fechas, origen y forma de pago. Una lectura parcial puede dejar fuera pedidos: no la uses como cierre.',
  };
}

export function infoNetoRappi(kpis: Resumen, moneda: string, periodo: string): InfoTablero {
  const dif = kpis.netoCent === null ? null : kpis.ventaCent - kpis.netoCent;
  return {
    titulo: 'Cobrado y neto de Rappi',
    mide: 'Lo que Rappi cobró al cliente y el neto que reporta la API, tal cual.',
    cifras: [
      { etiqueta: `Pedidos (${periodo})`, valor: numero(kpis.pedidos) },
      {
        etiqueta: 'Ticket promedio',
        valor: kpis.ticketCent === null ? '—' : dinero(kpis.ticketCent, moneda),
      },
      {
        etiqueta: 'Diferencia por pedido',
        valor: dif === null || !kpis.pedidos ? '—' : dinero(Math.round(dif / kpis.pedidos), moneda),
      },
    ],
    calculo:
      'El proveedor no ha documentado qué incluye el neto, así que la diferencia no se presenta como comisión ni como liquidación.',
  };
}

export function infoHoy(d: RespuestaVivo): InfoTablero {
  const m = d.sucursal.moneda;
  const corte = d.corte.hora.slice(0, 5);
  return {
    titulo: d.sucursal.nombre,
    mide: `Cómo va hoy la sucursal, comparada con el ${d.base.dia} pasado a la misma hora.`,
    cifras: [
      { etiqueta: `Venta a las ${corte}`, valor: dinero(d.kpis.ventaCent, m) },
      {
        etiqueta: `${d.base.dia} pasado`,
        valor: d.kpisBase ? dinero(d.kpisBase.ventaCent, m) : 'Sin lectura',
      },
      { etiqueta: 'Pedidos', valor: numero(d.kpis.pedidos) },
      { etiqueta: 'Ticket promedio', valor: d.kpis.ticketCent === null ? '—' : dinero(d.kpis.ticketCent, m) },
      { etiqueta: 'Últimos 60 minutos', valor: `${numero(d.ritmo.ultimos60)} pedidos` },
    ],
    calculo: 'Incluye mostrador, App The Coffee y Rappi. Abre la tarjeta para ver el detalle en vivo.',
  };
}

export function infoCosteo(c: CosteoResumen, moneda: string): InfoTablero {
  const vendidas = c.completo.lineas + c.parcial.lineas;
  return {
    titulo: 'Costeo del periodo',
    mide: 'Cuánto de lo vendido ya tiene receta en Costeo y qué margen teórico deja con el costo de hoy.',
    cifras: [
      { etiqueta: 'Venta con receta (sobre B)', valor: porcentaje(c.cobertura.sobreIdentificable) },
      {
        etiqueta: 'Food cost teórico',
        valor: c.completo.ventaSinIvaCent
          ? porcentaje(c.completo.costoCent / c.completo.ventaSinIvaCent)
          : '—',
      },
      { etiqueta: 'Margen bruto teórico', valor: porcentaje(c.completo.margenPct) },
      {
        etiqueta: 'Unidades con costeo completo',
        valor: vendidas ? `${numero(c.completo.lineas)} de ${numero(vendidas)}` : '—',
      },
      { etiqueta: 'Venta sin enlace a receta', valor: dinero(c.cobertura.sinEnlaceCent, moneda) },
    ],
    calculo:
      'Food cost = costo actual de la receta ÷ venta sin IVA, solo con unidades de costeo completo. Es provisional: Compras aún debe confirmar si los costos de insumos llevan IVA.',
  };
}
