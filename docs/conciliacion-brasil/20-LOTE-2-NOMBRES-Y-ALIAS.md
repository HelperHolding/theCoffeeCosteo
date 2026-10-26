# 20 · Lote 2 de códigos POS: nombres y alias (propuesta para revisión)

**Estado:** preparado el 2026-10-26 por indicación de Carlo. **No se cambió nada en producción.**
- No se cargó ningún enlace.
- No se renombró ni se desactivó ninguna receta.
- No se cambió ningún precio.

**Actualización del 2026-10-26:** Carlo autorizó preparar el cargador, las pruebas y un PR para revisión del **lote 2 con cinco códigos**: `3FOOD3`, `BR3`, `CROSTUAPP`, `1CBWB` y `3CBBE`. Esa autorización **no incluye** carga en producción, merge ni despliegue. Detalle en «Lote 2 preparado», al final.

BRICE y los nueve alias siguen pendientes. Cada fila necesita aprobación expresa antes de cargarse.

**Lista con la evidencia por código:** [`20-lote-2-candidatos.csv`](20-lote-2-candidatos.csv), 15 códigos.

## Cómo se verificó (solo lectura)

- **Datos del POS:** la misma muestra auditada de `15` y `17`: sucursales 532, 583 y 612, del 2026-09-21 al 2026-10-18, 5,324 pedidos.
- **Costeo:** inventario actual de producción, leído el 2026-10-26 con SELECT acotados: 160 recetas, sus tamaños y precios de lista, y los 57 enlaces cargados.
- **Criterios:** los mismos cinco del lote 1 (`verificar-enlaces.ts`): código, nombre, contexto, variante y tamaño. El precio de 532 Mostrador es evidencia, no criterio.
- **Alias:** para revisarlos, el nombre observado se tomó como alias de la receta candidata. Así se compararon con esa receta su tamaño, su precio y sus posibles variantes.

  Que el resultado sea coherente **no prueba que sean el mismo producto**. Por eso los alias quedan como candidatos.

**Comprobaciones comunes:**
- **Unicidad:** cada código llega con un solo nombre, y ese nombre no llega con otro código. Ninguno aparece como componente de un combo.
- **Sin solape:** ninguno de los 15 códigos está cargado, y ninguna de sus recetas está ligada ya a otro código.
- **El lote 1 sigue verificado:** 57/57 con los datos actuales.

## A · Nombres (renombres B1–B6 ya aplicados)

Tras los renombres del PR #21, el nombre de Costeo coincide **exactamente** con el observado en el POS.

| Código | Producto en Costeo | Líneas | Tamaño (API → Costeo) | Precio en 532 | Estado |
|---|---|---|---|---|---|
| `3FOOD3` | Pain au Chocolat | 220 | sin vaso → Único | 42 = 42 | **Listo para revisión** |
| `BR3` | Grilled Ham Cheese and Tomato Sandwich | 202 | sin vaso → Único | 104 = 104 | **Listo para revisión** |
| `CROSTUAPP` | Croissant filled with cheese and ham | 89 | sin vaso → Único | 73 = 73 | **Listo para revisión** |
| `1CBWB` | White bag 250g | 19 | sin vaso → Único | 220 = 220 | **Listo para revisión** |
| `3CBBE` | Black edition 250g | 5 | sin vaso → Único | Sin ventas sin descuento en 532 (Costeo: 550) | **Listo para revisión.** El precio no se puede contrastar, igual que en `19` |
| `BRICE` | Brownie with ice cream | 22 | sin vaso → Único | 89 = 89 | **Bloqueado por C3.** Pasa todos los criterios, pero falta decidir cuál de los dos brownies es el vigente (pregunta O2 de `18`). No se propone sin esa decisión. Ver «Por qué BRICE no se enlaza todavía» |

### Por qué BRICE no se enlaza todavía

Costeo tiene **dos productos activos que representan el mismo artículo** y cuyas recetas son idénticas (comprobación de `16`, C3). Leídos en producción en solo lectura el 2026-10-26:

| UUID | Nombre | Categoría | Precio de lista |
|---|---|---|---|
| `2c8f400b-525f-4c30-8d64-f18be8b9334c` | Brownie with ice cream | Desserts | Único 89 |
| `ffc27925-601b-4a4f-b931-cb536d873072` | Brownie com sorvete | PANADERÍA DULCE | Único sin precio |

