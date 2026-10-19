# Zoho CRM — Mapa de etapas (Fase 3)

Snapshot 2026-10-19 22:02 UTC. En los 5 módulos la etapa es un **picklist**: los pipelines de Zoho solo aplican a Tratos, que está fuera de alcance. No hay blueprints ni automatizaciones en los cambios de etapa de Tiendas: los 536 cambios del historial vienen de la interfaz (`source: crm_ui`, `automation_details` vacío).

## 1. Tiendas (`Franquicias.Status`), el pipeline principal

22 opciones; 13 con registros hoy; 0 tiendas sin etapa. El historial (timeline) cubre del 2025-01-13 al 2026-09-10, con cambios de etapa en 96 de 176 tiendas.

### Etapas en orden de Zoho

| # | Etapa | Tiendas hoy | Entradas | Salidas | Lectura |
| ---: | --- | ---: | ---: | ---: | --- |
| 1 | Firma de contrato | 58 | 3 | 17 | Inicio. Sin valor por defecto: se elige a mano al crear. |
| 2 | En búsqueda de local | 7 | 30 | 30 | |
| 3 | Local aprobado por México | 4 | 25 | 44 | |
| 4 | Local aprobado por Brasil | **0** | 53 | 78 | Paso real del flujo (segunda aprobación del local); hoy vacía. Más salidas que entradas: el historial empieza el 2025-01-13 y muchas tiendas ya estaban aquí. |
| 5 | Arquitecta Asignada | 4 | 61 | 61 | |
| 6 | Proyecto 3D Entregado | 3 | 66 | 64 | |
| 7 | Proyecto Ejecutivo Entregado | 5 | 70 | 72 | |
| 8 | En remodelación | 11 | 77 | 72 | |
| 9 | Agenda de capacitación | 1 | 62 | 61 | |
| 10 | Operando | 72 | 60 | 7 | Fin feliz. |
| 11 | Standby | 4 | 9 | 5 | Pausa (lateral). |
| 12 | Cancelada | 4 | 5 | 1 | Cierre negativo. |
| 13 | Cerrada | 2 | 2 | 0 | Tienda cerrada tras operar. |
| 14 | Modificaciones pendientes | 1 | 2 | 2 | Lateral: Operando ↔ Modificaciones. |
| 15 | En espera de Asignación Arquitectura Brasil | 0 | 0 | 0 | Nunca usada. |
| 16 | Entrega de local | 0 | 11 | 11 | Usada antes, entre En remodelación (7) / Agenda de capacitación (4) y Agenda de capacitación (10). |
| 17 | Franquiciatario Busca Local | 0 | 0 | 0 | Nunca usada (duplica a la 2). |
| 18 | Kickoff de Tienda Iniciado | 0 | 0 | 0 | Nunca usada. |
| 19 | Local Aprobado por MX | 0 | 0 | 0 | Nunca usada (duplica a la 3). |
| 20 | Obra en Proceso | 0 | 0 | 0 | Nunca usada (duplica a la 8). |
| 21 | Programación de Soft Opening | 0 | 0 | 0 | Nunca usada. |
| 22 | Proyecto | 0 | 0 | 6 | Valor antiguo; salió hacia Remodelación, Capacitación y Operando. |

Las entradas y salidas cuentan transiciones del historial, no tiendas. 80 de 176 tiendas no tienen ningún cambio de etapa en el historial, y "Firma de contrato" registra solo 17 salidas frente a 58 tiendas actuales. O se crearon ahí y no han avanzado, o se dieron de alta tarde. **Pregunta para Carlos.**

### Flujo observado (transiciones más frecuentes)

```text
Firma de contrato ─14→ En búsqueda de local ─14→ Local aprobado por México ─34→ Local aprobado por Brasil
  ─58→ Arquitecta Asignada ─48→ Proyecto 3D Entregado ─57→ Proyecto Ejecutivo Entregado
  ─56→ En remodelación ─48→ Agenda de capacitación ─45→ Operando
         └─7→ Entrega de local ─10→ Agenda de capacitación
Laterales: → Standby (9) · → Cancelada (5) · Operando → Cerrada (1) · Operando ↔ Modificaciones pendientes (2)
```

Retrocesos frecuentes, que indican correcciones o idas y vueltas reales: Proyecto Ejecutivo → Proyecto 3D (10), Agenda de capacitación → En remodelación (11), Local aprobado por México → En búsqueda de local (10), Brasil → México (9).

