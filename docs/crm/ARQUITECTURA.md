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

| Ruta                                                                         | Hoy               | Propuesta                                                             |
| ---------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------- |
| `/`                                                                          | Tablero de Costeo | **Inicio**: tarjetas de los módulos a los que el usuario tiene acceso |
| `/costeo`                                                                    | —                 | **Tablero de Costeo** (se mueve desde `/`)                            |
| `/resumen`, `/productos/*`, `/subrecetas/*`, `/insumos`, `/configuracion`    | Costeo            | **Sin cambio** (no se rompen enlaces ni el chat)                      |
| `/crm`                                                                       | —                 | Panel operativo del CRM                                               |
| `/crm/tiendas`                                                               | —                 | Pipeline Kanban de tiendas, con vista de tabla                        |
| `/crm/tiendas/[id]`                                                          | —                 | Expediente de la tienda                                               |
| `/crm/prospectos`, `/crm/prospectos/[id]`                                    | —                 | Leads: embudo y tabla, con ficha                                      |
| `/crm/contactos`, `/crm/contactos/[id]`                                      | —                 | Contactos                                                             |
| `/crm/actividades`                                                           | —                 | Tareas: lista y filtros                                               |
| `/login`, `/auth/*`, `/oauth/consent`, `/mcp`, `/.well-known/*`, `/api/chat` | Sistema           | **Sin cambio**                                                        |

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

| Tabla                                     | Origen Zoho                                                                 | Contenido                                                                                                                                   |
| ----------------------------------------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| `crm_etapas`                              | picklists                                                                   | `embudo` ('tiendas' \| 'prospectos'), `nombre`, `orden`, `tipo` ('abierta', 'lateral', 'ganada', 'perdida'), `activa`, `zoho_valor`         |
| `crm_tiendas`                             | Franquicias (176)                                                           | La tarjeta del Kanban (detalle en 3.1)                                                                                                      |
| `crm_prospectos`                          | Leads (3,621)                                                               | Ficha del prospecto (3.2)                                                                                                                   |
| `crm_contactos`                           | Contacts (51)                                                               | Persona de contacto (3.3)                                                                                                                   |
| `crm_tienda_contactos`                    | derivada                                                                    | Tienda ↔ contacto cuando comparten franquiciatario en Zoho (sustituye a la liga con Cuentas)                                                |
| `crm_actividades`                         | Tasks (231)                                                                 | `asunto`, `fecha_vencimiento`, `estado`, `prioridad`, `descripcion`, `cerrada_en`, `recordatorio_zoho` (texto) y relación (3.4)             |
| `crm_notas`                               | Notes (472 en alcance: 495 menos 22 de Cuentas y 1 de Prospectos_Expansion) | `titulo`, `contenido`, `autor_id`, fecha original y relación                                                                                |
| `crm_etiquetas`, `crm_etiquetas_registro` | Tags                                                                        | Catálogo y asignación a tienda, prospecto o contacto                                                                                        |
| `crm_checklists`, `crm_checklist_items`   | nuevo (+ campos adaptados)                                                  | Listas múltiples por tienda; ítem con `texto`, `hecho`, `orden`, `responsable_id`, `fecha_limite`, `url`, `completado_por`, `completado_en` |
| `crm_archivos`                            | Attachments + fileupload                                                    | Metadata del archivo en Storage (sección 6)                                                                                                 |
| `crm_historial`                           | nuevo + timeline de Zoho                                                    | Bitácora del CRM (sección 5)                                                                                                                |

**Relaciones polimórficas** (actividades, notas, archivos, etiquetas): columnas FK reales y nulas (`tienda_id`, `prospecto_id`, `contacto_id`, `actividad_id`, `nota_id`) con `check` de "a lo más una" (exactamente una en etiquetas). Así hay integridad referencial y RLS simple, en lugar de `module + id` de texto.

### 3.1 `crm_tiendas` (mapeo aprobado)

