# Zoho CRM — Evidencia de acceso read-only (Fase 1)

- **Fecha:** 2026-10-19
- **Alcance:** verificar acceso de solo lectura a Zoho CRM y ubicar los API names de los 4 módulos en alcance. Sin código de producto, migraciones, Supabase ni producción.
- **Regla:** Zoho estrictamente read-only. Sin PII, tokens, URLs privadas ni IDs internos en este documento.

## 1. Conector usado

| Dato | Valor |
| --- | --- |
| Servidor MCP | Zoho CRM "Análisis de datos" (Data Insights), host `zoho-crm-data-insights-<id>.zohomcp.com` |
| Registro en Claude Code | servidor de usuario `zoho-crm` (HTTP + OAuth), fuera del repo (la URL lleva una clave privada) |
| Estado al iniciar la sesión | `connected`, 3 herramientas |
| Conectores **no usados** | "Zoho CRM" `claudeexpansion-…`, Zoho Analytics, Books, Projects |

Nota: el conector aparece como servidor de usuario `zoho-crm`, no como conector claude.ai "ZOHO CRM". El host coincide con el servidor Data Insights, así que es el mismo servidor de Zoho.

## 2. Herramientas expuestas y clasificación

Se enumeraron y clasificaron **antes** de invocar cualquiera.

| Herramienta | Descripción (resumida del servidor) | Clase |
| --- | --- | --- |
| `ZohoCRM_getModules` | Lista módulos (estándar, personalizados, subform, linking). Filtros `status`, `feature_name`, `fields`, `include`. | **Lectura** (GET `/settings/modules`) |
| `ZohoCRM_getFields` | Metadatos de campos de un módulo (api_name, data_type, json_type). Sin picklists ni obligatoriedad por layout. | **Lectura** (GET `/settings/fields`) |
| `ZohoCRM_executeCOQLQuery` | Consulta COQL `SELECT` con joins, agregados y filtros. | **Lectura** (solo `SELECT`) |

- **Herramientas de mutación expuestas: ninguna.**
- `getFields` menciona en su descripción "antes de construir payloads de create/update", pero la herramienta en sí solo lee metadatos.
- El servidor no expone recursos MCP adicionales usados en esta fase.

## 3. Consulta realizada

Una sola llamada: `ZohoCRM_getModules` con `fields=api_name,module_name,plural_label,singular_label,generated_type,status,api_supported`. Resultado: `status: success`, 90 módulos (agregado; sin registros ni datos de personas).

### API names de los 4 módulos en alcance

| Etiqueta en Zoho | API name | module_name | Tipo | API |
| --- | --- | --- | --- | --- |
| Posibles clientes | `Leads` | Leads | estándar | sí |
| Contactos | `Contacts` | Contacts | estándar | sí |
| Tiendas | **`Franquicias`** | CustomModule1 | personalizado | sí |
| Tareas | `Tasks` | Tasks | estándar | sí |

**Alcance cerrado por Carlos (2026-10-19):** solo el workspace **The Coffee** y solo estos 4 módulos. Su menú lateral muestra Posibles clientes, Contactos, Cuentas, Tratos, Tiendas, Eventos, Tareas, Projects y Voz del cliente, y concuerda con los módulos que devolvió la API.

Fuera de alcance (no se auditan; si un campo de los 4 módulos apunta a alguno de ellos, solo se anota la relación):
- Cuentas, Tratos, Eventos (y `Eventos_X_Tiendas`), Projects, Voz del cliente.
- Módulos que no están en el menú del workspace: `Prospectos_Expansion`, Rappi, Brokers_Inmobiliario, Nueva_BDD_2026, BBD_Last, entre otros.
- Los 28 módulos `File_Upload_*__s` (documentos del franquiciatario: identificación, constancias fiscales, contratos). Son adjuntos con datos sensibles y no se leen sin una decisión explícita.

## 4. Organización

Data Insights **no expone** un endpoint de organización, así que **no se pudieron confirmar** org (thecoffeemexico), dominio, zona horaria ni edición por esta vía. El servidor responde con datos de una org que tiene el módulo personalizado "Tiendas" = `Franquicias`, lo que concuerda con The Coffee, pero la confirmación formal queda pendiente:

- Opción A (sin crear nada): Carlos lo confirma en Zoho CRM → Configuración → Detalles de la compañía.
- Opción B: Self Client (sección 6) con `ZohoCRM.org.READ` → `GET /crm/v8/org` devuelve `domain_name`, `time_zone`, `country`, `type` y `license_details.paid_type` (el equivalente a la edición).

## 5. Límites, errores y qué no cubre Data Insights

- Errores: ninguno. Una llamada y una respuesta, sin paginación.
- `getFields` **no trae valores de picklist** ni configuración por layout. Las etapas (`Lead_Status`, `Stage` de Tiendas, `Status` de Tareas) se podrían inferir con COQL agregado (`SELECT campo, COUNT(id) … GROUP BY campo`), pero eso solo da los valores usados, no el orden ni la definición oficial.
- No cubre: **usuarios**, **roles/perfiles**, **pipelines/etapas** con orden, **layouts**, **blueprints** y **adjuntos** (listar/descargar).

## 6. Propuesta si falta información: Self Client (no creado)

Zoho API Console → Self Client, generado por el admin, código de corta duración, token solo en `.env.local` (ignorado por git). **No se ha creado nada.** Scopes READ verificados el 2026-10-19 en la doc oficial v8:

| Necesidad | Scope | Endpoint | Fuente v8 |
| --- | --- | --- | --- |
| Org (dominio, zona horaria, licencia) | `ZohoCRM.org.READ` | `GET /crm/v8/org` | get-org-data |
| Usuarios | `ZohoCRM.users.READ` | `GET /crm/v8/users` | get-users |
| Roles | `ZohoCRM.settings.roles.READ` | `GET /crm/v8/settings/roles` | get-roles |
| Pipelines y etapas | `ZohoCRM.settings.pipeline.READ` | `GET /crm/v8/settings/pipeline?layout_id=…` | get-pipelines |
| Listar adjuntos | `ZohoCRM.modules.attachments.READ` + `ZohoCRM.modules.<módulo>.READ` | `GET /crm/v8/{module}/{id}/Attachments` | get-attachments |
| Campos, layouts, módulos | `ZohoCRM.settings.fields.READ`, `ZohoCRM.settings.layouts.READ`, `ZohoCRM.settings.modules.READ` | `/settings/…` | scopes |
| Registros / COQL | `ZohoCRM.modules.leads.READ`, `.contacts.READ`, `.tasks.READ`, `.custom.READ`; `ZohoCRM.coql.READ` | — | scopes |

Pendientes de verificar antes de pedirlos: perfiles (`ZohoCRM.settings.profiles.READ`), blueprints y el scope/endpoint de **descarga** de adjuntos (la página v8 de adjuntos solo documenta el listado). Nunca se pedirá `ALL`, `CREATE`, `UPDATE` ni `DELETE`.

## 7. Confirmación de cero mutaciones

- Llamadas a Zoho en esta fase: **1** (`ZohoCRM_getModules`). Ninguna escritura, webhook, update ni creación de clientes OAuth.
- El servidor no expone herramientas de mutación.
- En el repo solo cambia este archivo (`docs/zoho/`). Sin código, migraciones, Supabase ni deploy.

## 8. Cómo revocar el acceso

1. **Claude Code:** quitar el servidor de usuario `zoho-crm` (`claude mcp remove zoho-crm -s user` desde la CLI) o borrar su entrada en `~/.claude.json`. Si además está como conector en claude.ai: Customize → Connectors → quitar.
2. **Zoho Accounts:** accounts.zoho.com → Seguridad → Aplicaciones conectadas → revocar el acceso del cliente MCP.
3. **Zoho CRM:** Configuración → Developer Hub → MCP → desactivar o eliminar el servidor Data Insights (invalida la URL con clave).
4. Si en el futuro se crea un Self Client: API Console → Self Client → eliminar, y borrar el token de `.env.local`.
