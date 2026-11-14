# Comercializadora: paridad y cutover (plan 4)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pasar Comercializadora del sitio viejo al portal sin perder ventas comprometidas y sin que dos crons creen OCs reales:
- **Paridad:** un script de solo lectura compara cada día el mín/máx, la OC automática y las OVs del portal contra las del viejo, y lleva la racha de "3 días seguidos sin diferencias".
- **OVs desde los pedidos:** el portal deriva las filas `venta` de `com_movimientos` a partir de los pedidos del puente. Sustituye a `_comSyncPedidoPagado`, `_comSyncPedidoEnviado` y `_comLiberarComprometido` del HTML viejo.
- **Sitio viejo:** las pantallas de Comercializadora y el Forecast muestran un aviso con enlace al portal, y el sitio deja de escribir `com_*`. El Reporte Comercializadora, "Analizar con Claude", el widget de stock bajo y el reporte de activas dejan de leerlas.
- **Cutover y reversa:** el runbook del día del cambio, en el orden fijo del spec, con cada paso de producción marcado (quién lo hace y con OK). Incluye la reversa con copia en sentido inverso y la ventana de 30 días antes de archivar.

**Architecture:**
- **Migración 50 (Postgres + pg_cron):**
  - `com_ov_plan(existentes, ventana)` lee los pedidos por el puente (`com_legado_*`) con el mapeo del portal. Devuelve las acciones (`insertar`, `avanzar`, `reabierto`, `ambiguo`) sobre las filas `venta` que recibe.
  - `com_derivar_ov(aplicar, ventana)` las aplica a `com_movimientos` y deja rastro en `com_sync_log`.
  - El job `com-ov-pedidos` (`10,40 * * * *`) se crea **inactivo**.
  - La paridad usa la misma `com_ov_plan` con las filas del viejo: una sola regla.
- **Scripts de solo lectura en `scripts/migracion-legado/`:**
  - `paridad-comercializadora{-lib,-datos,}.ts`: pura, lecturas y CLI.
  - `reversa-comercializadora{-lib,}.ts`: arma el SQL de regreso para el SQL Editor de bliocjvq, porque `migracion_lectura` no escribe.
  - `conexion.ts` suma `conPortalLectura`.
- **Sitio viejo** (repo `thecoffee-comercializadora`, rama y PR aparte): ediciones a `app/index.html` con pruebas `node:test` en `netlify/aperturas-sync/tests/`.
- **Runbook (Tareas 8 a 12):** producción. El agente prepara y lee. Escribe en el portal solo con OK, con un script de una vez en `$env:TEMP`. Lo de bliocjvq lo corre el usuario en su SQL Editor, y los secretos los pone o quita el usuario.

