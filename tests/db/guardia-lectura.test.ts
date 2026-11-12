import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';

// Una lectura solo puede abrirse por rol de Costeo, por módulo (CRM, Sucursales, BI) o a la fila propia.
const PREDICADOS = [
  /tiene_rol\(/,
  /crm_puede_leer\(\)/,
  /com_puede_leer\(\)/,
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

/** ¿El paréntesis inicial cierra justo al final? Entonces envuelve toda la expresión. */
function envuelta(e: string): boolean {
  if (!e.startsWith('(') || !e.endsWith(')')) return false;
  let d = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === '(') d++;
    else if (e[i] === ')' && --d === 0 && i < e.length - 1) return false;
  }
  return true;
}

/** Ramas de un OR al nivel superior (como lo deparsea Postgres): cada una debe abrir solo con un predicado. */
function ramasOr(expr: string): string[] {
  let e = expr.trim();
  while (envuelta(e)) e = e.slice(1, -1).trim();
  const ramas: string[] = [];
  let d = 0;
  let inicio = 0;
  for (let i = 0; i < e.length; i++) {
    if (e[i] === '(') d++;
    else if (e[i] === ')') d--;
    else if (d === 0 && e.startsWith(' OR ', i)) {
      ramas.push(e.slice(inicio, i));
      inicio = i + 4;
    }
  }
  ramas.push(e.slice(inicio));
  return ramas.length > 1 ? ramas.flatMap(ramasOr) : ramas;
}

const abiertas = (ps: Politica[]) =>
  ps
    .filter((p) => !p.qual || ramasOr(p.qual).some((rama) => !PREDICADOS.some((re) => re.test(rama))))
    .map((p) => p.objeto);
const abiertasEn = async (db: PGlite) => abiertas(await politicasLectura(db));

async function tablasSinRls(db: PGlite): Promise<string[]> {
  const r = await db.query<{ tabla: string }>(`
    select c.relname as tabla from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relrowsecurity order by 1`);
  return r.rows.map((f) => f.tabla);
}

/** Las vistas materializadas no tienen RLS: ninguna puede ser legible por usuarios. */
async function matviewsLegibles(db: PGlite): Promise<string[]> {
  const r = await db.query<{ vista: string }>(`
    select c.relname as vista from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'm'
      and (has_table_privilege('authenticated', c.oid, 'SELECT') or has_table_privilege('anon', c.oid, 'SELECT'))
    order by 1`);
  return r.rows.map((f) => f.vista);
}

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

  it('toda tabla de public tiene RLS', async () => {
    expect(await tablasSinRls(db)).toEqual([]);
  });

  it('ninguna vista materializada de public es legible por usuarios', async () => {
    expect(await matviewsLegibles(db)).toEqual([]);
  });

  it('los esquemas privados no se exponen a usuarios', async () => {
    const r = await db.query<{ esquema: string }>(`
      select e as esquema from unnest(array['migracion_legado', 'zoho_staging', 'legado']) e
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

describe('la guardia también detecta', () => {
  it('una rama OR sin predicado escondida junto a uno válido', async () => {
    const db = await crearDbLocal();
    await db.exec(`
      create table public.prueba_or (id int, user_id uuid);
      alter table public.prueba_or enable row level security;
      create policy lectura on public.prueba_or for select to authenticated
        using (public.tiene_rol('admin') or true);
      create policy propia on public.prueba_or for select to authenticated
        using (user_id = (select auth.uid()) or public.rol_actual() is not null);`);
    expect((await abiertasEn(db)).sort()).toEqual(['public.prueba_or:lectura', 'public.prueba_or:propia']);
  });

  it('una tabla nueva sin RLS (queda abierta por los permisos por defecto de Supabase)', async () => {
    const db = await crearDbLocal();
    await db.exec(`create table public.prueba_sin_rls (id int);`);
    expect(await tablasSinRls(db)).toEqual(['prueba_sin_rls']);
  });

  it('una vista materializada legible por usuarios', async () => {
    const db = await crearDbLocal();
    await db.exec(`create materialized view public.prueba_mv as select 1 as x;
      grant select on public.prueba_mv to authenticated;`);
    expect(await matviewsLegibles(db)).toEqual(['prueba_mv']);
  });
});
