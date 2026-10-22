# 09 · Plan de la fase E (Sucursales: estandarización y tendencias)

Fecha: 2026-10-22. Estado de partida:

- **Fase D** terminada en local (ver 08): En vivo, Productos y Pedidos para la 612, permisos preparados.
- **Rediseño aplicado al portal completo:** colores de datos validados (skill dataviz) y tema «muro de sucursal».
- Nada desplegado.

## 0. Prerrequisito: habilitar la fase D en producción (requiere tu autorización)

Sin esto nadie puede usar Sucursales con datos reales. Los pasos exactos están en 08 § «Pasos para habilitar».

| Paso | Qué | Quién decide |
|---|---|---|
| 0.1 | Commit, push y PR de `feat/sucursales-en-vivo` (Sucursales + colores + tema), con preview en Vercel | Carlo autoriza el push/PR |
| 0.2 | `THECOFFEE_API_TOKEN` en Vercel (Production y Preview, solo servidor) | Carlo (o con su OK) |
| 0.3 | Migración `20261022000020_sucursales_acceso.sql` en Supabase de producción | Carlo autoriza |
| 0.4 | Accesos: qué personas ven Sucursales y la 612 | Carlo define la lista |
| 0.5 | Recorrido real en el preview (login → Inicio → Costeo → CRM → Sucursales) y merge a `main` | Revisión conjunta |

## 1. Objetivos de la fase E

1. **Tendencias** de la sucursal: semanas y horarios en periodos cerrados, con el mismo contrato y las mismas fórmulas que En vivo.
2. **Estandarizar el alta de sucursales.** Pasar de 1 a N tiendas sin código nuevo: configuración validada (identidad, zona horaria, moneda) y asignación de accesos.
3. **Directorio útil:** ver de un vistazo cómo van hoy las sucursales accesibles, sin cargar el historial de todas.
4. **Decidir con datos** si hace falta persistir pedidos (hoy todo es bajo demanda).

## 2. Entregables propuestos

### E1 · Pestaña «Tendencias» (por sucursal)

- **Periodos:** últimas 4 semanas cerradas, con selector de 8 o 12 semanas. Se cortan en lunes–domingo locales.
- **Gráficas** (misma paleta: hoy y actual en azul, comparación en gris):
  - Venta y pedidos por semana, cada semana contra la anterior. Columnas con la variación etiquetada.
  - **Mapa de calor día × hora** (pedidos promedio por hora). Rampa secuencial azul, con su tabla.
  - Ticket promedio por semana (línea).
  - Mezcla de pago y de origen por semana (barras apiladas al 100 %).
  - Descuentos: monto y % del precio de lista por semana.
- **Datos:**
  - Una ventana cerrada por semana, cada una con caché de 6 h y entradas independientes.
  - 4 semanas ≈ 3,000 pedidos ≈ 6–8 GET de 500. En frío tarda unos 10 s; luego es inmediato.
  - Se muestra el avance por semana («3 de 4 semanas leídas») y nunca una semana incompleta como si fuera completa.
- **Pruebas:**
  - Fronteras de semana con el cambio de horario del 1-nov.
  - Mapa de calor con días sin datos (vacío, no cero).
  - Conciliación por semana.

### E2 · Alta estandarizada de sucursales

- **Asistente de configuración (script CLI + revisión manual):**
  1. Lee `/company/list/all` y `crm_tiendas`.
  2. Propone vínculos `lookerStoreId = numero_tienda_jestor` (82 tiendas del CRM tienen número Jestor).
  3. Propone la zona IANA por ciudad/estado:
     - Chihuahua/Juárez → `America/Ciudad_Juarez`;
     - Sonora → `America/Hermosillo`;
     - Baja California → `America/Tijuana`;
     - Quintana Roo → `America/Cancun`;
     - resto → `America/Mexico_City`.
  4. Para cada candidata hace **1 lectura de 1 día cerrado** y valida:
     - identidad;
     - horas de pedidos plausibles (apertura/cierre);
     - `fueraDeVentana = 0`;
     - gross = líneas + customs.
  5. Genera un reporte para aprobar. Solo las aprobadas entran a `config.ts` (o a una tabla `sucursales_api`, ver E4).
