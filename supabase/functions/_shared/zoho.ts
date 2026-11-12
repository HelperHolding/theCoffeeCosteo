export type ZohoCfg = {
  clientId: string; clientSecret: string; refreshToken: string; orgId: string;
  accountsUrl?: string; apiUrl?: string; fetchFn?: typeof fetch; sleep?: (ms: number) => Promise<void>;
};

export class ZohoError extends Error {
  constructor(message: string, public status: number, public code?: number) { super(message); }
}

const REINTENTOS = 3;

export class ZohoClient {
  private token: string | null = null;
  private vence = 0;
  private f: typeof fetch;
  private sleep: (ms: number) => Promise<void>;
  private accounts: string;
  private api: string;
  llamadas = 0;

  constructor(private cfg: ZohoCfg) {
    this.f = cfg.fetchFn ?? fetch;
    this.sleep = cfg.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.accounts = cfg.accountsUrl ?? "https://accounts.zoho.com";
    this.api = cfg.apiUrl ?? "https://www.zohoapis.com/books/v3";
  }

  private async obtenerToken(forzar = false): Promise<string> {
    if (!forzar && this.token && Date.now() < this.vence) return this.token;
    const q = new URLSearchParams({
      refresh_token: this.cfg.refreshToken, client_id: this.cfg.clientId,
      client_secret: this.cfg.clientSecret, grant_type: "refresh_token",
    });
    const r = await this.f(`${this.accounts}/oauth/v2/token?${q}`, { method: "POST" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.access_token) throw new ZohoError(`token Zoho: ${j.error ?? r.status}`, r.status);
    this.token = j.access_token;
    this.vence = Date.now() + (Number(j.expires_in ?? 3600) - 120) * 1000;
    return this.token!;
  }

  private async pedir<T>(method: string, path: string, params: Record<string, string>, body?: unknown): Promise<T> {
    const q = new URLSearchParams({ organization_id: this.cfg.orgId, ...params });
    const url = `${this.api}${path}?${q}`;
    let refrescado = false;
    for (let intento = 0; ; intento++) {
      const tk = await this.obtenerToken();
      this.llamadas++;
      const r = await this.f(url, {
        method,
        headers: { Authorization: `Zoho-oauthtoken ${tk}`, "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      if (r.status === 401 && !refrescado) { refrescado = true; this.llamadas--; await this.obtenerToken(true); continue; }
      // Solo GET reintenta 5xx: un POST con 5xx puede haberse procesado ya (OC duplicada).
      // 429 significa que Zoho no procesó la petición, así que sí se reintenta en cualquier método.
      const reintentable = r.status === 429 || (r.status >= 500 && method === "GET");
      if (reintentable && intento < REINTENTOS - 1) {
        await this.sleep(1000 * 2 ** intento);
        continue;
      }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j.code !== undefined && j.code !== 0)) {
        throw new ZohoError(j.message ?? `Zoho HTTP ${r.status}`, r.status, j.code);
      }
      return j as T;
    }
  }

  get<T>(path: string, params: Record<string, string> = {}): Promise<T> {
    return this.pedir<T>("GET", path, params);
  }

  post<T>(path: string, body: unknown): Promise<T> {
    return this.pedir<T>("POST", path, {}, body);
  }

  /** Igual que post: no reintenta 5xx (la escritura pudo haberse aplicado ya). */
  put<T>(path: string, body: unknown): Promise<T> {
    return this.pedir<T>("PUT", path, {}, body);
  }

  async listAll<T>(path: string, key: string, params: Record<string, string> = {}): Promise<T[]> {
    const out: T[] = [];
    for (let page = 1; ; page++) {
      const j = await this.get<Record<string, unknown>>(path, { ...params, page: String(page), per_page: "200" });
      out.push(...((j[key] as T[]) ?? []));
      const pc = j.page_context as { has_more_page?: boolean } | undefined;
      if (!pc?.has_more_page) return out;
    }
  }
}

export function zohoDesdeEnv(): ZohoClient {
  const v = (k: string) => {
    const x = Deno.env.get(k);
    if (!x) throw new Error(`Falta el secreto ${k}`);
    return x;
  };
  return new ZohoClient({
    clientId: v("ZOHO_CLIENT_ID"), clientSecret: v("ZOHO_CLIENT_SECRET"),
    refreshToken: v("ZOHO_REFRESH_TOKEN"), orgId: v("ZOHO_ORG_ID"),
  });
}
