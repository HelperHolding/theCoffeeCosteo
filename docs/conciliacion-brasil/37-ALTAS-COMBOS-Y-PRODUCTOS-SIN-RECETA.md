# 37 · Productos del POS sin receta: qué se da de alta y qué no (alta de 3 combos)

**Estado:** **APLICADO en producción el 2026-10-29 16:51 UTC** con aprobación de Carlo: ejecución `97a03a92…`, bitácora #1300–1341. Falta el lote de enlaces de sus códigos POS, que requiere aprobación aparte.

## Los 41 productos del menú sin receta en Costeo

Del cotejo del menú «MEX - A» del portal del POS (doc 36), 41 productos no tienen receta. MEX - B, MEX - C y NORTE tienen los mismos productos. Para saber cuáles se venden, se leyó la API en **las 119 sucursales** del 15 al 28 de octubre de 2026:
- solo lectura: 202 llamadas, 0 errores, 61,103 pedidos y $9.1 M;
- solo se guardaron agregados por código.

| Producto | Venta 15–28 oct | Sucursales | Decisión (Carlo, 2026-10-29) |
|---|---|---|---|
| Pan de Muerto | $106,816 | 74 | Se compra hecho; **queda vacío** hasta tener el costo por pieza |
| Espresso Tonic | $33,563 | 49 | Necesita receta; **queda vacía** hasta que la persona encargada la capture en el portal |
| Zoé Water / Zoe Water Twist | $21,019 / $7,203 | 53 / 50 | Pendiente (decisión de enlace) |
| Cookie Matcha & White Chocolate | $20,918 | 36 | Se compra hecha; **queda vacía** hasta tener el costo |
| Spooky Biscuit | $15,989 | 39 | Se compra hecho; **queda vacío** hasta tener el costo |
| Croque Monsieur | $1,319 | 1 (Polanco) | Se compra hecho; **queda vacío** |
| True White + Pan de Muerto | $465 | 1 (Rubén Darío) | Depende de Pan de Muerto |
| Salted Caramel Cookie | $300 | 1 (Tepatitlán) | Se compra hecha; **queda vacía** |
| Los otros 32 | sin venta en ninguna sucursal | — | No se dan de alta por ahora, salvo los 3 combos de abajo |

Los 32 sin venta son la línea Brunch, Spanish Latte, Tiramisu, Gingerbread, Mango Matcha, Matcha Vanilla Iced Latte, Morning Matcha, aguas y jugos, Gift Box, Cake of the day, Orange Cake, otras cookies, sándwiches nuevos y combos.

**Otros resultados de la lectura de las 119 sucursales:**
- El único código vendido que no está en el menú es `GENERIC` (Rubén Darío).
- Con los 95 códigos enlazados se cubre el **94.8 %** de la venta de las 119.

## Alta de 3 combos

Carlo pidió armar los combos del menú que salen de recetas que ya tenemos, aunque hoy no tengan venta («Armarlos ya»). Cada uno sigue la forma del combo equivalente que ya existe:

| Combo (nombre del POS) | Código POS | Se arma con | Igual que | Categoría | Costo actual |
|---|---|---|---|---|---|
| Chai Latte + Lemon Cake | CHALEMAPP | Chai Latte Chica + Lemon Cake (panqué, bolsa, etiqueta) | Matcha Iced Latte + Lemon Cake / True White + Pain au Chocolat | COMBO CON PANADERÍA DULCE | $43.6904 |
| Vanilla Latte + Pain au Chocolat | 2VLT3FOOD3 | Vanilla Latte Chica + Pain au Chocolat | True White + Pain au Chocolat | Combos | $38.7304 |
| Coffee bag 250g + Mug | BAGMUGAPP | White bag 250g + Mug (una taza blanca, doc 34) | Coffee Bag 250g + Tumbler 240ml | Coffee Line | $242.00 |

- Los tres van en tamaño **Único**: la bebida caliente se arma con su receta Chica, como True White + Pain au Chocolat.
- Quedan **sin precio de lista**: el precio es de cada sucursal.
- El **enlace de sus códigos POS** se carga en un lote aparte después de crearlos, porque necesita los ids de las recetas nuevas.

