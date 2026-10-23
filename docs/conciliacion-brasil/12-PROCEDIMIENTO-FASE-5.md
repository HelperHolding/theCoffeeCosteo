# 12 · Procedimiento de la fase 5: merge y despliegue

**Estado:** verificaciones previas Q1–Q5 **hechas y correctas** (2026-10-23). **Merge y despliegue pendientes** de la confirmación de Carlo. El flujo MCP completo sigue pendiente como limitación documentada (`13-TAREA-AUTH-SITE-URL.md`).

## Resultado de las verificaciones previas

| # | Resultado |
|---|---|
| Arranque | **Sin migraciones, sincronizaciones ni escrituras automáticas.** No hay `instrumentation.ts`, `middleware`, `vercel.json` ni scripts `predev`/`postinstall`. La app solo escribe en *server actions* (Guardar en recetas, precios, configuración o CRM) y en el cupo del chat; ninguno se usó. Iniciar sesión hace las escrituras propias de Supabase Auth (sesión y tokens), como cualquier acceso. Auth y sus controles, sin cambios |
| Q1 | `main` = `b7416e1`; la rama (`1201038`) la contiene |
| Q2 | `tsc` ✅ · `vitest`: 351 pasan, 5 omitidas; solo falla `paridad.test.ts` (requiere el Excel) · `next build` ✅ |
| Q3 | Checks del PR en `1201038`: Vercel ✅ · Vercel Preview Comments ✅ · Supabase Preview *skipping* |
| Q4 | Estado de la base idéntico a `fase4/estado-despues-produccion.json`; última migración `20261023000021` |
| Q5 | Portal local de la rama (`next dev`, **solo `localhost`**, configuración `portal-local-solo`) contra producción, con la sesión de Carlo, **solo lecturas** (detalle abajo) |

### Q5: prueba local con sesión real

Rubén Darío (532), 23-oct-2026:

| Verificación | Resultado |
|---|---|
| Productos · Hoy (23-oct) | 46 pedidos, $8,439.20; suma por productos ✓. **33 filas sin nombres repetidos.** «Generic (sin identificación del proveedor)» en el **#1**. «Black Ginger» una sola vez, con la marca «sin código» (hoy solo llegó desde la App sin código; no hay código conocido en el periodo) |
| Tamaños | Solo vasos: Regular - 240ml / 440ml, Large - 355ml / 600ml. «Double shot (36ml)», «Single Shot (18ml)» y «Extra Double shot (36ml)» aparecen en Personalizaciones como Café |
| Productos · 28 días (26-sep → 23-oct, por la ruta de la app) | 77 filas, sin nombres repetidos, claves únicas, ninguna «sin código». Generic #1, $20,735.00, con `nombreProveedor: "Generic"`. Conciliación: diferencia 2 ¢ = 2 pedidos con redondeo del proveedor (`soloRedondeo`); `rappiSinNumeroOrden` 0 |
| Pedidos · 23-oct (46 pedidos, 2 páginas) | Pedido 31893730 (09:11:42, $568.00, descuento $84.00, Rappi): título «**Pedido POS 31893730 · $568.00**» y «**Orden Rappi 2482647582**»; 5 líneas iguales a la API (Generic $111 y las demás con personalizaciones) |
| Pedido con tarjeta (31894079, Mostrador) | «Pedido POS 31894079 · $384.00», **sin** Orden Rappi |
| Respuesta JSON de Pedidos (23-oct, ambas páginas) | Sin `refundId` ni UUID. 24 pedidos Rappi con número de orden; 0 Rappi sin número; 0 pedidos no Rappi con número |
| Costeo · ficha de Iced Latte | Chica: costo $15.44; Mostrador/App $70.00, margen $44.90 (74.4 %); Rappi manual $88.00, margen con comisión $38.44 (50.7 %). Grande: costo $18.28; $80.00, margen $50.69 (73.5 %); Rappi manual $100.00, margen con comisión $43.79 (50.8 %). **Idéntico a `v_resumen` en producción** |
| Escrituras | Ninguna. Bitácora: 323 filas, la última de las 17:02 UTC (antes de la prueba). Estado de la base idéntico. Único POST: el `/login` de Carlo |
| Errores | Servidor sin errores. En la consola del navegador solo el WebSocket de recarga en caliente de `next dev` (`ws://localhost:3000/_next/hmr`), propio del modo desarrollo |

