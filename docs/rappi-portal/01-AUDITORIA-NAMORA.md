# 01 · Auditoría del portal de Rappi Partners (piloto Namóra)

Fecha: 2026-10-29. Rama `docs/rappi-portal-auditoria`. Solo lectura: no se aceptó, rechazó ni cambió nada en el portal, no
se descargó ningún archivo y no se tocó ningún flujo de n8n.

## Resumen

| Tema                       | Lo observado                                                                                                                                                        |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Portal                     | `partners.rappi.com` (el antiguo `restaurantes.rappi.com` redirige ahí). Una sola cuenta ve la marca **The Coffee (`MX575472`) con 73 tiendas**                     |
| Namóra en Rappi            | Tienda **`MX1930270777`** («The Coffee Namóra»). Entre el 21 y el 28 de octubre, el portal reporta **84 pedidos**                                                   |
| Fuente de datos            | Un endpoint JSON trae el historial **con productos y opciones** (`…/rests-stores-config/orders/by-stores`). El detalle de un pedido agrega los descuentos           |
| Sesión                     | `access_token` (JWT) en `localStorage`, válido **2 h**; `id_token` 10 h. Se renueva en `login.partners.rappi.com` (Auth0) sin refresh token visible                 |
| Riesgo principal           | **El listado no devuelve todos los pedidos que cuenta**: 79 de 84 en Namóra (21 al 28 de octubre). Hay que compensarlo (ver doc 02)                                 |
| Cotejo con el POS (27-oct) | Namóra: 11 pedidos de Rappi en el portal, **0 en el POS** y ninguno capturado a mano. Sumarlos no cuenta doble                                                      |
| Rubén Darío (532)          | El POS tiene 16 pedidos de Rappi ese día; la tienda `MX1930260682` del portal muestra 2. **Sin confirmar** dónde están los demás                                    |
| Patrón de Dodo MX          | Ya corre en el n8n de The Coffee: navegador sin pantalla con sesión guardada, cada 15 min, y un repaso diario de 7 días que detecta reclamos **2 a 4 días después** |
| Alternativa oficial        | Rappi tiene API de integración (órdenes y webhooks), con alta a través de Rappi. No es autoservicio                                                                 |

## 1. Inicio de sesión

**Flujo observado sin credenciales** (2026-10-29):

1. `https://partners.rappi.com` redirige a `https://restaurantes.rappi.com/login` («Portal Aliados»).
2. El formulario pide **país** (lista: Colombia, México, Brasil…), **correo o usuario**, **contraseña** y una casilla
   «Recordarme». Hay un acceso aparte para empleados de Rappi (correo `@rappi.com`).
3. La autenticación la hace Auth0 en `login.partners.rappi.com` (`/authorize`).
4. En la página no hay script de captcha (reCAPTCHA, hCaptcha ni Turnstile). **Sin confirmar** si después de la
   contraseña pide un código por SMS o correo: Carlo inició sesión y queda por anotar si se lo pidió.
5. Tras entrar, el portal abre `partners.rappi.com/home` con la marca y **todas** las tiendas seleccionadas en la URL
   (`brandId=MX575472&storeIds=…`). No hay que elegir tienda para entrar: Namóra se elige con el filtro «Sucursales».

**Dónde vive la sesión** (solo nombres y tipos; ningún valor copiado):

| Lugar              | Clave                                                      | Tipo                                              | Observado                                                            |
| ------------------ | ---------------------------------------------------------- | ------------------------------------------------- | -------------------------------------------------------------------- |
| `localStorage`     | `access_token`                                             | JWT de Auth0 (`iss` = `login.partners.rappi.com`) | Vida de **2 h** (`exp − iat`). Se envía como `Authorization: Bearer` |
| `localStorage`     | `id_token`                                                 | JWT                                               | Vida de 10 h                                                         |
| `localStorage`     | `expires_at`                                               | número                                            | Coincide con el `exp` del access token                               |
| `localStorage`     | `partner_id`, `store_id`, `user_roles`, `email`, `filters` | texto / JSON                                      | Contexto de la cuenta y filtros elegidos                             |
| `sessionStorage`   | `portal_permissions`, `user_permissions`                   | JSON                                              | Permisos de menú                                                     |
| Cookies del portal | solo de analítica                                          | —                                                 | No hay cookie de sesión en `partners.rappi.com`                      |

