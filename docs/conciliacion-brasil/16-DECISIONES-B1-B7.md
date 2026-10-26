# 16 · Paquete de decisiones B1–B7

**Para aprobación de Carlo.** Fecha: 2026-10-26. **Nada de esto se aplicó**: no se tocaron código, recetas, precios ni producción. La migración 22 y las correspondencias siguen sin aplicar.

## Fuentes de la evidencia

| Fuente | Detalle |
|---|---|
| Ventas de Brasil | Muestra de fase 2: 612, 583 y 532, del 21-sep al 18-oct, 5,324 pedidos. El precio observado es la moda en **Mostrador** de líneas y pedidos **sin descuento**, por vaso. Es evidencia de transacción, no catálogo |
| Costeo | Lectura de solo lectura en producción el 2026-10-26: precio, costo, líneas de receta, categoría y estado |
| Recetario oficial 2026 | Cantidades por tamaño. No trae precios ni códigos |
| SKU | Verificación de `15` (rama `feat/sku-enlace-pos`) |

## Posición de Carlo (2026-10-26) y estado resultante

| Grupo | Posición | Estado |
|---|---|---|
| **A · Precios** | Conservar los valores. Rubén Darío (532) es **referencia de comparación**, no se declara lista oficial vigente solo porque coincide con la muestra | **A1 ajustada** (ver A). A3, A4 y A5: conservar. **Sin cambios de datos** |
| **B · Nombres** | B1–B6 aprobables si se adoptan las formas observadas en Brasil; B7 se conserva sin el doble espacio. Esto no confirma que sean los nombres vigentes del catálogo | **B1–B6: aprobables** (sin aplicar; la aplicación se pedirá aparte). **B7: conservar** |
| **C · Duplicados** | Comprobar recetas y dependencias antes de desactivar. Igual costo no demuestra igualdad. Urban queda pendiente de Operaciones | **Comprobación hecha** (ver C). **Ninguna desactivación aprobada todavía.** C1 pendiente de Operaciones |
| **D · Alias** | Mantenerlos como candidatos; precio y nombre parecido no bastan para aprobar identidad | **D1–D9: candidatos**, no aprobados. D10 pendiente |
| **E · Tamaños** | Aceptar solo correspondencias verificadas por producto. «Sin vaso» no se convierte en Chica por coincidencia de precio | **E1 acotada a 21 productos verificados.** **E2, E3 y E5 pendientes** (sin mapeo) |
| **F · Nuevas recetas** | Pedir cantidades y costos a Operaciones/Compras antes de crearlas | **Solicitud preparada**: `18-SOLICITUD-OPERACIONES-COMPRAS.md` |
| **G · SKU** | Preparar el procedimiento del lote de 57, sin aplicar | **Procedimiento preparado**: `17-PROCEDIMIENTO-SKU-LOTE-1.md` |

**Correcciones a la versión anterior de este documento:**
1. Desactivar duplicados **sí cambia cifras agregadas**, aunque no cambie precios. El tablero de Costeo, los promedios de margen y las alertas por tipo **solo cuentan recetas activas** (`lib/portal/tablero.ts`). Ver el impacto por par en C.
2. Los lotes siguientes de SKU **se solapan** (un código puede depender de varias decisiones). Ya no se suman por grupo: se listan **34 códigos únicos** con su motivo y la decisión que lo desbloquea en [`16-codigos-pendientes.csv`](16-codigos-pendientes.csv).

---

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
| **A1** *(ajustada por Carlo)* | Qué representa `precio_lista` | Sin definición escrita; coincide con la muestra de 532 | 70 pares iguales a 532 y distintos en 612/583; 8 iguales en todas las tiendas | **Conservar los valores.** Usar Rubén Darío (532) **solo como referencia de comparación** al cotejar con Brasil. **No se declara lista oficial vigente**: la coincidencia con 4 semanas de pedidos no lo demuestra | Ninguno en cifras |
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

**Mecanismo propuesto:** conservar una receta y **desactivar** la otra. La desactivada conserva su historia. **Ninguna desactivación está aprobada todavía.**

### Comprobación de recetas y dependencias

Lectura de solo lectura en producción, 2026-10-26.

