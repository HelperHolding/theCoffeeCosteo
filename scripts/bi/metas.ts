import { readFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal, type Env } from '../zoho/cliente';
import {
  cruzarTiendas,
  decodificar,
  leerCsv,
  leerMetas,
  leerPuntoEquilibrio,
  type MetaMensual,
  type PuntoEquilibrio,
} from '../../lib/bi/metas';

/**
 * Metas y punto de equilibrio del BI (F5). Sin --aplicar solo muestra lo que haría (no escribe nada).
 *
 *   npx.cmd tsx --conditions=react-server scripts/bi/metas.ts metas [--csv archivo.csv] [--aplicar]
 *     Lee «Metas Mensuales 2026 (Ventas Tickets TP)» de Zoho Analytics (o el CSV con las mismas columnas), cruza la
 *     sucursal por nombre con bi_tiendas, guarda bi_metas y reparte cada mes por día (bi_recalcular_metas).
 *   npx.cmd tsx --conditions=react-server scripts/bi/metas.ts pe --csv archivo.csv [--aplicar]
 *     CSV con columnas tienda, mes (AAAA-MM) y pe (pesos). Guarda bi_punto_equilibrio.
 *   npx.cmd tsx --conditions=react-server scripts/bi/metas.ts recalcular --mes 2026-11 [--aplicar]
 *     Vuelve a repartir un mes (después de recargar historia del POS, por ejemplo).
 *
 * Zoho: solo lectura (export por SQL), con el token de Analytics. Nunca imprime tokens.
 */
const args = process.argv.slice(2);
const accion = args[0];
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const aplicar = args.includes('--aplicar');
const TABLA_METAS = 'Metas Mensuales 2026 (Ventas Tickets TP)';

const env = await leerEnvLocal();
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

async function tiendas() {
  const r = await db.from('bi_tiendas').select('company_id, nombre').order('company_id');
  if (r.error) throw r.error;
  return r.data as { company_id: number; nombre: string }[];
}

async function recalcular(meses: string[]) {
  for (const mes of [...new Set(meses)].sort()) {
    if (!aplicar) {
      console.log(`  (prueba) repartiría ${mes.slice(0, 7)} por día`);
      continue;
    }
    const r = await db.rpc('bi_recalcular_metas', { p_mes: mes });
    if (r.error) throw r.error;
    console.log(`  ${mes.slice(0, 7)}: ${r.data} días de tienda con meta`);
  }
}

function resumen<T extends { mes: string }>(filas: T[], sinTienda: string[]) {
  const porMes = new Map<string, number>();
  for (const f of filas) porMes.set(f.mes, (porMes.get(f.mes) ?? 0) + 1);
  for (const [mes, n] of [...porMes].sort()) console.log(`  ${mes.slice(0, 7)}: ${n} tiendas`);
  if (sinTienda.length) console.log(`  Sin tienda en bi_tiendas (no se cargan): ${sinTienda.join(', ')}`);
}

async function cargarMetas() {
  const texto = opcion('--csv')
    ? decodificar(await readFile(opcion('--csv')!))
    : await exportarZoho(env, `select * from "${TABLA_METAS}"`);
  const metas = leerMetas(leerCsv(texto));
  // Zoho a veces entrega un export vacío: nunca se toma como «sin metas».
  if (metas.length === 0)
    throw new Error('El archivo de metas llegó vacío; no se guardó nada. Vuelve a intentarlo.');
  const { cruzadas, sinTienda } = cruzarTiendas<MetaMensual>(metas, await tiendas());
  console.log(`Metas: ${metas.length} filas, ${cruzadas.length} con tienda.`);
  resumen(cruzadas, sinTienda);
  const filas = cruzadas.map((m) => ({
    company_id: m.companyId,
    mes: m.mes,
    venta_cent: m.ventaCent,
    tickets: m.tickets,
    ticket_promedio_cent: m.ticketPromedioCent,
    fecha_apertura: m.fechaApertura,
    actualizado_en: new Date().toISOString(),
  }));
  if (aplicar) {
    const r = await db.from('bi_metas').upsert(filas, { onConflict: 'company_id,mes' });
    if (r.error) throw r.error;
    console.log(`Guardadas ${filas.length} metas.`);
  } else console.log('(prueba) No se guardó nada. Agrega --aplicar para guardar.');
  await recalcular(cruzadas.map((m) => m.mes));
}

