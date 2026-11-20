// Carga de gastos fijos mensuales desde Zoho Analytics («Gastos Sucursales Por Meses», solo lectura) a
// franq_gastos_fijos con origen 'zoho'. Sin --aplicar solo muestra lo que haría. Idempotente: no inserta si el
// registro vigente de ese concepto y mes ya tiene el mismo monto. Cruza la tienda por nombre (sin acentos ni
// mayúsculas) con lib/sucursales/config.ts. Uso:
//   npx tsx --conditions=react-server scripts/franquiciatarios/zoho-gastos-fijos.ts [--tienda 514] [--aplicar]
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';

const WS = '2958916000000074002';
const ORG = '862256713';
const VISTA = 'Gastos Sucursales Por Meses';
const COLUMNAS: [string, string][] = [
  ['G.Renta', 'renta'],
  ['G.Labor Cost', 'nomina'],
  ['G.Energía Eléctrica', 'energia'],
  ['G.Servicios (Agua y Teléfono)', 'servicios'],
  ['G.POS Fee', 'pos'],
  ['G.Suscripciones (Somexfon, Spotify)', 'suscripciones'],
];
const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const iTienda = args.indexOf('--tienda');
const soloTienda = iTienda >= 0 ? Number(args[iTienda + 1]) : null;

const env = await leerEnvLocal();
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const pesos = (s: string) => Number(String(s ?? '').replace(/[$,\s]/g, '')) || 0;

// CSV sencillo con comillas (el export de Zoho entrecomilla montos con comas).
function leerCsv(texto: string): Record<string, string>[] {
  const filas: string[][] = [];
  let campo = '';
  let fila: string[] = [];
  let comillas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (comillas) {
      if (c === '"' && texto[i + 1] === '"') ((campo += '"'), i++);
      else if (c === '"') comillas = false;
      else campo += c;
    } else if (c === '"') comillas = true;
    else if (c === ',') (fila.push(campo), (campo = ''));
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      (fila.push(campo), filas.push(fila), (fila = []), (campo = ''));
    } else campo += c;
  }
  if (campo || fila.length) (fila.push(campo), filas.push(fila));
  const [cab, ...resto] = filas.filter((f) => f.some((x) => x.trim()));
  return resto.map((f) => Object.fromEntries(cab.map((h, i) => [h.replace(/^﻿/, ''), f[i] ?? ''])));
}

async function exportarZoho(sql: string): Promise<string> {
  const token = (await (
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
  if (!token.access_token)
    throw new Error(`No se pudo renovar el token de Analytics (${token.error ?? 'sin respuesta'})`);
  const base = `https://analyticsapi.zoho.com/restapi/v2/bulk/workspaces/${WS}`;
  const get = async (ruta: string, config?: object) => {
    await new Promise((ok) => setTimeout(ok, 1100));
    const r = await fetch(
      `${base}${ruta}${config ? `?CONFIG=${encodeURIComponent(JSON.stringify(config))}` : ''}`,
      {
        headers: { Authorization: `Zoho-oauthtoken ${token.access_token}`, 'ZANALYTICS-ORGID': ORG },
      },
    );
    if (!r.ok) throw new Error(`Zoho ${r.status}: ${(await r.text()).slice(0, 200)}`);
    return r;
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
      return new TextDecoder('utf-8').decode(await (await get(`/exportjobs/${job}/data`)).arrayBuffer());
    if (/ERROR|FAIL/i.test(estado)) throw new Error(`Export falló: ${estado}`);
    await new Promise((ok) => setTimeout(ok, 2000));
  }
  throw new Error('El export no terminó a tiempo');
}

const filas = leerCsv(await exportarZoho(`select * from "${VISTA}"`));
if (filas.length === 0) throw new Error('Zoho devolvió el export vacío; no se guardó nada.');
const porNombre = new Map(sucursalesConfiguradas.map((c) => [norm(c.nombre), c.companyId]));
const registros: { company_id: number; mes: string; concepto: string; monto: number; tienda: string }[] = [];
const sinTienda = new Set<string>();
for (const f of filas) {
  const tienda = f['G.Nombre de Tienda'];
  const company = porNombre.get(norm(tienda ?? ''));
  if (!company) {
    sinTienda.add(tienda);
    continue;
  }
  if (soloTienda && company !== soloTienda) continue;
  const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(f['M.Fecha Mes'] ?? '');
  if (!m) continue;
  const mes = `${m[3]}-${m[2]}-01`;
  for (const [col, concepto] of COLUMNAS)
    registros.push({ company_id: company, mes, concepto, monto: pesos(f[col]), tienda });
}
registros.sort(
  (a, b) => a.company_id - b.company_id || a.mes.localeCompare(b.mes) || a.concepto.localeCompare(b.concepto),
);
const tiendas = [...new Set(registros.map((r) => r.tienda))];
console.log(
  `Zoho: ${filas.length} filas · ${tiendas.length} sucursales cruzadas · ${registros.length} montos.`,
);
if (soloTienda)
  for (const r of registros)
    console.log(
      `  ${r.tienda} ${r.mes.slice(0, 7)} ${r.concepto.padEnd(13)} $${r.monto.toLocaleString('es-MX')}`,
    );
if (sinTienda.size && !soloTienda)
  console.log(`  Sin sucursal configurada (no se cargan): ${sinTienda.size}`);

if (!aplicar) {
  console.log('(prueba) No se guardó nada. Agrega --aplicar para guardar.');
} else {
  const db = createClient(
    env.get('NEXT_PUBLIC_SUPABASE_URL')!,
    env.get('SUPABASE_SECRET_KEY') || env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    {
      auth: { persistSession: false },
    },
  );
  // Autor: el administrador del módulo (perfil_modulos franquiciatarios nivel desarrollador).
  const admin = await db
    .from('perfil_modulos')
    .select('user_id')
    .eq('modulo', 'franquiciatarios')
    .eq('nivel', 'desarrollador')
    .limit(1)
    .single();
  if (admin.error) throw admin.error;
  const vigentes = await db.from('franq_gastos_fijos').select('company_id,mes,concepto,monto,id').order('id');
  if (vigentes.error) throw vigentes.error;
  const ultimo = new Map<string, number>();
  for (const v of vigentes.data ?? []) ultimo.set(`${v.company_id}|${v.mes}|${v.concepto}`, Number(v.monto));
  const nuevos = registros
    .filter((r) => ultimo.get(`${r.company_id}|${r.mes}|${r.concepto}`) !== r.monto)
    .map((r) => ({
      company_id: r.company_id,
      mes: r.mes,
      concepto: r.concepto,
      monto: r.monto,
      origen: 'zoho',
      nota: `Zoho Analytics · ${VISTA}`,
      nombre: 'Importado de Zoho',
      registrado_por: admin.data.user_id,
    }));
  for (let i = 0; i < nuevos.length; i += 500) {
    const r = await db.from('franq_gastos_fijos').insert(nuevos.slice(i, i + 500));
    if (r.error) throw r.error;
  }
  console.log(`Guardados ${nuevos.length} montos (${registros.length - nuevos.length} ya estaban iguales).`);
}
