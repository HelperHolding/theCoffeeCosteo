# 03 · Plan por fases y backlog priorizado

**Estado:** fase 1 entregada el 2026-10-23 sobre `b7416e1`. **Checkpoint 1: espera la aprobación de Carlo.** Nada de lo siguiente está autorizado todavía.

## Riesgos concretos detectados

| # | Riesgo | Evidencia | Impacto |
|---|---|---|---|
| R1 | Costeo no tiene ninguna llave hacia los productos de Brasil | Ninguna columna de código o SKU; migración por nombre (01 §3) | Todo cotejo empieza en cero. Relacionar por nombre provocaría errores silenciosos |
| R2 | El ranking de Sucursales agrupa solo por `defaultCode` y rotula con el nombre más reciente | `metricas.ts:123-136`; código `TRADICAPP` reutilizado | Productos distintos podrían fusionarse bajo una etiqueta («generic» u otra) |
| R3 | Los tamaños tienen semánticas distintas (Chica/Grande/Único frente a custom «Regular/Large – ml») | 01 §3 | Riesgo de cruzar precios de tamaños distintos |
| R4 | El precio cobrado incluye descuentos y difiere por canal (Rappi más caro; combos cambian por fecha) | docs/02 y docs/11 | Tomar «el último» o «el máximo» como precio oficial sería inventar |
| R5 | Sin telemetría de producción ni acceso a la BD | 01 §1 | Cualquier optimización hoy carece de un antes/después real |
| R6 | Prueba de UI dependiente del reloj | `sucursales-ui.test.tsx:176` | Falla cada día y oculta regresiones reales |
| R7 | Productos de 28 días y Tendencias de 12 semanas en frío, cerca del presupuesto de 25 s | 12.3 s medidos; 28 días sin medir | Espera larga o lectura parcial con varios usuarios |
| R8 | `todos` incluye pedidos de origen `desconocido` sin rotularlos | `metricas.ts:19-21` | Diferencia invisible entre «todos» y la suma de los tres orígenes si aparecen nulos |

## Backlog priorizado

**Escala:** impacto y esfuerzo A/M/B (alto, medio, bajo).

| Pri | Ítem | Impacto | Evidencia | Esfuerzo | Riesgo | Depende de | Fase |
|---|---|---|---|---|---|---|---|
| P0 | Acceso de solo lectura para la fase 2: Advisors y consultas `SELECT` en Supabase; una ventana de pedidos GET acotada por sucursal | A | R5 | B | B | Carlo | 2 |
| P0 | Inventario Costeo (productos, tamaños, precios, canales) y extracción de `defaultCode`/`productName`/customs/precios de **ventanas cerradas** de 612, 583 y 532 | A | R1, R4 | M | B (solo lectura) | P0 acceso | 2 |
| P0 | Diagnóstico de «generic»: reproducir la vista (sucursal, fechas, origen), listar códigos con varios `productName` y separar proveedor de fallback local | A | R2 | B | B | P0 acceso | 2 |
| P1 | Matriz de discrepancias con tres fuentes (Costeo, API, recetario) y estados exacta, candidata, ambigua o sin coincidencia | A | R1, R3 | M | B | Inventario | 2 |
| P1 | Arreglar la prueba dependiente del reloj (fijar la fecha del sistema en la prueba) | M | R6 | B | B | — | 3 |
| P1 | Ranking: agrupar por (`defaultCode`, `productName`) o mostrar «varios nombres» cuando un código tenga más de uno, conservando el total | A | R2 | B | M (cambia filas visibles) | Diagnóstico generic | 3 |
| P1 | Tabla de correspondencias + `conciliacion_ejecuciones` + `origen = 'conciliacion_brasil'` (D4, D5) | A | R1 | M | M (migración) | Matriz aprobada | 3 |
| P2 | RLS de Costeo con `(select rol_actual())` (D7) | B–M | Lint 0003, sin medir | B | B | Advisors | 3 |
| P2 | Ficha de producto: filtrar `v_resumen`, `precio_canal_manual` y perfiles por producto en la BD, en vez de cargarlos completos | M | `ficha.tsx:26-35` | B | B | Medición antes/después | 3 |
| P2 | Asistente bajo demanda en `marco.tsx` (~106 KB gzip menos por página) | M | §6 del doc 01 | B | B | Analizador de bundle | 3 |
| P2 | Rotular el origen `desconocido` si aparece (sin cambiar el total) | B | R8 | B | B | — | 3 |
| P3 | `Server-Timing` y Vercel Observability para las rutas de Sucursales; luego decidir sobre Runtime Cache (D3) | M | R7 | B | B | Plan de Vercel | 3 |
| P3 | Unificar los duplicados menores: regex de tamaño, catálogo de pagos, `productos()` doble en vivo; actualizar comentarios y docs 07/08 | B | 01 §4 | B | B | — | 3 |
| P3 | Búsqueda sin acentos en Catálogo, Resumen e Insumos | B | 01 §3 | B | B | — | 3 |

