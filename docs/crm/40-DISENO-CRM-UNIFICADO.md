# CRM Unificado — Pipeline general con Ventas, Legal y Proyectos (diseño, Fase A)

- **Fecha:** 2026-11-03 · **Rama:** `feat/crm-unificado` (worktree `theCoffeeCosteo-crm`, desde `origin/main` `fba6cbd`).
- **Fuente del proceso:** «Desarrollo de CRM Unificado» (21-oct-2026), leído completo. Decisiones D1–D10 y pendientes P1–P7 del encargo del 2026-11-03.
- **Estado:** propuesta para el **Checkpoint A**. No hay migraciones nuevas, ni cambios en producción, ni datos movidos. Los conteos de muestra salen de lecturas en una transacción `read only`.

## 0. Resumen en una pantalla

1. **Una sola card que cambia de forma.** Hasta la etapa 5 la card es un **franquiciatario** (entidad nueva `crm_franquiciatarios`, que nace del prospecto). Al cerrar la 5 se crea su primera **sucursal** (la `crm_tiendas` de hoy, ligada al franquiciatario), y esa card recorre de la 6 a Operando. Un franquiciatario puede tener varias sucursales.
2. **Las etapas y sus requisitos son datos, no código.** El pipeline `general` tiene 10 etapas, 6 provisionales de Proyectos y 4 finales o laterales. Cada etapa tiene **requisitos** con tipo, área que cumple y área que valida. Proyectos y los flujos por área se agregan como filas.
3. **Los candados están en la base.** La etapa solo cambia con `crm_avanzar()`, que revisa requisitos, área y versión. Un `UPDATE etapa_id` directo se rechaza. Un **head** puede liberar un candado con `crm_liberar_candado()` dando un motivo; queda en la bitácora y la card lo muestra.
4. **Bitácora inalterable.** `crm_historial` gana nombre y área del actor al momento, origen y las acciones nuevas. Triggers en **todas** las tablas del CRM, incluidos los DELETE. Un trigger rechaza cualquier UPDATE o DELETE sobre la bitácora, también del dueño de la tabla.
5. **Áreas y roles en una tabla de membresías.** Las áreas son `ventas`, `legal`, `proyectos` y, más adelante, `finanzas`. Los roles son `head`, `miembro` y `lectura`, más roles funcionales como «Aprobación de locales». `perfil_modulos` sigue siendo la puerta del módulo; el nivel `desarrollador` puede todo.
6. **Avisos de tiempo.** Una vista calcula los vencimientos (COF a 2 meses, 5 días hábiles con festivos, límite de 120 días). Los avisos se guardan de forma idempotente. Propongo `pg_cron` diario; está disponible pero sin instalar, así que activarlo requiere tu OK.
7. **Muestra.** 3,621 prospectos y 52 franquiciatarios derivados de las 176 tiendas se mapean a las etapas nuevas solo para visualizar. Se guarda la etapa original y queda marcado `muestra = true`. La limpieza queda escrita y probada en local, sin ejecutar.

## 1. Línea base (A1)

| Tema | Hoy (`origin/main`, prod en migración 29) |
| --- | --- |
| Tablas | 13 `crm_*` (migraciones 13–19). `crm_etapas` con embudos `tiendas` (15) y `prospectos` (14 estados de Zoho) |
| Escrituras | Server actions en `app/(crm)/crm/acciones.ts` + RLS (`crm_puede_editar()`); Kanban con `crm_mover_tienda` (versión optimista) |
| Bitácora | `crm_registrar_historial` (trigger, `security definer`) en INSERT/UPDATE de 7 tablas; `actor_id`, `fecha`, `cambios` antes/después; usuarios solo con `select` |
| Pruebas | `tsc` OK; `vitest` 632 aprobadas y 5 omitidas. Solo falla `tests/migracion/paridad.test.ts`, que ya fallaba porque necesita el Excel local |

**Huecos de trazabilidad** (cerrados en §6):

- No se registran los DELETE. Hoy se borran sin rastro los ítems de checklist, las ligas tienda-contacto y las etiquetas.
- No dejan rastro la creación de una lista de checklist, las etiquetas, las ligas, las descargas de archivos ni los cambios de acceso. Estos últimos van a la `bitacora` de Costeo.
- Solo se guarda `actor_id`; si el perfil cambia de nombre, el historial «cambia».
- `origen` no distingue agente ni sistema (avisos automáticos).
- Nada impide que el dueño de la tabla (rol de migraciones o `service_role`) edite o borre filas.

**Muestra en producción (2026-11-03, solo lectura):**

| Tiendas por etapa | n | | Prospectos por estado | n |
| --- | ---: | --- | --- | ---: |
| Firma de contrato | 58 | | (sin estado) | 2,130 |
| En búsqueda de local | 7 | | Interés en zona bloqueada | 895 |
| Local aprobado por México / Brasil | 4 / 0 | | Contactado | 397 |
| Arquitecta asignada | 4 | | Correo inicial enviado | 95 |
| Proyecto 3D / Ejecutivo | 3 / 5 | | Con interés | 45 |
| En remodelación | 11 | | Lead perdido / Sin interés / Basura | 25 / 4 / 4 |
| Entrega de local / Capacitación | 0 / 1 | | Posible cierre | 14 |
| Operando | 72 | | Sin respuesta / Attempted | 3 / 3 |
| Standby / Modificaciones pend. | 4 / 1 | | Fee inicial liquidado / Nuevo franquiciatario | 2 / 2 |
| Cancelada / Cerrada | 4 / 2 | | Apartado pagado / Reanudar a futuro | 1 / 1 |

- **Franquiciatarios:** 176 tiendas de **52** franquiciatarios distintos (texto normalizado). 2 tiendas no tienen franquiciatario. Por número de tiendas: 32 con 1; 9 con 2; 4 con 3; 1 con 4, 5, 9 y 11 tiendas; 3 con 23, 24 y 36.
- **Archivos activos:** 178 (136 de prospectos, 19 de tiendas, 13 de notas y 10 de contactos).
- **Checklists:** 176 «Apertura» con 1,232 ítems, 4 hechos.
- **Historial:** 4,079 eventos «importado», 536 cambios de etapa de Zoho y **4** movimientos hechos en el CRM.
- **Accesos:** 4 usuarios con CRM `desarrollador`.

