import { homedir } from 'node:os';
import { join } from 'node:path';

/**
 * Las extracciones y los informes contienen agregados reales por tienda: viven FUERA del repo, junto a los
 * demás respaldos de Supabase. Se puede cambiar con --salida o ANALYTICS_SALIDA.
 */
export const SALIDA_PREDETERMINADA =
  process.env.ANALYTICS_SALIDA || join(homedir(), 'Respaldos', 'thecoffee-supabase', 'analytics-cargas');
