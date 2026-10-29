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
// Variables: EXTRACTOR_KEY, RAPPI_USUARIO, RAPPI_CLAVE, RAPPI_TIENDAS (coma), DATOS (/datos), PUERTO (3101).
import { createServer } from 'node:http';
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { diasEntre, fechaMX, huellaListado, pedidoDeListado } from './lote.mjs';

const PORTAL = 'https://partners.rappi.com';
const API = 'https://services.rappi.com/rests-partners-gateway/cauth';
const {
  EXTRACTOR_KEY,
  RAPPI_USUARIO,
  RAPPI_CLAVE,
  RAPPI_TIENDAS = 'MX1930270777,MX1930301156',
  RAPPI_CLIENTE_VERSION = '4.6.7',
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
const MAX_DETALLES = 80;

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

async function iniciarSesion(pagina) {
  if (!RAPPI_USUARIO || !RAPPI_CLAVE) return 'Rappi cerró la sesión y no hay usuario del lector configurado.';
  const bloqueo = leerJson(BLOQUEO, null);
  if (bloqueo && Date.now() - bloqueo.t < 6 * 3600_000)
    return 'El último inicio de sesión automático falló; no se reintenta hasta 6 h después. Revisa el usuario del lector.';
  await pagina.locator('#login-country-trigger').click();
  await pagina.getByRole('option', { name: /México/ }).click();
  await pagina.locator('#login-username').fill(RAPPI_USUARIO);
  await pagina.locator('#login-password').fill(RAPPI_CLAVE);
  await pagina.getByRole('button', { name: 'Iniciar sesión', exact: true }).click();
  if (await esperarSesion(pagina, 90_000)) return null;
  escribir(BLOQUEO, { t: Date.now() });
  return 'El inicio de sesión automático no entró al portal (usuario, contraseña o un paso nuevo de Rappi).';
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

async function sincronizar({ tipo, desde, hasta }) {
  const base = { tipo, desde, hasta, estado: 'ok', mensaje: '', tiendas: [], pedidos: [] };
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
      const fallo = await iniciarSesion(pagina);
      if (fallo)
        return {
          ...base,
          estado: 'sesion_expirada',
          mensaje: `${fallo}${bloqueadas.length ? ` Bloqueadas por SOLO LECTURA: ${bloqueadas.join(', ')}.` : ''}`,
        };
      relogin = true;
    }

    const cache = leerJson(CACHE, {});
    const pedidos = [];
    const omitidos = [];
    let nuevosDetalles = 0;
    for (const tienda of TIENDAS) {
      const porDia = {};
      for (const dia of diasEntre(desde, hasta)) {
        let total = null;
        const vistos = new Map();
        for (let pag = 0; pag < 10; pag++) {
          const r = await pedirApi(pagina, 'POST', '/rests-stores-config/orders/by-stores?country=MX', {
            country_code: 'MX',
            language: 'es',
            from: dia,
            to: dia,
            store_ids: [tienda],
            page_number: pag,
            page_size: PAGINA,
            order_id: '',
          });
          if (r.status === 401 || r.status === 403)
            return {
              ...base,
              estado: 'sesion_expirada',
              mensaje: `El portal respondió ${r.status} al historial.`,
            };
          if (r.status !== 200 || !Array.isArray(r.json?.results))
            throw new Error(`Historial ${tienda} ${dia}: HTTP ${r.status}.`);
          total ??= r.json.total_rows;
          for (const o of r.json.results) vistos.set(String(o.id), o);
          if (r.json.results.length < PAGINA) break;
        }
        porDia[dia] = { total_rows: total ?? 0, devueltos: vistos.size };
        for (const o of vistos.values()) {
          const id = String(o.id).replace(/^MX/, '');
          const h = huellaListado(o);
          let detalle = cache[id]?.h === h ? cache[id].d : null;
          if (!detalle && nuevosDetalles < MAX_DETALLES) {
            nuevosDetalles++;
            const r = await pedirApi(
              pagina,
              'GET',
              `/rests-stores-config/orders/${id}?country=MX&language=es`,
            );
            if (r.status === 200 && r.json) {
              detalle = { discount_info: r.json.discount_info ?? null };
              cache[id] = { h, d: detalle, t: Date.now() };
            }
          }
          try {
            pedidos.push(pedidoDeListado(o, tienda, detalle));
          } catch (e) {
            omitidos.push(String(e.message).slice(0, 160));
          }
        }
      }
      base.tiendas.push({ rappi_tienda_id: tienda, por_dia: porDia });
    }

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
      base.mensaje = [
        relogin ? 'Sesión renovada con login automático.' : '',
        `Leídos ${base.pedidos.length} pedidos de ${TIENDAS.length} tiendas (${desde} a ${hasta}).`,
        faltan.length ? `El listado devolvió menos de lo que contó: ${faltan.join(', ')}.` : '',
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
  const vacio = { tipo, ...v, tiendas: [], pedidos: [] };
  if (enCurso)
    return responder(res, 200, { ...vacio, estado: 'ocupado', mensaje: 'Ya había una corrida en curso.' });
  enCurso = sincronizar({ tipo, ...v });
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
