# 01 · Repositorio y arquitectura actual

Ejecución: 2026-10-22 (fases A–C). Solo lectura del código; no se modificó nada del portal.

## Repositorio confirmado

| Dato | Valor |
|---|---|
| Repositorio | `sebascm0906/theCoffeeCosteo` — https://github.com/sebascm0906/theCoffeeCosteo |
| Checkout local | `C:\Users\carlo\Documents\AI\theCoffeeCosteo` |
| Rama / commit base | `main` @ `afd4ef0` (Merge PR #10 «Agente CRM: totales exactos…», 2026-10-21) |
| Despliegue | Vercel conectado a `main` → `the-coffee-costeo.vercel.app` (README, `docs/crm/ARQUITECTURA.md` §13/§19). Sin `vercel.json` ni `.github/` |
| Cambios locales previos | solo `.claude/` sin seguimiento (no se tocó) |

Evidencia de que es el portal actual y no solo el costeo histórico: contiene los dos módulos (`app/(portal)` = Costeo y `app/(crm)/crm` = CRM Franquicias), registro de módulos en `lib/portal/modulos.ts`, tabla `perfil_modulos` (migración 13) y el historial de PRs #6–#10 del CRM. En GitHub no hay otro candidato del dueño (`gh repo list sebascm0906`); los resultados de búsqueda pública «thecoffee» son proyectos ajenos.

## Stack

- Next.js 16.3 (app router, `proxy.ts` en lugar de middleware), React 19.3, TypeScript 7, Tailwind 4, shadcn (new-york, stone).
- Supabase (Auth + Postgres con RLS). El portal usa la clave publicable con sesión del usuario; las importaciones usan `DATABASE_URL` desde scripts CLI.
- Pruebas: Vitest (proyectos `node` y `dom`), PGlite para migraciones/RLS, arnés visual Vite (`tests/portal/vista`).
- IA: AI SDK + Anthropic para los agentes Ctrl J (`/api/chat`, `/api/chat/crm`).
- Comandos reales: `npm test`, `npm run typecheck`, `npm run build`, `npm run format:check`, `npm run prueba:visual`.

## Módulos y navegación

- Registro: `lib/portal/modulos.ts` — `IdModulo = 'costeo' | 'crm'`, `Accesos = Partial<Record<'crm', NivelModulo>>`, cada módulo con `acceso(accesos)`.
- Route groups con layout propio y `force-dynamic`: `app/(inicio)` (tarjetas de módulos), `app/(portal)` (Costeo), `app/(crm)/crm` (CRM).
- Puntos con mapas por módulo que un tercer módulo debe tocar (no basta la entrada del registro):
  - `components/portal/navegacion.tsx` (`entradaModulo`, grupos por módulo, `gruposDe()` con ternario por sección).
  - `components/portal/marco.tsx` (`textos` por sección, iconos Ctrl K, `<Agente modulo>` en toda sección ≠ inicio).
  - `components/portal/tarjetas-modulos.tsx` (`iconos: Record<IdModulo, …>`).
  - `lib/chat/agentes.ts` (`IdAgente = 'costeo' | 'crm'`): Sucursales necesitará agente propio o quedar sin Ctrl J.
- Rutas CRM: `/crm`, `/crm/tiendas[/id]`, `/crm/prospectos[/id]`, `/crm/contactos[/id]`, `/crm/actividades`. Costeo: `/costeo`, `/resumen`, `/productos…`, `/subrecetas…`, `/insumos`, `/configuracion`.

## Autenticación y permisos

- `proxy.ts`: refresca cookies (`getClaims`), `Cache-Control: private, no-store`; no hace gating de rutas.
- `lib/supabase/sesion.ts`: `contexto` cacheado por request (`getUser` + `perfiles` + `perfil_modulos`, falla cerrado a `{}`); `sesion(area?)` para Costeo; `sesionCrm()` redirige a `/` sin acceso. Cada página CRM llama `sesionCrm()` (el layout no se re-ejecuta al navegar).
- `perfil_modulos` (migración `20261020000013_crm_modulos.sql`): `modulo text check (modulo in ('crm'))`, `nivel in ('desarrollador','edicion','lectura')`, RLS de lectura propia/admin, política restrictiva sin OAuth. **Agregar Sucursales implica ampliar ese CHECK** (migración).
- APIs (`lib/chat/ruta.ts`): mismo origen, `getUser` 401, perfil activo 403, acceso a módulo 403, cuota por RPC.

## Integraciones externas y caché

- Zoho solo se consulta desde scripts CLI (`scripts/zoho/*`); **hoy ninguna ruta del portal llama a una API externa en tiempo de petición** salvo Anthropic. La API The Coffee sería la primera integración en runtime.
- No hay `unstable_cache`, `'use cache'` ni `cacheComponents` (`next.config.ts` = `{ poweredByHeader: false }`).

## CRM de tiendas (entidad comercial)

`crm_tiendas` (migración 14): `nombre`, `ciudad`, `direccion`, `numero_tienda_jestor integer`, `rappi bool`, `fecha_apertura`, etc. 176 tiendas no archivadas; 82 con número Jestor. No hay `company_id` del proveedor. Ver identidad piloto en `06-ESTADO-Y-DECISIONES.md`.

## UI y diseño

- Tokens en `app/globals.css`: `ink #111111` (sidebar), `paper #f6f4ef` (fondo), `surface #fff`, `line`, `crema #a8774a` (acento), `ok/warn/bad` (+`-soft`); radios `.625/.875/1rem`; `shadow-card`. Fuentes Inter (texto) y Zen Kaku Gothic New (títulos).
- `docs/DESIGN-DIRECTION.md`: sin degradados, tarjetas `rounded-2xl`, controles `rounded-[10px]`, una sombra, tablas 13–14 px de 25 filas, estados de carga/vacío/error obligatorios, WCAG AA.
- Piezas reutilizables: `components/portal/piezas.tsx` (`Encabezado`, `Tarjeta`, `Kpi`, `Barra`, `Pill`, `Insignia`, `Vacio`), `pestanas.tsx` (tabs con `?tab=`), `components/crm/listas.tsx` (`Buscador`, `Paginacion`), `@tanstack/react-table` en `tabla-resumen.tsx`.
- **No hay librería de gráficos**: las barras son divs Tailwind. Patrón de tablero: `app/(portal)/costeo/page.tsx` + funciones puras en `lib/portal/tablero.ts`.
- Formatos: `dinero` (es-MX, MXN) y `porcentaje` en `lib/portal/consultas.ts`; `fechaHora` con `America/Mexico_City` en `lib/crm/formato.ts` (no sirve para Juárez, ver 03).

## Cómo encaja Sucursales

- Nuevo route group `app/(sucursales)/sucursales` con layout y `sesionSucursales()` análogo a `sesionCrm()`.
- `IdModulo` + `Accesos` + mapas de navegación/marco/tarjetas + CHECK de `perfil_modulos`.
- La entidad operativa (company_id de la API) se modela aparte de `crm_tiendas`; se vincula por `lookerStoreId = numero_tienda_jestor` cuando exista, sin exigir 1:1.

## Línea base y riesgos de regresión

- Línea base: commit `afd4ef0`. No se ejecutaron `npm test`/`build` en esta fase porque no hubo cambios de código del portal (solo docs y un script CLI aislado en `scripts/sucursales/`).
- Riesgos al implementar: tipos `Record<IdModulo, …>` exhaustivos (compilación falla si falta una entrada: bueno), `gruposDe()` con ternario binario (Sucursales caería en grupos de Costeo si no se ajusta), `<Agente>` mostrado en toda sección, CHECK de `perfil_modulos`, `force-dynamic` + llamadas externas lentas que bloqueen el render.
