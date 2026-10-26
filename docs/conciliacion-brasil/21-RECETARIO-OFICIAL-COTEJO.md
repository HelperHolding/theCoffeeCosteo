# 21 · Recetario oficial ↔ recetas de Costeo: diagnóstico y primer lote (propuesta)

**Estado al 2026-10-26 20:35 UTC:**
- **El lote 1 está aplicado en producción**: 3 cantidades del Pumpkin Spice Frappé. Detalle en §8.
- Carlo confirmó que este PDF es el recetario vigente.
- **Los lotes 2–4 no se han aplicado:** cada uno requiere su propia aprobación.
- Fuera del lote 1, no se cambiaron recetas, cantidades, insumos, precios ni enlaces, y no se aplicaron migraciones.

**Detalle:**
- [`21-mapa-pdf-recetas.csv`](21-mapa-pdf-recetas.csv): mapa de fichas ↔ recetas.
- [`21-matriz-recetario.csv`](21-matriz-recetario.csv): matriz por producto, tamaño y componente, con 324 filas.
- [`21-PREGUNTAS-OPERACIONES-COMPRAS.md`](21-PREGUNTAS-OPERACIONES-COMPRAS.md): preguntas pendientes.

## 1. Fuente

| Dato | Valor |
|---|---|
| Archivo | `RECETARIO OFICIAL 2026.pdf`, entregado por Carlo; copia local fuera del repo |
| sha256 | `6a81e1a852cbc8e4ec661e82f573ac6d269d130122d4e3581142771650cc7da3` (24.4 MB) |
| Título | «Manual de Preparación de Bebidas y Alimentos — The Coffee México». **Mercado mexicano** (portada) |
| Edición | El nombre del archivo dice «2026»; el documento no tiene fecha ni número de edición |
| Páginas | 79; las páginas no llevan número impreso, así que se cita la página del PDF |
| Lectura | Texto extraído de las 79 páginas, en orden de diseño y en orden de contenido (`-raw`). El orden de contenido separa las columnas Regular y Grande, que en el diseño se mezclan. Las fichas de alimentos se leyeron completas como texto; no dependen de imágenes |
| Límite | No se pudo **renderizar** páginas en esta máquina: no hay renderizador instalado, y un intento de instalar uno se descartó al instalar paquetes inesperados. Las cantidades salen del texto del PDF, **no de OCR**. Se recomienda que una persona revise visualmente las páginas 25, 28, 43, 62 y 78 antes de aplicar cambios de esas fichas |

**Contenido:**
- 11 preparados (pp. 3–12);
- 47 fichas de bebidas (pp. 14–66), en las secciones Puristas, De autor, Temporada, Fresh Soda, Gelato, Frappé y Métodos;
- 9 fichas de alimentos (pp. 70–78);
- portadas e índices (pp. 1, 2, 13, 29, 42, 45, 49, 55, 63, 67–69, 79).

El índice de alimentos (p.69) menciona Pan de muerto, Pan de muerto - Naranja y Sablé au chocolat, pero **esas fichas no están** en el PDF.

**Erratas registradas sin elegir una forma:**
- «Pumkin» por Pumpkin (pp.60–62);
- «Gelatto» y «Gelato» (pp.45–48);
- «36 de de preparado» (p.34);
- «ARMAZENAMENTO / Validade», en portugués (p.11);
- «Maracuya» sin tilde (p.44).

## 2. Autoridad de cada fuente

| Fuente | Qué decide | Qué no decide |
|---|---|---|
| API del POS | Identidad comercial observada: nombres, códigos, importes y personalizaciones | Composición. Los «customs» de un pedido no son ingredientes base |
| PDF | Composición y preparación por variante y tamaño | Costos, presentaciones de compra ni qué registro de Costeo es el vigente |
| Compras | Costo, presentación y unidad de cada insumo | — |
| Operaciones | Equivalencias, contradicciones del PDF y producto vigente | — |

