# 04 · Matriz de discrepancias Costeo ↔ Brasil

**Fase 2 — solo lectura.** Fecha: 2026-10-23. Datos: [`04-matriz-discrepancias.csv`](04-matriz-discrepancias.csv) (213 filas, UTF-8 con BOM para Excel).

**Ninguna fila está aprobada.** Los estados son: `candidata`, `ambigua` o `sin equivalencia`. «Confirmada» no se usa, porque un nombre o precio observado en pedidos no demuestra el catálogo vigente.

## Fuentes y cobertura

| Fuente | Qué se leyó | Cobertura |
|---|---|---|
| Costeo (Supabase `jpqkmnfjwzniptszjuli`) | 160 recetas (154 productos, 6 subrecetas), 215 producto-tamaño, 83 precios manuales Rappi, 3 canales, 3 tamaños | Completo (rol `postgres`, transacción READ ONLY; no depende de RLS) |
| API Brasil | 612, 583 y 532 · 4 semanas cerradas lun–dom (2026-09-21 → 2026-10-18, fecha local de cada tienda) · 17 GET | 12 de 12 ventanas `completo=true`; 5,324 pedidos; 0 inválidos; 0 fuera de ventana |
| Recetario oficial 2026 (PDF) | Índice de 72 fichas por página; muestra de cantidades de 6 bebidas | No trae precios, costos ni códigos |
| Excel original | **No disponible** en el checkout | Sin paridad con Excel (no se afirma) |

**Cómo se calcula el precio observado:** monto de la línea más el extra del custom de tamaño («Regular/Large - N ml»), **solo en líneas y pedidos sin descuento**. Se separa por sucursal, origen y tamaño. Sigue siendo evidencia de una transacción, no precio de catálogo.

## Resumen por clase

| Clase | Filas | Estado | Lectura |
|---|---|---|---|
| Precio por tienda | 70 | ambigua | `precio_lista` coincide con **532** y no con 612/583 |
| Precio / contexto | 17 | candidata | Producto sin ventas en 532; el local difiere de 612/583 |
| Sin observación en ventana | 69 | sin equivalencia | Producto local no vendido en 4 semanas (sobre todo combos, panadería y bebidas de la carga del Excel). **No prueba que esté descatalogado** |
| Alias / renombre | 21 | ambigua | 11 locales + 10 de API (p. ej. «Pumpkin Spice Latte» ↔ «Pumpkin Latte», «… Frappé» ↔ «… Frap», «Zoé Water …») |
| Nombre: mayúsculas o espacios | 7 | candidata | P. ej. «Pain Au Chocolat» ↔ «Pain au Chocolat»; doble espacio en «Iced Latte +  Ham & Cheese Sandwich» |
| Producto de API sin receta local | 8 | sin equivalencia | Generic, Pan de Muerto, Espresso Tonic, Spooky Biscuits, Cookie Matcha & White Chocolate y 3 combos |
| Tamaño / unidad | 10 | candidata / ambigua | Mapeo Chica/Grande, 355 vs 360 ml, Gelato Frappé, combos con vaso |
| Duplicado probable en Costeo | 5 | ambigua | Urban Chocolat / Urban Chocolate · Muffin Tradicional / Traditional · Brownie com sorvete / With Ice Cream · Chicken Wrap / Wrap de Pollo · Kit Cafés / Coffee Editions |
| Precio Rappi | 3 | candidata | 1 sin manual (usa fórmula), 2 distintos con 1 línea de evidencia |
| Codificación | 1 | candidata | «King’s Cake» con U+2019 (no vendido en la ventana) |
| Cantidad de receta | 1 | candidata | Chai Latte: g de chai frente a ml de preparado |
| Costo | 1 | sin equivalencia | La API no expone costos; se conservan los locales |

**Sin discrepancia (no tienen fila):**
- 67 nombres coinciden exactamente con la API.
- 22 precios coinciden en todas las tiendas con ventas.

