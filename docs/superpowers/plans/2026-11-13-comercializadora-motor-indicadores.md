# Comercializadora: motor de planeación en el servidor, DOH e Indicadores (plan 3d)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Portar al servidor el motor de planeación que el sitio viejo corre en el navegador y, sobre él, traer al portal:
- **DOH:** riesgo de quiebre de cada artículo, con las OCs en camino.
- **Indicadores de abasto:** las siete tarjetas (forecast, venta vs proyección, compras vs venta, cobertura, exceso, disponibilidad y datos del plan), su detalle y sus metas.
- **Sugerir piezas por apertura**, dentro de Catálogo.

Inicio gana el panel "Riesgo de quiebre" (pendiente desde el plan 3c, decisión 8) y enlaces al DOH. DOH e Indicadores validan el motor: su backtest compara lo que el motor proyectaba contra lo que se vendió.

**Architecture:** Igual que los planes 3, 3b y 3c (route group `app/(comercializadora)`, server components con la sesión, client components en `components/comercializadora/`, escrituras en server actions con `editorCom()`). Lo nuevo:
- **El motor es TypeScript puro en `supabase/functions/_shared/`**, junto a `planEngine.ts` (que ya porta la tasa y la serie diaria). Son ports **literales** del HTML viejo `a9e4a22`, con los nombres sin el guion bajo, y cada uno trae su prueba de paridad en Deno: extrae la función vieja del HTML (`COM_APP_VIEJA`), la evalúa con la hora de CDMX y exige salida **idéntica**.
  - `planMotor.ts`: `_planEngSku` completo, `_planEngAperturasDetalle`, `_planEngine`.
  - `planDatos.ts`: `_planDatAMotor`, OCs en camino y borradores, normalización completa de la configuración.
  - `planBuild.ts`: `_planBuild` (sin la parte de proveedores), `_planBacktestAgg`, `_planAplicarServidor`.
  - `planKpi.ts`: `_kpiAbCalc`, `_kpiAbEstados`, ventanas, traza y borradores.
  - `planPiezas.ts`: `_planPzasApCalc`.
- **El cálculo corre en el servidor de Next, por petición, con caché de 10 minutos** (como `_planAsegurar`). `lib/comercializadora/motor.ts` (server-only) porta `_planDatCargar`: lee `com_*` con la sesión y los pedidos del sitio viejo por el puente con la llave de servicio (`legado.ts`).
- **Las pantallas importan el motor desde `lib/comercializadora/`** (rutas relativas con `.ts`, como `config.ts`), nunca con el alias `@/supabase`.
- **No hay migración.** Las vistas del puente ya traen todas las columnas que lee el motor.

