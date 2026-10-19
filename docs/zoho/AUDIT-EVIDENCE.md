# Zoho CRM — Evidencia de acceso read-only (Fase 1)

- **Fecha:** 2026-10-19
- **Alcance:** verificar acceso de solo lectura a Zoho CRM y ubicar los API names de los módulos en alcance. Sin código de producto, migraciones, Supabase ni producción.
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

### API names de los 5 módulos en alcance

| Etiqueta en Zoho | API name | module_name | Tipo | API |
| --- | --- | --- | --- | --- |
| Posibles clientes | `Leads` | Leads | estándar | sí |
| Contactos | `Contacts` | Contacts | estándar | sí |
| Tiendas | **`Franquicias`** | CustomModule1 | personalizado | sí |
| Tareas | `Tasks` | Tasks | estándar | sí |
| Cuentas | `Accounts` | Accounts | estándar | sí |

**Alcance cerrado por Carlos (2026-10-19):** solo el workspace **The Coffee** y solo estos 5 módulos (Cuentas se agregó después, a petición de Carlos). Su menú lateral muestra Posibles clientes, Contactos, Cuentas, Tratos, Tiendas, Eventos, Tareas, Projects y Voz del cliente, y concuerda con los módulos que devolvió la API.

Fuera de alcance (no se auditan; si un campo de los 5 módulos apunta a alguno de ellos, solo se anota la relación):
- Tratos, Eventos (y `Eventos_X_Tiendas`), Projects, Voz del cliente.
- Módulos que no están en el menú del workspace: `Prospectos_Expansion`, Rappi, Brokers_Inmobiliario, Nueva_BDD_2026, BBD_Last, entre otros.
- Los 28 módulos `File_Upload_*__s` (documentos del franquiciatario: identificación, constancias fiscales, contratos). Son adjuntos con datos sensibles y no se leen sin una decisión explícita.

## 4. Organización

Data Insights **no expone** un endpoint de organización, así que **no se pudieron confirmar** org (thecoffeemexico), dominio, zona horaria ni edición por esta vía. El servidor responde con datos de una org que tiene el módulo personalizado "Tiendas" = `Franquicias`, lo que concuerda con The Coffee, pero la confirmación formal queda pendiente:

- Opción A (sin crear nada): Carlos lo confirma en Zoho CRM → Configuración → Detalles de la compañía.
- Opción B: Self Client (sección 6) con `ZohoCRM.org.READ` → `GET /crm/v8/org` devuelve `domain_name`, `time_zone`, `country`, `type` y `license_details.paid_type` (el equivalente a la edición).

## 5. Límites, errores y qué no cubre Data Insights

- Errores: ninguno. Una llamada y una respuesta, sin paginación.
- ~~`getFields` no trae valores de picklist~~ **Corregido en Fase 2:** aunque su descripción dice lo contrario, `getFields` sí devuelve `pick_list_values` con su orden (`sequence_number`) y la asociación a layout. Lo que no trae son las secciones ni la obligatoriedad por layout.
- No cubre: **usuarios**, **roles/perfiles**, **pipelines** (en Zoho aplican a Tratos, que está fuera de alcance; en los 5 módulos la etapa es un picklist), **secciones de layout**, **blueprints** y **adjuntos** (listar/descargar).

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
| Registros / COQL | `ZohoCRM.modules.leads.READ`, `.contacts.READ`, `.accounts.READ`, `.tasks.READ`, `.custom.READ`; `ZohoCRM.coql.READ` | — | scopes |

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

---

# Fase 2 — Auditoría piloto (2026-10-19)

Objetivo: probar el auditor con metadatos y agregados, validar paginación y vacíos, mostrar el formato y corregir el método. **Módulo piloto: Tiendas (`Franquicias`)**, porque es el núcleo del pipeline de franquicias. Los otros 4 módulos tienen solo metadatos y conteos por etapa.

## F2.1 Llamadas realizadas

| Herramienta | Llamadas | Qué devolvió |
| --- | --- | --- |
| `getFields` | 5 (uno por módulo) | Metadatos de campos, picklists y layouts. Sin registros. |
| `executeCOQLQuery` | ~50 | Solo `COUNT(id)`, con y sin `GROUP BY`, y una prueba de paginación con 5 IDs. Ningún valor de campos de personas. |

Ninguna escritura. No se leyó ningún registro completo.

## F2.2 Volumen real

| Módulo | Registros | Campos (custom) | Layouts |
| --- | ---: | --- | --- |
| Tiendas (`Franquicias`) | 176 | 50 (36) | Tiendas The Coffee |
| Posibles clientes (`Leads`) | 3,621 | 60 (22) | Standard |
| Contactos (`Contacts`) | 51 | 25 (2) | Standard |
| Cuentas (`Accounts`) | 65 | 54 (20) | Standard (61), Persona Física (2), Persona Moral (2) |
| Tareas (`Tasks`) | 268 | 21 (0) | Standard |

Conciliación: en los 5 módulos la suma por etapa o grupo (`GROUP BY`) es igual al total.

## F2.3 Etapas (picklist de estado) y uso real

**Tiendas — `Status`** (22 opciones, 13 en uso, 0 nulos):

| Etapa (orden Zoho) | Registros |
| --- | ---: |
| 1 Firma de contrato | 58 |
| 2 En búsqueda de local | 7 |
| 3 Local aprobado por México | 4 |
| 5 Arquitecta Asignada | 4 |
| 6 Proyecto 3D Entregado | 3 |
| 7 Proyecto Ejecutivo Entregado | 5 |
| 8 En remodelación | 11 |
| 9 Agenda de capacitación | 1 |
| 10 Operando | 72 |
| 11 Standby | 4 |
| 12 Cancelada | 4 |
| 13 Cerrada | 2 |
| 14 Modificaciones pendientes | 1 |

