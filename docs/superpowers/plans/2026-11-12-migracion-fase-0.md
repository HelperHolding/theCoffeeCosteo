# Migración thecoffeemexico · Fase 0 (acceso externo, inventario y usuarios): plan de implementación

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Dejar el portal listo para recibir usuarios y datos de thecoffeemexico: roles externos sin Costeo, login por usuario, inventario del esquema viejo y un importador de usuarios idempotente.

**Architecture:** Los roles `interno`/`franquiciado`/`proveedor` siguen el precedente de `sucursales` (migración 24): son perfiles sin Costeo. Una prueba de guardia impide que vuelva a abrirse una lectura sin predicado. Los scripts de `scripts/migracion-legado/` leen bliocjvq solo en lectura y escriben en el portal en una sola transacción. La lógica pura (plan de usuarios, inventario, redacción) vive en archivos `*-lib.ts` probados sin red.

**Tech Stack:** Next.js 16 (App Router, server actions), Supabase/Postgres, PGlite para pruebas SQL, Vitest, `pg` para los scripts, `tsx`.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (secciones "Fase 0", 0.1–0.3).

Este es el **plan 1 de 4**. Los siguientes: (2) datos, puente `legado` y funciones de Comercializadora; (3) pantallas de Comercializadora; (4) cutover. Cada uno se escribe cuando termina el anterior.

## Global Constraints

- Node 24+. No se agregan dependencias: `pg`, `@electric-sql/pglite`, `tsx` y `vitest` ya están en `package.json`.
- Proyecto del portal: `jpqkmnfjwzniptszjuli` (`DATABASE_URL`). Proyecto viejo: `bliocjvqwskvoxrumqby` (`DATABASE_URL_LEGADO`). Los scripts verifican el proyecto antes de conectar y **nunca** imprimen URLs, contraseñas ni hashes.
- bliocjvq se abre solo con `begin read only` y siempre termina en `rollback`.
- Toda escritura en el portal va en una transacción con `set local app.origen = 'migracion'`, así la bitácora no registra la carga.
- Roles de Costeo: `compras`, `operaciones`, `finanzas`, `admin`. Roles sin Costeo: `sucursales`, `interno`, `franquiciado`, `proveedor`.
- Dominio de las cuentas del sitio viejo: `thecoffee.internal` (`<usuario>@thecoffee.internal`).
- El importador **no** asigna roles de Costeo ni filas en `perfil_modulos`.
- Textos de la interfaz en español de México. Prettier: `npm run format:check` debe pasar.
- La migración nueva es `supabase/migrations/20261112000044_legado_acceso.sql`. Si al ejecutar ya existe la 44, se usa el siguiente número libre y se actualizan las referencias de este plan.
- La implementación va en la rama `feat/migracion-fase-0`, creada desde `docs/migracion-comercializadora`.

## Review Focus

1. **Usuario con mayúsculas o espacios alrededor** (`  Ana.Lopez `): entra como `ana.lopez@thecoffee.internal`. Con espacios internos (`ana lopez`) debe responder con un mensaje claro sin llamar a Auth. Lo prueba la Tarea 4.
2. **Correo del sitio viejo que coincide con una cuenta del portal pero en otra capitalización:** se vincula, no se duplica la cuenta. Lo prueba la Tarea 6.
3. **Dos usuarios viejos con el mismo correo:** el segundo se omite como `correo_repetido` y nunca se vinculan dos al mismo `user_id`. Lo prueba la Tarea 6.
4. **Segunda corrida después de un cambio de contraseña en el sitio viejo:** se actualiza el hash sin duplicar cuentas, perfiles ni vínculos. Lo prueba la Tarea 7.
5. **Definiciones de funciones de bliocjvq con tokens o llaves incrustadas:** se redactan antes de escribir `esquema-legado.json`. Lo prueba la Tarea 5.

---

### Task 1: Roles sin Costeo y esquema `migracion_legado`

**Files:**
- Create: `supabase/migrations/20261112000044_legado_acceso.sql`
- Modify: `tests/db/utilidades.ts` (tipo `Rol`)
- Test: `tests/db/legado-acceso.test.ts`

**Interfaces:**
- Produces: valores `'interno' | 'franquiciado' | 'proveedor'` aceptados en `public.perfiles.rol`; tabla `migracion_legado.usuarios` (columnas abajo), que usan las Tareas 7 y 8.

- [ ] **Step 1: Crear la rama**

```bash
git switch docs/migracion-comercializadora
git switch -c feat/migracion-fase-0
```

- [ ] **Step 2: Ampliar el tipo `Rol` de las utilidades de prueba**

En `tests/db/utilidades.ts`, reemplazar la línea del tipo:

```ts
export type Rol =
  | 'compras'
  | 'operaciones'
  | 'finanzas'
  | 'admin'
  | 'sucursales'
  | 'interno'
  | 'franquiciado'
  | 'proveedor';
```

- [ ] **Step 3: Escribir la prueba que falla**

`tests/db/legado-acceso.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

describe('roles sin Costeo del sitio viejo (migración 44)', () => {
  it.each(['interno', 'franquiciado', 'proveedor'] as const)(
    '%s no lee Costeo y solo ve su propio perfil',
    async (rol) => {
      const db = await crearDbLocal();
      await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 30, presentacion: 1000, unidad: 'ml' });
      await crearUsuario(db, 'admin');
      const id = await crearUsuario(db, rol);
      const r = await comoUsuario(db, id, async () => ({
        insumos: num((await db.query<{ n: number }>('select count(*) as n from insumos')).rows[0].n),
        costos: num((await db.query<{ n: number }>('select count(*) as n from v_costo_producto')).rows[0].n),
        perfiles: (await db.query<{ user_id: string }>('select user_id from perfiles')).rows.map((f) => f.user_id),
      }));
      expect(r).toEqual({ insumos: 0, costos: 0, perfiles: [id] });
    },
  );

  it('rechaza roles desconocidos', async () => {
    const db = await crearDbLocal();
    await expect(crearUsuario(db, 'otro' as never)).rejects.toThrow(/perfiles_rol_check/);
  });

  it('migracion_legado no es accesible para usuarios del portal, ni siquiera admin', async () => {
    const db = await crearDbLocal();
    const id = await crearUsuario(db, 'admin');
    await expect(
      comoUsuario(db, id, () => db.query('select * from migracion_legado.usuarios')),
    ).rejects.toThrow(/permission denied/);
  });
});
```

- [ ] **Step 4: Correr la prueba y verificar que falla**

Run: `npx vitest run tests/db/legado-acceso.test.ts`
Expected: FAIL. Los tres casos de `it.each` fallan con `perfiles_rol_check` y el último con `schema "migracion_legado" does not exist`.

- [ ] **Step 5: Escribir la migración**

`supabase/migrations/20261112000044_legado_acceso.sql`:

```sql
-- Migración de thecoffeemexico, Fase 0 (docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md).

-- 1. Roles SIN Costeo para cuentas que vienen del sitio viejo. Mismo camino que 'sucursales' (migración 24): la RLS
--    de Costeo exige tiene_rol('compras','operaciones','finanzas','admin'), así que estos roles no leen Costeo.
--    Sus accesos llegan solo por perfil_modulos, módulo por módulo.
alter table public.perfiles drop constraint perfiles_rol_check;
alter table public.perfiles add constraint perfiles_rol_check
  check (rol in ('compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno', 'franquiciado', 'proveedor'));

-- 2. Vínculo usuario del sitio viejo -> cuenta del portal. Privado: solo lo usan los scripts de
--    scripts/migracion-legado con DATABASE_URL. Cada módulo reasigna con él sus FKs a usuarios.
create schema migracion_legado;
revoke all on schema migracion_legado from public, anon, authenticated;

create table migracion_legado.usuarios (
  legado_id text primary key,
  auth_uid_legado uuid unique,
  user_id uuid not null unique references auth.users(id) on delete cascade,
  username text not null,
  correo text,
  rol_legado text not null,
  subtipo text,
  supplier_key text,
  parent_legado_id text,
  permisos jsonb,
  activo_legado boolean not null,
  origen text not null check (origen in ('creado', 'vinculado')),
  importado_en timestamptz not null default now(),
  actualizado_en timestamptz not null default now()
);
revoke all on all tables in schema migracion_legado from public, anon, authenticated;
```

- [ ] **Step 6: Correr la prueba y verificar que pasa**

Run: `npx vitest run tests/db/legado-acceso.test.ts`
Expected: PASS (5 pruebas).

- [ ] **Step 7: Correr la suite de base de datos completa**

Run: `npx vitest run tests/db`
Expected: PASS. Ninguna prueba previa depende de que la restricción de `rol` sea más estrecha.

- [ ] **Step 8: Commit**

```bash
git add supabase/migrations/20261112000044_legado_acceso.sql tests/db/utilidades.ts tests/db/legado-acceso.test.ts
git commit -m "feat(db): roles sin Costeo y vínculo de usuarios del sitio viejo"
```

