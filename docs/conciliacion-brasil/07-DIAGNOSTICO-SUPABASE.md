# 07 · Diagnóstico de Supabase

**Fase 2 — solo lectura.** Fecha: 2026-10-23.

## Proyecto y acceso

| Dato | Valor |
|---|---|
| Proyecto | **`jpqkmnfjwzniptszjuli`**. Antes de conectar se verificó contra el usuario y host de `DATABASE_URL`, leída con el cargador existente y nunca impresa |
| Conexión | Cadena existente de `.env.local` (la misma que usa `npm run migracion`). No se crearon usuarios, credenciales ni conexiones nuevas |
| Protección | Cada lectura corrió en `BEGIN READ ONLY` (verificado: `transaction_read_only = on`), con `statement_timeout 15 s` y `ROLLBACK` al final |
| Rol | `postgres` (privilegiado). **Ignora RLS**: el inventario es completo, pero estas lecturas no demuestran acceso ni rendimiento del usuario final. Una medición se hizo además como `authenticated` (ver más abajo) |
| Versión | PostgreSQL 17.11 |
| Región | **No verificable:** el host de la cadena no la expone y no hay acceso al panel ni a la Management API. No se infiere la región de las funciones de Vercel |
| Migraciones aplicadas | 20 de 20 (`20261005000001` … `20261022000020`), idénticas a `supabase/migrations`. Sin desviaciones |
| Extensiones | `pg_stat_statements`, `pgcrypto`, `plpgsql`, `supabase_vault`, `uuid-ossp`. No se habilitó ninguna |

**Utilidades** (solo lectura, en `scripts/conciliacion/`, sin commit): `db-lectura.ts`, `diagnostico-db.ts`, `esquema-db.ts`, `inventario-costeo.ts`, `muestra-recetas.ts` y `explain-resumen.ts`.

## Esquema y datos frente a migraciones

- **34 relaciones en `public`**, todas con RLS activa.
- Conteos: 154 productos y 6 subrecetas (todos activos), 164 insumos (46 gr, 25 ml, 93 pza), 215 producto-tamaño (61 Chica, 61 Grande, 93 Único), 890 líneas y 1,199 cantidades.
  - **79 producto-tamaño sin `precio_lista`.**
- 83 precios manuales, todos de Rappi.
- Canales:
  - Mostrador: sin comisión.
  - Rappi: 18 %, envase 6.14, tope 25 %.
  - App propia: comisión 0, **`comision_confirmada = false`**.
- `bitacora`: 323 filas.
  - Migración: 179.
  - Carga masiva: 112 (precio manual y producto-tamaño).
  - Portal: 32 (accesos, 2 precios manuales y 1 canal).
- Unicidad confirmada: `recetas.nombre` es único global (productos y subrecetas). No hay ninguna columna de código externo.

## Advisors

**Los Advisors oficiales no se pudieron leer:** no hay acceso al panel ni a la Management API en esta sesión.

En su lugar se ejecutaron **equivalentes SQL** de algunos lints sobre el catálogo de Postgres. No son el Advisor oficial y pueden diferir.

| Lint (equivalente) | Hallazgo | Alcance | Riesgo |
|---|---|---|---|
| 0003 `auth_rls_initplan` | **89 políticas** sin `(select …)` en 15 tablas: todas las de Costeo, `perfiles`, `bitacora` y la restrictiva de `perfil_sucursales`. Las del CRM ya están envueltas (migración 18) | Rendimiento | **Medido** (ver abajo) |
| 0011 `function_search_path_mutable` | 11 funciones sin `search_path`: `tiene_rol` y 10 funciones de trigger (`validar_*`, `vigilar_*`, `limpiar_*`, `tocar_updated_at`, `bloquear_edicion_receta`, `antes_de_actualizar_receta`) | Seguridad (endurecimiento) | Bajo: no son SECURITY DEFINER |
| 0028/0029 SECURITY DEFINER ejecutable | `rol_actual()` y `registrar_bitacora()` son ejecutables por **`anon`**. Para `authenticated`: `rol_actual`, `crm_nivel`, `reservar_consulta_chat` y `registrar_bitacora` | Seguridad | Bajo–medio. `rol_actual()` devuelve null sin sesión; `registrar_bitacora` es de trigger y no se puede invocar útilmente por RPC. Conviene revocar `anon` |
| 0001 FK sin índice | 8: `insumos.proveedor_id`, `insumos.categoria_id`, `recetas.categoria_id`, `producto_tamanos.tamano_id`, `linea_cantidades.tamano_id`, `precio_canal_manual.canal_id`, `crm_tiendas.etapa_id_embudo` y `crm_prospectos.etapa_id_embudo` | Rendimiento | Bajo: los catálogos son de 3 a 23 filas. **No se recomienda indexar** hasta que una medición lo justifique |
| 0006 políticas permisivas múltiples | 0 | — | — |
| 0013 RLS desactivada | 0 | — | — |

