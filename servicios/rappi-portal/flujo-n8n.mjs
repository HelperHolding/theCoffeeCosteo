// Genera el flujo «TheCoffee_Rappi_Portal» de n8n (docs/rappi-portal/02) y lo sube INACTIVO.
//   node --env-file=<archivo con N8N_URL y N8N_API_KEY> servicios/rappi-portal/flujo-n8n.mjs
//   node servicios/rappi-portal/flujo-n8n.mjs --archivo flujo.json      # solo escribe el JSON
// En n8n, antes de activarlo, hay que elegir las credenciales en los nodos marcados:
//   «Leer portal»: Header Auth x-api-key (la clave RAPPI_THECOFFEE_KEY del lector).
//   «Guardar en Supabase»: Header Auth apikey (llave secreta de Supabase; solo ejecuta rappi_importar).
//   «Reponer (webhook)»: Header Auth para quien llame el webhook.
import { writeFileSync } from 'node:fs';
import { randomUUID } from 'node:crypto';

const NOMBRE = 'TheCoffee_Rappi_Portal';
const LECTOR = 'http://rappi-thecoffee:3101/sincronizar';
const SUPABASE = 'https://jpqkmnfjwzniptszjuli.supabase.co/rest/v1/rpc/rappi_importar';
const SMTP = { id: '77HAkO1eZAVBGkN4', name: 'SMTP Notifications' }; // la misma de los reportes
const AVISAR_A = 'cvalencia@mx.thecoffee.jp';

const resumen = `const lote = $('Leer portal').first().json;
const r = $('Guardar en Supabase').first().json;
const ok = r.statusCode >= 200 && r.statusCode < 300;
let estado = lote.estado ?? 'error';
let mensaje = lote.mensaje ?? ('El lector respondió: ' + JSON.stringify(lote).slice(0, 300));
if (!ok) { estado = 'error'; mensaje += ' Supabase respondió ' + r.statusCode + ': ' + JSON.stringify(r.body).slice(0, 300); }
else if (r.body && typeof r.body === 'object') {
  const b = r.body;
  if (b.nuevos !== undefined) mensaje += ' Guardados: ' + b.nuevos + ' nuevos, ' + b.cambiados + ' cambiados, ' + b.desaparecidos + ' para revisar.';
  if (b.cambios?.length) mensaje += ' Cambios: ' + b.cambios.map((c) => '#' + c.id + ' ' + c.de + ' → ' + c.a).join(', ') + '.';
}
// Un correo cuando aparece el problema (o cambia) y otro cada 6 h si sigue; en el cierre diario, también si el portal
// se saltó pedidos o hubo pedidos que ya no aparecen.
const st = $getWorkflowStaticData('global');
let avisar = false;
if (estado === 'error' || estado === 'sesion_expirada') {
  const previo = st.ultimoAviso;
  if (!previo || previo.estado !== estado || Date.now() - previo.t > 6 * 3600 * 1000) { avisar = true; st.ultimoAviso = { estado, t: Date.now() }; }
} else {
  if (estado === 'ok' || estado === 'sin_ordenes') st.ultimoAviso = null;
  if (lote.tipo === 'cierre' && (/menos de lo que contó/.test(mensaje) || (r.body?.desaparecidos ?? 0) > 0)) avisar = true;
}
return [{ json: { avisar, tipo: lote.tipo, desde: lote.desde, hasta: lote.hasta, estado, mensaje } }];`;

const id = () => randomUUID();
const nodo = (name, type, typeVersion, position, parameters, extra = {}) => ({
  id: id(),
  name,
  type,
  typeVersion,
  position,
  parameters,
  ...extra,
});
const fijar = (name, position, campos) =>
  nodo(name, 'n8n-nodes-base.set', 3.4, position, {
    assignments: {
      assignments: Object.entries(campos).map(([k, v]) => ({ id: id(), name: k, value: v, type: 'string' })),
    },
    options: {},
  });
