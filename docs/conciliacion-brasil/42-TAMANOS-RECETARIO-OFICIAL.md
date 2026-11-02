# 42 · Tamaños verificados con el recetario oficial 2026 y dos correcciones del #71

**Estado:** **APLICADO en producción el 2026-11-02**, con aprobación de Carlo:

- `recetas-recetario-lote-1`: ejecución `7d6efac5…`, bitácora #1646–1648;
- `tamanos-gelato-lote-1`: ejecución `ac195ad0…`, bitácora #1649–1684.

El código (tamaños verificados, vaso de Rappi y Chipotle Mayo) entra con el merge de este PR, después de aplicar los lotes. Cada paso remoto y el merge requieren aprobación expresa de Carlo.

## Origen

En Consumo de Namóra salían líneas con «Tamaño sin verificar»:

- **1 de noviembre (11 líneas):** Gelato Frappé Coffee (5), Gelato Frappé Matcha (2), Matcha Iced Mint (2), Fresh Soda
  Passion fruit (1) y Fresh Soda Pink Lemonade (1).
- **2 de noviembre (3 líneas):** Gelato Frappé Coffee (2) y Matcha Iced Mint (1).

Carlo pidió cotejarlas con el recetario. La fuente es el **RECETARIO OFICIAL 2026** («Manual de Preparación de Bebidas y
Alimentos», Canva), leído el 2026-11-02 sin editarlo.

## Lo que dice el recetario

| Producto | Página | Regular (440 ml) | Grande (600 ml) | Nuestra base |
| --- | --- | --- | --- | --- |
| Fresh Soda Passion fruit | 44 | 60 g pulpa, 130 g hielo, 170 ml agua con gas | 70 g, 245 g, 220 ml | Chica y Grande iguales |
| Fresh Soda Pink Lemonade | 43 | 15 g limón, 30 g fresa, 130 g hielo, 170 ml | 20 g, 40 g, 245 g, 220 ml | Iguales (Chica con 16 g de limón) |
| Matcha Iced Mint | 37 | 36 ml matcha, 130 g hielo, 170 ml leche, 15 ml menta | **45 ml**, 245 g, 290 ml, 15 ml | Chica igual; Grande con **36 ml** |
| Iced Blueberry Matcha | 59 | 36 ml matcha, 130 g hielo, 170 ml leche, **15 ml** jarabe | 45 ml, 245 g, 290 ml, 15 ml | Matcha, hielo y leche iguales; jarabe en **10 ml** |
| Gelato Frappé Coffee | 46 | 36 ml café, 150 g helado, 100 ml leche | 36 ml, **200 g**, **140 ml** | Un solo tamaño (Único), igual al Regular |
| Gelato Frappé Matcha | 48 | 36 g matcha, 150 g helado, 100 ml leche | 36 g, **200 g**, **140 ml** | Un solo tamaño (Único), igual al Regular |

En el Iced Blueberry Matcha, 10 ml es la opción «Menos». En las dos recetas, el valor de la base salió del Excel del
equipo en el #71 (doc 40) y el recetario oficial lo contradice.

## Cambios

**Código** (`lib/sucursales/tamanos-verificados.ts`): Regular → Chica y Large → Grande en Fresh Soda Passion fruit, Fresh
Soda Pink Lemonade, Matcha Iced Mint e Iced Blueberry Matcha. La lista pasa de 31 a 35 productos.

**Lote `recetas-recetario-lote-1`** (cargador `recetas-ajustes.ts`, doc 40). Manifiesto
`42-recetas-recetario-lote-1.manifiesto.json`, sha256 `e8299d3b…`. El `sha256` de la fuente es la huella de la referencia
del recetario (páginas y cantidades), porque el recetario no es un archivo descargado.

| Receta | Cambio | Costo |
| --- | --- | --- |
| Iced Blueberry Matcha | jarabe de blueberry 10 → 15 ml (Chica y Grande) | $15.61 → $16.78 · $19.70 → $20.87 |
| Matcha Iced Mint | mix de matcha Grande 36.05 → 45.02 ml | Grande $19.55 → $20.80 |

