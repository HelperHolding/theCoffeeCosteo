# 06 · Estado y decisiones

Actualizado: 2026-10-22.

## Verificado

- Repositorio del portal: `sebascm0906/theCoffeeCosteo`, `main` @ `afd4ef0`, con Costeo y CRM.
- La API responde con token. Se ejecutaron 51 GET acotados (ver 02); no hubo errores salvo los provocados a propósito (401 sin token, 404 con ID inexistente).
- Contrato real: envelope con `totalItems`/`totalPages`, campo `netAmout`, `perPage` por defecto 10, `lookerStoreId`.
- Paginación sin solapes; fechas inclusivas; relectura estable; frescura de segundos.
- `grossAmount` = líneas + customs (755/755); descuento en % de línea con monto en el pedido (107/107).
- `fromSmartphone` = pedidos de la app The Coffee; no hay campo que indique Rappi.
- Historial de la piloto: desde 2026-02-11, 27,603 pedidos.

## Identidad de la piloto — confirmada

| Fuente | Dato |
|---|---|
| API `/company/list/all` | `id 612`, «The Coffee Cd. Juárez», `lookerStoreId 477` (único «Juárez» de 119) |
| Pedidos de la 612 | `companyId 612`, `lookerStoreId 477` en todos; primer pedido 2026-02-11 |
| CRM `crm_tiendas` (SELECT de solo lectura) | «Cd. Juárez - 477», Ciudad Juárez, Avenida del Sauce 2218 Campos Eliseos, Jestor 477, apertura 2026-02-13, `rappi = false` |

**company_id = 612.** El 477 es el número Jestor/Looker, no el company_id (`company_id 477` es Ciudad Granja). El CRM tiene otras tres tiendas en Juárez sin Jestor ni equivalente en la API («Cd. Juárez 2», Quorum, Plaza Cantabria).

## No verificado o pendiente

- Zona de `createdAt`: la evidencia indica hora local etiquetada como Z. Hay que revalidar después del 1-nov (cambio de horario de Juárez).
- Moneda (MXN supuesto), significado de `netAmout`/`percentageOfTransfer`/`refundId`, diferencia entre wallets.
- Si una línea siempre equivale a 1 unidad.
- Límites de servicio y concurrencia.
- Si otras sucursales con Rappi traen pedidos de Rappi en este endpoint.
- Comportamiento con fechas inválidas.
- `npm test`/`build` no se ejecutaron: no hubo cambios en el portal.

## Archivos de esta fase

- `docs/sucursales/01…06` (este paquete).
- `scripts/sucursales/explorar-api.ts`: utilidad CLI de exploración GET. No la usa el portal.
- `.env.local`: se agregó la línea `THECOFFEE_API_TOKEN` (valor cargado por Carlo; archivo ignorado por Git).
- Muestras crudas: `%TEMP%\thecoffee-sucursales-api\` (fuera del repo; se pueden borrar).

## Decisiones propuestas (requieren el visto bueno de Carlo)

1. **Alcance «POS»**. Recomendación: Ventas POS muestra mostrador + App The Coffee con desglose por origen. Alternativa: solo mostrador. La app representa 5–8 % de los pedidos.
2. **Prioridad**: En vivo → Productos → Pedidos en la fase D; Tendencias en la fase E.
3. **Datos**: bajo demanda con caché de 30–60 s, sin tablas de pedidos en la piloto. La persistencia se evalúa al escalar.
4. **Venta oficial** = `grossAmount` (cobrado al cliente). `netAmout` no se muestra como KPI.
5. **Unidades** = conteo de líneas, marcado como «estimado» hasta que el proveedor lo confirme.
6. **Gráficas** en SVG propio, sin nueva dependencia.

## Preguntas para The Coffee Brasil

1. ¿`createdAt` está en hora local de la tienda o en UTC? ¿De qué zona (Juárez o CDMX)?
2. Moneda de los importes; definición de `netAmout` y `percentageOfTransfer`.
3. ¿Qué es `refundId`? ¿Cómo se reflejan las cancelaciones y devoluciones?
4. ¿Puede un ítem representar más de una unidad?
5. ¿Este endpoint incluye pedidos de Rappi u otros agregadores en alguna tienda?
6. ¿Hay límites de llamadas o concurrencia? ¿Cuánto historial se conserva?
