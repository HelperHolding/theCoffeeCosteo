# Columnas de fórmula de «Looker Sucursales» que usan los filtros

Fuente: anexo de la auditoría (`origin/wip/analytics-respaldo-2026-10-28:docs/analytics-zoho/anexo-columnas-looker-sucursales.csv`)
y valores calculados por Zoho el 2026-11-05 (ver `README.md`). Las fórmulas largas no se copian completas: el BI usa
el **resultado** de Zoho por producto y por tienda (`productos-zoho.psv`, `tiendas-zoho.psv`), no una reimplementación
de los CASE.

| Columna | Tipo de regla | Resumen | En el BI |
|---|---|---|---|
| Nombre de Tienda | CASE sobre `Store ID` (81 ramas) | Store ID → nombre comercial | `bi_tiendas.nombre` (semilla de `tiendas-zoho.psv`) |
| Franquicia o Sucursales Propias | CASE sobre «Nombre de Tienda» | 11 nombres → «Sucursales Propias»; el resto, «Franquicia» | `bi_tiendas.tipo` |
| Franquiciatario | CASE sobre «Nombre de Tienda» (34 ramas) | Nombre → grupo franquiciatario (p. ej. «CDMX-MJA», «Quintana Roo») | `bi_tiendas.franquiciatario` |
| Categoría Master Franchise MX | CASE sobre `Product` normalizado (58 ramas, 276 literales) | Producto → 15 categorías + «Otros» | `bi_clasificacion_producto.categoria_master` (el código de la fila siempre está normalizado: mayúsculas, sin espacios al inicio ni al final y espacios internos colapsados a uno) |
| Comida, Bebida, Combo y Merch | CASE sobre la categoría Master | Categoría → Bebida / Comida / Combo / Merch / Otros | `bi_clasificacion_producto.grupo` |
| Contiene Café | CASE sobre `Product` normalizado (15 ramas, 63 literales) | Sí / No / «No definido» | `bi_clasificacion_producto.contiene_cafe` («No definido» → null) |
| Promoción alimento bebida, café, producto regular | CASE sobre `Product` normalizado (8 combos) | Producto regular / Promoción alimentos y bebidas / Promoción café | `bi_clasificacion_producto.promocion` |
| Semana | `weekofyear("Date",2)` | Semana ISO | `bi_semana()` |
| Día de la Semana Fórmula | `day_name("Date")` traducido | Lunes…Domingo | `extract(dow)` en la base y etiquetas en la interfaz |
| Canal | `if("Place or Sale"='Rappi','Rappi','POS')` | — | `bi_lineas.canal` |

**Normalización de `Product` en Zoho:** `upper(trim(replace(…)))`. Reemplaza los espacios no separables y unifica los
dobles. El generador de semillas aplica la misma normalización: mayúsculas, recortado y espacios internos colapsados a
uno.

**«No definido» en Contiene Café:** aparece en productos de categoría «Otros» (p. ej. «Spooky Biscuits»). En el filtro de
Zoho solo hay «Sí» y «No», así que en el BI queda `null` y no entra en ninguno de los dos.