El tercer brownie activo, «Brownie» (Sweets, 63), no tiene helado y no entra en la duda.

**La ambigüedad concreta:** el UUID verificado es `2c8f400b…`, pero la evidencia **no distingue** entre los dos registros.
- **El nombre exacto no es independiente.** «Brownie with ice cream» tiene esa forma porque B4 adoptó el nombre del POS. La coincidencia es consecuencia del renombre, no una prueba de identidad frente al otro registro.
- **El precio no puede desempatar.** 89 = 89 descarta poco, porque «com sorvete» no tiene precio que comparar.
- **La receta tampoco.** Es idéntica en ambos.

**Qué fijaría el enlace.** La tabla liga **un código a una receta**. Enlazar `BRICE` a `2c8f400b…` decidiría de hecho **cuál de los dos registros representa el producto vendido**: a qué receta y categoría (Desserts frente a PANADERÍA DULCE) se atribuirían esas ventas cuando se usen los enlaces. Esa es exactamente la pregunta O2 de `18`, que Operaciones no ha contestado.

Si Operaciones respondiera que el vigente es «Brownie com sorvete», el enlace apuntaría al registro equivocado y habría que revertirlo.

**La desactivación es otra decisión.** Aunque se confirme que el vigente es `2c8f400b…`, desactivar «Brownie com sorvete» (segunda parte de C3) sigue siendo independiente. Enlazar `BRICE` no desactiva nada, y desactivar no requiere enlazar.

**Para desbloquearlo:**
1. Respuesta de Operaciones a O2.
2. Aprobación del enlace de `BRICE` al UUID elegido, como fila nueva en un lote aprobado.
3. Por separado, la decisión de desactivar o no el otro registro.

## B · Alias (grupo D de `16`): candidatos, no aprobados

El nombre del POS difiere del de Costeo. **La identidad tiene que confirmarla Operaciones** (pregunta O4 de `18`): nombre parecido y precio igual no bastan.

La propuesta es **ligar el código a la receta existente sin renombrarla**.

| ID | Código | POS | Costeo | Líneas | Tamaño | Precio en 532 (Chica/Grande) | Requiere |
|---|---|---|---|---|---|---|---|
| D1 | `CPUMICAPP` | Pumpkin Iced Latte | Pumpkin Spice Iced Latte | 428 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D2 | `CPUMLAAPP` | Pumpkin Latte | Pumpkin Spice Latte | 349 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D3 | `CPUMFRAPP` | Pumpkin Spice Frap | Pumpkin Spice Frappé | 124 | Regular+Large → Chica+Grande | 99 = 99 · 109 = 109 | Identidad (O4) |
| D4 | `SALFRAAPP` | Salted Caramel Frap | Salted Caramel Frappé | 101 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D5 | `FRATARAPP` | Taro Frap | Taro Frappé | 80 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D6 | `COFFRAAPP` | Coffee Frap | Coffee Frappé | 59 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D7 | `FRAMATAPP` | Matcha Frap | Matcha Frappé | 46 | Regular+Large → Chica+Grande | 89 = 89 · 99 = 99 | Identidad (O4) |
| D8 | `FRACHAAPP` | Chai Frap | Chai Frappé | 42 | Regular+Large → Chica+Grande | 89 = 89 (Grande sin evidencia) | Identidad (O4) |
| D9 | `ZOEWATAPP` | Zoé Water | Zoé Water Natural | 8 (solo 532) | sin vaso → Único | API 45; **Costeo sin precio de lista** | Identidad (O4) **y** precio (A4) |

**Observaciones:**
- **Pumpkin Spice y la temporada.** Los tres Pumpkin Spice son de temporada: si el producto deja de venderse, el enlace queda sin uso, pero no causa daño. En `16` (A5) sigue la observación del precio Rappi de Grande menor que el de Chica; no se toca aquí.
- **Chai Frap (D8).** Solo hay evidencia de precio para Chica. El tamaño es coherente: llega con vasos Regular y Large.
- **Zoé Water (D9).** Solo se vende en 532. La receta candidata **no tiene precio de lista**, así que ligar el código no cambia cifras, pero el costeo de ese producto seguirá incompleto hasta resolver A4.

