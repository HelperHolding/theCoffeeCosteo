# BI con estilo de Metabase — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rediseñar `/bi/the-coffee-mexico` como mosaico al estilo de Metabase, con KPI comparados contra el periodo anterior, filtros en píldoras y tablas ordenables, sin cambiar cifras ni URL.

**Architecture:** Una función pura calcula el periodo anterior y la hora de corte (`lib/bi/comparacion.ts`); una RPC ligera `bi_kpis` (migración 76) devuelve solo KPI y cargas de ese periodo; la ruta `/api/bi/kpis` la sirve y el tablero la lee en paralelo. La presentación se rehace con dos piezas nuevas (`TarjetaBi`, `TablaBi`) y una píldora de filtro (`Pildora`), reutilizando colores y gráficas existentes.

**Tech Stack:** Next.js (App Router, ver `node_modules/next/dist/docs/` antes de tocar rutas), React 19, Tailwind v4, Supabase Postgres (PGlite en pruebas), Vitest (`node` para `*.test.ts`, `dom` para `*.test.tsx`).

**Spec:** `docs/superpowers/specs/2026-11-19-bi-estilo-metabase-design.md`

## Global Constraints

- Textos de la interfaz en español; nombres de filtros como en Zoho («Nombre de Tienda», «Product», «Net Amount (Local)», etc.).
- No se ejecuta `supabase login`, `link`, `db push` ni nada contra la base real. La migración 76 la aplica el usuario en el SQL Editor y la registra con `insert into supabase_migrations.schema_migrations (version, name) values ('20261120000076','bi_kpis');`.
- No se modifica `.env.local` ni se hace commit de secretos.
- La URL y sus parámetros no cambian: `lib/bi/url.ts` no se toca (salvo importar desde él).
- Colores de datos solo de `components/bi/colores-bi.ts` / `components/sucursales/colores.ts`; todo lo demás con variables del tema (`text-ink`, `bg-surface`, `border-line`, `text-ok`, `text-bad`, `text-muted-foreground`…), para claro y noche.
- Las cifras no cambian: `bi_tablero`, `bi_tendencias`, `bi_opciones` y `lib/bi/bloques.ts` (salvo la firma de `numerosClave` y las funciones nuevas) quedan iguales.
- Cada tarea termina con `npx vitest run <archivos de la tarea>` en verde y `npx tsc --noEmit` limpio. La prueba `tests/migracion/paridad.test.ts` ya fallaba antes y no cuenta.
- Commits en español, terminando con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **El periodo termina hoy pero el último corte es de ayer** (madrugada, antes del primer corte): no debe recortarse por hora → prueba en Task 1 (`horaCorte` → null).
2. **Rango libre que termina hoy** (`desde=…&hasta=<hoy>`): debe recortar igual que «Esta semana» → prueba en Task 3.
3. **Periodo anterior sin venta** (tienda nueva, anterior = 0): «Sin comparación», nunca «+∞ %» → pruebas en Task 1 (`cambio`) y Task 4.
4. **Un filtro activo escondido en «Más filtros»**: el botón lo cuenta aunque la fila esté cerrada → prueba en Task 7.
5. **Ordenar la tabla agrupada por tipo**: los subtotales siguen arriba de su grupo y el límite es por grupo → prueba en Task 5.

---

### Task 1: Periodo anterior, hora de corte y cambio porcentual

**Files:**
- Create: `lib/bi/comparacion.ts`
- Test: `tests/portal/bi-comparacion.test.ts`

**Interfaces:**
- Consumes: claves de Fecha Relativa de `OPCIONES_FR` (`lib/bi/url.ts`): `hoy`, `ayer`, `esta-semana`, `semana-anterior`, `2-semanas-anteriores`, `3-semanas-anteriores`, `4-semanas-anteriores`, `ultimas-4-semanas`, `este-mes`, `mes-anterior`, `ultimos-3-meses`, `este-trimestre`, `trimestre-anterior`, `este-ano`, `ano-anterior`.
- Produces:
  - `periodoAnterior(fr: string | undefined, p: { desde: string; hasta: string }): { desde: string; hasta: string }`
  - `horaCorte(ultimoCorte: string | null, hasta: string, hoy: string): number | null`
  - `cambio(actual: number | null, anterior: number | null): { pct: number; dir: 'sube' | 'baja' | 'igual' } | null`

- [ ] **Step 1: Write the failing test**

```ts
// tests/portal/bi-comparacion.test.ts
import { describe, expect, it } from 'vitest';
import { cambio, horaCorte, periodoAnterior } from '@/lib/bi/comparacion';

const ant = (fr: string | undefined, desde: string, hasta: string) => periodoAnterior(fr, { desde, hasta });

describe('periodoAnterior', () => {
  it('días: Hoy y Ayer comparan contra el día previo', () => {
    expect(ant('hoy', '2026-11-19', '2026-11-19')).toEqual({ desde: '2026-11-18', hasta: '2026-11-18' });
    expect(ant('ayer', '2026-11-18', '2026-11-18')).toEqual({ desde: '2026-11-17', hasta: '2026-11-17' });
  });

  it('semanas: mismos días de la semana previa', () => {
    expect(ant('esta-semana', '2026-11-16', '2026-11-18')).toEqual({ desde: '2026-11-09', hasta: '2026-11-11' });
    for (const fr of ['semana-anterior', '2-semanas-anteriores', '3-semanas-anteriores', '4-semanas-anteriores'])
      expect(ant(fr, '2026-11-09', '2026-11-15')).toEqual({ desde: '2026-11-02', hasta: '2026-11-08' });
    expect(ant('ultimas-4-semanas', '2026-10-19', '2026-11-15')).toEqual({ desde: '2026-09-21', hasta: '2026-10-18' });
  });

  it('meses: mismo tramo del mes anterior, recortado al fin de mes', () => {
    expect(ant('este-mes', '2026-11-01', '2026-11-19')).toEqual({ desde: '2026-10-01', hasta: '2026-10-19' });
    expect(ant('este-mes', '2026-03-01', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(ant('este-mes', '2028-03-01', '2028-03-30')).toEqual({ desde: '2028-02-01', hasta: '2028-02-29' });
    expect(ant('mes-anterior', '2026-03-01', '2026-03-31')).toEqual({ desde: '2026-02-01', hasta: '2026-02-28' });
    expect(ant('ultimos-3-meses', '2026-08-01', '2026-10-31')).toEqual({ desde: '2026-05-01', hasta: '2026-07-31' });
  });

  it('trimestres y años', () => {
    expect(ant('este-trimestre', '2026-10-01', '2026-11-19')).toEqual({ desde: '2026-07-01', hasta: '2026-08-19' });
    expect(ant('este-trimestre', '2026-04-01', '2026-05-31')).toEqual({ desde: '2026-01-01', hasta: '2026-02-28' });
    expect(ant('trimestre-anterior', '2026-07-01', '2026-09-30')).toEqual({ desde: '2026-04-01', hasta: '2026-06-30' });
    expect(ant('este-ano', '2026-01-01', '2026-11-19')).toEqual({ desde: '2025-01-01', hasta: '2025-11-19' });
    expect(ant('este-ano', '2028-01-01', '2028-02-29')).toEqual({ desde: '2027-01-01', hasta: '2027-02-28' });
    expect(ant('ano-anterior', '2025-01-01', '2025-12-31')).toEqual({ desde: '2024-01-01', hasta: '2024-12-31' });
  });

  it('rango libre: los N días inmediatamente anteriores, también al cruzar el año', () => {
    expect(ant(undefined, '2026-11-01', '2026-11-10')).toEqual({ desde: '2026-10-22', hasta: '2026-10-31' });
    expect(ant(undefined, '2026-01-01', '2026-01-03')).toEqual({ desde: '2025-12-29', hasta: '2025-12-31' });
  });
});

describe('horaCorte', () => {
  it('solo si el periodo termina hoy y el último corte es de hoy (hora de CDMX)', () => {
    // 17:30 UTC = 11:30 en CDMX
    expect(horaCorte('2026-11-19T17:30:00Z', '2026-11-19', '2026-11-19')).toBe(11);
    expect(horaCorte('2026-11-19T17:30:00Z', '2026-11-18', '2026-11-19')).toBeNull();
    expect(horaCorte(null, '2026-11-19', '2026-11-19')).toBeNull();
  });

  it('el corte de ayer (madrugada, antes del primer corte de hoy) no recorta', () => {
    // 03:00 UTC del 19 = 21:00 del 18 en CDMX
    expect(horaCorte('2026-11-19T03:00:00Z', '2026-11-19', '2026-11-19')).toBeNull();
  });
});

describe('cambio', () => {
  it('sube, baja e igual (menos de 0.1 %)', () => {
    expect(cambio(110, 100)).toEqual({ pct: 0.1, dir: 'sube' });
    expect(cambio(90, 100)).toEqual({ pct: -0.1, dir: 'baja' });
    expect(cambio(100.05, 100)).toEqual({ pct: expect.closeTo(0.0005, 6), dir: 'igual' });
  });

  it('sin base no hay comparación (nunca +∞ %)', () => {
    expect(cambio(100, 0)).toBeNull();
    expect(cambio(100, null)).toBeNull();
    expect(cambio(null, 100)).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/portal/bi-comparacion.test.ts`
Expected: FAIL — `Failed to resolve import "@/lib/bi/comparacion"`.

- [ ] **Step 3: Write minimal implementation**

```ts
// lib/bi/comparacion.ts
// Comparación de los KPI del tablero BI contra el periodo anterior
// (docs/superpowers/specs/2026-11-19-bi-estilo-metabase-design.md §2).

const DIA_MS = 86_400_000;
const aFecha = (s: string) => new Date(`${s}T00:00:00Z`);
const aTexto = (d: Date) => d.toISOString().slice(0, 10);
const sumarDias = (s: string, n: number) => aTexto(new Date(aFecha(s).getTime() + n * DIA_MS));
const diasEntre = (a: string, b: string) => Math.round((aFecha(b).getTime() - aFecha(a).getTime()) / DIA_MS);

/** Mueve una fecha n meses; si el día no existe en el mes destino, queda en su último día (31 mar − 1 → 28 feb). */
function sumarMeses(s: string, n: number) {
  const d = aFecha(s);
  const a = d.getUTCFullYear();
  const m = d.getUTCMonth() + n;
  const ultimo = new Date(Date.UTC(a, m + 1, 0)).getUTCDate();
  return aTexto(new Date(Date.UTC(a, m, Math.min(d.getUTCDate(), ultimo))));
}
const finDeMes = (s: string) => {
  const d = aFecha(s);
  return aTexto(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
};

type Periodo = { desde: string; hasta: string };
const correrDias = (p: Periodo, n: number): Periodo => ({ desde: sumarDias(p.desde, n), hasta: sumarDias(p.hasta, n) });
/** Tramo en curso (del inicio a hoy): mismo tramo k meses antes. */
const tramoMeses = (p: Periodo, k: number): Periodo => ({ desde: sumarMeses(p.desde, -k), hasta: sumarMeses(p.hasta, -k) });
/** Meses calendario completos: los k meses previos completos. */
const mesesCompletos = (p: Periodo, k: number): Periodo => {
  const desde = sumarMeses(p.desde, -k);
  return { desde, hasta: finDeMes(sumarMeses(p.hasta, -k)) };
};

/** Periodo con el que se comparan los KPI: mismo largo y mismo tramo, inmediatamente antes. */
export function periodoAnterior(fr: string | undefined, p: Periodo): Periodo {
  switch (fr) {
    case 'hoy':
    case 'ayer':
      return correrDias(p, -1);
    case 'esta-semana':
    case 'semana-anterior':
    case '2-semanas-anteriores':
    case '3-semanas-anteriores':
    case '4-semanas-anteriores':
      return correrDias(p, -7);
    case 'ultimas-4-semanas':
      return correrDias(p, -28);
    case 'este-mes':
      return tramoMeses(p, 1);
    case 'este-trimestre':
      return tramoMeses(p, 3);
    case 'este-ano':
      return tramoMeses(p, 12);
    case 'mes-anterior':
      return mesesCompletos(p, 1);
    case 'ultimos-3-meses':
    case 'trimestre-anterior':
      return mesesCompletos(p, 3);
    case 'ano-anterior':
      return mesesCompletos(p, 12);
    default: {
      const n = diasEntre(p.desde, p.hasta) + 1;
      return { desde: sumarDias(p.desde, -n), hasta: sumarDias(p.desde, -1) };
    }
  }
}

const ZONA = 'America/Mexico_City';
const enMexico = (ms: number) => {
  const partes = new Intl.DateTimeFormat('en-CA', {
    timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms));
  const v = (t: string) => partes.find((x) => x.type === t)!.value;
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: Number(v('hour')) };
};

/**
 * Hora (CDMX) del último corte si el periodo termina hoy y ese corte es de hoy; si no, null (sin recorte).
 * El último día del periodo anterior solo cuenta las líneas con hora < esta hora.
 */
export function horaCorte(ultimoCorte: string | null, hasta: string, hoy: string): number | null {
  if (!ultimoCorte || hasta !== hoy) return null;
  const ms = Date.parse(ultimoCorte);
  if (!Number.isFinite(ms)) return null;
  const c = enMexico(ms);
  return c.fecha === hoy ? c.hora : null;
}

/** Cambio relativo; sin base (anterior 0 o nulo) no hay comparación. «igual» si |cambio| < 0.1 %. */
export function cambio(actual: number | null, anterior: number | null) {
  if (actual === null || anterior === null || anterior === 0) return null;
  const pct = (actual - anterior) / anterior;
  const dir: 'sube' | 'baja' | 'igual' = Math.abs(pct) < 0.001 ? 'igual' : pct > 0 ? 'sube' : 'baja';
  return { pct, dir };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/portal/bi-comparacion.test.ts`
