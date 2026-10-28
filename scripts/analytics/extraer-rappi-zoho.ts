import { randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { estadoDia, fechasEntre, type LecturaDiaria } from '../../lib/analytics/contrato';
import { clienteZoho, leerCsv, LOOKER_SUCURSALES } from './zoho';
import type { TiendaAnalytics } from './persistencia';
import { SALIDA_PREDETERMINADA } from './salida';

/**
 * PREPARACIÓN histórica de Rappi desde Zoho (archivo Rappi cargado a mano en «Looker Sucursales», T+1).
 * Carga puntual, NO recurrente (D5 pendiente). Fuente 'zoho_rappi': nunca se suma al POS ni a los KPI.
 * - Solo fechas cerradas que Zoho ya tiene. Una tienda sin filas de Zoho ese día queda "sin lectura".
 * - Agregado por tienda × día × canal: NO permite deduplicar contra los pedidos Rappi del POS
 *   (la llave es refundId ↔ Order ID por pedido, docs/analytics-zoho/02 §4.3).
 * - Importes en centavos exactos: SUM(ROUND(Net Amount (Local) × 100)) por línea.
 *
 * Uso: npx tsx scripts/analytics/extraer-rappi-zoho.ts --tiendas <tiendas.json> --desde 2026-10-26
 *        --hasta 2026-11-01 [--salida <carpeta fuera del repo>]
 */
const arg = (n: string, d?: string) => {
  const i = process.argv.indexOf(`--${n}`);
  const v = i > 0 ? process.argv[i + 1] : d;
  if (!v) throw new Error(`Falta --${n}`);
  return v;
};
const fechaSql = (f: string) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(f)) throw new Error(`Fecha inválida ${f}`);
  return `'${f}'`;
};
const tiendas: TiendaAnalytics[] = JSON.parse(readFileSync(arg('tiendas'), 'utf8')).incluidas;
const porStore = new Map(tiendas.map((t) => [t.store_id, t]));
const ahora = new Date();
const cerradas = fechasEntre(arg('desde'), arg('hasta')).filter((f) => estadoDia(f, ahora) === 'cerrado');
if (!cerradas.length) throw new Error('Ninguna fecha cerrada en la ventana');
const zoho = await clienteZoho();
const importacion = await zoho.ultimaImportacion(LOOKER_SUCURSALES);
const rango = `"Date" >= ${fechaSql(cerradas[0])} AND "Date" < DATE_ADD(${fechaSql(cerradas.at(-1)!)}, INTERVAL 1 DAY)`;
const filas = leerCsv(
  await zoho.exportarSql(
    `SELECT "Store ID", DATE("Date") AS fecha, "Place or Sale" AS lugar, COUNT(DISTINCT "Order ID") AS tickets,
            SUM(ROUND("Net Amount (Local)" * 100)) AS venta_cent, SUM("Products") AS unidades
     FROM "Looker Sucursales" WHERE ${rango} GROUP BY "Store ID", DATE("Date"), "Place or Sale"`,
  ),
);
// Un pedido no puede estar en Rappi y Rappi Turbo a la vez: se comprueba con el conteo distinto conjunto.
const conjunto = leerCsv(
  await zoho.exportarSql(
    `SELECT "Store ID", DATE("Date") AS fecha, COUNT(DISTINCT "Order ID") AS tickets FROM "Looker Sucursales"
     WHERE ${rango} AND "Place or Sale" IN ('RAPPI', 'RAPPI TURBO') GROUP BY "Store ID", DATE("Date")`,
  ),
);
const fechaDe = (s: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s) ?? /^(\d{2})\/(\d{2})\/(\d{4})/.exec(s);
  if (!m) throw new Error(`Fecha de Zoho no reconocida: ${s}`);
  return m[1].length === 4 ? `${m[1]}-${m[2]}-${m[3]}` : `${m[3]}-${m[2]}-${m[1]}`;
};
const n = (s: string) => {
  const x = Number(String(s).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(x)) throw new Error(`Número inválido ${s}`);
  return x;
};

