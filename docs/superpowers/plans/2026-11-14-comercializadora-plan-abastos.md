# Comercializadora: Plan de abastos y Esta semana (plan 3f)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traer al portal las dos últimas pantallas de "Planear" del sitio viejo, las que juntan lo local con el café y las importaciones:
- **Plan de abastos:** cuánto dinero hay que disponer cada semana (4, 8 o 12) para las tres categorías, de dónde sale ("Dónde se va el dinero", "Qué trae cada barra alta"), la gráfica "Compras por semana", las matrices por proveedor y por artículo con "Crear OC", el seguimiento de ventas y "Exportar Excel" (seis hojas).
- **Esta semana:** lo que hay que ordenar esta semana o la próxima, por proveedor, con el monto, el viernes de pago, el mínimo, "Copiar pedido", "Crear OC", lo que se quedaría sin producto y los borradores de Zoho por resolver.

**Architecture:** Igual que los planes 3 a 3e (route group `app/(comercializadora)`, server components con la sesión, client components en `components/comercializadora/`). Lo nuevo:
- **Módulos puros en `supabase/functions/_shared/`, ports literales con paridad:**
  - `planProv.ts` suma `planLocal(R, cfg)`: el `_planBuild` local completo (el armado del 3d con la simulación del servidor, más la agrupación por proveedor del 3e).
  - `planSem.ts`: las tres categorías del Plan de abastos (`_PSEM_CATS`, `_psemGrupos`, `_psemGruposImp`, `_psemPasadas`, `_planSemCalc`, `_psemFamDe`, `_psemHoyMonto`).
  - `planHoy.ts`: Esta semana (`_hoyGrupos`, `_hoyRiesgos`, `_borrAnalisis`, `_ctxFila`, el texto de `_hoyCopiar` y el viernes de pago `_pagoFecha`/`_pagoPedidoFecha`/`_pagoPorFecha`).
- **Sin cargar datos aparte:** todo corre sobre `motorPlan` (caché de 10 minutos, una carga a la vez). `motor.ts` suma `planLocalMotor`; café e importaciones son `cafeOrdenesMotor` e `importacionesMotor` del 3e. La carga lee tres columnas que ya existen y no leía: `com_catalogo.clasificacion_detallada`, `com_zoho_oc_lineas.synced_at` y `com_zoho_proveedor.dias_credito`.
- **Capa del portal en `lib/comercializadora/`:** `planAbastos.ts` y `estaSemana.ts` (lo que pinta cada pantalla, sin HTML), `excelPlan.ts` (las seis hojas) y `crearOc.ts` (Crear OC del plan local).
- **Nada escribe.** No hay acciones nuevas, migraciones ni dependencias. "Crear OC" solo prellena Órdenes y "Copiar pedido" usa el portapapeles.

