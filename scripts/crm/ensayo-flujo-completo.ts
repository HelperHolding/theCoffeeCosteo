import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';

/**
 * Ensayo remoto con ROLLBACK de la migración 50 (doc 41, flujo completo). Aplica el archivo EXACTO del PR dentro
 * de una transacción, mide el efecto sobre los datos reales y la REVIERTE siempre. Después comprueba en una consulta
 * nueva que no persistió nada. No escribe en la base.
 *
 *   npx tsx scripts/crm/ensayo-flujo-completo.ts            conexión directa (DATABASE_URL)
 *   npx tsx scripts/crm/ensayo-flujo-completo.ts --pooler   Session pooler (DATABASE_URL_POOLER)
 *   npx tsx scripts/crm/ensayo-flujo-completo.ts --api      API de Supabase por HTTPS (SUPABASE_ACCESS_TOKEN)
 *
 * Con --api todo va en UNA petición que termina con un error a propósito (el informe viaja en el mensaje), así la
 * transacción se aborta y nada se guarda. Sirve cuando la red no tiene IPv6 y no hay contraseña de la base a mano.
 */
const ARCHIVO = '20261114000050_crm_flujo_completo.sql';
const VERSION = ARCHIVO.slice(0, 14);
const carpeta = join(import.meta.dirname, '../../supabase/migrations');
const MARCA = 'ENSAYO50:';

const ANTES: Record<string, string> = {
  sucursales_por_etapa: `select e.clave, count(*)::int n from crm_tiendas t join crm_etapas e on e.id = t.etapa_id
    where t.embudo = 'general' and t.archivado_en is null group by 1 order by 1`,
  franquiciatarios_con_fiscales: `select count(*)::int n from crm_franquiciatarios
    where num_nonnulls(firmante, obligado_solidario, razon_social, rfc, regimen_fiscal, codigo_postal_fiscal) > 0`,
  // Si la bitácora ya guardó valores fiscales, son inalterables: se reporta para decidir.
  bitacora_con_fiscales: `select count(*)::int n from crm_historial where entidad = 'crm_franquiciatarios'
    and cambios ?| array['firmante','obligado_solidario','razon_social','rfc','regimen_fiscal','codigo_postal_fiscal']`,
  archivos_sensibles: `select tipo_documento, count(*)::int n from crm_archivos
    where tipo_documento in ('survey','pld','csf','comprobante_apartado','comprobante_pago','factura') group by 1 order by 1`,
  cumplimientos_finanzas: `select r.clave, cu.estado, count(*)::int n from crm_cumplimientos cu
    join crm_requisitos r on r.id = cu.requisito_id where r.clave in ('apartado_validado','pago_validado') group by 1, 2`,
  membresias: 'select area, rol, count(*)::int n from crm_membresias group by 1, 2 order by 1, 2',
  avisos: 'select tipo, count(*)::int n from crm_avisos group by 1 order by 1',
};
const DENTRO: Record<string, string> = {
  sucursales_por_etapa: ANTES.sucursales_por_etapa,
  etapas_activas: `select count(*)::int n from crm_etapas where embudo = 'general' and activa`,
  requisitos: 'select count(*)::int n from crm_requisitos',
  areas: 'select clave, activa from crm_areas order by orden',
  fiscales_movidos: 'select count(*)::int n from crm_franquiciatario_fiscal',
  candados: 'select count(*)::int n, sum(carril_total)::int carril from crm_v_candados',
  vencimientos: 'select tipo, area, count(*)::int n from crm_v_vencimientos group by 1, 2 order by 1, 2',
  avisos_nuevos_hoy: 'select crm_generar_avisos() n',
  bitacora_migracion: `select count(*)::int n from crm_historial where origen = 'sistema' and motivo like 'Migración 50%'`,
  tablas_sin_rls: `select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and c.relkind = 'r' and c.relname like 'crm_%' and not c.relrowsecurity`,
  grants_anon: `select table_name from information_schema.role_table_grants
    where grantee = 'anon' and table_schema = 'public' and table_name like 'crm_%'`,
};
const DESPUES: Record<string, string> = {
  migraciones: 'select max(version) ultima, count(*)::int n from supabase_migrations.schema_migrations',
  tabla_fiscal: `select to_regclass('public.crm_franquiciatario_fiscal') is not null as existe`,
  etapas_activas: DENTRO.etapas_activas,
};

type Consulta = (sql: string) => Promise<unknown[]>;
const todas = async (q: Consulta, consultas: Record<string, string>) =>
  Object.fromEntries(await Promise.all(Object.entries(consultas).map(async ([k, s]) => [k, await q(s)])));