const nodes = [
  nodo('Cada 10 min', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 0], {
    // Minutos 7, 17, 27…: el lector de Dodo corre a los 0, 15, 30 y 45, y el servidor (2 GB) no debe abrir dos
    // navegadores a la vez.
    rule: { interval: [{ field: 'cronExpression', expression: '7-59/10 7-23 * * *' }] },
  }),
  fijar('Vivo', [220, 0], { tipo: 'vivo' }),
  nodo('Cierre 6:30', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 180], {
    rule: { interval: [{ triggerAtHour: 6, triggerAtMinute: 30 }] },
  }),
  fijar('Cierre', [220, 180], { tipo: 'cierre' }),
  nodo('Repaso domingo', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 360], {
    rule: { interval: [{ field: 'cronExpression', expression: '30 5 * * 0' }] },
  }),
  fijar('Repaso', [220, 360], { tipo: 'repaso' }),
  nodo(
    'Reponer (webhook)',
    'n8n-nodes-base.webhook',
    2,
    [0, 540],
    {
      httpMethod: 'POST',
      path: 'rappi-thecoffee',
      authentication: 'headerAuth',
      responseMode: 'lastNode',
      options: {},
    },
    {
      webhookId: id(),
      notes: 'Body: {"tipo":"manual","desde":"AAAA-MM-DD","hasta":"AAAA-MM-DD"} (máx. 62 días).',
    },
  ),
  fijar('Manual', [220, 540], {
    tipo: 'manual',
    desde: '={{ $json.body?.desde }}',
    hasta: '={{ $json.body?.hasta }}',
  }),
  nodo(
    'Leer portal',
    'n8n-nodes-base.httpRequest',
    4.2,
    [460, 270],
    {
      method: 'POST',
      url: LECTOR,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ tipo: $json.tipo, desde: $json.desde, hasta: $json.hasta }) }}',
      options: { timeout: 600000 },
    },
    { notes: 'Credencial: Header Auth x-api-key = RAPPI_THECOFFEE_KEY del lector.' },
  ),
  nodo(
    'Guardar en Supabase',
    'n8n-nodes-base.httpRequest',
    4.2,
    [700, 270],
    {
      method: 'POST',
      url: SUPABASE,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      specifyBody: 'json',
      jsonBody: '={{ JSON.stringify({ p_lote: $json }) }}',
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 120000 },
    },
    { notes: 'Credencial: Header Auth apikey = llave secreta de Supabase. Solo llama rappi_importar.' },
  ),
  nodo('Resumen', 'n8n-nodes-base.code', 2, [940, 270], { jsCode: resumen }),
  nodo('¿Avisar?', 'n8n-nodes-base.if', 2.2, [1160, 270], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'strict', version: 2 },
      combinator: 'and',
      conditions: [
        {
          id: id(),
          leftValue: '={{ $json.avisar }}',
          rightValue: '',
          operator: { type: 'boolean', operation: 'true', singleValue: true },
        },
      ],
    },
    options: {},
  }),
  nodo(
    'Avisar por correo',
    'n8n-nodes-base.emailSend',
    2.1,
    [1380, 180],
    {
      fromEmail: 'Avisos Rappi <scervera@dodopizz.mx>',
      toEmail: AVISAR_A,
      subject:
        "=Rappi The Coffee ({{ $json.tipo }}): {{ $json.estado === 'sesion_expirada' ? 'el lector no pudo entrar' : $json.estado === 'error' ? 'revisar lectura' : 'revisar pedidos' }}",
      emailFormat: 'text',
      text: '={{ $json.mensaje }}\n\nVentana: {{ $json.desde }} a {{ $json.hasta }}.\nPara reponer días: POST al webhook «Reponer» con {"tipo":"manual","desde":"AAAA-MM-DD","hasta":"AAAA-MM-DD"}.',
      options: {},
    },
    { credentials: { smtp: SMTP } },
  ),
  nodo('Listo', 'n8n-nodes-base.noOp', 1, [1380, 360], {}),
];
const conecta = (de, ...a) => ({
  [de]: {
    main: a.map((rama) =>
      (Array.isArray(rama) ? rama : [rama]).map((node) => ({ node, type: 'main', index: 0 })),
    ),
  },
});
const connections = {
  ...conecta('Cada 10 min', 'Vivo'),
  ...conecta('Cierre 6:30', 'Cierre'),
  ...conecta('Repaso domingo', 'Repaso'),
  ...conecta('Reponer (webhook)', 'Manual'),
  ...conecta('Vivo', 'Leer portal'),
  ...conecta('Cierre', 'Leer portal'),
  ...conecta('Repaso', 'Leer portal'),
  ...conecta('Manual', 'Leer portal'),
  ...conecta('Leer portal', 'Guardar en Supabase'),
  ...conecta('Guardar en Supabase', 'Resumen'),
  ...conecta('Resumen', '¿Avisar?'),
  ...conecta('¿Avisar?', 'Avisar por correo', 'Listo'),
};
// Credenciales ya creadas en n8n (opcional): CRED_LECTOR, CRED_SUPABASE y CRED_WEBHOOK, cada una como '{"id":…,"name":…}'.
for (const [nodoCred, variable] of [
  ['Leer portal', 'CRED_LECTOR'],
  ['Guardar en Supabase', 'CRED_SUPABASE'],
  ['Reponer (webhook)', 'CRED_WEBHOOK'],
]) {
  if (process.env[variable])
    nodes.find((n) => n.name === nodoCred).credentials = {
      httpHeaderAuth: JSON.parse(process.env[variable]),
    };
}
const flujo = {
  name: NOMBRE,
  nodes,
  connections,
  settings: { executionOrder: 'v1', timezone: 'America/Mexico_City' },
};