Ramas:
- portal: `feat/comercializadora-cutover`, encima de `feat/comercializadora-plan-abastos` (PR #118);
- repo viejo: `feat/cutover-comercializadora`, desde la rama que publica Netlify (Tarea 5, Step 1).

**Tech Stack:** Postgres (pg_cron, postgres_fdw; PGlite en pruebas), Vitest, tsx, `pg`. Repo viejo: HTML estático en Netlify y `node --test` (Node ≥ 22).

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md`, secciones **Cutover** (pasos 1 a 4 y Reversa) y **Riesgos**. Anteceden:
- Fase 0: `2026-11-12-migracion-fase-0.md` (PR #111);
- plan 2: `2026-11-12-migracion-fase-1-datos-funciones.md` (PR #112, migraciones 45–47);
- planes 3 a 3f: PRs #113 a #118 (migraciones 48 y 49).

La guía de operación es `docs/migracion/comercializadora.md`, secciones 1–13.

**Estado de partida (2026-11-14):**
- **Portal:**
  - Las migraciones 45–49 están aplicadas en producción (`jpqkmnfjwzniptszjuli`).
  - Las funciones `zoho-sync`, `com-minmax`, `zoho-generar-oc` y `zoho-proveedor-minimo` están desplegadas, con `verify_jwt=false` y el encabezado `x-com-secreto`.
  - `COM_EFECTOS_EXTERNOS` **no** está definido: sin correos, y el cliente de Zoho es solo lectura.
  - Los crons existen e **inactivos**, y `auto.modo = 'simulacion'`.
  - Los datos son una copia en espejo (`comercializadora.ts`).
- **Sitio viejo (bliocjvq):**
  - Está en **Real**: su cron crea borradores reales en Zoho.
  - Sus jobs: `zoho-sync` cada 30 min, `com-minmax` 12:30 UTC y `zoho-generar-oc` 13:05 UTC (`supabase/migrations/20261030000002_cron.sql` del repo viejo; `com_invocar()` lee `project_url`/`anon_key` de Vault).

## Decisiones (al planear, 2026-11-14)

1. **Las OVs las deriva el portal desde los pedidos (lo eligió el usuario).** Va como **función de Postgres + pg_cron**, no como Edge Function ni dentro de `zoho-sync`/`com-minmax`:
   - el job corre como `postgres`, que lee el puente con su propio user mapping (guía §3), sin secretos ni HTTP;
   - todo pasa en una transacción, y se prueba en PGlite como las migraciones 46 y 49.

   Las funciones son `security invoker`, con `execute` revocado a `public`/`anon`/`authenticated`, porque leen pedidos. Reglas, las de `_comSyncPedidoPagado` (27480), `_comSyncPedidoEnviado` (28311) y `_comLiberarComprometido` (27465) salvo lo marcado:
   - **Qué pedidos entran:** con `apertura_id` y status `pagado` → `por_enviar`; `enviado`/`entregado`/`terminado` → `enviado`; `cancelado` → `cancelado`.
     - **Nuevo:** `empacado` cuenta como `por_enviar`. En el viejo un pedido pasaba por `pagado` antes de empacarse; con una corrida cada 30 min, uno pagado y empacado entre dos corridas se perdería.
     - `recibido`, `con_incidencia` y `cancelacion_pendiente` no mueven nada.
   - **Folio:** `shopify_order_number` o `'PED-'` + los últimos 6 caracteres del id. **Renglones:** `items_editados` si no es null (aunque venga vacío, como el `||` de JS), si no `items`. Cada artículo con nombre y con `sku` o mapeo **exacto** por nombre da una fila. Cantidad = `Number(it.cantidad || 1)`. Fecha = día UTC de `fecha_pedido` (lo que daba `.split('T')[0]`). Sucursal = `aperturas.sucursal`.
   - **Inserta** solo si el folio no tiene ninguna fila `venta`, y si el pedido es de los últimos **45 días** (`p_ventana_dias`). Así no rellena la historia: los pedidos viejos que el sitio nunca registró (H-48) se quedan como están.
   - **Solo avanza:** `por_enviar` → `enviado` → `cancelado`. Nunca regresa, así que un "Marcar enviado" del portal se respeta. Un `cancelado` cuyo pedido volvió a pagado se reporta como **`reabierto`** y no se toca (el viejo lo recreaba al volver a pagar). Dos pedidos con el mismo folio son **`ambiguo`** y no se tocan.
   - **No toca:** las cantidades de una fila que ya existe (el viejo solo creaba al pagar), las OVs manuales (folios que no son de pedidos) ni los estados desconocidos.
   - **Arreglos que salen solos:** la cancelación masiva del viejo nunca liberaba (`_pedBulkUpdate` 24167) y aquí sí; los errores ya no se tragan con un aviso de éxito falso (27504–27505).
   - **Horario `10,40 * * * *`:** cada 30 min, lejos de `zoho-sync` (`*/30`) y antes de `com-minmax` (12:30).
   - **Copia en espejo:** durante la sombra la derivación **no escribe**. La copia borraría sus filas, y las del viejo (con otro id) se sumarían a las suyas y duplicarían lo comprometido. Su sombra es la paridad: `com_ov_plan` con las filas **en vivo** del viejo. El día del cambio va primero la copia final, luego una corrida en `registrar` y al final se activa el job.
2. **Reporte Comercializadora: enlace al portal (lo eligió el usuario).**
   - "Generar reporte" de la pestaña Comercializadora abre Inicio y "Analizar con Claude" abre Indicadores.
   - El widget "SKUs stock bajo" de Supply (C) muestra un aviso con enlace a Inventario y el KPI queda en "—".
   - `_genRepActivas` toma "días sin pedir" de `pedidos.fecha_pedido` (sin cancelados ni recibidos), que es la misma fecha que llevaba la OV.
   - **Forecast se quita de los dos menús.** Si alguien entra por URL, ve el aviso con enlace a Plan de abastos.
3. **Las Edge Functions viejas se neutralizan quitando sus secretos `ZOHO_*` (lo eligió el usuario):** `ZOHO_CLIENT_ID`, `ZOHO_CLIENT_SECRET`, `ZOHO_REFRESH_TOKEN`, `ZOHO_ORG_ID` y `ZOHO_LOCATION_ID`. Son los nombres que leen `zohoDesdeEnv` (`_shared/zoho.ts`) y `generar.ts` del repo viejo.
   - El día del cambio los quita el usuario; revertir es volver a ponerlos.
   - `com-minmax` del viejo no usa Zoho. Si alguien lo llama con la llave anon, recalcula en bliocjvq y solo manda avisos de cierres nuevos o cambiados, que ya no se pueden crear tras el revoke. Las cuatro funciones viejas se borran al archivar (Tarea 11).
   - `send-email` de bliocjvq **se queda**: lo usa el portal (`CORREO_URL`/`CORREO_LLAVE`, guía §4).
4. **Copia final completa (las 17 tablas), no solo las editables.** Cambia el paso 3 del spec ("segunda copia de datos editables"):
   - trae a `com_oc_auto` las OCs reales que el viejo creó durante la ventana (historial de Órdenes y candado diario);
   - borra del portal lo que la sombra dejó (OCs simuladas, logs);
   - el resto (`com_zoho_*`, `com_pago_proyectado`, `com_sync_*`) lo rehacen `zoho-sync` y `com-minmax`.

   Durante la ventana se copian **solo editables** (`--solo-editables`), para no borrar las OCs simuladas que compara la paridad.
5. **Revoke por lista explícita a `anon` y `authenticated`:** las 17 tablas de `TABLAS_COM`, no `com_*`.
   - `com_credito_abonos` (Crédito, se migra con Pedidos) y `com_proveedores` (sin uso, 0 filas) se quedan.
   - Antes del revoke se guardan los `GRANT` exactos que había, para la reversa.
6. **Sombra:** `zoho-sync`, `com-minmax` y `zoho-generar-oc` del portal se activan con `auto.modo = 'simulacion'` y **sin** `COM_EFECTOS_EXTERNOS`, así que Zoho queda en solo lectura y no salen correos.
   - `com-ov-pedidos` sigue inactivo.
   - `COM_EFECTOS_EXTERNOS=si` se pone hasta el día del cambio.
   - Un cron en simulación no es "Real": la regla de nunca dos crons en Real no se rompe.
   - Doble lectura a Zoho: son dos sistemas leyendo cada 30 min. Se vigilan los errores de límite (429) en `com_sync_log` (Tarea 9).
7. **Paridad: qué compara y cuándo un día es verde.**
   - **Mín/máx efectivo** por SKU (`coalesce(manual, calc)`), con tolerancia de 0.01.
   - **OC automática del cron del día** por proveedor y SKU: en el viejo, `modo='real'` con estado `creada` o `error` (si Zoho falló, igual era su propuesta); en el portal, `simulacion`/`simulada`.
   - **OVs:** las acciones de `com_ov_plan` sobre las filas del viejo, que en paridad perfecta son ninguna.
   - **Firmas de entradas:** por SKU (catálogo, lead time, manuales, kit), por proveedor (mínimo y cierres vigentes) y global (configuración sin `auto.modo`, parámetros y mapeo). Una diferencia donde las entradas difieren es "no comparable" y no rompe el verde.
   - **Día completo:** los dos lados tienen ese día (CDMX) un `com-minmax` y un `zoho-generar-oc` correctos, y la firma global es igual.
   - **Verde:** completo y sin diferencias del motor.
   - **Diferencias aceptadas:** van en `docs/migracion/paridad/explicadas.json` (`clave`, `motivo`), con OK del usuario.
   - **Racha:** días de calendario seguidos, guardados en `docs/migracion/paridad/<fecha>.json`. Se avanza con **3**.
8. **Reversa por SQL, solo con lo que cambió.**
   - El script lee los dos lados y arma un `begin … commit` con upsert de lo nuevo o distinto y borrado de lo que el portal ya no tiene, en las 11 tablas editables (spec).
   - Lleva `set local app.origen = 'migracion'`, y las columnas generadas del portal (`com_minmax.minimo/maximo`) van como columnas normales del viejo.
   - `com_oc_auto` del portal no regresa: las OCs reales siguen en Zoho y el viejo las vuelve a ver con su `zoho-sync`.
9. **`provider-notifications` no cambia en el cutover. Corrige al spec (línea 86, "leen del Supabase nuevo en el cutover"):** `netlify/functions/provider-notifications.mjs` no lee ninguna tabla `com_*`, solo `/rest/v1/rpc`. Tampoco cambian `aperturas-sync`, Apps Script ni n8n (sin `com_` en el código).
10. **El aviso del sitio viejo enlaza a `https://the-coffee-costeo.vercel.app`.** Es el dominio público del portal documentado en `docs/conciliacion-brasil/13-TAREA-AUTH-SITE-URL.md`. Se confirma con el usuario antes de la Tarea 5 (pregunta abierta 1).
11. **Quién hace qué en producción:**
    - **Agente:** lee los dos lados (`conLegado`, `conPortalLectura`) y prepara archivos.
    - **Agente con OK:** escribe en el portal (copia, migración, SQL del runbook con `sql-portal.mts`), hace merge, push y despliegues.
    - **Usuario en el SQL Editor de bliocjvq:** desprogramar, grants, revoke, reversa y archivo.
    - **Usuario:** pone y quita secretos (Supabase y Vercel).

    Cada paso marcado "OK" espera un sí explícito, aunque el anterior se haya aprobado.

## Mapa de dependencias del sitio viejo (verificado en `ee23758`)

| | Qué | Dónde (`app/index.html` salvo que se diga) | En este plan |
| --- | --- | --- | --- |
| A | OVs desde Pedidos | `_comSyncPedidoPagado` 27480–27506 (lo llaman `_pedConfirmarStatus` 27375, `_pedBulkUpdate` 24194 y `markStage` 15825); `_comSyncPedidoEnviado` 28311–28333 (27378, 24197); `_comLiberarComprometido` 27465–27478 (solo 27382; la cancelación masiva nunca libera). Escriben `com_movimientos` con la sesión del usuario; los errores se tragan (`.catch(()=>{})`). Lectores en el portal: `inventario/page.tsx:37`, `inicio/page.tsx:34,37`, `envios/page.tsx:15`, `lib/comercializadora/motor.ts:161` y `marcarEnviado` (`acciones.ts:504`). `com-minmax` lee los pedidos por el puente | Decisión 1, Tareas 1 y 5 |
| B | `com_credito_abonos` (0 filas, fuera de la copia) | `renderCreditoCom`, `_creditoGuardarAbono`, `_creditoBorrarAbono` | No se revoca (decisión 5) |
| C | Widget "SKUs stock bajo" | `renderHome` 6939–6967; tarjeta 5365; KPI 5291 y 3680 | Tarea 6 |
| D | Reportes | `_genRepComercializadora` 12910 y `_buildContextComercializadora` 13260 (llamadas en 10626 y 10639); `_genRepActivas` 11692 (consulta 11700, bloque 11761–11790) | Tarea 6 |
| E | Forecast | `renderForecast` 30516 (redirige a Compras); menús 2698 y 2962; despacho de `navTo` 3258 | Tarea 5 |
| F | Edge Functions viejas | `zoho-sync`, `com-minmax`, `zoho-generar-oc` y `zoho-proveedor-minimo` aceptan POST con la llave anon del HTML; adentro usan service_role (el revoke no las frena) | Decisión 3 |
| G | `send-email` de bliocjvq | La usa el portal | Se queda |
| H | `provider-notifications`, `aperturas-sync`, Apps Script, n8n | Sin `com_*` | Sin cambio (decisión 9) |
| I | Revoke | Lista explícita, `anon` + `authenticated` | Decisión 5, Tarea 10 |

Las líneas son de `ee23758` (`feat/proveedores-sin-stock`). Las ediciones de las Tareas 5 y 6 se ubican por texto, no por número de línea.

## Mapa de archivos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `supabase/migrations/20261114000050_comercializadora_ov_pedidos.sql` | 1 | `com_ov_cantidad`, `com_ov_plan`, `com_derivar_ov`, job `com-ov-pedidos` inactivo |
| `tests/db/comercializadora-ov.test.ts` | 1 | Reglas de la derivación en PGlite |
| `scripts/migracion-legado/paridad-comercializadora-lib.ts` | 2 | Comparación pura, día, racha y reporte |
| `tests/migracion-legado/paridad-comercializadora.test.ts` | 2 | Pruebas de la comparación |
| `scripts/migracion-legado/paridad-comercializadora-datos.ts` | 3 | Lecturas (mismo SQL en los dos lados) y `planOv` |
| `scripts/migracion-legado/conexion.ts` | 3 | `conPortalLectura`; las dos lecturas en UTC |
| `scripts/migracion-legado/paridad-comercializadora.ts` | 3 | CLI de la paridad diaria |
| `docs/migracion/paridad/explicadas.json` | 3 | Diferencias aceptadas (empieza vacío) |
| `tests/migracion-legado/paridad-comercializadora-datos.test.ts` | 3 | Lecturas con dos PGlite |
| `scripts/migracion-legado/reversa-comercializadora{-lib,}.ts` | 4 | Delta portal → bliocjvq como SQL |
| `tests/migracion-legado/reversa-comercializadora.test.ts` | 4 | La reversa deja bliocjvq igual al portal |
| repo viejo `app/index.html` | 5, 6 | Aviso, menú, OVs vacías (5); reportes, widget, activas (6) |
| repo viejo `netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs` | 5, 6 | Pruebas `node:test` |
| `docs/migracion/comercializadora.md` | 7 | Sección 14 |
| `docs/migracion/paridad/<fecha>.json`, `grants-bliocjvq-antes.sql` | 9, 10 | Evidencia de la racha y grants previos |

**Fragmentos probados** (archivos que tocan dos tareas), en `C:\Users\sebcm\AppData\Local\Temp\claude\9a11fe16657e4c88\d8f397a7-8579-401d-b3f5-d1edcd61c014\scratchpad\frag4\`:
- `index-tarea5.html` y `cutover-test-tarea5.mjs`: estado tras la Tarea 5;
- `index-tarea6.html` y `cutover-test-completo.mjs`: estado tras la Tarea 6;
- `viejo-tarea5.diff` y `viejo-tarea5y6.diff`: los diffs;
- `cutover-test-tarea6-seccion.mjs`: lo que la Tarea 6 agrega a la prueba;
- `aplicar-viejo.cjs` (más `ayudantes5.js`/`ayudantes6.js`): las ediciones como script, por si se quiere comparar.

Los SQL y scripts del runbook están en `...\scratchpad\runbook4\`. `validar-runbook4.mts` los corre en PGlite con un `cron` de prueba.

## Global Constraints

- **Nunca dos crons en Real.** Antes de activar el cron del portal con `auto.modo = 'real'` se verifica en `cron.job` de bliocjvq que no queda ningún job de Comercializadora. En la reversa, al revés: primero se apaga el portal.
- **Producción solo con OK explícito en cada paso:** migraciones, copias, cambios de cron, `auto.modo`, merges, despliegues (Vercel, Netlify) y ediciones del sitio viejo. Un OK no se extiende al paso siguiente.
- **bliocjvq:**
  - `migracion_lectura` es de **solo lectura**: cualquier DDL, grant, revoke, cambio de cron o escritura en bliocjvq lo corre **el usuario en su SQL Editor**, con el SQL exacto de este plan;
  - **nunca** se resetea la clave de `postgres` de bliocjvq (Zoho y n8n dependen de ella).
- **Secretos:**
  - el agente no escribe secretos: los pone y quita el usuario (Supabase Edge Function secrets, Vercel env);
  - nunca se imprimen URLs de conexión, contraseñas, llaves ni valores de secretos, ni en logs, ni en commits, ni en el PR;
  - `secrets list` muestra nombres y está permitido.
- **PowerShell:**
  - `npx.cmd` y `curl.exe` (no `npx`/`curl`);
  - el portapapeles agrega un salto de línea al final, así que los secretos no se copian con `Set-Clipboard`/`clip`;
  - los scripts de una vez van en `$env:TEMP` y se corren desde la raíz del repo del portal (leen `.env.local`).
- **Mientras el viejo siga en Real:** en el portal no se capturan OCs, mínimos, cierres ni configuración de verdad (la copia en espejo los borra). Tampoco se re-copian las 17 tablas durante la ventana: solo `--solo-editables`.
- **Pruebas del portal:** `npm test`, `npm run typecheck` y `npm run test:funciones`. `tests/migracion/paridad.test.ts` (Rappi, pide el Excel de costeo) es la falla previa conocida.
- **Pruebas del viejo:** `npm test` en `netlify/aperturas-sync` (`node --test tests/*.test.mjs`) y `deno task test`. La copia de trabajo del viejo está en CRLF (`core.autocrlf=true`): las ediciones se hacen con Edit, que respeta el fin de línea.
- **Sin dependencias nuevas** en ninguno de los dos repos.

## Review Focus

1. **Dos crons en Real** (cutover a medias, reversa en desorden o alguien que vuelve a programar un job). Expectativa: en ningún momento hay OCs reales de los dos lados el mismo día. Lo cubren:
   - Tarea 10: `viejo-desprogramar.sql` con verificación vacía antes de `portal-activar.sql`; el candado y el índice único del portal; `viejo-quieto.sql` al día siguiente;
   - Tarea 12: el portal se apaga y se verifica antes de `viejo-reprogramar.sql`;
   - Tarea 8: `sombra-activar.sql` aborta si `auto.modo` no es `simulacion`, y `aplicar50.mts` imprime `com-ov-pedidos` con `active = false`. En PGlite no hay cron: esa parte de la migración solo se ve en producción.
2. **La derivación duplica OVs o regresa estados** (dos corridas a la vez, "Marcar enviado" del portal, pedido cancelado y vuelto a pagar, folio repetido, el mismo pedido cada 30 min). Expectativa: una fila por artículo y nunca hacia atrás. Lo cubre la Tarea 1:
   - "idempotente";
   - "solo avanza…" y "Marcar enviado";
   - "reabierto";
   - "ambiguo";
   - "las cantidades no se rehacen";
   - el candado `pg_try_advisory_xact_lock`.
3. **La copia pisa lo capturado solo en el portal** (alguien editó un mínimo o la configuración en el portal antes de la copia final). Expectativa: se ve antes de aplicar. Lo cubren:
   - Tarea 10, Step 7: la simulación de la copia con sus `borradas`/`actualizadas` y la consulta de la bitácora del portal (`tabla like 'com_%'` y `origen <> 'migracion'` desde la última copia) antes de `--aplicar`;
   - Tarea 3: la firma global (prueba "las firmas cambian si cambia una entrada");
   - Tarea 4: la reversa como red de seguridad.
4. **El puente cae durante el cutover** (bliocjvq no responde). Expectativa: la derivación falla sin dejar nada a medias, lo registra y la siguiente corrida reintenta; nada se activa a ciegas. Lo cubren:
   - Tarea 1: "si el puente falla, registra el error y no deja filas a medias";
   - Tarea 8: `aplicar50.mts` revierte si `com_ov_plan` no puede leer el puente;
   - Tarea 10, Step 8: la corrida en `registrar` tiene que salir `ok` antes de activar.
5. **Falta una variable en Vercel** (`COM_SECRETO`, `SUPABASE_SECRET_KEY`) o el usuario no tiene el módulo. Expectativa: se detecta antes del cambio, no cuando alguien quiere pedir. Lo cubre la Tarea 10, Step 1:
   - el usuario confirma los nombres en Vercel;
   - recorrido de Qué pedir, Inicio y Órdenes en producción con un usuario de edición, buscando "no está configurado" y "no hay ventas";
   - lista de quienes usaban Comercializadora con el módulo dado.

---

### Task 1: OVs desde los pedidos (migración 50)

**Files:**
- Create: `supabase/migrations/20261114000050_comercializadora_ov_pedidos.sql`
- Test: `tests/db/comercializadora-ov.test.ts`

**Interfaces:**
- Consumes:
  - vistas del puente: `public.com_legado_pedidos` (`id`, `apertura_id`, `fecha_pedido`, `status`, `items`, `items_editados`, `shopify_order_number`) y `public.com_legado_aperturas` (`id`, `sucursal`), de las migraciones 46 y 49. En PGlite son tablas locales `legado.*`;
  - `public.com_sku_mapping (shopify_nombre unique, sku)`, `public.com_movimientos`, `public.com_sync_log`, de la migración 45.
- Produces:
  - `public.com_ov_cantidad(v jsonb) returns numeric`: `Number(v || 1)` de JS;
  - `public.com_ov_plan(p_existentes jsonb, p_ventana_dias integer default 45) returns table (accion text, folio text, sku text, cantidad numeric, estado_antes text, estado text, movimiento_id text, pedido_id uuid, renglon bigint, sucursal text, fecha date)`:
    - `accion` ∈ `insertar` | `avanzar` | `reabierto` | `ambiguo`;
    - `p_existentes` = arreglo JSON de `{ id, folio, estado }`, que pueden ser las filas del portal o las del viejo;
  - `public.com_derivar_ov(p_aplicar boolean default false, p_ventana_dias integer default 45) returns jsonb`:
    - devuelve `{ ok, modo, insertar, folios_insertar, avanzar, insertadas, avanzadas, reabiertos: [], ambiguos: [], muestra: [] }`, o `{ ok: false, error }`, o `{ ok: true, omitida }`;
    - deja una fila `com_sync_log` con `proceso = 'com-ov-pedidos'`;
  - job `com-ov-pedidos` (`10,40 * * * *`, `select public.com_derivar_ov(true)`), **inactivo**.

- [ ] **Step 1: Write the failing test**

Crear `tests/db/comercializadora-ov.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo, num } from './utilidades';

const ID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;
type Ped = {
  n: number;
  status: string;
  items?: unknown;
  items_editados?: unknown;
  folio?: string | null;
  apertura?: string | null;
  dias?: number;
};

async function pedido(db: PGlite, p: Ped) {
  await db.query(
    `insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, items_editados, shopify_order_number)
     values ($1, $2, now() - make_interval(days => $3), $4, $5::jsonb, $6::jsonb, $7)`,
    [
      ID(p.n),
      p.apertura === undefined ? 'A1' : p.apertura,
      p.dias ?? 1,
      p.status,
      JSON.stringify(p.items ?? [{ nombre: 'Vaso 12oz', cantidad: 2 }]),
      p.items_editados === undefined ? null : JSON.stringify(p.items_editados),
      p.folio === undefined ? `#${1000 + p.n}` : p.folio,
    ],
  );
}

type Fila = { folio: string; sku: string; cantidad: string; estado: string; sucursal: string; realizado_por: string };
const ventas = async (db: PGlite) =>
  (
    await db.query<Fila>(
      `select folio, sku, cantidad::text, estado, sucursal, realizado_por from com_movimientos
       where tipo = 'venta' order by folio, sku, cantidad`,
    )
  ).rows;
const derivar = async (db: PGlite, aplicar = true, ventana = 45) =>
  (await db.query<{ r: Record<string, unknown> }>('select public.com_derivar_ov($1, $2) r', [aplicar, ventana])).rows[0].r;

describe('OVs desde los pedidos (migración 50)', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
    await db.exec(`
      insert into legado.aperturas (id, estatus, fecha, sucursal) values ('A1', 'en_proceso', '2026-12-01', 'Polanco');
      insert into com_sku_mapping (shopify_nombre, sku) values ('Vaso 12oz', 'VAS-12'), ('Tapa 12oz', 'TAP-12');`);
  });

  it('pagado sin filas: una fila por artículo mapeado, por_enviar, con la sucursal de la apertura', async () => {
    await pedido(db, {
      n: 1,
      status: 'pagado',
      items: [
        { nombre: 'Vaso 12oz', cantidad: 2 },
        { nombre: 'Tapa 12oz', cantidad: '3' },
        { nombre: 'Sin mapeo', cantidad: 1 },
        { nombre: 'Popote', sku: 'POP-1', cantidad: 0 },
      ],
    });
    const r = await derivar(db);
    expect(r).toMatchObject({ ok: true, modo: 'aplicar', insertar: 3, insertadas: 3, avanzar: 0 });
    expect(await ventas(db)).toEqual([
      { folio: '#1001', sku: 'POP-1', cantidad: '1', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
      { folio: '#1001', sku: 'TAP-12', cantidad: '3', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
      { folio: '#1001', sku: 'VAS-12', cantidad: '2', estado: 'por_enviar', sucursal: 'Polanco', realizado_por: 'com-ov-pedidos' },
    ]);
    const f = await db.query<{ ok: boolean }>(
      `select fecha = fecha_envio and cantidad = cantidad_original and fecha = (now() at time zone 'UTC')::date - 1 ok
       from com_movimientos where tipo = 'venta'`,
    );
    expect(f.rows.every((x) => x.ok)).toBe(true);
  });

  it('items_editados manda sobre items, aunque venga vacío; folio PED- sin número de Shopify', async () => {
    await pedido(db, { n: 2, status: 'pagado', items_editados: [{ nombre: 'Tapa 12oz', cantidad: 5 }], folio: null });
    await pedido(db, { n: 3, status: 'pagado', items_editados: [], folio: '' });
    await derivar(db);
    expect((await ventas(db)).map((f) => [f.folio, f.sku, f.cantidad])).toEqual([['PED-000002', 'TAP-12', '5']]);
  });

  it('solo pedidos con apertura y en los status que cuentan', async () => {
    await pedido(db, { n: 4, status: 'pagado', apertura: null });
    await pedido(db, { n: 5, status: 'pagado', apertura: '' });
    for (const [n, status] of [[6, 'recibido'], [7, 'con_incidencia'], [8, 'cancelacion_pendiente'], [9, 'cancelado']] as const)
      await pedido(db, { n, status });
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0 });
    expect(await ventas(db)).toEqual([]);
  });

  it('empacado cuenta como por_enviar y enviado/entregado/terminado se insertan ya enviados', async () => {
    for (const [n, status] of [[10, 'empacado'], [11, 'enviado'], [12, 'entregado'], [13, 'terminado']] as const)
      await pedido(db, { n, status });
    await derivar(db);
    expect((await ventas(db)).map((f) => [f.folio, f.estado])).toEqual([
      ['#1010', 'por_enviar'], ['#1011', 'enviado'], ['#1012', 'enviado'], ['#1013', 'enviado'],
    ]);
  });

  it('idempotente: la segunda corrida no inserta ni cambia nada', async () => {
    await pedido(db, { n: 14, status: 'pagado' });
    await derivar(db);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, insertadas: 0, avanzadas: 0 });
    expect(await ventas(db)).toHaveLength(1);
  });

  it('solo avanza: pagado → enviado → cancelado, y un "Marcar enviado" del portal no regresa', async () => {
    await pedido(db, { n: 15, status: 'pagado' });
    await derivar(db);
    await db.exec(`update com_movimientos set estado = 'enviado' where folio = '#1015'`); // Marcar enviado
    expect(await derivar(db)).toMatchObject({ avanzar: 0 });
    expect((await ventas(db))[0].estado).toBe('enviado');
    await db.exec(`update legado.pedidos set status = 'cancelado' where id = '${ID(15)}'`);
    expect(await derivar(db)).toMatchObject({ avanzar: 1, avanzadas: 1 });
    expect((await ventas(db))[0].estado).toBe('cancelado');
  });

  it('un cancelado que vuelve a pagado se reporta como reabierto y no se toca', async () => {
    await pedido(db, { n: 16, status: 'cancelado' });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1016', 'VAS-12', 2, 'cancelado')`);
    await db.exec(`update legado.pedidos set status = 'pagado' where id = '${ID(16)}'`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, reabiertos: ['#1016'] });
    expect((await ventas(db))[0].estado).toBe('cancelado');
  });

  it('las cantidades de una fila existente no se rehacen (como el viejo, que solo creaba al pagar)', async () => {
    await pedido(db, { n: 17, status: 'pagado' });
    await derivar(db);
    await db.exec(`update legado.pedidos set items_editados = '[{"nombre":"Vaso 12oz","cantidad":9}]' where id = '${ID(17)}'`);
    expect(await derivar(db)).toMatchObject({ insertar: 0 });
    expect((await ventas(db))[0].cantidad).toBe('2');
  });

  it('fuera de la ventana no se inserta, pero sí avanza lo que ya tiene filas', async () => {
    await pedido(db, { n: 18, status: 'enviado', dias: 60 });
    await pedido(db, { n: 19, status: 'enviado', dias: 60 });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1019', 'VAS-12', 2, 'por_enviar')`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 1 });
    expect((await ventas(db)).map((f) => [f.folio, f.estado])).toEqual([['#1019', 'enviado']]);
    expect(await derivar(db, true, 90)).toMatchObject({ insertar: 1 });
  });

  it('dos pedidos con el mismo folio: ambiguo, sin tocar', async () => {
    await pedido(db, { n: 20, status: 'pagado', folio: '#9' });
    await pedido(db, { n: 21, status: 'cancelado', folio: '#9' });
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0, ambiguos: ['#9'] });
  });

  it('las OVs manuales y los estados desconocidos no se tocan', async () => {
    await pedido(db, { n: 22, status: 'enviado' });
    await db.exec(`
      insert into com_movimientos (tipo, folio, sku, cantidad, estado) values
        ('venta', 'MANUAL-1', 'VAS-12', 1, 'por_enviar'), ('venta', '#1022', 'VAS-12', 2, 'parcial');`);
    expect(await derivar(db)).toMatchObject({ insertar: 0, avanzar: 0 });
  });

  it('en modo registrar cuenta lo que haría y no escribe; deja su rastro en com_sync_log', async () => {
    await pedido(db, { n: 23, status: 'pagado' });
    expect(await derivar(db, false)).toMatchObject({ ok: true, modo: 'registrar', insertar: 1, insertadas: 0 });
    expect(await ventas(db)).toEqual([]);
    const log = await db.query<{ ok: boolean; modo: string }>(
      `select ok, resumen ->> 'modo' modo from com_sync_log where proceso = 'com-ov-pedidos'`,
    );
    expect(log.rows).toEqual([{ ok: true, modo: 'registrar' }]);
  });

  it('si el puente falla, registra el error y no deja filas a medias', async () => {
    await pedido(db, { n: 24, status: 'pagado' });
    await db.exec('drop view public.com_legado_pedidos'); // como el servidor legado sin responder
    const r = await derivar(db);
    expect(r.ok).toBe(false);
    expect(await ventas(db)).toEqual([]);
    const log = await db.query<{ ok: boolean; error: string }>(
      `select ok, error from com_sync_log where proceso = 'com-ov-pedidos'`,
    );
    expect(log.rows[0].ok).toBe(false);
    expect(log.rows[0].error).toMatch(/com_legado_pedidos/);
  });

  it('com_ov_plan recibe filas de fuera (la paridad le pasa las del viejo) sin leer com_movimientos', async () => {
    await pedido(db, { n: 25, status: 'enviado' });
    await db.exec(`insert into com_movimientos (tipo, folio, sku, cantidad, estado) values ('venta', '#1025', 'VAS-12', 2, 'enviado')`);
    const r = await db.query<{ accion: string; estado_antes: string; estado: string }>(
      `select accion, estado_antes, estado from public.com_ov_plan($1::jsonb)`,
      [JSON.stringify([{ id: 'x', folio: '#1025', estado: 'por_enviar' }])],
    );
    expect(r.rows).toEqual([{ accion: 'avanzar', estado_antes: 'por_enviar', estado: 'enviado' }]);
  });

  it('cantidad como en JS: Number(it.cantidad || 1)', async () => {
    const r = await db.query<{ v: string | null }>(
      `select public.com_ov_cantidad(x)::text v from unnest(array[null, 'null', '0', '""', 'false', 'true', '4',
         '"2.5"', '" 7 "', '"  "', '"0"', '"abc"', '{}']::jsonb[]) with ordinality t(x, i) order by i`,
    );
    expect(r.rows.map((x) => x.v)).toEqual(['1', '1', '1', '1', '1', '1', '4', '2.5', '7', '0', '0', null, null]);
  });

  it('nadie con sesión ejecuta las funciones (leen pedidos del puente)', async () => {
    const id = await crearUsuario(db, 'admin');
    await darModulo(db, id, 'comercializadora', 'desarrollador');
    for (const sql of ['select public.com_derivar_ov(false)', `select * from public.com_ov_plan('[]')`, `select public.com_ov_cantidad('1')`])
      await expect(comoUsuario(db, id, () => db.query(sql))).rejects.toThrow(/permission denied/);
    const r = await db.query<{ n: number }>(
      `select count(*) n from information_schema.routine_privileges
       where routine_name in ('com_ov_plan', 'com_derivar_ov', 'com_ov_cantidad') and grantee in ('anon', 'authenticated', 'PUBLIC')`,
    );
    expect(num(r.rows[0].n)).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/db/comercializadora-ov.test.ts`
Expected: FAIL, las 16 pruebas, con `function public.com_derivar_ov(unknown, unknown) does not exist` (o `com_ov_plan(jsonb)` / `com_ov_cantidad(jsonb)`).

- [ ] **Step 3: Write minimal implementation**

Crear `supabase/migrations/20261114000050_comercializadora_ov_pedidos.sql`:

```sql
-- OVs desde los pedidos (plan 4, decisión 1). Sustituye a _comSyncPedidoPagado, _comSyncPedidoEnviado y
-- _comLiberarComprometido del HTML viejo: el portal deriva las filas com_movimientos tipo 'venta' de los pedidos
-- que lee por el puente (com_legado_*), con el mapeo del portal (com_sku_mapping).
-- Reglas (las del viejo, salvo lo marcado):
--   * Entran los pedidos con apertura_id y status pagado/empacado (por_enviar), enviado/entregado/terminado (enviado)
--     o cancelado (cancelado). 'empacado' es nuevo: en el viejo un pedido pasaba por 'pagado' antes de empacarse.
--   * Folio = shopify_order_number o 'PED-' + los últimos 6 caracteres del id. Renglones = items_editados si no es
--     null, si no items; cada artículo con nombre y (sku o mapeo exacto por nombre) da una fila; cantidad = it.cantidad||1.
--   * Un folio sin filas venta se inserta (por_enviar o enviado) si el pedido es de los últimos p_ventana_dias días.
--   * Un folio con filas solo avanza: por_enviar → enviado → cancelado. Nunca regresa (respeta "Marcar enviado"
--     del portal); un cancelado que vuelve a pagado se reporta como 'reabierto' y no se toca.
--   * Dos pedidos con el mismo folio se reportan como 'ambiguo' y no se tocan.
-- Las funciones son security invoker y nadie más que postgres/service_role las ejecuta: leen pedidos del puente.

create function public.com_ov_cantidad(v jsonb) returns numeric
language sql immutable set search_path = '' as $$
  -- Number(it.cantidad || 1) de JS: falsy → 1; texto numérico → número; texto vacío de espacios → 0; otro → null.
  select case
    when v is null or v in ('null'::jsonb, 'false'::jsonb, '0'::jsonb, '""'::jsonb) then 1::numeric
    when v = 'true'::jsonb then 1::numeric
    when pg_catalog.jsonb_typeof(v) = 'number' then (v #>> '{}')::numeric
    when pg_catalog.jsonb_typeof(v) = 'string' and pg_catalog.btrim(v #>> '{}') = '' then 0::numeric
    when pg_catalog.jsonb_typeof(v) = 'string'
         and pg_catalog.btrim(v #>> '{}') ~ '^[+-]?([0-9]+\.?[0-9]*|\.[0-9]+)([eE][+-]?[0-9]+)?$'
      then pg_catalog.btrim(v #>> '{}')::numeric
    else null
  end
$$;

create function public.com_ov_plan(p_existentes jsonb, p_ventana_dias integer default 45)
returns table (accion text, folio text, sku text, cantidad numeric, estado_antes text, estado text,
               movimiento_id text, pedido_id uuid, renglon bigint, sucursal text, fecha date)
language sql stable set search_path = '' as $$
  with ped as (
    select p.id, p.fecha_pedido,
           coalesce(nullif(p.shopify_order_number, ''), 'PED-' || right(p.id::text, 6)) as folio,
           coalesce(a.sucursal, '') as sucursal,
           case when p.items_editados is not null and pg_catalog.jsonb_typeof(p.items_editados) <> 'null'
                then p.items_editados else p.items end as items,
           case when p.status in ('pagado', 'empacado') then 'por_enviar'
                when p.status in ('enviado', 'entregado', 'terminado') then 'enviado'
                else 'cancelado' end as estado
    from public.com_legado_pedidos p
    left join public.com_legado_aperturas a on a.id = p.apertura_id
    where coalesce(p.apertura_id, '') <> ''
      and p.status in ('pagado', 'empacado', 'enviado', 'entregado', 'terminado', 'cancelado')),
  folios as (
    select f.folio, count(*) as n
    from ped f group by f.folio),
  unicos as (
    select p.* from ped p join folios f on f.folio = p.folio and f.n = 1),
  ex as (
    select e ->> 'id' as id, e ->> 'folio' as folio, e ->> 'estado' as estado
    from pg_catalog.jsonb_array_elements(coalesce(p_existentes, '[]'::jsonb)) e
    where coalesce(e ->> 'folio', '') <> ''),
  rango(estado, r) as (values ('por_enviar', 1), ('enviado', 2), ('cancelado', 3)),
  renglones as (
    select u.id, u.folio, u.sucursal, u.estado, u.fecha_pedido, it.n,
           coalesce(nullif(it.v ->> 'sku', ''), m.sku) as sku,
           public.com_ov_cantidad(it.v -> 'cantidad') as cantidad
    from unicos u
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(u.items) = 'array' then u.items else '[]'::jsonb end) with ordinality it(v, n)
    left join public.com_sku_mapping m on m.shopify_nombre = it.v ->> 'nombre'
    where coalesce(it.v ->> 'nombre', '') <> ''
      and coalesce(nullif(it.v ->> 'sku', ''), m.sku) is not null)
  select 'insertar', r.folio, r.sku, r.cantidad, null::text, r.estado, null::text, r.id, r.n, r.sucursal,
         coalesce((r.fecha_pedido at time zone 'UTC')::date, (now() at time zone 'UTC')::date)
  from renglones r
  where r.estado in ('por_enviar', 'enviado')
    and (r.fecha_pedido is null or r.fecha_pedido >= now() - pg_catalog.make_interval(days => p_ventana_dias))
    and not exists (select 1 from ex where ex.folio = r.folio)
  union all
  select 'avanzar', x.folio, null, null, x.estado, u.estado, x.id, u.id, null, null, null
  from ex x
  join unicos u on u.folio = x.folio
  join rango ra on ra.estado = x.estado
  join rango rb on rb.estado = u.estado
  where rb.r > ra.r
  union all
  select 'reabierto', u.folio, null, null, 'cancelado', u.estado, null, u.id, null, null, null
  from unicos u
  where u.estado <> 'cancelado'
    and exists (select 1 from ex where ex.folio = u.folio and ex.estado = 'cancelado')
  union all
  select 'ambiguo', f.folio, null, null, null, null, null, null, null, null, null
  from folios f where f.n > 1
$$;

create function public.com_derivar_ov(p_aplicar boolean default false, p_ventana_dias integer default 45)
returns jsonb
language plpgsql set search_path = '' as $$
declare
  v_log bigint;
  v_res jsonb;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(pg_catalog.hashtext('com-ov-pedidos')) then
    return pg_catalog.jsonb_build_object('ok', true, 'omitida', 'otra corrida en curso');
  end if;
  insert into public.com_sync_log (proceso) values ('com-ov-pedidos') returning id into v_log;
  begin
    with plan as materialized (
      select * from public.com_ov_plan(
        (select coalesce(pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object('id', m.id, 'folio', m.folio, 'estado', m.estado)), '[]'::jsonb)
         from public.com_movimientos m where m.tipo = 'venta' and m.folio is not null),
        p_ventana_dias)),
    ins as (
      insert into public.com_movimientos
        (tipo, folio, sku, cantidad, cantidad_original, sucursal, fecha_envio, fecha, estado, realizado_por)
      select 'venta', p.folio, p.sku, p.cantidad, p.cantidad, p.sucursal, p.fecha, p.fecha, p.estado, 'com-ov-pedidos'
      from plan p where p_aplicar and p.accion = 'insertar'
      order by p.folio, p.renglon
      returning 1),
    upd as (
      update public.com_movimientos m set estado = p.estado
      from plan p
      where p_aplicar and p.accion = 'avanzar' and m.id = p.movimiento_id and m.estado = p.estado_antes
      returning 1)
    select pg_catalog.jsonb_build_object(
      'ok', true,
      'modo', case when p_aplicar then 'aplicar' else 'registrar' end,
      'insertar', (select count(*) from plan where accion = 'insertar'),
      'folios_insertar', (select count(distinct folio) from plan where accion = 'insertar'),
      'avanzar', (select count(*) from plan where accion = 'avanzar'),
      'insertadas', (select count(*) from ins),
      'avanzadas', (select count(*) from upd),
      'reabiertos', coalesce((select pg_catalog.jsonb_agg(distinct folio) from plan where accion = 'reabierto'), '[]'::jsonb),
      'ambiguos', coalesce((select pg_catalog.jsonb_agg(distinct folio) from plan where accion = 'ambiguo'), '[]'::jsonb),
      'muestra', coalesce((select pg_catalog.jsonb_agg(x) from (
          select pg_catalog.jsonb_build_object('accion', accion, 'folio', folio, 'sku', sku, 'estado', estado) x
          from plan where accion in ('insertar', 'avanzar') order by folio, sku limit 20) s), '[]'::jsonb))
    into v_res;
    update public.com_sync_log set fin = now(), ok = true, resumen = v_res where id = v_log;
    return v_res;
  exception when others then
    update public.com_sync_log set fin = now(), ok = false, error = sqlerrm where id = v_log;
    return pg_catalog.jsonb_build_object('ok', false, 'error', sqlerrm);
  end;
end $$;

revoke execute on function public.com_ov_cantidad(jsonb) from public, anon, authenticated;
revoke execute on function public.com_ov_plan(jsonb, integer) from public, anon, authenticated;
revoke execute on function public.com_derivar_ov(boolean, integer) from public, anon, authenticated;
grant execute on function public.com_ov_cantidad(jsonb), public.com_ov_plan(jsonb, integer),
  public.com_derivar_ov(boolean, integer) to service_role;

-- Job creado INACTIVO, como los de la migración 47: se activa en el cutover (plan 4, Tarea 9).
do $$
declare
  j record;
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron')
     and exists (select 1 from pg_roles where rolname = 'supabase_admin') then
    perform cron.schedule('com-ov-pedidos', '10,40 * * * *', $c$ select public.com_derivar_ov(true) $c$);
    for j in select jobid from cron.job where jobname = 'com-ov-pedidos' loop
      perform cron.alter_job(j.jobid, active := false);
    end loop;
  end if;
end $$;
```

Notas para quien implementa:
- `plan as materialized` lee el puente **una vez** por corrida. Las inserciones y los avances salen del mismo plan, en la misma sentencia.
- El `update` exige `m.estado = p.estado_antes`: si alguien cambió la fila entre la lectura y la escritura, no se pisa.
- El bloque `exception` revierte lo de adentro (las filas) pero conserva la fila de `com_sync_log` con `ok = false`.
- `realizado_por = 'com-ov-pedidos'` distingue las filas derivadas. La paridad y la UI no lo usan.

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/db/comercializadora-ov.test.ts tests/db/comercializadora-puente.test.ts tests/db/guardia-lectura.test.ts tests/db/comercializadora.test.ts`
Expected: PASS. Las 16 nuevas, más las del puente, la guardia de lectura (ninguna vista ni política nueva) y la base de comercializadora.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20261114000050_comercializadora_ov_pedidos.sql tests/db/comercializadora-ov.test.ts
git commit -m "feat(comercializadora): OVs desde los pedidos del puente (migración 50)"
```

---

### Task 2: Paridad: la comparación

**Files:**
- Create: `scripts/migracion-legado/paridad-comercializadora-lib.ts`
- Test: `tests/migracion-legado/paridad-comercializadora.test.ts`

**Interfaces:**
- Consumes: nada (funciones puras). `AccionOv` tiene la forma de las filas de `com_ov_plan` (Tarea 1).
- Produces (`paridad-comercializadora-lib.ts`):
  - tipos `FilaMinmax`, `OcLado`, `Corrida`, `Lado { minmax; ocs; corridas; firmasSku: Record<string,string>; firmasProv: Record<string,string>; firmaGlobal: string }`, `AccionOv`, `Causa = 'motor' | 'entrada' | 'explicada'`, `Diferencia { clave; seccion; detalle; viejo; portal; causa; motivo? }`, `Explicada { clave; motivo }` y `ResultadoDia { fecha; completo; faltan: string[]; verde; conteos; diferencias }`;
  - `compararMinmax(v: Lado, p: Lado): Diferencia[]`, `compararOcs(v, p): Diferencia[]` y `diferenciasOv(acciones: AccionOv[]): Diferencia[]`;
  - `evaluarDia(fecha, viejo, portal, acciones, explicadas): ResultadoDia`;
  - `racha(dias: { fecha; verde }[], hasta: string): number`;
  - `reporteParidad(r: ResultadoDia, rachaDias: number): string`;
  - `TOLERANCIA = 0.01` y `DIAS_REQUERIDOS = 3`.
- Claves de diferencia (las usa `explicadas.json`): `minmax:<sku>:minimo|maximo|falta`, `oc:<vendor_id>:<sku>`, `ov:insertar:<folio>:<sku>`, `ov:avanzar:<folio>:<antes>><después>`, `ov:reabierto:<folio>` y `ov:ambiguo:<folio>`.

- [ ] **Step 1: Write the failing test**

Crear `tests/migracion-legado/paridad-comercializadora.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import {
  type AccionOv,
  compararMinmax,
  compararOcs,
  diferenciasOv,
  evaluarDia,
  type Lado,
  racha,
  reporteParidad,
} from '../../scripts/migracion-legado/paridad-comercializadora-lib';

const lado = (o: Partial<Lado> = {}): Lado => ({
  minmax: [{ sku: 'A', minimo: 10, maximo: 20, calculado_at: '2026-11-20 12:30:01+00' }],
  ocs: [{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }],
  corridas: [
    { proceso: 'com-minmax', ok: true },
    { proceso: 'zoho-generar-oc', ok: true },
  ],
  firmasSku: { A: 'fa', B: 'fb' },
  firmasProv: { V1: 'p1' },
  firmaGlobal: 'g',
  ...o,
});

describe('paridad: mín/máx', () => {
  it('igual (dentro de la tolerancia) no da diferencias', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 10.004, maximo: 20, calculado_at: null }] });
    expect(compararMinmax(lado(), p)).toEqual([]);
  });

  it('un mínimo distinto con las mismas entradas es del motor; con otras entradas, no comparable', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 12, maximo: 20, calculado_at: null }] });
    expect(compararMinmax(lado(), p)).toEqual([
      { clave: 'minmax:A:minimo', seccion: 'minmax', detalle: 'minimo', viejo: 10, portal: 12, causa: 'motor' },
    ]);
    expect(compararMinmax(lado(), { ...p, firmasSku: { A: 'otra' } })[0].causa).toBe('entrada');
  });

  it('un SKU de un solo lado se reporta; null contra número también', () => {
    const p = lado({
      minmax: [
        { sku: 'A', minimo: null, maximo: 20, calculado_at: null },
        { sku: 'B', minimo: 1, maximo: 2, calculado_at: null },
      ],
    });
    expect(compararMinmax(lado(), p).map((d) => [d.clave, d.detalle])).toEqual([
      ['minmax:A:minimo', 'minimo'],
      ['minmax:B:falta', 'solo en el portal'],
    ]);
  });
});

describe('paridad: OCs automáticas', () => {
  it('suma por proveedor y SKU aunque vengan en varias OCs', () => {
    const p = lado({
      ocs: [
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 2 }] },
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 3 }] },
      ],
    });
    expect(compararOcs(lado(), p)).toEqual([]);
  });

  it('cantidad distinta, SKU de más y proveedor que solo pidió uno de los dos', () => {
    const p = lado({
      ocs: [
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 6 }, { sku: 'B', cantidad: 1 }] },
        { vendor_id: 'V2', vendor_name: 'Vasos', lineas: [{ sku: 'C', cantidad: 4 }] },
      ],
      firmasProv: { V1: 'p1', V2: 'p2' },
    });
    expect(compararOcs(lado(), p).map((d) => [d.clave, d.viejo, d.portal, d.causa])).toEqual([
      ['oc:V1:A', 5, 6, 'motor'],
      ['oc:V1:B', 0, 1, 'motor'],
      ['oc:V2:C', 0, 4, 'entrada'], // V2 no existe en com_zoho_proveedor del viejo: entradas distintas
    ]);
  });
});

describe('paridad: OVs', () => {
  it('cada acción de com_ov_plan es una diferencia; avanzar se agrupa por folio', () => {
    const acciones: AccionOv[] = [
      { accion: 'insertar', folio: '#1', sku: 'A', estado_antes: null, estado: 'por_enviar' },
      { accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' },
      { accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' },
      { accion: 'ambiguo', folio: '#9', sku: null, estado_antes: null, estado: null },
    ];
    expect(diferenciasOv(acciones).map((d) => d.clave)).toEqual([
      'ov:insertar:#1:A',
      'ov:avanzar:#2:por_enviar>cancelado',
      'ov:ambiguo:#9',
    ]);
  });
});

describe('paridad: el día', () => {
  it('verde: completo y sin diferencias del motor (las de entrada no cuentan)', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 99, maximo: 20, calculado_at: null }], firmasSku: { A: 'x' } });
    const r = evaluarDia('2026-11-20', lado(), p, [], []);
    expect(r).toMatchObject({ completo: true, verde: true, faltan: [] });
    expect(r.diferencias[0].causa).toBe('entrada');
  });

  it('una diferencia explicada no rompe el verde y lleva su motivo', () => {
    const acc: AccionOv[] = [{ accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' }];
    const r = evaluarDia('2026-11-20', lado(), lado(), acc, [
      { clave: 'ov:avanzar:#2:por_enviar>cancelado', motivo: 'cancelación masiva del viejo no liberaba' },
    ]);
    expect(r.verde).toBe(true);
    expect(r.diferencias[0]).toMatchObject({ causa: 'explicada', motivo: 'cancelación masiva del viejo no liberaba' });
  });

  it('incompleto si un lado no corrió com-minmax o la OC ese día, o si la configuración difiere', () => {
    const r = evaluarDia('2026-11-20', lado({ corridas: [{ proceso: 'com-minmax', ok: true }] }), lado({ firmaGlobal: 'h' }), [], []);
    expect(r.completo).toBe(false);
    expect(r.verde).toBe(false);
    expect(r.faltan).toEqual([
      'viejo: sin zoho-generar-oc correcto ese día',
      'configuración, parámetros o mapeo distintos (copiar editables)',
    ]);
  });

  it('racha: días de calendario seguidos y verdes que terminan en la fecha', () => {
    const d = (fecha: string, verde = true) => ({ fecha, verde });
    expect(racha([d('2026-11-28'), d('2026-11-29'), d('2026-11-30'), d('2026-12-01')], '2026-12-01')).toBe(4);
    expect(racha([d('2026-11-28'), d('2026-11-30'), d('2026-12-01')], '2026-12-01')).toBe(2);
    expect(racha([d('2026-11-29'), d('2026-11-30', false), d('2026-12-01')], '2026-12-01')).toBe(1);
    expect(racha([d('2026-11-29'), d('2026-11-30')], '2026-12-01')).toBe(0);
  });

  it('reporte legible con el estado, las secciones y la racha', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 12, maximo: 20, calculado_at: null }] });
    const txt = reporteParidad(evaluarDia('2026-11-20', lado(), p, [], []), 0);
    expect(txt).toContain('Paridad Comercializadora 2026-11-20: CON DIFERENCIAS');
    expect(txt).toContain('Diferencias sin explicar (1):');
    expect(txt).toContain('minmax:A:minimo  viejo=10 portal=12  minimo');
    expect(txt).toContain('Racha: 0 de 3 días seguidos sin diferencias.');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/migracion-legado/paridad-comercializadora.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion-legado/paridad-comercializadora-lib'` ("no tests").

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/migracion-legado/paridad-comercializadora-lib.ts`:

```ts
/**
 * Plan 4 · Paridad diaria de Comercializadora (spec, Cutover paso 2). Funciones puras: comparan lo que leyó
 * paridad-comercializadora-datos.ts de los dos lados. Sin E/S.
 */

export interface FilaMinmax {
  sku: string;
  minimo: number | null;
  maximo: number | null;
  calculado_at: string | null;
}
export interface OcLado {
  vendor_id: string | null;
  vendor_name: string | null;
  lineas: { sku: string; cantidad: number }[];
}
export interface Corrida {
  proceso: string;
  ok: boolean | null;
}
/** Lo de un lado (viejo o portal) para un día de CDMX. Las firmas resumen las entradas que el motor usa. */
export interface Lado {
  minmax: FilaMinmax[];
  ocs: OcLado[];
  corridas: Corrida[];
  firmasSku: Record<string, string>;
  firmasProv: Record<string, string>;
  firmaGlobal: string;
}
/** Una fila de public.com_ov_plan (migración 50). */
export interface AccionOv {
  accion: 'insertar' | 'avanzar' | 'reabierto' | 'ambiguo';
  folio: string;
  sku: string | null;
  estado_antes: string | null;
  estado: string | null;
}
export type Causa = 'motor' | 'entrada' | 'explicada';
export interface Diferencia {
  clave: string;
  seccion: 'minmax' | 'oc' | 'ov';
  detalle: string;
  viejo: number | string | null;
  portal: number | string | null;
  causa: Causa;
  motivo?: string;
}
export interface Explicada {
  clave: string;
  motivo: string;
}
export interface ResultadoDia {
  fecha: string;
  completo: boolean;
  faltan: string[];
  verde: boolean;
  conteos: { skus: number; proveedores: number; folios: number };
  diferencias: Diferencia[];
}

export const TOLERANCIA = 0.01;
const PROCESOS = ['com-minmax', 'zoho-generar-oc'] as const;

const distinto = (a: number | null, b: number | null) =>
  a == null || b == null ? a !== b : Math.abs(a - b) > TOLERANCIA;

export function compararMinmax(v: Lado, p: Lado): Diferencia[] {
  const mv = new Map(v.minmax.map((f) => [f.sku, f]));
  const mp = new Map(p.minmax.map((f) => [f.sku, f]));
  const skus = [...new Set([...mv.keys(), ...mp.keys()])].sort();
  const out: Diferencia[] = [];
  for (const sku of skus) {
    const a = mv.get(sku);
    const b = mp.get(sku);
    const causa: Causa = v.firmasSku[sku] === p.firmasSku[sku] ? 'motor' : 'entrada';
    if (!a || !b) {
      out.push({
        clave: `minmax:${sku}:falta`,
        seccion: 'minmax',
        detalle: a ? 'solo en el viejo' : 'solo en el portal',
        viejo: a ? a.minimo : null,
        portal: b ? b.minimo : null,
        causa,
      });
      continue;
    }
    for (const campo of ['minimo', 'maximo'] as const)
      if (distinto(a[campo], b[campo]))
        out.push({ clave: `minmax:${sku}:${campo}`, seccion: 'minmax', detalle: campo, viejo: a[campo], portal: b[campo], causa });
  }
  return out;
}

const llaveProv = (o: OcLado) => o.vendor_id ?? o.vendor_name ?? '?';

function porProveedor(ocs: OcLado[]): Map<string, { nombre: string; skus: Map<string, number> }> {
  const m = new Map<string, { nombre: string; skus: Map<string, number> }>();
  for (const o of ocs) {
    const k = llaveProv(o);
    const g = m.get(k) ?? { nombre: o.vendor_name ?? k, skus: new Map<string, number>() };
    for (const l of o.lineas) g.skus.set(l.sku, (g.skus.get(l.sku) ?? 0) + Number(l.cantidad));
    m.set(k, g);
  }
  return m;
}

export function compararOcs(v: Lado, p: Lado): Diferencia[] {
  const gv = porProveedor(v.ocs);
  const gp = porProveedor(p.ocs);
  const out: Diferencia[] = [];
  for (const k of [...new Set([...gv.keys(), ...gp.keys()])].sort()) {
    const a = gv.get(k);
    const b = gp.get(k);
    const nombre = (a ?? b)!.nombre;
    for (const sku of [...new Set([...(a?.skus.keys() ?? []), ...(b?.skus.keys() ?? [])])].sort()) {
      const x = a?.skus.get(sku) ?? 0;
      const y = b?.skus.get(sku) ?? 0;
      if (Math.abs(x - y) <= TOLERANCIA) continue;
      const entrada = v.firmasProv[k] !== p.firmasProv[k] || v.firmasSku[sku] !== p.firmasSku[sku];
      out.push({
        clave: `oc:${k}:${sku}`,
        seccion: 'oc',
        detalle: `${nombre} · ${sku}`,
        viejo: x,
        portal: y,
        causa: entrada ? 'entrada' : 'motor',
      });
    }
  }
  return out;
}

/** Lo que la derivación haría sobre las filas del viejo: en paridad perfecta, nada. */
export function diferenciasOv(acciones: AccionOv[]): Diferencia[] {
  const vistas = new Map<string, Diferencia>();
  for (const a of acciones) {
    const cola =
      a.accion === 'insertar' ? `:${a.sku}` : a.accion === 'avanzar' ? `:${a.estado_antes}>${a.estado}` : '';
    const clave = `ov:${a.accion}:${a.folio}${cola}`;
    if (vistas.has(clave)) continue;
    const detalle = {
      insertar: `el viejo no tiene la OV de ${a.sku} (${a.estado})`,
      avanzar: `el viejo la tiene en ${a.estado_antes}; el pedido dice ${a.estado}`,
      reabierto: `cancelada en el viejo; el pedido volvió a ${a.estado}`,
      ambiguo: 'dos pedidos con el mismo folio',
    }[a.accion];
    vistas.set(clave, {
      clave,
      seccion: 'ov',
      detalle: `${a.folio}: ${detalle}`,
      viejo: a.estado_antes,
      portal: a.estado,
      causa: 'motor',
    });
  }
  return [...vistas.values()];
}

export function evaluarDia(
  fecha: string,
  viejo: Lado,
  portal: Lado,
  acciones: AccionOv[],
  explicadas: Explicada[],
): ResultadoDia {
  const faltan: string[] = [];
  for (const [nombre, lado] of [['viejo', viejo], ['portal', portal]] as const)
    for (const proc of PROCESOS)
      if (!lado.corridas.some((c) => c.proceso === proc && c.ok === true)) faltan.push(`${nombre}: sin ${proc} correcto ese día`);
  if (viejo.firmaGlobal !== portal.firmaGlobal) faltan.push('configuración, parámetros o mapeo distintos (copiar editables)');
  const motivo = new Map(explicadas.map((e) => [e.clave, e.motivo]));
  const diferencias = [...compararMinmax(viejo, portal), ...compararOcs(viejo, portal), ...diferenciasOv(acciones)].map(
    (d) => (motivo.has(d.clave) ? { ...d, causa: 'explicada' as const, motivo: motivo.get(d.clave) } : d),
  );
  const completo = faltan.length === 0;
  return {
    fecha,
    completo,
    faltan,
    verde: completo && !diferencias.some((d) => d.causa === 'motor'),
    conteos: {
      skus: new Set([...viejo.minmax, ...portal.minmax].map((f) => f.sku)).size,
      proveedores: new Set([...viejo.ocs, ...portal.ocs].map(llaveProv)).size,
      folios: new Set(acciones.map((a) => a.folio)).size,
    },
    diferencias,
  };
}

/** Días verdes seguidos (de calendario) que terminan en `hasta`. Un día que falta o no es verde corta la racha. */
export function racha(dias: { fecha: string; verde: boolean }[], hasta: string): number {
  const verde = new Map(dias.map((d) => [d.fecha, d.verde]));
  const fechas = [...verde.keys()].filter((f) => f <= hasta).sort();
  let n = 0;
  let esperado = hasta;
  for (let i = fechas.length - 1; i >= 0; i--) {
    if (fechas[i] !== esperado || !verde.get(fechas[i])) break;
    n++;
    const d = new Date(`${esperado}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    esperado = d.toISOString().slice(0, 10);
  }
  return n;
}

export const DIAS_REQUERIDOS = 3;

export function reporteParidad(r: ResultadoDia, rachaDias: number): string {
  const lineas = [
    `Paridad Comercializadora ${r.fecha}: ${r.verde ? 'VERDE' : r.completo ? 'CON DIFERENCIAS' : 'INCOMPLETO'}`,
    `Comparados: ${r.conteos.skus} SKUs de mín/máx, ${r.conteos.proveedores} proveedores con OC, ${r.conteos.folios} folios con acción de OV.`,
    ...r.faltan.map((f) => `  falta: ${f}`),
  ];
  for (const causa of ['motor', 'entrada', 'explicada'] as const) {
    const ds = r.diferencias.filter((d) => d.causa === causa);
    if (!ds.length) continue;
    lineas.push(
      {
        motor: `Diferencias sin explicar (${ds.length}):`,
        entrada: `Entradas distintas, no comparables (${ds.length}):`,
        explicada: `Explicadas (${ds.length}):`,
      }[causa],
    );
    for (const d of ds)
      lineas.push(`  ${d.clave}  viejo=${d.viejo ?? '—'} portal=${d.portal ?? '—'}  ${d.detalle}${d.motivo ? ` · ${d.motivo}` : ''}`);
  }
  lineas.push(`Racha: ${rachaDias} de ${DIAS_REQUERIDOS} días seguidos sin diferencias.`);
  return lineas.join('\n');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/migracion-legado/paridad-comercializadora.test.ts`
Expected: PASS (11 pruebas).

- [ ] **Step 5: Commit**

```bash
git add scripts/migracion-legado/paridad-comercializadora-lib.ts tests/migracion-legado/paridad-comercializadora.test.ts
git commit -m "feat(migracion): comparación de la paridad diaria de Comercializadora"
```

---

### Task 3: Paridad: lecturas, conexión de solo lectura al portal y script diario

**Files:**
- Create: `scripts/migracion-legado/paridad-comercializadora-datos.ts`
- Create: `scripts/migracion-legado/paridad-comercializadora.ts`
- Create: `docs/migracion/paridad/explicadas.json`
- Modify: `scripts/migracion-legado/conexion.ts` (`conLegado` y la nueva `conPortalLectura` comparten `soloLectura`, en UTC)
- Test: `tests/migracion-legado/paridad-comercializadora-datos.test.ts`

**Interfaces:**
- Consumes:
  - Tarea 1: `public.com_ov_plan(jsonb, integer)`;
  - Tarea 2: `Lado`, `AccionOv`, `evaluarDia`, `racha`, `reporteParidad`, `DIAS_REQUERIDOS` y `Explicada`;
  - `Consultor` de `conexion.ts`.
- Produces:
  - `leerLado(db: Consultor, fecha: string, modo: 'real' | 'simulacion'): Promise<Lado>`;
  - `leerVentasViejas(db: Consultor): Promise<VentaVieja[]>`, con `VentaVieja { id; folio; estado }`;
  - `planOv(db: Consultor, existentes: VentaVieja[], ventanaDias = 45): Promise<AccionOv[]>`;
  - `conPortalLectura<T>(fn: (db: Consultor) => Promise<T>): Promise<T>` (lo usa también la Tarea 4);
  - CLI: `npx.cmd tsx scripts/migracion-legado/paridad-comercializadora.ts [--fecha=AAAA-MM-DD] [--guardar]`.

- [ ] **Step 1: Write the failing test**

Crear `tests/migracion-legado/paridad-comercializadora-datos.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import { leerLado, leerVentasViejas, planOv } from '../../scripts/migracion-legado/paridad-comercializadora-datos';
import { evaluarDia } from '../../scripts/migracion-legado/paridad-comercializadora-lib';

// Dos PGlite con las migraciones del portal: uno hace de bliocjvq (mismas tablas com_*) y otro de portal.
const FECHA = '2026-11-20';
const comun = `
  insert into com_catalogo (sku, nombre, estatus, cantidad_por_apertura) values ('A', 'Jarabe', 'activo', 2), ('B', 'Vaso', 'activo', 0);
  insert into com_lead_times (sku, dias) values ('A', 7), ('B', 10);
  insert into com_sku_mapping (shopify_nombre, sku) values ('Vaso 12oz', 'B');
  insert into com_parametros (clave, valor) values ('iva', 0.16);
  insert into com_zoho_proveedor (vendor_id, nombre, minimo_compra) values ('V1', 'Jarabes', 1500);
  insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo, skus)
    values ('V1', 'Jarabes', '2026-11-25', '2026-11-30', 'vacaciones', '{A}');
  insert into com_sync_log (proceso, inicio, fin, ok) values
    ('com-minmax', '2026-11-20 12:30:00+00', '2026-11-20 12:31:00+00', true),
    ('zoho-generar-oc', '2026-11-20 13:05:00+00', '2026-11-20 13:06:00+00', true),
    ('com-minmax', '2026-11-21 05:30:00+00', '2026-11-21 05:31:00+00', false);`;
const minmax = (minimo: number) => `
  insert into com_minmax (sku, venta_diaria, lead_time, minimo_calc, maximo_calc, minimo_manual, calculado_at)
    values ('A', 1.5, 7, ${minimo}, 30, null, '2026-11-20 12:30:30+00'), ('B', 3, 10, 5, 9, 6, '2026-11-20 12:30:30+00');`;

describe('paridad: lecturas (PGlite)', () => {
  let viejo: PGlite;
  let portal: PGlite;
  beforeAll(async () => {
    [viejo, portal] = await Promise.all([crearDbLocal(), crearDbLocal()]);
    await viejo.exec(`${comun}${minmax(12)}
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"real","max_edad_sync_horas":6},"inv":{"yulius":true}}');
      insert into com_oc_auto (corrida_id, fecha, origen, modo, vendor_id, vendor_name, lineas, estado) values
        (gen_random_uuid(), '${FECHA}', 'cron', 'real', 'V1', 'Jarabes', '[{"sku":"A","cantidad":5}]', 'creada'),
        (gen_random_uuid(), '${FECHA}', 'manual', 'real', 'V1', 'Jarabes', '[{"sku":"A","cantidad":50}]', 'creada'),
        (gen_random_uuid(), '${FECHA}', 'cron', 'simulacion', 'V9', 'Otro', '[{"sku":"B","cantidad":1}]', 'simulada');
      insert into com_movimientos (id, tipo, folio, sku, cantidad, estado) values
        ('m1', 'venta', '#1001', 'B', 2, 'por_enviar'), ('m2', 'compra', 'OC-1', 'A', 9, 'recibido');`);
    await portal.exec(`${comun}${minmax(14)}
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"simulacion","max_edad_sync_horas":6},"inv":{"yulius":true}}');
      insert into com_oc_auto (corrida_id, fecha, origen, modo, vendor_id, vendor_name, lineas, estado) values
        (gen_random_uuid(), '${FECHA}', 'cron', 'simulacion', 'V1', 'Jarabes', '[{"sku":"A","cantidad":5}]', 'simulada'),
        (gen_random_uuid(), '2026-11-19', 'cron', 'simulacion', 'V1', 'Jarabes', '[{"sku":"A","cantidad":7}]', 'simulada');
      insert into legado.aperturas (id, estatus, sucursal) values ('A1', 'en_proceso', 'Polanco');
      insert into legado.pedidos (id, apertura_id, fecha_pedido, status, items, shopify_order_number) values
        ('00000000-0000-0000-0000-000000000001', 'A1', now(), 'enviado', '[{"nombre":"Vaso 12oz","cantidad":2}]', '#1001'),
        ('00000000-0000-0000-0000-000000000002', 'A1', now(), 'pagado', '[{"nombre":"Vaso 12oz","cantidad":1}]', '#1002');`);
  });

  it('lee mín/máx efectivo, la OC del cron de ese día según el modo de cada lado y las corridas del día de CDMX', async () => {
    const v = await leerLado(viejo as unknown as Consultor, FECHA, 'real');
    const p = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    expect(v.minmax.map((f) => [f.sku, f.minimo, f.maximo])).toEqual([['A', 12, 30], ['B', 6, 9]]);
    expect(v.ocs).toEqual([{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }]);
    expect(p.ocs).toEqual([{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }]);
    // La corrida fallida de las 05:30 UTC del 21 es del 20 en CDMX (23:30).
    expect(v.corridas.map((c) => [c.proceso, c.ok]).sort()).toEqual([
      ['com-minmax', false], ['com-minmax', true], ['zoho-generar-oc', true],
    ]);
    expect(v.firmaGlobal).toBe(p.firmaGlobal); // auto.modo no cuenta
    expect(v.firmasSku).toEqual(p.firmasSku);
    expect(v.firmasProv).toEqual(p.firmasProv);
  });

  it('las firmas cambian si cambia una entrada (lead time, cierre o configuración)', async () => {
    const antes = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    await portal.exec(`begin;
      update com_lead_times set dias = 8 where sku = 'A';
      update com_proveedor_cierre set fin = '2026-12-02';
      update com_plan_config set config = jsonb_set(config, '{inv,yulius}', 'false');`);
    const despues = await leerLado(portal as unknown as Consultor, FECHA, 'simulacion');
    await portal.exec('rollback');
    expect(despues.firmasSku.A).not.toBe(antes.firmasSku.A);
    expect(despues.firmasSku.B).toBe(antes.firmasSku.B);
    expect(despues.firmasProv.V1).not.toBe(antes.firmasProv.V1);
    expect(despues.firmaGlobal).not.toBe(antes.firmaGlobal);
  });

  it('de punta a punta: OVs del viejo pasadas por com_ov_plan del portal y el día evaluado', async () => {
    const ventas = await leerVentasViejas(viejo as unknown as Consultor);
    expect(ventas).toEqual([{ id: 'm1', folio: '#1001', estado: 'por_enviar' }]);
    const acciones = await planOv(portal as unknown as Consultor, ventas);
    expect(acciones).toEqual([
      { accion: 'avanzar', folio: '#1001', sku: null, estado_antes: 'por_enviar', estado: 'enviado' },
      { accion: 'insertar', folio: '#1002', sku: 'B', estado_antes: null, estado: 'por_enviar' },
    ]);
    const r = evaluarDia(
      FECHA,
      await leerLado(viejo as unknown as Consultor, FECHA, 'real'),
      await leerLado(portal as unknown as Consultor, FECHA, 'simulacion'),
      acciones,
      [],
    );
    expect(r.completo).toBe(true);
    expect(r.verde).toBe(false);
    expect(r.diferencias.map((d) => d.clave)).toEqual([
      'minmax:A:minimo',
      'ov:avanzar:#1001:por_enviar>enviado',
      'ov:insertar:#1002:B',
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/migracion-legado/paridad-comercializadora-datos.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion-legado/paridad-comercializadora-datos'`.

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/migracion-legado/paridad-comercializadora-datos.ts`:

```ts
import type { Consultor } from './conexion';
import type { AccionOv, Lado } from './paridad-comercializadora-lib';