async function conPg(url: string) {
  const conectar = async () => {
    const c = new pg.Client({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      application_name: 'crm-flujo-completo-ensayo',
    });
    await c.connect();
    return c;
  };
  const c = await conectar();
  const q: Consulta = async (sql) => (await c.query(sql)).rows;
  const informe: Record<string, unknown> = {};
  try {
    informe.migraciones_antes = (await q(DESPUES.migraciones))[0];
    if ((informe.migraciones_antes as { ultima: string }).ultima >= VERSION)
      throw new Error('La base ya tiene la migración 50');
    informe.antes = await todas(q, ANTES);
    await c.query('begin');
    await c.query(`set local lock_timeout = '5s'`);
    await c.query(`set local statement_timeout = '120s'`);
    const t = Date.now();
    await c.query(await readFile(join(carpeta, ARCHIVO), 'utf8'));
    informe.tiempo_ms = Date.now() - t;
    // En serie: comparten la transacción.
    const dentro: Record<string, unknown> = {};
    for (const [k, s] of Object.entries(DENTRO)) dentro[k] = await q(s);
    informe.dentro = dentro;
  } finally {
    await c.query('rollback').catch(() => undefined);
    await c.end();
  }
  const v = await conectar();
  try {
    informe.despues = await todas(async (s) => (await v.query(s)).rows, DESPUES);
  } finally {
    await v.end();
  }
  return informe;
}

async function conApi(token: string, ref: string) {
  const pedir = async (query: string) => {
    const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query }),
    });
    return { ok: r.ok, estado: r.status, texto: await r.text() };
  };
  const q: Consulta = async (sql) => {
    const r = await pedir(sql);
    if (!r.ok) throw new Error(`API ${r.estado}: ${r.texto.slice(0, 300)}`);
    return JSON.parse(r.texto) as unknown[];
  };
  const informe: Record<string, unknown> = {};
  informe.migraciones_antes = (await q(DESPUES.migraciones))[0];
  if ((informe.migraciones_antes as { ultima: string }).ultima >= VERSION)
    throw new Error('La base ya tiene la migración 50');
  informe.antes = await todas(q, ANTES);
  // Una sola petición: migración + mediciones + error a propósito con el informe (aborta la transacción).
  const medir = Object.entries(DENTRO)
    .map(([k, s]) => `'${k}', (select coalesce(jsonb_agg(x), '[]'::jsonb) from (${s}) x)`)
    .join(',\n    ');
  const sql = `begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
${await readFile(join(carpeta, ARCHIVO), 'utf8')}
do $ensayo$ begin
  raise exception '${MARCA}%', jsonb_build_object(
    ${medir});
end $ensayo$;`;
  const t = Date.now();
  const r = await pedir(sql);
  informe.tiempo_ms = Date.now() - t;
  // La API responde el error como JSON ({ message }); el informe es la línea que sigue a la marca.
  let mensaje = r.texto;
  try {
    const j = JSON.parse(r.texto) as { message?: string; error?: string };
    mensaje = j.message ?? j.error ?? r.texto;
  } catch {
    // Texto plano.
  }
  const i = mensaje.indexOf(MARCA);
  if (r.ok || i < 0)
    throw new Error(`El ensayo no terminó como se esperaba (${r.estado}): ${mensaje.slice(0, 800)}`);
  informe.dentro = JSON.parse(mensaje.slice(i + MARCA.length).split('\n')[0]);
  informe.despues = await todas(q, DESPUES);
  return informe;
}

async function main() {
  const env = await leerEnvLocal();
  let informe: Record<string, unknown>;
  if (process.argv.includes('--api')) {
    const token = process.env.SUPABASE_ACCESS_TOKEN ?? env.get('SUPABASE_ACCESS_TOKEN');
    const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL') ?? '').hostname.split('.')[0];
    if (!token || !ref) throw new Error('Falta SUPABASE_ACCESS_TOKEN o NEXT_PUBLIC_SUPABASE_URL');
    informe = await conApi(token, ref);
  } else {
    // Con --pooler usa DATABASE_URL_POOLER (Session pooler, IPv4): la conexión directa solo publica IPv6.
    const url = process.argv.includes('--pooler')
      ? (process.env.DATABASE_URL_POOLER ?? env.get('DATABASE_URL_POOLER'))
      : env.get('DATABASE_URL');
    if (!url) throw new Error('Falta la cadena de conexión (DATABASE_URL o DATABASE_URL_POOLER)');
    informe = await conPg(url);
  }
  console.log(JSON.stringify({ archivo: ARCHIVO, ...informe }, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
