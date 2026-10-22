import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { leerEnvLocal } from '../zoho/cliente';

/**
 * Exploración GET acotada de la API The Coffee (Brasil) para el módulo Sucursales.
 * Solo lectura. El token se lee de .env.local (THECOFFEE_API_TOKEN) y nunca se imprime.
 * Las respuestas crudas se guardan FUERA del repo (SUCURSALES_API_DIR o %TEMP%/thecoffee-sucursales-api).
 *
 *   npx tsx scripts/sucursales/explorar-api.ts lista
 *   npx tsx scripts/sucursales/explorar-api.ts pagina  --company 123 --desde 2026-10-20 --hasta 2026-10-20 --por 20 --pag 1
 *   npx tsx scripts/sucursales/explorar-api.ts matriz  --company 123 --dia 2026-10-20
 *   npx tsx scripts/sucursales/explorar-api.ts extraer --company 123 --desde 2026-10-13 --hasta 2026-10-19 [--por 100] [--max 60]
 *   npx tsx scripts/sucursales/explorar-api.ts perfilar --archivo <extraccion.json>    sin llamadas a la API
 */

const BASE = 'https://api.thecoffee.jp';
const DIR = process.env.SUCURSALES_API_DIR ?? join(tmpdir(), 'thecoffee-sucursales-api');
const PAUSA_MS = 400;
const TIMEOUT_MS = 30_000;
const REINTENTOS = 3;
// Headers que vale la pena registrar (nunca los de autenticación ni cookies).
const HEADERS_UTILES =
  /^(content-type|content-length|etag|x-total|x-total-count|x-page|x-per-page|link|x-ratelimit|ratelimit|retry-after|cache-control|age|x-request-id)/i;

type Lectura = {
  ruta: string;
  status: number;
  ms: number;
  intentos: number;
  headers: Record<string, string>;
  cuerpo: unknown;
  en: string;
};

const pausa = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function token(): Promise<string> {
  const t = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
  if (!t)
    throw new Error(
      'Falta THECOFFEE_API_TOKEN en .env.local (agrégalo tú en el editor; no lo pegues en el chat).',
    );
  return t;
}

async function get(tk: string, ruta: string): Promise<Lectura> {
  for (let intento = 1; ; intento++) {
    const inicio = performance.now();
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(BASE + ruta, {
        headers: { Authorization: `Bearer ${tk}`, Accept: 'application/json' },
        signal: ctrl.signal,
      });
      const ms = Math.round(performance.now() - inicio);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => HEADERS_UTILES.test(k) && (headers[k] = v));
      const texto = await res.text();
      let cuerpo: unknown = texto;
      try {
        cuerpo = JSON.parse(texto);
      } catch {}
      const reintentable = res.status === 429 || res.status >= 500;
      if (reintentable && intento < REINTENTOS) {
        const ra = Number(res.headers.get('retry-after'));
        await pausa(Number.isFinite(ra) && ra > 0 ? Math.min(ra, 30) * 1000 : 1000 * 2 ** intento);
        continue;
      }
      return {
        ruta,
        status: res.status,
        ms,
        intentos: intento,
        headers,
        cuerpo,
        en: new Date().toISOString(),
      };
    } catch (e) {
      if (intento < REINTENTOS) {
        await pausa(1000 * 2 ** intento);
        continue;
      }
      return {
        ruta,
        status: 0,
        ms: Math.round(performance.now() - inicio),
        intentos: intento,
        headers: {},
        cuerpo: String(e),
        en: new Date().toISOString(),
      };
    } finally {
      clearTimeout(timer);
      await pausa(PAUSA_MS);
    }
  }
}

const rutaPedidos = (company: string, q: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(q)) if (v !== undefined) p.set(k, String(v));
  const qs = p.toString();
  return `/order/company/${encodeURIComponent(company)}${qs ? `?${qs}` : ''}`;
};

async function guardar(nombre: string, datos: unknown) {
  await mkdir(DIR, { recursive: true });
  const archivo = join(DIR, `${new Date().toISOString().replace(/[:.]/g, '-')}-${nombre}.json`);
  await writeFile(archivo, JSON.stringify(datos, null, 2));
  return archivo;
}