Un enlace SKU confirmado ayuda a ubicar la receta, pero **no demuestra que su composición sea correcta**. **No se reasignó ninguno de los 62 enlaces.**

## 3. Inventario cotejado (solo lectura, producción, 2026-10-26)

Se leyeron 160 recetas (154 productos y 6 subrecetas), 215 precios de lista por tamaño, 890 líneas, 1,199 cantidades, 164 insumos y los 62 enlaces POS. No se leyeron perfiles ni datos personales.

**Cobertura:**
- las 65 fichas con ingredientes se ligan a **64 productos y 5 de las 6 subrecetas**;
- **90 productos no tienen ficha**: panadería comprada en pieza, merchandising, aguas, combos y bebidas que no están en el recetario (Nutty, Pink Iced Latte, Iced Mocha, Lemon Honey Coffee, Cool Break, Affogato, Gelato Frappé Chocolate/Horchai/Mocha), además de Brownies, Chicken Wrap y Wrap de Pollo.

**Identidad de cada ficha** (detalle en el mapa):

| Identidad | Fichas |
|---|---|
| Confirmada (nombre y composición) | 28 |
| Confirmada por composición o proporción (traducción, orden de palabras, errata, 5 preparados) | 19 |
| Confirmada con una candidata adicional | 1: Urban Chocolat (Urban Chocolate queda candidata, O1) |
| Candidata fuerte | 1: Frappé Pumkin Spice |
| Candidata | 6: los 3 V60, Matcha Iced Latte Protein Cold Foam, Fresh Soda Maracuyá y Focaccia de Jamón y Pesto (que en Costeo es una pieza comprada) |
| Ambigua | 4: Sándwich de Queso (2 recetas), Sándwich J&Q con tomate (2), Iced Latte Protein Cold Foam (2) y AÇAÍ BOWL (Acai Cup / Açaí Bowl) |
| Sin receta local | 6: Pure Black Single, Aderezo de Chipotle, Cold Brew Concentrado, y fresa, limón y maracuyá, que se registran en línea en cada bebida |

**Subrecetas:** las de matcha, chai, chocolate y Sora coinciden con las **proporciones** del PDF.
- Su rendimiento se modela como la suma de las masas, sin merma, y el PDF no lo documenta (el chai se cuela dos veces).
- La subreceta de chocolate (2) es el preparado de la p.5 más los 10 ml de agua de dilución por porción. Las proporciones son idénticas, así que se deduce su composición.

**Antes de proponer cualquier cambio a una subreceta compartida**, hay que considerar todos sus dependientes:

| Subreceta | Productos que la usan |
|---|---|
| Matcha | 7 |
| Chai | 4 |
| Chocolate (1) | 10 |
| Chocolate (2) | 3 |
| Sora | 3 |

## 4. Resultado de la matriz (52 recetas, 324 filas producto × tamaño × componente)

| Estado | Filas | Significado |
|---|---|---|
| Coincide | 203 | Misma unidad y misma cantidad |
| Coincide con supuesto | 92 | Coincide si se acepta una conversión no documentada: g ↔ ml, hielo en ml, rendimiento = suma de masas, preparado de fresa 1:1 o 1 pza = 100 g |
| Coincide (ausente en ambos) | 3 | Urban Chocolat sin vainilla, etc. |
| **Discrepancia** | **9** | Cold brew (2), Urban Chocolate Grande vainilla (1), Pumpkin Spice Frappé (3), Açaí Bowl (3) |
| **Discrepancia con supuesto** | **9** | Iced Chocolate agua (2), Fresh Soda Pink Lemonade (4), Fresh Soda Passion fruit (3) |
| Falta en Costeo | 2 | Açaí Bowl: crema de maní y plátano |
| Sin cantidad comparable | 6 | Brioche en rebanadas vs trenza (3), 3 tomates cherry en piezas, orégano y sal «una pizca» |

**En resumen:** la mayor parte de lo cotejado ya coincide con el recetario. **Hoy solo una corrección es verificable sin ambigüedad.** El resto requiere una conversión documentada, resolver una contradicción o confirmar la identidad.

