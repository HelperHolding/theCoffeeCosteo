# Migraciones y despliegue (desde el 2026-10-28)

## Integraciones de GitHub

El repo `HelperHolding/theCoffeeCosteo` está conectado a:

- **Vercel:** cada PR genera un preview. Cada merge a `main` se publica en producción.
- **Supabase**, proyecto `jpqkmnfjwzniptszjuli`, con la rama de producción `main`. **Cada merge a `main` que traiga una migración nueva en `supabase/migrations/` la aplica en producción automáticamente.**

**Historia:** la integración de Supabase dejó de correr cuando el repo pasó a HelperHolding. El último check fue en el PR #23. Del 23 al 27, las migraciones se aplicaron a mano, con respaldo y ensayo. El 2026-10-28, antes de reconectarla, el repo y la base quedaron con las mismas 27 migraciones (`20261005000001` a `20261028000027`). La 23 entró al repo en el #52, idéntica a la registrada.

## Procedimiento para una migración nueva

Como el merge la aplica sola, el control se hace **antes** del merge:

1. Archivo nuevo en `supabase/migrations/` con versión mayor a la última, y prueba en PGlite (`tests/db`).
2. **Respaldo** de lo que cambia: la definición de las funciones, o un respaldo lógico si toca datos. Se guarda fuera del repo, en `Respaldos/thecoffee-supabase`.
3. **Ensayo remoto con ROLLBACK** del archivo exacto del PR, y verificación con una conexión nueva de que no persistió nada.
4. **Aprobación expresa de Carlo** para el merge, fijado al SHA ensayado.
5. Después del merge: comprobar en `supabase_migrations.schema_migrations` que la versión quedó registrada, y verificar con una conexión nueva.

**Reglas:**
- **No aplicar a mano** una migración que vaya a entrar por merge, porque la integración la intentaría aplicar otra vez.
- Si alguna vez se aplica a mano, registrar la versión en `schema_migrations` en la misma transacción.
- Cada versión registrada en la base debe existir en el repo, y viceversa. Si no coinciden, la integración falla.

Los lotes de datos (`scripts/conciliacion/*-aplicar.ts`) no cambian: siguen siendo manuales, con manifiesto, ensayo y aprobación.
