# 06 · Preguntas al proveedor (API The Coffee)

Borrador para que Carlo lo envíe si lo decide. **No se envió nada.** Los ejemplos están redactados: sin `id`, `refundId` ni datos de clientes.

## Catálogo y nombres

1. **¿Existe un endpoint de catálogo de productos** (código, nombre vigente, tamaños, precio por tienda y canal)?
   - Solo conocemos `/company/list/all` y `/order/company/{id}`. No probamos rutas no documentadas.
2. ¿El `productName` de un pedido es el nombre vigente del catálogo en ese momento o un texto libre del POS?
3. Vemos nombres distintos para lo que parece el mismo producto. ¿Hubo renombres? ¿Desde cuándo?
   - Ejemplos: «Pumpkin Latte» frente a «Pumpkin Spice Latte»; «Taro Frap» frente a «Taro Frappé».

## `GENERIC`

4. ¿Qué representa la línea `defaultCode: "GENERIC"`, `productName: "Generic"`? Ejemplo:

   ```json
   { "paymentMethod": "RAPPI", "paymentType": "CREDIT",
     "items": [{ "defaultCode": "GENERIC", "productName": "Generic", "amount": 199, "discount": 0, "itemsCustom": [] }] }
   ```

   - Solo aparece en Rubén Darío (532) y solo en pedidos Rappi: 108 líneas, $18,020 en 4 semanas.
   - Importes frecuentes: $199, $150, $111, $133.
5. ¿Es un artículo de Rappi sin mapeo en el POS?
   - Si es así, ¿se puede corregir el mapeo?
   - ¿Hay otro campo con el artículo real?
6. ¿`refundId` en pedidos Rappi es el ID del pedido en Rappi? Nos permitiría cruzarlo con el reporte de Rappi.

## Códigos nulos en App

7. Desde el **2026-10-02**, 109 de 156 pedidos de **App** (`fromSmartphone: true`) llegan con `defaultCode: null` en todas las líneas y customs. Antes de esa fecha no ocurría. ¿Hubo un cambio en la App o en la integración? Ejemplo:

   Pedido real de 612, semana 12–18 oct, redactado:

   ```json
   { "fromSmartphone": true, "paymentMethod": "VIRTUAL_WALLET", "paymentType": "WALLET",
     "items": [{ "defaultCode": null, "productName": "Iced Latte", "amount": 76, "discount": 5,
                 "itemsCustom": [{ "defaultCode": "", "productName": "Large - 600ml", "amount": 9.5 },
                                 { "defaultCode": "", "productName": "Double shot (36ml)", "amount": 0 },
                                 { "defaultCode": "", "productName": "Average Honey", "amount": 0 }] }] }
   ```

   El padre llega con `null` y los customs con `""`.

## Precios y tamaños

8. ¿Cada tienda tiene su propia lista de precios? Observamos, por ejemplo, Iced Latte Regular a $70 en 532 y a $80 en 612 y 583.
   - ¿Hay una lista nacional o regional de referencia?
9. ¿El precio de Rappi es una lista propia por tienda?
   - ¿Cómo se distingue Rappi Turbo, si llega por esta integración?
10. Tamaños:
    - ¿El vaso grande caliente es de **355 ml** (como dice la API) o de **360 ml** (como dice el recetario)?
    - ¿Los Gelato Frappé se venden en dos tamaños?
11. `items[].amount`: ¿es siempre el precio después del descuento de línea?
    - `discount` de línea: ¿es un porcentaje?
    - `discount` de pedido: ¿es un monto informativo? En Rappi aparece aunque `grossAmount` sea igual a la suma de líneas.

## Complemento 23-oct: Generic con combos y bebidas (ver 11)

13. **Bebida individual enviada como Generic.** En la orden Rappi `2482647582` (`refundId` del pedido POS `31893730`), Rappi muestra un **Iced Mocha** con «Grande 590 ml.» (+$12), «Con Chispas» y «Entera». La API manda:

    ```json
    { "defaultCode": "GENERIC", "productName": "Generic", "amount": 111, "discount": 0, "itemsCustom": [] }
    ```

    - ¿Por qué ese artículo llega como Generic y sin personalizaciones?
    - ¿Es un artículo de Rappi sin mapeo en el POS?
    - ¿Se puede mapear para que llegue con su código, nombre y customs?
