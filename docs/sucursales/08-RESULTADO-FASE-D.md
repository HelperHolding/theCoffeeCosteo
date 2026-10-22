# 08 · Resultado de la fase D (Sucursales → Ventas POS, piloto 612)

- Fecha: 2026-10-22.
- Rama local: `feat/sucursales-en-vivo` (desde `main` @ `afd4ef0`).
- **Sin commits, push, PR ni despliegue.** No se tocó Supabase remoto ni se otorgaron accesos.

## Qué se implementó

| Área | Archivos |
|---|---|
| Configuración de sucursal | `lib/sucursales/config.ts` |
| Tiempo y frescura | `lib/sucursales/tiempo.ts` |
| Caché TTL y semáforo | `lib/sucursales/cache.ts` |
| Cliente del proveedor (server-only) | `lib/sucursales/proveedor.ts` |
| Normalización | `lib/sucursales/normalizar.ts` |
| Métricas e insights | `lib/sucursales/metricas.ts` |
| Capa de datos (server-only) | `lib/sucursales/datos.ts` |
| Contratos | `lib/sucursales/contratos.ts` |
| Acceso | `lib/sucursales/acceso.ts`, `lib/sucursales/rutas.ts` |
| Sesión | `lib/supabase/sesion.ts` → `accesoSucursales()`, `sesionSucursales()` |
| Route handlers | `app/api/sucursales/[companyId]/{vivo,productos,pedidos}/route.ts` |
| Páginas | `app/(sucursales)/sucursales/{layout,page,loading}.tsx`, `[companyId]/page.tsx` |
| UI | `components/sucursales/*` (en-vivo, productos, pedidos, detalle-pedido, curva, estados, ventas-pos, use-lectura, formato) |
| Registro del módulo | `lib/portal/modulos.ts`, `components/portal/{navegacion,marco,tarjetas-modulos,pestanas}.tsx`, `lib/supabase/database.types.ts` |
| Migración (solo local) | `supabase/migrations/20261022000020_sucursales_acceso.sql` |
| Pruebas | `tests/portal/sucursales-{tiempo,proveedor,metricas,rutas,ui}.test.*`, `tests/db/sucursales.test.ts`, fixtures sintéticos |
| Arnés visual | `tests/portal/vista/sucursales.tsx` (`?sucursales[&estado=error\|parcial\|vacio]`) |
| Conciliación real | `scripts/sucursales/conciliar.ts` |

Cambios en código compartido:

- **`Marco`**: el agente Ctrl J ahora se muestra solo en Costeo y CRM. Sucursales no tiene agente.
- **`gruposDe()`**: usa un mapa por sección en lugar del ternario.
- **`Pestanas`**: acepta un callback opcional `alCambiar`. Sin él se comporta igual que antes.

## Decisiones aplicadas (defaults de esta entrega)

- **Ventas POS:** mostrador + App The Coffee, con filtro de origen global (KPIs, curva, pagos, productos y pedidos).
  - Rótulos: «POS · API The Coffee · MXN», «Hora local · America/Ciudad_Juarez» y «Rappi fuera del alcance».
  - El texto aclara que la API no identifica agregadores y que el CRM registra la tienda sin Rappi. No se presenta como garantía.
- **KPI principal:** «Venta cobrada» = Σ `grossAmount` en centavos. `netAmout`, `percentageOfTransfer` y `refundId` no salen del servidor.
- **Unidades:** se muestran «Líneas*» con la nota «Unidades = estimación: una línea por unidad; pendiente de confirmar».
- **Tiempo:** `createdAt` se interpreta en modo `local-etiquetada-z` para la 612 (hipótesis configurable por sucursal). «Hoy» y «ahora» se calculan con `America/Ciudad_Juarez`.
- **Corte común:** el segundo local actual, inclusivo, para KPIs, curva, ritmo e insights. Los pedidos con hora posterior al corte se informan aparte (reloj del POS adelantado).
- **Comparativo:** mismo día de la semana anterior hasta el mismo corte. Sin comparativos si alguna lectura está incompleta. «Sin base comparable» cuando la base es 0.
- **Frescura:** < 120 s «En vivo»; 120–300 s «Actualización pendiente»; > 300 s «Datos retrasados»; fallo → «Sin conexión con la API», con la hora de la última lectura buena.
- **Refresco:** cada 60 s solo con la pestaña visible, sin solapes. «Actualizar» fuerza la lectura solo si la entrada en caché tiene más de 15 s.
- **Caché:** `Map` de proceso con TTL y agrupación de peticiones simultáneas.
  - TTL: hoy 45 s; cerradas ≤ 3 días 10 min; antiguas 6 h; parciales o con error 15 s.
  - Clave: versión + company + ventana + modo + zona. **Limitación:** en Vercel no se comparte entre instancias ni sobrevive a arranques en frío.
- **Identidad:** cada lectura verifica contra `/company/list/all` que la company 612 tenga `lookerStoreId 477` (resultado en caché 6 h). Si no coincide, no se leen pedidos.

## Verificación