- **No hay refresh token** en `localStorage` ni en `sessionStorage`. La página renueva el token pidiendo a
  `login.partners.rappi.com/authorize` (sesión de Auth0 con su propia cookie), así que la renovación necesita un
  navegador con esa cookie viva. **Sin confirmar** cuánto dura esa sesión de Auth0.
- Las peticiones de datos llevan además `client-app-name: Partners Portal` y `client-app-version` (4.6.7 el 29-oct).

## 2. Mapa del portal

Menú lateral observado: Visión general · Notificaciones · Centro de ayuda · Top Restaurantes · Nivel de servicio ·
Reseñas · Ventas · RappiAds · Promociones · Conectividad · **Órdenes** · Cargo · **Financiero** · Menú/Carta ·
Mis tiendas · Usuarios · Horarios · Préstamos para ti. Arriba, el botón «Gestor de órdenes» (pedidos en curso).

| Pantalla                                                     | Qué ofrece                                                                                                                                                                            | Visitada                                   |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Visión general                                               | Venta bruta, total de órdenes y ticket promedio del periodo                                                                                                                           | Sí (solo lectura)                          |
| **Órdenes → Historial**                                      | Pestañas Órdenes, Solicitudes e Historial de descargas; tabla con orden, cliente, tienda, fecha, total, pago y estado; buscador por número de orden; botón «Descargar CSV»            | Sí                                         |
| Órdenes → detalle                                            | Panel lateral: productos con opciones y precio, subtotal, total después de descuentos; pestaña «Datos para facturación» (dice que la información se guarda solo 30 días)              | Sí, un pedido de Namóra                    |
| **Financiero**                                               | Resumen, Reportes, Facturas; tabla de pagos (ID de pago, tienda, fecha del pago, periodo de venta, valor a transferir, estado); botones «Generar reporte» y «Cambiar cuenta bancaria» | Solo se abrió; **no se tocó ningún botón** |
| Gestor de órdenes                                            | Pedidos en curso, con acciones sobre ellos                                                                                                                                            | **No** (es la operación de la tienda)      |
| Reclamos, Cargo, Promociones, Menú/Carta, Horarios, Usuarios | —                                                                                                                                                                                     | No                                         |

## 3. Endpoints

Base: `https://services.rappi.com/rests-partners-gateway/cauth`. Todos con `Authorization: Bearer <access_token>`.

| Uso                    | Método y ruta                                                       | Parámetros                                                                                                                                                                                                         | Respuesta                                                                                               |
| ---------------------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------- |
| **Historial**          | `POST /rests-stores-config/orders/by-stores?country=MX`             | Cuerpo: `country_code`, `language`, `from`, `to` (AAAA-MM-DD), `store_ids` (`["MX1930270777", …]`), `page_number` (desde 0), `page_size` (el portal usa 15; acepta 100), `order_id` (`""` o un número para buscar) | `page_number`, `page_size`, `total_rows`, `results[]` con el pedido **completo** (productos y opciones) |
| Detalle                | `GET /rests-stores-config/orders/{id}?country=MX&language=es`       | `{id}` sin prefijo `MX`                                                                                                                                                                                            | Lo del listado más `discount_info`                                                                      |
| Reclamos               | `POST /api/order-dispute-ms/order/search?country=MX&lang=es`        | `{"order_ids":[…]}`                                                                                                                                                                                                | Lista (vacía en el pedido observado)                                                                    |
| Compensaciones         | `POST /api/settlement-financial/v1/stores/compensations?country=MX` | `store_ids`, `order_ids`, `page_number`, `page_size`                                                                                                                                                               | 204 sin contenido en el pedido observado                                                                |
| Motivos de cancelación | `GET /partners-selfservice/config-manager/settings/ORDERS_CONFIG`   | —                                                                                                                                                                                                                  | Catálogo de códigos y textos por país                                                                   |
| Tiendas                | `GET /partners-selfservice/onboarding/stores?country=MX`            | —                                                                                                                                                                                                                  | Tiendas de la cuenta con su ID                                                                          |

- Sin la página (llamada directa con el mismo token), el historial respondió igual.
- Una búsqueda por `order_id` de pedidos de Rubén Darío que no aparecen en el portal respondió **403**. Por prudencia,
  después de eso solo se usó la interfaz.
- El endpoint que usa Dodo (`services.mxgrability.rappi.com/api/rs-platform-gateway/orders/partner/status/v2/…`)
  responde **403** con la cuenta de The Coffee: su extractor no se puede copiar tal cual.

### Calidad del listado: faltan pedidos

