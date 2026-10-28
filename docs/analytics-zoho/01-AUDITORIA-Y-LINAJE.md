# 01 · Auditoría de accesos, inventario y linaje

- **Ejecución:**
  - 2026-10-27, 17:00–17:45 UTC: primera pasada, sin acceso a Analytics.
  - 2026-10-27, 18:16–19:10 UTC: con acceso de solo lectura.
- **Alcance:** solo lectura. No se modificó Zoho (Analytics ni CRM), Supabase, Vercel, permisos ni producción. Se crearon *jobs* de exportación de Zoho, que son lecturas (doc 02 §4.1).
- **Estado:**
  - Linaje del dashboard **verificado** hasta la tabla base y su origen.
  - Fórmulas de columnas, fórmulas agregadas y SQL de las 12 query tables involucradas: **leídos**.
  - Definición interna de los 11 KPI: **no accesible por API**; se verificó reproduciendo sus valores al centavo (doc 02 §3).
- Relacionados: [02 Métricas y conciliación](02-METRICAS-Y-CONCILIACION.md) · [03 Arquitectura](03-ARQUITECTURA-Y-ACTUALIZACION.md) · [04 Plan](04-PLAN-DE-IMPLEMENTACION.md) · [anexo de columnas](anexo-columnas-looker-sucursales.csv).

## 1. Repositorio

| Comprobación | Resultado |
|---|---|
| Checkout | `HelperHolding/theCoffeeCosteo`, `main` en `7bc84c3` |
| Cambios ajenos | Informes sin rastrear en `docs/conciliacion-brasil/*-informes/`, `entregables/`, `.claude/` y `.vercel/`; **no se tocaron** |
| Archivos de esta entrega | `docs/analytics-zoho/` (4 documentos y un anexo CSV) y `scripts/analytics/auditar-zoho.ts` |

## 2. Accesos

### 2.1 Credenciales

| Vía | Producto | Scopes | Estado |
|---|---|---|---|
| MCP `zoho-crm` | Zoho CRM (Data Insights) | 3 herramientas de lectura | Sin uso en esta auditoría |
| Self Client, refresh token de CRM (`ZOHO_REFRESH_TOKEN`) | Zoho CRM v8 | 16 `ZohoCRM.*.READ` | **Intacto**: mismo valor y sigue renovando |
| **Self Client, refresh token de Analytics (`ZOHO_ANALYTICS_REFRESH_TOKEN`)** | Zoho Analytics API v2, US (`analyticsapi.zoho.com`) | `ZohoAnalytics.metadata.read` y `ZohoAnalytics.data.read` | Creado el 2026-10-27; el access token dura 3,600 s |

Organización y permisos observados:
- Hay 1 organización, con plan **Zoho One** y rol del usuario «Organization Admin».
- «The Coffee Oficial» aparece como workspace **compartido**, no propio.
- El workspace tiene 1,574 vistas: 332 tablas, 116 query tables, 526 gráficos, 468 pivotes, 125 dashboards, 5 resúmenes y 2 *pipeline tables*.

### 2.2 ¿El acceso compartido permite ver todas las dependencias?

**Sí, para todo lo que alimenta el dashboard.** Las únicas excepciones son las de la tabla:

