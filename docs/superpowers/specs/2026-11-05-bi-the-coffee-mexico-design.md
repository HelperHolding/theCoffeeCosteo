# BI del portal: «The Coffee México» (reemplazo de Zoho Analytics)

Fecha: 2026-11-05. Pedido de Sebastián: un espacio BI en el portal con los tableros de Zoho Analytics, revisados uno por
uno, con los mismos filtros. Este documento cubre el primero, «Dashboard The Coffee México» (grupo «Ventas de la red»),
y la base de datos que servirá a los siguientes (Ranking Nacional, Scorecards, Detailed Revenue, Análisis de Datos…).

**Antecedente:** auditoría de Carlos del 2026-10-27 en la rama `origin/wip/analytics-respaldo-2026-10-28`,
`docs/analytics-zoho/01…06`. Es la fuente del inventario de componentes, de las fuentes de Zoho y de las mediciones de
historia y volumen. Desde entonces el portal ya tiene el corte de cada 10 minutos (doc 16), Rappi del portal en
22 sucursales y las 79 sucursales configuradas. El módulo Analytics de esa rama (migración 23) no se retoma: el BI usa
una sola base nueva (§3).

## 1. Decisiones

| Tema | Decisión | Por qué |
|---|---|---|
| Primer tablero | «Dashboard The Coffee México» | El más usado; casi todos sus datos ya salen del POS |
| Filtros | Los mismos 17 de Zoho, con sus nombres y valores | Pedido explícito |
| Metas y P.E. | **Se capturan en el portal** (pantalla + importación de Excel) | Hoy son tablas manuales en Zoho, incompletas (metas hasta oct-2026; P.E. solo oct–dic 2025) |
| Historia | **Desde 2024-01-01** | Igual que Zoho («Ventas por Año» y «por Semana»); la API del POS tiene historia desde 2023-11-27 y cuadra con Zoho (±2 pedidos, auditoría 06 §2.1) |
| Rappi | **Portal donde está conectado; Zoho para el resto**, como fuente aparte y marcada | Totales parecidos a Zoho sin contar doble |
| Granularidad | **Hechos por línea de producto** (sin datos de clientes) | Es la única forma de que todos los filtros se combinen en todos los reportes, como en Zoho |
| Margen del ranking | Costo de Costeo (no «Costo y Márgenes Marzo 2026») | La tabla fija de Zoho da −18,196 % en ago-2026 |
| Acceso | Por sucursal (`sucursales_acceso`); admins ven todo; OAuth/MCP sin acceso | Igual que el resto de Sucursales |
| Franquiciatarios | Después, con «Detailed Revenue» | Fuera de este documento |

## 2. Alcance del tablero

### 2.1 Filtros (17)

Visibles: **Fecha Relativa**, **Comparable**, **Años Operando**, **Rango de Fechas**, **Día de la Semana**.
En «Mostrar más filtros»: **Nombre de Tienda**, **Franquiciatario**, **Franquicia o Sucursales Propias**, **Categoría
Master Franchise MX**, **Comida, Bebida, Combo y Merch**, **Contiene Café**, **Product**, **Método de Pago**, **Hora**,
**Estatus de Maduración**, **Net Amount (Local)** (rango) y **Semanas y año**.

- **Combinación:** todos se combinan y afectan a todos los bloques.
- **URL:** viajan en la URL (un enlace abre la misma vista).
- **Valores por omisión:** los de Zoho; por ejemplo, Fecha Relativa = «Esta semana».
- **Fecha Relativa:** las opciones exactas se copian de Zoho en F0.
- **Semana:** sigue la semana de Zoho, `weekofyear(Date, 2)` (auditoría 06 §2.2), para «Semanas y año» y «Ventas por Semana».
- **Comparable:** tienda con 12 meses o más desde su apertura.
- **Años Operando:** años desde la apertura.
- **Estatus de Maduración:** sus tramos se copian de la regla de Zoho en F0.
- **Fecha de apertura:** `crm_tiendas.fecha_apertura`; si falta, el primer pedido del POS.
- **Net Amount (Local):** se aplica al importe de cada línea, como en Zoho.

### 2.2 Bloques (en el orden de Zoho)

1. **Números clave:**
   - Ventas Netas;
   - Ticket Promedio (venta ÷ tickets distintos);
   - # de Tickets;
   - Promedio UPT (líneas ÷ tickets);
   - Total Products (unidades).
