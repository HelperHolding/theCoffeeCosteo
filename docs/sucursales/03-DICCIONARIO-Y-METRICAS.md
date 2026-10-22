# 03 · Diccionario observado y catálogo de métricas

Evidencia: semanas cerradas del 06 al 12 oct (773 pedidos) y del 13 al 19 oct (755) de la company 612, más los días 20 y 21 y el conteo mensual. Ver `02-API-EXPLORACION.md`.

**Estados de cada definición:**
- ✅ validada con datos;
- 🟡 derivable con condiciones;
- ❓ requiere aclaración del proveedor;
- ⛔ no disponible.

## Diccionario de campos

| Campo | Tipo observado | Semántica observada | Estado |
|---|---|---|---|
| `id` | number, único | Identidad del pedido. Descendente en el tiempo | ✅ |
| `companyId` | number | = company_id consultado | ✅ |
| `lookerStoreId` | number | = número de tienda Jestor del CRM (477 ↔ 612) | ✅ para la piloto; se valida por sucursal |
| `createdAt` | `YYYY-MM-DDTHH:mm:ss.000Z` | **Hora local de la tienda etiquetada como Z.** Las horas van de 07 a 21. El pedido más reciente coincide con la hora local de Juárez al momento de la lectura. Si fuera UTC real, la tienda vendería de 01:00 a 15:00 | 🟡 Tratar como hora local sin zona. ❓ Confirmar con el proveedor y revalidar tras el cambio de horario del 1-nov-2026 (`America/Ciudad_Juarez` pasa de UTC−6 a UTC−7; CDMX sigue en UTC−6) |
| `dateStart`/`dateEnd` | filtro | Inclusivos. Filtran por la fecha local de `createdAt` | ✅ |
| `grossAmount` | number, hasta 2 decimales | **Importe cobrado al cliente**, después del descuento. = Σ`items.amount` + Σ`itemsCustom.amount` en **755/755** pedidos | ✅ |
| `discount` (pedido) | number | Monto descontado sobre precio de lista. = Σ(lista − `amount`) de líneas y customs con descuento, en **107/107** pedidos | ✅ |
| `items[].discount`, `itemsCustom[].discount` | number | **Porcentaje** (5, 10, 15, 20, 25, 30, 50). `amount` ya viene neto de ese %: 129 × 0.9 = 116.1 | ✅ |
| `items[].amount` | number | Precio de **una unidad** de la línea, ya descontado. El mismo producto repetido aparece como líneas separadas (158 pedidos con líneas repetidas) | 🟡 Unidades = conteo de líneas. ❓ Confirmar que no existe una cantidad > 1 implícita |
| `itemsCustom[]` | array (o vacío) | Modificadores y tamaño: «Regular – 440ml», «Large – 600ml», leches, shots, temperatura, salsas. Su `amount` **se suma aparte**; no está incluido en la línea padre | ✅ |
| `netAmout` (sic) | number | = `grossAmount` en todos los pedidos de mostrador. En pedidos de app es menor (≈ 90–96 %); en 2 pedidos `WALLET_BALANCE` vale 0 | ❓ Parece «importe que se transfiere a la tienda» tras comisión de app. No es utilidad |
| `percentageOfTransfer` | number o null | 100 en todo mostrador; 90.11–96.72 o null en la app. No reproduce `netAmout` exactamente (85.5 × 0.9012 = 77.05 ≠ 77.81) | ❓ |
| `fromSmartphone` | boolean | true ⇔ `paymentType = WALLET` ⇔ `refundId = null` (59/59). **Pedidos de la app The Coffee**, no Rappi | ✅ como «App The Coffee» |
| `paymentMethod` | enum en portugués | `CARTAO` (tarjeta), `DINHEIRO` (efectivo), `VIRTUAL_WALLET`, `WALLET_BALANCE` | ✅ valores; ❓ diferencia entre los dos wallets |
| `paymentType` | enum | `CONTACTLESS_EMV`, `EMV` (tarjeta chip), `CONTINGENCY` (efectivo y 2 tarjetas en contingencia), `WALLET` | 🟡 |
| `refundId` | string, "" o null | UUID en todos los pagos con tarjeta de mostrador, "" en efectivo, null en app. **No indica devoluciones**; parece ID de transacción del pago | ❓ |
| Estado, cancelación o devolución | — | No existe | ⛔ |
| Moneda | — | No viene en la respuesta. Precios consistentes con MXN (Iced Latte 80, sándwich ≈ 98) | 🟡 MXN declarado por el negocio; ❓ confirmar |
| Canal Rappi | — | Ningún campo lo identifica. El CRM marca `rappi = false` para la tienda 477 | ❓ Confirmar que este endpoint nunca incluye Rappi |
| Cliente | — | No hay datos personales en los pedidos | — |

