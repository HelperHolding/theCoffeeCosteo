# Pagos de Sucursales propias (conciliación masiva Banregio → Zoho Books) — diseño

**Fecha:** 2026-11-25
**Origen:** cada corrida de pagos a proveedores de las sucursales propias se paga con una transferencia masiva de Banregio
(ej. `SUCUR 20 NOV.xlsx`, 17 transferencias por $189,277.70) y después hay que registrar a mano en Zoho Books, factura por
factura, el pago de cada proveedor. Hoy se trabaja con el reporte «Detalles de la factura de proveedor» de Zoho y el ZIP de
recibos Banregio.
**Objetivo:** subir el ZIP de recibos de una corrida y que el portal empate cada transferencia con las facturas abiertas del
proveedor en Zoho Books (org *Sucursales The Coffee – GDL*) y, tras revisión, registre los pagos directo en Zoho con el
recibo adjunto.

## 1. Alcance

- Un grupo nuevo **«Sucursales propias · Helper Holding»** dentro del módulo **Sucursales**, separado visualmente del grupo
  actual (que pasa a llamarse **«Red»**: Directorio y Tablero México). Primera pantalla del grupo: **Pagos**
  (`/sucursales/propias/pagos`). El grupo queda listo para colgarle más pantallas después.
- Flujo de Pagos: **Subir → Revisar → Aplicar → Bitácora** (§4).

**Fuera de alcance (fase 2 posible):** generar desde el portal el Excel de la masiva de Banregio a partir de las facturas
elegidas; conciliar contra el estado de cuenta bancario; pagos de Comercializadora u otras orgs; abonos que no salgan de un
recibo Banregio.

## 2. Insumos (formato observado en la corrida del 20 nov 2026)

**ZIP de la corrida** (ej. `SUCURSALES 20NOV26.zip`):
- Un **recibo individual** Banregio por transferencia (`<ALIAS> - $<monto>.pdf`). Campos: Cuenta origen
  (`COMERCIALIZADORA MASTER SITRU … *0151`), Cuenta destino (`<alias> - <CLABE 18 dígitos>`), Cantidad, Banco, Tipo
  (SPEI / Banregio), Concepto, RFC, Fecha de operación SPEI, **Clave de rastreo**. Los traspasos Banregio→Banregio
  (comprobado con YESICA CAMPOS OTERO) **no traen CLABE completa (solo `*5957`) ni clave de rastreo ni folio**, y su fecha
  viene como `20-11-2026 13:08`. Para ellos la CLABE sale del resumen (fila tipo Banregio con mismos 4 dígitos finales y
  mismo monto) y la llave es `BRG-<fecha>-<últimos 4>-<monto>`.
- El texto extraído de los PDF sale **desordenado** (etiquetas antes o después del valor), así que la lectura usa patrones
  sobre todo el texto (CLABE de 18 dígitos, `$X pesos`, clave `058-20/11/2026/…`), no pares etiqueta-valor.
- Un **resumen** `RESUMEN TRANSFERENCIA MASIVA …pdf`: archivo, número de transferencias, total y detalle (secuencia, tipo,
  CLABE, alias, descripción, monto), más la tabla «Transferencias con error».

**Facturas:** se leen en vivo de Zoho Books (no del PDF del reporte): facturas de proveedor con saldo > 0
(abiertas, vencidas, parcialmente pagadas), con `bill_id`, número, fecha, vencimiento, saldo, notas y ubicación.

Casos reales que el diseño debe cubrir (corrida del 20 nov):
- Una transferencia paga **varias facturas** del proveedor (DMG de Occidente: 21 facturas, $44,004.00).
- **Nombre distinto** entre banco y Zoho: «ALPINA TEPEYAC» = «MATERIAS PRIMAS EL REFUGIO»; «HIBRIDO DISEÑO CESAR RAUL
  MARTINEZ VILLASEÑOR» = «CESAR RAUL MARTINEZ VILLASEÑOR».
- **Sin facturas** en Zoho: CEVICAJ ALBO ($21,866.21).
- **Saldos parciales**: OH LALA y SIGMA pagan el saldo, no el importe original.

## 3. Permisos

- Acceso nuevo **`sucursales_pagos`** en `perfil_modulos` (se agrega al `check` de `modulo`, como `sucursales_costeo`).
  Nivel `lectura` = ver corridas y bitácora; `edicion` (o `desarrollador`) = subir, ajustar y **aplicar en Zoho**.
- Además debe ser empleado **Holding**: rol `compras`, `operaciones`, `finanzas`, `admin`, `sucursales` o `interno`
  (nunca `franquiciado`, `tienda` ni `proveedor`).
