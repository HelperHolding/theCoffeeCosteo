# 06 · Alcance, historia y actualización para trasladar el dashboard de Zoho

- **Fecha:** 2026-10-27 (≈ 20:40–21:30 UTC).
- **Tipo:** análisis y plan. No se implementaron reportes, no se aplicaron migraciones, no se cargaron datos, no se activaron sincronizaciones ni hubo despliegues.
- **Reutiliza** 01–05 y sus extracciones (`%TEMP%\thecoffee-analytics-zoho\…` y `C:\Users\carlo\Respaldos\thecoffee-supabase\analytics-cargas\`).
- **Capturas:** las cuatro capturas mencionadas en el encargo **no llegaron a esta sesión**. Los apartados se identificaron por los nombres reales de Zoho (API) y por las tres capturas originales. Si alguna captura muestra un apartado que no está en §1, falta añadirlo.

## 0. Lecturas nuevas de esta auditoría (presupuesto usado)

| Fuente | Llamadas | Qué se leyó | Datos personales |
|---|---|---|---|
| Zoho Analytics | 27 | Detalle del dashboard y exportación de los 26 componentes (encabezados y totales) | No |
| Zoho Analytics | ~63 | 7 consultas agregadas: conteos por año, mes y canal; horas; catálogo de 28 días; inicio por tienda; control; muestra del piloto; histórico de 3 tiendas | No |
| API POS | 20 GET | Solo conteos (`perPage=1`) de retención en 3 tiendas antiguas, más la búsqueda del primer pedido de Ventura | No |
| Supabase (solo lectura) | 2 | `producto_codigo_pos`, categorías de Costeo y recetas | No |

Coste Zoho estimado: menos de 15 unidades. No se exportó detalle por pedido.

## 1. Inventario y dependencias

### 1.1 Número de componentes

`GET /views/{dashboard}` sigue devolviendo **27 vistas involucradas**: la tabla base más **26 componentes**, que son **11 tarjetas KPI (WIDGET) y 15 reportes**. Último cambio de diseño: **2026-08-19**. Las tarjetas no se pueden exportar (error 7005); los 15 reportes sí, y su exportación revela dimensiones y medidas.

### 1.2 Fuentes únicas

| Tipo | Fuente única | Dónde vive | Quién la usa | ¿Cómo se reemplaza? |
|---|---|---|---|---|
| **Transaccional** | 1. Export del POS (Looker del proveedor), carga manual T+1 | «Looker Sucursales» (filas Tablet/Smartphone) | Todo | **API POS**: la historia coincide (§2.2) |
| Transaccional | 2. Archivo Rappi, carga manual T+1 | «Looker Sucursales» (RAPPI/RAPPI TURBO) | Totales de Zoho, factores de metas, «Venta por Hora» | Fuera de alcance (D5) |
| **Configuración fija (manual)** | 3. «Metas Mensuales 2026 (Ventas Tickets TP)», 648 filas, ene–oct | Tabla Zoho | Metas, KPI por tienda | Leer de Zoho (D2) |
| Configuración fija | 4. «Abraham Punto Equilibrio», 33 filas, oct–dic 2025 | Tabla Zoho | P.E. | Sin datos 2026 (D2) |
| Configuración fija | 5. «Punto de Equilibrio Sucursales Propias», 10 filas | Tabla Zoho (lookup por nombre) | P.E. de propias | D2 |
| Configuración fija | 6. «Costo y Márgenes Marzo 2026» | Tabla Zoho (lookup por `Product`) | «Avg Margen» del ranking | Costeo (D7) |
| **Reglas CASE** | 7. Reglas de tienda: `Nombre de Tienda` (82 WHEN sobre `Store ID`), `Franquiciatario` (34 WHEN por nombre), `Franquicia o Sucursales Propias` (11 nombres) | Fórmulas de columna | Filtros, KPI por tienda, promociones | CRM + `analytics_tiendas` |
| Reglas CASE | 8. Reglas de producto: `Categoría Master Franchise MX` (58 WHEN, 276 literales, por nombre), `Comida, Bebida, Combo y Merch` (deriva de Master), `Contiene Café` (15 WHEN, 63 literales), `Promoción…` (8 nombres de combo) | Fórmulas de columna | Categorías, café, promociones | Tabla de clasificación por **código**, versionada (§4) |
| **Derivados** | 9. QT «Ticket Promedio y UPT» (1 fila por pedido) | Query table | Semana, hora, factores | Agregados del portal |
| Derivados | 10. QT «Meta de Venta por Día de la semana» (con QT «Factores…» de 12 semanas y QT «Calendario») | Query tables | Metas | Leer el resultado (D2) |
| Derivados | 11. QT «Abraham Punto de Equilibrio Diario» | Query table | P.E. diario | D2 |
| Derivados | 12. QT «Tiendas Comparables» (≥ 12 meses desde la primera venta en Looker) | Query table | Filtros Comparable / Años Operando | Primer pedido POS + apertura CRM |

**Total:**
- **6 fuentes de datos únicas**: 2 transaccionales y 4 tablas de configuración manual.
- **2 conjuntos de reglas CASE**: tienda y producto.
- **4 derivados** (query tables), que no son fuentes.
- Lo que más se comparte es la tabla base: 13 de los 15 reportes la leen directamente y 2 (R1 y R7) a través de la QT «Ticket Promedio y UPT». Las reglas de producto alimentan 7 reportes (R2–R5 y R11–R13).

### 1.3 Matriz de componentes

Para las tarjetas no hay vista base expuesta por API; su asignación ID ↔ título quedó confirmada por los valores (doc 02 §3).

**Fuentes:** POS = API POS · Zoho · CRM · Costeo.
**¿Se reproduce hoy?** ✅ con los agregados actuales (tienda × día × canal) · 🟡 requiere un agregado nuevo · ⛔ bloqueado.

| # | Componente (ID abreviado) | Usa | Fórmula / unión / filtro | Granularidad | Fuente | ¿Hoy? | Faltante / problema |
|---|---|---|---|---|---|---|---|
| T1 | Ventas Netas (WIDGET) | Looker | `SUM(Net Amount)` | tienda × día | POS | ✅ | Zoho incluye Rappi manual; el portal no (D5) |
| T2 | # de Tickets | Looker | `COUNT(DISTINCT Order ID)` | tienda × día | POS | ✅ | Igual que T1 |
| T3 | Ticket Promedio | Looker | T1 / T2 | tienda × día | POS | ✅ | — |
| T4 | Total Products | Looker | `SUM(Products)` | tienda × día | POS | ✅ | — |
| T5 | Promedio UPT | QT TP y UPT | filas de producto / tickets | tienda × día | POS | 🟡 | Hace falta `filas_producto` (productos distintos por pedido), un campo aditivo. El portal muestra «Unidades por ticket» (D6) |
| T6–T8 | Venta vs P.E. / P.E. vs Venta % / (Corriente) | QT PE Diario | P.E. mensual / días del mes | tienda × día | Zoho | ⛔ | Sin P.E. 2026 (D2) |
| T9–T11 | Venta vs Meta / Cumplimiento / Diferencia (Corriente) | QT Meta por día | Σ meta diaria de los días con venta | tienda × día | Zoho + POS | ⛔ | D2; noviembre sin metas cargadas |
| R1 | Ventas vs Transacciones por Semana (`…7205100`) | QT TP y UPT | Venta y tickets por **día de la semana** (7 filas) | tienda × día | POS | ✅ | El filtro guardado del reporte es 2026 acumulado |
| R2 | Ventas por Categorías Bebida, Comida, Merch (`…7465901`) | Looker + regla 8 | % de venta por grupo (5 filas: Bebida, Comida, Combo, Merch, Otros) | tienda × día × **producto** | POS + clasificación | 🟡 | Agregado por producto + tabla de clasificación |
| R3 | Ventas por Categorías Master MX (`…7762137`) | Looker + regla 8 | Venta por categoría (15 + Otros) | tienda × día × producto | POS + clasificación | 🟡 | ídem |
| R4 | Bebidas con Café y Sin Café (`…7762622`) | Looker + regla 8 | Venta por Sí/No. La exportación duplica la fila «Sí» (defecto de Zoho) | tienda × día × producto | POS + clasificación | 🟡 | ídem |
| R5 | Ranking de Productos (`…7882730`) | Looker + Costos Marzo | Por producto × **mes**: Share, Total Products, **Avg Margen** (232 productos; año en curso) | tienda × día × producto | POS + Costeo | 🟡 | Margen: Zoho usa costos fijos de marzo y en ago-2026 muestra **−18,196 %** (dato roto). Se propone el costo de Costeo (D7) |
| R6 | Venta por Día de la Semana (`…7883743`) | Looker | Venta y tickets por día | tienda × día | POS | ✅ | — |
| R7 | Venta por Hora (`…7883768`) | QT TP y UPT | Venta y tickets por **hora** (24 filas) | tienda × día × **hora** | POS | 🟡 | Hora 0 inflada ($5.0 M y 46,088 pedidos): ~1.5 % de las filas de Zoho tienen sello exacto 00:00:00 en todos los canales y todos los años. En el POS la hora es local |
| R8 | Método de Pago (`…7947824`) | Looker | % por `Payment Method` (10 valores) | tienda × día × **pago** | POS | 🟡 | Etiquetas de Zoho (`TABLET - CARD`, `CONTINGENCY - MONEY`, `APP - WALLET`…) ≠ POS (`CARTAO`, `DINHEIRO`, `WALLET_BALANCE`…): hace falta un mapeo verificado. Los pagos con wallet difieren (doc 02) |
| R9 | Ventas por Año (`…8004804`) | Looker | Venta por mes × año (34 meses: ene-2024 a oct-2026) | tienda × día | POS | ✅ con historia | Backfill desde 2024-01 |
| R10 | Ventas por Semana (`…10297413`) | Looker | Venta por semana × año (148 semanas) | tienda × día | POS | ✅ con historia | ídem; semana de Zoho = `weekofyear(Date, 2)` |
| R11 | Cantidad Ventas de Promociones (`…10512516`) | Looker + regla 8 | No se pudo exportar (error 7602: demasiados valores distintos); por nombre, mide cantidad por promoción | tienda × día × producto | POS + clasificación | 🟡 | Definir dimensiones en la interfaz de Zoho |
| R12 | Share de Promociones Master Franchise (`…10718400`) | Looker + reglas 7 y 8 | Por tienda: Cantidad, % y Total de «Producto regular», «Promoción alimentos y bebidas» (**Meta 6 %**) y «Promoción café» (**Meta 1 %**) | tienda × día × producto | POS + clasificación + CRM | 🟡 | Las metas 6 % y 1 % son configuración fija en el reporte |
| R13 | Resultados Promociones Tiendas MF (`…10719260`) | ídem | % por tienda frente a 6 % y 1 % | ídem | ídem | 🟡 | ídem |
| R14 | Método de Pago por Tienda (`…16222623`) | Looker | Total y % por pago × tienda | tienda × día × pago | POS | 🟡 | ídem R8 |
| R15 | KPI Venta The Coffee (`…16242102`) | QT Meta por día | Por Propias/Franquicia × tienda × día de la semana: Venta, Meta, TXS, Meta TXS, TP, Meta TP y sus % | tienda × día | POS + Zoho metas + CRM | ⛔ | D2 |

**Resumen:**
- **Con los agregados actuales:** 4 tarjetas (T1–T4) y 4 reportes (R1, R6, R9 y R10; estos dos últimos necesitan historia).
- **Con agregados nuevos:** 10 componentes (T5, R2–R5, R7, R8, R11–R14).
- **Bloqueados por D2:** 7 (T6–T11 y R15).

### 1.4 Promociones: cómo se identifican

**No se identifican por descuento.**
- La única regla es la columna `Promoción…`, que compara el **nombre del producto** (en mayúsculas, sin acentos ni espacios dobles) contra **8 nombres de combo**: 5 de «alimentos y bebidas» y 3 de «café».
- En los últimos 28 días aparecieron **4 códigos**: `TRUGOUAPP`, `MISICEDAPP`, `TRUMISAPP` (alimentos y bebidas) y `COFTUPAPP` (café). Pesan el **2.55 %** de la venta de mostrador y app.
- El `discount` del POS es otro concepto: ajustes de precio y cupones.
- La promoción se traslada como **atributo del código** en la tabla de clasificación. Un descuento nunca se trata como promoción.

## 2. Historia mínima por componente

### 2.1 Disponibilidad real por fuente (medida)

| Fuente | Desde | Hasta | Cobertura | Evidencia |
|---|---|---|---|---|
| Zoho «Looker Sucursales», POS | **2024-01-02** | 2026-10-26 (T+1) | Por año: 2024 → 18 tiendas, 134,277 pedidos · 2025 → 52 tiendas, 619,423 · 2026 → 80 tiendas, 1,001,030 | Exportación agregada |
| Zoho, Rappi manual | RAPPI 2025-02 · RAPPI TURBO 2025-07 | 2026-10-26 | 2025: 13,193 pedidos · 2026: 155,012 | ídem |
| **API POS** | **Al menos desde 2023-11-27** (Ventura, company 384) | En segundos | Coincide con Zoho en 13 tienda-mes medidos (±2 pedidos): 301, 354 y 355; ene y jun-2024, ene y oct-2025, ene-2026 | 20 GET de conteo |
| CRM `fecha_apertura` | 2024-01-15 (mínimo) | — | **58 de 86** tiendas con fecha; ninguna anterior a 2024 | Lectura del CRM |
| Metas Zoho | 2026-01 | 2026-10 | 81 sucursales; **sin noviembre** | doc 01 |
| P.E. Zoho | 2025-10 | 2025-12 | 11 tiendas; **sin 2026** | doc 02 |

**Retención del POS:** no hay límite visible hasta 2023. No se midió antes de 2023-01: la ventana de 2023 de Ventura empieza en noviembre, así que no se sabe si el POS guardaría más.

### 2.2 Matriz

Semana de referencia: 2026-10-26 → 2026-11-01. Fechas exactas para esa semana. Las fechas «hasta» son siempre el último día **cerrado** según `ventanaDia`.

| Componente | Granularidad | Ventana mínima | Desde → hasta | Depende de | Limitación |
|---|---|---|---|---|---|
| T1–T4 sin comparativo | tienda × día × canal | Días de la semana | 2026-10-26 → hoy | POS | Ya cargado |
| T1–T4 frente a la semana anterior | ídem | 2 semanas | **2026-10-19** → hoy | POS | Falta cargar del 19 al 25 |
| Tendencia de 12 semanas | ídem | 12 semanas cerradas | **2026-08-03 → 2026-10-25** | POS | — |
| Frente al año anterior (semana) | ídem | La misma semana de 2025, de lunes a domingo | **2025-10-27 → 2025-11-02** | POS | Tiendas sin venta en 2025 → «sin base» (Juárez y Tijuana) |
| Frente al año anterior (mes) | ídem | Mismo mes de 2025 | **2025-10-01 → 2025-10-31** | POS | ídem |
| R9 Ventas por Año · R10 por Semana | ídem (mes / semana) | Toda la historia | **2024-01-01** → hoy. El POS tiene más (2023-11-27) | POS | Zoho arranca el 2024-01-02: para paridad se muestra desde 2024 |
| R1, R6 (día de la semana) | ídem | El filtro guardado: año en curso | **2026-01-01** → hoy | POS | — |
| R7 Venta por Hora | tienda × día × canal × hora | Año en curso | 2026-01-01 → hoy | POS | Diferencia esperada en la hora 0 (§1.3) |
| R8, R14 Pagos | tienda × día × canal × pago | Año en curso | 2026-01-01 → hoy | POS + mapeo | Mapeo verificado en el piloto |
| R2–R4 Categorías y café | tienda × día × canal × producto | Año en curso | 2026-01-01 → hoy | POS + clasificación | La clasificación actual aplicada al pasado se rotula «clasificación vigente al …» |
| R5 Ranking | ídem, por mes | Año en curso (ene–dic) | 2026-01-01 → hoy | POS + clasificación + Costeo | Margen con costo actual (D7) |
| R11–R13 Promociones | ídem | Año en curso | 2026-01-01 → hoy | POS + clasificación + CRM | Metas de 6 % y 1 % fijas |
| **Metas, leer de Zoho** (T9–T11, R15) | tienda × día | Solo el periodo mostrado | 2026-10-26 → 2026-11-01 (export de la QT) | Zoho | Requiere metas del mes cargadas |
| **Metas, recalcular en el portal** | tienda × día | Mes anterior + 12 semanas cerradas + metas del mes | Factores: **2026-08-03 → 2026-10-25**; presupuesto mensual: **2026-09-01 → 2026-09-30**; «Meta Comparable»: **2025-10** y **2026-09** | POS + metas | **No hay paridad**: los factores de Zoho incluyen Rappi manual. Recalcular sin Rappi da otras metas |
| P.E. (T6–T8) | tienda × mes | El mes mostrado | 2026-10 | Zoho | No existe (D2) |
| Comparable / Años Operando | tienda | Primer pedido de cada tienda | **Desde el primer pedido en el POS** (≥ 2023-11-27 en Ventura) + `fecha_apertura` del CRM | POS + CRM | Una tienda que operó antes de este POS sigue truncada: hace falta su apertura real (dato de negocio, D8) |

## 3. Piloto recomendado

### 3.1 Tiendas (6)

| Store ID / company | Tienda | Por qué |
|---|---|---|
| 301 / 384 | Ventura | **Propia**; la más antigua (POS desde 2023-11-27); sirve para el año anterior y la antigüedad |
| 455 / 532 | Rubén Darío | **Propia**; **Rappi en el POS** (para probar la exclusión) y mucha app |
| 477 / 612 | Cd. Juárez | **Franquicia**; zona **America/Ciudad_Juarez** (horario de verano de EE. UU.); abrió en feb-2026 (sin base 2025) |
| 498 / 583 | Bonampak | **Franquicia**; **America/Cancun** (UTC−5, la primera en empezar el día) |
| 482 / 613 | Tijuana | **America/Tijuana** (la última en cerrar); sin datos en la ventana de 2025 (sin base) |
| 432 / 545 | Polanco | **Pagos con wallet**: 11 de los 74 pedidos con `WALLET_BALANCE` de la red el 26-oct; muchos combos de promoción |

### 3.2 Fechas

- **2026-08-03 → 2026-10-25:** 84 días, las 12 semanas de factores. Incluye septiembre completo como mes anterior.
- **2025-10-27 → 2025-11-09:** 14 días. Es la semana del año anterior más la siguiente, para cubrir el fin del horario de verano de EE. UU. del **2025-11-02**, que afecta a Juárez y Tijuana.
- **Total: 98 días por tienda.**

### 3.3 Volumen (medido en Zoho) y estimaciones

| Concepto | Valor | Tipo |
|---|---|---|
| Pedidos de mostrador y app | **30,635** (27,626 en 2026 + 3,009 en 2025) | **Medido** |
| Filas de producto (Zoho) | 44,447 (solo la ventana de 2026) | Medido |
| Celdas tienda × día × código (2026) | **17,239** | Medido |
| Códigos distintos por tienda | 56–88 | Medido |
| Páginas del POS | ~95–110 GET. 24 ventanas de ≤ 31 días; ⌈pedidos/500⌉ por ventana | Estimado a partir de lo medido (121 GET = 2 días de red; 7 GET = 3,042 pedidos) |
| Transferencia | ~25 MB (30 KB por cada 36 pedidos, docs/sucursales/02) | Estimado |
| Tiempo de extracción | 2–4 min, con concurrencia 4 | Estimado |
| Zoho para cotejo | 4 exportaciones agregadas (tienda × día × lugar; × código; × hora; × pago) y < 25 unidades | Estimado |
| **Filas que se guardarían** | base 588 lecturas × 4 canales = 2,352 · producto ~20,000 · hora ~10,500 · pago ~2,500 | Estimado |
| **Presupuesto máximo** | **150 GET al POS** y **40 llamadas a Zoho**; se aborta al superarlo | Propuesto |

**Desbloquea:** T5, R1–R10 y R14, más el año anterior y las 12 semanas de factores. Valida el mapeo de pagos y de categorías, la exclusión de Rappi, wallet y las zonas horarias.
**No desbloquea:** metas, P.E. y R15 (D2), ni la antigüedad de tiendas anteriores al POS (D8).

### 3.4 Cuánto costaría la historia completa (estimación, no ejecutada)

| Alcance | Pedidos (medidos en Zoho) | GET al POS estimados | Transferencia estimada |
|---|---|---|---|
| 2026-01-01 → hoy, 86 tiendas | 1,001,030 | ~2,800 | ~0.8 GB |
| 2024-01-01 → hoy, 86 tiendas | 1,754,730 | ~4,500 | ~1.5 GB |
| Primer pedido por tienda (antigüedad) | — | 2 GET por tienda = 172 | despreciable |

## 4. Granularidad y almacenamiento

### 4.1 Qué no se puede construir con tienda × día × canal

Categorías y productos (R2–R5, R11–R13), horas (R7), métodos de pago (R8, R14) y productos distintos por ticket (T5). Todo lo demás sí.

### 4.2 Agregados mínimos propuestos (sin pedidos crudos)

| Tabla | Clave | Medidas | Regla para no duplicar |
|---|---|---|---|
| Base actual + 3 columnas | (fuente, company, fecha, canal) | + `filas_producto`, `descuento_cent`, `modificadores_cent` | Aditivas: un pedido pertenece a un solo canal |
| `analytics_ventas_hora` | + hora local | venta, tickets, unidades | Un pedido tiene una sola hora → tickets aditivos |
| `analytics_ventas_pago` | + método, tipo | venta, tickets | Un pedido tiene un solo método → aditivo |
| `analytics_ventas_producto` | + código del POS (o nombre si viene sin código, marcado) | venta (línea + modificadores), unidades, `tickets_con_producto` | **`tickets_con_producto` no se suma entre productos ni categorías.** El total de tickets sale siempre de la tabla base. Las categorías se muestran con venta y unidades |
| `analytics_clasificacion_producto` | (código, vigente_desde) | categoría Master, grupo (Comida/Bebida/Combo/Merch), contiene café, promoción, origen | **Versionada.** La consulta usa la versión vigente en la fecha de la venta, y la interfaz rotula «clasificación vigente al …». La primera versión se siembra con la regla actual de Zoho aplicada a los 100 códigos vistos en 28 días |
| `analytics_mapeo_pago` | (método POS, tipo POS) → etiqueta | — | Se verifica en el piloto pedido por pedido (`Order ID` = `id`) |

Reglas de consistencia:
- **Promedios y porcentajes:** nunca se guardan. Ticket promedio, UPT, participaciones y cumplimientos se calculan al consultar, como cociente de sumas.
- **Descuentos y modificadores:** se guardan aparte. La venta de una línea incluye sus modificadores, igual que `grossAmount`.
- **Productos sin clasificar:** caen en la categoría «Sin clasificar» y se muestran como tal; no se reparten entre otras categorías. Hoy, los 28 códigos sin enlace en Costeo pesan el 8.9 % de la venta, pero la regla de Zoho sí los clasifica.
- **Rappi:**
  - el del POS va en su canal y nunca se suma;
  - el de Zoho se queda en `zoho_rappi`;
  - ninguna tabla nueva recibe filas de `zoho_rappi`.
- **Costeo frente a Zoho:** los 72 enlaces de Costeo cubren el **91.1 %** de la venta de 28 días, pero sus **23 categorías** no son las 15 de «Master MX». Para tener paridad se usa la clasificación propia (arriba); Costeo aporta costo y margen.

## 5. Conexión y actualización

### 5.1 Comportamiento actual

```
API POS ─(manual: extraer-pos.ts)→ archivo fuera del repo ─(manual: aplicar.ts)→ Supabase analytics_*
Zoho Rappi ─(manual, una vez: extraer-rappi-zoho.ts)→ archivo ─(aplicar.ts)→ fuente zoho_rappi
Supabase ─(lectura en cada petición, con la sesión y la RLS del usuario)→ /analytics (sin caché compartida)
Sucursales: API POS en vivo, bajo demanda, con caché en memoria por tienda (sin cambios)
```

- **Tareas programadas:** **ninguna**. No hay `vercel.json`, crons, rutas programadas ni jobs de Supabase en el repo.
- **Si se carga un archivo nuevo en Zoho:** no pasa nada. Analytics no lee ventas de Zoho; solo leyó Rappi una vez.
- **Si se corrige un día anterior en el POS:** no se ve hasta una nueva extracción y aplicación manual. La lectura nueva lo reemplaza de forma atómica (con respaldo).
- **Si cambia una meta, categoría o fórmula en Zoho:** hoy no afecta a nada. Analytics no usa metas ni categorías.
- **Si el usuario refresca Analytics:** se relee Supabase. No hay llamadas al POS ni a Zoho y las cifras no cambian hasta la siguiente carga.

### 5.2 Arquitectura propuesta

| Dominio | Frescura del origen | Frecuencia de extracción | Mecanismo | Caché del portal |
|---|---|---|---|---|
| Ventas POS, día abierto | Segundos | Cada 30 min, de 06:00 a 24:00 en la zona de cada tienda | Cron → extraer (`leerPedidos`) → `aplicarCarga` en transacción, con respaldo | Sin caché compartida; la página muestra la «Última lectura» |
| Ventas POS, cierre | — | A partir de `ventanaDia(F).fin + 1 h` | Mismo job; `provisional=false` | — |
| Ventas POS, reconciliación | — | Diaria: últimos 7 días cerrados | Comparar `totalItems` y releer lo que cambie | Aviso «corregido el …» |
| Metas (si D2 = leer de Zoho) | T+1 / mensual, manual | Cada hora: `importdetails` (0.1 u); si cambió `lastImportTime`, exportar la QT del mes | Fuente `zoho_meta` aparte | «Metas: Zoho, importadas …» |
| Clasificación de productos | Cambio manual | Al aprobar una versión nueva (no automático) | Nueva fila vigente_desde | Rótulo de versión |
| Tiendas (CRM y catálogo POS) | Horas | Diaria (`tiendas.ts`) | Alta o baja verificada; no reescribe relaciones en silencio | — |
| Rappi | — | **Ninguna** (D5) | — | — |

Ante errores:
- **Token vencido, 429/5xx o lectura parcial:** la tienda queda «sin lectura», conserva la lectura anterior y se reintenta en el siguiente ciclo.
- **Zoho caído:** las metas muestran la última importación buena con su fecha.
- Nada se muestra como cero.

**No hay «en vivo» para fuentes manuales.** Zoho es T+1 manual, y extraerlo cada hora no lo hace más fresco: solo detecta antes una carga nueva.

Implementarlo requiere decidir dónde corre el job y con qué credencial. Lo natural es Vercel Cron con `CRON_SECRET` y conexión de servidor, pero cambia la configuración del proyecto y necesita aprobación.

## 6. Fases ordenadas por dependencias

| Fase | Entrada | Entrega | Desbloquea |
|---|---|---|---|
| **F1 · Piloto** (§3) | Aprobación del presupuesto | Extracción de 6 tiendas × 98 días a PGlite; cotejo con Zoho por tienda × día × {categoría, hora, pago}; primera versión del mapeo de pagos y de la clasificación | Validar el diseño de §4 |
| **F2 · Migración 24** | F1 | Tablas de hora, pago, producto, clasificación y mapeo; 3 columnas en la base; pruebas PGlite | F3 |
| **F3 · Backfill** | F2 + aprobación | 2026-01-01 → hoy para todas las tiendas (~2,800 GET); después, 2024-01-01 → 2025-12-31 si se aprueba (~1,700 GET más) | R1–R10, R14 |
| **F4 · Reportes del portal** | F3 | Día de la semana, hora, año y semana, pagos, categorías, café, ranking, promociones | Paridad visual |
| **F5 · Metas y P.E.** | D2 | Lector de metas de Zoho (o captura en el portal); KPI por tienda (R15) | T6–T11, R15 |
| **F6 · Actualización automática** | F2 + aprobación del job | Cron de día abierto, cierre y reconciliación; frescura por fuente | Datos sin intervención manual |
| **F7 · Antigüedad** | 172 GET + D8 | Primer pedido por tienda; reglas Comparable / Años Operando | Filtros |

## 7. Decisiones que bloquean

| ID | Decisión | Bloquea |
|---|---|---|
| D2 | Metas y P.E.: **leer el resultado de Zoho** (paridad, depende de la carga manual) o **recalcular en el portal** (sin Rappi, otras cifras) | T6–T11, R15 |
| D5 | Rappi: qué expondrá Brasil. También afecta la paridad de metas, porque los factores de Zoho incluyen Rappi | Rappi en indicadores |
| D7 | Margen del ranking: **costo actual de Costeo** (recomendado) o la tabla fija de Zoho «Marzo 2026» | Margen de R5 |
| D8 | Fecha real de apertura de las tiendas que operaron antes del POS actual (la de Zoho está truncada en 2024; el CRM no tiene ninguna anterior a 2024 y 28 tiendas no tienen fecha) | Comparable / Años Operando exactos |
| D9 | Quién mantiene la clasificación de productos y cómo se aprueba una versión nueva | R2–R5, R11–R13 |
| D10 | Aprobar el job programado (dónde corre y con qué credencial) | F6 |

No bloquean el piloto: D3 y D6 (etiquetas propuestas), el mapeo de pagos (se resuelve con evidencia) y la diferencia de wallet (se documenta).

## 8. Recomendación

**Para desbloquear 11 de los 15 reportes y la tarjeta UPT** (R1–R10, R14 y T5), proponemos:

1. **Fuente:** solo la **API POS**, mostrador y app; Rappi excluido. La historia coincide con Zoho.
2. **Agregados nuevos:** tienda × día × canal × {hora, método de pago, código de producto}, más `filas_producto`, `descuento_cent` y `modificadores_cent` en la base. Se acompañan de una **clasificación de productos versionada por código**, sembrada con la regla vigente de Zoho, y un mapeo de pagos verificado.
3. **Piloto primero:** **6 tiendas** (Ventura 384, Rubén Darío 532, Cd. Juárez 612, Bonampak 583, Tijuana 613 y Polanco 545), del **2026-08-03 al 2026-10-25** y del **2025-10-27 al 2025-11-09**. Presupuesto de **150 GET al POS y 40 llamadas a Zoho**.
4. **Backfill después del piloto:** desde el **2026-01-01** para las **86 tiendas** incluidas; extenderlo al **2024-01-01** solo para año anterior y tendencias, si se aprueba.
5. **Fuera de este bloque:** metas, P.E. y KPI por tienda esperan D2; la antigüedad exacta espera D8.

Nada de esto se ejecutó: este plan medido queda para aprobación.
