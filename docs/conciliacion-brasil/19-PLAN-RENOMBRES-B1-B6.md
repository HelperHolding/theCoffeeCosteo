# 19 · Plan: renombre de recetas B1–B6

**Estado:** preparado por indicación de Carlo (2026-10-26). **No se ejecutó en producción.** El PR solo publica el script para revisión. Su merge **no** autoriza el ensayo ni la aplicación en producción: cada paso pide aprobación expresa.

## Alcance: seis cambios exactos

El script solo cambia `recetas.nombre` de estos 6 productos. No toca:
- precios, tamaños, líneas, costos ni el estado activo;
- recetas de otras decisiones;
- B7, que se queda igual.

| Decisión | `receta_id` | Nombre actual | Nombre nuevo | Código POS |
|---|---|---|---|---|
| B1 | `26a2fa5e-d96e-4d4d-afa4-2249bcc0eee5` | Pain Au Chocolat | Pain au Chocolat | 3FOOD3 |
| B2 | `ff0a88ca-d7c0-4d73-84a3-125815f9274e` | Grilled Ham Cheese And Tomato Sandwich | Grilled Ham Cheese and Tomato Sandwich | BR3 |
| B3 | `4ac9187c-fdaf-4678-8e91-7ead2d596c9b` | Croissant Filled With Cheese and Ham | Croissant filled with cheese and ham | CROSTUAPP |
| B4 | `2c8f400b-525f-4c30-8d64-f18be8b9334c` | Brownie With Ice Cream | Brownie with ice cream | BRICE |
| B5 | `5ce9b244-40e2-4153-92b8-7c5dc38968d4` | White Bag 250g | White bag 250g | 1CBWB |
| B6 | `d22e139c-c4d7-49b7-b8e6-9b13b40a3519` | Black Edition 250g | Black edition 250g | 3CBBE |

- La fuente de la lista es `19-renombres-b1-b6.csv`. El script solo acepta esa lista y rechaza filas repetidas, vacías o sin cambio.
- **Comprobación previa de nombres (2026-10-26, solo lectura, producción):** las 6 recetas existen, están activas y ningún nombre nuevo choca con otra receta.

### B4 y C3

B4 solo cambia el nombre de «Brownie With Ice Cream». La decisión C3 sobre el par «Brownie com sorvete» / «Brownie With Ice Cream» sigue abierta (`16` y pregunta O2 de `18`).

**Este plan no autoriza desactivar, fusionar ni reasignar ningún producto.** Tampoco cambia «Brownie com sorvete».

## Script

- `scripts/conciliacion/renombres-b.ts`: la lógica.
- `scripts/conciliacion/renombres-b-aplicar.ts`: la línea de comandos.

| Modo | Comando | Resultado |
|---|---|---|
| Ensayo (predeterminado) | `npx tsx scripts/conciliacion/renombres-b-aplicar.ts --usuario <uuid>` | Hace los cambios y la bitácora, los verifica y termina en **ROLLBACK** |
| Ensayo de una receta | `… --solo B4 --usuario <uuid>` (o `--solo B1,B5`) | Igual, solo para esas recetas |
| Aplicar | `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>` | COMMIT solo si todas las recetas pasan |
| Revertir | `… --revertir --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>` | La misma lista en sentido contrario |
| Copia local | `… --local postgres://…@localhost:…/…` | Contra un respaldo restaurado; no acepta otros hosts |

### Autoría obligatoria

- **`--usuario` es obligatorio para aplicar o revertir.** Sin él, el script se detiene antes de abrir la transacción.
- El uuid tiene que corresponder a un **perfil activo con rol de operaciones o admin**. Si no, la transacción aborta sin cambios.
- Ese perfil queda como `recetas.updated_by` y como `bitacora.usuario_id`.
- En el ensayo el parámetro es opcional. **Para el ensayo en producción se usará el mismo `--usuario` que en la aplicación**, para validar el perfil antes.

**Conexión:** el script lee `DATABASE_URL` con el cargador existente. Comprueba que la URL apunte a `jpqkmnfjwzniptszjuli` y nunca la imprime.

