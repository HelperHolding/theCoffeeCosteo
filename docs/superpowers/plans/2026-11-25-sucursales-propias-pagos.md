# Pagos de Sucursales propias — plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Subir el ZIP de recibos Banregio de una corrida, empatar cada transferencia con las facturas abiertas del proveedor en Zoho Books (org Sucursales The Coffee – GDL) y, tras revisión, registrar los pagos en Zoho con el recibo adjunto, desde un grupo nuevo «Sucursales propias · Helper Holding» dentro del módulo Sucursales.

**Architecture:** La lectura de PDFs y el empate son funciones puras en `lib/sucursales-propias/` (Node, probadas con Vitest). Todo lo que habla con Zoho vive en una Edge Function nueva `zoho-suc-pagos` (Deno), que exige el secreto del portal y el JWT del usuario, y cuyo núcleo `_shared/sucPagos.ts` es puro y se prueba con Zoho y base simulados. La base guarda corridas, transferencias, asignaciones y equivalencias CLABE→proveedor con RLS por el acceso nuevo `sucursales_pagos`; los recibos van a un bucket privado.

**Tech Stack:** Next.js 16 (App Router, route handlers, server actions), Supabase (Postgres + RLS, Storage, Edge Functions Deno), Zoho Books API v3, `unpdf` (texto de PDF), `fflate` (ZIP), Vitest + PGlite, `deno test`.

**Spec:** `docs/superpowers/specs/2026-11-25-sucursales-propias-pagos-design.md`

## Global Constraints

- Lee `node_modules/next/dist/docs/` antes de escribir código de Next (AGENTS.md): esta versión de Next tiene cambios incompatibles.
- Migración nueva: `supabase/migrations/20261125000098_sucursales_propias_pagos.sql` (la 097 ya la usa `feat/reporte-semanal`).
- Acceso nuevo `sucursales_pagos` en `perfil_modulos`: `lectura` = ver; `edicion` o `desarrollador` = subir, ajustar y aplicar.
- Empleado Holding = rol `compras`, `operaciones`, `finanzas`, `admin`, `sucursales` o `interno`. Nunca `franquiciado`, `tienda` ni `proveedor`.
- Cuenta «Pagado a través de» en Zoho: nombre que empieza con `BANREGIO - CONSOLIDADO SUCURSALES PROPIAS`; su id se resuelve una vez y se guarda en `suc_pago_config`.
- Escrituras a Zoho solo con `SUC_PAGOS_EFECTOS=si` (bandera propia, independiente de `COM_EFECTOS_EXTERNOS`).
- Secretos de la Edge Function: `ZOHO_SUC_CLIENT_ID`, `ZOHO_SUC_CLIENT_SECRET`, `ZOHO_SUC_REFRESH_TOKEN`, `ZOHO_SUC_ORG_ID`, más `COM_SECRETO` (ya existe). En Vercel: `ZOHO_SUC_ORG_ID` (solo para armar enlaces a Zoho).
- Dinero siempre en centavos enteros al comparar o sumar (`Math.round(x * 100)`).
- CLABE, RFC y correos nunca en logs, avisos ni mensajes de error: en textos se muestran solo los últimos 4 dígitos (`…1234`).
- Subida del ZIP por route handler `POST /api/sucursales/propias/pagos`, máximo 4 MB.
- Rutas de pantalla: `/sucursales/propias/pagos` y `/sucursales/propias/pagos/[corridaId]`.
- Textos de interfaz en español, con el tono del resto del portal; comentarios de código en español.
- Formato: `npm run format:check` debe pasar (Prettier del repo).

## Review Focus

1. **Subir el mismo ZIP dos veces** → ninguna transferencia se registra dos veces y nada se paga doble; las repetidas salen como aviso con la corrida donde ya están. (Prueba en Task 3, `separarNuevas`; y en Task 1, llave única.)
2. **Alguien paga a mano en Zoho entre la subida y el clic en Aplicar** → la fila no se aplica y vuelve a «No cuadra» con el saldo nuevo. (Prueba en Task 5.)
3. **Traspaso Banregio→Banregio sin CLABE completa ni clave de rastreo, con o sin resumen en el ZIP** → se lee igual, con llave determinista `BRG-…`, y sin resumen la CLABE queda vacía y se empata por nombre. (Prueba en Task 2.)
4. **Sumas con centavos** (ej. 0.1 + 0.2, saldos como 1,088.50) → «cuadra» exacto, sin errores de coma flotante. (Prueba en Task 3.)
5. **Usuario de solo lectura, o rol `tienda`/`franquiciado` con el acceso asignado, que llama directo la ruta, la acción o la RPC** → 403 o error de permisos, nunca un pago. (Pruebas en Task 1 y Task 6.)

---

### Task 1: Migración — acceso, tablas, RLS, RPC y bucket

**Files:**
- Create: `supabase/migrations/20261125000098_sucursales_propias_pagos.sql`
- Modify: `tests/db/utilidades.ts` (tipo de `darModulo`)
- Test: `tests/db/sucursales-propias-pagos.test.ts`

**Interfaces:**
- Produces (SQL): funciones `suc_pagos_nivel() returns text`, `suc_pagos_puede_leer() returns boolean`, `suc_pagos_puede_editar() returns boolean`; RPC `suc_pagos_registrar_corrida(p jsonb) returns jsonb` → `{ corrida_id: number, rutas: { llave: string, ruta: string }[] }`; RPC `suc_pagos_reemplazar_asignaciones(p_id bigint, p_estado text, p_proveedor_id text, p_proveedor_nombre text, p_sugerido boolean, p_asig jsonb) returns void`.
- Tablas: `suc_pago_corrida`, `suc_pago_transferencia`, `suc_pago_asignacion`, `suc_proveedor_clabe`, `suc_pago_config`; bucket `suc-pagos-recibos`; ruta del recibo = `<corrida_id>/<md5(llave)>.pdf`.
- Estados previos a aplicar (los únicos que el usuario puede escribir): `cuadra`, `no_cuadra`, `desconocido`, `sin_facturas`.

- [ ] **Step 1: Extender el tipo de `darModulo`**

En `tests/db/utilidades.ts`, la firma de `darModulo` queda:

```ts
  modulo:
    | 'crm'
    | 'sucursales'
    | 'sucursales_costeo'
    | 'bi'
    | 'comercializadora'
    | 'franquiciatarios'
    | 'sucursales_pagos',
```

- [ ] **Step 2: Escribir la prueba que falla**

