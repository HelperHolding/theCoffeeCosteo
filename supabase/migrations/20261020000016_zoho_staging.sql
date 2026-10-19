-- Staging privado de la importación desde Zoho: no se expone al Data API ni a usuarios del portal.
-- Solo lo usa el script local de importación con DATABASE_URL. Retención: borrar `registros` 90 días después del corte.
create schema zoho_staging;
revoke all on schema zoho_staging from public, anon, authenticated;

create table zoho_staging.importaciones (
  id uuid primary key default gen_random_uuid(),
  tipo text not null check (tipo in ('piloto', 'completa', 'archivos')),
  snapshot timestamptz not null,
  iniciada_en timestamptz not null default now(),
  terminada_en timestamptz,
  estado text not null default 'en_curso' check (estado in ('en_curso', 'completa', 'fallida', 'revertida')),
  conteos jsonb not null default '{}',
  errores jsonb not null default '[]',
  notas text
);

create table zoho_staging.registros (
  import_run_id uuid not null references zoho_staging.importaciones(id) on delete cascade,
  modulo text not null,
  zoho_id text not null,
  payload jsonb not null,
  hash text not null,
  leido_en timestamptz not null default now(),
  primary key (import_run_id, modulo, zoho_id)
);

revoke all on all tables in schema zoho_staging from public, anon, authenticated;
