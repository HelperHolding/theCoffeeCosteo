# BI F4: módulo BI y tablero «The Coffee México» (plan de implementación)

> **Para agentes:** SUB-SKILL REQUERIDA: usar superpowers:subagent-driven-development (recomendado) o
> superpowers:executing-plans para implementar este plan tarea por tarea. Los pasos usan casillas (`- [ ]`).

**Objetivo:** un módulo «BI» en el portal (`/bi`) con el tablero «The Coffee México», sus 17 filtros de Zoho en la URL
y los bloques 1–8 de la spec, leyendo `bi_tablero` / `bi_tendencias`.

**Arquitectura:**
- La migración 43 agrega cinco cosas:
  - el módulo `bi`;
  - `bi_acceso`, que reemplaza a `sucursales_acceso` en el BI;
  - el mapeo de pago por fecha;
  - `por_fecha` en `bi_tablero`;
  - `bi_opciones`, que llena los filtros.
- En TypeScript van tres módulos puros y probados: `lib/bi/url.ts` (URL ↔ filtros), `lib/bi/bloques.ts` (de las RPC a
  la vista) y `lib/bi/tipos.ts` (contratos).
- Hay dos route handlers, `/api/bi/tablero` y `/api/bi/tendencias`.
- Los componentes cliente van en `components/bi/`, reusando las gráficas SVG y las piezas del portal.

**Tecnologías:** Next.js (la versión del repo; **antes de escribir código de Next lee la guía que aplique en
`node_modules/next/dist/docs/`**, según `AGENTS.md`), Supabase Postgres, PGlite + Vitest y Tailwind.

**Spec:** `docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md`. Contexto: la spec general del BI,
`docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md`.

## Restricciones globales

- **Idioma:** español en nombres, comentarios, textos de la interfaz y commits.
- **Commits:** cada commit termina con `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.
- **No tocar:**
  - no tocar `.env.local`;
  - nada de `supabase login`/`link`/`db push`;
  - nada contra la base real;
  - no hacer push ni merge.
- **Migraciones aplicadas:** las 40, 41 y 42 están en producción y **no se editan**; todo cambio de base va en
  `supabase/migrations/20261106000043_bi_tablero.sql`.
- **Funciones de la base:**
  - todas llevan `security definer set search_path = public, pg_temp`;
  - cada función nueva lleva `revoke … from public, anon` y `grant … to authenticated`, salvo las internas, que no se
    conceden.
- **Montos:** van en centavos (`*_cent`). La venta es el **neto** (`venta_cent`); lo cobrado es `venta_bruta_cent`.
- **Cálculos:** promedios y porcentajes se calculan como cociente de sumas y nunca se guardan. Los tickets salen de
  pedidos distintos.
- **Pantalla:**
  - no entra ninguna librería nueva de gráficas;
  - se reusan `components/sucursales/graficas.tsx`, `components/portal/piezas.tsx` y
    `components/sucursales/formato.ts`.
- **Verificación al cerrar cada tarea:**
  - `npx vitest run <pruebas de la tarea>` en verde;
  - `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` vacío;
  - al final, `npx vitest run` completo, donde solo puede fallar `tests/migracion/paridad.test.ts`, que ya fallaba.

## Puntos a revisar con cuidado

1. **Un usuario con módulo `sucursales` pero sin `bi`** llama `bi_tablero`: no debe ver ninguna tienda. Se prueba en la
   Tarea 1.
2. **URL con valores basura** (`tiendas=abc`, `min=-5`, `fr=inexistente`, `desde` mayor que `hasta`): el parser los
   descarta o responde 400, nunca revienta ni manda NaN a la RPC. Se prueba en las Tareas 3 y 5.
3. **Periodo sin ventas** (tickets = 0): ticket promedio, UPT y los shares salen `null` (se ven como «—»), nunca
   `NaN` ni `Infinity`. Se prueba en la Tarea 4.
4. **«Hoy» cerca de medianoche:** a las 00:30 de México todavía es el día anterior en UTC−6. `hoyMexico` usa
   `America/Mexico_City`, no UTC. Se prueba en la Tarea 3.
5. **Usuario con 0 tiendas asignadas o filtro de tiendas fuera de su acceso:** la ruta responde un vacío claro, sin
   500. Se prueba en la Tarea 5.

---

## Mapa de archivos

| Archivo | Responsabilidad |
|---|---|
| `supabase/migrations/20261106000043_bi_tablero.sql` | Módulo `bi`, `bi_acceso`, pago por fecha, `por_fecha` y `bi_opciones` |
| `tests/db/bi-acceso.test.ts` (nuevo) | Pruebas de la 43 |
| `tests/db/bi-lectura.test.ts`, `tests/db/bi-neto.test.ts`, `tests/db/bi-semillas.test.ts` | Se ajustan a `bi` y al mapeo con fechas |
| `lib/portal/modulos.ts`, `components/portal/navegacion.tsx`, `components/portal/marco.tsx` | Módulo «BI» en el portal |
| `lib/supabase/sesion.ts` | `accesoBi()` / `sesionBi()` |
| `app/(bi)/bi/layout.tsx`, `app/(bi)/bi/page.tsx`, `app/(bi)/bi/the-coffee-mexico/page.tsx` | Rutas |
| `lib/bi/tipos.ts` | Contratos: respuestas de las RPC y de las rutas |
| `lib/bi/url.ts` | URL ↔ `FiltrosBi`, opciones de Fecha Relativa, `hoyMexico`, `resolverPeriodo` |
| `lib/bi/bloques.ts` | De las RPC a la vista de cada bloque |
| `app/api/bi/tablero/route.ts`, `app/api/bi/tendencias/route.ts` | Lecturas |
| `components/bi/filtros.tsx` | Barra de filtros |
| `components/bi/tablero-mexico.tsx` | Orquestador cliente |
| `components/bi/bloques-resumen.tsx` | Bloques 1, 2 y 3 |
| `components/bi/bloques-tiendas.tsx` | Bloques 4 y 5 |
| `components/bi/bloques-tiempo.tsx` | Bloque 6 |
| `components/bi/bloques-productos.tsx` | Bloques 7 y 8 |
| `docs/bi/03-TABLERO.md` | Uso, permisos (SQL), aplicación de la 43 y medición |

---

### Tarea 1: migración 43 (acceso `bi`, pago por fecha, `por_fecha` y `bi_opciones`)

**Archivos:**
- Crear: `supabase/migrations/20261106000043_bi_tablero.sql`
- Crear: `tests/db/bi-acceso.test.ts`
- Modificar: `tests/db/bi-lectura.test.ts`, `tests/db/bi-neto.test.ts` y `tests/db/bi-semillas.test.ts`. Donde inserten
  `perfil_modulos … 'sucursales'` para leer el BI, usa `'bi'`. Donde cuenten el mapeo de pagos, ahora son 11 filas.

**Interfaces:**
- **Consume:** `bi_tiendas_filtradas`, `bi_lineas_filtradas` y `bi_tablero`, en su versión vigente de las migraciones
  40 y 42. Léelas antes de escribir.
- **Produce:**
  - `bi_acceso(integer) → boolean`;
  - `bi_opciones(jsonb) → jsonb` con las llaves
    `{tiendas:[{company_id,store_id,nombre,franquiciatario,tipo}], franquiciatarios:[text], tipos:[text], categorias:[text], grupos:[text], productos:[text], pagos:[text], semanas:[text], ultimo_corte: timestamptz|null, tiendas_sin_rappi: int}`;
  - `bi_tablero` agrega `por_fecha:[{fecha,venta_cent,tickets}]`.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/db/bi-acceso.test.ts`:

```ts
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// Migración 43: módulo bi, bi_acceso, pago por fecha, por_fecha y bi_opciones.
let db: PGlite;
let conBi: string;
let soloSucursales: string;
let inactivo: string;
type T = Record<string, any>;
const L = (pedido: string, x: Record<string, unknown> = {}) => ({
  pedido, linea: 1, hora: 9, canal: 'app', metodo_pago: 'WALLET_BALANCE', tipo_pago: 'WALLET', smartphone: true,
  opcion_consumo: null, codigo: '5IL', nombre: 'Iced Latte', unidades: 1, importe_cent: 10000, importe_neto_cent: 9700,
  descuento_cent: 0, ...x,
});
const servicio = async (sql: string, params: unknown[] = []) => {
  await db.exec('set role service_role');
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
};
const guardar = (c: number, f: string, ls: unknown[]) =>
  servicio('select public.bi_guardar_dia($1,$2,$3,true,now(),$4,false)', ['pos', c, f, JSON.stringify(ls)]);
const rpc = (user: string, fn: string, p: Record<string, unknown>) =>
  comoUsuario(db, user, async () => (await db.query<{ r: T }>(`select public.${fn}($1) r`, [JSON.stringify(p)])).rows[0].r);
const base = { desde: '2026-02-27', hasta: '2026-03-02', companias: [384] };

beforeAll(async () => {
  db = await crearDbLocal();
  conBi = await crearUsuario(db, 'sucursales');
  soloSucursales = await crearUsuario(db, 'sucursales');
  inactivo = await crearUsuario(db, 'sucursales');
  await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1,'bi','lectura'),($2,'sucursales','lectura'),($3,'bi','lectura')`,
    [conBi, soloSucursales, inactivo]);
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1,384),($2,384),($3,384)', [conBi, soloSucursales, inactivo]);
  await db.query('update perfiles set activo = false where user_id = $1', [inactivo]);
  await guardar(384, '2026-02-28', [L('A')]);
  await guardar(384, '2026-03-01', [L('B'), L('C', { codigo: 'BRO13', nombre: 'Brownie', canal: 'mostrador', metodo_pago: 'CARTAO', tipo_pago: 'EMV', smartphone: false })]);
});
afterAll(async () => db.close());