| Recurso | Endpoint | Resultado |
|---|---|---|
| Detalle y linaje de vistas | `GET /restapi/v2/views/{id}?CONFIG={"withInvolvedMetaInfo":true}` | 200 en las 46 vistas consultadas |
| SQL de query tables | `GET /restapi/v2/workspaces/{ws}/querytables/{id}` | 200 en las 12 consultadas, con `sqlQuery` completo |
| Fórmulas de columna | Campo `formulaDisplayName` de cada columna en el detalle de la tabla | Expresión completa (la lista `customformulas` solo da nombres) |
| Fórmulas agregadas | `GET …/views/{id}/aggregateformulas` | 200, **con `expression`** |
| Última importación | `GET …/views/{id}/importdetails` | 200 |
| Orígenes de datos | `GET …/workspaces/{ws}/datasources` | 200 |
| Datos | `GET /restapi/v2/bulk/workspaces/{ws}/data?CONFIG={sqlQuery}` (*job* asíncrono) → `…/exportjobs/{job}` → `…/exportjobs/{job}/data` | 200 |
| Variables del workspace | `GET /restapi/v2/workspaces/2958916000000074002/variables` | **400 `INVALID_OAUTHSCOPE` (8540)** |
| Permisos propios sobre el dashboard | `GET …/views/2958916000007761303/share/mypermissions` | **400 `INVALID_OAUTHSCOPE` (8540)** |
| Definición de los widgets KPI | No existe endpoint. El detalle devuelve `viewType: WIDGET` sin nombre, columnas ni vista padre | **No accesible** |
| Filtros de usuario del dashboard y su alcance | No existe endpoint | **No accesible** |

