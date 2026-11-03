# 45 · Combos con vaso Regular y Large: Chica y Grande

**Estado:** el lote quedó **APLICADO** en producción el 2026-11-03 con aprobación de Carlo: ejecución `4fa6b57b…`, bitácora
#1856–1958. Solo falta el merge, que requiere la aprobación expresa de Carlo.

## Por qué

En la medición del doc 44, 4 combos quedaban como costeo parcial por tamaño:

- En las ventas, el POS manda el vaso de la bebida, Regular o Large.
- En Costeo, la receta del combo solo tenía tamaño Único, con el vaso chico.
- Por eso no se costeaba ni el Regular, aunque es justo la receta.

Del 6-oct al 2-nov fueron $91.5k en 710 ventas, casi todas de mostrador y app.

Carlo, 2026-11-03: «Si crealo para poder costear bien, dices que el POS si lo especifica entonces con eso la armamos».

## Evidencia (API The Coffee, 13 sucursales, 20-oct a 2-nov, solo lectura)

| Combo (código POS) | Regular | Large |
| --- | --- | --- |
| Iced Latte + Ham & Cheese Sandwich (MISICEDAPP) | $119, Regular - 440ml a $0 | Large - 600ml a +$10 |
| True White + Croissant filled with cheese and ham (TRWCROAPP) | $115, Regular - 240ml a $0 | Large - 355ml a +$10 |
| True White + Croissant Serrano & Gouda (TRUGOUAPP) | $130, Regular - 240ml a $0 | Large - 355ml a +$10 |
| True White + Grilled Ham & Cheese Sandwich (TRUMISAPP) | $119, Regular - 240ml a $0 | (casi no se vende) |

Las ventas con descuento cobran el Large en proporción ($9, $8, $6).

## Lote `tamanos-combos-lote-1`

Cargador: `tamanos-producto.ts` (doc 42). Manifiesto `45-tamanos-combos-lote-1.manifiesto.json`, sha256 `fd093436…`. Generador:
`manifiestos45.py`, en la sesión de trabajo, a partir de la lectura de producción del 2026-11-03.

- **Chica:** es la receta Único actual, sin cambios. Su bebida es la Chica de la bebida suelta, con el mismo café, leche, vaso y
  tapa. El generador lo comprueba línea por línea.
- **Grande:** la misma receta con la bebida Grande de su receta suelta.
  - Iced Latte: vaso de 20 oz y 290 ml de leche.
  - True White: vaso de 12 oz, tapa de 90 mm y 250 ml de leche.
  - El producto del combo y los empaques no cambian.

| Combo | Costo Chica | Costo Grande | Precio de lista Chica / Grande |
| --- | --- | --- | --- |
| Iced Latte + Ham & Cheese Sandwich | $55.2913 | $58.1313 | $119 / $129 |
| True White + Croissant filled with cheese and ham | $49.5240 | $51.4840 | sin precio, como hoy |
| True White + Croissant Serrano & Gouda | $53.8839 | $55.8439 | $125 / $135 |
| True White + Grilled Ham & Cheese Sandwich | $54.5913 | $56.5513 | $119 / $129 |

Las diferencias de la Grande son las mismas que tiene la bebida suelta: +$2.84 en el Iced Latte y +$1.96 en el True White.
El precio de la Grande es el de la Chica más los $10 que cobra el POS.

El **precio manual de Rappi** del Iced Latte + Ham & Cheese ($151) queda en la Chica. En el Gelato del doc 42 se pasó a la
Grande porque Rappi solo vende un tamaño; aquí Rappi vende los dos.

Lo que no cambia, y conviene revisar:

- **Hielo:** al Iced Latte + Ham & Cheese le falta el hielo del Iced Latte, en la Chica y en la Grande. Ya era así (combos.ts).
- **Precio de lista del Serrano & Gouda:** es $125, pero el POS cobra $130.
- **Precio del True White + Croissant de jamón:** el combo no tiene precio de lista, y el POS cobra $115.

**Código:** `TAMANOS_VERIFICADOS` declara Regular → Chica y Large → Grande en los 4 combos, y la lista queda en 42. Consumo no
cambia: ya separaba estos combos en sus productos con el vaso del ticket (`combos.ts`).

## Efecto esperado

Se midió sobre las ventas del 6-oct al 2-nov con las reglas del #89:

- Hasta **+2.8 puntos** de costeo completo: de 79.3 % a cerca de 82.2 %, con $91.5k en 710 ventas.
- 8 ventas sin vaso (4 de Rappi por la API y 4 de la app, $1.2k) dejan de costearse: un combo de dos tamaños necesita el vaso.

## Ensayo local

Se hizo sobre una copia del respaldo `2026-11-03T1725Z` (24,965 filas, iguales a producción), que se borró al terminar.

| Paso | Resultado |
| --- | --- |
| Ensayo | 4 combos cambiados con los costos esperados; 103 registros propios, 0 ajenos; resto y costos sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | revertido; la copia queda idéntica al respaldo (tamaños, precios manuales, cantidades y costos) |

Los informes están en el respaldo privado, en `informes-tamanos-combos-45`.

## Ensayo remoto (2026-11-03, aprobado por Carlo)

Corrió con ROLLBACK. Antes, producción tenía 185 recetas, 249 tamaños, 83 precios manuales, 110 enlaces y bitácora hasta #1752.

- Resultado: 4 combos cambiados con los costos esperados; 103 registros propios, 0 ajenos; el resto y los demás costos sin cambios.
- Con una conexión nueva, producción sigue idéntica: mismos conteos, misma huella de costos y de cantidades.

## Carga (2026-11-03, aprobada por Carlo)

Antes de escribir se comprobó que producción seguía como en el ensayo remoto: mismos conteos, bitácora hasta #1752 y las mismas
huellas de costos y cantidades. El respaldo previo es el `2026-11-03T1725Z`; producción no cambió entre el respaldo y la carga.

| Paso | Resultado |
| --- | --- |
| Aplicar | 4 combos cambiados; 103 registros propios (#1856–1958), 0 ajenos; resto y demás costos sin cambios; COMMIT |
| Repetir el ensayo | «sin cambio»; 0 registros |

Producción quedó con 253 tamaños; los demás conteos no cambiaron. Leído después de la carga:

| Combo | Chica | Grande |
| --- | --- | --- |
| Iced Latte + Ham & Cheese Sandwich | $119, costo $55.2913, Rappi $151 | $129, costo $58.1313 |
| True White + Croissant filled with cheese and ham | sin precio, costo $49.5240 | sin precio, costo $51.4840 |
| True White + Croissant Serrano & Gouda | $125, costo $53.8839 | $135, costo $55.8439 |
| True White + Grilled Ham & Cheese Sandwich | $119, costo $54.5913 | $129, costo $56.5513 |

Entre el #1752 y el #1856 no hay registros: son ids que consumieron los ensayos que terminaron en ROLLBACK. La reversión está
en `REVERSION.md`, en el respaldo privado `informes-tamanos-combos-45`.

## Orden propuesto

1. Ensayo remoto.
2. Carga.
3. Merge.

Si el código entra antes que la carga, las ventas con vaso siguen como parciales, igual que hoy. Ningún orden deja un costo
equivocado.
