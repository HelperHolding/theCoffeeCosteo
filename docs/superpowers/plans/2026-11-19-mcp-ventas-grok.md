# Ventas nacionales en el MCP para Grok — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grok (grok.com), conectado como conector MCP remoto a `/mcp`, consulta solo en lectura las ventas de las
sucursales asignadas a la cuenta del portal con la que inició sesión.

**Architecture:** Un predicado SQL nuevo, `ventas_lectura(company, modulo)`, abre la lectura de ventas a tokens OAuth
cuyo `client_id` esté en la lista blanca `mcp_ventas_clientes`. Solo las RPC de lectura lo usan; las de escritura
siguen con `sucursales_acceso`. Cinco herramientas nuevas en `lib/mcp/ventas.ts` llaman esas RPC, convierten
centavos a pesos y se registran únicamente en el servidor MCP, no en el chat del portal. El consentimiento OAuth
acepta además la URL de retorno de Grok.

**Tech Stack:** Next.js (app router), `@modelcontextprotocol/server`, zod 4, Supabase (Postgres + OAuth 2.1),
vitest, PGlite (`scripts/db/pglite`) para pruebas de base.

**Spec:** `docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md`

## Global Constraints

- Solo lectura: ninguna función nueva escribe; las políticas `oauth_sin_*` y las RPC de escritura no cambian.
- Las RPC de escritura (`sucursales_consumo_*`, `rappi_portal_*`, etc.) siguen usando `sucursales_acceso`, que niega
  todo token OAuth.
- Un token OAuth ve ventas solo si su `client_id` está en `mcp_ventas_clientes` **y** la cuenta tiene perfil
  activo, el módulo (`sucursales` o `bi`) y la sucursal asignada.
- Montos en MXN con dos decimales: toda clave `x_cent` se publica como `x` = `x_cent / 100`.
- Fechas `AAAA-MM-DD` en la zona local de cada sucursal.
- Límites: 120 días por consulta; 7 días con horas; 400 sucursales; páginas de máximo 50.
- Nunca se estima: un día incompleto se reporta con `completa: false`.
- Las herramientas de ventas se registran solo en `/mcp` (`registrarHerramientas`), **no** en `crearConsultas`,
  que también usa el chat del portal (`lib/chat/herramientas.ts`).
- Textos visibles en español.
- Migración nueva: `supabase/migrations/20261119000061_mcp_ventas.sql`.

## Review Focus

- Un `client_id` en la lista blanca pero de una cuenta **sin** la sucursal asignada no ve ventas de esa sucursal → Task 1.
- Una sucursal con módulo `bi` pero sin configuración en `lib/sucursales/config.ts` (no tiene zona) no debe tumbar
  `ventas_resumen`; va en `ignoradas` → Task 3.
- Fechas imposibles (`2026-02-30`) o `desde > hasta` deben dar un error legible, no «No se pudo completar» → Task 2.
- Cliente no autorizado: el mensaje debe incluir su `client_id` para darlo de alta → Task 3.
- `ventas_por_producto` con `canal` filtrado no debe mezclar importes de otros canales → Task 4.

---

## File Structure

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261119000061_mcp_ventas.sql` (nuevo) | Lista blanca, `ventas_lectura`, RPC nuevas y predicado nuevo en las RPC de lectura |
| `tests/db/mcp-ventas.test.ts` (nuevo) | Acceso y RPC en PGlite |
| `lib/mcp/consulta.ts` (nuevo) | Tipo `Consulta`, `consulta()`, `ErrorConsulta`, `exigir`, `resultadoPagina`, `aPesos`, esquemas comunes |
| `lib/mcp/herramientas.ts` (modificar) | Usa `consulta.ts`; `registrarHerramientas` agrega ventas y deja pasar `ErrorConsulta` |
| `lib/mcp/ventas.ts` (nuevo) | Las cinco herramientas de ventas |
| `lib/supabase/database.types.ts` (modificar) | Firmas de `mcp_ventas_sucursales` y `mcp_ventas_dias` |
| `tests/portal/mcp-consulta.test.ts`, `tests/portal/mcp-ventas.test.ts` (nuevos) | Unidad |
| `tests/portal/mcp-http.test.ts` (modificar) | 11 herramientas anunciadas |
| `lib/mcp/consentimiento.ts`, `app/oauth/consent/*`, `tests/portal/mcp-consentimiento.test.ts` (modificar) | Retorno de Grok, textos neutros |
| `docs/mcp/grok.md` (nuevo) | Conexión, alta y revocación |

---

### Task 0: Verificar que Grok soporta MCP remoto con OAuth (manual, bloqueante)

Lo hace una persona con cuenta de grok.com y acceso al panel de Supabase. No toca código.

- [ ] **Step 1:** En grok.com, agregar un conector MCP personalizado con URL `https://portal.thecoffeemexico.com/mcp`.
- [ ] **Step 2:** Confirmar que Grok abre el login del portal o la pantalla `/oauth/consent`. Hoy esa pantalla
  mostrará «Esta solicitud no usa el retorno permitido de Claude.»; eso es lo esperado y prueba que Grok hizo
  descubrimiento OAuth y registro dinámico.
- [ ] **Step 3:** En Supabase → Authentication → OAuth Apps, abrir el cliente recién registrado (nombre de Grok) y
  copiar su `redirect_uri` exacta.
- [ ] **Step 4:** Escribir esa URL en la sección 5.3 del spec, en lugar de `<redirect_uri de Grok — se llena en la fase 0>`, y hacer commit:

```bash
git add docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md
git commit -m "docs(mcp): callback OAuth de Grok verificado"
```

**Si en el Step 2 Grok no ofrece conectores MCP remotos o no inicia OAuth: detener el plan** y volver a diseño.

---

### Task 1: Migración — lista blanca, `ventas_lectura` y RPC de ventas

**Files:**
- Create: `supabase/migrations/20261119000061_mcp_ventas.sql`
- Create: `tests/db/mcp-ventas.test.ts`
- Modify: `lib/supabase/database.types.ts:303-309` (bloque `Functions`)

**Interfaces:**
- Produces (SQL, ejecutables por `authenticated`):
  - `ventas_lectura(p_company integer, p_modulo text) → boolean`
  - `mcp_ventas_sucursales() → jsonb` = `{client_id: string|null, autorizado: boolean, sucursales: [{company_id, nombre_bi: string|null, modulos: ('sucursales'|'bi')[]}]}`
  - `mcp_ventas_dias(p_companias integer[], p_desde date, p_hasta date, p_horas boolean) → jsonb` = `[{company_id, fecha, completa, corte_segundo, origenes, horas?}]`
  - `sucursales_tablero_hoy`, `sucursales_tablero_periodo`, `bi_opciones`, `bi_tablero` con la misma firma y salida, ahora visibles para OAuth autorizado.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/db/mcp-ventas.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 61 (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.1).
let db: PGlite;
let conTodo: string;
let otraSucursal: string;
let inactivo: string;
type T = Record<string, any>;

/** Ejecuta fn como el usuario, con un token OAuth del cliente dado (null = sesión normal del portal). */
const como = <R>(user: string, client: string | null, fn: () => Promise<R>) =>
  comoUsuario(db, user, async () => {
    if (client)
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: user, client_id: client }),
      ]);
    try {
      return await fn();
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });
const uno = async (sql: string, params: unknown[] = []) => (await db.query<{ r: any }>(sql, params)).rows[0].r;
const fila = (company: number, fecha: string) =>
  db.query(
    `insert into sucursales_resumen_dia (company_id, fecha, leido_en, corte_segundo, completa, origenes, horas, productos)
     values ($1, $2, now(), 86400, true, $3, $4, $5)`,
    [
      company,
      fecha,
      JSON.stringify({ mostrador: { pedidos: 2, venta_cent: 15000, descuento_cent: 0, lineas: 3 } }),
      JSON.stringify({ mostrador: [Array(24).fill(0).map((_, h) => (h === 9 ? 2 : 0)), Array(24).fill(0).map((_, h) => (h === 9 ? 15000 : 0))] }),
      JSON.stringify([['5IL', '5IL', 'Iced Latte', { mostrador: [3, 15000] }]]),
    ],
  );

beforeAll(async () => {
  db = await crearDbLocal();
  conTodo = await crearUsuario(db, 'sucursales');
  otraSucursal = await crearUsuario(db, 'sucursales');
  inactivo = await crearUsuario(db, 'sucursales');
  for (const u of [conTodo, otraSucursal, inactivo])
    await db.query(
      `insert into perfil_modulos (user_id, modulo, nivel) values ($1,'sucursales','lectura'),($1,'bi','lectura')`,
      [u],
    );
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,532),($3,384)', [
    conTodo,
    otraSucursal,
    inactivo,
  ]);
  await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
  await db.query(`insert into mcp_ventas_clientes (client_id, nombre) values ('grok', 'Grok')`);
  await fila(384, '2026-11-10');
  await fila(532, '2026-11-10');
});
afterAll(async () => db.close());