/**
 * Plan 4 · Lecturas de la paridad. Mismo SQL en los dos lados (bliocjvq y portal tienen las mismas tablas com_*).
 * Solo select: se corre dentro de conLegado / conPortalLectura (begin read only).
 */

/** Firma de las entradas por SKU que usa com-minmax (catálogo, lead time, manuales y kit). */
const SQL_FIRMAS_SKU = `
  select c.sku, md5(concat_ws('|', c.estatus, trim_scale(c.cantidad_por_apertura)::text, trim_scale(c.dias_seguridad)::text,
           c.zoho_lead_time::text, lt.dias::text, trim_scale(mm.minimo_manual)::text, trim_scale(mm.maximo_manual)::text,
           trim_scale(k.manual)::text)) firma
  from public.com_catalogo c
  left join public.com_lead_times lt on lt.sku = c.sku
  left join public.com_minmax mm on mm.sku = c.sku
  left join public.com_kit_apertura k on k.sku = c.sku`;

/** Firma por proveedor: mínimo de compra y cierres vigentes ese día. */
const SQL_FIRMAS_PROV = `
  select z.vendor_id, md5(concat_ws('|', trim_scale(z.minimo_compra)::text,
           (select string_agg(concat_ws(',', c.ini::text, c.fin::text, array_to_string(c.skus, ';')), '/' order by c.ini, c.id)
            from public.com_proveedor_cierre c
            where c.vendor_id = z.vendor_id and not c.cancelado and c.fin >= $1::date))) firma
  from public.com_zoho_proveedor z`;

