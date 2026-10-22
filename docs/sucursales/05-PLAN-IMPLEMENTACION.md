# 05 · Plan de implementación (fases D–F, pendiente de aprobación)

Nada de esto está implementado. Requiere la decisión de Carlo sobre la propuesta (04) y los puntos abiertos (06).

## Componentes previstos

| Capa | Archivo previsto | Contenido |
|---|---|---|
| Cliente del proveedor | `lib/sucursales/proveedor.ts` (`server-only`) | `listarSucursales()` y `pedidos(companyId, desde, hasta)`. Base fija `https://api.thecoffee.jp`, token `THECOFFEE_API_TOKEN` solo en el servidor. `companyId` validado como entero y contra la lista. Paginación con `totalPages`, `perPage=500`, deduplicación por `id`, tope de páginas y tiempo, timeout, reintentos solo 429/5xx. Resultado con `{ pedidos, completo, totalItems, leidoEn, errores }` |
| Normalización | `lib/sucursales/normalizar.ts` | `netAmout → neto`, `createdAt → { fechaLocal, horaLocal }` sin conversión de zona (ver 03), importes en centavos, `origen: 'mostrador' \| 'app'` desde `fromSmartphone` |
| Métricas | `lib/sucursales/metricas.ts` | Funciones puras al estilo `lib/portal/tablero.ts`: venta, pedidos, ticket, acumulado al minuto, comparativo, por hora, productos, customs, pagos, descuentos, insights |
| Sesión y permisos | `lib/supabase/sesion.ts` → `sesionSucursales()` | Acceso al módulo y conjunto de company_id permitidos |
| Rutas | `app/(sucursales)/sucursales/{layout,page}.tsx`, `[companyId]/page.tsx` | Server components con `force-dynamic` |
| Datos en vivo | `app/api/sucursales/[companyId]/hoy/route.ts` | JSON agregado (no pedidos crudos completos) para el refresco cada 60 s. Valida sesión y permiso de la sucursal |
| UI | `components/sucursales/*` | Encabezado de contexto, KPIs, curva acumulada SVG, mapa de calor SVG, tabla de productos, lista de últimos pedidos, drawer |
| Registro | `modulos.ts`, `navegacion.tsx`, `marco.tsx`, `tarjetas-modulos.tsx`, `agentes.ts` | Entrada «Sucursales». Agente Ctrl J opcional: decidir si se oculta en esta fase |

## Datos y frescura (recomendación)

**Fase D (piloto): bajo demanda con caché corta en servidor, sin tablas de pedidos.**

- En vivo: 2 llamadas por refresco (hoy y el mismo día de la semana anterior). El día anterior es una ventana cerrada y se cachea 24 h.
- La caché de hoy dura 30–60 s por company_id. Se comparte entre usuarios **después** de validar el permiso, porque no contiene datos por usuario.
- Volumen piloto: unas 110 filas al día. Un día equivale a 1 llamada de 1–3 s.
- Tendencias de 4 semanas: unas 3,000 filas, que son 6 llamadas de 500 (unos 10 s). Para reducirlo, cada semana cerrada se cachea como inmutable (TTL largo). No se descarga un año por cada cambio de filtro.
- Mecanismo de caché: Next 16 no lo tiene habilitado en el repo. Antes de escribir código se revisará `node_modules/next/dist/docs/` (AGENTS.md) para elegir entre `'use cache'`/`cacheLife` y un `Map` en memoria del proceso. En Vercel la memoria no se comparte entre instancias, lo cual es aceptable para TTL de 60 s.

**Ampliación (fase E o posterior), si hacen falta más sucursales o historial largo:** persistencia incremental en Supabase.

- Tablas de pedidos, líneas y customs con upsert por `id`.
- Sincronización programada con relectura de los últimos 2–3 días.
- Bitácora de lecturas.
- Esto implica migraciones, cron e infraestructura, que requieren autorización explícita. No se decide ahora.

## Modelo de identidad

- `sucursales_api` (fase D o E): `company_id` (PK), `looker_store_id`, `nombre_api`, `crm_tienda_id` (nullable, FK a `crm_tiendas`), `zona` (IANA), `moneda`, `activa`.
  - La vinculación al CRM es por `looker_store_id = numero_tienda_jestor` y se confirma manualmente.
  - En la piloto puede vivir como configuración en código si se aprueba no migrar todavía.
- Acceso:
  - ampliar el CHECK de `perfil_modulos` con `'sucursales'`;
  - agregar `perfil_sucursales(user_id, company_id)` o un nivel «todas»;
  - RLS cerrado por defecto y política restrictiva sin OAuth, como en el CRM.

## Seguridad

- El token nunca llega al navegador. Las rutas solo aceptan `companyId` numérico permitido para el usuario; se rechazan destinos y rutas arbitrarios.
- Respuesta al navegador: agregados más los últimos N pedidos, sin `refundId`.
- Cambio de sucursal: cada respuesta lleva su `companyId` y las respuestas tardías de otra sucursal se descartan (AbortController y comparación de clave).

## Pruebas

- Unitarias con fixtures sintéticos, generados con la forma real y sin datos crudos:
  - paginación: `totalPages`, página vacía, página repetida, `totalItems` que cambia;
  - deduplicación;
  - fronteras de fecha;
  - centavos;
  - `grossAmount` = líneas + customs;
  - descuento %;
  - comparativo al minuto;
  - base cero;
  - errores 401/404/429/5xx y timeout.
- De rutas: sin sesión, sin módulo, `companyId` ajeno o manipulado → 401/403/404 sin llamar al proveedor.
- De componentes: estados vacío, error, atrasado y parcial; tabla equivalente a cada gráfica.
- DB (si hay migración): PGlite con el CHECK ampliado y las políticas.
- Conciliación: Σ del tablero = extracción completa de la misma ventana cerrada.
- Regresión: `npm test`, `typecheck`, `build`, `format:check`, más recorrido real de login, Costeo, CRM y Sucursales.

## Fases siguientes

| Fase | Contenido | Necesita autorización de |
|---|---|---|
| D | Cliente, normalización, métricas, «En vivo» + Productos + Pedidos para la 612, permisos del módulo | Aprobación de la propuesta. Migración del CHECK de `perfil_modulos` (cambio de infraestructura) |
| E | Tendencias; directorio con varias sucursales; validación acotada con una segunda sucursal; QA responsive y regresión | Elegir la segunda sucursal; decidir persistencia |
| F | Preview, revisión, producción y monitoreo | Autorización de despliegue |