## 5. Casos conocidos

- **Urban Chocolate / Urban Chocolat (p.34).**
  - La ficha «Urban Chocolat» no lleva vainilla en ninguna medida: Regular 36 g de preparado + 10 ml de agua + 170 ml de leche; Grande igual, con 250 ml de leche.
  - «Urban Chocolat» (`77aed410…`) coincide exactamente.
  - «Urban Chocolate» (`2c8b49a6…`, el que tiene precio de Grande) lleva **10 ml de vainilla en Grande**.
  - El PDF es **evidencia contra** esa vainilla, pero el PDF trae una sola ficha con el nombre «Chocolat» y la pregunta O1 de `18` sigue abierta. **No se propone quitarla ni desactivar ningún registro** hasta que Operaciones confirme qué producto es el vigente y si la vainilla aplica.
- **Brownie with ice cream / com sorvete.**
  - **El PDF no tiene ficha de Brownie**, así que no aporta evidencia.
  - Ambas recetas son idénticas: 1 pieza de BROWNIE + 80 g de helado. Eso sostiene la duplicidad técnica, pero no decide qué UUID representa el producto vigente.
  - Sigue siendo una decisión de negocio (O2 de `18`). **BRICE sigue bloqueado.**
- **Tamaños.** Los volúmenes del PDF son nominales:
  - calientes: Regular 240 ml, Grande **360 ml**;
  - fríos: Regular 440 ml, Grande 600 ml.

  La API usa 355 ml para el Grande caliente (HOTLARAPP), y los vasos de Costeo son de 8, 12, 14 y 20 oz. La diferencia 355/360 se mantiene documentada. **La correspondencia Chica = Regular y Grande = Large se verificó receta por receta**: en las 52 recetas cotejadas, las demás cantidades de cada tamaño coinciden con la columna del PDF. No se traslada nada de los tamaños de Rappi.
- **Gelato Frappé (pp.46–48).**
  - El PDF documenta Regular (150 g de helado / 100 ml de leche) **y Grande** (200 g / 140 ml).
  - Costeo solo tiene «Único», que coincide con Regular.
  - **No se agrega Grande**: eso es la decisión E4.
  - Gelato Chocolate, Horchai y Mocha no tienen ficha.
- **Combos.** No tienen ficha. Hay una incoherencia interna: «True White + Croissant Serrano & Gouda» usa mozzarella, crema y 2.5 pza de serrano, mientras que el croissant suelto usa 30 g de gouda y 0.25 pza. Va a Operaciones; no se toca.
- **Productos nuevos.** Pan de muerto y Sablé solo aparecen en el índice. Cookie Matcha y Espresso Tonic no aparecen. **El PDF no alcanza para costearlos** (F1–F3 siguen pendientes).
- **Alias Pumpkin y Frap/Frappé.** Las fichas del PDF («Pumkin Spice Latte / Iced Latte», «Frappé Coffee / Salted Caramel / Matcha / Chai / Taro») **coinciden en composición** con las recetas candidatas de Costeo. Es evidencia adicional para D1–D8, pero **no aprueba la identidad** con el código POS: los alias siguen pendientes de Operaciones (O4).

## 6. Lotes propuestos

### Lote 1: verificable sin ambigüedad (propuesto para aprobación)

**Pumpkin Spice Frappé** (`7769fb2e-d7ac-46b6-abeb-e23634d40bd5`, versión 29) ↔ ficha «Frappé Pumkin Spice», PDF p.62.

- **Por qué la identidad es fuerte:** 7 de los 10 valores son idénticos (café 18 g, base 40/50 g, creamer Regular 45 ml, hielo 250/360).
- **Unidades:** las cantidades a corregir están en la misma unidad (ml ↔ ml).
- **Tamaños:** el vaso de 14 oz corresponde a Regular y el de 20 oz a Grande.

