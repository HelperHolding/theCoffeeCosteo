# Portal The Coffee + CRM Franquicias — Arquitectura (Fase 5, aprobada)

- **Fecha:** 2026-10-19 · **Rama:** `feat/crm-zoho-acceso`.
- **Base:** decisiones aprobadas en `docs/zoho/CRM-SCOPE-DECISIONS.md` y snapshot de Zoho del 2026-10-19 22:02 UTC.
- **Estado:** **aprobada por Carlos el 2026-10-19**, incluido `/` como Inicio y el Tablero en `/costeo`. Migraciones escritas y probadas en PGlite, **no aplicadas** en Supabase.

## 0. Principios

1. **Costeo sin regresiones:** sus tablas, políticas, rutas internas, MCP y chat no cambian de comportamiento.
2. **Mismo stack y diseño:** Next 16 (App Router, `proxy.ts`), Supabase con RLS, Tailwind con los tokens de `globals.css` (ink/paper/crema, Inter y Zen Kaku Gothic New) y los componentes de `components/portal`.
3. **Cerrado por defecto:** cada tabla nueva tiene RLS, grants explícitos y bloqueo total para tokens OAuth del MCP.
4. **Zoho es solo origen:** importación única e idempotente. Sin escrituras ni sincronización hacia Zoho.
5. **Probado antes de aplicar:** las migraciones corren en PGlite (`scripts/db/pglite.ts`) con pruebas de RLS antes de pedir permiso para aplicarlas en Supabase.

## 1. Portal modular

### Rutas

| Ruta | Hoy | Propuesta |
| --- | --- | --- |
| `/` | Tablero de Costeo | **Inicio**: tarjetas de los módulos a los que el usuario tiene acceso |
| `/costeo` | — | **Tablero de Costeo** (se mueve desde `/`) |
| `/resumen`, `/productos/*`, `/subrecetas/*`, `/insumos`, `/configuracion` | Costeo | **Sin cambio** (no se rompen enlaces ni el chat) |
| `/crm` | — | Panel operativo del CRM |
| `/crm/tiendas` | — | Pipeline Kanban de tiendas, con vista de tabla |
| `/crm/tiendas/[id]` | — | Expediente de la tienda |
| `/crm/prospectos`, `/crm/prospectos/[id]` | — | Leads: embudo y tabla, con ficha |
| `/crm/contactos`, `/crm/contactos/[id]` | — | Contactos |
| `/crm/actividades` | — | Tareas: lista y filtros |
| `/login`, `/auth/*`, `/oauth/consent`, `/mcp`, `/.well-known/*`, `/api/chat` | Sistema | **Sin cambio** |

### Layouts (route groups de Next 16)

- `app/(inicio)/page.tsx` + layout ligero: sesión y tarjetas, **sin** cargar recetas.
- `app/(portal)/…`: Costeo tal cual. Solo `page.tsx` se mueve a `app/(portal)/costeo/page.tsx`.
- `app/(crm)/crm/…`: layout propio que exige acceso al CRM y no carga recetas. Tiene su navegación (Panel, Tiendas, Prospectos, Contactos, Actividades) y su búsqueda Ctrl K sobre tiendas, prospectos y contactos.
- `components/portal/marco.tsx` se generaliza para recibir la **navegación y la fuente de búsqueda por módulo**, con un enlace "Módulos" que vuelve a `/`. Costeo le pasa exactamente sus grupos y recetas actuales.

Todos cuelgan del mismo `app/layout.tsx`, así que no hay recargas completas entre módulos.

### Registro tipado de módulos

`lib/portal/modulos.ts` define `{ id, nombre, descripcion, href, icono, acceso(perfil, modulos) }` para `costeo` y `crm`. Inicio, la navegación y las guardas de acceso leen ese registro. Para agregar un módulo futuro basta una entrada nueva y su route group.

### Puntos de Costeo que se tocan (ya ubicados)