`tests/db/sucursales-propias-pagos.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 98: pagos de Sucursales propias (spec 2026-11-25-sucursales-propias-pagos-design.md §3 y §6).
async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}

const corrida = (llave: string, estado = 'cuadra') => ({
  archivo: 'SUCURSALES 20NOV26.zip',
  n_resumen: 1,
  total_resumen: 100.5,
  n_recibos: 1,
  total_recibos: 100.5,
  avisos: ['aviso de prueba'],
  transferencias: [
    {
      llave,
      tipo: 'SPEI',
      clabe: '012320000000001234',
      alias: 'PROVEEDOR UNO',
      concepto: 'PAGO FACTURAS',
      monto: 100.5,
      fecha_operacion: '2026-11-20',
      proveedor_zoho_id: 'v1',
      proveedor_nombre: 'Proveedor Uno',
      sugerido: true,
      estado,
      asignaciones: [
        { bill_id: 'b1', bill_numero: 'A1', ubicacion: 'DARIO', fecha: '2026-11-06', saldo: 60, monto: 60 },
        { bill_id: 'b2', bill_numero: 'A2', ubicacion: 'NAMORA', fecha: '2026-11-07', saldo: 40.5, monto: 40.5 },
      ],
    },
  ],
});

const registrar = (db: PGlite, p: object) =>
  db.query<{ r: { corrida_id: number; rutas: { llave: string; ruta: string }[] } }>(
    'select suc_pagos_registrar_corrida($1::jsonb) r',
    [JSON.stringify(p)],
  );

describe('migración 98: pagos de Sucursales propias', () => {
  let db: PGlite;
  let editor: string;
  let lector: string;
  let tienda: string;
  let sinModulo: string;
  let idT: number;

  beforeAll(async () => {
    db = await crearDbLocal();
    editor = await crearUsuario(db, 'finanzas');
    await darModulo(db, editor, 'sucursales_pagos', 'edicion');
    lector = await crearUsuario(db, 'interno');
    await darModulo(db, lector, 'sucursales_pagos', 'lectura');
    tienda = await crearUsuario(db, 'tienda');
    await darModulo(db, tienda, 'sucursales_pagos', 'edicion');
    sinModulo = await crearUsuario(db, 'admin');
  });
  afterAll(async () => db.close());

  it('el editor registra una corrida completa en una transacción', async () => {
    const r = await comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-AAA1')));
    const { corrida_id, rutas } = r.rows[0].r;
    expect(corrida_id).toBeGreaterThan(0);
    expect(rutas).toHaveLength(1);
    expect(rutas[0].ruta).toMatch(new RegExp(`^${corrida_id}/[0-9a-f]{32}\\.pdf$`));
    const t = await comoUsuario(db, editor, () =>
      db.query<{ id: number; n: number }>(
        `select t.id, (select count(*)::int from suc_pago_asignacion a where a.transferencia_id = t.id) n
         from suc_pago_transferencia t where t.llave = '058-20/11/2026/20-AAA1'`,
      ),
    );
    idT = t.rows[0].id;
    expect(t.rows[0].n).toBe(2);
  });

  it('una llave no se registra dos veces, ni en otra corrida', async () => {
    await expect(
      comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-AAA1'))),
    ).rejects.toThrow(/duplicate key|unique/);
  });

  it('lectura ve la corrida pero no puede registrar', async () => {
    const n = await comoUsuario(db, lector, () =>
      db.query<{ n: number }>('select count(*)::int n from suc_pago_transferencia'),
    );
    expect(n.rows[0].n).toBe(1);
    await expect(comoUsuario(db, lector, () => registrar(db, corrida('L-1')))).rejects.toThrow(
      /solo lectura|permission denied|row-level security/,
    );
  });

  it('rol tienda con el acceso asignado y usuario sin acceso no ven nada', async () => {
    for (const u of [tienda, sinModulo]) {
      const n = await comoUsuario(db, u, () =>
        db.query<{ n: number }>('select count(*)::int n from suc_pago_corrida'),
      );
      expect(n.rows[0].n).toBe(0);
      const nivel = await comoUsuario(db, u, () => db.query<{ n: string | null }>('select suc_pagos_nivel() n'));
      expect(nivel.rows[0].n).toBeNull();
    }
  });

  it('el usuario no puede escribir el resultado de Zoho ni marcar aplicada', async () => {
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`update suc_pago_transferencia set zoho_vendorpayment_id = 'x' where id = $1`, [idT]),
      ),
    ).rejects.toThrow(/permission denied/);
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`update suc_pago_transferencia set estado = 'aplicada' where id = $1`, [idT]),
      ),
    ).rejects.toThrow(/row-level security|violates/);
  });

  it('reemplazar asignaciones funciona antes de aplicar y se bloquea después', async () => {
    const asig = JSON.stringify([{ bill_id: 'b1', bill_numero: 'A1', ubicacion: 'DARIO', fecha: null, saldo: 60, monto: 60 }]);
    await comoUsuario(db, editor, () =>
      db.query(`select suc_pagos_reemplazar_asignaciones($1, 'no_cuadra', 'v1', 'Proveedor Uno', false, $2::jsonb)`, [idT, asig]),
    );
    const n = await comoUsuario(db, editor, () =>
      db.query<{ n: number }>('select count(*)::int n from suc_pago_asignacion where transferencia_id = $1', [idT]),
    );
    expect(n.rows[0].n).toBe(1);
    await comoServicio(db, () => db.query(`update suc_pago_transferencia set estado = 'aplicada' where id = $1`, [idT]));
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`select suc_pagos_reemplazar_asignaciones($1, 'cuadra', 'v1', 'Proveedor Uno', false, $2::jsonb)`, [idT, asig]),
      ),
    ).rejects.toThrow(/ya no se puede cambiar/);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(`select suc_pagos_reemplazar_asignaciones($1, 'cuadra', 'v1', 'P', false, '[]'::jsonb)`, [idT]),
      ),
    ).rejects.toThrow(/solo lectura/);
  });

  it('la CLABE de una equivalencia debe tener 18 dígitos; lectura no la escribe', async () => {
    await comoUsuario(db, editor, () =>
      db.query(`insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('030320900000001111', 'v2', 'Refugio')`),
    );
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('123', 'v2', 'X')`),
      ),
    ).rejects.toThrow(/check/);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(`insert into suc_proveedor_clabe (clabe, proveedor_zoho_id, proveedor_nombre) values ('030320900000002222', 'v3', 'X')`),
      ),
    ).rejects.toThrow(/row-level security|permission denied/);
  });

  it('el bucket solo acepta recibos de transferencias registradas y antes de aplicar', async () => {
    const r = await comoUsuario(db, editor, () => registrar(db, corrida('058-20/11/2026/20-BBB2')));
    const ruta = r.rows[0].r.rutas[0].ruta;
    await comoUsuario(db, editor, () =>
      db.query(`insert into storage.objects (bucket_id, name) values ('suc-pagos-recibos', $1)`, [ruta]),
    );
    await expect(
      comoUsuario(db, editor, () =>
        db.query(`insert into storage.objects (bucket_id, name) values ('suc-pagos-recibos', '1/otro.pdf')`),
      ),
    ).rejects.toThrow(/row-level security/);
    const visto = await comoUsuario(db, lector, () =>
      db.query<{ n: number }>(`select count(*)::int n from storage.objects where name = $1`, [ruta]),
    );
    expect(visto.rows[0].n).toBe(1);
  });

  it('la configuración trae el nombre de la cuenta y solo el servicio guarda su id', async () => {
    const c = await comoUsuario(db, lector, () =>
      db.query<{ cuenta_nombre: string }>('select cuenta_nombre from suc_pago_config'),
    );
    expect(c.rows[0].cuenta_nombre).toBe('BANREGIO - CONSOLIDADO SUCURSALES PROPIAS');
    await expect(
      comoUsuario(db, editor, () => db.query(`update suc_pago_config set cuenta_zoho_id = 'x'`)),
    ).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 3: Correr la prueba y ver que falla**

Run: `npx vitest run tests/db/sucursales-propias-pagos.test.ts`
Expected: FAIL (`function suc_pagos_registrar_corrida(jsonb) does not exist` o el check de `perfil_modulos` rechaza `sucursales_pagos`).

- [ ] **Step 4: Escribir la migración**

`supabase/migrations/20261125000098_sucursales_propias_pagos.sql`:

```sql
-- Pagos de Sucursales propias: conciliación masiva Banregio → Zoho Books (org Sucursales The Coffee – GDL).
-- Spec: docs/superpowers/specs/2026-11-25-sucursales-propias-pagos-design.md (§3 permisos, §6 datos).

-- 1. Acceso nuevo 'sucursales_pagos' (lectura = ver; edicion/desarrollador = subir y aplicar). Solo empleados Holding.
alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check;
alter table public.perfil_modulos add constraint perfil_modulos_modulo_check
  check (modulo in ('crm', 'sucursales', 'sucursales_costeo', 'bi', 'comercializadora', 'franquiciatarios',
                    'sucursales_pagos'));

create function public.suc_pagos_nivel() returns text
language sql stable security definer set search_path = public, pg_temp as $$
  select pm.nivel
  from public.perfil_modulos pm
  join public.perfiles p on p.user_id = pm.user_id
  where pm.user_id = auth.uid() and pm.modulo = 'sucursales_pagos' and p.activo
    and p.rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno')
    and (auth.jwt()->>'client_id') is null
$$;
create function public.suc_pagos_puede_leer() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select public.suc_pagos_nivel() is not null
$$;
create function public.suc_pagos_puede_editar() returns boolean
language sql stable set search_path = public, pg_temp as $$
  select coalesce(public.suc_pagos_nivel() in ('desarrollador', 'edicion'), false)
$$;
revoke all on function public.suc_pagos_nivel(), public.suc_pagos_puede_leer(), public.suc_pagos_puede_editar()
  from public, anon;
grant execute on function public.suc_pagos_nivel(), public.suc_pagos_puede_leer(), public.suc_pagos_puede_editar()
  to authenticated;

-- 2. Tablas.
create table public.suc_pago_corrida (
  id bigint generated always as identity primary key,
  archivo text not null,
  subido_por uuid not null default auth.uid() references public.perfiles (user_id),
  subido_en timestamptz not null default now(),
  n_resumen integer,
  total_resumen numeric(14, 2),
  n_recibos integer not null,
  total_recibos numeric(14, 2) not null,
  avisos jsonb not null default '[]'::jsonb
);

create table public.suc_pago_transferencia (
  id bigint generated always as identity primary key,
  corrida_id bigint not null references public.suc_pago_corrida (id) on delete cascade,
  -- Clave de rastreo SPEI, o BRG-<fecha>-<últimos 4>-<monto> para traspasos Banregio sin clave.
  llave text not null unique,
  tipo text not null check (tipo in ('SPEI', 'Banregio')),
  clabe text check (clabe ~ '^[0-9]{18}$'),
  alias text not null,
  concepto text not null default '',
  monto numeric(14, 2) not null check (monto > 0),
  fecha_operacion date not null,
  archivo_pdf text not null,
  proveedor_zoho_id text,
  proveedor_nombre text,
  sugerido boolean not null default false,
  estado text not null check (estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas', 'aplicando',
                                         'aplicada', 'aplicada_sin_adjunto', 'error', 'ya_aplicada')),
  error text,
  zoho_vendorpayment_id text,
  adjunto_ok boolean not null default false,
  aplicado_por uuid references public.perfiles (user_id),
  aplicado_en timestamptz,
  actualizado_en timestamptz not null default now()
);
create index suc_pago_transferencia_corrida on public.suc_pago_transferencia (corrida_id);

create table public.suc_pago_asignacion (
  transferencia_id bigint not null references public.suc_pago_transferencia (id) on delete cascade,
  bill_id text not null,
  bill_numero text not null,
  ubicacion text not null default '',
  fecha date,
  saldo numeric(14, 2) not null,
  monto numeric(14, 2) not null check (monto > 0),
  primary key (transferencia_id, bill_id)
);

create table public.suc_proveedor_clabe (
  clabe text primary key check (clabe ~ '^[0-9]{18}$'),
  proveedor_zoho_id text not null,
  proveedor_nombre text not null,
  creado_por uuid default auth.uid() references public.perfiles (user_id),
  creado_en timestamptz not null default now()
);

create table public.suc_pago_config (
  id integer primary key default 1 check (id = 1),
  cuenta_nombre text not null default 'BANREGIO - CONSOLIDADO SUCURSALES PROPIAS',
  cuenta_zoho_id text
);
insert into public.suc_pago_config default values;

-- 3. Privilegios y RLS. El resultado de Zoho (estado aplicada, ids, aplicado_*) solo lo escribe la Edge Function.
alter table public.suc_pago_corrida enable row level security;
alter table public.suc_pago_transferencia enable row level security;
alter table public.suc_pago_asignacion enable row level security;
alter table public.suc_proveedor_clabe enable row level security;
alter table public.suc_pago_config enable row level security;

revoke all on public.suc_pago_corrida, public.suc_pago_transferencia, public.suc_pago_asignacion,
  public.suc_proveedor_clabe, public.suc_pago_config from anon, authenticated;
grant all on public.suc_pago_corrida, public.suc_pago_transferencia, public.suc_pago_asignacion,
  public.suc_proveedor_clabe, public.suc_pago_config to service_role;

grant select, insert on public.suc_pago_corrida to authenticated;
grant update (avisos) on public.suc_pago_corrida to authenticated;
grant select, insert on public.suc_pago_transferencia to authenticated;
grant update (proveedor_zoho_id, proveedor_nombre, sugerido, estado, error, actualizado_en)
  on public.suc_pago_transferencia to authenticated;
grant select, insert, delete on public.suc_pago_asignacion to authenticated;
grant select, insert, update on public.suc_proveedor_clabe to authenticated;
grant select on public.suc_pago_config to authenticated;

create policy leer on public.suc_pago_corrida for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy subir on public.suc_pago_corrida for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()) and subido_por = auth.uid());
create policy avisos on public.suc_pago_corrida for update to authenticated
  using ((select public.suc_pagos_puede_editar())) with check ((select public.suc_pagos_puede_editar()));

create policy leer on public.suc_pago_transferencia for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy registrar on public.suc_pago_transferencia for insert to authenticated
  with check ((select public.suc_pagos_puede_editar())
    and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')
    and zoho_vendorpayment_id is null and aplicado_por is null and not adjunto_ok);
create policy revisar on public.suc_pago_transferencia for update to authenticated
  using ((select public.suc_pagos_puede_editar()) and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas'))
  with check ((select public.suc_pagos_puede_editar()) and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas'));

create policy leer on public.suc_pago_asignacion for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy agregar on public.suc_pago_asignacion for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()) and exists (
    select 1 from public.suc_pago_transferencia t
    where t.id = transferencia_id and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));
create policy quitar on public.suc_pago_asignacion for delete to authenticated
  using ((select public.suc_pagos_puede_editar()) and exists (
    select 1 from public.suc_pago_transferencia t
    where t.id = transferencia_id and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));

create policy leer on public.suc_proveedor_clabe for select to authenticated
  using ((select public.suc_pagos_puede_leer()));
create policy agregar on public.suc_proveedor_clabe for insert to authenticated
  with check ((select public.suc_pagos_puede_editar()));
create policy cambiar on public.suc_proveedor_clabe for update to authenticated
  using ((select public.suc_pagos_puede_editar())) with check ((select public.suc_pagos_puede_editar()));

create policy leer on public.suc_pago_config for select to authenticated
  using ((select public.suc_pagos_puede_leer()));

-- 4. RPC: registrar una corrida completa (corrida + transferencias + asignaciones) en una sola transacción.
create function public.suc_pagos_registrar_corrida(p jsonb) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_corrida bigint;
  v_t jsonb;
  v_id bigint;
  v_ruta text;
  v_rutas jsonb := '[]'::jsonb;
begin
  if not public.suc_pagos_puede_editar() then
    raise exception 'Tu acceso a Pagos es de solo lectura.' using errcode = '42501';
  end if;
  insert into public.suc_pago_corrida (archivo, n_resumen, total_resumen, n_recibos, total_recibos, avisos)
  values (p->>'archivo', (p->>'n_resumen')::integer, (p->>'total_resumen')::numeric, (p->>'n_recibos')::integer,
          (p->>'total_recibos')::numeric, coalesce(p->'avisos', '[]'::jsonb))
  returning id into v_corrida;
  for v_t in select value from jsonb_array_elements(coalesce(p->'transferencias', '[]'::jsonb)) loop
    v_ruta := v_corrida || '/' || md5(v_t->>'llave') || '.pdf';
    insert into public.suc_pago_transferencia (corrida_id, llave, tipo, clabe, alias, concepto, monto, fecha_operacion,
      archivo_pdf, proveedor_zoho_id, proveedor_nombre, sugerido, estado)
    values (v_corrida, v_t->>'llave', v_t->>'tipo', nullif(v_t->>'clabe', ''), v_t->>'alias',
      coalesce(v_t->>'concepto', ''), (v_t->>'monto')::numeric, (v_t->>'fecha_operacion')::date, v_ruta,
      v_t->>'proveedor_zoho_id', v_t->>'proveedor_nombre', coalesce((v_t->>'sugerido')::boolean, false), v_t->>'estado')
    returning id into v_id;
    insert into public.suc_pago_asignacion (transferencia_id, bill_id, bill_numero, ubicacion, fecha, saldo, monto)
    select v_id, a->>'bill_id', a->>'bill_numero', coalesce(a->>'ubicacion', ''), nullif(a->>'fecha', '')::date,
           (a->>'saldo')::numeric, (a->>'monto')::numeric
    from jsonb_array_elements(coalesce(v_t->'asignaciones', '[]'::jsonb)) a;
    v_rutas := v_rutas || jsonb_build_array(jsonb_build_object('llave', v_t->>'llave', 'ruta', v_ruta));
  end loop;
  return jsonb_build_object('corrida_id', v_corrida, 'rutas', v_rutas);
end $$;

-- 5. RPC: cambiar proveedor/asignaciones de una transferencia que todavía no se aplica.
create function public.suc_pagos_reemplazar_asignaciones(p_id bigint, p_estado text, p_proveedor_id text,
  p_proveedor_nombre text, p_sugerido boolean, p_asig jsonb) returns void
language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if not public.suc_pagos_puede_editar() then
    raise exception 'Tu acceso a Pagos es de solo lectura.' using errcode = '42501';
  end if;
  if p_estado not in ('cuadra', 'no_cuadra', 'sin_facturas') then
    raise exception 'Estado no válido: %', p_estado;
  end if;
  update public.suc_pago_transferencia
     set estado = p_estado, proveedor_zoho_id = p_proveedor_id, proveedor_nombre = p_proveedor_nombre,
         sugerido = p_sugerido, error = null, actualizado_en = now()
   where id = p_id and estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas');
  if not found then
    raise exception 'La transferencia ya no se puede cambiar (¿ya se aplicó?).';
  end if;
  delete from public.suc_pago_asignacion where transferencia_id = p_id;
  insert into public.suc_pago_asignacion (transferencia_id, bill_id, bill_numero, ubicacion, fecha, saldo, monto)
  select p_id, a->>'bill_id', a->>'bill_numero', coalesce(a->>'ubicacion', ''), nullif(a->>'fecha', '')::date,
         (a->>'saldo')::numeric, (a->>'monto')::numeric
  from jsonb_array_elements(coalesce(p_asig, '[]'::jsonb)) a;
end $$;

revoke all on function public.suc_pagos_registrar_corrida(jsonb),
  public.suc_pagos_reemplazar_asignaciones(bigint, text, text, text, boolean, jsonb) from public, anon;
grant execute on function public.suc_pagos_registrar_corrida(jsonb),
  public.suc_pagos_reemplazar_asignaciones(bigint, text, text, text, boolean, jsonb) to authenticated;

-- 6. Recibos PDF: bucket privado; un objeto solo existe si su transferencia está registrada (la ruta la genera la base).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('suc-pagos-recibos', 'suc-pagos-recibos', false, 5242880, array['application/pdf'])
on conflict (id) do nothing;

create policy suc_pagos_recibos_leer on storage.objects for select to authenticated
  using (bucket_id = 'suc-pagos-recibos' and public.suc_pagos_puede_leer()
    and exists (select 1 from public.suc_pago_transferencia t where t.archivo_pdf = name));
create policy suc_pagos_recibos_subir on storage.objects for insert to authenticated
  with check (bucket_id = 'suc-pagos-recibos' and public.suc_pagos_puede_editar()
    and exists (select 1 from public.suc_pago_transferencia t
                where t.archivo_pdf = name and t.estado in ('cuadra', 'no_cuadra', 'desconocido', 'sin_facturas')));
```

- [ ] **Step 5: Correr la prueba y ver que pasa**

Run: `npx vitest run tests/db/sucursales-propias-pagos.test.ts`
Expected: PASS (9 pruebas). Si una falla por el texto del error de PGlite, ajusta solo la expresión regular de la prueba, nunca la política.

- [ ] **Step 6: Correr las pruebas de base existentes que tocan `perfil_modulos`**

Run: `npx vitest run tests/db`
Expected: PASS (nada más se rompió por el cambio del check).

- [ ] **Step 7: Commit**

```bash
git add supabase/migrations/20261125000098_sucursales_propias_pagos.sql tests/db/utilidades.ts tests/db/sucursales-propias-pagos.test.ts
git commit -m "feat(sucursales-propias): tablas, RLS y RPC de pagos masivos"
```

---

### Task 2: Lectura de recibos Banregio y del resumen de la masiva

**Files:**
- Create: `lib/sucursales-propias/recibos.ts`
- Create: `lib/sucursales-propias/zip.ts`
- Test: `tests/portal/sucursales-propias-recibos.test.ts`
- Modify: `package.json`, `package-lock.json` (dependencias `unpdf`, `fflate`)

**Interfaces:**
- Produces (`recibos.ts`, puro):
  - `type TipoTransferencia = 'SPEI' | 'Banregio'`
  - `interface FilaResumen { secuencia: number; tipo: TipoTransferencia; clabe: string; texto: string; monto: number }`
  - `interface Resumen { archivo: string | null; numero: number | null; total: number | null; filas: FilaResumen[]; conError: number }`
  - `interface Recibo { tipo: TipoTransferencia; alias: string; clabe: string | null; ultimos4: string; monto: number; concepto: string; fecha: string /* YYYY-MM-DD */; claveRastreo: string | null }`
  - `interface Transferencia { llave: string; tipo: TipoTransferencia; clabe: string | null; alias: string; concepto: string; monto: number; fecha: string; claveRastreo: string | null; archivo: string; secuencia: number | null }`
  - `centavos(n: number): number`, `esResumen(texto: string): boolean`, `leerResumen(texto: string): Resumen`, `leerRecibo(texto: string): Recibo` (lanza `Error` si falta monto, cuenta o fecha), `unir(resumen: Resumen | null, recibos: { archivo: string; recibo: Recibo }[]): { transferencias: Transferencia[]; avisos: string[] }`
- Produces (`zip.ts`, Node, sin `server-only` para que lo use un script):
  - `textoPdf(bytes: Uint8Array): Promise<string>`
  - `leerZip(bytes: Uint8Array, extraer?: (b: Uint8Array) => Promise<string>): Promise<{ resumen: Resumen | null; recibos: { archivo: string; recibo: Recibo; pdf: Uint8Array }[]; avisos: string[] }>` (lanza `ErrorCorrida`)
  - `class ErrorCorrida extends Error` (mensaje apto para el usuario)

- [ ] **Step 1: Instalar dependencias**

Run: `npm i unpdf@1.9.1 fflate@0.8.3`
Expected: ambas en `dependencies` con esas versiones exactas.

- [ ] **Step 2: Escribir la prueba que falla**

Los textos son copias del texto que `unpdf` extrae de los recibos reales del 20 nov 2026 (orden incluido), con CLABEs, RFC, correos y nombres de personas reemplazados por valores ficticios.

`tests/portal/sucursales-propias-recibos.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import { centavos, esResumen, leerRecibo, leerResumen, unir } from '../../lib/sucursales-propias/recibos';
import { ErrorCorrida, leerZip } from '../../lib/sucursales-propias/zip';

const SPEI = `Tipo de Transferencia Mismo día hábil (SPEI)
COMERCIALIZADORA MASTER SITRU S.A. DE C.V. - *0151Cuenta Origen
Cuenta Destino OH LALA - 012535000000001111
$27,367.54 pesosCantidad a Transferir
Concepto de pago PAGO FACTURAS CORRIDA 20NOV26
Le avisamos a
RFC XAXX010101000
correo@ejemplo.mx
Quien autoriza
Quien solicita
PERSONA AUTORIZA (Firma A)
PERSONA SOLICITA ( FIRMA )
Recibo de la transferencia
20 noviembre 2026 - 12:01 p. m.Fecha solicita
Banco BBVA MEXICO
UKz3TvlZVu - 20 noviembre 2026 - 01:08:09 p. m.
Si tienes dudas, llámanos al Centro de Atención a Clientes
058-20/11/2026/20-145AOXPA31
Verificador 5001935192085322112120902541012741092531022671062430972531022681005472165472215532212120
Tu clave de rastreo
Datos de tu operación
Fecha de operación SPEI 20 noviembre 2026`;

const BANREGIO = `Cuenta Origen
Cuenta Destino
Cantidad a Transferir
Descripcion
Si tienes dudas, llámanos al Centro de Atención a Clientes
COMERCIALIZADORA MASTER SITRU S.A. DE C.V. - *0151
PERSONA PROVEEDORA UNO - *5957
$2,700.00 pesos
PAGO FACTURAS CORRIDA 20NOV26
20-11-2026 13:08
Recibo de la transferencia
XAXX010101000
$0.00 pesosTipo de cambio
$2,700.00 pesosTu total a transferir
RFC
Datos de tu operación`;

const RESUMEN = `Recibo de Transferencia Masiva
Cuenta Origen
SUCUR 20 NOV.xlsxArchivo
cuenta 12 - *0151
Transacciones SPEI: 2 por $27467.54
Banregio: 1 por $2700.00
Número de Transferencias 3
Total $30167.54
Detalle de Transferencias
Secuencia Tipo Cuenta Destino Alias Referencia
Númerica
MontoDescripción
1 SPEI 012320000000002222 HIBRIDO DISEÑO
PERSONA DOS
APELLIDO
ETIQUETAS DE VIDA UTIL NOV $100.00
2 SPEI 012535000000001111 OH LALA PAGO FACTURAS CORRIDA
20NOV26
$27367.54
3 Banregio 058320000000005957 PERSONA PROVEEDORA
UNO
PAGO FACTURAS CORRIDA
20NOV26
$2700.00
Detalle de Transferencias con Error
Secuencia Tipo Cuenta Destino Alias Referencia
Númerica
MontoDescripción
Si tienes dudas, llámanos al Centro de Atención a Clientes`;

describe('leerRecibo', () => {
  it('lee un recibo SPEI aunque las etiquetas vengan desordenadas', () => {
    expect(leerRecibo(SPEI)).toEqual({
      tipo: 'SPEI',
      alias: 'OH LALA',
      clabe: '012535000000001111',
      ultimos4: '1111',
      monto: 27367.54,
      concepto: 'PAGO FACTURAS CORRIDA 20NOV26',
      fecha: '2026-11-20',
      claveRastreo: '058-20/11/2026/20-145AOXPA31',
    });
  });

  it('lee un traspaso Banregio sin CLABE completa ni clave de rastreo', () => {
    expect(leerRecibo(BANREGIO)).toEqual({
      tipo: 'Banregio',
      alias: 'PERSONA PROVEEDORA UNO',
      clabe: null,
      ultimos4: '5957',
      monto: 2700,
      concepto: 'PAGO FACTURAS CORRIDA 20NOV26',
      fecha: '2026-11-20',
      claveRastreo: null,
    });
  });

  it('falla con un mensaje claro si no es un recibo', () => {
    expect(() => leerRecibo('hola')).toThrow(/monto/);
  });
});

describe('leerResumen', () => {
  it('lee totales y filas de varias líneas', () => {
    const r = leerResumen(RESUMEN);
    expect(esResumen(RESUMEN)).toBe(true);
    expect(esResumen(SPEI)).toBe(false);
    expect(r.archivo).toBe('SUCUR 20 NOV.xlsx');
    expect(r.numero).toBe(3);
    expect(r.total).toBe(30167.54);
    expect(r.conError).toBe(0);
    expect(r.filas.map((f) => [f.secuencia, f.tipo, f.clabe, f.monto])).toEqual([
      [1, 'SPEI', '012320000000002222', 100],
      [2, 'SPEI', '012535000000001111', 27367.54],
      [3, 'Banregio', '058320000000005957', 2700],
    ]);
    expect(r.filas[0].texto).toBe('HIBRIDO DISEÑO PERSONA DOS APELLIDO ETIQUETAS DE VIDA UTIL NOV');
  });

  it('cuenta las transferencias con error', () => {
    const conError = RESUMEN.replace(
      'Detalle de Transferencias con Error\n',
      'Detalle de Transferencias con Error\n9 SPEI 012320000000009999 OTRO PAGO $5.00\n',
    );
    expect(leerResumen(conError).conError).toBe(1);
  });
});

describe('unir', () => {
  const recibos = [
    { archivo: 'OH LALA - $27,367.54.pdf', recibo: leerRecibo(SPEI) },
    { archivo: 'PERSONA - $2,700.00.pdf', recibo: leerRecibo(BANREGIO) },
  ];

  it('toma la CLABE del resumen para el traspaso Banregio y arma su llave', () => {
    const { transferencias } = unir(leerResumen(RESUMEN), recibos);
    const brg = transferencias.find((t) => t.tipo === 'Banregio')!;
    expect(brg.clabe).toBe('058320000000005957');
    expect(brg.llave).toBe('BRG-2026-11-20-5957-2700.00');
    expect(brg.secuencia).toBe(3);
    expect(transferencias.find((t) => t.tipo === 'SPEI')!.llave).toBe('058-20/11/2026/20-145AOXPA31');
  });

  it('avisa la fila del resumen sin recibo y la diferencia de totales, sin mostrar la CLABE completa', () => {
    const { avisos } = unir(leerResumen(RESUMEN), recibos);
    expect(avisos.some((a) => a.includes('transferencia 1') && a.includes('…2222'))).toBe(true);
    expect(avisos.some((a) => a.includes('suman $30067.54') && a.includes('$30167.54'))).toBe(true);
    expect(avisos.join(' ')).not.toContain('012320000000002222');
  });

  it('sin resumen: el traspaso Banregio queda sin CLABE pero con llave determinista', () => {
    const { transferencias, avisos } = unir(null, recibos);
    const brg = transferencias.find((t) => t.tipo === 'Banregio')!;
    expect(brg.clabe).toBeNull();
    expect(brg.llave).toBe('BRG-2026-11-20-5957-2700.00');
    expect(avisos.some((a) => a.includes('no trae el resumen'))).toBe(true);
  });

  it('un recibo repetido en el ZIP se toma una sola vez', () => {
    const { transferencias, avisos } = unir(null, [recibos[0], { ...recibos[0], archivo: 'copia.pdf' }]);
    expect(transferencias).toHaveLength(1);
    expect(avisos.some((a) => a.includes('copia.pdf') && a.includes('repetido'))).toBe(true);
  });

  it('centavos no arrastra errores de coma flotante', () => {
    expect(centavos(0.1 + 0.2)).toBe(30);
    expect(centavos(1088.5)).toBe(108850);
  });
});

describe('leerZip', () => {
  // El extractor falso devuelve el contenido del "PDF" tal cual: así se prueba el ZIP sin generar PDFs.
  const extraer = async (b: Uint8Array) => new TextDecoder().decode(b);

  it('separa resumen y recibos, ignora lo que no es PDF y avisa lo ilegible', async () => {
    const zip = zipSync({
      'SUCURSALES 20NOV26/RESUMEN.pdf': strToU8(RESUMEN),
      'SUCURSALES 20NOV26/OH LALA.pdf': strToU8(SPEI),
      'SUCURSALES 20NOV26/roto.pdf': strToU8('no es recibo'),
      'SUCURSALES 20NOV26/notas.txt': strToU8('x'),
      '__MACOSX/._OH LALA.pdf': strToU8('basura'),
    });
    const r = await leerZip(zip, extraer);
    expect(r.resumen?.numero).toBe(3);
    expect(r.recibos.map((x) => x.archivo)).toEqual(['OH LALA.pdf']);
    expect(r.avisos).toEqual(['No se pudo leer roto.pdf.']);
  });

  it('rechaza un archivo que no es ZIP o un ZIP sin recibos', async () => {
    await expect(leerZip(strToU8('hola'), extraer)).rejects.toBeInstanceOf(ErrorCorrida);
    await expect(leerZip(zipSync({ 'a.txt': strToU8('x') }), extraer)).rejects.toThrow(/no trae recibos/);
  });
});
```

- [ ] **Step 3: Correr la prueba y ver que falla**

Run: `npx vitest run tests/portal/sucursales-propias-recibos.test.ts`
Expected: FAIL (`Cannot find module '../../lib/sucursales-propias/recibos'`).

- [ ] **Step 4: Escribir `lib/sucursales-propias/recibos.ts`**

```ts
// Lectura del texto de los recibos Banregio y del resumen de la masiva (spec §2). Puro: recibe el texto ya extraído.
// El texto de los PDF sale desordenado (etiqueta antes o después del valor): se leen patrones sobre todo el texto.

export type TipoTransferencia = 'SPEI' | 'Banregio';

export interface FilaResumen {
  secuencia: number;
  tipo: TipoTransferencia;
  clabe: string;
  /** Alias y descripción juntos (en el PDF no se pueden separar con certeza). */
  texto: string;
  monto: number;
}

export interface Resumen {
  archivo: string | null;
  numero: number | null;
  total: number | null;
  filas: FilaResumen[];
  conError: number;
}

export interface Recibo {
  tipo: TipoTransferencia;
  alias: string;
  /** null en traspasos Banregio→Banregio: el recibo solo trae los últimos 4 dígitos. */
  clabe: string | null;
  ultimos4: string;
  monto: number;
  concepto: string;
  /** YYYY-MM-DD */
  fecha: string;
  claveRastreo: string | null;
}

export interface Transferencia {
  llave: string;
  tipo: TipoTransferencia;
  clabe: string | null;
  alias: string;
  concepto: string;
  monto: number;
  fecha: string;
  claveRastreo: string | null;
  archivo: string;
  secuencia: number | null;
}

const MESES: Record<string, string> = {
  enero: '01', febrero: '02', marzo: '03', abril: '04', mayo: '05', junio: '06', julio: '07',
  agosto: '08', septiembre: '09', setiembre: '09', octubre: '10', noviembre: '11', diciembre: '12',
};

export const centavos = (n: number): number => Math.round(n * 100);
const dinero = (s: string) => Number(s.replace(/,/g, ''));
const pesos = (c: number) => `$${(c / 100).toFixed(2)}`;

export const esResumen = (texto: string): boolean => texto.includes('Recibo de Transferencia Masiva');

const INICIO_FILA = /^(\d+) (SPEI|Banregio) (\d{18}) ?(.*)$/;
const MONTO_FINAL = /\$([\d,]+\.\d{2})$/;

function filasResumen(texto: string): FilaResumen[] {
  const filas: FilaResumen[] = [];
  let actual: { secuencia: number; tipo: TipoTransferencia; clabe: string; partes: string[] } | null = null;
  for (const linea of texto.split('\n').map((l) => l.trim())) {
    const ini = INICIO_FILA.exec(linea);
    if (ini) actual = { secuencia: Number(ini[1]), tipo: ini[2] as TipoTransferencia, clabe: ini[3], partes: [ini[4]] };
    else if (actual) actual.partes.push(linea);
    else continue;
    const ultima = actual.partes[actual.partes.length - 1];
    const m = MONTO_FINAL.exec(ultima);
    if (m) {
      actual.partes[actual.partes.length - 1] = ultima.slice(0, m.index).trim();
      filas.push({
        secuencia: actual.secuencia,
        tipo: actual.tipo,
        clabe: actual.clabe,
        texto: actual.partes.filter(Boolean).join(' '),
        monto: dinero(m[1]),
      });
      actual = null;
    }
  }
  return filas;
}

export function leerResumen(texto: string): Resumen {
  const [principal, errores = ''] = texto.split('Detalle de Transferencias con Error');
  const numero = /Número de Transferencias (\d+)/.exec(principal);
  const total = /^Total \$([\d,]+\.\d{2})$/m.exec(principal);
  return {
    archivo: /^(.+?\.xlsx?)Archivo$/m.exec(principal)?.[1] ?? null,
    numero: numero ? Number(numero[1]) : null,
    total: total ? dinero(total[1]) : null,
    filas: filasResumen(principal),
    conError: filasResumen(errores).length,
  };
}

export function leerRecibo(texto: string): Recibo {
  const monto = /\$([\d,]+\.\d{2}) pesos/.exec(texto);
  if (!monto) throw new Error('No encontré el monto');
  const tipo: TipoTransferencia = texto.includes('(SPEI)') ? 'SPEI' : 'Banregio';
  const claveRastreo = /^(\d{3}-\d{2}\/\d{2}\/\d{4}\/[A-Za-z0-9-]+)$/m.exec(texto)?.[1] ?? null;
  if (tipo === 'SPEI') {
    const d = /Cuenta Destino (.+?) - (\d{18})/.exec(texto);
    if (!d) throw new Error('No encontré la cuenta destino');
    const f = /Fecha de operación SPEI (\d{1,2}) (\p{L}+) (\d{4})/u.exec(texto);
    const mes = f ? MESES[f[2].toLowerCase()] : undefined;
    if (!f || !mes) throw new Error('No encontré la fecha de operación');
    return {
      tipo,
      alias: d[1].trim(),
      clabe: d[2],
      ultimos4: d[2].slice(-4),
      monto: dinero(monto[1]),
      concepto: /Concepto de pago (.+)/.exec(texto)?.[1].trim() ?? '',
      fecha: `${f[3]}-${mes}-${f[1].padStart(2, '0')}`,
      claveRastreo,
    };
  }
  // Banregio→Banregio: la primera cuenta "- *1234" es la de origen; la segunda, la de destino.
  const cuentas = [...texto.matchAll(/^(.+?) - \*(\d{4})(?:Cuenta Origen)?$/gm)];
  if (cuentas.length < 2) throw new Error('No encontré la cuenta destino');
  const lineas = texto.split('\n').map((l) => l.trim());
  const i = lineas.findIndex((l) => /^\$[\d,]+\.\d{2} pesos$/.test(l));
  const f = /(\d{2})-(\d{2})-(\d{4}) \d{2}:\d{2}/.exec(texto);
  if (!f) throw new Error('No encontré la fecha de operación');
  return {
    tipo,
    alias: cuentas[1][1].trim(),
    clabe: null,
    ultimos4: cuentas[1][2],
    monto: dinero(monto[1]),
    concepto: i >= 0 ? (lineas[i + 1] ?? '') : '',
    fecha: `${f[3]}-${f[2]}-${f[1]}`,
    claveRastreo,
  };
}

/** Une cada recibo con su fila del resumen (CLABE + monto; Banregio: últimos 4 + monto) y arma la llave (spec §2). */
export function unir(
  resumen: Resumen | null,
  recibos: { archivo: string; recibo: Recibo }[],
): { transferencias: Transferencia[]; avisos: string[] } {
  const avisos: string[] = [];
  const libres = [...(resumen?.filas ?? [])];
  const vistas = new Set<string>();
  const transferencias: Transferencia[] = [];
  for (const { archivo, recibo: r } of recibos) {
    const i = libres.findIndex(
      (f) =>
        f.tipo === r.tipo &&
        centavos(f.monto) === centavos(r.monto) &&
        (r.clabe ? f.clabe === r.clabe : f.clabe.endsWith(r.ultimos4)),
    );
    const fila = i >= 0 ? libres.splice(i, 1)[0] : null;
    if (resumen && !fila) avisos.push(`${archivo}: no aparece en el resumen de la masiva.`);
    const llave = r.claveRastreo ?? `BRG-${r.fecha}-${r.ultimos4}-${r.monto.toFixed(2)}`;
    if (vistas.has(llave)) {
      avisos.push(`${archivo}: recibo repetido en el ZIP; se tomó una sola vez.`);
      continue;
    }
    vistas.add(llave);
    transferencias.push({
      llave,
      tipo: r.tipo,
      clabe: r.clabe ?? fila?.clabe ?? null,
      alias: r.alias,
      concepto: r.concepto,
      monto: r.monto,
      fecha: r.fecha,
      claveRastreo: r.claveRastreo,
      archivo,
      secuencia: fila?.secuencia ?? null,
    });
  }
  for (const f of libres)
    avisos.push(
      `La transferencia ${f.secuencia} del resumen (cuenta …${f.clabe.slice(-4)}, ${pesos(centavos(f.monto))}) no tiene recibo en el ZIP; no se aplicará.`,
    );
  if (resumen) {
    const suma = transferencias.reduce((s, t) => s + centavos(t.monto), 0);
    if (resumen.total !== null && centavos(resumen.total) !== suma)
      avisos.push(`Los recibos suman ${pesos(suma)} y el resumen dice ${pesos(centavos(resumen.total))}.`);
    if (resumen.numero !== null && resumen.numero !== transferencias.length)
      avisos.push(`El resumen tiene ${resumen.numero} transferencias y el ZIP ${transferencias.length} recibos.`);
    if (resumen.conError > 0)
      avisos.push(`El resumen trae ${resumen.conError} transferencia(s) con error en Banregio; revisa que no estén entre los recibos.`);
  } else avisos.push('El ZIP no trae el resumen de la transferencia masiva; no se pudo comparar el total.');
  transferencias.sort((a, b) => (a.secuencia ?? 999) - (b.secuencia ?? 999) || a.alias.localeCompare(b.alias));
  return { transferencias, avisos };
}
```

- [ ] **Step 5: Escribir `lib/sucursales-propias/zip.ts`**

```ts
// Abre el ZIP de una corrida y lee el texto de cada PDF (spec §2, §4 paso 1). Sin 'server-only': lo usa también
// scripts/sucursales-propias/probar-zip.ts para revisar un ZIP real sin tocar Zoho.
import { unzipSync } from 'fflate';
import { extractText, getDocumentProxy } from 'unpdf';
import { esResumen, leerRecibo, leerResumen, type Recibo, type Resumen } from './recibos';

/** Error con mensaje apto para mostrarse tal cual al usuario. */
export class ErrorCorrida extends Error {}

export async function textoPdf(bytes: Uint8Array): Promise<string> {
  // unpdf puede tomar el buffer: se le pasa una copia para no dañar el PDF que luego se sube.
  const pdf = await getDocumentProxy(bytes.slice());
  const { text } = await extractText(pdf, { mergePages: true });
  return text;
}

/** Los ZIP de Windows guardan los nombres en UTF-8 sin la bandera: fflate los entrega como latin1 ("DISEÃ\x91O"). */
function nombreLegible(nombre: string): string {
  if (!/[ÃÂ]/.test(nombre) || [...nombre].some((c) => c.charCodeAt(0) > 255)) return nombre;
  return new TextDecoder().decode(Uint8Array.from(nombre, (c) => c.charCodeAt(0)));
}

export async function leerZip(
  bytes: Uint8Array,
  extraer: (b: Uint8Array) => Promise<string> = textoPdf,
): Promise<{ resumen: Resumen | null; recibos: { archivo: string; recibo: Recibo; pdf: Uint8Array }[]; avisos: string[] }> {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes);
  } catch {
    throw new ErrorCorrida('El archivo no es un ZIP válido.');
  }
  let resumen: Resumen | null = null;
  const recibos: { archivo: string; recibo: Recibo; pdf: Uint8Array }[] = [];
  const avisos: string[] = [];
  for (const [ruta, datos] of Object.entries(archivos)) {
    if (!ruta.toLowerCase().endsWith('.pdf') || ruta.startsWith('__MACOSX/')) continue;
    const archivo = nombreLegible(ruta.split('/').pop()!);
    try {
      const texto = await extraer(datos);
      if (esResumen(texto)) resumen = leerResumen(texto);
      else recibos.push({ archivo, recibo: leerRecibo(texto), pdf: datos });
    } catch {
      avisos.push(`No se pudo leer ${archivo}.`);
    }
  }
  if (!recibos.length) throw new ErrorCorrida('El ZIP no trae recibos de transferencia Banregio.');
  return { resumen, recibos, avisos };
}
```

- [ ] **Step 6: Correr la prueba y ver que pasa**

Run: `npx vitest run tests/portal/sucursales-propias-recibos.test.ts`
Expected: PASS.

- [ ] **Step 7: Script para revisar un ZIP real (sin Zoho)**

Create `scripts/sucursales-propias/probar-zip.ts`:

```ts
// Uso: npx tsx scripts/sucursales-propias/probar-zip.ts "<ruta al ZIP>"
// Lee el ZIP con el mismo código del portal e imprime lo que entendió. No guarda nada ni llama a Zoho.
import { readFileSync } from 'node:fs';
import { leerZip } from '../../lib/sucursales-propias/zip';
import { unir } from '../../lib/sucursales-propias/recibos';

const ruta = process.argv[2];
if (!ruta) throw new Error('Pasa la ruta del ZIP.');
const zip = await leerZip(new Uint8Array(readFileSync(ruta)));
const { transferencias, avisos } = unir(zip.resumen, zip.recibos);
console.table(
  transferencias.map((t) => ({
    sec: t.secuencia,
    tipo: t.tipo,
    alias: t.alias,
    cuenta: t.clabe ? `…${t.clabe.slice(-4)}` : '(sin CLABE)',
    monto: t.monto.toFixed(2),
    fecha: t.fecha,
    llave: t.llave,
  })),
);
for (const a of [...zip.avisos, ...avisos]) console.log('Aviso:', a);
```

Run: `npx tsx scripts/sucursales-propias/probar-zip.ts "C:\Users\sebcm\Downloads\SUCURSALES 20NOV26.zip"`
Expected: 17 filas, secuencias 1–17, total $189,277.70, sin avisos de diferencia de totales; la fila 17 (Banregio) con CLABE `…5957` y llave `BRG-2026-11-20-5957-2700.00`. Si alguna fila no sale, ajusta los patrones de `recibos.ts` y agrega a la prueba el caso que faltó (texto anonimizado).

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json lib/sucursales-propias/recibos.ts lib/sucursales-propias/zip.ts scripts/sucursales-propias/probar-zip.ts tests/portal/sucursales-propias-recibos.test.ts
git commit -m "feat(sucursales-propias): lectura de recibos Banregio y resumen de la masiva"
```

---

### Task 3: Empate con proveedores y facturas, y armado de la corrida

**Files:**
- Create: `lib/sucursales-propias/empate.ts`
- Create: `lib/sucursales-propias/planear.ts`
- Test: `tests/portal/sucursales-propias-empate.test.ts`

**Interfaces:**
- Consumes: `centavos`, `Transferencia`, `Resumen` de `lib/sucursales-propias/recibos.ts` (Task 2).
- Produces (`empate.ts`, puro):
  - `interface Proveedor { id: string; nombre: string }`
  - `interface Factura { billId: string; vendorId: string; numero: string; fecha: string; vencimiento: string; saldo: number; ubicacion: string; notas: string }` — **mismo JSON que devuelve la Edge Function `facturas` (Task 5)**.
  - `interface Asignacion { billId: string; numero: string; ubicacion: string; fecha: string; saldo: number; monto: number }`
  - `type EstadoPrevio = 'cuadra' | 'no_cuadra' | 'desconocido' | 'sin_facturas'`
  - `interface Empate { estado: EstadoPrevio; proveedor: Proveedor | null; sugerido: boolean; asignaciones: Asignacion[] }`
  - `normalizarNombre(s)`, `sugerirProveedor(alias, proveedores): Proveedor | null`, `aAsignacion(f: Factura, monto: number): Asignacion`, `repartir(monto, facturas): Asignacion[]`, `conProveedor(monto, proveedor, sugerido, facturas): Empate`, `empatar(t: { clabe: string | null; alias: string; monto: number }, equivalencias: Map<string, Proveedor>, proveedores: Proveedor[], facturas: Factura[]): Empate`, `validarAsignaciones(monto, asignaciones: { billId: string; monto: number }[], facturas: Factura[]): string | null`
- Produces (`planear.ts`, puro):
  - `interface Previa { llave: string; corrida_id: number; estado: string }`
  - `interface FilaAsignacion { bill_id: string; bill_numero: string; ubicacion: string; fecha: string | null; saldo: number; monto: number }`
  - `interface PayloadCorrida` (forma exacta del `p jsonb` de `suc_pagos_registrar_corrida`, Task 1)
  - `separarNuevas(transferencias, previas): { nuevas: Transferencia[]; avisos: string[] }`
  - `proveedoresAConsultar(nuevas, equivalencias, proveedores): string[]`
  - `aFila(a: Asignacion): FilaAsignacion`
  - `armarCorrida(e: { archivo: string; resumen: Resumen | null; todas: Transferencia[]; nuevas: Transferencia[]; avisos: string[]; equivalencias: Map<string, Proveedor>; proveedores: Proveedor[]; facturas: Factura[] }): PayloadCorrida`

- [ ] **Step 1: Escribir la prueba que falla**

`tests/portal/sucursales-propias-empate.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  conProveedor,
  empatar,
  normalizarNombre,
  repartir,
  sugerirProveedor,
  validarAsignaciones,
  type Factura,
  type Proveedor,
} from '../../lib/sucursales-propias/empate';
import { armarCorrida, proveedoresAConsultar, separarNuevas } from '../../lib/sucursales-propias/planear';
import type { Transferencia } from '../../lib/sucursales-propias/recibos';

// Nombres de la corrida real del 20 nov 2026 (banco vs. Zoho).
const PROVEEDORES: Proveedor[] = [
  { id: 'v-oh', nombre: 'OH LALA (PRODUCTORA DE ALIMENTOS OH)' },
  { id: 'v-fs', nombre: 'FOOD SERVICE DE MEXICO' },
  { id: 'v-cr', nombre: 'CESAR RAUL MARTINEZ VILLASEÑOR' },
  { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' },
  { id: 'v-pk', nombre: 'PINKBOOK' },
  { id: 'v-sg', nombre: 'SIGMA FOODSERVICE COMERCIAL' },
];

const f = (billId: string, vendorId: string, fecha: string, saldo: number): Factura => ({
  billId,
  vendorId,
  numero: billId.toUpperCase(),
  fecha,
  vencimiento: fecha,
  saldo,
  ubicacion: 'DARIO',
  notas: '',
});

const t = (o: Partial<Transferencia>): Transferencia => ({
  llave: 'L1',
  tipo: 'SPEI',
  clabe: '012320000000001111',
  alias: 'OH LALA',
  concepto: 'PAGO',
  monto: 100,
  fecha: '2026-11-20',
  claveRastreo: 'L1',
  archivo: 'a.pdf',
  secuencia: 1,
  ...o,
});

describe('normalizarNombre y sugerirProveedor', () => {
  it('quita acentos, puntuación y la razón social', () => {
    expect(normalizarNombre('FOOD SERVICE DE MEXICO SA DE CV')).toBe('FOOD SERVICE DE MEXICO');
    expect(normalizarNombre('PINKBOOK S DE RL DE CV')).toBe('PINKBOOK');
    expect(normalizarNombre('Francisco Román González')).toBe('FRANCISCO ROMAN GONZALEZ');
  });

  it('empata por nombre exacto o contenido, nunca con dos candidatos', () => {
    expect(sugerirProveedor('FOOD SERVICE DE MEXICO SA DE CV', PROVEEDORES)?.id).toBe('v-fs');
    expect(sugerirProveedor('OH LALA', PROVEEDORES)?.id).toBe('v-oh');
    expect(sugerirProveedor('HIBRIDO DISEÑO CESAR RAUL MARTINEZ VILLASEÑOR', PROVEEDORES)?.id).toBe('v-cr');
    expect(sugerirProveedor('PINKBOOK S DE RL DE CV', PROVEEDORES)?.id).toBe('v-pk');
    expect(sugerirProveedor('ALPINA TEPEYAC', PROVEEDORES)).toBeNull();
    const dobles = [...PROVEEDORES, { id: 'v-oh2', nombre: 'OH LALA CEDIS' }];
    expect(sugerirProveedor('OH LALA', dobles)).toBeNull();
  });
});

describe('empatar', () => {
  const sin = new Map<string, Proveedor>();

  it('cuadra: el monto es la suma exacta de saldos, incluso con centavos', () => {
    const facturas = [f('b2', 'v-sg', '2026-11-14', 0.2), f('b1', 'v-sg', '2026-11-05', 1088.5), f('b3', 'v-sg', '2026-11-06', 0.1)];
    const e = empatar(t({ alias: 'SIGMA FOODSERVICE COMERCIAL', monto: 1088.8 }), sin, PROVEEDORES, facturas);
    expect(e.estado).toBe('cuadra');
    expect(e.sugerido).toBe(true);
    expect(e.asignaciones.map((a) => [a.billId, a.monto])).toEqual([['b1', 1088.5], ['b3', 0.1], ['b2', 0.2]]);
  });

  it('la equivalencia guardada por CLABE gana sobre el nombre', () => {
    const eq = new Map([['030320900000001111', { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' }]]);
    const e = empatar(
      t({ alias: 'ALPINA TEPEYAC', clabe: '030320900000001111', monto: 3740 }),
      eq,
      PROVEEDORES,
      [f('b9', 'v-mp', '2026-11-18', 3740)],
    );
    expect(e).toMatchObject({ estado: 'cuadra', sugerido: false, proveedor: { id: 'v-mp' } });
  });

  it('desconocido sin equivalencia ni nombre; sin_facturas si el proveedor no debe nada', () => {
    expect(empatar(t({ alias: 'ALPINA TEPEYAC' }), sin, PROVEEDORES, []).estado).toBe('desconocido');
    expect(empatar(t({ alias: 'PINKBOOK' }), sin, PROVEEDORES, [f('x', 'v-pk', '2026-11-01', 0)]).estado).toBe('sin_facturas');
  });

  it('no cuadra: reparte de la más antigua a la más nueva hasta agotar el monto', () => {
    const facturas = [f('b2', 'v-oh', '2026-11-08', 500), f('b1', 'v-oh', '2026-11-06', 300)];
    const e = empatar(t({ monto: 400 }), sin, PROVEEDORES, facturas);
    expect(e.estado).toBe('no_cuadra');
    expect(e.asignaciones.map((a) => [a.billId, a.monto])).toEqual([['b1', 300], ['b2', 100]]);
    expect(repartir(1000, facturas).reduce((s, a) => s + a.monto, 0)).toBe(800);
  });

  it('conProveedor ignora facturas de otros proveedores', () => {
    const e = conProveedor(10, PROVEEDORES[0], false, [f('a', 'v-fs', '2026-11-01', 10)]);
    expect(e.estado).toBe('sin_facturas');
  });
});

describe('validarAsignaciones', () => {
  const facturas = [f('b1', 'v-oh', '2026-11-06', 300), f('b2', 'v-oh', '2026-11-08', 500)];
  it('acepta un reparto que suma exacto', () => {
    expect(validarAsignaciones(400, [{ billId: 'b1', monto: 300 }, { billId: 'b2', monto: 100 }], facturas)).toBeNull();
  });
  it('rechaza sumas distintas, montos mayores al saldo, ceros, repetidas y facturas ajenas', () => {
    expect(validarAsignaciones(400, [{ billId: 'b1', monto: 300 }], facturas)).toMatch(/no es igual/);
    expect(validarAsignaciones(400, [{ billId: 'b1', monto: 400 }], facturas)).toMatch(/mayor que su saldo/);
    expect(validarAsignaciones(0, [{ billId: 'b1', monto: 0 }], facturas)).toMatch(/mayor a cero/);
    expect(validarAsignaciones(600, [{ billId: 'b1', monto: 300 }, { billId: 'b1', monto: 300 }], facturas)).toMatch(/dos veces/);
    expect(validarAsignaciones(1, [{ billId: 'zz', monto: 1 }], facturas)).toMatch(/ya no está abierta/);
    expect(validarAsignaciones(1, [], facturas)).toMatch(/al menos una/);
  });
});

describe('planear', () => {
  it('separarNuevas deja fuera las llaves ya registradas y lo avisa', () => {
    const r = separarNuevas([t({ llave: 'L1' }), t({ llave: 'L2', alias: 'PINKBOOK', monto: 552.21 })], [
      { llave: 'L2', corrida_id: 7, estado: 'aplicada' },
    ]);
    expect(r.nuevas.map((x) => x.llave)).toEqual(['L1']);
    expect(r.avisos).toEqual(['PINKBOOK ($552.21): ya registrada en la corrida #7 (aplicada).']);
  });

  it('proveedoresAConsultar junta equivalencias y sugeridos sin repetir', () => {
    const eq = new Map([['030320900000001111', { id: 'v-mp', nombre: 'MP' }]]);
    const ids = proveedoresAConsultar(
      [t({ alias: 'OH LALA' }), t({ alias: 'OH LALA', llave: 'L3' }), t({ alias: 'ALPINA', clabe: '030320900000001111' }), t({ alias: 'NADIE' })],
      eq,
      PROVEEDORES,
    );
    expect(ids.sort()).toEqual(['v-mp', 'v-oh']);
  });

  it('armarCorrida arma el payload de la RPC con totales en centavos exactos', () => {
    const todas = [t({ monto: 0.1 }), t({ llave: 'L2', monto: 0.2 })];
    const p = armarCorrida({
      archivo: 'z.zip',
      resumen: null,
      todas,
      nuevas: todas,
      avisos: ['a'],
      equivalencias: new Map(),
      proveedores: PROVEEDORES,
      facturas: [f('b1', 'v-oh', '2026-11-06', 0.3)],
    });
    expect(p.total_recibos).toBe(0.3);
    expect(p.n_recibos).toBe(2);
    expect(p.transferencias[0]).toMatchObject({ llave: 'L1', estado: 'no_cuadra', proveedor_zoho_id: 'v-oh', fecha_operacion: '2026-11-20' });
    expect(p.transferencias[0].asignaciones[0]).toEqual({ bill_id: 'b1', bill_numero: 'B1', ubicacion: 'DARIO', fecha: '2026-11-06', saldo: 0.3, monto: 0.1 });
  });
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `npx vitest run tests/portal/sucursales-propias-empate.test.ts`
Expected: FAIL (`Cannot find module '../../lib/sucursales-propias/empate'`).

- [ ] **Step 3: Escribir `lib/sucursales-propias/empate.ts`**

```ts
// Empate de una transferencia con su proveedor de Zoho y sus facturas abiertas (spec §4 paso 2). Puro.
import { centavos } from './recibos';

export interface Proveedor {
  id: string;
  nombre: string;
}

/** Factura de proveedor con saldo, tal como la devuelve la Edge Function zoho-suc-pagos (acción "facturas"). */
export interface Factura {
  billId: string;
  vendorId: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  saldo: number;
  ubicacion: string;
  notas: string;
}

export interface Asignacion {
  billId: string;
  numero: string;
  ubicacion: string;
  fecha: string;
  saldo: number;
  monto: number;
}

export type EstadoPrevio = 'cuadra' | 'no_cuadra' | 'desconocido' | 'sin_facturas';

export interface Empate {
  estado: EstadoPrevio;
  proveedor: Proveedor | null;
  /** true si el proveedor salió por nombre parecido (la equivalencia por CLABE se guarda al aplicar). */
  sugerido: boolean;
  asignaciones: Asignacion[];
}

export function normalizarNombre(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+(SAPI|SA|S)(\s+DE)?(\s+RL)?(\s+DE)?(\s+CV)?$/, '')
    .trim();
}

/** Contiene la secuencia de palabras completa (mínimo 2 palabras, para no empatar por una sola). */
const contiene = (largo: string, corto: string) => corto.split(' ').length >= 2 && ` ${largo} `.includes(` ${corto} `);

export function sugerirProveedor(alias: string, proveedores: Proveedor[]): Proveedor | null {
  const a = normalizarNombre(alias);
  if (!a) return null;
  const exactos = proveedores.filter((p) => normalizarNombre(p.nombre) === a);
  if (exactos.length) return exactos.length === 1 ? exactos[0] : null;
  const parciales = proveedores.filter((p) => {
    const n = normalizarNombre(p.nombre);
    return n !== '' && (contiene(a, n) || contiene(n, a));
  });
  return parciales.length === 1 ? parciales[0] : null;
}

const porAntiguedad = (a: Factura, b: Factura) => a.fecha.localeCompare(b.fecha) || a.numero.localeCompare(b.numero);

export const aAsignacion = (f: Factura, monto: number): Asignacion => ({
  billId: f.billId,
  numero: f.numero,
  ubicacion: f.ubicacion,
  fecha: f.fecha,
  saldo: f.saldo,
  monto,
});

/** Reparte el monto de la factura más antigua a la más nueva, sin pasar el saldo de cada una. */
export function repartir(monto: number, facturas: Factura[]): Asignacion[] {
  let resta = centavos(monto);
  const out: Asignacion[] = [];
  for (const f of [...facturas].sort(porAntiguedad)) {
    if (resta <= 0) break;
    const c = Math.min(resta, centavos(f.saldo));
    if (c <= 0) continue;
    out.push(aAsignacion(f, c / 100));
    resta -= c;
  }
  return out;
}

export function conProveedor(monto: number, proveedor: Proveedor, sugerido: boolean, facturas: Factura[]): Empate {
  const abiertas = facturas.filter((f) => f.vendorId === proveedor.id && centavos(f.saldo) > 0);
  if (!abiertas.length) return { estado: 'sin_facturas', proveedor, sugerido, asignaciones: [] };
  const suma = abiertas.reduce((s, f) => s + centavos(f.saldo), 0);
  if (suma === centavos(monto))
    return {
      estado: 'cuadra',
      proveedor,
      sugerido,
      asignaciones: [...abiertas].sort(porAntiguedad).map((f) => aAsignacion(f, f.saldo)),
    };
  return { estado: 'no_cuadra', proveedor, sugerido, asignaciones: repartir(monto, abiertas) };
}

export function empatar(
  t: { clabe: string | null; alias: string; monto: number },
  equivalencias: Map<string, Proveedor>,
  proveedores: Proveedor[],
  facturas: Factura[],
): Empate {
  const fijo = t.clabe ? (equivalencias.get(t.clabe) ?? null) : null;
  const proveedor = fijo ?? sugerirProveedor(t.alias, proveedores);
  if (!proveedor) return { estado: 'desconocido', proveedor: null, sugerido: false, asignaciones: [] };
  return conProveedor(t.monto, proveedor, !fijo, facturas);
}

/** null si el reparto manual es válido; si no, el motivo en lenguaje claro. */
export function validarAsignaciones(
  monto: number,
  asignaciones: { billId: string; monto: number }[],
  facturas: Factura[],
): string | null {
  if (!asignaciones.length) return 'Elige al menos una factura.';
  const vistas = new Set<string>();
  let suma = 0;
  for (const a of asignaciones) {
    const f = facturas.find((x) => x.billId === a.billId);
    if (!f) return 'Una de las facturas ya no está abierta en Zoho.';
    if (vistas.has(a.billId)) return `La factura ${f.numero} aparece dos veces.`;
    vistas.add(a.billId);
    const c = centavos(a.monto);
    if (!(c > 0)) return `El abono a ${f.numero} debe ser mayor a cero.`;
    if (c > centavos(f.saldo)) return `El abono a ${f.numero} es mayor que su saldo ($${f.saldo.toFixed(2)}).`;
    suma += c;
  }
  if (suma !== centavos(monto))
    return `Lo asignado ($${(suma / 100).toFixed(2)}) no es igual a la transferencia ($${monto.toFixed(2)}).`;
  return null;
}
```

- [ ] **Step 4: Escribir `lib/sucursales-propias/planear.ts`**

```ts
// Decide qué se registra de un ZIP y arma el payload de suc_pagos_registrar_corrida (spec §4 paso 1, §6). Puro.
import { centavos, type Resumen, type Transferencia } from './recibos';
import { empatar, sugerirProveedor, type Asignacion, type EstadoPrevio, type Factura, type Proveedor } from './empate';

export interface Previa {
  llave: string;
  corrida_id: number;
  estado: string;
}

export interface FilaAsignacion {
  bill_id: string;
  bill_numero: string;
  ubicacion: string;
  fecha: string | null;
  saldo: number;
  monto: number;
}

export interface PayloadCorrida {
  archivo: string;
  n_resumen: number | null;
  total_resumen: number | null;
  n_recibos: number;
  total_recibos: number;
  avisos: string[];
  transferencias: {
    llave: string;
    tipo: Transferencia['tipo'];
    clabe: string | null;
    alias: string;
    concepto: string;
    monto: number;
    fecha_operacion: string;
    proveedor_zoho_id: string | null;
    proveedor_nombre: string | null;
    sugerido: boolean;
    estado: EstadoPrevio;
    asignaciones: FilaAsignacion[];
  }[];
}

export function separarNuevas(
  transferencias: Transferencia[],
  previas: Previa[],
): { nuevas: Transferencia[]; avisos: string[] } {
  const ya = new Map(previas.map((p) => [p.llave, p]));
  const avisos: string[] = [];
  const nuevas = transferencias.filter((t) => {
    const p = ya.get(t.llave);
    if (p) avisos.push(`${t.alias} ($${t.monto.toFixed(2)}): ya registrada en la corrida #${p.corrida_id} (${p.estado}).`);
    return !p;
  });
  return { nuevas, avisos };
}

export function proveedoresAConsultar(
  nuevas: Transferencia[],
  equivalencias: Map<string, Proveedor>,
  proveedores: Proveedor[],
): string[] {
  const ids = new Set<string>();
  for (const t of nuevas) {
    const p = (t.clabe ? equivalencias.get(t.clabe) : undefined) ?? sugerirProveedor(t.alias, proveedores);
    if (p) ids.add(p.id);
  }
  return [...ids];
}

export const aFila = (a: Asignacion): FilaAsignacion => ({
  bill_id: a.billId,
  bill_numero: a.numero,
  ubicacion: a.ubicacion,
  fecha: a.fecha || null,
  saldo: a.saldo,
  monto: a.monto,
});

export function armarCorrida(e: {
  archivo: string;
  resumen: Resumen | null;
  todas: Transferencia[];
  nuevas: Transferencia[];
  avisos: string[];
  equivalencias: Map<string, Proveedor>;
  proveedores: Proveedor[];
  facturas: Factura[];
}): PayloadCorrida {
  return {
    archivo: e.archivo,
    n_resumen: e.resumen?.numero ?? null,
    total_resumen: e.resumen?.total ?? null,
    n_recibos: e.todas.length,
    total_recibos: e.todas.reduce((s, t) => s + centavos(t.monto), 0) / 100,
    avisos: e.avisos,
    transferencias: e.nuevas.map((t) => {
      const m = empatar(t, e.equivalencias, e.proveedores, e.facturas);
      return {
        llave: t.llave,
        tipo: t.tipo,
        clabe: t.clabe,
        alias: t.alias,
        concepto: t.concepto,
        monto: t.monto,
        fecha_operacion: t.fecha,
        proveedor_zoho_id: m.proveedor?.id ?? null,
        proveedor_nombre: m.proveedor?.nombre ?? null,
        sugerido: m.sugerido,
        estado: m.estado,
        asignaciones: m.asignaciones.map(aFila),
      };
    }),
  };
}
```

- [ ] **Step 5: Correr la prueba y ver que pasa**

Run: `npx vitest run tests/portal/sucursales-propias-empate.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/sucursales-propias/empate.ts lib/sucursales-propias/planear.ts tests/portal/sucursales-propias-empate.test.ts
git commit -m "feat(sucursales-propias): empate por CLABE y nombre, reparto y armado de la corrida"
```

---

### Task 4: Cliente Zoho — subida multipart y conexión a la org Sucursales GDL

**Files:**
- Modify: `supabase/functions/_shared/zoho.ts` (método `subir`)
- Create: `supabase/functions/_shared/zohoSuc.ts`
- Test: `supabase/functions/_shared/zohoSubir_test.ts`

**Interfaces:**
- Produces: `ZohoClient.subir<T>(path: string, campo: string, datos: Uint8Array, nombre: string, tipo?: string): Promise<T>` (POST multipart; no reintenta 5xx; respeta `soloLectura`); `sucEfectos(): boolean`; `zohoSucDesdeEnv(): ZohoClient`.

- [ ] **Step 1: Escribir la prueba que falla**

`supabase/functions/_shared/zohoSubir_test.ts`:

```ts
import { assertEquals, assertRejects } from "@std/assert";
import { ZohoClient, ZohoError } from "./zoho.ts";

const cfg = { clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "999", sleep: async () => {} };
const token = () => new Response(JSON.stringify({ access_token: "tk", expires_in: 3600 }));

Deno.test("subir manda multipart con el archivo, sin Content-Type JSON", async () => {
  const vistos: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.includes("/oauth/")) return token();
    vistos.push({ url, init });
    return new Response(JSON.stringify({ code: 0, message: "ok" }));
  }) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn });
  await z.subir("/vendorpayments/p1/attachment", "attachment", new Uint8Array([37, 80, 68, 70]), "recibo.pdf");
  assertEquals(vistos.length, 1);
  assertEquals(vistos[0].url, "https://www.zohoapis.com/books/v3/vendorpayments/p1/attachment?organization_id=999");
  const h = vistos[0].init!.headers as Record<string, string>;
  assertEquals(h.Authorization, "Zoho-oauthtoken tk");
  assertEquals(h["Content-Type"], undefined);
  const form = vistos[0].init!.body as FormData;
  const archivo = form.get("attachment") as File;
  assertEquals(archivo.name, "recibo.pdf");
  assertEquals(archivo.type, "application/pdf");
  assertEquals(archivo.size, 4);
});

