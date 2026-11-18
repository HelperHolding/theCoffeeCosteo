# Comercializadora: Importaciones y Café (plan 3e)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Traer al portal las dos pestañas de Compras del sitio viejo que tienen modelo propio:
- **Importaciones:** el modelo de la Sheet "Calculadora de abasto de importados" (escenarios, contenedores, compra puente, 15 meses), alimentado con el inventario, las OCs y el pipeline de aperturas.
- **Café:** el "Qué pedir" de café tostado (el mismo plan de abasto del motor 3d, solo café) y la proyección de compra del año con el modelo de la Sheet de café.

Las dos traen sus parámetros editables, "Exportar Excel" (.xlsx real) y "Crear OC" (prellena el formulario de Órdenes).

**Architecture:** Igual que los planes 3 a 3d (route group `app/(comercializadora)`, server components con la sesión, client components en `components/comercializadora/`, escrituras en server actions con `editorCom()`). Lo nuevo:
- **Módulos puros en `supabase/functions/_shared/`** (el 3f los reutiliza):
  - `impCafeCfg.ts`: semillas de las Sheets, `_impCfgNorm`, `_cafeCfgNorm` y etiquetas del historial (port literal con paridad).
  - `impEngine.ts` y `cafeEngine.ts`: los dos motores de las Sheets, **copiados byte por byte** del HTML viejo por un script, con su sha256 y paridad.
  - `planImp.ts`: `_impArmar` y `_impCorrer` sobre los datos del plan del 3d (port literal con paridad).
  - `planProv.ts` y `planCafe.ts`: agrupación por proveedor con mínimos de Zoho (`_planAgruparProv`), `_cafeCorrer` y el "Qué pedir" de café (`_cafeOrdenes` = `planBuild` del 3d solo café).
- **Sin cargar datos aparte:** `lib/comercializadora/motor.ts` suma `importacionesMotor`, `cafeMotor` y `cafeOrdenesMotor` sobre `motorPlan` (la misma caché de 10 minutos y `memoMotor`). Solo agrega una lectura opcional: los mínimos de proveedor de Zoho (`com_zoho_proveedor`, como `R.zprov` del viejo).
- **Escrituras:** solo los bloques `imp` y `cafe` de `com_plan_config` (versión e historial) y nada más. "Crear OC" solo prellena.
- **Sin migraciones ni dependencias nuevas:** el Excel usa `xlsx` 0.20.3 de la CDN de SheetJS, que el portal ya tiene (decisión 2).

Rama: `feat/comercializadora-importaciones`, encima de `feat/comercializadora-motor` (PR #116).

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind, Supabase (Postgres/RLS), Vitest + Testing Library, Deno (`deno test`) para los ports y su paridad, SheetJS (`xlsx` 0.20.3, ya instalado), lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas: "los cálculos que hoy viven en JS del HTML pasan a funciones puras con pruebas y casos tomados del comportamiento actual"). Anteceden:
- plan 3: `2026-11-13-comercializadora-pantallas-compras.md` (PR #113);
- plan 3b: `2026-11-13-comercializadora-inventario-config.md` (PR #114);
- plan 3c: `2026-11-13-comercializadora-operacion.md` (PR #115);
- plan 3d: `2026-11-13-comercializadora-motor-indicadores.md` (PR #116).

Sigue el plan 3f (Plan de abastos y Esta semana), que consume `impCorrer`, `impAhoraDatos`, `cafeOrdenes` y `planProvs` de este plan. Después, el plan 4 (paridad y cutover).

Origen en el HTML viejo `a9e4a22` ("PARTE F", 35791–39800):
- semillas y configuración: 35800–36038;
- motores de las Sheets: `_impEngine` 36040–36927 y `_cafeEngine` 36928–37576;
- adaptador y pantalla de Importaciones: 37580–38498;
- Café: 39241–39800, con la vista "Qué pedir" compartida (`_ord*`) en 39316–39553.

## Decisiones (al planear, 2026-11-13)

1. **El bloque Planear restante se divide en dos planes (lo eligió el usuario):** 3e = Importaciones y Café (este); 3f = Plan de abastos y Esta semana.
2. **Excel: .xlsx real con las mismas hojas que el viejo (lo eligió el usuario).** Importaciones lleva siete hojas y Café cuatro (`_impExportar` 38459, `_cafeExportar` 39761).
   - **Librería:** se usa `xlsx` **0.20.3 de la CDN oficial de SheetJS**, que ya está en `package.json` (`"xlsx": "https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz"`, desde el proyecto base) y que ya usan `components/portal/tabla-resumen.tsx` y `components/sucursales/consumo-nacional.tsx`. No es el paquete `xlsx` de npm (atorado en 0.18.5 con avisos de seguridad: contaminación de prototipo, CVE-2023-30533, corregida en 0.19.3; y ReDoS, CVE-2024-22363, corregida en 0.20.2). La 0.20.3 ya trae las dos correcciones, y aquí solo se escribe, nunca se lee un archivo ajeno.
   - **No se agrega `exceljs`.** Sería una segunda librería de Excel en el bundle para lo mismo que hace `json_to_sheet`. Además el viejo usaba SheetJS (`XLSX.utils.json_to_sheet` / `book_append_sheet` / `writeFile`), así que el port es literal. **No hay dependencia nueva ni `npm install`.**
   - **Dónde se genera:** en el navegador, con `import('xlsx')` (se carga solo al pulsar el botón), a partir de las hojas que ya calculó el servidor y llegan como props. La llave de servicio no participa: no se lee nada más.
3. **"Crear OC" prellena el formulario de Órdenes (lo eligió el usuario).** Nada se crea solo: la persona revisa y guarda con la misma `guardarOc` de siempre.
   - **Enlace:** `/comercializadora/ordenes?nueva=importaciones|cafe&proveedor=…&l=SKU:cantidad` (un `l` por línea) `&monto=…&arribo=AAAA-MM-DD`. Son parámetros simples, no un payload codificado: se leen y se prueban fácil.
   - **Lista blanca** (`prellenadoOc`):
     - origen conocido y proveedor de texto (sin caracteres de control, 120 como máximo);
     - SKUs del catálogo, sin distinguir mayúsculas; se usa el del catálogo;
     - cantidades de más de 0 hasta 10 millones, y máximo 60 líneas;
     - monto de 0 a 10 mil millones y fecha de arribo real.

     Lo demás se descarta. Las líneas con un SKU que no está en el catálogo se cuentan y el aviso lo dice; los artículos del plan de importaciones pueden no estar en el catálogo.
   - **Como el viejo** (`_comNuevaOC` 32478): aviso "Revisa cantidades…", proveedor fijo ("sugerido por …, no editable"), monto y arribo estimados.
   - **Lo que cambia:** el folio lo escribe la persona; el viejo inventaba `OC-AAAAMMDD###`. Solo con permiso de edición.
   - **Etiquetas:** "Importaciones" y "Café". El viejo decía "Plan de abasto" para el café; se usa la etiqueta que pidió el usuario.
   - **Qué se prellena:** Importaciones (`_impCrearOC` 38270) pone lo de esta semana del proveedor, la inversión del modelo y la llegada más tardía. Café (`_planCrearOC` 34009) pone lo de hoy (`_planCantOC`), monto solo si todos tienen costo, y arribo = hoy + el lead time más largo.
   - **No se porta** el panel de visibilidad de la OC (`_comOCVisibilidad`/`_ocVisHtml`).
4. **Arquitectura y API para el 3f:**
   - `impCorrer(R, cfg, esc?) → CorridaImp { S, err, ent: { P, items, meta }, cfg, esc }`, `impAhoraDatos(c)` e `impRed(R, cfg, esc)`;
   - `cafeCorrer(R, cfg, esc?) → CorridaCafe { R, err, ent: { P, red }, cfg, esc }`;
   - `cafeOrdenes(R, cfg) → PlanCafe` (el `Plan` del 3d con `provs`, `minManual` y `vendorDe`);
   - `planProvs(c, R)`, la agrupación por proveedor que el 3f usará para el plan local.

   Todo recibe los datos del plan del 3d (`DatosPlan`, hoy = día de CDMX) y la configuración de `normalizarCfgMotor`. En el servidor de Next se calcula con `memoMotor` (una vez por datos + configuración + escenario).
5. **Los motores de las Sheets se copian, no se reescriben.** `_impEngine` y `_cafeEngine` ya son funciones puras CommonJS, sin dependencias, validadas 0-diff contra las Sheets (5,024 y 2,023 valores, cabecera 35791). Renombrar o tipar 1,500 líneas solo agrega riesgo de transcripción.
   - `scripts/comercializadora/portar-motores-hoja.mjs` copia el cuerpo de cada IIFE (36043–36920 y 36931–37565) con una cabecera y un `export` al final.
   - La Tarea 2 fija su sha256, y la paridad compara 100 corridas de importaciones y 36 de café, **más los errores**.
   - Llevan `// @ts-nocheck` (son JS); quien los usa los tipa al importarlos (`planImp.ts`, `planCafe.ts`).
6. **Rarezas de la hoja: se conserva lo que usan los equipos.**
   - `_impCfgDef` trae `corregir_hoja: true`, y con eso `_impArmar` (37759) apaga Q3, Q4 y Q5: `planDemandaCruzada = []`, `ultimoContenedorSinChequeoHorizonte = false` y `nContenedoresCalendario = 11`.
   - Con `corregir_hoja = false` se reproduce la hoja tal cual. `planDemandaCruzada` solo aplica si están INS-DES-012 e INS-DES-005. Las dos rutas se portan y se prueban.
   - Q1 (10 aperturas fijas) nunca aplica, porque el adaptador siempre manda `aperturasConsideradasOverride`. Su advertencia se oculta como en el viejo (`/^Aperturas consideradas con valores fijos|^Q1:/`).
   - Los textos que el motor arma y el viejo no mostraba (`S.resumen`, `consumo2027`, `compraPuenteEjemplo`) quedan en la salida pero no se pintan.
7. **Borradores de OC:** `_ZOC_INCLUIDA` no se porta (decisión 6 del 3d). `impOcLineas` usa `borradoresPlan` (los de la configuración **y** los `draft` de `com_zoho_oc_lineas`); el viejo solo usaba `_zocBorradorSet`. Un borrador nunca cuenta como en camino.
8. **Configuración:**
   - `normalizarCfgMotor` sigue dejando `imp` y `cafe` tal cual. `impCorrer`/`cafeCorrer` los normalizan con los ports (`cfgConImp`/`cfgConCafe`), como hacía `_planCfgNormalizar` (33072).
   - `config.ts`, `CAMPOS_CONFIG` y la pantalla de Configuración no cambian; `claveServidor` ya excluye `imp.` y `cafe.`.
   - Una sección guardada con basura se normaliza igual que en el viejo.
9. **Bug conocido que se corrige:** `_impVistaProyeccion` (38001) decía "con el escenario" + el escenario **guardado** aunque se viera otro. Ahora nombra el escenario que se está viendo. Es solo un texto.
10. **El escenario de la vista va en la URL (`?esc=`).** Solo cambia lo que se ve, como `_impUI.esc`/`_cafeUI.esc`; el de referencia se guarda en Parámetros. Un valor que no existe usa el guardado. En Café el viejo no lo validaba: un escenario inexistente hacía fallar el motor.
11. **Rutas y vistas:** `/comercializadora/importaciones` y `/comercializadora/cafe`, con `?vista=`. Van en "Planear y pagar" después de Indicadores (iconos `Ship` y `Coffee`).
   - **Vista simple por omisión**, como el viejo (`_planSimple` 40445: `plan_det !== '1'`):
     - Importaciones: Qué pedir, Contenedores, Proyección mensual y Parámetros.
     - Café: Qué pedir, Proyección del año y Parámetros.
   - **"Ver todo" (`?det=1`)** agrega:
     - en Importaciones: Detalle por artículo, Compra puente y Resumen;
     - en Café: Mes por mes y Presentaciones y precios;
     - en los dos: las tarjetas extra, el semáforo, la columna "Por qué" y la línea de tiempo.
   - **Filtros en la URL:**
     - `cuando=esta|prox`;
     - `todos=1` (Qué pedir muestra por omisión solo lo que requiere acción, `_ordUI.soloAcc = true`);
     - en el Detalle, `q`, `prov` y `solo=1` (apagado por omisión, `_impUI.soloAcc = false`).
12. **Guardar parámetros:** una acción `guardarParamsImpCafe(ambito, borrador, version)`.
   - Escribe **solo** `config.imp` o `config.cafe`, normalizada con el port, y conserva lo demás tal cual (`_planCfgAmbito` 34670).
   - Compara contra la versión que vio la pantalla, como `guardarMetasKpi`; el viejo preguntaba si se pisaba lo de otra persona.
   - Deja una fila de historial por clave (ámbito `config`) con `difConfig`: por ejemplo `imp.items.INS-DES-021.venta`, `imp.prov.1.lead` o `cafe.prod.white_1kg.mezcla`. El viejo guardaba la lista de proveedores entera como una clave (`imp.prov`); `difConfig` entra a cada campo, y `impCafeEtq` ya sabe nombrar `imp.prov.N.campo`.
   - No recalcula `com-minmax`: el servidor no lee estas secciones.
   - **Mientras el viejo siga en Real no se guarda en producción** (Global Constraints).
13. **Editores de parámetros (client):**
   - El borrador vive en el navegador. La tabla de la red se recalcula en vivo (`redConsiderada`, el mismo bucle de `_impRed`): el pipeline por mes no depende de la sección imp y lo manda el servidor.
   - El "impacto" en vivo del borrador (`_planCfgPintarImpactoImp`/`_Cafe`: lo que pediría con el borrador frente a lo guardado) **no se porta**. Al guardar, la página recalcula.
   - Candidatos y comparación con la plataforma salen del servidor con lo guardado. "Agregar" usa el renglón que armaría `_impAgregar`.
14. **Qué pedir de café** = `planBuild(R, cfg, { cafe: true })` del 3d más `_planAgruparProv` (33529):
   - Con los mínimos de Zoho (`R.zprov`) y la consolidación por mínimo; sin el historial de 60 días, que solo pinta el panel de proveedores del 3f.
   - Como en el viejo (`_planAplicarServidor`), las cantidades del servidor solo aplican al café si `compra.excluir_cafe = false`; si no, es el cálculo local.
   - El "Por qué" de esas filas lee `minimo`/`maximo` de `com_minmax` para esos SKUs (el `R.mm` del viejo, 33222), y solo si hace falta.
   - El portal no tiene borrador compartido, así que `_planRawVigente` siempre es R.
15. **No se porta de estas pantallas:**
   - `_planFuenteHtml` (el aviso de fuente de datos de la vista detallada; lo cubre "Datos del plan" de Indicadores);
   - `_actProximasHtml` (activaciones);
   - `_pagoChipHtml` (chip "PAGO …": va con Crédito/Pedidos, decisión 3 del 3d);
   - la fila AVISO de borrador del Excel: se exporta lo guardado.

   "Actualizar datos" es `ActualizarMotor` (3d).
16. **Las tablas de estas pantallas no paginan de 25 en 25** (excepción a la regla de los planes 3).
   - Van agrupadas por proveedor y paginar partiría las bandas.
   - Los tamaños están acotados: 300 artículos como máximo (`_impCfgNorm`), 19 en la hoja, 15 meses, 11 contenedores, 12 meses de café y unos pocos SKUs de café.

**Fuera de este plan:**
- Plan de abastos y Esta semana (3f), incluido `_psemGruposImp`, que consume `impCorrer`.
- "Todo lo demás" (decisión 2 del 3d).
- El panel de proveedores del plan local con historial (3f).

## Mapa de archivos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `supabase/functions/_shared/impCafeCfg.ts` | 1 | Semillas, `_impCfgNorm`, `_cafeCfgNorm`, etiquetas |
| `supabase/functions/_shared/pruebas/fixturesImp.ts` | 1, 3, 4 | Entradas de los motores y datos de prueba de Importaciones y Café |
| `scripts/comercializadora/portar-motores-hoja.mjs` | 2 | Copia los dos motores del HTML viejo |
| `supabase/functions/_shared/impEngine.ts`, `cafeEngine.ts` | 2 | Los motores de las Sheets (generados) |
| `supabase/functions/_shared/planImp.ts` | 3 | `_impArmar`, `_impCorrer`, `_impAhoraDatos` |
| `supabase/functions/_shared/planDatos.ts` | 4 | `DatosPlan.zprov` |
| `supabase/functions/_shared/planProv.ts` | 4 | `_minVendorDeGrupo`, `_planConsolidar`, `_planAgruparProv` |
| `supabase/functions/_shared/planCafe.ts` | 4 | `_cafeRed`, `_cafeArmar`, `_cafeCorrer`, `_cafeOrdenes`, `_planResumen`, `_planCantOC`, `_cafeKgDe` |
| `lib/comercializadora/motor.ts` | 3, 4 | `importacionesMotor`, `cafeMotor`, `cafeOrdenesMotor`; lectura de `com_zoho_proveedor` |
| `lib/comercializadora/crearOc.ts` | 5 | Enlace y lista blanca del prellenado; qué prellena cada pantalla |
| `app/.../ordenes/page.tsx`, `components/comercializadora/ordenes.tsx` | 5 | Formulario de nueva OC prellenado |
| `lib/comercializadora/excelImpCafe.ts`, `components/comercializadora/descargar-excel.tsx` | 6 | Hojas del Excel y botón |
| `lib/comercializadora/paramsImpCafe.ts`, `paramsContexto.ts` | 7 | Ayudas de los editores (client) y lo que el servidor les prepara |
| `components/comercializadora/parametros-imp-cafe.tsx` | 7 | Editores de parámetros |
| `app/(comercializadora)/comercializadora/acciones.ts` | 7 | `guardarParamsImpCafe` |
| `lib/comercializadora/importaciones.ts` | 8 | Formatos, vistas, avisos, cifras, por qué, línea de tiempo |
| `components/comercializadora/vistas-plan.tsx`, `selector-escenario.tsx` | 8 | Piezas comunes: vistas, avisos, cifras, secciones, tabla "Qué pedir", escenario |
| `components/comercializadora/importaciones.tsx`, `app/.../importaciones/page.tsx` | 8 | Pantalla Importaciones |
| `lib/comercializadora/cafe.ts`, `components/comercializadora/cafe.tsx`, `app/.../cafe/page.tsx` | 9 | Pantalla Café |
| `components/portal/navegacion.tsx` | 8, 9 | Importaciones y Café en "Planear y pagar" |

## Global Constraints

- Las de los planes 3 a 3d:
  - ruta `/comercializadora/*`;
  - acceso por `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` escriben);
  - día de CDMX (en el motor, `R.hoy` es el día de CDMX);
  - piezas de `components/portal/piezas.tsx` y tablas `.tabla`, con la excepción de la decisión 16;
  - montos MXN (`dinero` = `_planMoney`, sin centavos, como el viejo en estas pantallas);
  - pruebas: `npm test`, `npm run typecheck`, `npm run test:funciones` y prettier sobre lo tocado de `app`, `components`, `lib` y `tests`.
- **Paridad:** cada port de `_shared` (todo menos los motores generados) es literal, con los mismos nombres sin `_`, estilo `var` y `// deno-lint-ignore-file`. Next lo importa, así que también pasa `tsc` en modo strict.
- **Los motores generados no se editan a mano.** Si cambian en el viejo, se vuelve a correr el script y se actualiza el sha256 de la Tarea 2.
- **Las pruebas de paridad se ignoran sin `COM_APP_VIEJA`.** Para ver el RED y el GREEN de las Tareas 1 a 4 hay que exportar antes (Git Bash):
  ```bash
  git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" show a9e4a22:app/index.html > "$TEMP/app-vieja-a9e4a22.html"
  export COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html"
  ```
  Una prueba de paridad que sale "ignored" no cuenta como verde.
- `pruebas/fixturesImp.ts` **no** importa `pruebas/appVieja.ts`, que lee `Deno.env`: también lo importan las pruebas de Vitest.
- Las acciones sin permiso responden `{ error: 'Tu acceso a Comercializadora es de solo lectura.' }` sin tocar la base.
- La llave de servicio solo se usa en `lib/comercializadora/legado.ts`. `motor.ts` y `paramsContexto.ts` son server-only. Ningún client component importa `motor.ts`, `legado.ts`, `paramsContexto.ts` ni los motores (`planImp.ts`, `planCafe.ts`): los editores importan `paramsImpCafe.ts`, que solo trae la configuración.
- **Sin migraciones ni cambios en bliocjvq.** Nada se escribe en producción durante la revisión.
- **Mientras el viejo siga en Real, en producción no se guardan parámetros de Importaciones ni de Café** y no se guarda ninguna OC prellenada durante la revisión. La copia en espejo las borraría y el viejo sigue siendo la fuente.

## Review Focus

1. **Sección imp/cafe guardada incompleta o con basura:** de otra versión, editada a mano, un proveedor sin lead time, una familia o un proveedor que ya no existe, un SKU que salió del catálogo. Se normaliza como el viejo, la pantalla no se rompe y los avisos lo dicen. Lo cubren:
   - Tarea 1 (secciones con basura, 300 artículos, 12 proveedores);
   - Tarea 3 (familia "Inventada", proveedor "Nadie", SKU fuera del catálogo);
   - Tarea 7 (el borrador se normaliza al guardar);
   - Tarea 8 (avisos).
2. **Fechas que cruzan el año:** el horizonte de 15 meses (nov-26 a ene-28), 31 de diciembre, 1 de enero, 29 de febrero y el día 1 sin prorrateo. Café es año calendario y toma oct-dic del año anterior. Lo cubren la Tarea 2 (cinco fechas de corte), la Tarea 3 (`impMesClave` y los días 1/31) y la Tarea 4 (años 2026 y 2028 y una apertura movida a octubre).
3. **El puente no responde, no se leen las aperturas o los mínimos de Zoho:**
   - Las pantallas muestran el error sin números (Tareas 8 y 9, "sin puente").
   - Los avisos dicen que faltan aperturas (Tareas 8 y 9).
   - Sin mínimos se sigue con un aviso (Tarea 4).
   - Sin aperturas, el arranque del café es 0 y no NaN (Tarea 4).
4. **Contenedor sin artículos o con CBM en cero; listas grandes:**
   - Un proveedor de contenedores con un lead time de 400 + 120 (Tarea 2, `sin_contenedor`).
   - Contenedores sin artículos lo dice en lugar de pintar una tabla vacía (Tarea 8).
   - Más de 300 artículos se recortan (Tarea 1). Más de 60 líneas en "Crear OC" se recortan (Tarea 5).
5. **Dos personas guardan a la vez, o una URL de "Crear OC" alterada:**
   - Con la misma versión gana la primera y la otra recibe "Otra persona guardó…" sin escribir (Tarea 7).
   - En una URL alterada se descartan SKUs ajenos, cantidades negativas, montos y fechas malos y caracteres de control (Tarea 5).

---

### Task 1: Configuración de Importaciones y Café (semillas, `_impCfgNorm`, `_cafeCfgNorm`, etiquetas) con paridad

**Files:**
- Create: `supabase/functions/_shared/impCafeCfg.ts`
- Create: `supabase/functions/_shared/pruebas/fixturesImp.ts`
- Test: `supabase/functions/_shared/impCafeCfg_parity_test.ts`

**Interfaces:**
- Consumes: `planCfgNum(v, rango: [min, max, entero], def)` de `planEngine.ts`; `impTxt(v, max?)` e `impFechaOk(s)` de `planDatos.ts` (ya existen).
- Produces (`impCafeCfg.ts`):
  - semillas `IMP_HOJA_ITEMS: any[][]`, `IMP_HOJA_PROV: any[]`, `IMP_HOJA_TEMP: Record<string, number[]>`, `CAFE_PROD: { id; nombre; color; pres; kg }[]` y `CAFE_HOJA: any`;
  - listas `IMP_ESCS = ['Pesimista','Base','Optimista','Manual']`, `CAFE_ESCS = ['Pesimista','Base','Optimista']`, `IMP_CONT_TIPOS` y `MESES_ABR`;
  - `impClave(v): string`, `impArr(a, n, rango, def): any[]`, `impMapMes(src, rango, def): Record<string, number>` e `impMesTxt(k): string`;
  - `impCfgDef(): any`, `impCfgNorm(x: any): any`, `cafeCfgDef(): any` y `cafeCfgNorm(x: any): any`;
  - `IMP_ETQ`, `IMP_ETQ_CAMPO` e `impCafeEtq(clave: string, imp?: any): string`. `imp` es la sección imp normalizada con la que se nombra a un proveedor; el viejo leía el borrador global.
- Produces (`pruebas/fixturesImp.ts`, solo pruebas): `NOMBRES_IMP_CFG: string[]`, `entradaImpHoja(ci, hoy, o?) → { P, items }`, `hoyMas(iso, n)` y `entradaCafe(cc, esc, red | null) → P`.

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/pruebas/fixturesImp.ts` (ayudante; las Tareas 3 y 4 le agregan más):

```ts
// deno-lint-ignore-file no-explicit-any
// Datos de prueba de Importaciones y Café (plan 3e): entradas de los motores de las Sheets y los nombres de la app vieja
// que hay que evaluar para la paridad. No importa appVieja.ts (que lee Deno.env): también lo usan las pruebas de Vitest.
import { CAFE_PROD, IMP_ESCS } from "../impCafeCfg.ts";

/** Generador determinista (el mismo de appVieja.ts). */
function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** Configuración de Importaciones y Café (impCafeCfg.ts). */
export const NOMBRES_IMP_CFG = [
  "_planCfgNum", "_MESES_ABR", "_IMP_HOJA_ITEMS", "_IMP_HOJA_PROV", "_IMP_HOJA_TEMP", "_CAFE_PROD", "_CAFE_HOJA", "_IMP_ESCS",
  "_IMP_CONT_TIPOS", "_IMP_DEF_JSON", "_impTxt", "_impClave", "_impArr", "_impMapMes", "_impMesTxt", "_impFechaOk",
  "_impCfgDef", "_impCfgNorm", "_cafeCfgDef", "_cafeCfgNorm", "_IMP_ETQ", "_IMP_ETQ_CAMPO", "_impCafeEtq",
];

/**
 * Entrada del motor de importaciones armada a mano desde una sección imp normalizada (sin la plataforma): inventario y
 * en camino deterministas por artículo. Sirve para la paridad del motor, que no depende de la plataforma.
 */
export function entradaImpHoja(ci: any, hoy: string, o: { esc?: string; seed?: number; sucHoy?: number; corregir?: boolean } = {}) {
  const r = rng(o.seed ?? 7), items: any[] = [];
  ci.orden.forEach((sku: string, i: number) => {
    const it = ci.items[sku];
    if (!it || it.activo === false) return;
    const conCamino = r() < 0.4, local = r() < 0.2;
    items.push({ sku, producto: it.nombre, familia: it.familia, proveedor: it.prov, unidad: it.unidad,
      stockHoy: Math.round(r() * 400) - (i === 3 ? 500 : 0), ventaSucursalMes: it.venta, kitApertura: it.kit, empaque: it.empaque,
      minimoProveedor: it.minimo, costoUnitario: it.costo, yaComprado: conCamino ? Math.round(r() * 300) : 0,
      llega: conCamino ? hoyMas(hoy, Math.round(r() * 120) - 10) : null, compraLocal: local ? 40 : 0, llegaLocal: local ? hoyMas(hoy, 75) : null,
      origen: "", largoCm: null, anchoCm: null, altoCm: null, cbmDato: it.cbm, fuenteCbm: it.cbm_fuente, aliasPlan: it.alias });
  });
  const cons: any = { proveedorContenedor: (ci.prov.find((p: any) => p.contenedor) || ci.prov[0]).clave };
  if (o.corregir ?? ci.corregir_hoja) { cons.planDemandaCruzada = []; cons.ultimoContenedorSinChequeoHorizonte = false; cons.nContenedoresCalendario = 11; }
  const plan: number[] = [], cierres: number[] = [], ovr: number[] = [];
  for (let m = 0; m < 15; m++) { plan.push(ci.red.plan_def + (m % 4)); cierres.push(m === 6 ? 1 : 0); ovr.push(m < 3 ? m + 2 : ci.red.plan_def); }
  const P: any = { fechaCorte: hoy, escenarioActivo: o.esc ?? ci.escenario, escenarios: {},
    red: { sucursalesHoy: o.sucHoy ?? 80, aperturasPlan: plan, cierres, aperturasConsideradasOverride: ovr },
    politica: { mesesCobertura: ci.politica.meses_cobertura, mesesRespaldo: ci.politica.meses_respaldo, diasMargen: ci.politica.dias_margen, diasJuntarPedido: ci.politica.dias_juntar },
    proveedores: ci.prov.map((p: any) => ({ clave: p.clave, nombre: p.nombre, leadNormal: p.lead, leadCierres: p.cierres, fuente: p.nota })),
    contenedor: { tipo: ci.contenedor.tipo, opciones: [{ tipo: "40' HQ", cbm: ci.contenedor.cbm40 }, { tipo: "45' HQ", cbm: ci.contenedor.cbm45 }, { tipo: "Personalizado", cbm: ci.contenedor.cbmp }],
      llenadoReal: ci.contenedor.llenado, contenedoresPorEmbarque: ci.contenedor.por_embarque, diasRespaldoSiguiente: ci.contenedor.dias_respaldo },
    compraPuente: { diasColchon: ci.puente.dias_colchon, multiplo: ci.puente.multiplo },
    temporada: JSON.parse(JSON.stringify(ci.temporada)), constantes: cons };
  IMP_ESCS.forEach((k) => { const e = ci.escenarios[k]; P.escenarios[k] = { crecimientoAnual: e.crec, cumplimientoAperturas: e.cumpl, ajusteDemanda: e.ajuste }; });
  return { P, items };
}
export function hoyMas(iso: string, n: number): string {
  const p = iso.split("-");
  return new Date(Date.UTC(+p[0], +p[1] - 1, +p[2]) + n * 864e5).toISOString().slice(0, 10);
}

/** Entrada del motor de café desde una sección cafe normalizada con un arranque dado (como _cafeArmar). */
export function entradaCafe(cc: any, esc: string, red: { ini: number; a0: number } | null) {
  const P: any = { anio: cc.anio, escenarioActivo: esc, escenarios: [], cierresPorMes: cc.cierres.slice(), ajusteGeneral: cc.ajuste,
    pctComprometer: cc.comprometer, curva2a6: cc.curva.slice(), estacionalidad: cc.estacionalidad.slice(), compra2026Kg: cc.compra_ant, productos: [] };
  ["Pesimista", "Base", "Optimista"].forEach((k) => {
    const e = cc.escenarios[k];
    P.escenarios.push({ nombre: k, crecimientoAnual: e.crec, compraMadura: e.madura, compraMesApertura: e.apertura,
      sucursalesInicio: red ? red.ini : e.ini, aperturasOctDic2026: red ? red.a0 : e.a0, aperturasPorMes: e.aper.slice() });
  });
  CAFE_PROD.forEach((p) => {
    const a = cc.prod[p.id];
    P.productos.push({ id: p.id, nombre: p.nombre, colorGrupo: p.color, presentacion: p.pres, mezclaPct: a.mezcla, kgPorBolsa: p.kg,
      vigente: { precioKg: a.precio, empaque: a.empaque, precioVentaBolsa: a.venta }, nuevo: { precioKg: a.nuevo_precio, empaque: a.nuevo_empaque },
      notaVigente: a.empaque > 0 ? "Empaque fijo $7.57 (precio actual). Revisar precio de venta." : null });
  });
  return P;
}
```

Crear `supabase/functions/_shared/impCafeCfg_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de la configuración de Importaciones y Café: _impCfgDef/_impCfgNorm, _cafeCfgDef/_cafeCfgNorm y _impCafeEtq
// de la app contra impCafeCfg.ts, con secciones completas, vacías y con basura.
import { assert, assertEquals } from "@std/assert";
import { cafeCfgDef, cafeCfgNorm, impCafeEtq, impCfgDef, impCfgNorm, impMesTxt } from "./impCafeCfg.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_IMP_CFG } from "./pruebas/fixturesImp.ts";

const A = SIN_APP ? null : app(NOMBRES_IMP_CFG, "var _planCfgDraft=null;", "2026-11-13");

const IMPS: any[] = [
  null, undefined, "x", 7, [], {},
  { escenario: "Manual", escenarios: { Base: { crec: "0.2", cumpl: 9, ajuste: null }, Raro: { crec: 1 }, Optimista: "no" } },
  { red: { suc_hoy_modo: "manual", suc_hoy: "120.6", meses_pipeline: 99, plan_def: -3, plan: { "2027-01": "12", "2027-13": 4, "1999-01": 2, "2027-02": "", "2027-03": null }, cierres: [1, 2] } },
  { politica: { meses_cobertura: 0, meses_respaldo: "2.5", dias_margen: "x", dias_juntar: 999 } },
  { prov: [{ clave: "Green.Packaging  ", nombre: "", lead: 0, cierres: 500, contenedor: false }, { clave: "green packaging" }, null, { clave: "", nombre: "sin clave" },
    { clave: "Otro", nombre: "Otro\u0007 proveedor", lead: "60", nota: "n".repeat(300), contenedor: true }] },
  { prov: Array.from({ length: 20 }, (_, i) => ({ clave: "P" + i, lead: i * 30 })) },
  { prov: [] },
  { contenedor: { tipo: "20' DV", cbm40: 0, cbm45: "500", llenado: 0.01, por_embarque: 2.4, dias_respaldo: -1 }, puente: { dias_colchon: "", multiplo: 0 } },
  { temporada: { "Vaso.frío": [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 20], Corta: [1, 2], "": [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] } },
  { temporada: { General: Array(12).fill("x") } },
  { fuentes: { venta: "plataforma", kit: "otro" }, venta_ventana: 10, corregir_hoja: false, prorratear_mes1: "no" },
  { items: { "INS-DES-021": { venta: "0.9", activo: false, camino_qty: 50, camino_fecha: "2026-12-01" }, "SKU.CON.PUNTOS": { nombre: "Con puntos", familia: "Fam.X", prov: "P.1", empaque: 0 },
    "INS-DES-002": "no", "NUEVO-1": { camino_fecha: "2026-13-45", cbm: 500, costo: -1 } }, orden: ["NUEVO-1", "INS-DES-021", "NO-EXISTE"] },
  { items: Object.fromEntries(Array.from({ length: 320 }, (_, i) => ["SKU-" + i, { venta: i }])) },
];
const CAFES: any[] = [
  null, "x", {},
  { anio: "2031.6", escenario: "Manual", q4_modo: "manual", ajuste: 5, comprometer: -1, compra_ant: "abc" },
  { escenarios: { Base: { crec: 2, madura: "40", apertura: null, ini: 3000.7, a0: "x", aper: [1, 2, "3", null] }, Pesimista: 4 } },
  { cierres: [1, 2, 3], curva: ["40", 41], estacionalidad: Array(12).fill(20) },
  { prod: { white_1kg: { mezcla: 2, precio: "300", empaque: null, venta: "", nuevo_precio: "", nuevo_empaque: 9 }, raro: { mezcla: 1 }, black_250g: "no" } },
];

Deno.test({ name: "paridad: impCfgDef/impCfgNorm = _impCfgDef/_impCfgNorm (también con basura)", ignore: SIN_APP }, () => {
  assertEquals(impCfgDef(), A._impCfgDef());
  for (const x of IMPS) assertEquals(impCfgNorm(x), A._impCfgNorm(x), JSON.stringify(x)?.slice(0, 120));
});

Deno.test({ name: "paridad: cafeCfgDef/cafeCfgNorm = _cafeCfgDef/_cafeCfgNorm", ignore: SIN_APP }, () => {
  assertEquals(cafeCfgDef(), A._cafeCfgDef());
  for (const x of CAFES) assertEquals(cafeCfgNorm(x), A._cafeCfgNorm(x), JSON.stringify(x));
});

Deno.test({ name: "paridad: impCafeEtq = _impCafeEtq (el proveedor se nombra con la sección imp)", ignore: SIN_APP }, () => {
  const imp = impCfgNorm({});
  const claves = ["imp.escenario", "imp.items.INS-DES-021.venta", "imp.items.X", "imp.escenarios.Base.crec", "imp.red.plan.2027-03",
    "imp.red.cierres.2026-12", "imp.temporada.Termos.11", "imp.temporada.Termos", "imp.prov.0.lead", "imp.prov.9.nota", "imp.orden.3",
    "imp.otra", "cafe.anio", "cafe.escenarios.Base.aper.4", "cafe.escenarios.Optimista.madura", "cafe.cierres.0", "cafe.curva.2",
    "cafe.estacionalidad.11", "cafe.prod.white_250g.venta", "cafe.prod.zzz.precio", "cafe.otra"];
  const B = app(NOMBRES_IMP_CFG, "var _planCfgDraft={imp:" + JSON.stringify(imp) + "};", "2026-11-13");
  for (const k of claves) assertEquals(impCafeEtq(k, imp), B._impCafeEtq(k), k);
});

Deno.test("impCfgNorm: SKU con puntos y orden con claves repetidas; máximo 300 artículos y 12 proveedores", () => {
  const c = impCfgNorm(IMPS[16]);
  assertEquals(c.orden.slice(0, 2), ["NUEVO-1", "INS-DES-021"]);
  assert(c.items["SKU CON PUNTOS"] && c.items["SKU CON PUNTOS"].familia === "Fam X");
  assertEquals(c.items["NUEVO-1"].camino_fecha, "");
  assertEquals(impCfgNorm(IMPS[17]).orden.length, 300);
  assertEquals(impCfgNorm(IMPS[10]).prov.length, 12);
  assertEquals(impCfgNorm(IMPS[11]).prov.length, 4); // lista vacía: se quedan los de la hoja
  assertEquals(impMesTxt("2027-01"), "Ene 27");
  assertEquals(impMesTxt("2027-13"), "2027-13");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA` exportada): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/impCafeCfg_parity_test.ts`
Expected: FAIL. `Module not found ".../impCafeCfg.ts"`.

- [ ] **Step 3: El port**

Crear `supabase/functions/_shared/impCafeCfg.ts`. Es 35800–35871 (semillas y ayudas), `_impCfgDef` 35873, `_impCfgNorm` 35897, `_cafeCfgDef` 35967, `_cafeCfgNorm` 35981, `_IMP_ETQ`/`_IMP_ETQ_CAMPO` 36010 y `_impCafeEtq` 36018, línea por línea:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la configuración de Importaciones y Café del sitio viejo (app/index.html a9e4a22, líneas 35800–36038):
// los parámetros que vienen de las Sheets (_IMP_HOJA_*, _CAFE_*), _impCfgDef/_impCfgNorm, _cafeCfgDef/_cafeCfgNorm y las
// etiquetas del historial (_IMP_ETQ, _impCafeEtq). Mismos nombres sin el guion bajo. impCafeCfg_parity_test.ts compara
// contra la app.
import { planCfgNum } from "./planEngine.ts";
import { impFechaOk, impTxt } from "./planDatos.ts";

// ── Parámetros que vienen de tu Sheet de importados (se precargan; son tuyos y se pueden cambiar) ──
export var IMP_HOJA_ITEMS: any[][] = [
  ['INS-DES-021','Vaso caliente 12 oz','Vaso caliente','Green Packaging','cajas',0.6314,1.95,1,200,568.19,0.079,'Confirmado por Procurement (1-oct-26)','KRAFT 12 OZ'],
  ['INS-DES-002','Vaso 120 ml (espresso)','Vaso 120 ml','Green Packaging','cajas',0.025,0.8,1,40,697.44,0.06,'Estimado: confirmar','KRAFT ESPRESSO'],
  ['INS-DES-003','Vaso frío 20 oz','Vaso frío','Green Packaging','cajas',0.5482,1.35,1,100,1360,0.096,'Confirmado por Procurement (1-oct-26)','PET 20 OZ'],
  ['INS-DES-004','Vaso caliente 8 oz','Vaso caliente','Green Packaging','cajas',0.7013,2.55,1,200,510,0.065,'Confirmado por Procurement (1-oct-26)','KRAFT 8 OZ'],
  ['INS-DES-005','Vaso frío 14 oz (440 ml)','Vaso frío','Green Packaging','cajas',0.9029,1.5,1,100,960,0.1,'Confirmado por Procurement (1-oct-26)','PET 14 OZ'],
  ['INS-DES-012','Tapa caliente 80 mm (8 oz)','Tapa caliente','Green Packaging','cajas',0.3489,1.25,1,50,360,0.035,'Confirmado por Procurement (1-oct-26)','PS BLACK LID 80 MM'],
  ['INS-DES-013','Tapa caliente 90 mm (12 oz)','Tapa caliente','Green Packaging','cajas',0.3367,1,1,50,349.62,0.046,'Confirmado por Procurement (1-oct-26)','PS BLACK LID 90 MM'],
  ['INS-DES-008','Tapa plana vaso frío','Tapa fría','Green Packaging','cajas',1.3946,2.75,1,50,296.44,0.031,'Confirmado por Procurement (1-oct-26)','PET TRANSPARENT FLAT LID'],
  ['MER-TER-001','Termo 240 ml blanco','Termos','Easy Drinkware','piezas',0.7589,4.75,48,1000,120.15,0.001375,'',''],
  ['MER-TER-002','Termo 240 ml negro','Termos','Easy Drinkware','piezas',0.6493,4.9,48,1000,120.15,0.001375,'',''],
  ['MER-TER-003','Termo 360 ml blanco','Termos','Easy Drinkware','piezas',0.7881,3.5,48,1000,127.71,0.001667,'',''],
  ['MER-TER-004','Termo 360 ml negro','Termos','Easy Drinkware','piezas',0.7641,2.15,48,1000,127.71,0.001667,'',''],
  ['MER-TAZ-001','Taza 300 ml negra','Tazas','Proveedor actual (vía SIMBS)','piezas',0.2369,4.7,1,0,76.22,0,'',''],
  ['MER-TAZ-002','Taza 300 ml blanca','Tazas','Proveedor actual (vía SIMBS)','piezas',0.2975,4.7,1,0,76.22,0,'',''],
  ['MER-PAR-001','Paraguas blanco','Paraguas','Proveedor actual (vía SIMBS)','piezas',0.0931,2.85,1,0,172.07,0,'',''],
  ['MER-PAR-002','Paraguas transparente','Paraguas','Proveedor actual (vía SIMBS)','piezas',0.1249,2.9,1,0,172.07,0,'',''],
  ['INS-BA-063','Bolsa café 250 g negra','Merch café / bolsas','LQC Printing','paq. 25',0.0612,0.182,56,0,189.25,0,'',''],
  ['INS-BA-064','Bolsa café 250 g kraft','Merch café / bolsas','LQC Printing','paq. 25',0.1153,0.186,52,0,189.25,0,'',''],
  ['INS-BA-065','Bolsa café 250 g blanca','Merch café / bolsas','LQC Printing','paq. 25',0.2336,0.318,56,0,189.25,0,'','']
];
export var IMP_HOJA_PROV: any[] = [
  {clave:'Green Packaging',nombre:'Green Packaging (vasos y tapas)',lead:85,cierres:15,nota:'Órdenes reales: 79-97 días a puerto + aduana y flete. Cierres: Año Nuevo Chino / fin de año.',contenedor:true},
  {clave:'Easy Drinkware',nombre:'Easy Drinkware (termos)',lead:90,cierres:8,nota:'35 días de producción confirmados por el proveedor; resto estimado.',contenedor:false},
  {clave:'Proveedor actual (vía SIMBS)',nombre:'Tazas y paraguas (vía SIMBS)',lead:90,cierres:10,nota:'Lead time registrado en Zoho.',contenedor:false},
  {clave:'LQC Printing',nombre:'LQC Printing (bolsas)',lead:90,cierres:10,nota:'Supuesto: el proveedor no ha confirmado tiempos.',contenedor:false}
];
export var IMP_HOJA_TEMP: Record<string, number[]> = {
  'Vaso caliente':[1.277,1.085,1,1,1,1,1,1,1,1.048,1.129,1.249],
  'Tapa caliente':[1.277,1.085,1,1,1,1,1,1,1,1.048,1.129,1.249],
  'Vaso frío':[0.842,1.101,1,1,1,1,1,1,1,0.919,0.862,0.809],
  'Tapa fría':[0.842,1.101,1,1,1,1,1,1,1,0.919,0.862,0.809],
  'Vaso 120 ml':[1,1,1,1,1,1,1,1,1,1,1,1],
  'Termos':[1.11,0.96,1,1,1,1,1,1,1,1.36,1.84,2.06],
  'Tazas':[1.33,0.87,1,1,1,1,1,1,1,0.95,2.38,2.53],
  'Paraguas':[0.12,0.1,0.3,0.5,1,1.3,1.3,1.3,1,0.3,0.1,0.1],
  'Merch café / bolsas':[1.561,1.146,1,1,1,1,1,1,1,1,1.142,1.529],
  'General':[1,1,1,1,1,1,1,1,1,1,1,1]
};
// ── Parámetros que vienen de tu Sheet de café 2027 ──
export var CAFE_PROD: { id: string; nombre: string; color: string; pres: string; kg: number }[] = [
  {id:'white_1kg',nombre:'White 1 kg',color:'White',pres:'1 kg',kg:1},
  {id:'kraft_1kg',nombre:'Kraft 1 kg',color:'Kraft',pres:'1 kg',kg:1},
  {id:'black_1kg',nombre:'Black 1 kg',color:'Black',pres:'1 kg',kg:1},
  {id:'white_250g',nombre:'White 250 g',color:'White',pres:'250 g',kg:0.25},
  {id:'kraft_250g',nombre:'Kraft 250 g',color:'Kraft',pres:'250 g',kg:0.25},
  {id:'black_250g',nombre:'Black 250 g',color:'Black',pres:'250 g',kg:0.25}
];
export var CAFE_HOJA: any = {
  mezcla:[0.886,0.031,0.023,0.03,0.019,0.011],precio:[280,310,400,280,310,400],empaque:[0,0,0,7.57,7.57,7.57],venta:[400,426.6,500,100,106.65,125],
  nuevo_precio:[220,250,280,220,250,280],nuevo_empaque:[null,null,null,7.57,7.57,7.57],
  nota_empaque:'Empaque fijo $7.57 (precio actual). Revisar precio de venta.'
};

export var IMP_ESCS = ['Pesimista','Base','Optimista','Manual'];
export var CAFE_ESCS = ['Pesimista','Base','Optimista'];
export var IMP_CONT_TIPOS = ["40' HQ","45' HQ",'Personalizado'];
export var MESES_ABR = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
var IMP_DEF_JSON: string | null = null, CAFE_DEF_JSON: string | null = null;
// Las claves (SKU, proveedor, familia) viajan dentro de rutas "a.b.c" del historial de cambios: no pueden llevar puntos.
export function impClave(v: any): string { return impTxt(v,60).replace(/\./g,' ').replace(/\s+/g,' '); }
export function impArr(a: any, n: number, rango: [number, number, number], def: any[]): any[] { var o: any[] = [],i; for(i=0;i<n;i++)o.push(planCfgNum(Array.isArray(a)?a[i]:undefined,rango,def[i])); return o; }
// Mapa por mes calendario 'AAAA-MM' -> número (el plan no se corre cuando pasa el tiempo: cada mes conserva su valor).
export function impMapMes(src: any, rango: [number, number, number], def: any): Record<string, number> {
  if(src&&typeof src==='object'&&!Array.isArray(src)){
    var out: Record<string, number> = {};
    Object.keys(src).slice(0,240).forEach(function(k){if(/^20\d\d-(0[1-9]|1[0-2])$/.test(k)&&src[k]!==null&&src[k]!==''&&src[k]!==undefined)out[k]=planCfgNum(src[k],rango,0);});
    return out;
  }
  return JSON.parse(JSON.stringify(def));
}
export function impMesTxt(k: any): string { var p=String(k).split('-'); return p.length<2||!(+p[1]>=1&&+p[1]<=12)?String(k):MESES_ABR[+p[1]-1]+' '+p[0].slice(2); }

export function impCfgDef(): any {
  if(!IMP_DEF_JSON){
    var items: Record<string, any> = {},orden: string[] = [],temporada: Record<string, number[]> = {};
    IMP_HOJA_ITEMS.forEach(function(a){
      items[a[0]]={nombre:a[1],familia:a[2],prov:a[3],unidad:a[4],venta:a[5],kit:a[6],empaque:a[7],minimo:a[8],costo:a[9],cbm:a[10],cbm_fuente:a[11],alias:a[12],activo:true,camino_qty:0,camino_fecha:''};
      orden.push(a[0]);
    });
    Object.keys(IMP_HOJA_TEMP).forEach(function(k){temporada[k]=IMP_HOJA_TEMP[k].slice();});
    IMP_DEF_JSON=JSON.stringify({
      escenario:'Base',
      escenarios:{Pesimista:{crec:0.05,cumpl:0.6,ajuste:-0.1},Base:{crec:0.1,cumpl:1,ajuste:0},Optimista:{crec:0.15,cumpl:1.2,ajuste:0.1},Manual:{crec:0.06,cumpl:1,ajuste:0}},
      red:{suc_hoy_modo:'auto',suc_hoy:75,meses_pipeline:3,plan_def:10,plan:{'2026-10':9,'2026-11':8,'2026-12':8},cierres:{}},
      politica:{meses_cobertura:3,meses_respaldo:1,dias_margen:7,dias_juntar:60},
      prov:IMP_HOJA_PROV,
      contenedor:{tipo:"40' HQ",cbm40:70,cbm45:86,cbmp:70,llenado:1,por_embarque:1,dias_respaldo:15},
      puente:{dias_colchon:7,multiplo:5},
      temporada:temporada,
      fuentes:{venta:'hoja',kit:'hoja'},venta_ventana:90,
      corregir_hoja:true,prorratear_mes1:true,
      orden:orden,items:items
    });
  }
  return JSON.parse(IMP_DEF_JSON as string);
}
export function impCfgNorm(x: any): any {
  var c=impCfgDef(),d=impCfgDef(),N=planCfgNum;
  if(!x||typeof x!=='object')return c;
  var es=x.escenarios&&typeof x.escenarios==='object'?x.escenarios:{};
  IMP_ESCS.forEach(function(k){
    var e=es[k];if(!e||typeof e!=='object')return;
    c.escenarios[k]={crec:N(e.crec,[-0.5,1,0],d.escenarios[k].crec),cumpl:N(e.cumpl,[0,3,0],d.escenarios[k].cumpl),ajuste:N(e.ajuste,[-0.9,2,0],d.escenarios[k].ajuste)};
  });
  if(IMP_ESCS.indexOf(x.escenario)>=0)c.escenario=x.escenario;
  var r=x.red&&typeof x.red==='object'?x.red:{};
  c.red.suc_hoy_modo=r.suc_hoy_modo==='manual'?'manual':'auto';
  c.red.suc_hoy=N(r.suc_hoy,[0,5000,1],d.red.suc_hoy);
  c.red.meses_pipeline=N(r.meses_pipeline,[0,15,1],d.red.meses_pipeline);
  c.red.plan_def=N(r.plan_def,[0,500,1],d.red.plan_def);
  c.red.plan=impMapMes(r.plan,[0,500,1],d.red.plan);
  c.red.cierres=impMapMes(r.cierres,[0,500,1],d.red.cierres);
  var po=x.politica&&typeof x.politica==='object'?x.politica:{};
  c.politica={meses_cobertura:N(po.meses_cobertura,[1,14,1],3),meses_respaldo:N(po.meses_respaldo,[0,6,0],1),dias_margen:N(po.dias_margen,[0,60,1],7),dias_juntar:N(po.dias_juntar,[0,180,1],60)};
  if(Array.isArray(x.prov)){
    var provs: any[] = [],vistos: Record<string, 1> = {};
    x.prov.slice(0,12).forEach(function(p: any){
      if(!p||typeof p!=='object')return;
      var k=impClave(p.clave);if(!k||vistos[k.toLowerCase()])return;
      vistos[k.toLowerCase()]=1;
      provs.push({clave:k,nombre:impTxt(p.nombre,80)||k,lead:N(p.lead,[1,400,1],90),cierres:N(p.cierres,[0,120,1],0),nota:impTxt(p.nota,200),contenedor:p.contenedor===true});
    });
    if(provs.length){
      var ic=provs.findIndex(function(p){return p.contenedor;});if(ic<0)ic=0;
      provs.forEach(function(p,j){p.contenedor=j===ic;});
      c.prov=provs;
    }
  }
  var ct=x.contenedor&&typeof x.contenedor==='object'?x.contenedor:{};
  c.contenedor={tipo:IMP_CONT_TIPOS.indexOf(ct.tipo)>=0?ct.tipo:"40' HQ",cbm40:N(ct.cbm40,[1,300,0],70),cbm45:N(ct.cbm45,[1,300,0],86),cbmp:N(ct.cbmp,[1,300,0],70),
    llenado:N(ct.llenado,[0.1,1,0],1),por_embarque:N(ct.por_embarque,[1,10,1],1),dias_respaldo:N(ct.dias_respaldo,[0,120,1],15)};
  var pu=x.puente&&typeof x.puente==='object'?x.puente:{};
  c.puente={dias_colchon:N(pu.dias_colchon,[0,60,1],7),multiplo:N(pu.multiplo,[1,1000,1],5)};
  if(x.temporada&&typeof x.temporada==='object'){
    var tmp: Record<string, number[]> = {};
    Object.keys(x.temporada).slice(0,40).forEach(function(f){
      var k=impClave(f),a=x.temporada[f];
      if(!k||!Array.isArray(a)||a.length!==12)return;
      tmp[k]=a.map(function(v){return N(v,[0,10,0],1);});
    });
    if(Object.keys(tmp).length)c.temporada=tmp;
  }
  if(!c.temporada.General)c.temporada.General=[1,1,1,1,1,1,1,1,1,1,1,1];
  var fu=x.fuentes&&typeof x.fuentes==='object'?x.fuentes:{};
  c.fuentes={venta:fu.venta==='plataforma'?'plataforma':'hoja',kit:fu.kit==='plataforma'?'plataforma':'hoja'};
  c.venta_ventana=N(x.venta_ventana,[30,365,1],90);
  if(typeof x.corregir_hoja==='boolean')c.corregir_hoja=x.corregir_hoja;
  if(typeof x.prorratear_mes1==='boolean')c.prorratear_mes1=x.prorratear_mes1;
  if(x.items&&typeof x.items==='object'){
    var src=x.items,ord: string[]=Array.isArray(x.orden)?x.orden.slice():[],items: Record<string, any> = {},orden: string[] = [];
    Object.keys(src).forEach(function(k){if(ord.indexOf(k)<0)ord.push(k);});
    ord.slice(0,300).forEach(function(k0){
      var a=src[k0],k=impClave(k0);
      if(!k||items[k]||!a||typeof a!=='object')return;
      items[k]={nombre:impTxt(a.nombre,120)||k,familia:impClave(a.familia)||'General',prov:impClave(a.prov),unidad:impTxt(a.unidad,20)||'piezas',
        venta:N(a.venta,[0,10000,0],0),kit:N(a.kit,[0,10000,0],0),empaque:N(a.empaque,[1,1e6,0],1),minimo:N(a.minimo,[0,1e7,0],0),costo:N(a.costo,[0,1e7,0],0),
        cbm:N(a.cbm,[0,100,0],0),cbm_fuente:impTxt(a.cbm_fuente,120),alias:impTxt(a.alias,80),activo:a.activo!==false,
        camino_qty:N(a.camino_qty,[0,1e7,0],0),camino_fecha:impFechaOk(a.camino_fecha)?a.camino_fecha:''};
      orden.push(k);
    });
    c.items=items;c.orden=orden;
  }
  return c;
}

// ── Café 2027 ──
export function cafeCfgDef(): any {
  if(!CAFE_DEF_JSON){
    var prod: Record<string, any> = {};
    CAFE_PROD.forEach(function(p,i){prod[p.id]={mezcla:CAFE_HOJA.mezcla[i],precio:CAFE_HOJA.precio[i],empaque:CAFE_HOJA.empaque[i],venta:CAFE_HOJA.venta[i],nuevo_precio:CAFE_HOJA.nuevo_precio[i],nuevo_empaque:CAFE_HOJA.nuevo_empaque[i]};});
    var a12=function(n: number){var o: number[] = [],i;for(i=0;i<12;i++)o.push(n);return o;};
    CAFE_DEF_JSON=JSON.stringify({
      anio:2027,escenario:'Base',q4_modo:'auto',
      escenarios:{Pesimista:{crec:0.05,madura:35,apertura:45,ini:100,a0:3,aper:a12(3)},Base:{crec:0.1,madura:37,apertura:64,ini:100,a0:5,aper:a12(10)},Optimista:{crec:0.15,madura:39,apertura:75,ini:100,a0:5,aper:a12(8)}},
      cierres:a12(0),ajuste:0,comprometer:0.85,curva:[38,37,34,34,34],
      estacionalidad:[1.03,0.98,1.12,0.94,0.97,0.94,0.98,1.06,0.93,1,1.07,1.11],compra_ant:32700,prod:prod
    });
  }
  return JSON.parse(CAFE_DEF_JSON as string);
}
export function cafeCfgNorm(x: any): any {
  var c=cafeCfgDef(),d=cafeCfgDef(),N=planCfgNum;
  if(!x||typeof x!=='object')return c;
  c.anio=N(x.anio,[2026,2040,1],2027);
  if(['Pesimista','Base','Optimista'].indexOf(x.escenario)>=0)c.escenario=x.escenario;
  c.q4_modo=x.q4_modo==='manual'?'manual':'auto';
  var es=x.escenarios&&typeof x.escenarios==='object'?x.escenarios:{};
  ['Pesimista','Base','Optimista'].forEach(function(k){
    var e=es[k];if(!e||typeof e!=='object')return;
    var q=d.escenarios[k];
    c.escenarios[k]={crec:N(e.crec,[-0.5,1,0],q.crec),madura:N(e.madura,[0,1000,0],q.madura),apertura:N(e.apertura,[0,1000,0],q.apertura),ini:N(e.ini,[0,5000,1],q.ini),a0:N(e.a0,[0,200,1],q.a0),aper:impArr(e.aper,12,[0,200,1],q.aper)};
  });
  c.cierres=impArr(x.cierres,12,[0,200,1],d.cierres);
  c.ajuste=N(x.ajuste,[-0.9,2,0],0);
  c.comprometer=N(x.comprometer,[0,1,0],0.85);
  c.curva=impArr(x.curva,5,[0,1000,0],d.curva);
  c.estacionalidad=impArr(x.estacionalidad,12,[0,10,0],d.estacionalidad);
  c.compra_ant=N(x.compra_ant,[0,1e8,0],32700);
  var pr=x.prod&&typeof x.prod==='object'?x.prod:{};
  CAFE_PROD.forEach(function(p){
    var a=pr[p.id];if(!a||typeof a!=='object')return;
    var q=d.prod[p.id],nn=function(v: any,rg: [number, number, number],def: any){return v===null||v===''||v===undefined?null:N(v,rg,def);};
    c.prod[p.id]={mezcla:N(a.mezcla,[0,1,0],q.mezcla),precio:N(a.precio,[0,1e5,0],q.precio),empaque:N(a.empaque,[0,1e4,0],q.empaque),venta:N(a.venta,[0,1e5,0],q.venta),
      nuevo_precio:nn(a.nuevo_precio,[0,1e5,0],q.nuevo_precio),nuevo_empaque:nn(a.nuevo_empaque,[0,1e4,0],q.nuevo_empaque)};
  });
  return c;
}

// Etiquetas legibles para el historial de cambios de las secciones imp y cafe.
export var IMP_ETQ: Record<string, string> = {'imp.escenario':'Importaciones: escenario activo','imp.red.suc_hoy_modo':'Importaciones: sucursales hoy (modo)','imp.red.suc_hoy':'Importaciones: sucursales hoy','imp.red.plan_def':'Importaciones: aperturas por mes sin plan propio','imp.red.meses_pipeline':'Importaciones: meses que manda el pipeline',
  'imp.politica.meses_cobertura':'Importaciones: meses de cobertura','imp.politica.meses_respaldo':'Importaciones: meses de respaldo','imp.politica.dias_margen':'Importaciones: días de margen','imp.politica.dias_juntar':'Importaciones: días para juntar pedidos',
  'imp.contenedor.tipo':'Importaciones: tipo de contenedor','imp.contenedor.cbm40':'Importaciones: CBM del 40 HQ','imp.contenedor.cbm45':'Importaciones: CBM del 45 HQ','imp.contenedor.cbmp':'Importaciones: CBM personalizado','imp.contenedor.llenado':'Importaciones: llenado real','imp.contenedor.por_embarque':'Importaciones: contenedores por embarque','imp.contenedor.dias_respaldo':'Importaciones: días de respaldo del siguiente',
  'imp.puente.dias_colchon':'Importaciones: colchón de la compra puente','imp.puente.multiplo':'Importaciones: múltiplo de la compra puente','imp.fuentes.venta':'Importaciones: fuente de venta por sucursal','imp.fuentes.kit':'Importaciones: fuente del kit por apertura','imp.venta_ventana':'Importaciones: ventana de venta de la plataforma','imp.corregir_hoja':'Importaciones: corregir errores de la hoja','imp.prorratear_mes1':'Importaciones: ajustar el mes en curso',
  'cafe.anio':'Café: año','cafe.escenario':'Café: escenario activo','cafe.q4_modo':'Café: arranque del año (modo)','cafe.ajuste':'Café: ajuste general','cafe.comprometer':'Café: % a comprometer con el proveedor','cafe.compra_ant':'Café: compra del año anterior'};
export var IMP_ETQ_CAMPO: Record<string, string> = {nombre:'nombre',familia:'familia de temporada',prov:'proveedor',unidad:'unidad',venta:'venta por sucursal al mes',kit:'kit por apertura',empaque:'múltiplo de empaque',minimo:'mínimo del proveedor',costo:'costo',cbm:'CBM por unidad',cbm_fuente:'fuente del CBM',alias:'alias',activo:'incluido en el plan',camino_qty:'en camino manual (cantidad)',camino_fecha:'en camino manual (fecha)',
  crec:'crecimiento anual',cumpl:'cumplimiento de aperturas',ajuste:'ajuste de demanda',lead:'lead time',cierres:'cierres (días extra)',nota:'nota',contenedor:'es de contenedores',nombre_prov:'nombre',
  madura:'compra de sucursal madura (kg)',apertura:'compra del mes de apertura (kg)',ini:'sucursales al 1 de enero',a0:'aperturas por mes del último trimestre',aper:'aperturas',mezcla:'mezcla',precio:'precio del café por kg',venta_bolsa:'precio de venta',nuevo_precio:'precio nuevo por kg',nuevo_empaque:'empaque nuevo'};
/** _impCafeEtq. `imp` es la sección imp con la que se nombra al proveedor (el viejo leía el borrador global). */
export function impCafeEtq(clave: string, imp?: any): string {
  if(IMP_ETQ[clave])return IMP_ETQ[clave];
  var p: any[]=clave.split('.'),r=p[0]==='imp'?'Importaciones':'Café',M=MESES_ABR;
  if(p[0]==='imp'){
    if(p[1]==='items')return r+': '+p[2]+(p[3]?' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]):'');
    if(p[1]==='escenarios')return r+': escenario '+p[2]+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]);
    if(p[1]==='red'&&p[2]==='plan')return r+': plan de aperturas, '+impMesTxt(p[3]);
    if(p[1]==='red'&&p[2]==='cierres')return r+': cierres, '+impMesTxt(p[3]);
    if(p[1]==='temporada')return r+': temporada '+p[2]+(p[3]!=null?' de '+M[+p[3]]:'');
    if(p[1]==='prov')return r+': proveedor '+((imp&&imp.prov[+p[2]])?imp.prov[+p[2]].nombre:('#'+(+p[2]+1)))+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3]);
    if(p[1]==='orden')return r+': orden de artículos';
  }else{
    if(p[1]==='escenarios')return r+': escenario '+p[2]+' · '+(IMP_ETQ_CAMPO[p[3]]||p[3])+(p[4]!=null?' de '+M[+p[4]]:'');
    if(p[1]==='cierres')return r+': cierres de '+M[+p[2]];
    if(p[1]==='curva')return r+': curva de compra, mes '+(+p[2]+2);
    if(p[1]==='estacionalidad')return r+': estacionalidad de '+M[+p[2]];
    if(p[1]==='prod'){var pp=CAFE_PROD.find(function(q){return q.id===p[2];});return r+': '+(pp?pp.nombre:p[2])+' · '+(IMP_ETQ_CAMPO[p[3]==='venta'?'venta_bolsa':p[3]]||p[3]);}
  }
  return clave;
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando del Step 2.
Expected: PASS (4). Si algo difiere, la diferencia es del port: no se ajusta la prueba.

Además: `npm run test:funciones` sin `COM_APP_VIEJA`. Expected: 242 passed + 17 ignored.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/impCafeCfg.ts supabase/functions/_shared/impCafeCfg_parity_test.ts supabase/functions/_shared/pruebas/fixturesImp.ts
git commit -m "feat(comercializadora): configuración de Importaciones y Café portada del viejo, con paridad"
```

---

### Task 2: Motores de las Sheets (`impEngine`, `cafeEngine`) copiados tal cual, con paridad

**Files:**
- Create: `scripts/comercializadora/portar-motores-hoja.mjs`
- Create (generados): `supabase/functions/_shared/impEngine.ts`, `supabase/functions/_shared/cafeEngine.ts`
- Test: `supabase/functions/_shared/motoresHoja_parity_test.ts`

**Interfaces:**
- Consumes: `impCfgNorm`, `cafeCfgNorm` (Tarea 1); `entradaImpHoja`, `entradaCafe` (Tarea 1, fixture).
- Produces:
  - `impEngine.ts`: `impEngine(P, items) → S`, la salida JSON de la Sheet de importados con `escenario, leadTimes, cbmUtilContenedor, meses[15], agregado2027, productos[] { sku, quiebre, compraPuente, mensual }, compraPuenteEjemplo, proveedoresResumen, kpis, plan { contenedores, cantidades, totalCbm, … }, contenedores, resumen, consumo2027, advertencias`. También `helpers`.
  - `cafeEngine.ts`: `cafeEngine(P) → R`, la salida de la Sheet de café con `etiquetasMes, calculadora { resumen, origenVolumen }, detalleMensual, comparativa, precios, timeline`. También `roundUp0`, `fmt0`, `num`, `esVacio` y `calcularBloque`.
  - Los dos archivos llevan `// @ts-nocheck`; quien los usa los tipa (`as (P: any, items: any[]) => any`).

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/motoresHoja_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de los motores de las Sheets: impEngine.ts y cafeEngine.ts son copias del cuerpo de _impEngine y _cafeEngine
// de la app. Con las mismas entradas la salida debe ser IDÉNTICA, también los errores.
import { assert, assertEquals, assertThrows } from "@std/assert";
import { impEngine } from "./impEngine.ts";
import { cafeEngine } from "./cafeEngine.ts";
import { cafeCfgNorm, impCfgNorm } from "./impCafeCfg.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { entradaCafe, entradaImpHoja } from "./pruebas/fixturesImp.ts";

const A = SIN_APP ? null : app(["_impEngine", "_cafeEngine"], "", "2026-11-13");
const err = (f: () => unknown) => { try { f(); return null; } catch (e) { return (e as Error).message; } };

// Fechas de corte: mitad de mes, fin y principio de año (el horizonte de 15 meses cruza dos años) y un 29 de febrero.
const CORTES = ["2026-11-13", "2026-12-31", "2027-01-01", "2027-06-15", "2028-02-29"];
const IMPS: Record<string, any> = {
  defecto: {},
  hoja_tal_cual: { corregir_hoja: false },
  pesimista_45: { escenario: "Pesimista", contenedor: { tipo: "45' HQ", llenado: 0.85, por_embarque: 2, dias_respaldo: 30 } },
  politica: { politica: { meses_cobertura: 6, meses_respaldo: 2, dias_margen: 0, dias_juntar: 0 }, puente: { dias_colchon: 20, multiplo: 12 } },
  sin_contenedor: { prov: [{ clave: "Green Packaging", nombre: "GP", lead: 30, cierres: 0 }, { clave: "Easy Drinkware", lead: 400, cierres: 120, contenedor: true },
    { clave: "Proveedor actual (vía SIMBS)", lead: 1 }, { clave: "LQC Printing", lead: 60 }] },
};

Deno.test({ name: "paridad: impEngine = _impEngine (5 fechas de corte × 5 configuraciones × 4 escenarios)", ignore: SIN_APP }, () => {
  let n = 0;
  for (const [nom, x] of Object.entries(IMPS)) {
    const ci = impCfgNorm(x);
    for (const hoy of CORTES) {
      for (const esc of ["Pesimista", "Base", "Optimista", "Manual"]) {
        const { P, items } = entradaImpHoja(ci, hoy, { esc, seed: n + 3 });
        assertEquals(impEngine(P, items), A._impEngine(P, items), `${nom} ${hoy} ${esc}`);
        n++;
      }
    }
  }
  assertEquals(n, 100);
});

Deno.test({ name: "paridad: impEngine lanza los mismos errores que _impEngine", ignore: SIN_APP }, () => {
  const { P, items } = entradaImpHoja(impCfgNorm({}), "2026-11-13");
  const casos: [string, any, any][] = [
    ["sin items", P, []],
    ["escenario", { ...P, escenarioActivo: "Nada" }, items],
    ["contenedor", { ...P, contenedor: { ...P.contenedor, tipo: "20'" } }, items],
    ["fecha", { ...P, fechaCorte: "13/11/2026" }, items],
    ["cobertura", { ...P, politica: { ...P.politica, mesesCobertura: 15 } }, items],
    ["familia", P, [{ ...items[0], familia: "No existe" }]],
    ["proveedor", P, [{ ...items[0], proveedor: "Nadie" }]],
  ];
  for (const [nom, p, its] of casos) {
    const a = err(() => A._impEngine(p, its)), s = err(() => impEngine(p, its));
    assertEquals(s, a, nom);
  }
  assertEquals(err(() => impEngine({ ...P, escenarioActivo: "Nada" }, items))?.startsWith("#N/A"), true);
});

Deno.test({ name: "paridad: cafeEngine = _cafeEngine (años, escenarios, arranque automático y manual)", ignore: SIN_APP }, () => {
  const CAFES = [{}, { anio: 2026, ajuste: -0.2, comprometer: 1 }, { anio: 2031, q4_modo: "manual", curva: [0, 0, 0, 0, 0], estacionalidad: Array(12).fill(0) },
    { prod: { white_1kg: { mezcla: 0, nuevo_precio: null }, black_250g: { mezcla: 1, nuevo_empaque: null } }, cierres: [5, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 40] }];
  let n = 0;
  for (const x of CAFES) {
    const cc = cafeCfgNorm(x);
    for (const esc of ["Pesimista", "Base", "Optimista"]) {
      for (const red of [null, { ini: 0, a0: 0 }, { ini: 140, a0: 7 }]) {
        const P = entradaCafe(cc, esc, red);
        assertEquals(cafeEngine(P), A._cafeEngine(P), `${JSON.stringify(x)} ${esc} ${JSON.stringify(red)}`);
        n++;
      }
    }
  }
  assertEquals(n, 36);
  const P = entradaCafe(cafeCfgNorm({}), "Manual", null);
  assertEquals(err(() => cafeEngine(P)), err(() => A._cafeEngine(P)));
});

Deno.test("impEngine: el horizonte de 15 meses cruza el año (de nov-26 a ene-28) y la salida es JSON puro", () => {
  const { P, items } = entradaImpHoja(impCfgNorm({}), "2026-11-13");
  const S = impEngine(P, items);
  assertEquals(S.meses.length, 15);
  assertEquals(S.meses[0].inicio, "2026-11-01");
  assertEquals(S.meses[14].inicio, "2028-01-01");
  assertEquals(JSON.parse(JSON.stringify(S)), S);
  assert(S.productos.every((p: any) => p.quiebre && p.compraPuente && p.mensual));
  assertThrows(() => impEngine(P, []), Error, "al menos 1 producto");
});

Deno.test("cafeEngine: año calendario de 12 meses y kilos a comprar del escenario", () => {
  const R = cafeEngine(entradaCafe(cafeCfgNorm({}), "Base", { ini: 100, a0: 5 }));
  assertEquals(R.etiquetasMes.length, 12);
  assert(R.calculadora.resumen.kgComprar > 0);
  assertEquals(R.detalleMensual.kgComprar.mes.length, 12);
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/motoresHoja_parity_test.ts`
Expected: FAIL. `Module not found ".../impEngine.ts"`.

- [ ] **Step 3: El script y la copia**

Crear `scripts/comercializadora/portar-motores-hoja.mjs`. Revisa que las líneas de corte sean las esperadas antes de copiar:

```js
// Copia byte por byte los dos motores de las Sheets del HTML viejo (a9e4a22) a supabase/functions/_shared/.
// Uso: node scripts/comercializadora/portar-motores-hoja.mjs <app-vieja-a9e4a22.html> <raíz del repo>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [html, raiz] = process.argv.slice(2);
const L = readFileSync(html, 'utf8').replace(/\r\n/g, '\n').split('\n');
const lineas = (a, b) => L.slice(a - 1, b).join('\n');
const exige = (n, texto) => {
  if (L[n - 1] !== texto) throw new Error(`Línea ${n}: esperaba ${JSON.stringify(texto)} y hay ${JSON.stringify(L[n - 1])}`);
};
exige(36040, 'var _impEngine=(function(){');
exige(36042, 'var module={exports:{}};');
exige(36921, 'module.exports = {');
exige(36928, 'var _cafeEngine=(function(){');
exige(36930, 'var module={exports:{}};');
exige(37566, 'module.exports = cafeEngine;');

const cabeza = (que, a, b) =>
  [
    '// @ts-nocheck',
    '// deno-lint-ignore-file',
    `// Copia EXACTA del motor ${que} del sitio viejo: app/index.html a9e4a22, líneas ${a}–${b}, el cuerpo del IIFE`,
    '// (función pura, CommonJS, validada contra los valores de la Sheet). No se edita a mano: se vuelve a generar con',
    '// scripts/comercializadora/portar-motores-hoja.mjs (plan 3e, Tarea 2). Solo cambia la última línea: `export` en lugar de `module.exports`.',
    '',
  ].join('\n');

const imp =
  cabeza('de importaciones (_impEngine)', 36043, 36920) +
  lineas(36043, 36920) +
  '\nexport { impEngine };\nexport const helpers = { ROUND, CEILING, EDATE, ISO, parseDate, serFromYMD, T0, T1, TPCT, TMIL, DDMMMYY, DDMMM, MMMYY, MMM, DEF };\n';
const cafe =
  cabeza('de café (_cafeEngine)', 36931, 37565) +
  lineas(36931, 37565) +
  '\nexport { cafeEngine, roundUp0, fmt0, num, esVacio, calcularBloque };\n';
writeFileSync(join(raiz, 'supabase/functions/_shared/impEngine.ts'), imp);
writeFileSync(join(raiz, 'supabase/functions/_shared/cafeEngine.ts'), cafe);
console.log('impEngine.ts', imp.split('\n').length, 'líneas · cafeEngine.ts', cafe.split('\n').length, 'líneas');
```

Generar los dos archivos y comprobar que son exactamente los que se probaron al planear:

```bash
node scripts/comercializadora/portar-motores-hoja.mjs "$COM_APP_VIEJA" .
sha256sum supabase/functions/_shared/impEngine.ts supabase/functions/_shared/cafeEngine.ts
```

Expected:
```
impEngine.ts 886 líneas · cafeEngine.ts 642 líneas
42d490d0a022bae80d36691a570faff188ba41871d3ceb4987e113278f594b97  supabase/functions/_shared/impEngine.ts
a17d0da1ad6edaa0e9fb5698bd180e034a374c0b987074b16d47270cac3993c7  supabase/functions/_shared/cafeEngine.ts
```

Si el script se detiene en una línea de corte, el HTML no es el de `a9e4a22`. Si el sha256 no coincide, no se sigue: algo editó el archivo. Los archivos generados no se tocan a mano; con autocrlf, Git los guarda con fin de línea normal y el hash se compara recién generados.

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando del Step 2.
Expected: PASS (5). Además, `npm run typecheck` sigue limpio (los motores llevan `@ts-nocheck`), y `npm run test:funciones` sin `COM_APP_VIEJA` da 244 passed + 20 ignored.

- [ ] **Step 5: Commit**

```bash
git add scripts/comercializadora/portar-motores-hoja.mjs supabase/functions/_shared/impEngine.ts supabase/functions/_shared/cafeEngine.ts supabase/functions/_shared/motoresHoja_parity_test.ts
git commit -m "feat(comercializadora): motores de las Sheets de importados y café copiados del viejo, con paridad"
```

---

### Task 3: Importaciones sobre los datos del plan (`_impArmar`, `_impCorrer`) con paridad, e `importacionesMotor`

**Files:**
- Create: `supabase/functions/_shared/planImp.ts`
- Modify: `supabase/functions/_shared/pruebas/fixturesImp.ts` (datos de la plataforma)
- Modify: `lib/comercializadora/motor.ts` (`importacionesMotor`)
- Test: `supabase/functions/_shared/planImp_parity_test.ts`, `tests/portal/com-imp-cafe-motor.test.ts`

**Interfaces:**
- Consumes:
  - de `planDatos.ts` (3d): `DatosPlan`, `planDatAMotor`, `planOcFuente`, `planOcDeZoho`, `borradoresPlan`, `zocKey`, `comSaldoCedis` y `diaLocal`;
  - de `planEngine.ts`: `planEngDia` y `planEngDifDias`;
  - `IMP_ESCS` e `impCfgNorm` (Tarea 1) e `impEngine` (Tarea 2);
  - de `motor.ts`: `memoMotor` y `MotorListo`.
- Produces (`planImp.ts`):
  - `cfgConImp(cfg) → cfg` con `imp` normalizada;
  - `impSkuKey`, `impDiaNum`, `impNumDia`, `impDif(a, b): number | null`, `impFraccionMes(hoy)` e `impMesClave(hoy, m) → 'AAAA-MM'`;
  - `impSucPromedio(R, W)`, `impIdxProm(arr, hoy, W)`, `impVentasPlat(R, cfg) → { W, por, suc, histReal }`, `impOcLineas(R, cfg)`, `impCatalogo(R)` e `impPipelineMes(R, cfg, n)`;
  - `impRed(R, cfg, esc) → { sucHoy, filas: { m, key, pipeline, plan, cierres, considerada, fuente }[], pl, esc, cumpl }`;
  - `impArmar(R, cfg, esc) → { P, items, meta }`;
  - `interface CorridaImp { S: any | null; err: string | null; ent: { P; items; meta }; cfg: any; esc: string }`;
  - `impCorrer(R: DatosPlan, cfgMotor, escVista?: string | null): CorridaImp`;
  - `impAhoraDatos(c: CorridaImp) → { g: Record<clave, { prov, rows, esta, prox }>, orden: string[] }`.
- Produces (`motor.ts`): `importacionesMotor(m: MotorListo, esc?: string | null): CorridaImp`.
- Produces (`fixturesImp.ts`): `HOY_IMP`, `NOMBRES_IMP`, `STUBS_IMP`, `CAT_IMP`, `pedidosImp()`, `APERTURAS_IMP`, `OC_IMP`, `ZOHO_OC_IMP` y `datosImp(extra?) → DatosPlan`.

- [ ] **Step 1: Prueba que falla**

En `supabase/functions/_shared/pruebas/fixturesImp.ts`:
1. Agregar estas dos importaciones debajo de la de `impCafeCfg.ts`:
   ```ts
   import { PLAN_AP_FUERA } from "../planEngine.ts";
   import type { DatosPlan } from "../planDatos.ts";
   ```
2. Agregar debajo de `function rng(…) { … }`:
   ```ts
   /** Como _planDatCargar: los estatus fuera del pipeline se conservan; lo demás es 'en_proceso'. */
   const aperturasNorm = (ap: any[]) => ap.map((a) => ({ ...a, estatusOrig: a.estatus, estatus: PLAN_AP_FUERA[a.estatus] ? a.estatus : "en_proceso" }));
   ```
3. Agregar al final del archivo:

```ts
// ═══ Datos de la plataforma para Importaciones y Café (R de _planDatCargar) ═══════════════════════════════════════

export const HOY_IMP = "2026-11-13";
/** Lo que porta planImp.ts, además de los datos del plan y la configuración. */
export const NOMBRES_IMP = [
  "_impSkuKey", "_impDiaNum", "_impNumDia", "_impFraccionMes", "_impSucPromedio", "_impIdxProm", "_impVentasPlat", "_impVentasMemo",
  "_impOcLineas", "_impCatalogo", "_impPipelineMes", "_impRed", "_impArmar", "_impSigLocal", "_impSumaInv", "_impCorrer",
  "_impMemo", "_impEngine", "_impAhoraDatos",
];
/** _impCorrer y _cafeCorrer leen globales del navegador: se leen de globalThis para poder cambiarlos entre casos. */
export const STUBS_IMP = [
  "var _planRaw=new Proxy({},{get:function(t,k){return globalThis.__R?globalThis.__R[k]:undefined;}});",
  "var _impUI=new Proxy({},{get:function(t,k){return (globalThis.__UI||{})[k];}});",
  "var _cafeUI=new Proxy({},{get:function(t,k){return (globalThis.__UI||{})[k];}});",
].join("\n");

const art = (o: Record<string, unknown>) => ({ estatus: "Compra Recurrente", categoria: "Desechables", zoho_sync_at: null, saldo_yulius: 0,
  cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, created_at: "2024-01-10T15:00:00+00:00", origen: "IMPORTADO", ...o });
export const CAT_IMP = [
  art({ sku: "INS-DES-021", nombre: "VASO KRAFT 12 OZ", costo_unitario: 600, saldo_cedis: 120, saldo_yulius: 30, proveedor_preferido: "GREEN PACKAGING SA", cantidad_por_apertura: 2 }),
  art({ sku: "ins-des-005", nombre: "VASO PET 14 OZ", costo_unitario: 0, saldo_cedis: 40, zoho_sync_at: "2026-11-12T12:00:00Z", zoho_stock_fisico: 55, zoho_stock: 50, proveedor_preferido: "GREEN PACKAGING SA" }),
  art({ sku: "INS-DES-012", nombre: "TAPA 80 MM", costo_unitario: 350, saldo_cedis: -20, proveedor_preferido: "GREEN PACKAGING SA", estatus: "Hasta Agotar Existencias" }),
  art({ sku: "MER-TER-001", nombre: "TERMO 240 ML BLANCO", costo_unitario: 125, saldo_cedis: 900, proveedor_preferido: "Easy Drinkware", origen: "LOCAL" }),
  art({ sku: "MER-TAZ-001", nombre: "TAZA 300 ML NEGRA", costo_unitario: 80, saldo_cedis: 15, proveedor_preferido: null, estatus: "Prueba" }),
  art({ sku: "INS-BA-063", nombre: "BOLSA CAFE 250 G NEGRA", costo_unitario: 190, saldo_cedis: 0, proveedor_preferido: "LQC" }),
  art({ sku: "INS-CAF-001", nombre: "CAFE TOSTADO EN GRANO BLACK (1.5 KG)", categoria: "Café", costo_unitario: 495, saldo_cedis: 80, proveedor_preferido: "CAFICULTORES OMAC", origen: null, cantidad_por_apertura: 4 }),
  art({ sku: "INS-CAF-002", nombre: "CAFE TOSTADO EN GRANO KRAFT (1.5 KG)", categoria: "Café", costo_unitario: 494, saldo_cedis: 0, proveedor_preferido: "CAFICULTORES OMAC", origen: null }),
  art({ sku: "INS-CAF-003", nombre: "CAFE TOSTADO EN GRANO WHITE (1.5 KG)", categoria: "Café", costo_unitario: 494, saldo_cedis: 400, proveedor_preferido: "CAFICULTORES OMAC", origen: null, cantidad_por_apertura: 10 }),
  art({ sku: "INS-NUE-777", nombre: "Café tostado molido 250 gramos", categoria: "Café", costo_unitario: 0, saldo_cedis: 3, proveedor_preferido: "Tostador Local", origen: null }),
  art({ sku: "IMP-NUE-900", nombre: "CUCHARA DE MADERA", costo_unitario: 1, saldo_cedis: 500, proveedor_preferido: "Maderas", origen: "IMPORTADO" }),
  art({ sku: "ALI-JAR-001", nombre: "Mermelada", categoria: "Alimentos", costo_unitario: 40, saldo_cedis: 12, proveedor_preferido: "Mermeladas", origen: null }),
];
const SKUS_VENTA = ["INS-DES-021", "INS-DES-005", "INS-DES-012", "MER-TER-001", "INS-BA-063", "INS-CAF-001", "INS-CAF-002", "INS-CAF-003", "INS-NUE-777", "ALI-JAR-001"];
/** 130 días de pedidos (dos a futuro) de los artículos de importación y café, de sucursales activas y en proceso. */
export function pedidosImp(n = 500): any[] {
  const r = rng(41), out: any[] = [];
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 130) - 2;
    const t = Date.UTC(2026, 10, 13, 6) - dias * 864e5 + Math.floor(r() * 24) * 3600e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) items.push({ sku: SKUS_VENTA[Math.floor(r() * SKUS_VENTA.length)], nombre: "x", cantidad: Math.round(r() * 12) });
    const a = r();
    out.push({ id: "q" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado", apertura_id: a < 0.6 ? "s" + (i % 7) : a < 0.7 ? "e1" : null,
      franquiciatario_email: "f@x.com", items, items_editados: null });
  }
  return out;
}
export const APERTURAS_IMP = [
  { id: "s0", estatus: "activa", fecha: "2024-03-01" }, { id: "s1", estatus: "activa", fecha: "2025-07-15" }, { id: "s2", estatus: "activa", fecha: null },
  { id: "s3", estatus: "activa", fecha: "2026-10-01" }, { id: "s4", estatus: "activa", fecha: "2026-11-02" }, { id: "s5", estatus: "activa", fecha: "2026-12-20" },
  { id: "s6", estatus: "activa", fecha: "fecha mala" },
  { id: "e1", estatus: "en_proceso", fecha: "2026-11-25" }, { id: "e2", estatus: "en_proceso", fecha: "2026-12-05" }, { id: "e3", estatus: "por_abrir", fecha: "2027-02-10" },
  { id: "e4", estatus: "en_proceso", fecha: "2026-10-20" }, // vencida dentro de vencida_max (45 días)
  { id: "e5", estatus: "en_proceso", fecha: "2026-06-01" }, // vencida hace más de 45 días
  { id: "e6", estatus: "en_proceso", fecha: null }, // sin fecha
  { id: "e7", estatus: "en_proceso", fecha: "2028-06-01" }, // después del horizonte de 15 meses
  { id: "e8", estatus: "en_proceso", fecha: "2027-01-31" }, { id: "e9", estatus: "en_proceso", fecha: "2027-12-15" },
  { id: "x1", estatus: "cancelada", fecha: "2027-01-10" },
];
export const OC_IMP = [
  { id: "i1", sku: "INS-DES-021", folio: "COM-OC-02001", fecha: "2026-10-01", fecha_arribo: "2026-12-28", cantidad: 300, cantidad_recibida: 0, monto: 180000, proveedor: "GREEN PACKAGING SA" },
  { id: "i2", sku: "INS-DES-021", folio: "COM-OC-02002", fecha: "2026-10-20", fecha_arribo: "2027-01-20", cantidad: 100, cantidad_recibida: 0, monto: 60000, proveedor: "GREEN PACKAGING SA" },
  { id: "i3", sku: "ins-des-005", folio: "COM-OC-02003", fecha: "2026-09-10", fecha_arribo: null, cantidad: 80, cantidad_recibida: 20, monto: 50000, proveedor: "GREEN PACKAGING SA" }, // sin arribo: se estima
  { id: "i4", sku: "MER-TER-001", folio: "COM-OC-02004", fecha: "2026-06-01", fecha_arribo: "2026-08-01", cantidad: 500, cantidad_recibida: 0, monto: 62000, proveedor: "Easy Drinkware" }, // vieja
  { id: "i5", sku: "INS-BA-063", folio: "COM-OC-02005", fecha: "2026-11-10", fecha_arribo: "2027-02-01", cantidad: 40, cantidad_recibida: 0, monto: 7600, proveedor: "LQC" }, // borrador en la carga de Zoho
  { id: "i6", sku: "INS-CAF-003", folio: "COM-OC-02006", fecha: "2026-11-11", fecha_arribo: "2026-11-15", cantidad: 200, cantidad_recibida: 0, monto: 98800, proveedor: "CAFICULTORES OMAC" },
  { id: "i7", sku: "INS-DES-012", folio: "COM-OC-02007", fecha: "2026-11-01", fecha_arribo: "2027-01-20", cantidad: 60, cantidad_recibida: 60, monto: 21000, proveedor: "GREEN PACKAGING SA" }, // recibida
];
export const ZOHO_OC_IMP = { cargado: "2026-11-12T10:00:00Z", lineas: [
  { sku: "INS-BA-063", folio: "COM-OC-02005", prov: "LQC", fecha: "2026-11-10", arribo: "2027-02-01", pend: 40, borrador: true },
] };
/** R como lo arma _planDatCargar, con los artículos de importación y café. */
export function datosImp(extra: Partial<DatosPlan> = {}): DatosPlan {
  return { hoy: HOY_IMP, hist: 120, histReal: 400, cat: CAT_IMP, pedidos: pedidosImp(),
    lt: [{ sku: "INS-DES-021", dias: 95 }, { sku: "MER-TER-001", dias: 60 }, { sku: "INS-CAF-001", dias: 3 }],
    map: [], oc: OC_IMP, comp: [{ id: "c1", sku: "INS-DES-021", folio: "P-9", cantidad: 10, fecha: "2026-11-12" }],
    aperturas: aperturasNorm(APERTURAS_IMP), pedAper: [], kit: { e1: true }, conteoUlt: { cedis: {}, yulius: {} }, ocZohoBorr: [],
    srv: null, avisos: [], cargadoEn: 1, ...extra };
}
```

Crear `supabase/functions/_shared/planImp_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad del adaptador de Importaciones: _impRed, _impArmar, _impCorrer y _impAhoraDatos de la app contra planImp.ts,
// con los mismos datos del plan (R) y la misma configuración.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { cfgConImp, impAhoraDatos, impCorrer, impFraccionMes, impMesClave, impOcLineas, impRed } from "./planImp.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { datosImp, HOY_IMP, NOMBRES_IMP, NOMBRES_IMP_CFG, STUBS_IMP, ZOHO_OC_IMP } from "./pruebas/fixturesImp.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_IMP])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const g = globalThis as any;
let carga = 1000;
/** Corre _impCorrer de la app con R (hoy = today() de la app) y el escenario de la vista; cada caso con su propia carga. */
function correrApp(R: DatosPlan, cfgApp: any, esc = "") {
  g.__R = { ...R, hoy: A.today(), cargadoEn: ++carga };
  g.__UI = { esc };
  return A._impCorrer(cfgApp);
}

const CFGS: Record<string, any> = {
  defecto: {},
  plataforma: { imp: { fuentes: { venta: "plataforma", kit: "plataforma" }, venta_ventana: 60, red: { meses_pipeline: 5, plan: { "2027-01": 3, "2027-06": 0 }, cierres: { "2027-02": 2 } } } },
  manual_sin_prorrateo: { imp: { red: { suc_hoy_modo: "manual", suc_hoy: 140 }, prorratear_mes1: false, corregir_hoja: false, escenario: "Optimista" },
    inv: { base: "fisico", yulius: true } },
  sin_aperturas: { aper: { incluir: false, vencida_max: 200 }, imp: { items: { "INS-DES-021": { nombre: "Vaso 12", familia: "Inventada", prov: "Nadie", venta: 1, camino_qty: 90, camino_fecha: "2026-12-10" },
    "INS-DES-012": { nombre: "Vaso 12", familia: "Tapa caliente", prov: "Green Packaging", venta: 0.4, activo: true }, "NO-EN-CATALOGO": { nombre: "Fantasma", venta: 0.2, prov: "LQC Printing" },
    "MER-TER-001": { nombre: "Termo", familia: "Termos", prov: "Easy Drinkware", venta: 0.7, activo: false } }, orden: ["INS-DES-021", "INS-DES-012", "NO-EN-CATALOGO", "MER-TER-001"] } },
  zoho_fuente: { zoho_oc: ZOHO_OC_IMP, compra: { fuente_oc: "zoho" } },
  zoho_borrador: { zoho_oc: ZOHO_OC_IMP, compra: { oc_vencida: 60, lt_default: 20 }, aper: { ajustes: { e6: { fecha: "2027-03-03" }, e2: { incluir: false } } } },
};

Deno.test({ name: "paridad: impCorrer = _impCorrer (S, entrada, meta y escenario) en 6 configuraciones × 3 escenarios de vista", ignore: SIN_APP }, () => {
  let n = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const esc of ["", "Pesimista", "Inventado"]) {
      const R = datosImp();
      const a = correrApp(R, A._planCfgNormalizar(c0), esc), s = impCorrer(R, normalizarCfgMotor(c0), esc);
      assertEquals(s.err, a.err, `${nom}/${esc} err`);
      assertEquals(s.esc, a.esc, `${nom}/${esc} esc`);
      assertEquals(s.ent, a.ent, `${nom}/${esc} ent`);
      assertEquals(s.S, a.S, `${nom}/${esc} S`);
      assertEquals(s.cfg.imp, a.cfg.imp, `${nom}/${esc} cfg.imp`);
      assertEquals(impAhoraDatos(s), A._impAhoraDatos(a), `${nom}/${esc} ahora`);
      n++;
    }
  }
  assertEquals(n, 18);
});

Deno.test({ name: "paridad: el día 1 del mes no prorratea y fin de año cruza a 2028 (impRed = _impRed)", ignore: SIN_APP }, () => {
  for (const hoy of ["2026-12-01", "2026-12-31", "2027-01-01"]) {
    const B = app(NOMBRES, STUBS_IMP, hoy);
    const R = datosImp({ hoy });
    const cfg = cfgConImp(normalizarCfgMotor({}));
    g.__R = { ...R, hoy: B.today(), cargadoEn: ++carga };
    g.__UI = { esc: "" };
    assertEquals(impRed(R, cfg, "Base"), B._impRed(g.__R, B._planCfgNormalizar({}), "Base"), hoy);
    const a = B._impCorrer(B._planCfgNormalizar({})), s = impCorrer(R, normalizarCfgMotor({}));
    assertEquals(s.S, a.S, hoy + " S");
    assertEquals(s.ent.meta, a.ent.meta, hoy + " meta");
  }
  assertEquals(impFraccionMes("2026-12-01"), 0);
  assertEquals(impMesClave("2026-12-31", 1), "2027-01");
  assertEquals(impMesClave("2026-11-13", 14), "2028-01");
});

Deno.test("impCorrer: sin artículos activos avisa sin correr el motor; 14 meses de cobertura (el máximo) sí calcula", () => {
  const vacio = impCorrer(datosImp(), normalizarCfgMotor({ imp: { items: { X: { activo: false } } } }));
  assertEquals([vacio.S, vacio.err], [null, "No hay artículos activos en el plan de importaciones."]);
  const largo = impCorrer(datosImp(), normalizarCfgMotor({ imp: { politica: { meses_cobertura: 99 } } }));
  assertEquals([largo.err, largo.cfg.imp.politica.meses_cobertura], [null, 14]);
  assert(largo.S.productos.length > 0);
});

Deno.test("impOcLineas: un borrador real de Zoho (com_zoho_oc_lineas 'draft') no cuenta como en camino (decisión 6 del plan 3d)", () => {
  const cfg = cfgConImp(normalizarCfgMotor({}));
  const R = datosImp({ ocZohoBorr: [{ po_number: "COM-OC-02001", sku: "ins-des-021", vendor_name: "GP", fecha_oc: "2026-10-01", cantidad: 300, cantidad_recibida: 0, precio: 600 }] });
  assertEquals(impOcLineas(datosImp(), cfg)["INS-DES-021"].length, 2);
  assertEquals(impOcLineas(R, cfg)["INS-DES-021"].map((l) => l.folio), ["COM-OC-02002"]);
  // La OC vieja (arribo hace más de 14 días) cuenta, marcada como vieja; la recibida no aparece.
  assertEquals(impOcLineas(datosImp(), cfg)["MER-TER-001"][0].vieja, true);
  assertEquals(impOcLineas(datosImp(), cfg)["INS-DES-012"], undefined);
});

Deno.test("impCorrer: el pipeline cuenta vencidas, sin fecha y después del horizonte; las sucursales de hoy son las activas", () => {
  const c = impCorrer(datosImp(), normalizarCfgMotor({}));
  const pl = c.ent.meta.red.pl;
  assertEquals([pl.vencidas, pl.vencidasFuera, pl.sinFecha, pl.despues], [1, 1, 1, 1]);
  assertEquals(c.ent.meta.red.sucHoy, 7);
  assertEquals(c.S.meses.length, 15);
});
```

Crear `tests/portal/com-imp-cafe-motor.test.ts` (la Tarea 4 le agrega el bloque de Café):

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
import { importacionesMotor, limpiarMotor, type MotorListo } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const listo = (cfg: Record<string, unknown> = {}, R = datosImp()): MotorListo => ({
  ok: true,
  R,
  cfg: normalizarCfgMotor(cfg),
  version: 1,
});

describe('Importaciones sobre el motor del servidor', () => {
  beforeEach(() => limpiarMotor());

  it('calcula una vez por datos + configuración + escenario de la vista', () => {
    const mt = listo();
    const a = importacionesMotor(mt, null);
    expect(importacionesMotor(mt, null)).toBe(a);
    expect(a.esc).toBe('Base');
    expect(a.S.meses).toHaveLength(15);
    const p = importacionesMotor(mt, 'Pesimista');
    expect(p).not.toBe(a);
    expect(p.esc).toBe('Pesimista');
  });

  it('la configuración guardada sin sección imp usa la de la hoja (19 artículos)', () => {
    const c = importacionesMotor(listo(), null);
    expect(c.cfg.imp.orden).toHaveLength(19);
    expect(c.ent.items.length).toBe(19);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planImp_parity_test.ts`
Expected: FAIL. `Module not found ".../planImp.ts"`.

Run: `npx vitest run tests/portal/com-imp-cafe-motor.test.ts`
Expected: FAIL. `importacionesMotor is not a function` (todavía no existe en `motor.ts`).

- [ ] **Step 3: El port y el motor**

Crear `supabase/functions/_shared/planImp.ts`. Es `_impSkuKey`…`_impNumDia` (37584), `_impFraccionMes` 37595, `_impSucPromedio` 37600, `_impIdxProm` 37611, `_impVentasPlat` 37617, `_impOcLineas` 37628, `_impCatalogo` 37648, `_impPipelineMes` 37662, `_impRed` 37685, `_impArmar` 37702, `_impCorrer` 37778, `_impAhoraDatos` 38169 y `_impDif` 38200.
- Las fechas `Date` locales del navegador pasan a días `AAAA-MM-DD` de CDMX: `diaLocal` = `parseLocalDate`, `planEngDifDias` = la resta en días, `impMesClave` = `new Date(y, m + k, 1)`.
- La caché del navegador (`_impMemo`, `_impVentasMemo`, `_impSigLocal`) la sustituye `memoMotor`.

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del adaptador de Importaciones del sitio viejo (app/index.html a9e4a22, líneas 37584–37804): de los datos
// del plan (R de _planDatCargar, el mismo de planDatos.ts) a la entrada del motor de la Sheet (_impArmar) y la corrida
// (_impCorrer, con el ajuste del mes en curso). Mismos nombres sin el guion bajo. "Hoy" es 'YYYY-MM-DD' de CDMX; las
// fechas se cuentan por días como el navegador del equipo. API estable para el plan 3f (Plan de abastos y Esta semana):
// impCorrer, impAhoraDatos e impRed. planImp_parity_test.ts compara contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { borradoresPlan, comSaldoCedis, type DatosPlan, diaLocal, planDatAMotor, planOcDeZoho, planOcFuente, zocKey } from "./planDatos.ts";
import { IMP_ESCS, impCfgNorm } from "./impCafeCfg.ts";
import { impEngine as impEngineJs } from "./impEngine.ts";

const impEngine = impEngineJs as (P: any, items: any[]) => any;

/** La configuración del motor (normalizarCfgMotor) con la sección imp normalizada como _impCfgNorm (el viejo siempre la normalizaba). */
export function cfgConImp(cfg: any): any { return Object.assign({}, cfg, { imp: impCfgNorm(cfg && cfg.imp) }); }

export function impSkuKey(s: any): string { return String(s || "").trim().toUpperCase(); }
export function impDiaNum(iso: string): number { var p = String(iso).split("-"); return Math.round(Date.UTC(+p[0], +p[1] - 1, +p[2]) / 864e5); }
export function impNumDia(n: number): string { var d = new Date(n * 864e5); return d.getUTCFullYear() + "-" + String(d.getUTCMonth() + 1).padStart(2, "0") + "-" + String(d.getUTCDate()).padStart(2, "0"); }
/** Días de la fecha a a la fecha b (b − a), null si alguna no es fecha (_impDif). */
export function impDif(a: any, b: any): number | null {
  var x = Date.parse(String(a || "").slice(0, 10) + "T00:00:00Z"), y = Date.parse(String(b || "").slice(0, 10) + "T00:00:00Z");
  return isFinite(x) && isFinite(y) ? Math.round((y - x) / 864e5) : null;
}

// Fracción del mes en curso que ya pasó (el modelo cuenta el mes completo; con esto se regresa el inventario a como estaba el día 1).
export function impFraccionMes(hoy: string): number {
  var y = +hoy.slice(0, 4), m = +hoy.slice(5, 7), d = +hoy.slice(8, 10);
  var dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return (d - 1) / dim;
}
// Sucursales activas promedio en los últimos W días (una apertura cuenta desde su fecha de apertura; sin fecha, siempre).
export function impSucPromedio(R: DatosPlan, W: number): number {
  var hoy = impDiaNum(R.hoy), fechas = R.aperturas.filter(function (a) { return a.estatus === "activa"; }).map(function (a) { var f = a.fecha ? diaLocal(String(a.fecha).slice(0, 10)) : null; return f ? impDiaNum(f) : null; });
  var tot = 0, k, i;
  for (k = 0; k < W; k++) {
    var d = hoy - k, n = 0;
    for (i = 0; i < fechas.length; i++) if (fechas[i] === null || (fechas[i] as number) <= d) n++;
    tot += n;
  }
  return W > 0 ? tot / W : 0;
}
// Índice de temporada promedio de los últimos W días (para quitarle la estacionalidad a lo que se vendió).
export function impIdxProm(arr: any, hoy: string, W: number): number {
  var t = 0, k;
  for (k = 0; k < W; k++) { var mes = +planEngDia(hoy, -k).slice(5, 7) - 1; t += Number(arr && arr[mes] || 1); }
  return W > 0 ? t / W : 1;
}
// Unidades vendidas por artículo en la ventana (con los mismos criterios de venta del Plan: qué tipos de pedido cuentan, pedidos editados...).
export function impVentasPlat(R: DatosPlan, cfg: any): { W: number; por: Record<string, number>; suc: number; histReal: number } {
  var conv = planDatAMotor(R, cfg);
  var W = Math.max(1, Math.min(cfg.imp.venta_ventana, conv.raw.hist)), por: Record<string, number> = {};
  conv.raw.skus.forEach(function (s: any) { var t = 0, k; for (k = 0; k < W && k < s.u.length; k++) t += s.u[k]; if (t > 0) por[s.sku] = t; });
  return { W: W, por: por, suc: impSucPromedio(R, W), histReal: conv.raw.hist };
}
// Líneas de OC abiertas por artículo (misma regla de "vieja" y de OC vencidas que el Plan). Borradores: decisión 6 del plan 3d.
export function impOcLineas(R: DatosPlan, cfg: any): Record<string, any[]> {
  var hoy = R.hoy, lt: Record<string, number> = {}, out: Record<string, any[]> = {};
  R.lt.forEach(function (l) { lt[l.sku] = Number(l.dias || 0); });
  var zsrc = planOcDeZoho(cfg), dset = borradoresPlan(R, cfg);
  planOcFuente(R, cfg).forEach(function (r) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0)); if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (esB) return; // borrador de Zoho (sin enviar al proveedor): no es una compra, nunca cuenta como en camino
    var fecha = r.fecha ? String(r.fecha).slice(0, 10) : null, arribo = r.fecha_arribo ? String(r.fecha_arribo).slice(0, 10) : null, vieja = false, edad: number | null = null;
    if (fecha) { var fo = diaLocal(fecha); edad = fo ? planEngDifDias(hoy, fo) : null; }
    if (arribo) { var fa = diaLocal(arribo), du = fa ? planEngDifDias(fa, hoy) : null; vieja = du !== null && du < -14; }
    else if (edad !== null) vieja = edad > Math.max(30, (lt[r.sku] > 0 ? lt[r.sku] : cfg.compra.lt_default) + 14);
    if (zsrc) vieja = false;
    if (vieja && cfg.compra.oc_vencida > 0 && edad !== null && edad > cfg.compra.oc_vencida) return;
    var k = impSkuKey(r.sku);
    (out[k] = out[k] || []).push({ pend: pend, fecha: fecha, arribo: arribo, vieja: vieja, folio: r.folio || "", borrador: esB });
  });
  return out;
}
// Datos del catálogo por SKU (inventario, costo, estatus, origen, lead time de Zoho...).
export function impCatalogo(R: DatosPlan, _cfg?: any): Record<string, any> {
  var lt: Record<string, number> = {}, out: Record<string, any> = {};
  R.lt.forEach(function (l) { lt[l.sku] = Number(l.dias || 0); });
  var comp: Record<string, number> = {}; R.comp.forEach(function (m) { comp[m.sku] = (comp[m.sku] || 0) + Number(m.cantidad || 0); });
  R.cat.forEach(function (c) {
    out[impSkuKey(c.sku)] = { sku: c.sku, nombre: c.nombre || c.sku, estatus: c.estatus || "", origen: String(c.origen || "").toUpperCase(), lt: lt[c.sku] > 0 ? lt[c.sku] : null,
      costo: Number(c.costo_unitario || 0), fisico: comSaldoCedis(c), yulius: Number(c.saldo_yulius || 0), comprometido: comp[c.sku] || 0,
      kit: Number(c.cantidad_por_apertura || 0), minPzas: Number(c.minimo_compra_pzas || 0), multiplo: Number(c.multiplo_compra || 1), proveedor: c.proveedor_preferido || "" };
  });
  return out;
}
// Pipeline de aperturas por Mes # (1 = mes en curso): MISMA lista que Inicio (todo lo que no está operando, cancelado ni es corporativo),
// con los ajustes que ya haces en el Plan (forzar incluir, fecha propia). Las vencidas que siguen en proceso cuentan en el mes en curso
// mientras no pasen del plazo de "vencida máxima" del Plan.
export function impPipelineMes(R: DatosPlan, cfg: any, n: number): any {
  var hoy = R.hoy, iy = +hoy.slice(0, 4), im = +hoy.slice(5, 7) - 1, out: any = { real: [], vencidas: 0, vencidasFuera: 0, sinFecha: 0, despues: 0, total: 0 }, i;
  for (i = 0; i < n; i++) out.real.push(0);
  R.aperturas.forEach(function (a) {
    if (a.estatus !== "en_proceso") return;
    var aj = (cfg.aper.ajustes || {})[a.id] || {};
    if (aj.incluir === false) return;
    out.total++;
    var fch = aj.fecha || (a.fecha ? String(a.fecha).slice(0, 10) : null);
    if (!fch) { out.sinFecha++; return; }
    var f = diaLocal(fch);
    if (!f) { out.sinFecha++; return; }
    var k = (+f.slice(0, 4) - iy) * 12 + (+f.slice(5, 7) - 1) - im;
    if (k < 0) {
      var dias = planEngDifDias(hoy, f);
      if (dias <= cfg.aper.vencida_max) { k = 0; out.vencidas++; } else { out.vencidasFuera++; return; }
    }
    if (k >= n) { out.despues++; return; }
    out.real[k]++;
  });
  return out;
}
/** 'AAAA-MM' del mes m a partir del mes de hoy (m = 0 es el mes en curso). */
export function impMesClave(hoy: string, m: number): string {
  var t = +hoy.slice(0, 4) * 12 + (+hoy.slice(5, 7) - 1) + m;
  return Math.floor(t / 12) + "-" + String(t % 12 + 1).padStart(2, "0");
}
// Red de sucursales para el escenario: el pipeline manda los primeros meses; después, el plan de Dirección (si el pipeline ya trae más, manda el pipeline).
export function impRed(R: DatosPlan, cfg: any, esc: string): any {
  var ci = cfg.imp, E = ci.escenarios[esc], pl = impPipelineMes(R, cfg, 15), filas: any[] = [], m;
  var sucHoy = ci.red.suc_hoy_modo === "manual" ? ci.red.suc_hoy : R.aperturas.filter(function (a) { return a.estatus === "activa"; }).length;
  for (m = 0; m < 15; m++) {
    var key = impMesClave(R.hoy, m);
    var plan = ci.red.plan[key] !== undefined ? ci.red.plan[key] : ci.red.plan_def, cierres = ci.red.cierres[key] || 0;
    var pr = pl.real[m] * Math.min(1, E.cumpl), pn = plan * E.cumpl, ruta = m < ci.red.meses_pipeline, cons, fuente;
    if (ruta) { cons = Math.round(pr); fuente = "pipeline"; }
    else if (pr >= pn) { cons = Math.round(pr); fuente = "pipeline"; }
    else { cons = Math.round(pn); fuente = "plan"; }
    if (cfg.aper && cfg.aper.incluir === false) { cons = 0; fuente = "sin aperturas"; } // decisión: no contemplar aperturas en las compras
    filas.push({ m: m, key: key, pipeline: pl.real[m], plan: plan, cierres: cierres, considerada: cons, fuente: fuente });
  }
  return { sucHoy: sucHoy, filas: filas, pl: pl, esc: esc, cumpl: E.cumpl };
}

// Arma la entrada del motor (P, items) y deja por artículo los datos que se muestran en pantalla.
export function impArmar(R: DatosPlan, cfg: any, esc: string): { P: any; items: any[]; meta: any } {
  var ci = cfg.imp, hoy = R.hoy, hoyIso = R.hoy;
  var meta: any = { items: {}, avisos: [], esc: esc };
  var cat = impCatalogo(R, cfg), ocs = impOcLineas(R, cfg), vp = impVentasPlat(R, cfg), red = impRed(R, cfg, esc);
  meta.vp = vp; meta.cat = cat; meta.red = red;
  var provMap: Record<string, any> = {}; ci.prov.forEach(function (p: any) { provMap[p.clave.toLowerCase()] = p; });
  var provCont = ci.prov.find(function (p: any) { return p.contenedor; }) || ci.prov[0];
  var temporada: Record<string, number[]> = {}; Object.keys(ci.temporada).forEach(function (f) { temporada[f] = ci.temporada[f].slice(); });
  var items: any[] = [], nombres: Record<string, 1> = {};
  ci.orden.forEach(function (sku: string) {
    var it = ci.items[sku]; if (!it) return;
    var m: any = meta.items[sku] = { activo: it.activo !== false, aviso: [] };
    var pd = cat[impSkuKey(sku)] || null;
    m.cat = pd;
    var pv = provMap[String(it.prov || "").toLowerCase()];
    if (!pv) { m.aviso.push('El proveedor "' + it.prov + '" ya no existe: se usó ' + ci.prov[0].nombre); pv = ci.prov[0]; }
    var fam = it.familia;
    if (!temporada[fam]) { m.aviso.push('La familia "' + fam + '" no tiene estacionalidad: se usó 1.0 todo el año'); fam = "General"; }
    // Venta por sucursal al mes que dice la plataforma (sin estacionalidad), para compararla con la de la hoja
    var vPlat: number | null = null;
    if (pd && vp.por[pd.sku] > 0 && vp.suc > 0) vPlat = (vp.por[pd.sku] / vp.W * 30) / vp.suc / (impIdxProm(temporada[fam], hoy, vp.W) || 1);
    var kPlat = pd && pd.kit > 0 ? pd.kit : null;
    m.vHoja = it.venta; m.vPlat = vPlat; m.kHoja = it.kit; m.kPlat = kPlat;
    var venta = it.venta, fv = "hoja", kit = it.kit, fk = "hoja";
    if (ci.fuentes.venta === "plataforma") { if (vPlat !== null) { venta = vPlat; fv = "plataforma"; } else fv = "hoja (sin ventas en la plataforma)"; }
    if (ci.fuentes.kit === "plataforma") { if (kPlat !== null) { kit = kPlat; fk = "plataforma"; } else fk = "hoja (sin kit en la plataforma)"; }
    m.fuenteVenta = fv; m.fuenteKit = fk; m.venta = venta; m.kit = kit;
    var costo = pd && pd.costo > 0 ? pd.costo : it.costo; m.costo = costo; m.costoCat = pd ? pd.costo : null;
    var stock = 0;
    if (pd) stock = (cfg.inv.base === "disponible" ? pd.fisico - pd.comprometido : pd.fisico) + (cfg.inv.yulius ? pd.yulius : 0);
    else m.aviso.push("El SKU no está en el catálogo: se usó inventario 0");
    m.stockReal = stock;
    var leadTot = pv.lead + pv.cierres;
    var lines: any[] = (ocs[impSkuKey(sku)] || []).map(function (l) {
      var d = l.arribo, est = false;
      if (!d && l.fecha) { d = planEngDia(l.fecha, leadTot); est = true; }
      return { q: l.pend, d: d || hoyIso, est: est, vieja: l.vieja, folio: l.folio, borrador: l.borrador };
    });
    m.ocN = lines.length; m.ocQ = lines.reduce(function (s, l) { return s + l.q; }, 0); m.ocBorr = lines.reduce(function (s, l) { return s + (l.borrador ? l.q : 0); }, 0);
    m.ocEst = lines.some(function (l) { return l.est; }); m.ocVieja = lines.some(function (l) { return l.vieja; });
    if (it.camino_qty > 0 && it.camino_fecha) { lines.push({ q: it.camino_qty, d: it.camino_fecha, manual: true }); m.manualQ = it.camino_qty; }
    lines.sort(function (a, b) { return a.d < b.d ? -1 : a.d > b.d ? 1 : 0; });
    var yc = 0, yl: string | null = null, cl = 0, cll: string | null = null;
    if (lines.length) {
      var d1 = lines[0].d, sw = 0, sd = 0;
      lines.forEach(function (l) { if (l.d === d1) yc += l.q; else { cl += l.q; sw += l.q; sd += l.q * impDiaNum(l.d); } });
      yl = d1; if (cl > 0) cll = impNumDia(Math.round(sd / sw));
    }
    m.camino = yc + cl; m.llegaPrimera = yl;
    if (it.activo === false) { m.excluido = true; return; }
    var nom = it.nombre || (pd && pd.nombre) || sku;
    if (nombres[nom.toLowerCase()]) nom = nom + " (" + sku + ")";
    nombres[nom.toLowerCase()] = 1;
    items.push({ sku: sku, producto: nom, familia: fam, proveedor: pv.clave, unidad: it.unidad, stockHoy: stock, ventaSucursalMes: venta, kitApertura: kit, empaque: it.empaque, minimoProveedor: it.minimo,
      costoUnitario: costo, yaComprado: yc, llega: yl, compraLocal: cl, llegaLocal: cll, origen: "", largoCm: null, anchoCm: null, altoCm: null, cbmDato: it.cbm, fuenteCbm: it.cbm_fuente, aliasPlan: it.alias });
  });
  var cons: any = { proveedorContenedor: provCont.clave };
  if (ci.corregir_hoja) { cons.planDemandaCruzada = []; cons.ultimoContenedorSinChequeoHorizonte = false; cons.nContenedoresCalendario = 11; }
  else {
    var tiene = function (s: string) { return items.some(function (x) { return x.sku === s; }); };
    if (!(tiene("INS-DES-012") && tiene("INS-DES-005"))) cons.planDemandaCruzada = [];
  }
  var P: any = { fechaCorte: hoyIso, escenarioActivo: esc, escenarios: {},
    red: { sucursalesHoy: red.sucHoy, aperturasPlan: red.filas.map(function (f: any) { return f.plan; }), cierres: red.filas.map(function (f: any) { return f.cierres; }), aperturasConsideradasOverride: red.filas.map(function (f: any) { return f.considerada; }) },
    politica: { mesesCobertura: ci.politica.meses_cobertura, mesesRespaldo: ci.politica.meses_respaldo, diasMargen: ci.politica.dias_margen, diasJuntarPedido: ci.politica.dias_juntar },
    proveedores: ci.prov.map(function (p: any) { return { clave: p.clave, nombre: p.nombre, leadNormal: p.lead, leadCierres: p.cierres, fuente: p.nota }; }),
    contenedor: { tipo: ci.contenedor.tipo, opciones: [{ tipo: "40' HQ", cbm: ci.contenedor.cbm40 }, { tipo: "45' HQ", cbm: ci.contenedor.cbm45 }, { tipo: "Personalizado", cbm: ci.contenedor.cbmp }],
      llenadoReal: ci.contenedor.llenado, contenedoresPorEmbarque: ci.contenedor.por_embarque, diasRespaldoSiguiente: ci.contenedor.dias_respaldo },
    compraPuente: { diasColchon: ci.puente.dias_colchon, multiplo: ci.puente.multiplo },
    temporada: temporada, constantes: cons };
  IMP_ESCS.forEach(function (k) { var e = ci.escenarios[k]; P.escenarios[k] = { crecimientoAnual: e.crec, cumplimientoAperturas: e.cumpl, ajusteDemanda: e.ajuste }; });
  return { P: P, items: items, meta: meta };
}

/** Resultado de una corrida de Importaciones (el `out` de _impCorrer, sin R ni la caché del navegador). */
export interface CorridaImp { S: any | null; err: string | null; ent: { P: any; items: any[]; meta: any }; cfg: any; esc: string }

/**
 * _impCorrer sin la caché del navegador: `cfg` es la configuración del motor (normalizarCfgMotor); su sección imp se
 * normaliza aquí. `esc` es el escenario que se ve (el selector de la pantalla); si no es válido, el guardado.
 */
export function impCorrer(R: DatosPlan, cfgMotor: any, escVista?: string | null): CorridaImp {
  var cfg = cfgConImp(cfgMotor);
  var esc = IMP_ESCS.indexOf(escVista as string) >= 0 ? (escVista as string) : cfg.imp.escenario;
  var ent = impArmar(R, cfg, esc), S: any = null, err: string | null = null, ci = cfg.imp;
  if (!ent.items.length) err = "No hay artículos activos en el plan de importaciones.";
  else {
    try {
      S = impEngine(ent.P, ent.items);
      // El modelo cuenta el mes en curso completo: se le regresa al inventario lo que ya se vendió este mes para que "hoy" sea consistente.
      var fr = impFraccionMes(R.hoy);
      if (ci.prorratear_mes1 && fr > 0) {
        var ajustado = false;
        ent.items.forEach(function (it, j) {
          var d0 = S.productos[j].mensual.demanda[0], add = Number(d0) > 0 ? fr * d0 : 0;
          if (add > 0) { it.stockHoy += add; ent.meta.items[it.sku].stockAjuste = add; ajustado = true; }
        });
        if (ajustado) S = impEngine(ent.P, ent.items);
      }
    } catch (e) { err = e && (e as Error).message ? (e as Error).message : String(e); S = null; }
  }
  return { S: S, err: err, ent: ent, cfg: cfg, esc: esc };
}

/** _impAhoraDatos: productos por proveedor y los que hay que colocar esta semana (≤ 7 días) y la próxima (8 a 14). */
export function impAhoraDatos(c: CorridaImp): { g: Record<string, any>; orden: string[] } {
  var S = c.S, hoyIso = c.ent.P.fechaCorte, l7 = planEngDia(hoyIso, 7), l14 = planEngDia(hoyIso, 14), g: Record<string, any> = {}, orden: string[] = [];
  c.cfg.imp.prov.forEach(function (p: any) { g[p.clave] = { prov: p, rows: [], esta: [], prox: [] }; orden.push(p.clave); });
  S.productos.forEach(function (p: any, i: number) {
    var it = c.ent.items[i], q = p.quiebre, gr = g[it.proveedor];
    if (!gr) return;
    var o: any = { p: p, q: q, it: it, tipo: null };
    if (q.cantidadPedir > 0 && q.colocarPedido) {
      if (q.colocarPedido <= l7) { o.tipo = "esta"; gr.esta.push(o); }
      else if (q.colocarPedido <= l14) { o.tipo = "prox"; gr.prox.push(o); }
    }
    gr.rows.push(o);
  });
  return { g: g, orden: orden };
}
```

En `lib/comercializadora/motor.ts`, agregar la importación junto a la de `planKpi.ts`:

```ts
import { impCorrer, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
```

y al final del archivo:

```ts
/** Importaciones (plan 3e): la corrida del modelo de la Sheet con el escenario de la vista, una vez por datos + configuración. */
export const importacionesMotor = (m: MotorListo, esc?: string | null): CorridaImp =>
  memoMotor(m, `imp|${esc ?? ''}`, () => impCorrer(m.R, m.cfg, esc));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando deno del Step 2. Expected: PASS (5).
Run: `npx vitest run tests/portal/com-imp-cafe-motor.test.ts tests/portal/com-motor.test.ts`. Expected: PASS (2 + 10).
Además: `npm run test:funciones` sin `COM_APP_VIEJA` da 247 passed + 22 ignored, y `npm run typecheck` sale limpio.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planImp.ts supabase/functions/_shared/planImp_parity_test.ts supabase/functions/_shared/pruebas/fixturesImp.ts lib/comercializadora/motor.ts tests/portal/com-imp-cafe-motor.test.ts
git commit -m "feat(comercializadora): Importaciones sobre los datos del plan del servidor, con paridad"
```

---

### Task 4: Café sobre el motor: `_cafeCorrer` y el "Qué pedir" de café con proveedores y mínimos, con paridad

**Files:**
- Create: `supabase/functions/_shared/planProv.ts`, `supabase/functions/_shared/planCafe.ts`
- Modify: `supabase/functions/_shared/planDatos.ts` (`DatosPlan.zprov`)
- Modify: `supabase/functions/_shared/pruebas/fixturesImp.ts` (café)
- Modify: `lib/comercializadora/motor.ts` (lectura de `com_zoho_proveedor`, `cafeMotor`, `cafeOrdenesMotor`)
- Test: `supabase/functions/_shared/planCafe_parity_test.ts`, `tests/portal/com-imp-cafe-motor.test.ts`

**Interfaces:**
- Consumes: de `planBuild.ts` (3d), `planBuild(R, cfg, { cafe: true }): Plan` y `Plan`; de `planDatos.ts`, `DatosPlan` y `diaLocal`; de la Tarea 1, `CAFE_ESCS`, `CAFE_HOJA`, `CAFE_PROD` y `cafeCfgNorm`; `cafeEngine` (Tarea 2).
- Produces:
  - `planDatos.ts`: `DatosPlan.zprov?: { vendor_id; nombre: string | null; minimo_compra: number | null }[] | null`.
  - `planProv.ts`:
    - `type ZohoProveedor`;
    - `minVendorDeGrupo(ids, nombre, zprov): ZohoProveedor | null`;
    - `planConsolidar(rows, { minimo, modo }) → { montoEsta, alcanza, adelantados, faltante }`;
    - `interface GrupoProv { key; nombre; real; rows; nEsta; pzasEsta; montoEsta; sinCostoEsta; nProx; pzasProx; montoProx; sinCostoProx; adelantados; alcanza; minimoManual }`;
    - `planProvs(c: Plan, R: DatosPlan) → { provs: GrupoProv[]; minManual; vendorDe }`. Puede adelantar pedidos y modificar las filas de `c`, como el viejo.
  - `planCafe.ts`:
    - `cfgConCafe`, `cafeRed(R, cfg)`, `cafeArmar(R, cfg) → { P, red }`;
    - `interface CorridaCafe { R; err; ent: { P; red }; cfg; esc }` y `cafeCorrer(R, cfgMotor, escVista?): CorridaCafe`;
    - `type PlanCafe = Plan & { provs; minManual; vendorDe }` y `cafeOrdenes(R, cfg): PlanCafe`;
    - `planResumen(c) → { act, esta, prox, montoEsta, montoProx, sinCostoE, sinCostoP, urg, imp, nSinMov, picos }`;
    - `planCantOC(r): number` y `cafeKgDe(nombre): number | null`.
  - `motor.ts`: `cafeMotor(m, esc?): CorridaCafe`, `cafeOrdenesMotor(m): PlanCafe` y `R.zprov` en la carga (aviso `'mínimos de proveedor'` si falla).
  - `fixturesImp.ts`: `NOMBRES_CAFE` y `ZPROV`.

- [ ] **Step 1: Prueba que falla**

Agregar al final de `supabase/functions/_shared/pruebas/fixturesImp.ts`:

```ts
// ═══ Café (Tarea 4) ═══════════════════════════════════════════════════════════════════════════════════════════════

/** Lo que portan planCafe.ts y planProv.ts: el armado del plan con proveedores (_planBuild) y el adaptador de café. */
export const NOMBRES_CAFE = [
  "_planBuild", "_planBacktestAgg", "_planAplicarServidor", "_planCalcMontos", "_planAgruparProv", "_planConsolidar", "_minVendorDeGrupo",
  "_planEsCafe", "_planKey", "_planDiaAtras", "_planSinSrv", "_planCafeFueraLocal", "_planResumen", "_planCantOC", "_cafeKgDe",
  "_cafeRed", "_cafeArmar", "_cafeCorrer", "_cafeMemo", "_cafeEngine",
];
/** Mínimos de proveedor de Zoho (com_zoho_proveedor). */
export const ZPROV = [
  { vendor_id: "v1", nombre: "CAFICULTORES OMAC", minimo_compra: 40000 },
  { vendor_id: "v2", nombre: "Tostador Local", minimo_compra: 0 },
];
```

Crear `supabase/functions/_shared/planCafe_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de Café: _cafeRed/_cafeArmar/_cafeCorrer y el "Qué pedir" de café (_planBuild solo café con c.provs, como
// _cafeOrdenes sin borrador) de la app contra planCafe.ts y planProv.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { cafeCorrer, cafeKgDe, cafeOrdenes, cafeRed, cfgConCafe, planCantOC, planResumen } from "./planCafe.ts";
import { minVendorDeGrupo, planConsolidar } from "./planProv.ts";
import { app, SIN_APP } from "./pruebas/appVieja.ts";
import { NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";
import { datosImp, HOY_IMP, NOMBRES_CAFE, NOMBRES_IMP_CFG, STUBS_IMP, ZPROV } from "./pruebas/fixturesImp.ts";

const NOMBRES = [...new Set([...NOMBRES_DATOS, ...NOMBRES_IMP_CFG, ...NOMBRES_CAFE])];
const A = SIN_APP ? null : app(NOMBRES, STUBS_IMP, HOY_IMP);
const g = globalThis as any;
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });
const sinHist = (provs: any[]) => provs.map(({ hist: _h, ...x }) => x);

const SRV = { ok: true, motivo: null, calc: "2026-11-13T12:30:00Z", pagos: [], sinCosto: ["INS-NUE-777"], sinProveedor: [],
  compras: [{ sku: "INS-CAF-001", fecha_oc: "2026-11-13", cantidad: 30, monto: 14850 }, { sku: "INS-CAF-003", fecha_oc: "2026-11-25", cantidad: 12, monto: 5928 }] };
const CFGS: Record<string, any> = {
  defecto: {},
  avisar: { compra: { min_prov: "avisar" } },
  seguridad: { seg: { dias: 20 }, consumo: { ventana: 60 }, compra: { prox_dias: 14 } },
  bloqueo: { compra: { bloqueo_oc: "nunca" }, inv: { base: "fisico" } },
};

Deno.test({ name: "paridad: cafeOrdenes = _planBuild(R, cfg, {cafe:true}) con provs (local y servidor, con y sin mínimos)", ignore: SIN_APP }, () => {
  let adelantos = 0, n = 0;
  for (const [nom, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV]) {
      for (const zprov of [ZPROV, []]) {
        const R = datosImp({ srv: srv as any, zprov });
        const a = A._planBuild(paraApp(R), A._planCfgNormalizar(c0), { cafe: true }), s = cafeOrdenes(R, normalizarCfgMotor(c0));
        const k = `${nom}/${srv ? "srv" : "local"}/${zprov.length ? "min" : "sinmin"}`;
        assertEquals(s.rows, a.rows, k + " rows");
        assertEquals(sinHist(s.provs), sinHist(a.provs), k + " provs");
        assertEquals([s.minManual, s.vendorDe, s.fuenteCant], [a.minManual, a.vendorDe, a.fuenteCant], k + " mínimos");
        assertEquals(planResumen(s), A._planResumen(a), k + " resumen");
        s.rows.forEach((r) => assertEquals(planCantOC(r), A._planCantOC(r)));
        adelantos += s.provs.reduce((t, p) => t + p.adelantados, 0);
        n++;
      }
    }
  }
  assertEquals(n, 16);
  assert(adelantos > 0, "ningún caso consolidó por mínimo");
});

Deno.test({ name: "paridad: cafeCorrer = _cafeCorrer y cafeRed = _cafeRed (año en curso, siguiente y arranque manual)", ignore: SIN_APP }, () => {
  const CAFES: Record<string, any> = {
    defecto: {}, anio_2026: { cafe: { anio: 2026 } }, manual: { cafe: { q4_modo: "manual", escenario: "Optimista" } },
    ajustes: { cafe: { anio: 2028 }, aper: { ajustes: { e6: { fecha: "2027-10-15" }, e1: { incluir: false }, e9: { fecha: "2027-11-30" } } } },
  };
  let carga = 5000;
  for (const [nom, c0] of Object.entries(CAFES)) {
    for (const esc of ["", "Pesimista", "Optimista"]) {
      const R = datosImp();
      g.__R = { ...paraApp(R), cargadoEn: ++carga };
      g.__UI = { esc: "" };
      const cfgA = A._planCfgNormalizar(c0);
      const a = A._cafeCorrer(cfgA, esc || undefined), s = cafeCorrer(R, normalizarCfgMotor(c0), esc);
      assertEquals([s.err, s.esc], [a.err, a.esc], `${nom}/${esc}`);
      assertEquals(s.ent, a.ent, `${nom}/${esc} ent`);
      assertEquals(s.R, a.R, `${nom}/${esc} R`);
      assertEquals(cafeRed(R, cfgConCafe(normalizarCfgMotor(c0))), A._cafeRed(g.__R, cfgA), `${nom} red`);
    }
  }
});

Deno.test({ name: "paridad: cafeKgDe, minVendorDeGrupo y planConsolidar", ignore: SIN_APP }, () => {
  for (const t of ["CAFE TOSTADO (1.5 KG)", "Café 250 gramos", "1 KILOGRAMO", "2,5 kilos", "500 gr", "Sin peso", "", null]) assertEquals(cafeKgDe(t), A._cafeKgDe(t), String(t));
  const zp = [{ vendor_id: 5, nombre: "Uno", minimo_compra: 10 }, { vendor_id: "6", nombre: " dos ", minimo_compra: null }];
  for (const [ids, nom] of [[[5, 6, "6", null], "x"], [[], "DOS"], [[9], "__sin__"], [[""], ""]] as [any[], string][]) {
    assertEquals(minVendorDeGrupo(ids, nom, zp), A._minVendorDeGrupo(ids, nom, zp));
  }
  const filas = () => [{ sku: "B", costo: 10, pedirEsta: 2, pedirProx: 0, diasAlcanza: 3 }, { sku: "A", costo: 10, pedirEsta: 0, pedirProx: 50, diasAlcanza: 9 },
    { sku: "C", costo: 5, pedirEsta: 0, pedirProx: 40, diasAlcanza: null }, { sku: "D", costo: 0, pedirEsta: 0, pedirProx: 9, diasAlcanza: 1 }];
  for (const minimo of [0, 100, 600, 5000]) {
    const a = filas(), s = filas();
    assertEquals(planConsolidar(s, { minimo, modo: "consolidar" }), A._planConsolidar(a, { minimo, modo: "consolidar" }), String(minimo));
    assertEquals(s, a);
  }
});

Deno.test("cafeOrdenes: solo café tostado (por nombre o INS-CAF-), con el mínimo del proveedor y sin tocar el plan local", () => {
  const c = cafeOrdenes(datosImp({ zprov: ZPROV }), normalizarCfgMotor({}));
  assertEquals(c.rows.map((r) => r.sku).sort(), ["INS-CAF-001", "INS-CAF-002", "INS-CAF-003", "INS-NUE-777"]);
  assertEquals(c.soloCafe, true);
  assertEquals(c.minManual[c.rows.find((r) => r.sku === "INS-CAF-001").provKey], 40000);
  assert(c.provs.every((p) => p.rows.every((r: any) => r.esCafe)));
});

Deno.test("cafeCorrer: un escenario de vista que no existe usa el guardado; año sin aperturas da arranque 0 sin NaN", () => {
  const c = cafeCorrer(datosImp(), normalizarCfgMotor({ cafe: { escenario: "Pesimista" } }), "Manual");
  assertEquals([c.err, c.esc], [null, "Pesimista"]);
  const vacio = cafeCorrer(datosImp({ aperturas: [] }), normalizarCfgMotor({}));
  assertEquals([vacio.ent.red.ini, vacio.ent.red.a0], [0, 0]);
  assert(Number.isFinite(vacio.R.calculadora.resumen.kgComprar));
});
```

En `tests/portal/com-imp-cafe-motor.test.ts`, cambiar el bloque de importaciones del inicio (hasta antes de `const listo =`) por:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import {
  cafeMotor,
  cafeOrdenesMotor,
  importacionesMotor,
  limpiarMotor,
  motorPlan,
  type MotorListo,
} from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';
```

y agregar al final:

```ts

describe('Café sobre el motor del servidor y los mínimos de proveedor', () => {
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

  const sesion = (fallar: { tabla: string; op: string }[] = []) =>
    dbFalsa(
      {
        com_plan_config: [{ id: 1, config: {}, version: 2 }],
        com_catalogo: [{ sku: 'INS-CAF-001', nombre: 'Café tostado 1 kg', estatus: 'Compra Recurrente' }],
        com_zoho_proveedor: ZPROV,
      },
      fallar,
    );

  it('lee los mínimos de proveedor de Zoho (R.zprov); si falla, sigue con el aviso "mínimos de proveedor"', async () => {
    const r = await motorPlan(sesion().db, new Date('2026-11-13T18:00:00Z'));
    if (!r.ok) throw new Error(r.error);
    expect(r.R.zprov).toEqual(ZPROV);
    expect(r.R.avisos).toEqual([]);
    limpiarMotor();
    const f = await motorPlan(
      sesion([{ tabla: 'com_zoho_proveedor', op: 'select' }]).db,
      new Date('2026-11-13T18:00:00Z'),
    );
    if (!f.ok) throw new Error(f.error);
    expect([f.R.zprov, f.R.avisos]).toEqual([[], ['mínimos de proveedor']]);
  });

  it('cafeMotor y cafeOrdenesMotor calculan una vez; el escenario de la vista cambia la corrida', () => {
    const mt = listo({}, datosImp({ zprov: ZPROV }));
    const a = cafeMotor(mt, null);
    expect(cafeMotor(mt, null)).toBe(a);
    expect([a.esc, cafeMotor(mt, 'Optimista').esc]).toEqual(['Base', 'Optimista']);
    const o = cafeOrdenesMotor(mt);
    expect(cafeOrdenesMotor(mt)).toBe(o);
    expect(o.provs.map((g) => g.key).sort()).toEqual(['caficultores omac', 'tostador local']);
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA`): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planCafe_parity_test.ts`
Expected: FAIL. `Module not found ".../planCafe.ts"`.

Run: `npx vitest run tests/portal/com-imp-cafe-motor.test.ts`
Expected: FAIL. `cafeMotor is not a function` (todavía no existe en `motor.ts`).

- [ ] **Step 3: El port, los datos y el motor**

En `supabase/functions/_shared/planDatos.ts`, dentro de `interface DatosPlan`, debajo de `ocZohoBorr?: LineaBorrador[] | null;`:

```ts
  /** Mínimos de proveedor de Zoho (com_zoho_proveedor): los usa la agrupación por proveedor (plan 3e, Café). */
  zprov?: { vendor_id: any; nombre: string | null; minimo_compra: number | null }[] | null;
```

Crear `supabase/functions/_shared/planProv.ts`. Es `_minVendorDeGrupo` 27586, el bloque de mínimos de `_planBuild` (33413–33416), `_planConsolidar` 32957 y `_planAgruparProv` 33529, sin `hist`:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la agrupación por proveedor del Plan de abasto del sitio viejo (app/index.html a9e4a22): el mínimo de
// Zoho de cada grupo (_minVendorDeGrupo 27586 y el bloque de _planBuild 33413–33416), _planConsolidar (32957) y
// _planAgruparProv (33529) sin el historial de 60 días (`hist`, que solo pinta el panel de proveedores del plan 3f).
// Lo usa el "Qué pedir" de Café (plan 3e) y lo reutilizará el 3f. planProv_parity_test.ts compara contra la app.
import type { DatosPlan } from "./planDatos.ts";
import type { Plan } from "./planBuild.ts";

/** Fila de com_zoho_proveedor que lee el plan (R.zprov). */
export type ZohoProveedor = NonNullable<DatosPlan["zprov"]>[number];

// Proveedor de Zoho de un grupo del Plan: el vendor_id que más se repite entre sus artículos (los que existen en zprov);
// sin ninguno, el de mismo nombre normalizado. Devuelve la fila de zprov o null.
export function minVendorDeGrupo(ids: any[], nombre: any, zprov: ZohoProveedor[] | null | undefined): ZohoProveedor | null {
  var lista = zprov || [], por: Record<string, ZohoProveedor> = {}, cnt: Record<string, number> = {}, orden: string[] = [], mejor: string | null = null, i;
  for (i = 0; i < lista.length; i++) por[String(lista[i].vendor_id)] = lista[i];
  (ids || []).forEach(function (v) {
    if (v == null || v === "") return;
    var k = String(v); if (!por[k]) return;
    if (!cnt[k]) { cnt[k] = 0; orden.push(k); }
    cnt[k]++;
  });
  orden.forEach(function (k) { if (mejor === null || cnt[k] > cnt[mejor]) mejor = k; });
  if (mejor !== null) return por[mejor];
  var n = String(nombre || "").trim().toLowerCase();
  if (!n || n === "__sin__") return null;
  for (i = 0; i < lista.length; i++) if (String(lista[i].nombre || "").trim().toLowerCase() === n) return lista[i];
  return null;
}

export function planConsolidar(rows: any[], prov: { minimo: any; modo: string }): { montoEsta: number; alcanza: boolean | null; adelantados: string[]; faltante: number } {
  var act = rows.filter(function (r) { return !r.importacion; });
  var cent = function (x: number) { return Math.round(x * 100) / 100; };
  var monto = function () { return cent(act.reduce(function (s, r) { return s + (r.costo > 0 ? r.pedirEsta * r.costo : 0); }, 0)); };
  var m = monto(), adelantados: string[] = [], minimo = Number(prov.minimo) || 0;
  if (prov.modo === "consolidar" && minimo > 0 && m > 0 && m < minimo) {
    var cand = act.filter(function (r) { return r.pedirEsta === 0 && r.pedirProx > 0 && r.costo > 0; }).sort(function (a, b) {
      var da = a.diasAlcanza === null ? Infinity : a.diasAlcanza, db = b.diasAlcanza === null ? Infinity : b.diasAlcanza;
      if (da !== db) return da - db;
      return a.sku < b.sku ? -1 : a.sku > b.sku ? 1 : 0;
    });
    var total = cent(cand.reduce(function (s, r) { return s + r.pedirProx * r.costo; }, 0));
    if (cent(m + total) >= minimo) {
      for (var i = 0; i < cand.length && m < minimo; i++) {
        cand[i].pedirEsta = cand[i].pedirProx; cand[i].pedirProx = 0; cand[i].adelantado = true;
        adelantados.push(cand[i].sku);
        m = monto();
      }
    }
  }
  return { montoEsta: m, alcanza: minimo > 0 ? m >= minimo : null, adelantados: adelantados, faltante: minimo > 0 ? Math.max(0, cent(minimo - m)) : 0 };
}

/** Grupo de un proveedor en el Plan (el `x` de _planAgruparProv, sin `hist`). */
export interface GrupoProv {
  key: string; nombre: string; real: boolean; rows: any[]; nEsta: number; pzasEsta: number; montoEsta: number; sinCostoEsta: number;
  nProx: number; pzasProx: number; montoProx: number; sinCostoProx: number; adelantados: number; alcanza: boolean | null; minimoManual: number;
}

function planCafeFueraLocal(c: any, r: any): boolean { return !!(r && r.esCafe && c && !c.soloCafe && c.cfg && c.cfg.compra && c.cfg.compra.excluir_cafe === false); }

/**
 * c.minManual/c.vendorDe de _planBuild y c.provs = _planAgruparProv(c). Puede adelantar pedidos de la próxima semana
 * (consolidación por mínimo): modifica las filas de `c`, como el viejo.
 */
export function planProvs(c: Plan, R: DatosPlan): { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> } {
  var catBy: Record<string, any> = {}; R.cat.forEach(function (x) { catBy[x.sku] = x; });
  // Mínimo por proveedor de Zoho: cada grupo del Plan (por nombre) toma el vendor_id mayoritario de sus artículos; sin él, el de mismo nombre.
  var minManual: Record<string, number> = {}, vendorDe: Record<string, string> = {}, idsPor: Record<string, any[]> = {}, nomPor: Record<string, string> = {};
  c.rows.forEach(function (r) { var cc = catBy[r.sku]; (idsPor[r.provKey] || (idsPor[r.provKey] = [])).push(cc ? cc.zoho_vendor_id : null); nomPor[r.provKey] = r.provNombre; });
  Object.keys(idsPor).forEach(function (k) { var z = minVendorDeGrupo(idsPor[k], nomPor[k], R.zprov || []); if (z) { vendorDe[k] = String(z.vendor_id); minManual[k] = Number(z.minimo_compra || 0); } });
  var g: Record<string, any> = {};
  c.rows.forEach(function (r) {
    if (r.sinMov || r.importacion) return; // sin demanda e importación (va en su propio apartado): fuera del plan
    if (planCafeFueraLocal(c, r)) return;
    var x = g[r.provKey] || (g[r.provKey] = { key: r.provKey, nombre: r.provNombre, real: r.provKey !== "__sin__", rows: [],
      nEsta: 0, pzasEsta: 0, montoEsta: 0, sinCostoEsta: 0, nProx: 0, pzasProx: 0, montoProx: 0, sinCostoProx: 0, adelantados: 0, alcanza: null });
    x.rows.push(r);
  });
  var provs = Object.keys(g).map(function (k) {
    var x = g[k];
    x.minimoManual = minManual[k] || 0;
    // Consolidación (solo artículos nacionales): con el modo "consolidar" y un mínimo capturado, se adelantan necesidades de la próxima semana.
    // Con la simulación del servidor (fuenteCant 'servidor') el ajuste por mínimo ya viene hecho en sus cantidades: aquí no se repite.
    if (c.fuenteCant !== "servidor" && c.cfg.compra.min_prov === "consolidar" && x.minimoManual > 0) {
      // Los artículos bloqueados por una OC abierta no se adelantan (la regla de Configuración dice esperar): para la consolidación
      // su pedirProx cuenta como 0; los demás se mueven con normalidad.
      var ad = x.rows.map(function (r: any) { return { sku: r.sku, costo: r.costo, diasAlcanza: r.calc.diasAlcanza, pedirEsta: r.calc.pedirEsta, pedirProx: r.calc.bloqueado ? 0 : r.calc.pedirProx, importacion: false, _r: r } as any; });
      var rs = planConsolidar(ad, { minimo: x.minimoManual, modo: "consolidar" });
      ad.forEach(function (a: any) {
        if (a.adelantado) {
          a._r.calc.pedirEsta = a.pedirEsta; a._r.calc.pedirProx = a.pedirProx; a._r.adelantado = true; a._r.calc.accion = "PEDIR";
          a._r.montoEsta = a._r.costo > 0 ? a.pedirEsta * a._r.costo : null; a._r.montoProx = a._r.costo > 0 ? 0 : null;
          // el calendario semanal refleja lo adelantado (lo pedido en la semana siguiente pasó a esta semana)
          a._r.sem[0] = a.pedirEsta; a._r.sem[1] = 0; a._r.calc.kPrimera = 0; a._r.fechaLimite = c.hoyIso;
        }
      });
      x.adelantados = rs.adelantados.length; x.alcanza = rs.alcanza;
    }
    x.rows.forEach(function (r: any) {
      if (r.calc.pedirEsta > 0) { x.nEsta++; x.pzasEsta += r.calc.pedirEsta; if (r.montoEsta !== null) x.montoEsta += r.montoEsta; else x.sinCostoEsta++; }
      if (r.calc.pedirProx > 0) { x.nProx++; x.pzasProx += r.calc.pedirProx; if (r.montoProx !== null) x.montoProx += r.montoProx; else x.sinCostoProx++; }
    });
    return x as GrupoProv;
  }).sort(function (a, b) { return b.montoEsta - a.montoEsta || b.nEsta - a.nEsta || a.nombre.localeCompare(b.nombre); });
  return { provs: provs, minManual: minManual, vendorDe: vendorDe };
}
```

Crear `supabase/functions/_shared/planCafe.ts`. Es `_cafeRed` 39249, `_cafeArmar` 39269, `_cafeCorrer` 39282, `_cafeOrdenes` 39298 (sin el memo ni el borrador), `_planResumen` 33696, `_planCantOC` 34008 y `_cafeKgDe` 39309:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del adaptador de Café del sitio viejo (app/index.html a9e4a22): _cafeRed (39249), _cafeArmar (39269),
// _cafeCorrer (39282), y el "Qué pedir" de café (_cafeOrdenes 39298 = el MISMO plan de abasto del motor 3d filtrado a
// café tostado, con su agrupación por proveedor), _planResumen (33696), _planCantOC (34008) y _cafeKgDe (39309).
// planCafe_parity_test.ts compara contra la app.
import { diaLocal, type DatosPlan } from "./planDatos.ts";
import { type Plan, planBuild } from "./planBuild.ts";
import { type GrupoProv, planProvs } from "./planProv.ts";
import { CAFE_ESCS, CAFE_HOJA, CAFE_PROD, cafeCfgNorm } from "./impCafeCfg.ts";
import { cafeEngine as cafeEngineJs } from "./cafeEngine.ts";

const cafeEngine = cafeEngineJs as (P: any) => any;

/** La configuración del motor con la sección cafe normalizada como _cafeCfgNorm. */
export function cfgConCafe(cfg: any): any { return Object.assign({}, cfg, { cafe: cafeCfgNorm(cfg && cfg.cafe) }); }

// Sucursales al arranque del año y aperturas de oct-dic del año anterior, con lo que hay en la plataforma:
// operando (o por abrir con fecha anterior al 1 de enero) y aperturas por mes de apertura (abiertas o en pipeline).
export function cafeRed(R: DatosPlan, cfg: any): any {
  var anio = cfg.cafe.anio, ini = anio + "-01-01", out: any = { ini: 0, q4: [0, 0, 0], activas: 0, pipeAnio: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], pipeDespues: 0, sinFecha: 0 };
  R.aperturas.forEach(function (a) {
    var act = a.estatus === "activa", pen = a.estatus === "en_proceso";
    if (!act && !pen) return;
    var aj = pen ? ((cfg.aper.ajustes || {})[a.id] || {}) : {};
    if (aj.incluir === false) return;
    var fch = aj.fecha || (a.fecha ? String(a.fecha).slice(0, 10) : null), f = fch ? diaLocal(fch) : null;
    if (act) out.activas++;
    if (!f) { if (act) out.ini++; else out.sinFecha++; return; }
    if (f < ini) out.ini++;
    var y = +f.slice(0, 4), m = +f.slice(5, 7) - 1;
    if (y === anio - 1 && m >= 9) out.q4[m - 9]++;
    if (pen && y === anio) out.pipeAnio[m]++;
    if (pen && y > anio) out.pipeDespues++;
  });
  out.a0 = Math.round((out.q4[0] + out.q4[1] + out.q4[2]) / 3);
  return out;
}
export function cafeArmar(R: DatosPlan, cfg: any): { P: any; red: any } {
  var cc = cfg.cafe, red = cafeRed(R, cfg), auto = cc.q4_modo === "auto";
  var P: any = { anio: cc.anio, escenarioActivo: cc.escenario, escenarios: [], cierresPorMes: cc.cierres.slice(), ajusteGeneral: cc.ajuste, pctComprometer: cc.comprometer, curva2a6: cc.curva.slice(), estacionalidad: cc.estacionalidad.slice(), compra2026Kg: cc.compra_ant, productos: [] };
  ["Pesimista", "Base", "Optimista"].forEach(function (k) {
    var e = cc.escenarios[k];
    P.escenarios.push({ nombre: k, crecimientoAnual: e.crec, compraMadura: e.madura, compraMesApertura: e.apertura, sucursalesInicio: auto ? red.ini : e.ini, aperturasOctDic2026: auto ? red.a0 : e.a0, aperturasPorMes: e.aper.slice() });
  });
  CAFE_PROD.forEach(function (p) {
    var a = cc.prod[p.id];
    P.productos.push({ id: p.id, nombre: p.nombre, colorGrupo: p.color, presentacion: p.pres, mezclaPct: a.mezcla, kgPorBolsa: p.kg, vigente: { precioKg: a.precio, empaque: a.empaque, precioVentaBolsa: a.venta }, nuevo: { precioKg: a.nuevo_precio, empaque: a.nuevo_empaque }, notaVigente: a.empaque > 0 ? CAFE_HOJA.nota_empaque : null });
  });
  return { P: P, red: red };
}

/** Resultado de una corrida de Café (el `out` de _cafeCorrer). `R` es la salida del motor de la Sheet. */
export interface CorridaCafe { R: any | null; err: string | null; ent: { P: any; red: any }; cfg: any; esc: string }

/** _cafeCorrer sin la caché del navegador. Un escenario de vista que no existe usa el guardado (el viejo lo dejaba fallar). */
export function cafeCorrer(R: DatosPlan, cfgMotor: any, escVista?: string | null): CorridaCafe {
  var cfg = cfgConCafe(cfgMotor);
  var e = CAFE_ESCS.indexOf(escVista as string) >= 0 ? (escVista as string) : cfg.cafe.escenario;
  var ent = cafeArmar(R, cfg), res: any = null, err: string | null = null;
  ent.P.escenarioActivo = e;
  try { res = cafeEngine(ent.P); } catch (x) { err = x && (x as Error).message ? (x as Error).message : String(x); }
  return { R: res, err: err, ent: ent, cfg: cfg, esc: e };
}

/** Plan de café: el plan de abasto solo con café tostado, con sus proveedores (c.provs del viejo). */
export type PlanCafe = Plan & { provs: GrupoProv[]; minManual: Record<string, number>; vendorDe: Record<string, string> };

/** _cafeOrdenes: el MISMO cálculo del plan de abasto local (consumo, inventario, OCs, lead time, seguridad), solo con café tostado. */
export function cafeOrdenes(R: DatosPlan, cfg: any): PlanCafe {
  var c = planBuild(R, cfg, { cafe: true }) as PlanCafe;
  var pv = planProvs(c, R);
  c.provs = pv.provs; c.minManual = pv.minManual; c.vendorDe = pv.vendorDe;
  return c;
}

export function planResumen(c: { rows: any[] }): any {
  var act = c.rows.filter(function (r) { return !r.importacion && !r.sinMov; });
  var esta = act.filter(function (r) { return r.calc.pedirEsta > 0; });
  var prox = act.filter(function (r) { return r.calc.pedirProx > 0; });
  var sum = function (a: any[], f: string) { return a.reduce(function (s, r) { return s + (r[f] || 0); }, 0); };
  return { act: act, esta: esta, prox: prox, montoEsta: sum(esta, "montoEsta"), montoProx: sum(prox, "montoProx"),
    sinCostoE: esta.filter(function (r) { return r.montoEsta === null; }).length,
    sinCostoP: prox.filter(function (r) { return r.montoProx === null; }).length,
    urg: act.filter(function (r) { return r.calc.urgencia === "Urgente"; }).length,
    imp: c.rows.filter(function (r) { return r.importacion && !r.sinMov; }).length,
    nSinMov: c.rows.filter(function (r) { return r.sinMov; }).length,
    picos: act.filter(function (r) { return r.calc.pico_reciente; }).length };
}
/** Cantidad que va a la OC: la del servidor (pedirHoy) o la de esta semana del cálculo local. */
export function planCantOC(r: any): number { var k = r.calc || {}; return k.fuente === "servidor" ? (Number(k.pedirHoy) || 0) : (Number(k.pedirEsta) || 0); }

// Kilos por unidad según el nombre ("1.5 KG", "250 GRAMOS", "1 KILOGRAMO"); null si no se puede saber.
export function cafeKgDe(nombre: any): number | null {
  var t = String(nombre || ""), m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:kg|kilos?|kilogramos?)\b/i);
  if (m) return parseFloat(m[1].replace(",", "."));
  m = t.match(/(\d+(?:[.,]\d+)?)\s*(?:g|gr|gramos?)\b/i);
  return m ? parseFloat(m[1].replace(",", ".")) / 1000 : null;
}
```

En `lib/comercializadora/motor.ts`:
1. Agregar la importación debajo de la de `planImp.ts`:
   ```ts
   import {
     cafeCorrer,
     cafeOrdenes,
     type CorridaCafe,
     type PlanCafe,
   } from '../../supabase/functions/_shared/planCafe.ts';
   ```
2. En `cargarDatosPlan`, el segundo `Promise.all` recibe un octavo elemento, `zprov`: `const [pedidos, primero, aperturas, pedAper, conteos, borr, srv, zprov] = await Promise.all([`. Debajo de `servidorPlan(db, ahora),` va:
   ```ts
    // Plan 3e: mínimos de proveedor de Zoho para la agrupación por proveedor (Qué pedir de café), como R.zprov del viejo.
    opcional(
      leerTodoCom<{ vendor_id: string; nombre: string | null; minimo_compra: number | null }>(
        db,
        'com_zoho_proveedor',
        'vendor_id,nombre,minimo_compra',
        'vendor_id',
      ),
    ),
   ```
3. Debajo de `if (!borr) avisos.push('borradores de Zoho');`:
   ```ts
     if (!zprov) avisos.push('mínimos de proveedor');
   ```
4. En el objeto `datos`, debajo de `ocZohoBorr: borr ?? [],`:
   ```ts
         zprov: zprov ?? [],
   ```
5. Al final del archivo:

```ts
/** Café (plan 3e): la proyección del año con el escenario de la vista. */
export const cafeMotor = (m: MotorListo, esc?: string | null): CorridaCafe =>
  memoMotor(m, `cafe|${esc ?? ''}`, () => cafeCorrer(m.R, m.cfg, esc));
/** Qué pedir de café (plan 3e): el plan de abasto solo con café tostado, agrupado por proveedor. */
export const cafeOrdenesMotor = (m: MotorListo): PlanCafe =>
  memoMotor(m, 'cafe-ordenes', () => cafeOrdenes(m.R, m.cfg));
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando deno del Step 2. Expected: PASS (5).
Run: `npx vitest run tests/portal/com-imp-cafe-motor.test.ts tests/portal/com-motor.test.ts`. Expected: PASS (4 + 10). Las pruebas del motor del 3d no cambian: sin la tabla `com_zoho_proveedor`, `zprov` queda `[]` y sin aviso.
Además:
- `npm run test:funciones` sin `COM_APP_VIEJA`: 249 passed + 25 ignored;
- con `COM_APP_VIEJA`: 274 passed, 0 ignored;
- `npm run typecheck`, limpio.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planProv.ts supabase/functions/_shared/planCafe.ts supabase/functions/_shared/planCafe_parity_test.ts supabase/functions/_shared/planDatos.ts supabase/functions/_shared/pruebas/fixturesImp.ts lib/comercializadora/motor.ts tests/portal/com-imp-cafe-motor.test.ts
git commit -m "feat(comercializadora): Café y su Qué pedir con proveedores y mínimos de Zoho, con paridad"
```

---

### Task 5: "Crear OC": prellenado del formulario de Órdenes desde Importaciones y Café

**Files:**
- Create: `lib/comercializadora/crearOc.ts`
- Modify: `app/(comercializadora)/comercializadora/ordenes/page.tsx`
- Modify: `components/comercializadora/ordenes.tsx`
- Test: `tests/portal/com-crear-oc.test.tsx`

**Interfaces:**
- Consumes: `FormOc` (`lib/comercializadora/ordenes.ts`); `masDias` (`fechas.ts`); `impAhoraDatos` y `CorridaImp` (Tarea 3); `planCantOC` y `PlanCafe` (Tarea 4); `guardarOc` (sin cambios).
- Produces (`crearOc.ts`):
  - `type OrigenOc = 'Importaciones' | 'Café'` y `MAX_LINEAS_OC = 60`;
  - `interface PrellenadoOc { origen; proveedor; lineas: { sku; cantidad }[]; monto: number | null; arribo: string | null }`;
  - `type FormPrellenado = FormOc & { origen: OrigenOc; omitidos: number }`;
  - `enlaceOc(p: PrellenadoOc): string`;
  - `prellenadoOc(sp: Record<string, string | string[] | undefined>, catalogo: string[], hoy: string): FormPrellenado | null`;
  - `ocImportaciones(c: CorridaImp, clave: string): PrellenadoOc | { error }` y `ocCafe(c: PlanCafe, key: string): PrellenadoOc | { error }`.
- Produces (`Ordenes`): prop nueva `prellenado?: FormPrellenado | null`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-crear-oc.test.tsx`:

```tsx
// Plan 3e, decisión 3: "Crear OC" de Importaciones y Café prellena el formulario de Órdenes; nada se crea solo.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ refresh: vi.fn(), guardar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  guardarOc: m.guardar,
  recibirOc: vi.fn(),
  eliminarOc: vi.fn(),
}));
import { Ordenes } from '../../components/comercializadora/ordenes';
import { enlaceOc, ocCafe, ocImportaciones, prellenadoOc } from '../../lib/comercializadora/crearOc';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const CAT = ['INS-DES-021', 'ins-des-005', 'INS-CAF-002'];
/** Los parámetros como los entrega Next (un valor repetido llega como arreglo). */
const sp = (url: string) => {
  const o: Record<string, string | string[]> = {};
  new URL(url, 'http://x').searchParams.forEach((v, k) => {
    const ya = o[k];
    o[k] = ya === undefined ? v : Array.isArray(ya) ? [...ya, v] : [ya, v];
  });
  return o;
};

describe('prellenado de la OC por la URL', () => {
  it('ida y vuelta: proveedor, líneas, monto y arribo; SKU sin distinguir mayúsculas (se usa el del catálogo)', () => {
    const url = enlaceOc({
      origen: 'Importaciones',
      proveedor: 'Green Packaging & Co',
      lineas: [
        { sku: 'INS-DES-021', cantidad: 120 },
        { sku: 'INS-DES-005', cantidad: 8.5 },
        { sku: 'INS-DES-002', cantidad: 54 },
      ],
      monto: 1234.567,
      arribo: '2027-02-21',
    });
    expect(url.startsWith('/comercializadora/ordenes?nueva=importaciones&')).toBe(true);
    expect(prellenadoOc(sp(url), CAT, '2026-11-13')).toEqual({
      origen: 'Importaciones',
      omitidos: 1,
      folio: '',
      proveedor: 'Green Packaging & Co',
      fecha: '2026-11-13',
      fecha_arribo: '2027-02-21',
      destino: 'CEDIS',
      monto: 1234.57,
      lineas: [
        { sku: 'INS-DES-021', cantidad: 120 },
        { sku: 'ins-des-005', cantidad: 8.5 },
      ],
    });
  });

  it('lista blanca: origen desconocido, sin proveedor o sin líneas válidas no abre nada', () => {
    expect(prellenadoOc({ nueva: 'otro', proveedor: 'X', l: 'INS-DES-021:1' }, CAT, '2026-11-13')).toBeNull();
    expect(
      prellenadoOc({ nueva: 'cafe', proveedor: '  ', l: 'INS-DES-021:1' }, CAT, '2026-11-13'),
    ).toBeNull();
    expect(
      prellenadoOc(
        { nueva: 'cafe', proveedor: 'X', l: ['INS-DES-021:-3', 'INS-DES-021:abc', ':5', 'NO:1'] },
        CAT,
        'h',
      ),
    ).toBeNull();
  });

  it('descarta lo que no sirve: cantidades, repetidos, monto y fecha malos, caracteres de control y más de 60 líneas', () => {
    const r = prellenadoOc(
      {
        nueva: 'cafe',
        proveedor: 'Tostador\u0007 Local',
        l: ['INS-CAF-002:53', 'INS-CAF-002:9', 'INS-DES-021:99999999', 'INS-DES-021:2'],
        monto: '-5',
        arribo: '2027-02-30',
      },
      CAT,
      '2026-11-13',
    );
    expect(r).toMatchObject({
      origen: 'Café',
      proveedor: 'Tostador  Local',
      monto: 0,
      fecha_arribo: '',
      lineas: [
        { sku: 'INS-CAF-002', cantidad: 53 },
        { sku: 'INS-DES-021', cantidad: 2 },
      ],
    });
    const muchos = Array.from({ length: 80 }, (_, i) => `S${i}`);
    const r2 = prellenadoOc({ nueva: 'cafe', proveedor: 'X', l: muchos.map((s) => `${s}:1`) }, muchos, 'h');
    expect(r2?.lineas).toHaveLength(60);
  });
});

describe('qué se prellena desde cada pantalla', () => {
  it('Importaciones: lo de esta semana del proveedor, inversión del modelo y la llegada más tardía', () => {
    const c = impCorrer(datosImp(), normalizarCfgMotor({}));
    const oc = ocImportaciones(c, 'Green Packaging');
    if ('error' in oc) throw new Error(oc.error);
    expect(oc.origen).toBe('Importaciones');
    expect(oc.proveedor).toBe('Green Packaging (vasos y tapas)'); // el primero no está en el catálogo: nombre del plan
    expect(oc.lineas.map((l) => l.sku)).toContain('INS-DES-005');
    expect(oc.arribo).toBe('2027-02-21');
    expect(oc.monto).toBeGreaterThan(0);
    expect(ocImportaciones(c, 'No existe')).toEqual({ error: 'Nada que pedir esta semana a este proveedor' });
  });

  it('Café: la cantidad de hoy; sin costo no hay monto; arribo = hoy + el lead time más largo', () => {
    const c = cafeOrdenes(datosImp({ zprov: ZPROV }), normalizarCfgMotor({}));
    const omac = ocCafe(c, 'caficultores omac');
    if ('error' in omac) throw new Error(omac.error);
    expect(omac).toMatchObject({ origen: 'Café', proveedor: 'CAFICULTORES OMAC', arribo: '2026-11-20' });
    expect(omac.monto).toBe(Math.round(omac.lineas[0].cantidad * 494 * 100) / 100);
    const tost = ocCafe(c, 'tostador local');
    expect('error' in tost ? null : tost.monto).toBeNull();
    expect(ocCafe(c, '__sin__')).toEqual({
      error: 'Asigna un proveedor a estos artículos antes de crear la OC',
    });
  });
});

describe('Órdenes con el formulario prellenado', () => {
  const base = {
    grupos: [],
    proveedores: ['Otro'],
    catalogo: [{ sku: 'INS-CAF-002', nombre: 'Café Kraft' }],
    ultimoSync: null,
    hoy: '2026-11-13',
  };
  const pre = prellenadoOc(
    { nueva: 'cafe', proveedor: 'CAFICULTORES OMAC', l: ['INS-CAF-002:53', 'NO-ESTA:2'], monto: '26182' },
    ['INS-CAF-002'],
    '2026-11-13',
  );

  it('abre la nueva OC con el aviso, el proveedor fijo y las líneas; al guardar no manda origen', async () => {
    m.guardar.mockResolvedValue({ ok: true });
    render(<Ordenes {...base} editable prellenado={pre} />);
    const aviso = screen.getByText(/Revisa cantidades, proveedor y SKUs/);
    expect(aviso.textContent).toContain('1 artículo sugerido por Café para CAFICULTORES OMAC');
    expect(aviso.textContent).toContain('1 artículo no está en el catálogo');
    expect(screen.getByText('sugerido por Café, no editable')).toBeTruthy();
    expect((screen.getByLabelText('Cantidad 1') as HTMLInputElement).value).toBe('53');
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'OC-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    expect(m.guardar.mock.calls[0][0]).toEqual({
      folio: 'OC-77',
      proveedor: 'CAFICULTORES OMAC',
      fecha: '2026-11-13',
      fecha_arribo: '',
      destino: 'CEDIS',
      monto: 26182,
      lineas: [{ sku: 'INS-CAF-002', cantidad: 53 }],
    });
  });

  it('solo lectura: no abre el formulario', () => {
    render(<Ordenes {...base} editable={false} prellenado={pre} />);
    expect(screen.queryByText('Nueva orden de compra')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-crear-oc.test.tsx`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/crearOc"`.

- [ ] **Step 3: El prellenado**

Crear `lib/comercializadora/crearOc.ts`:

```ts
import type { FormOc } from './ordenes';
import { masDias } from './fechas';
import { impAhoraDatos, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import { planCantOC, type PlanCafe } from '../../supabase/functions/_shared/planCafe.ts';

/** De dónde viene la OC sugerida (el viejo lo mostraba como "sugerido por …"). */
export type OrigenOc = 'Importaciones' | 'Café';
const ORIGEN: Record<string, OrigenOc> = { importaciones: 'Importaciones', cafe: 'Café' };
const CLAVE: Record<OrigenOc, string> = { Importaciones: 'importaciones', Café: 'cafe' };
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
 * window._planCrearOC(key, 'cafe'): lo de hoy del proveedor (pedirHoy del servidor o pedirEsta local). Monto solo si
 * todos tienen costo; arribo = hoy + el lead time más largo.
 */
export function ocCafe(c: PlanCafe, key: string): PrellenadoOc | { error: string } {
  const g = c.provs.find((x) => x.key === key);
  if (!g || !g.real) return { error: 'Asigna un proveedor a estos artículos antes de crear la OC' };
  const items = g.rows.filter((r) => planCantOC(r) > 0);
  if (!items.length)
    return {
      error: g.rows.some((r) => r.calc.pedirEsta > 0)
        ? 'Nada que pedir hoy a este proveedor: lo de esta semana toca en los próximos días'
        : 'Nada que pedir esta semana a este proveedor',
    };
  let mOC = 0,
    sinC = 0;
  items.forEach((r) => (r.costo > 0 ? (mOC += planCantOC(r) * r.costo) : sinC++));
  const ltMax = Math.max(...items.map((r) => Number(r.s.lt) || 0));
  return {
    origen: 'Café',
    proveedor: g.nombre,
    lineas: items.map((r) => ({ sku: r.sku, cantidad: planCantOC(r) })),
    monto: sinC === 0 && mOC > 0 ? Math.round(mOC * 100) / 100 : null,
    arribo: masDias(c.hoyIso, ltMax),
  };
}
```

En `app/(comercializadora)/comercializadora/ordenes/page.tsx`:
1. Importar `import { prellenadoOc } from '@/lib/comercializadora/crearOc';`.
2. Tipo de `searchParams`: `Promise<{ estado?: string; mes?: string } & Record<string, string | string[] | undefined>>`.
3. Debajo de `const mes = …`:
   ```tsx
     // Plan 3e: "Crear OC" de Importaciones y Café abre el formulario prellenado (solo SKUs del catálogo; nada se guarda solo).
     const editable = puedeEditarCom(accesos);
     const prellenado = editable
       ? prellenadoOc(
           sp,
           catalogo.map((c) => c.sku),
           hoy,
         )
       : null;
   ```
4. En `<Ordenes …>`: `editable={editable}` (en lugar de `puedeEditarCom(accesos)`) y la prop nueva `prellenado={prellenado}`.

En `components/comercializadora/ordenes.tsx`:
1. Importar `import type { FormPrellenado } from '@/lib/comercializadora/crearOc';`.
2. En las props de `Ordenes`, debajo de `hoy: string;`: `prellenado?: FormPrellenado | null;`.
3. El estado del formulario arranca con lo sugerido:
   ```tsx
     // Plan 3e: "Crear OC" de Importaciones o Café llega con el formulario de nueva OC ya lleno; se revisa y se guarda.
     const [form, setForm] = useState<
       (FormOc & { anterior?: string; origen?: string; omitidos?: number }) | null
     >(p.editable && p.prellenado ? p.prellenado : null);
   ```
4. Dentro de `<Tarjeta titulo={…}>`, antes de `<div className="grid gap-3 sm:grid-cols-3">`:
   ```tsx
             {form.origen ? (
               <p role="status" className="mb-3 rounded-lg bg-surface-2 px-3 py-2 text-sm text-ink-2">
                 Revisa cantidades, proveedor y SKUs antes de guardar: {form.lineas.length}{' '}
                 {form.lineas.length === 1 ? 'artículo sugerido' : 'artículos sugeridos'} por {form.origen} para{' '}
                 <b>{form.proveedor}</b>. Monto y fecha de arribo son estimados (cantidad × costo; llegada del
                 plan): ajústalos a los de la OC real.
                 {form.omitidos
                   ? ` ${form.omitidos} ${form.omitidos === 1 ? 'artículo no está' : 'artículos no están'} en el catálogo y no se incluyeron.`
                   : ''}
               </p>
             ) : null}
   ```
5. El campo Proveedor queda fijo cuando viene de una pantalla. Envolver el `<label>` del proveedor que ya existe:
   ```tsx
               {form.origen ? (
                 <div className="text-sm">
                   Proveedor
                   <p className={`${claseCampo} flex items-center gap-2 bg-surface-2`}>
                     <b>{form.proveedor}</b>
                     <span className="text-xs text-muted-foreground">
                       sugerido por {form.origen}, no editable
                     </span>
                   </p>
                 </div>
               ) : (
                 <label className="text-sm">
                   Proveedor
                   <select
                     className={claseCampo}
                     value={form.proveedor}
                     onChange={(e) => setForm({ ...form, proveedor: e.target.value })}
                   >
                     <option value="">Elige…</option>
                     {p.proveedores.map((x) => (
                       <option key={x} value={x}>
                         {x}
                       </option>
                     ))}
                   </select>
                 </label>
               )}
   ```
6. Al guardar no se mandan `origen` ni `omitidos`: `const { anterior, origen: _origen, omitidos: _omitidos, ...datos } = form;`.

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/portal/com-crear-oc.test.tsx tests/portal/com-ordenes.test.ts`
Expected: PASS (7 + las de Órdenes, sin cambios). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/crearOc.ts "app/(comercializadora)/comercializadora/ordenes/page.tsx" components/comercializadora/ordenes.tsx tests/portal/com-crear-oc.test.tsx
git commit -m "feat(comercializadora): Crear OC de Importaciones y Café prellena el formulario de Órdenes"
```

---

### Task 6: Exportar a Excel (siete hojas de Importaciones y cuatro de Café)

**Files:**
- Create: `lib/comercializadora/excelImpCafe.ts`
- Create: `components/comercializadora/descargar-excel.tsx`
- Test: `tests/portal/com-excel-imp-cafe.test.tsx`

**Interfaces:**
- Consumes: `CorridaImp` (Tarea 3), `CorridaCafe` y `CAFE_PROD` (Tareas 1 y 4); `xlsx` (ya instalado, 0.20.3).
- Produces:
  - `interface Hoja { nombre: string; filas: Record<string, unknown>[] }` e `interface LibroExcel { archivo: string; hojas: Hoja[] }`;
  - `filasParametros(raiz, seccion, excluir?)`;
  - `libroImportaciones(c: CorridaImp): LibroExcel | null` y `libroCafe(c: CorridaCafe): LibroExcel | null`;
  - `<DescargarExcel libro={LibroExcel | null} />`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-excel-imp-cafe.test.tsx`:

```tsx
// Plan 3e, decisión 2: "Exportar Excel" de Importaciones (7 hojas) y Café (4 hojas), como el sitio viejo.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const x = vi.hoisted(() => ({ writeFile: vi.fn(), fallar: false }));
vi.mock('xlsx', async (original) => {
  const real = await original<typeof import('xlsx')>();
  return {
    ...real,
    utils: real.utils,
    writeFile: (...a: unknown[]) => {
      if (x.fallar) throw new Error('sin librería');
      x.writeFile(...a);
    },
  };
});
import { DescargarExcel } from '../../components/comercializadora/descargar-excel';
import { filasParametros, libroCafe, libroImportaciones } from '../../lib/comercializadora/excelImpCafe';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeCorrer } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const imp = impCorrer(datosImp(), normalizarCfgMotor({}), 'Pesimista');
const cafe = cafeCorrer(datosImp(), normalizarCfgMotor({}), 'Optimista');

describe('libros de Excel', () => {
  it('Importaciones: siete hojas en el orden del viejo, con sus columnas', () => {
    const l = libroImportaciones(imp)!;
    expect(l.archivo).toBe('Importaciones_2026-11-13.xlsx');
    expect(l.hojas.map((h) => h.nombre)).toEqual([
      'Qué pedir',
      'Contenedores',
      'Cantidades por contenedor',
      'Proyección mensual',
      'Compra puente',
      'Aperturas consideradas',
      'Parámetros',
    ]);
    expect(l.hojas[0].filas).toHaveLength(imp.S.productos.length);
    expect(Object.keys(l.hojas[0].filas[0]).slice(0, 5)).toEqual([
      'SKU',
      'Artículo',
      'Proveedor',
      'Unidad',
      'Inventario',
    ]);
    expect(l.hojas[3].filas).toHaveLength(15);
    expect(l.hojas[5].filas).toHaveLength(15);
    const par = l.hojas[6].filas.map((f) => f['Parámetro']);
    expect(par).toContain('imp.escenario');
    expect(par.some((k) => String(k).startsWith('imp.items.'))).toBe(false);
  });

  it('Café: cuatro hojas y el nombre con año y escenario', () => {
    const l = libroCafe(cafe)!;
    expect(l.archivo).toBe('Cafe_2027_Optimista.xlsx');
    expect(l.hojas.map((h) => [h.nombre, h.filas.length > 0])).toEqual([
      ['Kg por mes', true],
      ['Presentaciones', true],
      ['Ahorro por mes', true],
      ['Parámetros', true],
    ]);
    expect(l.hojas[0].filas).toHaveLength(12);
  });

  it('sin cálculo no hay libro; los parámetros aplanan listas y escriben las de objetos como JSON', () => {
    expect(libroImportaciones({ ...imp, S: null })).toBeNull();
    expect(libroCafe({ ...cafe, R: null })).toBeNull();
    expect(filasParametros('imp', { b: [1, 2], a: [{ k: 1 }], c: { d: true } })).toEqual([
      { Parámetro: 'imp.a', Valor: '[{"k":1}]' },
      { Parámetro: 'imp.b.0', Valor: 1 },
      { Parámetro: 'imp.b.1', Valor: 2 },
      { Parámetro: 'imp.c.d', Valor: true },
    ]);
  });

  it('el .xlsx que arma SheetJS se vuelve a leer con las mismas hojas y valores', () => {
    const l = libroImportaciones(imp)!;
    const wb = XLSX.utils.book_new();
    for (const h of l.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
    const leido = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(leido.SheetNames).toEqual(l.hojas.map((h) => h.nombre));
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(leido.Sheets['Qué pedir']);
    expect(filas[0].SKU).toBe(imp.S.productos[0].sku);
  });
});

describe('botón Exportar Excel', () => {
  it('escribe el archivo con el nombre del libro', async () => {
    render(<DescargarExcel libro={libroCafe(cafe)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(x.writeFile).toHaveBeenCalled());
    expect(x.writeFile.mock.calls[0][1]).toBe('Cafe_2027_Optimista.xlsx');
    expect(x.writeFile.mock.calls[0][0].SheetNames).toHaveLength(4);
  });

  it('si la librería falla, lo dice; sin libro no hay botón', async () => {
    x.fallar = true;
    const { unmount } = render(<DescargarExcel libro={libroCafe(cafe)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    unmount();
    render(<DescargarExcel libro={null} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-excel-imp-cafe.test.tsx`
Expected: FAIL. `Failed to resolve import "../../components/comercializadora/descargar-excel"`.

- [ ] **Step 3: Las hojas y el botón**

Crear `lib/comercializadora/excelImpCafe.ts` (`_impExportar` 38459 y `_cafeExportar` 39761; la hoja Parámetros es `_planCfgPlanaFilas` 34072 filtrada por sección):

```ts
import type { CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { CorridaCafe } from '../../supabase/functions/_shared/planCafe.ts';
import { CAFE_PROD } from '../../supabase/functions/_shared/impCafeCfg.ts';

/** Una hoja del libro: nombre y filas (las columnas salen de las llaves, como XLSX.utils.json_to_sheet). */
export interface Hoja {
  nombre: string;
  filas: Record<string, unknown>[];
}
export interface LibroExcel {
  archivo: string;
  hojas: Hoja[];
}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * _planCfgAplanar + _planCfgPlanaFilas sobre una sección (imp o cafe): una fila por parámetro, ordenadas por clave. Las
 * listas de números van por índice; las listas de objetos (los proveedores) se escriben como JSON.
 */
export function filasParametros(raiz: string, seccion: unknown, excluir?: string): Hoja['filas'] {
  const out: Record<string, unknown> = {};
  const aplanar = (o: X, pre: string) => {
    Object.keys(o || {}).forEach((k) => {
      const v = o[k],
        p = pre + '.' + k;
      if (Array.isArray(v)) {
        if (v.every((x) => x === null || typeof x !== 'object')) v.forEach((x, i) => (out[p + '.' + i] = x));
        else out[p] = JSON.stringify(v);
      } else if (v && typeof v === 'object') aplanar(v, p);
      else out[p] = v;
    });
  };
  aplanar(seccion, raiz);
  return Object.keys(out)
    .sort()
    .filter((k) => !excluir || k.indexOf(excluir) !== 0)
    .map((k) => ({ Parámetro: k, Valor: out[k] }));
}

/** window._impExportar: las siete hojas del sitio viejo, con el escenario que se está viendo. */
export function libroImportaciones(c: CorridaImp): LibroExcel | null {
  const S = c.S;
  if (!S) return null;
  const ped = S.productos.map((p: X) => {
    const q = p.quiebre;
    return {
      SKU: p.sku,
      Artículo: q.producto,
      Proveedor: q.proveedorNombre,
      Unidad: q.unidad,
      Inventario: q.stockHoy,
      'En camino': q.yaComprado,
      'Venta al mes (3 meses)': q.ventaMes3,
      'Meses que alcanza': q.mesesAlcanza,
      'Se acaba': q.seAcaba || q.seAcabaTexto,
      'Lead time': q.leadTime,
      'Pedir a más tardar': q.pedirATardar,
      'Colocar pedido': q.colocarPedido,
      'Llega a CEDIS': q.llegaCedis,
      'Días sin producto': q.diasSinProducto,
      Estado: q.estado,
      'Cantidad a pedir': q.cantidadPedir,
      Inversión: q.inversion,
      CBM: q.cbm,
      'Compra puente': q.compraPuente,
      Nota: q.nota,
    };
  });
  const cont = S.plan.contenedores.map((x: X) => ({
    '#': x.n,
    Colocar: x.colocar,
    Llega: x.llega,
    'Alcanza hasta': x.alcanzaHasta,
    'Días que alcanza': x.diasAlcanza,
    'CBM por día': x.cbmDia,
    Sucursales: x.sucursales,
    CBM: x.cbm,
    Inversión: x.inversion,
    Estado: x.estado,
  }));
  const cant = S.plan.cantidades.map((a: X) => {
    const o: Record<string, unknown> = { Artículo: a.producto, Alias: a.alias, 'CBM por caja': a.cbmCaja };
    a.porContenedor.forEach((q: number, j: number) => (o['C' + (j + 1)] = q));
    return o;
  });
  const proy = S.meses.map((m: X) => ({
    Mes: m.inicio,
    'Sucursales (inicio)': m.sucursalesInicio,
    Aperturas: m.aperturas,
    'CBM vasos y tapas': m.cbmVasosTapas,
    'CBM que llega': m.cbmQueLlega,
    'Stock al cierre (CBM)': m.stockVasosTapasCbm,
    'Inventario (días)': m.inventarioDiasCierre,
  }));
  const pu = S.productos
    .filter((p: X) => p.compraPuente.compraPuente > 0 || p.compraPuente.yaComprado > 0)
    .map((p: X) => {
      const cp = p.compraPuente;
      return {
        SKU: p.sku,
        Artículo: p.quiebre.producto,
        Inventario: cp.stockHoy,
        'Ya pedido': cp.yaComprado,
        Llega: cp.llega,
        'Venta hasta que llega': cp.ventaHastaLlegar,
        Faltante: cp.faltante,
        Colchón: cp.colchon,
        'Compra puente': cp.compraPuente,
        'Cómo cubrir': cp.comoCubrir,
      };
    });
  const red = c.ent.meta.red.filas.map((f: X, i: number) => ({
    'Mes #': i + 1,
    'Pipeline registrado': f.pipeline,
    'Plan de Dirección': f.plan,
    Cierres: f.cierres,
    Considerada: f.considerada,
    'De dónde': f.fuente,
  }));
  return {
    archivo: `Importaciones_${c.ent.P.fechaCorte}.xlsx`,
    hojas: [
      { nombre: 'Qué pedir', filas: ped },
      { nombre: 'Contenedores', filas: cont },
      { nombre: 'Cantidades por contenedor', filas: cant },
      { nombre: 'Proyección mensual', filas: proy },
      { nombre: 'Compra puente', filas: pu },
      { nombre: 'Aperturas consideradas', filas: red },
      { nombre: 'Parámetros', filas: filasParametros('imp', c.cfg.imp, 'imp.items.') },
    ],
  };
}

/** window._cafeExportar: las cuatro hojas del sitio viejo, con el escenario que se está viendo. */
export function libroCafe(c: CorridaCafe): LibroExcel | null {
  const R = c.R;
  if (!R) return null;
  const tl = R.timeline,
    lab = R.etiquetasMes,
    dm = R.detalleMensual;
  const mes: Hoja['filas'] = [];
  for (let i = 0; i < 12; i++)
    mes.push({
      Mes: lab[i],
      'White (esperado)': tl.grupos.White.esperado.mes[i],
      'Kraft (esperado)': tl.grupos.Kraft.esperado.mes[i],
      'Black (esperado)': tl.grupos.Black.esperado.mes[i],
      'Total esperado': tl.total.esperado.mes[i],
      Mínimo: tl.total.min.mes[i],
      Máximo: tl.total.max.mes[i],
      'A comprar (escenario activo)': dm.kgComprar.mes[i],
      'Sucursales al cierre': dm.sucursalesActivas[i],
      'Kg por sucursal': dm.kgPorSucursal[i],
    });
  const nom: Record<string, string> = {};
  CAFE_PROD.forEach((p) => (nom[p.id] = p.nombre));
  const pr = R.comparativa.porPresentacion.map((f: X) => ({
    Presentación: nom[f.id] || f.id,
    Bolsas: f.bolsas,
    Kg: f.kg,
    'Costo vigente': f.costoVigente,
    'Costo nuevo': f.costoNuevo,
    Ahorro: f.ahorro,
    'Ahorro %': f.ahorroPct,
  }));
  const ah = R.comparativa.mensual.map((m: X) => ({
    Mes: m.etiqueta,
    'Costo vigente': m.costoVigente,
    'Costo nuevo': m.costoNuevo,
    Ahorro: m.ahorro,
    'Ahorro acumulado': m.ahorroAcumulado,
  }));
  return {
    archivo: `Cafe_${c.cfg.cafe.anio}_${c.esc}.xlsx`,
    hojas: [
      { nombre: 'Kg por mes', filas: mes },
      { nombre: 'Presentaciones', filas: pr },
      { nombre: 'Ahorro por mes', filas: ah },
      { nombre: 'Parámetros', filas: filasParametros('cafe', c.cfg.cafe) },
    ],
  };
}
```

Crear `components/comercializadora/descargar-excel.tsx`:

```tsx
'use client';
import { useState } from 'react';
import { Download } from 'lucide-react';
import type { LibroExcel } from '@/lib/comercializadora/excelImpCafe';

/**
 * "Exportar Excel" (_impExportar / _cafeExportar): arma el .xlsx en el navegador con SheetJS (`xlsx` 0.20.3 de la CDN
 * oficial, la que ya usa el portal), con las hojas que calculó el servidor. No lee nada más ni usa llaves.
 */
export function DescargarExcel({ libro }: { libro: LibroExcel | null }) {
  const [error, setError] = useState(false);
  if (!libro) return null;
  return (
    <>
      <button
        type="button"
        onClick={() =>
          import('xlsx')
            .then((XLSX) => {
              const wb = XLSX.utils.book_new();
              for (const h of libro.hojas)
                XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
              XLSX.writeFile(wb, libro.archivo);
              setError(false);
            })
            .catch(() => setError(true))
        }
        className="inline-flex h-10 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
      >
        <Download size={15} aria-hidden="true" /> Exportar Excel
      </button>
      {error ? (
        <span role="alert" className="text-sm text-bad">
          La librería de Excel no está disponible
        </span>
      ) : null}
    </>
  );
}
```

`package.json` no cambia: `xlsx` ya está fijado a `https://cdn.sheetjs.com/xlsx-0.20.3/xlsx-0.20.3.tgz` (decisión 2).

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/portal/com-excel-imp-cafe.test.tsx`
Expected: PASS (6). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/excelImpCafe.ts components/comercializadora/descargar-excel.tsx tests/portal/com-excel-imp-cafe.test.tsx
git commit -m "feat(comercializadora): Exportar Excel de Importaciones y Café con las hojas del viejo"
```

---

### Task 7: Parámetros de Importaciones y Café: guardado con versión e historial, y editores

**Files:**
- Create: `lib/comercializadora/paramsImpCafe.ts`
- Create: `lib/comercializadora/paramsContexto.ts`
- Create: `components/comercializadora/parametros-imp-cafe.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`guardarParamsImpCafe`)
- Test: `tests/portal/com-params-acciones.test.ts`, `tests/portal/com-params-editores.test.tsx`

**Interfaces:**
- Consumes:
  - de la Tarea 1: `impCfgNorm`, `cafeCfgNorm`, `impCafeEtq`, `impMesTxt`, `IMP_ESCS`, `CAFE_ESCS`, `IMP_CONT_TIPOS`, `CAFE_PROD` y `MESES_ABR`;
  - de la Tarea 3: `impSkuKey`, `impVentasPlat` y `CorridaImp`; de la Tarea 4: `CorridaCafe`; de `planDatos.ts`: `comSaldoCedis` y `DatosPlan`;
  - de `config.ts`: `difConfig`, `leerRuta`, `ponerRuta` y `Config`;
  - de `acciones.ts`: `editorCom`, `fallo`, `SOLO_LECTURA`, `CONFIG_OCUPADA` y `Resultado`.
- Produces:
  - `paramsImpCafe.ts` (sin el motor; lo importan client components):
    - reexporta las constantes y normas de la Tarea 1;
    - `numeroParam(txt, { min, max, entero?, nulo? }, previo): number | null`;
    - `interface FilaRed { key; pipeline; plan; cierres; considerada; fuente }` y `redConsiderada(pipeline: number[], claves: string[], imp, esc, aperIncluir): FilaRed[]`;
    - `interface MetaItemImp`, `interface CandidatoImp`, `interface ContextoParamsImp { claves; pipeline; pl; sucHoyAuto; aperIncluir; entregaMax; meta; candidatos }` e `interface ContextoParamsCafe { anio; ini; a0; pipeAnio }`;
    - `usarPlataforma(imp, meta, campo: 'venta' | 'kit', sku?) → { imp, n }`.
  - `paramsContexto.ts` (server-only): `contextoParamsImp(c: CorridaImp, R: DatosPlan): ContextoParamsImp` y `contextoParamsCafe(c: CorridaCafe): ContextoParamsCafe`.
  - `acciones.ts`: `guardarParamsImpCafe(ambito: 'imp' | 'cafe', borrador: unknown, version: number): Promise<Resultado<{ version: number; cambios: number }>>`.
  - `parametros-imp-cafe.tsx`: `<ParametrosImp imp version editable esc ctx />` y `<ParametrosCafe cafe version editable ctx />`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-params-acciones.test.ts`:

```ts
// Plan 3e, decisión 7: guardar los parámetros de Importaciones y Café (solo config.imp / config.cafe, con versión e historial).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', invocar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: m.invocar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { guardarParamsImpCafe } from '../../app/(comercializadora)/comercializadora/acciones';
import {
  cafeCfgNorm,
  impCfgNorm,
  numeroParam,
  redConsiderada,
  usarPlataforma,
} from '../../lib/comercializadora/paramsImpCafe';
import { contextoParamsImp } from '../../lib/comercializadora/paramsContexto';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const OCUPADA =
  'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.';
const base = () =>
  dbFalsa({
    com_plan_config: [{ id: 1, config: { consumo: { ventana: 45 }, kpi: { prec_min: 80 } }, version: 7 }],
    com_plan_config_historial: [],
  });

describe('guardarParamsImpCafe', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.invocar.mockReset();
  });

  it('Importaciones: escribe config.imp normalizada, conserva lo demás y deja historial por clave; no recalcula', async () => {
    const f = base();
    m.db = f.db;
    const b = impCfgNorm({});
    b.items['INS-DES-021'].venta = 0.9;
    b.escenario = 'Optimista';
    b.prov[1].lead = 75;
    expect(await guardarParamsImpCafe('imp', b, 7)).toEqual({ ok: true, version: 8, cambios: 3 });
    const fila = f.tablas.com_plan_config[0] as Record<string, any>;
    expect(fila.version).toBe(8);
    expect(fila.config.consumo).toEqual({ ventana: 45 });
    expect(fila.config.kpi).toEqual({ prec_min: 80 });
    expect(fila.config.imp).toEqual(impCfgNorm(b));
    expect(
      f.tablas.com_plan_config_historial.map((h) => [h.ambito, h.clave, h.valor_anterior, h.valor_nuevo]),
    ).toEqual([
      ['config', 'imp.escenario', 'Base', 'Optimista'],
      ['config', 'imp.items.INS-DES-021.venta', 0.6314, 0.9],
      ['config', 'imp.prov.1.lead', 90, 75],
    ]);
    expect(m.invocar).not.toHaveBeenCalled();
  });

  it('Café: el borrador se normaliza antes de guardar (fuera de rango se acota)', async () => {
    const f = base();
    m.db = f.db;
    const b = cafeCfgNorm({});
    b.prod.white_1kg.mezcla = 2;
    b.anio = '2028';
    const r = await guardarParamsImpCafe('cafe', b, 7);
    expect(r).toEqual({ ok: true, version: 8, cambios: 2 });
    expect((f.tablas.com_plan_config[0] as Record<string, any>).config.cafe.prod.white_1kg.mezcla).toBe(1);
    expect(f.tablas.com_plan_config_historial.map((h) => h.clave)).toEqual([
      'cafe.anio',
      'cafe.prod.white_1kg.mezcla',
    ]);
  });

  it('otra persona guardó antes: no escribe; dos que guardan a la vez con la misma versión, gana el primero', async () => {
    const f = base();
    m.db = f.db;
    const b = impCfgNorm({ escenario: 'Pesimista' });
    expect(await guardarParamsImpCafe('imp', b, 6)).toEqual({ error: OCUPADA });
    expect(f.tablas.com_plan_config[0].version).toBe(7);
    const [a, c] = await Promise.all([
      guardarParamsImpCafe('imp', b, 7),
      guardarParamsImpCafe('cafe', cafeCfgNorm({ ajuste: 0.1 }), 7),
    ]);
    expect([a, c].filter((x) => 'ok' in x)).toHaveLength(1);
    expect([a, c].filter((x) => 'error' in x)).toEqual([{ error: OCUPADA }]);
    expect(f.tablas.com_plan_config[0].version).toBe(8);
  });

  it('sin cambios, ámbito desconocido o solo lectura: no escribe', async () => {
    const f = base();
    m.db = f.db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({}), 7)).toEqual({
      error: 'No hay cambios que guardar',
    });
    expect(await guardarParamsImpCafe('kpi' as 'imp', {}, 7)).toEqual({ error: 'Sección desconocida' });
    m.nivel = 'lectura';
    const g = base();
    m.db = g.db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({ escenario: 'Manual' }), 7)).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(g.consultas).toEqual([]);
    expect(f.tablas.com_plan_config[0].version).toBe(7);
  });

  it('sin configuración guardada o si falla la lectura: no escribe', async () => {
    m.db = dbFalsa({ com_plan_config: [] }).db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({ escenario: 'Manual' }), 0)).toEqual({
      error: 'No hay configuración guardada todavía',
    });
    m.db = dbFalsa({ com_plan_config: [] }, [{ tabla: 'com_plan_config', op: 'select' }]).db;
    expect(await guardarParamsImpCafe('imp', {}, 0)).toEqual({
      error: 'No se pudo guardar. Intenta de nuevo.',
    });
  });
});

describe('lo que usan los editores', () => {
  const c = impCorrer(datosImp(), normalizarCfgMotor({}));
  const ctx = contextoParamsImp(c, datosImp());

  it('redConsiderada con lo guardado da la misma tabla que _impRed del motor', () => {
    const red = redConsiderada(ctx.pipeline, ctx.claves, c.cfg.imp, 'Base', true);
    expect(
      red.map(({ key, pipeline, plan, cierres, considerada, fuente }) => ({
        key,
        pipeline,
        plan,
        cierres,
        considerada,
        fuente,
      })),
    ).toEqual(
      c.ent.meta.red.filas.map(
        ({ key, pipeline, plan, cierres, considerada, fuente }: Record<string, unknown>) => ({
          key,
          pipeline,
          plan,
          cierres,
          considerada,
          fuente,
        }),
      ),
    );
    expect(
      redConsiderada(ctx.pipeline, ctx.claves, c.cfg.imp, 'Base', false).every((f) => f.considerada === 0),
    ).toBe(true);
  });

  it('contexto: candidatos importados fuera del plan, con su renglón; meta por artículo con la plataforma', () => {
    expect(ctx.candidatos.map((x) => x.sku)).toEqual(['IMP-NUE-900']);
    expect(ctx.candidatos[0].item).toMatchObject({
      prov: 'Easy Drinkware',
      familia: 'General',
      activo: true,
    });
    expect(ctx.meta['INS-DES-021'].cat).toMatchObject({ costo: 600 });
    expect(ctx.meta['INS-DES-002'].cat).toBeNull();
    expect(ctx.claves[0]).toBe('2026-11');
  });

  it('numeroParam: vacío, texto, fuera de rango, enteros y coma decimal', () => {
    const r = { min: 0, max: 10, entero: true };
    expect(numeroParam('', r, 4)).toBe(4);
    expect(numeroParam('', { ...r, nulo: true }, 4)).toBeNull();
    expect(numeroParam('abc', r, 4)).toBe(4);
    expect(numeroParam('99', r, 4)).toBe(10);
    expect(numeroParam('2,6', r, 4)).toBe(3);
    expect(numeroParam('2,6', { min: 0, max: 10 }, 4)).toBe(2.6);
  });

  it('usarPlataforma: copia la venta de la plataforma (4 decimales) a uno o a todos los que tienen dato', () => {
    const uno = usarPlataforma(c.cfg.imp, ctx.meta, 'venta', 'INS-DES-021');
    expect(uno.n).toBe(1);
    expect(uno.imp.items['INS-DES-021'].venta).toBe(
      Math.round((ctx.meta['INS-DES-021'].vPlat as number) * 10000) / 10000,
    );
    expect(usarPlataforma(c.cfg.imp, ctx.meta, 'kit').n).toBe(1); // solo INS-DES-021 tiene piezas por apertura
  });
});
```

Crear `tests/portal/com-params-editores.test.tsx`:

```tsx
// Plan 3e: editores de parámetros de Importaciones y Café (borrador, Guardar, Descartar, solo lectura).
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ refresh: vi.fn(), guardar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  guardarParamsImpCafe: m.guardar,
}));
import { ParametrosCafe, ParametrosImp } from '../../components/comercializadora/parametros-imp-cafe';
import { contextoParamsCafe, contextoParamsImp } from '../../lib/comercializadora/paramsContexto';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeCorrer } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const imp = impCorrer(datosImp(), normalizarCfgMotor({}));
const ctxImp = contextoParamsImp(imp, datosImp());
const cafe = cafeCorrer(datosImp(), normalizarCfgMotor({}));
const escribir = (etiqueta: string, valor: string) => {
  const el = screen.getByLabelText(etiqueta);
  fireEvent.change(el, { target: { value: valor } });
  fireEvent.blur(el);
};

describe('ParametrosImp', () => {
  afterEach(() => vi.clearAllMocks());

  it('edita el borrador y guarda solo la sección imp con la versión que vio', async () => {
    m.guardar.mockResolvedValue({ ok: true, version: 5, cambios: 2 });
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    const guardar = screen.getByRole('button', { name: 'Guardar cambios' });
    expect((guardar as HTMLButtonElement).disabled).toBe(true);
    escribir('Venta INS-DES-021', '0.95');
    escribir('Lead time Easy Drinkware', '999'); // se acota a 400
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
    fireEvent.click(guardar);
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    const [ambito, b, version] = m.guardar.mock.calls[0];
    expect([ambito, version]).toEqual(['imp', 4]);
    expect(b.items['INS-DES-021'].venta).toBe(0.95);
    expect(b.prov[1].lead).toBe(400);
    expect(await screen.findByText('Guardado: 2 cambios.')).toBeTruthy();
    expect(m.refresh).toHaveBeenCalled();
  });

  it('la tabla de la red se recalcula con el borrador; "usar" toma la venta de la plataforma; agregar y descartar', () => {
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    escribir('Meses en los que manda el pipeline', '0');
    escribir('Plan 2027-02', '40');
    expect(screen.getByLabelText('Plan 2027-02').closest('tr')!.textContent).toContain('40plan de Dirección');
    fireEvent.click(screen.getAllByRole('button', { name: 'usar' })[0]);
    const v = (screen.getByLabelText('Venta INS-DES-021') as HTMLInputElement).value;
    expect(Number(v)).toBe(Math.round((ctxImp.meta['INS-DES-021'].vPlat as number) * 10000) / 10000);
    fireEvent.click(screen.getByRole('button', { name: 'Agregar' }));
    expect(screen.getByLabelText('Venta IMP-NUE-900')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(screen.queryByLabelText('Venta IMP-NUE-900')).toBeNull();
    expect(screen.getByText(/Sin cambios/)).toBeTruthy();
  });

  it('quitar pide confirmación; un error al guardar se muestra y el borrador se queda', async () => {
    m.guardar.mockResolvedValue({ error: 'Otra persona guardó la configuración mientras trabajabas.' });
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable esc="Base" ctx={ctxImp} />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Quitar' })[0]);
    expect(screen.queryByLabelText('Venta INS-DES-021')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    expect((await screen.findByRole('alert')).textContent).toContain('Otra persona');
    expect(screen.getByText('Hay cambios sin guardar.')).toBeTruthy();
  });

  it('solo lectura: campos deshabilitados y sin botones de guardar', () => {
    render(<ParametrosImp imp={imp.cfg.imp} version={4} editable={false} esc="Base" ctx={ctxImp} />);
    expect((screen.getByLabelText('Venta INS-DES-021') as HTMLInputElement).disabled).toBe(true);
    expect(screen.queryByRole('button', { name: 'Guardar cambios' })).toBeNull();
    expect(screen.getByText('Tu acceso es de solo lectura.')).toBeTruthy();
  });
});

describe('ParametrosCafe', () => {
  it('la suma de la mezcla se marca si no es 1; el arranque manual muestra sus campos; guarda la sección cafe', async () => {
    m.guardar.mockResolvedValue({ ok: true, version: 3, cambios: 1 });
    render(<ParametrosCafe cafe={cafe.cfg.cafe} version={2} editable ctx={contextoParamsCafe(cafe)} />);
    expect(screen.getAllByText(/^\d+ \(plataforma\)$/).length).toBe(6);
    escribir('Mezcla White 1 kg', '0.5');
    expect(screen.getByText('0.614').className).toContain('text-bad');
    fireEvent.change(screen.getByLabelText('Arranque del año'), { target: { value: 'manual' } });
    expect(screen.getByLabelText('Sucursales Base')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    expect(m.guardar.mock.calls[0][0]).toBe('cafe');
    expect(m.guardar.mock.calls[0][1]).toMatchObject({
      q4_modo: 'manual',
      prod: { white_1kg: { mezcla: 0.5 } },
    });
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-params-acciones.test.ts tests/portal/com-params-editores.test.tsx`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/paramsImpCafe"` y `".../paramsContexto"`.

- [ ] **Step 3: Ayudas, contexto, acción y editores**

Crear `lib/comercializadora/paramsImpCafe.ts` (`_impEdit` 38382 para los números; el bucle de `_impRed` 37685 para la tabla; `_impUsarPlat`/`_impUsarPlatTodos` 38444–38458):

```ts
// Parámetros de Importaciones y Café (plan 3e): normalización (port de _impCfgNorm/_cafeCfgNorm), lo que pintan los
// editores. Sin 'server-only' y sin el motor: lo importan los editores, que son client components.
import {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  cafeCfgNorm,
  impCafeEtq,
  impCfgNorm,
  impMesTxt,
} from '../../supabase/functions/_shared/impCafeCfg.ts';

export {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  cafeCfgNorm,
  impCafeEtq,
  impCfgNorm,
  impMesTxt,
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/**
 * _impEdit: lo que se escribió en un campo numérico. Vacío: null si el campo lo acepta (usa el valor general), si no el
 * valor anterior; texto que no es número: el anterior; fuera de rango se acota; los enteros se redondean.
 */
export function numeroParam(
  txt: string,
  r: { min: number; max: number; entero?: boolean; nulo?: boolean },
  previo: number | null,
): number | null {
  const t = String(txt ?? '').trim();
  if (t === '') return r.nulo ? null : previo;
  const n = Number(t.replace(',', '.'));
  if (!isFinite(n)) return previo;
  const v = Math.min(r.max, Math.max(r.min, n));
  return r.entero ? Math.round(v) : v;
}

export interface FilaRed {
  key: string;
  pipeline: number;
  plan: number;
  cierres: number;
  considerada: number;
  fuente: string;
}
/**
 * La tabla de _impParamRed recalculada con el borrador (el bucle de _impRed): el pipeline por mes no depende de la sección
 * imp, así que el servidor lo manda una vez y aquí se combina con el plan de Dirección y el cumplimiento del escenario.
 */
export function redConsiderada(
  pipeline: number[],
  claves: string[],
  imp: X,
  esc: string,
  aperIncluir: boolean,
): FilaRed[] {
  const E = imp.escenarios[esc];
  return claves.map((key, m) => {
    const plan = imp.red.plan[key] !== undefined ? imp.red.plan[key] : imp.red.plan_def,
      cierres = imp.red.cierres[key] || 0;
    const pr = pipeline[m] * Math.min(1, E.cumpl),
      pn = plan * E.cumpl;
    let considerada: number, fuente: string;
    if (m < imp.red.meses_pipeline || pr >= pn) {
      considerada = Math.round(pr);
      fuente = 'pipeline';
    } else {
      considerada = Math.round(pn);
      fuente = 'plan';
    }
    if (!aperIncluir) {
      considerada = 0;
      fuente = 'sin aperturas';
    }
    return { key, pipeline: pipeline[m], plan, cierres, considerada, fuente };
  });
}

/** Lo que el editor de artículos muestra junto a cada valor: lo que dice la plataforma y el catálogo. */
export interface MetaItemImp {
  vPlat: number | null;
  kPlat: number | null;
  ocN: number;
  ocQ: number;
  cat: { estatus: string; origen: string; lt: number | null; costo: number; multiplo: number } | null;
}
/** Importado del catálogo que no está en el plan, con el renglón que se agregaría (_impAgregar). */
export interface CandidatoImp {
  sku: string;
  nombre: string;
  estatus: string;
  proveedor: string;
  inventario: number;
  item: X;
}
/** Datos de la plataforma para el editor de Importaciones, calculados en el servidor con lo guardado. */
export interface ContextoParamsImp {
  claves: string[];
  pipeline: number[];
  pl: { total: number; vencidas: number; sinFecha: number; despues: number };
  sucHoyAuto: number;
  aperIncluir: boolean;
  entregaMax: number;
  meta: Record<string, MetaItemImp>;
  candidatos: CandidatoImp[];
}

/** _impUsarPlat / _impUsarPlatTodos: copia la venta o el kit de la plataforma (4 decimales) a uno o a todos. */
export function usarPlataforma(
  imp: X,
  meta: Record<string, MetaItemImp>,
  campo: 'venta' | 'kit',
  sku?: string,
) {
  const items = { ...imp.items };
  let n = 0;
  for (const k of sku ? [sku] : imp.orden) {
    const mt = meta[k],
      v = mt ? (campo === 'venta' ? mt.vPlat : mt.kPlat) : null;
    if (v === null || v === undefined || !items[k]) continue;
    items[k] = { ...items[k], [campo]: Math.round(v * 10000) / 10000 };
    n++;
  }
  return { imp: { ...imp, items }, n };
}

/** Arranque del año de café que sale de la plataforma (para _cafeParamEsc y _cafeParamAper), con lo guardado. */
export interface ContextoParamsCafe {
  anio: number;
  ini: number;
  a0: number;
  pipeAnio: number[];
}
```

Crear `lib/comercializadora/paramsContexto.ts` (lo que `_impParamRed`, `_impParamItems` y `_impAgregar` 38431 leían de `_planRaw`, y el arranque de `_cafeParamEsc`/`_cafeParamAper`):

```ts
import 'server-only';
// Lo que el servidor prepara para los editores de parámetros de Importaciones y Café (plan 3e), con lo guardado.
import { impSkuKey, impVentasPlat, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import type { CorridaCafe } from '../../supabase/functions/_shared/planCafe.ts';
import { comSaldoCedis, type DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import type { CandidatoImp, ContextoParamsCafe, ContextoParamsImp, MetaItemImp } from './paramsImpCafe';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/** El contexto del editor: la red de _impParamRed, la plataforma por artículo y los candidatos (máximo 80, como el viejo). */
export function contextoParamsImp(c: CorridaImp, R: DatosPlan): ContextoParamsImp {
  const m = c.ent.meta,
    ci = c.cfg.imp,
    cfg = c.cfg;
  const meta: Record<string, MetaItemImp> = {};
  Object.keys(m.items).forEach((sku) => {
    const it = m.items[sku],
      pd = it.cat;
    meta[sku] = {
      vPlat: it.vPlat ?? null,
      kPlat: it.kPlat ?? null,
      ocN: it.ocN || 0,
      ocQ: it.ocQ || 0,
      cat: pd
        ? { estatus: pd.estatus, origen: pd.origen, lt: pd.lt, costo: pd.costo, multiplo: pd.multiplo }
        : null,
    };
  });
  const enPlan: Record<string, 1> = {};
  ci.orden.forEach((k: string) => (enPlan[impSkuKey(k)] = 1));
  const lt: Record<string, number> = {};
  R.lt.forEach((l) => (lt[l.sku] = Number(l.dias || 0)));
  const vp = impVentasPlat(R, cfg);
  const cerr = ci.prov.find((p: X) => !p.contenedor) || ci.prov[0];
  const candidatos: CandidatoImp[] = [];
  R.cat.forEach((r) => {
    if (enPlan[impSkuKey(r.sku)]) return;
    const imp = String(r.origen || '').toUpperCase() === 'IMPORTADO' || lt[r.sku] > cfg.compra.entrega_max;
    if (!imp || r.estatus === 'Inactivo' || r.estatus === 'Compra Unica') return;
    let v = 0;
    if (vp.por[r.sku] > 0 && vp.suc > 0)
      v = Math.round((((vp.por[r.sku] / vp.W) * 30) / vp.suc) * 10000) / 10000;
    const pv = ci.prov.find(
      (p: X) =>
        String(r.proveedor_preferido || '')
          .toLowerCase()
          .indexOf(p.clave.toLowerCase()) >= 0,
    );
    candidatos.push({
      sku: r.sku,
      nombre: r.nombre || '',
      estatus: r.estatus || '',
      proveedor: r.proveedor_preferido || '',
      inventario: comSaldoCedis(r),
      item: {
        nombre: r.nombre || r.sku,
        familia: 'General',
        prov: (pv || cerr).clave,
        unidad: 'piezas',
        venta: v,
        kit: Math.round(Number(r.cantidad_por_apertura || 0) * 10000) / 10000,
        empaque: Math.max(1, Number(r.multiplo_compra || 1)),
        minimo: Number(r.minimo_compra_pzas || 0),
        costo: Number(r.costo_unitario || 0),
        cbm: 0,
        cbm_fuente: '',
        alias: '',
        activo: true,
        camino_qty: 0,
        camino_fecha: '',
      },
    });
  });
  const pl = m.red.pl;
  return {
    claves: m.red.filas.map((f: X) => f.key),
    pipeline: m.red.filas.map((f: X) => f.pipeline),
    pl: { total: pl.total, vencidas: pl.vencidas, sinFecha: pl.sinFecha, despues: pl.despues },
    sucHoyAuto: R.aperturas.filter((a) => a.estatus === 'activa').length,
    aperIncluir: cfg.aper.incluir !== false,
    entregaMax: cfg.compra.entrega_max,
    meta,
    candidatos: candidatos.slice(0, 80),
  };
}

/** _cafeParamEsc/_cafeParamAper: arranque del año y pipeline por mes que salen de la plataforma, para el año guardado. */
export function contextoParamsCafe(c: CorridaCafe): ContextoParamsCafe {
  return {
    anio: c.cfg.cafe.anio,
    ini: c.ent.red.ini,
    a0: c.ent.red.a0,
    pipeAnio: c.ent.red.pipeAnio.slice(),
  };
}
```

En `app/(comercializadora)/comercializadora/acciones.ts`, importar debajo de `limpiarMotor`:

```ts
import { cafeCfgNorm, impCfgNorm } from '@/lib/comercializadora/paramsImpCafe';
```

y agregar al final (usa `CONFIG_OCUPADA`, que ya existe desde el 3d):

```ts
// ── Plan 3e: parámetros de Importaciones y Café ────────────────────────────────────────────────────────────────

/**
 * _planCfgGuardar('imp' | 'cafe') (decisión 7): solo escribe config.imp o config.cafe, normalizada con _impCfgNorm o
 * _cafeCfgNorm; lo demás de la configuración se conserva tal cual. Update condicionado a la versión que vio la pantalla y
 * una fila de historial por cambio (ámbito 'config', claves como 'imp.items.SKU.venta' o 'cafe.prod.white_1kg.precio').
 * No recalcula com-minmax: el servidor no lee estas secciones.
 */
export async function guardarParamsImpCafe(
  ambito: 'imp' | 'cafe',
  borrador: unknown,
  version: number,
): Promise<Resultado<{ version: number; cambios: number }>> {
  try {
    if (ambito !== 'imp' && ambito !== 'cafe') return { error: 'Sección desconocida' };
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version)) return { error: CONFIG_OCUPADA };
    const norm = ambito === 'imp' ? impCfgNorm : cafeCfgNorm;
    const raw: Config = actual.data.config ?? {};
    const antes = norm(raw[ambito]);
    const despues = norm(borrador);
    const cambios = difConfig({ [ambito]: antes }, { [ambito]: despues });
    if (!cambios.length) return { error: 'No hay cambios que guardar' };
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: { ...raw, [ambito]: despues }, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: CONFIG_OCUPADA };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(
        cambios.map((c) => ({
          ambito: 'config',
          clave: c.clave,
          valor_anterior: c.antes,
          valor_nuevo: c.despues,
        })),
      );
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length };
  } catch (e) {
    return fallo(e);
  }
}
```

Crear `components/comercializadora/parametros-imp-cafe.tsx` (`_impVistaParams` 38161 con sus secciones 38034–38160, y `_cafeVistaParams` 39705 con 39660–39704):

```tsx
'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { leerRuta, ponerRuta } from '@/lib/comercializadora/config';
import {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  impMesTxt,
  numeroParam,
  redConsiderada,
  usarPlataforma,
  type ContextoParamsCafe,
  type ContextoParamsImp,
} from '@/lib/comercializadora/paramsImpCafe';
import { guardarParamsImpCafe } from '@/app/(comercializadora)/comercializadora/acciones';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const chico = 'h-8 w-20 rounded-md border border-line bg-surface-2 px-1.5 text-right text-xs tabular-nums';

/** Campo numérico del borrador (_impIn): se escribe libre y al salir se acota como _impEdit. */
function Num(p: {
  valor: number | null;
  min: number;
  max: number;
  entero?: boolean;
  nulo?: boolean;
  ph?: string;
  etiqueta: string;
  deshabilitado: boolean;
  clase?: string;
  alCambiar: (v: number | null) => void;
}) {
  const [txt, setTxt] = useState(p.valor == null ? '' : String(p.valor));
  useEffect(() => setTxt(p.valor == null ? '' : String(p.valor)), [p.valor]);
  return (
    <input
      aria-label={p.etiqueta}
      inputMode="decimal"
      className={p.clase ?? chico}
      value={txt}
      placeholder={p.ph}
      disabled={p.deshabilitado}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const v = numeroParam(txt, p, p.valor);
        setTxt(v == null ? '' : String(v));
        if (v !== p.valor) p.alCambiar(v);
      }}
    />
  );
}

/** Borrador de una sección (imp o cafe): rutas relativas a la sección, Guardar y Descartar. */
function useBorrador(ambito: 'imp' | 'cafe', guardado: X, version: number) {
  const router = useRouter();
  const [b, setB] = useState<X>(guardado);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => setB(guardado), [guardado]);
  const sucio = JSON.stringify(b) !== JSON.stringify(guardado);
  return {
    b,
    setB,
    sucio,
    msg,
    pendiente,
    val: (ruta: string) => leerRuta(b, ruta) as X,
    poner: (ruta: string, v: unknown) => setB((x: X) => ponerRuta(x, ruta, v)),
    guardar: () =>
      iniciar(async () => {
        const r = await guardarParamsImpCafe(ambito, b, version);
        if ('error' in r) return setMsg({ ok: false, t: r.error });
        setMsg({ ok: true, t: `Guardado: ${r.cambios} ${r.cambios === 1 ? 'cambio' : 'cambios'}.` });
        router.refresh();
      }),
    descartar: () => (setB(guardado), setMsg(null)),
  };
}
type Borrador = ReturnType<typeof useBorrador>;

function Barra({ d, editable }: { d: Borrador; editable: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <span className="text-sm text-ink-2">
        {!editable
          ? 'Tu acceso es de solo lectura.'
          : d.sucio
            ? 'Hay cambios sin guardar.'
            : 'Sin cambios. Lo que guardes aquí es la configuración oficial de esta sección.'}
      </span>
      <span className="flex-1" />
      {d.msg ? (
        <span role={d.msg.ok ? 'status' : 'alert'} className={`text-sm ${d.msg.ok ? 'text-ok' : 'text-bad'}`}>
          {d.msg.t}
        </span>
      ) : null}
      {editable ? (
        <>
          <button
            type="button"
            disabled={!d.sucio || d.pendiente}
            onClick={d.descartar}
            className="h-9 rounded-[10px] border border-line-strong px-3 text-sm font-semibold disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={!d.sucio || d.pendiente}
            onClick={d.guardar}
            className="h-9 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {d.pendiente ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      ) : null}
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm" title={ayuda}>
      <span className="text-ink-2">{etiqueta}</span>
      {children}
    </label>
  );
}
function Sel(p: {
  etiqueta: string;
  valor: string;
  opciones: [string, string][];
  deshabilitado: boolean;
  alCambiar: (v: string) => void;
  clase?: string;
}) {
  return (
    <select
      aria-label={p.etiqueta}
      className={p.clase ?? claseCampo}
      value={p.valor}
      disabled={p.deshabilitado}
      onChange={(e) => p.alCambiar(e.target.value)}
    >
      {p.opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Parámetros de Importaciones (_impVistaParams): escenarios, red, política, proveedores, contenedor, fuentes, temporada y artículos. */
export function ParametrosImp(p: {
  imp: X;
  version: number;
  editable: boolean;
  esc: string;
  ctx: ContextoParamsImp;
}) {
  const d = useBorrador('imp', p.imp, p.version);
  const b = d.b,
    no = !p.editable;
  const n = (
    ruta: string,
    et: string,
    r: { min: number; max: number; entero?: boolean; nulo?: boolean },
    o: { ph?: string; clase?: string } = {},
  ) => (
    <Num
      etiqueta={et}
      valor={d.val(ruta) ?? null}
      {...r}
      ph={o.ph}
      clase={o.clase}
      deshabilitado={no}
      alCambiar={(v) => d.poner(ruta, v)}
    />
  );
  const red = redConsiderada(
    p.ctx.pipeline,
    p.ctx.claves,
    b,
    IMP_ESCS.includes(p.esc) ? p.esc : b.escenario,
    p.ctx.aperIncluir,
  );
  const usados: Record<string, number> = {};
  b.orden.forEach((k: string) => {
    const it = b.items[k];
    if (it) usados[String(it.prov).toLowerCase()] = (usados[String(it.prov).toLowerCase()] || 0) + 1;
  });
  const provOpts: [string, string][] = b.prov.map((x: X) => [x.clave, x.nombre]);
  const famOpts: [string, string][] = Object.keys(b.temporada).map((f) => [f, f]);
  const cmp = (hoja: number, plat: number | null, campo: 'venta' | 'kit', sku: string) =>
    plat == null ? (
      <span className="block text-[10px] text-muted-foreground">Plataforma: sin datos</span>
    ) : (
      <span
        className={`block text-[10px] ${hoja > 0 && Math.abs((plat - hoja) / hoja) > 0.25 ? 'text-warn' : 'text-muted-foreground'}`}
      >
        Plataforma: {plat.toLocaleString('es-MX', { maximumFractionDigits: campo === 'venta' ? 3 : 2 })}
        {hoja > 0 ? ` (${plat > hoja ? '+' : ''}${Math.round(((plat - hoja) / hoja) * 100)}%)` : ''}{' '}
        {p.editable ? (
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => d.setB(usarPlataforma(b, p.ctx.meta, campo, sku).imp)}
          >
            usar
          </button>
        ) : null}
      </span>
    );

  return (
    <div className="space-y-5">
      <Barra d={d} editable={p.editable} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Los valores iniciales salieron de tu Sheet &quot;Calculadora de abasto de importados&quot;. El
        inventario, las OCs en camino y las aperturas vienen siempre de la plataforma. Lo que muestra el resto
        de la pantalla se actualiza al guardar.
      </p>

      <Tarjeta
        titulo="Escenarios"
        descripcion="El selector de arriba solo cambia lo que ves; aquí eliges el escenario con el que abre la pantalla. Crecimiento: cuánto crece al año la venta de cada sucursal (0.10 = 10%). Cumplimiento de aperturas: qué parte se cumple (1 = todas). Ajuste de demanda: sube o baja toda la demanda."
      >
        <div className="mb-3 max-w-xs">
          <Campo etiqueta="Escenario de referencia">
            <Sel
              etiqueta="Escenario de referencia"
              valor={b.escenario}
              opciones={IMP_ESCS.map((k) => [k, k])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('escenario', v)}
            />
          </Campo>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Escenario</th>
                <th className="text-right">Crecimiento anual</th>
                <th className="text-right">Cumplimiento de aperturas</th>
                <th className="text-right">Ajuste de demanda</th>
              </tr>
            </thead>
            <tbody>
              {IMP_ESCS.map((k) => (
                <tr key={k}>
                  <td className="font-semibold">{k}</td>
                  <td className="text-right">
                    {n(`escenarios.${k}.crec`, `Crecimiento ${k}`, { min: -0.5, max: 1 })}
                  </td>
                  <td className="text-right">
                    {n(`escenarios.${k}.cumpl`, `Cumplimiento ${k}`, { min: 0, max: 3 })}
                  </td>
                  <td className="text-right">
                    {n(`escenarios.${k}.ajuste`, `Ajuste ${k}`, { min: -0.9, max: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Red de sucursales y aperturas"
        descripcion="El pipeline se actualiza solo con los registros de aperturas. El plan de Dirección cubre los meses en los que todavía no hay aperturas registradas; el plan de cada mes queda fijo en su mes calendario (vacío usa el valor general)."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Sucursales operando hoy" ayuda="Automático = aperturas activas de la plataforma">
            <Sel
              etiqueta="Sucursales operando hoy"
              valor={b.red.suc_hoy_modo}
              opciones={[
                ['auto', `Automático (aperturas activas: ${p.ctx.sucHoyAuto})`],
                ['manual', 'Capturar a mano'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('red.suc_hoy_modo', v)}
            />
          </Campo>
          {b.red.suc_hoy_modo === 'manual' ? (
            <Campo etiqueta="Sucursales hoy">
              {n('red.suc_hoy', 'Sucursales hoy', { min: 0, max: 5000, entero: true }, { clase: claseCampo })}
            </Campo>
          ) : null}
          <Campo etiqueta="Meses en los que manda el pipeline">
            {n(
              'red.meses_pipeline',
              'Meses en los que manda el pipeline',
              { min: 0, max: 15, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Aperturas por mes sin plan propio">
            {n(
              'red.plan_def',
              'Aperturas por mes sin plan propio',
              { min: 0, max: 500, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <p className="my-3 text-xs text-muted-foreground">
          Pipeline: {p.ctx.pl.total} aperturas en proceso
          {p.ctx.pl.vencidas ? ` (${p.ctx.pl.vencidas} con fecha vencida cuentan en el mes en curso)` : ''}
          {p.ctx.pl.sinFecha ? `, ${p.ctx.pl.sinFecha} sin fecha` : ''}
          {p.ctx.pl.despues ? `, ${p.ctx.pl.despues} después de 15 meses` : ''}. &quot;Considerado&quot; ya
          incluye el cumplimiento del escenario.
        </p>
        <div className="overflow-x-auto">
          <table className="tabla max-w-3xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                <th className="text-right">Plan de Dirección</th>
                <th className="text-right">Cierres</th>
                <th className="text-right">Aperturas consideradas</th>
                <th>De dónde</th>
              </tr>
            </thead>
            <tbody>
              {red.map((f) => (
                <tr key={f.key}>
                  <td className="font-semibold">{impMesTxt(f.key)}</td>
                  <td className="text-right tabular-nums">{f.pipeline}</td>
                  <td className="text-right">
                    {n(
                      `red.plan.${f.key}`,
                      `Plan ${f.key}`,
                      { min: 0, max: 500, entero: true, nulo: true },
                      { ph: String(b.red.plan_def) },
                    )}
                  </td>
                  <td className="text-right">
                    {n(
                      `red.cierres.${f.key}`,
                      `Cierres ${f.key}`,
                      { min: 0, max: 500, entero: true, nulo: true },
                      { ph: '0' },
                    )}
                  </td>
                  <td className="text-right font-bold tabular-nums">{f.considerada}</td>
                  <td className="text-xs text-muted-foreground">
                    {f.fuente === 'pipeline'
                      ? 'pipeline'
                      : f.fuente === 'plan'
                        ? 'plan de Dirección'
                        : f.fuente}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Política de compra">
        <div className="grid gap-3 sm:grid-cols-5">
          <Campo etiqueta="Meses que cubre cada pedido">
            {n(
              'politica.meses_cobertura',
              'Meses que cubre cada pedido',
              { min: 1, max: 14, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Meses de respaldo">
            {n('politica.meses_respaldo', 'Meses de respaldo', { min: 0, max: 6 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Días de margen">
            {n(
              'politica.dias_margen',
              'Días de margen',
              { min: 0, max: 60, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Días para juntar pedidos">
            {n(
              'politica.dias_juntar',
              'Días para juntar pedidos',
              { min: 0, max: 180, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Días de respaldo del siguiente contenedor">
            {n(
              'contenedor.dias_respaldo',
              'Días de respaldo del siguiente contenedor',
              { min: 0, max: 120, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Proveedores y lead times"
        descripcion="Días desde que se coloca el pedido hasta que llega a CEDIS; cierres son los días extra por cierres de fábrica o de fin de año. El proveedor de contenedores se planea por contenedor lleno (vasos y tapas)."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Lead time normal</th>
                <th className="text-right">Días extra por cierres</th>
                <th className="text-right">Total</th>
                <th>Contenedores</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {b.prov.map((x: X, i: number) => (
                <tr key={x.clave}>
                  <td className="min-w-48">
                    <input
                      aria-label={`Nombre de ${x.clave}`}
                      className={claseCampo}
                      value={x.nombre}
                      disabled={no}
                      onChange={(e) => d.poner(`prov.${i}.nombre`, e.target.value)}
                    />
                    <span className="block text-[10px] text-muted-foreground">
                      Clave: {x.clave} · {usados[x.clave.toLowerCase()] || 0} artículo(s)
                    </span>
                  </td>
                  <td className="text-right">
                    {n(`prov.${i}.lead`, `Lead time ${x.clave}`, { min: 1, max: 400, entero: true })}
                  </td>
                  <td className="text-right">
                    {n(`prov.${i}.cierres`, `Cierres ${x.clave}`, { min: 0, max: 120, entero: true })}
                  </td>
                  <td className="text-right font-bold tabular-nums">{x.lead + x.cierres}</td>
                  <td className="text-center">
                    <input
                      type="radio"
                      name="imp-prov-cont"
                      aria-label={`Contenedores: ${x.clave}`}
                      checked={!!x.contenedor}
                      disabled={no}
                      onChange={() =>
                        d.poner(
                          'prov',
                          b.prov.map((y: X, j: number) => ({ ...y, contenedor: j === i })),
                        )
                      }
                    />
                  </td>
                  <td className="min-w-56">
                    <input
                      aria-label={`Nota de ${x.clave}`}
                      className={claseCampo}
                      value={x.nota}
                      disabled={no}
                      onChange={(e) => d.poner(`prov.${i}.nota`, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.editable ? (
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={b.prov.length >= 12}
              className="text-sm font-semibold underline disabled:opacity-50"
              onClick={() => {
                let k = b.prov.length + 1,
                  clave = `Proveedor nuevo ${k}`;
                while (b.prov.some((x: X) => x.clave.toLowerCase() === clave.toLowerCase()))
                  clave = `Proveedor nuevo ${++k}`;
                d.poner('prov', [
                  ...b.prov,
                  { clave, nombre: clave, lead: 90, cierres: 0, nota: '', contenedor: false },
                ]);
              }}
            >
              Agregar proveedor
            </button>
            {b.prov.length > 1 && !usados[b.prov[b.prov.length - 1].clave.toLowerCase()] ? (
              <button
                type="button"
                className="text-sm font-semibold underline"
                onClick={() => {
                  const resto = b.prov.slice(0, -1);
                  if (b.prov[b.prov.length - 1].contenedor) resto[0] = { ...resto[0], contenedor: true };
                  d.poner('prov', resto);
                }}
              >
                Quitar el último
              </button>
            ) : null}
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta titulo="Contenedor y compra puente">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Tipo de contenedor">
            <Sel
              etiqueta="Tipo de contenedor"
              valor={b.contenedor.tipo}
              opciones={IMP_CONT_TIPOS.map((t) => [t, t])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('contenedor.tipo', v)}
            />
          </Campo>
          <Campo etiqueta="CBM del 40' HQ">
            {n('contenedor.cbm40', "CBM del 40' HQ", { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="CBM del 45' HQ">
            {n('contenedor.cbm45', "CBM del 45' HQ", { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="CBM personalizado">
            {n('contenedor.cbmp', 'CBM personalizado', { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Llenado real" ayuda="Qué parte del volumen nominal se aprovecha (1 = 100%)">
            {n('contenedor.llenado', 'Llenado real', { min: 0.1, max: 1 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Contenedores por embarque">
            {n(
              'contenedor.por_embarque',
              'Contenedores por embarque',
              { min: 1, max: 10, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Colchón de la compra puente (días)">
            {n(
              'puente.dias_colchon',
              'Colchón de la compra puente',
              { min: 0, max: 60, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Múltiplo de la compra puente">
            {n(
              'puente.multiplo',
              'Múltiplo de la compra puente',
              { min: 1, max: 1000, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Cómo se calcula con los datos de la plataforma"
        descripcion="La venta por sucursal y el kit por apertura pueden venir de tu hoja (los valores de abajo) o de la plataforma (ventas reales y piezas por apertura del catálogo)."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Venta por sucursal">
            <Sel
              etiqueta="Venta por sucursal"
              valor={b.fuentes.venta}
              opciones={[
                ['hoja', 'De la hoja (valores guardados)'],
                ['plataforma', 'De la plataforma'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('fuentes.venta', v)}
            />
          </Campo>
          <Campo etiqueta="Kit por apertura">
            <Sel
              etiqueta="Kit por apertura"
              valor={b.fuentes.kit}
              opciones={[
                ['hoja', 'De la hoja (valores guardados)'],
                ['plataforma', 'Del catálogo (piezas por apertura)'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('fuentes.kit', v)}
            />
          </Campo>
          <Campo etiqueta="Ventana de venta de la plataforma (días)">
            {n(
              'venta_ventana',
              'Ventana de venta de la plataforma',
              { min: 30, max: 365, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          {(
            [
              [
                'prorratear_mes1',
                'Ajustar el mes en curso',
                'El modelo cuenta el mes completo; con esto se le suma al inventario lo que ya se vendió este mes, como si se calculara el día 1',
              ],
              [
                'corregir_hoja',
                'Corregir tres errores de la hoja',
                'La hoja lee la demanda de otro producto en el contenedor 10, no valida el horizonte en el 11 y deja un contenedor fuera del calendario. Apágalo para reproducir la hoja tal cual',
              ],
            ] as const
          ).map(([k, t, ayuda]) => (
            <label key={k} className="flex items-center gap-2" title={ayuda}>
              <input
                type="checkbox"
                checked={!!b[k]}
                disabled={no}
                onChange={(e) => d.poner(k, e.target.checked)}
              />
              {t}
            </label>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Estacionalidad por familia"
        descripcion='Índice de venta por mes calendario (1 = mes normal, 2 = el doble). La familia "General" no tiene estacionalidad.'
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Familia</th>
                {MESES_ABR.map((m) => (
                  <th key={m} className="text-right">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(b.temporada).map((f) => (
                <tr key={f}>
                  <td className="min-w-40 font-semibold">
                    {f}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {b.orden.filter((k: string) => b.items[k] && b.items[k].familia === f).length}{' '}
                      artículo(s)
                    </span>
                  </td>
                  {MESES_ABR.map((m, i) => (
                    <td key={m} className="text-right">
                      {n(`temporada.${f}.${i}`, `${f} ${m}`, { min: 0, max: 10 }, { clase: `${chico} w-14` })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Artículos del plan de importaciones"
        descripcion='Venta por sucursal: unidades por sucursal al mes (sin estacionalidad). Kit por apertura: unidades que lleva cada sucursal nueva. "En camino manual" es para compras sin OC en la plataforma (quítalo cuando la registres).'
      >
        {p.editable ? (
          <div className="mb-3 flex flex-wrap gap-3">
            {(['venta', 'kit'] as const).map((campo) => (
              <button
                key={campo}
                type="button"
                className="text-sm font-semibold underline"
                onClick={() => d.setB(usarPlataforma(b, p.ctx.meta, campo).imp)}
              >
                Usar {campo === 'venta' ? 'la venta' : 'el kit'} de la plataforma en todos
              </button>
            ))}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Familia</th>
                <th>Proveedor</th>
                <th>Unidad</th>
                <th className="text-right">Venta por sucursal al mes</th>
                <th className="text-right">Kit por apertura</th>
                <th className="text-right">Empaque</th>
                <th className="text-right">Mínimo del proveedor</th>
                <th className="text-right">Costo</th>
                <th className="text-right">CBM por unidad</th>
                <th>En camino manual</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.orden.map((sku: string) => {
                const it = b.items[sku];
                if (!it) return null;
                const mt = p.ctx.meta[sku],
                  pd = mt?.cat,
                  pv = b.prov.find((x: X) => x.clave.toLowerCase() === String(it.prov).toLowerCase());
                const P = `items.${sku}.`;
                return (
                  <tr key={sku} className={it.activo === false ? 'opacity-55' : ''}>
                    <td className="min-w-56">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Incluir ${sku}`}
                          checked={it.activo !== false}
                          disabled={no}
                          onChange={(e) => d.poner(P + 'activo', e.target.checked)}
                        />
                        <span>
                          <b>{it.nombre}</b>
                          <span className="block font-mono text-[10px] text-muted-foreground">{sku}</span>
                          <span className="block text-[10px]">
                            {!pd ? (
                              <span className="text-bad">No está en el catálogo</span>
                            ) : (
                              [
                                pd.estatus && pd.estatus !== 'Compra Recurrente' ? pd.estatus : '',
                                pd.origen && pd.origen !== 'IMPORTADO'
                                  ? `Zoho: ${pd.origen === 'LOCAL' ? 'local' : pd.origen.toLowerCase()}`
                                  : '',
                                pd.lt && pv && Math.abs(pd.lt - (pv.lead + pv.cierres)) > 15
                                  ? `Lead time en Zoho: ${pd.lt} d`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            )}
                          </span>
                        </span>
                      </label>
                    </td>
                    <td>
                      <Sel
                        etiqueta={`Familia ${sku}`}
                        valor={it.familia}
                        opciones={famOpts}
                        deshabilitado={no}
                        clase={chico + ' w-32 text-left'}
                        alCambiar={(v) => d.poner(P + 'familia', v)}
                      />
                    </td>
                    <td>
                      <Sel
                        etiqueta={`Proveedor ${sku}`}
                        valor={it.prov}
                        opciones={pv ? provOpts : [...provOpts, [it.prov, `${it.prov} (no existe)`]]}
                        deshabilitado={no}
                        clase={chico + ' w-36 text-left'}
                        alCambiar={(v) => d.poner(P + 'prov', v)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Unidad ${sku}`}
                        className={chico + ' w-16 text-left'}
                        value={it.unidad}
                        disabled={no}
                        onChange={(e) => d.poner(P + 'unidad', e.target.value)}
                      />
                    </td>
                    <td className="text-right">
                      {n(P + 'venta', `Venta ${sku}`, { min: 0, max: 10000 })}
                      {mt ? cmp(it.venta, mt.vPlat, 'venta', sku) : null}
                    </td>
                    <td className="text-right">
                      {n(P + 'kit', `Kit ${sku}`, { min: 0, max: 10000 })}
                      {mt ? cmp(it.kit, mt.kPlat, 'kit', sku) : null}
                    </td>
                    <td className="text-right">
                      {n(P + 'empaque', `Empaque ${sku}`, { min: 1, max: 1e6 })}
                      {pd && pd.multiplo > 1 && pd.multiplo !== it.empaque ? (
                        <span className="block text-[10px] text-muted-foreground">
                          Catálogo: {pd.multiplo}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">{n(P + 'minimo', `Mínimo ${sku}`, { min: 0, max: 1e7 })}</td>
                    <td className="text-right">
                      {n(P + 'costo', `Costo ${sku}`, { min: 0, max: 1e7 })}
                      {pd && pd.costo > 0 ? (
                        <span className="block text-[10px] text-muted-foreground">
                          Catálogo: {pd.costo} (se usa)
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">{n(P + 'cbm', `CBM ${sku}`, { min: 0, max: 100 })}</td>
                    <td className="whitespace-nowrap">
                      {n(
                        P + 'camino_qty',
                        `En camino ${sku}`,
                        { min: 0, max: 1e7 },
                        { clase: chico + ' w-16' },
                      )}{' '}
                      <input
                        type="date"
                        aria-label={`Fecha en camino ${sku}`}
                        className="h-8 rounded-md border border-line bg-surface-2 px-1 text-xs"
                        value={it.camino_fecha || ''}
                        disabled={no}
                        onChange={(e) =>
                          d.poner(
                            P + 'camino_fecha',
                            /^20\d\d-\d\d-\d\d$/.test(e.target.value) ? e.target.value : '',
                          )
                        }
                      />
                      {mt && mt.ocN ? (
                        <span className="block text-[10px] text-muted-foreground">
                          En OCs: {mt.ocQ.toLocaleString('es-MX')} ({mt.ocN}{' '}
                          {mt.ocN === 1 ? 'línea' : 'líneas'})
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {p.editable ? (
                        <button
                          type="button"
                          className="text-xs font-semibold underline"
                          onClick={() => {
                            if (
                              !confirm(
                                `¿Quitar ${sku} del plan de importaciones? Se guarda hasta que pulses Guardar cambios.`,
                              )
                            )
                              return;
                            const items = { ...b.items };
                            delete items[sku];
                            d.setB({ ...b, items, orden: b.orden.filter((k: string) => k !== sku) });
                          }}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {p.ctx.candidatos.filter((x) => !b.items[x.sku]).length ? (
          <div className="mt-5">
            <h3 className="text-sm font-bold">Importados del catálogo que no están en el plan</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Zoho los marca como importados (o con lead time mayor a {p.ctx.entregaMax} días). Agrégalos y
              revisa su proveedor, familia y CBM.
            </p>
            <div className="overflow-x-auto">
              <table className="tabla text-xs">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Artículo</th>
                    <th>Estatus</th>
                    <th>Proveedor preferido</th>
                    <th className="text-right">Inventario</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.ctx.candidatos
                    .filter((x) => !b.items[x.sku])
                    .map((x) => (
                      <tr key={x.sku}>
                        <td className="font-mono">{x.sku}</td>
                        <td>{x.nombre}</td>
                        <td>{x.estatus}</td>
                        <td>{x.proveedor || '—'}</td>
                        <td className="text-right tabular-nums">{x.inventario.toLocaleString('es-MX')}</td>
                        <td>
                          {p.editable ? (
                            <button
                              type="button"
                              className="font-semibold underline"
                              onClick={() =>
                                d.setB({
                                  ...b,
                                  items: { ...b.items, [x.sku]: x.item },
                                  orden: [...b.orden, x.sku],
                                })
                              }
                            >
                              Agregar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Tarjeta>
    </div>
  );
}

/** Parámetros de Café (_cafeVistaParams): escenarios, aperturas y cierres del año, ajustes generales y presentaciones. */
export function ParametrosCafe(p: { cafe: X; version: number; editable: boolean; ctx: ContextoParamsCafe }) {
  const d = useBorrador('cafe', p.cafe, p.version);
  const b = d.b,
    no = !p.editable,
    auto = b.q4_modo === 'auto';
  const n = (
    ruta: string,
    et: string,
    r: { min: number; max: number; entero?: boolean; nulo?: boolean },
    o: { ph?: string; clase?: string } = {},
  ) => (
    <Num
      etiqueta={et}
      valor={d.val(ruta) ?? null}
      {...r}
      ph={o.ph}
      clase={o.clase}
      deshabilitado={no}
      alCambiar={(v) => d.poner(ruta, v)}
    />
  );
  const suma = CAFE_PROD.reduce((s, x) => s + Number(b.prod[x.id].mezcla || 0), 0);
  return (
    <div className="space-y-5">
      <Barra d={d} editable={p.editable} />
      <Tarjeta
        titulo="Escenarios"
        descripcion="Crecimiento: cuánto crece al año la compra por posicionamiento (0.10 = 10%). Sucursal madura: kg al mes con 7 meses o más. Mes de apertura: kg que compra una sucursal el mes que abre (incluye su inventario inicial)."
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Campo
            etiqueta="Año del cálculo"
            ayuda="Las cohortes de octubre a diciembre son las del año anterior"
          >
            {n('anio', 'Año del cálculo', { min: 2026, max: 2040, entero: true }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Arranque del año">
            <Sel
              etiqueta="Arranque del año"
              valor={b.q4_modo}
              opciones={[
                ['auto', 'Automático (plataforma)'],
                ['manual', 'Capturar a mano por escenario'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('q4_modo', v)}
            />
          </Campo>
          <Campo etiqueta="Escenario de referencia">
            <Sel
              etiqueta="Escenario de referencia"
              valor={b.escenario}
              opciones={CAFE_ESCS.map((k) => [k, k])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('escenario', v)}
            />
          </Campo>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla max-w-4xl">
            <thead>
              <tr>
                <th>Escenario</th>
                <th className="text-right">Crecimiento anual</th>
                <th className="text-right">Sucursal madura (kg/mes)</th>
                <th className="text-right">Mes de apertura (kg)</th>
                <th className="text-right">Sucursales al 1 de enero</th>
                <th className="text-right">Aperturas al mes (oct-dic)</th>
              </tr>
            </thead>
            <tbody>
              {CAFE_ESCS.map((k) => {
                const P = `escenarios.${k}.`;
                return (
                  <tr key={k}>
                    <td className="font-semibold">{k}</td>
                    <td className="text-right">{n(P + 'crec', `Crecimiento ${k}`, { min: -0.5, max: 1 })}</td>
                    <td className="text-right">{n(P + 'madura', `Madura ${k}`, { min: 0, max: 1000 })}</td>
                    <td className="text-right">
                      {n(P + 'apertura', `Apertura ${k}`, { min: 0, max: 1000 })}
                    </td>
                    <td className="text-right">
                      {auto ? (
                        <span className="text-muted-foreground">{p.ctx.ini} (plataforma)</span>
                      ) : (
                        n(P + 'ini', `Sucursales ${k}`, { min: 0, max: 5000, entero: true })
                      )}
                    </td>
                    <td className="text-right">
                      {auto ? (
                        <span className="text-muted-foreground">{p.ctx.a0} (plataforma)</span>
                      ) : (
                        n(P + 'a0', `Aperturas oct-dic ${k}`, { min: 0, max: 200, entero: true })
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Aperturas y cierres del año"
        descripcion={`Aperturas de cada mes por escenario. "Pipeline registrado" es lo que ya hay en la plataforma con fecha de ese mes de ${p.ctx.anio}.`}
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-3xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                {CAFE_ESCS.map((k) => (
                  <th key={k} className="text-right">
                    {k}
                  </th>
                ))}
                <th className="text-right">Cierres</th>
              </tr>
            </thead>
            <tbody>
              {MESES_ABR.map((m, i) => (
                <tr key={m}>
                  <td className="font-semibold">
                    {m} {String(b.anio).slice(2)}
                  </td>
                  <td className="text-right tabular-nums">{p.ctx.pipeAnio[i]}</td>
                  {CAFE_ESCS.map((k) => (
                    <td key={k} className="text-right">
                      {n(`escenarios.${k}.aper.${i}`, `Aperturas ${k} ${m}`, {
                        min: 0,
                        max: 200,
                        entero: true,
                      })}
                    </td>
                  ))}
                  <td className="text-right">
                    {n(`cierres.${i}`, `Cierres ${m}`, { min: 0, max: 200, entero: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Ajustes generales">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Ajuste general" ayuda="Sube o baja todos los kilos del año (-0.05 = 5% menos)">
            {n('ajuste', 'Ajuste general', { min: -0.9, max: 2 }, { clase: claseCampo })}
          </Campo>
          <Campo
            etiqueta="Volumen a comprometer"
            ayuda="Parte del pronóstico que se compromete con el proveedor"
          >
            {n('comprometer', 'Volumen a comprometer', { min: 0, max: 1 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Compra estimada del año anterior (kg)">
            {n(
              'compra_ant',
              'Compra del año anterior',
              { min: 0, max: 1e8, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <p className="mb-2 mt-4 text-sm font-bold">Curva de compra por sucursal (kg al mes), meses 2 a 6</p>
        <div className="flex flex-wrap gap-2">
          {b.curva.map((_: number, j: number) => (
            <label key={j} className="grid gap-1 text-xs text-ink-2">
              Mes {j + 2}
              {n(`curva.${j}`, `Curva mes ${j + 2}`, { min: 0, max: 1000 })}
            </label>
          ))}
        </div>
        <p className="mb-2 mt-4 text-sm font-bold">Estacionalidad (índice por mes calendario)</p>
        <div className="flex flex-wrap gap-2">
          {MESES_ABR.map((m, j) => (
            <label key={m} className="grid gap-1 text-xs text-ink-2">
              {m}
              {n(
                `estacionalidad.${j}`,
                `Estacionalidad ${m}`,
                { min: 0, max: 10 },
                { clase: `${chico} w-14` },
              )}
            </label>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Mezcla y precios por presentación"
        descripcion="Mezcla: parte de los kilos en cada presentación (debe sumar 1). Precio nuevo vacío = usa el vigente."
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-4xl">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Mezcla</th>
                <th className="text-right">Café vigente $/kg</th>
                <th className="text-right">Empaque vigente</th>
                <th className="text-right">Precio de venta</th>
                <th className="text-right">Café nuevo $/kg</th>
                <th className="text-right">Empaque nuevo</th>
              </tr>
            </thead>
            <tbody>
              {CAFE_PROD.map((x) => {
                const P = `prod.${x.id}.`;
                return (
                  <tr key={x.id}>
                    <td className="font-semibold">{x.nombre}</td>
                    <td className="text-right">
                      {n(P + 'mezcla', `Mezcla ${x.nombre}`, { min: 0, max: 1 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'precio', `Precio ${x.nombre}`, { min: 0, max: 1e5 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'empaque', `Empaque ${x.nombre}`, { min: 0, max: 1e4 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'venta', `Venta ${x.nombre}`, { min: 0, max: 1e5 })}
                    </td>
                    <td className="text-right">
                      {n(
                        P + 'nuevo_precio',
                        `Precio nuevo ${x.nombre}`,
                        { min: 0, max: 1e5, nulo: true },
                        { ph: 'vigente' },
                      )}
                    </td>
                    <td className="text-right">
                      {n(
                        P + 'nuevo_empaque',
                        `Empaque nuevo ${x.nombre}`,
                        { min: 0, max: 1e4, nulo: true },
                        { ph: 'vigente' },
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="font-bold">Suma de la mezcla</td>
                <td
                  className={`text-right font-bold tabular-nums ${Math.abs(suma - 1) > 0.0005 ? 'text-bad' : ''}`}
                >
                  {Math.round(suma * 1000) / 1000}
                </td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-params-acciones.test.ts tests/portal/com-params-editores.test.tsx tests/portal/com-indicadores.test.tsx`
Expected: PASS (9 + 5 + las de Indicadores, sin cambios). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/paramsImpCafe.ts lib/comercializadora/paramsContexto.ts components/comercializadora/parametros-imp-cafe.tsx "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-params-acciones.test.ts tests/portal/com-params-editores.test.tsx
git commit -m "feat(comercializadora): parámetros de Importaciones y Café con versión e historial"
```

---

### Task 8: Pantalla Importaciones

**Files:**
- Create: `lib/comercializadora/importaciones.ts`
- Create: `components/comercializadora/vistas-plan.tsx`, `components/comercializadora/selector-escenario.tsx`
- Create: `components/comercializadora/importaciones.tsx`
- Create: `app/(comercializadora)/comercializadora/importaciones/page.tsx`
- Modify: `components/portal/navegacion.tsx`
- Test: `tests/portal/com-importaciones-pantalla.test.tsx`

**Interfaces:**
- Consumes: `importacionesMotor`, `motorPlan` y `limpiarMotor` (`motor.ts`); `impAhoraDatos`, `impDif` y `CorridaImp` (Tarea 3); `enlaceOc` y `ocImportaciones` (Tarea 5); `DescargarExcel` y `libroImportaciones` (Tarea 6); `ParametrosImp`, `contextoParamsImp` e `IMP_ESCS` (Tarea 7); `ActualizarMotor` (3d); `Pill`, `Encabezado` y `Estado` (piezas); `masDias` (`fechas.ts`).
- Produces:
  - `lib/comercializadora/importaciones.ts`:
    - formatos `nf(x, d?)` = `_planN`, `nu` = `_impU`, `dinero` = `_planMoney`, `pct` = `_impPct`, `fImp` = `_impF` y `mesImp` = `_impMes`;
    - vistas: `VISTAS_IMP_SIMPLE`, `VISTAS_IMP`, `vistaImp(v, det)` y `escImp(v): string | null`;
    - `tonoEstadoImp(e): Tono`, `kpisImp(c)`, `avisosImp(c, R): string[]` y `porQueImp(q, c): string`;
    - `lineaImp(q, hoy, escala)`, `type Cuando = '' | 'esta' | 'prox'` y `cuandoDe(v)`;
    - `ahoraImp(c, { cuando, soloAcc })`, `detalleImp(c, { q, prov, soloAcc })` y `textoContenedores(S)`.
  - `vistas-plan.tsx` (server-safe):
    - `hrefPlan(ruta, actual, cambios)` y `NavVistas({ ruta, vistas, activa, params })`;
    - `AvisosPlan({ avisos, plegado? })`, `CifraPlan({ etiqueta, valor, nota?, tono?, ayuda? })` y `SeccionPlan({ titulo, ayuda?, children })`;
    - `interface GrupoQuePedir` y `TablaQuePedir({ grupos, simple, columnaVisual, vacio })`.
  - `selector-escenario.tsx` (client): `SelectorEscenario({ opciones: [valor, etiqueta][], valor })`.
  - `importaciones.tsx`: `KpisImp`, `QuePedirImp`, `DetalleImp`, `GraficaCbm`, `ContenedoresImp`, `ProyeccionImp`, `PuenteImp` y `ResumenImp`.
  - Página `/comercializadora/importaciones?vista=&esc=&det=&cuando=&todos=&q=&prov=&solo=`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-importaciones-pantalla.test.tsx`:

```tsx
// Plan 3e: pantalla Importaciones (vistas, filtros por la URL, Crear OC, avisos y el puente caído).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, nivel: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/importaciones',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  actualizarMotor: vi.fn(),
  guardarParamsImpCafe: vi.fn(),
}));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: m.nivel }, db: {} }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import ImportacionesPagina from '../../app/(comercializadora)/comercializadora/importaciones/page';
import {
  ContenedoresImp,
  DetalleImp,
  ProyeccionImp,
  QuePedirImp,
} from '../../components/comercializadora/importaciones';
import {
  ahoraImp,
  avisosImp,
  detalleImp,
  escImp,
  fImp,
  lineaImp,
  mesImp,
  porQueImp,
  tonoEstadoImp,
  vistaImp,
} from '../../lib/comercializadora/importaciones';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const R = datosImp({ avisos: ['aperturas'] });
const c = impCorrer(R, normalizarCfgMotor({}));
const listo = { ok: true, R, cfg: normalizarCfgMotor({}), version: 3 };
const pagina = async (sp: Record<string, string>) =>
  render(await ImportacionesPagina({ searchParams: Promise.resolve(sp) }));

describe('lo que calcula la pantalla', () => {
  it('vistas, escenario de la URL, fechas y tono del estado', () => {
    expect([vistaImp('puente', false), vistaImp('puente', true), vistaImp(undefined, true)]).toEqual([
      'ahora',
      'puente',
      'ahora',
    ]);
    expect([escImp('Manual'), escImp('Raro'), escImp(undefined)]).toEqual(['Manual', null, null]);
    expect([fImp('2027-02-21'), mesImp('2027-02-21'), fImp(null), fImp('x')]).toEqual([
      '21 feb 27',
      'feb 27',
      '—',
      'x',
    ]);
    expect([
      tonoEstadoImp('URGENTE: pedir'),
      tonoEstadoImp('Pedir este mes'),
      tonoEstadoImp('Programado'),
      tonoEstadoImp(''),
    ]).toEqual(['pierde', 'bajo', 'ok', 'neutro']);
  });

  it('avisos: aperturas sin leer, vencidas, sin fecha, fuera del catálogo, estatus de Zoho, OC vieja y sin arribo', () => {
    const av = avisosImp(c, R).join('\n');
    expect(av).toContain('No se pudieron leer las aperturas');
    expect(av).toContain('1 apertura en proceso con fecha ya vencida');
    expect(av).toContain('hace más de 45 días no se cuenta');
    expect(av).toContain('1 apertura en proceso sin fecha');
    expect(av).toMatch(/artículos del plan no están en el catálogo \(INS-DES-002/);
    expect(av).toContain('figuran en Zoho como Inactivo');
    expect(av).toContain('con OC cuya fecha de arribo ya pasó');
    expect(av).toContain('la OC no trae fecha de arribo');
    expect(av).not.toContain('Q1');
  });

  it('Qué pedir: esta semana / la próxima, solo con acción y la escala común de la línea de tiempo', () => {
    const todo = ahoraImp(c, { cuando: '', soloAcc: false });
    const esta = ahoraImp(c, { cuando: 'esta', soloAcc: true });
    expect(todo.nE).toBe(16);
    expect(esta.grupos.every((g) => g.filas.every((f) => f.tipo === 'esta'))).toBe(true);
    expect(todo.grupos.flatMap((g) => g.filas).length).toBe(19);
    const f = todo.grupos[0].filas[0];
    expect(f.linea === null || f.linea.ok + f.linea.gap + f.linea.resp <= 100.1).toBe(true);
    expect(lineaImp({ sinQuiebre: true }, '2026-11-13', 90)).toBeNull();
  });

  it('por qué, en texto: lead time, cobertura, lo que falta y la fecha límite', () => {
    const p = c.S.productos.find((x: { quiebre: { cantidadPedir: number } }) => x.quiebre.cantidadPedir > 0);
    const t = porQueImp(p.quiebre, c);
    expect(t).toMatch(/El proveedor tarda \d+ días/);
    expect(t).toContain('Cubrir 3 meses desde esa fecha (más 1 de respaldo)');
    expect(t).not.toMatch(/<b>/);
  });

  it('detalle por artículo: texto, proveedor y solo con acción', () => {
    expect(detalleImp(c, { q: 'termo', prov: '', soloAcc: false }).flatMap((g) => g.productos).length).toBe(
      4,
    );
    expect(detalleImp(c, { q: '', prov: 'LQC Printing', soloAcc: false }).map((g) => g.nombre)).toEqual([
      'LQC Printing (bolsas)',
    ]);
    expect(detalleImp(c, { q: 'zzz', prov: '', soloAcc: false })).toEqual([]);
  });
});

describe('vistas', () => {
  it('Qué pedir con permiso de edición: bandas por proveedor y Crear OC hacia Órdenes prellenada', () => {
    render(<QuePedirImp c={c} cuando="" soloAcc simple={false} editable params={{ vista: 'ahora' }} />);
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.length).toBe(4);
    expect(crear[0].getAttribute('href')).toMatch(
      /^\/comercializadora\/ordenes\?nueva=importaciones&proveedor=/,
    );
    expect(screen.getAllByText(/ESTA SEMANA · \d+ art\./).length).toBe(4);
    expect(screen.getByRole('link', { name: 'Esta semana (16)' }).getAttribute('href')).toContain(
      'cuando=esta',
    );
  });

  it('solo lectura y vista simple: sin Crear OC ni columna "Por qué"', () => {
    render(<QuePedirImp c={c} cuando="" soloAcc simple editable={false} params={{}} />);
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Por qué' })).toBeNull();
  });

  it('Contenedores y Proyección (decisión 9: nombra el escenario que se ve)', () => {
    const p = impCorrer(R, normalizarCfgMotor({}), 'Pesimista');
    const { unmount } = render(<ContenedoresImp c={p} />);
    expect(screen.getByRole('heading', { name: 'Plan de contenedores de Green Packaging' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: /^C\d+$/ }).length).toBe(11);
    unmount();
    render(<ProyeccionImp c={p} />);
    expect(screen.getByText(/con el escenario Pesimista/)).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBe(16);
  });

  it('sin artículos del proveedor de contenedores (CBM en cero): lo dice en lugar de una tabla vacía', () => {
    const solo = impCorrer(
      R,
      normalizarCfgMotor({
        imp: {
          items: {
            'MER-TER-001': { nombre: 'Termo', familia: 'Termos', prov: 'Easy Drinkware', venta: 0.7, cbm: 0 },
          },
        },
      }),
    );
    render(<ContenedoresImp c={solo} />);
    expect(
      screen.getByText(/No hay artículos asignados al proveedor de contenedores \(Green Packaging\)/),
    ).toBeTruthy();
  });

  it('Detalle: el filtro es un formulario GET que conserva vista y escenario', () => {
    const { container } = render(
      <DetalleImp
        c={c}
        q="vaso"
        prov=""
        soloAcc={false}
        params={{ vista: 'pedir', esc: 'Base', det: '1' }}
      />,
    );
    const form = container.querySelector('form')!;
    expect(form.getAttribute('action')).toBe('/comercializadora/importaciones');
    expect([...form.querySelectorAll('input[type=hidden]')].map((i) => (i as HTMLInputElement).name)).toEqual(
      ['vista', 'esc', 'det'],
    );
    expect(within(container).getAllByText(/Vaso/).length).toBeGreaterThan(0);
  });
});

describe('página', () => {
  beforeEach(() => {
    limpiarMotor();
    m.nivel = 'edicion';
  });

  it('sin puente: muestra el error y nada más', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los pedidos del sitio viejo.' };
    await pagina({});
    expect(screen.getByRole('alert').textContent).toBe('No se pudieron leer los pedidos del sitio viejo.');
    expect(screen.queryByRole('navigation', { name: 'Vistas' })).toBeNull();
  });

  it('Qué pedir por defecto, con el aviso de lecturas y las vistas de la vista simple', async () => {
    m.motor = listo;
    await pagina({});
    expect(screen.getByRole('status').textContent).toContain('No se pudieron leer: aperturas');
    const nav = screen.getByRole('navigation', { name: 'Vistas' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Qué pedir', 'Contenedores', 'Proyección mensual', 'Parámetros', 'Ver todo']);
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
  });

  it('una vista de detalle trae el selector de escenario, las cifras y los avisos; parámetros abre el editor', async () => {
    m.motor = listo;
    const { unmount } = await pagina({ vista: 'puente', det: '1', esc: 'Optimista' });
    expect((screen.getByLabelText('Escenario') as HTMLSelectElement).value).toBe('Optimista');
    expect(screen.getByText('Pedir en los próximos 30 días')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compra puente' })).toBeTruthy();
    unmount();
    await pagina({ vista: 'params' });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-importaciones-pantalla.test.tsx`
Expected: FAIL. `Failed to resolve import "../../app/(comercializadora)/comercializadora/importaciones/page"`.

- [ ] **Step 3: La pantalla**

Crear `lib/comercializadora/importaciones.ts`. Son las cuentas de las vistas, en texto en lugar de HTML: `_IMP_VISTAS_S`/`_IMP_VISTAS` 37808, `_impEstadoHtml` 37818, `_impKpisHtml` 37835, `_impAvisosHtml` 37848, el texto de `_impVistaResumen` 37876, `_impVistaPedir` 37923, `_impPorQue` 38185, `_impLineaHtml` 38202 y `_impVistaAhora` 38217:

```ts
import type { Tono } from './inicio';
import { impAhoraDatos, impDif, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import { planEngDia } from '../../supabase/functions/_shared/planEngine.ts';
import { IMP_ESCS } from '../../supabase/functions/_shared/impCafeCfg.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';

export type { CorridaImp };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
const NF = [0, 1, 2, 3, 4].map(
  (d) => new Intl.NumberFormat('es-MX', { minimumFractionDigits: 0, maximumFractionDigits: d }),
);
/** _planN: número con hasta `d` decimales. */
export const nf = (x: number, d = 0) => NF[d].format(Number(x));
/** _impU: '—' si no es un número. */
export const nu = (x: number | null | undefined, d = 0) => (x == null || !isFinite(x) ? '—' : nf(x, d));
/** _planMoney: pesos sin centavos. */
export const dinero = (x: number) => {
  const v = Number(x || 0);
  return (v < 0 ? '-' : '') + '$' + NF[0].format(Math.abs(v));
};
/** _impPct. */
export const pct = (x: number | null | undefined, d = 0) =>
  x == null || !isFinite(x) ? '—' : Math.round(x * 10 ** (2 + d)) / 10 ** d + '%';
/** _impF: '13 nov 26'. */
export function fImp(iso: string | null | undefined): string {
  const p = String(iso || '').split('-');
  return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12)
    ? iso
      ? String(iso)
      : '—'
    : `${+p[2]} ${MESES[+p[1] - 1]} ${p[0].slice(2)}`;
}
/** _impMes: 'nov 26'. */
export function mesImp(iso: string | null | undefined): string {
  const p = String(iso || '').split('-');
  return p.length < 3 || !(+p[1] >= 1 && +p[1] <= 12) ? '' : `${MESES[+p[1] - 1]} ${p[0].slice(2)}`;
}

/** Vistas de la pantalla (_IMP_VISTAS_S en la vista simple; _IMP_VISTAS con "Ver todo"). */
export const VISTAS_IMP_SIMPLE: [string, string][] = [
  ['ahora', 'Qué pedir'],
  ['embarques', 'Contenedores'],
  ['proyeccion', 'Proyección mensual'],
  ['params', 'Parámetros'],
];
export const VISTAS_IMP: [string, string][] = [
  ['ahora', 'Qué pedir'],
  ['pedir', 'Detalle por artículo'],
  ['embarques', 'Contenedores'],
  ['proyeccion', 'Proyección mensual'],
  ['puente', 'Compra puente'],
  ['resumen', 'Resumen'],
  ['params', 'Parámetros'],
];
/** ?vista= válida (con "Ver todo" se aceptan las siete); si no, Qué pedir. */
export const vistaImp = (v: string | undefined, det: boolean) =>
  (det ? VISTAS_IMP : VISTAS_IMP_SIMPLE).some((x) => x[0] === v) ? (v as string) : 'ahora';
/** ?esc= válido (solo cambia lo que se ve); si no, null = el escenario guardado. */
export const escImp = (v: string | undefined) => (IMP_ESCS.includes(v ?? '') ? (v as string) : null);

/** _impEstadoHtml: color del estado del motor. */
export function tonoEstadoImp(e: string): Tono {
  if (/^URGENTE/.test(e)) return 'pierde';
  if (/^Pedir este mes/.test(e)) return 'bajo';
  if (/^Programado/.test(e)) return 'ok';
  return 'neutro';
}

/** _impKpisHtml. */
export function kpisImp(c: CorridaImp) {
  const S = c.S,
    k = S.kpis,
    cont = S.plan.contenedores[0];
  let pq: X = null;
  S.productos.forEach((p: X) => {
    if (p.quiebre.seAcaba && (!pq || p.quiebre.seAcaba < pq.quiebre.seAcaba)) pq = p;
  });
  return {
    pedir30: { n: k.productosAPedir30d as number, inversion: k.inversion30d as number },
    tarde: S.productos.filter((p: X) => /^URGENTE/.test(p.quiebre.estado)).length as number,
    riesgo: k.productosRiesgo as number,
    quiebre: pq ? { producto: pq.quiebre.producto as string, fecha: pq.quiebre.seAcaba as string } : null,
    contenedor:
      cont && cont.colocar && cont.cbm > 0
        ? { colocar: cont.colocar as string, llega: cont.llega as string, estado: String(cont.estado) }
        : null,
    proveedorContenedor: c.ent.P.constantes.proveedorContenedor as string,
    sucursales: {
      hoy: S.meses[0].sucursalesInicio as number,
      fin: S.meses[14].sucursalesCierre as number,
      mesFin: mesImp(S.meses[14].inicio),
    },
  };
}

const plural = (n: number, s: string, p = s + 's') => (n === 1 ? s : p);
/** _impAvisosHtml, en texto. `R` son los datos del plan (avisos de lectura). */
export function avisosImp(c: CorridaImp, R: Pick<DatosPlan, 'avisos'>): string[] {
  const av: string[] = [],
    S = c.S,
    m = c.ent.meta,
    cfg = c.cfg;
  if (R.avisos && R.avisos.indexOf('aperturas') >= 0)
    av.push(
      'No se pudieron leer las aperturas: el pipeline y las sucursales de hoy pueden estar incompletos.',
    );
  const pl = m.red.pl;
  if (m.red.sucHoy === 0 && cfg.imp.red.suc_hoy_modo === 'auto')
    av.push(
      'No hay sucursales activas visibles para tu usuario: el plan parte de 0 sucursales. Revisa tus permisos de Aperturas o captura las sucursales de hoy en Parámetros.',
    );
  if (pl.vencidas > 0)
    av.push(
      `${pl.vencidas} ${plural(pl.vencidas, 'apertura')} en proceso con fecha ya vencida (sigue sin abrir): se ${plural(pl.vencidas, 'cuenta', 'cuentan')} en el mes en curso.`,
    );
  if (pl.vencidasFuera > 0)
    av.push(
      `${pl.vencidasFuera} ${plural(pl.vencidasFuera, 'apertura')} ${plural(pl.vencidasFuera, 'vencida')} hace más de ${cfg.aper.vencida_max} días no se ${plural(pl.vencidasFuera, 'cuenta', 'cuentan')}: revisa su fecha en Aperturas.`,
    );
  if (pl.sinFecha > 0)
    av.push(
      `${pl.sinFecha} ${plural(pl.sinFecha, 'apertura')} en proceso sin fecha: no se ${plural(pl.sinFecha, 'cuenta', 'cuentan')} en ningún mes.`,
    );
  const items = Object.keys(m.items);
  const lista = (xs: string[]) => xs.slice(0, 4).join(', ') + (xs.length > 4 ? '…' : '');
  const sinCat = items.filter((k) => m.items[k].activo && !m.items[k].cat);
  if (sinCat.length)
    av.push(
      `${sinCat.length} ${plural(sinCat.length, 'artículo')} del plan no ${plural(sinCat.length, 'está', 'están')} en el catálogo (${lista(sinCat)}): se usa inventario 0.`,
    );
  const pf = items.filter(
    (k) =>
      m.items[k].activo &&
      m.items[k].aviso.some((a: string) => a.indexOf('proveedor') >= 0 || a.indexOf('familia') >= 0),
  );
  if (pf.length)
    av.push(
      `${pf.length} ${plural(pf.length, 'artículo')} con proveedor o familia inexistente (ver Parámetros).`,
    );
  const sinVenta = c.ent.items.filter((it: X) => it.ventaSucursalMes <= 0 && it.kitApertura <= 0);
  if (sinVenta.length)
    av.push(
      `${sinVenta.length} ${plural(sinVenta.length, 'artículo')} sin venta por sucursal ni kit por apertura: no tienen demanda en el cálculo (${lista(sinVenta.map((x: X) => x.sku))}).`,
    );
  const inact = items.filter((k) => {
    const it = m.items[k];
    return (
      it.activo &&
      it.cat &&
      ['Inactivo', 'Hasta Agotar Existencias', 'Compra Unica', 'Prueba'].includes(it.cat.estatus)
    );
  });
  if (inact.length)
    av.push(
      `${inact.length} ${plural(inact.length, 'artículo')} del plan ${plural(inact.length, 'figura', 'figuran')} en Zoho como Inactivo, Hasta agotar, Compra única o Prueba (${lista(inact)}): se siguen planeando; desmárcalos en Parámetros si ya no se compran.`,
    );
  const camV = Object.keys(cfg.imp.items).filter((k) => {
    const it = cfg.imp.items[k];
    return it.activo && it.camino_qty > 0 && it.camino_fecha && it.camino_fecha < c.ent.P.fechaCorte;
  });
  if (camV.length)
    av.push(
      `"En camino manual" con fecha ya vencida en ${camV.join(', ')}: quítalo o registra la OC para no contarlo como llegado este mes.`,
    );
  const vieja = items.filter((k) => m.items[k].ocVieja);
  if (vieja.length)
    av.push(
      `${vieja.length} ${plural(vieja.length, 'artículo')} con OC cuya fecha de arribo ya pasó y sigue abierta: confirma si ya llegó y regístrala en Órdenes de compra para no contarla dos veces.`,
    );
  const est = items.filter((k) => m.items[k].ocEst);
  if (est.length)
    av.push(
      `En ${est.length} ${plural(est.length, 'artículo')} la OC no trae fecha de arribo: se estimó con la fecha de la OC más el lead time del proveedor.`,
    );
  if (S && S.advertencias)
    S.advertencias.forEach((a: string) => {
      if (/^Aperturas consideradas con valores fijos|^Q1:/i.test(a)) return;
      av.push(a);
    });
  return av;
}

/** _impPorQue, en texto: cuánto se vende, cuánto cubre el pedido, cuánto habrá y cuánto falta. */
export function porQueImp(q: X, c: CorridaImp): string {
  const P = c.cfg.imp.politica,
    fin = mesImp(c.S.meses[14].inicio),
    mes = q.ventaMes3;
  const vta =
    isFinite(mes) && mes > 0
      ? `Vendes ${nu(mes, mes < 10 ? 1 : 0)} ${q.unidad} al mes (${nu((mes * 7) / 30, 1)} a la semana, ${nu(mes / 30, 1)} al día)`
      : 'Sin ventas registradas';
  if (q.sinQuiebre)
    return `${vta}. Con lo que tienes y lo que viene alcanza más allá de ${fin}: aún no toca pedir.`;
  if (q.cantidadPedir > 0 && q.colocarPedido) {
    const tarde = q.pedirATardar && q.pedirATardar < c.ent.P.fechaCorte;
    let t =
      `${vta}. El proveedor tarda ${q.leadTime} días: un pedido del ${fImp(q.colocarPedido)} llega el ${fImp(q.llegaCedis)}. ` +
      `Cubrir ${P.meses_cobertura} meses desde esa fecha (más ${P.meses_respaldo} de respaldo) pide ${nu(q.ventaCobertura + q.respaldo)}; ` +
      `para entonces tendrás ${nu(q.stockAlLlegar)}` +
      (q.llegadasCobertura > 0 ? ` y llegarán ${nu(q.llegadasCobertura)}` : '') +
      `: faltan ${nu(q.necesidad)}` +
      (Math.abs(q.cantidadPedir - q.necesidad) > 0.5
        ? `, que con los mínimos y múltiplos del proveedor son ${nu(q.cantidadPedir)}`
        : '') +
      '.';
    t += tarde
      ? ` Se acaba el ${fImp(q.seAcaba)} y ya va tarde` +
        (q.diasSinProducto > 0 ? `: quedarías ${nf(q.diasSinProducto)} días sin producto` : '') +
        '.'
      : ` Hay que pedirlo a más tardar el ${fImp(q.pedirATardar)}.`;
    if (q.yaComprado > 0) t += ` Ya hay ${nu(q.yaComprado)} en camino.`;
    return t;
  }
  return `${vta}. Alcanza hasta el ${fImp(q.seAcaba)}; aún no toca pedir.`;
}

/** _impLineaHtml: anchos (%) de la línea de tiempo con producto, sin producto y ya repuesto, y las marcas. */
export function lineaImp(q: X, hoy: string, escala: number) {
  if (q.sinQuiebre || !q.seAcaba) return null;
  const dA = Math.max(0, impDif(hoy, q.seAcaba) || 0),
    dL = q.llegaCedis ? impDif(hoy, q.llegaCedis) : null,
    dC = q.colocarPedido ? impDif(hoy, q.colocarPedido) : null;
  const pc = (x: number) => Math.max(0, Math.min(100, Math.round((x / escala) * 1000) / 10));
  const ok = pc(dA);
  let gap = 0,
    resp = 0;
  if (dL !== null) {
    if (dL > dA) {
      gap = Math.max(0, pc(dL) - ok);
      resp = Math.max(0, 100 - ok - gap);
    } else resp = Math.max(0, 100 - ok);
  }
  return {
    ok,
    gap,
    resp,
    pedir: dC !== null && q.cantidadPedir > 0 ? pc(dC) : null,
    llega: dL !== null && q.cantidadPedir > 0 ? pc(dL) : null,
  };
}

export type Cuando = '' | 'esta' | 'prox';
/** ?cuando= válido. */
export const cuandoDe = (v: string | undefined): Cuando => (v === 'esta' || v === 'prox' ? v : '');

/** _impVistaAhora: conteos, montos y los grupos por proveedor con las filas visibles, en el orden del viejo. */
export function ahoraImp(c: CorridaImp, f: { cuando: Cuando; soloAcc: boolean }) {
  const D = impAhoraDatos(c),
    S = c.S,
    hoy = c.ent.P.fechaCorte;
  let nE = 0,
    nP = 0,
    mE = 0,
    mP = 0,
    espera = 0,
    ok = 0;
  D.orden.forEach((k) => {
    const gr = D.g[k];
    nE += gr.esta.length;
    nP += gr.prox.length;
    gr.esta.forEach((o: X) => (mE += o.q.inversion || 0));
    gr.prox.forEach((o: X) => (mP += o.q.inversion || 0));
    gr.rows.forEach((o: X) => {
      if (o.tipo) return;
      if (o.q.cantidadPedir > 0 && o.q.colocarPedido) espera++;
      else ok++;
    });
  });
  const urg = S.productos.filter((p: X) => /^URGENTE/.test(p.quiebre.estado)).length;
  const visible = (o: X) =>
    f.cuando === 'esta'
      ? o.tipo === 'esta'
      : f.cuando === 'prox'
        ? o.tipo === 'prox'
        : !f.soloAcc || o.tipo || /^URGENTE/.test(o.q.estado) || o.q.compraPuente > 0;
  // Escala común de las líneas de tiempo (así se pueden comparar entre artículos)
  let escala = 90;
  D.orden.forEach((k) =>
    D.g[k].rows.forEach((o: X) => {
      if (!visible(o)) return;
      const q = o.q;
      if (q.sinQuiebre || !q.seAcaba) return;
      const a = impDif(hoy, q.seAcaba) || 0,
        l = q.llegaCedis ? impDif(hoy, q.llegaCedis) || 0 : 0;
      escala = Math.max(escala, Math.max(a, l) + 20);
    }),
  );
  escala = Math.min(escala, 330);
  const grupos = D.orden
    .slice()
    .sort((a, b) => {
      const A = D.g[a],
        B = D.g[b];
      return (
        Number(B.esta.length > 0) - Number(A.esta.length > 0) ||
        Number(B.prox.length > 0) - Number(A.prox.length > 0) ||
        String(A.prov.nombre).localeCompare(String(B.prov.nombre))
      );
    })
    .map((k) => {
      const gr = D.g[k];
      const filas = gr.rows.filter(visible).sort((a: X, b: X) => {
        const x = a.q.colocarPedido || '9999',
          y = b.q.colocarPedido || '9999';
        return x < y ? -1 : x > y ? 1 : String(a.q.producto).localeCompare(String(b.q.producto));
      });
      const suma = (l: X[]) => l.reduce((s, o) => s + (o.q.inversion || 0), 0);
      return {
        clave: k,
        nombre: gr.prov.nombre as string,
        esta: gr.esta.length as number,
        prox: gr.prox.length as number,
        montoEsta: suma(gr.esta),
        montoProx: suma(gr.prox),
        filas: (filas as X[]).map((o: X) => {
          const q = o.q;
          const queda =
            q.cantidadPedir > 0
              ? Math.max(0, q.stockAlLlegar || 0) + Math.max(0, q.llegadasCobertura || 0) + q.cantidadPedir
              : null;
          return {
            sku: o.it.sku as string,
            tipo: o.tipo as 'esta' | 'prox' | null,
            q,
            borrador: (c.ent.meta.items[o.it.sku] || {}).ocBorr || 0,
            urgente: /^URGENTE/.test(q.estado),
            queda,
            mesesQueda:
              queda !== null && isFinite(q.ventaMes3) && q.ventaMes3 > 0 ? queda / q.ventaMes3 : null,
            nota: [q.nota, q.compraPuente > 0 ? `Compra puente: ${nf(q.compraPuente)} ${q.unidad}` : '']
              .filter(Boolean)
              .join(' · '),
            linea: lineaImp(q, hoy, escala),
          };
        }),
      };
    })
    .filter((g) => g.filas.length);
  return {
    nE,
    nP,
    mE,
    mP,
    urg,
    espera,
    ok,
    fin: mesImp(S.meses[14].inicio),
    grupos,
    hoy,
    limite7: planEngDia(hoy, 7),
  };
}

/** _impVistaPedir: productos por proveedor (en el orden del motor) con filtro de texto, proveedor y solo con acción. */
export function detalleImp(c: CorridaImp, f: { q: string; prov: string; soloAcc: boolean }) {
  const S = c.S,
    q = f.q.trim().toLowerCase();
  const provNombres: Record<string, string> = {};
  c.ent.P.proveedores.forEach((p: X) => (provNombres[p.nombre] = p.clave));
  const grupos: Record<string, X[]> = {},
    orden: string[] = [];
  S.productos.forEach((p: X) => {
    const qq = p.quiebre;
    if (f.prov && provNombres[qq.proveedorNombre] !== f.prov) return;
    if (f.soloAcc && !(qq.cantidadPedir > 0 || /^URGENTE/.test(qq.estado) || qq.compraPuente > 0)) return;
    if (q && String(qq.producto).toLowerCase().indexOf(q) < 0 && String(p.sku).toLowerCase().indexOf(q) < 0)
      return;
    if (!grupos[qq.proveedorNombre]) {
      grupos[qq.proveedorNombre] = [];
      orden.push(qq.proveedorNombre);
    }
    grupos[qq.proveedorNombre].push(p);
  });
  const resumen: Record<string, X> = {};
  S.proveedoresResumen.forEach((r: X) => (resumen[r.proveedorNombre] = r));
  return orden.map((nom) => ({
    nombre: nom,
    resumen: resumen[nom] && resumen[nom].productos > 0 ? resumen[nom] : null,
    productos: grupos[nom].slice().sort((a, b) => {
      const x = a.quiebre.colocarPedido || '9999',
        y = b.quiebre.colocarPedido || '9999';
      return x < y ? -1 : x > y ? 1 : String(a.quiebre.producto).localeCompare(String(b.quiebre.producto));
    }),
  }));
}

/** Texto de los contenedores del Resumen (textoCont de _impVistaResumen). */
export function textoContenedores(S: X): string {
  const cs = S.plan.contenedores;
  if (!cs.length) return '';
  let t = `Pedido de hoy: ${nf(cs[0].cbm)} CBM, colocar ${fImp(cs[0].colocar)}, llega ${fImp(cs[0].llega)} y alcanza hasta ${fImp(cs[0].alcanzaHasta)}.`;
  cs.slice(1, 4).forEach((x: X, i: number) => {
    t += ` Contenedor ${i + 2}: colocar ${fImp(x.colocar)} (llega ${fImp(x.llega)}).`;
  });
  return t;
}
```

Crear `components/comercializadora/vistas-plan.tsx` (`_ifNav`, `_ifKpi`, `_ifSec` 37810–37817 y la tabla de `_ordVistaHtml`/`_impVistaAhora`, compartida con Café):

```tsx
import Link from 'next/link';
import { Pill, type Estado } from '@/components/portal/piezas';

/** Parámetros de la URL de una pantalla del plan, con cambios (undefined o '' quita el parámetro). */
export function hrefPlan(
  ruta: string,
  actual: Record<string, string | undefined>,
  cambios: Record<string, string | undefined>,
) {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...actual, ...cambios })) if (v) q.set(k, v);
  const s = q.toString();
  return s ? `${ruta}?${s}` : ruta;
}

/** _ifNav: las vistas de la pantalla como enlaces (?vista=), conservando el escenario y "Ver todo". */
export function NavVistas(p: {
  ruta: string;
  vistas: [string, string][];
  activa: string;
  params: Record<string, string | undefined>;
}) {
  return (
    <nav aria-label="Vistas" className="mb-4 flex flex-wrap gap-1.5">
      {p.vistas.map(([v, t]) => (
        <Link
          key={v}
          href={hrefPlan(p.ruta, p.params, { vista: v, cuando: undefined, todos: undefined })}
          aria-current={p.activa === v ? 'page' : undefined}
          className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.activa === v ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
        >
          {t}
        </Link>
      ))}
      <span className="flex-1" />
      <Link
        href={hrefPlan(p.ruta, p.params, { det: p.params.det ? undefined : '1', vista: undefined })}
        className="px-2 py-1.5 text-sm font-semibold underline"
      >
        {p.params.det ? 'Vista simple' : 'Ver todo'}
      </Link>
    </nav>
  );
}

/** Caja de avisos (_impAvisosHtml / _cafeAvisosHtml); plegada en Qué pedir. */
export function AvisosPlan({ avisos, plegado }: { avisos: string[]; plegado?: boolean }) {
  if (!avisos.length) return null;
  const lista = (
    <ul className="space-y-1 text-sm text-ink-2">
      {avisos.map((a) => (
        <li key={a}>{a}</li>
      ))}
    </ul>
  );
  return plegado ? (
    <details className="mt-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <summary className="cursor-pointer text-sm font-semibold">Avisos del cálculo ({avisos.length})</summary>
      <div className="mt-2">{lista}</div>
    </details>
  ) : (
    <div className="mb-4 rounded-xl border border-line bg-surface-2 px-4 py-3">
      <p className="mb-1 text-sm font-bold">Avisos</p>
      {lista}
    </div>
  );
}

/** Tarjeta chica de cifra (_ifKpi). */
export function CifraPlan(p: {
  etiqueta: string;
  valor: React.ReactNode;
  nota?: React.ReactNode;
  tono?: Estado;
  ayuda?: string;
}) {
  const color = { ok: 'text-ok', bajo: 'text-warn', pierde: 'text-bad', 'sin-precio': '', neutro: '' }[
    p.tono ?? 'neutro'
  ];
  return (
    <div
      title={p.ayuda}
      className="min-w-40 flex-1 rounded-2xl border border-line bg-surface p-4 shadow-card"
    >
      <p className="text-xs font-medium text-ink-2">{p.etiqueta}</p>
      <p className={`mt-1 truncate font-display text-xl font-bold tabular-nums ${color}`}>{p.valor}</p>
      {p.nota ? <p className="mt-1 text-xs text-muted-foreground">{p.nota}</p> : null}
    </div>
  );
}

/** Sección con título y ayuda (_ifSec). */
export function SeccionPlan({
  titulo,
  ayuda,
  children,
}: {
  titulo: string;
  ayuda?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="mb-5 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2>{titulo}</h2>
      {ayuda ? <p className="mt-1 max-w-4xl text-xs text-muted-foreground">{ayuda}</p> : null}
      <div className="mt-3">{children}</div>
    </section>
  );
}

/** Banda de proveedor y filas de las vistas "Qué pedir" (_ordVistaHtml / _impVistaAhora): una sola tabla alineada. */
export interface GrupoQuePedir {
  clave: string;
  nombre: string;
  chips: { texto: string; estado: Estado }[];
  accion?: React.ReactNode;
  filas: {
    clave: string;
    nombre: string;
    sku: string;
    marca?: React.ReactNode;
    detalle?: React.ReactNode;
    visual: React.ReactNode;
    pedir: React.ReactNode;
    quedas: React.ReactNode;
    porQue: React.ReactNode;
    ayuda: string;
    tono: 'esta' | 'prox' | 'espera' | '';
  }[];
}
const BORDE = {
  esta: 'border-l-bad',
  prox: 'border-l-warn',
  espera: 'border-l-line-strong',
  '': 'border-l-transparent',
};
export function TablaQuePedir({
  grupos,
  simple,
  columnaVisual,
  vacio,
}: {
  grupos: GrupoQuePedir[];
  simple: boolean;
  columnaVisual: string;
  vacio: string;
}) {
  if (!grupos.length) return <p className="py-10 text-center text-sm text-muted-foreground">{vacio}</p>;
  return (
    <div className="placa overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            <th>Producto</th>
            <th>{columnaVisual}</th>
            <th>Qué pedir</th>
            <th title="Inventario cuando llegue el pedido">Quedas con</th>
            {simple ? null : <th>Por qué</th>}
          </tr>
        </thead>
        <tbody>
          {grupos.map((g) => [
            <tr key={g.clave} className="bg-surface-2">
              <td colSpan={simple ? 4 : 5}>
                <div className="flex flex-wrap items-center gap-2">
                  <b>{g.nombre}</b>
                  {g.chips.map((c) => (
                    <Pill key={c.texto} estado={c.estado}>
                      {c.texto}
                    </Pill>
                  ))}
                  <span className="flex-1" />
                  {g.accion}
                </div>
              </td>
            </tr>,
            ...g.filas.map((f) => (
              <tr
                key={g.clave + '|' + f.clave}
                title={f.ayuda}
                className={`border-l-4 align-top ${BORDE[f.tono]}`}
              >
                <td className="min-w-48">
                  <b>{f.nombre}</b>
                  <span className="block font-mono text-xs text-muted-foreground">
                    {f.sku}
                    {f.marca}
                  </span>
                  {f.detalle}
                </td>
                <td className="min-w-56">{f.visual}</td>
                <td>{f.pedir}</td>
                <td>{f.quedas}</td>
                {simple ? null : <td className="min-w-56 text-xs text-ink-2">{f.porQue}</td>}
              </tr>
            )),
          ])}
        </tbody>
      </table>
    </div>
  );
}
```

Crear `components/comercializadora/selector-escenario.tsx` (`_impSetEscenario`/`_cafeSetEscenario`):

```tsx
'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { claseCampo } from '@/lib/crm/formato';

/** Selector de escenario (_impSetEscenario / _cafeSetEscenario): solo cambia lo que se ve (?esc=), no lo guarda. */
export function SelectorEscenario({ opciones, valor }: { opciones: [string, string][]; valor: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      Escenario
      <select
        aria-label="Escenario"
        className={`${claseCampo} max-w-md`}
        value={valor}
        onChange={(e) => {
          const q = new URLSearchParams(sp.toString());
          q.set('esc', e.target.value);
          router.push(`${ruta}?${q.toString()}`);
        }}
      >
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
```

Crear `components/comercializadora/importaciones.tsx`. Es `_impKpisHtml`, `_impVistaAhora` (con "Crear OC", decisión 3), `_impVistaPedir`, `_impGraficaCbm` 37902, `_impVistaEmbarques` 37966, `_impVistaProyeccion` 37994 (decisión 9), `_impVistaPuente` 38006 y `_impVistaResumen`:

```tsx
import Link from 'next/link';
import { Pill } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import {
  ahoraImp,
  detalleImp,
  dinero,
  fImp,
  kpisImp,
  mesImp,
  nf,
  nu,
  porQueImp,
  textoContenedores,
  tonoEstadoImp,
  type Cuando,
  type CorridaImp,
} from '@/lib/comercializadora/importaciones';
import { enlaceOc, ocImportaciones } from '@/lib/comercializadora/crearOc';
import { masDias } from '@/lib/comercializadora/fechas';
import { CifraPlan, hrefPlan, SeccionPlan, TablaQuePedir, type GrupoQuePedir } from './vistas-plan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const RUTA = '/comercializadora/importaciones';
const der = 'text-right tabular-nums';

function Estado({ e }: { e: string }) {
  return <Pill estado={tonoEstadoImp(e)}>{e}</Pill>;
}

/** _impKpisHtml: pedir en 30 días, ya va tarde, primer quiebre, próximo contenedor y sucursales. */
export function KpisImp({ c }: { c: CorridaImp }) {
  const k = kpisImp(c);
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta="Pedir en los próximos 30 días"
        valor={`${k.pedir30.n} ${k.pedir30.n === 1 ? 'producto' : 'productos'}`}
        nota={`Inversión ${dinero(k.pedir30.inversion)}`}
        tono="pierde"
      />
      <CifraPlan
        etiqueta="Pedido ya va tarde"
        valor={k.tarde}
        nota={`En riesgo de quedarse sin producto: ${k.riesgo}`}
        tono="bajo"
      />
      <CifraPlan
        etiqueta="Primer quiebre"
        valor={k.quiebre ? k.quiebre.producto : 'Sin quiebre'}
        nota={k.quiebre ? `Se acaba el ${fImp(k.quiebre.fecha)}` : 'En todo el horizonte'}
      />
      <CifraPlan
        etiqueta="Próximo contenedor"
        valor={k.contenedor ? fImp(k.contenedor.colocar) : '—'}
        nota={
          k.contenedor
            ? `Colocar · llega ${fImp(k.contenedor.llega)} · ${k.contenedor.estado}`
            : 'Sin pedido de contenedor'
        }
        ayuda={`Fecha en la que hay que colocar el pedido del siguiente contenedor de ${k.proveedorContenedor}`}
      />
      <CifraPlan
        etiqueta="Sucursales"
        valor={nf(k.sucursales.hoy)}
        nota={`Fin del horizonte (${k.sucursales.mesFin}): ${nf(k.sucursales.fin)}`}
      />
    </div>
  );
}

/** _impLineaHtml: con producto (verde), sin producto (rojo) y ya repuesto; marcas de cuándo pedir y cuándo llega. */
function LineaTiempo({ q, linea, fin, simple }: { q: X; linea: X; fin: string; simple: boolean }) {
  if (!linea)
    return (
      <>
        {simple ? null : <div className="h-2.5 rounded-full bg-ok" />}
        <p className="mt-1 text-xs text-muted-foreground">Alcanza más allá de {fin}</p>
      </>
    );
  return (
    <>
      {simple ? null : (
        <div
          className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2"
          title={`Con producto hasta el ${fImp(q.seAcaba)}`}
        >
          {linea.ok ? <i className="bg-ok" style={{ width: `${linea.ok}%` }} /> : null}
          {linea.gap ? (
            <i className="bg-bad" style={{ width: `${linea.gap}%` }} title="Sin producto" />
          ) : null}
          {linea.resp ? <i className="bg-ok-soft" style={{ width: `${linea.resp}%` }} /> : null}
          {linea.pedir !== null ? (
            <span
              className="absolute top-0 h-full w-0.5 bg-ink"
              style={{ left: `${linea.pedir}%` }}
              title={`Colocar el pedido: ${fImp(q.colocarPedido)}`}
            />
          ) : null}
          {linea.llega !== null ? (
            <span
              className="absolute top-0 h-full w-0.5 bg-crema-strong"
              style={{ left: `${linea.llega}%` }}
              title={`Llega: ${fImp(q.llegaCedis)}`}
            />
          ) : null}
        </div>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
        <span>
          Se acaba <b>{fImp(q.seAcaba)}</b>
        </span>
        {q.cantidadPedir > 0 && q.colocarPedido ? (
          <>
            <span>
              Pedir el <b>{fImp(q.colocarPedido)}</b>
            </span>
            <span>
              Llega <b>{fImp(q.llegaCedis)}</b>
            </span>
          </>
        ) : null}
        {q.diasSinProducto > 0 ? <b className="text-bad">{nf(q.diasSinProducto)} días sin producto</b> : null}
      </p>
    </>
  );
}

/** _impVistaAhora: esta semana y la próxima, por proveedor, con la línea de tiempo y Crear OC. */
export function QuePedirImp(p: {
  c: CorridaImp;
  cuando: Cuando;
  soloAcc: boolean;
  simple: boolean;
  editable: boolean;
  params: Record<string, string | undefined>;
}) {
  const { c, simple } = p;
  const d = ahoraImp(c, { cuando: p.cuando, soloAcc: p.soloAcc });
  const total = d.nE + d.nP + d.espera + d.ok;
  const grupos: GrupoQuePedir[] = d.grupos.map((g) => {
    const oc = g.esta && p.editable ? ocImportaciones(c, g.clave) : null;
    return {
      clave: g.clave,
      nombre: g.nombre,
      chips: [
        ...(g.esta
          ? [{ texto: `ESTA SEMANA · ${g.esta} art. · ${dinero(g.montoEsta)}`, estado: 'pierde' as const }]
          : []),
        ...(g.prox
          ? [{ texto: `PRÓXIMA · ${g.prox} art. · ${dinero(g.montoProx)}`, estado: 'bajo' as const }]
          : []),
      ],
      accion:
        oc && !('error' in oc) ? (
          <Link
            href={enlaceOc(oc)}
            className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
          >
            Crear OC
          </Link>
        ) : null,
      filas: g.filas.map((f) => {
        const q = f.q;
        return {
          clave: f.sku,
          nombre: q.producto,
          sku: f.sku,
          marca: f.urgente ? <b className="ml-2 text-bad">YA VA TARDE</b> : null,
          detalle: (
            <span className="mt-1 block text-xs text-ink-2">
              Tienes <b>{nu(q.stockHoy, 1)}</b>
              {q.yaComprado > 0 ? (
                <>
                  {' '}
                  · En camino <b>{nu(q.yaComprado)}</b>
                  {f.borrador > 0 ? <span className="text-warn"> ({nu(f.borrador)} en borrador)</span> : null}
                </>
              ) : null}
            </span>
          ),
          visual: <LineaTiempo q={q} linea={f.linea} fin={d.fin} simple={simple} />,
          pedir:
            q.cantidadPedir > 0 ? (
              <div>
                <p
                  className={`font-display text-lg font-bold tabular-nums ${f.tipo === 'prox' ? 'text-warn' : ''}`}
                >
                  {nu(q.cantidadPedir)} <small className="text-xs font-normal">{q.unidad}</small>
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.inversion > 0 ? dinero(q.inversion) : 'sin costo'}
                </p>
                <Pill estado={f.tipo === 'esta' ? 'pierde' : f.tipo === 'prox' ? 'bajo' : 'neutro'}>
                  {f.tipo === 'esta'
                    ? 'ESTA SEMANA'
                    : f.tipo === 'prox'
                      ? 'PRÓXIMA SEMANA'
                      : `COLOCAR EL ${fImp(q.colocarPedido).toUpperCase()}`}
                </Pill>
              </div>
            ) : (
              <Pill estado="ok">ALCANZA</Pill>
            ),
          quedas:
            f.queda !== null ? (
              <div>
                <p className="font-semibold tabular-nums">{nu(f.queda)}</p>
                <p className="text-xs text-muted-foreground">
                  {f.mesesQueda !== null ? `≈ ${nf(f.mesesQueda, 1)} meses · ` : ''}al llegar
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          porQue: (
            <>
              {porQueImp(q, c)}
              {f.nota ? <span className="mt-1 block text-muted-foreground">{f.nota}</span> : null}
            </>
          ),
          ayuda: porQueImp(q, c),
          tono: (f.tipo ?? '') as 'esta' | 'prox' | '',
        };
      }),
    };
  });
  const cuandoHref = (k: Cuando) => hrefPlan(RUTA, p.params, { cuando: p.cuando === k ? undefined : k });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <CifraPlan
          etiqueta="Pedir esta semana"
          valor={`${d.nE} ${d.nE === 1 ? 'artículo' : 'artículos'}`}
          nota={dinero(d.mE)}
          tono="pierde"
        />
        <CifraPlan
          etiqueta="Pedir la próxima semana"
          valor={`${d.nP} ${d.nP === 1 ? 'artículo' : 'artículos'}`}
          nota={dinero(d.mP)}
          tono="bajo"
        />
        {simple ? null : (
          <>
            <CifraPlan
              etiqueta="Pedido ya va tarde"
              valor={d.urg}
              nota="se acaba antes de que llegue un pedido hecho hoy"
              tono="pierde"
            />
            <CifraPlan
              etiqueta="Sin pedido por ahora"
              valor={d.ok}
              nota={`alcanzan más allá de ${d.fin}`}
              tono="ok"
            />
          </>
        )}
      </div>
      {simple || !total ? null : (
        <div className="mb-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            {(
              [
                [d.nE, 'bg-bad'],
                [d.nP, 'bg-warn'],
                [d.espera, 'bg-line-strong'],
                [d.ok, 'bg-ok'],
              ] as const
            ).map(([v, cl], i) =>
              v ? <i key={i} className={cl} style={{ width: `${(v / total) * 100}%` }} /> : null,
            )}
          </div>
          <p className="mt-1 text-xs text-ink-2">
            <b>{d.nE}</b> pedir esta semana · <b>{d.nP}</b> la próxima · <b>{d.espera}</b> se pedirán después
            · <b>{d.ok}</b> sin pedido por ahora
          </p>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['esta', `Esta semana (${d.nE})`],
            ['prox', `Próxima semana (${d.nP})`],
          ] as const
        ).map(([k, t]) => (
          <Link
            key={k}
            href={cuandoHref(k)}
            aria-current={p.cuando === k ? 'true' : undefined}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.cuando === k ? 'border-ink font-bold' : 'border-line'}`}
          >
            {t}
          </Link>
        ))}
        {simple || p.cuando ? null : (
          <Link
            href={hrefPlan(RUTA, p.params, { todos: p.soloAcc ? '1' : undefined })}
            className="text-sm underline"
          >
            {p.soloAcc ? 'Ver todos los artículos' : 'Solo los que requieren acción'}
          </Link>
        )}
      </div>
      <TablaQuePedir
        grupos={grupos}
        simple={simple}
        columnaVisual="Cuándo se acaba y cuándo llega"
        vacio={
          p.cuando === 'esta'
            ? 'Nada que pedir esta semana.'
            : p.cuando === 'prox'
              ? 'Nada que pedir la próxima semana.'
              : 'Nada que pedir esta semana ni la próxima.'
        }
      />
      {simple ? null : (
        <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
          Calculado con el modelo de tu Sheet de importados: cada pedido cubre{' '}
          {c.cfg.imp.politica.meses_cobertura} meses más {c.cfg.imp.politica.meses_respaldo} de respaldo, con
          el lead time de cada proveedor. En la línea de tiempo, la marca oscura es cuándo pedir y la café
          cuándo llega; el tramo rojo son los días sin producto.
        </p>
      )}
    </div>
  );
}

/** _impVistaPedir: detalle por artículo, agrupado por proveedor, con búsqueda, proveedor y solo con acción. */
export function DetalleImp(p: {
  c: CorridaImp;
  q: string;
  prov: string;
  soloAcc: boolean;
  params: Record<string, string | undefined>;
}) {
  const { c } = p;
  const grupos = detalleImp(c, { q: p.q, prov: p.prov, soloAcc: p.soloAcc });
  const m = c.ent.meta;
  return (
    <div>
      <form action={RUTA} className="mb-3 flex flex-wrap items-center gap-2">
        {['vista', 'esc', 'det'].map((k) =>
          p.params[k] ? <input key={k} type="hidden" name={k} value={p.params[k]} /> : null,
        )}
        <input
          name="q"
          defaultValue={p.q}
          aria-label="Buscar"
          placeholder="Buscar artículo o SKU..."
          className={`${claseCampo} max-w-64`}
        />
        <select name="prov" defaultValue={p.prov} aria-label="Proveedor" className={`${claseCampo} max-w-56`}>
          <option value="">Todos los proveedores</option>
          {c.cfg.imp.prov.map((x: X) => (
            <option key={x.clave} value={x.clave}>
              {x.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="solo" value="1" defaultChecked={p.soloAcc} />
          Solo los que requieren acción
        </label>
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>
      {!grupos.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ningún artículo coincide con el filtro.
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.nombre} className="mb-5">
            <p className="mb-2 flex flex-wrap items-baseline gap-3">
              <b>{g.nombre}</b>
              <span className="text-xs text-ink-2">
                {g.resumen
                  ? `Próximo pedido: colocar ${fImp(g.resumen.colocar)} · llega ${fImp(g.resumen.llega)} · ${g.resumen.productos} ${g.resumen.productos === 1 ? 'producto' : 'productos'} · inversión ${dinero(g.resumen.inversion)}${g.resumen.contenedores ? ` · ${nu(g.resumen.contenedores, 1)} ${g.resumen.contenedores > 1.05 ? 'contenedores' : 'contenedor'}` : ''}`
                  : 'Sin pedido en el horizonte'}
              </span>
            </p>
            <div className="placa overflow-x-auto">
              <table className="tabla text-xs">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th className="text-right" title="Inventario con el que arranca el cálculo">
                      Inventario
                    </th>
                    <th className="text-right" title="Pendiente de llegar en OCs abiertas">
                      En camino
                    </th>
                    <th className="text-right" title="Promedio de los próximos 3 meses del modelo">
                      Venta al mes
                    </th>
                    <th className="text-right" title="Meses que alcanza el inventario más lo que viene">
                      Alcanza (meses)
                    </th>
                    <th className="text-right">Se acaba</th>
                    <th className="text-right" title="Se acaba menos lead time menos margen">
                      Pedir a más tardar
                    </th>
                    <th
                      className="text-right"
                      title="Se junta con otros del mismo proveedor dentro de la ventana de días"
                    >
                      Colocar pedido
                    </th>
                    <th className="text-right">Llega a CEDIS</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Inversión</th>
                    <th>Estado</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {g.productos.map((x: X) => {
                    const q = x.quiebre,
                      mi = m.items[x.sku] || {};
                    const nota = [
                      q.nota,
                      q.compraPuente > 0 ? `Compra puente: ${nf(q.compraPuente)} ${q.unidad}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <tr key={x.sku}>
                        <td className="min-w-48">
                          <b>{q.producto}</b>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {x.sku}
                            {mi.aviso && mi.aviso.length ? (
                              <span className="text-warn"> · {mi.aviso[0]}</span>
                            ) : null}
                          </span>
                        </td>
                        <td
                          className={der}
                          title={
                            mi.stockAjuste
                              ? `Inventario real ${nf(mi.stockReal, 1)} + ${nf(mi.stockAjuste, 1)} ya vendido este mes (el modelo cuenta el mes completo)`
                              : 'Inventario de la plataforma'
                          }
                        >
                          {nu(q.stockHoy, 1)}
                        </td>
                        <td className={der}>{nu(q.yaComprado)}</td>
                        <td className={der}>{nu(q.ventaMes3, 1)}</td>
                        <td className={der}>{q.mesesAlcanza == null ? '—' : nf(q.mesesAlcanza, 1)}</td>
                        <td className={der}>
                          {q.sinQuiebre ? (
                            <span className="text-muted-foreground">No en el horizonte</span>
                          ) : (
                            fImp(q.seAcaba)
                          )}
                        </td>
                        <td className={der}>{fImp(q.pedirATardar)}</td>
                        <td className={der}>{fImp(q.colocarPedido)}</td>
                        <td className={der}>{fImp(q.llegaCedis)}</td>
                        <td className={der}>{q.cantidadPedir > 0 ? <b>{nu(q.cantidadPedir)}</b> : '—'}</td>
                        <td className={der}>{q.inversion > 0 ? dinero(q.inversion) : '—'}</td>
                        <td>
                          <Estado e={q.estado} />
                        </td>
                        <td className="min-w-56 text-ink-2">{nota}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** _impGraficaCbm: consumo mensual de vasos y tapas (CBM), lo que llega y el stock al cierre. */
export function GraficaCbm({ S }: { S: X }) {
  const ms = S.meses,
    n = ms.length,
    Wd = 900,
    Hd = 240,
    ml = 48,
    mr = 10,
    mt = 16,
    mb = 34,
    bw = (Wd - ml - mr) / n,
    ph = Hd - mt - mb;
  let mx = 0;
  ms.forEach(
    (m: X) => (mx = Math.max(mx, m.cbmVasosTapas || 0, m.cbmQueLlega || 0, m.stockVasosTapasCbm || 0)),
  );
  if (mx <= 0) mx = 1;
  const y = (v: number) => mt + ph - (v / mx) * ph;
  const pts: string[] = [];
  return (
    <div>
      <p className="mb-1 flex flex-wrap gap-4 text-xs text-ink-2">
        <span>▮ Consumo del mes (CBM)</span>
        <span className="text-crema-strong">▮ CBM que llega</span>
        <span className="text-bad">— Stock de vasos y tapas al cierre</span>
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="CBM de vasos y tapas por mes"
          className="block h-auto w-full min-w-[620px]"
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(mx * f)}
                y2={y(mx * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(mx * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {nf(mx * f)}
              </text>
            </g>
          ))}
          {ms.map((m: X, j: number) => {
            const x = ml + j * bw + bw * 0.12,
              w = bw * 0.36,
              h1 = Math.max(0, ((m.cbmVasosTapas || 0) / mx) * ph),
              h2 = Math.max(0, ((m.cbmQueLlega || 0) / mx) * ph);
            pts.push(`${x + w},${y(m.stockVasosTapasCbm || 0)}`);
            return (
              <g key={j}>
                <rect
                  x={x}
                  y={mt + ph - h1}
                  width={w}
                  height={h1}
                  rx="2"
                  style={{ fill: 'var(--color-line-strong)' }}
                >
                  <title>{`${mesImp(m.inicio)}: consumo ${nf(m.cbmVasosTapas, 1)} CBM`}</title>
                </rect>
                <rect
                  x={x + w + 2}
                  y={mt + ph - h2}
                  width={w}
                  height={h2}
                  rx="2"
                  style={{ fill: 'var(--color-crema-strong)' }}
                >
                  <title>{`${mesImp(m.inicio)}: llegan ${nf(m.cbmQueLlega, 1)} CBM${m.llegaContenedor ? ` (${m.llegaContenedor})` : ''}`}</title>
                </rect>
                <text
                  x={x + w}
                  y={Hd - 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  style={{ fill: 'var(--color-muted-foreground)' }}
                >
                  {mesImp(m.inicio)}
                </text>
              </g>
            );
          })}
          <polyline
            points={pts.join(' ')}
            fill="none"
            style={{ stroke: 'var(--color-bad)' }}
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}

/** _impVistaEmbarques: plan de contenedores del proveedor de contenedores, cantidades y cuántos caben. */
export function ContenedoresImp({ c }: { c: CorridaImp }) {
  const S = c.S,
    pl = S.plan,
    cont = c.ent.P.constantes.proveedorContenedor;
  if (!c.ent.items.some((it: X) => String(it.proveedor).toLowerCase() === String(cont).toLowerCase()))
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No hay artículos asignados al proveedor de contenedores ({cont}). Asigna los vasos y tapas a ese
        proveedor en Parámetros.
      </p>
    );
  const n = Math.min(pl.contenedores.length, 11),
    cs = pl.contenedores.slice(0, n),
    ct = S.contenedores;
  const color = (e: string) =>
    /PEDIR YA/.test(e)
      ? 'text-bad'
      : /este mes/.test(e)
        ? 'text-warn'
        : /Fuera/.test(e)
          ? 'text-muted-foreground'
          : 'text-ink-2';
  return (
    <>
      <SeccionPlan
        titulo={`Plan de contenedores de ${cont}`}
        ayuda="Cada contenedor se llena por CBM: cuántas cajas de cada artículo caben para que salga lleno, y cuándo hay que colocarlo para que llegue antes de que se acabe el anterior."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th className="text-right">Colocar</th>
                <th className="text-right">Llega</th>
                <th className="text-right">Alcanza hasta</th>
                <th className="text-right">Días que alcanza</th>
                <th
                  className="text-right"
                  title="CBM de vasos y tapas que se venden al día en el mes de llegada"
                >
                  CBM por día
                </th>
                <th className="text-right">Sucursales</th>
                <th className="text-right">CBM</th>
                <th className="text-right">Inversión</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((x: X) => (
                <tr key={x.n}>
                  <td className="font-semibold">{x.n}</td>
                  <td className={der}>{fImp(x.colocar)}</td>
                  <td className={der}>{fImp(x.llega)}</td>
                  <td className={der}>{fImp(x.alcanzaHasta)}</td>
                  <td className={der}>{nu(x.diasAlcanza)}</td>
                  <td className={der}>{nu(x.cbmDia, 1)}</td>
                  <td className={der}>{nu(x.sucursales)}</td>
                  <td className={der}>{nu(x.cbm, 1)}</td>
                  <td className={der}>{dinero(x.inversion)}</td>
                  <td className={`whitespace-nowrap font-semibold ${color(String(x.estado))}`}>
                    {String(x.estado).replace('(dic-27)', `(${mesImp(S.meses[14].inicio)})`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan
        titulo="Cantidades por contenedor"
        ayuda="Cajas de cada artículo en cada contenedor. En rojo: cantidad menor al mínimo del proveedor (negocia o junta colores)."
      >
        <div className="overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="text-right">CBM por caja</th>
                {cs.map((x: X) => (
                  <th
                    key={x.n}
                    className="text-right"
                    title={`Colocar ${fImp(x.colocar)} · llega ${fImp(x.llega)}`}
                  >
                    C{x.n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pl.cantidades.map((a: X) => (
                <tr key={a.producto}>
                  <td>
                    {a.producto}
                    {a.alias ? (
                      <span className="block text-[10px] text-muted-foreground">{a.alias}</span>
                    ) : null}
                  </td>
                  <td className={der}>{nf(a.cbmCaja, 4)}</td>
                  {a.porContenedor.slice(0, n).map((q: number, j: number) => (
                    <td
                      key={j}
                      className={`${der} ${a.minimoProveedor > 0 && q > 0 && q < a.minimoProveedor ? 'font-semibold text-bad' : ''}`}
                    >
                      {q > 0 ? nu(q) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-bold">
                <td>CBM del contenedor</td>
                <td />
                {pl.totalCbm.slice(0, n).map((v: number, j: number) => (
                  <td key={j} className={der}>
                    {nu(v, 1)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Cuántos contenedores caben">
        <p className="text-sm text-ink-2">
          El próximo pedido necesita <b>{nu(ct.contenedoresProximoPedido, 1)}</b> contenedor(es).{' '}
          {ct.mesNoCabeEn1Texto === 'Ya desde hoy'
            ? 'Un solo contenedor ya no alcanza para un trimestre desde hoy.'
            : ct.mesNoCabeEn1
              ? `Desde ${mesImp(ct.mesNoCabeEn1)} un contenedor ya no alcanza para un trimestre.`
              : 'Un contenedor alcanza para un trimestre en todo el horizonte.'}
          {ct.mesNoCabeEn2
            ? ` Desde ${mesImp(ct.mesNoCabeEn2)} ni dos contenedores alcanzan: conviene pasar a embarques programados.`
            : ''}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Sucursales</th>
                <th className="text-right">CBM consumidos</th>
                <th
                  className="text-right"
                  title={`Lo que cubre un pedido de ${c.cfg.imp.politica.meses_cobertura} meses`}
                >
                  CBM de un pedido
                </th>
                <th className="text-right">Contenedores necesarios</th>
                <th className="text-right">Meses que cubre 1</th>
                <th>Qué conviene</th>
              </tr>
            </thead>
            <tbody>
              {ct.meses.map((m: X) => (
                <tr key={m.mes}>
                  <td>{mesImp(m.mes)}</td>
                  <td className={der}>{nu(m.sucursales)}</td>
                  <td className={der}>{nu(m.cbmConsumidos, 1)}</td>
                  <td className={der}>{nu(m.cbmPedido, 1)}</td>
                  <td className={`${der} ${m.contenedoresNecesarios > 2 ? 'font-semibold text-bad' : ''}`}>
                    {nu(m.contenedoresNecesarios, 2)}
                  </td>
                  <td className={der}>{nu(m.mesesCubre1, 1)}</td>
                  <td className="text-xs">{m.queConviene}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}

/** _impVistaProyeccion. Decisión 9: el texto nombra el escenario que se está viendo (el viejo ponía el guardado). */
export function ProyeccionImp({ c }: { c: CorridaImp }) {
  const S = c.S;
  return (
    <SeccionPlan
      titulo="Proyección mensual"
      ayuda={`Cómo evoluciona la red de sucursales y el consumo de vasos y tapas durante los próximos 15 meses con el escenario ${c.esc}. El inventario en días es lo que queda al cierre del mes dividido entre el consumo diario: en rojo menos de 15 días, en ámbar menos de 30.`}
    >
      <div className="mb-3">
        <GraficaCbm S={S} />
      </div>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right" title="Sucursales operando al inicio del mes">
                Sucursales
              </th>
              <th className="text-right">Aperturas</th>
              <th className="text-right" title="Vasos y tapas">
                CBM consumidos
              </th>
              <th className="text-right" title="Contenedores y compras ya hechas">
                CBM que llega
              </th>
              <th className="text-right">Stock al cierre (CBM)</th>
              <th className="text-right">Inventario (días)</th>
              <th>Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {S.meses.map((m: X) => (
              <tr key={m.inicio}>
                <td className="font-semibold">{mesImp(m.inicio)}</td>
                <td className={der}>{nu(m.sucursalesInicio)}</td>
                <td className={der}>{m.aperturas > 0 ? `+${m.aperturas}` : '0'}</td>
                <td className={der}>{nu(m.cbmVasosTapas, 1)}</td>
                <td className={der}>{nu(m.cbmQueLlega, 1)}</td>
                <td className={der}>{nu(m.stockVasosTapasCbm, 1)}</td>
                <td
                  className={`${der} font-semibold ${m.inventarioDiasCierre == null ? '' : m.inventarioDiasCierre < 15 ? 'text-bad' : m.inventarioDiasCierre < 30 ? 'text-warn' : 'text-ok'}`}
                >
                  {nu(m.inventarioDiasCierre)}
                </td>
                <td className="text-xs text-ink-2">
                  {[
                    m.colocarContenedor ? `Colocar ${m.colocarContenedor}` : '',
                    m.llegaContenedor ? `Llega ${m.llegaContenedor}` : '',
                    m.colocarTermos ? `Termos: ${m.colocarTermos}` : '',
                    m.colocarTazasParaguas ? `Tazas y paraguas: ${m.colocarTazasParaguas}` : '',
                    m.colocarBolsas ? `Bolsas: ${m.colocarBolsas}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _impVistaPuente. */
export function PuenteImp({ c }: { c: CorridaImp }) {
  const ci = c.cfg.imp;
  const ps = c.S.productos.filter((x: X) => x.compraPuente.compraPuente > 0 || x.compraPuente.yaComprado > 0);
  if (!ps.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No hay nada en camino ni compras puente que calcular.
      </p>
    );
  return (
    <SeccionPlan
      titulo="Compra puente"
      ayuda={`Mientras llega lo que ya está pedido, ¿alcanza el inventario? Si faltan unidades antes de la llegada se calcula una compra puente local (o por aéreo en termos): lo que falta más un colchón de ${ci.puente.dias_colchon} días, redondeado a múltiplos de ${ci.puente.multiplo}.`}
    >
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="text-right">Inventario</th>
              <th className="text-right">Ya pedido</th>
              <th className="text-right">Llega</th>
              <th className="text-right">Venta hasta que llega</th>
              <th className="text-right">Faltante</th>
              <th className="text-right">Colchón</th>
              <th className="text-right">Compra puente</th>
              <th>Cómo cubrir</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((x: X) => {
              const cp = x.compraPuente;
              return (
                <tr key={x.sku}>
                  <td>
                    {x.quiebre.producto}
                    <span className="block font-mono text-[10px] text-muted-foreground">{x.sku}</span>
                  </td>
                  <td className={der}>{nu(cp.stockHoy, 1)}</td>
                  <td className={der}>{nu(cp.yaComprado)}</td>
                  <td className={der}>{fImp(cp.llega)}</td>
                  <td className={der}>{nu(cp.ventaHastaLlegar, 1)}</td>
                  <td className={der}>{nu(cp.faltante, 1)}</td>
                  <td className={der}>{nu(cp.colchon, 1)}</td>
                  <td className={der}>{cp.compraPuente > 0 ? <b>{nu(cp.compraPuente)}</b> : '—'}</td>
                  <td className="text-xs">{cp.comoCubrir}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _impVistaResumen: qué pedir ahora y este mes, contenedores con la gráfica y las aperturas que usa el plan. */
export function ResumenImp({ c }: { c: CorridaImp }) {
  const S = c.S,
    hoy = c.ent.P.fechaCorte,
    d7 = masDias(hoy, 7),
    d30 = masDias(hoy, 30);
  const ahora = S.productos.filter(
    (x: X) => x.quiebre.cantidadPedir > 0 && x.quiebre.colocarPedido && x.quiebre.colocarPedido <= d7,
  );
  const mes = S.productos.filter(
    (x: X) =>
      x.quiebre.cantidadPedir > 0 &&
      x.quiebre.colocarPedido &&
      x.quiebre.colocarPedido > d7 &&
      x.quiebre.colocarPedido <= d30,
  );
  const tabla = (lista: X[], vacio: string) =>
    !lista.length ? (
      <p className="text-xs text-muted-foreground">{vacio}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Colocar</th>
              <th className="text-right">Llega</th>
              <th className="text-right">Inversión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x: X) => {
              const q = x.quiebre;
              return (
                <tr key={x.sku}>
                  <td>
                    {q.producto}
                    <span className="block text-[10px] text-muted-foreground">
                      {x.sku} · {q.proveedorNombre}
                    </span>
                  </td>
                  <td className={der}>
                    {nu(q.cantidadPedir)} <small>{q.unidad}</small>
                  </td>
                  <td className={der}>{fImp(q.colocarPedido)}</td>
                  <td className={der}>{fImp(q.llegaCedis)}</td>
                  <td className={der}>{dinero(q.inversion)}</td>
                  <td>
                    <Estado e={q.estado} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  const red = c.ent.meta.red;
  return (
    <>
      <SeccionPlan
        titulo="Qué hay que pedir ahora"
        ayuda="Lo que ya hay que colocar en los próximos 7 días para que el producto llegue antes de que se acabe (lead time + días de margen)."
      >
        {tabla(ahora, 'Nada urgente: ningún artículo tiene que pedirse en los próximos 7 días.')}
      </SeccionPlan>
      <SeccionPlan
        titulo="Qué pedir este mes"
        ayuda="Pedidos que hay que colocar entre 8 y 30 días a partir de hoy."
      >
        {tabla(mes, 'Ningún otro pedido en los próximos 30 días.')}
      </SeccionPlan>
      <SeccionPlan titulo="Contenedores de vasos y tapas" ayuda={textoContenedores(S)}>
        <p className="mb-3 text-sm text-ink-2">
          Volumen de vasos y tapas: <b>{nu(S.meses[0].cbmVasosTapas)} CBM al mes hoy</b> →{' '}
          <b>
            {nu(S.meses[14].cbmVasosTapas)} CBM al mes en {mesImp(S.meses[14].inicio)}
          </b>
          . Un contenedor de {nu(S.cbmUtilContenedor)} CBM alcanza para{' '}
          {nu(S.contenedores.meses[0].mesesCubre1, 1)} meses hoy y para{' '}
          {nu(S.contenedores.meses[14].mesesCubre1, 1)} meses en {mesImp(S.meses[14].inicio)}.
        </p>
        <GraficaCbm S={S} />
      </SeccionPlan>
      <SeccionPlan
        titulo="Aperturas que usa el plan"
        ayuda={`Operan ${red.sucHoy} sucursales hoy. Para cada mes, el plan usa el pipeline registrado en la plataforma y, donde todavía no hay aperturas registradas, el plan de Dirección.`}
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                <th className="text-right">Plan de Dirección</th>
                <th className="text-right">Se usa</th>
                <th>De dónde</th>
              </tr>
            </thead>
            <tbody>
              {red.filas.slice(0, 6).map((f: X) => (
                <tr key={f.key}>
                  <td className="font-semibold">{mesImp(f.key + '-01')}</td>
                  <td className={der}>{f.pipeline}</td>
                  <td className={der}>{f.plan}</td>
                  <td className={der}>
                    <b>{f.considerada}</b>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {f.fuente === 'pipeline' ? 'pipeline' : 'plan de Dirección'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}
```

Crear `app/(comercializadora)/comercializadora/importaciones/page.tsx` (`renderComImportaciones` 38482, `_impPintar` 38320 y `_impVistaHtml` 38298):

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SelectorEscenario } from '@/components/comercializadora/selector-escenario';
import { ParametrosImp } from '@/components/comercializadora/parametros-imp-cafe';
import { AvisosPlan, NavVistas } from '@/components/comercializadora/vistas-plan';
import {
  ContenedoresImp,
  DetalleImp,
  KpisImp,
  ProyeccionImp,
  PuenteImp,
  QuePedirImp,
  ResumenImp,
} from '@/components/comercializadora/importaciones';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { importacionesMotor, motorPlan } from '@/lib/comercializadora/motor';
import {
  avisosImp,
  cuandoDe,
  escImp,
  VISTAS_IMP,
  VISTAS_IMP_SIMPLE,
  vistaImp,
} from '@/lib/comercializadora/importaciones';
import { libroImportaciones } from '@/lib/comercializadora/excelImpCafe';
import { contextoParamsImp } from '@/lib/comercializadora/paramsContexto';
import { IMP_ESCS } from '@/lib/comercializadora/paramsImpCafe';

type Sp = Record<string, string | undefined>;

/** Importaciones (renderComImportaciones): el modelo de la Sheet de importados con los datos del plan del servidor. */
export default async function ImportacionesPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1';
  const vista = vistaImp(sp.vista, det);
  const esc = escImp(sp.esc);
  const params: Sp = { vista, esc: esc ?? undefined, det: det ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Importaciones"
      descripcion="El modelo de tu Sheet de importados (escenarios, contenedores y compra puente) con el inventario, las OCs y las aperturas de la plataforma."
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
  const c = importacionesMotor(m, esc);
  const editable = puedeEditarCom(accesos);
  const nav = (
    <NavVistas
      ruta="/comercializadora/importaciones"
      vistas={det ? VISTAS_IMP : VISTAS_IMP_SIMPLE}
      activa={vista}
      params={params}
    />
  );
  const lecturas = m.R.avisos.length ? (
    <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
    </p>
  ) : null;
  if (vista === 'params')
    return (
      <>
        {encabezado}
        {nav}
        <ParametrosImp
          imp={c.cfg.imp}
          version={m.version}
          editable={editable}
          esc={c.esc}
          ctx={contextoParamsImp(c, m.R)}
        />
      </>
    );
  if (!c.S)
    return (
      <>
        {encabezado}
        {nav}
        <p role="alert" className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {c.err || 'No se pudo calcular.'} Revisa los parámetros.
        </p>
      </>
    );
  const avisos = avisosImp(c, m.R);
  const libro = libroImportaciones(c);
  if (vista === 'ahora')
    return (
      <>
        {encabezado}
        {lecturas}
        {nav}
        <div className="mb-3 flex justify-end">
          <DescargarExcel libro={libro} />
        </div>
        <QuePedirImp
          c={c}
          cuando={cuandoDe(sp.cuando)}
          soloAcc={sp.todos !== '1'}
          simple={!det}
          editable={editable}
          params={{ ...params, cuando: sp.cuando, todos: sp.todos }}
        />
        {det ? <AvisosPlan avisos={avisos} plegado /> : null}
      </>
    );
  const escenarios = IMP_ESCS.map((k): [string, string] => {
    const e = c.cfg.imp.escenarios[k];
    return [k, `${k} (${Math.round(e.crec * 100)}% crec. · ${Math.round(e.cumpl * 100)}% aperturas)`];
  });
  return (
    <>
      {encabezado}
      {lecturas}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SelectorEscenario opciones={escenarios} valor={c.esc} />
        <span className="flex-1" />
        <DescargarExcel libro={libro} />
      </div>
      <KpisImp c={c} />
      <AvisosPlan avisos={avisos} />
      {nav}
      {vista === 'pedir' ? (
        <DetalleImp c={c} q={sp.q ?? ''} prov={sp.prov ?? ''} soloAcc={sp.solo === '1'} params={params} />
      ) : vista === 'embarques' ? (
        <ContenedoresImp c={c} />
      ) : vista === 'proyeccion' ? (
        <ProyeccionImp c={c} />
      ) : vista === 'puente' ? (
        <PuenteImp c={c} />
      ) : (
        <ResumenImp c={c} />
      )}
    </>
  );
}
```

En `components/portal/navegacion.tsx`:
1. Agregar `Ship,` a la importación de `lucide-react` (debajo de `Gauge,`).
2. En "Planear y pagar", debajo de Indicadores:
   ```tsx
         { href: '/comercializadora/importaciones', nombre: 'Importaciones', icono: Ship },
   ```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/portal/com-importaciones-pantalla.test.tsx tests/portal/navegacion.test.tsx`
Expected: PASS (13 + 4). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/importaciones.ts components/comercializadora/vistas-plan.tsx components/comercializadora/selector-escenario.tsx components/comercializadora/importaciones.tsx "app/(comercializadora)/comercializadora/importaciones/page.tsx" components/portal/navegacion.tsx tests/portal/com-importaciones-pantalla.test.tsx
git commit -m "feat(comercializadora): pantalla Importaciones con Qué pedir, contenedores, proyección y parámetros"
```

---

### Task 9: Pantalla Café

**Files:**
- Create: `lib/comercializadora/cafe.ts`
- Create: `components/comercializadora/cafe.tsx`
- Create: `app/(comercializadora)/comercializadora/cafe/page.tsx`
- Modify: `components/portal/navegacion.tsx`
- Test: `tests/portal/com-cafe-pantalla.test.tsx`

**Interfaces:**
- Consumes: `cafeMotor`, `cafeOrdenesMotor` y `motorPlan` (`motor.ts`); `cafeKgDe`, `planResumen`, `CorridaCafe` y `PlanCafe` (Tarea 4); `enlaceOc` y `ocCafe` (Tarea 5); `DescargarExcel` y `libroCafe` (Tarea 6); `ParametrosCafe`, `contextoParamsCafe`, `CAFE_ESCS` y `CAFE_PROD` (Tarea 7); `nf`, `dinero`, `pct`, `fImp`, `cuandoDe`, `Cuando`, `NavVistas`, `AvisosPlan`, `CifraPlan`, `SeccionPlan`, `TablaQuePedir`, `hrefPlan` y `SelectorEscenario` (Tarea 8); `leerTodoCom` (`consultas.ts`).
- Produces:
  - `lib/comercializadora/cafe.ts`:
    - vistas: `VISTAS_CAFE_SIMPLE`, `VISTAS_CAFE`, `vistaCafe(v, det)` y `escCafe(v)`;
    - formatos `kg(x)` y `fechaHora(iso)`;
    - `avisosCafe(c, R)` y `kpisCafe(c)`;
    - "Qué pedir": `ordDias`, `ordEsperaOC`, `ordRevisar`, `ordPorQue(r, mm, calc)`, `ordPorQueLargo(r, mm, calc)` y `ordenesCafe(c, { cuando, soloAcc })`.
  - `cafe.tsx`: `KpisCafe`, `QuePedirCafe` (props `c, cuando, soloAcc, simple, editable, mm, srvCalc, params`), `ResumenCafe`, `MensualCafe` y `PreciosCafe`.
  - Página `/comercializadora/cafe?vista=&esc=&det=&cuando=&todos=`.

- [ ] **Step 1: Prueba que falla**

Crear `tests/portal/com-cafe-pantalla.test.tsx`:

```tsx
// Plan 3e: pantalla Café (Qué pedir con el plan de abasto, proyección del año, mes por mes, precios y el puente caído).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ motor: null as unknown, db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/cafe',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  actualizarMotor: vi.fn(),
  guardarParamsImpCafe: vi.fn(),
}));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: 'edicion' }, db: m.db }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import CafePagina from '../../app/(comercializadora)/comercializadora/cafe/page';
import { QuePedirCafe } from '../../components/comercializadora/cafe';
import {
  avisosCafe,
  escCafe,
  kg,
  kpisCafe,
  ordDias,
  ordenesCafe,
  ordPorQue,
  ordPorQueLargo,
  vistaCafe,
} from '../../lib/comercializadora/cafe';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { cafeCorrer, cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const R = datosImp({ zprov: ZPROV });
const o = cafeOrdenes(R, normalizarCfgMotor({}));
const SRV = {
  ok: true,
  motivo: null,
  calc: '2026-11-13T12:30:00Z',
  pagos: [],
  sinCosto: [],
  sinProveedor: [],
  compras: [{ sku: 'INS-CAF-001', fecha_oc: '2026-11-13', cantidad: 30, monto: 14850 }],
};
const CON_CAFE = { compra: { excluir_cafe: false } }; // la simulación del servidor solo trae café si no se excluye
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...R, ...extra },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string>) =>
  render(await CafePagina({ searchParams: Promise.resolve(sp) }));

describe('lo que calcula la pantalla', () => {
  it('vistas, escenario, kilos y días', () => {
    expect([vistaCafe('precios', false), vistaCafe('precios', true), vistaCafe('x', true)]).toEqual([
      'pedir',
      'precios',
      'pedir',
    ]);
    expect([escCafe('Optimista'), escCafe('Manual')]).toEqual(['Optimista', null]);
    expect([kg(1234.4), kg(null), ordDias(400), ordDias(1), ordDias(null)]).toEqual([
      '1,234 kg',
      '—',
      'más de un año',
      '1 día',
      null,
    ]);
  });

  it('Qué pedir: conteos, kilos aproximados y grupos ordenados (primero el que pide esta semana)', () => {
    const d = ordenesCafe(o, { cuando: '', soloAcc: true });
    expect(d.d.esta.length).toBe(2);
    expect(d.kgE).toBeGreaterThan(0);
    expect(d.grupos[0].g.nEsta).toBeGreaterThan(0);
    expect(d.grupos.flatMap((x) => x.filas.map((f) => f.estado))).toContain('esta');
    expect(
      ordenesCafe(o, { cuando: 'prox', soloAcc: true }).grupos.every((x) =>
        x.filas.every((f) => f.r.calc.pedirProx > 0),
      ),
    ).toBe(true);
  });

  it('por qué: el cálculo local explica venta, cobertura y kilos; con el servidor, la regla de mínimo y máximo', () => {
    const r = o.rows.find((x) => x.calc.pedirEsta > 0 && x.sku.startsWith('INS-CAF'))!;
    expect(ordPorQue(r, null, null)).toMatch(/^Vende [\d.,]+\/día/);
    expect(ordPorQueLargo(r, null, null)).toMatch(/kg\)/);
    const s = cafeOrdenes(datosImp({ zprov: ZPROV, srv: SRV as never }), normalizarCfgMotor(CON_CAFE));
    const rs = s.rows.find((x) => x.sku === 'INS-CAF-001')!;
    expect(ordPorQue(rs, { 'INS-CAF-001': { minimo: 20, maximo: 60 } }, SRV.calc)).toContain(
      'mínimo (20), se pide hasta el máximo (60)',
    );
    expect(ordPorQue(rs, null, SRV.calc)).toContain('no está en la simulación del servidor');
  });

  it('proyección del año: cifras y avisos (mezcla que no suma 1, optimista con menos aperturas, aperturas sin leer)', () => {
    const c = cafeCorrer(R, normalizarCfgMotor({ cafe: { prod: { white_1kg: { mezcla: 0.5 } } } }));
    const k = kpisCafe(c);
    expect(k.kgComprar).toBeGreaterThan(0);
    expect(k.mesPico).toMatch(/^[A-Z]/);
    const av = avisosCafe(c, { avisos: ['aperturas'] }).join('\n');
    expect(av).toContain('La mezcla de presentaciones suma 61.4%');
    expect(av).toContain('El escenario Optimista abre menos sucursales');
    expect(av).toContain('No se pudieron leer las aperturas');
  });
});

describe('Qué pedir de café', () => {
  it('con edición: Crear OC solo en el proveedor que pide esta semana, hacia Órdenes prellenada', () => {
    render(
      <QuePedirCafe c={o} cuando="" soloAcc simple={false} editable mm={null} srvCalc={null} params={{}} />,
    );
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.length).toBe(2);
    expect(crear[0].getAttribute('href')).toMatch(/^\/comercializadora\/ordenes\?nueva=cafe&proveedor=/);
    expect(screen.getAllByText(/≈ [\d.,]+ kg/).length).toBeGreaterThan(0);
  });

  it('sin artículos de café lo dice', () => {
    const vacio = cafeOrdenes(
      datosImp({ cat: R.cat.filter((x) => !/caf/i.test(String(x.nombre))) }),
      normalizarCfgMotor({}),
    );
    render(<QuePedirCafe c={vacio} cuando="" soloAcc simple editable mm={null} srvCalc={null} params={{}} />);
    expect(screen.getByText(/No encontré artículos de café tostado/)).toBeTruthy();
  });
});

describe('página', () => {
  beforeEach(() => limpiarMotor());

  it('sin puente: muestra el error', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los pedidos del sitio viejo.' };
    await pagina({});
    expect(screen.getByRole('alert').textContent).toBe('No se pudieron leer los pedidos del sitio viejo.');
  });

  it('Qué pedir por defecto; con cantidades del servidor lee el mínimo y máximo de esos artículos (si no, no lee)', async () => {
    m.motor = listo({ srv: SRV }, CON_CAFE);
    const f = dbFalsa({ com_minmax: [{ sku: 'INS-CAF-001', minimo: 20, maximo: 60 }] });
    m.db = f.db;
    await pagina({ det: '1' });
    expect(f.consultas.map((x) => x.tabla)).toEqual(['com_minmax']);
    expect(screen.getAllByText(/mínimo \(20\), se pide hasta el máximo \(60\)/).length).toBeGreaterThan(0);
    const nav = screen.getByRole('navigation', { name: 'Vistas' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Qué pedir',
      'Proyección del año',
      'Mes por mes',
      'Presentaciones y precios',
      'Parámetros',
      'Vista simple',
    ]);
  });

  it('con café excluido de la simulación (lo normal) el Qué pedir de café es local y no lee com_minmax', async () => {
    m.motor = listo({ srv: SRV });
    const f = dbFalsa({});
    m.db = f.db;
    await pagina({});
    expect(f.consultas).toEqual([]);
  });

  it('proyección, mes por mes y precios con el escenario de la URL; parámetros abre el editor', async () => {
    m.motor = listo();
    m.db = dbFalsa({}).db;
    const a = await pagina({ vista: 'resumen', esc: 'Optimista' });
    expect((screen.getByLabelText('Escenario') as HTMLSelectElement).value).toBe('Optimista');
    expect(screen.getByText(/Café a comprar en 2027/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
    a.unmount();
    const b = await pagina({ vista: 'mensual', det: '1' });
    expect(screen.getAllByRole('row').length).toBe(14);
    b.unmount();
    const c = await pagina({ vista: 'precios', det: '1' });
    expect(screen.getByRole('heading', { name: 'Margen bruto' })).toBeTruthy();
    c.unmount();
    await pagina({ vista: 'params' });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `npx vitest run tests/portal/com-cafe-pantalla.test.tsx`
Expected: FAIL. `Failed to resolve import "../../app/(comercializadora)/comercializadora/cafe/page"`.

- [ ] **Step 3: La pantalla**

Crear `lib/comercializadora/cafe.ts`. Es `_CAFE_VISTAS_S`/`_CAFE_VISTAS` 39244, `_cafeKg` 39567, `_cafeAvisosHtml` 39576, `_cafeKpisHtml` 39589, `_planFmtFH` 34083 y las cuentas de la vista compartida "Qué pedir": `_ordDias` 39404, `_ordRevisar` 39418, `_ordRevisarCorto` 39427, `_ordPorQueSrv` 39434, `_ordPorQue` 39439, `_ordPorQueLargo` 39449, `_ordEsperaOC` 39491 y `_ordVistaHtml` 39497 con `fuente: 'cafe'` y kilos:

```ts
import {
  cafeKgDe,
  planResumen,
  type CorridaCafe,
  type PlanCafe,
} from '../../supabase/functions/_shared/planCafe.ts';
import { CAFE_ESCS } from '../../supabase/functions/_shared/impCafeCfg.ts';
import { planEngDifDias } from '../../supabase/functions/_shared/planEngine.ts';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import { dinero, fImp, nf, type Cuando } from './importaciones';

export type { CorridaCafe, PlanCafe };
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;

/** Vistas de la pantalla (_CAFE_VISTAS_S en la vista simple; _CAFE_VISTAS con "Ver todo"). */
export const VISTAS_CAFE_SIMPLE: [string, string][] = [
  ['pedir', 'Qué pedir'],
  ['resumen', 'Proyección del año'],
  ['params', 'Parámetros'],
];
export const VISTAS_CAFE: [string, string][] = [
  ['pedir', 'Qué pedir'],
  ['resumen', 'Proyección del año'],
  ['mensual', 'Mes por mes'],
  ['precios', 'Presentaciones y precios'],
  ['params', 'Parámetros'],
];
export const vistaCafe = (v: string | undefined, det: boolean) =>
  (det ? VISTAS_CAFE : VISTAS_CAFE_SIMPLE).some((x) => x[0] === v) ? (v as string) : 'pedir';
export const escCafe = (v: string | undefined) => (CAFE_ESCS.includes(v ?? '') ? (v as string) : null);
/** _cafeKg. */
export const kg = (x: number | null | undefined) => (x == null || !isFinite(x) ? '—' : `${nf(x)} kg`);
const fmtFH = new Intl.DateTimeFormat('es-MX', {
  timeZone: 'America/Mexico_City',
  day: '2-digit',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});
/** _planFmtFH: fecha y hora de CDMX de un timestamp de la base. */
export const fechaHora = (iso: string | null | undefined) => {
  if (!iso) return '—';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? String(iso).slice(0, 16).replace('T', ' ') : fmtFH.format(d);
};

/** _cafeAvisosHtml, en texto. */
export function avisosCafe(c: CorridaCafe, R: Pick<DatosPlan, 'avisos'>): string[] {
  const av: string[] = [],
    cc = c.cfg.cafe,
    red = c.ent.red;
  if (red.activas === 0 && cc.q4_modo === 'auto')
    av.push(
      'No hay sucursales activas visibles para tu usuario: el arranque del año sale en 0. Revisa tus permisos de Aperturas o captura el arranque a mano en Parámetros.',
    );
  const sum = Object.keys(cc.prod).reduce((s, k) => s + cc.prod[k].mezcla, 0);
  if (Math.abs(sum - 1) > 0.0005)
    av.push(
      `La mezcla de presentaciones suma ${Math.round(sum * 1000) / 10}% y no 100%: los kg por presentación no suman el total.`,
    );
  const e = cc.escenarios,
    s = (a: number[]) => a.reduce((x, y) => x + y, 0);
  if (s(e.Optimista.aper) < s(e.Base.aper))
    av.push(
      `El escenario Optimista abre menos sucursales en el año (${s(e.Optimista.aper)}) que el Base (${s(e.Base.aper)}): así venía en tu hoja, revísalo.`,
    );
  if (cc.q4_modo === 'auto' && red.ini - 3 * red.a0 < 0)
    av.push(
      'Con el arranque calculado hay menos sucursales maduras que aperturas del último trimestre: revisa las fechas de apertura.',
    );
  if (R.avisos && R.avisos.indexOf('aperturas') >= 0)
    av.push('No se pudieron leer las aperturas: el arranque del año puede estar incompleto.');
  return av;
}

/** _cafeKpisHtml. */
export function kpisCafe(c: CorridaCafe) {
  const R = c.R,
    cr = R.calculadora.resumen,
    dm = R.detalleMensual.kgComprar.mes;
  let pico = 0,
    ip = 0;
  for (let i = 0; i < 12; i++)
    if (dm[i] > pico) {
      pico = dm[i];
      ip = i;
    }
  return {
    kgComprar: cr.kgComprar as number,
    crecimiento: cr.crecimientoVs2026 as number,
    rango: String(R.timeline.rangoTexto),
    comprometer: cr.volumenComprometerKg as number,
    pico,
    mesPico: R.etiquetasMes[ip] as string,
    ahorro: cr.ahorro as number,
    ahorroPct: cr.ahorroPct as number,
    sucursalesCierre: cr.sucursalesCierre as number,
  };
}

// ── "Qué pedir" de café (_ordVistaHtml con fuente 'cafe' y kilos) ──

/** _ordDias. */
export const ordDias = (x: number | null | undefined) =>
  x === null || x === undefined || !isFinite(x)
    ? null
    : x > 365
      ? 'más de un año'
      : `${nf(x)} ${Math.round(x) === 1 ? 'día' : 'días'}`;
/** _ordEsperaOC: "ESPERAR OC" es una regla del cálculo local. */
export const ordEsperaOC = (k: X) => !!(k && k.bloqueado && k.fuente !== 'servidor');
/** _ordRevisar: parece cubierto pero solo por OCs viejas o por inventario negativo. */
export function ordRevisar(r: X): string {
  const k = r.calc,
    s = r.s;
  if (k.pedirEsta > 0 || k.pedirProx > 0 || k.bloqueado) return '';
  const m: string[] = [];
  if (r.stale > 0 && k.disponible - r.stale < k.necesito - 1e-9)
    m.push(`depende de ${nf(r.stale)} uds. de OCs viejas que nunca se marcaron como recibidas`);
  if (s.inv < 0)
    m.push(`el inventario de la plataforma está en negativo (${nf(s.inv)}): el real está en Zoho`);
  return m.join(' y ');
}
function ordRevisarCorto(r: X): string {
  const k = r.calc,
    s = r.s,
    m: string[] = [];
  if (r.stale > 0 && k.disponible - r.stale < k.necesito - 1e-9) m.push('OCs viejas');
  if (s.inv < 0) m.push('inventario negativo');
  return m.join(' e ');
}
type MinMaxSrv = Record<string, { minimo: number | null; maximo: number | null }> | null;
function ordPorQueSrv(r: X, mm: MinMaxSrv, calc: string | null): string {
  const m = mm && mm[r.sku];
  if (!m)
    return 'Este artículo no está en la simulación del servidor (no es Compra Recurrente o le falta proveedor o costo en Zoho).';
  return `Regla de compra: cuando lo que tienes más lo que viene en camino llega al mínimo (${nf(Number(m.minimo))}), se pide hasta el máximo (${nf(Number(m.maximo))}). Simulación del servidor del ${fechaHora(calc)}.`;
}
const d1 = (x: number) => nf(x, x < 10 ? 1 : 0);
/** _ordPorQue (la frase corta de la tabla). */
export function ordPorQue(r: X, mm: MinMaxSrv, calc: string | null): string {
  if (r.calc && r.calc.fuente === 'servidor') return ordPorQueSrv(r, mm, calc);
  const k = r.calc;
  const vta = k.consumo > 0 ? `Vende ${d1(k.consumo)}/día` : 'Sin ventas recientes';
  const ap = k.paraAper > 0 ? ` + ${nf(k.paraAper)} por aperturas` : '';
  if (k.pedirEsta <= 0 && k.pedirProx <= 0 && !k.bloqueado) {
    const rc = ordRevisarCorto(r);
    if (rc) return `Revisar datos: depende de ${rc}`;
  }
  if (k.bloqueado) return `${vta}${ap} · ya viene una OC`;
  return `${vta}${ap} · cubre ${nf(k.diasCubrir)} días`;
}
/** _ordPorQueLargo (el globo de ayuda), con kilos aproximados. */
export function ordPorQueLargo(r: X, mm: MinMaxSrv, calc: string | null): string {
  if (r.calc && r.calc.fuente === 'servidor') return ordPorQueSrv(r, mm, calc);
  const k = r.calc,
    s = r.s,
    falta = Math.max(0, k.necesito - k.disponible);
  const hoy = ordDias(k.diasHoy),
    conOC = ordDias(k.diasAlcanza),
    kgm = cafeKgDe(r.nombre);
  const vta =
    k.consumo > 0
      ? `Vendes ${d1(k.consumo)} al día (${d1(k.consumo * 7)} a la semana, ${d1(k.consumo * 30)} al mes${kgm ? ` ≈ ${nf(k.consumo * 30 * kgm)} kg` : ''})`
      : 'Sin ventas recientes';
  const ap = k.paraAper > 0 ? ` y las próximas aperturas suman ${nf(k.paraAper)}` : '';
  const form = `Cubrir ${nf(k.diasCubrir)} días (proveedor ${s.lt} + ${nf(s.dm)} de seguridad) pide ${nf(k.necesito)}; hay ${nf(k.disponible, 1)}${falta > 0 ? `: faltan ${nf(falta)}.` : ': alcanza.'}`;
  const rev = ordRevisar(r);
  let t: string;
  if (k.pedirEsta > 0)
    t = `${vta}${ap}. ${form}${k.diasHoy === null ? '' : k.diasHoy < 1 ? ' Hoy ya no alcanza.' : ` Hoy alcanza para ${hoy}.`}`;
  else if (k.pedirProx > 0)
    t = `${vta}${ap}. ${form} ${s.enOC > 0 && conOC ? `Con lo que tienes y lo que viene alcanza para ${conOC}` : hoy && k.diasHoy >= 1 ? `Hoy alcanza para ${hoy}` : 'Hoy casi no alcanza'}, pero la próxima semana ya no: entonces pedir ${nf(k.pedirProx)}.`;
  else if (k.bloqueado)
    t = `${vta}${ap}. ${form} Ya viene una OC con ${nf(s.enOC, 1)}: esperar a que llegue.`;
  else if (rev)
    t = `${vta}${ap}. ${form} Revisar datos: ${rev}. Pon al día las OCs y el inventario con Zoho para saber si de verdad hay que pedir.`;
  else t = `${vta}${ap}. ${form}${conOC ? ` Alcanza para ${conOC}.` : ''}`;
  if (s.inv < 0 && !rev) t += ` Inventario negativo en la plataforma (${nf(s.inv)}): el real está en Zoho.`;
  return t;
}

/** _ordVistaHtml (café): KPIs, semáforo y los grupos por proveedor con sus filas, en el orden del viejo. */
export function ordenesCafe(c: PlanCafe, f: { cuando: Cuando; soloAcc: boolean }) {
  const d = planResumen(c);
  let kgE = 0,
    kgP = 0;
  d.esta.forEach((r: X) => {
    const k = cafeKgDe(r.nombre);
    if (k) kgE += r.calc.pedirEsta * k;
  });
  d.prox.forEach((r: X) => {
    const k = cafeKgDe(r.nombre);
    if (k) kgP += r.calc.pedirProx * k;
  });
  const n = { esta: 0, prox: 0, wait: 0, ok: 0, rev: 0 };
  c.rows
    .filter((r) => !r.sinMov && !r.importacion)
    .forEach((r) => {
      const k = r.calc;
      if (k.pedirEsta > 0) n.esta++;
      else if (k.pedirProx > 0) n.prox++;
      else if (ordEsperaOC(k)) n.wait++;
      else if (ordRevisar(r)) n.rev++;
      else n.ok++;
    });
  const filt = (r: X) => {
    const k = r.calc;
    if (r.sinMov) return false;
    if (f.cuando === 'esta') return k.pedirEsta > 0;
    if (f.cuando === 'prox') return k.pedirProx > 0;
    return (
      !f.soloAcc ||
      k.pedirEsta > 0 ||
      k.pedirProx > 0 ||
      k.urgencia !== 'Normal' ||
      k.bloqueado ||
      !!ordRevisar(r)
    );
  };
  const rango = (r: X) => (r.calc.pedirEsta > 0 ? 0 : r.calc.pedirProx > 0 ? 1 : ordEsperaOC(r.calc) ? 2 : 3);
  const grupos = c.provs
    .slice()
    .sort(
      (a, b) =>
        Number(b.nEsta > 0) - Number(a.nEsta > 0) ||
        b.montoEsta - a.montoEsta ||
        Number(b.nProx > 0) - Number(a.nProx > 0) ||
        String(a.nombre).localeCompare(String(b.nombre)),
    )
    .map((g) => ({
      g,
      filas: g.rows
        .filter(filt)
        .sort(
          (a: X, b: X) =>
            rango(a) - rango(b) ||
            (a.calc.diasHoy === null ? 1e9 : a.calc.diasHoy) -
              (b.calc.diasHoy === null ? 1e9 : b.calc.diasHoy),
        )
        .map((r: X) => {
          const k = r.calc,
            s = r.s,
            kgu = cafeKgDe(r.nombre);
          const qp = k.pedirEsta > 0 ? k.pedirEsta : k.pedirProx > 0 ? k.pedirProx : 0;
          const tot = qp > 0 ? k.disponible + qp : null;
          const dH = k.diasHoy,
            dL = r.llegaOC ? planEngDifDias(r.llegaOC, c.hoyIso) : null;
          return {
            r,
            kgu,
            estado: (k.pedirEsta > 0
              ? 'esta'
              : k.pedirProx > 0
                ? 'prox'
                : ordEsperaOC(k)
                  ? 'espera'
                  : ordRevisar(r)
                    ? 'revisar'
                    : 'cubierto') as 'esta' | 'prox' | 'espera' | 'revisar' | 'cubierto',
            quedas: tot,
            diasQuedas: tot !== null && k.consumo > 0 ? tot / k.consumo : null,
            dias: dH === null ? null : dH < 1 ? 'menos de 1 día' : ordDias(dH),
            riesgo: dH !== null && dH < 5 && !(s.enOC > 0 && dL !== null && dL >= 0 && dL <= dH + 0.5),
            llega:
              r.llegaOC && s.enOC > 0 ? fImp(r.llegaOC) + (dL !== null && dL < 0 ? ', atrasada' : '') : null,
          };
        }),
    }))
    .filter((x) => x.filas.length);
  return { d, kgE, kgP, n, grupos };
}
export { dinero };
```

Crear `components/comercializadora/cafe.tsx` (`_cafeKpisHtml`, `_ordBarraHtml` 39406, `_cafeVistaPedir` 39555, `_cafeGrafica` 39599, `_cafeVistaResumen` 39617, `_cafeVistaMensual` 39626 y `_cafeVistaPrecios` 39636):

```tsx
import Link from 'next/link';
import { Pill } from '@/components/portal/piezas';
import {
  kg,
  kpisCafe,
  ordenesCafe,
  ordPorQue,
  ordPorQueLargo,
  ordRevisar,
  type CorridaCafe,
  type PlanCafe,
} from '@/lib/comercializadora/cafe';
import { dinero, nf, pct, type Cuando } from '@/lib/comercializadora/importaciones';
import { enlaceOc, ocCafe } from '@/lib/comercializadora/crearOc';
import { CAFE_PROD } from '@/lib/comercializadora/paramsImpCafe';
import { CifraPlan, hrefPlan, SeccionPlan, TablaQuePedir, type GrupoQuePedir } from './vistas-plan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const RUTA = '/comercializadora/cafe';
const der = 'text-right tabular-nums';
const GRUPOS = ['White', 'Kraft', 'Black'];

/** _cafeKpisHtml. */
export function KpisCafe({ c }: { c: CorridaCafe }) {
  const k = kpisCafe(c),
    cc = c.cfg.cafe;
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta={`Café a comprar en ${cc.anio}`}
        valor={kg(k.kgComprar)}
        nota={`${k.crecimiento >= 0 ? '+' : ''}${Math.round(k.crecimiento * 1000) / 10}% vs ${nf(cc.compra_ant)} kg de ${cc.anio - 1}`}
        ayuda={`Escenario ${c.esc}. Rango de escenarios: ${k.rango}`}
      />
      <CifraPlan etiqueta="Rango de escenarios" valor={k.rango} nota="Pesimista – Optimista" />
      <CifraPlan
        etiqueta="Volumen a comprometer"
        valor={kg(k.comprometer)}
        nota={`${Math.round(cc.comprometer * 100)}% del pronóstico`}
      />
      <CifraPlan etiqueta="Mes más alto" valor={kg(k.pico)} nota={k.mesPico} tono="bajo" />
      <CifraPlan
        etiqueta="Ahorro con precios nuevos"
        valor={dinero(k.ahorro)}
        nota={`${Math.round(k.ahorroPct * 1000) / 10}% del costo vigente`}
        tono="ok"
      />
      <CifraPlan
        etiqueta="Sucursales al cierre"
        valor={nf(k.sucursalesCierre)}
        nota={`Operando en diciembre de ${cc.anio}`}
      />
    </div>
  );
}

/** _ordBarraHtml: lo que tienes, lo que viene y lo que falta para cubrir la necesidad. */
function BarraInventario({
  inv,
  oc,
  nec,
  vieja,
  borr,
  info,
}: {
  inv: number;
  oc: number;
  nec: number;
  vieja: number;
  borr: number;
  info: X;
}) {
  const I = Math.max(0, inv),
    T = Math.max(0, oc),
    N = Math.max(0, nec),
    D = I + T,
    F = Math.max(0, N - D),
    escala = Math.max(N, D, 1e-9);
  const p = (x: number) => `${Math.round((x / escala) * 1000) / 10}%`,
    u = (x: number) => nf(x, x < 10 && x % 1 ? 1 : 0);
  return (
    <>
      <div
        className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2"
        title={`Tienes ${u(inv)} · en camino ${u(T)} · necesitas ${u(N)}`}
      >
        {I > 0 ? <i className="bg-ok" style={{ width: p(I) }} /> : null}
        {T > 0 ? <i className="bg-crema" style={{ width: p(T) }} /> : null}
        {F > 0 ? <i className="bg-bad" style={{ width: p(F) }} /> : null}
        {D > N && N > 0 ? (
          <span
            className="absolute top-0 h-full w-0.5 bg-ink"
            style={{ left: p(N) }}
            title="Lo que necesitas"
          />
        ) : null}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
        <span>
          Tienes <b className={inv < 0 ? 'text-bad' : ''}>{inv < 0 ? u(inv) : u(I)}</b>
        </span>
        <span>
          En camino <b>{u(T)}</b>
          {info.llega ? <span className="text-muted-foreground"> (llega {info.llega})</span> : null}
          {vieja > 0 ? <span className="text-warn"> · vieja</span> : null}
          {borr > 0 ? <span className="text-warn"> · {u(borr)} en borrador</span> : null}
        </span>
        {info.dias ? (
          <span>
            Alcanza <b className={info.riesgo ? 'text-bad' : ''}>{info.dias}</b>
          </span>
        ) : null}
      </p>
    </>
  );
}

/** _cafeVistaPedir / _ordVistaHtml: el plan de abasto solo con café, por proveedor, con kilos y Crear OC. */
export function QuePedirCafe(p: {
  c: PlanCafe;
  cuando: Cuando;
  soloAcc: boolean;
  simple: boolean;
  editable: boolean;
  mm: Record<string, { minimo: number | null; maximo: number | null }> | null;
  srvCalc: string | null;
  params: Record<string, string | undefined>;
}) {
  const { c, simple } = p;
  if (!c.rows.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No encontré artículos de café tostado en el catálogo (busco nombres con &quot;café tostado&quot; o SKU
        que empiecen con INS-CAF-).
      </p>
    );
  const o = ordenesCafe(c, { cuando: p.cuando, soloAcc: p.soloAcc });
  const calc = p.srvCalc;
  const grupos: GrupoQuePedir[] = o.grupos.map(({ g, filas }) => {
    const oc = g.real && g.nEsta > 0 && p.editable ? ocCafe(c, g.key) : null;
    return {
      clave: g.key,
      nombre: g.nombre,
      chips: [
        ...(g.nEsta > 0
          ? [{ texto: `ESTA SEMANA · ${g.nEsta} art. · ${dinero(g.montoEsta)}`, estado: 'pierde' as const }]
          : []),
        ...(g.nProx > 0
          ? [{ texto: `PRÓXIMA · ${g.nProx} art. · ${dinero(g.montoProx)}`, estado: 'bajo' as const }]
          : []),
      ],
      accion: !g.real ? (
        <span className="text-xs text-warn">
          Sin proveedor asignado: asígnalo en el catálogo para crear la OC
        </span>
      ) : oc && !('error' in oc) ? (
        <Link
          href={enlaceOc(oc)}
          className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
        >
          Crear OC
        </Link>
      ) : null,
      filas: filas.map((f) => {
        const r = f.r,
          k = r.calc,
          kgT = (q: number) => (f.kgu && q > 0 ? ` · ≈ ${nf(q * f.kgu, 1)} kg` : '');
        const largo = ordPorQueLargo(r, p.mm, calc);
        return {
          clave: r.sku,
          nombre: r.nombre,
          sku: r.sku,
          visual: (
            <BarraInventario
              inv={k.invBase}
              oc={r.s.enOC}
              nec={k.necesito}
              vieja={r.stale}
              borr={r.borr}
              info={f}
            />
          ),
          pedir: (
            <div>
              {f.estado === 'esta' ? (
                <>
                  <p className="font-display text-lg font-bold tabular-nums">{nf(k.pedirEsta)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.montoEsta > 0 ? dinero(r.montoEsta) : 'sin costo'}
                    {kgT(k.pedirEsta)}
                  </p>
                  <Pill estado="pierde">ESTA SEMANA</Pill>
                  {k.pedirProx > 0 ? (
                    <p className="mt-1 text-xs">
                      y la próxima: <b>{nf(k.pedirProx)}</b>
                    </p>
                  ) : null}
                </>
              ) : f.estado === 'prox' ? (
                <>
                  <p className="font-display text-lg font-bold tabular-nums text-warn">{nf(k.pedirProx)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.montoProx > 0 ? dinero(r.montoProx) : 'sin costo'}
                    {kgT(k.pedirProx)}
                  </p>
                  <Pill estado="bajo">PRÓXIMA SEMANA</Pill>
                </>
              ) : f.estado === 'espera' ? (
                <Pill estado="neutro">ESPERAR OC</Pill>
              ) : f.estado === 'revisar' ? (
                <span title={`Parece cubierto, pero ${ordRevisar(r)}`}>
                  <Pill estado="bajo">REVISAR DATOS</Pill>
                </span>
              ) : (
                <Pill estado="ok">CUBIERTO</Pill>
              )}
              {k.fuente === 'local-sin-datos' ? (
                <p className="mt-1">
                  <Pill estado="bajo">REVISAR DATOS: falta proveedor o costo en Zoho</Pill>
                </p>
              ) : null}
            </div>
          ),
          quedas:
            f.quedas !== null ? (
              <div>
                <p className="font-semibold tabular-nums">{nf(f.quedas)}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    f.diasQuedas !== null ? `${nf(f.diasQuedas)} días` : '',
                    f.kgu && f.quedas > 0 ? `≈ ${nf(f.quedas * f.kgu, 1)} kg` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          porQue: ordPorQue(r, p.mm, calc),
          ayuda: largo,
          tono: (f.estado === 'esta'
            ? 'esta'
            : f.estado === 'prox'
              ? 'prox'
              : f.estado === 'espera'
                ? 'espera'
                : '') as GrupoQuePedir['filas'][number]['tono'],
        };
      }),
    };
  });
  const n = o.n,
    total = n.esta + n.prox + n.wait + n.ok + n.rev;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <CifraPlan
          etiqueta="Pedir esta semana"
          valor={`${o.d.esta.length} ${o.d.esta.length === 1 ? 'artículo' : 'artículos'}`}
          nota={`${dinero(o.d.montoEsta)}${o.kgE > 0 ? ` · ≈ ${nf(o.kgE)} kg` : ''}${o.d.sinCostoE ? ` · ${o.d.sinCostoE} sin costo` : ''}`}
          tono="pierde"
        />
        <CifraPlan
          etiqueta="Pedir la próxima semana"
          valor={`${o.d.prox.length} ${o.d.prox.length === 1 ? 'artículo' : 'artículos'}`}
          nota={`${dinero(o.d.montoProx)}${o.kgP > 0 ? ` · ≈ ${nf(o.kgP)} kg` : ''}`}
          tono="bajo"
        />
        {simple ? null : (
          <>
            <CifraPlan
              etiqueta="Urgentes"
              valor={o.d.urg}
              nota="menos de 5 días de inventario"
              tono="pierde"
            />
            <CifraPlan
              etiqueta="Cubiertos"
              valor={n.ok}
              nota={`no hay que pedir todavía${n.rev ? ` · ${n.rev} por revisar datos` : ''}`}
              tono="ok"
            />
          </>
        )}
      </div>
      {simple || !total ? null : (
        <p className="mb-4 text-xs text-ink-2">
          <b>{n.esta}</b> pedir esta semana · <b>{n.prox}</b> la próxima · <b>{n.wait}</b> esperando OC
          {n.rev ? (
            <>
              {' '}
              · <b>{n.rev}</b> por revisar datos
            </>
          ) : null}{' '}
          · <b>{n.ok}</b> cubiertos
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['esta', `Esta semana (${o.d.esta.length})`],
            ['prox', `Próxima semana (${o.d.prox.length})`],
          ] as const
        ).map(([k, t]) => (
          <Link
            key={k}
            href={hrefPlan(RUTA, p.params, { cuando: p.cuando === k ? undefined : k })}
            aria-current={p.cuando === k ? 'true' : undefined}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.cuando === k ? 'border-ink font-bold' : 'border-line'}`}
          >
            {t}
          </Link>
        ))}
        {simple || p.cuando ? null : (
          <Link
            href={hrefPlan(RUTA, p.params, { todos: p.soloAcc ? '1' : undefined })}
            className="text-sm underline"
          >
            {p.soloAcc ? 'Ver todos los artículos' : 'Solo los que requieren acción'}
          </Link>
        )}
      </div>
      <TablaQuePedir
        grupos={grupos}
        simple={simple}
        columnaVisual="Inventario"
        vacio={
          p.cuando === 'esta'
            ? 'Nada que pedir esta semana.'
            : p.cuando === 'prox'
              ? 'Nada que pedir la próxima semana.'
              : 'Nada que pedir esta semana ni la próxima: el café está cubierto.'
        }
      />
      {simple ? null : (
        <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
          Calculado con el mismo cálculo del plan de abasto: consumo de los últimos {c.cfg.consumo.ventana}{' '}
          días, inventario disponible, OCs abiertas, lead time y {c.cfg.seg.dias} días de seguridad (se
          cambian en Configuración). Necesitas = venta diaria × (entrega del proveedor + seguridad) +
          aperturas.
        </p>
      )}
    </div>
  );
}

/** _cafeGrafica: kg por mes del escenario Base, con el mínimo y el máximo. */
function GraficaCafe({ R }: { R: X }) {
  const tl = R.timeline,
    mn = tl.total.min.mes,
    es = tl.total.esperado.mes,
    mx = tl.total.max.mes,
    lab = R.etiquetasMes,
    n = 12,
    Wd = 900,
    Hd = 240,
    ml = 52,
    mr = 10,
    mt = 14,
    mb = 34,
    bw = (Wd - ml - mr) / n,
    ph = Hd - mt - mb;
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, mn[i], es[i], mx[i]);
  if (top <= 0) top = 1;
  const y = (v: number) => mt + ph - (v / top) * ph;
  const linea = (arr: number[]) => arr.map((v, j) => `${ml + j * bw + bw / 2},${y(v)}`).join(' ');
  return (
    <div>
      <p className="mb-1 flex flex-wrap gap-4 text-xs text-ink-2">
        <span className="text-crema-strong">— Esperado (Base)</span>
        <span>- - Mínimo (Pesimista) y máximo (Optimista)</span>
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="Kg de café por mes"
          className="block h-auto w-full min-w-[620px]"
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(top * f)}
                y2={y(top * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(top * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {nf(top * f)}
              </text>
            </g>
          ))}
          {es.map((v: number, i: number) => (
            <g key={i}>
              <rect
                x={ml + i * bw + bw * 0.2}
                y={mt + ph - Math.max(0, (v / top) * ph)}
                width={bw * 0.6}
                height={Math.max(0, (v / top) * ph)}
                rx="2"
                style={{ fill: 'var(--color-crema-soft)' }}
              >
                <title>{`${lab[i]}: ${nf(v)} kg (esperado) · mín ${nf(mn[i])} · máx ${nf(mx[i])}`}</title>
              </rect>
              <text
                x={ml + i * bw + bw / 2}
                y={Hd - 18}
                textAnchor="middle"
                fontSize="9.5"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {lab[i]}
              </text>
            </g>
          ))}
          <polyline
            points={linea(mn)}
            fill="none"
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <polyline
            points={linea(mx)}
            fill="none"
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <polyline
            points={linea(es)}
            fill="none"
            style={{ stroke: 'var(--color-crema-strong)' }}
            strokeWidth="2.5"
          />
        </svg>
      </div>
    </div>
  );
}

/** _cafeVistaResumen: gráfica del año, de dónde sale el volumen y el arranque del año. */
export function ResumenCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    cr = R.calculadora,
    cc = c.cfg.cafe,
    red = c.ent.red;
  return (
    <>
      <SeccionPlan
        titulo="Café mes por mes"
        ayuda={`La compra de café de ${cc.anio} en los tres escenarios. Cada sucursal compra según los meses que lleva abierta (el mes de apertura incluye el inventario inicial), la estacionalidad del mes y el crecimiento por posicionamiento.`}
      >
        <GraficaCafe R={R} />
      </SeccionPlan>
      <SeccionPlan titulo="De dónde sale el volumen" ayuda={`Con el escenario ${c.esc}.`}>
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="text-right">Kg</th>
                <th className="text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {cr.origenVolumen.filas.map((f: X) => (
                <tr key={f.concepto}>
                  <td>{f.concepto}</td>
                  <td className={der}>{kg(f.kg)}</td>
                  <td className={der}>{pct(f.pct, 1)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td>
                <td className={der}>{kg(cr.origenVolumen.total.kg)}</td>
                <td className={der}>{pct(cr.origenVolumen.total.pct, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Arranque del año">
        <p className="text-sm text-ink-2">
          {cc.q4_modo === 'auto'
            ? `El arranque del año sale de la plataforma: ${red.ini} sucursales operando (o por abrir antes del 1 de enero) y ${red.a0} aperturas al mes en octubre, noviembre y diciembre (${red.q4.join(' + ')} registradas por mes de apertura). Hoy operan ${red.activas}.`
            : `El arranque del año está capturado a mano en Parámetros (${nf(cc.escenarios[c.esc].ini)} sucursales al 1 de enero).`}
        </p>
      </SeccionPlan>
    </>
  );
}

/** _cafeVistaMensual. */
export function MensualCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    tl = R.timeline,
    lab = R.etiquetasMes,
    dm = R.detalleMensual;
  return (
    <SeccionPlan
      titulo="Kilos de café por mes"
      ayuda='Kg de café tostado por color. "Esperado", "Mínimo" y "Máximo" son los escenarios Base, Pesimista y Optimista. "A comprar" es el escenario activo con el ajuste general aplicado.'
    >
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              {GRUPOS.map((g) => (
                <th key={g} className="text-right">
                  {g} (esperado)
                </th>
              ))}
              <th className="text-right">Total esperado</th>
              <th className="text-right">Mínimo</th>
              <th className="text-right">Máximo</th>
              <th className="text-right">A comprar (escenario {c.esc})</th>
              <th className="text-right">Sucursales (cierre)</th>
              <th className="text-right">Kg por sucursal</th>
            </tr>
          </thead>
          <tbody>
            {lab.map((l: string, i: number) => (
              <tr key={l}>
                <td className="font-semibold">{l}</td>
                {GRUPOS.map((g) => (
                  <td key={g} className={der}>
                    {nf(tl.grupos[g].esperado.mes[i])}
                  </td>
                ))}
                <td className={der}>
                  <b>{nf(tl.total.esperado.mes[i])}</b>
                </td>
                <td className={der}>{nf(tl.total.min.mes[i])}</td>
                <td className={der}>{nf(tl.total.max.mes[i])}</td>
                <td className={der}>
                  <b>{nf(dm.kgComprar.mes[i])}</b>
                </td>
                <td className={der}>{nf(dm.sucursalesActivas[i])}</td>
                <td className={der}>{nf(dm.kgPorSucursal[i], 1)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td>Total</td>
              {GRUPOS.map((g) => (
                <td key={g} className={der}>
                  {nf(tl.grupos[g].esperado.total)}
                </td>
              ))}
              <td className={der}>{nf(tl.total.esperado.total)}</td>
              <td className={der}>{nf(tl.total.min.total)}</td>
              <td className={der}>{nf(tl.total.max.total)}</td>
              <td className={der}>{nf(dm.kgComprar.total)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _cafeVistaPrecios: compra por presentación, margen bruto, precios por bolsa y ahorro mes por mes. */
export function PreciosCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    cp = R.comparativa,
    pv = R.precios,
    mb = cp.margenBruto;
  const nom: Record<string, string> = {};
  CAFE_PROD.forEach((x) => (nom[x.id] = x.nombre));
  return (
    <>
      <SeccionPlan
        titulo="Compra por presentación"
        ayuda="Bolsas, kilos y costo de compra del año con el precio vigente y con el precio nuevo. La venta a sucursales no cambia con el precio nuevo: el ahorro cae completo al margen."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Bolsas</th>
                <th className="text-right">Kg</th>
                <th className="text-right">Costo vigente</th>
                <th className="text-right">Costo nuevo</th>
                <th className="text-right">Ahorro</th>
                <th className="text-right">Ahorro %</th>
              </tr>
            </thead>
            <tbody>
              {[...cp.porPresentacion, { ...cp.total, id: 'Total' }].map((f: X) => (
                <tr key={f.id} className={f.id === 'Total' ? 'font-bold' : ''}>
                  <td className="font-semibold">{nom[f.id] || f.id}</td>
                  <td className={der}>{nf(f.bolsas)}</td>
                  <td className={der}>{nf(f.kg)}</td>
                  <td className={der}>{dinero(f.costoVigente)}</td>
                  <td className={der}>{dinero(f.costoNuevo)}</td>
                  <td className={der}>{dinero(f.ahorro)}</td>
                  <td className={der}>{pct(f.ahorroPct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Margen bruto">
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th />
                <th className="text-right">Precio vigente</th>
                <th className="text-right">Precio nuevo</th>
                <th className="text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Venta a sucursales', mb.ventaSucursales],
                  ['Costo de compra', mb.costoCompra],
                  ['Margen bruto', mb.margenBruto],
                ] as const
              ).map(([t, v]) => (
                <tr key={t}>
                  <td>{t}</td>
                  <td className={der}>{dinero(v.vigente)}</td>
                  <td className={der}>{dinero(v.nuevo)}</td>
                  <td className={der}>{dinero(v.diferencia)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Margen %</td>
                <td className={der}>{pct(mb.margenPct.vigente, 1)}</td>
                <td className={der}>{pct(mb.margenPct.nuevo, 1)}</td>
                <td className={der}>{pct(mb.margenPct.diferencia, 1)} pts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan
        titulo="Precios por bolsa"
        ayuda="Costo de cada bolsa: el café por el peso de la bolsa más el empaque. Margen sobre el precio de venta a sucursal."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Café $/kg</th>
                <th className="text-right">Empaque</th>
                <th className="text-right">Costo bolsa</th>
                <th className="text-right">Precio de venta</th>
                <th className="text-right">Margen</th>
                <th className="text-right">Café nuevo $/kg</th>
                <th className="text-right">Costo bolsa nuevo</th>
                <th className="text-right">Ahorro por bolsa</th>
                <th className="text-right">Ahorro %</th>
              </tr>
            </thead>
            <tbody>
              {pv.vigentes.map((v: X, i: number) => {
                const nn = pv.nuevos[i];
                return (
                  <tr key={v.id}>
                    <td className="font-semibold">{nom[v.id] || v.id}</td>
                    <td className={der}>{dinero(v.precioKg)}</td>
                    <td className={der}>{nf(v.empaque, 2)}</td>
                    <td className={der}>{nf(v.costoBolsa, 2)}</td>
                    <td className={der}>{nf(v.precioVentaBolsa, 2)}</td>
                    <td className={der}>{pct(v.margen, 1)}</td>
                    <td className={der}>{dinero(nn.precioKgEfectivo)}</td>
                    <td className={der}>{nf(nn.costoBolsa, 2)}</td>
                    <td className={der}>{nf(nn.ahorroBolsa, 2)}</td>
                    <td className={der}>{pct(nn.ahorroPct, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Ahorro mes por mes">
        <div className="overflow-x-auto">
          <table className="tabla max-w-2xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Costo vigente</th>
                <th className="text-right">Costo nuevo</th>
                <th className="text-right">Ahorro</th>
                <th className="text-right">Ahorro acumulado</th>
              </tr>
            </thead>
            <tbody>
              {cp.mensual.map((m: X) => (
                <tr key={m.etiqueta}>
                  <td className="font-semibold">{m.etiqueta}</td>
                  <td className={der}>{dinero(m.costoVigente)}</td>
                  <td className={der}>{dinero(m.costoNuevo)}</td>
                  <td className={der}>{dinero(m.ahorro)}</td>
                  <td className={der}>{dinero(m.ahorroAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}
```

Crear `app/(comercializadora)/comercializadora/cafe/page.tsx` (`renderComCafe` 39779, `_cafePintar` 39716 y `_cafeVistaHtml` 39708; el `R.mm` del viejo, 33222, solo para las filas con cantidades del servidor):

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SelectorEscenario } from '@/components/comercializadora/selector-escenario';
import { ParametrosCafe } from '@/components/comercializadora/parametros-imp-cafe';
import { AvisosPlan, NavVistas } from '@/components/comercializadora/vistas-plan';
import {
  KpisCafe,
  MensualCafe,
  PreciosCafe,
  QuePedirCafe,
  ResumenCafe,
} from '@/components/comercializadora/cafe';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { cafeMotor, cafeOrdenesMotor, motorPlan } from '@/lib/comercializadora/motor';
import { avisosCafe, escCafe, VISTAS_CAFE, VISTAS_CAFE_SIMPLE, vistaCafe } from '@/lib/comercializadora/cafe';
import { cuandoDe, nf } from '@/lib/comercializadora/importaciones';
import { libroCafe } from '@/lib/comercializadora/excelImpCafe';
import { contextoParamsCafe } from '@/lib/comercializadora/paramsContexto';
import { CAFE_ESCS } from '@/lib/comercializadora/paramsImpCafe';

type Sp = Record<string, string | undefined>;

/** Café (renderComCafe): Qué pedir con el plan de abasto y la proyección del año con el modelo de la Sheet de café. */
export default async function CafePagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1';
  const vista = vistaCafe(sp.vista, det);
  const esc = escCafe(sp.esc);
  const params: Sp = { vista, esc: esc ?? undefined, det: det ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Café"
      descripcion="Qué pedir de café tostado con el mismo cálculo del plan de abasto, y la compra del año con el modelo de tu Sheet de café."
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
  const editable = puedeEditarCom(accesos);
  const nav = (
    <NavVistas
      ruta="/comercializadora/cafe"
      vistas={det ? VISTAS_CAFE : VISTAS_CAFE_SIMPLE}
      activa={vista}
      params={params}
    />
  );
  const lecturas = m.R.avisos.length ? (
    <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
    </p>
  ) : null;
  if (vista === 'pedir') {
    const o = cafeOrdenesMotor(m);
    // Mínimo y máximo de la simulación (R.mm del viejo) de los artículos con cantidades del servidor (con compra.excluir_cafe
    // = false): solo explica la regla en "Por qué"; si falla, "Por qué" usa el texto general.
    let mm: Record<string, { minimo: number | null; maximo: number | null }> | null = null;
    const delServidor = o.rows.filter((r) => r.calc.fuente === 'servidor').map((r) => r.sku);
    if (delServidor.length) {
      try {
        const filas = await leerTodoCom<{ sku: string; minimo: number | null; maximo: number | null }>(
          db,
          'com_minmax',
          'sku,minimo,maximo',
          'sku',
          (q) =>
            q.in(
              'sku',
              o.rows.map((r) => r.sku),
            ),
        );
        mm = Object.fromEntries(filas.map((x) => [x.sku, { minimo: x.minimo, maximo: x.maximo }]));
      } catch {
        mm = null;
      }
    }
    return (
      <>
        {encabezado}
        {lecturas}
        {nav}
        <QuePedirCafe
          c={o}
          cuando={cuandoDe(sp.cuando)}
          soloAcc={sp.todos !== '1'}
          simple={!det}
          editable={editable}
          mm={mm}
          srvCalc={m.R.srv?.calc ?? null}
          params={{ ...params, cuando: sp.cuando, todos: sp.todos }}
        />
      </>
    );
  }
  const c = cafeMotor(m, esc);
  if (vista === 'params')
    return (
      <>
        {encabezado}
        {nav}
        <ParametrosCafe
          cafe={c.cfg.cafe}
          version={m.version}
          editable={editable}
          ctx={contextoParamsCafe(c)}
        />
      </>
    );
  const escenarios = CAFE_ESCS.map((k): [string, string] => {
    const e = c.cfg.cafe.escenarios[k];
    return [k, `${k} (${Math.round(e.crec * 100)}% crec. · ${nf(e.madura)} kg por sucursal)`];
  });
  return (
    <>
      {encabezado}
      {lecturas}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SelectorEscenario opciones={escenarios} valor={c.esc} />
        <span className="flex-1" />
        <DescargarExcel libro={libroCafe(c)} />
      </div>
      {c.R ? (
        <>
          <KpisCafe c={c} />
          <AvisosPlan avisos={avisosCafe(c, m.R)} />
        </>
      ) : null}
      {nav}
      {!c.R ? (
        <p role="alert" className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {c.err || 'No se pudo calcular.'} Revisa los parámetros.
        </p>
      ) : vista === 'mensual' ? (
        <MensualCafe c={c} />
      ) : vista === 'precios' ? (
        <PreciosCafe c={c} />
      ) : (
        <ResumenCafe c={c} />
      )}
    </>
  );
}
```

En `components/portal/navegacion.tsx` (`Coffee` ya se importa), debajo de Importaciones:

```tsx
      { href: '/comercializadora/cafe', nombre: 'Café', icono: Coffee },
```

- [ ] **Step 4: Correr y ver que pasa**

Run: `npx vitest run tests/portal/com-cafe-pantalla.test.tsx tests/portal/navegacion.test.tsx`
Expected: PASS (10 + 4). `npm run typecheck` limpio.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/cafe.ts components/comercializadora/cafe.tsx "app/(comercializadora)/comercializadora/cafe/page.tsx" components/portal/navegacion.tsx tests/portal/com-cafe-pantalla.test.tsx
git commit -m "feat(comercializadora): pantalla Café con Qué pedir, proyección del año, precios y parámetros"
```

---

### Task 10: Suite, build, recorrido en el navegador, guía y PR

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npx prettier --check "app/(comercializadora)" components/comercializadora lib/comercializadora "tests/portal/com-*" components/portal/navegacion.tsx`
Expected:
- Vitest: 170 archivos verdes y 1,344 pruebas, más la falla previa conocida `tests/migracion/paridad.test.ts` (Rappi, pide el Excel de costeo).
- tsc limpio.
- prettier limpio. En Windows, un archivo que Git dejó con CRLF puede marcar "Code style issues" sin cambios reales; se revisa solo lo tocado en este plan.

Run: `npm run test:funciones`
Expected: 249 passed + 25 ignored (las de paridad, sin el HTML viejo).

Run: `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`
Expected: 274 passed, 0 ignored. **Esta corrida es la que prueba la paridad.**

Luego: `npx next build`. Expected: build correcto, con 19 rutas de comercializadora (las 17 de antes, más `importaciones` y `cafe`).

- [ ] **Step 2: Sin migración ni dependencias**

Este plan no agrega migraciones, no toca bliocjvq y no cambia `package.json`. Para confirmarlo, `git diff feat/comercializadora-motor --stat -- supabase/migrations package.json package-lock.json` debe salir vacío.

- [ ] **Step 3: Recorrido en el navegador (solo ver)**

Escritorio y 375 px, sin guardar nada en producción. Las comparaciones son contra Compras > Importaciones y Compras > Café del sitio viejo el mismo día, con el mismo escenario.

1. **Importaciones › Qué pedir:**
   - "Pedir esta semana" y "la próxima": artículos y montos por proveedor.
   - En "Ver todo": tarjetas, semáforo y la línea de tiempo de una docena de artículos (se acaba, pedir el, llega).
2. **Importaciones › cifras de arriba** (cualquier otra vista):
   - "Pedir en los próximos 30 días": productos e inversión.
   - "Pedido ya va tarde", "Primer quiebre", "Próximo contenedor" y "Sucursales".
3. **Contenedores:** los 11 contenedores (colocar, llega, CBM, inversión, estado) y la tabla de cantidades. Mismo resultado con el escenario Pesimista desde el selector.
4. **Proyección mensual, Compra puente, Detalle y Resumen:** los 15 meses y la gráfica. Filtrar el Detalle por proveedor y por texto.
5. **Café › Qué pedir:** artículos de esta semana, montos y "≈ kg" por proveedor. Si hay un proveedor con mínimo de Zoho, lo adelantado coincide.
6. **Café › Proyección del año:**
   - "Café a comprar en 2027" (kg), el rango de escenarios, el volumen a comprometer y el mes más alto.
   - En "Ver todo", "Mes por mes" (los 12 meses de "A comprar") y "Presentaciones y precios".
7. **Exportar Excel** en las dos pantallas: Importaciones abre con 7 hojas y Café con 4, con los mismos nombres que el viejo y sus números.
8. **Crear OC** (Importaciones y Café):
   - Abre Órdenes con el aviso, el proveedor fijo, las líneas, el monto y el arribo.
   - Se cierra con **Cerrar, sin guardar**.
   - Con una URL alterada a mano (un SKU inventado o una cantidad negativa), esas líneas no aparecen.
9. **Parámetros:**
   - Cambiar un valor muestra "Hay cambios sin guardar" y la tabla de la red se recalcula.
   - Se sale con **Descartar, sin guardar** (decisión 12).
   - Con un usuario de lectura, todo deshabilitado.
10. **Consola y móvil:** consola sin errores de la app y sin desbordamiento horizontal a 375 px (las tablas se desplazan dentro de su caja). "Actualizar" vuelve a leer y la página se ve igual.

Diferencias esperadas con el viejo:
- borradores reales de Zoho que ahora no cuentan como en camino (decisión 7);
- el texto del escenario en Proyección mensual (decisión 9);
- datos leídos en otro momento (caché de 10 min).

Cualquier otra diferencia se investiga antes de seguir.

- [ ] **Step 4: Guía y PR**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 12. Importaciones y Café (plan 3e)

- Pantallas `/comercializadora/importaciones` y `/comercializadora/cafe` ("Planear y pagar"), con vistas por `?vista=`, escenario por `?esc=` (solo cambia lo que se ve) y "Ver todo" (`?det=1`).
- Los motores de las Sheets (`_impEngine`, `_cafeEngine`) son copias exactas del HTML viejo en `supabase/functions/_shared/{impEngine,cafeEngine}.ts`, generadas con `node scripts/comercializadora/portar-motores-hoja.mjs <html viejo> .`; no se editan a mano. El adaptador (`planImp.ts`), la configuración (`impCafeCfg.ts`), el café (`planCafe.ts`) y la agrupación por proveedor (`planProv.ts`) son ports con paridad: `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`.
- Todo corre sobre los datos del motor del plan (caché de 10 minutos compartida). Se agregó una lectura opcional de `com_zoho_proveedor` (mínimos de proveedor) para el Qué pedir de café; si falla, aviso "mínimos de proveedor".
- Parámetros: se guardan solo en `com_plan_config.config.imp` / `.cafe`, normalizados, con la versión que se vio e historial por clave (`imp.items.SKU.venta`, `cafe.prod.white_1kg.precio`…). No recalculan `com-minmax`. Mientras el viejo siga en Real, no se editan desde el portal.
- Exportar Excel: `.xlsx` en el navegador con SheetJS 0.20.3 (la CDN oficial que ya usa el portal), con las hojas del viejo (7 y 4).
- Crear OC: abre Órdenes con el formulario prellenado (`?nueva=importaciones|cafe&proveedor=…&l=SKU:cantidad…`). Solo entran SKUs del catálogo; nada se guarda hasta pulsar Guardar.
- Diferencias conocidas con el viejo: un borrador real de Zoho no cuenta como en camino en Importaciones; Proyección mensual nombra el escenario que se ve; no se portan el chip de pago, el aviso de activaciones ni el "impacto" en vivo del borrador de parámetros.
```

Commit:

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(comercializadora): guía de Importaciones y Café"
```

Push de `feat/comercializadora-importaciones` y PR con base `feat/comercializadora-motor` (encima del #116). En la descripción van:
- las decisiones 2 (Excel con la librería que ya está), 3 (Crear OC), 5 (motores copiados con sha256), 6 (rarezas de la hoja), 12 (guardado) y 14 (Qué pedir de café);
- el resultado de la corrida con `COM_APP_VIEJA`;
- que en producción no se guardaron parámetros ni OCs durante la revisión.

---

## Self-review (hecho al escribir)

- **Cobertura del bloque 3e, tras la decisión 1:**
  - Semillas, `_impCfgDef`/`_impCfgNorm`, `_cafeCfgDef`/`_cafeCfgNorm` y `_impCafeEtq`: Tarea 1.
  - `_impEngine` y `_cafeEngine`: Tarea 2.
  - Adaptador de Importaciones (`_impArmar` con `_impRed`, `_impPipelineMes`, `_impSucPromedio`, `vPlat`, las OCs con la regla de viejas y borradores y el camino manual) y `_impCorrer` con el doble cálculo de `prorratear_mes1`: Tarea 3.
  - Café (`_cafeRed`, `_cafeArmar`, `_cafeCorrer`) y `_cafeOrdenes` como filtro del motor 3d con su agrupación por proveedor: Tarea 4.
  - Escrituras: los bloques `imp`/`cafe` (Tarea 7) y Crear OC solo prellenando (Tarea 5).
  - Vistas de Importaciones (Qué pedir por omisión, Detalle, Contenedores, Proyección, Compra puente, Resumen y Parámetros): Tareas 7 y 8.
  - Vistas de Café (Qué pedir por omisión, Proyección del año, Mes por mes, Presentaciones y precios y Parámetros): Tareas 7 y 9.
  - La vista simple (decisión 11): Tareas 8 y 9.
  - Excel: Tarea 6.
  - API estable para el 3f: decisión 4. `impCorrer`, `impAhoraDatos`, `impRed`, `cafeOrdenes` y `planProvs` se exportan con sus tipos.
  - Fuera, y a dónde va: Plan de abastos y Esta semana, con `_psemGruposImp` y el historial de proveedores (3f); `_pagoChipHtml` (Crédito/Pedidos); el impacto en vivo del borrador (decisión 13).
- **El código de las tareas se probó antes de escribir el plan**, en una copia del repo en el punto de `feat/comercializadora-motor` (`62bfc74`) con `npm ci` propio, sin enlace a `node_modules`:
  - Deno: 249 passed + 25 ignored sin el HTML viejo, y 274 passed con `COM_APP_VIEJA`.
  - Vitest: 170 archivos verdes y 1,344 pruebas, más la falla conocida de Rappi. Antes eran 163 archivos y 1,290 pruebas.
  - `tsc --noEmit` y prettier limpios sobre lo tocado.
  - `next build` correcto, con 19 rutas de comercializadora.
  - Los estados intermedios del fixture (Tareas 1 y 3) y la versión de la Tarea 3 de `com-imp-cafe-motor.test.ts` se corrieron por separado.
  - El sha256 de los motores generados es el de la Tarea 2.

  Lo que no se probó allá: el recorrido en el navegador con datos reales (no había sesión ni base), que es la Tarea 10.
- **Sin marcadores pendientes.** Las preguntas de producto que quedan están en la decisión 2 (la librería de Excel) y la 13 (el impacto en vivo). El plan sigue al viejo, o a lo que pidió el usuario, mientras no diga otra cosa.
- **Tipos consistentes:**
  - `CorridaImp` (Tarea 3) lo usan las Tareas 5, 6, 7 y 8.
  - `CorridaCafe` y `PlanCafe` (Tarea 4) los usan las Tareas 5, 6, 7 y 9.
  - `GrupoProv` (Tarea 4) lo usa la Tarea 9 por `PlanCafe.provs`.
  - `PrellenadoOc` y `FormPrellenado` (Tarea 5) los usan las Tareas 8 y 9 (`enlaceOc`) y `Ordenes`.
  - `LibroExcel` (Tarea 6) lo usan las Tareas 8 y 9.
  - `ContextoParamsImp` y `ContextoParamsCafe` (Tarea 7) los usan las páginas de las Tareas 8 y 9.
  - `Cuando`, `GrupoQuePedir` y `hrefPlan` (Tarea 8) los usa la Tarea 9.
  - `DatosPlan.zprov` (Tarea 4) lo llena `cargarDatosPlan` y lo lee `planProvs`.
  - `editorCom`, `fallo`, `SOLO_LECTURA`, `CONFIG_OCUPADA` y `Resultado` son de `acciones.ts`.
- **Review Focus → pruebas:**
  1. Sección con basura: Tarea 1 (`IMPS`/`CAFES` con basura, 300 artículos, 12 proveedores), Tarea 3 (configuración `sin_aperturas` con familia y proveedor inexistentes y SKU fuera del catálogo), Tarea 7 ("el borrador se normaliza"), Tarea 8 (avisos).
  2. Fechas que cruzan el año: Tarea 2 (cinco fechas de corte), Tarea 3 ("el día 1 del mes no prorratea y fin de año cruza a 2028"), Tarea 4 (`anio_2026`, `ajustes` con 2028).
  3. Puente y lecturas caídas: Tareas 8 y 9 ("sin puente"), Tarea 4 ("si falla, sigue con el aviso" y "año sin aperturas da arranque 0 sin NaN").
  4. Contenedor sin artículos: Tarea 2 (`sin_contenedor`), Tarea 8 ("sin artículos del proveedor de contenedores"), Tarea 5 (60 líneas).
  5. Concurrencia y URL alterada: Tarea 7 ("dos que guardan a la vez"), Tarea 5 ("lista blanca" y "descarta lo que no sirve").