Rama: `feat/comercializadora-motor`, encima de `feat/comercializadora-operacion` (PR #115).

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Tailwind, Supabase (Postgres/RLS), Vitest + Testing Library, Deno (`deno test`) para los ports y su paridad, lucide-react.

**Spec:** `docs/superpowers/specs/2026-11-12-migracion-comercializadora-design.md` (Fase 1 · Pantallas: "los cálculos que hoy viven en JS del HTML pasan a funciones puras con pruebas y casos tomados del comportamiento actual"). Anteceden:
- plan 3: `2026-11-13-comercializadora-pantallas-compras.md` (PR #113);
- plan 3b: `2026-11-13-comercializadora-inventario-config.md` (PR #114);
- plan 3c: `2026-11-13-comercializadora-operacion.md` (PR #115).

Siguen el plan 3e (Importaciones y Café) y el 3f (Plan de abastos y Esta semana); después, el plan 4 (paridad y cutover).

## Decisiones (al planear, 2026-11-13)

1. **El bloque Planear se divide en tres planes (lo eligió el usuario).**
   - **3d (este):** el motor del navegador portado al servidor, DOH e Indicadores. Indicadores y DOH validan el motor con su backtest.
   - **3e:** Importaciones y Café, con sus propios motores.
   - **3f:** Plan de abastos y Esta semana, que combinan lo local con café e importaciones.
2. **"Todo lo demás" (pestaña `plan`) no se porta (lo eligió el usuario).** Su vista por defecto es la de Qué pedir (mismas cantidades del servidor); el conteo físico está en Inventario, el mínimo de proveedor en Mínimos y los campos por artículo (LT, piezas por apertura, mínimo, múltiplo, días de seguridad) se editan en Catálogo. **Solo "Sugerir piezas por apertura"** (`_planPzasApCalc` 35334 y su cuadro, 35382–35470) se porta, dentro de Catálogo (Tarea 8).
3. **Crédito y los KPIs del lado de pedidos van con Pedidos (lo eligió el usuario).** De la pantalla KPIs del viejo no se porta nada más: Inicio ya tiene las tarjetas de Compras y Mermas (plan 3c).
4. **Arquitectura del motor:** ports literales en `_shared` con paridad (arriba). El servidor de Next calcula por petición y guarda en memoria los datos crudos 10 minutos y hasta 6 resultados (`_kpiAbMem`). **La caché es compartida entre usuarios:** `com_*` se protege por módulo y no por usuario, así que todos los que leen Comercializadora ven los mismos datos. Se pierde al reiniciar la instancia y "Actualizar" la vacía.
5. **DOH e Indicadores usan el cálculo local** (`_planSinSrv`), como el viejo (`_kpiAbCalc` 41012: "Indicadores siguen con el cálculo local"). La superposición de la simulación del servidor (`_planAplicarServidor` 33490) se porta y se prueba aquí porque es parte de `_planBuild`, pero solo la usará el 3f.
6. **Borradores de OC.** El viejo, si la carga de Zoho guardada en la configuración era anterior al 13-oct, usaba una copia fija de ese archivo (`_ZOC_INCLUIDA`, 38500). **No se porta.** Un borrador se reconoce por:
   - las líneas `borrador` de `cfg.zoho_oc` (como el viejo);
   - **y además** las líneas de `com_zoho_oc_lineas` con `status = 'draft'` (las trae `zoho-sync`), con la misma llave `zocKey(folio)|SKU`.

   Un borrador nunca cuenta como "en camino" ni como compra emitida, y la revisión "Borradores de OC" los cuenta.
7. **Lead time: se conserva la regla del viejo (lo eligió el usuario).** El plan del viejo usa solo `com_lead_times` (ignora `zoho_lead_time`); `com-minmax` usa `zoho_lead_time ?? com_lead_times`. DOH e Indicadores siguen al viejo para poder compararlos con él; se puede alinear en el cutover. La diferencia se anota en la guía.
8. **Historia que se lee:** `_planHistNecesaria` con la ventana de Importaciones normalizada como `_impCfgNorm` (90 días si falta, acotada a 30–365). Sin ella el backtest de la 8.ª semana cambia. Se calcula con la configuración **guardada**: el portal no tiene borrador compartido.
9. **Pedidos vigentes como en el viejo:** `.not('status','in','(cancelado,cancelacion_pendiente)')` deja fuera también el status nulo (SQL `NOT IN`). Se filtra en JS con esa misma regla. Si falla la lectura de kits, el viejo conservaba los lotes ya leídos; aquí se avisa ("kits") y no se marca ningún kit.
10. **Metas de Indicadores:** acción propia `guardarMetasKpi`. Solo escribe `config.kpi.*`, con la versión que vio la pantalla (como `guardarConfig`; el viejo comparaba contra la versión del momento de guardar), y deja una fila de historial por meta (ámbito `config`, clave `kpi.<meta>`). `CAMPOS_CONFIG` y la pantalla de Configuración no cambian. Las metas no mueven el cálculo del servidor: no se recalcula. Solo `exc_margen` cambia una cuenta (Capital en exceso).
11. **Detalle y traza por URL** (`?detalle=fc|cv|inv|exc|disp|datos`, `&traza=SKU`), renderizados en el servidor. Las otras ventanas del forecast (14 y 21 días) son dos cálculos completos más: solo se hacen al abrir el detalle del forecast.
12. **Revisiones de "Datos del plan":** mismos criterios y textos, sin HTML, y con enlaces a pantallas del portal en lugar de los cuadros del viejo:
   - Inventario → `/comercializadora/inventario`;
   - OCs y borradores → `/comercializadora/ordenes`;
   - Envíos, Catálogo y Mapeo → sus pantallas;
   - "Sugerir piezas" → `/comercializadora/catalogo/piezas-apertura`.

   **"OCs en camino al día con Zoho" usa la frescura de `zoho-sync` (lo eligió el usuario).** El viejo la medía con la conciliación por archivo (`cfg.zoho_oc.conciliado`), que el portal no tiene: siempre saldría "sin poner al día". `kpiAbCalc` sigue siendo el port literal (la paridad no cambia) y la capa del portal reemplaza solo esa revisión con `conRevisionOcSync` (Tarea 7, Step 0): verde si la última corrida buena de `zoho-sync` tiene ≤ 3 días, ámbar ≤ 7, rojo si es más vieja o no hay; recalcula `datos.ok`. Devuelve una copia, porque `K` vive en la caché compartida.
13. **Inicio:** panel "Riesgo de quiebre" (`_kpiForecastRiesgo` 41543: conteos y los primeros 7 por pedir o por confirmar) con enlace a `/comercializadora/doh?estado=pedir`, y "Ver DOH" en los paneles Sin stock e Inventario crítico (el viejo los ligaba a `com-doh`). El filtro `?estado=` acepta el `urgente` del viejo como `pedir`.
14. **Piezas por apertura:** subpágina `/comercializadora/catalogo/piezas-apertura?n=20` (muestra de 3 a 200 aperturas). Lee **todo** el historial de pedidos vigentes por el puente, como el viejo. "Aplicar" hace, por artículo, un update condicional al valor que se vio y deja historial con ámbito `sku`, igual que Catálogo.
15. **Rarezas del viejo que se conservan, con prueba:**
   - la traza compara el SKU de la línea sin normalizar mayúsculas;
   - Piezas ordena las aperturas sin fecha por el día UTC de su primer pedido;
   - `borrUds` siempre es 0: la línea que lo suma es inalcanzable.

   Ninguna cambia un número que se muestre. `renderComDohAntiguo` (43439) es código muerto y no se porta.
16. **Un texto que se corrige:** el detalle del forecast y la traza decían "el promedio de los 30 días anteriores" aunque la ventana configurada fuera otra. Ahora dicen "la ventana".

**Fuera de este plan:**
- Proveedores del Plan, que van al 3f: historial de 60 días, mínimos (`R.zprov`), `_planAgruparProv`/`_planConsolidar` y el "Por qué" con `com_minmax`.
- Importaciones y Café (3e).
- La pantalla Forecast del viejo: su panel de riesgo pasa a Inicio.

## Mapa de archivos

| Archivo | Tarea | Qué hace |
| --- | --- | --- |
| `supabase/functions/_shared/planMotor.ts` | 1 | `_planEngSku` completo, aperturas, `_planEngine` |
| `supabase/functions/_shared/pruebas/appVieja.ts` | 1 | Extrae y evalúa el HTML viejo para la paridad |
| `supabase/functions/_shared/planEngine.ts` | 2 | Exporta cuatro helpers que ya tenía |
| `supabase/functions/_shared/planDatos.ts` | 2 | `_planDatAMotor`, OCs, borradores, configuración completa |
| `supabase/functions/_shared/pruebas/fixturesPlan.ts` | 2 | Catálogo, pedidos y OCs de prueba |
| `supabase/functions/_shared/planBuild.ts` | 3 | `_planBuild`, backtest y simulación del servidor |
| `lib/comercializadora/legado.ts` | 4 | Lecturas del puente que pide el motor |
| `lib/comercializadora/motor.ts` | 4, 6 | `_planDatCargar`, caché e indicadores del motor |
| `supabase/functions/_shared/planKpi.ts` | 5 | `_kpiAbCalc`, estados, ventanas, traza y borradores |
| `lib/comercializadora/doh.ts`, `components/comercializadora/doh.tsx`, `app/.../doh/page.tsx` | 6 | DOH |
| `components/comercializadora/inicio.tsx`, `app/.../inicio/page.tsx` | 6 | Riesgo de quiebre y enlaces al DOH |
| `lib/comercializadora/indicadores.ts`, `components/comercializadora/{indicadores,metas-kpi,actualizar-motor}.tsx`, `app/.../indicadores/page.tsx` | 7 | Indicadores |
| `supabase/functions/_shared/planPiezas.ts`, `lib/comercializadora/piezas.ts`, `components/comercializadora/piezas-apertura.tsx`, `app/.../catalogo/piezas-apertura/page.tsx` | 8 | Piezas por apertura |
| `app/(comercializadora)/comercializadora/acciones.ts` | 7, 8 | `guardarMetasKpi`, `actualizarMotor`, `aplicarPiezasApertura` |
| `components/portal/navegacion.tsx` | 6, 7 | DOH e Indicadores en "Planear y pagar" |

## Global Constraints

- Las de los planes 3, 3b y 3c:
  - ruta `/comercializadora/*`;
  - acceso por `perfil_modulos` (`lectura` ve; `edicion`/`desarrollador` escriben);
  - día de CDMX (`hoyCdmx`; en el motor, `medianocheCdmx`/`fechaLocal`);
  - piezas de `components/portal/piezas.tsx`, tablas `.tabla`, máximo 25 filas visibles o "Ver más";
  - montos MXN (`pesos`; en notas cortas, `_planMoneyCorto`);
  - pruebas: `npm test`, `npm run typecheck`, `npm run test:funciones` y prettier sobre lo tocado de `app`, `components`, `lib` y `tests`.
- **Paridad:** cada archivo nuevo de `_shared` es un port literal: mismos nombres sin `_`, mismo estilo `var`, `// deno-lint-ignore-file`. Next lo importa, así que también pasa `tsc` en modo strict.
- **Las pruebas de paridad se ignoran sin `COM_APP_VIEJA`.** Para ver el RED y el GREEN de las tareas 1, 2, 3, 5 y 8 hay que exportar antes (Git Bash):
  ```bash
  git -C "C:/Users/sebcm/OneDrive/Documents/thecoffee-comercializadora" show a9e4a22:app/index.html > "$TEMP/app-vieja-a9e4a22.html"
  export COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html"
  ```
  Una prueba de paridad que sale "ignored" no cuenta como verde.
- Las acciones sin permiso responden `{ error: 'Tu acceso a Comercializadora es de solo lectura.' }` sin tocar la base.
- La llave de servicio solo se usa en `lib/comercializadora/legado.ts`. `motor.ts` también es server-only. Ningún client component importa `motor.ts` ni `legado.ts`.
- **Sin migraciones ni cambios en bliocjvq.** Nada se escribe en producción durante la revisión.
- Mientras el viejo siga en Real, en producción **no se guardan metas ni se aplican piezas por apertura** durante la revisión: la copia en espejo los borraría y el viejo sigue siendo la fuente.

## Review Focus

1. **El puente no responde, o falta la llave de servicio.** DOH e Indicadores muestran el aviso, sin números ni pantalla rota. Inicio dice "No se pudo calcular el riesgo de quiebre" y sigue con lo demás. Piezas avisa y no sugiere. Lo cubren las Tareas 4 ("sin puente"), 6 (Inicio con `riesgo={null}`) y 8 (aviso).
2. **Artículo nuevo o sin historia:** vida de 0 a 9 días, sin pedidos, o solo con piezas por apertura. Sin NaN, "Sin venta" en el DOH y fuera del forecast. Lo cubren la Tarea 1 (series "nuevo" con vida 9, 0 y `null`) y la Tarea 5 ("artículo nuevo sin historia ni venta").
3. **OC sin fecha de llegada, vieja o en borrador de Zoho.** El DOH dice "OC por confirmar" con su motivo, y un borrador nunca cuenta como en camino. Lo cubren la Tarea 2 (decisión 6 y OCs viejas), la Tarea 5 (borradores sin repetir folio) y la Tarea 7 (fixture con "OC sin fecha").
4. **Cerca de medianoche o del cambio de semana.** A las 23:50 de CDMX el motor usa ese día; a las 00:01 vuelve a leer con el día nuevo. Los pedidos se cuentan por día de CDMX y las semanas del backtest se cortan desde hoy. Lo cubren la Tarea 4 ("cambiar el día de CDMX") y la Tarea 2 (pedidos a cualquier hora, paridad).
5. **Otra persona guarda mientras tanto.**
   - La configuración cambia con datos en caché: se usa la nueva, y si pide más historia, se vuelve a leer (Tarea 4).
   - Dos personas guardan metas: la segunda recibe "Otra persona guardó" sin escribir (Tarea 7).
   - Las piezas cambiaron mientras se revisaban: no se pisan (Tarea 8).

   El tamaño real del catálogo (1500 artículos y 6000 pedidos) se prueba en la Tarea 5.

---

### Task 1: Motor completo por artículo (`_planEngSku`, aperturas, `_planEngine`) con paridad

**Files:**
- Create: `supabase/functions/_shared/planMotor.ts`
- Create: `supabase/functions/_shared/pruebas/appVieja.ts`
- Test: `supabase/functions/_shared/planMotor_parity_test.ts`

**Interfaces:**
- Consumes (de `planEngine.ts`, ya existe): `planEngCeil`, `planEngDia(iso, n)`, `planEngDifDias(a, b)`, `planEngFactor(cfg, sku, iso)`, `planEngMasEspecifico(map, sku)`, `planEngN(x, def)`, `planEngTasaBase(cfg, sku, u, hist, hoy, vida)`, `planEngValido(x)`.
- Produces (`planMotor.ts`):
  - `PLAN_ENG_Z: Record<string, number>`
  - `planEngNumDef(x: any, def: number): number`
  - `interface AperturaDetalle { id; cuenta: boolean; peso: number; fe: string | null; sinFecha: boolean; motivo: string }`
  - `interface AperturasMotor { con: { dias: number; peso: number }[]; sinSuma: number; n?: number }`
  - `planEngAperturasDetalle(cfg, raw): AperturaDetalle[]`
  - `planEngSku(cfg, raw, s0, aper: AperturasMotor): any`. Devuelve los mismos campos que `_planEngSku` 32799: `tasa, consumo, disponible, invBase, necesito, demandaH, seguridad, paraAper, H, pedirEsta, pedirProx, accion, urgencia, diasAlcanza, diasHoy, importacion, picos_n, pico_reciente, elegible, metodo_efectivo, seg_efectiva, Ve, B, bloqueado, confianza, datos_invalidos, lt, dm, Heff, ciclo, sem[], kPrimera, btProy[], btReal[]`.
  - `planEngine(cfg, raw: { hoy; hist; skus; aperturas }): { rows: any[]; aper: { cuentan: number } }`
- Produces (`pruebas/appVieja.ts`, solo pruebas): `SIN_APP`, `fuente(nombre)`, `claseFecha(ahora)` (también fija `Date.now()`), `instanteCdmx(hoy, hora?)`, `app(nombres, stubs, hoy, hora?)`, `rng(seed)`, `serie(tipo, seed, n?)`, `NOMBRES_MOTOR`, `STUBS_MOTOR`.

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/pruebas/appVieja.ts` (ayudante de las pruebas; no es un `_test.ts`). Generaliza el extractor de `planEngine_parity_test.ts`, que no se toca:

```ts
// deno-lint-ignore-file no-explicit-any
// Evalúa funciones del HTML viejo aisladas, para las pruebas de paridad del motor (plan 3d). COM_APP_VIEJA apunta al
// app/index.html de producción (`git show a9e4a22:app/index.html`). Sin ella, las pruebas de paridad se omiten.
export const RUTA_APP = Deno.env.get("COM_APP_VIEJA");
export const SIN_APP = !RUTA_APP;
const APP = RUTA_APP ? await Deno.readTextFile(RUTA_APP) : "";

/** Código fuente de una declaración top-level de la app (function / var / const) por nombre, con balanceo de llaves. */
export function fuente(nombre: string): string {
  const re = new RegExp(`(?:^|\\n)((?:async )?function ${nombre}\\(|(?:var|const) ${nombre}\\s*=)`);
  const m = re.exec(APP);
  if (!m) throw new Error("No encontré " + nombre + " en app/index.html");
  const ini = m.index + m[0].indexOf(m[1]);
  const esFn = m[1].includes("function");
  let depth = 0, vioCuerpo = false;
  for (let i = ini; i < APP.length; i++) {
    const c = APP[i];
    if (c === "'" || c === '"' || c === "`") {
      for (i++; i < APP.length && APP[i] !== c; i++) if (APP[i] === "\\") i++;
      continue;
    }
    if (c === "/" && APP[i + 1] === "/") { while (APP[i] !== "\n") i++; continue; }
    if (c === "/" && APP[i + 1] === "*") { i = APP.indexOf("*/", i) + 1; continue; }
    if (c === "{" || c === "(" || c === "[") { depth++; if (c === "{") vioCuerpo = true; }
    else if (c === "}" || c === ")" || c === "]") {
      depth--;
      if (esFn && depth === 0 && c === "}" && vioCuerpo) return APP.slice(ini, i + 1);
    } else if (!esFn && depth === 0 && c === ";") return APP.slice(ini, i + 1);
  }
  throw new Error("Declaración sin cierre: " + nombre);
}

// Hora local de Ciudad de México (UTC−6 fijo desde 2022) y Date.now() fijo, para evaluar la app como en el navegador del
// equipo sin depender de la zona ni del reloj de la máquina que corre las pruebas.
const OFF = 6 * 3600e3;
export function claseFecha(ahora: number) {
  return class DateCdmx extends Date {
    constructor(...a: any[]) {
      if (a.length === 0) super(ahora);
      else if (a.length === 1) super(a[0] instanceof Date ? a[0].getTime() : a[0]);
      else super(Date.UTC(a[0], a[1], a[2] ?? 1, a[3] ?? 0, a[4] ?? 0, a[5] ?? 0, a[6] ?? 0) + OFF);
    }
    static override now() { return ahora; }
    private l() { return new Date(this.getTime() - OFF); }
    override getFullYear() { return this.l().getUTCFullYear(); }
    override getMonth() { return this.l().getUTCMonth(); }
    override getDate() { return this.l().getUTCDate(); }
    override getHours() { return this.l().getUTCHours(); }
    override setHours(h: number, m = 0, s = 0, ms = 0) {
      const l = this.l(); l.setUTCHours(h, m, s, ms); return this.setTime(l.getTime() + OFF);
    }
  };
}
/** Instante de `hoy` (YYYY-MM-DD) a la hora dada de CDMX. */
export const instanteCdmx = (hoy: string, hora = 10) =>
  Date.UTC(+hoy.slice(0, 4), +hoy.slice(5, 7) - 1, +hoy.slice(8, 10), hora) + OFF;

/** La app evaluada aislada: `stubs` primero, luego cada declaración de `nombres`, con "ahora" = hoy a la hora de CDMX. */
export function app(nombres: string[], stubs: string, hoy: string, hora = 10): any {
  const src = stubs + "\n" + nombres.map(fuente).join("\n") + "\nreturn{" + nombres.map((n) => n + ":" + n).join(",") + "};";
  return new Function("Date", src)(claseFecha(instanteCdmx(hoy, hora)));
}

/** Generador determinista. */
export function rng(seed: number) {
  return () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
}

/** Serie diaria de n días con forma variada (u[k] = unidades de hace k días). */
export function serie(tipo: string, seed: number, n = 120): number[] {
  const r = rng(seed), u: number[] = [];
  for (let k = 0; k < n; k++) {
    let x = 0;
    if (tipo === "regular") x = Math.round(5 + r() * 10);
    else if (tipo === "picos") x = Math.round(r() * 4) + (k % 7 === 3 && k < 30 ? 120 : 0) + (k === 1 ? 300 : 0);
    else if (tipo === "esporadico") x = r() < 0.15 ? Math.round(r() * 40) : 0;
    else if (tipo === "nuevo") x = k < 9 ? Math.round(3 + r() * 6) : 0;
    else if (tipo === "sube") x = Math.round((k < 14 ? 30 : 8) + r() * 4);
    u.push(x);
  }
  return u;
}

/** Motor y configuración (planEngine.ts + planMotor.ts + planDatos.ts). */
export const NOMBRES_MOTOR = [
  "_PLAN_ENG_Z", "_planEngDia", "_planEngDifDias", "_planEngCeil", "_planEngMediana", "_planEngPercentil", "_planEngMAD",
  "_planEngCoincide", "_planEngMasEspecifico", "_planEngN", "_planEngValido", "_planEngFactor", "_planEngTasaBase",
  "_planEngNumDef", "_PLAN_ENG_BLOQ", "_planEngSku", "_planEngAperturasDetalle", "_planEngine",
  "_planCfgDef", "_PLAN_CFG_RANGOS", "_PLAN_CFG_OPC", "_PLAN_RE_CORREO", "_planCorreosNorm", "_PLAN_SERVICIOS",
  "_PLAN_TIPOS_DEM", "_planCfgNum", "_planCfgNormalizar", "_planCfgClon",
  "_KPI_AB_DEF", "_KPI_AB_CAMPOS", "_kpiAbCfgNorm", "_impTxt", "_impFechaOk", "_zohoOcNorm",
];
/** Importaciones y Café (plan 3e) no los usa el motor local: su normalización se deja pasar tal cual. */
export const STUBS_MOTOR = `
function _impCfgDef(){return null;} function _cafeCfgDef(){return null;}
function _impCfgNorm(x){return x==null?null:x;} function _cafeCfgNorm(x){return x==null?null:x;}
`;
```

Crear `supabase/functions/_shared/planMotor_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad del motor completo: _planEngAperturasDetalle, _planEngSku y _planEngine de la app contra planMotor.ts.
// Mismo código portado, mismas operaciones: la salida debe ser IDÉNTICA (assertEquals), no "cercana".
import { assert, assertEquals } from "@std/assert";
import { planEngAperturasDetalle, planEngine, planEngSku } from "./planMotor.ts";
import { app, NOMBRES_MOTOR, serie, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";

const HOY = "2026-11-02";
const A = SIN_APP ? null : app(NOMBRES_MOTOR, STUBS_MOTOR, HOY);

const CFGS: Record<string, any> = {
  defecto: {},
  estadistico: { consumo: { ventana: 84 }, seg: { metodo: "estadistico", servicio: 0.99, revision: 5, lt_cv: 0.2, prefijo: { "INS-VAS": 15 } } },
  bloqueo_si_cubre: { compra: { bloqueo_oc: "si_cubre", bloqueo_umbral: 0.3, semanas: 26, bt_semanas: 8, prox_dias: 7 } },
  bloqueo_nunca: { compra: { bloqueo_oc: "nunca", ciclo_nac: 21, h_max: 30 }, inv: { base: "fisico", yulius: true } },
  aper_tasa: { aper: { modo: "tasa", por_mes: 8, horizonte: 20, horizonte_auto: true } },
  aper_mayor: { aper: { modo: "mayor", por_mes: 2, antelacion: 10, peso_sin_fecha: 0.25,
    ajustes: { ap3: { incluir: true, fecha: "2026-11-20", peso: 2 }, ap2: { incluir: false } } } },
  sin_aper: { aper: { incluir: false }, compra: { prox_dias: 14, bt_semanas: 12 } },
  temporada: { consumo: { crecimiento: 5, divisor: "vida" }, temp: { activa: true, mes: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1.2, 1.5, 2] },
    eventos: [{ id: "bf", ini: "2026-11-10", fin: "2026-11-20", factor: 1.8, alcance: "todos" }] },
};

const APERTURAS = [
  { id: "ap1", fecha: "2026-11-15", estatus: "en_proceso", kit: false },
  { id: "ap2", fecha: "2026-12-20", estatus: "en_proceso", kit: false },
  { id: "ap3", fecha: null, estatus: "activa", kit: false },
  { id: "ap4", fecha: null, estatus: "en_proceso", kit: false },
  { id: "ap5", fecha: "2026-08-01", estatus: "en_proceso", kit: false },   // vencida (> 45 días)
  { id: "ap6", fecha: "2026-11-05", estatus: "en_proceso", kit: true },    // ya hizo su kit
];

const TIPOS = ["regular", "picos", "esporadico", "cero", "nuevo", "sube"];
function skus(): any[] {
  const out: any[] = [];
  TIPOS.forEach((t, i) => {
    const u = serie(t, i + 1);
    out.push(
      { sku: `INS-VAS-00${i}`, u, vida: 400, fisico: 40, comprometido: 5, yulius: 12, enOC: 0, costo: 18, lt: 7, porApertura: 2, minPzas: 0, multiplo: 1 },
      { sku: `ALI-JAR-00${i}`, u, vida: i === 4 ? 9 : null, fisico: "x", comprometido: null, yulius: "", enOC: 30, costo: -4, lt: "12.5", porApertura: 0, minPzas: 24, multiplo: 6, diasSeg: "5" },
      { sku: `IMP-TER-00${i}`, u, vida: 30, fisico: 500, comprometido: 0, yulius: 0, enOC: 100, costo: 90, lt: 60, porApertura: 1, minPzas: 0, multiplo: 1, diasSeg: 0 },
      { sku: `EMP-TAP-00${i}`, u, vida: 200, fisico: -3, comprometido: 2, yulius: 0, enOC: 0, costo: 2, lt: 0, porApertura: 0, minPzas: 10, multiplo: 1 },
    );
  });
  out.push({ sku: "AGO-001", u: serie("regular", 9), estatus: "Hasta Agotar Existencias", fisico: 1 });
  out.push({ sku: "INA-001", u: serie("regular", 9), estatus: "Inactivo", fisico: 1 });
  return out;
}

Deno.test({ name: "paridad: planEngine (todas las filas, todos los campos) = _planEngine", ignore: SIN_APP }, () => {
  let filas = 0;
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const hist of [120, 84, 20]) {
      const cfg = A._planCfgNormalizar(c0);
      if (n === "bloqueo_nunca") { cfg.compra.ciclo_imp = 45; cfg.compra.bloqueo_oc_imp = "siempre"; } // claves que el motor lee aunque la configuración no las tenga
      const raw = { hoy: HOY, hist, skus: skus(), aperturas: APERTURAS };
      const app = A._planEngine(cfg, raw), srv = planEngine(cfg, raw);
      assertEquals(srv, app, `${n} hist=${hist}`);
      assertEquals(planEngAperturasDetalle(cfg, raw), A._planEngAperturasDetalle(cfg, raw), `${n} aperturas`);
      filas += srv.rows.length;
    }
  }
  assert(filas >= 500);
});

Deno.test({ name: "paridad: el motor sí ejercita cada rama (acciones, urgencias, bloqueo, estadística, seguimiento)", ignore: SIN_APP }, () => {
  const vistos = new Set<string>();
  for (const [n, c0] of Object.entries(CFGS)) {
    const cfg = A._planCfgNormalizar(c0);
    const r = planEngine(cfg, { hoy: HOY, hist: 120, skus: skus(), aperturas: APERTURAS });
    for (const x of r.rows) {
      vistos.add("accion:" + x.accion); vistos.add("urg:" + x.urgencia); vistos.add("seg:" + x.seg_efectiva);
      if (x.bloqueado) vistos.add("bloqueado");
      if (x.importacion) vistos.add("importacion");
      if (x.paraAper > 0) vistos.add("aperturas:" + n);
      if (x.datos_invalidos.length) vistos.add("invalidos");
      if (x.btProy.some((p: number | null) => p !== null)) vistos.add("bt");
      if (x.sem.slice(2).some((q: number) => q > 0)) vistos.add("semanas>2");
    }
  }
  for (const v of ["accion:PEDIR", "accion:PRÓXIMA", "accion:PRÓXIMA (OC emitida)", "accion:OK", "urg:Urgente", "urg:Pronto",
    "urg:Normal", "seg:estadistico", "bloqueado", "importacion", "aperturas:aper_tasa", "aperturas:aper_mayor", "invalidos", "bt", "semanas>2"]) {
    assert(vistos.has(v), "no se ejercitó " + v);
  }
});

Deno.test({ name: "paridad: planEngSku con aperturas a mano (sin fecha con tope por mes)", ignore: SIN_APP }, () => {
  const cfg = A._planCfgNormalizar(CFGS.aper_mayor);
  const raw = { hoy: HOY, hist: 84, skus: [] };
  const s0 = { sku: "INS-VAS-001", u: serie("regular", 3), vida: 400, fisico: 10, porApertura: 3, lt: 9 };
  for (const aper of [{ con: [], sinSuma: 0 }, { con: [{ dias: 5, peso: 1 }, { dias: 70, peso: 2 }], sinSuma: 3.5 }]) {
    assertEquals(planEngSku(cfg, raw, s0, aper), A._planEngSku(cfg, raw, s0, aper));
  }
});
```

- [ ] **Step 2: Correr y ver que falla**

Run (con `COM_APP_VIEJA` exportada, ver Global Constraints): `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planMotor_parity_test.ts`
Expected: FAIL. `Module not found ".../planMotor.ts"`.

- [ ] **Step 3: El port**

Crear `supabase/functions/_shared/planMotor.ts`. Es `_planEngAperturasDetalle` (32728), `_planEngNumDef`/`_PLAN_ENG_BLOQ` (32796), `_planEngSku` (32799) y `_planEngine` (32940), línea por línea:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del resto del motor del Plan de abasto del sitio viejo (app/index.html a9e4a22, líneas 32728–32954):
// _planEngAperturasDetalle, _planEngSku completo (cobertura, aperturas, pedido por semana, urgencia y seguimiento de
// ventas) y _planEngine. Misma lógica y mismos nombres sin el guion bajo; los helpers vienen de planEngine.ts.
// planMotor_parity_test.ts compara este archivo contra la app: si la app cambia su motor, la prueba falla.
import {
  planEngCeil, planEngDia, planEngDifDias, planEngFactor, planEngMasEspecifico, planEngN, planEngTasaBase, planEngValido,
} from "./planEngine.ts";

export const PLAN_ENG_Z: Record<string, number> = { "0.9": 1.2816, "0.95": 1.6449, "0.975": 1.96, "0.99": 2.3263 };

/** Número de la configuración o su valor por defecto cuando falta o no es válido (texto, null, NaN...). */
export function planEngNumDef(x: any, def: number): number { return planEngValido(x) ? Number(x) : def; }
const PLAN_ENG_BLOQ = ["siempre", "si_cubre", "nunca"];

export interface AperturaDetalle { id: any; cuenta: boolean; peso: number; fe: string | null; sinFecha: boolean; motivo: string }
export interface AperturasMotor { con: { dias: number; peso: number }[]; sinSuma: number; n?: number }

// Detalle de cada apertura: ¿pasa los filtros globales y con qué peso?
export function planEngAperturasDetalle(cfg: any, raw: any): AperturaDetalle[] {
  return (raw.aperturas || []).map(function (a: any) {
    var aj = (cfg.aper.ajustes || {})[a.id] || {};
    var d: AperturaDetalle = { id: a.id, cuenta: false, peso: 0, fe: null, sinFecha: false, motivo: "" };
    var estOk = (a.estatus === "en_proceso" || !a.estatus || aj.incluir === true);
    if (!estOk) { d.motivo = "estatus " + a.estatus; return d; }
    if (aj.incluir === false) { d.motivo = "excluida"; return d; }
    if (a.kit === true && aj.incluir !== true) { d.motivo = "ya hizo su pedido de kit"; return d; }
    var fe = aj.fecha || a.fecha || null;
    d.fe = fe;
    if (fe === null) { d.cuenta = true; d.sinFecha = true; d.peso = aj.peso != null ? Number(aj.peso) : Number(cfg.aper.peso_sin_fecha); d.motivo = "sin fecha"; return d; }
    if (planEngDifDias(raw.hoy, fe) > Number(cfg.aper.vencida_max)) { d.motivo = "fecha vencida"; return d; }
    d.cuenta = true; d.peso = aj.peso != null ? Number(aj.peso) : 1;
    return d;
  });
}

export function planEngSku(cfg: any, raw: any, s0: any, aper: AperturasMotor): any {
  var hoy = raw.hoy, inval: string[] = [];
  var num = function (nombre: string, x: any, def: number, min?: number) {
    if (!planEngValido(x)) { inval.push(nombre); return def; }
    var v = Number(x); return min != null ? Math.max(min, v) : v;
  };
  var s: any = { sku: s0.sku,
    fisico: num("fisico", s0.fisico, 0), yulius: num("yulius", s0.yulius, 0), comprometido: num("comprometido", s0.comprometido, 0),
    costo: num("costo", s0.costo, 0, 0), enOC: num("enOC", s0.enOC, 0, 0), porApertura: num("porApertura", s0.porApertura, 0, 0), minPzas: num("minPzas", s0.minPzas, 0, 0) };
  var mul = num("multiplo", s0.multiplo, 1); s.multiplo = mul > 1 ? mul : 1;
  var ltc = planEngN(s0.lt, 0);
  var lt = ltc > 0 ? Math.ceil(ltc) : Number(cfg.compra.lt_default);
  var diasSeg = (s0.diasSeg == null || !planEngValido(s0.diasSeg)) ? null : Math.max(0, Number(s0.diasSeg));
  var vida = (s0.vida == null || !planEngValido(s0.vida)) ? null : Math.max(0, Number(s0.vida));
  var u: number[] = [], k: number;
  for (k = 0; k < raw.hist; k++) { u.push(Math.max(0, planEngN(s0.u && s0.u[k], 0))); }

  // 4.0 Importación, ciclo de compra y regla de bloqueo por OC propios de su clase
  var imp = lt > Number(cfg.compra.entrega_max);
  var ciclo = planEngNumDef(imp ? cfg.compra.ciclo_imp : cfg.compra.ciclo_nac, imp ? 30 : 7);
  if (ciclo < 1) ciclo = imp ? 30 : 7;
  var bloq = imp ? cfg.compra.bloqueo_oc_imp : cfg.compra.bloqueo_oc;
  if (PLAN_ENG_BLOQ.indexOf(bloq) < 0) bloq = imp ? "si_cubre" : "siempre";
  var P = Math.max(1, Math.floor(planEngNumDef(cfg.compra.prox_dias, 7)));
  var W = Math.max(2, Math.min(52, Math.floor(planEngNumDef(cfg.compra.semanas, 12))));
  var NB = Math.max(0, Math.min(12, Math.floor(planEngNumDef(cfg.compra.bt_semanas, 4))));

  // 4.1–4.2 Ventana efectiva y tasa base
  var tb = planEngTasaBase(cfg, s.sku, u, raw.hist, hoy, vida);
  var Ve = tb.Ve, B = tb.B, robusto = tb.robusto, escala = tb.escala, tasa = tb.tasa;
  var g = Number(cfg.consumo.crecimiento) || 0;
  var f = function (iso: string) { return planEngFactor(cfg, s.sku, iso); };
  // factor futuro (con crecimiento) y suma acumulada SF(1,h)
  var ffc: Record<number, number> = {};
  var ff = function (j: number) {
    if (ffc[j] === undefined) ffc[j] = f(planEngDia(hoy, j)) * Math.pow(1 + g / 100, (j + Ve / 2) / 30);
    return ffc[j];
  };
  var cum = [0];
  var SF1 = function (h: number) {
    while (cum.length <= h) { var j = cum.length; cum.push(cum[j - 1] + ff(j)); }
    return h <= 0 ? 0 : cum[h];
  };

  // 4.3 Cobertura y seguridad
  var dm: number, override = false;
  if (diasSeg !== null) { dm = diasSeg; override = true; }
  else {
    var kp = planEngMasEspecifico(cfg.seg.prefijo, s.sku);
    if (kp !== null) { dm = Number(cfg.seg.prefijo[kp]); override = true; } else dm = Number(cfg.seg.dias);
  }
  var estad = cfg.seg.metodo === "estadistico" && B >= 8 && robusto;
  var H: number, demandaH: number, seguridad = 0;
  if (!estad) {
    H = Math.min(Number(cfg.compra.h_max), Math.ceil(lt + dm));
    demandaH = tasa * SF1(H);
  } else {
    var R = Number(cfg.seg.revision);
    H = Math.min(Number(cfg.compra.h_max), Math.ceil(lt + R));
    demandaH = tasa * SF1(H);
    var fbar = H > 0 ? SF1(H) / H : 1;
    var sigL = lt * (Number(cfg.seg.lt_cv) || 0);
    var z = PLAN_ENG_Z[cfg.seg.servicio]; if (z == null) z = 1.6449;
    seguridad = z * Math.sqrt(Math.pow(escala * fbar, 2) * (H / 7) + Math.pow(tasa * fbar * sigL, 2));
    if (override) { seguridad = Math.max(seguridad, tasa * fbar * Math.max(0, dm - R)); }
  }
  // 4.3b Cobertura extra por ciclo de compra
  var Heff = H + Math.max(0, Math.ceil(ciclo) - P);

  // 4.4 Aperturas
  var nAper = function (Hh: number) {
    if (cfg.aper.incluir === false) return 0; // decisión: no contemplar aperturas en las compras
    var tasaN = Number(cfg.aper.por_mes) * (cfg.aper.horizonte_auto ? Hh : Number(cfg.aper.horizonte)) / 30;
    var calN = 0;
    aper.con.forEach(function (a) { if (a.dias - Number(cfg.aper.antelacion) <= Hh) calN += a.peso; });
    calN += Math.min(aper.sinSuma, Number(cfg.aper.por_mes) * Hh / 30);
    return cfg.aper.modo === "calendario" ? calN : cfg.aper.modo === "mayor" ? Math.max(tasaN, calN) : tasaN;
  };
  var paraAper = s.porApertura * nAper(H);

  // 4.5 Disponible y necesito
  var invBase = (cfg.inv.base === "disponible" ? s.fisico - s.comprometido : s.fisico) + (cfg.inv.yulius ? s.yulius : 0);
  var disponible = invBase + s.enOC;
  var necesito = demandaH + seguridad + paraAper;
  var consumo = tasa * SF1(7) / 7;
  var diasAlcanza = consumo > 0 ? disponible / consumo : null;
  var hayOC = s.enOC > 0;

  // 4.6 Pedido por semana (esta semana, próxima y el calendario completo)
  var redondeo = function (x: number) {
    if (x <= 0) return 0;
    var y = Math.max(x, s.minPzas);
    if (s.multiplo > 1) y = planEngCeil(y / s.multiplo) * s.multiplo;
    return y;
  };
  var Req = function (h: number) { return (tasa * SF1(h) + seguridad) + s.porApertura * nAper(h); };
  var faltaHoy = necesito - disponible;
  var bloqueaPorOC = hayOC && (bloq === "siempre" || (bloq === "si_cubre" && faltaHoy <= Number(cfg.compra.bloqueo_umbral) * necesito));
  var bloqueado = faltaHoy > 1e-9 && bloqueaPorOC;
  var sem: number[] = [], oferta = disponible, kPrimera: number | null = null, kk: number, Q: number;
  for (kk = 0; kk < W; kk++) {
    Q = 0;
    if (kk === 0) {
      if (faltaHoy > 1e-9 && !bloqueaPorOC) Q = redondeo(planEngCeil((Heff === H ? necesito : Req(Heff)) - oferta));
    } else {
      var falta = Req(P * kk + H) - oferta;
      if (falta > 1e-9) Q = redondeo(planEngCeil((Heff === H ? Req(P * kk + H) : Req(P * kk + Heff)) - oferta));
    }
    sem.push(Q); oferta += Q;
    if (Q > 0 && kPrimera === null) kPrimera = kk;
  }
  var pedirEsta = sem[0], pedirProx = sem[1];
  var accion = pedirEsta > 0 ? "PEDIR" : pedirProx > 0 ? (hayOC ? "PRÓXIMA (OC emitida)" : "PRÓXIMA") : "OK";

  // 4.7 Urgencia
  var diasHoy = consumo > 0 ? Math.max(0, invBase) / consumo : null;
  var urgencia = "Normal";
  if (diasHoy !== null) { if (diasHoy < 5) urgencia = "Urgente"; else if (diasHoy < dm) urgencia = "Pronto"; }

  // 4.10 Seguimiento de ventas: lo que el modelo habría proyectado para cada bloque pasado frente a lo realmente vendido
  var btProy: (number | null)[] = [], btReal: (number | null)[] = [], j: number, sh: number, real: number | null, proy: number | null;
  for (j = 1; j <= NB; j++) {
    sh = P * j; real = null; proy = null;
    if (sh <= raw.hist) { real = 0; for (k = P * (j - 1); k < sh; k++) real += u[k]; }
    if (real !== null && raw.hist - sh >= 14) {
      var tbs = planEngTasaBase(cfg, s.sku, u.slice(sh), raw.hist - sh, planEngDia(hoy, -sh), vida === null ? null : Math.max(0, vida - sh));
      var acc = 0, t: number;
      for (t = 1; t <= P; t++) acc += planEngFactor(cfg, s.sku, planEngDia(hoy, -sh + t)) * Math.pow(1 + g / 100, (t + tbs.Ve / 2) / 30);
      proy = tbs.tasa * acc;
    }
    btProy.push(proy); btReal.push(real);
  }

  return { sku: s.sku, tasa: tasa, consumo: consumo, disponible: disponible, invBase: invBase, necesito: necesito, demandaH: demandaH,
    seguridad: seguridad, paraAper: paraAper, H: H, pedirEsta: pedirEsta, pedirProx: pedirProx, accion: accion, urgencia: urgencia,
    diasAlcanza: diasAlcanza, diasHoy: diasHoy, importacion: imp, picos_n: tb.picosN,
    pico_reciente: tb.picoReciente, elegible: robusto, metodo_efectivo: tb.metodoEf, seg_efectiva: estad ? "estadistico" : "dias", Ve: Ve, B: B,
    bloqueado: bloqueado, confianza: tb.confianza, datos_invalidos: inval, lt: lt, dm: dm,
    Heff: Heff, ciclo: ciclo, sem: sem, kPrimera: kPrimera, btProy: btProy, btReal: btReal };
}

export function planEngine(cfg: any, raw: any): { rows: any[]; aper: { cuentan: number } } {
  var det = planEngAperturasDetalle(cfg, raw).filter(function (d) { return d.cuenta; });
  var aper: AperturasMotor = { con: [], sinSuma: 0, n: det.length };
  det.forEach(function (d) {
    if (d.sinFecha) aper.sinSuma += d.peso;
    else aper.con.push({ dias: planEngDifDias(d.fe as string, raw.hoy), peso: d.peso });
  });
  var rows: any[] = [];
  raw.skus.forEach(function (s: any) {
    if (s.estatus === "Hasta Agotar Existencias" || s.estatus === "Inactivo") return;
    rows.push(planEngSku(cfg, raw, s, aper));
  });
  return { rows: rows, aper: { cuentan: aper.n as number } };
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el mismo comando del Step 2.
Expected: PASS (3). Si una fila difiere, la diferencia es del port: no se ajusta la prueba. Se busca con superpowers:systematic-debugging comparando contra las líneas citadas.

Además: `npm run test:funciones` sin `COM_APP_VIEJA`. Expected: 228 passed + 8 ignored (las 3 nuevas se ignoran).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planMotor.ts supabase/functions/_shared/pruebas/appVieja.ts supabase/functions/_shared/planMotor_parity_test.ts
git commit -m "feat(comercializadora): motor completo por artículo portado del plan viejo, con paridad"
```

---

### Task 2: Datos del motor (`_planDatAMotor`), OCs en camino, borradores y configuración completa

**Files:**
- Create: `supabase/functions/_shared/planDatos.ts`
- Create: `supabase/functions/_shared/pruebas/fixturesPlan.ts`
- Modify: `supabase/functions/_shared/planEngine.ts` (exportar cuatro helpers que ya existen)
- Test: `supabase/functions/_shared/planDatos_parity_test.ts`

**Interfaces:**
- Consumes: `mergeCfg`, `medianocheCdmx`, `planDatTipo`, `planEngDifDias`, `type PedidoPlan` (`planEngine.ts`), y los que este paso exporta: `fechaLocal(t: number): string`, `parseItems(x): any[]`, `planCfgNum(v, rango, def)`, `PLAN_AP_FUERA`.
- Produces (`planDatos.ts`):
  - `KPI_AB_DEF: Record<string, number>`, `KPI_AB_CAMPOS: [clave, etiqueta, unidad, ayuda, mín, máx, entero][]`, `kpiAbCfgNorm(x): Record<string, number>`
  - `impTxt(v, max?)`, `impFechaOk(s)`, `zohoOcNorm(z): any | null`
  - `normalizarCfgMotor(x: unknown): any`: `_planCfgNormalizar` completo, incluidos `zoho_oc` y `kpi`.
  - `planHistNecesaria(cfg): number`
  - `zocKey(folio): string`, `zocFuenteBorr(cfg)`, `zocBorradorSet(cfg): Record<string, 1> | null`
  - `interface LineaBorrador { po_number; sku; vendor_name; fecha_oc; cantidad; cantidad_recibida; precio }`
  - `borradoresPlan(R: { ocZohoBorr? }, cfg): Record<string, 1> | null` (decisión 6)
  - `planOcDeZoho(cfg): boolean`, `planOcFuente(R, cfg): any[]`
  - `planInvUltSync(cat): string | null`, `comSaldoCedis(c): number`
  - `interface Servidor { ok; motivo; calc; compras[]; pagos[]; sinCosto[]; sinProveedor[] }`
  - `interface DatosPlan { hoy; hist; histReal; cat; pedidos; lt; map; oc; comp; aperturas; pedAper; kit; conteoUlt; ocZohoBorr?; srv; avisos; cargadoEn }`. Es el `R` de `_planDatCargar`, con `hoy` como día de CDMX.
  - `diaLocal(f): string | null`, `planDatAMotor(R: DatosPlan, cfg): { raw; meta }`
- Produces (`pruebas/fixturesPlan.ts`): `HOY`, `NOMBRES_DATOS`, `CAT`, `MAPA`, `APERTURAS`, `aperturasNorm`, `pedidos(n?)`, `COMP`, `OC`, `ZOHO_OC`, `datos(extra?): DatosPlan`.

- [ ] **Step 1: Pruebas que fallan**

Crear `supabase/functions/_shared/pruebas/fixturesPlan.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Datos de prueba del plan (catálogo, pedidos, OCs, por enviar, aperturas) para las pruebas de paridad del plan 3d.
import { PLAN_AP_FUERA } from "../planEngine.ts";
import type { DatosPlan } from "../planDatos.ts";
import { NOMBRES_MOTOR, rng } from "./appVieja.ts";

export const HOY = "2026-11-02";

/** Lo que planDatos.ts porta, además del motor. */
export const NOMBRES_DATOS = [
  ...NOMBRES_MOTOR, "today", "_planIso", "_planParseItems", "parseLocalDate", "daysUntil", "_CORP_EMAILS", "_PLAN_AP_FUERA",
  "_PLAN_RE_NOTA_APERTURA", "_planDatTipo", "_planDatAMotor", "_planOcDeZoho", "_planOcFuente", "_zocKey", "_zocBorrMemo",
  "_zocFuenteBorr", "_zocBorradorSet", "_comSaldoCedis", "_planInvUltSync", "_planHistNecesaria",
];

export const CAT = [
  { sku: "INS-VAS-001", nombre: "Vaso 12 oz", estatus: "Compra Recurrente", categoria: "Desechables", created_at: "2024-01-10T15:00:00+00:00", costo_unitario: 2.5, saldo_cedis: 50, saldo_yulius: 20, zoho_sync_at: "2026-11-01T12:00:00Z", zoho_stock: 40, zoho_stock_fisico: 45, cantidad_por_apertura: 100, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, proveedor_preferido: "Vasos SA", origen: null },
  { sku: "ALI-JAR-003", nombre: "Mermelada", estatus: "Compra Recurrente", categoria: "Alimentos", created_at: "2026-10-20T05:59:00+00:00", costo_unitario: "40", saldo_cedis: 7, saldo_yulius: null, zoho_sync_at: null, zoho_stock: null, zoho_stock_fisico: null, cantidad_por_apertura: 0, minimo_compra_pzas: 12, multiplo_compra: 6, dias_seguridad: "", proveedor_preferido: null, origen: "IMPORTADO" },
  { sku: "INS-NUE-005", nombre: "Café tostado en grano", estatus: "Compra Recurrente", categoria: "Café", created_at: "2026-10-31T18:00:00+00:00", costo_unitario: null, saldo_cedis: -4, saldo_yulius: 3, zoho_sync_at: "2026-10-20T12:00:00Z", zoho_stock: 2, zoho_stock_fisico: null, cantidad_por_apertura: 3, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: 5, proveedor_preferido: "Tostador", origen: null },
  { sku: "EMP-TAP-007", nombre: "Tapa", estatus: "Compra Unica", categoria: null, created_at: null, costo_unitario: 1, saldo_cedis: 0, saldo_yulius: 0, zoho_sync_at: null, cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, dias_seguridad: null, proveedor_preferido: "Tapas", origen: null },
  { sku: "INS-AGO-009", nombre: "Agotar", estatus: "Hasta Agotar Existencias", categoria: "X", created_at: "2025-01-01", costo_unitario: 3, saldo_cedis: 9, cantidad_por_apertura: 0, minimo_compra_pzas: 0, multiplo_compra: 1, proveedor_preferido: "X", origen: null },
];
export const MAPA = [{ shopify_nombre: "Vaso 12oz", sku: "ins-vas-001 " }, { shopify_nombre: "Mermelada", sku: "ALI-JAR-003" },
  { shopify_nombre: "Tapa", sku: "EMP-TAP-007" }, { shopify_nombre: "Fantasma", sku: "NO-EXISTE" }];
export const APERTURAS = [
  { id: "ap1", estatus: "en_proceso", fecha: "2026-10-25" }, { id: "ap2", estatus: "activa", fecha: "2026-09-01" },
  { id: "ap3", estatus: null, fecha: null }, { id: "ap4", estatus: "activa", fecha: "2026-10-28" },
  { id: "ap5", estatus: "activa", fecha: "2026-10-15" }, { id: "ap6", estatus: "por_abrir", fecha: "2026-11-20" },
];
/** Como _planDatCargar: los estatus fuera del pipeline se conservan; lo demás es 'en_proceso'. */
export const aperturasNorm = (ap: any[]) =>
  ap.map((a) => ({ ...a, estatusOrig: a.estatus, estatus: PLAN_AP_FUERA[a.estatus] ? a.estatus : "en_proceso" }));

/** Pedidos de 95 días (2 a futuro) con ítems sucios, editados, tipos y aperturas variadas. */
export function pedidos(n = 400): any[] {
  const r = rng(99), out: any[] = [];
  const nombres = ["Vaso 12oz", "Mermelada", "Tapa", "Fantasma", "Sin mapeo", "vaso 12oz"];
  for (let i = 0; i < n; i++) {
    const dias = Math.floor(r() * 95) - 2;
    const t = Date.UTC(2026, 10, 2, 0, 0) - dias * 864e5 + Math.floor(r() * 24) * 3600e3 + Math.floor(r() * 60) * 60e3;
    const items: any[] = [];
    for (let j = 0, nl = 1 + Math.floor(r() * 3); j < nl; j++) {
      const conSku = r() < 0.3 ? { sku: r() < 0.5 ? "INS-VAS-001" : "ins-nue-005" } : {};
      const q = r() < 0.05 ? (r() < 0.5 ? -2 : "x") : r() < 0.05 ? null : Math.round(r() * 20);
      items.push({ nombre: nombres[Math.floor(r() * nombres.length)], cantidad: q, ...conSku });
    }
    const v = r(), apSel = r();
    out.push({
      id: "p" + i, fecha_pedido: new Date(t).toISOString(), status: "enviado",
      apertura_id: apSel < 0.3 ? null : apSel < 0.35 ? "000" : apSel < 0.5 ? "ap1" : apSel < 0.6 ? "ap2" : apSel < 0.65 ? "ap3" : apSel < 0.75 ? "ap4" : "ap-x",
      franquiciatario_email: r() < 0.05 ? " WorkAt@mx.thecoffee.jp" : r() < 0.05 ? "marketingtc@mx.thecoffee.jp" : "f@x.com",
      notas_shopify: r() < 0.04 ? "Pedido de APERTURA sucursal" : null,
      es_llenado_canal: r() < 0.03, marketing_proyecto_id: r() < 0.03 ? "m1" : null,
      items: r() < 0.5 ? items : JSON.stringify(items),
      items_editados: v < 0.15 ? items.map((x) => ({ nombre: x.nombre, cantidad: 1 })) : v < 0.2 ? [] : null,
    });
  }
  return out;
}
export const COMP = [
  { id: "c1", sku: "INS-VAS-001", folio: "P-1", cantidad: 5, fecha: "2026-10-30" },
  { id: "c2", sku: "INS-VAS-001", folio: "P-2", cantidad: 7, fecha: "2026-09-15" },            // viejo (> 30 días)
  { id: "c3", sku: "ALI-JAR-003", folio: "P-2", cantidad: 2, fecha: null, fecha_envio: "2026-08-01" },
  { id: "c4", sku: "INS-NUE-005", folio: null, cantidad: "3", fecha: null, fecha_envio: null, created_at: "2026-11-01T10:00:00Z" },
];
export const OC = [
  { id: "o1", sku: "INS-VAS-001", folio: "COM-OC-01250", fecha: "2026-10-20", fecha_arribo: "2026-11-10", cantidad: 100, cantidad_recibida: 20, monto: 900, proveedor: "Vasos SA" },
  { id: "o2", sku: "INS-VAS-001", folio: "COM-OC-01100", fecha: "2026-08-01", fecha_arribo: "2026-08-20", cantidad: 50, cantidad_recibida: 0, monto: 400, proveedor: "Vasos SA" },  // vieja con arribo
  { id: "o3", sku: "ALI-JAR-003", folio: "COM-OC-01120", fecha: "2026-08-15", fecha_arribo: null, cantidad: 30, cantidad_recibida: 0, monto: 0, proveedor: null },          // vieja sin arribo
  { id: "o4", sku: "ALI-JAR-003", folio: "COM-OC-01255", fecha: "2026-10-28", fecha_arribo: "2026-11-05", cantidad: 12, cantidad_recibida: 0, monto: 480, proveedor: "Mermeladas" }, // borrador en la carga de Zoho
  { id: "o5", sku: "INS-NUE-005", folio: "DODO-OC-00070", fecha: "2026-10-30", fecha_arribo: "2026-11-03", cantidad: 10, cantidad_recibida: 10, monto: 50, proveedor: "Tostador" },  // recibida
  { id: "o6", sku: "INS-NUE-005", folio: "DODO-OC-00071", fecha: "2026-10-31", fecha_arribo: "2026-11-04", cantidad: 10, cantidad_recibida: 0, monto: 0, proveedor: "Tostador" },
];
export const ZOHO_OC = { cargado: "2026-10-29T10:00:00Z", conciliado: "2026-10-30T10:00:00Z", lineas: [
  { sku: "ali-jar-003", folio: "COM-OC-01255", prov: "Mermeladas", fecha: "2026-10-28", arribo: "2026-11-05", pend: 12, borrador: true },
  { sku: "INS-VAS-001", folio: "COM-OC-01250", prov: "Vasos SA", fecha: "2026-10-20", arribo: "2026-11-10", pend: 80.00004, monto: "900.456" },
  { sku: "INS-NUE-005", folio: "DODO-OC-00071", prov: "Tostador", fecha: "2026-10-31", arribo: "fecha mala", pend: 10 },
  { sku: "", folio: "X", pend: 3 }, { sku: "Y", folio: "X", pend: 0 },
] };

/** R como lo arma _planDatCargar (la app lo recibe con hoy = today(); el servidor, con el día de CDMX). */
export function datos(extra: Partial<DatosPlan> = {}): DatosPlan {
  return { hoy: HOY, hist: 90, histReal: 400, cat: CAT, pedidos: pedidos(), lt: [{ sku: "INS-VAS-001", dias: 9 }, { sku: "ALI-JAR-003", dias: 0 }],
    map: MAPA, oc: OC, comp: COMP, aperturas: aperturasNorm(APERTURAS), pedAper: [{ pedido_id: "p3" }, { pedido_id: "p10" }],
    kit: { ap1: true }, conteoUlt: { cedis: { "INS-VAS-001": "2026-10-01" }, yulius: {} }, ocZohoBorr: [], srv: null, avisos: [],
    cargadoEn: 1, ...extra };
}
```

Crear `supabase/functions/_shared/planDatos_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de la preparación de datos: _planDatAMotor, _planCfgNormalizar (zoho_oc y kpi incluidos), _planOcFuente,
// _zocBorradorSet y _planHistNecesaria de la app contra planDatos.ts.
import { assert, assertEquals } from "@std/assert";
import {
  borradoresPlan, type DatosPlan, normalizarCfgMotor, planDatAMotor, planHistNecesaria, planInvUltSync, zocBorradorSet, zocKey,
} from "./planDatos.ts";
import { app, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const A = SIN_APP ? null : app(NOMBRES_DATOS, STUBS_MOTOR, HOY);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today() });

const CFGS: Record<string, any> = {
  defecto: {},
  sin_comp_viejo: { inv: { comp_dias: 0 } },
  oc_vencida: { compra: { oc_vencida: 20, lt_default: 10 } },
  originales: { consumo: { items: "originales", ventana: 56, tipos: { marketing: true, corporativo: true, llenado: true } } },
  zoho_plataforma: { zoho_oc: ZOHO_OC },
  zoho_fuente: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho" } },
};

Deno.test({ name: "paridad: normalizarCfgMotor = _planCfgNormalizar (con zoho_oc y kpi)", ignore: SIN_APP }, () => {
  const casos = [null, {}, ...Object.values(CFGS), { kpi: { prec_min: "80", cv_min: 2, cv_max: 1, dias_min: 5000, exc_margen: 12.6 } },
    { kpi: "x", zoho_oc: { lineas: "no" } }];
  for (const c of casos) assertEquals(normalizarCfgMotor(c), A._planCfgNormalizar(c), JSON.stringify(c));
});

Deno.test({ name: "paridad: planDatAMotor = _planDatAMotor (serie, inventario, comprometido, OCs, aperturas)", ignore: SIN_APP }, () => {
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const histReal of [400, 40]) {
      const cfg = A._planCfgNormalizar(c0);
      const R = datos({ histReal });
      const a = A._planDatAMotor(paraApp(R), cfg), s = planDatAMotor(R, cfg);
      assertEquals(s.raw, a.raw, `${n}/${histReal} raw`);
      assertEquals(s.meta, a.meta, `${n}/${histReal} meta`);
    }
  }
});

Deno.test("el fixture ejercita OCs viejas, ignoradas, borradores y comprometido viejo", () => {
  const s = planDatAMotor(datos(), normalizarCfgMotor({ compra: { oc_vencida: 20, lt_default: 10 } }));
  assertEquals(s.meta.staleLn, { "INS-VAS-001": 1, "ALI-JAR-003": 1 });
  assertEquals(s.meta.ignoradas, 2);
  assertEquals(s.meta.compViejo, { uds: 9, ln: 2, folios: 1, dias: 30 });
  assert(s.meta.sinMapear > 0 && s.meta.lineasInvalidas > 0 && s.meta.skuFuera > 0);
  const z = planDatAMotor(datos(), normalizarCfgMotor({ zoho_oc: ZOHO_OC }));
  assertEquals(z.raw.skus.find((x: any) => x.sku === "ALI-JAR-003").enOC, 30); // o4 es borrador en la carga: no cuenta
});

Deno.test({ name: "paridad: _planHistNecesaria con la ventana de Importaciones dentro de rango", ignore: SIN_APP }, () => {
  for (const c of [{ imp: { venta_ventana: 120 } }, { compra: { bt_semanas: 12, prox_dias: 14 }, imp: { venta_ventana: 30 } }, { consumo: { ventana: 180 }, imp: { venta_ventana: 90 } }]) {
    assertEquals(planHistNecesaria(normalizarCfgMotor(c)), A._planHistNecesaria(A._planCfgNormalizar(c)), JSON.stringify(c));
  }
});

Deno.test("planHistNecesaria: sin sección imp usa la ventana por defecto de Importaciones (90) y la acota a [30, 365]", () => {
  assertEquals(planHistNecesaria(normalizarCfgMotor({})), 90);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ imp: { venta_ventana: 20 } })), 84);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ imp: { venta_ventana: 999 } })), 365);
  assertEquals(planHistNecesaria(normalizarCfgMotor({ compra: { bt_semanas: 12, prox_dias: 14 } })), 198);
});

Deno.test("decisión 6: un borrador real de Zoho (com_zoho_oc_lineas) no cuenta como en camino; sin la copia fija del 13-oct", () => {
  const cfg = normalizarCfgMotor({});
  assertEquals(zocBorradorSet(cfg), null);
  const R = datos({ ocZohoBorr: [{ po_number: "OC-1250", sku: "ins-vas-001", vendor_name: "Vasos SA", fecha_oc: "2026-10-20", cantidad: 100, cantidad_recibida: 0, precio: 9 }] });
  assertEquals(borradoresPlan(R, cfg), { "1250|INS-VAS-001": 1 });
  assertEquals(planDatAMotor(R, cfg).raw.skus.find((x: any) => x.sku === "INS-VAS-001").enOC, 50); // solo queda la o2 (vieja)
  assertEquals(zocKey("DODO-OC-00070"), "D70");
});

Deno.test("planInvUltSync toma la sincronización más reciente de zoho_sync_at o zoho_actualizado", () => {
  assertEquals(planInvUltSync([{ zoho_sync_at: "2026-10-01T00:00:00Z" }, { zoho_actualizado: "2026-10-03T00:00:00Z" }, {}]), "2026-10-03T00:00:00Z");
  assertEquals(planInvUltSync([]), null);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planDatos_parity_test.ts`
Expected: FAIL. `planDatos.ts` no existe, y `PLAN_AP_FUERA` no se exporta.

- [ ] **Step 3: Implementar**

En `supabase/functions/_shared/planEngine.ts`, agregar `export` a cuatro declaraciones que ya existen (sin cambiar nada más):

```ts
export function planCfgNum(v: any, rango: [number, number, number], def: any): any {
```
```ts
export function fechaLocal(t: number): string {
```
```ts
export function parseItems(x: any): any[] { if (typeof x === "string") { try { x = JSON.parse(x); } catch { x = []; } } return Array.isArray(x) ? x : []; }
```
```ts
export const PLAN_AP_FUERA: Record<string, number> = { activa: 1, cancelada: 1, cancelacion_pendiente: 1, corporativo: 1 };
```

Crear `supabase/functions/_shared/planDatos.ts`:
- `_planDatAMotor` (33278);
- `_planHistNecesaria` (33133) con la ventana de Importaciones de `_impCfgNorm` (35946);
- `_zohoOcNorm` (38509) y `_zocFuenteBorr`/`_zocBorradorSet` (38525/38532), **sin** `_ZOC_INCLUIDA` (decisión 6);
- `_planOcDeZoho`/`_planOcFuente` (38548/38550), `_zocKey` (38805), `_planInvUltSync`/`_comSaldoCedis` (27514) y `_kpiAbCfgNorm` (40998).

Los días locales del viejo (`parseLocalDate`, `daysUntil`, `new Date(y, m, d)`) se cuentan con `diaLocal` + `planEngDifDias` sobre el día de CDMX.

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de la preparación de datos del Plan de abasto del sitio viejo (app/index.html a9e4a22): _planDatAMotor
// (33278), _planHistNecesaria (33133), _planOcFuente/_planOcDeZoho (38548), _zohoOcNorm (38509), _zocKey (38805),
// _zocBorradorSet (38532), _comSaldoCedis/_planInvUltSync (27514), _kpiAbCfgNorm (40998) y _impTxt/_impFechaOk.
// La app corre en el navegador con la hora de CDMX; aquí "hoy" es 'YYYY-MM-DD' de CDMX y los días se cuentan igual.
// planDatos_parity_test.ts compara contra la app.
import {
  fechaLocal, medianocheCdmx, mergeCfg, parseItems, planCfgNum, planDatTipo, planEngDifDias, type PedidoPlan,
} from "./planEngine.ts";

// ═══ Configuración ═══════════════════════════════════════════════════════════════════════════════════════════════

export const KPI_AB_DEF: Record<string, number> = { prec_min: 70, sesgo_max: 10, cv_min: 0.9, cv_max: 1.15, dias_min: 30, dias_max: 60, exc_margen: 30, exc_max: 10, disp_min: 95 };
/** [clave, etiqueta, unidad, ayuda, mín, máx, entero] (_KPI_AB_CAMPOS). */
export const KPI_AB_CAMPOS: [string, string, string, string, number, number, number][] = [
  ["prec_min", "Precisión del forecast mínima", "%", "Mínimo aceptable de acierto del pronóstico por artículo (4 semanas, ponderado a costo).", 0, 100, 1],
  ["sesgo_max", "Venta vs proyección: desviación máxima (±)", "%", "Cuánto puede alejarse la venta real de lo proyectado sin que sea problema.", 1, 100, 1],
  ["cv_min", "Compras vs venta: mínimo", "×", "Abajo de esto se compra menos de lo que se vende (el inventario se consume). 1 = compras igual a venta.", 0, 5, 0],
  ["cv_max", "Compras vs venta: máximo", "×", "Arriba de esto se compra más de lo que se vende (el inventario se acumula).", 0, 5, 0],
  ["dias_min", "Cobertura de inventario: mínimo", "días", "Menos que esto es riesgo de quedarse sin producto.", 1, 365, 1],
  ["dias_max", "Cobertura de inventario: máximo", "días", "Más que esto es capital parado.", 1, 730, 1],
  ["exc_margen", "Exceso: días sobre la cobertura objetivo", "días", "Un artículo tiene exceso cuando su inventario rebasa lo que pide el plan (lead time + seguridad + ciclo) más estos días.", 0, 365, 1],
  ["exc_max", "Exceso: máximo del inventario", "%", "Máximo aceptable de inventario (a costo) en exceso o sin venta.", 0, 100, 1],
  ["disp_min", "Disponibilidad mínima", "%", "Mínimo de artículos con venta que deben tener inventario disponible hoy.", 0, 100, 1],
];
export function kpiAbCfgNorm(x: any): Record<string, number> {
  var o: Record<string, number> = {};
  KPI_AB_CAMPOS.forEach(function (f) {
    var v = x && typeof x === "object" ? x[f[0]] : undefined, n = Number(v);
    if (v === undefined || v === null || v === "" || !isFinite(n)) { o[f[0]] = KPI_AB_DEF[f[0]]; return; }
    n = Math.min(f[5], Math.max(f[4], n)); o[f[0]] = f[6] ? Math.round(n) : n;
  });
  // un documento editado a mano con el mínimo igual o mayor que el máximo vuelve a los valores sugeridos de ese par
  if (o.cv_min >= o.cv_max) { o.cv_min = KPI_AB_DEF.cv_min; o.cv_max = KPI_AB_DEF.cv_max; }
  if (o.dias_min >= o.dias_max) { o.dias_min = KPI_AB_DEF.dias_min; o.dias_max = KPI_AB_DEF.dias_max; }
  return o;
}

export function impTxt(v: any, max?: number): string { return String(v == null ? "" : v).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, max || 80); }
export function impFechaOk(s: any): boolean { return /^20\d\d-\d{2}-\d{2}$/.test(String(s || "")) && !isNaN(new Date(s + "T00:00:00") as any); }

export function zohoOcNorm(z: any): any {
  if (!z || typeof z !== "object" || !Array.isArray(z.lineas)) return null;
  var ls: any[] = [];
  z.lineas.slice(0, 3000).forEach(function (l: any) {
    if (!l || typeof l !== "object") return;
    var sku = impTxt(l.sku, 60), pend = Number(l.pend);
    if (!sku || !isFinite(pend) || pend <= 0) return;
    ls.push({ sku: sku, nom: impTxt(l.nom, 80), folio: impTxt(l.folio, 40), prov: impTxt(l.prov, 80), pend: Math.round(pend * 1e4) / 1e4, arribo: impFechaOk(l.arribo) ? l.arribo : "", fecha: impFechaOk(l.fecha) ? l.fecha : "", creada: impFechaOk(l.creada) ? l.creada : "", monto: isFinite(Number(l.monto)) && Number(l.monto) > 0 ? Math.round(Number(l.monto) * 100) / 100 : null, borrador: !!l.borrador });
  });
  if (!ls.length) return null;
  var folios: Record<string, 1> = {}, bor: Record<string, 1> = {}; ls.forEach(function (l) { if (l.folio) { folios[l.folio] = 1; if (l.borrador) bor[l.folio] = 1; } });
  return { cargado: impTxt(z.cargado, 40), por: impTxt(z.por, 80), archivo: impTxt(z.archivo, 120), conciliado: impTxt(z.conciliado, 40), ocs: Object.keys(folios).length, borradores: Object.keys(bor).length, lineas: ls };
}

/**
 * _planCfgNormalizar completo para el motor: mergeCfg (planEngine.ts, ya con paridad) más las dos secciones que mergeCfg
 * deja tal cual y que el plan sí usa: zoho_oc (OCs cargadas de Zoho) y kpi (metas de Indicadores).
 */
export function normalizarCfgMotor(x: any): any {
  var c = mergeCfg(x);
  c.zoho_oc = zohoOcNorm(x && typeof x === "object" ? x.zoho_oc : null);
  c.kpi = kpiAbCfgNorm(x && typeof x === "object" ? x.kpi : null);
  return c;
}

/** Ventana de venta de Importaciones: _impCfgNorm la deja en [30, 365] y en 90 si falta (también sin sección imp). */
function ventanaImp(imp: any): number {
  if (!imp || typeof imp !== "object") return 90;
  return planCfgNum(imp.venta_ventana, [30, 365, 1], 90);
}
/** Días de pedidos que hay que leer (_planHistNecesaria). Al menos 84; con la ventana de Importaciones (90 por defecto). */
export function planHistNecesaria(cfg: any): number {
  return Math.max(cfg.consumo.ventana, 84, Math.min(365, Number(cfg.compra.prox_dias || 7) * Number(cfg.compra.bt_semanas || 0) + cfg.consumo.ventana), ventanaImp(cfg.imp));
}

// ═══ OCs ═════════════════════════════════════════════════════════════════════════════════════════════════════════

// Llave de folio: solo los dígitos sin ceros a la izquierda ("COM-OC-01258" = "OC 1258"); las OCs de DODO llevan su propia serie.
export function zocKey(folio: any): string {
  var s = String(folio || "").toUpperCase(), d = s.replace(/\D/g, "").replace(/^0+/, "");
  return d ? (/DODO/.test(s) ? "D" : "") + d : "";
}
/** Líneas de la carga de Zoho guardada en la configuración. Decisión 6: sin la copia fija _ZOC_INCLUIDA del 13-oct. */
export function zocFuenteBorr(cfg: any): { ls: any[]; fecha: string; ref: any } | null {
  var z = cfg && cfg.zoho_oc, ok = !!(z && z.lineas && z.lineas.length);
  if (ok) return { ls: z.lineas, fecha: String(z.cargado || "").slice(0, 10), ref: z };
  return null;
}
// Líneas en BORRADOR (OC creada pero aún no enviada), por folio y SKU: nunca cuentan como en camino
export function zocBorradorSet(cfg: any): Record<string, 1> | null {
  var f = zocFuenteBorr(cfg); if (!f) return null;
  var s: Record<string, 1> = {}, n = 0; f.ls.forEach(function (l: any) { if (l.borrador) { var k = zocKey(l.folio); if (k) { s[k + "|" + String(l.sku).trim().toUpperCase()] = 1; n++; } } });
  return n ? s : null;
}

/** Línea de una OC de Zoho en borrador (com_zoho_oc_lineas con status 'draft'). */
export interface LineaBorrador { po_number: string; sku: string; vendor_name: string | null; fecha_oc: string | null; cantidad: number | null; cantidad_recibida: number | null; precio: number | null }

/** Decisión 6: los borradores de la configuración más los borradores reales de Zoho que trae zoho-sync. */
export function borradoresPlan(R: { ocZohoBorr?: LineaBorrador[] | null }, cfg: any): Record<string, 1> | null {
  var s: Record<string, 1> = {}, n = 0, base = zocBorradorSet(cfg);
  if (base) Object.keys(base).forEach(function (k) { s[k] = 1; n++; });
  (R.ocZohoBorr || []).forEach(function (l) { var k = zocKey(l.po_number); if (k) { s[k + "|" + String(l.sku).trim().toUpperCase()] = 1; n++; } });
  return n ? s : null;
}

export function planOcDeZoho(cfg: any): boolean { return !!(cfg && cfg.compra && cfg.compra.fuente_oc === "zoho" && cfg.zoho_oc && cfg.zoho_oc.lineas && cfg.zoho_oc.lineas.length); }
// Líneas de OC que cuentan como "en camino": las pendientes de Zoho (si se eligió usar solo el archivo) o las abiertas de la plataforma.
export function planOcFuente(R: { oc: any[]; cat: any[] }, cfg: any): any[] {
  if (!planOcDeZoho(cfg)) return R.oc;
  var m: Record<string, string> = {}; R.cat.forEach(function (c) { m[String(c.sku).trim().toUpperCase()] = c.sku; });
  return cfg.zoho_oc.lineas.map(function (l: any) {
    return { sku: m[String(l.sku).trim().toUpperCase()] || l.sku, folio: l.folio, fecha: l.fecha || null, fecha_arribo: l.arribo || null, cantidad: l.pend, cantidad_recibida: 0, monto: null, proveedor: l.prov };
  });
}

// ═══ Inventario ══════════════════════════════════════════════════════════════════════════════════════════════════

export function planInvUltSync(cat: any[]): string | null { var ult: string | null = null; (cat || []).forEach(function (x) { [x && x.zoho_sync_at, x && x.zoho_actualizado].forEach(function (v) { if (v && (!ult || new Date(v) > new Date(ult))) ult = v; }); }); return ult; }
export function comSaldoCedis(cat: any): number { if (!cat) return 0; if (cat.zoho_sync_at == null) return Number(cat.saldo_cedis || 0); return cat.zoho_stock_fisico != null ? Number(cat.zoho_stock_fisico) : Number(cat.zoho_stock || 0); }

// ═══ Datos crudos → entrada del motor (_planDatAMotor) ═══════════════════════════════════════════════════════════

export interface Servidor {
  ok: boolean; motivo: string | null; calc: string | null;
  compras: { sku: string; fecha_oc: string; cantidad: number; monto: number }[];
  pagos: { sku: string; tipo: string; fecha_pago: string; monto: number }[];
  sinCosto: string[]; sinProveedor: string[];
}
/** Datos crudos del plan (R de _planDatCargar) con "hoy" como día de CDMX. */
export interface DatosPlan {
  hoy: string; hist: number; histReal: number;
  cat: any[]; pedidos: PedidoPlan[]; lt: { sku: string; dias: number | null }[];
  map: { shopify_nombre: string; sku: string }[]; oc: any[]; comp: any[];
  aperturas: { id: any; estatus: string | null; fecha: string | null; estatusOrig?: string | null }[];
  pedAper: { pedido_id: any }[]; kit: Record<string, boolean>;
  conteoUlt: { cedis: Record<string, string>; yulius: Record<string, string> };
  ocZohoBorr?: LineaBorrador[] | null;
  srv: Servidor | null; avisos: string[]; cargadoEn: number;
}

/** parseLocalDate del viejo como día 'YYYY-MM-DD' (o null). `new Date(y, m-1, d)` normaliza desbordes igual que Date.UTC. */
export function diaLocal(f: any): string | null {
  if (!f) return null;
  const s = (f.includes ? f.includes("T") : false) ? f.split("T")[0] : f;
  const [y, m, d] = (s + "").split("-").map(Number);
  if (!y || !m || !d) return null;
  return new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
}

export function planDatAMotor(R: DatosPlan, cfg: any): { raw: any; meta: any } {
  var hoyIso = R.hoy, hoyT = medianocheCdmx(R.hoy), hist = R.hist;
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var u: Record<string, number[]> = {}, sinMapear = 0, tipoUds: Record<string, number> = {}, lineasInvalidas = 0, skuFuera = 0;
  var ton = cfg.consumo.tipos;
  // SKU canónico del catálogo (sin distinguir mayúsculas ni espacios): una línea con un SKU escrito distinto se recupera.
  var catSku: Record<string, string> = {}; R.cat.forEach(function (c) { catSku[String(c.sku).trim().toUpperCase()] = c.sku; });
  R.pedidos.forEach(function (ped) {
    var ft = new Date(ped.fecha_pedido).getTime(); if (isNaN(ft)) return;
    var k = planEngDifDias(hoyIso, fechaLocal(ft));
    if (k < 0) k = 0;
    if (k >= hist) return;
    var tipo = planDatTipo(ped, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max);
    var orig = parseItems(ped.items);
    var its = cfg.consumo.items === "editados" && ped.items_editados ? parseItems(ped.items_editados) : orig;
    var idxNom: Record<string, string> | null = null;
    its.forEach(function (it: any) {
      if (!it) return;
      var sku = it.sku || skuMap[it.nombre];
      // items_editados pierde el sku de sus líneas: se recupera de la línea original con el mismo nombre.
      if (!sku && it.nombre) {
        if (!idxNom) { idxNom = {}; orig.forEach(function (o: any) { if (o && o.sku && o.nombre) idxNom![o.nombre] = o.sku; }); }
        sku = idxNom![it.nombre];
      }
      var qty = Number(it.cantidad == null ? 0 : it.cantidad);
      var enVentana = k < cfg.consumo.ventana; // los avisos hablan de la ventana, no de todo el historial cargado
      if (!isFinite(qty) || qty < 0) { if (ton[tipo] && enVentana) lineasInvalidas++; return; }
      if (!sku) { if (it.nombre && ton[tipo] && enVentana) sinMapear++; return; }
      var real = catSku[String(sku).trim().toUpperCase()];
      if (!real) { if (ton[tipo] && enVentana) skuFuera++; return; }
      sku = real;
      if (k < cfg.consumo.ventana) tipoUds[tipo] = (tipoUds[tipo] || 0) + qty;
      if (!ton[tipo]) return;
      var arr = u[sku] || (u[sku] = new Array(hist).fill(0));
      arr[k] += qty;
    });
  });
  var ltMap: Record<string, number> = {}, ltExiste: Record<string, boolean> = {}; R.lt.forEach(function (l) { ltMap[l.sku] = Number(l.dias || 0); ltExiste[l.sku] = true; });
  // Comprometido = pedidos "por enviar". Los que llevan muchos días así casi siempre ya se enviaron y nadie los marcó.
  var compMap: Record<string, number> = {}, compViejoUds = 0, compViejoLn = 0, compViejoFol: Record<string, 1> = {}, compMax = cfg.inv.comp_dias;
  R.comp.forEach(function (m) {
    var q = Number(m.cantidad || 0), fd = m.fecha || m.fecha_envio || m.created_at, fo = fd ? diaLocal(String(fd).slice(0, 10)) : null;
    if (compMax > 0 && fo && planEngDifDias(hoyIso, fo) > compMax) { compViejoUds += q; compViejoLn++; compViejoFol[m.folio || "?"] = 1; return; }
    compMap[m.sku] = (compMap[m.sku] || 0) + q;
  });
  // OCs abiertas: pendiente por línea (cantidad − recibido). "Vieja": con fecha de arribo vencida hace más de 14 días,
  // o sin fecha de arribo y emitida hace más de max(30, lead time + 14) días.
  var enOC: Record<string, number> = {}, staleUds: Record<string, number> = {}, staleLn: Record<string, number> = {}, borrUds: Record<string, number> = {}, llegaMin: Record<string, string> = {}, ignoradas = 0, zsrc = planOcDeZoho(cfg), dset = borradoresPlan(R, cfg);
  planOcFuente(R, cfg).forEach(function (r) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0));
    if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (esB) return; // OC en borrador en Zoho (creada, aún sin enviar al proveedor): nunca cuenta como en camino
    var vieja = false, edad: number | null = null;
    if (r.fecha) { var fo = diaLocal(r.fecha); edad = fo ? planEngDifDias(hoyIso, fo) : null; }
    if (r.fecha_arribo) { var fa0 = diaLocal(r.fecha_arribo), du = fa0 ? planEngDifDias(fa0, hoyIso) : null; vieja = du !== null && du < -14; }
    else if (edad !== null) vieja = edad > Math.max(30, (ltMap[r.sku] > 0 ? ltMap[r.sku] : cfg.compra.lt_default) + 14);
    if (zsrc) vieja = false; // con OCs de Zoho no hay "viejas": lo que sigue pendiente en Zoho cuenta como en camino
    if (vieja) { staleUds[r.sku] = (staleUds[r.sku] || 0) + pend; staleLn[r.sku] = (staleLn[r.sku] || 0) + 1; }
    if (vieja && cfg.compra.oc_vencida > 0 && edad !== null && edad > cfg.compra.oc_vencida) { ignoradas++; return; }
    enOC[r.sku] = (enOC[r.sku] || 0) + pend;
    if (esB) borrUds[r.sku] = (borrUds[r.sku] || 0) + pend; // inalcanzable (igual que en la app): los borradores ya salieron arriba
    if (!vieja && r.fecha_arribo) { var fa = String(r.fecha_arribo).slice(0, 10); if (!llegaMin[r.sku] || fa < llegaMin[r.sku]) llegaMin[r.sku] = fa; }
  });
  var vacio = new Array(hist).fill(0);
  var skus = R.cat.map(function (c) {
    var vida: number | null = null;
    if (c.created_at) { var fc = new Date(c.created_at).getTime(); if (!isNaN(fc)) vida = Math.max(0, Math.round((hoyT - fc) / 864e5)); }
    return { sku: c.sku, nombre: c.nombre, estatus: c.estatus, costo: Number(c.costo_unitario || 0),
      fisico: comSaldoCedis(c), yulius: Number(c.saldo_yulius || 0), comprometido: compMap[c.sku] || 0,
      lt: ltMap[c.sku] > 0 ? ltMap[c.sku] : null, enOC: enOC[c.sku] || 0, porApertura: Number(c.cantidad_por_apertura || 0),
      minPzas: Number(c.minimo_compra_pzas || 0), multiplo: Number(c.multiplo_compra || 1),
      diasSeg: c.dias_seguridad == null || c.dias_seguridad === "" ? null : Number(c.dias_seguridad), vida: vida, u: u[c.sku] || vacio };
  });
  var aperturas = R.aperturas.map(function (a) { return { id: a.id, fecha: a.fecha ? String(a.fecha).slice(0, 10) : null, estatus: a.estatus, kit: !!R.kit[a.id] }; });
  // La historia que se le da al motor nunca pasa de lo que realmente existe en la base (días sin pedidos no son días en cero).
  var histMotor = Math.max(1, Math.min(hist, R.histReal || hist));
  return { raw: { hoy: hoyIso, hist: histMotor, skus: skus, aperturas: aperturas },
    meta: { compViejo: { uds: compViejoUds, ln: compViejoLn, folios: Object.keys(compViejoFol).length, dias: compMax }, sinMapear: sinMapear, tipoUds: tipoUds, staleUds: staleUds, staleLn: staleLn, borrUds: borrUds, llegaMin: llegaMin, ignoradas: ignoradas, ltExiste: ltExiste, lineasInvalidas: lineasInvalidas, skuFuera: skuFuera, histMotor: histMotor } };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: el comando del Step 2, y también `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planEngine_parity_test.ts`.
