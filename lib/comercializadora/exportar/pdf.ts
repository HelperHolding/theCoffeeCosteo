// lib/comercializadora/exportar/pdf.ts
import 'server-only';

type Pagina = { setContent(html: string, o: { waitUntil: 'load' }): Promise<unknown>; pdf(o: object): Promise<Uint8Array> };
type Navegador = { newPage(): Promise<Pagina>; close(): Promise<void> };
export type Lanzador = () => Promise<Navegador>;

export const OPCIONES_PDF = {
  format: 'letter' as const,
  printBackground: true as const,
  margin: { top: '12mm', bottom: '14mm', left: '12mm', right: '12mm' },
  displayHeaderFooter: true as const,
  headerTemplate: '<span></span>',
  footerTemplate: '<div style="font-size:8px;color:#777;width:100%;text-align:center"><span class="pageNumber"></span> / <span class="totalPages"></span></div>',
};

/**
 * Chromium sin cabeza: en Vercel usa @sparticuz/chromium; en desarrollo local, el Chrome/Edge de la máquina
 * indicado en CHROMIUM_PATH (p. ej. C:\Program Files\Google\Chrome\Application\chrome.exe).
 */
/** Opciones de lanzamiento en servidor, como las documenta el README de @sparticuz/chromium (headless "shell"). */
export async function opcionesServidor(
  chromium: { args: string[]; executablePath: () => Promise<string> },
  defaultArgs: (o: { args: string[]; headless: 'shell' }) => Promise<string[]> | string[],
) {
  return { args: await defaultArgs({ args: chromium.args, headless: 'shell' as const }), executablePath: await chromium.executablePath(), headless: 'shell' as const };
}

const lanzarReal: Lanzador = async () => {
  const puppeteer = (await import('puppeteer-core')).default;
  const local = process.env.CHROMIUM_PATH;
  if (local) return (await puppeteer.launch({ executablePath: local, headless: 'shell' })) as unknown as Navegador;
  const chromium = (await import('@sparticuz/chromium')).default;
  return (await puppeteer.launch(await opcionesServidor(chromium, (o) => puppeteer.defaultArgs(o)))) as unknown as Navegador;
};

export const MENSAJE_FALLA_PDF = 'No se pudo generar el PDF. Baja el HTML.';

export async function htmlAPdf(html: string, deps: { lanzar?: Lanzador } = {}): Promise<Uint8Array> {
  let nav: Navegador | null = null;
  try {
    nav = await (deps.lanzar ?? lanzarReal)();
    const pagina = await nav.newPage();
    await pagina.setContent(html, { waitUntil: 'load' });
    return await pagina.pdf(OPCIONES_PDF);
  } catch (e) {
    // El detalle (rutas, librerías del servidor) solo va al registro; al usuario, un mensaje fijo.
    console.error('[comercializadora] pdf', e instanceof Error ? e.message : e);
    throw new Error(MENSAJE_FALLA_PDF);
  } finally {
    await nav?.close().catch(() => {});
  }
}