| Día (Namóra) | `total_rows` | Pedidos devueltos |
| ------------ | ------------ | ----------------- |
| 21-oct       | 14           | 14                |
| 22-oct       | 14           | 13                |
| 23-oct       | 12           | 12                |
| 24-oct       | 7            | 6                 |
| 25-oct       | 2            | 2                 |
| 26-oct       | 9            | 9                 |
| 27-oct       | 13           | 11                |
| 28-oct       | 13           | 12                |
| **Total**    | **84**       | **79**            |

- Las páginas de 15 devuelven 13–15 filas; con `page_size` 100 llegan las mismas 79. No hay repetidos entre páginas.
- **Sin confirmar** qué pedidos faltan y por qué. La exportación «Descargar CSV» podría traerlos (requiere permiso de
  Carlo para descargarla).
- En toda la marca pasa lo mismo: la primera página de 15 trajo 13 filas, con `total_rows` = 3,144 en 8 días.

## 4. Inventario de campos

Evidencia: pedido de Namóra del 28-oct visto en el listado, en el detalle y en pantalla. Ejemplos anonimizados.

**Pedido**

| Campo                                               | Ejemplo                                                               | Significado observado                                                                                                                                                                                       | Útil                                          |
| --------------------------------------------------- | --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| `id`                                                | `MX2484xxxxxx`                                                        | ID del pedido con prefijo de país. Sin `MX` es el número que muestra la pantalla y el `refundId` del POS en 532                                                                                             | Clave única                                   |
| `store_name`                                        | `The Coffee Namóra`                                                   | Nombre de la tienda. **El listado no trae el ID de tienda**                                                                                                                                                 | Solo con un filtro de una tienda por consulta |
| `created_at`                                        | `2026-10-27T07:43:02.000+00:00`                                       | Hora de creación. **Es hora local con etiqueta `+00:00`**: los pedidos del 27-oct van de 07:43 a 19:21 «UTC», que en Guadalajara serían 01:43–13:21. La pantalla muestra la misma hora sin convertir        | Fecha y hora local (igual que la API del POS) |
| `state` / `state_name`                              | `pending_review` / «Terminada»                                        | Estado final. Vistos: `pending_review` y `finished` («Terminada»), `canceled`, `canceled_with_charge`, `canceled_by_automation` («Cancelada»), `canceled_partner_order_refused` («Rechazada por el aliado») | Estado y cancelaciones                        |
| `is_dispute`, `dispute_status`                      | `false`, `""`                                                         | Reclamo abierto                                                                                                                                                                                             | Detectar reclamos                             |
| `payment_method`                                    | «Tarjeta de Crédito», «Efectivo contraentrega», «PayPal», «Apple Pay» | Cómo pagó el cliente                                                                                                                                                                                        | Sí                                            |
| `prime`                                             | `true`                                                                | Cliente Rappi Pro                                                                                                                                                                                           | Opcional                                      |
| `order_product_total_price`                         | `221`                                                                 | Suma de productos antes de descuentos (coincide con «Subtotal» en pantalla)                                                                                                                                 | Venta bruta                                   |
| `application_user_full_name`, `application_user_id` | —                                                                     | **Dato personal del cliente**                                                                                                                                                                               | No se guarda                                  |
| Motivo de cancelación                               | —                                                                     | No apareció en el listado ni en el detalle; el portal tiene el catálogo de códigos (`ORDERS_CONFIG`)                                                                                                        | **Sin confirmar** dónde viene por pedido      |
| Tiempos por estado, tipo de entrega, propina        | —                                                                     | No aparecen en el listado ni en el detalle                                                                                                                                                                  | No disponibles por esta vía                   |

**Producto** (`order_product_details[]`)

| Campo                                          | Ejemplo                                     | Significado observado                                     |
| ---------------------------------------------- | ------------------------------------------- | --------------------------------------------------------- |
| `id`                                           | `MX2283xxxx`                                | ID del producto en el menú de Rappi                       |
| `product_name`                                 | «Crea tu The Coffee », «Pumpkin Iced Latte» | Nombre en el menú de Rappi (a veces con espacio final)    |
| `units`                                        | `1`                                         | Cantidad                                                  |
| `base_price`, `total_price`                    | `221`                                       | Precio del renglón con opciones                           |
| `total_price_with_partner_discount`            | `221`                                       | Precio después del descuento del aliado sobre el producto |
| `discount_percentage_by_rappi`, `mark_down{…}` | `0`                                         | Descuentos sobre el producto                              |
| `toppings[]`                                   | ver abajo                                   | Opciones elegidas                                         |