El servidor local quedó detenido al terminar.

Fecha: 2026-10-23. PR: [#18](https://github.com/sebascm0906/theCoffeeCosteo/pull/18) (`feat/conciliacion-fase3` → `main`).

## 0. Punto de partida verificado

| Dato | Valor |
|---|---|
| `main` | `b7416e1`, sin cambios desde que se creó la rama. La rama la contiene: no hace falta sincronizar |
| Producción en Vercel | Despliegue `b7416e1` (2026-10-23 18:20 UTC). Funciones en `iad1` |
| PR #18 | `OPEN`, `MERGEABLE`, `CLEAN`. Checks: Vercel ✅ · Vercel Preview Comments ✅ · Supabase Preview *skipping* |
| Base de datos | Migración 21 **ya aplicada y registrada** (fase 4). Políticas y funciones = `fase4/estado-despues-produccion.json` |
| Integración GitHub ↔ Supabase | «Deploy to production» **activo** sobre `main`. Al hacer merge aplica las migraciones no registradas. La 21 ya está registrada → **no debe aplicar nada** |
| Despliegue de Vercel | Automático al hacer push/merge a `main` (así se desplegaron los PR #11–#17) |

## 1. Qué se publica

| Área | Cambio | Riesgo |
|---|---|---|
| Sucursales · ranking | Una línea sin `defaultCode` (App, desde el 2-oct) se une al código del mismo nombre si ese nombre tiene un **único** código; si no, queda aparte con la marca «sin código». Claves sin colisión. Orden estable | Bajo: totales idénticos con 4 semanas reales; ranking de 612 de 113 a 79 filas, sin nombres repetidos |
| Sucursales · Generic | «Generic (sin identificación del proveedor)», con el código y el nombre crudos conservados | Bajo: solo cambia la etiqueta |
| Sucursales · tamaños | Solo vasos (`Regular/Large - N ml`); shots y dosis pasan a personalizaciones | Bajo: solo presentación |
| Sucursales · detalle del pedido | «Pedido POS …» y, en pedidos Rappi, «Orden Rappi …» (`refundId` de 10 dígitos validado en el servidor; nunca se expone el de otros pagos). Contador `rappiSinNumeroOrden` | Bajo |
| Costeo · ficha de producto | `v_resumen` y `precio_canal_manual` filtrados por producto en la base | Bajo: misma ficha, menos datos (16 → 5 ms en BD tras la 21) |
| Base de datos | Migración 21 (archivo). **Ya aplicada**; el merge solo la incorpora a `main` | Nulo si la integración la reconoce como registrada (se verifica en el paso 4.2) |
| Documentación y scripts | `docs/conciliacion-brasil/`, `scripts/conciliacion/` (solo lectura y fase 4) | Sin efecto en la app |

**No se publica:**
- A7 (páginas de 1,000);
- decisiones del grupo B (precios, nombres, alias, tamaños);
- corrección de Auth (`13-TAREA-AUTH-SITE-URL.md`);
- arreglo del desbordamiento móvil de Pedidos.

## 2. Verificaciones previas (bloqueantes)

| # | Verificación | Quién | Cómo |
|---|---|---|---|
| Q1 | `main` sigue en `b7416e1`, o la rama la contiene | Claude | `git fetch` y `git merge-base --is-ancestor origin/main HEAD`. Si `main` avanzó, sincronizar y repetir las pruebas |
| Q2 | Suite completa, typecheck y build en verde en el commit final del PR | Claude | `vitest run` (salvo paridad, que requiere el Excel), `tsc --noEmit`, `next build` |
| Q3 | Checks del PR en verde en el commit final | Claude | `gh pr checks 18` |
| Q4 | Estado de la base igual al de la fase 4 | Claude (solo lectura) | `fase4-capturar.ts` comparado con `fase4/estado-despues-produccion.json`; registro con la 21 |
| Q5 | **Prueba previa con sesión real.** Carlo no tiene acceso a Vercel y el preview del PR está protegido | Claude arranca; Carlo prueba | `next dev` local de la rama (`.claude/launch.json` → `portal-local`) contra la base de producción, con la sesión de Carlo. Recorrer Sucursales 532 (Productos 28 días, Pedidos con el pedido Rappi 31893730) y la ficha de un producto en Costeo. **No escribe datos** |
| Q6 | Ventana | Carlo | Cualquier momento; el despliegue de Vercel no interrumpe sesiones. Evitar el pico de ventas si se quiere observar Sucursales en vivo |

## 3. Ejecución

1. **Merge del PR #18** con merge commit, como en los PR #11–#17:

   ```bash
   gh pr merge 18 --merge
   ```

2. Esperar el despliegue de producción de Vercel del commit de merge (`gh api …/deployments`, entorno `Production`, estado `success`).
3. Revisar que la integración de Supabase no aplicó nada: el registro sigue con 21 versiones y el estado de la base es idéntico (paso 4.2).

## 4. Verificación posterior

| # | Criterio | Quién | Umbral |
|---|---|---|---|
| 4.1 | Despliegue de producción del commit de merge | Claude | `success`; `/login` 200; `/mcp` sin token 401 con `WWW-Authenticate` |
| 4.2 | Base intacta tras el merge (integración Supabase) | Claude (solo lectura) | `schema_migrations` con la última en `20261023000021` y sin entradas nuevas; captura idéntica a `estado-despues-produccion.json`; huella de `v_resumen` `b51cf7ef…`, 645 filas |
| 4.3 | Sucursales en producción | Carlo | Productos sin nombres repetidos; «Generic (sin identificación del proveedor)» en 532; Tamaños solo vasos; el pedido 31893730 muestra «Orden Rappi 2482647582»; un pedido con tarjeta no muestra Orden Rappi; totales iguales a los de antes del despliegue |
| 4.4 | Costeo en producción | Carlo | Ficha de producto (p. ej. Iced Latte) con los mismos precios, márgenes e historial; Resumen y Productos sin cambios |
| 4.5 | Errores | Carlo (o quien tenga acceso a Vercel) | Sin errores nuevos en el portal. Los logs de Vercel no son accesibles para Claude ni para Carlo; se reporta como limitación |

## 5. Reversión

Carlo no tiene acceso a Vercel, así que la «Instant Rollback» de Vercel solo puede hacerla quien sí lo tenga (equipo `thecoffee1`). La reversión que no depende de Vercel es por Git:

1. **Solo el código de la app:** un PR que revierta los cambios de `lib/`, `components/` y `tests/portal/`, para volver al comportamiento de `b7416e1`. **Se mantiene el archivo de la migración 21**, porque está aplicada y registrada: quitarlo dejaría el repo distinto de la base. La documentación y los scripts también se mantienen.
2. Merge del PR de reversión, lo que dispara un despliegue automático (unos 2 minutos).
3. Si además hubiera que revertir la **migración 21**, se hace aparte con el procedimiento de la fase 4 (`fase4-aplicar.ts --revertir`, atómico) **y** se quita el archivo de la migración de `main` en el mismo cambio. Si no, la integración la volvería a aplicar.

**Cuándo revertir el código:**
- si 4.3 o 4.4 muestran cifras distintas de las previas o errores de carga;
- si 4.2 muestra que la integración de Supabase cambió la base (en ese caso, primero se analiza).

## 6. Después del despliegue

- Actualizar `09-RESULTADO-FASE-3.md` y este documento con el resultado.
- **Tareas abiertas que no forman parte de la fase 5:**
  - `13-TAREA-AUTH-SITE-URL.md`: corregir el Site URL; con eso se verifica el flujo MCP completo (V7);
  - A7, cuando se conozca `max_rows`;
  - grupo B de decisiones (`08-CIERRE-FASE-2.md`);
  - preguntas al proveedor (`06-PREGUNTAS-PROVEEDOR.md`);
  - desbordamiento móvil de Pedidos;
  - advertencias restantes del Security Advisor (10 triggers sin `search_path`, protección de contraseñas filtradas);
  - quitar el MCP local `thecoffee-costeo` si no se va a usar.

## Aprobaciones que se solicitan

1. **Q5:** arrancar el portal local de la rama contra producción para tu prueba con sesión real (sin escrituras).
2. **Merge del PR #18** (merge commit) y el **despliegue automático** de producción que dispara, tras Q1–Q5.
3. **Reversión del código** por PR de reversión si fallan 4.3 o 4.4. Si no la incluyes en la aprobación, te preguntaré antes.
