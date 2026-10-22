/**
 * Tiempo de sucursal. `createdAt` llega como `YYYY-MM-DDTHH:mm:ss.000Z`; la evidencia indica que es
 * hora local de la tienda etiquetada con Z (hipótesis pendiente de confirmar). El modo es configuración
 * por sucursal para no convertir dos veces ni depender de la zona del servidor.
 */
export type ModoTiempo = 'local-etiquetada-z' | 'utc';

export interface MomentoLocal {
  fecha: string; // YYYY-MM-DD
  segundo: number; // segundos desde la medianoche local (0–86399)
}

const FECHA = /^(\d{4})-(\d{2})-(\d{2})$/;
const MARCA = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,3})?Z$/;

export function fechaValida(s: unknown): s is string {
  if (typeof s !== 'string') return false;
  const m = FECHA.exec(s);
  if (!m) return false;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.toISOString().slice(0, 10) === s;
}

export function sumarDias(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split('-').map(Number);
  return new Date(Date.UTC(a, m - 1, d + dias)).toISOString().slice(0, 10);
}

/** Días naturales entre dos fechas (hasta − desde). */
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / 86_400_000);

const formatos = new Map<string, Intl.DateTimeFormat>();
function formato(zona: string) {
  let f = formatos.get(zona);
  if (!f) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatos.set(zona, f);
  }
  return f;
}

/** Fecha y segundo locales de un instante real en una zona IANA. */
export function enZona(instante: Date, zona: string): MomentoLocal {
  const p = Object.fromEntries(
    formato(zona)
      .formatToParts(instante)
      .map((x) => [x.type, x.value]),
  );
  return { fecha: `${p.year}-${p.month}-${p.day}`, segundo: +p.hour * 3600 + +p.minute * 60 + +p.second };
}

/** Interpreta `createdAt` según el modo de la sucursal. Devuelve null si el formato no es el esperado. */
export function momentoPedido(createdAt: string, modo: ModoTiempo, zona: string): MomentoLocal | null {
  const m = MARCA.exec(createdAt);
  if (!m || !fechaValida(m[1]) || +m[2] > 23 || +m[3] > 59 || +m[4] > 59) return null;
  if (modo === 'local-etiquetada-z') return { fecha: m[1], segundo: +m[2] * 3600 + +m[3] * 60 + +m[4] };
  return enZona(new Date(createdAt), zona);
}

export const textoHora = (segundo: number, conSegundos = false) => {
  const h = Math.floor(segundo / 3600);
  const mi = Math.floor((segundo % 3600) / 60);
  const s = segundo % 60;
  const dos = (n: number) => String(n).padStart(2, '0');
  return conSegundos ? `${dos(h)}:${dos(mi)}:${dos(s)}` : `${dos(h)}:${dos(mi)}`;
};

/**
 * Frescura de la última lectura buena. Intervalos sin huecos:
 * < 120 s actualizado · 120–300 s pendiente · > 300 s retrasado · error si la última lectura falló.
 */
export type Frescura = 'actualizado' | 'pendiente' | 'retrasado' | 'error';
export function frescura(leidoEnMs: number | null, ahoraMs: number, fallo: boolean): Frescura {
  if (fallo || leidoEnMs === null) return 'error';
  const edad = (ahoraMs - leidoEnMs) / 1000;
  if (edad < 120) return 'actualizado';
  if (edad <= 300) return 'pendiente';
  return 'retrasado';
}
