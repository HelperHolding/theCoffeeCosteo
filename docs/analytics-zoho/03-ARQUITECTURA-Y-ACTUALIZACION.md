# 03 · Arquitectura, fuentes de verdad, permisos y frescura

Base: evidencia de 01 y 02 (2026-10-27) y patrones del portal (§5).

## 1. Cómo entran hoy los datos (medido)

| Familia | Origen y dónde se edita | Origen → Zoho | Evidencia |
|---|---|---|---|
| Ventas de mostrador y app | POS The Coffee (Brasil); no se editan | **Export del Looker del proveedor, cargado a mano** en «Looker Sucursales», que no tiene datasource. **T+1**: el 27-oct a las 19:00 UTC solo había datos hasta el 26-oct 22:07 | `datasources`, `importdetails` y serie diaria (01 §3.4) |
| Rappi y Rappi Turbo | Reporte de Rappi | **Archivo manual diario** en la misma tabla, con IDs propios de Rappi. Última carga: 27-oct 08:51 CST, 1,010 líneas | `importdetails` = 1,010 filas = líneas Rappi del 26-oct |
| Metas 2026 | Captura manual | Tabla «Metas Mensuales 2026», importada el 03-oct; enero–octubre | 01 §3.6 |
| Meta diaria | Calculada en Zoho | QT con factores de 12 semanas móviles; **cambia cada semana** | SQL leído |
| P.E. | Captura manual | «Abraham Punto Equilibrio»: oct–dic 2025. **Sin 2026** | Exportación SQL |
| Comparable / Años Operando | Calculados en Zoho desde la primera venta en Looker | QT; antigüedad truncada en 2024 | SQL leído |
| Tiendas y franquiciatarios | CRM | Zoho CRM → Analytics cada hora, sin uso en este dashboard. El dashboard usa listas fijas en fórmulas | `datasources` |
| POS → API | — | **Segundos** (docs/sucursales/02) | Medición puntual |

Conclusiones:
1. La API POS reproduce **exactamente** el mostrador de Zoho: 0 tickets y −$0.15 en un mes de Juárez; 0 tickets y −$13 en la red de un día.
2. La API es **más fresca** que Zoho: segundos frente a T+1 manual.
3. Rappi solo llega completo por el archivo manual.
4. Metas y P.E. nacen en capturas manuales dentro de Zoho.

**Consultar Zoho más seguido no aporta frescura**: sus tablas cambian una vez al día, cuando alguien las carga.

## 2. Fuente de verdad por dominio (propuesta)

| Dominio | Fuente de verdad | Justificación | Condición |
|---|---|---|---|
| Mostrador | **API POS** | Paridad exacta, frescura en segundos y sin captura manual | — |
| App | **API POS** | Es el registro de origen. Zoho difiere en los pagos con wallet por cómo exporta Looker | Rotular la definición. No forzar paridad con Zoho (02 §4.4) |
| Rappi | **API POS cuando Brasil lo integre**. Hasta entonces, Rappi «registrado en POS» con aviso de cobertura parcial | Objetivo de negocio: centralizar. Mezclar con el archivo manual duplica pedidos | **Decisión D5**: ¿mostrar Rappi de Zoho (T+1) mientras tanto? |
| Metas | Zoho (lectura de la QT «Meta de Venta por Día de la semana») | Ya contiene la lógica de reparto y factores | **D2**: migrarlas al portal elimina la dependencia |
| P.E. | Zoho, cuando exista 2026; si no, sin P.E. | Hoy no hay dato | **D2** |
| Comparable / Años Operando | CRM (fecha de apertura) | La regla de Zoho trunca en 2024 | Regla validada por negocio |
| Tienda, franquiciatario | CRM + `lookerStoreId` | Las fórmulas de Zoho usan nombres fijos | — |
| Costos | Costeo (Supabase) | Ya es la fuente del costo actual | Fuera de la v1 |

## 3. Alternativas para mantener el portal actualizado

| Criterio | A. Embed de Zoho | B. Bajo demanda por request | **C. Caché en servidor con TTL por familia** | D. Agregados diarios persistidos + día abierto bajo demanda |
|---|---|---|---|---|
| Frescura de ventas | T+1 (la de Zoho) | Segundos | ≤ 2 min hoy; cerrados al día siguiente | Igual que C |
| Paridad visual del portal | No | Sí | Sí | Sí |
| Red completa (79–119 tiendas) | Sí | **No**: ~60 GET por día de red | Viable con caché compartida por ventana, ya autorizada | **Sí**, barato para periodos largos |
| Historial anterior a la API (2024–feb 2026) | Sí | No | No | Solo si se importa una vez desde Zoho (decisión) |
| Licencia | Embedded Analytics ⛔ | — | — | — |
| Complejidad | Baja técnica, alta comercial | Baja | Media; reutiliza `lib/sucursales` | Media-alta: tabla, job e idempotencia |

### Recomendación

**C ahora, D cuando se apruebe la persistencia (D1).**

