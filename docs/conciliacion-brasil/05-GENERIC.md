# 05 · Diagnóstico de «Generic»

**Fase 2 — solo lectura.** Fecha: 2026-10-23. Ventana: 4 semanas cerradas, 2026-09-21 → 2026-10-18, en 612, 583 y 532.

## Diagnóstico

**Confirmado:** «Generic» **llega literal del proveedor**:

```
items[].defaultCode = "GENERIC"
items[].productName = "Generic"
```

- No es un fallback local: no existe ese literal en el código del portal.
- No es una colisión de nombres bajo un mismo código: `GENERIC` tiene un solo nombre en toda la ventana.
- No es el nombre más reciente de un grupo mezclado.

La hipótesis de colisión de la fase 1 queda **descartada para Generic**.

## Recorrido del dato

1. **Respuesta GET** `/order/company/532`: línea padre con `defaultCode: "GENERIC"` y `productName: "Generic"`, `itemsCustom: []`.
2. **Validación** (`lib/sucursales/normalizar.ts:14-32`): pasa el esquema. Queda `codigo = "GENERIC"` (`defaultCode || productName`) y `nombre = "Generic"`.
3. **Agrupación** (`lib/sucursales/metricas.ts:123-136`): clave `GENERIC`, un solo nombre.
4. **Métrica:** importe = `amount` + customs (0). Participación sobre el total de líneas.
5. **Etiqueta en la UI:** «Generic» en Productos, en el top 5 de En vivo y, si es el primero, en el texto del insight.

## Peso y contexto

| Medida | Valor |
|---|---|
| Sucursal | **Solo 532 Rubén Darío** (0 en 612 y 583) |
| Origen | **Solo Rappi** (`paymentMethod=RAPPI`, `paymentType=CREDIT`) |
| Pedidos / líneas | 101 / 108 |
| Importe | **$18,020.00** |
| Peso | **8.2 %** de las líneas de 532 en «Mostrador + App + Rappi» (posición **#2** del ranking) · **18.2 %** de Rappi en 532 (posición **#1** en la pestaña Rappi) |
| Por semana (pedidos con Generic / pedidos Rappi) | 21-sep: 12/115 · 28-sep: 37/134 · 5-oct: 30/128 · 12-oct: 22/124 |
| Pedidos solo con Generic | 63; los otros 38 lo combinan con productos identificados (Pumpkin Iced Latte, Iced Latte, True White…) |
| Customs | Ninguno (0 líneas con personalizaciones) |
| Descuento de línea | 0 en las 108 líneas |
| Descuento de pedido | En 96 de 101 pedidos (promociones de Rappi) |
| Importes de línea | $199 ×64, $150 ×11, $111 ×10, $133 ×9, $75 ×4, $80 ×3, $95 ×3, $76 ×2, $175 ×2 |

El resto de Rappi en 532 sí trae productos identificados (56 códigos distintos). Generic es un subconjunto específico, no todo Rappi.

**Ejemplo redactado** (estructura real, sin `id` ni `refundId`):

```json
{ "origen": "rappi", "fecha": "2026-09-27", "grossAmount": 221, "netAmout": 194.6, "discount": 36.4,
  "items": [ { "defaultCode": "GENERIC", "productName": "Generic", "amount": 133, "discount": 0, "itemsCustom": [] },
             { "defaultCode": "5IL", "productName": "Iced Latte", "amount": 88, "discount": 0,
               "itemsCustom": [ { "defaultCode": "TRADICAPP", "productName": "Regular - 440ml", "amount": 0 }, "…" ] } ] }
```

## ¿Se puede identificar el artículo? No con la información disponible

- La línea no trae customs, tamaño ni otro campo que lo describa.
- Los importes se repiten ($199 en 64 líneas), así que probablemente son artículos o combos de Rappi sin mapeo en el POS. **Es una hipótesis, no una conclusión.**
- **No se asigna a ninguna receta por importe parecido**, ni se reparte el total entre productos.
- Para identificarlo hace falta:
  - que el proveedor diga qué representa `GENERIC` en la integración con Rappi; o
  - cruzar `refundId` (ID del pedido en Rappi, docs/11) con el reporte de Rappi, que sí trae el artículo.

## Hallazgo relacionado: productos partidos por código nulo en App

Esto sí es un problema de agrupación local, distinto de Generic:
- Desde el **2026-10-02**, 109 de 156 pedidos de **App** llegan con `defaultCode: null` en todas sus líneas. Antes de esa fecha: 0 de 102.
- El portal los agrupa por `productName`, así que un mismo producto aparece en **dos filas**: «Iced Latte» con código `5IL` y otra «Iced Latte» con clave igual al nombre.

| Sucursal (todos) | Filas actuales | Productos duplicados |
|---|---|---|
| 612 | 113 | 34 |
| 583 | 94 | 18 |
| 532 | 94 | 17 |

## Opciones evaluadas (simulación local, no aplicada)

Simulación: `scripts/conciliacion/simular-ranking.ts`, sobre los mismos 5,324 pedidos, por sucursal y origen.

| Opción | 612 | 583 | 532 | Conserva venta, líneas y customs | Efecto |
|---|---|---|---|---|---|
| Actual: `defaultCode \|\| productName` | 113 | 94 | 94 | — | Duplica productos de App |
| A: nombre exacto | 79 | 76 | 77 | ✅ | Une los duplicados. Fragmentaría un producto renombrado y uniría dos productos con el mismo nombre (no observado) |
| **B: código; si es nulo, el código más frecuente de ese nombre exacto en la ventana** | 79 | 76 | 77 | ✅ | Une los duplicados y conserva la identidad por código. Si un nombre nulo no tiene código conocido, cae al nombre |
| C: código + nombre | 113 | 94 | 94 | ✅ | **No resuelve nada.** No hay códigos padre con varios nombres en la ventana |

**Conservación.** En las 10 combinaciones de sucursal y origen, los totales de A, B y C son idénticos al actual: importe de líneas, número de líneas e importe de customs.

**Residual venta − líneas:** 17 ¢ en 612, 2 ¢ en 583 y 5 ¢ en 532. Coincide exactamente con los pedidos que no cuadran (17, 2 y 5), cada uno de ±1 ¢. Es el **redondeo del proveedor** ya documentado en docs/10; no lo causa ninguna opción.

**Implementado en fase 3:** la opción B, corregida tras la revisión del PR #18.
- Se une solo cuando el nombre tiene un único código en el periodo de esa sucursal.
- Los casos ambiguos quedan aparte, marcados «sin código».
- Las claves de código y de nombre van separadas.
- El resultado no depende del orden de los pedidos.

Detalle en `09-RESULTADO-FASE-3.md`.

**Propuesta original:**
- Opción **B** para el ranking.
- **Generic se mantiene visible**, sin excluirlo ni reetiquetarlo como producto, con la etiqueta «Generic (sin identificación del proveedor)» y su peso.
- Prueba de conservación de totales con fixtures.

## Hallazgo colateral: «Tamaños» del ranking

La regex `\d{2,4} ml` (`metricas.ts:91`) clasifica como tamaño también «Double shot (36ml)», «Single Shot (18ml)», las dosis de vainilla («Average Vanilla (15ml)»…) y los tumblers. Son 16 etiquetas en 612.

La sublista «Tamaños» del ranking mezcla vasos con shots. No altera totales; solo la presentación. Propuesta: limitarla a `^(Regular|Large) - \d{3}ml$`, con prueba.
