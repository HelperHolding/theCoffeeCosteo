// Lector del portal de Rappi Partners para el cron de n8n (docs/rappi-portal/02). Contenedor junto a n8n.
//   POST /sincronizar {tipo: vivo|cierre|repaso|manual, desde?, hasta?}  (header x-api-key)
//   → el lote de public.rappi_importar; n8n lo manda tal cual a Supabase.
//   GET /salud
// SOLO LECTURA (pedido expreso de Carlo, 2026-10-29). El lector usa una cuenta real del portal, así que nunca debe
// cambiar nada en Rappi (pedidos, menú, tienda, horarios, promociones, usuarios, datos bancarios). Dos candados:
//   1. Navegador: toda petición que no sea GET/HEAD/OPTIONS se bloquea, salvo la autenticación (Auth0 en
//      login.partners.rappi.com y el login del portal en rs-platform-security) y la consulta del historial (by-stores,
//      un POST que solo busca). Ver SALIDAS.
//   2. Código: pedirApi solo acepta las dos lecturas de LECTURAS (historial y detalle de un pedido).
// Fuera del formulario de login, el lector no hace clic en nada. Sin datos personales en la respuesta.
//
// Sesión: storageState de Playwright en DATOS/sesion.json, reescrito tras cada corrida. Si Rappi la cierra, entra solo
// con el usuario propio del lector (RAPPI_USUARIO / RAPPI_CLAVE, que pone Carlo en el servidor). Un login fallido
// bloquea el reintento 6 h (no insiste con una contraseña mala).
//
// Variables: EXTRACTOR_KEY, RAPPI_USUARIO, RAPPI_CLAVE, RAPPI_TIENDAS (coma), RAPPI_CONCURRENCIA (3), DATOS (/datos),
// PUERTO (3101).
import { createServer } from 'node:http';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { setTimeout as esperar } from 'node:timers/promises';
import { chromium } from 'playwright-core';
import { diasEntre, enParalelo, fechaMX, huellaListado, pedidoDeListado } from './lote.mjs';

const PORTAL = 'https://partners.rappi.com';
const API = 'https://services.rappi.com/rests-partners-gateway/cauth';
const {
  EXTRACTOR_KEY,
  RAPPI_USUARIO,
  RAPPI_CLAVE,
  RAPPI_TIENDAS = 'MX1930270777,MX1930301156',
  RAPPI_CLIENTE_VERSION = '4.6.7',
  RAPPI_CONCURRENCIA = '3',
  DATOS = '/datos',
  PUERTO = '3101',
  CHROMIUM,
} = process.env;
if (!EXTRACTOR_KEY) {
  console.error('Falta EXTRACTOR_KEY');
  process.exit(1);
}
const ESTADO = `${DATOS}/sesion.json`;
const CACHE = `${DATOS}/detalles.json`;
const BLOQUEO = `${DATOS}/login-fallido.json`;
const TIENDAS = RAPPI_TIENDAS.split(',')
  .map((s) => s.trim())
  .filter(Boolean);
const PAGINA = 100;
/** Detalles (descuentos) por corrida: «en vivo» lee lo nuevo; las demás ponen al día lo que haya quedado sin leer. */
const MAX_DETALLES = { vivo: 80, cierre: 400, repaso: 400, manual: 1000 };
/**
 * Consultas al portal a la vez, en la misma página. Una por tienda y día, como antes; con 22 tiendas (11 sucursales,
 * normal y Turbo) en fila, «en vivo» tardaría minutos (docs/rappi-portal/05).
 */
const CONCURRENCIA = Math.min(6, Math.max(1, Number(RAPPI_CONCURRENCIA) || 3));
/** Tope de una reposición manual (días × tiendas), para que termine antes de los 10 min que espera n8n. */
const MAX_CONSULTAS_MANUAL = 400;

/** El portal respondió 401/403: la sesión ya no sirve. */
class SesionCaducada extends Error {}