14. **Combos.** Según Delivery, el combo «Crea tu The Coffee» (sándwich o croissant + Iced Latte o True White) se cobra a 199. ¿Los combos de Rappi llegan como Generic? ¿Puede la API mandar los artículos del combo (como `itemsCustom` o como líneas)?
15. **Suma de productos: $12.** En esa orden, Rappi suma **580** en productos y la API **568** (`items.amount` + `itemsCustom.amount`). Línea por línea, la única diferencia está en el artículo que Rappi muestra como Iced Mocha: **123** en Rappi (incluye «Grande 590 ml.» por $12) frente a **111** en la API (`GENERIC`, sin `itemsCustom`). Las otras 4 líneas coinciden al peso.
    - ¿El POS recibe los acompañamientos con cargo de un artículo que se convierte en Generic?
    - ¿O el artículo genérico tiene un importe fijo?
15b. **Totales: $30.** Rappi muestra «Total después de descuentos» **538**. La API reporta `grossAmount` **568**, `netAmout` **538**, `discount` **84** y `percentageOfTransfer` **94.43**.
    - ¿`netAmout` representa el total que pagó el cliente en Rappi después de promociones? En este pedido coincide, pero en otros 36 pedidos Rappi `netAmout` fue **mayor** que `grossAmount`.
    - ¿Qué representa `discount` (84) si el descuento implícito en Rappi es 42 (580 − 538)?
    - ¿Qué total se considera oficial para conciliar con la liquidación de Rappi: `grossAmount`, `netAmout` u otro?
16. **`refundId`.** ¿Confirman que en pedidos `RAPPI` es siempre el número de orden de Rappi (10 dígitos)? En tarjeta observamos UUID; en efectivo, vacío; en monedero, `null`.
17. **Rappi Turbo.** La orden se ve en la tienda «Rubén Darío - Turbo» en el portal de Rappi. ¿Existe en la API algún campo que distinga Turbo?

Para **Delivery o Rappi** (no para el proveedor de la API): el export o detalle completo de la orden `2482647582` con todos los artículos, acompañamientos, promoción y total, sin datos del cliente.

## Complemento 23-oct, caso 2: cargos de tamaño ausentes (ver 14)

18. **Tamaño perdido en un artículo identificado.** Orden Rappi `2482754188` = pedido POS `31905287` (`refundId`).
    - Rappi muestra **2 × Pumpkin Iced Latte** con «Grande 355 ml.» **+$12 por unidad** (subtotal 270).
    - La API manda 2 líneas así, sin ningún custom de vaso:

      ```json
      { "defaultCode": "CPUMICAPP", "productName": "Pumpkin Iced Latte", "amount": 110,
        "itemsCustom": [{ "productName": "Single Shot (18ml)", "amount": 0 }, { "productName": "Lactose free", "amount": 13 }] }
      ```

    Preguntas:
    - ¿Por qué no llega la opción de tamaño ni su cargo?
    - ¿El POS descarta las opciones de Rappi que no puede mapear?
    - En el pedido `31893730`, «Grande 590 ml.» sí llegó como `Large - 600ml` +12. ¿«Grande 355 ml.» en una bebida fría es una opción de menú de Rappi sin equivalente en el POS?
19. **Dos casos con la misma forma de diferencia.**

    | Pedido POS | Productos Rappi | `grossAmount` | Total final Rappi | `netAmout` | `discount` |
    |---|---|---|---|---|---|
    | 31893730 | 580 | 568 | 538 | 538 | 84 |
    | 31905287 | 458 | 434 | 436 | 436 | 59.80 |

    - ¿`netAmout` es el total que cobra Rappi después de promociones? Coincide en ambos casos, pero en otros 36 pedidos Rappi `netAmout` > `grossAmount`.
    - ¿Qué representa `discount` (84 y 59.80), si la reducción visible en Rappi es 42 y 22?
    - ¿`grossAmount` es la suma de los precios del menú del POS, sin los cargos que no se mapean?
20. **Rappi frente a POS.** ¿Qué total debe usarse para conciliar con la liquidación de Rappi? ¿Puede la integración enviar los acompañamientos de Rappi aunque no tengan equivalente en el POS, por ejemplo como `itemsCustom` con su importe?
21. **Cantidades.** Rappi agrupa «2 × Pumpkin Iced Latte» y la API manda 2 líneas. ¿Siempre se expanden por unidad? ¿Hay algún caso con campo de cantidad?

Para Delivery o Rappi (no para el proveedor de la API): ¿el menú de Rappi de Rubén Darío Turbo ofrece «Grande 355 ml.» en bebidas frías? Es la etiqueta de un vaso caliente.

## Ya pendientes (docs/10 y docs/11)

12. Zona horaria de `createdAt`, moneda, límites de servicio y significado de `netAmout` y `percentageOfTransfer` en Rappi.
