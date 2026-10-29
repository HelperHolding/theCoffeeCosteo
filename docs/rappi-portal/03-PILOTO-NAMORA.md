# 03 · Piloto Namóra: pestaña Rappi con los pedidos del portal

Fecha: 2026-10-29. Carlo aprobó el diseño del doc 02 y pidió verlo en la pestaña Rappi de la sucursal. Decisiones:

- el lector corre en el servidor de n8n;
- entra con un usuario propio del lector en Rappi;
- la integración oficial queda fuera por ahora;
- el login no pide código ni captcha.

## Corrección al doc 01: la marca Turbo

La cuenta tiene **dos marcas**: «The Coffee» (`MX575472`, 73 tiendas) y **«The Coffee - Turbo»** (`MX622404`, 32
tiendas). Cada sucursal tiene su tienda normal y su tienda Turbo. Las marcas y sus tiendas salen de
`GET …/rests-partners-accounts/brand/family/email`.

| Sucursal          | Tienda normal  | Tienda Turbo   | Pedidos 27-oct (normal / Turbo) |
| ----------------- | -------------- | -------------- | ------------------------------- |
| Namóra (513)      | `MX1930270777` | `MX1930301156` | 13 / 16                         |
| Rubén Darío (532) | `MX1930260682` | `MX1930284884` | 3 / 15                          |

- **Rubén Darío resuelto:** los 13 pedidos `RAPPI` del POS que no estaban en la tienda normal están todos en
  «Rubén Darío Turbo». No hay otra cuenta.
- **Lo de «Generic» se resuelve con el portal.** Ejemplos de Rubén Darío del 27-oct, cruzados por `refundId` = ID de Rappi:

  | Pedido       | POS                       | Rappi                                                                                                                    |
  | ------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
  | `2483806710` | Generic + Americano, $268 | «Crea Tu The Coffee» $199 (croissant de jamón y queso, Iced Latte, entera, mayonesa de chipotle, 400 ml) + Americano $69 |
  | `2483819529` | Generic, $199             | «Crea Tu The Coffee» $212 (croissant, Iced Latte, deslactosada +$13, 400 ml)                                             |
  | `2483813714` | Generic, $199             | «Crea Tu The Coffee» $224 (croissant, Iced Latte, deslactosada +$13, Grande +$12)                                        |

- Otras tiendas Turbo de Guadalajara: Aleden `MX1930284932`, Granja `MX1930370853`, Ventura `MX1930370852`, Essentia
  `MX1930370851`, Chapu 67 `MX1930384086`, Gran Plaza `MX1930416799`, Legacy `MX1930366484`, Otawa `MX1930387241`,
  Forum `MX1930469273`. Bonampak: `MX1930404424`.
- **CSV:** «Descargar CSV» genera un archivo .xlsx en «Historial de descargas» por separado. El clic de prueba no
  generó uno nuevo, así que sigue pendiente saber si trae los pedidos que el listado se salta.
- Con toda la marca y `page_size` 100, el historial da **HTTP 500**; por tienda funciona. El lector consulta por tienda
  y por día.

## Qué se construyó

| Pieza                                                                                                                                                                                                 | Archivo                                                |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| **Migración 28:** tablas `rappi_*` cerradas al público; `rappi_importar(jsonb)` solo para `service_role`; `sucursales_rappi_portal(company, desde, hasta)` con `sucursales_acceso`; tiendas de Namóra | `supabase/migrations/20261029000028_rappi_portal.sql`  |
| Ruta de lectura (hasta 62 días)                                                                                                                                                                       | `app/api/sucursales/[companyId]/rappi-portal/route.ts` |
| Resumen para la vista                                                                                                                                                                                 | `lib/sucursales/rappi-portal.ts`                       |
| Pestaña Rappi → «Portal de Rappi»                                                                                                                                                                     | `components/sucursales/rappi-portal.tsx` y `rappi.tsx` |
| `rappiPortal: true` en Namóra                                                                                                                                                                         | `lib/sucursales/config.ts`                             |
| Lector, Dockerfile, compose y flujo de n8n                                                                                                                                                            | `servicios/rappi-portal/` (ver su README)              |

