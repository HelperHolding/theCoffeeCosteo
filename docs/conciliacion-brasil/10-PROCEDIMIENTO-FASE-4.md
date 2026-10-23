# 10 · Procedimiento de la fase 4: aplicar la migración 21

**Estado:** ensayo transaccional en producción **hecho y correcto, con ROLLBACK** (autorizado por Carlo). **La aplicación persistente espera aprobación.** No hubo merge ni despliegue (reservados para la fase 5).

## Resultado del ensayo (2026-10-23, 22:29–22:31 UTC)

| Comprobación | Ensayo 1 | Ensayo 2 (`--medir`) |
|---|---|---|
| Diferencias con el estado de partida (145 políticas, 26 funciones completas) | 0 / 0 | 0 / 0 |
| Migración 21 registrada antes | No | No |
| Tiempo del cambio dentro de la transacción | 246 ms | 165 ms |
| Diferencias con el estado esperado final (políticas + funciones + ACL) | **0 / 0** | **0 / 0** |
| Versión 21 registrada dentro de la transacción | Sí | Sí |
| Fin de la transacción | **ROLLBACK** | **ROLLBACK** |
| Huella de `v_resumen` bajo RLS con la migración (V2) | — | `b51cf7ef69f043953ea39ac3d871e8ff`, 645 filas = **idéntica** a la línea base |
| `v_resumen` completo bajo RLS (V3, mediana de 3) | — | **21.3 ms** (línea base 94.9 ms; criterio ≤ 40 ms ✅) |
| `v_resumen` de un producto | — | **4.5 ms** (línea base 15.5 ms) |
| `v_alerta_producto_canal` | — | **18.4 ms** (línea base 94.8 ms) |

**Después de cada ensayo**, la captura completa de producción es **idéntica byte a byte** a `fase4/estado-antes-produccion.json` y la última versión registrada sigue siendo `20261022000020`. **No quedó ningún cambio.**

**Condiciones del ensayo:**
- PR #18 abierto y sin merge.
- Ninguna consulta activa ni bloqueo sobre las 15 tablas de Costeo; ninguna transacción de más de 30 s. Solo sesiones inactivas de `authenticator`, `supabase_admin`, `pgbouncer` y `supabase_auth_admin`.
- `lock_timeout` de 3 s.

