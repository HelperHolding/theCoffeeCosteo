# 11 · Generic, combos y número de orden Rappi

**Complemento de fase 3.** Fecha: 2026-10-23.

- **Diagnóstico:** solo lectura. No se modificó ningún importe ni se mapeó Generic.
- **«Orden Rappi» en el detalle:** aprobada por Carlo e implementada en la fase 3 (ver el final).
- **Actualización:** se incorporan las dos capturas completas del detalle de la orden en Rappi (líneas 1–5 y total).

## Evidencia usada

| Fuente | Qué aporta | Tratamiento |
|---|---|---|
| Capturas 1–3 (Delivery, combo «Crea tu The Coffee») | Opciones del combo (sándwich o croissant, Iced Latte o True White); mensaje de «4 items del combo», total 199, promoción 119 y +10 por True White | Explicación operativa de Delivery. **No es una regla de precio ni de composición.** No se deduce la composición exacta |
| Captura 4 (portal The Coffee) | Pedido POS 31893730, 23-oct 09:11:42, Rappi, $568.00, descuento $84 | Contrastada con la API (abajo) |
| Captura 5 (portal Rappi) | Orden 2482647582, 23/10/2026 09:11, «The Coffee Rubén Darío - Turbo», $580.00 en el listado; detalle parcial | **Las capturas contienen nombres de clientes:** no se copiaron al repo ni a este informe |
| Capturas 6–7 (portal Rappi, detalle completo) | Las 5 líneas con acompañamientos y subtotal; «**Total después de descuentos\* $538.00**», con la nota «\*Los cuáles estarán discriminados en el detalle del pago» | El importe del descuento **no aparece** en el detalle; solo el total final |
| API Brasil | 1 GET de catálogo + 1 GET de pedidos de 532 del 2026-10-23 (32 pedidos, lectura completa), con el adaptador del portal y un tope de 6 llamadas | Campos del pedido sin PII; para el resto del día solo la forma de `refundId`, no sus valores |

## Resultado del cruce

| Prueba | Resultado |
|---|---|
| Identidad de la sucursal | `company_id 532`, `lookerStoreId 455` en la configuración = 455 en el catálogo de la API («The Coffee Rubén Darío») |
| Pedido POS 31893730 en la API | **Encontrado** en la lectura del 23-oct |
| **Coincidencia de identificador** | **`refundId` = `"2482647582"` exactamente.** Es el único pedido del día con ese valor |
| Coincidencia temporal | `createdAt` 09:11:42 (hora local) frente a 09:11 en Rappi: coherente, pero **no es la prueba**; la prueba es el identificador |
| Origen y pago | `paymentMethod RAPPI`, `paymentType CREDIT`, `fromSmartphone false` |
| Importes API | `grossAmount 568`, `netAmout 538`, `discount 84`, `percentageOfTransfer 94.43`. La suma de líneas y customs es 568 (cuadra) |

**Forma de `refundId` por medio de pago** (4 semanas de fase 2 + 23-oct):

| Medio de pago | Forma | Casos |
|---|---|---|
| `RAPPI / CREDIT` (532) | **10 dígitos** | 501 de 501 en 4 semanas (todos distintos) + 20 de 20 el 23-oct |
| `CARTAO` (EMV o contactless) | UUID | 4,009 |
| `DINHEIRO` / `CARTAO CONTINGENCY` | vacío | 556 |
| `WALLET` / `VIRTUAL_WALLET` / `WALLET_BALANCE` | `null` | 258 |

**Conclusión:** en esta integración, `refundId` de un pedido `RAPPI` **contiene el número de orden de Rappi**:
- comprobado en un caso con identificador exacto;
- consistente en forma y unicidad en 521 pedidos Rappi de 532.

En otros medios de pago es otra cosa (UUID de transacción), así que **no se puede exponer `refundId` crudo**. Solo hay Rappi en 532; en otras sucursales sigue sin verificar.

## Composición: qué manda Brasil y qué se pierde

| Línea | Portal Rappi (capturas 5–7): subtotal del artículo | API Brasil (pedido 31893730): `amount` + Σ `itemsCustom.amount` | Diferencia |
|---|---|---|---|
| 1 | **Iced Mocha $123.00**: Grande 590 ml. $12, Con Chispas $0, Entera $0 | **`GENERIC` / «Generic» $111**, `itemsCustom: []` → **111** | **12** |
| 2 | Iced latte $129.00: Grande 590 ml. $12, Extra Double Shot $16, Sin $0, Deslactosada $13 | Iced Latte 88 + Large - 600ml 12 + Extra Double shot 16 + Without Honey 0 + Lactose free 13 = **129** | 0 |
| 3 | Iced latte $105.00: Tradicional 440 ml. $0, Single Shot $0, Sin $0, Avena $17 | Iced Latte 88 + Regular - 440ml 0 + Single Shot 0 + Without Honey 0 + Oatmilk 17 = **105** | 0 |
| 4 | Pumpkin Latte $135.00: Double Shot $0, Deslactosada $13 | Pumpkin Latte 122 + Double shot 0 + Lactose free 13 = **135** | 0 |
| 5 | Iced latte $88.00: Tradicional 440 ml. $0, Single Shot $0, Poco $0, Entera $0 | Iced Latte 88 + Regular - 440ml 0 + Single Shot 0 + Less Honey 0 + Milk 0 = **88** | 0 |
| **Σ productos** | **580** | **568** | **12** |

