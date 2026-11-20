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
const SUPABASE_SERVICIO = 'https://jpqkmnfjwzniptszjuli.supabase.co/rest/v1/rpc/rappi_importar_servicio';
const SMTP = { id: '77HAkO1eZAVBGkN4', name: 'SMTP Notifications' }; // la misma de los reportes
const AVISAR_A = 'cvalencia@mx.thecoffee.jp';

const resumen = `// El lector puede fallar (clave, red, caído): entonces no se guarda nada y se avisa igual.
const disparo = ['Vivo', 'Cierre', 'Repaso', 'Manual'].find((n) => $(n).isExecuted);
const pedido = disparo ? $(disparo).first().json : {};
const leido = $('Leer portal').first().json;
const lote = leido.statusCode === 200 && leido.body && typeof leido.body === 'object' ? leido.body : null;
const r = $('Guardar en Supabase').isExecuted ? $('Guardar en Supabase').first().json : null;
let estado, mensaje;
if (!lote) {
  estado = 'error';
  mensaje = 'El lector no respondió bien: ' + (leido.statusCode ? 'HTTP ' + leido.statusCode + ' ' + JSON.stringify(leido.body).slice(0, 200) : String(leido.error?.message ?? JSON.stringify(leido)).slice(0, 300)) + '. No se guardó nada.';
} else {
  estado = lote.estado ?? 'error';
  mensaje = lote.mensaje ?? '';
}
const ok = r && r.statusCode >= 200 && r.statusCode < 300;
if (lote && !ok) { estado = 'error'; mensaje += r?.error ? ' No se pudo guardar en Supabase: ' + String(r.error.message ?? r.error).slice(0, 300) : ' Supabase respondió ' + r?.statusCode + ': ' + JSON.stringify(r?.body).slice(0, 300); }
else if (ok && r.body && typeof r.body === 'object') {
  const b = r.body;
  if (b.nuevos !== undefined) mensaje += ' Guardados: ' + b.nuevos + ' nuevos, ' + b.cambiados + ' cambiados, ' + b.desaparecidos + ' para revisar.';
  if (b.cambios?.length) mensaje += ' Cambios: ' + b.cambios.map((c) => '#' + c.id + ' ' + c.de + ' → ' + c.a).join(', ') + '.';
}
// Nivel de servicio (docs/rappi-portal/08): si falla no cambia el estado de la corrida; va al correo diario.
const r2 = $('Guardar servicio').isExecuted ? $('Guardar servicio').first().json : null;
let servicioFalla = lote?.servicio_error ?? null;
if (lote?.servicio) {
  const ok2 = r2 && r2.statusCode >= 200 && r2.statusCode < 300;
  if (!ok2) servicioFalla = [servicioFalla, 'No se guardó el Nivel de servicio: ' + (r2?.error ? String(r2.error.message ?? r2.error) : 'Supabase respondió ' + r2?.statusCode + ' ' + JSON.stringify(r2?.body)).slice(0, 300)].filter(Boolean).join(' ');
  else {
    const s = r2.body ?? {};
    mensaje += ' Servicio guardado: ' + (s.dias ?? 0) + ' tienda-días, ' + (s.reclamos ?? 0) + ' reclamos, ' + (s.cambios_conectividad ?? 0) + ' cambios de conectividad.';
    if (s.ignoradas?.length) servicioFalla = [servicioFalla, 'Tiendas sin alta en rappi_tiendas: ' + s.ignoradas.join(', ') + '.'].filter(Boolean).join(' ');
  }
}
if (servicioFalla) mensaje += ' ' + servicioFalla;
// Avisos:
// - Corrida de cada 10 min que falla: NO avisa la primera vez, porque la siguiente relee ayer y hoy (fallas sueltas del
//   2026-11-16 09:07 «Failed to fetch» y del 2026-11-17 11:47 «403», que la siguiente resolvió sola). Si la siguiente
//   también falla, avisa. Las sueltas van en el correo diario.
// - Cierre, repaso o reposición que falla: avisa al momento (corren una vez).
// - Si el problema sigue, otro correo cada 6 h (o si cambia de tipo).
// - En el cierre diario, también si el portal se saltó pedidos, hubo pedidos que ya no aparecen, o hubo corridas que se
//   recuperaron solas o fallaron sueltas.
const st = $getWorkflowStaticData('global');
const tipo = lote?.tipo ?? pedido.tipo;
const hora = new Intl.DateTimeFormat('es-MX', { timeZone: 'America/Mexico_City', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());
let avisar = false;
if (estado === 'error' || estado === 'sesion_expirada') {
  if (tipo === 'vivo' && !st.pendiente && !st.ultimoAviso) {
    st.pendiente = hora + ' (vivo): ' + String(lote?.mensaje || mensaje).slice(0, 200);
  } else {
    st.pendiente = null;
    const previo = st.ultimoAviso;
    if (!previo || previo.estado !== estado || Date.now() - previo.t > 6 * 3600 * 1000) { avisar = true; st.ultimoAviso = { estado, t: Date.now() }; }
  }
} else {
  if (estado === 'ok' || estado === 'sin_ordenes') {
    st.ultimoAviso = null;
    if (st.pendiente) { st.sueltas = [...(st.sueltas ?? []), st.pendiente].slice(-50); st.pendiente = null; }
  }
  if (tipo === 'cierre' && (/menos de lo que contó/.test(mensaje) || (r?.body?.desaparecidos ?? 0) > 0)) avisar = true;
}
// Corridas que se recuperaron solas (la sesión se cayó a media lectura y el lector volvió a entrar, #142): no son
// falla, pero conviene saber si se vuelven frecuentes. Se juntan y van en UN correo al día, con el cierre de las 5:07.
const recuperada = estado === 'ok' || estado === 'sin_ordenes' ? /A media lectura: (.*?) Se volvió a entrar/.exec(mensaje) : null;
if (recuperada) st.recuperadas = [...(st.recuperadas ?? []), hora + ' (' + tipo + '): ' + recuperada[1]].slice(-50);
let asunto = estado === 'sesion_expirada' ? 'el lector no pudo entrar' : estado === 'error' ? 'revisar lectura' : 'revisar pedidos';
if (servicioFalla) st.servicio = [...(st.servicio ?? []), hora + ' (' + tipo + '): ' + servicioFalla.slice(0, 220)].slice(-50);
const rec = st.recuperadas ?? [];
const sue = st.sueltas ?? [];
const ser = st.servicio ?? [];
if (tipo === 'cierre' && (rec.length || sue.length || ser.length)) {
  const veces = (n, una, varias) => n + ' ' + (n === 1 ? una : varias);
  const partes = [];
  if (rec.length) partes.push('El lector se recuperó solo ' + veces(rec.length, 'vez', 'veces') + ' desde el último aviso (la sesión de Rappi se cayó a media lectura, volvió a entrar y terminó la lectura; no se perdió nada):\\n- ' + rec.join('\\n- '));
  if (sue.length) partes.push('Fallaron ' + veces(sue.length, 'corrida suelta', 'corridas sueltas') + ' (la siguiente salió bien y releyó ayer y hoy; no se perdió nada):\\n- ' + sue.join('\\n- '));
  if (ser.length) partes.push('Nivel de servicio con fallas en ' + veces(ser.length, 'corrida', 'corridas') + ' (los pedidos sí se guardaron; el cierre vuelve a leer los últimos 7 días):\\n- ' + ser.join('\\n- '));
  if (!avisar) asunto = 'resumen del lector: ' + [rec.length ? 'se recuperó solo ' + veces(rec.length, 'vez', 'veces') : '', sue.length ? veces(sue.length, 'falla suelta', 'fallas sueltas') : '', ser.length ? veces(ser.length, 'falla de Nivel de servicio', 'fallas de Nivel de servicio') : ''].filter(Boolean).join(', ');
  mensaje = partes.join('\\n\\n') + '\\n\\nCierre: ' + mensaje;
  avisar = true;
  st.recuperadas = [];
  st.sueltas = [];
  st.servicio = [];
}
return [{ json: { avisar, asunto, tipo, desde: lote?.desde ?? pedido.desde, hasta: lote?.hasta ?? pedido.hasta, estado, mensaje } }];`;

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
  // Cierre y repaso de madrugada: Dodo no corre entre 0:00 y 6:30, y su cierre de las 6:30 dura hasta 8 min (medido
  // el 2026-11-02, docs/rappi-portal/05). Antes el nuestro también era a las 6:30.
  nodo('Cierre 5:07', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 180], {
    rule: { interval: [{ field: 'cronExpression', expression: '7 5 * * *' }] },
  }),
  fijar('Cierre', [220, 180], { tipo: 'cierre' }),
  nodo('Repaso domingo', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 360], {
    rule: { interval: [{ field: 'cronExpression', expression: '7 4 * * 0' }] },
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
      // Respuesta completa y sin cortar el flujo: si el lector falla (401, caído, red), «Resumen» avisa.
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 600000 },
    },
    {
      notes: 'Credencial: Header Auth, Name x-api-key, Value = solo el valor de RAPPI_THECOFFEE_KEY.',
      onError: 'continueRegularOutput',
    },
  ),
  nodo('¿Lector OK?', 'n8n-nodes-base.if', 2.2, [580, 270], {
    conditions: {
      options: { caseSensitive: true, leftValue: '', typeValidation: 'loose', version: 2 },
      combinator: 'and',
      conditions: [
        {
          id: id(),
          leftValue: '={{ $json.statusCode }}',
          rightValue: 200,
          operator: { type: 'number', operation: 'equals' },
        },
      ],
    },
    looseTypeValidation: true,
    options: {},
  }),
  // El lote se arma como texto en un nodo de código: con 110 tiendas, el cierre (~4,500 pedidos) y el repaso (~8,500)
  // hacían que la expresión `JSON.stringify({ p_lote: $json.body })` agotara el tiempo de expresiones de n8n
  // («Expression timed out», 2026-11-15 y 16) y la corrida se cortaba sin guardar ni avisar.
  nodo(
    'Armar lote',
    'n8n-nodes-base.code',
    2,
    [640, 270],
    {
      // El Nivel de servicio (docs/rappi-portal/08) viaja en el mismo lote y se guarda aparte («Guardar servicio»).
      jsCode: [
        'const { servicio, servicio_error, ...lote } = $input.first().json.body;',
        'return [{ json: { cuerpo: JSON.stringify({ p_lote: lote }), servicio: JSON.stringify({ p: servicio ?? {} }) } }];',
      ].join('\n'),
    },
    { onError: 'continueRegularOutput' },
  ),
  nodo(
    'Guardar en Supabase',
    'n8n-nodes-base.httpRequest',
    4.2,
    [760, 270],
    {
      method: 'POST',
      url: SUPABASE,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: '={{ $json.cuerpo }}',
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 120000 },
    },
    {
      notes: 'Credencial: Header Auth apikey = llave secreta de Supabase. Solo llama rappi_importar.',
      // Si algo falla aquí, «Resumen» lo reporta y avisa por correo en vez de cortar la corrida en silencio.
      onError: 'continueRegularOutput',
    },
  ),
  nodo(
    'Guardar servicio',
    'n8n-nodes-base.httpRequest',
    4.2,
    [880, 270],
    {
      method: 'POST',
      url: SUPABASE_SERVICIO,
      authentication: 'genericCredentialType',
      genericAuthType: 'httpHeaderAuth',
      sendBody: true,
      contentType: 'raw',
      rawContentType: 'application/json',
      body: "={{ $('Armar lote').first().json.servicio }}",
      options: { response: { response: { fullResponse: true, neverError: true } }, timeout: 120000 },
    },
    {
      notes: 'Credencial: la misma de «Guardar en Supabase». Solo llama rappi_importar_servicio.',
      onError: 'continueRegularOutput',
    },
  ),
  nodo('Resumen', 'n8n-nodes-base.code', 2, [1000, 270], { jsCode: resumen }),
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
      subject: '=Rappi The Coffee ({{ $json.tipo }}): {{ $json.asunto }}',
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
  ...conecta('Cierre 5:07', 'Cierre'),
  ...conecta('Repaso domingo', 'Repaso'),
  ...conecta('Reponer (webhook)', 'Manual'),
  ...conecta('Vivo', 'Leer portal'),
  ...conecta('Cierre', 'Leer portal'),
  ...conecta('Repaso', 'Leer portal'),
  ...conecta('Manual', 'Leer portal'),
  ...conecta('Leer portal', '¿Lector OK?'),
  ...conecta('¿Lector OK?', 'Armar lote', 'Resumen'),
  ...conecta('Armar lote', 'Guardar en Supabase'),
  ...conecta('Guardar en Supabase', 'Guardar servicio'),
  ...conecta('Guardar servicio', 'Resumen'),
  ...conecta('Resumen', '¿Avisar?'),
  ...conecta('¿Avisar?', 'Avisar por correo', 'Listo'),
};
// Credenciales ya creadas en n8n (opcional): CRED_LECTOR, CRED_SUPABASE y CRED_WEBHOOK, cada una como '{"id":…,"name":…}'.
for (const [nodoCred, variable] of [
  ['Leer portal', 'CRED_LECTOR'],
  ['Guardar en Supabase', 'CRED_SUPABASE'],
  ['Guardar servicio', 'CRED_SUPABASE'],
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
  // Las corridas que salen bien no se guardan en n8n: con 22 tiendas serían ~1 MB cada una, y cada corrida ya queda
  // en rappi_corridas (y si algo sale mal, llega el correo). Se guardan las que fallan dentro de n8n y las que se
  // corren a mano desde el editor.
  settings: {
    executionOrder: 'v1',
    timezone: 'America/Mexico_City',
    saveDataSuccessExecution: 'none',
    saveDataErrorExecution: 'all',
    saveManualExecutions: true,
  },
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
  // Conserva las credenciales elegidas en la UI, el id del webhook y los ajustes que n8n agrega por su cuenta
  // (availableInMCP, binaryMode).
  const actual = await n8n('GET', `/workflows/${existente.id}`);
  flujo.settings = { ...actual.settings, ...flujo.settings };
  // «Guardar servicio» usa la misma llave de Supabase que «Guardar en Supabase» (la primera vez aún no existe).
  const MISMA_CREDENCIAL = { 'Guardar servicio': 'Guardar en Supabase' };
  for (const n of flujo.nodes) {
    const previo =
      actual.nodes.find((x) => x.name === n.name && x.credentials) ??
      actual.nodes.find((x) => x.name === MISMA_CREDENCIAL[n.name]);
    if (previo?.credentials) n.credentials = { ...n.credentials, ...previo.credentials };
    if (previo?.webhookId) n.webhookId = previo.webhookId;
  }
  await n8n('PUT', `/workflows/${existente.id}`, flujo);
  console.log(`Actualizado ${NOMBRE} (${existente.id}); sigue ${existente.active ? 'ACTIVO' : 'inactivo'}.`);
} else {
  const w = await n8n('POST', '/workflows', flujo);
  console.log(`Creado ${NOMBRE} (${w.id}), inactivo.`);
}
