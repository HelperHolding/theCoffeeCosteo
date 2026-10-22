# 02 · Exploración GET de la API The Coffee

- Fecha de ejecución: **2026-10-22, 18:03–18:10 UTC** (12:03–12:10 hora de Juárez, UTC−6 en esta fecha).
- Base: `https://api.thecoffee.jp`. Autenticación: `Authorization: Bearer` con `THECOFFEE_API_TOKEN` leído de `.env.local` (ignorado por Git). El token no aparece en URLs, salidas, documentos ni commits.
- Herramienta: `scripts/sucursales/explorar-api.ts` (solo GET, 400 ms entre llamadas, timeout 30 s, máximo 3 intentos con backoff y `Retry-After` solo para 429/5xx). Las respuestas crudas quedaron **fuera del repo**, en `%TEMP%\thecoffee-sucursales-api\`.
- Volumen total: **51 GET** (1 sin credenciales, 1 lista de sucursales, 49 de pedidos sobre la piloto, salvo 1 con un ID inexistente). Sin barridos de IDs ni consultas a otras sucursales.

## Contrato observado

### `GET /company/list/all`

- `200`, 845 ms, 7.7 KB. Array de **119** objetos `{ id, name, lookerStoreId }`. `lookerStoreId` no está documentado y viene en los 119 como número.
- Ordenado por `id` ascendente (384–826). Sin `id` duplicados ni `lookerStoreId` duplicados.
- Un nombre duplicado: «The Coffee Parque las Antenas» (ids 800 y 802, lookerStoreId 711 y 715). Por eso la identidad nunca puede depender del nombre.
- Un registro no comercial: «Station TTG (Solo empleados)» (id 539). No todos los registros son tiendas públicas.
- **Trampa de identidad:** `company_id 477` es «The Coffee Ciudad Granja» (lookerStoreId 382), no la piloto.
- Piloto: `{ id: 612, name: "The Coffee Cd. Juárez", lookerStoreId: 477 }`. Es el único nombre con «Juárez».

### `GET /order/company/{id}`

- Respuesta: un **envelope**, no el array documentado:
  `{ currentPage, totalItems, totalPages, perPage, from, to, data: Pedido[] }`.
- Pedido: `id, companyId, lookerStoreId, fromSmartphone, netAmout, grossAmount, percentageOfTransfer, refundId, discount, paymentMethod, paymentType, items[], createdAt`.
  - El campo neto llega como **`netAmout`** (errata del proveedor; `netAmount` no existe).
  - `lookerStoreId` viene también en cada pedido.
- Headers útiles: `content-type`, `content-length`, `etag` débil. No hay headers de rate limit, paginación ni `Retry-After`. Servidor Express, CORS `*`.
- Errores:
  - sin token: `401 {"statusCode":401,"message":"Unauthorized","path":…,"timestamp":…}`;
  - ID inexistente: `404 "ResourceNotFoundException: company not found"`.
  - No se observaron 429 ni 5xx.

## Matriz ejecutada (company 612)

| Caso | Filtros | Status | Latencia | Resultado |
|---|---|---|---|---|
| Sin filtros | — | 200 | 4,720 ms | `perPage` por defecto **10** (no 20). `totalItems 27,603`, `totalPages 2,761`. Pedidos más recientes primero |
| Día, pág. 1 | 2026-10-21, perPage 20 | 200 | 313 ms | 20 de `totalItems 96`, `totalPages 5` |
| Día, pág. 2 | ídem, page 2 | 200 | 298 ms | 20; intersección con pág. 1 = 0 |
| Día, perPage 50 | ídem | 200 | 426 ms | 50; subconjunto de la lectura de 100 |
| Día, perPage 100 | ídem | 200 | 1,290 ms | 96 = total; pág. 1 ∪ pág. 2 ⊆ esta lectura |
| Día anterior | 2026-10-20, perPage 100 | 200 | 728 ms | `totalItems 106`; intersección con el día 21 = 0 |
| Dos días | 20–21 oct, perPage 100 | 200 | 470 ms | `totalItems 202` = 96 + 106 → **dateStart y dateEnd inclusivos** |
| Futuro | 2026-11-20/21 | 200 | 222 ms | `totalItems 0`, `data []`: vacío válido, distinto de error |
| Página fuera de rango | page 999 | 200 | 251 ms | `data []`, `totalItems 96`; `from 19961`/`to 96` incoherentes, no usar `from`/`to` |
| Relectura inmediata | día 21, pág. 1 | 200 | 328 ms | Mismos IDs y mismo ETag |
| Semana cerrada A | 06–12 oct, perPage 100 | 200 ×8 | 5.2 s total | 773 únicos, 0 duplicados, fin por `totalPages` |
| Semana cerrada B | 13–19 oct, perPage 100 | 200 ×8 | 5.1 s total | 755 únicos, 0 duplicados, fin por `totalPages` |
| perPage alto | 13–19 oct, perPage 500 | 200 | 2,785 ms | Devuelve 500; no hay truncamiento silencioso a 500 |
| Conteo mensual ×17 | perPage 1 | 200 | 0.7–6.2 s | Ver historial |
| Primer pedido | feb 2026, perPage 1, última página | 200 | — | `2026-02-11T18:28:16` |
| Relectura, 4 min después | día 21, perPage 100 | 200 | — | 96/96 idénticos campo a campo; semana B sigue en 755 |
| ID inexistente | 99999 | 404 | — | Error explícito (no vacío) |

## Historial y volumen

| Mes | Pedidos | | Mes | Pedidos |
|---|---|---|---|---|
| 2024-10 a 2026-01 (8 meses muestreados) | 0 | | 2026-06 | 2,630 |
| 2026-02 (desde el día 11) | 2,983 | | 2026-07 | 2,828 |
| 2026-03 | 4,379 | | 2026-08 | 3,313 |
| 2026-04 | 3,197 | | 2026-09 | 3,042 |
| 2026-05 | 2,940 | | 2026-10 (al día 22, 12:03) | 2,292 |

- Feb–oct suman 27,604, frente a 27,603 sin filtros: coinciden; la diferencia es un pedido nuevo entre lecturas. **Todo el historial de la piloto empieza el 2026-02-11** (el CRM registra apertura el 13-feb).
- No se puede comprobar si la API guardaría más de un año de historial, porque la tienda tiene menos de uno.
- Volumen típico: unos 110 pedidos al día, unos 3,000 al mes y unos 30 KB por cada 36 pedidos.
- Los meses vacíos tardan de 4 a 6 s; los meses con datos, menos de 2 s.

## Paginación: regla de terminación sustentada

1. Leer `totalPages` de la primera página y recorrer hasta `page == totalPages`.
2. Abortar ante página vacía, página idéntica a la anterior o página sin IDs nuevos.
3. Deduplicar por `id`.
4. Comparar únicos con `totalItems` de cada página. Si `totalItems` cambia durante el recorrido (ventana abierta), marcar la carga como parcial.

Orden: `createdAt` descendente. En una ventana viva, un pedido nuevo desplaza los registros hacia páginas posteriores. Por eso las conciliaciones se hacen sobre ventanas cerradas o con deduplicación más relectura.

## Frescura

La lectura sin filtros de las 18:03:01Z devolvió como pedido más reciente `createdAt 12:03:12` (hora local, ver 03). La API refleja pedidos con segundos de retraso. La diferencia de unos +6 s sugiere reloj del dispositivo POS adelantado. Es una medición puntual, no una garantía de latencia.

## Ejemplo redactado (estructura real, valores de un pedido)

```json
{ "id": 31846517, "companyId": 612, "lookerStoreId": 477, "fromSmartphone": false,
  "netAmout": 198, "grossAmount": 198, "percentageOfTransfer": 100, "refundId": "",
  "discount": 0, "paymentMethod": "DINHEIRO", "paymentType": "CONTINGENCY",
  "items": [
    { "defaultCode": "SHCO", "productName": "Gelato Frappé Coffee", "amount": 108, "discount": 0,
      "itemsCustom": [ { "defaultCode": "GMILVEGAPP", "productName": "Oatmilk (Gelato)", "amount": 0, "discount": 0 },
                       { "defaultCode": "TRADICAPP", "productName": "Regular - 440ml", "amount": 0, "discount": 0 } ] },
    { "defaultCode": "4MIL", "productName": "Matcha Iced Latte", "amount": 77, "discount": 0,
      "itemsCustom": [ { "defaultCode": "LVG", "productName": "Oatmilk", "amount": 13, "discount": 0 } ] } ],
  "createdAt": "2026-10-21T21:55:14.000Z" }
```

Los pedidos no traen datos de clientes. Los `refundId` reales (UUID) se omiten aquí.

## Incidencias y limitaciones

- La documentación del proveedor no coincide con la API real: envelope en vez de array, `netAmout`, `perPage` por defecto 10 y campo `lookerStoreId` no documentado.
- No hay campo de estado, cancelación, canal ni moneda.
- No se observaron límites de servicio. Hasta 51 llamadas espaciadas no hubo 429, pero no se probó concurrencia.
- No se probaron formatos de fecha inválidos ni `dateStart > dateEnd`; quedan para pruebas del cliente con fixtures.
