# 16 · Paquete de decisiones B1–B7

**Para aprobación de Carlo.** Fecha: 2026-10-26. **Nada de esto se aplicó**: no se tocaron código, recetas, precios ni producción. La migración 22 y las correspondencias siguen sin aplicar.

## Fuentes de la evidencia

| Fuente | Detalle |
|---|---|
| Ventas de Brasil | Muestra de fase 2: 612, 583 y 532, del 21-sep al 18-oct, 5,324 pedidos. El precio observado es la moda en **Mostrador** de líneas y pedidos **sin descuento**, por vaso. Es evidencia de transacción, no catálogo |
| Costeo | Lectura de solo lectura en producción el 2026-10-26: precio, costo, líneas de receta, categoría y estado |
| Recetario oficial 2026 | Cantidades por tamaño. No trae precios ni códigos |
| SKU | Verificación de `15` (rama `feat/sku-enlace-pos`) |

**Cómo aprobar:** cada decisión tiene un ID. Puedes aprobar un **grupo completo** («apruebo el grupo C»), decisiones sueltas («apruebo C1, C3 y E2») o cambiar la propuesta («D9: dejarlo sin enlace»).

**Los grupos A–F son independientes entre sí.** El grupo G (correspondencias) crece según lo que se apruebe en los demás.

**Al aplicar** (después de tu aprobación, en otra entrega):
- los cambios de recetas se hacen desde el portal o con un script con dry-run y bitácora;
- **no se borra ninguna receta**: solo se desactiva (`activo = false`), porque el borrado arrastra precios y líneas en cascada.

---

## Grupo A · B1 · Precio de lista *(independiente)*

**Hallazgo:**
- Costeo tiene **un** `precio_lista` por producto y tamaño. En **75 de 75** pares comparables, ese precio coincide con lo que cobra **Rubén Darío (532)**.
- **Cd. Juárez (612)** cobra más en 77 de 90 pares. La diferencia más común es de +$10 a +$12, con 2 casos de −$4.
- Bonampak (583) también cobra distinto.
- Detalle por producto y tamaño: [`16-b1-precios.csv`](16-b1-precios.csv), 95 filas con evidencia.

| ID | Tema | Valor actual | Evidencia de Brasil | Propuesta | Impacto |
|---|---|---|---|---|---|
| **A1** | Qué representa `precio_lista` | Sin definición escrita; de hecho = lista de 532 | 70 pares iguales a 532 y distintos en 612/583; 8 iguales en todas las tiendas | **Declarar `precio_lista` = lista base de referencia (Rubén Darío / 532)** y mostrar en Sucursales los precios observados por tienda como información. **No cambia ningún valor** | Márgenes y alertas siguen iguales; queda explícito qué lista calculan |
| A2 | Alternativa a A1 (no recomendada ahora) | — | — | Precio **por tienda**: modelo nuevo (tabla y migración), con márgenes por sucursal | Alto: cambia `v_resumen`, alertas y la calculadora. Solo si el negocio lo necesita |
| **A3** | 17 pares sin ventas en 532, con precio local distinto de 612/583 (p. ej. Iced Blueberry Matcha 90/100 frente a 110/120 en 612; Mug 374 frente a 449) | Se conserva | Solo hay evidencia de otras tiendas | **Mantener el valor actual**, marcado «sin confirmación de la lista base». No copiar precios de 612/583 | Ninguno |
| **A4** | 79 tamaños **sin** `precio_lista` (61 productos; p. ej. Muffins, Wraps, Zoé Water) | `null` (alerta «falta precio») | Ninguno de ellos se vendió en la muestra | **Mantener `null`** hasta tener la lista oficial; no inferir de pedidos | La alerta sigue visible |
| **A5** | Precios manuales de Rappi con diferencias | Cookie Traditional 74 · Iced Latte + Ham & Cheese Sandwich 151 · True White Chica sin precio manual | Rappi 532: 67 (1 línea) · 175 (1 línea; los combos cambian por fecha) · 87 (pocas líneas) | **No cambiar.** Pedir a Delivery la lista Rappi vigente. True White Chica: capturar 87 solo si Delivery lo confirma | Margen Rappi de 3 productos |

---

## Grupo B · B2 · Forma de los nombres *(independiente)*

Son 7 productos cuyo nombre en la API difiere solo en mayúsculas o espacios. Renombrar cambia `recetas.nombre` (único), queda en la bitácora y no afecta relaciones ni costos.

