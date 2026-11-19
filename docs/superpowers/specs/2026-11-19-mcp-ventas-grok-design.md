# Ventas nacionales de solo lectura en el MCP, para Grok — diseño

Fecha: 2026-11-19. Estado: propuesto.

## 1. Objetivo

Que **Grok (grok.com)**, conectado como **conector MCP remoto** al servidor que ya existe en
`https://the-coffee-costeo.vercel.app/mcp`, pueda consultar **solo en lectura** las ventas de las sucursales
The Coffee de México:

- totales por sucursal y día (mostrador / app / Rappi), incluido **hoy en vivo** (corte cada 10 min);
- curva de ventas por hora;
- ventas por producto;
- métricas del tablero BI (metas, ticket, punto de equilibrio, métodos de pago).

Éxito: desde un chat de Grok se pregunta «¿cuánto vendió cada sucursal ayer y qué productos fueron el top?» y
los números coinciden con el Tablero de México y el tablero BI del portal para la misma cuenta y fechas.

### Supuestos acordados

- Grok inicia sesión con una **cuenta del portal**; ve solo las sucursales asignadas a esa cuenta
  (`perfil_sucursales` + módulo `sucursales` o `bi`). «Nacional» = una cuenta con todas asignadas. No hay
  llave maestra ni acceso anónimo.
- La empresa ya aprobó enviar estos datos a xAI.
- Fuera de alcance: escritura de cualquier tipo, SQL libre, datos de clientes finales, costos (ya los dan las
  herramientas existentes), endpoints REST con llave de API.

## 2. Estado actual (lo que hay y lo que lo impide)

| Pieza | Hoy | Problema para Grok |
|---|---|---|
| `app/mcp/route.ts`, `lib/mcp/*` | MCP con 6 herramientas de recetas/costos, OAuth 2.1 de Supabase con registro dinámico | No tiene herramientas de ventas |
| `lib/mcp/consentimiento.ts` | `retornoClaude` solo acepta `claude.ai` / `claude.com` `/api/mcp/auth_callback` | El consentimiento de Grok se rechaza |
| `sucursales_acceso(company)`, `bi_acceso(company)` | Exigen `auth.jwt()->>'client_id' is null`: **ningún token OAuth ve ventas** | Las RPC de ventas devuelven vacío para el MCP |
| `perfil_sucursales` | Política restrictiva `sucursales_sin_oauth` | El MCP no puede listar las sucursales de la cuenta |
| `sucursales_resumen_dia` | Lo llena el corte; tiene `origenes`, `horas`, `productos` por sucursal/día | Sin acceso directo (RLS sin políticas, revoke) |

`sucursales_acceso` también protege RPC de **escritura** (ajustes de consumo, portal Rappi). Por eso **no se
afloja**: la apertura a OAuth se hace con un predicado nuevo usado solo por funciones de lectura.

## 3. Fase 0 — verificar Grok (bloqueante)

Antes de escribir herramientas, confirmar con una cuenta real:

1. grok.com permite agregar un conector MCP remoto por URL con OAuth y registro dinámico de clientes (DCR).
2. La URL de retorno (`redirect_uri`) exacta que usa Grok.
3. Que Grok maneja `structuredContent` o, al menos, el `text` JSON que ya devuelven las herramientas.

Cómo: agregar el conector en grok.com apuntando a `/mcp` de producción. Si Grok llega a la pantalla de
consentimiento (que hoy lo rechazará), ya quedó probado que hace descubrimiento OAuth y registro dinámico; la
`redirect_uri` se lee del cliente recién registrado en Supabase → Authentication → OAuth Apps. Resultado: la
`redirect_uri` real queda escrita en la sección 5.3 de este spec. El punto 3 se comprueba en la verificación
real del final.

**Si Grok no soporta MCP remoto con OAuth, este diseño se detiene** y se vuelve a la lluvia de ideas
(no se cae a REST con llave en la URL sin una nueva decisión).

## 4. Arquitectura

```
Grok ──OAuth (Supabase)──► /oauth/consent  (callback de Grok permitido)
  │
  └─MCP──► app/mcp/route.ts ─► autenticarMcp(token)  (sin cambios)
                └─► registrarHerramientas: 6 existentes + 4 de ventas (lib/mcp/ventas.ts)
                        └─► RPC de solo lectura en Postgres:
                              mcp_ventas_sucursales()
                              sucursales_tablero_hoy / sucursales_tablero_periodo   (ya existen)
                              mcp_ventas_dias(companias, desde, hasta, horas)        (nueva)
                              bi_opciones / bi_tablero                               (ya existen)
                        todas filtran con ventas_lectura(company, modulo)
```

