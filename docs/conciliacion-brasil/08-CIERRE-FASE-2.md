# 08 · Cierre de la fase 2 · Checkpoint 2

**Fecha:** 2026-10-23. **Estado:** fase 2 entregada. **Espera la aprobación de Carlo antes de la fase 3.**

**Costeo no se ha corregido.** No se cambiaron código funcional, datos, esquema, permisos ni configuración remota. No hubo commit, push, PR ni despliegue.

## Estado del repo

- `origin/main` = `b7416e1`, el mismo commit analizado en la fase 1. Sin cambios remotos desde entonces.
- La rama local `feat/letrero-modo-noche` (`1a7464f`) tiene el mismo árbol.
- Archivos nuevos sin commit:
  - `docs/conciliacion-brasil/` (01–08 y el CSV);
  - `scripts/conciliacion/` (utilidades de solo lectura).
- `.claude/` se conserva intacto.

## Qué se consultó realmente

| Fuente | Detalle |
|---|---|
| Supabase `jpqkmnfjwzniptszjuli` | Unas 7 sesiones de lectura (`BEGIN READ ONLY` + `ROLLBACK`): identidad, esquema, conteos, inventario, `pg_stat_statements`, una muestra de 6 recetas y EXPLAIN (ANALYZE) de 4 lecturas, con y sin RLS |
| API Brasil | **17 GET**, de un tope de 40: 1 catálogo + 16 páginas (612: 2 por semana; 583 y 532: 1 por semana) |
| Ventanas | 2026-09-21–27, 09-28–10-04, 10-05–11 y 10-12–18 (lunes a domingo, fecha local de cada tienda; `hoy` = 2026-10-23 en las tres). Todas `completo=true` |
| Crudos | `%TEMP%\thecoffee-sucursales-api\fase2\`, fuera del repo. No se guardaron en Supabase |
| Recetario | Texto extraído localmente; índice de 72 fichas; cantidades de 6 bebidas |
| No consultado | Vercel (sin acceso), Advisors oficiales, región de Supabase y el Excel original |

## Resultados clave

1. **Generic llega literal del proveedor** (`GENERIC` / «Generic»).
   - Solo en 532 y solo en Rappi: $18,020 en 4 semanas.
   - Es el #2 de «todos» y el #1 de la pestaña Rappi.
   - No se puede identificar con la API. → 05
2. **Los productos de App salen duplicados en el ranking** desde el 2-oct, por `defaultCode` nulo: 34, 18 y 17 duplicados en 612, 583 y 532. La opción B lo resuelve y conserva los totales. → 05
3. **Los precios son por tienda.** `precio_lista` coincide con 532 en 75 de 75 casos; 612 y 583 cobran más. No hay un precio oficial único que «corregir». → 04
4. **Nombres:** 67 exactos, 7 que solo difieren en mayúsculas o espacios y 21 alias candidatos (Frappé ↔ Frap, Pumpkin Spice ↔ Pumpkin…). 5 duplicados probables en Costeo y 8 productos de la API sin receta. → 04
5. **Recetario:** las cantidades de la muestra coinciden (Chai requiere conversión). Los nombres tienen erratas internas y el grande caliente difiere (360 frente a 355 ml de la API).
6. **Supabase:**
   - RLS multiplica por 5 el tiempo de `v_resumen` y `v_alerta` (21 → 103 ms) y por 9 los buffers.
   - 89 políticas sin `(select …)`.
   - `todas()` recalcula la vista dos veces por pantalla.
   - Migraciones 20 de 20, sin desviaciones. → 07

## Cambios sugeridos para la fase 3

### A. Sustentados y listos para aprobación

| # | Cambio | Criterio de aceptación | Riesgo | Verificación |
|---|---|---|---|---|
| A1 | **Ranking con la opción B**: código; si es nulo, el código del mismo nombre exacto en la ventana; si no hay, el nombre | Mismos totales (importe, líneas, customs) en todos los orígenes; ningún nombre en dos filas con fixtures de código nulo | Bajo | Local (vitest con fixtures) |
| A2 | **Generic visible y rotulado** «Generic (sin identificación del proveedor)», sin excluirlo | Total sin cambio; etiqueta solo cuando `defaultCode = GENERIC` | Bajo | Local |
| A3 | **Regex de tamaño** restringida a `^(Regular\|Large) - \d{3}ml$`; shots y dosis pasan a personalizaciones | Totales sin cambio; «Tamaños» solo muestra vasos | Bajo | Local |
| A4 | **Prueba dependiente del reloj** (`sucursales-ui.test.tsx:176`): fijar la fecha del sistema | La suite pasa en cualquier fecha | Bajo | Local |
| A5 | **Migración 21 de RLS de Costeo**: envolver `rol_actual()`, `tiene_rol(...)` y `auth.jwt()` en `(select …)`; `search_path` en `tiene_rol`; revocar `anon` en `rol_actual` y `registrar_bitacora` | Pruebas de permisos y MCP en verde. `v_resumen` bajo RLS ≤ 40 ms (hoy 103 ms) con el mismo resultado fila a fila | Medio (seguridad) | PGlite local + EXPLAIN antes y después en el entorno que Carlo autorice |
| A6 | **Ficha de producto:** filtrar `v_resumen` y `precio_canal_manual` por producto en la base; dejar de cargar todos los `perfiles` (solo los autores de la bitácora mostrada) | Misma ficha; menos filas y llamadas | Bajo | Local (filas y llamadas); tiempo real en producción requiere telemetría |
| A7 | **`todas()` en páginas de 1,000** (límite de PostgREST por defecto; **verificar `max_rows` del proyecto**) para no recalcular `v_resumen` dos veces | Mismas filas; la mitad de llamadas a la vista | Bajo | Local (conteo de llamadas) + `pg_stat_statements` |

### B. Requieren decisión de Carlo

| # | Decisión |
|---|---|
| B1 | ¿Qué representa `precio_lista`? (a) la lista de una tienda de referencia (hoy equivale a 532); (b) precio por tienda (modelo nuevo); (c) mantenerlo y solo mostrar diferencias |
| B2 | Las 7 diferencias de mayúsculas y espacios: ¿adoptar la forma exacta de la API (p. ej. «Pain au Chocolat»)? Sigue siendo nombre observado, no catálogo |
| B3 | Los 21 alias candidatos (Frappé ↔ Frap, Pumpkin Spice ↔ Pumpkin, Zoé Water…): ¿mismo producto? ¿Qué nombre es el vigente? |
| B4 | Los 5 duplicados probables en Costeo: ¿son el mismo producto? Nunca se borran ni recrean (CASCADE); a lo sumo se desactivan |
| B5 | Mapeo de tamaños por producto (Chica ↔ Regular, Grande ↔ Large); Cold Drip V60, Gelato Frappé y combos con vaso |
| B6 | Los 8 productos de la API sin receta (Pan de Muerto, Espresso Tonic…): ¿se costean? |
| B7 | Si se aprueban B2–B5: diseño de la tabla de correspondencias. **Ya se conocen las cardinalidades:** un nombre puede tener código y nulo; un código padre tiene un solo nombre en la ventana; el tamaño va en un custom; los precios dependen de tienda y canal |

### C. Bloqueados por falta de fuente o definición

| # | Qué falta |
|---|---|
| C1 | Identificar Generic: respuesta del proveedor o cruce `refundId` ↔ reporte de Rappi |
| C2 | Nombre vigente de catálogo: no hay endpoint conocido (preguntas 1–3 de 06) |
| C3 | Costos de insumos, subrecetas y rendimientos: sin fuente equivalente; se conservan |
| C4 | Paridad con el Excel: falta `datos/Modelo_Costeo_Corregido_2026.xlsx` |
| C5 | Rendimiento en producción (p50/p95, región, arranques en frío) y Runtime Cache: requieren acceso a Vercel |
| C6 | Advisors oficiales y región de Supabase: requieren el panel o la Management API |

## Optimizaciones: qué se verifica localmente y qué no

| Optimización | Verificable localmente | Requiere telemetría o acceso |
|---|---|---|
| A5 RLS initplan | Semántica y permisos (PGlite); EXPLAIN con datos reales en una copia o rama | Mejora para usuarios reales (Vercel y PostgREST) |
| A6 Ficha / A7 páginas | Filas, llamadas y bytes | Tiempo de pantalla en producción |
| Asistente bajo demanda (fase 1, ~106 KB gzip) | Tamaño del bundle | LCP/INP reales (Speed Insights) |
| Caché compartida para Sucursales | — | Necesita frecuencia de arranques en frío y tasa de aciertos (Vercel) |

## Riesgos para la fase 3

- **Migración de RLS (A5):**
  - Un error en las políticas abre o cierra datos.
  - Mitigación: pruebas de permisos existentes, revisión del diff de `pg_policies` antes y después, y aplicación solo con aprobación de la fase 4.
- **Ranking (A1):**
  - Si el proveedor reutiliza un nombre para dos productos distintos, la opción B los uniría cuando el código sea nulo.
  - Mitigación: no se observó en la ventana; la prueba lo cubre como caso conocido.
- **Precios (B1):** cualquier corrección masiva sin definir la lista cambia márgenes y alertas en Costeo.

**Checkpoint 2:** Carlo aprueba (total o parcialmente) los puntos A y responde los B. Nada de C se ejecuta sin una fuente nueva.
