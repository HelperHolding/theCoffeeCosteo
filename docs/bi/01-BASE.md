# BI 01 · Base de datos y reglas de Zoho (F0–F1)

Fecha: 2026-11-05. Primera entrega del BI que reemplaza el «Dashboard The Coffee México» de Zoho Analytics (diseño en
`docs/superpowers/specs/2026-11-05-bi-the-coffee-mexico-design.md`). Esta entrega **no tiene pantalla ni carga de
ventas todavía**: deja las tablas, la lectura con los 17 filtros y las reglas de Zoho ya sembradas.

## Qué hay en F0 y de dónde salió

F0 es la evidencia de Zoho, en `docs/bi/zoho/` (extraída el 2026-11-05, solo con consultas de vista previa sin
guardar; no se cambió nada en Zoho):

| Archivo | Contenido |
|---|---|
| `tiendas-zoho.psv` | 82 tiendas con su nombre, franquiciatario, tipo y primera venta en Zoho |
| `productos-zoho.psv` | 335 combinaciones de código y nombre con su clasificación |
| `filtros.json` | Opciones de los 17 filtros, reglas de antigüedad, semana y reportes que ignoran la fecha |
| `pagos.json` | Mapeo de pagos del POS a las etiquetas de Zoho, con los pedidos de evidencia |
| `api-campos.md` | Campos crudos de la API del POS que sirven al BI |
| `reglas-columnas.md` | Qué hace cada columna de fórmula que usan los filtros |

**Valores, no fórmulas.** Las fórmulas CASE de Zoho van por nombre de producto (58 ramas, 276 literales) y por Store
ID (81 ramas). En vez de reimplementarlas se extrajo **el valor que Zoho ya calculó** para cada producto y tienda
vendidos (`tiendas-zoho.psv`, `productos-zoho.psv`). Es la misma regla sin riesgo de transcribirla mal. Un producto
nuevo que no esté en esa lista aparece como «Sin clasificar» hasta que alguien lo clasifique.

Las semillas salen de esos archivos con `scripts/bi/semillas.ts`, que **genera** la migración 41. No se edita a mano:
se corrige la evidencia o el script y se vuelve a generar.

## Tablas y funciones

**Migraciones.** La **40** (base) y la **41** (semillas). El 39 lo tomó otro frente (`rappi_tiendas_lote2`).

Tablas (migración 40). Todas cerradas al portal: RLS activo y sin permisos para `anon` ni `authenticated`.

| Tabla | Qué guarda |
|---|---|
| `bi_lineas` | Un renglón por línea de producto: fuente (`pos` o `zoho_rappi`), tienda, fecha, pedido, hora, canal, pago, código, nombre, unidades, importe y descuento. Nunca datos de clientes |
| `bi_cargas` | Un renglón por fuente, tienda y día cargados, con `completa`, `rappi_en_pos` y `huella` (md5 de lo guardado). Sin renglón = sin datos, nunca cero |
| `bi_tiendas` | Tienda, franquiciatario, tipo (Sucursales Propias o Franquicia) y `fecha_apertura` |
| `bi_clasificacion_producto` | Código normalizado (ver `bi_codigo`) con `vigente_desde`: categoría Master, grupo, contiene café y promoción |
| `bi_mapeo_pago` | Método, tipo y smartphone del POS a la etiqueta de Zoho |
| `bi_metas`, `bi_punto_equilibrio` | Para F5; todavía vacías |

Funciones:

| Función | Quién la usa | Qué hace |
|---|---|---|
| `bi_guardar_dia` | `service_role` | Reemplaza un día de una tienda y fuente en una sola transacción. Guarda `rappi_en_pos = (fuente = 'pos') y (p_rappi_portal o alguna línea de canal rappi)`. Normaliza el código con `bi_codigo`. Un `p_lineas` nulo o que no sea arreglo, o una tienda que no está en `bi_tiendas`, es error. Toma un candado de aviso por fuente, tienda y día. Con la misma huella no reescribe el día (solo renueva `leido_en`) |
| `bi_codigo` | la base | Normaliza el código de producto: mayúsculas, sin espacios al inicio ni al final y espacios internos (también U+00A0) colapsados a uno |
| `bi_semana`, `bi_anio_semana` | la base | Semana ISO y año de la etiqueta de Zoho. Puras, `sql immutable` y sin `search_path` para que se inlineen |
| `bi_meses_operando`, `bi_maduracion` | la base | Antigüedad de la tienda contra una fecha. Puras, igual que las anteriores |
| `bi_tiendas_filtradas` | la base (cerrada) | Las tiendas visibles que pasan los filtros que dependen solo de la tienda (franquiciatarios, tipos, comparable, años operando y maduración), resueltos una vez por consulta y sin duplicados |
| `bi_lineas_filtradas` | la base (cerrada) | Una sola definición de las líneas visibles con los 17 filtros, con su canal; la usan las dos RPC de lectura |
| `bi_tablero` | `authenticated` | Cargas, KPIs y cortes por grupo, café, Master, día, hora, pago, tienda, promoción, ranking por mes y fuente con canal (el Rappi del portal es `pos / rappi` y el de Zoho `zoho_rappi / rappi`) |
| `bi_tendencias` | `authenticated` | Ventas por año y mes y por semana desde 2024-01-01 |

**Acceso:** las dos RPC de lectura filtran las tiendas con `sucursales_acceso`, igual que el resto de Sucursales.
Una tienda a la que el usuario no tiene acceso no aparece, aunque la pida.

**Filtros** (`lib/bi/filtros.ts`): `FiltrosBi` y `aJsonRpc` pasan los nombres a la RPC y omiten vacíos.
`fechaRelativa` calcula las opciones de Fecha Relativa. Los reportes R9 y R10 de Zoho («Ventas por Año» y «por
Semana») ignoran Fecha Relativa, Rango de Fechas y Semanas; `bi_tendencias` hace lo mismo.

### Semillas (migración 41)

79 tiendas, 312 clasificaciones (307 códigos) y 8 pagos. Idempotente (`on conflict do nothing`).

- **Atributos de tienda medidos contra hoy**, como en «Tiendas Comparables» de Zoho:
  - Comparable: 12 meses completos o más.
  - Años Operando: `floor(meses / 12)`.
  - Maduración: «Menor de 3 meses» o «Mayor de 3 meses».

  Usan `bi_tiendas.fecha_apertura`, sembrada con la primera venta en Zoho (`origen_apertura = 'zoho'`), que empieza el
  2024-01-02.
- **Clasificación versionada por fecha.** Por ejemplo `SALFRAAPP` cambió de nombre y categoría el 1 de septiembre de
  2026.
- **Pagos.** Verificados con 146 pedidos de Polanco y Rubén Darío del 2026-11-03, cruzados por id contra Zoho:
  - `VIRTUAL_WALLET` y `CARTAO|WALLET` de la app: APP - CARD.
  - `WALLET_BALANCE`: APP - WALLET.
  - RAPPI TURBO viene de las tiendas Turbo de Rappi, no del POS.
  - CONTINGENCY - IFOOD y WALLET no aparecieron.
  - Una combinación sin mapeo se muestra con el método crudo del POS.

## Regla de Rappi sin doble conteo

El Rappi del portal ya se mezcla con el del POS en `conRappi`. Por eso:

- Se guarda como fuente `pos` con canal `rappi`.
- El Rappi de Zoho (fuente `zoho_rappi`) se **ignora** en cualquier día de una tienda cuya carga `pos` tenga
  `rappi_en_pos = true`.
- `bi_guardar_dia` guarda `rappi_en_pos = (p_fuente = 'pos') and (p_rappi_portal or hay una línea de canal rappi)`.
- **F2 pasa `p_rappi_portal = true` en cada guardado `pos`** de una tienda con `rappiPortal`, incluso en los días sin ventas
  de Rappi; si no, ese día se sumaría el Rappi de Zoho además del portal. Como la marca viaja en el propio guardado, un
  guardado posterior del mismo día no la borra.
