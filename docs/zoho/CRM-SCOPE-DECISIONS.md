# CRM Franquicias — Decisiones de alcance (Fase 4, aprobadas)

Basado en el snapshot de Zoho del 2026-10-19 22:02 UTC. Las propuestas son de Claude; **Todas las filas están aprobadas por Carlos (2026-10-19)**: unas con decisión propia y el resto como "propuesta tal cual". Detalle en `ZOHO-INVENTORY.md`, `ZOHO-PIPELINE-MAP.md`, `ZOHO-FIELD-AUDIT.csv`, `ZOHO-USERS-AND-OWNERSHIP.md` y `ZOHO-DOCUMENT-INVENTORY.md`.

## Decisiones de Carlos (2026-10-19)

1. **Usuarios:** por ahora habrá **un solo usuario** en el CRM nuevo: la cuenta de Carlos en el portal (`cvalencia@…`), como **usuario desarrollador que ve todo** y es dueño de todos los registros importados. Después se abrirán más usuarios con su nombre y área, y entonces se definen las restricciones.
2. **Usuarios deshabilitados o eliminados en Zoho:** sus registros se importan **sin ese usuario**: no se crea ni se referencia. Como todo queda en el usuario único, ninguno queda sin dueño. Si más adelante hay que asignarlos a alguien, Claude lo avisa.
3. **Campos repetidos:** se quitan los innecesarios. La resolución por evidencia está abajo, en "Campos duplicados".
4. **Archivos:** se copia **todo lo que ya existe en cada tarjeta y en cada apartado**: adjuntos del registro, adjuntos de sus notas y archivos de los campos de archivo, en la misma tarjeta y sección donde están en Zoho. Las ligas externas se conservan como liga. Solo se omite lo que pertenece a módulos fuera de alcance (7 adjuntos de Prospectos_Expansion).
5. **Leads y tareas:** se importan **tal cual**: los 3,621 leads (con o sin estado) y las 268 tareas con su estado actual.
6. **Etapas de Tiendas:** las 58 tiendas en "Firma de contrato" están bien ahí; las etapas son pasos del procedimiento. El detalle operativo de cada paso lo explicará el equipo más adelante.

## Campos duplicados: resolución aprobada (por evidencia)

Comparación registro por registro sobre las 176 tiendas y los 3,621 leads (solo conteos, sin valores).

| Grupo | Comparación | Resultado | Propuesta |
|---|---|---|---|
| Fecha de apertura | `Fecha_de_Apertura` vs `Fecha_en_que_apertur` | Iguales 57 · distintas 1 · solo la 2.ª 5 · ninguna 113 | **Unificar** en "Fecha de apertura" = `Fecha_en_que_apertur`, y si falta, `Fecha_de_Apertura`. La tienda con fechas distintas queda marcada para revisión. **Se quita** `Fecha_de_Apertura`. |
| Fecha de arranque | `FECHA_DE_ARRANQUE` vs apertura | **Casi nunca coincide** con la apertura (0 de 18 y 3 de 23 contra cada campo). Las 58 tiendas en "Firma de contrato" la tienen y 45 son fechas futuras (hasta 2030) | **No es duplicado:** es la fecha programada de arranque. **Conservar** como "Fecha programada de arranque". |
| Aprobación de local | `Aprobaci_n_de_local` vs `Fecha_aprobaci_n_de_local` | Iguales 4 · **distintas 0** · solo la 1.ª 54 · solo la 2.ª 37 | **Unificar** en "Fecha de aprobación de local" (se complementan: 95 tiendas con fecha). **Se quita** `Fecha_aprobaci_n_de_local`. |
| Firma | `Firma_de_Contrato` vs `Fecha_de_Firma` (contrato de franquicia 5 años) | Iguales 2 · **distintas 19** (18 con la 1.ª antes) · solo la 1.ª 22 · solo la 2.ª 4 | **No es duplicado:** son dos firmas (primer contrato y contrato de franquicia de 5 años). **Conservar ambas** con nombres claros. |
| Marca de cafetera | campo `Marca_de_Cafetera` vs etiquetas Marzocco / Victoria Arduino | Coinciden 49 · solo etiqueta 13 · solo campo 2 · **se contradicen 2** | **Unificar** en el campo (la etiqueta completa 13 tiendas). Las 2 contradicciones quedan marcadas para revisión. **Se quitan** las 2 etiquetas. |
| Tipo de franquicia | etiquetas Franquiciatario / Franquicia Maestra | 138 · 11 | **Convertir** en el campo "Tipo de franquicia"; se quitan las etiquetas. |
| Empresa (Leads) | `Company` vs `Nombre_de_Empresa` | Nunca coinciden: 4 + 12, complementarios | **Unificar** en "Empresa". |
| Ciudad / estado (Leads) | `City`/`State` vs `Ciudad_de_Inter_s`/`Estado_de_Inter_s` | Distintos en 71 / 50 de los que tienen ambos | **No es duplicado** (residencia vs plaza de interés). **Conservar** "Ciudad/Estado de interés" (98 %); "Ciudad/Estado de residencia" (4 %) queda en la ficha. |
| Días para apertura | `D_as_Para_Apertura` (rango) y `D_as_para_Aperturar_Dpto_de_Aprobaciones` (texto) | Calculables desde las fechas | **Quitar ambos** y calcularlos en el CRM nuevo a partir de la fecha programada. |

