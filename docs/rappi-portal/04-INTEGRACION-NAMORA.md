# 04 · Namóra: Rappi del portal en Ventas, Costeo y Consumo

Fecha: 2026-10-29. Carlo pidió que los pedidos de Rappi leídos del portal (doc 03) se integren por apartado al módulo
Sucursales. Así, en Namóra se ven juntos la venta, el costo y el consumo del POS y de Rappi. Si funciona, se replica en
las demás sucursales de Guadalajara. Decisiones de Carlo:

- **Ventas:** Rappi se suma. El filtro por defecto es «Mostrador + App + Rappi», como en Rubén Darío.
- **Combos que solo existen en Rappi:** se venden a su precio de Rappi. Su costo es la suma de sus partes: la bebida
  elegida (con leche, tamaño y shot) más el pan elegido, con las recetas vigentes. En Consumo se descuentan los insumos
  de cada parte.
- **Tamaños:** Grande 590 ml = Large 600 ml. Tradicional y Mediano 440 ml = Regular 440 ml. Tradicional 240 ml = Regular
  240 ml. Grande 355 ml = Large 355 ml.
- **Bebidas que Rappi vende sin opción de tamaño:** son las grandes. El vaso es el Large que usa el POS de Namóra para
  ese producto: 355 ml en las calientes y 600 ml en los frappés.
- **Creamer de Pumpkin:** la receta lleva el «Medio».
- **Pan de Muerto, Cookie Matcha, Spooky Biscuits y Triple Frap:** no tienen receta. Quedan «sin enlace».

No hay migración. Todo se lee de lo que el cron ya guarda (`sucursales_rappi_portal`, migración 28).

## Cómo funciona

1. `lib/sucursales/rappi-pos.ts` traduce cada pedido de Rappi a la forma del POS:
   - origen «rappi», hora local del portal y venta = suma de productos;
   - una línea por unidad, con códigos y personalizaciones del POS;
   - descuento = el que paga el aliado.

   Los cancelados y rechazados no suman.

2. `conRappi` (`lib/sucursales/datos.ts`) suma esos pedidos a la lectura del POS del mismo periodo, en En vivo,
   Tendencias, Productos, Pedidos, Costeo y Consumo:
   - un pedido que ya llegó por el POS (`refundId` = ID de Rappi) no se cuenta dos veces;
   - si Rappi no se puede leer, la lectura queda **parcial** y lo dice.
3. Costeo y Consumo aplican a Rappi **las mismas reglas que al POS**: código → receta, vaso → tamaño verificado y
   personalizaciones neutras o con ajuste verificado. Lo que no está en una lista no se adivina:
   - un producto sin equivalencia queda «sin enlace»;
   - un acompañamiento sin equivalencia conserva su texto de Rappi y deja la unidad fuera por «personalización».
4. Un combo armado (`partes`) solo se costea y se consume si **todas** sus partes tienen receta y entran completas. Su
   costo es la suma de las partes y su venta es el precio del combo.

Solo aplica a sucursales con `rappiPortal: true` (hoy Namóra). Para las demás no cambia nada.

## Equivalencias (para revisión)

Las listas viven en `lib/sucursales/rappi-pos.ts`. Cambiarlas exige evidencia, como un lote.

### Productos → código POS

