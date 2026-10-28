# 04 · Plan de implementación

Premisas, verificadas el 2026-10-27 (docs 01–03):
- Zoho recibe las ventas **a mano, T+1**: el export de Looker más el archivo de Rappi.
- La API POS reproduce **exactamente** el mostrador de Zoho y es fresca en segundos. Sustituye la carga manual.
- Las diferencias con Zoho están explicadas:
  - **Rappi**, que solo llega completo por el archivo manual;
  - **pagos con wallet** en la app, por cómo los exporta Looker.
- Todos los KPI visibles se reproducen al centavo con las fórmulas leídas.
- Metas y P.E. son capturas manuales dentro de Zoho; el P.E. no tiene 2026.

## 1. Paridad frente a mejoras

| Elemento | Paridad con Zoho | Mejora propuesta | Fuente v1 |
|---|---|---|---|
| Ventas Netas (con IVA), # Tickets, Ticket Promedio | ✅ Exacta en mostrador. En app, diferencia de definición documentada (wallet). Rappi, parcial | Datos del día en curso, sin captura manual | API POS |
| Total Products | ✅ Unidades = líneas POS = `SUM(Products)` | — | API POS |
| UPT | Zoho cuenta **filas de producto por ticket** (1.50) | Mostrar «Unidades por ticket» real (1.64) y, si negocio lo pide, «Productos distintos por ticket» para comparar con Zoho. **Decisión D6** | API POS |
| Venta vs Meta, Cumplimiento, Diferencia (Corriente) | ✅ Meta = Σ meta diaria de la QT de Zoho; «Corriente» = días con venta | Meta «a hoy» explícita; mes sin meta = «sin meta» | Zoho (exportación SQL) |
| P.E. y sus 3 widgets | ✅ Fuente identificada; **sin datos 2026** | Ocultar o «sin P.E.» hasta que exista dato | Zoho |
| Filtros: fecha, día de la semana, tienda, franquiciatario | Mismo efecto | Tienda por `lookerStoreId`; franquiciatario del CRM; precedencia de fechas explícita | Portal + CRM |
| Comparable, Años Operando | Regla: ≥ 12 meses desde la primera venta | Desde la apertura en el CRM, sin truncar en 2024 | CRM |
| Rappi | — | «Rappi (registrado en POS)» con aviso; completo cuando la API lo traiga | API POS |
| 15 reportes inferiores (categorías, día y hora, ranking, métodos de pago, promociones, ventas por año y semana) | Fuera de la v1. Categorías y promociones dependen de fórmulas CASE por nombre de producto en Zoho | v2, con categorías del Costeo y `producto_codigo_pos` | — |
| Costos / P&L | Fuera de la v1 | — | Costeo |

## 2. Wireframe de baja fidelidad (escritorio; en móvil, una columna)

```
┌ Analytics ─────────────────────────────────────────────────────────────┐
│ Periodo [Hoy|Ayer|Semana|Mes|Rango…]  Tienda [mis tiendas ▾]           │
│ Franquiciatario [▾]  Día sem. [▾]  Comparable [▾]   ⟳ Actualizado 12:41│
│ Fuente: API POS · Metas: Zoho (importado 08:10) · ⚠ Rappi parcial      │
├───────────┬───────────┬───────────┬───────────┬───────────┐            │
│ Venta  ⓘ  │ Tickets ⓘ │ Ticket ⓘ  │ UPT ⓘ     │ Unidades ⓘ│            │
│ $567,320  │ 4,091     │ $138.68   │ 1.63      │ 6,670     │  vs sem.ant│
├───────────┴───────────┴─────┬─────┴───────────┴───────────┤            │
│ Venta vs meta a hoy (barra)  │ Cumplimiento % (barra, no   │            │
│ meta periodo · meta a hoy    │ velocímetro) · diferencia   │            │
├──────────────────────────────┴─────────────────────────────┤            │
│ Tendencia diaria (línea) · periodo actual vs comparable     │            │
├─────────────────────────────────────────────────────────────┤            │
│ Tabla por tienda: venta, tickets, ticket, UPT, meta, %, Δ   │ → detalle │
│ (ordenable; exporta CSV con el mismo alcance)               │  auditable│
└─────────────────────────────────────────────────────────────┘
```

