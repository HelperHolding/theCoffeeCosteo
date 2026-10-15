# Plan de rediseño de interfaz · Portal de Costeos The Coffee

**Fecha:** 2026-10-15
**Alcance:** solo interfaz (pantallas, componentes, estilos). **No se toca la base de datos**: ni migraciones, ni vistas, ni RLS, ni datos. Los números oficiales siguen saliendo de `v_resumen`, `v_alerta_producto_canal`, `v_costo_*` y `bitacora`.

---

## 1. Diagnóstico del portal actual

### Funcionamiento (lo que ya está bien y se conserva)
- Next.js 16 + Supabase con RLS por rol (`compras`, `operaciones`, `finanzas`, `admin`). Todo el cálculo vive en Postgres (11 migraciones).
- Pantallas: Tablero, Resumen, Productos (+ ficha, nuevo, calculadora de promociones), Sub-recetas, Insumos, Configuración, Login/contraseña, consentimiento OAuth y chat de Claude.
- Ya existen piezas que el rediseño aprovecha: `cmdk` (paleta de comandos), Radix (popover, dialog), TanStack Table, `lucide-react`, `xlsx` (exportar).

### Problemas de diseño
| Área | Hoy | Efecto |
|---|---|---|
| Identidad | Arial, fondo `#fff`, todo negro/gris, logo de 128 px en caja blanca dentro de la barra negra | Se ve plano y genérico; no transmite la marca |
| Botones | Solo negro sólido u outline gris; muchas acciones son links subrayados ("Aplicar filtros", "Volver al catálogo") | Jerarquía débil, poco vistoso |
| Consistencia | Tablero/Resumen/Catálogo tienen encabezado con subtítulo; Insumos y Configuración solo un `<h1>` suelto | Cada pantalla parece de otra app |
| Formularios | Estilos globales en `@layer base` para todo `input/select` | Imposible variar tamaños/estados por componente |
| Tablero | 4 KPIs de texto y una tabla de alertas sin límite ni agrupación | No hay lectura rápida; no hay gráficos |
| Resumen | 8 columnas, sin ordenar, sin exportar (la especificación pide Excel), margen solo en texto rojo | Difícil comparar canales; depende del color |
| Insumos | Lista de `<details>` (acordeones), filtros con botón-link | No es una tabla; no se compara costo ni impacto |
| Ficha de producto | Costeo, precios, receta e historial apilados en una sola columna larga | Mucho scroll; no se sabe dónde está cada cosa |
| Configuración | 6 secciones de acordeones seguidos | Navegación pesada |
| Navegación | 6 enlaces planos; la Calculadora está escondida dentro de Productos | Sin agrupación por tarea/área |

### Base de datos
El proyecto Supabase de The Coffee no aparece en la cuenta Supabase conectada aquí (solo están los proyectos de Carlos), así que la revisión se hizo sobre el esquema versionado (`supabase/migrations`) y `lib/supabase/database.types.ts`, sin conectarse a datos reales. Para el rediseño **no se necesita ningún cambio de esquema**: todo lo que muestran los dashboards se agrega en TypeScript a partir de las vistas existentes (igual que hoy hace `lib/portal/tablero.ts`).

---

## 2. Concepto de marca

The Coffee (ザ・コーヒー) nació en Curitiba en 2018 tras un viaje a Japón: locales de ~3 × 3 m, pedido por tablet o app, estética minimalista y pilares de **café, arquitectura, diseño y tecnología**. Su logo es negro sobre blanco, tipografía geométrica gruesa hecha a medida, con el punto final y el katakana como firma.

**Traducción al portal:** "minimalismo cálido y preciso". Monocromo como base (igual que la marca), pero con profundidad: fondos de papel cálido en lugar de blanco puro, tarjetas con relieve sutil, un acento cálido de café usado con disciplina y colores de estado solo para datos (margen, alertas). Precisión japonesa = alineación tabular, números monoespaciados, espaciado consistente.

---

## 3. Sistema de diseño (tokens)

Se reemplaza `app/globals.css` por tokens semánticos en `@theme` (Tailwind 4). Ningún componente usa hex directo.