| Rappi                               | POS          | Rappi                                          | POS         |
| ----------------------------------- | ------------ | ---------------------------------------------- | ----------- |
| Americano                           | `2AM`        | Kouign Amann Dulce de Leche                    | `KOAMDLAPP` |
| Açai Bowl                           | `ACABOWAPP`  | Kouign Amann Hazelnut                          | `KOAMAVAPP` |
| Banana Cake                         | `CAKBANAPP`  | Lemon Cake                                     | `CAKLEMAPP` |
| Black Ginger                        | `3BG`        | Mad Mocha                                      | `3MC`       |
| Brownie                             | `BRO13`      | Matcha Frappé                                  | `FRAMATAPP` |
| Chai Frappé                         | `FRACHAAPP`  | Matcha Iced Latte                              | `4MIL`      |
| Chai Iced Latte                     | `1ICHAI`     | Matcha Iced Latte + Lemon Cake                 | `MATLEMAPP` |
| Chai Latte                          | `6CM`        | Matcha Iced Mint                               | `7IC`       |
| Cinnamon Roll                       | `5CR`        | Matcha Latte                                   | `5MC`       |
| Coffee Frappé                       | `COFFRAAPP`  | Matcha Vanilla Latte                           | `7MVT`      |
| Cold Brew                           | `1COLDB`     | Mineral Water Perrier                          | `WATPERAPP` |
| Cold Drip V60                       | `1CDV60`     | Pain au Chocolat                               | `3FOOD3`    |
| Cookie Tradicional                  | `COOTRAAPP`  | Pumpkin Iced Latte                             | `CPUMICAPP` |
| Cookie Triple Chocolate             | `COOCHOAPP`  | Pumpkin Latte                                  | `CPUMLAAPP` |
| Croissant relleno de queso y jamón  | `CROSTUAPP`  | Pumpkin Spice Frap                             | `CPUMFRAPP` |
| Croissant Serrano & Gouda           | `CROGOUAPP`  | Salted Caramel                                 | `2SC`       |
| Croissant Traditional               | `2FOOD2`     | Salted Caramel Frappé                          | `SALFRAAPP` |
| Flat Caramel                        | `1FC`        | Sandwich jamón, queso, cherry y orégano        | `BR3`       |
| Gelato Frappé Coffee                | `SHCO`       | Sora Iced Latte                                | `SOICAUAPP` |
| Hazelnut Cream Croissant            | `HALCRCAPP`  | Sora Latte                                     | `SOLAAUAPP` |
| Hot Drip V60                        | `1HDV60`     | Sándwich de tres quesos / tres quesos al grill | `QQ2`       |
| Iced Black                          | `6ICB`       | Sándwich jamón y queso                         | `MQ1`       |
| Iced Chocolate                      | `ICECHOAPP`  | Taro Frappé                                    | `FRATARAPP` |
| Iced Latte                          | `5IL`        | True White                                     | `4TW`       |
| Iced Latte + Sandwich jamón y queso | `MISICEDAPP` | True White + Croissant de queso y jamón        | `TRWCROAPP` |
| Iced Vanilla                        | `1IC`        | Tumbler (360ml)                                | `3TBB`      |
| Ichigo Matcha                       | `9IMT`       | Urban Chocolat                                 | `4UC`       |
| Isopure Iced Latte                  | `PCFICEAPP`  | Vainilla Latte                                 | `2VLT`      |
| Isopure Iced Matcha                 | `PCFMATAPP`  | White Bag 250g                                 | `1CBWB`     |

Los tres combos del POS (`MISICEDAPP`, `TRWCROAPP`, `MATLEMAPP`) son los mismos de Rappi y usan su receta de combo.

El sabor elegido decide el producto (Carlo, 2026-10-30): «Kouign Amann Dulce de Leche» con «Elige Tu Favorito: Avellana»
cuenta como Kouign Amann Hazelnut (`KOAMAVAPP`) y toma su nombre. Con «Dulce de Leche», o sin opción, sigue siendo
`KOAMDLAPP`. La opción de sabor no es una personalización.

### Combos que solo existen en Rappi

| Combo                                  | Partes                                                                                  |
| -------------------------------------- | --------------------------------------------------------------------------------------- |
| Crea tu The Coffee                     | Bebida elegida (con leche, shot, tamaño y miel) + sándwich elegido (con mayonesa o sin) |
| Pan de Muerto Tradicional + True White | True White (con leche, shot, tamaño y miel) + Pan de Muerto Tradicional                 |

### Acompañamientos → personalización del POS

