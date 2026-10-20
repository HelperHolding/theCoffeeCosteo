# Zoho CRM — Inventario (Fase 3)

- **Snapshot:** 2026-10-19 22:02 UTC (16:02 America/Mexico_City). Los conteos son de ese momento.
- **Fuente:** API v8 con Self Client READ (`scripts/zoho/auditar.ts`) y MCP Data Insights. Solo lectura; detalle en `AUDIT-EVIDENCE.md`.
- **Alcance:** workspace The Coffee; 5 módulos auditados. **Cambio 2026-10-19: Cuentas queda fuera del CRM** (se maneja aparte); su auditoría se conserva solo como referencia.

## Organización

| Dato | Valor |
| --- | --- |
| Razón social | COMERCIALIZADORA MASTER SITRU SA DE CV |
| Edición | Zoho One Enterprise (`zohooneenterprise`) |
| Entorno | production |
| Zona horaria | America/Mexico_City (fechas-hora con desfase -06:00) |
| País | MX |
| Centro de datos / API | US · `https://www.zohoapis.com` |
| Formatos | fecha `YYYY-MM-DD`, fecha-hora ISO 8601 |
| Límites observados | COQL: 2,000 filas por llamada y `COUNT()` solo sobre `id`; Records API: 200 por página y 50 campos por llamada |

## Módulos en alcance

| Etiqueta | API name | Tipo | Registros | Campos (custom) | Layouts | Notas | Adjuntos |
| --- | --- | --- | ---: | --- | --- | ---: | ---: |
| Posibles clientes | `Leads` | estándar | 3,621 | 60 (22) | Standard | 56 | 136 |
| Contactos | `Contacts` | estándar | 51 | 25 (2) | Standard | 11 | 10 |
| Cuentas | `Accounts` | estándar | 65 | 54 (20) | Standard 61 · Persona Física 2 · Persona Moral 2 | 22 | 8 |
| Tiendas | `Franquicias` (CustomModule1) | personalizado | 176 | 50 (36) | Tiendas The Coffee | 399 | 117 |
| Tareas | `Tasks` | estándar | 268 | 21 (0) | Standard | 6 | — |

En los 5 módulos el conteo COQL (`COUNT(id)`) es igual al número de registros leídos por la Records API.

### Secciones de layout

- **Leads / Standard:** Lead Information (35 campos, 1 obligatorio) · Interés de Franquicia (10) · Datos Operativos (4) · Datos Administrativos (4) · Address Information (5) · Description Information (1).
- **Contacts / Standard:** Contact Information (24, 2 obligatorios).
- **Accounts:** Standard: Account Information (25, 1 obligatorio) · Address (11) · Description (1) · Contrato (2) · Detailed Revenue (2). Persona Física: Account Information (16) · Rappi (2) · Documentación (7). Persona Moral: Account Information (18) · RAPPI (1) · Documentación (7) · Detailed Revenue (2).
- **Tiendas / Tiendas The Coffee:** Información (25, 1 obligatorio) · Información Proyecto (4) · Proveedores (4) · Fechas (3) · Cafetera (2) · Contrato (4) · Evidencias Pre-Apertura (5) · Google My Business (2).
- **Tasks / Standard:** Task Information (20, 1 obligatorio) · Description (1).

Todos los campos de la API están en algún layout; no hay campos ocultos fuera de layout.

## Relaciones

| Relación | Tipo | Con valor | Huérfanos |
| --- | --- | ---: | ---: |
| Tiendas → Cuentas (`Cuenta`) | lookup | 174 / 176 | 0 |
| Contactos → Cuentas (`Account_Name`) | lookup | 23 / 51 | 0 |
| Cuentas → Cuenta principal (`Parent_Account`) | lookup | 2 / 65 | 0 |
| Leads → Cuenta / Contacto / Trato convertidos | conversión | **0** / 3,621 | — |
| Tareas → Contacto (`Who_Id`) | lookup | 2 / 268 | 0 |
| Tareas → registro (`What_Id` + `$se_module`) | polimórfica | Tiendas 197 · Cuentas 37 · Leads 17 · Contactos 10 · sin relación 7 | 0 |
| Notas → registro | polimórfica | Tiendas 399 · Leads 56 · Cuentas 22 · Contactos 11 · Tareas 6 · Prospectos_Expansion 1 | — |

- **Modelo real:** Cuenta = franquiciatario (persona física o moral) → N Tiendas → Tareas y Notas. En promedio, 52 cuentas distintas tienen 174 tiendas.
- **Leads nunca se convierten** en Cuenta/Contacto (0 conversiones). Los franquiciatarios se dan de alta a mano en Cuentas/Tiendas; no hay una liga Lead → Tienda.
- Fuera de alcance que aparece como relación: `Prospectos_Expansion` (1 nota, 7 adjuntos) y `Deals` (destino de conversión sin uso).

## Etiquetas

| Módulo | Catálogo | En uso | Principales |
| --- | ---: | ---: | --- |
| Tiendas | 12 | 9 | Franquiciatario 138 · Marzocco 55 · Q4 2025 19 · Franquicia Maestra 11 · Victoria Arduino 9 · Contrato 6 · Levantamiento 6 · URGENTE 5 · Buscar local 4 |
| Leads | 14 | 11 | Info en revisión 10 · En busqueda de local 4 · otras 9 con 1–3 |
| Contactos | 27 | 26 | Mayormente plazas/ciudades (Veracruz, Mérida, Torreón…) más newsletter 9, comunicado 4, FEE PAGADO 4. **1 etiqueta parece nombre de persona** (redactada). |
| Cuentas / Tareas | 0 | 0 | — |

"FEE PAGADO" existe en Leads y en Contactos; la marca de cafetera se duplica como etiqueta y como picklist en Tiendas.

## Hallazgos de calidad (detalle por campo en `ZOHO-FIELD-AUDIT.csv`)

1. **Credenciales en texto plano:** Tiendas `Contrase_a_FINKOK_PAC` y `Usuario_FINKOK_PAC`, y Cuentas `Contrase_a` (llena en 18 cuentas, junto a `LINK`). Se excluyeron de la lectura. **No replicar** y retirarlas de Zoho.
2. **27 campos de Tiendas eliminados** que siguen en el historial (Kickoff/Handle Arquitectura, Encargado, Tablet, Internet, iZettle, Acta Constitutiva, INE Obligado Solidario, Póliza, Licencia, Contrato Arrendamiento, etc.). Sus datos actuales ya no son accesibles por la API.
3. **Fechas duplicadas en Tiendas:** apertura en 3 campos (`Fecha_de_Apertura` 33 %, `Fecha_en_que_apertur` 36 %, `FECHA_DE_ARRANQUE` 76 % con valores hasta 2030); aprobación de local en 2 (`Aprobaci_n_de_local` 33 %, `Fecha_aprobaci_n_de_local` 23 %); firma en 2 (`Firma_de_Contrato` 24 %, `Fecha_de_Firma` 14 %).
4. **Leads:** 59 % sin estado; 79 de 93 opciones de estado sin uso; 19 de 22 campos custom con menos de 5 % de llenado (el formulario de interés solo está en ~130 leads).
5. **Cuentas:** 26 campos sin uso: 0 % o booleanos nunca en true (direcciones, los 7 fileupload de documentación, `SI`/`NO`/`ENCENDIDO`, Rating, Tipo de Cuenta, estatus del contrato de bloqueo).
6. **Tareas:** 88 % en "Not Started" y 96 % con prioridad High: los estados no reflejan el avance real.
