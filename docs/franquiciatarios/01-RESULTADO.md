# Módulo Franquiciatarios: resultado de la ejecución (piloto Essentia)

> Rama `feat/franquiciatarios` (worktree `theCoffeeCosteo-franquiciatarios`, desde `origin/main` 84e6b6a).
> Fecha: 2026-11-19/20.
> **Estado:** PR en borrador. La migración 75 está **sin aplicar** y no hay usuarios creados en producción. Ambas cosas
> esperan el OK de Carlos.

## 1. Fases

| Fase | Estado | Entregable |
|---|---|---|
| F0 Exploración y plan | ✅ Aprobado por Carlos | Plan con el modelo de roles, tablas y RLS, rutas, piezas reutilizadas y corte del día |
| F1 Base del módulo | ✅ | Migración 75, `accesoFranquiciatarios`, marca The Coffee, navegación, rutas `/franquiciatarios/[companyId]` |
| F2 Baristas y checklists | ✅ | Nombres, plantilla v1 (Excel), checklist con Sí/No, firmas, incidencias, avisos, correcciones |
| F3 Ventas y tira | ✅ | `/api/franquiciatarios/[id]/{vivo,pedidos,tira,avisos}`, sin neto, costos ni márgenes; tira de 80 mm y A4 |
| F4 Propuesta del gerente | ✅ | `02-PROPUESTA-GERENTE.md` y prototipo en el arnés (`?franquiciatarios&vista=propuesta&rol=gerente`) |
| F5 Control y PR | ✅ | Revisión de código (nivel high), respaldo, ensayo con ROLLBACK y PR en borrador |
| Producción | ⏸ Requiere OK | Aplicar la 75, crear usuarios de Essentia y verificar con cada rol |

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
- Mientras `main` tenga la 72 duplicada, la integración de Supabase puede fallar al hacer el merge. **Hay que revisar
  el check de Supabase del PR antes de pedir el OK.**
- Script de solo lectura: `scripts/franquiciatarios/estado-migraciones.ts`.

## 4. Evidencia

### Comandos

| Comando | Resultado |
|---|---|
| `npm run typecheck` | ✅ sin errores |
| `npx vitest run tests/db/franquiciatarios.test.ts` | ✅ 22/22 (acceso por rol y sucursal, OAuth, inmutabilidad también con service_role, nombres, firmas, avisos, día de operación) |
| `npx vitest run tests/portal/franquiciatarios-rutas.test.ts` | ✅ 15/15 (401/403/404, 7 días, mismas cifras que Sucursales en vivo, pedidos y tira; sin claves sensibles) |
| Guardias del repo (`guardia-lectura`, `permisos`) | ✅, después de ajustar las políticas a initPlan |
| `npm test` (suite completa) | ✅ 1647 pasan; solo falla `paridad.test.ts` por un Excel local que no existe (entorno) |
| `npm run build` | ✅ |
| `npx tsx scripts/franquiciatarios/ensayo-75.ts` | ✅ Ensayo con ROLLBACK (§4.2) |
| `npx tsx scripts/franquiciatarios/paridad-essentia.ts 7` | ✅ Paridad con producción (§4.3) |

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

## 5. Bloqueos y preguntas para Carlos (todas juntas)

1. Nombre y correo del **franquiciatario** y del **gerente** de Essentia.
2. **Correo para la cuenta de baristas** de Essentia. Tiene que recibir la invitación; un `@thecoffee.internal` no
   recibe correo.
3. Confirmar el **corte del día de operación a las 4:00**.
4. ¿Corrige el franquiciatario lo firmado, o solo el gerente? Hoy pueden ambos, y también el admin.
5. **OK de producción:** después de revisar el check de Supabase de este PR y resolver la 72 duplicada (PR #165 → 74).

## 6. Siguiente acción

1. Carlos responde §5.
2. Con el OK: merge (aplica la 75 si la integración está sana; si no, se aplica a mano registrando la versión en la
   misma transacción).
3. Alta de usuarios con el flujo de invitación (`docs/crm/44-CORREO-AUTENTICACION.md`; 30 correos por hora):
   - `perfiles` con rol `franquiciado` o `tienda`;
   - `perfil_modulos` con `franquiciatarios` en nivel `lectura`;
   - `franq_miembros(…, 514, rol)`;
   - Carlos con nivel `desarrollador`.
4. Verificar con cada rol en producción, comparar con Sucursales → Essentia y hacer la prueba de impresión en tienda.

## 7. Pendientes del módulo

- Diferencias entre franquiciatario y gerente.
- Gerente de distrito.
- PIN opcional de baristas.
- Otras sucursales (el modelo ya las soporta).
- Los apartados del gerente de `02-PROPUESTA-GERENTE.md`.
- El arnés visual tiene su propia copia de la plantilla v1: si cambia la plantilla, hay que actualizarla.