Deno.test("subir no envía nada en modo sin efectos externos", async () => {
  let llamadas = 0;
  const fetchFn = (async () => { llamadas++; return token(); }) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn, soloLectura: true });
  await assertRejects(() => z.subir("/bills/b1/attachment", "attachment", new Uint8Array([1]), "a.pdf"), ZohoError);
  assertEquals(llamadas, 0);
});

Deno.test("subir propaga el error de Zoho con su status", async () => {
  const fetchFn = (async (url: string) =>
    url.includes("/oauth/") ? token() : new Response(JSON.stringify({ code: 5, message: "URL inválida" }), { status: 404 })) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn });
  const e = await assertRejects(() => z.subir("/x", "attachment", new Uint8Array([1]), "a.pdf"), ZohoError);
  assertEquals((e as ZohoError).status, 404);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/zohoSubir_test.ts`
Expected: FAIL (`z.subir is not a function`).

- [ ] **Step 3: Agregar `subir` a `ZohoClient`** (en `supabase/functions/_shared/zoho.ts`, después de `del`)

```ts
  /** Sube un archivo como multipart/form-data. Igual que post: no reintenta 5xx (pudo haberse guardado ya). */
  async subir<T>(path: string, campo: string, datos: Uint8Array, nombre: string, tipo = "application/pdf"): Promise<T> {
    if (this.cfg.soloLectura) {
      throw new ZohoError(`Zoho en modo sin efectos externos: POST ${path} no se envió`, 0);
    }
    const url = `${this.api}${path}?${new URLSearchParams({ organization_id: this.cfg.orgId })}`;
    let refrescado = false;
    for (let intento = 0; ; intento++) {
      const tk = await this.obtenerToken();
      const form = new FormData();
      form.append(campo, new Blob([datos as BlobPart], { type: tipo }), nombre);
      this.llamadas++;
      // Sin Content-Type: fetch pone multipart/form-data con su boundary.
      const r = await this.f(url, { method: "POST", headers: { Authorization: `Zoho-oauthtoken ${tk}` }, body: form });
      if (r.status === 401 && !refrescado) { refrescado = true; this.llamadas--; await this.obtenerToken(true); continue; }
      if (r.status === 429 && intento < REINTENTOS - 1) { await this.sleep(1000 * 2 ** intento); continue; }
      const j = await r.json().catch(() => ({}));
      if (!r.ok || (j.code !== undefined && j.code !== 0)) {
        throw new ZohoError(j.message ?? `Zoho HTTP ${r.status}`, r.status, j.code);
      }
      return j as T;
    }
  }