**Opción** (`toppings[]`): `description` («True White», «Entera», «Double Shot (36ml)», «Grande 355 ml», «Poco»),
`price` (10, 0, 12…), `units`, `topping_category_name` («Elige tu Bebida», «Leche.», «Café», «Elige el Tamaño», «Miel»).
En combos como «Crea tu The Coffee», la bebida y el pan elegidos llegan **como opciones** del combo.

**Descuentos** (solo en el detalle, `discount_info`)

| Campo                       | Ejemplo                                                                                                                     | Observado                                                                                                          |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| `total_discount_by_partner` | `39.8`                                                                                                                      | Descuento que absorbe el aliado. Pantalla: Subtotal $221.00 → «Total después de descuentos» $181.20                |
| `discounts[]`               | `offer_by_product` 20 % (39.8, **listado dos veces**), `prime_discount_shipping` 105, `service_fee` 2, `charge.fast_lane` 0 | Mezcla descuentos al producto con beneficios de envío y cargos de Rappi Pro. **Sin confirmar** quién paga cada uno |
| `discount_total`            | `186.6`                                                                                                                     | Suma de todos los renglones de `discounts[]` (incluye el envío)                                                    |

**Lo que el portal no nombra:** comisión, neto o liquidación por pedido no aparecen en el historial ni en el detalle. La
pantalla Financiero muestra «valor a transferir» por pago (por periodo y tienda), no por pedido.

### Datos personales

Existen y **no se guardan**: nombre e ID del cliente (`application_user_full_name`, `application_user_id`) y los datos
de facturación (pestaña aparte, que el portal conserva 30 días). En el historial y el detalle no aparecieron teléfono,
dirección ni datos del repartidor.

## 5. Cotejo con el POS

**Namóra, 27-oct** (portal de Rappi frente a la API del POS, `company_id 513`):

| Fuente                           | Pedidos                                                                                                          |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Portal de Rappi (`MX1930270777`) | 13 según `total_rows`; 11 devueltos (10 `pending_review` y 1 `finished`, todos «Terminada»), todos con productos |
| API del POS (513)                | 51: 45 de mostrador (tarjeta y efectivo) y 6 de la App. **Ninguno con forma de pago `RAPPI`**                    |

- **Doble conteo: no se encontró.** Ningún pedido del POS coincide en productos, opciones y hora con uno de Rappi (por
  ejemplo, los Pumpkin Iced Latte Grande de las 07:43, 09:02 y 10:14 no aparecen en el POS). Rappi de Namóra
  hoy no está en el portal de The Coffee, ni como Rappi ni capturado a mano.
- **Nombres distintos a los del POS:**

  | Rappi                                                   | POS                                     |
  | ------------------------------------------------------- | --------------------------------------- |
  | Iced latte                                              | Iced Latte                              |
  | Deslactosada / Entera                                   | Lactose free / Milk                     |
  | Mediano 440 ml / Grande 590 ml.                         | Regular - 440ml / Large - 600ml         |
  | Grande 355 ml (calientes)                               | Large - 355ml                           |
  | Poco / Promedio / Sin (miel)                            | Less / Average / Without Honey          |
  | Double Shot (36ml) / Single Shot (18ml)                 | Double shot (36ml) / Single Shot (18ml) |
  | Crea tu The Coffee, Iced latte + sandwich jamón y queso | (combos que no existen en el POS)       |

- Productos de Namóra en Rappi (21–28 oct, unidades): Iced latte 27, Pumpkin Iced Latte 27, Crea tu The Coffee 10,
  Matcha Iced Latte 6, Coffee Frappé 5, Americano 5, Pumpkin Latte 4, Iced latte + sandwich 4, Kouign Amann Hazelnut 4,
  True White 4 y otros 22 con 1–3.

**Rubén Darío, 27-oct** (`company_id 532`, integrado con Rappi en el POS):

- El POS tiene **16** pedidos con forma de pago `RAPPI`, cada uno con `refundId` de 10 dígitos.
- La tienda «The Coffee Rubén Darío» (`MX1930260682`) del portal muestra **3** (`total_rows`), de los que devuelve 2.
- Uno coincide: el pedido `2483819210` está en el portal (creado 10:45, Vainilla Latte, $111) y en el POS (10:50,
  Vanilla Latte, $111, `refundId` = mismo número). **El ID de Rappi = `refundId` del POS** queda confirmado.