Los dos vuelven exactamente a los valores que tenían antes del #71.

**Ensayo sobre una copia del respaldo `2026-10-30T1929Z`**, borrada al terminar:

| Paso | Resultado |
| --- | --- |
| Ensayo | 2 recetas y 3 celdas; 3 registros propios, 0 ajenos; los 3 costos declarados y ninguno más; resto sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | vuelve a los valores previos |

Los informes se guardaron en el respaldo privado, `informes-recetario-42`.

## Gelato Frappés: Chica y Grande (Carlo, 2026-11-02)

Carlo pidió revisar si el POS y Rappi venden las dos tallas, y agregarlas si el dato llega bien.

**POS** (API, 13 sucursales, 19-oct a 1-nov): el vaso llega en la línea como «Regular - 440ml» o «Large - 600ml», y el
Large cobra +$10.

| Producto | Regular | Large | Sin vaso |
| --- | --- | --- | --- |
| Gelato Frappé Coffee (SHCO) | 108 (+11 sin código) | 106 (+11) | 4 |
| Gelato Frappé Matcha (SHMA) | 46 (+2) | 46 (+1) | 1 (+1) |
| Gelato Frappé Chai (SHCI) | — | — | 75 (+4): siempre sin vaso |

**Rappi** (portal de Namóra): solo vende el Gelato Frappé Coffee, sin opción de tamaño. La única opción que trae es la
leche (deslactosada o avena): 8 renglones y 13 unidades en 2 tiendas, del 2 al 22 de octubre. Con la regla del
2026-10-29 («lo que Rappi vende sin tamaño es el grande»), entra como Large - 600ml.

**Cambios:**

- **Lote `tamanos-gelato-lote-1`** (cargador nuevo `tamanos-producto.ts`; manifiesto `42-tamanos-gelato-lote-1.manifiesto.json`,
  sha256 `d8eaa55d…`). Coffee y Matcha pasan de Único a Chica y Grande:
  - **Chica:** la receta Único actual, que es la Regular del recetario.
  - **Grande:** 200 g de helado, 140 ml de leche, el mismo café o matcha, vaso de 20 oz, tapa y popote, como Coffee Frap y
    Matcha Frap.

  | Producto | Precio de lista | Precio manual de Rappi | Costo |
  | --- | --- | --- | --- |
  | Gelato Frappé Coffee | Chica $94, Grande $104 | $129, pasa del Único al Grande | $22.90 · $26.98 |
  | Gelato Frappé Matcha | Chica $90, Grande $100 | $112, pasa del Único al Grande | $20.72 · $24.80 |

  El precio de la Grande es el de la Chica más los $10 que cobra el POS. El precio manual de Rappi es el del menú del
  2026-10-07.
- **Código:**
  - `tamanos-verificados.ts`: Regular → Chica y Large → Grande en Coffee y Matcha. La lista queda en 37.
  - `rappi-pos.ts`: «gelato frappé coffee» sin tamaño se lee como Large - 600ml.
- **Fuera:** el Gelato Frappé Chai se queda de tamaño Único, porque el POS lo vende sin vaso. Mocha, Chocolate y Horchai no
  vienen en el recetario. Las pocas ventas de Coffee y Matcha sin vaso quedan sin tamaño verificado.

**Cargador `tamanos-producto.ts`:**

- En una transacción: alta de los tamaños con su precio de lista y precios manuales; las cantidades del Único pasan a la
  Chica; se agregan las de la Grande y la línea del vaso de 20 oz; baja del Único, cuyo precio manual cae en cascada.
- Bloqueo optimista por versión y estado previo exacto (tamaños, precios, manuales y líneas).
- Costos esperados por tamaño; ningún otro costo cambia.
- Bitácora exacta y huellas del resto.
- Reversión por ejecución, que deja el producto exactamente como estaba.
- 5 pruebas.

