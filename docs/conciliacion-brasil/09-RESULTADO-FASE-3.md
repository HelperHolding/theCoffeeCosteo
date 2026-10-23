# 09 · Resultado de la fase 3 · Checkpoint 3

**Fecha:** 2026-10-23. **Rama:** `feat/conciliacion-fase3`, creada desde `origin/main` `b7416e1`. **Sin merge, sin migración aplicada y sin despliegue.**

**Alcance:** Carlo pidió continuar la fase 3 y que las mejoras autorizadas avanzaran. Se interpretó como los puntos A1–A7 de `08-CIERRE-FASE-2.md`. No se tocó nada del grupo B (precios, nombres, alias, duplicados, tamaños): sigue pendiente de decisión. Por eso **no hay script de corrección de datos**: no existe ningún campo aprobado para corregir.

## Estado por punto

| # | Cambio | Estado | Archivos |
|---|---|---|---|
| A1 | Ranking: una línea sin `defaultCode` se une al código del mismo nombre exacto en el periodo; si no hay ninguno, se agrupa por nombre | ✅ local | `lib/sucursales/normalizar.ts` (`sinCodigo`), `lib/sucursales/metricas.ts` (`productos`) |
| A2 | Generic visible, rotulado «Generic (sin identificación del proveedor)»; código y nombre crudos conservados (`codigo: 'GENERIC'`, `nombreProveedor: 'Generic'`) | ✅ local | `lib/sucursales/metricas.ts` |
| A3 | Tamaños solo vasos (`^(Regular\|Large) - \d{3}ml$`). Shots y dosis pasan a personalizaciones, también en el color de la etiqueta | ✅ local | `lib/sucursales/metricas.ts` (`ES_TAMANO` exportada), `components/sucursales/colores.tsx` |
| A4 | Prueba de Pedidos independiente del reloj (fija `Date` con `vi.setSystemTime`) | ✅ | `tests/portal/sucursales-ui.test.tsx` |
| A5 | Migración 21: 89 políticas de Costeo con `(select …)`; `search_path` en `tiene_rol`; sin `execute` para `anon` en `rol_actual` y `registrar_bitacora` | ✅ preparada y probada en PGlite · **no aplicada** | `supabase/migrations/20261023000021_costeo_rls_rendimiento.sql`, `docs/conciliacion-brasil/rollback-021.sql` |
| A6 | Ficha de producto: `v_resumen` y `precio_canal_manual` filtrados por producto en la base (`todas(…, { producto_id })`) | ✅ local | `lib/portal/consultas.ts`, `components/recetas/ficha.tsx` |
| A7 | Páginas de 1,000 en `todas()` | ⏸ **fuera de esta fase** (decisión de Carlo) hasta confirmar `max_rows` | — |
| R1 | **Orden Rappi** en el detalle del pedido, junto a «Pedido POS» (aprobada por Carlo; diseño en `11-GENERIC-Y-ORDEN-RAPPI.md`) | ✅ local | `lib/sucursales/{normalizar,contratos,datos,metricas}.ts`, `components/sucursales/detalle-pedido.tsx` |

**Por qué A7 está en espera:** el `max_rows` de PostgREST no está en el rol `authenticator` y no se puede leer sin el panel. Si fuera menor que 1,000, `todas()` cortaría resultados **en silencio**.
- Carlo puede confirmarlo en Settings → API → *Max rows*.
- Si es ≥ 1,000, el cambio es una línea con su prueba.

**No se cambió:** perfiles en la ficha. Se siguen cargando todos (5 filas, 3 ms), porque el historial paginado necesita a los autores de entradas anteriores; limitarlo rompería esas etiquetas.

## Verificación

| Prueba | Resultado |
|---|---|
| `vitest run` (suite completa) | **338 pasan**, 5 omitidas. Solo falla el archivo `tests/migracion/paridad.test.ts`, que exige el Excel original (ya fallaba antes de estos cambios) |
| Revisión en navegador | Arnés visual del repo (`prueba-visual`, datos sintéticos, sin sesión ni API real), con casos sintéticos nuevos: Generic en Rappi, App sin `defaultCode`, shots y orden Rappi de 10 dígitos. Resultados abajo |
| Nuevas pruebas | Unión por código nulo con totales conservados; «Pan de Muerto» sin código conocido queda por nombre; tamaños solo vasos; Generic rotulado con su nombre crudo y su peso; filtro de `todas()` antes de ordenar y paginar; políticas con initPlan; `anon` sin `execute` |
| Control negativo A5 | Sin la migración 21, las 2 pruebas nuevas de BD **fallan**; con ella, pasan |
| Equivalencia A5 | Volcado de `pg_policies` antes y después en PGlite: **145 de 145 políticas con la misma lógica**. 89 cambian de texto, solo por el envoltorio `SELECT` y la notación del arreglo |
| Rollback A5 | `rollback-021.sql` aplicado sobre 01–21 deja políticas y privilegios **idénticos** al estado previo |
| `tsc --noEmit` | ✅ |
| `next build` | ✅ |
| Prettier | Archivos tocados conformes, normalizando a LF; el checkout usa CRLF por `autocrlf`, como el resto del repo |

### Revisión en navegador (2026-10-23)

