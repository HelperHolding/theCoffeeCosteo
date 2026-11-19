// Lectura de metas mensuales y punto de equilibrio (BI F5) desde los archivos de Zoho Analytics o de Finanzas.
// Funciones puras: el script scripts/bi/metas.ts lee, cruza con bi_tiendas y escribe.

export interface MetaMensual {
  sucursal: string;
  mes: string; // AAAA-MM-01
  ventaCent: number;
  tickets: number;
  ticketPromedioCent: number;
  fechaApertura: string | null; // AAAA-MM-DD
}

export interface PuntoEquilibrio {
  sucursal: string;
  mes: string; // AAAA-MM-01
  peCent: number;
}

/** Nombre comparable: minúsculas, sin acentos, sin puntos y con espacios colapsados («Cd. Juárez» = «cd juarez»). */
export function normalizarNombre(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ').trim();
}

/** «$302,000.00», «302000», «139.5» → centavos. Vacío o no numérico = error. */
export function aCentavos(v: string): number {
  const limpio = v.replace(/[$,\s]/g, '');
  if (!/^-?\d+(\.\d+)?$/.test(limpio)) throw new Error(`Importe no válido: «${v}»`);
  return Math.round(Number(limpio) * 100);
}

const mesDe = (anio: string, mes: string) => {
  const a = Number(anio);
  const m = Number(mes);
  if (!Number.isInteger(a) || a < 2020 || a > 2100 || !Number.isInteger(m) || m < 1 || m > 12)
    throw new Error(`Mes no válido: ${anio}-${mes}`);
  return `${a}-${String(m).padStart(2, '0')}-01`;
};

/** «dd-MM-yyyy» (Zoho) o «AAAA-MM-DD» → AAAA-MM-DD; vacío → null. */
export function fechaApertura(v: string): string | null {
  const t = v.trim();
  if (!t) return null;
  const dmy = /^(\d{2})-(\d{2})-(\d{4})$/.exec(t);
  const iso = dmy ? `${dmy[3]}-${dmy[2]}-${dmy[1]}` : t;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || Number.isNaN(Date.parse(`${iso}T00:00:00Z`)))
    throw new Error(`Fecha de apertura no válida: «${v}»`);
  return iso;
}

/** Busca una columna por nombre sin importar acentos ni la codificación rota del encabezado («A�o»). */
function columna(fila: Record<string, string>, ...nombres: (string | RegExp)[]): string {
  for (const n of nombres) {
    const clave = Object.keys(fila).find((k) =>
      typeof n === 'string' ? normalizarNombre(k) === normalizarNombre(n) : n.test(k),
    );
    if (clave !== undefined) return fila[clave] ?? '';
  }
  throw new Error(`Falta la columna ${nombres.map(String).join(' / ')}`);
}

/** Filas de «Metas Mensuales 2026 (Ventas Tickets TP)». Una sucursal repetida en el mismo mes es error. */
export function leerMetas(filas: Record<string, string>[]): MetaMensual[] {
  const vistas = new Set<string>();
  return filas.map((f) => {
    const sucursal = columna(f, 'Sucursal').trim();
    const mes = mesDe(columna(f, 'Año', /^a.{1,2}o$/i), columna(f, 'MesNum'));
    const clave = `${normalizarNombre(sucursal)}|${mes}`;
    if (vistas.has(clave)) throw new Error(`Meta repetida: ${sucursal} ${mes.slice(0, 7)}`);
    vistas.add(clave);
    const tickets = Number(columna(f, 'MetaMensualTickets').replace(/,/g, ''));
    if (!Number.isFinite(tickets) || tickets < 0) throw new Error(`Tickets no válidos en ${sucursal} ${mes}`);
    return {
      sucursal,
      mes,
      ventaCent: aCentavos(columna(f, 'MetaMensualVentas')),
      tickets: Math.round(tickets),
      ticketPromedioCent: aCentavos(columna(f, 'MetaMensualTicketPromedio')),
      fechaApertura: fechaApertura(columna(f, 'FechaApertura')),
    };
  });
}

/** CSV de P.E.: columnas «tienda», «mes» (AAAA-MM) y «pe» (pesos, con o sin IVA según lo que mande Finanzas). */
export function leerPuntoEquilibrio(filas: Record<string, string>[]): PuntoEquilibrio[] {
  const vistas = new Set<string>();
  return filas.map((f) => {
    const sucursal = columna(f, 'tienda').trim();
    const [anio, mesNum] = columna(f, 'mes').trim().split('-');
    const mes = mesDe(anio ?? '', mesNum ?? '');
    const clave = `${normalizarNombre(sucursal)}|${mes}`;
    if (vistas.has(clave)) throw new Error(`P.E. repetido: ${sucursal} ${mes.slice(0, 7)}`);
    vistas.add(clave);
    return { sucursal, mes, peCent: aCentavos(columna(f, 'pe')) };
  });
}

/** Cruza por nombre con bi_tiendas. Devuelve las filas con company_id y los nombres que no cruzan. */
export function cruzarTiendas<T extends { sucursal: string }>(
  filas: T[],
  tiendas: { company_id: number; nombre: string }[],
): { cruzadas: (T & { companyId: number })[]; sinTienda: string[] } {
  const porNombre = new Map<string, number>();
  for (const t of tiendas) {
    const n = normalizarNombre(t.nombre);
    if (porNombre.has(n)) throw new Error(`Dos tiendas con el mismo nombre en bi_tiendas: ${t.nombre}`);
    porNombre.set(n, t.company_id);
  }
  const cruzadas: (T & { companyId: number })[] = [];
  const sinTienda = new Set<string>();
  for (const f of filas) {
    const c = porNombre.get(normalizarNombre(f.sucursal));
    if (c === undefined) sinTienda.add(f.sucursal);
    else cruzadas.push({ ...f, companyId: c });
  }
  return { cruzadas, sinTienda: [...sinTienda].sort() };
}

/** CSV simple (comillas dobles y coma), como lo exporta Zoho. */
export function leerCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') {
        campo += '"';
        i++;
      } else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') {
      fila.push(campo);
      campo = '';
    } else if (ch === '\n') {
      fila.push(campo);
      filas.push(fila);
      fila = [];
      campo = '';
    } else if (ch !== '\r') campo += ch;
  }
  if (campo || fila.length) {
    fila.push(campo);
    filas.push(fila);
  }
  const [cab = [], ...resto] = filas;
  const encabezado = cab.map((c) => c.replace(/^﻿/, ''));
  return resto
    .filter((f) => f.length === encabezado.length)
    .map((f) => Object.fromEntries(encabezado.map((k, i) => [k, f[i] ?? ''])));
}

/** Bytes de Zoho a texto: UTF-8 si es válido; si no, Windows-1252 (así llegan los acentos de algunas tablas). */
export function decodificar(bytes: ArrayBuffer | Uint8Array): string {
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}
