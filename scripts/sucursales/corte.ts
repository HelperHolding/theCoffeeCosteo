import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas } from '../../lib/sucursales/config';
import { cortar } from '../../lib/sucursales/corte-servidor';
import { diasEntre, sumarDias } from '../../lib/sucursales/tiempo';

/**
 * Historial del Tablero de México (docs/sucursales/16): corta días ya cerrados con el MISMO código que el corte de
 * Vercel y los guarda en sucursales_resumen_dia, de 7 en 7 días. Escribe en la base de NEXT_PUBLIC_SUPABASE_URL con
 * SUPABASE_SECRET_KEY de .env.local: solo con OK de Carlo.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/corte.ts --desde 2026-08-10 --hasta 2026-11-02 [--companias 513,384]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const desde = opcion('--desde')!;
const hasta = opcion('--hasta')!;
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '') || desde > hasta)
  throw new Error('Faltan --desde y --hasta (AAAA-MM-DD)');
const ids = (opcion('--companias') ?? '').split(',').filter(Boolean).map(Number);
const sucursales = ids.length
  ? sucursalesConfiguradas.filter((s) => ids.includes(s.companyId))
  : sucursalesConfiguradas;

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const n = diasEntre(desde, hasta) + 1;
for (let i = 0; i < n; i += 7) {
  const fechas = Array.from({ length: Math.min(7, n - i) }, (_, j) => sumarDias(desde, i + j));
  const r = await cortar(db, { fechas, sucursales });
  console.log(
    `${fechas[0]}…${fechas.at(-1)}: ${r.escritas} días guardados (${r.completas} completos) de ${sucursales.length} sucursales en ${Math.round(r.ms / 1000)} s${r.fallidas.length ? `; sin leer: ${r.fallidas.map((f) => `${f.companyId} ${f.fecha}`).join(', ')}` : ''}`,
  );
}