**Ensayo sobre una copia del respaldo `2026-10-30T1929Z`**, borrada al terminar:

| Paso | Resultado |
| --- | --- |
| Ensayo | 2 productos cambiados; 36 registros propios, 0 ajenos; costos de Chica y Grande como los declarados; resto sin cambios; ROLLBACK |
| Aplicar | COMMIT |
| Repetir | «sin cambio» |
| Revertir | vuelve al estado previo |

Después de revertir, la copia quedó idéntica al respaldo: tamaños, precios manuales, líneas y cantidades.

## Respaldo y ensayo remoto (2026-11-02)

**Respaldo `2026-11-02T2333Z`**, restaurado en `resp2333`: 24,747 filas, iguales a producción; 0 errores fuera de `vault`.

**Antes del ensayo, producción tenía:** 182 recetas, 244 tamaños, 83 precios manuales y bitácora hasta #1606.

| Lote | Resultado (ROLLBACK) |
| --- | --- |
| `recetas-recetario-lote-1` | 2 recetas y 3 celdas; 3 registros propios, 0 ajenos; los 3 costos declarados y ninguno más |
| `tamanos-gelato-lote-1` | 2 productos pasan a Chica y Grande; 36 registros propios, 0 ajenos; Coffee $22.90 / $26.98 y Matcha $20.72 / $24.80; resto sin cambios |

Después, con una conexión nueva, producción sigue idéntica: los mismos conteos y la misma huella de costos.

**V60 (Carlo, 2026-11-02):** se queda como está.

**Rappi:** hoy vende el Gelato Frappé Coffee en un solo tamaño y se lee como Large, pero Rappi va a agregar la opción. Si
llega como «Elige el tamaño» (mediano 440 ml / grande 590 ml), `rappi-pos.ts` ya la traduce y deja de suponer el Large. Si
llega con otro nombre, la opción quedará sin traducir y se agrega cuando aparezca.

## Aplicación en producción (2026-11-02, aprobada por Carlo después de ver el ensayo)

Antes se comprobó que producción seguía igual que en el ensayo.

| Paso | Resultado |
| --- | --- |
| `recetas-recetario-lote-1` | 2 recetas cambiadas; 3 registros propios (#1646–1648), 0 ajenos; costos como los declarados; COMMIT |
| `tamanos-gelato-lote-1` | 2 productos en Chica y Grande; 36 registros propios (#1649–1684), 0 ajenos; resto sin cambios; COMMIT |
| Conexión nueva | 182 recetas, 246 tamaños, 83 precios manuales y bitácora hasta #1684. Gelato Frappé Coffee: Chica $94 (costo $22.90) y Grande $104 (costo $26.98, Rappi $129). Matcha: Chica $90 ($20.72) y Grande $100 ($24.80, Rappi $112) |
| Repetir los ensayos | 2 y 2 «sin cambio», 0 registros |

La reversión, con las ejecuciones completas, está en el respaldo privado (`informes-doc-42/REVERSION.md`). Se hace en orden
inverso: primero los tamaños y después las recetas.

## Procedimiento remoto (cada paso requiere aprobación)

1. ~~Respaldo nuevo~~ (hecho: `2026-11-02T2333Z`).
2. ~~Ensayo remoto con ROLLBACK de los dos lotes~~ (hecho, limpio):
   - `npx tsx scripts/conciliacion/recetas-ajustes-aplicar.ts --lote recetas-recetario-lote-1 --usuario <uuid-perfil> --informes <carpeta privada>`
   - `npx tsx scripts/conciliacion/tamanos-producto-aplicar.ts --lote tamanos-gelato-lote-1 --usuario <uuid-perfil> --informes <carpeta privada>`
3. ~~Aplicar los dos, verificar y repetir el ensayo~~ (hecho).
4. Merge del PR. El código de tamaños y el vaso de Rappi entran con el merge, después de aplicar los lotes.