## 2. Apartados del módulo (§5.1)

| Apartado | Ruta | Contenido | Quién |
| --- | --- | --- | --- |
| **Panel** | `/crm` | Cards por etapa y por área, bloqueadas por candado, candados liberados (30 días), vencimientos de 14 días, movimientos recientes, mis pendientes (5) | Todos |
| **PIPELINE** | `/crm/pipeline` | Kanban de las etapas en **tres tramos con encabezado de área**: Ventas (1–5), Locales y Legal (6–8), Proyectos (provisionales) y Legal (9–10). Laterales y finales plegados al final. Filtros: área, responsable, ciudad, candado (todos / bloqueadas / listas para avanzar / liberadas), vencimiento, tipo de card y «solo muestra». Vista de tabla | Todos (lectura) |
| **Franquiciatarios** | `/crm/franquiciatarios` y `/[id]` | Lista y expediente por persona o empresa: Survey, obligado solidario, datos fiscales, documentos y sus sucursales | Todos |
| **Mis pendientes** | `/crm/pendientes` | Requisitos que me toca cumplir o validar (yo o mi área), avisos sin atender y cards de mi área listas para avanzar. Ordenado por urgencia (vencido, hoy, 7 días, sin fecha) | Cada usuario |
| **Vencimientos** | `/crm/vencimientos` | Calendario mensual y lista: apertura estimada y confirmada, límite de 120 días, ventana COF (apertura − 2 meses) y aviso de 5 días hábiles | Todos |
| **Bitácora** | `/crm/bitacora` | Trazabilidad global con filtros (persona, área, card, acción y fechas) y exportación a Excel | Todos (lectura) |
| **Contactos** · **Actividades** | `/crm/contactos`, `/crm/actividades` | Se conservan con el rediseño (letrero, filtros y estados) | Todos |
| **Administración** | `/crm/admin` | Usuarios por área y rol, etapas (nombre, orden, provisional), requisitos por etapa y festivos | Heads y desarrolladores |

**Ajuste propuesto:** el antiguo apartado **Prospectos** desaparece del menú y su contenido vive en el Pipeline (etapas 1–2). `/crm/prospectos` redirige a `/crm/pipeline?tramo=ventas`. Las fichas `/crm/prospectos/[id]` redirigen al franquiciatario que nació de ese prospecto, que en la muestra existe para todos.

**Rutas antiguas:** `/crm/tiendas` → `/crm/pipeline?card=sucursal`. `/crm/tiendas/[id]` → `/crm/sucursales/[id]` (redirección permanente; los enlaces del agente y del Ctrl K se actualizan).

## 3. La card (§5.2)

**Cara en el Pipeline** (máximo 4 líneas útiles):

```
┌───────────────────────────────────────────┐
│ ▍Ventas  Etapa 4 · Perfilamiento y PLD    │  ← barra y chip con el color del área responsable
│ Mariana Ortiz Díaz                         │  ← franquiciatario (o «Sucursal · Franquiciatario»)
│ Querétaro                                  │
│ 🔒 3/7 requisitos · Falta: PLD (Ventas)    │  ← candado con ícono + texto, nunca solo color
│ ⏱ PLD original · vence en 4 días          │  ← insignia de vencimiento (si aplica)
│ 📎 4  🗒 2   ·   Luis · hoy 10:42   ⚑ liberado │
└───────────────────────────────────────────┘
```

- **Estado del candado:** `Bloqueada` (falta un requisito obligatorio), `Lista para avanzar` (todo cumplido y validado) o `Candado liberado` (un head la liberó; la marca se queda visible en la card y en su línea de tiempo).
- **«Siguiente acción»:** el primer requisito pendiente en orden y el área a la que le toca.
- **Muestra:** una franja tenue «Muestra» en la esquina; filtro «Ocultar muestra».

**Expediente** (página propia, enlazable). Pestañas:

1. **Resumen:** etapa, responsable, áreas, fechas clave, sucursales (si es franquiciatario) y acciones «Avanzar» o «Liberar candado».
2. **Requisitos:** checklist de la etapa actual y de las anteriores, plegadas. Cada requisito muestra el documento o dato que exige, quién lo cumplió, quién lo validó y cuándo. Un pop-up `ConInfo` explica qué pide el candado y por qué.
3. **Documentos:** agrupados por tipo (comprobante de apartado o de pago, Survey, PLD digital y original, CSF, carta de intención, propuestas de local, dictamen, contrato de arrendamiento, constancia, COF y contrato de franquicia). Guarda versiones: una nueva conserva la anterior, y retirar uno pide motivo.
4. **Notas** · 5. **Actividades** · 6. **Sucursales** (solo franquiciatario).
7. **Trazabilidad:** línea de tiempo de la card (y de sus sucursales, con filtro) con nombre, área, fecha y hora (zona de México).

## 4. Etapas y requisitos (§5.3)

`crm_etapas` se extiende con el embudo `general` y estas columnas:

- `clave`: texto estable.
- `numero`: número del documento.
- `area_id`: área que mueve la card.
- `areas_participan`.
- `card`: `franquiciatario` o `sucursal`.
- `opcional`.
- `provisional`.

Los embudos `tiendas` y `prospectos` se conservan para poder revertir la muestra.

**Leyenda de requisitos:**

- **Tipo:** D = documento, F = fecha, V = validación, Fi = firma (documento + fecha de firma), Da = dato.
- **Cumple/Valida:** área que cumple / área que valida.
- **Cand.:** **Sí** = candado de salida; «aviso» = no bloquea.

### Card de franquiciatario

