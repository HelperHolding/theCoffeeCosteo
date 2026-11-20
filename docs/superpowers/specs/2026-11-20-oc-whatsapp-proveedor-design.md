# OC confirmada → PDF por WhatsApp al proveedor (diseño)

Fecha: 2026-11-20 · Módulo: Comercializadora (portal) + n8n + Zoho Books · Estado: aprobado en conversación, pendiente de
revisión escrita.

## 1. Propósito

Cuando compras confirma una orden de compra en Zoho Books (pasa a **emitida**), el proveedor recibe automáticamente el
PDF de la OC por WhatsApp. Lo que no se pueda mandar (sin número, error) le llega a compras@ para mandarlo a mano.

Decisiones del usuario (2026-11-20):

- La orquestación vive en **n8n** (el mismo que ya se conecta a Zoho y a bliocjvq). WhatsApp aún no está conectado.
- El número sale de un **campo personalizado del proveedor en Zoho** ("WhatsApp OCs").
- Dispara un **webhook de Zoho** (regla de flujo de trabajo), no una revisión periódica.
- Las **respuestas** del proveedor se **reenvían a compras@**.

Éxito: cada OC emitida a un proveedor con número llega una sola vez por WhatsApp con su PDF; compras ve en Órdenes si se
mandó, entregó o leyó, y recibe por correo lo que falló y las respuestas.

Fuera de alcance: mandar OCs canceladas o cambios de una OC ya enviada, conversar con el proveedor desde el portal,
enviar a franquiciatarios, migrar contactos de `proveedores_contactos` del viejo (11 filas, ninguna con teléfono).

## 2. Piezas

| Pieza | Dónde | Quién la hace |
|---|---|---|
| Campo "WhatsApp OCs" del proveedor | Zoho Books → Contactos (proveedores) | usuario (pasos en la guía) |
| Regla "OC emitida → webhook n8n" | Zoho Books → Configuración → Flujos de trabajo | usuario (pasos en la guía) |
| Cuenta de WhatsApp Business Platform, número dedicado, plantilla | Meta Business | usuario |
| Credenciales (Zoho OAuth2, WhatsApp, clave del portal) | n8n | usuario |
| Flujo 1 "OC emitida → WhatsApp" y flujo 2 "Avisos de Meta" | n8n (JSON exportado en el repo, se importa) | agente prepara, usuario importa |
| Tabla `com_oc_whatsapp`, función `com-oc-whatsapp`, columna en Órdenes, bandera | portal | agente |

## 3. Datos (portal)

Migración nueva:

```text
com_oc_whatsapp (
  zoho_po_id text primary key,
  po_number text not null,
  vendor_id text, vendor_name text,
  telefono text,                -- E.164 (+52…), null si sin_numero
  estado text not null check (estado in ('reservado','enviado','entregado','leido','fallido','sin_numero','omitido')),
  wa_message_id text unique,    -- id que devuelve Meta; liga los avisos de estado
  error text,
  reservado_at timestamptz not null default now(),
  enviado_at timestamptz, entregado_at timestamptz, leido_at timestamptz,
  actualizado_at timestamptz not null default now()
)
```

- Lectura: Comercializadora (`com_puede_leer()`), como las demás `com_`. Escritura: solo `service_role` (la función).
- Bandera en `com_plan_config.config.whatsapp`: `{ "activo": false, "solo_vendor_ids": [] }`. Si `solo_vendor_ids` no
  está vacío, solo esos proveedores se mandan (para la prueba).
- Los estados solo avanzan: `reservado → enviado → entregado → leido`; `fallido` y `sin_numero` son finales salvo un
  reintento manual (§7). `omitido` = la bandera estaba apagada o el proveedor no está en `solo_vendor_ids`.

## 4. Función `com-oc-whatsapp` (portal)

Edge Function con su **propio secreto** `OC_WHATSAPP_SECRETO` (header `x-oc-whatsapp-secreto`); no acepta `COM_SECRETO`
ni la llave de servicio, y no hace nada fuera de `com_oc_whatsapp` y de leer la bandera. Acciones (`POST`, JSON):

- `reservar { zoho_po_id, po_number, vendor_id, vendor_name }` →
  - bandera apagada o proveedor fuera de `solo_vendor_ids`: inserta `omitido` (si no existía) y responde `{ enviar: false, motivo }`;
  - ya existe la fila (cualquier estado): `{ enviar: false, motivo: "ya registrada", estado }`;
  - si no: inserta `reservado` y responde `{ enviar: true }`. El `insert … on conflict do nothing` hace que dos webhooks
    simultáneos de la misma OC solo manden uno.
- `resultado { zoho_po_id, estado: 'enviado'|'fallido'|'sin_numero', telefono?, wa_message_id?, error? }` → actualiza
  la fila reservada.
- `estado_meta { wa_message_id, estado: 'delivered'|'read'|'failed', error? }` → avanza la fila (no retrocede).
- `respuesta { telefono, texto }` → devuelve `{ zoho_po_id, po_number, vendor_name }` del último envío a ese número (para
  el correo a compras@), o `null`.

No guarda el contenido de los mensajes ni el PDF. Nunca registra el secreto ni números completos en logs (solo los
últimos 4 dígitos).

