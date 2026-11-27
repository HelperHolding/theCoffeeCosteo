# Encargo: Tablero Guadalajara en Sucursales y accesos de Dioné y Claudia

> Prompt autosuficiente para Claude Code (chat de Sucursales). Preparado el 2026-11-27 en el chat de planeación.
> Es el **encargo 1 de 2**. El 2 es el Panel de admins (`docs/admin/PROMPT-PANEL-ADMINS.md`) y empieza cuando este
> esté cerrado.

## 1. Encargo y resultado

Portal The Coffee / Helper Holding (repo `HelperHolding/theCoffeeCosteo`, producción `portal.thecoffeemexico.com`).

**1. Tablero Guadalajara**
- Va en el módulo Sucursales, **debajo de «Tablero México»** en el menú lateral, con el nombre **«Tablero Guadalajara»**.
- Es como el Tablero México, pero solo con las 11 sucursales de Guadalajara.
- Tiene las **mismas secciones que cada sucursal**: Ventas, Costeo, Consumo y Nivel de servicio (la barra de pestañas
  de la sucursal).
- Lleva **un mapa del área metropolitana de Guadalajara** con la ubicación de cada sucursal, su venta y su consumo, y
  tableros significativos.
- Carlos: «el diseño es importante… apóyate de las skills».

**2. Accesos**
- **Dioné y Claudia:** su Directorio de Sucursales muestra **solo las sucursales de Guadalajara**.
- **Dioné y Claudia en Costeo:** pueden **editar cantidades y recetas, con acceso completo a lo que tiene que ver con
  productos**.
- **Tablero Guadalajara:** lo ve **todo usuario con el módulo Sucursales**, con **las 11 sucursales completas**,
  aunque no las tenga asignadas (decisión de Carlos, 2026-11-27).

## 2. Contrato de esta ejecución

**Autorizado ahora:**
- Plan, construcción en worktree propio, PRs y pruebas.
- Las migraciones necesarias: la última en `origin/main` es la **098**. Revisa también otros worktrees y PRs abiertos
  por si alguien ya tomó la 099.
- Cambiar las filas de acceso de Dioné y Claudia en producción: `perfil_sucursales`, su rol o lo que defina el plan
  para Costeo. Es una orden directa de Carlos. Antes de cambiar, guarda en el doc de resultado cómo estaban.

**Requiere OK de Carlos:**
- El plan (único checkpoint antes de construir).
- El merge a `main`. Pregúntalo en el plan; en este repo el merge aplica migraciones por la integración de Supabase.
- Cualquier cambio de acceso a otros usuarios.

**Conservar:**
- Tablero México, el Directorio, cada sucursal y sus cuatro secciones, y su RLS. Los demás usuarios no cambian de
  acceso, salvo que todos los que tienen Sucursales verán el Tablero Guadalajara.
- El `perfil_sucursales` de cada usuario sigue gobernando el Directorio, las páginas de sucursal y el Tablero México.
  **Solo el Tablero Guadalajara** abre las 11 de GDL a todo el módulo, y solo con datos agregados y por sucursal del
  tablero. No abre la página de detalle de una sucursal no asignada; decide en el plan si los enlaces del tablero
  llevan a ella solo cuando la tiene asignada.
- Hay WIP ajeno sin commitear en el checkout principal: no formatees ni reviertas en masa; Prettier solo en tus
  archivos.

**Fuera de alcance:** Panel de admins (encargo 2), otros tableros por ciudad (deja el componente listo para
reutilizarse, sin construirlos) y cambios a Rappi o n8n.

**Cierre:** PR mergeado (o abierto, si Carlos no autoriza el merge), accesos aplicados y verificados en producción,
`docs/sucursales/19-TABLERO-GUADALAJARA.md` con el resultado y reporte de §8.

### 2.1 Cómo trabajar en Claude Code

**Arranque**
- `git fetch` y worktree desde `origin/main` (`EnterWorktree` o
  `git worktree add ../theCoffeeCosteo-gdl -b feat/tablero-guadalajara origin/main`).
- **Plan Mode** para explorar y `ExitPlanMode` con el plan. Sin Plan Mode, presenta el plan y espera el OK.
- Lleva la lista de tareas. Escribe el doc de resultado mientras trabajas.

