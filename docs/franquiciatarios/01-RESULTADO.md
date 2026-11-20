# Módulo Franquiciatarios: resultado de la ejecución (piloto Essentia)

> Rama `feat/franquiciatarios` (worktree `theCoffeeCosteo-franquiciatarios`, desde `origin/main` 84e6b6a).
> Fecha: 2026-11-19/20.
> **Estado:** PR en borrador. La migración 75 está **sin aplicar** y no hay usuarios creados en producción. Ambas cosas
> esperan el OK de Carlos.

## 1. Fases

| Fase                     | Estado                 | Entregable                                                                                                  |
| ------------------------ | ---------------------- | ----------------------------------------------------------------------------------------------------------- |
| F0 Exploración y plan    | ✅ Aprobado por Carlos | Plan con el modelo de roles, tablas y RLS, rutas, piezas reutilizadas y corte del día                       |
| F1 Base del módulo       | ✅                     | Migración 75, `accesoFranquiciatarios`, marca The Coffee, navegación, rutas `/franquiciatarios/[companyId]` |
| F2 Baristas y checklists | ✅                     | Nombres, plantilla v1 (Excel), checklist con Sí/No, firmas, incidencias, avisos, correcciones               |
| F3 Ventas y tira         | ✅                     | `/api/franquiciatarios/[id]/{vivo,pedidos,tira,avisos}`, sin neto, costos ni márgenes; tira de 80 mm y A4   |
| F4 Propuesta del gerente | ✅                     | `02-PROPUESTA-GERENTE.md` y prototipo en el arnés (`?franquiciatarios&vista=propuesta&rol=gerente`)         |
| F5 Control y PR          | ✅                     | Revisión de código (nivel high), respaldo, ensayo con ROLLBACK y PR en borrador                             |
| Producción               | ⏸ Requiere OK          | Aplicar la 75, crear usuarios de Essentia y verificar con cada rol                                          |

## 2. Decisiones

- **Roles.**
  - El franquiciatario y el gerente usan `perfiles.rol = 'franquiciado'`, que ya existía y ya estaba fuera de Costeo
    por RLS desde la migración 44.
  - La cuenta de baristas usa el rol nuevo **`tienda`**, también fuera de Costeo; `tieneCosteo` falla cerrado.
  - El rol dentro del módulo se guarda por sucursal en **`franq_miembros`** (`franquiciatario`, `gerente` o
    `barista`). Un trigger impide que la cuenta `tienda` tenga otro rol que barista, y que una persona sea barista.
  - **Admin del módulo** es quien tiene la fila `perfil_modulos` de `franquiciatarios` con nivel `desarrollador`. Ve
    todas las sucursales configuradas y actúa como gerente.
- **Acceso.**
  - Hacen falta la fila del módulo y una membresía activa. Ningún token OAuth (MCP) entra.
  - Otra sucursal responde 404; sin el módulo, 403 (en páginas, redirige a Inicio).
  - Las políticas usan `franq_es_admin()`, `franq_companias()` y `franq_tiene_modulo()` dentro de `(select …)`, que
    se evalúan una vez por consulta (initPlan). La guardia de lecturas del repo ya reconoce `franq_*`.
- **Inmutabilidad.**
  - Respuestas, firmas, checklists, incidencias, secciones y puntos tienen triggers que rechazan UPDATE y DELETE,
    también para `service_role` y el admin.
  - Los baristas no se borran; solo cambian de nombre o de estado activo.
  - Las plantillas solo cambian `vigente`. Cualquier cambio de contenido es una versión nueva, así que lo ya llenado
    no cambia.
- **Correcciones.**
  - Cambiar una respuesta antes de firmar crea un renglón nuevo con `corrige_id`.
  - Con la sección firmada, solo el gerente, el franquiciatario o el admin corrigen, y con motivo.
  - En días anteriores corrigen con `franq_corregir` desde el checklist del día o desde Avisos.
- **Trazabilidad (D4).** Cada registro guarda el nombre declarado (copia), `barista_id`, la cuenta (`auth.uid()`),
  la hora del servidor, `session_id` del JWT y el user-agent. Para agregar un PIN después basta una columna
  `pin_hash` en `franq_baristas`, sin migrar registros.