| # | Etapa (área que mueve) | Requisito | Tipo | Cumple / Valida | Cand. |
| --- | --- | --- | --- | --- | --- |
| 1 | **Recepción, clasificación y asignación** (Ventas) | Contacto (correo o teléfono) · Ciudad de interés · Origen de captación | Da | Ventas | Sí |
| | | Resultado territorial: disponible / restringida / exclusiva / bloqueada | V | Ventas | Sí; si es **bloqueada**, solo puede ir a Standby o Descartada |
| | | Vendedor asignado | Da | Ventas | Sí |
| 2 | **Contacto inicial y seguimiento** (Ventas) | Fecha de primera reunión | F | Ventas | Sí |
| | | Información comercial enviada (plantilla única) | F | Ventas | Sí |
| 3 | **Revisión de contrato por el prospecto** — *opcional* (Ventas) | Comprobante del apartado ($50,000 + IVA) | D | Ventas | Sí |
| | | Pago del apartado validado por Finanzas | V | Ventas (P1) / Finanzas | Sí |
| | | Solicitud a Legal (nombre, contacto, comprobante, confirmación) | F | Ventas | Sí |
| | | Contrato enviado al prospecto y fecha | F | **Legal** (no puede marcarlo sin los dos anteriores) | Sí |
| 4 | **Perfilamiento, PLD y formalización** (Ventas) | Confirmación de interés | F | Ventas | Sí |
| | | Survey completo (firmante, obligado solidario, documentos) | D + V | Ventas | Sí |
| | | Formato PLD firmado, copia digital | D | Ventas | Sí |
| | | Instrucciones de pago enviadas (requiere Survey validado y PLD) | F | Ventas | Sí |
| | | Comprobante de liquidación del fee | D | Ventas | Sí |
| | | Pago validado por Finanzas → pasa a **franquiciatario** | V | Ventas (P1) / Finanzas | Sí |
| 5 | **Bienvenida, carta de intención y facturación** (Ventas) | Correo de bienvenida (copia a Legal y Finanzas) | F | Ventas | Sí |
| | | Carta de intención firmada y fecha | Fi | **Legal** | Sí; si la fecha difiere del pago: aviso |
| | | Solicitud de factura: CSF y datos fiscales | D | Ventas | Sí |
| | | **PLD original recibido en corporativo** (fecha) | F | Ventas | Sí (ver pregunta Q1) |

Al cerrar la 5, la card de franquiciatario queda **Formalizada**: sale del Pipeline y sigue en Franquiciatarios. Se crea la primera sucursal en la etapa 6 con el formulario «Nueva sucursal» (ciudad y nombre provisional). Desde el expediente del franquiciatario se pueden agregar más sucursales cuando haga falta.

### Card de sucursal

| # | Etapa (área que mueve) | Requisito | Tipo | Cumple / Valida | Cand. |
| --- | --- | --- | --- | --- | --- |
| 6 | **Recepción, evaluación y aprobación de locales** (rol Aprobación de locales) | *Entrada:* carta de intención firmada del franquiciatario | — | — | Sí |
| | | Lineamientos y formatos enviados | F | Aprob. locales | Sí |
| | | Propuesta(s) de local | D | Aprob. locales | Sí |
| | | Dictamen y resolución del Comité | D + V | Aprob. locales | Sí |
| | | Dictamen firmado por el franquiciatario | Fi | Aprob. locales | Sí |
| 7 | **Constancia de arrendamiento** (Legal) | Contrato de arrendamiento firmado | D | Aprob. locales | Sí |
| | | Solicitud de constancia a Legal | F | Aprob. locales | Sí |
| | | Constancia firmada (fecha de firma) | Fi | Legal / Legal | Sí |
| | | Fecha límite de apertura (por defecto firma + 120 días, editable) | F | Legal | Sí |
| 8 | **Transferencia a Proyectos** (Legal) | Transferencia habilitada | V | Legal | Sí |
| | | Fecha estimada de apertura (se mantiene actualizada) | F | Proyectos | Sí |
| | | ID oficial en Jestor | Da | Ventas | aviso |
| P1–P6 | **Provisionales de Proyectos** (Proyectos): Arquitecta asignada → Proyecto 3D → Proyecto ejecutivo → En remodelación → Entrega de local → Agenda de capacitación | sin requisitos hasta el documento de Diego | — | — | No |
| 9 | **Circular Oferta de Franquicia (COF)** (Legal) | Aviso a Legal a 2 meses de la apertura estimada | V (sistema) | — | aviso |
| | | COF enviada | F | Legal | Sí |
| | | COF firmada y fecha de entrega | Fi | Legal | Sí; si es tardía, se marca y se sugiere la fecha mínima legal |
| 10 | **Contrato de franquicia y apertura** (Legal) | Fecha confirmada de apertura, ≥ 5 días hábiles antes | F | Proyectos | Sí |
| | | Contrato de franquicia firmado por franquiciatario **y** obligado solidario | Fi (2 firmas) | Legal | Sí |
| | | Liberación para apertura | V | Legal | Sí → **Operando** |

**Laterales y finales:**

- **Standby:** se entra y se sale con motivo; vuelve a la etapa de donde salió.
- **Descartada:** solo para la card de franquiciatario; reemplaza a Lead perdido, Sin interés, Basura y Zona bloqueada.
- **Cancelada** y **Cerrada:** solo sucursal.
- **Operando:** sucursal, después de la liberación.

**Franquiciatario cancelado con sucursales activas:** `crm_avanzar` lo impide mientras tenga sucursales abiertas. Un head puede hacer **cancelación en cascada** con motivo, y cada sucursal deja su propio evento.

## 5. Candados, permisos y áreas (§5.4–5.5)

### Tablas nuevas

| Tabla | Para qué |
| --- | --- |
| `crm_areas` | `clave` (`ventas`, `legal`, `proyectos`, `finanzas`), `nombre`, `color`, `activa` (Finanzas nace inactiva) |
| `crm_membresias` | `user_id`, `area_id`, `rol` (`head` / `miembro` / `lectura`), `funciones text[]` (`aprobacion_locales`, `valida_finanzas`), vigencia |
| `crm_franquiciatarios` | Card de franquiciatario: datos del prospecto y del Survey (firmante, obligado solidario, datos fiscales), territorio, origen, vendedor, `etapa_id`, `posicion`, `version`, `prospecto_id`, `muestra`, `etapa_origen` |
| `crm_tiendas` | **Se reutiliza como sucursal**. Agrega `franquiciatario_id`, `fecha_estimada_apertura`, `fecha_confirmada_apertura`, `fecha_limite_apertura`, `muestra` y `etapa_origen_id` |
| `crm_requisitos` | Catálogo por etapa: `clave`, `nombre`, `tipo`, `area_cumple`, `area_valida`, `obligatorio`, `tipo_documento`, `depende_de`, `orden`, `ayuda` |
| `crm_cumplimientos` | Requisito × card: estado (`pendiente`, `cumplido`, `validado`, `no_aplica`), valor (fecha o dato), archivo, quién y cuándo cumplió y validó |
| `crm_liberaciones` | Candado liberado: card, etapa, requisitos faltantes (copia), motivo, head, fecha. Se consume en el siguiente avance |
| `crm_avisos` | Tipo, card, área destino, fecha objetivo, generado, atendido por y cuándo. Único por (tipo, card, fecha objetivo) |
| `crm_festivos` | Fecha y nombre (editable desde Administración) |