describe('migración 43', () => {
  it('perfil_modulos acepta bi', async () => {
    const r = await db.query(`select modulo from perfil_modulos where user_id = $1`, [conBi]);
    expect(r.rows).toEqual([{ modulo: 'bi' }]);
  });

  it('bi_acceso exige módulo bi, sucursal asignada y perfil activo', async () => {
    const acc = (u: string, c: number) =>
      comoUsuario(db, u, async () => (await db.query<{ r: boolean }>('select public.bi_acceso($1) r', [c])).rows[0].r);
    expect(await acc(conBi, 384)).toBe(true);
    expect(await acc(conBi, 532)).toBe(false);
    expect(await acc(soloSucursales, 384)).toBe(false);
    expect(await acc(inactivo, 384)).toBe(false);
  });

  it('bi_acceso niega tokens OAuth', async () => {
    const r = await comoUsuario(db, conBi, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [JSON.stringify({ sub: conBi, client_id: 'claude-client' })]);
      try { return (await db.query<{ r: boolean }>('select public.bi_acceso(384) r')).rows[0].r; }
      finally { await db.query(`select set_config('request.jwt.claims', '', false)`); }
    });
    expect(r).toBe(false);
  });

  it('bi_tablero solo con módulo bi: con solo sucursales no ve nada', async () => {
    expect((await rpc(conBi, 'bi_tablero', base)).kpis.tickets).toBe(3);
    expect((await rpc(soloSucursales, 'bi_tablero', base)).kpis.tickets).toBe(0);
  });

  it('WALLET_BALANCE es «WALLET» hasta el 2026-02-28 y «APP - WALLET» desde el 2026-03-01', async () => {
    const r = await rpc(conBi, 'bi_tablero', { ...base, desde: '2026-02-28', hasta: '2026-02-28' });
    expect(r.por_pago.map((x: T) => x.etiqueta)).toEqual(['WALLET']);
    const s = await rpc(conBi, 'bi_tablero', { ...base, desde: '2026-03-01', hasta: '2026-03-01' });
    expect(s.por_pago.map((x: T) => x.etiqueta).sort()).toEqual(['APP - WALLET', 'TABLET - CARD']);
    const f = await rpc(conBi, 'bi_tablero', { ...base, pagos: ['WALLET'] });
    expect(f.kpis.tickets).toBe(1);
  });

  it('por_fecha: venta neta y tickets por día', async () => {
    const r = await rpc(conBi, 'bi_tablero', base);
    expect(r.por_fecha).toEqual([
      { fecha: '2026-02-28', venta_cent: 9700, tickets: 1 },
      { fecha: '2026-03-01', venta_cent: 19400, tickets: 2 },
    ]);
  });

  it('bi_opciones: solo tiendas con acceso; productos, pagos y semanas del periodo', async () => {
    const o = await rpc(conBi, 'bi_opciones', { desde: '2026-03-01', hasta: '2026-03-01' });
    expect(o.tiendas.map((t: T) => t.company_id)).toEqual([384]);
    expect(o.productos).toEqual(['Brownie', 'Iced Latte']);
    expect(o.pagos).toEqual(['APP - WALLET', 'TABLET - CARD']);
    expect(o.semanas).toEqual(['W9 2026']);
    expect(o.categorias).toContain('Sin clasificar');
    expect(o.grupos).toContain('Otros');
    expect(o.ultimo_corte).not.toBeNull();
    expect(o.tiendas_sin_rappi).toBe(1);
    const nada = await rpc(soloSucursales, 'bi_opciones', { desde: '2026-03-01', hasta: '2026-03-01' });
    expect(nada.tiendas).toEqual([]);
    expect(nada.productos).toEqual([]);
  });

  it('bi_opciones rechaza periodos inválidos', async () => {
    await expect(rpc(conBi, 'bi_opciones', { desde: '2026-03-02', hasta: '2026-03-01' })).rejects.toThrow(/Periodo inválido/);
  });
});
```

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/db/bi-acceso.test.ts`.
  Esperado: FAIL, porque la restricción de `perfil_modulos` rechaza `'bi'` en `beforeAll`.

- [ ] **Paso 3: escribe la migración.** Crea `supabase/migrations/20261106000043_bi_tablero.sql` con lo siguiente.
  Para `bi_tiendas_filtradas`, `bi_lineas_filtradas` y `bi_tablero`, **copia la definición vigente** y cambia solo lo
  indicado:
  - `bi_tiendas_filtradas` viene de la 40;
  - `bi_lineas_filtradas` y `bi_tablero` vienen de la 42.

```sql
-- BI F4 (docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md §2.2): módulo bi, acceso por bi_acceso,
-- etiqueta de pago por fecha (Zoho llamaba «WALLET» a WALLET_BALANCE hasta el 2026-02-28), venta por fecha y opciones
-- de los filtros.

-- 1. Módulo bi.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi'));

-- 2. Acceso al BI: módulo bi + sucursal asignada + perfil activo; sin tokens OAuth (MCP).
create function public.bi_acceso(p_company integer) returns boolean
language sql stable security definer set search_path = public, pg_temp as $$
  select (auth.jwt()->>'client_id') is null and exists (
    select 1 from public.perfiles p
    join public.perfil_modulos m on m.user_id = p.user_id and m.modulo = 'bi'
    join public.perfil_sucursales s on s.user_id = p.user_id and s.company_id = p_company
    where p.user_id = auth.uid() and p.activo)
$$;
revoke all on function public.bi_acceso(integer) from public, anon;
grant execute on function public.bi_acceso(integer) to authenticated;

-- 3. bi_tiendas_filtradas: misma definición que la 40, con bi_acceso en lugar de sucursales_acceso.
--    (Copia aquí el `create or replace function public.bi_tiendas_filtradas(p jsonb) …` de la 40 completo, cambiando
--    SOLO `public.sucursales_acceso(t.company_id)` por `public.bi_acceso(t.company_id)`, y repite su revoke.)

-- 4. Pago por fecha.
alter table public.bi_mapeo_pago add column vigente_desde date not null default '2000-01-01';
alter table public.bi_mapeo_pago add column vigente_hasta date;
alter table public.bi_mapeo_pago drop constraint bi_mapeo_pago_pkey;
alter table public.bi_mapeo_pago add primary key (metodo_pos, tipo_pos, smartphone, vigente_desde);
alter table public.bi_mapeo_pago add constraint bi_mapeo_pago_vigencia
  check (vigente_hasta is null or vigente_hasta >= vigente_desde);
update public.bi_mapeo_pago set vigente_desde = '2026-03-01'
  where metodo_pos = 'WALLET_BALANCE' and tipo_pos = 'WALLET' and smartphone;
insert into public.bi_mapeo_pago (metodo_pos, tipo_pos, smartphone, etiqueta, vigente_desde, vigente_hasta)
  values ('WALLET_BALANCE', 'WALLET', true, 'WALLET', '2000-01-01', '2026-02-28');

-- 5. bi_lineas_filtradas: misma definición que la 42 (create or replace, misma firma y mismo retorno); el join del
--    mapeo agrega la vigencia:
--      left join public.bi_mapeo_pago mp on mp.metodo_pos = l.metodo_pago and mp.tipo_pos = l.tipo_pago
--        and mp.smartphone = l.smartphone and l.fecha >= mp.vigente_desde
--        and (mp.vigente_hasta is null or l.fecha <= mp.vigente_hasta)
--    Repite su `revoke all … from public, anon, authenticated`.

-- 6. bi_tablero: misma definición que la 42 más una llave al final del jsonb_build_object:
--      'por_fecha', coalesce((select jsonb_agg(jsonb_build_object('fecha', f, 'venta_cent', s, 'tickets', t) order by f)
--        from (select fecha f, sum(importe_neto_cent) s, count(distinct (fuente, company_id, fecha, pedido)) t
--              from bi_f group by 1) x), '[]')
--    Repite su revoke/grant.

-- 7. Opciones de los filtros: solo de tiendas con bi_acceso.
create function public.bi_opciones(p jsonb) returns jsonb
language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  d date := (p->>'desde')::date;
  h date := (p->>'hasta')::date;
  v integer[];
  r jsonb;
begin
  if d is null or h is null or d > h or h - d > 1100 then
    raise exception 'Periodo inválido (máximo 1,100 días).';
  end if;
  v := array(select t.company_id from public.bi_tiendas t where public.bi_acceso(t.company_id));
  select jsonb_build_object(
    'tiendas', coalesce((select jsonb_agg(jsonb_build_object('company_id', t.company_id, 'store_id', t.store_id,
        'nombre', t.nombre, 'franquiciatario', t.franquiciatario, 'tipo', t.tipo) order by t.nombre)
      from public.bi_tiendas t where t.company_id = any(v)), '[]'),
    'franquiciatarios', coalesce((select jsonb_agg(x order by x) from (select distinct franquiciatario x
      from public.bi_tiendas where company_id = any(v) and franquiciatario is not null) y), '[]'),
    'tipos', coalesce((select jsonb_agg(x order by x) from (select distinct tipo x
      from public.bi_tiendas where company_id = any(v)) y), '[]'),
    'categorias', (select jsonb_agg(x order by x) from (select distinct categoria_master x
      from public.bi_clasificacion_producto union select 'Sin clasificar') y),
    'grupos', (select jsonb_agg(x order by x) from (select distinct grupo x
      from public.bi_clasificacion_producto union select 'Otros') y),
    'productos', coalesce((select jsonb_agg(x order by x) from (select distinct l.nombre x from public.bi_lineas l
      where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'pagos', coalesce((select jsonb_agg(x order by x) from (select distinct coalesce(mp.etiqueta, l.metodo_pago) x
      from public.bi_lineas l
      left join public.bi_mapeo_pago mp on mp.metodo_pos = l.metodo_pago and mp.tipo_pos = l.tipo_pago
        and mp.smartphone = l.smartphone and l.fecha >= mp.vigente_desde
        and (mp.vigente_hasta is null or l.fecha <= mp.vigente_hasta)
      where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'semanas', coalesce((select jsonb_agg(w order by a, s) from (select distinct public.bi_anio_semana(l.fecha) a,
        public.bi_semana(l.fecha) s, 'W' || public.bi_semana(l.fecha) || ' ' || public.bi_anio_semana(l.fecha) w
      from public.bi_lineas l where l.company_id = any(v) and l.fecha between d and h) y), '[]'),
    'ultimo_corte', (select max(k.leido_en) from public.bi_cargas k
      where k.fuente = 'pos' and k.company_id = any(v) and k.fecha between d and h),
    -- Tiendas con venta en el periodo y algún día sin Rappi del POS: hasta F3 su Rappi (de Zoho) falta.
    'tiendas_sin_rappi', (select count(distinct k.company_id) from public.bi_cargas k
      where k.fuente = 'pos' and k.company_id = any(v) and k.fecha between d and h and not k.rappi_en_pos)
  ) into r;
  return r;
end $$;
revoke all on function public.bi_opciones(jsonb) from public, anon;
grant execute on function public.bi_opciones(jsonb) to authenticated;
```

  Después borra los comentarios «Copia aquí…» y deja el SQL real de los puntos 3, 5 y 6. La migración final no debe
  tener instrucciones, solo comentarios que expliquen.

- [ ] **Paso 4: ajusta las pruebas existentes.**
  - En `tests/db/bi-lectura.test.ts` y `tests/db/bi-neto.test.ts`, los usuarios que leen el BI reciben el módulo `bi`.
    Por ejemplo, en `bi-lectura` el insert de `perfil_modulos` pasa de `'sucursales'` a `'bi'`.
  - Si alguna prueba inserta en `bi_mapeo_pago` sin vigencia, sigue funcionando por el `default '2000-01-01'`.
  - En `tests/db/bi-semillas.test.ts` agrega:

