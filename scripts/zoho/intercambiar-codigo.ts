import { readFile, writeFile } from 'node:fs/promises';

/**
 * Canjea el código de un Self Client de Zoho por un refresh token de solo lectura.
 * Lee y escribe `.env.local` (ignorado por git) y nunca imprime tokens ni secretos.
 * Después confirma la organización con GET /crm/v8/org (scope ZohoCRM.org.READ).
 *
 * Uso: npx tsx scripts/zoho/intercambiar-codigo.ts
 */
const ARCHIVO = '.env.local';

function leerEnv(texto: string): Map<string, string> {
  const env = new Map<string, string>();
  for (const linea of texto.split(/\r?\n/)) {
    const m = /^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/.exec(linea);
    if (m) env.set(m[1], m[2].replace(/^["']|["']$/g, ''));
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

async function main() {
  let texto: string;
  try {
    texto = await readFile(ARCHIVO, 'utf8');
  } catch {
    throw new Error(`No existe ${ARCHIVO}: créalo con ZOHO_CLIENT_ID, ZOHO_CLIENT_SECRET y ZOHO_GRANT_CODE`);
  }
  const env = leerEnv(texto);
  const faltan = ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_GRANT_CODE'].filter((k) => !env.get(k));
  if (faltan.length) throw new Error(`Faltan en ${ARCHIVO}: ${faltan.join(', ')}`);
  const cuentas = env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com';

  const r = await fetch(`${cuentas}/oauth/v2/token`, {
    method: 'POST',
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: env.get('ZOHO_CLIENT_ID')!,
      client_secret: env.get('ZOHO_CLIENT_SECRET')!,
      code: env.get('ZOHO_GRANT_CODE')!,
    }),
  });
  const t = (await r.json()) as {
    access_token?: string;
    refresh_token?: string;
    api_domain?: string;
    error?: string;
  };
  if (!r.ok || t.error || !t.refresh_token || !t.access_token) {
    throw new Error(
      `Zoho rechazó el código (HTTP ${r.status}, ${t.error ?? 'sin refresh_token'}). Genera uno nuevo y reintenta.`,
    );
  }
  const apiDomain = t.api_domain || 'https://www.zohoapis.com';

  // El código ya se gastó: guarda el refresh token antes de cualquier otra llamada.
  texto = fijar(texto, 'ZOHO_GRANT_CODE', null);
  texto = fijar(texto, 'ZOHO_REFRESH_TOKEN', t.refresh_token);
  texto = fijar(texto, 'ZOHO_API_DOMAIN', apiDomain);
  await writeFile(ARCHIVO, texto);
  console.log(`Refresh token guardado en ${ARCHIVO} (no se imprime). API: ${apiDomain}`);

  const o = await fetch(`${apiDomain}/crm/v8/org`, {
    headers: { Authorization: `Zoho-oauthtoken ${t.access_token}` },
  });
  const org = (await o.json().catch(() => ({}))) as {
    org?: {
      id?: string;
      company_name?: string;
      domain_name?: string;
      time_zone?: string;
      country_code?: string;
      type?: string;
      license_details?: { paid_type?: string };
    }[];
    code?: string;
  };
  const datos = org.org?.[0];
  if (!o.ok || !datos) {
    console.log(
      `No se pudo leer /org (HTTP ${o.status}, ${org.code ?? 'sin datos'}): revisa el scope ZohoCRM.org.READ.`,
    );
    return;
  }
  if (datos.id) await writeFile(ARCHIVO, fijar(texto, 'ZOHO_ORG_ID', datos.id));
  console.log('Organización:', {
    empresa: datos.company_name,
    dominio: datos.domain_name,
    zona_horaria: datos.time_zone,
    pais: datos.country_code,
    entorno: datos.type,
    edicion: datos.license_details?.paid_type,
  });
}

main().catch((e: Error) => {
  console.error(e.message);
  process.exit(1);
});