En los dos portales, el subtotal por artículo **incluye** sus acompañamientos con cargo: así se comprueba en las líneas 2–5. Todos los descuentos de línea de la API son 0.

**Lo que muestra la evidencia (sin atribuir causa):**
- En las líneas identificadas, la API sí trae nombre, tamaño y personalizaciones, y los importes coinciden con Rappi (129 y 105).
- En la línea que Rappi muestra como **Iced Mocha**, la API manda `GENERIC` **sin nombre, sin tamaño y sin personalizaciones**. Las 108 líneas Generic de las 4 semanas tampoco traen customs (108 de 108).
- La API no trae ningún otro campo con el nombre del artículo (campos del pedido: `companyId, createdAt, discount, fromSmartphone, grossAmount, id, items, lookerStoreId, netAmout, paymentMethod, paymentType, percentageOfTransfer, refundId`).
- **No se puede recuperar desde la API lo que no envía.**

## Conciliación de importes de la orden

Cada fuente reporta campos distintos. **No se asume que dos campos representen lo mismo por tener el mismo valor.**

| Concepto | Portal Rappi | API Brasil | Portal The Coffee (Sucursales) |
|---|---|---|---|
| Suma de productos (con acompañamientos) | **580** (Σ subtotales; el listado muestra $580.00) | **568** (Σ `amount` + customs) | — |
| Descuento reportado | **No se muestra** («estarán discriminados en el detalle del pago»). 580 − 538 = 42 es un **cálculo**, no un dato reportado | **`discount` = 84** (campo del pedido) | «Descuento $84.00» (muestra `discount`) |
| Total final | **«Total después de descuentos» = 538** | **`grossAmount` = 568** · `netAmout` = 538 · `percentageOfTransfer` = 94.43 | **Venta = 568** (`grossAmount`) |

### Diferencia de $12 (suma de productos: 580 frente a 568)

- **Verificado línea por línea:** la diferencia completa está en la **línea 1**: Rappi 123, API 111. Las líneas 2–5 coinciden al peso.
- **12 = el cargo «Grande 590 ml.»** del Iced Mocha en Rappi. En la API, la línea llega como `GENERIC` sin `itemsCustom`, así que ese cargo **no aparece en ningún campo** del pedido.
- **Lo que no se puede afirmar:** si el POS recibió $111 porque descartó el acompañamiento, porque el artículo genérico tiene precio fijo o por otra razón. Es pregunta para el proveedor (06).
- **No se suma ese $12 al POS** ni se corrige ningún importe.

### Diferencia de $30 (total API 568 frente a total final Rappi 538)

- 568 − 538 = 30 = `grossAmount` − `netAmout` de la API. En este pedido, **el total final de Rappi (538) es numéricamente igual a `netAmout` (538)**.
- **No se concluye que `netAmout` sea el «total después de descuentos» de Rappi:**
  - en la fase 2 hubo 36 pedidos Rappi con `netAmout` **mayor** que lo cobrado (docs/sucursales/11), algo incompatible con un total con descuentos;
  - `percentageOfTransfer` (94.43 %) no reproduce la relación: 568 × 0.9443 = 536.36 ≠ 538;
  - el descuento de la API (84) no es igual al descuento implícito en Rappi (580 − 538 = 42). Que 84 = 2 × 42 es una **coincidencia numérica sin explicación**; no se interpreta.
- **Consecuencia para el portal (sin cambio aplicado):** Sucursales registra esta orden como **$568** de venta (`grossAmount`), que no coincide ni con la suma de productos de Rappi (580) ni con su total final (538). Esto ya estaba documentado como decisión vigente (docs/sucursales/11: «cobrado y neto tal como vienen en la API»). Si Carlo quiere conciliar contra la liquidación de Rappi, hace falta definir qué total es oficial. **Es una decisión pendiente, no un error corregible por conjetura.**

### Lo que sigue pendiente

- Detalle del pago de Rappi (donde «estarán discriminados» los descuentos): monto, tipo de promoción y quién la absorbe.
- Confirmación del proveedor sobre qué representan `discount`, `netAmout` y `percentageOfTransfer` en pedidos Rappi.

## Qué cambia en el diagnóstico de Generic (docs/05)

- «Generic» llega literal del proveedor (confirmado en fase 2). Ahora hay **dos usos aportados por negocio**:
  - combos («Crea tu The Coffee»);
  - artículos individuales (Iced Mocha en esta orden).