- **Solo desde que existe el portal de la tienda.** `p_rappi_portal = rappiPortal y fecha >= primera fecha con pedidos en
  rappi_pedidos de esa tienda`. Los días anteriores mandan `false`: ahí el POS no trae Rappi y el Rappi de Zoho debe
  contar. Si la tienda aún no tiene pedidos, o falla la consulta de esa primera fecha, se manda `false` (el Rappi de Zoho
  cuenta y no se pierde nada) y el fallo se anota en `bi.fallidos` con fecha `*`.
- **Guardado idempotente.** `bi_cargas.huella` es el md5 de `p_lineas`, `p_completa` y `p_rappi_portal`. Si el día ya está
  guardado con la misma huella, `bi_guardar_dia` solo actualiza `leido_en` y devuelve las `lineas` existentes, sin borrar
  ni insertar (y `rappi_en_pos` no cambia). Con otra huella reemplaza el día como siempre.

## Semana de Zoho

- Es la **semana ISO**, de lunes a domingo. `weekofyear(Date,2)` de Zoho coincide en las 22 muestras de
  `filtros.json`.
- «Semanas y año» usa la etiqueta de Zoho `W45 2026`, sin ceros, con el **año calendario** de la fecha. El 29 al 31 de
  diciembre puede salir como «W1» de ese mismo año (el 2025-12-31 es «W1 2025»). Es una rareza de Zoho que se deja igual
  por paridad.

### Fecha Relativa (a confirmar en el piloto)

Las demás opciones son directas. Estas tres son criterio nuestro, a confirmar contra Zoho en el piloto:

- **Últimas 4 semanas:** las 4 semanas ISO completas antes de la actual.
- **N semanas anteriores:** solo la semana ISO que quedó N semanas atrás.
- **Últimos 3 meses:** los 3 meses calendario completos antes del actual.

## Contrato de carga (F2)

Lo que F2 debe cumplir al llamar a `bi_guardar_dia`:

- **Tienda:** debe existir en `bi_tiendas` (alta con `store_id`, nombre, tipo, franquiciatario y `fecha_apertura`)
  antes de guardar; si no, la base lanza una excepción.
- **Pedido:** `pedido = String(PedidoNormal.id)`. El POS usa 8 dígitos y el portal de Rappi usa el número de Rappi de
  10 dígitos; no chocan.
- **Línea:** `linea` es el índice 1-based de la línea dentro de `PedidoNormal.lineas`, estable entre relecturas.
- **Código:** `codigo = defaultCode || productName`; la base lo normaliza con `bi_codigo`.
- **Importe:** `importe_cent = importeLinea(l)` (línea más modificadores, IVA incluido).
- **Descuento:** `descuento_cent` es un monto en centavos derivado. El `discount` de la línea en el POS es un
  porcentaje y el `amount` ya viene descontado. Si no se puede derivar bien, se manda 0 y se documenta.
- **Unidades:** cada línea del POS es una unidad.
  - El portal de Rappi parte una cantidad n en n líneas.
  - Las filas de Rappi de Zoho pueden traer cantidad mayor a 1; F3 debe partirlas en n líneas para que el UPT
    (líneas ÷ tickets) sea comparable.
  - Si el POS manda unidades negativas (devoluciones), hay que confirmarlo en F2 antes de cargar, porque el check
    `unidades >= 0` haría fallar el día.
- **Rappi Turbo:** el portal llega como `RAPPI / RAPPI_PORTAL` (`lib/sucursales/rappi-pos.ts`) sin marca de Turbo. F2
  debe marcar Turbo (por ejemplo `tipo_pago = 'RAPPI_TURBO'`) según la tienda de Rappi y agregar las filas de mapeo
  `('RAPPI','RAPPI_PORTAL',false) → 'RAPPI'` y `('RAPPI','RAPPI_TURBO',false) → 'RAPPI TURBO'`. Por ahora solo se
  documenta; no se cambia código de Sucursales.
- **Concurrencia:** el cierre de las 5:30 y el corte de cada 10 minutos pueden chocar en el mismo día.
  `bi_guardar_dia` toma `pg_advisory_xact_lock(hashtext(p_fuente || ':' || p_company || ':' || p_fecha))` al inicio, así
  que dos guardados del mismo día, tienda y fuente se serializan en vez de fallar.
