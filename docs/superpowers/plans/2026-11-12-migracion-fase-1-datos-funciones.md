# Comercializadora: datos, puente y funciones (plan 2 de 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Las tablas de Comercializadora viven en el portal con su RLS por módulo, sus datos copiados de bliocjvq, un puente de solo lectura a pedidos y aperturas, y las cuatro Edge Functions desplegadas en el proyecto del portal **sin efectos externos** (no mandan correos ni escriben en Zoho) y sin cron activo.

**Architecture:** Tres migraciones (base, puente, cron) siguen el patrón del CRM: `perfil_modulos` + `com_nivel()`. Las funciones se copian tal cual desde el repo viejo y solo cambian en tres puntos: nombres de las vistas del puente, un secreto compartido en vez de la llave anon y un interruptor de efectos externos que por omisión está apagado. Un script idempotente copia los datos con `jsonb_populate_recordset` y fuerza el modo simulación.

**Tech Stack:** Postgres (Supabase; PGlite en pruebas), `postgres_fdw`, `pg_cron` + `pg_net` + Vault, Edge Functions en Deno 2 (`deno test`), TypeScript + `pg` + Vitest para el script.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (sección "Fase 1": Datos, Puente de lectura `legado`, Funciones y cron). Plan anterior: `docs/superpowers/plans/2026-11-12-migracion-fase-0.md` (PR #111). Siguen el plan 3 (pantallas) y el plan 4 (paridad y cutover).

## Decisiones sobre el spec (tomadas al planear, 2026-11-12)

Revisar con el usuario antes de ejecutar. Cada una corrige algo que el spec no podía saber sin leer el código:

1. **Las tablas se quedan en `public` con prefijo `com_`, no en un esquema `comercializadora`.** Es la convención del repo (`crm_*`, `bi_*`, `sucursales_*`). Así las funciones siguen funcionando sin cambiar sus `.from("com_…")`, la guardia de lecturas ya cubre `public` y no hay que exponer otro esquema en el panel de Supabase.
2. **El puente se lee con vistas `public.com_legado_*` que solo puede leer `service_role`.** Sobre ellas se aplica `security_invoker`, y las tablas foráneas viven en el esquema privado `legado`. El spec ponía las vistas dentro de `legado`, pero PostgREST (y con él `supabase-js` en las funciones) solo alcanza esquemas expuestos. `anon` y `authenticated` no tienen permiso sobre las vistas ni sobre `legado`, y una prueba de guardia lo exige.
3. **El modo de las OCs sigue en `com_plan_config.config.auto.modo`** (`simulacion` | `real`), el campo que ya usan las funciones. No se agrega `modo_oc`. El script de copia lo deja **siempre** en `simulacion`.
4. **Interruptor de efectos externos.** Las funciones solo mandan correos o escriben en Zoho si el secreto `COM_EFECTOS_EXTERNOS` vale `si`. Mientras corran en paralelo con el sitio viejo (planes 2 a 4), en el portal queda sin definir. Así no hay correos duplicados, no se reenvían mínimos a Zoho y no se crean OCs, aunque alguien cambie el modo.
5. **Las funciones se autentican con un secreto compartido** (`x-com-secreto`, igual en Vault y en los secretos de las funciones) y se despliegan con `verify_jwt = false`. En el sitio viejo cualquiera con la llave anon (que es pública) puede disparar `zoho-generar-oc`. Las llaves nuevas del portal (`sb_publishable_…`) además no son JWT.
6. **Fuera de la copia:** `com_credito_abonos` (FK a `pedidos`, 0 filas: es del módulo Pedidos) y `com_proveedores` (0 filas; sus mínimos ya pasaron a `com_zoho_proveedor` en el sitio viejo).
7. **El duplicado de `minmax.ts` ya no existe:** en `origin/main` del repo viejo, `zoho-generar-oc` ya importa `../com-minmax/minmax.ts`. Se copia así.
8. **Correos:** `send-email` vive solo en el proyecto viejo y no está versionado. Durante la Fase 1, `correo.ts` lo llama por URL y llave configurables (`CORREO_URL`, `CORREO_LLAVE`). Moverlo al portal queda fuera de alcance, igual que `provider-notifications`.
9. **Bitácora solo de ediciones de personas.** Los triggers de bitácora de las tablas `com_*` llevan `when (auth.uid() is not null)`. `zoho-sync` actualiza el catálogo cada 30 min con `service_role` y llenaría la bitácora. Esos cambios ya quedan en `com_sync_cambios`.

## Global Constraints

- Fuente de las funciones: commit `a9e4a22` de `HelperHolding/thecoffee-comercializadora` (`origin/main`, incluye los PR #15 y #16, que son lo publicado). **No** usar la copia de trabajo local de ese repo: está en `feat/proveedores-sin-stock`, que es más vieja.
- Proyecto del portal: `jpqkmnfjwzniptszjuli`. Proyecto viejo: `bliocjvqwskvoxrumqby`. Pooler del viejo: `aws-1-us-east-2.pooler.supabase.com:5432`.
- Migraciones nuevas: `20261112000045_…`, `…46_…`, `…47_…`. La 42 está aplicada pero no registrada: **antes** de `npx supabase db push` se corre `npx supabase migration repair --status applied 20261106000042`. Esto requiere el OK del usuario.
- Nada escribe en producción (portal o viejo), despliega funciones ni guarda secretos sin el OK explícito del usuario en el chat.
- Ningún script imprime correos, contraseñas, hashes, llaves ni cadenas de conexión.
- El cron del portal **no** se activa en este plan. Las funciones se prueban una vez a mano.
- `COM_EFECTOS_EXTERNOS` no se define en el portal en este plan.
- Pruebas: `npm test` (Vitest + PGlite) y `npm run test:funciones` (Deno). La falla previa de `tests/migracion/paridad.test.ts` (Rappi) no es de este plan.

## Review Focus

1. **Un usuario sin módulo, o un externo (franquiciado o proveedor), lee algo de `com_*` o de `com_legado_*`.** Debe recibir 0 filas o `permission denied`, nunca datos. Lo cubren las Tareas 1 y 2.
2. **La copia corre dos veces o con datos que ya cambiaron.** No debe duplicar filas, sí debe actualizar las existentes y los ids nuevos del portal no deben chocar con los copiados (secuencias). Lo cubre la Tarea 6.
3. **Alguien cambia `auto.modo` a `real` en el portal mientras corre el viejo.** Igual no debe salir ninguna OC, correo ni escritura a Zoho. Lo cubre la Tarea 5 (interruptor).
4. **El historial de configuración pierde fechas o autor al copiarse.** El trigger de sello no debe pisar `created_at` ni `username` cuando escribe la migración. Lo cubre la Tarea 1.
5. **Una llamada a una función sin el secreto, o con uno incorrecto.** Debe responder 401 sin tocar la base. Lo cubre la Tarea 5.

---

### Task 1: Migración 45, tablas de Comercializadora con RLS por módulo

**Files:**
- Create: `supabase/migrations/20261112000045_comercializadora_base.sql`
- Create: `tests/db/comercializadora.test.ts`
- Modify: `tests/db/guardia-lectura.test.ts:6-12` (predicado `com_puede_leer`)
- Modify: `tests/db/utilidades.ts` (helper `darModulo`)

**Interfaces:**
- Produces: 17 tablas `public.com_*` con las columnas del sitio viejo (ver la lista abajo); `public.com_nivel() returns text`, `public.com_puede_leer() returns boolean`, `public.com_puede_editar() returns boolean`; `perfil_modulos.modulo` acepta `'comercializadora'`; `darModulo(db, userId, modulo, nivel)` en `tests/db/utilidades.ts`.
- Tablas y llaves (las usa la Tarea 6): `com_catalogo(sku)`, `com_catalogo_costo_historial(id)`, `com_kit_apertura(sku)`, `com_lead_times(sku)`, `com_minmax(sku)`, `com_movimientos(id text)`, `com_oc_auto(id)`, `com_pago_proyectado(id)`, `com_parametros(clave)`, `com_plan_config(id)`, `com_plan_config_historial(id)`, `com_proveedor_cierre(id)`, `com_sku_mapping(id)`, `com_sync_cambios(id)`, `com_sync_log(id)`, `com_zoho_oc_lineas(zoho_po_id, sku)`, `com_zoho_proveedor(vendor_id)`. Todos los `id` numéricos son `generated by default as identity` para que la copia conserve los ids.

- [ ] **Step 1: Helper de pruebas**

Agregar al final de `tests/db/utilidades.ts`:

```ts
export async function darModulo(
  db: PGlite,
  userId: string,
  modulo: 'crm' | 'sucursales' | 'sucursales_costeo' | 'bi' | 'comercializadora',
  nivel: 'desarrollador' | 'edicion' | 'lectura',
): Promise<void> {
  await db.query('insert into perfil_modulos (user_id, modulo, nivel) values ($1, $2, $3)', [userId, modulo, nivel]);
}
```

- [ ] **Step 2: Escribir las pruebas que fallan**

Crear `tests/db/comercializadora.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const TABLAS = [
  'com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times', 'com_minmax',
  'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
  'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
  'com_zoho_oc_lineas', 'com_zoho_proveedor',
];

async function sembrar(db: PGlite) {
  await db.exec(`
    insert into com_catalogo (sku, nombre) values ('CAF-001', 'Café');
    insert into com_lead_times (sku, dias) values ('CAF-001', 5);
    insert into com_oc_auto (corrida_id, origen, modo, vendor_id, lineas, estado)
      values (gen_random_uuid(), 'cron', 'simulacion', 'v1', '[]', 'simulada');
    insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"simulacion"}}');`);
}
const cuenta = async (db: PGlite, t: string) => num((await db.query<{ n: number }>(`select count(*) n from ${t}`)).rows[0].n);