```ts
  it('WALLET_BALANCE tiene dos vigencias (WALLET hasta 2026-02-28; APP - WALLET desde 2026-03-01)', async () => {
    const r = await db.query<{ etiqueta: string; vigente_desde: string; vigente_hasta: string | null }>(
      `select etiqueta, vigente_desde::text, vigente_hasta::text from bi_mapeo_pago
       where metodo_pos = 'WALLET_BALANCE' order by vigente_desde`,
    );
    expect(r.rows).toEqual([
      { etiqueta: 'WALLET', vigente_desde: '2000-01-01', vigente_hasta: '2026-02-28' },
      { etiqueta: 'APP - WALLET', vigente_desde: '2026-03-01', vigente_hasta: null },
    ]);
  });
```

  - Si `bi-semillas` cuenta 10 mapeos, ahora son 11.

- [ ] **Paso 5: corre las pruebas.**
  Corre: `npx vitest run tests/db/bi-acceso.test.ts tests/db/bi-lectura.test.ts tests/db/bi-neto.test.ts tests/db/bi-base.test.ts tests/db/bi-semillas.test.ts tests/portal/bi-semillas.test.ts`.
  Esperado: PASS. Si `tests/portal/bi-semillas.test.ts` (antideriva de la 41) falla, **no edites la 41**: la prueba
  compara el generador con el archivo 41 y ninguno de los dos cambió.

- [ ] **Paso 6: commit.**

```bash
git add supabase/migrations/20261106000043_bi_tablero.sql tests/db/bi-acceso.test.ts tests/db/bi-lectura.test.ts tests/db/bi-neto.test.ts tests/db/bi-semillas.test.ts
git commit -m "BI F4: migración 43 (módulo bi, bi_acceso, pago por fecha, por_fecha y bi_opciones)"
```

---

### Tarea 2: módulo «BI» en el portal (menú, sesión y rutas vacías)

**Archivos:**
- Modificar: `lib/portal/modulos.ts`, `components/portal/navegacion.tsx`, `components/portal/marco.tsx`,
  `lib/supabase/sesion.ts`
- Crear: `app/(bi)/bi/layout.tsx`, `app/(bi)/bi/page.tsx`, `app/(bi)/bi/the-coffee-mexico/page.tsx` (por ahora con
  un `Encabezado`; la Tarea 7 lo llena)
- Prueba: `tests/portal/bi-modulo.test.ts`

**Interfaces:**
- **Produce:**
  - `IdModulo` incluye `'bi'`;
  - `Accesos` incluye `bi?: NivelModulo`;
  - `accesoBi(): Promise<{ok:true; db; perfil:{user_id,nombre,rol}; companias:number[]} | {ok:false; status:401|403; destino:string; mensaje:string}>`;
  - `sesionBi(redirigir = true)`.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-modulo.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/bi', useSearchParams: () => new URLSearchParams() }));
import { modulos, modulosVisibles } from '@/lib/portal/modulos';
import { gruposDe } from '@/components/portal/navegacion';

describe('módulo BI', () => {
  it('se ve solo con acceso bi', () => {
    expect(modulosVisibles({ bi: 'lectura' }, 'sucursales')).toContain('bi');
    expect(modulosVisibles({ sucursales: 'lectura' }, 'sucursales')).not.toContain('bi');
    expect(modulos.find((m) => m.id === 'bi')?.href).toBe('/bi');
  });

  it('navegación del BI: Portal + tableros', () => {
    const g = gruposDe('bi', ['bi', 'sucursales']);
    expect(g[0].enlaces.map((e) => e.href)).toEqual(['/', '/sucursales']);
    expect(g[1].enlaces.map((e) => e.href)).toEqual(['/bi', '/bi/the-coffee-mexico']);
  });
});
```

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-modulo.test.ts`.
  Esperado: FAIL; es un error de tipos o de aserción, porque `'bi'` no existe.

- [ ] **Paso 3: implementa.**
  - **`lib/portal/modulos.ts`:**
    - `IdModulo = 'costeo' | 'crm' | 'sucursales' | 'bi'`;
    - `Accesos` agrega `'bi'`;
    - entrada nueva, al final:

```ts
  {
    id: 'bi',
    nombre: 'BI',
    descripcion: 'Tableros de la red (los de Zoho Analytics): ventas, mezcla, pagos, productos y tendencias.',
    href: '/bi',
    // Además del módulo, cada sucursal requiere asignación explícita (perfil_sucursales); lo exige bi_acceso.
    acceso: (a) => a.bi !== undefined,
  },
```

  - **`components/portal/navegacion.tsx`:**
    - importa `BarChart3` de `lucide-react`;
    - `entradaModulo.bi = { href: '/bi', nombre: 'BI', icono: BarChart3 }`;
    - grupos del BI:

```ts
const gruposBi: Grupo[] = [
  {
    titulo: 'BI',
    enlaces: [
      { href: '/bi', nombre: 'Tableros', icono: LayoutGrid, exacto: true },
      { href: '/bi/the-coffee-mexico', nombre: 'The Coffee México', icono: MapPinned },
    ],
  },
];
```

    - y `gruposPorSeccion.bi = gruposBi`.
  - **`components/portal/marco.tsx`:** agrega a `textos`:
    `bi: { marca: ['BI', 'The Coffee'], buscar: 'Buscar tienda o tablero…', registros: 'Tiendas' }`.
  - **`lib/supabase/sesion.ts`:** agrega `accesoBi()`, una copia de `accesoSucursales()` con dos cambios:
    `!c.accesos.bi` y el mensaje `'No tienes acceso al BI.'`. Agrega también `sesionBi()`, que espeja a
    `sesionSucursales()`. Para no duplicar la lectura de `perfil_sucursales`, extrae un helper privado
    `companiasAsignadas(db, userId)` y úsalo en las dos.
  - **`app/(bi)/bi/layout.tsx`:** mismo patrón que `app/(sucursales)/sucursales/layout.tsx`, con `sesionBi()`,
    `seccion="bi"` y `busqueda` armada con las tiendas de `companias`. Usa `sucursalesAccesibles(companias)` de
    `lib/sucursales/acceso.ts` para el nombre y `href: /bi/the-coffee-mexico?tiendas=<companyId>`. No importa
    `vitrina.css`; usa `<div className="space-y-7">`.
  - **`app/(bi)/bi/page.tsx`:** `Encabezado area="BI" titulo="Tableros"` y una `Tarjeta` con enlace a «The Coffee
    México»: «Ventas de la red: los 17 filtros y los bloques del tablero de Zoho».
  - **`app/(bi)/bi/the-coffee-mexico/page.tsx`:** `Encabezado area="BI" titulo="The Coffee México"`. Si
    `companias.length === 0`, muestra el `Vacio` «Aún no tienes sucursales asignadas», como en
    `app/(sucursales)/sucursales/mexico/page.tsx`.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-modulo.test.ts tests/portal` y luego el `tsc` filtrado.
  Esperado: PASS. Revisa que `Record<IdModulo, …>` no quede incompleto en ningún archivo; `tsc` lo marca.

- [ ] **Paso 5: commit.**

```bash
git add lib/portal/modulos.ts components/portal/navegacion.tsx components/portal/marco.tsx lib/supabase/sesion.ts "app/(bi)" tests/portal/bi-modulo.test.ts
git commit -m "BI F4: módulo BI en el portal (menú, sesión y rutas)"
```

---

### Tarea 3: filtros en la URL (`lib/bi/url.ts`)

**Archivos:**
- Crear: `lib/bi/url.ts`
- Prueba: `tests/portal/bi-url.test.ts`

**Interfaces:**
- **Consume:** `FiltrosBi` y `fechaRelativa(opcion, hoy)` de `lib/bi/filtros.ts`. Las opciones de Fecha Relativa son
  las etiquetas en español, por ejemplo `'Esta semana'`.
- **Produce:**

```ts
export const OPCIONES_FR: { clave: string; etiqueta: string }[]; // 15; clave en kebab: 'esta-semana', 'ultimas-4-semanas'…
export const FR_POR_OMISION = 'esta-semana';
/** Filtros de la URL (sin fechas resueltas). */
export interface FiltrosUrl {
  fr?: string; desde?: string; hasta?: string; comparable?: boolean; aniosOperando: number[]; dias: number[];
  companias: number[]; franquiciatarios: string[]; tipos: string[]; categorias: string[]; grupos: string[];
  cafe: ('Sí' | 'No')[]; productos: string[]; pagos: string[]; horas: number[]; maduracion: string[];
  montoMin?: number; montoMax?: number; semanas: string[];
}
export function leerUrl(q: URLSearchParams): FiltrosUrl;
export function escribirUrl(f: FiltrosUrl): URLSearchParams; // omite vacíos y el fr por omisión
export function hoyMexico(ahora: Date): string; // AAAA-MM-DD en America/Mexico_City
export function resolverPeriodo(f: FiltrosUrl, hoy: string):
  | { ok: true; desde: string; hasta: string }
  | { ok: false; error: string };
