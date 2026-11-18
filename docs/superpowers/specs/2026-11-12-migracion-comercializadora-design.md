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

- Extraer el esquema de `public` en bliocjvq (columnas, restricciones, índices, políticas, funciones y jobs de cron) consultando el catálogo con una conexión de solo lectura, igual que `scripts/conciliacion/esquema-db.ts` (así no hace falta el binario `pg_dump`). El resultado se guarda en `docs/migracion/esquema-legado.json` como referencia. **No** se aplica como migración.
- Hacer un inventario en `docs/migracion/inventario-tablas.md`: las 73 tablas con su área, número de filas, quién escribe (pantalla, función, cron o integración externa) y si se cruza con algo de costeos (`crm_*`, aperturas y tiendas, `proveedores`, Zoho).

### 0.2 Acceso externo

*Revisado al planear (2026-11-12):* la migración 24 ya cerró la lectura de Costeo a `tiene_rol('compras','operaciones','finanzas','admin')`, con `sucursales` como precedente de "perfil sin Costeo", y hoy no queda ninguna política abierta a cualquier perfil activo. No hace falta una columna `tipo` ni reescribir políticas. Lo que sí se hace:

- `perfiles.rol` agrega los roles **sin Costeo** `interno`, `franquiciado` y `proveedor`, por el mismo camino que `sucursales`.
- En la app, `tieneCosteo(rol)` sustituye la comparación `rol === 'sucursales'` y **falla cerrado**: cualquier rol que no sea de Costeo queda fuera de Costeo.
- Una prueba de guardia recorre `pg_policies` y las vistas: toda lectura debe pasar por un predicado de rol o módulo, ninguna `tiene_rol` puede incluir roles externos y toda vista debe ser `security_invoker`.
- La referencia a franquicia o proveedor se guarda en la tabla de vínculo de 0.3 (`supplier_key`, `parent_id`, `subtipo`) y pasa a FK cuando llegue su módulo.
- Inicio ya muestra solo los módulos permitidos y un estado vacío cuando no hay ninguno.

### 0.3 Usuarios existentes

*Revisado al planear:* en el sitio viejo se entra con **usuario**; la cuenta de Auth es `<usuario>@thecoffee.internal` y `usuarios.auth_uid` apunta a ella. Algunos usuarios todavía no tienen cuenta de Auth: el sitio los migra al vuelo con `authenticate_and_migrate`.

- El login del portal acepta **correo o usuario**. Un usuario sin `@` se convierte en `<usuario>@thecoffee.internal`.
- El script `scripts/migracion-legado/usuarios.ts` (simulación por omisión; `--aplicar` para escribir) copia `auth.users` + `auth.identities` **conservando `id` y `encrypted_password`**, así que entran con la misma contraseña. También crea el perfil con rol `interno`/`franquiciado`/`proveedor` y **sin módulos**. Los roles de Costeo y los módulos los asigna el admin.
- Si el `correo` del usuario viejo ya es una cuenta del portal, **se vincula** a esa cuenta y no se crea otra. Si el `id` ya está ocupado, se reporta. Los que no tienen cuenta de Auth se reportan para restablecerles la contraseña.
- La tabla privada `migracion_legado.usuarios` guarda el vínculo `legado_id` → `user_id` del portal. Cada módulo reasigna con ella sus FKs a usuarios; no se asume que el id sea el mismo.
- Se puede volver a correr: actualiza la contraseña de las cuentas que creó el script. Se vuelve a correr en cada cutover de módulo.

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
| Abrir costeo a externos por una política olvidada | Prueba de guardia sobre `pg_policies` y vistas, más `tieneCosteo()` que falla cerrado en la app |
| bliocjvq caído rompe el mín/máx | Falla controlada, se conserva el cálculo anterior y se reintenta |
| Ediciones en el sitio viejo después de la copia | Pestaña reemplazada y tablas de solo lectura el día del cambio |
| Esquema legado incompleto | Fase 0.1 sale del `pg_dump` real, no de las migraciones del repo |