**Informe:** cada corrida guarda un informe JSON en `docs/conciliacion-brasil/19-renombres/`, con la fecha, el destino y el modo.

### Precondiciones y verificaciones (una sola transacción)

**Antes de renombrar.** El script fija `statement_timeout` en 15 s y `lock_timeout` en 5 s, y:
1. valida el perfil de `--usuario`;
2. bloquea las filas de la lista (`for update`);
3. revisa cada receta:
   - existe;
   - es un producto;
   - está activa;
   - su nombre es exactamente el de partida. Si ya tiene el nombre nuevo, la cuenta como «sin cambio» (idempotente);
   - el nombre nuevo no choca con otra receta, sin distinguir mayúsculas.

**Al renombrar.** Cada receta va en su propio SAVEPOINT. El script comprueba que:
- solo cambiaron `nombre`, `version` (sube exactamente 1), `updated_at` y `updated_by`;
- hay **exactamente un** registro nuevo en la bitácora para esa receta: tabla `recetas`, campo `nombre`, los valores anterior y nuevo, origen `carga_masiva` y el usuario indicado.

  A ese registro le agrega la nota: `B1 · renombre (conciliación Brasil, docs/conciliacion-brasil/16) · código POS 3FOOD3`.

**Al final: bitácora aislada de la actividad ajena.** Mientras el script corre, otras sesiones (portal, CRM, cargas) pueden registrar cambios en la bitácora. Por eso no cuenta «todo lo nuevo»:
- **Registros de esta ejecución:** los registros nuevos con `fecha = now()`. Es la hora de inicio de esta transacción, y el trigger la usa por defecto, así que cada transacción tiene la suya.
- Esos registros deben ser **exactamente** los verificados por receta, ni uno más ni uno menos. Cualquier registro adicional de esta transacción aborta todo.
- **Registros de otras sesiones:** no se cuentan, no se modifican y no detienen la ejecución. El informe los muestra en `bitacoraAjena`.
- **Excepción, a favor de la seguridad:** si otra sesión registra un cambio en una de estas 6 recetas durante la ejecución, la verificación de esa receta falla y no se aplica nada. En la práctica las filas bloqueadas y el candado de edición de recetas lo impiden.

**Si algo falla, no se aplica ninguna receta.** El informe lista los problemas de cada una.

## Pruebas

| Prueba | Resultado |
|---|---|
| `tests/db/renombres-b.test.ts` (PGlite, con los ids reales) | 10/10 (detalle abajo) |
| Pruebas de BD completas | 131/131; `tsc` sin errores |
| Ensayo sobre la copia restaurada (respaldo del 2026-10-23, `--local`) | 6 renombradas, 0 problemas, 6 registros de bitácora propios `carga_masiva`, 0 ajenos, ROLLBACK. Después se comprobó que los 6 nombres originales seguían ahí. Informes: `19-renombres/2026-10-26T15-56-21-497Z-local-ensayo.json` (versión inicial) y `19-renombres/2026-10-26T16-17-29-497Z-local-ensayo.json` (con el conteo aislado) |

Las 10 pruebas en PGlite cubren:
- actividad ajena en la bitácora durante la ejecución: no se cuenta ni se toca, y se informa;
- un registro adicional de la propia transacción aborta todo;
- ensayo sin efectos;
- ensayo de una sola receta;
- un choque, un nombre distinto o una receta inactiva abortan todo;
- aplicar con autoría;
- una segunda corrida queda sin cambio;
- sin usuario, con un perfil sin permiso o con un perfil inactivo, aborta sin tocar nada;
- reversión.

## Efectos a considerar

1. **Versión +1.** Si alguien tiene abierta la edición de una de estas recetas en el portal, al guardar verá un conflicto de versión y tendrá que recargar. Conviene ejecutarlo cuando nadie esté editando.
2. **Bitácora.** Habrá 6 registros con origen `carga_masiva` y la autoría del perfil indicado, visibles en el historial de cada receta. Cada ensayo en producción consume 6 ids de la bitácora aunque haga ROLLBACK, así que quedan huecos en la numeración. No se pierde nada.
3. **Script de paridad con el Excel.** Empareja por nombre, así que esas 6 filas aparecerán como diferencias de nombre.
4. **Sucursales.** No cambia: usa los nombres que manda el POS de Brasil.

