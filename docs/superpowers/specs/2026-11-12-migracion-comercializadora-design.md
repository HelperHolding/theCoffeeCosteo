# Migración de thecoffeemexico al portal: Fase 0 y Comercializadora

Fecha: 2026-11-12 · Estado: diseño aprobado en conversación, pendiente de revisión escrita

## Objetivo

Llevar todo lo que hoy vive en thecoffeemexico.com (HTML estático en Netlify + Supabase `bliocjvq`) al portal The Coffee (este repo, Next.js + Supabase de costeos), con **una sola base, un solo login y un solo diseño**. La migración es por módulos: el sitio viejo sigue operando hasta que cada área tenga su reemplazo.

Este spec cubre:

- **Fase 0**: inventario real del esquema viejo y base de acceso para usuarios externos.
- **Fase 1**: módulo Comercializadora (mín/máx, Qué pedir, OCs automáticas en Zoho, proveedores sin stock, inventario, pagos).

Las demás áreas (pedidos, aperturas, regalías, incidencias, chat, comunicados, encuestas, marketing, CRM de prospectos) tendrán su propio spec. Pedidos será el siguiente.

## Contexto

**Origen** (`HelperHolding/thecoffee-comercializadora`):

- `app/index.html` (~50 800 líneas), sin build. Usa 73 tablas y 12 roles en una tabla propia `usuarios` (`comercial`, `franquiciado`, `proveedor`, `ceo`, `pm`, `marketing`, `supply`, `finanzas`, `admin`, `operaciones`, `comercializadora`, `expansion`).
- Edge Functions `zoho-sync`, `zoho-generar-oc`, `com-minmax` (Deno, con pruebas). `zoho-generar-oc` trae su propia copia de `minmax.ts`.
- `pg_cron`: `zoho-sync` cada 30 min, `com-minmax` diario 12:30 UTC y `zoho-generar-oc` vía `com_invocar()`. Los secretos están en vault.
- La OC automática está en **modo Real** desde 2026-11-12: el cron crea borradores reales en Zoho. Un índice único limita a una OC Real de cron por proveedor y día.
- Netlify Functions `aperturas-sync` y `provider-notifications`, más Apps Script y n8n, con URLs fijas a thecoffeemexico.com.
- Solo hay 7 migraciones, y el esquema base (por ejemplo `com_catalogo`) **no está versionado**.

**Destino** (este repo):

- Hay módulos por grupo de rutas (`(crm)`, `(sucursales)`, `(bi)`). El acceso va por `perfil_modulos` con niveles `desarrollador`/`edicion`/`lectura`, y además hay RLS, bitácora y crons en Vercel.
- Hoy es solo para internos: cualquier perfil activo puede consultar costeo.
- No tiene `supabase/functions`.

## Fase 0: base de la migración

### 0.1 Esquema real de bliocjvq

- Correr `pg_dump --schema-only` de `public` en bliocjvq y guardarlo en `docs/migracion/esquema-legado.sql` como referencia. **No** se aplica como migración.
- Hacer un inventario en `docs/migracion/inventario-tablas.md`: las 73 tablas con su área, número de filas, quién escribe (pantalla, función, cron o integración externa) y si se cruza con algo de costeos (`crm_*`, aperturas y tiendas, `proveedores`, Zoho).

### 0.2 Acceso externo

- `perfiles` gana `tipo text not null default 'interno' check (tipo in ('interno','franquiciado','proveedor'))` y una referencia opcional a la entidad: `franquicia_id` / `proveedor_id`. Las tablas de entidad llegan con su módulo; mientras tanto la columna queda nula y sin FK.
- Función `public.es_interno()`: el perfil está activo, es `tipo = 'interno'` y la sesión no es OAuth.
- **Todas las políticas de lectura actuales** que hoy aceptan "cualquier perfil activo" (costeo, vistas de resumen, catálogos) pasan a exigir `es_interno()`. Una migración las reescribe y una prueba PGlite recorre `pg_policies` para comprobar que ninguna política `select` de `public` queda abierta a externos sin un predicado explícito.
- La navegación de inicio muestra solo los módulos que permite `perfil_modulos`. Un externo sin módulos ve una pantalla vacía con un mensaje, no costeo.

### 0.3 Usuarios existentes