describe('ventas_lectura', () => {
  const acc = (u: string, c: string | null, company: number, modulo: string) =>
    como(u, c, () => uno('select public.ventas_lectura($1, $2) r', [company, modulo]));

  it('sesión normal: igual que sucursales_acceso / bi_acceso', async () => {
    expect(await acc(conTodo, null, 384, 'sucursales')).toBe(true);
    expect(await acc(conTodo, null, 384, 'bi')).toBe(true);
    expect(await acc(conTodo, null, 532, 'sucursales')).toBe(false);
  });

  it('OAuth: exige cliente en la lista blanca, sucursal asignada, perfil activo y módulo de ventas', async () => {
    expect(await acc(conTodo, 'grok', 384, 'sucursales')).toBe(true);
    expect(await acc(conTodo, 'grok', 384, 'bi')).toBe(true);
    expect(await acc(conTodo, 'otro-cliente', 384, 'sucursales')).toBe(false);
    expect(await acc(conTodo, 'grok', 532, 'sucursales')).toBe(false);
    expect(await acc(inactivo, 'grok', 384, 'sucursales')).toBe(false);
    expect(await acc(conTodo, 'grok', 384, 'crm')).toBe(false);
  });

  it('las funciones de escritura siguen negando OAuth aunque el cliente esté autorizado', async () => {
    expect(await como(conTodo, 'grok', () => uno('select public.sucursales_acceso(384) r'))).toBe(false);
    expect(await como(conTodo, 'grok', () => uno('select public.bi_acceso(384) r'))).toBe(false);
  });

  it('la lista blanca no es legible ni editable por usuarios', async () => {
    await expect(como(conTodo, null, () => db.query('select * from mcp_ventas_clientes'))).rejects.toThrow();
    await expect(
      como(conTodo, null, () => db.query(`insert into mcp_ventas_clientes values ('x','x')`)),
    ).rejects.toThrow();
  });
});