## Hallazgo 1 — Costeo refleja los precios de Rubén Darío (532)

| Comparación | Resultado |
|---|---|
| `precio_lista` igual al precio más frecuente en Mostrador de **532** | **75 de 75** pares producto-tamaño comparables |
| Juárez (612) cobra **más** que Costeo | 77 de 90 pares |
| Ejemplos (Chica / Grande) | Iced Latte 70/80 en Costeo y 532; 80/90 en 612 y 583. True White 68/78 frente a 78/88. Americano 52/62 frente a 60/70 |
| Precio Rappi manual frente a Rappi observado en 532 | Coinciden en todos los casos con evidencia, salvo 3 filas (p. ej. Iced Latte 88/100 y Ichigo 113/125, que coinciden) |

**Conclusión.** **No existe un precio oficial único en la API**: cada tienda cobra su propia lista. Costeo tiene un solo `precio_lista` por producto y tamaño, que hoy equivale a la lista de 532. Sustituirlo por lo cobrado en otra tienda, o por un promedio, cambiaría márgenes y alertas sin una definición aprobada.

**Decisión pendiente (Carlo):** ¿qué lista representa `precio_lista`? Hay tres caminos:
- (a) una tienda de referencia;
- (b) precio por tienda, que exige un modelo nuevo;
- (c) mantener el actual y solo mostrar las diferencias.

## Hallazgo 2 — Tamaños: mapeo por producto, no global

- En la API el tamaño viaja como **custom**: «Regular - 240ml» / «Large - 355ml» en calientes y «Regular - 440ml» / «Large - 600ml» en fríos. El vaso grande suele llevar un extra de $10.
- En los 75 pares comparables, «Chica = Regular» y «Grande = Large» cumplen la igualdad de precio en 532. Es **evidencia por producto**, no regla global. Hay excepciones:
  - Cold Drip V60 tiene Chica y Grande en Costeo, pero la API lo vende sin tamaño;
  - los Gelato Frappé son Único en Costeo, mientras la API a veces trae Regular/Large y el recetario (pp. 46–48) da 440/600 ml;
  - los combos «True White + …» llevan vaso en la API y son Único en Costeo.
- El vaso grande caliente mide **355 ml en la API y 360 ml en el recetario** (pp. 18–35).

## Hallazgo 3 — Recetario: las cantidades coinciden en la muestra

| Bebida (Chica / Grande) | Costeo | Recetario | Resultado |
|---|---|---|---|
| Iced Latte (p. 21) | leche 170/290 ml, hielo 130/245, café 18 g | leche 170/290, hielo 130/245 g, espresso 36 ml | ✅ |
| True White (p. 19) | leche 170/250 | 170/250 | ✅ |
| Americano (p. 18) | agua 195/310 | 150+45 / 250+60 | ✅ |
| Matcha Iced Latte (p. 23) | mix matcha 36.05/45.01 ml, leche 170/290 | preparado 36/45 ml, leche 170/290 | ✅ |
| Matcha Latte (p. 20) | 36.05/36.05 ml | 36/36 ml | ✅ |
| Chai Latte (p. 26) | chai 4/5 g + agua 42/50 ml | preparado 36/45 ml (50 g en 400 ml) + 10 ml de agua | ⚠️ requiere conversión |

El recetario **no es fuente de nombres exactos**: tiene «Pumkin» y «Pumpkin», «Gelatto» y «Gelato», «Maracuyá» y «Maracuya». Coincide con Costeo en «Urban Chocolat», mientras la API dice «Urban Chocolate». Sirve como evidencia, no como forma oficial.

## Lo que la matriz no permite concluir

- **Nombre vigente:** la API solo muestra nombres de pedidos; no se encontró endpoint de catálogo (ver 06).
- **Ausencia:** que un producto no aparezca en 4 semanas no prueba que esté descatalogado.
- **Costos de insumos, subrecetas y rendimientos:** sin fuente equivalente; se conservan.
- **Paridad con el Excel:** el archivo no está disponible.