**Cambios respecto del doc 02:**

- **Opciones de cada producto:** van como JSON dentro de `rappi_pedido_productos`, no en una tabla aparte. Se
  reemplazan junto con el producto.
- **Escritura:** n8n llama `rappi_importar` por PostgREST con la llave secreta de Supabase (encabezado `apikey`). La
  función hace el upsert, la huella, la bitácora de cambios, los conteos por día y las marcas «para revisar». No hace
  falta ninguna llave nueva en Vercel.
- **Detalle de cada pedido:** solo se lee para traer descuentos, y se guarda en caché por huella. Son 80 detalles
  nuevos como máximo por corrida.
- **Rappi del portal no se sumaba a las ventas del POS:** se veía aparte, en la pestaña Rappi. Desde el doc 04 se suma
  a Ventas, Costeo y Consumo de Namóra.
- **En Namóra la pestaña Rappi muestra:**
  - el periodo y el filtro Normal / Turbo;
  - pedidos terminados, venta con precio Rappi antes de descuentos, cancelados y reclamos;
  - productos con sus opciones agrupadas por categoría del menú de Rappi;
  - pedidos con su desglose, cambios de estado y los que ya no aparecen;
  - aviso de los pedidos que el listado contó y no devolvió.

## Verificación

- `tsc` sin errores.
- `vitest`:
  - `tests/db/rappi-portal.test.ts` (10): permisos, reprocesar sin cambios, cambio de estado con bitácora, reemplazo de
    productos, descuento conservado, desaparecidos, corrida fallida, tienda no registrada, lectura por sucursal y tope
    de 62 días;
  - `tests/db/rappi-lote.test.ts` (3): el JSON del portal pasa por el lector y entra a `rappi_importar`;
  - `tests/portal/rappi-portal.test.ts` (5): totales por tienda, opciones, faltantes, estados y pestaña Rappi en Namóra.
- **Prueba visual** (`?sucursales&gdl=1&portal=1&tab=rappi`, datos sintéticos): escritorio y 375 px sin desborde de
  página. Las opciones se colorean por categoría con los colores de `TIPOS`. Normal y Turbo (aqua y violeta) pasan
  `validate_palette.js` y siempre llevan su nombre.
- **Sin probar todavía con el portal real:** el login automático y la lectura dentro del contenedor. Se prueban en el
  paso 3 del README, en el servidor.

## Ensayo de la migración 28 en producción (2026-10-29, con ROLLBACK)

Archivo exacto del commit, en una transacción revertida. No hace falta respaldo: la migración solo crea objetos y no modifica ninguno.

| Comprobación                               | Resultado                                                                                                                       |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| Antes                                      | 0 tablas `rappi_*`, 0 funciones, 27 migraciones (última `20261028000027`)                                                       |
| Dentro                                     | 6 tablas, 3 funciones; tiendas de Namóra `MX1930270777` (normal) y `MX1930301156` (Turbo)                                       |
| `rappi_importar` como `service_role`       | Un pedido sintético: `nuevos 1`                                                                                                 |
| Lectura como Carlos y como Dione (con 513) | 2 tiendas, 1 pedido, 1 conteo                                                                                                   |
| Lectura como Areli (sin 513)               | `null`                                                                                                                          |
| Privilegios                                | anon: nada. authenticated: sin tablas ni `rappi_importar`; sí `sucursales_rappi_portal`. service_role: tablas y ambas funciones |
| Conexión nueva después                     | 0 tablas, 0 funciones, 27 migraciones: no persistió nada                                                                        |

## Pendiente (cada uno con OK de Carlo)

1. Crear el usuario del lector en Rappi y ponerlo en el `.env` del servidor.
2. Instalar el contenedor en el servidor de n8n por SSH.
3. Respaldo y ensayo de la migración 28; merge.
4. Crear el flujo inactivo, elegir credenciales, una corrida manual, revisar la pestaña y activar.
5. Después: Rubén Darío (sus dos tiendas) para ver el desglose de lo que el POS registra como «Generic».
