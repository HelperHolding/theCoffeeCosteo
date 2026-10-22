# 10 · Resultado de la fase E (en curso)

Fecha: 2026-10-22. Rama `feat/sucursales-fase-e`, creada encima de `feat/sucursales-en-vivo` (PR #11).

## Fase 0 · Habilitación en producción (autorizada por Carlo)

| Paso | Estado |
|---|---|
| PR #11 (Sucursales + colores + tema) | Abierto: https://github.com/sebascm0906/theCoffeeCosteo/pull/11 |
| `THECOFFEE_API_TOKEN` en Vercel | **Lo carga Carlo** (Production y Preview, solo servidor, nombre exacto) |
| Migración 20 en Supabase de producción | ✅ Aplicada en una transacción y registrada en `supabase_migrations.schema_migrations` (versión 20261022000020). Verificado: CHECK `('crm','sucursales')`, políticas `lectura` y `sucursales_sin_oauth`, solo `SELECT` para `authenticated` |
| Accesos | ✅ Solo Carlos Valencia y Sebastián Cervera (admin), módulo `sucursales` (nivel desarrollador), sucursales **612** y **583**. Areli (admin) no tiene acceso, por instrucción |

## E1 · Tendencias ✅ (local)

- Nueva pestaña **Tendencias**:
  - Semanas cerradas de lunes a domingo, en hora local. Por defecto 4; opciones de 8 y 12.
  - Gráficas: venta por semana (columnas), ticket por semana (línea) y mapa de calor día × hora (rampa azul de un tono, con tabla).
  - Formas de pago y origen por semana (filas apiladas, colores fijos por entidad).
  - Detalle por semana: variación, descuentos y % del precio de lista.
- **Reglas:**
  - Cada semana es una lectura independiente con su propia caché.
  - Una semana incompleta se dibuja rayada y rotulada «parcial», y queda fuera de totales, mapa y variaciones.
  - En el mapa, `0` significa sin pedidos y `null` significa sin datos.
- **Archivos:**
  - `app/api/sucursales/[companyId]/tendencias/route.ts`
  - `lib/sucursales/{metricas,datos,contratos}.ts`: `semanasCerradas`, `conteoDiaHora`, `construirTendencias`
  - `components/sucursales/{tendencias,graficas-tendencias}.tsx`
- **Pruebas:**
  - fronteras de semana, incluido el cambio de horario del 1-nov;
  - semana incompleta;
  - `null` frente a 0;
  - filtro de origen;
  - permisos con cero llamadas al proveedor;
  - UI (cobertura, «parcial», cambio de clave sin datos residuales).

## E2 · Alta estandarizada ✅ + 2.ª sucursal: **Bonampak (583)**

### Herramienta

`scripts/sucursales/validar-sucursal.ts` usa el mismo pipeline del portal sobre 1 día cerrado. Revisa:

- identidad;
- cobertura y horario;
- cuadre gross = líneas + customs;
- pedidos fuera de ventana;
- campos, métodos y tipos de pago no vistos en la piloto.

Devuelve el veredicto APTA o REVISAR.

### Cruce CRM ↔ API

De 82 tiendas con número Jestor, **76** coinciden con un `lookerStoreId` de la API.

### Candidatas evaluadas (día cerrado 2026-10-21)

| Sucursal (API) | Zona | Pedidos | Hallazgo |
|---|---|---|---|
| Tijuana (613) | America/Tijuana | 8 | Muy poco volumen; primer pedido a las 14h. No sirve para validar la zona |
| Polanco (545) | America/Mexico_City | 105 | CRM marca **Rappi = true**, pero no hay campos ni métodos de pago nuevos (22 de App, 83 de mostrador). **Evidencia de que Rappi no llega por este endpoint** (1 día, 1 tienda) |
| Malecón Cancún (644) | America/Cancun | 63 | APTA, solo mostrador |
| **Bonampak (583)** | America/Cancun | 47 | **APTA** · mostrador + App · cuadra al centavo |

### Zona horaria de `createdAt` (evidencia nueva)

A las 19:33 UTC (14:33 en Cancún, 13:33 en CDMX y Juárez), el último pedido de Bonampak marcaba **13:40**.

- Si fuera hora de CDMX o del servidor, sería un pedido 7 minutos en el futuro.
- Solo es coherente como **hora local de Cancún**.

Junto con la piloto (Juárez), la evidencia indica que **`createdAt` es la hora local de cada tienda**. Por eso la zona va configurada por sucursal (`config.ts`). Sigue pendiente la confirmación del proveedor.

### Redondeo del proveedor (hallazgo nuevo)

En pedidos con % de descuento en productos y personalizaciones, el total (`grossAmount`) viene **1 centavo** arriba de la suma de líneas. Ejemplo real: 61.20 + 11.70 → 72.91.

- La venta oficial sigue siendo `grossAmount`.
- La conciliación ahora distingue «redondeo del proveedor (±1 ¢ por pedido)» de un descuadre real (`soloRedondeo`).
- Casos observados:
  - Polanco: 5 ¢ en 5 pedidos.
  - Bonampak: 2 ¢ en 4 semanas.
  - 612: 41 ¢ en 12 semanas.

## E3 · Directorio con «hoy» ✅ (local)

- Cada tarjeta muestra venta, pedidos, variación contra el mismo día de la semana anterior y la hora del último pedido.
- Se refresca cada 60 s.
- Reusa la ruta En vivo de esa sucursal (misma autorización y caché de 45 s).
- Máximo 12 tarjetas con «hoy»; las demás se abren bajo demanda.
- Un error se muestra como «Sin datos de hoy (error de lectura, no es venta cero)».

## E4 · Medición y decisión de persistencia ✅

Datos reales del 2026-10-22, medidos con `scripts/sucursales/medir.ts`:

| Sucursal | En vivo frío / caliente | Tendencias 4 sem. frío / caliente | Tendencias 12 sem. frío / caliente | Cobertura |
|---|---|---|---|---|
| 612 Cd. Juárez | 2.4 s / 0 ms | ~4 s / <20 ms | 12.3 s (8,794 pedidos) / 12 ms | 12/12 semanas completas |
| 583 Bonampak | 2.6 s / 0 ms | 2.6 s (1,061 pedidos) / 2 ms | — | 4/4 completas |

Sin 429 ni errores en las lecturas.

**Decisión: seguir bajo demanda** (sin tablas de pedidos ni cron). Se revisa si ocurre cualquiera de estos casos:

- más de 10 sucursales activas;
- vistas consolidadas entre tiendas;
- Tendencias de 12 semanas usado con frecuencia (12 s en frío);
- aparecen límites del proveedor.

**Riesgo conocido:** en Vercel la caché vive por instancia, así que un arranque en frío repite la lectura.

## Pendiente

- Carlo: token en Vercel y recorrido del preview del PR #11; luego merge.
- PR de esta rama (fase E) encima del #11.
- Proveedor: confirmar zona horaria, moneda, unidades, Rappi, `refundId` y límites.
- 2-nov: revisión tras el cambio de horario (Juárez pasa a UTC−7; Cancún no cambia).