describe('RPC de lectura con OAuth', () => {
  const periodo = (c: string | null) =>
    como(conTodo, c, () =>
      uno(`select public.sucursales_tablero_periodo(array[384,532], '2026-11-10', '2026-11-10') r`),
    );

  it('sucursales_tablero_periodo: OAuth autorizado ve su sucursal; no autorizado, nada', async () => {
    expect((await periodo(null)).dias_leidos).toBe(1);
    expect((await periodo('grok')).dias_leidos).toBe(1);
    expect((await periodo('otro-cliente')).dias_leidos).toBe(0);
  });

  it('sucursales_tablero_hoy: OAuth autorizado ve su sucursal', async () => {
    const r = await como(conTodo, 'grok', () =>
      uno(`select public.sucursales_tablero_hoy(array[384,532], array['2026-11-10','2026-11-10']::date[]) r`),
    );
    expect(r.dias.map((d: T) => d.company_id)).toEqual([384]);
  });

  it('bi_opciones: OAuth autorizado ve sus tiendas; no autorizado, ninguna', async () => {
    const tiendas = (c: string) =>
      como(conTodo, c, async () =>
        (await uno(`select public.bi_opciones($1) r`, [JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-10' })]))
          .tiendas.map((t: T) => t.company_id),
      );
    expect(await tiendas('grok')).toEqual([384]);
    expect(await tiendas('otro-cliente')).toEqual([]);
  });

  it('bi_tablero filtra con ventas_lectura (vía bi_tiendas_filtradas)', async () => {
    const p = JSON.stringify({ desde: '2026-11-01', hasta: '2026-11-10', companias: [384] });
    const ok = await como(conTodo, 'grok', () => uno('select public.bi_tablero($1) r', [p]));
    const no = await como(conTodo, 'otro-cliente', () => uno('select public.bi_tablero($1) r', [p]));
    expect(ok.cargas.esperados).toBeGreaterThan(0);
    expect(no.cargas.esperados).toBe(0);
  });
});

describe('mcp_ventas_sucursales', () => {
  it('devuelve el client_id, si está autorizado y las sucursales con sus módulos', async () => {
    const r = await como(conTodo, 'grok', () => uno('select public.mcp_ventas_sucursales() r'));
    expect(r.client_id).toBe('grok');
    expect(r.autorizado).toBe(true);
    expect(r.sucursales).toEqual([expect.objectContaining({ company_id: 384, modulos: ['sucursales', 'bi'] })]);
  });

  it('cliente no autorizado: autorizado false y sin sucursales', async () => {
    const r = await como(conTodo, 'otro-cliente', () => uno('select public.mcp_ventas_sucursales() r'));
    expect(r).toEqual({ client_id: 'otro-cliente', autorizado: false, sucursales: [] });
  });
});

describe('mcp_ventas_dias', () => {
  const dias = (d: string, h: string, horas: boolean) =>
    como(conTodo, 'grok', () =>
      uno('select public.mcp_ventas_dias(array[384,532], $1, $2, $3) r', [d, h, horas]),
    );

  it('omite sucursales ajenas y solo manda horas si se piden', async () => {
    const sin = await dias('2026-11-10', '2026-11-10', false);
    expect(sin).toHaveLength(1);
    expect(sin[0]).toMatchObject({ company_id: 384, fecha: '2026-11-10', completa: true, corte_segundo: 86400 });
    expect(sin[0].origenes.mostrador.venta_cent).toBe(15000);
    expect(sin[0].horas).toBeUndefined();
    const con = await dias('2026-11-10', '2026-11-10', true);
    expect(con[0].horas.mostrador[1][9]).toBe(15000);
  });

  it('rechaza más de 120 días, más de 7 con horas y desde > hasta', async () => {
    await expect(dias('2026-01-01', '2026-06-01', false)).rejects.toThrow(/120/);
    await expect(dias('2026-11-01', '2026-11-10', true)).rejects.toThrow(/7/);
    await expect(dias('2026-11-10', '2026-11-01', false)).rejects.toThrow(/inválido/);
  });
});
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `npx vitest run tests/db/mcp-ventas.test.ts`
Expected: FAIL en `beforeAll` con `relation "mcp_ventas_clientes" does not exist`.

- [ ] **Step 3: Escribir la migración**

`supabase/migrations/20261119000061_mcp_ventas.sql`. Las secciones 3 y 4 copian el cuerpo **exacto** de la
definición vigente y cambian **solo** la línea del predicado indicada; las demás líneas no se tocan.

```sql
-- Ventas de solo lectura para clientes OAuth autorizados (Grok): docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.1.
-- sucursales_acceso y bi_acceso NO cambian: también protegen RPC de escritura y siguen negando todo token OAuth.

-- 1. Lista blanca de clientes OAuth que pueden leer ventas (el administrador la llena desde el editor SQL).
create table public.mcp_ventas_clientes (
  client_id text primary key check (length(client_id) between 1 and 200),
  nombre text not null,
  creado_en timestamptz not null default now()
);
alter table public.mcp_ventas_clientes enable row level security;
revoke all on public.mcp_ventas_clientes from anon, authenticated;

-- 2. Predicado de LECTURA de ventas: sesión normal = sucursales_acceso / bi_acceso; token OAuth = cliente en la
--    lista blanca + perfil activo + módulo + sucursal asignada.
create function public.ventas_lectura(p_company integer, p_modulo text) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select case
    when coalesce(p_modulo, '') not in ('sucursales', 'bi') then false
    when (auth.jwt()->>'client_id') is null then
      case p_modulo when 'sucursales' then public.sucursales_acceso(p_company) else public.bi_acceso(p_company) end
    else exists (select 1 from public.mcp_ventas_clientes k where k.client_id = auth.jwt()->>'client_id')
      and exists (
        select 1 from public.perfiles p
        join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = p_modulo
        join public.perfil_sucursales s on s.user_id = p.user_id and s.company_id = p_company
        where p.user_id = auth.uid() and p.activo)
  end
$$;
revoke all on function public.ventas_lectura(integer, text) from public, anon;
grant execute on function public.ventas_lectura(integer, text) to authenticated;
```

Sección 3 — tablero de sucursales. Agregar al archivo:

```sql
-- 3. Tablero de México: mismas funciones que la migración 37, con ventas_lectura en lugar de sucursales_acceso.
```

Después, copiar `supabase/migrations/20261104000037_sucursales_resumen.sql` líneas **44–58**
(`sucursales_tablero_hoy`) y **62–113** (`sucursales_tablero_periodo`). En ambas cambiar `create function` por
`create or replace function` y hacer estos dos reemplazos:

- `      where public.sucursales_acceso(x.company_id)), '[]'));` → `      where public.ventas_lectura(x.company_id, 'sucursales')), '[]'));`
- `  v := array(select c from unnest(p_companias) c where public.sucursales_acceso(c));` → `  v := array(select c from unnest(p_companias) c where public.ventas_lectura(c, 'sucursales'));`

Sección 4 — BI. Agregar al archivo:

```sql
-- 4. BI: mismas funciones que la migración 43, con ventas_lectura en lugar de bi_acceso.
```

Después, copiar `supabase/migrations/20261106000043_bi_tablero.sql` líneas **23–38** (`bi_tiendas_filtradas`, que
ya es `create or replace`) y **151–193** (`bi_opciones`; cambiar `create function` por
`create or replace function`). Hacer estos dos reemplazos:

- `  where public.bi_acceso(t.company_id)` → `  where public.ventas_lectura(t.company_id, 'bi')`
- `  v := array(select t.company_id from public.bi_tiendas t where public.bi_acceso(t.company_id));` → `  v := array(select t.company_id from public.bi_tiendas t where public.ventas_lectura(t.company_id, 'bi'));`

`create or replace` conserva los `grant` que ya tienen las cuatro funciones; no se repiten.

Al final del archivo:

```sql
-- 5. Sucursales con ventas visibles para la cuenta, y si el cliente OAuth está autorizado (para el mensaje del MCP).
create function public.mcp_ventas_sucursales() returns jsonb
language sql stable security definer set search_path = public, pg_temp as $$
  select jsonb_build_object(
    'client_id', auth.jwt()->>'client_id',
    'autorizado', (auth.jwt()->>'client_id') is null
      or exists (select 1 from public.mcp_ventas_clientes k where k.client_id = auth.jwt()->>'client_id'),
    'sucursales', coalesce((
      select jsonb_agg(jsonb_build_object('company_id', x.company_id, 'nombre_bi', t.nombre,
        'modulos', to_jsonb(x.modulos)) order by x.company_id)
      from (
        select s.company_id, array_remove(array[
          case when public.ventas_lectura(s.company_id, 'sucursales') then 'sucursales' end,
          case when public.ventas_lectura(s.company_id, 'bi') then 'bi' end], null) modulos
        from public.perfil_sucursales s where s.user_id = auth.uid()) x
      left join public.bi_tiendas t on t.company_id = x.company_id
      where cardinality(x.modulos) > 0), '[]'))
$$;

-- 6. Totales por sucursal y día (y por hora si se piden), de los renglones que guarda el corte.
create function public.mcp_ventas_dias(p_companias integer[], p_desde date, p_hasta date, p_horas boolean)
returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
begin
  if p_desde is null or p_hasta is null or p_desde > p_hasta or p_hasta - p_desde > 119 then
    raise exception 'Periodo inválido (máximo 120 días).';
  end if;
  if coalesce(p_horas, false) and p_hasta - p_desde > 6 then
    raise exception 'Periodo inválido con horas (máximo 7 días).';
  end if;
  if coalesce(cardinality(p_companias), 0) > 400 then
    raise exception 'Demasiadas sucursales (máximo 400).';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object('company_id', r.company_id, 'fecha', r.fecha, 'completa', r.completa,
        'corte_segundo', r.corte_segundo, 'origenes', r.origenes)
      || case when coalesce(p_horas, false) then jsonb_build_object('horas', r.horas) else '{}'::jsonb end
      order by r.fecha, r.company_id)
    from public.sucursales_resumen_dia r
    where r.company_id = any(array(
        select c from unnest(p_companias) c where public.ventas_lectura(c, 'sucursales')))
      and r.fecha between p_desde and p_hasta), '[]');
end $$;

revoke all on function public.mcp_ventas_sucursales(),
  public.mcp_ventas_dias(integer[], date, date, boolean) from public, anon;
grant execute on function public.mcp_ventas_sucursales(),
  public.mcp_ventas_dias(integer[], date, date, boolean) to authenticated;
```

- [ ] **Step 4: Comprobar que ninguna RPC de escritura quedó con el predicado nuevo**

Run: `git grep -n "sucursales_acceso(\|bi_acceso(" supabase/migrations/20261119000061_mcp_ventas.sql`
Expected: solo las dos apariciones dentro de `ventas_lectura` (sección 2).

- [ ] **Step 5: Correr la prueba y verla pasar**

Run: `npx vitest run tests/db/mcp-ventas.test.ts tests/db/bi-acceso.test.ts`
Expected: PASS (incluida `bi-acceso`, que comprueba que la sesión normal no cambió).

Si `bi_tablero ... cargas.esperados` resulta 0 también con `grok`, revisar cómo cuenta `esperados` en
`20261106000043_bi_tablero.sql:110-145`. Cambiar la aserción a la clave que dependa de `bi_tiendas_filtradas`;
no se cambia el SQL de `bi_tablero`.

- [ ] **Step 6: Tipos de las RPC nuevas**

En `lib/supabase/database.types.ts`, dentro de `Functions`, justo después de `bi_tendencias`:

```ts
      mcp_ventas_sucursales: { Args: Record<string, never>; Returns: Json };
      mcp_ventas_dias: {
        Args: { p_companias: number[]; p_desde: string; p_hasta: string; p_horas: boolean };
        Returns: Json;
      };
```

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261119000061_mcp_ventas.sql tests/db/mcp-ventas.test.ts lib/supabase/database.types.ts
git commit -m "feat(mcp): lectura de ventas para clientes OAuth autorizados"
```

---

### Task 2: Base común de consultas MCP (`lib/mcp/consulta.ts`)

**Files:**
- Create: `lib/mcp/consulta.ts`
- Modify: `lib/mcp/herramientas.ts` (imports, `exigir`, `resultadoPagina`, `Consulta`, `registrarHerramientas`)
- Create: `tests/portal/mcp-consulta.test.ts`

**Interfaces:**
- Produces:
  - `interface Consulta { nombre: string; descripcion: string; esquema: z.ZodObject; ejecutar(entrada: unknown): Promise<Record<string, unknown>> }`
  - `consulta<S extends z.ZodRawShape>(nombre: string, descripcion: string, esquema: z.ZodObject<S>, consultar: (e: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>): Consulta`
  - `class ErrorConsulta extends Error`: su mensaje llega tal cual al usuario del MCP.
  - `exigir<T>(r: { data: T | null; error: unknown }): NonNullable<T>`
  - `resultadoPagina<T>(filas: T[], p: number, n: number)`
  - `aPesos(valor: unknown): unknown`
  - Esquemas: `fecha`, `pagina`, `limite`, `listaSucursales`
  - `diasEntre(desde: string, hasta: string): number`
- `herramientas.ts` re-exporta `Consulta` y `resultadoPagina` (los usan `lib/chat/herramientas.ts`, `lib/crm/agente.ts` y `tests/portal/mcp-http.test.ts`).

- [ ] **Step 1: Escribir la prueba que falla**

`tests/portal/mcp-consulta.test.ts`:

```ts
import { expect, it } from 'vitest';
import { z } from 'zod';
import { aPesos, consulta, diasEntre, ErrorConsulta, fecha } from '../../lib/mcp/consulta';

it('aPesos convierte toda clave _cent a pesos, en objetos y arreglos anidados', () => {
  expect(
    aPesos({ venta_cent: 12345, pedidos: 3, x: [{ importe_cent: 99 }], hoy: { mostrador: { descuento_cent: 0 } } }),
  ).toEqual({ venta: 123.45, pedidos: 3, x: [{ importe: 0.99 }], hoy: { mostrador: { descuento: 0 } } });
  expect(aPesos(null)).toBeNull();
  expect(aPesos({ venta_cent: null })).toEqual({ venta_cent: null });
});

it('fecha acepta solo AAAA-MM-DD existentes', () => {
  expect(fecha.parse('2026-11-19')).toBe('2026-11-19');
  for (const f of ['2026-02-30', '19/11/2026', '2026-13-01', ''])
    expect(() => fecha.parse(f)).toThrow(/Fecha/);
});

it('diasEntre cuenta días calendario', () => {
  expect(diasEntre('2026-11-01', '2026-11-01')).toBe(0);
  expect(diasEntre('2026-02-28', '2026-03-01')).toBe(1);
});

it('consulta valida la entrada y convierte errores de zod en ErrorConsulta legible', async () => {
  const c = consulta('x', 'y', z.object({ f: fecha }), async (e) => ({ f: e.f }));
  expect(await c.ejecutar({ f: '2026-11-19' })).toEqual({ f: '2026-11-19' });
  await expect(c.ejecutar({ f: '2026-02-30' })).rejects.toBeInstanceOf(ErrorConsulta);
  await expect(c.ejecutar({ f: '2026-02-30' })).rejects.toThrow(/Fecha/);
});
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `npx vitest run tests/portal/mcp-consulta.test.ts`
Expected: FAIL con `Failed to resolve import "../../lib/mcp/consulta"`.

- [ ] **Step 3: Implementar `lib/mcp/consulta.ts`**

```ts
import { z } from 'zod';

/** Una herramienta de solo lectura: el MCP (y el chat del portal, para las de recetas) la registran igual. */
export interface Consulta {
  nombre: string;
  descripcion: string;
  esquema: z.ZodObject;
  ejecutar: (entrada: unknown) => Promise<Record<string, unknown>>;
}

/** Error con un mensaje apto para quien pregunta: el MCP lo devuelve tal cual (los demás, con un texto genérico). */
export class ErrorConsulta extends Error {}

export function consulta<S extends z.ZodRawShape>(
  nombre: string,
  descripcion: string,
  esquema: z.ZodObject<S>,
  consultar: (entrada: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
): Consulta {
  return {
    nombre,
    descripcion,
    esquema,
    ejecutar: async (entrada) => {
      const r = esquema.safeParse(entrada);
      if (!r.success) throw new ErrorConsulta(r.error.issues.map((i) => i.message).join(' '));
      return consultar(r.data);
    },
  };
}

export function exigir<T>(r: { data: T | null; error: unknown }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error('No se pudo consultar la base. Intenta de nuevo.');
  return r.data as NonNullable<T>;
}

export function resultadoPagina<T>(filas: T[], p: number, n: number) {
  return { datos: filas.slice(0, n), pagina: p, siguiente_pagina: filas.length > n ? p + 1 : null };
}

/** Centavos → pesos en todo el valor: `venta_cent: 12345` se publica como `venta: 123.45`. */
export function aPesos(valor: unknown): unknown {
  if (Array.isArray(valor)) return valor.map(aPesos);
  if (valor && typeof valor === 'object')
    return Object.fromEntries(
      Object.entries(valor).map(([k, v]) =>
        k.endsWith('_cent') && typeof v === 'number' ? [k.slice(0, -5), Math.round(v) / 100] : [k, aPesos(v)],
      ),
    );
  return valor;
}

const DIA_MS = 86_400_000;
export const diasEntre = (desde: string, hasta: string) =>
  Math.round((Date.parse(`${hasta}T00:00:00Z`) - Date.parse(`${desde}T00:00:00Z`)) / DIA_MS);

// new Date('2026-13-01…') es Invalid Date: se revisa antes de toISOString(), que lanzaría.
export const fecha = z.string().refine((s) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const d = new Date(`${s}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(s);
}, 'Fecha inválida: usa AAAA-MM-DD (por ejemplo 2026-11-19).');
export const pagina = z.number().int().min(1).max(10000).default(1);
export const limite = z.number().int().min(1).max(50).default(25);
export const listaSucursales = z.array(z.number().int().positive()).min(1).max(400).optional();
```

- [ ] **Step 4: Usar `consulta.ts` en `lib/mcp/herramientas.ts`**

1. Borrar las definiciones locales de `pagina`, `limite`, `exigir`, `resultadoPagina` y `interface Consulta`.
   Agregar:

```ts
import { ErrorConsulta, exigir, limite, pagina, resultadoPagina, type Consulta } from './consulta';
import { consultasVentas } from './ventas';
export { resultadoPagina, type Consulta };
```

2. En `registrarHerramientas`, recorrer las dos listas y dejar pasar `ErrorConsulta`. Las de ventas **no** entran
   en `crearConsultas`, para que el chat del portal no las reciba:

```ts
export function registrarHerramientas(server: McpServer, db: Db) {
  for (const c of [...crearConsultas(db), ...consultasVentas(db)]) {
    server.registerTool(
      c.nombre,
      { description: c.descripcion, inputSchema: c.esquema, annotations: anotaciones },
      async (entrada) => {
        try {
          const datos = await c.ejecutar(entrada);
          return {
            content: [{ type: 'text' as const, text: JSON.stringify(datos) }],
            structuredContent: datos,
          };
        } catch (e) {
          return {
            isError: true,
            content: [
              {
                type: 'text' as const,
                text:
                  e instanceof ErrorConsulta
                    ? e.message
                    : 'No se pudo completar la consulta. Revisa el identificador o vuelve a intentarlo.',
              },
            ],
          };
        }
      },
    );
  }
}
```

3. Crear `lib/mcp/ventas.ts` vacío por ahora, para que compile:

```ts
import type { Db } from '../portal/consultas';
import type { Consulta } from './consulta';

/** Herramientas de ventas (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.2). Solo para /mcp. */
export function consultasVentas(db: Db): Consulta[] {
  void db;
  return [];
}
```

- [ ] **Step 5: Correr pruebas**

Run: `npx vitest run tests/portal/mcp-consulta.test.ts tests/portal/mcp-http.test.ts tests/portal/chat-api.test.ts && npm run typecheck`
Expected: PASS y sin errores de tipos (siguen las 6 herramientas).

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/consulta.ts lib/mcp/herramientas.ts lib/mcp/ventas.ts tests/portal/mcp-consulta.test.ts
git commit -m "refactor(mcp): base común de consultas y errores legibles"
```

---

### Task 3: `ventas_sucursales` y `ventas_resumen`

**Files:**
- Modify: `lib/mcp/ventas.ts`
- Create: `tests/portal/mcp-ventas.test.ts`

**Interfaces:**
- Consumes: `consulta`, `ErrorConsulta`, `exigir`, `aPesos`, `fecha`, `pagina`, `limite`, `listaSucursales`, `diasEntre`, `resultadoPagina` (Task 2); RPC `mcp_ventas_sucursales`, `mcp_ventas_dias`, `sucursales_tablero_hoy` (Task 1); `armarHoy`, `RpcHoy`, `TotalesOrigen`, `PorOrigen` de `lib/sucursales/resumen.ts`; `configDe` de `lib/sucursales/config.ts`; `enZona` de `lib/sucursales/tiempo.ts`.
- Produces (para Tasks 4 y 5, dentro de `ventas.ts`): `visibles(db): Promise<SucursalVentas[]>`, `elegir(todas, modulo, pedidas?): { companias: number[]; ignoradas: number[] }`, `nombreDe(s: SucursalVentas): string`, `sumar(a: TotalesOrigen, b: TotalesOrigen): TotalesOrigen`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/portal/mcp-ventas.test.ts`. Las sucursales 532 y 384 deben estar en `lib/sucursales/config.ts` con
`configDe`. Antes de escribir, confirmar los ids con `git grep -n "companyId:" lib/sucursales/config.ts`;
`A` es la primera configurada y `B` la segunda. Para la sucursal sin configuración se usa `999999`.

```ts
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { consultasVentas } from '../../lib/mcp/ventas';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { ErrorConsulta } from '../../lib/mcp/consulta';
import type { Db } from '../../lib/portal/consultas';

const [A, B] = sucursalesConfiguradas.slice(0, 2).map((s) => s.companyId);
const SIN_CONFIG = 999999;
const rpc = vi.fn();
const db = { rpc } as unknown as Db;
const herramienta = (nombre: string) => consultasVentas(db).find((c) => c.nombre === nombre)!;
const autorizado = (sucursales: { company_id: number; modulos: string[]; nombre_bi?: string | null }[]) => ({
  client_id: 'grok',
  autorizado: true,
  sucursales: sucursales.map((s) => ({ nombre_bi: null, ...s })),
});
const respuestas = (r: Record<string, unknown>) =>
  rpc.mockImplementation(async (fn: string) => ({ data: r[fn] ?? null, error: r[fn] ? null : { message: fn } }));
const tot = (venta_cent: number, pedidos = 1) => ({ pedidos, venta_cent, descuento_cent: 0, lineas: pedidos });

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-11-19T18:00:00Z'));
  rpc.mockReset();
});
afterEach(() => vi.useRealTimers());