| Columna                                                                                 | Zoho                                                                                                     | Nota                                                       |
| --------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| `nombre`                                                                                | Name                                                                                                     | obligatorio                                                |
| `etapa_id`, `posicion`                                                                  | Status                                                                                                   | `posicion` = orden en la columna del Kanban                |
| `responsable_id`                                                                        | Owner                                                                                                    | todas → Carlos                                             |
| `franquiciatario`                                                                       | Cuenta (nombre, texto)                                                                                   | sin liga: Cuentas está fuera                               |
| `tipo_franquicia`                                                                       | etiquetas Franquiciatario / Franquicia Maestra                                                           | 'franquiciatario' \| 'maestra' \| null                     |
| `ciudad`, `direccion`, `numero_tienda_jestor`                                           | Ciudad, Dirección, N.º Jestor                                                                            |                                                            |
| `arquitecto_asignado`, `fecha_entrega_proyecto`                                         |                                                                                                          |                                                            |
| `fecha_aprobacion_local`                                                                | Aprobación de local **∪** Fecha aprobación de local                                                      | unificada (nunca se contradicen)                           |
| `fecha_firma_contrato`                                                                  | Firma de Contrato                                                                                        | primer contrato                                            |
| `fecha_firma_franquicia`, `estatus_contrato_franquicia`, `fecha_vencimiento_franquicia` | Fecha de Firma, Estatus 5 años, Vencimiento                                                              | contrato de 5 años                                         |
| `fecha_programada_arranque`                                                             | FECHA_DE_ARRANQUE                                                                                        |                                                            |
| `fecha_apertura`                                                                        | Fecha en que aperturó **∪** Fecha de Apertura                                                            | unificada; 1 conflicto → `revisar`                         |
| `marca_cafetera`, `estatus_cafetera`                                                    | campos **∪** etiquetas Marzocco / VA                                                                     | 2 conflictos → `revisar`                                   |
| `rappi`, `rollout`                                                                      | booleanos                                                                                                |                                                            |
| `correo_tienda`, `url_carpeta_contrato`, `url_dictamen_local`                           |                                                                                                          | ligas externas                                             |
| `revisar text[]`                                                                        | —                                                                                                        | motivos de revisión post-importación                       |
| —                                                                                       | Días para apertura (2 campos)                                                                            | **se calculan** desde las fechas                           |
| —                                                                                       | Checklist Pre-Apertura, Evidencias (ligas); Partoo, Google Maps, Cert. Facturación, Perfiles de Baristas | → checklist "Apertura" de la tienda, con la liga si existe |
| —                                                                                       | FINKOK usuario/contraseña, Unsubscribed_*, Record_Image                                                  | no se replican                                             |

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

| Archivo                 | Contenido                                                                         |
| ----------------------- | --------------------------------------------------------------------------------- |
| `…13_crm_modulos.sql`   | `perfil_modulos`, `crm_nivel()`, `crm_puede_leer()`, `crm_puede_editar()`         |
| `…14_crm_esquema.sql`   | tablas del CRM, índices, semilla de etapas de tiendas                             |
| `…15_crm_seguridad.sql` | grants, RLS, `crm_sin_oauth`, triggers de historial y versión, `crm_mover_tienda` |
| `…16_zoho_staging.sql`  | esquema privado de importación                                                    |
| `…17_crm_storage.sql`   | bucket y políticas de `storage.objects`                                           |

**Pruebas (PGlite):** usuario sin módulo no ve nada; `lectura` no escribe; OAuth no lee ni escribe; nadie borra tiendas; mover con versión vieja falla; el historial registra actor y fecha; Storage solo con fila válida; Costeo sigue igual (las pruebas actuales pasan sin tocarlas, incluida la de 42 políticas OAuth).

## 9. Riesgos y checkpoints

| Riesgo                                            | Mitigación                                                                                                            |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `main` despliega directo a producción             | Todo en rama + PR. Preview protegido antes del merge. **Confirmar si Vercel tiene Deployment Protection en previews** |
| Mover el Tablero cambia el enlace guardado de `/` | `/` sigue funcionando (Inicio) y `/costeo` lleva al Tablero                                                           |
| Aplicar migraciones en producción                 | Solo con tu autorización explícita, después de pasar en PGlite                                                        |
| Insertar tu fila en `perfil_modulos`              | Script separado, con tu autorización                                                                                  |
| Volumen de Storage (~95–150 MB)                   | Dentro del plan. Piloto de 5 archivos primero                                                                         |
| Datos personales de leads                         | RLS por módulo, sin OAuth y sin logs con PII                                                                          |

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