/** Firma global: configuración sin auto.modo (viejo en real, portal en simulación), parámetros y mapeo. */
const SQL_FIRMA_GLOBAL = `
  select md5(concat_ws('|',
    (select (config #- '{auto,modo}')::text from public.com_plan_config where id = 1),
    (select string_agg(clave || '=' || trim_scale(valor)::text, ',' order by clave) from public.com_parametros),
    (select string_agg(shopify_nombre || '=' || sku, ',' order by shopify_nombre) from public.com_sku_mapping))) firma`;

/**
 * `modo` = cómo guarda ese lado la OC automática del cron: el viejo 'real' (creada, o error si Zoho falló: igual era
 * su propuesta) y el portal 'simulacion' (simulada). `fecha` = día de CDMX (AAAA-MM-DD).
 */
export async function leerLado(db: Consultor, fecha: string, modo: 'real' | 'simulacion'): Promise<Lado> {
  const minmax = await db.query<{ sku: string; minimo: number | null; maximo: number | null; calculado_at: string | null }>(
    `select sku, coalesce(minimo_manual, minimo_calc)::float8 minimo, coalesce(maximo_manual, maximo_calc)::float8 maximo,
            calculado_at::text calculado_at
     from public.com_minmax order by sku`,
  );
  const ocs = await db.query<{ vendor_id: string | null; vendor_name: string | null; lineas: unknown }>(
    `select vendor_id, vendor_name, lineas from public.com_oc_auto
     where fecha = $1::date and origen = 'cron' and modo = $2
       and estado = any(case when $2 = 'real' then array['creada', 'error'] else array['simulada'] end)
     order by id`,
    [fecha, modo],
  );
  const corridas = await db.query<{ proceso: string; ok: boolean | null }>(
    `select proceso, ok from public.com_sync_log
     where proceso in ('com-minmax', 'zoho-generar-oc') and fin is not null
       and (inicio at time zone 'America/Mexico_City')::date = $1::date`,
    [fecha],
  );
  const sku = await db.query<{ sku: string; firma: string }>(SQL_FIRMAS_SKU);
  const prov = await db.query<{ vendor_id: string; firma: string }>(SQL_FIRMAS_PROV, [fecha]);
  const global = await db.query<{ firma: string }>(SQL_FIRMA_GLOBAL);
  const lineas = (x: unknown) =>
    (Array.isArray(x) ? x : typeof x === 'string' ? (JSON.parse(x) as unknown[]) : []).map((l) => {
      const o = l as { sku?: unknown; cantidad?: unknown };
      return { sku: String(o.sku), cantidad: Number(o.cantidad) };
    });
  return {
    minmax: minmax.rows.map((f) => ({
      ...f,
      minimo: f.minimo == null ? null : Number(f.minimo),
      maximo: f.maximo == null ? null : Number(f.maximo),
    })),
    ocs: ocs.rows.map((o) => ({ vendor_id: o.vendor_id, vendor_name: o.vendor_name, lineas: lineas(o.lineas) })),
    corridas: corridas.rows,
    firmasSku: Object.fromEntries(sku.rows.map((f) => [f.sku, f.firma])),
    firmasProv: Object.fromEntries(prov.rows.map((f) => [f.vendor_id, f.firma])),
    firmaGlobal: global.rows[0]?.firma ?? '',
  };
}

export interface VentaVieja {
  id: string;
  folio: string;
  estado: string | null;
}

/** Filas venta del viejo (lado bliocjvq). */
export async function leerVentasViejas(db: Consultor): Promise<VentaVieja[]> {
  return (
    await db.query<VentaVieja>(
      `select id, folio, estado from public.com_movimientos where tipo = 'venta' and folio is not null order by id`,
    )
  ).rows;
}

/** Lo que la derivación del portal (com_ov_plan) haría sobre las filas del viejo. Lado portal, solo lectura. */
export async function planOv(db: Consultor, existentes: VentaVieja[], ventanaDias = 45): Promise<AccionOv[]> {
  return (
    await db.query<AccionOv>(
      `select accion, folio, sku, estado_antes, estado from public.com_ov_plan($1::jsonb, $2)
       order by accion, folio, sku nulls first`,
      [JSON.stringify(existentes), ventanaDias],
    )
  ).rows;
}
```

En `scripts/migracion-legado/conexion.ts`, sustituir la función `conLegado` completa (del comentario `/** bliocjvq en SOLO LECTURA: begin read only y siempre rollback. */` a su llave de cierre) por:

```ts
/** Lee en SOLO LECTURA: begin read only, en UTC, y siempre rollback. */
async function soloLectura<T>(c: pg.Client, fn: (db: Consultor) => Promise<T>): Promise<T> {
  try {
    await c.query('begin read only');
    await c.query("set local statement_timeout = '60s'");
    await c.query("set local timezone = 'UTC'");
    return await fn(c as unknown as Consultor);
  } finally {
    await c.query('rollback').catch(() => {});
    await c.end();
  }
}

/** bliocjvq en SOLO LECTURA. */
export async function conLegado<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  return soloLectura(await conectar('DATABASE_URL_LEGADO', PROYECTO_LEGADO, 'migracion-legado-lectura'), fn);
}

/** Portal en SOLO LECTURA (plan 4: paridad y reversa). */
export async function conPortalLectura<T>(fn: (db: Consultor) => Promise<T>): Promise<T> {
  return soloLectura(await conectar('DATABASE_URL', PROYECTO_PORTAL, 'migracion-legado-lectura-portal'), fn);
}
```

`set local timezone = 'UTC'` hace que `to_jsonb` de las fechas salga igual en los dos lados (copia y reversa). La copia existente no cambia de comportamiento: los `timestamptz` siguen siendo el mismo instante.

Crear `scripts/migracion-legado/paridad-comercializadora.ts`:

```ts
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { conLegado, conPortalLectura } from './conexion';
import { leerLado, leerVentasViejas, planOv } from './paridad-comercializadora-datos';
import {
  DIAS_REQUERIDOS,
  evaluarDia,
  type Explicada,
  racha,
  reporteParidad,
  type ResultadoDia,
} from './paridad-comercializadora-lib';

/**
 * Plan 4 · Paridad diaria de Comercializadora (spec, Cutover paso 2). Solo lee los dos lados.
 *   npx tsx scripts/migracion-legado/paridad-comercializadora.ts [--fecha=AAAA-MM-DD] [--guardar]
 * Imprime el reporte. Con --guardar escribe docs/migracion/paridad/<fecha>.json, que cuenta para la racha de 3 días.
 * Las diferencias aceptadas van en docs/migracion/paridad/explicadas.json ({ clave, motivo }).
 */
const arg = (n: string) => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3);
const fecha = arg('fecha') ?? new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha)) throw new Error('--fecha debe ser AAAA-MM-DD');
const CARPETA = join(process.cwd(), 'docs/migracion/paridad');

const [viejo, ventas] = await conLegado(async (db) => [await leerLado(db, fecha, 'real'), await leerVentasViejas(db)] as const);
const [portal, acciones] = await conPortalLectura(
  async (db) => [await leerLado(db, fecha, 'simulacion'), await planOv(db, ventas)] as const,
);
const explicadas = JSON.parse(readFileSync(join(CARPETA, 'explicadas.json'), 'utf8')) as Explicada[];
const resultado = evaluarDia(fecha, viejo, portal, acciones, explicadas);
const previos = readdirSync(CARPETA)
  .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f) && f !== `${fecha}.json`)
  .map((f) => JSON.parse(readFileSync(join(CARPETA, f), 'utf8')) as ResultadoDia);