async function cargarPe() {
  const archivo = opcion('--csv');
  if (!archivo) throw new Error('Falta --csv (columnas tienda, mes AAAA-MM y pe)');
  const pe = leerPuntoEquilibrio(leerCsv(decodificar(await readFile(archivo))));
  if (pe.length === 0) throw new Error('El CSV de P.E. no trae filas; no se guardó nada.');
  const { cruzadas, sinTienda } = cruzarTiendas<PuntoEquilibrio>(pe, await tiendas());
  console.log(`P.E.: ${pe.length} filas, ${cruzadas.length} con tienda.`);
  resumen(cruzadas, sinTienda);
  if (!aplicar) return console.log('(prueba) No se guardó nada. Agrega --aplicar para guardar.');
  const r = await db.from('bi_punto_equilibrio').upsert(
    cruzadas.map((p) => ({
      company_id: p.companyId,
      mes: p.mes,
      pe_cent: p.peCent,
      actualizado_en: new Date().toISOString(),
    })),
    { onConflict: 'company_id,mes' },
  );
  if (r.error) throw r.error;
  console.log(`Guardados ${cruzadas.length} P.E.`);
}

/** Export asíncrono por SQL de Zoho Analytics (solo SELECT; tres rutas GET). */
async function exportarZoho(e: Env, sql: string): Promise<string> {
  if (!/^\s*select\s/i.test(sql)) throw new Error('Solo SELECT');
  for (const k of ['ZOHO_CLIENT_ID', 'ZOHO_CLIENT_SECRET', 'ZOHO_ANALYTICS_REFRESH_TOKEN'])
    if (!e.get(k)) throw new Error(`Falta ${k} en .env.local`);
  const token = (await (
    await fetch(`${e.get('ZOHO_ACCOUNTS_URL') || 'https://accounts.zoho.com'}/oauth/v2/token`, {
      method: 'POST',
      body: new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: e.get('ZOHO_ANALYTICS_REFRESH_TOKEN')!,
        client_id: e.get('ZOHO_CLIENT_ID')!,
        client_secret: e.get('ZOHO_CLIENT_SECRET')!,
      }),
    })
  ).json()) as { access_token?: string; error?: string };
  if (!token.access_token)
    throw new Error(`No se pudo renovar el token de Analytics (${token.error ?? 'sin respuesta'})`);
  const base = 'https://analyticsapi.zoho.com/restapi/v2/bulk/workspaces/2958916000000074002';
  const get = async (ruta: string, config?: object) => {
    await new Promise((ok) => setTimeout(ok, 1100)); // < 60 llamadas por minuto
    const res = await fetch(
      `${base}${ruta}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}`, 'ZANALYTICS-ORGID': '862256713' },
      },
    );
    if (!res.ok) throw new Error(`Zoho ${res.status} en ${ruta}: ${(await res.text()).slice(0, 300)}`);
    return res;
  };
  const job = (
    (await (await get('/data', { sqlQuery: sql, responseFormat: 'csv' })).json()) as {
      data?: { jobId?: string };
    }
  ).data?.jobId;
  if (!job) throw new Error('Zoho no devolvió jobId');
  for (let i = 0; i < 90; i++) {
    const estado =
      ((await (await get(`/exportjobs/${job}`)).json()) as { data?: { jobStatus?: string } }).data
        ?.jobStatus ?? '';
    if (/COMPLETED/i.test(estado))
      return decodificar(await (await get(`/exportjobs/${job}/data`)).arrayBuffer());
    if (/ERROR|FAIL/i.test(estado)) throw new Error(`El export de Zoho falló: ${estado}`);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  throw new Error('El export de Zoho no terminó a tiempo');
}

if (accion === 'metas') await cargarMetas();
else if (accion === 'pe') await cargarPe();
else if (accion === 'recalcular') {
  const mes = opcion('--mes');
  if (!mes || !/^\d{4}-\d{2}$/.test(mes)) throw new Error('Falta --mes AAAA-MM');
  await recalcular([`${mes}-01`]);
} else {
  console.log('Uso: scripts/bi/metas.ts metas|pe|recalcular … [--aplicar]');
  process.exitCode = 1;
}