- **Sin confirmar:** dónde están los otros ~14 pedidos de Rappi de 532 (otra tienda o cuenta de Rappi, la integración
  del proveedor del POS u otra marca). Pregunta para Carlo.

## 6. El flujo de Dodo MX (n8n, solo lectura)

Revisado por la API REST de n8n con la llave de `dodo-money/scripts/n8n/.env` (no hay conector MCP de n8n en esta
máquina; el flujo tiene `availableInMCP: true`). Instancia `n8n.thecoffeemexico.com`, flujo `Rappi_Ventas_Diarias`
(activo, una tienda de Dodo). Solo GET: nada se modificó ni se ejecutó.

| Aspecto                                         | Patrón de Dodo                                                                                                                                                                                                                |
| ----------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Disparo                                         | Cada 15 min de 10:00 a 23:45 («hoy en vivo», con caché de detalles) y a las 6:30 el día anterior completo con **repaso de 7 días**                                                                                            |
| Lectura                                         | El nodo «Leer Rappi» llama a un contenedor propio (`rappi-extractor:3100/sincronizar`) que abre el portal clásico con Playwright sin pantalla y lee el JSON que el portal pide                                                |
| Sesión                                          | `storageState` (cookies + `localStorage`) exportado desde una PC; el extractor lo reescribe tras cada corrida. Desde el 27-oct hace **«login automático»** cuando caduca (credenciales guardadas en el servidor)              |
| Sin duplicados                                  | La app de Dodo hace upsert por ID de Rappi («21 actualizadas»)                                                                                                                                                                |
| Cambios tardíos                                 | El repaso de 7 días del 28-oct encontró **4 pedidos que pasaron de «Finalizado» a «Con reclamo» 2, 3, 3 y 4 días después**                                                                                                    |
| Avisos                                          | Correo por SMTP al aparecer `error` o `sesion_expirada`, y cada 6 h si sigue                                                                                                                                                  |
| Historia (450 ejecuciones, 21 al 29 de octubre) | 317 `ok`, 122 `sin_ordenes`, 8 `sesion_expirada` (4 del intento con refresh token, que Rappi rechazó con HTTP 500; 4 seguidas el 22-oct hasta que se resubió la sesión), 2 `ocupado`, 1 `error` (tiempo de espera del portal) |

## 7. Alternativa oficial y términos

- **API de integración de Rappi** ([dev-portal.rappi.com](https://dev-portal.dev.rappi.com/en/api-reference/)):
  órdenes, webhooks de eventos, menús y tiendas, con `client_id`/`client_secret`. El alta se pide al contacto de Rappi
  y se aprueba primero en un entorno de desarrollo. Es lo que usan los proveedores de POS integrados. **Rubén Darío
  ya recibe Rappi por la integración del POS**, así que la vía oficial para Namóra podría ser pedirle al proveedor del
  POS la misma integración (está en el documento de solicitudes del 28-oct).
- **Términos:** en los términos públicos de Rappi encontrados no hay una cláusula específica sobre accesos
  automatizados al portal de aliados. **Sin confirmar**: Carlo debería revisar el contrato o convenio de aliado, o
  preguntar al contacto de Rappi, antes de automatizar el portal.

## 8. Verificación de esta auditoría

- **Pantallas visitadas:** login (sin escribir nada), Visión general, Órdenes (historial y un detalle de Namóra con sus
  dos pestañas), filtro de sucursales, Financiero (solo abrir). No se abrió el Gestor de órdenes ni ningún botón de acción.
- **Peticiones propias:** solo lecturas (historial, tiendas). Ninguna descarga.
- **n8n:** solo `GET /api/v1/workflows` y `/executions`. Sin cambios, activaciones ni ejecuciones.
- **Datos personales y credenciales:** este documento no tiene nombres de clientes, tokens, cookies ni contraseñas.

## Pendientes para Carlo

1. ¿El inicio de sesión pidió código por SMS/correo o captcha?
2. ¿Dónde están los pedidos de Rappi de Rubén Darío que no aparecen en `MX1930260682`?
3. ¿Autorizas descargar un CSV del historial de Namóra (21–28 oct) para ver si trae los 5 pedidos que faltan en el
   listado? Se guardaría fuera del repo.
4. ¿Conviene pedir a Rappi o al proveedor del POS la integración oficial para Namóra en lugar de leer el portal?
