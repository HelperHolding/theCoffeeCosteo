# Fase 0 de la migración de thecoffeemexico: guía de operación

Spec: `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md`.

## Antes de empezar

1. Aplicar la migración `20261112000044_legado_acceso.sql` en el Supabase del portal. Aplicada el 2026-11-12
   directo por `DATABASE_URL` en una transacción y registrada en `supabase_migrations.schema_migrations`: no con
   `supabase db push`, porque la 42 (`bi_neto`) está en la base pero no en el historial y `db push` la repetiría.
   Pendiente: `npx supabase migration repair --status applied 20261106000042` tras confirmar que la 42 está completa.
2. En **bliocjvq** (SQL Editor) se creó un rol de solo lectura, para no usar ni resetear la clave de `postgres`
   (la usa el sitio viejo con Zoho y n8n):

   ```sql
   create role migracion_lectura with login password '<clave>';
   alter role migracion_lectura set default_transaction_read_only = on;
   alter role migracion_lectura bypassrls;
   grant select on all tables in schema public to migracion_lectura;
   -- postgres no puede dar acceso al esquema auth: vistas de su dueño en un esquema privado.
   create schema if not exists migracion_auth;
   revoke all on schema migracion_auth from public, anon, authenticated;
   create or replace view migracion_auth.users as select * from auth.users;
   create or replace view migracion_auth.identities as select * from auth.identities;
   revoke all on all tables in schema migracion_auth from public, anon, authenticated;
   grant usage on schema migracion_auth to migracion_lectura;
   grant select on all tables in schema migracion_auth to migracion_lectura;
   grant usage on schema cron to migracion_lectura;
   grant select on cron.job to migracion_lectura;
   ```

   Al terminar la migración: `drop schema migracion_auth cascade; drop role migracion_lectura;`.
3. En `.env.local` del portal:
   - `DATABASE_URL`: la conexión postgres del portal (Session pooler, usuario `postgres.jpqkmnfjwzniptszjuli`).
   - `DATABASE_URL_LEGADO`: la conexión de **bliocjvq** con el rol `migracion_lectura` (conexión directa:
     usuario `migracion_lectura`; por el pooler: `migracion_lectura.bliocjvqwskvoxrumqby`).
   Ninguna de las dos va en variables `NEXT_PUBLIC_*` ni se commitea. Sin espacios después de la comilla final.

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