## Módulos

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Módulo | Tiendas (`Franquicias`) | 176 tiendas, 399 notas, 197 tareas, 536 cambios de etapa | Buena en etapa (100 %); media en fechas | **Conservar** como núcleo: tarjeta del Kanban | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Módulo | Cuentas (`Accounts`) | 65 cuentas; 52 con tiendas | Media: 26 campos sin uso | **Adaptar** a "Franquiciatario" (persona física/moral) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Módulo | Contactos (`Contacts`) | 51; 23 ligados a cuenta | Media | **Adaptar** como personas de contacto del franquiciatario | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Módulo | Posibles clientes (`Leads`) | 3,621; 59 % sin estado; 0 conversiones | Baja en estado; alta en contacto (correo/teléfono ~100 %) | **Adaptar**: embudo de prospectos separado del pipeline de tiendas. Importar todos | Aprobado (Carlos, 2026-10-19): todos, tal cual |
| Módulo | Tareas (`Tasks`) | 268; 88 % "Not Started" | Baja: los estados no reflejan el avance | **Adaptar**: importar como actividades. Importar con su estado | Aprobado (Carlos, 2026-10-19): tal cual |
| Módulo | Notas | 495 (Tiendas 399) | Buena | **Replicar** en el historial de la tarjeta | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Módulo | Prospectos_Expansion, Tratos y demás | Fuera de alcance | — | **Descartar** en esta versión | Aprobado (Carlos, 2026-10-19): propuesta tal cual |

## Etapas (pipeline de Tiendas)

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Etapa | Firma de contrato | 58 hoy; 17 salidas; todas con fecha programada de arranque | Contratos firmados en espera de arrancar | **Conservar** (inicio) | Aprobado (Carlos, 2026-10-19) |
| Etapa | En búsqueda de local | 7 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Local aprobado por México | 4 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Local aprobado por Brasil | 0 hoy; 53 entradas | Paso real | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Arquitecta Asignada | 4 | Buena | **Conservar** (¿renombrar a "Arquitectura asignada"?) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Proyecto 3D Entregado | 3 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Proyecto Ejecutivo Entregado | 5 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | En remodelación | 11 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Entrega de local | 0 hoy; 11 entradas | Uso intermitente | **Conservar** o **fusionar** con En remodelación | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Agenda de capacitación | 1 | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Operando | 72 | Buena | **Conservar** (fin) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Standby · Modificaciones pendientes | 4 · 1 | Laterales | **Conservar** como estados laterales | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Cancelada · Cerrada | 4 · 2 | Cierres | **Conservar** como cierres | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Proyecto | 0; solo histórico | Obsoleta | **Fusionar** en el historial (no como columna) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Franquiciatario Busca Local · Local Aprobado por MX · Obra en Proceso | 0, nunca usadas | Duplican a las etapas 2, 3 y 8 | **Descartar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Kickoff de Tienda Iniciado · Programación de Soft Opening · En espera de Asignación Arquitectura Brasil | 0, nunca usadas | ¿Pasos planeados? | **Descartar**, o conservar si Carlos las quiere usar | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etapa | Leads: 93 estados | 14 usados | Duplicados y erratas | Importar **tal cual** los 14 estados en uso (y "sin estado"); la limpieza del catálogo se pospone | Aprobado (Carlos, 2026-10-19): leads tal cual |

## Campos (los más relevantes; el resto en el CSV)

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Campo | Tiendas: Nombre, Status, Cuenta, Ciudad, Dirección, N.º Jestor | 100 · 100 · 99 · 66 · 59 · 47 % | Buena | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Tiendas: 3 fechas de apertura | 33 · 36 · 76 % | 2 duplicadas; `FECHA_DE_ARRANQUE` es otra fecha | **Unificar** las dos de apertura; conservar la fecha programada de arranque (ver "Campos duplicados") | Aprobado (Carlos, 2026-10-19): quitar repetidos |
| Campo | Tiendas: 2 fechas de aprobación de local · 2 de firma | 33/23 % · 24/14 % | Aprobación: duplicada; firma: dos hitos distintos | **Unificar** aprobación; **conservar** las dos firmas | Aprobado (Carlos, 2026-10-19): quitar repetidos |
| Campo | Tiendas: cafetera (marca/estado), contrato 5 años, vencimiento | 14–30 % | Media | **Conservar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Tiendas: Partoo, Google Maps, Cert. de Facturación, Perfiles de Baristas | 0 % | Sin uso | **Descartar**, o convertir en checklist de apertura | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Tiendas: Checklist Pre-Apertura, Evidencias (ligas) | 1 % | Sin uso real | **Adaptar** a checklists nativos | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | **Credenciales** (FINKOK usuario/contraseña en Tiendas; Contraseña en Cuentas) | 18+ registros | Riesgo de seguridad | **Descartar**: no replicar y retirar de Zoho | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Leads: formulario de interés (capital, plan, por qué The Coffee…) | ~4 % | Bajo | **Conservar** en la ficha del prospecto | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Leads: 8 campos de encargados, Linkedin, Industry, dirección | 0 % | Sin uso | **Descartar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Cuentas: RFC, Razón Social, Representante Legal | 20 · 12 · 3 % | Bajo | **Conservar** (datos fiscales) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | Cuentas: direcciones de envío/facturación, Rating, Tipo, SI/NO/ENCENDIDO | 0 % | Sin uso | **Descartar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Campo | 27 campos eliminados de Tiendas (en el historial) | Datos inaccesibles | — | **Omitir**; preguntar si alguno debe volver como checklist | Aprobado (Carlos, 2026-10-19): propuesta tal cual |