Fecha: 2026-10-23. Proyecto Supabase: `jpqkmnfjwzniptszjuli`. PR: [#18](https://github.com/sebascm0906/theCoffeeCosteo/pull/18).

## Confirmaciones previas a la aplicación (leídas en el panel de Supabase, 2026-10-23)

Panel abierto por Carlo con su cuenta; lectura sin cambios.

| # | Condición | Resultado | Fuente |
|---|---|---|---|
| 1 | «Deploy to production» de la integración GitHub ↔ Supabase | **Activado.** Rama de producción: `main`. Branching automático desactivado (requiere Pro). Repositorio `sebascm0906/theCoffeeCosteo` | Settings → Integrations → GitHub |
| 2 | Respaldo recuperable reciente o PITR | **No existe.** El proyecto está en el **plan Free**: «Free Plan does not include project backups». PITR es un complemento de Pro | Database → Backups (Scheduled backups y Point in time) |

**Consecuencias:**
- **Por la condición 1**, un merge del PR #18 a `main` aplicaría automáticamente la migración 21 si no está registrada. Se confirma la regla P1: no hacer merge antes de aplicar (o de decidir no aplicarla).
- **Por la condición 2** no se cumple la condición de Carlo, así que **la aplicación no se ejecutó**. Tampoco se repitió el ensayo, porque está previsto justo antes de aplicar.

Al momento de la lectura, el panel mostraba además el aviso de Supabase «We are investigating a technical issue».

**Alternativas para que Carlo decida** (ninguna se ejecutó):

| Opción | Qué cubre | Costo o requisito |
|---|---|---|
| A. Aceptar como respaldo la captura exacta de los objetos afectados | La migración **no toca datos**, solo 89 políticas y 3 funciones. `fase4/estado-antes-produccion.json` (captura de producción del 2026-10-23 ~22:29 UTC, verificada de nuevo tras cada ensayo) más `rollback-021.sql` (atómico, probado) restauran exactamente esos objetos | Sin costo. **No es** un respaldo del resto de la base |
| B. Respaldo lógico con `supabase db dump` (esquema y, si se quiere, datos) guardado **fuera del repo** | Toda la base, con su fecha | Descargar Supabase CLI con `npx` (no instalado). Los datos incluyen PII (perfiles, CRM): Carlo decide dónde guardarlos |
| C. Plan Pro (respaldos diarios de 7 días; PITR como complemento) | Toda la base, con restauración desde el panel | Costo mensual; decisión de negocio |

## 0. Estado de partida verificado (solo lectura)

| Comprobación | Resultado |
|---|---|
| Checks del PR #18 (commit `95b12a5`) | Vercel ✅ · Vercel Preview Comments ✅ · Supabase Preview **skipping** · `MERGEABLE` / `CLEAN` |
| Migraciones registradas en producción | 20; la última es `20261022000020` (`sucursales_acceso`). La 21 **no** está registrada |
| Políticas en producción | **145, idénticas byte a byte a PGlite con 01–20**. Por eso el texto de `rollback-021.sql` es exacto para producción |
| Funciones en producción | **26** capturadas en `fase4/estado-antes-produccion.json` (ver «Comparación de funciones»). Todas pertenecen a `postgres`, el mismo rol que ejecuta; todas con ACL explícita (ninguna `NULL`) |
| Datos | `v_resumen` 645 filas · `v_alerta_producto_canal` 462 · `recetas` 160 |
| Huella de `v_resumen` bajo RLS (usuario admin activo) | `md5 b51cf7ef69f043953ea39ac3d871e8ff`, 645 filas |
| Tiempo bajo RLS: EXPLAIN ANALYZE, mediana de 3 | `v_resumen` **94.9 ms** (8,708 buffers) · `v_resumen` de un producto **15.5 ms** · `v_alerta` **94.8 ms** |

Herramienta: `scripts/conciliacion/fase4-verificar.ts`, de solo lectura, en una transacción `READ ONLY`.

## 1. Cambios exactos

**Archivo:** `supabase/migrations/20261023000021_costeo_rls_rendimiento.sql`.

| Objeto | Cambio |
|---|---|
| **89 políticas** en 15 tablas | Mismas condiciones, pero `rol_actual()`, `tiene_rol(...)`, `auth.jwt()` y `auth.uid()` van envueltos en `(select …)`, así que se evalúan una vez por consulta y no por fila. **Lógica idéntica** (145 de 145 políticas, comprobado en PGlite) |
| `public.tiene_rol(variadic text[])` | `set search_path = public, pg_temp` |
| `public.rol_actual()` | `revoke execute from public, anon`; `grant execute to authenticated` |
| `public.registrar_bitacora()` | `revoke execute from public, anon`; `grant execute to authenticated` (es función de trigger; los triggers no dependen de este privilegio) |
| `supabase_migrations.schema_migrations` | `insert` de la versión `20261023000021` (`costeo_rls_rendimiento`) |
| **Datos de negocio** | **0 filas modificadas** |

| Tabla | Políticas | Nombres |
|---|---|---|
| `bitacora` | 5 | lectura, oauth_sin_altas, oauth_sin_bajas, oauth_sin_bitacora, oauth_sin_cambios |
| `canales`, `categorias_insumo`, `categorias_producto`, `insumos`, `parametros`, `proveedores`, `recetas`, `tamanos` | 6 cada una | alta, cambio, lectura, oauth_sin_altas, oauth_sin_bajas, oauth_sin_cambios |
| `linea_cantidades`, `precio_canal_manual`, `producto_tamanos`, `receta_lineas` | 7 cada una | alta, baja, cambio, lectura, oauth_sin_altas, oauth_sin_bajas, oauth_sin_cambios |
| `perfiles` | 7 | alta, cambio, lectura, oauth_perfil_propio, oauth_sin_altas, oauth_sin_bajas, oauth_sin_cambios |
| `perfil_sucursales` | 1 | sucursales_sin_oauth |

No se tocan el CRM, Storage, `perfil_modulos` ni `chat_cupos`.

### Comparación de funciones (ajuste pedido por Carlo)

Cada función se identifica por **nombre y firma** (`pg_get_function_identity_arguments`) y se compara completa:

| Campo | Fuente |
|---|---|
| Firma y resultado | `pg_get_function_identity_arguments`, `pg_get_function_result` |
| Definición | `md5(prosrc)` (cuerpo), lenguaje y volatilidad |
| Propietario | `pg_get_userbyid(proowner)` |
| SECURITY DEFINER y configuración | `prosecdef`, `proconfig` (incluye `search_path`) |
| ACL | `proacl`, como conjunto ordenado (el orden de las entradas no cambia su significado) |
| Privilegios efectivos | `has_function_privilege` de `anon`, `authenticated` y `service_role` |

**Estado esperado final** = funciones de partida + **delta explícito** (`DELTA_FUNCIONES` en `scripts/conciliacion/fase4.ts`). Cualquier otra diferencia, en cualquiera de las 26 funciones, aborta.

| Función | Antes (producción) | Después (esperado) |
|---|---|---|
| `tiene_rol(VARIADIC roles text[])` | `proconfig` null; ACL con `=X`, `anon=X`, `authenticated=X`, `postgres=X`, `service_role=X` | `proconfig = {search_path=public, pg_temp}`; el resto igual |
| `rol_actual()` (SECURITY DEFINER) | Ejecutan: PUBLIC, `anon`, `authenticated`, `service_role` | ACL `{authenticated=X, postgres=X, service_role=X}`: **anon no**, authenticated sí, service_role sí (entrada propia, no depende de PUBLIC) |
| `registrar_bitacora()` (SECURITY DEFINER, trigger) | Igual que `rol_actual` | Igual que `rol_actual`. Los triggers no requieren el privilegio de quien escribe |
| Las otras 23 | — | **Idénticas** (firma, cuerpo, dueño, configuración, ACL y privilegios) |

**Pruebas en PGlite** (`tests/db/fase4.test.ts`, 8 de 8): un cambio de `search_path`, la revocación a `service_role` o un cambio de cuerpo en otra función **detienen la aplicación** antes de tocar nada.

## 2. Verificaciones previas (bloqueantes)

| # | Verificación | Responsable | Cómo |
|---|---|---|---|
| P1 | ✅ Confirmado: «Deploy to production» activado (rama `main`). **No hacer merge del PR #18 antes de aplicar la 21.** Según `docs/crm/ARQUITECTURA.md:211`, la integración GitHub ↔ Supabase aplica al hacer merge las migraciones no registradas. Un merge previo la aplicaría sin estas verificaciones | Carlo | Confirmar en Supabase → Integrations → GitHub si «Deploy to production» está activo. Aunque lo esté, el orden de este procedimiento (aplicar y registrar primero) evita una doble aplicación |
| P2 | ❌ **No hay respaldo ni PITR (plan Free)**. Punto de recuperación | Carlo | Confirmar en Settings → Database → Backups si hay PITR o un respaldo diario reciente. **No se asume PITR.** Con o sin él, la reversión exacta está en `rollback-021.sql` y en el modo `--revertir` |
| P3 | Ventana de bajo uso | Carlo | La migración toma bloqueos exclusivos breves sobre las 15 tablas de Costeo. Con `lock_timeout = 3s`, si algo ocupa una tabla, **falla y revierte**; no se queda esperando |
| P4 | Sin cambios desde la aprobación | Automático | El script compara políticas, funciones completas y registro con `fase4/estado-antes-produccion.json`. Ante cualquier diferencia se detiene sin aplicar nada |
| P5 | Ensayo en producción | ✅ **Hecho** (ver «Resultado del ensayo») | `fase4-aplicar.ts` sin flags: aplica dentro de una transacción, verifica el resultado contra el estado esperado derivado y hace **ROLLBACK** |

**Ensayo local:** `tests/db/fase4.test.ts`, 8 de 8 en PGlite partiendo del estado de producción.
- El ensayo no deja cambios.
- La aplicación deja el estado esperado y la versión registrada.
- Aplicar dos veces no hace nada.
- Un cambio posterior a la aprobación detiene la reversión.
- La reversión deja todo idéntico, incluidas las ACL, y quita el registro.
- La reversión manual es atómica y aborta si la versión no está registrada.
- Un cambio de configuración, privilegios o cuerpo en cualquier función detiene la aplicación.

## 3. Aplicación

Una sola transacción, desde el checkout (`DATABASE_URL` de `.env.local`, verificada contra el proyecto y nunca impresa):

```bash
npx tsx scripts/conciliacion/fase4-verificar.ts "%TEMP%/fase4-antes.json"
```

```bash
npx tsx scripts/conciliacion/fase4-aplicar.ts --medir
```

```bash
npx tsx scripts/conciliacion/fase4-aplicar.ts --aplicar --confirmo jpqkmnfjwzniptszjuli
```

```bash
npx tsx scripts/conciliacion/fase4-verificar.ts "%TEMP%/fase4-despues.json"
```

1. **Línea base:** se repite justo antes, por si cambiaron los datos desde hoy.
2. **Ensayo:** debe reportar `diferenciasDePartida 0/0`, `diferenciasConMeta 0/0` y `transaccion: rollback`.
3. **Aplicación:** mismas comprobaciones; registra la versión y hace `COMMIT` solo si todo coincide.
4. **Verificación posterior:** ver el punto 4.

Un `error` en el informe significa que **no se aplicó nada**: la transacción terminó en ROLLBACK. Se reporta y no se reintenta sin revisar.

## 4. Verificación posterior y criterios de éxito

| # | Criterio | Umbral |
|---|---|---|
| V1 | Políticas y funciones iguales al estado esperado derivado (`politicas-despues.json` + `DELTA_FUNCIONES`); versión 21 registrada | Exacto (el script ya lo exige antes del COMMIT) |
| V2 | **Mismo resultado bajo RLS**: huella `md5` de `v_resumen` y número de filas | Igual a la línea base del paso 3.1 (hoy `b51cf7ef…`, 645) |
| V3 | Tiempo de `v_resumen` completo bajo RLS (mediana de 3) | **≤ 40 ms** (hoy 94.9 ms). Es una propuesta: si mejora pero no llega, se reporta y Carlo decide |
| V4 | `v_alerta_producto_canal` y `v_resumen` de un producto | Menor que la línea base (94.8 ms y 15.5 ms) |
| V5 | Recorrido funcional en el portal (Carlo, con su sesión) | Costeo, Resumen, Productos (ficha), Insumos y Configuración cargan igual; Sucursales y CRM sin cambios |
| V6 | Permisos de escritura sin cambio | Ya cubiertos por `tests/db/permisos.test.ts` (16 casos). En producción no se escriben datos de prueba; si Carlo quiere, guarda un precio manual sin cambiarlo (registrará una fila en la bitácora) |
| V7 | MCP de solo lectura | Una consulta de Claude por MCP sigue respondiendo y no puede escribir |
| V8 | Advisors (Carlo, en el panel) | Desaparecen `auth_rls_initplan` en Costeo, `function_search_path_mutable` en `tiene_rol` y la ejecución de `anon` en `rol_actual` / `registrar_bitacora` |

**Cuándo revertir de inmediato:**
- si V2 falla (cambia el resultado);
- si V5 o V7 muestran un error de permisos;
- si aparece cualquier denegación inesperada para un usuario activo.

**Cuándo no revertir:** si solo V3 queda corto. En ese caso se reporta para decidir.

## 5. Reversión

```bash
npx tsx scripts/conciliacion/fase4-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli
```

- **Qué hace:**
  - comprueba que el estado actual sea exactamente el de «después»; si alguien cambió algo desde entonces, se detiene sin tocar nada;
  - restaura el texto exacto de las 89 políticas y los privilegios previos (`rollback-021.sql`);
  - quita el registro de la versión 21;
  - exige que el resultado sea idéntico a `estado-antes-produccion.json`, incluidas las ACL.
- **Alternativa manual (atómica, ajuste pedido por Carlo):** ejecutar `docs/conciliacion-brasil/rollback-021.sql` completo en el SQL Editor. En **una sola transacción**:
  1. aborta si la versión 21 no está registrada;
  2. restaura las 89 políticas y los privilegios;
  3. quita el registro de la versión.

  Si algo falla, no queda ni restauración parcial ni registro huérfano. Probado en PGlite: tras la reversión manual el estado es el previo y el registro desaparece; sin registro, aborta sin tocar nada.
- **Cuidado:** si se revierte **después** del merge del PR #18, hay que quitar también el archivo de la migración en `main` (PR de reversión). Si no, la integración la volvería a aplicar al ver la versión sin registrar.

## 6. Después de la fase 4 (aprobación aparte, fase 5)

1. Merge del PR #18. Con la 21 ya registrada, la integración no la repite.
2. Despliegue de Vercel a producción con el código de Sucursales y Costeo. El código **no depende** de la migración 21, ni la migración del código: el orden entre ambos no afecta la exactitud.
3. Verificación en producción de Sucursales (ranking, Generic, Orden Rappi) y de la ficha de producto.

## Aprobaciones que se solicitan

1. ~~P5 · Ensayo~~: **hecho**, dos veces, con ROLLBACK y sin cambios persistentes.
2. **Aplicación persistente** de la migración 21 (pasos 3.3–3.4), en la ventana que Carlo indique. Antes, Carlo confirma:
   - **P1:** la opción «Deploy to production» de la integración; el PR no se toca hasta la fase 5;
   - **P2:** si hay PITR o un respaldo reciente.

   Justo antes se repiten la línea base y el ensayo (`--medir`), por si algo cambió.
3. **Reversión** automática con `--revertir` (atómica) si falla V2, V5 o V7. Ya incluida si se aprueba el punto 2; si no, se pregunta antes.