it('cliente no autorizado: error con su client_id', async () => {
  respuestas({ mcp_ventas_sucursales: { client_id: 'abc-123', autorizado: false, sucursales: [] } });
  const e = await herramienta('ventas_sucursales').ejecutar({}).catch((x) => x);
  expect(e).toBeInstanceOf(ErrorConsulta);
  expect(e.message).toContain('abc-123');
});

it('ventas_sucursales: nombre, ciudad y zona de la configuración; nombre BI si no está configurada', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales', 'bi'] },
      { company_id: SIN_CONFIG, modulos: ['bi'], nombre_bi: 'Tienda BI' },
    ]),
  });
  const r = (await herramienta('ventas_sucursales').ejecutar({})) as any;
  expect(r.sucursales[0]).toMatchObject({ company_id: A, modulos: ['sucursales', 'bi'] });
  expect(r.sucursales[0].zona).toBeTruthy();
  expect(r.sucursales[1]).toEqual({ company_id: SIN_CONFIG, nombre: 'Tienda BI', ciudad: null, zona: null, modulos: ['bi'] });
});

it('ventas_resumen sin fechas: hoy en vivo por sucursal en pesos; sin configuración va a ignoradas', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([
      { company_id: A, modulos: ['sucursales'] },
      { company_id: SIN_CONFIG, modulos: ['sucursales'] },
    ]),
    sucursales_tablero_hoy: {
      ultimo_corte: '2026-11-19T17:50:00Z',
      dias: [
        { company_id: A, fecha: '2026-11-19', hoy: true, leido_en: 'x', corte_segundo: 43200, completa: true,
          origenes: { mostrador: tot(25050, 3) }, horas: {}, tramos: null },
      ],
    },
  });
  const r = (await herramienta('ventas_resumen').ejecutar({})) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'sucursales_tablero_hoy')!;
  expect(args.p_companias).toEqual([A]);
  expect(args.p_hoys).toHaveLength(1);
  expect(r.modo).toBe('hoy');
  expect(r.ignoradas).toEqual([SIN_CONFIG]);
  expect(r.sucursales[0]).toMatchObject({ company_id: A, completa: true, corte_segundo: 43200 });
  expect(r.sucursales[0].hoy.mostrador.venta).toBe(250.5);
});