Expected: PASS (7) y PASS (5): las exportaciones no cambian `planEngine`.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planDatos.ts supabase/functions/_shared/planDatos_parity_test.ts supabase/functions/_shared/pruebas/fixturesPlan.ts supabase/functions/_shared/planEngine.ts
git commit -m "feat(comercializadora): datos del motor, OCs en camino y borradores de Zoho, con paridad"
```

---

### Task 3: Armado del plan (`_planBuild`), seguimiento de ventas y simulación del servidor

**Files:**
- Create: `supabase/functions/_shared/planBuild.ts`
- Test: `supabase/functions/_shared/planBuild_parity_test.ts`

**Interfaces:**
- Consumes: `planEngine` (Tarea 1); `planDatAMotor`, `borradoresPlan`, `zocKey`, `type DatosPlan` (Tarea 2); `planEngDia`, `planEngDifDias`.
- Produces:
  - `planEsCafe(c): boolean`, `planKey(n): string`
  - `planSinSrv(R: DatosPlan): DatosPlan`
  - `interface Plan`: `rows`, contadores `n*`, `compViejo`, `sinMapear`, `tipoUds`, `aperCuentan`, `avisos`, `nAperturas`, `fuenteCant: 'local' | 'servidor'`, `srvSinPlan`, `srvSinDatos`, `P`, `hoyIso`, `W`, `semIni` y `bt`. Cada fila trae `{ sku, nombre, categoria, esCafe, provNombre, provKey, costo, ltDefault, stale, staleLn, borr, llegaOC, sinMov, importacion, s: { venta, inv, fisico, comp, yulius, enOC, lt, porApertura, minPzas, mult, diasSeg, dm }, calc, sem, fechaLimite, ultConteo, montoEsta, montoProx }`.
  - `planBuild(R: DatosPlan, cfg, opt?: { cafe?: boolean }): Plan`
  - `planBacktestAgg(c, R): void`, `planAplicarServidor(c, R, P, hoyIso): void`, `planCalcMontos(c): void`

- [ ] **Step 1: Prueba que falla**

Crear `supabase/functions/_shared/planBuild_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad del armado del plan: _planBuild (sin proveedores), _planBacktestAgg y _planAplicarServidor contra planBuild.ts.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { type Plan, planBuild, planSinSrv } from "./planBuild.ts";
import { app, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const NOMBRES_BUILD = [...NOMBRES_DATOS, "_planBuild", "_planBacktestAgg", "_planAplicarServidor", "_planCalcMontos", "_planAgruparProv",
  "_planConsolidar", "_minVendorDeGrupo", "_planEsCafe", "_planKey", "_planDiaAtras", "_planSinSrv", "_planCafeFueraLocal"];
const A = SIN_APP ? null : app(NOMBRES_BUILD, STUBS_MOTOR, HOY);
// zprov vacío: sin mínimos de proveedor, _planAgruparProv no consolida (eso es del plan 3f) y no toca las filas.
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today(), zprov: [] });
const CLAVES: (keyof Plan)[] = ["rows", "soloCafe", "nUnica", "nCafe", "ltExiste", "sinMapear", "ignoradas", "compViejo", "tipoUds",
  "aperCuentan", "avisos", "nAperturas", "lineasInvalidas", "skuFuera", "histMotor", "histReal", "lecturaVacia", "nMetodoCae",
  "nRecorteCae", "nSegCae", "nBloqueados", "nCortos", "nInvalidos", "nPicos", "fuenteCant", "srvSinPlan", "srvSinDatos", "P",
  "hoyIso", "W", "semIni", "bt"];

const SRV = { ok: true, motivo: null, calc: "2026-11-02T12:30:00Z", pagos: [], sinCosto: ["INS-NUE-005", "EMP-TAP-007"], sinProveedor: [],
  compras: [{ sku: "INS-VAS-001", fecha_oc: "2026-11-02", cantidad: 40, monto: 100 }, { sku: "INS-VAS-001", fecha_oc: "2026-11-20", cantidad: 12, monto: 30 },
    { sku: "ALI-JAR-003", fecha_oc: "2026-10-30", cantidad: 6, monto: 240 }, { sku: "NO-ESTA", fecha_oc: "2026-11-09", cantidad: 1, monto: 1 }] };

const CFGS: Record<string, any> = {
  defecto: {},
  con_cafe: { compra: { excluir_cafe: false, bt_semanas: 8 } },
  estadistico: { seg: { metodo: "estadistico" }, consumo: { metodo: "mediana", ventana: 56 }, picos: { manejo: "recortar" } },
  zoho: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho", semanas: 20, prox_dias: 5 } },
};

Deno.test({ name: "paridad: planBuild = _planBuild (local, servidor y solo café)", ignore: SIN_APP }, () => {
  let casos = 0;
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const srv of [null, SRV]) {
      for (const opt of [undefined, { cafe: true }]) {
        const cfg = A._planCfgNormalizar(c0), R = datos({ srv: srv as any });
        const a = A._planBuild(paraApp(R), A._planCfgClon(cfg), opt), s = planBuild(R, normalizarCfgMotor(c0), opt);
        for (const k of CLAVES) assertEquals(s[k], a[k], `${n}/${srv ? "srv" : "local"}/${opt ? "cafe" : "todo"} ${k}`);
        casos++;
      }
    }
  }
  assertEquals(casos, 16);
});

Deno.test("planBuild ejercita el seguimiento, la simulación del servidor y Compra Unica", () => {
  const cfg = normalizarCfgMotor({ compra: { excluir_cafe: false, bt_semanas: 8 } });
  const local = planBuild(planSinSrv(datos({ srv: SRV as any })), cfg);
  assertEquals(local.fuenteCant, "local");
  assertEquals(local.nUnica, 1);
  assertEquals(local.bt.n, 8);
  assert(local.bt.semanas.some((s: any) => s.n > 0));
  assert(local.bt.compras.some((x: number) => x > 0));
  const srv = planBuild(datos({ srv: SRV as any }), cfg);
  assertEquals(srv.fuenteCant, "servidor");
  assertEquals(srv.srvSinPlan, 1); // NO-ESTA
  const vaso = srv.rows.find((r) => r.sku === "INS-VAS-001");
  assertEquals([vaso.calc.pedirEsta, vaso.calc.pedirHoy, vaso.calc.fuente], [40, 40, "servidor"]);
  assertEquals(srv.rows.find((r) => r.sku === "INS-NUE-005").calc.fuente, "local-sin-datos");
});
```

- [ ] **Step 2: Correr y ver que falla**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planBuild_parity_test.ts`
Expected: FAIL. `Module not found ".../planBuild.ts"`.

- [ ] **Step 3: Implementar**

Crear `supabase/functions/_shared/planBuild.ts`. Es `_planBuild` (33364) **hasta** `_planBacktestAgg`, sin `hist`/`minManual`/`vendorDe`/`provs` (3f), más `_planBacktestAgg` (33444), `_planAplicarServidor` (33490), `_planCalcMontos` (33520), `_planSinSrv` (33719), `_planEsCafe` (32659) y `_planKey`:

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL del armado del Plan de abasto del sitio viejo (app/index.html a9e4a22): _planBuild (33364) sin la parte de
// proveedores (historial de 60 días, mínimos y _planAgruparProv llegan con el plan 3f), _planBacktestAgg (33444),
// _planAplicarServidor (33490), _planCalcMontos, _planSinSrv, _planEsCafe y _planKey. planBuild_parity_test.ts compara
// contra la app.
import { planEngDia, planEngDifDias } from "./planEngine.ts";
import { planEngine } from "./planMotor.ts";
import { borradoresPlan, type DatosPlan, planDatAMotor, zocKey } from "./planDatos.ts";

// Café tostado (INS-CAF-xxx y similares): se planea por kilos en la pestaña Café, no con el plan semanal.
export function planEsCafe(c: any): boolean { return /caf[eé]\s+tostado/i.test(String(c.nombre || "")) || /^INS-CAF-/i.test(String(c.sku || "")); }
export function planKey(n: any): string { return String(n || "").trim().toLowerCase() || "__sin__"; }
/** Datos crudos sin la simulación del servidor: el cálculo local puro (Indicadores y DOH). */
export function planSinSrv(R: DatosPlan): DatosPlan { return R ? Object.assign({}, R, { srv: null }) : R; }

/** Plan armado (el objeto `c` de _planBuild, sin `hoy` Date ni la parte de proveedores). */
export interface Plan {
  cfg: any; rows: any[]; soloCafe: boolean; nUnica: number; nCafe: number; ltExiste: Record<string, boolean>; sinMapear: number;
  ignoradas: number; compViejo: { uds: number; ln: number; folios: number; dias: number }; tipoUds: Record<string, number>;
  aperCuentan: number; avisos: string[]; nAperturas: number; lineasInvalidas: number; skuFuera: number; histMotor: number;
  histReal: number; lecturaVacia: boolean; nMetodoCae: number; nRecorteCae: number; nSegCae: number; nBloqueados: number;
  nCortos: number; nInvalidos: number; nPicos: number; fuenteCant: "local" | "servidor"; srvSinPlan: number; srvSinDatos: number;
  P: number; hoyIso: string; W: number; semIni: string[]; bt: any;
}

// Arma el plan (filas + avisos + seguimiento) a partir de datos crudos y configuración.
export function planBuild(R: DatosPlan, cfg: any, opt?: { cafe?: boolean }): Plan {
  var conv = planDatAMotor(R, cfg), res = planEngine(cfg, conv.raw), meta = conv.meta, soloCafe = !!(opt && opt.cafe);
  var hoyIso = conv.raw.hoy, P = Math.max(1, Math.floor(Number(cfg.compra.prox_dias) || 7));
  var rawBy: Record<string, any> = {}; conv.raw.skus.forEach(function (s: any) { rawBy[s.sku] = s; });
  var catBy: Record<string, any> = {}; R.cat.forEach(function (c) { catBy[c.sku] = c; });
  var V = cfg.consumo.ventana;
  // Compra Unica (equipo, compras que no se repiten): no entra al plan de compras recurrentes
  var nUnica = 0, nCafe = 0;
  var rows = res.rows.filter(function (e) { var c0 = catBy[e.sku]; if (c0 && c0.estatus === "Compra Unica") { nUnica++; return false; } if (soloCafe) return !!(c0 && planEsCafe(c0)); if (c0 && cfg.compra.excluir_cafe !== false && planEsCafe(c0)) { nCafe++; return false; } return true; }).map(function (e) {
    var s = rawBy[e.sku], c = catBy[e.sku];
    var venta = 0; for (var k = 0; k < Math.min(V, meta.histMotor); k++) venta += Number(s.u[k] || 0);
    var r: any = { sku: e.sku, nombre: c.nombre || e.sku, categoria: c.categoria || "", esCafe: planEsCafe(c),
      provNombre: c.proveedor_preferido || "Sin proveedor asignado", provKey: planKey(c.proveedor_preferido),
      costo: s.costo, ltDefault: !(s.lt > 0), stale: meta.staleUds[e.sku] || 0, staleLn: meta.staleLn[e.sku] || 0, borr: meta.borrUds[e.sku] || 0, llegaOC: meta.llegaMin[e.sku] || null,
      sinMov: venta <= 0 && s.porApertura <= 0, importacion: e.importacion || String(c.origen || "").toUpperCase() === "IMPORTADO",
      s: { venta: venta, inv: e.invBase, fisico: s.fisico, comp: s.comprometido, yulius: s.yulius, enOC: s.enOC, lt: e.lt, porApertura: s.porApertura,
        minPzas: s.minPzas, mult: s.multiplo > 1 ? s.multiplo : 1, diasSeg: s.diasSeg, dm: e.dm },
      calc: e };
    e.diasCubrir = e.H;
    // Sin venta ni piezas por apertura: no hay demanda que cubrir, aunque el inventario esté en negativo.
    if (r.sinMov) { e.pedirEsta = 0; e.pedirProx = 0; e.accion = "OK"; e.sem = e.sem.map(function () { return 0; }); e.kPrimera = null; }
    r.sem = e.sem;
    r.fechaLimite = e.kPrimera === null ? null : planEngDia(hoyIso, P * e.kPrimera);
    r.ultConteo = R.conteoUlt.cedis[e.sku] || null;
    return r;
  });
  var rango: Record<string, number> = { Urgente: 0, Pronto: 1, Normal: 2 };
  rows.sort(function (a, b) {
    return rango[a.calc.urgencia] - rango[b.calc.urgencia]
      || (a.calc.diasHoy === null ? 1e9 : a.calc.diasHoy) - (b.calc.diasHoy === null ? 1e9 : b.calc.diasHoy)
      || a.nombre.localeCompare(b.nombre);
  });
  var c: any = { cfg: cfg, rows: rows, soloCafe: soloCafe, nUnica: nUnica, nCafe: nCafe, ltExiste: meta.ltExiste, sinMapear: meta.sinMapear,
    ignoradas: meta.ignoradas, compViejo: meta.compViejo, tipoUds: meta.tipoUds, aperCuentan: res.aper.cuentan,
    avisos: R.avisos, nAperturas: R.aperturas.length, lineasInvalidas: meta.lineasInvalidas, skuFuera: meta.skuFuera, histMotor: meta.histMotor, histReal: R.histReal || R.hist,
    // Lecturas que en producción nunca deberían venir vacías: si alguna lo está (sin error) casi seguro es un permiso (RLS).
    lecturaVacia: R.cat.length === 0 || R.pedidos.length === 0 || R.oc.length === 0 };
  var act = rows.filter(function (r) { return !r.sinMov && !r.importacion; });
  c.nMetodoCae = cfg.consumo.metodo === "promedio" ? 0 : act.filter(function (r) { return r.calc.metodo_efectivo !== cfg.consumo.metodo; }).length;
  c.nRecorteCae = (cfg.consumo.metodo === "promedio" && cfg.picos.manejo === "recortar") ? act.filter(function (r) { return !r.calc.elegible; }).length : 0;
  c.nSegCae = cfg.seg.metodo === "estadistico" ? act.filter(function (r) { return r.calc.seg_efectiva !== "estadistico"; }).length : 0;
  c.nBloqueados = act.filter(function (r) { return r.calc.bloqueado; }).length;
  c.nCortos = act.filter(function (r) { return r.calc.confianza === "baja"; }).length;
  c.nInvalidos = act.filter(function (r) { return r.calc.datos_invalidos && r.calc.datos_invalidos.length; }).length;
  c.nPicos = act.filter(function (r) { return r.calc.pico_reciente; }).length;
  planAplicarServidor(c, R, P, hoyIso);
  planCalcMontos(c);
  // Calendario semana a semana: longitud de la semana, número de semanas y fecha de inicio de cada una (hoy + P·k).
  c.P = P; c.hoyIso = hoyIso; c.W = rows.length ? rows[0].sem.length : Math.max(2, Math.min(52, Math.floor(Number(cfg.compra.semanas) || 12)));
  if (c.fuenteCant === "servidor") c.W = Math.min(c.W, 12); // la primera fila puede ser de importación (no se recorta)
  c.semIni = []; for (var kk = 0; kk < c.W; kk++) c.semIni.push(planEngDia(hoyIso, P * kk));
  planBacktestAgg(c, R);
  return c as Plan;
}

// Seguimiento de ventas: lo que el modelo habría proyectado para cada semana pasada frente a lo realmente vendido, valuado a
// costo, y las compras (OC emitidas) de esas mismas semanas. Semana pasada j = días [P·(j−1), P·j−1] atrás (j=1 incluye hoy).
export function planBacktestAgg(c: any, R: DatosPlan): void {
  var P = c.P, rows = c.rows, NB = rows.length ? rows[0].calc.btProy.length : 0, semanas: any[] = [], j: number, i: number;
  for (j = 0; j < NB; j++) {
    var s: any = { j: j + 1, ini: planEngDia(c.hoyIso, -(P * (j + 1) - 1)), fin: planEngDia(c.hoyIso, -P * j), proy: 0, real: 0, proyUds: 0, realUds: 0, n: 0, completa: true };
    rows.forEach(function (r: any) {
      var p = r.calc.btProy[j], re = r.calc.btReal[j];
      if (r.sinMov) return;
      if (p == null || re == null) return;
      s.n++; s.proyUds += p; s.realUds += re;
      if (r.costo > 0) { s.proy += p * r.costo; s.real += re * r.costo; }
    });
    s.desv = s.proy > 0 ? (s.real - s.proy) / s.proy : null;
    semanas.push(s);
  }
  // Por artículo, sobre las semanas con proyección (las más recientes primero): ¿se vende más o menos de lo proyectado?
  var arts: any[] = [];
  rows.forEach(function (r: any) {
    if (r.sinMov) return;
    var p = 0, re = 0, n = 0;
    for (i = 0; i < NB; i++) { var a = r.calc.btProy[i], b = r.calc.btReal[i]; if (a == null || b == null) continue; p += a; re += b; n++; }
    if (!n) return;
    arts.push({ sku: r.sku, nombre: r.nombre, n: n, proy: p, real: re, dif: re - p, desv: p > 0 ? (re - p) / p : null, valor: r.costo > 0 ? (re - p) * r.costo : null, costo: r.costo });
  });
  // Compras emitidas por semana (folios con monto). El monto de una OC vive en su primera línea (no se puede repartir por SKU):
  // un folio con algún artículo de importación se cuenta aparte.
  var impBy: Record<string, boolean> = {}; rows.forEach(function (r: any) { if (r.importacion) impBy[r.sku] = true; });
  var comp = new Array(NB).fill(0), compImp = new Array(NB).fill(0), compN = new Array(NB).fill(0), sinMonto = 0, folios: Record<string, any> = {}, dsetBt: Record<string, 1> | null = null;
  try { dsetBt = borradoresPlan(R, c.cfg); } catch { /* un borrador de OC de Zoho no es una compra: no cuenta */ }
  (R.oc || []).forEach(function (r: any) {
    if (!r.folio || !r.fecha) return;
    if (dsetBt && dsetBt[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]) return;
    var f = folios[r.folio] || (folios[r.folio] = { fecha: String(r.fecha).slice(0, 10), monto: 0, imp: false });
    f.monto += Number(r.monto || 0);
    if (impBy[r.sku]) f.imp = true;
  });
  Object.keys(folios).forEach(function (fo) {
    var f = folios[fo], k = planEngDifDias(c.hoyIso, f.fecha);
    if (k < 0 || k >= P * NB) return;
    compN[Math.floor(k / P)]++;
    if (!(f.monto > 0)) { if (!f.imp) sinMonto++; return; }
    (f.imp ? compImp : comp)[Math.floor(k / P)] += f.monto;
  });
  c.bt = { n: NB, semanas: semanas, arts: arts, compras: comp, comprasImp: compImp, comprasN: compN, comprasSinMonto: sinMonto };
}

// La simulación del servidor (la misma de la OC automática, Qué pedir y Pagos) decide cuánto y cuándo comprar.
// Se conservan del Plan el contexto (disponible, consumo, días que alcanza, urgencia) y sus avisos.
export function planAplicarServidor(c: any, R: DatosPlan, P: number, hoyIso: string): void {
  var S = R && R.srv;
  if (!S || !S.ok) { c.fuenteCant = "local"; c.srvSinPlan = 0; c.srvSinDatos = 0; return; }
  c.fuenteCant = "servidor";
  var dia = function (iso: any) { return Date.parse(String(iso).slice(0, 10) + "T00:00:00Z"); }, h = dia(hoyIso), por: Record<string, any[]> = {};
  var fecha = function (k: number) { return new Date(h + P * k * 864e5).toISOString().slice(0, 10); };
  // d <= 0: la compra toca hoy (o ya debió hacerse): es lo que ordena la OC automática.
  (S.compras || []).forEach(function (x) { var d = Math.floor((dia(x.fecha_oc) - h) / 864e5), k = d < 0 ? 0 : Math.floor(d / P); (por[x.sku] = por[x.sku] || []).push({ k: k, q: Number(x.cantidad) || 0, hoy: d <= 0 }); });
  // Sin costo o sin proveedor en Zoho la simulación no los compra: conservan el cálculo local.
  var sinDatos: Record<string, 1> = {}; (S.sinCosto || []).concat(S.sinProveedor || []).forEach(function (s) { sinDatos[s] = 1; });
  var vistos: Record<string, 1> = {}, cafeSrv = !!(c.cfg && c.cfg.compra && c.cfg.compra.excluir_cafe === false);
  c.srvSinDatos = 0;
  c.rows.forEach(function (r: any) {
    vistos[r.sku] = 1;
    if (r.importacion || r.sinMov) return;
    if (r.esCafe && !cafeSrv) return; // la corrida solo trae café con compra.excluir_cafe=false
    // Solo si la simulación no le proyecta ninguna compra: sinCosto también lista SKUs cuya OC abierta no tiene precio.
    if (sinDatos[r.sku] && !por[r.sku]) { r.calc.fuente = "local-sin-datos"; c.srvSinDatos++; return; }
    // El calendario se limita a 12 semanas: la simulación del servidor no ve más lejos.
    var W = Math.min(r.sem.length, 12), sem: number[] = [], i: number, hoyQ = 0; for (i = 0; i < W; i++) sem.push(0);
    (por[r.sku] || []).forEach(function (x) { if (x.k < W) sem[x.k] += x.q; if (x.hoy) hoyQ += x.q; });
    r.sem = sem; r.calc.sem = sem; r.calc.pedirEsta = sem[0]; r.calc.pedirProx = W > 1 ? sem[1] : 0; r.calc.pedirHoy = hoyQ;
    var kP: number | null = null; for (i = 0; i < W; i++) if (sem[i] > 0) { kP = i; break; }
    r.calc.kPrimera = kP; r.fechaLimite = kP === null ? null : fecha(kP);
    var prev = r.calc.accion, oc = !!(r.s && r.s.enOC > 0);
    r.calc.accion = sem[0] > 0 ? "PEDIR" : (W > 1 && sem[1] > 0) ? (oc ? "PRÓXIMA (OC emitida)" : "PRÓXIMA") : (prev === "pico" ? "pico" : "OK");
    r.calc.fuente = "servidor";
  });
  c.srvSinPlan = Object.keys(por).filter(function (s) { return !vistos[s]; }).length;
}

