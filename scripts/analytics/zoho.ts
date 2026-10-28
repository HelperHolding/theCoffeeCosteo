import { leerEnvLocal } from '../zoho/cliente';

/**
 * Cliente mínimo de Zoho Analytics para cargas puntuales: SOLO lectura.
 * - Token propio de Analytics (`ZOHO_ANALYTICS_REFRESH_TOKEN`), separado del de CRM.
 * - Únicas rutas: export asíncrono por SQL (crear job, estado, descarga) e importdetails; todas GET.
 * - Solo acepta SELECT. Nunca imprime tokens.
 */
const API = 'https://analyticsapi.zoho.com';
export const WORKSPACE = '2958916000000074002';
export const ORG = '862256713';
export const LOOKER_SUCURSALES = '2958916000007201302';
const PERMITIDAS = [
  new RegExp(`^/restapi/v2/bulk/workspaces/${WORKSPACE}/(data|exportjobs/\\d+|exportjobs/\\d+/data)$`),
  new RegExp(`^/restapi/v2/workspaces/${WORKSPACE}/views/\\d+/importdetails$`),
];

export async function clienteZoho() {
  const env = await leerEnvLocal();
  for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_ANALYTICS_REFRESH_TOKEN'])
    if (!env.get(k)) throw new Error(`Falta ${k} en .env.local`);
  const t = (await (
    await fetch(`${env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com'}/oauth/v2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.get('ZOHO_ANALYTICS_REFRESH_TOKEN')!,
        client_id: env.get('ZOHO_CLIENT_ID')!,
        client_secret: env.get('ZOHO_CLIENT_SECRET')!,
      }),
    })
  ).json()) as { access_token?: string; error?: string };
  if (!t.access_token)
    throw new Error(`No se pudo renovar el token de Analytics (${t.error ?? 'sin respuesta'})`);
  let llamadas = 0;

  async function get(ruta: string, config?: object): Promise<{ status: number; cuerpo: unknown }> {
    if (!PERMITIDAS.some((p) => p.test(ruta))) throw new Error(`Bloqueado: GET ${ruta}`);
    llamadas++;
    await new Promise((ok) => setTimeout(ok, 1100)); // < 60 llamadas por minuto
    const res = await fetch(
      `${API}${ruta}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${t.access_token}`, 'ZANALYTICS-ORGID': ORG },
      },
    );
    const tipo = res.headers.get('content-type') ?? '';
    const cuerpo = tipo.includes('json') ? await res.json() : await res.text();
    if (!res.ok) throw new Error(`Zoho ${res.status} en ${ruta}: ${JSON.stringify(cuerpo).slice(0, 300)}`);
    return { status: res.status, cuerpo };
  }

  /** Exporta un SELECT como CSV (job asíncrono). Devuelve el texto CSV. */
  async function exportarSql(sql: string): Promise<string> {
    if (!/^\s*select\s/i.test(sql)) throw new Error('Solo SELECT');
    const base = `/restapi/v2/bulk/workspaces/${WORKSPACE}`;
    const c = (await get(`${base}/data`, { sqlQuery: sql, responseFormat: 'csv' })).cuerpo as {
      data?: { jobId?: string };
    };
    const job = c.data?.jobId;
    if (!job) throw new Error('Zoho no devolvió jobId');
    for (let i = 0; i < 90; i++) {
      const s = (await get(`${base}/exportjobs/${job}`)).cuerpo as { data?: { jobStatus?: string } };
      const estado = s.data?.jobStatus ?? '';
      if (/COMPLETED/i.test(estado)) {
        const d = (await get(`${base}/exportjobs/${job}/data`)).cuerpo;
        if (typeof d !== 'string') throw new Error('La descarga no es CSV');
        return d;
      }
      if (/ERROR|FAIL/i.test(estado)) throw new Error(`Job de exportación falló: ${estado}`);
      if (i % 10 === 9) console.error(`  export en curso (${estado})…`);
      await new Promise((ok) => setTimeout(ok, 2000));
    }
    throw new Error('El job de exportación no terminó a tiempo');
  }

  async function ultimaImportacion(viewId: string) {
    const r = (await get(`/restapi/v2/workspaces/${WORKSPACE}/views/${viewId}/importdetails`)).cuerpo as {
      data?: { lastImportTime?: string; rows?: { total?: string } };
    };
    return { momento: r.data?.lastImportTime ?? null, filas: Number(r.data?.rows?.total ?? NaN) };
  }

  return { exportarSql, ultimaImportacion, llamadas: () => llamadas };
}

/** CSV simple de Zoho (comillas dobles, coma). */
export function leerCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto[i];
    if (comillas) {
      if (ch === '"' && texto[i + 1] === '"') ((campo += '"'), i++);
      else if (ch === '"') comillas = false;
      else campo += ch;
    } else if (ch === '"') comillas = true;
    else if (ch === ',') (fila.push(campo), (campo = ''));
    else if (ch === '\n') (fila.push(campo), filas.push(fila), (fila = []), (campo = ''));
    else if (ch !== '\r') campo += ch;
  }
  if (campo || fila.length) (fila.push(campo), filas.push(fila));
  const [cab, ...resto] = filas;
  return resto
    .filter((f) => f.length === cab.length)
    .map((f) => Object.fromEntries(cab.map((k, i) => [k, f[i]])));
}
