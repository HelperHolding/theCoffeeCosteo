# CRM: flujo completo, segmentación, atajos y video (doc 41)

**Fuente:** «Desarrollo de CRM Unificado — Mapeo de procesos», versión completa del 21-oct-2026 (10 páginas, recibida el 2026-11-14).
**Base:** lo construido en el doc 40 (PR #91, migraciones 30–35) y el rediseño visual (PR #92).
**Estado:** propuesta para el Checkpoint C. No se ha tocado la base de datos.

## 1. Qué cambia respecto a lo construido

| #   | Tema                   | Hoy en producción                                                                       | Documento completo                                                                                                                               | Cambio propuesto                                                                                         |
| --- | ---------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------- |
| C1  | **Proyectos**          | Seis etapas provisionales sin requisitos (Arquitecta asignada → Agenda de capacitación) | Ocho subpasos (26.1–26.8). Cada uno tiene un **entregable obligatorio** que Proyectos carga y **valida**. Elegir un estado no basta para avanzar | Reemplazar las provisionales por los 8 subpasos con candado (§3)                                         |
| C2  | **COF y contrato**     | Columnas 9 y 10 después de Proyectos. Se pueden registrar por adelantado (Q2)           | Corren **durante** el flujo de Proyectos, sin esperar al 26.7. Los bloqueos de Proyectos **se suman** a los de Legal                             | Carril Legal paralelo dentro de la sucursal. «Tienda en operación» exige los dos carriles completos (§4) |
| C3  | **Finanzas**           | Área inactiva; Ventas valida los pagos en su lugar (P1)                                 | Finanzas valida el apartado (6–7) y la liquidación (13), emite la factura (17) y recibe la alarma de multa                                       | Activar el área Finanzas con sus usuarios y pasarle esas validaciones (§5)                               |
| C4  | **Alarma de 120 días** | Aviso a Proyectos 14 días antes del límite                                              | Al firmar la constancia empieza la cuenta regresiva. Al vencer, aviso a **Legal, Proyectos y Finanzas** para cobrar la multa                     | Aviso previo y aviso de vencimiento a las tres áreas, más un contador visible en la ficha (§6)           |
| C5  | **Etapa 8**            | ID de Jestor = aviso (no bloquea)                                                       | Expansión / Aprobación de Locales registra la sucursal en Jestor, genera el ID y notifica a Proyectos                                            | El ID de Jestor pasa a candado. Al transferir, aviso automático a Proyectos                              |
| C6  | **Etapa 4 (PLD)**      | Copia digital del PLD firmado                                                           | El formato va a puño y letra y firmado con pluma azul                                                                                            | Validación con casilla «A puño y letra y pluma azul», sin dato nuevo                                     |
| C7  | **Etapa 6**            | Dictamen y resolución del Comité                                                        | Igual, coordinado por Sebastián                                                                                                                  | Sin cambio; el Comité queda como dato del dictamen                                                       |

Lo demás ya coincide con el documento: regla de secuencialidad (candados en la base), etapa 3 opcional, carta de intención como condición de entrada a la 6, avisos automáticos de COF a 2 meses y de 5 días hábiles con festivos, y COF tardía.

## 2. Flujo completo (lo que mostrarán el mapa del proceso y el video)

| Paso                                     | Qué se hace                                                             | Qué se registra (candado)                                                                                 | Quién                              | Dónde en el CRM                                       | Qué sigue                      |
| ---------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------- | ----------------------------------------------------- | ------------------------------ |
| **1** Recepción y asignación             | Alta del lead, validación territorial, vendedor                         | Contacto, ciudad, origen · resultado territorial · vendedor                                               | Ventas                             | Pipeline → «Registrar lead» · Expediente › Requisitos | 2                              |
| **2** Contacto inicial                   | Primera reunión, correo institucional                                   | Fecha de reunión · fecha de envío (plantilla única)                                                       | Ventas                             | Expediente › Requisitos                               | 3 (si pide contrato) o 4       |
| **3** Revisión de contrato _(opcional)_  | Apartado de $50,000 + IVA, solicitud a Legal, envío del contrato        | Comprobante · validación de Finanzas · solicitud · fecha de envío (Legal)                                 | Ventas → Finanzas → Legal          | Expediente › Requisitos y Documentos                  | 4                              |
| **4** Perfilamiento, PLD y formalización | Survey, PLD a puño y letra, instrucciones de pago, liquidación          | Survey validado · PLD (copia) · instrucciones · comprobante · validación de Finanzas                      | Ventas → Finanzas                  | Expediente › Resumen (datos del Survey) y Requisitos  | 5 (pasa a **franquiciatario**) |
| **5** Bienvenida, carta y factura        | Correo de bienvenida, carta de intención el mismo día del pago, factura | Correo · carta firmada (Legal) · CSF y datos fiscales · PLD original                                      | Ventas · Legal · Finanzas          | Expediente › Requisitos                               | Se crea la **sucursal** en 6   |
| **6** Aprobación de locales              | Lineamientos, propuestas, Comité, dictamen firmado                      | Envío · propuestas · dictamen y resolución · dictamen firmado                                             | Aprobación de Locales (Sebastián)  | Ficha de la sucursal                                  | 7                              |
| **7** Constancia de arrendamiento        | Solicitud a Legal y firma de la constancia                              | Contrato de arrendamiento · solicitud · constancia firmada · fecha límite (arranca la cuenta de 120 días) | Aprob. Locales → Legal             | Ficha de la sucursal                                  | 8                              |
| **8** Transferencia a Proyectos          | Legal habilita; alta en Jestor; Proyectos registra la fecha estimada    | Transferencia · ID Jestor · fecha estimada                                                                | Legal · Aprob. Locales · Proyectos | Ficha de la sucursal                                  | 26.1                           |
| **26.1–26.7** Proyectos                  | Levantamiento → boceto → Brasil → 3D → ejecutivo → obra → capacitación  | Un entregable validado por subpaso (§3)                                                                   | Proyectos                          | Ficha › Requisitos y Documentos                       | 26.8                           |
| **9** COF _(paralelo)_                   | Aviso automático a 2 meses; Legal envía y recaba la firma               | COF enviada · COF firmada y fecha                                                                         | Proyectos (aviso) → Legal          | Carril Legal de la ficha y tablero de Legal           | 10                             |
| **10** Contrato y apertura _(paralelo)_  | Aviso automático a 5 días hábiles; contrato con 2 firmas; liberación    | Fecha confirmada · contrato firmado · **liberación (31)**                                                 | Proyectos → Legal                  | Carril Legal                                          | 26.8                           |
| **26.8** Tienda en operación             | Fecha real de apertura                                                  | Fecha real; exige 26.7 validado y liberación de Legal                                                     | Proyectos                          | Ficha                                                 | Fin                            |

## 3. Subpasos de Proyectos (C1)

| Subpaso                           | Entregable obligatorio (Proyectos carga y valida)                   | Tipo                        |
| --------------------------------- | ------------------------------------------------------------------- | --------------------------- |
| 26.1 Levantamiento arquitectónico | Documentación del levantamiento                                     | Documento                   |
| 26.2 Boceto                       | Archivo del boceto para Brasil                                      | Documento                   |
| 26.3 Envío a Brasil               | Captura o correo del envío (sucursal y fecha) + fecha de envío      | Documento + fecha           |
| 26.4 Proyecto 3D                  | Archivos del proyecto 3D                                            | Documento                   |
| 26.5 Proyecto ejecutivo           | Paquete final                                                       | Documento                   |
| 26.6 Obra                         | Fotografías de terminación                                          | Documento (varios archivos) |
| 26.7 Capacitación y apertura      | Viáticos y hospedaje del capacitador + video o fotos de la apertura | Documentos (2)              |
| 26.8 Tienda en operación          | Fecha real de apertura · liberación de Legal                        | Fecha + condición           |

**Mapeo de las 24 sucursales de muestra en provisionales (propuesta):** Arquitecta asignada → 26.1; Proyecto 3D → 26.4; Proyecto ejecutivo → 26.5; En remodelación y Entrega de local → 26.6; Agenda de capacitación → 26.7. Quedan como muestra; la limpieza las sustituye por datos reales.

## 4. Carril Legal paralelo (C2)

- La sucursal avanza en el Pipeline por los subpasos de Proyectos.
- COF y contrato se registran en un **carril Legal** dentro de la misma ficha. El carril sigue habilitado desde la etapa 8 y se muestra como dos hitos con su estado.
- Legal tiene su propio **tablero de COF y contrato**: sucursales por estado (por notificar, COF enviada, COF firmada, contrato firmado, liberada).
- `crm_avanzar` a 26.8 exige: 26.7 validado **y** COF firmada, contrato con dos firmas y liberación de Legal. La COF tardía sigue marcándose y sugiere la fecha mínima legal.

## 5. Segmentación de usuarios (C3)

| Área / función            | Quién                    | Mueve                       | Valida                                 | Ve                                             |
| ------------------------- | ------------------------ | --------------------------- | -------------------------------------- | ---------------------------------------------- |
| Expansión y Ventas        | Luis (head) + vendedores | 1–5                         | Survey, envíos                         | Todo el Pipeline; sus leads primero            |
| Finanzas                  | Por definir              | —                           | Apartado, liquidación, factura emitida | Pagos y expedientes con requisitos de Finanzas |
| Legal                     | Andrés (head)            | 7, 8, 9, 10 y la liberación | Carta, constancia, COF, contrato       | Todo; tablero de COF y contrato                |
| Aprobación de Locales     | Sebastián (función)      | 6 y alta en Jestor          | Dictamen                               | Sucursales 6–8                                 |
| Proyectos                 | Diego (head) + equipo    | 26.1–26.8                   | Los 8 entregables                      | Sucursales desde la 8; carril Legal en lectura |
| Comité de Aprobaciones    | Integrantes              | —                           | —                                      | Lectura de propuestas y dictámenes             |
| Dirección / desarrollador | Carlo                    | Todo                        | Todo                                   | Todo; Administración                           |

**Datos sensibles** (PLD, Survey, datos fiscales y del obligado solidario): propuesta de que solo los vean Ventas, Legal, Finanzas y Dirección. Se activa con la tabla `crm_visibilidad`, ya diseñada en el doc 40 §5.

**Mis pendientes** se arma por área y función: cada persona entra y ve primero lo que le toca validar o mover.

## 6. Avisos (C4, C5)

| Aviso                       | Cuándo                                            | A quién                         |
| --------------------------- | ------------------------------------------------- | ------------------------------- |
| COF a 2 meses               | Fecha estimada − 2 meses                          | Legal (y Proyectos en copia)    |
| 5 días hábiles              | Fecha confirmada − 5 días hábiles (con festivos)  | Legal                           |
| Límite de 120 días (previo) | 14 días antes del límite                          | Proyectos y Legal               |
| **Límite vencido — multa**  | Día siguiente al límite sin «Tienda en operación» | **Legal, Proyectos y Finanzas** |
| Transferencia a Proyectos   | Al habilitarse la etapa 8                         | Proyectos                       |

La ficha de la sucursal muestra el **contador** «faltan N días para el límite de apertura».

## 7. Vistas: atajos antes de las tablas

- **Cada apartado abre en un resumen:** cifras, accesos directos y los 5 registros más urgentes. La tabla completa queda detrás de «Ver todas» (por etapa, por área o por estado).
- **Nuevo apartado «Proceso»:**
  - Mapa interactivo de las 10 etapas y los 8 subpasos.
  - Al tocar una etapa: qué se hace, qué se registra, quién, dónde y qué sigue, con enlace directo a las cards de esa etapa.
  - Se genera de `crm_etapas` y `crm_requisitos`, así que no se desfasa del candado real.
  - Aquí se incrusta el video, con capítulos que saltan a cada etapa.
- **Pipeline por área:** el selector de tramo pasa a ser la entrada principal (Ventas, Locales y Legal, Proyectos y Carril Legal). El tablero completo de 30 columnas queda como opción.

## 8. Video explicativo

**Herramientas (investigación del 2026-11-14):**

- **Ya instalado:**
  - Plugin `remotion`: skills oficiales de remotion-dev/skills para crear, subtitular y renderizar.
  - `video-shotcraft`: promos de producto.
  - `codesign`: piezas cortas con voz generada.
  - `movimiento-web`: movimiento en la interfaz.
  - **Ninguno trae** un guion de proceso, voz en español, capítulos ni resaltado didáctico de la pantalla.
- **Referencias:**
  - [digitalsamba/claude-code-video-toolkit](https://github.com/digitalsamba/claude-code-video-toolkit) (MIT): Remotion + voz + grabación con Playwright, buena para copiar patrones.
  - [heygen-com/hyperframes](https://github.com/heygen-com/hyperframes) (Apache-2.0): video a partir de HTML, sin costo de licencia.
  - [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-2.0): voz local en español. ElevenLabs es la opción de pago con mejor calidad.
  - Playwright `recordVideo`: tomas reales del arnés con datos sintéticos.
- **Licencia de Remotion:**
  - Es gratis solo para empresas de hasta 3 personas, así que The Coffee necesitaría la Company License.
  - **Creators:** $25 USD al mes por asiento, para renderizar en local. Alcanza si el video se publica como mp4.
  - **Automators:** $0.01 por render, con mínimo de $100 al mes. Aplica si se usa el `<Player>` dentro de la app.
  - Hay que confirmar las condiciones en remotion.dev antes de comprar.

**Herramienta elegida por Carlo: HyperFrames** (Apache-2.0, sin costo de licencia). Remotion queda descartado por la Company License. La arquitectura es la misma: las escenas se escriben en HTML y CSS con los tokens del portal, y la UI real entra como grabación del arnés.

**Arquitectura propuesta:**

1. **Fuente única del contenido:** `flujo-crm.ts` generado desde `crm_etapas` y `crm_requisitos`. Por cada paso guarda qué se hace, qué se registra, la pantalla, qué sigue, quién lo hace, sus candados y el texto de narración. De ahí salen el mapa del proceso, las escenas y los capítulos.
2. **Escenas por etapa:**
   - Diagrama del flujo animado con la etapa encendida.
   - La pantalla real del CRM con la zona resaltada: componente o grabación del arnés.
   - Tarjeta de candados y de qué sigue.
3. **Voz y subtítulos:**
   - Un audio por etapa en español; la duración de cada escena sale del audio.
   - Subtítulos `.vtt` en español.
4. **Plataforma:**
   - El mp4 va en el apartado «Proceso» con `<track kind="chapters">`.
   - Cada capítulo es un atajo que salta a su etapa del video y a sus cards en el CRM.
   - Sin Player, así que sin costo por render.
5. **Skill nueva `video-explicativo`** en `~/.agents/skills`, con junctions a Claude y Codex:
   - Guion por etapa, escenas, voz y subtítulos en español, embebido con capítulos, licencias y captura con Playwright.
   - Usa HyperFrames para el render y `movimiento-web` para los tiempos.
   - No conviene ampliar `video-shotcraft` (es de promos y viene de un plugin) ni `movimiento-web` (es para la interfaz).

## 9. Autenticación de nuevos usuarios

**Ya existe:** el flujo de invitación. `/auth/confirm` acepta `type=invite` y `type=recovery` y lleva a `/establecer-contrasena`, donde la persona elige su contraseña. Nadie recibe una contraseña genérica.

**Falta en el portal:** el enlace «¿Olvidaste tu contraseña?» en el login (`resetPasswordForEmail`). Se agrega en este encargo.

**Lo que hace Carlo en Supabase:**

1. **SMTP propio** (Authentication → Emails → SMTP Settings): remitente, host, puerto, usuario y contraseña del correo nuevo. Sin SMTP propio, Supabase solo manda unos pocos correos por hora.
2. **URL Configuration:**
   - Site URL: `https://the-coffee-costeo.vercel.app`.
   - Redirect URL: la misma con `/auth/confirm`.
3. **Plantillas «Invite user» y «Reset password»:** el enlace debe ser `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=invite` (y `type=recovery` en la de recuperación). Se entrega el texto de ambas en español.
4. **Invitar a cada persona** desde Authentication → Users → Invite user, con su correo.

**Lo que hago yo después, con tu OK:** el perfil, el acceso al módulo CRM y la membresía de área de cada persona (head, miembro o lectura, y sus funciones).

## 10. Checkpoint C — respuestas de Carlo (2026-11-14)

| Pregunta        | Decisión                                                                                                                      |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| COF y contrato  | **Carril Legal paralelo** (§4)                                                                                                |
| Finanzas        | **Se activa ahora**: valida apartado, liquidación y factura, y recibe el aviso de multa. Falta saber quiénes son sus usuarios |
| Datos sensibles | **Solo Ventas, Legal, Finanzas y Dirección** (§5)                                                                             |
| Video           | **HyperFrames** (gratis)                                                                                                      |

**Por defecto, salvo que Carlo indique otra cosa:**

- El mapeo de las 24 sucursales provisionales es el de §3.
- El ID de Jestor pasa a candado de la etapa 8.
- El PLD «a puño y letra y pluma azul» se registra como casilla de validación.

## 11. Plan de ejecución

1. **Fase 1, base de datos** (migración 50, rama `feat/crm-flujo-completo`):
   - 8 subpasos de Proyectos con requisitos y mapeo de la muestra.
   - Carril Legal en `crm_avanzar`.
   - Activación de Finanzas.
   - Avisos de multa y de transferencia.
   - `crm_visibilidad` activa para los datos sensibles.
   - Pruebas PGlite y ensayo con ROLLBACK en producción.
2. **Fase 2, aplicación:**
   - Apartado «Proceso» con el mapa interactivo.
   - Atajos antes de las tablas.
   - Tablero de COF y contrato.
   - Contador de 120 días.
   - Mis pendientes por función.
   - Campos sensibles ocultos.
   - «¿Olvidaste tu contraseña?» en el login.
3. **PR y merge con OK de Carlo:** el merge aplica la migración.
4. **Autenticación:** Carlo configura SMTP y plantillas y envía las invitaciones. Después, con su OK, se dan accesos y membresías.
5. **Video:** skill `video-explicativo`, guion desde `flujo-crm.ts`, voz en español, render con HyperFrames y mp4 con capítulos en «Proceso».

## 12. Fase 1 — implementación (2026-11-14, rama `feat/crm-flujo-completo`)

**Migración `20261114000050_crm_flujo_completo.sql`:**

- **Etapas:** 7 subpasos nuevos de Proyectos (26.1–26.7). «Operando» pasa a «Tienda en operación» (26.8) y la mueve Proyectos. Las 6 provisionales quedan inactivas, porque la muestra guarda su etapa de origen.
- **Requisitos:** de 37 a 48.
  - 10 entregables de Proyectos.
  - «Factura emitida», que no bloquea.
  - El ID de Jestor pasa a candado.
  - Finanzas registra el apartado y la liquidación.
  - El PLD se valida contra la forma (a puño y letra, pluma azul).
- **Carril Legal:**
  - COF y contrato llevan `carril = 'legal'`. Sus requisitos se ven desde la etapa 8 y no son destino de `crm_avanzar`.
  - Pasar a 26.8 exige el carril completo, y ninguna liberación de head lo cubre.
  - `crm_v_candados` agrega `carril_total` y `carril_listos`.
- **Mapeo de las sucursales:** de provisionales y de COF/contrato a subpasos, con evento «Sistema» y motivo en la bitácora.
- **Avisos:**
  - `limite_120` va a Proyectos y a Legal.
  - `limite_vencido` (multa) va a Legal, Proyectos y Finanzas.
  - `transferencia` va a Proyectos.
  - Único por (tipo, sucursal, fecha, área).
- **Datos sensibles:**
  - `crm_franquiciatario_fiscal` es 1:1 con RLS `crm_ve_sensibles()`: Ventas, Legal, Finanzas y desarrollador.
  - Su bitácora registra el campo que cambió, nunca el valor.
  - Los documentos Survey, PLD, CSF, comprobantes y factura quedan ocultos para las demás áreas, con política restrictiva en `crm_archivos` (Storage depende de esa fila).
- **Bitácora:** los cambios de configuración de la migración quedan como «Sistema».

**Aplicación:**

- Tipos.
- Pipeline sin columnas de carril y tramo «Proyectos · 26.1 a 26.7».
- Recorrido de etapas con subpasos.
- Resumen con datos fiscales ocultos para quien no los ve.
- `guardarCard` escribe los fiscales en su tabla.
- Finanzas sin el respaldo de Ventas.
- Mapeo de la muestra con las claves nuevas.

**Evidencia:**

- `tsc`, `next build` y `git diff --check` pasan.
- `vitest`: **980 aprobadas**, 5 omitidas. Solo falla `paridad`, como en `main`.
- Pruebas nuevas:
  - Subpasos con entregable.
  - Carril Legal que bloquea la apertura y que ningún head libera.
  - Multa a tres áreas.
  - Datos y documentos sensibles por área.
  - Bitácora sin valores fiscales.

**Ensayo con ROLLBACK en producción (2026-11-14, por la API de administración de Supabase):**

- Corrió con `scripts/crm/ensayo-flujo-completo.ts --api`. Se usó la API porque la conexión directa es solo IPv6 y el pooler rechazó la contraseña.
- Todo fue en una petición que terminó en error a propósito, así que la transacción se abortó. Después se comprobó que **nada persistió**: siguen 48 migraciones, la tabla fiscal no existe y hay 22 etapas activas.
- La migración aplica en **2.3 s** sobre los datos reales.
- **Sucursales que cambian de etapa (24, cada una con su evento «Sistema» en la bitácora):**
  - Arquitecta (4) → 26.1 Levantamiento.
  - 3D (3) → 26.4.
  - Ejecutivo (5) → 26.5.
  - Remodelación (11) → 26.6 Obra.
  - 1 sucursal que estaba en COF → 26.7 Capacitación.
  - Las demás no cambian: locales 65, constancia 4, operando 72, standby 5, cancelada 4 y cerrada 2.
- **Datos fiscales:** 0 franquiciatarios los tenían capturados, y la bitácora no guardaba valores fiscales. No hay nada que mover ni que ocultar del pasado.
- **Membresías de área:** 0 en producción. Activar Finanzas no le quita nada hoy a nadie.
- **Documentos sensibles existentes:** 0.
- **Seguridad:** ninguna tabla `crm_*` sin RLS y ningún grant a `anon`. `crm_v_candados` lee 3,850 cards sin error.
- **Vencimientos:** 96, todos de COF. No hay sucursales de muestra con fecha límite, así que hoy no se genera ningún aviso de multa.

**Numeración:** el archivo se llama **50** porque producción ya tiene aplicadas las migraciones 44–49 del proyecto Comercializadora, que aún no están en `main`. Supabase ordena por la fecha completa (`20261114…` va después de `20261113…49`).

**Ojo al hacer el merge:** Finanzas queda activa. Mientras no tenga integrantes, solo un head o un desarrollador puede registrar los pagos validados.