## Después del renombre: revalidar el lote SKU

El enlace de códigos POS (`15` y `17`) se verificó comparando, entre otras cosas, el **nombre** de cada receta.

**Qué códigos dependen de estos renombres.** Los 6 códigos de estas recetas no están en el lote 1. En `15-enlace-codigos.csv` y `16-codigos-pendientes.csv` figuran como **pendientes** con el estado «requiere B2: forma del nombre»:

| Código | Decisión |
|---|---|
| 3FOOD3 | B1 |
| BR3 | B2 |
| CROSTUAPP | B3 |
| BRICE | B4, que además depende de C3 |
| 1CBWB | B5 |
| 3CBBE | B6 |

Ninguna de las 6 recetas aparece entre los candidatos del lote 1 («nombre exacto»), comprobado contra el CSV. El séptimo código pendiente por forma del nombre, MISICEDAPP, corresponde a B7 y no se toca.

**Tras el renombre:**
- Hay que **revalidar** esos 6 candidatos contra los nombres nuevos, con el mismo criterio que el lote 1: código, nombre, contexto, variante y tamaño.
- Hay que repetir la re-verificación del lote 1 (`17`, paso 1.2) antes de cargarlo, como ya prevé ese procedimiento.
- **No se modifica ninguna correspondencia automáticamente:**
  - el renombre no toca `producto_codigo_pos`, que además aún no existe en producción;
  - ningún candidato pasa de pendiente a verificado por el solo hecho de renombrar;
  - `cargar-enlaces.ts` (rama `feat/sku-enlace-pos`) aborta si el nombre de una receta difiere del verificado: no acepta el cambio en silencio.
- Promover esos códigos o ajustar los CSV será un cambio aparte, revisado y aprobado.

## Reversión

Se ejecuta con:

```
npx tsx scripts/conciliacion/renombres-b-aplicar.ts --revertir --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
```

- Usa la misma lista en sentido contrario, con las mismas precondiciones y verificaciones.
- Deja su propia bitácora, con la nota «reversión del renombre».
- Es idempotente: las recetas que ya tienen el nombre original cuentan como «sin cambio».

## Pasos para aprobar (uno por uno)

1. **Revisión del código:** PR de `feat/renombres-b1-b6`. El merge no ejecuta nada (no hay migraciones) y no autoriza los pasos siguientes.
2. **Ensayo en producción**, con `--usuario`: una transacción con ROLLBACK, con todas las recetas o con `--solo`. Esperado: 6 renombradas, 0 problemas, 6 registros de bitácora propios. `bitacoraAjena` puede ser mayor que 0 si hay actividad en el portal; eso no es un problema.
3. **Aplicar** con `--aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>`.
4. **Verificar:**
   - una segunda corrida en ensayo da 6 «sin cambio» y 0 registros de bitácora;
   - el historial de una receta en el portal muestra el cambio con su autor;
   - el tablero sigue con el mismo número de productos activos.
5. **Revalidar los candidatos SKU** afectados, sin modificar correspondencias.
6. **Reversión**, solo si hiciera falta.

## Resultado del ensayo en producción (2026-10-26 16:20 UTC)

Autorizado por Carlo. Se ejecutó sin `--aplicar` ni `--revertir`, en `jpqkmnfjwzniptszjuli`, con `--usuario <uuid-perfil>` (Carlos Valencia, admin, activo).

El informe está en `19-renombres/2026-10-26T16-20-44-425Z-jpqkmnfjwzniptszjuli-ensayo.json`.

| Dato | Resultado |
|---|---|
| Transacción | **ROLLBACK** |
| Renombres simulados | 6 (B1–B6), versión +1 cada uno |
| Problemas | 0 |
| Bitácora propia | 6 registros: ids 324–329, `recetas.nombre`, `carga_masiva`, con el usuario de Carlo |
| Actividad ajena durante el ensayo | 0 registros |