type Canal = 'rappi' | 'rappi_turbo';
const dias = new Map<string, Map<Canal, { venta_cent: number; tickets: number; unidades: number }>>();
const sinTienda = new Set<string>();
const lugares = new Set<string>();
for (const r of filas) {
  const fecha = fechaDe(r.fecha);
  const t = porStore.get(Number(r['Store ID']));
  lugares.add(r.lugar);
  if (!t) {
    sinTienda.add(r['Store ID'] || '(vacío)');
    continue;
  }
  const k = `${t.company_id}|${fecha}`;
  const d =
    dias.get(k) ??
    new Map<Canal, { venta_cent: number; tickets: number; unidades: number }>([
      ['rappi', { venta_cent: 0, tickets: 0, unidades: 0 }],
      ['rappi_turbo', { venta_cent: 0, tickets: 0, unidades: 0 }],
    ]);
  dias.set(k, d);
  const canal: Canal | null =
    r.lugar === 'RAPPI' ? 'rappi' : r.lugar === 'RAPPI TURBO' ? 'rappi_turbo' : null;
  if (!canal) continue; // Tablet/Smartphone: solo prueban que Zoho tiene el día de esa tienda.
  const v = d.get(canal)!;
  v.venta_cent += Math.round(n(r.venta_cent));
  v.tickets += n(r.tickets);
  v.unidades += n(r.unidades);
}
const solapes = conjunto.filter((r) => {
  const t = porStore.get(Number(r['Store ID']));
  const d = t && dias.get(`${t.company_id}|${fechaDe(r.fecha)}`);
  return d && n(r.tickets) !== d.get('rappi')!.tickets + d.get('rappi_turbo')!.tickets;
});
if (solapes.length)
  throw new Error(`${solapes.length} tienda-día con pedidos en Rappi y Rappi Turbo a la vez`);

const cargaId = randomUUID();
const leidoEn = new Date().toISOString();
const lecturas: LecturaDiaria[] = [...dias].map(([k, d]) => {
  const [company, fecha] = k.split('|');
  return {
    fuente: 'zoho_rappi',
    company_id: Number(company),
    fecha,
    leido_en: leidoEn,
    provisional: false,
    completa: true,
    version_calculo: 'zoho-rappi-diario-v1',
    criterio_fecha: '"Date" de Zoho «Looker Sucursales» (hora local de tienda)',
    origen: `Zoho Analytics «Looker Sucursales», archivo Rappi manual; última importación ${importacion.momento}`,
    carga_id: cargaId,
    canales: (['rappi', 'rappi_turbo'] as const).map((c) => ({ canal: c, ...d.get(c)! })),
  };
});
lecturas.sort((a, b) => a.company_id - b.company_id || a.fecha.localeCompare(b.fecha));
const fechasConDatos = [...new Set(lecturas.map((l) => l.fecha))].sort();
const totales = Object.fromEntries(
  fechasConDatos.map((f) => [
    f,
    Object.fromEntries(
      (['rappi', 'rappi_turbo'] as const).map((c) => [
        c,
        lecturas
          .filter((l) => l.fecha === f)
          .map((l) => l.canales.find((x) => x.canal === c)!)
          .reduce(
            (a, x) => ({
              venta_cent: a.venta_cent + x.venta_cent,
              tickets: a.tickets + x.tickets,
              unidades: a.unidades + x.unidades,
            }),
            { venta_cent: 0, tickets: 0, unidades: 0 },
          ),
      ]),
    ),
  ]),
);
const informe = {
  fuente: 'zoho_rappi',
  carga_id: cargaId,
  extraido_en: leidoEn,
  recurrente: false,
  ultima_importacion_zoho: importacion,
  fechas_cerradas_pedidas: cerradas,
  fechas_con_datos_en_zoho: fechasConDatos,
  fechas_sin_datos_en_zoho: cerradas.filter((f) => !fechasConDatos.includes(f)),
  lugares_vistos: [...lugares].sort(),
  store_id_sin_tienda_incluida: [...sinTienda],
  lecturas: lecturas.length,
  deduplicacion: 'No posible con agregados: requiere refundId (POS) ↔ Order ID (Zoho) por pedido.',
  totales_por_fecha_y_canal: totales,
  llamadas_zoho: zoho.llamadas(),
};
const salida = arg('salida', SALIDA_PREDETERMINADA);
mkdirSync(salida, { recursive: true });
const archivo = join(salida, `lecturas-zoho-rappi-${leidoEn.replace(/[:.]/g, '-')}.json`);
writeFileSync(archivo, JSON.stringify({ informe, lecturas }, null, 1) + '\n');
console.log(JSON.stringify({ ...informe, totales_por_fecha_y_canal: undefined }));
console.log(JSON.stringify(totales));
console.log(`Lecturas → ${archivo}`);