Scopes para los dos 400, confirmados en la documentación oficial:
- **Variables:**
  - [get-variable](https://www.zoho.com/analytics/api/v2/modeling-api/get-variable.html) pide `ZohoAnalytics.modeling.read`.
  - Ese scope **no existe** en la [lista oficial de scopes](https://www.zoho.com/analytics/api/v2/prerequisites.html); el grupo *modeling* solo tiene `create`, `update`, `delete` y `all`.
  - La única forma de leer variables sería `ZohoAnalytics.modeling.all`, que **incluye escritura**. **No se recomienda pedirlo.**
  - Ninguna de las 12 consultas SQL leídas usa variables, así que no bloquea el linaje.
- **Permisos propios:**
  - [my-permissions](https://www.zoho.com/analytics/api/v2/sharing-and-collaboration-api/my-permissions.html) pide `ZohoAnalytics.share.read`, que **sí existe** en la lista oficial y es solo lectura.
  - Solo hace falta si se quiere documentar el permiso de la cuenta técnica. No bloquea el módulo.

### 2.3 Documentación oficial consultada (2026-10-27)

| Tema | Enlace |
|---|---|
| Scopes | [prerequisites](https://www.zoho.com/analytics/api/v2/prerequisites.html) |
| Servidores, cabeceras y `CONFIG` | [api-specification](https://www.zoho.com/analytics/api/v2/api-specification.html) |
| Vistas, detalle, dependientes y SQL | [get-views](https://www.zoho.com/analytics/api/v2/metadata-api/get-views.html) · [view-details](https://www.zoho.com/analytics/api/v2/metadata-api/view-details.html) · [dependents](https://www.zoho.com/analytics/api/v2/metadata-api/get-view-dependents.html) · [querytable-details](https://www.zoho.com/analytics/api/v2/metadata-api/get-querytable-details.html) |
| Fórmulas | [custom](https://www.zoho.com/analytics/api/v2/metadata-api/get-custom-formula.html) · [aggregate](https://www.zoho.com/analytics/api/v2/metadata-api/get-aggregate-formula.html) |
| Importación y orígenes | [import-details](https://www.zoho.com/analytics/api/v2/metadata-api/import-details.html) · [datasources](https://www.zoho.com/analytics/api/v2/metadata-api/datasources.html) |
| Exportación | [export-data](https://www.zoho.com/analytics/api/v2/bulk-api/export-data.html) · [async SQL](https://www.zoho.com/analytics/api/v2/bulk-api/export-data-async/create-export/sql-query.html) |
| Cuotas | [api-units](https://www.zoho.com/analytics/api/v2/api-limits-pricing/api-units.html) · [api-frequency](https://www.zoho.com/analytics/api/v2/api-limits-pricing/api-frequency.html) |
| Embed y MCP | [embed-url](https://www.zoho.com/analytics/api/v2/embed-api/embed-url.html) · [MCP tools](https://www.zoho.com/analytics/api/v2/zoho-analytics-mcp-server/tools.html) |

### 2.4 Presupuesto de solicitudes

| Destino | Llamadas | Notas |
|---|---|---|
| Zoho Analytics, primera pasada | 4 | 2 con 400 por scope y 2 de verificación |
| Zoho Analytics, metadatos | 118 (corrida del script) + 21 (lotes dirigidos) | ~74 se gastaron en tablas de Books, por la limitación de `involvedViews` (§3.2). Coste: < 15 unidades |
| Zoho Analytics, exportaciones SQL | 7 consultas (~35 llamadas, contando *jobs* y sondeo) | < 2,000 filas exportadas en total. Coste: < 10 unidades frente a un mínimo de 1,000 al día |
| API POS | 360 (pasada anterior, reutilizadas) + **2** | Solo 2 tiendas para el cotejo pedido a pedido |
| Zoho CRM | 0 | — |

Las respuestas crudas están fuera del repo, en `%TEMP%\thecoffee-analytics-zoho\`.

## 3. Inventario y linaje del dashboard

### 3.1 El dashboard

| Dato | Valor |
|---|---|
| Vista | «Dashboard The Coffee México», ID `2958916000007761303` |
| Workspace | «The Coffee Oficial», ID `2958916000000074002` |
| Organización | ID `862256713` |
| Creado | 2025-10-04 |
| Último cambio de diseño | 2026-08-19 |
| Componentes | **26**: 11 widgets KPI (los de la captura) y 15 reportes en las secciones inferiores |

### 3.2 Componentes y vista base

La vista base sale de `parentViewId` en `GET /views`. Para widgets y reportes, `involvedViews` devuelve las **219 tablas y query tables del workspace**, incluidas las de Books, y no la dependencia real. No sirve para el linaje.

| Componente | Tipo | ID | Vista base |
|---|---|---|---|
| 11 KPI: Ventas Netas, Ticket Promedio, # de Tickets, Promedio UPT, Total Products, Venta vs P.E., P.E. vs Venta %, P.E. vs Venta (Corriente), Venta vs Meta, Cumplimiento Meta y Diferencia vs Meta (Corriente) | WIDGET | `…7761306`, `…7761329`, `…7761981`, `…7761993`, `…8004114`, `…13256007`, `…13256019`, `…13256031`, `…16814118`, `…16818055`, `…16827068` | ⛔ No expuesta. Valores reproducidos al centavo (doc 02 §3); la asignación ID ↔ título queda sin confirmar |
| Ventas vs Transacciones por Semana | Gráfico | `…7205100` | QT «Ticket Promedio y UPT Looker Sucursales» |
| Venta por Hora | Gráfico | `…7883768` | QT «Ticket Promedio y UPT Looker Sucursales» |
| Ventas por Categorías Bebida, Comida, Merch | Gráfico | `…7465901` | Tabla «Looker Sucursales» |
| Ventas por Categorías Master MX | Gráfico | `…7762137` | «Looker Sucursales» |
| Bebidas con Café y Sin Café | Gráfico | `…7762622` | «Looker Sucursales» |
| Venta por Día de la Semana | Gráfico | `…7883743` | «Looker Sucursales» |
| Ventas por Año | Gráfico | `…8004804` | «Looker Sucursales» |
| Ventas por Semana | Gráfico | `…10297413` | «Looker Sucursales» |
| Ranking de Productos | Pivote | `…7882730` | «Looker Sucursales» |
| Método de Pago | Pivote | `…7947824` | «Looker Sucursales» |
| Método de Pago por Tienda | Pivote | `…16222623` | «Looker Sucursales» |
| Cantidad Ventas de Promociones | Pivote | `…10512516` | «Looker Sucursales» |
| Share de Promociones Master Franchise | Pivote | `…10718400` | «Looker Sucursales» |
| Resultados Promociones Tiendas Master Franchise | Pivote | `…10719260` | «Looker Sucursales» |
| KPI Venta The Coffee | Pivote | `…16242102` | QT «Meta de Venta por Día de la semana» |

Los IDs abreviados llevan el prefijo `2958916000…`.

### 3.3 Diagrama de linaje (verificado)

```mermaid
flowchart LR
  subgraph Origen
    POS[(POS The Coffee Brasil<br/>Looker del proveedor)]
    RAPPI[Reporte Rappi]
    CAPT[Captura manual:<br/>metas 2026 · P.E.]
  end
  subgraph Zoho Analytics · The Coffee Oficial
    LS[Tabla Looker Sucursales<br/>3,133,839 filas · 80 columnas<br/>sin datasource: importación manual]
    MM[Tabla Metas Mensuales 2026<br/>648 filas · última importación 03-oct]
    APE[Tabla Abraham Punto Equilibrio<br/>33 filas: oct–dic 2025]
    PEP[Tabla Punto de Equilibrio<br/>Sucursales Propias · 10 filas]
    QTU[QT Ticket Promedio y UPT]
    QTF[QT Factores Por Día de la Semana]
    CAL[QT Calendario 2025–2027]
    QTM[QT Meta de Venta por Día de la semana]
    QTPE[QT Abraham Punto de Equilibrio Diario]
    QTC[QT Tiendas Comparables]
    D[Dashboard The Coffee México]
  end
  POS -- "export diario T+1, carga manual" --> LS
  RAPPI -- "archivo diario, carga manual" --> LS
  CAPT --> MM & APE & PEP
  LS --> QTU --> QTF
  LS --> QTF
  LS & QTU & QTF & CAL & MM --> QTM
  APE --> QTPE
  LS --> QTC
  LS --> D
  QTU --> D
  QTM --> D
  QTPE -. "probable, no expuesto" .-> D
  QTC -. "filtros Comparable / Años Operando, probable" .-> D
  PEP -. "lookup por Nombre de Tienda" .-> LS
```

**Dependencias de la tabla base:** `GET …/views/{Looker Sucursales}/dependents` devuelve **274** vistas: 54 query tables, 128 pivotes, 36 gráficos, 2 resúmenes y **54 dashboards**. Cambiar esta tabla afecta a mucho más que este dashboard.

### 3.4 Tabla base «Looker Sucursales» (`2958916000007201302`)

| Atributo | Valor |
|---|---|
| Granularidad | **Una fila por producto dentro de un pedido**. Un mismo producto repetido en el pedido se agrupa con `Products` = cantidad. Los modificadores no son filas |
| Clave | (`Order ID`, `Product`) de hecho. No hay clave declarada |
| Identidades | **`Store ID` = `lookerStoreId` del POS**: las 79 tiendas del 26-oct coinciden por ID, sin excepciones. **`Order ID` = `id` del pedido POS** en mostrador y app. Rappi trae IDs propios (≥ 2,483,000,000) |
| Volumen | 3,133,839 filas. Por año: 2024 → 226,350 filas, 18 tiendas · 2025 → 1,072,665 filas, 52 tiendas · 2026 → 1,834,824 filas, 80 tiendas |
| Cobertura | Del **2024-01-02** al **2026-10-26 22:07** |
| Zona horaria | `Date` en hora local de tienda (primer pedido 08:30, último 22:07 el 26-oct) |
| Divisa | `Currency` + `Net Amount (Local)` (MXN) y `Net Amount (USD)` |
| Importe | `Net Amount (Local)` lleva **IVA** (`Revenue Sin IVA` = `Net Amount (Local)` / 1.16) |
| Origen | **Sin datasource**: no está en `GET /datasources`. Se importa a mano |
| Última importación | `27 Oct 2026 14:51:35 GMT` (08:51 CST), 1,010 filas, 13 columnas: coincide con las 1,010 líneas Rappi del 26-oct (doc 02 §4) |
| Frecuencia observada | Un día por fecha hasta el 26-oct; nada del 27-oct a las 19:00 UTC. **T+1** |
| Columnas | 80: 17 importadas del export del POS, columnas «Cacho» de un histórico y ~45 fórmulas. Lista completa en el [anexo](anexo-columnas-looker-sucursales.csv) |

Columnas de fórmula relevantes para el dashboard:

| Columna | Fórmula (literal o resumida) | Riesgo |
|---|---|---|
| `Nombre de Tienda` | `case "Store ID" when 360 then 'Tulum' … end`: **81 ramas fijas** | Una tienda nueva sin rama queda con nombre vacío. El nombre es la llave de todas las QT de metas |
| `Franquicia o Sucursales Propias` | `case when "Nombre de Tienda" in ('Aleden', …, 'Forum Tlaquepaque') then 'Sucursales Propias' else 'Franquicia' end` (11 tiendas) | Lista fija por nombre |
| `Franquiciatario` | `CASE WHEN "Nombre de Tienda" IN (…) THEN 'Aguascalientes' …` | Lista fija por nombre; no sale del CRM |
| `Canal` | `if("Place or Sale"='Rappi','Rappi','POS')` | El valor real es `'RAPPI'` y `'RAPPI TURBO'` en mayúsculas. Si la comparación distingue mayúsculas, todo cae en «POS» ⚠️ (sin verificar) |
| `Venta Tienda / Rappi` | `LOWER(IFNULL("Payment Method",'')) LIKE '%rappi%'` | Correcta para RAPPI y RAPPI TURBO |
| `Venta neta RAPPI` / `Venta neta LOOKER` → `Regalías RAPPI`, `Comisión Rappi` y `Regalías Looker` | `IF("Payment Method"='RAPPI', …)` y `<>'RAPPI'` | ⚠️ **Rappi Turbo** (215 tickets y $39,951 el 26-oct) cae en «LOOKER»: regalías al 7 % en lugar de 0.82 × 7 %, sin comisión Rappi del 18 % y sin comisión TC. Afecta a cálculos financieros, no a los KPI del dashboard |
| `Revenue Sin IVA` | `"Net Amount (Local)"/1.16` | — |
| `Día de la Semana Fórmula`, `Semana`, `Mes`, `Año` | `day_name`, `weekofyear("Date",2)`, `month` y `year` | `weekofyear` en modo 2 |
| `Regalías Looker` / `Regalías RAPPI` / `Comisión Rappi` / `Comisión TC/VTA por APP` / `Variables 3%` / `Costo Logístico` | Porcentajes fijos (7 %, 0.82 × 7 %, 18 %, 2.5 % / 3.6 % + 3, 3 % y 3.55 %) | Supuestos de negocio fijos en fórmulas |

Fórmulas agregadas: `ADT` = `count_distinct(Order ID)/count_distinct(date(Date))`, `%Venta Merch`, `%Venta Food` y `Días de la semana en el año`.

### 3.5 Query tables involucradas (SQL leído)

| QT (ID abreviado) | Qué hace | Puntos clave del SQL |
|---|---|---|
| Ticket Promedio y UPT Looker Sucursales (`…7746675`) | Una fila por `Order ID` | `SUM("Net Amount (Local)")` y **`COUNT("Products") AS "UPT"`**: cuenta **filas de producto**, no unidades |
| Meta de Venta por Día de la semana (`…15170193`) | Meta diaria por sucursal en 2026 | Meta mensual (tabla) ÷ peso del mes × factor del día de la semana. Antes de `FechaApertura` la meta es 0. Une con «Looker Sucursales» **por nombre de tienda** |
| Factores Por Día de la Semana (`…15128654`) | Factor = promedio del día de la semana ÷ promedio diario | Ventana de **12 semanas móviles** desde `CURDATE()`. Las metas futuras cambian cada semana |
| Calendario (`…15170038`) | Fechas de 2025 a 2027 | Lunes = 1 … domingo = 7 |
| Abraham Punto de Equilibrio Diario (`…11271009`) | P.E. diario = P.E. mensual ÷ días del mes | Fuente «Abraham Punto Equilibrio»: **solo oct–dic 2025** |
| Tiendas Comparables (`…28865613`) | Antigüedad desde la **primera transacción en Looker** | Comparable = ≥ 12 meses hasta `CURDATE()`. Años Operando = `FLOOR(meses/12)` |
| Tiendas Maduras (`…7763282`) | Madura si la primera transacción tiene más de 365 días | — |
| Meta de Venta Presupuesto Mensual Sucursales (`…8008129`) | Meta del mes = mes pasado por día de la semana × 1.08 tickets × 1.10 ticket | Vigencia: mes anterior a `CURDATE()` |
| Consolidado Ventas, Meta, Histórico 3 Meses (`…8139969`) | Venta diaria + mes pasado + 3 meses | — |
| Abraham Consulta Master (`…10831252`) | Calendario × tiendas × venta diaria × «Venta Q» | Lookup de `Date` en «Looker Sucursales» |
| Abraham Meta Comparable (`…10281068`) | Metas +3 % y +18 % frente al año pasado o el mes anterior | Usa «Abraham Boom Comparables» |
| Ventas y Costo (`…19108681`) | Venta, costo y utilidad por línea | Usa «Costos Marzo 2026» y «Financiero Rappi». Packaging Rappi $9.60 y ajustes «Eat Here» fijos. **Fuera del dashboard** |

Ninguna de las 12 consultas usa variables del workspace.

### 3.6 Otras tablas de soporte

| Tabla (ID abreviado) | Filas | Última importación | Uso |
|---|---|---|---|
| Metas Mensuales 2026 (Ventas Tickets TP) (`…16224736`) | 648 (81 sucursales × meses; **enero–octubre**) | 2026-10-03 01:36 GMT (81 filas) | Base de las metas. **Noviembre no está cargado** |
| Abraham Punto Equilibrio (`…10989515`) | 33 (11 tiendas × oct–dic 2025) | Sin registro de API | Base del P.E. |
| Punto de Equilibrio Sucursales Propias (`…8387991`) | 10 | Sin registro | Lookup de `Nombre de Tienda` |
| Metas de Venta por Tienda Presupuesto 2026 (`…15128809`) | 1 | Sin registro | No usada por el dashboard (sin evidencia) |

### 3.7 Orígenes sincronizados del workspace (no alimentan este dashboard)

| Origen | Programa | Última sincronización |
|---|---|---|
| Zoho Books (Comercializadora Master Sitru) | Cada 1 h | 27-oct 11:22 CST, correcta |
| Zoho Inventory (Nueva Comercializadora The Coffee) | Cada 1 h | 27-oct 11:55 CST, correcta |
| Zoho CRM | Cada 1 h | 27-oct 12:15 CST, correcta. Incluye la tabla «Tiendas (Zoho CRM)» |
| Zoho Survey | Cada 1 h | Correcta |
| Zoho Projects, Instagram y Odoo | No programado | **Fallo** (ago-2026, dic-2025 y sep-2026) |

### 3.8 Hallazgos de higiene, sin modificar nada

- **Nombres como llave.** Las QT de metas, P.E., factores y comparables unen por `Nombre de Tienda`, que sale de una fórmula de 81 ramas. Renombrar o abrir una tienda rompe uniones sin dar error.
- **Duplicados y versiones de prueba.** Hay copias como «KPI Venta The Coffee-Pruebas», «KPI vs. Meta y Trimestre V2/V3», tres variantes de «Abraham Boom Comparables» y «Abraham Tabla Días Prueba». El dashboard usa una sola de cada una, pero el workspace tiene muchas copias.
- **Antigüedad truncada.** «Tiendas Comparables» calcula la antigüedad desde la primera fila de Looker (2024-01-02). Las tiendas que abrieron antes de 2024 aparecen con apertura en ene-2024, así que «Años Operando» y «Comparable» las **subestiman** a partir de 2027.
- **Columnas sin uso aparente** (`x`, `X1`, `X2`, `xx`, `Columna`, `Date_dup`, `Product_dup`). No se verificó si algún reporte las usa.
- **No se buscaron ciclos de forma exhaustiva.** No se observaron en las 12 QT leídas.