Rama: `feat/comercializadora-plan-abastos`, encima de `feat/comercializadora-importaciones` (PR #117).

**Tech Stack:** Next.js 16 (App Router), React 19, Tailwind, Supabase (Postgres/RLS), Vitest + Testing Library, Deno (`deno test`) para los ports y su paridad, SheetJS (`xlsx` 0.20.3, ya instalado), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas: "los cálculos que hoy viven en JS del HTML pasan a funciones puras con pruebas y casos tomados del comportamiento actual"). Anteceden:
- plan 3: `2026-11-13-comercializadora-pantallas-compras.md` (PR #113);
- plan 3b: `2026-11-13-comercializadora-inventario-config.md` (PR #114);
- plan 3c: `2026-11-13-comercializadora-operacion.md` (PR #115);
- plan 3d: `2026-11-13-comercializadora-motor-indicadores.md` (PR #116);
- plan 3e: `2026-11-14-comercializadora-importaciones-cafe.md` (PR #117).

Con este plan termina el bloque Planear. Sigue el plan 4 (paridad y cutover).

Origen en el HTML viejo `a9e4a22`:
- **Plan de abastos** (pestaña `semanal`, `renderComPlanSemanal` 35313). Las funciones `_planSem*` están **dos veces**: el bloque de 39802–40258 ("Estas funciones sustituyen a las del mismo nombre de la PARTE E") gana para `_planSemCalc`, `_planSemKpisHtml`, `_planSemGraficaHtml`, `_planSemFiltrarProvs`, `_planSemTablaProvsHtml`, `_planSemTablaArtsHtml`, `_planSemToolbarHtml`, `_planSemComoHtml`, `_planSemPintarTodo`, `_planSemRepintarEncabezado` y `_planSemExportar` (40230). Del primer bloque (35032–35311) siguen vivas `_planMoneyCorto`, `_planSemW`, `_planSemEtiqueta`, `_planSemCelda`, `_planSemSeguimientoHtml` (35183), `_planSegTxt`, `_planSemCss`, `_planSemPintarTabla` y los `_planSemSet*`/`_planSemToggle`. `_planSemEtiquetaPas` (35101) es código muerto.
- **Esta semana** (pestaña `hoy`, `renderComHoy` 40344): 40261–40440 (`_hoyCss`, `_borrAnalisis` 40288, `_borrResolverHtml` 40321, `_hoyGrupos` 40360, `_hoyRiesgos` 40368, `_hoyPintar` 40395, `_hoyCopiar` 40433), los pagos de 40615–40704 (`_PAGO_MARGEN` 40619, `_pagoFecha` 40624, `_pagoCredito` 40641, `_pagoPedidoFecha` 40662, `_pagoPorFecha` 40672) y `_pagoTd`/`_ctxFila`/`_hoyDetalleHtml` (40863–40886).
- Las dos usan `_planAsegurar` (34967) y `_planBuild` (33364), con la superposición del servidor `_planAplicarServidor` (33490) y `c.provs = _planAgruparProv(c)` (33438). `_planSimple()` (40445) es el interruptor Simple/Detallada de localStorage, no una pantalla.

## Decisiones (al planear, 2026-11-14)

1. **El bloque Planear restante se divide en dos planes (lo eligió el usuario):** 3e = Importaciones y Café; 3f = Plan de abastos y Esta semana (este). "Todo lo demás" no se porta (decisión 2 del 3d).
2. **Gráfica del Plan de abastos: solo "Compras por semana" (lo eligió el usuario).** El modo "Pagos por viernes" (`_psemGraf`, `_psemPagos` 40906, `_planSemPagosHtml` 40940) duplicaba la pantalla Pagos del portal. En su lugar, la sección lleva el enlace **"Ver pagos proyectados"** a `/comercializadora/pagos`.
3. **"Borradores en Zoho por resolver" lee los borradores de zoho-sync (lo eligió el usuario):** `com_zoho_oc_lineas` con `status = 'draft'` (`R.ocZohoBorr`), no la carga de Zoho guardada en la configuración (`cfg.zoho_oc`). Las reglas de `_borrAnalisis` no cambian:
   - cobertura = Σ mín(pendiente, lo que pide el plan en las semanas 0 y 1) / pendiente;
   - más de 30 días en borrador → borrar; cobertura ≥ 0.8 → emitir; > 0 → emitir ajustando; si no → borrar.

   `borrFuenteZoho` (Tarea 3) arma las líneas con la forma del viejo:
   - pendiente = pedida − recibida;
   - monto = pendiente × precio. zoho-sync deja el precio en null si la OC no es en pesos, y entonces el monto es "—" (el viejo convertía dólares);
   - "creada" vacía, porque Zoho no la trae: los días se cuentan desde la fecha de la OC;
   - la fecha del aviso es el día de CDMX de la última sincronización.

   **Con la decisión 6 del 3d:** un borrador nunca cuenta como en camino, así que "ya vienen" (`r.s.enOC`) nunca incluye otro borrador. Tampoco cuenta como compra emitida en la gráfica: `psemPasadas` excluye los folios de la configuración **y** los de zoho-sync (`borradorFoliosPlan`, Tarea 1).
4. **Superposición del servidor (`_planAplicarServidor`), que el 3d portó y probó y hasta ahora nadie usaba.** Las dos pantallas usan `planLocal(R, cfg)` con `R.srv`, no `planSinSrv`.
   - Si la corrida de `com-proyeccion` tiene ≤ 36 h y el número de filas coincide (`servidorPlan` del 3d), sem/pedirEsta/pedirProx/pedirHoy de lo local salen de `com_pago_proyectado` tipo `proyectado` (`fuenteCant = 'servidor'`, horizonte de 12 semanas). Si no, es el cálculo local.
   - El café solo toma las cantidades del servidor con `compra.excluir_cafe = false`, e Importaciones nunca. DOH e Indicadores siguen con el cálculo local (decisión 5 del 3d).
   - **Aviso, siempre visible arriba:** con servidor, "Cantidades: simulación del servidor [de ayer | del] 13 nov 2026 08:30 (la misma de la OC automática, Qué pedir y Pagos)" (`_planSrvChipTxt` 38584). Con cálculo local y una corrida leída, la caja ámbar del viejo con el motivo ("corrida de hace 40 h", "corrida incompleta (se está recalculando)", "sin corrida"; `_planBannersHtml` 33747). Con "Ver todo" se agregan las líneas de artículos de la simulación que no están en el plan y de los que no tienen costo o proveedor (38640).
5. **Viernes de pago con `com_zoho_proveedor.dias_credito`.** La cadencia es la del viejo:
   - el pedido de la semana k se hace el lunes de esa semana, o hoy si ese lunes ya pasó;
   - de contado se paga el viernes que caiga al menos 3 días después (`_PAGO_MARGEN`): pedido el lunes o el martes, ese viernes; del miércoles en adelante, el siguiente;
   - con crédito, el viernes anterior al vencimiento, nunca antes que el de contado.

   El viejo buscaba los días por **nombre** en `com_proveedores` (`_pagoCredito`). El portal los toma de zoho-sync con `creditoProv` (Tarea 8):
   1. local y café: por el vendor del grupo (`vendorDe`, el vendor mayoritario de sus artículos o el de mismo nombre; la misma regla del mínimo, `_minVendorDeGrupo`);
   2. si no hay (Importaciones, o un grupo sin vendor): por nombre como el viejo, completo y luego sin el paréntesis final (`_pagoKeyS`; con varios, el mayor crédito). "Green Packaging (vasos y tapas)" encuentra a "Green Packaging";
   3. sin coincidencia: contado (0 días), y la celda Pago dice "sin proveedor de Zoho".
6. **Crear OC del plan local:** `ocLocal` = `_planCrearOC(key)` (34009) sobre el plan local, con el origen **"Plan de abastos"** (`?nueva=plan`). El viejo decía "Plan de abasto".
   - Los grupos de Café usan `ocCafe` y los de Importaciones `ocImportaciones`, del 3e (`ocGrupoSem` elige).
   - Como en el viejo, el botón sale si el proveedor es real y tiene algo en la semana 0, solo en la semana actual de Esta semana y **solo con permiso de edición**.
   - Con la simulación del servidor la OC lleva solo lo de **hoy** (`pedirHoy`). Si no hay nada para hoy, en lugar del botón va el texto del viejo ("Nada que pedir hoy a este proveedor: lo de esta semana toca en los próximos días"), como en Café (revisión 3e, I1).
7. **"Copiar pedido": el texto exacto de `_hoyCopiar`.** Los avisos son los del viejo ("Pedido copiado: pégalo en el correo o WhatsApp del proveedor" / "No se pudo copiar automáticamente"). Va en un botón de cliente (`CopiarTexto`) que también sirve para "Copiar folios por borrar" (`_borrCopiar`). El texto es así:

   ```text
   Pedido a Jarabes MX — 13 nov
   - LOC-JAR-001 · Jarabe vainilla 1 L: 31 ($2,945)
   …
   Total estimado: $5,130
   ```

   Con " (próxima semana)" tras la fecha en la semana 1, y "contenedor" en las filas de contenedor.
8. **Rutas, navegación y parámetros:**
   - Rutas: `/comercializadora/plan-abastos` ("Planear y pagar", primero, icono `CalendarRange`) y `/comercializadora/esta-semana` ("Comprar", después de Qué pedir, icono `CalendarCheck`). En el viejo "Esta semana" era la primera pestaña de Compras.
   - Plan de abastos, por URL:
     - `?sin=cafe,imp` = categorías fuera del dinero a disponer. Sustituye a `localStorage 'plan_sem_inc'`; sin parámetro, las tres;
     - `?sem=4|8|12`: semanas que se ven (`_planSemW`);
     - `?vista=articulo` (por omisión, por proveedor);
     - `?q=` y `?prov=` (búsqueda y proveedor, en un formulario GET). Un `prov` que ya no existe se ignora, como hacía `_planSemCalc`.
   - Esta semana: `?sem=1` = la próxima semana.
   - En las dos, `?det=1` = "Ver todo". El viejo usaba `_planSimple()` (localStorage `plan_det`). La vista simple es la de omisión, como en el 3e.
   - En la vista simple el detalle del Plan de abastos va plegado ("Ver detalle por proveedor y artículo") y se abre solo si la URL trae filtros.
9. **Colores de las categorías.** Los del viejo (#374151 gris, #92400E café, #7C3AED morado) y los tokens del portal fallan el piso de croma o de luminosidad del validador de paletas (skill dataviz). Se usan **#1f74a6** (Todo lo demás), **#b0703c** (Café) y **#7c3aed** (Importaciones): pasan en claro y en oscuro, con CVD ΔE ≥ 16.9. La gráfica separa los segmentos con 2 px de superficie, lleva leyenda siempre y el detalle de cada barra va en su `title`. Las matrices son la vista en tabla.
10. **Cuando Importaciones o Café fallan:**
    - **Si falla `motorPlan`** (base o puente caído), las pantallas muestran el error sin números, como las demás: lo local también depende de los pedidos del puente. Esta semana agrega el enlace "Ir a Órdenes de compra", como el viejo.
    - **Si solo falla una categoría** (Importaciones sin artículos activos, el motor de la hoja que lanza, el café que lanza), lo local se calcula igual. El error queda en su tarjeta y esa categoría no suma. **Cambio pequeño:** el viejo solo mostraba ese error en la vista detallada; aquí siempre, con "No se cuenta en los totales". En Esta semana el viejo ya lo mostraba siempre.
    - Si no se leyeron aperturas, mínimos o borradores, la línea "No se pudieron leer: …" de las otras pantallas.
11. **Importaciones dentro del plan usa el escenario guardado** (`importacionesMotor(m, null)`). El viejo usaba el que estuviera seleccionado en la pestaña Importaciones durante la sesión (`_impUI.esc`); sin haberlo cambiado, era el guardado.
12. **Excel: las seis hojas de `_planSemExportar` (40230), con todas las semanas del plan.** Son Resumen por categoría, Por proveedor, Por artículo (piezas), Por artículo ($), Compras ya emitidas y Configuración. Se arman con el mismo `DescargarExcel` del 3e.
    - La hoja Configuración es `_planCfgPlanaFilas`, con imp y café normalizados como los tenía el viejo y los eventos al final.
    - **Sin la carga de Zoho (`zoho_oc`):** no es un parámetro y su JSON puede pasar del límite de 32,767 caracteres por celda.
    - Sin la fila "AVISO" de borrador: el portal no tiene borrador compartido.
13. **No se porta de estas pantallas:**
    - el historial de 60 días por proveedor (`hist`) y el "Por qué" con `com_minmax`: el 3d los dejó para el 3f, pero ninguna de las dos pantallas los pinta. Solo los usaba el panel de proveedores de "Todo lo demás";
    - `_planBannersHtml`, salvo la caja de la fuente de la decisión 4;
    - `_planFuenteHtml` y `_planResumenCfgHtml`: los cubren "Datos del plan" de Indicadores y Configuración;
    - `_actProximasHtml`, `_pagoChipHtml` y el modo "Pagos por viernes" (decisión 2);
    - `_planSemEtiquetaPas` (muerto).

    "Actualizar datos" es `ActualizarMotor` (3d).
14. **Paridad de lo que estaba duplicado.** `pruebas/appVieja.ts` toma la **última** declaración de un nombre, como el navegador. Ninguno de los nombres que ya usaban las pruebas está duplicado: las 274 pasan igual. `claseFecha` agrega `getDay` y `setDate` en hora de CDMX, porque los pagos los usan. Antes dependían de la zona de la máquina.
15. **Las tablas no paginan de 25 en 25**, como en el 3e (decisión 16). Van agrupadas por categoría y proveedor, con columnas por semana. Una prueba con 600 artículos de 40 proveedores confirma que entran completas.
16. **"Ver" de un riesgo** lleva a Qué pedir (lo local; "Todo lo demás" no existe en el portal), a Café o a Importaciones.

**Fuera de este plan:** el panel de proveedores con historial de "Todo lo demás" y "Pagos por viernes" (decisiones 2 y 13); la paridad con datos reales y el cutover (plan 4).

## Mapa de archivos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `supabase/functions/_shared/pruebas/appVieja.ts` | 1 | La última declaración gana; `getDay`/`setDate` de CDMX |
| `supabase/functions/_shared/pruebas/fixturesSem.ts` | 1 (lo usan 1–9) | Datos locales, proveedores de Zoho con crédito, OCs, borradores y simulación |
| `supabase/functions/_shared/planDatos.ts` | 1 | `zprov.dias_credito`, `LineaBorrador.synced_at`, `borradorFoliosPlan` |
| `supabase/functions/_shared/planProv.ts` | 1 | `PlanProv`, `planLocal` |
| `lib/comercializadora/motor.ts` | 1 | Columnas nuevas en la carga y `planLocalMotor` |
| `supabase/functions/_shared/planSem.ts` | 2 | Categorías, grupos, compras emitidas, totales, familias |
| `supabase/functions/_shared/planHoy.ts` | 3 | Pagos, proveedores de la semana, riesgos, borradores, texto del pedido |
| `lib/comercializadora/crearOc.ts`, `app/.../ordenes` (sin cambios) | 4 | `ocPlan`, `ocLocal`, `ocGrupoSem`; origen "Plan de abastos" |
| `lib/comercializadora/excelPlan.ts` | 5 | Las seis hojas |
| `lib/comercializadora/planAbastos.ts` | 6 | Lo que pinta el Plan de abastos |
| `components/comercializadora/{fila-plegable,copiar-texto,plan-abastos}.tsx`, `app/.../plan-abastos/page.tsx` | 7 | Pantalla Plan de abastos |
| `lib/comercializadora/estaSemana.ts` | 8 | Crédito por proveedor y lo que pinta Esta semana |
| `components/comercializadora/esta-semana.tsx`, `app/.../esta-semana/page.tsx` | 9 | Pantalla Esta semana |
| `components/portal/navegacion.tsx` | 7, 9 | Plan de abastos (7) y Esta semana (9) |

## Global Constraints

- Las de los planes 3 a 3e:
  - ruta `/comercializadora/*`;
  - acceso por `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` ven "Crear OC");
  - día de CDMX (en el motor, `R.hoy`/`c.hoyIso` es el día de CDMX);
  - piezas de `components/portal/piezas.tsx` y tablas `.tabla`, con la excepción de la decisión 15;
  - montos MXN (`dinero` = `_planMoney`, sin centavos; `dineroCorto` = `_planMoneyCorto`);
  - pruebas: `npm test`, `npm run typecheck`, `npm run test:funciones` y prettier sobre lo tocado de `app`, `components`, `lib` y `tests`.
- **Paridad:** cada port de `_shared` es literal, con los mismos nombres sin `_`, estilo `var` y `// deno-lint-ignore-file`. Next lo importa, así que también pasa `tsc` en modo strict. Lo que no es del viejo va marcado como tal: `borradorFoliosPlan`, `borrFuenteZoho`, `creditoProv` y la capa `lib/`.
- **Las pruebas de paridad se ignoran sin `COM_APP_VIEJA`.** Para ver el RED y el GREEN de las Tareas 1 a 3 hay que exportar antes (Git Bash):
  ```bash
  git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" show a9e4a22:app/index.html > "$TEMP/app-vieja-a9e4a22.html"
  export COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html"
  ```
  Una prueba de paridad que sale "ignored" no cuenta como verde.
- `pruebas/fixturesSem.ts` **no** importa `pruebas/appVieja.ts`, que lee `Deno.env`: también lo importan las pruebas de Vitest.
- La llave de servicio solo se usa en `lib/comercializadora/legado.ts`; `motor.ts` es server-only. Los client components (`fila-plegable.tsx`, `copiar-texto.tsx`) no importan `motor.ts`, `legado.ts` ni los ports: reciben texto y nodos ya armados.
- **Sin migraciones, sin dependencias nuevas, sin escrituras.** Este plan no agrega acciones. Las tres columnas que se leen ya existen (migración 45).
- **Mientras el viejo siga en Real, durante la revisión no se guarda en producción ninguna OC prellenada** desde estas pantallas. La copia en espejo la borraría y el viejo sigue siendo la fuente.

## Review Focus

1. **Simulación del servidor vieja, incompleta o con huecos.** Con `ok = false` (más de 36 h, filas de menos, sin corrida) todo es cálculo local y la caja ámbar dice el motivo. Con servidor, los artículos de la simulación que no están en el plan y los que no tienen costo o proveedor se cuentan con "Ver todo". Lo cubren:
   - Tarea 1 ("con la simulación vieja (ok=false) se queda con el cálculo local" y la paridad con `VIEJA`);
   - Tarea 6 (`fuenteCant`: de hoy, de ayer, más vieja, local con motivo);
   - Tarea 7 ("avisa de dónde salen las cantidades").
2. **Proveedor sin días de crédito o que no se encuentra en Zoho, y `com_zoho_proveedor` que no se puede leer.** Se paga de contado, la celda dice "sin proveedor de Zoho" y la línea de lecturas dice "mínimos de proveedor". Lo cubren:
   - Tarea 8 (`creditoProv` con vendor, por nombre, sin paréntesis, con el mayor de varios, sin coincidencia y con `zprov` null);
   - Tarea 9 (Tisanas "sin proveedor de Zoho"; el grupo sin proveedor asignado).
3. **Semanas que cruzan mes o año y viernes a fin de mes.** El pago de un pedido del 28-dic, un viernes 1-ene o la semana que cruza febrero no se recorren ni se duplican. Lo cubre la Tarea 3:
   - paridad de `pagoFecha` en 150 días seguidos con 10 créditos;
   - `pagoPedidoFecha`/`pagoPorFecha` con "hoy" en cada día de la semana, fines de mes, 31-dic, 1-ene y 26/28-feb/1-mar, con semanas de 7 y de 10 días;
   - casos a mano de fin de año y de febrero.
4. **Importaciones o Café que no se pueden calcular, y el puente caído.** Lo local se ve igual, la tarjeta de la categoría dice por qué y no suma. Con el motor caído, el error sin números. Lo cubren:
   - Tarea 2 (paridad con café que lanza e Importaciones vacía);
   - Tareas 7 y 9 (tarjeta con el error; motor caído).
5. **Plan vacío o enorme.** Sin compras, la gráfica dice "Sin compras previstas ni emitidas en este periodo", las matrices "Sin resultados con estos filtros", Esta semana "No hay nada que pedir…" y no hay panel de borradores. Con 600 artículos de 40 proveedores todo entra y los totales cuadran. Lo cubren:
   - Tarea 6 ("plan grande");
   - Tareas 7 y 9 ("plan sin compras" y "sin borradores ni nada que pedir").

---

### Task 1: Plan local completo con la simulación del servidor, datos de prueba y lo que lee la carga

**Files:**
- Modify: `supabase/functions/_shared/pruebas/appVieja.ts` (`fuente` toma la última declaración; `getDay`/`setDate`)
- Create: `supabase/functions/_shared/pruebas/fixturesSem.ts`
- Modify: `supabase/functions/_shared/planDatos.ts` (`zprov.dias_credito`, `LineaBorrador.synced_at`, `borradorFoliosPlan`)
- Modify: `supabase/functions/_shared/planProv.ts` (`PlanProv`, `planLocal`)
- Modify: `lib/comercializadora/motor.ts` (columnas y `planLocalMotor`)
- Test: `supabase/functions/_shared/planProv_parity_test.ts`, `tests/portal/com-plan-abastos-motor.test.ts`

**Interfaces:**
- Consumes:
  - de `planBuild.ts` (3d): `planBuild(R, cfg): Plan` (ya aplica `planAplicarServidor`);
  - de `planProv.ts` (3e): `planProvs(c, R) → { provs: GrupoProv[]; minManual; vendorDe }`;
  - de `planDatos.ts`: `DatosPlan`, `LineaBorrador`, `zocFuenteBorr`, `zocKey`;
  - de `fixturesImp.ts`: `CAT_IMP`, `OC_IMP`, `datosImp`, `pedidosImp`.
- Produces:
  - `planProv.ts`: `type PlanProv = Plan & { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> }` y `planLocal(R: DatosPlan, cfg: any): PlanProv`.
  - `planDatos.ts`:
    - `DatosPlan.zprov[].dias_credito?: number | null`;
    - `LineaBorrador.synced_at?: string | null`;
    - `borradorFoliosPlan(R, cfg): Record<string, 1> | null` (folios en borrador de la configuración y de zoho-sync).
  - `motor.ts`: `planLocalMotor(m: MotorListo): PlanProv` (memo `'plan-local'`). La carga pide `clasificacion_detallada`, `synced_at` y `dias_credito`.
  - `fixturesSem.ts`:
    - nombres y stubs de la app: `NOMBRES_SEM`, `NOMBRES_HOY`, `STUBS_SEM`;
    - datos: `CAT_LOCAL`, `CAT_SEM`, `pedidosSem`, `OC_LOCAL`, `OC_SEM`, `BORR_SEM`, `ZOHO_OC_SEM`, `ZPROV_SEM`, `SRV_SEM`;
    - `datosSem(extra?): DatosPlan`.

- [ ] **Step 1: Datos de prueba y pruebas que fallan**

En `supabase/functions/_shared/pruebas/appVieja.ts`, cambiar el comentario y el principio de `fuente` (hasta el `if (!m) throw …`) por:

```ts
/**
 * Código fuente de una declaración top-level de la app (function / var / const) por nombre, con balanceo de llaves. Si el
 * nombre se declara dos veces vale la ÚLTIMA, como en el navegador (el Plan de abastos redefine sus _planSem* en 39807).
 */
export function fuente(nombre: string): string {
  const re = new RegExp(`(?:^|\\n)((?:async )?function ${nombre}\\(|(?:var|const) ${nombre}\\s*=)`, "g");
  let m: RegExpExecArray | null = null;
  for (let x = re.exec(APP); x; x = re.exec(APP)) m = x;
  if (!m) throw new Error("No encontré " + nombre + " en app/index.html");
```

y, en `claseFecha`, agregar después de `override getHours() …`:

```ts
    override getHours() { return this.l().getUTCHours(); }
    override getDay() { return this.l().getUTCDay(); }
    override setDate(d: number) {
      const l = this.l(); l.setUTCDate(d); return this.setTime(l.getTime() + OFF);
    }
```

Crear `supabase/functions/_shared/pruebas/fixturesSem.ts` (lo usan también las Tareas 2 a 9; los nombres de Esta semana ya van aquí):

```ts
// deno-lint-ignore-file no-explicit-any
// Datos de prueba del Plan de abastos y Esta semana (plan 3f): los de Importaciones y Café más compras locales con
// proveedores de Zoho (mínimos y días de crédito), OCs emitidas de las últimas semanas y borradores de zoho-sync. No importa
// appVieja.ts (que lee Deno.env): también lo usan las pruebas de Vitest.
import type { DatosPlan, LineaBorrador, Servidor } from "../planDatos.ts";
import { CAT_IMP, datosImp, OC_IMP, pedidosImp } from "./fixturesImp.ts";

/** Generador determinista (el mismo de appVieja.ts). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** Lo que portan planSem.ts y planHoy.ts (además de los nombres del plan, Importaciones y Café). */
export const NOMBRES_SEM = [
  "_planSemUI", "_PSEM_CATS", "_psemZ", "_psemIncLeer", "_psemUI", "_psemGrupos", "_psemGruposImp", "_psemImpSet", "_psemPasadas",
  "_planSemCalc", "_psemSum", "_planSemW", "_psemFamDe", "_psemHoyMonto", "_zocBorradorFolios", "_zocBorrFolMemo", "_impDif",
  "_PLAN_MESES", "_planFechaCorta", "_planEngDia", "_planNF", "_planN",
];
/** Esta semana: pagos, riesgos y borradores. */
export const NOMBRES_HOY = [
  "_hoyUI", "_hoyGrupos", "_hoyRiesgos", "_borrAnalisis", "_ctxFila", "_PAGO_MARGEN", "_PAGO_DIAS", "_pagoViernesSig",
  "_pagoViernesAnt", "_pagoFecha", "_pagoTxt", "_pagoPedidoFecha", "_pagoPorFecha", "_planIso",
];
/**
 * _planSemCalc, _hoyRiesgos y _borrAnalisis leen globales del navegador: el plan local (_planCache), el de café
 * (_cafeOrdenes), la fuente de borradores (_borrFuente) y los días de crédito (_pagoCredito). Se leen de globalThis.
 */
export const STUBS_SEM = [
  "var _planCache=new Proxy({},{get:function(t,k){return globalThis.__C?globalThis.__C[k]:undefined;}});",
  "function _cafeOrdenes(){if(globalThis.__CC_ERR)throw new Error(globalThis.__CC_ERR);return globalThis.__CC;}",
  "function _planSimple(){return true;}",
  "function _borrFuente(){return globalThis.__F||null;}",
  "function _pagoCredito(n){return (globalThis.__CR||{})[n]||0;}",
].join("\n");

const loc = (o: Record<string, unknown>) => ({ estatus: "Compra Recurrente", categoria: "Barra", zoho_sync_at: null, saldo_yulius: 0,
  cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, created_at: "2024-01-10T15:00:00+00:00",
  origen: "LOCAL", clasificacion_detallada: null, zoho_vendor_id: null, ...o });
/** Artículos locales: proveedores con y sin vendor de Zoho, uno con paréntesis en el nombre, uno sin costo y uno sin proveedor. */
export const CAT_LOCAL = [
  loc({ sku: "LOC-VAS-001", nombre: "Vaso papel 8 oz", costo_unitario: 1.2, saldo_cedis: 300, proveedor_preferido: "Vasos SA", zoho_vendor_id: "v3", clasificacion_detallada: "Desechables" }),
  loc({ sku: "LOC-JAR-001", nombre: "Jarabe vainilla 1 L", costo_unitario: 95, saldo_cedis: 10, proveedor_preferido: "Jarabes MX", zoho_vendor_id: "v4", clasificacion_detallada: "Bebidas > Jarabes" }),
  loc({ sku: "LOC-JAR-002", nombre: "Jarabe caramelo 1 L", costo_unitario: 95, saldo_cedis: 65, proveedor_preferido: "Jarabes MX", zoho_vendor_id: "v4" }),
  loc({ sku: "LOC-POL-001", nombre: "Polvo chai 1 kg", costo_unitario: 210, saldo_cedis: 0, proveedor_preferido: "Polvos y Bases" }),
  loc({ sku: "LOC-LEC-001", nombre: "Leche deslactosada", costo_unitario: 25, saldo_cedis: 40, proveedor_preferido: "Lácteos (refrigerados)" }),
  loc({ sku: "LOC-TIS-001", nombre: "Tisana jamaica", costo_unitario: 0, saldo_cedis: 5, proveedor_preferido: "Tisanas" }),
  loc({ sku: "LOC-SIN-001", nombre: "Servilleta", costo_unitario: 0.3, saldo_cedis: 10, proveedor_preferido: null, clasificacion_detallada: "Limpieza" }),
];
export const CAT_SEM = [...CAT_IMP, ...CAT_LOCAL];
const SKUS_LOCAL = ["LOC-VAS-001", "LOC-JAR-001", "LOC-JAR-002", "LOC-POL-001", "LOC-LEC-001", "LOC-TIS-001", "LOC-SIN-001"];
/** 130 días de pedidos de artículos locales (además de los de importación y café). */
export function pedidosSem(n = 400): any[] {
  const r = rng(77), out: any[] = pedidosImp();
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 130) - 1;
    const t = Date.UTC(2026, 10, 13, 6) - dias * 864e5 + Math.floor(r() * 24) * 3600e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) {
      const sku = SKUS_LOCAL[Math.floor(r() * SKUS_LOCAL.length)];
      items.push({ sku, nombre: "x", cantidad: Math.round(r() * (sku === "LOC-VAS-001" ? 400 : 8)) });
    }
    out.push({ id: "l" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado", apertura_id: "s" + (i % 7), franquiciatario_email: "f@x.com", items, items_editados: null });
  }
  return out;
}
/** OCs locales de las últimas semanas: con monto, sin monto, un borrador de Zoho y una fuera de las 6 semanas. */
export const OC_LOCAL = [
  { id: "l1", sku: "LOC-JAR-001", folio: "COM-OC-03010", fecha: "2026-11-10", fecha_arribo: "2026-11-17", cantidad: 20, cantidad_recibida: 20, monto: 1900, proveedor: "Jarabes MX" },
  { id: "l2", sku: "LOC-JAR-002", folio: "COM-OC-03010", fecha: "2026-11-10", fecha_arribo: "2026-11-17", cantidad: 10, cantidad_recibida: 10, monto: 950, proveedor: "Jarabes MX" },
  { id: "l3", sku: "LOC-VAS-001", folio: "COM-OC-03011", fecha: "2026-10-27", fecha_arribo: "2026-11-03", cantidad: 2000, cantidad_recibida: 2000, monto: 2400, proveedor: "Vasos SA" },
  { id: "l4", sku: "LOC-LEC-001", folio: "COM-OC-03012", fecha: "2026-10-15", fecha_arribo: "2026-10-17", cantidad: 50, cantidad_recibida: 50, monto: 0, proveedor: "Lácteos (refrigerados)" },
  { id: "l5", sku: "LOC-JAR-001", folio: "COM-OC-03001", fecha: "2026-11-12", fecha_arribo: "2026-11-19", cantidad: 40, cantidad_recibida: 0, monto: 3800, proveedor: "Jarabes MX" },
  { id: "l6", sku: "LOC-POL-001", folio: "COM-OC-03013", fecha: "2026-08-01", fecha_arribo: "2026-08-20", cantidad: 5, cantidad_recibida: 5, monto: 1050, proveedor: "Polvos y Bases" },
];
export const OC_SEM = [...OC_IMP, ...OC_LOCAL];
/** Borradores de Zoho (com_zoho_oc_lineas con status 'draft'), como los lee el motor. */
export const BORR_SEM: LineaBorrador[] = [
  { po_number: "COM-OC-03001", sku: "LOC-JAR-001", vendor_name: "Jarabes MX", fecha_oc: "2026-11-12", cantidad: 40, cantidad_recibida: 0, precio: 95, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03002", sku: "LOC-VAS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-11", cantidad: 6000, cantidad_recibida: 0, precio: 1.2, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03002", sku: "LOC-TIS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-11", cantidad: 12, cantidad_recibida: 0, precio: null, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03003", sku: "MER-TAZ-001", vendor_name: "Simbs", fecha_oc: "2026-09-01", cantidad: 10, cantidad_recibida: 0, precio: 80, synced_at: "2026-11-13T15:00:00Z" },
  { po_number: "COM-OC-03004", sku: "LOC-SIN-001", vendor_name: "Proveedor USD", fecha_oc: "2026-11-13", cantidad: 500, cantidad_recibida: 100, precio: null, synced_at: "2026-11-13T16:30:00Z" },
];
/**
 * Los mismos borradores como la carga de Zoho de la configuración (cfg.zoho_oc) que leía el viejo: la paridad le da esto
 * a la app (que no conoce com_zoho_oc_lineas) y al port, para que los dos excluyan los mismos.
 */
export const ZOHO_OC_SEM = { cargado: "2026-11-13T16:30:00Z", lineas: BORR_SEM.map((l) => {
  const pend = Number(l.cantidad) - Number(l.cantidad_recibida);
  return { sku: l.sku, folio: l.po_number, prov: l.vendor_name, fecha: l.fecha_oc, pend, monto: l.precio != null ? pend * l.precio : null, borrador: true };
}) };
/** com_zoho_proveedor: mínimos y días de crédito. "Lácteos" y "Green Packaging" solo se encuentran por nombre sin paréntesis. */
export const ZPROV_SEM = [
  { vendor_id: "v1", nombre: "CAFICULTORES OMAC", minimo_compra: 40000, dias_credito: 15 },
  { vendor_id: "v2", nombre: "Tostador Local", minimo_compra: 0, dias_credito: 0 },
  { vendor_id: "v3", nombre: "Vasos SA", minimo_compra: 0, dias_credito: 30 },
  { vendor_id: "v4", nombre: "Jarabes MX", minimo_compra: 5000, dias_credito: 0 },
  { vendor_id: "v5", nombre: "POLVOS Y BASES", minimo_compra: 0, dias_credito: 7 },
  { vendor_id: "v6", nombre: "Lácteos", minimo_compra: 0, dias_credito: 45 },
  { vendor_id: "v7", nombre: "Green Packaging", minimo_compra: 0, dias_credito: 60 },
];
/** Simulación del servidor de hoy para algunos artículos locales (una compra hoy, otra en dos semanas). */
export const SRV_SEM: Servidor = { ok: true, motivo: null, calc: "2026-11-13T12:30:00Z", pagos: [], sinCosto: ["LOC-TIS-001"], sinProveedor: [],
  compras: [
    { sku: "LOC-JAR-001", fecha_oc: "2026-11-13", cantidad: 36, monto: 3420 },
    { sku: "LOC-JAR-001", fecha_oc: "2026-11-27", cantidad: 12, monto: 1140 },
    { sku: "LOC-POL-001", fecha_oc: "2026-11-15", cantidad: 6, monto: 1260 },
    { sku: "NO-EN-PLAN", fecha_oc: "2026-11-13", cantidad: 3, monto: 30 },
  ] };
/** R del Plan de abastos: Importaciones y Café más lo local. */
export function datosSem(extra: Partial<DatosPlan> = {}): DatosPlan {
  const base = datosImp();
  return { ...base, cat: CAT_SEM, pedidos: pedidosSem(), oc: OC_SEM,
    lt: [...base.lt, { sku: "LOC-VAS-001", dias: 5 }, { sku: "LOC-JAR-001", dias: 7 }, { sku: "LOC-JAR-002", dias: 7 }, { sku: "LOC-POL-001", dias: 20 }, { sku: "LOC-LEC-001", dias: 2 }],
    ocZohoBorr: BORR_SEM, zprov: ZPROV_SEM, ...extra };
}
```

Crear `supabase/functions/_shared/planProv_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad del plan local completo (plan 3f): _planBuild(R, cfg) de la app, con la simulación del servidor y la agrupación
// por proveedor, contra planLocal (planBuild del 3d + planProvs del 3e).
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { planLocal } from "./planProv.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, SRV_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_CAFE])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });
const sinHist = (provs: any[]) => provs.map(({ hist: _h, ...x }) => x);

/** La simulación de hace 40 h: servidorPlan la entrega con ok=false y su motivo. */
const VIEJA = { ...SRV_SEM, ok: false, motivo: "corrida de hace 40 h", compras: [] };
// La app solo conoce los borradores de la carga de Zoho de la configuración: se le dan los mismos que trae zoho-sync.
const CFGS: Record<string, any> = {
  defecto: { zoho_oc: ZOHO_OC_SEM },
  avisar: { zoho_oc: ZOHO_OC_SEM, compra: { min_prov: "avisar" } },
  con_cafe: { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false, prox_dias: 14 } },
  sin_seguimiento: { zoho_oc: ZOHO_OC_SEM, compra: { bt_semanas: 0, semanas: 8 }, seg: { dias: 20 } },
};

Deno.test({ name: "paridad: planLocal = _planBuild(R, cfg) con provs, mínimos y la simulación (vigente, vieja o ninguna)", ignore: SIN_APP }, () => {
  let n = 0, servidor = 0, adelantos = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const [ns, srv] of [["local", null], ["srv", SRV_SEM], ["vieja", VIEJA]] as [string, any][]) {
      const R = datosSem({ srv });
      const a = A._planBuild(paraApp(R), A._planCfgNormalizar(c0)), s = planLocal(R, normalizarCfgMotor(c0));
      const k = `${nom}/${ns}`;
      assertEquals(s.rows, a.rows, k + " rows");
      assertEquals(sinHist(s.provs), sinHist(a.provs), k + " provs");
      assertEquals([s.minManual, s.vendorDe], [a.minManual, a.vendorDe], k + " mínimos");
      assertEquals([s.fuenteCant, s.srvSinPlan, s.srvSinDatos, s.W, s.semIni, s.P], [a.fuenteCant, a.srvSinPlan, a.srvSinDatos, a.W, a.semIni, a.P], k + " calendario");
      assertEquals(s.bt, a.bt, k + " seguimiento");
      if (s.fuenteCant === "servidor") servidor++;
      adelantos += s.provs.reduce((t, p) => t + p.adelantados, 0);
      n++;
    }
  }
  assertEquals(n, 12);
  assertEquals(servidor, 4, "la simulación vigente se usa en las cuatro configuraciones");
  assert(adelantos > 0, "ningún caso consolidó por mínimo");
});

Deno.test("planLocal: con la simulación vigente las cantidades salen del servidor; vieja o ausente, del cálculo local", () => {
  const cfg = normalizarCfgMotor({});
  const srv = planLocal(datosSem({ srv: SRV_SEM }), cfg);
  const jar = srv.rows.find((r) => r.sku === "LOC-JAR-001");
  assertEquals([srv.fuenteCant, jar.calc.fuente, jar.calc.pedirHoy, jar.sem[0], jar.sem[2]], ["servidor", "servidor", 36, 36, 12]);
  assertEquals(srv.srvSinPlan, 1); // NO-EN-PLAN no está en el catálogo
  assertEquals(srv.W, 12);
  for (const s of [null, VIEJA]) {
    const c = planLocal(datosSem({ srv: s as any }), cfg);
    assertEquals(c.fuenteCant, "local");
    assert(c.rows.every((r) => r.calc.fuente !== "servidor"));
  }
});

Deno.test("planLocal: el café queda fuera del plan local y cada proveedor toma su vendor de Zoho (o el de mismo nombre)", () => {
  const c = planLocal(datosSem(), normalizarCfgMotor({}));
  assert(c.rows.every((r) => !r.esCafe));
  assertEquals(c.vendorDe["jarabes mx"], "v4");
  assertEquals(c.minManual["jarabes mx"], 5000);
  assertEquals(c.vendorDe["polvos y bases"], "v5"); // sin zoho_vendor_id: por nombre
  assertEquals(c.vendorDe["lácteos (refrigerados)"], undefined); // el nombre de Zoho no trae el paréntesis
  assert(c.provs.some((p) => p.key === "__sin__" && !p.real));
});
```

Crear `tests/portal/com-plan-abastos-motor.test.ts`:

```ts
// Plan 3f: el plan local completo sobre el motor (con la simulación del servidor) y las columnas nuevas que lee la carga.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import { limpiarMotor, motorPlan, planLocalMotor, type MotorListo } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import {
  BORR_SEM,
  datosSem,
  SRV_SEM,
  ZPROV_SEM,
} from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const listo = (R = datosSem(), cfg: Record<string, unknown> = {}): MotorListo => ({
  ok: true,
  R,
  cfg: normalizarCfgMotor(cfg),
  version: 1,
});

describe('plan local del motor (Plan de abastos y Esta semana)', () => {
  beforeEach(() => limpiarMotor());

  it('usa la simulación del servidor si está vigente, y calcula una sola vez por datos + configuración', () => {
    const mt = listo(datosSem({ srv: SRV_SEM }));
    const c = planLocalMotor(mt);
    expect(planLocalMotor(mt)).toBe(c);
    expect(c.fuenteCant).toBe('servidor');
    expect(c.rows.find((r) => r.sku === 'LOC-JAR-001')?.calc.pedirHoy).toBe(36);
    expect(c.vendorDe['jarabes mx']).toBe('v4');
  });

  it('con la simulación vieja (ok=false) se queda con el cálculo local', () => {
    const c = planLocalMotor(
      listo(datosSem({ srv: { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h' } })),
    );
    expect(c.fuenteCant).toBe('local');
  });
});

describe('lo que lee la carga para el plan 3f', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
    limpiarMotor();
    m.puente = dbFalsa({
      com_legado_pedidos: [],
      com_legado_aperturas: [],
      com_legado_pedidos_apertura: [],
    }).db;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('pide la clasificación del catálogo, la fecha de sincronización de los borradores y los días de crédito', async () => {
    const columnas: Record<string, string[]> = {};
    const { db } = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 2 }],
      com_catalogo: [{ sku: 'LOC-JAR-001', nombre: 'Jarabe', estatus: 'Compra Recurrente' }],
      com_zoho_proveedor: ZPROV_SEM,
      com_zoho_oc_lineas: BORR_SEM.map((l) => ({ ...l, zoho_po_id: l.po_number, status: 'draft' })),
    });
    const espia = {
      ...db,
      from: (t: string) => {
        const q = db.from(t);
        const sel = q.select;
        q.select = (c?: string) => ((columnas[t] ??= []).push(c ?? ''), sel(c));
        return q;
      },
    };
    const r = await motorPlan(espia, new Date('2026-11-13T18:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    expect(columnas.com_catalogo[0]).toContain('clasificacion_detallada');
    expect(columnas.com_zoho_oc_lineas[0]).toContain('synced_at');
    expect(columnas.com_zoho_proveedor[0]).toBe('vendor_id,nombre,minimo_compra,dias_credito');
    expect(r.R.zprov?.find((z) => z.vendor_id === 'v3')?.dias_credito).toBe(30);
    expect(r.R.ocZohoBorr).toHaveLength(BORR_SEM.length);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planProv_parity_test.ts`
Expected: FAIL de tipos: `planLocal` no existe en `planProv.ts` y `synced_at` no existe en `LineaBorrador` (`fixturesSem.ts`).

Run: `npx vitest run tests/portal/com-plan-abastos-motor.test.ts`
Expected: FAIL. `planLocalMotor is not a function`.

- [ ] **Step 3: Implementación**

En `supabase/functions/_shared/planDatos.ts`, reemplazar la línea de `LineaBorrador` por:

```ts
export interface LineaBorrador { po_number: string; sku: string; vendor_name: string | null; fecha_oc: string | null; cantidad: number | null; cantidad_recibida: number | null; precio: number | null; synced_at?: string | null }
```

agregar después de `borradoresPlan` (antes de `planOcDeZoho`):

```ts
/**
 * Folios en borrador (_zocBorradorFolios 38541, para las compras ya emitidas del Plan de abastos) con la misma regla de la
 * decisión 6 del 3d: los de la configuración más los `draft` de zoho-sync.
 */
export function borradorFoliosPlan(R: { ocZohoBorr?: LineaBorrador[] | null }, cfg: any): Record<string, 1> | null {
  var s: Record<string, 1> = {}, n = 0, f = zocFuenteBorr(cfg);
  if (f) f.ls.forEach(function (l: any) { if (l.borrador) { var k = zocKey(l.folio); if (k) { s[k] = 1; n++; } } });
  (R.ocZohoBorr || []).forEach(function (l) { var k = zocKey(l.po_number); if (k) { s[k] = 1; n++; } });
  return n ? s : null;
}
```

y, en `DatosPlan`, reemplazar el comentario y el tipo de `zprov` por:

```ts
  /**
   * Proveedores de Zoho (com_zoho_proveedor): el mínimo lo usa la agrupación por proveedor (plan 3e) y los días de crédito,
   * el viernes de pago de Esta semana (plan 3f).
   */
  zprov?: { vendor_id: any; nombre: string | null; minimo_compra: number | null; dias_credito?: number | null }[] | null;
```

En `supabase/functions/_shared/planProv.ts`, cambiar la cabecera (hasta los imports) por:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la agrupación por proveedor del Plan de abasto del sitio viejo (app/index.html a9e4a22): el mínimo de
// Zoho de cada grupo (_minVendorDeGrupo 27586 y el bloque de _planBuild 33413–33416), _planConsolidar (32957) y
// _planAgruparProv (33529) sin el historial de 60 días (`hist`: solo lo pinta el panel de proveedores de "Todo lo demás",
// que no se porta). Lo usan el "Qué pedir" de Café (plan 3e) y el plan local completo del Plan de abastos y Esta semana
// (planLocal, plan 3f). planCafe_parity_test.ts y planProv_parity_test.ts comparan contra la app.
import type { DatosPlan } from "./planDatos.ts";
import { type Plan, planBuild } from "./planBuild.ts";
```

y agregar al final:

```ts
/** Plan con sus proveedores (c.provs, c.minManual y c.vendorDe de _planBuild). */
export type PlanProv = Plan & { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> };

/**
 * _planBuild(R, cfg) completo para el plan local (plan 3f): el armado del 3d, con la simulación del servidor si está
 * vigente (planAplicarServidor), más la agrupación por proveedor con sus mínimos, que puede adelantar pedidos.
 */
export function planLocal(R: DatosPlan, cfg: any): PlanProv {
  var c = planBuild(R, cfg) as PlanProv;
  var pv = planProvs(c, R);
  c.provs = pv.provs; c.minManual = pv.minManual; c.vendorDe = pv.vendorDe;
  return c;
}
```

En `lib/comercializadora/motor.ts`:
- después del import de `planCafe.ts`:

  ```ts
  import { planLocal, type PlanProv } from '../../supabase/functions/_shared/planProv.ts';
  ```

- `CATALOGO` termina en `clasificacion_detallada` (la usa "Dónde se va el dinero"):

  ```ts
  const CATALOGO =
    'sku,nombre,estatus,categoria,costo_unitario,saldo_cedis,saldo_yulius,zoho_stock,zoho_stock_fisico,zoho_sync_at,' +
    'zoho_actualizado,cantidad_por_apertura,minimo_compra_pzas,multiplo_compra,dias_seguridad,created_at,' +
    'proveedor_preferido,origen,zoho_vendor_id,clasificacion_detallada';
  ```

- la lectura de borradores (`com_zoho_oc_lineas`) pide `synced_at`:

  ```ts
          'zoho_po_id,po_number,sku,vendor_name,fecha_oc,cantidad,cantidad_recibida,precio,synced_at',
  ```

- la lectura opcional de `com_zoho_proveedor` queda así:

  ```ts
      // Plan 3e: mínimos de proveedor de Zoho para la agrupación por proveedor (Qué pedir de café), como R.zprov del viejo.
      // Plan 3f: también los días de crédito, para el viernes de pago de Esta semana.
      opcional(
        leerTodoCom<{
          vendor_id: string;
          nombre: string | null;
          minimo_compra: number | null;
          dias_credito: number | null;
        }>(db, 'com_zoho_proveedor', 'vendor_id,nombre,minimo_compra,dias_credito', 'vendor_id'),
      ),
  ```

- y al final:

  ```ts
  /**
   * Plan local completo (plan 3f, Plan de abastos y Esta semana): con la simulación del servidor si está vigente (≤ 36 h y
   * completa) y agrupado por proveedor. A diferencia de DOH e Indicadores (decisión 5 del 3d), no usa planSinSrv.
   */
  export const planLocalMotor = (m: MotorListo): PlanProv =>
    memoMotor(m, 'plan-local', () => planLocal(m.R, m.cfg));
  ```

- [ ] **Step 4: Correr y ver que pasan**

Run: los dos comandos del Step 2.
Expected:
- Deno: 3 passed (con `COM_APP_VIEJA`).
- Vitest: 3 passed.
- `COM_APP_VIEJA=… npm run test:funciones`: 277 passed, 0 ignored. Las 274 de antes siguen pasando con el cambio de `fuente`.
- `npm run test:funciones` sin la variable: 251 passed + 26 ignored.
- `npm run typecheck` limpio.

Si la paridad falla, la diferencia es del port: no se ajusta la prueba. La app solo conoce los borradores de `cfg.zoho_oc`; por eso las configuraciones de la paridad llevan `ZOHO_OC_SEM`, que son los mismos borradores de `BORR_SEM`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/pruebas/appVieja.ts supabase/functions/_shared/pruebas/fixturesSem.ts supabase/functions/_shared/planDatos.ts supabase/functions/_shared/planProv.ts supabase/functions/_shared/planProv_parity_test.ts lib/comercializadora/motor.ts tests/portal/com-plan-abastos-motor.test.ts
git commit -m "feat(comercializadora): plan local completo con la simulación del servidor, con paridad"
```

---

### Task 2: Plan de abastos por categoría (`planSem.ts`) con paridad

**Files:**
- Create: `supabase/functions/_shared/planSem.ts`
- Test: `supabase/functions/_shared/planSem_parity_test.ts`

**Interfaces:**
- Consumes:
  - `planLocal`, `PlanProv` (Tarea 1); `borradorFoliosPlan`, `zocKey`, `DatosPlan` (planDatos);
  - `planEsCafe` (planBuild); `planEngDia`, `planEngDifDias` (planEngine);
  - `cfgConImp`, `impDif`, `CorridaImp` (planImp, 3e);
  - en la prueba, `cafeOrdenes` (planCafe) e `impCorrer` (planImp).
- Produces (los usan las Tareas 3 a 9):
  - tipos: `type CatId = 'local' | 'cafe' | 'imp'`, `interface CatDef`, `PSEM_CATS: CatDef[]`, `type Inc = Record<CatId, boolean>`;
  - `interface GrupoSem { key; pk; cat; fuente: '' | 'cafe' | 'imp'; nombre; real; rows; monto: number[]; n: number[]; uds: number[]; sinCosto: number[]; minimo; total? }`;
  - `interface CatSem { def; provs; monto; n; sinCosto; err; aviso; rot; arts }` e `interface Sem { cat: Record<CatId, CatSem>; provs: GrupoSem[]; tot }`;
  - `psemZ(n)`, `psemSum(a, i, j)` y `planSemW(c, sem): number`;
  - los grupos: `psemGrupos(plan, catId, fuente, c, W): GrupoSem[]` y `psemGruposImp(c, W, ic) → { provs; err; urg?; sinPlan? }`;
  - `psemImpSet(c, R)`, `interface Pasadas { local; cafe; imp; ini; sinMonto; np }` y `psemPasadas(c, R): Pasadas`;
  - `interface FuentesSem { cafe: () => PlanProv | null; imp: () => CorridaImp | null }` y `planSemCalc(c, inc, Wv, f): Sem`;
  - `psemFamDe(sku, nombre, det, cat): string` y `psemHoyMonto(provs): number`.

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/planSem_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad del Plan de abastos: _planSemCalc (con _psemGrupos, _psemGruposImp y las categorías), _psemPasadas, _psemFamDe y
// _psemHoyMonto de la app contra planSem.ts, con el plan local, el de café y la corrida de Importaciones de cada lado.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { planLocal } from "./planProv.ts";
import { cafeOrdenes } from "./planCafe.ts";
import { impCorrer } from "./planImp.ts";
import { type Inc, planSemCalc, planSemW, psemFamDe, psemHoyMonto, psemPasadas } from "./planSem.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, NOMBRES_SEM, SRV_SEM, STUBS_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP, ...NOMBRES_CAFE, ...NOMBRES_SEM])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP + "\n" + STUBS_SEM, HOY_IMP);
const g = globalThis as any;
let carga = 7000;

/** Pone los globales de la app (datos, plan local, plan de café) y devuelve su configuración normalizada. */
function prepararApp(R: DatosPlan, c0: any, cafeErr?: string) {
  const cfgA = A._planCfgNormalizar(c0), Ra = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__R = Ra;
  g.__UI = { esc: "" };
  g.__C = A._planBuild(Ra, cfgA);
  g.__CC = A._planBuild(Ra, cfgA, { cafe: true });
  g.__CC_ERR = cafeErr;
  return cfgA;
}
const fuentes = (R: DatosPlan, cfg: any, cafeErr?: string) => ({
  cafe: () => { if (cafeErr) throw new Error(cafeErr); return cafeOrdenes(R, cfg); },
  imp: () => impCorrer(R, cfg),
});

// Todas con la carga de borradores de la configuración (la app no conoce com_zoho_oc_lineas; ver planProv_parity_test).
const CFGS: Record<string, any> = {
  defecto: { zoho_oc: ZOHO_OC_SEM },
  con_cafe: { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false } },
  semanas_8: { zoho_oc: ZOHO_OC_SEM, compra: { semanas: 8, prox_dias: 10 } },
  imp_vacio: { zoho_oc: ZOHO_OC_SEM, imp: { orden: [], items: {} } },
};
const INCS: Inc[] = [
  { local: true, cafe: true, imp: true }, { local: true, cafe: false, imp: true }, { local: false, cafe: false, imp: false },
];

Deno.test({ name: "paridad: planSemCalc = _planSemCalc (4 configuraciones × con/sin servidor × 3 inclusiones × 4/8/12 semanas)", ignore: SIN_APP }, () => {
  let n = 0, conImp = 0, conCafe = 0, errImp = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV_SEM]) {
      const R = datosSem({ srv: srv as any });
      prepararApp(R, c0);
      const cfg = normalizarCfgMotor(c0), c = planLocal(R, cfg);
      for (const inc of INCS) {
        for (const sem of [4, 8, 12]) {
          A._planSemUI.inc = { ...inc };
          A._planSemUI.sem = sem;
          const Wv = planSemW(c, sem);
          assertEquals(Wv, A._planSemW(), `${nom} Wv`);
          const a = A._planSemCalc(), s = planSemCalc(c, inc, Wv, fuentes(R, cfg));
          const k = `${nom}/${srv ? "srv" : "local"}/${JSON.stringify(inc)}/${sem}`;
          for (const id of ["local", "cafe", "imp"] as const) assertEquals(s.cat[id], a.cat[id], `${k} ${id}`);
          assertEquals(s.provs, a.provs, k + " provs");
          assertEquals(s.tot, a.tot, k + " tot");
          assertEquals(psemHoyMonto(s.provs), A._psemHoyMonto(a.provs), k + " hoy");
          if (s.cat.imp.provs.length) conImp++;
          if (s.cat.cafe.provs.length) conCafe++;
          if (s.cat.imp.err) errImp++;
          n++;
        }
      }
    }
  }
  assertEquals(n, 72);
  assert(conImp > 0 && conCafe > 0 && errImp > 0, "faltan casos con importaciones, café o error de importaciones");
});

Deno.test({ name: "paridad: si el café falla, su error queda en la categoría y lo demás se calcula igual", ignore: SIN_APP }, () => {
  const R = datosSem(), c0 = { zoho_oc: ZOHO_OC_SEM }, cfg = normalizarCfgMotor(c0);
  prepararApp(R, c0, "sin datos de café");
  A._planSemUI.inc = { local: true, cafe: true, imp: true };
  A._planSemUI.sem = 12;
  const a = A._planSemCalc(), s = planSemCalc(planLocal(R, cfg), { local: true, cafe: true, imp: true }, 12, fuentes(R, cfg, "sin datos de café"));
  assertEquals(s.cat, a.cat);
  assertEquals([s.cat.cafe.err, s.cat.cafe.provs.length, s.cat.cafe.rot], ["sin datos de café", 0, 0]);
});

Deno.test({ name: "paridad: psemPasadas = _psemPasadas (borradores fuera, por categoría, sin monto aparte)", ignore: SIN_APP }, () => {
  for (const [nom, c0] of Object.entries(CFGS)) {
    const R = datosSem();
    prepararApp(R, c0);
    const s = psemPasadas(planLocal(R, normalizarCfgMotor(c0)), R), a = A._psemPasadas(g.__C);
    assertEquals(s, a, nom);
  }
});

Deno.test({ name: "paridad: psemFamDe = _psemFamDe", ignore: SIN_APP }, () => {
  const casos: [string, string, string | null, string][] = [
    ["INS-DES-021", "VASO KRAFT", null, "local"], ["X", "Jarabe de vainilla", "Bebidas > Jarabes", "local"], ["X", "Té earl grey", "", "local"],
    ["X", "Fuze tea 600 ml", null, "local"], ["X", "Polvo para frappé", "Barra", "local"], ["X", "Leche deslactosada", "Bebidas", "local"],
    ["X", "Cloro", "Limpieza", "local"], ["INS-CAF-001", "Café", null, "local"], ["X", "Lo que sea", null, "cafe"], ["X", "Servilleta", "Bebidas", "local"],
    ["X", "Tisana de jamaica", "Bebidas", "local"], ["X", "Chocolate abuelita", null, "imp"], ["X", "Termo", "Mercancía", "imp"], ["", "", null, "local"],
    ["X", "Café molido", "Café", "local"], ["INS-DEL-002", "Bolsa", "Desechables", "local"],
  ];
  for (const [sku, nom, det, cat] of casos) assertEquals(psemFamDe(sku, nom, det, cat), A._psemFamDe(sku, nom, det, cat), nom);
});

Deno.test("planSemCalc: tres categorías con su dinero; lo no incluido no suma al total; Importaciones vacía avisa", () => {
  const R = datosSem(), cfg = normalizarCfgMotor({}), c = planLocal(R, cfg);
  const todo = planSemCalc(c, { local: true, cafe: true, imp: true }, 12, fuentes(R, cfg));
  const sinImp = planSemCalc(c, { local: true, cafe: true, imp: false }, 12, fuentes(R, cfg));
  const sumaCat = (id: "local" | "cafe" | "imp") => todo.cat[id].monto.reduce((a, b) => a + b, 0);
  const sumaTot = (S: typeof todo) => S.tot.monto.reduce((a, b) => a + b, 0);
  assert(sumaCat("local") > 0 && sumaCat("cafe") > 0 && sumaCat("imp") > 0);
  assertEquals(Math.round(sumaTot(todo) - sumaTot(sinImp)), Math.round(sumaCat("imp")));
  assert(sinImp.provs.every((p) => p.cat !== "imp"));
  const vacio = normalizarCfgMotor({ imp: { orden: [], items: {} } });
  const S = planSemCalc(planLocal(R, vacio), { local: true, cafe: true, imp: true }, 12, fuentes(R, vacio));
  assertEquals([S.cat.imp.err, S.cat.imp.provs.length], ["No hay artículos activos en el plan de importaciones.", 0]);
  assert(S.cat.local.provs.length > 0);
});

Deno.test("psemPasadas: un borrador de zoho-sync no es una compra emitida aunque la configuración no lo tenga", () => {
  const R = datosSem(), c = planLocal(R, normalizarCfgMotor({}));
  const con = psemPasadas(c, R), sin = psemPasadas(c, { ...R, ocZohoBorr: [] });
  // COM-OC-03001 (3,800 del 12-nov) es borrador en zoho-sync: solo cuenta si no se sabe que es borrador.
  assertEquals(Math.round(sin.local[0] - con.local[0]), 3800);
  assertEquals(con.sinMonto, 1); // COM-OC-03012 sin monto
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planSem_parity_test.ts`
Expected: FAIL. `Module not found ".../planSem.ts"`.

- [ ] **Step 3: El port**

Crear `supabase/functions/_shared/planSem.ts`. Es 39807–39934 (`_PSEM_CATS` a `_planSemCalc`), `_psemFamDe` 40002, `_psemHoyMonto` 40035 y `_planSemW` 35035, línea por línea. Cambios que no mueven números:
- en `planSemCalc` no se toca el filtro de proveedor de la pantalla (el viejo limpiaba `_planSemUI.prov`);
- `psemGruposImp` recibe la corrida en lugar de llamar `_impCorrer(c.cfg)` y lee la lista del plan de `ic.cfg.imp` (la `c.cfg.imp` normalizada del viejo; en el portal `c.cfg.imp` no se normaliza, decisión 8 del 3e);
- `psemPasadas` excluye también los borradores de zoho-sync (decisión 3).

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del Plan de abastos del sitio viejo (app/index.html a9e4a22, bloque "TODAS las compras … por categoría",
// 39802–40063, que sustituye al de la PARTE E): las tres categorías (_PSEM_CATS), los grupos por proveedor de lo local y el
// café (_psemGrupos) y de Importaciones (_psemGruposImp), las compras ya emitidas (_psemPasadas, _psemImpSet), los totales
// (_planSemCalc), la familia de cada artículo (_psemFamDe) y lo que ordena hoy la simulación (_psemHoyMonto), más
// _planSemW (35035) y _psemSum. Sin globales: el plan local, el de café y la corrida de Importaciones se reciben.
// planSem_parity_test.ts compara contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { borradorFoliosPlan, type DatosPlan, zocKey } from "./planDatos.ts";
import { planEsCafe } from "./planBuild.ts";
import { cfgConImp, type CorridaImp, impDif } from "./planImp.ts";
import type { PlanProv } from "./planProv.ts";

export type CatId = "local" | "cafe" | "imp";
export interface CatDef { id: CatId; nombre: string; sub: string; color: string }
export const PSEM_CATS: CatDef[] = [
  { id: "local", nombre: "Todo lo demás", sub: "compras locales", color: "#374151" },
  { id: "cafe", nombre: "Café", sub: "café tostado", color: "#92400E" },
  { id: "imp", nombre: "Importaciones", sub: "exterior, por contenedor", color: "#7C3AED" },
];
/** Qué categorías entran al dinero a disponer (_psemUI().inc). */
export type Inc = Record<CatId, boolean>;

/** Grupo de un proveedor en una categoría, con piezas y dinero por semana. */
export interface GrupoSem {
  key: string; pk: string; cat: CatId; fuente: "" | "cafe" | "imp"; nombre: string; real: boolean; rows: any[];
  monto: number[]; n: number[]; uds: number[]; sinCosto: number[]; minimo: number; total?: number;
}
export interface CatSem { def: CatDef; provs: GrupoSem[]; monto: number[]; n: number[]; sinCosto: number[]; err: string; aviso: string; rot: number; arts: number }
export interface Sem { cat: Record<CatId, CatSem>; provs: GrupoSem[]; tot: { monto: number[]; n: number[]; sinCosto: number[] } }

export function psemZ(n: number): number[] { return new Array(n).fill(0); }
export function psemSum(a: number[], i: number, j: number): number { var t = 0; for (var x = i; x < j; x++) t += a[x] || 0; return t; }
/** Semanas que se ven: las elegidas (4/8/12) si caben en el plan; si no, hasta 12 (_planSemW con _planSemUI.sem). */
export function planSemW(c: { W: number } | null, sem: number): number { if (!c) return 0; var v = sem; return v > 0 && v <= c.W ? v : Math.min(c.W, 12); }

// ── Datos por categoría ──
// Local y café: el plan (filas con piezas por semana × costo) agrupado por proveedor.
// El café se cuenta solo en su categoría: con compra.excluir_cafe=false el plan local también trae sus filas.
export function psemGrupos(plan: { rows: any[] } | null, catId: CatId, fuente: "" | "cafe", c: { minManual: Record<string, number> }, W: number): GrupoSem[] {
  var map: Record<string, GrupoSem> = {}, provs: GrupoSem[] = [];
  (plan && plan.rows || []).forEach(function (r) {
    if (r.sinMov || r.importacion || (catId === "local" && r.esCafe)) return;
    var key = catId + "|" + r.provKey, g = map[key];
    if (!g) { g = map[key] = { key: key, pk: r.provKey, cat: catId, fuente: fuente, nombre: r.provNombre, real: r.provKey !== "__sin__", rows: [], monto: psemZ(W), n: psemZ(W), uds: psemZ(W), sinCosto: psemZ(W), minimo: c.minManual[r.provKey] || 0 }; provs.push(g); }
    g.rows.push(r);
    for (var k = 0; k < W; k++) { var q = r.sem[k]; if (q > 0) { g.n[k]++; g.uds[k] += q; if (r.costo > 0) g.monto[k] += q * r.costo; else g.sinCosto[k]++; } }
  });
  return provs;
}
// Importaciones: primer pedido de cada producto (en su semana) y los contenedores del proveedor de contenedores (plan de embarques).
// `ic` es la corrida de Importaciones (el viejo llamaba _impCorrer(c.cfg)); la lista de artículos del plan sale de su
// configuración normalizada (ic.cfg.imp), que es la c.cfg.imp del viejo.
export function psemGruposImp(c: PlanProv, W: number, ic: CorridaImp | null): { provs: GrupoSem[]; err: string; urg?: number; sinPlan?: number } {
  if (!ic) return { provs: [], err: "Todavía no hay datos de importaciones." };
  if (!ic.S) return { provs: [], err: ic.err || "No se pudo calcular el plan de importaciones." };
  var S = ic.S, items = ic.ent.items, P = c.P, hoy = c.hoyIso, gp = ic.ent.P.constantes.proveedorContenedor, prov: Record<string, any> = {};
  ic.cfg.imp.prov.forEach(function (p: any) { prov[p.clave] = p; });
  var map: Record<string, GrupoSem> = {}, provs: GrupoSem[] = [], urg = 0;
  var gr = function (clave: string) {
    var key = "imp|" + clave, g = map[key];
    if (!g) { var pv = prov[clave]; g = map[key] = { key: key, pk: clave, cat: "imp", fuente: "imp", nombre: pv ? pv.nombre : clave, real: true, rows: [], monto: psemZ(W), n: psemZ(W), uds: psemZ(W), sinCosto: psemZ(W), minimo: 0 }; provs.push(g); }
    return g;
  };
  var sem = function (iso: any) { var d = impDif(hoy, iso); if (d === null) return -1; if (d < 0) d = 0; var k = Math.floor(d / P); return k < W ? k : -1; };
  S.productos.forEach(function (p: any, i: number) {
    var it = items[i], q = p.quiebre;
    if (/^URGENTE/.test(q.estado)) urg++;
    if (!it || it.proveedor === gp) return; // los del proveedor de contenedores se toman del plan de contenedores
    if (!(q.cantidadPedir > 0 && q.colocarPedido)) return;
    var k = sem(q.colocarPedido); if (k < 0) return;
    var g = gr(it.proveedor), row: any = { sku: it.sku, nombre: q.producto, provKey: it.proveedor, provNombre: g.nombre, costo: it.costoUnitario, sem: psemZ(W), s: { lt: q.leadTime }, fechaLimite: q.colocarPedido, llega: q.llegaCedis, imp: true, unidad: q.unidad, ventaMes: q.ventaMes3, calc: {} };
    row.sem[k] = q.cantidadPedir; row.ctx = (function () { var cons = isFinite(q.ventaMes3) && q.ventaMes3 > 0 ? q.ventaMes3 / 30 : 0, aft = Math.max(0, q.stockAlLlegar || 0) + Math.max(0, q.llegadasCobertura || 0) + q.cantidadPedir; return { tienes: q.stockHoy, enOC: q.yaComprado || 0, consumo: cons, diasHoy: cons > 0 ? Math.max(0, q.stockHoy) / cons : null, quedas: aft, diasQuedas: cons > 0 ? aft / cons : null }; })(); row.urg = /^(URGENTE|PEDIR YA)/.test(q.estado || ""); row.m = psemZ(W); g.rows.push(row); g.n[k]++; g.uds[k] += q.cantidadPedir;
    if (it.costoUnitario > 0) { var mm = q.inversion || q.cantidadPedir * it.costoUnitario; g.monto[k] += mm; row.m[k] = mm; } else g.sinCosto[k]++;
  });
  ((S.plan && S.plan.contenedores) || []).forEach(function (ct: any) {
    if (!(ct.inversion > 0) || !ct.colocar || !(ct.cbm > 0) || /^Fuera del horizonte/.test(ct.estado || "")) return;
    var k = sem(ct.colocar); if (k < 0) return;
    var g = gr(gp), row: any = { sku: "CONT-" + ct.n, nombre: "Contenedor " + ct.n + " (" + nf0(ct.cbm) + " CBM)", provKey: gp, provNombre: g.nombre, costo: ct.inversion, sem: psemZ(W), s: { lt: (prov[gp] && (prov[gp].lead + (prov[gp].cierres || 0))) || 0 }, fechaLimite: ct.colocar, llega: ct.llega, imp: true, contenedor: true, unidad: "contenedor", calc: {} };
    row.sem[k] = 1; row.urg = /^PEDIR YA/.test(ct.estado || ""); row.m = psemZ(W); row.m[k] = ct.inversion; g.rows.push(row); g.n[k]++; g.uds[k]++; g.monto[k] += ct.inversion;
  });
  // Artículos de importación del plan local que todavía no están en el plan de Importaciones (no se les calculó compra)
  var enModulo: Record<string, 1> = {}; (ic.cfg.imp.orden || []).forEach(function (s: string) { enModulo[s] = 1; });
  var sinPlan = c.rows.filter(function (r) { return !r.sinMov && r.importacion && !enModulo[r.sku]; }).length;
  return { provs: provs, err: "", urg: urg, sinPlan: sinPlan };
}
// _planN(x, 0) del viejo (es-MX, sin decimales) para el nombre del contenedor.
var NF0 = new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: 0 });
function nf0(x: any): string { return NF0.format(Number(x)); }

/** Artículos de importación: los del plan local, los del plan de Importaciones y los IMPORTADO del catálogo. */
export function psemImpSet(c: PlanProv, R: DatosPlan | null): Record<string, 1> {
  var s: Record<string, 1> = {}, ci = cfgConImp(c.cfg).imp;
  (c.rows || []).forEach(function (r) { if (r.importacion) s[r.sku] = 1; });
  ((ci && ci.orden) || []).forEach(function (k: string) { s[k] = 1; });
  if (R) R.cat.forEach(function (r) { if (String(r.origen || "").toUpperCase() === "IMPORTADO") s[r.sku] = 1; });
  return s;
}
export interface Pasadas { local: number[]; cafe: number[]; imp: number[]; ini: string[]; sinMonto: number; np: number }
// Compras ya emitidas (OCs con monto) de las últimas 6 semanas, separadas por categoría según los artículos de cada OC.
// Un folio en borrador (de la carga de Zoho o de zoho-sync, decisión 6 del 3d) todavía no es una compra.
export function psemPasadas(c: PlanProv, R: DatosPlan | null): Pasadas {
  var np = 6, P = c.P, out: Pasadas = { local: psemZ(np), cafe: psemZ(np), imp: psemZ(np), ini: [], sinMonto: 0, np: np };
  for (var j = 0; j < np; j++) out.ini.push(planEngDia(c.hoyIso, -(P * (j + 1) - 1)));
  if (!R || !R.oc) return out;
  var cat: Record<string, any> = {}; R.cat.forEach(function (r) { cat[r.sku] = r; });
  var impSet = psemImpSet(c, R), folios: Record<string, any> = {}, bor = borradorFoliosPlan(R, c.cfg);
  R.oc.forEach(function (r: any) {
    if (!r.folio || !r.fecha) return;
    if (bor && bor[zocKey(r.folio)]) return; // OC en borrador en Zoho: todavía no es una compra
    var f = folios[r.folio] || (folios[r.folio] = { fecha: String(r.fecha).slice(0, 10), monto: 0, imp: false, cafe: false });
    f.monto += Number(r.monto || 0);
    if (impSet[r.sku]) f.imp = true; else { var cr = cat[r.sku]; if (cr && planEsCafe(cr)) f.cafe = true; }
  });
  Object.keys(folios).forEach(function (fo) {
    var f = folios[fo], d = planEngDifDias(c.hoyIso, f.fecha);
    if (d < 0 || d >= P * np) return;
    if (!(f.monto > 0)) { out.sinMonto++; return; }
    (out as any)[f.imp ? "imp" : f.cafe ? "cafe" : "local"][Math.floor(d / P)] += f.monto;
  });
  return out;
}

/** Fuentes de las otras dos categorías: el plan de café y la corrida de Importaciones (pueden lanzar o venir vacías). */
export interface FuentesSem { cafe: () => PlanProv | null; imp: () => CorridaImp | null }

// Totales por categoría, por proveedor y por semana (el filtro de proveedor de la pantalla no se toca aquí).
export function planSemCalc(c: PlanProv, inc: Inc, Wv: number, f: FuentesSem): Sem {
  var W = c.W, cat = {} as Record<CatId, CatSem>, k: number, cc: PlanProv | null = null;
  PSEM_CATS.forEach(function (d) { cat[d.id] = { def: d, provs: [], monto: psemZ(W), n: psemZ(W), sinCosto: psemZ(W), err: "", aviso: "", rot: 0, arts: 0 }; });
  cat.local.provs = psemGrupos(c, "local", "", c, W);
  try { cc = f.cafe(); if (cc) cat.cafe.provs = psemGrupos(cc, "cafe", "cafe", c, W); } catch (e: any) { cat.cafe.err = e && e.message || String(e); }
  try { var gi = psemGruposImp(c, W, f.imp()); cat.imp.provs = gi.provs; cat.imp.err = gi.err || ""; cat.imp.rot = gi.urg || 0; if (gi.sinPlan) cat.imp.aviso = gi.sinPlan + " artículo" + (gi.sinPlan === 1 ? "" : "s") + " de importación del catálogo no está" + (gi.sinPlan === 1 ? "" : "n") + " en el plan de Importaciones (agrégalos en Importaciones > Parámetros): su compra no está contada aquí."; } catch (e: any) { cat.imp.err = e && e.message || String(e); }
  PSEM_CATS.forEach(function (d) {
    var C = cat[d.id], skus: Record<string, 1> = {};
    C.provs.forEach(function (g) {
      for (k = 0; k < W; k++) { C.monto[k] += g.monto[k]; C.n[k] += g.n[k]; C.sinCosto[k] += g.sinCosto[k]; }
      g.total = 0; for (k = 0; k < Wv; k++) g.total += g.monto[k];
      g.rows.forEach(function (r) { if (r.sem.slice(0, Wv).some(function (x: number) { return x > 0; })) skus[r.sku] = 1; });
    });
    C.provs.sort(function (a, b) { return (b.total as number) - (a.total as number) || a.nombre.localeCompare(b.nombre); });
    C.arts = Object.keys(skus).length;
    if (d.id !== "imp") {
      var plan = d.id === "local" ? c : cc;
      C.rot = plan ? plan.rows.filter(function (r) { return !r.sinMov && !r.importacion && !(d.id === "local" && r.esCafe) && r.calc.diasAlcanza !== null && r.calc.diasAlcanza < r.s.lt; }).length : 0;
    }
  });
  var provs: GrupoSem[] = [], tot = { monto: psemZ(W), n: psemZ(W), sinCosto: psemZ(W) };
  PSEM_CATS.forEach(function (d) {
    if (!inc[d.id]) return;
    cat[d.id].provs.forEach(function (g) { provs.push(g); });
    for (k = 0; k < W; k++) { tot.monto[k] += cat[d.id].monto[k]; tot.n[k] += cat[d.id].n[k]; tot.sinCosto[k] += cat[d.id].sinCosto[k]; }
  });
  return { cat: cat, provs: provs, tot: tot };
}

// Dónde se va el dinero: por familia (jarabes, polvos, tisanas, desechables, café) y sus proveedores principales
export function psemFamDe(sku: any, nombre: any, det: any, cat: string): string {
  if (cat === "cafe") return "Café";
  var q = function (x: any) { return String(x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); };
  var d = q(det), n = q(nombre), s = String(sku || "").toUpperCase();
  if (/desechable/.test(d) || /^INS-DES|^INS-DEL/.test(s)) return "Desechables";
  if (/^cafe\b/.test(d) || /^INS-CAF/.test(s)) return "Café";
  // Con clasificación de Zoho solo las bebidas y la barra se reparten en estas familias; limpieza, foods, señalización, uniformes... son Otros
  if (d && !/bebida|barra/.test(d)) return "Otros";
  if ((!d || /bebida/.test(d)) && /vaso|tapa\b|tapas|popote|servilleta\b|bolsa|desechable|envase|charola|domo|kraft|agitador|\bcup\b|\blid\b/.test(n)) return "Desechables";
  if (/jarabe|salsa|syrup|sirope/.test(n)) return "Jarabes";
  if (/tisana|infusion|jamaica|manzanilla|terneatea|\bte\b|earl grey|hierbabuena|flor de/.test(n) && !/fuze|600 ml|2 lts/.test(n)) return "Tisanas";
  if (/polvo|powder|matcha|chai|cocoa|cacao|frapp|\bbase\b|horchata|chocolate|\bchip\b|creamer|leche|isopure|costal|proteina/.test(n)) return "Polvos";
  return "Otros";
}
// Lo que la simulación del servidor ordena HOY (lo mismo que la OC automática): Σ pedirHoy × costo de las filas que vienen del servidor.
export function psemHoyMonto(provs: GrupoSem[]): number {
  var t = 0; (provs || []).forEach(function (g) { g.rows.forEach(function (r) { var k = r.calc || {}; if (k.fuente === "servidor" && k.pedirHoy > 0 && r.costo > 0) t += k.pedirHoy * r.costo; }); });
  return t;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (6). Además, `npm run test:funciones`: 253 passed + 30 ignored; con `COM_APP_VIEJA`, 283 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planSem.ts supabase/functions/_shared/planSem_parity_test.ts
git commit -m "feat(comercializadora): plan de abastos por categoría portado del viejo, con paridad"
```

---

### Task 3: Esta semana: pagos, proveedores de la semana, riesgos y borradores (`planHoy.ts`) con paridad

**Files:**
- Create: `supabase/functions/_shared/planHoy.ts`
- Test: `supabase/functions/_shared/planHoy_parity_test.ts`

**Interfaces:**
- Consumes: `PSEM_CATS`, `GrupoSem`, `Sem`, `CatId` (Tarea 2); `PlanProv` (Tarea 1); `diaLocal`, `impFechaOk`, `DatosPlan`, `zocFuenteBorr` (planDatos); `fechaLocal`, `planEngDia`, `planEngDifDias` (planEngine); `impDif`, `CorridaImp` (planImp).
- Produces:
  - formatos: `fechaCorta(iso): string` ('13 nov') y `PAGO_MARGEN`, `PAGO_DIAS`;
  - pagos:
    - `pagoViernesSig(iso)` y `pagoViernesAnt(iso)`;
    - `pagoFecha(pedido: string, dias): string` y `pagoTxt(iso): string` ('vie 20 nov');
    - `pagoPedidoFecha(c: { semIni?: string[] } | null, k, hoyIso): string`;
    - `pagoPorFecha(grupos, k, c, hoyIso, credito: (g: GrupoSem) => number): { f: string; m: number }[]`;
  - semana: `hoyGrupos(S, k): GrupoSem[]`, `interface CtxFila`, `ctxFila(r, k): CtxFila | null` y `hoyPedidoTexto(g, k, hoyIso): string`;
  - riesgos: `interface Riesgo` y `hoyRiesgos(c, f: { cafe; imp }): Riesgo[]`;
  - borradores:
    - `interface LineaBorr`, `interface FuenteBorr { ls; fecha }` e `interface Borrador`;
    - `borrFuenteZoho(R): FuenteBorr | null`;
    - `borrAnalisis(S, f, hoyIso): { fecha; lista: Borrador[] } | null`.

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/planHoy_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de Esta semana: el viernes de pago (_pagoFecha, _pagoPedidoFecha, _pagoPorFecha, _pagoTxt) en días de la semana y
// fines de mes, los proveedores de la semana (_hoyGrupos), los riesgos (_hoyRiesgos), los borradores (_borrAnalisis) y el
// contexto del detalle (_ctxFila) de la app contra planHoy.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor, zocFuenteBorr } from "./planDatos.ts";
import { planEngDia } from "./planEngine.ts";
import { planLocal } from "./planProv.ts";
import { cafeOrdenes } from "./planCafe.ts";
import { impCorrer } from "./planImp.ts";
import { planSemCalc } from "./planSem.ts";
import {
  borrAnalisis, borrFuenteZoho, ctxFila, hoyGrupos, hoyPedidoTexto, hoyRiesgos, pagoFecha, pagoPedidoFecha, pagoPorFecha, pagoTxt,
} from "./planHoy.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP } from "./pruebas/fixturesImp.ts";
import { datosSem, NOMBRES_HOY, NOMBRES_SEM, SRV_SEM, STUBS_SEM, ZOHO_OC_SEM } from "./pruebas/fixturesSem.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP, ...NOMBRES_CAFE, ...NOMBRES_SEM, ...NOMBRES_HOY])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP + "\n" + STUBS_SEM, HOY_IMP);
const g = globalThis as any;
const TODAS = { local: true, cafe: true, imp: true };
let carga = 9000;

function prepararApp(R: DatosPlan, c0: any, cafeErr?: string) {
  const cfgA = A._planCfgNormalizar(c0), Ra = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__R = Ra;
  g.__UI = { esc: "" };
  g.__C = A._planBuild(Ra, cfgA);
  g.__CC = A._planBuild(Ra, cfgA, { cafe: true });
  g.__CC_ERR = cafeErr;
  A._planSemUI.inc = { ...TODAS };
  A._planSemUI.sem = 12;
}
const fuentes = (R: DatosPlan, cfg: any, cafeErr?: string) => ({
  cafe: () => { if (cafeErr) throw new Error(cafeErr); return cafeOrdenes(R, cfg); },
  imp: () => impCorrer(R, cfg),
});
/** Días de prueba: cada día de la semana, fines de mes, fin de año y febrero. */
const DIAS = ["2026-11-13", "2026-11-14", "2026-11-15", "2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-27", "2026-11-30",
  "2026-12-29", "2026-12-31", "2027-01-01", "2027-02-26", "2027-02-28", "2027-03-01"];
const NOMBRES_PAGO = ["today", "parseLocalDate", "_planIso", "_PLAN_MESES", "_PAGO_MARGEN", "_PAGO_DIAS", "_pagoViernesSig", "_pagoViernesAnt",
  "_pagoFecha", "_pagoTxt", "_pagoPedidoFecha", "_pagoPorFecha"];

Deno.test({ name: "paridad: pagoFecha y pagoTxt = _pagoFecha/_pagoTxt (150 días × 10 créditos, fines de mes y de año)", ignore: SIN_APP }, () => {
  let n = 0;
  for (let i = 0; i < 150; i++) {
    const p = planEngDia("2026-11-01", i);
    for (const dias of [0, 1, 3, 4, 7, 15, 30, 45, 60, "x"]) {
      const a = A._planIso(A._pagoFecha(A.parseLocalDate(p), dias)), s = pagoFecha(p, dias);
      assertEquals(s, a, `${p}/${dias}`);
      assertEquals(pagoTxt(s), A._pagoTxt(A.parseLocalDate(s)));
      n++;
    }
  }
  assertEquals(n, 1500);
});

Deno.test({ name: "paridad: pagoPedidoFecha y pagoPorFecha = _pagoPedidoFecha/_pagoPorFecha con hoy en cada día de prueba (semanas de 7 y 10 días)", ignore: SIN_APP }, () => {
  const R = datosSem(), cfg = normalizarCfgMotor({ zoho_oc: ZOHO_OC_SEM });
  prepararApp(R, { zoho_oc: ZOHO_OC_SEM });
  const S = planSemCalc(planLocal(R, cfg), TODAS, 12, fuentes(R, cfg));
  const CR: Record<string, number> = { "Vasos SA": 30, "Polvos y Bases": 7, "Green Packaging (vasos y tapas)": 60, "CAFICULTORES OMAC": 15 };
  g.__CR = CR;
  for (const hoy of DIAS) {
    const B = app(NOMBRES_PAGO, STUBS_SEM, hoy);
    for (const P of [7, 10]) {
      const c = { semIni: Array.from({ length: 12 }, (_, k) => planEngDia(hoy, P * k)) };
      g.__C = c;
      for (let k = 0; k < 13; k++) assertEquals(pagoPedidoFecha(c, k, hoy), B._planIso(B._pagoPedidoFecha(k)), `${hoy}/${P}/${k}`);
      for (const k of [0, 1, 4]) {
        const a = B._pagoPorFecha(S.provs, k).map((x: any) => ({ f: B._planIso(x.f), m: x.m }));
        assertEquals(pagoPorFecha(S.provs, k, c, hoy, (gr) => CR[gr.nombre] || 0), a, `${hoy}/${P}/semana ${k}`);
      }
    }
  }
});

Deno.test({ name: "paridad: hoyGrupos, hoyRiesgos, ctxFila y borrAnalisis = los de la app (con y sin servidor, café caído)", ignore: SIN_APP }, () => {
  let riesgos = 0, acciones = new Set<string>();
  for (const [nom, c0, cafeErr] of [["defecto", { zoho_oc: ZOHO_OC_SEM }, undefined], ["con_cafe", { zoho_oc: ZOHO_OC_SEM, compra: { excluir_cafe: false } }, undefined],
    ["cafe_caido", { zoho_oc: ZOHO_OC_SEM }, "sin café"]] as [string, any, string | undefined][]) {
    for (const srv of [null, SRV_SEM]) {
      const R = datosSem({ srv: srv as any }), cfg = normalizarCfgMotor(c0);
      prepararApp(R, c0, cafeErr);
      const c = planLocal(R, cfg), S = planSemCalc(c, TODAS, 12, fuentes(R, cfg, cafeErr)), Sa = A._planSemCalc();
      const k0 = `${nom}/${srv ? "srv" : "local"}`;
      for (const k of [0, 1]) {
        A._hoyUI.sem = k;
        assertEquals(hoyGrupos(S, k), A._hoyGrupos(Sa), `${k0} grupos ${k}`);
        S.provs.forEach((gr) => gr.rows.forEach((r) => assertEquals(ctxFila(r, k), A._ctxFila(r, k), `${k0} ctx ${r.sku}`)));
      }
      const rs = hoyRiesgos(c, fuentes(R, cfg, cafeErr));
      assertEquals(rs, A._hoyRiesgos(), `${k0} riesgos`);
      riesgos += rs.length;
      const f = zocFuenteBorr(cfg) as any;
      g.__F = f;
      const b = borrAnalisis(S, f, HOY_IMP);
      assertEquals(b, A._borrAnalisis(Sa), `${k0} borradores`);
      b!.lista.forEach((o) => acciones.add(o.accion));
    }
  }
  assert(riesgos > 0, "ningún riesgo");
  assertEquals([...acciones].sort(), ["ajustar", "borrar", "emitir"]);
});

Deno.test("borrFuenteZoho: pendiente, monto en pesos, nombre del catálogo y el día de CDMX de la última sincronización", () => {
  const f = borrFuenteZoho(datosSem())!;
  assertEquals(f.fecha, "2026-11-13");
  assertEquals(f.ls.length, 5);
  const usd = f.ls.find((l) => l.folio === "COM-OC-03004")!;
  assertEquals([usd.pend, usd.monto, usd.nom], [400, null, "Servilleta"]);
  assertEquals(f.ls.find((l) => l.sku === "LOC-JAR-001")!.monto, 3800);
  assertEquals(borrFuenteZoho({ ocZohoBorr: [], cat: [] }), null);
  // Una sincronización a las 23:30 de CDMX es del mismo día aunque en UTC ya sea el siguiente.
  const tarde = borrFuenteZoho({ cat: [], ocZohoBorr: [{ po_number: "X", sku: "A", vendor_name: null, fecha_oc: null, cantidad: 2, cantidad_recibida: 0, precio: null, synced_at: "2026-11-14T05:30:00Z" }] })!;
  assertEquals(tarde.fecha, "2026-11-13");
});

Deno.test("borrAnalisis con zoho-sync: emitir lo que el plan pide, ajustar lo parcial y borrar lo viejo o lo que no pide", () => {
  const R = datosSem(), cfg = normalizarCfgMotor({}), c = planLocal(R, cfg);
  const S = planSemCalc(c, TODAS, 12, fuentes(R, cfg));
  const b = borrAnalisis(S, borrFuenteZoho(R), HOY_IMP)!;
  const por = Object.fromEntries(b.lista.map((o) => [o.folio, o]));
  assertEquals(por["COM-OC-03001"].accion, "emitir");
  assertEquals(por["COM-OC-03002"].accion, "ajustar");
  assertEquals([por["COM-OC-03003"].accion, por["COM-OC-03003"].dias], ["borrar", 73]);
  assertEquals(b.lista.map((o) => o.accion), [...b.lista.map((o) => o.accion)].sort((x, y) => ["emitir", "ajustar", "borrar"].indexOf(x) - ["emitir", "ajustar", "borrar"].indexOf(y)));
});

Deno.test("pagoFecha: contado los lunes y martes paga ese viernes; del miércoles en adelante, el siguiente; con crédito, el viernes en que vence", () => {
  assertEquals([pagoFecha("2026-11-16", 0), pagoFecha("2026-11-17", 0), pagoFecha("2026-11-18", 0)], ["2026-11-20", "2026-11-20", "2026-11-27"]);
  assertEquals(pagoFecha("2026-11-16", 30), "2026-12-11"); // vence el miércoles 16-dic: el viernes anterior
  assertEquals(pagoFecha("2026-12-28", 4), "2027-01-01"); // el crédito no adelanta el pago antes del mínimo
  assertEquals(pagoFecha("2027-02-24", 0), "2027-03-05"); // cruza fin de febrero
  assertEquals(pagoTxt("2027-01-01"), "vie 1 ene");
  // Sin calendario (plan vacío) el pedido es hoy.
  assertEquals(pagoPedidoFecha({ semIni: [] }, 0, "2026-11-18"), "2026-11-18");
});

Deno.test("hoyPedidoTexto: líneas con SKU, piezas y monto, la semana y el total; contenedores como tales", () => {
  const g0 = { key: "local|vasos sa", pk: "vasos sa", cat: "local", fuente: "", nombre: "Vasos SA", real: true, minimo: 0,
    monto: [0, 0], n: [0, 0], uds: [0, 0], sinCosto: [0, 0],
    rows: [{ sku: "LOC-VAS-001", nombre: "Vaso papel 8 oz", costo: 1.2, sem: [1500, 0] }, { sku: "LOC-TIS-001", nombre: "Tisana", costo: 0, sem: [12, 3] },
      { sku: "CONT-2", nombre: "Contenedor 2 (68 CBM)", costo: 650000, contenedor: true, sem: [0, 1] }] } as any;
  assertEquals(hoyPedidoTexto(g0, 0, "2026-11-13"), "Pedido a Vasos SA — 13 nov\n- LOC-VAS-001 · Vaso papel 8 oz: 1,500 ($1,800)\n- LOC-TIS-001 · Tisana: 12\nTotal estimado: $1,800");
  assertEquals(hoyPedidoTexto(g0, 1, "2026-11-13"), "Pedido a Vasos SA — 13 nov (próxima semana)\n- LOC-TIS-001 · Tisana: 3\n- CONT-2 · Contenedor 2 (68 CBM): 1 contenedor ($650,000)\nTotal estimado: $650,000");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planHoy_parity_test.ts`
Expected: FAIL. `Module not found ".../planHoy.ts"`.

- [ ] **Step 3: El port**

Crear `supabase/functions/_shared/planHoy.ts`. Es `_hoyGrupos` 40360, `_hoyRiesgos` 40368, `_borrAnalisis` 40288, `_ctxFila` 40866, el texto de `_hoyCopiar` 40436–40437 y 40619–40675. El viejo trabajaba con `Date` locales; aquí los días son 'YYYY-MM-DD' de CDMX, contados en UTC, y la paridad compara con `_planIso` de la app. `borrFuenteZoho` es del portal (decisión 3).

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de "Esta semana" del sitio viejo (app/index.html a9e4a22, 40261–40440 y 40615–40886): los proveedores de la
// semana (_hoyGrupos 40360), lo que se quedaría sin producto (_hoyRiesgos 40368), los borradores de Zoho por resolver
// (_borrAnalisis 40288), el contexto de cada fila del detalle (_ctxFila 40866), el texto de "Copiar pedido" (_hoyCopiar
// 40433) y el viernes de pago (_PAGO_MARGEN, _pagoViernesSig/_pagoViernesAnt, _pagoFecha 40624, _pagoTxt,
// _pagoPedidoFecha 40662, _pagoPorFecha 40672). El viejo usaba Date locales del navegador; aquí los días son
// 'YYYY-MM-DD' de CDMX y se cuentan en UTC (mismo resultado). Sin globales: lo que el viejo leía de _planCache,
// _cafeOrdenes, _impCorrer, _borrFuente y _pagoCredito se recibe. planHoy_parity_test.ts compara contra la app.
import { fechaLocal, planEngDia, planEngDifDias } from "./planEngine.ts";
import { diaLocal, type DatosPlan, impFechaOk } from "./planDatos.ts";
import { type CorridaImp, impDif } from "./planImp.ts";
import type { PlanProv } from "./planProv.ts";
import { type CatId, type GrupoSem, PSEM_CATS, type Sem } from "./planSem.ts";

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
/** _planFechaCorta: '2026-11-13' → '13 nov'. */
export function fechaCorta(iso: any): string { var p = String(iso || "").split("-"); return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12) ? String(iso || "") : (+p[2]) + " " + MESES[+p[1] - 1]; }
var NF = [0, 1, 2].map(function (n) { return new Intl.NumberFormat("es-MX", { minimumFractionDigits: 0, maximumFractionDigits: n }); });
function planN(x: any, dec?: number): string { return NF[dec || 0].format(Number(x)); }
function planMoney(x: any): string { x = Number(x || 0); return (x < 0 ? "-" : "") + "$" + NF[0].format(Math.abs(x)); }
const diaSem = (iso: string) => new Date(iso + "T00:00:00Z").getUTCDay();

// ═══ Pagos ═══════════════════════════════════════════════════════════════════════════════════════════════════════
// Cadencia de compra: se pide el lunes (máximo el martes) y se paga el viernes de esa semana; si el proveedor da crédito, se
// paga el viernes de la semana en que vence (días de crédito contados desde el pedido).
export const PAGO_MARGEN = 3; // días mínimos entre pedir y el viernes de pago: pedido el lunes o martes -> viernes de esa semana; miércoles en adelante -> el siguiente
export const PAGO_DIAS = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
export function pagoViernesSig(iso: string): string { return planEngDia(iso, (5 - diaSem(iso) + 7) % 7); }
export function pagoViernesAnt(iso: string): string { return planEngDia(iso, -((diaSem(iso) - 5 + 7) % 7)); }
// Fecha (viernes) en que se paga un pedido hecho en la fecha "pedido" a un proveedor con "dias" de crédito
export function pagoFecha(pedido: string, dias: any): string {
  var p = pedido;
  var min = pagoViernesSig(planEngDia(p, PAGO_MARGEN));
  dias = Number(dias) || 0; if (!(dias > 0)) return min;
  var f = pagoViernesAnt(planEngDia(p, dias));
  return f < min ? min : f;
}
export function pagoTxt(iso: string): string { return PAGO_DIAS[diaSem(iso)] + " " + (+iso.slice(8, 10)) + " " + MESES[+iso.slice(5, 7) - 1]; }
// Fecha en que se hace el pedido de la semana k del plan: el lunes de esa semana (o hoy si ese lunes ya pasó)
export function pagoPedidoFecha(c: { semIni?: string[] } | null, k: number, hoyIso: string): string {
  var ini = (c && c.semIni && diaLocal(c.semIni[k])) || hoyIso;
  var lun = planEngDia(ini, -((diaSem(ini) + 6) % 7));
  return lun < hoyIso ? hoyIso : lun;
}
// Suma por fecha de pago de los proveedores (grupos de planSemCalc) para la semana k. `credito` = días de crédito del grupo.
export function pagoPorFecha(grupos: GrupoSem[], k: number, c: { semIni?: string[] } | null, hoyIso: string, credito: (g: GrupoSem) => number): { f: string; m: number }[] {
  var m: Record<string, { f: string; m: number }> = {};
  grupos.forEach(function (g) { var v = g.monto[k] || 0; if (!(v > 0)) return; var f = pagoFecha(pagoPedidoFecha(c, k, hoyIso), credito(g)), iso = f; (m[iso] = m[iso] || { f: f, m: 0 }).m += v; });
  return Object.keys(m).sort().map(function (i) { return m[i]; });
}

// ═══ Proveedores de la semana y detalle ══════════════════════════════════════════════════════════════════════════
export function hoyGrupos(S: Sem, k: number): GrupoSem[] {
  var filas: GrupoSem[] = [];
  PSEM_CATS.forEach(function (d) { S.cat[d.id].provs.forEach(function (g) { if (g.n[k] > 0 || g.sinCosto[k] > 0) filas.push(g); }); });
  filas.sort(function (a, b) { return b.monto[k] - a.monto[k] || a.nombre.localeCompare(b.nombre); });
  return filas;
}
/** Contexto del día del pedido de una fila (local/café: calc; importación: ctx). Con pedidos de varias semanas, "quedas con" suma lo pedido hasta la semana k. */
export interface CtxFila { tienes: number; enOC: number; consumo: number; diasHoy: number | null; quedas: number; diasQuedas: number | null }
export function ctxFila(r: any, k: number): CtxFila | null {
  if (r.ctx) return r.ctx;
  var c = r.calc; if (!c || c.consumo === undefined || c.invBase === undefined || c.disponible === undefined) return null;
  var cum = 0, j; for (j = 0; j <= (k || 0) && j < r.sem.length; j++) cum += r.sem[j] || 0;
  var q = c.disponible + cum;
  return { tienes: c.invBase, enOC: (r.s && r.s.enOC) || 0, consumo: c.consumo, diasHoy: c.diasHoy, quedas: q, diasQuedas: c.consumo > 0 ? Math.max(0, q) / c.consumo : null };
}
/** "Copiar pedido": la lista de lo que hay que pedirle al proveedor en la semana k, para pegarla en un correo o WhatsApp. */
export function hoyPedidoTexto(g: GrupoSem, k: number, hoyIso: string): string {
  var lineas: string[] = [], tot = 0;
  g.rows.filter(function (r) { return r.sem[k] > 0; }).forEach(function (r) { var q = r.sem[k], m = r.costo > 0 ? (r.contenedor ? r.costo : q * r.costo) : 0; tot += m; lineas.push("- " + r.sku + " · " + r.nombre + ": " + planN(q) + (r.contenedor ? " contenedor" : "") + (m > 0 ? " (" + planMoney(m) + ")" : "")); });
  return "Pedido a " + g.nombre + " — " + fechaCorta(hoyIso) + (k === 1 ? " (próxima semana)" : "") + "\n" + lineas.join("\n") + "\nTotal estimado: " + planMoney(tot);
}

// ═══ Se quedarían sin producto ═══════════════════════════════════════════════════════════════════════════════════
export interface Riesgo { nombre: string; sku: string; cat: CatId; alcanza: number; lt: number; gap: number; prov: string; llega: string | null; tab: "plan" | "cafe" | "imp" }
// Artículos que se quedarían sin producto antes de que pueda llegar un pedido de hoy (de las tres categorías)
export function hoyRiesgos(c: PlanProv, f: { cafe: () => PlanProv | null; imp: () => CorridaImp | null }): Riesgo[] {
  var out: Riesgo[] = [];
  var plan = function (p: PlanProv | null, cat: CatId) {
    if (!p) return;
    p.rows.forEach(function (r) {
      if (r.sinMov || r.importacion || (cat === "local" && r.esCafe) || r.calc.diasAlcanza === null) return;
      var lt = r.s.lt || 0; if (!(r.calc.diasAlcanza < lt)) return;
      out.push({ nombre: r.nombre, sku: r.sku, cat: cat, alcanza: Math.max(0, r.calc.diasAlcanza), lt: lt, gap: lt - Math.max(0, r.calc.diasAlcanza), prov: r.provNombre, llega: r.llegaOC, tab: cat === "cafe" ? "cafe" : "plan" });
    });
  };
  plan(c, "local");
  try { plan(f.cafe(), "cafe"); } catch { /* sin café: solo lo demás */ }
  try {
    var ic = f.imp();
    if (ic && ic.S) {
      var prov: Record<string, any> = {}; ic.cfg.imp.prov.forEach(function (p: any) { prov[p.clave] = p; });
      ic.S.productos.forEach(function (p: any, i: number) {
        var q = p.quiebre, it = ic!.ent.items[i];
        if (!/^URGENTE/.test(q.estado) || !(q.diasSinProducto > 0)) return;
        var d = q.seAcaba ? impDif(c.hoyIso, q.seAcaba) : 0;
        out.push({ nombre: q.producto, sku: it.sku, cat: "imp", alcanza: Math.max(0, d || 0), lt: q.leadTime, gap: q.diasSinProducto, prov: (prov[it.proveedor] || {}).nombre || it.proveedor, llega: null, tab: "imp" });
      });
    }
  } catch { /* sin importaciones: solo lo demás */ }
  out.sort(function (a, b) { return b.gap - a.gap || a.nombre.localeCompare(b.nombre); });
  return out;
}

// ═══ Borradores de Zoho por resolver ═════════════════════════════════════════════════════════════════════════════
// Un borrador no es una compra: se emite o se borra el mismo día. Cada uno se compara con lo que hoy pide el plan (esta semana y la próxima).
export interface LineaBorr { sku: string; nom: string; folio: string; prov: string; fecha: string; creada: string; pend: number; monto: number | null; borrador: boolean }
export interface FuenteBorr { ls: LineaBorr[]; fecha: string }
export interface Borrador { folio: string; prov: string; fecha: string; creada: string; monto: number; pend: number; cub: number; lineas: { sku: string; nom: string; q: number; plan: number; viene: number }[]; dias: number | null; nPlan: number; accion: "emitir" | "ajustar" | "borrar"; motivo: string }

/**
 * Decisión 3 del 3f: la fuente son los borradores de zoho-sync (com_zoho_oc_lineas con status 'draft', R.ocZohoBorr) con la
 * forma de las líneas de la carga de Zoho del viejo: pendiente = pedida − recibida, monto = pendiente × precio (null si la OC
 * no es en pesos: zoho-sync no guarda su precio) y "creada" vacía (Zoho no la trae: cuenta la fecha de la OC). La fecha es el
 * día de CDMX de la última sincronización. Sin líneas, null (no hay panel).
 */
export function borrFuenteZoho(R: Pick<DatosPlan, "ocZohoBorr" | "cat">): FuenteBorr | null {
  var nom: Record<string, string> = {}, ls: LineaBorr[] = [], ult = "";
  (R.cat || []).forEach(function (c) { nom[String(c.sku).trim().toUpperCase()] = c.nombre || ""; });
  (R.ocZohoBorr || []).forEach(function (l) {
    var pend = Math.round((Number(l.cantidad) - Number(l.cantidad_recibida || 0)) * 1e4) / 1e4;
    if (!l.sku || !(pend > 0)) return;
    var precio = l.precio == null ? NaN : Number(l.precio);
    ls.push({ sku: l.sku, nom: nom[String(l.sku).trim().toUpperCase()] || "", folio: l.po_number, prov: l.vendor_name || "", fecha: impFechaOk(l.fecha_oc) ? (l.fecha_oc as string) : "", creada: "",
      pend: pend, monto: isFinite(precio) && precio > 0 ? Math.round(pend * precio * 100) / 100 : null, borrador: true });
    var t = l.synced_at ? Date.parse(l.synced_at) : NaN, s = isFinite(t) ? fechaLocal(t) : ""; if (s > ult) ult = s;
  });
  return ls.length ? { ls: ls, fecha: ult } : null;
}

export function borrAnalisis(S: Sem, f: FuenteBorr | null, hoyIso: string): { fecha: string; lista: Borrador[] } | null {
  if (!f) return null;
  var need: Record<string, number> = {}, viene: Record<string, number> = {}, por: Record<string, Borrador> = {}, lista: Borrador[] = [];
  PSEM_CATS.forEach(function (d) { S.cat[d.id].provs.forEach(function (g) { g.rows.forEach(function (r) {
    var q = (r.sem[0] || 0) + (r.sem[1] || 0); if (q > 0) need[r.sku] = (need[r.sku] || 0) + q;
    if (r.s && r.s.enOC > 0) viene[r.sku] = r.s.enOC;
  }); }); });
  f.ls.forEach(function (l) {
    if (!l.borrador) return;
    var o = por[l.folio]; if (!o) { o = por[l.folio] = { folio: l.folio, prov: l.prov, fecha: l.fecha, creada: l.creada || "", monto: 0, pend: 0, cub: 0, lineas: [] } as any; lista.push(o); }
    var n = need[l.sku] || 0;
    o.lineas.push({ sku: l.sku, nom: l.nom, q: l.pend, plan: n, viene: viene[l.sku] || 0 });
    o.monto += Number(l.monto || 0); o.pend += l.pend; o.cub += Math.min(l.pend, n);
  });
  lista.forEach(function (o) {
    var cub = o.pend > 0 ? o.cub / o.pend : 0, d0 = diaLocal(o.creada || o.fecha);
    o.dias = d0 ? Math.max(0, planEngDifDias(hoyIso, d0)) : null;
    o.nPlan = o.lineas.filter(function (x) { return x.plan > 0; }).length;
    o.accion = (o.dias !== null && o.dias > 30) ? "borrar" : cub >= 0.8 ? "emitir" : cub > 0 ? "ajustar" : "borrar";
    o.motivo = (o.dias !== null && o.dias > 30) ? "más de 30 días en borrador" : cub >= 0.8 ? "el plan pide casi todo lo que trae" : cub > 0 ? "el plan pide solo una parte" : "el plan no pide nada de esto";
  });
  var rango: Record<string, number> = { emitir: 0, ajustar: 1, borrar: 2 };
  lista.sort(function (a, b) { return rango[a.accion] - rango[b.accion] || b.monto - a.monto; });
  return { fecha: f.fecha, lista: lista };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (7). Además, `npm run test:funciones`: 257 passed + 33 ignored; con `COM_APP_VIEJA`, 290 passed.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planHoy.ts supabase/functions/_shared/planHoy_parity_test.ts
git commit -m "feat(comercializadora): esta semana (pagos, riesgos y borradores) portada del viejo, con paridad"
```

---

### Task 4: "Crear OC" del plan local (origen "Plan de abastos")

**Files:**
- Modify: `lib/comercializadora/crearOc.ts`
- Test: `tests/portal/com-crear-oc.test.tsx`

**Interfaces:**
- Consumes: `PlanProv`, `planLocal` (Tarea 1); `GrupoSem`, `planSemCalc` (Tarea 2); `ocImportaciones`, `enlaceOc`, `prellenadoOc`, `planCantOC` (3e).
- Produces:
  - `type OrigenOc = 'Importaciones' | 'Café' | 'Plan de abastos'` (`?nueva=plan`);
  - `ocPlan(c: PlanProv, key: string, origen: 'Café' | 'Plan de abastos'): PrellenadoOc | { error: string }`;
  - `ocCafe(c, key)` (la misma firma del 3e) y `ocLocal(c, key)`;
  - `ocGrupoSem(g: Pick<GrupoSem, 'fuente' | 'pk'>, p: { local: PlanProv; cafe: PlanCafe | null; imp: CorridaImp | null }): PrellenadoOc | { error: string }`.

  La pantalla de Órdenes no cambia: `prellenadoOc` ya lee el origen del mapa `ORIGEN`.

- [ ] **Step 1: Prueba que falla**

En `tests/portal/com-crear-oc.test.tsx`, cambiar el bloque de imports de `crearOc` a `fixturesImp.ts` por:

```tsx
import {
  enlaceOc,
  ocCafe,
  ocGrupoSem,
  ocImportaciones,
  ocLocal,
  prellenadoOc,
} from '../../lib/comercializadora/crearOc';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc } from '../../supabase/functions/_shared/planSem.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';
import { datosSem, SRV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';
```

y agregar al final:

```tsx
describe('Crear OC desde el Plan de abastos y Esta semana (plan 3f)', () => {
  const cfg = normalizarCfgMotor({});

  it('proveedor local: lo de esta semana (con lo adelantado por el mínimo), monto y arribo con el lead time más largo', () => {
    const c = planLocal(datosSem(), cfg);
    expect(ocLocal(c, 'jarabes mx')).toEqual({
      origen: 'Plan de abastos',
      proveedor: 'Jarabes MX',
      lineas: [
        { sku: 'LOC-JAR-001', cantidad: 31 },
        { sku: 'LOC-JAR-002', cantidad: 23 },
      ],
      monto: 5130,
      arribo: '2026-11-20',
    });
    expect(ocLocal(c, '__sin__')).toEqual({
      error: 'Asigna un proveedor a estos artículos antes de crear la OC',
    });
  });

  it('con la simulación del servidor va solo lo de HOY (pedirHoy); si lo de la semana toca otro día, lo dice', () => {
    const c = planLocal(datosSem({ srv: SRV_SEM }), cfg);
    const oc = ocLocal(c, 'jarabes mx');
    expect('error' in oc ? oc.error : oc.lineas).toEqual([{ sku: 'LOC-JAR-001', cantidad: 36 }]);
    expect(ocLocal(c, 'polvos y bases')).toEqual({
      error: 'Nada que pedir hoy a este proveedor: lo de esta semana toca en los próximos días',
    });
  });

  it('cada grupo del plan abre la OC de su categoría; el enlace lleva nueva=plan y Órdenes lo acepta', () => {
    const R = datosSem(),
      c = planLocal(R, cfg),
      cafe = cafeOrdenes(R, cfg),
      imp = impCorrer(R, cfg);
    const S = planSemCalc(c, { local: true, cafe: true, imp: true }, 12, {
      cafe: () => cafe,
      imp: () => imp,
    });
    const de = (cat: string) => S.provs.find((g) => g.cat === cat && g.n[0] > 0)!;
    const o = (cat: string) => ocGrupoSem(de(cat), { local: c, cafe, imp });
    expect(
      ['local', 'cafe', 'imp'].map((k) => {
        const x = o(k);
        return 'error' in x ? x.error : x.origen;
      }),
    ).toEqual(['Plan de abastos', 'Café', 'Importaciones']);
    expect(ocGrupoSem({ fuente: 'imp', pk: 'Green Packaging' }, { local: c, cafe: null, imp: null })).toEqual(
      {
        error: 'No hay un cálculo de importaciones.',
      },
    );
    const loc = o('local');
    if ('error' in loc) throw new Error(loc.error);
    const url = enlaceOc(loc);
    expect(url).toContain('nueva=plan&');
    expect(
      prellenadoOc(
        sp(url),
        R.cat.map((x) => x.sku),
        '2026-11-13',
      )?.origen,
    ).toBe('Plan de abastos');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-crear-oc.test.tsx`
Expected: FAIL. `ocLocal` y `ocGrupoSem` no se exportan (`is not a function`); las 8 pruebas del 3e siguen pasando.

- [ ] **Step 3: Implementación**

Reemplazar `lib/comercializadora/crearOc.ts` completo. `ocCafe` pasa a ser `ocPlan(c, key, 'Café')` sin cambiar lo que devuelve. Desde el plan local se quita el café que ese plan traiga con `compra.excluir_cafe = false` (`_planCafeFueraLocal`, 34014):

```ts
import type { FormOc } from './ordenes';
import { masDias } from './fechas';
import { impAhoraDatos, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import { planCantOC, type PlanCafe } from '../../supabase/functions/_shared/planCafe.ts';
import type { PlanProv } from '../../supabase/functions/_shared/planProv.ts';
import type { GrupoSem } from '../../supabase/functions/_shared/planSem.ts';

/** De dónde viene la OC sugerida (el viejo lo mostraba como "sugerido por …"). */
export type OrigenOc = 'Importaciones' | 'Café' | 'Plan de abastos';
const ORIGEN: Record<string, OrigenOc> = {
  importaciones: 'Importaciones',
  cafe: 'Café',
  plan: 'Plan de abastos',
};
const CLAVE: Record<OrigenOc, string> = {
  Importaciones: 'importaciones',
  Café: 'cafe',
  'Plan de abastos': 'plan',
};
export const MAX_LINEAS_OC = 60;

export interface PrellenadoOc {
  origen: OrigenOc;
  proveedor: string;
  lineas: { sku: string; cantidad: number }[];
  monto: number | null;
  arribo: string | null;
}
/** Formulario de Órdenes con lo sugerido; `origen` y `omitidos` (líneas con SKU fuera del catálogo) solo se muestran. */
export type FormPrellenado = FormOc & { origen: OrigenOc; omitidos: number };

/**
 * Enlace a Órdenes con el formulario de nueva OC prellenado (plan 3e, decisión 3): proveedor, artículos y cantidades,
 * monto y fecha de arribo estimados. Nada se guarda hasta que la persona revisa y pulsa Guardar.
 */
export function enlaceOc(p: PrellenadoOc): string {
  const q = new URLSearchParams({ nueva: CLAVE[p.origen], proveedor: p.proveedor });
  for (const l of p.lineas.slice(0, MAX_LINEAS_OC)) q.append('l', `${l.sku}:${l.cantidad}`);
  if (p.monto != null && p.monto > 0) q.set('monto', String(p.monto));
  if (p.arribo) q.set('arribo', p.arribo);
  return `/comercializadora/ordenes?${q.toString()}`;
}

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fechaOk = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Lee el prellenado de la URL con lista blanca: origen conocido, proveedor de texto (sin caracteres de control, 120 como
 * máximo), SKUs del catálogo (sin distinguir mayúsculas; se usa el del catálogo), cantidades mayores a 0 (hasta 10
 * millones), 60 líneas como máximo, monto de 0 a 10 mil millones y fecha real. Lo demás se descarta; las líneas con un SKU
 * que no está en el catálogo se cuentan en `omitidos`. Sin origen, proveedor o líneas válidas: null (no abre el formulario).
 */
export function prellenadoOc(
  sp: Record<string, string | string[] | undefined>,
  catalogo: string[],
  hoy: string,
): FormPrellenado | null {
  const origen = ORIGEN[uno(sp.nueva) ?? ''];
  const proveedor = String(uno(sp.proveedor) ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 120);
  if (!origen || !proveedor) return null;
  const crudas = sp.l == null ? [] : Array.isArray(sp.l) ? sp.l : [sp.l];
  const canon = new Map(catalogo.map((s) => [s.trim().toUpperCase(), s]));
  const lineas: FormOc['lineas'] = [];
  let omitidos = 0;
  for (const t of crudas) {
    const i = t.lastIndexOf(':');
    if (i <= 0) continue;
    const sku = canon.get(t.slice(0, i).trim().toUpperCase()),
      cantidad = Number(t.slice(i + 1));
    if (!sku) {
      omitidos++;
      continue;
    }
    if (!(cantidad > 0 && cantidad <= 1e7) || lineas.some((l) => l.sku === sku)) continue;
    lineas.push({ sku, cantidad });
    if (lineas.length >= MAX_LINEAS_OC) break;
  }
  if (!lineas.length) return null;
  const monto = Number(uno(sp.monto));
  const arribo = String(uno(sp.arribo) ?? '');
  return {
    origen,
    omitidos,
    folio: '',
    proveedor,
    fecha: hoy,
    fecha_arribo: fechaOk(arribo) ? arribo : '',
    destino: 'CEDIS',
    monto: monto >= 0 && monto <= 1e10 ? Math.round(monto * 100) / 100 : 0,
    lineas,
  };
}

/**
 * window._impCrearOC: lo que hay que colocar ESTA semana con el proveedor. El proveedor es el del catálogo del primer
 * artículo (o el nombre del plan), el monto la inversión del modelo y el arribo la llegada más tardía.
 */
export function ocImportaciones(c: CorridaImp, clave: string): PrellenadoOc | { error: string } {
  if (!c.S) return { error: 'No hay un cálculo de importaciones.' };
  const gr = impAhoraDatos(c).g[clave];
  if (!gr || !gr.esta.length) return { error: 'Nada que pedir esta semana a este proveedor' };
  const items = gr.esta;
  const pd = c.ent.meta.items[items[0].it.sku]?.cat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monto = items.reduce((s: number, o: any) => s + (o.q.inversion || 0), 0);
  return {
    origen: 'Importaciones',
    proveedor: (pd && pd.proveedor) || gr.prov.nombre,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineas: items.map((o: any) => ({ sku: o.it.sku, cantidad: o.q.cantidadPedir })),
    monto: monto > 0 ? Math.round(monto * 100) / 100 : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arribo:
      items.reduce(
        (mx: string, o: any) => (o.q.llegaCedis && o.q.llegaCedis > mx ? o.q.llegaCedis : mx),
        '',
      ) || null,
  };
}

/**
 * window._planCrearOC(key, fuente): lo de hoy del proveedor (pedirHoy del servidor o pedirEsta local). Monto solo si
 * todos tienen costo; arribo = hoy + el lead time más largo. Desde el plan local (plan 3f, 'Plan de abastos') no entra el
 * café que ese plan traiga con compra.excluir_cafe = false: se pide desde su propio grupo de Café (_planCafeFueraLocal).
 */
export function ocPlan(
  c: PlanProv,
  key: string,
  origen: 'Café' | 'Plan de abastos',
): PrellenadoOc | { error: string } {
  const g = c.provs.find((x) => x.key === key);
  if (!g || !g.real) return { error: 'Asigna un proveedor a estos artículos antes de crear la OC' };
  const fueraLocal = (r: { esCafe?: boolean }) =>
    !!(r.esCafe && !c.soloCafe && c.cfg?.compra?.excluir_cafe === false);
  const rowsOC = origen === 'Café' ? g.rows : g.rows.filter((r) => !fueraLocal(r));
  const items = rowsOC.filter((r) => planCantOC(r) > 0);
  if (!items.length)
    return {
      error: rowsOC.some((r) => r.calc.pedirEsta > 0)
        ? 'Nada que pedir hoy a este proveedor: lo de esta semana toca en los próximos días'
        : 'Nada que pedir esta semana a este proveedor',
    };
  let mOC = 0,
    sinC = 0;
  items.forEach((r) => (r.costo > 0 ? (mOC += planCantOC(r) * r.costo) : sinC++));
  const ltMax = Math.max(...items.map((r) => Number(r.s.lt) || 0));
  return {
    origen,
    proveedor: g.nombre,
    lineas: items.map((r) => ({ sku: r.sku, cantidad: planCantOC(r) })),
    monto: sinC === 0 && mOC > 0 ? Math.round(mOC * 100) / 100 : null,
    arribo: masDias(c.hoyIso, ltMax),
  };
}
/** window._planCrearOC(key, 'cafe'): "Qué pedir" de Café (plan 3e). */
export const ocCafe = (c: PlanCafe, key: string) => ocPlan(c, key, 'Café');
/** window._planCrearOC(key): un proveedor del plan local, desde el Plan de abastos o Esta semana (plan 3f). */
export const ocLocal = (c: PlanProv, key: string) => ocPlan(c, key, 'Plan de abastos');

/**
 * "Crear OC" de un grupo del Plan de abastos o de Esta semana (plan 3f): según su categoría, _impCrearOC(g.pk) o
 * _planCrearOC(g.pk[, 'cafe']). Si la categoría no se pudo calcular, dice por qué.
 */
export function ocGrupoSem(
  g: Pick<GrupoSem, 'fuente' | 'pk'>,
  p: { local: PlanProv; cafe: PlanCafe | null; imp: CorridaImp | null },
): PrellenadoOc | { error: string } {
  if (g.fuente === 'imp')
    return p.imp ? ocImportaciones(p.imp, g.pk) : { error: 'No hay un cálculo de importaciones.' };
  if (g.fuente === 'cafe') return p.cafe ? ocCafe(p.cafe, g.pk) : { error: 'No hay un cálculo de café.' };
  return ocLocal(p.local, g.pk);
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (11). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/crearOc.ts tests/portal/com-crear-oc.test.tsx
git commit -m "feat(comercializadora): Crear OC desde el plan local (origen Plan de abastos)"
```

---

### Task 5: Excel del Plan de abastos (seis hojas)

**Files:**
- Create: `lib/comercializadora/excelPlan.ts`
- Test: `tests/portal/com-excel-plan.test.ts`

**Interfaces:**
- Consumes:
  - `Hoja`, `LibroExcel` (`excelImpCafe.ts`, 3e);
  - `fechaCorta` (Tarea 3);
  - `Sem`, `Pasadas`, `Inc`, `PSEM_CATS` (Tarea 2) y `PlanProv` (Tarea 1);
  - `cfgConImp`, `cfgConCafe` (3e).
- Produces: `filasConfigPlan(cfg): Hoja['filas']` y `libroPlanAbastos(S: Sem, c: PlanProv, pas: Pasadas, inc: Inc): LibroExcel` (la Tarea 7 lo pasa a `DescargarExcel`).

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-excel-plan.test.ts`:

```ts
// Plan 3f: "Exportar Excel" del Plan de abastos (seis hojas, como _planSemExportar del viejo).
import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';
import { filasConfigPlan, libroPlanAbastos } from '../../lib/comercializadora/excelPlan';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc, psemPasadas, type Inc } from '../../supabase/functions/_shared/planSem.ts';
import { datosSem, ZOHO_OC_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const R = datosSem();
const cfg = normalizarCfgMotor({
  zoho_oc: ZOHO_OC_SEM,
  eventos: [
    {
      nombre: 'Buen Fin',
      ini: '2026-11-13',
      fin: '2026-11-16',
      factor: 1.4,
      alcance: 'todos',
      activo: false,
    },
  ],
});
const c = planLocal(R, cfg);
const libro = (inc: Inc) =>
  libroPlanAbastos(
    planSemCalc(c, inc, 4, { cafe: () => cafeOrdenes(R, cfg), imp: () => impCorrer(R, cfg) }),
    c,
    psemPasadas(c, R),
    inc,
  );

describe('Excel del Plan de abastos', () => {
  it('seis hojas en el orden del viejo, con todas las semanas del plan aunque se vean 4', () => {
    const l = libro({ local: true, cafe: true, imp: true });
    expect(l.archivo).toBe('Plan_de_abastos_2026-11-13.xlsx');
    expect(l.hojas.map((h) => h.nombre)).toEqual([
      'Resumen por categoría ($)',
      'Por proveedor ($)',
      'Por artículo (piezas)',
      'Por artículo ($)',
      'Compras ya emitidas',
      'Configuración',
    ]);
    const [cats, provs, arts, artsM, emit] = l.hojas.map((h) => h.filas);
    expect(Object.keys(cats[0])).toEqual([
      'Categoría',
      'Incluida',
      'Hoy 13 nov',
      '20 nov',
      '27 nov',
      '4 dic',
      '11 dic',
      '18 dic',
      '25 dic',
      '1 ene',
      '8 ene',
      '15 ene',
      '22 ene',
      '29 ene',
      'Total $',
    ]);
    expect(cats.map((x) => x.Categoría)).toEqual(['Todo lo demás', 'Café', 'Importaciones']);
    const jar = provs.find((x) => x.Proveedor === 'Jarabes MX')!;
    expect([jar.Categoría, jar['Mínimo capturado'], jar['Hoy 13 nov']]).toEqual([
      'Todo lo demás',
      5000,
      5130,
    ]);
    const tis = artsM.find((x) => x.SKU === 'LOC-TIS-001')!;
    expect(tis['Hoy 13 nov']).toBe('sin costo');
    expect(arts.every((x) => (x['Total piezas'] as number) > 0)).toBe(true);
    expect(arts.find((x) => x.Categoría === 'Importaciones')?.['Disponible (inv.+OC)']).toBe('');
    expect(emit.map((x) => x['Semana (inicio)'])).toEqual([
      '2026-10-03',
      '2026-10-10',
      '2026-10-17',
      '2026-10-24',
      '2026-10-31',
      '2026-11-07',
    ]);
  });

  it('lo no incluido sale como "no" en el resumen y no aparece por proveedor ni por artículo', () => {
    const l = libro({ local: true, cafe: false, imp: false });
    expect(l.hojas[0].filas.map((x) => x.Incluida)).toEqual(['sí', 'no', 'no']);
    expect(new Set(l.hojas[1].filas.map((x) => x.Categoría))).toEqual(new Set(['Todo lo demás']));
  });

  it('Configuración: un parámetro por fila, imp y café normalizados, eventos al final y sin la carga de Zoho', () => {
    const f = filasConfigPlan(cfg);
    const claves = f.map((x) => x.Parámetro as string);
    expect(claves).toContain('compra.prox_dias');
    expect(claves).toContain('imp.politica.meses_cobertura');
    expect(claves).toContain('cafe.anio');
    expect(claves.some((k) => k.startsWith('zoho_oc'))).toBe(false);
    expect(f.at(-1)).toEqual({
      Parámetro: 'evento: Buen Fin',
      Valor: '2026-11-13 a 2026-11-16 × 1.4 (todos) [inactivo]',
    });
  });

  it('SheetJS lo escribe y se vuelve a leer con los mismos valores', () => {
    const l = libro({ local: true, cafe: true, imp: true });
    const wb = XLSX.utils.book_new();
    for (const h of l.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
    const leido = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(leido.SheetNames).toHaveLength(6);
    const p = XLSX.utils.sheet_to_json<Record<string, unknown>>(leido.Sheets['Por proveedor ($)']);
    expect(p.find((x) => x.Proveedor === 'Jarabes MX')?.['Hoy 13 nov']).toBe(5130);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-excel-plan.test.ts`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/excelPlan"`.

- [ ] **Step 3: Implementación**

Crear `lib/comercializadora/excelPlan.ts` (`_planSemExportar` 40230 y `_planCfgPlanaFilas` 34072; decisión 12):

```ts
import type { Hoja, LibroExcel } from './excelImpCafe';
import { fechaCorta } from '../../supabase/functions/_shared/planHoy.ts';
import { cfgConImp } from '../../supabase/functions/_shared/planImp.ts';
import { cfgConCafe } from '../../supabase/functions/_shared/planCafe.ts';
import type { PlanProv } from '../../supabase/functions/_shared/planProv.ts';
import { PSEM_CATS, type Inc, type Pasadas, type Sem } from '../../supabase/functions/_shared/planSem.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const r2 = (x: number) => Math.round(x * 100) / 100;

/**
 * _planCfgPlanaFilas (34072): la configuración del cálculo, una fila por parámetro ordenada por clave y los eventos al
 * final. Las listas de números van por índice y las de objetos como JSON (el viejo pasaba el arreglo a SheetJS). Imp y café
 * van normalizados, como los tenía el viejo en c.cfg. La carga de Zoho de la configuración (zoho_oc) no es un parámetro y
 * puede pasar del límite de una celda de Excel: no se exporta.
 */
export function filasConfigPlan(cfg: X): Hoja['filas'] {
  const c = cfgConCafe(cfgConImp(cfg)),
    out: Record<string, unknown> = {};
  const aplanar = (o: X, pre: string) => {
    Object.keys(o || {}).forEach((k) => {
      const v = o[k],
        p = pre ? pre + '.' + k : k;
      if (!pre && k === 'zoho_oc') return;
      if (Array.isArray(v)) {
        if (v.every((x) => x === null || typeof x !== 'object')) v.forEach((x, i) => (out[p + '.' + i] = x));
        else out[p] = JSON.stringify(v);
      } else if (v && typeof v === 'object') aplanar(v, p);
      else out[p] = v;
    });
  };
  aplanar(c, '');
  const filas: Hoja['filas'] = Object.keys(out)
    .sort()
    .filter((k) => k.indexOf('eventos') !== 0)
    .map((k) => ({ Parámetro: k, Valor: out[k] }));
  (c.eventos || []).forEach((e: X) =>
    filas.push({
      Parámetro: 'evento: ' + e.nombre,
      Valor:
        e.ini +
        ' a ' +
        e.fin +
        ' × ' +
        e.factor +
        ' (' +
        e.alcance +
        (e.valores.length ? ': ' + e.valores.join(', ') : '') +
        ')' +
        (e.activo === false ? ' [inactivo]' : ''),
    }),
  );
  return filas;
}

/**
 * window._planSemExportar (40230): las seis hojas del viejo con todas las semanas del plan (no solo las que se ven). Por
 * proveedor y por artículo llevan solo las categorías incluidas; el resumen, las tres con "Incluida".
 */
export function libroPlanAbastos(S: Sem, c: PlanProv, pas: Pasadas, inc: Inc): LibroExcel {
  const W = c.W;
  const et = (k: number) => (k === 0 ? 'Hoy ' : '') + fechaCorta(c.semIni[k]);
  const nomCat = (id: string) => PSEM_CATS.find((x) => x.id === id)?.nombre;
  const cats = PSEM_CATS.map((d) => {
    const C = S.cat[d.id],
      o: Record<string, unknown> = { Categoría: d.nombre, Incluida: inc[d.id] ? 'sí' : 'no' };
    let t = 0;
    for (let k = 0; k < W; k++) {
      o[et(k)] = r2(C.monto[k]);
      t += C.monto[k];
    }
    o['Total $'] = r2(t);
    return o;
  });
  const provs = S.provs.map((g) => {
    const o: Record<string, unknown> = {
      Categoría: nomCat(g.cat),
      Proveedor: g.nombre,
      'Mínimo capturado': g.minimo || '',
    };
    let t = 0,
      sc = 0;
    for (let k = 0; k < W; k++) {
      o[et(k)] = r2(g.monto[k]);
      t += g.monto[k];
      sc += g.sinCosto[k];
    }
    o['Total $ (sin artículos sin costo)'] = r2(t);
    o['Líneas sin costo (suma de semanas)'] = sc;
    return o;
  });
  const arts: Hoja['filas'] = [],
    artsM: Hoja['filas'] = [];
  S.provs.forEach((g) =>
    g.rows.forEach((r: X) => {
      const o: Record<string, unknown> = {
        Categoría: nomCat(g.cat),
        SKU: r.sku,
        Artículo: r.nombre,
        Proveedor: r.provNombre,
        'Lead time (días)': r.s.lt || '',
        'Disponible (inv.+OC)': r.imp ? '' : r.calc.disponible,
        'Consumo diario': r.imp ? '' : r2(r.calc.consumo),
        'Costo unitario': r.costo || '',
      };
      const m = { ...o };
      let tq = 0,
        tm = 0;
      for (let k = 0; k < W; k++) {
        o[et(k)] = r.sem[k];
        m[et(k)] = r.costo > 0 ? r2(r.sem[k] * r.costo) : r.sem[k] > 0 ? 'sin costo' : '';
        tq += r.sem[k];
        if (r.costo > 0) tm += r.sem[k] * r.costo;
      }
      o['Total piezas'] = tq;
      m['Total $'] = r2(tm);
      if (tq > 0) {
        arts.push(o);
        artsM.push(m);
      }
    }),
  );
  const emit: Hoja['filas'] = [];
  for (let j = pas.np - 1; j >= 0; j--)
    emit.push({
      'Semana (inicio)': pas.ini[j],
      'Todo lo demás $': r2(pas.local[j]),
      'Café $': r2(pas.cafe[j]),
      'Importaciones $': r2(pas.imp[j]),
    });
  return {
    archivo: `Plan_de_abastos_${c.hoyIso}.xlsx`,
    hojas: [
      { nombre: 'Resumen por categoría ($)', filas: cats },
      { nombre: 'Por proveedor ($)', filas: provs },
      { nombre: 'Por artículo (piezas)', filas: arts },
      { nombre: 'Por artículo ($)', filas: artsM },
      { nombre: 'Compras ya emitidas', filas: emit },
      { nombre: 'Configuración', filas: filasConfigPlan(c.cfg) },
    ],
  };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (4).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/excelPlan.ts tests/portal/com-excel-plan.test.ts
git commit -m "feat(comercializadora): Excel del Plan de abastos con las seis hojas del viejo"
```

---

### Task 6: Lo que pinta el Plan de abastos (`planAbastos.ts`)

**Files:**
- Create: `lib/comercializadora/planAbastos.ts`
- Test: `tests/portal/com-plan-abastos.test.ts`

**Interfaces:**
- Consumes: Tareas 1 a 3 (`PlanProv`, `planSemCalc`, `planSemW`, `psemPasadas`, `psemFamDe`, `psemHoyMonto`, `psemSum`, `PSEM_CATS`, `fechaCorta`); `fechaHora` (`cafe.ts`, 3e); `dinero`, `nf` (`importaciones.ts`, 3e); `planEngDia`.
- Produces (los usan las Tareas 7 a 9):
  - re-exporta para las páginas: `fechaCorta`, `planSemCalc`, `planSemW`, `PSEM_CATS`, `psemPasadas` y los tipos `CatId`, `GrupoSem`, `Inc`, `PlanProv`, `Sem`;
  - `interface FuentesPlan { cafe: PlanCafe | null; imp: CorridaImp | null }`;
  - `COLOR_CAT: Record<CatId, string>` (decisión 9) y `dineroCorto(x)`;
  - parámetros de la URL: `incDe(sin)`, `sinCon(inc, id)`, `vistaSemDe(v)` y `opcionesSemanas(c)`;
  - `etiquetaSem(c, k, larga?)` y `fuenteCant(c, R, ahora) → { tono: 'ok' | 'warn'; texto; extra: string[] } | null`;
  - cifras: `tarjetasCat(S, inc, Wv)`, `kpisSem(S, inc, Wv)`, `familiasSem(S, Wv, cat)` y `hoyTxt(S, c)`;
  - gráfica: `graficaSem(S, pas, inc, Wv, c, hoy)` y `queTrae(S, Wv, simple, c, hoy)`;
  - matrices: `filtrarProvs(S, q, prov)`, `provValido(S, prov)`, `provOpciones(S)`, `tablaProvs(S, inc, Wv, q, prov)` y `tablaArts(S, Wv, q, prov)`;
  - seguimiento: `seguimientoSem(bt)` y `pctSeg(x)`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-plan-abastos.test.ts`:

```ts
// Plan 3f: lo que calcula la pantalla Plan de abastos (parámetros, aviso de la fuente, cifras, familias, gráfica,
// "qué trae cada barra", matrices y seguimiento de ventas).
import { describe, expect, it } from 'vitest';
import {
  dineroCorto,
  etiquetaSem,
  familiasSem,
  filtrarProvs,
  fuenteCant,
  graficaSem,
  hoyTxt,
  incDe,
  kpisSem,
  opcionesSemanas,
  provOpciones,
  provValido,
  queTrae,
  seguimientoSem,
  sinCon,
  tablaArts,
  tablaProvs,
  tarjetasCat,
  vistaSemDe,
} from '../../lib/comercializadora/planAbastos';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc, psemPasadas, type Inc } from '../../supabase/functions/_shared/planSem.ts';
import { datosSem, SRV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const TODAS: Inc = { local: true, cafe: true, imp: true };
const armar = (R = datosSem(), inc: Inc = TODAS, Wv = 12, c0: Record<string, unknown> = {}) => {
  const cfg = normalizarCfgMotor(c0),
    c = planLocal(R, cfg);
  return {
    R,
    c,
    S: planSemCalc(c, inc, Wv, { cafe: () => cafeOrdenes(R, cfg), imp: () => impCorrer(R, cfg) }),
  };
};

describe('parámetros de la URL', () => {
  it('categorías incluidas (?sin=), vista, semanas y etiquetas', () => {
    expect(incDe(undefined)).toEqual(TODAS);
    expect(incDe('imp,cafe,otra')).toEqual({ local: true, cafe: false, imp: false });
    expect([sinCon(TODAS, 'imp'), sinCon({ local: true, cafe: true, imp: false }, 'imp')]).toEqual([
      'imp',
      undefined,
    ]);
    expect([vistaSemDe('articulo'), vistaSemDe('x')]).toEqual(['articulo', 'proveedor']);
    expect([opcionesSemanas({ W: 12 }), opcionesSemanas({ W: 8 }), opcionesSemanas({ W: 6 })]).toEqual([
      [4, 8, 12],
      [4, 8],
      [4, 6],
    ]);
    const c = { semIni: ['2026-11-13', '2026-11-20'], P: 7 };
    expect([etiquetaSem(c, 0), etiquetaSem(c, 0, true), etiquetaSem(c, 1, true)]).toEqual([
      'Hoy',
      'Hoy – 19 nov',
      '20 nov – 26 nov',
    ]);
    expect([dineroCorto(850), dineroCorto(12400), dineroCorto(1340000)]).toEqual(['$850', '$12 k', '$1.3 M']);
  });
});

describe('aviso de la fuente de las cantidades', () => {
  it('servidor (de hoy, de ayer o más vieja) y cálculo local con el motivo', () => {
    const c = planLocal(datosSem({ srv: SRV_SEM }), normalizarCfgMotor({}));
    const hoy = fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-13T18:00:00Z'))!;
    expect(hoy.tono).toBe('ok');
    expect(hoy.texto).toMatch(/^Cantidades: simulación del servidor 13 nov 2026/);
    expect(hoy.extra).toEqual([
      '1 artículo de la simulación no aparece en el Plan.',
      '1 artículo sin proveedor o costo en Zoho: se muestran con el cálculo local.',
    ]);
    expect(fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-14T18:00:00Z'))!.texto).toContain(
      'servidor de ayer',
    );
    expect(fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-16T18:00:00Z'))!.texto).toContain(
      'servidor del ',
    );
    const vieja = { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h' };
    const local = planLocal(datosSem({ srv: vieja }), normalizarCfgMotor({}));
    expect(fuenteCant(local, { srv: vieja }, 0)).toEqual({
      tono: 'warn',
      texto:
        'Usando el cálculo local del Plan: la simulación del servidor no está disponible (corrida de hace 40 h). Los números pueden no coincidir con Qué pedir ni con la OC automática.',
      extra: [],
    });
    expect(fuenteCant(local, { srv: null }, 0)).toBeNull();
  });
});

describe('tarjetas, cifras y familias', () => {
  it('tarjetas por categoría (con el error de la que no se pudo calcular) y cifras de lo incluido', () => {
    const { S } = armar(datosSem(), { local: true, cafe: true, imp: false }, 4, {
      imp: { orden: [], items: {} },
    });
    const t = tarjetasCat(S, { local: true, cafe: true, imp: false }, 4);
    expect(t.map((x) => [x.def.id, x.on])).toEqual([
      ['local', true],
      ['cafe', true],
      ['imp', false],
    ]);
    expect(t[2]).toMatchObject({
      aviso: 'No hay artículos activos en el plan de importaciones.',
      error: true,
    });
    const k = kpisSem(S, { local: true, cafe: true, imp: false }, 4);
    expect(k.ninguna).toBe(false);
    expect(k.esta.monto).toBe(S.tot.monto[0]);
    expect(k.esta.des.map((d) => d.def.id)).toEqual(['local', 'cafe']);
    expect(k.total.monto).toBeCloseTo(S.tot.monto.slice(0, 4).reduce((a, b) => a + b, 0));
    expect(kpisSem(S, { local: false, cafe: false, imp: false }, 4).ninguna).toBe(true);
  });

  it('dónde se va el dinero: familias por clasificación de Zoho y nombre, "Otros" al final', () => {
    const { R, S } = armar();
    const f = familiasSem(S, 12, R.cat)!;
    const nombres = f.lista.map((x) => x.nombre);
    expect(nombres.at(-1)).toBe('Otros');
    // La tisana no tiene costo: no suma dinero a ninguna familia.
    expect(nombres).toEqual(['Café', 'Polvos', 'Jarabes', 'Desechables', 'Otros']);
    expect(f.lista.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(f.tot);
    expect(f.lista.find((x) => x.nombre === 'Jarabes')!.provs).toBe('Jarabes MX 100%');
    const vacio = armar(datosSem(), { local: false, cafe: false, imp: false }).S;
    expect(familiasSem(vacio, 12, R.cat)).toBeNull();
  });
});

describe('gráfica y "qué trae cada barra"', () => {
  it('6 semanas emitidas y las del plan, apiladas por categoría incluida; la primera del plan dice lo de hoy con servidor', () => {
    const { R, c, S } = armar(datosSem({ srv: SRV_SEM }), TODAS, 8);
    const g = graficaSem(S, psemPasadas(c, R), TODAS, 8, c, hoyTxt(S, c));
    expect(g.barras).toHaveLength(14);
    expect(g.barras.slice(0, 6).every((b) => b.tipo === 'pas')).toBe(true);
    expect(g.barras[6]).toMatchObject({ tipo: 'plan', etiqueta: 'Esta semana', k: 0 });
    expect(g.barras[6].tip).toContain('Hoy (igual a la OC automática): $');
    expect(g.barras[6].seg.map((s) => s.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(g.contenedor).toBeGreaterThan(0);
    const sinImp = graficaSem(S, psemPasadas(c, R), { local: true, cafe: true, imp: false }, 8, c, '');
    expect(sinImp.barras[6].seg.map((s) => s.def.id)).toEqual(['local', 'cafe']);
    expect(hoyTxt(S, planLocal(datosSem(), normalizarCfgMotor({})))).toBe('');
  });

  it('qué trae: esta semana y las barras altas, con lo más caro arriba y "y N más"', () => {
    const { c, S } = armar();
    const q = queTrae(S, 12, false, c, '');
    expect(q[0].k).toBe(0);
    expect(q.length).toBeLessThanOrEqual(4);
    q.forEach((x) => {
      expect(x.top.length).toBeLessThanOrEqual(4);
      expect(x.top.map((t) => t.monto)).toEqual([...x.top.map((t) => t.monto)].sort((a, b) => b - a));
      const resto = x.mas ? x.mas.monto : 0;
      expect(x.top.reduce((s, t) => s + t.monto, 0) + resto).toBeCloseTo(x.total);
    });
    expect(queTrae(S, 12, true, c, '')[0].top.length).toBeLessThanOrEqual(3);
  });
});

describe('matrices por proveedor y por artículo', () => {
  it('por proveedor: categorías incluidas con subtotal; el filtro por texto y proveedor; un proveedor que ya no existe se ignora', () => {
    const { S } = armar();
    const t = tablaProvs(S, TODAS, 4, '', '');
    expect(t.cats.map((x) => x.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(t.gran).toBeCloseTo(t.tot.reduce((a, b) => a + b, 0));
    expect(t.cats[0].subT).toBeCloseTo(t.cats[0].filas.reduce((s, f) => s + f.total, 0));
    expect(filtrarProvs(S, 'vainilla', '').map((g) => g.key)).toEqual(['local|jarabes mx']);
    expect(tablaProvs(S, TODAS, 4, '', 'local|jarabes mx').nProv).toBe(1);
    expect([
      provValido(S, 'local|jarabes mx'),
      provValido(S, 'local|nadie'),
      provValido(S, undefined),
    ]).toEqual(['local|jarabes mx', '', '']);
    expect(provOpciones(S).find(([k]) => k.startsWith('imp|'))![1]).toMatch(/\(Importaciones\)$/);
  });

  it('por artículo: del primer pedido al último; importaciones con su llegada; el texto busca también el proveedor', () => {
    const { S } = armar();
    const a = tablaArts(S, 12, '', '');
    expect(a.map((x) => x.r.fechaLimite || '9')).toEqual([...a.map((x) => x.r.fechaLimite || '9')].sort());
    const imp = a.find((x) => x.r.imp && !x.r.contenedor);
    expect(imp?.llega).toBe(imp?.r.llega);
    expect(tablaArts(S, 12, 'jarabes mx', '').every((x) => x.g.nombre === 'Jarabes MX')).toBe(true);
  });
});

describe('seguimiento de ventas', () => {
  const semana = (j: number, proy: number, real: number) => ({
    j,
    ini: 'a',
    fin: 'b',
    proy,
    real,
    n: 3,
    desv: proy > 0 ? (real - proy) / proy : null,
  });
  it('apagado, sin historia y la alerta de ±15% en las dos últimas semanas completas', () => {
    expect(seguimientoSem({ n: 0 }).estado).toBe('apagado');
    expect(seguimientoSem({ n: 4, semanas: [{ n: 0 }], arts: [] }).estado).toBe('sin-historia');
    const arriba = seguimientoSem({
      n: 4,
      semanas: [semana(1, 100, 300), semana(2, 100, 120), semana(3, 100, 130)],
      arts: [],
      comprasSinMonto: 0,
    });
    expect(arriba).toMatchObject({ estado: 'ok', alerta: { dir: 'arriba' } });
    if (arriba.estado === 'ok') expect(arriba.alerta!.pct).toBeCloseTo(25);
    const normal = seguimientoSem({
      n: 4,
      semanas: [semana(1, 100, 10), semana(2, 100, 110), semana(3, 100, 95)],
      arts: [],
      comprasSinMonto: 0,
    });
    expect(normal.estado === 'ok' && normal.alerta).toBe(null);
  });

  it('los 8 artículos que más se desvían, con al menos 2 semanas y costo', () => {
    const arts = Array.from({ length: 12 }, (_, i) => ({
      sku: 'S' + i,
      n: i === 0 ? 1 : 2,
      valor: i === 1 ? null : i * 10,
    }));
    const s = seguimientoSem({ n: 2, semanas: [semana(1, 1, 1)], arts, comprasSinMonto: 2 });
    if (s.estado !== 'ok') throw new Error(s.estado);
    expect(s.arts.map((a) => a.sku)).toEqual(['S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4']);
    expect(s.sinMonto).toBe(2);
  });

  it('con datos reales del plan', () => {
    const { c } = armar();
    expect(['ok', 'sin-historia']).toContain(seguimientoSem(c.bt).estado);
  });
});

describe('plan grande', () => {
  it('600 artículos de 40 proveedores: todos entran a la matriz (sin paginar) y los totales cuadran', () => {
    const base = datosSem();
    const cat = Array.from({ length: 600 }, (_, i) => ({
      sku: `GRD-${String(i).padStart(3, '0')}`,
      nombre: `Artículo ${i}`,
      estatus: 'Compra Recurrente',
      categoria: 'Barra',
      costo_unitario: 10 + (i % 7),
      saldo_cedis: 0,
      saldo_yulius: 0,
      cantidad_por_apertura: 0,
      minimo_compra_pzas: 0,
      multiplo_compra: 1,
      dias_seguridad: null,
      created_at: '2024-01-10T15:00:00+00:00',
      proveedor_preferido: `Proveedor ${i % 40}`,
      origen: 'LOCAL',
    }));
    const pedidos = Array.from({ length: 300 }, (_, j) => ({
      id: 'g' + j,
      fecha_pedido: new Date(Date.UTC(2026, 10, 12, 18) - (j % 25) * 864e5).toISOString(),
      status: 'enviado',
      apertura_id: 's1',
      franquiciatario_email: 'f@x.com',
      items: cat
        .filter((_, i) => i % 300 === j || (i + 1) % 300 === j)
        .map((x) => ({ sku: x.sku, nombre: 'x', cantidad: 5 })),
      items_editados: null,
    }));
    const R = { ...base, cat: [...base.cat, ...cat], pedidos: [...base.pedidos, ...pedidos] };
    const { S } = armar(R, { local: true, cafe: false, imp: false }, 12);
    const t = tablaProvs(S, { local: true, cafe: false, imp: false }, 12, '', '');
    expect(t.cats[0].filas.filter((f) => f.g.nombre.startsWith('Proveedor ')).length).toBe(40);
    expect(tablaArts(S, 12, 'GRD-', '').length).toBe(600);
    expect(t.gran).toBeCloseTo(t.tot.reduce((a, b) => a + b, 0));
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-plan-abastos.test.ts`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/planAbastos"`.

- [ ] **Step 3: Implementación**

Crear `lib/comercializadora/planAbastos.ts`. Es la parte de datos de las funciones `_planSem*`/`_psem*` que pintaban HTML:
- `_planSemCategoriasHtml`, `_planSemKpisHtml` y `_psemFamiliasHtml`;
- `_planSemGraficaComprasHtml` y `_psemQueTrae`;
- `_planSemTablaProvsHtml` y `_planSemTablaArtsHtml`;
- `_planSemSeguimientoHtml`;
- `_planSrvChipTxt` y la caja de fuente de `_planBannersHtml`.

Mismos criterios y textos, sin HTML:

```ts
import { planEngDia } from '../../supabase/functions/_shared/planEngine.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import type { PlanProv } from '../../supabase/functions/_shared/planProv.ts';
import { fechaCorta } from '../../supabase/functions/_shared/planHoy.ts';
import type { CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { PlanCafe } from '../../supabase/functions/_shared/planCafe.ts';
import {
  planSemCalc,
  planSemW,
  PSEM_CATS,
  psemFamDe,
  psemHoyMonto,
  psemPasadas,
  psemSum,
  type CatDef,
  type CatId,
  type GrupoSem,
  type Inc,
  type Pasadas,
  type Sem,
} from '../../supabase/functions/_shared/planSem.ts';
import { fechaHora } from './cafe';
import { dinero, nf } from './importaciones';

export type { CatId, GrupoSem, Inc, PlanProv, Sem };
export { fechaCorta, planSemCalc, planSemW, PSEM_CATS, psemPasadas };
/** Café e Importaciones tal como se calcularon para el plan (se llenan dentro de planSemCalc; null si no se pudo). */
export interface FuentesPlan {
  cafe: PlanCafe | null;
  imp: CorridaImp | null;
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * Color de cada categoría en la gráfica y las etiquetas (decisión 9): el gris, el café y el morado del viejo (#374151,
 * #92400E, #7C3AED) fallan el piso de croma y luminosidad del validador de paletas; estos tres pasan claro y oscuro
 * (CVD ΔE ≥ 16.9) y conservan la idea: azul para lo local, café para el café, morado para Importaciones.
 */
export const COLOR_CAT: Record<CatId, string> = {
  local: '#1f74a6',
  cafe: '#b0703c',
  imp: '#7c3aed',
};

/** _planMoneyCorto: '$12 k', '$1.3 M'. */
export const dineroCorto = (x: number) => {
  const v = Number(x || 0);
  return v >= 1e6
    ? '$' + Math.round(v / 1e5) / 10 + ' M'
    : v >= 1e3
      ? '$' + Math.round(v / 1e3) + ' k'
      : '$' + Math.round(v);
};

// ── Parámetros de la URL ──
/** ?sin=cafe,imp: categorías fuera del dinero a disponer (el viejo lo guardaba en localStorage 'plan_sem_inc'). */
export function incDe(sin: string | undefined): Inc {
  const fuera = new Set(String(sin || '').split(','));
  return { local: !fuera.has('local'), cafe: !fuera.has('cafe'), imp: !fuera.has('imp') };
}
/** ?sin= con la categoría `id` cambiada (undefined si todas quedan incluidas). */
export function sinCon(inc: Inc, id: CatId): string | undefined {
  const n = { ...inc, [id]: !inc[id] };
  const fuera = PSEM_CATS.filter((d) => !n[d.id]).map((d) => d.id);
  return fuera.length ? fuera.join(',') : undefined;
}
/** ?vista=: matriz por proveedor (por omisión) o por artículo. */
export const vistaSemDe = (v: string | undefined): 'proveedor' | 'articulo' =>
  v === 'articulo' ? 'articulo' : 'proveedor';
/** Semanas que se pueden elegir: 4, 8 y 12 si caben, y las del plan (_planSemToolbarHtml). */
export function opcionesSemanas(c: { W: number }): number[] {
  const o = [4, 8, 12].filter((n) => n <= c.W);
  if (o.indexOf(c.W) < 0) o.push(c.W);
  return o;
}
/** _planSemEtiqueta: 'Hoy' / '20 nov', o el rango 'Hoy – 19 nov' / '20 nov – 26 nov'. */
export function etiquetaSem(c: { semIni: string[]; P: number }, k: number, larga?: boolean): string {
  if (k === 0) return larga ? 'Hoy – ' + fechaCorta(planEngDia(c.semIni[0], c.P - 1)) : 'Hoy';
  return larga
    ? fechaCorta(c.semIni[k]) + ' – ' + fechaCorta(planEngDia(c.semIni[k], c.P - 1))
    : fechaCorta(c.semIni[k]);
}

// ── Aviso de la fuente de las cantidades ──
const diaCdmx = (t: number | string) => {
  const d = new Date(t);
  return isNaN(d.getTime())
    ? null
    : new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(d);
};
/**
 * De dónde salen las cantidades de lo local (_planSrvChipTxt 38584 y la caja de _planBannersHtml 33747): la simulación del
 * servidor (avisa si no es de hoy) o el cálculo local con el motivo. Sin simulación leída, null.
 */
export function fuenteCant(
  c: Pick<PlanProv, 'fuenteCant' | 'srvSinPlan' | 'srvSinDatos'>,
  R: Pick<DatosPlan, 'srv'>,
  ahora: number,
): { tono: 'ok' | 'warn'; texto: string; extra: string[] } | null {
  if (c.fuenteCant === 'servidor') {
    const calc = R.srv?.calc ?? null,
      d = calc ? diaCdmx(calc) : null,
      h = diaCdmx(ahora);
    let cuando = '';
    if (d && h && d !== h) {
      const ayer = diaCdmx(Date.parse(h + 'T12:00:00Z') - 864e5);
      cuando = d === ayer ? 'de ayer ' : 'del ';
    }
    const extra: string[] = [];
    if (c.srvSinPlan > 0)
      extra.push(
        `${nf(c.srvSinPlan)} ${c.srvSinPlan === 1 ? 'artículo' : 'artículos'} de la simulación no ${c.srvSinPlan === 1 ? 'aparece' : 'aparecen'} en el Plan.`,
      );
    if (c.srvSinDatos > 0)
      extra.push(
        `${nf(c.srvSinDatos)} ${c.srvSinDatos === 1 ? 'artículo' : 'artículos'} sin proveedor o costo en Zoho: se muestran con el cálculo local.`,
      );
    return {
      tono: 'ok',
      texto: `Cantidades: simulación del servidor ${cuando}${fechaHora(calc)} (la misma de la OC automática, Qué pedir y Pagos).`,
      extra,
    };
  }
  if (!R.srv) return null;
  return {
    tono: 'warn',
    texto: `Usando el cálculo local del Plan: la simulación del servidor no está disponible (${R.srv.motivo || 'sin datos'}). Los números pueden no coincidir con Qué pedir ni con la OC automática.`,
    extra: [],
  };
}

// ── Tarjetas, cifras y familias ──
/** _planSemCategoriasHtml: una tarjeta por categoría con su dinero y si entra al plan. */
export function tarjetasCat(S: Sem, inc: Inc, Wv: number) {
  const k4 = Math.min(4, Wv);
  return PSEM_CATS.map((d) => {
    const C = S.cat[d.id];
    return {
      def: d,
      on: !!inc[d.id],
      total: psemSum(C.monto, 0, Wv),
      esta: C.monto[0] || 0,
      prox4: psemSum(C.monto, 0, k4),
      k4,
      arts: C.arts,
      provs: C.provs.length,
      // Revisión 3f: el viejo solo mostraba el error en la vista detallada; aquí siempre (el total no incluye esa categoría).
      aviso: C.err || C.aviso,
      error: !!C.err,
    };
  });
}
/** _planSemKpisHtml: dinero de esta semana, de las próximas 4 y del horizonte, con su desglose por categoría. */
export function kpisSem(S: Sem, inc: Inc, Wv: number) {
  const k4 = Math.min(4, Wv),
    incl = PSEM_CATS.filter((d) => inc[d.id]);
  const des = (a: number, b: number) =>
    incl.length > 1 ? incl.map((d) => ({ def: d, monto: psemSum(S.cat[d.id].monto, a, b) })) : [];
  let pico = 0,
    kp = 0;
  for (let i = 0; i < Wv; i++)
    if (S.tot.monto[i] > pico) {
      pico = S.tot.monto[i];
      kp = i;
    }
  return {
    ninguna: !incl.length,
    k4,
    esta: {
      monto: S.tot.monto[0] || 0,
      n: S.tot.n[0] || 0,
      sinCosto: S.tot.sinCosto[0] || 0,
      des: des(0, 1),
    },
    prox: { monto: psemSum(S.tot.monto, 0, k4), sinCosto: psemSum(S.tot.sinCosto, 0, k4), des: des(0, k4) },
    total: { monto: psemSum(S.tot.monto, 0, Wv), pico, kp, des: des(0, Wv) },
    rot: incl.reduce((t, d) => t + S.cat[d.id].rot, 0),
  };
}
/** _psemFamiliasHtml: dónde se va el dinero de las semanas que se ven, por familia, con sus dos proveedores principales. */
export function familiasSem(S: Sem, Wv: number, cat: Pick<DatosPlan, 'cat'>['cat']) {
  const por: Record<string, X> = {};
  (cat || []).forEach((x) => (por[x.sku] = x));
  const fam: Record<string, { n: string; m: number; p: Record<string, number> }> = {};
  let tot = 0;
  S.provs.forEach((g) =>
    g.rows.forEach((r: X) => {
      let m = 0;
      for (let k = 0; k < Wv; k++)
        m += r.m ? r.m[k] || 0 : r.sem[k] > 0 && r.costo > 0 ? r.sem[k] * r.costo : 0;
      if (!(m > 0)) return;
      const c = por[r.sku],
        f = psemFamDe(r.sku, r.nombre, c && c.clasificacion_detallada, g.cat);
      const F = fam[f] || (fam[f] = { n: f, m: 0, p: {} });
      F.m += m;
      F.p[g.nombre] = (F.p[g.nombre] || 0) + m;
      tot += m;
    }),
  );
  if (!(tot > 0)) return null;
  const lista = Object.values(fam).sort(
    (a, b) => Number(a.n === 'Otros') - Number(b.n === 'Otros') || b.m - a.m,
  );
  const max = Math.max(...lista.map((x) => x.m));
  const cinco = lista.filter((x) => x.n !== 'Otros').reduce((s, x) => s + x.m, 0);
  return {
    tot,
    cinco: Math.round((cinco / tot) * 100),
    lista: lista.map((F) => ({
      nombre: F.n,
      monto: F.m,
      pct: Math.round((F.m / tot) * 100),
      ancho: Math.max(1.5, (F.m / max) * 100),
      provs: Object.entries(F.p)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 2)
        .map(([n, v]) => `${n} ${Math.round((v / F.m) * 100)}%`)
        .join(' · '),
    })),
  };
}
/** _psemHoyTxt: con la simulación del servidor, lo que ordena hoy (igual a la OC automática). */
export const hoyTxt = (S: Sem, c: Pick<PlanProv, 'fuenteCant'>) =>
  c.fuenteCant === 'servidor' ? 'Hoy (igual a la OC automática): ' + dinero(psemHoyMonto(S.provs)) : '';

// ── Gráfica "Compras por semana" (decisión 2: el modo "Pagos por viernes" no se porta) ──
export interface BarraSem {
  tipo: 'pas' | 'plan';
  etiqueta: string;
  tip: string;
  k?: number;
  seg: { def: CatDef; v: number }[];
  tot: number;
}
/** _planSemGraficaComprasHtml: 6 semanas de OCs emitidas (claras) y las semanas del plan (fuertes), apiladas por categoría. */
export function graficaSem(S: Sem, pas: Pasadas, inc: Inc, Wv: number, c: PlanProv, hoy: string) {
  const cats = PSEM_CATS.filter((d) => inc[d.id]);
  const mk = (
    tipo: BarraSem['tipo'],
    fn: (d: CatDef) => number,
    etiqueta: string,
    tip: string,
    k?: number,
  ) => {
    const seg = cats.map((d) => ({ def: d, v: fn(d) }));
    return { tipo, etiqueta, tip, k, seg, tot: seg.reduce((t, s) => t + s.v, 0) };
  };
  const barras: BarraSem[] = [];
  for (let j = pas.np - 1; j >= 0; j--)
    barras.push(
      mk(
        'pas',
        (d) => pas[d.id][j],
        fechaCorta(pas.ini[j]),
        'Compras emitidas desde el ' + fechaCorta(pas.ini[j]),
      ),
    );
  for (let k = 0; k < Wv; k++)
    barras.push(
      mk(
        'plan',
        (d) => S.cat[d.id].monto[k],
        k === 0 ? 'Esta semana' : fechaCorta(c.semIni[k]),
        'Plan ' + etiquetaSem(c, k, true),
        k,
      ),
    );
  // La primera barra del plan es toda la semana; la OC automática ordena solo lo de hoy.
  const tips = barras.map(
    (b, i) =>
      `${b.tip}: ${dinero(b.tot)}` +
      b.seg
        .filter((s) => s.v > 0)
        .map((s) => `\n${s.def.nombre}: ${dinero(s.v)}`)
        .join('') +
      (i === pas.np && hoy ? '\n' + hoy : ''),
  );
  let max = 0;
  barras.forEach((b) => (max = Math.max(max, b.tot)));
  const cn: number[] = [];
  S.provs.forEach((g) => g.rows.forEach((r: X) => r.contenedor && r.costo > 0 && cn.push(r.costo)));
  return {
    barras: barras.map((b, i) => ({ ...b, tip: tips[i] })),
    np: pas.np,
    max,
    vacio: max <= 0,
    contenedor: cn.length ? cn.reduce((a, b) => a + b, 0) / cn.length : null,
    sinMonto: pas.sinMonto,
  };
}
/** _psemQueTrae: la semana de hoy y hasta tres barras altas (≥ 50% de la más alta), con lo que más pesa en cada una. */
export function queTrae(S: Sem, Wv: number, simple: boolean, c: PlanProv, hoy: string) {
  const tot = S.tot.monto;
  let max = 0;
  for (let k = 0; k < Wv; k++) if (tot[k] > max) max = tot[k];
  if (!(max > 0)) return [];
  const cand: number[] = [];
  for (let k = 1; k < Wv; k++) if (tot[k] >= max * 0.5) cand.push(k);
  cand.sort((a, b) => tot[b] - tot[a]);
  const ks = (tot[0] > 0 ? [0] : []).concat(cand.slice(0, 3)).sort((a, b) => a - b);
  const nT = simple ? 3 : 4;
  return ks.map((kk) => {
    const arr: { nombre: string; monto: number; urg: boolean }[] = [];
    let t = 0,
      urg = 0;
    S.provs.forEach((g) =>
      g.rows.forEach((r: X) => {
        const m = r.m ? r.m[kk] || 0 : r.sem[kk] > 0 && r.costo > 0 ? r.sem[kk] * r.costo : 0;
        if (!(m > 0)) return;
        arr.push({ nombre: r.nombre, monto: m, urg: !!r.urg });
        t += m;
        if (r.urg) urg += m;
      }),
    );
    arr.sort((a, b) => b.monto - a.monto);
    const top = arr.slice(0, nT);
    return {
      k: kk,
      titulo: kk === 0 ? 'Esta semana' : etiquetaSem(c, kk, true),
      total: t,
      urgente: urg,
      hoy: kk === 0 ? hoy : '',
      top,
      mas: arr.length > nT ? { n: arr.length - nT, monto: top.reduce((s, x) => s - x.monto, t) } : null,
    };
  });
}

// ── Matrices por proveedor y por artículo ──
/** _planSemFiltrarProvs. */
export function filtrarProvs(S: Sem, q: string, prov: string): GrupoSem[] {
  const t = q.trim().toLowerCase();
  return S.provs.filter((g) => {
    if (prov && g.key !== prov) return false;
    return (
      !t ||
      g.nombre.toLowerCase().includes(t) ||
      g.rows.some((r: X) => r.nombre.toLowerCase().includes(t) || String(r.sku).toLowerCase().includes(t))
    );
  });
}
/** ?prov= que ya no existe se ignora (el viejo lo limpiaba en _planSemCalc). */
export const provValido = (S: Sem, prov: string | undefined) =>
  prov && S.provs.some((g) => g.key === prov) ? prov : '';
/** Opciones del filtro de proveedor: los incluidos, por nombre; lo que no es local lleva su categoría. */
export const provOpciones = (S: Sem): [string, string][] =>
  S.provs
    .slice()
    .sort((a, b) => a.nombre.localeCompare(b.nombre))
    .map((g) => [
      g.key,
      g.nombre + (g.cat !== 'local' ? ` (${PSEM_CATS.find((d) => d.id === g.cat)!.nombre})` : ''),
    ]);
/** _planSemTablaProvsHtml: por categoría incluida, sus proveedores con el dinero de cada semana y los totales. */
export function tablaProvs(S: Sem, inc: Inc, Wv: number, q: string, prov: string) {
  const filtrados = filtrarProvs(S, q, prov),
    tot = new Array(Wv).fill(0),
    totSC = new Array(Wv).fill(0);
  let gran = 0,
    nProv = 0;
  const cats = PSEM_CATS.filter((d) => inc[d.id])
    .map((d) => {
      const provs = filtrados.filter((g) => g.cat === d.id);
      const sub = new Array(Wv).fill(0);
      const filas = provs.map((g) => {
        nProv++;
        let tg = 0,
          sc = 0;
        for (let k = 0; k < Wv; k++) {
          tg += g.monto[k];
          sc += g.sinCosto[k];
          tot[k] += g.monto[k];
          totSC[k] += g.sinCosto[k];
          sub[k] += g.monto[k];
        }
        gran += tg;
        const conCompra = g.rows
          .filter((r: X) => r.sem.slice(0, Wv).some((x: number) => x > 0))
          .sort(
            (a: X, b: X) =>
              (a.fechaLimite || '9').localeCompare(b.fechaLimite || '9') || a.nombre.localeCompare(b.nombre),
          );
        return { g, total: tg, sinCosto: sc, conCompra };
      });
      return { def: d, filas, sub, subT: sub.reduce((a, b) => a + b, 0) };
    })
    .filter((x) => x.filas.length);
  return { cats, tot, totSC, gran, nProv };
}
/** _planSemTablaArtsHtml: artículos con compra en las semanas que se ven, del primer pedido al último. */
export function tablaArts(S: Sem, Wv: number, q: string, prov: string) {
  const t = q.trim().toLowerCase(),
    out: { r: X; g: GrupoSem; llega: string | null }[] = [];
  filtrarProvs(S, q, prov).forEach((g) =>
    g.rows.forEach((r: X) => {
      if (!r.sem.slice(0, Wv).some((x: number) => x > 0)) return;
      if (
        t &&
        !(
          r.nombre.toLowerCase().includes(t) ||
          String(r.sku).toLowerCase().includes(t) ||
          g.nombre.toLowerCase().includes(t)
        )
      )
        return;
      const llega = r.llega
        ? r.llega
        : r.fechaLimite === null || r.fechaLimite === undefined
          ? null
          : planEngDia(r.fechaLimite, r.s.lt);
      out.push({ r, g, llega });
    }),
  );
  return out.sort(
    (a, b) =>
      (a.r.fechaLimite || '9').localeCompare(b.r.fechaLimite || '9') || a.r.nombre.localeCompare(b.r.nombre),
  );
}

// ── Seguimiento de ventas (_planSemSeguimientoHtml 35183) ──
export function seguimientoSem(bt: X) {
  if (!bt || !bt.n) return { estado: 'apagado' as const };
  const sem = bt.semanas.filter((s: X) => s.n > 0);
  if (!sem.length) return { estado: 'sin-historia' as const };
  let mx = 1;
  sem.forEach((s: X) => (mx = Math.max(mx, s.proy, s.real)));
  // Alerta: las 2 semanas COMPLETAS más recientes con proyección (la semana en curso incluye hoy, todavía incompleto)
  const rec = sem.filter((s: X) => s.j >= 2).slice(0, 2);
  let alerta: { dir: 'arriba' | 'abajo'; pct: number } | null = null;
  if (rec.length === 2 && rec[0].desv !== null && rec[1].desv !== null) {
    const m = (rec[0].desv + rec[1].desv) / 2;
    if (m > 0.15) alerta = { dir: 'arriba', pct: m * 100 };
    else if (m < -0.15) alerta = { dir: 'abajo', pct: -m * 100 };
  }
  const arts = bt.arts
    .filter((a: X) => a.valor !== null && a.n >= 2)
    .sort((a: X, b: X) => Math.abs(b.valor) - Math.abs(a.valor))
    .slice(0, 8);
  return {
    estado: 'ok' as const,
    semanas: sem as X[],
    mx,
    alerta,
    arts: arts as X[],
    sinMonto: bt.comprasSinMonto as number,
    mostradas: sem.length,
    configuradas: bt.n as number,
  };
}
/** Diferencia en porcentaje con signo ('+12%', '−'): pct de _planSemSeguimientoHtml. */
export const pctSeg = (x: number | null) => (x === null ? '—' : (x > 0 ? '+' : '') + nf(x * 100) + '%');
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (12). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/planAbastos.ts tests/portal/com-plan-abastos.test.ts
git commit -m "feat(comercializadora): cifras, gráfica, matrices y seguimiento del Plan de abastos"
```

---

### Task 7: Pantalla Plan de abastos

**Files:**
- Create: `components/comercializadora/fila-plegable.tsx`, `components/comercializadora/copiar-texto.tsx` (la Tarea 9 también los usa)
- Create: `components/comercializadora/plan-abastos.tsx`, `app/(comercializadora)/comercializadora/plan-abastos/page.tsx`
- Modify: `components/portal/navegacion.tsx` (Plan de abastos; la Tarea 9 agrega Esta semana)
- Test: `tests/portal/com-plan-abastos-pantalla.test.tsx`

**Interfaces:**
- Consumes: Tarea 6 (todo `planAbastos.ts`); `planLocalMotor` (Tarea 1); `cafeOrdenesMotor`, `importacionesMotor`, `motorPlan` (3d/3e); `ocGrupoSem`, `enlaceOc`, `PrellenadoOc` (Tarea 4); `libroPlanAbastos` (Tarea 5); `DescargarExcel`, `CifraPlan`, `SeccionPlan`, `hrefPlan` (3e); `ActualizarMotor` (3d).
- Produces:
  - `FilaPlegable({ etiqueta, titulo, celdas, detalle, claseTitulo? })` y `CopiarTexto({ texto, etiqueta, ok })` (client);
  - de `plan-abastos.tsx`, para la Tarea 9: `EtiquetaCat({ cat })` y `AvisosPlanSem({ fuente, lecturas, simple })`;
  - de `plan-abastos.tsx`, para esta pantalla: `RUTA_PLAN`, `TarjetasCategorias`, `CifrasSem`, `FamiliasSem`, `GraficaSem`, `QueTrae`, `BarraSem`, `TablaProvsSem`, `TablaArtsSem`, `SeguimientoVentas` y `ComoSeLee`.

  La página es server component: calcula todo y solo los dos componentes de cliente reciben nodos y texto.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-plan-abastos-pantalla.test.tsx`:

```tsx
// Plan 3f: pantalla Plan de abastos (categorías, cifras, gráfica, matrices, Crear OC, avisos y navegación).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, acceso: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/plan-abastos',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ actualizarMotor: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: m.acceso }, db: null }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import PlanAbastosPagina from '../../app/(comercializadora)/comercializadora/plan-abastos/page';
import { gruposDe } from '../../components/portal/navegacion';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosSem, SRV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

let carga = 100;
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...datosSem(), ...extra, cargadoEn: ++carga },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string> = {}) =>
  render(await PlanAbastosPagina({ searchParams: Promise.resolve(sp) }));

describe('pantalla Plan de abastos', () => {
  beforeEach(() => {
    limpiarMotor();
    m.acceso = 'edicion';
    m.motor = listo();
  });

  it('tres categorías, cifras, familias, la gráfica y el enlace a Pagos proyectados en lugar de "Pagos por viernes"', async () => {
    await pagina();
    expect(screen.getByRole('heading', { name: 'Plan de abastos' })).toBeTruthy();
    for (const n of ['Todo lo demás', 'Café', 'Importaciones'])
      expect(screen.getByRole('link', { name: `Quitar ${n} del plan` })).toBeTruthy();
    expect(screen.getByText('Dinero para esta semana')).toBeTruthy();
    expect(screen.getByText('Dónde se va el dinero')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Compras por semana y por categoría' })).toBeTruthy();
    expect(screen.getByText('Qué trae cada barra alta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver pagos proyectados' }).getAttribute('href')).toBe(
      '/comercializadora/pagos',
    );
    expect(screen.queryByText('Pagos por viernes')).toBeNull();
    // Vista simple: el detalle va plegado y sin la cifra de "se agotan".
    expect(screen.getByText('Ver detalle por proveedor y artículo')).toBeTruthy();
    expect(screen.queryByText('Se agotan antes de que llegue')).toBeNull();
  });

  it('?sin=imp deja fuera Importaciones del dinero y de la tabla; la tarjeta la vuelve a incluir', async () => {
    await pagina({ sin: 'imp' });
    const t = screen.getByRole('link', { name: 'Incluir Importaciones en el plan' });
    expect(t.getAttribute('href')).toBe('/comercializadora/plan-abastos');
    expect(within(t).getByText('No incluido en el plan')).toBeTruthy();
    expect(screen.queryByText('Total de lo incluido')).toBeTruthy();
    expect(screen.queryByText('Green Packaging (vasos y tapas)')).toBeNull();
  });

  it('por proveedor: Crear OC de lo que toca hoy (nueva=plan) y el detalle por artículo al abrir el renglón', async () => {
    await pagina({ det: '1' });
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.some((a) => /nueva=plan&proveedor=Jarabes\+MX/.test(a.getAttribute('href') ?? ''))).toBe(
      true,
    );
    expect(crear.some((a) => /nueva=importaciones/.test(a.getAttribute('href') ?? ''))).toBe(true);
    expect(screen.queryByText('LOC-JAR-001 · lead time 7 d · $95 c/u')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver los artículos de Jarabes MX' }));
    expect(screen.getByText('LOC-JAR-001 · lead time 7 d · $95 c/u')).toBeTruthy();
    expect(screen.getByText('Se agotan antes de que llegue')).toBeTruthy();
    expect(screen.getByText('Seguimiento de ventas')).toBeTruthy();
  });

  it('solo lectura: sin Crear OC', async () => {
    m.acceso = 'lectura';
    await pagina({ det: '1' });
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('por artículo, con búsqueda: solo lo que coincide, con su categoría', async () => {
    await pagina({ det: '1', vista: 'articulo', q: 'jarabe' });
    const tabla = screen.getByRole('columnheader', { name: 'Primer pedido' }).closest('table')!;
    expect(within(tabla).getByText('Jarabe vainilla 1 L')).toBeTruthy();
    expect(within(tabla).getAllByText('Todo lo demás').length).toBeGreaterThan(0);
    expect(within(tabla).queryByText('Vaso papel 8 oz')).toBeNull();
  });

  it('avisa de dónde salen las cantidades: simulación vigente o cálculo local con el motivo', async () => {
    m.motor = listo({ srv: SRV_SEM });
    const { unmount } = await pagina();
    expect(screen.getByText(/^Cantidades: simulación del servidor/)).toBeTruthy();
    unmount();
    limpiarMotor();
    m.motor = listo({ srv: { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h', compras: [] } });
    await pagina();
    expect(
      screen.getByText(/la simulación del servidor no está disponible \(corrida de hace 40 h\)/),
    ).toBeTruthy();
  });

  it('si Importaciones no se puede calcular, lo local se muestra y la tarjeta dice por qué', async () => {
    m.motor = listo({}, { imp: { orden: [], items: {} } });
    await pagina();
    expect(
      screen.getByText(
        /No hay artículos activos en el plan de importaciones\. No se cuenta en los totales\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Dinero para esta semana')).toBeTruthy();
  });

  it('sin datos del plan (puente caído o base): el error, sin números', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los datos del plan. Intenta de nuevo.' };
    await pagina();
    expect(screen.getByRole('alert').textContent).toBe(
      'No se pudieron leer los datos del plan. Intenta de nuevo.',
    );
    expect(screen.queryByText('Dinero para esta semana')).toBeNull();
  });

  it('plan sin compras: la gráfica lo dice y la tabla también', async () => {
    m.motor = listo({ pedidos: [], cat: [], oc: [] });
    await pagina({ det: '1', sin: 'imp' });
    expect(screen.getByText('Sin compras previstas ni emitidas en este periodo')).toBeTruthy();
    expect(screen.getByText('Sin resultados con estos filtros')).toBeTruthy();
  });

  it('navegación: Plan de abastos encabeza Planear y pagar', () => {
    const g = gruposDe('comercializadora', ['comercializadora']);
    const de = (t: string) => g.find((x) => x.titulo === t)!.enlaces.map((e) => e.href);
    expect(de('Planear y pagar')[0]).toBe('/comercializadora/plan-abastos');
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-plan-abastos-pantalla.test.tsx`
Expected: FAIL. `Failed to resolve import "../../app/(comercializadora)/comercializadora/plan-abastos/page"`.

- [ ] **Step 3: Implementación**

Crear `components/comercializadora/fila-plegable.tsx` (`_planSemToggle`/`_hoyToggle`):

```tsx
'use client';
import { useState } from 'react';

/**
 * Renglón de proveedor que se abre para ver sus artículos (_planSemToggle / _hoyToggle). El botón "+/−" lo abre con el
 * teclado; un clic en el renglón también, salvo en sus enlaces y botones (Crear OC, Copiar pedido).
 */
export function FilaPlegable(p: {
  etiqueta: string;
  titulo: React.ReactNode;
  celdas: React.ReactNode;
  detalle: React.ReactNode;
  claseTitulo?: string;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <tr
        className="cursor-pointer hover:bg-surface-2"
        onClick={(e) => {
          if (!(e.target as HTMLElement).closest('a,button')) setAbierto(!abierto);
        }}
      >
        <td className={p.claseTitulo ?? 'sticky left-0 z-[1] bg-surface font-semibold'}>
          <button
            type="button"
            aria-expanded={abierto}
            aria-label={`${abierto ? 'Ocultar' : 'Ver'} los artículos de ${p.etiqueta}`}
            onClick={() => setAbierto(!abierto)}
            className="mr-1 inline-block w-4 text-muted-foreground"
          >
            {abierto ? '−' : '+'}
          </button>
          {p.titulo}
        </td>
        {p.celdas}
      </tr>
      {abierto ? p.detalle : null}
    </>
  );
}
```

Crear `components/comercializadora/copiar-texto.tsx` (`_hoyCopiar`/`_borrCopiar`; decisión 7):

```tsx
'use client';
import { useState } from 'react';

/** "Copiar pedido" / "Copiar folios por borrar" (_hoyCopiar, _borrCopiar): deja el texto en el portapapeles. */
export function CopiarTexto({ texto, etiqueta, ok }: { texto: string; etiqueta: string; ok: string }) {
  const [msj, setMsj] = useState<{ bien: boolean; t: string } | null>(null);
  const mal = () => setMsj({ bien: false, t: 'No se pudo copiar automáticamente' });
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => {
          try {
            if (!navigator.clipboard?.writeText) return mal();
            navigator.clipboard.writeText(texto).then(() => setMsj({ bien: true, t: ok }), mal);
          } catch {
            mal();
          }
        }}
        className="rounded-[10px] border border-line-strong px-3 py-1.5 text-sm font-semibold"
      >
        {etiqueta}
      </button>
      {msj ? (
        <span role={msj.bien ? 'status' : 'alert'} className={`text-xs ${msj.bien ? 'text-ok' : 'text-bad'}`}>
          {msj.t}
        </span>
      ) : null}
    </span>
  );
}
```

Crear `components/comercializadora/plan-abastos.tsx`. Es la parte visual de las funciones `_planSem*`/`_psem*` (39938–40169 y `_planSemCelda`/`_planSemSeguimientoHtml` del primer bloque):

```tsx
import Link from 'next/link';
import { claseCampo } from '@/lib/crm/formato';
import { enlaceOc, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { dinero, nf } from '@/lib/comercializadora/importaciones';
import {
  COLOR_CAT,
  dineroCorto,
  etiquetaSem,
  fechaCorta,
  pctSeg,
  PSEM_CATS,
  sinCon,
  type PlanProv,
  type familiasSem,
  type graficaSem,
  type Inc,
  type kpisSem,
  type queTrae,
  type seguimientoSem,
  type tablaArts,
  type tablaProvs,
  type tarjetasCat,
} from '@/lib/comercializadora/planAbastos';
import { CifraPlan, hrefPlan, SeccionPlan } from './vistas-plan';
import { FilaPlegable } from './fila-plegable';

export const RUTA_PLAN = '/comercializadora/plan-abastos';
type Params = Record<string, string | undefined>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const numero = 'text-right tabular-nums whitespace-nowrap';
const guion = <span className="text-muted-foreground">—</span>;

/** Etiqueta de categoría (_psemTag). */
export function EtiquetaCat({ cat }: { cat: keyof typeof COLOR_CAT }) {
  const nombre = PSEM_CATS.find((d) => d.id === cat)?.nombre;
  return (
    <span
      className="ml-1.5 inline-block rounded-full px-2 py-0.5 align-[1px] text-[10px] font-bold text-white"
      style={{ background: COLOR_CAT[cat] }}
    >
      {nombre}
    </span>
  );
}

/** Aviso de la fuente de las cantidades (servidor o cálculo local) y de lo que no se pudo leer. */
export function AvisosPlanSem(p: {
  fuente: { tono: 'ok' | 'warn'; texto: string; extra: string[] } | null;
  lecturas: string[];
  simple: boolean;
}) {
  return (
    <>
      {p.fuente ? (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${p.fuente.tono === 'ok' ? 'bg-surface-2 text-ink-2' : 'bg-warn-soft text-warn'}`}
        >
          {p.fuente.texto}
          {!p.simple && p.fuente.extra.length ? ` ${p.fuente.extra.join(' ')}` : null}
        </p>
      ) : null}
      {p.lecturas.length ? (
        <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          No se pudieron leer: {p.lecturas.join(', ')}. El cálculo puede salir distinto.
        </p>
      ) : null}
    </>
  );
}

/** _planSemCategoriasHtml: una tarjeta por categoría; un clic la quita o la incluye en el dinero a disponer (?sin=). */
export function TarjetasCategorias(p: {
  tarjetas: ReturnType<typeof tarjetasCat>;
  inc: Inc;
  Wv: number;
  simple: boolean;
  params: Params;
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {p.tarjetas.map((t) => (
        <Link
          key={t.def.id}
          href={hrefPlan(RUTA_PLAN, p.params, { sin: sinCon(p.inc, t.def.id) })}
          aria-label={`${t.on ? 'Quitar' : 'Incluir'} ${t.def.nombre} ${t.on ? 'del' : 'en el'} plan`}
          className={`block rounded-2xl border border-line border-t-4 p-4 shadow-card ${t.on ? 'bg-surface' : 'bg-surface-2 opacity-70'}`}
          style={{ borderTopColor: t.on ? COLOR_CAT[t.def.id] : undefined }}
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span aria-hidden="true">{t.on ? '☑' : '☐'}</span>
            {t.def.nombre}
            {p.simple ? null : <span className="text-xs font-normal text-muted-foreground">{t.def.sub}</span>}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{dinero(t.total)}</p>
          <p className="text-xs text-ink-2">
            {p.simple ? null : `en las próximas ${p.Wv} semanas · `}
            {t.arts} {t.arts === 1 ? 'artículo' : 'artículos'}
            {p.simple ? null : ` · ${t.provs} ${t.provs === 1 ? 'proveedor' : 'proveedores'}`}
            <br />
            Esta semana <b>{dinero(t.esta)}</b>
            {p.simple ? null : (
              <>
                {' '}
                · próximas {t.k4} semanas <b>{dinero(t.prox4)}</b>
              </>
            )}
          </p>
          {t.aviso ? (
            <p className={`mt-1 text-xs ${t.error ? 'text-bad' : 'text-warn'}`}>
              {t.aviso}
              {t.error ? ' No se cuenta en los totales.' : ''}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {t.on ? 'Incluido en el plan' : 'No incluido en el plan'}
          </p>
        </Link>
      ))}
    </div>
  );
}

/** _planSemKpisHtml. */
export function CifrasSem(p: { k: ReturnType<typeof kpisSem>; c: PlanProv; Wv: number; simple: boolean }) {
  const { k } = p;
  if (k.ninguna)
    return (
      <div className="mb-4 flex">
        <CifraPlan etiqueta="Compras incluidas" valor="Ninguna" nota="Marca arriba al menos una categoría" />
      </div>
    );
  const des = (d: { def: { id: keyof typeof COLOR_CAT; nombre: string }; monto: number }[]) =>
    d.length ? (
      <span className="block">
        {d.map((x, i) => (
          <span key={x.def.id}>
            {i ? ' · ' : ''}
            {x.def.nombre} <b>{dineroCorto(x.monto)}</b>
          </span>
        ))}
      </span>
    ) : null;
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta="Dinero para esta semana"
        valor={dinero(k.esta.monto)}
        tono="pierde"
        nota={
          <>
            {k.esta.n} {k.esta.n === 1 ? 'artículo' : 'artículos'}
            {k.esta.sinCosto ? ` · ${k.esta.sinCosto} sin costo` : ''}
            {des(k.esta.des)}
          </>
        }
      />
      <CifraPlan
        etiqueta={`Próximas ${k.k4} semanas`}
        valor={dinero(k.prox.monto)}
        tono="bajo"
        nota={
          <>
            {k.prox.sinCosto ? `${k.prox.sinCosto} líneas sin costo` : ''}
            {des(k.prox.des)}
          </>
        }
      />
      <CifraPlan
        etiqueta={`Total de ${p.Wv} semanas`}
        valor={dinero(k.total.monto)}
        nota={
          <>
            {k.total.pico > 0
              ? `Semana de mayor compra: ${etiquetaSem(p.c, k.total.kp, true)} (${dinero(k.total.pico)})`
              : 'sin compras en el horizonte'}
            {des(k.total.des)}
          </>
        }
      />
      {p.simple ? null : (
        <CifraPlan
          etiqueta="Se agotan antes de que llegue"
          valor={nf(k.rot)}
          ayuda="Se agotan antes de que pueda llegar un pedido hecho hoy: ya vas tarde en esos artículos"
          nota='artículos que ya van tarde (inventario + OC no alcanza el lead time; en importaciones, "ya va tarde")'
        />
      )}
    </div>
  );
}

/** _psemFamiliasHtml. */
export function FamiliasSem({ f, Wv }: { f: NonNullable<ReturnType<typeof familiasSem>>; Wv: number }) {
  return (
    <SeccionPlan titulo="Dónde se va el dinero" ayuda={`Próximas ${Wv} semanas · ${dinero(f.tot)}`}>
      <ul className="grid gap-2 text-sm">
        {f.lista.map((F) => (
          <li
            key={F.nombre}
            className="grid grid-cols-[88px_minmax(0,1fr)_104px] items-center gap-x-3 gap-y-1 md:grid-cols-[96px_minmax(80px,1fr)_118px_minmax(120px,1.3fr)]"
          >
            <span className="font-semibold">{F.nombre}</span>
            <span className="h-3 overflow-hidden rounded-md bg-surface-2">
              <i className="block h-full rounded-md bg-ink-2" style={{ width: `${F.ancho}%` }} />
            </span>
            <span className="whitespace-nowrap font-bold tabular-nums">
              {dineroCorto(F.monto)} <span className="font-normal text-muted-foreground">{F.pct}%</span>
            </span>
            <span className="col-span-full truncate text-xs text-ink-2 md:col-span-1" title={F.provs}>
              {F.provs}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Jarabes, polvos, tisanas, desechables y café = <b>{f.cinco}%</b> de lo que se planea comprar.
      </p>
    </SeccionPlan>
  );
}

/**
 * _planSemGraficaComprasHtml: barras apiladas por categoría (claras = OCs ya emitidas, fuertes = plan), con 2 px de
 * superficie entre segmentos, leyenda siempre y el detalle de cada barra al pasar el cursor (title).
 */
export function GraficaSem(p: {
  g: ReturnType<typeof graficaSem>;
  cats: { id: keyof typeof COLOR_CAT; nombre: string }[];
  simple: boolean;
}) {
  const { g } = p,
    n = g.barras.length,
    max = g.vacio ? 1 : g.max;
  const Wd = 900,
    Hd = 240,
    ml = 58,
    mr = 10,
    mt = 16,
    mb = 36,
    bw = (Wd - ml - mr) / Math.max(1, n),
    ph = Hd - mt - mb;
  const y = (v: number) => mt + ph - (v / max) * ph;
  const xs = ml + g.np * bw;
  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="Compras por semana y por categoría"
          className="block h-auto w-full"
          style={{ minWidth: Math.max(560, n * 38) }}
        >
          {(g.vacio ? [0] : [0, 0.5, 1]).map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(max * f)}
                y2={y(max * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(max * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {g.vacio ? '$0' : dineroCorto(max * f)}
              </text>
            </g>
          ))}
          {g.vacio ? (
            <text
              x={Wd / 2}
              y={mt + ph / 2}
              textAnchor="middle"
              fontSize="12"
              style={{ fill: 'var(--color-muted-foreground)' }}
            >
              Sin compras previstas ni emitidas en este periodo
            </text>
          ) : null}
          {g.barras.map((b, i) => {
            const x = ml + i * bw + bw * 0.19,
              w = bw * 0.62;
            let base = mt + ph;
            return (
              <g key={i}>
                <title>{b.tip}</title>
                <rect x={ml + i * bw} y={mt} width={bw} height={ph} fill="transparent" />
                {b.seg.map((s) => {
                  if (!(s.v > 0)) return null;
                  const h = Math.max(1.5, (s.v / max) * ph);
                  base -= h;
                  return (
                    <rect
                      key={s.def.id}
                      x={x}
                      y={base}
                      width={w}
                      height={Math.max(0.5, h - 2)}
                      rx="2"
                      style={{ fill: COLOR_CAT[s.def.id], opacity: b.tipo === 'pas' ? 0.4 : 1 }}
                    />
                  );
                })}
                {b.tot > 0 && bw >= 40 ? (
                  <text
                    x={x + w / 2}
                    y={base - 4}
                    textAnchor="middle"
                    fontSize="9.5"
                    style={{ fill: 'var(--color-ink-2)' }}
                  >
                    {dineroCorto(b.tot)}
                  </text>
                ) : null}
                {bw >= 30 || i % 2 === 0 ? (
                  <text
                    x={x + w / 2}
                    y={Hd - 20}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight={b.k === 0 ? 700 : 400}
                    style={{ fill: 'var(--color-muted-foreground)' }}
                  >
                    {b.etiqueta}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            x1={xs}
            x2={xs}
            y1={mt}
            y2={mt + ph}
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeDasharray="2 3"
          />
          <text
            x={xs - 6}
            y={Hd - 4}
            textAnchor="end"
            fontSize="10"
            style={{ fill: 'var(--color-muted-foreground)' }}
          >
            compras ya emitidas
          </text>
          <text x={xs + 6} y={Hd - 4} fontSize="10" style={{ fill: 'var(--color-muted-foreground)' }}>
            plan de compra
          </text>
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {p.cats.map((d) => (
          <span key={d.id}>
            <i
              className="mr-1 inline-block size-2.5 rounded-sm align-[-1px]"
              style={{ background: COLOR_CAT[d.id] }}
            />
            {d.nombre}
          </span>
        ))}
        <span className="text-muted-foreground">
          {p.simple
            ? 'Claras = OCs ya emitidas · fuertes = lo que toca comprar'
            : `Barras claras = OCs ya emitidas; barras fuertes = lo que toca comprar. Cada pedido se cuenta completo en la semana en que se hace${g.contenedor ? ` (un contenedor de importación son unos ${dineroCorto(g.contenedor)} de una vez)` : ''}${g.sinMonto ? ` · ${g.sinMonto} OC sin monto capturado no se grafican` : ''}`}
        </span>
      </p>
    </div>
  );
}

/** _psemQueTrae. */
export function QueTrae({ q, simple }: { q: ReturnType<typeof queTrae>; simple: boolean }) {
  if (!q.length) return null;
  return (
    <div className="mt-3 grid gap-1.5 border-t border-line pt-3 text-xs text-ink-2">
      <p className="font-bold text-ink">Qué trae cada barra alta</p>
      {q.map((x) => (
        <p key={x.k}>
          <b className="text-ink">
            {x.titulo} · {dineroCorto(x.total)}
          </b>
          {x.urgente > 0 ? (
            <span className="ml-1 font-bold text-bad">{dineroCorto(x.urgente)} ya va tarde</span>
          ) : null}
          {x.hoy ? ` · ${x.hoy}` : null}
          <br />
          {x.top.map((t, i) => (
            <span key={i}>
              {i ? ' · ' : ''}
              {t.nombre} <b>{dineroCorto(t.monto)}</b>
              {t.urg ? <span className="ml-1 font-bold text-bad">urgente</span> : null}
            </span>
          ))}
          {x.mas ? (
            <>
              {' '}
              · y {x.mas.n} más <b>{dineroCorto(x.mas.monto)}</b>
            </>
          ) : null}
        </p>
      ))}
      {simple ? null : (
        <p className="text-muted-foreground">
          &quot;Ya va tarde&quot; = el modelo cree que se agota antes de que pueda llegar un pedido hecho hoy.
          Si el inventario o las OCs no están al día (ver &quot;Datos del plan&quot; en Indicadores), estas
          barras salen infladas.
        </p>
      )}
    </div>
  );
}

/** _planSemToolbarHtml: vista, búsqueda, proveedor y semanas (GET, conserva los demás parámetros). */
export function BarraSem(p: {
  params: Params;
  vista: 'proveedor' | 'articulo';
  q: string;
  prov: string;
  Wv: number;
  semanas: number[];
  proveedores: [string, string][];
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <nav aria-label="Vista de la tabla" className="flex gap-1.5">
        {(
          [
            ['proveedor', 'Por proveedor'],
            ['articulo', 'Por artículo'],
          ] as const
        ).map(([v, t]) => (
          <Link
            key={v}
            href={hrefPlan(RUTA_PLAN, p.params, { vista: v === 'proveedor' ? undefined : v })}
            aria-current={p.vista === v ? 'page' : undefined}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.vista === v ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
          >
            {t}
          </Link>
        ))}
      </nav>
      <form action={RUTA_PLAN} className="flex flex-1 flex-wrap items-center gap-2">
        {['det', 'sin', 'vista'].map((k) =>
          p.params[k] ? <input key={k} type="hidden" name={k} value={p.params[k]} /> : null,
        )}
        <input
          name="q"
          defaultValue={p.q}
          aria-label="Buscar"
          placeholder="Buscar proveedor, artículo o SKU..."
          className={`${claseCampo} min-w-44 flex-1`}
        />
        <select name="prov" defaultValue={p.prov} aria-label="Proveedor" className={`${claseCampo} max-w-64`}>
          <option value="">Todos los proveedores</option>
          {p.proveedores.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="sem"
          defaultValue={String(p.Wv)}
          aria-label="Semanas"
          className={`${claseCampo} max-w-36`}
        >
          {p.semanas.map((n) => (
            <option key={n} value={n}>
              {n} semanas
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>
    </div>
  );
}

/** _planSemCelda: monto de un proveedor en una semana, con "sin costo" y "bajo mínimo". */
function CeldaSem({
  v,
  sinCosto,
  k,
  minimo,
  uds,
}: {
  v: number;
  sinCosto: number;
  k: number;
  minimo: number;
  uds: number;
}) {
  // "bajo mínimo" solo se afirma cuando todos los artículos de la celda tienen costo: con costos faltantes el monto es parcial
  const bajo = minimo > 0 && v > 0 && v < minimo && !sinCosto;
  return (
    <td className={`${numero} ${k === 0 && (v > 0 || sinCosto) ? 'bg-bad-soft' : ''}`}>
      {v > 0 ? (
        <span title={uds ? `${nf(uds)} piezas` : undefined} className={k === 0 ? 'font-bold' : 'font-medium'}>
          {dinero(v)}
        </span>
      ) : sinCosto ? (
        <span className="text-xs text-warn">sin costo</span>
      ) : (
        guion
      )}
      {v > 0 && sinCosto ? (
        <span
          className="block text-[10px] text-warn"
          title={`El monto no incluye ${sinCosto} ${sinCosto === 1 ? 'artículo' : 'artículos'} sin costo capturado: el total real es mayor`}
        >
          +{sinCosto} sin costo
        </span>
      ) : null}
      {bajo ? (
        <span
          className="block text-[10px] text-warn"
          title={`Menor al mínimo de compra del proveedor (${dinero(minimo)})`}
        >
          bajo mínimo
        </span>
      ) : null}
    </td>
  );
}

const cabSemanas = (c: PlanProv, Wv: number) =>
  Array.from({ length: Wv }, (_, k) => (
    <th key={k} className={numero} title={etiquetaSem(c, k, true)}>
      {k === 0 ? <b>Hoy</b> : fechaCorta(c.semIni[k])}
    </th>
  ));

/** _planSemTablaProvsHtml: categorías → proveedores → artículos × semanas, con "Crear OC" de lo que toca hoy. */
export function TablaProvsSem(p: {
  t: ReturnType<typeof tablaProvs>;
  c: PlanProv;
  Wv: number;
  /** "Crear OC" por grupo (solo con permiso de edición y si toca pedir hoy). */
  ocs: Record<string, PrellenadoOc | { error: string }>;
  hayCategorias: boolean;
}) {
  const { t, c, Wv } = p;
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {t.nProv} {t.nProv === 1 ? 'proveedor' : 'proveedores'} · clic en un proveedor para ver el detalle ·
        cada columna es una semana de {c.P} días (&quot;Hoy&quot; = lo que toca pedir ahora; el resto es lo
        que se prevé pedir). Los montos no incluyen artículos sin costo capturado (se avisa en cada celda).
      </p>
      <div className="placa overflow-x-auto">
        <table className="tabla text-xs" style={{ minWidth: 380 + Wv * 84 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-surface">Proveedor</th>
              {cabSemanas(c, Wv)}
              <th className={numero}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!t.nProv ? (
              <tr>
                <td colSpan={Wv + 3} className="py-6 text-center text-ink-2">
                  {p.hayCategorias
                    ? 'Sin resultados con estos filtros'
                    : 'Marca arriba al menos una categoría para ver sus compras'}
                </td>
              </tr>
            ) : (
              <>
                {t.cats.map((cat) => [
                  <tr key={cat.def.id} className="bg-surface-2 font-bold">
                    <td className="sticky left-0 z-[1] bg-surface-2">
                      <span
                        className="mr-2 inline-block size-2.5 rounded-sm"
                        style={{ background: COLOR_CAT[cat.def.id] }}
                      />
                      {cat.def.nombre}{' '}
                      <span className="text-[10.5px] font-normal text-muted-foreground">
                        {cat.filas.length} {cat.filas.length === 1 ? 'proveedor' : 'proveedores'}
                      </span>
                    </td>
                    {cat.sub.map((v, k) => (
                      <td key={k} className={numero}>
                        {v > 0 ? dinero(v) : guion}
                      </td>
                    ))}
                    <td className={numero}>{dinero(cat.subT)}</td>
                    <td />
                  </tr>,
                  ...cat.filas.map(({ g, total, sinCosto, conCompra }) => {
                    const oc = p.ocs[g.key];
                    return (
                      <FilaPlegable
                        key={g.key}
                        etiqueta={g.nombre}
                        titulo={
                          <>
                            {g.nombre}
                            {g.minimo > 0 ? (
                              <span
                                className="ml-1 text-[10px] font-normal text-muted-foreground"
                                title="Mínimo de compra capturado"
                              >
                                mín. {dinero(g.minimo)}
                              </span>
                            ) : null}{' '}
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {conCompra.length} art.
                            </span>
                          </>
                        }
                        celdas={
                          <>
                            {Array.from({ length: Wv }, (_, k) => (
                              <CeldaSem
                                key={k}
                                v={g.monto[k]}
                                sinCosto={g.sinCosto[k]}
                                k={k}
                                minimo={g.minimo}
                                uds={g.uds[k]}
                              />
                            ))}
                            <td className={`${numero} font-bold`}>
                              {total > 0 ? dinero(total) : '—'}
                              {sinCosto > 0 ? (
                                <span
                                  className="block text-[10px] font-normal text-warn"
                                  title="El total no incluye artículos sin costo capturado"
                                >
                                  +{sinCosto} sin costo
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap text-right">
                              {oc && !('error' in oc) ? (
                                <Link
                                  href={enlaceOc(oc)}
                                  title="Abre una orden de compra con lo que toca pedir hoy a este proveedor"
                                  className="rounded-[10px] bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Crear OC
                                </Link>
                              ) : oc ? (
                                <span className="text-[10.5px] text-muted-foreground">{oc.error}</span>
                              ) : null}
                            </td>
                          </>
                        }
                        detalle={conCompra.map((r: X) => (
                          <tr key={g.key + '|' + r.sku} className="bg-surface-2">
                            <td className="sticky left-0 z-[1] bg-surface-2 pl-8">
                              {r.nombre}
                              <span className="block text-[10px] text-muted-foreground">
                                {r.contenedor
                                  ? `plan de contenedores · se coloca ${fechaCorta(r.fechaLimite)}${r.llega ? ` · llega ${fechaCorta(r.llega)}` : ''}`
                                  : `${r.sku} · lead time ${r.s.lt} d${r.costo > 0 ? ` · ${dinero(r.costo)} c/u` : ' · sin costo'}`}
                              </span>
                            </td>
                            {Array.from({ length: Wv }, (_, k) => (
                              <td
                                key={k}
                                className={`${numero} ${k === 0 && r.sem[k] > 0 ? 'bg-bad-soft font-bold' : ''}`}
                              >
                                {r.sem[k] > 0 ? nf(r.sem[k]) : guion}
                              </td>
                            ))}
                            <td className={numero}>
                              {nf(r.sem.slice(0, Wv).reduce((a: number, b: number) => a + b, 0))}{' '}
                              {r.contenedor ? 'cont.' : 'pzas'}
                            </td>
                            <td />
                          </tr>
                        ))}
                      />
                    );
                  }),
                ])}
                <tr className="border-t-2 border-line font-bold">
                  <td className="sticky left-0 z-[1] bg-surface">Total de lo incluido</td>
                  {t.tot.map((v, k) => (
                    <td key={k} className={numero}>
                      {v > 0 ? dinero(v) : '—'}
                      {t.totSC[k] ? (
                        <span className="block text-[10px] font-normal text-warn">
                          +{t.totSC[k]} sin costo
                        </span>
                      ) : null}
                    </td>
                  ))}
                  <td className={numero}>{dinero(t.gran)}</td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** _planSemTablaArtsHtml. */
export function TablaArtsSem({
  filas,
  c,
  Wv,
}: {
  filas: ReturnType<typeof tablaArts>;
  c: PlanProv;
  Wv: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {filas.length} {filas.length === 1 ? 'artículo' : 'artículos'} con compra prevista en las próximas{' '}
        {Wv} semanas (piezas por semana).
      </p>
      <div className="placa overflow-x-auto">
        <table className="tabla text-xs" style={{ minWidth: 800 + Wv * 70 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-surface">Artículo</th>
              <th className={numero} title="Inventario base + OC abiertas">
                Disponible
              </th>
              <th className={numero} title="Consumo diario esperado">
                Consumo/día
              </th>
              <th className={numero} title="Venta regular al mes">
                Venta al mes
              </th>
              <th className={numero}>Lead time</th>
              <th className={numero} title="Fecha del primer pedido del calendario (Hoy = ya toca pedir)">
                Primer pedido
              </th>
              <th className={numero} title="Cuándo llegaría ese primer pedido">
                Llegaría
              </th>
              {cabSemanas(c, Wv)}
              <th className={numero}>Total pzas</th>
              <th className={numero}>$ total</th>
            </tr>
          </thead>
          <tbody>
            {!filas.length ? (
              <tr>
                <td colSpan={Wv + 9} className="py-6 text-center text-ink-2">
                  Sin resultados con estos filtros
                </td>
              </tr>
            ) : (
              filas.map(({ r, g, llega }) => {
                const imp = !!r.imp;
                let tq = 0,
                  tm = 0;
                for (let k = 0; k < Wv; k++) {
                  tq += r.sem[k];
                  if (r.costo > 0) tm += r.sem[k] * r.costo;
                }
                return (
                  <tr key={g.key + '|' + r.sku}>
                    <td className="sticky left-0 z-[1] bg-surface">
                      <span className="font-medium">{r.nombre}</span>
                      <EtiquetaCat cat={g.cat} />
                      {!imp && r.calc.urgencia === 'Urgente' ? (
                        <span className="ml-1 font-bold text-bad">Urgente</span>
                      ) : null}
                      <span className="block text-[10px] text-muted-foreground">
                        {r.sku} · {r.provNombre}
                      </span>
                    </td>
                    <td className={`${numero} ${!imp && r.calc.disponible < 0 ? 'text-bad' : ''}`}>
                      {imp ? guion : nf(r.calc.disponible)}
                    </td>
                    <td className={numero}>
                      {!imp && r.calc.consumo > 0
                        ? nf(r.calc.consumo, 1)
                        : imp && r.ventaMes > 0
                          ? nf(r.ventaMes / 30, 1)
                          : '—'}
                    </td>
                    <td className={numero}>
                      {imp
                        ? r.ventaMes > 0
                          ? nf(r.ventaMes)
                          : '—'
                        : r.calc.tasa > 0
                          ? nf(r.calc.tasa * 30)
                          : '—'}
                    </td>
                    <td className={numero}>{r.s.lt ? `${r.s.lt} d` : '—'}</td>
                    <td className={numero}>
                      {r.fechaLimite == null ? (
                        '—'
                      ) : r.fechaLimite <= c.hoyIso ? (
                        <b>Hoy</b>
                      ) : (
                        fechaCorta(r.fechaLimite)
                      )}
                    </td>
                    <td className={`${numero} text-ink-2`}>{llega ? fechaCorta(llega) : '—'}</td>
                    {Array.from({ length: Wv }, (_, k) => (
                      <td
                        key={k}
                        className={`${numero} ${k === 0 && r.sem[k] > 0 ? 'bg-bad-soft font-bold' : ''}`}
                      >
                        {r.sem[k] > 0 ? nf(r.sem[k]) : guion}
                      </td>
                    ))}
                    <td className={`${numero} font-bold`}>{nf(tq)}</td>
                    <td className={numero}>
                      {r.costo > 0 ? dinero(tm) : <span className="text-warn">sin costo</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** _planSemSeguimientoHtml: lo proyectado frente a lo vendido, con la alerta de las dos últimas semanas completas. */
export function SeguimientoVentas({ s }: { s: ReturnType<typeof seguimientoSem> }) {
  if (s.estado === 'apagado')
    return (
      <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted-foreground">
        Seguimiento de ventas apagado: actívalo en Configuración &gt; Compras (semanas de seguimiento).
      </p>
    );
  if (s.estado === 'sin-historia')
    return (
      <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted-foreground">
        Todavía no hay historia suficiente para comparar lo proyectado con lo vendido (se necesitan al menos
        14 días antes de cada semana).
      </p>
    );
  const tono = (d: number | null) =>
    d === null
      ? 'text-muted-foreground'
      : Math.abs(d) <= 0.1
        ? 'text-ok'
        : d > 0
          ? 'text-warn'
          : 'text-crema-strong';
  return (
    <SeccionPlan
      titulo="Seguimiento de ventas"
      ayuda={`Cada semana pasada: lo que el modelo habría proyectado con la historia anterior (venta valuada a costo) contra lo realmente vendido. Si lo real se aleja de lo proyectado, el plan lo va absorbiendo solo; aquí ves cuánto y en qué artículos.${s.sinMonto > 0 ? ` · ${s.sinMonto} OC locales sin monto capturado no se grafican` : ''}${s.mostradas < s.configuradas ? ` · se muestran ${s.mostradas} de las ${s.configuradas} semanas configuradas: las demás no tienen historia suficiente` : ''}`}
    >
      {s.alerta ? (
        <p role="status" className="mb-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs">
          Las ventas de las últimas 2 semanas completas van{' '}
          <b>{`${nf(s.alerta.pct)}% ${s.alerta.dir === 'arriba' ? 'por encima' : 'por debajo'}`}</b> de lo
          proyectado.{' '}
          {s.alerta.dir === 'arriba'
            ? 'El plan ya sube su ritmo conforme entran las ventas; si la tendencia sigue, conviene adelantar compras de los artículos de abajo.'
            : 'El plan ya baja su ritmo; revisa antes de comprar de más los artículos de abajo.'}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        <div className="placa min-w-0 flex-[1_1_280px] overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Semana</th>
                <th className={numero}>Proyectado</th>
                <th className={numero}>Vendido</th>
                <th className={numero}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {s.semanas.map((w) => (
                <tr key={w.j}>
                  <td className="whitespace-nowrap">
                    {fechaCorta(w.ini)} – {fechaCorta(w.fin)}
                    {w.j === 1 ? (
                      <span
                        className="ml-1 text-[10px] text-muted-foreground"
                        title="Incluye hoy, con el día todavía incompleto: no entra en la alerta"
                      >
                        (en curso)
                      </span>
                    ) : null}
                  </td>
                  <td className={numero}>{dinero(w.proy)}</td>
                  <td className={`${numero} font-semibold`}>{dinero(w.real)}</td>
                  <td className={`${numero} font-bold ${tono(w.desv)}`}>{pctSeg(w.desv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.arts.length ? (
          <div className="placa min-w-0 flex-[1_1_280px] overflow-x-auto">
            <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Artículos que más se desvían (piezas, semanas con proyección)
            </p>
            <table className="tabla text-xs">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className={numero}>Proyectado</th>
                  <th className={numero}>Vendido</th>
                  <th className={numero}>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {s.arts.map((a) => (
                  <tr key={a.sku}>
                    <td>
                      {a.nombre}
                      <span className="block text-[10px] text-muted-foreground">{a.sku}</span>
                    </td>
                    <td className={numero}>{nf(a.proy)}</td>
                    <td className={`${numero} font-semibold`}>{nf(a.real)}</td>
                    <td className={`${numero} font-bold ${a.dif > 0 ? 'text-warn' : 'text-crema-strong'}`}>
                      {pctSeg(a.desv)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </SeccionPlan>
  );
}

/** _planSemComoHtml (40159) y _planSegTxt. */
export function ComoSeLee({
  c,
  imp,
}: {
  c: PlanProv;
  imp: { meses_cobertura: number; meses_respaldo: number };
}) {
  const cfg = c.cfg;
  const seg =
    cfg.seg.metodo === 'estadistico'
      ? `lead time + ${cfg.seg.revision} días de revisión + stock de seguridad estadístico (nivel de servicio ${Math.round(cfg.seg.servicio * 1000) / 10}%)`
      : `lead time + ${cfg.seg.dias} días de seguridad`;
  return (
    <details className="mt-4 text-xs leading-relaxed text-ink-2">
      <summary className="cursor-pointer font-semibold text-ink">Cómo se lee este plan</summary>
      <ul className="ml-5 mt-2 grid list-disc gap-1">
        <li>
          <b>Tres categorías</b>, cada una con su método: <b>Todo lo demás</b> y <b>Café</b> usan el cálculo
          del Plan de abasto (venta diaria, lead time y días de seguridad: {seg}); <b>Importaciones</b> usa el
          modelo de contenedores (cada pedido cubre {imp.meses_cobertura} meses más {imp.meses_respaldo} de
          respaldo). Marca o desmarca arriba qué categorías incluir en el dinero a disponer.
        </li>
        <li>
          <b>Hoy</b> es lo que toca pedir ahora. En Todo lo demás y Café las semanas siguientes siguen el
          mismo cálculo; en Importaciones se cuenta el primer pedido de cada producto (en la semana en que hay
          que colocarlo) y los contenedores del plan de embarques que caen dentro de las {c.W} semanas.
        </li>
        <li>
          <b>Se recalcula con las ventas</b>: cada pedido nuevo cambia el consumo y, con él, las semanas. Las
          semanas de {c.P} días se cuentan desde hoy.
        </li>
        <li>
          <b>Los $ de las semanas futuras son una previsión</b>, no un compromiso: lo que toca pedir ahora es
          la columna Hoy. &quot;Bajo mínimo&quot; significa que esa semana sola no alcanza el mínimo de compra
          del proveedor: se puede juntar con la semana siguiente.
        </li>
        <li>
          <b>Compras ya emitidas</b> (barras claras de la gráfica): OCs con monto de las últimas 6 semanas,
          separadas por categoría según sus artículos. Un borrador de Zoho no cuenta. Si faltan, ponlas al día
          con Zoho en Órdenes de compra.
        </li>
      </ul>
    </details>
  );
}
```

Crear `app/(comercializadora)/comercializadora/plan-abastos/page.tsx`. El enlace "Ver lo de esta semana" apunta a la pantalla de la Tarea 9:

```tsx
import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SeccionPlan, hrefPlan } from '@/components/comercializadora/vistas-plan';
import {
  AvisosPlanSem,
  BarraSem,
  CifrasSem,
  ComoSeLee,
  FamiliasSem,
  GraficaSem,
  QueTrae,
  RUTA_PLAN,
  SeguimientoVentas,
  TablaArtsSem,
  TablaProvsSem,
  TarjetasCategorias,
} from '@/components/comercializadora/plan-abastos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import {
  cafeOrdenesMotor,
  importacionesMotor,
  motorPlan,
  planLocalMotor,
} from '@/lib/comercializadora/motor';
import { ocGrupoSem, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { libroPlanAbastos } from '@/lib/comercializadora/excelPlan';
import {
  familiasSem,
  fuenteCant,
  planSemCalc,
  planSemW,
  psemPasadas,
  type FuentesPlan,
  graficaSem,
  hoyTxt,
  incDe,
  kpisSem,
  opcionesSemanas,
  provOpciones,
  provValido,
  PSEM_CATS,
  queTrae,
  seguimientoSem,
  tablaArts,
  tablaProvs,
  tarjetasCat,
  vistaSemDe,
} from '@/lib/comercializadora/planAbastos';

type Sp = Record<string, string | undefined>;

/**
 * Plan de abastos (renderComPlanSemanal): el dinero que hay que disponer cada semana para lo local, el café y las
 * importaciones, de dónde sale y qué proveedor lo pide. Solo lee; "Crear OC" abre Órdenes prellenado.
 */
export default async function PlanAbastosPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1',
    simple = !det;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Plan de abastos"
      descripcion="Cuánto dinero hay que disponer cada semana para comprar lo local, el café y las importaciones, y a qué proveedores."
    >
      <ActualizarMotor />
    </Encabezado>
  );
  if (!m.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {m.error}
        </p>
      </>
    );
  const c = planLocalMotor(m);
  const inc = incDe(sp.sin),
    Wv = planSemW(c, Number(sp.sem) || 0),
    vista = vistaSemDe(sp.vista);
  const f: FuentesPlan = { cafe: null, imp: null };
  const S = planSemCalc(c, inc, Wv, {
    cafe: () => (f.cafe = cafeOrdenesMotor(m)),
    imp: () => (f.imp = importacionesMotor(m, null)),
  });
  const q = sp.q ?? '',
    prov = provValido(S, sp.prov);
  const params: Sp = {
    det: det ? '1' : undefined,
    sin: sp.sin || undefined,
    sem: sp.sem || undefined,
    vista: vista === 'articulo' ? vista : undefined,
    q: q || undefined,
    prov: prov || undefined,
  };
  const pas = psemPasadas(c, m.R),
    hoy = hoyTxt(S, c);
  const ocs: Record<string, PrellenadoOc | { error: string }> = {};
  if (puedeEditarCom(accesos))
    S.provs.forEach((g) => {
      if (g.real && g.n[0] > 0) ocs[g.key] = ocGrupoSem(g, { local: c, cafe: f.cafe, imp: f.imp });
    });
  const fam = familiasSem(S, Wv, m.R.cat);
  const cats = PSEM_CATS.filter((d) => inc[d.id]);
  const detalle = (
    <>
      <BarraSem
        params={params}
        vista={vista}
        q={q}
        prov={prov}
        Wv={Wv}
        semanas={opcionesSemanas(c)}
        proveedores={provOpciones(S)}
      />
      {vista === 'articulo' ? (
        <TablaArtsSem filas={tablaArts(S, Wv, q, prov)} c={c} Wv={Wv} />
      ) : (
        <TablaProvsSem
          t={tablaProvs(S, inc, Wv, q, prov)}
          c={c}
          Wv={Wv}
          ocs={ocs}
          hayCategorias={cats.length > 0}
        />
      )}
      <div className="mt-4">
        <SeguimientoVentas s={seguimientoSem(c.bt)} />
      </div>
      <ComoSeLee c={c} imp={f.imp?.cfg.imp.politica ?? { meses_cobertura: 0, meses_respaldo: 0 }} />
    </>
  );
  return (
    <>
      {encabezado}
      <AvisosPlanSem fuente={fuenteCant(c, m.R, Date.now())} lecturas={m.R.avisos} simple={simple} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/comercializadora/esta-semana" className="text-sm font-semibold underline">
          Ver lo de esta semana
        </Link>
        <span className="flex-1" />
        <DescargarExcel libro={libroPlanAbastos(S, c, pas, inc)} />
        <Link
          href={hrefPlan(RUTA_PLAN, params, { det: det ? undefined : '1' })}
          className="px-2 py-1.5 text-sm font-semibold underline"
        >
          {det ? 'Vista simple' : 'Ver todo'}
        </Link>
      </div>
      <TarjetasCategorias
        tarjetas={tarjetasCat(S, inc, Wv)}
        inc={inc}
        Wv={Wv}
        simple={simple}
        params={params}
      />
      <CifrasSem k={kpisSem(S, inc, Wv)} c={c} Wv={Wv} simple={simple} />
      {fam ? <FamiliasSem f={fam} Wv={Wv} /> : null}
      <SeccionPlan
        titulo="Compras por semana"
        ayuda={
          <>
            Cuándo sale el dinero (pagos por viernes con los días de crédito):{' '}
            <Link href="/comercializadora/pagos" className="font-semibold underline">
              Ver pagos proyectados
            </Link>
          </>
        }
      >
        <GraficaSem g={graficaSem(S, pas, inc, Wv, c, hoy)} cats={cats} simple={simple} />
        <QueTrae q={queTrae(S, Wv, simple, c, hoy)} simple={simple} />
      </SeccionPlan>
      {simple ? (
        <details className="mb-4" open={!!(params.q || params.prov || params.vista || params.sem)}>
          <summary className="inline-block cursor-pointer rounded-[10px] border border-line px-3 py-1.5 text-sm font-semibold">
            Ver detalle por proveedor y artículo
          </summary>
          <div className="mt-3">{detalle}</div>
        </details>
      ) : (
        detalle
      )}
    </>
  );
}
```

En `components/portal/navegacion.tsx`:
- agregar `CalendarRange` al import de `lucide-react` (después de `Ship`):

  ```tsx
    Ship,
    CalendarRange,
  } from 'lucide-react';
  ```

- y en "Planear y pagar", como primer enlace:

  ```tsx
        { href: '/comercializadora/plan-abastos', nombre: 'Plan de abastos', icono: CalendarRange },
  ```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (10). Además:
- `npm run typecheck` limpio;
- `npx vitest run tests/portal/navegacion.test.tsx` verde;
- prettier limpio sobre los archivos nuevos.

- [ ] **Step 5: Commit**

```bash
git add components/comercializadora/fila-plegable.tsx components/comercializadora/copiar-texto.tsx components/comercializadora/plan-abastos.tsx "app/(comercializadora)/comercializadora/plan-abastos/page.tsx" components/portal/navegacion.tsx tests/portal/com-plan-abastos-pantalla.test.tsx
git commit -m "feat(comercializadora): pantalla Plan de abastos"
```

---

### Task 8: Lo que pinta Esta semana y los días de crédito por proveedor (`estaSemana.ts`)

**Files:**
- Create: `lib/comercializadora/estaSemana.ts`
- Test: `tests/portal/com-esta-semana.test.ts`

**Interfaces:**
- Consumes: Tarea 3 (`hoyGrupos`, `hoyPedidoTexto`, `pagoFecha`, `pagoPedidoFecha`, `pagoPorFecha`, `pagoTxt`, `borrAnalisis`, `borrFuenteZoho`, `ctxFila`, `hoyRiesgos` y sus tipos); `PSEM_CATS`, `GrupoSem`, `Sem` (Tarea 2); `ZohoProveedor` (planProv); `planKey` (planBuild); `nf` (3e).
- Produces (los usa la Tarea 9):
  - re-exporta: `borrAnalisis`, `borrFuenteZoho`, `ctxFila`, `hoyRiesgos` y los tipos `Borrador`, `CtxFila`, `Riesgo`;
  - `semHoyDe(v): 0 | 1` y `creditoProv(g, vendorDe: { local; cafe | null }, zprov) → { dias: number; vendor: string | null }` (decisión 5);
  - `type Credito = (g: GrupoSem) => { dias; vendor }` e `interface FilaSemana { g; monto; n; sinCosto; minimo; bajo; cumple; pago: { iso; txt; dias; vinculado }; items; texto }`;
  - semana: `filasSemana(S, k, c, hoyIso, credito): FilaSemana[]`, `tarjetasSemana(S, k, filas)` y `pagosSemana(filas, k, c, hoyIso, credito) → { f; m; txt }[]`;
  - riesgos y borradores: `riesgosVista(rs, simple)`, `rutaRiesgo(tab)` y `resumenBorradores(lista)`;
  - formatos del detalle: `numDet(x)` y `diasDet(d)`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-esta-semana.test.ts`:

```ts
// Plan 3f: lo que calcula la pantalla Esta semana (crédito por proveedor de Zoho, filas, tarjetas, pagos, riesgos y borradores).
import { describe, expect, it } from 'vitest';
import {
  creditoProv,
  diasDet,
  filasSemana,
  numDet,
  pagosSemana,
  resumenBorradores,
  riesgosVista,
  rutaRiesgo,
  semHoyDe,
  tarjetasSemana,
  type Credito,
} from '../../lib/comercializadora/estaSemana';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc } from '../../supabase/functions/_shared/planSem.ts';
import { borrAnalisis, borrFuenteZoho, hoyRiesgos } from '../../supabase/functions/_shared/planHoy.ts';
import { datosSem, ZPROV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const R = datosSem(),
  cfg = normalizarCfgMotor({});
const c = planLocal(R, cfg),
  cafe = cafeOrdenes(R, cfg),
  imp = impCorrer(R, cfg);
const S = planSemCalc(c, { local: true, cafe: true, imp: true }, 12, { cafe: () => cafe, imp: () => imp });
const credito: Credito = (g) => creditoProv(g, { local: c.vendorDe, cafe: cafe.vendorDe }, R.zprov);

describe('días de crédito por proveedor (decisión 5)', () => {
  const g = (fuente: '' | 'cafe' | 'imp', pk: string, nombre: string) => ({ fuente, pk, nombre });
  it('por el vendor de Zoho del grupo; si no hay, por nombre completo o sin el paréntesis; si no, contado', () => {
    const vd = { local: c.vendorDe, cafe: cafe.vendorDe };
    expect(creditoProv(g('', 'vasos sa', 'Vasos SA'), vd, ZPROV_SEM)).toEqual({ dias: 30, vendor: 'v3' });
    expect(creditoProv(g('', 'polvos y bases', 'Polvos y Bases'), vd, ZPROV_SEM)).toEqual({
      dias: 7,
      vendor: 'v5',
    });
    expect(creditoProv(g('', 'lácteos (refrigerados)', 'Lácteos (refrigerados)'), vd, ZPROV_SEM)).toEqual({
      dias: 45,
      vendor: 'v6',
    });
    expect(creditoProv(g('cafe', 'caficultores omac', 'CAFICULTORES OMAC'), vd, ZPROV_SEM)).toEqual({
      dias: 15,
      vendor: 'v1',
    });
    expect(
      creditoProv(g('imp', 'Green Packaging', 'Green Packaging (vasos y tapas)'), vd, ZPROV_SEM),
    ).toEqual({ dias: 60, vendor: 'v7' });
    expect(creditoProv(g('', 'tisanas', 'Tisanas'), vd, ZPROV_SEM)).toEqual({ dias: 0, vendor: null });
    expect(creditoProv(g('', 'vasos sa', 'Vasos SA'), vd, null)).toEqual({ dias: 0, vendor: null });
  });

  it('con varios del mismo nombre sin paréntesis, el mayor crédito', () => {
    const zp = [
      { vendor_id: 'a', nombre: 'Easy Drinkware (termos)', minimo_compra: 0, dias_credito: 15 },
      { vendor_id: 'b', nombre: 'Easy Drinkware (tazas)', minimo_compra: 0, dias_credito: 30 },
    ];
    expect(creditoProv(g('imp', 'Easy Drinkware', 'Easy Drinkware'), { local: {}, cafe: null }, zp)).toEqual({
      dias: 30,
      vendor: 'b',
    });
  });
});

describe('filas, tarjetas y pagos de la semana', () => {
  it('esta semana: proveedores por monto, mínimo, viernes de pago con crédito y el texto para copiar', () => {
    expect([semHoyDe('1'), semHoyDe('x'), semHoyDe(undefined)]).toEqual([1, 0, 0]);
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    expect(f.map((x) => x.monto)).toEqual([...f.map((x) => x.monto)].sort((a, b) => b - a));
    const vasos = f.find((x) => x.g.key === 'local|vasos sa')!;
    expect(vasos.pago).toEqual({ iso: '2026-12-11', txt: 'vie 11 dic', dias: 30, vinculado: true });
    const jar = f.find((x) => x.g.key === 'local|jarabes mx')!;
    expect([jar.minimo, jar.bajo, jar.cumple, jar.pago.txt]).toEqual([5000, false, true, 'vie 20 nov']);
    expect(jar.texto).toMatch(/^Pedido a Jarabes MX — 13 nov\n- LOC-JAR-001/);
    const sin = f.find((x) => !x.g.real)!;
    expect([sin.texto, sin.pago.vinculado]).toEqual([null, false]);
    const tis = f.find((x) => x.g.key === 'local|tisanas')!;
    expect([tis.monto, tis.sinCosto]).toEqual([0, 1]);
  });

  it('tarjetas: el total suma las tres categorías; cada una con su número de artículos', () => {
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    const t = tarjetasSemana(S, 0, f);
    expect(t.total).toBeCloseTo(t.cats.reduce((s, x) => s + x.monto, 0));
    expect(t.nProv).toBe(f.length);
    expect(t.cats.map((x) => x.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(t.sinCosto).toBeGreaterThan(0);
  });

  it('"estas compras se pagan": por viernes, en orden, sumando lo de cada proveedor', () => {
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    const p = pagosSemana(f, 0, c, '2026-11-13', credito);
    expect(p.map((x) => x.f)).toEqual([...p.map((x) => x.f)].sort());
    expect(p.reduce((s, x) => s + x.m, 0)).toBeCloseTo(f.reduce((s, x) => s + x.monto, 0));
    expect(p.find((x) => x.f === '2026-12-11')?.txt).toBe('vie 11 dic');
  });

  it('la próxima semana se pide el lunes 16 y se paga ese viernes (contado)', () => {
    const f = filasSemana(S, 1, c, '2026-11-13', credito);
    expect(f.find((x) => x.g.key === 'local|mermeladas')?.pago).toEqual({
      iso: '2026-11-20',
      txt: 'vie 20 nov',
      dias: 0,
      vinculado: false,
    });
  });
});

describe('riesgos y borradores', () => {
  it('riesgos: 5 en la vista simple y 12 con "Ver todo"; "Ver" lleva a la pantalla de su categoría', () => {
    const rs = hoyRiesgos(c, { cafe: () => cafe, imp: () => imp });
    expect(rs.length).toBeGreaterThan(0);
    const v = riesgosVista(rs, true);
    expect(v.lista.length).toBe(Math.min(5, rs.length));
    expect(v.mas).toBe(Math.max(0, rs.length - 5));
    expect([rutaRiesgo('plan'), rutaRiesgo('cafe'), rutaRiesgo('imp')]).toEqual([
      '/comercializadora',
      '/comercializadora/cafe',
      '/comercializadora/importaciones',
    ]);
  });

  it('borradores: cuenta por acción, monto y los folios por borrar', () => {
    const A = borrAnalisis(S, borrFuenteZoho(R), '2026-11-13')!;
    const r = resumenBorradores(A.lista);
    expect(r.n).toEqual({ emitir: 1, ajustar: 2, borrar: 1 });
    expect(r.textoBorrar).toBe('Borradores por borrar en Zoho (1): COM-OC-03003');
    expect(r.tot).toBeCloseTo(3800 + 7200 + 800);
  });

  it('formatos del detalle', () => {
    expect([numDet(2.5), numDet(12.5), numDet(3)]).toEqual(['2.5', '13', '3']);
    expect([diasDet(null), diasDet(0.4), diasDet(400), diasDet(12.2)]).toEqual([
      '—',
      'menos de 1 d',
      'más de 1 año',
      '12 d',
    ]);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-esta-semana.test.ts`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/estaSemana"`.

- [ ] **Step 3: Implementación**

Crear `lib/comercializadora/estaSemana.ts`. Es la parte de datos de `_hoyPintar` 40395, `_pagoCredito`/`_pagoMapaDe` (con la regla de la decisión 5), `_borrResolverHtml`, `_borrCopiar` y `_hoyDetalleHtml`:

```ts
import { planKey } from '../../supabase/functions/_shared/planBuild.ts';
import type { ZohoProveedor } from '../../supabase/functions/_shared/planProv.ts';
import {
  borrAnalisis,
  borrFuenteZoho,
  ctxFila,
  hoyGrupos,
  hoyPedidoTexto,
  hoyRiesgos,
  pagoFecha,
  pagoPedidoFecha,
  pagoPorFecha,
  pagoTxt,
  type Borrador,
  type CtxFila,
  type Riesgo,
} from '../../supabase/functions/_shared/planHoy.ts';
import { PSEM_CATS, type GrupoSem, type Sem } from '../../supabase/functions/_shared/planSem.ts';
import { nf } from './importaciones';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
export type { Borrador, CtxFila, Riesgo };
export { borrAnalisis, borrFuenteZoho, ctxFila, hoyRiesgos };

/** ?sem=1: la próxima semana; cualquier otro valor, esta (_hoyUI.sem). */
export const semHoyDe = (v: string | undefined): 0 | 1 => (v === '1' ? 1 : 0);

/** _pagoKeyS: el nombre sin el paréntesis final ("Easy Drinkware (termos)" y "Easy Drinkware" son el mismo proveedor). */
const keySin = (n: unknown) => planKey(String(n || '').replace(/\s*\([^)]*\)\s*$/, ''));

/**
 * Días de crédito de un proveedor del plan (decisión 5 del 3f). El viejo los buscaba por NOMBRE en com_proveedores
 * (_pagoCredito 40641); el portal los toma de com_zoho_proveedor (zoho-sync):
 * 1. local y café: por el vendor de Zoho del grupo (el mayoritario de sus artículos o el de mismo nombre, como el mínimo);
 * 2. si no hay (Importaciones, o un grupo sin vendor): por nombre como el viejo, completo y luego sin el paréntesis final
 *    (con varios, el mayor crédito);
 * 3. sin coincidencia: contado (0 días) y `vendor` null, que la pantalla marca como "sin proveedor de Zoho".
 */
export function creditoProv(
  g: Pick<GrupoSem, 'fuente' | 'pk' | 'nombre'>,
  vendorDe: { local: Record<string, string>; cafe: Record<string, string> | null },
  zprov: ZohoProveedor[] | null | undefined,
): { dias: number; vendor: string | null } {
  const lista = zprov || [];
  const id = g.fuente === 'imp' ? undefined : (g.fuente === 'cafe' ? vendorDe.cafe : vendorDe.local)?.[g.pk];
  const z = id ? lista.find((x) => String(x.vendor_id) === id) : undefined;
  if (z) return { dias: Number(z.dias_credito) || 0, vendor: String(z.vendor_id) };
  const tal = new Map<string, ZohoProveedor>(),
    sin = new Map<string, ZohoProveedor>();
  lista.forEach((x) => {
    tal.set(planKey(x.nombre), x);
    const s = keySin(x.nombre),
      ya = sin.get(s);
    if (!ya || (Number(x.dias_credito) || 0) > (Number(ya.dias_credito) || 0)) sin.set(s, x);
  });
  const m = tal.get(planKey(g.nombre)) ?? sin.get(keySin(g.nombre));
  return m ? { dias: Number(m.dias_credito) || 0, vendor: String(m.vendor_id) } : { dias: 0, vendor: null };
}

export type Credito = (g: GrupoSem) => { dias: number; vendor: string | null };
export interface FilaSemana {
  g: GrupoSem;
  monto: number;
  n: number;
  sinCosto: number;
  minimo: number;
  /** "Bajo el mínimo del proveedor": solo si todos los artículos tienen costo (el monto sería parcial). */
  bajo: boolean;
  cumple: boolean;
  pago: { iso: string; txt: string; dias: number; vinculado: boolean };
  items: X[];
  /** Texto de "Copiar pedido" (solo con proveedor asignado). */
  texto: string | null;
}
/** _hoyPintar: un renglón por proveedor de la semana k, con su monto, su mínimo, el viernes de pago y el pedido. */
export function filasSemana(
  S: Sem,
  k: 0 | 1,
  c: { semIni: string[] },
  hoyIso: string,
  credito: Credito,
): FilaSemana[] {
  return hoyGrupos(S, k).map((g) => {
    const m = g.monto[k],
      min = g.minimo || 0,
      cr = credito(g),
      f = pagoFecha(pagoPedidoFecha(c, k, hoyIso), cr.dias);
    return {
      g,
      monto: m,
      n: g.n[k],
      sinCosto: g.sinCosto[k],
      minimo: min,
      bajo: min > 0 && m > 0 && m < min && !g.sinCosto[k],
      cumple: min > 0 && m >= min,
      pago: { iso: f, txt: pagoTxt(f), dias: cr.dias, vinculado: cr.vendor !== null },
      items: g.rows
        .filter((r: X) => r.sem[k] > 0)
        .sort((a: X, b: X) => b.sem[k] * (b.costo || 0) - a.sem[k] * (a.costo || 0)),
      texto: g.real ? hoyPedidoTexto(g, k, hoyIso) : null,
    };
  });
}
/** Tarjetas de arriba: el total de la semana y el de cada categoría (las tres, con su error si no se pudo calcular). */
export function tarjetasSemana(S: Sem, k: 0 | 1, filas: FilaSemana[]) {
  return {
    total: PSEM_CATS.reduce((t, d) => t + (S.cat[d.id].monto[k] || 0), 0),
    nProv: filas.length,
    nArt: filas.reduce((t, f) => t + f.n, 0),
    sinCosto: filas.reduce((t, f) => t + f.sinCosto, 0),
    cats: PSEM_CATS.map((d) => ({
      def: d,
      monto: S.cat[d.id].monto[k] || 0,
      n: S.cat[d.id].provs.reduce((t, g) => t + g.n[k], 0),
      err: S.cat[d.id].err,
    })),
  };
}
/** "Estas compras se pagan: vie 20 nov $… · …" (_pagoPorFecha). */
export const pagosSemana = (
  filas: FilaSemana[],
  k: 0 | 1,
  c: { semIni: string[] },
  hoyIso: string,
  credito: Credito,
) =>
  pagoPorFecha(
    filas.map((f) => f.g),
    k,
    c,
    hoyIso,
    (g) => credito(g).dias,
  ).map((p) => ({ ...p, txt: pagoTxt(p.f) }));

/** Riesgos que se ven: 5 en la vista simple y 12 con "Ver todo"; el resto se cuenta. */
export function riesgosVista(rs: Riesgo[], simple: boolean) {
  const n = simple ? 5 : 12;
  return { lista: rs.slice(0, n), mas: Math.max(0, rs.length - n), total: rs.length };
}
/** A dónde lleva "Ver" de un riesgo: Qué pedir (lo local; "Todo lo demás" no se porta), Café o Importaciones. */
export const rutaRiesgo = (tab: Riesgo['tab']) =>
  tab === 'cafe'
    ? '/comercializadora/cafe'
    : tab === 'imp'
      ? '/comercializadora/importaciones'
      : '/comercializadora';

/** _borrResolverHtml: cuántos hay de cada acción, el monto y el texto de "Copiar folios por borrar". */
export function resumenBorradores(lista: Borrador[]) {
  const n = { emitir: 0, ajustar: 0, borrar: 0 };
  let tot = 0;
  lista.forEach((o) => {
    n[o.accion]++;
    tot += o.monto;
  });
  const fs = lista.filter((o) => o.accion === 'borrar').map((o) => o.folio);
  return { n, tot, textoBorrar: `Borradores por borrar en Zoho (${fs.length}): ${fs.join(', ')}` };
}

/** _hoyDetalleHtml: números con un decimal si son chicos y fraccionarios. */
export const numDet = (x: number) => nf(x, Math.abs(x) < 10 && x % 1 ? 1 : 0);
/** _hoyDetalleHtml: días que alcanza. */
export const diasDet = (d: number | null | undefined) =>
  d === null || d === undefined ? '—' : d < 1 ? 'menos de 1 d' : d > 365 ? 'más de 1 año' : `${nf(d)} d`;
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (9). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/estaSemana.ts tests/portal/com-esta-semana.test.ts
git commit -m "feat(comercializadora): Esta semana: crédito por proveedor de Zoho, pagos, riesgos y borradores"
```

---

### Task 9: Pantalla Esta semana

**Files:**
- Create: `components/comercializadora/esta-semana.tsx`, `app/(comercializadora)/comercializadora/esta-semana/page.tsx`
- Modify: `components/portal/navegacion.tsx` (Esta semana en "Comprar")
- Test: `tests/portal/com-esta-semana-pantalla.test.tsx`

**Interfaces:**
- Consumes: Tarea 8 (todo `estaSemana.ts`); `etiquetaSem`, `fuenteCant`, `planSemCalc`, `planSemW`, `COLOR_CAT`, `fechaCorta`, `FuentesPlan` (Tarea 6); `FilaPlegable`, `CopiarTexto`, `EtiquetaCat`, `AvisosPlanSem` (Tarea 7); `ocGrupoSem`, `enlaceOc` (Tarea 4); los motores (Tarea 1 y 3e).
- Produces: `TarjetasSemana`, `ProveedoresSemana`, `RiesgosSemana` y `BorradoresSemana` (server components), y la página.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-esta-semana-pantalla.test.tsx`:

```tsx
// Plan 3f: pantalla Esta semana (tarjetas, pagos, proveedores, Copiar pedido, Crear OC, riesgos, borradores y navegación).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, acceso: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/esta-semana',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ actualizarMotor: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: m.acceso }, db: null }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import EstaSemanaPagina from '../../app/(comercializadora)/comercializadora/esta-semana/page';
import { gruposDe } from '../../components/portal/navegacion';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosSem } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

let carga = 500;
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...datosSem(), ...extra, cargadoEn: ++carga },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string> = {}) =>
  render(await EstaSemanaPagina({ searchParams: Promise.resolve(sp) }));
const fila = (nombre: string) =>
  screen.getByRole('button', { name: `Ver los artículos de ${nombre}` }).closest('tr')!;

describe('pantalla Esta semana', () => {
  beforeEach(() => {
    limpiarMotor();
    m.acceso = 'edicion';
    m.motor = listo();
  });

  it('tarjetas de la semana y por categoría, y la línea de pagos por viernes', async () => {
    await pagina();
    expect(screen.getByText('Dinero a disponer esta semana')).toBeTruthy();
    for (const n of ['Todo lo demás', 'Café', 'Importaciones'])
      expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Estas compras se pagan:/).textContent).toMatch(
      /vie 20 nov \$[\d,]+.*vie 11 dic \$/,
    );
  });

  it('proveedores: pago con crédito, mínimo cumplido, sin proveedor de Zoho y sin proveedor asignado', async () => {
    await pagina();
    expect(within(fila('Vasos SA')).getByText('vie 11 dic')).toBeTruthy();
    expect(within(fila('Vasos SA')).getByText('crédito 30 d')).toBeTruthy();
    expect(within(fila('Jarabes MX')).getByText('Mínimo $5,000 · cumple')).toBeTruthy();
    expect(within(fila('Tisanas')).getByText('sin proveedor de Zoho')).toBeTruthy();
    expect(
      within(fila('Sin proveedor asignado')).getByText('Sin proveedor asignado en el catálogo'),
    ).toBeTruthy();
  });

  it('Crear OC solo esta semana y con permiso; Copiar pedido deja el texto en el portapapeles', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true });
    await pagina();
    const crear = within(fila('Jarabes MX')).getByRole('link', { name: 'Crear OC' });
    expect(crear.getAttribute('href')).toMatch(
      /^\/comercializadora\/ordenes\?nueva=plan&proveedor=Jarabes\+MX/,
    );
    fireEvent.click(within(fila('Jarabes MX')).getByRole('button', { name: 'Copiar pedido' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '' }).textContent).toContain('Pedido copiado'),
    );
    expect(escribir.mock.calls[0][0]).toMatch(
      /^Pedido a Jarabes MX — 13 nov\n- LOC-JAR-001 · Jarabe vainilla 1 L: 31 \(\$2,945\)/,
    );
  });

  it('la próxima semana: sin Crear OC, el pedido dice "(próxima semana)"', async () => {
    await pagina({ sem: '1' });
    expect(screen.getByText('Dinero de la próxima semana')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('solo lectura: sin Crear OC', async () => {
    m.acceso = 'lectura';
    await pagina();
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('el detalle de un proveedor muestra lo que se pide y cómo está el inventario hoy', async () => {
    await pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Ver los artículos de Jarabes MX' }));
    expect(screen.getByRole('columnheader', { name: 'Quedas con' })).toBeTruthy();
    expect(screen.getByText('LOC-JAR-001 · $95 c/u · tarda 7 d')).toBeTruthy();
  });

  it('riesgos con enlace a su pantalla y borradores de zoho-sync con qué hacer', async () => {
    await pagina({ det: '1' });
    expect(screen.getByText(/^Se quedarían sin producto antes de que llegue un pedido de hoy/)).toBeTruthy();
    const ver = screen.getAllByRole('link', { name: 'Ver' }).map((a) => a.getAttribute('href'));
    expect(
      ver.every((h) =>
        ['/comercializadora', '/comercializadora/cafe', '/comercializadora/importaciones'].includes(h!),
      ),
    ).toBe(true);
    expect(ver).toContain('/comercializadora/importaciones');
    expect(screen.getByText('Borradores en Zoho por resolver')).toBeTruthy();
    expect(screen.getByText('COM-OC-03001')).toBeTruthy();
    expect(screen.getAllByText('Emitir ajustando').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Copiar folios por borrar (1)' })).toBeTruthy();
    expect(screen.getByText(/Datos de zoho-sync del 13 nov\./)).toBeTruthy();
  });

  it('sin borradores ni nada que pedir: no hay panel de borradores y la tabla lo dice', async () => {
    m.motor = listo({ ocZohoBorr: [], pedidos: [], cat: [] }, { imp: { orden: [], items: {} } });
    await pagina();
    expect(screen.queryByText('Borradores en Zoho por resolver')).toBeNull();
    expect(screen.getByText('No hay nada que pedir esta semana con los datos de hoy.')).toBeTruthy();
  });

  it('si Importaciones no se puede calcular, su tarjeta lo dice y lo demás sigue', async () => {
    m.motor = listo({}, { imp: { orden: [], items: {} } });
    await pagina();
    expect(screen.getByText('No hay artículos activos en el plan de importaciones.')).toBeTruthy();
    expect(within(fila('Jarabes MX')).getByText('vie 20 nov')).toBeTruthy();
  });

  it('sin datos del plan: el error con el enlace a Órdenes', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los datos del plan. Intenta de nuevo.' };
    await pagina();
    expect(
      within(screen.getByRole('alert')).getByRole('link', { name: 'Ir a Órdenes de compra' }),
    ).toBeTruthy();
  });

  it('navegación: Esta semana va en Comprar, después de Qué pedir', () => {
    const g = gruposDe('comercializadora', ['comercializadora']);
    const comprar = g.find((x) => x.titulo === 'Comprar')!.enlaces.map((e) => e.href);
    expect(comprar.slice(0, 2)).toEqual(['/comercializadora', '/comercializadora/esta-semana']);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-esta-semana-pantalla.test.tsx`
Expected: FAIL. `Failed to resolve import "../../app/(comercializadora)/comercializadora/esta-semana/page"`.

- [ ] **Step 3: Implementación**

Crear `components/comercializadora/esta-semana.tsx`. Es la parte visual de `_hoyPintar`, `_hoyDetalleHtml` y `_borrResolverHtml`:
- las tarjetas, la tabla de proveedores (Pago con "crédito N d" y "sin proveedor de Zoho"; Mínimo con "Bajo el mínimo del proveedor (…): faltan $X"; Copiar pedido y Crear OC) y su detalle plegable;
- los riesgos (5 en la vista simple, 12 con "Ver todo");
- los borradores, abiertos con "Ver todo".

```tsx
import Link from 'next/link';
import { enlaceOc, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { dinero, nf } from '@/lib/comercializadora/importaciones';
import {
  diasDet,
  numDet,
  resumenBorradores,
  rutaRiesgo,
  type Borrador,
  type CtxFila,
  type FilaSemana,
  type riesgosVista,
  type tarjetasSemana,
} from '@/lib/comercializadora/estaSemana';
import { COLOR_CAT, fechaCorta } from '@/lib/comercializadora/planAbastos';
import { CopiarTexto } from './copiar-texto';
import { FilaPlegable } from './fila-plegable';
import { EtiquetaCat } from './plan-abastos';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const numero = 'text-right tabular-nums whitespace-nowrap';

/** Tarjetas de arriba: el dinero de la semana y el de cada categoría, con su error si no se pudo calcular. */
export function TarjetasSemana(p: {
  t: ReturnType<typeof tarjetasSemana>;
  k: 0 | 1;
  simple: boolean;
  rango: string;
}) {
  const { t } = p;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-line border-t-4 border-t-bad bg-surface p-4 shadow-card">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {p.k === 0 ? 'Dinero a disponer esta semana' : 'Dinero de la próxima semana'}
        </p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-bad">{dinero(t.total)}</p>
        <p className="text-xs text-ink-2">
          {t.nProv} {t.nProv === 1 ? 'proveedor' : 'proveedores'} · {t.nArt}{' '}
          {t.nArt === 1 ? 'artículo' : 'artículos'}
          {t.sinCosto ? ` · ${t.sinCosto} sin costo (el total es mayor)` : ''}
          {p.simple ? null : <span className="block">{p.rango}</span>}
        </p>
      </div>
      {t.cats.map((c) => (
        <div
          key={c.def.id}
          className="rounded-2xl border border-line border-t-4 bg-surface p-4 shadow-card"
          style={{ borderTopColor: COLOR_CAT[c.def.id] }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {c.def.nombre}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{dinero(c.monto)}</p>
          <p className="text-xs text-ink-2">
            {c.n} {c.n === 1 ? 'artículo' : 'artículos'}
            {p.simple ? null : ` · ${c.def.sub}`}
            {c.err ? <span className="block text-bad">{c.err}</span> : null}
          </p>
        </div>
      ))}
    </div>
  );
}

/** _hoyDetalleHtml: lo que se pide, cuánto cuesta y cómo está el inventario HOY. */
function DetalleProveedor({
  items,
  k,
  ctx,
  colSpan,
}: {
  items: X[];
  k: 0 | 1;
  ctx: (r: X) => CtxFila | null;
  colSpan: number;
}) {
  return (
    <tr className="bg-surface-2">
      <td colSpan={colSpan} className="py-2 pl-8 pr-3">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="tabla min-w-[520px] text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className={numero}>Pides</th>
                <th className={numero}>Monto</th>
                <th className={numero} title="Físico menos comprometido">
                  Tienes hoy
                </th>
                <th className={numero}>Vendes / día</th>
                <th className={numero} title="Días que dura lo que hay hoy, sin contar lo que viene">
                  Alcanza
                </th>
                <th className={numero} title="Lo que tienes, más lo que viene, más lo que pides">
                  Quedas con
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const q = r.sem[k],
                  c = ctx(r),
                  cont = !!r.contenedor;
                return (
                  <tr key={r.sku}>
                    <td>
                      {r.nombre}
                      <span className="block text-[10px] text-muted-foreground">
                        {r.sku}
                        {r.imp && cont ? ' · plan de contenedores' : ''}
                        {r.costo > 0 && !cont ? ` · ${dinero(r.costo)} c/u` : ''}
                        {r.s && r.s.lt ? ` · tarda ${r.s.lt} d` : ''}
                      </span>
                    </td>
                    <td className={numero}>
                      <b>{nf(q)}</b>
                      {cont ? ' cont.' : ''}
                    </td>
                    <td className={numero}>
                      {r.costo > 0 ? (
                        dinero(cont ? r.costo : q * r.costo)
                      ) : (
                        <span className="text-warn">sin costo</span>
                      )}
                    </td>
                    {c ? (
                      <>
                        <td
                          className={`${numero} ${c.tienes < 0 ? 'text-bad' : ''}`}
                          title={c.tienes < 0 ? 'Lo comprometido supera lo que hay en físico' : undefined}
                        >
                          <b>{numDet(c.tienes)}</b>
                          {c.enOC > 0 ? (
                            <span className="block text-[10px] text-muted-foreground">
                              +{numDet(c.enOC)} en camino
                            </span>
                          ) : null}
                        </td>
                        <td className={numero}>{c.consumo > 0 ? numDet(c.consumo) : '—'}</td>
                        <td className={numero}>{diasDet(c.diasHoy)}</td>
                        <td className={numero}>
                          <b>{numDet(c.quedas)}</b>
                          {c.diasQuedas === null ? null : (
                            <span className="block text-[10px] text-muted-foreground">
                              {diasDet(c.diasQuedas)}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-muted-foreground">
                        Un contenedor junta varios productos: el detalle está en Importaciones
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

/** La tabla de proveedores de la semana: monto, pago, mínimo, Copiar pedido y Crear OC (solo esta semana). */
export function ProveedoresSemana(p: {
  filas: FilaSemana[];
  k: 0 | 1;
  simple: boolean;
  ocs: Record<string, PrellenadoOc | { error: string }>;
  ctx: (r: X) => CtxFila | null;
}) {
  const { filas, k } = p;
  if (!filas.length)
    return (
      <p className="py-6 text-center text-sm text-ink-2">
        No hay nada que pedir {k === 0 ? 'esta semana' : 'la próxima semana'} con los datos de hoy.
      </p>
    );
  const hayMin = !p.simple || filas.some((f) => f.minimo > 0);
  const cols = 5 + (hayMin ? 1 : 0);
  return (
    <div className="placa mb-4 overflow-x-auto">
      <table className="tabla min-w-[560px] text-sm">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th className={numero}>Artículos</th>
            <th className={numero}>Monto</th>
            <th>Pago</th>
            {hayMin ? <th>Mínimo del proveedor</th> : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const g = f.g,
              oc = p.ocs[g.key];
            return (
              <FilaPlegable
                key={g.key}
                etiqueta={g.nombre}
                claseTitulo="font-semibold"
                titulo={
                  <>
                    {g.nombre}
                    <EtiquetaCat cat={g.cat} />
                  </>
                }
                celdas={
                  <>
                    <td className={numero}>{f.n}</td>
                    <td className={`${numero} font-bold`}>
                      {f.monto > 0 ? dinero(f.monto) : '—'}
                      {f.sinCosto ? (
                        <span className="block text-[10px] font-normal text-warn">
                          +{f.sinCosto} sin costo
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {f.pago.txt}
                      {f.pago.dias > 0 ? (
                        <span className="block text-[10px] text-muted-foreground">
                          crédito {f.pago.dias} d
                        </span>
                      ) : null}
                      {!f.pago.vinculado ? (
                        <span
                          className="block text-[10px] text-muted-foreground"
                          title="No se encontró este proveedor en Zoho: se asume pago de contado"
                        >
                          sin proveedor de Zoho
                        </span>
                      ) : null}
                    </td>
                    {hayMin ? (
                      <td className="text-xs">
                        {f.minimo > 0 ? (
                          f.bajo ? (
                            <span className="text-warn">
                              Bajo el mínimo del proveedor ({dinero(f.minimo)}): faltan{' '}
                              {dinero(f.minimo - f.monto)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Mínimo {dinero(f.minimo)}
                              {f.cumple ? ' · cumple' : ''}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {f.texto ? (
                          <CopiarTexto
                            texto={f.texto}
                            etiqueta="Copiar pedido"
                            ok="Pedido copiado: pégalo en el correo o WhatsApp del proveedor"
                          />
                        ) : (
                          <span className="text-xs text-warn">Sin proveedor asignado en el catálogo</span>
                        )}
                        {oc && !('error' in oc) ? (
                          <Link
                            href={enlaceOc(oc)}
                            className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
                          >
                            Crear OC
                          </Link>
                        ) : oc ? (
                          <span className="text-xs text-muted-foreground">{oc.error}</span>
                        ) : null}
                      </span>
                    </td>
                  </>
                }
                detalle={<DetalleProveedor items={f.items} k={k} ctx={p.ctx} colSpan={cols} />}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Se quedarían sin producto antes de que llegue un pedido de hoy" (_hoyRiesgos), los más graves primero. */
export function RiesgosSemana({ v, simple }: { v: ReturnType<typeof riesgosVista>; simple: boolean }) {
  if (!v.total) return null;
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 title="Lo que tienes (y lo que ya viene) dura menos que lo que tarda el proveedor: aunque pidas hoy habría días sin producto">
        Se quedarían sin producto antes de que llegue un pedido de hoy{' '}
        <span className="font-normal text-muted-foreground">({v.total})</span>
      </h2>
      {simple ? null : (
        <p className="mt-1 text-xs text-muted-foreground">
          {v.total} {v.total === 1 ? 'artículo' : 'artículos'}: lo que tienes (y lo que ya viene) dura menos
          que lo que tarda el proveedor. Aunque pidas hoy, habría días sin producto. Los más graves primero.
        </p>
      )}
      <div className="placa mt-3 overflow-x-auto">
        <table className="tabla text-xs">
          <thead>
            <tr>
              <th>Artículo</th>
              {simple ? null : <th>Proveedor</th>}
              <th className={numero}>Alcanza</th>
              <th className={numero}>El proveedor tarda</th>
              <th className={numero}>Días sin producto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.lista.map((r) => (
              <tr key={r.cat + r.sku}>
                <td>
                  {r.nombre}
                  <EtiquetaCat cat={r.cat} />
                  {simple ? null : <span className="block text-[10px] text-muted-foreground">{r.sku}</span>}
                </td>
                {simple ? null : <td>{r.prov}</td>}
                <td className={numero}>{nf(r.alcanza)} d</td>
                <td className={numero}>{nf(r.lt)} d</td>
                <td className={`${numero} font-bold text-bad`}>{nf(r.gap)} d</td>
                <td className="text-right">
                  <Link href={rutaRiesgo(r.tab)} className="text-xs underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.mas ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          +{v.mas} más: están en las pantallas de cada categoría.
        </p>
      ) : null}
    </section>
  );
}

const ACCION = {
  emitir: ['Emitir', 'border-ok text-ok'],
  ajustar: ['Emitir ajustando', 'border-warn text-warn'],
  borrar: ['Borrar', 'border-bad text-bad'],
} as const;
/**
 * "Borradores en Zoho por resolver" (_borrResolverHtml) con los borradores de zoho-sync (decisión 3): qué hacer con cada
 * uno según lo que pide el plan esta semana y la próxima. Abierto con "Ver todo"; plegado en la vista simple.
 */
export function BorradoresSemana({
  A,
  simple,
}: {
  A: { fecha: string; lista: Borrador[] };
  simple: boolean;
}) {
  if (!A.lista.length) return null;
  const r = resumenBorradores(A.lista);
  return (
    <details open={!simple} className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <summary className="cursor-pointer text-sm">
        <b>Borradores en Zoho por resolver</b>{' '}
        <span className="text-ink-2">
          ({A.lista.length} · {dinero(r.tot)})
        </span>
        {simple ? <span className="ml-2 text-xs text-crema-strong">ver qué hacer con cada uno</span> : null}
      </summary>
      <p className="mb-2 mt-1 text-xs text-ink-2">
        Un borrador no es una compra: se emite o se borra el mismo día. Según lo que pide el plan (esta semana
        y la próxima): <b className="text-ok">{r.n.emitir} para emitir</b> ·{' '}
        <b className="text-warn">{r.n.ajustar} para emitir ajustando</b> ·{' '}
        <b className="text-bad">{r.n.borrar} para borrar</b>. Datos de zoho-sync
        {A.fecha ? ` del ${fechaCorta(A.fecha)}` : ''}.
      </p>
      <div className="placa mb-2 overflow-x-auto">
        <table className="tabla min-w-[560px] text-xs">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proveedor</th>
              <th className={numero} title="En pesos; las OCs en otra moneda no traen precio">
                Monto
              </th>
              <th>En borrador desde hace</th>
              <th>Qué pide el plan</th>
              <th>Qué hacer</th>
            </tr>
          </thead>
          <tbody>
            {A.lista.map((o) => (
              <FilaPlegable
                key={o.folio}
                etiqueta={o.folio}
                claseTitulo="whitespace-nowrap font-bold"
                titulo={o.folio}
                celdas={
                  <>
                    <td>{o.prov}</td>
                    <td className={numero}>{o.monto > 0 ? dinero(o.monto) : '—'}</td>
                    <td className="whitespace-nowrap">
                      {o.dias === null ? '—' : `${o.dias} ${o.dias === 1 ? 'día' : 'días'}`}
                    </td>
                    <td>
                      {o.nPlan} de {o.lineas.length} {o.lineas.length === 1 ? 'artículo' : 'artículos'}
                      <span className="block text-[10.5px] text-muted-foreground">{o.motivo}</span>
                    </td>
                    <td>
                      <span
                        className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-bold ${ACCION[o.accion][1]}`}
                      >
                        {ACCION[o.accion][0]}
                      </span>
                    </td>
                  </>
                }
                detalle={o.lineas.map((l) => (
                  <tr key={o.folio + '|' + l.sku} className="bg-surface-2">
                    <td colSpan={2} className="pl-8">
                      {l.nom || l.sku}
                      <span className="block text-[10px] text-muted-foreground">{l.sku}</span>
                    </td>
                    <td className={numero}>{nf(l.q)} en el borrador</td>
                    <td colSpan={2}>
                      El plan pide <b>{nf(l.plan)}</b>
                      {l.viene > 0 ? ` · ya vienen ${nf(l.viene)}` : ''}
                    </td>
                    <td />
                  </tr>
                ))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {r.n.borrar ? (
          <CopiarTexto
            texto={r.textoBorrar}
            etiqueta={`Copiar folios por borrar (${r.n.borrar})`}
            ok="Folios copiados: bórralos en Zoho"
          />
        ) : null}
        <span>Emitir o borrar se hace en Zoho; al siguiente zoho-sync la lista se pone al día.</span>
      </div>
    </details>
  );
}
```

Crear `app/(comercializadora)/comercializadora/esta-semana/page.tsx`. Esta semana junta siempre las tres categorías (el viejo no aplicaba ahí las casillas del Plan de abastos). "Crear OC" solo va en la semana actual:

```tsx
import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { hrefPlan } from '@/components/comercializadora/vistas-plan';
import { AvisosPlanSem } from '@/components/comercializadora/plan-abastos';
import {
  BorradoresSemana,
  ProveedoresSemana,
  RiesgosSemana,
  TarjetasSemana,
} from '@/components/comercializadora/esta-semana';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import {
  cafeOrdenesMotor,
  importacionesMotor,
  motorPlan,
  planLocalMotor,
} from '@/lib/comercializadora/motor';
import { ocGrupoSem, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import {
  etiquetaSem,
  fuenteCant,
  planSemCalc,
  planSemW,
  type FuentesPlan,
} from '@/lib/comercializadora/planAbastos';
import {
  borrAnalisis,
  borrFuenteZoho,
  creditoProv,
  ctxFila,
  filasSemana,
  hoyRiesgos,
  pagosSemana,
  riesgosVista,
  semHoyDe,
  tarjetasSemana,
  type Credito,
} from '@/lib/comercializadora/estaSemana';
import { dinero } from '@/lib/comercializadora/importaciones';

type Sp = Record<string, string | undefined>;
const RUTA = '/comercializadora/esta-semana';
const TODAS = { local: true, cafe: true, imp: true };

/**
 * Esta semana (renderComHoy): lo que hay que ordenar esta semana o la próxima de las tres categorías, por proveedor, con
 * el dinero, el viernes de pago, el mínimo, los riesgos de quedarse sin producto y los borradores de Zoho por resolver.
 */
export default async function EstaSemanaPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1',
    simple = !det,
    k = semHoyDe(sp.sem);
  const params: Sp = { det: det ? '1' : undefined, sem: k ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Esta semana"
      descripcion="Lo que hay que ordenar de todo lo local, el café y las importaciones: a qué proveedor, cuánto dinero, cuándo se paga y qué se quedaría sin producto."
    >
      <ActualizarMotor />
    </Encabezado>
  );
  if (!m.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {m.error}{' '}
          <Link href="/comercializadora/ordenes" className="font-semibold underline">
            Ir a Órdenes de compra
          </Link>
        </p>
      </>
    );
  const c = planLocalMotor(m);
  const f: FuentesPlan = { cafe: null, imp: null };
  const fuentes = {
    cafe: () => (f.cafe = cafeOrdenesMotor(m)),
    imp: () => (f.imp = importacionesMotor(m, null)),
  };
  const S = planSemCalc(c, TODAS, planSemW(c, 0), fuentes);
  const credito: Credito = (g) =>
    creditoProv(g, { local: c.vendorDe, cafe: f.cafe?.vendorDe ?? null }, m.R.zprov);
  const filas = filasSemana(S, k, c, c.hoyIso, credito);
  const pagos = pagosSemana(filas, k, c, c.hoyIso, credito);
  const ocs: Record<string, PrellenadoOc | { error: string }> = {};
  if (k === 0 && puedeEditarCom(accesos))
    filas.forEach(({ g }) => {
      if (g.real && g.n[0] > 0) ocs[g.key] = ocGrupoSem(g, { local: c, cafe: f.cafe, imp: f.imp });
    });
  const borr = borrAnalisis(S, borrFuenteZoho(m.R), c.hoyIso);
  const boton = (s: 0 | 1, t: string) => (
    <Link
      href={hrefPlan(RUTA, params, { sem: s ? '1' : undefined })}
      aria-current={k === s ? 'page' : undefined}
      className={`rounded-[10px] border px-3 py-1.5 text-sm ${k === s ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
    >
      {t}
    </Link>
  );
  return (
    <>
      {encabezado}
      <AvisosPlanSem fuente={fuenteCant(c, m.R, Date.now())} lecturas={m.R.avisos} simple={simple} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Semana" className="flex gap-1.5">
          {boton(0, 'Esta semana')}
          {boton(1, 'Próxima semana')}
        </nav>
        <span className="flex-1" />
        <Link href="/comercializadora/plan-abastos" className="text-sm font-semibold underline">
          Ver el plan de {c.W} semanas
        </Link>
        <Link
          href={hrefPlan(RUTA, params, { det: det ? undefined : '1' })}
          className="px-2 py-1.5 text-sm font-semibold underline"
        >
          {det ? 'Vista simple' : 'Ver todo'}
        </Link>
      </div>
      <TarjetasSemana
        t={tarjetasSemana(S, k, filas)}
        k={k}
        simple={simple}
        rango={c.W ? etiquetaSem(c, k, true) : ''}
      />
      {pagos.length ? (
        <p className="mb-3 text-sm text-ink-2">
          Estas compras se pagan:{' '}
          {pagos.map((p, i) => (
            <span key={p.f}>
              {i ? ' · ' : ''}
              <b>{p.txt}</b> {dinero(p.m)}
            </span>
          ))}
        </p>
      ) : null}
      <ProveedoresSemana filas={filas} k={k} simple={simple} ocs={ocs} ctx={(r) => ctxFila(r, k)} />
      <RiesgosSemana v={riesgosVista(hoyRiesgos(c, fuentes), simple)} simple={simple} />
      {borr ? <BorradoresSemana A={borr} simple={simple} /> : null}
      {simple ? null : (
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          Esta pantalla junta lo que toca pedir en <b>Todo lo demás</b>, <b>Café</b> e <b>Importaciones</b>{' '}
          (cada una se calcula con su método). Clic en un proveedor para ver qué hay que pedirle. &quot;Copiar
          pedido&quot; deja la lista en el portapapeles para mandarla al proveedor; &quot;Crear OC&quot; abre
          la orden de compra con esas cantidades.
        </p>
      )}
    </>
  );
}
```

En `components/portal/navegacion.tsx`, en "Comprar", después de Qué pedir (`CalendarCheck` ya se importa):

```tsx
      { href: '/comercializadora/esta-semana', nombre: 'Esta semana', icono: CalendarCheck },
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (11). Además:
- `npx vitest run tests/portal/com-plan-abastos-pantalla.test.tsx tests/portal/navegacion.test.tsx` verde;
- `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add components/comercializadora/esta-semana.tsx "app/(comercializadora)/comercializadora/esta-semana/page.tsx" components/portal/navegacion.tsx tests/portal/com-esta-semana-pantalla.test.tsx
git commit -m "feat(comercializadora): pantalla Esta semana"
```

---

### Task 10: Suite, build, recorrido en el navegador, guía y PR

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck`
Expected:
- Vitest: 176 archivos verdes y 1,399 pruebas, más la falla previa conocida `tests/migracion/paridad.test.ts` (Rappi, pide el Excel de costeo). Antes eran 170 archivos y 1,347 pruebas.
- tsc limpio.

Run: `npx prettier --check "app/(comercializadora)/comercializadora/plan-abastos" "app/(comercializadora)/comercializadora/esta-semana" components/comercializadora/{plan-abastos,esta-semana,fila-plegable,copiar-texto}.tsx components/portal/navegacion.tsx lib/comercializadora/{crearOc,estaSemana,excelPlan,motor,planAbastos}.ts "tests/portal/com-plan-abastos*" "tests/portal/com-esta-semana*" tests/portal/com-excel-plan.test.ts tests/portal/com-crear-oc.test.tsx`
Expected: limpio. En Windows, un archivo que Git dejó con CRLF puede marcar "Code style issues" sin cambios reales; se revisa solo lo tocado en este plan.

Run: `npm run test:funciones`
Expected: 257 passed + 33 ignored (las de paridad, sin el HTML viejo).

Run: `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`
Expected: 290 passed, 0 ignored. **Esta corrida es la que prueba la paridad.**

Luego: `npx next build`. Expected: build correcto, con 21 rutas de comercializadora (las 19 de antes, más `plan-abastos` y `esta-semana`).

- [ ] **Step 2: Sin migración ni dependencias**

Este plan no agrega migraciones, no toca bliocjvq y no cambia `package.json`. Para confirmarlo, `git diff feat/comercializadora-importaciones --stat -- supabase/migrations package.json package-lock.json` debe salir vacío.

- [ ] **Step 3: Recorrido en el navegador (solo ver)**

Escritorio y 375 px, sin guardar nada en producción. Las comparaciones son contra Compras > Esta semana y Compras > Plan de abastos del sitio viejo, el mismo día y a la misma hora (la simulación del servidor y los datos se leen en otro momento). Antes de comparar:
- en el viejo, vista "Detallada" para ver todo;
- en el portal, "Ver todo";
- Importaciones con el escenario guardado (decisión 11).

1. **Esta semana › tarjetas:** "Dinero a disponer esta semana" y el monto de Todo lo demás, Café e Importaciones. Lo mismo con "Próxima semana".
2. **Esta semana › proveedores:**
   - Los mismos proveedores, en el mismo orden, con artículos y monto.
   - Abrir dos o tres (uno local, uno de café y el de contenedores): "Pides", "Tienes hoy", "Alcanza" y "Quedas con" coinciden.
3. **Viernes de pago:**
   - La línea "Estas compras se pagan" y la columna Pago, proveedor por proveedor.
   - Donde difiera, revisar los días de crédito. El viejo los lee de `com_proveedores` por nombre y el portal de `com_zoho_proveedor` (decisión 5). Anotar cada proveedor con distinto crédito o "sin proveedor de Zoho" para el plan 4.
4. **Mínimo:** "Bajo el mínimo del proveedor (…): faltan $X" y "Mínimo $… · cumple" en los mismos proveedores.
5. **Riesgos:** "Se quedarían sin producto…" muestra la misma cantidad y los mismos primeros 12 (alcanza, tarda, días sin producto). "Ver" abre Qué pedir, Café o Importaciones.
6. **Borradores:**
   - El portal lista los borradores de zoho-sync y el viejo los de la carga de Zoho de la configuración (decisión 3): los folios pueden diferir.
   - Para los folios que estén en los dos, la acción (emitir, ajustar, borrar) y "Qué pide el plan" coinciden.
   - "Copiar folios por borrar" deja la lista en el portapapeles.
7. **Copiar pedido y Crear OC:**
   - "Copiar pedido" de un proveedor deja el texto del viejo.
   - "Crear OC" abre Órdenes con el aviso "sugerido por Plan de abastos", las líneas, el monto y el arribo. Se cierra con **Cerrar, sin guardar**.
   - Con un usuario de lectura no hay "Crear OC".
8. **Plan de abastos:**
   - Las tres tarjetas (4, 8 y 12 semanas) y las cifras (esta semana, próximas 4, total y semana pico; "Se agotan antes de que llegue" con "Ver todo").
   - "Dónde se va el dinero" y "Qué trae cada barra alta".
   - Quitar Importaciones de la tarjeta (`?sin=imp`): el total baja en lo mismo que en el viejo al desmarcarla.
9. **Gráfica:**
   - Las 6 barras de compras emitidas: un borrador real de Zoho no cuenta (decisión 3).
   - Las barras del plan y el texto "Hoy (igual a la OC automática)" cuando hay simulación.
   - "Ver pagos proyectados" abre Pagos.
10. **Matrices:**
    - Por proveedor, el monto de cada semana, "bajo mínimo" y "sin costo".
    - Por artículo, el primer pedido y la llegada.
    - Filtrar por texto y por proveedor. El seguimiento de ventas (alerta y artículos) coincide.
11. **Exportar Excel:** abre con 6 hojas, con los mismos nombres que el viejo y sus números; la hoja Configuración no trae `zoho_oc`.
12. **Aviso de la fuente:**
    - Con la simulación de hoy, el texto "Cantidades: simulación del servidor …".
    - Si la de hoy aún no corre, "de ayer".
    - Con la simulación vieja, la caja ámbar con el motivo.
13. **Consola y móvil:** consola sin errores de la app y sin desbordamiento horizontal a 375 px (las tablas se desplazan dentro de su caja). "Actualizar" vuelve a leer y la página se ve igual.

Diferencias esperadas con el viejo:
- los días de crédito por proveedor (decisión 5);
- los borradores de zoho-sync en lugar de la carga de la configuración (decisión 3), y los que dejan de contar como compra emitida;
- el error de una categoría visible también en la vista simple (decisión 10);
- datos leídos en otro momento (caché de 10 min).

Cualquier otra diferencia se investiga antes de seguir.

- [ ] **Step 4: Guía y PR**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 13. Plan de abastos y Esta semana (plan 3f)

- Pantallas `/comercializadora/plan-abastos` ("Planear y pagar") y `/comercializadora/esta-semana` ("Comprar"). Solo leen: "Crear OC" abre Órdenes prellenado (`?nueva=plan` para lo local; Café e Importaciones con sus enlaces del 3e) y "Copiar pedido" usa el portapapeles.
- Plan de abastos: categorías incluidas por `?sin=cafe,imp`, semanas por `?sem=4|8|12`, `?vista=articulo`, búsqueda `?q=`/`?prov=` y "Ver todo" (`?det=1`). La gráfica es "Compras por semana"; los pagos por viernes están en Pagos proyectados. Exportar Excel lleva las seis hojas del viejo (sin la carga de Zoho en Configuración).
- Esta semana: `?sem=1` para la próxima; "Ver todo" (`?det=1`).
- Cálculo: ports con paridad en `supabase/functions/_shared/{planSem,planHoy}.ts` y `planLocal` en `planProv.ts` (`COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`). Lo local usa la simulación del servidor (`com_pago_proyectado`) si la corrida de `com-proyeccion` tiene ≤ 36 h y está completa; si no, el cálculo local, y el aviso de arriba lo dice.
- Viernes de pago: pedido el lunes de la semana (o hoy), contado = el viernes con al menos 3 días; con crédito, el viernes anterior al vencimiento. Los días de crédito salen de `com_zoho_proveedor.dias_credito`, por el vendor del grupo y, si no hay, por nombre (sin el paréntesis final); sin coincidencia, contado ("sin proveedor de Zoho").
- Borradores por resolver: los `draft` de zoho-sync (`com_zoho_oc_lineas`); emitir, ajustar o borrar con las reglas del viejo. Un borrador no cuenta como en camino ni como compra emitida.
- La carga del motor lee además `com_catalogo.clasificacion_detallada`, `com_zoho_oc_lineas.synced_at` y `com_zoho_proveedor.dias_credito`.
- Diferencias conocidas con el viejo: crédito desde Zoho y no desde `com_proveedores`; borradores de zoho-sync en lugar de la carga de la configuración; el error de una categoría se ve también en la vista simple; Importaciones usa el escenario guardado; no se portan "Pagos por viernes", el historial de 60 días por proveedor ni los avisos de `_planBannersHtml` (salvo el de la fuente de las cantidades).
```

Commit:

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(comercializadora): guía de Plan de abastos y Esta semana"
```

Push de `feat/comercializadora-plan-abastos` y PR con base `feat/comercializadora-importaciones` (encima del #117). En la descripción van:
- las decisiones 2 (sin "Pagos por viernes"), 3 (borradores de zoho-sync), 4 (simulación del servidor y su aviso), 5 (crédito de Zoho y cómo se encuentra el proveedor), 6 (Crear OC) y 10 (qué pasa si una categoría falla);
- el resultado de la corrida con `COM_APP_VIEJA`;
- la lista de proveedores con crédito distinto que salió en el recorrido (Step 3, punto 3);
- que en producción no se guardó ninguna OC durante la revisión.

---

## Self-review (hecho al escribir)

- **Cobertura del bloque 3f, tras las decisiones 1 a 3:**
  - Plan local completo con la simulación del servidor (`_planBuild` + `_planAplicarServidor` + `_planAgruparProv`): Tarea 1.
  - Plan de abastos, cálculo: las categorías con sus casillas (`_PSEM_CATS`, `_psemIncLeer` → `?sin=`), `_psemGrupos`, `_psemGruposImp`, `_psemImpSet`, `_psemPasadas`, `_planSemCalc`, `_planSemW`, `_psemFamDe` y `_psemHoyMonto`: Tarea 2.
  - Plan de abastos, pantalla:
    - tarjetas, cifras (incluida "Se agotan antes de que llegue" con "Ver todo"), familias, gráfica "Compras por semana" con el enlace a Pagos y "Qué trae cada barra alta": Tareas 6 y 7;
    - matrices por proveedor ("bajo mínimo", "sin costo", Crear OC, detalle) y por artículo, seguimiento de ventas (±15%, los 8 que más se desvían) y "Cómo se lee": Tareas 6 y 7;
    - Excel de seis hojas: Tarea 5.
  - Esta semana:
    - Esta/Próxima, tarjetas y la línea de pagos (`_pagoFecha`, `_pagoPedidoFecha`, `_pagoPorFecha`, `_PAGO_MARGEN`, crédito de Zoho): Tareas 3, 8 y 9;
    - tabla de proveedores (Pago, Mínimo con "faltan $X", Copiar pedido, Crear OC) con su detalle (`_hoyDetalleHtml`, `_ctxFila`): Tareas 3, 8 y 9;
    - riesgos (`_hoyRiesgos` con café e importaciones URGENTE) y borradores (`_borrAnalisis` con zoho-sync): Tareas 3, 8 y 9.
  - Crear OC del plan local: Tarea 4. Rutas y navegación: Tareas 7 y 9.
  - Fuera, y por qué: "Pagos por viernes" (decisión 2); `hist`, "Por qué" con `com_minmax`, `_planBannersHtml`, `_planFuenteHtml`, `_actProximasHtml` y `_planSemEtiquetaPas` (decisión 13).
- **El código de las tareas se probó antes de escribir el plan**, en una copia del repo en `feat/comercializadora-importaciones` (`ee04e5b`) con `npm ci` propio, sin enlace a `node_modules`:
  - Deno: 257 passed + 33 ignored sin el HTML viejo, y 290 passed con `COM_APP_VIEJA`.
  - Vitest: 176 archivos verdes y 1,399 pruebas, más la falla conocida de Rappi.
  - `tsc --noEmit` y prettier limpios sobre lo tocado.
  - `next build` correcto, con 21 rutas de comercializadora.
  - El estado de la Tarea 7 se probó por separado, sin los archivos de las Tareas 8 y 9 y sin el enlace de Esta semana: tsc limpio y sus pruebas verdes.
  - La paleta de la decisión 9 pasó el validador de la skill dataviz en claro y en oscuro.

  Lo que no se probó allá: el recorrido en el navegador con datos reales (no había sesión ni base), que es la Tarea 10.
- **Sin marcadores pendientes.** Las preguntas de producto que quedan están en las decisiones 5 (de dónde salen los días de crédito) y 11 (el escenario de Importaciones). El plan sigue al viejo, o a lo que pidió el usuario, mientras no diga otra cosa.
- **Tipos consistentes:**
  - `PlanProv` (Tarea 1) lo usan las Tareas 2 a 9.
  - `GrupoSem`, `Sem`, `Inc`, `CatId`, `Pasadas` y `FuentesSem` (Tarea 2) los usan las Tareas 3 a 9. `FuentesPlan` (Tarea 6) es el contenedor que llenan las páginas.
  - `FuenteBorr`, `Borrador`, `Riesgo` y `CtxFila` (Tarea 3) los usan las Tareas 8 y 9.
  - `PrellenadoOc` y `ocGrupoSem` (Tarea 4) los usan las Tareas 7 y 9.
  - `LibroExcel` (3e) lo arma la Tarea 5 y lo pinta la 7.
  - `FilaSemana` y `Credito` (Tarea 8) los usa la Tarea 9.
  - `EtiquetaCat`, `AvisosPlanSem`, `FilaPlegable` y `CopiarTexto` (Tarea 7) los usa la Tarea 9.
- **Review Focus → pruebas:**
  1. Simulación vieja o incompleta: Tarea 1 (paridad con `VIEJA`; "con la simulación vieja…"), Tarea 6 (`fuenteCant`), Tarea 7 ("avisa de dónde salen las cantidades").
  2. Proveedor sin crédito o sin Zoho: Tarea 8 (`creditoProv`, siete casos), Tarea 9 ("sin proveedor de Zoho", "Sin proveedor asignado en el catálogo").
  3. Fechas que cruzan mes o año: Tarea 3 (150 días × 10 créditos; 15 días de "hoy" × semanas de 7 y 10; casos a mano de 28-dic, 1-ene y febrero).
  4. Categorías que fallan y motor caído: Tarea 2 ("si el café falla…", `imp_vacio`), Tareas 7 y 9 (tarjeta con el error; motor caído).
  5. Plan vacío o enorme: Tarea 6 ("plan grande", 600 artículos), Tareas 7 y 9 ("plan sin compras", "sin borradores ni nada que pedir").