| ID | Costeo (actual) | API (observado en pedidos) | Líneas | Propuesta |
|---|---|---|---|---|
| B1 | Pain Au Chocolat | Pain au Chocolat (`3FOOD3`) | 221 | Adoptar la forma de la API |
| B2 | Grilled Ham Cheese And Tomato Sandwich | Grilled Ham Cheese and Tomato Sandwich (`BR3`) | 210 | Adoptar la forma de la API |
| B3 | Croissant Filled With Cheese and Ham | Croissant filled with cheese and ham (`CROSTUAPP`) | 92 | Adoptar la forma de la API |
| B4 | Brownie With Ice Cream | Brownie with ice cream (`BRICE`) | 22 | Adoptar la forma de la API (ver C3) |
| B5 | White Bag 250g | White bag 250g (`1CBWB`) | 20 | Adoptar la forma de la API |
| B6 | Black Edition 250g | Black edition 250g (`3CBBE`) | 5 | Adoptar la forma de la API |
| B7 | Iced Latte + Ham & Cheese Sandwich | Iced Latte **+  Ham** (doble espacio, `MISICEDAPP`) | 76 | **No copiar el doble espacio**, que parece una errata del POS. Mantener el nombre de Costeo y ligar por código (G) |

**Alternativa:** mantener todos los nombres de Costeo y ligar solo por código (G). El nombre visible no cambia y la identidad queda por SKU.

Los nombres observados en pedidos no prueban que sean los vigentes del catálogo (pregunta 2 de `06`).

---

## Grupo C · B4 · Duplicados en Costeo *(independiente; solo C3 depende de B4)*

**Mecanismo propuesto:** conservar una receta y **desactivar** la otra. La desactivada conserva su historia.

| ID | Par | Evidencia | Propuesta | Impacto |
|---|---|---|---|---|
| **C1** | **Urban Chocolat** / **Urban Chocolate** (ambas «Hot») | La API usa **«Urban Chocolate»** (`4UC`), 106 líneas, a $78/$88 en 532 = precios de «Urban Chocolate». «Urban Chocolat» no tiene precio en Grande. **Recetas distintas en Grande:** «Urban Chocolate» lleva **10 ml de jarabe de vainilla** (costo $16.69 frente a $14.39); el recetario p. 34 («Urban Chocolat») no la incluye | Conservar **«Urban Chocolate»** (nombre de la API, precios completos) y desactivar «Urban Chocolat». **Operaciones confirma** si el Grande lleva vainilla: si no, se quita esa línea (cambio de receta aparte) | Costo Grande $16.69, o $14.39 si se quita la vainilla. Habilita el enlace de `4UC` |
| **C2** | Muffin Tradicional / Muffin Traditional | Idénticas: costo $24.15, sin precio y sin ventas en la muestra | Conservar **«Muffin Traditional»** (coincide con el insumo «MUFFIN TRADITIONAL») y desactivar «Muffin Tradicional» | Ninguno en cifras |
| **C3** | Brownie com sorvete / Brownie With Ice Cream | La API usa «Brownie with ice cream» (`BRICE`), $89 en 532 = precio de «Brownie With Ice Cream». «com sorvete» no tiene precio | Conservar **«Brownie With Ice Cream»** (con la forma de B4 si se aprueba) y desactivar «Brownie com sorvete» | Ninguno en cifras |
| **C4** | Chicken Wrap / Wrap de Pollo | Idénticas: costo $38.65, sin precio y sin ventas | Conservar **«Chicken Wrap»** (convención en inglés del catálogo) y desactivar «Wrap de Pollo». Si ya no se vende, desactivar ambas | Ninguno en cifras |
| **C5** | Kit Cafés Editions / Kit Coffee Editions | La API usa «Kit Cafés Editions» ($999 en 612, 1 línea). Costeo: «Cafés» $899; «Coffee» sin precio de mostrador | Conservar **«Kit Cafés Editions»** y desactivar «Kit Coffee Editions» | Ninguno en cifras |
| **C6** | **Iced Latte Large** (variante) | Registro incompleto: costo $0 en Chica, sin precio en Grande; solo el Grande tiene cantidades. «Iced Latte» ya cubre Chica y Grande (70/80) | **Desactivar «Iced Latte Large»** | Habilita el enlace de `5IL` (Iced Latte, 714 líneas) |

---

## Grupo D · B3 · Alias: nombres distintos para el mismo producto *(independiente)*

**Propuesta general:**
- **ligar el código del POS a la receta existente** (grupo G);
- **sin renombrar** la receta, salvo que se pida aparte;
- el precio de 532 es la evidencia principal.