it('ventas_resumen con fechas agrupa por sucursal (por omisión) y suma canales', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }, { company_id: B, modulos: ['sucursales'] }]),
    mcp_ventas_dias: [
      { company_id: A, fecha: '2026-11-10', completa: true, corte_segundo: 86400, origenes: { mostrador: tot(10000), rappi: tot(5000) } },
      { company_id: A, fecha: '2026-11-11', completa: false, corte_segundo: 86400, origenes: { mostrador: tot(2000) } },
      { company_id: B, fecha: '2026-11-10', completa: true, corte_segundo: 86400, origenes: { app: tot(700) } },
    ],
  });
  const r = (await herramienta('ventas_resumen').ejecutar({ desde: '2026-11-10', hasta: '2026-11-11' })) as any;
  expect(r.agrupar).toBe('sucursal');
  const a = r.datos.find((x: any) => x.company_id === A);
  expect(a.total.venta).toBe(170);
  expect(a.por_canal.rappi.venta).toBe(50);
  expect(a.dias).toBe(2);
  expect(a.dias_incompletos).toEqual(['2026-11-11']);
});

it('ventas_resumen agrupa por día y por sucursal-día, paginado', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }, { company_id: B, modulos: ['sucursales'] }]),
    mcp_ventas_dias: [
      { company_id: A, fecha: '2026-11-10', completa: true, corte_segundo: 86400, origenes: { mostrador: tot(10000) } },
      { company_id: B, fecha: '2026-11-10', completa: true, corte_segundo: 86400, origenes: { mostrador: tot(500) } },
    ],
  });
  const porDia = (await herramienta('ventas_resumen').ejecutar({ desde: '2026-11-10', hasta: '2026-11-10', agrupar: 'dia' })) as any;
  expect(porDia.datos).toEqual([expect.objectContaining({ fecha: '2026-11-10', sucursales: 2 })]);
  expect(porDia.datos[0].total.venta).toBe(105);
  const filas = (await herramienta('ventas_resumen').ejecutar({
    desde: '2026-11-10', hasta: '2026-11-10', agrupar: 'sucursal_dia', limite: 1,
  })) as any;
  expect(filas.datos).toHaveLength(1);
  expect(filas.siguiente_pagina).toBe(2);
});

it('ventas_resumen valida el rango y las sucursales pedidas', async () => {
  respuestas({ mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }]) });
  const r = herramienta('ventas_resumen');
  await expect(r.ejecutar({ desde: '2026-11-10' })).rejects.toThrow(/desde y hasta/);
  await expect(r.ejecutar({ desde: '2026-11-10', hasta: '2026-11-01' })).rejects.toThrow(/desde/);
  await expect(r.ejecutar({ desde: '2026-01-01', hasta: '2026-11-01' })).rejects.toThrow(/120/);
  await expect(r.ejecutar({ sucursales: [B] })).rejects.toThrow(/Ninguna/);
});
```

- [ ] **Step 2: Correr la prueba y verla fallar**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts`
Expected: FAIL: `herramienta(...)` es `undefined` (`consultasVentas` devuelve `[]`).

- [ ] **Step 3: Implementar en `lib/mcp/ventas.ts`**

Reemplazar el contenido del archivo:

```ts
import { z } from 'zod';
import type { Db } from '../portal/consultas';
import { configDe, type ConfigSucursal } from '../sucursales/config';
import { armarHoy, type PorOrigen, type RpcHoy, type TotalesOrigen } from '../sucursales/resumen';
import { enZona } from '../sucursales/tiempo';
import {
  aPesos,
  consulta,
  diasEntre,
  ErrorConsulta,
  exigir,
  fecha,
  limite,
  listaSucursales,
  pagina,
  resultadoPagina,
  type Consulta,
} from './consulta';

/** Herramientas de ventas (docs/superpowers/specs/2026-11-19-mcp-ventas-grok-design.md §5.2). Solo para /mcp. */

type Modulo = 'sucursales' | 'bi';
interface SucursalVentas {
  company_id: number;
  nombre_bi: string | null;
  modulos: Modulo[];
}
interface RpcSucursales {
  client_id: string | null;
  autorizado: boolean;
  sucursales: SucursalVentas[];
}
interface DiaVentas {
  company_id: number;
  fecha: string;
  completa: boolean;
  corte_segundo: number;
  origenes: PorOrigen<TotalesOrigen>;
  horas?: PorOrigen<[number[], number[]]>;
}

const MAX_DIAS = 120;
const CANALES = 'Canales: mostrador (POS en tienda), app (app The Coffee) y rappi (portal de Rappi).';
const MONTOS = 'Montos en MXN con IVA, como en el portal. Fechas AAAA-MM-DD en la hora local de cada sucursal.';
const NO_ESTIMA = 'Un día con completa=false no se leyó entero: no se estima lo que falta.';

const cero = (): TotalesOrigen => ({ pedidos: 0, venta_cent: 0, descuento_cent: 0, lineas: 0 });
export const sumar = (a: TotalesOrigen, b: TotalesOrigen): TotalesOrigen => ({
  pedidos: a.pedidos + b.pedidos,
  venta_cent: a.venta_cent + b.venta_cent,
  descuento_cent: a.descuento_cent + b.descuento_cent,
  lineas: a.lineas + b.lineas,
});
const totalDe = (o: PorOrigen<TotalesOrigen>) => Object.values(o).reduce<TotalesOrigen>((t, x) => sumar(t, x!), cero());
const sumarPorCanal = (acc: PorOrigen<TotalesOrigen>, o: PorOrigen<TotalesOrigen>) => {
  for (const [k, v] of Object.entries(o) as [keyof typeof o, TotalesOrigen][]) acc[k] = sumar(acc[k] ?? cero(), v);
  return acc;
};

async function visibles(db: Db): Promise<SucursalVentas[]> {
  const r = exigir(await db.rpc('mcp_ventas_sucursales')) as unknown as RpcSucursales;
  if (!r.autorizado)
    throw new ErrorConsulta(
      `Este conector no tiene ventas autorizadas. Pide al administrador que agregue el client_id ${r.client_id} a mcp_ventas_clientes.`,
    );
  if (!r.sucursales.length) throw new ErrorConsulta('Tu cuenta no tiene sucursales asignadas con ventas.');
  return r.sucursales;
}

function elegir(todas: SucursalVentas[], modulo: Modulo, pedidas?: number[]) {
  const con = todas.filter((s) => s.modulos.includes(modulo)).map((s) => s.company_id);
  const companias = pedidas ? pedidas.filter((c) => con.includes(c)) : con;
  const ignoradas = pedidas ? pedidas.filter((c) => !con.includes(c)) : [];
  if (!companias.length) throw new ErrorConsulta('Ninguna de las sucursales pedidas está disponible para esta cuenta.');
  return { companias, ignoradas };
}

/** Solo las configuradas en el portal tienen zona horaria; las demás van a `ignoradas`. */
function configuradas(companias: number[]) {
  const cfgs = companias.map(configDe).filter((c): c is ConfigSucursal => c !== null);
  return { cfgs, sinConfig: companias.filter((c) => !configDe(c)) };
}

const nombreDe = (s: { company_id: number; nombre_bi?: string | null }) =>
  configDe(s.company_id)?.nombre ?? s.nombre_bi ?? `Sucursal ${s.company_id}`;

function rango(e: { desde?: string; hasta?: string }, max = MAX_DIAS) {
  if (!e.desde || !e.hasta) throw new ErrorConsulta('Indica desde y hasta (AAAA-MM-DD).');
  if (e.desde > e.hasta) throw new ErrorConsulta('La fecha desde debe ser anterior o igual a hasta.');
  if (diasEntre(e.desde, e.hasta) > max - 1) throw new ErrorConsulta(`El periodo máximo es de ${max} días.`);
  return { desde: e.desde, hasta: e.hasta };
}

export function consultasVentas(db: Db): Consulta[] {
  return [
    consulta(
      'ventas_sucursales',
      'Sucursales The Coffee cuyas ventas puede consultar esta cuenta: company_id, nombre, ciudad, zona horaria y módulos (sucursales = ventas del corte; bi = tablero BI). Úsala primero para conocer los company_id.',
      z.object({}),
      async () => ({
        sucursales: (await visibles(db)).map((s) => {
          const cfg = configDe(s.company_id);
          return {
            company_id: s.company_id,
            nombre: nombreDe(s),
            ciudad: cfg?.ciudad ?? null,
            zona: cfg?.zona ?? null,
            modulos: s.modulos,
          };
        }),
      }),
    ),
    consulta(
      'ventas_resumen',
      `Venta, pedidos, descuentos y líneas por canal. Sin fechas: HOY en vivo por sucursal (corte cada 10 min), con la semana pasada a la misma hora (comparable). Con desde y hasta (máximo ${MAX_DIAS} días): agrupar=sucursal (por omisión), dia o sucursal_dia (paginado). sucursales: lista de company_id; si se omite, todas. ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({
        desde: fecha.optional(),
        hasta: fecha.optional(),
        sucursales: listaSucursales,
        agrupar: z.enum(['sucursal', 'dia', 'sucursal_dia']).default('sucursal'),
        pagina,
        limite,
      }),
      async (e) => {
        const todas = await visibles(db);
        const { companias, ignoradas } = elegir(todas, 'sucursales', e.sucursales);
        if (!e.desde && !e.hasta) {
          const { cfgs, sinConfig } = configuradas(companias);
          if (!cfgs.length) throw new ErrorConsulta('Ninguna de las sucursales pedidas tiene ventas en vivo configuradas.');
          const ahora = new Date();
          const rpc = exigir(
            await db.rpc('sucursales_tablero_hoy', {
              p_companias: cfgs.map((c) => c.companyId),
              p_hoys: cfgs.map((c) => enZona(ahora, c.zona).fecha),
            }),
          ) as unknown as RpcHoy;
          const t = armarHoy(rpc, cfgs);
          return aPesos({
            modo: 'hoy',
            ultimo_corte: t.ultimoCorte,
            ignoradas: [...ignoradas, ...sinConfig],
            sucursales: t.sucursales.map((s) => ({
              company_id: s.companyId,
              nombre: s.nombre,
              ciudad: s.ciudad,
              sin_corte: s.sinCorte,
              completa: s.completa,
              corte_segundo: s.corteSegundo,
              hoy: s.hoy,
              comparable: s.comparable,
              comparado_a_segundo: s.comparadoA,
            })),
          }) as Record<string, unknown>;
        }
        const p = rango(e);
        const dias = exigir(
          await db.rpc('mcp_ventas_dias', { p_companias: companias, p_desde: p.desde, p_hasta: p.hasta, p_horas: false }),
        ) as unknown as DiaVentas[];
        const nombres = new Map(todas.map((s) => [s.company_id, nombreDe(s)]));
        let filas: Record<string, unknown>[];
        if (e.agrupar === 'sucursal_dia') {
          filas = dias.map((d) => ({
            company_id: d.company_id,
            nombre: nombres.get(d.company_id),
            fecha: d.fecha,
            completa: d.completa,
            total: totalDe(d.origenes),
            por_canal: d.origenes,
          }));
        } else {
          const clave = (d: DiaVentas) => (e.agrupar === 'dia' ? d.fecha : String(d.company_id));
          const grupos = new Map<string, DiaVentas[]>();
          for (const d of dias) grupos.set(clave(d), [...(grupos.get(clave(d)) ?? []), d]);
          filas = [...grupos.values()].map((ds) => {
            const por_canal = ds.reduce<PorOrigen<TotalesOrigen>>((acc, d) => sumarPorCanal(acc, d.origenes), {});
            const base =
              e.agrupar === 'dia'
                ? { fecha: ds[0].fecha, sucursales: ds.length }
                : { company_id: ds[0].company_id, nombre: nombres.get(ds[0].company_id), dias: ds.length };
            return {
              ...base,
              total: totalDe(por_canal),
              por_canal,
              dias_incompletos:
                e.agrupar === 'dia'
                  ? ds.filter((d) => !d.completa).map((d) => d.company_id)
                  : ds.filter((d) => !d.completa).map((d) => d.fecha),
            };
          });
          if (e.agrupar === 'sucursal')
            filas.sort((a, b) => (b.total as TotalesOrigen).venta_cent - (a.total as TotalesOrigen).venta_cent);
        }
        const desde = (e.pagina - 1) * e.limite;
        return aPesos({
          modo: 'periodo',
          ...p,
          agrupar: e.agrupar,
          ignoradas,
          ...resultadoPagina(filas.slice(desde, desde + e.limite + 1), e.pagina, e.limite),
        }) as Record<string, unknown>;
      },
    ),
  ];
}
```

Nota: en `agrupar: 'dia'`, `dias_incompletos` lista company_id (las sucursales incompletas de ese día). En los
otros modos lista fechas.

- [ ] **Step 4: Correr la prueba y verla pasar**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/ventas.ts tests/portal/mcp-ventas.test.ts
git commit -m "feat(mcp): ventas_sucursales y ventas_resumen"
```

---

### Task 4: `ventas_por_hora` y `ventas_por_producto`

**Files:**
- Modify: `lib/mcp/ventas.ts` (agregar dos `consulta(...)` al arreglo de `consultasVentas`)
- Modify: `tests/portal/mcp-ventas.test.ts`

**Interfaces:**
- Consumes: `visibles`, `elegir`, `rango`, `DiaVentas`, `aPesos`, `resultadoPagina` (Task 3); RPC `mcp_ventas_dias`, `sucursales_tablero_periodo`; `RpcPeriodo` de `lib/sucursales/resumen.ts`.

- [ ] **Step 1: Agregar las pruebas que fallan** al final de `tests/portal/mcp-ventas.test.ts`:

```ts
const horas = (h: number, pedidos: number, venta: number) => [
  Array.from({ length: 24 }, (_, i) => (i === h ? pedidos : 0)),
  Array.from({ length: 24 }, (_, i) => (i === h ? venta : 0)),
];

it('ventas_por_hora suma sucursales por hora y canal, y reporta incompletas', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }, { company_id: B, modulos: ['sucursales'] }]),
    mcp_ventas_dias: [
      { company_id: A, fecha: '2026-11-10', completa: true, corte_segundo: 86400, origenes: {}, horas: { mostrador: horas(9, 2, 10000) } },
      { company_id: B, fecha: '2026-11-10', completa: false, corte_segundo: 50000, origenes: {}, horas: { mostrador: horas(9, 1, 500), rappi: horas(13, 1, 3000) } },
    ],
  });
  const r = (await herramienta('ventas_por_hora').ejecutar({ fecha: '2026-11-10' })) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'mcp_ventas_dias')!;
  expect(args).toMatchObject({ p_desde: '2026-11-10', p_hasta: '2026-11-10', p_horas: true });
  expect(r.horas).toHaveLength(24);
  expect(r.horas[9]).toEqual({ hora: 9, pedidos: 3, venta: 105, por_canal: { mostrador: { pedidos: 3, venta: 105 } } });
  expect(r.horas[13].por_canal.rappi.venta).toBe(30);
  expect(r.incompletas).toEqual([B]);
});

it('ventas_por_producto agrupa canales por producto, filtra canal y pagina', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales'] }]),
    sucursales_tablero_periodo: {
      dias_leidos: 3,
      incompletos: 1,
      semanas: [],
      dias: [],
      productos: [
        { clave: 'L', codigo: '5IL', nombre: 'Iced Latte', origen: 'mostrador', lineas: 4, importe_cent: 40000, sucursales: 1 },
        { clave: 'L', codigo: '5IL', nombre: 'Iced Latte', origen: 'rappi', lineas: 1, importe_cent: 12000, sucursales: 1 },
        { clave: 'B', codigo: 'BRO13', nombre: 'Brownie', origen: 'rappi', lineas: 5, importe_cent: 30000, sucursales: 1 },
      ],
    },
  });
  const t = herramienta('ventas_por_producto');
  const todo = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03' })) as any;
  expect(todo.datos.map((p: any) => p.codigo)).toEqual(['5IL', 'BRO13']);
  expect(todo.datos[0]).toMatchObject({ lineas: 5, importe: 520, sucursales: 1 });
  expect(todo.datos[0].por_canal.rappi).toEqual({ lineas: 1, importe: 120 });
  expect(todo).toMatchObject({ dias_leidos: 3, dias_incompletos: 1 });
  const rappi = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03', canal: 'rappi' })) as any;
  expect(rappi.datos.map((p: any) => [p.codigo, p.importe])).toEqual([['BRO13', 300], ['5IL', 120]]);
  const p1 = (await t.ejecutar({ desde: '2026-11-01', hasta: '2026-11-03', limite: 1 })) as any;
  expect(p1.datos).toHaveLength(1);
  expect(p1.siguiente_pagina).toBe(2);
});
```