**Por qué membresías y no extender `perfil_modulos`:** una persona puede estar en dos áreas (Sebastián: desarrollador y Aprobación de locales), y el rol de área es independiente del nivel de módulo. `perfil_modulos` sigue siendo la llave de entrada para Costeo, Sucursales y CRM, sin cambiar su CHECK ni las funciones de Sucursales.

### Funciones (todas `security definer` con `search_path` fijo, bloqueadas para OAuth)

- **Consultas de permisos:**
  - `crm_mis_areas()`: áreas del usuario.
  - `crm_es_head()`.
  - `crm_puede_operar(area)`: miembro o head de esa área, o desarrollador.
- **`crm_cumplir(requisito, card, valor, archivo)`** y **`crm_validar(…)`:**
  - Revisan el área que cumple o valida y el orden de las dependencias.
  - Sus escrituras directas a `crm_cumplimientos` no tienen grant.
- **`crm_avanzar(tipo_card, card, etapa_destino, version)`:**
  1. Revisa que el área del usuario mueva la etapa actual (o que sea head o desarrollador).
  2. Revisa que el destino sea la siguiente etapa, o la siguiente válida si la etapa es opcional, o una lateral o final permitida.
  3. Revisa que todos los requisitos obligatorios estén `validado` o `no_aplica`, salvo que haya una liberación sin consumir.
  4. Revisa la versión.
  5. Pone `set_config('crm.avance', 'si', true)` y actualiza.
  - Un trigger en `crm_tiendas` y `crm_franquiciatarios` rechaza cambiar `etapa_id` sin esa marca.
  - Al cerrar la 5 crea la sucursal.
- **`crm_omitir_etapa(card, etapa, motivo)`:** solo para la etapa 3; deja los requisitos en `no_aplica` con su registro.
- **`crm_liberar_candado(card, motivo)`:** solo heads; el motivo debe tener al menos 15 caracteres.
- **Kanban:** `crm_mover_tienda` se conserva para reordenar dentro de una columna. Cambiar de columna llama a `crm_avanzar`, y el arrastre a una etapa no permitida regresa la card con el motivo.

**Quién puede qué:**

| Acción | Miembro del área | Head | Desarrollador | Lectura |
| --- | --- | --- | --- | --- |
| Ver Pipeline y expedientes | Sí (todas las áreas, P5) | Sí | Sí | Sí |
| Cumplir requisitos de su área | Sí | Sí | Sí | No |
| Validar requisitos de su área | Sí | Sí | Sí | No |
| Avanzar card de una etapa de su área | Sí | Sí (cualquiera) | Sí | No |
| Liberar candado | No | **Sí** | No (salvo que también sea head) | No |
| Editar etapas, requisitos y festivos | No | Sí | Sí | No |
| Dar accesos | No | No (los da Carlo) | Sí, con OK de Carlo | No |

**Visibilidad por área (D9, P5), diseñada y sin activar:** `crm_visibilidad(area, apartado, campo, visible)`. Las vistas de lectura y la RLS de columnas sensibles (datos de Ventas, PLD y datos fiscales) la consultarían. Hoy todas las filas quedan en `visible`.

## 6. Trazabilidad (§5.6, requisito principal)

`crm_historial` se extiende sin perder las 4,619 filas actuales.

**Columnas nuevas:**

- `actor_nombre` y `actor_area`: copia al momento del evento.
- `franquiciatario_id`.
- `origen`: se agregan `agente` y `sistema`.
- `motivo`.
- `accion`: se agregan `requisito_cumplido`, `requisito_validado`, `requisito_revertido`, `candado_liberado`, `etapa_omitida`, `sucursal_creada`, `archivo_version`, `archivo_retirado`, `archivo_descargado`, `acceso`, `aviso`, `eliminado`, `liga` y `etiqueta`.

**Escrita por la base:**

- Triggers AFTER INSERT, UPDATE y **DELETE** en todas las tablas del CRM, incluidas `crm_checklists`, ligas, etiquetas, membresías y `perfil_modulos` cuando el módulo es CRM.
- Las descargas se registran con una RPC `crm_registrar_descarga()` antes de firmar la URL.

**Inalterable:**

- Sin grants de UPDATE ni DELETE para nadie.
- Trigger `crm_historial_inalterable` BEFORE UPDATE OR DELETE que lanza excepción. Bloquea también al dueño y a `service_role`; solo se evita desactivando el trigger, lo cual exige DDL y queda en el registro de migraciones.

**Fecha:** `timestamptz`; se muestra en `America/Mexico_City` («Luis · 3 nov 2026, 10:42»).

**Archivos:**

- `crm_archivos` gana `version`, `reemplaza_a` y `motivo_retiro`.
- Nunca se sobrescribe un objeto: la ruta sigue siendo aleatoria por versión.
- Retirar exige motivo, y Storage sigue sin UPDATE ni DELETE.

## 7. Avisos (COF, 5 días hábiles, 120 días)

- **Vista `crm_v_vencimientos`:** por sucursal calcula:
  - `ventana_cof` = estimada − 2 meses.
  - `aviso_5_habiles` = confirmada − 5 días hábiles, saltando fines de semana y `crm_festivos`.
  - `limite_120`, vencido y días restantes.
  - Siempre está al día, sin costo.
- **Materialización:** `crm_generar_avisos()` (idempotente) inserta en `crm_avisos` lo que entra en ventana y deja un evento `sistema` en la bitácora («Aviso a Legal: COF de Juriquilla, apertura estimada 15 ene»).

**Opciones para correrla:**

