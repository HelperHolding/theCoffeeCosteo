import { configuracion } from '../supabase/config';
/** Dominio propio del portal: el MCP se anuncia aquí (el `resource` del descubrimiento OAuth debe coincidir). */
export const URL_PORTAL = 'https://portal.thecoffeemexico.com';
/** Dominio anterior de Vercel: sigue sirviendo el portal; se acepta como origen de navegador. */
export const URL_PORTAL_VERCEL = 'https://the-coffee-costeo.vercel.app';
export const URL_MCP = `${URL_PORTAL}/mcp`;
export function emisorMcp() {
  return `${configuracion().url.replace(/\/$/, '')}/auth/v1`;
}
