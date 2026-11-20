// Envío único (OK de Carlos, 2026-11-17): a cada usuario con correo real le llega «Elige tu contraseña del portal».
// Usa el correo de recuperación con una plantilla temporal y al final restaura la plantilla normal.
// Uso: npx tsx --conditions=react-server scripts/crm/enviar-contrasena-propia.ts correo1 correo2 ...
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';
import { revisarSitio } from './sitio-auth';

const correos = process.argv.slice(2);
if (!correos.length) throw new Error('Pasa los correos como argumentos.');
const env = await leerEnvLocal();
const url = env.get('NEXT_PUBLIC_SUPABASE_URL')!;
const ref = new URL(url).hostname.split('.')[0];
const config = async (method: 'GET' | 'PATCH', body?: object) => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/config/auth`, {
    method,
    headers: {
      Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!r.ok) throw new Error(`HTTP ${r.status}: ${(await r.text()).slice(0, 300)}`);
  return r.json();
};
const clave = env.get('NEXT_PUBLIC_SUPABASE_ANON_KEY') ?? env.get('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY')!;
const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms));

const normal = await config('GET');
revisarSitio(normal.site_url);
const original = {
  mailer_subjects_recovery: normal.mailer_subjects_recovery,
  mailer_templates_recovery_content: normal.mailer_templates_recovery_content,
};
const resultados: { correo: string; estado: number }[] = [];
try {
  await config('PATCH', {
    mailer_subjects_recovery: 'Elige tu contraseña del portal de The Coffee',
    mailer_templates_recovery_content: readFileSync('supabase/templates/contrasena-propia.html', 'utf8'),
  });
  for (const correo of correos) {
    const r = await fetch(`${url}/auth/v1/recover`, {
      method: 'POST',
      headers: { apikey: clave, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: correo }),
    });
    resultados.push({ correo, estado: r.status });
    await esperar(1500);
  }
} finally {
  await config('PATCH', original);
}
const despues = await config('GET');
console.table(resultados);
console.log(
  JSON.stringify({
    plantillaNormalRestaurada: despues.mailer_subjects_recovery === original.mailer_subjects_recovery,
  }),
);