2. **Contra P.E. y meta:**
   - Venta vs P.E. · P.E. vs Venta % · P.E. vs Venta (corriente);
   - Venta vs Meta · Cumplimiento Meta · Diferencia vs Meta (corriente).
   - Se activan en F5.
3. **Mezcla:** Ventas por Comida/Bebida/Combo/Merch (con «Otros») · Bebidas con café y sin café · Ventas por Categoría
   Master MX.
4. **KPI Venta The Coffee:** por Propias/Franquicia × tienda, venta, meta, tickets, meta de tickets, ticket promedio y
   meta de TP, cada uno con su %.
5. **Promociones:**
   - Share de Promociones Master Franchise, Resultados Promociones Tiendas MF y Cantidad Ventas de Promociones;
   - metas fijas: 6 % alimentos y bebidas, 1 % café.
6. **Tiempo y pago:** Ventas vs Transacciones por día · Método de Pago · Método de Pago por Tienda · Venta por Día de la
   Semana · Venta por Hora.
7. **Ranking de Productos:** share, unidades y margen con el costo de Costeo, por producto y mes.
8. **Tendencias:** Ventas por Año (mes × año desde 2024) · Ventas por Semana (semana × año).

**Reglas de cálculo:**
- Promedios, porcentajes y cumplimientos nunca se guardan; se calculan como cociente de sumas.
- **Tickets:** siempre salen de pedidos distintos, nunca de sumar tickets por producto.

### 2.3 Diferencias esperadas contra Zoho (se muestran en el BI)

- **Hora 0:** en Zoho está inflada (~1.5 % de filas con 00:00:00); en el BI la hora es la local del POS.
- **Pagos con wallet:** se documentan las diferencias medidas en el piloto.
- **Margen:** sale de Costeo, no de la tabla fija de marzo.
- **Rappi:** el filtro indica qué parte viene del portal y cuál de Zoho.

## 3. Datos

### 3.1 Hechos por línea

Tabla `bi_lineas`: una fila por línea de producto de un pedido.

| Grupo | Columnas |
|---|---|
| Origen | `fuente` (`pos`, `rappi_portal` o `zoho_rappi`), `company_id`, `pedido` |
| Tiempo | `fecha`, `hora` (local) |
| Pedido | `canal` (mostrador, app, rappi o desconocido), `metodo_pago` (código POS) y `opcion_consumo` (Eat Here / To Go…) |
| Producto | `codigo`, `nombre` (como vino) |
| Cantidades | `unidades`, `importe_cent` (línea + modificadores, como `importeLinea`) y `descuento_cent` |

- **Sin datos de clientes.**
- **Llave:** `(fuente, company_id, fecha, pedido, linea)`.
- **Reemplazo:** se reemplaza por (fuente, tienda, día) en una sola transacción, así que nunca se duplica.
- **Índices:** por (fecha, company_id) y los que pida la medición del piloto.
- **Volumen:** ~2.8 M filas desde 2024 (≈ 1.75 M pedidos × 1.6 líneas), del orden de 500 MB.
- **Rappi del portal:** `conRappi` se queda la versión del portal, así que una línea Rappi del POS no se cuenta dos veces.
- **Rappi de Zoho** solo se usa para (tienda, día) sin `rappi_portal`. La regla vive en las funciones de lectura y
  tiene prueba.
- **Opción de consumo:** `opcion_consumo` requiere verificar en F0 el campo de la API (hoy `PedidoNormal` no lo trae).
  Si la API no lo tiene, queda nulo y se documenta.

### 3.2 Catálogos

- **`bi_clasificacion_producto (codigo, vigente_desde)`:** categoría Master MX, grupo Comida/Bebida/Combo/Merch,
  contiene café y promoción (ninguna, alimentos y bebidas, o café).
  - Está versionada: se aplica la versión vigente en la fecha de la venta.
  - Se siembra con las reglas CASE de Zoho, que van por nombre y se traducen a código.
  - Lo que no clasifique ninguna regla queda en «Sin clasificar».
  - La edita un admin en el portal.
- **`bi_mapeo_pago (metodo_pos, tipo_pos) → etiqueta Zoho`:** se verifica pedido por pedido en el piloto.
- **Tiendas:** `Nombre de Tienda`, `Franquiciatario` y «Franquicia o Sucursales Propias» salen de
  `crm_tiendas` (`lookerStoreId` = número Jestor) y de `lib/sucursales/config.ts`. Las diferencias con las reglas CASE
  de Zoho se listan en F0 para corregir el CRM.

### 3.3 Metas y P.E.