/** Candado 1: lo único que puede salir del navegador fuera de GET/HEAD/OPTIONS. */
const SALIDAS = [
  /^https:\/\/login\.partners\.rappi\.com\//,
  // El formulario manda usuario y contraseña aquí (visto el 2026-10-29 en la primera corrida real), no a Auth0.
  // Solo autenticación (login y renovación del token): no toca datos de la tienda.
  /^https:\/\/services\.mxgrability\.rappi\.com\/api\/rs-platform-gateway\/rs-platform-security\//,
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/rests-stores-config\/orders\/by-stores\?country=MX$/,
];
/** Candado 2: las ÚNICAS llamadas al API de Rappi que hace el lector, ambas de lectura. */
const LECTURAS = [
  { metodo: 'POST', ruta: /^\/rests-stores-config\/orders\/by-stores\?country=MX$/ },
  { metodo: 'GET', ruta: /^\/rests-stores-config\/orders\/\d+\?country=MX&language=es$/ },
];

const escribir = (ruta, datos) => {
  writeFileSync(`${ruta}.tmp`, JSON.stringify(datos));
  renameSync(`${ruta}.tmp`, ruta);
};
const leerJson = (ruta, porOmision) => {
  try {
    return JSON.parse(readFileSync(ruta, 'utf8'));
  } catch {
    return porOmision;
  }
};

/** ¿La página tiene un access_token vigente (al menos 2 min)? */
const tokenVigente = (pagina) =>
  pagina
    .evaluate(() => {
      const t = localStorage.getItem('access_token');
      const exp = Number(localStorage.getItem('expires_at'));
      return !!t && exp > Date.now() + 120_000;
    })
    .catch(() => false);

/** Espera a que el portal termine de validar: true con sesión, false si se quedó en el login. */
async function esperarSesion(pagina, ms = 60_000) {
  const fin = Date.now() + ms;
  let enLoginDesde = null;
  while (Date.now() < fin) {
    const u = new URL(pagina.url());
    if (u.host === 'partners.rappi.com' && (await tokenVigente(pagina))) return true;
    // El portal pasa por /login con un spinner mientras valida; solo cuenta si el formulario sigue ahí 10 s.
    if (
      u.pathname.startsWith('/login') &&
      (await pagina
        .locator('#login-username')
        .isVisible()
        .catch(() => false))
    ) {
      enLoginDesde ??= Date.now();
      if (Date.now() - enLoginDesde > 10_000) return false;
    } else enLoginDesde = null;
    await pagina.waitForTimeout(1000);
  }
  return false;
}

/**
 * Deja la página en el formulario de login: 'formulario', 'sesion' si al recargar el portal recuperó la sesión, o null.
 * Al vencer el token, el portal a veces se queda en su spinner más de lo que espera esperarSesion (2026-10-29 21:48
 * UTC: no apareció el selector de país en 30 s y la corrida siguiente entró sin problema): se recarga /login una vez.
 */
async function abrirFormulario(pagina) {
  const usuario = pagina.locator('#login-username');
  for (let intento = 0; intento < 2; intento++) {
    if (intento) await pagina.goto(`${PORTAL}/login`, { waitUntil: 'domcontentloaded' });
    const fin = Date.now() + 45_000;
    while (Date.now() < fin) {
      if (await usuario.isVisible().catch(() => false)) return 'formulario';
      if (new URL(pagina.url()).host === 'partners.rappi.com' && (await tokenVigente(pagina)))
        return 'sesion';
      await pagina.waitForTimeout(1000);
    }
  }
  return null;
}

/**
 * Elige México y espera a que el formulario habilite usuario y contraseña (vienen `disabled` hasta elegir país).
 * La lista de países llega unos segundos después de que se ve el formulario y, al llegar, vuelve a Colombia: si se
 * eligió antes, el usuario se queda deshabilitado (cierre del 2026-11-02 06:30: `fill` agotó 30 s). Por eso espera a
 * que el <select> del formulario tenga los países, comprueba que se habilitó y reintenta hasta 4 veces.
 */
