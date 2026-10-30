# 40 · Actualización de la base con el costeo del equipo (Costeo_TheCoffee.xlsx)

**Estado:** preparado el 2026-10-30, con manifiestos, pruebas, respaldo verificado y ensayo local. **Sin ensayo remoto,
sin aplicar y sin merge.** Carlo pidió no hacer merge porque otro chat trabaja en paralelo. Cada paso remoto y el merge
requieren su aprobación expresa.

## Origen

`Costeo_TheCoffee.xlsx` es el costeo que mantiene el equipo, con dos hojas: Insumos (168) y Recetario (170 productos).
Su sha256 es `163b9832…`. Se cotejó contra la base en producción el 2026-10-30:

- 173 productos por tamaño iguales;
- 43 diferentes: 41 por la receta y 2 por el precio de un insumo;
- 5 que solo existen en el Excel y 21 que solo existen en la base.

El reporte completo es `entregables/Cotejo_Costeo_TheCoffee_vs_base_2026-10-30.xlsx`.

Carlo indicó que el Excel es el más actualizado: agregar lo que nos falta y corregir según el Excel. Las diferencias ya
explicadas no se tocan. Los productos duplicados del Excel (el mismo nombre en mayúsculas y en minúsculas) no se dan de
alta: se queda nuestra versión.

## Decisiones de Carlo (2026-10-30)

| Tema | Decisión |
| --- | --- |
| Pan de Muerto ($28.02 en el Excel) | **Se queda en $15.86.** $28.02 es el «precio máximo ideal por pieza» del brief, no el precio del proveedor (doc 39) |
| Empaques: tapas, vasos, popotes, bolsas y etiquetas | **Se queda la base** |
| Cantidades de ingredientes | **Las del Excel** |
| Croissant Serrano & Gouda (2.5 piezas de serrano en el Excel) y Kit Café White 1kg (4 bolsas de 250 g) | **Se queda la base** |
| Ya explicadas: Mug y Félix (doc 34), Cold brew y Urban (lotes 2 y 3b), hielo de las Fresh Sodas (lote PDF 1), categorías de las bases de frappé (doc 32), redondeo de Califia | No se tocan |

Además, por convención de la base, no se copian el **agua del espresso** ni el **hielo** que el Excel trae en algunas
recetas (Salted Caramel, Macchiato, Gelato Frappé Matcha, Iced Blueberry Matcha y Matcha Iced Mint):

- su costo es $0;
- el hielo en gramos viene de lotes ya aprobados;
- el resto de las bebidas con espresso de la base tampoco lleva esa agua.

## Lote `altas-excel-lote-1`

Cargador: `altas-productos.ts` (doc 31). Manifiesto `40-altas-excel-lote-1.manifiesto.json`, sha256 `a3119770…`.

| Alta | Composición | Costo |
| --- | --- | --- |
| Insumos MACADAMIA COOKIE, COOKIE MATCHA & WHITE CHOCOLATE y SALTED CARAMEL COOKIE | $24.50 / 1 pza · OH LALA · PANADERIA | $24.50 |
| Espresso Tonic (Cold, Chica y Grande) | Café White 18 g, tónica 170/290 ml, hielo (g) 130/245, vaso 14/20 oz, tapa y popote | $19.7405 / $25.6162 |
| Macadamia Cookie, Cookie Matcha & White Chocolate y Salted Caramel Cookie (Sweets, Único) | pieza + bolsa + etiqueta, como Cookie Triple Chocolate | $26.6504 c/u |

Ninguno lleva precio de lista. Sus códigos POS (ESPTONAPP, COOMACAPP, COOMATAPP y COOCARAPP) se enlazan en un lote
aparte después de crearlos, porque el enlace necesita los ids de las recetas nuevas.

## Lote `recetas-excel-lote-1` (cargador nuevo `recetas-ajustes.ts`)

Ninguno de los cargadores que ya existían podía hacer estos cambios:

- **`recetas-correcciones` y `recetas-pdf`:** no agregan líneas y no permiten que el costo cambie.
- **`insumos-catalogo`:** no cambia costos.

**`recetas-ajustes.ts`** trabaja por nombre y en una sola transacción. Hace cuatro tipos de cambio:

- cantidades;
- cambio del insumo de una línea, aunque cambie el costo;
- líneas nuevas;
- costo del paquete de un insumo.

Sus garantías:

- **Bloqueo optimista:** versión exacta de cada receta y cada valor previo exacto.
- **Idempotencia:** si todo ya está en el estado nuevo, el resultado es «sin cambio»; cualquier estado mezclado se detiene.
- **Composición:** fuera de lo declarado, las recetas del lote no cambian.
- **Costos:** cada producto y tamaño declarado pasa de su costo previo al nuevo, y **ningún otro costo** de producto o
  subreceta puede cambiar.
- **Bitácora exacta:** un registro por costo, por cambio de insumo y por cantidad, y uno por línea nueva más uno por cada
  cantidad suya.
- **Huellas:** del resto de la base.
- **Reversión por ejecución:** se niega si hubo cambios posteriores.

Manifiesto `40-recetas-excel-lote-1.manifiesto.json`, sha256 `18b09ac8…`.