describe('Comercializadora: tablas y acceso (migración 45)', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
    await sembrar(db);
  });

  it('crea las 17 tablas con RLS', async () => {
    const r = await db.query<{ t: string; rls: boolean }>(`
      select c.relname t, c.relrowsecurity rls from pg_class c join pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'com\\_%' order by 1`);
    expect(r.rows.map((f) => f.t)).toEqual([...TABLAS].sort());
    expect(r.rows.every((f) => f.rls)).toBe(true);
  });

  it.each(['admin', 'interno', 'franquiciado', 'proveedor'] as const)('%s sin módulo no lee nada', async (rol) => {
    const id = await crearUsuario(db, rol);
    const n = await comoUsuario(db, id, async () => {
      let total = 0;
      for (const t of TABLAS) total += await cuenta(db, t);
      return total;
    });
    expect(n).toBe(0);
  });

  it('lectura ve los datos pero no edita', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'lectura');
    await comoUsuario(db, id, async () => {
      expect(await cuenta(db, 'com_catalogo')).toBe(1);
      expect(await cuenta(db, 'com_oc_auto')).toBe(1);
      const r = await db.query(`update com_lead_times set dias = 9 where sku = 'CAF-001' returning sku`);
      expect(r.rows).toHaveLength(0);
    });
  });

  it('edición cambia lo editable y no lo que escriben las funciones', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, async () => {
      const r = await db.query(`update com_lead_times set dias = 7 where sku = 'CAF-001' returning sku`);
      expect(r.rows).toHaveLength(1);
      await expect(db.query(`update com_oc_auto set estado = 'creada'`)).rejects.toThrow(/permission denied/);
      await expect(db.query(`delete from com_proveedor_cierre`)).rejects.toThrow(/permission denied/);
    });
  });

  it('un módulo de un perfil inactivo no da acceso', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await db.query('update perfiles set activo = false where user_id = $1', [id]);
    expect(await comoUsuario(db, id, () => cuenta(db, 'com_catalogo'))).toBe(0);
  });

  it('la bitácora registra ediciones de personas por sku, y no las del servicio', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, () => db.query(`update com_lead_times set dias = 12 where sku = 'CAF-001'`));
    await db.query(`update com_lead_times set dias = 13 where sku = 'CAF-001'`); // sin auth.uid(): servicio
    const b = await db.query<{ registro_id: string; valor_nuevo: string }>(
      `select registro_id, valor_nuevo from bitacora
       where tabla = 'com_lead_times' and campo = 'dias' and valor_nuevo in ('12', '13') order by id`);
    expect(b.rows).toEqual([{ registro_id: 'CAF-001', valor_nuevo: '12' }]);
  });

  it('una sola OC real de cron por proveedor y día', async () => {
    const fila = `(gen_random_uuid(), 'cron', 'real', 'v9', '[]', 'creada', date '2026-11-12')`;
    const sql = `insert into com_oc_auto (corrida_id, origen, modo, vendor_id, lineas, estado, fecha) values ${fila}`;
    await db.query(sql);
    await expect(db.query(sql)).rejects.toThrow(/com_oc_auto_un_cron_dia/);
  });

  it('el sello del plan pone autor y hora del servidor, salvo en la migración', async () => {
    const id = await crearUsuario(db, 'interno');
    await darModulo(db, id, 'comercializadora', 'edicion');
    await comoUsuario(db, id, () =>
      db.query(`insert into com_plan_config_historial (clave, created_at, username) values ('x', '2020-01-01', 'falso')`));
    const h = await db.query<{ anio: number; username: string; uid: string }>(
      `select extract(year from created_at)::int anio, username, usuario_auth_uid::text uid
       from com_plan_config_historial where clave = 'x'`);
    expect(h.rows[0].anio).toBeGreaterThan(2020);
    expect(h.rows[0].username).toBe('Usuario interno');
    expect(h.rows[0].uid).toBe(id);

    await db.exec(`begin; set local app.origen = 'migracion';
      insert into com_plan_config_historial (id, clave, created_at, username) values (500, 'y', '2020-01-01', 'ana');
      commit;`);
    const m = await db.query<{ anio: number; username: string }>(
      `select extract(year from created_at)::int anio, username from com_plan_config_historial where id = 500`);
    expect(m.rows[0]).toEqual({ anio: 2020, username: 'ana' });
  });

  it('acepta ids copiados y luego sigue la secuencia sin chocar', async () => {
    await db.query(`insert into com_sync_log (id, proceso) values (1000, 'copia')`);
    await db.query(`select setval(pg_get_serial_sequence('public.com_sync_log', 'id'), 1000)`);
    const r = await db.query<{ id: number }>(`insert into com_sync_log (proceso) values ('nuevo') returning id`);
    expect(num(r.rows[0].id)).toBe(1001);
  });
});
```

En `tests/db/guardia-lectura.test.ts`, agregar `/com_puede_leer\(\)/,` a `PREDICADOS` (después de `/crm_puede_leer\(\)/,`).

- [ ] **Step 3: Correr y ver que fallan**

Run: `npx vitest run tests/db/comercializadora.test.ts`
Expected: FAIL (`relation "com_catalogo" does not exist` y similares).

- [ ] **Step 4: Escribir la migración**

Crear `supabase/migrations/20261112000045_comercializadora_base.sql`:

```sql
-- Comercializadora (spec 2026-11-12, Fase 1 · Datos; decisiones 1, 6 y 9 del plan 2). Tablas del sitio viejo
-- (bliocjvq) con su mismo nombre y columnas; el acceso pasa de usuarios.rol a perfil_modulos ('comercializadora').

-- 1. Módulo y nivel, igual que el CRM.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi', 'comercializadora'));

create function public.com_nivel() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select pm.nivel
  from public.perfil_modulos pm
  join public.perfiles p on p.user_id = pm.user_id
  where pm.user_id = auth.uid() and pm.modulo = 'comercializadora' and p.activo
    and (auth.jwt()->>'client_id') is null
$$;
create function public.com_puede_leer() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.com_nivel() is not null
$$;
create function public.com_puede_editar() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.com_nivel() in ('desarrollador', 'edicion'), false)
$$;
revoke all on function public.com_nivel(), public.com_puede_leer(), public.com_puede_editar() from public, anon;
grant execute on function public.com_nivel(), public.com_puede_leer(), public.com_puede_editar() to authenticated;

-- 2. Tablas (esquema real leído de bliocjvq, docs/migracion/esquema-legado.json).
create table public.com_catalogo (
  sku text primary key,
  nombre text, categoria text, sub text,
  saldo_cedis numeric default 0, saldo_yulius numeric default 0,
  estatus text default 'activo',
  created_at timestamptz default now(),
  costo_unitario numeric, proveedor_preferido text,
  cantidad_por_apertura numeric not null default 0 check (cantidad_por_apertura >= 0),
  minimo_compra_pzas numeric not null default 0 check (minimo_compra_pzas >= 0),
  multiplo_compra numeric not null default 1 check (multiplo_compra >= 1),
  dias_seguridad numeric check (dias_seguridad is null or dias_seguridad >= 0),
  origen text, modelo_negocio text, clasificacion text, clasificacion_detallada text, exclusivo_gdl boolean,
  zoho_actualizado timestamptz, zoho_item_id text unique, zoho_vendor_id text, zoho_vendor_name text,
  zoho_stock numeric, zoho_lead_time integer, zoho_sync_at timestamptz, yulius_actualizado_at timestamptz,
  zoho_stock_fisico numeric
);

create table public.com_catalogo_costo_historial (
  id bigint generated by default as identity primary key,
  sku text not null, costo_anterior numeric, costo_nuevo numeric not null,
  proveedor_anterior text, proveedor_nuevo text, fuente text default 'importacion_zoho',
  modificado_por text not null, rol text, created_at timestamptz default now()
);
create index com_catalogo_costo_historial_sku on public.com_catalogo_costo_historial (sku);

create table public.com_kit_apertura (
  sku text primary key,
  promedio_calc numeric not null default 0, aperturas_muestra integer not null default 0,
  manual numeric, kit numeric, calculado_at timestamptz not null default now()
);

create table public.com_lead_times (sku text primary key, dias integer default 0);

create table public.com_minmax (
  sku text primary key,
  venta_diaria numeric not null default 0, lead_time integer not null,
  kits_min numeric not null default 0, kits_max numeric not null default 0,
  minimo_calc numeric not null default 0, maximo_calc numeric not null default 0,
  minimo_manual numeric, maximo_manual numeric, minimo numeric, maximo numeric, nota text,
  calculado_at timestamptz not null default now()
);

