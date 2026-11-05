# Consumo nacional de ingredientes por mes — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Una pestaña «Consumo» en el Tablero México que muestra, por mes, cuánto se consumió de cada ingrediente en
las sucursales del usuario (todas = México), con el mismo cálculo exacto que la sección Consumo de cada sucursal.

**Architecture:**

- Un script (`scripts/sucursales/consumo-mes.ts`) lee los pedidos de un mes cerrado de cada sucursal con las mismas
  funciones que su página. Aplica `consumir` por origen y guarda el resultado con la llave de servicio, a través de
  una RPC atómica de la migración 38.
- El portal lee dos RPC con acceso por sucursal: un resumen nacional ligero y un desglose por sucursal. Arma la vista
  en el cliente (filtro de origen, categorías, presentaciones, mes anterior), igual que el resto del Tablero México.

**Tech Stack:** Next.js (App Router; leer `node_modules/next/dist/docs/` antes de tocar rutas o páginas), Supabase
Postgres, PGlite + Vitest, React, SheetJS (`xlsx`), Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-04-consumo-nacional-design.md`

## Global Constraints

- **Idioma:** textos, nombres de funciones y comentarios en español, como el resto del módulo Sucursales.
- **Exactitud:** cantidades iguales a las de la sección Consumo de cada sucursal. Se usa `consumir` sin cambiar su
  lógica.
- **Solo cantidades,** nunca dinero (como la sección Consumo).
- **Tablas cerradas:** `revoke all` a `anon` y `authenticated`. Solo se escriben con la llave de servicio, por la RPC
  `sucursales_guardar_consumo_mes` (solo `service_role`).
- **Lectura:** todas las RPC de lectura filtran con `public.sucursales_acceso(company_id)`.
- **Origen:** se guarda `mostrador`, `app`, `rappi` o `desconocido` (`Origen`). «Todos» suma los cuatro.
- **Mes cerrado:** solo meses anteriores al mes actual en `America/Mexico_City`. Formato `AAAA-MM`; en la base, el
  primer día del mes.
- **Seguridad:**
  - nunca se escribe `.env.local`;
  - no se ejecutan `supabase db push`, `link` ni el script contra producción: eso lo hace Sebastián;
  - sin merge a `main` sin OK.
- **Migración:** `supabase/migrations/20261105000038_sucursales_consumo_mes.sql`.

## Review Focus

1. **Rappi de un mes completo truncado a 1,000 filas.** PostgREST de Supabase limita las respuestas a 1,000 filas, y
   `rappiServicio` pide hasta 5,000 en una sola llamada. El script lee Rappi **día por día** (`rappiPorDias`). Si un
   día falla, la lectura queda parcial; nunca se pierden pedidos en silencio. Prueba en Task 3.
2. **Mes en curso o futuro.** Debe rechazarse con un mensaje claro; nunca guardar medio mes como si estuviera cerrado.
   Pruebas en Task 2 (`mesCerrado`) y Task 3 (script).
3. **Recalcular un mes.** Debe reemplazar, nunca duplicar ni dejar insumos viejos que ya no se consumen. Prueba en
   Task 1.
4. **Usuario con algunas sucursales.** La suma, los meses y el mes anterior son solo de sus sucursales. El mes
   anterior se compara solo con las sucursales que lo tienen calculado. Pruebas en Tasks 1 y 4.
5. **Insumo desactivado o borrado** después del cálculo: su consumo se sigue mostrando, sin presentación. Pruebas en
   Tasks 1 y 4.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261105000038_sucursales_consumo_mes.sql` | Tablas, función interna de recetas, RPC de guardado y las dos RPC de lectura |
| `lib/sucursales/consumo-mes.ts` | Puro: días del mes, mes cerrado, `consumoMesSucursal` (pedidos → renglones del mes por origen), `rappiPorDias` |
| `lib/sucursales/consumo-mes-servidor.ts` | Servidor: lee recetas y catálogo con la llave de servicio, recorre sucursales y guarda (dependencias inyectables) |
| `lib/sucursales/consumo-servidor.ts` | (modificar) extraer `datosConsumoDeRpc` para reusar el armado de recetas |
| `lib/sucursales/corte-servidor.ts` | (modificar) exportar `catalogoServicio` (hoy `catalogo`, privado) |
| `scripts/sucursales/consumo-mes.ts` | CLI: `--mes AAAA-MM [--companias …]` |
| `lib/sucursales/consumo-nacional.ts` | Puro: de la RPC al contrato (`armarConsumoNacional`), vista por origen (`vistaConsumo`), desglose (`armarDesglose`) |
| `lib/sucursales/contratos.ts` | (modificar) tipos `ConsumoNacional` y `DesgloseConsumo` |
| `app/api/sucursales/consumo-nacional/route.ts` | GET `?mes=AAAA-MM` |
| `app/api/sucursales/consumo-nacional/desglose/route.ts` | GET `?mes=AAAA-MM[&insumo=uuid]` |
| `components/sucursales/consumo-nacional.tsx` | UI de la pestaña Consumo (meses, origen, números, tabla, desglose, sin receta, exportar) |
| `components/sucursales/vistas-mexico.tsx` | Selector Ventas / Consumo (`?vista=consumo`) |
| `app/(sucursales)/sucursales/mexico/page.tsx` | (modificar) usar `VistasMexico` |
| `tests/portal/vista/tablero-mexico.tsx` | (modificar) datos sintéticos para las dos rutas nuevas |
| `docs/sucursales/17-CONSUMO-NACIONAL.md` | Qué hace, cómo se corre y pasos en producción |

---

### Task 1: Migración 38 — tablas, recetas para el servidor y RPC

**Files:**
- Create: `supabase/migrations/20261105000038_sucursales_consumo_mes.sql`
- Test: `tests/db/sucursales-consumo-mes.test.ts`

**Interfaces:**
- Produces (SQL):
  - `public.sucursales_recetas_consumo_datos() returns jsonb`, el mismo JSON que `sucursales_recetas_consumo`
    (enlaces, unicas, tamanos, insumos, lineas, sustitutos). Solo `service_role`.
  - `public.sucursales_recetas_consumo(p_company integer) returns jsonb`: igual que hoy; llama a la interna tras
    `sucursales_acceso`.
  - `public.sucursales_guardar_consumo_mes(p_mes date, p_company integer, p_meta jsonb, p_insumos jsonb) returns
    integer`, solo `service_role`, con:
    - `p_meta` = `{completa, recetas_leidas_en, cobertura, sin_receta}`;
    - `p_insumos` = `[{origen, insumo_id, insumo, unidad, categoria, cantidad}]`;
    - devuelve los renglones escritos.
  - `public.sucursales_consumo_nacional(p_mes date, p_companias integer[]) returns jsonb`, con:
    - `meses`: date[] descendente;
    - `sucursales`: `[{company_id, calculado_en, recetas_leidas_en, completa, cobertura, sin_receta}]`;
    - `insumos`: `[{insumo_id, insumo, unidad, categoria, presentacion, origen, cantidad, sucursales}]`;
    - `anterior`: `[{insumo_id, origen, cantidad}]`;
    - `sucursales_anterior`: integer.
  - `public.sucursales_consumo_desglose(p_mes date, p_companias integer[], p_insumo uuid) returns jsonb`: `[{company_id,
    insumo_id, origen, cantidad}]`.

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/db/sucursales-consumo-mes.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 38: consumo nacional por mes. Tablas cerradas; se escribe por RPC de servicio y se lee con acceso.
let db: PGlite;
let gdl: string;
let ajeno: string;
let leche: string;
let cafe: string;

const meta = (completa = true) =>
  JSON.stringify({
    completa,
    recetas_leidas_en: '2026-11-05T12:00:00Z',
    cobertura: { mostrador: { lineas: 10, incluidas: 8, generico: 1, sinCodigo: 0, sinEnlace: 1 } },
    sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }] },
  });
const fila = (origen: string, insumoId: string, insumo: string, cantidad: number, unidad = 'ml') => ({
  origen,
  insumo_id: insumoId,
  insumo,
  unidad,
  categoria: 'LECHE',
  cantidad,
});
const guardar = async (mes: string, company: number, filas: unknown[], completa = true) => {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ n: number }>('select public.sucursales_guardar_consumo_mes($1, $2, $3, $4) n', [
        mes,
        company,
        meta(completa),
        JSON.stringify(filas),
      ])
    ).rows[0].n;
  } finally {
    await db.exec('reset role');
  }
};
type Nacional = {
  meses: string[];
  sucursales: { company_id: number; completa: boolean }[];
  insumos: { insumo_id: string; origen: string; cantidad: number; presentacion: number | null; sucursales: number }[];
  anterior: { insumo_id: string; origen: string; cantidad: number }[];
  sucursales_anterior: number;
};
const nacional = (u: string, mes: string, companias: number[]) =>
  comoUsuario(
    db,
    u,
    async () =>
      (await db.query<{ r: Nacional }>('select public.sucursales_consumo_nacional($1, $2) r', [mes, companias]))
        .rows[0].r,
  );
const desglose = (u: string, mes: string, companias: number[], insumo: string | null) =>
  comoUsuario(
    db,
    u,
    async () =>
      (
        await db.query<{ r: { company_id: number; insumo_id: string; origen: string; cantidad: number }[] }>(
          'select public.sucursales_consumo_desglose($1, $2, $3) r',
          [mes, companias, insumo],
        )
      ).rows[0].r,
  );