| Pantalla | Comprobación | Resultado |
|---|---|---|
| Productos · Hoy | Generic rotulado «Generic (sin identificación del proveedor)» con su importe; «suma por productos ✓» | ✅ |
| Productos · Últimos 7 días (604 pedidos, App con y sin código) | 7 filas, **ningún nombre repetido**; venta = suma por productos ($108,185.00 ✓) | ✅ |
| Productos · detalle desplegado | «Tamaños» solo muestra vasos (Regular - 440ml, Large - 600ml); «Double shot (36ml)» aparece en personalizaciones con tipo Café | ✅ |
| Pedidos · detalle de pedido Rappi | «Pedido POS 1045 · $429.00» y debajo «Orden Rappi 2475079303» (sintético); línea Generic visible | ✅ |
| Pedidos · detalle de pedido con tarjeta | «Pedido POS 1041 · $158.00», **sin** línea de Orden Rappi | ✅ |
| Consola | Sin errores | ✅ |
| Móvil (375 px) | El diálogo se ve recortado porque **la tabla de Pedidos (633 px) y la barra de pestañas desbordan la página**. Es previo a esta fase: `pedidos.tsx` no se modificó | ⚠️ Hallazgo fuera de alcance, para una mejora aparte |

Limitaciones:
- El arnés no prueba sesión, RLS ni la API real. Esos los cubren las pruebas de rutas y de base.
- No se probó con un usuario real en el portal: requeriría credenciales.

## Medición: antes y después en las mismas condiciones

**Ranking** (datos reales: 4 semanas cerradas, 5,324 pedidos; `simular-ranking.ts` con el `productos()` nuevo):

| Sucursal · origen | Filas antes | Filas después | Importe, líneas y customs |
|---|---|---|---|
| 612 · todos | 113 | **79** | Idénticos |
| 583 · todos | 94 | **76** | Idénticos |
| 532 · todos | 94 | **77** | Idénticos |
| 612 / 583 / 532 · app | 65 / 28 / 44 | 47 / 23 / 32 | Idénticos |
| Mostrador y Rappi | Sin cambio | Sin cambio | Idénticos |

- **Residual venta − líneas:** 17, 2 y 5 ¢ = número de pedidos que no cuadran por ±1 ¢ (redondeo del proveedor), igual que antes.
- Generic sigue en la posición 2 de 532 «todos» y en la 1 de Rappi, con el mismo importe.
- «Tamaños» que no son vasos: de 16 etiquetas a **0**.

**Ficha de producto** (A6). Evidencia de base de datos, rol `authenticated`, EXPLAIN de fase 2:

| Lectura | Antes | Después |
|---|---|---|
| `v_resumen` | 645 filas en 2 llamadas; cada una recalcula la vista (~103 ms bajo RLS) | 6 filas en 1 llamada (**16 ms** bajo RLS) |
| `precio_canal_manual` | 83 filas | Solo las del producto (0–3) |

El tiempo de pantalla en producción no se mide sin acceso a Vercel.

**RLS** (A5): el criterio propuesto es que `v_resumen` completo bajo RLS baje de **103 ms a ≤ 40 ms**, con el mismo resultado fila a fila.
- **No se puede medir localmente:** PGlite no tiene los datos ni el costo real, y aplicar DDL en producción está fuera de la fase 3.
- Se mide en la fase 4, antes y después, con `scripts/conciliacion/explain-resumen.ts`.

## Riesgos

- **A1:** si el proveedor usara un mismo nombre para dos productos distintos, una línea sin código se uniría al más frecuente. No se observó en la ventana, y la regla solo aplica cuando falta el código.
- **A5:** cambia el texto de 89 políticas. La lógica está demostrada idéntica en PGlite (145/145) y las pruebas de permisos y MCP pasan. El rollback es exacto y está probado.
- **A2/A3:** cambio solo de presentación; los totales no se tocan.

## Checkpoint 3: aprobaciones que se solicitan

1. **Commit y PR** de la rama `feat/conciliacion-fase3` — **autorizados por Carlo** tras los ajustes. Incluye A1–A4, A6, R1, la migración 21 (sin aplicar), la documentación y `scripts/conciliacion/`.
2. **Aplicar la migración 21 en la fase 4:**

   | Concepto | Detalle |
   |---|---|
   | Proyecto | `jpqkmnfjwzniptszjuli` |
   | Objeto | 89 `alter policy` + `alter function tiene_rol set search_path` + 2 `revoke/grant execute` |
   | Datos | **0 filas de datos modificadas** |
   | Ventana | Cualquier momento de bajo uso; la migración es instantánea (DDL de políticas) |
   | Respaldo | `rollback-021.sql` (exacto, probado). Confirmar si el plan tiene PITR; no se asume |
   | Validación | EXPLAIN como `authenticated` antes y después; recorrido de Costeo con un usuario de cada rol; MCP de solo lectura; Advisors |
3. **A7:** queda fuera hasta confirmar `max_rows` en el panel.
4. **Orden Rappi:** aprobada e implementada (R1).
5. **Conciliación de la orden 2482647582** (`11-GENERIC-Y-ORDEN-RAPPI.md`): Rappi suma 580 en productos y 538 de total final; la API reporta 568 (`grossAmount`) y 538 (`netAmout`). Hay que definir qué total es oficial para conciliar con Rappi. **No se ajustó ningún importe.**
6. **Grupo B:** decisiones pendientes de `08-CIERRE-FASE-2.md` (B1 precio de lista primero).