type Pedido = Record<string, unknown> & { id?: unknown; createdAt?: unknown };
/** La API responde un envelope {currentPage,totalItems,totalPages,perPage,from,to,data}; se acepta también un array. */
const comoLista = (c: unknown): Pedido[] | null =>
  Array.isArray(c)
    ? (c as Pedido[])
    : c && typeof c === 'object' && Array.isArray((c as { data?: unknown }).data)
      ? (c as { data: Pedido[] }).data
      : null;
const meta = (c: unknown) => {
  if (!c || typeof c !== 'object' || Array.isArray(c)) return null;
  const { data: _d, ...resto } = c as Record<string, unknown>;
  return resto;
};

function resumenPagina(l: Lectura) {
  const lista = comoLista(l.cuerpo);
  const fechas = (lista ?? [])
    .map((p) => String(p.createdAt ?? ''))
    .filter(Boolean)
    .sort();
  return {
    ruta: l.ruta,
    status: l.status,
    ms: l.ms,
    intentos: l.intentos,
    headers: l.headers,
    forma: lista
      ? 'array'
      : typeof l.cuerpo === 'object' && l.cuerpo
        ? `objeto{${Object.keys(l.cuerpo).join(',')}}`
        : typeof l.cuerpo,
    meta: meta(l.cuerpo),
    n: lista?.length ?? null,
    ids: lista ? lista.map((p) => p.id) : null,
    createdAtMin: fechas[0] ?? null,
    createdAtMax: fechas.at(-1) ?? null,
    error: lista ? null : l.status >= 400 || l.status === 0 ? l.cuerpo : null,
  };
}

function args() {
  const a = process.argv.slice(3);
  const o: Record<string, string> = {};
  for (let i = 0; i < a.length; i += 2) o[a[i].replace(/^--/, '')] = a[i + 1];
  return o;
}

async function lista() {
  const tk = await token();
  const l = await get(tk, '/company/list/all');
  const archivo = await guardar('lista', l);
  const items = comoLista(l.cuerpo) ?? [];
  const ids = items.map((c) => c.id);
  const nombres = items.map((c) => String(c.name ?? ''));
  const dupIds = ids.filter((v, i) => ids.indexOf(v) !== i);
  const dupNombres = nombres.filter((v, i) => nombres.indexOf(v) !== i);
  const claves = new Map<string, number>();
  for (const c of items) for (const k of Object.keys(c)) claves.set(k, (claves.get(k) ?? 0) + 1);
  const candidatos = items.filter((c) => /ju[aá]rez|477|sauce|elise/i.test(String(c.name ?? '')));
  console.log(
    JSON.stringify(
      {
        status: l.status,
        ms: l.ms,
        headers: l.headers,
        total: items.length,
        claves: Object.fromEntries(claves),
        dupIds,
        dupNombres,
        candidatos,
        archivo,
      },
      null,
      2,
    ),
  );
}

async function pagina() {
  const o = args();
  const tk = await token();
  const l = await get(
    tk,
    rutaPedidos(o.company, { dateStart: o.desde, dateEnd: o.hasta, perPage: o.por, page: o.pag }),
  );
  const archivo = await guardar(`pagina-${o.company}`, l);
  console.log(JSON.stringify({ ...resumenPagina(l), archivo }, null, 2));
}

