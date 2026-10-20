import { readFile } from 'node:fs/promises';

/**
 * Cliente mínimo de Zoho CRM v8 estrictamente de solo lectura.
 * Solo permite GET a /crm/v8/* y POST a /crm/v8/coql (consulta SELECT); cualquier otra
 * llamada lanza antes de salir a la red. Nunca imprime tokens.
 */
export type Env = Map<string, string>;

export async function leerEnvLocal(archivo = '.env.local'): Promise<Env> {
  const env: Env = new Map();
  for (const linea of (await readFile(archivo, 'utf8')).split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m && m[2]) env.set(m[1], m[2].replace(/^["']|["']$/g, ''));
  }
  return env;
}

export class ErrorZoho extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    readonly ruta: string,
  ) {
    super(`Zoho ${status} ${code} en ${ruta}`);
  }
}

export class ClienteZoho {
  private token: string | null = null;
  private vence = 0;
  llamadas = 0;
  /** Reintentos (de 60 s) cuando Zoho limita la renovación del token. */
  reintentosToken = 12;

  constructor(private readonly env: Env) {
    for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_REFRESH_TOKEN', 'ZOHO_API_DOMAIN']) {
      if (!env.get(k)) throw new Error(`Falta ${k} en .env.local`);
    }
  }

  private async accessToken(): Promise<string> {
    if (this.token && Date.now() < this.vence) return this.token;
    const cuentas = this.env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com';
    let t: { access_token?: string; expires_in?: number; error?: string } = {};
    // Zoho limita las renovaciones por refresh token (~10 cada 10 min) y responde "Access Denied":
    // se espera y reintenta en lugar de cortar una corrida a la mitad.
    for (let intento = 0; ; intento++) {
      const r = await fetch(`${cuentas}/oauth/v2/token`, {
        method: 'POST',
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: this.env.get('ZOHO_REFRESH_TOKEN')!,
          client_id: this.env.get('ZOHO_CLIENT_ID')!,
          client_secret: this.env.get('ZOHO_CLIENT_SECRET')!,
        }),
      });
      t = (await r.json().catch(() => ({}))) as typeof t;
      if (t.access_token || t.error !== 'Access Denied' || intento >= this.reintentosToken) break;
      console.error(
        `Zoho limitó la renovación del token; reintento en 60 s (${intento + 1}/${this.reintentosToken}).`,
      );
      await new Promise((ok) => setTimeout(ok, 60_000));
    }
    if (!t.access_token)
      throw new Error(`No se pudo renovar el access token (${t.error ?? 'sin respuesta'})`);
    this.token = t.access_token;
    this.vence = Date.now() + ((t.expires_in ?? 3600) - 120) * 1000;
    return this.token;
  }

  private async pedir(metodo: 'GET' | 'POST', ruta: string, cuerpo?: unknown): Promise<unknown> {
    const esCoql = metodo === 'POST' && ruta === '/crm/v8/coql';
    if (!(metodo === 'GET' && ruta.startsWith('/crm/v8/')) && !esCoql) {
      throw new Error(`Bloqueado: ${metodo} ${ruta} no es una lectura permitida`);
    }
    if (esCoql) {
      const q = String((cuerpo as { select_query?: string })?.select_query ?? '');
      if (!/^\s*select\s/i.test(q)) throw new Error('Bloqueado: COQL solo admite SELECT');
    }
    for (let intento = 0; ; intento++) {
      this.llamadas++;
      const r = await fetch(`${this.env.get('ZOHO_API_DOMAIN')}${ruta}`, {
        method: metodo,
        headers: {
          Authorization: `Zoho-oauthtoken ${await this.accessToken()}`,
          ...(cuerpo ? { 'Content-Type': 'application/json' } : {}),
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      if (r.status === 204) return null;
      if (r.status === 429 && intento < 4) {
        await new Promise((ok) => setTimeout(ok, 2000 * (intento + 1)));
        continue;
      }
      const j = (await r.json().catch(() => ({}))) as { code?: string };
      if (!r.ok) throw new ErrorZoho(r.status, j.code ?? 'SIN_CODIGO', ruta.split('?')[0]);
      return j;
    }
  }

  get<T = unknown>(ruta: string): Promise<T | null> {
    return this.pedir('GET', ruta) as Promise<T | null>;
  }

  /** Descarga binaria (adjuntos y campos de archivo). Mismo candado: solo GET a /crm/v8/*. */
  async descargar(ruta: string): Promise<{ datos: Buffer; tipo: string | null }> {
    if (!ruta.startsWith('/crm/v8/')) throw new Error(`Bloqueado: GET ${ruta} no es una lectura permitida`);
    for (let intento = 0; ; intento++) {
      this.llamadas++;
      const r = await fetch(`${this.env.get('ZOHO_API_DOMAIN')}${ruta}`, {
        headers: { Authorization: `Zoho-oauthtoken ${await this.accessToken()}` },
      });
      if (r.status === 429 && intento < 4) {
        await new Promise((ok) => setTimeout(ok, 2000 * (intento + 1)));
        continue;
      }
      if (!r.ok) {
        const j = (await r.json().catch(() => ({}))) as { code?: string };
        throw new ErrorZoho(r.status, j.code ?? 'SIN_CODIGO', ruta.split('?')[0]);
      }
      return { datos: Buffer.from(await r.arrayBuffer()), tipo: r.headers.get('content-type') };
    }
  }

  /** COQL paginado (máx. 2,000 por página, según la prueba de la Fase 2). */
  async coqlTodo<T = Record<string, unknown>>(select: string, desde: string, donde: string): Promise<T[]> {
    const filas: T[] = [];
    for (let offset = 0; ; offset += 2000) {
      const q = `${select} from ${desde} where ${donde} order by id limit ${offset}, 2000`;
      const r = (await this.pedir('POST', '/crm/v8/coql', { select_query: q })) as {
        data?: T[];
        info?: { more_records?: boolean };
      } | null;
      filas.push(...(r?.data ?? []));
      if (!r?.info?.more_records) return filas;
    }
  }

  coql<T = Record<string, unknown>>(query: string): Promise<{ data?: T[] } | null> {
    return this.pedir('POST', '/crm/v8/coql', { select_query: query }) as Promise<{ data?: T[] } | null>;
  }
}