- El grupo del menú solo aparece si se cumplen ambas. La RLS de las tablas `suc_pago_*` aplica la misma regla
  (función `suc_pagos_nivel()`), y la Edge Function la vuelve a verificar con el JWT del usuario antes de escribir en Zoho.
- `Accesos` en `lib/portal/modulos.ts` suma `sucursales_pagos`; el módulo Sucursales también se muestra a quien solo tenga
  `sucursales_pagos`.

## 4. Flujo en pantalla

1. **Subir.** Se arrastra el ZIP. El servidor lee cada PDF (texto, formato fijo de Banregio) y crea una **corrida**.
   Control con el resumen: número de transferencias y total de los recibos contra el resumen; si no cuadra, o el resumen
   trae transferencias con error, aviso en la corrida (no bloquea, las transferencias con error no se aplican).
   Un PDF que no se pueda leer queda como aviso de la corrida («No se pudo leer <archivo>»), igual que una fila del
   resumen sin recibo en el ZIP. Una transferencia cuya llave ya existe (ZIP subido otra vez) no se vuelve a registrar:
   queda como aviso «ya registrada en la corrida #N (<estado>)». La subida va por un route handler (`POST
   /api/sucursales/propias/pagos`, máx. 4 MB), no por server action (límite de 1 MB).
2. **Revisar.** Una fila por transferencia, con estado:
   - ✅ **Cuadra**: proveedor identificado y monto = suma de saldos abiertos. Se despliega la lista de facturas a liquidar.
   - ⚠️ **No cuadra**: monto ≠ suma de saldos. El usuario marca qué facturas cubre y cuánto abona a cada una
     (precargado: de la más antigua a la más reciente hasta agotar el monto). La fila pasa a ✅ solo si lo asignado = monto.
   - ❓ **Proveedor desconocido**: la CLABE no tiene equivalencia. Se sugiere el proveedor de Zoho por nombre parecido;
     el usuario confirma o elige otro y se **guarda la equivalencia CLABE → proveedor**.
   - ⛔ **Sin facturas abiertas**: no se aplica; queda señalado (puede ser un anticipo o un proveedor que no está en Zoho).
3. **Aplicar.** Botón «Aplicar N pagos» (solo filas ✅, solo nivel `edicion`) con confirmación que muestra número de pagos y
   total. Se procesa proveedor por proveedor (§5). Al terminar, cada fila muestra su resultado.
4. **Bitácora.** Lista de corridas (fecha, archivo, quién subió, aplicadas/pendientes/total) y, por transferencia: proveedor,
   facturas liquidadas, `vendorpayment` de Zoho (enlace), quién y cuándo aplicó, recibo PDF descargable.

## 5. Registro en Zoho Books

- **Org:** *Sucursales The Coffee – GDL*. Credenciales propias (`ZOHO_SUC_CLIENT_ID`, `ZOHO_SUC_CLIENT_SECRET`,
  `ZOHO_SUC_REFRESH_TOKEN`, `ZOHO_SUC_ORG_ID`), separadas de las de Comercializadora. Scopes:
  `ZohoBooks.bills.READ`, `ZohoBooks.bills.CREATE` (respaldo: adjunto del recibo en cada factura),
  `ZohoBooks.contacts.READ`, `ZohoBooks.vendorpayments.CREATE`,
  `ZohoBooks.vendorpayments.READ`, `ZohoBooks.vendorpayments.UPDATE` (adjuntos), `ZohoBooks.accountants.READ` (cuenta).
  `ZohoClient` de `_shared/zoho.ts` se reutiliza con otra configuración.
- **Edge Function nueva `zoho-suc-pagos`** (`verify_jwt = false`, como las demás). Exige el secreto `x-com-secreto` del
  portal **y** el JWT del usuario en `x-usuario-jwt`; con ese JWT llama `suc_pagos_nivel()` y solo deja `aplicar` con nivel
  `edicion`/`desarrollador`. Acciones: `facturas` (saldos abiertos de un conjunto de proveedores), `proveedores` (lista de
  proveedores de Zoho), `aplicar` (una transferencia, leída de la base: no confía en montos que mande el portal).
  Las escrituras a Zoho solo ocurren con `SUC_PAGOS_EFECTOS=si` (bandera propia, independiente de `COM_EFECTOS_EXTERNOS`).
- **Por cada transferencia ✅, un `vendorpayment`:**
  - `vendor_id`, `date` = fecha de operación SPEI, `amount` = monto del recibo;
  - `paid_through_account_id` = cuenta **«BANREGIO - CONSOLIDADO SUCURSALES PROPIAS - \*0151»** (se resuelve por nombre la
    primera vez y se guarda su id en la configuración; editable);
  - `reference_number` = clave de rastreo; `description` = concepto del recibo;
  - `bills[]` = `{ bill_id, amount_applied }` según la revisión.
  - Después, el PDF del recibo como adjunto del pago. (Verificar en el plan que la API admite adjunto en `vendorpayments`;
    si no, se adjunta a cada factura liquidada.)
- **Antes de crear el pago** se vuelven a leer los saldos de esas facturas: si alguno bajó (pago a mano mientras tanto) la
  fila vuelve a ⚠️ y no se aplica. También se busca en Zoho un `vendorpayment` del proveedor con ese `reference_number`;
  si existe, se registra como ✔️ «ya estaba en Zoho» sin crear otro.

## 6. Datos (Supabase)

- `suc_pago_corrida` (id, archivo, subido_por, subido_en, n_resumen, total_resumen, n_recibos, total_recibos, avisos jsonb).
- `suc_pago_transferencia` (id, corrida_id, **llave unique** = clave de rastreo o folio, tipo, clabe, alias, concepto,
  monto, fecha_operacion, archivo_pdf (ruta en Storage), proveedor_zoho_id, proveedor_nombre, estado, error,
  zoho_vendorpayment_id, adjunto_ok, aplicado_por, aplicado_en).
  Estados: `cuadra`, `no_cuadra`, `desconocido`, `sin_facturas`, `aplicando`, `aplicada`,
  `aplicada_sin_adjunto`, `error`, `ya_aplicada` (el pago ya existía en Zoho con esa referencia).
  La corrida, sus transferencias y asignaciones se registran en una sola transacción (RPC `suc_pagos_registrar_corrida`).
- `suc_pago_asignacion` (transferencia_id, bill_id, bill_numero, ubicacion, monto).
- `suc_proveedor_clabe` (clabe pk, proveedor_zoho_id, proveedor_nombre, creado_por, creado_en).
- `suc_pago_config` (fila única: `paid_through_account_id`, nombre de la cuenta).
- Storage: bucket privado `suc-pagos-recibos` (ruta `<corrida>/<llave>.pdf`), lectura con la misma regla de permisos.
- RLS: lectura con `suc_pagos_nivel() is not null`; escritura de asignaciones/equivalencias con nivel `edicion`;
  `estado`, `zoho_vendorpayment_id` y `aplicado_*` solo desde la Edge Function (service role).
- Datos sensibles: las CLABEs y RFC se guardan solo en estas tablas protegidas; no van a logs ni a mensajes de error.

## 7. Errores e idempotencia

- **Independencia:** cada transferencia se aplica sola; un error deja esa fila en ❌ con el mensaje de Zoho y botón
  «Reintentar»; el resto sigue.
- **Sin pago doble:** la fila pasa a `aplicando` (update condicional `where estado = 'cuadra'`) antes de llamar a Zoho;
  la llave única impide repetir una transferencia entre corridas; y la búsqueda por `reference_number` en Zoho cubre el caso
  de un pago creado cuya respuesta se perdió (una fila atorada en `aplicando` se resuelve con esa búsqueda al reintentar).
- **Adjunto:** si el pago se crea y el adjunto falla → `aplicada_sin_adjunto`, botón que reintenta solo el adjunto.
- **Límites de Zoho:** aplicación secuencial con pausa corta; lectura de facturas por proveedor y en lotes.

## 8. Pruebas

- **Lectura de recibos:** fixtures con el texto extraído de recibos reales de la corrida del 20 nov, con CLABE, RFC,
  correos y nombres de personas reemplazados por valores ficticios; casos SPEI, Banregio→Banregio y resumen.
- **Empate (puro, sin E/S):** cuadra; varias facturas; saldo parcial; nombre distinto con equivalencia guardada;
  proveedor desconocido; sin facturas (CEVICAJ); monto que no cuadra y reparto por antigüedad; llave repetida.
- **Edge Function:** Zoho simulado — pago correcto, saldo cambiado antes de aplicar, `reference_number` ya existente,
  adjunto fallido, error de Zoho.
- **Permisos:** RLS y menú — Holding con `edicion`, Holding con `lectura`, `tienda` con `sucursales_pagos` (no entra),
  usuario de Sucursales sin `sucursales_pagos` (no ve el grupo).

## 9. Lo que hace el usuario (fuera del código)

- Crear en la consola de Zoho el cliente OAuth y el refresh token para la org Sucursales GDL con los scopes de §5, y
  cargarlos como secretos de Supabase (guía paso a paso en el plan).
- Asignar `sucursales_pagos` (`lectura` o `edicion`) a las personas de Helper Holding que correspondan.