const dias = racha([...previos, resultado], fecha);

console.log(reporteParidad(resultado, dias));
if (process.argv.includes('--guardar')) {
  writeFileSync(join(CARPETA, `${fecha}.json`), `${JSON.stringify(resultado, null, 2)}\n`);
  console.log(`\nGuardado en docs/migracion/paridad/${fecha}.json.`);
} else console.log('\nNo se guardó: agrega --guardar para que cuente en la racha.');
if (dias >= DIAS_REQUERIDOS) console.log(`\nListo para el cutover: ${dias} días seguidos sin diferencias.`);
```

Crear `docs/migracion/paridad/explicadas.json` con un arreglo vacío:

```json
[]
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/migracion-legado/ && npm run typecheck`
Expected: PASS. Las 3 nuevas de lecturas, las 11 de la Tarea 2, `conexion.test.ts` y las copias (`comercializadora`, `inventario`, `usuarios-*`) siguen verdes; tsc limpio. El CLI no se corre aquí: lee producción (Tarea 9).

- [ ] **Step 5: Commit**

```bash
git add scripts/migracion-legado/paridad-comercializadora-datos.ts scripts/migracion-legado/paridad-comercializadora.ts scripts/migracion-legado/conexion.ts docs/migracion/paridad/explicadas.json tests/migracion-legado/paridad-comercializadora-datos.test.ts
git commit -m "feat(migracion): script de paridad diaria de Comercializadora (solo lectura)"
```

---

### Task 4: Reversa del cutover (portal → bliocjvq)

**Files:**
- Create: `scripts/migracion-legado/reversa-comercializadora-lib.ts`
- Create: `scripts/migracion-legado/reversa-comercializadora.ts`
- Test: `tests/migracion-legado/reversa-comercializadora.test.ts`

**Interfaces:**
- Consumes:
  - `TABLAS_COM`/`TablaCom` de `comercializadora-lib.ts` (las de `editable: true`);
  - `conLegado` y `conPortalLectura` (Tarea 3).
- Produces:
  - `columnasEscribibles(db, tabla): Promise<string[]>` y `leerFilas(db, tabla): Promise<Fila[]>`;
  - `deltaTabla(t: TablaCom, columnasViejo: string[], portal: Fila[], viejo: Fila[]): DeltaTabla`;
  - `sqlReversa(deltas: DeltaTabla[], marca: string): string` (`''` si no hay cambios) y `reporteReversa(deltas): string`;
  - CLI: `npx.cmd tsx scripts/migracion-legado/reversa-comercializadora.ts [--salida=<archivo .sql>]`. Escribe en `%TEMP%` por omisión y nunca en el repo, porque trae datos.

- [ ] **Step 1: Write the failing test**

Crear `tests/migracion-legado/reversa-comercializadora.test.ts`:

```ts
import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { TABLAS_COM } from '../../scripts/migracion-legado/comercializadora-lib';
import type { Consultor } from '../../scripts/migracion-legado/conexion';
import {
  columnasEscribibles,
  deltaTabla,
  leerFilas,
  reporteReversa,
  sqlReversa,
} from '../../scripts/migracion-legado/reversa-comercializadora-lib';

const EDITABLES = TABLAS_COM.filter((t) => t.editable);
const c = (db: PGlite) => db as unknown as Consultor;

async function deltas(viejo: PGlite, portal: PGlite) {
  const out = [];
  for (const t of EDITABLES)
    out.push(deltaTabla(t, await columnasEscribibles(c(viejo), t.tabla), await leerFilas(c(portal), t.tabla), await leerFilas(c(viejo), t.tabla)));
  return out;
}