async function elegirMexico(pagina) {
  const habilitado = () =>
    pagina
      .locator('#login-username:enabled, #login-password:enabled')
      .count()
      .then((n) => n === 2)
      .catch(() => false);
  for (let intento = 0; intento < 4; intento++) {
    await pagina
      .waitForFunction(() => (document.querySelector('select')?.options.length ?? 0) > 1, null, {
        timeout: 15_000,
      })
      .catch(() => {});
    await pagina
      .locator('#login-country-trigger')
      .click({ timeout: 5_000 })
      .catch(() => {});
    await pagina
      .getByRole('option', { name: /México/ })
      .click({ timeout: 5_000 })
      .catch(() => {});
    const fin = Date.now() + 5_000;
    while (Date.now() < fin) {
      if (await habilitado()) return true;
      await pagina.waitForTimeout(500);
    }
  }
  return false;
}

/** { fallo: texto o null, entro: si hubo login con usuario y contraseña }. */
async function iniciarSesion(pagina) {
  if (!RAPPI_USUARIO || !RAPPI_CLAVE)
    return { fallo: 'Rappi cerró la sesión y no hay usuario del lector configurado.', entro: false };
  const bloqueo = leerJson(BLOQUEO, null);
  if (bloqueo && Date.now() - bloqueo.t < 6 * 3600_000)
    return {
      fallo:
        'El último inicio de sesión automático falló; no se reintenta hasta 6 h después. Revisa el usuario del lector.',
      entro: false,
    };
  const pantalla = await abrirFormulario(pagina);
  if (pantalla === 'sesion') return { fallo: null, entro: false };
  if (!pantalla)
    return {
      fallo: `El portal no mostró el formulario de inicio de sesión (${new URL(pagina.url()).pathname}). La siguiente corrida lo vuelve a intentar.`,
      entro: false,
    };
  // Sin el selector de país, el formulario cambió: no se manda la contraseña (ni cuenta como login fallido).
  const pais = pagina.locator('#login-country-trigger');
  if (
    !(await pais.waitFor({ state: 'visible', timeout: 15_000 }).then(
      () => true,
      () => false,
    ))
  )
    return {
      fallo: 'El formulario de inicio de sesión de Rappi cambió (no aparece el selector de país).',
      entro: false,
    };
  if (!(await elegirMexico(pagina)))
    return {
      fallo:
        'El formulario de inicio de sesión de Rappi no habilitó el usuario tras elegir México. La siguiente corrida lo vuelve a intentar.',
      entro: false,
    };
  await pagina.locator('#login-username').fill(RAPPI_USUARIO);
  await pagina.locator('#login-password').fill(RAPPI_CLAVE);
  await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  if (await esperarSesion(pagina, 90_000)) return { fallo: null, entro: true };
  escribir(BLOQUEO, { t: Date.now() });
  return {
    fallo:
      'El inicio de sesión automático no entró al portal (usuario, contraseña o un paso nuevo de Rappi).',
    entro: false,
  };
}

/** Llama al API del portal desde la página, con el token y los encabezados que usa la propia página. Solo LECTURAS. */
const pedirApi = (pagina, metodo, ruta, cuerpo) => {
  if (!LECTURAS.some((l) => l.metodo === metodo && l.ruta.test(ruta)))
    throw new Error(`SOLO LECTURA: llamada no permitida ${metodo} ${ruta}`);
  return pagina.evaluate(
    async ({ url, metodo, cuerpo, version }) => {
      const r = await fetch(url, {
        method: metodo,
        headers: {
          Authorization: `Bearer ${localStorage.getItem('access_token')}`,
          'Accept-Language': 'es',
          'Content-Type': 'application/json;charset=utf-8',
          'client-app-name': 'Partners Portal',
          'client-app-version': version,
        },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
      });
      return { status: r.status, json: await r.json().catch(() => null) };
    },
    { url: `${API}${ruta}`, metodo, cuerpo, version: RAPPI_CLIENTE_VERSION },
  );
};

