import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Auditoría de solo lectura de Zoho Analytics (API v2) para docs/analytics-zoho.
 *
 * - Solo GET a /restapi/v2/* con una lista cerrada de rutas de metadatos; cualquier otra lanza antes de salir.
 * - Usa un refresh token PROPIO de Analytics (`ZOHO_ANALYTICS_REFRESH_TOKEN`) para no pisar el de CRM.
 *   Si `.env.local` trae `ZOHO_ANALYTICS_GRANT_CODE`, lo canjea, guarda el refresh token y borra el código.
 * - Respuestas crudas fuera del repo: %TEMP%/thecoffee-analytics-zoho/<marca>/. Nunca imprime tokens.
 * - Presupuesto: --max N llamadas (120 por defecto), 1.1 s entre llamadas (límite METADATA = 60/min).
 *
 * Uso: npx tsx scripts/analytics/auditar-zoho.ts [--workspace "The Coffee Oficial"]
 *        [--dashboard "Dashboard The Coffee México"] [--max 120] [--solo-acceso]
 * `--solo-acceso` canjea/renueva el token y solo lee orgs y workspaces (2 llamadas).
 */
const ARCHIVO = '.env.local';
const PERMITIDAS = [
  /^\/restapi\/v2\/orgs$/,
  /^\/restapi\/v2\/workspaces$/,
  /^\/restapi\/v2\/views\/\d+$/,
  /^\/restapi\/v2\/workspaces\/\d+$/,
  /^\/restapi\/v2\/workspaces\/\d+\/(views|folders|datasources|variables)$/,
  /^\/restapi\/v2\/workspaces\/\d+\/querytables\/\d+$/,
  /^\/restapi\/v2\/workspaces\/\d+\/views\/\d+\/(dependents|customformulas|aggregateformulas|importdetails|metadata)$/,
  /^\/restapi\/v2\/workspaces\/\d+\/views\/\d+\/share\/mypermissions$/,
];

function arg(nombre: string, defecto: string): string {
  const i = process.argv.indexOf(`--${nombre}`);
  return i > 0 && process.argv[i + 1] ? process.argv[i + 1] : defecto;
}

function leerEnv(texto: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m && m[2]) env.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return env;
}

function fijar(texto: string, clave: string, valor: string | null): string {
  const lineas = texto.split(/\r?\n/).filter((l) => !new RegExp(`^\\s*${clave}\\s*=`).test(l));
  if (valor !== null) lineas.push(`${clave}=${valor}`);
  return lineas
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/\n*$/, '\n');
}

type Vista = { viewId: string; viewName: string; viewType: string; [k: string]: unknown };