- **`bi_metas (company_id, mes)`:** venta, tickets y ticket promedio.
- **`bi_punto_equilibrio (company_id, mes)`:** P.E. mensual.
- **Captura:** se capturan en una pantalla del BI (admin) o se importan de un Excel con la plantilla de Zoho
  («Metas Mensuales 2026 (Ventas Tickets TP)»).
- **Meta diaria:** la meta mensual repartida con factores por día de la semana de las 12 semanas cerradas anteriores.
  Como esos factores no incluyen el Rappi manual de Zoho, las cifras no van a cuadrar con Zoho, y se dice en pantalla.
- **P.E. diario:** P.E. mensual ÷ días del mes.

### 3.4 Lectura

- **Funciones:** funciones `security definer` en la base reciben los filtros y devuelven cada bloque ya agregado.
- **Acceso:** filtran por `sucursales_acceso` y se niegan con tokens OAuth.
- **Tablas:** cerradas a `anon` y `authenticated`; solo se escriben con la llave de servicio.
- **Meta de rendimiento:** ≤ 3 s con cualquier combinación de filtros. Si el piloto no la cumple, se agrega un resumen
  diario (tienda × día × canal × hora × pago × producto × opción de consumo) que conserva la combinación de filtros, y
  las funciones leen de ahí.

## 4. Actualización y errores

- **Corte:** el corte de cada 10 minutos (doc 16) escribe también las líneas del día. El cierre de las 5:30 relee
  8 días. Usa las mismas lecturas (`leerVentana` + `conRappi`).
- **Rappi de Zoho:** importación diaria de las filas RAPPI de «Looker Sucursales» por la API de Zoho Analytics. La
  credencial va en Vercel y la configura Sebastián. Además se carga la historia una vez.
- **Día que no se pudo leer:** conserva lo anterior y el BI avisa («sin datos»), nunca cero.
- **Frescura:** el BI muestra la hora del último corte y la de la última importación de Rappi de Zoho.

## 5. Fases

Cada fase lleva su propio plan, revisión y PR. Nada toca producción sin OK.

| Fase | Entrega | Requiere |
|---|---|---|
| **F0 · Reglas de Zoho** | Reglas CASE de tienda y producto, opciones de Fecha Relativa y tramos de Maduración, mapeo de pagos y verificación del campo de opción de consumo en la API. Queda como semilla revisable en el repo | Zoho en el navegador; anexo de la auditoría |
| **F1 · Base de datos** | Migración con `bi_lineas`, catálogos, metas, P.E. y funciones de lectura; pruebas PGlite | Ensayo con ROLLBACK + OK |
| **F2 · Carga** | El corte escribe líneas; script de historia por lotes; **piloto** (6 tiendas de la auditoría: 384, 532, 612, 583, 613 y 545; 2026-08-03→2026-10-25 y 2025-10-27→2025-11-09) cotejado con Zoho; luego, historia completa desde 2024-01-01 | Lotes corridos por Sebastián |
| **F3 · Rappi de Zoho** | Importación de la historia y diaria | Credencial de Zoho en Vercel |
| **F4 · Tablero** | Módulo BI con «The Coffee México», los 17 filtros y los bloques 1, 3, 6, 7 y 8, más el 4 y el 5 sin meta | — |
| **F5 · Metas y P.E.** | Captura, importación de Excel, reparto diario y bloques 2 y 4 completos | — |

## 6. Verificación

- **Piloto:** venta y tickets por tienda × día contra Zoho, con tolerancia de 0.5 % o 2 pedidos. Muestra por categoría,
  hora y método de pago.
- **Historia completa:** venta y tickets por tienda × mes desde 2024 contra Zoho, con la misma tolerancia. Cada
  diferencia que quede se documenta con su causa.
- **Pruebas:**
  - **Base:** acceso por sucursal; Rappi sin doble conteo; versión de clasificación; reemplazo por tienda y día; reparto de metas.
  - **Cálculos:** cada filtro y combinación, ticket promedio, UPT, comparable, años operando y semana como en Zoho.
  - **Visual:** escritorio, 375 px y modo noche.
- **Rendimiento:** se mide con el piloto y con la historia completa, sobre «Este año» con todas las tiendas.

## 7. Fuera de alcance

Los demás tableros de Zoho (se analizan después), el acceso de franquiciatarios, comercializadora, plantillas de Zoho
(Projects, CRM, Survey, Instagram, Odoo) y cualquier escritura en Zoho.