create table public.com_movimientos (
  id text primary key default gen_random_uuid()::text,
  fecha date, tipo text, sku text, cantidad numeric, origen text, destino text, estado text, sucursal text,
  folio text, por text, fecha_envio date, fecha_arribo date, cantidad_original numeric,
  created_at timestamptz default now(), monto numeric, cantidad_recibida numeric default 0, realizado_por text,
  autorizado_por text, fecha_conteo date, motivo text, costo_unitario_momento numeric, saldo_nuevo numeric,
  proveedor text
);

create table public.com_oc_auto (
  id bigint generated by default as identity primary key,
  corrida_id uuid not null,
  creada_at timestamptz not null default now(),
  fecha date not null default ((now() at time zone 'America/Mexico_City'))::date,
  origen text not null check (origen in ('cron', 'manual')),
  modo text not null check (modo in ('simulacion', 'real')),
  vendor_id text, vendor_name text, zoho_po_id text, po_number text,
  lineas jsonb not null, monto numeric not null default 0,
  estado text not null check (estado in ('creada', 'simulada', 'error')),
  error text
);
create index com_oc_auto_fecha on public.com_oc_auto (fecha, modo, estado);
-- Guarda diaria: a lo más una OC automática real (cron) por proveedor y día, aun con corridas concurrentes.
create unique index com_oc_auto_un_cron_dia on public.com_oc_auto (fecha, vendor_id)
  where modo = 'real' and origen = 'cron' and estado = 'creada';

create table public.com_pago_proyectado (
  id bigint generated by default as identity primary key,
  calculado_at timestamptz not null,
  tipo text not null check (tipo in ('proyectado', 'comprometido')),
  sku text not null, nombre text, vendor_id text, vendor_name text,
  fecha_oc date not null, fecha_llegada date not null, fecha_pago date not null,
  cantidad numeric not null, costo numeric not null, monto numeric not null, zoho_po_id text,
  adelanto_cierre boolean not null default false, cierre_tarde boolean not null default false, cierre_id bigint,
  adelanto_minimo boolean not null default false, bajo_minimo boolean not null default false
);
create index com_pago_proyectado_calc on public.com_pago_proyectado (calculado_at);

create table public.com_parametros (
  clave text primary key, valor numeric not null, descripcion text, updated_at timestamptz not null default now()
);

create table public.com_plan_config (
  id integer primary key default 1 check (id = 1),
  config jsonb not null default '{}', version integer not null default 1,
  actualizado_por text, updated_at timestamptz not null default now()
);

create table public.com_plan_config_historial (
  id bigint generated by default as identity primary key,
  ambito text not null default 'config', clave text not null,
  valor_anterior jsonb, valor_nuevo jsonb, modificado_por text, username text, rol text,
  usuario_auth_uid uuid, created_at timestamptz not null default now()
);
create index com_plan_config_historial_created on public.com_plan_config_historial (created_at desc);

create table public.com_proveedor_cierre (
  id bigint generated by default as identity primary key,
  vendor_id text not null, vendor_name text not null, ini date not null, fin date not null,
  motivo text not null check (motivo in ('vacaciones', 'inventario', 'agotado', 'otro')),
  skus text[], notas text check (notas is null or char_length(notas) <= 500),
  cancelado boolean not null default false, aviso7_at timestamptz, aviso0_at timestamptz,
  creado_por text, creado_at timestamptz not null default now(), actualizado_at timestamptz not null default now(),
  constraint com_proveedor_cierre_fechas check (fin >= ini)
);
create index com_proveedor_cierre_vigentes on public.com_proveedor_cierre (fin) where not cancelado;

create table public.com_sku_mapping (
  id integer generated by default as identity primary key,
  shopify_nombre text not null unique, sku text not null, notas text, created_at timestamptz default now()
);

create table public.com_sync_cambios (
  id bigint generated by default as identity primary key,
  corrida uuid not null, creado_at timestamptz not null default now(),
  tabla text not null check (tabla in ('com_catalogo', 'com_lead_times', 'com_movimientos', 'com_zoho_proveedor')),
  clave text not null, campo text not null, antes jsonb, despues jsonb,
  aplicado boolean not null default true, origen text not null default 'zoho-sync'
);
create index com_sync_cambios_creado on public.com_sync_cambios (creado_at desc);

create table public.com_sync_log (
  id bigint generated by default as identity primary key,
  proceso text not null, inicio timestamptz not null default now(), fin timestamptz, ok boolean,
  resumen jsonb, error text
);
create index com_sync_log_proc on public.com_sync_log (proceso, inicio desc);

create table public.com_zoho_oc_lineas (
  zoho_po_id text not null, po_number text not null, status text not null, po_modified text,
  vendor_id text, vendor_name text, sku text not null,
  cantidad numeric not null default 0, cantidad_recibida numeric not null default 0, fecha_entrega date,
  es_auto boolean not null default false, synced_at timestamptz not null default now(), precio numeric, fecha_oc date,
  primary key (zoho_po_id, sku)
);

create table public.com_zoho_proveedor (
  vendor_id text primary key,
  nombre text, dias_credito integer not null default 0 check (dias_credito >= 0), etiqueta text,
  synced_at timestamptz not null default now(),
  minimo_compra numeric not null default 0 check (minimo_compra >= 0),
  minimo_origen text check (minimo_origen in ('plataforma', 'zoho', 'migracion')),
  minimo_editado_at timestamptz, minimo_editado_por text, minimo_zoho_visto numeric,
  minimo_pendiente boolean not null default false, minimo_error text
);

-- 3. Triggers del sitio viejo, adaptados a perfiles.
create function public.com_movimientos_id_auto() returns trigger language plpgsql set search_path = public, pg_temp as $$
begin
  if new.id is null or btrim(new.id) = '' then new.id := gen_random_uuid()::text; end if;
  return new;
end $$;
create trigger com_movimientos_id_auto before insert on public.com_movimientos
  for each row execute function public.com_movimientos_id_auto();

-- Autor y hora los pone el servidor; la migración (app.origen = 'migracion') conserva los del sitio viejo.
create function public.com_plan_sello_usuario() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  u record;
begin
  if current_setting('app.origen', true) = 'migracion' then
    return new;
  end if;
  if tg_table_name = 'com_plan_config_historial' then
    new.created_at := now();
    new.usuario_auth_uid := auth.uid();
  else
    new.updated_at := now();
  end if;
  select p.nombre, p.rol into u from public.perfiles p where p.user_id = auth.uid();
  if found then
    if tg_table_name = 'com_plan_config_historial' then
      new.username := u.nombre;
      new.modificado_por := u.nombre;
      new.rol := u.rol;
    else
      new.actualizado_por := u.nombre;
    end if;
  end if;
  return new;
end $$;
create trigger com_plan_config_sello before insert or update on public.com_plan_config
  for each row execute function public.com_plan_sello_usuario();
create trigger com_plan_historial_sello before insert on public.com_plan_config_historial
  for each row execute function public.com_plan_sello_usuario();

-- 4. Bitácora: la llave del registro también puede ser sku, vendor_id o clave (tablas de Comercializadora).
create or replace function registrar_bitacora() returns trigger
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_origen text := case current_setting('app.origen', true)
    when 'carga_masiva' then 'carga_masiva'
    when 'migracion' then case when auth.uid() is null then 'migracion' else 'portal' end
    else 'portal'
  end;
  v_viejo jsonb := case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end;
  v_nuevo jsonb := case when tg_op in ('UPDATE', 'INSERT') then to_jsonb(new) end;
  v_fila jsonb := coalesce(v_nuevo, v_viejo);
  v_registro text;
  v_receta uuid;
  v_campo text;
begin
  if v_origen = 'migracion' then
    return null;
  end if;
  v_registro := coalesce(v_fila ->> 'id', v_fila ->> 'user_id', v_fila ->> 'sku', v_fila ->> 'vendor_id',
                         v_fila ->> 'clave',
                         concat_ws(':', v_fila ->> 'producto_id', v_fila ->> 'linea_id', v_fila ->> 'tamano_id', v_fila ->> 'canal_id'));
  v_receta := case tg_table_name
    when 'recetas' then (v_fila ->> 'id')::uuid
    when 'producto_tamanos' then (v_fila ->> 'producto_id')::uuid
    when 'precio_canal_manual' then (v_fila ->> 'producto_id')::uuid
    when 'receta_lineas' then (v_fila ->> 'receta_id')::uuid
    when 'linea_cantidades' then (select receta_id from public.receta_lineas where id = (v_fila ->> 'linea_id')::uuid)
  end;
  if tg_op = 'UPDATE' then
    for v_campo in select jsonb_object_keys(v_nuevo) loop
      continue when v_campo = any (array['updated_at', 'updated_by', 'version', 'costo_unitario']);
      if (v_viejo -> v_campo) is distinct from (v_nuevo -> v_campo) then
        insert into public.bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
        values (tg_table_name, v_registro, v_receta, v_campo, v_viejo ->> v_campo, v_nuevo ->> v_campo, auth.uid(), v_origen);
      end if;
    end loop;
  else
    insert into public.bitacora (tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, usuario_id, origen)
    values (tg_table_name, v_registro, v_receta, '*', v_viejo::text, v_nuevo::text, auth.uid(), v_origen);
  end if;
  return null;
