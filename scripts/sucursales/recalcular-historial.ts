import { mkdirSync, writeFileSync, appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { configDe, type ConfigSucursal } from '../../lib/sucursales/config';
import { cortar, rappiServicio } from '../../lib/sucursales/corte-servidor';
import { conRappi, leerVentana } from '../../lib/sucursales/datos';
import { sumarDias } from '../../lib/sucursales/tiempo';

/**
 * Recalcula con el código vigente los días YA GUARDADOS del Tablero de México (sucursales_resumen_dia) y del BI
 * (bi_cargas/bi_lineas, fuente pos). Lo usa el cambio de definición de venta del 2026-11-20 (#193: Rappi neto y saldo
 * de la app fuera de la venta), pero sirve para cualquier cambio futuro.
 *
 * Candados:
 * - Solo pares (sucursal, día) que ya existen: no crea días nuevos. El BI solo se escribe donde ya había carga del POS.
 * - Solo los días que el cambio puede mover: desde --todos-desde (por omisión 2026-08-01, donde empieza el historial
 *   de casi todas) todos; antes, solo los que tienen pagos con saldo de la app o pedidos del portal de Rappi.
 * - Una lectura que no sale completa NO reemplaza un día que estaba completo: queda en «pendientes» para reintentar.
 * - Hoy no se toca (lo hace el corte de cada 10 minutos).
 * - Respaldo de totales previos en C:/Users/carlo/Respaldos/thecoffee-supabase antes de escribir.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/recalcular-historial.ts [--aplicar] [--hasta AAAA-MM-DD] [--max-dias N]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const aplicar = args.includes('--aplicar');
const todosDesde = opcion('--todos-desde') ?? '2026-08-01';

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const ayer = sumarDias(new Date(Date.now() - 6 * 3600_000).toISOString().slice(0, 10), -1);
const hasta = opcion('--hasta') ?? ayer;

async function todas<T>(tabla: string, columnas: string, filtro?: (q: any) => any): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; ; i += 1000) {
    let q = db.from(tabla).select(columnas).lte('fecha', hasta).order('company_id').order('fecha');
    if (filtro) q = filtro(q);
    const r = await q.range(i, i + 999);
    if (r.error) throw new Error(`${tabla}: ${r.error.message}`);
    out.push(...(r.data as T[]));
    if (r.data.length < 1000) break;
  }
  return out;
}

type Resumen = {
  company_id: number;
  fecha: string;
  completa: boolean;
  origenes: Record<string, { venta_cent: number; pedidos: number }>;
};
type Carga = { company_id: number; fecha: string; completa: boolean; lineas: number; huella: string };
const resumenes = await todas<Resumen>('sucursales_resumen_dia', 'company_id,fecha,completa,origenes');
const cargas = await todas<Carga>('bi_cargas', 'company_id,fecha,completa,lineas,huella', (q) =>
  q.eq('fuente', 'pos'),
);

// Días con saldo de la app (según el BI) o con Rappi del portal: los únicos que el cambio mueve antes de todosDesde.
const sql = async (query: string) => {
  const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query: `begin read only; ${query}` }),
  });
  const j = await r.json();
  if (!r.ok || !Array.isArray(j)) throw new Error(JSON.stringify(j).slice(0, 300));
  return j as { k: string }[];
};
const afectados = new Set(
  (
    await sql(`select distinct company_id || '|' || fecha k from bi_lineas where metodo_pago = 'WALLET_BALANCE'
      union select distinct company_id || '|' || fecha_local from rappi_pedidos`)
  ).map((x) => x.k),
);

const clave = (c: number, f: string) => `${c}|${f}`;
const conBi = new Map(cargas.map((c) => [clave(c.company_id, c.fecha), c]));
const conResumen = new Map(resumenes.map((r) => [clave(r.company_id, r.fecha), r]));
const pares = [...new Set([...conBi.keys(), ...conResumen.keys()])]
  .map((k) => ({ k, companyId: Number(k.split('|')[0]), fecha: k.split('|')[1] }))
  .filter((p) => p.fecha <= hasta && (p.fecha >= todosDesde || afectados.has(p.k)));
const sinConfig = [...new Set(pares.filter((p) => !configDe(p.companyId)).map((p) => p.companyId))];
const validos = pares.filter((p) => configDe(p.companyId));

// Por día: sucursales con BI y sin BI (el BI solo se toca donde ya estaba cargado). De lo más reciente a lo más viejo.
const porDia = new Map<string, { bi: ConfigSucursal[]; sinBi: ConfigSucursal[] }>();
for (const p of validos) {
  const d = porDia.get(p.fecha) ?? porDia.set(p.fecha, { bi: [], sinBi: [] }).get(p.fecha)!;
  (conBi.has(p.k) ? d.bi : d.sinBi).push(configDe(p.companyId)!);
}
const dias = [...porDia.keys()]
  .sort()
  .reverse()
  .slice(0, Number(opcion('--max-dias') ?? Infinity));
console.log(
  JSON.stringify({
    hasta,
    todosDesde,
    pares: validos.length,
    conBi: validos.filter((p) => conBi.has(p.k)).length,
    soloResumen: validos.filter((p) => !conBi.has(p.k)).length,
    dias: dias.length,
    desde: dias.at(-1),
    sinConfig,
  }),
);
if (!aplicar) {
  console.log('En seco. Agrega --aplicar para escribir.');
  process.exit(0);
}

const carpeta = 'C:/Users/carlo/Respaldos/thecoffee-supabase';
mkdirSync(carpeta, { recursive: true });
const sello = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
writeFileSync(`${carpeta}/${sello}-historial-antes-venta-neta.json`, JSON.stringify({ resumenes, cargas }));
const bitacora = `${carpeta}/${sello}-historial-bitacora.txt`;
console.log(`Respaldo: ${carpeta}/${sello}-historial-antes-venta-neta.json`);

const pendientes = new Set<string>();
const leer = async (cfg: ConfigSucursal, fecha: string, corte: number) => {
  const l = await conRappi(
    await leerVentana(cfg, fecha, fecha, { forzar: corte < 86400 }),
    rappiServicio(db, cfg),
  );
  const k = clave(cfg.companyId, fecha);
  const antes = conResumen.get(k)?.completa ?? conBi.get(k)?.completa ?? false;
  // Nunca cambiar un día completo por una lectura incompleta: se deja como estaba y se reintenta.
  if (l.estado !== 'completa' && antes) {
    return { ...l, estado: 'error' as const, error: 'proveedor-no-disponible' as const };
  }
  return l;
};

const inicio = Date.now();
let hechos = 0;
for (const d of dias) {
  const g = porDia.get(d)!;
  for (const [sucursales, bi] of [
    [g.bi, true],
    [g.sinBi, false],
  ] as const) {
    if (!sucursales.length) continue;
    process.env.BI_CARGA = bi ? '1' : '0';
    const r = await cortar(db, { fechas: [d], sucursales, leer, biPresupuestoMs: Number.POSITIVE_INFINITY });
    hechos += sucursales.length;
    for (const f of r.fallidas) pendientes.add(clave(f.companyId, f.fecha));
    const linea = `${d} ${bi ? 'con BI' : 'sin BI'}: ${r.escritas}/${sucursales.length} resúmenes, bi ${r.bi.guardados} (${r.bi.fallidos.length} fallidos)${r.fallidas.length ? `; sin leer: ${r.fallidas.map((f) => f.companyId).join(',')}` : ''} · ${hechos}/${validos.length} en ${Math.round((Date.now() - inicio) / 60000)} min`;
    console.log(linea);
    appendFileSync(bitacora, `${linea}\n`);
  }
}
writeFileSync(`${carpeta}/${sello}-historial-pendientes.json`, JSON.stringify([...pendientes]));
console.log(`Listo. Pendientes (sin leer o incompletas; el día quedó como estaba): ${pendientes.size}`);
