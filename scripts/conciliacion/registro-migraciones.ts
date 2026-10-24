import { conLectura } from './db-lectura';

/** Fase 4 · Columnas del registro de migraciones y forma de la última fila (sin el texto de las sentencias). */
const { resultado } = await conLectura(async (q) => ({
  columnas: (await q(`select column_name, data_type from information_schema.columns
    where table_schema = 'supabase_migrations' and table_name = 'schema_migrations' order by ordinal_position`)).rows,
  ultima: (await q(`select version, name, cardinality(statements) as sentencias from supabase_migrations.schema_migrations
    order by version desc limit 3`).catch(() => ({ rows: [] }))).rows,
}));
console.log(JSON.stringify(resultado));