| Par | ¿Recetas idénticas? (componentes y cantidades por tamaño) | Dependencias | Impacto de desactivar la que se propone |
|---|---|---|---|
| Urban Chocolat / Urban Chocolate | **No**: «Urban Chocolate» tiene «JARABE DE VANILLA» 10 ml en Grande | «Urban Chocolat»: **1 precio manual Rappi** y sin precio Grande · «Urban Chocolate»: precios completos | Sale 1 producto activo de los conteos, junto con su precio manual Rappi (queda inactivo, no se pierde). **Pendiente de Operaciones** |
| Muffin Tradicional / Muffin Traditional | **Sí** | Ninguna (sin precio, sin manuales, sin bitácora; no es subreceta) | −1 producto activo y −1 producto con «Falta precio de lista» en alertas |
| Brownie com sorvete / Brownie With Ice Cream | **Sí** | Ninguna. **Categorías distintas**: PANADERÍA DULCE frente a Desserts | −1 producto activo; −1 con «Falta precio de lista»; −1 en el conteo de PANADERÍA DULCE |
| Chicken Wrap / Wrap de Pollo | **Sí** | Ninguna | −1 producto activo; −1 con «Falta precio de lista» |
| Kit Cafés Editions / Kit Coffee Editions | **Sí** | «Kit Coffee Editions» (la que se desactivaría): **1 precio manual Rappi** y 1 entrada de bitácora. Categorías: Coffee Line frente a MERCH | −1 producto activo; −1 con «Falta precio de lista»; su precio manual Rappi queda inactivo. **Decidir antes** si ese precio Rappi se traslada a «Kit Cafés Editions» |
| Iced Latte Large / Iced Latte | **No**: «Iced Latte Large» no tiene líneas en Chica (costo 0 con precio 70) y en Grande solo «AGUA 36 ml» de diferencia | Ninguna (sin manuales, sin bitácora) | −1 producto activo. Su fila Chica (costo 0, margen ≈ 100 %) **sale de los promedios de margen**, que **bajarán** algo |

Desactivar también cambia las listas de Productos y Resumen (filtro «Activos») y el número de alertas por tipo del tablero. **No cambia precios, costos de otras recetas ni ventas.**

| ID | Par | Evidencia | Propuesta | Impacto |
|---|---|---|---|---|
| **C1** | **Urban Chocolat** / **Urban Chocolate** (ambas «Hot») | La API usa **«Urban Chocolate»** (`4UC`), 106 líneas, a $78/$88 en 532 = precios de «Urban Chocolate». «Urban Chocolat» no tiene precio en Grande. **Recetas distintas en Grande:** «Urban Chocolate» lleva **10 ml de jarabe de vainilla** (costo $16.69 frente a $14.39); el recetario p. 34 («Urban Chocolat») no la incluye | Conservar **«Urban Chocolate»** (nombre de la API, precios completos) y desactivar «Urban Chocolat». **Operaciones confirma** si el Grande lleva vainilla: si no, se quita esa línea (cambio de receta aparte) | Costo Grande $16.69, o $14.39 si se quita la vainilla. Habilita el enlace de `4UC` |
| **C2** | Muffin Tradicional / Muffin Traditional | Idénticas: costo $24.15, sin precio y sin ventas en la muestra | Conservar **«Muffin Traditional»** (coincide con el insumo «MUFFIN TRADITIONAL») y desactivar «Muffin Tradicional» | Agregados del tablero (ver la comprobación); no en precios |
| **C3** | Brownie com sorvete / Brownie With Ice Cream | La API usa «Brownie with ice cream» (`BRICE`), $89 en 532 = precio de «Brownie With Ice Cream». «com sorvete» no tiene precio | Conservar **«Brownie With Ice Cream»** (con la forma de B4 si se aprueba) y desactivar «Brownie com sorvete» | Agregados del tablero (ver la comprobación); no en precios |
| **C4** | Chicken Wrap / Wrap de Pollo | Idénticas: costo $38.65, sin precio y sin ventas | Conservar **«Chicken Wrap»** (convención en inglés del catálogo) y desactivar «Wrap de Pollo». Si ya no se vende, desactivar ambas | Agregados del tablero (ver la comprobación); no en precios |
| **C5** | Kit Cafés Editions / Kit Coffee Editions | La API usa «Kit Cafés Editions» ($999 en 612, 1 línea). Costeo: «Cafés» $899; «Coffee» sin precio de mostrador | Conservar **«Kit Cafés Editions»** y desactivar «Kit Coffee Editions» | Agregados del tablero (ver la comprobación); no en precios |
| **C6** | **Iced Latte Large** (variante) | Registro incompleto: costo $0 en Chica, sin precio en Grande; solo el Grande tiene cantidades. «Iced Latte» ya cubre Chica y Grande (70/80) | **Desactivar «Iced Latte Large»** | Baja los promedios de margen (sale su fila de costo 0); habilita el enlace de `5IL` (Iced Latte, 714 líneas) |

