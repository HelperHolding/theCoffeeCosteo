// Lectura del texto de los recibos Banregio y del resumen de la masiva (spec §2). Puro: recibe el texto ya extraído.
// El texto de los PDF sale desordenado (etiqueta antes o después del valor): se leen patrones sobre todo el texto.

export type TipoTransferencia = 'SPEI' | 'Banregio';

export interface FilaResumen {
  secuencia: number;
  tipo: TipoTransferencia;
  clabe: string;
  /** Alias y descripción juntos (en el PDF no se pueden separar con certeza). */
  texto: string;
  monto: number;
}

export interface Resumen {
  archivo: string | null;
  numero: number | null;
  total: number | null;
  filas: FilaResumen[];
  conError: number;
}

export interface Recibo {
  tipo: TipoTransferencia;
  alias: string;
  /** null en traspasos Banregio→Banregio y en recibos de solicitud SPEI (solo traen los últimos 4 dígitos). */
  clabe: string | null;
  ultimos4: string;
  monto: number;
  concepto: string;
  /** YYYY-MM-DD */
  fecha: string;
  claveRastreo: string | null;
}

export interface Transferencia {
  llave: string;
  tipo: TipoTransferencia;
  clabe: string | null;
  alias: string;
  concepto: string;
  monto: number;
  fecha: string;
  claveRastreo: string | null;
  archivo: string;
  secuencia: number | null;
}

const MESES: Record<string, string> = {
  enero: '01',
  febrero: '02',
  marzo: '03',
  abril: '04',
  mayo: '05',
  junio: '06',
  julio: '07',
  agosto: '08',
  septiembre: '09',
  setiembre: '09',
  octubre: '10',
  noviembre: '11',
  diciembre: '12',
};

export const centavos = (n: number): number => Math.round(n * 100);
const dinero = (s: string) => Number(s.replace(/,/g, ''));
const pesos = (c: number) => `$${(c / 100).toFixed(2)}`;

export const esResumen = (texto: string): boolean => texto.includes('Recibo de Transferencia Masiva');

const INICIO_FILA = /^(\d+) (SPEI|Banregio) (\d{18}) ?(.*)$/;
const MONTO_FINAL = /\$([\d,]+\.\d{2})$/;

function filasResumen(texto: string): FilaResumen[] {
  const filas: FilaResumen[] = [];
  let actual: { secuencia: number; tipo: TipoTransferencia; clabe: string; partes: string[] } | null = null;
  for (const linea of texto.split('\n').map((l) => l.trim())) {
    const ini = INICIO_FILA.exec(linea);
    if (ini)
      actual = {
        secuencia: Number(ini[1]),
        tipo: ini[2] as TipoTransferencia,
        clabe: ini[3],
        partes: [ini[4]],
      };
    else if (actual) actual.partes.push(linea);
    else continue;
    const ultima = actual.partes[actual.partes.length - 1];
    const m = MONTO_FINAL.exec(ultima);
    if (m) {
      actual.partes[actual.partes.length - 1] = ultima.slice(0, m.index).trim();
      filas.push({
        secuencia: actual.secuencia,
        tipo: actual.tipo,
        clabe: actual.clabe,
        texto: actual.partes.filter(Boolean).join(' '),
        monto: dinero(m[1]),
      });
      actual = null;
    }
  }
  return filas;
}

export function leerResumen(texto: string): Resumen {
  const [principal, errores = ''] = texto.split('Detalle de Transferencias con Error');
  const numero = /Número de Transferencias (\d+)/.exec(principal);
  const total = /^Total \$([\d,]+\.\d{2})$/m.exec(principal);
  return {
    archivo: /^(.+?\.xlsx?)Archivo$/m.exec(principal)?.[1] ?? null,
    numero: numero ? Number(numero[1]) : null,
    total: total ? dinero(total[1]) : null,
    filas: filasResumen(principal),
    conError: filasResumen(errores).length,
  };
}

