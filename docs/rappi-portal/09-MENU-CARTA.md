# 09 · Menú/Carta de Rappi: productos y toppings encendidos y apagados

Fecha: 2026-11-23. Pedido de Carlos: «revisar los items apagados y encendidos de cada sucursal… como apartado en Nivel
de servicio para cada sucursal y el general para el Tablero México… que se actualice con cada ejecución del scrap…
indicadores con las skills, top de sucursales con items más apagados, por revisar, alertas».

## 1. Resultado esperado

- **Uso:** el equipo de Operaciones ve qué productos y toppings tiene apagados cada sucursal en Rappi, desde cuándo y
  qué hay que revisar, para avisarles a las sucursales.
- **Sección de cada sucursal:** un bloque «Menú en Rappi» dentro de Nivel de servicio.
- **Tablero de México:** el mismo bloque, nacional, en la vista Nivel de servicio.
- **Actualización:** la lectura del portal corre cada 30 min y la pantalla se relee cada 5 min. Muestra
  «última lectura hace X min», nunca un dato viejo como si fuera de ahora.

## 2. Contrato y reparto

| Quién | Hace | Autorizado ahora |
|---|---|---|
| «n8n thecoffee» | Lector del portal (SOLO LECTURA, sin botones de escritura), tablas, importador, flujo n8n cada 30 min (:17 y :47) | Auditoría hecha; migración y prod solo con OK de Carlos |
| «Módulo Sucursales» (este chat) | RPC de lectura, armado puro, rutas, pantalla en sucursal y Tablero, pruebas y arnés | Sí, en local y en PR; migración, prod y merge con OK de Carlos |

- **Fuera de alcance:** cambiar algo en el portal de Rappi; avisos automáticos a las sucursales (WhatsApp o correo; se
  puede planear después); precios contra el Costeo.