/** FiltrosUrl + periodo + companias efectivas → FiltrosBi para aJsonRpc. */
export function aFiltrosBi(f: FiltrosUrl, periodo: { desde: string; hasta: string }, companias: number[], hoy: string): FiltrosBi;
```

| Parámetro | Filtro |
|---|---|
| `fr` | Fecha Relativa |
| `desde`, `hasta` | Rango de Fechas |
| `comp` (`si`/`no`) | Comparable |
| `anios` | Años Operando |
| `dias` (0–6, domingo = 0, como `extract(dow)`) | Día de la Semana |
| `tiendas` | Nombre de Tienda |
| `franq` | Franquiciatario |
| `tipo` | Franquicia o Sucursales Propias |
| `cat` | Categoría Master Franchise MX |
| `grupo` | Comida, Bebida, Combo y Merch |
| `cafe` (`si`/`no`) | Contiene Café |
| `prod` | Product |
| `pago` | Método de Pago |
| `hora` | Hora |
| `mad` | Estatus de Maduración |
| `min`, `max` | Net Amount (Local), en pesos |
| `sem` | Semanas y año |

Las listas van separadas por comas. Los textos van con `encodeURIComponent` por elemento, porque hay productos con
comas, así que se escapan con `%2C` antes de unir.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-url.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { OPCIONES_FR, aFiltrosBi, escribirUrl, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import zoho from '../../docs/bi/zoho/filtros.json';

const vacio = () => leerUrl(new URLSearchParams());

describe('URL ↔ filtros', () => {
  it('sin parámetros: Esta semana y listas vacías', () => {
    const f = vacio();
    expect(f.fr).toBe('esta-semana');
    expect(f.companias).toEqual([]);
    expect(escribirUrl(f).toString()).toBe('');
  });

  it('ida y vuelta de los 17 filtros', () => {
    const q = new URLSearchParams(
      'fr=mes-anterior&comp=si&anios=1,2&dias=1,5&tiendas=384,532&franq=CDMX-MJA&tipo=Franquicia&cat=Fraps' +
        '&grupo=Bebida&cafe=no&prod=Iced%20Latte,Brownie%2C%20chico&pago=APP%20-%20WALLET&hora=8,9&mad=Mayor%20de%203%20meses' +
        '&min=10&max=250.5&sem=W45%202026',
    );
    const f = leerUrl(q);
    expect(f).toMatchObject({
      fr: 'mes-anterior', comparable: true, aniosOperando: [1, 2], dias: [1, 5], companias: [384, 532],
      franquiciatarios: ['CDMX-MJA'], tipos: ['Franquicia'], categorias: ['Fraps'], grupos: ['Bebida'], cafe: ['No'],
      productos: ['Iced Latte', 'Brownie, chico'], pagos: ['APP - WALLET'], horas: [8, 9],
      maduracion: ['Mayor de 3 meses'], montoMin: 10, montoMax: 250.5, semanas: ['W45 2026'],
    });
    expect(leerUrl(escribirUrl(f))).toEqual(f);
  });

  it('el rango de fechas le gana a la relativa', () => {
    const f = leerUrl(new URLSearchParams('fr=hoy&desde=2026-10-01&hasta=2026-10-07'));
    expect(f.fr).toBeUndefined();
    expect(resolverPeriodo(f, '2026-11-05')).toEqual({ ok: true, desde: '2026-10-01', hasta: '2026-10-07' });
  });

  it('descarta basura sin reventar', () => {
    const f = leerUrl(new URLSearchParams('fr=nada&tiendas=abc,384,-2&dias=9,1&hora=25,7&min=-5&max=x&comp=quiza&cafe=tal'));
    expect(f.fr).toBe('esta-semana');
    expect(f.companias).toEqual([384]);
    expect(f.dias).toEqual([1]);
    expect(f.horas).toEqual([7]);
    expect(f.montoMin).toBeUndefined();
    expect(f.montoMax).toBeUndefined();
    expect(f.comparable).toBeUndefined();
    expect(f.cafe).toEqual([]);
  });

  it('periodo inválido o de más de 1,100 días', () => {
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2026-10-07&hasta=2026-10-01')), '2026-11-05').ok).toBe(false);
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2020-01-01&hasta=2026-10-01')), '2026-11-05').ok).toBe(false);
    expect(resolverPeriodo(leerUrl(new URLSearchParams('desde=2026-02-30&hasta=2026-03-01')), '2026-11-05').ok).toBe(false);
  });

  it('las 15 opciones de Fecha Relativa son las de Zoho', () => {
    expect(OPCIONES_FR.map((o) => o.etiqueta)).toEqual(zoho.fechaRelativa.opciones);
    for (const o of OPCIONES_FR) expect(resolverPeriodo({ ...vacio(), fr: o.clave }, '2026-11-05').ok).toBe(true);
  });

  it('hoy en hora de México, no en UTC', () => {
    expect(hoyMexico(new Date('2026-11-06T05:30:00Z'))).toBe('2026-11-05'); // 23:30 en CDMX
    expect(hoyMexico(new Date('2026-11-06T06:30:00Z'))).toBe('2026-11-06');
  });

  it('aFiltrosBi pasa las compañías efectivas y el periodo', () => {
    const f = leerUrl(new URLSearchParams('cafe=si&min=10'));
    expect(aFiltrosBi(f, { desde: '2026-11-02', hasta: '2026-11-05' }, [384], '2026-11-05')).toMatchObject({
      desde: '2026-11-02', hasta: '2026-11-05', companias: [384], cafe: ['Sí'], montoMin: 10, hoy: '2026-11-05',
    });
  });
});
```

  Antes de escribir la prueba, abre `docs/bi/zoho/filtros.json` y usa la ruta real de las opciones de Fecha Relativa.
  `zoho.fechaRelativa.opciones` es el nombre supuesto; corrígelo en la prueba si es distinto. Las etiquetas deben ser
  exactamente los `case` de `fechaRelativa` en `lib/bi/filtros.ts`.

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-url.test.ts`.
  Esperado: FAIL con «Cannot find module '@/lib/bi/url'».

- [ ] **Paso 3: implementa `lib/bi/url.ts`.**

```ts
import { fechaRelativa, type FiltrosBi } from './filtros';

const ETIQUETAS_FR = [
  'Hoy', 'Ayer', 'Esta semana', 'Semana anterior', '2 semanas anteriores', '3 semanas anteriores',
  '4 semanas anteriores', 'Últimas 4 semanas', 'Este mes', 'Mes anterior', 'Últimos 3 meses', 'Este trimestre',
  'Trimestre anterior', 'Este año', 'Año anterior',
];
const aClave = (s: string) =>
  s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, '-');
export const OPCIONES_FR = ETIQUETAS_FR.map((etiqueta) => ({ clave: aClave(etiqueta), etiqueta }));
export const FR_POR_OMISION = 'esta-semana';
const MAX_DIAS = 1100;

export interface FiltrosUrl { /* como en Interfaces */ }

const lista = (q: URLSearchParams, k: string) =>
  (q.get(k) ?? '').split(',').map((s) => decodeURIComponent(s).trim()).filter(Boolean);
const enteros = (q: URLSearchParams, k: string, min: number, max: number) =>
  [...new Set(lista(q, k).map(Number).filter((n) => Number.isInteger(n) && n >= min && n <= max))];
const monto = (v: string | null) => {
  if (v == null || v.trim() === '') return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 ? n : undefined;
};
const siNo = (v: string | null) => (v === 'si' ? true : v === 'no' ? false : undefined);
const fechaOk = (s: string | null): s is string =>
  !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

export function leerUrl(q: URLSearchParams): FiltrosUrl {
  const desde = q.get('desde');
  const hasta = q.get('hasta');
  const conRango = fechaOk(desde) && fechaOk(hasta);
  const fr = q.get('fr');
  return {
    fr: conRango ? undefined : OPCIONES_FR.some((o) => o.clave === fr) ? fr! : FR_POR_OMISION,
    desde: conRango ? desde! : undefined,
    hasta: conRango ? hasta! : undefined,
    comparable: siNo(q.get('comp')),
    aniosOperando: enteros(q, 'anios', 0, 99),
    dias: enteros(q, 'dias', 0, 6),
    companias: enteros(q, 'tiendas', 1, 2_147_483_647),
    franquiciatarios: lista(q, 'franq'),
    tipos: lista(q, 'tipo'),
    categorias: lista(q, 'cat'),
    grupos: lista(q, 'grupo'),
    cafe: lista(q, 'cafe').map((s) => (s === 'si' ? 'Sí' : s === 'no' ? 'No' : null)).filter((x): x is 'Sí' | 'No' => !!x),
    productos: lista(q, 'prod'),
    pagos: lista(q, 'pago'),
    horas: enteros(q, 'hora', 0, 23),
    maduracion: lista(q, 'mad'),
    montoMin: monto(q.get('min')),
    montoMax: monto(q.get('max')),
    semanas: lista(q, 'sem'),
  };
}
```

  **`escribirUrl`** hace lo inverso, en este orden de llaves: `fr`, `desde`, `hasta`, `comp`, `anios`, `dias`,
  `tiendas`, `franq`, `tipo`, `cat`, `grupo`, `cafe`, `prod`, `pago`, `hora`, `mad`, `min`, `max`, `sem`. Reglas:
  - cada elemento de una lista va con `encodeURIComponent` y se unen con `,`;
  - `URLSearchParams` vuelve a escapar el `%`, y `leerUrl` hace `decodeURIComponent` después del `get`, así que la
    ida y vuelta queda simétrica;
  - omite las listas vacías, los `undefined` y `fr === FR_POR_OMISION`;
  - `cafe` se escribe `si`/`no`.

  **`hoyMexico`:**
  `new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City', year: 'numeric', month: '2-digit', day: '2-digit' }).format(ahora)`.

  **`resolverPeriodo`:**
  - con `desde`/`hasta`, los usa;
  - si no, toma la etiqueta de `fr` y llama `fechaRelativa(etiqueta, hoy)`;
  - devuelve `{ok:false, error:'El periodo no es válido.'}` si `desde > hasta`, y
    `{ok:false, error:'El periodo máximo es de 1,100 días.'}` si pasa de `MAX_DIAS`.

  **`aFiltrosBi`** arma el `FiltrosBi` con los nombres de `filtros.ts`: `aniosOperando`, `montoMin` y los demás.
  También pone `hoy`.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-url.test.ts tests/portal/bi-filtros.test.ts`.
  Esperado: PASS.

- [ ] **Paso 5: commit.**

```bash
git add lib/bi/url.ts tests/portal/bi-url.test.ts
git commit -m "BI F4: filtros del tablero en la URL (17 filtros, rango sobre relativa, hoy en CDMX)"
```

---

### Tarea 4: contratos y armado de bloques (`lib/bi/tipos.ts`, `lib/bi/bloques.ts`)

**Archivos:**
- Crear: `lib/bi/tipos.ts`, `lib/bi/bloques.ts`
- Prueba: `tests/portal/bi-bloques.test.ts`

**Interfaces:**
- **Produce:** en `lib/bi/tipos.ts`, los contratos de las RPC y de las rutas:

```ts
export interface RpcTablero {
  cargas: { esperados: number; con_carga: number; incompletos: number };
  kpis: { venta_cent: number; venta_bruta_cent: number; tickets: number; lineas: number; unidades: number };
  por_grupo: { grupo: string; venta_cent: number }[];
  por_cafe: { cafe: string; venta_cent: number }[];
  por_master: { categoria: string; venta_cent: number }[];
  por_fecha: { fecha: string; venta_cent: number; tickets: number }[];
  por_dia: { dow: number; venta_cent: number; tickets: number }[];
  por_hora: { hora: number; venta_cent: number; tickets: number }[];
  por_pago: { etiqueta: string; venta_cent: number; tickets: number }[];
  por_pago_tienda: { etiqueta: string; company_id: number; venta_cent: number }[];
  por_tienda_dia: { company_id: number; dow: number; venta_cent: number; tickets: number }[];
  promociones: { company_id: number; promocion: string; unidades: number; venta_cent: number }[];
  ranking: { codigo: string; nombre: string; mes: string; unidades: number; venta_cent: number; lineas: number }[];
  fuentes: { fuente: string; canal: string; venta_cent: number }[];
}
export interface TiendaBi { company_id: number; store_id: number; nombre: string; franquiciatario: string | null; tipo: string }
export interface RpcOpciones {
  tiendas: TiendaBi[]; franquiciatarios: string[]; tipos: string[]; categorias: string[]; grupos: string[];
  productos: string[]; pagos: string[]; semanas: string[]; ultimo_corte: string | null; tiendas_sin_rappi: number;
}
export interface RpcTendencias {
  por_mes: { anio: number; mes: number; venta_cent: number }[];
  por_semana: { anio: number; semana: number; venta_cent: number }[];
}
export interface RespuestaTablero { periodo: { desde: string; hasta: string }; hoy: string; tablero: RpcTablero; opciones: RpcOpciones }
export interface RespuestaTendencias { hoy: string; tendencias: RpcTendencias }
```

- **Produce:** en `lib/bi/bloques.ts`, funciones puras:

```ts
export const cociente = (a: number, b: number): number | null => (b > 0 ? a / b : null);
export function numerosClave(t: RpcTablero): { ventaCent: number; cobradoCent: number; tickets: number;
  ticketPromedioCent: number | null; upt: number | null; unidades: number };