```

- [ ] **Step 4: Crear `supabase/functions/_shared/zohoSuc.ts`**

```ts
// Zoho Books de la org Sucursales The Coffee – GDL (spec pagos de Sucursales propias §5). Credenciales propias,
// separadas de las de Comercializadora, y bandera de escritura propia (SUC_PAGOS_EFECTOS).
import { ZohoClient } from "./zoho.ts";

export const sucEfectos = (): boolean => Deno.env.get("SUC_PAGOS_EFECTOS") === "si";

export function zohoSucDesdeEnv(): ZohoClient {
  const v = (k: string) => {
    const x = Deno.env.get(k);
    if (!x) throw new Error(`Falta el secreto ${k}`);
    return x;
  };
  return new ZohoClient({
    clientId: v("ZOHO_SUC_CLIENT_ID"), clientSecret: v("ZOHO_SUC_CLIENT_SECRET"),
    refreshToken: v("ZOHO_SUC_REFRESH_TOKEN"), orgId: v("ZOHO_SUC_ORG_ID"),
    soloLectura: !sucEfectos(),
  });
}
```

- [ ] **Step 5: Correr las pruebas de funciones**

Run: `npm run test:funciones`
Expected: PASS (las nuevas y todas las existentes de `zoho.ts`).

- [ ] **Step 6: Commit**

```bash
git add supabase/functions/_shared/zoho.ts supabase/functions/_shared/zohoSuc.ts supabase/functions/_shared/zohoSubir_test.ts
git commit -m "feat(zoho): subida multipart y cliente de la org Sucursales GDL"
```

---

### Task 5: Edge Function `zoho-suc-pagos` — facturas, proveedores y aplicar

**Files:**
- Create: `supabase/functions/_shared/sucPagos.ts` (núcleo puro)
- Create: `supabase/functions/_shared/sucPagosRepo.ts` (acceso a la base con service role)
- Create: `supabase/functions/zoho-suc-pagos/index.ts`
- Modify: `supabase/config.toml` (bloque de la función)
- Test: `supabase/functions/_shared/sucPagos_test.ts`

**Interfaces:**
- Consumes: `ZohoClient` con `get`, `post`, `subir`, `listAll` (Task 4); tablas y bucket de Task 1.
- Produces (`sucPagos.ts`):
  - `interface ZohoPagos { get; post; subir; listAll }` (subconjunto de `ZohoClient`)
  - `interface RepoPagos { transferencia(id): Promise<FilaTransferencia | null>; asignaciones(id): Promise<FilaAsignacion[]>; marcar(id, desde: string[], cambios: Record<string, unknown>): Promise<boolean>; recibo(ruta): Promise<Uint8Array>; cuenta(): Promise<{ id: string | null; nombre: string }>; guardarCuenta(id): Promise<void>; guardarEquivalencia(clabe, proveedorId, nombre): Promise<void> }`
  - `aplicar(repo, zoho, id: number, usuario: string): Promise<{ estado: string; mensaje?: string; pagoId?: string }>`
  - `facturasAbiertas(zoho, vendorIds: string[]): Promise<Factura[]>` (misma forma que `Factura` de `lib/sucursales-propias/empate.ts`)
  - `listarProveedores(zoho): Promise<{ id: string; nombre: string }[]>`
- Contrato HTTP (lo usa el portal en Task 6): `POST /functions/v1/zoho-suc-pagos`, encabezados `x-com-secreto` y `x-usuario-jwt`; cuerpo `{ accion: 'proveedores' }` → `{ ok: true, proveedores }`; `{ accion: 'facturas', vendorIds: string[] }` → `{ ok: true, facturas }`; `{ accion: 'aplicar', id: number }` → `{ ok: true, estado, mensaje?, pagoId? }`. Errores: `{ ok: false, error }` con 401/403/400/502.

- [ ] **Step 1: Escribir la prueba que falla**

`supabase/functions/_shared/sucPagos_test.ts`:

```ts
import { assertEquals, assertMatch } from "@std/assert";
import { ZohoError } from "./zoho.ts";
import { aplicar, facturasAbiertas, type FilaTransferencia, type RepoPagos, type ZohoPagos } from "./sucPagos.ts";

type Llamada = { m: string; path: string; body?: unknown; params?: Record<string, string> };

function zohoFalso(o: {
  pagosPrevios?: { payment_id: string; reference_number: string }[];
  saldos?: Record<string, number>;
  fallarPost?: boolean;
  adjuntoPago?: "ok" | 404 | 500;
  adjuntoFactura?: "ok" | 500;
}) {
  const llamadas: Llamada[] = [];
  const z: ZohoPagos = {
    async get<T>(path: string, params: Record<string, string> = {}) {
      llamadas.push({ m: "GET", path, params });
      if (path === "/vendorpayments") return { vendorpayments: o.pagosPrevios ?? [] } as T;
      const b = /^\/bills\/(.+)$/.exec(path);
      if (b) return { bill: { balance: o.saldos?.[b[1]] ?? 0 } } as T;
      throw new Error(`GET inesperado ${path}`);
    },
    async post<T>(path: string, body: unknown) {
      llamadas.push({ m: "POST", path, body });
      if (o.fallarPost) throw new ZohoError("El proveedor está inactivo", 400, 1001);
      return { vendorpayment: { payment_id: "pago-1" } } as T;
    },
    async subir<T>(path: string) {
      llamadas.push({ m: "SUBIR", path });
      const r = path.startsWith("/vendorpayments") ? (o.adjuntoPago ?? "ok") : (o.adjuntoFactura ?? "ok");
      if (r !== "ok") throw new ZohoError("falla adjunto", r);
      return {} as T;
    },
    async listAll<T>(path: string) {
      llamadas.push({ m: "LIST", path });
      if (path === "/chartofaccounts")
        return [
          { account_id: "c-otra", account_name: "BANREGIO - OTRA", account_type: "bank" },
          { account_id: "c-151", account_name: "BANREGIO - CONSOLIDADO SUCURSALES PROPIAS - *0151", account_type: "bank" },
        ] as T[];
      throw new Error(`LIST inesperado ${path}`);
    },
  };
  return { z, llamadas };
}

function repoFalso(t: Partial<FilaTransferencia> = {}) {
  const fila: FilaTransferencia = {
    id: 1, llave: "058-20/11/2026/20-X1", clabe: "012535000000001111", concepto: "PAGO FACTURAS", monto: 400,
    fecha_operacion: "2026-11-20", archivo_pdf: "5/abc.pdf", proveedor_zoho_id: "v-oh", proveedor_nombre: "OH LALA",
    estado: "cuadra", zoho_vendorpayment_id: null, adjunto_ok: false, ...t,
  };
  const estado = { fila, cuentaId: null as string | null, equivalencias: [] as string[] };
  const repo: RepoPagos = {
    async transferencia() { return { ...estado.fila }; },
    async asignaciones() { return [{ bill_id: "b1", bill_numero: "A1", monto: 300 }, { bill_id: "b2", bill_numero: "A2", monto: 100 }]; },
    async marcar(_id, desde, cambios) {
      if (!desde.includes(estado.fila.estado)) return false;
      estado.fila = { ...estado.fila, ...cambios } as FilaTransferencia;
      return true;
    },
    async recibo() { return new Uint8Array([1, 2, 3]); },
    async cuenta() { return { id: estado.cuentaId, nombre: "BANREGIO - CONSOLIDADO SUCURSALES PROPIAS" }; },
    async guardarCuenta(id) { estado.cuentaId = id; },
    async guardarEquivalencia(clabe, pid) { estado.equivalencias.push(`${clabe}:${pid}`); },
  };
  return { repo, estado };
}

const SALDOS = { b1: 300, b2: 500 };

Deno.test("cuadra: crea el pago repartido, adjunta al pago, guarda cuenta y equivalencia", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "aplicada", pagoId: "pago-1" });
  const post = llamadas.find((l) => l.m === "POST")!;
  assertEquals(post.path, "/vendorpayments");
  assertEquals(post.body, {
    vendor_id: "v-oh", date: "2026-11-20", amount: 400, paid_through_account_id: "c-151",
    reference_number: "058-20/11/2026/20-X1", description: "PAGO FACTURAS",
    bills: [{ bill_id: "b1", amount_applied: 300 }, { bill_id: "b2", amount_applied: 100 }],
  });
  assertEquals(llamadas.filter((l) => l.m === "SUBIR").map((l) => l.path), ["/vendorpayments/pago-1/attachment"]);
  assertEquals(estado.fila.estado, "aplicada");
  assertEquals(estado.fila.adjunto_ok, true);
  assertEquals((estado.fila as unknown as Record<string, unknown>).aplicado_por, "u1");
  assertEquals(estado.cuentaId, "c-151");
  assertEquals(estado.equivalencias, ["012535000000001111:v-oh"]);
});

Deno.test("si el pago ya existe en Zoho con esa referencia, no crea otro", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, pagosPrevios: [{ payment_id: "viejo", reference_number: "058-20/11/2026/20-X1" }] });
  const { repo, estado } = repoFalso({ estado: "error" });
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "ya_aplicada", pagoId: "viejo" });
  assertEquals(llamadas.some((l) => l.m === "POST"), false);
  assertEquals(estado.fila.zoho_vendorpayment_id, "viejo");
});

Deno.test("una referencia que solo se parece no cuenta como pago previo", async () => {
  const { z } = zohoFalso({ saldos: SALDOS, pagosPrevios: [{ payment_id: "otro", reference_number: "058-20/11/2026/20-X10" }] });
  const { repo } = repoFalso();
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
});

Deno.test("si un saldo bajó en Zoho, no paga y regresa a no_cuadra", async () => {
  const { z, llamadas } = zohoFalso({ saldos: { b1: 300, b2: 50 } });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r.estado, "no_cuadra");
  assertMatch(r.mensaje!, /A2 cambió en Zoho \(\$50\.00\)/);
  assertEquals(llamadas.some((l) => l.m === "POST"), false);
  assertEquals(estado.fila.estado, "no_cuadra");
});

Deno.test("error de Zoho al crear el pago: queda en error con el mensaje", async () => {
  const { z } = zohoFalso({ saldos: SALDOS, fallarPost: true });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "error", mensaje: "Zoho: El proveedor está inactivo" });
  assertEquals(estado.fila.estado, "error");
});

Deno.test("si Zoho no acepta adjunto en el pago, adjunta a cada factura", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, adjuntoPago: 404 });
  const { repo } = repoFalso();
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
  assertEquals(llamadas.filter((l) => l.m === "SUBIR").map((l) => l.path), [
    "/vendorpayments/pago-1/attachment", "/bills/b1/attachment", "/bills/b2/attachment",
  ]);
});