- **Se conserva:** Nivel de servicio como está (#195): último día publicado, conectividad e indicadores.
- **Migraciones:** la última en main es la 92. Propuesta: 93 para las tablas e importador (n8n) y 94 para las RPC de
  lectura (este chat). Se confirma el número antes de aplicar.

## 3. Datos (auditoría de n8n, muestras de Essentia)

- **Endpoint:** `GET …/partners-selfservice/selfservice/menu/{storeId}`.
  - Llega un JSON por tienda: `corridors[]` (categorías), dentro `products[]`, dentro `topping_categories[]` y dentro
    `toppings[]`.
  - Se lee `published_data`, con `data` de respaldo.
- **Apagado:**
  - Producto: `available` o `active_state` en false.
  - Topping: `active_state` en false.
  - `active: false` es otra cosa (inactivo o eliminado).
- **Lo que NO trae:** desde cuándo está apagado, quién lo apagó ni si hay un apagado programado. La historia sale de
  nuestras lecturas: un producto que ya estaba apagado en la primera lectura dice «apagado desde antes del 23 nov»,
  nunca una hora inventada.
- **Por tienda:** Turbo tiene su propio menú. Los ids cambian entre tiendas, así que «apagado en N sucursales» va por
  nombre normalizado.
  - `product_id` es el mismo id de los pedidos (`rappi_pedido_productos.rappi_producto_id` = «MX» + id).
- **Essentia** (muestras del 2026-11-23):

  | Tienda | Productos | Apagados | Toppings únicos | Toppings apagados | Categorías |
  |---|---|---|---|---|---|
  | Normal | 80 | 14 | 75 | 4 | 18 |
  | Turbo | 78 | 13 | 91 | 3 | 18 |

  Hay 0 productos sin foto o sin descripción. En Turbo hay **1 producto «disponible» que no se puede pedir**: The
  Perfect Match tiene su grupo obligatorio «Elige tu Match» sin ninguna opción encendida.

### 3.1 Columnas que piden las RPC (propuesta para las tablas de n8n)

- **`rappi_menu_productos`** (vigente), llave `(rappi_tienda_id, producto_id)`:
  - `nombre`, `nombre_norm` (minúsculas, sin acentos, espacios simples);
  - `categoria_id`, `categoria`, `categoria_activa`;
  - `precio`, `precio_anterior`;
  - `disponible` (`available` y `active_state`), `activo` (`active`);
  - `tiene_foto`, `tiene_descripcion`, `sku`, `combo`, `indice`;
  - `sin_opcion_obligatoria text[]`: nombres de los grupos con mínimo ≥ 1 sin ninguna opción disponible. Lo calcula
    el importador;
  - `visto_en`, `eliminado_en`.
- **`rappi_menu_toppings`** (vigente), llave `(rappi_tienda_id, topping_id)`:
  - `nombre`, `nombre_norm`, `grupo_id`, `grupo`, `grupo_minimo`, `grupo_maximo`;
  - `precio`, `disponible`, `activo`;
  - `productos bigint[]` (de qué productos es opción);
  - `visto_en`, `eliminado_en`.
- **`rappi_menu_tramos`** (como `rappi_conectividad`): `rappi_tienda_id`, `tipo` (`producto` o `topping`),
  `item_id`, `disponible`, `desde`, `visto`, `hasta` (null mientras siga).
- **`rappi_menu_corridas`**: `id`, `inicio`, `fin`, `tiendas`, `leidas`, `fallidas`, `completa`,
  `detalle jsonb` (las tiendas que fallaron).

Las tablas quedan cerradas por RLS, sin políticas. La pantalla las lee solo por las RPC, con
`public.sucursales_acceso(company)`.

### 3.2 RPC de lectura (migración 94, este chat)

- **`sucursales_menu_rappi(p_company integer)`**, para la sección de una sucursal. Devuelve:
  - `tiendas` (id, nombre, canal);
  - `productos` y `toppings` vigentes de sus tiendas activas, sin los eliminados;
  - el `desde` del estado actual de cada uno, sacado de `rappi_menu_tramos`;
  - `primera_lectura` (la lectura más vieja de esas tiendas);
  - `corrida`: la última, con `fin`, `completa`, `leidas` y `fallidas`;
  - `cambios`: tramos de los últimos 7 días, para «se apagó / se prendió» y la línea del día.
- **`sucursales_menu_nacional(p_companias integer[])`**, para el Tablero (mismo patrón que
  `sucursales_servicio_nacional`). Devuelve:
  - por tienda: productos, apagados, toppings, toppings apagados, sin opción obligatoria, sin foto, sin descripción y
    el apagado más antiguo;
  - la lista de productos y toppings **apagados** (tienda, nombre, nombre normalizado, categoría y desde), que da el
    ranking, «apagado en N sucursales» y «por revisar»;
  - `sin_opcion`: los encendidos que no se pueden pedir (tienda, nombre, categoría, grupos);
  - `presencia`: en cuántas tiendas existe cada producto (por nombre normalizado), para la alerta de abasto;
  - `primera_lectura` y `corrida`.
- **SQL:** `supabase/migrations/20261120000094_sucursales_menu_rappi.sql`, sobre las tablas de la 93 (#210).
  - Probado con PGlite en `tests/db/menu-rappi-lectura.test.ts`: acceso por sucursal, «desde» de los tramos, sin opción,
    presencia y el armado de la pantalla.
  - En los tramos, `item_id` es bigint.
  - El `detalle` de las corridas es `{fallidas, ignoradas, viejas}`; la pantalla cuenta como no leídas las fallidas y
    las viejas.
- **Armado y pantalla, ya hechos en F2 sobre las muestras de Essentia:**
  - `lib/sucursales/menu-rappi.ts`, con `construirMenu` y `construirMenuNacional`;
  - las rutas `/api/sucursales/[id]/menu` y `/api/sucursales/menu-nacional`;
  - `components/sucursales/menu-rappi.tsx`: un apartado «Menú en Rappi» al lado de «Servicio», que viaja en la URL
    (`?apartado=menu`);
  - pruebas en `tests/portal/menu-rappi.test.ts`;
  - prueba visual `?sucursales&gdl=1&portal=1&seccion=servicio&apartado=menu` y
    `?tablero-mexico&vista=servicio&apartado=menu`.

## 4. Pantalla

Skills: `frontend-design`, `dataviz` y `movimiento-web`. Usa las mismas piezas que Nivel de servicio: placa, un solo
contenedor de indicadores, `Tarjeta`, tablas con `relative` en el scroll, color solo en las marcas y nunca solo color.

- **Estado de la lectura:**
  - «Menú leído hace 12 min · cada 30 min», con un punto vivo mientras esté al día;
  - «Lectura retrasada» si pasa de 45 min;
  - las tiendas que fallaron en la última corrida se nombran.
- **Indicadores** (un contenedor): productos apagados (X de Y, %), toppings apagados, no se pueden pedir (alerta),
  apagados hace más de 24 h y sin foto o sin descripción.
- **Por tienda:** Rappi y Turbo lado a lado.
- **Por revisar** (lista ordenada por gravedad y antigüedad):

  | Nivel | Caso |
  |---|---|
  | Grave | Disponible pero no se puede pedir (grupo obligatorio sin opciones) |
  | Alto | Apagado hace más de 24 h |
  | Medio | Apagado hoy |
  | Info | Sin foto o sin descripción; precio distinto entre Rappi y Turbo (mismo nombre) |

  Cada renglón lleva tienda, categoría, precio y «apagado hace 3 h / desde el lunes 8:07 / desde antes del 23 nov».
- **Toppings apagados:** agrupados por grupo («Leche», «Elige tu tamaño»…), con cuántos productos usan cada uno.
- **Tablero de México:**
  - indicadores nacionales;
  - **top 10 de sucursales con más apagados** (barra por % del menú, enlace a su sección);
  - **apagados en varias sucursales** (nombre, N sucursales, lista al abrir);
  - por revisar nacional;
  - sucursales sin tienda o sin lectura, aparte;
  - mapa por estado (% apagado) si cabe sin saturar: opcional, al final.
- **Movimiento:** solo la entrada única y el punto vivo. Sin animaciones decorativas. Con movimiento reducido, nada.

**Supuestos** (se ajustan sin rehacer nada):

| Supuesto | Valor propuesto |
|---|---|
| Umbral de «por revisar» | 24 h |
| Alerta de abasto | Apagado en ≥ 30 % de las sucursales con ese producto |
| Lectura retrasada | Más de 45 min |

## 5. Fases

| Fase | Depende de | Hace | Entrega | Sale cuando | Autorizada |
|---|---|---|---|---|---|
| F0 | — | Plan y contrato de columnas | Este doc; mensaje a n8n | n8n confirma columnas | Sí |
| F1 (n8n) | F0 | Tablas, importador, lector cada 30 min | Migración 93 y flujo | Una corrida completa en prod | Con OK de Carlos |
| F2 (este chat) | F0 | RPC (SQL), armado puro, rutas, pantalla, arnés con las muestras de Essentia, pruebas | PR | tsc, pruebas y arnés en escritorio y celular | Sí, en local y PR |
| F3 | F1 y F2 | Aplicar la migración 94 y cotejar contra el portal en solo lectura (Essentia y 2 más) | Cotejo en el PR | Cuadra con el portal | Con OK de Carlos |
| F4 | F3 | Merge | Producción | «mergea #N» | Con OK de Carlos |

## 6. Verificación

| Riesgo | Cómo se comprueba |
|---|---|
| Contar como apagado algo inactivo o eliminado | Prueba: `active=false` y `eliminado_en` no cuentan; cotejo contra «(N) Apagados» del portal |
| Inventar «desde» | Prueba: sin tramo previo dice «desde antes de la primera lectura» |
| Dato viejo como en vivo | Prueba: más de 45 min marca «retrasada»; corrida incompleta nombra las tiendas |
| Acceso | La RPC devuelve null sin `sucursales_acceso`; la nacional filtra compañías |
| «No se puede pedir» | Prueba con The Perfect Match (Turbo Essentia) |
| UI | Arnés con muestras reales; escritorio y 375 px; modo noche; sin desborde |