## 12. Fase 6 — Portal modular (implementada, 2026-10-19)

- `/` = Inicio (`app/(inicio)`) con las tarjetas de los módulos visibles. `/costeo` = Tablero (movido con `git mv`). `/crm` = panel del CRM (`app/(crm)/crm`), con un estado vacío hasta la Fase 7.
- `lib/portal/modulos.ts`: registro tipado de módulos. `lib/supabase/sesion.ts`: `accesos()` y `sesionCrm()`. **Falla cerrado:** si `perfil_modulos` aún no existe o hay cualquier error, no hay acceso al CRM y Costeo sigue funcionando. Por eso este código puede desplegarse antes que las migraciones.
- `Marco` y `Navegacion` reciben la sección y los módulos visibles. El grupo "Portal" (Inicio y los otros módulos) aparece en todas las secciones. El asistente "Consultar" (Ctrl J) se muestra solo en Costeo.
- Pruebas: `tests/portal/modulos.test.ts` y `tests/portal/navegacion.test.tsx`. La prueba vieja de navegación de Costeo pasa sin cambios.
- **Verificación:** `tsc` sin errores; `next build` con `/`, `/costeo` y `/crm`; 216 pruebas aprobadas (solo falla `paridad`, que ya fallaba por el Excel local). Revisión visual en el arnés (`?modulos`, `?crm`) a 1280×800 y 390×844, sin errores en consola ni scroll horizontal.
- **No verificado:** el flujo con sesión real de Supabase (en local no hay variables de Supabase). Queda para el preview protegido.

## 13. Aplicación en producción (2026-10-20, autorizada por Carlos)

- Revisiones previas de solo lectura en producción: historial con las migraciones 1–12 (igual que el repo), sin objetos del CRM, columnas `file_size_limit` y `allowed_mime_types` presentes, y `create policy` en `storage.objects` permitido (probado dentro de una transacción revertida).
- `supabase db push --dry-run` (CLI 2.121.0) listó solo las migraciones 13–17. Luego `supabase db push` las aplicó desde el commit `8ca1137`. Quedaron registradas en `supabase_migrations.schema_migrations`, así que la integración GitHub ↔ Supabase no las volverá a aplicar al hacer merge.
- Verificado después: 14 tablas con RLS, 0 grants a `anon`, `delete` solo en ligas e ítems, `crm_sin_oauth` en las 14 tablas, las 42 políticas OAuth de Costeo intactas, staging sin acceso, bucket `crm-archivos` privado (25 MB, 8 MIME) con 2 políticas, 15 etapas sembradas.
- Acceso (`perfil_modulos`, registrado en `bitacora`): **Sebastian Cervera Maltos = desarrollador**. **Carlos Valencia = desarrollador**: Carlos creó la cuenta en Auth y luego se le dio perfil `admin` (para que vea todo, a petición suya) y el CRM. Areli Lopez sigue solo con Costeo.
- Preview local (`next dev` contra producción): Inicio muestra Costeo y CRM, `/crm` abre el panel y `/costeo` funciona con los datos reales. La app publicada en Vercel no cambia hasta el merge.

## 14. Fase 7 — Pantallas del CRM (implementadas, 2026-10-20)

