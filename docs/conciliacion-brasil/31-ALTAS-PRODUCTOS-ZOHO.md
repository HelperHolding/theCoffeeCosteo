# 31 · Alta de 11 productos del recetario de Zoho

**Estado:** ✅ **aplicado el 2026-10-28 (00:59 UTC) y verificado.** Ejecución `b0cc45a6-3d01-440c-9042-4eaa9abc99ea`, bitácora **#871–1099** (229 registros); segundo ensayo con 11 «sin cambio». Ver el §5. El ensayo remoto y la aplicación contaron con la aprobación expresa de Carlo.

**Contexto:** en el cotejo del «Recetario The Coffee Marzo 2026» de Zoho Analytics, 11 productos no existían en nuestra base. Carlo aprobó la propuesta de alta (`entregables/Altas_11_productos_propuesta.xlsx`). Se siguen las convenciones de nuestra base:
- hielo en gramos (`HIELO (g)`);
- sin contar el agua del espresso;
- preparados como subreceta, con las mismas cantidades que Zoho;
- combos armados con nuestras recetas de sus componentes.

No se cargó nada en Zoho.

- Manifiesto: `31-altas-zoho-lote-1.manifiesto.json`, sha256 `f132a72b…`.
- Script: `scripts/conciliacion/altas-productos.ts`.
- CLI: `altas-productos-aplicar.ts`.
- Pruebas: `tests/db/altas-productos.test.ts`.

## 1. Productos

| Producto | Categoría | Tamaños | Costo actual esperado | Cómo se arma |
|---|---|---|---|---|
| Chai Iced Ginger | Cold | Chica / Grande | $15.74 / $19.88 | Mix CHAI 36/45 (el chai de Zoho, 4/5 g, más el agua, 32/40 ml), jengibre, leche, hielo 130/245 (**supuesto**: Zoho trae el hielo dos veces) |
| Ichigo Chocolate | Cold | Chica / Grande | $19.80 / $26.85 | Preparado de chocolate 50/90 (las cantidades de Zoho), fresa, chispas, leche, hielo 130/200 |
| Chocold Mint | Cold | Chica / Grande | $23.35 / $27.68 | Preparado «(2)» 46/60, como Iced Chocolate; espresso 18 g, menta, chispas, leche, hielo 130/200 |
| Fresh Soda Sicilian Lemon | Cold | Chica / Grande | $14.10 / $17.66 | Tónica, limón, hielo 130/200 (**confirmar** Grande) |
| Fresh Soda Strawberry | Cold | Chica / Grande | $21.46 / $27.56 | Tónica, fresa, canela, hielo 130/180 (**confirmar** Grande) |
| Pure Black (Single Shot) | Hot | Único | $9.56 | 18 g de café, como dice Zoho (**confirmar**: un shot sencillo serían ~9 g) |
| Sora Tonic | Other Beverages | Único | $52.00 | Bebida embotellada |
| Matcha Tonic | Other Beverages | Único | $55.00 | Bebida embotellada (**confirmar** categoría; Zoho la pone en bebidas calientes) |
| Matcha Iced Latte + Lemon Cake | COMBO CON PANADERÍA DULCE | Chica / Grande | $44.21 / $48.30 | Nuestra Matcha Iced Latte + panqué de limón, bolsa y etiqueta |
| Iced Black + Cookie Tradicional | COMBO CON PANADERÍA DULCE | Chica / Grande | $36.34 / $36.54 | Nuestro Iced Black (corregido con el PDF) + cookie, bolsa y etiqueta |
| True White + Croissant filled with cheese and ham | Combos | Único | $49.52 | Nuestro True White Chica + nuestro Croissant filled with cheese and ham (Zoho traía brioche y relleno de sándwich) |

- **Precio de lista:** los productos quedan sin precio. El precio de venta es de cada sucursal; el costo es estándar.
- **Venta en el POS:** dos ya se venden, pero no tienen enlace: `MATLEMAPP` y `TRWCROAPP`. Enlazarlos es un lote de enlaces aparte.

## 2. Garantías del lote

- **Lote aprobado:** la huella del manifiesto está fijada en `LOTES_ALTAS_APROBADOS`.
- **Perfil obligatorio**, también en el ensayo: operaciones o admin.
- **Una sola transacción** REPEATABLE READ.
- **Mismo camino que el portal:** cada producto se crea con `guardar_receta`, que valida permisos, componentes activos y tamaños.
- **Estado de partida:**
  - Si alguno ya existe, el estado está mezclado y no se crea nada.
  - Si todos existen con exactamente esta receta, el resultado es «sin cambio».
- **Al crear se verifica:**
  - receta, categoría, tamaños, líneas y cantidades idénticas al manifiesto;
  - el costo por tamaño igual al esperado. Si un costo de compra cambia antes de aplicar, el lote se detiene.
