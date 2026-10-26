# 17 · Procedimiento: migración 22 y lote 1 de códigos POS (57)

**Estado al 2026-10-26:** preparado y probado en local; **nada se aplicó ni se cargó en producción.**
- La rama `feat/sku-enlace-pos` está actualizada con `main` (`ba69a00`) y va en un PR **solo para revisión**.
- **NO HACER MERGE del PR antes de aplicar y registrar la 22:** con «Deploy to production» activo, el merge aplicaría la migración sola.
- Cada paso remoto de abajo requiere aprobación expresa de Carlo.

## Qué incluye y qué no

| Incluye | No incluye |
|---|---|
| Migración `20261024000022_producto_codigo_pos.sql` (tabla vacía, sin datos) | Renombres, desactivaciones (C), alias (D), equivalencias de tamaño (E) ni recetas nuevas (F) |
| Lote fijado `17-lote-1.csv`: 57 códigos con su `receta_id`, el nombre esperado de la receta, el nombre observado y la evidencia | Los 6 códigos de B1–B6 (3FOOD3, BR3, CROSTUAPP, BRICE, 1CBWB, 3CBBE). Se revalidaron, pero son un **lote adicional propuesto**, con su propia aprobación |
| Scripts de ensayo, aplicación y reversión, con sus pruebas | Los demás pendientes de `16-codigos-pendientes.csv`, GENERIC, ambiguos y duplicados |
| | Cambios en nombres, costos, precios, cantidades, estado activo o ventas históricas |
| | Que Sucursales use los enlaces: será otra entrega. La tabla no reinterpreta ninguna cifra |

## Modelo (`producto_codigo_pos`)

| Elemento | Definición |
|---|---|
| Columnas | `id`, `codigo` (único), `receta_id`, `nombre_observado`, `evidencia`, `carga_id` (null si la fila se creó desde el portal), `creado_en`, `creado_por` |
| Integridad | CHECK: sin espacios, no vacío, no `GENERIC` en ninguna capitalización. FK a `recetas` **on delete restrict**, con índice. Índice parcial por `carga_id` |
| Trigger `validar_producto_codigo_pos` | Exige que la receta sea un **producto**, no una sub-receta. Al dar de alta, fija `creado_en` y toma `creado_por` de la sesión (`auth.uid()`). En los cambios, conserva `creado_en`, `creado_por` y `carga_id`: la autoría no se puede falsear |
| Permisos de la función del trigger | Sin EXECUTE para public, anon ni authenticated. Es SECURITY INVOKER, con `search_path = public, pg_temp` |
| RLS | 7 políticas, todas para `authenticated` y con el patrón `(select …)`: lectura para cualquier perfil activo; alta, cambio y baja para operaciones y admin; restrictivas que impiden escribir con OAuth (MCP). **No cambia ninguna política existente** |
| Grants | anon sin privilegios; authenticated con SELECT, INSERT, UPDATE y DELETE, sin TRUNCATE, REFERENCES ni TRIGGER |

### Ámbito de la unicidad del código

Para los 57 códigos se revisaron los datos crudos de la auditoría: sucursales 532, 583 y 612, del 2026-09-21 al 2026-10-18, 5,324 pedidos.

- Cada código llega con **un solo nombre**, y ningún nombre llega con otro código.
- Ninguna receta tiene dos códigos en el lote.
- **Cobertura por sucursal:**
  - 42 códigos aparecen en las tres sucursales;
  - 4 en 583 y 612;
  - 2 en 532 y 612;
  - los otros 9, en una sola sucursal (2 en 532, 3 en 583 y 4 en 612).
- **Única observación:** `MQ1` (Grilled Ham & Cheese Sandwich) también llega 5 veces como **componente sin importe** del combo MISICEDAPP en 532.

  Es el mismo producto, así que no hay conflicto de identidad. Consta en su evidencia, y un uso futuro en Sucursales no debe contarlo como venta.
