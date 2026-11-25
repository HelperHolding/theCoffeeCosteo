# Reporte semanal de la Comercializadora en el portal — diseño

**Fecha:** 2026-11-25
**Origen:** el reporte HTML «Reporte Semanal · The Coffee · 16–22 Nov 2026» (Ventas · Supply Chain), que hoy se arma a mano con datos de Zoho Books.
**Objetivo:** que el portal genere ese reporte para cualquier semana, en vivo desde Zoho Books, sin trabajo manual.

## 1. Alcance

Una pantalla nueva **Comercializadora → Reporte semanal** (`/comercializadora/reporte-semanal`) con las secciones del reporte actual:

1. Ventas de la semana (total, top clientes, tendencia de 5 semanas por tipo de envío)
2. Calidad de surtido (5 indicadores contra meta + incidencias por origen)
3. Atención al cliente · incidencias abiertas
4. Notas de crédito de la semana
5. Saldos de sucursales propias
6. Saldos de clientes externos (con créditos activos y deuda interna aparte)
7. Aperturas

**Fuera de alcance:** la línea «Falta abonar $X» (cálculo manual, se quita); el nombre de la persona en el encabezado; enviar el reporte por correo; exportar a PDF.

## 2. Arquitectura

- **Edge Function nueva `zoho-reporte-semanal`** (solo lectura, `soloLectura: true` en `ZohoClient`). Usa `_shared/zoho.ts` y los secretos `ZOHO_*` que ya usa `zoho-sync`; se autentica con `x-com-secreto` como las demás (`verify_jwt = false` en `config.toml`). Recibe `{ semana: 'YYYY-MM-DD' (lunes), forzar?: boolean }` y devuelve el reporte calculado (JSON).
- **Cálculo puro** en `supabase/functions/_shared/reporteSemanal.ts`: recibe lo leído de Zoho + configuración + fecha de corte y devuelve el reporte. Sin E/S, probado en Deno.
- **Portal:** `invocarFuncion('zoho-reporte-semanal', …)` (se agrega a `FuncionCom`) desde la página servidor; componentes en `components/comercializadora/reporte-semanal.tsx`; entrada de menú en `components/portal/navegacion.tsx` junto a «Esta semana». Permisos: los de lectura de Comercializadora.
- **Caché:** tabla `com_reporte_semanal_cache (semana date pk, datos jsonb, leido_en timestamptz)`. La función devuelve la copia guardada si tiene < 15 min, salvo `forzar`. Botón «Actualizar» → `forzar: true`.
- **Foto de saldos:** tabla `com_reporte_saldos (semana date pk, externos numeric, creditos_activos numeric, interna numeric, guardado_en timestamptz)`. La primera lectura de cada semana guarda la foto de saldos «al día de hoy» para la semana en curso; el reporte de la semana N muestra «era $X» con la foto de la semana N−1. Si no existe, la línea no se muestra.
- RLS: lectura para quien tenga `com_puede_leer`; escritura solo desde la función (service role).

## 3. Fuentes en Zoho Books (org Nueva COMERCIALIZADORA THE COFFEE)

Verificado el 2026-11-24 con lecturas de la API.

| Dato | Endpoint | Campos |
|---|---|---|
| Ventas | `GET /invoices?date_start&date_end` (paginado) | `invoice_number`, `reference_number` (= OV), `date`, `due_date`, `customer_name`, `total`, `balance`, `status`, `cf_sucursal`, `cf_tipo_de_envio` (Ordinario / Llenado de canal / Apertura) |
| Envíos | `GET /packages?date_start&date_end` | `salesorder_number`, `shipment_date`, `status` |
| OVs | `GET /salesorders?date_start&date_end` | `salesorder_number`, `date`, `customer_name`, `cf_sucursal`, `cf_tipo_de_envio`, `cf_tipo_de_incidencia`, `cf_resoluci_n`, `shipped_status`, `delivery_method` |
| Descripción incidencia | `GET /salesorders/{id}` solo para OVs con incidencia | `custom_fields[cf_descripci_n_incidencia]`, `packages[]` |
| Notas de crédito | `GET /creditnotes?date_start&date_end` + detalle | `creditnote_number`, `customer_name`, `date`, `total`, `line_items[].description` |
| Saldos | `GET /invoices?filter_by=Status.Unpaid` (incluye vencidas, paginado) | `balance`, `date`, `due_date`, `customer_name`, `cf_sucursal`, `cf_tipo_de_envio` |

Valores vistos: `cf_tipo_de_incidencia` ∈ {«Sin stock - Pedido incompleto», «Pedido Incompleto», «Derrame de Produto»}; `cf_resoluci_n` ∈ {«En Proceso», «Resuelto»}. Sucursales propias = clientes cuyo nombre empieza con «SUCURSALES THE COFFEE».

