# 02 · Contrato de métricas y filtros, y cotejo

- **Fecha:** 2026-10-27.
- **Referencias temporales:**
  - Lectura POS de la red a las **17:38:18 UTC**.
  - Lectura POS de Juárez, septiembre, a las ~19:05 UTC (ventana cerrada).
  - Última importación de Zoho «Looker Sucursales»: **27-oct 14:51:35 GMT**.
  - Todas las ventanas comparadas son **anteriores** a esa importación.
- Sin datos personales; los pedidos no traen clientes. Las muestras quedaron fuera del repo.
- Leyenda: ✅ verificado · 🟡 consistente, sin confirmar · ⚠️ inconsistencia · ⛔ no accesible.

## 1. Regla de lectura

«Zoho» describe lo que calcula el dashboard. «Portal» describe cómo reproducirlo con la API POS, que es la fuente que sustituye la carga manual. **Paridad** significa que el portal reproduce la cifra de Zoho dentro de la tolerancia de §4.4, **sobre el mismo alcance de canales**.

## 2. Diccionario de métricas

Las fórmulas de los widgets **no son legibles** (doc 01 §2.2). La columna «Zoho» es la fórmula que **reproduce exactamente** el valor mostrado (§3), sobre las columnas y QT leídas.

| Métrica | Zoho | Portal (API POS) | Unidad · redondeo | Nulos, cero, negativos | Estado |
|---|---|---|---|---|---|
| **Ventas Netas** | `SUM("Net Amount (Local)")` de «Looker Sucursales» | Σ`grossAmount` de pedidos únicos | MXN **con IVA**, después del descuento. El KPI muestra entero | Zoho tiene líneas de $0 (pedidos con saldo de wallet, §4.3). La API no tiene cancelaciones | ✅ |
| IVA | Incluido. Sin IVA = /1.16 en `Revenue Sin IVA` | Incluido | — | — | ✅ «Netas» **no** significa sin IVA |
| Descuentos | Ya restados en `Net Amount`. Además hay `Discount (Local)` | Ya restados en `grossAmount`. Además hay `discount` | — | — | ✅ |
| Devoluciones o cancelaciones | `Status` ∈ {Completed, DELIVERED} el 26-oct; no se vieron otros valores | No existen en la API | — | — | 🟡 |
| Canales | Mostrador («Tablet»), app («Smartphone») y **Rappi y Rappi Turbo desde archivo manual** | Mostrador y app completos; Rappi **parcial** (`paymentMethod=RAPPI`) | — | — | ⚠️ Ver §4 |
| **# de Tickets** | `COUNT(DISTINCT "Order ID")` | Conteo de `id` únicos | tickets | — | ✅ |
| **Ticket Promedio** | Ventas Netas / # Tickets (cociente de sumas) | Σventa / Σtickets | MXN, 1 decimal | Sin tickets → «sin base» (no se sabe qué hace Zoho) | ✅ |
| **Total Products** | `SUM("Products")`: **unidades** | Número de líneas `items[]` (1 línea = 1 unidad; confirmado: 5,727 = 5,727 en Juárez, septiembre) | unidades | — | ✅ |
| **Promedio UPT** | Promedio de `UPT` de la QT «Ticket Promedio y UPT», con `UPT = COUNT("Products")`: **filas de producto por ticket, no unidades**. 7,073 / 4,703 = **1.504** | Para paridad: productos distintos por pedido. Unidades por ticket = 1.635 | 1 decimal | — | ✅ Explicado. ⚠️ La etiqueta induce a error: «UPT» (unidades por ticket) no cuenta unidades |
| **Meta** (Venta vs Meta) | Σ`MetaDiariaVentas` de la QT «Meta de Venta por Día de la semana» en las fechas del filtro **con meta cargada** | Sin fuente propia; se lee de Zoho o se migra (decisión D2) | MXN | Mes sin meta → 0, no «sin meta» ⚠️ | ✅ |
| Meta diaria | Meta mensual de la tienda ÷ Σ factores del mes × factor del día de la semana. Factores = promedio del día ÷ promedio diario de las **últimas 12 semanas**. Antes de `FechaApertura` vale 0 | — | MXN, 2 decimales | Tienda sin factores → factor 1 | ✅ SQL leído |
| **Diferencia vs Meta (Corriente)** / **Cumplimiento** | Venta − Σ meta diaria **de los días con venta cargada** | — | MXN / % | — | ✅ (§3) |
| **P.E.** | Punto de equilibrio de la QT «Abraham Punto de Equilibrio Diario» = P.E. mensual ÷ días del mes | Sin fuente | MXN | **Sin filas para 2026 → 0** | ✅ causa; widget ⛔ |
| P.E. vs Venta % / (Corriente) | P.E. / Venta y Venta − P.E. | — | % / MXN | Con P.E. = 0 sale 0 % y la venta completa como «excedente» ⚠️ | 🟡 |
| **Comparable** | QT «Tiendas Comparables»: ≥ 12 meses desde la **primera transacción en Looker** hasta `CURDATE()` | Apertura desde el CRM (`crm_tiendas`) | sí/no | Tiendas anteriores a 2024 truncadas a ene-2024 ⚠️ | ✅ SQL; relación con el filtro 🟡 |
| **Años Operando** | `FLOOR(meses/12)` desde la primera transacción | Igual, desde la apertura | años | Igual | ✅ SQL; relación con el filtro 🟡 |
| Costos / P&L | QT «Ventas y Costo» con «Costos Marzo 2026»; supuestos fijos de packaging y comisiones | Costo actual del Costeo | — | — | Fuera de la v1 |