| Línea (insumo) | Tamaño | Valor actual | Valor nuevo | Fuente |
|---|---|---|---|---|
| LECHE ENTERA | Chica | 30 ml | **35 ml** | p.62, Regular (440 ml) |
| LECHE ENTERA | Grande | 55 ml | **70 ml** | p.62, Grande (600 ml) |
| CHOBANI D.CREAMER PUMPKIN SPICE | Grande | 55 ml | **50 ml** | p.62, Grande (600 ml) |

**Simulación completa** con el motor existente (vistas `v_costo_producto`, `v_resumen` y `v_alerta_producto_canal`), en la copia local aislada del respaldo de producción del 2026-10-26 17:26 UTC, con ROLLBACK:

| Tamaño | Costo antes → después | Food cost (Mostrador) | Margen Mostrador / App | Margen Rappi |
|---|---|---|---|---|
| Chica | $30.58 → **$30.69** (+$0.11) | 35.8% → 36.0% | $54.76 → $54.65 | $47.17 → $47.06 |
| Grande | $35.57 → **$34.62** (−$0.94) | 37.9% → 36.9% | $58.40 → $59.34 | $41.50 → $42.45 |

- **Precios de venta:** sin cambio ($99 / $109; Rappi $123 / $122).
- **Alertas:** las mismas 3 antes y después.
- **Dependientes:** ninguno.
- **Costo de insumos:** no se toca. El costo cambia **solo** por las cantidades.

**Antes de aplicar, Carlo debe confirmar** que la ficha «Frappé Pumkin Spice» corresponde a este producto (pregunta P1). Es un producto de temporada.

### Lote 2: requiere confirmar una equivalencia o conversión

| Receta | Cambio posible | Falta | Efecto por porción (provisional) |
|---|---|---|---|
| Cold brew (`00f47aba…`) | Café 16.67 → 20 g en Chica y Grande | Confirmar que el concentrado **rinde 1 L** (p.9) y no 1.2 L | +$1.67 (cálculo provisional) |
| Iced Chocolate (`c55e8b1f…`) | Quitar la línea AGUA de 10 ml, que duplica la dilución incluida en la subreceta (2) | Confirmar la composición de la subreceta (2) | $0 (AGUA cuesta $0) |
| Fresh Soda Pink Lemonade (`e5b9dc6b…`) | Grande: fresa 41 → 40 g, hielo 190 → 245, agua 232 → 220 | ¿Agua con gas o tónica? Zumo de limón en g ↔ limón entero | −$0.70 (provisional, depende del agua) |
| Fresh Soda Passion fruit (`6465a09a…`) | Grande: pulpa 82 → 70, hielo 177 → 245, agua 232 → 220 | Pulpa en g vs ml (densidad); agua con gas o tónica | −$2.97 (provisional) |
| Grilled Ham Cheese and Tomato Sandwich (`ff0a88ca…`) | Tomate cherry 3 g → 3 piezas en g | Peso por tomate | Depende del peso |
| Grilled Cheese / Ham & Cheese / Tomato | Brioche 0.25 trenza = 2 rebanadas | Rebanadas por trenza | — |

### Lote 3: contradicciones entre PDF, API y base

| Caso | Contradicción |
|---|---|
| **Açaí Bowl / Acai Cup (p.78)** | La ficha se titula «AÇAÍ BOWL», pero su composición (plátano, crema de maní, fresa 30 g) es **la de «Acai Cup»**. «Açaí Bowl» (POS ACABOWAPP, ligado en el lote 1 SKU) tiene blueberries, miel y 15 g de fresa. Además, las observaciones mencionan leche condensada que no está en los ingredientes. **El enlace no se toca** |
| **Macchiato (p.25)** | 170 ml de leche vaporizada, pero solo se sirven 40 ml. ¿El costo debe incluir 170 ml? (130 ml ≈ $2.86) |
| **Preparado de chai (p.4)** | 400 ml de agua en los ingredientes y 200 + 200 ml en los pasos. Costeo usa 400; es coherente con la suma de los pasos, pero el paso 1 dice 200 |
| **Chai Iced Latte (p.28)** | Regular: «170 ml de **agua**»; los pasos y la Grande dicen leche. Costeo usa leche. No se propone cambio |
| **Ristretto (p.15)** | 22 ml en ingredientes y 27 ml en el título; el costo no cambia |
| **Urban Chocolate Grande** | Vainilla sí o no; ver §5 |
| **Duplicados con la misma composición** | Sándwich de Queso (Grilled Cheese / Queijo Quente), Sándwich con tomate (Grilled Ham Cheese and Tomato / Misto + Tomate Cereja), Protein Cold Foam (Isopure Iced Latte / Iced Latte Protein Cold Foam), Sora (3 registros), Brownie (2) |
| **Combo True White + Croissant Serrano & Gouda** | Composición distinta de la del croissant suelto |

