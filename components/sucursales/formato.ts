/** Formatos es-MX para Sucursales. Los importes llegan en centavos enteros. */
const monedas = new Map<string, Intl.NumberFormat>();
function fmtMoneda(moneda: string, decimales: boolean) {
  const k = `${moneda}|${decimales}`;
  let f = monedas.get(k);
  if (!f) {
    f = new Intl.NumberFormat('es-MX', {
      style: 'currency',
      currency: moneda,
      minimumFractionDigits: decimales ? 2 : 0,
      maximumFractionDigits: decimales ? 2 : 0,
    });
    monedas.set(k, f);
  }
  return f;
}

export const dinero = (cent: number | null | undefined, moneda = 'MXN', decimales = true) =>
  cent === null || cent === undefined ? '—' : fmtMoneda(moneda, decimales).format(cent / 100);

const enteros = new Intl.NumberFormat('es-MX');
export const numero = (n: number | null | undefined) =>
  n === null || n === undefined ? '—' : enteros.format(n);

export const porcentaje = (x: number | null | undefined, decimales = 1) =>
  x === null || x === undefined
    ? '—'
    : new Intl.NumberFormat('es-MX', {
        style: 'percent',
        minimumFractionDigits: decimales,
        maximumFractionDigits: decimales,
      }).format(x);

export const variacionTexto = (x: number | null) =>
  x === null ? 'sin base comparable' : `${x >= 0 ? '▲' : '▼'} ${porcentaje(Math.abs(x))}`;

export function hace(seg: number) {
  if (seg < 60) return 'hace menos de 1 min';
  if (seg < 3600) return `hace ${Math.floor(seg / 60)} min`;
  const h = Math.floor(seg / 3600);
  const m = Math.floor((seg % 3600) / 60);
  return `hace ${h} h${m ? ` ${m} min` : ''}`;
}

export const fechaLarga = (fecha: string) =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`));

export const fechaCorta = (fecha: string) =>
  new Intl.DateTimeFormat('es-MX', {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  }).format(new Date(`${fecha}T12:00:00Z`));

export const horaDe = (ms: number, zona: string) =>
  new Intl.DateTimeFormat('es-MX', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    timeZone: zona,
  }).format(new Date(ms));

export const diaMes = (fecha: string) =>
  new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(
    new Date(`${fecha}T12:00:00Z`),
  );

/** Resultado de la conciliación venta vs suma de productos, explicando el redondeo del proveedor. */
export function textoConciliacion(
  c: { diferenciaCent: number; pedidosNoCuadran: number; soloRedondeo: boolean },
  moneda = 'MXN',
) {
  if (c.diferenciaCent === 0 && c.pedidosNoCuadran === 0) return ' ✓';
  if (c.soloRedondeo)
    return ` ✓ (diferencia de ${dinero(c.diferenciaCent, moneda)} por redondeo del proveedor: ±1 ¢ en ${c.pedidosNoCuadran} pedido(s))`;
  return ` · diferencia ${dinero(c.diferenciaCent, moneda)} en ${c.pedidosNoCuadran} pedido(s): revisar`;
}