Sin uso: Local aprobado por Brasil, En espera de Asignación Arquitectura Brasil, Entrega de local, Franquiciatario Busca Local, Kickoff de Tienda Iniciado, Local Aprobado por MX (duplica a "Local aprobado por México"), Obra en Proceso, Programación de Soft Opening y Proyecto.

**Posibles clientes — `Lead_Status`** (93 opciones, 14 en uso):
- **2,130 de 3,621 (58.8 %) sin estado.**
- Más usados: Interes en Zona Bloqueada 895, Contactado 397, Correo Inicial Enviado - Agenda tu Cita 95, Con Interés 45, Lead Pérdido / Sin Interés 25, Psible Cierre 14. Hay ocho más con 1 a 4 registros cada uno.
- El catálogo tiene duplicados y erratas evidentes ("Psible Cierre" / "Posible Cierre", "Lead Pérdido / Sin Interés" / "Lead Perdido / Sin Interés", "Contrato Enviado" / "Contrato Enviado..", "Factura Enviada" / "Factura Envíada", valores en inglés y en español). Hay que depurarlo en la Fase 4.

**Tareas — `Status`**: Not Started 235, Completed 29, Waiting for input 3, In Progress 1. Por relación (`$se_module`): Tiendas 197, Cuentas 37, Leads 17, Contactos 10, sin relación (Home) 7.

**Contactos — `Phase` (Tipo de Contacto)**: Nuevos Franquiciatarios 29, Franquiciatarios 13, nulo 9.

**Cuentas**: sin picklist de etapa. Tiene `Status_contrato_de_bloqueo_de_zona` (Pendiente / Firmado Digital / Firmado Presencial) y layouts por tipo de persona.

## F2.4 Relaciones detectadas

- Tiendas → Cuentas (`Cuenta`, lookup): 174 de 176 llenos.
- Contactos → Cuentas (`Account_Name`): 23 de 51.
- Leads → Cuentas / Contactos / Tratos (`Converted_*`, conversión).
- Tareas → Contactos (`Who_Id`): 2. Tareas → cualquier módulo (`What_Id` + `$se_module`): ver F2.3.
- Cuentas → Cuentas (`Parent_Account`).

## F2.5 Formato del auditor (piloto)

`docs/zoho/ZOHO-FIELD-AUDIT.csv` trae las 50 filas de Tiendas con las columnas que pide el prompt. `proposed_action` queda en "Pendiente" hasta la Fase 4.

Clasificación de vacíos verificada:
- **Nulo / texto vacío:** COQL los trata igual (`Ciudad = ''` → 0; `is not null` → 116). No se distinguen por COQL.
- **Booleano:** `false` es un valor válido, no un vacío. `Rappi` = 2 true + 174 false = 176, sin nulos.
- **Inaccesible por COQL:** campos `fileupload` (`Proyecto_3D`, `Proyecto_Ejecutivo`) → "unsupported column in criteria". Se medirán en el inventario de documentos.
- **Excluido por seguridad:** `Contrase_a_FINKOK_PAC` y `Usuario_FINKOK_PAC`.
- **Campo inexistente / sin permiso:** sin casos en el piloto.

## F2.6 Paginación y límites verificados

- COQL devuelve **2,000 filas como máximo** por llamada: `limit 2001` → `LIMIT_EXCEEDED (limit: 2000)`.
- `limit offset, n` funciona y `info.more_records` es fiable: offset 3605 + 5 → `more_records: true`, consistente con los 3,621 registros.
- `COUNT()` solo acepta `id`: `COUNT(Ciudad)` → `unsupported column`. Corrección del auditor: una consulta `COUNT(id) … where campo is not null` por campo.
- COQL exige `WHERE`; se usa `id is not null`.
- No se probó el tope de offset (el módulo más grande tiene 3,621 registros).
- Una consulta de paginación sobre IDs fue bloqueada por el clasificador de permisos de Claude Code (PII). No se repitió; la prueba equivalente con 5 IDs bastó.

## F2.7 Hallazgos para decidir

1. **Seguridad:** Tiendas guarda usuario y **contraseña del PAC FINKOK** en campos de texto visibles para los perfiles. Se recomienda sacarlos de Zoho y **no** replicarlos en el CRM nuevo.
2. **Fechas duplicadas en Tiendas:** aprobación de local (2 campos), firma (2), apertura (3: `Fecha_de_Apertura` 58, `Fecha_en_que_apertur` 63, `FECHA_DE_ARRANQUE` 134).
3. **58 tiendas en "Firma de contrato"**, la primera opción del picklist. Puede ser un valor por defecto y no una etapa real.
4. **Leads:** 59 % sin estado y un catálogo de 93 valores con duplicados.
5. **Campos de Tiendas sin uso:** Certificado de Facturación, Perfiles de Baristas, Configuración Partoo y Alta en Google Maps (0), Checklist Pre Apertura (2) y las dos Evidencias (1 cada una).
6. **Etiquetas (`Tag`)** en uso: 158 de 176 tiendas. Su catálogo requiere `ZohoCRM.settings.tags.READ` (Self Client) o lectura de registros.

## F2.8 Pendiente para la Fase 3

- Llenado por campo en Leads, Contactos, Cuentas y Tareas (mismo método, ~170 consultas).
- Secciones de layout, usuarios/propietarios, roles, catálogo de etiquetas, notas y adjuntos: requieren Self Client (sección 6) o decidir que no se necesitan.
- Muestra de registros: no se tomó para evitar datos personales. Si hace falta ver el formato de un registro, se haría con 1 a 3 registros redactados y solo con aprobación.
