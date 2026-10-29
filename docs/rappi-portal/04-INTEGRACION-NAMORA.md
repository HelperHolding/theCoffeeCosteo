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
| Personaliza tu Iced Latte / tu Sandwich | Se omite: solo nombra las partes fijas del combo del POS                                                                                                       |

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
| Fuera por tamaño sin verificar         | 93       | 310      | 403      |
| Fuera por personalización no calculada | 1,622    | 618      | 2,240    |
| **Entran completas**                   | **662**  | **167**  | **829**  |
| Venta de lo que entra completo         | $50,629  | $14,794  | $65,423  |

- Los 680 pedidos de Rappi **cuadran**: la suma de sus unidades es igual a la venta del portal.
- Los 131 «Crea tu The Coffee» tienen todas sus partes enlazadas: 116 Iced Latte y 15 True White, con 94 croissants y
  37 sándwiches de tres quesos. Ninguno entra completo. 130 quedan fuera por el shot, la miel o la mayonesa de
  chipotle, y uno por el tamaño. Son las mismas personalizaciones que dejan fuera al Iced Latte del POS: el POS escribe
  igual el shot y la miel (120 de 160 Iced Latte llevan «Double shot (36ml)»). Es la etapa 2 de personalizaciones,
  pendiente.

## Pendiente: preguntas para Carlo

1. **Tamaño de las bebidas que en Rappi no tienen opción de tamaño (245 de las 310 unidades fuera por tamaño).** Rappi
   vende un solo tamaño de:
   - Pumpkin Latte (66), Americano (54), Vainilla Latte (25);
   - Coffee Frappé (17), Salted Caramel Frappé (17), Taro Frappé (12), Pumpkin Spice Frap (11), Matcha Frappé (7),
     Chai Frappé (3);
   - Urban Chocolat (9), Chai Latte (5), Matcha Latte (4), Flat Caramel (4), Mad Mocha (3), Matcha Vanilla Latte (3),
     Sora Latte (3), Cold Drip V60 (1) y un «Crea tu The Coffee».

   Sin evidencia no se asume un vaso. ¿De qué vaso salen en Namóra? Con la respuesta se agrega su vaso fijo a la lista.
   Las otras 65 quedan fuera igual que en el POS: Matcha Iced Mint (24) no tiene tamaño verificado (E1), y los combos
   del POS (41) tampoco.

2. **Creamer de Pumpkin** («Ajusta tu creamer»: Medio 30 ml, Más 40 ml y Menos 20 ml; 163 unidades). No existe en el
   POS. ¿Cuánto creamer lleva la receta? Con eso se vuelve un ajuste verificado.
3. **Productos sin receta (36 unidades):**
   - Pan de Muerto Tradicional (17) y Pan de Muerto con Glaseado de Naranja (13);
   - Cookie Matcha & White Chocolate (3), Spooky Biscuits (2) y Triple Frap (1).

   El combo «Pan de Muerto + True White» depende de la receta del Pan de Muerto.

4. **Otros acompañamientos sin equivalencia:**
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
  - que Costeo y Consumo de un combo son la suma de sus partes.
- `tsc` sin errores. La suite completa pasa (582 pruebas); solo falla `paridad`, como siempre.
