# OC automática: consolidar borradores y alertar OCs emitidas (diseño)

Fecha: 2026-11-20 · Módulo: Comercializadora (`zoho-generar-oc`, portal y sitio viejo) · Estado: aprobado en conversación,
pendiente de revisión escrita.

## 1. Propósito

Hoy la OC automática (lunes y jueves 08:00 CDMX) no vuelve a pedir un SKU que ya está en una OC abierta de Zoho
(borrador o emitida): `cantidadAPedir` devuelve 0 si `enOcAbierta`. Pero si al **mismo proveedor** le faltan **otros**
SKUs, crea una **segunda OC** aparte. Al 2026-11-19 había 2 proveedores con varios borradores y 3 con varias OCs
emitidas.

Lo que pidió el usuario:

- Cuando la automatización vaya a hacer otra OC a un proveedor que ya tiene una, que **lance una alerta**.
- Cuando se agreguen cosas nuevas a ese proveedor, que **se cancele la OC vieja y se haga una nueva** con los totales
  actualizados, y que **avise por correo**.

Decisiones del usuario (2026-11-20):

1. Solo se cancelan **borradores** (`draft`). Una OC ya emitida al proveedor nunca se toca: lo nuevo sale aparte y se
   alerta.
2. Aplica a **cualquier borrador** del proveedor, automático o hecho a mano.
3. Cantidades: **recalcular todo** (lo que el sistema calcula hoy manda sobre lo que el borrador tenía).
4. Se construye en **los dos sitios** (código compartido); se prueba en simulación y se activa en Real con la primera OC
   del portal (jueves 26 de noviembre), salvo que el usuario decida otra cosa (§7).

Éxito: un proveedor nunca termina con dos borradores automáticos; compras recibe un correo que dice qué se reemplazó y
qué se pidió aparte de una OC emitida.

Fuera de alcance: cancelar o editar OCs emitidas, consolidar OCs manuales creadas desde "Crear OC" del portal en el
momento (solo se consideran las que ya están en Zoho), cambiar la regla de cálculo de `cantidadAPedir`.

## 2. Estados de OC

De `com_zoho_oc_lineas.status` (sincronizado de Zoho cada 30 min por `zoho-sync`):

| Estado Zoho | Tipo para esta función |
|---|---|
| `draft` | **borrador** (se puede reemplazar) |
| `open`, `partially_received`, `billed` o `partially_billed` con pendiente | **emitida** (no se toca; alerta) |
| cerrados (`ESTADOS_OC_CERRADOS`) | no cuentan |

## 3. Comportamiento por proveedor (en cada corrida de `zoho-generar-oc`)

Sea `nuevo` el conjunto de SKUs que la propuesta de hoy pide a ese proveedor **sin contar** los que ya están en sus
borradores (es decir, lo que hoy generaría una OC aparte).

1. **Tiene borrador(es) y `nuevo` no está vacío → consolidar.**
   - Se arma **una sola OC** con:
     - los SKUs de `nuevo`;
     - los SKUs de todos sus borradores, **recalculados** (§4).
   - Se crea en Zoho la OC nueva; **después** se cancelan los borradores viejos (§5).
   - Sus notas dicen `Reemplaza a COM-OC-xxxx[, COM-OC-yyyy]`.
2. **Tiene borrador(es) y `nuevo` está vacío → no se hace nada** (como hoy). Un borrador no se reescribe solo porque
   cambió el cálculo.
3. **Tiene OC emitida y `nuevo` no está vacío → OC aparte + alerta.** La OC nueva lleva solo `nuevo` (como hoy) y la
   alerta dice el folio y fecha de la emitida. Si además tiene borrador(es), primero aplica el caso 1 (la emitida solo
   genera la alerta).
4. **Sin OCs abiertas** → como hoy.

Mínimo de compra del proveedor (`bajo_minimo`, adelantos por mínimo) y cierres de proveedor se evalúan sobre la OC
consolidada completa, no sobre `nuevo` solo.

## 4. Cantidades al consolidar ("recalcular todo")

Para los SKUs de los borradores que se van a reemplazar, la posición se calcula **como si esos borradores no
existieran**: sus pendientes no suman a `enCamino` ni a `enOcAbierta`. Las OCs **emitidas** sí siguen contando.

- **SKU manejado** (tiene fila en `com_minmax` y no es `SKU_MARCADOR`): lleva la cantidad que da `cantidadAPedir` con esa
  posición (con múltiplo y mínimo en piezas). Si da **0, sale de la OC** y el correo lo dice ("ya no hace falta").
- **SKU no manejado** (sin mín/máx, renglones como `ENV` u otros marcadores, artículos agregados a mano): pasa **con la
  cantidad y precio del borrador en Zoho**, sin recalcular.
- Si un SKU aparece en dos borradores del mismo proveedor, se toma una sola vez (manejado: el recálculo; no manejado: la
  suma).
- Precio: el costo del catálogo como hoy para los manejados; el del borrador para los no manejados.
- Si tras recalcular la OC consolidada queda vacía (todo en 0 y sin no manejados), no se crea nada y no se cancela nada.

