# 10 · Procedimiento de la fase 4: aplicar la migración 21

**Estado:** preparado para aprobación. **No se aplicó nada en el proyecto real, no se hizo merge y no se desplegó.**

Fecha: 2026-10-23. Proyecto Supabase: `jpqkmnfjwzniptszjuli`. PR: [#18](https://github.com/sebascm0906/theCoffeeCosteo/pull/18).

## 0. Estado de partida verificado (solo lectura)

| Comprobación | Resultado |
|---|---|
| Checks del PR #18 (commit `95b12a5`) | Vercel ✅ · Vercel Preview Comments ✅ · Supabase Preview **skipping** · `MERGEABLE` / `CLEAN` |
| Migraciones registradas en producción | 20; la última es `20261022000020` (`sucursales_acceso`). La 21 **no** está registrada |
| Políticas y funciones en producción | **145 políticas y los privilegios y configuración de funciones son idénticos, byte a byte, a PGlite con 01–20** (`fase4/esperado-antes.json`). Por eso la reversión es exacta para producción, no solo para PGlite |
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

## 2. Verificaciones previas (bloqueantes)

| # | Verificación | Responsable | Cómo |
|---|---|---|---|
| P1 | **No hacer merge del PR #18 antes de aplicar la 21.** Según `docs/crm/ARQUITECTURA.md:211`, la integración GitHub ↔ Supabase aplica al hacer merge las migraciones no registradas. Un merge previo la aplicaría sin estas verificaciones | Carlo | Confirmar en Supabase → Integrations → GitHub si «Deploy to production» está activo. Aunque lo esté, el orden de este procedimiento (aplicar y registrar primero) evita una doble aplicación |
| P2 | Punto de recuperación | Carlo | Confirmar en Settings → Database → Backups si hay PITR o un respaldo diario reciente. **No se asume PITR.** Con o sin él, la reversión exacta está en `rollback-021.sql` y en el modo `--revertir` |
| P3 | Ventana de bajo uso | Carlo | La migración toma bloqueos exclusivos breves sobre las 15 tablas de Costeo. Con `lock_timeout = 3s`, si algo ocupa una tabla, **falla y revierte**; no se queda esperando |
| P4 | Sin cambios desde la aprobación | Automático | El script compara políticas, funciones y registro con `fase4/esperado-antes.json`. Ante cualquier diferencia se detiene sin aplicar nada |
| P5 | Ensayo en producción | Claude, con aprobación | `fase4-aplicar.ts` sin flags: aplica dentro de una transacción, verifica el resultado contra `fase4/esperado-despues.json` y hace **ROLLBACK**. Toma los mismos bloqueos que la aplicación (milisegundos). No deja cambios |

**Ensayo local ya hecho:** `tests/db/fase4.test.ts`, 5 de 5 en PGlite partiendo del estado de producción.
- El ensayo no deja cambios.
- La aplicación deja el estado esperado y la versión registrada.
- Aplicar dos veces no hace nada.
- Un cambio posterior a la aprobación detiene la reversión.
- La reversión deja todo idéntico y quita el registro.

## 3. Aplicación

Una sola transacción, desde el checkout (`DATABASE_URL` de `.env.local`, verificada contra el proyecto y nunca impresa):

```bash
npx tsx scripts/conciliacion/fase4-verificar.ts "%TEMP%/fase4-antes.json"
```

```bash
npx tsx scripts/conciliacion/fase4-aplicar.ts
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
| V1 | Política y funciones iguales a `fase4/esperado-despues.json`; versión 21 registrada | Exacto (el script ya lo exige antes del COMMIT) |
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
  - exige que el resultado sea idéntico a `esperado-antes.json`.
- **Alternativa manual:** `docs/conciliacion-brasil/rollback-021.sql` en el SQL Editor (trae su `begin/commit`), más `delete from supabase_migrations.schema_migrations where version = '20261023000021';`.
- **Cuidado:** si se revierte **después** del merge del PR #18, hay que quitar también el archivo de la migración en `main` (PR de reversión). Si no, la integración la volvería a aplicar al ver la versión sin registrar.

## 6. Después de la fase 4 (aprobación aparte, fase 5)

1. Merge del PR #18. Con la 21 ya registrada, la integración no la repite.
2. Despliegue de Vercel a producción con el código de Sucursales y Costeo. El código **no depende** de la migración 21, ni la migración del código: el orden entre ambos no afecta la exactitud.
3. Verificación en producción de Sucursales (ranking, Generic, Orden Rappi) y de la ficha de producto.

## Aprobaciones que se solicitan

1. **P5 · Ensayo** en producción: transacción con ROLLBACK, sin cambios persistentes.
2. **Aplicación** de la migración 21 (pasos 3.3–3.4), en la ventana que Carlo indique, una vez confirmados P1–P3.
3. **Reversión** automática si falla V2, V5 o V7. Ya incluida si se aprueba el punto 2; si no, se pregunta antes.