## Rendimiento

### `pg_stat_statements`

Rol `authenticated`, acumulado desde el 2026-10-05; incluye todo uso real del portal.

| Consulta (vía PostgREST) | Llamadas | Media | Máx. | Total |
|---|---|---|---|---|
| `v_resumen` completo (2 variantes de orden) | 617 | **170–183 ms** | 673 ms | 109 s |
| `v_alerta_producto_canal` completo | 146 | **206 ms** | 684 ms | 30 s |
| `v_costo_producto` completo | 51 | 173 ms | 524 ms | 9 s |
| `linea_cantidades` (`select *`) | 249 | 44 ms | 159 ms | 11 s |
| `receta_lineas` (`select *`) | 166 | 43 ms | 153 ms | 7 s |
| `recetas` (`select *`, búsqueda global del layout) | 244 | 19 ms | 100 ms | 4.5 s |

### EXPLAIN ANALYZE

Una sola ejecución de cada lectura, en transacción de solo lectura.

| Lectura | Sin RLS (`postgres`) | **Con RLS** (`authenticated`, usuario admin activo) |
|---|---|---|
| `v_resumen` completo (645 filas) | 20.9 ms · 996 buffers | **102.8 ms · 8,763 buffers** |
| `v_resumen` de un producto (6 filas) | 2.0 ms · 314 buffers | 16.4 ms · 1,490 buffers |
| `v_alerta_producto_canal` (462 filas) | 16 ms | **101.4 ms · 8,708 buffers** |
| `recetas` (160 filas) | — | 3.2 ms |

**Lectura de la evidencia:**

1. **RLS multiplica por 5 el tiempo y por 9 los buffers de las vistas de cálculo.**
   - Las vistas son `security_invoker`, así que cada tabla base aplica su política `lectura`, que llama a `rol_actual()` por fila.
   - El planificador además estima 241,500 filas para un resultado de 645.
2. **`todas()` pide `v_resumen` en páginas de 500.** Como hay 645 filas, cada carga hace 2 llamadas y **cada una recalcula la vista completa**. Por eso la media del panel (~176 ms por llamada) se paga dos veces por pantalla.
3. **Filtrar por producto sí reduce el trabajo** (102.8 → 16.4 ms). Esto respalda que la ficha de producto filtre en la base en vez de cargar la vista completa.
4. **Lo que sigue sin medir:**
   - la parte del tiempo que corresponde a PostgREST, la red o Vercel;
   - percentiles de producción;
   - el efecto real del cambio de políticas (se mide en la fase 3, antes y después).

### Análisis previo de D7 (no aplicado)

| Función / expresión | Volatilidad | ¿Depende de la fila? | ¿Se puede envolver en `(select …)` sin cambiar la semántica? |
|---|---|---|---|
| `rol_actual()` | STABLE, SECURITY DEFINER, sin argumentos, `search_path` fijo | No: solo depende de `auth.uid()` | Sí: el valor es constante dentro de la sentencia |
| `tiene_rol(variadic text[])` | STABLE, sin `search_path` | No: los argumentos son literales de la política | Sí |
| `auth.jwt() ->> 'client_id'` (restrictivas OAuth) | STABLE | No | Sí |

**Propuesta para fase 3:**
- Una migración que reemplace las 89 expresiones por `(select …)`, siguiendo la migración 18 del CRM.
- Fijar `search_path` en `tiene_rol`.
- Revocar `execute` a `anon` en `rol_actual` y `registrar_bitacora`.

**Validación:**
- `tests/db/permisos.test.ts` y `mcp-lectura.test.ts` en PGlite deben seguir en verde.
- Repetir este EXPLAIN como `authenticated`.
- **Criterio de éxito propuesto:** `v_resumen` completo bajo RLS ≤ 40 ms con el mismo resultado fila a fila.

## Pendientes independientes

Ninguno bloquea la fase 2.

- Advisors oficiales (panel o Management API) y región del proyecto.
- Vercel: región de funciones, plan, logs y p50/p95. **No hay acceso.**
