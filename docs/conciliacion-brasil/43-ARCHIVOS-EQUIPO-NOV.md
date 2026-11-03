# 43 · Archivos del equipo (noviembre): 3 altas del POS y cookies a $22.49

**Estado:** los dos lotes quedaron **APLICADOS** en producción el 2026-11-03 con aprobación de Carlo:

- altas: ejecución `ba906ccd…`, bitácora #1716–1742;
- cookies: ejecución `1de17650…`, bitácora #1743–1746.

Faltan el lote-10 de enlaces y el merge. Cada uno requiere la aprobación expresa de Carlo.

## Fuente

El equipo mandó cuatro archivos el 2026-11-02:

| Archivo | Contenido |
| --- | --- |
| `Materia_Prima_ALTA_Nov2026.xlsx` (sha256 `1533b917…`) | 26 insumos con proveedor, costo y presentación |
| `Recetario_ALTA_Nov2026.xlsx` (sha256 `5b970fe3…`) | 46 productos con sus ingredientes |
| `Recetario_Productos_en_Cero.xlsx` | 38 productos que en Zoho salen en $0 |
| `Ventas_y_Costo.csv` | 54,774 ventas sin costo en Zoho, del 27-abr-2024 al 1-nov-2026 |

El cotejo contra producción (lectura del 2026-11-03) se entregó a Carlo en `entregables/Cotejo_archivos_equipo_Nov2026.xlsx`.
Ese archivo queda fuera del repositorio. Resultado:

- **Faltan en la base 3 productos que vende el POS.** Van en el lote de altas.
- **El costo de las cookies difiere:** el equipo dice $22.49 y la base tiene $24.50. Va en el lote de costos.
- **Ya resueltos en la base:**
  - Crea Tu The Coffee, que se costea por partes;
  - Pan de Muerto;
  - True White + Pan de Muerto;
  - los 30 productos en cero que tenemos. En Zoho salen en $0 por diferencias de nombre.
- **Zoho está atrasado** en 4 recetas que la base ya corrigió (docs 40 y 42). No se toca Zoho.
- **El resto no se vende** ni en el POS ni en Rappi, así que no se importa.

## Decisiones de Carlo (2026-11-03)

- **Cookies:** «Sí, $22.49». Es el archivo más reciente del equipo y coincide con el costo que tenía la Triple Chocolate antes
  del doc 40. Aplica a las 4 cookies de OH LALA.
- **Empaques:** como en la base, decisión del doc 40. Toda la panadería y los sándwiches por pieza llevan bolsa y etiqueta.
  - El recetario del equipo pone bolsa y etiqueta al Spooky Biscuit y al Croque Monsieur.
  - Al croissant de jamón curado solo le pone la pieza. Aquí se arma con bolsa y etiqueta como el resto de los croissants.
  - El recetario oficial (Canva) sirve el Croque en mesa, en tabla con servilleta. Se costea con bolsa y etiqueta, igual que el
    resto de los sándwiches.

## Lote `altas-equipo-nov-lote-1`

Cargador: `altas-productos.ts`. Manifiesto `43-altas-equipo-nov-lote-1.manifiesto.json`, sha256 `1c55cbc2…`.

| Alta (nombre exacto del POS) | Código POS | Categoría | Insumo nuevo (OH LALA, PANADERIA) | Costo |
| --- | --- | --- | --- | --- |
| Spooky Biscuit | SPOBISAPP | Sweets | SPOOKY BISCUIT, $22.49 pza | $24.6404 |
| Croque Monsieur | CROQMNAPP | Sandwiches | CROQUE MONSIEUR, $35.55 pza | $37.7004 |
| Croissant filled with cheese and cured ham | CROPORAPP | Bakery | CROISSANT FILLED WITH CHEESE AND CURED HAM, $67 pza | $69.1504 |