- **No se afirma que la identidad del código sea universal para el proveedor.** La restricción `unique` es conservadora: si apareciera un código reutilizado, la carga fallaría y se decidiría ese caso.

### Bitácora

`registrar_bitacora` no tiene esta tabla en su mapa de recetas. Por cada alta o baja registra:
- `registro_id` = id del enlace;
- `receta_id` = **null**;
- `campo = '*'`, con la fila completa (incluida la receta) en `valor_nuevo` o `valor_anterior`.

En los cambios registra una fila por campo. Por eso **no hay trazabilidad por la columna `receta_id`**: la receta se lee en el JSON de la fila. No se modificó la función compartida. El origen es `carga_masiva` y el usuario sale del perfil de `--usuario`.

## Scripts

- **Destino (`destino.ts`):**
  - **remoto:** solo el pooler `aws-N-<región>.pooler.supabase.com` con usuario `postgres.jpqkmnfjwzniptszjuli`, o `db.jpqkmnfjwzniptszjuli.supabase.co`, validados con el parser de URL;
  - **local:** solo `localhost`, `127.0.0.1` o `[::1]`, y la copia local no equivale a autorización remota;
  - la URL nunca se imprime ni va a los informes;
  - se comprobó que la `DATABASE_URL` real pasa la validación (sin imprimirla).
- **Migración (`migracion-22.ts` y `migracion-22-aplicar.ts`).** Modos: ensayo (ROLLBACK, por defecto), `--aplicar` y `--revertir`; los dos últimos con `--confirmo jpqkmnfjwzniptszjuli`.
  - **Partida:** la última versión registrada es la 21, y no existen ni la tabla ni su función.
  - **Captura en vivo:** políticas, funciones (cuerpo, configuración, dueño y ACL) y ACL/RLS de cada tabla. No reutiliza capturas ni conteos de la fase 4.
  - **Verificación:** todo lo previo queda idéntico; lo nuevo es exactamente lo esperado, incluida una **huella md5 de la definición de las 7 políticas**; la tabla queda vacía. La versión se registra en la misma transacción.
- **Reversión del esquema (`rollback-022.sql`).** Atómica. Aborta si:
  - la versión no está registrada;
  - la tabla tiene filas (no sirve para ocultar una carga);
  - hay llaves foráneas o vistas que dependan de la tabla;
  - la huella de las políticas cambió.

  No hay DROP automático por un fallo de carga.
- **Enlaces (`enlaces-pos.ts` y `enlaces-pos-aplicar.ts`).** Modos: ensayo (ROLLBACK, por defecto), `--aplicar` y `--revertir --carga <id>`. **`--usuario` es obligatorio en todos los modos**, incluido el ensayo: tiene que ser un perfil activo de operaciones o admin. Aplicar y revertir exigen `--confirmo`. Una ejecución:
  1. **Lote fijado:** valida cabecera, tipos, códigos y receta_id sin repetir, 57 filas y el sha256 `5c36c6ce…f357`. Cualquier variación detiene todo para revisarla; no se ajusta el número.
  2. **Bloqueos:** abre una transacción REPEATABLE READ con lock 5 s, sentencia 15 s y tiempo inactivo 60 s. Bloquea la tabla (SHARE ROW EXCLUSIVE) y las recetas (FOR SHARE).
  3. **Recetas:** cada una debe existir, ser producto, estar activa y tener el nombre esperado.
  4. **Idempotencia:**
     - código sin enlace → alta con `carga_id`;
     - enlace idéntico → «sin cambio»;
     - otra receta, otro nombre observado u otra evidencia → **conflicto**.

     Un solo problema aborta la carga completa.
  5. **Bitácora propia:** solo cuenta los registros de esta transacción (`fecha = now()`), que deben ser exactamente uno por alta. Les agrega una nota con el `carga_id`. La actividad de otras sesiones solo se informa.
  6. **Sin cambios comerciales:** compara huellas de recetas, `producto_tamanos`, `precio_canal_manual`, líneas, cantidades e insumos antes y después; deben ser iguales.
  7. **Informe:** dice si hubo COMMIT o ROLLBACK, e incluye los ids propios y el conteo antes y después. Se guarda en `17-informes/`, sin URL ni credenciales. La salida es distinta de cero si hay error.