end $$;

-- 5. Permisos y RLS. Escriben las personas (por nivel) en lo editable; el resto solo lo escriben las funciones
--    (service_role). Cerrar el proveedor nunca se borra: se cancela (update cancelado = true), como en el viejo.
do $$
declare
  t text;
  todas text[] := array['com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times',
    'com_minmax', 'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
    'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
    'com_zoho_oc_lineas', 'com_zoho_proveedor'];
  altas text[] := array['com_catalogo', 'com_catalogo_costo_historial', 'com_lead_times', 'com_movimientos',
    'com_parametros', 'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping'];
  cambios text[] := array['com_catalogo', 'com_kit_apertura', 'com_lead_times', 'com_minmax', 'com_movimientos',
    'com_parametros', 'com_plan_config', 'com_proveedor_cierre', 'com_sku_mapping'];
  bajas text[] := array['com_catalogo', 'com_lead_times', 'com_movimientos', 'com_parametros', 'com_sku_mapping'];
  bitacora text[] := array['com_catalogo', 'com_kit_apertura', 'com_lead_times', 'com_minmax', 'com_movimientos',
    'com_parametros', 'com_plan_config', 'com_proveedor_cierre', 'com_sku_mapping'];
begin
  foreach t in array todas loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from anon, authenticated', t);
    execute format('grant all on public.%I to service_role', t);
    execute format('grant select on public.%I to authenticated', t);
    execute format('create policy lectura on public.%I for select to authenticated using ((select public.com_puede_leer()))', t);
  end loop;
  foreach t in array altas loop
    execute format('grant insert on public.%I to authenticated', t);
    execute format('create policy alta on public.%I for insert to authenticated with check ((select public.com_puede_editar()))', t);
  end loop;
  foreach t in array cambios loop
    execute format('grant update on public.%I to authenticated', t);
    execute format('create policy cambio on public.%I for update to authenticated '
      'using ((select public.com_puede_editar())) with check ((select public.com_puede_editar()))', t);
  end loop;
  foreach t in array bajas loop
    execute format('grant delete on public.%I to authenticated', t);
    execute format('create policy baja on public.%I for delete to authenticated using ((select public.com_puede_editar()))', t);
  end loop;
  -- Solo ediciones de personas: zoho-sync (service_role, sin auth.uid()) deja su rastro en com_sync_cambios.
  foreach t in array bitacora loop
    execute format('create trigger %I after insert or update or delete on public.%I for each row '
      'when (auth.uid() is not null) execute function public.registrar_bitacora()', t || '_bitacora', t);
  end loop;
end $$;
```

Las columnas `identity` no requieren permisos sobre su secuencia: basta el `insert` sobre la tabla.

- [ ] **Step 5: Correr y ver que pasan**

Run: `npx vitest run tests/db/comercializadora.test.ts tests/db/guardia-lectura.test.ts tests/db/bitacora.test.ts`
Expected: PASS. Si `bitacora.test.ts` falla, la llave nueva de `registrar_bitacora` cambió un `registro_id` esperado: revisar el caso, no relajar la prueba.

- [ ] **Step 6: Commit**

```bash
git add supabase/migrations/20261112000045_comercializadora_base.sql tests/db/comercializadora.test.ts tests/db/guardia-lectura.test.ts tests/db/utilidades.ts
git commit -m "feat(db): tablas de Comercializadora con RLS por módulo y bitácora de ediciones"
```

---

### Task 2: Migración 46, puente de solo lectura a pedidos y aperturas

**Files:**
- Create: `supabase/migrations/20261112000046_comercializadora_puente.sql`
- Create: `tests/db/comercializadora-puente.test.ts`
- Modify: `tests/db/guardia-lectura.test.ts` (esquema `legado` en la lista de privados)

**Interfaces:**
- Consumes: nada de la Tarea 1 salvo el patrón de permisos.
- Produces: vistas `public.com_legado_pedidos(id uuid, apertura_id text, fecha_pedido timestamptz, status text, items jsonb, items_editados jsonb, franquiciatario_email text, notas_shopify text, es_llenado_canal boolean, marketing_proyecto_id uuid)`, `public.com_legado_pedidos_apertura(pedido_id uuid)`, `public.com_legado_aperturas(id text, estatus text, fecha date)`; solo `service_role` las lee. En Supabase, `legado.*` son tablas foráneas del servidor `legado`; en PGlite, tablas locales vacías del mismo formato.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/db/comercializadora-puente.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const VISTAS = ['com_legado_pedidos', 'com_legado_pedidos_apertura', 'com_legado_aperturas'];

describe('puente legado (migración 46)', () => {
  it('service_role lee los pedidos del sitio viejo por las vistas, con solo las columnas de minmax', async () => {
    const db = await crearDbLocal();
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha) values ('A1', 'en_proceso', '2026-12-01');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items)
        values ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'entregado', '[]');
      insert into legado.pedidos_apertura (pedido_id) values ('00000000-0000-0000-0000-000000000001');`);
    await db.exec('set role service_role');
    const n = await db.query<{ n: number }>('select count(*) n from com_legado_pedidos');
    const cols = await db.query<{ c: string }>(`
      select column_name c from information_schema.columns where table_name = 'com_legado_pedidos' order by ordinal_position`);
    await db.exec('reset role');
    expect(num(n.rows[0].n)).toBe(1);
    expect(cols.rows.map((f) => f.c)).toEqual([
      'id', 'apertura_id', 'fecha_pedido', 'status', 'items', 'items_editados', 'franquiciatario_email',
      'notas_shopify', 'es_llenado_canal', 'marketing_proyecto_id',
    ]);
  });

  it.each(VISTAS)('%s: ni un usuario con Comercializadora la lee', async (vista) => {
    const db = await crearDbLocal();
    const id = await crearUsuario(db, 'admin');
    await darModulo(db, id, 'comercializadora', 'desarrollador');
    await expect(comoUsuario(db, id, () => db.query(`select * from ${vista}`))).rejects.toThrow(/permission denied/);
  });

  it('el esquema legado no se expone a usuarios', async () => {
    const db = await crearDbLocal();
    const r = await db.query<{ ok: boolean }>(`
      select has_schema_privilege('authenticated', 'legado', 'USAGE') or has_schema_privilege('anon', 'legado', 'USAGE') ok`);
    expect(r.rows[0].ok).toBe(false);
  });
});
```

En `tests/db/guardia-lectura.test.ts`, cambiar `unnest(array['migracion_legado', 'zoho_staging'])` por `unnest(array['migracion_legado', 'zoho_staging', 'legado'])`.

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/db/comercializadora-puente.test.ts`
Expected: FAIL (`relation "legado.aperturas" does not exist`).

- [ ] **Step 3: Migración**

Crear `supabase/migrations/20261112000046_comercializadora_puente.sql`:

```sql
-- Puente de solo lectura a pedidos y aperturas de bliocjvq (spec 2026-11-12, "Puente de lectura legado";
-- decisión 2 del plan 2). com-minmax los lee hasta que se migre Pedidos.
-- En Supabase: tablas foráneas (postgres_fdw) en el esquema privado legado. El user mapping (con la clave del
-- rol portal_puente de bliocjvq) NO va aquí: se crea a mano (docs/migracion/comercializadora.md).
-- En PGlite (pruebas): tablas locales vacías con el mismo formato.
create schema legado;
revoke all on schema legado from public, anon, authenticated;
grant usage on schema legado to service_role;

do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'postgres_fdw')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create extension if not exists postgres_fdw;
    create server legado foreign data wrapper postgres_fdw
      options (host 'aws-1-us-east-2.pooler.supabase.com', port '5432', dbname 'postgres', fetch_size '1000');
    create foreign table legado.pedidos (
      id uuid, apertura_id text, fecha_pedido timestamptz, status text, items jsonb, items_editados jsonb,
      franquiciatario_email text, notas_shopify text, es_llenado_canal boolean, marketing_proyecto_id uuid
    ) server legado options (schema_name 'public', table_name 'pedidos');
    create foreign table legado.pedidos_apertura (pedido_id uuid)
      server legado options (schema_name 'public', table_name 'pedidos_apertura');
    create foreign table legado.aperturas (id text, estatus text, fecha date)
      server legado options (schema_name 'public', table_name 'aperturas');
  else
    create table legado.pedidos (
      id uuid, apertura_id text, fecha_pedido timestamptz, status text, items jsonb, items_editados jsonb,
      franquiciatario_email text, notas_shopify text, es_llenado_canal boolean, marketing_proyecto_id uuid
    );
    create table legado.pedidos_apertura (pedido_id uuid);
    create table legado.aperturas (id text, estatus text, fecha date);
  end if;
end $$;
revoke all on all tables in schema legado from public, anon, authenticated;
grant select on all tables in schema legado to service_role;

-- PostgREST solo alcanza esquemas expuestos: las vistas van en public, pero solo service_role las lee.
create view public.com_legado_pedidos with (security_invoker = true) as
  select id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
         es_llenado_canal, marketing_proyecto_id
  from legado.pedidos;
create view public.com_legado_pedidos_apertura with (security_invoker = true) as
  select pedido_id from legado.pedidos_apertura;
create view public.com_legado_aperturas with (security_invoker = true) as
  select id, estatus, fecha from legado.aperturas;
revoke all on public.com_legado_pedidos, public.com_legado_pedidos_apertura, public.com_legado_aperturas
  from public, anon, authenticated;
grant select on public.com_legado_pedidos, public.com_legado_pedidos_apertura, public.com_legado_aperturas
  to service_role;
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/db/comercializadora-puente.test.ts tests/db/guardia-lectura.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261112000046_comercializadora_puente.sql tests/db/comercializadora-puente.test.ts tests/db/guardia-lectura.test.ts
git commit -m "feat(db): puente de solo lectura a pedidos y aperturas del sitio viejo"
```