- **Bitácora:** exactamente un registro por receta, tamaño, línea y cantidad, con origen `carga_masiva`, el autor y la nota de la ejecución. Hay 229 en total.
- **Huellas idénticas** de insumos, enlaces, precios manuales, el resto de recetas, líneas, cantidades, tamaños y costos.
- **Reversión por id de ejecución:** borra solo lo creado. Se niega si hay registros posteriores en la bitácora, enlaces POS o precios manuales.

## 3. Verificación local

**Pruebas (PGlite):** 8 en total. Cubren:
- el lote real;
- manifiestos inválidos;
- el perfil obligatorio;
- un ensayo que no deja nada;
- la aplicación con bitácora exacta, y la repetición «sin cambio»;
- un costo de compra cambiado;
- un estado mezclado y un componente inexistente;
- la reversión y su negativa ante ediciones posteriores.

**Ensayo sobre una copia del respaldo `0438Z`.** La copia se borró al terminar.

| Paso | Resultado |
|---|---|
| Ensayo | 11 creados, 229 registros propios y 0 ajenos; resto sin cambios; ROLLBACK |
| Aplicar | 11 creados; COMMIT |
| Repetir | 11 «sin cambio», 0 registros |
| Revertir | 11 borrados; recetas, líneas, cantidades, tamaños y costos con md5 idéntico al respaldo |

Los informes contienen el UUID del perfil y se guardan fuera del repo.

## 4. Procedimiento remoto (cada paso requiere aprobación)

1. Respaldo lógico verificado por restauración.
2. Revalidación: que ninguno de los 11 exista y que los costos de compra sigan iguales.
3. Ensayo remoto, que termina en ROLLBACK:
   `npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-zoho-lote-1 --usuario <uuid-perfil>`
4. Aplicación:
   `… --aplicar --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`
5. Verificación con una conexión nueva y un segundo ensayo, que debe dar 11 «sin cambio».
6. Reversión, solo con aprobación:
   `… --revertir --ejecucion <uuid> --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>`

## 5. Cierre: aplicado el 2026-10-28 (00:59 UTC) y verificado

Se ejecutó solo `altas-zoho-lote-1`, desde el código de este PR en `f67a021` y con el manifiesto `f132a72b…`. El ensayo remoto y la aplicación tuvieron la aprobación expresa de Carlo. Hubo un solo COMMIT, sin reintentos.

| Paso | Resultado |
|---|---|
| **Respaldo `0040Z`** | El mismo del doc 32. Entre el respaldo y este lote solo se aplicaron los 6 cambios de categoría de insumo del doc 32, que no tocan costos |
| **Ensayo remoto** (00:42 UTC, ROLLBACK) | 11 creados con el costo esperado, 229 registros propios y 0 ajenos; resto sin cambios |
| **Aplicación** | **COMMIT**, ejecución `b0cc45a6-3d01-440c-9042-4eaa9abc99ea`, confirmado desde una conexión nueva |
| **Segundo ensayo** | 11 «sin cambio», **0 registros nuevos**, ROLLBACK |

### Resultado

- **11 productos creados**, cada uno con el costo esperado del §1 en cada tamaño.
- **Bitácora #871–1099:** 229 registros `carga_masiva`, con autor Carlo y la nota `altas-zoho-lote-1, ejecución b0cc45a6-… (docs/conciliacion-brasil/31)`:
  - 11 recetas;
  - 18 tamaños;
  - 76 líneas;
  - 124 cantidades.
- La bitácora queda en 735 filas (id máx. 1099).
- **Conteos:** recetas 160 → 171, tamaños 215 → 233, líneas 890 → 966, cantidades 1,199 → 1,323 y `v_costo_producto` 215 → 233 filas.

### Lo que quedó intacto (huellas antes y después)

- Los 165 insumos y sus costos de compra, y `v_costo_subreceta` (6 filas).
- Precios manuales (83), los **72 enlaces POS**, categorías, proveedores y las 23 migraciones.
- Las recetas, tamaños, líneas y costos que ya existían.

### Fuera de este lote

- **Precio de lista:** los 11 quedan sin precio; si hace falta, se captura en el portal.
- **Enlaces POS** de `MATLEMAPP` y `TRWCROAPP`: van en un lote de enlaces aparte (el portal no tiene pantalla para enlaces).
- **Por confirmar:**
  - el hielo Grande de Chai Iced Ginger y de las dos Fresh Sodas nuevas;
  - los gramos de café del Single Shot;
  - la categoría de Matcha Tonic.

### Reversión (solo con aprobación expresa)

```
npx tsx scripts/conciliacion/altas-productos-aplicar.ts --lote altas-zoho-lote-1 --revertir --ejecucion b0cc45a6-3d01-440c-9042-4eaa9abc99ea --confirmo jpqkmnfjwzniptszjuli --usuario <uuid-perfil>
```

- Borra solo los 11 productos.
- Se niega si alguno tiene registros posteriores en la bitácora, un enlace POS o precios manuales.

Los informes de cada ejecución y las huellas se guardan **fuera del repo**, porque contienen el UUID del perfil, junto con el respaldo `0040Z`.