- **Detalle auditable:** de una tienda y un día se baja a sus pedidos (ID, hora, importe y canal) con las mismas reglas que Sucursales. Así se puede reconstruir cualquier cifra.
- **Estados:**
  - Carga: esqueleto.
  - Vacío: «sin ventas en el periodo» distinto de «tienda sin datos en la API».
  - Error: última lectura buena más reintento.
  - Desfase: aviso de frescura (ámbar a 2 min, rojo a 5 min en vivo; «al cierre de» en cerrados).
  - Meta ausente: «sin meta», nunca 0.
- **Visual:** fondo papel, tarjetas `rounded-2xl`, color dentro de las gráficas según la skill dataviz, SVG propio como en Sucursales. Los velocímetros de Zoho se sustituyen por barras de progreso, más legibles y accesibles. Es una mejora y no cambia el dato.
- Antes de implementar hay que cargar las skills `dataviz` y `frontend-design`, y leer `node_modules/next/dist/docs/` (AGENTS.md).

## 3. Etapas

| Etapa | Entrada | Acciones | Entregable | Comprobación | Decisión necesaria |
|---|---|---|---|---|---|
| **1b. Auditoría** ✅ 2026-10-27 | Acceso de Analytics (metadata.read + data.read) | Linaje, SQL, fórmulas, cotejo de red, por pedido y mensual | Docs 01–02 y anexo | Todos los KPI reproducidos; diferencia del 15 % explicada | — |
| **1c. Pendientes de interfaz (opcional)** | Sesión en Zoho Analytics, solo lectura | Confirmar la asignación ID ↔ título de los 11 widgets, los filtros ocultos y su alcance, la precedencia de fechas y la unión de Comparable | Anexo de 01 | Capturas | Ninguna |
| **2. Contrato y diseño** | 1b | Fijar definiciones finales (Venta con IVA, UPT, meta «a hoy»); prototipo navegable con fixtures; reglas de alcance | Contrato de métricas versionado + prototipo `prueba:visual` | Revisión con negocio | **D1–D6** (§5) |
| **3. Implementación v1** | Contrato aprobado | Módulo `analytics`: registro, rutas, servidor; ventas de API POS para las tiendas del usuario; metas Zoho en caché; estados y frescura | PR(s) con pruebas | vitest, pglite para permisos, typecheck | Aprobar la migración del `check` de `modulo` y los accesos |
| **4. Validación** | v1 en preview | Cotejo portal ↔ API POS (conteos exactos) y portal ↔ Zoho (cifras explicadas); pruebas de permisos (usuario de 1 tienda no ve red); rendimiento; recuperación (token vencido, Zoho caído, 6045) | Informe de validación | Tolerancias de doc 02 §4.4 | — |
| **5. Publicación** | Validación aprobada | Migración, accesos, despliegue y procedimiento de reversión | Producción | Verificación en prod de solo lectura | **Aprobación de publicación** |

Fase posterior, fuera de la v1:
- Vista de **red completa** con agregados diarios persistidos (doc 03, alternativa D).
- **Rappi completo**, cuando Brasil lo agregue a la API.

## 4. Estimación por complejidad

| Bloque | Complejidad | Depende de |
|---|---|---|
| Módulo base (registro, rutas, permisos, migración `check`) | Baja; patrón existente | D4 |
| KPI de ventas desde POS (tiendas del usuario) | Baja-media; reutiliza `lib/sucursales` | Contrato |
| Lector Zoho de metas y P.E. (exportación SQL asíncrona, caché, frescura) | Media: cliente nuevo, *jobs* asíncronos y cuotas. El patrón ya está probado en la auditoría | D2 |
| Traducción `lookerStoreId` → nombre de Zoho para leer metas (la QT une por nombre) | Baja: CASE de 81 ramas leído; validarlo contra el CRM | — |
| Filtros Comparable, Años Operando y Franquiciatario | Media: mapeo de identidades CRM ↔ POS para 119 tiendas | Verificar `lookerStoreId` = número Jestor en todas |
| Red completa con agregados persistidos | Media-alta: tabla, job nocturno, idempotencia y reconciliación | D1 |

