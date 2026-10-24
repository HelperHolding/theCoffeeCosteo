import { conLectura } from './db-lectura';

/** Fase 2 · Paso 1: identidad del proyecto, rol, versión y migraciones aplicadas. Solo agregados. */
const { region, resultado } = await conLectura(async (q) => {
  const base = (
    await q(`select current_user as rol, current_setting('transaction_read_only') as solo_lectura,
                    split_part(version(), ' ', 2) as pg, current_database() as db`)
  ).rows[0];
  const migs = (
    await q(`select version, name from supabase_migrations.schema_migrations order by version`).catch(() => ({
      rows: [{ version: 'sin acceso', name: '' }],
    }))
  ).rows;
  return { base, migs };
});
console.log(JSON.stringify({ region, ...resultado }, null, 1));