---

## Grupo D · B3 · Alias: nombres distintos para el mismo producto *(independiente)*

**Propuesta general (candidatos, no aprobados):**
- cuando se apruebe la identidad, **ligar el código del POS a la receta existente** (grupo G);
- **sin renombrar** la receta, salvo que se pida aparte;
- el precio de 532 es la evidencia principal.

| ID | API (código, líneas) | Costeo | Evidencia de precio en 532 (Regular/Large) | Propuesta |
|---|---|---|---|---|
| **D1** | Pumpkin Iced Latte (`CPUMICAPP`, 429) | Pumpkin Spice Iced Latte | API 99/109 · Costeo 99/109 | Candidato (no aprobado) |
| **D2** | Pumpkin Latte (`CPUMLAAPP`, 363) | Pumpkin Spice Latte | API 99/109 · Costeo 99/109 | Candidato (no aprobado) |
| **D3** | Pumpkin Spice Frap (`CPUMFRAPP`, 126) | Pumpkin Spice Frappé | API 99/109 · Costeo 99/109 | Candidato (no aprobado) |
| **D4** | Salted Caramel Frap (`SALFRAAPP`, 104) | Salted Caramel Frappé | API 89/99 · Costeo 89/99 | Candidato (no aprobado) |
| **D5** | Taro Frap (`FRATARAPP`, 83) | Taro Frappé | 89/99 = 89/99 | Candidato (no aprobado) |
| **D6** | Coffee Frap (`COFFRAAPP`, 59) | Coffee Frappé | 89/99 = 89/99 | Candidato (no aprobado) |
| **D7** | Matcha Frap (`FRAMATAPP`, 46) | Matcha Frappé | 89/99 = 89/99 | Candidato (no aprobado) |
| **D8** | Chai Frap (`FRACHAAPP`, 42) | Chai Frappé | API 89 (Regular) · Costeo 89/99 | Candidato (no aprobado) |
| **D9** | Zoé Water (`ZOEWATAPP`, 8) | Zoé Water Natural | API $45 en 532 · Costeo sin precio | Alias probable. Requiere decidir A4 (precio) |
| **D10** | Zoe Water Twist (`ZOETWIAPP`, 18) | ¿«Twist Frutos Rojos» o «Twist Limón y Jengibre»? | API $50 en 532; **un código para dos sabores** | **Pendiente**: no se puede ligar a una sola receta. Preguntar al proveedor si hay códigos por sabor |

**Nota sobre Rappi:** los precios Rappi de Costeo para Pumpkin (123/122) y Frappés (111/122) no se cotejan aquí. Ver A5 y `14`.
- **Observación:** en los tres Pumpkin Spice, el precio Rappi calculado del **Grande ($122) es menor que el de Chica ($123)**. Probablemente lo causa el tope de markup de la fórmula «castigado». No se propone cambio aquí; conviene revisarlo junto con A5.

---

## Grupo E · B5 · Tamaños *(independiente)*

