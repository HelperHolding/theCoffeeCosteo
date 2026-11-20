// Configura los correos de Supabase Auth por la API de administración (con OK de Carlos, 2026-11-17):
// URL del sitio en el dominio propio (sitio-auth.ts), redirecciones y plantillas en español de invitación y recuperación.
// Guarda un respaldo de los valores anteriores (sin secretos) para revertir con --revertir <archivo>.
// El SMTP no se toca: lo configuró Carlos en el panel.
import { readFileSync, writeFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';
import { SITIO, SITIOS_PERMITIDOS } from './sitio-auth';

const env = await leerEnvLocal();
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const api = async (method: 'GET' | 'PATCH', body?: object) => {
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

const CAMPOS = [
  'site_url',
  'uri_allow_list',
  'mailer_subjects_invite',
  'mailer_templates_invite_content',
  'mailer_subjects_recovery',
  'mailer_templates_recovery_content',
] as const;

const i = process.argv.indexOf('--revertir');
if (i > 0) {
  const respaldo = JSON.parse(readFileSync(process.argv[i + 1], 'utf8'));
  await api('PATCH', respaldo);
  console.log('Revertido a', process.argv[i + 1]);
  process.exit(0);
}

const actual = await api('GET');
const respaldo = Object.fromEntries(CAMPOS.map((k) => [k, actual[k]]));
const archivo = `respaldo-auth-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(process.argv[2] ?? archivo, JSON.stringify(respaldo, null, 2));

const lista = String(actual.uri_allow_list ?? '')
  .split(',')
  .filter(Boolean);
for (const sitio of SITIOS_PERMITIDOS)
  for (const u of [`${sitio}/`, `${sitio}/**`]) if (!lista.includes(u)) lista.push(u);

await api('PATCH', {
  site_url: SITIO,
  uri_allow_list: lista.join(','),
  mailer_subjects_invite: 'Te invitaron al portal de The Coffee',
  mailer_templates_invite_content: readFileSync('supabase/templates/invite.html', 'utf8'),
  mailer_subjects_recovery: 'Elige una contraseña nueva para el portal de The Coffee',
  mailer_templates_recovery_content: readFileSync('supabase/templates/recovery.html', 'utf8'),
});

const despues = await api('GET');
console.log(
  JSON.stringify({
    respaldo: process.argv[2] ?? archivo,
    site_url: despues.site_url,
    redirecciones: String(despues.uri_allow_list).split(',').length,
    incluyePortal: String(despues.uri_allow_list).includes(`${SITIO}/**`),
    asuntoInvitacion: despues.mailer_subjects_invite,
    asuntoRecuperacion: despues.mailer_subjects_recovery,
    plantillaInvitacionOk: String(despues.mailer_templates_invite_content).includes('type=invite'),
    plantillaRecuperacionOk: String(despues.mailer_templates_recovery_content).includes('type=recovery'),
    smtpIntacto:
      despues.smtp_host === 'smtp.gmail.com' && despues.smtp_admin_email === 'notificaciones@mx.thecoffee.jp',
  }),
);
