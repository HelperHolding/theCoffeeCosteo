# 29 · Lote del PDF: hielo de Fresh Sodas y Cold brew, agua de Iced Chocolate

**Estado:** ✅ **aplicado el 2026-10-27 (04:48 UTC) y verificado.** Ejecución `52b1a39b-128b-403e-89cd-79e3f4c1c26b`, bitácora **#575–581**; segundo ensayo con 0 cambios. Ver el §8. La aplicación y el ensayo remoto contaron con la aprobación expresa de Carlo.

**Alcance aprobado (Carlo, 2026-10-27):** un único lote con estos cambios:

- Hielo Grande de las dos Fresh Sodas: **245 g** en `HIELO (g)`.
- Hielo de Cold brew en `HIELO (g)`, conservando 130/245.
- Iced Chocolate: AGUA **10 → 0 ml**, tras revalidar que la subreceta ya aporta esos 10 ml.

No se cambian otros ingredientes, precios ni costos de compra.

- Manifiesto: `29-recetario-pdf-lote-1.manifiesto.json`, sha256 `67f024c1…`.
- Script: `scripts/conciliacion/recetas-pdf.ts`.
- CLI: `recetas-pdf-aplicar.ts`.
- Pruebas: `tests/db/recetas-pdf.test.ts`.

## 1. Revalidación (2026-10-27, solo lectura)

| Comprobación | Resultado |
|---|---|
| PDF | «RECETARIO OFICIAL 2026.pdf», sha256 `6a81e1a8…` (el mismo de los docs 21–27) |
| p.43, Pink Lemonade | Regular 130 g de hielo; Grande (600 ml) «245 gr de hielo» |
| p.44, Maracuyá | Regular 130 g de hielo; Grande (600 ml) «245 g de hielo en cubos» |
| p.27, Cold Brew | «130 gr de hielo» / «245 gr de hielo» |
| p.24, Iced Chocolate | 36 g de salsa + 10 ml de agua caliente en ambos tamaños |
| p.5, Preparado de chocolate | 90 g de azúcar morena, 100 g de cocoa y 200 ml de agua |
| p.34, Urban Chocolate | 36 g de preparado + 10 ml de agua caliente |
| Versiones en producción | Pink Lemonade **v28**, Passion fruit **v25**, Cold brew **v33** (con 3b), Iced Chocolate **v32** |
| Líneas en producción | Pink `HIELO` 130/190 · Passion `HIELO` 130/177 · Cold brew `HIELO` 130/245 · Iced Chocolate `AGUA` 10/10 |
| Insumos | `HIELO` (ml), `HIELO (g)` (gr, 26 usos tras H2) y `AGUA` (ml): los tres a **$0 / 1** |
| Base | 72 enlaces, migración 22 y bitácora con 445 filas (id máx. 567) |

### La subreceta de Iced Chocolate ya incluye el agua

«Mix AZUCAR MASCABADO USO BARRA + COCOA POWDER - EXTRA BRUTE 1 KG (2)», v7, rinde 1,000. Contiene:

- cocoa 200.64345;
- azúcar 180.64432;
- agua 618.71223.

El reparto del agua:

- El preparado de la p.5 lleva 200 ml de agua por cada 100 g de cocoa, así que usa **401.28690** de esa agua.
- Sobran **217.42533**, que es 0.27784 del preparado (782.5747). La proporción del PDF es 10/36 = 0.27778.
- Por eso las 46.002 unidades que usa Iced Chocolate son **36.000 g de preparado + 10.002 ml de agua**.

La línea `AGUA` de 10 ml cuenta esa agua dos veces. Urban Chocolate usa la misma subreceta sin línea de agua aparte, lo que es coherente.

## 2. Cambios: 7 en una sola transacción

