import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { elegirSucursales, leerMes, mesCerrado } from '../../lib/sucursales/consumo-mes';
import { calcularMes, guardarServicio, recetasServicio } from '../../lib/sucursales/consumo-mes-servidor';
import { catalogoServicio, rappiServicio } from '../../lib/sucursales/corte-servidor';
import { leerDias } from '../../lib/sucursales/datos';

/**
 * Consumo nacional de un mes cerrado (docs/sucursales/17): lo calcula por sucursal con el MISMO código que la sección
 * Consumo y lo guarda en sucursales_consumo_mes. Volver a correrlo reemplaza ese mes. Escribe en la base de
 * NEXT_PUBLIC_SUPABASE_URL con SUPABASE_SECRET_KEY de .env.local: solo con OK.
 *
 *   npx.cmd tsx --conditions=react-server scripts/sucursales/consumo-mes.ts --mes 2026-10 [--companias 513,384]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const m = leerMes(opcion('--mes') ?? '');
if (!m) throw new Error('Falta --mes AAAA-MM');
const ids = (opcion('--companias') ?? '').split(',').filter(Boolean).map(Number);
// Antes de tocar la base: sin sucursales que coincidan, o con un mes sin cerrar, no hay nada que calcular.
const sucursales = elegirSucursales(ids, sucursalesConfiguradas);
if (!mesCerrado(m.mes)) throw new Error(`El mes ${m.mes.slice(0, 7)} no ha cerrado: solo meses anteriores al actual.`);

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const datos = await recetasServicio(db);
if (!datos) throw new Error('No se pudieron leer las recetas (¿la migración 38 está aplicada?).');
// Sin catálogo POS las cantidades guardadas saldrían menores (productos sin código): mejor no calcular.
const catalogo = await catalogoServicio(db);
if (!catalogo) throw new Error('No se pudo leer el catálogo POS (producto_codigo_pos)');
const r = await calcularMes({
  mes: m.mes,
  sucursales,
  datos,
  catalogo,
  deps: { leer: leerDias, rappi: (cfg) => rappiServicio(db, cfg), guardar: guardarServicio(db), avance: console.log },
});
console.log(
  `\n${m.mes.slice(0, 7)}: ${r.guardadas} de ${sucursales.length} sucursales guardadas en ${Math.round(r.ms / 1000)} s.` +
    (r.incompletas.length ? `\nIncompletas (se avisan en el tablero): ${r.incompletas.join(', ')}` : '') +
    (r.fallidas.length
      ? `\nSin guardar (conservan su cálculo anterior):\n${r.fallidas.map((f) => `  ${f.companyId}: ${f.motivo}`).join('\n')}`
      : '') +
    (r.fallidas.length || r.incompletas.length
      ? `\nPara repetir solo esas: --companias ${[...r.fallidas.map((f) => f.companyId), ...r.incompletas].join(',')}`
      : ''),
);