Los números salen de las mismas RPC que los tableros; el código del MCP solo valida, arma parámetros y
convierte centavos a pesos.

## 5. Componentes

### 5.1 Base de datos — migración `2026112000006x_mcp_ventas.sql`

1. **`mcp_ventas_clientes`** — lista blanca de clientes OAuth que pueden leer ventas:
   `client_id text primary key, nombre text not null, creado_en timestamptz default now()`.
   RLS activo sin políticas; `revoke all` de `anon, authenticated`. Solo el administrador inserta (SQL editor).
   Con DCR el `client_id` nace al conectar; por eso se autoriza después de la primera conexión (ver 5.4).
2. **`ventas_lectura(p_company integer, p_modulo text) returns boolean`** — `security definer`, `stable`:
   - sesión normal (`client_id` nulo): igual que hoy → `sucursales_acceso(p_company)` si el módulo es
     `sucursales`, `bi_acceso(p_company)` si es `bi`;
   - token OAuth: `client_id` está en `mcp_ventas_clientes` **y** perfil activo **y** módulo asignado
     **y** sucursal asignada (misma consulta que `sucursales_acceso` / `bi_acceso`, sin la condición de
     `client_id`).
3. **Cambiar el filtro solo en las RPC de lectura** a `ventas_lectura(...)`:
   `sucursales_tablero_hoy`, `sucursales_tablero_periodo` (módulo `sucursales`), `bi_opciones` y
   `bi_tiendas_filtradas` (módulo `bi`; `bi_tablero` filtra a través de esta última).
   `create or replace` con el cuerpo vigente (última migración que las define) y únicamente el predicado
   cambiado. Las RPC de escritura siguen
   con `sucursales_acceso`.
4. **`mcp_ventas_sucursales() returns jsonb`** — `[{company_id, nombre, modulos: ['sucursales','bi']}]` de las
   sucursales de la cuenta donde `ventas_lectura` es verdadero en algún módulo. Sustituye la lectura de
   `perfil_sucursales`, que sigue cerrada a OAuth.
5. **`mcp_ventas_dias(p_companias integer[], p_desde date, p_hasta date, p_horas boolean) returns jsonb`** —
   lee `sucursales_resumen_dia` de las sucursales con `ventas_lectura(c,'sucursales')`; máximo 120 días, o 7 si
   `p_horas`. Devuelve por sucursal y día: `completa`, `corte_segundo`, `origenes` y, si `p_horas`, `horas`.
   Los productos ya vienen agregados en SQL por `sucursales_tablero_periodo` (no se mandan por día).
6. `grant execute` de las funciones nuevas solo a `authenticated`.

### 5.2 Herramientas MCP — `lib/mcp/ventas.ts`

Se registran con el mismo `registrar` y las mismas anotaciones (`readOnlyHint: true`) de
`lib/mcp/herramientas.ts`; `crearConsultas` concatena `crearConsultasVentas(db)`. Montos en **MXN con dos
decimales** (`venta_cent / 100`). Fechas `YYYY-MM-DD` en la zona local de cada sucursal. `sucursales` opcional
(lista de `company_id`); si se omite = todas las de la cuenta; ids no accesibles se ignoran y se reportan en
`ignoradas`.

| Herramienta | Entrada | Salida | Fuente |
|---|---|---|---|
| `ventas_sucursales` | — | sucursales visibles, zona horaria, módulos | `mcp_ventas_sucursales` + config de `lib/sucursales` |
| `ventas_resumen` | `desde?`, `hasta?` (≤120 días), `sucursales?` | sin fechas: hoy en vivo por sucursal (venta, pedidos, descuento por canal, `corte_segundo`, `completa`, semana pasada a la misma hora), armado con `armarHoy` de `lib/sucursales/resumen.ts`. Con fechas: `agrupar` = sucursal (por omisión), dia o sucursal_dia (paginado) | `sucursales_tablero_hoy` / `mcp_ventas_dias` |
| `ventas_por_hora` | `fecha`, `sucursales?` | 24 horas × canal: pedidos y venta, por sucursal y total | `mcp_ventas_dias` |
| `ventas_por_producto` | `desde`, `hasta` (≤120 días), `sucursales?`, `canal?`, `pagina`, `limite` (≤50) | productos ordenados por importe: código, nombre, líneas, importe, en cuántas sucursales se vendió; paginado | `sucursales_tablero_periodo.productos` |
| `ventas_bi` | `desde`, `hasta`, `sucursales?` | la respuesta de `bi_tablero` (metas, ticket, punto de equilibrio, pagos) con montos en MXN | `bi_opciones` + `bi_tablero`, mismos filtros que `/api/bi/tablero` |