Comprobación: semana 16–22 nov en Zoho = 98 facturas / $1,194,726; el reporte = 97 / $1,193,333 tras excluir Dodo Pizza y Compras The Coffee.

Presupuesto: ~60–80 llamadas por lectura completa (la mayor parte son detalles de OVs con incidencia). Zoho limita 100/min por org y se comparte con `zoho-sync` y la creación de OCs; de ahí la caché.

## 4. Reglas de cálculo

Semana = lunes a domingo. Exclusiones y agrupaciones salen de la configuración (§5).

**4.1 Ventas.** Facturas no anuladas (`status ≠ void`) con fecha en la semana, con IVA, sin `excluir_ventas`. Sin IVA ≈ total / 1.16. Pedidos = número de facturas. Top 9 clientes: agrupando `corporativo_ap` como «Corporativo AP (MJA + SEJ)» y todas las sucursales propias como «The Coffee Sucursales»; debajo, los valores distintos de `cf_sucursal`. Tendencia: 5 semanas terminando en la elegida, total y desglose por `cf_tipo_de_envio`; variación vs semana anterior (total y solo Ordinario) y vs promedio de las 5.

**4.2 Calidad de surtido.** Universo = OVs cuyo **primer** paquete tiene `shipment_date` en la semana, más OVs de la semana con incidencia aunque no hayan salido; sin `excluir_ventas` y sin OVs de reposición de incidencias de semanas anteriores (OV con referencia a otra OV — se detecta en implementación; si no se puede distinguir, se documenta).
- Fill rate = OVs sin incidencia de faltante (stock o pickeo) / OVs del universo. Meta ≥98%.
- Faltante por stock = OVs con «Sin stock - Pedido incompleto» / universo. Meta ≤1%.
- Precisión de pickeo = 1 − OVs con «Pedido Incompleto» / universo. Meta ≥98%.
- Calidad física = OVs con incidencia de paquetería («Derrame…», extravío, daño) / universo. Meta ≤1%.
- Envío ≤2 días hábiles: solo clientes externos, sin aperturas; días hábiles entre `date` de la OV y el primer `shipment_date`. Meta 100%. Se listan las que exceden.
- Incidencias por origen (conteo y %) y tabla de todas: OV, sucursal, origen, estatus.

**4.3 Atención al cliente.** OVs con incidencia y estatus «En Proceso» (cualquier fecha) + las «Resuelto» cuya OV es de la semana. Separadas en sucursales propias / clientes externos, agrupadas por semana de la OV (más reciente primero), con sucursal, cliente, OV, tipo, estatus y descripción.

**4.4 Notas de crédito.** Las de la semana: folio, cliente, `cf_sucursal` si existe, descripción (primera línea con texto), total; suma.

**4.5 Saldos sucursales propias.** Facturas con `balance > 0` de sucursales propias, sin `excluir_saldos_sucursales` (Polanco). Por sucursal: dentro de crédito (no vencida), fuera de crédito con fecha 2026, pre-2026. Totales y número de facturas abiertas. Top 11 visibles, resto en «Ver todas».

**4.6 Saldos clientes externos.** Facturas con `balance > 0` de clientes no propios, sin `excluir_saldos` (Seinomarin, Dodo Pizza) ni deuda interna. Por cliente: fecha de la factura más antigua, días desde ella, saldo, y cuánto del saldo es Llenado de canal («100% llenado canal» si todo). Créditos activos (`creditos_activos`: cliente + texto) van en su bloque. Deuda interna (`deuda_interna`) en su bloque. Totales y «era $X la semana pasada» desde la foto.

**4.7 Aperturas.** OVs con `cf_tipo_de_envio = Apertura` sin enviar, o con fecha o primer envío en la semana: sucursal, cliente, fecha OV, estatus de envío. La apertura estimada no existe en Zoho y queda fuera.

## 5. Configuración

Tabla propia `com_reporte_config (id = 1, config jsonb, actualizado_por, actualizado_at)`, **no** `com_plan_config`: `mergeCfg` del plan descarta claves desconocidas y cualquier cambio fuera de imp/cafe/kpi dispara el recálculo del motor. Se edita en un panel «Configuración del reporte» dentro de la misma pantalla, solo con `com_puede_editar`. Valores iniciales:

- `excluir_ventas`: [«DODO PIZZA», «Compras The Coffee»]
- `corporativo_ap`: [«OPERADORA DE FRANQUICIAS MJA», «OPERADORA DE CAFETERIAS SEJ»]
- `excluir_saldos`: [«SEINOMARIN PROJECTS», «DODO PIZZA»]
- `excluir_saldos_sucursales`: [«Polanco»] (se compara contra la Sucursal y contra el cliente)
- `deuda_interna`: [«MARKETING», «OFICINA PRINCIPAL», «Compras The Coffee»]
- `creditos_activos`: [{cliente, sucursal, nota}] — se identifican por factura (cliente + Sucursal; Sucursal vacía = todas las del cliente), porque un mismo cliente puede tener saldo normal y crédito activo (Tandem).
- `metas`: fill 98, stock 1, pickeo 98, fisica 1, envio 100 (%), `dias_envio` 2.
- `dias_incidencias`: 60 (antigüedad máxima de las OVs con incidencia abierta que se leen).

Los nombres se comparan sin mayúsculas, acentos ni espacios sobrantes. Cambiar la configuración invalida la caché (la función ignora copias leídas antes de `actualizado_at`). Días hábiles = lunes a viernes, sin feriados.

## 6. Errores

- Zoho falla o rate limit: se muestra la copia en caché con aviso «datos de hace X min; Zoho no respondió»; sin copia, error claro como en Indicadores.
- Lecturas por sección: si falla una (p. ej. notas de crédito), esa sección muestra «no se pudo leer» y las demás salen.
- Valores no reconocidos de tipo de incidencia / envío / sucursal → «Sin clasificar», nunca se descartan.
- Pie de página: hora de lectura y «las incidencias se capturan días después de la entrega; estas cifras pueden moverse».

## 7. Pruebas

- `reporteSemanal_test.ts` (Deno) con datos de ejemplo por regla.
- Prueba de paridad con una copia anonimizada de lo que Zoho devuelve para la semana 16–22 nov 2026 (`_shared/pruebas/`): debe dar $1,193,333 / 97 pedidos, fill rate 53.5%, 34 incidencias (29/4/1), NC $3,357.73, saldos externos $213,637.69. Cada diferencia se explica en este documento antes de aceptarla (ej. CN-00205/206 son del 23 nov y quedan fuera).
- Revisión de la pantalla en el navegador contra el HTML original: claro, oscuro y ancho de celular.

### Diferencias explicadas de la paridad (captura del 25 nov contra el reporte del 23 nov)

El archivo `_shared/pruebas/reporte-2026-11-16.json` se capturó el 25 nov; el reporte a mano se armó el 23 nov. Ventas (97 pedidos, $1,193,333, las 5 semanas, top 1) y notas de crédito cuadran sin ajustes. La captura no incluye saldos (`pendientes`), por eso no hay prueba de saldos. En surtido, las reglas dan exactamente 71 enviados / 33 con faltante / 34 incidencias (29/4/1) / universo de envío 55 con 54 en meta, **si se deshacen estos cambios de datos posteriores al reporte** (`paridad_test.ts` los deshace explícitamente y además fija lo que da la captura tal cual: 68 / 32 / 33, 26/6/1, universo 54):

1. **Incidencias capturadas después del 23 nov** (el propio reporte avisa que las incidencias «se capturan días después de la entrega»). Hoy tienen incidencia y el reporte a mano no las contó: COM-OV-04806 y COM-OV-04808 (MOP Ventures, «Pedido incompleto», enviadas el 20 nov), COM-OV-04945 (Ruben Dario) y COM-OV-04949 (Parque las Antenas, apertura), estas dos «Sin stock» y sin paquete. Sin ellas, pickeo queda en 4 y stock baja en 2.
2. **Paquete con envío el 23 nov**: COM-OV-04934, 04940 y 04941 (OV del 20 nov, «Sin stock») hoy tienen paquete con envío el 23 nov. Al hacer el reporte aún no salían y entraron por la regla «incidencia de la semana aunque aún no salga»; con el paquete registrado, su primer envío cae en la semana siguiente y salen de esta (entrarán en la del 23–29 nov).
3. **COM-OV-04803 (Durango Centro) y COM-OV-04814 (Ventura)**: el reporte a mano tomó como primer envío el 18 y el 19 nov. La captura trae además un paquete con envío el 14 nov para cada una, anterior a la semana, por lo que la regla «primer envío» las deja fuera. El reporte a mano muestra 04803 como «12 nov → 18 nov, 4 días», así que no vio el paquete del 14 nov (registrado o fechado después). Desde la captura no se pudo comprobar cuándo se creó ese paquete.
4. **Sin identificar**: la distribución de días de envío da [8, 24, 22, 1] contra [8, 25, 21, 1] del reporte a mano: un pedido foráneo cuenta 2 días hábiles hoy y el reporte a mano lo contó con 1. El reporte solo lista el que está fuera de meta, así que no se puede señalar el folio; el universo (55) y los pedidos en meta (54) sí coinciden.