describe('reversa del cutover (portal → bliocjvq)', () => {
  let viejo: PGlite;
  let portal: PGlite;
  beforeEach(async () => {
    [viejo, portal] = await Promise.all([crearDbLocal(), crearDbLocal()]);
    // En bliocjvq minimo/maximo de com_minmax son columnas normales; en el portal, generadas (migración 48).
    await viejo.exec(`
      alter table com_minmax drop column minimo, drop column maximo;
      alter table com_minmax add column minimo numeric, add column maximo numeric;`);
    const base = `
      set timezone = 'UTC';
      insert into com_lead_times (sku, dias) values ('A', 7), ('B', 10), ('C', 3);
      insert into com_movimientos (id, tipo, folio, sku, cantidad, estado, fecha, created_at) values
        ('m1', 'venta', '#1', 'A', 2, 'por_enviar', '2026-11-20', '2026-11-20 10:00:00+00');
      insert into com_proveedor_cierre (id, vendor_id, vendor_name, ini, fin, motivo, skus, creado_at, actualizado_at)
        values (1, 'V1', 'Jarabes', '2026-11-25', '2026-11-30', 'vacaciones', '{A,B}', '2026-11-19 10:00:00+00', '2026-11-19 10:00:00+00');
      select setval(pg_get_serial_sequence('public.com_proveedor_cierre', 'id'), 1);
      insert into com_plan_config (id, config) values (1, '{"auto":{"modo":"real"},"inv":{"yulius":true}}');`;
    await viejo.exec(`${base}
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc, minimo, maximo) values ('A', 7, 5, 9, 5, 9);`);
    await portal.exec(`${base}
      insert into com_minmax (sku, lead_time, minimo_calc, maximo_calc, minimo_manual) values ('A', 7, 5, 9, 6);
      -- Lo capturado en el portal después del cutover:
      update com_lead_times set dias = 8 where sku = 'A';
      delete from com_lead_times where sku = 'C';
      insert into com_movimientos (tipo, folio, sku, cantidad, estado, fecha, realizado_por)
        values ('venta', '#2', 'B', 1, 'por_enviar', '2026-11-21', 'com-ov-pedidos');
      update com_movimientos set estado = 'enviado' where id = 'm1';
      insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo, skus)
        values ('V2', 'Vasos', '2026-12-01', '2026-12-05', 'inventario', null);
      update com_plan_config set config = '{"auto":{"modo":"real"},"inv":{"yulius":false}}';`);
  });

  it('solo lo distinto: upsert de lo nuevo o cambiado y borrado de lo que el portal ya no tiene', async () => {
    const ds = await deltas(viejo, portal);
    const de = (t: string) => ds.find((d) => d.tabla === t)!;
    expect(de('com_lead_times').upserts).toEqual([{ sku: 'A', dias: 8 }]);
    expect(de('com_lead_times').borrar).toEqual([{ sku: 'C' }]);
    expect(de('com_movimientos').upserts.map((f) => [f.folio, f.estado]).sort()).toEqual([['#1', 'enviado'], ['#2', 'por_enviar']]);
    expect(de('com_proveedor_cierre').upserts.map((f) => f.vendor_id)).toEqual(['V2']);
    expect(de('com_minmax').upserts).toEqual([expect.objectContaining({ sku: 'A', minimo_manual: 6, minimo: 6, maximo: 9 })]);
    expect(de('com_catalogo')).toMatchObject({ upserts: [], borrar: [] });
    expect(reporteReversa(ds)).toContain('com_lead_times                 a escribir 1 · a borrar 1');
  });

  it('el SQL deja bliocjvq igual al portal en lo editable, adelanta las secuencias y una segunda vuelta sale vacía', async () => {
    const sql = sqlReversa(await deltas(viejo, portal), '2026-11-22');
    expect(sql.startsWith('-- Reversa Comercializadora 2026-11-22')).toBe(true);
    await viejo.exec(sql);
    expect((await viejo.query('select sku, dias from com_lead_times order by sku')).rows).toEqual([
      { sku: 'A', dias: 8 }, { sku: 'B', dias: 10 },
    ]);
    expect((await viejo.query(`select minimo::float8 m from com_minmax where sku = 'A'`)).rows).toEqual([{ m: 6 }]);
    expect((await viejo.query(`select config -> 'inv' i from com_plan_config`)).rows).toEqual([{ i: { yulius: false } }]);
    // La secuencia del viejo quedó adelante del id que llegó del portal.
    const nuevo = await viejo.query<{ id: number }>(
      `insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo) values ('V3', 'X', '2026-12-01', '2026-12-02', 'otro') returning id`,
    );
    expect(Number(nuevo.rows[0].id)).toBeGreaterThan(2);
    await viejo.exec(`delete from com_proveedor_cierre where vendor_id = 'V3'`);
    expect(sqlReversa(await deltas(viejo, portal), 'x')).toBe('');
  });

  it('solo cubre las tablas editables (los logs y las OCs automáticas no regresan)', () => {
    expect(EDITABLES.map((t) => t.tabla)).not.toContain('com_oc_auto');
    expect(EDITABLES.map((t) => t.tabla)).not.toContain('com_sync_log');
    expect(EDITABLES.map((t) => t.tabla)).toContain('com_movimientos');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/migracion-legado/reversa-comercializadora.test.ts`
Expected: FAIL con `Cannot find module '../../scripts/migracion-legado/reversa-comercializadora-lib'`.

- [ ] **Step 3: Write minimal implementation**

Crear `scripts/migracion-legado/reversa-comercializadora-lib.ts`:

```ts
import type { TablaCom } from './comercializadora-lib';
import type { Consultor } from './conexion';

/**
 * Plan 4 · Reversa del cutover (spec: "lo capturado en el nuevo se copia de regreso; solo las tablas editables").
 * migracion_lectura es de solo lectura en bliocjvq, así que la reversa no escribe: arma un SQL con solo lo que cambió
 * (upsert de lo nuevo o distinto y borrado de lo que el portal ya no tiene) para pegarlo en el SQL Editor de bliocjvq.
 */

export type Fila = Record<string, unknown>;

export interface DeltaTabla {
  tabla: string;
  llave: string[];
  secuencia?: string;
  columnas: string[];
  upserts: Fila[];
  borrar: Record<string, string | null>[];
}

/** Columnas escribibles (no generadas) de una tabla en ese lado. */
export async function columnasEscribibles(db: Consultor, tabla: string): Promise<string[]> {
  const r = await db.query<{ c: string }>(
    `select column_name c from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [tabla],
  );
  return r.rows.map((f) => f.c);
}

/** Todas las filas como JSON de Postgres (la conexión ya está en UTC: conLegado / conPortalLectura). */
export async function leerFilas(db: Consultor, tabla: string): Promise<Fila[]> {
  return (await db.query<{ f: Fila }>(`select to_jsonb(x) f from public.${tabla} x`)).rows.map((r) => r.f);
}

const ordenado = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordenado)
    : v && typeof v === 'object'
      ? Object.fromEntries(Object.keys(v as object).sort().map((k) => [k, ordenado((v as Fila)[k])]))
      : v;
const firma = (f: Fila, cols: string[]) => JSON.stringify(cols.map((c) => ordenado(f[c] ?? null)));
const clave = (f: Fila, llave: string[]) => JSON.stringify(llave.map((k) => (f[k] == null ? null : String(f[k]))));

/**
 * `columnasViejo`: las escribibles en bliocjvq. Se copian las que también trae el portal, incluidas las generadas allá
 * (com_minmax.minimo/maximo son generadas en el portal y columnas normales en el viejo).
 */
export function deltaTabla(t: TablaCom, columnasViejo: string[], portal: Fila[], viejo: Fila[]): DeltaTabla {
  const columnas = columnasViejo.filter((c) => portal.some((f) => c in f));
  const enViejo = new Map(viejo.map((f) => [clave(f, t.llave), f]));
  const enPortal = new Set(portal.map((f) => clave(f, t.llave)));
  const upserts = portal
    .filter((f) => {
      const v = enViejo.get(clave(f, t.llave));
      return !v || firma(v, columnas) !== firma(f, columnas);
    })
    .map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] ?? null])));
  const borrar = viejo
    .filter((f) => !enPortal.has(clave(f, t.llave)))
    .map((f) => Object.fromEntries(t.llave.map((k) => [k, f[k] == null ? null : String(f[k])])));
  return { tabla: t.tabla, llave: t.llave, secuencia: t.secuencia, columnas, upserts, borrar };
}

const id = (s: string) => `"${s.replace(/"/g, '""')}"`;
const literal = (json: string) => {
  if (json.includes('$rev$')) throw new Error('El JSON contiene la marca $rev$; no se puede armar el SQL');
  return `$rev$${json}$rev$::jsonb`;
};

/** Un solo bloque begin…commit para el SQL Editor de bliocjvq. Vacío si no hay cambios. */
export function sqlReversa(deltas: DeltaTabla[], marca: string): string {
  const cuerpo: string[] = [];
  for (const d of deltas) {
    if (d.borrar.length)
      cuerpo.push(
        `delete from public.${id(d.tabla)} x where exists (select 1 from jsonb_array_elements(${literal(JSON.stringify(d.borrar))}) e\n` +
          `  where ${d.llave.map((k) => `e ->> '${k.replace(/'/g, "''")}' = x.${id(k)}::text`).join(' and ')});`,
      );
    if (d.upserts.length) {
      const cols = d.columnas.map(id).join(', ');
      const resto = d.columnas.filter((c) => !d.llave.includes(c));
      cuerpo.push(
        `insert into public.${id(d.tabla)} (${cols}) overriding system value\n` +
          `select ${cols} from jsonb_populate_recordset(null::public.${id(d.tabla)}, ${literal(JSON.stringify(d.upserts))})\n` +
          `on conflict (${d.llave.map(id).join(', ')}) do ${resto.length ? `update set ${resto.map((c) => `${id(c)} = excluded.${id(c)}`).join(', ')}` : 'nothing'};`,
      );
      if (d.secuencia)
        cuerpo.push(
          `select setval(pg_get_serial_sequence('public.${d.tabla}', '${d.secuencia}'), m)\n` +
            `from (select max(${id(d.secuencia)}) m from public.${id(d.tabla)}) x where m is not null;`,
        );
    }
  }
  if (!cuerpo.length) return '';
  return [`-- Reversa Comercializadora ${marca}: portal → bliocjvq (solo tablas editables). Pegar completo.`, 'begin;', "set local app.origen = 'migracion';", ...cuerpo, 'commit;', ''].join('\n');
}

export function reporteReversa(deltas: DeltaTabla[]): string {
  return deltas.map((d) => `${d.tabla.padEnd(30)} a escribir ${d.upserts.length} · a borrar ${d.borrar.length}`).join('\n');
}
```

Crear `scripts/migracion-legado/reversa-comercializadora.ts`:

```ts
import { writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { TABLAS_COM } from './comercializadora-lib';
import { conLegado, conPortalLectura } from './conexion';
import { columnasEscribibles, deltaTabla, type Fila, leerFilas, reporteReversa, sqlReversa } from './reversa-comercializadora-lib';

/**
 * Plan 4 · Reversa: lo editable del portal → SQL para bliocjvq. Solo lee los dos lados; NO escribe en ninguno.
 *   npx tsx scripts/migracion-legado/reversa-comercializadora.ts [--salida=<archivo .sql>]
 * El archivo (fuera del repo: trae datos) se pega completo en el SQL Editor de bliocjvq. Imprime solo conteos.
 */
const salida =
  process.argv.find((a) => a.startsWith('--salida='))?.slice('--salida='.length) ??
  join(tmpdir(), `reversa-comercializadora-${new Date().toISOString().slice(0, 10)}.sql`);
const tablas = TABLAS_COM.filter((t) => t.editable);

const viejo = await conLegado(async (db) => {
  const m = new Map<string, { cols: string[]; filas: Fila[] }>();
  for (const t of tablas) m.set(t.tabla, { cols: await columnasEscribibles(db, t.tabla), filas: await leerFilas(db, t.tabla) });
  return m;
});
const portal = await conPortalLectura(async (db) => {
  const m = new Map<string, Fila[]>();
  for (const t of tablas) m.set(t.tabla, await leerFilas(db, t.tabla));
  return m;
});
const deltas = tablas.map((t) => deltaTabla(t, viejo.get(t.tabla)!.cols, portal.get(t.tabla)!, viejo.get(t.tabla)!.filas));
console.log(reporteReversa(deltas));
const sql = sqlReversa(deltas, new Date().toISOString());
if (!sql) console.log('\nSin cambios: bliocjvq ya tiene lo mismo que el portal en las tablas editables.');
else {
  writeFileSync(salida, sql);
  console.log(`\nSQL escrito en ${salida}. Pégalo completo en el SQL Editor de bliocjvq y bórralo después.`);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/migracion-legado/reversa-comercializadora.test.ts && npm run typecheck`
Expected: PASS (3 pruebas); tsc limpio.

- [ ] **Step 5: Commit**

```bash
git add scripts/migracion-legado/reversa-comercializadora-lib.ts scripts/migracion-legado/reversa-comercializadora.ts tests/migracion-legado/reversa-comercializadora.test.ts
git commit -m "feat(migracion): reversa del cutover de Comercializadora como SQL para bliocjvq"
```

---

### Task 5: Sitio viejo: aviso con enlace al portal, menú sin Forecast y OVs que ya no se escriben

Repo: `C:\Users\sebcm\OneDrive\Documents\thecoffee-comercializadora`. **No se despliega aquí:** Netlify publica en el cutover (Tarea 10, Step 5).

**Files:**
- Modify: `app/index.html`:
  - ayudantes antes de `function navTo(p){`;
  - despacho de `navTo` (3258);
  - menús (2698, 2962);
  - `_comLiberarComprometido` 27465, `_comSyncPedidoPagado` 27480 y `_comSyncPedidoEnviado` 28311.
- Test: `netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs`

**Interfaces:**
- Consumes: rutas del portal que ya existen (`/comercializadora`, `inicio`, `inventario`, `envios`, `traspasos`, `doh`, `indicadores`, `mapeo`, `plan-abastos`); `navTo`, `_pageAllowed` y `_sbItem` del HTML.
- Produces (funciones globales del HTML, las usa la Tarea 6):
  - `_comRutaPortal(p): string | null`: la ruta del portal de una página migrada, o null;
  - `_comUrlPortal(ruta): string`: `https://the-coffee-costeo.vercel.app` + ruta;
  - `_comAbrirPortal(ruta): void`: `window.open(…, '_blank', 'noopener')`;
  - `_comAvisoMigrado(p): void`: pinta el aviso en `#page-<p>`.

- [ ] **Step 1: Rama y punto de partida**

Antes de empezar: el usuario confirma qué rama publica Netlify y el dominio del portal (preguntas abiertas 1 y 2).
- Si es `main`, primero se integran los PRs pendientes del viejo que ya estén en producción (#17, #18 y `feat/proveedores-sin-stock`).
- Después:

```bash
git fetch origin
git switch -c feat/cutover-comercializadora origin/main
```

Comprobar que cada texto que se va a reemplazar existe **una sola vez**:

```bash
for t in "function navTo(p){" "if(SUPPLIERS[p])openSupGroup();if(p==='home')renderHome();" "_sbItem('forecast','Forecast','')" "async function _comLiberarComprometido(" "async function _comSyncPedidoPagado(" "async function _comSyncPedidoEnviado("; do printf '%s → ' "$t"; grep -cF "$t" app/index.html; done
```

Expected: `1` en todas, salvo `_sbItem('forecast'…` que da `2` (los dos menús).

Si `netlify/aperturas-sync/node_modules` no existe: `cd netlify/aperturas-sync && npm ci`. Trae PGlite, que lo usan otras pruebas.

- [ ] **Step 2: Write the failing test**

Crear `netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs`:

```javascript
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

// Plan 4 del portal (cutover de Comercializadora): las pantallas de Comercializadora se cambian por un aviso con
// enlace al portal y el sitio deja de escribir com_movimientos. Extrae funciones de app/index.html y las evalúa aisladas.
const html=readFileSync(new URL('../../../app/index.html',import.meta.url),'utf8');
function extraer(nombre){
  const m=new RegExp('(?:async )?function '+nombre.replace(/\$/g,'\\$')+'\\(').exec(html);
  assert.ok(m,'no se encontró '+nombre+' en app/index.html');
  let j=html.indexOf('{',m.index),prof=0;
  for(;j<html.length;j++){const ch=html[j];if(ch==='{')prof++;else if(ch==='}'&&--prof===0)break;}
  return html.slice(m.index,j+1);
}
const PORTAL='https://the-coffee-costeo.vercel.app';
function cargar(dom={}){
  const ayudantes=['_comRutaPortal','_comUrlPortal','_comAbrirPortal','_comAvisoMigrado'].map(extraer).join('\n');
  const abiertas=[];
  const document={getElementById:(id)=>dom[id]||null};
  const window={open:(...a)=>abiertas.push(a)};
  const f=new Function('document','window',ayudantes+'\nreturn {_comRutaPortal,_comUrlPortal,_comAbrirPortal,_comAvisoMigrado};');
  return {...f(document,window),abiertas};
}

// ── Tarea 5: aviso, menú y OVs ─────────────────────────────────────────────────────────────────────────────────
const MIGRADAS={
  'com-inicio':'/comercializadora/inicio','com-inventario':'/comercializadora/inventario','com-ventas':'/comercializadora/inicio',
  'com-envios':'/comercializadora/envios','com-compras':'/comercializadora','com-traspasos':'/comercializadora/traspasos',
  'com-doh':'/comercializadora/doh','com-kpis':'/comercializadora/indicadores','com-mapeo':'/comercializadora/mapeo',
  'forecast':'/comercializadora/plan-abastos',
};

test('los scripts en línea de app/index.html compilan',()=>{
  const re=/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/g;let m,n=0;
  while((m=re.exec(html))){if(/type="(module|application\/json|text\/template)/.test(m[1]))continue;n++;new vm.Script(m[2]);}
  assert.ok(n>0);
});

test('cada pantalla de Comercializadora muestra el aviso con el enlace a su pantalla del portal',()=>{
  for(const [p,ruta] of Object.entries(MIGRADAS)){
    const el={innerHTML:''};
    const a=cargar({['page-'+p]:el});
    assert.equal(a._comRutaPortal(p),ruta);
    a._comAvisoMigrado(p);
    assert.match(el.innerHTML,/Comercializadora se mudó al portal/);
    assert.ok(el.innerHTML.includes('href="'+PORTAL+ruta+'"'),p);
    assert.match(el.innerHTML,/target="_blank" rel="noopener"/);
  }
});

test('Pedidos, Pedidos Apertura y Crédito siguen en el sitio viejo',()=>{
  const a=cargar();
  for(const p of ['pedidos','pedidos-apertura','credito-com','home','reportes'])assert.equal(a._comRutaPortal(p),null,p);
});

test('navTo despacha las pantallas migradas al aviso antes que a su render',()=>{
  const nav=extraer('navTo');
  const i=nav.indexOf('if(_comRutaPortal(p)){_comAvisoMigrado(p);}else if(p===\'home\')');
  assert.ok(i>=0,'falta el despacho del aviso');
  assert.ok(i<nav.indexOf('renderComInicio()'));
});

test('el menú ya no tiene Forecast',()=>{
  assert.equal(html.includes("_sbItem('forecast'"),false);
});

test('las tres sincronizaciones de OVs quedan vacías y ya no tocan la base',async()=>{
  const sb=new Proxy({},{get(){throw new Error('no debe usar sb');}});
  for(const nombre of ['_comSyncPedidoPagado','_comSyncPedidoEnviado','_comLiberarComprometido']){
    const src=extraer(nombre);
    assert.equal(src.includes('com_movimientos'),false,nombre);
    const f=new Function('sb',src+'\nreturn '+nombre+';')(sb);
    assert.equal(await f('00000000-0000-0000-0000-000000000001','A1'),undefined);
  }
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `cd netlify/aperturas-sync && npm test`
Expected: FAIL, 42 pass y 5 fail. Fallan las cinco nuevas de aviso, despacho, menú y OVs (`no se encontró _comRutaPortal…`, `falta el despacho del aviso`…). "los scripts en línea compilan" ya pasa, igual que las 41 de antes.

- [ ] **Step 4: Ayudantes del aviso**

En `app/index.html`, insertar justo **antes** de la línea `function navTo(p){` (después de la llave que cierra `_pageAllowed`):

```javascript
// Plan 4 del portal (cutover de Comercializadora): estas pantallas viven ahora en el portal The Coffee.
// Son funciones (no const) para que existan aunque navTo corra antes de llegar a esta línea.
function _comRutaPortal(p){
  return {'com-inicio':'/comercializadora/inicio','com-inventario':'/comercializadora/inventario',
    'com-ventas':'/comercializadora/inicio','com-envios':'/comercializadora/envios','com-compras':'/comercializadora',
    'com-traspasos':'/comercializadora/traspasos','com-doh':'/comercializadora/doh','com-kpis':'/comercializadora/indicadores',
    'com-mapeo':'/comercializadora/mapeo','forecast':'/comercializadora/plan-abastos'}[p]||null;
}
function _comUrlPortal(ruta){return 'https://the-coffee-costeo.vercel.app'+(ruta||'/comercializadora');}
function _comAbrirPortal(ruta){window.open(_comUrlPortal(ruta),'_blank','noopener');}
function _comAvisoMigrado(p){
  const el=document.getElementById('page-'+p);if(!el)return;
  el.innerHTML='<div class="section-card" style="max-width:560px;margin:40px auto;padding:28px;text-align:center">'+
    '<div class="section-title" style="margin-bottom:10px">Comercializadora se mudó al portal</div>'+
    '<p style="font-size:13px;color:var(--text2);line-height:1.6;margin:0 0 18px">Esta pantalla ahora vive en el portal The Coffee. Entra con tu mismo usuario y contraseña.</p>'+
    '<a class="btn btn-primary" href="'+_comUrlPortal(_comRutaPortal(p))+'" target="_blank" rel="noopener">Abrir en el portal</a></div>';
}
```

- [ ] **Step 5: Despacho de `navTo`**

En la línea larga del despacho (3258), reemplazar:

```javascript
if(SUPPLIERS[p])openSupGroup();if(p==='home')renderHome();
```

por:

```javascript
if(SUPPLIERS[p])openSupGroup();if(_comRutaPortal(p)){_comAvisoMigrado(p);}else if(p==='home')renderHome();
```

La página ya está activa cuando llega aquí (la línea anterior hace `pg.classList.add('active')`). El aviso solo cambia su contenido. `renderCom*` y `renderForecast` dejan de llamarse.

- [ ] **Step 6: Forecast fuera de los dos menús**

En `_comzSbItems` (2695–2698), reemplazar:

```javascript
    _sbItem('com-kpis','KPIs','')+
    _sbItem('forecast','Forecast','')+
```

por:

```javascript
    _sbItem('com-kpis','KPIs','')+
```

Y en `buildSidebar` (2960–2962), reemplazar:

```javascript
        _sbItem('com-kpis','KPIs','')+
        _sbItem('forecast','Forecast',''),
```

por:

```javascript
        _sbItem('com-kpis','KPIs',''),
```

- [ ] **Step 7: Las tres sincronizaciones de OVs quedan vacías**

Reemplazar cada función **completa** (de `async function …(` a su llave de cierre) por su versión vacía con la nota:
- `_comLiberarComprometido` (27465–27478) →

```javascript
// Plan 4 del portal (cutover de Comercializadora): las OVs las deriva el portal desde los pedidos (com_derivar_ov,
// cada 30 min). Ya no se escribe com_movimientos desde aquí; la función queda vacía para no tocar a quien la llama.
async function _comLiberarComprometido(pedidoId){}
```

- `_comSyncPedidoPagado` (27480–27506) →

```javascript
// Plan 4 del portal (cutover de Comercializadora): las OVs las deriva el portal desde los pedidos (com_derivar_ov,
// cada 30 min). Ya no se escribe com_movimientos desde aquí; la función queda vacía para no tocar a quien la llama.
async function _comSyncPedidoPagado(pedidoId,aperturaId){}
```

- `_comSyncPedidoEnviado` (28311–28333) →

```javascript
// Plan 4 del portal (cutover de Comercializadora): las OVs las deriva el portal desde los pedidos (com_derivar_ov,
// cada 30 min). Ya no se escribe com_movimientos desde aquí; la función queda vacía para no tocar a quien la llama.
async function _comSyncPedidoEnviado(pedidoId){}
```

Los seis lugares que las llaman (15825, 24194, 24197, 27375, 27378 y 27382) no cambian: siguen con `.catch(()=>{})` y ahora resuelven sin hacer nada. Desaparece el aviso falso "OV e inventario comprometido actualizados".

- [ ] **Step 8: Run test to verify it passes**

Run: `cd netlify/aperturas-sync && npm test`
Expected: PASS, 47 pass y 0 fail.

Run (raíz del repo viejo): `deno task test`
Expected: `178 passed | 0 failed` (las funciones no cambian).

El estado probado está en `frag4/index-tarea5.html` (sobre `ee23758`) y el diff en `frag4/viejo-tarea5.diff`.

- [ ] **Step 9: Commit**

```bash
git add app/index.html netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs
git commit -m "feat(app): Comercializadora se mudó al portal: aviso con enlace, sin Forecast y sin escribir OVs"
```

---

### Task 6: Sitio viejo: Reporte Comercializadora, widget de Supply y reporte de activas

**Files:**
- Modify: `app/index.html`:
  - `window._generarReporte` (10624) y `window._analizarConClaude` (10631);
  - el bloque "Stock bajo en COM" de `renderHome` (6939–6967);
  - ayudantes antes de `function navTo(p){`;
  - `_genRepActivas` (11692).
- Test: `netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs` (agrega la sección de la Tarea 6)

**Interfaces:**
- Consumes: `_comUrlPortal` y `_comAbrirPortal` (Tarea 5).
- Produces:
  - `_supInvBajoPortal(): void`: pinta el widget y deja el KPI `sup-kpi-bajo` en "—";
  - `_ultimoPedidoPorAp(pedidos): Record<string, number>`: apertura → ms del último pedido, sin cancelados ni recibidos.

- [ ] **Step 1: Write the failing test**

Agregar al final de `netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs`:

```javascript
// ── Tarea 6: reportes, widget de Supply y reporte de activas ──────────────────────────────────────────────────────
test('Reporte Comercializadora y "Analizar con Claude" abren el portal en lugar de leer com_*',()=>{
  const desde=(marca)=>{const i=html.indexOf(marca);assert.ok(i>=0,marca);return html.slice(i,html.indexOf('};',i));};
  const generar=desde('window._generarReporte=async function(btn){');
  const claude=desde('window._analizarConClaude=async function(btn){');
  assert.ok(generar.includes("_repTab==='comercializadora')_comAbrirPortal('/comercializadora/inicio')"));
  assert.ok(claude.includes("_repTab==='comercializadora'){_comAbrirPortal('/comercializadora/indicadores');return;}"));
  assert.equal(generar.includes('_genRepComercializadora()'),false);
  assert.equal(claude.includes('_buildContextComercializadora()'),false);
  const a=cargar();a._comAbrirPortal('/comercializadora/inicio');
  assert.deepEqual(a.abiertas,[[PORTAL+'/comercializadora/inicio','_blank','noopener']]);
});

test('el widget "SKUs stock bajo" de Supply ya no lee com_catalogo y enlaza al inventario del portal',()=>{
  const src=extraer('_supInvBajoPortal');
  const kpi={textContent:'7'},w={innerHTML:''};
  const document={getElementById:(id)=>({'sup-kpi-bajo':kpi,'sup-inv-bajo':w})[id]||null};
  new Function('document',extraer('_comUrlPortal')+'\n'+src+'\nreturn _supInvBajoPortal;')(document)();
  assert.equal(kpi.textContent,'—');
  assert.ok(w.innerHTML.includes('href="'+PORTAL+'/comercializadora/inventario"'));
  const home=extraer('renderHome');
  assert.equal(home.includes("from('com_catalogo')"),false);
  assert.ok(home.includes('_supInvBajoPortal();'));
});

test('reporte de activas: el último pedido por sucursal sale de pedidos, sin cancelados ni recibidos',()=>{
  const ultimo=new Function(extraer('_ultimoPedidoPorAp')+'\nreturn _ultimoPedidoPorAp;')();
  const t=(s)=>new Date(s).getTime();
  assert.deepEqual(ultimo([
    {apertura_id:'A1',status:'entregado',fecha_pedido:'2026-10-01T10:00:00+00:00'},
    {apertura_id:'A1',status:'pagado',fecha_pedido:'2026-11-02T10:00:00+00:00'},
    {apertura_id:'A1',status:'cancelado',fecha_pedido:'2026-11-20T10:00:00+00:00'},
    {apertura_id:'A2',status:'recibido',fecha_pedido:'2026-11-05T10:00:00+00:00'},
    {apertura_id:'A3',status:'terminado',fecha_pedido:null},
    {apertura_id:null,status:'pagado',fecha_pedido:'2026-11-06T10:00:00+00:00'},
  ]),{A1:t('2026-11-02T10:00:00+00:00')});
  assert.deepEqual(ultimo(null),{});
  const rep=extraer('_genRepActivas');
  assert.equal(rep.includes('com_movimientos'),false);
  assert.ok(rep.includes('const ultimoPedidoPorSuc=_ultimoPedidoPorAp(pedidosData);'));
});

test('fuera de las pantallas migradas nadie lee com_* salvo Crédito (com_credito_abonos)',()=>{
  for(const f of ['renderHome','_genRepActivas','_comSyncPedidoPagado','_comSyncPedidoEnviado','_comLiberarComprometido'])
    assert.equal(/from\('com_/.test(extraer(f)),false,f);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd netlify/aperturas-sync && npm test`
Expected: FAIL, 47 pass y 4 fail. Fallan las cuatro nuevas: reportes, widget, activas y "nadie lee com_*".

- [ ] **Step 3: Reporte y "Analizar con Claude" abren el portal**

En `window._generarReporte`, reemplazar:

```javascript
else if(_repTab==='comercializadora')await _genRepComercializadora();
```

por:

```javascript
else if(_repTab==='comercializadora')_comAbrirPortal('/comercializadora/inicio');
```

En `window._analizarConClaude`, reemplazar la línea:

```javascript
    else if(_repTab==='comercializadora')ctx=await _buildContextComercializadora();
```

por:

```javascript
    else if(_repTab==='comercializadora'){_comAbrirPortal('/comercializadora/indicadores');return;}
```

El `return` sale dentro del `try`: el `finally` vuelve a habilitar el botón. `_genRepComercializadora`, `_buildContextComercializadora` y `_renderReporteComercializadora` quedan sin llamadas, como código muerto que se borra con el resto del módulo.

- [ ] **Step 4: Widget "SKUs stock bajo"**

En `renderHome`, reemplazar el bloque que empieza en `  // Stock bajo en COM` (6939) y termina en el `  });` que cierra su `.then(function(res){` (6967), justo antes de `  sb.from('comunicados').select('id,titulo,tipo,cuerpo,created_at').eq('activo',true)…`, por:

```javascript
  // Stock bajo en COM: desde el cutover el inventario se consulta en el portal (plan 4).
  _supInvBajoPortal();
```

E insertar justo antes de `function navTo(p){` (debajo de los ayudantes de la Tarea 5):

```javascript
// Widget "SKUs stock bajo" de Supply: el inventario ya no se lee de aquí (plan 4 del portal).
function _supInvBajoPortal(){
  var kEl=document.getElementById('sup-kpi-bajo');if(kEl)kEl.textContent='—';
  var wEl=document.getElementById('sup-inv-bajo');if(!wEl)return;
  wEl.innerHTML='<div class="section-title" style="margin-bottom:8px">SKUs stock bajo</div>'+
    '<div style="font-size:12px;color:var(--text2);padding:12px 0;text-align:center">El inventario de Comercializadora ahora está en el portal.</div>'+
    '<div style="text-align:center"><a class="btn btn-ghost btn-xs" href="'+_comUrlPortal('/comercializadora/inventario')+'" target="_blank" rel="noopener">Ver inventario en el portal ›</a></div>';
}
// Último pedido por apertura (ms), sin cancelados ni recibidos: la misma fecha que llevaba la OV (fecha_envio = fecha_pedido).
function _ultimoPedidoPorAp(pedidos){
  var r={};
  (pedidos||[]).forEach(function(p){
    if(!p.apertura_id||!p.fecha_pedido||p.status==='cancelado'||p.status==='recibido')return;
    var t=new Date(p.fecha_pedido).getTime();if(isNaN(t))return;
    if(!r[p.apertura_id]||t>r[p.apertura_id])r[p.apertura_id]=t;
  });
  return r;
}
```

- [ ] **Step 5: Reporte de activas: último pedido desde `pedidos`**

En `_genRepActivas` (11692), reemplazar:

```javascript
{data:pedidosData},{data:comMovsData}]=await Promise.all([
```

por:

```javascript
{data:pedidosData}]=await Promise.all([
```

Borrar la línea de la consulta:

```javascript
    sb.from('com_movimientos').select('sucursal,fecha_envio,estado').eq('tipo','venta').neq('estado','cancelado'),
```

Y reemplazar el bloque que va de `  // Vinculación por ID en vez de texto exacto normalizado` (11761) a la llave `  });` que cierra `movsVenta.forEach` (11790, justo antes de `  const diasSinPedirRows=activas.map(`) por:

```javascript
  // Desde el cutover (plan 4 del portal) las OVs ya no se actualizan aquí: la fecha sale de pedidos.
  const ultimoPedidoPorSuc=_ultimoPedidoPorAp(pedidosData);
```

`pedidosData` ya trae `apertura_id`, `status` y `fecha_pedido` de las sucursales activas. La OV tenía `fecha_envio = fecha_pedido` y solo existía de pagado en adelante, así que "días sin pedir" no cambia de significado. Ya no hace falta adivinar la sucursal por texto.

- [ ] **Step 6: Run test to verify it passes**

Run: `cd netlify/aperturas-sync && npm test`
Expected: PASS, 51 pass y 0 fail.

Run (raíz del repo viejo): `deno task test`
Expected: `178 passed | 0 failed`.

Comprobación a mano, sin desplegar:
1. Abrir `app/index.html` con un servidor local (`npx.cmd serve app` o la extensión de VS Code).
2. Entrar con un usuario de prueba de Supply y con uno de Comercializadora.
3. Revisar: Inicio sin errores en consola; Comercializadora → Inventario muestra el aviso; el menú sin Forecast; Reportes → Comercializadora → "Generar reporte" abre el portal.

Esta comprobación la hace el usuario si el sitio local pide su sesión real (el agente no escribe contraseñas).

El estado probado está en `frag4/index-tarea6.html` y el diff completo en `frag4/viejo-tarea5y6.diff`.

- [ ] **Step 7: Commit**

```bash
git add app/index.html netlify/aperturas-sync/tests/cutover-comercializadora.test.mjs
git commit -m "feat(app): reportes, widget de stock bajo y reporte de activas sin leer com_*"
```

---

### Task 7: Suite, build, guía y PRs (última tarea de código)

Las Tareas 8 a 12 son el runbook de producción: requieren estos PRs integrados.

- [ ] **Step 1: Suite del portal**

Run: `npm test && npm run typecheck`
Expected:
- Vitest: 182 archivos, 181 verdes más la falla conocida `tests/migracion/paridad.test.ts` (Rappi); 1,434 pruebas pasadas y 5 omitidas;
- tsc limpio.

Run: `npm run test:funciones`
Expected: `257 passed | 0 failed | 33 ignored` (sin cambios; las ignoradas son las de paridad sin `COM_APP_VIEJA`).

Run: `npx next build`
Expected: build correcto, con las 21 rutas de comercializadora del 3f (este plan no agrega pantallas).

Run: `git diff feat/comercializadora-plan-abastos --stat -- package.json package-lock.json app components lib`
Expected: vacío.

- [ ] **Step 2: Guía**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 14. Paridad y cutover (plan 4)

- **OVs desde los pedidos** (migración 50):
  - `com_derivar_ov(aplicar)` crea y avanza las filas `venta` de `com_movimientos` a partir de los pedidos del puente, con `com_sku_mapping`. Sustituye a las tres funciones del HTML viejo, que quedan vacías;
  - reglas: pedidos con apertura; `pagado`/`empacado` → `por_enviar`, `enviado`/`entregado`/`terminado` → `enviado`, `cancelado` → `cancelado`. Inserta solo folios sin filas y de los últimos 45 días. Solo avanza, nunca regresa (respeta "Marcar enviado"). `reabierto` y `ambiguo` se reportan y no se tocan;
  - job `com-ov-pedidos` (`10,40 * * * *`), activo desde el cutover. Cada corrida deja una fila en `com_sync_log` (`proceso = 'com-ov-pedidos'`) con lo que hizo. `com_ov_plan(filas)` dice qué haría sin escribir.
- **Paridad diaria:**
  - `npx.cmd tsx scripts/migracion-legado/paridad-comercializadora.ts --guardar`, después de las 13:05 UTC. Lee los dos lados en solo lectura y compara el mín/máx, la OC del cron por proveedor y SKU, y las OVs (lo que `com_ov_plan` haría sobre las filas del viejo);
  - "no comparable" = entradas distintas (copiar editables). Las diferencias aceptadas van en `docs/migracion/paridad/explicadas.json`;
  - se avanza al cutover con 3 días seguidos verdes (`docs/migracion/paridad/<fecha>.json`).
- **Sombra:** los crons del portal corren con `auto.modo = 'simulacion'` y sin `COM_EFECTOS_EXTERNOS`. Durante la ventana solo se copia `--solo-editables`, después de la paridad.
- **Día del cambio (en este orden):**
  1. pausar el portal;
  2. desprogramar en bliocjvq (verificar `cron.job` vacío);
  3. quitar los `ZOHO_*` de bliocjvq;
  4. publicar el HTML viejo;
  5. guardar los grants y revocar escritura en las 17 tablas de bliocjvq;
  6. copia final completa;
  7. `com_derivar_ov(false)`;
  8. `auto.modo = 'real'` y `COM_EFECTOS_EXTERNOS=si`;
  9. activar los cuatro jobs del portal;
  10. verificar.

  Los SQL están en el plan 4 (Tarea 10).
- **Reversa (hasta 30 días):**
  1. apagar el portal y volverlo a simulación;
  2. `reversa-comercializadora.ts` (escribe un SQL en `%TEMP%`) y pegarlo en el SQL Editor de bliocjvq;
  3. devolver grants y `ZOHO_*`;
  4. revertir el PR del HTML viejo;
  5. reprogramar los jobs viejos.

  Lo que no regresa: las OCs automáticas del portal, que siguen en Zoho.
- **A los 30 días:** las 17 tablas pasan a `archivo_comercializadora` en bliocjvq y se borran las cuatro funciones viejas. Desde ahí ya no hay copia ni reversa. `com_credito_abonos`, `send-email` y el rol `portal_puente` se quedan (Pedidos).
- **Sin cambios:** `provider-notifications`, `aperturas-sync`, Apps Script y n8n no leen `com_*`.
```

- [ ] **Step 3: Commit y PR del portal**

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(comercializadora): guía de paridad y cutover (plan 4)"
git push -u origin feat/comercializadora-cutover
```

PR con base `feat/comercializadora-plan-abastos` (encima del #118). En la descripción van:
- las decisiones 1 (OVs desde los pedidos, con sus reglas y la ventana), 4 (copia final completa), 5 (revoke por lista), 7 (qué es un día verde) y 9 (corrige al spec sobre `provider-notifications`);
- que la migración 50 **no** está aplicada y que el job nace inactivo;
- que nada de este PR escribe en producción por sí solo.

- [ ] **Step 4: PR del repo viejo**

En `thecoffee-comercializadora`:

```bash
git push -u origin feat/cutover-comercializadora
```

PR contra la rama que publica Netlify, con el título "Comercializadora se mudó al portal" y la etiqueta **no fusionar hasta el día del cambio**.

La descripción explica:
- qué pantallas muestran el aviso y a qué ruta llevan;
- que Forecast sale del menú;
- que las tres funciones de OVs quedan vacías porque el portal las deriva;
- los cambios de reportes, widget y activas;
- las 51 pruebas (`npm test` en `netlify/aperturas-sync`) y `deno task test`.

Fusionar ese PR **es** desplegar (Netlify publica al integrar), por eso se fusiona solo en la Tarea 10, Step 5.

---

## Runbook de producción (Tareas 8 a 12)

Cada paso dice **quién** lo hace:
- **[agente]**: solo lectura;
- **[agente · OK]**: escribe o despliega; espera un sí explícito del usuario para ese paso;
- **[usuario]**: SQL Editor de bliocjvq, secretos, Vercel o Netlify.

Los comandos son de PowerShell, desde `C:\Users\sebcm\Projects\thecoffee-costeos`, salvo que se diga otra cosa. Los SQL y scripts de una vez viven en `$env:TEMP\plan4\` (Tarea 8, Step 1), nunca en el repo. Los SQL de bliocjvq se abren y se pegan completos en su SQL Editor.

### Task 8: Migración 50 y sombra

**Files:**
- Create (fuera del repo): `$env:TEMP\plan4\*.sql`, `$env:TEMP\plan4\sql-portal.mts`, `$env:TEMP\plan4\aplicar50.mts`

**Interfaces:**
- Consumes: Tareas 1 a 3 integradas en la rama (el código de la migración y `conPortalLectura`).
- Produces: migración 50 aplicada y registrada; `com-ov-pedidos` inactivo; los tres jobs del portal activos en simulación.

- [ ] **Step 1: [agente] Preparar los archivos del runbook**

Crear `$env:TEMP\plan4\` con estos archivos (probados en PGlite con un `cron` de prueba: `scratchpad\runbook4\validar-runbook4.mts`).

`sql-portal.mts`: corre un `.sql` en el portal (`enPortal`, o `--lectura` con `conPortalLectura`):

```ts
// Corre un .sql en el portal e imprime las filas de la última consulta.
// Sin --lectura: UNA transacción con app.origen = 'migracion' (enPortal). Con --lectura: begin read only.
// Se corre desde la raíz del repo del portal (lee DATABASE_URL de .env.local; nunca la imprime).
import { readFileSync } from 'node:fs';
import { conPortalLectura, enPortal } from 'file:///C:/Users/sebcm/Projects/thecoffee-costeos/scripts/migracion-legado/conexion.ts';

const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!archivo) throw new Error('Uso: npx.cmd tsx sql-portal.mts <archivo.sql> [--lectura]');
const sql = readFileSync(archivo, 'utf8');
const correr = process.argv.includes('--lectura') ? conPortalLectura : enPortal;
const r: unknown = await correr((db) => db.query(sql));
const ultima = (Array.isArray(r) ? r.at(-1) : r) as { rows?: unknown[] };
console.log(JSON.stringify(ultima.rows ?? [], null, 2));
```

`aplicar50.mts`:

```ts
// Aplica la migración 50 en el portal en UNA transacción y la registra, como se hizo con la 49.
// Si la lectura del puente falla, se revierte todo. Se corre desde la raíz del repo del portal.
import { readFileSync } from 'node:fs';
import { enPortal } from 'file:///C:/Users/sebcm/Projects/thecoffee-costeos/scripts/migracion-legado/conexion.ts';

const v = '20261114000050';
const nombre = 'comercializadora_ov_pedidos';
const sql = readFileSync(`supabase/migrations/${v}_${nombre}.sql`, 'utf8');

const r = await enPortal(async (db) => {
  if ((await db.query(`select 1 from supabase_migrations.schema_migrations where version = $1`, [v])).rows.length)
    throw new Error('La 50 ya está registrada; no se aplica');
  await db.query(sql);
  const cols = (
    await db.query<{ c: string }>(
      `select column_name c from information_schema.columns where table_schema = 'supabase_migrations' and table_name = 'schema_migrations'`,
    )
  ).rows.map((x) => x.c);
  const campos = ['version'];
  const vals: unknown[] = [v];
  if (cols.includes('name')) {
    campos.push('name');
    vals.push(nombre);
  }
  if (cols.includes('statements')) {
    campos.push('statements');
    vals.push([sql]);
  }
  await db.query(
    `insert into supabase_migrations.schema_migrations (${campos.join(', ')}) values (${campos.map((_, i) => `$${i + 1}`).join(', ')})`,
    vals,
  );
  const q = async (s: string) => (await db.query(s)).rows;
  return {
    job: await q(`select jobname, schedule, active from cron.job where jobname = 'com-ov-pedidos'`),
    // Lo que la derivación haría HOY sobre las filas del portal (copia del viejo). Lee el puente: si falla, se revierte.
    plan: await q(`select accion, count(*)::int n from public.com_ov_plan(
      (select coalesce(jsonb_agg(jsonb_build_object('id', id, 'folio', folio, 'estado', estado)), '[]'::jsonb)
       from public.com_movimientos where tipo = 'venta' and folio is not null)) group by accion order by accion`),
    registrada: (await q(`select version from supabase_migrations.schema_migrations where version = '${v}'`)).length,
  };
});
console.log(JSON.stringify(r, null, 2));
```

Portal:
- `sombra-activar.sql`:

```sql
-- Portal · Tarea 8: activa la sombra (zoho-sync, com-minmax y zoho-generar-oc en simulación). com-ov-pedidos NO.
do $$
begin
  if (select config #>> '{auto,modo}' from public.com_plan_config where id = 1) is distinct from 'simulacion' then
    raise exception 'auto.modo no está en simulacion: no se activa la sombra';
  end if;
end $$;
select cron.alter_job(jobid, active := true) from cron.job where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc');
select jobname, schedule, active from cron.job order by jobname;
```

- `portal-pausar.sql`:

```sql
-- Portal · pausa los cuatro jobs de Comercializadora (T-0 antes de la copia, y la reversa).
select cron.alter_job(jobid, active := false) from cron.job
where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc', 'com-ov-pedidos');
select jobname, schedule, active from cron.job order by jobname;
```

- `portal-ediciones.sql`:

```sql
-- Portal · solo lectura: lo que personas cambiaron en el portal desde la última copia. Debe salir sin renglones de
-- bitácora y con 0 en minimos y oc_manual.
-- Cambiar la hora de la última copia --aplicar (UTC) en la primera línea del with.
with desde as (select timestamptz '2026-11-30 14:30:00+00' as hora)
select 'bitacora' as fuente, tabla, count(*) as cambios
from public.bitacora, desde
where tabla like 'com\_%' and fecha > desde.hora and origen <> 'migracion'
group by tabla
union all
select 'minimos', 'com_zoho_proveedor', count(*)
from public.com_zoho_proveedor, desde where minimo_origen = 'plataforma' and minimo_editado_at > desde.hora
union all
select 'oc_manual', 'com_oc_auto', count(*)
from public.com_oc_auto, desde where origen = 'manual' and creada_at > desde.hora
order by 1, 2;
```

- `portal-ov-registrar.sql`:

```sql
-- Portal · T-0 (agente con OK): la derivación en modo registrar sobre lo recién copiado. Escribe solo su fila de com_sync_log.
select public.com_derivar_ov(false) as resultado;
```

- `portal-real.sql`:

```sql
-- Portal · T-0: OCs automáticas en Real, con su renglón de historial.
insert into public.com_plan_config_historial (ambito, clave, valor_anterior, valor_nuevo, modificado_por)
  select 'config', 'auto.modo', config #> '{auto,modo}', '"real"'::jsonb, 'cutover plan 4'
  from public.com_plan_config where id = 1 and config #>> '{auto,modo}' is distinct from 'real';
update public.com_plan_config set config = jsonb_set(config, '{auto,modo}', '"real"', true) where id = 1;
select config #>> '{auto,modo}' as modo from public.com_plan_config where id = 1;
```

- `portal-activar.sql`:

```sql
-- Portal · T-0: activa los cuatro jobs (solo después de verificar que bliocjvq ya no tiene los suyos).
select cron.alter_job(jobid, active := true) from cron.job
where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc', 'com-ov-pedidos');
select jobname, schedule, active from cron.job order by jobname;
```

- `portal-sync-ahora.sql`:

```sql
-- Portal · T-0 (agente con OK): primera corrida de zoho-sync a mano (como la guía §7); el resultado se ve en com_sync_log.
select public.com_invocar('zoho-sync') as solicitud;
```

- `portal-verificar.sql`:

```sql
-- Portal · solo lectura: corridas del último día, OCs automáticas de hoy (CDMX) y lo que la derivación tiene pendiente.
select 'corrida' as que, proceso as detalle, ok::text as estado, to_char(inicio at time zone 'America/Mexico_City', 'DD-MM HH24:MI') as cuando,
       coalesce(error, resumen ->> 'modo', '') as nota
from public.com_sync_log where inicio > now() - interval '1 day'
union all
select 'oc_auto', vendor_name, modo || '/' || estado, to_char(creada_at at time zone 'America/Mexico_City', 'DD-MM HH24:MI'), coalesce(po_number, error, '')
from public.com_oc_auto where fecha = (now() at time zone 'America/Mexico_City')::date
union all
select 'ov_pendiente', accion, count(*)::text, '', ''
from public.com_ov_plan((select coalesce(jsonb_agg(jsonb_build_object('id', id, 'folio', folio, 'estado', estado)), '[]'::jsonb)
                         from public.com_movimientos where tipo = 'venta' and folio is not null))
group by accion
order by 1, 4 desc;
```

- `portal-cron.sql`:

```sql
-- Portal · solo lectura: jobs y sus últimas corridas.
select j.jobname, j.active, d.status, to_char(d.start_time at time zone 'America/Mexico_City', 'DD-MM HH24:MI') as inicio,
       left(d.return_message, 120) as mensaje
from cron.job j left join lateral (
  select * from cron.job_run_details r where r.jobid = j.jobid order by r.start_time desc limit 3) d on true
order by j.jobname, d.start_time desc;
```

- `portal-simulacion.sql`:

```sql
-- Portal · reversa: OCs automáticas de vuelta en simulación, con su renglón de historial.
insert into public.com_plan_config_historial (ambito, clave, valor_anterior, valor_nuevo, modificado_por)
  select 'config', 'auto.modo', config #> '{auto,modo}', '"simulacion"'::jsonb, 'reversa plan 4'
  from public.com_plan_config where id = 1 and config #>> '{auto,modo}' is distinct from 'simulacion';
update public.com_plan_config set config = jsonb_set(config, '{auto,modo}', '"simulacion"', true) where id = 1;
select config #>> '{auto,modo}' as modo from public.com_plan_config where id = 1;
```

bliocjvq (los corre el usuario):
- `viejo-desprogramar.sql`:

```sql
-- bliocjvq · T-0 (SQL Editor, usuario): desprograma los tres jobs de Comercializadora y verifica.
select cron.unschedule(jobid) from cron.job where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc');
-- Debe salir VACÍO: ningún job de Comercializadora ni nada que llame a com_invocar.
select jobid, jobname, schedule, active, command from cron.job
where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc') or command ilike '%com_invocar%';
```

- `viejo-cron.sql`:

```sql
-- bliocjvq · solo lectura (SQL Editor, usuario): debe salir VACÍO antes de activar el portal en Real.
select jobid, jobname, schedule, active, command from cron.job
where jobname in ('zoho-sync', 'com-minmax', 'zoho-generar-oc') or command ilike '%com_invocar%';
```

- `viejo-grants-antes.sql`:

```sql
-- bliocjvq · T-0 (SQL Editor, usuario): genera los GRANT exactos de escritura que hoy tienen anon y authenticated
-- en las 17 tablas. Guardar la salida (una sentencia por renglón) en docs/migracion/paridad/grants-bliocjvq-antes.sql.
select format('grant %s on table public.%I to %I;', string_agg(privilege_type, ', ' order by privilege_type), table_name, grantee) as sentencia
from information_schema.role_table_grants
where table_schema = 'public' and grantee in ('anon', 'authenticated')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
  and table_name in ('com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times', 'com_minmax',
    'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
    'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
    'com_zoho_oc_lineas', 'com_zoho_proveedor')
group by table_name, grantee
order by table_name, grantee;
```

- `viejo-revocar.sql`:

```sql
-- bliocjvq · T-0 (SQL Editor, usuario): las 17 tablas copiadas quedan de solo lectura para la app vieja.
-- com_credito_abonos (Crédito, se migra con Pedidos) y com_proveedores (sin uso) NO se tocan.
revoke insert, update, delete, truncate on table
  public.com_catalogo, public.com_catalogo_costo_historial, public.com_kit_apertura, public.com_lead_times,
  public.com_minmax, public.com_movimientos, public.com_oc_auto, public.com_pago_proyectado, public.com_parametros,
  public.com_plan_config, public.com_plan_config_historial, public.com_proveedor_cierre, public.com_sku_mapping,
  public.com_sync_cambios, public.com_sync_log, public.com_zoho_oc_lineas, public.com_zoho_proveedor
from anon, authenticated;
-- Verificación: solo deben quedar com_credito_abonos y com_proveedores.
select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as escritura
from information_schema.role_table_grants
where table_schema = 'public' and table_name like 'com\_%' and grantee in ('anon', 'authenticated', 'PUBLIC')
  and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
group by table_name, grantee order by table_name, grantee;
```

- `viejo-quieto.sql`:

```sql
-- bliocjvq · solo lectura (usuario en el SQL Editor): nada de Comercializadora corrió ni escribió desde T-0.
-- Cambiar la hora de T-0 (UTC) en la primera línea del with.
with t0 as (select timestamptz '2026-12-01 14:00:00+00' as hora)
select 'sync_log' as tabla, count(*) as filas_despues_de_t0 from public.com_sync_log, t0 where inicio > t0.hora
union all
select 'oc_auto', count(*) from public.com_oc_auto, t0 where creada_at > t0.hora;
```

- `viejo-reprogramar.sql`:

```sql
-- bliocjvq · REVERSA (SQL Editor, usuario): los mismos jobs de supabase/migrations/20261030000002_cron.sql del repo viejo.
-- Solo después de comprobar que el portal tiene sus cuatro jobs inactivos.
select cron.schedule('zoho-sync', '*/30 * * * *', $$ select com_invocar('zoho-sync') $$);
select cron.schedule('com-minmax', '30 12 * * *', $$ select com_invocar('com-minmax') $$);
select cron.schedule('zoho-generar-oc', '5 13 * * *', $$ select com_invocar('zoho-generar-oc', '{"origen":"cron"}') $$);
select jobname, schedule, active from cron.job order by jobname;
```

- `viejo-archivar.sql`:

```sql
-- bliocjvq · a los 30 días sin reversa (SQL Editor, usuario): las 17 tablas pasan a un esquema que la app no ve.
-- La reversa ya no es posible después de esto (la copia y la reversa leen public.com_*).
create schema if not exists archivo_comercializadora;
revoke all on schema archivo_comercializadora from public, anon, authenticated;
do $$
declare
  t text;
begin
  foreach t in array array['com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times',
    'com_minmax', 'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
    'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
    'com_zoho_oc_lineas', 'com_zoho_proveedor'] loop
    execute format('alter table public.%I set schema archivo_comercializadora', t);
  end loop;
end $$;
select table_name from information_schema.tables where table_schema = 'archivo_comercializadora' order by 1;
```

- `viejo-desarchivar.sql`:

```sql
-- bliocjvq · deshace viejo-archivar.sql (SQL Editor, usuario).
do $$
declare
  t text;
begin
  foreach t in array array['com_catalogo', 'com_catalogo_costo_historial', 'com_kit_apertura', 'com_lead_times',
    'com_minmax', 'com_movimientos', 'com_oc_auto', 'com_pago_proyectado', 'com_parametros', 'com_plan_config',
    'com_plan_config_historial', 'com_proveedor_cierre', 'com_sku_mapping', 'com_sync_cambios', 'com_sync_log',
    'com_zoho_oc_lineas', 'com_zoho_proveedor'] loop
    execute format('alter table archivo_comercializadora.%I set schema public', t);
  end loop;
end $$;
select count(*) as en_public from information_schema.tables
where table_schema = 'public' and table_name like 'com\_%';
```

- [ ] **Step 2: [agente] Estado de partida**

```powershell
npx.cmd supabase secrets list --project-ref jpqkmnfjwzniptszjuli
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-cron.sql" --lectura
```

Expected:
- `COM_EFECTOS_EXTERNOS` **no** aparece; `COM_SECRETO` y los `ZOHO_*` sí (solo nombres);
- `zoho-sync`, `com-minmax` y `zoho-generar-oc` con `active = false`.

- [ ] **Step 3: [agente · OK] Aplicar la migración 50**

Con la rama del plan 4 en el disco (la migración tiene que estar en `supabase/migrations`):

```powershell
npx.cmd tsx "$env:TEMP\plan4\aplicar50.mts"
```

Expected:
- `job: [{ jobname: 'com-ov-pedidos', schedule: '10,40 * * * *', active: false }]` y `registrada: 1`;
- `plan` cuenta lo que la derivación haría hoy sobre la copia del portal. Puede no estar en cero porque la copia es vieja; no se aplica nada.

Si el puente falla, el script revierte todo: revisar el user mapping (guía §3) y repetir.

- [ ] **Step 4: [agente · OK] Copiar editables antes del primer día**

```powershell
npx.cmd tsx scripts/migracion-legado/comercializadora.ts --solo-editables
npx.cmd tsx scripts/migracion-legado/comercializadora.ts --solo-editables --aplicar
```

La primera es simulación: revisar `borradas` antes de la segunda. Anotar la hora (UTC) del `--aplicar` en la bitácora de la ventana (descripción del PR del plan 4).

- [ ] **Step 5: [agente · OK] Activar la sombra**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\sombra-activar.sql"
```

Expected: `zoho-sync`, `com-minmax` y `zoho-generar-oc` con `active = true`; `com-ov-pedidos` con `false`. Si `auto.modo` no está en `simulacion`, el script aborta sin activar nada.

- [ ] **Step 6: [agente] Revisión al día siguiente (después de las 13:05 UTC)**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-cron.sql" --lectura
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-verificar.sql" --lectura
```

Expected:
- `zoho-sync` correcto cada 30 min, `com-minmax` a las 06:30 CDMX y `zoho-generar-oc` a las 07:05 CDMX;
- `oc_auto` de hoy en `simulacion/simulada`;
- ningún error con "429" o "límite" (doble lectura a Zoho, decisión 6).

Si aparecen errores de límite, avisar al usuario antes de seguir: la salida es espaciar el `zoho-sync` del portal con `cron.alter_job(jobid, schedule := '15 * * * *')`, con OK.

### Task 9: Ventana de paridad (3 días seguidos verdes)

**Files:**
- Create: `docs/migracion/paridad/<fecha>.json` (uno por día)
- Modify: `docs/migracion/paridad/explicadas.json` (solo con OK del usuario)

**Interfaces:**
- Consumes: CLI de la Tarea 3; copia `--solo-editables`.
- Produces: la racha que pide la Tarea 10.

- [ ] **Step 1: [agente] Paridad del día (después de las 13:05 UTC, p. ej. 08:00 CDMX)**

```powershell
npx.cmd tsx scripts/migracion-legado/paridad-comercializadora.ts --guardar
```

Expected: el reporte con "VERDE", "CON DIFERENCIAS" o "INCOMPLETO", las secciones y la racha.

- [ ] **Step 2: [agente] Clasificar lo que salió**

- **"Diferencias sin explicar"** (motor): se investiga con superpowers:systematic-debugging, comparando el SKU o el folio en los dos lados.
  - Si es un error del portal, se corrige en un commit del plan 4 con su prueba, y la racha empieza de nuevo.
  - Si es una diferencia esperada, se agrega a `explicadas.json` con su `clave` y el `motivo`, **con OK del usuario**.
  - Esperadas por diseño (decisión 1):
    - `ov:avanzar:<folio>:por_enviar>cancelado` de cancelaciones masivas del viejo;
    - `ov:insertar:…` de pedidos pagados o empacados en los últimos 45 días que el viejo no registró;
    - `ov:reabierto:…`.
- **"Entradas distintas"**: se copian editables (Step 3). No rompen la racha, pero si son muchas el día no prueba nada: si pasan del 10 % de los SKUs, ese día no cuenta y se repite.
- **"INCOMPLETO"**: el reporte dice qué falta. Por ejemplo, un cron que falló en un lado (Tarea 8, Step 6) o la configuración distinta (Step 3).

- [ ] **Step 3: [agente · OK] Copiar editables (siempre después del Step 1, nunca antes de las 13:05 UTC)**

```powershell
npx.cmd tsx scripts/migracion-legado/comercializadora.ts --solo-editables
npx.cmd tsx scripts/migracion-legado/comercializadora.ts --solo-editables --aplicar
```

`--solo-editables` no toca `com_oc_auto` ni `com_sync_log`, así que la paridad del día siguiente sigue viendo las OCs simuladas y las corridas.

- [ ] **Step 4: [agente · OK] Guardar la evidencia**

```bash
git add docs/migracion/paridad/
git commit -m "docs(migracion): paridad de Comercializadora del <fecha>"
```

- [ ] **Step 5: Criterio de salida**

La racha llega a 3 con la regla de la decisión 7. De esos tres días, **al menos uno** tiene OC automática del viejo (`conteos.proveedores > 0`); si no, la ventana se alarga. El usuario revisa `explicadas.json` y fija el día del cambio (pregunta abierta 3).

### Task 10: Día del cambio (T-0)

**Interfaces:**
- Consumes:
  - PRs #111 a #118 y el del plan 4 integrados y publicados;
  - PR del viejo listo (Tarea 7, Step 4);
  - racha de 3 (Tarea 9);
  - archivos de `$env:TEMP\plan4\`.
- Produces: portal en Real con sus cuatro jobs, bliocjvq sin jobs ni escritura en las 17 tablas, y el sitio viejo con el aviso.

**Ventana:** un día hábil, empezando **después** de que el `zoho-generar-oc` del viejo de ese día terminó (13:05 UTC; se confirma en el Step 1). Por ejemplo, de 08:00 a 10:00 CDMX. La primera OC real del portal sale al día siguiente a las 07:05 CDMX.

- [ ] **Step 1: Pre-checks (T-1 y la mañana de T-0)**

1. [usuario · agente · OK] **PRs integrados:** #111 → #112 → … → #118 → plan 4 están en `main`, en ese orden. Vercel publicó `main` en producción.
   - [agente] Comprobarlo con `gh pr view <n> --json state,mergedAt` para cada uno.
2. [usuario] **Vercel:** `COM_SECRETO` y `SUPABASE_SECRET_KEY` existen en Production y Preview. Se miran los nombres en el panel, nunca los valores.
3. [usuario] **Recorrido en producción** con un usuario de edición: Qué pedir, Inicio y Órdenes cargan. Ninguna dice "no está configurado" ni "no hay ventas".
4. [usuario] **Módulo:** quienes usaban Comercializadora en el viejo (rol `comercializadora` o permiso `pedidos_com`) tienen el módulo `comercializadora` en el portal (Admin → accesos), con `edicion` o `lectura` según corresponda. Entran con su mismo usuario y contraseña (Fase 0).
5. [agente] **Migración y racha:**
   - `aplicar50.mts` ya se corrió (`schema_migrations` tiene `20261114000050`);
   - `portal-cron.sql --lectura` muestra `com-ov-pedidos` inactivo;
   - la última paridad dice "Racha: 3 de 3" o más.
6. [usuario] **Valores de `ZOHO_*` guardados** fuera de Supabase (gestor de contraseñas). Supabase no los deja leer de vuelta, y sin ellos no hay reversa.
7. [agente] **Corrida del día en el viejo**, por lectura con `conLegado`: en `com_sync_log`, `zoho-generar-oc` de hoy con `fin` no nulo, y ningún proceso con `fin` nulo en los últimos 15 min. Si algo sigue corriendo, se espera.
8. [usuario] **Mensaje a los usuarios** listo (Step 13).

- [ ] **Step 2: [agente · OK] Pausar el portal**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-pausar.sql"
```

Expected: los cuatro jobs con `active = false`. Así nada del portal choca con la copia.

- [ ] **Step 3: [usuario] Desprogramar los jobs de bliocjvq**

En el SQL Editor de bliocjvq: `viejo-desprogramar.sql`.
Expected: la consulta final sale **vacía**. Si no, no se sigue.

- [ ] **Step 4: [usuario] Quitar los secretos `ZOHO_*` de bliocjvq**

Panel de bliocjvq → Edge Functions → Secrets, o:

```powershell
npx.cmd supabase secrets unset ZOHO_CLIENT_ID ZOHO_CLIENT_SECRET ZOHO_REFRESH_TOKEN ZOHO_ORG_ID ZOHO_LOCATION_ID --project-ref bliocjvqwskvoxrumqby
```

[agente] Verificar con `npx.cmd supabase secrets list --project-ref bliocjvqwskvoxrumqby`: ningún `ZOHO_*`, y `SUPABASE_*` y lo de `send-email` siguen.

- [ ] **Step 5: [agente · OK] Publicar el HTML viejo**

Fusionar el PR del viejo (Tarea 7, Step 4) con `gh pr merge <n> --merge`, y esperar a que Netlify publique ("Published" en el panel; lo confirma el usuario). Luego:

```powershell
curl.exe -s https://thecoffeemexico.com/ | Select-String -SimpleMatch "_comRutaPortal" | Measure-Object | Select-Object -ExpandProperty Count
```

Expected: `1` o más. El usuario manda el mensaje del Step 13 en cuanto se publique.

- [ ] **Step 6: [usuario] Guardar grants y dejar bliocjvq en solo lectura**

1. En el SQL Editor de bliocjvq: `viejo-grants-antes.sql`. Pegar la salida (una sentencia por renglón) en `docs/migracion/paridad/grants-bliocjvq-antes.sql`. [agente · OK] la agrega al repo con un commit.
2. En el SQL Editor de bliocjvq: `viejo-revocar.sql`.

Expected: la verificación lista solo `com_credito_abonos` y `com_proveedores`.

Va **antes** de la copia para que nada (una pestaña vieja sin recargar) cambie bliocjvq después de copiar.

- [ ] **Step 7: [agente · OK] Copia final completa (17 tablas)**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-ediciones.sql" --lectura
npx.cmd tsx scripts/migracion-legado/comercializadora.ts
```

- `portal-ediciones.sql` lleva la hora de la última copia `--aplicar` de la ventana. Tiene que salir sin renglones de bitácora y con 0 en `minimos` y `oc_manual`. Si algo salió, el usuario decide antes de seguir: se re-captura en el viejo, ahora de solo lectura, con la reversa, o se acepta perderlo.
- La simulación de la copia: `borradas` en `com_oc_auto` son las simuladas de la ventana, y en `com_sync_log` los logs de la sombra. En las editables debe haber 0 borradas, o casi.

Con OK:

```powershell
npx.cmd tsx scripts/migracion-legado/comercializadora.ts --aplicar
```

Expected: "Aplicado." y `auto.modo pasó a simulacion` (la copia trajo `real` del viejo y la fuerza a simulación).

- [ ] **Step 8: [agente · OK] La derivación en registrar sobre lo recién copiado**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-ov-registrar.sql"
```

Expected:
- `ok: true` y `modo: 'registrar'`;
- `insertar`/`avanzar` = solo los pedidos que cambiaron desde el Step 5, cuando el viejo dejó de registrar OVs. Revisar `muestra`;
- `reabiertos` y `ambiguos` vacíos o ya explicados.

Si sale `ok: false` (puente caído), **no se sigue**: se reintenta en 10 min. Si el puente no vuelve, se pospone el resto. El viejo queda sin cron, así que ese día no hay OCs nuevas en ningún lado; se decide con el usuario si se revierte (Tarea 12).

- [ ] **Step 9: [agente · OK] y [usuario] Real y efectos externos**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-real.sql"
```

Expected: `modo: 'real'`, con su renglón en `com_plan_config_historial`.

[usuario] Poner `COM_EFECTOS_EXTERNOS` con el valor `si` (panel del portal → Edge Functions → Secrets, o `npx.cmd supabase secrets set COM_EFECTOS_EXTERNOS=si --project-ref jpqkmnfjwzniptszjuli`).
[agente] Verificar con `secrets list` que el nombre aparece.

- [ ] **Step 10: [usuario] y [agente · OK] Verificar que bliocjvq no tiene jobs y activar el portal**

[usuario] SQL Editor de bliocjvq: `viejo-cron.sql`. Expected: **vacío**. Es la verificación de `cron.job` que pide el spec (Riesgos) justo antes de pasar a Real.

Luego:

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-activar.sql"
```

Expected: los cuatro jobs con `active = true`.

- [ ] **Step 11: [agente · OK] Primeras corridas**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-sync-ahora.sql"
```

Unos 3 minutos después, y otra vez después del siguiente :10 o :40:

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-verificar.sql" --lectura
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-cron.sql" --lectura
```

Expected:
- `zoho-sync` con `ok = true`;
- `com-ov-pedidos` con `ok = true` y `aplicar`, que aplicó lo que el Step 8 anunció;
- `ov_pendiente` vacío o con pocos folios (pedidos de los últimos 30 min).

`com-minmax` y `zoho-generar-oc` corren solos al día siguiente (Tarea 11). No se fuerzan en Real.

- [ ] **Step 12: [agente] Revisión del sitio viejo**

[usuario] En el sitio viejo, con una pestaña recargada:
- Comercializadora → cualquier pantalla muestra el aviso, y el enlace abre el portal;
- Pedidos y Crédito funcionan;
- marcar un pedido de prueba como pagado ya no muestra "OV e inventario comprometido actualizados".

[agente] Con el siguiente `com-ov-pedidos`, el folio de ese pedido aparece en el portal (`portal-verificar.sql`, o Envíos).

- [ ] **Step 13: [usuario] Mensaje a los usuarios**

Texto sugerido (lo manda el usuario; el agente no envía mensajes):

```text
Desde hoy Comercializadora (Qué pedir, Órdenes, Inventario, Envíos, Traspasos, DOH, KPIs, Mapeo y el Forecast) vive en el portal The Coffee: https://the-coffee-costeo.vercel.app/comercializadora
Entra con tu mismo usuario y contraseña. Pedidos y Crédito siguen en thecoffeemexico.com.
Si tienes abierta una pestaña de thecoffeemexico.com, recárgala (Ctrl+F5) antes de seguir.
```

- [ ] **Step 14: [agente · OK] Registro**

Agregar a la descripción del PR del plan 4 la hora de cada paso, las salidas de los Steps 7, 8 y 11 (solo conteos) y quién hizo cada uno.

### Task 11: Primeros días, ventana de 30 días y archivo

- [ ] **Step 1: [agente] y [usuario] Día 1, después de las 13:05 UTC**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-verificar.sql" --lectura
```

Expected:
- `com-minmax` y `zoho-generar-oc` con `ok = true`;
- `oc_auto` de hoy en `real/creada` con su `po_number`, **a lo más una por proveedor** (el índice único lo garantiza);
- el correo "Borradores creados en Zoho" llega a `auto.correos` (lo confirma el usuario).

[usuario] `viejo-quieto.sql` con la hora de T-0. Expected: 0 y 0.
[usuario] En Zoho Books → Órdenes de compra, las de referencia `AUTO-<fecha>` de hoy aparecen una sola vez.

- [ ] **Step 2: [agente] Días 2 a 5: lo mismo, cada día**

Además, en `portal-verificar.sql`, `ov_pendiente` vacío o chico, y ningún `com-ov-pedidos` con `ok = false` seguido. Una falla aislada es el puente: la siguiente corrida reintenta.

Si se repite, revisar bliocjvq, el user mapping y `portal_puente`. Los grants del puente son de `pedidos`/`aperturas`, no de `com_*`, así que el revoke no los toca.

- [ ] **Step 3: Ventana de 30 días**

Mientras dure, la reversa (Tarea 12) es posible. No se borra nada en bliocjvq, y no se re-copia hacia el portal: la copia en espejo **reemplazaría** lo capturado en el portal con lo del viejo.

- [ ] **Step 4: Archivo (día 30, con OK del usuario)**

1. [usuario] SQL Editor de bliocjvq: `viejo-archivar.sql`. Expected: las 17 tablas listadas en `archivo_comercializadora`.
2. [usuario o agente · OK] Borrar las funciones viejas:

   ```powershell
   npx.cmd supabase functions delete zoho-sync --project-ref bliocjvqwskvoxrumqby
   npx.cmd supabase functions delete com-minmax --project-ref bliocjvqwskvoxrumqby
   npx.cmd supabase functions delete zoho-generar-oc --project-ref bliocjvqwskvoxrumqby
   npx.cmd supabase functions delete zoho-proveedor-minimo --project-ref bliocjvqwskvoxrumqby
   ```

   `send-email` **no** se borra (lo usa el portal).
3. [agente · OK] En la guía §14, anotar la fecha del archivo y que la copia y la reversa ya no aplican.

Para deshacer el archivo: `viejo-desarchivar.sql`.

### Task 12: Reversa (solo si hace falta, dentro de los 30 días)

Orden fijo: **primero se apaga el portal**. Nunca dos crons en Real.

- [ ] **Step 1: [agente · OK] Apagar el portal y volverlo a simulación**

```powershell
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-pausar.sql"
npx.cmd tsx "$env:TEMP\plan4\sql-portal.mts" "$env:TEMP\plan4\portal-simulacion.sql"
```

Expected: los cuatro jobs inactivos y `modo: 'simulacion'`.

- [ ] **Step 2: [usuario] Quitar `COM_EFECTOS_EXTERNOS` del portal**

`npx.cmd supabase secrets unset COM_EFECTOS_EXTERNOS --project-ref jpqkmnfjwzniptszjuli`, o desde el panel.

- [ ] **Step 3: [agente] Armar la reversa**

```powershell
npx.cmd tsx scripts/migracion-legado/reversa-comercializadora.ts
```

Expected: el conteo por tabla ("a escribir N · a borrar M") y la ruta del SQL en `%TEMP%`. Revisar los conteos con el usuario: `com_movimientos` trae las OVs derivadas y lo capturado en el portal.

- [ ] **Step 4: [usuario] Devolver escritura y datos a bliocjvq**

En el SQL Editor de bliocjvq:
1. pegar `docs/migracion/paridad/grants-bliocjvq-antes.sql` (los grants de antes del revoke);
2. pegar el SQL de la reversa **completo**, que es un solo `begin … commit`;
3. borrar el archivo de `%TEMP%`.

[agente] Volver a correr el Step 3. Expected: "Sin cambios".

- [ ] **Step 5: [usuario] Volver a poner los secretos `ZOHO_*` en bliocjvq**

Los cinco nombres del Step 4 de la Tarea 10, con los valores guardados (panel o `secrets set`; nunca por portapapeles en PowerShell).

- [ ] **Step 6: [agente · OK] Revertir el HTML viejo**

En el repo viejo:

```bash
git revert -m 1 <commit de merge del PR>
git push
```

PR, merge y publicación de Netlify con OK. Verificar con `curl.exe` que `_comRutaPortal` ya **no** aparece.

- [ ] **Step 7: [usuario] Reprogramar los jobs viejos**

[agente] Antes, `portal-cron.sql --lectura`: los cuatro jobs del portal inactivos.
[usuario] Luego, en el SQL Editor de bliocjvq: `viejo-reprogramar.sql`. Expected: los tres jobs con `active = true`.

- [ ] **Step 8: Verificar y avisar**

[agente] Al día siguiente, por lectura con `conLegado`: en `com_sync_log` de bliocjvq, `com-minmax` y `zoho-generar-oc` con `ok = true`.
[usuario] Avisar a los usuarios que regresen al sitio viejo y recarguen.

Lo que la reversa no regresa: `com_oc_auto` del portal. Las OCs reales siguen en Zoho y el `zoho-sync` del viejo las vuelve a ver. Antes de un nuevo intento se vuelve a la Tarea 8 (copia en espejo y sombra).

---

## Self-review (hecho al escribir)

- **Cobertura del spec:**
  - Cutover 1 (carga, funciones y cron en modo registrar): Tarea 8 (sombra). La carga y las funciones ya estaban (plan 2).
  - Cutover 2 (paridad diaria, 3 días, diferencias explicadas): Tareas 2, 3 y 9.
  - Cutover 3 (orden del día del cambio, nunca dos crons en Real): Tarea 10, Steps 2 a 11. Cambia, y está marcado: la copia es completa (decisión 4) y el revoke va antes de la copia (Step 6).
  - Cutover 4 (pestaña reemplazada por un aviso; solo lectura 30 días; archivo): Tareas 5, 6, 10 (Step 6) y 11 (Step 4).
  - Reversa: Tarea 12, con la copia inversa de la Tarea 4.
  - Riesgos:
    - "dos crons" → Review Focus 1;
    - "bliocjvq caído" → Tarea 1 (falla controlada) y Tarea 10 (Step 8);
    - "ediciones en el viejo después de la copia" → Tarea 10 (Steps 5 y 6, antes del Step 7) y la prueba de la Tarea 5 (OVs vacías).
  - El mapa A–I tiene tarea o decisión en cada renglón. H corrige al spec (decisión 9).
- **El código se probó antes de escribir el plan:**
  - **Portal**, en una copia en `feat/comercializadora-plan-abastos` (`fc7f233`) con `npm ci` propio (`scratchpad\repo4`):
    - Vitest: 182 archivos (181 verdes más la falla conocida de Rappi), 1,434 pasadas y 5 omitidas;
    - las nuevas: 16 de la migración 50, 11 de la comparación, 3 de lecturas y 3 de la reversa;
    - el RED de cada tarea, comprobado quitando el archivo;
    - `tsc --noEmit` limpio, `npm run test:funciones` con 257 pasadas y 33 ignoradas, y `next build` correcto.
  - **Repo viejo**, en una copia de `ee23758` (`scratchpad\viejo4`):
    - Tarea 5: de 42/5 a 47/0;
    - Tarea 6: de 47/4 a 51/0;
    - `deno task test`: 178 pasadas.
  - **SQL del runbook:** corridos en PGlite con un `cron` de prueba (`runbook4\validar-runbook4.mts`). Se comprobó:
    - la guarda de la sombra;
    - pausa y activación de los cuatro jobs;
    - Real y simulación con un solo renglón de historial;
    - verificación y ediciones;
    - grants antes, revoke (deja Crédito y `com_proveedores`) y quieto;
    - reprogramar, archivar y desarchivar.

    `sql-portal.mts` y `aplicar50.mts` pasan tsc. **No se corrió nada contra producción.**
  - **No se probó:** el recorrido del HTML viejo en el navegador con sesión real (Tarea 6, Step 6) ni la primera corrida real con `pg_net`/fdw. Son pasos del runbook.
- **Marcadores pendientes:** ninguno. Las horas de ejemplo de `viejo-quieto.sql` y `portal-ediciones.sql` se sustituyen al usarlas (Tarea 10, Step 7; Tarea 11, Step 1). Las preguntas abiertas del usuario son el dominio, la rama de Netlify, la fecha y la ventana, y quién corre cada paso.
- **Tipos consistentes:**
  - `AccionOv` (Tarea 2) = las columnas `accion, folio, sku, estado_antes, estado` que pide `planOv` (Tarea 3) a `com_ov_plan` (Tarea 1);
  - `Lado` (Tarea 2) lo arma `leerLado` (Tarea 3);
  - `VentaVieja` (Tarea 3) = `{ id, folio, estado }`, lo mismo que `com_derivar_ov` le pasa a `com_ov_plan`;
  - `conPortalLectura` (Tarea 3) lo usan la Tarea 4 y `sql-portal.mts`;
  - `TablaCom.editable` (plan 2) limita la reversa;
  - `_comUrlPortal`/`_comAbrirPortal` (Tarea 5) los usa la Tarea 6.
- **Review Focus → pruebas:**
  1. Dos crons: Tarea 10 (Steps 3 y 10, con verificación vacía), Tarea 12 (Step 7 después del Step 1), Tarea 8 (guarda de `sombra-activar.sql`, probada).
  2. Duplicar o regresar: Tarea 1 ("idempotente", "solo avanza…", "reabierto", "ambiguo", "cantidades…", candado).
  3. Copia que pisa: Tarea 10, Step 7 (`portal-ediciones.sql`, probado) y Tarea 3 ("las firmas cambian si cambia una entrada").
  4. Puente caído: Tarea 1 ("si el puente falla…"), `aplicar50.mts` y Tarea 10 (Step 8).
  5. Vercel o módulo: Tarea 10, Step 1 (puntos 2 a 4).