### Color
| Token | Valor | Uso |
|---|---|---|
| `--color-ink` | `#111111` | Texto principal, barra lateral, botón primario |
| `--color-paper` | `#F6F4EF` | Fondo de la app (papel cálido, no blanco) |
| `--color-surface` | `#FFFFFF` | Tarjetas, tablas |
| `--color-surface-2` | `#EFECE5` | Encabezados de tabla, chips, zonas hundidas |
| `--color-line` | `#E3DED4` | Bordes |
| `--color-muted` | `#6B6560` | Texto secundario (contraste ≥ 4.5:1 sobre paper) |
| `--color-crema` | `#B8875A` | Acento de marca (crema del espresso): foco, selección, KPI destacado, punto del logo |
| `--color-crema-soft` | `#F3E6D6` | Fondos de acento |
| `--color-ok` / `-soft` | `#2F7A4F` / `#E3F1E8` | Margen ≥ objetivo |
| `--color-warn` / `-soft` | `#A86A12` / `#FBEFD9` | Margen bajo objetivo, comisión por confirmar |
| `--color-bad` / `-soft` | `#B3362B` / `#FBE5E2` | Pierde dinero, bajo costo, sin precio |

Modo oscuro: fuera de la v1 del rediseño (los tokens lo dejan listo).

### Tipografía
- **Títulos:** *Zen Kaku Gothic New* (700/900) — geométrica, gruesa, con raíz japonesa; acompaña el logo sin imitarlo.
- **Texto y tablas:** *Inter* (400/500/600) con `font-variant-numeric: tabular-nums` en todo número.
- Escala: 12 · 14 · 16 (base) · 20 · 24 · 32 · 40. Etiquetas de sección en versalitas con `tracking` amplio (ya se usa y es coherente con la marca).
- Cargadas con `next/font/google` (sin parpadeo, autoalojadas).

### Forma, relieve y movimiento
- Radios: 10 px controles, 16 px tarjetas, 999 px chips.
- Sombras: `sm` para tarjetas en reposo, `md` al pasar el cursor; tarjetas con borde `line` + sombra, nunca solo borde (eso es lo que hoy se ve "plano").
- Transiciones 150–220 ms; respetar `prefers-reduced-motion`.
- Iconos: solo `lucide-react`, 16/18/20 px.

---

## 4. Componentes base (`components/ui`)

| Componente | Variantes / notas |
|---|---|
| **Button** | `primary` (tinta, texto blanco, sombra, hover eleva 1 px), `accent` (crema, para la acción principal de cada pantalla: Guardar, Crear), `secondary` (superficie + borde), `ghost`, `danger`, `link`. Tamaños sm/md/lg, con icono, estado `loading` con spinner. Altura mínima 40 px (44 en móvil). |
| **Input / Select / Textarea / Checkbox / Switch** | Componentes propios; se quitan los estilos globales de `@layer base`. Etiqueta visible, ayuda y error debajo del campo. |
| **Card** + **CardHeader** | Superficie con sombra; título, descripción y acciones a la derecha. |
| **PageHeader** | Migas de pan, eyebrow (área), título, descripción y acciones. El mismo en todas las pantallas. |
| **KpiCard** | Valor grande, etiqueta, comparación con objetivo (barra bullet), tendencia/nota y enlace "ver detalle" que abre el Resumen ya filtrado. |
| **Badge / StatusPill** | Estado de margen (ok/warn/bad) con **icono + texto + color** (nunca solo color); Activo/Inactivo; Manual; Rol. |
| **Tabs** | Radix Tabs para la ficha y Configuración. |
| **DataTable** | Ver §6. |
| **FilterBar** | Búsqueda + filtros como chips desplegables (popover) + "Limpiar". Estado en la URL (ya se hace así). |
| **EmptyState / Skeleton** | Vacío con icono y acción; esqueletos para cargas (`loading.tsx` por ruta). |
| **Drawer (Sheet)** | Panel lateral para editar un insumo o registro de catálogo sin salir de la tabla. |
| **Toast** | Confirmación de guardado y errores de permiso ("No tienes permiso"). |
| **CommandPalette** | `cmdk` con ⌘K / Ctrl K: ir a cualquier producto, insumo o pantalla. |

---

## 5. Arquitectura de información y navegación

