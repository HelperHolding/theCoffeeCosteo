# Inventario de tablas de thecoffeemexico (bliocjvq)

Generado el 2026-11-12 con `scripts/migracion-legado/inventario.ts`. "Lee" y "Escribe" salen del código del repo
thecoffee-comercializadora; n8n y Apps Script que escriben por API no aparecen. La columna **Cruce con el portal**
se llena a mano (por ejemplo: `crm_prospectos` ↔ `crm_*` del portal).

| Área | Tabla | Filas | RLS | Lee | Escribe | Cruce con el portal |
| --- | --- | --- | --- | --- | --- | --- |
| Aperturas | `aperturas` | 135 | sí | app, edge:com-minmax | app |  |
| Aperturas | `franquiciado_aperturas` | 103 | sí | app | app |  |
| Aperturas | `pedidos_apertura` | 12 | sí | app, edge:com-minmax | app |  |
| Chat | `chat_conversaciones` | 15 | sí | app | app |  |
| Chat | `chat_leidos` | 18 | sí | app | app |  |
| Chat | `chat_mensajes` | 10 | sí | app | app |  |
| Comercializadora | `com_catalogo` | 267 | sí | app, edge:_shared, edge:com-minmax, edge:zoho-sync | app, edge:zoho-sync |  |
| Comercializadora | `com_catalogo_costo_historial` | 28 | sí | — | app |  |
| Comercializadora | `com_credito_abonos` | 0 | sí | app | app |  |
| Comercializadora | `com_kit_apertura` | 164 | sí | edge:com-minmax | app, edge:com-minmax |  |
| Comercializadora | `com_lead_times` | 264 | sí | app, edge:com-minmax, edge:zoho-sync | app, edge:zoho-sync |  |
| Comercializadora | `com_minmax` | 159 | sí | app, edge:_shared | app, edge:com-minmax |  |
| Comercializadora | `com_movimientos` | 9298 | sí | app, edge:zoho-sync | app, edge:zoho-sync |  |
| Comercializadora | `com_oc_auto` | 356 | sí | app, edge:_shared, edge:zoho-generar-oc | edge:zoho-generar-oc |  |
| Comercializadora | `com_pago_proyectado` | 616 | sí | edge:zoho-generar-oc | edge:com-minmax |  |
| Comercializadora | `com_parametros` | 5 | sí | app | — |  |
| Comercializadora | `com_plan_config` | 1 | sí | app, edge:_shared | app |  |
| Comercializadora | `com_plan_config_historial` | 19 | sí | app | app |  |
| Comercializadora | `com_proveedor_cierre` | 1 | sí | app, edge:_shared | app, edge:com-minmax |  |
| Comercializadora | `com_proveedores` | 0 | sí | app | app |  |
| Comercializadora | `com_sku_mapping` | 262 | sí | app, edge:com-minmax | app |  |
| Comercializadora | `com_sync_cambios` | 152 | sí | edge:zoho-sync | edge:zoho-sync |  |
| Comercializadora | `com_sync_log` | 532 | sí | app, edge:com-minmax, edge:zoho-generar-oc, edge:zoho-sync | edge:_shared |  |
| Comercializadora | `com_zoho_oc_lineas` | 117 | sí | edge:_shared, edge:zoho-sync | edge:zoho-sync |  |
| Comercializadora | `com_zoho_proveedor` | 140 | sí | edge:com-minmax | edge:zoho-sync |  |
| CRM prospectos | `crm_prospecto_notas` | 83 | sí | app | app |  |
| CRM prospectos | `crm_prospecto_recordatorios` | 0 | sí | app | app |  |
| CRM prospectos | `crm_prospectos` | 68 | sí | app | app |  |
| Encuestas | `encuesta_envios` | 0 | sí | app | app |  |
| Encuestas | `encuesta_respuestas` | 0 | sí | app | app |  |
| Encuestas | `encuestas` | 0 | sí | app | app |  |
| Marketing | `campanas` | 0 | sí | app | app |  |
| Marketing | `campanas_respuestas` | 0 | sí | app | app |  |
| Marketing | `marketing_gastos` | 0 | sí | app | app |  |
| Marketing | `marketing_propuestas` | 0 | sí | app | app |  |
| Marketing | `marketing_proyectos` | 0 | sí | app | app |  |
| Pedidos | `pedido_incidencias` | 128 | sí | app | app |  |
| Pedidos | `pedidos` | 1696 | sí | app, edge:com-minmax | app |  |
| Por asignar | `app_config` | 2 | sí | app | app |  |
| Por asignar | `audit_log` | 21 | sí | app | app |  |
| Por asignar | `avisos` | 0 | sí | app | app |  |
| Por asignar | `bitacora_evidencias` | 0 | sí | app | app |  |
| Por asignar | `bitacora_operativa` | 0 | sí | app | app |  |
| Por asignar | `comentarios` | 86 | sí | app | app |  |
| Por asignar | `comunicado_comentarios` | 0 | sí | app | app |  |
| Por asignar | `comunicado_leidos` | 0 | sí | app | app |  |
| Por asignar | `comunicados` | 0 | sí | app | app |  |
| Por asignar | `config_correos` | 4 | sí | app | app |  |
| Por asignar | `eventos` | 0 | sí | app | app |  |
| Por asignar | `expansiones` | 8 | sí | app | app |  |
| Por asignar | `expansiones_historial` | 63 | sí | app | app |  |
| Por asignar | `flujo_caja_registros` | 2 | sí | app | app |  |
| Por asignar | `franquicias` | 43 | sí | — | — |  |
| Por asignar | `handles_pasos` | 0 | sí | app | app |  |
| Por asignar | `historial` | 1094 | sí | app | app |  |
| Por asignar | `historial_correos` | 11 | sí | — | — |  |
| Por asignar | `incidencias` | 21 | sí | app | app |  |
| Por asignar | `ingredientes_costos` | 0 | sí | app | app |  |
| Por asignar | `mapeo_pedido_ingrediente` | 0 | sí | — | — |  |
| Por asignar | `mkt_fondo_config` | 1 | sí | app | app |  |
| Por asignar | `mkt_fondo_config_historial` | 0 | sí | — | app |  |
| Por asignar | `notificaciones` | 923 | sí | app | app |  |
| Por asignar | `proveedor_catalogo` | 0 | sí | — | — |  |
| Por asignar | `proveedores_catalogo` | 11 | sí | — | — |  |
| Por asignar | `proyectos_handles` | 14 | sí | app | app |  |
| Por asignar | `rh_asistencias` | 0 | sí | app | app |  |
| Por asignar | `rh_empleados` | 0 | sí | app | app |  |
| Por asignar | `rh_plantilla` | 0 | sí | app | app |  |
| Por asignar | `rh_vacaciones` | 0 | sí | app | app |  |
| Por asignar | `solicitudes_contacto` | 0 | sí | — | app |  |
| Por asignar | `sugerencias` | 0 | sí | app | app |  |
| Por asignar | `supplier_stages` | 1589 | sí | app | app |  |
| Por asignar | `v_ap_id` | 0 | sí | — | — |  |
| Regalías | `app_liquidaciones` | 1 | sí | app | app |  |
| Regalías | `app_liquidaciones_detalle` | 64 | sí | app | app |  |
| Regalías | `regalias_facturas` | 123 | sí | app | app |  |
| Seguimientos | `seguimiento_datos` | 453 | sí | app | app |  |
| Seguimientos | `seguimiento_historial` | 738 | sí | — | app |  |
| Seguimientos | `seguimientos` | 7 | sí | app | app |  |
| Usuarios y accesos | `proveedores_contactos` | 11 | sí | app | app |  |
| Usuarios y accesos | `usuarios` | 75 | sí | app | app |  |
