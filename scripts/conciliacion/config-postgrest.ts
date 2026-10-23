import { conLectura } from './db-lectura';

/** Fase 3 · Lee la configuración de PostgREST guardada en el rol authenticator (solo claves pgrst.*). */
const { resultado } = await conLectura(async (q) =>
  (await q(`select unnest(rolconfig) as ajuste from pg_roles where rolname = 'authenticator'`)).rows
    .map((r) => String(r.ajuste)).filter((a) => a.startsWith('pgrst.')),
);
console.log(JSON.stringify(resultado));