Deno.test("si el adjunto falla, queda aplicada_sin_adjunto y el reintento solo adjunta", async () => {
  const z1 = zohoFalso({ saldos: SALDOS, adjuntoPago: 500 });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z1.z, 1, "u1");
  assertEquals(r.estado, "aplicada_sin_adjunto");
  assertEquals(estado.fila.estado, "aplicada_sin_adjunto");
  const z2 = zohoFalso({ saldos: SALDOS });
  assertEquals((await aplicar(repo, z2.z, 1, "u1")).estado, "aplicada");
  assertEquals(z2.llamadas.some((l) => l.m === "POST"), false);
  assertEquals(z2.llamadas.map((l) => l.m), ["SUBIR"]);
});

Deno.test("una transferencia ya aplicada, no lista o tomada por otro no llama a Zoho", async () => {
  for (const [estado, esperado] of [["aplicada", "aplicada"], ["desconocido", "desconocido"], ["no_cuadra", "no_cuadra"]]) {
    const { z, llamadas } = zohoFalso({ saldos: SALDOS });
    const { repo } = repoFalso({ estado, zoho_vendorpayment_id: estado === "aplicada" ? "p" : null });
    assertEquals((await aplicar(repo, z, 1, "u1")).estado, esperado);
    assertEquals(llamadas.length, 0);
  }
  const { z } = zohoFalso({ saldos: SALDOS });
  const { repo } = repoFalso();
  repo.marcar = async () => false;
  assertMatch((await aplicar(repo, z, 1, "u1")).mensaje!, /Otra persona/);
});

Deno.test("la cuenta guardada se usa sin volver a listar el catálogo", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  estado.cuentaId = "c-guardada";
  await aplicar(repo, z, 1, "u1");
  assertEquals(llamadas.some((l) => l.m === "LIST"), false);
  assertEquals((llamadas.find((l) => l.m === "POST")!.body as { paid_through_account_id: string }).paid_through_account_id, "c-guardada");
});

Deno.test("facturasAbiertas junta los tres estados sin repetir y deja solo saldo > 0", async () => {
  const pedidas: Record<string, string>[] = [];
  const z = {
    async listAll<T>(_p: string, _k: string, params: Record<string, string>) {
      pedidas.push(params);
      const base = { vendor_id: params.vendor_id, date: "2026-11-06", due_date: "2026-11-13", location_name: "DARIO" };
      if (params.status === "overdue") return [{ ...base, bill_id: "b1", bill_number: "A1", balance: 300 }] as T[];
      if (params.status === "partially_paid") return [{ ...base, bill_id: "b1", bill_number: "A1", balance: 300 }, { ...base, bill_id: "b0", bill_number: "A0", balance: 0 }] as T[];
      return [] as T[];
    },
  } as unknown as ZohoPagos;
  const f = await facturasAbiertas(z, ["v1", "v1"]);
  assertEquals(pedidas.length, 3);
  assertEquals(f, [{ billId: "b1", vendorId: "v1", numero: "A1", fecha: "2026-11-06", vencimiento: "2026-11-13", saldo: 300, ubicacion: "DARIO", notas: "" }]);
});
```

- [ ] **Step 2: Correr la prueba y ver que falla**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/sucPagos_test.ts`
Expected: FAIL (`Module not found ".../sucPagos.ts"`).

- [ ] **Step 3: Escribir `supabase/functions/_shared/sucPagos.ts`**

```ts
// Núcleo de pagos de Sucursales propias en Zoho Books (spec §5 y §7). Puro: recibe Zoho y la base como interfaces.
import { ZohoError } from "./zoho.ts";

export interface ZohoPagos {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  subir<T>(path: string, campo: string, datos: Uint8Array, nombre: string): Promise<T>;
  listAll<T>(path: string, key: string, params?: Record<string, string>): Promise<T[]>;
}

export interface FilaTransferencia {
  id: number;
  llave: string;
  clabe: string | null;
  concepto: string;
  monto: number;
  fecha_operacion: string;
  archivo_pdf: string;
  proveedor_zoho_id: string | null;
  proveedor_nombre: string | null;
  estado: string;
  zoho_vendorpayment_id: string | null;
  adjunto_ok: boolean;
}

export interface FilaAsignacion {
  bill_id: string;
  bill_numero: string;
  monto: number;
}

export interface RepoPagos {
  transferencia(id: number): Promise<FilaTransferencia | null>;
  asignaciones(id: number): Promise<FilaAsignacion[]>;
  /** Update condicional: solo cambia la fila si su estado actual está en `desde`. true si la cambió. */
  marcar(id: number, desde: string[], cambios: Record<string, unknown>): Promise<boolean>;
  recibo(ruta: string): Promise<Uint8Array>;
  cuenta(): Promise<{ id: string | null; nombre: string }>;
  guardarCuenta(id: string): Promise<void>;
  guardarEquivalencia(clabe: string, proveedorId: string, nombre: string): Promise<void>;
}

/** Misma forma que `Factura` en lib/sucursales-propias/empate.ts (el portal la recibe tal cual). */
export interface Factura {
  billId: string;
  vendorId: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  saldo: number;
  ubicacion: string;
  notas: string;
}

export type ResultadoAplicar = { estado: string; mensaje?: string; pagoId?: string };

const APLICABLES = ["cuadra", "error", "aplicando"];
const cent = (n: number) => Math.round(n * 100);
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const ahora = () => new Date().toISOString();

export async function pagoConReferencia(zoho: ZohoPagos, vendorId: string, llave: string): Promise<string | null> {
  const j = await zoho.get<{ vendorpayments?: { payment_id: string; reference_number?: string }[] }>(
    "/vendorpayments", { vendor_id: vendorId, search_text: llave },
  );
  return j.vendorpayments?.find((p) => p.reference_number === llave)?.payment_id ?? null;
}

async function cuentaPago(repo: RepoPagos, zoho: ZohoPagos): Promise<string> {
  const c = await repo.cuenta();
  if (c.id) return c.id;
  const cuentas = await zoho.listAll<{ account_id: string; account_name: string; account_type: string }>(
    "/chartofaccounts", "chartofaccounts",
  );
  const objetivo = normal(c.nombre);
  const hallados = cuentas.filter((a) => a.account_type === "bank" && normal(a.account_name).startsWith(objetivo));
  if (hallados.length !== 1) {
    throw new ZohoError(`no encontré una sola cuenta bancaria "${c.nombre}" (encontré ${hallados.length})`, 0);
  }
  await repo.guardarCuenta(hallados[0].account_id);
  return hallados[0].account_id;
}

async function adjuntarYCerrar(
  repo: RepoPagos, zoho: ZohoPagos, t: FilaTransferencia, asig: FilaAsignacion[],
): Promise<ResultadoAplicar> {
  const pagoId = t.zoho_vendorpayment_id!;
  try {
    const pdf = await repo.recibo(t.archivo_pdf);
    const nombre = `recibo-${t.llave.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
    try {
      await zoho.subir(`/vendorpayments/${pagoId}/attachment`, "attachment", pdf, nombre);
    } catch (e) {
      // Si la API no admite adjuntos en pagos (spec §5), el recibo va en cada factura liquidada.
      if (!(e instanceof ZohoError) || ![400, 404, 405].includes(e.status)) throw e;
      for (const a of asig) await zoho.subir(`/bills/${a.bill_id}/attachment`, "attachment", pdf, nombre);
    }
    await repo.marcar(t.id, ["aplicada_sin_adjunto"], { estado: "aplicada", adjunto_ok: true, error: null });
    return { estado: "aplicada", pagoId };
  } catch (e) {
    const mensaje = `Pago registrado en Zoho, pero no se pudo adjuntar el recibo: ${e instanceof Error ? e.message : "error"}`;
    await repo.marcar(t.id, ["aplicada_sin_adjunto"], { error: mensaje });
    return { estado: "aplicada_sin_adjunto", pagoId, mensaje };
  }
}

export async function aplicar(repo: RepoPagos, zoho: ZohoPagos, id: number, usuario: string): Promise<ResultadoAplicar> {
  const t = await repo.transferencia(id);
  if (!t) return { estado: "error", mensaje: "La transferencia no existe." };
  if (t.estado === "aplicada" || t.estado === "ya_aplicada") {
    return { estado: t.estado, pagoId: t.zoho_vendorpayment_id ?? undefined };
  }
  if (t.estado === "aplicada_sin_adjunto") return adjuntarYCerrar(repo, zoho, t, await repo.asignaciones(id));
  if (!APLICABLES.includes(t.estado) || !t.proveedor_zoho_id) {
    return { estado: t.estado, mensaje: "La transferencia no está lista para aplicarse." };
  }
  // Reserva antes de llamar a Zoho: dos clics o dos personas no crean dos pagos.
  if (!(await repo.marcar(id, APLICABLES, { estado: "aplicando", error: null }))) {
    return { estado: t.estado, mensaje: "Otra persona la está aplicando." };
  }
  const asig = await repo.asignaciones(id);
  try {
    // Cubre el pago creado cuya respuesta se perdió (fila atorada en "aplicando" o en "error").
    const previo = await pagoConReferencia(zoho, t.proveedor_zoho_id, t.llave);
    if (previo) {
      await repo.marcar(id, ["aplicando"], {
        estado: "ya_aplicada", zoho_vendorpayment_id: previo, aplicado_por: usuario, aplicado_en: ahora(),
      });
      return { estado: "ya_aplicada", pagoId: previo };
    }
    for (const a of asig) {
      const { bill } = await zoho.get<{ bill: { balance: number } }>(`/bills/${a.bill_id}`);
      if (cent(bill.balance) < cent(a.monto)) {
        const mensaje = `El saldo de la factura ${a.bill_numero} cambió en Zoho ($${bill.balance.toFixed(2)}). Revisa la fila.`;
        await repo.marcar(id, ["aplicando"], { estado: "no_cuadra", error: mensaje });
        return { estado: "no_cuadra", mensaje };
      }
    }
    const cuenta = await cuentaPago(repo, zoho);
    const r = await zoho.post<{ vendorpayment: { payment_id: string } }>("/vendorpayments", {
      vendor_id: t.proveedor_zoho_id,
      date: t.fecha_operacion,
      amount: t.monto,
      paid_through_account_id: cuenta,
      reference_number: t.llave,
      description: t.concepto,
      bills: asig.map((a) => ({ bill_id: a.bill_id, amount_applied: a.monto })),
    });
    const pagoId = r.vendorpayment.payment_id;
    await repo.marcar(id, ["aplicando"], {
      estado: "aplicada_sin_adjunto", zoho_vendorpayment_id: pagoId, aplicado_por: usuario, aplicado_en: ahora(),
    });
    if (t.clabe && t.proveedor_nombre) {
      // La equivalencia es una ayuda: si no se guarda, el pago ya quedó bien.
      await repo.guardarEquivalencia(t.clabe, t.proveedor_zoho_id, t.proveedor_nombre).catch(() => {});
    }
    return adjuntarYCerrar(repo, zoho, { ...t, estado: "aplicada_sin_adjunto", zoho_vendorpayment_id: pagoId }, asig);
  } catch (e) {
    const mensaje = e instanceof ZohoError ? `Zoho: ${e.message}` : "No se pudo completar el pago.";
    await repo.marcar(id, ["aplicando"], { estado: "error", error: mensaje });
    return { estado: "error", mensaje };
  }
}

interface FacturaZoho {
  bill_id: string;
  vendor_id: string;
  bill_number: string;
  date: string;
  due_date: string;
  balance: number;
  location_name?: string;
  notes?: string;
}

export async function facturasAbiertas(zoho: ZohoPagos, vendorIds: string[]): Promise<Factura[]> {
  const vistas = new Map<string, Factura>();
  for (const vendor_id of [...new Set(vendorIds)]) {
    for (const status of ["open", "overdue", "partially_paid"]) {
      const bills = await zoho.listAll<FacturaZoho>("/bills", "bills", { vendor_id, status });
      for (const b of bills) {
        if (!(b.balance > 0)) continue;
        vistas.set(b.bill_id, {
          billId: b.bill_id, vendorId: b.vendor_id, numero: b.bill_number, fecha: b.date, vencimiento: b.due_date,
          saldo: b.balance, ubicacion: b.location_name ?? "", notas: b.notes ?? "",
        });
      }
    }
  }
  return [...vistas.values()];
}

export async function listarProveedores(zoho: ZohoPagos): Promise<{ id: string; nombre: string }[]> {
  const c = await zoho.listAll<{ contact_id: string; contact_name: string }>(
    "/contacts", "contacts", { contact_type: "vendor", filter_by: "Status.Active" },
  );
  return c.map((x) => ({ id: x.contact_id, nombre: x.contact_name })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/sucPagos_test.ts`
Expected: PASS (10 pruebas).

- [ ] **Step 5: Escribir `supabase/functions/_shared/sucPagosRepo.ts`**

```ts
// RepoPagos sobre Supabase con service role (solo la Edge Function escribe el resultado de Zoho; spec §6).
import type { SupabaseClient } from "./db.ts";
import type { RepoPagos } from "./sucPagos.ts";

export function repoSupabase(db: SupabaseClient): RepoPagos {
  return {
    async transferencia(id) {
      const { data, error } = await db.from("suc_pago_transferencia")
        .select("id,llave,clabe,concepto,monto,fecha_operacion,archivo_pdf,proveedor_zoho_id,proveedor_nombre,estado,zoho_vendorpayment_id,adjunto_ok")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? { ...data, monto: Number(data.monto) } : null;
    },
    async asignaciones(id) {
      const { data, error } = await db.from("suc_pago_asignacion")
        .select("bill_id,bill_numero,monto").eq("transferencia_id", id).order("fecha", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, monto: Number(a.monto) }));
    },
    async marcar(id, desde, cambios) {
      const { data, error } = await db.from("suc_pago_transferencia")
        .update({ ...cambios, actualizado_en: new Date().toISOString() })
        .eq("id", id).in("estado", desde).select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async recibo(ruta) {
      const { data, error } = await db.storage.from("suc-pagos-recibos").download(ruta);
      if (error || !data) throw new Error("no encontré el recibo PDF");
      return new Uint8Array(await data.arrayBuffer());
    },
    async cuenta() {
      const { data, error } = await db.from("suc_pago_config").select("cuenta_zoho_id,cuenta_nombre").eq("id", 1).single();
      if (error) throw error;
      return { id: data.cuenta_zoho_id, nombre: data.cuenta_nombre };
    },
    async guardarCuenta(id) {
      const { error } = await db.from("suc_pago_config").update({ cuenta_zoho_id: id }).eq("id", 1);
      if (error) throw error;
    },
    async guardarEquivalencia(clabe, proveedorId, nombre) {
      const { error } = await db.from("suc_proveedor_clabe")
        .upsert({ clabe, proveedor_zoho_id: proveedorId, proveedor_nombre: nombre });
      if (error) throw error;
    },
  };
}
```

- [ ] **Step 6: Escribir `supabase/functions/zoho-suc-pagos/index.ts`**

```ts
// Pagos de Sucursales propias (spec §5): exige el secreto del portal Y el JWT del usuario (x-usuario-jwt).
import { createClient } from "jsr:@supabase/supabase-js@2";
import { autorizado } from "../_shared/acceso.ts";
import { admin } from "../_shared/db.ts";
import { zohoSucDesdeEnv } from "../_shared/zohoSuc.ts";
import { aplicar, facturasAbiertas, listarProveedores } from "../_shared/sucPagos.ts";
import { repoSupabase } from "../_shared/sucPagosRepo.ts";

const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { "Content-Type": "application/json" } });

/** Usuario y nivel de 'sucursales_pagos' según la base (suc_pagos_nivel ya exige rol Holding y perfil activo). */
async function usuarioPagos(jwt: string): Promise<{ id: string; nivel: string | null } | null> {
  if (!jwt) return null;
  const db = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
  const { data: u, error } = await db.auth.getUser(jwt);
  if (error || !u.user) return null;
  const { data: nivel, error: e2 } = await db.rpc("suc_pagos_nivel");
  if (e2) return null;
  return { id: u.user.id, nivel: (nivel as string | null) ?? null };
}

Deno.serve(async (req) => {
  if (!autorizado(req)) return json({ ok: false, error: "No autorizado" }, 401);
  const u = await usuarioPagos(req.headers.get("x-usuario-jwt") ?? "");
  if (!u?.nivel) return json({ ok: false, error: "No tienes acceso a Pagos de Sucursales propias." }, 403);
  const body = await req.json().catch(() => ({}));
  try {
    const zoho = zohoSucDesdeEnv();
    if (body.accion === "proveedores") return json({ ok: true, proveedores: await listarProveedores(zoho) });
    if (body.accion === "facturas") {
      const ids = body.vendorIds;
      if (!Array.isArray(ids) || ids.length > 100 || !ids.every((x: unknown) => typeof x === "string" && x)) {
        return json({ ok: false, error: "vendorIds: lista de 1 a 100 ids." }, 400);
      }
      return json({ ok: true, facturas: await facturasAbiertas(zoho, ids) });
    }
    if (body.accion === "aplicar") {
      if (u.nivel !== "edicion" && u.nivel !== "desarrollador") {
        return json({ ok: false, error: "Tu acceso a Pagos es de solo lectura." }, 403);
      }
      const id = Number(body.id);
      if (!Number.isInteger(id) || id <= 0) return json({ ok: false, error: "id inválido." }, 400);
      return json({ ok: true, ...(await aplicar(repoSupabase(admin()), zoho, id, u.id)) });
    }
    return json({ ok: false, error: "Acción desconocida." }, 400);
  } catch (e) {
    const m = e instanceof Error ? e.message : String(e);
    console.error("[zoho-suc-pagos]", body.accion, m);
    return json({
      ok: false,
      error: m.startsWith("Falta el secreto") ? "Zoho de Sucursales GDL no está configurado." : "Zoho no respondió. Intenta de nuevo.",
    }, 502);
  }
});
```

- [ ] **Step 7: Registrar la función en `supabase/config.toml`** (al final, junto a las demás)

```toml
# Pagos de Sucursales propias: el portal entra con x-com-secreto + x-usuario-jwt (spec §5), no con verify_jwt.
[functions.zoho-suc-pagos]
verify_jwt = false
```

- [ ] **Step 8: Correr todas las pruebas de funciones y el chequeo de tipos de Deno**

Run: `npm run test:funciones` y `deno check --config supabase/functions/deno.json supabase/functions/zoho-suc-pagos/index.ts`
Expected: PASS y sin errores de tipos.

- [ ] **Step 9: Commit**

```bash
git add supabase/functions/_shared/sucPagos.ts supabase/functions/_shared/sucPagosRepo.ts supabase/functions/_shared/sucPagos_test.ts supabase/functions/zoho-suc-pagos/index.ts supabase/config.toml
git commit -m "feat(sucursales-propias): Edge Function zoho-suc-pagos (facturas, proveedores, aplicar)"
```

---

### Task 6: Permisos y menú en el portal, invocación de la función y subida del ZIP

**Files:**
- Modify: `lib/portal/roles.ts`, `lib/portal/modulos.ts`, `lib/supabase/sesion.ts`, `lib/comercializadora/funciones.ts`, `components/portal/navegacion.tsx`, `components/portal/marco.tsx`, `app/(sucursales)/sucursales/layout.tsx`
- Create: `lib/sucursales-propias/funcion.ts`, `lib/sucursales-propias/corrida.ts`, `app/api/sucursales/propias/pagos/route.ts`
- Test: `tests/portal/sucursales-propias-permisos.test.ts`, `tests/portal/com-funciones.test.ts` (un caso nuevo)

**Interfaces:**
- Consumes: `leerZip`, `ErrorCorrida` (Task 2); `separarNuevas`, `proveedoresAConsultar`, `armarCorrida` (Task 3); contrato HTTP de Task 5; RPC de Task 1.
- Produces:
  - `ROLES_HOLDING`, `esHolding(rol: string): boolean` en `roles.ts`
  - `puedeVerPagos(accesos: Accesos, rol: string): boolean`, `puedeAplicarPagos(accesos: Accesos, rol: string): boolean` en `modulos.ts`; `Accesos` acepta `sucursales_pagos`
  - `accesoPagos()` → `{ ok: true; db: Db; perfil; nivel: NivelModulo; puedeAplicar: boolean } | DenegacionSucursales`; `sesionPagos(redirigir?: boolean)`; `accesoSucursales()` devuelve además `red: boolean` y `propias: boolean`
  - `gruposDe(seccion, visibles, franquicia?, opciones?: { red?: boolean; propias?: boolean })`; `Marco` y `Navegacion` aceptan `sucursales?: { red: boolean; propias: boolean }`
  - `invocarFuncion(..., deps.encabezados?: Record<string, string>)`; `FuncionCom` incluye `'zoho-suc-pagos'`
  - `invocarPagos(db: Db, accion: 'proveedores' | 'facturas' | 'aplicar', body?: object)` → mismo resultado que `invocarFuncion`
  - `prepararCorrida(db: Db, archivo: string, bytes: Uint8Array): Promise<{ corridaId: number; avisos: string[] }>`; `MAX_ZIP = 4 * 1024 * 1024`
  - Ruta `POST /api/sucursales/propias/pagos` (form-data `zip`) → `200 { corridaId, avisos }` | `4xx/5xx { error }`

- [ ] **Step 1: Escribir la prueba que falla**

`tests/portal/sucursales-propias-permisos.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
import { esHolding } from '../../lib/portal/roles';
import { modulosVisibles, puedeAplicarPagos, puedeVerPagos } from '../../lib/portal/modulos';
import { gruposDe } from '../../components/portal/navegacion';