| Opción | Cómo | Costo | Riesgo |
| --- | --- | --- | --- |
| **A (recomendada)** | `pg_cron` diario 07:00 MX + al abrir Panel y Mis pendientes | $0 (incluido en Supabase) | Activar la extensión es un cambio en producción, así que requiere tu OK |
| B | Solo al abrir Panel y Mis pendientes | $0 | Si nadie entra, el aviso se genera tarde, aunque la vista siempre muestra lo vencido |
| C | Cron de Vercel → ruta interna | Plan Hobby: 1 diario | Necesita un secreto y acceso a Vercel (Carlos no lo tiene) |

**COF tardía:** si la COF se firma después de `estimada − 2 meses`, la card muestra «COF tardía: apertura mínima legal = firma + 2 meses» y Proyectos decide. No cambia la fecha sola.

## 8. Mapeo de la muestra (§5.7, propuesta)

**Prospectos → card de franquiciatario** (3,621):

| Estado de Zoho | n | Etapa nueva |
| --- | ---: | --- |
| (sin estado) | 2,130 | 1 Recepción |
| Interés en zona bloqueada | 895 | 1 Recepción, territorio = bloqueada (o **Descartada**: ver Q3) |
| Correo inicial enviado · Contactado · Con interés · Attempted · Sin respuesta | 95 · 397 · 45 · 3 · 3 | 2 Contacto inicial |
| Posible cierre | 14 | 2 Contacto inicial |
| Apartado pagado | 1 | 3 Revisión de contrato |
| Fee inicial liquidado | 2 | 4 Perfilamiento y PLD |
| Nuevo franquiciatario | 2 | 5 Bienvenida y carta |
| Reanudar a futuro | 1 | Standby |
| Lead perdido · Sin interés · Lead basura | 25 · 4 · 4 | Descartada |

**Tiendas → card de sucursal** (176), con 52 franquiciatarios derivados del texto `franquiciatario`, en estado **Formalizado**. Las 2 sin franquiciatario quedan ligadas a «Sin franquiciatario (muestra)».

| Etapa de Zoho | n | Etapa nueva | Nota |
| --- | ---: | --- | --- |
| Firma de contrato | 58 | **6** Locales | Ver la nota debajo de la tabla |
| En búsqueda de local | 7 | 6 Locales | |
| Local aprobado por México / Brasil | 4 / 0 | **7** Constancia | El local ya está aprobado; sigue la constancia |
| Arquitecta asignada … Agenda de capacitación | 4 · 3 · 5 · 11 · 0 · 1 | Provisionales de Proyectos con el mismo nombre | |
| Operando | 72 | Operando | |
| Standby · Modificaciones pendientes | 4 · 1 | Standby | |
| Cancelada · Cerrada | 4 · 2 | Cancelada · Cerrada | |

**Por qué «Firma de contrato» no va a la 5:** el encargo sugería la etapa 5, pero en D2 la 5 es del franquiciatario y la sucursal nace en la 6. Esas tiendas ya tienen contrato y esperan local, que es justo el inicio de la 6.

**Sin requisitos cumplidos:** ninguna card de muestra tendrá requisitos cumplidos, porque no existen esos datos en Zoho. Todas aparecerán **bloqueadas** en su etapa, salvo Operando y las finales. La card lo explica: «Muestra: sin requisitos registrados».

**Reversible:**

- Se guardan `etapa_origen_id` y `muestra = true`. El mapeo es un **script** (`scripts/crm/muestra-mapear.ts`, `ensayo` / `aplicar` / `revertir`), no una migración, porque mover etapas de datos requiere tu OK aparte.
- **Conteos esperados en el Pipeline:** etapa 1 = 3,025; 2 = 557; 3 = 1; 4 = 2; 5 = 2; Standby = 1 + 5; Descartada = 33; 6 = 65; 7 = 4; provisionales = 24; Operando = 72; Cancelada / Cerrada = 4 / 2.

**Limpieza para arrancar de cero** (`scripts/crm/limpiar-muestra.ts`, probado en PGlite, **no se ejecuta**):

1. Respaldo lógico completo en `Respaldos/thecoffee-supabase` y verificación del respaldo.
2. Borrar las filas con `muestra = true` y sus dependientes (notas, actividades, cumplimientos, archivos y objetos de Storage), en una transacción.
3. **Se conservan:** usuarios, membresías, áreas, etapas, requisitos, festivos, configuración y **toda la bitácora**, que es inalterable. Un evento `sistema` marca la limpieza y la Bitácora filtra «muestra» por defecto.

## 9. Agente (§5.8)

Solo en el CRM, en lectura, con la sesión y los permisos del usuario. Herramientas nuevas o actualizadas:

- `cards_bloqueadas`: requisitos faltantes y área.
- `quien_movio(card)`: eventos de etapa con actor, área, fecha y motivo.
- `vencimientos(rango)`: COF, 5 días hábiles y 120 días.
- `expediente(card)`.
- `bitacora(filtros)`.

Las consultas del agente no escriben. Si en el futuro escribe, su origen será `agente`.

## 10. Diseño (§5.9)

- **Tema del portal:** muro y lambrín, letrero como título (`Encabezado`), tarjetas blancas o vitrina, `ConInfo` para explicaciones. Modo noche con `html[data-luz='noche']`: las superficies siguen claras, así que los colores se validan sobre blanco.
- **Color por área.** Validado con `validate_palette.js`, todos los pares: daltonismo ΔE ≥ 14, visión normal ≥ 18, contraste ≥ 3:1. No usa los colores de estado (verde, ámbar, rojo):

| Área | Color | Uso |
| --- | --- | --- |
| Ventas | `#2a78d6` azul | Barra lateral de la card, punto del chip y encabezado del tramo |
| Legal | `#c2457f` frambuesa | Igual |
| Proyectos | `#d9741a` naranja | Igual |
| Finanzas (futuro) | por validar al activarla | — |

  El texto siempre va en tinta, nunca en el color del área.
- **Candado:** ícono + texto («Bloqueada · falta PLD», «Lista para avanzar», «Candado liberado»), con colores de estado `bad`, `ok` y `warn` solo como apoyo.
- **Densidad:** cards de 4 líneas como máximo; columnas de 288 px. En 375 px el Kanban se desplaza **dentro** de su contenedor con un selector de tramo arriba. Estados de carga, vacío, error, sin permiso y bloqueado.
- **Movimiento:** solo como respuesta a una acción: la card regresa si se rechaza y el candado se abre al validar. Respeta `prefers-reduced-motion`.