- **No hay una regla automática demostrada para distinguirlos.** El importe no sirve: $111 aquí era una bebida individual, y $199 coincide con el combo según Delivery, pero no se verificó.
- **Se mantiene:**
  - código y nombre crudos (`GENERIC` / «Generic»);
  - la etiqueta «Generic (sin identificación del proveedor)» (aplicada en fase 3);
  - el peso visible.
- **No se aplica ningún mapeo global** (`GENERIC → Iced Mocha` ni `GENERIC → Crea tu The Coffee`).
- La identificación de *esta* línea como Iced Mocha **viene de Rappi, no de Brasil**. Si se registrara, sería una correspondencia de ese pedido y esa línea, separada del dato del proveedor y con su evidencia (orden Rappi, captura o export, fecha). Es **propuesta**, no implementada.
- **Rappi Turbo:** la captura prueba que esta orden se vio en la tienda «Rubén Darío - Turbo». La API no tiene un campo que lo indique, así que no hay un clasificador automático.

## «Orden Rappi» en el detalle del pedido: aprobada e implementada

Implementada como se describe abajo y aprobada por Carlo el 2026-10-23. El campo crudo `refundId` no sale del servidor.

**Archivos:**
- `lib/sucursales/normalizar.ts`
- `lib/sucursales/contratos.ts`
- `lib/sucursales/datos.ts`
- `lib/sucursales/metricas.ts` (`conciliar().rappiSinNumeroOrden`)
- `components/sucursales/detalle-pedido.tsx`

**Pruebas:**
- `tests/portal/sucursales-rappi.test.ts`: 10 dígitos, ausente, vacío, 9 y 11 dígitos, número en lugar de string, UUID de tarjeta, efectivo con 10 dígitos, ausencia de UUID y de `refundId` en el JSON, contador y totales.
- `tests/portal/sucursales-ui.test.tsx`: detalle con orden, sin orden y de mostrador.
- Sin cambios en permisos ni en totales.

En el detalle, el título pasa de «Pedido 31893730» a «**Pedido POS 31893730**», para distinguirlo de la orden Rappi. La tabla de Pedidos no cambia.

### Diseño (aprobado)

**Contrato** (`lib/sucursales/contratos.ts`, `PedidoVista`):

```ts
/** Número de orden en Rappi, solo para pedidos con pago RAPPI cuyo refundId cumple el formato verificado. */
numeroPedidoRappi: string | null;
```

**Origen del dato:** solo en el servidor (`lib/sucursales/normalizar.ts`), siguiendo este orden:
1. Si `paymentMethod !== 'RAPPI'`, el valor es `null` y `refundId` se ignora, porque en tarjeta es un UUID de transacción.
2. Si es RAPPI y `refundId` es un string de exactamente 10 dígitos (`/^\d{10}$/`, la forma observada en 521 de 521), se conserva **como string**. No se convierte a número, no se ordena y no se interpreta como importe.
3. En cualquier otro caso (Rappi sin `refundId`, vacío u otro formato): `null`, contado en la conciliación como «Rappi sin número de orden» para detectar cambios del proveedor.

**Presentación:**
- Se mantiene **«Pedido POS 31893730»** y se agrega una línea aparte **«Orden Rappi 2482647582»**. Ninguno reemplaza al otro.
- Si el valor es `null` en un pedido Rappi, se muestra «Orden Rappi: no disponible en la API». No se inventa ni se reconstruye.
- No se agregan enlaces a Rappi ni datos de clientes. Se usa el mismo DTO en la tabla de Pedidos y en el detalle (solo en el detalle si se prefiere no ensanchar la tabla).
- **Autorización:** sin cambios. Las rutas siguen llamando `autorizar()` (sesión, módulo y sucursal) antes de caché y proveedor.

**Pruebas propuestas:**

| Caso | Resultado esperado |
|---|---|
| RAPPI con `refundId` de 10 dígitos | `numeroPedidoRappi` igual al valor como string |
| RAPPI con `refundId` ausente, vacío o `null` | `null`; el contador de conciliación sube |
| RAPPI con formato inesperado (UUID, 9 u 11 dígitos, letras) | `null` |
| Pago `CARTAO` con `refundId` UUID | `null`; el UUID no aparece en la respuesta JSON |
| Pedido de otra company | Excluido como hoy (sin cambio) |
| Totales y KPIs | Sin cambio en ningún origen |
| Permisos | Sin sesión, sin módulo o con otra sucursal: 0 llamadas al proveedor, como hoy |

**Esfuerzo:** bajo (normalizador, DTO, detalle y pruebas).

**Riesgo:** bajo. Expone un identificador externo que ya está en la API y no tiene PII. El residual es que el proveedor cambie la semántica de `refundId`; el contador lo detecta.

## Preguntas nuevas

Las preguntas para el proveedor, Delivery y Rappi se agregaron a `06-PREGUNTAS-PROVEEDOR.md` (sección «Complemento 23-oct»). No se contactó a nadie.