---

### Task 3: Migración 47, invocación por cron con secreto (jobs inactivos)

**Files:**
- Create: `supabase/migrations/20261112000047_comercializadora_cron.sql`
- Modify: `tests/db/comercializadora.test.ts` (dos pruebas)

**Interfaces:**
- Produces: `public.com_invocar(fn text, body jsonb default '{}') returns bigint`, solo para `postgres`/`service_role`. Lee de Vault `project_url` y `com_secreto` y manda el encabezado `x-com-secreto`. En Supabase, los jobs `zoho-sync`, `com-minmax` y `zoho-generar-oc` se crean **inactivos**.

- [ ] **Step 1: Pruebas que fallan**

Agregar a `tests/db/comercializadora.test.ts`, dentro del `describe`:

```ts
  it('com_invocar existe y ningún usuario puede ejecutarla', async () => {
    const r = await db.query<{ auth: boolean; anon: boolean }>(`
      select has_function_privilege('authenticated', 'public.com_invocar(text, jsonb)', 'EXECUTE') auth,
             has_function_privilege('anon', 'public.com_invocar(text, jsonb)', 'EXECUTE') anon`);
    expect(r.rows[0]).toEqual({ auth: false, anon: false });
  });

  it('com_invocar manda el secreto en x-com-secreto, no la llave anon', async () => {
    const r = await db.query<{ d: string }>(`select pg_get_functiondef('public.com_invocar(text, jsonb)'::regprocedure) d`);
    expect(r.rows[0].d).toContain("'x-com-secreto'");
    expect(r.rows[0].d).toContain("name = 'com_secreto'");
    expect(r.rows[0].d).not.toContain('anon_key');
  });
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/db/comercializadora.test.ts -t com_invocar`
Expected: FAIL (`function public.com_invocar(text, jsonb) does not exist`).

- [ ] **Step 3: Migración**

Crear `supabase/migrations/20261112000047_comercializadora_cron.sql`:

```sql
-- Cron de Comercializadora (spec 2026-11-12, "Funciones y cron"; decisión 5 del plan 2).
-- Vault del portal (se crean a mano, nunca en el repo): 'project_url' = https://jpqkmnfjwzniptszjuli.supabase.co
-- y 'com_secreto' = el mismo valor que el secreto COM_SECRETO de las funciones.
-- plpgsql: su cuerpo no se valida al crearla, así que también se crea en PGlite (sin net ni vault).
create function public.com_invocar(fn text, body jsonb default '{}'::jsonb) returns bigint
language plpgsql security definer set search_path = '' as $$
begin
  return net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'project_url') || '/functions/v1/' || fn,
    headers := pg_catalog.jsonb_build_object('Content-Type', 'application/json',
      'x-com-secreto', (select decrypted_secret from vault.decrypted_secrets where name = 'com_secreto')),
    body := body,
    timeout_milliseconds := 120000);
end $$;
revoke execute on function public.com_invocar(text, jsonb) from public, anon, authenticated;

-- Jobs creados INACTIVOS: se activan en el cutover (plan 4), nunca mientras el viejo corra en Real.
do $$
declare
  j record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    create extension if not exists pg_cron with schema pg_catalog;
    create extension if not exists pg_net;
    perform cron.schedule('zoho-sync', '*/30 * * * *', $c$ select public.com_invocar('zoho-sync') $c$);
    perform cron.schedule('com-minmax', '30 12 * * *', $c$ select public.com_invocar('com-minmax') $c$);
    perform cron.schedule('zoho-generar-oc', '5 13 * * *',
      $c$ select public.com_invocar('zoho-generar-oc', '{"origen":"cron"}') $c$);
    for j in select jobid from cron.job where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc') loop
      perform cron.alter_job(j.jobid, active := false);
    end loop;
  end if;
end $$;
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/db/comercializadora.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261112000047_comercializadora_cron.sql tests/db/comercializadora.test.ts
git commit -m "feat(db): com_invocar con secreto compartido y jobs de cron inactivos"
```

---

### Task 4: Copiar las Edge Functions tal cual y correr sus pruebas

**Files:**
- Create: `supabase/functions/**` (copia de `a9e4a22`)
- Create: `supabase/functions/deno.json`
- Modify: `package.json` (script `test:funciones`)
- Modify: `supabase/config.toml` (`verify_jwt = false` por función)

**Interfaces:**
- Produces: `supabase/functions/{_shared,com-minmax,zoho-generar-oc,zoho-sync,zoho-proveedor-minimo}` idénticas al commit `a9e4a22`. `npm run test:funciones` corre todas las pruebas Deno.

- [ ] **Step 1: Copiar desde el commit exacto**

Desde la raíz de thecoffee-costeos:

```bash
git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" fetch origin
git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" ls-tree -r --name-only a9e4a22 supabase/functions | wc -l
git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" archive a9e4a22 supabase/functions | tar -x -C .
git status --short --untracked-files=all supabase/functions | wc -l
```

Expected: los dos conteos son iguales (41 al escribir este plan), en 5 carpetas.

- [ ] **Step 2: Configuración de Deno y script**

Crear `supabase/functions/deno.json`:

```json
{
  "imports": { "@std/assert": "jsr:@std/assert@1" }
}
```

En `package.json`, dentro de `"scripts"`, agregar después de `"test": "vitest run",`:

```json
    "test:funciones": "deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions",
```

En `supabase/config.toml`, al final:

```toml
# Comercializadora: se autentican con el secreto compartido x-com-secreto (plan 2, decisión 5), no con JWT.
[functions.zoho-sync]
verify_jwt = false
[functions.com-minmax]
verify_jwt = false
[functions.zoho-generar-oc]
verify_jwt = false
[functions.zoho-proveedor-minimo]
verify_jwt = false
```

- [ ] **Step 3: Correr las pruebas copiadas**

Run: `npm run test:funciones`
Expected: PASS, el mismo número de pruebas que en el repo viejo (`deno task test` en `a9e4a22`). Si algo falla aquí, es del entorno (versión de Deno o permisos), no de la lógica: se corrige el comando, no el código copiado.

- [ ] **Step 4: Commit**

```bash
git add supabase/functions supabase/config.toml package.json
git commit -m "feat(funciones): Edge Functions de Comercializadora copiadas de thecoffee-comercializadora@a9e4a22"
```

---

### Task 5: Adaptar las funciones: puente, secreto e interruptor de efectos

**Files:**
- Create: `supabase/functions/_shared/acceso.ts`, `supabase/functions/_shared/acceso_test.ts`
- Modify: `supabase/functions/_shared/zoho.ts` (`soloLectura`), `supabase/functions/_shared/zoho_test.ts`
- Modify: `supabase/functions/_shared/correo.ts`, create `supabase/functions/_shared/correo_test.ts`
- Modify: `supabase/functions/com-minmax/minmax.ts:88-112` (nombres del puente)
- Modify: los cuatro `index.ts`

**Interfaces:**
- Consumes: vistas `com_legado_*` (Tarea 2) y el encabezado `x-com-secreto` (Tarea 3).
- Produces: `efectosExternos(): boolean` y `autorizado(req: Request): boolean` en `_shared/acceso.ts`; `ZohoCfg.soloLectura?: boolean`; secretos de función `COM_SECRETO`, `COM_EFECTOS_EXTERNOS`, `CORREO_URL` y `CORREO_LLAVE`.

- [ ] **Step 1: Pruebas que fallan**

Crear `supabase/functions/_shared/acceso_test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { autorizado, efectosExternos } from "./acceso.ts";

const con = (h: Record<string, string>) => new Request("http://x/", { method: "POST", headers: h });

Deno.test("efectosExternos solo con COM_EFECTOS_EXTERNOS=si", () => {
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
  assertEquals(efectosExternos(), false);
  Deno.env.set("COM_EFECTOS_EXTERNOS", "SI ");
  assertEquals(efectosExternos(), false);
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si");
  assertEquals(efectosExternos(), true);
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
});

Deno.test("autorizado exige x-com-secreto igual a COM_SECRETO; sin secreto configurado, nadie pasa", () => {
  Deno.env.delete("COM_SECRETO");
  assertEquals(autorizado(con({ "x-com-secreto": "" })), false);
  Deno.env.set("COM_SECRETO", "s3cr3to-largo");
  assertEquals(autorizado(con({})), false);
  assertEquals(autorizado(con({ "x-com-secreto": "otro" })), false);
  assertEquals(autorizado(con({ "Authorization": "Bearer s3cr3to-largo" })), false);
  assertEquals(autorizado(con({ "x-com-secreto": "s3cr3to-largo" })), true);
  Deno.env.delete("COM_SECRETO");
});
```

