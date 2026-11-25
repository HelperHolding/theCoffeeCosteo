# Tablero de Compras y descarga HTML/PDF de reportes — diseño

**Fecha:** 2026-11-25
**Origen:** el tablero «Gestión de Compras · Comercializadora» (`Gestion_Compras_Comercializadora_41.html`, datos de Zoho al 23 nov 2026), hoy generado fuera del portal, y la petición de bajar en HTML y PDF tanto ese tablero como el Reporte semanal de ventas (PR #217, ya en producción).
**Objetivo:** que el portal tenga el tablero de compras con filtros, siempre al día, y que ambos reportes se puedan descargar en HTML y PDF.

## 1. Alcance

1. **Descarga HTML y PDF** del Reporte semanal de ventas (`/comercializadora/reporte-semanal`) y del tablero de compras.
2. **Sincronización de compras** desde Zoho Books a Supabase (OCs, recepciones y venta semanal por categoría).
3. **Tablero de compras** `/comercializadora/compras` con filtros de periodo, categoría, proveedor y comprador.

**Fuera de alcance:** pagos a proveedores (el tablero mide mercancía recibida, no pagos), envío de los reportes por correo, edición de OCs.

**Orden de entrega (fases del plan):** 1) descarga del reporte de ventas; 2) sincronización; 3) tablero; 4) descarga del tablero.

## 2. Sincronización de compras

**Edge Function nueva `zoho-compras-sync`** (solo lectura: `zohoDesdeEnv({ soloLectura: true, tokenVar: "ZOHO_REPORTE_REFRESH_TOKEN" })`, autenticación `x-com-secreto`, `verify_jwt = false`). Corre cada 15 minutos (cron `com_invocar`, creado inactivo y activado tras el despliegue) y bajo demanda desde el tablero (editores), con enfriamiento de 10 minutos entre corridas. Por corrida: como máximo 60 detalles (20 de OCs, que pueden pedir sus recepciones), lotes de 4 con 4 s de pausa y 75 s de lectura; las marcas guardan el último `last_modified_time` y los ids de ese segundo (empates) y se escriben al terminar cada fase. Documentos que Zoho ya no tiene (404) se saltan; dos fallas seguidas avisan por correo. Registra cada corrida en `com_sync_log` (`proceso = 'zoho-compras-sync'`) con `registrar()`, y avisa por correo tras dos fallas seguidas como `zoho-sync`.

**Permisos del token:** `ZOHO_REPORTE_REFRESH_TOKEN` se regenera con `ZohoBooks.invoices.READ,ZohoBooks.salesorders.READ,ZohoBooks.creditnotes.READ,ZohoBooks.packages.READ,ZohoBooks.purchaseorders.READ`. (El reporte de ventas por artículo no se usa: viene sin IVA y no permite excluir clientes; ver «Venta semanal por categoría».)

**Tablas nuevas** (RLS: lectura con `com_puede_leer`; escritura solo service role):

| Tabla | Llave | Campos |
|---|---|---|
| `com_compras_oc` | `zoho_po_id` | `folio`, `proveedor`, `vendor_id`, `comprador` (`created_by_name`; vacío → «Sin comprador»), `emision` (`date`), `arribo` (campo personalizado `cf_fecha_de_arribo_esperada` «Fecha de Arribo Esperada»; `delivery_date` casi siempre viene vacío; puede ser null), `estado`, `received_status`, `moneda`, `total`, `monto_ins` (insumos con IVA, MXN), `por_categoria` jsonb {CAF, BEB, …, otros}, `es_registro` bool, `factura_previa` date null, `zoho_modificado` timestamptz, `actualizado_at` |
| `com_compras_recepcion` | `zoho_receive_id` | `zoho_po_id`, `folio_oc`, `fecha` (`receive_date`), `monto` (recibido con IVA, MXN), `por_categoria` jsonb |
| `com_compras_factura` | `zoho_invoice_id` | `fecha`, `cliente`, `estado`, `total`, `por_categoria_ci` jsonb (líneas por familia de SKU, con IVA), `zoho_modificado` |
| `com_compras_venta_semana` | `semana` (lunes) | `venta_total_ci` (igual al Reporte semanal: facturas no anuladas sin `excluir_ventas`), `facturas`, `por_categoria_ci` jsonb, `calculado_at` |
| `com_compras_sync_estado` | `id = 1` | `oc_modificado_hasta` y `factura_modificado_hasta` timestamptz (marcas incrementales) |

**Lectura incremental de OCs:** `GET /purchaseorders` ordenado por `last_modified_time` desde `oc_modificado_hasta` (primera corrida: desde 2026-07-01). Por cada OC nueva o modificada, `GET /purchaseorders/{id}` (líneas con `sku`, `rate`, `quantity`, `quantity_received`, `tax_percentage`; `purchasereceives[]` con fecha; `bills[]` con fecha). La marca avanza solo hasta la última OC procesada con éxito. Las listas siempre llevan `date_start` (OCs desde 2026-07-01; facturas, 16 semanas) y se ordenan por `last_modified_time` (verificado en Zoho el 25 nov).