- Copiar las cuentas de `auth.users` de bliocjvq al Supabase de costeos **conservando `id` y `encrypted_password`** (bcrypt, compatible), para que entren con la misma contraseña. Lo hace un script en `scripts/migracion-legado/usuarios.ts` con `DATABASE_URL` de ambos lados. Es idempotente: omite los correos que ya existen y **no pisa cuentas de costeos que ya existen**. Si un correo ya existe con otro `id`, se reporta para resolverlo a mano.
- Desde `usuarios.rol` se genera `perfiles` + `perfil_modulos` con una tabla de mapeo que se revisa en el PR. En Fase 1 solo se dan módulos `comercializadora`; los demás roles quedan con perfil pero sin módulo hasta que llegue su área.
- Conservar el mismo `id` permite que las FKs a usuarios (`creado_por`, etc.) se copien tal cual en cada módulo.

## Fase 1: Comercializadora

### Datos

- Esquema `comercializadora`, expuesto al Data API, con las tablas `com_*` **sin el prefijo**: `catalogo`, `movimientos`, `plan_config`, `lead_times`, `sku_mapping`, `proveedores`, `sync_log`, `zoho_oc_lineas`, `kit_apertura`, `minmax`, `oc_auto`, `pagos_proyectados`, `inventario_fisico`, `sync_cambios`, `proveedor_cierre`… La lista final sale del inventario de 0.1.
- Migraciones nuevas en `supabase/migrations`. Se escriben a partir del esquema real, no del legado incompleto.
- `comercializadora.proveedores` y `public.proveedores` (insumos de receta) **se quedan separados**. Unificar proveedores y catálogo con insumos de costeo queda fuera de alcance.
- RLS con funciones `com_nivel()`, `com_puede_leer()` y `com_puede_editar()`, igual que el CRM. `perfil_modulos.modulo` agrega `'comercializadora'`. Hay bitácora en las tablas editables por usuarios (`lead_times`, `plan_config`, `inventario_fisico`, `proveedor_cierre`).
- Copia de datos: el script `scripts/migracion-legado/comercializadora.ts` lee de bliocjvq y escribe en lotes. Es idempotente (upsert por PK) y genera un reporte de conteos origen/destino por tabla. Se corre una vez para la carga inicial y otra vez justo antes del cutover.

### Puente de lectura `legado`

`com-minmax` lee `pedidos`, `pedidos_apertura` y `aperturas`, que siguen en bliocjvq hasta migrar Pedidos.

- Se usa `postgres_fdw`, con un servidor `legado` hacia bliocjvq y un usuario de **solo lectura** creado allá con `select` únicamente sobre esas tres tablas.
- Las tablas foráneas van en el esquema `legado`, que **no** se expone al Data API y del que se revocan permisos a `anon` y `authenticated`. Solo lo leen las funciones con `service_role`, por medio de vistas en el mismo esquema `legado` con solo las columnas que usa `minmax.ts`. No hay vistas en `comercializadora`, porque ese esquema sí está expuesto y daría a cualquier usuario acceso a pedidos.
- La credencial del usuario de solo lectura se guarda en el user mapping. La migración no lleva la contraseña: el servidor y el mapping se crean con un script manual documentado.
- Si bliocjvq no responde, `com-minmax` falla y lo registra en `sync_log`. El cálculo anterior queda vigente y la siguiente corrida reintenta.
- Al migrar Pedidos, se borran el esquema `legado` y el servidor, y las vistas apuntan a las tablas nuevas.

### Funciones y cron

- Las Edge Functions `zoho-sync`, `zoho-generar-oc` y `com-minmax` se copian a `supabase/functions` con sus pruebas Deno y `_shared`, y se ajustan al nuevo esquema (`db.schema('comercializadora')`).
- Se elimina la copia duplicada de `minmax.ts`: las dos funciones importan desde `_shared`.
- Se quedan como Edge Functions (no como rutas de Vercel) para no reescribir la lógica probada.
- `pg_cron` + `com_invocar()` con secretos en vault, igual que en origen, más una bandera `plan_config.modo_oc` (`registrar` | `real`).
- Las URLs de Zoho no cambian. Los avisos a proveedores (`provider-notifications`) se quedan en Netlify durante la Fase 1 y leen del Supabase nuevo en el cutover. Pasarlos a una ruta del portal queda para el módulo de proveedores.

### Pantallas

Grupo `app/(comercializadora)/comercializadora/`, con `Marco`, `Encabezado`, `Tarjeta`, `Kpi`, `Pill`, `Vacio`, tablas de 13–14 px y 25 filas, según `docs/DESIGN-DIRECTION.md`:

| Ruta | Origen | Contenido |
| --- | --- | --- |
| `/comercializadora` | Qué pedir | KPIs, sugerencias de mín/máx y avisos de proveedores sin stock |
| `/comercializadora/ordenes` | Órdenes de compra | OCs de Zoho y automáticas, con su estado y modo |
| `/comercializadora/proveedores-sin-stock` | Proveedores sin stock | Cierres, día efectivo de pedido y avisos |
| `/comercializadora/catalogo` | Catálogo + Lead times | Una sola tabla, con lead time y mínimos editables |
| `/comercializadora/movimientos` | Movimientos | Historial filtrable |
| `/comercializadora/inventario-fisico` | Inventario físico | Captura y diferencias |
| `/comercializadora/pagos` | Pagos proyectados | Calendario de pagos por proveedor |

- Los cálculos que hoy viven en JS del HTML (simulación de cierres, pagos proyectados, sugerencias) pasan a funciones puras en `lib/comercializadora/`, con pruebas Vitest y casos tomados del comportamiento actual. Lo que deba ser oficial queda en Postgres o en las Edge Functions.
- Los niveles `lectura`/`edicion`/`desarrollador` controlan los botones de edición y de forzar sync/OC.
- Orden de entrega: Qué pedir → Órdenes → Proveedores sin stock → Catálogo → resto. Cada pantalla se publica cuando está lista. Mientras tanto se lee del Supabase nuevo con datos copiados (sin cron todavía).

### Cutover

1. Carga inicial de datos y funciones desplegadas con cron en **modo registrar**.
2. Paridad diaria: el script `scripts/migracion-legado/paridad-comercializadora.ts` compara el mín/máx y las OCs propuestas del sistema nuevo contra las creadas o propuestas por el viejo, por SKU y proveedor. Se avanza con **3 días seguidos sin diferencias**; las diferencias explicadas se documentan.
3. Día del cambio, en este orden: en bliocjvq se desprograman los jobs `zoho-sync`, `com-minmax` y `zoho-generar-oc` → segunda copia de datos editables por usuarios → `modo_oc = 'real'` en el nuevo → se verifica la primera corrida del cron. **En ningún momento hay dos crons en Real.**
4. La pestaña Comercializadora del HTML viejo se reemplaza por un aviso con enlace al portal. Las tablas `com_*` de bliocjvq quedan de solo lectura (`revoke insert, update, delete`) durante 30 días y después se archivan.

Reversa: mientras el viejo siga en solo lectura, revertir es apagar el cron nuevo, devolver permisos de escritura en bliocjvq y reprogramar sus jobs. Lo capturado en el nuevo durante ese lapso se copia de regreso con el mismo script en sentido inverso; solo se cubren las tablas editables.

## Pruebas

- **SQL (PGlite):** migraciones de `comercializadora`; RLS por nivel y por tipo de perfil (un externo no lee costeo ni comercializadora); prueba de `pg_policies` de 0.2; índice "una OC Real por proveedor y día"; vistas sobre `legado` con tablas locales de prueba en lugar de fdw.
- **Deno:** las pruebas actuales de las funciones pasan sin cambios de lógica.
- **Vitest:** funciones de `lib/comercializadora/` y componentes con Testing Library.
- **Scripts:** usuarios y copia de datos se prueban contra PGlite. Casos: idempotencia, correo existente con otro id y conteos.
- **Visual:** revisión en navegador de cada pantalla, en escritorio y móvil, antes de publicarla.

## Fuera de alcance

- Las demás áreas de thecoffeemexico (cada una tendrá su spec).
- Vista de proveedores externos dentro del portal. La base de acceso queda lista en 0.2, pero sus pantallas llegan con su módulo.
- Unificar proveedores y catálogo de comercializadora con insumos de costeo.
- Mover Netlify Functions, Apps Script y n8n.
- Apagar el dominio thecoffeemexico.com.

## Riesgos

| Riesgo | Mitigación |
| --- | --- |
| Dos crons crean OCs reales | Orden fijo del cutover, índice único por proveedor y día en el nuevo, y verificación de `cron.job` en el viejo antes de pasar a Real |
| Abrir costeo a externos por una política olvidada | Prueba automática sobre `pg_policies` + `es_interno()` |
| bliocjvq caído rompe el mín/máx | Falla controlada, se conserva el cálculo anterior y se reintenta |
| Ediciones en el sitio viejo después de la copia | Pestaña reemplazada y tablas de solo lectura el día del cambio |
| Esquema legado incompleto | Fase 0.1 sale del `pg_dump` real, no de las migraciones del repo |
