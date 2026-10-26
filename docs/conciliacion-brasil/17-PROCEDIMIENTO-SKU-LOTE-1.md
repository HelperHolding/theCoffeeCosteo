# 17 · Procedimiento: migración 22 y lote 1 de códigos POS (57)

**Estado:** preparado por indicación de Carlo (2026-10-26). **No se aplica nada.** Requiere su aprobación expresa del proyecto, la ventana y el alcance.

## Qué incluye y qué no

| Incluye | No incluye |
|---|---|
| Migración `20261024000022_producto_codigo_pos.sql` (tabla `producto_codigo_pos`, sin datos) | Renombres (B), desactivaciones (C), alias (D), mapeos de tamaño (E) ni recetas nuevas (F) |
| Carga de los **57 códigos del lote 1** verificados por código, nombre, contexto, variante y tamaño (`15`, columna `estado = lote 1 (verificado)`) | Los 34 códigos pendientes (`16-codigos-pendientes.csv`) |
| Bitácora con origen `carga_masiva` | Cambios en Sucursales o Costeo que usen la tabla (otra entrega) |

## Estado de partida

| Dato | Valor |
|---|---|
| Rama | `feat/sku-enlace-pos` (`29bbe55`), local, sin PR. Creada sobre el PR #18 **antes** del merge. **Hay que actualizarla con `main`** (`2245e7f`), que ya incluye la 21 |
| Producción | Última migración `20261023000021`. La tabla `producto_codigo_pos` no existe |
| Integración GitHub ↔ Supabase | «Deploy to production» **activo** en `main`. Un merge con la 22 sin registrar la aplicaría sola |
| Pruebas | `tests/db/producto-codigo-pos.test.ts` 6/6; BD 127/127 (en la rama) |
| Dry-run previo | Sobre la copia restaurada de producción (respaldo del 2026-10-23): 57 insertados, 0 problemas; segunda corrida 0 insertados; un renombre detectado aborta todo |

## Pasos (cada uno con su verificación)

### 1. Preparación (sin tocar producción)

1. Actualizar `feat/sku-enlace-pos` con `main` y repetir pruebas de BD, typecheck y build.
2. **Re-verificar el lote 1 contra Costeo actual**, solo lectura: cada `receta_id` existe, es producto, está activa y conserva el nombre verificado. Si Carlo aprobó entretanto renombres (B) o desactivaciones (C), los códigos afectados salen del lote o se re-verifican.
3. **Cambio de código pendiente de aprobación:** hoy `cargar-enlaces.ts` **solo acepta bases locales**, a propósito. Para producción se propone una variante, revisable en el PR, que:
   - acepte el proyecto real solo con `--confirmo jpqkmnfjwzniptszjuli`;
   - haga dry-run por defecto;
   - verifique el proyecto en `DATABASE_URL` sin imprimirla.
4. Respaldo: un nuevo respaldo lógico con el procedimiento de la fase 4 (plan Free, sin PITR), con su fecha.

### 2. Migración 22 en producción (mismo patrón que la fase 4)

1. Capturar el estado: políticas, funciones y registro.
2. **Ensayo** en una transacción con ROLLBACK:
   - aplicar la 22;
   - verificar 7 políticas nuevas, las funciones `validar_producto_codigo_pos` y la bitácora, y las 145 políticas previas **sin cambios**.
3. **Aplicación:** transacción, verificación y COMMIT. **Registrar la versión `20261024000022`** en `supabase_migrations.schema_migrations` **antes** del merge.
4. Verificar:
   - la tabla existe y está vacía;
   - lectura bajo RLS de un usuario activo: 0 filas;
   - OAuth no escribe.

### 3. Carga del lote 1

1. **Dry-run en producción** (transacción con ROLLBACK): 57 insertables, 0 problemas, 57 registros de bitácora `carga_masiva`.
2. **Carga:** COMMIT.
3. **Segunda corrida** (idempotencia): 0 insertados, 57 sin cambio.

### 4. Merge de la rama

- PR de `feat/sku-enlace-pos`. Al hacer merge, la integración ve la 22 registrada y no la repite. Verificar después, como en la fase 5: registro sin entradas nuevas y estado idéntico.

## Criterios de éxito

- 57 filas, cada una con su receta verificada.
- Las 145 políticas previas, idénticas.
- Sin cambios en `recetas`, precios ni costos.
- Lectura para perfiles activos; escritura solo para operaciones y admin; OAuth solo lectura.

## Reversión (atómica, en este orden)

1. Si solo falla la carga: `delete from producto_codigo_pos where codigo = any(<57 códigos>)` en una transacción. Queda en la bitácora.
2. Si hay que retirar la 22, en una sola transacción:
   - `drop table producto_codigo_pos`;
   - `drop function validar_producto_codigo_pos`;
   - borrar el registro de la versión `20261024000022`.

   Si ya se hizo merge, también quitar el archivo de la migración de `main` en el mismo cambio, para que la integración no la vuelva a aplicar.

## Aprobaciones que se solicitarán (cuando Carlo lo indique)

1. Actualizar la rama y el cambio del script de carga para producción (paso 1.3), vía PR.
2. Respaldo, ensayo y aplicación de la 22 (paso 2).
3. Dry-run y carga del lote 1 (paso 3).
4. Merge de la rama (paso 4).