/** Matriz B2 alrededor de un día reciente: tamaños de página, páginas consecutivas, fronteras y relectura. */
async function matriz() {
  const o = args();
  const tk = await token();
  const c = o.company;
  const dia = o.dia;
  const d = (n: number) =>
    new Date(Date.parse(dia + 'T12:00:00Z') + n * 86_400_000).toISOString().slice(0, 10);
  const casos: [string, string][] = [
    ['sin-filtros', rutaPedidos(c, {})],
    ['dia-p20-pag1', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 20, page: 1 })],
    ['dia-p20-pag2', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 20, page: 2 })],
    ['dia-p50-pag1', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 50, page: 1 })],
    ['dia-p100-pag1', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 100, page: 1 })],
    ['dia-anterior-p100', rutaPedidos(c, { dateStart: d(-1), dateEnd: d(-1), perPage: 100, page: 1 })],
    ['dos-dias-p100', rutaPedidos(c, { dateStart: d(-1), dateEnd: dia, perPage: 100, page: 1 })],
    ['futuro-p20', rutaPedidos(c, { dateStart: d(30), dateEnd: d(31), perPage: 20, page: 1 })],
    ['pagina-alta', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 20, page: 999 })],
    ['relectura-dia-p20-pag1', rutaPedidos(c, { dateStart: dia, dateEnd: dia, perPage: 20, page: 1 })],
  ];
  const lecturas: Record<string, Lectura> = {};
  for (const [nombre, ruta] of casos) lecturas[nombre] = await get(tk, ruta);
  const archivo = await guardar(`matriz-${c}-${dia}`, lecturas);
  const res = Object.fromEntries(
    Object.entries(lecturas).map(([k, l]) => [
      k,
      { ...resumenPagina(l), ids: undefined, idsN: comoLista(l.cuerpo)?.length },
    ]),
  );
  const ids = (k: string) => new Set((comoLista(lecturas[k].cuerpo) ?? []).map((p) => String(p.id)));
  const inter = (a: Set<string>, b: Set<string>) => [...a].filter((x) => b.has(x)).length;
  const p1 = ids('dia-p20-pag1'),
    p2 = ids('dia-p20-pag2'),
    p50 = ids('dia-p50-pag1'),
    p100 = ids('dia-p100-pag1');
  const ant = ids('dia-anterior-p100'),
    dos = ids('dos-dias-p100'),
    rel = ids('relectura-dia-p20-pag1');
  console.log(
    JSON.stringify(
      {
        casos: res,
        cruces: {
          'pag1∩pag2(p20)': inter(p1, p2),
          'pag1∪pag2 ⊆ p100': [...p1, ...p2].every((x) => p100.has(x)),
          'p50 ⊆ p100': [...p50].every((x) => p100.has(x)),
          'dia∩diaAnterior': inter(p100, ant),
          'dosDias = dia+anterior?': { dosDias: dos.size, suma: p100.size + ant.size },
          'relectura igual a pag1': p1.size === rel.size && [...p1].every((x) => rel.has(x)),
          'orden pag1 (ids)': (comoLista(lecturas['dia-p20-pag1'].cuerpo) ?? []).map((p) => p.id),
        },
        archivo,
      },
      null,
      2,
    ),
  );
}

/** Extracción paginada completa de una ventana cerrada, con deduplicación y tope de páginas. */
async function extraer() {
  const o = args();
  const tk = await token();
  const por = Number(o.por ?? 100);
  const max = Number(o.max ?? 60);
  const vistos = new Map<string, Pedido>();
  const paginas: ReturnType<typeof resumenPagina>[] = [];
  let fin = 'tope-de-paginas';
  let firmaAnterior = '';
  for (let pag = 1; pag <= max; pag++) {
    const l = await get(
      tk,
      rutaPedidos(o.company, { dateStart: o.desde, dateEnd: o.hasta, perPage: por, page: pag }),
    );
    const r = resumenPagina(l);
    paginas.push({ ...r, ids: undefined } as never);
    const lista = comoLista(l.cuerpo);
    if (!lista) {
      fin = `error-${l.status}`;
      break;
    }
    if (lista.length === 0) {
      fin = 'pagina-vacia';
      break;
    }
    const firma = lista.map((p) => p.id).join(',');
    if (firma === firmaAnterior) {
      fin = 'pagina-repetida';
      break;
    }
    firmaAnterior = firma;
    let nuevos = 0;
    for (const p of lista)
      if (!vistos.has(String(p.id))) {
        vistos.set(String(p.id), p);
        nuevos++;
      }
    if (nuevos === 0) {
      fin = 'sin-ids-nuevos';
      break;
    }
    const tp = Number((meta(l.cuerpo) ?? {}).totalPages);
    if (Number.isFinite(tp) && pag >= tp) {
      fin = 'totalPages-alcanzado';
      break;
    }
    // Una página corta NO se toma como final: se pide la siguiente para confirmar que viene vacía.
  }
  const pedidos = [...vistos.values()];
  const archivo = await guardar(`extraccion-${o.company}-${o.desde}_${o.hasta}`, {
    company: o.company,
    desde: o.desde,
    hasta: o.hasta,
    por,
    fin,
    paginas,
    pedidos,
  });
  const filas = paginas.reduce((s, p) => s + (p.n ?? 0), 0);
  console.log(
    JSON.stringify(
      {
        fin,
        paginasLeidas: paginas.length,
        filas,
        unicos: pedidos.length,
        duplicados: filas - pedidos.length,
        msTotal: paginas.reduce((s, p) => s + p.ms, 0),
        archivo,
      },
      null,
      2,
    ),
  );
}