- [ ] **Step 2: Correr y verlas fallar**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts`
Expected: las 2 nuevas FAIL (`herramienta(...)` undefined); las demás PASS.

- [ ] **Step 3: Implementar.** En `lib/mcp/ventas.ts`, agregar `type RpcPeriodo` al import de `../sucursales/resumen`
  y estas dos entradas al final del arreglo que devuelve `consultasVentas`:

```ts
    consulta(
      'ventas_por_hora',
      `Pedidos y venta por hora local (0–23) de UN día, sumando las sucursales pedidas (o todas), separados por canal. Para una sola sucursal, pásala en sucursales. ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({ fecha, sucursales: listaSucursales }),
      async (e) => {
        const { companias, ignoradas } = elegir(await visibles(db), 'sucursales', e.sucursales);
        const dias = exigir(
          await db.rpc('mcp_ventas_dias', { p_companias: companias, p_desde: e.fecha, p_hasta: e.fecha, p_horas: true }),
        ) as unknown as DiaVentas[];
        const horas = Array.from({ length: 24 }, (_, hora) => ({
          hora,
          pedidos: 0,
          venta_cent: 0,
          por_canal: {} as Record<string, { pedidos: number; venta_cent: number }>,
        }));
        for (const d of dias)
          for (const [canal, [pedidos, venta]] of Object.entries(d.horas ?? {}))
            for (let h = 0; h < 24; h++) {
              if (!pedidos[h] && !venta[h]) continue;
              const x = horas[h];
              x.pedidos += pedidos[h];
              x.venta_cent += venta[h];
              const c = (x.por_canal[canal] ??= { pedidos: 0, venta_cent: 0 });
              c.pedidos += pedidos[h];
              c.venta_cent += venta[h];
            }
        return aPesos({
          fecha: e.fecha,
          sucursales_con_datos: dias.length,
          incompletas: dias.filter((d) => !d.completa).map((d) => d.company_id),
          ignoradas,
          horas,
        }) as Record<string, unknown>;
      },
    ),
    consulta(
      'ventas_por_producto',
      `Productos vendidos en un periodo (máximo ${MAX_DIAS} días), ordenados por importe: código, nombre, líneas vendidas, importe, en cuántas sucursales se vendió y desglose por canal. canal filtra un solo canal. Paginado (máximo 50 por página). ${CANALES} ${MONTOS} ${NO_ESTIMA}`,
      z.object({
        desde: fecha,
        hasta: fecha,
        sucursales: listaSucursales,
        canal: z.enum(['mostrador', 'app', 'rappi']).optional(),
        pagina,
        limite,
      }),
      async (e) => {
        const p = rango(e);
        const { companias, ignoradas } = elegir(await visibles(db), 'sucursales', e.sucursales);
        const r = exigir(
          await db.rpc('sucursales_tablero_periodo', { p_companias: companias, p_desde: p.desde, p_hasta: p.hasta }),
        ) as unknown as RpcPeriodo;
        const productos = new Map<
          string,
          { codigo: string; nombre: string; lineas: number; importe_cent: number; sucursales: number; por_canal: Record<string, { lineas: number; importe_cent: number }> }
        >();
        for (const x of r.productos) {
          if (e.canal && x.origen !== e.canal) continue;
          const prod = productos.get(x.clave) ?? { codigo: x.codigo, nombre: x.nombre, lineas: 0, importe_cent: 0, sucursales: x.sucursales, por_canal: {} };
          prod.lineas += x.lineas;
          prod.importe_cent += x.importe_cent;
          prod.por_canal[x.origen] = { lineas: x.lineas, importe_cent: x.importe_cent };
          productos.set(x.clave, prod);
        }
        const filas = [...productos.values()].sort((a, b) => b.importe_cent - a.importe_cent || a.codigo.localeCompare(b.codigo));
        const desde = (e.pagina - 1) * e.limite;
        return aPesos({
          ...p,
          canal: e.canal ?? null,
          dias_leidos: r.dias_leidos,
          dias_incompletos: r.incompletos,
          ignoradas,
          ...resultadoPagina(filas.slice(desde, desde + e.limite + 1), e.pagina, e.limite),
        }) as Record<string, unknown>;
      },
    ),
```

- [ ] **Step 4: Correr y verlas pasar**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/ventas.ts tests/portal/mcp-ventas.test.ts
git commit -m "feat(mcp): ventas_por_hora y ventas_por_producto"
```

---

### Task 5: `ventas_bi` y registro en `/mcp`

**Files:**
- Modify: `lib/mcp/ventas.ts`
- Modify: `tests/portal/mcp-ventas.test.ts`
- Modify: `tests/portal/mcp-http.test.ts:80-89`

**Interfaces:**
- Consumes: `visibles`, `elegir`, `rango` (Task 3); RPC `bi_opciones`, `bi_tablero`; `aJsonRpc` de `lib/bi/filtros.ts`; `hoyMexico` de `lib/bi/url.ts`; `RpcOpciones`, `RpcTablero` de `lib/bi/tipos.ts`.

- [ ] **Step 1: Agregar la prueba que falla** a `tests/portal/mcp-ventas.test.ts`:

```ts
it('ventas_bi: solo tiendas con módulo bi y en bi_opciones; montos en pesos; hoy de México', async () => {
  respuestas({
    mcp_ventas_sucursales: autorizado([{ company_id: A, modulos: ['sucursales', 'bi'] }, { company_id: B, modulos: ['sucursales'] }]),
    bi_opciones: { tiendas: [{ company_id: A, store_id: 1, nombre: 'Tienda A', franquiciatario: null, tipo: 'Isla' }], ultimo_corte: null, tiendas_sin_rappi: 0 },
    bi_tablero: { kpis: { venta_cent: 123400, venta_bruta_cent: 130000, tickets: 10, lineas: 12, unidades: 14 }, por_pago: [] },
  });
  const r = (await herramienta('ventas_bi').ejecutar({ desde: '2026-11-01', hasta: '2026-11-10', sucursales: [A, B] })) as any;
  const [, args] = rpc.mock.calls.find(([fn]) => fn === 'bi_tablero')!;
  expect(args.p).toMatchObject({ desde: '2026-11-01', hasta: '2026-11-10', companias: [A], hoy: '2026-11-19' });
  expect(r.ignoradas).toEqual([B]);
  expect(r.tiendas).toEqual([{ company_id: A, nombre: 'Tienda A' }]);
  expect(r.tablero.kpis).toMatchObject({ venta: 1234, venta_bruta: 1300, tickets: 10 });
});
```

En `tests/portal/mcp-http.test.ts`, en la prueba `'negocia MCP y anuncia únicamente seis herramientas de lectura'`,
cambiar el título a `'negocia MCP y anuncia únicamente once herramientas de lectura'` y
`expect(tools).toHaveLength(6)` → `expect(tools).toHaveLength(11)`. Si la prueba enumera nombres, agregar
`ventas_sucursales`, `ventas_resumen`, `ventas_por_hora`, `ventas_por_producto` y `ventas_bi`.

- [ ] **Step 2: Correr y verlas fallar**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts tests/portal/mcp-http.test.ts`
Expected: FAIL en `ventas_bi` (undefined) y en `toHaveLength(11)` (recibe 10).

- [ ] **Step 3: Implementar.** En `lib/mcp/ventas.ts` agregar los imports:

```ts
import type { Json } from '../supabase/database.types';
import { aJsonRpc } from '../bi/filtros';
import { hoyMexico } from '../bi/url';
import type { RpcOpciones, RpcTablero } from '../bi/tipos';
```

y al final del arreglo:

```ts
    consulta(
      'ventas_bi',
      `Tablero BI de The Coffee México para un periodo (máximo ${MAX_DIAS} días), de las cargas del POS: KPIs (venta neta y bruta, tickets, líneas, unidades), venta por grupo, categoría, café, fecha, día de la semana, hora, método de pago, promociones, ranking de productos y fuentes. Solo tiendas con módulo bi. ${MONTOS}`,
      z.object({ desde: fecha, hasta: fecha, sucursales: listaSucursales }),
      async (e) => {
        const p = rango(e);
        const { companias, ignoradas } = elegir(await visibles(db), 'bi', e.sucursales);
        const opciones = exigir(await db.rpc('bi_opciones', { p: p as unknown as Json })) as unknown as RpcOpciones;
        const conAcceso = new Set(opciones.tiendas.map((t) => t.company_id));
        const finales = companias.filter((c) => conAcceso.has(c));
        if (!finales.length) throw new ErrorConsulta('Ninguna de las sucursales pedidas tiene datos BI para esta cuenta.');
        const tablero = exigir(
          await db.rpc('bi_tablero', {
            p: aJsonRpc({ desde: p.desde, hasta: p.hasta, companias: finales, hoy: hoyMexico(new Date()) }) as Json,
          }),
        ) as unknown as RpcTablero;
        return aPesos({
          ...p,
          ignoradas: [...ignoradas, ...companias.filter((c) => !conAcceso.has(c))],
          tiendas: opciones.tiendas.filter((t) => finales.includes(t.company_id)).map((t) => ({ company_id: t.company_id, nombre: t.nombre })),
          ultimo_corte: opciones.ultimo_corte,
          tiendas_sin_rappi: opciones.tiendas_sin_rappi,
          tablero,
        }) as Record<string, unknown>;
      },
    ),
```

Si `RpcOpciones` no declara `ultimo_corte` o `tiendas_sin_rappi`, leerlos con
`(opciones as RpcOpciones & { ultimo_corte?: string | null; tiendas_sin_rappi?: number })`, sin cambiar el tipo
compartido. Si `aJsonRpc` no copia `hoy`, la aserción `hoy: '2026-11-19'` falla: revisar `lib/bi/filtros.ts:72`
y pasar `hoy` igual que lo hace `app/api/bi/tablero/route.ts` vía `aFiltrosBi`.

- [ ] **Step 4: Correr y verlas pasar, junto con la suite completa**

Run: `npx vitest run tests/portal/mcp-ventas.test.ts tests/portal/mcp-http.test.ts && npm test && npm run typecheck`
Expected: PASS todo.

- [ ] **Step 5: Commit**

```bash
git add lib/mcp/ventas.ts tests/portal/mcp-ventas.test.ts tests/portal/mcp-http.test.ts
git commit -m "feat(mcp): ventas_bi y registro de las herramientas de ventas en /mcp"
```

---

### Task 6: Consentimiento OAuth para Grok y documentación

**Requiere Task 0.** Usar la `redirect_uri` que Task 0 escribió en la sección 5.3 del spec. Si no está, no empezar
esta tarea.

**Files:**
- Modify: `lib/mcp/consentimiento.ts`
- Modify: `app/oauth/consent/actions.ts`, `app/oauth/consent/page.tsx`
- Modify: `tests/portal/mcp-consentimiento.test.ts`
- Create: `docs/mcp/grok.md`

- [ ] **Step 1: Prueba que falla.** En `tests/portal/mcp-consentimiento.test.ts`, reemplazar `retornoClaude` por
  `retornoConector` (import y usos) y agregar:

```ts
import { CALLBACK_GROK } from '../../lib/mcp/consentimiento';

it('acepta el retorno exacto de Grok y rechaza variantes', () => {
  expect(retornoConector(`${CALLBACK_GROK}?code=abc`)).toContain(new URL(CALLBACK_GROK).host);
  const u = new URL(CALLBACK_GROK);
  expect(() => retornoConector(`${u.protocol}//${u.host}.evil.test${u.pathname}`)).toThrow();
  expect(() => retornoConector(`${u.origin}${u.pathname}/otro`)).toThrow();
});
```

- [ ] **Step 2: Correr y verla fallar**

Run: `npx vitest run tests/portal/mcp-consentimiento.test.ts`
Expected: FAIL (`retornoConector` / `CALLBACK_GROK` no existen).

- [ ] **Step 3: Implementar.** `lib/mcp/consentimiento.ts`, líneas 1–8. `CALLBACK_GROK` es la URL exacta, sin query,
  que quedó en la sección 5.3 del spec:

```ts
/** Retorno OAuth de Grok, verificado en el registro dinámico de Supabase (spec 2026-11-19 §3 y §5.3). */
export const CALLBACK_GROK = 'https://…'; // valor exacto de la sección 5.3 del spec
const callbacks = [
  'https://claude.ai/api/mcp/auth_callback',
  'https://claude.com/api/mcp/auth_callback',
  CALLBACK_GROK,
];
export function retornoConector(valor: string) {
  const url = new URL(valor);
  if (url.username || url.password || url.hash || !callbacks.includes(`${url.origin}${url.pathname}`)) {
    throw new Error('La solicitud no pertenece a un conector permitido.');
  }
  return url.toString();
}
```

En `app/oauth/consent/actions.ts` y `app/oauth/consent/page.tsx`: renombrar `retornoClaude` → `retornoConector` y
cambiar los textos:

| Antes | Después |
|---|---|
| `Vuelve a conectar Claude.` (todas) | `Vuelve a conectar desde tu asistente.` |
| `antes de conectar Claude.` | `antes de conectar un asistente.` |
| `Esta solicitud no usa el retorno permitido de Claude.` | `Esta solicitud no usa un retorno de conector permitido.` |
| `Conectar con Claude` | `Conectar asistente` |
| `Los datos consultados se compartirán con Claude para responder tus preguntas.` | `Los datos consultados se compartirán con {detalles.data.client.name \|\| 'esta aplicación'} para responder tus preguntas.` |
| `Consultar costos, precios por canal y alertas de margen.` | se mantiene; agregar después `<li>Consultar ventas de tus sucursales asignadas, si el administrador autorizó esta aplicación.</li>` |
| `Puedes revocar el acceso desde Conectores en Claude o las autorizaciones OAuth de Supabase.` | `Puedes revocar el acceso desde los conectores de tu asistente o las autorizaciones OAuth de Supabase.` |

Run: `git grep -n "Claude" app/oauth lib/mcp/consentimiento.ts`
Expected: sin resultados.

- [ ] **Step 4: Correr pruebas**

Run: `npx vitest run tests/portal/mcp-consentimiento.test.ts && npm run typecheck`
Expected: PASS. Si alguna prueba existente esperaba un texto con «Claude», actualizarla al texto nuevo de la tabla.

- [ ] **Step 5: Documentación.** Crear `docs/mcp/grok.md`:

````markdown
# Consultar ventas de The Coffee desde Grok

Servidor: `https://portal.thecoffeemexico.com/mcp` (el mismo de Claude, ver `claude-web.md`).

