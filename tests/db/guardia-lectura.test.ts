import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';

// Una lectura solo puede abrirse por rol de Costeo, por módulo (CRM, Sucursales, BI) o a la fila propia.
const PREDICADOS = [
  /tiene_rol\(/,
  /crm_puede_leer\(\)/,
  /sucursales_[a-z_]+\(/,
  /bi_[a-z_]+\(/,
  /user_id = (\( SELECT )?auth\.uid\(\)/,
];
const TIENE_ROL_EXTERNO = /tiene_rol\([^)]*'(interno|franquiciado|proveedor)'/;

interface Politica {
  objeto: string;
  qual: string | null;
  with_check: string | null;
}

async function politicasLectura(db: PGlite): Promise<Politica[]> {
  const r = await db.query<Politica>(`
    select schemaname || '.' || tablename || ':' || policyname as objeto, qual, with_check
    from pg_policies
    where permissive = 'PERMISSIVE' and cmd in ('SELECT', 'ALL')
      and roles && array['authenticated', 'anon', 'public']::name[]`);
  return r.rows;
}

const abiertas = (ps: Politica[]) =>
  ps.filter((p) => !p.qual || !PREDICADOS.some((re) => re.test(p.qual!))).map((p) => p.objeto);

describe('guardia de lecturas', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
  });

  it('ninguna lectura queda abierta sin predicado de rol, módulo o fila propia', async () => {
    expect(abiertas(await politicasLectura(db))).toEqual([]);
  });

  it('ningún tiene_rol abre datos a roles externos', async () => {
    const malas = (await politicasLectura(db))
      .filter((p) => TIENE_ROL_EXTERNO.test(`${p.qual ?? ''} ${p.with_check ?? ''}`))
      .map((p) => p.objeto);
    expect(malas).toEqual([]);
  });

  it('toda vista de public es security_invoker (hereda la RLS de sus tablas)', async () => {
    const r = await db.query<{ vista: string }>(`
      select c.relname as vista from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'v'
        and not coalesce('security_invoker=true' = any (c.reloptions), false)`);
    expect(r.rows.map((f) => f.vista)).toEqual([]);
  });

  it('los esquemas privados no se exponen a usuarios', async () => {
    const r = await db.query<{ esquema: string }>(`
      select e as esquema from unnest(array['migracion_legado', 'zoho_staging']) e
      where has_schema_privilege('authenticated', e, 'USAGE') or has_schema_privilege('anon', e, 'USAGE')`);
    expect(r.rows).toEqual([]);
  });
});

describe('la guardia detecta', () => {
  it('una política abierta a cualquier perfil activo', async () => {
    const db = await crearDbLocal();
    await db.exec(`
      create table public.prueba_abierta (id int);
      alter table public.prueba_abierta enable row level security;
      create policy lectura on public.prueba_abierta for select to authenticated
        using (public.rol_actual() is not null);`);
    expect(abiertas(await politicasLectura(db))).toEqual(['public.prueba_abierta:lectura']);
  });

  it('un tiene_rol con un rol externo', async () => {
    const db = await crearDbLocal();
    await db.exec(`
      create table public.prueba_externa (id int);
      alter table public.prueba_externa enable row level security;
      create policy lectura on public.prueba_externa for select to authenticated
        using (public.tiene_rol('admin', 'franquiciado'));`);
    const malas = (await politicasLectura(db)).filter((p) => TIENE_ROL_EXTERNO.test(p.qual ?? ''));
    expect(malas.map((p) => p.objeto)).toEqual(['public.prueba_externa:lectura']);
  });
});
