# Comercializadora: Inicio, Envíos, Traspasos y Mapeo SKU (plan 3c)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traer al portal las cuatro pantallas de operación diaria de la Comercializadora que no dependen del motor de planeación:
- **Inicio:** el tablero del día.
- **Envíos:** la cola de pedidos por enviar.
- **Traspasos:** entre CEDIS y 3PL.
- **Mapeo SKU:** nombre de Shopify → SKU del catálogo.

Inicio además trae las tarjetas de Compras y Mermas de la pantalla KPIs.

**Architecture:** Igual que los planes 3 y 3b:
- route group `app/(comercializadora)`;
- server components que leen con la sesión;
- client components en `components/comercializadora/`;
- cálculos puros en `lib/comercializadora/`, portados del HTML viejo `a9e4a22` y con pruebas;
- escrituras en server actions con `editorCom()`.

Dos cosas nuevas:
- **Ventas y nombres de productos.** Inicio y Mapeo leen los pedidos del sitio viejo por el puente (`com_legado_*`). Solo `service_role` lee el puente, así que esas lecturas van en el servidor con la llave de servicio, en `lib/comercializadora/legado.ts`, y nunca con la sesión.
- **Ingreso de un traspaso.** Pasa a una función de Postgres, para que el cambio de estado y la suma al saldo del 3PL queden en una sola transacción.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind, Supabase (Postgres/RLS; PGlite en pruebas), Vitest + Testing Library, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas). Anteceden:
- plan 3: `2026-11-13-comercializadora-pantallas-compras.md` (PR #113);
- plan 3b: `2026-11-13-comercializadora-inventario-config.md` (PR #114).

Sigue el plan 3d: Planear (Plan de abastos, Esta semana, Todo lo demás, Importaciones, Café), Indicadores y DOH. Después, el plan 4: paridad y cutover.

## Decisiones (al planear, 2026-11-13)

1. **El bloque 3c original se divide (lo eligió el usuario).**
   - **Este plan:** las pantallas ligeras e independientes.
   - **Plan 3d:** el grupo Planear, **Indicadores** y **DOH**. Las tres usan `_kpiAbCalc`, que corre el motor de planeación del navegador (backtest `btProy`/`btReal`, `Heff`, OCs viejas). El servidor no guarda nada de eso (`com_minmax` no lo tiene), así que su lugar es junto al port del motor.
2. **Crédito Comercializadora y los KPIs del lado de pedidos se migran con Pedidos (lo eligió el usuario).** Esos KPIs son Fill rate, OTIF, entregas, encuestas y DSO. Leen y escriben `pedidos`, `pedido_incidencias`, `encuestas` y `com_credito_abonos` del sitio viejo. El puente es de solo lectura y no tiene esas columnas.
   - De la pantalla KPIs, en este plan solo entran las tarjetas que salen de tablas `com_*`: **OCs con arribo vencido, OCs abiertas, Lead time prometido y Mermas**. Van en Inicio.
3. **Ventas no se porta (lo eligió el usuario).** En el viejo no tiene entrada en el menú ni enlaces, y las OVs se crean solas al pagarse un pedido (`_comSyncPedidoPagado`). Envíos ya muestra las OVs.
4. **El puente se amplía con cuatro columnas de solo lectura**, que necesita Inicio:
   - `pedidos.monto` y `pedidos.shopify_order_number`;
   - `aperturas.sucursal` y `aperturas.contacto`.

   En bliocjvq el rol `portal_puente` tiene grants por columna, así que **antes** de la migración 49 hay que dar `grant select` de esas columnas. Es un cambio en la base vieja y requiere el OK del usuario (Tarea 7). No se agregan columnas de crédito: decisión 2.
5. **Ingreso de traspaso atómico** con `public.com_ingresar_traspaso(p_folio, p_recibido)` (security invoker):
   - marca las líneas `ordenado` → `ingresado`, guarda lo recibido y conserva lo ordenado en `cantidad_original`;
   - si el destino es el 3PL (`Yulius`), suma lo recibido a `saldo_yulius`;
   - todo o nada.

   El viejo lo hacía línea por línea y con lectura-modificación-escritura del saldo desde el navegador. Igual que el viejo, **no** resta del origen. Con destino CEDIS no toca el saldo (`COM_ZOHO_MANDA`) y se avisa "regístralo en Zoho".
6. **Reglas que se corrigen al portar** (el viejo tenía el defecto; cada una lleva prueba):
   - **Envíos:**
     - "por enviar" es `estado = 'por_enviar'`. El viejo usaba `estado !== 'enviado'`, así que mostraba y dejaba marcar los `cancelado`.
     - Las pestañas cuentan **folios**, no líneas.
   - **Traspasos:**
     - el origen y el destino deben ser distintos;
     - los SKUs deben existir en el catálogo;
     - la referencia no puede repetirse;
     - el folio sugerido usa el día de CDMX;
     - solo se elimina un traspaso **sin ingresar**, porque borrar uno ingresado dejaría el saldo del 3PL sumado sin su movimiento.
   - **Inicio:**
     - "hoy", los meses y los 30/90 días usan el día de CDMX; `fecha_pedido` (timestamptz) se pasa a su día de CDMX antes de agrupar por mes;
     - el conteo de "Inventario crítico" no se corta en 10 + 8, porque eso era un recorte de la lista del panel;
     - un solo semáforo para el % Compras/Ventas, en el KPI y en la tendencia: 45–55 verde, >55–65 ámbar, lo demás rojo. La barra del viejo ponía ámbar abajo de 45.
7. **Estados de OC iguales a la pantalla Órdenes.** OCs en tránsito, próximas, abiertas y vencidas se calculan con `agruparOcs`/`resumenOcs` del plan 3, es decir, por lo recibido (`cantidad_recibida`). No se usa el texto `estado` de la fila, como hacía el viejo en Inicio y KPIs. Así los números de Inicio coinciden con Órdenes.
8. **El panel "riesgo de quiebre" de Inicio llega con el plan 3d.** Depende del motor (decisión 1). En 3c el panel de inventario crítico muestra lo que no depende del motor:
   - urgente y pronto por días de inventario;
   - artículos sin stock;
   - "insuficiente para pedidos pendientes";
   - "stock bajo sin venta".
9. **Mapeo:** los nombres se guardan **exactos**. `serieDiaria` del servidor compara exacto; `minmax` normaliza a minúsculas. La lista se arma con la unión de los nombres ya mapeados y los de los últimos 500 pedidos (`items_editados || items`), como el viejo. Guardar es un upsert por `shopify_nombre`.
10. **Navegación:** un grupo nuevo, **Operación**, con Inicio, Envíos, Traspasos y Mapeo SKU. `/comercializadora` sigue siendo Qué pedir.

## Global Constraints

- Las de los planes 3 y 3b:
  - ruta `/comercializadora/*`;
  - acceso por `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` escriben);
  - día de CDMX (`hoyCdmx`);
  - piezas de `components/portal/piezas.tsx`, tablas `.tabla`, máximo 25 filas visibles o "Ver más";
  - montos MXN (`pesos`);
  - pruebas: `npm test`, `npm run typecheck` y prettier sobre lo tocado.
- Las acciones sin permiso responden `{ error: 'Tu acceso a Comercializadora es de solo lectura.' }` sin tocar la base.
- Migración nueva: `supabase/migrations/20261113000049_comercializadora_operacion.sql`. Se aplica en producción **solo con el OK del usuario**, igual que la 48: por `DATABASE_URL`, en una transacción, y registrada en `supabase_migrations.schema_migrations`. Antes van los grants de la decisión 4 en bliocjvq, también con OK.
- La llave de servicio (`SUPABASE_SECRET_KEY` o `SUPABASE_SERVICE_ROLE_KEY`) solo se usa en `lib/comercializadora/legado.ts`, que es server-only. Nunca llega al navegador.
- Mientras el viejo siga en Real, en producción no se marcan envíos, no se crean, ingresan ni eliminan traspasos, y no se editan mapeos durante la revisión: la copia en espejo los borraría.

## Review Focus

1. **El puente no responde, o falta la llave de servicio.** Inicio debe mostrar lo de `com_*` y un aviso claro en ventas y pedidos, sin números falsos ni pantalla rota. Mapeo debe mostrar los nombres ya mapeados con un aviso. Lo cubren las Tareas 2, 3 y 6.
2. **Dos personas ingresan el mismo traspaso, o uno ya ingresado.** El segundo recibe "ya se ingresó" y el 3PL no se suma dos veces (Tarea 1). Lo mismo para marcar enviado dos veces (Tarea 4).
3. **Pedidos cerca de medianoche o del cambio de mes.** Un pedido a las 21:00 de CDMX del día 31 cuenta en ese mes, aunque en UTC ya sea el día 1 (Tarea 3).
4. **Un usuario con `lectura` llama las acciones nuevas.** Debe recibir el error de solo lectura sin tocar la base (Tareas 4, 5 y 6).
5. **Datos sucios en `items` de pedidos y en cantidades:**
   - `items` como texto JSON, JSON inválido, o sin `nombre` o `precio`;
   - cantidades con coma o vacías al ingresar.

   No deben romper la pantalla ni sumar NaN (Tareas 3, 5 y 6).

---

### Task 1: Migración 49 — columnas del puente e ingreso de traspaso atómico

**Files:**
- Create: `supabase/migrations/20261113000049_comercializadora_operacion.sql`
- Create: `tests/db/comercializadora-operacion.test.ts`
- Modify: `tests/db/comercializadora-puente.test.ts` (lista de columnas de `com_legado_pedidos`)

**Interfaces:**
- Produces:
  - `com_legado_pedidos` agrega `monto numeric, shopify_order_number text`, al final.
  - `com_legado_aperturas` agrega `sucursal text, contacto text`, al final.
  - `public.com_ingresar_traspaso(p_folio text, p_recibido jsonb) returns integer`. `p_recibido` es `{ "<id de la línea>": cantidad }`; devuelve las líneas ingresadas.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/db/comercializadora-operacion.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

describe('migración 49', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into com_catalogo (sku, nombre, saldo_yulius, saldo_cedis) values ('A', 'Café', 10, 7), ('B', 'Vasos', null, 0);
      insert into com_movimientos (id, tipo, folio, sku, cantidad, cantidad_original, origen, destino, estado, fecha) values
        ('t1', 'traspaso', 'T-1', 'A', 5, 5, 'CEDIS', 'Yulius', 'ordenado', '2026-11-10'),
        ('t2', 'traspaso', 'T-1', 'B', 3, 3, 'CEDIS', 'Yulius', 'ordenado', '2026-11-10'),
        ('t3', 'traspaso', 'T-2', 'A', 4, 4, 'Yulius', 'CEDIS', 'ordenado', '2026-11-11');`);
  });

  const editor = async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    return id;
  };

  it('el puente expone monto, número de pedido, sucursal y contacto (solo service_role)', async () => {
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha, sucursal, contacto) values ('A1', 'abierta', '2026-01-01', 'Polanco', 'Ana');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, monto, shopify_order_number)
        values ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'pagado', '[]', 1500, '#1001');`);
    await db.exec('set role service_role');
    const p = await db.query<{ monto: string; shopify_order_number: string }>(
      'select monto, shopify_order_number from com_legado_pedidos');
    const a = await db.query<{ sucursal: string; contacto: string }>('select sucursal, contacto from com_legado_aperturas');
    await db.exec('reset role');
    expect(p.rows[0]).toEqual({ monto: '1500', shopify_order_number: '#1001' });
    expect(a.rows[0]).toEqual({ sucursal: 'Polanco', contacto: 'Ana' });
  });

  it('ingreso al 3PL: marca ingresado, guarda lo recibido y suma al saldo_yulius en una sola operación', async () => {
    const id = await editor();
    const n = await comoUsuario(db, id, async () =>
      num((await db.query<{ n: number }>(`select com_ingresar_traspaso('T-1', $1::jsonb) n`, [
        JSON.stringify({ t1: 4, t2: 3 }),
      ])).rows[0].n));
    expect(n).toBe(2);
    const m = await db.query(`select id, cantidad::float8 c, cantidad_original::float8 o, estado from com_movimientos where folio = 'T-1' order by id`);
    expect(m.rows).toEqual([
      { id: 't1', c: 4, o: 5, estado: 'ingresado' },
      { id: 't2', c: 3, o: 3, estado: 'ingresado' },
    ]);
    const s = await db.query<{ sku: string; y: number | null }>(`select sku, saldo_yulius::float8 y from com_catalogo order by sku`);
    expect(s.rows).toEqual([{ sku: 'A', y: 14 }, { sku: 'B', y: 3 }]);
  });

  it('un traspaso ya ingresado no se vuelve a sumar', async () => {
    const id = await editor();
    await comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })]));
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })])),
    ).rejects.toThrow(/ya se ingresó/);
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(15);
  });

  it('si falta una cantidad o es negativa, no se ingresa nada del traspaso', async () => {
    const id = await editor();
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5 })])),
    ).rejects.toThrow(/Falta la cantidad recibida de B/);
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: -1, t2: 3 })])),
    ).rejects.toThrow(/Falta la cantidad recibida de A/);
    const m = await db.query<{ estado: string }>(`select distinct estado from com_movimientos where folio = 'T-1'`);
    expect(m.rows).toEqual([{ estado: 'ordenado' }]);
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(10);
  });

  it('ingreso al CEDIS no toca saldos (el CEDIS lo manda Zoho)', async () => {
    const id = await editor();
    await comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-2', $1::jsonb)`, [JSON.stringify({ t3: 4 })]));
    const s = await db.query<{ c: number; y: number }>(`select saldo_cedis::float8 c, saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0]).toEqual({ c: 7, y: 10 });
    const m = await db.query<{ estado: string }>(`select estado from com_movimientos where id = 't3'`);
    expect(m.rows[0].estado).toBe('ingresado');
  });

  it('un usuario de solo lectura no puede ingresar', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await expect(
      comoUsuario(db, id, () => db.query(`select com_ingresar_traspaso('T-1', $1::jsonb)`, [JSON.stringify({ t1: 5, t2: 3 })])),
    ).rejects.toThrow();
    const s = await db.query<{ y: number }>(`select saldo_yulius::float8 y from com_catalogo where sku = 'A'`);
    expect(s.rows[0].y).toBe(10);
  });
});
```

En `tests/db/comercializadora-puente.test.ts`, cambiar la lista esperada de columnas:

```ts
    expect(cols.rows.map((f) => f.c)).toEqual([
      'id', 'apertura_id', 'fecha_pedido', 'status', 'items', 'items_editados', 'franquiciatario_email',
      'notas_shopify', 'es_llenado_canal', 'marketing_proyecto_id', 'monto', 'shopify_order_number',
    ]);
```

Y el título de esa prueba: `'service_role lee los pedidos del sitio viejo por las vistas, con las columnas de minmax e Inicio'`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/db/comercializadora-operacion.test.ts tests/db/comercializadora-puente.test.ts`
Expected: FAIL. Las columnas `monto`/`sucursal` no existen en `legado.*`, y `com_ingresar_traspaso` no existe.

- [ ] **Step 3: La migración**

Crear `supabase/migrations/20261113000049_comercializadora_operacion.sql`:

```sql
-- Comercializadora · plan 3c (decisiones 4 y 5).

-- 1. Puente: Inicio necesita el monto y el número de cada pedido, y la sucursal de su apertura. En bliocjvq el rol
--    portal_puente tiene grants por columna: el grant de estas cuatro va ANTES de aplicar esta migración
--    (docs/migracion/comercializadora.md, sección 10). En PGlite legado.* son tablas locales.
do $$
begin
  if exists (select 1 from pg_foreign_table ft join pg_class c on c.oid = ft.ftrelid
             join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'legado' and c.relname = 'pedidos') then
    alter foreign table legado.pedidos add column monto numeric, add column shopify_order_number text;
    alter foreign table legado.aperturas add column sucursal text, add column contacto text;
  else
    alter table legado.pedidos add column monto numeric, add column shopify_order_number text;
    alter table legado.aperturas add column sucursal text, add column contacto text;
  end if;
end $$;

-- Las columnas nuevas van al final: create or replace view solo permite agregar columnas al final, y conserva los grants.
create or replace view public.com_legado_pedidos with (security_invoker = true) as
  select id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
         es_llenado_canal, marketing_proyecto_id, monto, shopify_order_number
  from legado.pedidos;
create or replace view public.com_legado_aperturas with (security_invoker = true) as
  select id, estatus, fecha, sucursal, contacto from legado.aperturas;

-- 2. Ingreso de un traspaso en una sola transacción (_comGuardarIngreso sin la lectura-modificación-escritura del saldo
--    desde el navegador). Security invoker: la RLS de com_movimientos y com_catalogo (update) exige edición.
--    Solo líneas 'ordenado': un segundo ingreso del mismo folio no encuentra nada y aborta.
create function public.com_ingresar_traspaso(p_folio text, p_recibido jsonb) returns integer
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  r record;
  v_cant numeric;
  v_n integer := 0;
begin
  for r in
    select id, sku, cantidad, cantidad_original, destino
      from public.com_movimientos
     where tipo = 'traspaso' and folio = p_folio and estado = 'ordenado'
     order by id
       for update
  loop
    v_cant := (p_recibido ->> r.id)::numeric;
    if v_cant is null or v_cant < 0 then
      raise exception 'Falta la cantidad recibida de % (no puede ser negativa)', r.sku;
    end if;
    update public.com_movimientos
       set cantidad = v_cant, cantidad_original = coalesce(r.cantidad_original, r.cantidad), estado = 'ingresado'
     where id = r.id;
    -- Igual que el viejo: solo el 3PL se suma aquí; el CEDIS lo manda Zoho (COM_ZOHO_MANDA). El origen no se resta.
    if lower(coalesce(r.destino, '')) = 'yulius' and v_cant <> 0 then
      update public.com_catalogo
         set saldo_yulius = coalesce(saldo_yulius, 0) + v_cant, yulius_actualizado_at = now()
       where sku = r.sku;
    end if;
    v_n := v_n + 1;
  end loop;
  if v_n = 0 then
    raise exception 'El traspaso % ya se ingresó o no existe; recarga la página', p_folio;
  end if;
  return v_n;
end $$;
revoke all on function public.com_ingresar_traspaso(text, jsonb) from public, anon;
grant execute on function public.com_ingresar_traspaso(text, jsonb) to authenticated;
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/db/comercializadora-operacion.test.ts tests/db/comercializadora-puente.test.ts`
Expected: PASS (6 + 4).

Si la prueba de solo lectura no falla, es porque `for update` con RLS filtra las filas en lugar de dar error. En ese caso la función responde "ya se ingresó", así que la prueba debe pasar igual. Si no pasa, se revisa con superpowers:systematic-debugging; no se ajusta la prueba.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261113000049_comercializadora_operacion.sql tests/db/comercializadora-operacion.test.ts tests/db/comercializadora-puente.test.ts
git commit -m "feat(comercializadora): puente con monto y sucursal, e ingreso de traspaso atómico"
```

---

### Task 2: Lectura del puente en el servidor y base falsa con upsert/range/neq

**Files:**
- Create: `lib/comercializadora/legado.ts`
- Modify: `tests/portal/db-falsa.ts`
- Test: `tests/portal/com-legado.test.ts`

**Interfaces:**
- Consumes: `leerTodoCom` (`lib/comercializadora/consultas.ts`).
- Produces:
  - `servicioLegado(): SupabaseClient | null`
  - `type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string }`
  - `interface PedidoLegado { id: string; apertura_id: string | null; fecha_pedido: string | null; status: string | null; monto: number | null; items: unknown; items_editados: unknown; shopify_order_number: string | null }`
  - `interface AperturaLegado { id: string; sucursal: string | null; contacto: string | null }`
  - `pedidosLegado(filtro: (q: any) => any): Promise<Lectura<PedidoLegado[]>>`
  - `ultimosPedidosLegado(n: number): Promise<Lectura<Pick<PedidoLegado, 'items' | 'items_editados'>[]>>`
  - `aperturasLegado(ids: string[]): Promise<Lectura<AperturaLegado[]>>`
  - `SIN_PUENTE: string`
  - `dbFalsa` gana `upsert(d, { onConflict })`, `range(a, b)` y `neq(k, v)`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-legado.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.db }));