**Cómo se ejecuta cada optimización (P2/P3).** Cada una sigue el mismo protocolo:
1. Problema observado.
2. Medición antes: tiempo de la ruta en local y en el preview, filas y bytes.
3. Cambio mínimo.
4. Misma medición después, en las mismas condiciones.
5. Criterio de éxito propuesto: menos filas transferidas y un tiempo igual o mejor, sin cambiar los resultados (pruebas existentes en verde).
6. Reversión: revertir el commit; sin migraciones irreversibles.

Los presupuestos de rendimiento quedan como propuesta, no como garantía.

## Propuesta de orden para módulos futuros (resumen)

| Pieza | Ubicación |
|---|---|
| Dominio y acceso a datos | `lib/<modulo>/` con `server-only`: consultas con columnas explícitas, autorización y DTO. Única capa que lee `process.env` |
| Adaptadores externos | `lib/<modulo>/proveedor.ts` o `lib/integraciones/<proveedor>/`: cliente, esquema zod del contrato observado y normalización. Los scripts importan el mismo adaptador, salvo los de conciliación independiente |
| Contratos navegador ↔ servidor | `lib/<modulo>/contratos.ts`, como ya hace Sucursales |
| UI | `components/<modulo>/` |
| Rutas | `app/(<modulo>)/…`, `app/api/<modulo>/…` |
| Registro, sesión y permisos | `lib/portal/modulos.ts`, `lib/supabase/sesion.ts`, `perfil_modulos`. No duplicar la sesión por módulo |
| Pruebas | `tests/db` (PGlite: esquema, RLS, vistas) y `tests/portal` (dominio y UI con fixtures). Ninguna prueba debe depender del reloj real ni de la red |
| Migraciones | `supabase/migrations/AAAAMMDD0000NN_<tema>.sql`, numeración continua (la siguiente es la 21). Una migración por tema. Revisión con Advisors antes del merge |
| Decisiones | Una tabla breve en el doc de resultado de cada fase, como docs/sucursales/06 |

## Fase 2 propuesta (alcance exacto a aprobar)

**Solo lectura.** Sin escrituras en Supabase, sin migraciones, sin cambios de código funcional y sin push de cambios de producto.

1. **Accesos.** Carlo elige una opción:
   - (a) ejecutar consultas `SELECT` que yo prepare y compartirme el resultado, o
   - (b) habilitar una conexión de solo lectura para la sesión.

   Más una de dos:
   - lectura de Advisors (Seguridad y Rendimiento) de Supabase;
   - región del proyecto Supabase y plan y región de Vercel.
2. **Capacidades de la API.** Revisar la documentación del proveedor disponible para Carlo y confirmar si existe un endpoint de catálogo. No se prueban rutas inventadas ni se barren IDs.
3. **Extracción GET acotada.** Las 3 sucursales habilitadas, 4 semanas cerradas cada una, con el adaptador actual o `explorar-api.ts`. Respuestas crudas fuera del repo (`%TEMP%`). Unas 25–30 GET en total.
4. **Inventario Costeo** (`recetas`, `producto_tamanos`, `precio_canal_manual`, `canales`, `tamanos`) solo con columnas necesarias.
5. **Matriz de discrepancias**, con:
   - PK local, código y contexto externo, campo, valor actual y valor observado;
   - evidencia (sucursal, ventana, número de pedidos, con o sin descuento);
   - confianza, impacto en dependencias y decisión pendiente.

   El recetario va en una columna aparte.
6. **Informe de «generic»:** recorrido completo del dato, peso y cobertura, hipótesis confirmada o descartada, y prueba de conservación de totales.
7. **Preguntas al proveedor:** catálogo, significado de `defaultCode` vacío o genérico, precio vigente por canal y tamaño, zona horaria, Rappi y `netAmout`.

**Entregables:** `04-MATRIZ-DISCREPANCIAS.md` (más CSV sin datos personales), `05-GENERIC.md` y `06-PREGUNTAS-PROVEEDOR.md`. **Checkpoint 2.**

## Fases siguientes (sin cambios respecto al plan maestro de Carlo)

- **Fase 3:** implementación de lo aprobado, migraciones versionadas, script de conciliación en dry-run, pruebas y medición antes/después. Checkpoint 3.
- **Fase 4:** aplicación aprobada, con backup confirmado, valores previos capturados y rollback propio. Checkpoint 4.
- **Fase 5:** publicación autorizada y estándar de módulos.