---

### Task 2: Prueba de guardia de lecturas

**Files:**
- Test: `tests/db/guardia-lectura.test.ts`

**Interfaces:**
- Consumes: esquema `migracion_legado` (Tarea 1).
- Produces: nada que importen otras tareas. Es una red de seguridad para los planes 2–4: cualquier política nueva de lectura sin predicado de rol o módulo hace fallar la suite.

- [ ] **Step 1: Escribir la prueba**

`tests/db/guardia-lectura.test.ts`:

```ts
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
```

- [ ] **Step 2: Correr la prueba**

Run: `npx vitest run tests/db/guardia-lectura.test.ts`
Expected: PASS (6 pruebas). Las cuatro primeras son guardias del estado actual y deben pasar sin cambios. Las dos de "la guardia detecta" demuestran que las guardias sí fallan ante un caso malo. Si una guardia del estado actual falla, **no** se ajusta la regex para que pase: se reporta la política o vista que la hizo fallar, porque es un hueco real.

- [ ] **Step 3: Commit**

```bash
git add tests/db/guardia-lectura.test.ts
git commit -m "test(db): guardia de lecturas para políticas, vistas y esquemas privados"
```

---

### Task 3: Costeo falla cerrado en la app

**Files:**
- Create: `lib/portal/roles.ts`
- Modify: `lib/supabase/database.types.ts:3` (tipo `Rol`)
- Modify: `lib/supabase/sesion.ts` (función `sesion`)
- Modify: `lib/portal/modulos.ts` (entrada `costeo`)
- Test: `tests/portal/modulos.test.ts`

**Interfaces:**
- Produces: `ROLES_COSTEO: readonly ['compras','operaciones','finanzas','admin']` y `tieneCosteo(rol: string): boolean` en `@/lib/portal/roles`.

- [ ] **Step 1: Escribir las pruebas que fallan**

Agregar al final de `tests/portal/modulos.test.ts`:

```ts
it('los roles sin Costeo no ven Costeo; un rol desconocido tampoco (falla cerrado)', () => {
  for (const rol of ['sucursales', 'interno', 'franquiciado', 'proveedor', 'desconocido'])
    expect(modulosVisibles({}, rol)).toEqual([]);
  expect(modulosVisibles({ crm: 'lectura' }, 'franquiciado')).toEqual(['crm']);
});

it('un perfil externo que entra a Costeo va a Inicio', async () => {
  mocks.perfil.mockResolvedValue({
    data: { user_id: 'u', nombre: 'Ana', rol: 'franquiciado', activo: true },
    error: null,
  });
  await expect(sesion()).rejects.toThrow(/^REDIRECT:\/$/);
  await expect(sesion(undefined, false)).rejects.toThrow('Tu perfil no tiene acceso a Costeo.');
  await expect(sesion(undefined, true, { sinCosteo: true })).resolves.toMatchObject({
    perfil: { rol: 'franquiciado' },
  });
});

it('el rol sucursales sigue yendo a /sucursales al entrar a Costeo', async () => {
  mocks.perfil.mockResolvedValue({
    data: { user_id: 'u', nombre: 'Ana', rol: 'sucursales', activo: true },
    error: null,
  });
  await expect(sesion()).rejects.toThrow(/^REDIRECT:\/sucursales$/);
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/portal/modulos.test.ts`
Expected: FAIL. `modulosVisibles({}, 'interno')` devuelve `['costeo']` y `sesion()` con `franquiciado` se resuelve en lugar de redirigir.

- [ ] **Step 3: Crear `lib/portal/roles.ts`**

```ts
import type { Rol } from '../supabase/database.types';

/** Roles con acceso a Costeo. Cualquier otro (sucursales, interno, franquiciado, proveedor o uno nuevo) queda fuera. */
export const ROLES_COSTEO = ['compras', 'operaciones', 'finanzas', 'admin'] as const satisfies readonly Rol[];

/** Falla cerrado: solo los roles de ROLES_COSTEO entran a Costeo. La RLS aplica la misma regla (migraciones 24 y 44). */
export const tieneCosteo = (rol: string): boolean => (ROLES_COSTEO as readonly string[]).includes(rol);
```

- [ ] **Step 4: Ampliar el tipo `Rol`**

En `lib/supabase/database.types.ts` línea 3:

```ts
export type Rol =
  | 'compras'
  | 'operaciones'
  | 'finanzas'
  | 'admin'
  | 'sucursales'
  | 'interno'
  | 'franquiciado'
  | 'proveedor';
```

- [ ] **Step 5: Usar `tieneCosteo` en `sesion`**

En `lib/supabase/sesion.ts`, agregar el import:

```ts
import { tieneCosteo } from '../portal/roles';
```

y reemplazar el bloque `if (r.data.rol === 'sucursales' && !sinCosteo) { ... }` por:

```ts
  if (!sinCosteo && !tieneCosteo(r.data.rol)) {
    if (redirigir) redirect(r.data.rol === 'sucursales' ? '/sucursales' : '/');
    throw new Error('Tu perfil no tiene acceso a Costeo.');
  }
```

Actualizar el comentario JSDoc de `sesion`:

```ts
/**
 * Sesión del portal. Los roles sin Costeo (sucursales, migración 24; interno, franquiciado y proveedor, migración 44)
 * solo pasan donde se permite explícitamente (`sinCosteo`: Inicio, CRM). En Costeo, 'sucursales' va a /sucursales y
 * los demás a Inicio, o la acción falla. La RLS de Costeo también los niega.
 */
```

- [ ] **Step 6: Usar `tieneCosteo` en el módulo Costeo**

En `lib/portal/modulos.ts`, agregar `import { tieneCosteo } from './roles';` y en la entrada `costeo` reemplazar:

```ts
    // Cualquier perfil activo con rol de Costeo; el rol 'sucursales' (migración 24) no entra.
    acceso: (_, rol) => rol !== 'sucursales',
```

por:

```ts
    // Solo roles de Costeo (falla cerrado): sucursales, interno, franquiciado y proveedor no entran.
    acceso: (_, rol) => tieneCosteo(rol),
```

- [ ] **Step 7: Correr pruebas y typecheck**

Run: `npx vitest run tests/portal/modulos.test.ts && npm run typecheck`
Expected: PASS y typecheck sin errores.

- [ ] **Step 8: Correr la suite completa del portal**

Run: `npx vitest run tests/portal`
Expected: PASS.

- [ ] **Step 9: Formato y commit**

```bash
npx prettier --write lib/portal/roles.ts lib/portal/modulos.ts lib/supabase/sesion.ts lib/supabase/database.types.ts tests/portal/modulos.test.ts
git add lib/portal/roles.ts lib/portal/modulos.ts lib/supabase/sesion.ts lib/supabase/database.types.ts tests/portal/modulos.test.ts
git commit -m "feat(portal): Costeo solo para roles de Costeo (falla cerrado)"
```

---

### Task 4: Login con correo o usuario

**Files:**
- Create: `lib/portal/acceso.ts`
- Modify: `app/(auth)/login/actions.ts` (función `entrar`)
- Modify: `components/portal/formulario-acceso.tsx` (campo de correo)
- Test: `tests/portal/acceso.test.ts`, `tests/portal/formulario-acceso.test.tsx`

**Interfaces:**
- Produces: `DOMINIO_USUARIOS = 'thecoffee.internal'` y `correoDeAcceso(entrada: string): string | null` en `@/lib/portal/acceso`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/portal/acceso.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { correoDeAcceso } from '../../lib/portal/acceso';

describe('correoDeAcceso', () => {
  it('deja los correos tal cual (sin espacios alrededor)', () => {
    expect(correoDeAcceso('  ana@ejemplo.mx ')).toBe('ana@ejemplo.mx');
  });
  it('convierte un usuario del sitio viejo en su cuenta de Auth, en minúsculas', () => {
    expect(correoDeAcceso('  Ana.Lopez ')).toBe('ana.lopez@thecoffee.internal');
    expect(correoDeAcceso('prov_01-gdl')).toBe('prov_01-gdl@thecoffee.internal');
  });
  it('rechaza vacíos y usuarios con caracteres inválidos', () => {
    expect(correoDeAcceso('   ')).toBeNull();
    expect(correoDeAcceso('ana lopez')).toBeNull();
    expect(correoDeAcceso('ana/lopez')).toBeNull();
  });
});

const mocks = vi.hoisted(() => ({
  signIn: vi.fn(),
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
}));
vi.mock('@/lib/supabase/servidor', () => ({
  servidor: async () => ({ auth: { signInWithPassword: mocks.signIn } }),
}));
vi.mock('next/navigation', () => ({ redirect: mocks.redirect }));
import { entrar } from '../../app/(auth)/login/actions';

const formulario = (campos: Record<string, string>) => {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
};