/** Ventana por tipo de corrida (hora de México): vivo = ayer y hoy; cierre = 7 días; repaso = 14 días. */
function ventana({ tipo, desde, hasta }) {
  if (tipo === 'manual') return { desde, hasta };
  if (tipo === 'cierre') return { desde: fechaMX(-7), hasta: fechaMX(-1) };
  if (tipo === 'repaso') return { desde: fechaMX(-14), hasta: fechaMX(-1) };
  return { desde: fechaMX(-1), hasta: fechaMX(0) };
}

/** Pedidos de una tienda en un día. Si Rappi responde 429 o 5xx, reintenta dos veces con pausa. */
async function listarDia(pagina, tienda, dia) {
  let total = null;
  const vistos = new Map();
  for (let pag = 0; pag < 10; pag++) {
    let r;
    for (let intento = 0; ; intento++) {
      r = await pedirApi(pagina, 'POST', '/rests-stores-config/orders/by-stores?country=MX', {
        country_code: 'MX',
        language: 'es',
        from: dia,
        to: dia,
        store_ids: [tienda],
        page_number: pag,
        page_size: PAGINA,
        order_id: '',
      });
      if (!(r.status === 429 || r.status >= 500) || intento === 2) break;
      await esperar(2000 * (intento + 1));
    }
    if (r.status === 401 || r.status === 403)
      throw new SesionCaducada(`El portal respondió ${r.status} al historial.`);
    if (r.status !== 200 || !Array.isArray(r.json?.results))
      throw new Error(`Historial ${tienda} ${dia}: HTTP ${r.status}.`);
    total ??= r.json.total_rows;
    for (const o of r.json.results) vistos.set(String(o.id), o);
    // Rappi quita filas de cada página después de paginar (con page_size 10 entrega 8, 8, 4 de 25): una página
    // corta no es la última. Se sigue hasta cubrir total_rows (o hasta una página vacía).
    if (!r.json.results.length || (pag + 1) * PAGINA >= (total ?? 0)) break;
  }
  return { tienda, dia, total: total ?? 0, ordenes: [...vistos.values()] };
}

const idDe = (o) => String(o.id).replace(/^MX/, '');