## Activación por el administrador

1. Publicar la migración 61 (`supabase/migrations/20261119000061_mcp_ventas.sql`):

   ```powershell
   npx.cmd supabase db push
   ```

2. Desplegar en Vercel la versión que incluye las herramientas de ventas.

## Conectar Grok

1. En grok.com, agregar un conector MCP con la URL de arriba. El cliente OAuth se registra solo.
2. Iniciar sesión con la cuenta del portal que tenga asignadas las sucursales a consultar (para todo el país,
   una cuenta con todas) y aprobar **Permitir consultas**.
3. Pedirle a Grok «usa ventas_sucursales». La primera vez responde
   «Este conector no tiene ventas autorizadas… client_id …». Copiar ese `client_id`.
4. Administrador, en el editor SQL de Supabase:

   ```sql
   insert into public.mcp_ventas_clientes (client_id, nombre) values ('<client_id>', 'Grok');
   ```

5. Volver a pedir `ventas_sucursales`: ahora lista las sucursales.

Herramientas: `ventas_sucursales`, `ventas_resumen` (hoy en vivo o un periodo), `ventas_por_hora`,
`ventas_por_producto` y `ventas_bi`. Montos en MXN con IVA; máximo 120 días por consulta (7 en horas). Un día con
`completa: false` no se leyó entero y no se estima.

## Revocar

- Inmediato: `delete from public.mcp_ventas_clientes where client_id = '<client_id>';`
- Además: quitar el conector en Grok y revocar la autorización en Supabase → Authentication → OAuth Apps.
- Desactivar el perfil del portal corta todo acceso de esa cuenta.

## Alcance

Solo lectura. El conector ve únicamente las sucursales asignadas a la cuenta y solo si su `client_id` está
autorizado. Otros clientes OAuth (incluido Claude) no ven ventas hasta que se agreguen a la lista.
````

- [ ] **Step 6: Commit**

```bash
git add lib/mcp/consentimiento.ts app/oauth/consent tests/portal/mcp-consentimiento.test.ts docs/mcp/grok.md
git commit -m "feat(mcp): consentimiento OAuth para Grok y guía de conexión"
```

---

### Task 7: Publicar y verificar con Grok real (manual)

- [ ] **Step 1:** Suite completa local: `npm test && npm run typecheck && npm run build`. Expected: todo verde.
- [ ] **Step 2:** Abrir PR, revisarlo y fusionarlo; Vercel despliega.
- [ ] **Step 3:** Administrador: `npx.cmd supabase db push` (migración 61).
- [ ] **Step 4:** Seguir `docs/mcp/grok.md` pasos 1–5 con la cuenta nacional.
- [ ] **Step 5:** En Grok: «¿Cuánto vendió cada sucursal ayer y cuáles fueron los 5 productos más vendidos?». Comparar
  2 sucursales contra el Tablero de México del portal, con la misma cuenta y fecha. Deben coincidir al centavo.
- [ ] **Step 6:** Con otro cliente OAuth (Claude conectado), `ventas_sucursales` debe responder «no tiene ventas
  autorizadas». Las 6 herramientas de recetas siguen funcionando.
- [ ] **Step 7:** Anotar el resultado en `docs/mcp/grok.md` (sección «Verificación», con fecha) y hacer commit.
