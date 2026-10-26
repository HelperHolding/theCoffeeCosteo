# 22 · Propuesta: Fresh Sodas, hielo y agua de Cold brew

**Estado (2026-10-26): solo propuesta, para revisión.**
- No se escribió nada en producción y no hay escrituras preparadas: ni manifiestos ni ensayos.
- No cambia ninguna unidad de forma global.
- Cada lote necesita su propia aprobación. Que el script actual pueda ejecutarlo **no** significa que esté aprobado.

**Fuentes:**
- `RECETARIO OFICIAL 2026.pdf`. Las páginas se citan por su número dentro del PDF. Ver [21](21-RECETARIO-OFICIAL-COTEJO.md) §1.
- Lectura de producción en modo solo lectura, después del lote 2. Versiones leídas: Cold brew v30, Pink Lemonade v28, Passion fruit v25.

**Detalle de hielo:** [`22-usos-hielo.csv`](22-usos-hielo.csv) tiene los 79 usos de HIELO (41 recetas), con su ficha, clasificación y propuesta.

**Cómo leer este documento.** Se mantienen separados tres tipos de información:
- **Dato confirmado:** lo que dice el PDF o lo que hay hoy en Costeo, leído directamente.
- **Supuesto:** un factor que no documenta nadie, como una conversión (zumo frente a fruta, g frente a ml), un rendimiento o una presentación. Se marca como tal y requiere confirmación.
- **Escenario de costo:** un cálculo que combina datos y supuestos. Es ilustrativo y no es una propuesta de valores.

## 1. Resumen