describe('entrar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.signIn.mockResolvedValue({ data: {}, error: null });
  });

  it('entra con el usuario del sitio viejo', async () => {
    await expect(entrar('', formulario({ email: 'Ana.Lopez', password: 'secreta' }))).rejects.toThrow('REDIRECT:/');
    expect(mocks.signIn).toHaveBeenCalledWith({ email: 'ana.lopez@thecoffee.internal', password: 'secreta' });
  });

  it('no llama a Auth si el usuario es inválido', async () => {
    expect(await entrar('', formulario({ email: 'ana lopez', password: 'secreta' }))).toBe(
      'Escribe tu correo o usuario y tu contraseña.',
    );
    expect(mocks.signIn).not.toHaveBeenCalled();
  });

  it('el error de credenciales menciona correo o usuario', async () => {
    mocks.signIn.mockResolvedValue({ data: {}, error: { message: 'Invalid login credentials' } });
    expect(await entrar('', formulario({ email: 'ana', password: 'mala' }))).toBe(
      'No pudimos iniciar sesión. Revisa tu correo o usuario y tu contraseña.',
    );
  });
});
```

`tests/portal/formulario-acceso.test.tsx`:

```tsx
import { render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
vi.mock('@/app/(auth)/login/actions', () => ({ entrar: vi.fn(), establecer: vi.fn() }));
import { FormularioAcceso } from '../../components/portal/formulario-acceso';

it('el acceso pide correo o usuario en un campo de texto', () => {
  render(<FormularioAcceso />);
  const campo = screen.getByLabelText('Correo o usuario');
  expect(campo).toHaveAttribute('type', 'text');
  expect(campo).toHaveAttribute('name', 'email');
  expect(campo).toHaveAttribute('autocapitalize', 'none');
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/portal/acceso.test.ts tests/portal/formulario-acceso.test.tsx`
Expected: FAIL. `Cannot find module '../../lib/portal/acceso'`, y la etiqueta "Correo o usuario" no existe.

- [ ] **Step 3: Crear `lib/portal/acceso.ts`**

```ts
/** Dominio de las cuentas de Auth del sitio viejo (thecoffeemexico): `<usuario>@thecoffee.internal`. */
export const DOMINIO_USUARIOS = 'thecoffee.internal';

/**
 * Correo de Auth para lo que escribe la persona: un correo tal cual, o un usuario del sitio viejo
 * (`Ana.Lopez` → `ana.lopez@thecoffee.internal`). Null si no es ninguno de los dos.
 */
export function correoDeAcceso(entrada: string): string | null {
  const t = entrada.trim();
  if (!t) return null;
  if (t.includes('@')) return t;
  return /^[A-Za-z0-9._-]+$/.test(t) ? `${t.toLowerCase()}@${DOMINIO_USUARIOS}` : null;
}
```

- [ ] **Step 4: Usarla en `entrar`**

En `app/(auth)/login/actions.ts`, agregar `import { correoDeAcceso } from '@/lib/portal/acceso';` y reemplazar el cuerpo de `entrar` por:

```ts
export async function entrar(_: string, form: FormData) {
  const email = correoDeAcceso(String(form.get('email') ?? '')),
    password = String(form.get('password') ?? '');
  if (!email || !password) return 'Escribe tu correo o usuario y tu contraseña.';
  const db = await servidor();
  const r = await db.auth.signInWithPassword({ email, password });
  if (r.error) return 'No pudimos iniciar sesión. Revisa tu correo o usuario y tu contraseña.';
  redirect(rutaInterna(String(form.get('next') ?? '')));
}
```

- [ ] **Step 5: Cambiar el campo del formulario**

En `components/portal/formulario-acceso.tsx`, reemplazar el `<label>` del correo por:

```tsx
        <label>
          Correo o usuario
          <input
            name="email"
            type="text"
            autoComplete="username"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            required
          />
        </label>
```

- [ ] **Step 6: Correr pruebas, typecheck y formato**

Run: `npx vitest run tests/portal/acceso.test.ts tests/portal/formulario-acceso.test.tsx && npm run typecheck`
Expected: PASS.

```bash
npx prettier --write lib/portal/acceso.ts "app/(auth)/login/actions.ts" components/portal/formulario-acceso.tsx tests/portal/acceso.test.ts tests/portal/formulario-acceso.test.tsx
```

- [ ] **Step 7: Verificación visual**

Levantar el portal (`npm run dev`) y abrir `http://localhost:3000/login`. Confirmar en escritorio y en móvil (375 px) que la etiqueta dice "Correo o usuario", que el teclado móvil no capitaliza y que un usuario inválido (`ana lopez`) muestra el mensaje sin recargar.

- [ ] **Step 8: Commit**

```bash
git add lib/portal/acceso.ts "app/(auth)/login/actions.ts" components/portal/formulario-acceso.tsx tests/portal/acceso.test.ts tests/portal/formulario-acceso.test.tsx
git commit -m "feat(login): entrar con correo o usuario del sitio viejo"
```

---

### Task 5: Conexiones e inventario del esquema viejo

**Files:**
- Create: `scripts/migracion-legado/conexion.ts`
- Create: `scripts/migracion-legado/inventario-lib.ts`
- Create: `scripts/migracion-legado/inventario.ts`
- Modify: `.env.example` (variable `DATABASE_URL_LEGADO`)
- Test: `tests/migracion-legado/conexion.test.ts`, `tests/migracion-legado/inventario.test.ts`

**Interfaces:**
- Produces (en `conexion.ts`):
  - `PROYECTO_LEGADO = 'bliocjvqwskvoxrumqby'` y `PROYECTO_PORTAL = 'jpqkmnfjwzniptszjuli'`
  - `interface Consultor { query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }> }`
  - `verificarProyecto(url: string, proyecto: string): void`
  - `conLegado<T>(fn: (db: Consultor) => Promise<T>): Promise<T>`: solo lectura.
  - `enPortal<T>(fn: (db: Consultor) => Promise<T>): Promise<T>`: una transacción.
- Produces (en `inventario-lib.ts`): `type Usos`, `registrarUsos(usos, texto, origen)`, `areaDe(tabla)`, `inventarioMarkdown(tablas, usos, fecha)`, `redactar(texto)`.

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/migracion-legado/conexion.test.ts`:

```ts
import { expect, it } from 'vitest';
import { PROYECTO_LEGADO, PROYECTO_PORTAL, verificarProyecto } from '../../scripts/migracion-legado/conexion';

it('acepta la URL del pooler del proyecto esperado y rechaza otra', () => {
  const legado = `postgresql://postgres.${PROYECTO_LEGADO}:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  expect(() => verificarProyecto(legado, PROYECTO_LEGADO)).not.toThrow();
  expect(() => verificarProyecto(legado, PROYECTO_PORTAL)).toThrow(/no corresponde al proyecto/);
});

it('acepta la conexión directa db.<proyecto>.supabase.co', () => {
  expect(() =>
    verificarProyecto(`postgresql://postgres:x@db.${PROYECTO_PORTAL}.supabase.co:5432/postgres`, PROYECTO_PORTAL),
  ).not.toThrow();
});
```

`tests/migracion-legado/inventario.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  areaDe,
  inventarioMarkdown,
  redactar,
  registrarUsos,
  type Usos,
} from '../../scripts/migracion-legado/inventario-lib';

describe('registrarUsos', () => {
  it('distingue lecturas de escrituras y acepta cadenas en varias líneas y comillas dobles', () => {
    const usos: Usos = new Map();
    registrarUsos(usos, `sb.from('pedidos').select('id'); sb.from('pedidos')\n  .update({a:1})`, 'app');
    registrarUsos(usos, `db.from("com_minmax").upsert(filas)`, 'edge:com-minmax');
    expect([...usos.get('pedidos')!.lee]).toEqual(['app']);
    expect([...usos.get('pedidos')!.escribe]).toEqual(['app']);
    expect([...usos.get('com_minmax')!.escribe]).toEqual(['edge:com-minmax']);
  });
});

describe('areaDe', () => {
  it('asigna área por nombre y deja "Por asignar" lo desconocido', () => {
    expect(areaDe('com_catalogo')).toBe('Comercializadora');
    expect(areaDe('pedidos_apertura')).toBe('Aperturas');
    expect(areaDe('pedido_incidencias')).toBe('Pedidos');
    expect(areaDe('tabla_rara')).toBe('Por asignar');
  });
});

describe('inventarioMarkdown', () => {
  it('ordena por área, marca tablas sin RLS y lista referencias sin tabla', () => {
    const usos: Usos = new Map([
      ['com_catalogo', { lee: new Set(['app']), escribe: new Set(['edge:zoho-sync']) }],
      ['tabla_borrada', { lee: new Set(['app']), escribe: new Set() }],
    ]);
    const md = inventarioMarkdown(
      [
        { tabla: 'pedidos', filas: 10, rls: false },
        { tabla: 'com_catalogo', filas: 3, rls: true },
      ],
      usos,
      '2026-11-12',
    );
    const filas = md.split('\n').filter((l) => l.startsWith('| ') && !l.startsWith('| Área') && !l.startsWith('| ---'));
    expect(filas).toEqual([
      '| Comercializadora | `com_catalogo` | 3 | sí | app | edge:zoho-sync |  |',
      '| Pedidos | `pedidos` | 10 | **no** | — | — |  |',
    ]);
    expect(md).toContain('## Referencias en el código sin tabla en la base');
    expect(md).toContain('- `tabla_borrada`');
  });
});

describe('redactar', () => {
  it('quita JWT, llaves con prefijo y Bearer de las definiciones', () => {
    const def = `headers := '{"Authorization":"Bearer abc.def-123"}'; k := 'eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.c2lnbmF0dXJh'; s := 'sk_live_51Hxyz'`;
    const r = redactar(def);
    expect(r).not.toMatch(/abc\.def-123|eyJhbGci|sk_live_51Hxyz/);
    expect(r.match(/\[REDACTADO\]/g)).toHaveLength(3);
  });
  it('no toca texto normal', () => {
    expect(redactar('select * from com_catalogo')).toBe('select * from com_catalogo');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/migracion-legado`
Expected: FAIL con `Cannot find module` para los dos archivos.

- [ ] **Step 3: Crear `scripts/migracion-legado/conexion.ts`**

```ts
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';

export const PROYECTO_LEGADO = 'bliocjvqwskvoxrumqby';
export const PROYECTO_PORTAL = 'jpqkmnfjwzniptszjuli';

/** Lo mínimo que comparten pg.Client y PGlite; los scripts y sus pruebas usan solo esto. */
export interface Consultor {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

/** Corta antes de conectar si la URL no es del proyecto esperado. Nunca imprime la URL. */
export function verificarProyecto(url: string, proyecto: string): void {
  const u = new URL(url);
  if (!(u.username.endsWith(`.${proyecto}`) || u.hostname.includes(proyecto)))
    throw new Error(`La URL no corresponde al proyecto ${proyecto}; no se conecta`);
}

async function conectar(variable: string, proyecto: string, aplicacion: string): Promise<pg.Client> {
  const url = (await leerEnvLocal()).get(variable);
  if (!url) throw new Error(`Falta ${variable} en .env.local`);
  verificarProyecto(url, proyecto);
  const c = new pg.Client({ connectionString: url, application_name: aplicacion });
  await c.connect();
  return c;
}

/** bliocjvq en SOLO LECTURA: begin read only y siempre rollback. */
export async function conLegado<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  const c = await conectar('DATABASE_URL_LEGADO', PROYECTO_LEGADO, 'migracion-legado-lectura');
  try {
    await c.query('begin read only');
    await c.query("set local statement_timeout = '60s'");
    return await fn(c as unknown as Consultor);
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
}

/** Portal en UNA transacción, con origen 'migracion' para la bitácora. Confirma solo si fn termina sin error. */
export async function enPortal<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  const c = await conectar('DATABASE_URL', PROYECTO_PORTAL, 'migracion-legado-escritura');
  try {
    await c.query('begin');
    await c.query("set local app.origen = 'migracion'");
    const r = await fn(c as unknown as Consultor);
    await c.query('commit');
    return r;
  } catch (e) {
    await c.query('rollback').catch(() => {});
    throw e;
  } finally {
    await c.end();
  }
}
```

- [ ] **Step 4: Crear `scripts/migracion-legado/inventario-lib.ts`**

```ts
export type Usos = Map<string, { lee: Set<string>; escribe: Set<string> }>;
export interface TablaLegado {
  tabla: string;
  filas: number;
  rls: boolean;
}

const LLAMADA = /\.from\(\s*['"]([a-z_][a-z0-9_]*)['"]\s*\)\s*\.(select|insert|update|upsert|delete)\b/g;

/** Agrega a `usos` las tablas que toca `texto` (`origen`: 'app', 'edge:<función>', 'netlify:<archivo>'). */
export function registrarUsos(usos: Usos, texto: string, origen: string): void {
  for (const m of texto.matchAll(LLAMADA)) {
    const u = usos.get(m[1]) ?? { lee: new Set<string>(), escribe: new Set<string>() };
    (m[2] === 'select' ? u.lee : u.escribe).add(origen);
    usos.set(m[1], u);
  }
}

// El orden importa: la primera regla que coincide gana (pedidos_apertura es de Aperturas, no de Pedidos).
const AREAS: [RegExp, string][] = [
  [/^com_/, 'Comercializadora'],
  [/^(aperturas|franquiciado_aperturas|pedidos_apertura)$/, 'Aperturas'],
  [/^(pedidos|pedido_)/, 'Pedidos'],
  [/^crm_/, 'CRM prospectos'],
  [/^chat_/, 'Chat'],
  [/^(regalias_|app_liquidaciones)/, 'Regalías'],
  [/^encuesta/, 'Encuestas'],
  [/^(marketing_|campanas)/, 'Marketing'],
  [/^seguimiento/, 'Seguimientos'],
  [/^(usuarios|proveedores_contactos)$/, 'Usuarios y accesos'],
];

export const areaDe = (tabla: string): string => AREAS.find(([re]) => re.test(tabla))?.[1] ?? 'Por asignar';

export function inventarioMarkdown(tablas: TablaLegado[], usos: Usos, fecha: string): string {
  const lista = (s?: Set<string>) => (s && s.size ? [...s].sort().join(', ') : '—');
  const filas = [...tablas]
    .sort((a, b) => areaDe(a.tabla).localeCompare(areaDe(b.tabla), 'es') || a.tabla.localeCompare(b.tabla))
    .map((t) => {
      const u = usos.get(t.tabla);
      return `| ${areaDe(t.tabla)} | \`${t.tabla}\` | ${t.filas} | ${t.rls ? 'sí' : '**no**'} | ${lista(u?.lee)} | ${lista(u?.escribe)} |  |`;
    });
  const huerfanas = [...usos.keys()].filter((k) => !tablas.some((t) => t.tabla === k)).sort();
  return [
    '# Inventario de tablas de thecoffeemexico (bliocjvq)',
    '',
    `Generado el ${fecha} con \`scripts/migracion-legado/inventario.ts\`. "Lee" y "Escribe" salen del código del repo`,
    'thecoffee-comercializadora; n8n y Apps Script que escriben por API no aparecen. La columna **Cruce con el portal**',
    'se llena a mano (por ejemplo: `crm_prospectos` ↔ `crm_*` del portal).',
    '',
    '| Área | Tabla | Filas | RLS | Lee | Escribe | Cruce con el portal |',
    '| --- | --- | --- | --- | --- | --- | --- |',
    ...filas,
    ...(huerfanas.length
      ? ['', '## Referencias en el código sin tabla en la base', '', ...huerfanas.map((h) => `- \`${h}\``)]
      : []),
    '',
  ].join('\n');
}

const SECRETOS: RegExp[] = [
  /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g, // JWT
  /\b(sk|pk|rk)_(live|test)_[A-Za-z0-9]{6,}/g, // llaves con prefijo
  /(Bearer\s+)[A-Za-z0-9._~+/=-]{6,}/g, // encabezados Authorization
];

/** Quita secretos incrustados en definiciones de funciones antes de guardarlas en el repo. */
export function redactar(texto: string): string {
  return SECRETOS.reduce(
    (t, re) => t.replace(re, (_m, g1) => (typeof g1 === 'string' && /^Bearer/.test(g1) ? `${g1}[REDACTADO]` : '[REDACTADO]')),
    texto,
  );
}
```

- [ ] **Step 5: Correr las pruebas y verificar que pasan**

Run: `npx vitest run tests/migracion-legado`
Expected: PASS (7 pruebas).

- [ ] **Step 6: Crear el script `scripts/migracion-legado/inventario.ts`**

```ts
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { basename, join, relative } from 'node:path';
import { conLegado } from './conexion';
import { inventarioMarkdown, redactar, registrarUsos, type TablaLegado, type Usos } from './inventario-lib';

/**
 * Fase 0.1 · Esquema real de bliocjvq (solo catálogo, ninguna fila) e inventario de tablas con quién las usa.
 *   npx tsx scripts/migracion-legado/inventario.ts <ruta del repo thecoffee-comercializadora>
 * Escribe docs/migracion/esquema-legado.json y docs/migracion/inventario-tablas.md.
 */
const repo = process.argv[2];
if (!repo) throw new Error('Uso: inventario.ts <ruta del repo thecoffee-comercializadora>');

async function archivos(dir: string, ext: RegExp): Promise<string[]> {
  const salida: string[] = [];
  for (const e of await readdir(dir, { withFileTypes: true }).catch(() => [])) {
    if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
    const ruta = join(dir, e.name);
    if (e.isDirectory()) salida.push(...(await archivos(ruta, ext)));
    else if (ext.test(e.name)) salida.push(ruta);
  }
  return salida;
}

const usos: Usos = new Map();
registrarUsos(usos, await readFile(join(repo, 'app/index.html'), 'utf8'), 'app');
const funciones = join(repo, 'supabase/functions');
for (const f of await archivos(funciones, /\.ts$/))
  registrarUsos(usos, await readFile(f, 'utf8'), `edge:${relative(funciones, f).split(/[\\/]/)[0]}`);
for (const f of await archivos(join(repo, 'netlify'), /\.(mjs|js|gs)$/))
  registrarUsos(usos, await readFile(f, 'utf8'), `netlify:${basename(f)}`);

const esquema = await conLegado(async (db) => {
  const q = async (sql: string) => (await db.query(sql)).rows;
  const tablas = (await db.query<{ tabla: string; tipo: string; rls: boolean }>(`
    select c.relname as tabla, c.relkind as tipo, c.relrowsecurity as rls
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p') order by 1`)).rows;
  const conteos: Record<string, number> = {};
  for (const t of tablas.filter((t) => t.tipo === 'r' || t.tipo === 'p'))
    conteos[t.tabla] = Number(
      (await db.query<{ n: string }>(`select count(*)::bigint as n from public."${t.tabla.replace(/"/g, '""')}"`)).rows[0].n,
    );
  const r = {
    tablas,
    conteos,
    columnas: await q(`
      select table_name as tabla, column_name as col, data_type as tipo, is_nullable as nulo, column_default as defecto
      from information_schema.columns where table_schema = 'public' order by table_name, ordinal_position`),
    restricciones: await q(`
      select conrelid::regclass::text as tabla, conname as nombre, pg_get_constraintdef(oid) as def
      from pg_constraint where connamespace = 'public'::regnamespace order by 1, 2`),
    indices: await q(`
      select tablename as tabla, indexname as indice, indexdef as def from pg_indexes
      where schemaname = 'public' order by 1, 2`),
    politicas: await q(`
      select tablename as tabla, policyname as politica, cmd, roles::text as roles, qual, with_check
      from pg_policies where schemaname = 'public' order by 1, 2`),
    funciones: (
      await db.query<{ nombre: string; args: string; security_definer: boolean; def: string }>(`
        select p.proname as nombre, pg_get_function_identity_arguments(p.oid) as args,
               p.prosecdef as security_definer, pg_get_functiondef(p.oid) as def
        from pg_proc p where p.pronamespace = 'public'::regnamespace and p.prokind = 'f' order by 1, 2`)
    ).rows.map((f) => ({ ...f, def: redactar(f.def) })),
    triggers: await q(`
      select event_object_table as tabla, trigger_name as nombre, action_timing as momento,
             event_manipulation as evento, action_statement as accion
      from information_schema.triggers where trigger_schema = 'public' order by 1, 2`),
    // Al final: si pg_cron no existe, la consulta aborta la transacción y ya no queda nada por leer.
    cron: await q(`select jobname, schedule, command, active from cron.job order by jobname`)
      .then((filas) => filas.map((f) => ({ ...f, command: redactar(String(f.command)) })))
      .catch(() => [] as Record<string, unknown>[]),
  };
  return r;
});

const fecha = new Date().toISOString().slice(0, 10);
const tablas: TablaLegado[] = esquema.tablas
  .filter((t) => t.tipo === 'r' || t.tipo === 'p')
  .map((t) => ({ tabla: t.tabla, filas: esquema.conteos[t.tabla] ?? 0, rls: t.rls }));
await mkdir('docs/migracion', { recursive: true });
await writeFile('docs/migracion/esquema-legado.json', `${JSON.stringify({ fecha, ...esquema }, null, 2)}\n`);
await writeFile('docs/migracion/inventario-tablas.md', inventarioMarkdown(tablas, usos, fecha));
console.log(`Inventario: ${tablas.length} tablas, ${usos.size} referenciadas en código. Revisa el JSON antes de commitear.`);
```

- [ ] **Step 7: Documentar la variable**

Agregar al final de `.env.example`:

```
# Solo scripts/migracion-legado (nunca NEXT_PUBLIC). Conexión postgres del proyecto viejo bliocjvq.
DATABASE_URL_LEGADO=
```

- [ ] **Step 8: Typecheck y commit**

Run: `npm run typecheck`
Expected: sin errores.

```bash
git add scripts/migracion-legado/conexion.ts scripts/migracion-legado/inventario-lib.ts scripts/migracion-legado/inventario.ts .env.example tests/migracion-legado/conexion.test.ts tests/migracion-legado/inventario.test.ts
git commit -m "feat(migracion): conexiones seguras e inventario del esquema de thecoffeemexico"
```

---

### Task 6: Plan de importación de usuarios (lógica pura)

**Files:**
- Create: `scripts/migracion-legado/usuarios-lib.ts`
- Test: `tests/migracion-legado/usuarios-plan.test.ts`

**Interfaces:**
- Produces:

```ts
export type RolPortal = 'interno' | 'franquiciado' | 'proveedor';
export interface UsuarioLegado {
  id: string; auth_uid: string | null; username: string; nombre: string; correo: string | null; rol: string;
  subtipo: string | null; supplier_key: string | null; parent_id: string | null; permisos: unknown; activo: boolean;
}
export interface CuentaPortal { id: string; email: string }
export interface VinculoExistente { legado_id: string; user_id: string; origen: 'creado' | 'vinculado' }
export type Accion =
  | { tipo: 'crear'; usuario: UsuarioLegado; rol: RolPortal }
  | { tipo: 'vincular'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'actualizar_clave'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'sin_cambios'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'omitir'; usuario: UsuarioLegado; motivo: 'sin_cuenta_auth' | 'id_ocupado' | 'correo_repetido' };
export function rolPortal(rolLegado: string): RolPortal;
export function planUsuarios(legado: UsuarioLegado[], portal: CuentaPortal[], vinculos: VinculoExistente[]): Accion[];
export function resumenPlan(acciones: Accion[]): string;
```

- [ ] **Step 1: Escribir las pruebas que fallan**

`tests/migracion-legado/usuarios-plan.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  planUsuarios,
  resumenPlan,
  rolPortal,
  type UsuarioLegado,
} from '../../scripts/migracion-legado/usuarios-lib';

const u = (o: Partial<UsuarioLegado> & Pick<UsuarioLegado, 'id' | 'username'>): UsuarioLegado => ({
  auth_uid: null, nombre: o.username, correo: null, rol: 'comercial', subtipo: null, supplier_key: null,
  parent_id: null, permisos: null, activo: true, ...o,
});
const UID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('rolPortal', () => {
  it('franquiciado y proveedor se conservan; todo lo demás es interno', () => {
    expect(rolPortal('franquiciado')).toBe('franquiciado');
    expect(rolPortal('proveedor')).toBe('proveedor');
    for (const r of ['admin', 'ceo', 'comercial', 'supply', 'comercializadora', 'raro']) expect(rolPortal(r)).toBe('interno');
  });
});

describe('planUsuarios', () => {
  it('crea cuentas nuevas con el mismo id de Auth y rol sin Costeo, también si están inactivas', () => {
    const plan = planUsuarios([u({ id: '1', username: 'ana', auth_uid: UID(1), rol: 'franquiciado', activo: false })], [], []);
    expect(plan).toEqual([{ tipo: 'crear', usuario: expect.objectContaining({ id: '1' }), rol: 'franquiciado' }]);
  });

  it('vincula por correo sin importar mayúsculas, aunque el admin del sitio viejo sea admin', () => {
    const plan = planUsuarios(
      [u({ id: '2', username: 'sebas', auth_uid: UID(2), rol: 'admin', correo: ' Sebastian@Ejemplo.MX ' })],
      [{ id: UID(90), email: 'sebastian@ejemplo.mx' }],
      [],
    );
    expect(plan).toEqual([{ tipo: 'vincular', usuario: expect.objectContaining({ id: '2' }), userId: UID(90) }]);
  });

  it('dos usuarios viejos con el mismo correo: el segundo se omite', () => {
    const plan = planUsuarios(
      [
        u({ id: '3', username: 'a', auth_uid: UID(3), correo: 'x@ejemplo.mx' }),
        u({ id: '4', username: 'b', auth_uid: UID(4), correo: 'X@ejemplo.mx' }),
      ],
      [{ id: UID(91), email: 'x@ejemplo.mx' }],
      [],
    );
    expect(plan.map((a) => a.tipo)).toEqual(['vincular', 'omitir']);
    expect(plan[1]).toMatchObject({ motivo: 'correo_repetido' });
  });

  it('sin cuenta de Auth en el sitio viejo y sin correo del portal: se omite', () => {
    expect(planUsuarios([u({ id: '5', username: 'c' })], [], [])).toEqual([
      { tipo: 'omitir', usuario: expect.objectContaining({ id: '5' }), motivo: 'sin_cuenta_auth' },
    ]);
  });

  it('si el id de Auth ya existe en el portal con otro correo, se omite', () => {
    const plan = planUsuarios([u({ id: '6', username: 'd', auth_uid: UID(6) })], [{ id: UID(6), email: 'otro@ejemplo.mx' }], []);
    expect(plan[0]).toMatchObject({ tipo: 'omitir', motivo: 'id_ocupado' });
  });

  it('en una segunda corrida actualiza la clave de las cuentas creadas y no toca las vinculadas', () => {
    const plan = planUsuarios(
      [u({ id: '7', username: 'e', auth_uid: UID(7) }), u({ id: '8', username: 'f', auth_uid: UID(8) })],
      [{ id: UID(7), email: 'e@thecoffee.internal' }, { id: UID(92), email: 'f@ejemplo.mx' }],
      [
        { legado_id: '7', user_id: UID(7), origen: 'creado' },
        { legado_id: '8', user_id: UID(92), origen: 'vinculado' },
      ],
    );
    expect(plan.map((a) => a.tipo)).toEqual(['actualizar_clave', 'sin_cambios']);
  });
});

describe('resumenPlan', () => {
  it('cuenta por tipo y lista usuarios omitidos con su motivo, sin correos', () => {
    const texto = resumenPlan(
      planUsuarios(
        [u({ id: '1', username: 'ana', auth_uid: UID(1) }), u({ id: '5', username: 'c', correo: 'c@ejemplo.mx' })],
        [],
        [],
      ),
    );
    expect(texto).toContain('crear: 1');
    expect(texto).toContain('omitir: 1');
    expect(texto).toContain('c (sin_cuenta_auth)');
    expect(texto).not.toContain('c@ejemplo.mx');
  });
});
```

- [ ] **Step 2: Correr y verificar que fallan**

Run: `npx vitest run tests/migracion-legado/usuarios-plan.test.ts`
Expected: FAIL con `Cannot find module`.

- [ ] **Step 3: Crear `scripts/migracion-legado/usuarios-lib.ts`**

```ts
export type RolPortal = 'interno' | 'franquiciado' | 'proveedor';

/** Fila de public.usuarios en bliocjvq (ids como texto para no depender de su tipo). */
export interface UsuarioLegado {
  id: string;
  auth_uid: string | null;
  username: string;
  nombre: string;
  correo: string | null;
  rol: string;
  subtipo: string | null;
  supplier_key: string | null;
  parent_id: string | null;
  permisos: unknown;
  activo: boolean;
}
export interface CuentaPortal {
  id: string;
  email: string;
}
export interface VinculoExistente {
  legado_id: string;
  user_id: string;
  origen: 'creado' | 'vinculado';
}
export type Accion =
  | { tipo: 'crear'; usuario: UsuarioLegado; rol: RolPortal }
  | { tipo: 'vincular'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'actualizar_clave'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'sin_cambios'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'omitir'; usuario: UsuarioLegado; motivo: 'sin_cuenta_auth' | 'id_ocupado' | 'correo_repetido' };

/** El portal no hereda roles internos del sitio viejo: el admin asigna roles de Costeo y módulos. */
export const rolPortal = (rolLegado: string): RolPortal =>
  rolLegado === 'franquiciado' ? 'franquiciado' : rolLegado === 'proveedor' ? 'proveedor' : 'interno';

/**
 * Qué hacer con cada usuario del sitio viejo, en este orden:
 * 1. Ya vinculado: si la cuenta la creó el importador, se actualiza la clave; si se vinculó a una cuenta previa, nada.
 * 2. Su correo ya es cuenta del portal: se vincula (una sola vez por cuenta).
 * 3. Sin cuenta de Auth en el sitio viejo: se omite (hay que restablecerle la contraseña).
 * 4. Su id de Auth ya existe en el portal: se omite y se revisa a mano.
 * 5. Si no: se crea con el mismo id y hash de contraseña.
 */
export function planUsuarios(
  legado: UsuarioLegado[],
  portal: CuentaPortal[],
  vinculos: VinculoExistente[],
): Accion[] {
  const porCorreo = new Map(portal.map((c) => [c.email.trim().toLowerCase(), c.id]));
  const ids = new Set(portal.map((c) => c.id));
  const vinculados = new Map(vinculos.map((v) => [v.legado_id, v]));
  const usados = new Set(vinculos.map((v) => v.user_id));
  return legado.map((usuario): Accion => {
    const v = vinculados.get(usuario.id);
    if (v)
      return v.origen === 'creado'
        ? { tipo: 'actualizar_clave', usuario, userId: v.user_id }
        : { tipo: 'sin_cambios', usuario, userId: v.user_id };
    const porMail = usuario.correo ? porCorreo.get(usuario.correo.trim().toLowerCase()) : undefined;
    if (porMail) {
      if (usados.has(porMail)) return { tipo: 'omitir', usuario, motivo: 'correo_repetido' };
      usados.add(porMail);
      return { tipo: 'vincular', usuario, userId: porMail };
    }
    if (!usuario.auth_uid) return { tipo: 'omitir', usuario, motivo: 'sin_cuenta_auth' };
    if (ids.has(usuario.auth_uid)) return { tipo: 'omitir', usuario, motivo: 'id_ocupado' };
    return { tipo: 'crear', usuario, rol: rolPortal(usuario.rol) };
  });
}

/** Resumen para la consola: conteos y omitidos por usuario. Sin correos, ids ni hashes. */
export function resumenPlan(acciones: Accion[]): string {
  const conteo = new Map<string, number>();
  for (const a of acciones) conteo.set(a.tipo, (conteo.get(a.tipo) ?? 0) + 1);
  const omitidos = acciones
    .filter((a): a is Extract<Accion, { tipo: 'omitir' }> => a.tipo === 'omitir')
    .map((a) => `  - ${a.usuario.username} (${a.motivo})`);
  return [
    ...['crear', 'vincular', 'actualizar_clave', 'sin_cambios', 'omitir'].map((t) => `${t}: ${conteo.get(t) ?? 0}`),
    ...(omitidos.length ? ['Omitidos:', ...omitidos] : []),
  ].join('\n');
}
```

- [ ] **Step 4: Correr y verificar que pasan**

Run: `npx vitest run tests/migracion-legado/usuarios-plan.test.ts`
Expected: PASS (8 pruebas).

- [ ] **Step 5: Commit**

```bash
git add scripts/migracion-legado/usuarios-lib.ts tests/migracion-legado/usuarios-plan.test.ts
git commit -m "feat(migracion): plan de importación de usuarios del sitio viejo"
```

---

### Task 7: Aplicar el plan de usuarios en la base del portal

**Files:**
- Modify: `scripts/db/shim-supabase.sql` (columnas de `auth.users` y tabla `auth.identities`)
- Create: `scripts/migracion-legado/usuarios-aplicar.ts`
- Test: `tests/migracion-legado/usuarios-aplicar.test.ts`

**Interfaces:**
- Consumes: `Consultor` (Tarea 5), `Accion`, `UsuarioLegado`, `CuentaPortal`, `VinculoExistente`, `planUsuarios` (Tarea 6) y la tabla `migracion_legado.usuarios` (Tarea 1).
- Produces:

```ts
export interface CuentaAuthLegado { usuario: Record<string, unknown>; identidades: Record<string, unknown>[] }
export function leerEstadoPortal(db: Consultor): Promise<{ cuentas: CuentaPortal[]; vinculos: VinculoExistente[] }>;
export function aplicarPlan(db: Consultor, acciones: Accion[], auth: Map<string, CuentaAuthLegado>): Promise<void>;
```

- [ ] **Step 1: Ampliar el shim de Auth**

En `scripts/db/shim-supabase.sql`, reemplazar la línea `create table auth.users (id uuid primary key, email text);` por:

```sql
create table auth.users (id uuid primary key, email text, encrypted_password text, raw_user_meta_data jsonb);
-- Como en GoTrue: una identidad 'email' por cuenta; `email` es generada (el importador no debe escribirla).
create table auth.identities (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  identity_data jsonb not null,
  email text generated always as (lower(identity_data ->> 'email')) stored
);
```

- [ ] **Step 2: Correr la suite de base de datos con el shim nuevo**

Run: `npx vitest run tests/db`
Expected: PASS. Las columnas nuevas son opcionales y `crearUsuario` sigue insertando `(id, email)`.

- [ ] **Step 3: Escribir la prueba que falla**

`tests/migracion-legado/usuarios-aplicar.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import {
  aplicarPlan,
  leerEstadoPortal,
  type CuentaAuthLegado,
} from '../../scripts/migracion-legado/usuarios-aplicar';
import { planUsuarios, type UsuarioLegado } from '../../scripts/migracion-legado/usuarios-lib';

const UID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
const SEBAS_PORTAL = UID(90);
const ANA = UID(1);

const legado: UsuarioLegado[] = [
  {
    id: '10', auth_uid: ANA, username: 'ana', nombre: 'Ana López', correo: null, rol: 'franquiciado',
    subtipo: 'operador', supplier_key: null, parent_id: '11', permisos: { pedidos: true }, activo: true,
  },
  {
    id: '12', auth_uid: UID(2), username: 'sebas', nombre: 'Sebastián', correo: 'Sebastian@Ejemplo.mx', rol: 'admin',
    subtipo: null, supplier_key: null, parent_id: null, permisos: null, activo: true,
  },
];

const cuentaAna = (hash: string): CuentaAuthLegado => ({
  usuario: {
    id: ANA, email: 'ana@thecoffee.internal', encrypted_password: hash,
    raw_user_meta_data: { username: 'ana' }, columna_que_el_portal_no_tiene: 'x',
  },
  identidades: [
    {
      id: UID(3), user_id: ANA, provider: 'email', provider_id: ANA,
      identity_data: { sub: ANA, email: 'ana@thecoffee.internal' }, email: 'ana@thecoffee.internal',
    },
  ],
});

let db: PGlite;
const c = () => db as unknown as Consultor;
const correr = async (hash: string) => {
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  await aplicarPlan(c(), planUsuarios(legado, cuentas, vinculos), new Map([[ANA, cuentaAna(hash)]]));
};

beforeEach(async () => {
  db = await crearDbLocal();
  await db.query(`insert into auth.users (id, email) values ($1, 'sebastian@ejemplo.mx')`, [SEBAS_PORTAL]);
  await db.query(`insert into perfiles (user_id, nombre, rol) values ($1, 'Sebastián', 'admin')`, [SEBAS_PORTAL]);
});

it('crea la cuenta con su hash e identidad, perfil sin Costeo, y vincula al que ya existía', async () => {
  await correr('$2a$10$hashA');
  const ana = await db.query(`select email, encrypted_password from auth.users where id = $1`, [ANA]);
  expect(ana.rows).toEqual([{ email: 'ana@thecoffee.internal', encrypted_password: '$2a$10$hashA' }]);
  const ident = await db.query(`select provider, email from auth.identities where user_id = $1`, [ANA]);
  expect(ident.rows).toEqual([{ provider: 'email', email: 'ana@thecoffee.internal' }]);
  const perfiles = await db.query(`select user_id, rol from perfiles order by rol`);
  expect(perfiles.rows).toEqual([
    { user_id: SEBAS_PORTAL, rol: 'admin' },
    { user_id: ANA, rol: 'franquiciado' },
  ]);
  const vinculos = await db.query(
    `select legado_id, user_id, origen, subtipo, parent_legado_id from migracion_legado.usuarios order by legado_id`,
  );
  expect(vinculos.rows).toEqual([
    { legado_id: '10', user_id: ANA, origen: 'creado', subtipo: 'operador', parent_legado_id: '11' },
    { legado_id: '12', user_id: SEBAS_PORTAL, origen: 'vinculado', subtipo: null, parent_legado_id: null },
  ]);
  expect((await db.query(`select count(*)::int as n from auth.users`)).rows[0]).toEqual({ n: 2 });
});

it('una segunda corrida actualiza la contraseña sin duplicar nada', async () => {
  await correr('$2a$10$hashA');
  await correr('$2a$10$hashB');
  const ana = await db.query(`select encrypted_password from auth.users where id = $1`, [ANA]);
  expect(ana.rows).toEqual([{ encrypted_password: '$2a$10$hashB' }]);
  const n = await db.query(`
    select (select count(*) from auth.users)::int as cuentas, (select count(*) from auth.identities)::int as identidades,
           (select count(*) from perfiles)::int as perfiles, (select count(*) from migracion_legado.usuarios)::int as vinculos`);
  expect(n.rows[0]).toEqual({ cuentas: 2, identidades: 1, perfiles: 2, vinculos: 2 });
});

it('si falta la cuenta de Auth de un usuario a crear, falla sin dejar nada a medias', async () => {
  await db.exec('begin');
  const { cuentas, vinculos } = await leerEstadoPortal(c());
  await expect(aplicarPlan(c(), planUsuarios(legado, cuentas, vinculos), new Map())).rejects.toThrow(
    'Falta la cuenta de Auth de ana',
  );
  await db.exec('rollback');
  expect((await db.query(`select count(*)::int as n from migracion_legado.usuarios`)).rows[0]).toEqual({ n: 0 });
});
```

- [ ] **Step 4: Correr y verificar que falla**

Run: `npx vitest run tests/migracion-legado/usuarios-aplicar.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion-legado/usuarios-aplicar'`.

- [ ] **Step 5: Crear `scripts/migracion-legado/usuarios-aplicar.ts`**

```ts
import type { Consultor } from './conexion';
import type { Accion, CuentaPortal, UsuarioLegado, VinculoExistente } from './usuarios-lib';

/** Fila de auth.users del sitio viejo y sus auth.identities, tal como vienen de la base. */
export interface CuentaAuthLegado {
  usuario: Record<string, unknown>;
  identidades: Record<string, unknown>[];
}

export async function leerEstadoPortal(
  db: Consultor,
): Promise<{ cuentas: CuentaPortal[]; vinculos: VinculoExistente[] }> {
  const cuentas = (await db.query<CuentaPortal>(`select id::text as id, coalesce(email, '') as email from auth.users`)).rows;
  const vinculos = (
    await db.query<VinculoExistente>(
      `select legado_id, user_id::text as user_id, origen from migracion_legado.usuarios`,
    )
  ).rows;
  return { cuentas, vinculos };
}

/** Columnas escribibles (no generadas) de una tabla del portal: las versiones de GoTrue pueden diferir. */
async function columnas(db: Consultor, esquema: string, tabla: string): Promise<Set<string>> {
  const r = await db.query<{ c: string }>(
    `select column_name as c from information_schema.columns
     where table_schema = $1 and table_name = $2 and is_generated = 'NEVER'`,
    [esquema, tabla],
  );
  return new Set(r.rows.map((f) => f.c));
}

async function insertar(db: Consultor, tabla: string, permitidas: Set<string>, fila: Record<string, unknown>) {
  const cols = Object.keys(fila).filter((c) => permitidas.has(c));
  await db.query(
    `insert into ${tabla} (${cols.map((c) => `"${c}"`).join(', ')}) values (${cols.map((_, i) => `$${i + 1}`).join(', ')})`,
    cols.map((c) => fila[c]),
  );
}

async function guardarVinculo(db: Consultor, u: UsuarioLegado, userId: string, origen: 'creado' | 'vinculado') {
  await db.query(
    `insert into migracion_legado.usuarios
       (legado_id, auth_uid_legado, user_id, username, correo, rol_legado, subtipo, supplier_key, parent_legado_id,
        permisos, activo_legado, origen)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
     on conflict (legado_id) do update set
       auth_uid_legado = excluded.auth_uid_legado, username = excluded.username, correo = excluded.correo,
       rol_legado = excluded.rol_legado, subtipo = excluded.subtipo, supplier_key = excluded.supplier_key,
       parent_legado_id = excluded.parent_legado_id, permisos = excluded.permisos,
       activo_legado = excluded.activo_legado, actualizado_en = now()`,
    [
      u.id, u.auth_uid, userId, u.username, u.correo, u.rol, u.subtipo, u.supplier_key, u.parent_id,
      u.permisos === null || u.permisos === undefined ? null : JSON.stringify(u.permisos), u.activo, origen,
    ],
  );
}

/**
 * Aplica el plan dentro de la transacción de `db` (enPortal). No hace commit ni rollback: si algo falla, lanza y el
 * llamador revierte todo. Nunca imprime filas de Auth.
 */
export async function aplicarPlan(
  db: Consultor,
  acciones: Accion[],
  auth: Map<string, CuentaAuthLegado>,
): Promise<void> {
  const colsUsuarios = await columnas(db, 'auth', 'users');
  const colsIdentidades = await columnas(db, 'auth', 'identities');
  for (const a of acciones) {
    const u = a.usuario;
    switch (a.tipo) {
      case 'crear': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        if (!cuenta) throw new Error(`Falta la cuenta de Auth de ${u.username}`);
        await insertar(db, 'auth.users', colsUsuarios, cuenta.usuario);
        for (const i of cuenta.identidades) await insertar(db, 'auth.identities', colsIdentidades, i);
        await db.query(`insert into public.perfiles (user_id, nombre, rol, activo) values ($1, $2, $3, $4)`, [
          u.auth_uid, u.nombre, a.rol, u.activo,
        ]);
        await guardarVinculo(db, u, u.auth_uid!, 'creado');
        break;
      }
      case 'vincular':
        await guardarVinculo(db, u, a.userId, 'vinculado');
        break;
      case 'actualizar_clave': {
        const cuenta = u.auth_uid ? auth.get(u.auth_uid) : undefined;
        if (cuenta)
          await db.query(`update auth.users set encrypted_password = $2 where id = $1`, [
            a.userId, cuenta.usuario.encrypted_password,
          ]);
        await guardarVinculo(db, u, a.userId, 'creado');
        break;
      }
      case 'sin_cambios':
        await guardarVinculo(db, u, a.userId, 'vinculado');
        break;
      case 'omitir':
        break;
    }
  }
}
```

- [ ] **Step 6: Correr y verificar que pasa**

Run: `npx vitest run tests/migracion-legado/usuarios-aplicar.test.ts`
Expected: PASS (3 pruebas). Si PGlite rechaza el parámetro jsonb de `identity_data` o `raw_user_meta_data` como objeto, se serializa en `insertar` con `typeof v === 'object' && v !== null && !(v instanceof Date) ? JSON.stringify(v) : v`. Se ajusta ahí, no en la prueba.

- [ ] **Step 7: Commit**

```bash
git add scripts/db/shim-supabase.sql scripts/migracion-legado/usuarios-aplicar.ts tests/migracion-legado/usuarios-aplicar.test.ts
git commit -m "feat(migracion): aplicar el plan de usuarios conservando id y contraseña"
```

---

### Task 8: Script de usuarios y guía de operación

**Files:**
- Create: `scripts/migracion-legado/usuarios.ts`
- Create: `docs/migracion/fase-0.md`

**Interfaces:**
- Consumes: `conLegado`, `enPortal` (Tarea 5), `planUsuarios`, `resumenPlan`, `UsuarioLegado` (Tarea 6), `aplicarPlan`, `leerEstadoPortal`, `CuentaAuthLegado` (Tarea 7).

- [ ] **Step 1: Crear `scripts/migracion-legado/usuarios.ts`**

```ts
import { conLegado, enPortal } from './conexion';
import { aplicarPlan, leerEstadoPortal, type CuentaAuthLegado } from './usuarios-aplicar';
import { planUsuarios, resumenPlan, type UsuarioLegado } from './usuarios-lib';

/**
 * Fase 0.3 · Usuarios de thecoffeemexico → portal. Simulación por omisión; escribe solo con --aplicar.
 *   npx tsx scripts/migracion-legado/usuarios.ts [--aplicar]
 * Lee bliocjvq en solo lectura (DATABASE_URL_LEGADO) y escribe el portal en UNA transacción (DATABASE_URL).
 * Nunca imprime correos, ids ni hashes: solo conteos y usernames omitidos.
 */
const aplicar = process.argv.includes('--aplicar');

class SimulacionTerminada extends Error {}

/** Lee el estado del portal en una transacción que se revierte siempre (la simulación no escribe). */
async function leerPortalSinEscribir() {
  let estado: Awaited<ReturnType<typeof leerEstadoPortal>> | undefined;
  await enPortal(async (db) => {
    estado = await leerEstadoPortal(db);
    throw new SimulacionTerminada();
  }).catch((e) => {
    if (!(e instanceof SimulacionTerminada)) throw e;
  });
  return estado!;
}

const { legado, auth } = await conLegado(async (db) => {
  const usuarios = (
    await db.query<UsuarioLegado>(`
      select id::text as id, auth_uid::text as auth_uid, username, nombre, correo, rol, subtipo, supplier_key,
             parent_id::text as parent_id, permisos, coalesce(activo, false) as activo
      from public.usuarios order by username`)
  ).rows;
  const uids = usuarios.map((u) => u.auth_uid).filter((x): x is string => !!x);
  const cuentas = (await db.query(`select * from auth.users where id = any($1::uuid[])`, [uids])).rows;
  const identidades = (await db.query(`select * from auth.identities where user_id = any($1::uuid[])`, [uids])).rows;
  const auth = new Map<string, CuentaAuthLegado>(
    cuentas.map((c) => [
      String(c.id),
      { usuario: c, identidades: identidades.filter((i) => String(i.user_id) === String(c.id)) },
    ]),
  );
  return { legado: usuarios, auth };
});

if (!aplicar) {
  const { cuentas, vinculos } = await leerPortalSinEscribir();
  console.log(resumenPlan(planUsuarios(legado, cuentas, vinculos)));
  console.log('\nSimulación: no se escribió nada. Corre con --aplicar para escribir.');
} else {
  // El plan se recalcula dentro de la transacción de escritura para no actuar sobre un estado viejo.
  const resumen = await enPortal(async (db) => {
    const { cuentas, vinculos } = await leerEstadoPortal(db);
    const plan = planUsuarios(legado, cuentas, vinculos);
    await aplicarPlan(db, plan, auth);
    return resumenPlan(plan);
  });
  console.log(resumen);
  console.log('\nAplicado.');
}
```

- [ ] **Step 2: Typecheck**

Run: `npm run typecheck`
Expected: sin errores.

- [ ] **Step 3: Escribir `docs/migracion/fase-0.md`**

````markdown
# Fase 0 de la migración de thecoffeemexico: guía de operación

Spec: `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md`.

## Antes de empezar

1. Aplicar la migración `20261112000044_legado_acceso.sql` en el Supabase del portal (como las demás).
2. En `.env.local` del portal:
   - `DATABASE_URL`: la conexión postgres del portal (la que ya usan los scripts de conciliación).
   - `DATABASE_URL_LEGADO`: la conexión postgres de **bliocjvq**, desde Supabase → Project Settings → Database → Connection string (Session pooler).
   Ninguna de las dos va en variables `NEXT_PUBLIC_*` ni se commitea.

## 1. Inventario (solo lectura)

```bash
npx tsx scripts/migracion-legado/inventario.ts "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora"
```

- Revisar `docs/migracion/esquema-legado.json` antes de commitear: buscar `[REDACTADO]` y cualquier otro valor que parezca secreto.
- En `docs/migracion/inventario-tablas.md`: llenar la columna **Cruce con el portal** y reasignar lo que quedó en "Por asignar".
- Confirmar en el JSON que `public.usuarios` tiene las columnas que lee `usuarios.ts` (`id`, `auth_uid`, `username`, `nombre`, `correo`, `rol`, `subtipo`, `supplier_key`, `parent_id`, `permisos`, `activo`). Si alguna cambia, se ajusta la consulta del script antes del paso 2.

## 2. Usuarios

```bash
npx tsx scripts/migracion-legado/usuarios.ts
```

Es una simulación: muestra cuántos se crean, vinculan u omiten y los usernames omitidos con su motivo.

- `sin_cuenta_auth`: nunca entró desde que el sitio viejo pasó a Supabase Auth. En el portal se le crea la cuenta a mano o se le pide que entre una vez al sitio viejo y se vuelve a correr el script.
- `id_ocupado` / `correo_repetido`: se revisan a mano antes de aplicar.

Cuando el resumen esté bien:

```bash
npx tsx scripts/migracion-legado/usuarios.ts --aplicar
```

Se puede volver a correr cuando sea: actualiza contraseñas de las cuentas creadas y no duplica nada. **Se vuelve a correr en cada cutover de módulo.**

## 3. Verificación

1. Con una cuenta de prueba de franquiciado creada en el sitio viejo (no una real): entrar al portal con su **usuario** y contraseña. Debe llegar a Inicio con "Aún no tienes módulos asignados", y `/costeo` debe regresarla a Inicio.
2. Con tu cuenta de admin: Costeo, CRM, Sucursales y BI siguen igual.
3. En el SQL Editor del portal: `select origen, count(*) from migracion_legado.usuarios group by 1;` debe coincidir con el resumen.
````

- [ ] **Step 4: Formato, suite completa y commit**

Run: `npm run format:check && npm run typecheck && npm test`
Expected: todo en verde.

```bash
git add scripts/migracion-legado/usuarios.ts docs/migracion/fase-0.md
git commit -m "feat(migracion): script de usuarios con simulación y guía de la Fase 0"
```

---

### Task 9: Ejecución real (con el usuario)

Esta tarea no lleva código: corre contra bases reales y **cada paso que escribe requiere el OK explícito del usuario**.

- [ ] **Step 1:** Pedir al usuario que aplique la migración 44 en el portal y que agregue `DATABASE_URL_LEGADO` a `.env.local` (guía, sección "Antes de empezar").
- [ ] **Step 2:** Correr el inventario (paso 1 de la guía), revisar el JSON en busca de secretos con el usuario y commitear `docs/migracion/esquema-legado.json` y `docs/migracion/inventario-tablas.md`.
- [ ] **Step 3:** Correr la simulación de usuarios y mostrarle al usuario el resumen.
- [ ] **Step 4:** Con su OK, correr `--aplicar` y hacer la verificación de la guía.
- [ ] **Step 5:** Abrir el PR de `feat/migracion-fase-0` hacia `main`.
