// Cotejo de SOLO LECTURA de las ventas de una sucursal entre módulos, por día y canal:
//   A) Sucursales / Franquiciatarios (mismas funciones: POS en vivo + Rappi del portal)
//   B) BI (bi_lineas, cargado por el cron)
//   C) Zoho Analytics «Looker Sucursales» (POS cargado a Zoho)
// Uso: npx tsx --conditions=react-server scripts/franquiciatarios/cotejo-modulos.ts --desde 2026-11-01 --hasta 2026-11-19 [--company 514]
import { leerEnvLocal } from '../zoho/cliente';

const env = await leerEnvLocal();
for (const [k, v] of env) if (!process.env[k]) process.env[k] = v;
const { createClient } = await import('@supabase/supabase-js');
const { configDe } = await import('../../lib/sucursales/config');
const { conRappi, leerDias } = await import('../../lib/sucursales/datos');
const { fuentesFranq } = await import('../../lib/franquiciatarios/ventas');

const args = process.argv.slice(2);
const op = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const desde = op('--desde') ?? '2026-11-01';
const hasta = op('--hasta') ?? '2026-11-19';
const cfg = configDe(Number(op('--company') ?? 514))!;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
  auth: { persistSession: false },
});

type Fila = { pos: number; rappi: number; pedidos: number };
const vacia = (): Fila => ({ pos: 0, rappi: 0, pedidos: 0 });
const tabla = (m: Map<string, Fila>, d: string) => m.get(d) ?? m.set(d, vacia()).get(d)!;

// A) Sucursales / Franquiciatarios
const A = new Map<string, Fila>();
const fuentes = await fuentesFranq(cfg);
const lectura = await conRappi(await leerDias(cfg, desde, hasta), fuentes.rappi);
for (const p of lectura.pedidos) {
  if (p.fecha < desde || p.fecha > hasta) continue;
  const f = tabla(A, p.fecha);
  if (p.origen === 'rappi') f.rappi += p.ventaCent / 100;
  else f.pos += p.ventaCent / 100;
  f.pedidos++;
}

// B) BI
const B = new Map<string, Fila>();
const pedidosBi = new Map<string, Set<string>>();
for (let i = 0; ; i += 1000) {
  const r = await db
    .from('bi_lineas')
    .select('fecha,pedido,canal,importe_cent,fuente')
    .eq('company_id', cfg.companyId)
    .gte('fecha', desde)
    .lte('fecha', hasta)
    .order('fecha')
    .order('pedido')
    .order('linea')
    .range(i, i + 999);
  if (r.error) throw r.error;
  for (const l of r.data) {
    const f = tabla(B, l.fecha);
    if (l.canal === 'rappi') f.rappi += Number(l.importe_cent) / 100;
    else f.pos += Number(l.importe_cent) / 100;
    (pedidosBi.get(l.fecha) ?? pedidosBi.set(l.fecha, new Set()).get(l.fecha)!).add(
      `${l.fuente}|${l.pedido}`,
    );
  }
  if (r.data.length < 1000) break;
}
for (const [d, s] of pedidosBi) tabla(B, d).pedidos = s.size;
const cargas = await db
  .from('bi_cargas')
  .select('fecha,completa')
  .eq('company_id', cfg.companyId)
  .gte('fecha', desde)
  .lte('fecha', hasta);
const completas = new Map((cargas.data ?? []).map((c) => [c.fecha, c.completa]));