import { aperturasLegado, pedidosLegado, SIN_PUENTE, ultimosPedidosLegado } from '../../lib/comercializadora/legado';

const ped = (o: Record<string, unknown>) => ({
  id: 'p1', apertura_id: 'A1', fecha_pedido: '2026-11-02T18:00:00Z', status: 'pagado', monto: 100,
  items: [], items_editados: null, shopify_order_number: '#1', ...o,
});

describe('lectura del puente (solo servidor, llave de servicio)', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
  });
  afterEach(() => vi.unstubAllEnvs());

  it('sin llave de servicio no lee y lo dice claro', async () => {
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await pedidosLegado((q) => q)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('lee los pedidos con el filtro y pagina', async () => {
    m.db = dbFalsa({ com_legado_pedidos: [ped({}), ped({ id: 'p2', status: 'cancelado' })] }).db;
    const r = await pedidosLegado((q) => q.neq('status', 'cancelado'));
    expect(r).toEqual({ ok: true, datos: [ped({})] });
  });

  it('si el puente falla, responde el aviso y no lanza', async () => {
    m.db = dbFalsa({}, [{ tabla: 'com_legado_pedidos', op: 'select' }]).db;
    expect(await pedidosLegado((q) => q)).toEqual({ ok: false, error: SIN_PUENTE });
    expect(await ultimosPedidosLegado(10)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('últimos pedidos (con tope) y aperturas por id', async () => {
    m.db = dbFalsa({
      com_legado_pedidos: [ped({}), ped({ id: 'p2' }), ped({ id: 'p3' })],
      com_legado_aperturas: [{ id: 'A1', sucursal: 'Polanco', contacto: 'Ana' }, { id: 'A2', sucursal: null, contacto: 'Luis' }],
    }).db;
    const u = await ultimosPedidosLegado(2);
    expect(u.ok && u.datos.length).toBe(2);
    expect(await aperturasLegado(['A2'])).toEqual({ ok: true, datos: [{ id: 'A2', sucursal: null, contacto: 'Luis' }] });
    expect(await aperturasLegado([])).toEqual({ ok: true, datos: [] });
  });
});

describe('dbFalsa: upsert, range y neq', () => {
  it('upsert inserta o actualiza por la llave de conflicto', async () => {
    const f = dbFalsa({ t: [{ id: '1', k: 'a', v: 1 }] });
    await f.db.from('t').upsert({ k: 'a', v: 2 }, { onConflict: 'k' });
    await f.db.from('t').upsert({ k: 'b', v: 3 }, { onConflict: 'k' });
    expect(f.tablas.t.map((x) => [x.k, x.v])).toEqual([['a', 2], ['b', 3]]);
  });
  it('range devuelve la página pedida', async () => {
    const f = dbFalsa({ t: [{ id: '1' }, { id: '2' }, { id: '3' }] });
    const r = (await f.db.from('t').select('*').range(1, 2)) as { data: { id: string }[] };
    expect(r.data.map((x) => x.id)).toEqual(['2', '3']);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-legado.test.ts`
Expected: FAIL. `legado.ts` no existe, y `dbFalsa` no tiene `upsert`/`range`/`neq`.

- [ ] **Step 3: Implementar**

En `tests/portal/db-falsa.ts`:
- agregar `let desde = 0;` y `let conflicto = 'id';` junto a `let tope = Infinity;`;
- en `ejecutar`, antes de `if (op === 'update')`, agregar la rama `upsert`;
- cambiar el corte de `select`;
- agregar los métodos.

```ts
      if (op === 'upsert') {
        const filas = (Array.isArray(datos) ? datos : [datos]) as Fila[];
        const res = filas.map((d) => {
          const ya = t.find((f) => String(f[conflicto]) === String(d[conflicto]));
          if (ya) return Object.assign(ya, d);
          const nueva = { id: String(sec++), ...d };
          t.push(nueva);
          return nueva;
        });
        return { data: res, error: null };
      }
```

```ts
      const c = coinciden()
        .slice(desde, desde + tope)
        .map((f) => structuredClone(f));
```

```ts
      upsert: (d: unknown, o?: { onConflict?: string }) => (
        (op = 'upsert'), (datos = d), (conflicto = o?.onConflict ?? 'id'), q
      ),
      neq: (k: string, v: unknown) => (filtros.push((f) => String(f[k]) !== String(v)), q),
      range: (a: number, b: number) => ((desde = a), (tope = b - a + 1), q),
```

Y en el comentario de arriba del archivo, agregar `upsert/range/neq` a la lista de la API.

Crear `lib/comercializadora/legado.ts`:

```ts
import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { leerTodoCom } from './consultas';

/**
 * Las vistas com_legado_* (puente a bliocjvq, plan 2 decisión 2) solo las lee service_role: se leen aquí, en el
 * servidor, con la llave de servicio. Nunca con la sesión del usuario ni desde el navegador.
 */
export function servicioLegado(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export type Lectura<T> = { ok: true; datos: T } | { ok: false; error: string };
export const SIN_PUENTE = 'No se pudieron leer los pedidos del sitio viejo. Intenta de nuevo en unos minutos.';

export interface PedidoLegado {
  id: string;
  apertura_id: string | null;
  fecha_pedido: string | null;
  status: string | null;
  monto: number | null;
  items: unknown;
  items_editados: unknown;
  shopify_order_number: string | null;
}
export interface AperturaLegado {
  id: string;
  sucursal: string | null;
  contacto: string | null;
}

const COLUMNAS = 'id,apertura_id,fecha_pedido,status,monto,items,items_editados,shopify_order_number';

/** Todos los pedidos que pasan el filtro, paginados de 1000 en 1000 (como _fetchAllRows). */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function pedidosLegado(filtro: (q: any) => any): Promise<Lectura<PedidoLegado[]>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    return { ok: true, datos: await leerTodoCom<PedidoLegado>(db, 'com_legado_pedidos', COLUMNAS, 'id', filtro) };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Los n pedidos más recientes, solo sus artículos (renderComMapeo: limit 500 por fecha_pedido). */
export async function ultimosPedidosLegado(
  n: number,
): Promise<Lectura<Pick<PedidoLegado, 'items' | 'items_editados'>[]>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    const r = await db
      .from('com_legado_pedidos')
      .select('items,items_editados')
      .order('fecha_pedido', { ascending: false })
      .limit(n);
    if (r.error) return { ok: false, error: SIN_PUENTE };
    return { ok: true, datos: (r.data ?? []) as Pick<PedidoLegado, 'items' | 'items_editados'>[] };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Sucursal y contacto de las aperturas de unos pedidos (aperturas(sucursal,contacto) del viejo). */
export async function aperturasLegado(ids: string[]): Promise<Lectura<AperturaLegado[]>> {
  if (!ids.length) return { ok: true, datos: [] };
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    const r = await db.from('com_legado_aperturas').select('id,sucursal,contacto').in('id', ids);
    if (r.error) return { ok: false, error: SIN_PUENTE };
    return { ok: true, datos: (r.data ?? []) as AperturaLegado[] };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}
```

Nota: se usa `||` y no `??` en las variables de entorno, para que una variable vacía cuente como faltante. La prueba "sin llave" lo fija.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-legado.test.ts && npx vitest run tests/portal`
Expected: PASS. Las pruebas existentes de `tests/portal` siguen verdes con los cambios de `dbFalsa`.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/legado.ts tests/portal/db-falsa.ts tests/portal/com-legado.test.ts
git commit -m "feat(comercializadora): lectura del puente en el servidor con la llave de servicio"
```

---

### Task 3: Inicio — cálculos, pantalla y tarjetas de Compras y Mermas

**Files:**
- Create: `lib/comercializadora/inicio.ts`
- Create: `components/comercializadora/inicio.tsx`
- Create: `app/(comercializadora)/comercializadora/inicio/page.tsx`
- Test: `tests/portal/com-inicio.test.ts`, `tests/portal/com-inicio-pantalla.test.tsx`

**Interfaces:**
- Consumes:
  - `saldoCedis` (`quepedir.ts`), `comprometido` (`inventario.ts`);
  - `agruparOcs`, `resumenOcs`, `MovCompra`, `OcGrupo`, `textoDestino` (`ordenes.ts`);
  - `difDias`, `masDias`, `hoyCdmx`, `fechaCorta` (`fechas.ts`);
  - `pedidosLegado`, `aperturasLegado`, `PedidoLegado` (Tarea 2).
- Produces (`lib/comercializadora/inicio.ts`):
  - `type Tono = 'ok' | 'bajo' | 'pierde' | 'neutro'`
  - `diaCdmx(iso: string): string`
  - `montoPedido(p: { monto: unknown; items: unknown }): number`
  - `montoOcsOperativas(filas: { folio: string | null; monto: number | null; sku: string }[], categoria: Record<string, string | null>): { monto: number; folios: number }`
  - `pctCompras(compras: number, ventas: number): { pct: number | null; tono: Tono; texto: string }`
  - `mesesHasta(hoy: string, n: number): string[]`
  - `tendencia(hoy, pedidos, compras: MovCompra[], categoria): FilaTendencia[]`
  - `ocsProximas(grupos: OcGrupo[], hoy): { folios: string[]; monto: number }`
  - `enTransito(grupos: OcGrupo[]): OcGrupo[]`
  - `ventaDiaria(...)`, `estadoDoh(...)`, `resumenInventario(...)`
  - `salidas30(ventas: VentaMov[], hoy): { folios: number; uds: number }`
  - `leadTimePrometido(grupos: OcGrupo[]): { dias: number | null; ocs: number }`
  - `porcentajeMermas(mermas, catalogo): { pct: number | null; n: number }`
  - `relativo(fecha: string | null, hoy: string): string`
  - `ESTADOS_PEDIDO`
  - `armarInicio(d: DatosInicio): ResultadoInicio`
  - Tipos `ArticuloInicio`, `VentaMov`, `FilaTendencia`, `DatosInicio`, `ResultadoInicio`, `PedidoActivo`.

- [ ] **Step 1: Pruebas que fallan (cálculos)**

Crear `tests/portal/com-inicio.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  armarInicio,
  diaCdmx,
  enTransito,
  estadoDoh,
  leadTimePrometido,
  mesesHasta,
  montoOcsOperativas,
  montoPedido,
  ocsProximas,
  pctCompras,
  porcentajeMermas,
  relativo,
  resumenInventario,
  salidas30,
  tendencia,
  ventaDiaria,
} from '../../lib/comercializadora/inicio';
import { agruparOcs, type MovCompra } from '../../lib/comercializadora/ordenes';
import { fechaCorta } from '../../lib/comercializadora/fechas';

const compra = (o: Partial<MovCompra>): MovCompra => ({
  id: String(Math.random()), folio: 'F1', fecha: '2026-11-01', sku: 'x', cantidad: 5, cantidad_recibida: 0,
  monto: null, destino: 'CEDIS', fecha_arribo: null, proveedor: 'P', estado: null, ...o,
});
const art = (o: Record<string, unknown>) => ({
  sku: 'A', nombre: 'Café', estatus: 'Activo', categoria: 'Insumos', created_at: null, costo_unitario: null,
  saldo_cedis: 0, zoho_stock: null, zoho_stock_fisico: null, zoho_sync_at: null, ...o,
});
const venta = (o: Record<string, unknown>) => ({
  folio: 'V1', sku: 'A', cantidad: 1, estado: 'enviado', fecha_envio: '2026-11-10', ...o,
});

describe('Inicio: dinero (port de renderComInicio)', () => {
  it('_pedMonto: monto si es > 0; si no, Σ precio × cantidad de los items (también como texto JSON)', () => {
    expect(montoPedido({ monto: 500, items: [] })).toBe(500);
    expect(montoPedido({ monto: 0, items: '[{"precio":"10.5","cantidad":2},{"precio":3,"cantidad":1}]' })).toBe(24);
    expect(montoPedido({ monto: null, items: 'no es json' })).toBe(0);
    expect(montoPedido({ monto: null, items: [{ nombre: 'x' }] })).toBe(0);
  });

  it('_montoOCsPorFolio: un monto por folio (el último no nulo), sin folios de Equipo; cuenta folios distintos', () => {
    const filas = [
      { folio: 'A', monto: 100, sku: 'x' },
      { folio: 'A', monto: null, sku: 'y' },
      { folio: 'B', monto: 50, sku: 'eq' },
      { folio: 'C', monto: 30, sku: 'x' },
      { folio: 'C', monto: 40, sku: 'x' },
      { folio: null, monto: 9, sku: 'x' },
    ];
    expect(montoOcsOperativas(filas, { x: 'Insumos', y: 'Insumos', eq: 'Equipo' })).toEqual({ monto: 140, folios: 3 });
  });

  it('% Compras/Ventas: 45–55 verde, >55–65 ámbar, lo demás rojo; sin ventas = sin dato', () => {
    expect(pctCompras(50, 100)).toMatchObject({ pct: 50, tono: 'ok' });
    expect(pctCompras(60, 100)).toMatchObject({ pct: 60, tono: 'bajo' });
    expect(pctCompras(70, 100)).toMatchObject({ pct: 70, tono: 'pierde' });
    expect(pctCompras(40, 100)).toMatchObject({ pct: 40, tono: 'pierde' });
    expect(pctCompras(10, 0)).toMatchObject({ pct: null, tono: 'neutro', texto: 'Sin datos suficientes' });
  });

  it('meses: los 5 que terminan en el mes de hoy, cruzando el año', () => {
    expect(mesesHasta('2026-02-10', 5)).toEqual(['2025-10', '2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it('día de CDMX: un pedido a las 21:00 del 31 de oct en CDMX cuenta en octubre aunque en UTC sea 1 de nov', () => {
    expect(diaCdmx('2026-11-01T03:00:00Z')).toBe('2026-10-31');
    expect(diaCdmx('2026-11-05')).toBe('2026-11-05');
  });

  it('tendencia: ventas por día de CDMX, compras operativas por fecha de la OC, conteos del mes', () => {
    const t = tendencia(
      '2026-11-13',
      [
        { fecha_pedido: '2026-11-01T03:00:00Z', monto: 100, items: null },
        { fecha_pedido: '2026-11-02T18:00:00Z', monto: 200, items: null },
      ],
      [compra({ folio: 'A', monto: 50, fecha: '2026-11-05' })],
      { x: 'Insumos' },
    );
    expect(t).toHaveLength(5);
    expect(t[4]).toMatchObject({ mes: '2026-11', etiqueta: 'Nov 26', ventas: 200, compras: 50, pct: 25, tono: 'pierde', pedidos: 1, ocs: 1, sinMonto: false, actual: true });
    expect(t[3]).toMatchObject({ mes: '2026-10', ventas: 100, compras: 0, pct: 0, actual: false });
  });

  it('compras del mes sin monto capturado se señalan', () => {
    const t = tendencia('2026-11-13', [], [compra({ folio: 'A', monto: null, fecha: '2026-11-05' })], {});
    expect(t[4]).toMatchObject({ compras: 0, ocs: 1, sinMonto: true });
  });
});

describe('Inicio: compras', () => {
  const hoy = '2026-11-13';
  const grupos = agruparOcs([
    compra({ folio: 'F1', fecha_arribo: '2026-11-16', monto: 100 }),
    compra({ folio: 'F2', fecha_arribo: '2026-11-23', monto: 70 }),
    compra({ folio: 'F3', fecha_arribo: '2026-11-15', cantidad_recibida: 5 }),
    compra({ folio: 'F4', fecha_arribo: '2026-11-12' }),
    compra({ folio: 'F5', fecha_arribo: null }),
  ]);

  it('OCs próximas: sin recibir y con arribo entre hoy y hoy + 7', () => {
    expect(ocsProximas(grupos, hoy)).toEqual({ folios: ['F1'], monto: 100 });
  });

  it('en tránsito: sin recibir, por fecha de arribo y las sin fecha al final', () => {
    expect(enTransito(grupos).map((g) => g.folio)).toEqual(['F4', 'F1', 'F2', 'F5']);
  });

  it('lead time prometido: promedio de arribo − emisión de las OCs con ambas fechas, redondeado', () => {
    const g = agruparOcs([
      compra({ folio: 'A', fecha: '2026-11-01', fecha_arribo: '2026-11-11' }),
      compra({ folio: 'B', fecha: '2026-11-01', fecha_arribo: '2026-11-06' }),
      compra({ folio: 'C', fecha: '2026-11-01', fecha_arribo: null }),
    ]);
    expect(leadTimePrometido(g)).toEqual({ dias: 8, ocs: 2 });
    expect(leadTimePrometido([])).toEqual({ dias: null, ocs: 0 });
  });

  it('fecha relativa del arribo', () => {
    expect(relativo('2026-11-13', hoy)).toBe('Hoy');
    expect(relativo('2026-11-14', hoy)).toBe('Mañana');
    expect(relativo('2026-11-11', hoy)).toBe('Hace 2 d');
    expect(relativo('2026-11-18', hoy)).toBe(fechaCorta('2026-11-18'));
    expect(relativo(null, hoy)).toBe('—');
  });
});

describe('Inicio: inventario', () => {
  it('estado por días de inventario: urgente ≤ LT, pronto ≤ max(2·LT, 14); LT por omisión 7; sin venta < 0.01', () => {
    expect(estadoDoh(0, 0.005, 5)).toBe('sin_venta');
    expect(estadoDoh(10, 2, 5)).toBe('urgente');
    expect(estadoDoh(20, 2, 5)).toBe('pronto');
    expect(estadoDoh(30, 2, 5)).toBe('ok');
    expect(estadoDoh(14, 2, undefined)).toBe('urgente');
  });

  it('venta diaria: enviados de 90 días entre min(90, días de vida)', () => {
    expect(ventaDiaria({ sku: 'A', created_at: '2026-11-03T12:00:00Z' }, { A: 30 }, '2026-11-13')).toBe(3);
    expect(ventaDiaria({ sku: 'A', created_at: null }, { A: 180 }, '2026-11-13')).toBe(2);
    expect(ventaDiaria({ sku: 'B', created_at: null }, { A: 180 }, '2026-11-13')).toBe(0);
  });

  it('sin stock, críticos (sin tope), faltantes vs comprometido y stock bajo sin venta; ignora inactivos', () => {
    const r = resumenInventario({
      hoy: '2026-11-13',
      catalogo: [
        art({ sku: 'A', saldo_cedis: 0 }),
        art({ sku: 'B', saldo_cedis: 5 }),
        art({ sku: 'C', saldo_cedis: 4 }),
        art({ sku: 'D', saldo_cedis: 10 }),
        art({ sku: 'E', saldo_cedis: 0, estatus: 'Inactivo' }),
      ] as never,
      ventas90: [venta({ sku: 'D', cantidad: 180 }), venta({ sku: 'D', cantidad: 50, estado: 'por_enviar' })],
      porEnviar: [venta({ sku: 'B', cantidad: 8, estado: 'por_enviar' }), venta({ sku: 'A', cantidad: 2, estado: 'por_enviar' })],
      leadTimes: [{ sku: 'D', dias: 5 }],
    });
    expect(r.sinStock.map((x) => [x.sku, x.comprometido])).toEqual([['A', 2]]);
    expect(r.criticos).toBe(1);
    expect(r.faltantes).toEqual([expect.objectContaining({ sku: 'B', saldo: 5, comprometido: 8, faltante: 3 })]);
    expect(r.stockBajo.map((x) => x.sku)).toEqual(['C']); // B (5 piezas) queda fuera: ya está en faltantes
    expect(r.cedisTotal).toBe(19);
    expect(r.activos).toBe(4);
  });

  it('salidas de 30 días: folios distintos y piezas enviadas', () => {
    expect(
      salidas30(
        [
          venta({ folio: 'V1', cantidad: 3, fecha_envio: '2026-11-03' }),
          venta({ folio: 'V1', cantidad: 2, fecha_envio: '2026-11-03' }),
          venta({ folio: 'V2', cantidad: 9, fecha_envio: '2026-10-01' }),
          venta({ folio: 'V3', cantidad: 4, estado: 'por_enviar', fecha_envio: '2026-11-12' }),
        ],
        '2026-11-13',
      ),
    ).toEqual({ folios: 1, uds: 5 });
  });

  it('mermas: |cantidad| × costo del momento ÷ valor del inventario CEDIS, a 2 decimales', () => {
    const cat = [art({ sku: 'A', saldo_cedis: 10, costo_unitario: 100 }), art({ sku: 'B', saldo_cedis: 5 })] as never;
    expect(porcentajeMermas([{ cantidad: -2, costo_unitario_momento: 50 }, { cantidad: -1, costo_unitario_momento: null }], cat))
      .toEqual({ pct: 10, n: 2 });
    expect(porcentajeMermas([], [art({ saldo_cedis: 0 })] as never)).toEqual({ pct: null, n: 0 });
  });

  it('armarInicio junta todo con los conteos de compras de la pantalla Órdenes', () => {
    const r = armarInicio({
      hoy: '2026-11-13',
      catalogo: [art({ sku: 'x', saldo_cedis: 3 })] as never,
      porEnviar: [],
      ventas90: [],
      compras: [compra({ folio: 'F1', fecha_arribo: '2026-11-10', monto: 10, fecha: '2026-11-02' })],
      leadTimes: [],
      mermas: [],
      pedidos: [{ fecha_pedido: '2026-11-05T18:00:00Z', monto: 40, items: null }],
    });
    expect(r.compras).toMatchObject({ abiertas: 1, atrasadas: 1 });
    expect(r.mes).toMatchObject({ ventas: 40, compras: 10, pct: 25 });
    expect(r.transito.map((g) => g.folio)).toEqual(['F1']);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-inicio.test.ts`
Expected: FAIL (`inicio.ts` no existe).

- [ ] **Step 3: Implementar `lib/comercializadora/inicio.ts`**

```ts
import { difDias, fechaCorta, hoyCdmx, masDias } from './fechas';
import { comprometido } from './inventario';
import { agruparOcs, resumenOcs, type MovCompra, type OcGrupo } from './ordenes';
import { saldoCedis } from './quepedir';
import type { ArticuloCatalogo } from './tipos';

export type Tono = 'ok' | 'bajo' | 'pierde' | 'neutro';
const n = (x: unknown) => Number(x) || 0;

export interface ArticuloInicio extends ArticuloCatalogo {
  estatus: string | null;
  categoria: string | null;
  created_at: string | null;
}
export interface VentaMov {
  folio: string | null;
  sku: string;
  cantidad: number | null;
  estado: string | null;
  fecha_envio: string | null;
}
export interface PedidoMonto {
  fecha_pedido: string | null;
  monto: unknown;
  items: unknown;
}

/** Día de CDMX de un timestamptz (el viejo comparaba el ISO en UTC). Una fecha sin hora se deja igual. */
export const diaCdmx = (iso: string) => (/^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : hoyCdmx(new Date(iso)));

/** _pedMonto: monto si es > 0; si no, Σ precio × cantidad de los items (pueden venir como texto JSON). */
export function montoPedido(p: { monto: unknown; items: unknown }): number {
  if (n(p.monto) > 0) return Number(p.monto);
  try {
    const its = typeof p.items === 'string' ? JSON.parse(p.items) : p.items;
    if (Array.isArray(its))
      return its.reduce((s: number, it) => s + (parseFloat(it?.precio ?? 0) || 0) * n(it?.cantidad), 0);
  } catch {
    // JSON inválido: el pedido cuenta 0, como el viejo.
  }
  return 0;
}

/**
 * _montoOCsPorFolio(rows, true): el monto va en una fila del folio (gana el último no nulo); fuera los folios con
 * algún artículo de categoría Equipo (H-60: un equipo no es gasto operativo). `folios` = OCs distintas del periodo.
 */
export function montoOcsOperativas(
  filas: { folio: string | null; monto: number | null; sku: string }[],
  categoria: Record<string, string | null>,
): { monto: number; folios: number } {
  const monto = new Map<string, number>();
  const equipo = new Set<string>();
  const folios = new Set<string>();
  for (const r of filas) {
    if (!r.folio) continue;
    folios.add(r.folio);
    if (r.monto) monto.set(r.folio, Number(r.monto));
    if (categoria[r.sku] === 'Equipo') equipo.add(r.folio);
  }
  let total = 0;
  for (const [f, v] of monto) if (!equipo.has(f)) total += v;
  return { monto: total, folios: folios.size };
}

/** % Compras/Ventas (decisión 6: un solo semáforo para el KPI y la tendencia). */
export function pctCompras(compras: number, ventas: number): { pct: number | null; tono: Tono; texto: string } {
  const pct = ventas > 0 ? Math.round((compras / ventas) * 100) : null;
  if (pct === null) return { pct, tono: 'neutro', texto: 'Sin datos suficientes' };
  if (pct >= 45 && pct <= 55) return { pct, tono: 'ok', texto: 'Rango óptimo (45–55 %)' };
  if (pct > 55 && pct <= 65) return { pct, tono: 'bajo', texto: 'Por encima: revisar' };
  return { pct, tono: 'pierde', texto: 'Fuera de rango' };
}

/** Los n meses (YYYY-MM) que terminan en el mes de hoy. */
export function mesesHasta(hoy: string, cuantos: number): string[] {
  const [a, m] = hoy.split('-').map(Number);
  return Array.from({ length: cuantos }, (_, i) =>
    new Date(Date.UTC(a, m - 1 - (cuantos - 1 - i), 1)).toISOString().slice(0, 7),
  );
}

const MES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
export interface FilaTendencia {
  mes: string;
  etiqueta: string;
  ventas: number;
  compras: number;
  pct: number | null;
  tono: Tono;
  texto: string;
  pedidos: number;
  ocs: number;
  sinMonto: boolean;
  actual: boolean;
}

/** Tendencia de 5 meses de renderComInicio; el último es el mes en curso (sus KPIs financieros). */
export function tendencia(
  hoy: string,
  pedidos: PedidoMonto[],
  compras: MovCompra[],
  categoria: Record<string, string | null>,
): FilaTendencia[] {
  const meses = mesesHasta(hoy, 5);
  return meses.map((mes, i) => {
    const ped = pedidos.filter((p) => p.fecha_pedido && diaCdmx(p.fecha_pedido).startsWith(mes));
    const filas = compras.filter((r) => String(r.fecha ?? '').startsWith(mes));
    const ventas = ped.reduce((s, p) => s + montoPedido(p), 0);
    const c = montoOcsOperativas(filas, categoria);
    return {
      mes,
      etiqueta: `${MES[Number(mes.slice(5)) - 1]} ${mes.slice(2, 4)}`,
      ventas,
      compras: c.monto,
      ...pctCompras(c.monto, ventas),
      pedidos: ped.length,
      ocs: c.folios,
      sinMonto: c.monto === 0 && filas.length > 0,
      actual: i === meses.length - 1,
    };
  });
}

/** OCs con arribo en los próximos 7 días (agrupadas por folio, sin recibir). */
export function ocsProximas(grupos: OcGrupo[], hoy: string) {
  const fin = masDias(hoy, 7);
  const g = grupos.filter((x) => {
    const a = x.fecha_arribo?.slice(0, 10);
    return x.estado !== 'recibida' && !!a && a >= hoy && a <= fin;
  });
  return { folios: g.map((x) => x.folio), monto: g.reduce((s, x) => s + x.monto, 0) };
}

/** OCs en tránsito: sin recibir, por fecha de arribo (las que no tienen fecha, al final). */
export const enTransito = (grupos: OcGrupo[]) =>
  grupos
    .filter((g) => g.estado !== 'recibida')
    .sort((a, b) => String(a.fecha_arribo ?? '9').localeCompare(String(b.fecha_arribo ?? '9')));

/** _promDiario: enviados de 90 días ÷ min(90, días de vida del artículo); sin fecha de alta, 90. */
export function ventaDiaria(c: { sku: string; created_at: string | null }, enviados: Record<string, number>, hoy: string) {
  const vida = c.created_at ? Math.max(1, difDias(diaCdmx(c.created_at), hoy)) : 90;
  return n(enviados[c.sku]) / Math.min(90, vida);
}

/** dohSem de renderComInicio. */
export function estadoDoh(saldo: number, venta: number, lt: number | undefined) {
  if (venta < 0.01) return 'sin_venta' as const;
  const doh = saldo / venta;
  const l = lt || 7;
  return doh <= l ? ('urgente' as const) : doh <= Math.max(2 * l, 14) ? ('pronto' as const) : ('ok' as const);
}

export interface FilaInv {
  sku: string;
  nombre: string;
  saldo: number;
  venta: number;
  comprometido: number;
  faltante: number;
}

/** Paneles de inventario de Inicio (decisiones 6 y 8: el conteo de críticos no se corta). */
export function resumenInventario(d: {
  hoy: string;
  catalogo: ArticuloInicio[];
  ventas90: VentaMov[];
  porEnviar: VentaMov[];
  leadTimes: { sku: string; dias: number | null }[];
}) {
  const activos = d.catalogo.filter((c) => c.estatus !== 'Inactivo');
  const enviados: Record<string, number> = {};
  for (const v of d.ventas90) if (v.estado === 'enviado') enviados[v.sku] = (enviados[v.sku] ?? 0) + n(v.cantidad);
  const lt = Object.fromEntries(d.leadTimes.map((l) => [l.sku, n(l.dias)]));
  const comp = comprometido(d.porEnviar.map((v) => ({ sku: v.sku, cantidad: n(v.cantidad) })));
  const filas = activos.map((c) => {
    const saldo = saldoCedis(c);
    const venta = ventaDiaria(c, enviados, d.hoy);
    const cmp = n(comp[c.sku]);
    return {
      sku: c.sku,
      nombre: c.nombre ?? c.sku,
      saldo,
      venta,
      comprometido: cmp,
      faltante: saldo > 0 && saldo - cmp < 0 ? cmp - saldo : 0,
      doh: estadoDoh(saldo, venta, lt[c.sku]),
    };
  });
  const criticos = new Set(filas.filter((f) => f.doh === 'urgente' || f.doh === 'pronto').map((f) => f.sku));
  const faltantes = filas.filter((f) => f.faltante > 0 && !criticos.has(f.sku)).sort((a, b) => b.faltante - a.faltante);
  const conFaltante = new Set(filas.filter((f) => f.faltante > 0).map((f) => f.sku));
  const stockBajo = filas
    .filter((f) => f.saldo > 0 && f.saldo <= 10 && !criticos.has(f.sku) && !conFaltante.has(f.sku) && f.venta < 0.01)
    .sort((a, b) => a.saldo - b.saldo);
  const quitarDoh = ({ doh: _d, ...f }: (typeof filas)[number]): FilaInv => f;
  return {
    sinStock: filas.filter((f) => f.saldo === 0).map(quitarDoh),
    criticos: criticos.size,
    faltantes: faltantes.map(quitarDoh),
    stockBajo: stockBajo.map(quitarDoh),
    cedisTotal: filas.reduce((s, f) => s + f.saldo, 0),
    activos: activos.length,
  };
}

/** Salidas de 30 días: OVs enviadas con fecha de envío desde hoy − 30. */
export function salidas30(ventas: VentaMov[], hoy: string) {
  const desde = masDias(hoy, -30);
  const v = ventas.filter((m) => m.estado === 'enviado' && String(m.fecha_envio ?? '') >= desde);
  return { folios: new Set(v.map((m) => m.folio).filter(Boolean)).size, uds: v.reduce((s, m) => s + n(m.cantidad), 0) };
}

/** Lead time prometido (KPIs · Compras): promedio de arribo − emisión, en días, de las OCs con ambas fechas. */
export function leadTimePrometido(grupos: OcGrupo[]) {
  const d = grupos
    .filter((g) => g.fecha && g.fecha_arribo)
    .map((g) => difDias(String(g.fecha).slice(0, 10), String(g.fecha_arribo).slice(0, 10)));
  return { dias: d.length ? Math.round(d.reduce((a, b) => a + b, 0) / d.length) : null, ocs: d.length };
}

/** Mermas (%) de KPIs: Σ|cantidad| × costo del momento ÷ valor del inventario CEDIS (saldo × costo), 2 decimales. */
export function porcentajeMermas(
  mermas: { cantidad: number | null; costo_unitario_momento: number | null }[],
  catalogo: ArticuloInicio[],
) {
  const valor = mermas.reduce((s, r) => s + Math.abs(n(r.cantidad)) * n(r.costo_unitario_momento), 0);
  const inventario = catalogo.reduce((s, c) => s + saldoCedis(c) * n(c.costo_unitario), 0);
  return { pct: inventario > 0 ? Math.round((valor / inventario) * 10000) / 100 : null, n: mermas.length };
}

/** fmtD de renderComInicio: Hoy, Mañana, Hace N d o la fecha corta. */
export function relativo(fecha: string | null, hoy: string): string {
  if (!fecha) return '—';
  const d = difDias(hoy, fecha.slice(0, 10));
  if (d === 0) return 'Hoy';
  if (d === 1) return 'Mañana';
  if (d < 0) return `Hace ${-d} d`;
  return fechaCorta(fecha.slice(0, 10));
}

/** PED_STATUS_LABEL del viejo, con el tono de la pastilla. */
export const ESTADOS_PEDIDO: Record<string, { texto: string; tono: Tono }> = {
  recibido: { texto: 'Recibido', tono: 'neutro' },
  pagado: { texto: 'Pagado', tono: 'neutro' },
  empacado: { texto: 'Empacado', tono: 'bajo' },
  enviado: { texto: 'Enviado', tono: 'ok' },
  entregado: { texto: 'Entregado', tono: 'ok' },
  terminado: { texto: 'Terminado', tono: 'ok' },
  con_incidencia: { texto: 'Con incidencia', tono: 'pierde' },
  cancelado: { texto: 'Cancelado', tono: 'pierde' },
};

export interface PedidoActivo {
  id: string;
  numero: string;
  status: string;
  sucursal: string;
  monto: number;
  fecha: string | null;
}

export interface DatosInicio {
  hoy: string;
  catalogo: ArticuloInicio[];
  porEnviar: VentaMov[];
  ventas90: VentaMov[];
  compras: MovCompra[];
  leadTimes: { sku: string; dias: number | null }[];
  mermas: { cantidad: number | null; costo_unitario_momento: number | null }[];
  /** null: el puente no respondió (ventas sin dato). */
  pedidos: PedidoMonto[] | null;
}

export function armarInicio(d: DatosInicio) {
  const categoria = Object.fromEntries(d.catalogo.map((c) => [c.sku, c.categoria]));
  const tend = tendencia(d.hoy, d.pedidos ?? [], d.compras, categoria);
  const grupos = agruparOcs(d.compras);
  return {
    tendencia: tend,
    mes: tend[tend.length - 1],
    proximas: ocsProximas(grupos, d.hoy),
    transito: enTransito(grupos),
    inventario: resumenInventario(d),
    salidas: salidas30(d.ventas90, d.hoy),
    compras: { ...resumenOcs(d.compras, d.hoy), leadTime: leadTimePrometido(grupos) },
    mermas: porcentajeMermas(d.mermas, d.catalogo),
  };
}
export type ResultadoInicio = ReturnType<typeof armarInicio>;
```

`ArticuloCatalogo` (`tipos.ts`) ya trae `nombre`, `costo_unitario`, los saldos y los campos de Zoho. `ArticuloInicio` vuelve obligatorio `estatus`, que allá es opcional.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-inicio.test.ts`
Expected: PASS (todas).

- [ ] **Step 5: Prueba de la pantalla que falla**

Crear `tests/portal/com-inicio-pantalla.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Inicio } from '../../components/comercializadora/inicio';
import { armarInicio } from '../../lib/comercializadora/inicio';

const base = {
  hoy: '2026-11-13',
  catalogo: [{ sku: 'A', nombre: 'Café', estatus: 'Activo', categoria: 'Insumos', created_at: null, costo_unitario: 10,
    saldo_cedis: 0, zoho_stock: null, zoho_stock_fisico: null, zoho_sync_at: null }] as never,
  porEnviar: [],
  ventas90: [],
  compras: [{ id: '1', folio: 'OC-9', fecha: '2026-11-02', sku: 'A', cantidad: 5, cantidad_recibida: 0, monto: 30,
    destino: 'Yulius', fecha_arribo: '2026-11-14', proveedor: 'P', estado: null }],
  leadTimes: [],
  mermas: [],
};

describe('Inicio', () => {
  it('muestra ventas, compras y %, las OCs próximas y los pedidos activos', () => {
    const r = armarInicio({ ...base, pedidos: [{ fecha_pedido: '2026-11-05T18:00:00Z', monto: 60, items: null }] });
    render(
      <Inicio
        r={r}
        ventas
        hoy="2026-11-13"
        pedidos={{ total: 1, top: [{ id: 'p1', numero: '#1001', status: 'pagado', sucursal: 'Polanco', monto: 60, fecha: '2026-11-05' }] }}
      />,
    );
    expect(screen.getByText('Ventas facturadas (mes)')).toBeInTheDocument();
    expect(screen.getAllByText('50%').length).toBe(2); // KPI y fila del mes en la tendencia
    expect(screen.getByText(/1 OC con arribo en los próximos 7 días/)).toBeInTheDocument();
    expect(screen.getByText('#1001')).toBeInTheDocument();
    expect(screen.getByText('Polanco')).toBeInTheDocument();
    expect(screen.getAllByText('Mañana').length).toBeGreaterThan(0);
  });

  it('si el puente no respondió, avisa y no muestra ventas ni % (sin números falsos)', () => {
    const r = armarInicio({ ...base, pedidos: null });
    render(<Inicio r={r} ventas={false} hoy="2026-11-13" pedidos={null} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/No se pudieron leer los pedidos del sitio viejo/);
    expect(screen.queryAllByText('50%')).toHaveLength(0);
    expect(screen.getAllByText('Sin stock').length).toBeGreaterThan(0); // KPI y panel siguen
  });
});
```

Run: `npx vitest run tests/portal/com-inicio-pantalla.test.tsx`
Expected: FAIL (el componente no existe).

- [ ] **Step 6: El componente `components/comercializadora/inicio.tsx`**

Componente de servidor, sin estado: los paneles se pliegan con `<details>`.

```tsx
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ClipboardList,
  Clock,
  PackageX,
  Percent,
  ShoppingBag,
  Timer,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { Barra, Kpi, Pill, Tarjeta, Vacio } from '@/components/portal/piezas';
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { textoDestino } from '@/lib/comercializadora/ordenes';
import { ESTADOS_PEDIDO, relativo, type PedidoActivo, type ResultadoInicio } from '@/lib/comercializadora/inicio';

function Panel({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <details open className="placa rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold">{titulo}</summary>
      <div className="mt-3 text-sm">{children}</div>
    </details>
  );
}

export function Inicio({
  r,
  ventas,
  pedidos,
  hoy,
}: {
  r: ResultadoInicio;
  ventas: boolean;
  pedidos: { total: number; top: PedidoActivo[] } | null;
  hoy: string;
}) {
  const mes = r.mes;
  const inv = r.inventario;
  return (
    <div className="space-y-5">
      {!ventas ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          No se pudieron leer los pedidos del sitio viejo: las ventas, el % y los pedidos activos no se muestran. Lo
          demás está al día.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          etiqueta="Ventas facturadas (mes)"
          valor={ventas ? pesos(mes.ventas) : '—'}
          nota={ventas ? `${mes.pedidos} pedidos` : undefined}
          icono={ShoppingBag}
        />
        <Kpi
          etiqueta="Compras operativas (mes)"
          valor={pesos(mes.compras)}
          nota={mes.sinMonto ? 'Hay OCs del mes sin monto capturado' : `${mes.ocs} OCs · sin compras de Equipo`}
          icono={Wallet}
          tono={mes.sinMonto ? 'bajo' : 'neutro'}
        />
        <Kpi
          etiqueta="% Compras / Ventas"
          valor={ventas && mes.pct != null ? `${mes.pct}%` : '—'}
          nota={ventas ? mes.texto : undefined}
          icono={Percent}
          tono={ventas ? mes.tono : 'neutro'}
        />
      </div>

      {r.proximas.folios.length ? (
        <p className="placa rounded-lg px-4 py-3 text-sm">
          <b>
            {r.proximas.folios.length} OC{r.proximas.folios.length === 1 ? '' : 's'} con arribo en los próximos 7 días
          </b>{' '}
          ({r.proximas.folios.join(' · ')}): {pesos(r.proximas.monto)}
        </p>
      ) : null}

      <Tarjeta
        titulo="Tendencia: % Compras / Ventas (5 meses)"
        descripcion="Rango óptimo 45–55 %. Las compras cuentan por la fecha de emisión de la OC."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Compras</th>
                <th className="text-right">%</th>
                <th className="min-w-32" />
              </tr>
            </thead>
            <tbody>
              {r.tendencia.map((t) => (
                <tr key={t.mes}>
                  <td>
                    {t.etiqueta}
                    {t.actual ? <span className="text-muted-foreground"> · en curso</span> : null}
                  </td>
                  <td className="text-right tabular-nums">{ventas ? pesos(t.ventas) : '—'}</td>
                  <td className="text-right tabular-nums">{pesos(t.compras)}</td>
                  <td className="text-right font-semibold tabular-nums">
                    {ventas && t.pct != null ? `${t.pct}%` : '—'}
                  </td>
                  <td>
                    {ventas && t.pct != null ? (
                      <Barra valor={Math.min(t.pct, 100)} max={100} objetivo={55} estado={t.tono} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi etiqueta="Pedidos activos" valor={pedidos ? pedidos.total : '—'} nota="Sin terminar ni cancelar" icono={ClipboardList} />
        <Kpi etiqueta="Salidas 30 días" valor={r.salidas.folios} nota={`${numero(r.salidas.uds)} piezas enviadas`} icono={Truck} />
        <Kpi etiqueta="OCs en tránsito" valor={r.transito.length} nota="Por recibir" icono={CalendarClock} />
        <Kpi etiqueta="Sin stock" valor={inv.sinStock.length} nota="Artículos en cero" icono={PackageX} tono={inv.sinStock.length ? 'pierde' : 'ok'} />
        <Kpi etiqueta="Inventario crítico" valor={inv.criticos} nota="Urgente + pronto por días de inventario" icono={AlertTriangle} tono={inv.criticos ? 'bajo' : 'ok'} />
        <Kpi etiqueta="CEDIS total" valor={numero(inv.cedisTotal)} nota={`${inv.activos} artículos activos`} icono={Boxes} />
      </div>

      <Tarjeta titulo="Compras y mermas" descripcion="Arribo vencido usa la fecha estimada de la OC: es un aviso, no un atraso confirmado.">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            etiqueta="OCs con arribo vencido"
            valor={r.compras.atrasadas}
            nota={`de ${r.compras.abiertas} abiertas`}
            icono={Clock}
            tono={r.compras.atrasadas === 0 ? 'ok' : r.compras.atrasadas <= 2 ? 'bajo' : 'pierde'}
          />
          <Kpi etiqueta="OCs abiertas" valor={r.compras.abiertas} nota={pesos(r.compras.montoAbiertas)} icono={ClipboardList} />
          <Kpi
            etiqueta="Lead time prometido"
            valor={r.compras.leadTime.dias == null ? '—' : `${r.compras.leadTime.dias} días`}
            nota={`${r.compras.leadTime.ocs} OCs con ambas fechas`}
            icono={Timer}
          />
          <Kpi
            etiqueta="Mermas del mes"
            valor={r.mermas.pct == null ? 'Sin datos' : `${r.mermas.pct}%`}
            nota={`${r.mermas.n} ajustes con motivo Merma · meta ≤ 1 %`}
            icono={Trash2}
            tono={r.mermas.pct == null ? 'neutro' : r.mermas.pct <= 1 ? 'ok' : r.mermas.pct <= 2 ? 'bajo' : 'pierde'}
          />
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Pedidos activos">
          {!pedidos ? (
            <p className="text-muted-foreground">No disponible por ahora.</p>
          ) : !pedidos.top.length ? (
            <Vacio titulo="Sin pedidos activos" />
          ) : (
            <ul className="divide-y divide-line">
              {pedidos.top.map((p) => {
                const e = ESTADOS_PEDIDO[p.status] ?? { texto: p.status, tono: 'neutro' as const };
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <b>{p.numero}</b> <span className="text-muted-foreground">{p.sucursal}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Pill estado={e.tono}>{e.texto}</Pill>
                      <span className="tabular-nums">{pesos(p.monto)}</span>
                      <span className="text-muted-foreground">{p.fecha ? fechaCorta(p.fecha) : '—'}</span>
                    </span>
                  </li>
                );
              })}
              {pedidos.total > pedidos.top.length ? (
                <li className="py-2 text-muted-foreground">y {pedidos.total - pedidos.top.length} pedidos más</li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel titulo="Sin stock">
          {!inv.sinStock.length ? (
            <Vacio titulo="Ningún artículo en cero" />
          ) : (
            <ul className="divide-y divide-line">
              {inv.sinStock.slice(0, 12).map((f) => (
                <li key={f.sku} className="flex justify-between gap-2 py-2">
                  <span>
                    {f.nombre} <span className="text-xs text-muted-foreground">{f.sku}</span>
                  </span>
                  {f.comprometido ? <span className="text-bad">−{numero(f.comprometido)} pend.</span> : null}
                </li>
              ))}
              {inv.sinStock.length > 12 ? (
                <li className="py-2 text-muted-foreground">y {inv.sinStock.length - 12} más</li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel titulo="Compras en tránsito">
          {!r.transito.length ? (
            <Vacio titulo="Sin OCs por recibir" />
          ) : (
            <ul className="divide-y divide-line">
              {r.transito.slice(0, 6).map((g) => (
                <li key={g.folio} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <b>{g.folio}</b>{' '}
                    <span className="text-muted-foreground">
                      → {textoDestino(g.destino)} · {g.skus} SKUs · {numero(g.uds)} pzas
                    </span>
                  </span>
                  <span>{relativo(g.fecha_arribo, hoy)}</span>
                </li>
              ))}
              {r.transito.length > 6 ? (
                <li className="py-2 text-muted-foreground">y {r.transito.length - 6} más</li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel titulo="Inventario crítico">
          {!inv.faltantes.length && !inv.stockBajo.length ? (
            <p className="text-muted-foreground">
              {inv.criticos} artículos urgentes o pronto por días de inventario; ninguno corto para pedidos pendientes.
            </p>
          ) : null}
          {inv.faltantes.length ? (
            <>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Insuficiente para pedidos pendientes
              </h3>
              <ul className="mb-3 divide-y divide-line">
                {inv.faltantes.slice(0, 4).map((f) => (
                  <li key={f.sku} className="flex justify-between gap-2 py-2">
                    <span>
                      {f.nombre}{' '}
                      <span className="text-xs text-muted-foreground">
                        {f.sku} · stock {numero(f.saldo)}
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="text-bad">−{numero(f.faltante)}</b>
                      <span className="block text-xs text-muted-foreground">comprometido {numero(f.comprometido)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {inv.stockBajo.length ? (
            <>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Stock bajo (≤ 10 piezas, sin venta reciente)
              </h3>
              <ul className="divide-y divide-line">
                {inv.stockBajo.slice(0, 6).map((f) => (
                  <li key={f.sku} className="flex justify-between gap-2 py-2">
                    <span>
                      {f.nombre} <span className="text-xs text-muted-foreground">{f.sku}</span>
                    </span>
                    <Pill estado={f.saldo <= 3 ? 'pierde' : 'bajo'}>
                      {f.saldo <= 3 ? 'Crítico' : 'Bajo'} · {numero(f.saldo)}
                    </Pill>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: La página `app/(comercializadora)/comercializadora/inicio/page.tsx`**

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Inicio } from '@/components/comercializadora/inicio';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx, masDias } from '@/lib/comercializadora/fechas';
import { aperturasLegado, pedidosLegado } from '@/lib/comercializadora/legado';
import {
  armarInicio,
  diaCdmx,
  mesesHasta,
  montoPedido,
  type ArticuloInicio,
  type PedidoActivo,
  type VentaMov,
} from '@/lib/comercializadora/inicio';
import type { MovCompra } from '@/lib/comercializadora/ordenes';

const VENTA = 'id,folio,sku,cantidad,estado,fecha_envio';

export default async function InicioPagina() {
  const { db } = await sesionComercializadora();
  const hoy = hoyCdmx();
  const desde5 = `${mesesHasta(hoy, 5)[0]}-01`;
  const [catalogo, porEnviar, ventas90, compras, leadTimes, mermas, pedidosMes, activos] = await Promise.all([
    leerTodoCom<ArticuloInicio>(
      db,
      'com_catalogo',
      'sku,nombre,estatus,categoria,created_at,costo_unitario,saldo_cedis,zoho_stock,zoho_stock_fisico,zoho_sync_at',
      'sku',
    ),
    leerTodoCom<VentaMov>(db, 'com_movimientos', VENTA, 'id', (q) => q.eq('tipo', 'venta').eq('estado', 'por_enviar')),
    leerTodoCom<VentaMov>(db, 'com_movimientos', VENTA, 'id', (q) =>
      q.eq('tipo', 'venta').gte('fecha_envio', masDias(hoy, -90)),
    ),
    leerTodoCom<MovCompra>(
      db,
      'com_movimientos',
      'id,folio,fecha,sku,cantidad,cantidad_recibida,monto,destino,fecha_arribo,proveedor,estado',
      'id',
      (q) => q.eq('tipo', 'compra'),
    ),
    leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
    leerTodoCom<{ cantidad: number | null; costo_unitario_momento: number | null }>(
      db,
      'com_movimientos',
      'id,cantidad,costo_unitario_momento',
      'id',
      (q) => q.eq('tipo', 'ajuste').eq('motivo', 'Merma').gte('fecha', `${hoy.slice(0, 7)}-01`),
    ),
    // El día 1 a las 00:00 de CDMX ya es 06:00 UTC: se piden 2 días antes y tendencia() filtra por día de CDMX.
    pedidosLegado((q) => q.gte('fecha_pedido', masDias(desde5, -2)).neq('status', 'cancelado')),
    pedidosLegado((q) => q.neq('status', 'cancelado').neq('status', 'terminado')),
  ]);

  let pedidos: { total: number; top: PedidoActivo[] } | null = null;
  if (activos.ok) {
    const top = [...activos.datos]
      .sort((a, b) => String(b.fecha_pedido).localeCompare(String(a.fecha_pedido)))
      .slice(0, 10);
    const ap = await aperturasLegado([...new Set(top.map((p) => p.apertura_id).filter((x): x is string => !!x))]);
    const porId = new Map((ap.ok ? ap.datos : []).map((a) => [a.id, a]));
    pedidos = {
      total: activos.datos.length,
      top: top.map((p) => {
        const a = p.apertura_id ? porId.get(p.apertura_id) : undefined;
        return {
          id: p.id,
          numero: p.shopify_order_number || p.id.slice(0, 8),
          status: p.status ?? '',
          sucursal: a?.sucursal || a?.contacto || '—',
          monto: montoPedido(p),
          fecha: p.fecha_pedido ? diaCdmx(p.fecha_pedido) : null,
        };
      }),
    };
  }

  const r = armarInicio({
    hoy,
    catalogo,
    porEnviar,
    ventas90,
    compras,
    leadTimes,
    mermas,
    pedidos: pedidosMes.ok ? pedidosMes.datos : null,
  });
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Inicio"
        descripcion="El día de la Comercializadora: dinero del mes, compras en camino e inventario que pide atención."
      />
      <Inicio r={r} ventas={pedidosMes.ok} pedidos={pedidos} hoy={hoy} />
    </>
  );
}
```

- [ ] **Step 8: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-inicio.test.ts tests/portal/com-inicio-pantalla.test.tsx && npm run typecheck`
Expected: PASS y typecheck limpio.

- [ ] **Step 9: Commit**

```bash
git add lib/comercializadora/inicio.ts components/comercializadora/inicio.tsx "app/(comercializadora)/comercializadora/inicio" tests/portal/com-inicio.test.ts tests/portal/com-inicio-pantalla.test.tsx
git commit -m "feat(comercializadora): pantalla Inicio con dinero del mes, compras e inventario crítico"
```

---

### Task 4: Envíos — cola de pedidos por enviar

**Files:**
- Create: `lib/comercializadora/envios.ts`
- Create: `components/comercializadora/envios.tsx`
- Create: `app/(comercializadora)/comercializadora/envios/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (agregar `marcarEnviado`)
- Test: `tests/portal/com-envios.test.tsx`

**Interfaces:**
- Consumes: `editorCom`, `fallo`, `SOLO_LECTURA`, `Resultado` (`acciones.ts`); `leerTodoCom`; `fechaCorta`.
- Produces:
  - `interface MovVenta { id: string; folio: string | null; sucursal: string | null; fecha: string | null; fecha_envio: string | null; sku: string; cantidad: number | null; estado: string | null }`
  - `interface GrupoVenta { folio: string; sucursal: string | null; fecha_envio: string | null; skus: number; uds: number; pendientes: number; estado: 'por_enviar' | 'enviado' | 'otro'; textoEstado: string; items: MovVenta[] }`
  - `type VistaEnvios = 'por_enviar' | 'enviados' | 'todos'`
  - `agruparVentas(filas: MovVenta[]): GrupoVenta[]`
  - `filtrarEnvios(g: GrupoVenta[], v: VistaEnvios): GrupoVenta[]`
  - `conteoEnvios(g: GrupoVenta[]): Record<VistaEnvios, number>`
  - `marcarEnviado(folio: string): Promise<Resultado<{ lineas: number }>>`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-envios.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', marcar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { marcarEnviado } from '../../app/(comercializadora)/comercializadora/acciones';
import { agruparVentas, conteoEnvios, filtrarEnvios } from '../../lib/comercializadora/envios';
import { Envios } from '../../components/comercializadora/envios';

const v = (o: Record<string, unknown>) => ({
  id: String(Math.random()), tipo: 'venta', folio: 'V1', sucursal: 'Polanco', fecha: '2026-11-01',
  fecha_envio: '2026-11-10', sku: 'A', cantidad: 2, estado: 'por_enviar', ...o,
});

describe('Envíos (port de renderComEnvios)', () => {
  const filas = [
    v({ folio: 'V1' }),
    v({ folio: 'V1', sku: 'B', cantidad: 3 }),
    v({ folio: 'V2', estado: 'enviado', fecha_envio: '2026-11-05' }),
    v({ folio: 'V3', estado: 'cancelado', fecha_envio: '2026-11-01' }),
  ];

  it('agrupa por folio, por fecha de envío; "por enviar" es solo estado por_enviar (no los cancelados)', () => {
    const g = agruparVentas(filas as never);
    expect(g.map((x) => [x.folio, x.estado, x.skus, x.uds, x.pendientes])).toEqual([
      ['V3', 'otro', 1, 2, 0],
      ['V2', 'enviado', 1, 2, 0],
      ['V1', 'por_enviar', 2, 5, 2],
    ]);
    expect(g[0].textoEstado).toBe('cancelado');
  });

  it('las pestañas cuentan folios, no líneas', () => {
    const g = agruparVentas(filas as never);
    expect(conteoEnvios(g)).toEqual({ por_enviar: 1, enviados: 1, todos: 3 });
    expect(filtrarEnvios(g, 'enviados').map((x) => x.folio)).toEqual(['V2']);
  });

  describe('marcarEnviado', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
    });
    it('marca solo las líneas por_enviar de ese folio de venta', async () => {
      const f = dbFalsa({ com_movimientos: [...filas.map((x) => ({ ...x })), v({ tipo: 'compra', folio: 'V1' })] });
      m.db = f.db;
      expect(await marcarEnviado('V1')).toEqual({ ok: true, lineas: 2 });
      const t = f.tablas.com_movimientos;
      expect(t.filter((x) => x.folio === 'V1' && x.tipo === 'venta').every((x) => x.estado === 'enviado')).toBe(true);
      expect(t.find((x) => x.tipo === 'compra')?.estado).toBe('por_enviar');
      expect(t.find((x) => x.folio === 'V3')?.estado).toBe('cancelado');
    });
    it('dos veces: la segunda avisa que ya no hay nada por enviar', async () => {
      m.db = dbFalsa({ com_movimientos: [v({})] }).db;
      await marcarEnviado('V1');
      expect(await marcarEnviado('V1')).toEqual({ error: 'Ese pedido ya no tiene líneas por enviar; recarga la página' });
    });
    it('solo lectura: no toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_movimientos: [v({})] });
      m.db = f.db;
      expect(await marcarEnviado('V1')).toEqual({ error: 'Tu acceso a Comercializadora es de solo lectura.' });
      expect(f.consultas).toEqual([]);
    });
  });
});

describe('pantalla Envíos', () => {
  const grupos = agruparVentas([v({ folio: 'V1' }), v({ folio: 'V2', estado: 'enviado' })] as never);
  it('por omisión muestra lo por enviar; la pestaña Enviados cambia la lista', () => {
    render(<Envios grupos={grupos} editable={false} />);
    expect(screen.getByText('V1')).toBeInTheDocument();
    expect(screen.queryByText('V2')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Enviados \(1\)/ }));
    expect(screen.getByText('V2')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Marcar enviado/ })).not.toBeInTheDocument();
  });
});
```

Nota: la pantalla importa `marcarEnviado` de `acciones.ts`. En esta prueba la acción real queda cargada, y el botón no se pulsa porque `editable={false}`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-envios.test.tsx`
Expected: FAIL (no existen `envios.ts`, el componente ni `marcarEnviado`).

- [ ] **Step 3: Implementar**

`lib/comercializadora/envios.ts`:

```ts
const n = (x: unknown) => Number(x) || 0;

export interface MovVenta {
  id: string;
  folio: string | null;
  sucursal: string | null;
  fecha: string | null;
  fecha_envio: string | null;
  sku: string;
  cantidad: number | null;
  estado: string | null;
}
export interface GrupoVenta {
  folio: string;
  sucursal: string | null;
  fecha_envio: string | null;
  skus: number;
  uds: number;
  pendientes: number;
  estado: 'por_enviar' | 'enviado' | 'otro';
  textoEstado: string;
  items: MovVenta[];
}
export type VistaEnvios = 'por_enviar' | 'enviados' | 'todos';

/** agrupar() de renderComEnvios. Decisión 6: por enviar = alguna línea 'por_enviar' (el viejo contaba los cancelados). */
export function agruparVentas(filas: MovVenta[]): GrupoVenta[] {
  const g = new Map<string, MovVenta[]>();
  for (const r of filas) {
    const k = r.folio ?? '—';
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.entries()]
    .map(([folio, items]) => {
      const pendientes = items.filter((x) => x.estado === 'por_enviar').length;
      const estado: GrupoVenta['estado'] = pendientes
        ? 'por_enviar'
        : items.every((x) => x.estado === 'enviado')
          ? 'enviado'
          : 'otro';
      return {
        folio,
        sucursal: items[0].sucursal,
        fecha_envio: items[0].fecha_envio ?? items[0].fecha,
        skus: items.length,
        uds: items.reduce((s, x) => s + n(x.cantidad), 0),
        pendientes,
        estado,
        textoEstado: estado === 'por_enviar' ? 'Por enviar' : estado === 'enviado' ? 'Enviado' : String(items[0].estado ?? '—'),
        items,
      };
    })
    .sort((a, b) => String(a.fecha_envio ?? '').localeCompare(String(b.fecha_envio ?? '')));
}

export function filtrarEnvios(g: GrupoVenta[], v: VistaEnvios): GrupoVenta[] {
  if (v === 'todos') return g;
  return g.filter((x) => x.estado === (v === 'enviados' ? 'enviado' : 'por_enviar'));
}

export function conteoEnvios(g: GrupoVenta[]): Record<VistaEnvios, number> {
  return { por_enviar: filtrarEnvios(g, 'por_enviar').length, enviados: filtrarEnvios(g, 'enviados').length, todos: g.length };
}
```

Agregar a `acciones.ts`:

```ts
/** Marcar enviado (renderComEnvios): solo las líneas 'por_enviar' del folio; el CEDIS lo descuenta Zoho. */
export async function marcarEnviado(folio: string): Promise<Resultado<{ lineas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await com(s.db)
      .from('com_movimientos')
      .update({ estado: 'enviado' })
      .eq('tipo', 'venta')
      .eq('folio', folio)
      .eq('estado', 'por_enviar')
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Ese pedido ya no tiene líneas por enviar; recarga la página' };
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, lineas: r.data.length };
  } catch (e) {
    return fallo(e);
  }
}
```

`components/comercializadora/envios.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio, type Estado } from '@/components/portal/piezas';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { conteoEnvios, filtrarEnvios, type GrupoVenta, type VistaEnvios } from '@/lib/comercializadora/envios';
import { marcarEnviado } from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;
const VISTAS: [VistaEnvios, string][] = [
  ['por_enviar', 'Por enviar'],
  ['enviados', 'Enviados'],
  ['todos', 'Todos'],
];
const TONO: Record<GrupoVenta['estado'], Estado> = { por_enviar: 'bajo', enviado: 'ok', otro: 'neutro' };

export function Envios({ grupos, editable }: { grupos: GrupoVenta[]; editable: boolean }) {
  const router = useRouter();
  const [vista, setVista] = useState<VistaEnvios>('por_enviar');
  const [ver, setVer] = useState(POR_PAGINA);
  const [abierto, setAbierto] = useState<string | null>(null);
  const [enviando, setEnviando] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [, iniciar] = useTransition();
  const conteo = conteoEnvios(grupos);
  const lista = filtrarEnvios(grupos, vista);

  const marcar = (folio: string) => {
    if (!confirm(`¿Marcar ${folio} como enviado?`)) return;
    setEnviando(folio);
    iniciar(async () => {
      const r = await marcarEnviado(folio);
      setEnviando(null);
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: `${folio}: marcado como enviado.` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {VISTAS.map(([v, nombre]) => (
          <button
            key={v}
            type="button"
            aria-pressed={vista === v}
            onClick={() => (setVista(v), setVer(POR_PAGINA))}
            className={`h-9 rounded-[10px] border px-3 text-sm font-semibold ${vista === v ? 'border-ink bg-ink text-white' : 'border-line-strong'}`}
          >
            {nombre} ({conteo[v]})
          </button>
        ))}
      </div>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {!lista.length ? (
        <Vacio titulo={vista === 'por_enviar' ? 'Nada por enviar' : 'Sin pedidos en esta vista'} />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Sucursal / folio</th>
                <th>Fecha de envío</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Piezas</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((g) => (
                <tr key={g.folio}>
                  <td>
                    <div className="font-medium">{g.sucursal || '—'}</div>
                    <div className="text-xs text-muted-foreground">{g.folio}</div>
                    {abierto === g.folio ? (
                      <ul className="mt-1 text-xs">
                        {g.items.map((i) => (
                          <li key={i.id}>
                            {i.sku}: {numero(Number(i.cantidad) || 0)}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </td>
                  <td>{g.fecha_envio ? fechaCorta(g.fecha_envio) : '—'}</td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{numero(g.uds)}</td>
                  <td>
                    <Pill estado={TONO[g.estado]}>{g.textoEstado}</Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" className="text-sm underline" onClick={() => setAbierto(abierto === g.folio ? null : g.folio)}>
                      {abierto === g.folio ? 'Ocultar' : 'Detalle'}
                    </button>
                    {editable && g.estado === 'por_enviar' ? (
                      <button
                        type="button"
                        disabled={enviando === g.folio}
                        onClick={() => marcar(g.folio)}
                        className="ml-3 text-sm font-semibold underline"
                      >
                        {enviando === g.folio ? 'Marcando…' : 'Marcar enviado'}
                      </button>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button type="button" className="m-3 text-sm font-semibold underline" onClick={() => setVer(ver + POR_PAGINA)}>
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

`app/(comercializadora)/comercializadora/envios/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Envios } from '@/components/comercializadora/envios';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { agruparVentas, type MovVenta } from '@/lib/comercializadora/envios';

export default async function EnviosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const filas = await leerTodoCom<MovVenta>(
    db,
    'com_movimientos',
    'id,folio,sucursal,fecha,fecha_envio,sku,cantidad,estado',
    'id',
    (q) => q.eq('tipo', 'venta'),
  );
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Envíos"
        descripcion="Pedidos de sucursales pagados que salen del CEDIS. Al marcar enviado dejan de contar como comprometidos."
      />
      <Envios grupos={agruparVentas(filas)} editable={puedeEditarCom(accesos)} />
    </>
  );
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-envios.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/envios.ts components/comercializadora/envios.tsx "app/(comercializadora)/comercializadora/envios" "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-envios.test.tsx
git commit -m "feat(comercializadora): pantalla Envíos con marcar enviado por folio"
```

---

### Task 5: Traspasos entre CEDIS y 3PL

**Files:**
- Create: `lib/comercializadora/traspasos.ts`
- Create: `components/comercializadora/traspasos.tsx`
- Create: `app/(comercializadora)/comercializadora/traspasos/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`crearTraspaso`, `ingresarTraspaso`, `eliminarTraspaso`)
- Test: `tests/portal/com-traspasos.test.tsx`

**Interfaces:**
- Consumes: `com_ingresar_traspaso` (Tarea 1); `cantidadConteo` (`inventario.ts`); `textoDestino` (`ordenes.ts`); `hoyCdmx`.
- Produces:
  - `interface MovTraspaso { id: string; folio: string | null; fecha: string | null; sku: string; cantidad: number | null; cantidad_original: number | null; origen: string | null; destino: string | null; estado: string | null }`
  - `interface GrupoTraspaso { folio: string; fecha: string | null; origen: string | null; destino: string | null; estado: 'ordenado' | 'ingresado'; skus: number; uds: number; items: MovTraspaso[] }`
  - `LUGARES = ['CEDIS', 'Yulius'] as const`
  - `interface FormTraspaso { folio: string; fecha: string; origen: string; destino: string; lineas: { sku: string; cantidad: number }[] }`
  - `agruparTraspasos(filas): GrupoTraspaso[]`
  - `detalleTraspaso(r: MovTraspaso): { ord: number; ing: number; dif: number }`
  - `validarTraspaso(f: FormTraspaso, skus: Set<string>): string | null`
  - `folioTraspaso(hoy: string, azar?: () => number): string`
  - `crearTraspaso(f: FormTraspaso): Promise<Resultado>`
  - `ingresarTraspaso(folio: string, recibido: Record<string, string>): Promise<Resultado<{ lineas: number }>>`
  - `eliminarTraspaso(folio: string): Promise<Resultado>`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-traspasos.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({
  db: null as unknown,
  nivel: 'edicion',
  rpc: vi.fn((_fn: string, _a: unknown) => ({ data: 2, error: null }) as { data: unknown; error: unknown }),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { crearTraspaso, eliminarTraspaso, ingresarTraspaso } from '../../app/(comercializadora)/comercializadora/acciones';
import {
  agruparTraspasos,
  detalleTraspaso,
  folioTraspaso,
  validarTraspaso,
} from '../../lib/comercializadora/traspasos';
import { Traspasos } from '../../components/comercializadora/traspasos';

const t = (o: Record<string, unknown>) => ({
  id: String(Math.random()), tipo: 'traspaso', folio: 'T-1', fecha: '2026-11-10', sku: 'A', cantidad: 5,
  cantidad_original: 5, origen: 'CEDIS', destino: 'Yulius', estado: 'ordenado', ...o,
});
const form = (o: Record<string, unknown> = {}) => ({
  folio: 'T-9', fecha: '2026-11-13', origen: 'CEDIS', destino: 'Yulius', lineas: [{ sku: 'A', cantidad: 4 }], ...o,
});

describe('Traspasos (port de renderComTraspasos)', () => {
  it('agrupa por folio: piezas ordenadas, estado y de la fecha más reciente a la más vieja', () => {
    const g = agruparTraspasos([
      t({}),
      t({ sku: 'B', cantidad: 2, cantidad_original: 3, estado: 'ingresado' }),
      t({ folio: 'T-2', fecha: '2026-11-12', estado: 'ingresado' }),
    ] as never);
    expect(g.map((x) => [x.folio, x.skus, x.uds, x.estado])).toEqual([
      ['T-2', 1, 5, 'ingresado'],
      ['T-1', 2, 8, 'ordenado'],
    ]);
  });

  it('detalle: ordenado, ingresado y diferencia', () => {
    expect(detalleTraspaso(t({ cantidad: 4, cantidad_original: 5, estado: 'ingresado' }) as never)).toEqual({ ord: 5, ing: 4, dif: -1 });
    expect(detalleTraspaso(t({ cantidad: 5, cantidad_original: null }) as never)).toEqual({ ord: 5, ing: 5, dif: 0 });
  });

  it('validación: referencia, fecha, origen ≠ destino, al menos una línea y SKUs del catálogo', () => {
    const skus = new Set(['A']);
    expect(validarTraspaso(form({ folio: ' ' }), skus)).toBe('Pon la referencia del traspaso');
    expect(validarTraspaso(form({ destino: 'CEDIS' }), skus)).toBe('El origen y el destino deben ser distintos');
    expect(validarTraspaso(form({ origen: 'Bodega' }), skus)).toBe('Elige el origen y el destino');
    expect(validarTraspaso(form({ lineas: [{ sku: 'A', cantidad: 0 }] }), skus)).toBe('Agrega al menos un artículo con cantidad');
    expect(validarTraspaso(form({ lineas: [{ sku: 'ZZ', cantidad: 1 }] }), skus)).toBe('SKU no encontrado: ZZ');
    expect(validarTraspaso(form(), skus)).toBeNull();
  });

  it('folio sugerido con el día de CDMX', () => {
    expect(folioTraspaso('2026-11-13', () => 0)).toBe('T-20261113100');
    expect(folioTraspaso('2026-11-13', () => 0.999)).toBe('T-20261113999');
  });

  describe('acciones', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
      m.rpc.mockClear();
    });

    it('crear: una fila por artículo con cantidad > 0, estado ordenado', async () => {
      const f = dbFalsa({ com_catalogo: [{ sku: 'A' }, { sku: 'B' }], com_movimientos: [] });
      m.db = f.db;
      expect(await crearTraspaso(form({ lineas: [{ sku: 'A', cantidad: 4 }, { sku: 'B', cantidad: 0 }] }))).toEqual({ ok: true });
      expect(f.tablas.com_movimientos).toEqual([
        expect.objectContaining({ tipo: 'traspaso', folio: 'T-9', sku: 'A', cantidad: 4, cantidad_original: 4, origen: 'CEDIS', destino: 'Yulius', estado: 'ordenado', fecha: '2026-11-13' }),
      ]);
    });

    it('crear: rechaza un SKU fuera del catálogo y una referencia repetida', async () => {
      m.db = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [t({ folio: 'T-9' })] }).db;
      expect(await crearTraspaso(form({ lineas: [{ sku: 'ZZ', cantidad: 1 }] }))).toEqual({ error: 'SKU no encontrado: ZZ' });
      expect(await crearTraspaso(form())).toEqual({ error: 'Ya existe un traspaso con la referencia T-9' });
    });

    it('ingresar: pasa cantidades normalizadas por id a la función atómica', async () => {
      m.db = dbFalsa({}, [], m.rpc).db;
      expect(await ingresarTraspaso('T-1', { a1: '1,200', a2: '0' })).toEqual({ ok: true, lineas: 2 });
      expect(m.rpc).toHaveBeenCalledWith('com_ingresar_traspaso', { p_folio: 'T-1', p_recibido: { a1: 1200, a2: 0 } });
    });

    it('ingresar: una cantidad vacía o con texto no llama a la base', async () => {
      m.db = dbFalsa({}, [], m.rpc).db;
      expect(await ingresarTraspaso('T-1', { a1: '', a2: '3' })).toEqual({ error: 'Revisa las cantidades recibidas: usa números de 0 en adelante' });
      expect(m.rpc).not.toHaveBeenCalled();
    });

    it('ingresar: el mensaje de la función (ya se ingresó) llega a la persona', async () => {
      m.db = dbFalsa({}, [], () => ({ data: null, error: { code: 'P0001', message: 'El traspaso T-1 ya se ingresó o no existe; recarga la página' } })).db;
      expect(await ingresarTraspaso('T-1', { a1: '5' })).toEqual({ error: 'El traspaso T-1 ya se ingresó o no existe; recarga la página' });
    });

    it('eliminar: solo un traspaso sin ingresar', async () => {
      const f = dbFalsa({ com_movimientos: [t({ folio: 'T-1' }), t({ folio: 'T-2', estado: 'ingresado' })] });
      m.db = f.db;
      expect(await eliminarTraspaso('T-2')).toEqual({ error: 'Solo se puede eliminar un traspaso que aún no se ingresa' });
      expect(await eliminarTraspaso('T-1')).toEqual({ ok: true });
      expect(f.tablas.com_movimientos.map((x) => x.folio)).toEqual(['T-2']);
    });

    it('solo lectura: ninguna de las tres toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_catalogo: [{ sku: 'A' }], com_movimientos: [t({})] }, [], m.rpc);
      m.db = f.db;
      const SL = { error: 'Tu acceso a Comercializadora es de solo lectura.' };
      expect(await crearTraspaso(form())).toEqual(SL);
      expect(await ingresarTraspaso('T-1', { a: '1' })).toEqual(SL);
      expect(await eliminarTraspaso('T-1')).toEqual(SL);
      expect(f.consultas).toEqual([]);
      expect(m.rpc).not.toHaveBeenCalled();
    });
  });
});