| ID | API (código, líneas) | Costeo | Evidencia de precio en 532 (Regular/Large) | Propuesta |
|---|---|---|---|---|
| **D1** | Pumpkin Iced Latte (`CPUMICAPP`, 429) | Pumpkin Spice Iced Latte | API 99/109 · Costeo 99/109 | Alias ✔ |
| **D2** | Pumpkin Latte (`CPUMLAAPP`, 363) | Pumpkin Spice Latte | API 99/109 · Costeo 99/109 | Alias ✔ |
| **D3** | Pumpkin Spice Frap (`CPUMFRAPP`, 126) | Pumpkin Spice Frappé | API 99/109 · Costeo 99/109 | Alias ✔ |
| **D4** | Salted Caramel Frap (`SALFRAAPP`, 104) | Salted Caramel Frappé | API 89/99 · Costeo 89/99 | Alias ✔ |
| **D5** | Taro Frap (`FRATARAPP`, 83) | Taro Frappé | 89/99 = 89/99 | Alias ✔ |
| **D6** | Coffee Frap (`COFFRAAPP`, 59) | Coffee Frappé | 89/99 = 89/99 | Alias ✔ |
| **D7** | Matcha Frap (`FRAMATAPP`, 46) | Matcha Frappé | 89/99 = 89/99 | Alias ✔ |
| **D8** | Chai Frap (`FRACHAAPP`, 42) | Chai Frappé | API 89 (Regular) · Costeo 89/99 | Alias ✔ |
| **D9** | Zoé Water (`ZOEWATAPP`, 8) | Zoé Water Natural | API $45 en 532 · Costeo sin precio | Alias probable. Requiere decidir A4 (precio) |
| **D10** | Zoe Water Twist (`ZOETWIAPP`, 18) | ¿«Twist Frutos Rojos» o «Twist Limón y Jengibre»? | API $50 en 532; **un código para dos sabores** | **Pendiente**: no se puede ligar a una sola receta. Preguntar al proveedor si hay códigos por sabor |

**Nota sobre Rappi:** los precios Rappi de Costeo para Pumpkin (123/122) y Frappés (111/122) no se cotejan aquí. Ver A5 y `14`.
- **Observación:** en los tres Pumpkin Spice, el precio Rappi calculado del **Grande ($122) es menor que el de Chica ($123)**. Probablemente lo causa el tope de markup de la fórmula «castigado». No se propone cambio aquí; conviene revisarlo junto con A5.

---

## Grupo E · B5 · Tamaños *(independiente)*

| ID | Tema | Valor actual | Evidencia | Propuesta | Impacto |
|---|---|---|---|---|---|
| **E1** | Mapeo general **Chica ↔ Regular**, **Grande ↔ Large** | Sin mapeo | 75 de 75 pares con precio idéntico en 532. Códigos de vaso uno a uno: `HOTTRAAPP` Regular 240 · `TRADICAPP` Regular 440 · `HOTLARAPP` Large 355 · `LARGEAPP` Large 600 | Aprobar el mapeo **por producto**, solo para los que tienen Chica y Grande en Costeo y vasos en la API. **No como regla global** | Base para cotejar precios y ventas por tamaño |
| **E2** | Cold Drip V60 y Cold Drip V60 + Milk | Costeo: Chica y Grande (94/104; 107/117) | La API los vende **sin vaso**, a $94 en 532 = precio de Chica | Mapear «sin vaso» ↔ **Chica**; no cambiar la receta | Si en realidad se vende un solo tamaño, el Grande de Costeo sobra (otra decisión) |
| **E3** | Fresh Soda Pink Lemonade y Passion fruit | Costeo: Chica y Grande (86/96; 81/91) | En 532 llegan sin vaso, a $86 y $81 = Chica. En 612, a veces con vaso | Mapear «sin vaso» ↔ **Chica**; Regular/Large según E1 | Mínimo |
| **E4** | Gelato Frappé Coffee (y los demás Gelato Frappé) | Costeo: **Único** ($94) | 532: sin vaso $94 y **Large $104**. Recetario pp. 46–48: Regular 440 / Grande 600 | Decidir: **(a)** agregar tamaño Grande a los Gelato Frappé (cambio de catálogo, requiere cantidades), o **(b)** mantener Único = Regular y dejar fuera los Large | (a) mejora el costeo; (b) no cambia nada |
| **E5** | Combos con vaso (True White + …, Iced Latte + …) | Costeo: **Único** (119, 125, 103…) | 532: True White + Grilled Ham & Cheese **Regular 119 / Large 129**; el Único de Costeo = precio Regular | Mapear Único ↔ **Regular**. Decidir aparte si se agrega Grande (+$10) | Ninguno inmediato |
| **E6** | Volumen del vaso grande caliente | Costeo no guarda ml | API «Large - 355ml» · recetario «Grande (360 ml)» | Solo etiqueta: confirmar con Operaciones | Ninguno |
| — | «Grande 355 ml.» de Rappi en bebidas frías | — | Caso 2 (`14`) | **No es decisión de catálogo:** pregunta al proveedor y a Rappi | — |