export function leerRecibo(texto: string): Recibo {
  const monto = /\$([\d,]+\.\d{2}) pesos/.exec(texto);
  if (!monto) throw new Error('No encontré el monto');
  const tipo: TipoTransferencia = texto.includes('(SPEI)') ? 'SPEI' : 'Banregio';
  const claveRastreo = /^(\d{3}-\d{2}\/\d{2}\/\d{4}\/[A-Za-z0-9-]+)$/m.exec(texto)?.[1] ?? null;
  if (tipo === 'SPEI') {
    // Recibo completo: CLABE de 18 dígitos. "Recibo de la solicitud" (p. ej. a Banorte): solo "- *1234", sin clave de rastreo.
    const d = /Cuenta Destino (.+?) - (?:(\d{18})|\*(\d{4}))/.exec(texto);
    if (!d) throw new Error('No encontré la cuenta destino');
    // Fecha de operación SPEI; si el recibo es de solicitud, la fecha en que se solicitó.
    const f =
      /Fecha de operación SPEI (\d{1,2}) (\p{L}+) (\d{4})/u.exec(texto) ??
      /(\d{1,2}) (\p{L}+) (\d{4}) - \d{1,2}:\d{2} [ap]\. m\.Fecha solicita/u.exec(texto);
    const mes = f ? MESES[f[2].toLowerCase()] : undefined;
    if (!f || !mes) throw new Error('No encontré la fecha de operación');
    return {
      tipo,
      alias: d[1].trim(),
      clabe: d[2] ?? null,
      ultimos4: d[2] ? d[2].slice(-4) : d[3],
      monto: dinero(monto[1]),
      concepto: /Concepto de pago (.+)/.exec(texto)?.[1].trim() ?? '',
      fecha: `${f[3]}-${mes}-${f[1].padStart(2, '0')}`,
      claveRastreo,
    };
  }
  // Banregio→Banregio: la primera cuenta "- *1234" es la de origen; la segunda, la de destino.
  const cuentas = [...texto.matchAll(/^(.+?) - \*(\d{4})(?:Cuenta Origen)?$/gm)];
  if (cuentas.length < 2) throw new Error('No encontré la cuenta destino');
  const lineas = texto.split('\n').map((l) => l.trim());
  const i = lineas.findIndex((l) => /^\$[\d,]+\.\d{2} pesos$/.test(l));
  const f = /(\d{2})-(\d{2})-(\d{4}) \d{2}:\d{2}/.exec(texto);
  if (!f) throw new Error('No encontré la fecha de operación');
  return {
    tipo,
    alias: cuentas[1][1].trim(),
    clabe: null,
    ultimos4: cuentas[1][2],
    monto: dinero(monto[1]),
    concepto: i >= 0 ? (lineas[i + 1] ?? '') : '',
    fecha: `${f[3]}-${f[2]}-${f[1]}`,
    claveRastreo,
  };
}

/** Une cada recibo con su fila del resumen (CLABE + monto; Banregio: últimos 4 + monto) y arma la llave (spec §2). */
export function unir(
  resumen: Resumen | null,
  recibos: { archivo: string; recibo: Recibo }[],
): { transferencias: Transferencia[]; avisos: string[] } {
  const avisos: string[] = [];
  const libres = [...(resumen?.filas ?? [])];
  const vistas = new Set<string>();
  const transferencias: Transferencia[] = [];
  for (const { archivo, recibo: r } of recibos) {
    const i = libres.findIndex(
      (f) =>
        f.tipo === r.tipo &&
        centavos(f.monto) === centavos(r.monto) &&
        (r.clabe ? f.clabe === r.clabe : f.clabe.endsWith(r.ultimos4)),
    );
    const fila = i >= 0 ? libres.splice(i, 1)[0] : null;
    if (resumen && !fila) avisos.push(`${archivo}: no aparece en el resumen de la masiva.`);
    // Sin clave de rastreo la llave es determinista; el prefijo evita choques entre traspasos Banregio y solicitudes SPEI.
    const prefijo = r.tipo === 'SPEI' ? 'SOL' : 'BRG';
    const llave = r.claveRastreo ?? `${prefijo}-${r.fecha}-${r.ultimos4}-${r.monto.toFixed(2)}`;
    if (vistas.has(llave)) {
      avisos.push(`${archivo}: recibo repetido en el ZIP; se tomó una sola vez.`);
      continue;
    }
    vistas.add(llave);
    if (r.tipo === 'SPEI' && !r.claveRastreo)
      avisos.push(
        `${archivo}: es un recibo de solicitud sin clave de rastreo; confirma con Banregio que se ejecutó antes de aplicarlo.`,
      );
    transferencias.push({
      llave,
      tipo: r.tipo,
      clabe: r.clabe ?? fila?.clabe ?? null,
      alias: r.alias,
      concepto: r.concepto,
      monto: r.monto,
      fecha: r.fecha,
      claveRastreo: r.claveRastreo,
      archivo,
      secuencia: fila?.secuencia ?? null,
    });
  }
  for (const f of libres)
    avisos.push(
      `La transferencia ${f.secuencia} del resumen (cuenta …${f.clabe.slice(-4)}, ${pesos(centavos(f.monto))}) no tiene recibo en el ZIP; no se aplicará.`,
    );
  if (resumen) {
    const suma = transferencias.reduce((s, t) => s + centavos(t.monto), 0);
    if (resumen.total !== null && centavos(resumen.total) !== suma)
      avisos.push(`Los recibos suman ${pesos(suma)} y el resumen dice ${pesos(centavos(resumen.total))}.`);
    if (resumen.numero !== null && resumen.numero !== transferencias.length)
      avisos.push(
        `El resumen tiene ${resumen.numero} transferencias y el ZIP ${transferencias.length} recibos.`,
      );
    if (resumen.conError > 0)
      avisos.push(
        `El resumen trae ${resumen.conError} transferencia(s) con error en Banregio; revisa que no estén entre los recibos.`,
      );
  } else avisos.push('El ZIP no trae el resumen de la transferencia masiva; no se pudo comparar el total.');
  transferencias.sort(
    (a, b) => (a.secuencia ?? 999) - (b.secuencia ?? 999) || a.alias.localeCompare(b.alias),
  );
  return { transferencias, avisos };
}