### Lote 4: información insuficiente

- **Grandes sin ficha:** Gelato Grande (E4, el PDF sí la trae, pero no hay tamaño en Costeo), V60 con hielo Grande (E2, el PDF solo da 1 porción) y combos (E5).
- **Sin ficha:** Brownies, Pan de muerto, Sablé, Cookie Matcha, Espresso Tonic y Gelato Chocolate/Horchai/Mocha.
- **Focaccia de Jamón y Pesto:** en Costeo es una pieza comprada; no hay insumos de pesto, arúgula ni aceite.
- **Aderezo de Chipotle:** no hay mayonesa, chipotle ni pimienta como insumos.
- **Costos de insumos** que solo Compras puede dar (K1–K4 de `21-PREGUNTAS…`).

## 7. Procedimiento propuesto para aplicar el lote 1 (no ejecutado)

**Vía de escritura.**
- **La RPC `guardar_receta` existe**, pero reemplaza la receta completa: borra y vuelve a crear **todas** las cantidades. Para tres valores eso generaría decenas de registros de bitácora y obligaría a reenviar la receta entera.
- **Se propone** un script con el mismo patrón que `enlaces-pos` y `renombres-b`, que haga `UPDATE linea_cantidades` **solo** en las celdas aprobadas.
- Así se conservan los UUID de receta, línea e insumo.
- El trigger `versionar_componentes_receta` sube la versión y `registrar_bitacora` deja **un registro por celda**: campo `cantidad`, anterior y nuevo, con el `receta_id` resuelto por la línea. El origen es `carga_masiva`, el autor el `--usuario` y la nota «Recetario oficial, lote 1».
- No se introduce ninguna tabla nueva.

**Garantías:**
1. **Manifiesto aprobado** con huella fijada en el código. Declara las 3 celdas exactas: receta, línea, insumo, tamaño, **valor previo**, valor nuevo, fuente y página.
2. **Perfil:** `--usuario` obligatorio también en el ensayo (perfil activo de operaciones o admin), y destino validado con el parser.
3. **Una transacción** REPEATABLE READ, con `SELECT … FOR UPDATE` de la receta.
4. **Bloqueo optimista:** la versión debe ser la del manifiesto (29) y cada celda debe tener exactamente su valor previo. Si alguien la editó, **se detiene sin tocar nada**.
5. **Sin efectos colaterales:**
   - solo cambian esas 3 celdas;
   - la versión sube lo esperado;
   - la bitácora propia tiene exactamente 3 registros;
   - precios y costos de insumos quedan intactos (huellas);
   - los 62 enlaces POS quedan intactos.
6. **Cierre verificado** (`cierre.ts`). Si el COMMIT queda incierto, se comprueba el estado desde otra conexión antes de reintentar.

**Secuencia, cada paso con aprobación:**
1. Respaldo lógico restaurado y verificado.
2. Ensayo local sobre la copia restaurada.
3. Dry-run remoto con ROLLBACK.
4. Revisión del informe.
5. Aplicación.
6. Segundo ensayo: 3 «sin cambio» y 0 registros de bitácora.
7. Verificación de costos en `v_resumen` contra la simulación.