- **Reversión de una carga.**
  - Borra **solo** las filas con ese `carga_id` que sigan exactamente como se cargaron. Si alguna cambió, aborta sin borrar nada.
  - No toca los enlaces de otro origen ni borra por lista de códigos.
  - Deja su bitácora.
- **Cierre de la transacción (`cierre.ts`), usado por la migración y por los enlaces.** Antes de COMMIT comprueba que la transacción no esté abortada; Postgres respondería ROLLBACK sin error. Si COMMIT o ROLLBACK fallan, el informe dice `transaccion: fallida` con el error y la salida es distinta de cero; nunca afirma éxito. Tras un COMMIT fallido el estado es incierto y se verifica con una conexión nueva.
- `cargar-enlaces.ts`, la versión anterior que solo funcionaba en local, se retiró; la reemplaza `enlaces-pos`.

## Pruebas (2026-10-26)

| Prueba | Resultado |
|---|---|
| `tests/db/producto-codigo-pos.test.ts` | 9/9: unicidad, varios códigos por receta, GENERIC (también en minúsculas), vacío, espacios, sub-recetas, `restrict`, roles, OAuth solo lectura, **anon sin acceso**, función del trigger sin EXECUTE, grants exactos, autoría no falsificable, **bitácora con receta_id null**, patrón initPlan |
| `tests/db/migracion-22.test.ts` | 8/8: ensayo sin efectos, aplicar, aplicar dos veces, reversión rechazada con filas o con políticas cambiadas (por el script y por el SQL directo), reversión exacta al esquema previo, cambio colateral detectado |
| `tests/db/enlaces-pos.test.ts` | 14/14 (detalle abajo) |
| `tests/db/destino.test.ts` | 3/3: URLs aceptadas y rechazadas, incluidos hosts que solo contienen el identificador del proyecto |
| `tests/db/cierre.test.ts` | 5/5: COMMIT que responde ROLLBACK, transacción abortada, fallo de red al confirmar o al deshacer; migración y enlaces con COMMIT o ROLLBACK fallidos → `fallida`, sin filas ni registro. Con el código anterior fallan 3 |
| BD completa | 170/170, sin regresiones en fase 4 ni MCP. `tsc` sin errores. `npm run build` OK |
| Suite completa | 398 pasan. `tests/migracion/paridad.test.ts` no corre porque falta el Excel local `datos/Modelo_Costeo_Corregido_2026.xlsx` (ajeno a este cambio) |

Las 14 pruebas de `enlaces-pos` cubren:
- **el lote:** el real (57 y huella), su alteración, uno con menos filas, códigos repetidos, GENERIC y uuid inválido;
- **el perfil:** falta, inactivo, sin permiso o inexistente;
- **el ensayo:** no deja nada;
- **recetas:** renombrada, inactiva o sub-receta, sin altas parciales;
- **la bitácora:** actividad ajena, un registro propio extra y un cambio comercial;
- **la carga:** exacta, repetición y conflictos;
- **la reversión:** solo de la carga indicada y bloqueada si una fila cambió.

### Ensayo sobre una copia local aislada

Se usó el respaldo de producción del **2026-10-26 16:22 UTC**, restaurado en la base `sku22` del clúster local (Postgres 17.11, solo localhost).

**En qué difiere de producción:**
- se tomó **antes** de los renombres B1–B6, que no afectan al lote 1;
- `supabase_vault` no está disponible en local (8 errores de restauración, solo de vault);
- no tiene perfiles de compras.