## 5. Escritura en Zoho (solo modo Real)

Orden por proveedor:

1. **Verificar en vivo**: `GET /purchaseorders/{id}` de cada borrador. Si ya no está en `draft` (alguien lo emitió o lo
   borró después del último sync), ese borrador **no se reemplaza**: se trata como emitido (caso 3) y el correo lo dice.
2. **Crear** la OC consolidada como borrador (igual que hoy, `notes` con "Reemplaza a …").
3. **Cancelar** cada borrador viejo: `POST /purchaseorders/{id}/status/cancelled`. Si Zoho no permite cancelar un
   borrador, se **borra** (`DELETE /purchaseorders/{id}`) — un borrador nunca se envió al proveedor; el historial queda en
   `com_oc_auto` y en las notas de la OC nueva. (Se confirma cuál acepta Zoho en el plan, contra la API real en una OC de
   prueba creada para eso.)
4. Si el paso 2 falla: no se cancela nada; error en el correo y en `com_oc_auto` (`estado = 'error'`).
   Si el paso 3 falla: la OC nueva queda, el borrador viejo también; el correo lo marca como **"cancelar a mano"** con
   el folio.

En **simulación** no se llama a Zoho: se guarda la propuesta consolidada y lo que se habría cancelado.

## 6. Datos

- `com_oc_auto`: columnas nuevas `reemplaza jsonb` (lista de `{zoho_po_id, po_number, cancelada: bool, error?}`) y
  `alerta_emitidas jsonb` (lista de `{zoho_po_id, po_number, fecha_oc}`). Migración nueva en el portal y SQL manual en el
  viejo (se corre en su SQL Editor, como las demás).
- Cada línea de `lineas` puede llevar `antes` (cantidad en el borrador viejo) y `origen: 'nuevo' | 'recalculado' |
  'borrador'` para el correo y la pantalla de OC automáticas.
- El índice `com_oc_auto_un_cron_dia` (una OC real por proveedor y día) no cambia: la consolidación crea una sola.

## 7. Correo

Correo **aparte** del de OCs automáticas, a `config.auto.correos`, solo si hubo consolidaciones o alertas:

Asunto: `OC automática <fecha>: consolidaciones y alertas[ (simulación)]`.

- **Consolidadas** (por proveedor): borradores cancelados → OC nueva; tabla SKU · antes · ahora · motivo (`nuevo`,
  `recalculado`, `quitado: ya no hace falta`, `sin cambio`); total anterior vs nuevo. Si alguna cancelación falló:
  "cancelar a mano COM-OC-xxxx".
- **Alertas** (por proveedor): "ya tiene la OC emitida COM-OC-xxxx del <fecha>; se pidió aparte:" y la lista de SKUs.
- Escapado HTML como el correo actual.
- En el portal pasa por `COM_EFECTOS_EXTERNOS` como los demás correos de funciones (en sombra no sale; se ve en la
  bitácora y en la pantalla).

Activación: el código se publica en los dos sitios y corre en **simulación** en el portal (sombra) desde que se publica.
En el viejo, que está en Real, entra con la OC del **lunes 23** solo si el usuario lo pide expresamente; si no, el viejo
lo trae apagado por una bandera `auto.consolidar` (default `false`) y el portal lo activa en el cutover junto con el modo
Real. La paridad compara la propuesta por proveedor, así que la bandera debe valer lo mismo en los dos durante la racha.

## 8. Errores y concurrencia

- Un proveedor que falla no detiene a los demás (como hoy).
- El candado diario por corrida (`ya corrió hoy`) no cambia.
- La verificación en vivo (§5.1) cubre el desfase de hasta 30 min del sync.
- `zoho-sync` verá la OC cancelada en su siguiente corrida; mientras tanto `com_zoho_oc_lineas` puede mostrar el borrador
  viejo, y `com-minmax` lo contaría como en camino unas horas (aceptable: no hay otra OC automática ese día).

## 9. Pruebas

- Propuesta (puras): borrador + algo nuevo → una OC con todo; varios borradores → una; emitida + algo nuevo → OC aparte
  y alerta; borrador sin nada nuevo → nada; emitida + borrador + nuevo → consolida borrador y alerta por la emitida; SKU
  no manejado conserva cantidad y precio; SKU manejado que recalcula a 0 sale; SKU repetido en dos borradores; OC
  consolidada vacía → nada; mínimo de proveedor sobre la consolidada.
- Zoho (con cliente falso): crear falla → no cancela; cancelar falla → "cancelar a mano"; borrador que ya no es draft en
  vivo → alerta en vez de consolidar; simulación no llama a Zoho.
- Correo: secciones, totales, escape de HTML, no se envía sin consolidaciones ni alertas.
- Migración: columnas nuevas y bandera `auto.consolidar` con default `false`.

## 10. Abierto para después

Consolidar también al crear una OC manual desde "Crear OC" del portal; pantalla para ver el historial de reemplazos.
