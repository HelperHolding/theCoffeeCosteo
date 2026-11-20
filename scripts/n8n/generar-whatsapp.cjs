// Genera los dos flujos de n8n de WhatsApp de OCs (plan 2026-11-20-oc-whatsapp-proveedor, Task 7).
// Uso: node scripts/n8n/generar-whatsapp.cjs  → escribe n8n/oc-whatsapp-envio.json y n8n/oc-whatsapp-avisos.json.
// Sin secretos: credenciales por nombre y hosts/ids por variables de n8n ($vars).
const fs = require('fs');
let x = 0;
const pos = () => [(x += 260), 300];
const PORTAL = '={{ $vars.PORTAL_FUNCIONES_URL }}/com-oc-whatsapp';
const ZOHO = 'https://www.zohoapis.com/books/v3';
const GRAPH = 'https://graph.facebook.com/v21.0';
const credPortal = { httpHeaderAuth: { name: 'Portal OC WhatsApp' } };
const credZoho = { oAuth2Api: { name: 'Zoho Books OAuth2' } };
const credWa = { httpHeaderAuth: { name: 'WhatsApp Cloud' } };
const http = (name, p, cred, extra = {}) => ({
  name,
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position: pos(),
  parameters: { options: {}, ...p },
  credentials: cred,
  ...extra,
});
const portal = (name, cuerpo, extra) =>
  http(
    name,
    {
      method: 'POST',
      url: PORTAL,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify(' + cuerpo + ') }}',
    },
    credPortal,
    extra,
  );
const zoho = (name, ruta, extra = {}, pextra = {}) =>
  http(
    name,
    {
      method: 'GET',
      url: '=' + ZOHO + ruta,
      authentication: 'genericCredentialType',
      genericAuthType: 'oAuth2Api',
      sendQuery: true,
      queryParameters: {
        parameters: [{ name: 'organization_id', value: '={{ $vars.ZOHO_ORG_ID }}' }].concat(
          pextra.query || [],
        ),
      },
      options: pextra.options || {},
    },
    credZoho,
    extra,
  );