### 2.1 Filtros

Las definiciones de filtros del dashboard **no son legibles por API**. Lo que sí se sabe por las columnas:

| Filtro | Columna probable | Observaciones |
|---|---|---|
| Fecha Relativa / Rango de Fechas | `"Date"` (hora local) | «Esta semana» el martes 27 = solo el lunes 26, porque los datos son T+1. Semana de lunes a domingo: lo confirma la meta, que suma lunes–sábado (§3). Precedencia entre ambos filtros ⛔ |
| Día de la Semana | `Día de la Semana Fórmula` (`day_name`) | Es texto; no se sabe si afecta a la meta ⛔ |
| Nombre de Tienda | `Nombre de Tienda` (CASE de 81 ramas sobre `Store ID`) | El nombre es una fórmula; en el portal la identidad será `Store ID` = `lookerStoreId` |
| Franquiciatario | `Franquiciatario` (CASE por nombre) | Lista fija, no el CRM |
| Comparable / Años Operando | Probablemente «Tiendas Comparables» unida por nombre | ⛔ Falta confirmar la unión |
| «Mostrar más filtros» | ⛔ | Se ven en la interfaz, no por API |

## 3. Reproducción de los KPI del lunes 26-oct (captura «Esta semana»)

| KPI (captura) | Reproducción con la exportación SQL de «Looker Sucursales» | Δ |
|---|---|---|
| Ventas Netas $667,493 / $667,493.32 | `SUM(Net Amount (Local))` = **$667,493.32** | 0 |
| # de Tickets 4,703 | `COUNT(DISTINCT Order ID)` = **4,703** | 0 |
| Ticket Promedio $141.9 | 667,493.32 / 4,703 = **141.93** | 0 |
| Total Products 7,691 | `SUM(Products)` = **7,691** | 0 |
| Promedio UPT 1.5 | `COUNT(filas)` / tickets = 7,073 / 4,703 = **1.504** | 0 |
| Venta vs Meta: $4,278,893 | Σ`MetaDiariaVentas` del 26 al 31-oct (81 sucursales) = **$4,278,892.67**. El 1-nov no tiene meta porque noviembre no está cargado | 0 (redondeo) |
| Diferencia vs Meta (Corriente) $15,666.39 | 667,493.32 − meta del 26-oct **651,826.93** = **15,666.39** | 0 |
| P.E. $0.00 / 0.0 % | «Abraham Punto Equilibrio» solo tiene 2025-10 a 2025-12 (11 tiendas, $2,415,606/mes) | Explicado |