Agregar a `supabase/functions/_shared/zoho_test.ts`:

```ts
Deno.test("soloLectura: GET pasa; POST y PUT se bloquean sin llamar a Zoho", async () => {
  const log: string[] = [];
  const z = new ZohoClient({ ...cfg([tok, { status: 200, body: { code: 0, contacts: [] } }], log), soloLectura: true });
  await z.get("/contacts");
  await assertRejects(() => z.post("/purchaseorders", {}), ZohoError, "sin efectos externos");
  await assertRejects(() => z.put("/contacts/1", {}), ZohoError, "sin efectos externos");
  assertEquals(log.filter((l) => !l.includes("/oauth/")).map((l) => l.split(" ")[0]), ["GET"]);
});
```

Crear `supabase/functions/_shared/correo_test.ts`:

```ts
import { assertEquals } from "@std/assert";
import { enviarCorreo } from "./correo.ts";

Deno.test("sin efectos externos no manda correos y responde ok", async () => {
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (() => { llamadas++; return Promise.resolve(new Response("{}")); }) as typeof fetch;
  try {
    assertEquals(await enviarCorreo(["a@b.mx"], "x", "<p>x</p>"), true);
    assertEquals(llamadas, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("con efectos usa CORREO_URL y CORREO_LLAVE", async () => {
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si");
  Deno.env.set("CORREO_URL", "https://viejo.example/functions/v1/send-email");
  Deno.env.set("CORREO_LLAVE", "llave-vieja");
  const original = globalThis.fetch;
  const vistos: string[] = [];
  globalThis.fetch = ((u: string, i?: RequestInit) => {
    vistos.push(`${u} ${(i?.headers as Record<string, string>).Authorization}`);
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    assertEquals(await enviarCorreo(["a@b.mx"], "x", "<p>x</p>"), true);
    assertEquals(vistos, ["https://viejo.example/functions/v1/send-email Bearer llave-vieja"]);
  } finally {
    globalThis.fetch = original;
    for (const k of ["COM_EFECTOS_EXTERNOS", "CORREO_URL", "CORREO_LLAVE"]) Deno.env.delete(k);
  }
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npm run test:funciones`
Expected: FAIL (`Module not found ".../acceso.ts"`, la prueba de `soloLectura` y la de correo sin efectos).

- [ ] **Step 3: Implementar**

Crear `supabase/functions/_shared/acceso.ts`:

```ts
/** Correos y escrituras a Zoho solo con COM_EFECTOS_EXTERNOS=si (plan 2, decisión 4). Apagado por omisión. */
export function efectosExternos(): boolean {
  return Deno.env.get("COM_EFECTOS_EXTERNOS") === "si";
}

/** El cron (com_invocar) y el portal mandan x-com-secreto; sin COM_SECRETO configurado no pasa nadie. */
export function autorizado(req: Request): boolean {
  const esperado = Deno.env.get("COM_SECRETO") ?? "";
  const recibido = req.headers.get("x-com-secreto") ?? "";
  if (!esperado || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}
```

En `supabase/functions/_shared/zoho.ts`:
- En `ZohoCfg`, agregar `soloLectura?: boolean;` después de `sleep?: …;`.
- Al inicio de `pedir`, antes de `const q = …`:

```ts
    if (this.cfg.soloLectura && method !== "GET") {
      throw new ZohoError(`Zoho en modo sin efectos externos: ${method} ${path} no se envió`, 0);
    }
```

- En `zohoDesdeEnv`, agregar `import { efectosExternos } from "./acceso.ts";` al inicio del archivo y pasar `soloLectura: !efectosExternos(),` en el objeto de `new ZohoClient({ … })`.

Reemplazar el cuerpo de `supabase/functions/_shared/correo.ts` por:

```ts
import { efectosExternos } from "./acceso.ts";

/**
 * Envía a cada destinatario; nunca lanza. Devuelve false si algún envío falló (ya registrado en console.error).
 * send-email vive en el proyecto viejo durante la Fase 1 (CORREO_URL, CORREO_LLAVE). Sin efectos externos no envía.
 */
export async function enviarCorreo(to: string[], subject: string, html: string, enviadoPor = "OCs automáticas"): Promise<boolean> {
  if (!efectosExternos()) {
    console.log(`correo omitido (sin efectos externos): ${subject} → ${to.length} destinatario(s)`);
    return true;
  }
  const url = Deno.env.get("CORREO_URL") ?? "";
  let ok = true;
  for (const dest of to) {
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + (Deno.env.get("CORREO_LLAVE") ?? "") },
        body: JSON.stringify({ area: "comercializadora", to: dest, subject, body_html: html, apertura_id: null, enviado_por: enviadoPor }),
      });
      if (!r.ok) {
        ok = false;
        console.error(`send-email ${dest}: HTTP ${r.status} ${(await r.text().catch(() => "")).slice(0, 300)}`);
      }
    } catch (e) {
      ok = false;
      console.error(`send-email ${dest}: ${(e as Error).message ?? e}`);
    }
  }
  return ok;
}
```

En `supabase/functions/com-minmax/minmax.ts`, dentro de `cargarEntradas`, reemplazar **solo los nombres de tabla** de las lecturas del sitio viejo:
- `db.from("pedidos_apertura")` → `db.from("com_legado_pedidos_apertura")`
- `db.from("aperturas")` → `db.from("com_legado_aperturas")`
- las cuatro `db.from("pedidos")` → `db.from("com_legado_pedidos")`

Verificar con: `grep -nE 'from\("(pedidos|pedidos_apertura|aperturas)"\)' supabase/functions -r` → sin resultados.

En cada `index.ts` (`com-minmax`, `zoho-generar-oc`, `zoho-sync`, `zoho-proveedor-minimo`), agregar el import `import { autorizado } from "../_shared/acceso.ts";` y, justo después del `if (req.method === "OPTIONS") …`, la línea:

```ts
  if (!autorizado(req)) return new Response(JSON.stringify({ ok: false, error: "No autorizado" }), { status: 401, headers: { "Content-Type": "application/json" } });
```

En `zoho-sync/index.ts` y `com-minmax/index.ts` el callback de `Deno.serve` no es `async` y la línea nueva solo regresa un `Response`, así que no cambia nada más.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npm run test:funciones`
Expected: PASS, todas, incluidas las de `minmax_test.ts` y `generar_test.ts` sin tocarlas. Si alguna prueba copiada de minmax arma su base falsa por nombre de tabla (`"pedidos"`), se renombra **en la prueba** al mismo nombre `com_legado_*` (es el mismo cambio, no lógica) y se registra en el ledger.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions
git commit -m "feat(funciones): puente legado, secreto compartido y efectos externos apagados por omisión"
```

---

### Task 6: Script de copia de datos de Comercializadora

**Files:**
- Create: `scripts/migracion-legado/comercializadora-lib.ts`
- Create: `scripts/migracion-legado/comercializadora.ts`
- Create: `tests/migracion-legado/comercializadora.test.ts`

**Interfaces:**
- Consumes: `conLegado`, `enPortal` y `Consultor` de `scripts/migracion-legado/conexion.ts`; tablas de la Tarea 1.
- Produces:
  - `TABLAS_COM: readonly { tabla: string; llave: string[]; secuencia?: string; editable: boolean }[]`
  - `copiarTabla(db: Consultor, t: TablaCom, filas: Record<string, unknown>[]): Promise<{ nuevas: number; actualizadas: number }>`
  - `forzarSimulacion(db: Consultor): Promise<boolean>` (true si cambió el modo)
  - `reporteCopia(r: ResultadoCopia[]): string`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/migracion-legado/comercializadora.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import {
  copiarTabla,
  forzarSimulacion,
  reporteCopia,
  TABLAS_COM,
} from '../../scripts/migracion-legado/comercializadora-lib';