beforeAll(async () => {
  db = await crearDbLocal();
  gdl = await crearUsuario(db, 'sucursales');
  ajeno = await crearUsuario(db, 'sucursales');
  for (const u of [gdl, ajeno])
    await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`, [u]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($1, 384), ($2, 532)', [
    gdl,
    ajeno,
  ]);
  // Dos insumos reales del catálogo local (la migración 2 los siembra); si no existen, se crean.
  const r = await db.query<{ id: string; nombre: string }>(
    `select id, nombre from insumos where nombre in ('LECHE ENTERA', 'CAFÉ TOSTADO EN GRANO BLACK 1.5 KG')`,
  );
  leche = r.rows.find((x) => x.nombre === 'LECHE ENTERA')!.id;
  cafe = r.rows.find((x) => x.nombre !== 'LECHE ENTERA')!.id;

  await guardar('2026-10-01', 513, [fila('mostrador', leche, 'LECHE ENTERA', 1000), fila('rappi', leche, 'LECHE ENTERA', 200)]);
  await guardar('2026-10-01', 384, [fila('mostrador', leche, 'LECHE ENTERA', 500), fila('app', cafe, 'CAFÉ', 36, 'gr')], false);
  await guardar('2026-10-01', 532, [fila('mostrador', leche, 'LECHE ENTERA', 9999)]);
  await guardar('2026-09-01', 513, [fila('mostrador', leche, 'LECHE ENTERA', 800)]);
});
afterAll(async () => db.close());

describe('migración 38: consumo nacional por mes', () => {
  it('tablas y funciones internas cerradas al portal', async () => {
    await expect(comoUsuario(db, gdl, () => db.query('select * from sucursales_consumo_mes'))).rejects.toThrow(
      /permission denied/,
    );
    await expect(
      comoUsuario(db, gdl, () => db.query('select * from sucursales_consumo_mes_sucursal')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, gdl, () => db.query('select public.sucursales_recetas_consumo_datos()')),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, gdl, () =>
        db.query(`select public.sucursales_guardar_consumo_mes('2026-10-01', 513, '{}', '[]')`),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('la RPC de recetas del portal sigue igual: con acceso da datos, sin acceso null', async () => {
    const con = await comoUsuario(db, gdl, async () =>
      (await db.query<{ r: unknown }>('select public.sucursales_recetas_consumo(513) r')).rows[0].r,
    );
    const sin = await comoUsuario(db, gdl, async () =>
      (await db.query<{ r: unknown }>('select public.sucursales_recetas_consumo(532) r')).rows[0].r,
    );
    expect(con).toHaveProperty('insumos');
    expect(sin).toBeNull();
  });

  it('suma por insumo y origen solo de las sucursales del usuario, con presentación y mes anterior', async () => {
    const r = await nacional(gdl, '2026-10-01', [513, 384, 532]);
    expect(r.meses).toEqual(['2026-10-01', '2026-09-01']);
    expect(r.sucursales.map((s) => [s.company_id, s.completa]).sort()).toEqual([
      [384, false],
      [513, true],
    ]);
    const lm = r.insumos.find((x) => x.insumo_id === leche && x.origen === 'mostrador')!;
    expect(Number(lm.cantidad)).toBe(1500); // 513 + 384; 532 no es suya
    expect(lm.sucursales).toBe(2);
    expect(Number(lm.presentacion)).toBeGreaterThan(0);
    expect(Number(r.insumos.find((x) => x.insumo_id === leche && x.origen === 'rappi')!.cantidad)).toBe(200);
    expect(r.anterior).toEqual([{ insumo_id: leche, origen: 'mostrador', cantidad: 800 }]);
    expect(r.sucursales_anterior).toBe(1);
    const otro = await nacional(ajeno, '2026-10-01', [513, 532]);
    expect(otro.sucursales.map((s) => s.company_id)).toEqual([532]);
    expect(otro.meses).toEqual(['2026-10-01']);
  });

  it('desglose por sucursal de un insumo o de todos', async () => {
    const uno = await desglose(gdl, '2026-10-01', [513, 384, 532], leche);
    expect(uno.map((x) => [x.company_id, x.origen, Number(x.cantidad)]).sort()).toEqual([
      [384, 'mostrador', 500],
      [513, 'mostrador', 1000],
      [513, 'rappi', 200],
    ]);
    expect((await desglose(gdl, '2026-10-01', [513, 384, 532], null)).length).toBe(4);
  });

  it('recalcular un mes lo reemplaza: sin duplicados ni insumos viejos', async () => {
    const n = await guardar('2026-10-01', 513, [fila('mostrador', cafe, 'CAFÉ', 18, 'gr')]);
    expect(n).toBe(1);
    const uno = await desglose(gdl, '2026-10-01', [513], null);
    expect(uno.map((x) => [x.insumo_id, Number(x.cantidad)])).toEqual([[cafe, 18]]);
  });

  it('un insumo borrado del catálogo se sigue sumando, sin presentación', async () => {
    const fantasma = '00000000-0000-4000-8000-000000000001';
    await guardar('2026-08-01', 513, [fila('mostrador', fantasma, 'INSUMO VIEJO', 5, 'pza')]);
    const r = await nacional(gdl, '2026-08-01', [513]);
    expect(r.insumos).toEqual([
      expect.objectContaining({ insumo_id: fantasma, insumo: 'INSUMO VIEJO', presentacion: null }),
    ]);
  });

  it('rechaza un origen inválido y meses que no son primer día', async () => {
    await expect(guardar('2026-10-01', 513, [fila('uber', leche, 'LECHE ENTERA', 1)])).rejects.toThrow();
    await expect(guardar('2026-10-02', 513, [])).rejects.toThrow(/primer día/);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/db/sucursales-consumo-mes.test.ts`
Expected: FAIL. La relación `sucursales_consumo_mes` y la función `sucursales_guardar_consumo_mes` no existen.

Si la siembra local no tiene `LECHE ENTERA` o el café BLACK, cambiar el `select` del `beforeAll` por dos insumos que
sí existan (`select id, nombre from insumos limit 2`) y ajustar los nombres. No inventar ids.

- [ ] **Step 3: Escribir la migración**

Para el cuerpo de `sucursales_recetas_consumo_datos()`, copiar **exactamente** el `jsonb_build_object(...)` de
`supabase/migrations/20261028000027_sucursales_consumo_ajustes.sql` (líneas 14–71). Es la versión vigente, sin cambiar
nada.

```sql
-- Consumo nacional de ingredientes por mes (docs/sucursales/17, spec 2026-11-04-consumo-nacional-design).
-- El script scripts/sucursales/consumo-mes.ts calcula un mes cerrado por sucursal con el MISMO cálculo que la sección
-- Consumo (consumir) y lo guarda aquí con la llave de servicio. El Tablero México lo lee por dos RPC con el acceso por
-- sucursal de siempre. Solo cantidades, nunca dinero.

-- 1. Recetas para el servidor: el cuerpo de sucursales_recetas_consumo (migración 27) pasa a una función interna que
--    solo puede llamar service_role. La del portal conserva su firma, su permiso y su comportamiento.
create function public.sucursales_recetas_consumo_datos() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    -- (pegar aquí, sin cambios, el contenido del jsonb_build_object de la migración 27)
  );
$$;

create or replace function public.sucursales_recetas_consumo(p_company integer) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if not public.sucursales_acceso(p_company) then
    return null;
  end if;
  return public.sucursales_recetas_consumo_datos();
end $$;

revoke all on function public.sucursales_recetas_consumo_datos() from public, anon, authenticated;
grant execute on function public.sucursales_recetas_consumo_datos() to service_role;

-- 2. Tablas
create table public.sucursales_consumo_mes (
  mes date not null check (extract(day from mes) = 1),
  company_id integer not null check (company_id > 0),
  origen text not null check (origen in ('mostrador', 'app', 'rappi', 'desconocido')),
  -- Sin FK: el renglón sobrevive si el insumo se desactiva o se borra; nombre, unidad y categoría van copiados.
  insumo_id uuid not null,
  insumo text not null,
  unidad text not null,
  categoria text not null,
  cantidad numeric not null check (cantidad >= 0),
  primary key (mes, company_id, origen, insumo_id)
);

create table public.sucursales_consumo_mes_sucursal (
  mes date not null check (extract(day from mes) = 1),
  company_id integer not null check (company_id > 0),
  calculado_en timestamptz not null default now(),
  recetas_leidas_en timestamptz not null,
  completa boolean not null,
  -- Por origen: {lineas, incluidas, generico, sinCodigo, sinEnlace} (CoberturaConsumo, en unidades).
  cobertura jsonb not null,
  -- Por origen: [{nombre, unidades, sinCodigo}] (SinReceta).
  sin_receta jsonb not null,
  primary key (mes, company_id)
);

alter table public.sucursales_consumo_mes enable row level security;
alter table public.sucursales_consumo_mes_sucursal enable row level security;
revoke all on public.sucursales_consumo_mes, public.sucursales_consumo_mes_sucursal from anon, authenticated;

-- 3. Guardado atómico de un mes de una sucursal (reemplaza lo anterior). Solo service_role.
create function public.sucursales_guardar_consumo_mes(p_mes date, p_company integer, p_meta jsonb, p_insumos jsonb)
returns integer
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  n integer;
begin
  if extract(day from p_mes) <> 1 then
    raise exception 'El mes va como su primer día (AAAA-MM-01).';
  end if;
  delete from public.sucursales_consumo_mes where mes = p_mes and company_id = p_company;
  insert into public.sucursales_consumo_mes (mes, company_id, origen, insumo_id, insumo, unidad, categoria, cantidad)
  select p_mes, p_company, x.origen, x.insumo_id, x.insumo, x.unidad, x.categoria, x.cantidad
  from jsonb_to_recordset(p_insumos)
    as x(origen text, insumo_id uuid, insumo text, unidad text, categoria text, cantidad numeric);
  get diagnostics n = row_count;
  insert into public.sucursales_consumo_mes_sucursal
    (mes, company_id, calculado_en, recetas_leidas_en, completa, cobertura, sin_receta)
  values (p_mes, p_company, now(), (p_meta->>'recetas_leidas_en')::timestamptz, (p_meta->>'completa')::boolean,
    coalesce(p_meta->'cobertura', '{}'), coalesce(p_meta->'sin_receta', '{}'))
  on conflict (mes, company_id) do update set calculado_en = excluded.calculado_en,
    recetas_leidas_en = excluded.recetas_leidas_en, completa = excluded.completa,
    cobertura = excluded.cobertura, sin_receta = excluded.sin_receta;
  return n;
end $$;

revoke all on function public.sucursales_guardar_consumo_mes(date, integer, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function public.sucursales_guardar_consumo_mes(date, integer, jsonb, jsonb) to service_role;

-- 4. Lectura nacional (ligera): meses, cobertura por sucursal, consumo sumado por insumo y origen y el mes anterior
--    (solo de las sucursales del usuario que lo tienen calculado).
create function public.sucursales_consumo_nacional(p_mes date, p_companias integer[]) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
  ant date := (p_mes - interval '1 month')::date;
begin
  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));
  return jsonb_build_object(
    'meses', coalesce((select jsonb_agg(m order by m desc) from (
        select distinct mes m from public.sucursales_consumo_mes_sucursal where company_id = any(v)) x), '[]'),
    'sucursales', coalesce((select jsonb_agg(jsonb_build_object('company_id', s.company_id,
        'calculado_en', s.calculado_en, 'recetas_leidas_en', s.recetas_leidas_en, 'completa', s.completa,
        'cobertura', s.cobertura, 'sin_receta', s.sin_receta) order by s.company_id)
      from public.sucursales_consumo_mes_sucursal s where s.mes = p_mes and s.company_id = any(v)), '[]'),
    'insumos', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', x.insumo_id, 'insumo', x.insumo,
        'unidad', x.unidad, 'categoria', x.categoria, 'presentacion', i.presentacion, 'origen', x.origen,
        'cantidad', x.cantidad, 'sucursales', x.sucursales) order by x.categoria, x.insumo, x.origen)
      from (
        select insumo_id, origen, max(insumo) insumo, max(unidad) unidad, max(categoria) categoria,
          sum(cantidad) cantidad, count(distinct company_id) sucursales
        from public.sucursales_consumo_mes where mes = p_mes and company_id = any(v)
        group by insumo_id, origen) x
      left join public.insumos i on i.id = x.insumo_id), '[]'),
    'anterior', coalesce((select jsonb_agg(jsonb_build_object('insumo_id', insumo_id, 'origen', origen,
        'cantidad', cantidad) order by insumo_id, origen)
      from (
        select insumo_id, origen, sum(cantidad) cantidad
        from public.sucursales_consumo_mes where mes = ant and company_id = any(v)
        group by 1, 2) a), '[]'),
    'sucursales_anterior', (select count(*) from public.sucursales_consumo_mes_sucursal
      where mes = ant and company_id = any(v)));
end $$;

-- 5. Desglose por sucursal: un insumo (al abrirlo en el tablero) o todos con p_insumo nulo (exportar).
create function public.sucursales_consumo_desglose(p_mes date, p_companias integer[], p_insumo uuid)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v integer[];
begin
  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));
  return coalesce((select jsonb_agg(jsonb_build_object('company_id', company_id, 'insumo_id', insumo_id,
      'origen', origen, 'cantidad', cantidad) order by company_id, insumo_id, origen)
    from public.sucursales_consumo_mes
    where mes = p_mes and company_id = any(v) and (p_insumo is null or insumo_id = p_insumo)), '[]');
end $$;

revoke all on function public.sucursales_consumo_nacional(date, integer[]),
  public.sucursales_consumo_desglose(date, integer[], uuid) from public, anon;
grant execute on function public.sucursales_consumo_nacional(date, integer[]),
  public.sucursales_consumo_desglose(date, integer[], uuid) to authenticated;
```

Antes de pegar el cuerpo, abrir la migración 27 y confirmar que es la versión más reciente de
`sucursales_recetas_consumo`:

```bash
grep -l "sucursales_recetas_consumo" supabase/migrations/*
```

Debe salir solo la 24 y la 27.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/db/sucursales-consumo-mes.test.ts tests/db/sucursales-resumen.test.ts`
Expected: PASS (las de la migración 37 siguen verdes).

Correr también las pruebas de la sección Consumo de la base, si existen:

```bash
npx vitest run tests/db -t "consumo"
```

Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261105000038_sucursales_consumo_mes.sql tests/db/sucursales-consumo-mes.test.ts
git commit -m "Migración 38: consumo nacional por mes (tablas, guardado de servicio y RPC de lectura)"
```

---

### Task 2: Cálculo puro de un mes por sucursal

**Files:**
- Create: `lib/sucursales/consumo-mes.ts`
- Test: `tests/portal/consumo-mes.test.ts`

**Interfaces:**
- Consumes:
  - `consumir(ps, datos, evidencia, catalogo, fechas, piloto): ResultadoConsumo` de `lib/sucursales/consumo.ts`;
  - `LecturaNormal` y `FuenteRappi` de `lib/sucursales/datos.ts`;
  - `Origen` y `PedidoNormal` de `lib/sucursales/normalizar.ts`;
  - `enZona`, `sumarDias` y `diasEntre` de `lib/sucursales/tiempo.ts`.
- Produces:

```ts
export type CoberturaMes = { lineas: number; incluidas: number; generico: number; sinCodigo: number; sinEnlace: number };
export type SinRecetaMes = { nombre: string; unidades: number; sinCodigo: boolean };
export interface RenglonConsumoMes { origen: Origen; insumo_id: string; insumo: string; unidad: string; categoria: string; cantidad: number }
export interface FilaConsumoMes {
  mes: string;               // 'AAAA-MM-01'
  companyId: number;
  completa: boolean;
  recetasLeidasEn: string;
  cobertura: Partial<Record<Origen, CoberturaMes>>;
  sinReceta: Partial<Record<Origen, SinRecetaMes[]>>;
  insumos: RenglonConsumoMes[];
}
export function leerMes(texto: string): { mes: string; desde: string; hasta: string } | null; // 'AAAA-MM'
export function mesCerrado(mes: string, ahora?: Date): boolean;  // mes 'AAAA-MM-01' < mes actual en CDMX
export function consumoMesSucursal(a: {
  mes: string; companyId: number; lectura: LecturaNormal; datos: DatosConsumo;
  catalogo?: CatalogoNombres; piloto: boolean;
}): FilaConsumoMes;
export function rappiPorDias(fuente: FuenteRappi | undefined): FuenteRappi | undefined;
```

- [ ] **Step 1: Escribir las pruebas que fallan**

Reusa los datos de receta y el armado de pedidos de `tests/portal/sucursales-consumo.test.tsx` (líneas 22–56): Iced
Latte y Brownie, y `normalizar` con `pedido` de `sucursales-fixtures`.

```ts
// tests/portal/consumo-mes.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { consumir, claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { consumoMesSucursal, leerMes, mesCerrado, rappiPorDias } from '../../lib/sucursales/consumo-mes';
import { normalizar, type PedidoNormal } from '../../lib/sucursales/normalizar';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import { pedido } from './sucursales-fixtures';

const cfg = configDe(612)!;
const IL = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8';
const datos: DatosConsumo = {
  leidoEn: '2026-11-05T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set(),
  recetas: new Map([
    [
      claveConsumo(IL, 'Chica'),
      [
        { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'LECHE', cantidad: 180 },
        { insumoId: 'cf', insumo: 'CAFÉ', unidad: 'gr', categoria: 'CAFÉ', cantidad: 18 },
      ],
    ],
  ]),
};
const linea = (code: string, name: string, customs: string[] = []) => ({
  defaultCode: code,
  productName: name,
  amount: 80,
  discount: 0,
  itemsCustom: customs.map((c) => ({ defaultCode: 'X', productName: c, amount: 0, discount: 0 })),
});
const pedidosDe = (fecha: string, origen: PedidoNormal['origen'], items: ReturnType<typeof linea>[]) =>
  normalizar([pedido(fecha, '10:00:00', { items, grossAmount: 80 * items.length })] as never[], cfg, {
    desde: fecha,
    hasta: fecha,
  }).pedidos.map((p) => ({ ...p, origen }));
const lectura = (pedidos: PedidoNormal[], estado: LecturaNormal['estado'] = 'completa'): LecturaNormal => ({
  desde: '2026-10-01',
  hasta: '2026-10-31',
  leidoEn: 0,
  estado,
  error: null,
  avisos: [],
  totalDeclarado: null,
  pedidos,
});

describe('consumo de un mes por sucursal', () => {
  const ps = [
    ...pedidosDe('2026-10-03', 'mostrador', [linea('5IL', 'Iced Latte', ['Regular - 440ml']), linea('GHC', 'Sandwich')]),
    ...pedidosDe('2026-10-10', 'app', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
    ...pedidosDe('2026-10-20', 'rappi', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
    ...pedidosDe('2026-10-21', 'desconocido', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
  ];
  const f = consumoMesSucursal({
    mes: '2026-10-01',
    companyId: 612,
    lectura: lectura(ps),
    datos,
    piloto: false,
  });

  it('la suma de los orígenes es igual a consumir con todos los pedidos', () => {
    const todos = consumir(ps, datos, ps, undefined, [], false);
    for (const i of todos.insumos) {
      const suma = f.insumos.filter((r) => r.insumo_id === i.insumoId).reduce((a, r) => a + r.cantidad, 0);
      expect(suma).toBeCloseTo(i.cantidad, 6);
    }
    const lineas = Object.values(f.cobertura).reduce((a, c) => a + c!.lineas, 0);
    expect(lineas).toBe(todos.cobertura.lineas);
  });

  it('separa por origen, guarda cobertura y productos sin receta', () => {
    expect(f.insumos.filter((r) => r.insumo_id === 'le').map((r) => [r.origen, r.cantidad])).toEqual([
      ['app', 180],
      ['desconocido', 180],
      ['mostrador', 180],
      ['rappi', 180],
    ]);
    expect(f.cobertura.mostrador).toEqual({ lineas: 2, incluidas: 1, generico: 0, sinCodigo: 0, sinEnlace: 1 });
    expect(f.sinReceta.mostrador).toEqual([{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }]);
    expect(f.completa).toBe(true);
    expect(f.recetasLeidasEn).toBe('2026-11-05T00:00:00.000Z');
  });

  it('una lectura parcial queda marcada como incompleta', () => {
    expect(consumoMesSucursal({ mes: '2026-10-01', companyId: 612, lectura: lectura(ps, 'parcial'), datos, piloto: false }).completa).toBe(false);
  });

  it('una sucursal sin pedidos en el mes no tiene renglones', () => {
    const v = consumoMesSucursal({ mes: '2026-10-01', companyId: 612, lectura: lectura([]), datos, piloto: false });
    expect(v.insumos).toEqual([]);
    expect(v.completa).toBe(true);
  });
});

describe('meses', () => {
  it('lee AAAA-MM y da su primer y último día', () => {
    expect(leerMes('2026-10')).toEqual({ mes: '2026-10-01', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(leerMes('2026-02')!.hasta).toBe('2026-02-28');
    expect(leerMes('2026-13')).toBeNull();
    expect(leerMes('octubre')).toBeNull();
  });
  it('solo meses anteriores al actual en la Ciudad de México', () => {
    // 2026-11-01 02:00 UTC = 31 de octubre 20:00 en CDMX: octubre aún no cierra.
    expect(mesCerrado('2026-10-01', new Date('2026-11-01T02:00:00Z'))).toBe(false);
    expect(mesCerrado('2026-10-01', new Date('2026-11-01T07:00:00Z'))).toBe(true);
    expect(mesCerrado('2026-11-01', new Date('2026-11-20T12:00:00Z'))).toBe(false);
    expect(mesCerrado('2026-12-01', new Date('2026-11-20T12:00:00Z'))).toBe(false);
  });
});

describe('Rappi día por día', () => {
  it('pide cada día por separado y junta los pedidos', async () => {
    const llamadas: string[] = [];
    const fuente = vi.fn(async (d: string, h: string) => {
      llamadas.push(`${d}..${h}`);
      return [{ id: d } as unknown as PedidoNormal];
    });
    const r = await rappiPorDias(fuente)!('2026-10-01', '2026-10-03');
    expect(llamadas).toEqual(['2026-10-01..2026-10-01', '2026-10-02..2026-10-02', '2026-10-03..2026-10-03']);
    expect(r).toHaveLength(3);
  });
  it('si un día falla, todo el periodo es null (lectura parcial, nunca pedidos perdidos en silencio)', async () => {
    const fuente = async (d: string) => (d === '2026-10-02' ? null : []);
    expect(await rappiPorDias(fuente)!('2026-10-01', '2026-10-03')).toBeNull();
  });
  it('sin fuente, sin Rappi', () => {
    expect(rappiPorDias(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/consumo-mes.test.ts`
Expected: FAIL. No se puede resolver `../../lib/sucursales/consumo-mes`.

- [ ] **Step 3: Implementar**

```ts
// lib/sucursales/consumo-mes.ts
import { consumir, type DatosConsumo } from './consumo';
import type { FuenteRappi, LecturaNormal } from './datos';
import type { CatalogoNombres } from './metricas';
import type { Origen, PedidoNormal } from './normalizar';
import { diasEntre, enZona, sumarDias } from './tiempo';

/**
 * Consumo nacional por mes (docs/sucursales/17): el consumo de UN mes cerrado de UNA sucursal, separado por origen,
 * con el MISMO cálculo que la sección Consumo (consumir). Puro: no lee la API ni la base.
 * Cada origen se calcula con sus pedidos y, como evidencia de identidad, con TODOS los del mes (igual que la página),
 * así que la suma de los orígenes es el consumo con «todos».
 */
export type CoberturaMes = {
  lineas: number;
  incluidas: number;
  generico: number;
  sinCodigo: number;
  sinEnlace: number;
};
export type SinRecetaMes = { nombre: string; unidades: number; sinCodigo: boolean };
export interface RenglonConsumoMes {
  origen: Origen;
  insumo_id: string;
  insumo: string;
  unidad: string;
  categoria: string;
  cantidad: number;
}
export interface FilaConsumoMes {
  mes: string;
  companyId: number;
  completa: boolean;
  recetasLeidasEn: string;
  cobertura: Partial<Record<Origen, CoberturaMes>>;
  sinReceta: Partial<Record<Origen, SinRecetaMes[]>>;
  insumos: RenglonConsumoMes[];
}

const ORIGENES: Origen[] = ['mostrador', 'app', 'rappi', 'desconocido'];
const ZONA_MEXICO = 'America/Mexico_City';

export function leerMes(texto: string): { mes: string; desde: string; hasta: string } | null {
  const m = /^(\d{4})-(\d{2})$/.exec(texto);
  if (!m || +m[2] < 1 || +m[2] > 12) return null;
  const desde = `${m[1]}-${m[2]}-01`;
  const siguiente = +m[2] === 12 ? `${+m[1] + 1}-01-01` : `${m[1]}-${String(+m[2] + 1).padStart(2, '0')}-01`;
  return { mes: desde, desde, hasta: sumarDias(siguiente, -1) };
}

/** Un mes ('AAAA-MM-01') está cerrado si es anterior al mes actual en la Ciudad de México. */
export function mesCerrado(mes: string, ahora: Date = new Date()): boolean {
  return mes.slice(0, 7) < enZona(ahora, ZONA_MEXICO).fecha.slice(0, 7);
}

export function consumoMesSucursal(a: {
  mes: string;
  companyId: number;
  lectura: LecturaNormal;
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  piloto: boolean;
}): FilaConsumoMes {
  const todos = a.lectura.pedidos;
  const fechas = Array.from(
    { length: diasEntre(a.lectura.desde, a.lectura.hasta) + 1 },
    (_, i) => sumarDias(a.lectura.desde, i),
  );
  const fila: FilaConsumoMes = {
    mes: a.mes,
    companyId: a.companyId,
    completa: a.lectura.estado === 'completa',
    recetasLeidasEn: a.datos.leidoEn,
    cobertura: {},
    sinReceta: {},
    insumos: [],
  };
  for (const origen of ORIGENES) {
    const ps: PedidoNormal[] = todos.filter((p) => p.origen === origen);
    if (!ps.length) continue;
    const r = consumir(ps, a.datos, todos, a.catalogo, fechas, a.piloto);
    const c = r.cobertura;
    fila.cobertura[origen] = {
      lineas: c.lineas,
      incluidas: c.incluidas,
      generico: c.generico,
      sinCodigo: c.sinCodigo,
      sinEnlace: c.sinEnlace,
    };
    fila.sinReceta[origen] = r.sinReceta.map((s) => ({ nombre: s.nombre, unidades: s.unidades, sinCodigo: s.sinCodigo }));
    for (const i of r.insumos)
      if (i.cantidad > 0)
        fila.insumos.push({
          origen,
          insumo_id: i.insumoId,
          insumo: i.insumo,
          unidad: i.unidad,
          categoria: i.categoria,
          cantidad: i.cantidad,
        });
  }
  fila.insumos.sort((x, y) => x.insumo_id.localeCompare(y.insumo_id) || x.origen.localeCompare(y.origen));
  return fila;
}

/**
 * Rappi del portal leído DÍA POR DÍA: la API de Supabase corta las respuestas en 1,000 filas y un mes de una sucursal
 * puede pasarlas. Si un día no se lee, el periodo es null y la lectura queda parcial (conRappi), nunca incompleta en
 * silencio.
 */
export function rappiPorDias(fuente: FuenteRappi | undefined): FuenteRappi | undefined {
  if (!fuente) return undefined;
  return async (desde, hasta) => {
    const todos: PedidoNormal[] = [];
    for (let f = desde; f <= hasta; f = sumarDias(f, 1)) {
      const r = await fuente(f, f);
      if (!r) return null;
      todos.push(...r);
    }
    return todos;
  };
}
```

Si la prueba de orden de `f.insumos` falla porque `consumir` no separa `desconocido`, revisar `filtrarOrigen` y
`Origen`. `desconocido` es un origen válido y se guarda aparte.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/portal/consumo-mes.test.ts tests/portal/sucursales-consumo.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/sucursales/consumo-mes.ts tests/portal/consumo-mes.test.ts
git commit -m "Consumo nacional: cálculo puro de un mes por sucursal, separado por origen"
```

---

### Task 3: Recorrido del mes en el servidor y script

**Files:**
- Modify: `lib/sucursales/consumo-servidor.ts`: extraer el armado en `datosConsumoDeRpc`.
- Modify: `lib/sucursales/corte-servidor.ts`: renombrar `catalogo` a `catalogoServicio` y exportarla (actualizar su
  único uso en `cortar`).
- Create: `lib/sucursales/consumo-mes-servidor.ts`
- Create: `scripts/sucursales/consumo-mes.ts`
- Test: `tests/portal/consumo-mes-servidor.test.ts`

**Interfaces:**
- Consumes: `consumoMesSucursal`, `rappiPorDias`, `leerMes`, `mesCerrado` y `FilaConsumoMes` (Task 2);
  `sucursales_recetas_consumo_datos` y `sucursales_guardar_consumo_mes` (Task 1); `conRappi`, `leerDias` y
  `LecturaNormal` de `datos.ts`; `rappiServicio` y `clienteServicio` de `corte-servidor.ts`.
- Produces:

```ts
// consumo-servidor.ts
export function datosConsumoDeRpc(d: ConsumoRpc, leidoEn: string): DatosConsumo;
// consumo-mes-servidor.ts
export interface DependenciasMes {
  leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>;
  rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined;
  guardar: (f: FilaConsumoMes) => Promise<number>;
  avance?: (texto: string) => void;
}
export interface ResultadoMes { mes: string; guardadas: number; incompletas: number[]; fallidas: { companyId: number; motivo: string }[]; ms: number }
export async function calcularMes(a: { mes: string; sucursales: ConfigSucursal[]; datos: DatosConsumo; catalogo?: CatalogoNombres; deps: DependenciasMes }): Promise<ResultadoMes>;
export async function recetasServicio(db: SupabaseClient): Promise<DatosConsumo | null>;
export function guardarServicio(db: SupabaseClient): DependenciasMes['guardar'];
```

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/portal/consumo-mes-servidor.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { calcularMes } from '../../lib/sucursales/consumo-mes-servidor';
import { claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import type { FilaConsumoMes } from '../../lib/sucursales/consumo-mes';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const IL = 'il';
const datos: DatosConsumo = {
  leidoEn: '2026-11-05T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set([IL]),
  recetas: new Map([[claveConsumo(IL, 'Único'), [{ insumoId: 'le', insumo: 'LECHE', unidad: 'ml', categoria: 'LECHE', cantidad: 100 }]]]),
};
const p = (fecha: string, origen: PedidoNormal['origen'], rappi: string | null = null): PedidoNormal => ({
  id: Math.random(),
  fecha,
  segundo: 36000,
  hora: '10:00:00',
  origen,
  ventaCent: 8000,
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'EMV',
  lineas: [{ codigo: '5IL', nombre: 'Iced Latte', importeCent: 8000, descuentoPct: 0, customs: [] }],
  numeroPedidoRappi: rappi,
  cuadra: true,
});
const lectura = (desde: string, hasta: string, pedidos: PedidoNormal[], estado: LecturaNormal['estado'] = 'completa'): LecturaNormal => ({
  desde, hasta, leidoEn: 0, estado, error: estado === 'error' ? 'proveedor' as never : null, avisos: [], totalDeclarado: null, pedidos,
});

describe('recorrido de un mes', () => {
  it('lee el mes completo de cada sucursal, suma Rappi del portal día por día y guarda una fila por sucursal', async () => {
    const guardadas: FilaConsumoMes[] = [];
    const rappiDias: string[] = [];
    const namora = configDe(513)!; // rappiPortal
    const juarez = configDe(612)!;
    const r = await calcularMes({
      mes: '2026-10-01',
      sucursales: [namora, juarez],
      datos,
      deps: {
        leer: async (cfg, d, h) => {
          expect([d, h]).toEqual(['2026-10-01', '2026-10-31']);
          return lectura(d, h, [p('2026-10-05', 'mostrador')], cfg.companyId === 612 ? 'parcial' : 'completa');
        },
        rappi: (cfg) =>
          cfg.rappiPortal
            ? async (d, h) => {
                rappiDias.push(`${d}..${h}`);
                return d === '2026-10-09' ? [p('2026-10-09', 'rappi', 'R1')] : [];
              }
            : undefined,
        guardar: async (f) => {
          guardadas.push(f);
          return f.insumos.length;
        },
      },
    });
    expect(rappiDias).toHaveLength(31);
    expect(rappiDias[0]).toBe('2026-10-01..2026-10-01');
    expect(guardadas.map((g) => g.companyId)).toEqual([513, 612]);
    expect(guardadas[0].insumos.map((i) => [i.origen, i.cantidad])).toEqual([
      ['mostrador', 100],
      ['rappi', 100],
    ]);
    expect(r.guardadas).toBe(2);
    expect(r.incompletas).toEqual([612]);
    expect(r.fallidas).toEqual([]);
  });

  it('una sucursal que no se pudo leer no se guarda y se reporta', async () => {
    const guardar = vi.fn(async () => 0);
    const r = await calcularMes({
      mes: '2026-10-01',
      sucursales: [configDe(612)!],
      datos,
      deps: { leer: async (_c, d, h) => lectura(d, h, [], 'error'), rappi: () => undefined, guardar },
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(r.fallidas).toEqual([{ companyId: 612, motivo: expect.any(String) }]);
  });

  it('rechaza un mes que no está cerrado', async () => {
    await expect(
      calcularMes({
        mes: '2999-01-01',
        sucursales: [],
        datos,
        deps: { leer: vi.fn(), rappi: () => undefined, guardar: vi.fn() },
      }),
    ).rejects.toThrow(/no ha cerrado/);
  });
});
```

La receta `il` es de tamaño único (está en `unicas`) y sin vaso: `tamanoVerificado` la resuelve como `Único` (lib/sucursales/costeo.ts:117). Revisar en `lib/sucursales/datos.ts` el tipo de `CodigoError` y usar en la prueba un valor válido en lugar de
`'proveedor' as never` (por ejemplo, el primero de `mensajeError`).

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/consumo-mes-servidor.test.ts`
Expected: FAIL. No se puede resolver `consumo-mes-servidor`.

- [ ] **Step 3: Refactor en `consumo-servidor.ts` (sin cambiar comportamiento)**

Exportar la interfaz `ConsumoRpc` y mover el armado del `try` a:

```ts
/** Arma las recetas para el consumo desde el JSON de la RPC (la del portal o la interna de servicio). */
export function datosConsumoDeRpc(d: ConsumoRpc, leidoEn: string): DatosConsumo {
  const recetas = new Map<string, InsumoReceta[]>();
  for (const i of d.insumos) {
    const k = claveConsumo(i.receta_id, i.tamano);
    const lista = recetas.get(k) ?? [];
    lista.push({
      insumoId: i.insumo_id,
      insumo: i.insumo,
      unidad: i.unidad,
      categoria: i.categoria ?? 'Sin categoría',
      cantidad: Number(i.cantidad),
    });
    recetas.set(k, lista);
  }
  const lineas = new Map<string, { insumo: string; cantidad: number }[]>();
  for (const l of d.lineas ?? []) {
    const k = claveConsumo(l.receta_id, l.tamano);
    lineas.set(k, [...(lineas.get(k) ?? []), { insumo: l.insumo, cantidad: Number(l.cantidad) }]);
  }
  return {
    leidoEn,
    enlaces: new Map(d.enlaces.map((e) => [e.codigo, { recetaId: e.receta_id, receta: e.receta }])),
    unicas: new Set(d.unicas),
    recetas,
    ...(d.lineas ? { lineas } : {}),
    ...(d.sustitutos
      ? {
          sustitutos: new Map(
            d.sustitutos.map((s) => [
              s.insumo,
              { insumoId: s.insumo_id, insumo: s.insumo, unidad: s.unidad, categoria: s.categoria ?? 'Sin categoría' },
            ]),
          ),
        }
      : {}),
  };
}
```

`leerDatosConsumo` queda como
`return datosConsumoDeRpc(r.data as unknown as ConsumoRpc, ahora().toISOString());` dentro de su `try`.

En `corte-servidor.ts`, renombrar `async function catalogo(` a `export async function catalogoServicio(` y cambiar
`const cat = await catalogo(db);` a `const cat = await catalogoServicio(db);`.

Run: `npx vitest run tests/portal/sucursales-consumo.test.tsx tests/db/sucursales-resumen.test.ts`
Expected: PASS (sin cambio de comportamiento).

- [ ] **Step 4: Implementar `consumo-mes-servidor.ts`**

```ts
// lib/sucursales/consumo-mes-servidor.ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigSucursal } from './config';
import type { DatosConsumo } from './consumo';
import { consumoMesSucursal, mesCerrado, rappiPorDias, type FilaConsumoMes } from './consumo-mes';
import { datosConsumoDeRpc, type ConsumoRpc } from './consumo-servidor';
import { conRappi, type FuenteRappi, type LecturaNormal } from './datos';
import type { CatalogoNombres } from './metricas';
import { sumarDias } from './tiempo';

/**
 * Consumo nacional por mes (docs/sucursales/17): recorre las sucursales UNA POR UNA (cada una ya lee sus 31 días con 4
 * lecturas a la vez, el semáforo del proveedor; más sucursales a la vez solo harían esperar y agotar lecturas, como
 * pasó en el historial del corte). Una sucursal que no se pudo leer no se escribe: conserva su cálculo anterior.
 */
export interface DependenciasMes {
  leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>;
  rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined;
  guardar: (f: FilaConsumoMes) => Promise<number>;
  avance?: (texto: string) => void;
}
export interface ResultadoMes {
  mes: string;
  guardadas: number;
  incompletas: number[];
  fallidas: { companyId: number; motivo: string }[];
  ms: number;
}

const ultimoDia = (mes: string) => {
  const [a, m] = mes.split('-').map(Number);
  const siguiente = m === 12 ? `${a + 1}-01-01` : `${a}-${String(m + 1).padStart(2, '0')}-01`;
  return sumarDias(siguiente, -1);
};

export async function calcularMes(a: {
  mes: string;
  sucursales: ConfigSucursal[];
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  deps: DependenciasMes;
}): Promise<ResultadoMes> {
  if (!mesCerrado(a.mes)) throw new Error(`El mes ${a.mes.slice(0, 7)} no ha cerrado: solo meses anteriores al actual.`);
  const inicio = Date.now();
  const hasta = ultimoDia(a.mes);
  const r: ResultadoMes = { mes: a.mes, guardadas: 0, incompletas: [], fallidas: [], ms: 0 };
  for (const cfg of a.sucursales) {
    const t = Date.now();
    const l = await conRappi(await a.deps.leer(cfg, a.mes, hasta), rappiPorDias(a.deps.rappi(cfg)));
    if (l.estado === 'error') {
      r.fallidas.push({ companyId: cfg.companyId, motivo: l.avisos[0] ?? l.error ?? 'error' });
      a.deps.avance?.(`${cfg.companyId} ${cfg.nombre}: sin leer (${l.avisos[0] ?? l.error})`);
      continue;
    }
    const fila = consumoMesSucursal({
      mes: a.mes,
      companyId: cfg.companyId,
      lectura: l,
      datos: a.datos,
      catalogo: a.catalogo,
      piloto: !!cfg.rappiPortal,
    });
    const n = await a.deps.guardar(fila);
    r.guardadas++;
    if (!fila.completa) r.incompletas.push(cfg.companyId);
    a.deps.avance?.(
      `${cfg.companyId} ${cfg.nombre}: ${l.pedidos.length} pedidos, ${n} renglones${fila.completa ? '' : ' (INCOMPLETA)'} en ${Math.round((Date.now() - t) / 1000)} s`,
    );
  }
  r.ms = Date.now() - inicio;
  return r;
}

/** Recetas por la función interna (solo service_role), con el mismo armado que la sección Consumo. */
export async function recetasServicio(db: SupabaseClient): Promise<DatosConsumo | null> {
  const r = await db.rpc('sucursales_recetas_consumo_datos');
  if (r.error || !r.data) return null;
  return datosConsumoDeRpc(r.data as unknown as ConsumoRpc, new Date().toISOString());
}

export function guardarServicio(db: SupabaseClient): DependenciasMes['guardar'] {
  return async (f) => {
    const r = await db.rpc('sucursales_guardar_consumo_mes', {
      p_mes: f.mes,
      p_company: f.companyId,
      p_meta: {
        completa: f.completa,
        recetas_leidas_en: f.recetasLeidasEn,
        cobertura: f.cobertura,
        sin_receta: f.sinReceta,
      },
      p_insumos: f.insumos,
    });
    if (r.error) throw new Error(`No se pudo guardar ${f.companyId}: ${r.error.message}`);
    return Number(r.data);
  };
}
```

- [ ] **Step 5: Script**

```ts
// scripts/sucursales/consumo-mes.ts
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { leerMes } from '../../lib/sucursales/consumo-mes';
import { calcularMes, guardarServicio, recetasServicio } from '../../lib/sucursales/consumo-mes-servidor';
import { catalogoServicio, rappiServicio } from '../../lib/sucursales/corte-servidor';
import { leerDias } from '../../lib/sucursales/datos';

/**
 * Consumo nacional de un mes cerrado (docs/sucursales/17): lo calcula por sucursal con el MISMO código que la sección
 * Consumo y lo guarda en sucursales_consumo_mes. Volver a correrlo reemplaza ese mes. Escribe en la base de
 * NEXT_PUBLIC_SUPABASE_URL con SUPABASE_SECRET_KEY de .env.local: solo con OK.
 *
 *   npx.cmd tsx --conditions=react-server scripts/sucursales/consumo-mes.ts --mes 2026-10 [--companias 513,384]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const m = leerMes(opcion('--mes') ?? '');
if (!m) throw new Error('Falta --mes AAAA-MM');
const ids = (opcion('--companias') ?? '').split(',').filter(Boolean).map(Number);
const sucursales = ids.length ? sucursalesConfiguradas.filter((s) => ids.includes(s.companyId)) : sucursalesConfiguradas;

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const datos = await recetasServicio(db);
if (!datos) throw new Error('No se pudieron leer las recetas (¿la migración 38 está aplicada?).');
const r = await calcularMes({
  mes: m.mes,
  sucursales,
  datos,
  catalogo: await catalogoServicio(db),
  deps: { leer: leerDias, rappi: (cfg) => rappiServicio(db, cfg), guardar: guardarServicio(db), avance: console.log },
});
console.log(
  `\n${m.mes.slice(0, 7)}: ${r.guardadas} de ${sucursales.length} sucursales guardadas en ${Math.round(r.ms / 1000)} s.` +
    (r.incompletas.length ? `\nIncompletas (se avisan en el tablero): ${r.incompletas.join(', ')}` : '') +
    (r.fallidas.length ? `\nSin leer (conservan su cálculo anterior): ${r.fallidas.map((f) => f.companyId).join(', ')}` : ''),
);
```

- [ ] **Step 6: Correr pruebas y tipos**

Run: `npx vitest run tests/portal/consumo-mes-servidor.test.ts tests/portal/consumo-mes.test.ts tests/portal/sucursales-consumo.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

- [ ] **Step 7: Commit**

```bash
git add lib/sucursales/consumo-servidor.ts lib/sucursales/corte-servidor.ts lib/sucursales/consumo-mes-servidor.ts scripts/sucursales/consumo-mes.ts tests/portal/consumo-mes-servidor.test.ts
git commit -m "Consumo nacional: recorrido del mes con la llave de servicio y script consumo-mes"
```

---

### Task 4: Armado nacional, contratos y rutas

**Files:**
- Create: `lib/sucursales/consumo-nacional.ts`
- Modify: `lib/sucursales/contratos.ts` (agregar los tipos al final)
- Create: `app/api/sucursales/consumo-nacional/route.ts`
- Create: `app/api/sucursales/consumo-nacional/desglose/route.ts`
- Test: `tests/portal/consumo-nacional.test.ts`

**Interfaces:**
- Consumes: las RPC de Task 1; `CoberturaMes` y `SinRecetaMes` de Task 2; `ConfigSucursal` y
  `sucursalesAccesibles`; `accesoSucursales` y `json` de `rutas.ts`; `FiltroOrigen`.
- Produces (en `contratos.ts`):

```ts
export interface SucursalConsumoMes {
  companyId: number; nombre: string; ciudad: string; completa: boolean; calculadoEn: string; recetasLeidasEn: string;
  cobertura: Partial<Record<Origen, CoberturaMes>>; sinReceta: Partial<Record<Origen, SinRecetaMes[]>>;
}
export interface InsumoNacional {
  insumoId: string; insumo: string; unidad: string; categoria: string; presentacion: number | null;
  porOrigen: Partial<Record<Origen, number>>; sucursales: number;
  anterior: Partial<Record<Origen, number>>;
}
export interface ConsumoNacional {
  generadoEn: string; mes: string | null; meses: string[];
  sucursales: SucursalConsumoMes[]; insumos: InsumoNacional[];
  /** Cuántas de las sucursales del usuario tienen el mes anterior calculado (0 = sin comparación). */
  sucursalesAnterior: number;
}
export interface DesgloseConsumo { mes: string; filas: { companyId: number; insumoId: string; origen: Origen; cantidad: number }[] }
```

- Produces (en `consumo-nacional.ts`):

```ts
export interface RpcConsumoNacional { meses: string[]; sucursales: {...}[]; insumos: {...}[]; anterior: {...}[]; sucursales_anterior: number }
export function armarConsumoNacional(rpc: RpcConsumoNacional, mes: string | null, sucursales: ConfigSucursal[], generadoEn: string): ConsumoNacional;
export const sumarOrigen: (x: Partial<Record<Origen, number>>, f: FiltroOrigen) => number;
export interface FilaInsumo { insumoId: string; insumo: string; unidad: string; categoria: string; cantidad: number; presentaciones: number | null; presentacion: number | null; cambio: number | null; sucursales: number }
export interface VistaConsumo {
  categorias: { categoria: string; filas: FilaInsumo[] }[];
  ingredientes: number; sucursales: number; incompletas: number;
  cobertura: number | null;          // incluidas ÷ lineas
  sinReceta: { nombre: string; unidades: number; sucursales: number; sinCodigo: boolean }[];
}
export function vistaConsumo(d: ConsumoNacional, f: FiltroOrigen): VistaConsumo;
export function armarDesglose(filas: DesgloseConsumo['filas'], insumoId: string, f: FiltroOrigen, sucursales: SucursalConsumoMes[]): {
  ciudades: { ciudad: string; cantidad: number; parte: number }[];
  sucursales: { companyId: number; nombre: string; ciudad: string; cantidad: number; parte: number }[];
};
```

No hay un cambio total contra el mes anterior: los insumos tienen unidades distintas (g, ml, pza) y no se suman. El cambio
se muestra por insumo. En los números clave va «insumos que suben más de 10 %» (Task 5).

- [ ] **Step 1: Escribir las pruebas que fallan**

```ts
// tests/portal/consumo-nacional.test.ts
import { describe, expect, it } from 'vitest';
import { configDe } from '../../lib/sucursales/config';
import {
  armarConsumoNacional,
  armarDesglose,
  vistaConsumo,
  type RpcConsumoNacional,
} from '../../lib/sucursales/consumo-nacional';

const rpc: RpcConsumoNacional = {
  meses: ['2026-10-01', '2026-09-01'],
  sucursales: [
    { company_id: 513, calculado_en: 'x', recetas_leidas_en: 'y', completa: true,
      cobertura: { mostrador: { lineas: 100, incluidas: 90, generico: 2, sinCodigo: 3, sinEnlace: 5 }, rappi: { lineas: 20, incluidas: 20, generico: 0, sinCodigo: 0, sinEnlace: 0 } },
      sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 4, sinCodigo: false }] } },
    { company_id: 612, calculado_en: 'x', recetas_leidas_en: 'y', completa: false,
      cobertura: { mostrador: { lineas: 50, incluidas: 40, generico: 0, sinCodigo: 0, sinEnlace: 10 } },
      sin_receta: { mostrador: [{ nombre: 'Sandwich', unidades: 6, sinCodigo: false }] } },
  ],
  insumos: [
    { insumo_id: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, origen: 'mostrador', cantidad: 300000, sucursales: 2 },
    { insumo_id: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, origen: 'rappi', cantidad: 12500, sucursales: 1 },
    { insumo_id: 'cf', insumo: 'CAFÉ BLACK', unidad: 'gr', categoria: 'INGREDIENTES', presentacion: 1500, origen: 'mostrador', cantidad: 45000, sucursales: 2 },
    { insumo_id: 'vj', insumo: 'INSUMO VIEJO', unidad: 'pza', categoria: 'INSUMOS', presentacion: null, origen: 'app', cantidad: 5, sucursales: 1 },
  ],
  anterior: [{ insumo_id: 'le', origen: 'mostrador', cantidad: 250000 }],
  sucursales_anterior: 1,
};
const d = armarConsumoNacional(rpc, '2026-10-01', [configDe(513)!, configDe(612)!], '2026-11-05T00:00:00Z');