- **Día de operación.** Cambia a las **4:00 de Ciudad de México**, como en Dodo, en `franq_dia_operacion()` y
  `diaOperacion()`. **Pendiente de confirmar con Carlos.**
- **Ventas.**
  - Usan las mismas funciones de Sucursales (`leerVentana`/`leerDias`, `conRappi`, `construirVivo`,
    `construirPedidos`, `productos`, `pagos` y `conciliar`).
  - Rappi del portal y el catálogo de nombres se leen con la llave de servicio, **después** de autorizar la sucursal.
    La razón: la cuenta de baristas no tiene el módulo Sucursales, que es lo que exigen sus RPC.
  - `sinDatosSensibles` quita cualquier clave `neto*`, `costo*`, `margen*`, `utilidad*` o `comision*`.
  - Las ventas cubren hoy y los 6 días anteriores.
- **Tira.**
  - Es para el **día calendario de la tienda**, igual que en Sucursales. Por omisión sale el día de operación, así
    que a las 00:30 se imprime el de ayer.
  - Si el día no ha cerrado, sale marcada **PARCIAL** con la hora de corte.
  - Hay CSS de impresión para 80 mm y A4. El PDF se genera con «Guardar como PDF» del navegador, sin dependencias
    nuevas.
- **Marca (D8).** `marcaDe(rol)` muestra The Coffee a `franquiciado` y `tienda`. Los usuarios internos siguen viendo
  Helper Holding. El login sigue siendo de Helper Holding porque es anterior a saber quién entra.
- **Cambios a módulos existentes (sin alterar su comportamiento).**
  - `EnVivo` y `Pedidos` reciben `base`, `conNeto` y `diasAtras`, con los mismos valores por omisión que antes.
  - `secciones.tsx` exporta `opcionesOrigen` y `nombreOrigen`.
  - `Marco` y la navegación aceptan `franquicia`.
  - `sesion()` manda la cuenta `tienda` a `/franquiciatarios`. Inicio redirige ahí a quien solo tiene ese módulo.

## 3. Estado de las migraciones (comprobado en solo lectura, 2026-11-19)

- La base y el repo tenían 64 versiones cada uno, sin faltantes. La última registrada es la `20261119000073`
  (mcp_ventas).
