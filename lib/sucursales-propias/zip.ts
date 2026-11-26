// Abre el ZIP de una corrida y lee el texto de cada PDF (spec §2, §4 paso 1). Sin 'server-only': lo usa también
// scripts/sucursales-propias/probar-zip.ts para revisar un ZIP real sin tocar Zoho.
import { unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { esResumen, leerRecibo, leerResumen, type Recibo, type Resumen } from './recibos';

/** Error con mensaje apto para mostrarse tal cual al usuario. */
export class ErrorCorrida extends Error {}

/** Tope de lo que se descomprime (los PDF del ZIP): el ZIP pesa máx. 4 MB, pero comprimido puede esconder mucho más. */
export const MAX_DESCOMPRIMIDO = 50 * 1024 * 1024;

/** Recibo leído del ZIP: `ruta` (completa dentro del ZIP) lo identifica; `archivo` (solo el nombre) es para mostrar. */
export interface ReciboZip {
  ruta: string;
  archivo: string;
  recibo: Recibo;
  pdf: Uint8Array;
}

const esPdf = (ruta: string) => ruta.toLowerCase().endsWith('.pdf') && !ruta.startsWith('__MACOSX/');

export async function textoPdf(bytes: Uint8Array): Promise<string> {
  // unpdf puede tomar el buffer: se le pasa una copia para no dañar el PDF que luego se sube.
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Los ZIP de Windows guardan los nombres en UTF-8 sin la bandera: fflate los entrega como latin1 ("DISEÃ\x91O"). */
function nombreLegible(nombre: string): string {
  if (!/[ÃÂ]/.test(nombre) || [...nombre].some((c) => c.charCodeAt(0) > 255)) return nombre;
  return new TextDecoder().decode(Uint8Array.from(nombre, (c) => c.charCodeAt(0)));
}

export async function leerZip(
  bytes: Uint8Array,
  extraer: (b: Uint8Array) => Promise<string> = textoPdf,
): Promise<{
  resumen: Resumen | null;
  recibos: ReciboZip[];
  avisos: string[];
}> {
  let archivos: Record<string, Uint8Array>;
  let total = 0;
  let grande = false;
  try {
    // El filtro ve el tamaño declarado antes de descomprimir: solo se abren PDFs y nunca más del tope.
    archivos = unzipSync(bytes, {
      filter: (f) => {
        if (!esPdf(f.name) || grande) return false;
        total += f.originalSize;
        if (total > MAX_DESCOMPRIMIDO) grande = true;
        return !grande;
      },
    });
  } catch {
    throw new ErrorCorrida('El archivo no es un ZIP válido.');
  }
  if (grande) throw new ErrorCorrida('El ZIP es demasiado grande al descomprimirlo.');
  let resumen: Resumen | null = null;
  const recibos: ReciboZip[] = [];
  const avisos: string[] = [];
  for (const [ruta, datos] of Object.entries(archivos)) {
    if (!esPdf(ruta)) continue;
    const archivo = nombreLegible(ruta.split('/').pop()!);
    try {
      const texto = await extraer(datos);
      if (esResumen(texto)) resumen = leerResumen(texto);
      else recibos.push({ ruta, archivo, recibo: leerRecibo(texto), pdf: datos });
    } catch {
      avisos.push(`No se pudo leer ${archivo}.`);
    }
  }
  if (!recibos.length) throw new ErrorCorrida('El ZIP no trae recibos de transferencia Banregio.');
  return { resumen, recibos, avisos };
}