Expected: PASS (si `cambio(110, 100)` da `0.10000000000000009`, cambia esas dos aserciones a `{ pct: expect.closeTo(0.1, 6), dir: … }`).

- [ ] **Step 5: Commit**

```bash
git add lib/bi/comparacion.ts tests/portal/bi-comparacion.test.ts
git commit -m "BI estilo Metabase: periodo anterior, hora de corte y cambio de los KPI"
```

---

### Task 2: Migración 76 `bi_kpis`, tipos

**Files:**
- Create: `supabase/migrations/20261120000076_bi_kpis.sql`
- Modify: `lib/supabase/database.types.ts` (junto a `bi_tablero`, línea ~338), `lib/bi/tipos.ts`
- Test: `tests/db/bi-kpis.test.ts`

**Interfaces:**
- Consumes: `bi_lineas_filtradas(p jsonb, desde date, hasta date, con_semanas boolean)` y `bi_tiendas_filtradas(p jsonb)` (migraciones 40/43), `bi_cargas`.
- Produces:
  - RPC `public.bi_kpis(p jsonb, p_hora_corte integer default null) returns jsonb` → `{ kpis: {venta_cent, venta_bruta_cent, tickets, lineas, unidades}, cargas: {esperados, con_carga, incompletos} }`.
  - Tipos en `lib/bi/tipos.ts`:
    ```ts
    export interface RpcKpis { kpis: RpcTablero['kpis']; cargas: RpcTablero['cargas'] }
    export type RespuestaKpis =
      | { sinComparacion: 'semanas' }
      | { periodo: { desde: string; hasta: string }; horaCorte: number | null; kpis: RpcKpis['kpis'] | null; cargas: RpcKpis['cargas'] | null };
    ```
  - En `database.types.ts`: `bi_kpis: { Args: { p: Json; p_hora_corte?: number | null }; Returns: Json };`

Ruling ya tomado: sin acceso, `bi_kpis` devuelve ceros (como `bi_tablero`, porque `bi_tiendas_filtradas` deja fuera las tiendas sin `bi_acceso`), no `null`; la ruta (Task 3) responde `kpis: null` cuando no queda ninguna tienda.

- [ ] **Step 1: Write the failing test**

```ts
// tests/db/bi-kpis.test.ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 76: bi_kpis = mismos kpis y cargas que bi_tablero, con recorte opcional por hora en el último día.
let db: PGlite;
let conBi: string;
let sinBi: string;
type T = Record<string, any>;
const L = (pedido: string, hora: number, x: Record<string, unknown> = {}) => ({
  pedido, linea: 1, hora, canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 10000, importe_neto_cent: 9700,
  descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,true,now(),$4,false)', ['pos', c, f, JSON.stringify(ls)]);
const kpis = (user: string, p: Record<string, unknown>, hora: number | null = null) =>
  comoUsuario(db, user, async () =>
    (await db.query<{ r: T }>('select public.bi_kpis($1, $2) r', [JSON.stringify(p), hora])).rows[0].r);
const tablero = (user: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>('select public.bi_tablero($1) r', [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-11-17', hasta: '2026-11-18', hoy: '2026-11-18', companias: [384] };

beforeAll(async () => {
  db = await crearDbLocal();
  conBi = await crearUsuario(db, 'sucursales');
  sinBi = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'bi','lectura'),($2,'sucursales','lectura')`, [conBi, sinBi]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,384)', [conBi, sinBi]);
  await guardar(384, '2026-11-17', [L('A', 9), L('B', 15, { unidades: 2, importe_cent: 20000, importe_neto_cent: 19400 })]);
  await guardar(384, '2026-11-18', [L('C', 8), L('D', 11), L('E', 16)]);
});
afterAll(async () => db.close());

