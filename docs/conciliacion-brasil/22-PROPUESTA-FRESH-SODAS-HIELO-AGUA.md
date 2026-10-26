# 22 · Propuesta: Fresh Sodas, hielo y agua de Cold brew

**Estado (2026-10-26): solo propuesta.**
- No se escribió nada en producción.
- No cambia ninguna unidad de forma global.
- Cada cambio necesita su propia aprobación.

**Fuentes:**
- `RECETARIO OFICIAL 2026.pdf`. Las páginas se citan por su número dentro del PDF. Ver [21](21-RECETARIO-OFICIAL-COTEJO.md) §1.
- Lectura de producción en modo solo lectura, después del lote 2. Versiones leídas: Cold brew v30, Pink Lemonade v28, Passion fruit v25.

**Detalle de hielo:** [`22-usos-hielo.csv`](22-usos-hielo.csv) tiene los 79 usos de HIELO (41 recetas), con su ficha, clasificación y propuesta.

**Cómo leer este documento.** Cada cambio cae en una de tres categorías:
- **Demostrado:** el PDF da la cantidad en la misma unidad, o con la convención que Costeo ya usa en el resto del recetario (gramos de hielo guardados como ml).
- **Conversión o rendimiento:** el PDF da otra magnitud (zumo frente a fruta, g frente a ml, preparado frente a fruta) y falta un factor.
- **Presentación:** depende de qué se compra y cómo se usa (marca, pieza o ml).

## 1. Resumen

