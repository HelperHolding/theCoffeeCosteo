# 07 · Plan técnico de la fase D (Sucursales → Ventas POS, piloto 612)

Rama: `feat/sucursales-en-vivo`, creada desde `main` @ `afd4ef0`. Sin commits, push ni PR hasta que Carlo lo pida.

## Decisiones técnicas

| Tema | Decisión | Motivo |
|---|---|---|
| Caché | `Map` de proceso con TTL, tope de entradas (LRU simple), agrupación de peticiones en vuelo por clave y semáforo de 4 llamadas simultáneas al proveedor | `unstable_cache` está reemplazado en Next 16 (doc local `unstable_cache.md`). Activar `cacheComponents`/`'use cache'` cambia el modelo global de rendering y afectaría a Costeo y CRM. **Limitación:** en Vercel cada instancia tiene su propio Map y se pierde en arranque en frío. Es aceptable con TTL ≤ 60 s para hoy |
| TTL | Ventana que incluye hoy: 45 s. Ventana cerrada de los últimos 3 días: 10 min. Ventana cerrada más antigua: 6 h. Lectura parcial o con error: 15 s | Las ventanas cerradas no se tratan como inmutables; los pedidos tardíos entran al expirar el TTL |
| Actualización manual | Solo vuelve a leer si la entrada tiene más de 15 s | Impide abusar del proveedor desde el botón |
| Route handlers | `GET` dinámicos (por defecto no se cachean en Next 16), `Cache-Control: private, no-store` | Respuesta personalizada por permisos; nunca va a una CDN |
| Clave de caché | `v1 \| company \| desde \| hasta \| modoTiempo` | Incluye las versiones de contrato y de interpretación horaria |
| Tiempo | Configuración por sucursal: `zona` (IANA) y `modoTiempo: 'local-etiquetada-z' \| 'utc'`. La 612 usa `America/Ciudad_Juarez` con `local-etiquetada-z` (hipótesis) | Sin doble conversión. No se tocan las utilidades del CRM |
| Corte comparativo | Segundo local actual (inclusivo), común a KPIs, curva e insights. Un pedido entra si `segundoLocal <= corte`; el mismo corte se aplica al día base (hoy − 7) | Evita comparar un minuto parcial contra uno completo |
| Frescura | `< 120 s` actualizado; `120–300 s` pendiente; `> 300 s` retrasado; fallo de lectura → error con hora de la última lectura buena | Clasificación sin huecos |
| Permisos | `perfil_modulos.modulo` admite `'sucursales'`. Nueva tabla `perfil_sucursales(user_id, company_id)`. Ambas obligatorias, también para admin | Cerrado por defecto; sin acceso a todas por inferencia |
| Habilitación | `lib/sucursales/config.ts` declara las sucursales operables (612: MXN, zona, modo, lookerStoreId 477). Acceso = permiso ∩ configuración ∩ identidad verificada contra `/company/list/all` | Una tienda sin configuración no se ofrece como operativa |
| Respuesta de denegación | Sin sesión → 401. Perfil inactivo o sin módulo → 403. Company ajena, no configurada o inválida → 404 genérico. Siempre **antes** de consultar caché o proveedor | Sin filtración de nombres |
| Gráficas | SVG propio con `<table>` equivalente | Sin dependencias nuevas |
| Agente Ctrl J | No hay agente en Sucursales; el `Marco` lo muestra solo en Costeo y CRM | Default 9 |

## Contratos (route handlers, todos `GET`)

- `/api/sucursales/[companyId]/vivo?origen=todos|mostrador|app`
  `{ sucursal, origen, hoy: {fecha, corte}, base: {fecha}, lectura: {leidoEn, completo, avisos[]}, kpis, comparativo, curva[24], ritmo, ultimoPedido, productosTop[5], ultimosPedidos[10], pagos[], descuentos, insights[], conciliacion }`