Redondeo: los importes tienen hasta 2 decimales y llegan como float. Hay que sumar en centavos enteros (`Math.round(x * 100)`) y formatear con es-MX/MXN.

## Alcance «POS» — punto material abierto

Los pedidos de la API tienen dos orígenes:

| Origen | Pedidos sem. 13–19 | Importe | Sem. 06–12 |
|---|---|---|---|
| Mostrador (`fromSmartphone=false`) | 696 | $143,083.66 | 736 / $149,478.00 |
| App The Coffee (`fromSmartphone=true`) | 59 | $10,639.76 | 37 / $5,204.50 |

Rappi no aparece. «POS sin Rappi» puede significar «solo mostrador» o «mostrador + app propia». La decisión está en 06; ninguna cifra se publicará como «POS» hasta resolverla.

## Catálogo de métricas

**Definiciones comunes:**
- **Conjunto base:** pedidos de una company y ventana de fechas locales, deduplicados por `id`, extraídos completos (únicos = `totalItems`).
- **Venta** = Σ`grossAmount`.

| Métrica | Fórmula | Granularidad | Estado | Conciliación |
|---|---|---|---|---|
| Venta | Σ`grossAmount` | día/hora/semana | ✅ | = Σ líneas + Σ customs, al centavo |
| Pedidos | conteo de `id` únicos | idem | ✅ | = `totalItems` |
| Ticket promedio | Venta / Pedidos (sin base si Pedidos = 0) | idem | ✅ | sem. 13–19: $203.61; sem. 06–12: $200.11 |
| Descuento otorgado | Σ`discount` | idem | ✅ | sem. 13–19: $1,944.35 |
| % descuento | Σ`discount` / (Venta + Σ`discount`) | idem | ✅ base = precio de lista | — |
| Pedidos con descuento | conteo con `discount > 0` | idem | ✅ | 56/755 |
| Mezcla de pago | Venta y pedidos por `paymentMethod` (+ tipo) | idem | ✅ como distribución; **no** es conciliación bancaria | — |
| Venta por hora / mapa día×hora | agrupar por hora local de `createdAt` | hora | 🟡 depende de la confirmación de zona | — |
| Venta acumulada hoy vs mismo día de la semana anterior al mismo minuto | Σ hasta HH:mm de hoy vs Σ hasta HH:mm de hoy−7 | minuto | 🟡 misma condición de zona | 2 lecturas |
| Último pedido y ritmo | `max(createdAt)`; pedidos en los últimos 15/60 min | minuto | 🟡 | — |
| Importe por producto | Σ(`amount` + Σ`custom.amount`) por `defaultCode`, sin doble conteo | producto | ✅ | Σ productos = Venta |
| Unidades por producto | conteo de líneas por `defaultCode` | producto | 🟡 1 línea = 1 unidad, sin confirmar | — |
| Presencia en pedidos | pedidos que contienen el producto / pedidos | producto | ✅ | — |
| Personalizaciones | frecuencia de `itemsCustom.productName`; importe extra de customs | custom | ✅ | sem. 13–19: 3,714 customs |
| Tamaños | customs «Regular/Large – NNNml» | producto×tamaño | 🟡 se infiere del nombre del custom | — |
| Neto transferido (app) | Σ`netAmout` | — | ❓ no mostrar como métrica principal | — |
| Devoluciones o cancelaciones | — | — | ⛔ | — |
| Categorías de producto | — | — | ⛔ en la API; posible por cruce con Costeo (futuro) | — |
| Utilidad, margen, costo, inventario, clientes recurrentes, metas, impuestos | — | — | ⛔ | — |

Resultados de comprobación:
- Semana 13–19 vs 06–12: Venta −0.6 %, Pedidos −2.3 %, Ticket +1.7 %.
- Día más fuerte: sábado 17-oct, con 146 pedidos y $30,035.
- Picos horarios: 08–10 h y 19 h.

## Reglas para insights

- Comparar siempre contra el mismo día de la semana o el mismo tramo horario. Si la base es 0 o el periodo comparable está incompleto, mostrar «sin base comparable».
- Un periodo abierto (hoy) se compara al mismo minuto del día, nunca contra un día completo.
- Una falla del proveedor no se muestra como venta cero: se muestra un estado de error y la hora de la última lectura buena.
- No atribuir causas: se describe la variación, no el motivo.