export function planCalcMontos(c: any): void {
  c.rows.forEach(function (r: any) {
    r.montoEsta = r.sinMov ? null : (r.costo > 0 ? r.calc.pedirEsta * r.costo : null);
    r.montoProx = r.sinMov ? null : (r.costo > 0 ? r.calc.pedirProx * r.costo : null);
  });
}
```

- [ ] **Step 4: Correr y ver que pasa**

Run: el comando del Step 2.
Expected: PASS (2).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planBuild.ts supabase/functions/_shared/planBuild_parity_test.ts
git commit -m "feat(comercializadora): armado del plan con seguimiento de ventas y simulación del servidor, con paridad"
```

---

### Task 4: Carga de datos en el servidor (`_planDatCargar`) con caché de 10 minutos

**Files:**
- Modify: `lib/comercializadora/legado.ts` (lecturas del plan)
- Create: `lib/comercializadora/motor.ts`
- Test: `tests/portal/com-motor.test.ts`

**Interfaces:**
- Consumes: `leerTodoCom`, `com`, `ultimaProyeccion` (`consultas.ts`); `servicioLegado`, `SIN_PUENTE`, `type Lectura` (`legado.ts`); `hoyCdmx`; `type Config` (`config.ts`); `fechaLocal`, `medianocheCdmx`, `PLAN_AP_FUERA`, `planEngDia`, `planEngDifDias`, `type PedidoPlan` (`planEngine.ts`); `normalizarCfgMotor`, `planHistNecesaria`, `type DatosPlan`, `type LineaBorrador`, `type Servidor` (Tarea 2).
- Produces (`legado.ts`):
  - `pedidoVigente(p: { status?: string | null }): boolean`
  - `pedidosPlanLegado(filtro?): Promise<Lectura<PedidoPlan[]>>`
  - `primerPedidoLegado(): Promise<Lectura<string | null>>`
  - `interface AperturaPlan { id; estatus; fecha; sucursal }`, `aperturasPlanLegado(): Promise<Lectura<AperturaPlan[]>>`
  - `pedidosAperturaLegado(): Promise<Lectura<{ pedido_id: string }[]>>`
  - `aperturasConPedidoLegado(ids: string[]): Promise<Lectura<string[]>>`
- Produces (`motor.ts`, server-only):
  - `SIN_DATOS_PLAN`, `SIN_CONFIG`
  - `planSrvMotivo(resumen, n): string | null`, `servidorPlan(db, ahora: number): Promise<Servidor>`
  - `normalizarAperturas<A extends { estatus: string | null }>(aps: A[])`
  - `cargarDatosPlan(db, hoy: string, hist: number, ahora: number): Promise<Lectura<DatosPlan>>`
  - `type Motor = { ok: true; R: DatosPlan; cfg: Config; version: number } | { ok: false; error: string }`
  - `motorPlan(db, ahora?: Date): Promise<Motor>`, `limpiarMotor(): void`
  - `memoMotor<T>(m: { R; cfg }, tipo: string, fn: () => T): T`

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-motor.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ puente: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@supabase/supabase-js', () => ({ createClient: () => m.puente }));
import { SIN_PUENTE } from '../../lib/comercializadora/legado';
import {
  limpiarMotor,
  memoMotor,
  motorPlan,
  servidorPlan,
  SIN_DATOS_PLAN,
} from '../../lib/comercializadora/motor';

const AHORA = new Date('2026-11-13T18:00:00Z'); // 13-nov 12:00 CDMX
const ped = (o: Record<string, unknown>) => ({
  id: 'p',
  apertura_id: null,
  franquiciatario_email: 'f@x.com',
  fecha_pedido: '2026-11-10T18:00:00Z',
  status: 'enviado',
  items: [{ sku: 'A', cantidad: 2 }],
  items_editados: null,
  notas_shopify: null,
  es_llenado_canal: false,
  marketing_proyecto_id: null,
  ...o,
});

function puente() {
  return dbFalsa({
    // El primero es el más viejo: dbFalsa no ordena y primerPedidoLegado toma la primera fila.
    com_legado_pedidos: [
      ped({ id: 'p4', fecha_pedido: '2026-05-01T12:00:00Z' }),
      ped({ id: 'p1', apertura_id: 'ap1' }),
      ped({ id: 'p2', status: 'cancelado' }),
      ped({ id: 'p3', status: null }),
    ],
    com_legado_aperturas: [
      { id: 'ap1', estatus: 'por_abrir', fecha: '2026-11-20', sucursal: 'Polanco' },
      { id: 'ap2', estatus: 'activa', fecha: '2026-01-10', sucursal: 'Roma' },
    ],
    com_legado_pedidos_apertura: [{ pedido_id: 'p1' }, { pedido_id: null }],
  });
}
function sesion(extra: Record<string, Record<string, unknown>[]> = {}) {
  return dbFalsa({
    com_plan_config: [{ id: 1, config: {}, version: 3 }],
    com_catalogo: [
      { sku: 'A', nombre: 'Vaso', estatus: 'Compra Recurrente', costo_unitario: 2 },
      { sku: 'B', nombre: 'Viejo', estatus: 'Inactivo' },
    ],
    com_lead_times: [{ sku: 'A', dias: 9 }],
    com_sku_mapping: [{ shopify_nombre: 'Vaso 12oz', sku: 'A' }],
    com_movimientos: [
      {
        id: 'm1',
        tipo: 'compra',
        sku: 'A',
        folio: 'OC-1',
        fecha: '2026-11-01',
        cantidad: 10,
        cantidad_recibida: 0,
      },
      {
        id: 'm2',
        tipo: 'venta',
        estado: 'por_enviar',
        sku: 'A',
        folio: 'V-1',
        cantidad: 3,
        fecha: '2026-11-12',
      },
      {
        id: 'm3',
        tipo: 'venta',
        estado: 'enviado',
        sku: 'A',
        folio: 'V-0',
        cantidad: 9,
        fecha: '2026-11-01',
      },
      {
        id: 'm4',
        tipo: 'ajuste',
        motivo: 'Conteo físico',
        sku: 'A',
        origen: 'CEDIS',
        fecha_conteo: '2026-11-01',
      },
      { id: 'm5', tipo: 'ajuste', motivo: 'Conteo físico', sku: 'A', origen: 'Yulius', fecha: '2026-10-20' },
    ],
    com_zoho_oc_lineas: [
      {
        zoho_po_id: 'z1',
        po_number: 'OC-9',
        status: 'draft',
        sku: 'A',
        cantidad: 5,
        cantidad_recibida: 0,
        precio: 2,
      },
      {
        zoho_po_id: 'z2',
        po_number: 'OC-8',
        status: 'open',
        sku: 'A',
        cantidad: 5,
        cantidad_recibida: 0,
        precio: 2,
      },
    ],
    com_sync_log: [],
    com_pago_proyectado: [],
    ...extra,
  });
}