export function conShare<T extends { venta_cent: number }>(filas: T[]): (T & { share: number | null })[];
export function kpiTiendas(t: RpcTablero, tiendas: TiendaBi[]): { tipo: string; ventaCent: number; tickets: number;
  tiendas: { companyId: number; nombre: string; ventaCent: number; tickets: number; ticketPromedioCent: number | null; share: number | null }[] }[];
export const META_PROMO = { 'Promoción alimentos y bebidas': 0.06, 'Promoción café': 0.01 } as const;
export function promociones(t: RpcTablero, tiendas: TiendaBi[]): {
  red: { promocion: keyof typeof META_PROMO; share: number | null; meta: number; unidades: number }[];
  porTienda: { companyId: number; nombre: string; ventaCent: number;
    promos: Record<keyof typeof META_PROMO, { share: number | null; unidades: number }> }[] };
export function rankingPorMes(t: RpcTablero): { mes: string; productos: (RpcTablero['ranking'][number] & { share: number | null })[] }[];
export function pagoPorTienda(t: RpcTablero, tiendas: TiendaBi[]): { companyId: number; nombre: string; ventaCent: number;
  pagos: { etiqueta: string; ventaCent: number; share: number | null }[] }[];
export function tendenciaAnual(r: RpcTendencias): { anio: number; meses: (number | null)[] }[]; // 12 posiciones, null si no hay
export function tendenciaSemanal(r: RpcTendencias): { anio: number; semanas: (number | null)[] }[]; // 53 posiciones
export function avisos(t: RpcTablero, o: RpcOpciones): { faltantes: number; esperados: number; incompletos: number;
  rappiPendiente: boolean; ultimoCorte: string | null };
```

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-bloques.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  avisos, cociente, conShare, kpiTiendas, numerosClave, pagoPorTienda, promociones, rankingPorMes, tendenciaAnual,
  tendenciaSemanal,
} from '@/lib/bi/bloques';
import type { RpcOpciones, RpcTablero, TiendaBi } from '@/lib/bi/tipos';

const vacio: RpcTablero = {
  cargas: { esperados: 0, con_carga: 0, incompletos: 0 },
  kpis: { venta_cent: 0, venta_bruta_cent: 0, tickets: 0, lineas: 0, unidades: 0 },
  por_grupo: [], por_cafe: [], por_master: [], por_fecha: [], por_dia: [], por_hora: [], por_pago: [],
  por_pago_tienda: [], por_tienda_dia: [], promociones: [], ranking: [], fuentes: [],
};
const tiendas: TiendaBi[] = [
  { company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' },
  { company_id: 612, store_id: 498, nombre: 'Juárez', franquiciatario: 'Chihuahua', tipo: 'Franquicia' },
];
const t: RpcTablero = {
  ...vacio,
  cargas: { esperados: 10, con_carga: 8, incompletos: 1 },
  kpis: { venta_cent: 30000, venta_bruta_cent: 31000, tickets: 4, lineas: 6, unidades: 7 },
  por_grupo: [{ grupo: 'Bebida', venta_cent: 20000 }, { grupo: 'Comida', venta_cent: 10000 }],
  por_tienda_dia: [
    { company_id: 384, dow: 1, venta_cent: 15000, tickets: 2 },
    { company_id: 384, dow: 2, venta_cent: 5000, tickets: 1 },
    { company_id: 612, dow: 1, venta_cent: 10000, tickets: 1 },
  ],
  promociones: [
    { company_id: 384, promocion: 'Promoción café', unidades: 1, venta_cent: 400 },
    { company_id: 384, promocion: 'Producto regular', unidades: 4, venta_cent: 19600 },
    { company_id: 612, promocion: 'Promoción alimentos y bebidas', unidades: 2, venta_cent: 1000 },
    { company_id: 612, promocion: 'Producto regular', unidades: 1, venta_cent: 9000 },
  ],
  por_pago_tienda: [
    { etiqueta: 'TABLET - CARD', company_id: 384, venta_cent: 15000 },
    { etiqueta: 'APP - WALLET', company_id: 384, venta_cent: 5000 },
  ],
  ranking: [
    { codigo: 'B', nombre: 'Brownie', mes: '2026-10-01', unidades: 1, venta_cent: 1000, lineas: 1 },
    { codigo: 'A', nombre: 'Latte', mes: '2026-10-01', unidades: 3, venta_cent: 3000, lineas: 3 },
    { codigo: 'A', nombre: 'Latte', mes: '2026-11-01', unidades: 1, venta_cent: 500, lineas: 1 },
  ],
};

describe('bloques', () => {
  it('cociente: nunca NaN ni Infinity', () => {
    expect(cociente(10, 0)).toBeNull();
    expect(cociente(0, 0)).toBeNull();
    expect(cociente(10, 4)).toBe(2.5);
  });

  it('números clave: ticket promedio y UPT como cociente de sumas', () => {
    expect(numerosClave(t)).toEqual({
      ventaCent: 30000, cobradoCent: 31000, tickets: 4, ticketPromedioCent: 7500, upt: 1.5, unidades: 7,
    });
    expect(numerosClave(vacio)).toMatchObject({ ticketPromedioCent: null, upt: null });
  });

  it('shares sobre la suma de las filas', () => {
    expect(conShare(t.por_grupo).map((x) => x.share)).toEqual([2 / 3, 1 / 3]);
    expect(conShare([])).toEqual([]);
    expect(conShare([{ venta_cent: 0 }])[0].share).toBeNull();
  });

  it('KPI por tienda: agrupa por tipo y suma los días', () => {
    const k = kpiTiendas(t, tiendas);
    expect(k.map((g) => g.tipo)).toEqual(['Sucursales Propias', 'Franquicia']);
    expect(k[0].tiendas[0]).toEqual({ companyId: 384, nombre: 'Ventura', ventaCent: 20000, tickets: 3,
      ticketPromedioCent: 20000 / 3, share: 20000 / 30000 });
    expect(k[1].ventaCent).toBe(10000);
  });

  it('una tienda sin nombre en opciones se muestra con su número', () => {
    const k = kpiTiendas({ ...t, por_tienda_dia: [{ company_id: 999, dow: 1, venta_cent: 1, tickets: 1 }] }, tiendas);
    expect(k[0]).toMatchObject({ tipo: 'Sin tipo', tiendas: [{ companyId: 999, nombre: 'Tienda 999' }] });
  });

  it('promociones contra 6 % y 1 %', () => {
    const p = promociones(t, tiendas);
    expect(p.red).toEqual([
      { promocion: 'Promoción alimentos y bebidas', share: 1000 / 30000, meta: 0.06, unidades: 2 },
      { promocion: 'Promoción café', share: 400 / 30000, meta: 0.01, unidades: 1 },
    ]);
    expect(p.porTienda.find((x) => x.companyId === 384)!.promos['Promoción café']).toEqual({ share: 400 / 20000, unidades: 1 });
  });

  it('ranking por mes con share dentro del mes', () => {
    const r = rankingPorMes(t);
    expect(r.map((m) => m.mes)).toEqual(['2026-11-01', '2026-10-01']); // el más reciente primero
    expect(r[1].productos.map((p) => [p.nombre, p.share])).toEqual([['Latte', 0.75], ['Brownie', 0.25]]);
  });

  it('pago por tienda', () => {
    expect(pagoPorTienda(t, tiendas)[0]).toEqual({ companyId: 384, nombre: 'Ventura', ventaCent: 20000, pagos: [
      { etiqueta: 'TABLET - CARD', ventaCent: 15000, share: 0.75 }, { etiqueta: 'APP - WALLET', ventaCent: 5000, share: 0.25 }] });
  });

  it('tendencias: 12 meses y 53 semanas con null donde no hay venta', () => {
    const r = { por_mes: [{ anio: 2025, mes: 3, venta_cent: 10 }], por_semana: [{ anio: 2026, semana: 53, venta_cent: 5 }] };
    expect(tendenciaAnual(r)).toEqual([{ anio: 2025, meses: [null, null, 10, null, null, null, null, null, null, null, null, null] }]);
    expect(tendenciaSemanal(r)[0].semanas[52]).toBe(5);
    expect(tendenciaSemanal(r)[0].semanas).toHaveLength(53);
  });

  it('avisos de frescura y Rappi', () => {
    const o = { tiendas_sin_rappi: 2, ultimo_corte: '2026-11-05T15:10:00Z' } as RpcOpciones;
    expect(avisos(t, o)).toEqual({ faltantes: 2, esperados: 10, incompletos: 1, rappiPendiente: true,
      ultimoCorte: '2026-11-05T15:10:00Z' });
  });
});
```

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-bloques.test.ts`.
  Esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementa `lib/bi/tipos.ts`** (exacto, como en Interfaces) **y `lib/bi/bloques.ts`.**

```ts
import type { RpcOpciones, RpcTablero, RpcTendencias, TiendaBi } from './tipos';

export const cociente = (a: number, b: number): number | null => (b > 0 ? a / b : null);
const nombreDe = (tiendas: TiendaBi[], c: number) => tiendas.find((x) => x.company_id === c)?.nombre ?? `Tienda ${c}`;
const tipoDe = (tiendas: TiendaBi[], c: number) => tiendas.find((x) => x.company_id === c)?.tipo ?? 'Sin tipo';
const ORDEN_TIPO = ['Sucursales Propias', 'Franquicia', 'Sin tipo'];

export function numerosClave(t: RpcTablero) {
  const k = t.kpis;
  return {
    ventaCent: k.venta_cent, cobradoCent: k.venta_bruta_cent, tickets: k.tickets,
    ticketPromedioCent: cociente(k.venta_cent, k.tickets), upt: cociente(k.lineas, k.tickets), unidades: k.unidades,
  };
}