| ID | Tema | Valor actual | Evidencia | Propuesta | Impacto |
|---|---|---|---|---|---|
| **E1** *(acotada por Carlo)* | Correspondencia **Chica ↔ Regular**, **Grande ↔ Large** | Sin mapeo | Códigos de vaso uno a uno: `HOTTRAAPP` Regular 240 · `TRADICAPP` Regular 440 · `HOTLARAPP` Large 355 · `LARGEAPP` Large 600. **Verificada por producto en 21 productos** (precio idéntico en 532 en ambos tamaños): True White, Americano, Salted Caramel, Matcha Iced Latte, Iced Vanilla, Vanilla Latte, Ichigo Matcha, Chai Iced Latte, Isopure Iced Latte, Chai Latte, Flat Caramel, Isopure Iced Matcha, Sora Iced Latte (Signature), Cold brew, Black Ginger, Mad Mocha, Iced Black, Iced Chocolate, Sora Latte (Signature), Matcha Latte, Matcha Vanilla Latte | **Aceptar solo para esos 21.** Matcha Iced Mint (solo Grande verificado) e Iced Blueberry Matcha (sin evidencia en 532) quedan pendientes. **No es regla global** | Base para cotejar ventas por tamaño de esos 21 |
| **E2** *(pendiente)* | Cold Drip V60 y Cold Drip V60 + Milk | Costeo: Chica y Grande (94/104; 107/117) | La API los vende **sin vaso**; en 532 a $94, igual al precio de Chica | **Sin mapeo.** Por la regla de Carlo, «sin vaso» no se convierte en Chica por coincidir en precio. Preguntar a Operaciones si se vende en un solo tamaño y con qué cantidades | Ninguno |
| **E3** *(pendiente)* | Fresh Soda Pink Lemonade y Passion fruit | Costeo: Chica y Grande (86/96; 81/91) | En 532 llegan sin vaso, a $86 y $81 (igual que Chica). En 612, a veces con vaso | **Sin mapeo** para «sin vaso». Los casos con vaso se evaluarán por producto cuando haya evidencia de ambos tamaños | Ninguno |
| **E4** | Gelato Frappé Coffee (y los demás Gelato Frappé) | Costeo: **Único** ($94) | 532: sin vaso $94 y **Large $104**. Recetario pp. 46–48: Regular 440 / Grande 600 | Decidir: **(a)** agregar tamaño Grande a los Gelato Frappé (cambio de catálogo, requiere cantidades), o **(b)** mantener Único = Regular y dejar fuera los Large | (a) mejora el costeo; (b) no cambia nada |
| **E5** *(pendiente)* | Combos con vaso (True White + …, Iced Latte + …) | Costeo: **Único** (119, 125, 103…) | 532: True White + Grilled Ham & Cheese **Regular 119 / Large 129**; el Único de Costeo tiene el precio de Regular | **Sin mapeo** hasta que Operaciones confirme qué vaso lleva el combo «Único» y si existe la versión Grande | Ninguno |
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
| G3 | Códigos pendientes (no se suman por grupo: se solapan) | — | **34 códigos únicos** con su motivo y la decisión que lo desbloquea en [`16-codigos-pendientes.csv`](16-codigos-pendientes.csv). Algunos dependen de **más de una** decisión (p. ej. `MISICEDAPP`: B7 **y** E5; `BRICE`: B4 **y** C3; `ZOEWATAPP`: D9 y precio). Un código entra al lote siguiente solo cuando **todas** sus decisiones estén aprobadas |

---

## Resumen para aprobar

| Grupo | Estado tras la revisión de Carlo | ¿Cambia cifras si se aplica? |
|---|---|---|
| **A · Precio de lista** | Conservar valores; 532 solo como referencia de comparación | No |
| **B · Nombres** | B1–B6 aprobables (adoptar la forma observada en Brasil, sin afirmar que es la vigente del catálogo); B7 conservar | No: solo nombres visibles y búsqueda |
| **C · Duplicados** | Dependencias comprobadas; **ninguna desactivación aprobada**; C1 pendiente de Operaciones; C5 decidir antes el precio manual Rappi | **Sí, en agregados**: conteo de productos activos, alertas por tipo y promedios de margen (C6 los baja). No en precios ni costos de otras recetas |
| **D · Alias** | Candidatos, no aprobados | No |
| **E · Tamaños** | E1 solo para 21 productos verificados; E2, E3 y E5 pendientes; E4 por decidir; E6 confirmar | No, salvo E4 (a) |
| **F · Sin receta** | Solicitud a Operaciones/Compras (`18`) antes de crear | Agregaría costeo nuevo |
| **G · Correspondencias** | Procedimiento del lote 1 preparado (`17`), sin aplicar; 34 códigos pendientes únicos | No (agrega identidad) |