| Categoría de Rappi                      | Rappi → POS                                                                                                                                                    |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Elige el tamaño                         | Mediano o Tradicional 440 ml → `Regular - 440ml`; Tradicional 240 ml → `Regular - 240ml`; Grande 590 ml → `Large - 600ml`; Grande 355 ml → `Large - 355ml`     |
| Leche / Leche. / Leche Latte            | Entera → `Milk`; Deslactosada → `Lactose free`; Avena → `Oatmilk`; Almendra → `Almond Milk`; Leche de coco → `Coconut Milk`; Sin leche → `No Milk (Americano)` |
| Leche para tu Gelato Frappé             | Deslactosada → `Lactose free (Gelato)`; Avena → `Oatmilk (Gelato)`                                                                                             |
| Café                                    | Single → `Single Shot (18ml)`; Double → `Double shot (36ml)`; Extra Double → `Extra Double shot (36ml)`                                                        |
| Miel                                    | Sin / Poco / Promedio / Mucho → `Without` / `Less` / `Average` / `More Honey`                                                                                  |
| Vainilla (según receta)                 | Vanilla Latte y Matcha Vanilla: Medio 10 ml, Más 15 ml, Menos 5 ml. Iced Vanilla e Ichigo: 15, 20 y 10 ml                                                      |
| Caramelo salado                         | Medio / Más / Menos → `Average` / `More` / `Less Salted Caramel (cold)`                                                                                        |
| Caramelo · Jengibre · Menta             | `Average Caramelo (hot)` · `Average Gengibre (Black Ginger)` · `Average` / `Less` / `More Mint`                                                                |
| Chispitas · Mayonesa · Agua             | `With` / `Without Sprinkles` · `Chipotle Mayo` / `Without Chipotle Mayo` · `Traditional Tonic`                                                                 |
| Ajusta tu creamer (solo Rappi)          | Medio 30 ml → `Average Creamer (30ml)`; Más 40 ml → `More Creamer (40ml)`; Menos 20 ml → `Less Creamer (20ml)`                                                 |
| Personaliza tu Iced Latte / tu Sandwich | Se omite: solo nombra las partes fijas del combo del POS                                                                                                       |

### Bebidas sin opción de tamaño en Rappi

Son las grandes, según Carlo. Rappi no manda vaso, así que se agrega el Large que usa el POS de Namóra para ese producto.
Evidencia: los vasos del POS del 1 al 28 de octubre. Cada producto usa un solo Large.

- **`Large - 355ml`:** Americano, Chai Latte, Flat Caramel, Mad Mocha, Matcha Latte, Matcha Vanilla Latte, Pumpkin
  Latte, Sora Latte, Urban Chocolat y Vainilla Latte.
- **`Large - 600ml`:** Chai Frappé, Coffee Frappé, Matcha Frappé, Pumpkin Spice Frap, Salted Caramel Frappé y Taro
  Frappé.

Si un pedido sí trae tamaño, manda el de Rappi. Cold Drip V60 no está en la lista porque en el POS no lleva vaso. El
Grande del Chai Frap sigue sin verificar (doc 26), igual que en el POS.

### Reglas de personalización que agregó Rappi

Viven en `lib/sucursales/personalizaciones-verificadas.ts`. Se verificaron contra las líneas vigentes de cada receta el
2026-10-29.

- **`Milk` es neutra** en 21 recetas más. Rappi siempre manda la leche, también la entera; el POS casi nunca la
  escribe. Solo se agregó donde la receta lleva leche entera directa en todos sus tamaños:
  - frappés: Chai Frap, Coffee Frap, Matcha Frap, Pumpkin Spice Frap, Salted Caramel Frap y Taro Frap;
  - calientes: Chai Latte, Flat Caramel, Mad Mocha, Matcha Latte, Matcha Vanilla Latte, Pumpkin Latte, Sora Latte,
    Urban Chocolate y Vanilla Latte;
  - fríos: Iced Chocolate, Matcha Iced Mint y Sora Iced Latte;
  - combos: Iced Latte + Ham & Cheese, Matcha Iced Latte + Lemon Cake y True White + Croissant.

  En el Americano, «Leche: Entera» agrega leche, así que no es neutra.

- **Creamer en Pumpkin Latte:** la receta lleva 30 ml de `CHOBANI D.CREAMER PUMPKIN SPICE` en Chica y Grande.
  - Medio (30 ml) es neutra.
  - Más y Menos dejan 40 y 20 ml en total.

## Cobertura medida: 1 al 28 de octubre

Medida con la API del POS y la RPC del portal, en solo lectura, con las recetas vigentes al 2026-10-29. «Entran
completas» son las unidades que suman a Costeo completo y a Consumo; las dos usan la misma regla.