- ⚠️ **Hallazgo ajeno a este PR.** En `main` hay dos archivos con la versión `20261119000072`:
  - `comercializadora_ovs` sí está registrada en producción.
  - `bi_metas_pe` (PR #164) **no se aplicó**: en producción no existen `bi_metas_diarias`, `bi_recalcular_metas` ni
    `bi_metas.fecha_apertura`.
  - El PR #165 la renombra a la 73, que ya ocupa `mcp_ventas`, así que **tiene que pasar a la 74**.
- Este PR usa la **75** para dejarle la 74 a ese arreglo.
- **Hecho el 2026-11-20 (con el OK de Carlos para arreglar #165 primero).**
  - #165 ahora pasa la migración de BI a la **`20261120000074_bi_metas_pe.sql`**, con un merge de `main` y sin
    reescribir historia.
  - Sus pruebas de BI, MCP y las guardias pasan: 89/89.
  - Se ensayó en producción con ROLLBACK, sha256 `6c3294785a8f…`. No persistió nada y `bi_tablero` quedó idéntico.
  - El respaldo está en `Respaldos/thecoffee-supabase/2026-11-20-migracion-74-bi-antes.sql`. Script:
    `scripts/franquiciatarios/ensayo-74-bi.ts`.
- **El check «Supabase Preview» de este PR falla** con «duplicate key… (version)=(20261119000072)». Es la 72
  duplicada que viene de `main`, no la 75. Se resuelve cuando #165 entre a `main` y se traiga `main` a esta rama.
- Mientras `main` tenga la 72 duplicada, la integración de Supabase puede fallar al hacer el merge. **Hay que revisar
  el check de Supabase del PR antes de pedir el OK.**
- Script de solo lectura: `scripts/franquiciatarios/estado-migraciones.ts`.

## 4. Evidencia

### Comandos

| Comando                                                      | Resultado                                                                                                                      |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| `npm run typecheck`                                          | ✅ sin errores                                                                                                                 |
| `npx vitest run tests/db/franquiciatarios.test.ts`           | ✅ 22/22 (acceso por rol y sucursal, OAuth, inmutabilidad también con service_role, nombres, firmas, avisos, día de operación) |
| `npx vitest run tests/portal/franquiciatarios-rutas.test.ts` | ✅ 15/15 (401/403/404, 7 días, mismas cifras que Sucursales en vivo, pedidos y tira; sin claves sensibles)                     |
| Guardias del repo (`guardia-lectura`, `permisos`)            | ✅, después de ajustar las políticas a initPlan                                                                                |
| `npm test` (suite completa)                                  | ✅ 1647 pasan; solo falla `paridad.test.ts` por un Excel local que no existe (entorno)                                         |
| `npm run build`                                              | ✅                                                                                                                             |
| `npx tsx scripts/franquiciatarios/ensayo-75.ts`              | ✅ Ensayo con ROLLBACK (§4.2)                                                                                                  |
| `npx tsx scripts/franquiciatarios/paridad-essentia.ts 7`     | ✅ Paridad con producción (§4.3)                                                                                               |

### 4.2 Respaldo y ensayo de la migración 75

- **Respaldo:** `C:\Users\carlo\Respaldos\thecoffee-supabase\2026-11-20-migracion-75-antes.sql`, con las
  definiciones de `perfiles_rol_check` y `perfil_modulos_modulo_check` y los pasos de reversión.
- **Ensayo del archivo exacto:** `BEGIN` + migración + excepción intencional `ENSAYO_OK`, que aborta la transacción
  pase lo que pase.
  - Dentro de la transacción se crearon 9 tablas, 19 funciones, 3 secciones y 33 puntos, y los checks quedaron
    ampliados.
  - Ningún perfil actual queda fuera del check nuevo.
- **Consulta nueva después del ensayo:** la versión 75 no quedó registrada, no hay objetos `franq_*` y el check de
  roles sigue como antes.
- **sha256 del archivo ensayado:** `0e3e62f6927b4a37a9580e40487ef4aec2dcdc0b4d5b74b4ba39a0b3fe114841`. Si el archivo
  cambia, hay que repetir el ensayo.

### 4.3 Mismas cifras que Sucursales → Essentia

- **Lógica:** las rutas del módulo y las de Sucursales corren los mismos constructores. Las pruebas comparan las dos
  API con la misma sesión, en el mismo día y origen (`todos`, `mostrador`, `app`):
  - En vivo: KPIs (sin el neto), orígenes, pagos, top de productos, últimos pedidos y conciliación son **idénticos**.
  - Pedidos: la respuesta es idéntica salvo `netoCent`.
  - Tira: total, pedidos, ticket y productos son iguales a Productos de Sucursales.
- **Datos de producción** (solo lectura, Essentia, 13 al 19 de noviembre):
  - Los pedidos de Rappi que lee el módulo con la llave de servicio son **los mismos ids** que entrega la RPC de
    Sucursales con la sesión de un usuario. Por día: 16, 10, 17, 9, 8, 21 y 26.
  - El catálogo de nombres es igual: 114 renglones, misma huella md5.
- **Pendiente:** comparar en el portal real con la sesión de Carlos, cuando la 75 esté aplicada.

### 4.4 Suite completa y build

- `npm test`: **1647 pasan, 5 omitidas**. Un archivo falla, `tests/migracion/paridad.test.ts`, porque necesita el
  Excel local `datos/Modelo_Costeo_Corregido_2026.xlsx`. Es una falla de entorno, no tiene que ver con este cambio.
- `npm run build`: ✅. Next 16.3.8 compila las 7 rutas de `/franquiciatarios` y las 4 API.
- Prettier: ✅ en todos los archivos del diff (solo los propios).

### 4.5 Navegador (arnés visual, datos sintéticos)

`npm run prueba:visual` → `?franquiciatarios&vista=…&rol=…&estado=…`. Las capturas están en `capturas/`.

- **Barista.**
  - Ve «¿Quién eres?» y, al elegir su nombre, el día con el avance por sección.
  - Al tocar «No» se abre la observación y el foco pasa a ella; no se puede guardar vacía. Al guardar aparecen el
    nombre y la hora.
  - La firma pide confirmación y nombra a quien firma. Después ya no hay cambios y aparece el aviso.
  - Sin conexión se ve «No se guardó…» y lo capturado se conserva.
- **Gerente.** Ve los avisos («No» con estándar y observación, incidencias) y puede corregir. En «Baristas» da de
  alta, edita y desactiva nombres.
- **Ventas.** Filtro de origen con botones grandes, «Venta de hoy» y Pedidos. **No aparece «Neto»** (revisado en la
  página).
- **Tira.** Ticket con la marca PARCIAL y la hora de corte; origen, forma de pago y productos.
- **375 px y modo oscuro:** sin scroll horizontal (`scrollWidth = 375`) y los botones Sí/No se leen bien.
- **No probado:**
  - La impresión física en una térmica de 80 mm (solo el CSS de impresión).
  - El portal real contra producción, porque la migración no está aplicada.
  - La tablet de la tienda.

## 5. Respuestas de Carlos (2026-11-20) y bloqueos

- **Corte del día:** 4:00 de CDMX ✅ (como quedó construido).
- **Correcciones de lo firmado:** gerente y franquiciatario ✅ (y el admin del módulo).
- **Usuarios:** por ahora **solo el acceso de Carlos**.
  - Como admin del módulo (nivel `desarrollador`) elige con **«Ver como»** si ve la sucursal como administración,
    franquiciatario, gerente o baristas. Solo cambia lo que se muestra; lo que registre es real y queda a su nombre.
  - Los correos y usuarios de Essentia se asignan después.
- **Orden de producción:** primero #165 (BI → 74), después #169.

Preguntas originales:

1. Nombre y correo del **franquiciatario** y del **gerente** de Essentia.
2. **Correo para la cuenta de baristas** de Essentia. Tiene que recibir la invitación; un `@thecoffee.internal` no
   recibe correo.
3. Confirmar el **corte del día de operación a las 4:00**.
4. ¿Corrige el franquiciatario lo firmado, o solo el gerente? Hoy pueden ambos, y también el admin.
5. **OK de producción:** después de revisar el check de Supabase de este PR y resolver la 72 duplicada (PR #165 → 74).

## 6. Siguiente acción

1. **OK de Carlos para mergear #165.** Aplica la 74. Después hay que comprobar en `schema_migrations` que quedó
   registrada.
2. Traer `main` a esta rama y confirmar que el Supabase Preview pasa. Si el archivo de la 75 cambia, repetir el
   ensayo.
3. **OK de Carlos para mergear #169.** Aplica la 75.
4. Dar a Carlos la fila `perfil_modulos(franquiciatarios, desarrollador)` con SQL autorizado y probar las cuatro
   vistas de «Ver como» en Essentia.
5. Más adelante, alta de los usuarios de Essentia con el flujo de invitación
   (`docs/crm/44-CORREO-AUTENTICACION.md`; 30 correos por hora):
   - `perfiles` con rol `franquiciado` o `tienda`;
   - `perfil_modulos` con `franquiciatarios` en nivel `lectura`;
   - `franq_miembros(…, 514, rol)`.

## 7. Pendientes del módulo

- Diferencias entre franquiciatario y gerente.
- Gerente de distrito.
- PIN opcional de baristas.
- Otras sucursales (el modelo ya las soporta).
- Los apartados del gerente de `02-PROPUESTA-GERENTE.md`.
- El arnés visual tiene su propia copia de la plantilla v1: si cambia la plantilla, hay que actualizarla.

---

## 8. Rutina de turno v2 (PDF de Operaciones) — F1 del plan `03-PLAN-RUTINA-Y-CONEXIONES.md`

> Rama `feat/franq-rutina-v2` (2026-11-20). Migración **20261120000079** ensayada con rollback y **sin aplicar**:
> se aplica al mergear, con el OK de Carlos.

**Qué cambia**

- **4 fases:** Apertura (8), Durante la operación (6 rondas), Medio turno (7) y Fin de turno (11), con las 32
  actividades del PDF. «Medio turno» toma el lugar del «Cambio de turno» de la v1.
- **Rondas.** Baños cada hora (tolerancia 15 min), sanitizante cada 2 h (15 min) y cold brew cada 2–4 h (120 + 120).
  Reabastecer barra, previas y preparados van según demanda.
  - Cada ronda es un registro propio, con hora del servidor.
  - La pantalla muestra «última / siguiente / atrasada». La primera ronda cuenta desde la firma de apertura y los
    atrasos se detienen al firmar el cierre.
  - **Supuesto [S]:** las rondas solo avisan; no bloquean ninguna firma.
- **Datos.** Caducidades, conteos de apertura y de medio turno, preparados y cold brew piden un dato corto en el «Sí».
- **Cortes.** «Enviar corte de medio día» y «Enviar corte del día» enlazan a la tira; el «Sí» registra quién y a qué
  hora.
- **Firmas.**
  - Apertura: barista del turno de mañana.
  - Medio turno: entrega (turno de mañana) y recibe (turno de tarde, otra persona).
  - Fin de turno: barista de tarde o cierre, y después el **visto bueno del gerente**.
- **Vigencia uniforme.** Un registro vale mientras ningún otro lo corrija, y se corrige una sola vez (índice único:
  dos dispositivos a la vez ya no dejan dos registros vigentes). Los avisos muestran cada «No» vigente,
  también los de las rondas.
- **Convivencia.** La v1 deja de ser vigente y conserva sus 33 puntos y registros. Un día empezado con la v1 sigue con
  la v1; en producción había 1 checklist de hoy con la v1. Un día anterior se ve con su versión.

**Evidencia**

- **Pruebas:**
  - `tests/db/franquiciatarios-rutina.test.ts`: 10 pruebas (plantilla, rondas, dato, corrección de ronda, avisos,
    visto bueno, convivencia).
  - `tests/db/franquiciatarios.test.ts`: 22 pruebas, adaptadas a la v2.
  - `tests/portal/franquiciatarios-dia.test.ts`: 6 pruebas (próxima ronda y atrasos, vigencia, convivencia, día
    anterior).
- **Ensayo** `scripts/franquiciatarios/ensayo-79.ts` (sha `51c10a51…`, con el índice único de correcciones):
  - Dentro de la transacción: v1 sin vigencia y v2 vigente, con 8 / 6 / 7 / 11 puntos y 6 recurrentes; los 33
    puntos v1 quedan como únicos y la respuesta existente sigue ahí.
  - En la consulta nueva: no está registrada, sigue 1 plantilla, no aparece la columna `tipo` y el check de firmas
    es el original.
  - Respaldo en `Respaldos/thecoffee-supabase/2026-11-20-migracion-79-antes.sql`.
- **Arnés visual** (datos sintéticos):
  - Hoy con las 4 fases en 2×2 (en pantallas grandes, 4 en una fila).
  - «Durante» con rondas atrasadas en ámbar.
  - Registrar una ronda y el cold brew con su dato.
  - Fin de turno con el visto bueno a 375 px, sin scroll horizontal.
  - Enlace a la tira parcial en Medio turno.

**Pendiente de Carlos:** si las rondas avisan o bloquean, la hora del cambio de turno en Essentia y la lista de insumos
críticos para la F2.

## 9. Pedidos y recepciones — F3 del plan

> Rama `feat/franq-pedidos` (2026-11-20). Migración **20261120000080** ensayada con rollback y **sin aplicar**;
> se aplica al mergear, con el OK de Carlos. No escribe nada en el sitio viejo ni en las tablas `com_*`.

**Qué hay**

- **Pantalla nueva «Pedidos»** (menú y tarjeta en Hoy, color oliva). Muestra los pedidos de la sucursal a la
  Comercializadora de los últimos 120 días: folio, fecha, estado del sitio viejo, productos y piezas.
  - Arriba, tres cifras: por recibir, en camino y con diferencias.
- **Vínculo con el sitio viejo.** La apertura es el número de tienda de la sucursal (`lookerStoreId`; Essentia = 397).
  - **Candado:** solo se lee si el nombre de esa apertura en el sitio viejo coincide con el de la sucursal. Si no
    coincide, la pantalla dice que la sucursal no está vinculada.
  - Además se descartan las filas de cualquier otra apertura.
  - La lectura usa la llave de servicio en el servidor, después de autorizar al usuario para esa sucursal.
- **Recepción** (tabla `franq_recepciones`, solo inserción, una por pedido):
  - Cualquier rol de la sucursal la registra; la cuenta de baristas, con su nombre declarado.
  - Cada renglón trae lo pedido y solo se cambia lo que llegó distinto. Si hay diferencia, se explica qué pasó.
  - El servidor vuelve a leer el pedido de esta sucursal y calcula las diferencias contra sus cantidades. Del
    navegador solo llega lo recibido.
  - Se puede recibir un pedido en camino o entregado, de los últimos 60 días, que aún no tenga recepción.
- **Montos ([S], decisión pendiente):** solo el administrador ve precios y totales. Los demás roles ven productos,
  cantidades y estado, y la prueba confirma que el JSON no lleva ningún precio.

**Evidencia**

- **Pruebas:**
  - `tests/db/franquiciatarios-recepciones.test.ts`: 6 pruebas. Nombre declarado, una por pedido, diferencias
    válidas con observación, pedido inválido u otra sucursal, solo inserción, lectura por sucursal y OAuth.
  - `tests/portal/franquiciatarios-pedidos.test.ts`: 7 pruebas. Sin montos no sale ningún precio; los artículos
    editados mandan; ventana de recepción; candado de apertura y nombre.
- **Ensayo** `scripts/franquiciatarios/ensayo-80.ts` (sha `a6b35830…`):
  - Dentro de la transacción quedaron la tabla con RLS, 1 política, 1 trigger y la función.
  - En la consulta nueva no quedó nada.
- **Producción, solo lectura:** la apertura 397 se llama «Essentia» y tiene 21 pedidos en 120 días (en camino,
  recibidos y entregados).
- **Arnés visual:**
  - Lista como gerente, sin montos.
  - Recepción con una diferencia: aparecen la columna «Recibido» y quién recibió.
  - Vista con montos a 375 px, sin scroll horizontal (se corrigió el espacio entre cantidad y precio).

**Pendiente de Carlos**

- Si el gerente o el franquiciatario ven los montos.
- Dar de alta a Essentia en la OV sugerida de Comercializadora: renglón `514 → 397` en `com_ovs_tiendas`, que es una
  escritura en producción.

## 10. Pedidos solo para gerencia (decisión de Carlos, 2026-11-20)

> Rama `feat/franq-pedidos-gestores`. Migración **20261120000082** (la 81 ya era de Rappi) ensayada con respaldo y
> rollback; **sin aplicar** hasta el merge con OK.

- **Gerente y franquiciatario ven los pedidos con montos** (precio por producto y total) y registran las recepciones
  con el nombre de su perfil.
- **La cuenta de baristas no ve pedidos, inventario ni P&L.** «Pedidos» pasa al grupo Gerencia y la tarjeta de Hoy
  solo la ven los gestores. La página le responde 404 a la cuenta de baristas, como Avisos y Baristas.
- **En la base (migración 82):** la lectura de `franq_recepciones` queda solo para gestores
  (`franq_companias_gestor()`), y `franq_recibir` rechaza a quien no sea gerente, franquiciatario o admin.
- **Evidencia:**
  - `tests/db/franquiciatarios-recepciones.test.ts`: 7 pruebas. El barista no registra ni lee; el gerente de otra
    sucursal tampoco.
  - Ensayo `scripts/franquiciatarios/ensayo-82.ts` (sha `46628ad2…`): la política queda limitada a gestores y
    `franq_recibir` exige gestor; en la consulta nueva todo sigue igual. Había 0 recepciones en producción.
  - Respaldo: `Respaldos/thecoffee-supabase/2026-11-20-migracion-82-antes.sql`.