### Campos que acompañan la etapa

| Etapa / hito | Campo(s) | Llenado |
| --- | --- | ---: |
| Firma | `Firma_de_Contrato`, `Fecha_de_Firma`, `Contrato_de_franquicia_5_a_os` | 24 % · 14 % · 15 % |
| Aprobación de local | `Aprobaci_n_de_local`, `Fecha_aprobaci_n_de_local`, `Dictamen_de_Aprobaci_n_de_Local` | 33 % · 23 % · 19 % |
| Arquitectura | `Arquitecto_Asignado`, `Proyecto_3D`, `Proyecto_Ejecutivo`, `Fecha_de_Entrega_de_Proyecto` | 16 % · 20 % · 27 % · 21 % |
| Cafetera | `Marca_de_Cafetera`, `Status_de_Cafetera` (Apartada 16 · Pagada 6 · Instalada 30) | 30 % |
| Apertura | `Fecha_de_Apertura`, `Fecha_en_que_apertur`, `FECHA_DE_ARRANQUE`, `D_as_Para_Apertura` | 33 % · 36 % · 76 % · 32 % |

## 2. Posibles clientes (`Leads.Lead_Status`)

93 opciones; **14 en uso**; 2,130 de 3,621 (59 %) sin estado.

| Estado | Leads |
| --- | ---: |
| (sin estado) | 2,130 |
| Interes en Zona Bloqueada | 895 |
| Contactado | 397 |
| Correo Inicial Enviado - Agenda tu Cita | 95 |
| Con Interés | 45 |
| Lead Pérdido / Sin Interés | 25 |
| Psible Cierre | 14 |
| Lead Basura | 4 |
| Sin Interés | 4 |
| Attempted to Contact | 3 |
| Sin Respuesta - No se pudo contactar | 3 |
| Fee Inicial Liquidado | 2 |
| Nuevo Franquiciatario | 2 |
| Apartado Pagado | 1 |
| Reanudar negociación en un Futuro | 1 |

Catálogo sin uso (79 valores), agrupado: intentos de contacto (1er/2do/3er intento, Sin Respuesta 1/2/3, Not Contacted, Contacted…); reuniones (Reunión Inicial, Agendada, Realizada, Tomada, 1ra Reunión OK); perfil (Cumple / No cumple con el Perfil, Pre-Qualified, Lead Aprobado / No Aprobado, En Proceso de Aprobación de Perfil); contratos (Contrato Enviado, Contrato Bloqueo Enviado / Firmado, Contrato 5 años digital / presencial, Contratos Completos…); pagos (Adelanto Pagado, Liquidación del Fee, Factura Enviada, Creación de Factura…); local (Aprobación de Local, Local en Aprobación, Local Aprobado); FASE 1 (Enviada / en Revisión / Completada); cierre (Lead Perdido, Lead No Apto, Imposible Contactar, Fin). Incluye duplicados y erratas: Psible / Posible Cierre; Lead Pérdido / Perdido; Contrato Enviado / Enviado..; Factura Enviada / Envíada; Fee Inicial / Incial Liquidado; Franquciatario; 2do Inteto. La lista completa está en la metadata (`getFields Leads`).

**Lectura:** el catálogo describe un embudo de venta de franquicias muy detallado (contacto → reunión → perfil → contratos → pago), pero en la práctica solo se usan los primeros pasos. Los leads no se convierten (0 conversiones): el cierre ocurre fuera de Leads.

## 3. Tareas (`Tasks.Status`)

Not Started 235 · Completed 29 · Waiting for input 3 · In Progress 1. Deferred y la opción custom "Interesado" no se usan. Prioridad: High 256 · Highest 7 · Low 4 · Normal 1. `Closed_Time` en 29 (11 %) concuerda con Completed.

## 4. Contactos (`Contacts.Phase`, "Tipo de Contacto")

Nuevos Franquiciatarios 29 · Franquiciatarios 13 · sin valor 9 (el campo es obligatorio en el layout; los 9 vacíos probablemente son anteriores a la regla o entraron por API: por verificar). Sin uso: Administrativos Oficina, Directores, Gerentes Operativos, Contactos Marketing, Newsletter (este último se usa como etiqueta).

## 5. Cuentas

Sin etapa. `Status_contrato_de_bloqueo_de_zona` (Pendiente / Firmado Digital / Firmado Presencial) está al 0 %. La clasificación real es el layout: Persona Física / Persona Moral / Standard.
