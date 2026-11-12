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

La copia es un **espejo**: hasta el cutover manda el sitio viejo, así que en cada tabla copiada el portal queda igual al viejo. Lo que el portal haya creado o cambiado en esas tablas (por ejemplo, las corridas manuales del paso 7) se reemplaza o se borra. El reporte cuenta las filas `borradas`.

## 7. Prueba manual (sin cron, sin efectos)

En el SQL Editor del portal, una a la vez y revisando `com_sync_log` entre cada una:

```sql
select public.com_invocar('zoho-sync');
select public.com_invocar('com-minmax');
select public.com_invocar('zoho-generar-oc', '{"origen":"manual","modo":"simulacion"}');
select proceso, ok, error, inicio from public.com_sync_log order by inicio desc limit 5;
```

El cron sigue inactivo: `select jobname, active from cron.job;` debe mostrar los tres jobs con `active = false`.
