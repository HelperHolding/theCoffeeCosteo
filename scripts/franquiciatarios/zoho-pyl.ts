// Exploración de SOLO LECTURA en Zoho Analytics para el P&L de una sucursal propia (F5): lista las vistas del workspace
// «The Coffee Oficial» que parecen de estado de resultados / gastos / punto de equilibrio, y exporta por SQL las que se
// pidan filtradas por sucursal. Nunca imprime tokens. Uso:
//   npx tsx scripts/franquiciatarios/zoho-pyl.ts vistas
//   npx tsx scripts/franquiciatarios/zoho-pyl.ts columnas "<vista>"
//   npx tsx scripts/franquiciatarios/zoho-pyl.ts sql "select * from \"<vista>\" limit 20"
import { leerEnvLocal } from '../zoho/cliente';

const WS = '2958916000000074002';
const ORG = '862256713';
const env = await leerEnvLocal();
for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_ANALYTICS_REFRESH_TOKEN'])
  if (!env.get(k)) throw new Error(`Falta ${k} en .env.local`);
const token = (
  (await (
    await fetch(`${env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com'}/oauth/v2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.get('ZOHO_ANALYTICS_REFRESH_TOKEN')!,
        client_id: env.get('ZOHO_CLIENT_ID')!,
        client_secret: env.get('ZOHO_CLIENT_SECRET')!,
      }),
    })
  ).json()) as { access_token?: string; error?: string }
).access_token;
if (!token) throw new Error('No se pudo renovar el token de Analytics');

const get = async (url: string, config?: object) => {
  await new Promise((ok) => setTimeout(ok, 1100));
  const res = await fetch(`${url}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}`, 'ZANALYTICS-ORGID': ORG },
  });
  if (!res.ok) throw new Error(`Zoho ${res.status}: ${(await res.text()).slice(0, 300)}`);
  return res;
};

async function exportar(sql: string): Promise<string> {
  if (!/^\s*select\s/i.test(sql)) throw new Error('Solo SELECT');
  const base = `https://analyticsapi.zoho.com/restapi/v2/bulk/workspaces/${WS}`;
  const job = (
    (await (await get(`${base}/data`, { sqlQuery: sql, responseFormat: 'csv' })).json()) as {
      data?: { jobId?: string };
    }
  ).data?.jobId;
  if (!job) throw new Error('Zoho no devolvió jobId');
  for (let i = 0; i < 90; i++) {
    const estado =
      ((await (await get(`${base}/exportjobs/${job}`)).json()) as { data?: { jobStatus?: string } }).data
        ?.jobStatus ?? '';
    if (/COMPLETED/i.test(estado))
      return new TextDecoder('utf-8').decode(
        await (await get(`${base}/exportjobs/${job}/data`)).arrayBuffer(),
      );
    if (/ERROR|FAIL/i.test(estado)) throw new Error(`Export falló: ${estado}`);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  throw new Error('El export no terminó a tiempo');
}

const [accion, arg] = process.argv.slice(2);
if (accion === 'vistas') {
  const r = (await (await get(`https://analyticsapi.zoho.com/restapi/v2/workspaces/${WS}/views`)).json()) as {
    data?: { views?: { viewName: string; viewType: string; viewId: string; folderId?: string }[] };
  };
  const todas = r.data?.views ?? [];
  const re =
    /resultad|gasto|equilibrio|\bp\.?\s?e\b|renta|n[oó]mina|propias|finanz|egreso|costo|utilidad|p&l|pyl|estado|regal|presupuesto|opex/i;
  console.log(`Vistas en el workspace: ${todas.length}`);
  for (const v of todas.filter((x) => re.test(x.viewName)))
    console.log(`${v.viewType.padEnd(16)} ${v.viewName}`);
} else if (accion === 'columnas') {
  console.log((await exportar(`select * from "${arg}" limit 3`)).slice(0, 4000));
} else if (accion === 'sql') {
  console.log((await exportar(arg)).slice(0, 12000));
} else {
  console.log('Uso: vistas | columnas "<vista>" | sql "<select…>"');
}
