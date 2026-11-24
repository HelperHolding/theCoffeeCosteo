// Lector del portal de Rappi Partners para el cron de n8n (docs/rappi-portal/02). Contenedor junto a n8n.
//   POST /sincronizar {tipo: vivo|cierre|repaso|manual, desde?, hasta?, servicio?, espera?}  (header x-api-key)
//   → el lote de public.rappi_importar; n8n lo manda a Supabase. Si trae `servicio` (Nivel de servicio y
//   Conectividad, docs/rappi-portal/08), n8n lo guarda aparte con rappi_importar_servicio.
//   GET /salud
// SOLO LECTURA (pedido expreso de Carlo, 2026-10-29). El lector usa una cuenta real del portal, así que nunca debe
// cambiar nada en Rappi (pedidos, menú, tienda, horarios, promociones, usuarios, datos bancarios). Dos candados:
//   1. Navegador: toda petición que no sea GET/HEAD/OPTIONS se bloquea, salvo la autenticación (Auth0 en
//      login.partners.rappi.com y el login del portal en rs-platform-security) y las CONSULTAS por POST (historial
//      by-stores y las de Nivel de servicio y Conectividad: solo buscan). Ver SALIDAS.
//   2. Código: pedirApi solo acepta las lecturas de LECTURAS. Los endpoints que abren o cierran tiendas
//      (switch-stores, on-hold) existen en el portal y no están en ninguna de las dos listas.
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
import {
  diasEntre,
  enParalelo,
  esFallaSinRespuesta,
  fechaMX,
  huellaListado,
  intentosEn,
  pedidoDeListado,
  reintentable,
  reintentableEn,
} from './lote.mjs';
import {
  conectividadDe,
  diasDeMetricas,
  esperaDia,
  matrizSemana,
  planServicio,
  reclamosDe,
  tiendaNum,
  topDe,
} from './servicio.mjs';
import { menuCompacto, tocaMenu } from './menu.mjs';