| # | Receta | Tipo | Cambio | Fuente |
|---|---|---|---|---|
| 1 | Fresh Soda Pink Lemonade | cantidad | `HIELO` Grande **190 → 245** | p.43 |
| 2 | Fresh Soda Passion fruit | cantidad | `HIELO` Grande **177 → 245** | p.44 |
| 3–4 | Iced Chocolate | cantidad | `AGUA` Chica y Grande **10 → 0** | p.24 + p.5 + subreceta (2) |
| 5 | Fresh Soda Pink Lemonade | insumo | `HIELO` → `HIELO (g)`, queda en 130/245 | p.43 |
| 6 | Fresh Soda Passion fruit | insumo | `HIELO` → `HIELO (g)`, queda en 130/245 | p.44 |
| 7 | Cold brew | insumo | `HIELO` → `HIELO (g)`, se mantiene en 130/245 | p.27 |

**Orden:** primero se cambian las cantidades, con el insumo de origen, y después el insumo de la línea. Al revertir se sigue el orden inverso.

**Sin conversión:** los números en gramos son los del recetario. El cambio de insumo no altera ningún número.

## 3. Impacto conjunto

| Concepto | Antes | Después |
|---|---|---|
| Versiones | Pink v28 · Passion v25 · Cold brew v33 · Iced Chocolate v32 | **v30 · v27 · v34 · v34** (una por registro) |
| Bitácora | 445 filas (id máx. 567) | **+7 registros**: 4 en `linea_cantidades.cantidad` y 3 en `receta_lineas.insumo_id`, todos `carga_masiva`, con el autor y la nota de la ejecución |
| Usos de `HIELO` (ml) | 15 | **12**. No cambian: combos 130/245 y 90/170, V60 230/310 y 230/300, Gelato Frappé 45, Lemon Honey 90/130, Nutty 90/123 |
| Usos de `HIELO (g)` | 26 | **29** |
| Costo por producto (`v_costo_producto`) | Pink $17.4225/$22.2480 · Passion $24.5405/$32.0730 · Cold brew $14.50/$14.70 · Iced Chocolate $13.852/$16.692 | **Idéntico** |
| Márgenes y precios (`v_resumen`, `precio_canal_manual`) | — | **Idénticos** |

### Por qué el costo no cambia, y qué significa

El hielo y el agua cuestan hoy **$0** en Costeo. Eso **no confirma que sean gratuitos**: el costo del hielo está pendiente de Compras (doc 22, pregunta 7).

Este lote corrige las **cantidades**, no los costos. Cuando el hielo tenga precio:

- cada Fresh Soda Grande consumirá **+55 g** (Pink) y **+68 g** (Passion) más que hoy;
- Iced Chocolate dejará de contar 10 ml de agua dos veces.

El script exige que `v_costo_producto` y `v_costo_subreceta` queden idénticos. Si Compras cambia un costo antes de aplicar, el lote se detiene y requiere revisión.

### Lo que no cambia

- Tónica 170/232: la variante a costear sigue pendiente (doc 22 §4.4).
- Limón, fresa, pulpa, vasos y tapas.
- Leche y chispas de Iced Chocolate.
- El resto de líneas de `HIELO`.
- Insumos, precios y enlaces POS.

## 4. Garantías del script

Sigue el mismo patrón de `recetas-correcciones.ts` y `hielo-unidad.ts`, sin modificarlos.

- **Lote aprobado:** la huella del manifiesto está fijada en `LOTES_PDF_APROBADOS`.
- **Perfil obligatorio** también en el ensayo, de operaciones o admin.
- **Bloqueos:** REPEATABLE READ, con FOR UPDATE sobre insumos, recetas, líneas y celdas.
- **Bloqueo optimista:** cada receta debe tener su versión exacta y cada celda su valor previo exacto.
  - Si todo ya está en el estado nuevo, el resultado es «sin cambio».
  - Cualquier mezcla es un problema y no se toca nada.
