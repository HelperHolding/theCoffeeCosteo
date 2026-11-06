// Filtros del BI: tipos, Fecha Relativa de Zoho y conversión a los parámetros de las RPC.
// Las semanas son ISO (lunes a domingo), como en Zoho (docs/bi/zoho/filtros.json).

export interface FiltrosBi {
  desde: string;
  hasta: string;
  companias: number[];
  dias?: number[];
  horas?: number[];
  /** Etiquetas de Zoho: 'W45 2026'. */
  semanas?: string[];
  franquiciatarios?: string[];
  tipos?: string[];
  aniosOperando?: number[];
  comparable?: boolean;
  maduracion?: string[];
  categorias?: string[];
  grupos?: string[];
  cafe?: ('Sí' | 'No')[];
  productos?: string[];
  pagos?: string[];
  montoMin?: number;
  montoMax?: number;
  /** Solo para pruebas: fija «hoy» en la RPC. */
  hoy?: string;
}

const DIA_MS = 86_400_000;
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (d: Date, n: number) => new Date(d.getTime() + n * DIA_MS);
const lunesDe = (d: Date) => sumarDias(d, -((d.getUTCDay() + 6) % 7));
const fecha = (a: number, m: number, d: number) => new Date(Date.UTC(a, m, d));
const rango = (desde: Date, hasta: Date) => ({ desde: aTexto(desde), hasta: aTexto(hasta) });

/** Rango de una opción de «Fecha Relativa» de Zoho respecto de `hoy` (AAAA-MM-DD); null si no existe. */
export function fechaRelativa(opcion: string, hoy: string): { desde: string; hasta: string } | null {
  const h = aFecha(hoy);
  const lunes = lunesDe(h);
  const a = h.getUTCFullYear();
  const m = h.getUTCMonth();
  const semanaCompleta = (n: number) => rango(sumarDias(lunes, -7 * n), sumarDias(lunes, -7 * n + 6));
  const trimestre = Math.floor(m / 3) * 3;
  switch (opcion) {
    case 'Hoy': return rango(h, h);
    case 'Ayer': return rango(sumarDias(h, -1), sumarDias(h, -1));
    case 'Esta semana': return rango(lunes, h);
    case 'Semana anterior': return semanaCompleta(1);
    case '2 semanas anteriores': return semanaCompleta(2);
    case '3 semanas anteriores': return semanaCompleta(3);
    case '4 semanas anteriores': return semanaCompleta(4);
    case 'Últimas 4 semanas': return rango(sumarDias(lunes, -28), sumarDias(lunes, -1));
    case 'Este mes': return rango(fecha(a, m, 1), h);
    case 'Mes anterior': return rango(fecha(a, m - 1, 1), fecha(a, m, 0));
    case 'Últimos 3 meses': return rango(fecha(a, m - 3, 1), fecha(a, m, 0));
    case 'Este trimestre': return rango(fecha(a, trimestre, 1), h);
    case 'Trimestre anterior': return rango(fecha(a, trimestre - 3, 1), fecha(a, trimestre, 0));
    case 'Este año': return rango(fecha(a, 0, 1), h);
    case 'Año anterior': return rango(fecha(a - 1, 0, 1), fecha(a - 1, 11, 31));
    default: return null;
  }
}

const CLAVES: Record<keyof FiltrosBi, string> = {
  desde: 'desde', hasta: 'hasta', companias: 'companias', dias: 'dias', horas: 'horas', semanas: 'semanas',
  franquiciatarios: 'franquiciatarios', tipos: 'tipos', aniosOperando: 'anios_operando', comparable: 'comparable',
  maduracion: 'maduracion', categorias: 'categorias', grupos: 'grupos', cafe: 'cafe', productos: 'productos',
  pagos: 'pagos', montoMin: 'monto_min', montoMax: 'monto_max', hoy: 'hoy',
};

/** camelCase a los nombres de la RPC; omite undefined, null y arreglos vacíos. */
export function aJsonRpc(f: FiltrosBi): Record<string, unknown> {
  const salida: Record<string, unknown> = {};
  for (const [clave, valor] of Object.entries(f) as [keyof FiltrosBi, unknown][]) {
    if (valor === undefined || valor === null) continue;
    if (Array.isArray(valor) && valor.length === 0) continue;
    salida[CLAVES[clave]] = valor;
  }
  return salida;
}