Barra lateral oscura (tinta) más compacta (232 px), con el logo en versión blanca pequeña y el katakana como detalle, agrupada por tarea:

```
INICIO
  Tablero
ANÁLISIS
  Resumen de costeo
  Calculadora de promociones      (sale de dentro de Productos)
MENÚ
  Productos
  Sub-recetas
COMPRAS
  Insumos
  Proveedores                      (hoy en Configuración)
AJUSTES
  Parámetros y canales
  Catálogos (tamaños, categorías)
— — —
  [Consultar a Claude]  ·  Usuario/rol  ·  Cerrar sesión
```

- Barra superior en el contenido: migas de pan + buscador ⌘K + botón "Consultar" (el chat deja de ser solo un botón flotante).
- Móvil: barra superior con menú hamburguesa que abre la navegación como cajón, en vez del carrusel horizontal de hoy.
- Se reservan entradas (ocultas hasta que existan) para **Bitácora**, **Carga masiva** y **Usuarios**, que la especificación original lista y aún no tienen pantalla.
- Las rutas actuales se conservan (`/`, `/resumen`, `/productos/...`, `/insumos`, `/configuracion`); Proveedores y Catálogos serán pestañas con URL propia (`/configuracion?tab=...`) para no romper enlaces.

---

## 6. Tablas

Un solo `DataTable` (TanStack, ya instalado) para Resumen, Insumos, catálogos y alertas:

- Encabezado fijo al desplazar y primera columna fija en horizontal.
- Orden por columna (clic, Enter/Espacio, `aria-sort`).
- Números alineados a la derecha, `tabular-nums`; moneda MXN consistente.
- Margen como **StatusPill** + mini barra contra el objetivo.
- Densidad cómoda/compacta (interruptor), filas con hover y fila clicable hacia la ficha.
- Selector de columnas visibles y **Exportar a Excel** con los filtros aplicados (usa `xlsx`, ya en dependencias).
- Paginación con tamaño de página 25/50/100 y conteo "1–25 de 312".
- Vacío con mensaje y "Limpiar filtros"; esqueleto mientras carga.
- En móvil: columnas secundarias ocultas y scroll horizontal contenido.

**Resumen de costeo** gana una vista **"por producto"** (pivote): una fila por producto×tamaño con columnas Mostrador · Rappi · App propia (precio y margen de cada canal lado a lado). La vista actual "detalle" (producto×tamaño×canal) se mantiene como segunda pestaña.

---

## 7. Dashboards: dónde y qué

Todos con datos de las vistas existentes; las agregaciones viven en `lib/portal/tablero.ts` (funciones puras con pruebas). Gráficos en SVG/CSS propio con los tokens (sin librería nueva; si algún gráfico lo requiere, se evalúa Recharts antes de agregarla). Cada gráfico lleva valores escritos y tabla alternativa accesible.

### 7.1 Tablero (inicio) — el dashboard principal
1. **Fila de KPIs (4):** Food cost promedio (bullet contra objetivo), Productos bajo objetivo, Sin precio, Pierden en delivery. Cada uno abre el Resumen filtrado.
2. **Salud del menú:** barra apilada horizontal de productos activos por estado (OK / bajo objetivo / pierde / sin precio).
3. **Margen por categoría:** barras horizontales ordenadas de mayor a menor con línea de objetivo.
4. **Comparativo por canal:** margen % promedio Mostrador vs Rappi vs App propia (barras agrupadas).
5. **Top 10 de menor margen:** lista con pill de estado y enlace a la ficha.
6. **Alertas agrupadas por tipo:** tarjetas con conteo ("Pierde dinero en el canal · 12") que despliegan los productos, en vez de una tabla interminable.
7. Aviso de comisión de App propia por confirmar como banner de acento (solo si aplica).

### 7.2 Ficha de producto (pestañas)
- **Encabezado:** nombre, categoría, estado, tamaños y 3 mini‑KPIs (costo, precio, margen mostrador del tamaño principal).
- **Pestaña Costeo:** tarjetas por tamaño × canal con precio final, margen $ y % y pill de estado; tabla detallada debajo.
- **Pestaña Receta:** editor actual con estilo nuevo + **composición del costo** (barra horizontal: qué ingrediente pesa más en el costo).
- **Pestaña Precios:** editor de precios de lista y manuales (solo finanzas/admin pueden editar; los demás lo ven en solo lectura).
- **Pestaña Historial:** línea de tiempo de la bitácora (usuario, campo, anterior → nuevo).