## Etiquetas

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Etiqueta | Tiendas: Franquiciatario, Franquicia Maestra | 138 · 11 | Clasificación real del tipo de tienda | **Adaptar** a un campo "Tipo de franquicia" | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etiqueta | Tiendas: Marzocco, Victoria Arduino | 55 · 9 | Duplica a Marca de Cafetera | **Unificar** en el campo | Aprobado (Carlos, 2026-10-19): quitar repetidos |
| Etiqueta | Tiendas: Q4 2024, Q4 2025, URGENTE, Contrato, Levantamiento, Buscar local, Liquidar, WeWork | 0–19 | Operativas | **Conservar** como etiquetas libres | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Etiqueta | Leads (14) y Contactos (27: plazas/ciudades, newsletter, comunicado, FEE PAGADO) | 1–10 | Mezcla ciudad, estado de pago y lista | **Unificar**: ciudad → campo; FEE PAGADO → estado; newsletter → preferencia | Aprobado (Carlos, 2026-10-19): propuesta tal cual |

## Relaciones

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Relación | Tienda → Cuenta | 174/176, 0 huérfanos | Buena | **Replicar** (franquiciatario 1:N tiendas) | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Relación | Contacto → Cuenta | 23/51, 0 huérfanos | Media | **Replicar** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Relación | Tarea/Nota → registro (polimórfica) | 0 huérfanos | Buena | **Replicar** hacia tienda, franquiciatario, contacto o prospecto | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Relación | Lead → Cuenta/Contacto (conversión) | 0 usos | No se usa | **Replantear**: acción "Convertir prospecto en franquiciatario" en el CRM nuevo | Aprobado (Carlos, 2026-10-19): propuesta tal cual |
| Relación | Propietario (Owner) | U04 deshabilitado tiene 111 tiendas | Riesgo | Un solo usuario (cuenta desarrollador de Carlos) dueño de todo; no se crean usuarios deshabilitados ni eliminados | Aprobado (Carlos, 2026-10-19) |

## Documentos

| Elemento | Zoho actual | Uso observado | Calidad | Propuesta | Decisión humana |
|---|---|---|---|---|---|
| Documento | Adjuntos de Tiendas / Cuentas / Contactos / Notas | 149 archivos | PDF en su mayoría; INE y datos fiscales | **Copiar todo**, en la misma tarjeta y apartado, a Storage privado tras una descarga piloto | Aprobado (Carlos, 2026-10-19) |
| Documento | Fileupload Proyecto 3D / Ejecutivo | 83 archivos, 55 MB | Buena | **Copiar** en su sección ("Información Proyecto"), deduplicando contra adjuntos | Aprobado (Carlos, 2026-10-19) |
| Documento | Adjuntos de Leads | 136 archivos | Desconocida | **Copiar todos** en la tarjeta de su lead | Aprobado (Carlos, 2026-10-19) |
| Documento | Ligas externas (dictamen, carpeta de contrato, LINK) | 82 registros | Externas | **Enlazar** (guardar URL) en su campo | Aprobado (Carlos, 2026-10-19) |
| Documento | Adjuntos de Prospectos_Expansion | 7 | Fuera de alcance | **Omitir** | Aprobado (Carlos, 2026-10-19): propuesta tal cual |

## Preguntas abiertas para Carlos

1. ~~58 tiendas en Firma de contrato~~ Resuelto: son etapas del procedimiento; están bien.
2. ~~¿A quién se reasignan los registros del usuario deshabilitado?~~ Resuelto: usuario único.
3. ~~¿Qué área tiene cada usuario?~~ Se pospone: por ahora, usuario único. Resuelto: cuenta desarrollador de Carlos.
4. ~~¿`FECHA_DE_ARRANQUE`?~~ Resuelto: es la fecha programada de arranque.
5. ~~¿Todos los leads?~~ Resuelto: todos, tal cual.
6. ~~¿Tareas Not Started?~~ Resuelto: tal cual.