// ---------- perfilado sin llamadas a la API ----------
const tipo = (v: unknown) => (v === null ? 'null' : Array.isArray(v) ? 'array' : typeof v);
function perfilCampos(objs: Record<string, unknown>[]) {
  const out: Record<
    string,
    {
      presentes: number;
      tipos: Record<string, number>;
      vacios: number;
      ceros: number;
      ejemplosDistintos: number;
      top: [string, number][];
    }
  > = {};
  const claves = new Set(objs.flatMap((o) => Object.keys(o)));
  for (const k of claves) {
    const tipos: Record<string, number> = {};
    const dist = new Map<string, number>();
    let presentes = 0,
      vacios = 0,
      ceros = 0;
    for (const o of objs) {
      if (!(k in o)) continue;
      presentes++;
      const v = o[k];
      tipos[tipo(v)] = (tipos[tipo(v)] ?? 0) + 1;
      if (v === '') vacios++;
      if (v === 0) ceros++;
      if (tipo(v) !== 'array' && tipo(v) !== 'object') dist.set(String(v), (dist.get(String(v)) ?? 0) + 1);
    }
    const top = [...dist.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
    out[k] = { presentes, tipos, vacios, ceros, ejemplosDistintos: dist.size, top };
  }
  return out;
}
const num = (v: unknown) =>
  typeof v === 'number' ? v : typeof v === 'string' && v.trim() !== '' && !isNaN(Number(v)) ? Number(v) : NaN;
const r2 = (x: number) => Math.round(x * 100) / 100;
const decimales = (x: number) => (Number.isInteger(x) ? 0 : (String(x).split('.')[1]?.length ?? 0));

async function perfilar() {
  const o = args();
  const datos = JSON.parse(await readFile(o.archivo, 'utf8')) as { pedidos: Pedido[]; totalItems?: number };
  const ps = datos.pedidos;
  const items = ps.flatMap((p) => (Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []));
  const customs = items.flatMap((i) =>
    Array.isArray(i.itemsCustom) ? (i.itemsCustom as Record<string, unknown>[]) : [],
  );
  // Relaciones de importes a nivel pedido (evidencia, no definición).
  const rel = {
    gross_eq_net: 0,
    gross_eq_net_plus_disc: 0,
    net_eq_gross_minus_disc: 0,
    sumItems_eq_gross: 0,
    sumItems_eq_net: 0,
    sumItemsMinusDisc_eq_net: 0,
    sumItemsPlusCustom_eq_gross: 0,
    sumItemsPlusCustom_eq_net: 0,
    net_gt_gross: 0,
    total: 0,
  };
  const tol = 0.011;
  const eq = (a: number, b: number) => Math.abs(a - b) <= tol;
  const decs: Record<string, Record<number, number>> = {};
  const anotarDec = (k: string, v: number) => {
    if (!isNaN(v)) {
      decs[k] ??= {};
      decs[k][decimales(v)] = (decs[k][decimales(v)] ?? 0) + 1;
    }
  };
  const formatosFecha = new Map<string, number>();
  const porHoraUTC: Record<string, number> = {};
  const itemsPorPedido: Record<number, number> = {};
  for (const p of ps) {
    const g = num(p.grossAmount),
      n = num(p.netAmount ?? p.netAmout),
      d = num(p.discount);
    for (const k of ['grossAmount', 'netAmount', 'netAmout', 'discount', 'percentageOfTransfer'])
      anotarDec(k, num(p[k]));
    const its = Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : [];
    itemsPorPedido[its.length] = (itemsPorPedido[its.length] ?? 0) + 1;
    const sI = its.reduce((s, i) => s + (num(i.amount) || 0), 0);
    const sID = its.reduce((s, i) => s + (num(i.discount) || 0), 0);
    const sC = its.reduce(
      (s, i) =>
        s +
        (Array.isArray(i.itemsCustom)
          ? (i.itemsCustom as Record<string, unknown>[]).reduce((t, c) => t + (num(c.amount) || 0), 0)
          : 0),
      0,
    );
    rel.total++;
    if (eq(g, n)) rel.gross_eq_net++;
    if (eq(g, n + d)) rel.gross_eq_net_plus_disc++;
    if (eq(n, g - d)) rel.net_eq_gross_minus_disc++;
    if (eq(sI, g)) rel.sumItems_eq_gross++;
    if (eq(sI, n)) rel.sumItems_eq_net++;
    if (eq(sI - sID, n)) rel.sumItemsMinusDisc_eq_net++;
    if (eq(sI + sC, g)) rel.sumItemsPlusCustom_eq_gross++;
    if (eq(sI + sC, n)) rel.sumItemsPlusCustom_eq_net++;
    if (n > g + tol) rel.net_gt_gross++;
    const f = String(p.createdAt ?? '');
    const forma = f.replace(/\d/g, '9');
    formatosFecha.set(forma, (formatosFecha.get(forma) ?? 0) + 1);
    const t = Date.parse(f);
    if (!isNaN(t)) {
      const h = new Date(t).getUTCHours();
      porHoraUTC[h] = (porHoraUTC[h] ?? 0) + 1;
    }
  }
  for (const i of items) anotarDec('items.amount', num(i.amount));
  // ¿El mismo producto aparece con importes distintos? (pista de si amount es unitario o total de línea)
  const precios = new Map<string, Set<number>>();
  for (const i of items) {
    const k = String(i.defaultCode ?? i.productName);
    (precios.get(k) ?? precios.set(k, new Set()).get(k)!).add(num(i.amount));
  }
  const productosMultiprecio = [...precios.entries()]
    .filter(([, s]) => s.size > 1)
    .slice(0, 10)
    .map(([k, s]) => [k, [...s].sort((a, b) => a - b).slice(0, 8)]);
  const lineasRepetidas = ps.filter((p) => {
    const its = (p.items as Record<string, unknown>[]) ?? [];
    const ks = its.map((i) => String(i.defaultCode));
    return new Set(ks).size < ks.length;
  }).length;
  const suma = (k: string) => r2(ps.reduce((s, p) => s + (num(p[k]) || 0), 0));
  const fechas = ps.map((p) => String(p.createdAt)).sort();
  const informe = {
    pedidos: ps.length,
    createdAtMin: fechas[0],
    createdAtMax: fechas.at(-1),
    formatosFecha: Object.fromEntries(formatosFecha),
    camposPedido: perfilCampos(ps),
    camposItem: perfilCampos(items),
    camposItemCustom: perfilCampos(customs),
    lineas: items.length,
    customs: customs.length,
    itemsPorPedido,
    pedidosConLineaRepetida: lineasRepetidas,
    productosConVariosImportes: productosMultiprecio,
    productosDistintos: precios.size,
    decimales: decs,
    relacionesImportes: rel,
    sumas: { grossAmount: suma('grossAmount'), netAmout: suma('netAmout'), discount: suma('discount') },
    porHoraUTC,
  };
  console.log(JSON.stringify(informe, null, 2));
  await writeFile(o.archivo.replace(/\.json$/, '.perfil.json'), JSON.stringify(informe, null, 2));
}

async function archivos() {
  console.log(DIR);
  try {
    console.log((await readdir(DIR)).join('\n'));
  } catch {
    console.log('(vacío)');
  }
}

const comandos: Record<string, () => Promise<void>> = { lista, pagina, matriz, extraer, perfilar, archivos };
const cmd = comandos[process.argv[2]];
if (!cmd) {
  console.error('Uso: lista | pagina | matriz | extraer | perfilar | archivos');
  process.exit(1);
}
cmd().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