async function sincronizar({ tipo, desde, hasta, tiendas = TIENDAS }) {
  const base = { tipo, desde, hasta, estado: 'ok', mensaje: '', tiendas: [], pedidos: [] };
  const inicio = Date.now();
  const navegador = await chromium.launch({
    headless: true,
    ...(CHROMIUM ? { executablePath: CHROMIUM } : {}),
  });
  try {
    const contexto = await navegador.newContext({
      ...(existsSync(ESTADO) ? { storageState: ESTADO } : {}),
      viewport: { width: 1366, height: 900 },
      locale: 'es-MX',
      timezoneId: 'America/Mexico_City',
    });
    // Candado 1 (SOLO LECTURA): lo que no sea de lectura no sale del navegador.
    const bloqueadas = [];
    await contexto.route('**/*', (ruta) => {
      const r = ruta.request();
      if (['GET', 'HEAD', 'OPTIONS'].includes(r.method()) || SALIDAS.some((x) => x.test(r.url())))
        return ruta.continue();
      const u = new URL(r.url());
      if (bloqueadas.length < 20) bloqueadas.push(`${r.method()} ${u.host}${u.pathname}`);
      return ruta.abort();
    });
    const pagina = await contexto.newPage();
    await pagina.goto(`${PORTAL}/home`, { waitUntil: 'domcontentloaded' });
    let relogin = false;
    if (!(await esperarSesion(pagina))) {
      const { fallo, entro } = await iniciarSesion(pagina);
      if (fallo)
        return {
          ...base,
          estado: 'sesion_expirada',
          mensaje: `${fallo}${bloqueadas.length ? ` Bloqueadas por SOLO LECTURA: ${bloqueadas.join(', ')}.` : ''}`,
        };
      relogin = entro;
    }

    // Historial: una consulta por tienda y día, CONCURRENCIA a la vez; los resultados quedan en orden de tienda y día.
    let listados;
    try {
      listados = await enParalelo(
        tiendas.flatMap((tienda) => diasEntre(desde, hasta).map((dia) => ({ tienda, dia }))),
        CONCURRENCIA,
        ({ tienda, dia }) => listarDia(pagina, tienda, dia),
      );
    } catch (e) {
      if (e instanceof SesionCaducada) return { ...base, estado: 'sesion_expirada', mensaje: e.message };
      throw e;
    }

    // Detalle (descuentos) solo de lo nuevo o cambiado, hasta el tope del tipo de corrida.
    const cache = leerJson(CACHE, {});
    const sinDetalle = listados
      .flatMap((l) => l.ordenes)
      .map((o) => ({ id: idDe(o), h: huellaListado(o) }))
      .filter(({ id, h }) => /^\d{5,20}$/.test(id) && cache[id]?.h !== h);
    const porLeer = sinDetalle.slice(0, MAX_DETALLES[tipo]);
    let detalles = 0;
    await enParalelo(porLeer, CONCURRENCIA, async ({ id, h }) => {
      const r = await pedirApi(pagina, 'GET', `/rests-stores-config/orders/${id}?country=MX&language=es`);
      if (r.status === 200 && r.json) {
        cache[id] = { h, d: { discount_info: r.json.discount_info ?? null }, t: Date.now() };
        detalles++;
      }
    });

    const pedidos = [];
    const omitidos = [];
    const porTienda = new Map(
      tiendas.map((t) => [t, { rappi_tienda_id: t, por_dia: {}, nombres: new Set() }]),
    );
    for (const l of listados) {
      const t = porTienda.get(l.tienda);
      t.por_dia[l.dia] = { total_rows: l.total, devueltos: l.ordenes.length };
      for (const o of l.ordenes) {
        if (o.store_name) t.nombres.add(String(o.store_name).trim());
        const id = idDe(o);
        const detalle = cache[id]?.h === huellaListado(o) ? cache[id].d : null;
        try {
          pedidos.push(pedidoDeListado(o, l.tienda, detalle));
        } catch (e) {
          omitidos.push(String(e.message).slice(0, 160));
        }
      }
    }
    // `nombre` es el de la tienda en sus pedidos: sirve para comprobar el ID de una tienda nueva. rappi_importar lo
    // ignora.
    base.tiendas = [...porTienda.values()].map(({ nombres, ...t }) =>
      nombres.size ? { ...t, nombre: [...nombres].join(' / ') } : t,
    );

    // Caché de detalles: solo lo de los últimos 30 días.
    const limite = Date.now() - 30 * 86_400_000;
    for (const [k, v] of Object.entries(cache)) if (v.t < limite) delete cache[k];
    escribir(CACHE, cache);
    escribir(ESTADO, await contexto.storageState());

    base.pedidos = pedidos;
    const faltan = base.tiendas.flatMap((t) =>
      Object.entries(t.por_dia)
        .filter(([, c]) => c.total_rows > c.devueltos)
        .map(([d, c]) => `${t.rappi_tienda_id} ${d}: ${c.total_rows - c.devueltos}`),
    );
    if (omitidos.length) {
      base.estado = 'error';
      base.mensaje = `Pedidos ilegibles: ${omitidos.join(' | ')}`;
      // Un pedido ilegible no debe marcar como desaparecidos a los demás: se manda sin pedidos.
      base.pedidos = [];
      base.tiendas = [];
    } else {
      base.estado = base.pedidos.length ? 'ok' : 'sin_ordenes';
      const resto = sinDetalle.length - detalles;
      base.mensaje = [
        relogin ? 'Sesión renovada con login automático.' : '',
        `Leídos ${base.pedidos.length} pedidos de ${tiendas.length} tiendas (${desde} a ${hasta}) en ${Math.round((Date.now() - inicio) / 1000)} s.`,
        sinDetalle.length
          ? `Descuentos leídos de ${detalles} pedidos${resto ? `; faltan ${resto} para las siguientes corridas` : ''}.`
          : '',
        // Visto el 2026-11-02: la descarga «ORDERS_HISTORY_REPORT» del portal trae los mismos pedidos que el listado,
        // así que la diferencia la cuenta Rappi pero no la muestra en ningún lado (docs/rappi-portal/01).
        faltan.length
          ? `El listado devolvió menos de lo que contó (Rappi tampoco los muestra en su historial ni en su descarga): ${faltan.join(', ')}.`
          : '',
      ]
        .filter(Boolean)
        .join(' ');
    }
    return base;
  } finally {
    await navegador.close();
  }
}

