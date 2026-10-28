# 33 · Personalizaciones neutras en el costeo de Sucursales (etapa 1)

**Estado:** cambio de código para revisión, sin merge. No escribe en la base ni en la API, y no cambia ningún costo ni receta.

## Problema

Hasta ahora, cualquier personalización dejaba la línea en **costeo parcial**, porque Costeo no sabe qué cambia cada una. Casi todas las bebidas traen 3 o 4 (shot, leche, temperatura, miel) y los sándwiches siempre traen la salsa.

Ventas del 28-sep al 25-oct de 2026 en Cd. Juárez (612), Bonampak (583) y Rubén Darío (532): de **$899,216** de venta enlazada a receta, solo **$140,297 (15.6 %)** era de costeo completo.

## Qué cambia

`lib/sucursales/personalizaciones-verificadas.ts` es una lista explícita, como `TAMANOS_VERIFICADOS`:
- de personalizaciones que **no cambian el costo** de cada receta: 37 recetas y 57 pares;
- de las 6 variantes de temperatura, que no cambian ningún insumo en ninguna receta.

Una línea es de costeo completo solo si **todas** sus personalizaciones están en la lista para su receta o son de temperatura. Siguen aplicando las demás reglas: tamaño verificado y costo disponible.

**Nunca es una regla global.** «Lo que cuesta $0 no cambia la receta» sería falso: el shot sencillo cuesta $0 y lleva menos café.

Cada par se verificó contra la receta vigente, leída en solo lectura el 2026-10-28.

| Criterio | Personalizaciones |
|---|---|
| Temperatura | Original (60 °C), Extra Hot (70 °C), Warm (50 °C), con «°» o «º» |
| «Sin …» cuando la receta no lo lleva | Without Honey (ninguna receta lleva miel), Without Chipotle Mayo (5 sándwiches), Without White Sprinkles, No Milk (Americano, Cold brew), Without Coffee (Iced Chocolate) |
| La opción de la receta | Milk y Milk uht (leche entera), Tradicional Gelato, Original Chai, Traditional Tonic, Original Coco Vanilla Flavor, Cold brew - Black y Hot Drip Black (grano BLACK) |
| Cantidad igual a la receta | Average Vanilla (15 ml) en Iced Vanilla e Ichigo Matcha; Average Vanilla (10 ml) en Vanilla Latte y Matcha Vanilla Latte; With Sprinkles (4 g de chips) en Iced Vanilla e Iced Chocolate |
| Variante del mismo artículo | Grano o molido (bolsas de café); color de tumbler, umbrella y tote bag; Ristretto y Lungo (mismos 18 g de café: supuesto razonable) |

**Excluidos a propósito:**
- **Mug:** la receta suma las dos tazas, negra y blanca, a $127 cada una ($254). Debe llevar una.
- **Félix Schorle:** la receta suma las dos botellas, frambuesa y maracuyá ($70). Debe llevar una ($35).
- **Average Vanilla (10 ml) en Ichigo Matcha e Iced Vanilla:** esas recetas llevan 15 ml, así que hay una diferencia que calcular.

Las correcciones de Mug y Félix se hacen aparte, con aprobación.

## Efecto (mismo periodo y sucursales, código de esta rama)

| | Antes | Después |
|---|---|---|
| Venta con costeo completo | $140,297 (15.6 %) | **$215,832 (24.0 %)** |
| Grilled Ham & Cheese Sandwich | 5 % | **53 %** |
| Margen bruto teórico de las líneas completas | 55.5 % | 59.2 % |

El margen agregado cambia porque cambia la mezcla de líneas que entran al cálculo, no los costos.

## Siguientes etapas (fuera de este cambio)

1. **Calculadas con nuestra base:**
   - deslactosada (hoy cuesta lo mismo que la entera);
   - más o menos vainilla con los ml en el nombre;
   - sin chispas y sin jengibre;
   - grano WHITE o KRAFT en cold brew y drip.

   Necesitan las cantidades de la receta y el costo de los insumos en la lectura de costeo. Esa lectura la está cambiando la rama `feat/sucursales-gdl-consumo` (RPC por sucursal), así que se hará después, sobre esa versión. Suman unos 7 puntos.
2. **Confirmaciones y datos de Operaciones/Compras:**
   - que los 18 g de las recetas son un doble shot;
   - gramos del shot sencillo y del extra;
   - ml de miel;
   - marca de leche vegetal;
   - ml de «More/Less»;
   - Chipotle Mayo.

   Las preguntas están en el Excel de pendientes, fuera del repo.

## Pruebas

`tests/portal/sucursales-personalizaciones.test.ts` cubre:
- temperatura con «°» y «º»;
- opciones de la receta;
- que basta una no neutra para que la línea sea parcial;
- que la lista es por receta;
- que Chipotle Mayo sigue parcial;
- que el tamaño se sigue exigiendo;
- la integridad de la lista: ids válidos, sin opciones que cambian cantidades, Mug excluido.