// C) Zoho «Looker Sucursales»: POS y Rappi juntos (Rappi del archivo manual), así que se compara contra A POS + A Rappi.
const C = new Map<string, Fila>();
let zohoError: string | null = null;
try {
  const tok = (await (
    await fetch(`${env.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com'}/oauth/v2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: env.get('ZOHO_ANALYTICS_REFRESH_TOKEN')!,
        client_id: env.get('ZOHO_CLIENT_ID')!,
        client_secret: env.get('ZOHO_CLIENT_SECRET')!,
      }),
    })
  ).json()) as { access_token?: string; error?: string };
  if (!tok.access_token) throw new Error(`token: ${tok.error}`);
  const base = 'https://analyticsapi.zoho.com/restapi/v2/bulk/workspaces/2958916000000074002';
  const get = async (ruta: string, config?: object) => {
    await new Promise((ok) => setTimeout(ok, 1100));
    const r = await fetch(
      `${base}${ruta}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${tok.access_token}`, 'ZANALYTICS-ORGID': '862256713' },
      },
    );
    if (!r.ok) throw new Error(`Zoho ${r.status}: ${(await r.text()).slice(0, 300)}`);
    return r;
  };
  // «Date» trae hora: el último día entra completo con «< día siguiente».
  const manana = new Date(Date.parse(`${hasta}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const sql = `select "Date", count(distinct "Order ID"), sum("Net Amount (Local)") from "Looker Sucursales"
    where "Store ID" = ${cfg.lookerStoreId} and "Date" >= '${desde}' and "Date" < '${manana}' group by "Date"`;
  const job = (
    (await (await get('/data', { sqlQuery: sql, responseFormat: 'csv' })).json()) as {
      data?: { jobId?: string };
    }
  ).data?.jobId;
  let csv = '';
  for (let i = 0; i < 90 && job; i++) {
    const e =
      ((await (await get(`/exportjobs/${job}`)).json()) as { data?: { jobStatus?: string } }).data
        ?.jobStatus ?? '';
    if (/COMPLETED/i.test(e)) {
      csv = new TextDecoder().decode(await (await get(`/exportjobs/${job}/data`)).arrayBuffer());
      break;
    }
    if (/ERROR|FAIL/i.test(e)) throw new Error(e);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  for (const linea of csv.split(/\r?\n/).slice(1).filter(Boolean)) {
    // «Date» es fecha y hora y llega como dd/MM/yyyy[ hh:mm:ss]: se suma por día.
    const m = /^"?(\d{2})\/(\d{2})\/(\d{4})[^",]*"?,"?(\d+)"?,"?\$?(-?[\d,.]+)"?/.exec(linea);
    if (!m) continue;
    const f = tabla(C, `${m[3]}-${m[2]}-${m[1]}`);
    f.pedidos += Number(m[4]);
    f.pos += Number(m[5].replace(/,/g, ''));
  }
} catch (e) {
  zohoError = (e as Error).message;
}

const dias: string[] = [];
for (
  let d = desde;
  d <= hasta;
  d = new Date(Date.parse(`${d}T12:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
)
  dias.push(d);
const f2 = (n: number) => n.toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const dif = (a: number, b: number) => (Math.abs(a - b) < 0.02 ? '=' : f2(b - a));
console.log(`${cfg.nombre} (${cfg.companyId}, tienda ${cfg.lookerStoreId}) · ${desde} a ${hasta}`);
console.log(
  'día        | A POS      A Rappi  A ped | BI POS (dif)        BI Rappi (dif)    BI ped | Zoho total (dif vs A POS+Rappi)  Zoho ped | BI carga',
);
const tot = { a: vacia(), b: vacia(), c: vacia() };
for (const d of dias) {
  const a = A.get(d) ?? vacia();
  const b = B.get(d) ?? vacia();
  const c = C.get(d) ?? vacia();
  for (const [t, x] of [
    [tot.a, a],
    [tot.b, b],
    [tot.c, c],
  ] as const)
    ((t.pos += x.pos), (t.rappi += x.rappi), (t.pedidos += x.pedidos));
  console.log(
    `${d} | ${f2(a.pos).padStart(9)} ${f2(a.rappi).padStart(8)} ${String(a.pedidos).padStart(4)} | ` +
      `${f2(b.pos).padStart(9)} (${dif(a.pos, b.pos).padStart(8)}) ${f2(b.rappi).padStart(8)} (${dif(a.rappi, b.rappi).padStart(8)}) ${String(b.pedidos).padStart(4)} | ` +
      `${f2(c.pos).padStart(9)} (${dif(a.pos + a.rappi, c.pos).padStart(8)}) ${String(c.pedidos).padStart(4)} | ${completas.has(d) ? (completas.get(d) ? 'completa' : 'parcial') : 'SIN CARGA'}`,
  );
}
console.log(
  `TOTAL      | ${f2(tot.a.pos).padStart(9)} ${f2(tot.a.rappi).padStart(8)} ${String(tot.a.pedidos).padStart(4)} | ` +
    `${f2(tot.b.pos).padStart(9)} (${dif(tot.a.pos, tot.b.pos).padStart(8)}) ${f2(tot.b.rappi).padStart(8)} (${dif(tot.a.rappi, tot.b.rappi).padStart(8)}) ${String(tot.b.pedidos).padStart(4)} | ` +
    `${f2(tot.c.pos).padStart(9)} (${dif(tot.a.pos + tot.a.rappi, tot.c.pos).padStart(8)}) ${String(tot.c.pedidos).padStart(4)}`,
);
if (zohoError) console.log(`Zoho: ${zohoError}`);
console.log(`Lectura POS: ${lectura.estado}; avisos: ${lectura.avisos.join(' | ') || '—'}`);