describe('permisos de Pagos de Sucursales propias', () => {
  it('solo empleados Holding', () => {
    for (const r of ['compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno']) expect(esHolding(r)).toBe(true);
    for (const r of ['franquiciado', 'tienda', 'proveedor', 'otro']) expect(esHolding(r)).toBe(false);
  });

  it('ver con cualquier nivel; aplicar con edición o desarrollador; nunca fuera de Holding', () => {
    expect(puedeVerPagos({ sucursales_pagos: 'lectura' }, 'finanzas')).toBe(true);
    expect(puedeAplicarPagos({ sucursales_pagos: 'lectura' }, 'finanzas')).toBe(false);
    expect(puedeAplicarPagos({ sucursales_pagos: 'edicion' }, 'interno')).toBe(true);
    expect(puedeAplicarPagos({ sucursales_pagos: 'desarrollador' }, 'admin')).toBe(true);
    expect(puedeVerPagos({ sucursales_pagos: 'edicion' }, 'tienda')).toBe(false);
    expect(puedeAplicarPagos({ sucursales_pagos: 'edicion' }, 'franquiciado')).toBe(false);
    expect(puedeVerPagos({ sucursales: 'lectura' }, 'admin')).toBe(false);
  });

  it('el módulo Sucursales aparece con solo el acceso de pagos', () => {
    expect(modulosVisibles({ sucursales_pagos: 'lectura' }, 'finanzas')).toContain('sucursales');
    expect(modulosVisibles({ sucursales_pagos: 'lectura' }, 'tienda')).not.toContain('sucursales');
  });

  it('el menú separa Red y Sucursales propias', () => {
    const titulos = (o: { red?: boolean; propias?: boolean }) =>
      gruposDe('sucursales', ['sucursales'], undefined, o).map((g) => g.titulo);
    expect(titulos({ red: true, propias: false })).toEqual(['Módulos', 'Red']);
    expect(titulos({ red: true, propias: true })).toEqual(['Módulos', 'Red', 'Sucursales propias · Helper Holding']);
    expect(titulos({ red: false, propias: true })).toEqual(['Módulos', 'Sucursales propias · Helper Holding']);
    const propias = gruposDe('sucursales', ['sucursales'], undefined, { propias: true }).at(-1)!;
    expect(propias.enlaces.map((e) => e.href)).toEqual(['/sucursales/propias/pagos']);
  });
});
```

En `tests/portal/com-funciones.test.ts`, agrega dentro del `describe('invocarFuncion', …)`:

```ts
  it('agrega los encabezados extra (JWT del usuario) sin quitar el secreto', async () => {
    const f = vi.fn((_u: string, _i?: RequestInit) => resp(200, { ok: true }));
    await invocarFuncion('zoho-suc-pagos', { accion: 'proveedores' }, {
      fetch: f as unknown as typeof fetch, url: 'https://x/functions/v1', secreto: 's',
      encabezados: { 'x-usuario-jwt': 'jwt-1' },
    });
    const h = f.mock.calls[0][1]!.headers as Record<string, string>;
    expect(h['x-com-secreto']).toBe('s');
    expect(h['x-usuario-jwt']).toBe('jwt-1');
    expect(f.mock.calls[0][0]).toBe('https://x/functions/v1/zoho-suc-pagos');
  });
```

- [ ] **Step 2: Correr las pruebas y ver que fallan**

Run: `npx vitest run tests/portal/sucursales-propias-permisos.test.ts tests/portal/com-funciones.test.ts`
Expected: FAIL (`esHolding` no existe; `'zoho-suc-pagos'` no es un `FuncionCom`).

- [ ] **Step 3: Roles y módulos**

En `lib/portal/roles.ts`, al final:

```ts
/** Empleados de Helper Holding: los únicos que pueden tener Pagos de Sucursales propias (la RLS usa la misma lista). */
export const ROLES_HOLDING = ['compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno'] as const satisfies readonly Rol[];
export const esHolding = (rol: string): boolean => (ROLES_HOLDING as readonly string[]).includes(rol);
```

En `lib/portal/modulos.ts`:
- importa `esHolding` junto a `tieneCosteo`: `import { esHolding, tieneCosteo } from './roles';`
- en `Accesos`, agrega `'sucursales_pagos'` a la lista de llaves y documenta: `'sucursales_pagos': pagos a proveedores de las sucursales propias (solo empleados Holding).`
- en la entrada `sucursales`, cambia `acceso` a `(a, rol) => a.sucursales !== undefined || puedeVerPagos(a, rol),` y su comentario a: `// Ventas: además, cada sucursal requiere asignación (perfil_sucursales). Pagos de Sucursales propias también abre el módulo.`
- al final (`puedeVerPagos` va con `function` porque la entrada `sucursales` de `modulos`, definida antes, la usa):

```ts
export function puedeVerPagos(accesos: Accesos, rol: string): boolean {
  return accesos.sucursales_pagos !== undefined && esHolding(rol);
}
export const puedeAplicarPagos = (accesos: Accesos, rol: string) =>
  esHolding(rol) && (accesos.sucursales_pagos === 'edicion' || accesos.sucursales_pagos === 'desarrollador');
```

- [ ] **Step 4: Navegación**

En `components/portal/navegacion.tsx`:
- `type Grupo = { titulo: string; enlaces: Enlace[]; separado?: boolean };`
- en `gruposSucursales`, cambia `titulo: 'Sucursales'` por `titulo: 'Red'`.
- después de `gruposSucursales`:

```ts
/** Pagos y administración de las sucursales propias: solo empleados Holding con 'sucursales_pagos' (spec §3). */
const grupoPropias: Grupo = {
  titulo: 'Sucursales propias · Helper Holding',
  separado: true,
  enlaces: [{ href: '/sucursales/propias/pagos', nombre: 'Pagos', icono: Wallet }],
};
```

- `gruposDe` queda:

```ts
export function gruposDe(
  seccion: Seccion,
  visibles: IdModulo[],
  franquicia?: Franquicia,
  opciones: { red?: boolean; propias?: boolean } = {},
): Grupo[] {
  let propios = seccion === 'franquiciatarios' ? (franquicia ? gruposFranquicia(franquicia) : []) : gruposPorSeccion[seccion];
  if (seccion === 'sucursales')
    propios = [...(opciones.red === false ? [] : gruposSucursales), ...(opciones.propias ? [grupoPropias] : [])];
  if (visibles.every((m) => m === 'franquiciatarios') && seccion === 'franquiciatarios') return propios;
  const modulosGrupo: Grupo = {
    titulo: 'Módulos',
    enlaces: [{ href: '/', nombre: 'Inicio', icono: LayoutGrid, exacto: true }, ...visibles.map(entradaModulo)],
  };
  return [modulosGrupo, ...propios];
}
```

- `Navegacion` recibe `sucursales?: { red: boolean; propias: boolean }` y llama `gruposDe(seccion, visibles, franquicia, sucursales)`; el `<div key={g.titulo}>` de cada grupo pasa a `<div key={g.titulo} className={g.separado ? 'border-t border-line pt-4' : undefined}>`.

En `components/portal/marco.tsx`: agrega la prop `sucursales?: { red: boolean; propias: boolean }` (con comentario `/** Grupos de Sucursales que ve el usuario: Red (ventas) y Sucursales propias (pagos). */`), pásala a `<Navegacion … sucursales={sucursales} />` y a `gruposDe(seccion, visibles, franquicia, sucursales)` en la paleta de comandos.

- [ ] **Step 5: Sesión**

En `lib/supabase/sesion.ts`:
- importa `puedeAplicarPagos, puedeVerPagos` desde `'../portal/modulos'` y `type NivelModulo` desde `'./database.types'`.
- en `accesoSucursales`, el tipo de éxito agrega `red: boolean; propias: boolean`; el chequeo de módulo y el `return` quedan:

```ts
  const propias = puedeVerPagos(c.accesos, c.perfil.data.rol);
  if (!c.accesos.sucursales && !propias)
    return { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso a Sucursales.' };
  const companias = await companiasAsignadas(c.db, c.usuario.id);
  return { ok: true, db: c.db, perfil: c.perfil.data, companias, red: !!c.accesos.sucursales, propias };
```

- después de `sesionSucursales`:

```ts
/** Pagos de Sucursales propias (spec §3): empleado Holding con 'sucursales_pagos'. Sin redirigir, para route handlers. */
export async function accesoPagos(): Promise<
  | { ok: true; db: Db; perfil: { user_id: string; nombre: string; rol: string }; nivel: NivelModulo; puedeAplicar: boolean }
  | DenegacionSucursales
> {
  const c = await contexto();
  if (!c.usuario) return { ok: false, status: 401, destino: '/login', mensaje: 'La sesión venció.' };
  if (c.perfil.error || !c.perfil.data?.activo)
    return { ok: false, status: 403, destino: '/login?aviso=perfil', mensaje: 'Tu cuenta necesita un perfil activo.' };
  if (!puedeVerPagos(c.accesos, c.perfil.data.rol))
    return { ok: false, status: 403, destino: '/sucursales', mensaje: 'No tienes acceso a Pagos de Sucursales propias.' };
  return {
    ok: true,
    db: c.db,
    perfil: c.perfil.data,
    nivel: c.accesos.sucursales_pagos!,
    puedeAplicar: puedeAplicarPagos(c.accesos, c.perfil.data.rol),
  };
}

export async function sesionPagos(redirigir = true) {
  const a = await accesoPagos();
  if (!a.ok) {
    if (redirigir) redirect(a.destino);
    throw new Error(a.mensaje);
  }
  return a;
}
```

En `app/(sucursales)/sucursales/layout.tsx`: `const { db, perfil, companias, red, propias } = await sesionSucursales();` y pasa `sucursales={{ red, propias }}` a `<Marco>`.

- [ ] **Step 6: Invocación de la función**

En `lib/comercializadora/funciones.ts`:
- `export type FuncionCom = 'com-minmax' | 'zoho-generar-oc' | 'zoho-sync' | 'zoho-proveedor-minimo' | 'zoho-suc-pagos';`
- `deps` agrega `encabezados?: Record<string, string>`; los headers quedan `{ 'Content-Type': 'application/json', 'x-com-secreto': secreto, ...deps.encabezados }`. Pon `'x-com-secreto'` **después** del spread para que un encabezado extra nunca lo reemplace:
  `headers: { 'Content-Type': 'application/json', ...deps.encabezados, 'x-com-secreto': secreto },`

Create `lib/sucursales-propias/funcion.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { invocarFuncion } from '@/lib/comercializadora/funciones';

export type AccionPagos = 'proveedores' | 'facturas' | 'aplicar';

/** Llama zoho-suc-pagos con el secreto del portal y el JWT del usuario (la función vuelve a revisar su acceso). */
export async function invocarPagos(db: SupabaseClient, accion: AccionPagos, body: object = {}) {
  const { data } = await db.auth.getSession();
  const jwt = data.session?.access_token;
  if (!jwt) return { ok: false as const, error: 'La sesión venció. Vuelve a entrar.' };
  return invocarFuncion('zoho-suc-pagos', { accion, ...body }, { encabezados: { 'x-usuario-jwt': jwt }, timeoutMs: 120_000 });
}
```

- [ ] **Step 7: Registrar una corrida**

Create `lib/sucursales-propias/corrida.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCorrida, leerZip } from './zip';
import { unir } from './recibos';
import type { Factura, Proveedor } from './empate';
import { armarCorrida, proveedoresAConsultar, separarNuevas, type Previa } from './planear';
import { invocarPagos } from './funcion';

export const MAX_ZIP = 4 * 1024 * 1024;
export { ErrorCorrida };

/** Lee el ZIP, empata con Zoho, registra la corrida (una transacción) y sube los recibos (spec §4 paso 1). */
export async function prepararCorrida(
  db: SupabaseClient,
  archivo: string,
  bytes: Uint8Array,
): Promise<{ corridaId: number; avisos: string[] }> {
  const zip = await leerZip(bytes);
  const unidas = unir(zip.resumen, zip.recibos);
  const { data: previas, error: e1 } = await db
    .from('suc_pago_transferencia')
    .select('llave, corrida_id, estado')
    .in('llave', unidas.transferencias.map((t) => t.llave));
  if (e1) throw e1;
  const { nuevas, avisos: repetidas } = separarNuevas(unidas.transferencias, (previas ?? []) as Previa[]);
  if (!nuevas.length) throw new ErrorCorrida(`Todas las transferencias de este ZIP ya estaban registradas. ${repetidas[0] ?? ''}`.trim());

  const prov = await invocarPagos(db, 'proveedores');
  if (!prov.ok) throw new ErrorCorrida(prov.error);
  const proveedores = (prov.datos as { proveedores: Proveedor[] }).proveedores;
  const { data: eq, error: e2 } = await db.from('suc_proveedor_clabe').select('clabe, proveedor_zoho_id, proveedor_nombre');
  if (e2) throw e2;
  const equivalencias = new Map((eq ?? []).map((e) => [e.clabe as string, { id: e.proveedor_zoho_id as string, nombre: e.proveedor_nombre as string }]));
  const ids = proveedoresAConsultar(nuevas, equivalencias, proveedores);
  let facturas: Factura[] = [];
  if (ids.length) {
    const f = await invocarPagos(db, 'facturas', { vendorIds: ids });
    if (!f.ok) throw new ErrorCorrida(f.error);
    facturas = (f.datos as { facturas: Factura[] }).facturas;
  }

  const avisos = [...zip.avisos, ...unidas.avisos, ...repetidas];
  const payload = armarCorrida({ archivo, resumen: zip.resumen, todas: unidas.transferencias, nuevas, avisos, equivalencias, proveedores, facturas });
  const { data, error } = await db.rpc('suc_pagos_registrar_corrida', { p: payload });
  if (error) throw error;
  const { corrida_id, rutas } = data as { corrida_id: number; rutas: { llave: string; ruta: string }[] };

  const pdfs = new Map(zip.recibos.map((r) => [r.archivo, r.pdf]));
  const fallidos: string[] = [];
  for (const { llave, ruta } of rutas) {
    const t = nuevas.find((x) => x.llave === llave)!;
    const { error: eu } = await db.storage
      .from('suc-pagos-recibos')
      .upload(ruta, pdfs.get(t.archivo)!, { contentType: 'application/pdf', upsert: false });
    if (eu) fallidos.push(`No se pudo guardar el recibo de ${t.alias}; al aplicar quedará sin adjunto.`);
  }
  if (fallidos.length) {
    await db.from('suc_pago_corrida').update({ avisos: [...avisos, ...fallidos] }).eq('id', corrida_id);
  }
  return { corridaId: corrida_id, avisos: [...avisos, ...fallidos] };
}
```

Create `app/api/sucursales/propias/pagos/route.ts`:

```ts
import { accesoPagos } from '@/lib/supabase/sesion';
import { ErrorCorrida, MAX_ZIP, prepararCorrida } from '@/lib/sucursales-propias/corrida';

export const runtime = 'nodejs';
// Lee hasta ~20 PDF y consulta Zoho (proveedores + facturas de ~16 proveedores): unos segundos, con margen.
export const maxDuration = 120;

/** Sube el ZIP de recibos de una corrida (spec §4 paso 1). Por route handler: las server actions aceptan 1 MB. */
export async function POST(req: Request) {
  const a = await accesoPagos();
  if (!a.ok) return Response.json({ error: a.mensaje }, { status: a.status });
  if (!a.puedeAplicar) return Response.json({ error: 'Tu acceso a Pagos es de solo lectura.' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const zip = form?.get('zip');
  if (!(zip instanceof File)) return Response.json({ error: 'Sube el ZIP de recibos.' }, { status: 400 });
  if (zip.size > MAX_ZIP) return Response.json({ error: 'El ZIP pesa más de 4 MB.' }, { status: 413 });
  try {
    return Response.json(await prepararCorrida(a.db, zip.name, new Uint8Array(await zip.arrayBuffer())));
  } catch (e) {
    if (e instanceof ErrorCorrida) return Response.json({ error: e.message }, { status: 422 });
    console.error('[sucursales-propias] subir corrida', e instanceof Error ? e.message : e);
    return Response.json({ error: 'No se pudo registrar la corrida. Intenta de nuevo.' }, { status: 500 });
  }
}
```

- [ ] **Step 8: Prueba de la ruta (permisos y validación)**

Agrega a `tests/portal/sucursales-propias-permisos.test.ts`:

```ts
const acceso = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/sesion', () => ({ accesoPagos: async () => acceso.valor }));
const preparar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sucursales-propias/corrida', async () => {
  const zip = await import('../../lib/sucursales-propias/zip');
  return { ErrorCorrida: zip.ErrorCorrida, MAX_ZIP: 10, prepararCorrida: preparar };
});
import { POST } from '../../app/api/sucursales/propias/pagos/route';

const pedir = (archivo?: File) => {
  const fd = new FormData();
  if (archivo) fd.append('zip', archivo);
  return POST(new Request('http://x/api/sucursales/propias/pagos', { method: 'POST', body: fd }));
};

describe('POST /api/sucursales/propias/pagos', () => {
  it('niega sin acceso y con solo lectura, sin tocar la corrida', async () => {
    acceso.valor = { ok: false, status: 403, destino: '/', mensaje: 'No tienes acceso a Pagos de Sucursales propias.' };
    expect((await pedir(new File(['x'], 'a.zip'))).status).toBe(403);
    acceso.valor = { ok: true, db: {}, perfil: {}, nivel: 'lectura', puedeAplicar: false };
    const r = await pedir(new File(['x'], 'a.zip'));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Tu acceso a Pagos es de solo lectura.' });
    expect(preparar).not.toHaveBeenCalled();
  });

  it('valida archivo y tamaño; un ErrorCorrida sale como 422 con su mensaje', async () => {
    acceso.valor = { ok: true, db: {}, perfil: {}, nivel: 'edicion', puedeAplicar: true };
    expect((await pedir()).status).toBe(400);
    expect((await pedir(new File(['01234567890'], 'grande.zip'))).status).toBe(413);
    const { ErrorCorrida } = await import('../../lib/sucursales-propias/zip');
    preparar.mockRejectedValueOnce(new ErrorCorrida('El archivo no es un ZIP válido.'));
    const r = await pedir(new File(['x'], 'a.zip'));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'El archivo no es un ZIP válido.' });
    preparar.mockResolvedValueOnce({ corridaId: 7, avisos: [] });
    expect(await (await pedir(new File(['x'], 'a.zip'))).json()).toEqual({ corridaId: 7, avisos: [] });
  });
});
```

(Los `vi.mock` se elevan al inicio del archivo; deja estos bloques al final para que se lea en orden.)

- [ ] **Step 9: Correr las pruebas y el chequeo de tipos**

Run: `npx vitest run tests/portal/sucursales-propias-permisos.test.ts tests/portal/com-funciones.test.ts tests/portal/sucursales-rutas.test.ts` y `npm run typecheck`
Expected: PASS y sin errores. Si `sucursales-rutas.test.ts` espera el título `'Sucursales'` del menú, actualízalo a `'Red'`.

- [ ] **Step 10: Commit**

```bash
git add lib/portal/roles.ts lib/portal/modulos.ts lib/supabase/sesion.ts lib/comercializadora/funciones.ts components/portal/navegacion.tsx components/portal/marco.tsx "app/(sucursales)/sucursales/layout.tsx" lib/sucursales-propias/funcion.ts lib/sucursales-propias/corrida.ts app/api/sucursales/propias/pagos/route.ts tests/portal/sucursales-propias-permisos.test.ts tests/portal/com-funciones.test.ts
git commit -m "feat(sucursales-propias): acceso sucursales_pagos, menú Sucursales propias y subida del ZIP"
```

---

### Task 7: Acciones de revisión y aplicación

**Files:**
- Create: `app/(sucursales)/sucursales/propias/pagos/acciones.ts`
- Create: `lib/sucursales-propias/estados.ts`
- Test: `tests/portal/sucursales-propias-acciones.test.ts`

**Interfaces:**
- Consumes: `accesoPagos` (Task 6), `invocarPagos` (Task 6), `conProveedor`, `validarAsignaciones`, `aAsignacion`, `Factura`, `Proveedor` (Task 3), `aFila` (Task 3), RPC `suc_pagos_reemplazar_asignaciones` (Task 1).
- Produces:
  - `type Resultado<T = object> = { error: string } | ({ ok: true } & T)`
  - `aplicarTransferencia(id: number): Promise<Resultado<{ estado: string; mensaje?: string }>>`
  - `asignarProveedor(id: number, proveedor: Proveedor): Promise<Resultado>`
  - `guardarAsignaciones(id: number, asignaciones: { billId: string; monto: number }[]): Promise<Resultado>`
  - `leerProveedores(): Promise<Resultado<{ proveedores: Proveedor[] }>>`
  - `leerFacturasProveedor(id: number): Promise<Resultado<{ facturas: Factura[] }>>`
  - `estados.ts`: `type EstadoTransferencia`, `ESTADOS: Record<EstadoTransferencia, { texto: string; tono: 'ok' | 'warn' | 'bad' | 'muted' }>`, `PREVIOS: readonly EstadoTransferencia[]`, `APLICADAS: readonly EstadoTransferencia[]`, `contar(estados: string[]): { total: number; aplicadas: number; listas: number; revisar: number }`

- [ ] **Step 1: Escribir `lib/sucursales-propias/estados.ts` y su prueba, y la prueba de las acciones (fallan)**