`navegacion.tsx` ("Tablero" → `/costeo`), los 2 logos de `marco.tsx` (→ `/`), `login/actions.ts` (redirect `/`, que pasa a ser Inicio), `redireccion.ts` (el `/` por defecto sigue siendo válido), `not-found.tsx`, `lib/chat/entrada.ts` · `orbes.ts` · `app/api/chat/route.ts` (referencias al Tablero) y sus pruebas. `revalidatePath('/', 'layout')` se conserva porque revalida todo.

## 2. Permisos

### Modelo

Nueva tabla **`perfil_modulos`** (`user_id`, `modulo`, `nivel`), con PK (`user_id`, `modulo`):
- `modulo`: por ahora solo `'crm'`. Costeo sigue como hoy: entra cualquier perfil activo y sus permisos salen de `perfiles.rol`, sin tocar `rol_actual()` ni `tiene_rol()`.
- `nivel`: `'desarrollador'` (todo), `'edicion'`, `'lectura'`. Las áreas o equipos se agregarán como otra columna cuando se abran más usuarios.

Funciones `security definer` con `search_path` fijo:
- `crm_nivel()`: devuelve el nivel del usuario si su perfil está activo y la sesión **no** es un token OAuth (`auth.jwt()->>'client_id' is null`).
- `crm_puede_leer()` y `crm_puede_editar()`: las usan todas las políticas del CRM.

### Usuario inicial (decisión de Carlos)

Una sola fila: la cuenta de Carlos (`cvalencia@…`) con `nivel = 'desarrollador'`. **No va en una migración:** se inserta con un script aparte, cuando lo autorices, porque cambia permisos en producción. Todos los registros importados quedan con Carlos como responsable.

### MCP y chat de Costeo

Las tablas del CRM llevan políticas **restrictivas** `crm_sin_oauth` para todas las operaciones (`client_id is null`). El MCP de Costeo no puede ni leer el CRM. El chat sigue limitado a Costeo.

## 3. Esquema del CRM

Todas en `public` con prefijo `crm_`. No se expone ningún esquema nuevo al Data API, porque eso sería otro cambio de configuración en Supabase. Columnas comunes: `id uuid`, `creado_en`, `actualizado_en`, `creado_por`, `actualizado_por`, `version int` (concurrencia optimista) y `archivado_en` (borrado protegido: no hay `delete` para usuarios en las tablas principales).

**Trazabilidad Zoho**, en cada entidad importada: `zoho_org_id`, `zoho_module_api_name`, `zoho_record_id` (único), `zoho_created_at`, `zoho_modified_at`, `imported_at`, `import_run_id` y `import_hash`.

| Tabla | Origen Zoho | Contenido |
| --- | --- | --- |
| `crm_etapas` | picklists | `embudo` ('tiendas' \| 'prospectos'), `nombre`, `orden`, `tipo` ('abierta', 'lateral', 'ganada', 'perdida'), `activa`, `zoho_valor` |
| `crm_tiendas` | Franquicias (176) | La tarjeta del Kanban (detalle en 3.1) |
| `crm_prospectos` | Leads (3,621) | Ficha del prospecto (3.2) |
| `crm_contactos` | Contacts (51) | Persona de contacto (3.3) |
| `crm_tienda_contactos` | derivada | Tienda ↔ contacto cuando comparten franquiciatario en Zoho (sustituye a la liga con Cuentas) |
| `crm_actividades` | Tasks (231) | `asunto`, `fecha_vencimiento`, `estado`, `prioridad`, `descripcion`, `cerrada_en`, `recordatorio_zoho` (texto) y relación (3.4) |
| `crm_notas` | Notes (472 en alcance: 495 menos 22 de Cuentas y 1 de Prospectos_Expansion) | `titulo`, `contenido`, `autor_id`, fecha original y relación |
| `crm_etiquetas`, `crm_etiquetas_registro` | Tags | Catálogo y asignación a tienda, prospecto o contacto |
| `crm_checklists`, `crm_checklist_items` | nuevo (+ campos adaptados) | Listas múltiples por tienda; ítem con `texto`, `hecho`, `orden`, `responsable_id`, `fecha_limite`, `url`, `completado_por`, `completado_en` |
| `crm_archivos` | Attachments + fileupload | Metadata del archivo en Storage (sección 6) |
| `crm_historial` | nuevo + timeline de Zoho | Bitácora del CRM (sección 5) |