## 10 bis. Prototipo (A3)

**Cómo abrirlo:** `npm run prueba:visual -- --port 4184` en el worktree. Luego abre `/?pipeline` y `/?expediente-unificado` (también con `&tab=trazabilidad`, `&tab=documentos` o `&liberar`). Agrega `&noche` para el modo noche.

**Datos:** sintéticos, con nombres inventados. Los totales de cada columna son los de la muestra mapeada (§8). No hay datos personales de Zoho.

**Código** (pensado para reutilizarse en la Fase B, sin servidor ni base todavía):

- `lib/crm/unificado/modelo.ts`: tipos, colores de área, reglas del candado, tramos y fechas en hora de México.
- `components/crm/unificado/card-pipeline.tsx`: card, chip de etapa y estado del candado.
- `components/crm/unificado/pipeline.tsx`: Kanban por tramos, filtros y tope de 50 cards por columna.
- `components/crm/unificado/expediente.tsx`: requisitos, documentos con versiones, línea de tiempo y el diálogo para liberar el candado.

**Capturas** en `docs/crm/capturas-40/`:

| Archivo | Qué muestra |
| --- | --- |
| `pipeline-escritorio-dia.png` · `pipeline-escritorio-noche.png` | Pipeline a 1440 px: tramo de Ventas, cards bloqueadas, listas y liberadas, y «Ver las 3,025 en tabla» |
| `pipeline-movil-noche.jpg` | 375 px: el Kanban se desplaza dentro de su contenedor y la página no desborda (`scrollWidth` = 375, medido) |
| `expediente-requisitos-escritorio.png` | Sucursal en la etapa 9 (COF): etapas anteriores plegadas, la etapa actual con quién registró y validó, y el botón de avanzar deshabilitado |
| `expediente-trazabilidad-escritorio.png` | Línea de tiempo con área, fecha y hora, el aviso automático y el candado liberado con su motivo |
| `expediente-documentos-noche.png` | Documentos por tipo, con la versión anterior conservada |
| `expediente-liberar-candado.png` | Diálogo de un head: lista de lo que falta y motivo obligatorio (mínimo 15 caracteres) |
| `expediente-movil-noche.jpg` | Expediente a 375 px |

**Revisión hecha:**

- Consola sin errores.
- 375 px sin desborde en Pipeline y expediente. Corregido: el botón «Avanzar a…» ensanchaba la página a 386 px.
- El texto nunca queda sobre la madera. Corregido: los títulos de tramo ahora van en una placa.

**Fuera del prototipo:** el menú lateral todavía es el actual (Tiendas y Prospectos); el nuevo está en §2. Tampoco están el Panel, Mis pendientes, Vencimientos, Bitácora ni Administración: siguen el mismo lenguaje y se construyen en la Fase B.

## 11. Migraciones previstas (Fase B)

El número final se fija al abrir el PR, porque otras ramas también usan el 30. Todas se prueban en PGlite.

| Archivo | Contenido |
| --- | --- |
| `…30_crm_areas.sql` | `crm_areas`, `crm_membresias`, funciones de permisos y semilla de las 3 áreas + Finanzas inactiva |
| `…31_crm_pipeline.sql` | Columnas de etapas, embudo `general` (semilla de etapas), `crm_franquiciatarios`, columnas nuevas en `crm_tiendas` y `crm_archivos` |
| `…32_crm_requisitos.sql` | `crm_requisitos` (semilla §4), `crm_cumplimientos`, `crm_liberaciones` y funciones `crm_cumplir`, `crm_validar`, `crm_avanzar`, `crm_omitir_etapa`, `crm_liberar_candado` |
| `…33_crm_bitacora.sql` | Columnas nuevas de `crm_historial`, triggers con DELETE, `crm_historial_inalterable` y registro de descargas |
| `…34_crm_avisos.sql` | `crm_festivos` (semilla 2026–2027 oficiales MX), `crm_v_vencimientos`, `crm_avisos` y `crm_generar_avisos()`. `pg_cron` va en un archivo aparte (**35**), solo si lo autorizas |

**Pruebas nuevas (PGlite):** candados (sin requisito no avanza; área ajena no avanza; head libera con motivo; miembro no libera), bitácora (cada acción deja evento; UPDATE y DELETE fallan incluso como dueño), permisos por área, franquiciatario → sucursal, avisos con un festivo de por medio, mapeo y reversión de muestra, y limpieza en local. Además, regresiones de Costeo, Sucursales y CRM.

## 12. Pendientes P1–P7 (propuesta por defecto)

| ID | Propuesta |
| --- | --- |
| P1 | Ventas registra la validación de Finanzas con evidencia adjunta, y queda «validado por Finanzas (registrado por Luis)». Cuando exista el área Finanzas, el requisito cambia `area_valida` y nada más |
| P2 | Rol funcional `aprobacion_locales` en `crm_membresias.funciones`, asignable a cualquier usuario. Mueve las etapas 6–7 |
| P3 | 6 provisionales de Proyectos con el nombre de Zoho, marcadas «Provisional» en datos y en pantalla |
| P4 | Lunes a viernes + `crm_festivos` editable (semilla con los festivos oficiales de la LFT) |
| P5 | Todos leen todo; `crm_visibilidad` queda diseñada e inactiva |
| P6 | Avisos dentro del CRM; el correo queda para una fase posterior |
| P7 | Correos de Andrés, Luis y Diego: se piden cuando toque dar accesos |

## 13. Respuestas de Carlo (2026-11-03) — OK al Checkpoint A

| # | Decisión |
| --- | --- |
| Q1 | **PLD original** es candado para cerrar la **etapa 5** (no la 4) |
| Q2 | **Carril paralelo:** los requisitos de la COF (9) y del contrato (10) se pueden registrar por adelantado mientras la sucursal está en etapas de Proyectos; la card pasa a 9 y 10 cuando Proyectos termina |
| Q3 | **Zona bloqueada (895)** se queda en la **etapa 1** con territorio = bloqueada (los datos de muestra se limpiarán) |
| Q4 | Columna con **50 cards** y el resto en la tabla |
| Q5 | **`pg_cron` autorizado**; entra en el PR (migración 35) con respaldo, ensayo ROLLBACK y merge de Carlo |
| P1–P7 | Propuestas por defecto (§12) |