| Paso | Resultado |
|---|---|
| Partida | 21 migraciones, 145 políticas, 160 recetas, la tabla 22 no existe |
| Ensayo de la 22 | Objetos exactamente los esperados, 0 diferencias en lo previo → ROLLBACK |
| Ensayo de enlaces sin la 22 | Se detiene: «migración 22 no aplicada» |
| Aplicar la 22 | COMMIT; 0 diferencias en lo previo |
| Ensayo de enlaces (perfil de Carlo) | 57 altas, 0 problemas, 57 registros propios en la bitácora, 0 ajenos, sin cambios comerciales → ROLLBACK |
| Carga local + repetición | 57 altas (COMMIT); luego **57 sin cambio, 0 registros en la bitácora** |
| RLS con roles reales | anon: permission denied. OAuth: lee 57; su DELETE borra 0 filas |
| Reversión de la 22 con filas | Rechazada («la tabla tiene 57 filas») |
| Receta renombrada en la copia | Una ejecución nueva se detiene: «Americano (renombrada)», no «Americano» |
| Reversión de la carga | 57 bajas, 57 registros de bitácora, sin cambios comerciales |
| Reversión de la 22 (ya vacía) | COMMIT; 0 diferencias. Vuelve a 21 migraciones y 145 políticas; quedan los 114 registros de bitácora (57 altas y 57 bajas) |

Los informes están en `17-informes/`. Esas corridas usaron la versión del script anterior a un ajuste menor: las huellas comerciales pasaron de leerse en paralelo a leerse en secuencia, sin cambio de lógica.

### Revalidación contra producción (solo lectura, 2026-10-26)

- **Los 57 del lote:** cada `receta_id` existe, es producto, está activa y tiene el nombre esperado, con **0 problemas**; no hay variantes de mayúsculas.
- **Registro de migraciones:** la última sigue siendo `20261023000021`. **La 22 está libre:** no hay registro, tabla ni función.
- **Políticas:** producción tiene hoy 145, las mismas que PGlite con 01–21.

## Pasos siguientes (cada uno con aprobación expresa; ninguno se ejecutó)

1. **Revisión del PR.** No hacer merge.
2. **Respaldo y captura previa:**
   - respaldo lógico recuperable nuevo con `respaldo-logico.ts`, verificado con `pg_restore --list`, sha256 y contenido;
   - captura de esquema, permisos y registro.
3. **Ensayo remoto de la 22:** `npx tsx scripts/conciliacion/migracion-22-aplicar.ts` (ROLLBACK). Revisar el informe.
4. **Aplicar la 22:** `… --aplicar --confirmo jpqkmnfjwzniptszjuli`. La versión queda registrada en la misma transacción.

   Verificar después en solo lectura:
   - tabla vacía, 7 políticas con su huella;
   - anon sin acceso, lectura de un perfil activo, OAuth sin escritura;
   - las 145 políticas previas, idénticas.
5. **Ensayo remoto de los 57:** `npx tsx scripts/conciliacion/enlaces-pos-aplicar.ts --usuario <uuid>` (ROLLBACK). Esperado: 57 altas, 0 problemas, 57 registros propios en la bitácora y sin cambios comerciales.
6. **Carga:** `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>`. Anotar el `carga_id`.
7. **Comprobar:**
   - un segundo ensayo da 57 «sin cambio» y 0 registros en la bitácora;
   - recetas, precios y costos sin cambios.
8. **Merge y despliegue**, solo con autorización, después del paso 4.

   La integración verá la 22 registrada y no la repetirá. Después, verificar como en la fase 5: registro sin entradas nuevas y estado idéntico.

**Reversión:**
- **De la carga:** `--revertir --carga <carga_id>`, con sus propias verificaciones.
- **Del esquema:** `migracion-22-aplicar.ts --revertir --confirmo …`, solo con la tabla vacía. Si ya hubo merge, también hay que quitar el archivo de la 22 de `main` en el mismo cambio, para que la integración no la vuelva a aplicar.