async function main() {
  let texto = await readFile(ARCHIVO, 'utf8');
  let env = leerEnv(texto);
  const cuentas = env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com';
  const api = env.get('ZOHO_ANALYTICS_API') || 'https://analyticsapi.zoho.com';
  const cred = {
    client_id: env.get('ZOHO_CLIENT_ID') ?? '',
    client_secret: env.get('ZOHO_CLIENT_SECRET') ?? '',
  };
  if (!cred.client_id || !cred.client_secret)
    throw new Error(`Faltan ZOHO_CLIENT_ID/ZOHO_CLIENT_SECRET en ${ARCHIVO}`);

  if (env.get('ZOHO_ANALYTICS_GRANT_CODE')) {
    const r = await fetch(`${cuentas}/oauth/v2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code: env.get('ZOHO_ANALYTICS_GRANT_CODE')!,
        ...cred,
      }),
    });
    const t = (await r.json()) as { refresh_token?: string; scope?: string; error?: string };
    if (!t.refresh_token)
      throw new Error(`Zoho rechazó el código (HTTP ${r.status}, ${t.error ?? 'sin refresh_token'})`);
    texto = fijar(
      fijar(texto, 'ZOHO_ANALYTICS_GRANT_CODE', null),
      'ZOHO_ANALYTICS_REFRESH_TOKEN',
      t.refresh_token,
    );
    await writeFile(ARCHIVO, texto);
    env = leerEnv(texto);
    console.log(
      `Refresh token de Analytics guardado en ${ARCHIVO} (no se imprime). Scopes: ${t.scope ?? '?'}`,
    );
  }
  if (!env.get('ZOHO_ANALYTICS_REFRESH_TOKEN'))
    throw new Error(`Falta ZOHO_ANALYTICS_REFRESH_TOKEN (o ZOHO_ANALYTICS_GRANT_CODE)`);

  const r = await fetch(`${cuentas}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: env.get('ZOHO_ANALYTICS_REFRESH_TOKEN')!,
      ...cred,
    }),
  });
  const t = (await r.json()) as { access_token?: string; scope?: string; error?: string };
  if (!t.access_token) throw new Error(`No se pudo renovar el token de Analytics (${t.error ?? r.status})`);
  console.log(`Scopes del token: ${t.scope ?? '(no reportados)'}`);

  const marca = new Date().toISOString().replace(/[:.]/g, '-');
  const dir = join(tmpdir(), 'thecoffee-analytics-zoho', marca);
  await mkdir(dir, { recursive: true });
  const max = Number(arg('max', '120'));
  let llamadas = 0;
  let orgId = '';
  const bitacora: { n: number; ruta: string; status: number; ms: number }[] = [];

  async function get<T>(ruta: string, config?: object): Promise<T | null> {
    if (!PERMITIDAS.some((p) => p.test(ruta)))
      throw new Error(`Bloqueado: GET ${ruta} no está en la lista de lectura`);
    if (llamadas >= max) throw new Error(`Presupuesto agotado (${max} llamadas)`);
    llamadas++;
    await new Promise((ok) => setTimeout(ok, 1100));
    const url = `${api}${ruta}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`;
    const inicio = Date.now();
    const x = await fetch(url, {
      headers: {
        Authorization: `Zoho-oauthtoken ${t.access_token}`,
        ...(orgId ? { 'ZANALYTICS-ORGID': orgId } : {}),
      },
    });
    const cuerpo = (await x.json().catch(() => ({}))) as { data?: T; data_?: unknown; summary?: string };
    bitacora.push({ n: llamadas, ruta, status: x.status, ms: Date.now() - inicio });
    await writeFile(
      join(dir, `${String(llamadas).padStart(3, '0')}-${ruta.replace(/\W+/g, '_')}.json`),
      JSON.stringify(cuerpo, null, 2),
    );
    if (!x.ok) {
      console.error(`  ${x.status} ${cuerpo.summary ?? ''} en ${ruta}`);
      if (x.status === 429 || cuerpo.summary?.includes('6045'))
        throw new Error('Límite de frecuencia de Zoho (6045)');
      return null;
    }
    return cuerpo.data ?? null;
  }

  const orgs = await get<{ orgs: { orgId: string; orgName: string; planName?: string }[] }>(
    '/restapi/v2/orgs',
  );
  const wss = await get<{ ownedWorkspaces?: Vista[]; sharedWorkspaces?: Vista[] }>('/restapi/v2/workspaces');
  const todos = [...(wss?.ownedWorkspaces ?? []), ...(wss?.sharedWorkspaces ?? [])] as unknown as {
    workspaceId: string;
    workspaceName: string;
    orgId: string;
  }[];
  const nombreWs = arg('workspace', 'The Coffee Oficial');
  const ws = todos.find((w) => w.workspaceName === nombreWs);
  console.log(
    `Orgs: ${orgs?.orgs?.length ?? 0}; workspaces: ${todos.length}; «${nombreWs}»: ${ws ? 'encontrado' : 'NO encontrado'}`,
  );
  if (!ws || process.argv.includes('--solo-acceso')) return cerrar();
  orgId = ws.orgId;
  const W = `/restapi/v2/workspaces/${ws.workspaceId}`;

  await get(W);
  await get(`${W}/folders`);
  await get(`${W}/datasources`);
  await get(`${W}/variables`); // exige ZohoAnalytics.modeling.read según la documentación; si falta, queda 400
  const vistas: Vista[] = [];
  for (let inicio = 1; ; inicio += 200) {
    const p = await get<{ views: Vista[] }>(`${W}/views`, { startIndex: inicio, noOfResult: 200 });
    vistas.push(...(p?.views ?? []));
    if (!p || p.views.length < 200) break;
  }
  const porTipo = vistas.reduce<Record<string, number>>(
    (a, v) => ((a[v.viewType] = (a[v.viewType] ?? 0) + 1), a),
    {},
  );
  console.log(`Vistas: ${vistas.length}`, porTipo);

  // Linaje desde el dashboard: detalle con involvedViews y bajada recursiva (BFS, sin repetir).
  const dash = vistas.find((v) => v.viewName === arg('dashboard', 'Dashboard The Coffee México'));
  if (!dash) console.log('Dashboard no encontrado por nombre exacto');
  const cola = dash ? [dash.viewId] : [];
  const visto = new Set<string>();
  while (cola.length && llamadas < max - 5) {
    const id = cola.shift()!;
    if (visto.has(id)) continue;
    visto.add(id);
    const d = await get<{ views: Vista & { involvedViews?: Vista[] } }>(`/restapi/v2/views/${id}`, {
      withInvolvedMetaInfo: true,
    });
    const v = d?.views;
    if (!v) continue;
    for (const h of v.involvedViews ?? []) if (!visto.has(h.viewId)) cola.push(h.viewId);
    if (/query/i.test(v.viewType)) await get(`${W}/querytables/${id}`);
    if (/^table$/i.test(v.viewType)) {
      await get(`${W}/views/${id}/customformulas`);
      await get(`${W}/views/${id}/aggregateformulas`);
      await get(`${W}/views/${id}/importdetails`);
    }
  }
  if (dash) await get(`${W}/views/${dash.viewId}/share/mypermissions`);
  return cerrar();

  async function cerrar() {
    await writeFile(join(dir, '000-bitacora.json'), JSON.stringify({ llamadas, max, bitacora }, null, 2));
    console.log(`Llamadas: ${llamadas}/${max}. Respuestas crudas en ${dir}`);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
