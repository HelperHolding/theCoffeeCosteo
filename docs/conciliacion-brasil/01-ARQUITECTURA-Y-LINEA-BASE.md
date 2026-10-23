# 01 · Arquitectura actual y línea base

**Fase 1 — solo lectura.** Fecha del análisis: 2026-10-23.

| Dato | Valor |
|---|---|
| Repo canónico | `sebascm0906/theCoffeeCosteo` (único remoto `origin`) |
| Commit analizado | `b7416e1` (`origin/main`, merge del PR #17). Mismo árbol que `1a7464f`, la rama local `feat/letrero-modo-noche` |
| Producción | Despliegue de Vercel `b7416e1`, 2026-10-23 18:20 UTC, estado `success` (GitHub Deployments) |
| Árbol local | Limpio salvo `.claude/` (ajeno, conservado). La rama local `main` está atrasada respecto a `origin/main`; no se tocó |
| Ramas | 16 locales y 18 remotas. Todas las `feat/*` y `fix/*` revisadas ya están mergeadas (PRs #10–#17). `origin/rediseno-ui` es la única remota sin rama local; no se evaluó su contenido |

No hay otra copia del repo ni otro proyecto en el remoto. No se crearon ni consolidaron repos.

## 1. Qué se pudo medir y qué no

| Medición | Estado | Detalle |
|---|---|---|
| Typecheck (`tsc --noEmit`) | ✅ | Sin errores, 3 s |
| Pruebas (`vitest run`) | ⚠️ 329 ✅ / 1 ❌ / 5 omitidas, 50 s | Detalle abajo |
| Build de producción (`next build`) | ✅ 20 s | 33 rutas, todas dinámicas salvo 2. Tamaños de bundle en §6 |
| Latencia y volumen de la API Brasil | Reutilizado de docs/sucursales 02, 08, 10 y 11 (medido el 2026-10-21/22) | No se hicieron llamadas nuevas a la API en esta fase |
| Supabase: EXPLAIN, `pg_stat_statements`, advisors, filas reales | ❌ Sin acceso | No hay CLI de Supabase ni MCP de Supabase en esta sesión. `DATABASE_URL` vive en `.env.local`, que por regla no se lee |
| Vercel: región de funciones, duración, logs, arranques en frío | ❌ Sin acceso | No hay CLI de Vercel ni `vercel.json`. El despliegue responde `302` (protección de despliegue); el PoP de borde es `cle1`, que **no** indica la región de la función |
| Latencia producción por ruta (p50/p95) | ❌ | No hay telemetría accesible. Las cifras de docs/10 son muestras locales, no percentiles |

### Pruebas que fallan (no son regresiones de producto)

- `tests/portal/sucursales-ui.test.tsx > Pedidos > pagina de 25 en 25…` espera `desde=2026-10-22`, pero lee el reloj real (hoy es 23). **La prueba depende de la fecha del sistema**: `vi.useFakeTimers` solo falsea `setInterval` (`:153`). Pasó ayer y fallará cada día.
- `tests/migracion/paridad.test.ts` exige el Excel original en `datos/Modelo_Costeo_Corregido_2026.xlsx`, que no está en el checkout. Es esperado.

## 2. Mapa de módulos

```
proxy.ts                     refresca sesión (getClaims) y pone no-store; no autoriza
app/(auth)                   login, establecer contraseña
app/(inicio)                 tarjetas de módulos
app/(portal)/…               COSTEO: costeo, resumen, productos, subrecetas, insumos, configuración
app/(crm)/crm/…              CRM
app/(sucursales)/sucursales  SUCURSALES (directorio y detalle)
app/api/sucursales/[id]/*    vivo · productos · pedidos · tendencias (JSON)
app/api/chat, /mcp           asistente y MCP de solo lectura (comparten consultas)
lib/portal/*                 dominio de Costeo + registro de módulos y permisos
lib/crm/*                    dominio CRM
lib/sucursales/*             adaptador Brasil + métricas
lib/supabase/*               clientes (servidor, navegador), tipos generados, sesión
supabase/migrations          20 migraciones versionadas (01–20)
scripts/                     migración Excel, exploración y medición de Sucursales, Zoho
tests/                       vitest + PGlite (db), jsdom (portal), migración, zoho
```

**Registro de módulos:** `lib/portal/modulos.ts`. Costeo está abierto a todo perfil activo. CRM y Sucursales requieren una fila en `perfil_modulos`, y Sucursales además en `perfil_sucursales`.

**Sesión y permisos:** `lib/supabase/sesion.ts`.
- `sesion(area)` usa `getUser`, revisa que el perfil esté activo y luego el rol, memoizado por request con `cache` de React.
- Las áreas se mapean a roles en `lib/portal/permisos.ts:3-10` (insumos→compras, recetas→operaciones, precios y configuración→finanzas, admin todo), espejo de la RLS de la migración 06.

**Frontera cliente/servidor:**
- `lib/supabase/servidor.ts` es `server-only` con clave publicable y cookies del usuario.
- El cliente de navegador solo se usa para subir archivos del CRM (`components/crm/expediente/documentos.tsx:50`).
- **No hay `service_role` ni secret key en `app/`, `lib/` ni `components/`.** Solo en scripts CLI (`scripts/zoho/archivos.ts`).
- `THECOFFEE_API_TOKEN` solo se lee en `lib/sucursales/proveedor.ts:84` y sale únicamente en el header `Authorization`.

## 3. Costeo y Supabase

### Esquema (32 tablas, 4 vistas, ~27 funciones, ~147 políticas, 39 índices explícitos)

Conteo hecho a mano sobre las migraciones; aproximado.

| Entidad | Tabla | Clave | Campos de nombre, precio y costo | Notas |
|---|---|---|---|---|
| Producto y subreceta | `recetas` | uuid | `nombre` **único global** (case-sensitive), `tipo`, `categoria_id`, `rendimiento`, `unidad_rendimiento`, `version` | Productos y subrecetas comparten tabla y unicidad de nombre |
| Tamaño vendido + precio | `producto_tamanos` | (producto, tamaño) | `precio_lista` (con IVA, nullable) | FK a recetas **ON DELETE CASCADE**. Sin timestamps |
| Precio manual por canal | `precio_canal_manual` | (producto, tamaño, canal) | `precio`, `nota` | Solo canales `castigado` (Rappi). CASCADE desde producto_tamanos |
| Líneas de receta | `receta_lineas` → `linea_cantidades` | uuid / único (línea, tamaño) | `cantidad` | XOR insumo/subreceta; control de ciclos |
| Insumos | `insumos` | uuid | `nombre` único, `costo_paquete`, `presentacion`, `unidad` (gr/ml/pza), `costo_unitario` generado | Sin DELETE (se desactiva) |
| Catálogos | `tamanos` (Único, Chica, Grande), `canales` (Mostrador, Rappi, App propia), `categorias_*`, `proveedores`, `parametros` | | | |
| Auditoría | `bitacora` | bigint | `campo`, `valor_anterior`, `valor_nuevo` (texto), `usuario_id`, `fecha`, `origen` | Una fila por campo cambiado, por trigger en 12 tablas |
| CRM | 13 `crm_*` + `crm_historial` | | | Fuera de alcance de la conciliación |
| Accesos | `perfiles`, `perfil_modulos`, `perfil_sucursales` (`company_id` = id de la API Brasil) | | | |

**Cálculo (todo en Postgres):**
- `v_costo_subreceta` y `v_costo_producto` (migración 03) expanden recursivamente las subrecetas.
- `v_resumen` (versión final en la migración 12) cruza producto × tamaño × canal × parámetros: precio de canal (manual o fórmula «castigado»), venta neta, food cost, margen y comisión con IVA.
- `v_alerta_producto_canal` (07) da la alerta prioritaria.
- La escritura de recetas va por la RPC `guardar_receta(jsonb)` (08), con bloqueo optimista por `version`.

### Hallazgos de identidad (críticos para la fase 2)

1. **No existe ningún código externo en Costeo.** Ninguna tabla guarda `defaultCode`, SKU ni ID del POS. La única llave externa en la BD es `perfil_sucursales.company_id`. Hoy no hay forma estable de relacionar una receta con un producto de Brasil.
2. **La migración desde Excel relacionó todo por nombre:** insumos por `clave()` en mayúsculas sin espacios, productos por nombre exacto (`scripts/migracion/plan-carga.ts:68-70`). Los UUID son nuevos. No hay tabla de alias.
3. **Los tamaños no coinciden entre fuentes:**

   | Fuente | Tamaños |
   |---|---|
   | Costeo | Chica / Grande / Único |
   | API | `Regular - 440ml`, `Large - 600ml` como *customs* con el mismo `defaultCode` `TRADICAPP` |
   | Recetario oficial 2026 | Regular (240 o 440 ml) / Grande (360 o 600 ml), según bebida caliente o fría |

   La correspondencia Chica↔Regular es probable, pero no está demostrada. El tamaño **no** es un producto distinto en la API: viaja como personalización.
4. **El historial de precios y costos solo existe en `bitacora`** (texto, por campo). No hay vigencias por fecha. Un cambio de nombre o de precio por conciliación queda auditado si se hace con `origen` distinto de `migracion`, que hoy silencia la bitácora.
5. **Renombrar es delicado:** `recetas.nombre` es único entre productos **y** subrecetas, y la búsqueda distingue mayúsculas en la BD. Un nombre oficial que choque con una subreceta existente fallaría. Las FK con CASCADE desde `recetas` hacen que borrar y recrear un producto para renombrarlo arrastre precios y líneas; está prohibido por el plan.

### Patrones de consulta

- **`todas()`** (`lib/portal/consultas.ts:11-23`) hace `select('*')` en páginas de 500 hasta traer **la tabla o vista completa**. Es el patrón dominante.
- **Cada página del portal** carga todas las `recetas` para la búsqueda global (`app/(portal)/layout.tsx:8`).
- **La ficha de producto** (`components/recetas/ficha.tsx:26-35`) es el caso más claro de sobrecarga:
  - todo `v_resumen`, todo `precio_canal_manual` y **todos los `perfiles`**, para quedarse con un producto;
  - además de `cargarEditor`, que trae 8 fuentes completas (`lib/portal/recetas.ts:5-15`).
- `v_resumen` completo se pide en 5 componentes de servidor. Costeo y Resumen piden el mismo trío (`v_resumen`, `v_alerta`, `canales`).
- Búsqueda, filtro y paginación de Catálogo, Resumen e Insumos ocurren en el navegador, sin normalizar acentos.
- Chat y MCP comparten `crearConsultas` (`lib/mcp/herramientas.ts`) con columnas explícitas y `range` ≤ 50. La excepción es `recetas_por_insumo`, que trae todas las líneas y recetas.
- **RLS:** las políticas de Costeo llaman `rol_actual()` y `tiene_rol()` sin envolver en `(select …)`. La migración 18 sí lo hizo para el CRM.

**Escala real:** 154 productos migrados y del orden de cientos a pocos miles de filas en `v_resumen`. Con este volumen, estas cargas completas probablemente cuestan decenas o cientos de ms, no segundos, pero **no se midió**. Son riesgos de crecimiento, no problemas observados.

### Hardcodes con impacto

- Los nombres de canal `'Mostrador'`, `'App propia'` y `'Rappi'` están escritos en `lib/portal/canales.ts:5-7`, `tablero.ts`, `calculadora/page.tsx:24` y `lista.tsx:46`. Renombrar un canal en la BD rompería la fusión Mostrador + App.
- `lib/portal/vistas.ts:7` fija un `user_id` para una columna visible. Está documentado y es intencional.

## 4. Integración con la API de Brasil (Sucursales)

```
GET /order/company/{id}?dateStart&dateEnd&perPage=500&page=N        (proveedor.ts:216)
  └ recorrer(): secuencial hasta totalPages, dedup por id, valida companyId,
     detecta totalItems cambiante y reintenta una vez; presupuesto 25 s, 10 s por request,
     2 reintentos con backoff/Retry-After, semáforo de 4 por proceso
  └ normalizar.ts (zod): codigo = defaultCode || productName; nombre = productName;
     customs anidados; ventaCent = grossAmount; netoCent = netAmout; origen:
     RAPPI → rappi; fromSmartphone true → app; false → mostrador; null → desconocido
  └ metricas.ts: resumen, productos, personalizaciones, pagos, orígenes, conciliar, tendencias
  └ datos.ts: identidad (catálogo lookerStoreId, 6 h) + CacheTtl(60) por proceso
     TTL: hoy 45 s · ≤3 días 10 min · cerrada 6 h · parcial/error 15 s
  └ app/api/sucursales/[companyId]/* → autorizar() antes de caché y proveedor; private, no-store
```

- **Sucursales habilitadas** (`lib/sucursales/config.ts:31-66`): 612 (Cd. Juárez, Looker 477), 583 (Bonampak, Looker 498) y 532 (Rubén Darío, Looker 455). Se conservan.
- **Origen por defecto:** `todos` = Mostrador + App + Rappi (decisión vigente de docs/11). **Matiz:** `todos` también incluye el origen `desconocido` (`fromSmartphone` nulo), sin etiqueta propia (`metricas.ts:19-21`).
- **La caché no incluye usuario en la llave.** Es correcto porque la autorización ocurre antes, pero cualquier ruta nueva debe respetar ese orden.

### Ranking de productos y «generic» (diagnóstico preliminar, sin datos nuevos)

- **En el código no hay ningún literal** `generic`, `genérico`, `generico` ni etiqueta de respaldo. La búsqueda sin distinguir mayúsculas solo encuentra «404 genérico» en comentarios.
- El ranking agrupa **solo por `codigo`** (`metricas.ts:123-136`). El nombre visible es el `productName` de la **línea más reciente** con ese código: los pedidos vienen ordenados de nuevo a viejo y se toma el primero que aparece.
- **Hipótesis principal** (por verificar en la fase 2): la etiqueta «Generic…» llega **literalmente del proveedor** en `productName`. Puede ser un producto de precio abierto o «comodín» del POS, o varios productos distintos que comparten un `defaultCode` y quedan rotulados con el nombre más reciente.
- **Hecho comprobado:** el proveedor reutiliza códigos con nombres distintos (`TRADICAPP` para «Regular - 440ml» y «Large - 600ml»). En customs no afecta porque se agrupan por nombre; en líneas padre fusionaría filas.
- Los customs se suman al importe del producto padre; no son filas del ranking. Reetiquetar no cambia el total, porque `participacion` se calcula sobre la suma de líneas más customs.

### Latencias registradas (muestras locales, no percentiles)

| Lectura | Frío | Caliente | Fuente |
|---|---|---|---|
| En vivo 612 / 583 | 2.4 s / 2.6 s | 0 ms | docs/10 |
| Tendencias 4 semanas, 612 | ~4 s | < 20 ms | docs/10 |
| **Tendencias 12 semanas, 612** (8,794 pedidos) | **12.3 s** | 12 ms | docs/10 |
| 1 página perPage 500 | 2.8 s | — | docs/02 |
| Productos 28 días (~3,000 pedidos, 6 páginas) | **no medido**; estimado 12–18 s secuencial | — | inferido de docs/02 |

Ninguna ruta declara `maxDuration`. El presupuesto interno de 25 s es el límite efectivo. Los límites de Vercel por plan (300 s por defecto con Fluid) no son el cuello; el riesgo es la espera del usuario.

### Lógica duplicada

| Duplicado | Dónde | Comentario |
|---|---|---|
| Lectura paginada del proveedor | `proveedor.ts`, `scripts/sucursales/explorar-api.ts`, `scripts/sucursales/conciliar.ts` | El último es independiente a propósito, para conciliar |
| Regex de tamaño (`\d{2,4} ml`) | `metricas.ts:91`, `components/sucursales/colores.tsx:47` | |
| Catálogo de métodos de pago | `metricas.ts:188`, `validar-sucursal.ts:52` | |
| `productos()` en el payload de vivo | `datos.ts:244` y dentro de `insightsVivo` | Se calcula dos veces |
| Comentarios y docs con «mostrador / app / sin dato» y «netAmout no sale del servidor» | `metricas.ts:217`, docs 07 y 08 | Desactualizados frente a docs/11 |

## 5. Recetario oficial 2026 (PDF entregado por Carlo)

- Es un manual de preparación con unas 70 fichas: preparados, puristas, fríos, refrescos, gelato y frappés, temporada, métodos y foods. Da **cantidades por tamaño**: Regular y Grande, con ml, g y vaso.
- **No contiene precios, costos, SKU ni `defaultCode`.** Por tanto **no es fuente** de precio ni de costo. Sí es fuente candidata de cantidades de receta y de nombres de bebida.
- **No es una fuente de nombres exactos sin revisión.** Tiene variantes internas: «Pumpkin» (índice) / «Pumkin» (fichas), «Maracuyá»/«Maracuya», «Gelatto» (índice) / «Gelato» (fichas).
- La API trae nombres comerciales distintos para algunas bebidas (p. ej. «Gelato Frappé Coffee», que coincide con la ficha, pero no con el índice).
- Se usa en la fase 2 como **tercera fuente** del cotejo, con su propia columna de evidencia. No reemplaza a la API ni al Excel.

## 6. Bundle cliente (build local, sin compresión → gzip)

| Chunk | Contenido identificado | Tamaño | Carga |
|---|---|---|---|
| `1lq9iwa…` | SheetJS (`xlsx`) | 480 KB → 159 KB | **Diferida**: `import('xlsx')` solo al exportar (`tabla-resumen.tsx:80`) ✅ |
| `2eywhk…` | `react-markdown`/micromark + `thinking-orbs` (asistente) | 370 KB → 106 KB | **En las 22 páginas con marco**, incluidas Sucursales, porque `components/portal/marco.tsx` importa `Agente` y `ThinkingOrb` de forma estática, aunque el panel esté cerrado |
| `1emd0at…` | Compartido del portal (no identificado) | 415 KB → 94 KB | Todas las páginas con marco |
| `2y5grad…` | react-dom | 229 KB → 72 KB | Base |

Total de `static/chunks`: 3.0 MB sin comprimir. **Oportunidad concreta:** cargar el asistente bajo demanda ahorraría unos 106 KB gzip en cada página. Antes de cambiarlo hay que medir el efecto con el analizador de Next.

## 7. Mapa de datos y autoridad por campo

| Campo | Dueño actual | Fuente oficial equivalente | Observación |
|---|---|---|---|
| Nombre de producto (catálogo) | Costeo `recetas.nombre` | API `items.productName`, solo como nombre **observado en pedidos**; recetario como referencia | Un nombre histórico de pedido no prueba el nombre vigente del catálogo. No hay endpoint de catálogo conocido |
| Código de producto | — (no existe) | API `items.defaultCode` | Reutilizado y a veces vacío: no es llave global confiable sin contexto |
| Tamaño | Costeo `tamanos` | API custom «Regular/Large - N ml»; recetario | Semántica de personalización, no de producto |
| Precio de lista Mostrador | `producto_tamanos.precio_lista` | API `items.amount` cobrado (después de descuento), por canal | Precio cobrado ≠ precio de catálogo. Solo es evidencia con `discount = 0`, mismo tamaño y canal mostrador, en una ventana de fechas |
| Precio Rappi | `precio_canal_manual` / fórmula | API pedidos `RAPPI` con `discount = 0` | Precios distintos a mostrador. Los combos cambian por fecha |
| Costo de insumo, rendimiento, receta | Costeo | **Sin fuente equivalente en la API** | Se conservan. El recetario solo aporta cantidades |
| Venta, cobrado, neto | No se persisten | API `grossAmount`, `netAmout` | `netAmout` y `percentageOfTransfer` no son comisión ni costo (docs/11) |
| Sucursal | `perfil_sucursales.company_id`, `config.ts` | API `/company/list/all` (`id`, `lookerStoreId`) | Identidad verificada por `lookerStoreId` en cada lectura |
