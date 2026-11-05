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
| `bi_cargas` | Un renglón por fuente, tienda y día cargados, con `completa` y `rappi_en_pos`. Sin renglón = sin datos, nunca cero |
| `bi_tiendas` | Tienda, franquiciatario, tipo (Sucursales Propias o Franquicia) y `fecha_apertura` |
| `bi_clasificacion_producto` | Código con `vigente_desde`: categoría Master, grupo, contiene café y promoción |
| `bi_mapeo_pago` | Método, tipo y smartphone del POS a la etiqueta de Zoho |
| `bi_metas`, `bi_punto_equilibrio` | Para F5; todavía vacías |

Funciones:

| Función | Quién la usa | Qué hace |
|---|---|---|
| `bi_guardar_dia` | `service_role` | Reemplaza un día de una tienda y fuente en una sola transacción y marca `rappi_en_pos` si el POS trae Rappi. Un `p_lineas` nulo o que no sea arreglo es error |
| `bi_marcar_rappi_portal` | `service_role` | Marca que ese día el POS ya trae Rappi del portal |
| `bi_semana`, `bi_anio_semana` | la base | Semana ISO y año de la etiqueta de Zoho |
| `bi_meses_operando`, `bi_maduracion` | la base | Antigüedad de la tienda contra una fecha |
| `bi_lineas_filtradas` | la base (cerrada) | Una sola definición de las líneas visibles con los 17 filtros; la usan las dos RPC de lectura |
| `bi_tablero` | `authenticated` | Cargas, KPIs y cortes por grupo, café, Master, día, hora, pago, tienda, promoción, ranking por mes y fuente |
| `bi_tendencias` | `authenticated` | Ventas por año y mes y por semana desde 2024-01-01 |

**Acceso:** las dos RPC de lectura filtran las tiendas con `sucursales_acceso`, igual que el resto de Sucursales.
Una tienda a la que el usuario no tiene acceso no aparece, aunque la pida.

**Filtros** (`lib/bi/filtros.ts`): `FiltrosBi` y `aJsonRpc` pasan los nombres a la RPC y omiten vacíos.
`fechaRelativa` calcula las opciones de Fecha Relativa. Los reportes R9 y R10 de Zoho («Ventas por Año» y «por
Semana») ignoran Fecha Relativa, Rango de Fechas y Semanas; `bi_tendencias` hace lo mismo.

### Semillas (migración 41)

79 tiendas, 325 clasificaciones (320 códigos) y 8 pagos. Idempotente (`on conflict do nothing`).

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
- `bi_guardar_dia` marca `rappi_en_pos` solo si alguna línea trae canal `rappi`.
- **F2 debe llamar a `bi_marcar_rappi_portal`** para las tiendas con Rappi del portal en los días sin ventas de Rappi;
  si no, ese día se sumaría el Rappi de Zoho además del portal.

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

## Lo que dejó la clasificación y las semillas

**Productos sin código (139 de 335 combinaciones).** Vienen sin «Default Code» en Zoho, sobre todo de la App desde
2025. El POS usa el nombre como código (`normalizar.ts`), así que se clasifican por el nombre normalizado (mayúsculas,
recortado, espacios colapsados). Si la App cambia un nombre, esa línea queda «Sin clasificar».

**Tiendas sin configuración (3).** Zoho tiene tiendas que el POS no configura, así que no se siembran:

| Store ID | Tienda | Pedidos en Zoho |
|---|---|---|
| 348 | Hernández Macías | 7,031 |
| 377 | Correo 37 | 2,158 |
| 680 | Unknown | 1 |

Cierran la cuenta: **el historial del BI quedará unas 9 mil órdenes por debajo de Zoho** por las dos tiendas cerradas.
Hay que tenerlo presente en la comparación del piloto.

**Eat Here / To Go.** La API del POS **no lo da**. `opcion_consumo` queda nulo en las líneas del POS y el «Ajuste
desechable Eat Here» de Zoho no se puede replicar. Es una pregunta abierta para el proveedor.

## Límites conocidos

- Una llave `null` en el JSON de filtros da error. Es a propósito (falla cerrado); `aJsonRpc` ya quita los nulos.
- `cargas` ignora los filtros de tienda y las compañías repetidas.
- La clasificación se busca por línea y `bi_tendencias` lee todas las líneas desde 2024. El rendimiento se mide en el
  piloto, con meta de 3 s o menos; si no llega, se agrega un agregado diario.
- `por_cafe` muestra «Sin dato» y ese valor no se puede filtrar.
- Dos guardados del mismo día de una tienda al mismo tiempo pueden chocar: uno falla.

## Qué sigue

1. **F2 · Carga y piloto:**
   - leer las líneas del corte;
   - script de historial;
   - piloto con 6 tiendas, comparado contra Zoho;
   - marcar el Rappi del portal.
2. **F3 · Rappi de Zoho:** importar su historial (`zoho_rappi`).
3. **F4 · Tablero:** la pantalla con los 17 filtros.
4. **F5 · Metas y punto de equilibrio:** captura en `bi_metas` y `bi_punto_equilibrio`.

## Pruebas

- `tests/db/bi-base.test.ts`: tablas, permisos, `bi_guardar_dia`, semana, maduración y marca de Rappi.
- `tests/db/bi-lectura.test.ts`: los 17 filtros, acceso por sucursal y Rappi sin doble conteo.
- `tests/db/bi-semillas.test.ts` y `tests/portal/bi-semillas.test.ts`: la migración 41 y el generador.
- `tests/portal/bi-filtros.test.ts`: Fecha Relativa y `aJsonRpc`.