| Comando | Resultado |
|---|---|
| `npm test` | **314 pasan, 5 omitidas, 56/57 archivos.** Falla solo `tests/migracion/paridad.test.ts`, que es preexistente: necesita `datos/Modelo_Costeo_Corregido_2026.xlsx`, no versionado (README) |
| Pruebas nuevas de Sucursales | 63: 57 de portal + 6 de PGlite |
| `npm run typecheck` | OK. Hubo que regenerar `tsconfig.tsbuildinfo` (caché incremental, ignorado por Git), que conservaba tipos de rutas viejos |
| `npm run build` | OK. `/sucursales`, `/sucursales/[companyId]` y los 3 handlers son dinámicos; Costeo y CRM sin cambios |
| `npm run format:check` | Falla en **183 archivos de todo el repo** por finales de línea: el checkout usa CRLF (`core.autocrlf=true`) y Prettier espera LF. Los archivos de esta fase pasan `prettier --check --end-of-line auto`; en Git se guardan en LF |
| `git diff --check` | OK |

Qué cubren las pruebas:

- Paginación por `totalPages`, deduplicación y tope de páginas.
- Página repetida o vacía; total cambiante, con un reintento.
- Registros sin id o de otra company.
- 401/403 sin reintento; 404; 429 con `Retry-After`; 5xx agotado; error de red; timeout.
- Respuesta sin envelope; token ausente; token solo en header.
- Centavos; gross = líneas + customs; descuento en % y en monto; inválidos excluidos (no cero); pedido fuera de ventana.
- Corte inclusivo; curva; base cero; insights solo con lecturas completas.
- Zona de Juárez con horario estacional, distinta de CDMX; frescura en sus fronteras.
- Caché: TTL, agrupación de peticiones y tope; semáforo.
- **Rutas:** sin sesión 401; perfil inactivo 403; sin módulo (aunque sea admin) 403; company ajena, no configurada, manipulada, `0612` o con asignaciones ilegibles 404.
  - **Cero llamadas al proveedor con caché caliente.** La revocación corta el acceso aunque haya caché.
  - Caché compartida tras autorizar; filtro de origen consistente.
  - El error del proveedor no se muestra como venta cero; la identidad discrepante bloquea.
  - Validación 400; paginación de 25.
- **PGlite:** CHECK de `perfil_modulos`; `company_id > 0`; RLS propia o admin; sin autoasignación (ni admin); OAuth bloqueado; `anon` sin acceso; bitácora.
- **UI:**
  - KPIs y rótulos; cambio de origen sin datos residuales y con descarte de respuestas tardías.
  - Error ≠ $0; 404 sin «Reintentar»; refresco solo visible y sin solapes.
  - Paginación y detalle del pedido; periodo inválido sin peticiones.

### Conciliación con datos reales (GET acotado, 2026-10-22 18:39 UTC)

`npx tsx --conditions=react-server scripts/sucursales/conciliar.ts 612 2026-10-21 --vivo`

| Día cerrado 2026-10-21 | Extracción independiente (perPage 100, sin el cliente del portal) | Pipeline del portal |
|---|---|---|
| Pedidos únicos | 96 (`totalItems` 96) | 96, lectura **completa** |
| Venta (Σ gross, centavos) | 1,824,890 | 1,824,890 |
| Σ importe atribuible por productos | — | 1,824,890 |
| Diferencias | — | **0** venta vs independiente · **0** venta vs productos · 0 pedidos que no cuadran |

«En vivo» real a las 12:39:35 hora de Juárez:

- Venta cobrada $6,912.20 y 37 pedidos, contra $6,002.00 y 34 pedidos el jueves 15 a la misma hora: +15.2 % en venta y +8.8 % en pedidos.
- Ambas lecturas completas; conciliación con diferencia 0.

Volumen de llamadas reales: unos 8 GET.

### QA visual (arnés con datos sintéticos)

- Recorrido de En vivo, Productos (con fila expandida) y Pedidos (con detalle del pedido).
- Estados: error y lectura parcial. Vacío y sin permiso quedaron cubiertos en las pruebas de componentes.
- Anchos: escritorio, 375 px sin scroll horizontal y 768 px por responsive.
- Sin errores en consola.
- Ajustes hechos durante el QA: etiqueta de base duplicada («jueves jue 15») y formato de % en las frases.

### Lo que NO se probó

- **Recorrido autenticado real** (login → Inicio → Sucursales) contra Supabase: la base remota no tiene la migración 20 ni asignaciones. Por diseño, el portal falla cerrado y redirige a Inicio. No se alteró la autorización para demostrarlo.
- Los recorridos de Costeo y CRM se verificaron indirectamente (sus pruebas pasan y el build es correcto), no con un login real en esta fase.
- Concurrencia real contra la API y límites de servicio. No se observaron 429.
- Comportamiento real después del cambio de horario del 1-nov.

## Hallazgos nuevos

- Hay productos de combo que llegan como una sola línea con nombre compuesto (p. ej. «Iced Latte + Ham & Cheese Sandwich»). El ranking los muestra tal cual; separarlos requiere catálogo o reglas del proveedor.