**Relaciones polimórficas** (actividades, notas, archivos, etiquetas): columnas FK reales y nulas (`tienda_id`, `prospecto_id`, `contacto_id`, `actividad_id`, `nota_id`) con `check` de "a lo más una" (exactamente una en etiquetas). Así hay integridad referencial y RLS simple, en lugar de `module + id` de texto.

### 3.1 `crm_tiendas` (mapeo aprobado)

| Columna | Zoho | Nota |
| --- | --- | --- |
| `nombre` | Name | obligatorio |
| `etapa_id`, `posicion` | Status | `posicion` = orden en la columna del Kanban |
| `responsable_id` | Owner | todas → Carlos |
| `franquiciatario` | Cuenta (nombre, texto) | sin liga: Cuentas está fuera |
| `tipo_franquicia` | etiquetas Franquiciatario / Franquicia Maestra | 'franquiciatario' \| 'maestra' \| null |
| `ciudad`, `direccion`, `numero_tienda_jestor` | Ciudad, Dirección, N.º Jestor | |
| `arquitecto_asignado`, `fecha_entrega_proyecto` | | |
| `fecha_aprobacion_local` | Aprobación de local **∪** Fecha aprobación de local | unificada (nunca se contradicen) |
| `fecha_firma_contrato` | Firma de Contrato | primer contrato |
| `fecha_firma_franquicia`, `estatus_contrato_franquicia`, `fecha_vencimiento_franquicia` | Fecha de Firma, Estatus 5 años, Vencimiento | contrato de 5 años |
| `fecha_programada_arranque` | FECHA_DE_ARRANQUE | |
| `fecha_apertura` | Fecha en que aperturó **∪** Fecha de Apertura | unificada; 1 conflicto → `revisar` |
| `marca_cafetera`, `estatus_cafetera` | campos **∪** etiquetas Marzocco / VA | 2 conflictos → `revisar` |
| `rappi`, `rollout` | booleanos | |
| `correo_tienda`, `url_carpeta_contrato`, `url_dictamen_local` | | ligas externas |
| `revisar text[]` | — | motivos de revisión post-importación |
| — | Días para apertura (2 campos) | **se calculan** desde las fechas |
| — | Checklist Pre-Apertura, Evidencias (ligas); Partoo, Google Maps, Cert. Facturación, Perfiles de Baristas | → checklist "Apertura" de la tienda, con la liga si existe |
| — | FINKOK usuario/contraseña, Unsubscribed_*, Record_Image | no se replican |

### 3.2 `crm_prospectos`

`nombre`, `apellidos`, `correo`, `telefono`, `etapa_id` (embudo 'prospectos', **nulo = "sin estado"**), `responsable_id`, `empresa` (Company ∪ Nombre de Empresa), `ciudad_interes`, `estado_interes`, `ciudad_residencia`, `estado_residencia`, `pais`, `inversion`, `capital_disponible`, `fuente_capital`, `interes_en_the_coffee`, `por_que_tendra_exito`, `plan_operacion`, `involucrado_otra_marca`, `marca_involucramiento`, `pagina_web`, `sin_correos` (Email_Opt_Out). Las etapas del embudo se crean al importar con los **14 estados en uso**, en el orden de Zoho (leads tal cual). Descartados por la Fase 4: los 8 campos de encargados, Linkedin, Sector, dirección postal, Saludo, `Single_Line_1` y los de conversión. Quedan íntegros en el staging privado (sección 7).

### 3.3 `crm_contactos`

`nombre`, `apellidos`, `correo`, `telefono`, `puesto`, `tipo_contacto` (Phase), `franquiciatario` (texto), `plaza` (de las etiquetas de ciudad), `recibe_newsletter`, `recibe_comunicados`, `fee_pagado` (de las etiquetas), `responsable_id`.

### 3.4 Relaciones de actividades y notas

Tasks con `$se_module` Franquicias / Leads / Contacts → `tienda_id` / `prospecto_id` / `contacto_id`. Sin relación (7) → todas nulas. Ligadas a Cuentas (37) → **no se importan**. Notas de Tasks (6) → `actividad_id`.