## 5. Flujo 1 en n8n: "OC emitida → WhatsApp"

1. **Webhook** (POST) que llama la regla de Zoho con `purchaseorder_id`. Responde 200 de inmediato.
2. **HTTP → portal** `reservar`. Si `enviar = false`, termina.
3. **HTTP → Zoho** `GET /purchaseorders/{id}`: confirma `status = open` (si no, `resultado fallido` "la OC ya no está
   emitida" y termina), toma folio, total, fecha de entrega y `vendor_id`.
4. **HTTP → Zoho** `GET /contacts/{vendor_id}`: lee el campo "WhatsApp OCs". Normaliza a E.164 (10 dígitos → `+52`).
   Vacío o inválido → `resultado sin_numero` + correo a compras@ ("OC COM-OC-xxxx no se mandó por WhatsApp: el proveedor
   no tiene número") y termina.
5. **HTTP → Zoho** `GET /purchaseorders/{id}?accept=pdf` (binario).
6. **WhatsApp Business Cloud**: sube el PDF como media y manda la plantilla `oc_emitida` (categoría utilidad, español
   MX) con encabezado de documento (`COM-OC-xxxx.pdf`) y variables: nombre del proveedor, folio, total, fecha de entrega.
   Texto propuesto: *"Hola {{1}}, te compartimos la orden de compra {{2}} de The Coffee por {{3}}, con entrega esperada
   el {{4}}. Para cualquier duda escríbenos a compras@mx.thecoffee.jp."*
7. **HTTP → portal** `resultado enviado` con `wa_message_id`. Si el paso 5 o 6 falla: `resultado fallido` con el error y
   correo a compras@ con el folio.

## 6. Flujo 2 en n8n: "Avisos de Meta"

Webhook que Meta llama (verificación con su token):

- **Estados** (`delivered`, `read`, `failed`) → portal `estado_meta`. `failed` además manda correo a compras@.
- **Mensajes entrantes** → portal `respuesta`; correo a compras@: "Respuesta de {proveedor} sobre {folio}: {texto}"
  (si no hay OC ligada, "Mensaje de {número} sin OC ligada"). Adjuntos: solo se avisa que llegó uno.

## 7. Portal: pantalla

- **Órdenes de compra**: columna "WhatsApp" con el estado y la hora (`enviado 08:12`, `leído`, `falló: …`, `sin número`).
- Botón "Reintentar WhatsApp" en filas `fallido`/`sin_numero` (perfil `edicion`): borra la fila para que el siguiente
  webhook la reserve de nuevo, y explica que hay que volver a disparar la regla en Zoho (o reemitir) — sin llamar a n8n
  desde el portal.
- **Configuración**: interruptor `whatsapp.activo` y lista `solo_vendor_ids`.

## 8. Errores y seguridad

- Un webhook repetido o dos simultáneos no duplican: la reserva es la llave (§4).
- Una OC que se emite, se regresa a borrador y se vuelve a emitir no se manda dos veces (decisión: una sola vez por OC).
- Si el portal no responde en `reservar`, n8n no manda (falla cerrada) y registra el error en su ejecución.
- Los secretos (Zoho, Meta, `OC_WHATSAPP_SECRETO`) los pone el usuario en n8n y en Supabase; el agente nunca los ve ni los
  imprime. El JSON del flujo en el repo usa credenciales por nombre, sin valores.
- Meta exige plantillas aprobadas para mensajes que inicia la empresa y que el destinatario haya dado su consentimiento:
  compras avisa a cada proveedor que recibirá sus OCs por WhatsApp antes de capturar su número.

## 9. Pruebas

- Función (Deno): autenticación (sin secreto, secreto equivocado, `COM_SECRETO` no sirve); `reservar` (nueva, repetida,
  concurrente, bandera apagada, `solo_vendor_ids`); `resultado` sobre una reservada; `estado_meta` no retrocede;
  `respuesta` liga al último envío del número; números en logs enmascarados.
- Migración (PGlite): tabla, check de estados, permisos (guardia de lecturas), bandera por omisión apagada.
- Pantalla: columna y botón de reintento (vitest).
- n8n: el JSON se valida con un script (nodos esperados, sin credenciales embebidas). Prueba de punta a punta manual con
  un proveedor de prueba cuyo número es el del usuario, bandera activa y `solo_vendor_ids = [ese proveedor]`.

## 10. Orden de puesta en marcha

1. Usuario: Meta Business verificado, número dedicado, plantilla `oc_emitida` enviada a aprobación (tarda de horas a
   días; se puede empezar ya).
2. Agente: migración + función + pantalla (PR al portal; con la bandera apagada no cambia nada).
3. Usuario: secreto `OC_WHATSAPP_SECRETO` en Supabase y en n8n; credenciales de Zoho y WhatsApp en n8n; importar los dos
   flujos.
4. Usuario: campo "WhatsApp OCs" y regla de Zoho.
5. Prueba con el proveedor de prueba; luego se vacía `solo_vendor_ids` y compras captura los números de los 42
   proveedores con OCs en 90 días.

## 11. Abierto para después

Avisar al proveedor cuando una OC enviada se cancela o cambia; mandar también por correo desde Zoho; responder desde el
portal.