const i = process.argv.indexOf('--archivo');
if (i > 0) {
  writeFileSync(process.argv[i + 1], JSON.stringify(flujo, null, 2));
  console.log(`Escrito ${process.argv[i + 1]}`);
  process.exit(0);
}
const url = (process.env.N8N_URL ?? '').replace(/\/+$/, '');
const key = process.env.N8N_API_KEY;
if (!url || !key) {
  console.error('Configura N8N_URL y N8N_API_KEY.');
  process.exit(1);
}
const n8n = async (metodo, ruta, cuerpo) => {
  const r = await fetch(`${url}/api/v1${ruta}`, {
    method: metodo,
    headers: { 'X-N8N-API-KEY': key, 'content-type': 'application/json' },
    body: cuerpo && JSON.stringify(cuerpo),
  });
  const t = await r.text();
  if (!r.ok) throw Error(`${metodo} ${ruta}: ${r.status} ${t.slice(0, 400)}`);
  return t ? JSON.parse(t) : null;
};
const existente = (await n8n('GET', '/workflows?limit=250')).data.find((w) => w.name === NOMBRE);
if (existente) {
  // Conserva las credenciales elegidas en la UI y el id del webhook.
  const actual = await n8n('GET', `/workflows/${existente.id}`);
  for (const n of flujo.nodes) {
    const previo = actual.nodes.find((x) => x.name === n.name);
    if (previo?.credentials) n.credentials = { ...n.credentials, ...previo.credentials };
    if (previo?.webhookId) n.webhookId = previo.webhookId;
  }
  await n8n('PUT', `/workflows/${existente.id}`, flujo);
  console.log(`Actualizado ${NOMBRE} (${existente.id}); sigue ${existente.active ? 'ACTIVO' : 'inactivo'}.`);
} else {
  const w = await n8n('POST', '/workflows', flujo);
  console.log(`Creado ${NOMBRE} (${w.id}), inactivo.`);
}