| Tema | Dato confirmado (PDF y Costeo) | Supuesto o decisión pendiente | Escenario de costo |
|---|---|---|---|
| **Hielo** | El PDF pesa el hielo en g; Costeo guarda esos números como ml. 57 de 59 cantidades con ficha coinciden; las Fresh Sodas Grande difieren: 190 y 177 frente a **245 g** | **Cómo representar la unidad** (convención «g = ml» o insumo en gramos). Si el hielo se compra, su precio. Hay 20 usos sin ficha o sin el tamaño en su ficha | $0 mientras HIELO cueste $0 |
| **Agua de Cold brew** | Concentrado (p.9): 200 g de café + 280 g + 720 ml de agua → **1 L**. Bebida (p.27): 100 ml de concentrado + 100/150 ml de agua fría | Cómo registrar el consumo del concentrado en la receta (W1–W3) | $0 (AGUA cuesta $0) |
| **Fresh Sodas: cantidades** | Hielo Grande **245 g**. El PDF da 170/220 ml de **agua con gas**; Costeo tiene 170/232 ml de **tónica** | **Qué variante se costea:** la base con agua con gas o la personalización con tónica. Hasta decidirla, no se ajusta la cantidad | Ver §4.4 |
| **Fresh Sodas: conversiones** | PDF: preparado de fresa 30/**40** g; pulpa 60/**70** g; zumo 15/20 g + 1 rodaja | Rendimiento del preparado de fresa, densidad de la pulpa, zumo por limón y peso de la rodaja | Pink Lemonade Grande −$0.13; Passion fruit Grande −$2.40 a −$3.07; limón en §4.3 |
| **Fresh Sodas: presentación** | El PDF dice que la base es agua con gas; la tónica y el agua de filtro son personalizaciones «en la misma cantidad» | Marca, presentación, y si la botella se reutiliza (costo por ml) o va una por bebida | Según la variante, de −$0.57 a +$12.51 por bebida |

## 2. Hielo (41 recetas, 79 usos)

### 2.1 Qué dice el PDF y qué tiene Costeo

- **Insumo.** `HIELO` es un solo insumo, en **ml**, con costo **$0**.
- **Fichas.** Todas pesan el hielo en **gramos** y en báscula («tarar, añadir el hielo»).
- **Costeo.** Guarda los mismos números que el PDF, pero como ml. Es decir, la convención vigente es «1 g de hielo = 1 ml».

| Clasificación | Usos | Recetas |
|---|---|---|
| Coincide con el PDF (g guardados como ml) | 57 | 27 fichas, incluidas las variantes Iced Latte Large, Sora (3 registros) y los dos Protein Cold Foam de p.56 |
| **Difiere del PDF** | **2** | Fresh Soda Pink Lemonade Grande **190** y Passion fruit Grande **177**; las dos fichas dicen **245 g** (pp.43–44) |
| La ficha no tiene ese tamaño | 2 | Cold Drip V60 Grande 310 y V60 + Milk Grande 300; las fichas de pp.65–66 son de una porción |
| Sin ficha en el PDF | 18 | 4 combos con panadería, Gelato Frappé Chocolate y Horchai, Lemon Honey Coffee, Nutty Iced Latte (3 registros) |

**Por qué no conviene convertir a volumen.** 1 g de hielo ocupa ~1.09 ml como sólido, pero en el vaso hay aire entre los cubos. El PDF mide masa, así que pasar a «ml de volumen» sería una conversión que nadie documentó.

### 2.2 Alternativas de representación (decisión pendiente)

**La cantidad está confirmada; la representación no.** El dato del PDF (245 g en las Fresh Sodas Grande) está confirmado. Lo que falta decidir es cómo representar la unidad. Corregir las 2 celdas con la convención «g = ml» **consolida esa convención**, así que primero hay que elegir entre H1 y H2.

| Alternativa | Qué cambia | Costo | Riesgo y trabajo |
|---|---|---|---|
| H1: mantener la convención «g = ml» y corregir las 2 cantidades | Fresh Sodas Grande → 245 en el insumo `HIELO` (ml). La convención queda documentada | $0 | Bajo, pero formaliza «g = ml» como regla |
| H0: no tocar nada | Solo se documenta la convención | $0 | Las Fresh Sodas Grande siguen sin coincidir con su ficha |
| **H2:** insumo nuevo `HIELO (g)` y migración receta por receta | Insumo nuevo en `gr`, costo $0. En lotes, cada línea pasa de `HIELO` a `HIELO (g)` **sin cambiar el número**. El insumo `HIELO` no se modifica | $0 hoy | **Medio.** Hace falta un script nuevo (diseñado y probado en local; doc 23, PR aparte) |
| H3: convertir a ml de volumen (×1.09) | Los 79 números | $0 hoy | **No recomendado:** conversión no demostrada |

**Nota de bitácora (H2), corregida.** Cambiar el `insumo_id` de una línea **sí queda en la bitácora**: el trigger `receta_lineas_bitacora` registra el campo `insumo_id`, con los valores anterior y nuevo, la receta y el autor. También sube la versión de la receta. Una versión anterior de este documento decía lo contrario; se verificó en el esquema y en una copia restaurada. El diseño, el script y las pruebas de H2 van en un PR aparte (doc 23).

**Usos sin ficha o sin tamaño (20).** H2 los conserva en `HIELO` hasta verificarlos.

**Cuándo importa la unidad.** Mientras el hielo cueste $0, la unidad no altera ningún costo. Si se empieza a costear porque se compra en bolsa, la unidad pasa a importar. Por cada **$1/kg**:

| Hielo por bebida | 90 g | 130 g | 245 g | 312 g | 360 g |
|---|---|---|---|---|---|
| Costo | $0.09 | $0.13 | $0.25 | $0.31 | $0.36 |

**Confirmación necesaria (Operaciones/Compras):**
- ¿El hielo se compra o se produce? Si se compra: presentación (kg por bolsa) y precio.
- ¿Los combos, los Gelato Frappé, Lemon Honey Coffee, Nutty y los V60 Grande también se miden en gramos?

## 3. Agua de Cold brew

### 3.1 Datos confirmados (PDF)

- **Concentrado (p.9):** 200 g de café + 280 g de agua a 60 °C + 720 ml de agua filtrada → **1 L de concentrado**. El PDF documenta el rendimiento.
- **Consumo por bebida, según ese rendimiento:** los 100 ml de concentrado son 1/10 del lote. Equivalen a **20 g de café** (ya corregido en el lote 2) y **100 de agua** (28 g caliente + 72 ml filtrada). Es un reparto proporcional del lote, no una medición por bebida.
- **Bebida (p.27):** Regular lleva **100 ml de cold brew + 100 ml de agua fría + 130 g de hielo**. Grande lleva **100 ml de cold brew + 150 ml de agua fría + 245 g de hielo**.
- **Personalización:** la tónica o el agua mineral **sustituyen** los 100 ml de agua de filtro. No forman parte de la receta base.

### 3.2 Qué tiene Costeo (v30)

| Línea | Chica | Grande | Lectura |
|---|---|---|---|
| AGUA (orden 0) | 100 | 136 | Los 100 ml de concentrado, otra vez como agua; 136 = 100 × 600/440, un escalado que el PDF no sostiene |
| AGUA (orden 6) | 183.333 | 233.333 | 83.333 de agua del concentrado (con un rendimiento supuesto de 1.2 L) + 100/150 de dilución |
| CAFÉ BLACK | 20 | 20 | Correcto desde el lote 2 |
| HIELO | 130 | 245 | Coincide |

**Total de AGUA:** hoy 283.333/369.333; según el PDF, **200/250**.

### 3.3 Propuesta: registrar el consumo según el rendimiento documentado

Es una propuesta de **consumo de ingredientes**: cuánto de cada ingrediente del concentrado consume una bebida, según el rendimiento de p.9. No es una corrección mecánica de celdas. Primero hay que elegir la representación; las escrituras se preparan solo después de aprobarla.

| Alternativa | Consumo registrado | Costo | Comentario |
|---|---|---|---|
| **W1 (preferida):** dos líneas, cada una con un solo significado | Orden 0 = agua consumida por el concentrado **100/100** (la Grande pasa de 136 a 100). Orden 6 = dilución **100/150** (183.333 → 100 y 233.333 → 150) | $0 | 3 celdas. La receta queda legible y trazable al PDF |
| W2: una sola línea | Orden 0 → **0/0**; orden 6 → **200/250** | $0 | 4 celdas; deja una línea en cero |
| W3: subreceta «Cold Brew Concentrado» | Subreceta nueva (200 g de café + 1,000 ml de agua, rinde 1,000 ml). La bebida usa 100 ml de subreceta + agua 100/150 + hielo, y se quitan las líneas de café y agua del concentrado | $0 (el café se mantiene en $10.00 por bebida) | Estructural: crea una receta y cambia líneas. Hoy no hay script ni pruebas para eso. Facilita cambios futuros del concentrado |

En todas las alternativas, el costo de Cold brew se queda en **$14.50/$14.70**, y no cambian precios, márgenes ni alertas.

## 4. Fresh Sodas (pp.43–44)

**Tamaños.** El PDF dice Regular (440 ml) y Grande (600 ml); en Costeo son Chica y Grande. La API de Brasil mezcla tamaños en estas bebidas (E3 del doc 21), pero el PDF sí distingue los dos.

### 4.1 Datos confirmados

| Producto | Componente | Costeo hoy | PDF |
|---|---|---|---|
| Pink Lemonade y Passion fruit | Hielo | 130 / **190 y 177** «ml» | 130 / **245 g** |
| Pink Lemonade y Passion fruit | Base carbonatada | **Tónica** Schweppes 170/232 ml | **Agua con gas** 170/220 ml |
| Pink Lemonade y Passion fruit | Personalización | — | Tónica o agua de filtro, «agregar la misma cantidad» |
| Pink Lemonade | Fresa | 30/41 g de fresa congelada | 30/40 g de **preparado** de fresa |
| Pink Lemonade | Limón | 16/20 g de limón Eureka entero | 15/20 g de **zumo** de limón siciliano + 1 rodaja |
| Passion fruit | Pulpa | 60/82 **ml** | 60/70 **g** |

**Base carbonatada.** Costeo registra hoy la personalización (tónica) con una cantidad Grande (232) que no aparece en el PDF. **No se propone cambiar la tónica por agua con gas ni ajustar su cantidad** hasta definir qué variante se costea (§4.4).

**Hielo.** La corrección Grande → 245 depende de la representación de la unidad (§2.2).

### 4.2 Supuestos de conversión y rendimiento (requieren confirmación)

| Producto | Celda | Costeo | PDF | Supuesto que falta confirmar | Escenario de costo (si se aceptara el supuesto) |
|---|---|---|---|---|---|
| Pink Lemonade | FRESA, Grande | 41 g de fresa | **40 g de preparado** | Rendimiento del preparado (p.7: solo 500 g de fresa licuada, sin rendimiento ni merma). Costeo ya usa 1:1 en la Chica (30 = 30) | −$0.13 (con 1:1) |
| Passion fruit | PULPA, Grande | 82 ml | **70 g** | Densidad de la pulpa (el insumo está en ml). La Chica ya usa 60 g = 60 ml | −$2.40 con 1:1 (70 ml); −$3.07 con densidad 1.05 (66.7 ml) |
| Pink Lemonade | LIMÓN, Chica y Grande | 16/20 g de limón entero (Eureka) | **15/20 g de zumo** de limón **siciliano** + 1 rodaja | Zumo por limón, peso del limón y de la rodaja, y variedad. El PDF dice «exprime la mitad del limón», y la p.8 da 3 limones → 90 ml de zumo, sin peso | Ver 4.3 |

**Nota.** En la ficha de Pink Lemonade, la etiqueta inferior dice «15 ml zumo» y el texto dice «15 g». Es una diferencia menor.

### 4.3 Limón: escenario de sensibilidad (supuestos sin medir; no se propone un número)

- **Qué registra Costeo:** 16/20 g de limón entero, que a $0.052/g cuestan **$0.83/$1.04**.
- **Qué indica el PDF:** exprimir **medio limón** por bebida y añadir una rodaja del centro.
- **Ejemplo ilustrativo, no medido:** con un limón de 120 g, serían ~60 g + una rodaja de ~10 g, es decir ~70 g y **$3.64** (**+$2.81** en la Chica).
- **Regla rápida:** cada 10 g de limón son $0.52.

**Medición necesaria:** cuánto pesa en promedio el limón que se usa, cuánto zumo da medio limón y cuánto pesa la rodaja. Si se usa siciliano y no Eureka, también hace falta su precio.

### 4.4 Base carbonatada: qué variante se costea (decisión pendiente)

**Datos confirmados:**
- Costeo usa `SCHWEPPES AGUA TÓNICA 296 ML` ($0.0473/ml) con 170/232 ml.
- El PDF da como base **agua con gas** 170/220 ml. La tónica y el agua de filtro son personalizaciones «en la misma cantidad».
- Costeo no tiene agua con gas por ml. Existen `AGUA MINERAL TOPO CHICO 355 ML` y `TOPO CHICO AGUA MINERAL 355`, **dos registros duplicados**, en pieza ($20.55) y sin uso. También existe `AGUA MINERAL PERRIER 330 ML` ($19/pieza, usada en 1 receta).

**Decisión previa.** Hay que definir qué variante representa el costo del producto:
- la base del PDF (agua con gas);
- la personalización más vendida (tónica);
- un promedio ponderado por mezcla de ventas.

Mientras no se defina, **no se cambia el ingrediente ni la cantidad**.

**Escenarios por variante.** Son ilustrativos. Muestran el Δ frente a hoy, solo por la línea carbonatada y sin conversiones ni otros cambios. Los precios no cambian.

| Variante (supuesto) | Chica (170 ml) | Grande (220 ml) |
|---|---|---|
| V0: hoy (tónica 170/232) | $0 | $0 |
| VT: tónica como personalización, en la cantidad del PDF | $0 | −$0.57 |
| VG-ml: agua con gas por ml (Topo Chico $0.0579/ml, botella reutilizada) | +$1.80 | +$1.76 |
| VG-pza: agua con gas, 1 botella por bebida ($20.55) | +$12.51 | +$9.58 |

**Escenario combinado (ilustrativo).** Variante carbonatada más los supuestos de conversión de §4.2, con fresa y pulpa a 1:1. Muestra costo y food cost en Mostrador.

| Producto | Tamaño | Hoy | Conversiones 1:1 + V0 | + VT | + VG-ml | + VG-pza |
|---|---|---|---|---|---|---|
| Pink Lemonade | Chica | $17.42 · 23.5% | $17.42 · 23.5% | $17.42 · 23.5% | $19.22 · 25.9% | $29.93 · 40.4% |
| Pink Lemonade | Grande | $22.25 · 26.9% | $22.12 · 26.7% | $21.55 · 26.0% | $23.88 · 28.9% | $31.69 · 38.3% |
| Passion fruit | Chica | $24.54 · 35.1% | $24.54 · 35.1% | $24.54 · 35.1% | $26.34 · 37.7% | $37.05 · 53.1% |
| Passion fruit | Grande | $32.07 · 40.9% | $29.67 · 37.8% | $29.10 · 37.1% | $31.43 · 40.1% | $39.25 · 50.0% |

**Márgenes:** en Mostrador y Rappi bajan exactamente el Δ de costo, porque los precios no cambian ($86/$96 y $81/$91 en Mostrador). Por ejemplo, con VG-pza, Passion fruit Chica: Mostrador $45.29 → $32.78 y Rappi $38.89 → $26.38.

**Alertas:**
- La única alerta actual, «Markup sobre el tope» de Passion fruit en Rappi, depende del precio y no cambia.
- Ningún escenario deja el costo por encima de la venta neta.

**Para decidir hace falta:**
1. Qué variante se costea.
2. Si es agua con gas: marca, presentación, y si la botella abierta se reutiliza (costo por ml) o va una por bebida (costo por pieza).
3. Con esa respuesta, **crear un insumo por ml o documentar la conversión**. Es un alta en el catálogo y no cambia ninguna unidad existente.
4. Resolver el registro duplicado de Topo Chico.

## 5. Lotes candidatos (ninguno aprobado ni preparado)

| Lote | Contenido | Estado | Qué falta antes de preparar escrituras | Escenario de costo |
|---|---|---|---|---|
| **3a** | Hielo Grande de las Fresh Sodas: 190/177 → 245 g (PDF) | **Pendiente de resolver la representación de la unidad** | Elegir H1 (convención «g = ml») o H2 (insumo en gramos), §2.2 | $0 |
| **3b** | Agua de Cold brew: consumo de ingredientes según el rendimiento documentado (p.9), alternativa W1 | **Propuesta de consumo** | Aprobar el criterio de consumo y la representación (W1, W2 o W3), §3.3 | $0 |
| 3c | Base carbonatada de las Fresh Sodas | **Bloqueado** | Definir qué variante se costea; con agua con gas, también la presentación y el alta de un insumo por ml. Sin eso no se cambia ni el ingrediente ni la cantidad | Por variante, §4.4 |
| 3d | Fresa Grande y pulpa Grande | **Bloqueado** | Confirmar el rendimiento del preparado de fresa y la densidad de la pulpa | −$0.13 / −$2.40 a −$3.07 |
| 3e | Limón | **Bloqueado** | Medir el limón, el zumo y la rodaja, y definir la variedad y su precio | Por definir |
| — | Unidad del hielo (H2) | Opción de catálogo | Aprobación expresa. El diseño, el script y las pruebas locales van en un PR aparte (doc 23) | $0 hoy |

**Ejecutable no significa aprobado.** El script actual puede técnicamente aplicar 3a y 3b, pero eso no los aprueba. Cada lote se prepara solo después de su aprobación expresa, y entonces sigue el mismo procedimiento del lote 2:
1. Manifiesto con sha256 fijado y pruebas.
2. Respaldo verificado y dry-run con ROLLBACK.
3. Aplicación en transacciones separadas.
4. Verificación desde una conexión nueva y segundo ensayo.

**Orden si se aprueban 3b y H2.** Los dos son lotes independientes, pero Cold brew está en ambos. El orden definido es **3b → H2**: el manifiesto de H2 se regenera contra la versión vigente de Cold brew y se revisa su diff antes de registrarlo. El control de versión no se elimina. Detalle en los docs 23 (H2) y 24 (3b).

**Fuera de alcance:**
- el AGUA de 10 ml de Iced Chocolate (doc 21, posible duplicación con su subreceta);
- las personalizaciones con tónica o agua mineral en Cold brew;
- cualquier cambio global de unidades.

## 6. Preguntas mínimas para Operaciones/Compras (no enviadas)

Carlo decide si se envían y cuándo. Cada pregunta indica qué lote desbloquea.

| # | Para | Pregunta | Desbloquea |
|---|---|---|---|
| 1 | Operaciones | En Fresh Sodas, ¿qué base se costea: agua con gas (base del recetario) o tónica? Si varía, ¿qué proporción de ventas lleva cada una? | 3c |
| 2 | Compras | ¿Qué agua con gas se compra (marca y presentación) y a qué precio? ¿La botella abierta se usa en varias bebidas o va una por bebida? | 3c |
| 3 | Operaciones | ¿Cuántos gramos de preparado salen de 500 g de fresa congelada (p.7)? | 3d |
| 4 | Operaciones o Compras | La pulpa de maracuyá, ¿se mide en tienda en g o en ml? Si es en g, ¿cuántos g pesa 1 ml (o cuántos ml rinde el envase de 500 ml)? | 3d |
| 5 | Operaciones | Para Pink Lemonade: ¿qué limón se usa (siciliano o Eureka)? ¿Cuánto pesa en promedio, cuánto zumo da medio limón y cuánto pesa la rodaja? | 3e |
| 6 | Operaciones | Combos con panadería, Gelato Frappé, Lemon Honey Coffee, Nutty Iced Latte y V60 Grande: ¿el hielo de esas recetas está en gramos? ¿Los valores actuales son los vigentes? | Los 14 usos de hielo que H2 conserva |
| 7 | Compras | ¿El hielo se compra? Si es así: presentación (kg) y precio. Hoy cuesta $0 en Costeo, pero eso **no confirma** que sea gratuito | Costo y presentación reales del hielo |