const si = (name, expr) => ({
  name,
  type: 'n8n-nodes-base.if',
  typeVersion: 2,
  position: pos(),
  parameters: {
    conditions: {
      options: { caseSensitive: true, typeValidation: 'loose' },
      combinator: 'and',
      conditions: [
        {
          leftValue: expr,
          rightValue: true,
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
    },
    options: {},
  },
});
const W = "$('Webhook Zoho').item.json.body";
const D = "$('Preparar datos').item.json";
const conecta = (pares) => {
  const c = {};
  for (const par of pares) {
    const de = par[0];
    const salida = par[2] || 0;
    c[de] = c[de] || { main: [] };
    while (c[de].main.length <= salida) c[de].main.push([]);
    c[de].main[salida].push({ node: par[1], type: 'main', index: 0 });
  }
  return c;
};

// ---------- Flujo 1: OC emitida → WhatsApp ----------
x = 0;
const prepararCodigo = [
  "// Número del campo 'WhatsApp OCs' del proveedor, a 52 + 10 dígitos (formato de la API de WhatsApp, sin +).",
  "const po = $('Leer OC en Zoho').item.json.purchaseorder;",
  "const cf = ($json.contact.custom_fields || []).find((c) => c.label === 'WhatsApp OCs');",
  "let d = String(cf?.value ?? '').replace(/\\D/g, '');",
  'if (d.length === 13 && /^(044|045|521)/.test(d)) d = d.slice(3);',
  "else if (d.length === 12 && d.startsWith('52')) d = d.slice(2);",
  "const total = Number(po.total || 0).toLocaleString('es-MX', { style: 'currency', currency: 'MXN' });",
  'return { json: { zoho_po_id: String(po.purchaseorder_id), po_number: po.purchaseorder_number,',
  "  vendor_name: po.vendor_name, total, entrega: po.delivery_date || 'por confirmar',",
  "  telefono: d.length === 10 ? '52' + d : '' } };",
].join('\n');
const mensaje =
  "{ messaging_product: 'whatsapp', to: " +
  D +
  ".telefono, type: 'template', template: { name: 'oc_emitida', " +
  "language: { code: 'es_MX' }, components: [ { type: 'header', parameters: [ { type: 'document', document: " +
  '{ id: $json.id, filename: ' +
  D +
  ".po_number + '.pdf' } } ] }, { type: 'body', parameters: [ " +
  "{ type: 'text', text: " +
  D +
  ".vendor_name }, { type: 'text', text: " +
  D +
  '.po_number }, ' +
  "{ type: 'text', text: " +
  D +
  ".total }, { type: 'text', text: " +
  D +
  '.entrega } ] } ] } }';
const envio = {
  name: 'OC emitida → WhatsApp al proveedor',
  nodes: [
    {
      name: 'Webhook Zoho',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: pos(),
      parameters: { httpMethod: 'POST', path: 'oc-whatsapp', responseMode: 'onReceived', options: {} },
    },
    portal(
      'Reservar en portal',
      "{ accion: 'reservar', zoho_po_id: String(" +
        W +
        '.purchaseorder_id), po_number: String(' +
        W +
        '.purchaseorder_number), vendor_id: String(' +
        W +
        ".vendor_id || ''), vendor_name: String(" +
        W +
        ".vendor_name || '') }",
    ),
    si('¿Enviar?', '={{ $json.enviar === true }}'),
    zoho('Leer OC en Zoho', '/purchaseorders/{{ ' + W + '.purchaseorder_id }}'),
    si('¿Sigue emitida?', "={{ $json.purchaseorder.status === 'open' }}"),
    zoho('Leer proveedor en Zoho', "/contacts/{{ $('Leer OC en Zoho').item.json.purchaseorder.vendor_id }}"),
    {
      name: 'Preparar datos',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: pos(),
      parameters: { mode: 'runOnceForEachItem', jsCode: prepararCodigo },
    },
    si('¿Tiene número?', "={{ $json.telefono !== '' }}"),
    zoho(
      'PDF de la OC',
      '/purchaseorders/{{ ' + D + '.zoho_po_id }}',
      { onError: 'continueErrorOutput' },
      {
        query: [{ name: 'accept', value: 'pdf' }],
        options: { response: { response: { responseFormat: 'file', outputPropertyName: 'pdf' } } },
      },
    ),
    http(
      'Subir PDF a WhatsApp',
      {
        method: 'POST',
        url: '=' + GRAPH + '/{{ $vars.WA_PHONE_NUMBER_ID }}/media',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        contentType: 'multipart-form-data',
        bodyParameters: {
          parameters: [
            { name: 'messaging_product', value: 'whatsapp' },
            { parameterType: 'formBinaryData', name: 'file', inputDataFieldName: 'pdf' },
            { name: 'type', value: 'application/pdf' },
          ],
        },
      },
      credWa,
      { onError: 'continueErrorOutput' },
    ),
    http(
      'Mandar WhatsApp',
      {
        method: 'POST',
        url: '=' + GRAPH + '/{{ $vars.WA_PHONE_NUMBER_ID }}/messages',
        authentication: 'genericCredentialType',
        genericAuthType: 'httpHeaderAuth',
        sendBody: true,
        specifyBody: 'json',
        jsonBody: '={{ JSON.stringify(' + mensaje + ') }}',
      },
      credWa,
      { onError: 'continueErrorOutput' },
    ),
    portal(
      'Resultado enviado',
      "{ accion: 'resultado', zoho_po_id: " +
        D +
        ".zoho_po_id, estado: 'enviado', telefono: " +
        D +
        '.telefono, wa_message_id: $json.messages[0].id }',
    ),
    portal(
      'Resultado sin número',
      "{ accion: 'resultado', zoho_po_id: " + D + ".zoho_po_id, estado: 'sin_numero' }",
    ),
    portal(
      'Resultado fallido',
      "{ accion: 'resultado', zoho_po_id: String(" +
        W +
        ".purchaseorder_id), estado: 'fallido', " +
        "telefono: $('Preparar datos').isExecuted ? " +
        D +
        '.telefono : null, ' +
        "error: String($json.error?.message || $json.error || 'la OC ya no está emitida').slice(0, 300) }",
    ),
  ],
  connections: conecta([
    ['Webhook Zoho', 'Reservar en portal'],
    ['Reservar en portal', '¿Enviar?'],
    ['¿Enviar?', 'Leer OC en Zoho', 0],
    ['Leer OC en Zoho', '¿Sigue emitida?'],
    ['¿Sigue emitida?', 'Leer proveedor en Zoho', 0],
    ['¿Sigue emitida?', 'Resultado fallido', 1],
    ['Leer proveedor en Zoho', 'Preparar datos'],
    ['Preparar datos', '¿Tiene número?'],
    ['¿Tiene número?', 'PDF de la OC', 0],
    ['¿Tiene número?', 'Resultado sin número', 1],
    ['PDF de la OC', 'Subir PDF a WhatsApp', 0],
    ['PDF de la OC', 'Resultado fallido', 1],
    ['Subir PDF a WhatsApp', 'Mandar WhatsApp', 0],
    ['Subir PDF a WhatsApp', 'Resultado fallido', 1],
    ['Mandar WhatsApp', 'Resultado enviado', 0],
    ['Mandar WhatsApp', 'Resultado fallido', 1],
  ]),
  settings: { executionOrder: 'v1' },
};

// ---------- Flujo 2: avisos de Meta ----------
x = 0;
const separar = (lista, linea) =>
  [
    'const out = [];',
    'for (const e of $json.body?.entry ?? []) for (const c of e.changes ?? []) for (const it of c.value?.' +
      lista +
      ' ?? [])',
    '  out.push({ json: ' + linea + ' });',
    'return out;',
  ].join('\n');
const tokenOk = "$json.query['hub.verify_token'] === $vars.META_VERIFY_TOKEN";
const avisos = {
  name: 'Avisos de WhatsApp (Meta) → portal',
  nodes: [
    {
      name: 'Webhook Meta verificación',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: pos(),
      parameters: { httpMethod: 'GET', path: 'meta-whatsapp', responseMode: 'responseNode', options: {} },
    },
    {
      name: 'Verificar Meta',
      type: 'n8n-nodes-base.respondToWebhook',
      typeVersion: 1.1,
      position: pos(),
      parameters: {
        respondWith: 'text',
        responseBody: '={{ ' + tokenOk + " ? $json.query['hub.challenge'] : 'no' }}",
        options: { responseCode: '={{ ' + tokenOk + ' ? 200 : 403 }}' },
      },
    },
    {
      name: 'Webhook Meta',
      type: 'n8n-nodes-base.webhook',
      typeVersion: 2,
      position: pos(),
      parameters: { httpMethod: 'POST', path: 'meta-whatsapp', responseMode: 'onReceived', options: {} },
    },
    {
      name: 'Separar estados',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: pos(),
      parameters: {
        jsCode: separar(
          'statuses',
          "{ accion: 'estado_meta', wa_message_id: it.id, estado: it.status, error: it.errors?.[0]?.title ?? null }",
        ),
      },
    },
    portal('Estados a portal', '$json'),
    {
      name: 'Separar respuestas',
      type: 'n8n-nodes-base.code',
      typeVersion: 2,
      position: pos(),
      parameters: {
        jsCode: separar(
          'messages',
          "{ accion: 'respuesta', telefono: it.from, texto: it.text?.body ?? it.button?.text ?? '' }",
        ),
      },
    },
    portal('Respuestas a portal', '$json'),
  ],
  connections: conecta([
    ['Webhook Meta verificación', 'Verificar Meta'],
    ['Webhook Meta', 'Separar estados'],
    ['Webhook Meta', 'Separar respuestas'],
    ['Separar estados', 'Estados a portal'],
    ['Separar respuestas', 'Respuestas a portal'],
  ]),
  settings: { executionOrder: 'v1' },
};
fs.writeFileSync('n8n/oc-whatsapp-envio.json', JSON.stringify(envio, null, 2) + '\n');
fs.writeFileSync('n8n/oc-whatsapp-avisos.json', JSON.stringify(avisos, null, 2) + '\n');
