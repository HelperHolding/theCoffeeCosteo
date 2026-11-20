// Solo lectura: compara supabase_migrations.schema_migrations (vía API de administración) con supabase/migrations/.
import { readdirSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

const env = await leerEnvLocal();
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    query:
      'begin read only; select version, name from supabase_migrations.schema_migrations order by version; ',
  }),
});
const base = (await r.json()) as { version: string; name: string }[];
if (!r.ok || !Array.isArray(base)) throw new Error(JSON.stringify(base).slice(0, 300));
const repo = readdirSync('supabase/migrations').filter((f) => f.endsWith('.sql'));
const vr = repo.map((f) => f.slice(0, 14));
const enBase = new Set(base.map((b) => b.version));
console.log(
  JSON.stringify(
    {
      base: { total: base.length, ultimas: base.slice(-6) },
      repo: { total: repo.length, ultimas: repo.slice(-6) },
      soloEnRepo: repo.filter((f) => !enBase.has(f.slice(0, 14))),
      soloEnBase: base.filter((b) => !vr.includes(b.version)),
      duplicadasEnRepo: vr.filter((v, i, a) => a.indexOf(v) !== i),
    },
    null,
    1,
  ),
);