## Fuera de este lote

| Código | Motivo |
|---|---|
| `MISICEDAPP` (Iced Latte + Ham & Cheese Sandwich) | B7 se aprobó: conservar el nombre de Costeo y ligar por código. Pero el POS lo vende con vasos y la receta es Único: **depende de E5** (tamaños de combos, O8) |
| `ZOETWIAPP` (Zoe Water Twist) | **D10:** un código para dos sabores. No puede ligarse a una sola receta (pregunta R3 de `18` y pregunta al proveedor) |
| Los demás pendientes de `16-codigos-pendientes.csv` | Variantes (C1, C6), tamaños (E2–E5) y recetas nuevas (F), con sus propias decisiones |

## Si se aprueba (otra entrega, cada paso con aprobación)

1. **Aprobación por fila o por grupo**, por ejemplo: «apruebo A sin BRICE» o «apruebo D1–D8 con la confirmación de Operaciones».
2. **Archivo fijado** `lote-2.csv`, con el mismo formato y sha256 que `17-lote-1.csv`, incluida la evidencia de cada fila.
3. **Script:** el mismo `enlaces-pos.ts`, apuntando al lote 2, en una rama con PR. Hoy la huella del lote 1 está fijada en el código, así que hay que **parametrizar el lote** sin debilitar sus validaciones.
4. **Respaldo verificado** y ensayo remoto con ROLLBACK, carga con `carga_id` propio y segundo ensayo, como en `17`.
5. **Integraciones:** Vercel y Supabase tienen que estar reconectadas a `HelperHolding/theCoffeeCosteo` antes de cualquier merge con cambios de código. Hoy Vercel no despliega y Supabase no genera checks (ver PR #24).

**Este lote no cambia** nombres, recetas, precios, costos ni ventas, y Sucursales no usa los enlaces.

## Lote 2 preparado: cinco códigos (2026-10-26)

Autorizado por Carlo: preparación local, pruebas y PR para revisión. **No autoriza** carga en producción, merge ni despliegue.

### Archivos del lote

**Lote aprobado** `20-lote-2.csv`, en el mismo formato que `17-lote-1.csv`. Cada fila lleva su evidencia.

| Código | Receta (UUID) | Nombre | Evidencia de precio en 532 |
|---|---|---|---|
| `1CBWB` | `5ce9b244-…` | White bag 250g | Único 220 = 220 |
| `3CBBE` | `d22e139c-…` | Black edition 250g | **Sin precio comparable sin descuento en 532: no confirmado** |
| `3FOOD3` | `26a2fa5e-…` | Pain au Chocolat | Único 42 = 42 |
| `BR3` | `ff0a88ca-…` | Grilled Ham Cheese and Tomato Sandwich | Único 104 = 104 |
| `CROSTUAPP` | `4ac9187c-…` | Croissant filled with cheese and ham | Único 73 = 73 |

**Manifiesto** `20-lote-2.manifiesto.json`. Declara:
- el archivo, su sha256 `d9069234…cf44` y 5 filas;
- las **5 correspondencias exactas** código → receta;
- que requiere el **lote 1**;
- la aprobación;
- las notas: 3CBBE sin precio confirmado; BRICE y los alias, fuera.

**Lote 1:** ahora también tiene manifiesto (`17-lote-1.manifiesto.json`, 57 correspondencias), con la misma identidad de siempre: sha256 `5c36c6ce…f357`.

### Cargador (`enlaces-pos.ts` y `enlaces-pos-aplicar.ts --lote <nombre>`)

**Solo carga lotes de `LOTES_APROBADOS`**, que fija en el código la huella de cada manifiesto. Un lote nuevo exige revisar ese cambio en un PR.

**Antes de abrir la transacción**, al leer el lote, exige:
- que el manifiesto tenga la huella fijada;
- que el archivo coincida en sha256 y cantidad;
- que las filas sean **exactamente** las correspondencias declaradas;
- que no repita códigos ni recetas de los lotes requeridos;
- y, para el lote 1, que su manifiesto coincida además con la identidad fijada anterior (57 filas, `5c36c6ce…`).

**Lotes previos.** Antes de tocar nada, cada enlace de un lote requerido tiene que **existir idéntico**. Si falta o cambió uno solo de los 57 del lote 1, no se carga nada. Se vuelve a comprobar al final de la ejecución, y el informe lo muestra en `previos` (intactos antes y después).

**Se mantienen todas las garantías del lote 1:**
- perfil obligatorio también en el ensayo;
- destino validado;
- REPEATABLE READ con bloqueos y timeouts;
- recetas verificadas;
- conflictos sin sobrescribir;
- bitácora propia aislada;
- huellas comerciales;
- cierre verificado;
- reversión solo de la carga indicada.

**Nota de bitácora:** «Lote 2 SKU, carga <id>».

**Compatibilidad:** sin `--lote`, el CLI usa el lote 1. Los comandos de `17`, incluida la reversión de la carga del lote 1, siguen funcionando igual.

### Pruebas

| Prueba | Resultado |
|---|---|
| `tests/db/lotes-aprobados.test.ts` | **9/9** (detalle abajo) |
| BD completa | **179/179**; `tsc` sin errores |

Las 9 pruebas de `lotes-aprobados` cubren:
- el lote 1 real por manifiesto (57);
- el lote 2 real: exactamente los 5 códigos, sin BRICE ni alias, con 3CBBE «no confirmado» y el lote 1 requerido;
- un lote no aprobado o un manifiesto alterado;
- correspondencias distintas, cantidad distinta o lote mal declarado;
- solape con un lote previo y dependencia circular;
- el lote nuevo sin el previo cargado, que no carga;
- la carga con el previo intacto antes y después;
- un enlace previo alterado o borrado, que detiene la ejecución;
- la reversión del lote nuevo, que deja intacto el previo.

### Ensayo en copia local aislada

Se usó el respaldo de producción del 2026-10-26 a las 17:26 UTC (base `resp1726`, solo localhost). Es posterior a los renombres y anterior a la migración 22.

| Paso | Resultado |
|---|---|
| Migración 22 (local) | COMMIT |
| Lote 2 sin el lote 1 | **Se detiene**: «lote-1 no está intacto: 0 de 57» |
| Lote 1 (local) | 57 altas |
| Ensayo del lote 2 | 5 altas, 0 problemas, 5 registros propios en la bitácora, lote 1 intacto 57/57 antes y después, sin cambios comerciales; ROLLBACK |
| Carga del lote 2 (local) | 5 altas; COMMIT |
| Repetición | 5 sin cambio, 0 registros en la bitácora |
| Reversión de la carga del lote 2 | 5 bajas; el lote 1 sigue intacto (57) |

Los informes están en `20-informes/`.

### Revalidación contra producción (solo lectura, 2026-10-26)

- Las 5 recetas existen, son productos activos y tienen el nombre esperado.
- Ninguno de los 5 códigos está cargado, y ninguna de sus recetas está ligada a otro código.
- **Los 57 enlaces del lote 1 están intactos (57/57)**, sin otras filas.
- La última migración es la 22.

### Acceso e integraciones (sin modificarlas)

- **Supabase CLI**, con la sesión de la cuenta institucional configurada en esta computadora: ve la organización **HelperHolding** y el proyecto **The_Coffee_Portal** (`jpqkmnfjwzniptszjuli`, ACTIVE_HEALTHY, Postgres 17.11). No se usaron tokens personales y no se cambiaron `DATABASE_URL`, claves ni configuración remota.
- **PR #24** se mantiene en `499b4e2`:
  - la app de Vercel recibe eventos (check suite `queued`), pero no creó despliegue, y Carlo informó que aún no hay acceso a Vercel;
  - la app de Supabase no creó check.

  Que falte el check de Supabase **no demuestra** que la cuenta institucional carezca de acceso: la CLI lo confirma. Lo que no se ha verificado es la conexión GitHub ↔ Supabase del proyecto, que se configura en su panel.

### Siguientes pasos (cada uno con aprobación expresa)

1. Revisar el PR del cargador y del lote 2. No hacer merge.
2. Respaldo verificado y ensayo remoto del lote 2 con `--lote lote-2` y ROLLBACK.
3. Carga y segundo ensayo, con el lote 1 intacto antes y después.
4. Merge y despliegue cuando Vercel y Supabase estén verificados con `HelperHolding`.