export function conShare<T extends { venta_cent: number }>(filas: T[]) {
  const total = filas.reduce((s, f) => s + f.venta_cent, 0);
  return filas.map((f) => ({ ...f, share: cociente(f.venta_cent, total) }));
}

export function kpiTiendas(t: RpcTablero, tiendas: TiendaBi[]) {
  const total = t.por_tienda_dia.reduce((s, f) => s + f.venta_cent, 0);
  const porTienda = new Map<number, { ventaCent: number; tickets: number }>();
  for (const f of t.por_tienda_dia) {
    const a = porTienda.get(f.company_id) ?? { ventaCent: 0, tickets: 0 };
    a.ventaCent += f.venta_cent;
    a.tickets += f.tickets; // un ticket es de un solo día: sumar días no duplica
    porTienda.set(f.company_id, a);
  }
  const grupos = new Map<string, ReturnType<typeof kpiTiendas>[number]>();
  for (const [companyId, a] of porTienda) {
    const tipo = tipoDe(tiendas, companyId);
    const g = grupos.get(tipo) ?? { tipo, ventaCent: 0, tickets: 0, tiendas: [] };
    g.ventaCent += a.ventaCent;
    g.tickets += a.tickets;
    g.tiendas.push({ companyId, nombre: nombreDe(tiendas, companyId), ventaCent: a.ventaCent, tickets: a.tickets,
      ticketPromedioCent: cociente(a.ventaCent, a.tickets), share: cociente(a.ventaCent, total) });
    grupos.set(tipo, g);
  }
  for (const g of grupos.values()) g.tiendas.sort((x, y) => y.ventaCent - x.ventaCent);
  return [...grupos.values()].sort((x, y) => ORDEN_TIPO.indexOf(x.tipo) - ORDEN_TIPO.indexOf(y.tipo));
}
```

  Las demás funciones siguen las mismas reglas:
  - **`promociones`:**
    - el share de la red es la venta de esa promoción ÷ `t.kpis.venta_cent`;
    - por tienda, la venta de esa promoción ÷ la suma de las filas de `promociones` de la tienda;
    - las dos promociones siempre aparecen, con 0 unidades y share 0 si no hubo venta (o `null` si el total es 0).
  - **`rankingPorMes`:** agrupa por `mes`, ordena los meses de más reciente a más viejo y, dentro de cada mes, por
    `venta_cent` descendente; el share es ÷ la suma del mes.
  - **`pagoPorTienda`:** agrupa por `company_id`, ordena por venta descendente; dentro de cada tienda, los pagos van
    por venta descendente.
  - **`tendenciaAnual`:** un arreglo de 12 por año, ordenado por año. Usa `mes - 1` como índice.
  - **`tendenciaSemanal`:** un arreglo de 53 por año. Usa `semana - 1` como índice.
  - **`avisos`:** `faltantes = esperados - con_carga`; `rappiPendiente = o.tiendas_sin_rappi > 0`.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-bloques.test.ts`.
  Esperado: PASS.

- [ ] **Paso 5: commit.**

```bash
git add lib/bi/tipos.ts lib/bi/bloques.ts tests/portal/bi-bloques.test.ts
git commit -m "BI F4: contratos y armado de bloques del tablero"
```

---

### Tarea 5: route handlers `/api/bi/tablero` y `/api/bi/tendencias`

**Archivos:**
- Crear: `app/api/bi/tablero/route.ts`, `app/api/bi/tendencias/route.ts`
- Prueba: `tests/portal/bi-rutas.test.ts`

**Interfaces:**
- **Consume:**
  - `accesoBi()` (Tarea 2);
  - `leerUrl`, `resolverPeriodo`, `aFiltrosBi` y `hoyMexico` (Tarea 3);
  - `aJsonRpc` de `lib/bi/filtros.ts`;
  - los tipos de la Tarea 4;
  - `json` de `lib/sucursales/rutas.ts` (`Cache-Control: private, no-store`).
- **Produce:** `GET /api/bi/tablero?<filtros>` responde una de estas:
  - 200 con `RespuestaTablero`;
  - 400 `{error}`;
  - 401/403 `{error}`;
  - 503 `{error:'No se pudo leer el tablero.'}`.

  `GET /api/bi/tendencias?<filtros>` responde 200 con `RespuestaTendencias`, o con los mismos errores.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-rutas.test.ts`. Sigue el patrón de mocks de
  `tests/portal/sucursales-rutas.test.ts`: `vi.hoisted`, el mock de `../../lib/supabase/servidor` con `auth.getUser`,
  `from('perfiles' | 'perfil_modulos' | 'perfil_sucursales')` y `rpc`. Lee ese archivo y copia la forma exacta de
  `from(...).select().eq().maybeSingle()` que usa.

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

const s = vi.hoisted(() => ({
  usuario: 'u1' as string | null,
  modulos: [{ modulo: 'bi', nivel: 'lectura' }] as { modulo: string; nivel: string }[],
  companias: [384, 612] as number[],
  llamadas: [] as { fn: string; p: Record<string, unknown> }[],
  fallaTablero: false,
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ redirect: (p: string) => { throw new Error(`REDIRECT:${p}`); } }));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: async () => ({ data: { user: s.usuario ? { id: s.usuario } : null }, error: null }) },
    from: (tabla: string) => {
      const filas: Record<string, unknown[]> = {
        perfiles: [{ user_id: 'u1', nombre: 'Seb', rol: 'admin', activo: true }],
        perfil_modulos: s.modulos,
        perfil_sucursales: s.companias.map((company_id) => ({ company_id })),
      };
      const q = { select: () => q, eq: () => q, maybeSingle: async () => ({ data: filas[tabla][0], error: null }),
        then: (r: (x: unknown) => unknown) => r({ data: filas[tabla], error: null }) };
      return q;
    },
    rpc: async (fn: string, args: { p: Record<string, unknown> }) => {
      s.llamadas.push({ fn, p: args.p });
      if (fn === 'bi_tablero' && s.fallaTablero) return { data: null, error: { message: 'timeout' } };
      const datos: Record<string, unknown> = {
        bi_opciones: { tiendas: s.companias.map((c) => ({ company_id: c, store_id: c, nombre: `T${c}`, franquiciatario: null, tipo: 'Franquicia' })),
          franquiciatarios: [], tipos: [], categorias: [], grupos: [], productos: [], pagos: [], semanas: [], ultimo_corte: null, tiendas_sin_rappi: 0 },
        bi_tablero: { kpis: { venta_cent: 1 } },
        bi_tendencias: { por_mes: [], por_semana: [] },
      };
      return { data: datos[fn], error: null };
    },
  }),
}));

import { GET as tablero } from '@/app/api/bi/tablero/route';
import { GET as tendencias } from '@/app/api/bi/tendencias/route';
const pedir = (ruta: typeof tablero, q = '') => ruta(new Request(`http://x/api/bi/tablero${q}`));

beforeEach(() => {
  s.usuario = 'u1'; s.modulos = [{ modulo: 'bi', nivel: 'lectura' }]; s.companias = [384, 612];
  s.llamadas = []; s.fallaTablero = false;
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-11-06T05:30:00Z')); // 23:30 del 5-nov en CDMX
});

describe('/api/bi/tablero', () => {
  it('401 sin sesión y 403 sin módulo bi', async () => {
    s.usuario = null;
    expect((await pedir(tablero)).status).toBe(401);
    s.usuario = 'u1'; s.modulos = [{ modulo: 'sucursales', nivel: 'lectura' }];
    expect((await pedir(tablero)).status).toBe(403);
  });

  it('por omisión: Esta semana con hoy de CDMX y todas las tiendas con acceso', async () => {
    const r = await pedir(tablero);
    expect(r.status).toBe(200);
    expect(r.headers.get('Cache-Control')).toBe('private, no-store');
    const cuerpo = await r.json();
    expect(cuerpo.periodo).toEqual({ desde: '2026-11-02', hasta: '2026-11-05' });
    const p = s.llamadas.find((l) => l.fn === 'bi_tablero')!.p;
    expect(p).toMatchObject({ desde: '2026-11-02', hasta: '2026-11-05', hoy: '2026-11-05', companias: [384, 612] });
  });

  it('el filtro de tiendas se cruza con el acceso; si no queda ninguna, responde vacío sin llamar la RPC', async () => {
    await pedir(tablero, '?tiendas=612,999');
    expect(s.llamadas.find((l) => l.fn === 'bi_tablero')!.p.companias).toEqual([612]);
    s.llamadas = [];
    const r = await pedir(tablero, '?tiendas=999');
    expect(r.status).toBe(200);
    expect((await r.json()).tablero).toBeNull();
    expect(s.llamadas.some((l) => l.fn === 'bi_tablero')).toBe(false);
  });

  it('400 con periodo inválido, sin tocar la base', async () => {
    const r = await pedir(tablero, '?desde=2026-10-07&hasta=2026-10-01');
    expect(r.status).toBe(400);
    expect(s.llamadas).toEqual([]);
  });

  it('503 si la RPC falla', async () => {
    s.fallaTablero = true;
    expect((await pedir(tablero)).status).toBe(503);
  });
});

describe('/api/bi/tendencias', () => {
  it('ignora fechas y semanas; pasa los demás filtros', async () => {
    const r = await pedir(tendencias, '?desde=2026-10-01&hasta=2026-10-07&sem=W40%202026&cafe=si');
    expect(r.status).toBe(200);
    const p = s.llamadas.find((l) => l.fn === 'bi_tendencias')!.p;
    expect(p).toMatchObject({ cafe: ['Sí'], hoy: '2026-11-05', companias: [384, 612] });
    expect(p.semanas).toBeUndefined();
  });
});
```

  Si el mock de `from` no coincide con lo que usa `sesion.ts` (por ejemplo `.select('*').eq().maybeSingle()` para
  perfiles y `await` directo para listas), ajusta **el mock**, no el código de producción.

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-rutas.test.ts`.
  Esperado: FAIL, porque no existen las rutas.

- [ ] **Paso 3: implementa.** Antes, lee la guía de route handlers de `node_modules/next/dist/docs/`.

  `app/api/bi/tablero/route.ts`:

```ts
import { accesoBi } from '@/lib/supabase/sesion';
import { aJsonRpc } from '@/lib/bi/filtros';
import { aFiltrosBi, hoyMexico, leerUrl, resolverPeriodo } from '@/lib/bi/url';
import { json } from '@/lib/sucursales/rutas';
import type { RespuestaTablero, RpcOpciones, RpcTablero } from '@/lib/bi/tipos';

export const runtime = 'nodejs';

/**
 * Tablero «The Coffee México» (docs/superpowers/specs/2026-11-05-bi-f4-tablero-design.md §3): filtros de la URL,
 * hoy en CDMX y solo las tiendas con bi_acceso (la base lo vuelve a exigir).
 */
export async function GET(req: Request) {
  const a = await accesoBi();
  if (!a.ok) return json({ error: a.mensaje }, a.status);
  const hoy = hoyMexico(new Date());
  const f = leerUrl(new URL(req.url).searchParams);
  const periodo = resolverPeriodo(f, hoy);
  if (!periodo.ok) return json({ error: periodo.error }, 400);
  const o = await a.db.rpc('bi_opciones', { p: { desde: periodo.desde, hasta: periodo.hasta } });
  if (o.error || !o.data) {
    console.error('[bi] opciones', o.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  const opciones = o.data as unknown as RpcOpciones;
  const conAcceso = opciones.tiendas.map((t) => t.company_id);
  const companias = f.companias.length ? f.companias.filter((c) => conAcceso.includes(c)) : conAcceso;
  const p = { desde: periodo.desde, hasta: periodo.hasta };
  if (!companias.length) return json<RespuestaTablero | { periodo: typeof p; hoy: string; tablero: null; opciones: RpcOpciones }>(
    { periodo: p, hoy, tablero: null, opciones });
  const t = await a.db.rpc('bi_tablero', { p: aJsonRpc(aFiltrosBi(f, p, companias, hoy)) });
  if (t.error || !t.data) {
    console.error('[bi] tablero', t.error);
    return json({ error: 'No se pudo leer el tablero.' }, 503);
  }
  return json<RespuestaTablero>({ periodo: p, hoy, tablero: t.data as unknown as RpcTablero, opciones });
}
```

  - **Tipos:** en `RespuestaTablero` (Tarea 4) cambia `tablero: RpcTablero` por `tablero: RpcTablero | null` y
    simplifica el genérico de arriba a `json<RespuestaTablero>`. Ajusta la prueba de bloques si hace falta.
  - **Firma de la RPC:** en PostgREST el argumento se llama como el parámetro de la función (`p`), así que la llamada
    es `rpc('bi_tablero', { p: … })`. Si `database.types.ts` no conoce las funciones `bi_*`, usa el mismo casteo que
    las rutas de `app/api/sucursales/*` cuando llaman RPC no tipadas: busca `as unknown as` en esas rutas.

  `app/api/bi/tendencias/route.ts` es igual, salvo:
  - no valida el periodo, porque la RPC ignora las fechas;
  - las opciones se leen con el periodo del año en curso (`desde: <año>-01-01`, `hasta: hoy`), solo para las tiendas
    con acceso;
  - quita `semanas` de los filtros: `aFiltrosBi({ ...f, semanas: [] }, { desde: hoy, hasta: hoy }, companias, hoy)`;
  - llama `bi_tendencias`;
  - responde `RespuestaTendencias`, con `tendencias: null` si no quedan tiendas.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-rutas.test.ts tests/portal/bi-bloques.test.ts` y el `tsc` filtrado.
  Esperado: PASS.

- [ ] **Paso 5: commit.**

```bash
git add app/api/bi lib/bi/tipos.ts tests/portal/bi-rutas.test.ts tests/portal/bi-bloques.test.ts
git commit -m "BI F4: rutas del tablero y de tendencias"
```

---

### Tarea 6: barra de filtros (`components/bi/filtros.tsx`)

**Archivos:**
- Crear: `components/bi/filtros.tsx`, `components/bi/selector-multiple.tsx`
- Prueba: `tests/portal/bi-filtros-ui.test.tsx`

**Interfaces:**
- **Consume:** `FiltrosUrl`, `leerUrl`, `escribirUrl` y `OPCIONES_FR` (Tarea 3); `RpcOpciones` (Tarea 4).
- **Produce:**
  - `<FiltrosBi filtros={FiltrosUrl} opciones={RpcOpciones | null} alCambiar={(f: FiltrosUrl) => void} />`, un
    componente controlado. El orquestador (Tarea 7) escribe la URL.
  - `<SelectorMultiple etiqueta valores={string[]} elegidos={string[]} alCambiar buscar? />`.

**Comportamiento:**
- **Fila visible:**
  - Fecha Relativa es un `select` con las 15 opciones.
  - Comparable es un `select`: «Todas / Sí / No».
  - Años Operando es un `SelectorMultiple` de 0 a 10.
  - Rango de Fechas son dos `input type=date`. Llenar el rango quita `fr`; elegir una relativa limpia el rango.
  - Día de la Semana es un `SelectorMultiple` de Lunes a Domingo, con valores 1..6 y 0.
- **«Mostrar más filtros»:** un `button` con `aria-expanded` que despliega los 12 restantes, con los nombres exactos de
  Zoho:
  - Hora, Comparable y Maduración usan listas fijas;
  - Contiene Café: Sí / No;
  - Estatus de Maduración: «Menor de 3 meses» / «Mayor de 3 meses»;
  - Net Amount (Local): dos `input type=number`, mínimo y máximo, `min=0`, `step=0.01`;
  - los demás salen de `opciones`.
- **Chips y Limpiar:** hay un chip por filtro activo, con una ✕ que lo quita. «Limpiar» vuelve a `leerUrl(new URLSearchParams())`.
- **Retraso:** `alCambiar` se llama con un retraso de 400 ms solo para los campos de texto y número; los `select`
  aplican al momento.
- **Barra fija:** `sticky top-0 z-20` con fondo de superficie. En 375 px los campos se apilan en una columna y nada
  desborda.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-filtros-ui.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { FiltrosBi } from '@/components/bi/filtros';
import { leerUrl } from '@/lib/bi/url';
import type { RpcOpciones } from '@/lib/bi/tipos';

const opciones = {
  tiendas: [{ company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' }],
  franquiciatarios: [], tipos: ['Sucursales Propias'], categorias: ['Fraps'], grupos: ['Bebida'], productos: ['Iced Latte'],
  pagos: ['APP - WALLET'], semanas: ['W45 2026'], ultimo_corte: null, tiendas_sin_rappi: 0,
} as RpcOpciones;

describe('<FiltrosBi>', () => {
  it('muestra los 5 visibles y despliega los 12 con los nombres de Zoho', () => {
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams())} opciones={opciones} alCambiar={() => {}} />);
    for (const n of ['Fecha Relativa', 'Comparable', 'Años Operando', 'Rango de Fechas', 'Día de la Semana'])
      expect(screen.getByText(n)).toBeTruthy();
    expect(screen.queryByText('Nombre de Tienda')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /Mostrar más filtros/ }));
    for (const n of ['Nombre de Tienda', 'Franquiciatario', 'Franquicia o Sucursales Propias', 'Categoría Master Franchise MX',
      'Comida, Bebida, Combo y Merch', 'Contiene Café', 'Product', 'Método de Pago', 'Hora', 'Estatus de Maduración',
      'Net Amount (Local)', 'Semanas y año'])
      expect(screen.getByText(n)).toBeTruthy();
  });

  it('elegir una Fecha Relativa limpia el rango; Limpiar vuelve a Esta semana', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams('desde=2026-10-01&hasta=2026-10-07&cafe=si'))} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.change(screen.getByLabelText('Fecha Relativa'), { target: { value: 'mes-anterior' } });
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ fr: 'mes-anterior', desde: undefined, hasta: undefined }));
    fireEvent.click(screen.getByRole('button', { name: 'Limpiar' }));
    expect(alCambiar).toHaveBeenLastCalledWith(leerUrl(new URLSearchParams()));
  });

  it('un chip por filtro activo, que se puede quitar', () => {
    const alCambiar = vi.fn();
    render(<FiltrosBi filtros={leerUrl(new URLSearchParams('cafe=si&tiendas=384'))} opciones={opciones} alCambiar={alCambiar} />);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar Nombre de Tienda: Ventura' }));
    expect(alCambiar).toHaveBeenLastCalledWith(expect.objectContaining({ companias: [], cafe: ['Sí'] }));
  });
});
```

  Revisa que `@testing-library/react` esté en `package.json`. Si no está, usa lo que usen las otras pruebas `.tsx` de
  `tests/portal` (por ejemplo `crm-tablero.test.tsx`) y **no instales nada nuevo**.

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-filtros-ui.test.tsx`.
  Esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementa** `components/bi/selector-multiple.tsx` y `components/bi/filtros.tsx`.
  - Ambos son `'use client'`.
  - **Etiquetas accesibles:** cada control tiene `<label htmlFor>` con el nombre exacto de Zoho.
  - **`SelectorMultiple`:**
    - es un `button` que abre un panel con casillas y, si `buscar`, un `input type=search`;
    - el texto del botón es «Todos», o «N elegidos» si hay elegidos;
    - el panel se cierra con Escape y con clic fuera.
  - **Chips:** el `aria-label` del botón ✕ es `Quitar <Filtro>: <valor legible>`.
    - Para las tiendas, el valor es el nombre de `opciones.tiendas`.
    - Para los días, es el nombre del día.
    - Para el monto, es `$10 – $250.50`.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-filtros-ui.test.tsx`.
  Esperado: PASS.

- [ ] **Paso 5: commit.**

```bash
git add components/bi/filtros.tsx components/bi/selector-multiple.tsx tests/portal/bi-filtros-ui.test.tsx
git commit -m "BI F4: barra de filtros con los 17 de Zoho, chips y Limpiar"
```

---

### Tarea 7: tablero en pantalla (orquestador y bloques)

**Archivos:**
- Crear:
  - `components/bi/tablero-mexico.tsx`;
  - `components/bi/bloques-resumen.tsx` (bloques 1, 2 y 3);
  - `components/bi/bloques-tiendas.tsx` (bloques 4 y 5);
  - `components/bi/bloques-tiempo.tsx` (bloque 6);
  - `components/bi/bloques-productos.tsx` (bloques 7 y 8).
- Modificar: `app/(bi)/bi/the-coffee-mexico/page.tsx`
- Prueba: `tests/portal/bi-tablero-ui.test.tsx`

**Interfaces:**
- **Consume:**
  - `useLectura` de `components/sucursales/use-lectura.ts`;
  - las funciones de `lib/bi/bloques.ts`;
  - `FiltrosBi` (Tarea 6);
  - `leerUrl` y `escribirUrl`;
  - de `graficas.tsx`, `BarraApilada` y `Ranking`, más `PedidosPorHora` si su forma sirve para «venta por hora»; si
    no, una gráfica de columnas propia en `bloques-tiempo.tsx`, con las reglas de la cabecera de `graficas.tsx`;
  - de `piezas.tsx`: `Kpi`, `Tarjeta`, `Barra`, `Vacio` e `Insignia`;
  - de `formato.ts`: `dinero`, `numero` y `porcentaje`.
