import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { leerCatalogo } from '../../lib/sucursales/proveedor';
import { conLectura } from '../conciliacion/db-lectura';
import { clienteZoho, leerCsv } from './zoho';
import { leerEnvLocal } from '../zoho/cliente';
import type { TiendaAnalytics } from './persistencia';
import { SALIDA_PREDETERMINADA } from './salida';

/**
 * Tiendas de México para Analytics, por relaciones verificables (nunca por nombre):
 * una company del POS entra si su lookerStoreId aparece como "Store ID" con ventas en MXN en
 * «Looker Sucursales» (Zoho, workspace de México) o como numero_tienda_jestor en crm_tiendas.
 * Solo lectura: 1 GET al POS, 1 export de Zoho, 1 SELECT en Supabase.
 *
 * Uso: npx tsx --conditions=react-server scripts/analytics/tiendas.ts [--salida <carpeta fuera del repo>]
 */
const salida = process.argv.includes('--salida')
  ? process.argv[process.argv.indexOf('--salida') + 1]
  : SALIDA_PREDETERMINADA;

const token = (await leerEnvLocal()).get('THECOFFEE_API_TOKEN');
if (!token) throw new Error('Falta THECOFFEE_API_TOKEN en .env.local');
process.env.THECOFFEE_API_TOKEN = token;

const cat = await leerCatalogo();
if (!cat.ok) throw new Error(`Catálogo POS: ${cat.error.codigo}`);
const zoho = await clienteZoho();
const csv = leerCsv(
  await zoho.exportarSql(
    `SELECT "Store ID", COUNT(DISTINCT "Currency") AS monedas, MAX("Currency") AS moneda, MAX("Date") AS hasta
     FROM "Looker Sucursales" GROUP BY "Store ID"`,
  ),
);
const zohoMx = new Map(
  csv
    .filter((r) => /^\d+$/.test(r['Store ID']) && r.monedas === '1' && r.moneda === 'MXN')
    .map((r) => [Number(r['Store ID']), r.hasta]),
);
const { resultado: crm } = await conLectura(
  async (q) =>
    (
      await q(`select numero_tienda_jestor as n, count(*)::int as filas from public.crm_tiendas
              where numero_tienda_jestor is not null group by 1`)
    ).rows as { n: number; filas: number }[],
);
const crmN = new Map(crm.map((r) => [r.n, r.filas]));

const incluidas: TiendaAnalytics[] = [];
const excluidas: { company_id: number; store_id: number | null; nombre: string; motivo: string }[] = [];
const vistos = new Map<number, number>();
for (const s of cat.sucursales) {
  if (s.lookerStoreId === null) {
    excluidas.push({ company_id: s.id, store_id: null, nombre: s.name, motivo: 'sin lookerStoreId' });
    continue;
  }
  // Un número que el CRM asigna a más de una tienda no identifica a ninguna: no cuenta como relación.
  const crmAmbiguo = (crmN.get(s.lookerStoreId) ?? 0) > 1;
  const relaciones = [
    ...(zohoMx.has(s.lookerStoreId) ? (['zoho'] as const) : []),
    ...(crmN.get(s.lookerStoreId) === 1 ? (['crm'] as const) : []),
  ];
  if (!relaciones.length && crmAmbiguo) {
    excluidas.push({
      company_id: s.id,
      store_id: s.lookerStoreId,
      nombre: s.name,
      motivo: 'ambigua: número repetido en el CRM y sin Store ID en Zoho',
    });
    continue;
  }
  if (!relaciones.length) {
    excluidas.push({
      company_id: s.id,
      store_id: s.lookerStoreId,
      nombre: s.name,
      motivo: 'sin relación Zoho MX ni CRM',
    });
    continue;
  }
  if (vistos.has(s.lookerStoreId))
    throw new Error(
      `lookerStoreId ${s.lookerStoreId} repetido en companies ${vistos.get(s.lookerStoreId)} y ${s.id}`,
    );
  vistos.set(s.lookerStoreId, s.id);
  incluidas.push({
    company_id: s.id,
    store_id: s.lookerStoreId,
    nombre: s.name,
    relaciones: [...relaciones],
  });
}
const posLooker = new Set(cat.sucursales.map((s) => s.lookerStoreId));
const informe = {
  verificado_en: new Date().toISOString(),
  criterio: 'lookerStoreId ∈ Store ID MXN de Zoho «Looker Sucursales» ∪ numero_tienda_jestor de crm_tiendas',
  resumen: {
    catalogo_pos: cat.sucursales.length,
    incluidas: incluidas.length,
    por_relacion: {
      zoho_y_crm: incluidas.filter((t) => t.relaciones.length === 2).length,
      solo_zoho: incluidas.filter((t) => t.relaciones.join() === 'zoho').length,
      solo_crm: incluidas.filter((t) => t.relaciones.join() === 'crm').length,
    },
    excluidas: excluidas.length,
  },
  avisos: {
    zoho_store_id_sin_company_pos: [...zohoMx.keys()].filter((n) => !posLooker.has(n)),
    crm_numero_sin_company_pos: [...crmN.keys()].filter((n) => !posLooker.has(n)),
    crm_numero_repetido: [...crmN].filter(([, f]) => f > 1).map(([n]) => n),
    // Companies del POS cuyo lookerStoreId es un número repetido en el CRM (su relación CRM no cuenta).
    companies_con_numero_crm_repetido: cat.sucursales
      .filter((s) => s.lookerStoreId !== null && (crmN.get(s.lookerStoreId) ?? 0) > 1)
      .map((s) => ({ company_id: s.id, store_id: s.lookerStoreId })),
  },
  incluidas,
  excluidas,
  llamadas: { pos: 1, zoho: zoho.llamadas(), supabase_lectura: 1 },
};
mkdirSync(salida, { recursive: true });
const archivo = join(salida, `tiendas-${informe.verificado_en.replace(/[:.]/g, '-')}.json`);
writeFileSync(archivo, JSON.stringify(informe, null, 2) + '\n');
console.log(JSON.stringify(informe.resumen), JSON.stringify(informe.avisos));
console.log(`Tiendas → ${archivo}`);