**Reglas de cálculo al guardar:**
- **Categoría por familia de SKU:** `INS-CAF` Café, `INS-BEB` Bebidas, `INS-DES` Desechables, `INS-DEL` Delivery, `INS-BA` Barra (incluye bases frappé), `INS-LIM` Limpieza, `INS-FOD` Foods, `RTD-` RTD (Zoé Water, Perrier; verificado 25 nov); cualquier otro SKU → `otros` (no es insumo; cuenta en totales, no en categorías).
- **Montos con IVA:** `rate × cantidad × (1 + tax_percentage/100)`. OCs en moneda distinta de MXN: `monto_ins = 0` y no suman (como el tablero actual); se cuentan como OC.
- **Monto recibido por recepción:** líneas de la recepción × `rate` de la línea de la OC × IVA. Zoho sí da líneas por recepción (`GET /purchasereceives/{id}`, con `item_id`, `sku` y `quantity`; se relacionan con la línea de la OC por `item_id`; si Zoho niega ese endpoint al token, lo recibido según `quantity_received` va completo a la recepción más reciente y la corrida lo anota en avisos); se lee el detalle solo cuando la OC tiene más de una recepción; con una sola, lo recibido es `quantity_received` de cada línea.
- **OC de registro** (`es_registro`): arribo esperado más de 7 días antes de la fecha de la OC, o factura previa a la OC. No cuenta como OC elaborada ni en entregas; su mercancía tampoco cuenta como compra recibida.
- **Venta semanal por categoría:** de las **líneas de cada factura** (`GET /invoices/{id}`: `sku`, `item_total`, `tax_percentage`), con IVA por línea (`item_total × (1 + tax_percentage/100)`), sin facturas anuladas ni borrador ni clientes de `excluir_ventas` (Dodo Pizza, Compras The Coffee). Las facturas se leen de forma incremental por `last_modified_time` y se guardan en `com_compras_factura`; `com_compras_venta_semana` se recalcula desde ahí. Verificado el 25 nov contra el tablero para 16–22 nov: café 399,850, bebidas 213,405, desechables 279,340, delivery 43,885, barra 86,757, limpieza 22,101, foods 17,622, RTD 16,633 (exactos). La primera carga trae 16 semanas (unas 1,600 facturas): se completa en varias corridas (60 detalles cada 15 min). Solo se recalculan semanas dentro del periodo guardado.

## 3. Tablero de compras

**Ruta:** `/comercializadora/compras`, en el menú «Operación» junto a «Reporte semanal». Lectura de Comercializadora. La página lee solo Supabase (no Zoho).

**Filtros en la URL** (`?periodo=2026-11-16&categoria=CAF&proveedor=…&comprador=…`):
- Periodo: semanas (lunes a domingo) y meses (suma de las semanas que empiezan en ese mes), según el historial guardado. Por omisión, la semana cerrada anterior.
- Categoría: Todas, Café, Bebidas, Desechables, Delivery, Barra, Limpieza, Foods, RTD.
- Proveedor y comprador: valores presentes en `com_compras_oc`. Solo afectan indicadores de OCs y entregas (la venta no tiene proveedor).
- «Restablecer filtros».

**Indicadores** (cálculo puro en `supabase/functions/_shared/compras/`), cada uno con el periodo anterior:
1. **Venta** con IVA (Todas = total del Reporte semanal; categoría = insumos de esa categoría).
2. **Compras recibidas:** suma de recepciones con fecha en el periodo, sin OCs de registro.
3. **Compras / venta** con meta 45–55%: verde dentro, ámbar ±5 pp fuera, rojo más allá.
4. **OCs que llegaron en el periodo** (primera recepción en el periodo): cuántas se elaboraron en el mismo periodo y cuántas antes.
5. **Entregas a tiempo:** primera recepción ≤ arribo esperado; sin arribo esperado → «sin fecha» (no cuenta a favor ni en contra, se informa).
6. **Lead time promedio:** días naturales de emisión a primera recepción.
7. **Mayor compra del periodo:** proveedor con más compras recibidas y su monto.
8. **OCs vencidas sin recibir:** arribo esperado < hoy y sin recepción completa.
9. **Faltan por comprar:** total del plan de compra de esta semana.

**Gráfica:** venta, compras recibidas y presupuesto (50% de la venta) por semana, últimas 16 semanas, con la categoría elegida; SVG con valores al pasar el cursor.

**Plan de compra:** del motor del Plan de abastos (mismo cálculo de «Esta semana», `lib/comercializadora/estaSemana.ts` / `motorPlan`): artículos con estatus Compra Recurrente a pedir esta semana o la próxima. Tarjetas Urgentes (< 5 días), Pronto (5–10 días), Insumos por llegar. Tabla: urgencia, artículo/SKU, proveedor, decisión, inventario, días que alcanza, pedir y costo de esta y la próxima semana, fecha esperada de recepción (rojo si ya pasó). Responde a categoría y proveedor.