- **Insumos como se declaran:** nombre, unidad, costo de paquete y presentación iguales a los del manifiesto. Un cambio de insumo exige el mismo costo unitario en el origen y el destino.
- **Bitácora:** exactamente un registro por celda y uno por línea. Cualquier otro registro propio aborta.
- **Huellas idénticas:** precios, enlaces, insumos, el resto de líneas, cantidades y recetas, y los costos de productos y subrecetas.
- **Reversión por id de ejecución:** se niega si alguna de las cuatro recetas tiene registros posteriores. Tras revertir, volver a aplicar requiere regenerar el manifiesto, porque las versiones cambiaron.

## 5. Verificación local

**Pruebas (PGlite, migraciones reales), 9 en total.** Cubren:

- el manifiesto real: 4 recetas, 4 celdas, 3 cambios y solo `HIELO`, `HIELO (g)` y `AGUA`;
- manifiestos incoherentes o que cambiarían costos;
- la huella del manifiesto;
- el perfil obligatorio;
- un ensayo que no deja nada;
- la aplicación con estado final, bitácora y versiones, sin tocar el combo y con repetición «sin cambio»;
- el bloqueo optimista, incluido un estado mezclado;
- costos de compra distintos de cero;
- la reversión exacta y su negativa ante ediciones posteriores.

**Ensayo sobre una copia del respaldo `0250Z`.** La copia tiene las mismas versiones de las cuatro recetas que producción. Se borró al terminar.

| Paso | Resultado |
|---|---|
| Ensayo | 7 cambiadas, 7 registros propios y 0 ajenos; costos y huellas sin cambios; ROLLBACK |
| Aplicar | 7 cambiadas; versiones v30/v27/v34/v34; COMMIT |
| Repetir | 7 «sin cambio», 0 registros |
| Revertir con un id que no cambió nada | Se niega: «nada que revertir» |
| Revertir con el id de la aplicación | 7 revertidas; líneas, cantidades, insumos y costos con md5 **idéntico** al respaldo |

Los informes del ensayo contienen el UUID del perfil, así que se guardan fuera del repo.

## 6. Procedimiento remoto (cada paso requiere aprobación)

1. Respaldo lógico verificado por restauración.
2. Revalidación en solo lectura: versiones, insumos a $0, 72 enlaces, migración 22 y bitácora.
3. Ensayo remoto, que termina en ROLLBACK:
   `npx tsx scripts/conciliacion/recetas-pdf-aplicar.ts --lote recetario-pdf-lote-1 --usuario <uuid-perfil>`