**Reversión:** se restaura el valor previo **solo** en las celdas cuyo valor actual siga siendo el que dejó la ejecución, verificado contra su bitácora. Si hubo ediciones posteriores, se detiene. Nunca se reemplaza la receta completa.

**Antes de implementar el script hace falta tu aprobación** de este diagnóstico, del lote 1 y de la vía de escritura.

## 8. Cierre del lote 1 (2026-10-26)

### Autorizaciones y fuente

- **Aprobación del diagnóstico:** Carlo aprobó el diagnóstico, el lote 1 y la vía de UPDATE dirigido con manifiesto.
- **Confirmación de la fuente:** antes de aplicar, Carlo confirmó que el PDF «RECETARIO OFICIAL 2026» es el recetario vigente (equivale a P1). Una revisión visual independiente de la p.62 confirmó las tres cantidades.
- **Código:** script `scripts/conciliacion/recetas-correcciones.ts` (PR #28, merge `6953adc`). Manifiesto aprobado `21-lote-1-recetas.manifiesto.json`.

### Secuencia

| Paso | Resultado |
|---|---|
| Respaldo lógico privado (20:26 UTC) | Restaurado en una copia local aislada y comparado con producción: contenido idéntico (72 tablas, 19,597 filas), políticas y funciones sin diferencias |
| Dry-run remoto con ROLLBACK (20:28 UTC) | 3 cantidades cambiadas, 0 problemas, 3 registros propios en la bitácora, resto sin cambios. Una conexión nueva confirmó que no persistió nada |
| Revalidación (20:34 UTC) | Versión 29, valores previos 30/55/55, perfil admin activo. La bitácora no había cambiado desde el respaldo, así que el respaldo seguía vigente |
| **Aplicación (20:35 UTC)** | **COMMIT** confirmado, versión 29 → 32 |
| Segundo ensayo | 3 «sin cambio», 0 registros en la bitácora, ROLLBACK, y el estado quedó idéntico |

### Resultado (verificado con una conexión nueva)

| Cantidad | Antes | Después |
|---|---|---|
| LECHE ENTERA, Chica | 30 ml | **35 ml** |
| LECHE ENTERA, Grande | 55 ml | **70 ml** |
| CHOBANI D.CREAMER PUMPKIN SPICE, Grande | 55 ml | **50 ml** |

- **Autoría:** el perfil de Carlo quedó en `updated_by` y en la bitácora. La bitácora sumó exactamente 3 registros (`linea_cantidades`, campo `cantidad`, `carga_masiva`), con la nota de la ejecución.
- **Costos recalculados** con `v_resumen`, iguales a la simulación de §6:

| Tamaño | Costo | Food cost (Mostrador) | Margen Mostrador / App | Margen Rappi |
|---|---|---|---|---|
| Chica | $30.58 → $30.69 | 35.8% → 36.0% | $54.76 → $54.65 | $47.17 → $47.06 |
| Grande | $35.57 → $34.62 | 37.9% → 36.9% | $58.40 → $59.34 | $41.50 → $42.45 |

**Sin cambios:**
- precios de venta: $99 y $109; en Rappi, $123 y $122;
- alertas: 3 antes y 3 después;
- huellas idénticas: precios de lista, precios manuales, insumos, líneas, los 62 enlaces POS, parámetros, canales, perfiles, las demás recetas y sus cantidades, y las demás cantidades de esta receta;
- última migración: la 22.

### Reversión (solo con aprobación)

- **Ejecución:** `d9dadc19-ed92-4808-8227-561eedd8993e`.
- **Qué restaura:** solo estas 3 cantidades. Si la receta tuvo ediciones posteriores, se detiene.
- **Comando:**

  ```
  npx tsx scripts/conciliacion/recetas-correcciones-aplicar.ts --revertir --ejecucion d9dadc19-ed92-4808-8227-561eedd8993e --confirmo jpqkmnfjwzniptszjuli --usuario <uuid>
  ```

- **Archivos privados:** los informes de ejecución y el respaldo se guardan fuera del repo. No forman parte de este documento.

La autorización cubrió **solo** estas tres correcciones.