let enCurso = null;
const responder = (res, status, cuerpo) => {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(cuerpo));
};
createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/salud')
    return responder(res, 200, {
      ok: true,
      sesion: existsSync(ESTADO),
      usuario: !!RAPPI_USUARIO,
      tiendas: TIENDAS,
    });
  if (req.method !== 'POST' || req.url !== '/sincronizar')
    return responder(res, 404, { error: 'No encontrado' });
  if ((req.headers['x-api-key'] ?? '').trim() !== EXTRACTOR_KEY.trim())
    return responder(res, 401, { error: 'No autorizado' });
  let texto = '';
  for await (const c of req) {
    texto += c;
    if (texto.length > 10_000) return responder(res, 413, { error: 'Cuerpo muy grande' });
  }
  let datos = {};
  try {
    datos = texto ? JSON.parse(texto) : {};
  } catch {
    return responder(res, 400, { error: 'JSON inválido' });
  }
  const tipo = ['vivo', 'cierre', 'repaso', 'manual'].includes(datos.tipo) ? datos.tipo : 'vivo';
  const v = ventana({ tipo, desde: datos.desde, hasta: datos.hasta });
  const fecha = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !fecha.test(String(v.desde)) ||
    !fecha.test(String(v.hasta)) ||
    v.desde > v.hasta ||
    diasEntre(v.desde, v.hasta).length > 62
  )
    return responder(res, 400, { error: 'Periodo inválido (AAAA-MM-DD, máximo 62 días).' });
  // Solo en «manual»: otras tiendas de la cuenta, para comprobar una tienda antes de darla de alta en rappi_tiendas
  // (docs/rappi-portal/05). Es la misma lectura; rappi_importar rechaza el lote si trae una tienda sin alta.
  let tiendas = TIENDAS;
  if (datos.tiendas !== undefined) {
    if (
      tipo !== 'manual' ||
      !Array.isArray(datos.tiendas) ||
      !datos.tiendas.length ||
      datos.tiendas.length > 30 ||
      !datos.tiendas.every((t) => /^MX\d{6,20}$/.test(String(t)))
    )
      return responder(res, 400, {
        error: 'tiendas: solo en corridas manuales, de 1 a 30 IDs de Rappi (MX…).',
      });
    tiendas = [...new Set(datos.tiendas.map(String))];
  }
  if (tipo === 'manual' && diasEntre(v.desde, v.hasta).length * tiendas.length > MAX_CONSULTAS_MANUAL)
    return responder(res, 400, {
      error: `Reposición muy larga para ${tiendas.length} tiendas: a lo más ${Math.floor(MAX_CONSULTAS_MANUAL / tiendas.length)} días por corrida.`,
    });
  const vacio = { tipo, ...v, tiendas: [], pedidos: [] };
  if (enCurso)
    return responder(res, 200, { ...vacio, estado: 'ocupado', mensaje: 'Ya había una corrida en curso.' });
  enCurso = sincronizar({ tipo, ...v, tiendas });
  try {
    responder(res, 200, await enCurso);
  } catch (e) {
    responder(res, 200, {
      ...vacio,
      estado: 'error',
      mensaje: `Falla del lector: ${String(e?.message ?? e).slice(0, 300)}`,
    });
  } finally {
    enCurso = null;
  }
}).listen(Number(PUERTO), () =>
  console.log(`Lector de Rappi (The Coffee) en :${PUERTO}, tiendas ${TIENDAS.join(', ')}`),
);