**Subagentes `Explore` en paralelo** (un solo mensaje, solo lectura):
1. **Tablero México:**
   - `app/(sucursales)/sucursales/mexico/page.tsx`, `components/sucursales/tablero-mexico.tsx` y su CSS;
   - `components/sucursales/mapa-mexico-trazos.ts` y `scripts/sucursales/trazos-mexico.ts` (cómo se generó el mapa
     SVG);
   - `app/api/sucursales/tablero/route.ts`, `lib/sucursales/tablero-fechas.ts` y las RPC
     `sucursales_tablero_hoy` y `sucursales_tablero_periodo`;
   - `docs/sucursales/16-TABLERO-MEXICO.md` y `tests/portal/tablero-mexico-calculo.test.tsx`.
   - Pregunta clave: cómo filtran las RPC por las sucursales del usuario.
2. **Secciones de la sucursal:** `app/(sucursales)/sucursales/[companyId]/page.tsx` y sus componentes de Ventas,
   Costeo, Consumo (`docs/sucursales/17-CONSUMO-NACIONAL.md`) y Nivel de servicio (Rappi). Qué se puede sumar por
   ciudad y qué es por sucursal.
3. **Accesos:**
   - `lib/supabase/sesion.ts`, `lib/portal/modulos.ts`, `lib/portal/roles.ts` (`ROLES_COSTEO`) y
     `lib/portal/permisos.ts` (áreas de Costeo: insumos→compras, recetas→operaciones, precios y configuración→finanzas,
     admin todo);
   - migraciones 13, 20 y 24 (`perfil_modulos`, `perfil_sucursales`, rol `sucursales`);
   - la RLS de Costeo por rol;
   - cómo están hoy Dioné (clarios@) y Claudia (dacuna@): perfil, rol, módulos y sucursales asignadas. Solo lectura.

**Skills.** Invócalas con `Skill` antes de su parte:
- `frontend-design` y `dataviz` (antes de la primera gráfica o mapa; color dentro de gráficas y tablas);
- `carga-rapida`;
- `movimiento-web` (con reduced-motion);
- `shadcn`;
- `supabase` y `supabase-postgres-best-practices` (RLS, RPC, migraciones);
- `design:ux-copy` y `design:accessibility-review`;
- `code-review` nivel `high` antes del PR.
- Next.js 16: lee `node_modules/next/dist/docs/` antes de crear la ruta.

**Verificación visual**
- Arnés `tests/portal/vista` (`npm run prueba:visual`, puerto 4180): agrega una vista `tablero-guadalajara` con datos
  representativos.
- Navegador integrado con `preview_start`, `resize_window` (390, 768, 1366, 1920) y tema claro y oscuro con
  `colorScheme`.

**Comandos:** `npm run typecheck`, `npm test`, `npm run build` y Prettier solo en tus archivos.

**Preguntas:** júntalas al final del plan con `AskUserQuestion`.

## 3. Contexto y requisitos

### 3.1 Hechos verificados (2026-11-27)

**Sucursales de Guadalajara** en `lib/sucursales/config.ts` (`ciudad: 'Guadalajara'`). Son 11:

| Sucursal | company_id | Zona |
|---|---|---|
| Rubén Darío | 532 | Providencia |
| Ventura | 384 | Zapopan, Puerta del Valle |
| Aleden | 457 | Zapopan, Av. Universidad |
| Legacy | 459 | Zapopan, Puerta de Hierro |
| Granja | 477 | Zapopan |
| Chapu 67 | 515 | Ladrón de Guevara |
| Essentia | 514 | Country Club |
| Calle Ottawa | 518 | Providencia |
| Namóra | 513 | Chapultepec Sur |
| Gran Plaza | 567 | Zapopan, Don Bosco Vallarta |
| Forum Tlaquepaque | 631 | Prados del Nilo |

- Todas tienen POS + Rappi del portal. Obtén la lista de la config, no la escribas a mano.

**Tablero México**
- Ruta `/sucursales/mexico`. Cada usuario ve la suma de *sus* sucursales.
- Mapa SVG propio de los 32 estados (Natural Earth, proyección INEGI); sin mosaicos externos ni llaves de mapas.
- Hoy / Un día / Rango y filtro de origen Todo / Mostrador / App / Rappi, con colores fijos por origen: Mostrador
  violeta, App naranja, Rappi verde.
- Resumen guardado que se actualiza cada 10 min.

**Permisos**
- Sucursales usa `perfil_modulos` (módulo `sucursales`) más `perfil_sucursales`. Cerrado por defecto.
- Costeo no usa `perfil_modulos`: va por `perfiles.rol` y **un solo rol por persona**.
- Dioné y Claudia se dieron de alta en el encargo GDL (doc 12) con acceso solo a Sucursales.