No se dan fechas: dependen del acceso y de las decisiones.

## 5. Decisiones que cambian arquitectura o alcance

- **D1. Persistir agregados diarios de ventas en Supabase** (tienda × día × canal; no pedidos crudos). **Aprobada (2026-10-27);** implementada localmente, ver 05.
  - Es necesario para la vista de red y para comparativos largos sin releer el POS.
  - Cambia la decisión E4 de Sucursales.
- **D2. Fuente de verdad de metas y P.E.**
  - Opción a: seguir en Zoho, con el portal leyendo.
  - Opción b: editarlas en el portal y retirar la carga manual.
  - Con b, Zoho deja de ser dependencia de la v1.
- **D3. Nombre y definición de la venta:** en Zoho, «Ventas Netas» = **con IVA**, después del descuento, e incluye Rappi manual.
  - Propuesta: «Venta (con IVA)» y, aparte, «Venta sin IVA» = /1.16, ambas desde el POS.
  - Hay que confirmar si se conserva el rótulo «Netas».
- **D4. Modelo de acceso**: **Resuelta para la etapa 1:** solo admin activo, toda la red.
  - ¿Basta el alcance por sucursal (`perfil_sucursales`) o hace falta un alcance por franquiciatario?
  - ¿Quién ve totales de red?
- **D5. Rappi en la transición:** **Pendiente:** Rappi fuera de los KPI; preparación de Zoho aparte (05 §3.3).
  - Opción a: solo lo que trae la API, con aviso.
  - Opción b: además, Rappi de Zoho (T+1, archivo manual) rotulado aparte y **sin sumarlo** a la venta de la API.
  - Sin una llave común, b no puede deduplicar los 24 pedidos Rappi que sí están en la API.
- **D6. UPT:** ¿se mantiene la definición de Zoho (filas por ticket) o se usa la de unidades por ticket? Ambas pueden mostrarse, con nombres distintos.

## 6. Riesgos

| Riesgo | Mitigación |
|---|---|
| Los usuarios comparan el portal con Zoho y ven ~15 % menos | Explicado por Rappi y wallet (02 §4.4). Aviso de cobertura Rappi y nota de definición en el KPI |
| Doble conteo de Rappi en la transición (API parcial + manual) | No sumar el archivo manual a la API (D5) |
| Metas de noviembre sin cargar y P.E. 2026 inexistente | Mostrar «sin meta» y «sin P.E.»; avisar a quien captura |
| Las QT de Zoho unen por nombre de tienda; un renombre rompe metas sin error | Traducción por ID validada en cada lectura; aviso si una tienda no tiene meta |
| `createdAt` es hora local etiquetada Z; cambio de horario en Juárez el 2026-11-01 | Revisar después del 1-nov (pendiente de Sucursales) |
| Nombre de tienda duplicado (800/802) | Identidad por `companyId` |
| Cupo exacto del plan Zoho One no visible por API | Lector con presupuesto y respuesta a 6045; operación < 30 u/día |
| El modelo de Zoho se edita activamente (QT de metas modificadas hoy) | Sellar la extracción con fecha; releer el SQL de la QT de metas antes de la etapa 3 |
| API POS sin cancelaciones ni devoluciones | Declararlo en la definición; pedirlo a Brasil junto con Rappi |

## 7. Criterios de aceptación de la v1

1. Para 3 ventanas cerradas, los conteos de tickets y unidades del portal = API POS **exactos**. La venta difiere ≤ $0.01 por ticket.
2. Toda diferencia con Zoho está clasificada (datos, fórmula, filtro, tiempo, redondeo o permisos) y publicada.
3. Un usuario con N tiendas solo obtiene datos, detalle y exportación de esas N; las pruebas cubren usuario sin acceso, con 1 tienda y admin.
4. Ningún token en el cliente; respuestas `private, no-store`; la caché se consulta después de autorizar.
5. Cada KPI muestra definición, fuente y hora de la última lectura buena. Una meta ausente se muestra «sin meta», no 0.
6. Funciona en móvil (375 px) sin scroll horizontal y con estados de carga, vacío, error y desfase.
7. Zoho caído, token vencido o cuota agotada no rompen las ventas: solo se degradan las metas, con aviso.
