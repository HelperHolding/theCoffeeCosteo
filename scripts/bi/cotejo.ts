import { mkdir, writeFile } from 'node:fs/promises';
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { aCsv, totalesPorDia } from '../../lib/bi/cotejo';

/**
 * Cotejo de totales por tienda × día × fuente × canal × pago de bi_lineas, para compararlos contra Zoho.
 * Solo lectura (llave de servicio de .env.local). Escribe datos/bi-cotejo-<desde>-<hasta>.csv.
 *
 *   npx.cmd tsx --conditions=react-server scripts/bi/cotejo.ts --desde 2026-10-01 --hasta 2026-10-31 [--companias 384,532]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const formatoFecha = /^\d{4}-\d{2}-\d{2}$/;
const desde = opcion('--desde') ?? '';
const hasta = opcion('--hasta') ?? '';
if (!formatoFecha.test(desde) || !formatoFecha.test(hasta)) throw new Error('Faltan --desde y --hasta (AAAA-MM-DD)');
const ids = (opcion('--companias') ?? '').split(',').filter(Boolean).map(Number);

const env = await leerEnvLocal();
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const PAGINA = 1000;
const columnas = 'fuente,company_id,fecha,pedido,linea,canal,metodo_pago,tipo_pago,smartphone,importe_cent,importe_neto_cent';
const lineas: Parameters<typeof totalesPorDia>[0] = [];
for (let desdeFila = 0; ; desdeFila += PAGINA) {
  let q = db.from('bi_lineas').select(columnas).gte('fecha', desde).lte('fecha', hasta);
  if (ids.length) q = q.in('company_id', ids);
  const { data, error } = await q
    .order('company_id')
    .order('fecha')
    .order('pedido')
    .order('linea')
    .order('fuente')
    .range(desdeFila, desdeFila + PAGINA - 1);
  if (error) throw new Error(`bi_lineas: ${error.message}`);
  lineas.push(...(data as unknown as typeof lineas));
  if (data.length < PAGINA) break;
}

const mapeo = await db.from('bi_mapeo_pago').select('metodo_pos,tipo_pos,smartphone,etiqueta');
if (mapeo.error) throw new Error(`bi_mapeo_pago: ${mapeo.error.message}`);
const tiendas = await db.from('bi_tiendas').select('company_id,store_id,nombre');
if (tiendas.error) throw new Error(`bi_tiendas: ${tiendas.error.message}`);

const filas = totalesPorDia(lineas, mapeo.data, tiendas.data);
await mkdir('datos', { recursive: true });
const ruta = `datos/bi-cotejo-${desde}-${hasta}.csv`;
await writeFile(ruta, aCsv(filas), 'utf8');
console.log(`${filas.length} filas escritas en ${ruta} (${lineas.length} líneas leídas).`);