| Receta | Cambio (base → Excel) | Costo |
| --- | --- | --- |
| Iced Latte + Ham & Cheese Sandwich | pavo 40→30 g, queso crema 10→30 g, mozzarella 20→40 g | $52.18 → $55.29 |
| True White + Grilled Ham & Cheese Sandwich | ídem | $51.48 → $54.59 |
| Misto + Tomate Cereja | pavo 40→30 g, queso crema 10→20 g | $38.45 → $36.82 |
| Iced Blueberry Matcha | jarabe de blueberry 15→10 ml (Chica y Grande) | $16.78 → $15.61 · $20.87 → $19.70 |
| Matcha Iced Mint | mix de matcha Grande 45.02→36.05 ml (igual que la Chica) | Grande $20.80 → $19.55 |
| Fresh Soda Pink Lemonade | Grande: tónica 232→220 ml, fresa 41→40 g | Grande $22.25 → $21.55 |
| Fresh Soda Passion fruit | Grande: maracuyá 82→70 ml, tónica 232→220 ml | Grande $32.07 → $29.11 |
| Salted Caramel | jarabe de caramelo → salsa de caramelo (5 ml) | $20.04 → $19.80 · $22.88 → $22.64 |
| Salted Caramel Frap | + jarabe de caramelo 5 ml | $24.14 → $25.29 · $26.80 → $27.95 |
| Macchiato | + vaso espresso 4 oz | $14.74 → $15.30 |
| Insumo COOKIE FULLY BAKED TRIPLE CHOCOLATE | $22.49 → $24.50 (Excel: «COOKIE TRIPLE CHOCOLATE», OH LALA) | Cookie Triple Chocolate $24.64 → $26.65 |

Los costos nuevos coinciden con el Excel al centavo. Las únicas diferencias son Matcha Iced Mint Grande ($19.548 contra
$19.544) e Iced Blueberry Matcha Chica ($15.608 contra $15.604), por el redondeo del matcha en la base.

## Verificación local

**Pruebas:**

- 8 pruebas nuevas en `tests/db/recetas-ajustes.test.ts`: validación, huella, roles, ensayo, aplicar, repetir, revertir,
  reversión con cambios posteriores, costo no declarado, versión distinta y estado mezclado.
- Una prueba por cada lote real.
- 39 pruebas en total con las de altas y lotes.
- `tsc` sin errores.

**Respaldo `2026-10-30T1704Z`**, restaurado en `resp1704`:

- 0 errores fuera de `vault`;
- 23,953 filas, iguales a producción.

**Ensayo sobre una copia del respaldo**, borrada al terminar:

| Paso | altas-excel-lote-1 | recetas-excel-lote-1 |
| --- | --- | --- |
| Ensayo | 4 productos y 3 insumos con el costo esperado; 49 registros propios, 0 ajenos; resto sin cambios; ROLLBACK | 11 cambios (10 recetas y 1 insumo); 22 registros propios, 0 ajenos; 14 costos declarados y ninguno más; ROLLBACK |
| Aplicar | COMMIT | COMMIT |
| Repetir | 4 «sin cambio» | 11 «sin cambio» |
| Revertir | 4 borrados | 11 revertidos |

Después de revertir, la copia quedó idéntica al respaldo: recetas, cantidades, costos e insumos.

Los informes se guardaron en el respaldo privado, `informes-excel-40`.

## Procedimiento remoto (cada paso y el merge requieren aprobación)

Carlo avisa cuándo se sube, para no pisar el trabajo del otro chat.

1. Respaldo nuevo si la base cambió desde `2026-10-30T1704Z`.
2. Ensayo remoto con ROLLBACK de los dos lotes:
   - `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-excel-lote-1 --usuario <uuid-perfil>`
   - `npx tsx scripts/conciliacion/recetas-ajustes-aplicar.ts --lote recetas-excel-lote-1 --usuario <uuid-perfil> --informes <carpeta privada>`
3. Aplicar los dos con `--aplicar --confirmo jpqkmnfjwzniptszjuli`.
4. Verificar con una conexión nueva y repetir el ensayo, que debe dar «sin cambio».
5. Lote de enlaces POS para ESPTONAPP, COOMACAPP, COOMATAPP y COOCARAPP.
6. Merge del PR.

Si una receta del lote cambia antes de aplicar (otra versión), el cargador se detiene. En ese caso hay que regenerar el
manifiesto.

## Coordinación con el chat de Rappi y Consumo (2026-10-30)

**Rama al día:** la rama ya incluye main hasta el #73, sin conflictos. Los únicos archivos en común son `altas-productos.ts`
y su prueba, y el lote `pan-de-muerto-lote-1` se conserva. Con eso pasan 316 pruebas (las de `tests/db` del cargador y
las del portal) y `tsc` sale sin errores. Según el otro chat, el #71 sobre main con el #73 y el #74 tampoco tiene
conflictos (609 pruebas).

**Revalidación en solo lectura contra producción (2026-10-30):**

- 177 recetas, 167 insumos y bitácora hasta #1456;
- las 10 versiones de receta y los 14 costos previos son los del manifiesto;
- ninguno de los 4 productos ni de los 3 insumos nuevos existe;
- la Cookie Triple Chocolate sigue en $22.49.

Antes del ensayo remoto toca un respaldo nuevo y repetir esta revalidación.

**Pure Black (Double Shot):** según la regla final del #74, Single y Double llevan 18 g de café. Los 18 g de la base son
correctos y el #71 no los cambia.

**Después de aplicar el #71:**

- **Enlaces POS** para ESPTONAPP, COOMACAPP, COOMATAPP y COOCARAPP. Con el #73, la Cookie Matcha de Rappi ya está ligada
  a COOMATAPP y empieza a contar en cuanto ese código tenga enlace.
- **Espresso Tonic:** su receta lleva 18 g de café, un shot. El otro chat debe agregarlo a la regla de shots y poner
  «Traditional Tonic» como personalización neutra en `personalizaciones-verificadas.ts`. Si no, sus ventas con shot
  quedan fuera de Consumo.
