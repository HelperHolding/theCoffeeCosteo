# Zoho CRM — Usuarios y propiedad (Fase 3)

Snapshot 2026-10-19 22:02 UTC. **Usuarios anonimizados** (alias estable por orden de ID interno). Los nombres y correos no salen de Zoho; la correspondencia alias → persona se resuelve con Carlos al importar, no en este repo.

## Catálogos

- **Roles (2):** CEO · Gestor.
- **Perfiles (3):** Administrator · Standard · Project Manager (sin usuarios asignados).

## Usuarios (18)

| Estado | Usuarios | Perfil Administrator | Perfil Standard |
| --- | ---: | ---: | ---: |
| active | 12 | 7 | 5 |
| disabled | 5 | 4 | 1 |
| deleted | 1 | 1 | 0 |

Roles: CEO 3 (activos) · Gestor 15.

**Hallazgo de permisos:** 12 de 18 usuarios (7 de los 12 activos) tienen perfil **Administrator**. Es relevante para diseñar los permisos del CRM nuevo: no conviene copiar ese reparto.

## Propiedad de registros (Owner)

| Alias | Estado | Rol | Perfil | Leads | Contactos | Cuentas | Tiendas | Tareas |
| --- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Usuario 01 | active | CEO | Administrator | 754 | 1 | 0 | 0 | 22 |
| Usuario 02 | active | Gestor | Administrator | 2,867 | 14 | 15 | 1 | 17 |
| Usuario 03 | active | Gestor | Administrator | 0 | 14 | 21 | 32 | 43 |
| **Usuario 04** | **disabled** | Gestor | Administrator | 0 | **22** | **13** | **111** | **168** |
| Usuario 07 | disabled | Gestor | Administrator | 0 | 0 | 0 | 0 | 1 |
| Usuario 10 | deleted | Gestor | Administrator | 0 | 0 | 0 | 0 | 16 |
| Usuario 13 | active | Gestor | Standard | 0 | 0 | 16 | 32 | 0 |
| Usuario 14 | active | Gestor | Standard | 0 | 0 | 0 | 0 | 1 |
| Otros 10 (U05, 06, 08, 09, 11, 12, 15–18) | 7 activos · 3 deshabilitados | | | 0 | 0 | 0 | 0 | 0 |
| **Total** | | | | 3,621 | 51 | 65 | 176 | 268 |

### Lectura

- **Un usuario deshabilitado (Usuario 04) es dueño del 63 % de las Tiendas (111/176), del 63 % de las Tareas (168/268), del 43 % de los Contactos y del 20 % de las Cuentas.** Antes de importar hay que decidir a quién se reasignan esas tiendas en el CRM nuevo.
- Usuario 10 (eliminado) aún tiene 16 tareas.
- **Leads:** 2 dueños (Usuario 02 79 %, Usuario 01 21 %).
- **Tiendas activas:** solo 3 usuarios activos tienen tiendas: U03 y U13 con 32 cada uno, y U02 con 1.
- 10 de los 18 usuarios no son dueños de ningún registro en alcance.

## Creadores y editores (Created_By / Modified_By)

| Módulo | Creado por | Última edición por |
| --- | --- | --- |
| Leads | U02 2,866 · U01 755 | U02 2,984 · U01 633 · U06 3 · U04 1 |
| Contactos | U04 22 · U02 14 · U03 14 · U01 1 | igual que creación |
| Cuentas | U03 18 · U13 16 · U02 16 · U04 14 · U01 1 | U03 23 · U13 16 · U02 14 · U04 12 |
| Tiendas | U04 111 · U13 32 · U03 31 · U02 1 · U01 1 | U04 122 · **U14 47** · U13 4 · U03 2 · U02 1 |
| Tareas | U04 190 · U03 36 · U02 17 · U10 15 · U01 9 · U12 1 | U04 190 · U03 41 · U02 18 · U10 16 · U01 2 · U12 1 |

Usuario 14 no es dueño de tiendas, pero fue el último en editar 47: probablemente un rol operativo o de seguimiento. **Pregunta para Carlos:** ¿qué área tiene cada usuario activo?

## Decisión (Carlos, 2026-10-19)

Por ahora, **un solo usuario** dueño de todos los registros. Los usuarios deshabilitados o eliminados de Zoho no se crean ni se referencian: sus registros pasan al usuario único. Restricciones y reparto, después.

Propuesta original (referencia):


- Mapear solo usuarios **activos**. Los registros de U04 y U10 se reasignan según decida Carlos y se conserva `zoho_owner_alias` como referencia histórica.
- Permisos por módulo y área en lugar de "todos administradores".