4. Aplicación:
   `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
5. Verificación con una conexión nueva y un segundo ensayo, que debe dar 7 «sin cambio».
6. Reversión, solo con aprobación:
   `… --revertir --ejecucion <uuid> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`

## 7. Preguntas pendientes para Operaciones y Compras (no enviadas)

Carlo decide si se envían y cuándo.

**Datos de Sucursales** (532, 583 y 612, del 19 al 25 de octubre):

- De 2,121 líneas con receta, solo **402 (19 %)** tienen costeo completo.
- **1,638 (77 %)** quedan parciales por personalización y 81 por tamaño.
- Por eso las dos primeras preguntas son las que más limitan el margen que se muestra.

### Prioridad 1: limitan el margen de Sucursales

| # | Para | Pregunta | Desbloquea |
|---|---|---|---|
| I1 | Compras | ¿Los costos de paquete en Costeo se capturan **con IVA o sin IVA**? ¿Depende del proveedor o de la factura? ¿Qué insumos están a tasa 0 o exentos? Es el «K5» del doc 27 §3.2; en el doc 21, K5 es la pregunta del creamer, por eso aquí se llama **I1** | Comparar costo y venta sin IVA con el mismo tratamiento. Hoy el margen es provisional |
| I2 | Operaciones | **Efecto de cada personalización en la receta:** «sin efecto», «sustituye X por Y en la misma cantidad», «agrega N de X» o «quita X». Las más vendidas en la semana:<ul><li>Double shot (36 ml): 724</li><li>Lactose free: 627</li><li>Without, Less y Average Honey: 357, 123 y 100</li><li>Original y Extra Hot (temperatura): 355 y 71</li><li>Single Shot (18 ml): 233</li><li>Oatmilk: 213</li><li>Almond Milk: 98</li><li>Extra Double shot: 94</li><li>Average Vanilla (15 y 10 ml): 88 y 49</li><li>Chipotle Mayo y Without Chipotle Mayo: 73 y 64</li><li>Average Salted Caramel: 59</li><li>No Milk (Americano): 57</li><li>With Sprinkles: 50</li><li>Coconut Milk: 36</li></ul>Por ejemplo: ¿Double shot agrega 18 ml de espresso (¿cuántos g de café?) o es el estándar de la bebida? ¿Lactose free y las bebidas vegetales sustituyen la leche entera ml por ml? ¿Cuántos ml de miel lleva cada nivel? ¿Los jarabes «Average» son la cantidad estándar de la receta? | Catálogo de efectos de las personalizaciones: pasa líneas de parcial a completo |
| I3 | Compras | Costo, presentación y unidad de las leches alternativas (deslactosada, avena, almendra y coco), si no existen en Costeo o no están vigentes | Costear las sustituciones de I2 |

### Prioridad 2: costo real de lo que ya está costeado

| # | Para | Pregunta | Desbloquea |
|---|---|---|---|
| 22-7 | Compras | ¿El hielo se compra? Presentación y precio. Hoy cuesta $0, lo que no confirma que sea gratuito | El costo del hielo en 41 recetas, incluidas las de este lote |
| 21-K3, K4 | Compras | El costo real del jamón serrano y del arándano con matcha a $1/kg | Croissant Serrano & Gouda y Costeo |
| 22-1, 22-2, P6 | Operaciones y Compras | Base de las Fresh Sodas (agua con gas o tónica), marca, presentación y reutilización | 3c |

### Prioridad 3: tamaños y catálogo (costeo parcial por tamaño y códigos sin enlace)

- **18-O6, O7 y O8:** tamaño de la Fresh Soda sin vaso, Gelato Frappé Grande y vaso de los combos.
- **18-O4 y O2:** identidad de nombres parecidos y duplicados vigentes (C1–C6).
- **Doc 27 §1.1:** tamaños de los 9 códigos con coincidencia clara.

### Prioridad 4: recetas sin ficha o con dudas puntuales

- **Doc 21:** P1 (Pumpkin Spice Frappé, lote 1), P3 (chai), P5 (Macchiato), P7 (Açaí), P8–P10 (sándwiches y focaccia) y P11–P13.
- **Doc 18:** O1, O3, O5, O9–O11, K1 y K2.
- **Doc 21:** K5 (creamer duplicado) y K6.
- **Doc 22:** preguntas 3–6.
- **Doc 18:** R1–R3 (Rappi).

## 8. Cierre: aplicado el 2026-10-27 (04:48 UTC) y verificado

Se ejecutó solo `recetario-pdf-lote-1`, desde el código de este PR en `d26b2ae` y con el manifiesto `67f024c1…`. Cada paso tuvo la aprobación expresa de Carlo. Hubo un solo COMMIT, sin reintentos.

| Paso | Resultado |
|---|---|
| **Respaldo lógico `0438Z`** | Restaurado en una copia local aislada y comparado con producción: 19,678 filas idénticas. Solo difiere `vault.secrets` (0 filas). Políticas, funciones, membresías, secuencias y `v_resumen` bajo RLS (645 filas), idénticas |
| **Revalidación** (solo lectura) | Versiones v28 / v25 / v33 / v32. Valores previos 190, 177 y 10/10, con las 3 líneas en `HIELO`. `HIELO`, `HIELO (g)` y `AGUA` a $0/1. Perfil admin activo. 72 enlaces, migración 22 y bitácora con 445 filas (id máx. 567) |
| **Ensayo remoto** (ROLLBACK) | 7 cambiadas, 7 registros propios y 0 ajenos; costos y resto sin cambios. Una conexión nueva confirmó que no persistió nada (15 huellas idénticas). La secuencia de la bitácora avanzó a 574 por la transacción deshecha, como es normal en Postgres |
| **Vigencia del respaldo** | Justo antes de aplicar, las huellas eran idénticas a las tomadas tras el respaldo: no hubo escrituras intermedias |
| **Aplicación** | **COMMIT**, ejecución `52b1a39b-128b-403e-89cd-79e3f4c1c26b` |
| **Verificación** (conexión nueva) | Ver la tabla siguiente |
| **Segundo ensayo** | 7 «sin cambio», **0 registros nuevos**, ROLLBACK. Desde una conexión nueva, sin ninguna diferencia (bitácora y secuencia en 581) |

### Los 7 cambios aplicados

| Bitácora | Receta | Cambio |
|---|---|---|
| #575 | Fresh Soda Pink Lemonade | `HIELO` Grande 190 → **245** (`linea_cantidades.cantidad`) |
| #576 | Fresh Soda Passion fruit | `HIELO` Grande 177 → **245** (`linea_cantidades.cantidad`) |
| #577 | Iced Chocolate | `AGUA` Chica 10 → **0** (`linea_cantidades.cantidad`) |
| #578 | Iced Chocolate | `AGUA` Grande 10 → **0** (`linea_cantidades.cantidad`) |
| #579 | Fresh Soda Pink Lemonade | `HIELO` → **`HIELO (g)`**, 130/245 (`receta_lineas.insumo_id`) |
| #580 | Fresh Soda Passion fruit | `HIELO` → **`HIELO (g)`**, 130/245 (`receta_lineas.insumo_id`) |
| #581 | Cold brew | `HIELO` → **`HIELO (g)`**, 130/245 (`receta_lineas.insumo_id`) |

- **Bitácora:** los 7 registros son `carga_masiva`, con autor Carlo y la nota `recetario-pdf-lote-1, ejecución 52b1a39b-… (docs/conciliacion-brasil/29)`. Queda en 452 filas (id máx. 581).
- **Versiones:** Pink v28 → **v30**, Passion v25 → **v27**, Cold brew v33 → **v34** e Iced Chocolate v32 → **v34**. Las cuatro quedan con `updated_by` de Carlo.
- **Estado final de las líneas:**
  - Pink, Passion y Cold brew en `HIELO (g)` con 130/245;
  - Iced Chocolate con `AGUA` 0/0.

### Lo que quedó intacto (verificado desde una conexión nueva)

- Costos: `v_costo_producto` (215 filas) y `v_costo_subreceta` (6 filas). Por ejemplo, Pink $17.4225/$22.2480, Passion $24.5405/$32.0730, Cold brew $14.50/$14.70 e Iced Chocolate $13.852/$16.692.
- Márgenes en `v_resumen` (645 filas).
- Precios de lista (`producto_tamanos`) y precios manuales (`precio_canal_manual`).
- Insumos (165): ningún costo de compra cambió.
- Los **72 enlaces POS** (`producto_codigo_pos`).
- El resto de recetas, líneas y cantidades: las 12 líneas que siguen en `HIELO` no cambiaron.
- La **migración 22** (`20261024000022`), con 22 migraciones registradas.

### Reversión (solo con aprobación expresa)

Se revierte por ejecución con el mismo manifiesto:

```
npx tsx scripts/conciliacion/recetas-pdf-aplicar.ts --lote recetario-pdf-lote-1 --revertir --ejecucion 52b1a39b-128b-403e-89cd-79e3f4c1c26b --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

- Devuelve primero las 3 líneas a `HIELO` y después las 4 celdas a sus valores previos.
- Se niega si alguna de las 4 recetas tiene registros posteriores al #581.
- Conviene ensayarla antes en una copia local restaurada (`--local`).
- Después de revertir, volver a aplicar exige regenerar el manifiesto.

Los informes de cada ejecución, las huellas y el procedimiento detallado se guardan **fuera del repo**, porque contienen el UUID del perfil, junto con el respaldo `0438Z`.