- Cada producto es pieza + BOLSAS PARA PAN ($1.30) + ETIQUETAS THE COFFEE ROLLO ($0.8504), en tamaño Único.
- No llevan precio de lista, igual que las cookies del doc 40.
- Ventas del POS del 15 al 28 de octubre:
  - Spooky Biscuit: 272 unidades en 119 sucursales. Rappi «Spooky Biscuits» ya se liga a SPOBISAPP (#73).
  - Croque Monsieur: 17 unidades, solo en Polanco.
  - Croissant de jamón curado: está en el menú, sin ventas en la muestra.
- Los enlaces de los 3 códigos van en el **lote-10** (cargador `enlaces-pos.ts`; requiere el lote-9). Se prepara cuando las
  altas estén aplicadas y existan los ids de las recetas.

## Lote `recetas-equipo-nov-lote-1`

Cargador: `recetas-ajustes.ts`, solo costos de insumo. Manifiesto `43-recetas-equipo-nov-lote-1.manifiesto.json`, sha256
`46601ae2…`.

| Insumo (OH LALA) | Costo previo | Costo nuevo | Producto | Costo del producto |
| --- | --- | --- | --- | --- |
| MACADAMIA COOKIE | $24.50 | $22.49 | Macadamia Cookie | $26.6504 → $24.6404 |
| COOKIE MATCHA & WHITE CHOCOLATE | $24.50 | $22.49 | Cookie Matcha & White Chocolate | $26.6504 → $24.6404 |
| SALTED CARAMEL COOKIE | $24.50 | $22.49 | Salted Caramel Cookie | $26.6504 → $24.6404 |
| COOKIE FULLY BAKED TRIPLE CHOCOLATE | $24.50 | $22.49 | Cookie Triple Chocolate | $26.6504 → $24.6404 |

- Ninguna otra receta ni subreceta usa estos insumos. Los combos con cookie usan COOKIE TRADICIONAL ($22.49) o TRADITIONAL
  COOKIE, que no cambian.
- El cargador exige un perfil de compras o admin.

## Ensayo local

Se hizo sobre una copia del respaldo `2026-11-03T1604Z`, que se borró al terminar.

- El respaldo tiene 24,871 filas, iguales a producción.
- Producción tenía 182 recetas, 170 insumos, 107 enlaces y bitácora hasta #1684.

| Lote | Ensayo | Aplicar | Repetir | Revertir |
| --- | --- | --- | --- | --- |
| altas-equipo-nov-lote-1 | 3 productos y 3 insumos creados, costos esperados; 27 registros propios, 0 ajenos; resto sin cambios; ROLLBACK | COMMIT | «sin cambio» | borrado |
| recetas-equipo-nov-lote-1 | 4 costos de insumo cambiados; 4 registros propios, 0 ajenos; resto sin cambios; ROLLBACK | COMMIT | «sin cambio» | revertida |

Después de revertir los dos lotes, la copia quedó idéntica al respaldo: misma huella de insumos, recetas y líneas, 246 tamaños y
107 enlaces. Los informes están en el respaldo privado, en `informes-equipo-nov-43`.

`altas-productos-aplicar.ts` no acepta `--informes` y escribe en `docs/conciliacion-brasil/43-informes/`. Al terminar, esos
informes se mueven al respaldo privado y nunca se suben al repositorio.

## Ensayo remoto (2026-11-03, aprobado por Carlo)

Corrió con ROLLBACK. Antes, producción tenía 182 recetas, 170 insumos, 246 tamaños, 107 enlaces y bitácora hasta #1684.

| Lote | Resultado |
| --- | --- |
| altas-equipo-nov-lote-1 | 3 productos y 3 insumos creados, con los costos esperados; 27 registros propios, 0 ajenos; resto sin cambios; ROLLBACK |
| recetas-equipo-nov-lote-1 | 4 costos de insumo cambiados; los 4 productos pasan de $26.6504 a $24.6404; 4 registros propios, 0 ajenos; resto sin cambios; ROLLBACK |

Con una conexión nueva, producción sigue idéntica: mismos conteos, misma huella de costos y de insumos.

## Aplicación (2026-11-03, aprobada por Carlo)

Respaldo previo `2026-11-03T1617Z`: 24,873 filas, iguales a producción. Antes de escribir se comprobó que producción seguía como
en el ensayo: mismos conteos, bitácora hasta #1684 y las mismas huellas de costos e insumos.

| Lote | Resultado |
| --- | --- |
| altas-equipo-nov-lote-1 | 3 productos y 3 insumos creados; 27 registros propios (#1716–1742), 0 ajenos; resto sin cambios; COMMIT |
| recetas-equipo-nov-lote-1 | 4 costos de insumo cambiados; 4 registros propios (#1743–1746), 0 ajenos; resto sin cambios; COMMIT |

Entre el #1684 y el #1716 no hay registros: son ids que consumieron las transacciones de ensayo que terminaron en ROLLBACK.

Recetas nuevas:

- Spooky Biscuit: `c6640374-ac27-4f48-9530-fd2621fab738`, $24.6404
- Croque Monsieur: `fe0b4275-b5d9-4230-9baa-4b306a0f7571`, $37.7004
- Croissant filled with cheese and cured ham: `494e00ff-ef59-4c7c-b50a-e3066f0c2a18`, $69.1504

Las 4 cookies quedaron en $24.6404. Al repetir el ensayo, los dos lotes dan «sin cambio» y 0 registros. La reversión está en
`REVERSION.md`, en el respaldo privado `informes-equipo-nov-43`.

## Pendiente

1. Lote-10 de enlaces: SPOBISAPP, CROQMNAPP y CROPORAPP.
2. Merge.

Cada paso requiere el OK de Carlo.