describe('migración 76: bi_kpis', () => {
  it('devuelve los mismos kpis y cargas que bi_tablero', async () => {
    const k = await kpis(conBi, base);
    const t = await tablero(conBi, base);
    expect(k.kpis).toEqual(t.kpis);
    expect(k.cargas).toEqual(t.cargas);
    expect(k.kpis).toMatchObject({ tickets: 5, lineas: 5, unidades: 6 });
  });

  it('con hora de corte solo recorta el último día (hora < corte)', async () => {
    const k = await kpis(conBi, base, 11);
    // 17-nov completo (A 9h, B 15h) + 18-nov solo C (8h): D (11h) y E (16h) quedan fuera.
    expect(k.kpis.tickets).toBe(3);
    expect(k.kpis.venta_cent).toBe(9700 + 19400 + 9700);
  });

  it('sin módulo bi no ve nada (ceros, como bi_tablero)', async () => {
    const k = await kpis(sinBi, base);
    expect(k.kpis).toMatchObject({ venta_cent: 0, tickets: 0 });
    expect(k.cargas.esperados).toBe(0);
  });

  it('niega tokens OAuth', async () => {
    const k = await comoUsuario(db, conBi, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: conBi, client_id: 'grok' })]);
      try { return (await db.query<{ r: T }>('select public.bi_kpis($1) r', [JSON.stringify(base)])).rows[0].r; }
      finally { await db.query(`select set_config('request.jwt.claims', '', false)`); }
    });
    expect(k.kpis.tickets).toBe(0);
  });

  it('periodo inválido: error', async () => {
    await expect(kpis(conBi, { ...base, desde: '2026-11-19' })).rejects.toThrow(/Periodo inválido/);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/bi-kpis.test.ts`
Expected: FAIL — `function public.bi_kpis(unknown, unknown) does not exist`.

- [ ] **Step 3: Write the migration**

Antes de escribirla, abre `supabase/migrations/20261120000074_bi_metas_pe.sql` líneas 80–100 y confirma que las expresiones de `cargas` y `kpis` siguen siendo las de abajo; si cambiaron, copia las de la 74 tal cual.

```sql
-- Migración 76: KPI de un periodo (el anterior) para la comparación del tablero BI
-- (docs/superpowers/specs/2026-11-19-bi-estilo-metabase-design.md §5). Mismas expresiones de kpis y cargas que
-- bi_tablero (migración 74); p_hora_corte recorta solo el último día (hora < p_hora_corte).
-- Se aplica a mano en el SQL Editor y se registra:
--   insert into supabase_migrations.schema_migrations (version, name) values ('20261120000076','bi_kpis');

create function public.bi_kpis(p jsonb, p_hora_corte integer default null) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (p->>'desde')::date;
  h date := (p->>'hasta')::date;
  v_hoy date := coalesce((p->>'hoy')::date, current_date);
  r jsonb;
begin
  if d is null or h is null or d > h or h - d > 1100 then
    raise exception 'Periodo inválido (máximo 1,100 días).';
  end if;
  with bi_f as materialized (
    select * from public.bi_lineas_filtradas(p, d, h, true) l
    where p_hora_corte is null or l.fecha < h or l.hora < p_hora_corte)
  select jsonb_build_object(
    'cargas', (select jsonb_build_object('esperados', count(*), 'con_carga', count(k.*), 'incompletos', count(*) filter (where k.completa is false))
      from public.bi_tiendas_filtradas(p) c
      cross join lateral generate_series(greatest(d, c.fecha_apertura)::timestamp, least(h, v_hoy)::timestamp, interval '1 day') g(dia)
      left join public.bi_cargas k on k.fuente = 'pos' and k.company_id = c.company_id and k.fecha = g.dia::date),
    'kpis', (select jsonb_build_object('venta_cent', coalesce(sum(importe_neto_cent), 0), 'venta_bruta_cent', coalesce(sum(importe_cent), 0),
      'tickets', count(distinct (fuente, company_id, fecha, pedido)), 'lineas', count(*), 'unidades', coalesce(sum(unidades), 0)) from bi_f))
  into r;
  return r;
end $$;

revoke all on function public.bi_kpis(jsonb, integer) from public, anon;
grant execute on function public.bi_kpis(jsonb, integer) to authenticated;
```

- [ ] **Step 4: Tipos**

En `lib/supabase/database.types.ts`, debajo de `bi_tablero: { Args: { p: Json }; Returns: Json };`:

```ts
      /** Migración 76: kpis y cargas de un periodo, con recorte opcional por hora en el último día. */
      bi_kpis: { Args: { p: Json; p_hora_corte?: number | null }; Returns: Json };
```

En `lib/bi/tipos.ts`, después de `RpcTablero`:

```ts
/** bi_kpis (migración 76): los mismos kpis y cargas de bi_tablero para otro periodo. */
export interface RpcKpis {
  kpis: RpcTablero['kpis'];
  cargas: RpcTablero['cargas'];
}

/** /api/bi/kpis: KPI del periodo anterior. Con filtro de semanas no hay periodo anterior claro. */
export type RespuestaKpis =
  | { sinComparacion: 'semanas' }
  | {
      periodo: { desde: string; hasta: string };
      horaCorte: number | null;
      kpis: RpcKpis['kpis'] | null;
      cargas: RpcKpis['cargas'] | null;
    };
```

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/db/bi-kpis.test.ts tests/db/bi-acceso.test.ts && npx tsc --noEmit`
Expected: PASS y tsc limpio.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261120000076_bi_kpis.sql lib/supabase/database.types.ts lib/bi/tipos.ts tests/db/bi-kpis.test.ts
git commit -m "BI estilo Metabase: migración 76 bi_kpis (kpis y cargas del periodo anterior)"
```

---

### Task 3: Ruta `/api/bi/kpis`

**Files:**
- Create: `app/api/bi/kpis/route.ts`
- Test: `tests/portal/bi-rutas.test.ts` (agregar `describe('/api/bi/kpis')`)

**Interfaces:**
- Consumes: `periodoAnterior`, `horaCorte` (Task 1); `RespuestaKpis`, `RpcKpis` (Task 2); `accesoBi` (`lib/supabase/sesion.ts`), `aJsonRpc` (`lib/bi/filtros.ts`), `aFiltrosBi`, `hoyMexico`, `leerUrl`, `resolverPeriodo` (`lib/bi/url.ts`), `json` (`lib/sucursales/rutas.ts`).
- Produces: `GET /api/bi/kpis?<mismos parámetros que /api/bi/tablero>` → `RespuestaKpis`; 401/403 (sesión), 400 (periodo inválido), 503 (fallo de RPC).

- [ ] **Step 1: Write the failing tests**

En `tests/portal/bi-rutas.test.ts`:
1. En el `vi.hoisted` agrega `ultimoCorte: null as string | null,` y en `beforeEach` `s.ultimoCorte = null;`.
2. En el mock de `rpc`, cambia `ultimo_corte: null` por `ultimo_corte: s.ultimoCorte` y agrega a `datos`: `bi_kpis: { kpis: { venta_cent: 5 }, cargas: { esperados: 1, con_carga: 1, incompletos: 0 } },`.
3. Cambia la firma del mock a `rpc: async (fn: string, args: { p: Record<string, unknown>; p_hora_corte?: number | null }) => { s.llamadas.push({ fn, p: args.p, hora: args.p_hora_corte }); …` y el tipo de `llamadas` a `{ fn: string; p: Record<string, unknown>; hora?: number | null }[]`.
4. Importa la ruta: `import { GET as kpis } from '@/app/api/bi/kpis/route';`
5. Agrega al final:

```ts
describe('/api/bi/kpis', () => {
  // Reloj de las pruebas: 2026-11-06T05:30Z = 23:30 del 5-nov en CDMX (hoy = 2026-11-05, jueves).
  it('401 sin sesión, 403 sin módulo bi y 400 con periodo inválido sin tocar la base', async () => {
    s.usuario = null;
    expect((await pedir(kpis)).status).toBe(401);
    s.usuario = 'u1'; s.modulos = [{ modulo: 'sucursales', nivel: 'lectura' }];
    expect((await pedir(kpis)).status).toBe(403);
    s.modulos = [{ modulo: 'bi', nivel: 'lectura' }]; s.llamadas = [];
    expect((await pedir(kpis, '?desde=2026-10-07&hasta=2026-10-01')).status).toBe(400);
    expect(s.llamadas).toEqual([]);
  });

  it('Esta semana (lun 2 – jue 5) se compara con lun 26 – jue 29 oct y las mismas tiendas', async () => {
    const r = await pedir(kpis, '?tiendas=612,999');
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const cuerpo = await r.json();
    expect(cuerpo.periodo).toEqual({ desde: '2026-10-26', hasta: '2026-10-29' });
    const l = s.llamadas.find((x) => x.fn === 'bi_kpis')!;
    expect(l.p).toMatchObject({ desde: '2026-10-26', hasta: '2026-10-29', hoy: '2026-11-05', companias: [612] });
  });

  it('recorta por hora solo si el periodo termina hoy y el corte es de hoy (también con rango libre)', async () => {
    s.ultimoCorte = '2026-11-05T17:30:00Z'; // 11:30 en CDMX
    await pedir(kpis);
    expect(s.llamadas.find((x) => x.fn === 'bi_kpis')!.hora).toBe(11);
    s.llamadas = [];
    await pedir(kpis, '?desde=2026-11-01&hasta=2026-11-05');
    expect(s.llamadas.find((x) => x.fn === 'bi_kpis')!.hora).toBe(11);
    s.llamadas = [];
    await pedir(kpis, '?fr=semana-anterior');
    expect(s.llamadas.find((x) => x.fn === 'bi_kpis')!.hora).toBeNull();
  });

  it('con filtro de semanas no compara ni consulta', async () => {
    const r = await pedir(kpis, '?sem=W45%202026');
    expect(await r.json()).toEqual({ sinComparacion: 'semanas' });
    expect(s.llamadas.some((x) => x.fn === 'bi_kpis')).toBe(false);
  });

  it('sin tiendas con acceso responde kpis null sin llamar bi_kpis', async () => {
    const r = await pedir(kpis, '?tiendas=999');
    expect((await r.json()).kpis).toBeNull();
    expect(s.llamadas.some((x) => x.fn === 'bi_kpis')).toBe(false);
  });
});
```

(Si el parámetro de semanas en `lib/bi/url.ts` se escribe distinto de `sem` con valores `W45 2026`, usa el que lea `leerUrl`; revisa `escribirUrl` en ese archivo.)

- [ ] **Step 2: Run to verify it fails**

Run: `npx vitest run tests/portal/bi-rutas.test.ts`
Expected: FAIL — no se resuelve `@/app/api/bi/kpis/route`.

- [ ] **Step 3: Implementation**

```ts
// app/api/bi/kpis/route.ts
import type { Json } from '@/lib/supabase/database.types';
import { accesoBi } from '@/lib/supabase/sesion';
import { aJsonRpc } from '@/lib/bi/filtros';
import { horaCorte, periodoAnterior } from '@/lib/bi/comparacion';
import { aFiltrosBi, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import { json } from '@/lib/sucursales/rutas';
import type { RespuestaKpis, RpcKpis, RpcOpciones } from '@/lib/bi/tipos';

export const runtime = 'nodejs';

/**
 * KPI del periodo anterior para la comparación del tablero (spec 2026-11-19-bi-estilo-metabase §2 y §5): mismos
 * filtros y tiendas que /api/bi/tablero; si el periodo termina hoy, el último día se recorta a la hora del corte.
 */
export async function GET(req: Request) {
  const a = await accesoBi();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const hoy = hoyMexico(new Date());
  const f = leerUrl(new URL(req.url).searchParams);
  const periodo = resolverPeriodo(f, hoy);
  if (!periodo.ok) return json({ error: periodo.error }, 400);
  if (f.semanas.length) return json<RespuestaKpis>({ sinComparacion: 'semanas' });
  const actual = { desde: periodo.desde, hasta: periodo.hasta };
  const anterior = periodoAnterior(f.fr, actual);
  const o = await a.db.rpc('bi_opciones', { p: actual });
  if (o.error || !o.data) {
    console.error('[bi] opciones (kpis)', o.error);
    return json({ error: 'No se pudo leer la comparación.' }, 503);
  }
  const opciones = o.data as unknown as RpcOpciones;
  const conAcceso = opciones.tiendas.map((t) => t.company_id);
  const companias = f.companias.length ? f.companias.filter((c) => conAcceso.includes(c)) : conAcceso;
  const hora = horaCorte(opciones.ultimo_corte, actual.hasta, hoy);
  if (!companias.length) return json<RespuestaKpis>({ periodo: anterior, horaCorte: hora, kpis: null, cargas: null });
  const k = await a.db.rpc('bi_kpis', {
    p: aJsonRpc(aFiltrosBi(f, anterior, companias, hoy)) as Json,
    p_hora_corte: hora,
  });
  if (k.error || !k.data) {
    console.error('[bi] kpis', k.error);
    return json({ error: 'No se pudo leer la comparación.' }, 503);
  }
  const r = k.data as unknown as RpcKpis;
  return json<RespuestaKpis>({ periodo: anterior, horaCorte: hora, kpis: r.kpis, cargas: r.cargas });
}
```

- [ ] **Step 4: Run tests**

Run: `npx vitest run tests/portal/bi-rutas.test.ts && npx tsc --noEmit`
Expected: PASS, tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add app/api/bi/kpis/route.ts tests/portal/bi-rutas.test.ts
git commit -m "BI estilo Metabase: ruta /api/bi/kpis con periodo anterior y recorte por hora"
```

---

### Task 4: Tarjetas KPI con comparación

**Files:**
- Modify: `lib/bi/bloques.ts` (firma de `numerosClave`, nueva `estadoComparacion`), `components/bi/bloques-resumen.tsx` (`NumerosClave`), `components/bi/tablero-mexico.tsx` (tercera lectura), `app/globals.css` (`.kpis-bi`), `tests/portal/vista/bi.tsx` (simular `/api/bi/kpis`)
- Test: `tests/portal/bi-bloques.test.ts`, `tests/portal/bi-tablero-ui.test.tsx`

**Interfaces:**
- Consumes: `cambio` (Task 1), `RespuestaKpis` (Task 2), `/api/bi/kpis` (Task 3).
- Produces:
  - `numerosClave(t: Pick<RpcTablero, 'kpis'>)` (antes recibía `RpcTablero`; mismo resultado).
  - `estadoComparacion(r: RespuestaKpis | null, error: boolean): EstadoComparacion` con
    ```ts
    export type EstadoComparacion =
      | { estado: 'cargando' }
      | { estado: 'error' }
      | { estado: 'semanas' }
      | { estado: 'faltan'; periodo: { desde: string; hasta: string } }
      | { estado: 'ok'; periodo: { desde: string; hasta: string }; anterior: ReturnType<typeof numerosClave> };
    ```
  - `NumerosClave({ n, comparacion }: { n: ReturnType<typeof numerosClave>; comparacion: EstadoComparacion })`.

- [ ] **Step 1: Failing tests (bloques)**

Agrega a `tests/portal/bi-bloques.test.ts`:

```ts
import { estadoComparacion, numerosClave } from '@/lib/bi/bloques';

describe('estadoComparacion', () => {
  const kpis = { venta_cent: 1000, venta_bruta_cent: 1100, tickets: 10, lineas: 15, unidades: 18 };
  const periodo = { desde: '2026-11-09', hasta: '2026-11-11' };
  it('cargando, error y semanas', () => {
    expect(estadoComparacion(null, false)).toEqual({ estado: 'cargando' });
    expect(estadoComparacion(null, true)).toEqual({ estado: 'error' });
    expect(estadoComparacion({ sinComparacion: 'semanas' }, false)).toEqual({ estado: 'semanas' });
  });
  it('sin tiendas (kpis null) es error, no ceros', () => {
    expect(estadoComparacion({ periodo, horaCorte: null, kpis: null, cargas: null }, false)).toEqual({ estado: 'error' });
  });
  it('días faltantes o incompletos en el periodo anterior: faltan', () => {
    expect(estadoComparacion({ periodo, horaCorte: null, kpis, cargas: { esperados: 3, con_carga: 2, incompletos: 0 } }, false))
      .toEqual({ estado: 'faltan', periodo });
    expect(estadoComparacion({ periodo, horaCorte: null, kpis, cargas: { esperados: 3, con_carga: 3, incompletos: 1 } }, false))
      .toEqual({ estado: 'faltan', periodo });
  });
  it('ok: el anterior pasa por numerosClave', () => {
    expect(estadoComparacion({ periodo, horaCorte: 11, kpis, cargas: { esperados: 3, con_carga: 3, incompletos: 0 } }, false))
      .toEqual({ estado: 'ok', periodo, anterior: numerosClave({ kpis }) });
  });
});
```

Run: `npx vitest run tests/portal/bi-bloques.test.ts` → FAIL (`estadoComparacion` no existe).

- [ ] **Step 2: Implementation (bloques)**

En `lib/bi/bloques.ts`: cambia `export function numerosClave(t: RpcTablero)` por `export function numerosClave(t: Pick<RpcTablero, 'kpis'>)` (cuerpo igual) y agrega:

```ts
import type { RespuestaKpis } from './tipos';

export type EstadoComparacion =
  | { estado: 'cargando' }
  | { estado: 'error' }
  | { estado: 'semanas' }
  | { estado: 'faltan'; periodo: { desde: string; hasta: string } }
  | { estado: 'ok'; periodo: { desde: string; hasta: string }; anterior: ReturnType<typeof numerosClave> };

/** Estado de la comparación de los KPI: nunca compara contra días faltantes ni incompletos (serían ceros falsos). */
export function estadoComparacion(r: RespuestaKpis | null, error: boolean): EstadoComparacion {
  if (!r) return error ? { estado: 'error' } : { estado: 'cargando' };
  if ('sinComparacion' in r) return { estado: 'semanas' };
  if (!r.kpis || !r.cargas) return { estado: 'error' };
  if (r.cargas.con_carga < r.cargas.esperados || r.cargas.incompletos > 0) return { estado: 'faltan', periodo: r.periodo };
  return { estado: 'ok', periodo: r.periodo, anterior: numerosClave({ kpis: r.kpis }) };
}
```

Run: `npx vitest run tests/portal/bi-bloques.test.ts` → PASS.

- [ ] **Step 3: Failing UI test**

En `tests/portal/bi-tablero-ui.test.tsx`:
1. Arriba de `beforeEach`, agrega `const comparacion = { valor: { periodo: { desde: '2026-10-26', hasta: '2026-10-29' }, horaCorte: null, kpis: { venta_cent: 25000, venta_bruta_cent: 26000, tickets: 5, lineas: 6, unidades: 7 }, cargas: { esperados: 4, con_carga: 4, incompletos: 0 } } as unknown };`
2. En el mock de `fetch`, antes de devolver `tablero`, agrega: `String(url).includes('/api/bi/kpis') ? comparacion.valor :`.
3. En `beforeEach` reinicia `comparacion.valor` al objeto de arriba (guárdalo en una constante `COMPARACION_OK` y asigna una copia).
4. Agrega:

```ts
describe('<TableroMexico> comparación de KPI', () => {
  it('pide /api/bi/kpis con los mismos filtros y pinta ▲/▼ contra el periodo anterior', async () => {
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/▲ 20\.0/)).toBeTruthy()); // venta 300.00 vs 250.00
    expect((global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toContain('/api/bi/kpis?cafe=si');
    expect(screen.getByText(/▼ 20\.0/)).toBeTruthy(); // tickets 4 vs 5
    expect(screen.getAllByText(/lun 26 de oct.*jue 29 de oct/).length).toBeGreaterThan(0);
  });

  it('días faltantes en el periodo anterior: «Sin comparación: faltan días»', async () => {
    comparacion.valor = { ...COMPARACION_OK, cargas: { esperados: 4, con_carga: 3, incompletos: 0 } };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText(/Sin comparación: faltan días/).length).toBe(5));
  });

  it('periodo anterior sin venta: «Sin comparación», nunca infinito', async () => {
    comparacion.valor = { ...COMPARACION_OK, kpis: { venta_cent: 0, venta_bruta_cent: 0, tickets: 0, lineas: 0, unidades: 0 } };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText('Sin comparación').length).toBe(5));
    expect(screen.queryByText(/∞|Infinity|NaN/)).toBeNull();
  });

  it('con filtro de semanas lo dice', async () => {
    comparacion.valor = { sinComparacion: 'semanas' };
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getAllByText('Sin comparación con filtro de semanas').length).toBe(5));
  });
});
```

(El texto exacto del periodo depende de `fechaCorta`; si da «lun, 26 oct», ajusta la expresión regular al formato que imprime `fechaCorta('2026-10-26')`, no cambies `fechaCorta`.)

Run: `npx vitest run tests/portal/bi-tablero-ui.test.tsx` → FAIL.

- [ ] **Step 4: Implementation (UI)**

`components/bi/bloques-resumen.tsx`: reemplaza `NumerosClave` por esta versión (quita los imports de íconos que dejen de usarse y el de `Kpi` si ya no se usa):

```tsx
import { cambio } from '@/lib/bi/comparacion';
import { fechaCorta } from '@/components/sucursales/formato';
import type { EstadoComparacion } from '@/lib/bi/bloques';

type Clave = 'ventaCent' | 'ticketPromedioCent' | 'tickets' | 'upt' | 'unidades';

function LineaComparacion({
  actual,
  clave,
  formato,
  c,
}: {
  actual: number | null;
  clave: Clave;
  formato: (x: number) => string;
  c: EstadoComparacion;
}) {
  if (c.estado === 'cargando')
    return <span aria-hidden="true" className="block h-4 w-32 animate-pulse rounded bg-surface-2" />;
  if (c.estado === 'semanas') return <p className="text-xs text-muted-foreground">Sin comparación con filtro de semanas</p>;
  if (c.estado === 'faltan')
    return (
      <p className="text-xs text-muted-foreground">
        Sin comparación: faltan días en {fechaCorta(c.periodo.desde)} – {fechaCorta(c.periodo.hasta)}
      </p>
    );
  if (c.estado === 'error') return <p className="text-xs text-muted-foreground">Sin comparación</p>;
  const anterior = c.anterior[clave];
  const d = cambio(actual, anterior);
  if (!d || anterior === null) return <p className="text-xs text-muted-foreground">Sin comparación</p>;
  const signo = d.dir === 'sube' ? '▲' : d.dir === 'baja' ? '▼' : '=';
  const color = d.dir === 'sube' ? 'text-ok' : d.dir === 'baja' ? 'text-bad' : 'text-muted-foreground';
  return (
    <div className="space-y-0.5 text-xs">
      <p>
        <span className={`font-semibold ${color}`}>
          {signo} {porcentaje(d.dir === 'igual' ? 0 : Math.abs(d.pct))}
        </span>{' '}
        <span className="text-muted-foreground">vs {formato(anterior)}</span>
      </p>
      <p className="text-muted-foreground">
        {fechaCorta(c.periodo.desde)} – {fechaCorta(c.periodo.hasta)}
      </p>
    </div>
  );
}

/**
 * Bloque 1, estilo Metabase: título chico, número grande y su cambio contra el periodo anterior (mismas fórmulas:
 * el anterior también pasa por numerosClave). Los cocientes sin base llegan null y se ven «—».
 */
export function NumerosClave({ n, comparacion }: { n: ReturnType<typeof numerosClave>; comparacion: EstadoComparacion }) {
  const pesos = (x: number) => dinero(Math.round(x), 'MXN', false);
  const conCentavos = (x: number) => dinero(Math.round(x));
  const entero = (x: number) => numero(Math.round(x));
  const tarjetas: { etiqueta: string; clave: Clave; formato: (x: number) => string; nota?: string }[] = [
    { etiqueta: 'Ventas Netas', clave: 'ventaCent', formato: pesos, nota: `Cobrado: ${dinero(n.cobradoCent)}` },
    { etiqueta: 'Ticket Promedio', clave: 'ticketPromedioCent', formato: conCentavos },
    { etiqueta: '# de Tickets', clave: 'tickets', formato: entero },
    { etiqueta: 'Promedio UPT', clave: 'upt', formato: (x) => decimales.format(x) },
    { etiqueta: 'Total Products', clave: 'unidades', formato: entero },
  ];
  return (
    <section aria-label="Números clave" className="kpis-bi">
      {tarjetas.map((t) => {
        const v = n[t.clave];
        return (
          <div key={t.clave} className="min-w-0 space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink-2">{t.etiqueta}</h2>
            <p className="font-display text-[clamp(1.5rem,2.2vw,2.25rem)] leading-none font-black tabular">
              {v === null ? '—' : <Cifra valor={v} formato={t.formato} />}
            </p>
            <LineaComparacion actual={v} clave={t.clave} formato={t.formato} c={comparacion} />
            {t.nota && <p className="text-[11px] text-muted-foreground">{t.nota}</p>}
          </div>
        );
      })}
    </section>
  );
}
```

`app/globals.css`: reemplaza el bloque completo de `.kpis-bi` (las reglas de `40rem`, `64rem` y `96rem`) por:

```css
  .kpis-bi {
    display: grid;
    gap: 1rem;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .kpis-bi > :last-child {
    grid-column: span 2;
  }
  @media (min-width: 64rem) {
    .kpis-bi {
      grid-template-columns: repeat(5, minmax(0, 1fr));
    }
    .kpis-bi > :last-child {
      grid-column: auto;
    }
  }
```

`components/bi/tablero-mexico.tsx`:
- Importa `estadoComparacion` de `@/lib/bi/bloques` y `RespuestaKpis` de `@/lib/bi/tipos`.
- Debajo de `const tendencias = …` agrega `const comparacion = useLectura<RespuestaKpis>(\`/api/bi/kpis?${qs}\`);`
- Pasa a `<Bloques …>` la prop `comparacion={estadoComparacion(comparacion.datos, !!comparacion.error)}` y en `alActualizar` agrega `void comparacion.recargar();`.
- En `Bloques`, recibe `comparacion: EstadoComparacion` y renderiza `<NumerosClave n={b.numeros} comparacion={comparacion} />`.

`tests/portal/vista/bi.tsx`: en el `window.fetch` simulado, antes de la línea de `/api/bi/tablero`, agrega
`if (url.includes('/api/bi/kpis')) return json({ periodo: { desde: '2026-10-29', hasta: '2026-11-11' }, horaCorte: 11, kpis: { venta_cent: Math.round(respuestaTablero().tablero!.kpis.venta_cent * 0.94), venta_bruta_cent: 0, tickets: Math.round(respuestaTablero().tablero!.kpis.tickets * 1.03), lineas: respuestaTablero().tablero!.kpis.lineas, unidades: respuestaTablero().tablero!.kpis.unidades }, cargas: { esperados: 1, con_carga: 1, incompletos: 0 } });`
(ajusta los nombres si `respuestaTablero` devuelve otra forma; el objetivo es que la vista muestre un ▲ y un ▼).

- [ ] **Step 5: Run tests**

Run: `npx vitest run tests/portal/bi-bloques.test.ts tests/portal/bi-tablero-ui.test.tsx && npx tsc --noEmit`
Expected: PASS. Si la prueba existente «pide el tablero…» falla porque compara la lista exacta de URLs, sigue siendo `arrayContaining` y debe pasar; no la cambies salvo para el texto que ya no exista.

- [ ] **Step 6: Commit**

```bash
git add lib/bi/bloques.ts components/bi/bloques-resumen.tsx components/bi/tablero-mexico.tsx app/globals.css tests/portal/bi-bloques.test.ts tests/portal/bi-tablero-ui.test.tsx tests/portal/vista/bi.tsx
git commit -m "BI estilo Metabase: KPI con cambio contra el periodo anterior"
```

---

### Task 5: `TarjetaBi` y `TablaBi` (tabla ordenable con «Ver todas»)

**Files:**
- Create: `components/bi/tarjeta-bi.tsx`, `components/bi/tabla-bi.tsx`
- Test: `tests/portal/bi-tabla-ui.test.tsx`

**Interfaces:**
- Produces:
  ```ts
  // tarjeta-bi.tsx
  export const ANCHO: Record<4 | 6 | 8 | 12, string>;
  export function TarjetaBi(props: { titulo: string; descripcion?: React.ReactNode; acciones?: React.ReactNode;
    ancho: 4 | 6 | 8 | 12; cuerpo?: boolean; children: React.ReactNode }): JSX.Element;
  // tabla-bi.tsx
  export interface ColumnaBi<F> { clave: string; titulo: string; numero?: boolean;
    orden?: (f: F) => number | null; celda: (f: F) => React.ReactNode; }
  export interface SeccionBi<F> { clave: string; cabecera?: React.ReactNode /* <tr> de subtotal */; filas: F[] }
  export function TablaBi<F>(props: { resumen: string; columnas: ColumnaBi<F>[]; secciones: SeccionBi<F>[];
    claveFila: (f: F) => string; ordenInicial: string; primeras: number; minimo?: string }): JSX.Element;
  export function BarraEnCelda(props: { valor: number | null; max: number; children: React.ReactNode }): JSX.Element;
  ```
  - `primeras` es **por sección**: la tabla agrupada usa `primeras={5}` (5 por grupo), las demás `primeras={10}`.
  - Ordenar aplica dentro de cada sección; la `cabecera` de la sección queda siempre arriba de sus filas.

- [ ] **Step 1: Failing test**

```tsx
// tests/portal/bi-tabla-ui.test.tsx
import { describe, expect, it } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { TablaBi, type ColumnaBi } from '@/components/bi/tabla-bi';

type F = { n: string; v: number; t: number };
const col: ColumnaBi<F>[] = [
  { clave: 'n', titulo: 'Tienda', celda: (f) => f.n },
  { clave: 'v', titulo: 'Venta', numero: true, orden: (f) => f.v, celda: (f) => String(f.v) },
  { clave: 't', titulo: 'Tickets', numero: true, orden: (f) => f.t, celda: (f) => String(f.t) },
];
const filas = (pre: string, k: number) => Array.from({ length: k }, (_, i) => ({ n: `${pre}${i}`, v: (i + 1) * 10, t: k - i }));
const nombres = () => screen.getAllByRole('row').slice(1).map((r) => r.textContent);

describe('<TablaBi>', () => {
  it('ordena por la columna inicial (mayor a menor) y alterna con clic, con aria-sort', () => {
    render(<TablaBi resumen="x" columnas={col} secciones={[{ clave: 'a', filas: filas('T', 3) }]} claveFila={(f) => f.n} ordenInicial="v" primeras={10} />);
    expect(nombres()).toEqual(['T2', 'T1', 'T0'].map((p) => expect.stringContaining(p))); // venta 30, 20, 10
    const venta = screen.getByRole('columnheader', { name: /Venta/ });
    expect(venta.getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(within(venta).getByRole('button'));
    expect(venta.getAttribute('aria-sort')).toBe('ascending');
    expect(nombres()[0]).toContain('T0');
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Tickets/ })).getByRole('button'));
    expect(nombres()[0]).toContain('T0'); // tickets: T0 tiene 3, el mayor
  });

  it('muestra las primeras N por sección y «Ver todas (N)» despliega el resto', () => {
    render(<TablaBi resumen="x" columnas={col} secciones={[{ clave: 'a', filas: filas('T', 14) }]} claveFila={(f) => f.n} ordenInicial="v" primeras={10} />);
    expect(screen.getAllByRole('row')).toHaveLength(11);
    fireEvent.click(screen.getByRole('button', { name: 'Ver todas (14)' }));
    expect(screen.getAllByRole('row')).toHaveLength(15);
    fireEvent.click(screen.getByRole('button', { name: 'Ver menos' }));
    expect(screen.getAllByRole('row')).toHaveLength(11);
  });

  it('tabla agrupada: subtotal arriba de cada grupo, orden dentro del grupo y límite por grupo', () => {
    const cab = (t: string) => <tr><th scope="rowgroup">{t}</th><td /><td /></tr>;
    render(
      <TablaBi resumen="x" columnas={col} claveFila={(f) => f.n} ordenInicial="v" primeras={5}
        secciones={[{ clave: 'p', cabecera: cab('Propias'), filas: filas('P', 7) }, { clave: 'f', cabecera: cab('Franquicia'), filas: filas('F', 7) }]} />,
    );
    const textos = nombres();
    expect(textos).toHaveLength(12); // 2 subtotales + 5 + 5
    expect(textos[0]).toBe('Propias');
    expect(textos[6]).toBe('Franquicia');
    expect(textos[1]).toContain('P6'); // la mayor venta del grupo
    fireEvent.click(within(screen.getByRole('columnheader', { name: /Venta/ })).getByRole('button'));
    const despues = nombres();
    expect(despues[0]).toBe('Propias');
    expect(despues[1]).toContain('P0');
    expect(despues[6]).toBe('Franquicia');
    expect(screen.getByRole('button', { name: 'Ver todas (14)' })).toBeTruthy();
  });
});
```

Run: `npx vitest run tests/portal/bi-tabla-ui.test.tsx` → FAIL.

- [ ] **Step 2: Implementation**

```tsx
// components/bi/tarjeta-bi.tsx
// Tarjeta del mosaico BI (estilo Metabase): título chico, descripción de una línea y acciones a la derecha.
import { cn } from 'cn';

/** Columnas que ocupa la tarjeta en la cuadrícula de 12 (escritorio); en tableta 8 y 12 van a lo ancho. */
export const ANCHO = {
  4: 'lg:col-span-4',
  6: 'lg:col-span-6',
  8: 'sm:col-span-2 lg:col-span-8',
  12: 'sm:col-span-2 lg:col-span-12',
} as const;

export function TarjetaBi({
  titulo,
  descripcion,
  acciones,
  ancho,
  cuerpo = true,
  children,
}: {
  titulo: string;
  descripcion?: React.ReactNode;
  acciones?: React.ReactNode;
  ancho: keyof typeof ANCHO;
  cuerpo?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section
      aria-label={titulo}
      className={cn('flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-card', ANCHO[ancho])}
    >
      <header className="flex flex-wrap items-start justify-between gap-2 px-4 pt-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-ink">{titulo}</h2>
          {descripcion && <p className="mt-0.5 text-xs text-muted-foreground">{descripcion}</p>}
        </div>
        {acciones}
      </header>
      <div className={cuerpo ? 'min-w-0 flex-1 p-4' : 'min-w-0 flex-1 pt-3'}>{children}</div>
    </section>
  );
}
```

```tsx
// components/bi/tabla-bi.tsx
'use client';
// Tabla del mosaico BI: columnas ordenables, secciones (grupo con subtotal) y «Ver todas» con scroll interno.
import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { AZUL } from '@/components/sucursales/colores';

export interface ColumnaBi<F> {
  clave: string;
  titulo: string;
  numero?: boolean;
  /** Si está, la columna se puede ordenar por este valor (null va al final). */
  orden?: (f: F) => number | null;
  celda: (f: F) => React.ReactNode;
}
export interface SeccionBi<F> {
  clave: string;
  /** Fila de subtotal (un <tr>) que queda siempre arriba de las filas de la sección. */
  cabecera?: React.ReactNode;
  filas: F[];
}

export function TablaBi<F>({
  resumen,
  columnas,
  secciones,
  claveFila,
  ordenInicial,
  primeras,
  minimo = 'min-w-[36rem]',
}: {
  resumen: string;
  columnas: ColumnaBi<F>[];
  secciones: SeccionBi<F>[];
  claveFila: (f: F) => string;
  ordenInicial: string;
  /** Filas visibles por sección antes de «Ver todas». */
  primeras: number;
  minimo?: string;
}) {
  const [orden, setOrden] = useState<{ clave: string; desc: boolean }>({ clave: ordenInicial, desc: true });
  const [todas, setTodas] = useState(false);
  const col = columnas.find((c) => c.clave === orden.clave && c.orden);
  const ordenar = (filas: F[]) => {
    if (!col?.orden) return filas;
    const v = col.orden;
    return [...filas].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x === null) return 1;
      if (y === null) return -1;
      return orden.desc ? y - x : x - y;
    });
  };
  const total = secciones.reduce((s, x) => s + x.filas.length, 0);
  const hayMas = secciones.some((s) => s.filas.length > primeras);

  return (
    <div>
      <div className={todas ? 'max-h-[600px] overflow-auto' : 'overflow-x-auto'}>
        <table className={`tabla tabla-bi tabla-bi-compacta ${minimo}`}>
          <caption className="sr-only">{resumen}</caption>
          <thead className="sticky top-0 z-[1]">
            <tr>
              {columnas.map((c) => {
                const activa = orden.clave === c.clave;
                return (
                  <th
                    key={c.clave}
                    scope="col"
                    className={c.numero ? 'numero' : undefined}
                    aria-sort={c.orden ? (activa ? (orden.desc ? 'descending' : 'ascending') : 'none') : undefined}
                  >
                    {c.orden ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-inherit"
                        onClick={() => setOrden(activa ? { clave: c.clave, desc: !orden.desc } : { clave: c.clave, desc: true })}
                      >
                        {c.titulo}
                        {activa &&
                          (orden.desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {secciones.map((s) => {
              const filas = ordenar(s.filas);
              return (
                <Fragment key={s.clave}>
                  {s.cabecera}
                  {(todas ? filas : filas.slice(0, primeras)).map((f) => (
                    <tr key={claveFila(f)}>
                      {columnas.map((c, i) =>
                        i === 0 ? (
                          <th key={c.clave} scope="row" className="font-medium">
                            {c.celda(f)}
                          </th>
                        ) : (
                          <td key={c.clave} className={c.numero ? 'numero' : undefined}>
                            {c.celda(f)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {hayMas && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold"
          >
            {todas ? 'Ver menos' : `Ver todas (${total})`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Barra tenue detrás de un número (estilo Metabase): proporcional al máximo de la columna. */
export function BarraEnCelda({ valor, max, children }: { valor: number | null; max: number; children: React.ReactNode }) {
  const pct = max > 0 && valor ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span className="relative block">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 rounded-sm opacity-20"
        style={{ width: `${pct}%`, backgroundColor: AZUL.fuerte }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}
```

En `app/globals.css`, junto a `.tabla-bi`, agrega:

```css
  .tabla-bi-compacta th,
  .tabla-bi-compacta td {
    padding-block: 0.5rem;
  }
  .tabla-bi-compacta thead th {
    background: var(--color-surface);
  }
```

- [ ] **Step 3: Run**

Run: `npx vitest run tests/portal/bi-tabla-ui.test.tsx && npx tsc --noEmit` → PASS.

- [ ] **Step 4: Commit**

```bash
git add components/bi/tarjeta-bi.tsx components/bi/tabla-bi.tsx app/globals.css tests/portal/bi-tabla-ui.test.tsx
git commit -m "BI estilo Metabase: tarjeta del mosaico y tabla ordenable con «Ver todas»"
```

---

### Task 6: Mosaico — una gráfica o tabla por tarjeta

**Files:**
- Modify: `components/bi/tablero-mexico.tsx`, `components/bi/bloques-resumen.tsx` (`ContraMeta`, `Mezcla`), `components/bi/bloques-tiendas.tsx`, `components/bi/bloques-tiempo.tsx`, `components/bi/bloques-productos.tsx`
- Test: `tests/portal/bi-tablero-ui.test.tsx`

**Interfaces:**
- Consumes: `TarjetaBi`, `ANCHO`, `TablaBi`, `ColumnaBi`, `SeccionBi`, `BarraEnCelda` (Task 5); `NumerosClave` (Task 4).
- Produces (componentes; cada uno devuelve una o varias `TarjetaBi` como hermanos en un fragmento, nunca una tarjeta que envuelva a otras):
  - `bloques-resumen.tsx`: `ContraMeta` → `TarjetaBi ancho={4}`; `Mezcla` → 3 tarjetas: «Comida, Bebida, Combo y Merch» (4), «Bebidas con café y sin café» (4), «Categoría Master Franchise MX» (6).
  - `bloques-tiempo.tsx`: `TiempoYPago` se divide en `VentasPorDia` (8), `MetodoPago` (4), `VentaDiaSemana` (6), `VentaPorHora` (6), `PagoPorTienda` (12, con `TablaBi`). Mismas props de datos que hoy recibe cada sección.
  - `bloques-tiendas.tsx`: `KpiVentaTiendas` → `TarjetaBi ancho={8}` con `TablaBi` agrupada (`primeras={5}`); `Promociones` → `TarjetaBi ancho={4}` con los dos indicadores; nueva `PromocionesPorTienda` → `TarjetaBi ancho={12}` con `TablaBi` (`primeras={10}`).
  - `bloques-productos.tsx`: `RankingProductos` → `TarjetaBi ancho={6}` con `TablaBi` (`primeras={10}`; `PRIMEROS` pasa a 10); `Tendencias` → dos tarjetas «Ventas por año» (6) y «Ventas por semana» (6); en carga/error/vacío, una sola `TarjetaBi ancho={12}` titulada «Tendencias» con el estado.

- [ ] **Step 1: Ajusta las pruebas a lo nuevo (fallan primero)**

En `tests/portal/bi-tablero-ui.test.tsx`, en «pinta gráficas, ranking (20 y «Ver todos») y tendencias por año»:
- Renómbrala a «pinta gráficas, ranking (10 y «Ver todas») y tendencias por año».
- Cambia las expectativas de 20 filas por 10 y el botón a `screen.getByRole('button', { name: /Ver todas \(\d+\)/ })` dentro de la tarjeta «Ranking de Productos» (`within(screen.getByRole('region', { name: 'Ranking de Productos' }))`).
- Agrega:

```ts
it('cada gráfica y tabla es su propia tarjeta del mosaico', async () => {
  // usa el mismo tablero con datos de esta describe
  render(<TableroMexico />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Ventas vs transacciones por día' })).toBeTruthy());
  for (const t of ['Contra meta y punto de equilibrio', 'Comida, Bebida, Combo y Merch', 'Bebidas con café y sin café',
    'Método de pago', 'Categoría Master Franchise MX', 'Ranking de Productos', 'Venta por día de la semana',
    'Venta por hora', 'Venta por tienda agrupada por tipo', 'Promociones', 'Promociones por tienda',
    'Método de pago por tienda', 'Ventas por año', 'Ventas por semana'])
    expect(screen.getByRole('region', { name: t })).toBeTruthy();
  // los encabezados grandes de sección ya no existen
  expect(screen.queryByRole('heading', { name: 'Tiempo y pago' })).toBeNull();
  expect(screen.queryByRole('heading', { name: 'Mezcla de venta' })).toBeNull();
});
```

Run: `npx vitest run tests/portal/bi-tablero-ui.test.tsx` → FAIL.

- [ ] **Step 2: Contenedor del mosaico**

En `tablero-mexico.tsx`, `TableroMexico` envuelve todo lo que va debajo de `<FiltrosBi>` en:

```tsx
<div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-12">
  {/* estados de carga, error y vacío: <div className="sm:col-span-2 lg:col-span-12">…</div> */}
  {/* <Bloques …/> devuelve un fragmento de tarjetas */}
  <Tendencias … />
</div>
```

En `Bloques`, la franja de frescura/avisos y `<NumerosClave>` van envueltos en `<div className="space-y-4 sm:col-span-2 lg:col-span-12">…</div>`; después, en este orden (el del spec §1):

```tsx
<VentasPorDia porFecha={t.por_fecha} />
<ContraMeta datos={b.metas} filtrosLinea={filtrosLinea} />
<Mezcla grupos={b.grupos} cafe={b.cafe} master={b.master} />   {/* Comida…(4) y Café (4) */}
<MetodoPago porPago={b.pago} />                                {/* 4 */}
{/* Categoría Master (6) la devuelve Mezcla al final; si Mezcla devuelve las tres juntas, ponla aquí aparte:
    exporta CategoriaMaster desde bloques-resumen y colócala antes de RankingProductos */}
<RankingProductos meses={b.ranking} />                         {/* 6 */}
<VentaDiaSemana porDia={t.por_dia} />                          {/* 6 */}
<VentaPorHora porHora={t.por_hora} />                          {/* 6 */}
<KpiVentaTiendas grupos={b.kpi} comparar={filtrosLinea.length === 0} />  {/* 8 */}
<Promociones datos={b.promos} />                               {/* 4 */}
<PagoPorTienda porPago={b.pago} pagoTienda={b.pagoTienda} />  {/* 12 */}
<PromocionesPorTienda datos={b.promos} />                      {/* 12 */}
```

Para respetar ese orden, exporta de `bloques-resumen.tsx` tres componentes separados (`MezclaGrupos`, `MezclaCafe`, `CategoriaMaster`) en lugar de `Mezcla`, y colócalos: `MezclaGrupos`, `MezclaCafe`, `MetodoPago` en la fila 3; `CategoriaMaster`, `RankingProductos` en la fila 4. Cada uno conserva exactamente el contenido de su sección actual (`BarraApilada` / `BarrasShare`) dentro de `TarjetaBi`, sin el `<h3>` propio (el título ya es el de la tarjeta; quita el `titulo` duplicado de `BarraApilada` pasando el que pida su API, o deja el título de la tarjeta como único título visible).

- [ ] **Step 3: Tablas con `TablaBi`**

- **Venta por tienda agrupada por tipo** (`KpiVentaTiendas`): `secciones = grupos.map((g) => ({ clave: g.tipo, cabecera: <tr className="bg-surface-2/60 font-semibold">…subtotal actual…</tr>, filas: g.tiendas }))`; columnas Tienda, Venta (`orden: t => t.ventaCent`), Tickets, Ticket prom., Share (`celda` con `BarraEnCelda` sobre `share` y `max = maxShare`), Meta, Vs meta (con `CeldasMeta` actual, que ya pinta verde/rojo/«—»). `ordenInicial="venta"`, `primeras={5}`. La primera columna (`Tienda`) se pinta como `<th scope="row">` por `TablaBi`; quita el `pl-7` o mantenlo dentro de `celda`.
- **Promociones por tienda**: columnas Tienda + por promoción «<corto> · share» (orden por share) y «<corto> · unidades» (orden por unidades). `ordenInicial` = share de la primera promoción; `primeras={10}`.
- **Método de pago por tienda**: columnas Tienda, Venta (orden), Mezcla (barra apilada actual, sin orden), una por etiqueta de pago (orden por su share). `ordenInicial="venta"`, `primeras={10}`, `minimo` = `min-w-[${20 + pagos.length * 7}rem]` como estilo inline (pasa `minimo=""` y envuelve con el `style` actual si Tailwind no genera la clase dinámica).
- **Ranking de productos**: columnas #, Producto (sin la barra debajo del nombre), Venta (`BarraEnCelda` con `max` = venta mayor del mes, orden), Share (orden), Unidades (orden). El # es la posición por venta (calcúlala antes de ordenar: `productos.map((p, i) => ({ ...p, rango: i + 1 }))`). `primeras={10}`; el selector de mes sigue en `acciones`. Elimina el botón propio «Ver todos» (lo da `TablaBi`).

- [ ] **Step 4: Run**

Run: `npx vitest run tests/portal/bi-tablero-ui.test.tsx tests/portal/bi-tabla-ui.test.tsx && npx tsc --noEmit`
Expected: PASS. Revisa también `npx vitest run tests/portal` completo: las pruebas de Sucursales no deben cambiar.

- [ ] **Step 5: Commit**

```bash
git add components/bi tests/portal/bi-tablero-ui.test.tsx
git commit -m "BI estilo Metabase: mosaico con una gráfica o tabla por tarjeta y tablas ordenables"
```

---

### Task 7: Filtros en píldoras

**Files:**
- Create: `components/bi/pildora-filtro.tsx`
- Modify: `components/bi/selector-multiple.tsx` (pasa a exportar `ListaMultiple`, solo el contenido), `components/bi/filtros.tsx`
- Test: `tests/portal/bi-filtros-ui.test.tsx` (se reescribe)

**Interfaces:**
- Produces:
  ```ts
  export function Pildora(props: {
    etiqueta: string;            // nombre del filtro (aria y título del recuadro)
    texto: string;               // lo que se ve: «Comparable», «Comparable: No Comparable», «Esta semana»
    activa: boolean;             // rellena
    alQuitar?: () => void;       // ✕ (solo si activa)
    quitarEtiqueta?: string;     // aria-label de la ✕, p. ej. «Quitar Nombre de Tienda: Ventura»
    children: (cerrar: () => void) => React.ReactNode; // contenido del recuadro
  }): JSX.Element;
  export function ListaMultiple(props: { etiqueta: string; valores: string[]; elegidos: string[];
    alCambiar: (e: string[]) => void; buscar?: boolean; nombres?: Record<string, string> }): JSX.Element;
  ```
- `FiltrosBi` conserva su firma `({ filtros, opciones, alCambiar })`.

Rulings ya tomados para esta tarea (del spec §3):
- Rango de Fechas y Net Amount usan **«Aplicar»** dentro del recuadro; desaparecen el retraso de 400 ms y el «monto pendiente». Los borradores viven en el estado de `FiltrosBi` y se alinean con la URL como hoy (`sincronizarBorradores`); cerrar el recuadro sin aplicar conserva el borrador hasta que la URL cambie.
- Las listas múltiples se aplican al marcar cada casilla (como hoy).
- Las etiquetas de los filtros son las de Zoho (las mismas que hoy).

- [ ] **Step 1: Reescribe las pruebas (fallan primero)**

Sustituye el contenido de `tests/portal/bi-filtros-ui.test.tsx` por pruebas que cubran, con los mismos `opciones` y `base()` de hoy:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { FiltrosBi } from '@/components/bi/filtros';
import { leerUrl } from '@/lib/bi/url';
import type { RpcOpciones } from '@/lib/bi/tipos';

const opciones = {
  tiendas: [{ company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' }],
  franquiciatarios: [], tipos: ['Sucursales Propias'], categorias: ['Fraps'], grupos: ['Bebida'], productos: ['Iced Latte'],
  pagos: ['APP - WALLET'], semanas: ['W45 2026'], ultimo_corte: null, tiendas_sin_rappi: 0,
} as RpcOpciones;
const url = (q = '') => leerUrl(new URLSearchParams(q));
const pildora = (nombre: RegExp | string) => screen.getByRole('button', { name: nombre });
const pintar = (q = '', alCambiar = vi.fn()) => {
  render(<FiltrosBi filtros={url(q)} opciones={opciones} alCambiar={alCambiar} />);
  return alCambiar;
};

describe('<FiltrosBi> en píldoras', () => {
  it('5 píldoras visibles y «Más filtros» despliega las 12 restantes', () => {
    pintar();
    for (const n of [/^Esta semana/, /^Comparable/, /^Años Operando/, /^Rango de Fechas/, /^Día de la Semana/]) expect(pildora(n)).toBeTruthy();
    expect(screen.queryByRole('button', { name: /^Nombre de Tienda/ })).toBeNull();
    const mas = pildora(/^Más filtros/);
    expect(mas.getAttribute('aria-expanded')).toBe('false');
    fireEvent.click(mas);
    for (const n of ['Nombre de Tienda', 'Franquiciatario', 'Franquicia o Sucursales Propias', 'Categoría Master Franchise MX',
      'Comida, Bebida, Combo y Merch', 'Contiene Café', 'Product', 'Método de Pago', 'Hora', 'Estatus de Maduración',
      'Net Amount (Local)', 'Semanas y año'])
      expect(pildora(new RegExp(`^${n.replace(/[()]/g, '\\$&')}`))).toBeTruthy();
  });

  it('«Más filtros» cuenta los activos escondidos aunque esté cerrado', () => {
    pintar('cafe=si&tiendas=384');
    expect(pildora(/^Más filtros · 2 activos/)).toBeTruthy();
  });

  it('Fecha Relativa: 15 opciones, aplica al elegir y limpia el rango', () => {
    const alCambiar = pintar('desde=2026-10-01&hasta=2026-10-07');
    fireEvent.click(pildora(/^2026-10-01 – 2026-10-07|^Fecha Relativa/));
    const dialogo = screen.getByRole('dialog', { name: 'Fecha Relativa' });
    expect(within(dialogo).getAllByRole('option')).toHaveLength(15);
    fireEvent.click(within(dialogo).getByRole('option', { name: 'Mes anterior' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: 'mes-anterior', desde: undefined, hasta: undefined }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Comparable con etiquetas de Zoho', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Comparable/));
    const d = screen.getByRole('dialog', { name: 'Comparable' });
    expect(within(d).getAllByRole('option').map((o) => o.textContent)).toEqual(['Todas', 'Comparable', 'No Comparable']);
    fireEvent.click(within(d).getByRole('option', { name: 'No Comparable' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ comparable: false }));
  });

  it('píldora activa: rellena con valor y ✕ que lo quita', () => {
    const alCambiar = pintar('tiendas=384&cafe=si');
    fireEvent.click(pildora(/^Más filtros/));
    expect(pildora(/^Nombre de Tienda: Ventura/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Nombre de Tienda: Ventura' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ companias: [], cafe: ['Sí'] }));
  });

  it('varios valores se resumen: «Día de la Semana: 2»', () => {
    pintar('dias=0,1');
    expect(pildora(/^Día de la Semana: 2/)).toBeTruthy();
  });

  it('lista múltiple: casillas, búsqueda, Escape cierra y regresa el foco a la píldora', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Más filtros/));
    const p = pildora(/^Product/);
    fireEvent.click(p);
    expect(p.getAttribute('aria-expanded')).toBe('true');
    const d = screen.getByRole('dialog', { name: 'Product' });
    fireEvent.click(within(d).getByLabelText('Iced Latte'));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ productos: ['Iced Latte'] }));
    fireEvent.keyDown(within(d).getByRole('searchbox'), { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(p);
  });

  it('clic fuera cierra el recuadro', () => {
    pintar();
    fireEvent.click(pildora(/^Comparable/));
    fireEvent.mouseDown(document.body);
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('Rango de Fechas: Aplicar valida; error dentro del recuadro; correcto aplica y quita la relativa', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Rango de Fechas/));
    const d = screen.getByRole('dialog', { name: 'Rango de Fechas' });
    fireEvent.change(within(d).getByLabelText('Desde'), { target: { value: '2026-10-10' } });
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).not.toHaveBeenCalled();
    expect(within(d).getByRole('alert').textContent).toMatch(/periodo no es válido/i);
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-12' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: undefined, desde: '2026-10-10', hasta: '2026-10-12' }));
  });

  it('más de 1,100 días: mensaje y no aplica', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Rango de Fechas/));
    const d = screen.getByRole('dialog', { name: 'Rango de Fechas' });
    fireEvent.change(within(d).getByLabelText('Desde'), { target: { value: '2023-01-01' } });
    fireEvent.change(within(d).getByLabelText('Hasta'), { target: { value: '2026-10-01' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).not.toHaveBeenCalled();
    expect(within(d).getByRole('alert').textContent).toMatch(/1,100 días/);
  });

  it('Net Amount: Aplicar con mínimo y máximo; la píldora lo resume', () => {
    const alCambiar = pintar();
    fireEvent.click(pildora(/^Más filtros/));
    fireEvent.click(pildora(/^Net Amount \(Local\)/));
    const d = screen.getByRole('dialog', { name: 'Net Amount (Local)' });
    const min = within(d).getByLabelText('Net Amount mínimo');
    expect(min.getAttribute('min')).toBe('0');
    expect(min.getAttribute('step')).toBe('0.01');
    fireEvent.change(min, { target: { value: '10' } });
    fireEvent.change(within(d).getByLabelText('Net Amount máximo'), { target: { value: '250.5' } });
    fireEvent.click(within(d).getByRole('button', { name: 'Aplicar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ montoMin: 10, montoMax: 250.5 }));
  });

  it('Limpiar solo aparece con algo activo y regresa a Esta semana', () => {
    pintar();
    expect(screen.queryByRole('button', { name: 'Limpiar' })).toBeNull();
    document.body.innerHTML = '';
    const alCambiar = pintar('cafe=si&fr=mes-anterior');
    fireEvent.click(pildora('Limpiar'));
    expect(alCambiar).toHaveBeenLastCalledWith(url());
  });

  it('ya no hay fila de chips', () => {
    pintar('cafe=si');
    expect(screen.queryByRole('list', { name: 'Filtros activos' })).toBeNull();
  });
});
```

Run: `npx vitest run tests/portal/bi-filtros-ui.test.tsx` → FAIL.

- [ ] **Step 2: `Pildora`**

```tsx
// components/bi/pildora-filtro.tsx
'use client';
// Píldora de filtro estilo Metabase: botón compacto que abre un recuadro flotante; rellena si el filtro está activo.
import { useEffect, useRef, useState } from 'react';
import { cn } from 'cn';

export function Pildora({
  etiqueta,
  texto,
  activa,
  alQuitar,
  quitarEtiqueta,
  children,
}: {
  etiqueta: string;
  texto: string;
  activa: boolean;
  alQuitar?: () => void;
  quitarEtiqueta?: string;
  children: (cerrar: () => void) => React.ReactNode;
}) {
  const [abierta, setAbierta] = useState(false);
  const raiz = useRef<HTMLDivElement>(null);
  const boton = useRef<HTMLButtonElement>(null);
  const recuadro = useRef<HTMLDivElement>(null);
  const cerrar = (regresarFoco = true) => {
    setAbierta(false);
    if (regresarFoco) boton.current?.focus();
  };

  useEffect(() => {
    if (!abierta) return;
    recuadro.current?.querySelector<HTMLElement>('input, button, [role="option"], select')?.focus();
    const fuera = (e: MouseEvent) => {
      if (raiz.current && !raiz.current.contains(e.target as Node)) setAbierta(false);
    };
    document.addEventListener('mousedown', fuera);
    return () => document.removeEventListener('mousedown', fuera);
  }, [abierta]);

  return (
    <div
      ref={raiz}
      className="relative"
      onKeyDown={(e) => {
        if (abierta && e.key === 'Escape') {
          e.stopPropagation();
          cerrar();
        }
      }}
    >
      <div
        className={cn(
          'inline-flex max-w-[18rem] items-center rounded-full border text-sm',
          activa ? 'border-ink bg-ink text-surface' : 'border-line bg-surface text-ink',
        )}
      >
        <button
          ref={boton}
          type="button"
          aria-haspopup="dialog"
          aria-expanded={abierta}
          onClick={() => setAbierta((v) => !v)}
          className="inline-flex min-w-0 items-center gap-1 py-1.5 pr-2 pl-3 font-medium"
        >
          <span className="truncate">{texto}</span>
          <span aria-hidden="true" className="opacity-70">▾</span>
        </button>
        {activa && alQuitar && (
          <button
            type="button"
            aria-label={quitarEtiqueta ?? `Quitar ${etiqueta}`}
            onClick={alQuitar}
            className="py-1.5 pr-3 pl-1 font-bold opacity-80 hover:opacity-100"
          >
            <span aria-hidden="true">✕</span>
          </button>
        )}
      </div>
      {abierta && (
        <div
          ref={recuadro}
          role="dialog"
          aria-label={etiqueta}
          className="absolute left-0 z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] rounded-xl border border-line-strong bg-surface p-3 text-ink shadow-lg"
        >
          {children(() => cerrar())}
        </div>
      )}
    </div>
  );
}

/** Lista de opción única dentro de un recuadro (Fecha Relativa, Comparable). */
export function ListaUnica({
  opciones,
  valor,
  alElegir,
}: {
  opciones: { valor: string; texto: string }[];
  valor: string;
  alElegir: (v: string) => void;
}) {
  return (
    <ul role="listbox" className="max-h-72 overflow-auto">
      {opciones.map((o) => (
        <li
          key={o.valor}
          role="option"
          aria-selected={o.valor === valor}
          tabIndex={0}
          onClick={() => alElegir(o.valor)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              alElegir(o.valor);
            }
          }}
          className={cn(
            'cursor-pointer rounded px-2 py-1.5 text-sm hover:bg-surface-2',
            o.valor === valor && 'font-semibold',
          )}
        >
          {o.texto}
        </li>
      ))}
    </ul>
  );
}
```

- [ ] **Step 3: `ListaMultiple`**

Reemplaza `components/bi/selector-multiple.tsx` por `ListaMultiple` (el contenido del panel actual, sin botón ni estado de apertura):

```tsx
'use client';
// Contenido de una píldora de varias opciones: búsqueda opcional y casillas (se aplica al marcar).
import { useState } from 'react';

export function ListaMultiple({
  etiqueta,
  valores,
  elegidos,
  alCambiar,
  buscar,
  nombres,
}: {
  etiqueta: string;
  valores: string[];
  elegidos: string[];
  alCambiar: (elegidos: string[]) => void;
  buscar?: boolean;
  nombres?: Record<string, string>;
}) {
  const [consulta, setConsulta] = useState('');
  const nombre = (v: string) => nombres?.[v] ?? v;
  const q = consulta.trim().toLowerCase();
  const visibles = q ? valores.filter((v) => nombre(v).toLowerCase().includes(q)) : valores;
  const alternar = (v: string) =>
    alCambiar(elegidos.includes(v) ? elegidos.filter((x) => x !== v) : [...elegidos, v]);
  return (
    <div role="group" aria-label={etiqueta} className="max-h-72 overflow-auto">
      {buscar && (
        <input
          type="search"
          aria-label={`Buscar en ${etiqueta}`}
          value={consulta}
          onChange={(e) => setConsulta(e.target.value)}
          className="mb-2 w-full rounded-md border border-line px-2 py-1.5 text-sm"
        />
      )}
      {visibles.length === 0 && <p className="px-1 py-1 text-sm text-muted-foreground">Sin opciones</p>}
      {visibles.map((v) => (
        <label key={v} className="flex cursor-pointer items-center gap-2 rounded px-1 py-1 text-sm hover:bg-surface-2">
          <input type="checkbox" checked={elegidos.includes(v)} onChange={() => alternar(v)} />
          <span className="min-w-0 break-words">{nombre(v)}</span>
        </label>
      ))}
    </div>
  );
}
```

Como la prueba de Escape usa `getByRole('searchbox')` en «Product», esa lista lleva `buscar` (como hoy).

- [ ] **Step 4: Reescribe el render de `FiltrosBi`**

En `components/bi/filtros.tsx`:
- Quita `RETRASO_MS`, `temporizador`, `pendiente`, `aplicarConRetraso`, `cancelarPendiente` (y su uso en Limpiar), `CampoSelect`, `SelectorMultiple` y la fila de chips.
- Conserva constantes, `tiendas`, `num`, `sincronizarBorradores`, el arreglo `chips` (ahora solo para calcular estado: no se pinta).
- `aplicar(cambio)` queda: `const siguiente = { ...filtros, ...cambio }; sincronizarBorradores(siguiente); alCambiar(siguiente);`.
- Agrega estos ayudantes:

```tsx
/** Texto de una píldora de lista: «Etiqueta», «Etiqueta: Ventura» o «Etiqueta: 3». */
const textoLista = (etiqueta: string, valores: (string | number)[], nombre: (v: string) => string) =>
  valores.length === 0 ? etiqueta : valores.length === 1 ? `${etiqueta}: ${nombre(String(valores[0]))}` : `${etiqueta}: ${valores.length}`;
```

- Define la lista de filtros de lista una sola vez y úsala para pintar y para contar activos:

```tsx
type FiltroLista = {
  id: string; etiqueta: string; valores: string[]; elegidos: string[]; nombres?: Record<string, string>;
  buscar?: boolean; poner: (v: string[]) => Partial<FiltrosUrl>; extra: boolean;
};
const listas: FiltroLista[] = [
  { id: 'anios', etiqueta: 'Años Operando', valores: ANIOS, elegidos: filtros.aniosOperando.map(String), poner: (v) => ({ aniosOperando: num(v) }), extra: false },
  { id: 'dias', etiqueta: 'Día de la Semana', valores: DIAS_SEMANA.map((d) => String(d.v)), nombres: NOMBRE_DIA, elegidos: filtros.dias.map(String), poner: (v) => ({ dias: num(v) }), extra: false },
  { id: 'tiendas', etiqueta: 'Nombre de Tienda', valores: Object.keys(tiendas), nombres: tiendas, buscar: true, elegidos: filtros.companias.map(String), poner: (v) => ({ companias: num(v) }), extra: true },
  { id: 'franq', etiqueta: 'Franquiciatario', valores: o?.franquiciatarios ?? [], buscar: true, elegidos: filtros.franquiciatarios, poner: (v) => ({ franquiciatarios: v }), extra: true },
  { id: 'tipo', etiqueta: 'Franquicia o Sucursales Propias', valores: o?.tipos ?? [], elegidos: filtros.tipos, poner: (v) => ({ tipos: v }), extra: true },
  { id: 'cat', etiqueta: 'Categoría Master Franchise MX', valores: o?.categorias ?? [], elegidos: filtros.categorias, poner: (v) => ({ categorias: v }), extra: true },
  { id: 'grupo', etiqueta: 'Comida, Bebida, Combo y Merch', valores: o?.grupos ?? [], elegidos: filtros.grupos, poner: (v) => ({ grupos: v }), extra: true },
  { id: 'cafe', etiqueta: 'Contiene Café', valores: CAFE, elegidos: filtros.cafe, poner: (v) => ({ cafe: v as ('Sí' | 'No')[] }), extra: true },
  { id: 'prod', etiqueta: 'Product', valores: o?.productos ?? [], buscar: true, elegidos: filtros.productos, poner: (v) => ({ productos: v }), extra: true },
  { id: 'pago', etiqueta: 'Método de Pago', valores: o?.pagos ?? [], elegidos: filtros.pagos, poner: (v) => ({ pagos: v }), extra: true },
  { id: 'hora', etiqueta: 'Hora', valores: HORAS, nombres: NOMBRE_HORA, elegidos: filtros.horas.map(String), poner: (v) => ({ horas: num(v) }), extra: true },
  { id: 'mad', etiqueta: 'Estatus de Maduración', valores: MADURACION, elegidos: filtros.maduracion, poner: (v) => ({ maduracion: v }), extra: true },
  { id: 'sem', etiqueta: 'Semanas y año', valores: o?.semanas ?? [], buscar: true, elegidos: filtros.semanas, poner: (v) => ({ semanas: v }), extra: true },
];
const hayMonto = filtros.montoMin !== undefined || filtros.montoMax !== undefined;
const activosExtra = listas.filter((l) => l.extra && l.elegidos.length > 0).length + (hayMonto ? 1 : 0);
const hayActivos = chips.length > 0;
```

- Pinta una lista con:

```tsx
const pildoraLista = (l: FiltroLista) => {
  const nombre = (v: string) => l.nombres?.[v] ?? v;
  const texto = textoLista(l.etiqueta, l.elegidos, nombre);
  return (
    <Pildora key={l.id} etiqueta={l.etiqueta} texto={texto} activa={l.elegidos.length > 0}
      alQuitar={() => aplicar(l.poner([]))} quitarEtiqueta={`Quitar ${texto}`}>
      {() => <ListaMultiple etiqueta={l.etiqueta} valores={l.valores} elegidos={l.elegidos} nombres={l.nombres}
        buscar={l.buscar} alCambiar={(v) => aplicar(l.poner(v))} />}
    </Pildora>
  );
};
```

- Fecha Relativa: `texto` = etiqueta de la opción actual, o `${filtros.desde} – ${filtros.hasta}` con rango; `etiqueta="Fecha Relativa"`; `activa` = rango o `fr !== FR_POR_OMISION`; `alQuitar` = `aplicar({ fr: FR_POR_OMISION, desde: undefined, hasta: undefined })`; contenido `ListaUnica` con las 15 `OPCIONES_FR` que llama `aplicar({ fr: v, desde: undefined, hasta: undefined }); cerrar();`.
- Comparable: `ListaUnica` con `''`→«Todas», `si`→«Comparable», `no`→«No Comparable»; `texto` «Comparable» o «Comparable: <opción>».
- Rango de Fechas: contenido con los dos `input type="date"` (`aria-label` «Desde» / «Hasta», ligados al borrador `rango`), el `<p role="alert">` con `errorRango` y un botón «Aplicar» que hace la validación de hoy (`resolverPeriodo(... hoyMexico(new Date()))`); si es válida, `aplicar({ fr: undefined, desde, hasta }); cerrar();`. `texto`: «Rango de Fechas» o «Rango de Fechas: <desde> – <hasta>»; `activa` con rango.
- Net Amount (Local): inputs `aria-label` «Net Amount mínimo»/«Net Amount máximo» (`type="number" min={0} step={0.01}`) ligados a `monto`; «Aplicar» lee como hoy (`leer`) y aplica `{ montoMin, montoMax }`; `texto` «Net Amount (Local)» o «Net Amount (Local): <textoMonto>».
- Estructura:

```tsx
<section aria-label="Filtros" className="z-20 rounded-2xl border border-line bg-surface px-4 py-3 lg:sticky lg:top-[65px]">
  <div className="flex flex-wrap items-center gap-2">
    {/* Fecha Relativa, Comparable, pildoraLista(anios), Rango de Fechas, pildoraLista(dias) */}
    <button type="button" aria-expanded={masFiltros} aria-controls="bi-mas-filtros" onClick={() => setMasFiltros((m) => !m)}
      className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-ink-2">
      {`Más filtros${activosExtra > 0 ? ` · ${activosExtra} activo${activosExtra > 1 ? 's' : ''}` : ''}`} ▾
    </button>
    {hayActivos && (
      <button type="button" onClick={() => { const limpio = leerUrl(new URLSearchParams()); sincronizarBorradores(limpio); setErrorRango(null); alCambiar(limpio); }}
        className="px-2 py-1.5 text-sm font-semibold text-crema-strong underline">Limpiar</button>
    )}
  </div>
  {masFiltros && (
    <div id="bi-mas-filtros" className="mt-2 flex flex-wrap gap-2">
      {/* las 11 listas extra en el orden de Zoho, con Net Amount (Local) entre «Estatus de Maduración» y «Semanas y año» */}
    </div>
  )}
</section>
```

(Nota: `Limpiar` también limpia `errorRango`, con lo que se cierra el pendiente «errorRango no se limpia con Limpiar» del F4.)

- [ ] **Step 5: Run**

Run: `npx vitest run tests/portal/bi-filtros-ui.test.tsx tests/portal/bi-tablero-ui.test.tsx && npx tsc --noEmit`
Expected: PASS. Si alguna prueba del tablero buscaba `getByLabelText('Fecha Relativa')` o chips, cámbiala a la píldora equivalente (misma intención).

- [ ] **Step 6: Commit**

```bash
git add components/bi/pildora-filtro.tsx components/bi/selector-multiple.tsx components/bi/filtros.tsx tests/portal/bi-filtros-ui.test.tsx tests/portal/bi-tablero-ui.test.tsx
git commit -m "BI estilo Metabase: filtros en píldoras con recuadro, «Más filtros» con conteo y Limpiar solo con activos"
```

---

### Task 8: Alto de gráficas, «Ver como tabla» compacto, documentación y revisión visual

**Files:**
- Modify: `components/bi/graficas-bi.tsx` (prop `alto`), `components/bi/graficas-bi-piezas.tsx` (`TablaEquivalente`), componentes de Task 6 que pasan `alto`, `docs/bi/03-TABLERO.md`
- Test: `tests/portal/bi-tablero-ui.test.tsx` (la tabla equivalente sigue accesible)

**Interfaces:**
- Produces: `ColumnasYLinea` y `Lineas` aceptan `alto?: number` (por omisión el actual: 264 / 240).

- [ ] **Step 1: Prueba**

Agrega a `tests/portal/bi-tablero-ui.test.tsx` (en la describe con datos):

```ts
it('cada gráfica conserva su tabla equivalente con nombre accesible', async () => {
  render(<TableroMexico />);
  await waitFor(() => expect(screen.getByRole('region', { name: 'Ventas vs transacciones por día' })).toBeTruthy());
  const r = screen.getByRole('region', { name: 'Ventas vs transacciones por día' });
  const resumen = within(r).getByText('Ver como tabla');
  fireEvent.click(resumen);
  expect(within(r).getByRole('table')).toBeTruthy();
});
```

Run → PASS o FAIL según el estado tras Task 6; si ya pasa, sigue (la prueba fija el comportamiento antes de restilizar).

- [ ] **Step 2: Implementación**

- `ColumnasYLinea`: cambia `const H = 264;` por `const H = alto ?? 264;` y agrega `alto?: number` a sus props. Igual en `Lineas` (`const H = alto ?? 240;`).
- Pasa `alto={260}` en las tarjetas de 8–12 columnas (Ventas vs transacciones por día) y `alto={220}` en las de 4–6 (día de la semana, hora, ventas por año, ventas por semana).
- En las tarjetas de 4–6 columnas, `anchoMinimo` queda como hoy para el celular; en escritorio `useAncho` ya ajusta el ancho (no cambiar).
- `TablaEquivalente`: el `<summary>` pasa a `className="ml-auto flex w-fit cursor-pointer list-none items-center gap-1 rounded-md px-2 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2"` con un ícono `Table2` de `lucide-react` (`size={14} aria-hidden`) antes del texto «Ver como tabla». Ruling: se queda al pie de la gráfica (alineado a la derecha) en vez de la esquina superior, para no mover el `<details>` fuera de la `<figure>`; el texto visible se conserva por accesibilidad.

- [ ] **Step 3: Documentación**

En `docs/bi/03-TABLERO.md` agrega una sección «Comparación contra el periodo anterior (migración 76)» con:
- qué periodo se compara (tabla del spec §2) y el recorte por hora del día en curso;
- cómo aplicar la 76: pegar `supabase/migrations/20261120000076_bi_kpis.sql` completo en el SQL Editor y luego
  `insert into supabase_migrations.schema_migrations (version, name) values ('20261120000076','bi_kpis');`;
- que sin la 76 aplicada el tablero funciona y los KPI dicen «Sin comparación» (la ruta responde 503 y solo esa línea lo refleja).

- [ ] **Step 4: Revisión visual**

Run: `npm run prueba:visual` (servidor en `http://127.0.0.1:4173`). Revisa `/?bi` y `/?bi&noche` en 1440×900, 768×1024 y 375×812:
- KPI en una fila en 1440, de 2 en 2 en 375; números sin desbordar.
- Mosaico según spec §1; sin scroll horizontal de la página en 375.
- Píldoras: recuadro no se sale de la pantalla en 375; activa rellena se lee en claro y noche.
- Barras en celdas visibles en noche.
Corrige lo que salga y documenta en el commit qué se ajustó.

- [ ] **Step 5: Suite completa y commit**

Run: `npx vitest run && npx tsc --noEmit`
Expected: todo en verde salvo `tests/migracion/paridad.test.ts` (ya fallaba).

```bash
git add components/bi docs/bi/03-TABLERO.md tests/portal/bi-tablero-ui.test.tsx
git commit -m "BI estilo Metabase: alto de gráficas por tarjeta, «Ver como tabla» compacto y doc de la migración 76"
```
