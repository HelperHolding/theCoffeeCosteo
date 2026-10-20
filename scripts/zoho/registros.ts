import { ClienteZoho, ErrorZoho } from './cliente';

/** Credenciales en texto plano en Zoho: nunca se piden a la API. */
export const EXCLUIDOS = new Set(['Contrase_a_FINKOK_PAC', 'Usuario_FINKOK_PAC', 'Contrase_a']);
const POR_LOTE = 50;
type Registro = Record<string, unknown>;

/** Lee todos los registros de un módulo con todos sus campos (lotes de 49 + id, unidos por id). */
export async function leerRegistros(
  z: ClienteZoho,
  modulo: string,
  campos: string[],
  inaccesibles: Set<string>,
) {
  const porId = new Map<string, Registro>();
  let pendientes = campos.filter((c) => c !== 'id');
  while (pendientes.length) {
    const lote = pendientes.slice(0, POR_LOTE - 1);
    pendientes = pendientes.slice(POR_LOTE - 1);
    let token: string | undefined;
    for (let pagina = 1; ; pagina++) {
      const base = `/crm/v8/${modulo}?fields=id,${lote.join(',')}&per_page=200`;
      let r: { data?: Registro[]; info?: { more_records?: boolean; next_page_token?: string } } | null;
      try {
        r = await z.get(token ? `${base}&page_token=${encodeURIComponent(token)}` : `${base}&page=${pagina}`);
      } catch (e) {
        if (e instanceof ErrorZoho && e.status === 400 && lote.length > 1) {
          // Un campo del lote no es legible por la API: se prueba uno por uno.
          for (const c of lote) {
            try {
              await z.get(`/crm/v8/${modulo}?fields=id,${c}&per_page=1`);
              pendientes.push(c);
            } catch {
              inaccesibles.add(c);
            }
          }
          break;
        }
        throw e;
      }
      for (const fila of r?.data ?? [])
        porId.set(String(fila.id), { ...porId.get(String(fila.id)), ...fila });
      if (!r?.info?.more_records) break;
      token = r.info.next_page_token;
    }
  }
  return [...porId.values()];
}