describe('pantalla Traspasos', () => {
  const grupos = agruparTraspasos([t({ id: 'a1' }), t({ id: 'a2', sku: 'B', cantidad: 3, cantidad_original: 3 })] as never);
  it('nuevo traspaso con origen igual al destino: muestra el error sin llamar al servidor', () => {
    render(<Traspasos grupos={grupos} catalogo={[{ sku: 'A', nombre: 'Café' }]} editable hoy="2026-11-13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Nuevo traspaso' }));
    fireEvent.change(screen.getByLabelText('Destino'), { target: { value: 'CEDIS' } });
    fireEvent.change(screen.getByLabelText('SKU 1'), { target: { value: 'A' } });
    fireEvent.change(screen.getByLabelText('Cantidad 1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar traspaso' }));
    expect(screen.getByRole('alert')).toHaveTextContent('El origen y el destino deben ser distintos');
  });
  it('ingresar muestra una cantidad recibida por línea, con lo ordenado de inicio', () => {
    render(<Traspasos grupos={grupos} catalogo={[]} editable hoy="2026-11-13" />);
    fireEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(screen.getByLabelText('Recibido de A')).toHaveValue('5');
    expect(screen.getByLabelText('Recibido de B')).toHaveValue('3');
  });
  it('solo lectura: sin botones de escritura', () => {
    render(<Traspasos grupos={grupos} catalogo={[]} editable={false} hoy="2026-11-13" />);
    expect(screen.queryByRole('button', { name: 'Nuevo traspaso' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ingresar' })).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-traspasos.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/traspasos.ts`:

```ts
const n = (x: unknown) => Number(x) || 0;

export interface MovTraspaso {
  id: string;
  folio: string | null;
  fecha: string | null;
  sku: string;
  cantidad: number | null;
  cantidad_original: number | null;
  origen: string | null;
  destino: string | null;
  estado: string | null;
}
export interface GrupoTraspaso {
  folio: string;
  fecha: string | null;
  origen: string | null;
  destino: string | null;
  estado: 'ordenado' | 'ingresado';
  skus: number;
  uds: number;
  items: MovTraspaso[];
}
export const LUGARES = ['CEDIS', 'Yulius'] as const;
export interface FormTraspaso {
  folio: string;
  fecha: string;
  origen: string;
  destino: string;
  lineas: { sku: string; cantidad: number }[];
}

/** agrupar() de renderComTraspasos: piezas = lo ordenado (cantidad_original ?? cantidad). */
export function agruparTraspasos(filas: MovTraspaso[]): GrupoTraspaso[] {
  const g = new Map<string, MovTraspaso[]>();
  for (const r of filas) {
    const k = r.folio ?? '—';
    g.set(k, [...(g.get(k) ?? []), r]);
  }
  return [...g.entries()]
    .map(([folio, items]) => ({
      folio,
      fecha: items[0].fecha,
      origen: items[0].origen,
      destino: items[0].destino,
      estado: items.every((x) => x.estado === 'ingresado') ? ('ingresado' as const) : ('ordenado' as const),
      skus: items.length,
      uds: items.reduce((s, x) => s + n(x.cantidad_original ?? x.cantidad), 0),
      items,
    }))
    .sort((a, b) => String(b.fecha ?? '').localeCompare(String(a.fecha ?? '')));
}

/** Detalle del viejo: ordenado = original; ingresado = cantidad solo si ya hay original guardado. */
export function detalleTraspaso(r: MovTraspaso) {
  const ord = n(r.cantidad_original ?? r.cantidad);
  const ing = r.cantidad_original != null ? n(r.cantidad) : ord;
  return { ord, ing, dif: ing - ord };
}

/** Decisión 6: origen ≠ destino y SKUs del catálogo (el viejo no lo revisaba). */
export function validarTraspaso(f: FormTraspaso, skus: Set<string>): string | null {
  if (!f.folio.trim()) return 'Pon la referencia del traspaso';
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f.fecha)) return 'Pon la fecha del traspaso';
  const lugar = (x: string) => (LUGARES as readonly string[]).includes(x);
  if (!lugar(f.origen) || !lugar(f.destino)) return 'Elige el origen y el destino';
  if (f.origen === f.destino) return 'El origen y el destino deben ser distintos';
  const lineas = f.lineas.filter((l) => l.sku.trim() && Number(l.cantidad) > 0);
  if (!lineas.length) return 'Agrega al menos un artículo con cantidad';
  const malo = lineas.find((l) => !skus.has(l.sku.trim()));
  if (malo) return `SKU no encontrado: ${malo.sku.trim()}`;
  return null;
}

/** 'T-' + día (CDMX) + 3 dígitos al azar, como _comNuevoTraspaso. */
export const folioTraspaso = (hoy: string, azar: () => number = Math.random) =>
  `T-${hoy.replace(/-/g, '')}${Math.floor(azar() * 900) + 100}`;
```

Agregar a `acciones.ts`, con los imports `import { cantidadConteo } from '@/lib/comercializadora/inventario';` y `import { validarTraspaso, type FormTraspaso } from '@/lib/comercializadora/traspasos';`:

```ts
/** _comGuardarTraspaso, con las validaciones de la decisión 6 (catálogo y referencia única). */
export async function crearTraspaso(f: FormTraspaso): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const pedidos = f.lineas.map((l) => l.sku.trim()).filter(Boolean);
    const cat = await com(s.db).from('com_catalogo').select('sku').in('sku', pedidos);
    if (cat.error) return fallo(cat.error);
    const error = validarTraspaso(f, new Set((cat.data ?? []).map((c: { sku: string }) => c.sku)));
    if (error) return { error };
    const folio = f.folio.trim();
    const ya = await com(s.db).from('com_movimientos').select('id').eq('tipo', 'traspaso').eq('folio', folio).limit(1);
    if (ya.error) return fallo(ya.error);
    if (ya.data?.length) return { error: `Ya existe un traspaso con la referencia ${folio}` };
    const filas = f.lineas
      .filter((l) => l.sku.trim() && Number(l.cantidad) > 0)
      .map((l) => ({
        tipo: 'traspaso',
        folio,
        sku: l.sku.trim(),
        cantidad: Number(l.cantidad),
        cantidad_original: Number(l.cantidad),
        fecha: f.fecha,
        origen: f.origen,
        destino: f.destino,
        estado: 'ordenado',
      }));
    const r = await com(s.db).from('com_movimientos').insert(filas).select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/traspasos');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarIngreso en una transacción (com_ingresar_traspaso). `recibido`: id de la línea → texto capturado. */
export async function ingresarTraspaso(
  folio: string,
  recibido: Record<string, string>,
): Promise<Resultado<{ lineas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const cantidades: Record<string, number> = {};
    for (const [id, txt] of Object.entries(recibido)) {
      const c = cantidadConteo(txt);
      if (c == null) return { error: 'Revisa las cantidades recibidas: usa números de 0 en adelante' };
      cantidades[id] = c;
    }
    const r = await com(s.db).rpc('com_ingresar_traspaso', { p_folio: folio, p_recibido: cantidades });
    if (r.error) return r.error.code === 'P0001' ? { error: String(r.error.message) } : fallo(r.error);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, lineas: Number(r.data) || 0 };
  } catch (e) {
    return fallo(e);
  }
}

/** Decisión 6: solo se elimina lo que no se ha ingresado (borrar uno ingresado dejaría el 3PL sumado). */
export async function eliminarTraspaso(folio: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const ing = await com(s.db)
      .from('com_movimientos')
      .select('id')
      .eq('tipo', 'traspaso')
      .eq('folio', folio)
      .eq('estado', 'ingresado')
      .limit(1);
    if (ing.error) return fallo(ing.error);
    if (ing.data?.length) return { error: 'Solo se puede eliminar un traspaso que aún no se ingresa' };
    const r = await com(s.db)
      .from('com_movimientos')
      .delete()
      .eq('tipo', 'traspaso')
      .eq('folio', folio)
      .eq('estado', 'ordenado')
      .select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/traspasos');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

`cantidadConteo('0')`: confirmar que devuelve 0 y no null. La regex `^\d+(\.\d+)?$` acepta `0`, así que sí devuelve 0. El caso `a2: '0'` de la prueba lo fija.

`components/comercializadora/traspasos.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Tarjeta, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { textoDestino } from '@/lib/comercializadora/ordenes';
import {
  detalleTraspaso,
  folioTraspaso,
  LUGARES,
  validarTraspaso,
  type GrupoTraspaso,
} from '@/lib/comercializadora/traspasos';
import {
  crearTraspaso,
  eliminarTraspaso,
  ingresarTraspaso,
} from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;
type Linea = { sku: string; cantidad: string };

export function Traspasos(p: {
  grupos: GrupoTraspaso[];
  catalogo: { sku: string; nombre: string | null }[];
  editable: boolean;
  hoy: string;
}) {
  const router = useRouter();
  const [filtro, setFiltro] = useState<'' | 'ordenado' | 'ingresado'>('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [nuevo, setNuevo] = useState(false);
  const [folio, setFolio] = useState('');
  const [fecha, setFecha] = useState(p.hoy);
  const [origen, setOrigen] = useState<string>('CEDIS');
  const [destino, setDestino] = useState<string>('Yulius');
  const [lineas, setLineas] = useState<Linea[]>([{ sku: '', cantidad: '' }]);
  const [ingreso, setIngreso] = useState<{ folio: string; valores: Record<string, string> } | null>(null);
  const [detalle, setDetalle] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const skus = new Set(p.catalogo.map((c) => c.sku));
  const lista = p.grupos.filter((g) => !filtro || g.estado === filtro);

  const abrirNuevo = () => {
    setFolio(folioTraspaso(p.hoy));
    setFecha(p.hoy);
    setLineas([{ sku: '', cantidad: '' }]);
    setMsg(null);
    setNuevo(true);
  };
  const guardar = () => {
    const f = {
      folio,
      fecha,
      origen,
      destino,
      lineas: lineas.map((l) => ({ sku: l.sku, cantidad: Number(l.cantidad.replace(',', '.')) || 0 })),
    };
    const error = validarTraspaso(f, skus);
    if (error) return setMsg({ ok: false, t: error });
    iniciar(async () => {
      const r = await crearTraspaso(f);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setNuevo(false);
      setMsg({ ok: true, t: `Traspaso ${f.folio.trim()} guardado.` });
      router.refresh();
    });
  };
  const guardarIngreso = (g: GrupoTraspaso) =>
    iniciar(async () => {
      if (!ingreso) return;
      const r = await ingresarTraspaso(g.folio, ingreso.valores);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setIngreso(null);
      setMsg({
        ok: true,
        t:
          g.destino === 'Yulius'
            ? `Ingreso de ${g.folio} guardado: se sumó al 3PL.`
            : `Ingreso de ${g.folio} guardado. Regístralo en Zoho para que se refleje en el CEDIS.`,
      });
      router.refresh();
    });
  const eliminar = (g: GrupoTraspaso) => {
    if (!confirm(`¿Eliminar el traspaso ${g.folio}?`)) return;
    iniciar(async () => {
      const r = await eliminarTraspaso(g.folio);
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: `Traspaso ${g.folio} eliminado.` });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {p.editable ? (
          <button type="button" onClick={abrirNuevo} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
            Nuevo traspaso
          </button>
        ) : null}
        <label className="text-sm">
          <span className="sr-only">Estado</span>
          <select className={claseCampo} value={filtro} onChange={(e) => setFiltro(e.target.value as typeof filtro)}>
            <option value="">Todos</option>
            <option value="ordenado">Ordenados</option>
            <option value="ingresado">Ingresados</option>
          </select>
        </label>
      </div>

      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}>
          {msg.t}
        </p>
      ) : null}

      {nuevo ? (
        <Tarjeta titulo="Nuevo traspaso" descripcion="Entre el CEDIS y el 3PL. El 3PL se suma al ingresarlo.">
          <div className="grid gap-3 sm:grid-cols-4">
            <label className="text-sm">
              Referencia
              <input className={claseCampo} value={folio} onChange={(e) => setFolio(e.target.value)} />
            </label>
            <label className="text-sm">
              Fecha
              <input type="date" className={claseCampo} value={fecha} onChange={(e) => setFecha(e.target.value)} />
            </label>
            <label className="text-sm">
              Origen
              <select className={claseCampo} value={origen} onChange={(e) => setOrigen(e.target.value)}>
                {LUGARES.map((l) => (
                  <option key={l} value={l}>
                    {textoDestino(l)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              Destino
              <select className={claseCampo} value={destino} onChange={(e) => setDestino(e.target.value)}>
                {LUGARES.map((l) => (
                  <option key={l} value={l}>
                    {textoDestino(l)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="mt-4 space-y-2">
            {lineas.map((l, i) => (
              <div key={i} className="flex flex-wrap gap-2">
                <input
                  aria-label={`SKU ${i + 1}`}
                  list="skus-traspaso"
                  className={`${claseCampo} max-w-48`}
                  value={l.sku}
                  onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, sku: e.target.value } : x)))}
                />
                <input
                  aria-label={`Cantidad ${i + 1}`}
                  inputMode="decimal"
                  className={`${claseCampo} max-w-32`}
                  value={l.cantidad}
                  onChange={(e) => setLineas(lineas.map((x, j) => (j === i ? { ...x, cantidad: e.target.value } : x)))}
                />
              </div>
            ))}
            <datalist id="skus-traspaso">
              {p.catalogo.map((c) => (
                <option key={c.sku} value={c.sku}>
                  {c.nombre}
                </option>
              ))}
            </datalist>
            <button type="button" className="text-sm font-semibold underline" onClick={() => setLineas([...lineas, { sku: '', cantidad: '' }])}>
              Agregar línea
            </button>
          </div>
          <div className="mt-4 flex gap-2">
            <button type="button" disabled={pendiente} onClick={guardar} className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
              {pendiente ? 'Guardando…' : 'Guardar traspaso'}
            </button>
            <button type="button" onClick={() => setNuevo(false)} className="h-10 rounded-[10px] border border-line-strong px-4 text-sm font-semibold">
              Cerrar
            </button>
          </div>
        </Tarjeta>
      ) : null}

      {!lista.length ? (
        <Vacio titulo="Sin traspasos">Los traspasos entre el CEDIS y el 3PL aparecen aquí.</Vacio>
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Referencia</th>
                <th className="text-right">SKUs</th>
                <th className="text-right">Piezas</th>
                <th>Ruta</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((g) => (
                <tr key={g.folio}>
                  <td>{g.fecha ? fechaCorta(g.fecha) : '—'}</td>
                  <td>
                    <div className="font-medium">{g.folio}</div>
                    {detalle === g.folio ? (
                      <table className="mt-1 text-xs">
                        <tbody>
                          {g.items.map((i) => {
                            const d = detalleTraspaso(i);
                            return (
                              <tr key={i.id}>
                                <td className="pr-3">{i.sku}</td>
                                <td className="pr-3 text-right">ordenado {numero(d.ord)}</td>
                                <td className="pr-3 text-right">ingresado {numero(d.ing)}</td>
                                <td className={d.dif < 0 ? 'text-bad' : d.dif > 0 ? 'text-ok' : ''}>
                                  {d.dif > 0 ? '+' : ''}
                                  {numero(d.dif)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    ) : null}
                    {ingreso?.folio === g.folio ? (
                      <div className="mt-2 space-y-1">
                        {g.items.map((i) => (
                          <label key={i.id} className="flex items-center gap-2 text-xs">
                            <span className="w-24">{i.sku}</span>
                            <span className="text-muted-foreground">ordenado {numero(detalleTraspaso(i).ord)}</span>
                            <input
                              aria-label={`Recibido de ${i.sku}`}
                              inputMode="decimal"
                              className={`${claseCampo} h-8 max-w-24 text-right`}
                              value={ingreso.valores[i.id] ?? ''}
                              onChange={(e) => setIngreso({ ...ingreso, valores: { ...ingreso.valores, [i.id]: e.target.value } })}
                            />
                          </label>
                        ))}
                        <div className="flex gap-2 pt-1">
                          <button type="button" disabled={pendiente} onClick={() => guardarIngreso(g)} className="text-sm font-semibold underline">
                            {pendiente ? 'Guardando…' : 'Guardar ingreso'}
                          </button>
                          <button type="button" onClick={() => setIngreso(null)} className="text-sm underline">
                            Cancelar
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </td>
                  <td className="text-right tabular-nums">{g.skus}</td>
                  <td className="text-right tabular-nums">{numero(g.uds)}</td>
                  <td>
                    {textoDestino(g.origen)} → {textoDestino(g.destino)}
                  </td>
                  <td>
                    <Pill estado={g.estado === 'ingresado' ? 'ok' : 'bajo'}>{g.estado === 'ingresado' ? 'Ingresado' : 'Ordenado'}</Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    <button type="button" className="text-sm underline" onClick={() => setDetalle(detalle === g.folio ? null : g.folio)}>
                      {detalle === g.folio ? 'Ocultar' : 'Detalle'}
                    </button>
                    {p.editable && g.estado === 'ordenado' ? (
                      <>
                        <button
                          type="button"
                          className="ml-3 text-sm font-semibold underline"
                          onClick={() =>
                            setIngreso({
                              folio: g.folio,
                              valores: Object.fromEntries(g.items.map((i) => [i.id, String(Number(i.cantidad) || 0)])),
                            })
                          }
                        >
                          Ingresar
                        </button>
                        <button type="button" className="ml-3 text-sm text-bad underline" onClick={() => eliminar(g)}>
                          Eliminar
                        </button>
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button type="button" className="m-3 text-sm font-semibold underline" onClick={() => setVer(ver + POR_PAGINA)}>
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

`app/(comercializadora)/comercializadora/traspasos/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Traspasos } from '@/components/comercializadora/traspasos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { agruparTraspasos, type MovTraspaso } from '@/lib/comercializadora/traspasos';

export default async function TraspasosPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [filas, catalogo] = await Promise.all([
    leerTodoCom<MovTraspaso>(
      db,
      'com_movimientos',
      'id,folio,fecha,sku,cantidad,cantidad_original,origen,destino,estado',
      'id',
      (q) => q.eq('tipo', 'traspaso'),
    ),
    leerTodoCom<{ sku: string; nombre: string | null }>(db, 'com_catalogo', 'sku,nombre', 'sku', (q) =>
      q.neq('estatus', 'Inactivo'),
    ),
  ]);
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Traspasos"
        descripcion="Mercancía entre el CEDIS y el 3PL. Al ingresar a 3PL se suma a su saldo; el CEDIS se registra en Zoho."
      />
      <Traspasos
        grupos={agruparTraspasos(filas)}
        catalogo={catalogo}
        editable={puedeEditarCom(accesos)}
        hoy={hoyCdmx()}
      />
    </>
  );
}
```

El viejo cortaba en 1000 filas sin avisar; aquí se leen todas con `leerTodoCom`.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-traspasos.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/traspasos.ts components/comercializadora/traspasos.tsx "app/(comercializadora)/comercializadora/traspasos" "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-traspasos.test.tsx
git commit -m "feat(comercializadora): pantalla Traspasos con ingreso atómico al 3PL"
```

---

### Task 6: Mapeo SKU y navegación

**Files:**
- Create: `lib/comercializadora/mapeo.ts`
- Create: `components/comercializadora/mapeo.tsx`
- Create: `app/(comercializadora)/comercializadora/mapeo/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`guardarMapeo`, `borrarMapeo`)
- Modify: `components/portal/navegacion.tsx` (grupo Operación)
- Test: `tests/portal/com-mapeo.test.tsx`

**Interfaces:**
- Consumes: `ultimosPedidosLegado` (Tarea 2).
- Produces:
  - `interface Mapeo { shopify_nombre: string; sku: string | null; notas: string | null }`
  - `interface FilaMapeo { nombre: string; sku: string | null; notas: string | null; categoria: string | null; nombreSku: string | null; mapeado: boolean }`
  - `nombresDePedidos(p: { items: unknown; items_editados: unknown }[]): string[]`
  - `filasMapeo(nombres: string[], mapeos: Mapeo[], catalogo: { sku: string; nombre: string | null; categoria: string | null }[]): FilaMapeo[]`
  - `sinAcentos(t: string): string`
  - `filtrarMapeo(filas, f: { texto: string; estado: '' | 'mapeado' | 'pendiente'; categoria: string }): FilaMapeo[]`
  - `guardarMapeo(nombre: string, sku: string, notas: string): Promise<Resultado>`
  - `borrarMapeo(nombre: string): Promise<Resultado>`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-mapeo.test.tsx`:

```tsx
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh() {} }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { borrarMapeo, guardarMapeo } from '../../app/(comercializadora)/comercializadora/acciones';
import { filasMapeo, filtrarMapeo, nombresDePedidos } from '../../lib/comercializadora/mapeo';
import { Mapeo } from '../../components/comercializadora/mapeo';

const catalogo = [
  { sku: 'A', nombre: 'Café molido', categoria: 'Insumos' },
  { sku: 'B', nombre: 'Vaso 12 oz', categoria: 'Desechables' },
];

describe('Mapeo SKU (port de renderComMapeo)', () => {
  it('nombres de los pedidos: items_editados || items, también como texto JSON; sin vacíos ni repetidos', () => {
    expect(
      nombresDePedidos([
        { items: [{ nombre: 'Café 1 kg' }], items_editados: [{ nombre: 'Café 500 g' }] },
        { items: '[{"nombre":"Vaso 12 oz"},{"nombre":"  "}]', items_editados: null },
        { items: 'roto', items_editados: null },
        { items: [{ nombre: 'Vaso 12 oz' }, { sku: 'x' }], items_editados: null },
      ]),
    ).toEqual(['Café 500 g', 'Vaso 12 oz']);
  });

  it('filas: unión de mapeados y vistos en pedidos, ordenadas, con la categoría del SKU', () => {
    const f = filasMapeo(['Vaso 12 oz', 'Café 1 kg'], [{ shopify_nombre: 'Café 1 kg', sku: 'A', notas: 'kg' }, { shopify_nombre: 'Azúcar', sku: null, notas: null }], catalogo);
    expect(f.map((x) => [x.nombre, x.sku, x.mapeado, x.categoria])).toEqual([
      ['Azúcar', null, false, null],
      ['Café 1 kg', 'A', true, 'Insumos'],
      ['Vaso 12 oz', null, false, null],
    ]);
  });

  it('filtro: texto sin acentos (nombre o SKU), estado y categoría', () => {
    const f = filasMapeo(['Vaso 12 oz'], [{ shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }], catalogo);
    expect(filtrarMapeo(f, { texto: 'cafe', estado: '', categoria: '' }).map((x) => x.nombre)).toEqual(['Café 1 kg']);
    expect(filtrarMapeo(f, { texto: '', estado: 'pendiente', categoria: '' }).map((x) => x.nombre)).toEqual(['Vaso 12 oz']);
    expect(filtrarMapeo(f, { texto: '', estado: '', categoria: 'Insumos' }).map((x) => x.nombre)).toEqual(['Café 1 kg']);
  });

  describe('acciones', () => {
    beforeEach(() => {
      m.nivel = 'edicion';
    });
    it('guardar: inserta un mapeo nuevo y actualiza uno existente por nombre exacto', async () => {
      const f = dbFalsa({ com_catalogo: catalogo, com_sku_mapping: [{ id: '1', shopify_nombre: 'Café 1 kg', sku: 'B', notas: null }] });
      m.db = f.db;
      expect(await guardarMapeo('Café 1 kg', 'A', ' por kilo ')).toEqual({ ok: true });
      expect(await guardarMapeo('Vaso 12 oz', 'B', '')).toEqual({ ok: true });
      expect(f.tablas.com_sku_mapping.map((x) => [x.shopify_nombre, x.sku, x.notas])).toEqual([
        ['Café 1 kg', 'A', 'por kilo'],
        ['Vaso 12 oz', 'B', null],
      ]);
    });
    it('guardar: rechaza un SKU que no está en el catálogo', async () => {
      m.db = dbFalsa({ com_catalogo: catalogo, com_sku_mapping: [] }).db;
      expect(await guardarMapeo('Café 1 kg', 'ZZ', '')).toEqual({ error: 'Elige un SKU del catálogo' });
    });
    it('borrar quita el mapeo de ese nombre', async () => {
      const f = dbFalsa({ com_sku_mapping: [{ id: '1', shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }] });
      m.db = f.db;
      expect(await borrarMapeo('Café 1 kg')).toEqual({ ok: true });
      expect(f.tablas.com_sku_mapping).toEqual([]);
    });
    it('solo lectura: no toca la base', async () => {
      m.nivel = 'lectura';
      const f = dbFalsa({ com_catalogo: catalogo, com_sku_mapping: [] });
      m.db = f.db;
      const SL = { error: 'Tu acceso a Comercializadora es de solo lectura.' };
      expect(await guardarMapeo('X', 'A', '')).toEqual(SL);
      expect(await borrarMapeo('X')).toEqual(SL);
      expect(f.consultas).toEqual([]);
    });
  });
});

describe('pantalla Mapeo', () => {
  const filas = filasMapeo(['Vaso 12 oz'], [{ shopify_nombre: 'Café 1 kg', sku: 'A', notas: null }], catalogo);
  it('muestra el conteo de pendientes y el aviso si no se pudieron leer los pedidos', () => {
    render(<Mapeo filas={filas} catalogo={catalogo} editable={false} aviso="No se pudieron leer los pedidos del sitio viejo." />);
    expect(screen.getByText(/1 producto sin mapear/)).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('No se pudieron leer los pedidos del sitio viejo.');
    expect(screen.queryByRole('button', { name: /Asignar SKU/ })).not.toBeInTheDocument();
  });
  it('el filtro Pendiente deja solo los sin SKU', () => {
    render(<Mapeo filas={filas} catalogo={catalogo} editable aviso={null} />);
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'pendiente' } });
    expect(screen.getByText('Vaso 12 oz')).toBeInTheDocument();
    expect(screen.queryByText('Café 1 kg')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-mapeo.test.tsx`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`lib/comercializadora/mapeo.ts`:

```ts
export interface Mapeo {
  shopify_nombre: string;
  sku: string | null;
  notas: string | null;
}
export interface FilaMapeo {
  nombre: string;
  sku: string | null;
  notas: string | null;
  categoria: string | null;
  nombreSku: string | null;
  mapeado: boolean;
}

/** Nombres de producto de los pedidos (items_editados || items; pueden venir como texto JSON). Exactos: decisión 9. */
export function nombresDePedidos(pedidos: { items: unknown; items_editados: unknown }[]): string[] {
  const s = new Set<string>();
  for (const p of pedidos) {
    let its: unknown = p.items_editados || p.items;
    if (typeof its === 'string') {
      try {
        its = JSON.parse(its);
      } catch {
        its = null;
      }
    }
    if (!Array.isArray(its)) continue;
    for (const it of its) {
      const nombre = (it as { nombre?: unknown } | null)?.nombre;
      if (typeof nombre === 'string' && nombre.trim()) s.add(nombre);
    }
  }
  return [...s];
}

export function filasMapeo(
  nombres: string[],
  mapeos: Mapeo[],
  catalogo: { sku: string; nombre: string | null; categoria: string | null }[],
): FilaMapeo[] {
  const m = new Map(mapeos.map((x) => [x.shopify_nombre, x]));
  const c = new Map(catalogo.map((x) => [x.sku, x]));
  return [...new Set([...mapeos.map((x) => x.shopify_nombre), ...nombres])]
    .sort((a, b) => a.localeCompare(b, 'es'))
    .map((nombre) => {
      const x = m.get(nombre);
      const art = x?.sku ? c.get(x.sku) : undefined;
      return {
        nombre,
        sku: x?.sku ?? null,
        notas: x?.notas ?? null,
        categoria: art?.categoria ?? null,
        nombreSku: art?.nombre ?? null,
        mapeado: !!x?.sku,
      };
    });
}

/** norm() del viejo: sin acentos y en minúsculas. */
export const sinAcentos = (t: string) =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

export function filtrarMapeo(
  filas: FilaMapeo[],
  f: { texto: string; estado: '' | 'mapeado' | 'pendiente'; categoria: string },
): FilaMapeo[] {
  const t = sinAcentos(f.texto.trim());
  return filas.filter(
    (x) =>
      (!t || sinAcentos(x.nombre).includes(t) || sinAcentos(x.sku ?? '').includes(t)) &&
      (!f.estado || (f.estado === 'mapeado') === x.mapeado) &&
      (!f.categoria || x.categoria === f.categoria),
  );
}
```

Agregar a `acciones.ts`:

```ts
/** _comGuardarMapeo: upsert por nombre exacto de Shopify (decisión 9); el SKU tiene que existir en el catálogo. */
export async function guardarMapeo(nombre: string, sku: string, notas: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!nombre) return { error: 'Falta el nombre del producto' };
    const art = await com(s.db).from('com_catalogo').select('sku').eq('sku', sku).maybeSingle();
    if (art.error) return fallo(art.error);
    if (!art.data) return { error: 'Elige un SKU del catálogo' };
    const r = await com(s.db)
      .from('com_sku_mapping')
      .upsert({ shopify_nombre: nombre, sku, notas: notas.trim() || null }, { onConflict: 'shopify_nombre' })
      .select('shopify_nombre');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/mapeo');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function borrarMapeo(nombre: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await com(s.db).from('com_sku_mapping').delete().eq('shopify_nombre', nombre).select('shopify_nombre');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/mapeo');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

`components/comercializadora/mapeo.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { filtrarMapeo, type FilaMapeo } from '@/lib/comercializadora/mapeo';
import { borrarMapeo, guardarMapeo } from '@/app/(comercializadora)/comercializadora/acciones';

const POR_PAGINA = 25;

export function Mapeo(p: {
  filas: FilaMapeo[];
  catalogo: { sku: string; nombre: string | null; categoria: string | null }[];
  editable: boolean;
  aviso: string | null;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState('');
  const [estado, setEstado] = useState<'' | 'mapeado' | 'pendiente'>('');
  const [categoria, setCategoria] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const [editando, setEditando] = useState<{ nombre: string; sku: string; notas: string } | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const pendientes = p.filas.filter((f) => !f.mapeado).length;
  const categorias = [...new Set(p.catalogo.map((c) => c.categoria).filter((c): c is string => !!c))].sort();
  const lista = filtrarMapeo(p.filas, { texto, estado, categoria });

  const correr = (fn: () => Promise<{ error: string } | { ok: true }>, ok: string) =>
    iniciar(async () => {
      const r = await fn();
      setMsg('error' in r ? { ok: false, t: r.error } : { ok: true, t: ok });
      if (!('error' in r)) setEditando(null);
      router.refresh();
    });

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Liga el nombre con el que llega cada producto en los pedidos con su SKU. Sin SKU, su venta no cuenta para el
        mín/máx ni para el plan.
      </p>
      {p.aviso ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.aviso} Se muestran solo los nombres ya mapeados.
        </p>
      ) : null}
      {pendientes ? (
        <p className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          <b>
            {pendientes} producto{pendientes === 1 ? '' : 's'} sin mapear
          </b>
        </p>
      ) : null}
      <p className="text-sm">
        {p.filas.length} productos · {p.filas.length - pendientes} mapeados · {pendientes} pendientes
      </p>
      <div className="flex flex-wrap gap-2">
        <input aria-label="Buscar" placeholder="Buscar nombre o SKU" className={`${claseCampo} max-w-64`} value={texto} onChange={(e) => setTexto(e.target.value)} />
        <select aria-label="Estado" className={`${claseCampo} max-w-44`} value={estado} onChange={(e) => setEstado(e.target.value as typeof estado)}>
          <option value="">Todos</option>
          <option value="mapeado">Mapeados</option>
          <option value="pendiente">Pendientes</option>
        </select>
        <select aria-label="Categoría" className={`${claseCampo} max-w-56`} value={categoria} onChange={(e) => setCategoria(e.target.value)}>
          <option value="">Todas las categorías</option>
          {categorias.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`rounded-lg px-3 py-2 text-sm ${msg.ok ? 'placa' : 'bg-bad-soft text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {!lista.length ? (
        <Vacio titulo="Sin productos con ese filtro" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Nombre en pedidos</th>
                <th>SKU</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((f) => (
                <tr key={f.nombre}>
                  <td>{f.nombre}</td>
                  <td>
                    {editando?.nombre === f.nombre ? (
                      <div className="flex flex-wrap gap-2">
                        <select
                          aria-label={`SKU para ${f.nombre}`}
                          className={`${claseCampo} max-w-64`}
                          value={editando.sku}
                          onChange={(e) => setEditando({ ...editando, sku: e.target.value })}
                        >
                          <option value="">Elige…</option>
                          {p.catalogo.map((c) => (
                            <option key={c.sku} value={c.sku}>
                              {c.sku} · {c.nombre}
                            </option>
                          ))}
                        </select>
                        <input
                          aria-label="Notas"
                          placeholder="Notas (opcional)"
                          className={`${claseCampo} max-w-48`}
                          value={editando.notas}
                          onChange={(e) => setEditando({ ...editando, notas: e.target.value })}
                        />
                        <button
                          type="button"
                          disabled={pendiente || !editando.sku}
                          className="text-sm font-semibold underline"
                          onClick={() => correr(() => guardarMapeo(f.nombre, editando.sku, editando.notas), `${f.nombre} → ${editando.sku}`)}
                        >
                          {pendiente ? 'Guardando…' : 'Guardar'}
                        </button>
                        <button type="button" className="text-sm underline" onClick={() => setEditando(null)}>
                          Cancelar
                        </button>
                      </div>
                    ) : f.sku ? (
                      <span>
                        <b>{f.sku}</b>
                        <span className="block text-xs text-muted-foreground">
                          {f.nombreSku ?? ''}
                          {f.categoria ? ` · ${f.categoria}` : ''}
                        </span>
                      </span>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td>
                    <Pill estado={f.mapeado ? 'ok' : 'bajo'}>{f.mapeado ? 'Mapeado' : 'Pendiente'}</Pill>
                  </td>
                  <td className="whitespace-nowrap text-right">
                    {p.editable && editando?.nombre !== f.nombre ? (
                      <>
                        <button
                          type="button"
                          className="text-sm font-semibold underline"
                          onClick={() => setEditando({ nombre: f.nombre, sku: f.sku ?? '', notas: f.notas ?? '' })}
                        >
                          {f.sku ? 'Cambiar' : 'Asignar SKU'}
                        </button>
                        {f.sku ? (
                          <button
                            type="button"
                            className="ml-3 text-sm text-bad underline"
                            onClick={() => confirm(`¿Quitar el SKU de "${f.nombre}"?`) && correr(() => borrarMapeo(f.nombre), `${f.nombre}: mapeo quitado`)}
                          >
                            Quitar
                          </button>
                        ) : null}
                      </>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button type="button" className="m-3 text-sm font-semibold underline" onClick={() => setVer(ver + POR_PAGINA)}>
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

`app/(comercializadora)/comercializadora/mapeo/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Mapeo } from '@/components/comercializadora/mapeo';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { ultimosPedidosLegado } from '@/lib/comercializadora/legado';
import { filasMapeo, nombresDePedidos, type Mapeo as FilaBase } from '@/lib/comercializadora/mapeo';

export default async function MapeoPagina() {
  const { db, accesos } = await sesionComercializadora();
  const [mapeos, catalogo, pedidos] = await Promise.all([
    leerTodoCom<FilaBase>(db, 'com_sku_mapping', 'shopify_nombre,sku,notas', 'shopify_nombre'),
    leerTodoCom<{ sku: string; nombre: string | null; categoria: string | null }>(
      db,
      'com_catalogo',
      'sku,nombre,categoria',
      'sku',
    ),
    ultimosPedidosLegado(500),
  ]);
  const nombres = pedidos.ok ? nombresDePedidos(pedidos.datos) : [];
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Mapeo SKU"
        descripcion="Nombre del producto en los pedidos → artículo del catálogo."
      />
      <Mapeo
        filas={filasMapeo(nombres, mapeos, catalogo)}
        catalogo={catalogo}
        editable={puedeEditarCom(accesos)}
        aviso={pedidos.ok ? null : pedidos.error}
      />
    </>
  );
}
```

En `components/portal/navegacion.tsx`:
- importar de `lucide-react` `ArrowLeftRight`, `Link2` y `Send`, si no están ya (`LayoutDashboard` ya se importa);
- agregar el grupo **antes** de `'Comprar'` en `gruposComercializadora`:

```ts
  {
    titulo: 'Operación',
    enlaces: [
      { href: '/comercializadora/inicio', nombre: 'Inicio', icono: LayoutDashboard },
      { href: '/comercializadora/envios', nombre: 'Envíos', icono: Send },
      { href: '/comercializadora/traspasos', nombre: 'Traspasos', icono: ArrowLeftRight },
      { href: '/comercializadora/mapeo', nombre: 'Mapeo SKU', icono: Link2 },
    ],
  },
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-mapeo.test.tsx && npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/mapeo.ts components/comercializadora/mapeo.tsx "app/(comercializadora)/comercializadora/mapeo" "app/(comercializadora)/comercializadora/acciones.ts" components/portal/navegacion.tsx tests/portal/com-mapeo.test.tsx
git commit -m "feat(comercializadora): Mapeo SKU y grupo Operación en la navegación"
```

---

### Task 7: Producción, revisión en el navegador y PR

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npm run test:funciones && npx prettier --check "app/(comercializadora)" components/comercializadora lib/comercializadora "tests/portal/com-*" tests/portal/db-falsa.ts tests/db/comercializadora-operacion.test.ts`
Expected:
- todo verde, salvo la falla previa conocida `tests/migracion/paridad.test.ts` (Rappi);
- Deno 228 + 5 ignoradas.

Luego: `npx next build`. Expected: build correcto, con las 14 rutas de comercializadora.

- [ ] **Step 2: Grants en bliocjvq (con OK del usuario)**

Pedir OK explícito. Es un cambio en la base del sitio viejo, solo de permisos de lectura para el rol del puente:

```sql
grant select (monto, shopify_order_number) on public.pedidos to portal_puente;
grant select (sucursal, contacto) on public.aperturas to portal_puente;
```

Antes, confirmar con una lectura que las cuatro columnas existen en bliocjvq (`information_schema.columns`). Se aplica por la conexión de migración del viejo, sin imprimir URLs ni claves.

- [ ] **Step 3: Migración 49 en el portal (con OK del usuario)**

Igual que la 48: un script en el scratchpad que aplica el SQL en una transacción, la registra en `supabase_migrations.schema_migrations` y verifica:
- `select monto, shopify_order_number from com_legado_pedidos limit 1` y `select sucursal, contacto from com_legado_aperturas limit 1`, como service_role (postgres), responden sin error de permisos;
- `com_ingresar_traspaso` existe.

Si el puente responde "permission denied for column", falta el grant del Step 2: la transacción se revierte.

- [ ] **Step 4: Recorrido en el navegador (solo ver)**

Escritorio y 375 px, sin guardar nada en producción:
1. **Inicio:** comparar ventas del mes, % y pedidos activos con el Inicio del sitio viejo abierto el mismo día. Pueden diferir por la decisión 6 (día de CDMX, críticos sin tope) y la 7 (estado de OC por lo recibido).
2. **Envíos:** las pestañas cuentan folios; no pulsar "Marcar enviado".
3. **Traspasos:** la lista y el detalle; abrir "Nuevo traspaso" y cerrarlo sin guardar.
4. **Mapeo SKU:** el conteo de pendientes contra el viejo; no asignar.
5. Consola sin errores de la app, y sin desbordamiento horizontal a 375 px.

- [ ] **Step 5: Guía y PR**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 10. Inicio, Envíos, Traspasos y Mapeo (plan 3c)

- El puente lee además `pedidos.monto`, `pedidos.shopify_order_number`, `aperturas.sucursal` y `aperturas.contacto`. En bliocjvq, `portal_puente` necesita `grant select` de esas columnas (aplicado antes de la migración 49).
- Inicio y Mapeo leen el puente en el servidor con la llave de servicio (`SUPABASE_SECRET_KEY`); en Vercel debe existir en Production y Preview. Sin ella, Inicio muestra lo de `com_*` y avisa que no hay ventas.
- Ingresar un traspaso al 3PL suma a `saldo_yulius` en la misma transacción (`com_ingresar_traspaso`); al CEDIS se registra en Zoho.
- Crédito Comercializadora y los KPIs de pedidos (Fill rate, OTIF, entregas, encuestas, DSO) se migran con Pedidos. Ventas no se porta.
- Indicadores y DOH llegan con el plan 3d (necesitan el motor de planeación).
```

Commit, push de `feat/comercializadora-operacion` y PR con base `feat/comercializadora-inventario` (encima del #114).

---

## Self-review (hecho al escribir)

- **Cobertura del bloque 3c, tras las decisiones 1 a 3:**
  - Inicio: Tarea 3.
  - Tarjetas de Compras y Mermas de KPIs: Tarea 3.
  - Envíos: Tarea 4.
  - Traspasos: Tareas 1 y 5.
  - Mapeo SKU: Tarea 6.
  - Lo que sale del bloque, y a dónde va: Crédito y los KPIs de pedidos van con Pedidos; Ventas no se porta; Indicadores y DOH van a 3d.
- **Sin marcadores pendientes.** La ejecución confirma una cosa contra el código real, y dice cómo resolverla: el comportamiento de `for update` con RLS en PGlite (Tarea 1, Step 4).
- **Tipos consistentes:**
  - `Lectura`, `PedidoLegado` y `SIN_PUENTE` (Tarea 2) los usan las Tareas 3 y 6.
  - `MovCompra`/`OcGrupo`/`agruparOcs`/`resumenOcs` vienen del plan 3.
  - `cantidadConteo` viene del plan 3b.
  - `editorCom`, `fallo`, `SOLO_LECTURA` y `Resultado` son de `acciones.ts`.
  - `dbFalsa.upsert/range/neq` (Tarea 2) los usan las Tareas 2 y 6.
- **Review Focus → pruebas:**
  1. Puente caído: Tarea 2 ("si el puente falla"), Tarea 3 (pantalla sin ventas), Tarea 6 (aviso en Mapeo).
  2. Doble ingreso o doble marcado: Tarea 1 ("ya ingresado no se vuelve a sumar") y Tarea 4 ("dos veces").
  3. Medianoche: Tarea 3 (`diaCdmx`, `tendencia`).
  4. Solo lectura: Tareas 4, 5 y 6.
  5. Datos sucios: Tarea 3 (`montoPedido`), Tarea 5 (cantidades), Tarea 6 (`nombresDePedidos`).