const PORTAL = 'https://partners.rappi.com';
const API = 'https://services.rappi.com/rests-partners-gateway/cauth';
const {
  EXTRACTOR_KEY,
  RAPPI_USUARIO,
  RAPPI_CLAVE,
  RAPPI_TIENDAS = 'MX1930270777,MX1930301156',
  RAPPI_CLIENTE_VERSION = '4.6.7',
  RAPPI_CONCURRENCIA = '3',
  RAPPI_MARCA = '575472',
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
/** Nivel de servicio: por encima de ~45 días Rappi agrupa por mes; se pide en tramos de a lo más 31 días. */
const MAX_DIAS_SERVICIO = 31;
/** La corrida completa debe terminar antes de los 10 min que espera n8n: el servicio se corta a los 8. */
const LIMITE_CORRIDA_MS = 8 * 60_000;

/** El portal respondió 401/403, o no respondió tras los reintentos: la sesión ya no sirve (o no se puede usar). */
class SesionCaducada extends Error {}

/** Candado 1: lo único que puede salir del navegador fuera de GET/HEAD/OPTIONS. */
const SALIDAS = [
  /^https:\/\/login\.partners\.rappi\.com\//,
  // El formulario manda usuario y contraseña aquí (visto el 2026-10-29 en la primera corrida real), no a Auth0.
  // Solo autenticación (login y renovación del token): no toca datos de la tienda.
  /^https:\/\/services\.mxgrability\.rappi\.com\/api\/rs-platform-gateway\/rs-platform-security\//,
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/rests-stores-config\/orders\/by-stores\?country=MX$/,
  // Consultas de Nivel de servicio y Conectividad (periodo + tiendas; visto el 2026-11-20, docs/rappi-portal/08).
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/partners-indicators\/indicators\/v2\/summary\/metrics$/,
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/partners-indicators\/summary\/sales\/indicators\?with_variation=false$/,
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/partners-indicators\/indicators\/defects$/,
  /^https:\/\/services\.rappi\.com\/rests-partners-gateway\/cauth\/api\/rest-aliados-state-ms\/store-status-detail\/retrieve\?country=MX$/,
];
/** Candado 2: las ÚNICAS llamadas al API de Rappi que hace el lector, todas de lectura. */
const LECTURAS = [
  { metodo: 'POST', ruta: /^\/rests-stores-config\/orders\/by-stores\?country=MX$/ },
  { metodo: 'GET', ruta: /^\/rests-stores-config\/orders\/\d+\?country=MX&language=es$/ },
  // Nivel de servicio y Conectividad (docs/rappi-portal/08).
  { metodo: 'POST', ruta: /^\/partners-indicators\/indicators\/v2\/summary\/metrics$/ },
  { metodo: 'POST', ruta: /^\/partners-indicators\/summary\/sales\/indicators\?with_variation=false$/ },
  { metodo: 'POST', ruta: /^\/partners-indicators\/indicators\/defects$/ },
  { metodo: 'POST', ruta: /^\/api\/rest-aliados-state-ms\/store-status-detail\/retrieve\?country=MX$/ },
  {
    metodo: 'GET',
    ruta: /^\/partners-indicators\/indicators\/store\/availability-monitoring\/\d+\?country=MX$/,
  },
  { metodo: 'GET', ruta: /^\/api\/rests-score\/performance-system\/find\/brandId\/\d+\?country=MX$/ },
  // Menú/Carta (docs/rappi-portal/09): solo el GET. Los botones del menú (menu-update, menu-publish, item/{id}/active,
  // topping/massive/deactivate, delete, cms) no están en ninguna lista.
  { metodo: 'GET', ruta: /^\/partners-selfservice\/selfservice\/menu\/MX\d+$/ },
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

/**
 * Llama al API del portal desde la página, con el token y los encabezados que usa la propia página. Solo LECTURAS.
 * Sin respuesta HTTP (esFallaSinRespuesta) devuelve status 0 en vez de tumbar la corrida.
 */
const pedirApi = (pagina, metodo, ruta, cuerpo) => {
  if (!LECTURAS.some((l) => l.metodo === metodo && l.ruta.test(ruta)))
    throw new Error(`SOLO LECTURA: llamada no permitida ${metodo} ${ruta}`);
  return pagina
    .evaluate(
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
    )
    .catch((e) => {
      if (esFallaSinRespuesta(e)) return { status: 0, json: null };
      throw e;
    });
};

/** Ventana por tipo de corrida (hora de México): vivo = ayer y hoy; cierre = 7 días; repaso = 14 días. */
function ventana({ tipo, desde, hasta }) {
  if (tipo === 'manual') return { desde, hasta };
  if (tipo === 'cierre') return { desde: fechaMX(-7), hasta: fechaMX(-1) };
  if (tipo === 'repaso') return { desde: fechaMX(-14), hasta: fechaMX(-1) };
  return { desde: fechaMX(-1), hasta: fechaMX(0) };
}

/** Pedidos de una tienda en un día. Si Rappi responde 429 o 5xx, o no responde, reintenta dos veces con pausa. */
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
      if (!reintentable(r.status) || intento === 2) break;
      await esperar(2000 * (intento + 1));
    }
    if (r.status === 401 || r.status === 403)
      throw new SesionCaducada(`El portal respondió ${r.status} al historial.`);
    if (r.status === 0)
      throw new SesionCaducada('El portal no respondió al historial (Failed to fetch) en 3 intentos.');
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

/** Vuelve a cargar el portal y, si ya no hay sesión, entra con el usuario del lector. Igual que al iniciar. */
async function renovarSesion(pagina) {
  await pagina.goto(`${PORTAL}/home`, { waitUntil: 'domcontentloaded' });
  if (await esperarSesion(pagina)) return { fallo: null, entro: false };
  return iniciarSesion(pagina);
}

/**
 * Nivel de servicio y Conectividad según el plan de la corrida (planServicio). Nunca tumba la corrida: lo que falle se
 * cuenta en `fallas` y se reporta en el mensaje; lo que sí se leyó se guarda. Se corta al llegar a LIMITE_CORRIDA_MS.
 * `tiendaDePedido` y `tiendaDeNombre` salen del historial de esta corrida (los reclamos solo traen pedido y nombre).
 */
async function leerServicio(pagina, plan, { tiendas, inicio, tiendaDePedido, tiendaDeNombre }) {
  const servicio = { momento: new Date().toISOString() };
  const fallas = [];
  const partes = [];
  let cortado = false;
  const consulta = async (metodo, ruta, cuerpo) => {
    if (Date.now() - inicio > LIMITE_CORRIDA_MS) {
      cortado = true;
      return null;
    }
    let r;
    for (let intento = 0; ; intento++) {
      r = await pedirApi(pagina, metodo, ruta, cuerpo);
      if (!reintentableEn(ruta, r.status) || intento === intentosEn(ruta) - 1) break;
      await esperar(2000 * (intento + 1));
    }
    if (r.status === 200 && r.json !== null) return r.json;
    fallas.push(`${ruta.split('?')[0].split('/').slice(-2).join('/')} ${r.status}`);
    return null;
  };
  const cuerpo = (desde, hasta, ids) => ({ country_code: 'MX', from: desde, to: hasta, store_ids: ids });

  if (plan.conectividad) {
    const grupos = [];
    for (let i = 0; i < tiendas.length; i += 10) grupos.push(tiendas.slice(i, i + 10).map(tiendaNum));
    const fotos = await enParalelo(grupos, CONCURRENCIA, (g) =>
      consulta('POST', '/api/rest-aliados-state-ms/store-status-detail/retrieve?country=MX', g),
    );
    servicio.conectividad = fotos.flatMap((j) => (j ? conectividadDe(j) : []));
    const apagadas = servicio.conectividad.filter((c) => c.estado !== 'ACTIVE').length;
    partes.push(`conectividad de ${servicio.conectividad.length} tiendas (${apagadas} sin activar)`);
  }

  const dias = new Map();
  const agregar = (filas) => {
    for (const f of filas)
      dias.set(`${f.tienda}|${f.fecha}`, { ...dias.get(`${f.tienda}|${f.fecha}`), ...f });
  };
  if (plan.dias) {
    const { desde, hasta } = plan.dias;
    const porTienda = await enParalelo(tiendas, CONCURRENCIA, async (t) => {
      const j = await consulta(
        'POST',
        '/partners-indicators/indicators/v2/summary/metrics',
        cuerpo(desde, hasta, [t]),
      );
      try {
        return j ? diasDeMetricas(t, j) : [];
      } catch (e) {
        fallas.push(String(e.message).slice(0, 120));
        return [];
      }
    });
    agregar(porTienda.flat());
    // Sin unavailability/metrics: con varias tiendas devuelve casi puros ceros y sus minutos no son el % del portal
    // (2026-11-20). El tiempo sin disponibilidad es `indisponibilidad` (%), que viene en las métricas de arriba.
  }
  if (plan.espera.length) {
    const pares = tiendas.flatMap((t) => plan.espera.map((d) => ({ t, d })));
    const esperas = await enParalelo(pares, CONCURRENCIA, async ({ t, d }) => {
      const j = await consulta(
        'POST',
        '/partners-indicators/summary/sales/indicators?with_variation=false',
        cuerpo(d, d, [t]),
      );
      return j ? esperaDia(t, d, j) : null;
    });
    agregar(esperas.filter(Boolean));
  }
  if (dias.size) {
    servicio.dias = [...dias.values()];
    partes.push(`indicadores de ${servicio.dias.length} tienda-días`);
  }

  if (plan.reclamos) {
    const ordenes = [];
    for (let pagina_ = 0; pagina_ < 20; pagina_++) {
      const j = await consulta('POST', '/partners-indicators/indicators/defects', {
        ...cuerpo(plan.reclamos.desde, plan.reclamos.hasta, tiendas),
        order_by: 'DATE',
        order_id: '',
        ordering: 'DESC',
        page: pagina_,
        size: 200,
      });
      if (!j) break;
      ordenes.push(...(j.result?.orders ?? []));
      if (pagina_ + 1 >= (j.result?.total_pages ?? 0)) break;
    }
    const { reclamos, sinTienda } = reclamosDe(ordenes, { tiendaDePedido, tiendaDeNombre });
    servicio.reclamos = reclamos;
    partes.push(`${reclamos.length} reclamos`);
    if (sinTienda.length)
      fallas.push(`${sinTienda.length} reclamos sin tienda (${sinTienda.slice(0, 5).join(', ')})`);
  }

  const hoy = fechaMX(0);
  if (plan.semana) {
    const matrices = await enParalelo(tiendas, CONCURRENCIA, async (t) => {
      const j = await consulta(
        'GET',
        `/partners-indicators/indicators/store/availability-monitoring/${tiendaNum(t)}?country=MX`,
      );
      return j ? { tienda: t, fecha: hoy, matriz: matrizSemana(j) } : null;
    });
    servicio.disponibilidad_semana = matrices.filter((m) => m && Object.keys(m.matriz).length);
    partes.push(`calor de 15 días de ${servicio.disponibilidad_semana.length} tiendas`);
  }
  if (plan.top) {
    const j = await consulta(
      'GET',
      `/api/rests-score/performance-system/find/brandId/${RAPPI_MARCA}?country=MX`,
    );
    servicio.top = j ? topDe(hoy, j).filter((x) => tiendas.includes(x.tienda)) : [];
  }
  if (cortado) fallas.push('se cortó para no pasar de 8 min');
  return { servicio, partes, fallas };
}

/**
 * Menú/Carta de cada tienda (docs/rappi-portal/09). Nunca tumba la corrida: una tienda que falla va en `fallidas` con su
 * motivo y las demás se guardan. Se corta al llegar a LIMITE_CORRIDA_MS (las que faltan van como fallidas).
 */
async function leerMenu(pagina, tiendas, inicio) {
  const fallidas = [];
  const leidas = await enParalelo(tiendas, CONCURRENCIA, async (t) => {
    if (Date.now() - inicio > LIMITE_CORRIDA_MS) {
      fallidas.push({ tienda: t, motivo: 'se cortó para no pasar de 8 min' });
      return null;
    }
    let r;
    for (let intento = 0; ; intento++) {
      r = await pedirApi(pagina, 'GET', `/partners-selfservice/selfservice/menu/${t}`);
      if (!reintentable(r.status) || intento === 2) break;
      await esperar(2000 * (intento + 1));
    }
    if (r.status !== 200 || !r.json) {
      fallidas.push({ tienda: t, motivo: `HTTP ${r.status}` });
      return null;
    }
    try {
      return menuCompacto(t, r.json);
    } catch (e) {
      fallidas.push({ tienda: t, motivo: String(e.message).slice(0, 120) });
      return null;
    }
  });
  return { momento: new Date().toISOString(), tiendas: leidas.filter(Boolean), fallidas };
}

async function sincronizar({ tipo, desde, hasta, tiendas = TIENDAS, plan = null, menu = false }) {
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
    /** Motivo, si hubo que volver a entrar a media lectura. */
    let recuperada = '';
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
    // Si la sesión se cae a media lectura (el token vence durante la corrida), se vuelve a entrar UNA vez y se leen
    // solo las consultas que faltaban.
    const consultas = tiendas.flatMap((tienda) => diasEntre(desde, hasta).map((dia) => ({ tienda, dia })));
    const clave = ({ tienda, dia }) => `${tienda}|${dia}`;
    const leidas = new Map();
    for (let vuelta = 0; ; vuelta++) {
      try {
        await enParalelo(
          consultas.filter((c) => !leidas.has(clave(c))),
          CONCURRENCIA,
          async (c) => leidas.set(clave(c), await listarDia(pagina, c.tienda, c.dia)),
        );
        break;
      } catch (e) {
        if (!(e instanceof SesionCaducada)) throw e;
        if (vuelta)
          return {
            ...base,
            estado: 'sesion_expirada',
            mensaje: `${e.message} Ya se había vuelto a entrar en esta corrida; la siguiente lo intenta de nuevo.`,
          };
        const { fallo, entro } = await renovarSesion(pagina);
        if (fallo) return { ...base, estado: 'sesion_expirada', mensaje: `${e.message} ${fallo}` };
        relogin ||= entro;
        recuperada = e.message;
      }
    }
    const listados = consultas.map((c) => leidas.get(clave(c)));

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

    // Nivel de servicio y Conectividad (docs/rappi-portal/08): aparte del lote de pedidos; si falla no lo tumba.
    let resumenServicio = '';
    if (plan) {
      const tiendaDePedido = new Map(listados.flatMap((l) => l.ordenes.map((o) => [idDe(o), l.tienda])));
      const tiendaDeNombre = new Map(
        [...porTienda.values()].flatMap((t) => [...t.nombres].map((n) => [n, t.rappi_tienda_id])),
      );
      try {
        const { servicio, partes, fallas } = await leerServicio(pagina, plan, {
          tiendas,
          inicio,
          tiendaDePedido,
          tiendaDeNombre,
        });
        base.servicio = servicio;
        resumenServicio = `Servicio: ${partes.join(', ') || 'nada'}.`;
        if (fallas.length) {
          base.servicio_error = `Nivel de servicio con fallas: ${fallas.slice(0, 8).join('; ')}.`;
          resumenServicio += ` ${base.servicio_error}`;
        }
      } catch (e) {
        base.servicio_error = `Nivel de servicio no se pudo leer: ${String(e?.message ?? e).slice(0, 200)}`;
        resumenServicio = base.servicio_error;
      }
    }

    // Menú/Carta (docs/rappi-portal/09): cada 30 min; aparte del lote de pedidos y si falla no lo tumba.
    let resumenMenu = '';
    if (menu) {
      try {
        base.menu = await leerMenu(pagina, tiendas, inicio);
        const apagados = base.menu.tiendas.reduce(
          (a, t) => a + t.productos.filter((p) => !p.disponible).length,
          0,
        );
        resumenMenu = `Menú: ${base.menu.tiendas.length} de ${tiendas.length} tiendas, ${apagados} productos apagados.`;
        if (base.menu.fallidas.length) {
          base.menu_error = `Menú con fallas: ${base.menu.fallidas
            .slice(0, 5)
            .map((f) => `${f.tienda} ${f.motivo}`)
            .join('; ')}${base.menu.fallidas.length > 5 ? ` y ${base.menu.fallidas.length - 5} más` : ''}.`;
          resumenMenu += ` ${base.menu_error}`;
        }
      } catch (e) {
        base.menu_error = `El menú no se pudo leer: ${String(e?.message ?? e).slice(0, 200)}`;
        resumenMenu = base.menu_error;
      }
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
      const resto = sinDetalle.length - detalles;
      base.mensaje = [
        relogin ? 'Sesión renovada con login automático.' : '',
        recuperada ? `A media lectura: ${recuperada} Se volvió a entrar y se terminó la lectura.` : '',
        `Leídos ${base.pedidos.length} pedidos de ${tiendas.length} tiendas (${desde} a ${hasta}) en ${Math.round((Date.now() - inicio) / 1000)} s.`,
        sinDetalle.length
          ? `Descuentos leídos de ${detalles} pedidos${resto ? `; faltan ${resto} para las siguientes corridas` : ''}.`
          : '',
        // Visto el 2026-11-02: la descarga «ORDERS_HISTORY_REPORT» del portal trae los mismos pedidos que el listado,
        // así que la diferencia la cuenta Rappi pero no la muestra en ningún lado (docs/rappi-portal/01).
        faltan.length
          ? `El listado devolvió menos de lo que contó (Rappi tampoco los muestra en su historial ni en su descarga): ${faltan.join(', ')}.`
          : '',
        resumenServicio,
        resumenMenu,
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
  // Nivel de servicio (docs/rappi-portal/08): en las corridas programadas, siempre; en las manuales, solo si se pide
  // (`servicio`, y `espera` para la espera del repartidor por tienda y día, que es una consulta por cada par).
  const servicio = datos.servicio === true;
  const espera = datos.espera === true;
  if (tipo === 'manual' && servicio && diasEntre(v.desde, v.hasta).length > MAX_DIAS_SERVICIO)
    return responder(res, 400, {
      error: `Nivel de servicio: a lo más ${MAX_DIAS_SERVICIO} días por corrida.`,
    });
  if (
    tipo === 'manual' &&
    espera &&
    diasEntre(v.desde, v.hasta).length * tiendas.length > MAX_CONSULTAS_MANUAL
  )
    return responder(res, 400, {
      error: `Espera del repartidor para ${tiendas.length} tiendas: a lo más ${Math.floor(MAX_CONSULTAS_MANUAL / tiendas.length)} días por corrida.`,
    });
  const minuto = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Mexico_City', minute: 'numeric' }).format(
      new Date(),
    ),
  );
  const plan = planServicio({ tipo, ...v, servicio, espera, hoy: fechaMX(0), minuto });
  const vacio = { tipo, ...v, tiendas: [], pedidos: [] };
  if (enCurso)
    return responder(res, 200, { ...vacio, estado: 'ocupado', mensaje: 'Ya había una corrida en curso.' });
  const menu = tocaMenu({ tipo, minuto, menu: datos.menu === true });
  enCurso = sincronizar({ tipo, ...v, tiendas, plan, menu });
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