| Ruta                       | Contenido                                                                                                                                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/crm`                     | Panel: tiendas por grupo de etapas, prospectos (y cuántos sin estado), actividades vencidas, tiendas por revisar, próximas actividades a 14 días y arranques a 90 días                                    |
| `/crm/tiendas`             | Pipeline Kanban con las 15 etapas, indicadores, búsqueda sin acentos, filtros (tipo de franquicia, por revisar), vista de tabla y "Nueva tienda"                                                          |
| `/crm/tiendas/[id]`        | Expediente: etapa con "Mover a…", archivar, aviso "Revisar"; pestañas Información (secciones del layout de Zoho, edición con versión), Notas e historial, Actividades, Checklists, Documentos y Contactos |
| `/crm/prospectos`, `/[id]` | Lista paginada en el servidor (25 por página, búsqueda y estado en la URL); ficha con cambio de estado, notas e historial                                                                                 |
| `/crm/contactos`, `/[id]`  | Lista con búsqueda y tipo; ficha con sus tiendas ligadas y notas                                                                                                                                          |
| `/crm/actividades`         | Abiertas, vencidas, completadas y todas, con cambio de estado y liga a su registro                                                                                                                        |

- **Kanban:** `@dnd-kit/core` 6.3.1, `@dnd-kit/sortable` 10.0.0 y `@dnd-kit/utilities` 3.2.2, en versiones exactas. Movimiento optimista con `crm_mover_tienda` (versión) y rollback visible si la base lo rechaza. Asa de arrastre para mouse, touch y teclado, con anuncios en español. "Mover a…" como alternativa accesible.
- **Escrituras:** `app/(crm)/crm/acciones.ts`. Cada acción exige nivel de edición (`sesionCrm` + `puedeEditarCrm`); la RLS lo vuelve a exigir. La validación está en `lib/crm/validacion.ts` (lista blanca de campos, fechas, URLs http/https, correos, opciones y archivos de hasta 25 MB con MIME permitido).
- **Archivos:** se registra la fila (la base genera la ruta), se sube directo al bucket privado con la sesión del usuario y se confirma (o se archiva si falla). La descarga usa una URL firmada de 60 s.
- **Ctrl K en el CRM:** tiendas y contactos. Los prospectos se buscan en su lista.
- **Pruebas:** `crm-kanban` (5), `crm-validacion` (3) y `crm-tablero` (3: "Mover a…", rollback, filtros y solo lectura). Suite completa: 230 aprobadas; solo falla `paridad`, que ya fallaba antes (Excel local). `next build` incluye las 8 rutas del CRM.
- **Revisión visual** (arnés `?tiendas` y `?expediente`, datos sintéticos; 1280×800 y 390×844): sin errores de consola ni desborde horizontal. Corregido: el texto `sr-only` de las tarjetas ensanchaba la página (contenedores con scroll ahora `relative`). Rutas reales contra producción: estados vacíos correctos y 404 para IDs inexistentes.
- **Limitación conocida:** con teclado, el arrastre reordena dentro de la columna, pero las flechas no saltan a otra columna. Para cambiar de etapa con teclado se usa "Mover a…".
- **No probado con datos reales:** las escrituras (crear, editar, mover, subir) solo se probaron con datos sintéticos, para no escribir datos de prueba en producción. Se validan en el piloto de la Fase 8.

## 15. Fase 8 — Importación: piloto (2026-10-20, autorizado por Carlos)

- **Código:** `lib/crm/importacion/mapeo.ts` (mapeo puro aprobado en la Fase 4), `lib/crm/importacion/carga.ts` (una transacción, upsert por `zoho_record_id` y huella, reversión) y `scripts/zoho/importar.ts` (comandos `ensayo`, `piloto`, `completa` y `revertir`). La lectura de registros está en `scripts/zoho/registros.ts`, compartida con el auditor.
- **Integridad:** la extracción se detiene si un módulo no trae los mismos registros que `COUNT(id)` o si algún registro llega sin todos sus campos. Se agregó porque un primer ensayo trajo menos estados de Leads de los reales sin ningún error.
- **Tokens:** Zoho limita las renovaciones (~10 cada 10 min, "Access Denied"). El cliente espera 60 s y reintenta hasta 12 veces.
- **Pruebas (PGlite):** `tests/db/crm-importacion.test.ts` cubre el mapeo, la idempotencia, la actualización por huella, la reversión y el historial sin ruido.
- **Ensayo en seco:** 10 tiendas de 10 etapas (en rondas, empezando por las etapas más pobladas y con prioridad a las que tienen más notas, tareas y archivos), 10 prospectos, 4 contactos, 16 actividades, 67 notas y 47 cambios de etapa. Nada se escribió.
- **Piloto cargado en producción**, corrida `af163e6f-9680-4c3f-9cbd-f270cd1479a7` (snapshot 2026-10-20T17:43Z): 10 tiendas, 10 prospectos, 4 contactos, 16 actividades y 67 notas, todos nuevos y sin omisiones. Además 4 ligas tienda-contacto, 5 etiquetas, 10 checklists "Apertura" (70 elementos), 47 cambios de etapa de Zoho y los 14 estados de prospectos. Todo con Carlos como responsable. La conciliación en la base coincide con el ensayo.
- **Segunda corrida** `6ab34659-56db-4daa-9f89-e194bf0fe86a`: los 107 registros quedaron sin cambio (idempotencia confirmada en producción). Además limpió el ruido del historial: solo queda "Importado de Zoho" por registro más los cambios de etapa.
- **Revertir el piloto:** `npx tsx scripts/zoho/importar.ts revertir af163e6f-9680-4c3f-9cbd-f270cd1479a7` (la segunda corrida no creó ni cambió registros).
- **Sin archivos todavía:** su copia necesita la llave secreta de Supabase para subir a Storage. Las descargas de Zoho no requieren scopes nuevos (adjuntos y `download_fields_attachment`).

## 16. Fase 8 — Importación completa y rendimiento (2026-10-20, autorizado por Carlos)

- **Corrida completa** `5e365756-802d-4c82-9c64-df47b766bc9f` (snapshot 2026-10-20T18:22Z; 13.6 min; 229 llamadas a Zoho):

| Módulo              |  Zoho | En el CRM | Nota                                                             |
| ------------------- | ----: | --------: | ---------------------------------------------------------------- |
| Tiendas             |   176 |       176 | 166 nuevas, 10 del piloto                                        |
| Prospectos          | 3,621 |     3,621 | los 15 estados en uso (14 + sin estado) idénticos a la auditoría |
| Contactos           |    51 |        51 | 69 ligas tienda-contacto por cuenta compartida                   |
| Actividades         |   268 |       231 | 37 omitidas: eran de Cuentas (decisión 7)                        |
| Notas               |   497 |       472 | 25 omitidas: Cuentas y Prospectos_Expansion                      |
| Historial de etapas |   536 |       536 | con su fecha original de Zoho                                    |

- **Conciliación con la auditoría:** coinciden tiendas por etapa, prospectos por estado, notas por relación (399 / 56 / 11 / 6), fechas unificadas (apertura 63, aprobación 95, arranque 134), tipo de franquicia (138 / 11), marca de cafetera y estados de actividades. Las 3 tiendas "por revisar" son los conflictos detectados en la Fase 4.
- **Diferencia explicada:** 8 tareas tienen `$se_module = Contacts` en Zoho pero ningún `What_Id` ni `Who_Id`, así que entraron sin relación.
- **Error y corrección:** la huella incluía la posición del Kanban (que depende del lote). Por eso 9 tiendas del piloto se marcaron "actualizadas" y se reescribieron con los datos de Zoho. Lo único perdido fueron los 2 movimientos de etapa de prueba de "Aguascalientes 5". Corregido en `carga.ts` (la huella excluye los campos que solo se fijan al insertar) y cubierto por prueba. **Una próxima corrida actualizará una vez las 176 tiendas** para recalcular su huella con la fórmula nueva.
- **Defectos que solo aparecieron con datos reales, corregidos:** el Panel y la lista de Actividades llamaban funciones de un módulo de cliente desde el servidor (`fechaCorta`, `vencida`), y `claseCampo` no llegaba a los componentes de servidor. Todo se movió a `lib/crm/formato.ts`.
- **Migración 18 (`…18_crm_rls_rendimiento.sql`), aplicada con `db push` (dry-run primero):** las políticas del CRM envuelven las funciones en `(select …)`, así que se evalúan una vez por consulta y no por fila. Contar 3,621 prospectos como usuario pasó de 1,100 ms a 3 ms. El acceso es el mismo: Carlos ve 3,621, un perfil sin CRM ve 0 y OAuth ve 0. Las 42 políticas OAuth de Costeo siguen intactas.
- **Tiempos con datos reales** (`next start` local contra producción, carga completa):

| Pantalla                |             Antes | Después |
| ----------------------- | ----------------: | ------: |
| Panel                   | 3.8 s (con error) |  0.97 s |
| Tiendas (176 tarjetas)  |             2.6 s |  0.96 s |
| Prospectos con búsqueda |             3.3 s |  0.68 s |
| Actividades vencidas    |                 — |  0.69 s |
| Expediente              |             1.0 s |  0.82 s |

- **Archivos:** ver sección 17.

## 17. Fase 8 — Archivos (2026-10-20, autorizado por Carlos)

- **Script:** `scripts/zoho/archivos.ts` (`inventario` | `copiar [--limite N]`). Lee Zoho con `ClienteZoho.descargar` (solo GET a `/crm/v8/*`). Inserta la fila en `crm_archivos` (la ruta la genera el trigger) y luego sube el objeto al bucket privado `crm-archivos` con la clave secreta local. Si la subida falla, borra la fila. Es idempotente por `zoho_attachment_id` (`campo:<id>` para los archivos de campo) y borra las entradas de historial `archivo` de la importación.
- **Inventario Zoho:** hay 292 adjuntos más 83 archivos de campo (Proyecto 3D y Proyecto Ejecutivo).
  - 16 adjuntos quedaron fuera del alcance (Cuentas y Prospectos_Expansion).
  - 83 adjuntos son el gemelo de un archivo de campo (mismo nombre en la misma tienda). Se conserva una sola copia, la del campo.
  - **98 están vacíos en el propio Zoho**: tamaño 0, sin `File_Id`, y la descarga devuelve 0 bytes, verificado con 14 muestras. De ellos, 73 son archivos de campo y 25 son adjuntos, todos de Tiendas creados en 2025-2026. No hay contenido que copiar; quedan contados como omitidos.
- **Copiados: 178 archivos, 94.7 MB.** Piloto de 4 (`0173b184-…`) y resto de 174 (`ccfdb0dc-…`), sin errores ni rechazos.
  - Por destino: 136 de prospectos, 13 de notas, 10 de contactos, 9 adjuntos de tiendas, 7 de Proyecto Ejecutivo (49.7 MB, igual que la auditoría) y 3 de Proyecto 3D.
  - Por tipo: 164 PDF, 8 JPEG y 6 PNG.
- **Conciliación:** las 178 filas tienen su objeto con el mismo tamaño. No hay objetos huérfanos, ruido en el historial ni nombres rotos. La descarga desde el expediente (`next start` en 3100) devuelve un enlace firmado 200 con el PDF íntegro.
- **Nombres:** Zoho guarda algunos nombres en NFD y con UTF-8 leído como Latin-1 ("PresentaciÃ³n"). `nombreLimpio` los repara (prueba en `tests/zoho/archivos.test.ts`).

## 18. Fase 9 — Verificación (2026-10-20)

**Calidad**

- `tsc --noEmit` OK. `vitest run`: 234 pruebas pasan y 5 se omiten. La única que falla es `tests/migracion/paridad.test.ts`, que necesita el Excel de costeo local (`datos/…xlsx`, fuera del repo); viene de main.
- `next build` OK, con las 29 rutas. `git diff --check origin/main...HEAD` limpio.
- `format:check`: los 98 avisos se deben a CRLF de Windows (`core.autocrlf=true`). Con `--end-of-line auto` solo queda `tests/portal/canales.test.ts`, que viene de main.
- No hay lint ni E2E configurados en el repo. Los flujos se verificaron en el navegador contra producción (`next start`, puerto 3100).

**Seguridad.** Matriz RLS medida en producción, dentro de una transacción revertida:

| Perfil                              | Tablas CRM                                                                             | Storage `crm-archivos` | Alta / cambio | Borrar tienda                | Falsificar `zoho_*`       |
| ----------------------------------- | -------------------------------------------------------------------------------------- | ---------------------- | ------------- | ---------------------------- | ------------------------- |
| anon                                | denegado                                                                               | 0                      | denegado      | denegado                     | denegado                  |
| Sin CRM (admin)                     | 0 en todas (ve 2 filas de `perfil_modulos`: por diseño, administra accesos)            | 0                      | 0 filas       | denegado                     | sin filas                 |
| Carlos (desarrollador)              | 176 tiendas, 3,621 prospectos, 51 contactos, 231 actividades, 472 notas, 178 archivos… | 178                    | permitido     | denegado (borrar = archivar) | ignorado por `crm_sellar` |
| OAuth (MCP) con la sesión de Carlos | 0 en todas                                                                             | 0                      | 0 filas       | denegado                     | sin filas                 |

- **Storage por HTTP sin sesión:** la URL pública, la autenticada con la clave anon y la firma con anon responden 400. Desde el expediente, el enlace firmado (60 s) responde 200 con el archivo íntegro.
- **Secretos:** no hay ninguno en el historial de la rama ni en `.next/static`. La única coincidencia es el chequeo de prefijo `sb_secret_` dentro de supabase-js. `.env.local` está ignorado.
- **Equivalentes de advisors (SQL):**
  - Ninguna tabla de `public` está sin RLS.
  - Las 57 políticas del CRM evalúan las funciones con `(select …)`.
  - Las funciones `crm_*` tienen `search_path`.
  - `zoho_staging` no da `usage` a anon ni a authenticated.
  - El bucket es privado con límite de 25 MB.
  - **Informativo:** 16 FK del CRM no tienen índice, todas en tablas de menos de 5 mil filas.
  - **Costeo (ya existía, fuera del CRM):** 11 funciones sin `search_path` fijo y 2 `security definer` ejecutables por anon (`rol_actual`, `registrar_bitacora`).

**QA visual y accesibilidad**

- **Desborde horizontal:** ninguno en 1440, 768, 390 ni 360, en Inicio, Costeo, Productos, Calculadora, Panel CRM, Tiendas, fichas, listas, Actividades y búsqueda vacía.
- **Kanban:** 176 botones "Mover … a otra etapa" como alternativa al arrastre.
- **Movimiento reducido:** la regla global `prefers-reduced-motion` también anula las transiciones inline de dnd-kit.
- **Consola:** limpia en pestaña nueva. El error React #441 solo apareció en una pestaña con mensajes viejos, del reinicio del servidor.
- **Corregido:** el input de archivo del expediente (`sr-only`) recibía foco con Tab sin nombre accesible y duplicaba la parada del botón "Subir archivo". Ahora lleva `tabIndex={-1}` y `aria-hidden`; la ficha tiene 49 controles enfocables, todos con nombre.
- **Costeo, ya existía (idéntico a main):** en 390 px, al abrir un desplegable del Tablero (`/costeo`) la página se ensancha a 544 px. No es regresión; queda como pendiente fuera del CRM.

**Revisión adversarial (revisor independiente, solo lectura).** Cada hallazgo se verificó contra el código antes de corregirlo.

| #   | Hallazgo                                                                                                                                                       | Estado                                                                                                                                                                                 |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Los 159 archivos de prospectos, contactos y notas estaban copiados, pero ninguna pantalla los mostraba                                                         | **Corregido:** pestaña "Documentos" en prospectos, sección en contactos y "Adjuntos de notas" en tiendas (`archivosDe`, `archivosDeNotas`). La descarga se verificó (200, PDF íntegro) |
| 2   | Al renumerar una columna se subía la versión de la tarjeta movida: el movimiento fallaba o quedaba desincronizado                                              | **Corregido:** `moverTienda` valida la versión antes de renumerar, coloca la tarjeta en el índice elegido y el cliente se resincroniza (`router.refresh()`)                            |
| 3   | El rollback optimista deshacía en pantalla movimientos de otras tarjetas que sí se guardaron, y se podía mover dos veces la misma tarjeta con la versión vieja | **Corregido:** `devolver()` regresa solo la tarjeta rechazada, y una tarjeta con un movimiento pendiente no acepta otro (con prueba)                                                   |
| 4   | `revertir` fallaba por la llave foránea de `crm_archivos`, y después del corte borraría trabajo de usuarios                                                    | **Corregido:** se niega si hay archivos ligados o cambios de usuarios en el historial (con prueba)                                                                                     |
| 5   | Reimportar después del corte pisaría con datos de Zoho lo editado en el CRM                                                                                    | **Corregido:** `importar.ts piloto/completa` se niega si `crm_historial` tiene cambios con origen `crm` (producción ya los tiene)                                                      |
| 6   | La comilla `"` en la búsqueda podía romper el filtro `or` de PostgREST                                                                                         | **Corregido** en `textoBusqueda` (con prueba)                                                                                                                                          |
| 7   | Por API, un editor podía fijar `autor_id`, `completado_por` y `archivado_por` ajenos                                                                           | **Migración 19:** `crm_sellar` los sella siempre con el actor real (con pruebas)                                                                                                       |
| 8   | Por API, un editor podía editar `crm_etapas` (`zoho_valor`, `activa`) y desaparecer columnas o desviar la importación                                          | **Migración 19:** las etapas quedan como catálogo (sin alta ni cambio para `authenticated`; la app nunca las escribía)                                                                 |
| 9   | `crm_tienda_contactos.origen` era falsificable                                                                                                                 | **Migración 19:** trigger que fija `origen = 'crm'` para usuarios                                                                                                                      |
| 10  | 16 llaves foráneas sin índice                                                                                                                                  | **Migración 19:** índices parciales                                                                                                                                                    |

**Pendientes menores no corregidos:**

- Si una subida desde el navegador se interrumpe entre el alta de la fila y la subida del objeto, queda una fila activa sin objeto. La descarga muestra un error claro. Es un caso raro. **Fase 10:** `archivos.ts huerfanos` lo detecta en modo de solo lectura.
- El contador de archivos de la tarjeta del Kanban solo contaba los de la tienda. **Corregido en la Fase 10:** ahora suma también los adjuntos de sus notas (`archivosPorTienda`).

**Migración 19 (`…19_crm_autoria.sql`), aplicada con `db push` el 2026-10-20 (dry-run primero, autorizada por Carlos).** Se verificó en producción dentro de una transacción revertida:

- El autor de una nota queda forzado al usuario real.
- `crm_etapas` ya no se puede editar.
- Mover tienda sigue funcionando.
- Lo que ve cada perfil no cambió: Carlos ve 176 tiendas, 3,621 prospectos y 178 archivos; OAuth y el perfil sin CRM ven 0.
- Están los índices nuevos.
- Las pantallas del CRM y de Costeo responden 200, en 0.5–1.2 s.

## 19. Fase 10 — Despliegue (2026-10-20, autorizado por Carlos)

- **Merge:** se integró origin/main en la rama (calculadora, PRs #4 y #5) sin conflictos. El PR sebascm0906/theCoffeeCosteo#6 se mergeó a main (`b96dee4`) y Vercel desplegó the-coffee-costeo.vercel.app.
- **Integraciones:** Supabase Preview se omitió en el PR, así que no se creó una base de preview ni hubo costo. No hacen falta variables nuevas en Vercel.
- **Producción sin sesión:** `/`, `/costeo`, `/crm`, `/crm/tiendas`, `/crm/prospectos` y `/productos/calculadora` responden 307 hacia `/login`, y `/login` responde 200. Hay HSTS activo.
- **Secretos:** se revisaron los 12 scripts del cliente que carga `/login` en producción. No hay claves `sb_secret_`, de Zoho ni JWT de service role.
- **Base:** después del merge, `supabase db push --dry-run` reporta "Remote database is up to date" (migraciones 13–19).
- **Huérfanos de Storage:** `npx tsx scripts/zoho/archivos.ts huerfanos` (solo lectura) no encuentra filas activas sin objeto ni objetos sin fila.
- **Pendiente:** la verificación con sesión iniciada en producción la hace Carlos. Claude no ingresa contraseñas.
