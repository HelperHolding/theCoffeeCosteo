# 02 · Referencias y decisiones

**Fecha de consulta:** 2026-10-23. Todas las URL se abrieron ese día y respondieron.

**Cómo se fechó cada fuente:**
- Docs de Supabase: último commit del archivo fuente en `supabase/supabase` (API de GitHub).
- Docs de Next y Vercel: campo `lastUpdated` de la página.
- Repos: `pushed_at` y última versión publicada.

**Criterio de selección:** solo documentación oficial o repos mantenidos por el proveedor. No se encontró una guía oficial de «monolito modular en TypeScript»; la guía *Data Security* de Next es lo más cercano y se usa en su lugar.

## Selección

| # | Fuente | Mantenimiento | Problema que resuelve aquí | Patrón aprovechable | Compatibilidad | Costo |
|---|---|---|---|---|---|---|
| 1 | [Supabase · RLS Performance and Best Practices](https://supabase.com/docs/guides/troubleshooting/rls-performance-and-best-practices-Z5Jjwv) | fuente 2026-09-22 | Políticas de Costeo que evalúan `rol_actual()` por fila | Envolver en `(select …)` para un initPlan; índices en columnas de política; `TO authenticated`; filtros `.eq()` explícitos; EXPLAIN con y sin RLS **fuera de producción** | SQL puro; probable en PGlite con el shim `auth.uid()` existente. El CRM ya lo hace (migración 18) | Bajo |
| 2 | [Supabase · Database Advisors](https://supabase.com/docs/guides/database/database-advisors) | fuente 2026-09-04 | Línea base de seguridad y rendimiento que hoy no se puede ver | Lints `0001` (FK sin índice), `0003` (auth RLS initplan), `0006` (políticas permisivas múltiples), `0011` (search_path mutable) y `0028/0029` (SECURITY DEFINER ejecutable) | Corre contra la BD real (Studio o CLI), no en PGlite | Bajo |
| 3 | [Supabase · index_advisor](https://supabase.com/docs/guides/database/extensions/index_advisor) · [repo](https://github.com/supabase/index_advisor) | v0.2.1 del 2026-10-22 | Validar si una consulta lenta necesita índice | `select * from index_advisor('…')` | Solo sugiere índices B-tree de una columna | Bajo |
| 4 | [supabase/agent-skills](https://github.com/supabase/agent-skills) · `supabase-postgres-best-practices` | push 2026-10-02; skill v1.6.0; MIT | Checklist de revisión de migraciones | Reglas `security-rls-performance`, `schema-foreign-key-indexes`, `data-n-plus-one`, `monitor-pg-stat-statements`, `query-composite-indexes` | Encaja con las skills unificadas en `~/.agents/skills`. Es solo guía | Bajo |
| 5 | [Supabase · Server-Side Auth for Next.js](https://supabase.com/docs/guides/auth/server-side/nextjs) | fuente 2025-11-11; ya contempla `proxy.ts` de Next 16 | Confirmar el uso de `getClaims` y `getUser` | `getClaims()` en el proxy (ya se hace); `getUser()` solo si se necesita el usuario fresco; nunca autorizar con `getSession()` | El portal ya sigue el patrón | Bajo |
| 6 | [Supabase · Connecting to Postgres (Supavisor)](https://supabase.com/docs/guides/database/connecting-to-postgres) | fuente 2026-10-22 | Solo si el portal usara `pg` directo | Transaction mode (6543), pool 1 y sin prepared statements en serverless | El portal usa supabase-js (HTTP); **hoy no aplica**. Los scripts usan session pooler | — |
| 7 | [Next · `use cache`](https://nextjs.org/docs/app/api-reference/directives/use-cache) · [`updateTag`](https://nextjs.org/docs/app/api-reference/functions/updateTag) | 2026-09-29 / 2026-08-18; estable desde 16.0 | Caché de Sucursales por instancia | `'use cache: remote'` + `cacheLife` + `cacheTag` en una función del DAL; sin `cookies()` dentro; `updateTag` en server actions | **Requiere `cacheComponents: true`, que cambia el render de todas las rutas.** La caché por defecto es en memoria (igual que hoy); la compartida es `remote` | Medio |
| 8 | [Next · Data Security](https://nextjs.org/docs/app/guides/data-security) | 2026-10-06 | Límites entre módulos y secretos fuera del cliente | Un DAL `server-only` por módulo que autoriza y devuelve DTO mínimos; solo el DAL lee `process.env`; actions delgadas con zod y reautorización; checklist de auditoría para PRs | Nativo de Next 16. El portal ya lo cumple en gran parte (`lib/*` + `server-only`) | Bajo |
| 9 | [Next · `proxy.ts`](https://nextjs.org/docs/app/api-reference/file-conventions/proxy) | 2026-09-04 | Confirmar el alcance del proxy | Solo refresco de sesión y redirecciones optimistas; reautorizar en cada action, porque un matcher excluido también salta las actions | El `proxy.ts` actual cumple | Bajo |
| 10 | [Vercel · Runtime Cache](https://vercel.com/docs/caching/runtime-cache) | 2026-08-28 | Caché compartida entre instancias para lecturas de la API Brasil | Regional, separada por entorno, persiste entre despliegues, LRU; 2 MB por ítem | Con `use cache: remote` o `getCache()` de `@vercel/functions`. **Uso con costo.** No apto para datos por usuario (los nuestros no lo son: la autorización va antes) | Bajo–medio |
| 11 | [Vercel · Function region](https://vercel.com/docs/functions/configuring-functions/region) · [Limits](https://vercel.com/docs/functions/limitations) | 2026-08-11 / 2026-08-24 | Latencia función ↔ Supabase ↔ API Brasil | Región por defecto `iad1`; `regions` en `vercel.json`; Hobby permite 1 región; duración por defecto 300 s; cuerpo máximo 4.5 MB | Requiere conocer la región del proyecto Supabase y el plan de Vercel (**no verificados**) | Bajo |
| 12 | [Vercel · Observability](https://vercel.com/docs/observability) | 2026-09-10 | Falta de telemetría (p50/p95, latencia de API externa) | «External API requests» separa la latencia de la API Brasil de la de la BD | Disponible en todos los planes; el desglose por ruta requiere Observability Plus | Bajo |
| 13 | [PostgreSQL · EXPLAIN](https://www.postgresql.org/docs/current/using-explain.html) · [pg_stat_statements](https://www.postgresql.org/docs/current/pgstatstatements.html) | docs 18 | Medir `v_resumen` y las vistas recursivas | EXPLAIN sin ANALYZE en producción; ANALYZE solo en lecturas acotadas o copia; ranking por `total_exec_time` | El proyecto declara Postgres 17 (`supabase/config.toml`) | Bajo |

## Descartadas o desactualizadas

- **`supabase/supa_audit`:** archivado en 2025-02-16; no adoptar como dependencia. Su idea sí sirve para procedencia: versión de registro con `record_id` estable y valores anterior/nuevo. El portal ya tiene `bitacora` con esa función.
- **`vercel/next.js/examples/with-supabase`:** al día (2026-10-19), pero es un starter, y fija versiones `latest`; no copiar. El `proxy.ts` del portal ya sigue su forma.
- **`unstable_cache` y `revalidateTag(tag)` sin perfil:** legado en Next 16. No construir sobre ellos.

## Decisiones recomendadas (pendientes de aprobación)

| # | Decisión | Motivo | Se descarta |
|---|---|---|---|
| D1 | **Mantener el monolito modular actual** (un repo, una app Next y Supabase). Formalizar límites con un `lib/<modulo>/` por dominio como DAL `server-only`; componentes en `components/<modulo>/`; lo compartido en `lib/portal` y `lib/supabase` | Ya es la estructura real y funciona; no hay problema medido que justifique otra | Monorepo, microservicios, ORM, colas, Redis, data warehouse |
| D2 | **Sucursales sigue bajo demanda** (decisión de docs/10). No persistir pedidos ni crear cron | 3 sucursales, lecturas bajo el presupuesto | Tablas de pedidos y cron. Se reevalúa con los gatillos de docs/10 |
| D3 | **Caché compartida (Runtime Cache) solo si una medición la justifica.** Primero, telemetría (D6) | No hay evidencia de que el frío por instancia afecte a usuarios reales; adoptarlo exige `cacheComponents` o `@vercel/functions` | Adoptar `use cache` en todo el portal por ahora |
| D4 | **Identidad Costeo ↔ Brasil en una tabla de correspondencias nueva, no en `recetas`**: (receta, tamaño, canal opcional) ↔ (`defaultCode`, `productName` observado, contexto, vigencia, evidencia, estado de aprobación) | `defaultCode` se reutiliza y puede estar vacío; un producto local puede tener varios códigos y viceversa. Separar identidad del nombre visible | Una columna `sku` única en `recetas`; relacionar por nombre |
| D5 | **Procedencia mínima:** usar `bitacora` con un `origen` nuevo (`conciliacion_brasil`) + una tabla `conciliacion_ejecuciones` (id, fecha, alcance, aprobado por, commit o script, resumen). La evidencia (pedido de muestra, fecha, sucursal) va en la tabla de correspondencias, no en payloads crudos | Reutiliza la bitácora existente; evita guardar payloads | Copiar `supa_audit`; guardar JSON crudo indefinidamente |
| D6 | **Instrumento mínimo antes de optimizar:** Vercel Observability y Advisors de Supabase leídos por Carlo o con acceso de solo lectura, más un `Server-Timing` opcional en las rutas de Sucursales | No hay p50/p95 ni EXPLAIN; sin eso las optimizaciones serían conjeturas | Pruebas de carga |
| D7 | **RLS de Costeo con el patrón `(select …)`**, igual que la migración 18 del CRM | Patrón oficial, bajo riesgo y probable en PGlite; las pruebas de permisos ya existen | Reescribir políticas o roles |