| Namóra                                 | POS      | Rappi    | Juntos   |
| -------------------------------------- | -------- | -------- | -------- |
| Pedidos                                | 1,524    | 680      | 2,204    |
| Venta                                  | $206,975 | $140,458 | $347,433 |
| Unidades                               | 2,515    | 1,131    | 3,646    |
| Con receta                             | 2,377    | 1,095    | 3,472    |
| Sin enlace                             | 134      | 36       | 170      |
| Fuera por tamaño sin verificar         | 93       | 70       | 163      |
| Fuera por personalización no calculada | 1,622    | 790      | 2,412    |
| **Entran completas**                   | **662**  | **235**  | **897**  |
| Venta de lo que entra completo         | $50,629  | $23,403  | $74,032  |
| Costo de lo que entra completo         | $16,166  | $5,922   | $22,088  |

- Los 680 pedidos de Rappi **cuadran**: la suma de sus unidades es igual a la venta del portal.
- **Antes y después de las respuestas de Carlo:**
  - fuera por tamaño en Rappi: bajó de 310 a 70;
  - unidades de Rappi que entran completas: subieron de 167 a 235.

  Lo que queda fuera por tamaño en Rappi es lo mismo que en el POS:
  - Matcha Iced Mint (24) no tiene tamaño verificado (E1);
  - los combos del POS (41) tampoco;
  - Chai Frap Grande (3), Cold Drip V60 (1) y un «Crea tu The Coffee».

- Ahora lo que más deja fuera es el **shot** («Double» o «Single»). Rappi lo manda siempre, y el POS lo escribe en 120 de
  160 Iced Latte. Le siguen la miel y la mayonesa de chipotle. Es la etapa 2 de personalizaciones, pendiente.
- Los 131 «Crea tu The Coffee» tienen todas sus partes enlazadas: 116 Iced Latte y 15 True White, con 94 croissants y
  37 sándwiches de tres quesos. Ninguno entra completo: casi todos quedan fuera por el shot, la miel o la mayonesa de
  chipotle, y uno por el tamaño.

## Pendiente

1. **Creamer del Pumpkin Iced Latte (114 unidades).** La receta lleva 40 ml en Chica y Grande, pero el «Medio» de Rappi
   dice 30 ml. En el Pumpkin Latte sí coinciden (30 ml). Falta confirmar si Medio es la receta (40 ml) o si la receta
   del Iced debe bajar a 30 ml. Mientras tanto, sus tres opciones de creamer quedan fuera por personalización.
2. **Productos sin receta (36 unidades), por decisión de Carlo:**
   - Pan de Muerto Tradicional (17) y Pan de Muerto con Glaseado de Naranja (13);
   - Cookie Matcha & White Chocolate (3), Spooky Biscuits (2) y Triple Frap (1).

   Quedan «sin enlace». El combo «Pan de Muerto + True White» también, porque no tiene receta para el pan.

3. **Otros acompañamientos sin equivalencia:**
   - «Café: Sin Café / Con Café» y «Café & Chai» (Chai);
   - «Coco Vainilla» (Medio, Más y Menos);
   - molido o grano y color del tumbler;
   - leche de los «3 Frappés».

   Todos son pocos. Con la regla del POS quedan fuera por personalización.

## Para replicar en otra sucursal de Guadalajara

1. Agregar sus tiendas a `rappi_tiendas` por migración. Las tiendas Turbo están en el doc 03.
2. Agregarlas a `RAPPI_TIENDAS` del lector en el servidor y hacer el backfill del mes.
3. Poner `rappiPortal: true` y `alcance: ALCANCE_POS_RAPPI_PORTAL` en `lib/sucursales/config.ts`.
4. Medir su cobertura, como arriba. El menú de Rappi es de marca, así que las listas deberían servir. Un producto o
   acompañamiento nuevo aparece como «sin enlace» o como texto de Rappi, nunca adivinado.

Rubén Darío ya tiene Rappi por la API del POS. Pasarla al portal es otra decisión, porque hoy su Rappi llega como
«Generic».

## Verificación

- `tests/portal/rappi-pos.test.ts` prueba:
  - la traducción de acompañamientos;
  - una línea por unidad, con la suma igual al renglón;
  - los combos con partes y los cancelados fuera;
  - que `conRappi` suma, no repite y ordena;
  - que Costeo y Consumo de un combo son la suma de sus partes;
  - el vaso Large de las bebidas sin tamaño en Rappi;
  - el creamer del Pumpkin Latte, y que el del Pumpkin Iced Latte sigue pendiente.
- `tsc` sin errores. La suite completa pasa; solo falla `paridad`, como siempre.