describe('consumo nacional', () => {
  it('agrupa por insumo con sus orígenes y nombre/ciudad de cada sucursal', () => {
    expect(d.insumos.find((i) => i.insumoId === 'le')!.porOrigen).toEqual({ mostrador: 300000, rappi: 12500 });
    expect(d.sucursales.map((s) => [s.nombre, s.ciudad])).toEqual([
      ['Namóra', 'Guadalajara'],
      ['Cd. Juárez', 'Ciudad Juárez'],
    ]);
  });

  it('vista Todos: categorías, presentaciones, cobertura y cambio contra el mes anterior', () => {
    const v = vistaConsumo(d, 'todos');
    expect(v.categorias.map((c) => c.categoria)).toEqual(['INGREDIENTES', 'INSUMOS', 'PERECEDEROS']);
    const le = v.categorias.find((c) => c.categoria === 'PERECEDEROS')!.filas[0];
    expect(le.cantidad).toBe(312500);
    expect(le.presentaciones).toBeCloseTo(312.5);
    // Anterior solo mostrador (250,000): cambio de 312,500 contra 250,000.
    expect(le.cambio).toBeCloseTo(0.25);
    const viejo = v.categorias.find((c) => c.categoria === 'INSUMOS')!.filas[0];
    expect(viejo.presentaciones).toBeNull();
    expect(v.cobertura).toBeCloseTo((90 + 20 + 40) / (100 + 20 + 50));
    expect(v.incompletas).toBe(1);
    expect(v.sinReceta).toEqual([{ nombre: 'Sandwich', unidades: 10, sucursales: 2, sinCodigo: false }]);
  });

  it('filtro de origen: Rappi solo suma Rappi y oculta insumos sin consumo', () => {
    const v = vistaConsumo(d, 'rappi');
    expect(v.categorias.flatMap((c) => c.filas.map((f) => [f.insumoId, f.cantidad]))).toEqual([['le', 12500]]);
    expect(v.cobertura).toBe(1);
    expect(v.sinReceta).toEqual([]);
  });

  it('sin mes anterior calculado no hay cambio (no es cero)', () => {
    const sin = armarConsumoNacional({ ...rpc, anterior: [], sucursales_anterior: 0 }, '2026-10-01', [configDe(513)!], 'x');
    expect(vistaConsumo(sin, 'todos').categorias.flatMap((c) => c.filas).every((f) => f.cambio === null)).toBe(true);
  });

  it('desglose de un insumo por ciudad y sucursal con su parte', () => {
    const r = armarDesglose(
      [
        { companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 200000 },
        { companyId: 513, insumoId: 'le', origen: 'rappi', cantidad: 12500 },
        { companyId: 612, insumoId: 'le', origen: 'mostrador', cantidad: 100000 },
      ],
      'le',
      'todos',
      d.sucursales,
    );
    expect(r.sucursales.map((s) => [s.nombre, s.cantidad])).toEqual([
      ['Namóra', 212500],
      ['Cd. Juárez', 100000],
    ]);
    expect(r.ciudades[0]).toEqual({ ciudad: 'Guadalajara', cantidad: 212500, parte: 212500 / 312500 });
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/consumo-nacional.test.ts`
Expected: FAIL. No se puede resolver `consumo-nacional`.

- [ ] **Step 3: Implementar `consumo-nacional.ts` y los tipos**

Agregar los tipos de **Interfaces** al final de `lib/sucursales/contratos.ts`. Importar `Origen` de
`./normalizar` y `CoberturaMes` y `SinRecetaMes` de `./consumo-mes`, con `import type`.

```ts
// lib/sucursales/consumo-nacional.ts
import type { ConfigSucursal } from './config';
import type { CoberturaMes, SinRecetaMes } from './consumo-mes';
import type { ConsumoNacional, DesgloseConsumo, InsumoNacional, SucursalConsumoMes } from './contratos';
import type { FiltroOrigen } from './metricas';
import type { Origen } from './normalizar';

/** Consumo nacional (docs/sucursales/17): de las RPC de la migración 38 a la vista. Puro; el filtro de origen se aplica aquí. */
export interface RpcConsumoNacional {
  meses: string[];
  sucursales: {
    company_id: number;
    calculado_en: string;
    recetas_leidas_en: string;
    completa: boolean;
    cobertura: Partial<Record<Origen, CoberturaMes>>;
    sin_receta: Partial<Record<Origen, SinRecetaMes[]>>;
  }[];
  insumos: {
    insumo_id: string;
    insumo: string;
    unidad: string;
    categoria: string;
    presentacion: number | string | null;
    origen: Origen;
    cantidad: number | string;
    sucursales: number;
  }[];
  anterior: { insumo_id: string; origen: Origen; cantidad: number | string }[];
  sucursales_anterior: number;
}

export function armarConsumoNacional(
  rpc: RpcConsumoNacional,
  mes: string | null,
  sucursales: ConfigSucursal[],
  generadoEn: string,
): ConsumoNacional {
  const cfg = new Map(sucursales.map((s) => [s.companyId, s]));
  const insumos = new Map<string, InsumoNacional>();
  for (const x of rpc.insumos) {
    const i = insumos.get(x.insumo_id) ?? {
      insumoId: x.insumo_id,
      insumo: x.insumo,
      unidad: x.unidad,
      categoria: x.categoria,
      presentacion: x.presentacion === null ? null : Number(x.presentacion),
      porOrigen: {},
      sucursales: 0,
      anterior: {},
    };
    i.porOrigen[x.origen] = Number(x.cantidad);
    i.sucursales = Math.max(i.sucursales, x.sucursales);
    insumos.set(x.insumo_id, i);
  }
  for (const a of rpc.anterior) {
    const i = insumos.get(a.insumo_id);
    if (i) i.anterior[a.origen] = Number(a.cantidad);
  }
  return {
    generadoEn,
    mes,
    meses: rpc.meses,
    sucursalesAnterior: rpc.sucursales_anterior,
    sucursales: rpc.sucursales.map(
      (s): SucursalConsumoMes => ({
        companyId: s.company_id,
        nombre: cfg.get(s.company_id)?.nombre ?? String(s.company_id),
        ciudad: cfg.get(s.company_id)?.ciudad ?? 'Sin ciudad',
        completa: s.completa,
        calculadoEn: s.calculado_en,
        recetasLeidasEn: s.recetas_leidas_en,
        cobertura: s.cobertura,
        sinReceta: s.sin_receta,
      }),
    ),
    insumos: [...insumos.values()],
  };
}

export const sumarOrigen = (x: Partial<Record<Origen, number>>, f: FiltroOrigen) =>
  f === 'todos' ? Object.values(x).reduce((a: number, v) => a + (v ?? 0), 0) : (x[f] ?? 0);

const enOrigen = <T>(x: Partial<Record<Origen, T>>, f: FiltroOrigen): T[] =>
  (f === 'todos' ? Object.values(x) : [x[f]]).filter((v): v is T => v !== undefined);

export interface FilaInsumo {
  insumoId: string;
  insumo: string;
  unidad: string;
  categoria: string;
  cantidad: number;
  presentaciones: number | null;
  presentacion: number | null;
  cambio: number | null;
  sucursales: number;
}
export interface VistaConsumo {
  categorias: { categoria: string; filas: FilaInsumo[] }[];
  ingredientes: number;
  sucursales: number;
  incompletas: number;
  cobertura: number | null;
  sinReceta: { nombre: string; unidades: number; sucursales: number; sinCodigo: boolean }[];
}

export function vistaConsumo(d: ConsumoNacional, f: FiltroOrigen): VistaConsumo {
  const filas: FilaInsumo[] = [];
  for (const i of d.insumos) {
    const cantidad = sumarOrigen(i.porOrigen, f);
    if (cantidad <= 0) continue;
    const antes = sumarOrigen(i.anterior, f);
    filas.push({
      insumoId: i.insumoId,
      insumo: i.insumo,
      unidad: i.unidad,
      categoria: i.categoria,
      cantidad,
      presentacion: i.presentacion,
      presentaciones: i.presentacion && i.presentacion > 0 ? cantidad / i.presentacion : null,
      cambio: d.sucursalesAnterior > 0 && antes > 0 ? cantidad / antes - 1 : null,
      sucursales: i.sucursales,
    });
  }
  const porCategoria = new Map<string, FilaInsumo[]>();
  for (const x of filas) porCategoria.set(x.categoria, [...(porCategoria.get(x.categoria) ?? []), x]);
  let lineas = 0;
  let incluidas = 0;
  const sin = new Map<string, { nombre: string; unidades: number; sucursales: Set<number>; sinCodigo: boolean }>();
  for (const s of d.sucursales) {
    for (const c of enOrigen(s.cobertura, f)) {
      lineas += c.lineas;
      incluidas += c.incluidas;
    }
    for (const lista of enOrigen(s.sinReceta, f))
      for (const x of lista) {
        const y = sin.get(x.nombre) ?? { nombre: x.nombre, unidades: 0, sucursales: new Set<number>(), sinCodigo: x.sinCodigo };
        y.unidades += x.unidades;
        y.sucursales.add(s.companyId);
        sin.set(x.nombre, y);
      }
  }
  return {
    categorias: [...porCategoria]
      .sort(([a], [b]) => a.localeCompare(b, 'es'))
      .map(([categoria, fs]) => ({ categoria, filas: fs.sort((a, b) => b.cantidad - a.cantidad || a.insumo.localeCompare(b.insumo, 'es')) })),
    ingredientes: filas.length,
    sucursales: d.sucursales.length,
    incompletas: d.sucursales.filter((s) => !s.completa).length,
    cobertura: lineas ? incluidas / lineas : null,
    sinReceta: [...sin.values()]
      .map((x) => ({ nombre: x.nombre, unidades: x.unidades, sucursales: x.sucursales.size, sinCodigo: x.sinCodigo }))
      .sort((a, b) => b.unidades - a.unidades),
  };
}

export function armarDesglose(
  filas: DesgloseConsumo['filas'],
  insumoId: string,
  f: FiltroOrigen,
  sucursales: SucursalConsumoMes[],
) {
  const info = new Map(sucursales.map((s) => [s.companyId, s]));
  const porSucursal = new Map<number, number>();
  for (const x of filas)
    if (x.insumoId === insumoId && (f === 'todos' || x.origen === f))
      porSucursal.set(x.companyId, (porSucursal.get(x.companyId) ?? 0) + x.cantidad);
  const total = [...porSucursal.values()].reduce((a, b) => a + b, 0) || 1;
  const lista = [...porSucursal].map(([companyId, cantidad]) => ({
    companyId,
    nombre: info.get(companyId)?.nombre ?? String(companyId),
    ciudad: info.get(companyId)?.ciudad ?? 'Sin ciudad',
    cantidad,
    parte: cantidad / total,
  }));
  const ciudades = new Map<string, number>();
  for (const s of lista) ciudades.set(s.ciudad, (ciudades.get(s.ciudad) ?? 0) + s.cantidad);
  return {
    ciudades: [...ciudades]
      .map(([ciudad, cantidad]) => ({ ciudad, cantidad, parte: cantidad / total }))
      .sort((a, b) => b.cantidad - a.cantidad),
    sucursales: lista.sort((a, b) => b.cantidad - a.cantidad),
  };
}
```

- [ ] **Step 4: Rutas**

Antes, leer la guía de route handlers en `node_modules/next/dist/docs/` (buscar `route` con
`ls node_modules/next/dist/docs`) y confirmar que el patrón de `app/api/sucursales/tablero/route.ts` sigue vigente.

```ts
// app/api/sucursales/consumo-nacional/route.ts
import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import { armarConsumoNacional, type RpcConsumoNacional } from '@/lib/sucursales/consumo-nacional';
import type { ConsumoNacional } from '@/lib/sucursales/contratos';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

/**
 * Consumo nacional por mes (docs/sucursales/17): solo lee lo que guardó el script consumo-mes, de las sucursales
 * asignadas Y configuradas del usuario. Sin ?mes, el último calculado.
 */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const texto = new URL(req.url).searchParams.get('mes');
  const pedido = texto ? leerMes(texto) : null;
  if (texto && !pedido) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const companias = sucursales.map((s) => s.companyId);
  const leer = (mes: string) => a.db.rpc('sucursales_consumo_nacional', { p_mes: mes, p_companias: companias });
  // Sin mes: se pide un mes cualquiera para conocer los calculados y se relee el último.
  let mes = pedido?.mes ?? null;
  let r = await leer(mes ?? '1900-01-01');
  if (!r.error && !mes) {
    mes = (r.data as unknown as RpcConsumoNacional).meses[0] ?? null;
    if (mes) r = await leer(mes);
  }
  if (r.error || !r.data) {
    console.error('[sucursales] consumo nacional', r.error);
    return json({ error: 'No se pudo leer el consumo.' }, 503);
  }
  return json<ConsumoNacional>(
    armarConsumoNacional(r.data as unknown as RpcConsumoNacional, mes, sucursales, new Date().toISOString()),
  );
}
```

```ts
// app/api/sucursales/consumo-nacional/desglose/route.ts
import { accesoSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { leerMes } from '@/lib/sucursales/consumo-mes';
import type { DesgloseConsumo } from '@/lib/sucursales/contratos';
import type { Origen } from '@/lib/sucursales/normalizar';
import { json } from '@/lib/sucursales/rutas';

export const runtime = 'nodejs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Consumo por sucursal y origen de un insumo (?insumo) o de todos (para exportar). */
export async function GET(req: Request) {
  const a = await accesoSucursales();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const sucursales = sucursalesAccesibles(a.companias);
  if (!sucursales.length) return json({ error: 'Sin sucursales asignadas.' }, 404);
  const q = new URL(req.url).searchParams;
  const m = leerMes(q.get('mes') ?? '');
  if (!m) return json({ error: 'Mes inválido (AAAA-MM).' }, 400);
  const insumo = q.get('insumo');
  if (insumo && !UUID.test(insumo)) return json({ error: 'Insumo inválido.' }, 400);
  const r = await a.db.rpc('sucursales_consumo_desglose', {
    p_mes: m.mes,
    p_companias: sucursales.map((s) => s.companyId),
    p_insumo: insumo,
  });
  if (r.error || !r.data) {
    console.error('[sucursales] desglose de consumo', r.error);
    return json({ error: 'No se pudo leer el desglose.' }, 503);
  }
  const filas = (r.data as { company_id: number; insumo_id: string; origen: Origen; cantidad: number | string }[]).map(
    (x) => ({ companyId: x.company_id, insumoId: x.insumo_id, origen: x.origen, cantidad: Number(x.cantidad) }),
  );
  return json<DesgloseConsumo>({ mes: m.mes, filas });
}
```

- [ ] **Step 5: Correr pruebas y tipos**

Run: `npx vitest run tests/portal/consumo-nacional.test.ts`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

- [ ] **Step 6: Commit**

```bash
git add lib/sucursales/consumo-nacional.ts lib/sucursales/contratos.ts app/api/sucursales/consumo-nacional tests/portal/consumo-nacional.test.ts
git commit -m "Consumo nacional: armado por origen, desglose y rutas del Tablero México"
```

---

### Task 5: Pestaña Consumo en el Tablero México

**Files:**
- Create: `components/sucursales/consumo-nacional.tsx`
- Create: `components/sucursales/vistas-mexico.tsx`
- Modify: `app/(sucursales)/sucursales/mexico/page.tsx`: cambiar `<TableroMexicoVista />` por
  `<VistasMexico vistaInicial={...} />`, leyendo `searchParams` como en `app/(sucursales)/sucursales/[companyId]/page.tsx:13-22`.
- Modify: `tests/portal/vista/tablero-mexico.tsx`: simular las dos rutas nuevas.
- Test: `tests/portal/consumo-nacional-ui.test.tsx`

**Interfaces:**
- Consumes:
  - `ConsumoNacional` y `DesgloseConsumo` (Task 4);
  - `vistaConsumo`, `armarDesglose` y `FilaInsumo` (Task 4);
  - `useLectura` de `components/sucursales/use-lectura.ts`;
  - `ErrorCarga` y `Esqueleto` de `./estados`;
  - `Tarjeta` y `Vacio` de `@/components/portal/piezas`;
  - `filtrosOrigen` y `etiquetaOrigen` de `metricas.ts`.
- Produces:
  - `export function ConsumoNacionalVista(): JSX.Element`;
  - `export function VistasMexico({ vistaInicial }: { vistaInicial: 'ventas' | 'consumo' }): JSX.Element`;
  - `export function nombreMes(mes: string): string` (por ejemplo, `'2026-10-01'` → `'Octubre 2026'`).

- [ ] **Step 1: Escribir las pruebas de UI que fallan**

```tsx
// tests/portal/consumo-nacional-ui.test.tsx
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ConsumoNacionalVista, nombreMes } from '../../components/sucursales/consumo-nacional';
import type { ConsumoNacional } from '../../lib/sucursales/contratos';

const datos = (mes: string): ConsumoNacional => ({
  generadoEn: '2026-11-05T00:00:00Z',
  mes,
  meses: ['2026-10-01', '2026-09-01'],
  sucursalesAnterior: 1,
  sucursales: [
    { companyId: 513, nombre: 'Namóra', ciudad: 'Guadalajara', completa: true, calculadoEn: 'x', recetasLeidasEn: 'y',
      cobertura: { mostrador: { lineas: 10, incluidas: 9, generico: 0, sinCodigo: 0, sinEnlace: 1 } },
      sinReceta: { mostrador: [{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }] } },
  ],
  insumos: [
    { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000,
      porOrigen: { mostrador: mes === '2026-10-01' ? 312500 : 250000 }, sucursales: 1, anterior: { mostrador: 250000 } },
  ],
});
const fetchFalso = vi.fn(async (url: string) => {
  const u = new URL(url, 'http://x');
  if (u.pathname.endsWith('/desglose'))
    return Response.json({ mes: '2026-10-01', filas: [{ companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 312500 }] });
  const mes = u.searchParams.get('mes');
  return Response.json(datos(mes ? `${mes}-01` : '2026-10-01'));
});
afterEach(() => fetchFalso.mockClear());

describe('pestaña Consumo del Tablero México', () => {
  it('abre en el último mes calculado, con presentaciones y cambio', async () => {
    vi.stubGlobal('fetch', fetchFalso);
    render(<ConsumoNacionalVista />);
    expect(await screen.findByText('LECHE ENTERA')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Octubre 2026' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText(/312\.5 × 1,000 ml/)).toBeInTheDocument();
    expect(screen.getByText('+25 %')).toBeInTheDocument();
    expect(screen.getByText('90 %')).toBeInTheDocument(); // cobertura
  });

  it('cambia de mes con su botón y abre el desglose de un insumo', async () => {
    vi.stubGlobal('fetch', fetchFalso);
    render(<ConsumoNacionalVista />);
    fireEvent.click(await screen.findByRole('button', { name: 'Septiembre 2026' }));
    await waitFor(() => expect(fetchFalso).toHaveBeenCalledWith(expect.stringContaining('mes=2026-09'), expect.anything()));
    fireEvent.click(await screen.findByRole('button', { name: /LECHE ENTERA/ }));
    const panel = await screen.findByRole('region', { name: /Desglose de LECHE ENTERA/ });
    expect(within(panel).getByText('Namóra')).toBeInTheDocument();
    expect(within(panel).getByText('Guadalajara')).toBeInTheDocument();
  });

  it('nombre de mes en español', () => {
    expect(nombreMes('2026-10-01')).toBe('Octubre 2026');
  });
});
```

Ajustar la llamada esperada a `fetch` a la firma real de `useLectura`. Si llama `fetch(url, { signal, ... })`, el
`expect.anything()` cubre el segundo argumento.

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/consumo-nacional-ui.test.tsx`
Expected: FAIL. No se puede resolver `components/sucursales/consumo-nacional`.

- [ ] **Step 3: Implementar `consumo-nacional.tsx`**

Reglas de presentación:

- **Cantidades:** `Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 })`. Con más de 10,000 g o ml se muestra
  además el equivalente en kg o L. Usar `cantidad` de `components/sucursales/consumo.tsx` si ya lo resuelve.
- **Presentaciones:** `${n} × ${presentacion} ${unidad}` (por ejemplo, «312.5 × 1,000 ml»).
- **Cambio:** `+25 %` en verde si sube más de 3 %, rojo si baja más de 3 %; neutro entre −3 % y +3 %; «—» si es
  `null`.
- **Cobertura:** en porcentaje entero.

```tsx
// components/sucursales/consumo-nacional.tsx
'use client';
import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Download } from 'lucide-react';
import type { ConsumoNacional, DesgloseConsumo } from '@/lib/sucursales/contratos';
import { armarDesglose, vistaConsumo, type FilaInsumo } from '@/lib/sucursales/consumo-nacional';
import { etiquetaOrigen, filtrosOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { cn } from '@/lib/utils';
import { ErrorCarga, Esqueleto } from './estados';
import { useLectura } from './use-lectura';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
export const nombreMes = (mes: string) => `${MESES[Number(mes.slice(5, 7)) - 1]} ${mes.slice(0, 4)}`;
const num = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 1 });
const pct = (x: number) => `${Math.round(x * 100)} %`;
const cambioTexto = (c: number | null) => (c === null ? '—' : `${c > 0 ? '+' : ''}${Math.round(c * 100)} %`);

/** Consumo nacional por mes (docs/sucursales/17): lee lo que guardó el script; el filtro de origen se aplica aquí. */
export function ConsumoNacionalVista() {
  const [mes, setMes] = useState<string | null>(null);
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const { datos, error, recargar } = useLectura<ConsumoNacional>(
    `/api/sucursales/consumo-nacional${mes ? `?mes=${mes.slice(0, 7)}` : ''}`,
  );
  const v = useMemo(() => (datos ? vistaConsumo(datos, origen) : null), [datos, origen]);
  if (!datos || !v) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={3} />;
  if (!datos.mes)
    return (
      <Tarjeta>
        <Vacio titulo="Aún no hay meses calculados">
          El consumo de un mes se calcula al cerrarlo con el script consumo-mes (docs/sucursales/17).
        </Vacio>
      </Tarjeta>
    );
  return (
    <div className="tablero-mx space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Mes" className="flex flex-wrap gap-2">
          {datos.meses.map((m) => (
            <button
              key={m}
              type="button"
              aria-pressed={m === datos.mes}
              onClick={() => {
                setMes(m);
                setAbierto(null);
              }}
              className={cn('rounded-full px-3 py-1.5 text-sm font-semibold', m === datos.mes ? 'bg-ink text-crema' : 'bg-muted')}
            >
              {nombreMes(m)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Origen" className="flex flex-wrap gap-1.5">
          {filtrosOrigen.map((o) => (
            <button
              key={o}
              type="button"
              aria-pressed={o === origen}
              onClick={() => setOrigen(o)}
              className={cn('rounded-full px-3 py-1 text-xs font-semibold', o === origen ? 'bg-ink text-crema' : 'bg-muted')}
            >
              {etiquetaOrigen[o]}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Numero titulo="Ingredientes con consumo" valor={num.format(v.ingredientes)} />
        <Numero titulo="Sucursales" valor={num.format(v.sucursales)} nota={v.incompletas ? `${v.incompletas} con el mes incompleto` : undefined} />
        <Numero titulo="Cobertura" valor={v.cobertura === null ? '—' : pct(v.cobertura)} nota="líneas con receta" />
        <Numero
          titulo="Contra el mes anterior"
          valor={datos.sucursalesAnterior ? `${v.categorias.flatMap((c) => c.filas).filter((f) => (f.cambio ?? 0) > 0.1).length} suben >10 %` : '—'}
          nota={datos.sucursalesAnterior && datos.sucursalesAnterior < v.sucursales ? `solo ${datos.sucursalesAnterior} sucursales con mes anterior` : undefined}
        />
      </div>

      {v.incompletas > 0 && (
        <p role="status" className="rounded-xl bg-warn-soft px-3 py-2 text-sm text-warn">
          {v.incompletas} sucursales tienen días sin leer completos en {nombreMes(datos.mes)}: su consumo puede ser menor
          al real.
        </p>
      )}

      <BotonExportar datos={datos} origen={origen} filas={v.categorias.flatMap((c) => c.filas)} />

      {v.categorias.map((c) => (
        <Tarjeta key={c.categoria}>
          <h3 className="font-display text-base font-bold">{c.categoria}</h3>
          <table className="mt-3 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted-foreground">
                <th className="py-1">Ingrediente</th>
                <th className="py-1 text-right">Consumo</th>
                <th className="hidden py-1 text-right sm:table-cell">Presentaciones</th>
                <th className="py-1 text-right">Vs mes anterior</th>
              </tr>
            </thead>
            <tbody>
              {c.filas.map((f) => (
                <Fragment key={f.insumoId}>
                  <FilaTabla fila={f} abierta={abierto === f.insumoId} alAbrir={() => setAbierto(abierto === f.insumoId ? null : f.insumoId)} />
                  {abierto === f.insumoId && (
                    <tr>
                      <td colSpan={4}>
                        <Desglose datos={datos} fila={f} origen={origen} />
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </Tarjeta>
      ))}

      {v.sinReceta.length > 0 && (
        <Tarjeta>
          <h3 className="font-display text-base font-bold">Vendidos sin receta (no cuentan en el consumo)</h3>
          <ul className="mt-2 divide-y text-sm">
            {v.sinReceta.map((s) => (
              <li key={s.nombre} className="flex justify-between py-1.5">
                <span>{s.nombre}{s.sinCodigo ? ' · sin código' : ''}</span>
                <span className="text-muted-foreground">{num.format(s.unidades)} u · {s.sucursales} suc.</span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
    </div>
  );
}

function Numero({ titulo, valor, nota }: { titulo: string; valor: string; nota?: string }) {
  return (
    <div className="placa px-4 py-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="font-display text-2xl font-bold">{valor}</p>
      {nota && <p className="text-xs text-muted-foreground">{nota}</p>}
    </div>
  );
}

function FilaTabla({ fila: f, abierta, alAbrir }: { fila: FilaInsumo; abierta: boolean; alAbrir: () => void }) {
  const Icono = abierta ? ChevronDown : ChevronRight;
  return (
    <tr className="border-t">
      <td className="py-1.5">
        <button type="button" aria-expanded={abierta} onClick={alAbrir} className="flex items-center gap-1 text-left font-medium">
          <Icono size={14} aria-hidden="true" />
          {f.insumo}
        </button>
      </td>
      <td className="py-1.5 text-right tabular-nums">{num.format(f.cantidad)} {f.unidad}</td>
      <td className="hidden py-1.5 text-right tabular-nums sm:table-cell">
        {f.presentaciones === null ? '—' : `${num.format(f.presentaciones)} × ${num.format(f.presentacion!)} ${f.unidad}`}
      </td>
      <td
        className={cn(
          'py-1.5 text-right tabular-nums',
          f.cambio !== null && f.cambio > 0.03 && 'text-ok',
          f.cambio !== null && f.cambio < -0.03 && 'text-bad',
        )}
      >
        {cambioTexto(f.cambio)}
      </td>
    </tr>
  );
}

function Desglose({ datos, fila, origen }: { datos: ConsumoNacional; fila: FilaInsumo; origen: FiltroOrigen }) {
  const { datos: d, error, recargar } = useLectura<DesgloseConsumo>(
    `/api/sucursales/consumo-nacional/desglose?mes=${datos.mes!.slice(0, 7)}&insumo=${fila.insumoId}`,
  );
  if (!d) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={1} />;
  const r = armarDesglose(d.filas, fila.insumoId, origen, datos.sucursales);
  return (
    <section aria-label={`Desglose de ${fila.insumo}`} className="grid gap-4 bg-muted/40 p-3 sm:grid-cols-2">
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground">Por ciudad</h4>
        <ul className="mt-1 space-y-1 text-sm">
          {r.ciudades.map((c) => (
            <li key={c.ciudad} className="flex justify-between gap-2">
              <span>{c.ciudad}</span>
              <span className="tabular-nums">{num.format(c.cantidad)} {fila.unidad} · {pct(c.parte)}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <h4 className="text-xs font-semibold text-muted-foreground">Por sucursal</h4>
        <ul className="mt-1 max-h-64 space-y-1 overflow-y-auto text-sm">
          {r.sucursales.map((s) => (
            <li key={s.companyId} className="flex justify-between gap-2">
              <span>{s.nombre}</span>
              <span className="tabular-nums">{num.format(s.cantidad)} {fila.unidad} · {pct(s.parte)}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}

function BotonExportar(_: { datos: ConsumoNacional; origen: FiltroOrigen; filas: FilaInsumo[] }) {
  return null; // Task 6
}
```

Clases de color: usar las que ya usa `tablero-mexico.tsx` (`text-ok`, `text-bad`, `bg-warn-soft` y `placa`). Si alguna
no existe en `globals.css` o `tablero-mexico.css`, cambiarla por la equivalente que use ese archivo. No inventar
tokens.

- [ ] **Step 4: `vistas-mexico.tsx` y la página**

```tsx
// components/sucursales/vistas-mexico.tsx
'use client';
import { useState } from 'react';
import { BarChart3, Package } from 'lucide-react';
import { cn } from '@/lib/utils';
import { TableroMexicoVista } from './tablero-mexico';
import { ConsumoNacionalVista } from './consumo-nacional';

type Vista = 'ventas' | 'consumo';
const VISTAS: { id: Vista; nombre: string; icono: typeof BarChart3 }[] = [
  { id: 'ventas', nombre: 'Ventas', icono: BarChart3 },
  { id: 'consumo', nombre: 'Consumo', icono: Package },
];

/** Tablero de México en dos vistas; la elegida viaja en la URL (?vista=consumo), como las secciones de cada sucursal. */
export function VistasMexico({ vistaInicial }: { vistaInicial: Vista }) {
  const [vista, setVista] = useState<Vista>(vistaInicial);
  const elegir = (v: Vista) => {
    setVista(v);
    const p = new URLSearchParams(window.location.search);
    if (v === 'ventas') p.delete('vista');
    else p.set('vista', v);
    const s = p.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${s ? `?${s}` : ''}`);
  };
  return (
    <div className="space-y-6">
      <nav aria-label="Vistas del Tablero de México" className="rounded-2xl bg-ink p-1.5 shadow-card">
        <ul className="grid auto-cols-fr grid-flow-col gap-1.5">
          {VISTAS.map((x) => {
            const Icono = x.icono;
            const activa = x.id === vista;
            return (
              <li key={x.id}>
                <button
                  type="button"
                  aria-current={activa ? 'page' : undefined}
                  onClick={() => elegir(x.id)}
                  className={cn(
                    'flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2.5 font-display text-sm font-bold',
                    activa ? 'bg-crema text-ink shadow-card' : 'text-white/75 hover:bg-white/10 hover:text-white',
                  )}
                >
                  <Icono size={18} aria-hidden="true" />
                  {x.nombre}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      {vista === 'ventas' ? <TableroMexicoVista /> : <ConsumoNacionalVista />}
    </div>
  );
}
```

En `app/(sucursales)/sucursales/mexico/page.tsx`:

- agregar `{ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }`;
- leer `const q = await searchParams;`;
- renderizar `<VistasMexico vistaInicial={q.vista === 'consumo' ? 'consumo' : 'ventas'} />` en lugar de
  `<TableroMexicoVista />`.

Cambiar la descripción del encabezado:

- con todas las sucursales: `La venta y el consumo de las ${n} sucursales, sumados.`;
- con algunas: `… de tus ${n} sucursales …`.

Antes de editar, revisar en `node_modules/next/dist/docs/` que `searchParams` como `Promise` sigue siendo el patrón de
páginas.

- [ ] **Step 5: Datos sintéticos en la prueba visual**

En `tests/portal/vista/tablero-mexico.tsx`, dentro del `window.fetch` simulado y antes del `return fetchNavegador`:

- `/api/sucursales/consumo-nacional`: responde un `ConsumoNacional` armado con `armarConsumoNacional`, con:
  - tres meses (agosto, septiembre y octubre de 2026);
  - unos 20 insumos de 4 categorías con cantidades realistas (leche en ml, café en gr, vasos en pza);
  - todas las sucursales configuradas, una de ellas incompleta;
  - mes anterior para septiembre y octubre.
- `/api/sucursales/consumo-nacional/desglose`: reparte la cantidad del insumo entre las sucursales configuradas con
  pesos fijos.
- `&consumo-vacio=1` responde `meses: []` y `mes: null`.

Renderizar `VistasMexico` en lugar de `TableroMexicoVista` en `VistaTableroMexico`, con
`vistaInicial={parametros.get('vista') === 'consumo' ? 'consumo' : 'ventas'}`.

- [ ] **Step 6: Correr pruebas, tipos y revisión visual**

Run: `npx vitest run tests/portal/consumo-nacional-ui.test.tsx tests/portal/sucursales-ui.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

Run: `npm run prueba:visual`. Abrir `?tablero-mexico&vista=consumo` y revisar:

- escritorio, 375 px y modo día y noche;
- sin desborde horizontal de página;
- cambiar de mes y de origen;
- abrir un desglose;
- el estado vacío con `&consumo-vacio=1`.

- [ ] **Step 7: Commit**

```bash
git add components/sucursales/consumo-nacional.tsx components/sucursales/vistas-mexico.tsx "app/(sucursales)/sucursales/mexico/page.tsx" tests/portal/vista/tablero-mexico.tsx tests/portal/consumo-nacional-ui.test.tsx
git commit -m "Tablero México: pestaña Consumo con meses, origen, categorías y desglose"
```

---

### Task 6: Exportar a Excel

**Files:**
- Modify: `components/sucursales/consumo-nacional.tsx` (reemplazar `BotonExportar`)
- Create: `lib/sucursales/consumo-excel.ts` (puro: arma las hojas)
- Test: `tests/portal/consumo-excel.test.ts`

**Interfaces:**
- Consumes: `ConsumoNacional`, `DesgloseConsumo`, `FilaInsumo`, `FiltroOrigen` y `etiquetaOrigen`.
- Produces:

```ts
export function hojasConsumo(a: { datos: ConsumoNacional; origen: FiltroOrigen; filas: FilaInsumo[]; desglose: DesgloseConsumo['filas'] }): {
  nombreArchivo: string;                 // consumo-nacional-2026-10-todos.xlsx
  resumen: Record<string, string | number>[];      // hoja «Consumo»
  porSucursal: Record<string, string | number>[];  // hoja «Por sucursal»
};
```

- [ ] **Step 1: Prueba que falla**

```ts
// tests/portal/consumo-excel.test.ts
import { describe, expect, it } from 'vitest';
import { hojasConsumo } from '../../lib/sucursales/consumo-excel';
import type { ConsumoNacional } from '../../lib/sucursales/contratos';

const datos = {
  generadoEn: 'x', mes: '2026-10-01', meses: ['2026-10-01'], sucursalesAnterior: 0,
  sucursales: [{ companyId: 513, nombre: 'Namóra', ciudad: 'Guadalajara', completa: true, calculadoEn: 'x', recetasLeidasEn: 'y', cobertura: {}, sinReceta: {} }],
  insumos: [{ insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', presentacion: 1000, porOrigen: { mostrador: 3000, rappi: 500 }, sucursales: 1, anterior: {} }],
} satisfies ConsumoNacional;

describe('exportar consumo', () => {
  it('hoja de consumo y hoja por sucursal con el filtro de origen', () => {
    const h = hojasConsumo({
      datos,
      origen: 'rappi',
      filas: [{ insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'PERECEDEROS', cantidad: 500, presentaciones: 0.5, presentacion: 1000, cambio: null, sucursales: 1 }],
      desglose: [
        { companyId: 513, insumoId: 'le', origen: 'mostrador', cantidad: 3000 },
        { companyId: 513, insumoId: 'le', origen: 'rappi', cantidad: 500 },
      ],
    });
    expect(h.nombreArchivo).toBe('consumo-nacional-2026-10-rappi.xlsx');
    expect(h.resumen).toEqual([
      { Categoría: 'PERECEDEROS', Ingrediente: 'LECHE ENTERA', Unidad: 'ml', Consumo: 500, Presentación: 1000, Presentaciones: 0.5, 'Vs mes anterior': '' },
    ]);
    expect(h.porSucursal).toEqual([
      { Sucursal: 'Namóra', Ciudad: 'Guadalajara', Categoría: 'PERECEDEROS', Ingrediente: 'LECHE ENTERA', Unidad: 'ml', Consumo: 500 },
    ]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/consumo-excel.test.ts`
Expected: FAIL. No se puede resolver `consumo-excel`.

- [ ] **Step 3: Implementar**

```ts
// lib/sucursales/consumo-excel.ts
import type { FilaInsumo } from './consumo-nacional';
import type { ConsumoNacional, DesgloseConsumo } from './contratos';
import type { FiltroOrigen } from './metricas';

/** Hojas del Excel de consumo nacional (docs/sucursales/17): el mes y el origen que se ven en pantalla. */
export function hojasConsumo(a: {
  datos: ConsumoNacional;
  origen: FiltroOrigen;
  filas: FilaInsumo[];
  desglose: DesgloseConsumo['filas'];
}) {
  const insumo = new Map(a.datos.insumos.map((i) => [i.insumoId, i]));
  const sucursal = new Map(a.datos.sucursales.map((s) => [s.companyId, s]));
  const suma = new Map<string, number>();
  for (const x of a.desglose)
    if (a.origen === 'todos' || x.origen === a.origen) {
      const k = `${x.companyId}|${x.insumoId}`;
      suma.set(k, (suma.get(k) ?? 0) + x.cantidad);
    }
  return {
    nombreArchivo: `consumo-nacional-${a.datos.mes!.slice(0, 7)}-${a.origen}.xlsx`,
    resumen: a.filas.map((f) => ({
      Categoría: f.categoria,
      Ingrediente: f.insumo,
      Unidad: f.unidad,
      Consumo: f.cantidad,
      Presentación: f.presentacion ?? '',
      Presentaciones: f.presentaciones ?? '',
      'Vs mes anterior': f.cambio === null ? '' : f.cambio,
    })),
    porSucursal: [...suma]
      .filter(([, c]) => c > 0)
      .map(([k, c]) => {
        const [companyId, insumoId] = k.split('|');
        const s = sucursal.get(Number(companyId));
        const i = insumo.get(insumoId);
        return {
          Sucursal: s?.nombre ?? companyId,
          Ciudad: s?.ciudad ?? '',
          Categoría: i?.categoria ?? '',
          Ingrediente: i?.insumo ?? insumoId,
          Unidad: i?.unidad ?? '',
          Consumo: c,
        };
      })
      .sort((x, y) => String(x.Sucursal).localeCompare(String(y.Sucursal), 'es') || String(x.Ingrediente).localeCompare(String(y.Ingrediente), 'es')),
  };
}
```

Reemplazar `BotonExportar` en `consumo-nacional.tsx`. Usa el mismo patrón de import dinámico que
`components/portal/tabla-resumen.tsx:80-100`:

```tsx
function BotonExportar({ datos, origen, filas }: { datos: ConsumoNacional; origen: FiltroOrigen; filas: FilaInsumo[] }) {
  const [ocupado, setOcupado] = useState(false);
  const [fallo, setFallo] = useState(false);
  const exportar = async () => {
    setOcupado(true);
    setFallo(false);
    try {
      const r = await fetch(`/api/sucursales/consumo-nacional/desglose?mes=${datos.mes!.slice(0, 7)}`);
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as DesgloseConsumo;
      const h = hojasConsumo({ datos, origen, filas, desglose: d.filas });
      const XLSX = await import('xlsx');
      const libro = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.resumen), 'Consumo');
      XLSX.utils.book_append_sheet(libro, XLSX.utils.json_to_sheet(h.porSucursal), 'Por sucursal');
      XLSX.writeFile(libro, h.nombreArchivo);
    } catch {
      setFallo(true);
    } finally {
      setOcupado(false);
    }
  };
  return (
    <div className="flex items-center gap-2">
      <button type="button" onClick={exportar} disabled={ocupado} className="inline-flex items-center gap-2 rounded-full bg-ink px-3 py-1.5 text-sm font-semibold text-crema disabled:opacity-60">
        <Download size={16} aria-hidden="true" />
        {ocupado ? 'Preparando…' : 'Exportar a Excel'}
      </button>
      {fallo && <span role="alert" className="text-sm text-bad">No se pudo exportar. Intenta de nuevo.</span>}
    </div>
  );
}
```

Agregar `import { hojasConsumo } from '@/lib/sucursales/consumo-excel';`.

- [ ] **Step 4: Correr pruebas y tipos**

Run: `npx vitest run tests/portal/consumo-excel.test.ts tests/portal/consumo-nacional-ui.test.tsx`
Expected: PASS.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

- [ ] **Step 5: Commit**

```bash
git add lib/sucursales/consumo-excel.ts components/sucursales/consumo-nacional.tsx tests/portal/consumo-excel.test.ts
git commit -m "Consumo nacional: exportar a Excel (consumo y por sucursal)"
```

---

### Task 7: Documentación y verificación completa

**Files:**
- Create: `docs/sucursales/17-CONSUMO-NACIONAL.md`

- [ ] **Step 1: Escribir el doc**

En el estilo de `docs/sucursales/16-TABLERO-MEXICO.md`, con estas secciones:

- **Qué muestra:** la pestaña Consumo y sus bloques.
- **Cómo funciona:** el diagrama script → RPC de guardado → tablas → RPC de lectura → rutas → vista. Explicar:
  - por qué Rappi se lee día por día (límite de 1,000 filas);
  - por qué las sucursales van una por una.
- **Mismas cifras que cada sucursal:** `consumir` por origen con la evidencia de todo el mes.
- **Verificación:** las pruebas de cada archivo.
- **Pasos en producción**, cada uno con OK:
  1. Merge del PR; aplica la migración 38. Antes, ensayo con ROLLBACK.
  2. Correr octubre (lo hace Sebastián):

     ```bash
     npx.cmd tsx --conditions=react-server scripts/sucursales/consumo-mes.ts --mes 2026-10
     ```

  3. Agosto y septiembre, igual, si se quieren sus botones.
  4. Paridad real: en 2 o 3 sucursales, comparar el consumo guardado de octubre con su sección Consumo del 1 al 31
     de octubre, insumo por insumo.
  5. Cada mes, al cerrar: correr el mes.

- [ ] **Step 2: Verificación completa**

Run: `npx vitest run`
Expected: todo en verde salvo `tests/migracion/paridad.test.ts`, que ya fallaba en `main` antes de esta rama (Excel
local). Si falla algo más, arreglarlo antes de seguir.

Run: `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"`
Expected: sin salida.

Run: `npm run build`
Expected: compila sin errores. Si pide variables de entorno de Supabase, anotarlo y seguir; no tocar `.env.local`.

- [ ] **Step 3: Commit**

```bash
git add docs/sucursales/17-CONSUMO-NACIONAL.md
git commit -m "Doc 17: consumo nacional de ingredientes por mes"
```