**Detalle plegable:** OCs por proveedor del periodo (elaboradas, monto, a tiempo, atrasadas, pendientes, lead time) y OCs por llegar con sus artículos.

**Encabezado:** hora de la última sincronización buena; aviso si tiene más de 36 h; botón «Sincronizar ahora» (editores, respeta el enfriamiento).

## 4. Descarga HTML y PDF

**Botón «Descargar»** (HTML / PDF) en ambas pantallas, junto a «Actualizar». Ventas: la semana elegida. Compras: la vista con los filtros elegidos, que se escriben en el encabezado del archivo.

**Plantillas de exportación** (funciones puras, una por reporte, en `lib/comercializadora/exportar/`): reciben los mismos datos calculados (`Reporte` de ventas; el modelo del tablero de compras) y devuelven un HTML completo:
- CSS propio incrustado, tema claro, tamaño carta, saltos de página entre secciones; sin JavaScript ni recursos externos.
- Listas plegables salen completas.
- Gráficas como SVG generado en el servidor.
- Encabezado con título, periodo, filtros y hora de lectura; pie con la nota de fuentes.

**Rutas:** `GET /comercializadora/reporte-semanal/descargar?semana=…&formato=html|pdf` y `GET /comercializadora/compras/descargar?<filtros>&formato=html|pdf`. Verifican la sesión de Comercializadora; usan los mismos datos (ventas: la caché de la función, sin forzar Zoho; compras: Supabase).
- `html`: `Content-Type: text/html`, `Content-Disposition: attachment; filename=…`.
- `pdf`: el mismo HTML impreso con `puppeteer-core` + `@sparticuz/chromium` (tamaño carta, márgenes 12 mm, encabezado/pie con número de página). `export const maxDuration = 60` en la ruta.

**Nombres:** `reporte-ventas-AAAA-MM-DD.{html,pdf}`; `compras-<periodo>-<categoria>[-<proveedor>][-<comprador>].{html,pdf}` (sin acentos ni espacios).

## 5. Errores

- **Sincronización:** una corrida que falla a la mitad guarda lo leído y no avanza la marca más allá de lo procesado; 429 → reintento con espera (cliente Zoho); nunca escribe en Zoho; dos fallas seguidas → correo.
- **Tablero:** sin sincronización previa → mensaje claro y botón para sincronizar (editores). Sincronización de más de 36 h → aviso. Si el plan de compra falla (motor sin datos), esa sección muestra el error y el resto sale.
- **Valores no reconocidos:** SKU sin familia → `otros`; comprador vacío → «Sin comprador»; nunca se descartan.
- **Descargas:** si Chromium falla, la pantalla muestra el error y ofrece el HTML; si el reporte de ventas no tiene copia en caché, la descarga lo lee como la pantalla.

## 6. Pruebas

- Cálculos puros (Deno): categoría por SKU, montos con IVA y moneda, OC de registro, primera recepción, a tiempo, lead time, meses, indicadores, semáforo de la meta.
- **Paridad** contra `Gestion_Compras_Comercializadora_41.html`: su `__DATA__` trae por semana `vt_ci`, `vc_*`, `rx_tc_ci`, `rxc_*`, `oc_n`, `oc_ins`, `reg_n` y las tablas `ocs_proveedor` y `entregas_oc`. Se capturan de Zoho las OCs, recepciones y ventas por artículo de esas 16 semanas (fixture en `_shared/pruebas/`) y se compara semana por semana. Cada diferencia se explica aquí, en §7, antes de aceptarla (incluida la aplicación del IVA por artículo).
- Plantillas de exportación (Vitest): cada sección presente, listas completas, nombre de archivo, sin `<script>`.
- Navegador: descarga HTML y PDF de ambos reportes; el PDF abre y tiene las páginas esperadas; tablero en escritorio, celular (375 px) y modo oscuro.

## 7. Diferencias de paridad

Fixture `supabase/functions/_shared/pruebas/compras-2026-11.json` (capturado el 25 nov: facturas del 9 al 22 nov; OCs con fecha o recepción en esas semanas). Contra el tablero, semana 16–22 nov:

- Venta: total 1,193,333.39 y las 8 categorías exactas.
- Compras recibidas sin OCs de registro: 477,634 exacto; por categoría con diferencia máxima de un peso por redondeo (limpieza 10,604.6 vs 10,604).
- OCs elaboradas 20 y de registro 2, exactas **excluyendo borradores** (`status = draft`): el tablero no cuenta las OCs en borrador. El tablero (fase 3) aplica la misma regla.
- Hallazgo: el arribo esperado está en `cf_fecha_de_arribo_esperada`; con `delivery_date` ninguna OC salía de registro y las compras recibidas sumaban 44,799 de más (COM-OC-01263 y otras con arribo anterior a la OC).