Reglas:
- Nunca se estima: si un día no está completo se devuelve `completa: false` y la descripción de la herramienta
  lo dice.
- Rango inválido o demasiado largo → error de validación con el límite en el mensaje.
- Si la cuenta no tiene sucursales visibles, la herramienta responde un error claro:
  «Este conector no tiene ventas autorizadas. client_id: <id>» (para que el administrador lo dé de alta).
- Las descripciones van en español y explican canales, zona horaria y que los montos son MXN con IVA, igual que
  el portal.

Las rutas del portal no cambian: el MCP llama las mismas RPC y reusa `armarHoy`, `aJsonRpc` y `enZona`. Lo poco
que las rutas hacen antes de la RPC (fecha local de hoy por sucursal, filtros BI mínimos) se repite en
`lib/mcp/ventas.ts` en pocas líneas, sin mover código del portal.

### 5.3 Consentimiento OAuth — `lib/mcp/consentimiento.ts`, `app/oauth/consent/*`

- `retornoClaude` → `retornoConector`; `callbacks` incluye las de Claude y la de Grok confirmada en la fase 0
  (`<redirect_uri de Grok — se llena en la fase 0>`).
- Textos de «Claude» → «el conector» en la pantalla y los errores; la pantalla muestra el nombre de la
  aplicación OAuth que pide acceso.

### 5.4 Alta y revocación (operación)

1. Conectar Grok → consentir con la cuenta del portal.
2. Llamar `ventas_sucursales`; responde el `client_id` no autorizado.
3. Administrador: `insert into mcp_ventas_clientes (client_id, nombre) values ('<id>', 'Grok');`
4. Revocar: borrar la fila (efecto inmediato en cada consulta) y/o revocar la autorización en Supabase.

Se documenta en `docs/mcp/grok.md`.

## 6. Seguridad

- Lectura únicamente: las RPC nuevas son `stable` y no escriben; las políticas `oauth_sin_*` existentes no
  cambian; ninguna RPC de escritura cambia su predicado.
- Doble llave para OAuth: cuenta con la sucursal asignada **y** cliente en la lista blanca. Un cliente OAuth
  nuevo (otro conector registrado dinámicamente) no ve ventas hasta que se autoriza.
- Claude conectado hoy tampoco ve ventas salvo que su `client_id` se agregue: el comportamiento actual no cambia.
- Límites de rango (120 días; 7 con horas) y de página (50) para acotar el volumen enviado a xAI.

## 7. Pruebas

- **DB (`tests/db/mcp-ventas.test.ts`, arnés existente):** `ventas_lectura` con sesión normal, token OAuth sin
  lista blanca (falso), con lista blanca y sin sucursal asignada (falso), con todo (verdadero), perfil inactivo
  (falso); las RPC de escritura siguen rechazando OAuth autorizado; `mcp_ventas_dias` rechaza >120 días (7 con horas) y
  omite sucursales ajenas; `sucursales_tablero_periodo` sigue igual para sesión normal.
- **Unidad (`tests/mcp/ventas.test.ts`):** validación de entradas, centavos → pesos, agregado por hora y top de
  productos con paginado, `ignoradas`, error de cliente no autorizado.
- **Rutas:** las pruebas existentes de `/api/sucursales/tablero` y `/api/bi/tablero` siguen pasando.
- **Real (manual, documentado):** Grok conectado responde el total de ayer de 2 sucursales y coincide con el
  Tablero de México.

## 8. Orden de entrega

1. Fase 0 (verificar Grok) → actualizar 5.3.
2. Migración + pruebas DB.
3. `lib/mcp/ventas.ts` + pruebas.
4. Consentimiento para Grok.
5. `docs/mcp/grok.md`, `supabase db push` (lo corre el administrador), alta del `client_id`, verificación real.