## 4. Pipeline Kanban

- **Etapas de tiendas** (semilla en migración, aprobadas): Firma de contrato → En búsqueda de local → Local aprobado por México → Local aprobado por Brasil → Arquitecta Asignada → Proyecto 3D Entregado → Proyecto Ejecutivo Entregado → En remodelación → Entrega de local → Agenda de capacitación → **Operando** (ganada). Laterales: Standby, Modificaciones pendientes. Cierres: Cancelada, Cerrada. "Proyecto" solo vive en el historial.
- **Orden persistente:** `posicion double precision` por etapa. Mover = punto medio entre vecinos; se renumera solo la columna cuando la distancia se agota.
- **Movimiento:** RPC `crm_mover_tienda(tienda, etapa, posicion, version)` (la UI calcula el punto medio; `crm_renumerar_etapa(etapa)` reparte posiciones cuando hace falta) (`security invoker`, respeta RLS). Valida la versión y devuelve la fila. Si la versión no coincide, error → la UI hace **rollback visible**. Alternativa accesible: menú "Mover a…" con la misma RPC.

## 5. Historial y trazabilidad

`crm_historial`: `entidad`, `entidad_id`, `accion` ('creado', 'editado', 'etapa', 'responsable', 'nota', 'checklist', 'archivo', 'importado'), `resumen`, `cambios jsonb` ({campo: {antes, despues}}, sin contenido de notas ni archivos), `actor_id`, `origen` ('crm' \| 'importacion' \| 'zoho'), `fecha`.
- Un trigger en las tablas del CRM (separado de `bitacora`, cuyo CHECK y lógica son de recetas) registra los cambios. Solo lectura para usuarios.
- **Historial de Zoho:** los 536 cambios de etapa de Tiendas (2025-01-13 a 2026-09-10) se importan con su fecha original y `origen = 'zoho'`, así el expediente conserva su línea de tiempo.

## 6. Storage

- Bucket privado **`crm-archivos`** (`public = false`, `file_size_limit` 25 MB, MIME permitidos: pdf, png, jpeg, webp, xml, docx, xlsx). El mayor archivo de Zoho pesa 9.5 MB.
- **Ruta no predecible:** `{uuid de crm_archivos}/{uuid aleatorio}`. El nombre original solo vive en la tabla.
- `crm_archivos`: `nombre`, `mime`, `tamano`, `sha256`, `ruta`, `seccion` ('adjuntos' \| 'Información Proyecto' \| …), `campo` ('Proyecto_3D', …), relación, `subido_por`, `subido_en`, `archivado_en`, `zoho_attachment_id` / `zoho_file_id`.
- **Políticas en `storage.objects`** para `bucket_id = 'crm-archivos'`: `select` e `insert` solo si `crm_puede_leer()` / `crm_puede_editar()` y existe la fila en `crm_archivos` con esa ruta. **Sin `update` ni `delete`** para usuarios: borrar = archivar la fila. Las descargas usan URLs firmadas cortas (60 s) generadas en el servidor tras validar la sesión. Cada descarga y subida queda en `crm_historial`.
- Las pruebas de PGlite agregan al shim un esquema `storage` mínimo para probar estas políticas.

## 7. Importación (Fase 8, diseño)

1. **Staging privado:** esquema `zoho_staging` sin grants para `anon` ni `authenticated` (no se expone al Data API). Tablas `importaciones` (corrida, snapshot, estado, conteos, errores) y `registros` (corrida, módulo, `zoho_id`, `payload jsonb`, hash). **Retención:** se borra 90 días después del corte.
2. **Extracción:** `scripts/zoho/importar.ts` reutiliza `ClienteZoho` (solo lectura) y escribe en staging con `DATABASE_URL`, desde tu máquina; ningún secreto llega al frontend.
3. **Transformación:** el mapeo de la sección 3, en SQL o TypeScript con pruebas en PGlite.
4. **Carga idempotente:** `upsert` por `zoho_record_id`, omitiendo los registros cuyo `import_hash` no cambió. Es reanudable por módulo y página, y cada corrida tiene `import_run_id`.
5. **Reversible antes del corte:** borrar por `import_run_id`. Después del corte el CRM diverge y la reversión ya no aplica. La fecha del snapshot queda registrada.
6. **Secuencia:** piloto (10 tiendas con todo lo relacionado) → reporte de diferencias → tu aprobación → importación completa → conciliación contra los conteos de la auditoría → archivos (piloto de 5, luego todos, deduplicados por `File_Id`) → verificación.
7. **Archivos:** descarga desde Zoho y subida a Storage con la llave secreta de Supabase, solo en tu máquina. **Por verificar:** el scope de descarga de fileupload (`/crm/v8/files`). Puede requerir generar otro código del Self Client con un scope READ adicional.