| Tema | Demostrado por el PDF | Requiere confirmación | Efecto en costo |
|---|---|---|---|
| **Hielo** | 57 de 59 cantidades con ficha ya coinciden. 2 difieren: Fresh Sodas Grande 190 y 177 → **245** | Unidad del insumo (g frente a ml); si el hielo se compra, su precio. 18 usos no tienen ficha y 2 no tienen el tamaño en su ficha | **$0** (HIELO cuesta $0) |
| **Agua de Cold brew** | 100 ml de concentrado + 100/150 ml de agua fría; el concentrado usa 1,000 de agua por 1 L | Nada para las cantidades. Hay que elegir cómo representarlo | **$0** (AGUA cuesta $0) |
| **Fresh Sodas: cantidades** | Agua con gas Grande 232 → **220 ml**; hielo Grande → 245 | — | Grande −$0.57 cada una (si sigue la tónica) |
| **Fresh Sodas: conversiones** | Preparado de fresa 30/**40** g; pulpa 60/**70** g; zumo 15/20 g | Rendimiento del preparado de fresa, densidad de la pulpa, zumo por limón y peso de la rodaja | Pink Lemonade Grande −$0.13; Passion fruit Grande −$2.40 a −$3.07; limón: ver §4.3 |
| **Fresh Sodas: presentación** | La base es **agua con gas**; la tónica y el agua de filtro son personalizaciones | Marca, presentación, y si la botella se reutiliza (costo por ml) o va una por bebida | De −$0.64 a +$12.51 por bebida, según la opción |

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

### 2.2 Alternativas

| Alternativa | Qué cambia | Costo | Riesgo y trabajo |
|---|---|---|---|
| **H1 (recomendada ahora):** corregir solo las 2 cantidades demostradas | Fresh Sodas Grande → 245, con el script existente (UPDATE dirigido con manifiesto y bitácora). La convención «g = ml» se documenta | $0 | Bajo; ya existe la herramienta |
| H0: no tocar nada | Solo se documenta la convención | $0 | Las Fresh Sodas Grande siguen sin coincidir con su ficha |
| **H2:** insumo nuevo `HIELO (g)` y migración receta por receta | Insumo nuevo en `gr`, costo $0. En lotes, cada línea pasa de `HIELO` a `HIELO (g)` **sin cambiar el número**. El insumo `HIELO` no se modifica | $0 hoy | **Medio.** Ver la nota de bitácora y la decisión sobre usos sin ficha |
| H3: convertir a ml de volumen (×1.09) | Los 79 números | $0 hoy | **No recomendado:** conversión no demostrada |

**Nota de bitácora (H2).** Cambiar el `insumo_id` de una línea sube la versión de la receta, pero **no deja registro en `bitacora`**, que solo audita `linea_cantidades`. H2 necesitaría una de estas dos cosas:
- un script nuevo que registre el cambio de forma explícita;
- dar de baja la línea y crear una nueva, con lo que sí quedan registros de baja y alta.

En los dos casos hacen falta pruebas nuevas. Además, falta decidir los 20 usos sin ficha o sin tamaño: ¿se asume que también son gramos?

**Cuándo importa la unidad.** Mientras el hielo cueste $0, la unidad no altera ningún costo. Si se empieza a costear porque se compra en bolsa, la unidad pasa a importar. Por cada **$1/kg**:

| Hielo por bebida | 90 g | 130 g | 245 g | 312 g | 360 g |
|---|---|---|---|---|---|
| Costo | $0.09 | $0.13 | $0.25 | $0.31 | $0.36 |

**Confirmación necesaria (Operaciones/Compras):**
- ¿El hielo se compra o se produce? Si se compra: presentación (kg por bolsa) y precio.
- ¿Los combos, los Gelato Frappé, Lemon Honey Coffee, Nutty y los V60 Grande también se miden en gramos?

## 3. Agua de Cold brew

### 3.1 Qué demuestra el PDF

- **Concentrado (p.9):** 200 g de café + 280 g de agua a 60 °C + 720 ml de agua filtrada → **1 L de concentrado**. Son 1,000 de agua por 1,000 ml de concentrado: cada **100 ml de concentrado equivalen a 100 ml de agua** (y a 20 g de café, ya corregido en el lote 2).
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

### 3.3 Alternativas

| Alternativa | Celdas | Costo | Comentario |
|---|---|---|---|
| **W1 (recomendada):** dos líneas, cada una con un solo significado | Orden 0 = agua del concentrado **100/100** (cambia la Grande: 136 → 100). Orden 6 = dilución **100/150** (183.333 → 100 y 233.333 → 150) | $0 | 3 celdas, con el script existente. La receta queda legible y trazable al PDF |
| W2: una sola línea | Orden 0 → **0/0**; orden 6 → **200/250** | $0 | 4 celdas; deja una línea en cero |
| W3: subreceta «Cold Brew Concentrado» | Subreceta nueva (200 g de café + 1,000 ml de agua, rinde 1,000 ml). La bebida usa 100 ml de subreceta + agua 100/150 + hielo, y se quitan las líneas de café y agua del concentrado | $0 (el café se mantiene en $10.00 por bebida) | Estructural: crea una receta y cambia líneas. Hoy no hay script ni pruebas para eso. Facilita cambios futuros del concentrado |

En todas las alternativas, el costo de Cold brew se queda en **$14.50/$14.70**, y no cambian precios, márgenes ni alertas.

## 4. Fresh Sodas (pp.43–44)

**Tamaños.** El PDF dice Regular (440 ml) y Grande (600 ml); en Costeo son Chica y Grande. La API de Brasil mezcla tamaños en estas bebidas (E3 del doc 21), pero el PDF sí distingue los dos.

### 4.1 Cantidades demostradas (misma unidad o convención vigente)

| Producto | Celda | Costeo | PDF | Δ costo |
|---|---|---|---|---|
| Pink Lemonade | HIELO, Grande | 190 | **245 g** | $0 |
| Passion fruit | HIELO, Grande | 177 | **245 g** | $0 |
| Pink Lemonade | agua con gas, Grande | 232 ml (tónica) | **220 ml** | −$0.57 si sigue la tónica |
| Passion fruit | agua con gas, Grande | 232 ml (tónica) | **220 ml** | −$0.57 si sigue la tónica |

Las Chicas ya coinciden: hielo 130 y agua con gas 170.

**Sobre la cantidad de agua con gas.** Está demostrada, pero el **ingrediente** no lo está (ver 4.4). Se recomienda aplicar 232 → 220 junto con la decisión sobre el ingrediente, para no tocar la misma línea dos veces.

### 4.2 Conversiones y rendimientos (requieren confirmación)

| Producto | Celda | Costeo | PDF | Qué falta | Δ costo con la convención actual |
|---|---|---|---|---|---|
| Pink Lemonade | FRESA, Grande | 41 g de fresa | **40 g de preparado** | Rendimiento del preparado (p.7: solo 500 g de fresa licuada, sin rendimiento ni merma). Costeo ya usa 1:1 en la Chica (30 = 30) | −$0.13 (con 1:1) |
| Passion fruit | PULPA, Grande | 82 ml | **70 g** | Densidad de la pulpa (el insumo está en ml). La Chica ya usa 60 g = 60 ml | −$2.40 con 1:1 (70 ml); −$3.07 con densidad 1.05 (66.7 ml) |
| Pink Lemonade | LIMÓN, Chica y Grande | 16/20 g de limón entero (Eureka) | **15/20 g de zumo** de limón **siciliano** + 1 rodaja | Zumo por limón, peso del limón y de la rodaja, y variedad. El PDF dice «exprime la mitad del limón», y la p.8 da 3 limones → 90 ml de zumo, sin peso | Ver 4.3 |

**Nota.** En la ficha de Pink Lemonade, la etiqueta inferior dice «15 ml zumo» y el texto dice «15 g». Es una diferencia menor.

### 4.3 Limón: sensibilidad (sin propuesta de número)

- **Qué registra Costeo:** 16/20 g de limón entero, que a $0.052/g cuestan **$0.83/$1.04**.
- **Qué indica el PDF:** exprimir **medio limón** por bebida y añadir una rodaja del centro.
- **Ejemplo ilustrativo, no medido:** con un limón de 120 g, serían ~60 g + una rodaja de ~10 g, es decir ~70 g y **$3.64** (**+$2.81** en la Chica).
- **Regla rápida:** cada 10 g de limón son $0.52.

**Medición necesaria:** cuánto pesa en promedio el limón que se usa, cuánto zumo da medio limón y cuánto pesa la rodaja. Si se usa siciliano y no Eureka, también hace falta su precio.

### 4.4 Agua con gas: presentación (requiere confirmación)

**Situación actual:**
- Costeo usa `SCHWEPPES AGUA TÓNICA 296 ML` ($0.0473/ml) como base, pero en el PDF la tónica es una **personalización**.
- Costeo no tiene agua con gas por ml. Existen `AGUA MINERAL TOPO CHICO 355 ML` y `TOPO CHICO AGUA MINERAL 355`, **dos registros duplicados**, en pieza y sin uso; también `AGUA MINERAL PERRIER 330 ML` ($19/pieza, usada en 1 receta).

**Escenarios.** Son acumulativos sobre 4.1 y 4.2, con la fresa y la pulpa a 1:1. Los precios no cambian.

| Producto | Tamaño | Hoy | A: cantidades PDF, sigue la tónica | B: A + conversiones | C: B + agua con gas por ml (Topo Chico, $0.0579/ml, botella reutilizada) | D: B + 1 botella por bebida ($20.55) |
|---|---|---|---|---|---|---|
| Pink Lemonade | Chica | $17.42 | $17.42 | $17.42 | **$19.22** (+1.80) | $29.93 (+12.51) |
| Pink Lemonade | Grande | $22.25 | $21.68 | $21.55 | **$23.88** (+1.63) | $31.69 (+9.44) |
| Passion fruit | Chica | $24.54 | $24.54 | $24.54 | **$26.34** (+1.80) | $37.05 (+12.51) |
| Passion fruit | Grande | $32.07 | $31.50 | $29.10 | **$31.43** (−0.64) | $39.25 (+7.18) |

**Food cost en Mostrador:**

| Producto | Tamaño | Hoy | A | B | C | D |
|---|---|---|---|---|---|---|
| Pink Lemonade | Chica | 23.5% | 23.5% | 23.5% | 25.9% | 40.4% |
| Pink Lemonade | Grande | 26.9% | 26.2% | 26.0% | 28.9% | 38.3% |
| Passion fruit | Chica | 35.1% | 35.1% | 35.1% | 37.7% | 53.1% |
| Passion fruit | Grande | 40.9% | 40.2% | 37.1% | 40.1% | 50.0% |

**Márgenes:** en Mostrador y Rappi bajan exactamente el Δ de costo, porque los precios no cambian ($86/$96 y $81/$91 en Mostrador). Por ejemplo, Passion fruit Chica en D: Mostrador $45.29 → $32.78 y Rappi $38.89 → $26.38.

**Alertas:**
- La única alerta actual, «Markup sobre el tope» de Passion fruit en Rappi, depende del precio y no cambia.
- Ningún escenario deja el costo por encima de la venta neta.
- D deja a Passion fruit Chica con un food cost de 53.1%.

**Para elegir la presentación hace falta:**
1. Qué agua con gas se usa (marca y presentación).
2. Si la botella abierta se reutiliza (costo por ml) o va una por bebida (costo por pieza).
3. Con esa respuesta, **crear un insumo por ml o documentar la conversión**. Es un alta en el catálogo y no cambia ninguna unidad existente.
4. Resolver el registro duplicado de Topo Chico.

## 5. Lotes propuestos (para aprobar por separado)

| Lote | Contenido | Tipo | Herramienta | Costo |
|---|---|---|---|---|
| **3a** | Hielo Grande de Pink Lemonade 190 → 245 y de Passion fruit 177 → 245 | Demostrado | Script de correcciones (manifiesto) | $0 |
| **3b** | Agua de Cold brew, alternativa W1: 3 celdas | Demostrado | Script de correcciones | $0 |
| 3c | Agua con gas Grande 232 → 220 **y** cambio de ingrediente | Demostrado + presentación | Insumo nuevo por ml (catálogo) + cambio de línea con bitácora explícita | Según C o D |
| 3d | Fresa Grande 41 → 40 y pulpa Grande 82 → 70 (o 66.7) | Conversión | Script de correcciones, después de confirmar el rendimiento y la densidad | −$0.13 / −$2.40 a −$3.07 |
| 3e | Limón | Conversión + presentación | Después de medir | Por definir |
| — | Unidad del hielo (H2) | Catálogo | Script nuevo con bitácora y pruebas | $0 hoy |

**Procedimiento para 3a y 3b.** Es el mismo del lote 2:
1. Manifiesto con sha256 fijado y pruebas.
2. Respaldo verificado y dry-run con ROLLBACK.
3. Aplicación en transacciones separadas.
4. Verificación desde una conexión nueva y segundo ensayo.

**Fuera de alcance:**
- el AGUA de 10 ml de Iced Chocolate (doc 21, posible duplicación con su subreceta);
- las personalizaciones con tónica o agua mineral en Cold brew;
- cualquier cambio global de unidades.