`tests/portal/sucursales-propias-acciones.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));

const estado = vi.hoisted(() => ({
  acceso: { ok: true, puedeAplicar: true } as Record<string, unknown>,
  fila: { id: 5, clabe: '030320900000001111', monto: 400, estado: 'desconocido', proveedor_zoho_id: null, proveedor_nombre: null, sugerido: false } as Record<string, unknown>,
  rpc: [] as { fn: string; args: Record<string, unknown> }[],
  upserts: [] as unknown[],
  invocar: vi.fn(),
}));

const db = {
  from: (tabla: string) => ({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: tabla === 'suc_pago_transferencia' ? estado.fila : null, error: null }) }) }),
    upsert: async (v: unknown) => { estado.upserts.push(v); return { error: null }; },
  }),
  rpc: async (fn: string, args: Record<string, unknown>) => { estado.rpc.push({ fn, args }); return { error: null }; },
};
vi.mock('@/lib/supabase/sesion', () => ({ accesoPagos: async () => ({ ...estado.acceso, db }) }));
vi.mock('@/lib/sucursales-propias/funcion', () => ({ invocarPagos: (...a: unknown[]) => estado.invocar(...a) }));

import { aplicarTransferencia, asignarProveedor, guardarAsignaciones } from '../../app/(sucursales)/sucursales/propias/pagos/acciones';
import { contar } from '../../lib/sucursales-propias/estados';

const FACTURAS = [
  { billId: 'b1', vendorId: 'v-mp', numero: 'A1', fecha: '2026-11-06', vencimiento: '', saldo: 300, ubicacion: 'DARIO', notas: '' },
  { billId: 'b2', vendorId: 'v-mp', numero: 'A2', fecha: '2026-11-08', vencimiento: '', saldo: 500, ubicacion: 'NAMORA', notas: '' },
];

beforeEach(() => {
  estado.acceso = { ok: true, puedeAplicar: true };
  estado.rpc = [];
  estado.upserts = [];
  estado.invocar.mockReset();
  estado.fila = { ...estado.fila, estado: 'desconocido', proveedor_zoho_id: null };
});

describe('acciones de Pagos', () => {
  it('solo lectura no aplica ni cambia nada', async () => {
    estado.acceso = { ok: true, puedeAplicar: false };
    expect(await aplicarTransferencia(5)).toEqual({ error: 'Tu acceso a Pagos es de solo lectura.' });
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' })).toEqual({ error: 'Tu acceso a Pagos es de solo lectura.' });
    expect(estado.invocar).not.toHaveBeenCalled();
  });

  it('aplicar pasa el id a la función y devuelve su estado', async () => {
    estado.invocar.mockResolvedValue({ ok: true, datos: { ok: true, estado: 'aplicada', pagoId: 'p1' } });
    expect(await aplicarTransferencia(5)).toEqual({ ok: true, estado: 'aplicada', mensaje: undefined });
    expect(estado.invocar).toHaveBeenCalledWith(db, 'aplicar', { id: 5 });
  });

  it('asignar proveedor guarda la equivalencia y recalcula con sus facturas', async () => {
    estado.invocar.mockResolvedValue({ ok: true, datos: { facturas: FACTURAS } });
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' })).toEqual({ ok: true });
    expect(estado.upserts).toEqual([{ clabe: '030320900000001111', proveedor_zoho_id: 'v-mp', proveedor_nombre: 'MATERIAS PRIMAS EL REFUGIO' }]);
    expect(estado.rpc[0].fn).toBe('suc_pagos_reemplazar_asignaciones');
    expect(estado.rpc[0].args).toMatchObject({ p_id: 5, p_estado: 'no_cuadra', p_proveedor_id: 'v-mp' });
    expect((estado.rpc[0].args.p_asig as { bill_id: string; monto: number }[]).map((a) => [a.bill_id, a.monto])).toEqual([['b1', 300], ['b2', 100]]);
  });

  it('una transferencia ya aplicada no se puede cambiar', async () => {
    estado.fila = { ...estado.fila, estado: 'aplicada' };
    expect(await asignarProveedor(5, { id: 'v-mp', nombre: 'MP' })).toEqual({ error: 'Esta transferencia ya se aplicó.' });
  });

  it('guardar asignaciones valida contra las facturas vivas y marca cuadra', async () => {
    estado.fila = { ...estado.fila, estado: 'no_cuadra', proveedor_zoho_id: 'v-mp', proveedor_nombre: 'MP' };
    estado.invocar.mockResolvedValue({ ok: true, datos: { facturas: FACTURAS } });
    expect(await guardarAsignaciones(5, [{ billId: 'b1', monto: 300 }])).toEqual({
      error: 'Lo asignado ($300.00) no es igual a la transferencia ($400.00).',
    });
    expect(await guardarAsignaciones(5, [{ billId: 'b1', monto: 200 }, { billId: 'b2', monto: 200 }])).toEqual({ ok: true });
    expect(estado.rpc.at(-1)!.args).toMatchObject({ p_estado: 'cuadra' });
  });
});

describe('contar', () => {
  it('cuenta aplicadas, listas y por revisar', () => {
    expect(contar(['cuadra', 'cuadra', 'aplicada', 'ya_aplicada', 'aplicada_sin_adjunto', 'no_cuadra', 'error', 'sin_facturas'])).toEqual({
      total: 8, aplicadas: 3, listas: 2, revisar: 3,
    });
  });
});
```

Run: `npx vitest run tests/portal/sucursales-propias-acciones.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Escribir `lib/sucursales-propias/estados.ts`**

```ts
// Estados de una transferencia (spec §6) y cómo se muestran.
export type EstadoTransferencia =
  | 'cuadra' | 'no_cuadra' | 'desconocido' | 'sin_facturas' | 'aplicando'
  | 'aplicada' | 'aplicada_sin_adjunto' | 'error' | 'ya_aplicada';

export const ESTADOS: Record<EstadoTransferencia, { texto: string; tono: 'ok' | 'warn' | 'bad' | 'muted' }> = {
  cuadra: { texto: 'Cuadra', tono: 'ok' },
  no_cuadra: { texto: 'No cuadra', tono: 'warn' },
  desconocido: { texto: 'Proveedor desconocido', tono: 'warn' },
  sin_facturas: { texto: 'Sin facturas abiertas', tono: 'muted' },
  aplicando: { texto: 'Aplicando…', tono: 'muted' },
  aplicada: { texto: 'Aplicada', tono: 'ok' },
  aplicada_sin_adjunto: { texto: 'Aplicada · falta el recibo', tono: 'warn' },
  error: { texto: 'Error', tono: 'bad' },
  ya_aplicada: { texto: 'Ya estaba en Zoho', tono: 'ok' },
};

export const PREVIOS = ['cuadra', 'no_cuadra', 'desconocido', 'sin_facturas'] as const satisfies readonly EstadoTransferencia[];
export const APLICADAS = ['aplicada', 'aplicada_sin_adjunto', 'ya_aplicada'] as const satisfies readonly EstadoTransferencia[];

export function contar(estados: string[]) {
  const en = (lista: readonly string[]) => estados.filter((e) => lista.includes(e)).length;
  return {
    total: estados.length,
    aplicadas: en(APLICADAS),
    listas: en(['cuadra']),
    revisar: en(['no_cuadra', 'desconocido', 'error']),
  };
}
```

- [ ] **Step 3: Escribir `app/(sucursales)/sucursales/propias/pagos/acciones.ts`**

```ts
'use server';
import { revalidatePath } from 'next/cache';
import { accesoPagos } from '@/lib/supabase/sesion';
import { invocarPagos } from '@/lib/sucursales-propias/funcion';
import { aAsignacion, conProveedor, validarAsignaciones, type Factura, type Proveedor } from '@/lib/sucursales-propias/empate';
import { aFila } from '@/lib/sucursales-propias/planear';
import { PREVIOS } from '@/lib/sucursales-propias/estados';

export type Resultado<T = object> = { error: string } | ({ ok: true } & T);

const SOLO_LECTURA = 'Tu acceso a Pagos es de solo lectura.';
const RUTA = '/sucursales/propias/pagos';

async function editor() {
  const a = await accesoPagos();
  return a.ok && a.puedeAplicar ? a : null;
}

const fallo = (e: unknown): { error: string } => {
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return { error: SOLO_LECTURA };
  const m = (e as { message?: string } | null)?.message ?? '';
  if (m.includes('ya no se puede cambiar')) return { error: 'Esta transferencia ya se aplicó.' };
  return { error: 'No se pudo guardar. Intenta de nuevo.' };
};

type Db = NonNullable<Awaited<ReturnType<typeof editor>>>['db'];

async function transferencia(db: Db, id: number) {
  const { data, error } = await db
    .from('suc_pago_transferencia')
    .select('id, clabe, monto, estado, proveedor_zoho_id, proveedor_nombre, sugerido')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, monto: Number(data.monto) } as {
    id: number; clabe: string | null; monto: number; estado: string;
    proveedor_zoho_id: string | null; proveedor_nombre: string | null; sugerido: boolean;
  };
}

async function facturasDe(db: Db, vendorId: string): Promise<{ facturas: Factura[] } | { error: string }> {
  const f = await invocarPagos(db, 'facturas', { vendorIds: [vendorId] });
  return f.ok ? { facturas: (f.datos as { facturas: Factura[] }).facturas } : { error: f.error };
}

export async function aplicarTransferencia(id: number): Promise<Resultado<{ estado: string; mensaje?: string }>> {
  const a = await editor();
  if (!a) return { error: SOLO_LECTURA };
  const r = await invocarPagos(a.db, 'aplicar', { id });
  if (!r.ok) return { error: r.error };
  const d = r.datos as { estado: string; mensaje?: string };
  revalidatePath(RUTA, 'layout');
  return { ok: true, estado: d.estado, mensaje: d.mensaje };
}

export async function leerProveedores(): Promise<Resultado<{ proveedores: Proveedor[] }>> {
  const a = await editor();
  if (!a) return { error: SOLO_LECTURA };
  const r = await invocarPagos(a.db, 'proveedores');
  return r.ok ? { ok: true, proveedores: (r.datos as { proveedores: Proveedor[] }).proveedores } : { error: r.error };
}

export async function leerFacturasProveedor(id: number): Promise<Resultado<{ facturas: Factura[] }>> {
  const a = await editor();
  if (!a) return { error: SOLO_LECTURA };
  const t = await transferencia(a.db, id);
  if (!t?.proveedor_zoho_id) return { error: 'Primero elige el proveedor.' };
  const f = await facturasDe(a.db, t.proveedor_zoho_id);
  return 'error' in f ? f : { ok: true, facturas: f.facturas };
}