**Verificación posterior (solo lectura, comparada con una captura previa):**
- Las 6 recetas quedaron **idénticas**: nombre, versión, autor (`updated_by`), `updated_at` y estado activo.
- Bitácora: máximo 323, total 323, igual que antes. Los ids 324–329 **no existen**. Quedan como salto de numeración, aceptado por Carlo.
- Migraciones: la última sigue siendo `20261023000021` (21 en total).

**Nota sobre la autoría:** hoy `updated_by` es null en las 6 recetas. Al aplicar quedará Carlo como autor, en `recetas.updated_by` y en la bitácora.

**Siguiente paso:** la aplicación persistente, con `--aplicar --confirmo jpqkmnfjwzniptszjuli --usuario …`. **Sigue pendiente de aprobación.**

## Aplicación en producción (2026-10-26 16:23 UTC)

Autorizada por Carlo, solo para B1–B6. Comando ejecutado:

```
--aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

Carlo aceptó quedar registrado como último editor y como autor de los cambios.

### Antes de aplicar

**Respaldo lógico nuevo:** `C:\Users\carlo\Respaldos\thecoffee-supabase\2026-10-26T1622Z\`, fuera del repo. Se hizo con `respaldo-logico.ts`, que usa pg_dump 17.

| Comprobación del respaldo | Resultado |
|---|---|
| `pg_restore --list` | Sin errores; 71 tablas con datos |
| sha256 de `base.dump` | `fe3e6a3e…40ff`, igual al manifiesto |
| Contenido | Las 6 recetas con el nombre, la versión y el autor previos; la bitácora con 323 filas; 21 migraciones |

**Precondiciones (solo lectura):** las 6 recetas estaban idénticas al estado verificado en el ensayo. Se compararon el nombre, la versión, el autor, `updated_at` y el estado activo. Además:
- las 6 son productos;
- 0 choques de nombre;
- perfil admin activo;
- 154 productos activos;
- migraciones en 21;
- la tabla 22 no existe.

### Resultado

El informe está en `19-renombres/2026-10-26T16-23-57-526Z-jpqkmnfjwzniptszjuli-aplicar.json`. La transacción terminó en **COMMIT**, con 6 renombradas, 0 problemas, 6 registros propios en la bitácora y 0 ajenos.

| Decisión | Nombre final (exacto) | Versión | Autor | Bitácora |
|---|---|---|---|---|
| B1 | Pain au Chocolat | 9 → 10 | Carlo | 330 |
| B2 | Grilled Ham Cheese and Tomato Sandwich | 20 → 21 | Carlo | 331 |
| B3 | Croissant filled with cheese and ham | 15 → 16 | Carlo | 332 |
| B4 | Brownie with ice cream | 10 → 11 | Carlo | 333 |
| B5 | White bag 250g | 5 → 6 | Carlo | 334 |
| B6 | Black edition 250g | 5 → 6 | Carlo | 335 |

**Verificación posterior (solo lectura):**
- **Bitácora:** pasó de 323 a 329 filas, exactamente 6 nuevas. Son los ids 330–335, `recetas.nombre`, con origen `carga_masiva`, autor Carlo y nota. Los ids 324–329 se consumieron en el ensayo (salto aceptado).
- **Recetas:** las 6 siguen activas y siguen siendo 154 productos activos.
- **Migraciones:** siguen en 21. La tabla 22 no existe.
- **Precios y recetas sin cambios:** no hubo otros registros en la bitácora y el script exige que solo cambien el nombre y la versión.

**Segundo ensayo:** `19-renombres/2026-10-26T16-24-28-650Z-jpqkmnfjwzniptszjuli-ensayo.json`. Dio 6 «sin cambio», 0 renombradas, 0 problemas, 0 registros nuevos en la bitácora y ROLLBACK. El estado quedó idéntico.

**Reversión disponible:**

```
--revertir --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
```

El respaldo del 2026-10-26 sirve como respaldo de último recurso.

## Revalidación SKU (solo lectura, 2026-10-26)

Se revalidó contra Costeo actual sin cargar ni modificar correspondencias: `producto_codigo_pos` sigue sin existir y la migración 22 no se aplicó. La evidencia de la API es la de `15`, del periodo 2026-09-21 al 2026-10-18; no se volvió a consultar.

**Lote 1:** los 57 códigos «lote 1 (verificado)» de la rama `feat/sku-enlace-pos` tienen **0 problemas**. Cada receta existe, es producto, está activa y conserva el nombre verificado. Ninguno dependía de B1–B6.

**Los seis candidatos de B1–B6:**

| Código | Nombre en la API = nombre en Costeo | Producto activo | Tamaño (API → Costeo) | Precio en 532 | Situación |
|---|---|---|---|---|---|
| 3FOOD3 | Sí | Sí | sin vaso → Único | 42 = 42 | Cumple los criterios |
| BR3 | Sí | Sí | sin vaso → Único | 104 = 104 | Cumple los criterios |
| CROSTUAPP | Sí | Sí | sin vaso → Único | 73 = 73 | Cumple los criterios |
| BRICE | Sí | Sí | sin vaso → Único | 89 = 89 | Cumple los criterios, pero **sigue pendiente de C3**: qué brownie es el vigente |
| 1CBWB | Sí | Sí | sin vaso → Único | 220 = 220 | Cumple los criterios |
| 3CBBE | Sí | Sí | sin vaso → Único | Sin ventas sin descuento en 532; Costeo 550 | Nombre y tamaño correctos; el precio no se puede contrastar |

**No se modificó ninguna correspondencia.** Pasar estos códigos al lote verificado, de forma inmediata o en un lote 2, es una decisión aparte de Carlo. Entraría en la rama `feat/sku-enlace-pos` como cambio revisado. Si se agregan al lote 1 actual, este pasaría de 57 a 62 códigos sin BRICE, o a 63 con él.

## Cierre de la entrega (2026-10-26)

**Estado: CERRADA.** Los renombres B1–B6 están aplicados, verificados y documentados. El script no se volvió a ejecutar después de la aplicación y del segundo ensayo.

### Merge del PR #21

Carlo autorizó el merge con dos condiciones: que los checks del commit final `7290490` estuvieran aprobados y que el diff no incluyera migraciones ni renombres automáticos. Ambas se cumplieron:

- **Checks de `7290490`:**
  - Vercel: success;
  - Vercel Preview Comments: success;
  - Supabase Preview: skipped, porque no hay migraciones;
  - estado del PR: mergeable y clean.
- **Diff contra `main`:** 10 archivos nuevos:
  - 7 de documentación (plan, CSV e informes JSON);
  - `scripts/conciliacion/renombres-b.ts` y `renombres-b-aplicar.ts`;
  - `tests/db/renombres-b.test.ts`.

  No hay nada en `supabase/`, `app/`, `package.json`, configuración de Next, Vercel ni CI. Ningún archivo importa ni invoca el script: solo corre a mano.
- **Merge:** `98a67cc`, el 2026-10-26 a las 16:29:23 UTC. Se fijó al head `7290490` con `--match-head-commit`.

### Publicación automática

- Despliegue de Vercel a Production del commit `98a67cc`: success (16:29:48 UTC).
- Check de Supabase en el merge: success.
- **Registro de migraciones sin cambios**, comprobado en solo lectura después del despliegue:
  - última migración `20261023000021`, 21 en total;
  - la tabla `producto_codigo_pos` no existe.
- **Sin re-ejecución:**
  - las 6 recetas conservan los nombres finales y las versiones 10/21/16/11/6/6;
  - la bitácora sigue en 329 filas, con 335 como id máximo;
  - no hay registros de renombre posteriores a la aplicación.

### Pendiente, con aprobación independiente

- **Migración 22** (`producto_codigo_pos`): `17`, rama `feat/sku-enlace-pos`.
- **Promoción de códigos SKU:**
  - los 5 candidatos revalidados (3FOOD3, BR3, CROSTUAPP, 1CBWB, 3CBBE);
  - BRICE, sujeto a C3;
  - los demás pendientes de `16-codigos-pendientes.csv`.
- **C3:** Brownie com sorvete / Brownie with ice cream. Sigue sin autorizarse desactivar ni fusionar productos.