### 7.3 Insumos
- KPIs: insumos activos, sin uso, inactivos, proveedores.
- **Impacto por insumo:** top insumos por número de productos que lo usan.
- Tabla real (nombre, proveedor, categoría, presentación, costo paquete, costo unitario, # productos, estado) con edición en **Drawer**, mostrando "productos afectados" antes de guardar (ya existe la lógica `impacto`).

### 7.4 Sub-recetas
- En la ficha: costo por unidad de rendimiento destacado + "Usada en" como chips enlazados.

---

## 7.5 Agente lateral con Thinking Orbs

**Lo que ya existe:** el portal ya tiene un asistente de Claude de solo lectura (`app/api/chat/route.ts`, `components/portal/chat.tsx`) con AI SDK de Anthropic, seis consultas (`buscar_recetas`, `consultar_costos`, `buscar_insumos`, `consultar_receta`, `recetas_por_insumo`, `consultar_alertas`), cuotas por usuario (migración 10) y modelo configurable por `CHAT_MODEL`. Hoy es un globo flotante abajo a la derecha. **No hace falta construir un agente nuevo**: se rediseña la interfaz y se le da presencia.

**Concepto: "Barista" (nombre de trabajo)** — un panel lateral derecho fijo, a la altura completa, que se abre desde la barra superior (botón con el orb en reposo) o con `Ctrl/⌘ J`.

- **Escritorio:** panel de 400 px que empuja el contenido (no lo tapa), para consultar mientras se ve la tabla. **Móvil:** hoja a pantalla completa.
- **Orb de estado** (`thinking-orbs`, MIT, el mismo del demo `demo-dashboard-orbs`) en el encabezado del panel y junto a cada paso, con un verbo por actividad real del agente:

| Momento del agente | Estado del orb | Texto visible |
|---|---|---|
| Panel abierto, esperando | `breathing` | "Listo para consultar" |
| `buscar_recetas`, `buscar_insumos`, `consultar_alertas` | `searching` | "Buscando en el menú / insumos / alertas" |
| `consultar_costos`, `consultar_receta` | `solving` | "Calculando costos y márgenes" |
| `recetas_por_insumo` | `connecting` | "Cruzando insumos con recetas" |
| Varias consultas en el mismo turno | `weaving` | "Combinando resultados" |
| Escribiendo la respuesta (stream de texto) | `composing` | "Redactando" |

  El estado sale de las partes `tool-*` que ya llegan por el stream del AI SDK; no se simula nada. Transición en fundido entre estados y versión estática con `prefers-reduced-motion`.
- **Pasos visibles:** cada consulta aparece como una línea compacta con su orb pequeño (20 px) y, al terminar, un check; plegable para ver qué se consultó.
- **Contexto de pantalla:** si estás en la ficha de un producto, el panel ofrece sugerencias de ese producto ("¿Por qué pierde en Rappi?", "¿Qué insumo pesa más?"). Las sugerencias del Tablero apuntan a las alertas.
- **Respuestas:** tablas Markdown con el estilo del DataTable, montos con `tabular-nums` y enlaces a fichas que abren la ficha sin cerrar el panel.
- **Orb en otros lugares (con moderación):** estado vacío del panel y el botón de la barra superior. No se usa como decoración en dashboards.

**Conexión de la clave (después, fuera de este rediseño):** la clave empresarial de Anthropic va **solo** en Vercel → Environment Variables como `ANTHROPIC_API_KEY` (Production y Preview); no se pega en el chat ni se guarda en Git. Falta además publicar la migración de cuotas si no está publicada. Para un agente "básico" y económico se puede fijar `CHAT_MODEL=claude-haiku-5-5`; el predeterminado actual es `claude-sonnet-5-5`. Sin clave, el panel muestra el estado "aún no disponible" con el orb en reposo (ya lo maneja la ruta).

---

## 8. Pantalla por pantalla

| Pantalla | Cambio principal |
|---|---|
| Login / establecer contraseña | Pantalla dividida: lado izquierdo tinta con logo grande y katakana; derecha formulario en tarjeta. |
| Tablero | Dashboard de §7.1. |
| Resumen | DataTable + vista pivote por producto + exportar. |
| Productos / Sub-recetas | Catálogo en tabla con categoría, tamaños, estado y margen mostrador; acciones primarias en acento. |
| Ficha | Pestañas (§7.2) con barra de acciones fija abajo al editar ("Cambios sin guardar · Descartar · Guardar receta"). |
| Calculadora de promociones | Entradas a la izquierda, resultado en tarjetas grandes a la derecha (precio, descuento, contribución) con pill de estado. |
| Insumos | §7.3. |
| Configuración | Pestañas: Parámetros · Canales · Tamaños · Categorías · Proveedores. Canales como tarjetas con su comisión, envase y tope. |
| Agente | Panel lateral con Thinking Orbs (§7.5); acceso desde la barra superior y `Ctrl/⌘ J`. |
| Error / 404 | Estados vacíos con marca. |

---

## 9. Reglas de seguridad del rediseño

1. **Cero cambios en `supabase/`, `scripts/migracion/` y lógica de `lib/portal/*` que calcula o escribe.** Solo se agregan funciones puras de agregación para dashboards (con pruebas).
2. Server actions, RLS, permisos (`puede()`) y validaciones se usan tal cual; el rediseño solo cambia cómo se presentan.
3. Se trabaja en una rama (`rediseno-ui`), **no en `main`**: `main` despliega directo a producción en Vercel. Se revisa en el despliegue de vista previa antes de unir.
4. Las pruebas existentes (`tests/portal/*.test.tsx`) buscan textos y roles; se conservan etiquetas accesibles o se actualizan las pruebas en el mismo cambio.
5. Verificación por fase: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check` y revisión visual en el arnés (`npm run prueba:visual`) con datos sintéticos.

---

## 10. Fases

| Fase | Entrega | Verificación |
|---|---|---|
| **F0 · Fundamentos** | Tokens, fuentes, Button/Input/Select/Card/Badge/PageHeader/Tabs/Toast/Skeleton; quitar estilos globales de formularios | Arnés visual con todas las variantes; pruebas verdes |
| **F1 · Estructura** | Barra lateral agrupada, barra superior con migas, ⌘K, menú móvil, `loading.tsx` | Navegación con teclado; móvil 375 px |
| **F2 · Tablero** | Dashboard completo (§7.1) + funciones de agregación con pruebas | KPIs cuadran con el tablero actual |
| **F3 · Resumen** | DataTable, vista pivote, exportar a Excel | Mismo número de filas y valores que hoy |
| **F4 · Productos y fichas** | Catálogo, ficha con pestañas, composición de costo, historial en línea de tiempo | Guardar receta y precios sigue funcionando por rol |
| **F5 · Insumos** | Tabla + Drawer + KPIs de impacto | Edición respeta permisos de compras |
| **F6 · Configuración** | Pestañas y tarjetas de canales | Edición por rol |
| **F7 · Agente lateral** | Panel con Thinking Orbs mapeados a las consultas reales, sugerencias por pantalla | Prueba con stream simulado en el arnés (sin clave) |
| **F7b · Login, calculadora, errores** | Pulido final | Flujos de acceso intactos |
| **F8 · QA y publicación** | Accesibilidad (contraste, foco, `aria-sort`), responsive 375/768/1024/1440, vista previa en Vercel | Aprobación antes de unir a `main` |

---

## 11. Decisiones abiertas

1. **Acento crema (`#B8875A`)** vs portal 100 % monocromo con color solo en estados. Recomendado: crema, usado con disciplina.
2. **Gráficos en SVG propio** vs agregar Recharts. Recomendado: SVG propio (los gráficos son barras simples).
3. **Proveedores** se mueve al área Compras (recomendado) o se queda en Configuración.
4. Modelo del agente: Haiku 5.5 (básico, barato) o Sonnet 5.5 (el actual, mejor razonamiento sobre costos).
5. Logo en blanco: hace falta la versión del logo en negativo (o se genera invirtiendo el PNG actual a SVG).