Con esto cambian los conteos esperados de §8: etapa 1 = 3,025 (incluye zona bloqueada) y Descartada = 33.

## 13 bis. Preguntas que bloqueaban la Fase B (respondidas arriba)

- **Q1. PLD original:** el documento lo exige para «tener por integrado el expediente», pero la carta de intención se firma el mismo día del pago. Propongo que el original sea candado para **cerrar la etapa 5**, no la 4. Si fuera de la 4, el pago y la carta esperarían al correo físico. ¿De acuerdo?
- **Q2. COF y contrato durante la obra:** con las provisionales de Proyectos **antes** de la 9, una sucursal en remodelación tendría que salir de Proyectos para entrar a la COF. En la práctica la COF corre en paralelo a la obra (2 meses antes de abrir). Propongo un **carril paralelo**: la 9 y la 10 se muestran como requisitos de Legal dentro de la card mientras está en Proyectos, y la card pasa a 9 o 10 cuando Proyectos termina. Alternativa: las provisionales van después de la 9. ¿Cuál prefieres?
- **Q3. Zona bloqueada (895):** ¿a etapa 1 con territorio = bloqueada (se ven en el Pipeline) o directo a Descartada (no estorban)? Propongo **Descartada** para que la columna 1 sea útil, con el filtro «Descartadas» para verlas.
- **Q4. Pipeline con 3,025 cards en la etapa 1:** la columna mostrará las 50 más recientes con «Ver todas en tabla». ¿Te parece o prefieres que la muestra de prospectos sin estado no entre al Pipeline?
- **Q5. `pg_cron`:** ¿autorizas activarlo (opción A) cuando llegue el PR?

## 14. Fase B — Implementación (2026-11-03, rama `feat/crm-unificado`)

### 14.1 Base de datos

Las migraciones 30–35 están probadas en PGlite y ensayadas con ROLLBACK en producción.

| Migración | Contenido |
| --- | --- |
| `20261103000030_crm_areas.sql` | `crm_areas` (Finanzas inactiva) y `crm_membresias` (rol head, miembro o lectura, más la función «Aprobación de locales»). Funciones `crm_es_head`, `crm_puede_operar`, `crm_tiene_funcion` y `crm_mis_areas`. Solo un desarrollador administra membresías |
| `…31_crm_pipeline.sql` | Embudo `general` con 22 etapas: las 10 del documento, Formalizado, 6 provisionales, Operando, Standby, Descartada, Cancelada y Cerrada. Tabla `crm_franquiciatarios`. La sucursal es `crm_tiendas` con `franquiciatario_id` y fechas de apertura. Notas, actividades y archivos del franquiciatario. Versión de documentos. El trigger `crm_guardar_etapa` hace que en el embudo general la etapa solo cambie con `crm_avanzar` |
| `…32_crm_requisitos.sql` | 37 requisitos sembrados (§4, incluidos Q1 y Q2), `crm_cumplimientos`, `crm_liberaciones`, `crm_requisitos_de()` y la vista `crm_v_candados`. Funciones `crm_cumplir`, `crm_validar`, `crm_revertir_requisito`, `crm_liberar_candado`, `crm_crear_sucursal`, `crm_avanzar` y `crm_cancelar_cascada` |
| `…33_crm_bitacora.sql` | La bitácora guarda nombre y área del actor al momento, motivo y franquiciatario. Triggers en INSERT, UPDATE y **DELETE** de 18 tablas, más `perfil_modulos` del CRM. `crm_historial_inalterable` rechaza UPDATE, DELETE y TRUNCATE; solo el dueño de la base puede limpiar filas de la importación de Zoho, como hacía el importador. Retiro de archivos con motivo, versiones y `crm_registrar_descarga` |
| `…34_crm_avisos.sql` | `crm_festivos` (LFT 2026–2027), `crm_restar_dias_habiles` y la vista `crm_v_vencimientos` (COF, 5 días hábiles, 120 días y COF tardía). `crm_avisos` y `crm_generar_avisos`, idempotente y con origen «sistema» |
| `…35_crm_avisos_cron.sql` | `pg_cron` diario a las 07:00 MX (13:00 UTC). Solo corre si la extensión existe (Q5) |

### 14.2 Aplicación

- **Rutas nuevas:**
  - `/crm`: Panel nuevo.
  - `/crm/pipeline`: Kanban por tramos con arrastre, «Mover a…», motivo, rollback visible y tabla paginada de una etapa completa.
  - `/crm/franquiciatarios` y `/crm/franquiciatarios/[id]`, `/crm/sucursales/[id]`.
  - `/crm/pendientes`, `/crm/vencimientos` y `/crm/admin`.
  - `/crm/bitacora`, con exportación a CSV en `/crm/bitacora/exportar`.
- **Expediente:**
  - **Resumen:** datos editables con versión.
  - **Requisitos:** formularios según el tipo (fecha; documento o firma con subida directa al bucket; validación), corrección con motivo y el carril paralelo visible.
  - **Documentos:** por tipo, con versiones conservadas, retiro con motivo y descarga registrada.
  - **Notas, Actividades y Sucursales** (con alta de más sucursales).
  - **Trazabilidad.**
- **Rutas antiguas:** `/crm/tiendas`, `/crm/tiendas/[id]`, `/crm/prospectos` y `/crm/prospectos/[id]` siguen funcionando. En cuanto la muestra esté mapeada **redirigen** al Pipeline o al expediente nuevo. Ctrl K enlaza a los expedientes nuevos.
- **Agente:** herramientas nuevas `consultar_bloqueadas`, `historial_card` y `consultar_vencimientos`, con reglas y enlaces a `/crm/franquiciatarios/UUID` y `/crm/sucursales/UUID`.
- **Scripts (no ejecutados en producción):**
  - `scripts/crm/muestra.ts`: `ensayo`, `aplicar`, `revertir`, `limpiar-ensayo` y `limpiar --respaldo`.
  - `scripts/crm/ensayo-migraciones.ts`.