Conclusiones:
- **Todos los KPI visibles se reproducen al centavo** con las columnas y QT leídas.
- Hay dos inconsistencias de diseño, sin error de datos:
  1. **UPT cuenta filas, no unidades.**
  2. **La meta de la semana omite días sin meta cargada** (el 1-nov) y el **P.E. vale 0 en 2026** sin aviso.

## 4. Cotejo con la API POS

### 4.1 Método

- **Zoho:** exportación asíncrona SQL (`GET /restapi/v2/bulk/workspaces/{ws}/data` → *job* → descarga). Clasificación: **lectura**; el *job* no cambia datos.
- **POS:**
  - Lecturas ya hechas de la red del 26-oct (sin repetirlas).
  - 2 GET para el detalle de 2 tiendas.
  - 7 GET para Juárez en septiembre.
- **Relación de entidades:**
  - Tienda: `Store ID` ↔ `lookerStoreId`.
  - Pedido: `Order ID` ↔ `id`.
  - **Nunca por nombre.**

### 4.2 Casos ejecutados

| Caso | Ventana | Alcance |
|---|---|---|
| Varias tiendas, un día cerrado | 26-oct-2026, **red completa** (79 tiendas en ambos, sin tiendas en uno solo) | Por tienda × canal × método de pago |
| Una tienda, un día, pedido por pedido | 26-oct; `Store ID` 566 (company 655) y 401 (company 509) | Por `Order ID` y línea |
| Una tienda, un mes cerrado | Septiembre 2026; Cd. Juárez (`Store ID` 477, company 612) | Por día × canal |
| Varias tiendas, periodo comparable | Serie diaria de Zoho del 12 al 26-oct (15 días). Del POS solo está el 26-oct | **Sustituto:** no se repitió el barrido POS de 2 semanas para no gastar ~500 GET. Queda como prueba de la etapa 4 |

### 4.3 Resultados

**Red, lunes 26-oct (79 tiendas):**

| Canal | Zoho tickets | POS tickets | Δ | Zoho venta | POS venta | Δ venta |
|---|---|---|---|---|---|---|
| Mostrador (Zoho «Tablet» = POS no app y no Rappi) | 3,853 | 3,853 | **0** | $535,886 | $535,899 | −$13 (0.002 %) |
| App («Smartphone») | 212 | 214 | **−2** | $22,593 | $26,273 | **−$3,680** |
| Rappi + Rappi Turbo | **638** (423 + 215; `Status` DELIVERED) | 24 (`paymentMethod=RAPPI`) | +614 | $109,014 | $5,163 | +$103,851 |
| **Total** | **4,703** | **4,091** | +612 | **$667,493.32** | **$567,320.21** | **+$100,173.11** |

- Unidades sin Rappi: Zoho `SUM(Products)` 6,621 vs líneas POS 6,624 (−3).
- Sin Rappi, 77 de 79 tiendas tienen los mismos tickets; las 2 restantes difieren en 1 pedido de app cada una.

**Pedido por pedido (tiendas 566 y 401):**
- **Rappi:** los pedidos Rappi de Zoho tienen **IDs de Rappi** (≥ 2,483,000,000), no del POS. Vienen del archivo manual: 12 y 15 pedidos.
- **Pedido de app ausente:** uno pagado con `WALLET_BALANCE` ($88) **no está** en Zoho.
- **Pedidos de app con importe menor:**
  - Uno de $327 (3 bebidas de temporada + modificadores) aparece en Zoho con **$0**.
  - Otros aparecen con importes menores: $89 → $80.99 y $310 → $285.06. El reparto sugiere un descuento o saldo prorrateado por línea.