describe('motor del plan: carga (port de _planDatCargar) y caché', () => {
  beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'http://x');
    vi.stubEnv('SUPABASE_SECRET_KEY', 'k');
    limpiarMotor();
    m.puente = puente().db;
  });
  afterEach(() => vi.unstubAllEnvs());

  it('arma los datos crudos: catálogo sin inactivos, pedidos vigentes de la ventana, kits, conteos y borradores', async () => {
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    expect(r.version).toBe(3);
    expect(r.R.hoy).toBe('2026-11-13');
    expect(r.R.hist).toBe(90); // ventana de Importaciones por defecto
    expect(r.R.histReal).toBe(197); // 1-may → 13-nov, días de CDMX, +1
    expect(r.R.cat.map((c) => c.sku)).toEqual(['A']);
    expect(r.R.pedidos.map((p) => p.id)).toEqual(['p1']); // p4 fuera de la ventana; cancelado y status nulo fuera
    expect(r.R.comp.map((x) => x.id)).toEqual(['m2']);
    expect(r.R.aperturas).toEqual([
      {
        id: 'ap1',
        estatus: 'en_proceso',
        estatusOrig: 'por_abrir',
        fecha: '2026-11-20',
        sucursal: 'Polanco',
      },
      { id: 'ap2', estatus: 'activa', estatusOrig: 'activa', fecha: '2026-01-10', sucursal: 'Roma' },
    ]);
    expect(r.R.kit).toEqual({ ap1: true });
    expect(r.R.pedAper).toEqual([{ pedido_id: 'p1' }]);
    expect(r.R.conteoUlt).toEqual({ cedis: { A: '2026-11-01' }, yulius: { A: '2026-10-20' } });
    expect(r.R.ocZohoBorr?.map((l) => l.po_number)).toEqual(['OC-9']);
    expect(r.R.srv).toMatchObject({ ok: false, motivo: 'sin corrida' });
    expect(r.R.avisos).toEqual([]);
  });

  it('sin puente o sin llave de servicio: no calcula y lo dice claro', async () => {
    m.puente = dbFalsa({}, [{ tabla: 'com_legado_pedidos', op: 'select' }]).db;
    expect(await motorPlan(sesion().db, AHORA)).toEqual({ ok: false, error: SIN_PUENTE });
    limpiarMotor();
    vi.stubEnv('SUPABASE_SECRET_KEY', '');
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
    expect(await motorPlan(sesion().db, AHORA)).toEqual({ ok: false, error: SIN_PUENTE });
  });

  it('si falla una lectura obligatoria de com_*, no calcula', async () => {
    const s = dbFalsa({ com_plan_config: [{ id: 1, config: {}, version: 1 }] }, [
      { tabla: 'com_catalogo', op: 'select' },
    ]);
    expect(await motorPlan(s.db, AHORA)).toEqual({ ok: false, error: SIN_DATOS_PLAN });
  });

  it('sin aperturas: sigue con un aviso (el plan no suma aperturas ni kits)', async () => {
    const p = puente();
    m.puente = dbFalsa(p.tablas, [{ tabla: 'com_legado_aperturas', op: 'select' }]).db;
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    expect(r.R.avisos).toEqual(['aperturas']);
    expect(r.R.aperturas).toEqual([]);
    expect(r.R.kit).toEqual({});
  });

  it('reutiliza los datos 10 minutos; después, o al cambiar el día de CDMX, vuelve a leer', async () => {
    const s = sesion();
    const lecturas = () => s.consultas.filter((c) => c.tabla === 'com_catalogo').length;
    await motorPlan(s.db, new Date('2026-11-14T05:50:00Z')); // 13-nov 23:50 CDMX
    await motorPlan(s.db, new Date('2026-11-14T05:58:00Z'));
    expect(lecturas()).toBe(1);
    const r = await motorPlan(s.db, new Date('2026-11-14T06:01:00Z')); // 14-nov 00:01 CDMX
    expect(lecturas()).toBe(2);
    expect(r.ok && r.R.hoy).toBe('2026-11-14');
    await motorPlan(s.db, new Date('2026-11-14T06:12:00Z'));
    expect(lecturas()).toBe(3);
  });

  it('si otra persona guarda una configuración que pide más historia, vuelve a leer con esa historia', async () => {
    const s = sesion();
    await motorPlan(s.db, AHORA);
    s.tablas.com_plan_config[0].config = { compra: { bt_semanas: 12, prox_dias: 14 } };
    s.tablas.com_plan_config[0].version = 4;
    const r = await motorPlan(s.db, new Date(AHORA.getTime() + 60_000));
    expect(r.ok && [r.R.hist, r.version]).toEqual([198, 4]);
  });

  it('memoMotor calcula una vez por datos + configuración; limpiarMotor la vacía', async () => {
    const r = await motorPlan(sesion().db, AHORA);
    if (!r.ok) throw new Error(r.error);
    const fn = vi.fn(() => 42);
    expect(memoMotor(r, 'kpi', fn)).toBe(42);
    expect(memoMotor(r, 'kpi', fn)).toBe(42);
    expect(fn).toHaveBeenCalledTimes(1);
    limpiarMotor();
    memoMotor(r, 'kpi', fn);
    expect(fn).toHaveBeenCalledTimes(2);
  });

  it('simulación del servidor: reciente y completa, incompleta o vieja', async () => {
    const log = (filas: number, calc = '2026-11-13T12:30:00Z') => ({
      com_sync_log: [
        {
          proceso: 'com-proyeccion',
          ok: true,
          inicio: calc,
          resumen: { calculado_at: calc, filas, sinCosto: ['Z'] },
        },
      ],
      com_pago_proyectado: [
        {
          id: 1,
          calculado_at: '2026-11-13T12:30:00Z',
          sku: 'A',
          tipo: 'proyectado',
          fecha_oc: '2026-11-13',
          cantidad: 4,
          monto: 8,
        },
        {
          id: 2,
          calculado_at: '2026-11-13T12:30:00Z',
          sku: 'A',
          tipo: 'oc',
          fecha_pago: '2026-11-20',
          monto: 20,
        },
      ],
    });
    const ok = await servidorPlan(sesion(log(2)).db, AHORA.getTime());
    expect(ok).toMatchObject({ ok: true, sinCosto: ['Z'], compras: [{ sku: 'A', cantidad: 4 }] });
    expect((await servidorPlan(sesion(log(5)).db, AHORA.getTime())).motivo).toBe(
      'corrida incompleta (se está recalculando)',
    );
    expect((await servidorPlan(sesion(log(2, '2026-11-12T02:00:00Z')).db, AHORA.getTime())).motivo).toBe(
      'corrida de hace 40 h',
    );
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-motor.test.ts`
Expected: FAIL. `Failed to resolve import "../../lib/comercializadora/motor"`.

- [ ] **Step 3: Implementar**

En `lib/comercializadora/legado.ts`, importar el tipo del pedido debajo de `import { leerTodoCom } from './consultas';`:

```ts
import type { PedidoPlan } from '../../supabase/functions/_shared/planEngine.ts';
```

y agregar al final:

```ts
// ── Plan 3d: lo que lee el motor de planeación (_planDatCargar) ──────────────────────────────────────────────────

const COLUMNAS_PLAN =
  'id,apertura_id,franquiciatario_email,fecha_pedido,status,items,items_editados,notas_shopify,es_llenado_canal,marketing_proyecto_id';
const CANCELADOS = ['cancelado', 'cancelacion_pendiente'];
/** `.not('status','in','("cancelado","cancelacion_pendiente")')` del viejo: en SQL, un status nulo tampoco pasa. */
export const pedidoVigente = (p: { status?: string | null }) =>
  p.status != null && !CANCELADOS.includes(p.status);

async function leerPuente<T>(fn: (db: SupabaseClient) => Promise<T>): Promise<Lectura<T>> {
  const db = servicioLegado();
  if (!db) return { ok: false, error: SIN_PUENTE };
  try {
    return { ok: true, datos: await fn(db) };
  } catch {
    return { ok: false, error: SIN_PUENTE };
  }
}

/** Pedidos vigentes (sin cancelados ni status nulo) con las columnas del plan, paginados. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function pedidosPlanLegado(filtro?: (q: any) => any): Promise<Lectura<PedidoPlan[]>> {
  return leerPuente(async (db) =>
    (await leerTodoCom<PedidoPlan>(db, 'com_legado_pedidos', COLUMNAS_PLAN, 'id', filtro)).filter(
      pedidoVigente,
    ),
  );
}

/** Fecha del primer pedido de la base: el motor nunca ve más historia que la que existe. */
export function primerPedidoLegado(): Promise<Lectura<string | null>> {
  return leerPuente(async (db) => {
    const r = await db
      .from('com_legado_pedidos')
      .select('fecha_pedido')
      .order('fecha_pedido', { ascending: true })
      .limit(1);
    if (r.error) throw r.error;
    return ((r.data?.[0] as { fecha_pedido?: string } | undefined)?.fecha_pedido ?? null) as string | null;
  });
}

export interface AperturaPlan {
  id: string;
  estatus: string | null;
  fecha: string | null;
  sucursal: string | null;
}
export function aperturasPlanLegado(): Promise<Lectura<AperturaPlan[]>> {
  return leerPuente((db) =>
    leerTodoCom<AperturaPlan>(db, 'com_legado_aperturas', 'id,estatus,fecha,sucursal', 'id'),
  );
}

export function pedidosAperturaLegado(): Promise<Lectura<{ pedido_id: string }[]>> {
  return leerPuente(async (db) =>
    (
      await leerTodoCom<{ pedido_id: string | null }>(
        db,
        'com_legado_pedidos_apertura',
        'pedido_id',
        'pedido_id',
      )
    ).filter((p): p is { pedido_id: string } => p.pedido_id != null),
  );
}

/** De `ids`, las aperturas que ya tienen algún pedido vigente (ya hicieron su kit). En lotes de 80, como el viejo. */
export function aperturasConPedidoLegado(ids: string[]): Promise<Lectura<string[]>> {
  return leerPuente(async (db) => {
    const con = new Set<string>();
    for (let i = 0; i < ids.length; i += 80) {
      const lote = ids.slice(i, i + 80);
      const filas = await leerTodoCom<{ apertura_id: string; status: string | null }>(
        db,
        'com_legado_pedidos',
        'id,apertura_id,status',
        'id',
        (q) => q.in('apertura_id', lote),
      );
      filas.filter(pedidoVigente).forEach((p) => con.add(p.apertura_id));
    }
    return [...con];
  });
}
```

Crear `lib/comercializadora/motor.ts`:

```ts
import 'server-only';
import { com, leerTodoCom, ultimaProyeccion } from './consultas';
import type { Config } from './config';
import { hoyCdmx } from './fechas';
import {
  aperturasConPedidoLegado,
  aperturasPlanLegado,
  pedidosAperturaLegado,
  pedidosPlanLegado,
  primerPedidoLegado,
  type Lectura,
} from './legado';
import {
  fechaLocal,
  medianocheCdmx,
  PLAN_AP_FUERA,
  planEngDia,
  planEngDifDias,
} from '../../supabase/functions/_shared/planEngine.ts';
import {
  normalizarCfgMotor,
  planHistNecesaria,
  type DatosPlan,
  type LineaBorrador,
  type Servidor,
} from '../../supabase/functions/_shared/planDatos.ts';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Fila = Record<string, any>;

export const SIN_DATOS_PLAN = 'No se pudieron leer los datos del plan. Intenta de nuevo.';
export const SIN_CONFIG = 'No se pudo leer la configuración del plan. Intenta de nuevo.';
const VIDA_MS = 10 * 60 * 1000; // como _planAsegurar: los datos crudos se reutilizan 10 minutos

// com_catalogo con las columnas que usa el plan (el viejo leía '*').
const CATALOGO =
  'sku,nombre,estatus,categoria,costo_unitario,saldo_cedis,saldo_yulius,zoho_stock,zoho_stock_fisico,zoho_sync_at,' +
  'zoho_actualizado,cantidad_por_apertura,minimo_compra_pzas,multiplo_compra,dias_seguridad,created_at,' +
  'proveedor_preferido,origen,zoho_vendor_id';

/** _planSrvMotivo: corrida vacía o con distinto número de filas que las que el log dice que guardó. */
export function planSrvMotivo(resumen: { filas?: unknown } | null, n: number): string | null {
  if (!resumen || resumen.filas == null) return null;
  const esp = Number(resumen.filas);
  if (esp === 0) return 'corrida vacía';
  if (Number.isFinite(esp) && n !== esp) return 'corrida incompleta (se está recalculando)';
  return null;
}

const SIN_SRV = (motivo: string | null, calc: string | null = null): Servidor => ({
  ok: false,
  motivo,
  calc,
  compras: [],
  pagos: [],
  sinCosto: [],
  sinProveedor: [],
});

/** La simulación del servidor (com-proyeccion), si hay una corrida de menos de 36 h (bloque R.srv de _planDatCargar). */
export async function servidorPlan(db: unknown, ahora: number): Promise<Servidor> {
  try {
    const p = await ultimaProyeccion(db);
    const calc = p?.resumen.calculado_at ?? null;
    if (!calc) return SIN_SRV('sin corrida');
    const edad = (ahora - new Date(calc).getTime()) / 36e5;
    if (!(edad <= 36)) return SIN_SRV(`corrida de hace ${isNaN(edad) ? '?' : Math.round(edad)} h`, calc);
    const filas = await leerTodoCom<Fila>(
      db,
      'com_pago_proyectado',
      'id,sku,tipo,fecha_oc,fecha_pago,cantidad,monto',
      'id',
      (q) => q.eq('calculado_at', calc),
    );
    const mot = planSrvMotivo(p!.resumen, filas.length);
    if (mot) return SIN_SRV(mot, calc);
    const r = p!.resumen as Fila;
    return {
      ok: true,
      motivo: null,
      calc,
      compras: filas
        .filter((x) => x.tipo === 'proyectado')
        .map((x) => ({ sku: x.sku, fecha_oc: x.fecha_oc, cantidad: x.cantidad, monto: x.monto })),
      pagos: filas.map((x) => ({ sku: x.sku, tipo: x.tipo, fecha_pago: x.fecha_pago, monto: x.monto })),
      sinCosto: Array.isArray(r.sinCosto) ? r.sinCosto : [],
      sinProveedor: Array.isArray(r.sinProveedor) ? r.sinProveedor : [],
    };
  } catch (e) {
    return SIN_SRV('error: ' + ((e as Error)?.message || String(e)));
  }
}

/** Pipeline de aperturas (como Inicio del viejo): lo que no está operando, cancelado ni es corporativo está en proceso. */
export const normalizarAperturas = <A extends { estatus: string | null }>(aps: A[]) =>
  aps.map((a) => ({
    ...a,
    estatusOrig: a.estatus,
    estatus: PLAN_AP_FUERA[a.estatus as string] ? a.estatus : 'en_proceso',
  }));

const opcional = async <T>(p: Promise<T>): Promise<T | null> => {
  try {
    return await p;
  } catch {
    return null;
  }
};

/**
 * Port de _planDatCargar: lee com_* con la sesión y los pedidos del sitio viejo por el puente (llave de servicio).
 * Catálogo, lead times, mapeo, compras, por enviar y pedidos son obligatorios; aperturas, pedidos de apertura, kits,
 * conteos, borradores de Zoho y la simulación del servidor degradan con un aviso.
 */
export async function cargarDatosPlan(
  db: unknown,
  hoy: string,
  hist: number,
  ahora: number,
): Promise<Lectura<DatosPlan>> {
  // _planDiaAtras(hist-1).toISOString(): la medianoche de CDMX de hace hist-1 días.
  const corte = new Date(medianocheCdmx(planEngDia(hoy, -(hist - 1)))).toISOString();
  let base: [
    Fila[],
    { sku: string; dias: number | null }[],
    { shopify_nombre: string; sku: string }[],
    Fila[],
    Fila[],
  ];
  try {
    base = await Promise.all([
      leerTodoCom<Fila>(db, 'com_catalogo', CATALOGO, 'sku', (q) => q.neq('estatus', 'Inactivo')),
      leerTodoCom<{ sku: string; dias: number | null }>(db, 'com_lead_times', 'sku,dias', 'sku'),
      leerTodoCom<{ shopify_nombre: string; sku: string }>(
        db,
        'com_sku_mapping',
        'shopify_nombre,sku',
        'shopify_nombre',
      ),
      leerTodoCom<Fila>(
        db,
        'com_movimientos',
        'id,sku,folio,fecha,fecha_arribo,cantidad,cantidad_recibida,monto,proveedor',
        'id',
        (q) => q.eq('tipo', 'compra'),
      ),
      leerTodoCom<Fila>(
        db,
        'com_movimientos',
        'id,sku,folio,cantidad,fecha,fecha_envio,created_at',
        'id',
        (q) => q.eq('tipo', 'venta').eq('estado', 'por_enviar'),
      ),
    ]);
  } catch {
    return { ok: false, error: SIN_DATOS_PLAN };
  }
  const [cat, lt, map, oc, comp] = base;
  const [pedidos, primero, aperturas, pedAper, conteos, borr, srv] = await Promise.all([
    pedidosPlanLegado((q) => q.gte('fecha_pedido', corte)),
    primerPedidoLegado(),
    aperturasPlanLegado(),
    pedidosAperturaLegado(),
    opcional(
      leerTodoCom<Fila>(db, 'com_movimientos', 'id,sku,origen,fecha_conteo,fecha,created_at', 'id', (q) =>
        q.eq('tipo', 'ajuste').eq('motivo', 'Conteo físico'),
      ),
    ),
    opcional(
      leerTodoCom<LineaBorrador>(
        db,
        'com_zoho_oc_lineas',
        'zoho_po_id,po_number,sku,vendor_name,fecha_oc,cantidad,cantidad_recibida,precio',
        'zoho_po_id',
        (q) => q.eq('status', 'draft').order('sku'),
      ),
    ),
    servidorPlan(db, ahora),
  ]);
  if (!pedidos.ok) return { ok: false, error: pedidos.error };
  const avisos: string[] = [];
  if (!aperturas.ok) avisos.push('aperturas');
  if (!pedAper.ok) avisos.push('pedidos_apertura');
  if (!conteos) avisos.push('conteos');
  if (!borr) avisos.push('borradores de Zoho');
  const aps = normalizarAperturas(aperturas.ok ? aperturas.datos : []);
  // Historia real: días desde el primer pedido de la base (si no se pudo leer, alcanza la ventana pedida).
  let histReal = hist;
  const fp = primero.ok && primero.datos ? new Date(primero.datos).getTime() : NaN;
  if (!isNaN(fp)) histReal = Math.max(1, planEngDifDias(hoy, fechaLocal(fp)) + 1);
  // Aperturas por abrir que ya hicieron su pedido de kit (en cualquier fecha): no vuelven a sumar demanda de apertura.
  const kit: Record<string, boolean> = {};
  const ids = aps.filter((a) => a.estatus === 'en_proceso' || !a.estatus).map((a) => a.id);
  if (ids.length) {
    const k = await aperturasConPedidoLegado(ids);
    if (k.ok) k.datos.forEach((id) => (kit[id] = true));
    else avisos.push('kits');
  }
  // Último conteo por artículo y ubicación (CEDIS / Yulius): contar una bodega no cuenta como contar la otra.
  const conteoUlt: DatosPlan['conteoUlt'] = { cedis: {}, yulius: {} };
  (conteos ?? []).forEach((x) => {
    const f = String(x.fecha_conteo || x.fecha || x.created_at || '').slice(0, 10);
    const ub = String(x.origen || 'CEDIS').toLowerCase() === 'yulius' ? 'yulius' : 'cedis';
    if (f && (!conteoUlt[ub][x.sku] || f > conteoUlt[ub][x.sku])) conteoUlt[ub][x.sku] = f;
  });
  return {
    ok: true,
    datos: {
      hoy,
      hist,
      histReal,
      cat,
      pedidos: pedidos.datos,
      lt,
      map,
      oc,
      comp,
      aperturas: aps,
      pedAper: pedAper.ok ? pedAper.datos : [],
      kit,
      conteoUlt,
      ocZohoBorr: borr ?? [],
      srv,
      avisos,
      cargadoEn: ahora,
    },
  };
}

export type Motor = { ok: true; R: DatosPlan; cfg: Config; version: number } | { ok: false; error: string };

// Caché en memoria del servidor, compartida entre usuarios (decisión 4): com_* se protege por módulo, no por usuario, así
// que todos los que pueden leer Comercializadora ven los mismos datos. Se pierde al reiniciar la instancia.
let cache: { t: number; R: DatosPlan } | null = null;
let memo = new Map<string, unknown>();

/** "Actualizar": la siguiente lectura vuelve a la base y al puente. */
export function limpiarMotor() {
  cache = null;
  memo = new Map();
}

/**
 * Datos crudos y configuración guardada para el motor (_planAsegurar). La configuración se lee siempre (una fila); los
 * datos se reutilizan si son del mismo día de CDMX, alcanzan la historia que pide la configuración y tienen < 10 min.
 */
export async function motorPlan(db: unknown, ahora: Date = new Date()): Promise<Motor> {
  const c = await com(db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
  if (c.error) return { ok: false, error: SIN_CONFIG };
  const cfg = normalizarCfgMotor(c.data?.config ?? null);
  const hoy = hoyCdmx(ahora);
  const hist = planHistNecesaria(cfg);
  const t = ahora.getTime();
  if (!cache || cache.R.hoy !== hoy || cache.R.hist < hist || t - cache.t > VIDA_MS) {
    const r = await cargarDatosPlan(db, hoy, hist, t);
    if (!r.ok) return r;
    cache = { t, R: r.datos };
    memo = new Map();
  }
  return { ok: true, R: cache.R, cfg, version: Number(c.data?.version ?? 0) };
}

/** Resultado de un cálculo sobre el motor, una vez por datos + configuración (_kpiAbObtener; hasta 6 a la vez). */
export function memoMotor<T>(m: { R: DatosPlan; cfg: Config }, tipo: string, fn: () => T): T {
  const k = `${tipo}|${m.R.cargadoEn}|${JSON.stringify(m.cfg)}`;
  if (memo.has(k)) return memo.get(k) as T;
  if (memo.size > 6) memo.clear();
  const v = fn();
  memo.set(k, v);
  return v;
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-motor.test.ts tests/portal/com-legado.test.ts && npm run typecheck`
Expected: PASS (8 + 6).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/legado.ts lib/comercializadora/motor.ts tests/portal/com-motor.test.ts
git commit -m "feat(comercializadora): carga de los datos del plan en el servidor con caché de 10 minutos"
```

---

### Task 5: Indicadores de abasto (`_kpiAbCalc`), estados, ventanas, traza y borradores

**Files:**
- Create: `supabase/functions/_shared/planKpi.ts`
- Test: `supabase/functions/_shared/planKpi_parity_test.ts`

**Interfaces:**
- Consumes: `planBuild`, `planSinSrv` (Tarea 3); `normalizarCfgMotor`, `KPI_AB_DEF`, `borradoresPlan`, `comSaldoCedis`, `planInvUltSync`, `planOcDeZoho`, `planOcFuente`, `zocFuenteBorr`, `zocKey`, `type DatosPlan` (Tarea 2); `parseItems`, `planDatTipo`, `planEngDifDias`, `fechaLocal`.
- Produces:
  - `planMoneyCorto(x): string`
  - `kpiAbMetas(cfg): Record<string, number>`
  - `interface Borrador { folio; prov; fecha; lineas; uds; monto }`, `ocsBorradores(R, cfg): Borrador[]`
  - `interface CheckDatos { id; corto; titulo; valor; est: 'ok' | 'aviso' | 'mal'; detalle; acc; lnk }`
  - `type EstadoRiesgo = 'pedir' | 'confirmar' | 'cubierto' | 'pronto' | 'ok' | 'sinventa'`
  - `interface FilaRiesgo { sku; nombre; cat; prov; fisico; yulius; comp; inv; cons; lt; oc; llega; dias; dLlega; estado; motivo; neg; vieja; esta; costo }`
  - `kpiAbCalc(R: DatosPlan, cfgIn, ahora: number): any`. Devuelve `K` con `metas`, `cfg`, `hoy`, `NB`, `nw`, `nRows`, `P`, `fc`, `cv`, `inv`, `exc`, `disp`, `datos`, `riesgo` y `params`, igual que `_kpiAbCalc` 41012.
  - `kpiAbEstados(K): Record<string, boolean | null | undefined>`
  - `kpiAbVentanas(R, cfgBase, ahora, calc?): { v; acc; desv; actual }[]`
  - `interface Traza { sku; nombre; tasa; venta30; motivo; filas: { ini; fin; real; tipos: [string, number][]; proy; dif }[] }`, `kpiAbTraza(R, K, sku): Traza | null`

- [ ] **Step 1: Pruebas que fallan**

Crear `supabase/functions/_shared/planKpi_parity_test.ts`. Los textos de detalle y los enlaces de "Datos del plan" son del portal (decisión 12): la paridad los compara aparte.

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de los Indicadores de abasto: _kpiAbCalc y _kpiAbEstados de la app contra planKpi.ts, más pruebas a mano de lo
// que la app no deja evaluar aislado (borradores, traza, ventanas) y del tamaño real del catálogo.
import { assert, assertEquals } from "@std/assert";
import { type DatosPlan, normalizarCfgMotor } from "./planDatos.ts";
import { kpiAbCalc, kpiAbEstados, kpiAbTraza, kpiAbVentanas, ocsBorradores } from "./planKpi.ts";
import { app, instanteCdmx, rng, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { CAT, datos, HOY, NOMBRES_DATOS, ZOHO_OC } from "./pruebas/fixturesPlan.ts";

const NOMBRES_KPI = [...NOMBRES_DATOS, "_planBuild", "_planBacktestAgg", "_planAplicarServidor", "_planCalcMontos", "_planAgruparProv",
  "_planConsolidar", "_minVendorDeGrupo", "_planEsCafe", "_planKey", "_planDiaAtras", "_planSinSrv", "_planCafeFueraLocal",
  "_kpiAbMetas", "_kpiAbCalc", "_kpiAbEstados", "_planMoneyCorto"];
// _ocsContadas lee el estado global de la pantalla: aquí devuelve los mismos borradores que calcula el servidor.
const STUBS_KPI = STUBS_MOTOR + "function esc(s){return String(s);} function _ocsContadas(){return{borr:globalThis.__borrPrueba||[]};}";
const A = SIN_APP ? null : app(NOMBRES_KPI, STUBS_KPI, HOY);
const AHORA = instanteCdmx(HOY);
const paraApp = (R: DatosPlan) => ({ ...R, hoy: A.today(), zprov: [] });
/** Los textos de detalle y los enlaces son del portal (sin HTML, rutas nuevas): se comparan aparte. */
const sinTextos = (K: any) => ({ ...K, datos: { ...K.datos, checks: K.datos.checks.map(({ detalle: _d, acc: _a, lnk: _l, ...x }: any) => x) } });

const CFGS: Record<string, any> = {
  defecto: {},
  yulius: { inv: { yulius: true, comp_dias: 0 }, kpi: { exc_margen: 5, prec_min: 60 } },
  zoho: { zoho_oc: ZOHO_OC, compra: { fuente_oc: "zoho", bt_semanas: 10 } },
  sin_aper: { aper: { incluir: false }, consumo: { ventana: 14 } },
};

Deno.test({ name: "paridad: kpiAbCalc = _kpiAbCalc y kpiAbEstados = _kpiAbEstados", ignore: SIN_APP }, () => {
  for (const [n, c0] of Object.entries(CFGS)) {
    for (const srv of [null, { ok: true, motivo: null, calc: "x", compras: [{ sku: "INS-VAS-001", fecha_oc: HOY, cantidad: 999, monto: 1 }], pagos: [], sinCosto: [], sinProveedor: [] }]) {
      const R = datos({ srv: srv as any, ocZohoBorr: [] });
      (globalThis as any).__borrPrueba = ocsBorradores(R, normalizarCfgMotor(c0));
      const a = A._kpiAbCalc(paraApp(R), c0), s = kpiAbCalc(R, c0, AHORA);
      assertEquals(sinTextos(s), sinTextos(a), n);
      assertEquals(kpiAbEstados(s), A._kpiAbEstados(a), n + " estados");
    }
  }
});

Deno.test("Indicadores no usan la simulación del servidor (cálculo local, como la app)", () => {
  const srv = { ok: true, motivo: null, calc: "x", compras: [{ sku: "INS-VAS-001", fecha_oc: HOY, cantidad: 999, monto: 1 }], pagos: [], sinCosto: [], sinProveedor: [] };
  const a = kpiAbCalc(datos(), {}, AHORA), b = kpiAbCalc(datos({ srv: srv as any }), {}, AHORA);
  assertEquals(a.riesgo, b.riesgo);
});

Deno.test("riesgo de quiebre: sin venta, OC vieja sin fecha y el orden por estado", () => {
  const K = kpiAbCalc(datos(), {}, AHORA);
  const r = K.riesgo;
  assertEquals(r.pedir + r.confirmar + r.cubierto + r.pronto + r.ok + r.sinventa, r.filas.length);
  const orden = ["pedir", "confirmar", "cubierto", "pronto", "ok", "sinventa"];
  for (let i = 1; i < r.filas.length; i++) assert(orden.indexOf(r.filas[i - 1].estado) <= orden.indexOf(r.filas[i].estado));
  assertEquals(r.filas.find((f: any) => f.sku === "EMP-TAP-007"), undefined); // Compra Unica no entra
  assertEquals(K.datos.checks.map((c: any) => c.id), ["inv", "neg", "oc", "borr", "env", "lt", "prov", "costo", "map", "ap"]);
  assertEquals(K.datos.checks.find((c: any) => c.id === "ap").lnk, "/comercializadora/catalogo/piezas-apertura");
});

Deno.test("artículo nuevo sin historia ni venta: sin NaN y fuera del forecast", () => {
  const nuevo = { ...CAT[0], sku: "INS-NVO-100", nombre: "Nuevo", created_at: "2026-11-01T18:00:00Z", cantidad_por_apertura: 0 };
  const K = kpiAbCalc(datos({ cat: [...CAT, nuevo], pedidos: [] }), {}, AHORA);
  const f = K.riesgo.filas.find((x: any) => x.sku === "INS-NVO-100");
  assertEquals([f.estado, f.dias, f.cons], ["sinventa", null, 0]);
  assertEquals(K.fc.acc, null);
  for (const v of [K.inv.valor, K.inv.cogsDia, K.exc.valor]) assert(Number.isFinite(v));
});

Deno.test("borradores: los de la plataforma, los de la carga de Zoho y los reales de com_zoho_oc_lineas, sin repetir folio", () => {
  const cfg = normalizarCfgMotor({ zoho_oc: ZOHO_OC });
  const R = datos({ ocZohoBorr: [
    { po_number: "COM-OC-01255", sku: "ALI-JAR-003", vendor_name: "Mermeladas", fecha_oc: "2026-10-28", cantidad: 12, cantidad_recibida: 0, precio: 40 },
    { po_number: "COM-OC-01300", sku: "INS-VAS-001", vendor_name: "Vasos SA", fecha_oc: "2026-11-01", cantidad: 10, cantidad_recibida: 0, precio: 3 },
  ] });
  assertEquals(ocsBorradores(R, cfg).map((b) => [b.folio, b.lineas, b.monto]), [["COM-OC-01255", 1, 480], ["COM-OC-01300", 1, 30]]);
});

Deno.test("traza de un artículo: semana a semana, por tipo de pedido, contra lo proyectado", () => {
  const K = kpiAbCalc(datos(), {}, AHORA);
  const sku = Object.keys(K.fc.porSku)[0];
  const t = kpiAbTraza(datos(), K, sku)!;
  assertEquals(t.filas.length, K.NB);
  assertEquals(t.filas.map((f) => f.real), K.fc.porSku[sku].br);
  assert(t.filas.every((f) => f.tipos.every(([, q]) => q > 0)));
  assertEquals(kpiAbTraza(datos(), K, "NO-EXISTE"), null);
});

Deno.test("ventanas: 14, 21 y la actual, sin repetir y en orden", () => {
  const llamadas: number[] = [];
  const v = kpiAbVentanas(datos(), { consumo: { ventana: 21 } }, AHORA, (R, c, t) => { llamadas.push(c.consumo.ventana); return kpiAbCalc(R, c, t); });
  assertEquals(llamadas, [14, 21]);
  assertEquals(v.map((x) => [x.v, x.actual]), [[14, false], [21, true]]);
});

Deno.test("catálogo grande (1500 artículos, 90 días de pedidos): se calcula en segundos", () => {
  const r = rng(7), cat: any[] = [], ped: any[] = [];
  for (let i = 0; i < 1500; i++) cat.push({ ...CAT[0], sku: "GEN-" + i, nombre: "Artículo " + i, costo_unitario: 1 + (i % 50) });
  for (let i = 0; i < 6000; i++) {
    const items = [1, 2, 3].map(() => ({ sku: "GEN-" + Math.floor(r() * 1500), cantidad: 1 + Math.floor(r() * 5) }));
    ped.push({ id: "g" + i, fecha_pedido: new Date(Date.UTC(2026, 10, 2) - Math.floor(r() * 90) * 864e5).toISOString(), status: "enviado", apertura_id: null, items, items_editados: null });
  }
  const t0 = performance.now();
  const K = kpiAbCalc(datos({ cat, pedidos: ped }), {}, AHORA);
  const ms = performance.now() - t0;
  assertEquals(K.nRows, 1500);
  assert(ms < 10_000, `tardó ${Math.round(ms)} ms`);
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planKpi_parity_test.ts`
Expected: FAIL. `Module not found ".../planKpi.ts"`.

- [ ] **Step 3: Implementar**

Crear `supabase/functions/_shared/planKpi.ts`:
- `_kpiAbCalc` (41012), `_kpiAbEstados` (41151), `_kpiAbMetas` (40993) y `_planMoneyCorto` (35034);
- la cuenta de `_kpiAbVentanas` (41243) y de `_kpiAbTraza` (41563), sin el HTML;
- la parte de borradores de `_ocsContadas` (38649), más los de `com_zoho_oc_lineas` (decisión 6).

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de los Indicadores de abasto del sitio viejo (app/index.html a9e4a22): _kpiAbCalc (41012), _kpiAbEstados
// (41151), _kpiAbMetas (40993), _kpiAbVentanas (41243), el cálculo de _kpiAbTraza (41563), la parte de borradores de
// _ocsContadas (38649) y _planMoneyCorto. Sin HTML: los textos de cada revisión de datos van planos y sus enlaces apuntan
// a las pantallas del portal. planKpi_parity_test.ts compara contra la app.
import { parseItems, planDatTipo, planEngDifDias, fechaLocal } from "./planEngine.ts";
import {
  borradoresPlan, comSaldoCedis, type DatosPlan, KPI_AB_DEF, normalizarCfgMotor, planInvUltSync, planOcDeZoho, planOcFuente,
  zocFuenteBorr, zocKey,
} from "./planDatos.ts";
import { planBuild, planSinSrv } from "./planBuild.ts";

export function planMoneyCorto(x: any): string { x = Number(x || 0); return x >= 1e6 ? "$" + (Math.round(x / 1e5) / 10) + " M" : x >= 1e3 ? "$" + Math.round(x / 1e3) + " k" : "$" + Math.round(x); }

export function kpiAbMetas(cfg: any): Record<string, number> {
  var k = (cfg && cfg.kpi) || {}, o: Record<string, number> = {};
  Object.keys(KPI_AB_DEF).forEach(function (x) { var v = k[x], n = Number(v); o[x] = (v === null || v === undefined || v === "" || !isFinite(n)) ? KPI_AB_DEF[x] : n; });
  return o;
}

export interface Borrador { folio: string; prov: string; fecha: string; lineas: number; uds: number; monto: number }
/**
 * Borradores de OC pendientes de resolver (la mitad "borr" de _ocsContadas): líneas abiertas de la plataforma que son
 * borrador, más los borradores de la carga de Zoho de la configuración que no están en la plataforma y (decisión 6) los
 * borradores reales de com_zoho_oc_lineas que no se vieron antes. Ordenados por monto.
 */
export function ocsBorradores(R: DatosPlan, cfg: any): Borrador[] {
  var dset = borradoresPlan(R, cfg), f: Record<string, Borrador> = {}, borr: Borrador[] = [], vistosB: Record<string, 1> = {};
  planOcFuente(R, cfg).forEach(function (r: any) {
    var pend = Math.max(0, Number(r.cantidad || 0) - Number(r.cantidad_recibida || 0)); if (pend <= 0) return;
    var esB = !!(dset && dset[zocKey(r.folio) + "|" + String(r.sku).trim().toUpperCase()]);
    if (!esB) return;
    var k = (r.folio || "(sin folio)") + "|b", o = f[k];
    if (!o) { o = f[k] = { folio: r.folio || "(sin folio)", prov: r.proveedor || "", fecha: r.fecha ? String(r.fecha).slice(0, 10) : "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += pend; o.monto += Number(r.monto || 0);
  });
  borr.forEach(function (o) { vistosB[zocKey(o.folio)] = 1; });
  var fz = zocFuenteBorr(cfg);
  if (fz) fz.ls.forEach(function (l: any) {
    if (!l.borrador) return; var kz = zocKey(l.folio); if (vistosB[kz]) return;
    var o = f["z|" + kz]; if (!o) { o = f["z|" + kz] = { folio: l.folio, prov: l.prov || "", fecha: l.fecha || "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += Number(l.pend || 0); o.monto += Number(l.monto || 0);
  });
  borr.forEach(function (o) { vistosB[zocKey(o.folio)] = 1; });
  (R.ocZohoBorr || []).forEach(function (l) {
    var kz = zocKey(l.po_number); if (!kz || vistosB[kz]) return;
    var o = f["d|" + kz]; if (!o) { o = f["d|" + kz] = { folio: l.po_number, prov: l.vendor_name || "", fecha: l.fecha_oc ? String(l.fecha_oc).slice(0, 10) : "", lineas: 0, uds: 0, monto: 0 }; borr.push(o); }
    o.lineas++; o.uds += Math.max(0, Number(l.cantidad || 0) - Number(l.cantidad_recibida || 0)); o.monto += Number(l.cantidad || 0) * Number(l.precio || 0);
  });
  borr.sort(function (a, b) { return b.monto - a.monto; });
  return borr;
}

export interface CheckDatos { id: string; corto: string; titulo: string; valor: string; est: "ok" | "aviso" | "mal"; detalle: string; acc: string; lnk: string }
export type EstadoRiesgo = "pedir" | "confirmar" | "cubierto" | "pronto" | "ok" | "sinventa";
export interface FilaRiesgo {
  sku: string; nombre: string; cat: string; prov: string; fisico: number; yulius: number; comp: number; inv: number; cons: number; lt: number;
  oc: number; llega: string | null; dias: number | null; dLlega: number | null; estado: EstadoRiesgo; motivo: string; neg: boolean; vieja: boolean;
  esta: number; costo: number;
}

const RUTA = "/comercializadora";

// Cálculo (sin DOM): recibe los datos crudos del Plan y una configuración; devuelve todo lo que muestran las tarjetas.
export function kpiAbCalc(R: DatosPlan, cfgIn: any, ahora: number): any {
  var cfg = normalizarCfgMotor(cfgIn), metas = kpiAbMetas(cfg), cfgK = JSON.parse(JSON.stringify(cfg)), j: number;
  // El café también cuenta para medir y se miran 8 semanas hacia atrás.
  cfgK.compra.excluir_cafe = false;
  cfgK.compra.bt_semanas = Math.max(8, Number(cfgK.compra.bt_semanas) || 0);
  var c = planBuild(planSinSrv(R), cfgK), rows = c.rows; // Indicadores siguen con el cálculo local
  var bt = c.bt || { n: 0, semanas: [], compras: [], comprasImp: [], comprasSinMonto: 0 }, NB = bt.n, nw = Math.min(4, NB);
  var K: any = { metas: metas, cfg: cfg, hoy: c.hoyIso, NB: NB, nw: nw, nRows: rows.length };
  var num = function (x: any) { x = Number(x); return isFinite(x) ? x : 0; };

  // 1) Forecast: lo que el modelo habría proyectado cada semana pasada contra lo realmente pedido (a costo)
  var fcRows: any[] = [], wErr = 0, wReal = 0, wProy = 0, sinCostoFc = 0;
  rows.forEach(function (r) {
    if (r.sinMov) return;
    if (!(r.costo > 0)) { sinCostoFc++; return; }
    var p = 0, re = 0, n = 0, i: number;
    for (i = 0; i < nw; i++) { var a = r.calc.btProy[i], b = r.calc.btReal[i]; if (a == null || b == null) continue; p += a; re += b; n++; }
    if (!nw || n < nw) return;
    var err = Math.abs(p - re) * r.costo;
    var desvS = p > 0 ? (re - p) / p : null, pw = p / nw, rec = (num(r.calc.btReal[0]) + num(r.calc.btReal[1])) / 2, motivo = "";
    if (desvS !== null && desvS <= -0.2) motivo = rec < 0.7 * pw ? "La venta bajó: " + Math.round(rec) + " por semana las últimas 2 semanas contra " + Math.round(pw) + " proyectadas" : "Venta irregular: semanas con pocos pedidos";
    else if (desvS !== null && desvS >= 0.2) motivo = rec > 1.3 * pw ? "La venta subió: " + Math.round(rec) + " por semana las últimas 2 semanas contra " + Math.round(pw) + " proyectadas" : "Venta irregular: semanas con pedidos grandes";
    fcRows.push({ sku: r.sku, nombre: r.nombre, costo: r.costo, proy: p, real: re, err: err, desv: desvS, motivo: motivo, bp: r.calc.btProy.slice(0, NB), br: r.calc.btReal.slice(0, NB), tasa: num(r.calc.tasa), venta30: num(r.s.venta) });
    wErr += err; wReal += re * r.costo; wProy += p * r.costo;
  });
  fcRows.sort(function (a, b) { return b.err - a.err; });
  var sem: any[] = [];
  for (j = 0; j < NB; j++) {
    var wp = 0, wr = 0, we = 0, nn = 0;
    rows.forEach(function (r) {
      if (r.sinMov || !(r.costo > 0)) return;
      var a = r.calc.btProy[j], b = r.calc.btReal[j]; if (a == null || b == null) return;
      wp += a * r.costo; wr += b * r.costo; we += Math.abs(a - b) * r.costo; nn++;
    });
    var sj = bt.semanas[j] || {};
    sem.push({ ini: sj.ini || null, fin: sj.fin || null, proy: wp, real: wr, err: we, n: nn, desv: wp > 0 ? (wr - wp) / wp * 100 : null, acc: wr > 0 ? Math.max(0, 1 - we / wr) * 100 : null });
  }
  var fcMap: Record<string, any> = {}; fcRows.forEach(function (x) { fcMap[x.sku] = x; });
  K.P = c.P;
  K.fc = { porSku: fcMap, acc: wReal > 0 ? Math.max(0, 1 - wErr / wReal) * 100 : null, desv: wProy > 0 ? (wReal - wProy) / wProy * 100 : null, n: fcRows.length, proy: wProy, real: wReal, err: wErr, top: fcRows.filter(function (x) { return x.desv !== null && Math.abs(x.desv) >= 0.2; }).slice(0, 6), sem: sem, sinCosto: sinCostoFc };

  // 2) Compras vs venta: OCs emitidas en cada semana pasada contra la venta a costo de esa misma semana
  var cv: any[] = [], c4 = 0, v4 = 0, c8 = 0, v8 = 0;
  for (j = 0; j < NB; j++) {
    var sj2 = bt.semanas[j] || {}, co = num(bt.compras[j]), ci = num(bt.comprasImp[j]), vt = sem[j] ? sem[j].real : 0;
    cv.push({ ini: sj2.ini || null, fin: sj2.fin || null, n: num(bt.comprasN && bt.comprasN[j]), comp: co, compImp: ci, vta: vt, ratio: vt > 0 ? (co + ci) / vt : null });
    c8 += co + ci; v8 += vt; if (j < nw) { c4 += co + ci; v4 += vt; }
  }
  K.cv = { ratio: v4 > 0 ? c4 / v4 : null, comp: c4, vta: v4, ratio8: v8 > 0 ? c8 / v8 : null, comp8: c8, vta8: v8, sem: cv, sinMonto: num(bt.comprasSinMonto) };

  // 3) Inventario a costo, cobertura, exceso y disponibilidad (por artículo, con la misma base de inventario que el plan)
  var cats: Record<string, any> = {}, valor = 0, cogs = 0, sinCosto = 0, exc: any[] = [], sinVenta: any[] = [], excVal = 0, sinVentaVal = 0, conVenta = 0, agot: any[] = [], top: any[] = [];
  rows.forEach(function (r) {
    var fis = Math.max(0, num(r.s.fisico) + (cfg.inv.yulius ? num(r.s.yulius) : 0)), v = r.costo > 0 ? fis * r.costo : 0;
    if (!(r.costo > 0) && fis > 0) sinCosto++;
    var cons = Math.max(0, num(r.calc.consumo)), cd = (!r.sinMov && r.costo > 0) ? cons * r.costo : 0, ct = r.categoria || "Sin categoría";
    valor += v; cogs += cd;
    var g = cats[ct] || (cats[ct] = { nombre: ct, valor: 0, cogs: 0, n: 0 }); g.valor += v; g.cogs += cd; if (fis > 0) g.n++;
    if (v > 0) top.push({ sku: r.sku, nombre: r.nombre, valor: v, uds: fis, dias: cd > 0 ? v / cd : null });
    var inv = num(r.s.inv);
    if (r.sinMov) { if (inv > 0 && r.costo > 0) { var vs = inv * r.costo; sinVentaVal += vs; sinVenta.push({ sku: r.sku, nombre: r.nombre, uds: inv, valor: vs }); } }
    else if (cons > 0 && r.costo > 0) {
      var obj = num(r.calc.Heff) + metas.exc_margen, ex = Math.max(0, inv - cons * obj);
      if (ex > 0) { excVal += ex * r.costo; exc.push({ sku: r.sku, nombre: r.nombre, uds: inv, dias: inv / cons, obj: obj, exUds: ex, exVal: ex * r.costo }); }
    }
    if (!r.sinMov && num(r.s.venta) > 0) {
      conVenta++;
      if (inv <= 0) agot.push({ sku: r.sku, nombre: r.nombre, prov: r.provNombre, cons: cons, vtaDia$: cons * (r.costo > 0 ? r.costo : 0), enOC: num(r.s.enOC), lt: num(r.s.lt), llega: r.llegaOC || null, inv: inv });
    }
  });
  exc.sort(function (a, b) { return b.exVal - a.exVal; }); sinVenta.sort(function (a, b) { return b.valor - a.valor; });
  agot.sort(function (a, b) { return b["vtaDia$"] - a["vtaDia$"]; }); top.sort(function (a, b) { return b.valor - a.valor; });
  var catArr = Object.keys(cats).map(function (k) { var g = cats[k]; g.dias = g.cogs > 0 ? g.valor / g.cogs : null; g.pct = valor > 0 ? g.valor / valor * 100 : 0; return g; }).sort(function (a, b) { return b.valor - a.valor; });
  K.inv = { valor: valor, cogsDia: cogs, dias: cogs > 0 ? valor / cogs : null, cats: catArr, top: top.slice(0, 12), sinCosto: sinCosto };
  K.exc = { valor: excVal + sinVentaVal, exceso: excVal, sinVentaVal: sinVentaVal, pct: valor > 0 ? (excVal + sinVentaVal) / valor * 100 : null, filas: exc, sinVenta: sinVenta };
  K.disp = { pct: conVenta > 0 ? (1 - agot.length / conVenta) * 100 : null, conVenta: conVenta, agot: agot };

  // 4) ¿Los datos del plan están al día? (lo que hace confiable o no a todo lo anterior)
  var CORTO: Record<string, string> = { inv: "inventario sin sincronizar", neg: "inventario negativo", oc: "OCs sin poner al día", borr: "borradores de OC", env: "pedidos por enviar viejos", lt: "lead times", prov: "proveedores", costo: "costos", map: "SKU sin mapear", ap: "piezas por apertura" };
  var checks: CheckDatos[] = [], ok = function (id: string, tit: string, val: string, est: any, det: string, acc?: string, lnk?: string) { checks.push({ id: id, corto: CORTO[id] || tit, titulo: tit, valor: val, est: est, detalle: det, acc: acc || "", lnk: lnk || "" }); };
  var dias = function (iso: any): any { return iso ? Math.round((ahora - new Date(iso).getTime()) / 864e5) : null; };
  var ult = planInvUltSync(R.cat);
  var dI = dias(ult);
  ok("inv", "Inventario sincronizado con Zoho", ult ? "hace " + dI + " día" + (dI === 1 ? "" : "s") : "sin sincronizar", (!ult || dI > 7) ? "mal" : dI > 3 ? "aviso" : "ok", "Se actualiza desde Zoho; si está viejo, el plan decide con existencias que ya no son.", "Ver inventario", RUTA + "/inventario");
  var neg = R.cat.filter(function (x) { return comSaldoCedis(x) < 0; });
  ok("neg", "Artículos con inventario negativo", String(neg.length), neg.length > 0 ? "mal" : "ok", neg.length ? "Existencias negativas en CEDIS (salieron más piezas de las que se registraron como recibidas): " + neg.slice(0, 8).map(function (x) { return x.sku; }).join(", ") + (neg.length > 8 ? " y " + (neg.length - 8) + " más" : "") + ". Revisa que las compras recibidas estén registradas en Zoho y corrige el inventario; mientras tanto el plan trata esos artículos como agotados." : "Ninguno.", "Ver inventario", RUTA + "/inventario");
  var z = cfg.zoho_oc, usaZ = false; try { usaZ = planOcDeZoho(cfg); } catch { usaZ = false; }
  var viejas = rows.reduce(function (s, r) { return s + (r.staleLn || 0); }, 0), dC = z && z.conciliado ? dias(z.conciliado) : (z && z.cargado ? dias(z.cargado) : null);
  var estOC = usaZ ? (dC > 3 ? "aviso" : "ok") : (z && z.conciliado ? ((viejas > 0 || dC > 7) ? "aviso" : "ok") : "mal");
  ok("oc", "OCs en camino al día con Zoho", usaZ ? "solo las de Zoho" + (dC !== null ? " · cargadas hace " + dC + " d" : "") : (z && z.conciliado ? "puestas al día hace " + dC + " d" + (viejas ? " · " + viejas + " líneas viejas" : "") : "sin poner al día"), estOC, 'Lo que está "en camino" reduce lo que hay que pedir: si no coincide con Zoho, el plan pide de menos o de más.', "Ver órdenes de compra", RUTA + "/ordenes");
  var nb = 0, mb = 0; try { var bo = ocsBorradores(R, cfg); nb = bo.length; bo.forEach(function (o) { mb += o.monto || 0; }); } catch { nb = 0; }
  ok("borr", "Borradores de OC pendientes de resolver", String(nb) + (nb ? " (" + planMoneyCorto(mb) + ")" : ""), nb > 0 ? "aviso" : "ok", "Un borrador no es una compra: no cuenta como en camino. Hay que emitirlo o borrarlo en Zoho.", "Ver órdenes de compra", RUTA + "/ordenes");
  var cvj = c.compViejo && c.compViejo.ln > 0 ? c.compViejo : null;
  ok("env", 'Pedidos "por enviar" muy viejos', cvj ? cvj.folios + " pedido" + (cvj.folios === 1 ? "" : "s") + " (+" + cvj.dias + " d)" : "0", cvj ? "aviso" : "ok", "Casi seguro ya se enviaron y nadie los marcó; si cuentan como comprometidos, restan inventario que sí está en el almacén.", "Revisar envíos", RUTA + "/envios");
  var act = rows.filter(function (r) { return !r.sinMov; });
  var sinLt = act.filter(function (r) { return r.ltDefault; }).length, sinProv = act.filter(function (r) { return r.provKey === "__sin__"; }).length, sinCost = act.filter(function (r) { return !(r.costo > 0); }).length;
  ok("lt", "Artículos con lead time capturado", (act.length - sinLt) + " de " + act.length, sinLt > 0 ? "aviso" : "ok", sinLt ? sinLt + " usan el lead time por defecto (" + cfg.compra.lt_default + " días): el plan puede pedir tarde o temprano." : "Todos tienen su lead time.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("prov", "Artículos con proveedor asignado", (act.length - sinProv) + " de " + act.length, sinProv > 0 ? "aviso" : "ok", sinProv ? sinProv + " sin proveedor: no se pueden agrupar en una OC." : "Todos tienen proveedor.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("costo", "Artículos con costo", (act.length - sinCost) + " de " + act.length, sinCost > 0 ? "aviso" : "ok", sinCost ? sinCost + " sin costo: no entran en los montos ni en los indicadores en $." : "Todos tienen costo.", "Abrir el catálogo", RUTA + "/catalogo");
  ok("map", "Líneas de pedido con SKU asignado", c.sinMapear ? c.sinMapear + " sin SKU" : "todas", c.sinMapear > 0 ? "aviso" : "ok", c.sinMapear ? "Líneas de pedido de la ventana que no se pudieron ligar a un artículo: su venta no entra al forecast." : "Toda la venta se pudo ligar a un artículo.", "Mapeo SKU", RUTA + "/mapeo");
  var conKit = R.cat.filter(function (x) { return Number(x.cantidad_por_apertura || 0) > 0; }).length, usaAp = cfg.aper.incluir !== false && c.nAperturas > 0;
  ok("ap", "Piezas por apertura capturadas", usaAp ? conKit + " de " + R.cat.length + " artículos" : (cfg.aper.incluir === false ? "aperturas no contempladas" : "sin aperturas en el calendario"), usaAp && conKit === 0 ? "mal" : "ok", usaAp && conKit === 0 ? "Sin piezas por apertura, las aperturas del calendario no suman al pedido." : "Con esto el plan reserva producto para las aperturas del calendario.", "Sugerir piezas", RUTA + "/catalogo/piezas-apertura");
  var nOk = checks.filter(function (x) { return x.est === "ok"; }).length;
  K.datos = { checks: checks, ok: nOk, total: checks.length };

  // 4b) Riesgo de quiebre: ¿el inventario alcanza hasta que llegue una compra nueva? Con las OCs en cuenta (misma definición en KPIs, DOH y Compras)
  var fil: FilaRiesgo[] = [], rq: Record<string, number> = { pedir: 0, confirmar: 0, cubierto: 0, pronto: 0, ok: 0, sinventa: 0, negativos: 0 }, ord: Record<string, number> = { pedir: 0, confirmar: 1, cubierto: 2, pronto: 3, ok: 4, sinventa: 5 };
  rows.forEach(function (r) {
    var cons = Math.max(0, num(r.calc.consumo)), lt = num(r.s.lt) || num(cfg.compra.lt_default) || 7, inv = num(r.s.inv), oc = num(r.s.enOC);
    var it: FilaRiesgo = { sku: r.sku, nombre: r.nombre, cat: r.categoria || "Sin categoría", prov: r.provNombre, fisico: num(r.s.fisico), yulius: num(r.s.yulius), comp: num(r.s.comp), inv: inv, cons: cons, lt: lt, oc: oc, llega: r.llegaOC || null, dias: null, dLlega: null, estado: "sinventa", motivo: "", neg: num(r.s.fisico) < 0, vieja: (r.staleLn || 0) > 0, esta: num(r.calc.pedirEsta), costo: num(r.costo) };
    if (r.sinMov || !(cons > 0)) { fil.push(it); rq.sinventa++; return; }
    var dias = r.calc.diasHoy === null ? Math.max(0, inv) / cons : r.calc.diasHoy; it.dias = dias;
    if (it.neg) rq.negativos++;
    var dLl = it.llega ? planEngDifDias(it.llega, c.hoyIso) : null; it.dLlega = dLl;
    if (dias <= lt) {
      if (!(oc > 0)) { it.estado = "pedir"; it.motivo = "Sin OC"; }
      else if (dLl === null) { it.estado = "confirmar"; it.motivo = it.vieja ? "OC vieja, sin fecha confiable" : "OC sin fecha de llegada"; }
      else if (dLl < 0) { it.estado = "confirmar"; it.motivo = "OC vencida hace " + Math.abs(Math.round(dLl)) + " d"; }
      else if (dLl > dias + 0.5) { it.estado = "confirmar"; it.motivo = "Llega en " + Math.round(dLl) + " d y se acaba en " + Math.round(dias) + " d"; }
      else if ((Math.max(0, inv) + oc) / cons < lt) { it.estado = "confirmar"; it.motivo = "La OC no alcanza para cubrir el lead time"; }
      else { it.estado = "cubierto"; it.motivo = "Llega en " + Math.round(dLl) + " d, se acaba en " + Math.round(dias) + " d"; }
    } else if (dias <= Math.max(lt * 2, 14) && !(oc > 0)) { it.estado = "pronto"; it.motivo = "Alcanza " + Math.round(dias) + " d"; }
    else it.estado = "ok";
    rq[it.estado]++; fil.push(it);
  });
  fil.sort(function (a, b) { return ord[a.estado] - ord[b.estado] || (a.dias === null ? 1e9 : a.dias) - (b.dias === null ? 1e9 : b.dias); });
  K.riesgo = { pedir: rq.pedir, confirmar: rq.confirmar, cubierto: rq.cubierto, pronto: rq.pronto, ok: rq.ok, sinventa: rq.sinventa, negativos: rq.negativos, conVenta: fil.length - rq.sinventa, filas: fil };

  // 5) Parámetros vigentes (lo que mueve a los indicadores de arriba)
  var metodo = ({ promedio: "promedio", mediana: "mediana", percentil: "percentil " + cfg.consumo.pctl, ponderado: "ponderado" } as Record<string, string>)[cfg.consumo.metodo] || cfg.consumo.metodo;
  K.params = [
    ["Ventana de venta", cfg.consumo.ventana + " días"], ["Método", metodo], ["Días de seguridad", cfg.seg.dias + (cfg.seg.metodo === "estadistico" ? " (estadística)" : "")], ["Lead time base", cfg.compra.lt_default + " días"],
    ["Aperturas", cfg.aper.incluir === false ? "no se contemplan" : "se contemplan"], ["Inventario base", cfg.inv.base === "disponible" ? "disponible (físico − comprometido)" : "físico"], ["3PL", cfg.inv.yulius ? "se suma" : "no se suma"],
    ["Pedidos por enviar", cfg.inv.comp_dias > 0 ? "ignora los de más de " + cfg.inv.comp_dias + " días" : (cfg.inv.comp_dias === 0 ? "cuenta todos" : "cuenta todos")], ["OCs en camino", usaZ ? "de Zoho" : "de la plataforma"], ["Borradores de OC", cfg.compra.borradores === "cuentan" ? "cuentan" : "no cuentan"],
  ];
  return K;
}

/** Estado de cada indicador contra su meta: true cumple, null cerca, false no cumple, undefined sin datos. */
export function kpiAbEstados(K: any): Record<string, boolean | null | undefined> {
  var m = K.metas, e: Record<string, boolean | null | undefined> = {};
  var f = K.fc.acc; e.fc = f === null ? undefined : (f >= m.prec_min ? true : f >= m.prec_min - 10 ? null : false);
  var d = K.fc.desv; e.sesgo = d === null ? undefined : (Math.abs(d) <= m.sesgo_max ? true : Math.abs(d) <= 2 * m.sesgo_max ? null : false);
  var r = K.cv.ratio; e.cv = r === null ? undefined : ((r >= m.cv_min && r <= m.cv_max) ? true : (r >= m.cv_min - 0.15 && r <= m.cv_max + 0.15) ? null : false);
  var di = K.inv.dias; e.inv = di === null ? undefined : ((di >= m.dias_min && di <= m.dias_max) ? true : (di >= m.dias_min - 10 && di <= m.dias_max + 15) ? null : false);
  var x = K.exc.pct; e.exc = x === null ? undefined : (x <= m.exc_max ? true : x <= 2 * m.exc_max ? null : false);
  var p = K.disp.pct; e.disp = p === null ? undefined : (p >= m.disp_min ? true : p >= m.disp_min - 5 ? null : false);
  var t = K.datos; e.datos = t.ok === t.total ? true : (t.checks.some(function (c: CheckDatos) { return c.est === "mal"; }) ? false : (t.ok / t.total >= 0.7 ? null : false));
  return e;
}

/** Precisión del forecast con otras ventanas de venta (14, 21 y la actual), misma cuenta y mismos datos (_kpiAbVentanas). */
export function kpiAbVentanas(R: DatosPlan, cfgBase: any, ahora: number, calc: (R: DatosPlan, cfg: any, ahora: number) => any = kpiAbCalc): { v: number; acc: number; desv: number | null; actual: boolean }[] {
  var out: { v: number; acc: number; desv: number | null; actual: boolean }[] = [];
  try {
    var base = normalizarCfgMotor(cfgBase), act = base.consumo.ventana;
    [14, 21, act].forEach(function (v) {
      if (out.some(function (o) { return o.v === v; })) return;
      var c = JSON.parse(JSON.stringify(base)); c.consumo.ventana = v;
      var K = calc(R, c, ahora);
      if (K && K.fc.acc !== null) out.push({ v: v, acc: K.fc.acc, desv: K.fc.desv, actual: v === act });
    });
  } catch { /* igual que la app: si algo falla, no se muestra la comparación */ }
  return out.sort(function (a, b) { return a.v - b.v; });
}

export interface Traza { sku: string; nombre: string; tasa: number; venta30: number; motivo: string; filas: { ini: string | null; fin: string | null; real: number | null; tipos: [string, number][]; proy: number | null; dif: number | null }[] }
const NOM_TIPO: Record<string, string> = { resurtido: "resurtido", sin_vincular: "sin vincular", apertura: "kits de apertura", marketing: "marketing", corporativo: "oficina corporativa", llenado: "llenado de canal" };
/** De dónde sale la proyección de un artículo: semana a semana, lo pedido por tipo de pedido contra lo proyectado (_kpiAbTraza). */
export function kpiAbTraza(R: DatosPlan, K: any, sku: string): Traza | null {
  var f = K && K.fc && K.fc.porSku && K.fc.porSku[sku]; if (!f || !R) return null;
  var cfg = K.cfg, NB = K.NB;
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var sem: Record<string, number>[] = []; for (var j = 0; j < NB; j++) sem.push({});
  R.pedidos.forEach(function (p) {
    var fe = new Date(p.fecha_pedido).getTime(); if (isNaN(fe)) return;
    var k = planEngDifDias(R.hoy, fechaLocal(fe)); if (k < 0) k = 0;
    var w = Math.floor(k / (K.P || 7)); if (w >= NB) return;
    var its = (cfg.consumo.items === "editados" && p.items_editados) ? parseItems(p.items_editados) : parseItems(p.items), orig = parseItems(p.items);
    its.forEach(function (it: any) {
      if (!it) return; var s = it.sku || skuMap[it.nombre];
      if (!s && it.nombre) { var o = orig.filter(function (x: any) { return x && x.nombre === it.nombre && x.sku; })[0]; s = o && o.sku; }
      if (s !== sku) return;
      var tipo = planDatTipo(p, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max), q = Number(it.cantidad || 0);
      if (q > 0) sem[w][tipo] = (sem[w][tipo] || 0) + q;
    });
  });
  var filas: Traza["filas"] = [];
  for (var i = 0; i < NB; i++) {
    var s2 = K.fc.sem[i] || {}, py = f.bp[i], rl = f.br[i];
    var tip = Object.keys(sem[i]).filter(function (t) { return cfg.consumo.tipos[t]; }).map(function (t): [string, number] { return [NOM_TIPO[t] || t, sem[i][t]]; });
    filas.push({ ini: s2.ini || null, fin: s2.fin || null, real: rl == null ? null : rl, tipos: tip, proy: py == null ? null : py, dif: py > 0 && rl != null ? (rl - py) / py * 100 : null });
  }
  return { sku: sku, nombre: f.nombre, tasa: f.tasa, venta30: f.venta30, motivo: f.motivo, filas: filas };
}
```

- [ ] **Step 4: Correr y ver que pasan**

Run: el comando del Step 2.
Expected: PASS (8). La de catálogo grande tarda menos de 1 s en una máquina normal; el tope de 10 s es para máquinas lentas.

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planKpi.ts supabase/functions/_shared/planKpi_parity_test.ts
git commit -m "feat(comercializadora): indicadores de abasto y riesgo de quiebre portados, con paridad"
```

---

### Task 6: DOH, riesgo de quiebre en Inicio y DOH en la navegación

**Files:**
- Create: `lib/comercializadora/doh.ts`
- Create: `components/comercializadora/doh.tsx`
- Create: `app/(comercializadora)/comercializadora/doh/page.tsx`
- Modify: `lib/comercializadora/motor.ts` (`indicadoresMotor`)
- Modify: `components/comercializadora/inicio.tsx` (panel con enlace y riesgo de quiebre)
- Modify: `app/(comercializadora)/comercializadora/inicio/page.tsx`
- Modify: `components/portal/navegacion.tsx`
- Test: `tests/portal/com-doh.test.tsx`

**Interfaces:**
- Consumes: `motorPlan`, `memoMotor`, `type Motor` (Tarea 4); `kpiAbCalc`, `type EstadoRiesgo`, `type FilaRiesgo` (Tarea 5); `type Tono` (`inicio.ts`).
- Produces:
  - `DOH_EST: { id: EstadoRiesgo; texto: string; tono: Tono }[]`
  - `estadoInicial(param?: string): EstadoRiesgo | 'todos'`
  - `filtrarDoh(filas, { estado, cat, q }): FilaRiesgo[]`
  - `interface RiesgoInicio { pedir; confirmar; cubierto; negativos; lista }`, `riesgoInicio(r): RiesgoInicio`
  - `Doh({ filas, conteos, ventana, inicial })`
  - `Inicio` gana `riesgo?: RiesgoInicio | null`
  - `type MotorListo`, `indicadoresMotor(m: MotorListo): any` (el `K` de la Tarea 5, en memoria)

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-doh.test.tsx`:

```tsx
import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Doh } from '../../components/comercializadora/doh';
import { Inicio } from '../../components/comercializadora/inicio';
import { armarInicio } from '../../lib/comercializadora/inicio';
import {
  estadoInicial,
  filtrarDoh,
  riesgoInicio,
  type EstadoRiesgo,
  type FilaRiesgo,
} from '../../lib/comercializadora/doh';

const fila = (o: Partial<FilaRiesgo>): FilaRiesgo => ({
  sku: 'A',
  nombre: 'Vaso',
  cat: 'Desechables',
  prov: 'Vasos SA',
  fisico: 10,
  yulius: 0,
  comp: 0,
  inv: 10,
  cons: 2,
  lt: 7,
  oc: 0,
  llega: null,
  dias: 5,
  dLlega: null,
  estado: 'pedir',
  motivo: 'Sin OC',
  neg: false,
  vieja: false,
  esta: 0,
  costo: 1,
  ...o,
});
const FILAS = [
  fila({}),
  fila({ sku: 'B', nombre: 'Tapa', estado: 'confirmar', motivo: 'OC sin fecha de llegada', oc: 40 }),
  fila({ sku: 'C', nombre: 'Café', cat: 'Café', estado: 'ok', dias: 40, motivo: '' }),
  fila({
    sku: 'D',
    nombre: 'Popote',
    estado: 'sinventa',
    cons: 0,
    dias: null,
    motivo: '',
    fisico: -3,
    neg: true,
  }),
];
const conteos = (f: FilaRiesgo[]) =>
  Object.fromEntries(
    ['pedir', 'confirmar', 'cubierto', 'pronto', 'ok', 'sinventa'].map((e) => [
      e,
      f.filter((x) => x.estado === e).length,
    ]),
  ) as Record<EstadoRiesgo, number>;

describe('DOH (port de renderComDoh/_dohFilas)', () => {
  it('filtro inicial por la URL: urgente es pedir y lo desconocido es todos', () => {
    expect(estadoInicial('urgente')).toBe('pedir');
    expect(estadoInicial('confirmar')).toBe('confirmar');
    expect(estadoInicial('x')).toBe('todos');
    expect(estadoInicial(undefined)).toBe('todos');
  });

  it('filtra por estado, categoría y texto en nombre o SKU', () => {
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'Café', q: '' }).map((r) => r.sku)).toEqual(['C']);
    expect(filtrarDoh(FILAS, { estado: 'confirmar', cat: 'todos', q: '' }).map((r) => r.sku)).toEqual(['B']);
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'todos', q: 'TAP' }).map((r) => r.sku)).toEqual(['B']);
    expect(filtrarDoh(FILAS, { estado: 'todos', cat: 'todos', q: 'd' }).map((r) => r.sku)).toEqual(['D']);
  });

  it('pantalla: conteos por estado, estado inicial y los chips filtran', () => {
    render(<Doh filas={FILAS} conteos={conteos(FILAS)} ventana={30} inicial="pedir" />);
    expect(screen.getByText(/Venta de los últimos 30 días/)).toBeInTheDocument();
    const tabla = screen.getByRole('table');
    expect(within(tabla).getByText('Vaso')).toBeInTheDocument();
    expect(within(tabla).queryByText('Tapa')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /OC por confirmar/ }));
    expect(within(screen.getByRole('table')).getByText('OC sin fecha de llegada')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'todos' } });
    expect(within(screen.getByRole('table')).getByText('físico -3')).toHaveClass('text-bad');
  });

  it('sin coincidencias muestra "Sin resultados"', () => {
    render(<Doh filas={FILAS} conteos={conteos(FILAS)} ventana={30} inicial="todos" />);
    fireEvent.change(screen.getByLabelText('Buscar'), { target: { value: 'zzz' } });
    expect(screen.getByText('Sin resultados')).toBeInTheDocument();
  });
});

describe('Inicio: riesgo de quiebre y enlaces a DOH', () => {
  const r = armarInicio({
    hoy: '2026-11-13',
    catalogo: [],
    porEnviar: [],
    ventas90: [],
    compras: [],
    leadTimes: [],
    mermas: [],
    pedidos: [],
  });

  it('riesgoInicio: conteos y solo los primeros 7 por pedir o por confirmar', () => {
    const muchas = Array.from({ length: 10 }, (_, i) =>
      fila({ sku: 'X' + i, estado: i % 2 ? 'confirmar' : 'pedir' }),
    );
    const q = riesgoInicio({
      pedir: 5,
      confirmar: 5,
      cubierto: 0,
      negativos: 1,
      filas: [fila({ sku: 'OK', estado: 'ok' }), ...muchas],
    });
    expect(q.lista.map((x) => x.sku)).toEqual(['X0', 'X1', 'X2', 'X3', 'X4', 'X5', 'X6']);
    expect([q.pedir, q.confirmar, q.negativos]).toEqual([5, 5, 1]);
  });

  it('muestra el panel con la lista y el enlace al DOH filtrado por "Pedir ya"', () => {
    const q = riesgoInicio({ pedir: 1, confirmar: 1, cubierto: 2, negativos: 0, filas: FILAS });
    render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} riesgo={q} />);
    expect(screen.getByText('Riesgo de quiebre')).toBeInTheDocument();
    expect(screen.getByText('Tapa')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Ver en DOH/ })).toHaveAttribute(
      'href',
      '/comercializadora/doh?estado=pedir',
    );
    expect(screen.getAllByRole('link', { name: /Ver DOH/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/doh',
    );
  });

  it('si el motor no se pudo calcular, lo dice; sin el dato (pantallas viejas) no muestra el panel', () => {
    const { unmount } = render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} riesgo={null} />);
    expect(screen.getByText('No se pudo calcular el riesgo de quiebre.')).toBeInTheDocument();
    unmount();
    render(<Inicio r={r} ventas hoy="2026-11-13" pedidos={null} />);
    expect(screen.queryByText('Riesgo de quiebre')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-doh.test.tsx`
Expected: FAIL. `doh.ts` y `doh.tsx` no existen.

- [ ] **Step 3: Implementar**

Crear `lib/comercializadora/doh.ts`:

```ts
import type { Tono } from './inicio';
import type { EstadoRiesgo, FilaRiesgo } from '../../supabase/functions/_shared/planKpi.ts';

export type { EstadoRiesgo, FilaRiesgo };

/** _DOH_EST: los seis estados del riesgo de quiebre, en su orden, con el tono del portal. */
export const DOH_EST: { id: EstadoRiesgo; texto: string; tono: Tono }[] = [
  { id: 'pedir', texto: 'Pedir ya', tono: 'pierde' },
  { id: 'confirmar', texto: 'OC por confirmar', tono: 'bajo' },
  { id: 'cubierto', texto: 'Cubierto con OC', tono: 'ok' },
  { id: 'pronto', texto: 'Pronto', tono: 'bajo' },
  { id: 'ok', texto: 'OK', tono: 'ok' },
  { id: 'sinventa', texto: 'Sin venta', tono: 'neutro' },
];

/** Filtro inicial por la URL (?estado=). El viejo mandaba 'urgente' desde Inicio: es 'pedir'. */
export function estadoInicial(param: string | undefined): EstadoRiesgo | 'todos' {
  const e = param === 'urgente' ? 'pedir' : param;
  return DOH_EST.some((x) => x.id === e) ? (e as EstadoRiesgo) : 'todos';
}

/** _dohFilas (filtro): estado, categoría y texto en nombre o SKU (sin distinguir mayúsculas). */
export function filtrarDoh(
  filas: FilaRiesgo[],
  f: { estado: EstadoRiesgo | 'todos'; cat: string; q: string },
): FilaRiesgo[] {
  const lq = f.q.trim().toLowerCase();
  return filas.filter(
    (r) =>
      (f.estado === 'todos' || r.estado === f.estado) &&
      (f.cat === 'todos' || r.cat === f.cat) &&
      (!lq || r.nombre.toLowerCase().includes(lq) || r.sku.toLowerCase().includes(lq)),
  );
}

/** Resumen del riesgo para Inicio (_kpiForecastRiesgo): conteos y los primeros 7 por pedir o por confirmar. */
export interface RiesgoInicio {
  pedir: number;
  confirmar: number;
  cubierto: number;
  negativos: number;
  lista: Pick<FilaRiesgo, 'sku' | 'nombre' | 'inv' | 'cons' | 'dias' | 'estado'>[];
}
export function riesgoInicio(r: {
  pedir: number;
  confirmar: number;
  cubierto: number;
  negativos: number;
  filas: FilaRiesgo[];
}): RiesgoInicio {
  return {
    pedir: r.pedir,
    confirmar: r.confirmar,
    cubierto: r.cubierto,
    negativos: r.negativos,
    lista: r.filas
      .filter((x) => x.estado === 'pedir' || x.estado === 'confirmar')
      .slice(0, 7)
      .map(({ sku, nombre, inv, cons, dias, estado }) => ({ sku, nombre, inv, cons, dias, estado })),
  };
}
```

Crear `components/comercializadora/doh.tsx` (`renderComDoh` 41472, `_dohHtml` 41454, `_dohFilas` 41434):

```tsx
'use client';
import { useState } from 'react';
import { Pill, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { DOH_EST, filtrarDoh, type EstadoRiesgo, type FilaRiesgo } from '@/lib/comercializadora/doh';

const POR_PAGINA = 25;
type Conteos = Record<EstadoRiesgo, number>;
const ventaDia = (x: number) =>
  x >= 10 ? Math.round(x).toLocaleString('es-MX') : numero(Math.round(x * 10) / 10);

/** Pantalla DOH (renderComDoh + _dohHtml + _dohFilas): todos los artículos con la definición de riesgo de quiebre. */
export function Doh(p: {
  filas: FilaRiesgo[];
  conteos: Conteos;
  ventana: number;
  inicial: EstadoRiesgo | 'todos';
}) {
  const [estado, setEstado] = useState<EstadoRiesgo | 'todos'>(p.inicial);
  const [cat, setCat] = useState('todos');
  const [q, setQ] = useState('');
  const [ver, setVer] = useState(POR_PAGINA);
  const cats = [...new Set(p.filas.map((r) => r.cat))].sort();
  const lista = filtrarDoh(p.filas, { estado, cat, q });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {DOH_EST.map((e) => (
          <button
            key={e.id}
            type="button"
            aria-pressed={estado === e.id}
            onClick={() => (setEstado(e.id), setVer(POR_PAGINA))}
            className={`placa rounded-xl p-3 text-left ${estado === e.id ? 'ring-2 ring-line-strong' : ''}`}
          >
            <span className="block font-display text-2xl font-bold tabular-nums">{p.conteos[e.id]}</span>
            <Pill estado={e.tono}>{e.texto}</Pill>
          </button>
        ))}
      </div>
      <p className="text-sm text-muted-foreground">
        Pedir ya: el inventario no alcanza hasta que llegue una compra nueva y no hay una OC que lo cubra.
        Venta de los últimos {p.ventana} días de los pedidos de la plataforma.
      </p>
      <div className="flex flex-wrap gap-2">
        <input
          aria-label="Buscar"
          placeholder="Buscar SKU o nombre..."
          className={`${claseCampo} max-w-64`}
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select
          aria-label="Categoría"
          className={`${claseCampo} max-w-56`}
          value={cat}
          onChange={(e) => setCat(e.target.value)}
        >
          <option value="todos">Todas las categorías</option>
          {cats.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <select
          aria-label="Estado"
          className={`${claseCampo} max-w-48`}
          value={estado}
          onChange={(e) => setEstado(e.target.value as EstadoRiesgo | 'todos')}
        >
          <option value="todos">Todos</option>
          {DOH_EST.map((e) => (
            <option key={e.id} value={e.id}>
              {e.texto}
            </option>
          ))}
        </select>
      </div>
      {!lista.length ? (
        <Vacio titulo="Sin resultados" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Categoría</th>
                <th className="text-right">Disponible</th>
                <th className="text-right">Venta/día</th>
                <th className="text-right">Alcanza</th>
                <th className="text-right">Lead time</th>
                <th>OC en camino</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {lista.slice(0, ver).map((r) => {
                const e = DOH_EST.find((x) => x.id === r.estado)!;
                return (
                  <tr key={r.sku}>
                    <td>
                      <b>{r.nombre}</b>
                      <span className="block font-mono text-xs text-muted-foreground">{r.sku}</span>
                    </td>
                    <td className="text-muted-foreground">{r.cat}</td>
                    <td className="text-right tabular-nums">
                      <b>{numero(Math.round(r.inv))}</b>
                      <span className="block text-xs text-muted-foreground">
                        <span className={r.neg ? 'text-bad' : ''}>físico {numero(Math.round(r.fisico))}</span>
                        {r.comp > 0 ? ` · reservado ${numero(Math.round(r.comp))}` : ''}
                        {r.yulius > 0 ? ` · 3PL ${numero(Math.round(r.yulius))}` : ''}
                      </span>
                    </td>
                    <td className="text-right tabular-nums">{r.cons > 0 ? ventaDia(r.cons) : '—'}</td>
                    <td
                      className={`text-right tabular-nums ${r.dias !== null && r.dias <= r.lt ? 'font-semibold text-bad' : ''}`}
                    >
                      {r.dias !== null ? `${Math.round(r.dias)} d` : '—'}
                    </td>
                    <td className="text-right tabular-nums">{r.cons > 0 ? `${r.lt} d` : '—'}</td>
                    <td>
                      {r.oc > 0 ? (
                        <>
                          <b>{numero(Math.round(r.oc))}</b> pzas
                          <span className="block text-xs text-muted-foreground">
                            {r.llega ? `llega ${fechaCorta(r.llega)}` : 'sin fecha'}
                          </span>
                        </>
                      ) : (
                        <span className="text-muted-foreground">—</span>
                      )}
                    </td>
                    <td>
                      <Pill estado={e.tono}>{e.texto}</Pill>
                      {r.motivo ? (
                        <span className="mt-1 block text-xs text-muted-foreground">{r.motivo}</span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {lista.length > ver ? (
            <button
              type="button"
              className="m-3 text-sm font-semibold underline"
              onClick={() => setVer(ver + POR_PAGINA)}
            >
              Ver más ({lista.length - ver})
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
```

En `lib/comercializadora/motor.ts`, importar `kpiAbCalc` debajo del import de `planDatos.ts`:

```ts
import { kpiAbCalc } from '../../supabase/functions/_shared/planKpi.ts';
```

y agregar al final:

```ts

export type MotorListo = Extract<Motor, { ok: true }>;
/** Indicadores de abasto y riesgo de quiebre (_kpiAbCalc) del motor: una vez por datos + configuración. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const indicadoresMotor = (m: MotorListo): any =>
  memoMotor(m, 'kpi', () => kpiAbCalc(m.R, m.cfg, Date.now()));
```

Crear `app/(comercializadora)/comercializadora/doh/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Doh } from '@/components/comercializadora/doh';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { indicadoresMotor, motorPlan } from '@/lib/comercializadora/motor';
import { estadoInicial } from '@/lib/comercializadora/doh';

export default async function DohPagina({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { db } = await sesionComercializadora();
  const sp = await searchParams;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="DOH — días de inventario"
      descripcion="¿Alcanza el inventario hasta que llegue una compra nueva? Con las OCs en camino."
    />
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
  const r = indicadoresMotor(m).riesgo;
  return (
    <>
      {encabezado}
      {m.R.avisos.length ? (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
        </p>
      ) : null}
      <Doh
        filas={r.filas}
        conteos={{
          pedir: r.pedir,
          confirmar: r.confirmar,
          cubierto: r.cubierto,
          pronto: r.pronto,
          ok: r.ok,
          sinventa: r.sinventa,
        }}
        ventana={m.cfg.consumo.ventana}
        inicial={estadoInicial(sp.estado)}
      />
    </>
  );
}
```

En `components/comercializadora/inicio.tsx`:
- agregar `import Link from 'next/link';` como primera línea;
- agregar `import type { RiesgoInicio } from '@/lib/comercializadora/doh';` después del import de `@/lib/comercializadora/inicio`;
- reemplazar `function Panel` por:

```tsx
function Panel({
  titulo,
  enlace,
  children,
}: {
  titulo: string;
  enlace?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <details open className="placa rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold">{titulo}</summary>
      <div className="mt-3 text-sm">{children}</div>
      {enlace ? (
        <Link
          href={enlace.href}
          className="mt-3 inline-block text-xs font-semibold text-crema-strong underline"
        >
          {enlace.texto} →
        </Link>
      ) : null}
    </details>
  );
}
```

- en la firma de `Inicio`, agregar `riesgo,` después de `hoy,` en la desestructuración, y en el tipo, después de `hoy: string;`:

```tsx
  /** Plan 3d: riesgo de quiebre del motor. undefined = no se muestra; null = no se pudo calcular. */
  riesgo?: RiesgoInicio | null;
```

- insertar inmediatamente **antes** de `<Panel titulo="Sin stock">`:

```tsx
        {riesgo !== undefined ? (
          <Panel
            titulo="Riesgo de quiebre"
            enlace={{ href: '/comercializadora/doh?estado=pedir', texto: 'Ver en DOH' }}
          >
            {riesgo === null ? (
              <p className="text-muted-foreground">No se pudo calcular el riesgo de quiebre.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  <b className="text-bad">{riesgo.pedir}</b> por pedir ·{' '}
                  <b className="text-warn">{riesgo.confirmar}</b> con OC por confirmar ·{' '}
                  <b className="text-ok">{riesgo.cubierto}</b> cubiertos con OC
                  {riesgo.negativos ? ` · ${riesgo.negativos} con inventario negativo (revisar)` : ''}
                </p>
                {!riesgo.lista.length ? (
                  <Vacio titulo="Nada por pedir ni por confirmar" />
                ) : (
                  <ul className="divide-y divide-line">
                    {riesgo.lista.map((f) => (
                      <li key={f.sku} className="flex justify-between gap-2 py-2">
                        <span>
                          {f.nombre}{' '}
                          <span className="text-xs text-muted-foreground">
                            {f.sku} · {numero(Math.round(f.inv))} uds · {numero(Math.round(f.cons * 10) / 10)}
                            /día
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <b className={f.estado === 'pedir' ? 'text-bad' : 'text-warn'}>
                            {f.dias !== null ? `${Math.round(f.dias)} d` : '—'}
                          </b>
                          <Pill estado={f.estado === 'pedir' ? 'pierde' : 'bajo'}>
                            {f.estado === 'pedir' ? 'Pedir ya' : 'OC por confirmar'}
                          </Pill>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        ) : null}
```

- cambiar `<Panel titulo="Sin stock">` por `<Panel titulo="Sin stock" enlace={{ href: '/comercializadora/doh', texto: 'Ver DOH' }}>`, y `<Panel titulo="Inventario crítico">` por `<Panel titulo="Inventario crítico" enlace={{ href: '/comercializadora/doh', texto: 'Ver DOH' }}>`.

En `app/(comercializadora)/comercializadora/inicio/page.tsx`:
- importar `import { indicadoresMotor, motorPlan } from '@/lib/comercializadora/motor';` y `import { riesgoInicio, type RiesgoInicio } from '@/lib/comercializadora/doh';`;
- después de `const r = armarInicio({ … });`, agregar:

```tsx
  // Plan 3d: el riesgo de quiebre sale del motor (la misma cuenta que DOH e Indicadores). Si no se puede, se dice.
  let riesgo: RiesgoInicio | null = null;
  try {
    const m = await motorPlan(db);
    if (m.ok) riesgo = riesgoInicio(indicadoresMotor(m).riesgo);
  } catch {
    riesgo = null;
  }
```

- y pasar `riesgo={riesgo}` a `<Inicio … />`.

En `components/portal/navegacion.tsx`:
- importar `Gauge` de `lucide-react` (`Activity` ya se importa);
- en `gruposComercializadora` → 'Planear y pagar', **antes** de Inventario:

```ts
      { href: '/comercializadora/doh', nombre: 'DOH', icono: Gauge },
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-doh.test.tsx tests/portal/com-inicio-pantalla.test.tsx tests/portal/navegacion.test.tsx && npm run typecheck`
Expected: PASS. Las pruebas de Inicio del plan 3c no pasan `riesgo` y siguen sin el panel.

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/doh.ts components/comercializadora/doh.tsx "app/(comercializadora)/comercializadora/doh" lib/comercializadora/motor.ts components/comercializadora/inicio.tsx "app/(comercializadora)/comercializadora/inicio/page.tsx" components/portal/navegacion.tsx tests/portal/com-doh.test.tsx
git commit -m "feat(comercializadora): DOH con riesgo de quiebre y su panel en Inicio"
```

---

### Task 7: Indicadores (tarjetas, detalle, traza, metas y Actualizar)

**Files:**
- Create: `lib/comercializadora/indicadores.ts`
- Create: `components/comercializadora/indicadores.tsx`
- Create: `components/comercializadora/metas-kpi.tsx`
- Create: `components/comercializadora/actualizar-motor.tsx`
- Create: `app/(comercializadora)/comercializadora/indicadores/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`guardarMetasKpi`, `actualizarMotor`)
- Modify: `app/(comercializadora)/comercializadora/doh/page.tsx` (botón Actualizar)
- Modify: `components/portal/navegacion.tsx`
- Test: `tests/portal/com-indicadores.test.tsx`

**Interfaces:**
- Consumes: `motorPlan`, `memoMotor`, `indicadoresMotor`, `limpiarMotor` (Tareas 4 y 6); `kpiAbCalc`, `kpiAbEstados`, `kpiAbMetas`, `kpiAbTraza`, `kpiAbVentanas`, `planMoneyCorto`, `type CheckDatos`, `type Traza` (Tarea 5); `KPI_AB_CAMPOS`, `KPI_AB_DEF`, `normalizarCfgMotor` (Tarea 2); `editorCom`, `fallo`, `SOLO_LECTURA`, `Resultado`, `type Config` (`acciones.ts`).
- Produces:
  - `lib/comercializadora/indicadores.ts`:
    - `conRevisionOcSync(K, ultimoSync: string | null, ahora: number): K` (decisión 12; devuelve una copia)
    - `type DetalleKpi = 'fc' | 'cv' | 'inv' | 'exc' | 'disp' | 'datos'`, `esDetalle(x?): x is DetalleKpi`
    - `tonoKpi(e): Tono`, `dineroCorto(x)`, `pctTxt(x, dec?)`, `semanaTxt(ini, fin)`
    - `validarMetas(txt: Record<string, string>): { vals: Record<string, number> } | { error: string }`
    - reexporta `KPI_AB_CAMPOS`, `KPI_AB_DEF`, `kpiAbCalc`, `kpiAbEstados`, `kpiAbMetas`, `kpiAbTraza`, `kpiAbVentanas`, `normalizarCfgMotor` y los tipos `CheckDatos`, `Traza`
  - `TarjetasKpi({ K, E })`, `ParametrosKpi({ params })`, `DetalleKpiVista({ K, E, detalle, ventanas, traza })`
  - `MetasKpi({ metas, version, editable })`, `ActualizarMotor()`
  - `guardarMetasKpi(txt: Record<string, string>, version: number): Promise<Resultado<{ version: number; cambios: number }>>`
  - `actualizarMotor(): Promise<Resultado>`

- [ ] **Step 0: Revisión "OCs en camino al día con Zoho" con la frescura de `zoho-sync` (decisión 12)**

Crear `tests/portal/com-revision-oc-zoho.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { conRevisionOcSync } from '../../lib/comercializadora/indicadores';

const AHORA = Date.parse('2026-11-13T18:00:00Z');
const K = () => ({
  datos: {
    checks: [
      { id: 'inv', corto: 'inventario', titulo: 'Inventario', valor: 'hace 0 días', est: 'ok', detalle: '', acc: '', lnk: '' },
      {
        id: 'oc',
        corto: 'OCs sin poner al día',
        titulo: 'OCs en camino al día con Zoho',
        valor: 'sin poner al día',
        est: 'mal',
        detalle: 'x',
        acc: 'Ver órdenes de compra',
        lnk: '/comercializadora/ordenes',
      },
    ],
    ok: 1,
    total: 2,
  },
});

describe('decisión 12: OCs al día con zoho-sync', () => {
  it('≤ 3 días verde, ≤ 7 ámbar, más viejo o sin corrida rojo; recalcula datos.ok', () => {
    const ok = conRevisionOcSync(K() as never, '2026-11-12T18:00:00Z', AHORA);
    expect(ok.datos.checks[1]).toMatchObject({ est: 'ok', valor: 'sincronizadas hace 1 día' });
    expect(ok.datos.ok).toBe(2);
    expect(conRevisionOcSync(K() as never, '2026-11-08T18:00:00Z', AHORA).datos.checks[1].est).toBe('aviso');
    expect(conRevisionOcSync(K() as never, '2026-11-01T18:00:00Z', AHORA).datos.checks[1].est).toBe('mal');
    const nada = conRevisionOcSync(K() as never, null, AHORA);
    expect(nada.datos.checks[1]).toMatchObject({ est: 'mal', valor: 'sin sincronizar' });
    expect(nada.datos.ok).toBe(1);
  });
  it('no toca el K original (vive en la caché compartida)', () => {
    const k = K();
    conRevisionOcSync(k as never, '2026-11-12T18:00:00Z', AHORA);
    expect(k.datos.checks[1].est).toBe('mal');
    expect(k.datos.ok).toBe(1);
  });
  it('sin la revisión oc devuelve K igual', () => {
    const k = { datos: { checks: [], ok: 0, total: 0 } };
    expect(conRevisionOcSync(k as never, null, AHORA)).toEqual(k);
  });
});
```

Run: `npx vitest run tests/portal/com-revision-oc-zoho.test.ts`
Expected: FAIL (`conRevisionOcSync` no existe).

Agregar a `lib/comercializadora/indicadores.ts`. Si el archivo aún no existe, se crea aquí con esta función y el Step 3 agrega lo demás:

```ts
/**
 * Decisión 12: "OCs en camino al día con Zoho" con la última corrida buena de zoho-sync (el viejo usaba la conciliación
 * por archivo, que el portal no tiene). Mismos umbrales que la revisión de inventario: ≤ 3 días ok, ≤ 7 aviso, si no mal.
 * Devuelve una copia: K es el resultado en memoria de la caché compartida.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function conRevisionOcSync<T extends { datos?: { checks: any[]; ok: number; total: number } }>(
  K: T,
  ultimoSync: string | null,
  ahora: number,
): T {
  const i = K.datos?.checks.findIndex((c) => c.id === 'oc') ?? -1;
  if (!K.datos || i < 0) return K;
  const d = ultimoSync ? Math.round((ahora - new Date(ultimoSync).getTime()) / 864e5) : null;
  const est = d == null || d > 7 ? 'mal' : d > 3 ? 'aviso' : 'ok';
  const checks = K.datos.checks.map((c, j) =>
    j === i
      ? {
          ...c,
          valor: d == null ? 'sin sincronizar' : `sincronizadas hace ${d} día${d === 1 ? '' : 's'}`,
          est,
          detalle:
            'Zoho se sincroniza cada 30 minutos. Lo que está "en camino" reduce lo que hay que pedir: si la sincronización está vieja, el plan pide de menos o de más.',
        }
      : c,
  );
  return { ...K, datos: { ...K.datos, checks, ok: checks.filter((c) => c.est === 'ok').length } };
}
```

Run: `npx vitest run tests/portal/com-revision-oc-zoho.test.ts`
Expected: PASS (3). La página de Indicadores (Step 3) aplica `conRevisionOcSync` antes de `kpiAbEstados`.

- [ ] **Step 1: Pruebas que fallan**

Crear `tests/portal/com-indicadores.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', refresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { actualizarMotor, guardarMetasKpi } from '../../app/(comercializadora)/comercializadora/acciones';
import { DetalleKpiVista, TarjetasKpi } from '../../components/comercializadora/indicadores';
import { MetasKpi } from '../../components/comercializadora/metas-kpi';
import { KPI_AB_DEF, esDetalle, tonoKpi, validarMetas } from '../../lib/comercializadora/indicadores';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import { kpiAbCalc, kpiAbEstados, kpiAbTraza } from '../../supabase/functions/_shared/planKpi.ts';

const AHORA = Date.UTC(2026, 10, 13, 18);
const hace = (n: number) => new Date(AHORA - n * 864e5).toISOString();
const art = (o: Record<string, unknown>) => ({
  estatus: 'Compra Recurrente',
  categoria: 'Desechables',
  zoho_sync_at: null,
  cantidad_por_apertura: 0,
  minimo_compra_pzas: 0,
  multiplo_compra: 1,
  proveedor_preferido: 'Vasos SA',
  ...o,
});
/** 84 días de pedidos de A (estable) y B (subió las últimas 2 semanas); C sin venta; B sin inventario y con OC sin fecha. */
const R: DatosPlan = {
  hoy: '2026-11-13',
  hist: 90,
  histReal: 400,
  cat: [
    art({ sku: 'A', nombre: 'Vaso', costo_unitario: 2, saldo_cedis: 30 }),
    art({ sku: 'B', nombre: 'Tapa', costo_unitario: 1, saldo_cedis: 0, proveedor_preferido: null }),
    art({ sku: 'C', nombre: 'Popote', costo_unitario: 5, saldo_cedis: 40 }),
  ],
  pedidos: Array.from({ length: 84 }, (_, k) => ({
    id: 'p' + k,
    apertura_id: null,
    franquiciatario_email: 'f@x.com',
    fecha_pedido: hace(k),
    status: 'enviado',
    items: [
      { sku: 'A', cantidad: 3 + (k % 3) },
      { sku: 'B', cantidad: k < 14 ? 6 : 1 },
    ],
    items_editados: null,
  })),
  lt: [{ sku: 'A', dias: 7 }],
  map: [],
  oc: [
    {
      id: 'o1',
      sku: 'B',
      folio: 'OC-1',
      fecha: '2026-11-05',
      fecha_arribo: null,
      cantidad: 20,
      cantidad_recibida: 0,
      monto: 20,
    },
  ],
  comp: [],
  aperturas: [],
  pedAper: [],
  kit: {},
  conteoUlt: { cedis: {}, yulius: {} },
  ocZohoBorr: [],
  srv: null,
  avisos: [],
  cargadoEn: 1,
};
const K = kpiAbCalc(R, {}, AHORA);
const E = kpiAbEstados(K);

describe('Indicadores: cálculos de la pantalla', () => {
  it('validarMetas: rangos, enteros, coma decimal y pares mínimo < máximo', () => {
    const txt = Object.fromEntries(Object.entries(KPI_AB_DEF).map(([k, v]) => [k, String(v)]));
    expect(validarMetas({ ...txt, prec_min: '72.6', cv_min: '0,8' })).toEqual({
      vals: { ...KPI_AB_DEF, prec_min: 73, cv_min: 0.8 },
    });
    expect(validarMetas({ ...txt, prec_min: '120' })).toEqual({
      error: '"Precisión del forecast mínima" debe ser un número entre 0 y 100.',
    });
    expect(validarMetas({ ...txt, dias_min: '' })).toHaveProperty('error');
    expect(validarMetas({ ...txt, cv_min: '1.2', cv_max: '1.1' })).toEqual({
      error: 'En "Compras vs venta" el mínimo debe ser menor que el máximo.',
    });
  });
  it('tono de cada tarjeta y detalles válidos', () => {
    expect([tonoKpi(true), tonoKpi(null), tonoKpi(false), tonoKpi(undefined)]).toEqual([
      'ok',
      'bajo',
      'pierde',
      'neutro',
    ]);
    expect([esDetalle('fc'), esDetalle('x'), esDetalle(undefined)]).toEqual([true, false, false]);
  });
  it('el fixture produce forecast, riesgo y datos con avisos', () => {
    expect(K.fc.acc).not.toBeNull();
    expect(K.riesgo.filas.map((f: { sku: string; estado: string }) => [f.sku, f.estado])).toEqual([
      ['B', 'confirmar'],
      ['A', 'pronto'],
      ['C', 'sinventa'],
    ]);
  });
});

describe('Indicadores: pantalla', () => {
  it('siete tarjetas, cada una abre su detalle', () => {
    render(<TarjetasKpi K={K} E={E} />);
    const enlaces = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(enlaces).toHaveLength(7);
    expect(enlaces).toContain('/comercializadora/indicadores?detalle=datos');
    expect(screen.getByText('Precisión del forecast')).toBeInTheDocument();
  });

  it('detalle de datos: las revisiones que fallan llevan a la pantalla del portal que lo corrige', () => {
    render(<DetalleKpiVista K={K} E={E} detalle="datos" ventanas={[]} traza={null} />);
    expect(screen.getByText('Inventario sincronizado con Zoho')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Abrir el catálogo/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/catalogo',
    );
    expect(screen.getAllByRole('link', { name: /Ver inventario/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/inventario',
    );
  });

  it('detalle de exceso: el artículo sin venta aparece con su valor', () => {
    render(<DetalleKpiVista K={K} E={E} detalle="exc" ventanas={[]} traza={null} />);
    expect(screen.getByText('Popote')).toBeInTheDocument();
  });

  it('traza de un artículo: semana a semana y regreso al forecast', () => {
    const traza = kpiAbTraza(R, K, 'B');
    render(<DetalleKpiVista K={K} E={E} detalle="fc" ventanas={[]} traza={traza} />);
    expect(screen.getByRole('heading', { name: 'Tapa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al forecast/ })).toHaveAttribute(
      'href',
      '/comercializadora/indicadores?detalle=fc',
    );
    expect(screen.getAllByRole('row')).toHaveLength(K.NB + 1);
  });

  it('metas: solo lectura no muestra Guardar; edición guarda y refresca', async () => {
    const { unmount } = render(<MetasKpi metas={K.metas} version={1} editable={false} />);
    expect(screen.queryByRole('button', { name: 'Guardar metas' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Precisión del forecast mínima')).toBeDisabled();
    unmount();
    m.nivel = 'edicion';
    m.db = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 1 }],
      com_plan_config_historial: [],
    }).db;
    render(<MetasKpi metas={K.metas} version={1} editable />);
    fireEvent.change(screen.getByLabelText('Precisión del forecast mínima'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar metas' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Metas guardadas (1 cambio)'));
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe('acciones: metas y actualizar', () => {
  const txt = (o: Record<string, string> = {}) => ({
    ...Object.fromEntries(Object.entries(KPI_AB_DEF).map(([k, v]) => [k, String(v)])),
    ...o,
  });
  beforeEach(() => {
    m.nivel = 'edicion';
  });

  it('guarda solo cfg.kpi, sube la versión y deja historial por meta (ámbito config)', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: { consumo: { ventana: 45 }, kpi: { otra: 1 } }, version: 7 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80', exc_margen: '20' }), 7)).toEqual({
      ok: true,
      version: 8,
      cambios: 2,
    });
    expect(f.tablas.com_plan_config[0]).toMatchObject({
      version: 8,
      config: { consumo: { ventana: 45 }, kpi: { otra: 1, ...KPI_AB_DEF, prec_min: 80, exc_margen: 20 } },
    });
    expect(f.tablas.com_plan_config_historial.map((h) => [h.clave, h.valor_anterior, h.valor_nuevo])).toEqual(
      [
        ['kpi.prec_min', 70, 80],
        ['kpi.exc_margen', 30, 20],
      ],
    );
  });

  it('otra persona guardó antes: no escribe', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 8 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80' }), 7)).toHaveProperty('error');
    expect(f.tablas.com_plan_config[0].version).toBe(8);
    expect(f.tablas.com_plan_config_historial).toEqual([]);
  });

  it('sin cambios no escribe; con un valor fuera de rango responde el error', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 2 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt(), 2)).toEqual({ ok: true, version: 2, cambios: 0 });
    expect(await guardarMetasKpi(txt({ disp_min: '101' }), 2)).toHaveProperty('error');
    expect(f.tablas.com_plan_config[0].version).toBe(2);
  });

  it('solo lectura: no toca la base; actualizar sí se permite (no escribe)', async () => {
    m.nivel = 'lectura';
    const f = dbFalsa({ com_plan_config: [{ id: 1, config: {}, version: 2 }] });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80' }), 2)).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(await actualizarMotor()).toEqual({ ok: true });
    expect(f.consultas).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `npx vitest run tests/portal/com-indicadores.test.tsx`
Expected: FAIL. `guardarMetasKpi` no existe, y `indicadores.ts`/`indicadores.tsx`/`metas-kpi.tsx` tampoco.

- [ ] **Step 3: Implementar**

Crear `lib/comercializadora/indicadores.ts`:

```ts
import { fechaCorta } from './fechas';
import type { Tono } from './inicio';
import { KPI_AB_CAMPOS, KPI_AB_DEF } from '../../supabase/functions/_shared/planDatos.ts';
import { planMoneyCorto } from '../../supabase/functions/_shared/planKpi.ts';

export { KPI_AB_CAMPOS, KPI_AB_DEF };

export type DetalleKpi = 'fc' | 'cv' | 'inv' | 'exc' | 'disp' | 'datos';
const DETALLES: DetalleKpi[] = ['fc', 'cv', 'inv', 'exc', 'disp', 'datos'];
export const esDetalle = (x: string | undefined): x is DetalleKpi => DETALLES.includes(x as DetalleKpi);

/** Tono de la tarjeta según _kpiAbEstados: cumple → ok, cerca → bajo, no cumple → pierde, sin datos → neutro. */
export const tonoKpi = (e: boolean | null | undefined): Tono =>
  e === true ? 'ok' : e === false ? 'pierde' : e === null ? 'bajo' : 'neutro';

/** _planMoneyCorto: $1.2 M, $35 k, $820. */
export const dineroCorto = (x: number) => planMoneyCorto(x);
/** _kpiAbPct: +12%, −3%, — */
export const pctTxt = (x: number | null | undefined, dec = 0) =>
  x === null || x === undefined ? '—' : `${x > 0 ? '+' : ''}${x.toFixed(dec)}%`;
/** _kpiAbSemTxt: 27 oct – 2 nov */
export const semanaTxt = (ini: string | null, fin: string | null) =>
  ini && fin ? `${fechaCorta(ini)} – ${fechaCorta(fin)}` : '';

/**
 * Validación de _kpiAbMetasGuardar: cada meta en su rango (las enteras se redondean) y, en los pares, el mínimo menor que
 * el máximo. Acepta coma decimal, como el resto de la configuración del portal.
 */
export function validarMetas(
  txt: Record<string, string>,
): { vals: Record<string, number> } | { error: string } {
  const vals: Record<string, number> = {};
  for (const [clave, etiqueta, , , min, max, entero] of KPI_AB_CAMPOS) {
    const t = String(txt[clave] ?? '')
      .trim()
      .replace(',', '.');
    const v = Number(t);
    if (t === '' || !Number.isFinite(v) || v < min || v > max)
      return { error: `"${etiqueta}" debe ser un número entre ${min} y ${max}.` };
    vals[clave] = entero ? Math.round(v) : v;
  }
  if (vals.cv_min >= vals.cv_max)
    return { error: 'En "Compras vs venta" el mínimo debe ser menor que el máximo.' };
  if (vals.dias_min >= vals.dias_max)
    return { error: 'En "Cobertura de inventario" el mínimo debe ser menor que el máximo.' };
  return { vals };
}

// El cálculo es el port con paridad de supabase/functions/_shared/planKpi.ts; las pantallas lo importan desde aquí.
export {
  kpiAbCalc,
  kpiAbEstados,
  kpiAbMetas,
  kpiAbTraza,
  kpiAbVentanas,
  type CheckDatos,
  type Traza,
} from '../../supabase/functions/_shared/planKpi.ts';
export { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
```

Crear `components/comercializadora/indicadores.tsx`. Es server component: `_kpiAbHtml` 41175, `_kpiAbParamsHtml`, `_kpiAbDetalle` 41256 y la vista de `_kpiAbTraza` 41563.

```tsx
import Link from 'next/link';
import {
  CalendarClock,
  Coins,
  Database,
  PackageCheck,
  ShoppingCart,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Kpi, Pill, Tarjeta } from '@/components/portal/piezas';
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import {
  dineroCorto,
  pctTxt,
  semanaTxt,
  tonoKpi,
  type CheckDatos,
  type DetalleKpi,
  type Traza,
} from '@/lib/comercializadora/indicadores';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type K = any;
type Estados = Record<string, boolean | null | undefined>;
const RUTA = '/comercializadora/indicadores';

/** Las siete tarjetas de _kpiAbHtml; cada una abre su detalle (?detalle=). */
export function TarjetasKpi({ K, E }: { K: K; E: Estados }) {
  const m = K.metas;
  const fc = K.fc;
  const dv = fc.desv as number | null;
  const cv = K.cv;
  const iv = K.inv;
  const ex = K.exc;
  const ds = K.disp;
  const dt = K.datos;
  const malos = (dt.checks as CheckDatos[])
    .filter((x) => x.est !== 'ok')
    .sort((a, b) => (a.est === 'mal' ? 0 : 1) - (b.est === 'mal' ? 0 : 1));
  const tarjeta = (
    id: DetalleKpi,
    etiqueta: string,
    valor: string,
    meta: string,
    cumple: boolean | null | undefined,
    nota: string,
    icono: LucideIcon,
  ) => (
    <Kpi
      key={etiqueta}
      etiqueta={etiqueta}
      valor={valor}
      nota={`Meta ${meta}${nota ? ` · ${nota}` : ''}`}
      href={`${RUTA}?detalle=${id}`}
      icono={icono}
      tono={tonoKpi(cumple)}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tarjeta(
        'fc',
        'Precisión del forecast',
        fc.acc !== null ? `${Math.round(fc.acc)}%` : 'Sin datos',
        `≥${m.prec_min}%`,
        E.fc,
        fc.acc !== null
          ? `Últimas ${K.nw} semanas · ${fc.n} artículos`
          : 'Todavía no hay semanas suficientes para comparar',
        Target,
      )}
      {tarjeta(
        'fc',
        'Venta vs proyección',
        dv === null ? 'Sin datos' : `${dv > 0 ? '+' : ''}${Math.round(dv)}%`,
        `±${m.sesgo_max}%`,
        E.sesgo,
        dv === null
          ? ''
          : dv > m.sesgo_max
            ? 'Se vendió más de lo proyectado: riesgo de quedarse corto'
            : dv < -m.sesgo_max
              ? 'Se vendió menos de lo proyectado: riesgo de comprar de más'
              : 'La proyección y la venta real van parejas',
        TrendingUp,
      )}
      {tarjeta(
        'cv',
        `Compras vs venta (${K.nw} sem.)`,
        cv.ratio !== null ? `${cv.ratio.toFixed(2)}×` : 'Sin datos',
        `${m.cv_min.toFixed(2)}–${m.cv_max.toFixed(2)}×`,
        E.cv,
        cv.ratio !== null
          ? `OCs registradas ${dineroCorto(cv.comp)} · venta a costo ${dineroCorto(cv.vta)}`
          : 'Sin compras ni venta en el periodo',
        ShoppingCart,
      )}
      {tarjeta(
        'inv',
        'Cobertura de inventario',
        iv.dias !== null ? `${Math.round(iv.dias)} días` : 'Sin datos',
        `${m.dias_min}–${m.dias_max} d`,
        E.inv,
        iv.valor > 0 ? `${dineroCorto(iv.valor)} a costo en inventario` : 'Sin inventario valuado',
        CalendarClock,
      )}
      {tarjeta(
        'exc',
        'Capital en exceso',
        ex.pct !== null ? `${Math.round(ex.pct)}%` : 'Sin datos',
        `≤${m.exc_max}% del inventario`,
        E.exc,
        ex.pct !== null
          ? `${dineroCorto(ex.valor)} parados · ${ex.filas.length} sobre cobertura, ${ex.sinVenta.length} sin venta`
          : '',
        Coins,
      )}
      {tarjeta(
        'disp',
        'Disponibilidad',
        ds.pct !== null ? `${Math.round(ds.pct)}%` : 'Sin datos',
        `≥${m.disp_min}%`,
        E.disp,
        ds.conVenta
          ? ds.agot.length
            ? `${ds.agot.length} de ${ds.conVenta} artículos con venta están agotados hoy`
            : 'Ningún artículo con venta está agotado'
          : '',
        PackageCheck,
      )}
      {tarjeta(
        'datos',
        'Datos del plan',
        `${dt.ok} de ${dt.total}`,
        `${dt.total} de ${dt.total} al día`,
        E.datos,
        malos.length
          ? `Falta: ${malos
              .slice(0, 2)
              .map((x) => x.corto)
              .join(', ')}${malos.length > 2 ? ` y ${malos.length - 2} más` : ''}`
          : 'Todo al día',
        Database,
      )}
    </div>
  );
}

/** _kpiAbParamsHtml: lo que mueve a los indicadores, con enlace a Configuración. */
export function ParametrosKpi({ params }: { params: [string, string][] }) {
  return (
    <p className="placa rounded-lg px-3 py-2 text-xs leading-6 text-muted-foreground">
      <b className="text-ink-2">Parámetros vigentes</b> ·{' '}
      {params.map(([k, v]) => (
        <span key={k}>
          {k}: <b className="font-semibold text-ink-2">{v}</b> ·{' '}
        </span>
      ))}
      <Link href="/comercializadora/configuracion" className="font-semibold underline">
        Modificar
      </Link>
    </p>
  );
}

function Tabla({
  cab,
  filas,
  vacio = 'Sin datos',
}: {
  cab: [string, boolean?][];
  filas: React.ReactNode[];
  vacio?: string;
}) {
  return (
    <div className="placa mt-2 overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            {cab.map(([t, der]) => (
              <th key={t} className={der ? 'text-right' : ''}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas
          ) : (
            <tr>
              <td colSpan={cab.length} className="py-3 text-center text-muted-foreground">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Caja({ t, v, sub, e }: { t: string; v: string; sub?: string; e?: boolean | null }) {
  const color = e === true ? 'text-ok' : e === false ? 'text-bad' : e === null ? 'text-warn' : '';
  return (
    <div className="min-w-32 flex-1 rounded-lg border border-line px-3 py-2">
      <p className="text-xs font-bold uppercase text-muted-foreground">{t}</p>
      <p className={`text-lg font-extrabold ${color}`}>{v}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
const Articulo = ({ a }: { a: { nombre: string; sku: string } }) => (
  <>
    <b>{a.nombre}</b>
    <span className="block font-mono text-xs text-muted-foreground">{a.sku}</span>
  </>
);
const Sub = ({ t, s }: { t: string; s?: string }) => (
  <h3 className="mt-4 font-bold">
    {t} {s ? <span className="font-normal text-muted-foreground">{s}</span> : null}
  </h3>
);
const der = 'text-right tabular-nums';

/** Detalle de cada indicador (_kpiAbDetalle) y la traza de un artículo (_kpiAbTraza). */
export function DetalleKpiVista({
  K,
  E,
  detalle,
  ventanas,
  traza,
}: {
  K: K;
  E: Estados;
  detalle: DetalleKpi;
  ventanas: { v: number; acc: number; actual: boolean }[];
  traza: Traza | null;
}) {
  const m = K.metas;
  let titulo = '';
  let cuerpo: React.ReactNode = null;
  if (detalle === 'fc' && traza) {
    titulo = traza.nombre;
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          El plan proyecta cada semana con el promedio de venta de los días anteriores a esa semana. Hoy ese
          promedio es{' '}
          <b>{numero(traza.tasa >= 10 ? Math.round(traza.tasa) : Math.round(traza.tasa * 10) / 10)}</b> pzas
          al día, unas <b>{numero(Math.round(traza.tasa * 7))}</b> por semana (
          {numero(Math.round(traza.venta30))} pzas en la ventana).{' '}
          {traza.motivo || 'La proyección y la venta van parejas.'}
        </p>
        <Tabla
          cab={[
            ['Semana'],
            ['Se pidió', true],
            ['De qué pedidos'],
            ['El plan esperaba', true],
            ['Diferencia', true],
          ]}
          filas={traza.filas.map((f, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(f.ini, f.fin)}</td>
              <td className={`${der} font-semibold`}>
                {f.real == null ? '—' : `${numero(Math.round(f.real))} pzas`}
              </td>
              <td className="text-xs text-muted-foreground">
                {f.tipos.length
                  ? f.tipos.map(([t, q]) => `${t} ${numero(Math.round(q))}`).join(' · ')
                  : 'sin pedidos'}
              </td>
              <td className={der}>{f.proy == null ? '—' : `${numero(Math.round(f.proy))} pzas`}</td>
              <td
                className={`${der} ${f.dif !== null && Math.abs(f.dif) >= 25 ? 'font-semibold text-bad' : ''}`}
              >
                {pctTxt(f.dif)}
              </td>
            </tr>
          ))}
        />
        <Link href={`${RUTA}?detalle=fc`} className="mt-3 inline-block text-sm font-semibold underline">
          ← Volver al forecast
        </Link>
      </>
    );
  } else if (detalle === 'fc') {
    const fc = K.fc;
    titulo = 'Forecast: qué tanto acierta el plan';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Cada semana el plan proyecta cuánto se va a pedir de cada artículo con el promedio de venta de la
          ventana. Aquí se compara esa proyección con lo que las sucursales realmente pidieron: en las últimas{' '}
          {K.nw} semanas se proyectaron <b>{dineroCorto(fc.proy)}</b> (a costo) y se vendieron{' '}
          <b>{dineroCorto(fc.real)}</b>
          {fc.desv !== null ? ` (${pctTxt(fc.desv)})` : ''}. Cuando la venta cambia de golpe, el promedio
          tarda semanas en alcanzarla.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Precisión por artículo"
            v={fc.acc !== null ? `${Math.round(fc.acc)}%` : '—'}
            e={E.fc}
            sub={`meta ≥${m.prec_min}%`}
          />
          <Caja
            t="Venta vs proyección"
            v={fc.desv !== null ? pctTxt(fc.desv) : '—'}
            e={E.sesgo}
            sub={`meta ±${m.sesgo_max}%`}
          />
        </div>
        <Sub t="Semana a semana" s="(a costo)" />
        <Tabla
          cab={[['Semana'], ['Proyectado', true], ['Vendido', true], ['Diferencia', true]]}
          filas={fc.sem.slice(0, K.nw).map((s: K, i: number) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(s.ini, s.fin)}</td>
              <td className={der}>{s.n ? pesos(s.proy) : '—'}</td>
              <td className={der}>{s.n ? pesos(s.real) : '—'}</td>
              <td
                className={`${der} ${s.desv !== null && Math.abs(s.desv) > m.sesgo_max ? 'font-semibold text-bad' : ''}`}
              >
                {pctTxt(s.desv)}
              </td>
            </tr>
          ))}
        />
        <Sub t="Donde más se aleja" s="(artículos con diferencia de 20% o más)" />
        <Tabla
          cab={[['Artículo'], ['Proyectado', true], ['Vendido', true], ['Diferencia', true], ['Por qué']]}
          filas={fc.top.map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Link
                  href={`${RUTA}?detalle=fc&traza=${encodeURIComponent(a.sku)}`}
                  title="Ver de dónde sale la proyección"
                >
                  <Articulo a={a} />
                </Link>
              </td>
              <td className={der}>{numero(Math.round(a.proy))} pzas</td>
              <td className={der}>{numero(Math.round(a.real))} pzas</td>
              <td
                className={`${der} font-semibold ${a.desv !== null && a.desv > 0 ? 'text-bad' : 'text-warn'}`}
              >
                {pctTxt(a.desv === null ? null : a.desv * 100)}
              </td>
              <td className="text-xs text-muted-foreground">{a.motivo}</td>
            </tr>
          ))}
        />
        {ventanas.length > 1 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Con la misma cuenta y otra ventana de venta:{' '}
            {ventanas
              .map((o) => `${o.v} días ${Math.round(o.acc)}%${o.actual ? ' (actual)' : ''}`)
              .join(' · ')}
            . Se cambia en Configuración &gt; Consumo.
          </p>
        ) : null}
      </>
    );
  } else if (detalle === 'cv') {
    const cv = K.cv;
    titulo = 'Compras vs venta';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Compras son las OCs emitidas en las últimas {K.nw} semanas (sin borradores) que están registradas en
          la plataforma; venta es lo que pidieron las sucursales, a costo. Cerca de 1× el inventario se
          mantiene. Solo cuenta lo registrado aquí: si se emiten OCs directo en Zoho, las compras salen más
          bajas de lo real.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Compras / venta"
            v={cv.ratio !== null ? `${cv.ratio.toFixed(2)}×` : '—'}
            e={E.cv}
            sub={`meta ${m.cv_min.toFixed(2)}–${m.cv_max.toFixed(2)}×`}
          />
          <Caja t="Compras" v={dineroCorto(cv.comp)} sub={`${K.nw} semanas`} />
          <Caja t="Venta a costo" v={dineroCorto(cv.vta)} sub={`${K.nw} semanas`} />
        </div>
        <Tabla
          cab={[
            ['Semana'],
            ['OCs', true],
            ['Compras', true],
            ['Venta a costo', true],
            ['Compras / venta', true],
          ]}
          filas={cv.sem.slice(0, K.nw).map((s: K, i: number) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(s.ini, s.fin)}</td>
              <td className={der}>{s.n || 0}</td>
              <td className={`${der} font-semibold`}>{pesos(s.comp + s.compImp)}</td>
              <td className={der}>{pesos(s.vta)}</td>
              <td className={der}>{s.ratio !== null ? `${s.ratio.toFixed(2)}×` : '—'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'inv') {
    const iv = K.inv;
    titulo = 'Cobertura de inventario';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Cuántos días de venta cubre el inventario de hoy, a costo{K.cfg.inv.yulius ? ' (CEDIS y 3PL)' : ''}.
          El total engaña: unos artículos tienen de sobra y otros no alcanzan, por eso se ve por categoría. No
          incluye artículos de compra única (equipo).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Cobertura"
            v={iv.dias !== null ? `${Math.round(iv.dias)} días` : '—'}
            e={E.inv}
            sub={`meta ${m.dias_min}–${m.dias_max} d`}
          />
          <Caja t="Inventario a costo" v={dineroCorto(iv.valor)} />
          <Caja t="Venta diaria a costo" v={dineroCorto(iv.cogsDia)} />
        </div>
        <Tabla
          cab={[['Categoría'], ['Inventario', true], ['% del total', true], ['Cobertura', true]]}
          filas={iv.cats.map((g: K) => (
            <tr key={g.nombre}>
              <td>{g.nombre}</td>
              <td className={`${der} font-semibold`}>{pesos(g.valor)}</td>
              <td className={der}>{g.pct.toFixed(0)}%</td>
              <td
                className={`${der} ${g.dias !== null && (g.dias < m.dias_min || g.dias > m.dias_max) ? 'font-semibold text-warn' : ''}`}
              >
                {g.dias !== null ? `${Math.round(g.dias)} d` : 'sin venta'}
              </td>
            </tr>
          ))}
        />
        <Sub t="Donde está el dinero" s="(los 8 artículos con más inventario)" />
        <Tabla
          cab={[['Artículo'], ['Inventario', true], ['Cobertura', true]]}
          filas={iv.top.slice(0, 8).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={`${der} font-semibold`}>{pesos(a.valor)}</td>
              <td className={der}>{a.dias !== null ? `${Math.round(a.dias)} d` : 'sin venta'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'exc') {
    const ex = K.exc;
    titulo = 'Capital en exceso';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Inventario (a costo) que rebasa lo que pide el plan —lead time más seguridad más ciclo de compra— y{' '}
          {m.exc_margen} días más, y existencias de artículos que no se vendieron en la ventana.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Exceso total"
            v={ex.pct !== null ? `${Math.round(ex.pct)}%` : '—'}
            e={E.exc}
            sub={`meta ≤${m.exc_max}% · ${dineroCorto(ex.valor)}`}
          />
          <Caja t="Sobre la cobertura" v={dineroCorto(ex.exceso)} sub={`${ex.filas.length} artículos`} />
          <Caja t="Sin venta" v={dineroCorto(ex.sinVentaVal)} sub={`${ex.sinVenta.length} artículos`} />
        </div>
        <Sub t="Sobre la cobertura" s="(los 10 de más valor)" />
        <Tabla
          cab={[['Artículo'], ['Hay', true], ['Alcanza', true], ['Debería', true], ['Exceso a costo', true]]}
          filas={ex.filas.slice(0, 10).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={der}>{numero(Math.round(a.uds))} pzas</td>
              <td className={der}>{Math.round(a.dias)} d</td>
              <td className={der}>{Math.round(a.obj)} d</td>
              <td className={`${der} font-semibold`}>{pesos(a.exVal)}</td>
            </tr>
          ))}
        />
        <Sub t="Sin venta en la ventana" s="(los 10 de más valor)" />
        <Tabla
          cab={[['Artículo'], ['Hay', true], ['Inventario a costo', true]]}
          filas={ex.sinVenta.slice(0, 10).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={der}>{numero(Math.round(a.uds))} pzas</td>
              <td className={`${der} font-semibold`}>{pesos(a.valor)}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'disp') {
    const ds = K.disp;
    titulo = 'Disponibilidad de producto';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          De los artículos que se vendieron en la ventana, cuántos tienen hoy inventario disponible (después
          de lo reservado por pedidos pagados). Un agotado hoy es un pedido incompleto mañana.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Disponibilidad"
            v={ds.pct !== null ? `${Math.round(ds.pct)}%` : '—'}
            e={E.disp}
            sub={`meta ≥${m.disp_min}%`}
          />
          <Caja
            t="Agotados hoy"
            v={String(ds.agot.length)}
            e={ds.agot.length ? false : undefined}
            sub={`de ${ds.conVenta} con venta`}
          />
        </div>
        <Tabla
          cab={[['Artículo'], ['Proveedor'], ['Venta diaria', true], ['En camino', true], ['Llega']]}
          filas={ds.agot.slice(0, 15).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td>{a.prov || '—'}</td>
              <td className={der}>
                {numero(a.cons >= 10 ? Math.round(a.cons) : Math.round(a.cons * 10) / 10)} pzas
              </td>
              <td className={der}>
                {a.enOC > 0 ? `${numero(Math.round(a.enOC))} pzas` : <span className="text-bad">nada</span>}
              </td>
              <td className="whitespace-nowrap">{a.llega ? fechaCorta(a.llega) : '—'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else {
    titulo = 'Datos del plan';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          El plan solo es tan bueno como los datos que lo alimentan. Cada fila dice si esa revisión está al
          día y a dónde ir para corregirla.
        </p>
        <ul className="placa mt-3 divide-y divide-line rounded-lg">
          {(K.datos.checks as CheckDatos[]).map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <Pill estado={c.est === 'ok' ? 'ok' : c.est === 'aviso' ? 'bajo' : 'pierde'}>{c.valor}</Pill>
              <div className="min-w-0 flex-1">
                <b>{c.titulo}</b>
                {c.est !== 'ok' ? <p className="text-xs text-muted-foreground">{c.detalle}</p> : null}
              </div>
              {c.est !== 'ok' && c.lnk ? (
                <Link href={c.lnk} className="whitespace-nowrap text-xs font-semibold underline">
                  {c.acc} →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <Tarjeta
      titulo={titulo}
      acciones={
        <Link href={RUTA} className="text-sm underline">
          Cerrar
        </Link>
      }
      cuerpo
    >
      {cuerpo}
    </Tarjeta>
  );
}
```

Crear `components/comercializadora/metas-kpi.tsx` (`_kpiAbMetasAbrir` 41314, `_kpiAbMetasGuardar` 41324):

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { claseCampo } from '@/lib/crm/formato';
import { KPI_AB_CAMPOS, KPI_AB_DEF } from '@/lib/comercializadora/indicadores';
import { guardarMetasKpi } from '@/app/(comercializadora)/comercializadora/acciones';

const aTexto = (o: Record<string, number>) =>
  Object.fromEntries(KPI_AB_CAMPOS.map(([k]) => [k, String(o[k])]));

/** Metas de los indicadores (_kpiAbMetasAbrir/_kpiAbMetasGuardar): se guardan para todo el equipo, con historial. */
export function MetasKpi(p: { metas: Record<string, number>; version: number; editable: boolean }) {
  const router = useRouter();
  const [vals, setVals] = useState<Record<string, string>>(aTexto(p.metas));
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const guardar = () =>
    iniciar(async () => {
      const r = await guardarMetasKpi(vals, p.version);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({
        ok: true,
        t: r.cambios
          ? `Metas guardadas (${r.cambios} cambio${r.cambios === 1 ? '' : 's'})`
          : 'Las metas ya estaban así',
      });
      router.refresh();
    });
  return (
    <details className="placa rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold">
        {p.editable ? 'Editar metas' : 'Ver metas'}
      </summary>
      <p className="mt-2 text-sm text-muted-foreground">
        Define contra qué se mide cada indicador. Se guardan para todo el equipo y cada cambio queda en el
        historial de la configuración del plan.
        {p.editable ? '' : ' Tu acceso es de solo lectura.'}
      </p>
      <div className="mt-3 divide-y divide-line">
        {KPI_AB_CAMPOS.map(([k, etiqueta, unidad, ayuda, min, max, entero]) => (
          <label key={k} className="grid grid-cols-[1fr_6rem_3rem] items-center gap-2 py-2">
            <span>
              <b className="text-sm">{etiqueta}</b>
              <span className="block text-xs text-muted-foreground">{ayuda}</span>
            </span>
            <input
              aria-label={etiqueta}
              inputMode="decimal"
              className={`${claseCampo} text-right`}
              value={vals[k]}
              min={min}
              max={max}
              step={entero ? 1 : 'any'}
              disabled={!p.editable}
              onChange={(e) => setVals({ ...vals, [k]: e.target.value })}
            />
            <span className="text-xs text-muted-foreground">{unidad}</span>
          </label>
        ))}
      </div>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`mt-3 text-sm ${msg.ok ? '' : 'text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {p.editable ? (
        <div className="mt-3 flex flex-wrap gap-3">
          <button
            type="button"
            className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
            disabled={pendiente}
            onClick={guardar}
          >
            {pendiente ? 'Guardando…' : 'Guardar metas'}
          </button>
          <button type="button" className="text-sm underline" onClick={() => setVals(aTexto(KPI_AB_DEF))}>
            Restablecer valores sugeridos
          </button>
        </div>
      ) : null}
    </details>
  );
}
```

Crear `components/comercializadora/actualizar-motor.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { actualizarMotor } from '@/app/(comercializadora)/comercializadora/acciones';

/** "Actualizar" (_kpiAbCargar(true)): vuelve a leer los datos del plan. */
export function ActualizarMotor() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        className="inline-flex items-center gap-1 text-sm font-semibold underline"
        disabled={pendiente}
        onClick={() =>
          iniciar(async () => {
            const r = await actualizarMotor();
            setError('error' in r ? r.error : null);
            router.refresh();
          })
        }
      >
        <RefreshCw size={14} aria-hidden="true" /> {pendiente ? 'Actualizando…' : 'Actualizar'}
      </button>
      {error ? (
        <span role="alert" className="text-sm text-bad">
          {error}
        </span>
      ) : null}
    </span>
  );
}
```

En `app/(comercializadora)/comercializadora/acciones.ts`:
- importar, junto a los demás imports de `@/lib/comercializadora/*`:

```ts
import { kpiAbMetas, normalizarCfgMotor, validarMetas } from '@/lib/comercializadora/indicadores';
import { limpiarMotor } from '@/lib/comercializadora/motor';
```

- agregar al final:

```ts
// ── Plan 3d: Indicadores y piezas por apertura ─────────────────────────────────────────────────────────────────

const CONFIG_OCUPADA =
  'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.';

/**
 * _kpiAbMetasGuardar (decisión 10): solo cfg.kpi.*, con la versión que vio la pantalla y una fila de historial por meta
 * que cambia (ámbito 'config', clave 'kpi.<meta>'). Las metas no cambian el cálculo del servidor: no se recalcula.
 */
export async function guardarMetasKpi(
  txt: Record<string, string>,
  version: number,
): Promise<Resultado<{ version: number; cambios: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const v = validarMetas(txt);
    if ('error' in v) return v;
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version)) return { error: CONFIG_OCUPADA };
    const antes = kpiAbMetas(normalizarCfgMotor(actual.data.config));
    const cambios = Object.keys(v.vals).filter((k) => Number(antes[k]) !== v.vals[k]);
    if (!cambios.length) return { ok: true, version: Number(version), cambios: 0 };
    const raw: Config = actual.data.config ?? {};
    const kpi = raw.kpi && typeof raw.kpi === 'object' ? raw.kpi : {};
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: { ...raw, kpi: { ...kpi, ...v.vals } }, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: CONFIG_OCUPADA };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(
        cambios.map((k) => ({
          ambito: 'config',
          clave: `kpi.${k}`,
          valor_anterior: antes[k],
          valor_nuevo: v.vals[k],
        })),
      );
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length };
  } catch (e) {
    return fallo(e);
  }
}

/** "Actualizar" de Indicadores, DOH y Piezas por apertura: vuelve a leer los datos del plan. No escribe nada. */
export async function actualizarMotor(): Promise<Resultado> {
  try {
    await sesionComercializadora(false);
    limpiarMotor();
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch {
    return { error: 'No se pudo actualizar. Intenta de nuevo.' };
  }
}
```

Crear `app/(comercializadora)/comercializadora/indicadores/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { DetalleKpiVista, ParametrosKpi, TarjetasKpi } from '@/components/comercializadora/indicadores';
import { MetasKpi } from '@/components/comercializadora/metas-kpi';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { indicadoresMotor, memoMotor, motorPlan } from '@/lib/comercializadora/motor';
import { com } from '@/lib/comercializadora/consultas';
import {
  conRevisionOcSync,
  esDetalle,
  kpiAbCalc,
  kpiAbEstados,
  kpiAbTraza,
  kpiAbVentanas,
} from '@/lib/comercializadora/indicadores';

export default async function IndicadoresPagina({
  searchParams,
}: {
  searchParams: Promise<{ detalle?: string; traza?: string }>;
}) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Indicadores de abasto"
      descripcion="Forecast, compras e inventario con los mismos datos y la misma configuración del plan. Responsable: Compras / Dirección de Supply."
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
  // Decisión 12: la revisión de OCs usa la última corrida buena de zoho-sync (copia: K vive en la caché compartida).
  const sync = await com(db)
    .from('com_sync_log')
    .select('inicio')
    .eq('proceso', 'zoho-sync')
    .eq('ok', true)
    .order('inicio', { ascending: false })
    .limit(1);
  const K = conRevisionOcSync(indicadoresMotor(m), sync.data?.[0]?.inicio ?? null, Date.now());
  const E = kpiAbEstados(K);
  const detalle = esDetalle(sp.detalle) ? sp.detalle : null;
  // Las otras ventanas (14 y 21 días) son dos cálculos completos más: solo cuando se abre el detalle del forecast.
  const ventanas =
    detalle === 'fc'
      ? kpiAbVentanas(m.R, m.cfg, Date.now(), (R, c, t) =>
          memoMotor({ R, cfg: c }, 'kpi', () => kpiAbCalc(R, c, t)),
        )
      : [];
  const traza = detalle === 'fc' && sp.traza ? kpiAbTraza(m.R, K, sp.traza) : null;
  return (
    <>
      {encabezado}
      <div className="space-y-5">
        {m.R.avisos.length ? (
          <p role="status" className="rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
            No se pudieron leer: {m.R.avisos.join(', ')}. Los indicadores pueden salir incompletos.
          </p>
        ) : null}
        <TarjetasKpi K={K} E={E} />
        <ParametrosKpi params={K.params} />
        {detalle ? <DetalleKpiVista K={K} E={E} detalle={detalle} ventanas={ventanas} traza={traza} /> : null}
        <MetasKpi metas={K.metas} version={m.version} editable={puedeEditarCom(accesos)} />
      </div>
    </>
  );
}
```

En `app/(comercializadora)/comercializadora/doh/page.tsx`:
- importar `import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';`;
- cambiar el `<Encabezado … />` (autocerrado) por la misma etiqueta con `<ActualizarMotor />` como hijo. El archivo queda:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { Doh } from '@/components/comercializadora/doh';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { indicadoresMotor, motorPlan } from '@/lib/comercializadora/motor';
import { estadoInicial } from '@/lib/comercializadora/doh';

export default async function DohPagina({ searchParams }: { searchParams: Promise<{ estado?: string }> }) {
  const { db } = await sesionComercializadora();
  const sp = await searchParams;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="DOH — días de inventario"
      descripcion="¿Alcanza el inventario hasta que llegue una compra nueva? Con las OCs en camino."
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
  const r = indicadoresMotor(m).riesgo;
  return (
    <>
      {encabezado}
      {m.R.avisos.length ? (
        <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
        </p>
      ) : null}
      <Doh
        filas={r.filas}
        conteos={{
          pedir: r.pedir,
          confirmar: r.confirmar,
          cubierto: r.cubierto,
          pronto: r.pronto,
          ok: r.ok,
          sinventa: r.sinventa,
        }}
        ventana={m.cfg.consumo.ventana}
        inicial={estadoInicial(sp.estado)}
      />
    </>
  );
}
```

En `components/portal/navegacion.tsx`, en 'Planear y pagar', **después** de la línea del DOH:

```ts
      { href: '/comercializadora/indicadores', nombre: 'Indicadores', icono: Activity },
```

- [ ] **Step 4: Correr y ver que pasan**

Run: `npx vitest run tests/portal/com-indicadores.test.tsx tests/portal/com-doh.test.tsx tests/portal/com-acciones.test.ts && npm run typecheck`
Expected: PASS (12 + 7 + las de acciones que ya existían).

- [ ] **Step 5: Commit**

```bash
git add lib/comercializadora/indicadores.ts components/comercializadora/indicadores.tsx components/comercializadora/metas-kpi.tsx components/comercializadora/actualizar-motor.tsx "app/(comercializadora)/comercializadora/indicadores" "app/(comercializadora)/comercializadora/doh/page.tsx" "app/(comercializadora)/comercializadora/acciones.ts" components/portal/navegacion.tsx tests/portal/com-indicadores.test.tsx
git commit -m "feat(comercializadora): Indicadores de abasto con detalle, traza y metas"
```

---

### Task 8: Sugerir piezas por apertura (en Catálogo)

**Files:**
- Create: `supabase/functions/_shared/planPiezas.ts`
- Create: `lib/comercializadora/piezas.ts`
- Create: `components/comercializadora/piezas-apertura.tsx`
- Create: `app/(comercializadora)/comercializadora/catalogo/piezas-apertura/page.tsx`
- Modify: `app/(comercializadora)/comercializadora/catalogo/page.tsx` (enlace)
- Modify: `app/(comercializadora)/comercializadora/acciones.ts` (`aplicarPiezasApertura`)
- Test: `supabase/functions/_shared/planPiezas_parity_test.ts`, `tests/portal/com-piezas.test.tsx`

**Interfaces:**
- Consumes: `parseItems`, `planDatTipo`, `planEngMediana`, `type PedidoPlan` (`planEngine.ts`); `pedidosPlanLegado`, `aperturasPlanLegado`, `pedidosAperturaLegado` (Tarea 4); `normalizarAperturas` (Tarea 4); `normalizarCfgMotor` (Tarea 7, reexportado); `registrarHistorial`, `editorCom`, `fallo` (`acciones.ts`).
- Produces:
  - `interface FilaPiezas { sku; nombre; actual; n; N; mediana; prom; sug; min; max }`
  - `interface ResultadoPiezas { filas; N; sinAtribuir; totalAperturas }`
  - `planPzasApCalc(pedidos, R: { aperturas; pedAper; map; cat }, cfg, muestraN): ResultadoPiezas`
  - `preseleccionar(f: FilaPiezas): boolean`
  - `PiezasApertura({ res, n, editable, aviso, degradado })`
  - `aplicarPiezasApertura(cambios: { sku: string; valor: string; antes: number }[]): Promise<Resultado<{ guardados: number; fallas: string[] }>>`

- [ ] **Step 1: Pruebas que fallan**

Crear `supabase/functions/_shared/planPiezas_parity_test.ts`:

```ts
// deno-lint-ignore-file no-explicit-any
// Paridad de "Sugerir piezas por apertura": _planPzasApCalc de la app contra planPiezas.ts.
import { assert, assertEquals } from "@std/assert";
import { normalizarCfgMotor } from "./planDatos.ts";
import { planPzasApCalc, preseleccionar } from "./planPiezas.ts";
import { app, rng, SIN_APP, STUBS_MOTOR } from "./pruebas/appVieja.ts";
import { aperturasNorm, CAT, HOY, MAPA, NOMBRES_DATOS } from "./pruebas/fixturesPlan.ts";

const A = SIN_APP ? null : app([...NOMBRES_DATOS, "_planPzasApCalc"], STUBS_MOTOR, HOY);

/** 30 aperturas con su kit (una o dos órdenes), algunas sin fecha, más pedidos de kit sin sucursal y resurtido. */
function escenario() {
  const r = rng(5), aperturas: any[] = [], pedidos: any[] = [], pedAper: any[] = [];
  for (let i = 0; i < 30; i++) {
    const id = "A" + String(i).padStart(2, "0"), fecha = i % 7 === 0 ? null : `2026-${String(1 + (i % 10)).padStart(2, "0")}-${String(1 + (i % 27)).padStart(2, "0")}`;
    aperturas.push({ id, estatus: i % 3 ? "activa" : "en_proceso", fecha });
    for (let k = 0; k < 1 + (i % 2); k++) {
      const items = [{ sku: "INS-VAS-001", cantidad: 50 + Math.round(r() * 100) }, { nombre: "Mermelada", cantidad: i === 4 ? 500 : Math.round(r() * 6) },
        { nombre: "Tapa", cantidad: r() < 0.3 ? 2 : 0 }, { sku: "ins-nue-005", cantidad: r() < 0.1 ? "x" : 1 }];
      const pid = `${id}-${k}`;
      pedidos.push({ id: pid, apertura_id: id, fecha_pedido: `2026-0${1 + (i % 9)}-15T18:00:00Z`, status: "enviado", items, items_editados: null,
        notas_shopify: k ? "Kit de apertura (2a parte)" : null });
      if (i % 4 === 0) pedAper.push({ pedido_id: pid });
    }
  }
  pedidos.push({ id: "suelto", apertura_id: null, fecha_pedido: "2026-10-01T18:00:00Z", status: "enviado", notas_shopify: "pedido de apertura", items: [{ sku: "INS-VAS-001", cantidad: 9 }] });
  pedidos.push({ id: "resurtido", apertura_id: "A01", fecha_pedido: "2026-11-01T18:00:00Z", status: "enviado", items: [{ sku: "INS-VAS-001", cantidad: 9 }] });
  return { pedidos, R: { aperturas: aperturasNorm(aperturas), pedAper, map: MAPA, cat: CAT } };
}

Deno.test({ name: "paridad: planPzasApCalc = _planPzasApCalc", ignore: SIN_APP }, () => {
  const { pedidos, R } = escenario();
  for (const c0 of [{}, { consumo: { items: "originales" }, aper: { gracia_dias: 0, vencida_max: 10 } }]) {
    for (const n of [3, 20, 200]) {
      const cfg = normalizarCfgMotor(c0);
      assertEquals(planPzasApCalc(pedidos, R, cfg, n), A._planPzasApCalc(pedidos, R, A._planCfgNormalizar(c0), n), `${JSON.stringify(c0)} n=${n}`);
    }
  }
});

Deno.test("piezas: tope de 3 veces la mediana, kits sin sucursal aparte y preselección", () => {
  const { pedidos, R } = escenario();
  const res = planPzasApCalc(pedidos, R, normalizarCfgMotor({}), 20);
  assertEquals(res.N, 20);
  assertEquals(res.sinAtribuir, 1);
  const mer = res.filas.find((f) => f.sku === "ALI-JAR-003")!;
  assert(mer.sug <= 3 * mer.mediana);
  const vaso = res.filas.find((f) => f.sku === "INS-VAS-001")!;
  assertEquals(preseleccionar(vaso), Math.abs(vaso.sug - 100) / 100 > 0.15);
  assertEquals(preseleccionar({ ...vaso, n: 2 }), false);
  assertEquals(preseleccionar({ ...vaso, actual: 0 }), true);
});
```

Crear `tests/portal/com-piezas.test.tsx`:

```tsx
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', refresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { aplicarPiezasApertura } from '../../app/(comercializadora)/comercializadora/acciones';
import { PiezasApertura } from '../../components/comercializadora/piezas-apertura';
import type { ResultadoPiezas } from '../../supabase/functions/_shared/planPiezas.ts';

const RES: ResultadoPiezas = {
  N: 20,
  totalAperturas: 31,
  sinAtribuir: 2,
  filas: [
    { sku: 'A', nombre: 'Vaso', actual: 0, n: 12, N: 20, mediana: 100, prom: 60, sug: 60, min: 50, max: 150 },
    {
      sku: 'B',
      nombre: 'Tapa',
      actual: 10,
      n: 9,
      N: 20,
      mediana: 11,
      prom: 10.5,
      sug: 10.5,
      min: 8,
      max: 14,
    },
    { sku: 'C', nombre: 'Popote', actual: 0, n: 2, N: 20, mediana: 3, prom: 0.3, sug: 0.3, min: 2, max: 4 },
  ],
};

describe('Sugerir piezas por apertura: pantalla', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    vi.stubGlobal('confirm', () => true);
  });

  it('marca solo las que tienen ≥ 3 aperturas y cambian > 15% (o no tienen nada capturado)', () => {
    render(<PiezasApertura res={RES} n={20} editable aviso={null} degradado={false} />);
    expect(screen.getByLabelText('Aplicar A')).toBeChecked();
    expect(screen.getByLabelText('Aplicar B')).not.toBeChecked(); // 10 → 10.5 es 5%
    expect(screen.getByLabelText('Aplicar C')).not.toBeChecked(); // pocos datos
    expect(screen.getByText(/2 pedido\(s\) de kit sin sucursal/)).toBeInTheDocument();
  });

  it('solo lectura: nada marcado ni botón de aplicar; avisos de puente y de aperturas', () => {
    render(
      <PiezasApertura res={RES} n={20} editable={false} aviso="No se pudieron leer los pedidos." degradado />,
    );
    expect(screen.getByLabelText('Aplicar A')).not.toBeChecked();
    expect(screen.queryByRole('button', { name: 'Aplicar los marcados' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('alert').map((a) => a.textContent)).toEqual([
      'No se pudieron leer los pedidos.',
      expect.stringContaining('No se pudieron leer las aperturas'),
    ]);
  });

  it('aplicar guarda lo marcado con el valor editado y refresca', async () => {
    const f = dbFalsa({
      com_catalogo: [
        { sku: 'A', cantidad_por_apertura: 0 },
        { sku: 'B', cantidad_por_apertura: 10 },
      ],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    render(<PiezasApertura res={RES} n={20} editable aviso={null} degradado={false} />);
    fireEvent.change(screen.getByLabelText('Sugerido de A'), { target: { value: '55' } });
    fireEvent.click(screen.getByRole('button', { name: 'Aplicar los marcados' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Guardadas: 1.'));
    expect(f.tablas.com_catalogo[0].cantidad_por_apertura).toBe(55);
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe('aplicarPiezasApertura', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
  });

  it('update condicional al valor que se vio, con historial; si cambió, no lo pisa', async () => {
    const f = dbFalsa({
      com_catalogo: [
        { sku: 'A', cantidad_por_apertura: 0 },
        { sku: 'B', cantidad_por_apertura: 12 },
      ],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    const r = await aplicarPiezasApertura([
      { sku: 'A', valor: '60,456', antes: 0 },
      { sku: 'B', valor: '10.5', antes: 10 },
    ]);
    expect(r).toEqual({ ok: true, guardados: 1, fallas: [expect.stringContaining('B: el valor cambió')] });
    expect(f.tablas.com_catalogo.map((c) => c.cantidad_por_apertura)).toEqual([60.46, 12]);
    expect(f.tablas.com_plan_config_historial).toEqual([
      expect.objectContaining({
        ambito: 'sku',
        clave: 'A:cantidad_por_apertura',
        valor_anterior: 0,
        valor_nuevo: 60.46,
      }),
    ]);
  });

  it('sin filas válidas responde el error; solo lectura no toca la base', async () => {
    const f = dbFalsa({ com_catalogo: [{ sku: 'A', cantidad_por_apertura: 0 }] });
    m.db = f.db;
    expect(await aplicarPiezasApertura([{ sku: 'A', valor: '-1', antes: 0 }])).toEqual({
      error: 'No hay filas marcadas con un valor válido',
    });
    m.nivel = 'lectura';
    expect(await aplicarPiezasApertura([{ sku: 'A', valor: '5', antes: 0 }])).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(f.consultas).toEqual([]);
  });
});
```

- [ ] **Step 2: Correr y ver que fallan**

Run: `deno test --config supabase/functions/deno.json --allow-env --allow-read supabase/functions/_shared/planPiezas_parity_test.ts; npx vitest run tests/portal/com-piezas.test.tsx`
Expected: FAIL en las dos. `planPiezas.ts`, `piezas-apertura.tsx` y `aplicarPiezasApertura` no existen.

- [ ] **Step 3: Implementar**

Crear `supabase/functions/_shared/planPiezas.ts` (`_planPzasApCalc` 35334, más la regla de marcado de `_planPzasApCalcular` 35404):

```ts
// deno-lint-ignore-file no-explicit-any no-var prefer-const
// Port LITERAL de "Sugerir piezas por apertura" del sitio viejo (app/index.html a9e4a22, _planPzasApCalc 35334): para cada
// artículo, cuántas piezas pidió en promedio cada apertura reciente en su(s) pedido(s) de kit. planPiezas_parity_test.ts
// compara contra la app.
import { parseItems, planDatTipo, planEngMediana, type PedidoPlan } from "./planEngine.ts";

export interface FilaPiezas { sku: string; nombre: string; actual: number; n: number; N: number; mediana: number; prom: number; sug: number; min: number; max: number }
export interface ResultadoPiezas { filas: FilaPiezas[]; N: number; sinAtribuir: number; totalAperturas: number }

export function planPzasApCalc(
  pedidos: PedidoPlan[],
  R: { aperturas: { id: any; fecha: string | null; estatus: string | null }[]; pedAper: { pedido_id: any }[]; map: { shopify_nombre: string; sku: string }[]; cat: any[] },
  cfg: any,
  muestraN: number,
): ResultadoPiezas {
  var apById: Record<string, any> = {}; R.aperturas.forEach(function (a) { apById[a.id] = a; });
  var pedEnAper: Record<string, boolean> = {}; R.pedAper.forEach(function (p) { pedEnAper[p.pedido_id] = true; });
  var skuMap: Record<string, string> = {}; R.map.forEach(function (m) { skuMap[m.shopify_nombre] = m.sku; });
  var catSku: Record<string, string> = {}, catBy: Record<string, any> = {}; R.cat.forEach(function (c) { catSku[String(c.sku).trim().toUpperCase()] = c.sku; catBy[c.sku] = c; });
  var porAp: Record<string, any> = {}, sinAtribuir = 0;
  pedidos.forEach(function (ped) {
    if (planDatTipo(ped, apById, pedEnAper, cfg.aper.gracia_dias, cfg.aper.vencida_max) !== "apertura") return;
    var id = ped.apertura_id;
    if (!id || id === "000") { sinAtribuir++; return; } // pedido de kit sin sucursal vinculada: no se sabe de qué apertura es
    var f = String(ped.fecha_pedido || "").slice(0, 10);
    var ap = porAp[id] || (porAp[id] = { id: id, fecha: null, primera: f, uds: {} });
    if (f && (!ap.primera || f < ap.primera)) ap.primera = f;
    var orig = parseItems(ped.items);
    var its = cfg.consumo.items === "editados" && ped.items_editados ? parseItems(ped.items_editados) : orig, idxNom: Record<string, string> | null = null;
    its.forEach(function (it: any) {
      if (!it) return;
      var sku = it.sku || skuMap[it.nombre];
      if (!sku && it.nombre) {
        if (!idxNom) { idxNom = {}; orig.forEach(function (o: any) { if (o && o.sku && o.nombre) idxNom![o.nombre] = o.sku; }); }
        sku = idxNom![it.nombre];
      }
      var qty = Number(it.cantidad == null ? 0 : it.cantidad);
      if (!sku || !isFinite(qty) || qty <= 0) return;
      var real = catSku[String(sku).trim().toUpperCase()];
      if (!real) return;
      ap.uds[real] = (ap.uds[real] || 0) + qty;
    });
  });
  // Muestra: las N aperturas más recientes (por su fecha de apertura; si no tiene, por su primer pedido de kit)
  var lista = Object.keys(porAp).map(function (id) { var a = porAp[id], x = apById[id]; a.fecha = x && x.fecha ? String(x.fecha).slice(0, 10) : a.primera; return a; }).filter(function (a) { return Object.keys(a.uds).length > 0; });
  lista.sort(function (x, y) { return String(y.fecha || "").localeCompare(String(x.fecha || "")) || String(x.id).localeCompare(String(y.id)); });
  var muestra = lista.slice(0, Math.max(1, muestraN || 20)), N = muestra.length, porSku: Record<string, number[]> = {};
  muestra.forEach(function (a) { Object.keys(a.uds).forEach(function (s) { (porSku[s] || (porSku[s] = [])).push(a.uds[s]); }); });
  var filas = Object.keys(porSku).map(function (s) {
    var v = porSku[s], n = v.length, sum = v.reduce(function (t, x) { return t + x; }, 0), med = planEngMediana(v);
    // Esperado por apertura = promedio sobre TODAS las aperturas de la muestra (las que no lo piden cuentan como 0), con tope de
    // 3 veces la mediana de las que sí lo piden para que una apertura atípica no infle el kit.
    var prom = N > 0 ? sum / N : 0, sug = Math.min(prom, 3 * med), c = catBy[s];
    return { sku: s, nombre: c ? c.nombre : s, actual: c ? Number(c.cantidad_por_apertura || 0) : 0, n: n, N: N, mediana: med, prom: prom, sug: Math.round(sug * 100) / 100,
      min: Math.min.apply(null, v), max: Math.max.apply(null, v) };
  });
  var prio = function (f: FilaPiezas) { return (f.n >= 3 ? 0 : 1000) + (f.actual === 0 ? 0 : 500) - f.n; };
  filas.sort(function (a, b) { return prio(a) - prio(b) || a.nombre.localeCompare(b.nombre); });
  return { filas: filas, N: N, sinAtribuir: sinAtribuir, totalAperturas: lista.length };
}

/** Se marcan las que tienen al menos 3 aperturas y cambian más de 15% frente a lo capturado (o no hay nada capturado). */
export function preseleccionar(f: FilaPiezas): boolean {
  return f.n >= 3 && (f.actual === 0 || Math.abs(f.sug - f.actual) / Math.max(f.actual, 1e-9) > 0.15);
}
```

Crear `lib/comercializadora/piezas.ts`:

```ts
// "Sugerir piezas por apertura" (plan 3d): el cálculo es el port con paridad de supabase/functions/_shared/planPiezas.ts.
export {
  planPzasApCalc,
  preseleccionar,
  type FilaPiezas,
  type ResultadoPiezas,
} from '../../supabase/functions/_shared/planPiezas.ts';
```

Agregar al final de `app/(comercializadora)/comercializadora/acciones.ts` (`_planPzasApAplicar` 35430):

```ts
/**
 * _planPzasApAplicar: guarda las piezas por apertura marcadas. Cada artículo es un update condicional al valor que se vio
 * (si otra persona lo cambió mientras se revisaba, no se pisa) y deja su historial como el Catálogo.
 */
export async function aplicarPiezasApertura(
  cambios: { sku: string; valor: string; antes: number }[],
): Promise<Resultado<{ guardados: number; fallas: string[] }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const validos = cambios
      .map((c) => ({ ...c, v: Number(String(c.valor).trim().replace(',', '.')) }))
      .filter((c) => String(c.valor).trim() !== '' && Number.isFinite(c.v) && c.v >= 0)
      .map((c) => ({ ...c, v: Math.round(c.v * 100) / 100 }));
    if (!validos.length) return { error: 'No hay filas marcadas con un valor válido' };
    let guardados = 0;
    const fallas: string[] = [];
    for (const c of validos) {
      const r = await com(s.db)
        .from('com_catalogo')
        .update({ cantidad_por_apertura: c.v })
        .eq('sku', c.sku)
        .eq('cantidad_por_apertura', c.antes)
        .select('sku');
      if (r.error) {
        fallas.push(`${c.sku}: ${fallo(r.error).error}`);
        continue;
      }
      if (!r.data?.length) {
        fallas.push(
          `${c.sku}: el valor cambió mientras revisabas (o no tienes permiso); recarga y vuelve a revisar`,
        );
        continue;
      }
      await registrarHistorial(s.db, 'sku', `${c.sku}:cantidad_por_apertura`, c.antes, c.v);
      guardados++;
    }
    if (guardados) revalidatePath('/comercializadora', 'layout');
    return { ok: true, guardados, fallas };
  } catch (e) {
    return fallo(e);
  }
}
```

Crear `components/comercializadora/piezas-apertura.tsx`:

```tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { numero } from '@/lib/comercializadora/formato';
import { preseleccionar, type ResultadoPiezas } from '@/lib/comercializadora/piezas';
import { aplicarPiezasApertura } from '@/app/(comercializadora)/comercializadora/acciones';

const dos = (x: number) => numero(Math.round(x * 100) / 100);

/** "Sugerir piezas por apertura" (_planPzasApCalcular/_planPzasApAplicar): solo sugiere; nada se guarda sin Aplicar. */
export function PiezasApertura(p: {
  res: ResultadoPiezas;
  n: number;
  editable: boolean;
  aviso: string | null;
  degradado: boolean;
}) {
  const router = useRouter();
  const [marcados, setMarcados] = useState<Set<string>>(
    () => new Set(p.editable ? p.res.filas.filter(preseleccionar).map((f) => f.sku) : []),
  );
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(p.res.filas.map((f) => [f.sku, String(f.sug)])),
  );
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  const marcar = (sku: string, si: boolean) =>
    setMarcados((m) => {
      const n = new Set(m);
      if (si) n.add(sku);
      else n.delete(sku);
      return n;
    });
  const aplicar = () => {
    const cambios = p.res.filas
      .filter((f) => marcados.has(f.sku))
      .map((f) => ({ sku: f.sku, valor: valores[f.sku] ?? '', antes: f.actual }));
    if (!cambios.length) return setMsg({ ok: false, t: 'No hay filas marcadas' });
    if (!confirm(`Se guardarán las piezas por apertura de ${cambios.length} artículo(s). ¿Continuar?`))
      return;
    iniciar(async () => {
      const r = await aplicarPiezasApertura(cambios);
      if ('error' in r) return setMsg({ ok: false, t: r.error });
      setMsg({
        ok: !r.fallas.length,
        t:
          `Guardadas: ${r.guardados}.` +
          (r.fallas.length ? ` No se guardaron ${r.fallas.length}: ${r.fallas.join(' · ')}` : ''),
      });
      router.refresh();
    });
  };

  return (
    <div className="space-y-4">
      {p.aviso ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {p.aviso}
        </p>
      ) : null}
      {p.degradado ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          <b>No se pudieron leer las aperturas o los pedidos de apertura</b>: las sugerencias pueden salir con
          una muestra distinta o incompleta. Revísalas con cuidado antes de aplicar.
        </p>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Calculado con los <b>pedidos de apertura (kits)</b> de las {p.res.N} aperturas más recientes (de{' '}
        {p.res.totalAperturas} con kit registrado). <b>Sugerido</b> = lo que pidió en promedio cada apertura
        (las que no lo piden cuentan como 0), con tope de 3 veces la mediana de las que sí lo piden. El plan
        lo multiplica por las aperturas que vienen. <b>No se guarda nada hasta que pulses Aplicar</b>; los
        marcados son los que tienen al menos 3 aperturas y cambian más de 15% frente a lo capturado.
        {p.res.sinAtribuir ? (
          <span className="text-warn">
            {' '}
            {p.res.sinAtribuir} pedido(s) de kit sin sucursal vinculada no se pudieron atribuir a una
            apertura.
          </span>
        ) : null}
      </p>
      <form className="flex flex-wrap items-center gap-2 text-sm">
        <label htmlFor="n-aperturas">Aperturas recientes a considerar</label>
        <input
          id="n-aperturas"
          name="n"
          type="number"
          min={3}
          max={200}
          defaultValue={p.n}
          className={`${claseCampo} w-20`}
        />
        <button type="submit" className="font-semibold underline">
          Recalcular
        </button>
        {p.editable ? null : (
          <span className="text-warn">Tu acceso es de solo lectura: puedes ver las sugerencias.</span>
        )}
      </form>
      {msg ? (
        <p role={msg.ok ? 'status' : 'alert'} className={`text-sm ${msg.ok ? '' : 'text-bad'}`}>
          {msg.t}
        </p>
      ) : null}
      {!p.res.filas.length ? (
        <Vacio titulo="No hay pedidos de apertura con artículos del catálogo en el historial" />
      ) : (
        <div className="placa overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th />
                <th>Artículo</th>
                <th className="text-right">Capturado hoy</th>
                <th className="text-right">Lo piden</th>
                <th className="text-right">Mediana (mín–máx)</th>
                <th className="text-right">Promedio</th>
                <th className="text-right">Sugerido</th>
              </tr>
            </thead>
            <tbody>
              {p.res.filas.map((f) => (
                <tr key={f.sku}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`Aplicar ${f.sku}`}
                      checked={marcados.has(f.sku)}
                      disabled={!p.editable}
                      onChange={(e) => marcar(f.sku, e.target.checked)}
                    />
                  </td>
                  <td>
                    <b>{f.nombre}</b>
                    <span className="block font-mono text-xs text-muted-foreground">{f.sku}</span>
                  </td>
                  <td className={`text-right tabular-nums ${f.actual === 0 ? 'text-muted-foreground' : ''}`}>
                    {f.actual === 0 ? 'sin capturar' : dos(f.actual)}
                  </td>
                  <td className="text-right tabular-nums">
                    {f.n} de {f.N}
                    {f.n < 3 ? <span className="block text-xs text-warn">pocos</span> : null}
                  </td>
                  <td className="text-right tabular-nums">
                    {dos(f.mediana)}{' '}
                    <span className="text-xs text-muted-foreground">
                      ({dos(f.min)}–{dos(f.max)})
                    </span>
                  </td>
                  <td className="text-right tabular-nums">{dos(f.prom)}</td>
                  <td className="text-right">
                    <input
                      aria-label={`Sugerido de ${f.sku}`}
                      inputMode="decimal"
                      className={`${claseCampo} w-24 text-right`}
                      value={valores[f.sku]}
                      disabled={!p.editable}
                      onChange={(e) => setValores({ ...valores, [f.sku]: e.target.value })}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {p.editable && p.res.filas.length ? (
        <button
          type="button"
          disabled={pendiente}
          onClick={aplicar}
          className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
        >
          {pendiente ? 'Guardando…' : 'Aplicar los marcados'}
        </button>
      ) : null}
    </div>
  );
}
```

Crear `app/(comercializadora)/comercializadora/catalogo/piezas-apertura/page.tsx`:

```tsx
import { Encabezado } from '@/components/portal/piezas';
import { PiezasApertura } from '@/components/comercializadora/piezas-apertura';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { com, leerTodoCom } from '@/lib/comercializadora/consultas';
import { aperturasPlanLegado, pedidosAperturaLegado, pedidosPlanLegado } from '@/lib/comercializadora/legado';
import { normalizarAperturas } from '@/lib/comercializadora/motor';
import { normalizarCfgMotor } from '@/lib/comercializadora/indicadores';
import { planPzasApCalc } from '@/lib/comercializadora/piezas';

export default async function PiezasAperturaPagina({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const n = Math.max(3, Math.min(200, Math.round(Number(sp.n)) || 20));
  const [cat, map, cfg, pedidos, aperturas, pedAper] = await Promise.all([
    leerTodoCom<{ sku: string; nombre: string | null; cantidad_por_apertura: number | null }>(
      db,
      'com_catalogo',
      'sku,nombre,cantidad_por_apertura',
      'sku',
      (q) => q.neq('estatus', 'Inactivo'),
    ),
    leerTodoCom<{ shopify_nombre: string; sku: string }>(
      db,
      'com_sku_mapping',
      'shopify_nombre,sku',
      'shopify_nombre',
    ),
    com(db).from('com_plan_config').select('config').eq('id', 1).maybeSingle(),
    // Todo el historial (no solo la ventana): los kits de las aperturas más recientes pueden ser de hace meses.
    pedidosPlanLegado(),
    aperturasPlanLegado(),
    pedidosAperturaLegado(),
  ]);
  const res = planPzasApCalc(
    pedidos.ok ? pedidos.datos : [],
    {
      aperturas: normalizarAperturas(aperturas.ok ? aperturas.datos : []),
      pedAper: pedAper.ok ? pedAper.datos : [],
      map,
      cat,
    },
    normalizarCfgMotor(cfg.data?.config ?? null),
    n,
  );
  return (
    <>
      <Encabezado
        area="Comercializadora"
        titulo="Sugerir piezas por apertura"
        descripcion="Cuántas piezas pidió cada apertura reciente en su kit. El plan reserva ese número por cada apertura que viene."
        migas={[{ href: '/comercializadora/catalogo', nombre: 'Catálogo' }]}
      />
      <PiezasApertura
        res={res}
        n={n}
        editable={puedeEditarCom(accesos)}
        aviso={pedidos.ok ? null : pedidos.error}
        degradado={!aperturas.ok || !pedAper.ok || (aperturas.ok && !aperturas.datos.length)}
      />
    </>
  );
}
```

En `app/(comercializadora)/comercializadora/catalogo/page.tsx`:
- agregar `import Link from 'next/link';`;
- cambiar el `<Encabezado … />` autocerrado por:

```tsx
      <Encabezado
        area="Comercializadora"
        titulo="Catálogo"
        descripcion="Datos de compra de cada artículo. El costo, el proveedor y el estatus vienen de Zoho."
      >
        <Link href="/comercializadora/catalogo/piezas-apertura" className="text-sm font-semibold underline">
          Sugerir piezas por apertura
        </Link>
      </Encabezado>
```

- [ ] **Step 4: Correr y ver que pasan**

Run: el comando del Step 2, y luego `npm run typecheck`.
Expected: PASS (2) y PASS (5).

- [ ] **Step 5: Commit**

```bash
git add supabase/functions/_shared/planPiezas.ts supabase/functions/_shared/planPiezas_parity_test.ts lib/comercializadora/piezas.ts components/comercializadora/piezas-apertura.tsx "app/(comercializadora)/comercializadora/catalogo" "app/(comercializadora)/comercializadora/acciones.ts" tests/portal/com-piezas.test.tsx
git commit -m "feat(comercializadora): sugerir piezas por apertura desde Catálogo"
```

---

### Task 9: Suite, build, revisión en el navegador, guía y PR

- [ ] **Step 1: Suite completa**

Run: `npm test && npm run typecheck && npx prettier --check "app/(comercializadora)" components/comercializadora lib/comercializadora "tests/portal/com-*" components/portal/navegacion.tsx`
Expected: todo verde, salvo la falla previa conocida `tests/migracion/paridad.test.ts` (Rappi).

Run: `npm run test:funciones`
Expected: 241 passed + 14 ignored (las de paridad, sin el HTML viejo).

Run: `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones`
Expected: 255 passed, 0 ignored. **Esta corrida es la que prueba la paridad.**

Luego: `npx next build`. Expected: build correcto, con 17 rutas de comercializadora (las 14 de antes, más `doh`, `indicadores` y `catalogo/piezas-apertura`).

- [ ] **Step 2: Sin migración**

Este plan no agrega migraciones ni toca bliocjvq. Confirmar con `git diff feat/comercializadora-operacion --stat -- supabase/migrations` (vacío).

- [ ] **Step 3: Recorrido en el navegador (solo ver)**

Escritorio y 375 px, sin guardar nada en producción:
1. **DOH:** abrir el DOH del sitio viejo el mismo día y comparar los seis conteos y una docena de artículos (alcanza, LT, OC en camino, estado y motivo). Diferencias esperadas:
   - borradores reales de Zoho que ahora no cuentan como en camino (decisión 6);
   - un aviso de "kits" (decisión 9);
   - datos leídos en otro momento (caché de 10 min).

   Cualquier otra diferencia se investiga antes de seguir.
2. **Indicadores:** comparar las siete tarjetas con Compras > Indicadores del viejo. Abrir cada detalle, una traza desde "Donde más se aleja" y la comparación de ventanas. Abrir "Editar metas" y cerrarlo **sin guardar**.
3. **Inicio:** el panel "Riesgo de quiebre" coincide con los conteos del DOH, y "Ver en DOH" abre el DOH filtrado en "Pedir ya".
4. **Catálogo → Sugerir piezas por apertura:** comparar la tabla con el cuadro del viejo (misma muestra, 20). Cambiar la muestra a 30 con "Recalcular". **No pulsar Aplicar.**
5. Consola sin errores de la app, y sin desbordamiento horizontal a 375 px. Pulsar "Actualizar" en Indicadores: vuelve a leer y la página se ve igual.

- [ ] **Step 4: Guía y PR**

Agregar a `docs/migracion/comercializadora.md`:

```markdown
## 11. Motor, DOH e Indicadores (plan 3d)

- El motor de planeación del sitio viejo (`_planEngSku`, `_planDatAMotor`, `_planBuild`, `_kpiAbCalc`, `_planPzasApCalc`) está portado en `supabase/functions/_shared/plan{Motor,Datos,Build,Kpi,Piezas}.ts`. Las pruebas de paridad se corren con el HTML viejo:
  `git -C <repo viejo> show a9e4a22:app/index.html > "$TEMP/app-vieja-a9e4a22.html"` y luego `COM_APP_VIEJA="$TEMP/app-vieja-a9e4a22.html" npm run test:funciones` (sin la variable, se ignoran).
- DOH, Indicadores, el riesgo de quiebre de Inicio y Piezas por apertura se calculan en el servidor del portal. Los datos crudos se guardan 10 minutos en memoria, compartidos entre usuarios; "Actualizar" los vuelve a leer. Leen los pedidos por el puente con `SUPABASE_SECRET_KEY`.
- Como en el viejo, DOH e Indicadores usan el cálculo local (no la simulación de `com-minmax`) y el lead time de `com_lead_times`. **Diferencia conocida con Qué pedir:** `com-minmax` usa primero `zoho_lead_time`.
- Un borrador de OC (en la carga de Zoho de la configuración o con `status = 'draft'` en `com_zoho_oc_lineas`) nunca cuenta como en camino. Ya no se usa la copia fija de OCs del 13-oct del sitio viejo.
- Las metas de Indicadores se guardan en `com_plan_config.config.kpi` con historial (`kpi.<meta>`). Mientras el viejo siga en Real, no se editan desde el portal.
- Piezas por apertura: Catálogo → "Sugerir piezas por apertura". Aplicar guarda solo lo marcado y deja historial por artículo.
```

Commit:

```bash
git add docs/migracion/comercializadora.md
git commit -m "docs(comercializadora): guía del motor, DOH e Indicadores"
```

Push de `feat/comercializadora-motor` y PR con base `feat/comercializadora-operacion` (encima del #115). En la descripción van:
- las decisiones 6, 7, 9, 10 y 12;
- las dos preguntas que contestó el usuario (lead time como el viejo; "OCs al día con Zoho" con la frescura de `zoho-sync`);
- el resultado de la corrida con `COM_APP_VIEJA`.

---

## Self-review (hecho al escribir)

- **Cobertura del bloque 3d, tras las decisiones 1 a 3:**
  - Motor del navegador en el servidor: Tareas 1 (`_planEngSku`, aperturas, `_planEngine`), 2 (`_planDatAMotor`, OCs, borradores, configuración), 3 (`_planBuild`, backtest, simulación del servidor) y 4 (`_planDatCargar` con caché, como `_planAsegurar`).
  - DOH: Tareas 5 (riesgo) y 6 (pantalla, filtro inicial, Inicio).
  - Indicadores: Tareas 5 (cuentas) y 7 (pantalla, detalle, traza, ventanas, metas, Actualizar).
  - Piezas por apertura: Tarea 8.
  - Fuera, y a dónde va: proveedores, mínimos y consolidación del Plan (3f); Importaciones y Café (3e); KPIs de pedidos y Crédito (Pedidos).
- **El código de las tareas se probó antes de escribir el plan**, en una copia del repo en el punto de `feat/comercializadora-operacion`:
  - Deno: 241 passed + 14 ignored sin el HTML viejo, y 255 passed con `COM_APP_VIEJA`;
  - Vitest: las cuatro pruebas nuevas verdes, y la suite completa igual que antes (solo la falla conocida de Rappi);
  - `tsc --noEmit` y prettier limpios.

  Lo que no se probó allá: `next build` (la copia usaba un enlace a `node_modules` que Turbopack rechaza), así que va en la Tarea 9. Las pantallas importan `_shared` por `lib/` con rutas relativas `.ts`, como `config.ts`, que ya compila en el build.
- **Sin marcadores pendientes.** Las preguntas abiertas son de producto, no de código: decisiones 7 y 12. El plan sigue al viejo mientras el usuario no diga otra cosa.
- **Tipos consistentes:**
  - `DatosPlan`, `LineaBorrador` y `Servidor` (Tarea 2) los usan las Tareas 3, 4, 5 y 8.
  - `Plan`/`planBuild` (Tarea 3) los usa la Tarea 5.
  - `FilaRiesgo`/`EstadoRiesgo`/`CheckDatos`/`Traza` (Tarea 5) los usan las Tareas 6 y 7.
  - `Motor`/`MotorListo`/`memoMotor`/`indicadoresMotor` (Tareas 4 y 6) los usan las Tareas 6 y 7.
  - `normalizarAperturas` (Tarea 4) lo usa la Tarea 8.
  - `KPI_AB_CAMPOS` y `KPI_AB_DEF` (Tarea 2) los reexporta la Tarea 7.
  - `editorCom`, `fallo`, `SOLO_LECTURA`, `Resultado` y `registrarHistorial` son de `acciones.ts`.
- **Review Focus → pruebas:**
  1. Puente caído: Tarea 4 ("sin puente o sin llave"), Tarea 6 (Inicio con `riesgo={null}`), Tarea 8 (aviso).
  2. Artículo nuevo o sin historia: Tarea 1 (series "nuevo" con vida 9, 0 y `null`), Tarea 5 ("artículo nuevo").
  3. OC sin fecha, vieja o en borrador: Tarea 2 ("decisión 6", "el fixture ejercita OCs viejas"), Tarea 5 ("borradores"), Tarea 7 (fixture "B confirmar").
  4. Medianoche: Tarea 4 ("cambiar el día de CDMX"), Tarea 2 (pedidos a toda hora, paridad).
  5. Otra persona guarda: Tarea 4 ("más historia"), Tarea 7 ("otra persona guardó antes"), Tarea 8 ("si cambió, no lo pisa").