1. **Ventas (mostrador + app):** API POS mediante `lib/sucursales/proveedor.ts`.
   - Caché en servidor por `(companyId, ventana)`, sin usuario en la clave y con autorización **antes** de leerla.
   - TTL: 45 s hoy, 10 min para cerrados recientes y 6 h para antiguos, como en Sucursales.
   - La v1 cubre las sucursales autorizadas del usuario. La red completa (vista de dirección) requiere D (persistencia de agregados) o aceptar ~60 GET por día de red en caché compartida.
2. **Metas y P.E.:** exportación SQL asíncrona a Zoho, de solo lectura, sobre la QT de metas.
   - Filtro por fechas y `Store ID` resuelto a nombre, porque la QT une por nombre.
   - Caché de 1 h, invalidada cuando cambia `importdetails` de «Metas Mensuales 2026».
   - Coste: < 1 unidad por lectura.
3. **Rappi:** solo lo que traiga la API, con aviso «Rappi parcial (registrado en POS)». Cuando Brasil lo integre, entra sin cambios de arquitectura.
4. **Historial:** sin historial anterior a la API en la v1. Si se necesita, una única importación de agregados diarios desde Zoho, con su fuente y su definición visibles. Es una decisión.

Con D, la persistencia sería así:
- Tabla de agregados `(company_id, fecha_local, canal)` con tickets, venta, unidades y descuento.
- *Upsert* idempotente, con reanudación por día.
- Reconciliación nocturna de los últimos 7 días contra `totalItems`.
- Las bajas o correcciones del POS se registran en `bitacora`.
- No se guardan pedidos crudos.

## 4. Frescura objetivo y comportamiento ante fallas

| Familia | Objetivo | Cómo se muestra |
|---|---|---|
| Ventas del día | ≤ 2 min | «Última lectura buena HH:MM (hace N)», con los estados de `frescura()` |
| Días cerrados | Día siguiente, 06:00 local | «Datos al cierre del DD-MMM» |
| Metas | Según la carga en Zoho; hoy, mensual | «Metas: Zoho · importadas DD-MMM». Mes sin metas → **«sin meta»**, no 0 |
| P.E. | Según la carga en Zoho; hoy sin 2026 | «Sin P.E. para el periodo» |

Fallas:
- **Zoho caído, token vencido o 6045:** ventas sin cambio; metas con la última lectura buena y su edad, con aviso.
- **POS parcial:** estado «parcial», como en Sucursales.
- Nunca se muestra una cifra en 0 por error de lectura.

## 5. Patrones del portal que se reutilizan

| Necesidad | Patrón |
|---|---|
| Módulo | `lib/portal/modulos.ts`, grupo `app/(analytics)/analytics/*`, `components/portal/navegacion.tsx` y `tarjetas-modulos.tsx` (evitar el nombre «Análisis», que ya existe en Costeo) |
| Sesión y acceso | `proxy.ts` (`private, no-store`), `lib/supabase/sesion.ts` y `perfil_modulos`. Agregar `'analytics'` es una migración del `check` y requiere aprobación |
| Alcance por sucursal | `perfil_sucursales` y `lib/sucursales/acceso.ts` (`resolverSucursal`, `sucursalesAccesibles`), con `autorizar()` antes de la caché |
| POS | `lib/sucursales/proveedor.ts`, `cache.ts` y `datos.ts` |
| Zoho | Cliente nuevo `server-only`: GET con lista cerrada, como `scripts/analytics/auditar-zoho.ts`; *job* de exportación y sondeo; límite de 60/min |
| Estados y gráficas | `components/sucursales/estados.tsx`, `graficas*.tsx` y la skill dataviz |
| Pruebas | vitest (`tests/portal`), pglite (`tests/db`) y `prueba:visual` |

## 6. Permisos

- La cuenta técnica de Zoho es **administradora de la organización** y lee todo el workspace. Ese alcance **no** pasa a los usuarios del portal: el servidor filtra por `perfil_sucursales` antes de serializar.
- Totales de red solo para el nivel que lo autorice (D4), porque un agregado revela ventas de terceros por diferencia.
- La exportación sale del servidor con el mismo filtro. No se usan URLs de Zoho.
- `ZOHO_ANALYTICS_*` y `THECOFFEE_API_TOKEN` solo en el servidor. Las respuestas llevan `private, no-store`.
- Scopes: con `metadata.read` + `data.read` basta para operar. **No pedir** `modeling.all`, porque escribe.

## 7. Cuotas y coste

| Concepto | Estimación | Base |
|---|---|---|
| Zoho, operación | < 30 u/día: metas cada hora, ~1 u por lectura, y `importdetails` 0.1 u | Plan Zoho One; el mínimo documentado es 1,000 u/día ⛔ (el cupo exacto no se ve por API) |
| Zoho, frecuencia | < 5 llamadas/min | Límite: 60/min metadatos, 40/min bulk |
| POS, sucursales del usuario | 1 lectura compartida por tienda y minuto mientras se ve | Igual que Sucursales |
| POS, red con D | ~60 GET por día de red, una vez por noche, más 7 días de reconciliación (~420 GET/noche) | Medido: 121 GET para 2 días de red |
| Supabase con D | ~119 × 365 × 3 canales ≈ 130 k filas/año; egress despreciable | — |