- **Lectura:** el export de Looker trata el saldo de wallet y algunos cobros de la app de otra forma que el POS. Los $3,680 de diferencia en app (red) son de este tipo. El POS tuvo 74 pedidos con `WALLET_BALANCE` el 26-oct ($8,417).

**Juárez, septiembre 2026 (mes cerrado):**

| Canal | Zoho | POS | Δ |
|---|---|---|---|
| Mostrador | 2,871 tickets · $559,563.10 · 5,727 unidades | 2,871 · $559,563.25 · 5,727 líneas | **0 tickets · −$0.15 · 0 unidades**. Los 30 días cuadran; máximo $0.02 por día |
| App | 170 · $22,439.75 | 171 · $25,119.39 | −1 · −$2,679.64. Hay 28 pedidos con wallet ($4,484.25) |
| Rappi | 120 · $25,783.40 | 0 | Solo Zoho (archivo manual) |

### 4.4 Diagnóstico de la diferencia del 15 %

| Causa | Efecto el 26-oct | Clase |
|---|---|---|
| Rappi y Rappi Turbo cargados a mano desde el reporte de Rappi; casi no llegan por la API | +614 tickets, +$103,851 | **Datos / cobertura de canal** |
| Pedidos de la app con saldo de wallet: en Zoho faltan o tienen importe menor | −2 tickets, −$3,680 | **Definición en origen (export de Looker)** |
| Mostrador | 0 tickets, −$13 | Redondeo |

**No hubo que ajustar datos.** Con los mismos canales, las cifras coinciden. Riesgos:
- Si el portal sumara la API POS (24 Rappi) **y** el archivo Rappi, contaría **doble** los pedidos Rappi registrados en el POS.
- **Llave común Rappi, verificada el 2026-10-27:** los 24 pedidos Rappi del POS del 26-oct son todos de Rubén Darío (company 532 / `Store ID` 455). Su **`refundId` = `Order ID` de Rappi en Zoho en 24 de 24**, con la misma hora.
  - Zoho no los cuenta dos veces: usa solo el registro del archivo Rappi y no el ID del POS.
  - El importe difiere **−$496.20** (Zoho $4,666.80 vs POS $5,163). Ejemplos: $88 → $70.40 y $165 → $147.40. El archivo Rappi trae el precio después de promociones de Rappi que el POS no registra.
  - 20 de los 24 son **Rappi Turbo**, que la API no distingue.
  - Las otras 78 tiendas no registran sus pedidos Rappi en el POS.

Tolerancias propuestas para la paridad del portal:
- **Conteos:** 0.
- **Venta de mostrador:** ±$0.01 por ticket. Se observó ≤ $0.02 por día.
- **App:** la paridad **no es posible** con la API (wallet). Se documenta como diferencia de definición y no se fuerza.
- **Rappi:** fuera de la paridad hasta que Brasil exponga Rappi completo en la API.

## 5. Identidades

| Entidad | POS | Zoho | CRM | Estado |
|---|---|---|---|---|
| Tienda | `lookerStoreId` | `Store ID` | `crm_tiendas.numero_tienda_jestor` | ✅ 79/79 por ID el 26-oct. Nombre: fórmula de Zoho, **no usar** |
| Pedido | `id` | `Order ID` (mostrador y app) | — | ✅ |
| Pedido Rappi | `refundId` (cuando el pedido pasa por el POS) | `Order ID` (ID de Rappi) | — | ✅ 24/24 en Rubén Darío el 26-oct. Permite deduplicar |
| Producto | `items.defaultCode` | `Default Code` | `producto_codigo_pos` | 🟡 Mismo código en las muestras |
| Franquiciatario | — | Fórmula por nombre | `crm_tiendas.franquiciatario` | Usar el CRM vía la tienda; cotejar su lista contra la fórmula de Zoho en la etapa 2 |
