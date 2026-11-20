# OCs por WhatsApp: puesta en marcha

Spec: `docs/superpowers/specs/2026-11-20-oc-whatsapp-proveedor-design.md` · Plan: `docs/superpowers/plans/2026-11-20-oc-whatsapp-proveedor.md`.

Cuando una OC pasa a **emitida** en Zoho Books, n8n manda su PDF por WhatsApp al número del campo "WhatsApp OCs" del
proveedor, **una sola vez por OC**. El portal guarda cada envío en `com_oc_whatsapp`, lo muestra en Órdenes (columna
"WhatsApp") y avisa a compras@ lo que no se pudo mandar y las respuestas de los proveedores.

Piezas:

- portal: migración 78 (`com_oc_whatsapp` y `com_oc_whatsapp_reintentar`), Edge Function `com-oc-whatsapp`,
  columna en Órdenes e interruptor en Configuración;
- n8n: `n8n/oc-whatsapp-envio.json` y `n8n/oc-whatsapp-avisos.json` (se regeneran con
  `node scripts/n8n/generar-whatsapp.cjs`).

Nada sale mientras el interruptor de Configuración esté apagado (así llega a producción).

## 1. Meta (usuario)

1. Verifica la empresa en Meta Business (business.facebook.com → Configuración → Centro de seguridad).
2. En WhatsApp Business Platform da de alta un **número dedicado**: no puede estar en uso en la app de WhatsApp.
3. Crea la plantilla **`oc_emitida`**: categoría **Utilidad**, idioma **Español (MEX)**, encabezado **Documento**, cuerpo:

   ```text
   Hola {{1}}, te compartimos la orden de compra {{2}} de The Coffee por {{3}}, con entrega esperada el {{4}}. Para cualquier duda escríbenos a compras@mx.thecoffee.jp.
   ```

   Ejemplos para la revisión: `ODISA`, `COM-OC-01500`, `$12,500.00`, `2026-12-01`. La aprobación tarda de horas a días.

4. Crea un usuario de sistema con permiso sobre la cuenta de WhatsApp y genera un **token permanente**. Anota el
   **Phone number ID** del número.

## 2. Supabase del portal (usuario)

Una clave larga nueva, solo para esta función (no reutilices `COM_SECRETO`):

```powershell
npx.cmd supabase secrets set OC_WHATSAPP_SECRETO=<clave larga nueva> --project-ref jpqkmnfjwzniptszjuli
```

No la pegues en chats, issues ni commits. La función ya se publica sola al integrar a `main`.

## 3. n8n (usuario)

1. **Variables** (Settings → Variables): `PORTAL_FUNCIONES_URL` = `https://jpqkmnfjwzniptszjuli.supabase.co/functions/v1`,
   `ZOHO_ORG_ID` = el id de la organización de Zoho Books, `WA_PHONE_NUMBER_ID` = el Phone number ID de Meta,
   `META_VERIFY_TOKEN` = una palabra larga que inventas para el webhook de Meta.
2. **Credenciales** (con estos nombres exactos, los flujos las buscan por nombre):
   - "Zoho Books OAuth2" (OAuth2 genérico de Zoho; scopes `ZohoBooks.purchaseorders.READ,ZohoBooks.contacts.READ`);
   - "WhatsApp Cloud" (Header Auth: `Authorization` = `Bearer <token permanente de Meta>`);
   - "Portal OC WhatsApp" (Header Auth: `x-oc-whatsapp-secreto` = la clave del paso 2).
3. **Importa** los dos JSON (Workflows → Import from file), revisa que cada nodo tome su credencial y **activa** los dos.
4. En Meta (WhatsApp → Configuración → Webhook): URL = la de producción del nodo "Webhook Meta" (`…/webhook/meta-whatsapp`),
   token de verificación = `META_VERIFY_TOKEN`; suscríbete a **messages**.

## 4. Zoho Books (usuario)

1. **Campo** (Configuración → Personalización → Contactos → Campos personalizados): "WhatsApp OCs", tipo texto, para
   proveedores. Se captura el celular a 10 dígitos (acepta espacios, guiones o `+52`).
2. **Regla** (Configuración → Automatización → Reglas de flujo de trabajo → Órdenes de compra):
   - cuándo: al **crear o editar**, con la condición **Estado = Emitida**;
   - acción: **Webhook** POST a la URL de producción del nodo "Webhook Zoho" (`…/webhook/oc-whatsapp`), cuerpo con los
     parámetros `purchaseorder_id`, `purchaseorder_number`, `vendor_id`, `vendor_name` (de la OC).

Si la regla se dispara varias veces para la misma OC no pasa nada: el portal la reserva una sola vez.

## 5. Prueba (usuario y agente)

1. Elige un proveedor de prueba y pon tu celular en su "WhatsApp OCs".
2. En el portal → Comercializadora → Configuración → "WhatsApp de OCs": marca **Mandar OCs emitidas por WhatsApp** y
   **Solo a** ese proveedor; guarda.
3. Emite en Zoho una OC de prueba de ese proveedor.
4. Revisa: el PDF llega a tu celular; en Órdenes la columna dice "Enviado" y luego "Leído"; en n8n la ejecución sale
   verde. El agente puede confirmar la fila en `com_oc_whatsapp` con una lectura.
5. Contesta el WhatsApp: llega a compras@ como "WhatsApp de <proveedor> sobre <folio>". Los correos de la función solo
   salen con `COM_EFECTOS_EXTERNOS=si` (desde el cutover); antes quedan en el log de la función.
6. Las OCs de otros proveedores emitidas durante la prueba quedan como "No se mandó (proveedor fuera de la prueba)" y no
   se mandan después; si alguna sí debe salir, usa "Reintentar WhatsApp" en Órdenes y vuelve a disparar la regla en
   Zoho (editar y guardar la OC).

## 6. Arranque

1. Compras avisa a cada proveedor que recibirá sus OCs por WhatsApp (Meta pide el consentimiento del destinatario) y
   captura su número en Zoho. Los 42 proveedores con OCs en los últimos 90 días son los primeros.
2. En Configuración, desmarca todos los "Solo a…" y guarda.
3. Los primeros días revisa la columna "WhatsApp" en Órdenes y los correos de fallas.

## 7. Apagar

- En Configuración, desmarca "Mandar OCs emitidas por WhatsApp": n8n recibe `enviar: false` y no manda nada (esas OCs
  quedan "No se mandó").
- O desactiva el flujo en n8n.