---

## Grupo F · B6 · Productos vendidos sin receta *(independiente; depende de D)*

Con los alias del grupo D quedan **7 productos** de la API sin receta en Costeo.

| ID | Producto (código) | Líneas · importe (4 semanas) | Precio en 532 | Tipo | Propuesta |
|---|---|---|---|---|---|
| **F1** | Pan de Muerto (`PANMUEAPP`) | 99 · $7,120 | $65 (612/583: $78) | Temporada, desde el 2-oct | Crear la receta **si** se quiere su margen. Requiere cantidades de Operaciones (no está en el recetario) |
| **F2** | Cookie Matcha & White Chocolate (`COOMATAPP`) | 68 · $4,366 | $60 | Permanente | **Crear la receta** (datos de Compras/Operaciones) |
| **F3** | Espresso Tonic (`ESPTONAPP`) | 29 · $2,868 | $94 | Permanente | **Crear la receta** (no está en el recetario; Operaciones da las cantidades) |
| **F4** | Spooky Biscuits (`SPOBISAPP`) | 12 · $812 | — (612/583: $70) | Temporada | No costear, salvo que se repita |
| **F5** | Matcha Iced Latte + Lemon Cake (`MATLEMAPP`) | 9 · $1,323 | — (583: $140) | Combo | Crear como combo de recetas existentes, o no costear |
| **F6** | True White + Croissant filled with cheese and ham (`TRWCROAPP`) | 3 · $500 | Rappi $175 | Combo Rappi | No costear por ahora |
| **F7** | True White + Pan de Muerto (`TRUPANAPP`) | 3 · $482 | Rappi $155 | Combo Rappi, temporada | No costear |

**No se crea ninguna receta sin datos de Operaciones.** Los importes no se usan para inferir costos.

**Fuera de este grupo:** `GENERIC` (108 líneas en Rappi) no es un producto ni se costea. Ver `05`, `11` y `14`.

---

## Grupo G · B7 · Correspondencias código POS → receta

| ID | Decisión | Estado previo | Propuesta |
|---|---|---|---|
| **G1** | Aplicar la **migración 22** en producción | Preparada y probada en local (`15`, rama `feat/sku-enlace-pos`) | Procedimiento propio, igual al de la fase 4: captura, ensayo con ROLLBACK, aplicación, verificación y reversión. Se registra **antes** del merge, porque «Deploy to production» está activo |
| **G2** | Cargar el **lote 1** (57 códigos verificados) | Dry-run local OK | Cargar tras G1, con el script en dry-run primero |
| G3 | Lotes siguientes (se habilitan según lo aprobado) | — | **+7** con B (nombres) · **+2** con C1 y C6 (`4UC`, `5IL`) · **+8 o +9** con D1–D9 · **+8** con E2–E5 (Cold Drip, Fresh Soda, Gelato, combos) · **+n** con F (recetas nuevas) |

---

## Resumen para aprobar

| Grupo | Decisiones recomendadas | ¿Cambia cifras? |
|---|---|---|
| **A · Precio de lista** | A1, A3, A4, A5 | No |
| **B · Nombres** | B1–B6 (adoptar forma de la API), B7 (mantener) | No (solo nombres) |
| **C · Duplicados** | C1 (+ confirmar la vainilla), C2–C6 | No, salvo el costo Grande de Urban si se quita la vainilla |
| **D · Alias** | D1–D9 (ligar por código), D10 pendiente | No |
| **E · Tamaños** | E1, E2, E3, E5, E6. E4: elegir (a) o (b) | No, salvo E4 (a) |
| **F · Sin receta** | F2, F3 (crear con datos de Operaciones); F1 según interés; F4–F7 no costear | Agrega costeo nuevo |
| **G · Correspondencias** | G1 y G2 como entrega propia; G3 según lo anterior | No (agrega identidad) |