export async function asignarProveedor(id: number, proveedor: Proveedor): Promise<Resultado> {
  try {
    const a = await editor();
    if (!a) return { error: SOLO_LECTURA };
    const t = await transferencia(a.db, id);
    if (!t) return { error: 'No encontré la transferencia.' };
    if (!(PREVIOS as readonly string[]).includes(t.estado)) return { error: 'Esta transferencia ya se aplicó.' };
    const f = await facturasDe(a.db, proveedor.id);
    if ('error' in f) return f;
    const e = conProveedor(t.monto, proveedor, false, f.facturas);
    if (t.clabe) {
      const { error } = await a.db
        .from('suc_proveedor_clabe')
        .upsert({ clabe: t.clabe, proveedor_zoho_id: proveedor.id, proveedor_nombre: proveedor.nombre });
      if (error) return fallo(error);
    }
    const { error } = await a.db.rpc('suc_pagos_reemplazar_asignaciones', {
      p_id: id, p_estado: e.estado, p_proveedor_id: proveedor.id, p_proveedor_nombre: proveedor.nombre,
      p_sugerido: false, p_asig: e.asignaciones.map(aFila),
    });
    if (error) return fallo(error);
    revalidatePath(RUTA, 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarAsignaciones(id: number, asignaciones: { billId: string; monto: number }[]): Promise<Resultado> {
  try {
    const a = await editor();
    if (!a) return { error: SOLO_LECTURA };
    const t = await transferencia(a.db, id);
    if (!t?.proveedor_zoho_id || !t.proveedor_nombre) return { error: 'Primero elige el proveedor.' };
    if (!(PREVIOS as readonly string[]).includes(t.estado)) return { error: 'Esta transferencia ya se aplicó.' };
    const f = await facturasDe(a.db, t.proveedor_zoho_id);
    if ('error' in f) return f;
    const motivo = validarAsignaciones(t.monto, asignaciones, f.facturas);
    if (motivo) return { error: motivo };
    const filas = asignaciones.map((x) => aFila(aAsignacion(f.facturas.find((b) => b.billId === x.billId)!, x.monto)));
    const { error } = await a.db.rpc('suc_pagos_reemplazar_asignaciones', {
      p_id: id, p_estado: 'cuadra', p_proveedor_id: t.proveedor_zoho_id, p_proveedor_nombre: t.proveedor_nombre,
      p_sugerido: t.sugerido, p_asig: filas,
    });
    if (error) return fallo(error);
    revalidatePath(RUTA, 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
```

- [ ] **Step 4: Correr la prueba y ver que pasa**

Run: `npx vitest run tests/portal/sucursales-propias-acciones.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add "app/(sucursales)/sucursales/propias/pagos/acciones.ts" lib/sucursales-propias/estados.ts tests/portal/sucursales-propias-acciones.test.ts
git commit -m "feat(sucursales-propias): acciones para elegir proveedor, repartir y aplicar"
```

---

### Task 8: Pantallas — lista de corridas y revisión de una corrida

**Files:**
- Create: `lib/sucursales-propias/consultas.ts`
- Create: `app/(sucursales)/sucursales/propias/pagos/page.tsx`
- Create: `app/(sucursales)/sucursales/propias/pagos/[corridaId]/page.tsx`
- Create: `components/sucursales-propias/pagos/subir-zip.tsx`, `corrida.tsx`, `elegir-proveedor.tsx`, `editar-asignacion.tsx`, `tipos.ts`
- Test: `tests/portal/sucursales-propias-pantalla.test.tsx`

**Interfaces:**
- Consumes: `sesionPagos` (Task 6); acciones de Task 7; `ESTADOS`, `contar` (Task 7); `pesos` de `lib/comercializadora/formato`.
- Produces:
  - `consultas.ts`: `listarCorridas(db): Promise<CorridaLista[]>`, `leerCorrida(db, id): Promise<{ corrida: CorridaFila; filas: FilaVista[] } | null>`
  - `tipos.ts`: `interface FilaVista { id: number; llave: string; tipo: string; alias: string; concepto: string; monto: number; fecha: string; estado: EstadoTransferencia; error: string | null; proveedorId: string | null; proveedorNombre: string | null; sugerido: boolean; pagoId: string | null; reciboUrl: string | null; aplicadoEn: string | null; asignaciones: { billId: string; numero: string; ubicacion: string; fecha: string | null; saldo: number; monto: number }[] }`, `interface AccionesPagos { aplicar; asignarProveedor; guardarAsignaciones; leerProveedores; leerFacturasProveedor }` (las firmas de Task 7)

Antes de escribir componentes, lee en `node_modules/next/dist/docs/` la guía de páginas dinámicas (`params` es una `Promise` en esta versión) y la de `useRouter().refresh()`.

- [ ] **Step 1: Escribir la prueba que falla**

`tests/portal/sucursales-propias-pantalla.test.tsx`:

```tsx
import { describe, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
const refresh = vi.fn();
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
import { Corrida } from '../../components/sucursales-propias/pagos/corrida';
import type { AccionesPagos, FilaVista } from '../../components/sucursales-propias/pagos/tipos';

const fila = (o: Partial<FilaVista>): FilaVista => ({
  id: 1, llave: 'L1', tipo: 'SPEI', alias: 'OH LALA', concepto: 'PAGO', monto: 100, fecha: '2026-11-20',
  estado: 'cuadra', error: null, proveedorId: 'v1', proveedorNombre: 'OH LALA (PRODUCTORA)', sugerido: true,
  pagoId: null, reciboUrl: null, aplicadoEn: null,
  asignaciones: [{ billId: 'b1', numero: '106882', ubicacion: 'CIUDAD GRANJA', fecha: '2026-11-06', saldo: 100, monto: 100 }],
  ...o,
});

const acciones = (aplicar = vi.fn(async () => ({ ok: true as const, estado: 'aplicada' }))): AccionesPagos => ({
  aplicar,
  asignarProveedor: vi.fn(),
  guardarAsignaciones: vi.fn(),
  leerProveedores: vi.fn(),
  leerFacturasProveedor: vi.fn(),
});

describe('Corrida', () => {
  it('solo lectura no ve el botón de aplicar', () => {
    render(<Corrida filas={[fila({})]} puedeAplicar={false} acciones={acciones()} zohoOrg="1" />);
    expect(screen.queryByRole('button', { name: /Aplicar/ })).toBeNull();
    expect(screen.getByText('Cuadra')).toBeInTheDocument();
  });

  it('pide confirmación con número y total, y aplica una por una en orden', async () => {
    const aplicar = vi.fn(async (id: number) =>
      id === 2 ? { error: 'Zoho no respondió.' } : { ok: true as const, estado: 'aplicada' },
    );
    render(
      <Corrida
        filas={[fila({ id: 1, monto: 100 }), fila({ id: 2, alias: 'PINKBOOK', monto: 552.21 }), fila({ id: 3, estado: 'desconocido', proveedorId: null })]}
        puedeAplicar
        acciones={acciones(aplicar)}
        zohoOrg="1"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Aplicar 2 pagos' }));
    expect(screen.getByText(/2 pagos por \$652\.21/)).toBeInTheDocument();
    expect(aplicar).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar y aplicar en Zoho' }));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(aplicar.mock.calls.map((c) => c[0])).toEqual([1, 2]);
    expect(screen.getByText('Zoho no respondió.')).toBeInTheDocument();
  });

  it('una fila con error o sin recibo ofrece reintentar', () => {
    render(
      <Corrida
        filas={[fila({ id: 4, estado: 'aplicada_sin_adjunto', pagoId: 'p1', error: 'falló el adjunto' }), fila({ id: 5, estado: 'error', error: 'Zoho: inactivo' })]}
        puedeAplicar
        acciones={acciones()}
        zohoOrg="1"
      />,
    );
    expect(screen.getAllByRole('button', { name: 'Reintentar' })).toHaveLength(2);
    expect(screen.getByRole('link', { name: 'Ver en Zoho' })).toHaveAttribute('href', 'https://books.zoho.com/app/1#/paymentsmade/p1');
  });
});
```

Run: `npx vitest run tests/portal/sucursales-propias-pantalla.test.tsx`
Expected: FAIL (componente inexistente).

- [ ] **Step 2: Tipos y consultas**

`components/sucursales-propias/pagos/tipos.ts`:

```ts
import type { EstadoTransferencia } from '@/lib/sucursales-propias/estados';
import type { Factura, Proveedor } from '@/lib/sucursales-propias/empate';

type R<T = object> = { error: string } | ({ ok: true } & T);

export interface FilaVista {
  id: number;
  llave: string;
  tipo: string;
  alias: string;
  concepto: string;
  monto: number;
  fecha: string;
  estado: EstadoTransferencia;
  error: string | null;
  proveedorId: string | null;
  proveedorNombre: string | null;
  sugerido: boolean;
  pagoId: string | null;
  reciboUrl: string | null;
  aplicadoEn: string | null;
  asignaciones: { billId: string; numero: string; ubicacion: string; fecha: string | null; saldo: number; monto: number }[];
}

/** Server actions de acciones.ts, pasadas como props (así los componentes se prueban sin el servidor). */
export interface AccionesPagos {
  aplicar: (id: number) => Promise<R<{ estado: string; mensaje?: string }>>;
  asignarProveedor: (id: number, p: Proveedor) => Promise<R>;
  guardarAsignaciones: (id: number, a: { billId: string; monto: number }[]) => Promise<R>;
  leerProveedores: () => Promise<R<{ proveedores: Proveedor[] }>>;
  leerFacturasProveedor: (id: number) => Promise<R<{ facturas: Factura[] }>>;
}
```

`lib/sucursales-propias/consultas.ts`:

```ts
import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EstadoTransferencia } from './estados';
import type { FilaVista } from '@/components/sucursales-propias/pagos/tipos';

export interface CorridaLista {
  id: number;
  archivo: string;
  subidoEn: string;
  subidoPor: string | null;
  totalRecibos: number;
  estados: string[];
  avisos: number;
}

export interface CorridaFila {
  id: number;
  archivo: string;
  subidoEn: string;
  nResumen: number | null;
  totalResumen: number | null;
  nRecibos: number;
  totalRecibos: number;
  avisos: string[];
}

export async function listarCorridas(db: SupabaseClient): Promise<CorridaLista[]> {
  const { data, error } = await db
    .from('suc_pago_corrida')
    .select('id, archivo, subido_en, total_recibos, avisos, perfiles!suc_pago_corrida_subido_por_fkey(nombre), suc_pago_transferencia(estado)')
    .order('subido_en', { ascending: false })
    .limit(50);
  if (error) throw error;
  return (data ?? []).map((c) => ({
    id: c.id,
    archivo: c.archivo,
    subidoEn: c.subido_en,
    subidoPor: (c.perfiles as { nombre?: string } | null)?.nombre ?? null,
    totalRecibos: Number(c.total_recibos),
    estados: (c.suc_pago_transferencia as { estado: string }[]).map((t) => t.estado),
    avisos: (c.avisos as string[]).length,
  }));
}

export async function leerCorrida(db: SupabaseClient, id: number): Promise<{ corrida: CorridaFila; filas: FilaVista[] } | null> {
  const [c, t] = await Promise.all([
    db.from('suc_pago_corrida').select('*').eq('id', id).maybeSingle(),
    db.from('suc_pago_transferencia').select('*, suc_pago_asignacion(*)').eq('corrida_id', id).order('id'),
  ]);
  if (c.error) throw c.error;
  if (t.error) throw t.error;
  if (!c.data) return null;
  const filasDb = t.data ?? [];
  const firmadas = filasDb.length
    ? await db.storage.from('suc-pagos-recibos').createSignedUrls(filasDb.map((f) => f.archivo_pdf), 600)
    : { data: [] };
  const url = new Map((firmadas.data ?? []).map((s) => [s.path, s.signedUrl]));
  return {
    corrida: {
      id: c.data.id,
      archivo: c.data.archivo,
      subidoEn: c.data.subido_en,
      nResumen: c.data.n_resumen,
      totalResumen: c.data.total_resumen === null ? null : Number(c.data.total_resumen),
      nRecibos: c.data.n_recibos,
      totalRecibos: Number(c.data.total_recibos),
      avisos: c.data.avisos as string[],
    },
    filas: filasDb.map((f) => ({
      id: f.id,
      llave: f.llave,
      tipo: f.tipo,
      alias: f.alias,
      concepto: f.concepto,
      monto: Number(f.monto),
      fecha: f.fecha_operacion,
      estado: f.estado as EstadoTransferencia,
      error: f.error,
      proveedorId: f.proveedor_zoho_id,
      proveedorNombre: f.proveedor_nombre,
      sugerido: f.sugerido,
      pagoId: f.zoho_vendorpayment_id,
      reciboUrl: url.get(f.archivo_pdf) ?? null,
      aplicadoEn: f.aplicado_en,
      asignaciones: (f.suc_pago_asignacion as { bill_id: string; bill_numero: string; ubicacion: string; fecha: string | null; saldo: number; monto: number }[])
        .map((a) => ({ billId: a.bill_id, numero: a.bill_numero, ubicacion: a.ubicacion, fecha: a.fecha, saldo: Number(a.saldo), monto: Number(a.monto) }))
        .sort((a, b) => (a.fecha ?? '').localeCompare(b.fecha ?? '')),
    })),
  };
}
```

- [ ] **Step 3: Componente de revisión `components/sucursales-propias/pagos/corrida.tsx`**

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pesos } from '@/lib/comercializadora/formato';
import { ESTADOS } from '@/lib/sucursales-propias/estados';
import { ElegirProveedor } from './elegir-proveedor';
import { EditarAsignacion } from './editar-asignacion';
import type { AccionesPagos, FilaVista } from './tipos';

const TONO = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  bad: 'bg-bad-soft text-bad',
  muted: 'bg-surface-2 text-muted-foreground',
} as const;

type Resultado = { estado: string; mensaje?: string };

export function Corrida({
  filas,
  puedeAplicar,
  acciones,
  zohoOrg,
}: {
  filas: FilaVista[];
  puedeAplicar: boolean;
  acciones: AccionesPagos;
  zohoOrg: string | null;
}) {
  const router = useRouter();
  const [resultados, setResultados] = useState<Record<number, Resultado>>({});
  const [confirmar, setConfirmar] = useState(false);
  const [progreso, setProgreso] = useState<{ hechas: number; total: number } | null>(null);
  const listas = filas.filter((f) => f.estado === 'cuadra');
  const total = listas.reduce((s, f) => s + Math.round(f.monto * 100), 0) / 100;

  async function aplicarUna(id: number) {
    const r = await acciones.aplicar(id);
    setResultados((x) => ({ ...x, [id]: 'error' in r ? { estado: 'error', mensaje: r.error } : { estado: r.estado, mensaje: r.mensaje } }));
  }

  async function aplicarTodas() {
    setConfirmar(false);
    setProgreso({ hechas: 0, total: listas.length });
    // Una por una: cada pago es independiente y el usuario ve el avance (spec §7).
    for (const [i, f] of listas.entries()) {
      await aplicarUna(f.id);
      setProgreso({ hechas: i + 1, total: listas.length });
    }
    setProgreso(null);
    router.refresh();
  }

  async function reintentar(id: number) {
    await aplicarUna(id);
    router.refresh();
  }

  return (
    <div className="space-y-4">
      {puedeAplicar && listas.length > 0 ? (
        <div className="placa flex flex-wrap items-center gap-3 px-4 py-3">
          {progreso ? (
            <p role="status" className="text-sm">Aplicando {progreso.hechas} de {progreso.total}…</p>
          ) : confirmar ? (
            <>
              <p className="text-sm">
                Se registrarán en Zoho {listas.length} pagos por {pesos(total)} desde BANREGIO - CONSOLIDADO SUCURSALES PROPIAS.
              </p>
              <button type="button" className="boton boton-primario" onClick={aplicarTodas}>
                Confirmar y aplicar en Zoho
              </button>
              <button type="button" className="boton" onClick={() => setConfirmar(false)}>
                Cancelar
              </button>
            </>
          ) : (
            <button type="button" className="boton boton-primario" onClick={() => setConfirmar(true)}>
              Aplicar {listas.length} pagos
            </button>
          )}
        </div>
      ) : null}

      <ul className="space-y-2">
        {filas.map((f) => {
          const r = resultados[f.id];
          const estado = (r?.estado ?? f.estado) as FilaVista['estado'];
          const e = ESTADOS[estado] ?? ESTADOS.error;
          const mensaje = r?.mensaje ?? f.error;
          return (
            <li key={f.id} className="placa px-4 py-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium">{f.alias}</p>
                  <p className="text-xs text-muted-foreground">
                    {f.proveedorNombre ? `Zoho: ${f.proveedorNombre}${f.sugerido ? ' (por nombre)' : ''}` : 'Sin proveedor en Zoho'} · {f.fecha} · {f.concepto}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className="tabular-nums font-medium">{pesos(f.monto)}</span>
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${TONO[e.tono]}`}>{e.texto}</span>
                </div>
              </div>
              {mensaje ? <p className="mt-1 text-sm text-bad">{mensaje}</p> : null}
              {f.asignaciones.length ? (
                <details className="mt-2 text-sm">
                  <summary className="cursor-pointer text-muted-foreground">{f.asignaciones.length} factura(s)</summary>
                  <table className="mt-1 w-full text-left">
                    <tbody>
                      {f.asignaciones.map((a) => (
                        <tr key={a.billId}>
                          <td>{a.numero}</td>
                          <td>{a.ubicacion}</td>
                          <td>{a.fecha}</td>
                          <td className="text-right tabular-nums">{pesos(a.monto)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </details>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-3 text-sm">
                {f.aplicadoEn ? (
                  <span className="text-muted-foreground">
                    Aplicada el {new Date(f.aplicadoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                  </span>
                ) : null}
                {f.reciboUrl ? <a href={f.reciboUrl} target="_blank" rel="noreferrer">Recibo PDF</a> : null}
                {f.pagoId && zohoOrg ? (
                  <a href={`https://books.zoho.com/app/${zohoOrg}#/paymentsmade/${f.pagoId}`} target="_blank" rel="noreferrer">
                    Ver en Zoho
                  </a>
                ) : null}
                {puedeAplicar && (estado === 'error' || estado === 'aplicada_sin_adjunto') ? (
                  <button type="button" className="boton" onClick={() => reintentar(f.id)}>Reintentar</button>
                ) : null}
              </div>
              {puedeAplicar && !r && f.estado === 'desconocido' ? <ElegirProveedor id={f.id} acciones={acciones} /> : null}
              {puedeAplicar && !r && f.estado === 'no_cuadra' ? <EditarAsignacion fila={f} acciones={acciones} /> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
```

**Botones:** el portal no tiene clases `boton` / `boton-primario`. En este componente y en los de los pasos 4 y 6, cambia cada `<button type="button" className="boton boton-primario" …>…</button>` por `<Button type="button" …>…</Button>` y cada `<button type="button" className="boton" …>…</button>` por `<Button type="button" variant="outline" …>…</Button>`, con `import { Button } from '@/components/ui/button';`. Los botones de la lista de proveedores (con `className="w-full px-2 py-1 …"`) se quedan como `<button>`. `placa` sí existe (`app/globals.css`).

- [ ] **Step 4: `elegir-proveedor.tsx` y `editar-asignacion.tsx`**

`components/sucursales-propias/pagos/elegir-proveedor.tsx`:

```tsx
'use client';
import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { normalizarNombre, type Proveedor } from '@/lib/sucursales-propias/empate';
import type { AccionesPagos } from './tipos';

/** Proveedor desconocido: el usuario elige el de Zoho; la equivalencia CLABE → proveedor se guarda (spec §4). */
export function ElegirProveedor({ id, acciones }: { id: number; acciones: AccionesPagos }) {
  const router = useRouter();
  const [lista, setLista] = useState<Proveedor[] | null>(null);
  const [filtro, setFiltro] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);
  const visibles = useMemo(() => {
    const q = normalizarNombre(filtro);
    return (lista ?? []).filter((p) => !q || normalizarNombre(p.nombre).includes(q)).slice(0, 30);
  }, [lista, filtro]);

  async function abrir() {
    const r = await acciones.leerProveedores();
    if ('error' in r) setError(r.error);
    else setLista(r.proveedores);
  }

  async function elegir(p: Proveedor) {
    setGuardando(true);
    const r = await acciones.asignarProveedor(id, p);
    setGuardando(false);
    if ('error' in r) setError(r.error);
    else router.refresh();
  }

  if (!lista)
    return (
      <div className="mt-2">
        <button type="button" className="boton" onClick={abrir}>Elegir proveedor de Zoho</button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    );
  return (
    <div className="mt-2 space-y-2">
      <input
        aria-label="Buscar proveedor"
        className="w-full rounded-md border border-line px-2 py-1 text-sm"
        value={filtro}
        onChange={(e) => setFiltro(e.target.value)}
        placeholder="Buscar proveedor…"
      />
      <ul className="max-h-48 overflow-auto text-sm">
        {visibles.map((p) => (
          <li key={p.id}>
            <button type="button" disabled={guardando} className="w-full px-2 py-1 text-left hover:bg-surface-2" onClick={() => elegir(p)}>
              {p.nombre}
            </button>
          </li>
        ))}
      </ul>
      {error ? <p className="text-sm text-bad">{error}</p> : null}
    </div>
  );
}
```

`components/sucursales-propias/pagos/editar-asignacion.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { pesos } from '@/lib/comercializadora/formato';
import type { Factura } from '@/lib/sucursales-propias/empate';
import type { AccionesPagos, FilaVista } from './tipos';

/** No cuadra: el usuario marca qué facturas cubre la transferencia y cuánto abona a cada una (spec §4). */
export function EditarAsignacion({ fila, acciones }: { fila: FilaVista; acciones: AccionesPagos }) {
  const router = useRouter();
  const [facturas, setFacturas] = useState<Factura[] | null>(null);
  const [montos, setMontos] = useState<Record<string, string>>(
    Object.fromEntries(fila.asignaciones.map((a) => [a.billId, a.monto.toFixed(2)])),
  );
  const [error, setError] = useState<string | null>(null);
  const suma = Object.values(montos).reduce((s, v) => s + Math.round((Number(v) || 0) * 100), 0) / 100;

  async function abrir() {
    const r = await acciones.leerFacturasProveedor(fila.id);
    if ('error' in r) setError(r.error);
    else setFacturas(r.facturas);
  }

  async function guardar() {
    const asignaciones = Object.entries(montos)
      .filter(([, v]) => Number(v) > 0)
      .map(([billId, v]) => ({ billId, monto: Number(v) }));
    const r = await acciones.guardarAsignaciones(fila.id, asignaciones);
    if ('error' in r) setError(r.error);
    else router.refresh();
  }

  if (!facturas)
    return (
      <div className="mt-2">
        <button type="button" className="boton" onClick={abrir}>Ajustar facturas</button>
        {error ? <p className="text-sm text-bad">{error}</p> : null}
      </div>
    );
  return (
    <div className="mt-2 space-y-2 text-sm">
      <table className="w-full text-left">
        <thead>
          <tr><th>Factura</th><th>Sucursal</th><th>Saldo</th><th>Abono</th></tr>
        </thead>
        <tbody>
          {facturas.map((f) => (
            <tr key={f.billId}>
              <td>{f.numero}</td>
              <td>{f.ubicacion}</td>
              <td className="tabular-nums">{pesos(f.saldo)}</td>
              <td>
                <input
                  aria-label={`Abono a ${f.numero}`}
                  inputMode="decimal"
                  className="w-28 rounded-md border border-line px-2 py-1 text-right"
                  value={montos[f.billId] ?? ''}
                  onChange={(e) => setMontos((m) => ({ ...m, [f.billId]: e.target.value }))}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={Math.round(suma * 100) === Math.round(fila.monto * 100) ? 'text-ok' : 'text-warn'}>
        Asignado {pesos(suma)} de {pesos(fila.monto)}
      </p>
      <button type="button" className="boton boton-primario" onClick={guardar}>Guardar reparto</button>
      {error ? <p className="text-bad">{error}</p> : null}
    </div>
  );
}
```

- [ ] **Step 5: Correr la prueba de pantalla**

Run: `npx vitest run tests/portal/sucursales-propias-pantalla.test.tsx`
Expected: PASS.

- [ ] **Step 6: Subida del ZIP y páginas**

`components/sucursales-propias/pagos/subir-zip.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';

export function SubirZip() {
  const router = useRouter();
  const [estado, setEstado] = useState<'listo' | 'subiendo'>('listo');
  const [error, setError] = useState<string | null>(null);

  async function subir(archivo: File) {
    setEstado('subiendo');
    setError(null);
    const fd = new FormData();
    fd.append('zip', archivo);
    try {
      const r = await fetch('/api/sucursales/propias/pagos', { method: 'POST', body: fd });
      const j = (await r.json().catch(() => ({}))) as { corridaId?: number; error?: string };
      if (!r.ok || !j.corridaId) throw new Error(j.error ?? 'No se pudo subir el ZIP.');
      router.push(`/sucursales/propias/pagos/${j.corridaId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo subir el ZIP.');
      setEstado('listo');
    }
  }

  return (
    <label
      className="placa flex cursor-pointer flex-col items-center gap-2 border-dashed px-6 py-8 text-center"
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const f = e.dataTransfer.files[0];
        if (f) subir(f);
      }}
    >
      <span className="font-medium">
        {estado === 'subiendo' ? 'Leyendo recibos y consultando Zoho…' : 'Arrastra aquí el ZIP de recibos Banregio, o haz clic para elegirlo'}
      </span>
      <span className="text-xs text-muted-foreground">El ZIP de la corrida, con el resumen de la transferencia masiva. Máximo 4 MB.</span>
      <input
        type="file"
        accept=".zip,application/zip"
        className="sr-only"
        disabled={estado === 'subiendo'}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) subir(f);
        }}
      />
      {error ? <span role="alert" className="text-sm text-bad">{error}</span> : null}
    </label>
  );
}
```

`app/(sucursales)/sucursales/propias/pagos/page.tsx`:

```tsx
import Link from 'next/link';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { SubirZip } from '@/components/sucursales-propias/pagos/subir-zip';
import { sesionPagos } from '@/lib/supabase/sesion';
import { listarCorridas } from '@/lib/sucursales-propias/consultas';
import { contar } from '@/lib/sucursales-propias/estados';
import { pesos } from '@/lib/comercializadora/formato';

export default async function PagosPropiasPagina() {
  const { db, puedeAplicar } = await sesionPagos();
  const corridas = await listarCorridas(db);
  return (
    <>
      <Encabezado
        area="Sucursales propias · Helper Holding"
        titulo="Pagos a proveedores"
        descripcion="Sube el ZIP de recibos de una transferencia masiva Banregio y registra los pagos en Zoho Books (Sucursales GDL)."
      />
      {puedeAplicar ? <SubirZip /> : null}
      <Tarjeta titulo="Corridas">
        {corridas.length === 0 ? (
          <Vacio titulo="Todavía no hay corridas">Sube el primer ZIP de recibos para empezar.</Vacio>
        ) : (
          <ul className="divide-y divide-line">
            {corridas.map((c) => {
              const n = contar(c.estados);
              return (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                  <Link href={`/sucursales/propias/pagos/${c.id}`} className="font-medium">
                    #{c.id} · {c.archivo}
                  </Link>
                  <span className="text-sm text-muted-foreground">
                    {new Date(c.subidoEn).toLocaleString('es-MX', { timeZone: 'America/Mexico_City' })}
                    {c.subidoPor ? ` · ${c.subidoPor}` : ''} · {pesos(c.totalRecibos)} · {n.aplicadas}/{n.total} aplicadas
                    {n.revisar ? ` · ${n.revisar} por revisar` : ''}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </Tarjeta>
    </>
  );
}
```

`app/(sucursales)/sucursales/propias/pagos/[corridaId]/page.tsx`:

```tsx
import { notFound } from 'next/navigation';
import { AlertTriangle } from 'lucide-react';
import { Encabezado } from '@/components/portal/piezas';
import { Corrida } from '@/components/sucursales-propias/pagos/corrida';
import { sesionPagos } from '@/lib/supabase/sesion';
import { leerCorrida } from '@/lib/sucursales-propias/consultas';
import { contar } from '@/lib/sucursales-propias/estados';
import { pesos } from '@/lib/comercializadora/formato';
import {
  aplicarTransferencia,
  asignarProveedor,
  guardarAsignaciones,
  leerFacturasProveedor,
  leerProveedores,
} from '../acciones';

export default async function CorridaPagina({ params }: { params: Promise<{ corridaId: string }> }) {
  const { corridaId } = await params;
  const id = Number(corridaId);
  if (!Number.isInteger(id) || id <= 0) notFound();
  const { db, puedeAplicar } = await sesionPagos();
  const datos = await leerCorrida(db, id);
  if (!datos) notFound();
  const { corrida, filas } = datos;
  const n = contar(filas.map((f) => f.estado));
  return (
    <>
      <Encabezado
        area="Sucursales propias · Helper Holding"
        titulo={`Corrida #${corrida.id}`}
        migas={[{ href: '/sucursales/propias/pagos', nombre: 'Pagos' }]}
        descripcion={`${corrida.archivo} · ${corrida.nRecibos} recibos por ${pesos(corrida.totalRecibos)}${
          corrida.totalResumen !== null ? ` (resumen: ${pesos(corrida.totalResumen)})` : ''
        } · ${n.aplicadas}/${n.total} aplicadas`}
      />
      {corrida.avisos.length ? (
        <div role="status" className="placa space-y-1 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
          {corrida.avisos.map((a) => (
            <p key={a} className="flex items-start gap-2">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
              {a}
            </p>
          ))}
        </div>
      ) : null}
      <Corrida
        filas={filas}
        puedeAplicar={puedeAplicar}
        zohoOrg={process.env.ZOHO_SUC_ORG_ID ?? null}
        acciones={{
          aplicar: aplicarTransferencia,
          asignarProveedor,
          guardarAsignaciones,
          leerProveedores,
          leerFacturasProveedor,
        }}
      />
    </>
  );
}
```

- [ ] **Step 7: Correr todo y revisar tipos y formato**

Run: `npm test` , `npm run typecheck` y `npm run format:check`
Expected: PASS. Si Prettier se queja, corre `npx prettier --write` solo sobre los archivos nuevos o modificados de este plan.

- [ ] **Step 8: Revisión visual local**

Arranca el portal con `preview_start` (configuración de `.claude/launch.json`; si no existe, créala con `npm run dev` en el puerto 3000), entra con un usuario de prueba Holding que tenga `sucursales_pagos` en `edicion` y revisa:
- el menú de Sucursales muestra «Red» y, separado, «Sucursales propias · Helper Holding › Pagos»;
- `/sucursales/propias/pagos` muestra la zona de subida y la lista vacía;
- con un usuario `lectura`, no aparece la zona de subida;
- a 375 px de ancho no hay scroll horizontal.
Sin la Edge Function desplegada, la subida debe mostrar el error claro de la función (no un error genérico de JavaScript).

- [ ] **Step 9: Commit**

```bash
git add lib/sucursales-propias/consultas.ts components/sucursales-propias "app/(sucursales)/sucursales/propias" tests/portal/sucursales-propias-pantalla.test.tsx
git commit -m "feat(sucursales-propias): pantallas de corridas y revisión de pagos"
```

---

### Task 9: Guía de puesta en marcha y prueba con la corrida real

**Files:**
- Create: `docs/sucursales-propias/pagos.md`

**Interfaces:**
- Consumes: todo lo anterior. No produce código.

- [ ] **Step 1: Escribir la guía**

`docs/sucursales-propias/pagos.md` (sigue el estilo de `docs/migracion/comercializadora.md` y el procedimiento de `docs/portal/MIGRACIONES-Y-DESPLIEGUE.md`), con estas secciones y este contenido:

1. **Qué hace** — un párrafo: ZIP de recibos Banregio → empate → pagos en Zoho Books (Sucursales GDL) con recibo adjunto; enlace a la spec.
2. **Migración** — aplicar `20261125000098_sucursales_propias_pagos.sql` según `docs/portal/MIGRACIONES-Y-DESPLIEGUE.md`.
3. **Credenciales de Zoho (lo hace el usuario)**:
   - En `https://api-console.zoho.com` → *Self Client* (o el cliente que ya usan) → *Generate Code* con los scopes
     `ZohoBooks.bills.READ,ZohoBooks.contacts.READ,ZohoBooks.vendorpayments.CREATE,ZohoBooks.vendorpayments.READ,ZohoBooks.vendorpayments.UPDATE,ZohoBooks.accountants.READ`,
     con un usuario que tenga acceso a la org *Sucursales The Coffee – GDL*.
   - Cambiar el código por el refresh token (`POST https://accounts.zoho.com/oauth/v2/token?grant_type=authorization_code&client_id=…&client_secret=…&code=…`).
   - El id de la org está en Zoho Books → Configuración → Perfil de la organización.
4. **Secretos de Supabase** (Project Settings → Edge Functions → Secrets, o CLI):
   `ZOHO_SUC_CLIENT_ID`, `ZOHO_SUC_CLIENT_SECRET`, `ZOHO_SUC_REFRESH_TOKEN`, `ZOHO_SUC_ORG_ID`. `SUC_PAGOS_EFECTOS` **no** se pone todavía (sin ella, todo es solo lectura).
5. **Desplegar la función**: `supabase functions deploy zoho-suc-pagos`.
6. **Vercel**: variable `ZOHO_SUC_ORG_ID` (Production y Preview) para los enlaces «Ver en Zoho».
7. **Dar acceso** — SQL con autorización, como los demás accesos:
   `insert into perfil_modulos (user_id, modulo, nivel) values ('<uuid>', 'sucursales_pagos', 'edicion');`
   (solo empleados Holding; `lectura` para quien solo revisa).
8. **Primera corrida en modo prueba** — subir el ZIP real con `SUC_PAGOS_EFECTOS` apagado: se registran corrida y empates (lecturas de Zoho), y «Aplicar» deja las filas en *Error* con «modo sin efectos externos». Revisar que el empate sea el esperado. Luego encender `SUC_PAGOS_EFECTOS=si`.
9. **Si algo sale mal** — tabla corta: «Zoho de Sucursales GDL no está configurado» (faltan secretos), «no encontré una sola cuenta bancaria» (revisar el nombre en `suc_pago_config.cuenta_nombre`), «Aplicada · falta el recibo» (botón Reintentar), «Ya estaba en Zoho» (el pago existía con esa referencia).

- [ ] **Step 2: Comprobar en Zoho real, solo lecturas, los parámetros que el plan supone**

Con los secretos ya cargados (paso del usuario) y `SUC_PAGOS_EFECTOS` apagado, en una sesión del portal con acceso `edicion`, sube `SUCURSALES 20NOV26.zip` y confirma:
- la acción `facturas` regresa facturas con `status` `open`/`overdue`/`partially_paid` (si Zoho rechaza el parámetro `status`, cámbialo por `filter_by` con `Status.Unpaid` / `Status.Overdue` / `Status.PartiallyPaid` en `facturasAbiertas` y su prueba);
- `location_name` trae la sucursal (si no, ajusta el campo en `facturasAbiertas`);
- al pulsar Aplicar en una fila, el error dice «modo sin efectos externos» **después** de haber pasado la búsqueda `GET /vendorpayments?search_text=…` y la relectura de saldos (si `search_text` no filtra, cambia a `reference_number_contains` en `pagoConReferencia` y su prueba).
Anota lo que cambiaste en la guía.

- [ ] **Step 3: Verificación final**

Run: `npm test`, `npm run test:funciones`, `npm run typecheck`, `npm run format:check`
Expected: todo en verde.

- [ ] **Step 4: Commit**

```bash
git add docs/sucursales-propias/pagos.md
git commit -m "docs(sucursales-propias): guía de puesta en marcha de pagos"
```