## SQL preparado (NO aplicado)

Archivo: `supabase/migrations/20261022000020_sucursales_acceso.sql`.

- Amplía `perfil_modulos_modulo_check` a `('crm','sucursales')`.
- Crea `perfil_sucursales(user_id, company_id)` con RLS de lectura propia o admin, `revoke` a anon y authenticated (solo `select`), política restrictiva sin OAuth y bitácora.

### Pasos para habilitar (requieren tu autorización explícita)

1. **Variables en Vercel** (Production y Preview, solo servidor): `THECOFFEE_API_TOKEN`. Nunca como `NEXT_PUBLIC_*`.
2. **Migración remota**: `supabase db push`, o pegar el archivo en el SQL Editor del proyecto de producción. Antes de aplicarla:
   - comprobar que el nombre del constraint es `perfil_modulos_modulo_check`:
     ```sql
     select conname from pg_constraint where conrelid = 'public.perfil_modulos'::regclass;
     ```
   - El código puede desplegarse antes que la migración: falla cerrado.
3. **Accesos** (SQL Editor, por persona; sustituir el correo):
   ```sql
   insert into public.perfil_modulos (user_id, modulo, nivel)
   select id, 'sucursales', 'lectura' from auth.users where email = '<correo>';
   insert into public.perfil_sucursales (user_id, company_id)
   select id, 612 from auth.users where email = '<correo>';
   ```
4. Commit, push y PR de la rama, revisión, preview de Vercel y recorrido real autenticado. Después, merge a `main` (producción).

### Reversión

- **Código:** revertir el merge o el commit de la rama. Sin el código, las tablas nuevas quedan inertes; no hace falta tocar datos.
- **Accesos:** quitar el acceso de una persona sin borrar el historial:
  ```sql
  delete from public.perfil_sucursales where user_id = (select id from auth.users where email = '<correo>');
  delete from public.perfil_modulos where modulo = 'sucursales' and user_id = (select id from auth.users where email = '<correo>');
  ```
  Esto es manual; la bitácora conserva el rastro.
- **Esquema:** solo si se decide retirar el módulo por completo. Se ejecuta manualmente, nunca de forma automática:
  - antes, quitar todas las filas `sucursales` de `perfil_modulos`;
  - después:
    ```sql
    alter table public.perfil_modulos drop constraint perfil_modulos_modulo_check,
      add constraint perfil_modulos_modulo_check check (modulo in ('crm'));
    drop table public.perfil_sucursales;
    ```
  - Requiere confirmar antes que no hay filas que conservar.

## Pendientes

- Confirmar con The Coffee Brasil: zona de `createdAt`, moneda, si una línea equivale a una unidad, Rappi y agregadores, `refundId` y devoluciones, límites de llamadas.
- Revalidar la interpretación horaria después del 1-nov-2026.
- Normalizar finales de línea para que `npm run format:check` pase en Windows (`.gitattributes` con `eol=lf`). Decisión aparte, porque afecta a todo el repo.
- **Fase E:** Tendencias (4 semanas, mapa día×hora), segunda sucursal (agregarla a `config.ts` tras validar identidad, moneda y zona), evaluar persistencia si crece el uso y caché compartida entre instancias.

## Cambios posteriores (2026-10-22, misma rama)

**Colores de datos** (skill dataviz; paletas validadas con `validate_palette.js` sobre `#ffffff`):

- Origen: Mostrador violeta y App naranja.
- Formas de pago: Tarjeta aqua, Efectivo amarillo, Monedero magenta, Saldo verde.
- Gráficas: hoy en azul, base en gris.
- Variaciones: ▲/▼ en verde/rojo.
- Etiquetas por tipo de personalización.

Gráficas nuevas o rehechas, todas con tooltip en hover y teclado y con tabla equivalente:

- curva acumulada con marca «Ahora»;
- pedidos por hora (columnas pareadas);
- barras apiladas de pagos y origen;
- ranking con barras.

Archivos: `components/sucursales/{colores,graficas}.tsx`. Se agregó `origenes` y `porHora` a `RespuestaVivo`, y `metodo` a `PedidoVista`.

**Tema «muro de sucursal»** en todo el portal, aprobado por Carlo:

- Muro blanco cálido y lambrín de madera en la mitad inferior (`public/madera.svg` + `.muro` en `globals.css`).
- Encabezado como letrero luminoso con la marca impresa (`.letrero`). La marca no aparece cuando hay botones y se oculta en móvil.
- Placas blancas (`.placa`) para todo texto que quedaría sobre la madera, según una auditoría de Costeo, CRM y Sucursales.
- Fichas de madera en los íconos de KPI y sombra cálida en las tarjetas grandes.
- El menú lateral sigue negro.

Verificación:

- Pruebas: 314 pasan (falla solo la de paridad preexistente).
- `typecheck` y `build` OK.
- QA visual en el arnés: Sucursales, Inicio, CRM, Kanban, expediente y catálogo; móvil a 375 px sin scroll horizontal.