**Diseño**
- Marca Helper Holding con modo oscuro por variables (#166/#168).
- La barra de secciones de la sucursal es una píldora con ícono, título y subtítulo, la activa en naranja (ver la
  captura que mandó Carlos).

### 3.2 Requisitos

| ID | Requisito | Aceptación observable |
|---|---|---|
| G1 | Entrada «Tablero Guadalajara» debajo de «Tablero México» | Visible para todo usuario con el módulo Sucursales; ruta propia (por ejemplo `/sucursales/guadalajara`). Invisible y con 404 o redirección sin el módulo. |
| G2 | Las mismas secciones que la sucursal | Barra Ventas / Costeo / Consumo / Nivel de servicio con el mismo diseño, cada una con la suma o la comparación de las 11 sucursales. |
| G3 | Esencia del Tablero México | Hoy / Un día / Rango, filtro de origen, comparación contra la semana pasada y KPIs grandes, con los mismos colores por origen. |
| G4 | Mapa de Guadalajara | Mapa SVG del área metropolitana (Guadalajara, Zapopan, Tlaquepaque y municipios vecinos que hagan falta) con un punto por sucursal en su ubicación real. Tamaño o color por la métrica elegida (venta, cambio, consumo), con su leyenda, tabla al lado como vista accesible y tooltip con el detalle. |
| G5 | Consumo en el mapa | Al elegir Consumo, el mapa y la lista muestran el consumo de insumos por sucursal (qué y cuánto), con el top de insumos de la ciudad. |
| G6 | Tableros significativos | Lo mínimo: ranking de las 11, mezcla por origen, curva del día, pedidos por hora, tendencia de semanas, lo más vendido, margen de Costeo por sucursal y Nivel de servicio Rappi por sucursal. Ajústalo con `dataviz`. |
| G7 | Datos solo de GDL y completos | Las 11 sucursales para cualquier usuario con el módulo, aunque no tenga ninguna asignada. Los totales cuadran con la suma de las páginas de sucursal. |
| G8 | Directorio de Dioné y Claudia | Solo ven las 11 de GDL (ni más ni menos) en Directorio, Tablero México y páginas de sucursal. |
| G9 | Costeo para Dioné y Claudia | Entran a Costeo y pueden **editar cantidades y recetas, y todo lo de productos**. No pueden administrar usuarios. Ver §3.3, D1. |
| G10 | Rendimiento | Carga comparable a la del Tablero México (`carga-rapida`), sin consultas por sucursal en cascada. |

### 3.3 Decisiones y supuestos (confírmalos en el plan)

- **D1, Costeo de Dioné y Claudia.** Carlos dijo: «podrán editar cantidades y recetas, dales acceso completo a lo que
  tiene que ver con productos».
  - El modelo actual da un rol por persona: `operaciones` edita recetas, pero no altas o datos de producto si esos
    caen en otra área.
  - Inventaría qué pantallas y acciones de Costeo tocan productos y recetas, y a qué área de `permisos.ts`
    pertenece cada una.
  - Propón la opción mínima y segura. Puede ser `operaciones` si cubre todo; si no, un ajuste acotado (por ejemplo,
    permisos por área por persona) sin cambiar a nadie más.
  - Los **precios de venta y la configuración** son de finanzas. Pregúntale a Carlos si «todo lo de productos» los
    incluye, y propón que no.
  - Comprueba que cambiar el rol no les quite Sucursales (el acceso va por `perfil_modulos`).
- **D2, acceso abierto del Tablero GDL.** Recomendado: RPC o resumen propio del tablero con `security definer`, que
  devuelva **solo las 11 sucursales de GDL** y **solo a quien tiene el módulo `sucursales`**. Así no se abren las
  tablas de pedidos ni el detalle de las demás. Prueba la RLS por acceso directo (llamada a la RPC con un usuario sin el
  módulo).
- **D3, geometría del mapa.** Límites municipales del Marco Geoestadístico del INEGI (datos abiertos) o de una fuente
  con licencia abierta. Genera los trazos con un script como el de México, con licencia y fuente en el encabezado.
  Coordenadas de cada sucursal desde su dirección (CRM o config), verificadas a mano y guardadas en la config. Sin
  mosaicos de terceros que pidan llave.
- **D4, componente reutilizable.** El tablero de ciudad debe recibir la ciudad como parámetro, para que mañana salgan
  otros sin rehacerlo. Solo Guadalajara se publica ahora.

## 4. Exploración

- Lo de §2.1 más la línea base de comandos.
- Capturas «antes» del Directorio de Dioné y Claudia (con «Ver como» o equivalente si existe; si no, lee sus filas).
- Lista de qué secciones se pueden sumar tal cual y cuáles piden RPC nueva.

## 5. Solución (propuesta)

- **Ruta y menú:** `/sucursales/guadalajara`, entrada en el menú de Sucursales debajo de Tablero México con ícono
  propio.
- **Datos:** nueva RPC o ampliación del resumen guardado para el alcance «ciudad GDL» (D2), con las mismas reglas de
  horas, zonas, origen y Rappi del portal que el Tablero México. Pruebas de cálculo con PGlite como las de México.
- **Vista:**
  - encabezado con KPIs del día;
  - mapa GDL con selector de métrica, puntos con tamaño o color y lista;
  - barra de secciones igual a la de la sucursal;
  - en cada sección, sus tableros:
    - **Ventas:** curva, horas, mezcla, ranking y semanas;
    - **Costeo:** margen y costo por sucursal, productos con peor margen;
    - **Consumo:** insumos por sucursal y en el mapa;
    - **Nivel de servicio:** conectividad, reclamos y apagados por tienda Rappi.
- **Accesos:**
  - migración o SQL con candados para dejar el `perfil_sucursales` de Dioné y Claudia exactamente en las 11 de GDL;
  - el cambio de Costeo según D1;
  - todo registrado en la bitácora; el estado previo se guarda en el doc 19.

## 6. Fases

| Fase | Entrada | Acciones | Entregable | Criterio de salida | Autorizada |
|---|---|---|---|---|---|
| F0 Plan | Este documento | §2.1 y §4 en Plan Mode | Plan con D1–D4 resueltos o como pregunta | OK de Carlos | Sí |
| F1 Datos y accesos | OK | RPC o resumen GDL, pruebas de cálculo y RLS, mapa GDL (script y trazos), coordenadas | Commits en `feat/tablero-guadalajara` | Pruebas en verde; totales GDL = suma por sucursal en 3 días de muestra | Sí |
| F2 Vista | F1 | Página, mapa, secciones y tableros en arnés y app | Capturas claro y oscuro | §7 visual completo | Sí |
| F3 Cierre | F2 | `code-review`, PR, merge si está autorizado, aplicar accesos de Dioné y Claudia en producción y verificar | Doc 19 + reporte | §7 completo | Sí; merge con OK |

## 7. Verificación

| Requisito o riesgo | Comprobación | Evidencia |
|---|---|---|
| G7 cuadre | Hoy, un día y un rango: total GDL contra la suma de las 11 páginas de sucursal, por origen | Tabla de cuadre |
| D2 seguridad | RPC con usuario sin módulo: niega. Con módulo y sin sucursales GDL: devuelve las 11 y nada más. Las tablas base siguen cerradas. | Prueba de RLS en PGlite y consulta en producción |
| G1 menú | Usuario con Sucursales ve la entrada; usuario sin el módulo no la ve y la URL directa no abre | Capturas y respuesta |
| G8 | Dioné y Claudia: Directorio con 11 sucursales; Tablero México suma solo GDL; URL de una sucursal no GDL no abre | Conteos y respuesta |
| G9 | Dioné o Claudia editan una cantidad de receta en un entorno seguro (o con «Ver como») sin cambiar datos reales; las acciones fuera de su alcance fallan en servidor y RLS, no solo se ocultan | Prueba automatizada y recorrido |
| G4 y G5 mapa | Cada punto en su colonia correcta (contrastado con la dirección); leyenda y tabla coinciden con el mapa | Captura con anotación |
| Diseño | 390, 768, 1366 y 1920 en claro y oscuro; sin scroll horizontal; `design:accessibility-review` | Hoja de capturas |
| G10 | Tiempo a contenido de GDL contra México | Números |
| No regresión | Tablero México, Directorio y una sucursal sin cambios; `typecheck`, `test` y `build` | Salida de comandos |

## 8. Entrega

PR con enlace y capturas, cuadre de G7, cambios de acceso aplicados (antes y después), decisiones D1–D4 tomadas,
pendientes, doc 19 y memoria del proyecto actualizada.

**Primera acción:** abre el worktree, entra a Plan Mode, lanza los tres subagentes `Explore` en un solo mensaje y
presenta el plan con D1–D4 y las preguntas al final. No construyas ni cambies accesos hasta el OK.