**Lote:** `altas-combos-lote-1` (`37-altas-combos-lote-1.manifiesto.json`, sha256 `28b8eee7…`), con el cargador del doc 31 (`altas-productos.ts`). Sus garantías:
- cada producto se crea con `guardar_receta`, como en el portal;
- receta, tamaños, líneas y cantidades quedan idénticos al manifiesto;
- el costo debe ser igual al esperado: si un costo de compra cambia antes de aplicar, se detiene;
- bitácora exacta;
- reversión por ejecución.

**Cambio al cargador:** el número de doc ya no está fijo. `DOC_ALTAS` lleva la nota de la bitácora y la carpeta de informes al doc 37 para este lote; el lote de Zoho sigue en el 31.

## Verificación local

**Pruebas:** 9 en `tests/db/altas-productos.test.ts`, 1 nueva para el lote real: nombres, categorías, tamaño, costo, componentes y una sola taza.

**Ensayo sobre una copia del respaldo `2026-10-29T1558Z`**, borrada al terminar:

| Paso | Resultado |
|---|---|
| Ensayo | 3 creados con el costo esperado, 42 registros propios (3 recetas, 3 tamaños, 18 líneas y 18 cantidades) y 0 ajenos; resto sin cambios; ROLLBACK |
| Aplicar | COMMIT; 165 → 168 productos; nota «altas-combos-lote-1, ejecución … (docs/conciliacion-brasil/37)» |
| Repetir | 3 «sin cambio», 0 registros |
| Revertir | 3 borrados; vuelve a 165 |

## Respaldo y ensayo remoto (2026-10-29, aprobados por Carlo)

**Respaldo `2026-10-29T1638Z`**, restaurado en local:
- 0 errores fuera de `vault`;
- 21,613 filas, iguales a producción;
- `analytics_ventas_diarias` (846) y `perfil_modulos` (13), comparadas fila por fila en UTC: idénticas.

**Ensayo remoto con ROLLBACK** (16:42 UTC). Antes de correrlo se comprobó que producción no cambió desde el respaldo: 165 productos, bitácora hasta #1257 y ninguno de los 3 combos.

| Resultado | Valor |
|---|---|
| Creados | 3, con el costo esperado ($43.6904, $38.7304, $242.00) |
| Problemas | 0 |
| Bitácora | 42 propios, 0 ajenos |
| Resto de la base | sin cambios |
| Transacción | ROLLBACK; con una conexión nueva sigue en 165 productos y bitácora #1257 |

El informe se guardó fuera del repo, en el respaldo privado.

## Aplicación en producción (2026-10-29 16:51 UTC, aprobada por Carlo)

Antes de aplicar se volvió a comprobar que producción no había cambiado desde el ensayo: 165 productos, bitácora hasta #1257 y ninguno de los 3 combos.

| Paso | Resultado |
|---|---|
| Aplicar | 3 creados con el costo esperado y 0 problemas; 42 registros propios y 0 ajenos; resto sin cambios; COMMIT |
| Conexión nueva | 165 → 168 productos. Los 3 en tamaño Único, sin precio de lista, activos y con su categoría; 8, 8 y 2 líneas |
| Bitácora | #1300–1341: 42 filas, exactamente las del lote. El salto desde #1257 son números de secuencia que consumieron los ensayos con ROLLBACK |
| Repetir ensayo | 3 «sin cambio», 0 registros, ROLLBACK |

La ejecución completa y el comando de reversión están en el respaldo privado (`informes-altas-combos-lote-1/REVERSION.md`). La reversión solo borra si no hubo ediciones posteriores y requiere aprobación.

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Respaldo lógico verificado~~ (hecho: `2026-10-29T1638Z`).
2. ~~Ensayo remoto con ROLLBACK~~ (hecho, limpio):
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-combos-lote-1 --usuario <uuid-perfil>`
3. ~~Aplicar~~ (hecho, 16:51 UTC):
   `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
4. ~~Verificar con una conexión nueva y repetir el ensayo~~ (hecho: «sin cambio»).
5. Lote de enlaces para CHALEMAPP, 2VLT3FOOD3 y BAGMUGAPP.