- `/api/sucursales/[companyId]/productos?desde&hasta&origen` (rango ≤ 31 días)
  `{ ventana, lectura, productos[], customs[], totales, conciliacion }`
- `/api/sucursales/[companyId]/pedidos?desde&hasta&origen&pago&pagina` (rango ≤ 7 días, 25 por página)
  `{ ventana, lectura, total, pagina, paginas, pedidos[]: {id, hora, fecha, ventaCent, descuentoCent, origen, pago, lineas[{nombre, codigo, importeCent, descuentoPct, customs[]}]}}`
  El drawer usa estas líneas. No hay endpoint por pedido.
- Nunca se envía `refundId`, `netAmout`, `percentageOfTransfer`, token, headers ni payload crudo.
- Validación: `companyId` entero positivo; fechas `YYYY-MM-DD` reales; `desde ≤ hasta`; rango máximo; `origen`/`pago` de una lista cerrada. Un parámetro inválido → 400 con mensaje genérico.

## Tareas

1. `lib/sucursales/config.ts`, `tiempo.ts`, `cache.ts` (con pruebas: zona IANA, horario estacional, frescura y TTL).
2. `lib/sucursales/proveedor.ts` (server-only).
   - Base fija; paginación por `totalPages`; topes de 20 páginas, 10,000 filas y 25 s.
   - Deduplicación; verificación de `companyId`; detección de página repetida, página vacía inesperada y total cambiante (un reintento completo).
   - Reintentos 429/5xx/red/timeout con backoff y `Retry-After`; 401/403 → `credenciales-proveedor`.
   - Pruebas con `fetch` inyectado.
3. `normalizar.ts`.
   - Validación zod; importes en centavos; hora local según modo; origen `mostrador | app | desconocido`.
   - Un registro inválido se excluye y marca la lectura como incompleta.
4. `metricas.ts`.
   - Funciones puras: resumen, corte, curva, comparativo, ritmo, productos y customs, pagos, descuentos, insights y conciliación.
   - Pruebas: centavos; gross = líneas + customs; descuento %/monto; base cero; 100 %.
5. `acceso.ts` y `sesionSucursales()`.
   - Migración `20261022000020_sucursales_acceso.sql`.
   - Pruebas PGlite: CHECK, RLS, sin autoasignación, OAuth bloqueado.
   - Pruebas de rutas: denegación sin llamadas al proveedor, también con caché caliente; revocación.
6. Registro del módulo: `modulos.ts`, `navegacion.tsx`, `marco.tsx` (sin agente), `tarjetas-modulos.tsx`.
7. Route handlers `vivo`, `productos`, `pedidos`.
8. UI (`components/sucursales/*`, `app/(sucursales)/sucursales/…`).
   - Directorio, contexto compartido y filtro de origen.
   - Pestañas En vivo, Productos y Pedidos con drawer.
   - Refresco de 60 s solo con pestaña visible, sin solapes, descarte de respuestas viejas por clave.
   - Estados: carga, vacío, error, retrasado, parcial y sin permiso. Pruebas de componentes.
9. Arnés visual (`tests/portal/vista`) con fixtures sintéticos para QA a 375, 768 y 1280 px.
10. `scripts/sucursales/conciliar.ts`: corre el pipeline real de servidor sobre un día cerrado de la 612 y compara contra una extracción GET independiente.
11. Verificación final: `npm test`, `typecheck`, `build`, `format:check`, `git diff --check`; recorrido local. Documento `08-RESULTADO-FASE-D.md`.

## Criterios de salida

- Las denegaciones no llaman al proveedor (spy de `fetch` en 0), ni siquiera con caché caliente de otro usuario.
- Σ venta = Σ productos atribuibles en la conciliación real del día cerrado, con extracción completa.
- Una lectura parcial no produce comparativos ni la etiqueta «completo».
- Cambiar de sucursal, origen o periodo no muestra datos de la clave anterior.
- Costeo y CRM sin cambios de comportamiento: sus pruebas existentes siguen pasando.