## 8. Migraciones previstas (revisables, NO aplicadas)

| Archivo | Contenido |
| --- | --- |
| `…13_crm_modulos.sql` | `perfil_modulos`, `crm_nivel()`, `crm_puede_leer()`, `crm_puede_editar()` |
| `…14_crm_esquema.sql` | tablas del CRM, índices, semilla de etapas de tiendas |
| `…15_crm_seguridad.sql` | grants, RLS, `crm_sin_oauth`, triggers de historial y versión, `crm_mover_tienda` |
| `…16_zoho_staging.sql` | esquema privado de importación |
| `…17_crm_storage.sql` | bucket y políticas de `storage.objects` |

**Pruebas (PGlite):** usuario sin módulo no ve nada; `lectura` no escribe; OAuth no lee ni escribe; nadie borra tiendas; mover con versión vieja falla; el historial registra actor y fecha; Storage solo con fila válida; Costeo sigue igual (las pruebas actuales pasan sin tocarlas, incluida la de 42 políticas OAuth).

## 9. Riesgos y checkpoints

| Riesgo | Mitigación |
| --- | --- |
| `main` despliega directo a producción | Todo en rama + PR. Preview protegido antes del merge. **Confirmar si Vercel tiene Deployment Protection en previews** |
| Mover el Tablero cambia el enlace guardado de `/` | `/` sigue funcionando (Inicio) y `/costeo` lleva al Tablero |
| Aplicar migraciones en producción | Solo con tu autorización explícita, después de pasar en PGlite |
| Insertar tu fila en `perfil_modulos` | Script separado, con tu autorización |
| Volumen de Storage (~95–150 MB) | Dentro del plan. Piloto de 5 archivos primero |
| Datos personales de leads | RLS por módulo, sin OAuth y sin logs con PII |

## 10. Preguntas

1. ¿Vercel tiene **Deployment Protection** activa en los previews? Si no, ¿la activas antes del primer preview del CRM?
2. ~~¿`/` como Inicio?~~ Aprobado.

## 11. Estado de las migraciones (2026-10-19)

- Escritas: `20261020000013` a `20261020000017`. **No aplicadas** en Supabase.
- **PGlite:** se aplican limpias junto con las 12 de Costeo. `tests/db/crm.test.ts` (16 pruebas) cubre etapas sembradas, sin módulo = nada, lectura no escribe, OAuth bloqueado, perfil inactivo, staging inaccesible, sello de autoría y procedencia, archivado en lugar de borrado, Kanban con versión, embudo correcto, posición sin ruido en el historial, historial de solo lectura sin contenido de notas, checklist con quién y cuándo, importación con origen y Storage solo con fila activa. La suite completa da 209 aprobadas. Solo falla `tests/migracion/paridad.test.ts`, que ya fallaba antes: necesita el Excel local de Costeo.
- El shim de pruebas (`scripts/db/shim-supabase.sql`) ganó un esquema `storage` mínimo, solo para pruebas.
- **Por verificar al aplicar** (en un branch o proyecto de staging de Supabase antes que en producción):
  1. Que el rol de migraciones pueda crear políticas en `storage.objects`.
  2. Las columnas `file_size_limit` y `allowed_mime_types` de `storage.buckets`.
  3. Si Supabase tiene **integración con GitHub**: un merge a `main` podría aplicar las migraciones automáticamente. Hay que confirmarlo antes de abrir el PR.
- Pendiente: generar `lib/supabase/database.types.ts` con las tablas nuevas (Fase 6).