- **Produce:** `<TableroMexico />`, que lee `useSearchParams()` y escribe con `router.replace('?'+escribirUrl(f), { scroll: false })`.

**Comportamiento:**
- **Lecturas:** `useLectura<RespuestaTablero>('/api/bi/tablero?' + qs)` y
  `useLectura<RespuestaTendencias>('/api/bi/tendencias?' + qsSinFechas)`, sin `intervaloMs`. `qsSinFechas` quita
  `fr`, `desde`, `hasta` y `sem`, para que cambiar la fecha no vuelva a pedir las tendencias.
- **Encabezado de frescura:**
  - «Actualizado al corte de las HH:MM», con `ultimoCorte` en hora de CDMX y `horaDe` de `formato.ts`;
  - si `faltantes > 0` o hay incompletos, el aviso ámbar «Faltan N de M días de tienda (nunca se cuentan como cero)»;
  - si `rappiPendiente`, el aviso «Rappi de Zoho pendiente (F3): en tiendas sin el portal de Rappi falta su venta de
    Rappi».
- **Bloques 1 a 8**, como en la spec §4:
  - En el bloque 1, «Ventas Netas» lleva la nota `Cobrado: $X`.
  - El bloque 2 es una `Tarjeta` con «Disponible en F5: metas y punto de equilibrio».
  - En el bloque 4, las columnas de meta dicen «F5».
  - El bloque 7 muestra un selector de mes; por omisión, el más reciente. Muestra los 20 primeros y un botón «Ver
    todos».
  - El bloque 8 va en su propia `Tarjeta`, con estado de carga y de error independiente. Lleva la nota «Ignoran las
    fechas y las semanas, como en Zoho».
- **Error de lectura:** si `useLectura` trae `error` y `datos` de la misma clave, muestra las cifras con «No se pudo
  actualizar (hace N min)». Sin datos, muestra el error y un botón «Reintentar». Nunca muestra ceros.
- **`tablero: null`:** muestra el `Vacio` «Ninguna de tus tiendas pasa estos filtros».
- **Página:** `app/(bi)/bi/the-coffee-mexico/page.tsx` muestra el `Encabezado` y `<TableroMexico />` dentro de
  `<Suspense>`, porque usa `useSearchParams`. Lee la guía de Next en `node_modules/next/dist/docs/` sobre
  `useSearchParams` y Suspense antes de escribirla.

- [ ] **Paso 1: escribe la prueba que falla**, `tests/portal/bi-tablero-ui.test.tsx`. Mockea `next/navigation`
  (`useSearchParams` y `useRouter`) y `global.fetch`, con dos respuestas según la URL:

```tsx
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';

const replace = vi.fn();
vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('cafe=si'),
  useRouter: () => ({ replace }),
  usePathname: () => '/bi/the-coffee-mexico',
}));
import { TableroMexico } from '@/components/bi/tablero-mexico';

const tablero = {
  periodo: { desde: '2026-11-02', hasta: '2026-11-05' }, hoy: '2026-11-05',
  opciones: { tiendas: [{ company_id: 384, store_id: 301, nombre: 'Ventura', franquiciatario: null, tipo: 'Sucursales Propias' }],
    franquiciatarios: [], tipos: [], categorias: [], grupos: [], productos: [], pagos: [], semanas: [],
    ultimo_corte: '2026-11-05T21:10:00Z', tiendas_sin_rappi: 1 },
  tablero: {
    cargas: { esperados: 4, con_carga: 3, incompletos: 0 },
    kpis: { venta_cent: 30000, venta_bruta_cent: 31000, tickets: 4, lineas: 6, unidades: 7 },
    por_grupo: [], por_cafe: [], por_master: [], por_fecha: [], por_dia: [], por_hora: [], por_pago: [],
    por_pago_tienda: [], por_tienda_dia: [{ company_id: 384, dow: 1, venta_cent: 30000, tickets: 4 }],
    promociones: [], ranking: [], fuentes: [],
  },
};
beforeEach(() => {
  global.fetch = vi.fn(async (url: string) =>
    new Response(JSON.stringify(String(url).includes('tendencias')
      ? { hoy: '2026-11-05', tendencias: { por_mes: [], por_semana: [] } } : tablero), { status: 200 })) as never;
});

describe('<TableroMexico>', () => {
  it('pide el tablero con los filtros y pinta números clave y avisos', async () => {
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText('Ventas Netas')).toBeTruthy());
    expect((global.fetch as any).mock.calls.map((c: unknown[]) => String(c[0]))).toEqual(
      expect.arrayContaining(['/api/bi/tablero?cafe=si', '/api/bi/tendencias?cafe=si']));
    expect(screen.getByText(/Cobrado:/)).toBeTruthy();
    expect(screen.getByText(/Faltan 1 de 4 días de tienda/)).toBeTruthy();
    expect(screen.getByText(/Rappi de Zoho pendiente/)).toBeTruthy();
    expect(screen.getByText(/Disponible en F5/)).toBeTruthy();
    expect(screen.getByText('Ventura')).toBeTruthy();
  });

  it('sin tiendas que pasen los filtros: vacío claro, sin ceros', async () => {
    global.fetch = vi.fn(async () => new Response(JSON.stringify({ ...tablero, tablero: null }), { status: 200 })) as never;
    render(<TableroMexico />);
    await waitFor(() => expect(screen.getByText(/Ninguna de tus tiendas pasa estos filtros/)).toBeTruthy());
    expect(screen.queryByText('$0.00')).toBeNull();
  });
});
```

  Si `useLectura` usa `fetch` con `signal` y opciones, el mock acepta los argumentos extra; ya los ignora.

- [ ] **Paso 2: córrela y verifica que falla.**
  Corre: `npx vitest run tests/portal/bi-tablero-ui.test.tsx`.
  Esperado: FAIL, porque el módulo no existe.

- [ ] **Paso 3: implementa** el orquestador y los cuatro archivos de bloques. Cada bloque es un componente que recibe
  ya armado lo que produce `lib/bi/bloques.ts`; no calcula nada en la vista.

- [ ] **Paso 4: corre las pruebas.**
  Corre: `npx vitest run tests/portal/bi-tablero-ui.test.tsx tests/portal` y el `tsc` filtrado.
  Esperado: PASS.

- [ ] **Paso 5: revisión visual.**
  1. Agrega a `.claude/launch.json` la configuración del servidor de desarrollo si no existe.
  2. Abre `/bi/the-coffee-mexico` con `preview_start`. Requiere sesión; si el navegador no tiene sesión, pídela.
     Los datos reales solo aparecen después de que Sebastián aplique la 43 y dé el permiso `bi`.
  3. Revisa a 1400 px, a 375 px (sin scroll horizontal) y en modo noche.
  4. Si todavía no hay acceso, valida con la prueba de la UI y deja la revisión visual para el cotejo de la Tarea 8.

- [ ] **Paso 6: commit.**

```bash
git add components/bi "app/(bi)/bi/the-coffee-mexico/page.tsx" tests/portal/bi-tablero-ui.test.tsx
git commit -m "BI F4: tablero The Coffee México en pantalla (bloques 1–8)"
```

---

### Tarea 8: documentación, permisos y medición

**Archivos:**
- Crear: `docs/bi/03-TABLERO.md`
- Modificar: `docs/bi/02-CARGA.md`. En «Pendiente: la etiqueta de pago», marca que se resolvió en la 43.

- [ ] **Paso 1: escribe `docs/bi/03-TABLERO.md`** con:
  - **Qué es:** la ruta, los filtros y sus parámetros de URL (la tabla de la Tarea 3) y los bloques.
  - **Aplicar la 43:** en el SQL Editor, pegar `supabase/migrations/20261106000043_bi_tablero.sql` y registrarla en el
    mismo paso:
    ```sql
    insert into supabase_migrations.schema_migrations (version, name) values ('20261106000043','bi_tablero');
    ```
  - **Dar el permiso `bi`:** a quien ya tiene el módulo Sucursales con rol admin. Revísalo antes de correrlo:
    ```sql
    insert into public.perfil_modulos (user_id, modulo, nivel)
    select m.user_id, 'bi', 'lectura' from public.perfil_modulos m
    join public.perfiles p on p.user_id = m.user_id
    where m.modulo = 'sucursales' and p.rol = 'admin' and p.activo
    on conflict do nothing;
    ```
    Para una persona: `insert … values ('<user_id>', 'bi', 'lectura')`. Sus sucursales son las de `perfil_sucursales`.
  - **Medición de rendimiento:** con la sesión de un admin, en el SQL Editor, tiempo de
    `select public.bi_tablero('{"desde":"2026-01-01","hasta":"<hoy>","companias":[…79…]}')`. Escribe los tiempos y
    la regla: más de 3 s → índices; si no basta, el resumen diario (migración 44).
  - **Cotejo en pantalla:** en el piloto (tiendas 301, 432, 455, 477, 482 y 498), con tienda + semana + pago fijos, las
    cifras contra Zoho.
  - **Diferencias conocidas:**
    - Rappi de Zoho pendiente (F3);
    - margen del ranking en F4.1;
    - metas y P.E. en F5;
    - hora 0 inflada en Zoho.

- [ ] **Paso 2: verificación final.**
  - `npx vitest run`: solo puede fallar `tests/migracion/paridad.test.ts`;
  - `npx tsc --noEmit -p . 2>&1 | grep -v "^.next/"` debe salir vacío;
  - `npx next lint` o el lint del repo, si existe (`npm run lint`).

- [ ] **Paso 3: commit.**

```bash
git add docs/bi/03-TABLERO.md docs/bi/02-CARGA.md
git commit -m "Doc BI 03: tablero, permisos, migración 43 y medición"
```

---

## Cobertura de la spec

| Spec | Tarea |
|---|---|
| §2.1 Módulo y rutas | 2 |
| §2.2.1–2.2.3 Módulo `bi`, `bi_acceso`, `bi_tiendas_filtradas` | 1 |
| §2.2.4 Pago por fecha | 1 |
| §2.2.5 `bi_opciones` | 1 |
| §2.2.6 Registro de la migración | 8 |
| §2.3 Quién lo ve (SQL de permiso) | 8 |
| §3 URL | 3 |
| §3 Route handlers | 5 |
| §3 Cliente | 7 |
| §3 Armado | 4 |
| §4 Filtros | 6 |
| §4 Frescura | 1 y 7 |
| §4 Bloques | 4 y 7 |
| §4 Estilo de las gráficas | 7 |
| §5 Errores | 3, 5 y 7 |
| §6 Rendimiento | 8 |
| §7 Pruebas | 1–7 |
| §7 Prueba visual | 7 |
| §7 Cotejo en pantalla | 8 |

`por_fecha` no está en la spec, pero hace falta para «Ventas vs Transacciones por día». Va en la Tarea 1, en la
misma migración.