- **Segunda sucursal de validación** (decisión de Carlo; ver § 4). Idealmente una que:
  - esté en **otra zona horaria** (p. ej. Tijuana o Cancún), para comprobar el modo de `createdAt`;
  - y/o tenga **Rappi = true** en el CRM, para resolver si Rappi llega por este endpoint.
- **Accesos:** script de asignación (SQL generado para revisar) por persona y company_id. Sin pantalla de administración en esta fase.

### E3 · Directorio con «hoy»

- Cada tarjeta del directorio muestra venta y pedidos de hoy, la hora del último pedido y la frescura.
- Reutiliza la lectura de «hoy» de En vivo (caché de 45 s), que se comparte entre usuarios ya autorizados.
- **Límite:**
  - la lectura de hoy solo se pide para las sucursales asignadas al usuario, con un máximo de 12 a la vez;
  - si tiene más, se paginan y se cargan bajo demanda;
  - nunca se leen pedidos de sucursales no asignadas.
- Orden por nombre. Opción de ordenar por venta de hoy, siempre con la cobertura visible (no es un ranking oficial).

### E4 · Decisión de persistencia (documento + prueba de carga acotada)

Medir con 3–5 sucursales configuradas: latencia, errores, 429 y tiempo de Tendencias en frío.

**Recomendación** (a confirmar con la medición): seguir bajo demanda mientras haya ≤ 10 sucursales activas y no existan vistas consolidadas.

Persistir cuando ocurra cualquiera de estos casos:
- comparativos entre muchas sucursales;
- historial de más de 12 semanas que deba cargar rápido;
- más de 3 s de Tendencias en caliente;
- límites del proveedor.

Diseño previsto si se persiste:
- tablas `pos_pedidos`, `pos_lineas` y `pos_customs` con upsert por id;
- sincronización programada que relee los últimos 3 días;
- bitácora de lecturas;
- RLS por company asignada.

Requiere autorización de infraestructura (migraciones + cron).

### E5 · Pendientes con The Coffee Brasil (en paralelo, sin código)

Enviar las 6 preguntas de 06 (zona de `createdAt`, moneda, unidades por línea, Rappi, `refundId`/devoluciones, límites e historial).

Hasta que respondan:
- las etiquetas «estimado» y «hipótesis» se quedan;
- el **2-nov** se revisa la piloto para confirmar que la hora de los pedidos siga siendo coherente tras el cambio de horario.

## 3. Orden y dependencias

| Orden | Trabajo | Depende de | Puede ir en paralelo con |
|---|---|---|---|
| 1 | Fase 0: habilitar D en producción | Tu autorización | E1, E5 |
| 2 | E1 Tendencias | — (local) | E2, E5 |
| 3 | E2 Alta estandarizada + 2.ª sucursal | Elegir la sucursal | E1 |
| 4 | E3 Directorio con hoy | E2 (≥ 2 sucursales) | — |
| 5 | E4 Medición y decisión de persistencia | E2 con 3–5 sucursales | — |

## 4. Decisiones que necesito

1. **Habilitación (fase 0):**
   - ¿Autorizas push/PR, la carga del token en Vercel y la migración en producción?
   - ¿Quiénes tendrán acceso a Sucursales y a la 612?
2. **Segunda sucursal:** ¿una en otra zona horaria, una con Rappi, o una que tú prefieras por operación?
3. **Tendencias:** ¿4 semanas por defecto (rápido) o 12 semanas (más contexto, ~25 GET en frío)?
4. **Persistencia:** ¿de acuerdo con medir primero (E4) y decidir con datos?

## 5. Criterios de salida de la fase E

- Tendencias:
  - concilia por semana con una extracción independiente;
  - muestra la cobertura;
  - pasa la prueba del cambio de horario.
- Al menos 2 sucursales configuradas con validación documentada (identidad, zona, cuadre).
- Directorio con «hoy» sin leer sucursales no asignadas; pruebas de aislamiento.
- Documento E4 con mediciones y decisión.
- Costeo, CRM y el tema visual sin regresiones; build y pruebas en verde.