const t = (nombre: string) => TABLAS_COM.find((x) => x.tabla === nombre)!;
const enMigracion = async <T>(db: PGlite, fn: () => Promise<T>) => {
  await db.exec(`begin; set local app.origen = 'migracion';`);
  try {
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
};

describe('copia de Comercializadora', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
  });

  it('cubre las 17 tablas y excluye créditos y proveedores sin uso', () => {
    expect(TABLAS_COM).toHaveLength(17);
    expect(TABLAS_COM.map((x) => x.tabla)).not.toContain('com_credito_abonos');
    expect(TABLAS_COM.map((x) => x.tabla)).not.toContain('com_proveedores');
  });

  it('inserta, y en una segunda corrida actualiza sin duplicar', async () => {
    const filas = [{ sku: 'A', dias: 3 }, { sku: 'B', dias: 4 }];
    expect(await enMigracion(db, () => copiarTabla(db, t('com_lead_times'), filas))).toEqual({ nuevas: 2, actualizadas: 0 });
    const r = await enMigracion(db, () => copiarTabla(db, t('com_lead_times'), [{ sku: 'A', dias: 9 }, { sku: 'B', dias: 4 }]));
    expect(r).toEqual({ nuevas: 0, actualizadas: 2 });
    expect((await db.query(`select sku, dias from com_lead_times order by sku`)).rows).toEqual([
      { sku: 'A', dias: 9 }, { sku: 'B', dias: 4 },
    ]);
  });

  it('conserva ids, arreglos y jsonb, y adelanta la secuencia', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_proveedor_cierre'), [{
      id: 41, vendor_id: 'v1', vendor_name: 'Prov', ini: '2026-12-20', fin: '2027-01-05', motivo: 'vacaciones',
      skus: ['A', 'B'], cancelado: false, creado_at: '2026-11-01T10:00:00Z', actualizado_at: '2026-11-01T10:00:00Z',
    }]));
    await enMigracion(db, () => copiarTabla(db, t('com_oc_auto'), [{
      id: 7, corrida_id: '00000000-0000-0000-0000-000000000007', creada_at: '2026-11-10T13:05:00Z', fecha: '2026-11-10',
      origen: 'cron', modo: 'real', vendor_id: 'v1', lineas: [{ sku: 'A', cantidad: 5 }], monto: 100, estado: 'creada',
    }]));
    const c = await db.query<{ skus: string[] }>(`select skus from com_proveedor_cierre where id = 41`);
    expect(c.rows[0].skus).toEqual(['A', 'B']);
    const o = await db.query<{ lineas: unknown }>(`select lineas from com_oc_auto where id = 7`);
    expect(o.rows[0].lineas).toEqual([{ sku: 'A', cantidad: 5 }]);
    const n = await db.query<{ id: number }>(
      `insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo) values ('v2','P','2027-01-01','2027-01-02','otro') returning id`);
    expect(Number(n.rows[0].id)).toBe(42);
  });

  it('ignora columnas que el portal no tiene y no escribe bitácora', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_catalogo'), [{ sku: 'A', nombre: 'Café', columna_vieja: 'x' }]));
    expect((await db.query(`select nombre from com_catalogo`)).rows).toEqual([{ nombre: 'Café' }]);
    expect((await db.query(`select * from bitacora where tabla like 'com\\_%'`)).rows).toHaveLength(0);
  });

  it('conserva fecha y autor del historial del plan', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_plan_config_historial'), [{
      id: 3, clave: 'seg.dias', username: 'ana', modificado_por: 'Ana', created_at: '2026-10-01T12:00:00Z',
    }]));
    const h = await db.query<{ u: string; f: string }>(`select username u, created_at::date::text f from com_plan_config_historial`);
    expect(h.rows).toEqual([{ u: 'ana', f: '2026-10-01' }]);
  });

  it('forzarSimulacion deja auto.modo en simulacion y conserva lo demás', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_plan_config'), [{
      id: 1, config: { auto: { modo: 'real', cobertura_dias: 15 }, seg: { dias: 10 } }, version: 4,
    }]));
    expect(await enMigracion(db, () => forzarSimulacion(db))).toBe(true);
    expect(await enMigracion(db, () => forzarSimulacion(db))).toBe(false);
    const c = await db.query<{ config: unknown }>(`select config from com_plan_config`);
    expect(c.rows[0].config).toEqual({ auto: { modo: 'simulacion', cobertura_dias: 15 }, seg: { dias: 10 } });
  });

  it('el reporte trae conteos por tabla, sin datos', () => {
    const txt = reporteCopia([{ tabla: 'com_lead_times', origen: 2, nuevas: 1, actualizadas: 1, destino: 2 }]);
    expect(txt).toContain('com_lead_times');
    expect(txt).toMatch(/origen 2 · nuevas 1 · actualizadas 1 · destino 2/);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/migracion-legado/comercializadora.test.ts`
Expected: FAIL (`Cannot find module '…/comercializadora-lib'`).

- [ ] **Step 3: Implementar la biblioteca**

Crear `scripts/migracion-legado/comercializadora-lib.ts`:

```ts
import type { Consultor } from './conexion';

export interface TablaCom {
  tabla: string;
  llave: string[];
  /** Columna identity a adelantar tras copiar (ids conservados del sitio viejo). */
  secuencia?: string;
  /** Las editan personas: se vuelven a copiar justo antes del cutover (plan 4). */
  editable: boolean;
}

// Plan 2, decisión 6: fuera com_credito_abonos (módulo Pedidos) y com_proveedores (sin uso).
export const TABLAS_COM: readonly TablaCom[] = [
  { tabla: 'com_catalogo', llave: ['sku'], editable: true },
  { tabla: 'com_catalogo_costo_historial', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_kit_apertura', llave: ['sku'], editable: true },
  { tabla: 'com_lead_times', llave: ['sku'], editable: true },
  { tabla: 'com_minmax', llave: ['sku'], editable: true },
  { tabla: 'com_movimientos', llave: ['id'], editable: true },
  { tabla: 'com_oc_auto', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_pago_proyectado', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_parametros', llave: ['clave'], editable: true },
  { tabla: 'com_plan_config', llave: ['id'], editable: true },
  { tabla: 'com_plan_config_historial', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_proveedor_cierre', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_sku_mapping', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_sync_cambios', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_sync_log', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_zoho_oc_lineas', llave: ['zoho_po_id', 'sku'], editable: false },
  { tabla: 'com_zoho_proveedor', llave: ['vendor_id'], editable: false },
];

export interface ResultadoCopia {
  tabla: string;
  origen: number;
  nuevas: number;
  actualizadas: number;
  destino: number;
}

const LOTE = 500;
const id = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function columnasPortal(db: Consultor, tabla: string): Promise<string[]> {
  const r = await db.query<{ c: string }>(
    `select column_name c from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [tabla],
  );
  return r.rows.map((f) => f.c);
}

/**
 * Upsert por llave dentro de la transacción de `db` (con app.origen = 'migracion': sin bitácora ni sellos).
 * Solo copia columnas que existen en ambos lados; los tipos los resuelve jsonb_populate_recordset.
 */
export async function copiarTabla(
  db: Consultor,
  t: TablaCom,
  filas: Record<string, unknown>[],
): Promise<{ nuevas: number; actualizadas: number }> {
  const enPortal = await columnasPortal(db, t.tabla);
  const cols = enPortal.filter((c) => filas.some((f) => c in f));
  const resto = cols.filter((c) => !t.llave.includes(c));
  let nuevas = 0;
  let actualizadas = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE).map((f) => Object.fromEntries(cols.map((c) => [c, f[c] ?? null])));
    const r = await db.query<{ nueva: boolean }>(
      `insert into public.${id(t.tabla)} (${cols.map(id).join(', ')}) overriding system value
       select ${cols.map(id).join(', ')} from jsonb_populate_recordset(null::public.${id(t.tabla)}, $1::jsonb)
       on conflict (${t.llave.map(id).join(', ')}) do ${resto.length ? `update set ${resto.map((c) => `${id(c)} = excluded.${id(c)}`).join(', ')}` : 'nothing'}
       returning (xmax = 0) as nueva`,
      [JSON.stringify(lote)],
    );
    for (const f of r.rows) f.nueva ? nuevas++ : actualizadas++;
  }
  if (t.secuencia)
    await db.query(
      `select setval(pg_get_serial_sequence('public.${t.tabla}', '${t.secuencia}'), m)
       from (select max(${id(t.secuencia)}) m from public.${id(t.tabla)}) x where m is not null`,
    );
  return { nuevas, actualizadas };
}

/** Plan 2, decisión 3: en el portal las OCs automáticas quedan en simulación hasta el cutover. */
export async function forzarSimulacion(db: Consultor): Promise<boolean> {
  const r = await db.query<{ id: number }>(
    `update public.com_plan_config
       set config = jsonb_set(coalesce(config, '{}'::jsonb), '{auto,modo}', '"simulacion"', true)
     where id = 1 and coalesce(config #>> '{auto,modo}', '') <> 'simulacion'
     returning id`,
  );
  return r.rows.length > 0;
}

export function reporteCopia(r: ResultadoCopia[]): string {
  return r
    .map((x) => `${x.tabla.padEnd(30)} origen ${x.origen} · nuevas ${x.nuevas} · actualizadas ${x.actualizadas} · destino ${x.destino}`)
    .join('\n');
}
```

`overriding system value` es obligatorio en las tablas `identity`. En las demás Postgres lo ignora.

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/migracion-legado/comercializadora.test.ts`
Expected: PASS (7/7).

- [ ] **Step 5: CLI**

Crear `scripts/migracion-legado/comercializadora.ts`:

```ts
import { conLegado, enPortal } from './conexion';
import { copiarTabla, forzarSimulacion, reporteCopia, type ResultadoCopia, TABLAS_COM } from './comercializadora-lib';

/**
 * Plan 2 · Copia las tablas com_* de bliocjvq al portal. Simulación por omisión (cuenta, no escribe).
 *   npx tsx scripts/migracion-legado/comercializadora.ts [--aplicar] [--solo-editables]
 * Una transacción en el portal con app.origen = 'migracion'; deja auto.modo en 'simulacion'. Solo imprime conteos.
 */
const aplicar = process.argv.includes('--aplicar');
const tablas = process.argv.includes('--solo-editables') ? TABLAS_COM.filter((t) => t.editable) : TABLAS_COM;

const origen = await conLegado(async (db) => {
  const datos = new Map<string, Record<string, unknown>[]>();
  // to_jsonb: fechas y numéricos llegan como texto/JSON de Postgres, sin pasar por Date de JS (evita corrimientos).
  for (const t of tablas)
    datos.set(
      t.tabla,
      (await db.query<{ f: Record<string, unknown> }>(`select to_jsonb(x) f from public.${t.tabla} x`)).rows.map((r) => r.f),
    );
  return datos;
});

class Simulacion extends Error {}
const resultados: ResultadoCopia[] = [];
let modoForzado = false;
await enPortal(async (db) => {
  for (const t of tablas) {
    const filas = origen.get(t.tabla)!;
    const { nuevas, actualizadas } = await copiarTabla(db, t, filas);
    const destino = Number((await db.query<{ n: string }>(`select count(*) n from public.${t.tabla}`)).rows[0].n);
    resultados.push({ tabla: t.tabla, origen: filas.length, nuevas, actualizadas, destino });
  }
  modoForzado = await forzarSimulacion(db);
  if (!aplicar) throw new Simulacion();
}).catch((e) => {
  if (!(e instanceof Simulacion)) throw e;
});

console.log(reporteCopia(resultados));
console.log(modoForzado ? '\nauto.modo pasó a simulacion en el portal.' : '\nauto.modo ya estaba en simulacion.');
console.log(aplicar ? '\nAplicado.' : '\nSimulación: se revirtió todo. Corre con --aplicar para escribir.');
```

Run: `npx tsc --noEmit -p .`
Expected: sin errores.

- [ ] **Step 6: Commit**

```bash
git add scripts/migracion-legado/comercializadora-lib.ts scripts/migracion-legado/comercializadora.ts tests/migracion-legado/comercializadora.test.ts
git commit -m "feat(migracion): copia idempotente de las tablas de Comercializadora"
```

---

### Task 7: Guía de operación y corrida real (con OK del usuario en cada paso)

**Files:**
- Create: `docs/migracion/comercializadora.md`

**Interfaces:**
- Consumes: todo lo anterior.
- Produces: portal con migraciones 45 a 47, puente conectado, funciones desplegadas sin efectos externos, datos copiados y una corrida manual de cada función registrada en `com_sync_log`.

- [ ] **Step 1: Escribir la guía**

Crear `docs/migracion/comercializadora.md`:

````markdown
# Comercializadora en el portal: guía de operación (plan 2)

Spec: `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md`. Plan: `docs/superpowers/plans/2026-11-12-migracion-fase-1-datos-funciones.md`.

## 1. Migraciones 45 a 47 en el portal

La 42 está en la base pero no en el historial: primero se registra y luego se aplica lo pendiente.

```bash
npx supabase link --project-ref jpqkmnfjwzniptszjuli
npx supabase migration repair --status applied 20261106000042
npx supabase db push
```

`db push` debe listar solo la 45, la 46 y la 47.

## 2. Rol del puente en bliocjvq (SQL Editor del proyecto viejo)

```sql
create role portal_puente with login password '<clave larga, solo letras y números>';
alter role portal_puente set default_transaction_read_only = on;
alter role portal_puente bypassrls;
grant select (id, apertura_id, fecha_pedido, status, items, items_editados, franquiciatario_email, notas_shopify,
              es_llenado_canal, marketing_proyecto_id) on public.pedidos to portal_puente;
grant select (pedido_id) on public.pedidos_apertura to portal_puente;
grant select (id, estatus, fecha) on public.aperturas to portal_puente;
```

## 3. User mapping en el portal (SQL Editor del proyecto nuevo)

```sql
create user mapping for service_role server legado
  options (user 'portal_puente.bliocjvqwskvoxrumqby', password '<la misma clave>');
create user mapping for postgres server legado
  options (user 'portal_puente.bliocjvqwskvoxrumqby', password '<la misma clave>');
select count(*) from public.com_legado_aperturas;  -- debe dar el mismo número que aperturas en bliocjvq
```

## 4. Secretos y Vault del portal

Funciones (Project Settings → Edge Functions → Secrets, o `npx supabase secrets set`):

| Secreto | Valor |
| --- | --- |
| `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID`, `ZOHO_LOCATION_ID` | los mismos del proyecto viejo |
| `COM_SECRETO` | una clave larga nueva |
| `CORREO_URL` | `https://bliocjvqwskvoxrumqby.supabase.co/functions/v1/send-email` |
| `CORREO_LLAVE` | la llave anon del proyecto viejo |
| `COM_EFECTOS_EXTERNOS` | **no se define** hasta el cutover (plan 4) |

Vault (Project Settings → Vault): `project_url` = `https://jpqkmnfjwzniptszjuli.supabase.co` y `com_secreto` = el mismo valor que `COM_SECRETO`.

## 5. Desplegar funciones

```bash
npx supabase functions deploy zoho-sync com-minmax zoho-generar-oc zoho-proveedor-minimo --project-ref jpqkmnfjwzniptszjuli --use-api
```

## 6. Copiar datos

```bash
npx tsx scripts/migracion-legado/comercializadora.ts
npx tsx scripts/migracion-legado/comercializadora.ts --aplicar
```

La primera es simulación. La segunda escribe. Al final, `auto.modo` queda en `simulacion`.

## 7. Prueba manual (sin cron, sin efectos)

En el SQL Editor del portal, una a la vez y revisando `com_sync_log` entre cada una:

```sql
select public.com_invocar('zoho-sync');
select public.com_invocar('com-minmax');
select public.com_invocar('zoho-generar-oc', '{"origen":"manual","modo":"simulacion"}');
select proceso, ok, error, inicio from public.com_sync_log order by inicio desc limit 5;
```

El cron sigue inactivo: `select jobname, active from cron.job;` debe mostrar los tres jobs con `active = false`.
````

- [ ] **Step 2: Commit de la guía**

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(migracion): guía de operación de Comercializadora en el portal"
```

- [ ] **Step 3: Corrida real, paso a paso.** Antes de cada uno se pide el OK explícito del usuario en el chat.

1. Secciones 1 a 3 de la guía. El usuario corre el SQL de bliocjvq y del mapping, que llevan una clave que el agente no ve. Verificación del agente con `DATABASE_URL`, en solo lectura: los conteos de `com_legado_pedidos`, `com_legado_pedidos_apertura` y `com_legado_aperturas` (como `service_role` o `postgres`) son iguales a los de `pedidos`, `pedidos_apertura` y `aperturas` en bliocjvq (`conLegado`).
2. Sección 4: la hace el usuario. Sección 5: el agente despliega con el OK. Verificación: una llamada sin `x-com-secreto` a `…/functions/v1/com-minmax` responde 401.
3. Sección 6: el agente corre la simulación, muestra el reporte y aplica con el OK. Verificación: `origen = destino` en las 17 tablas y `auto.modo = simulacion`.
4. Sección 7, con el OK. Verificación:
   - Las tres corridas tienen `ok = true` en `com_sync_log`.
   - `com_minmax` del portal tiene el mismo número de SKUs que el del viejo.
   - No se creó ninguna OC real: `select count(*) from com_oc_auto where modo = 'real' and creada_at > now() - interval '1 hour'` da 0.
   - En los logs de la función aparece "correo omitido (sin efectos externos)".

- [ ] **Step 4: Abrir PR** con el resumen, la lista de decisiones (de este plan) y lo verificado en producción.

---

## Self-review (hecho al escribir)

- **Cobertura del spec, Fase 1:**
  - Datos: Tareas 1 y 6.
  - Puente: Tarea 2, y la sección 2 y 3 de la guía.
  - Funciones y cron: Tareas 3, 4 y 5.
  - Pantallas: plan 3. Cutover y paridad: plan 4.
  - Spec "RLS por nivel y por tipo de perfil": pruebas de la Tarea 1.
  - Spec "índice una OC Real por proveedor y día": Tarea 1.
  - Spec "vistas sobre legado con tablas locales": Tarea 2.
  - Spec "pruebas Deno pasan sin cambios de lógica": Tareas 4 y 5.
  - Spec "script de copia con PGlite": Tarea 6.
- **Fuera de este plan, a propósito:**
  - Asignar el módulo `comercializadora` a las personas: en el plan 4, con la lista del sitio viejo (`es_equipo_interno` + proveedor con `supplier_key = 'comercializadora'`).
  - Registrar el módulo en `lib/portal/modulos.ts`: en el plan 3, junto con su primera pantalla.
  - Paridad: en el plan 4.
- **Tipos consistentes:**
  - `TablaCom`/`TABLAS_COM` (Tarea 6) usan las llaves de la Tarea 1.
  - Las vistas `com_legado_*` (Tarea 2) son las que renombra la Tarea 5.
  - `x-com-secreto`/`com_secreto` (Tarea 3) es lo que lee `autorizado` (Tarea 5).