- **`p_rappi_portal`:** se pasa en cada guardado `pos` de una tienda con `rappiPortal`.

## Lo que dejó la clasificación y las semillas

**Código de producto (un solo criterio).** El código de clasificación siempre está **normalizado**: mayúsculas, sin
espacios al inicio ni al final y con los espacios internos colapsados a uno (también el no separable U+00A0).

- La base lo garantiza: `bi_guardar_dia` guarda `codigo = bi_codigo(...)` (el `nombre` se queda como vino) y
  `bi_clasificacion_producto` tiene `check (codigo = bi_codigo(codigo))`.
- El generador de la migración 41 aplica la misma normalización al `default_code` o al nombre. Las variantes que solo
  difieren en mayúsculas o espacios («crea tu the coffee», «crea tu the  coffee», «Crea Tu The Coffee») se pliegan en un
  código: las de clasificación idéntica se unen; las que difieren se versionan por fecha y, si empatan, se reportan en
  `conflictos`.

**Productos sin código (139 de 335 combinaciones).** Vienen sin «Default Code» en Zoho, sobre todo de la App desde
2025. El POS usa el nombre como código (`normalizar.ts`), así que se clasifican por el nombre normalizado. Si la App
cambia un nombre, esa línea queda «Sin clasificar».

**Tiendas sin configuración (3).** Zoho tiene tiendas que el POS no configura, así que no se siembran (una tienda sin
fila en `bi_tiendas` hace fallar `bi_guardar_dia`):

| Store ID | Tienda | Pedidos en Zoho |
|---|---|---|
| 348 | Hernández Macías | 7,031 |
| 377 | Correo 37 | 2,158 |
| 680 | Unknown | 1 |

Son 3 tiendas sin configurar y «Unknown» (680) tiene 1 pedido: **el historial del BI quedará unas 9 mil órdenes por
debajo de Zoho** (Hernández Macías y Correo 37). Hay que tenerlo presente en la comparación del piloto.

**Eat Here / To Go.** La API del POS **no lo da**. `opcion_consumo` queda nulo en las líneas del POS y el «Ajuste
desechable Eat Here» de Zoho no se puede replicar. Es una pregunta abierta para el proveedor.

## Límites conocidos

- Una llave `null` en el JSON de filtros da error. Es a propósito (falla cerrado); `aJsonRpc` ya quita los nulos.
- `cargas` cuenta solo las tiendas que pasan los filtros de tienda, sin repetidas, y por tienda solo de su apertura a hoy.
- La clasificación se busca por línea y `bi_tendencias` lee todas las líneas desde 2024. El rendimiento se mide en el
  piloto, con meta de 3 s o menos; si no llega, se agrega un agregado diario.
- `por_cafe` muestra «Sin dato» y ese valor no se puede filtrar.
- Dos guardados del mismo día de una tienda al mismo tiempo se serializan con un candado de aviso (ver «Contrato de carga (F2)»).

## Qué sigue

1. **F2 · Carga y piloto:**
   - leer las líneas del corte;
   - script de historial;
   - piloto con 6 tiendas, comparado contra Zoho;
   - pasar `p_rappi_portal` en cada guardado `pos` de las tiendas con portal.
2. **F3 · Rappi de Zoho:** importar su historial (`zoho_rappi`).
3. **F4 · Tablero:** la pantalla con los 17 filtros.
4. **F5 · Metas y punto de equilibrio:** captura en `bi_metas` y `bi_punto_equilibrio`.

## Pruebas

- `tests/db/bi-base.test.ts`: tablas, permisos, `bi_guardar_dia`, tienda sin alta, `bi_codigo`, semana, maduración y marca de Rappi (`p_rappi_portal`).
- `tests/db/bi-lectura.test.ts`: los 17 filtros, acceso por sucursal y Rappi sin doble conteo.
- `tests/db/bi-semillas.test.ts` y `tests/portal/bi-semillas.test.ts`: la migración 41 y el generador (incluye la prueba de que la migración coincide con lo que genera el script desde `docs/bi/zoho/`).
- `tests/portal/bi-filtros.test.ts`: Fecha Relativa y `aJsonRpc`.