### 14.3 Evidencia (§7)

| Requisito | Comprobación | Resultado |
| --- | --- | --- |
| Candados | `tests/db/crm-unificado.test.ts`: sin requisitos o con territorio bloqueado no avanza; el UPDATE directo de etapa se rechaza; solo se pasa a la siguiente etapa; la 3 se omite con motivo y queda «no aplica»; un área ajena no mueve ni cumple; se exigen dependencias y evidencia; un head libera con motivo y un miembro no; la liberación se consume al avanzar | 20 pruebas en verde |
| Trazabilidad | Cada acción, incluidos los DELETE, deja actor, nombre, área y fecha. UPDATE, DELETE y TRUNCATE fallan **también como dueño de la tabla**. La versión de archivo y la descarga quedan registradas | En verde en PGlite y comprobado en producción dentro del ensayo |
| Permisos por área | Lectura no mueve; sin módulo ve 0; OAuth ve 0 y no escribe; solo un desarrollador administra membresías | En verde |
| Franquiciatario → sucursal | Al formalizar nace la sucursal en la 6; puede haber varias, pero no antes de formalizar; la 6 la mueve Aprobación de locales; COF y contrato son por sucursal, con carril paralelo; solo un head cancela en cascada | En verde |
| Avisos | 5 días hábiles saltando el festivo del 16-nov-2026; aviso COF a 2 meses exactos, sin duplicar y con origen «sistema»; solo su área lo atiende | En verde |
| Muestra | Mapeo, idempotencia, reversión (se niega si hay trabajo de usuarios) y limpieza en PGlite; conteos reales con el ensayo en producción (abajo) | En verde |
| Sin regresiones | Suite completa (ver §14.4) | Ver §14.4 |
| Agente | Herramientas y reglas (prueba `chat-crm`). **No** se probó con el modelo y datos reales porque las migraciones aún no están en producción | Pendiente tras el merge |
| Diseño | Arnés visual: Pipeline y expediente reales a 1440 y 375 px, sin desborde y con la consola limpia en pestaña nueva; arrastre con rollback y diálogo de motivo | Ver capturas en `capturas-40/` |

**Ensayo remoto con ROLLBACK.** Se corrió `npx tsx scripts/crm/ensayo-migraciones.ts --con-muestra` el 2026-11-03 a las 19:1x UTC. El informe está en `Respaldos/thecoffee-supabase/2026-11-03T1915Z-crm-unificado/`.

- **Antes:** 29 migraciones; la última es `20261102000029`. Las 6 nuevas aplicaron en ~1.6 s con `lock_timeout` de 5 s.
- **Dentro de la transacción:**
  - 22 etapas generales, 37 requisitos, 4 áreas (Finanzas inactiva) y 14 festivos.
  - 0 tablas `crm_*` sin RLS, 0 grants a `anon` y 22 políticas `crm_sin_oauth`.
  - Job `crm-avisos-diarios` con horario `0 13 * * *`.
  - Las 176 tiendas y los 4,619 eventos de bitácora quedaron intactos. Un UPDATE a la bitácora como dueño fue rechazado.
- **Mapeo de la muestra (dentro):** 3,621 franquiciatarios de prospectos y 53 de tiendas (52 más «Sin franquiciatario»), con 176 sucursales. Por etapa:
  - Recepción 3,025 · contacto 557 · revisión 1 · PLD 2 · bienvenida 2 · formalizado 53.
  - Locales 65 · constancia 4 · provisionales 24 · operando 72.
  - Standby 6 · descartada 33 · cancelada 4 · cerrada 2.
- **Limpieza (dentro):** todo lo de muestra e importado queda en 0 y hay 178 objetos de Storage por borrar. La bitácora se conserva y crece con los eventos de borrado.
- **Después, con una conexión nueva:** 29 migraciones, `crm_areas` no existe, 0 etapas generales y `pg_cron` sin instalar. **Nada persistió.**

**Respaldo lógico previo:** `Respaldos/thecoffee-supabase/2026-11-03T1915Z-crm-unificado/`. Incluye `base.dump` (2.9 MB, legible con `pg_restore --list`), `esquema.sql`, `roles.sql` y un manifiesto con sha256. Contiene datos personales: no compartir.

### 14.4 Calidad y lo que no se probó

**Comandos ejecutados en el worktree (2026-11-03):**

| Comando | Resultado |
| --- | --- |
| `npx tsc --noEmit` | Sin errores |
| `npx vitest run` | 664 aprobadas y 5 omitidas. Solo falla `tests/migracion/paridad.test.ts`, que ya fallaba en `main` |
| `npx next build` | OK, con todas las rutas nuevas |
| `prettier --check` (archivos tocados) | OK |
| `git diff --check` | Limpio |

**Lo que no se probó y por qué:**

- **Pantallas con sesión y datos reales:** como las migraciones no están en producción, `/crm/pipeline` y los expedientes solo se probaron con el arnés (datos sintéticos) y el build. Tras el merge hay que verificarlos con la sesión de Carlo.
- **Agente con el modelo:** las 3 preguntas de §5.8 necesitan las tablas nuevas en producción.
- **Subida real a Storage desde el expediente nuevo:** usa el mismo flujo que el expediente actual (fila, objeto, confirmación), pero no se ejecutó contra el bucket real.
- **`tests/migracion/paridad.test.ts`** sigue fallando, igual que en `main`, porque necesita el Excel local.

### 14.5 Orden de despliegue propuesto (cada paso con OK de Carlo)

1. Merge del PR: la integración aplica las migraciones 30–35 (el ensayo ya pasó). Verificar que `schema_migrations` llegue a 35.
2. Correr `npx tsx scripts/crm/muestra.ts ensayo` y luego `aplicar` para mapear la muestra. Hasta ese momento el Pipeline está vacío y las rutas antiguas siguen como hoy.
3. Accesos, cuando existan los usuarios: membresías de Andrés (Legal, head), Luis (Ventas, head) y Diego (Proyectos, head), y la función Aprobación de locales para Sebastián.
4. Limpieza para el arranque real: `limpiar-ensayo`, respaldo nuevo y `limpiar --respaldo <ruta>`.
