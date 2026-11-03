import { access } from 'node:fs/promises';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { limpiar, mapear, revertirMapeo } from '../../lib/crm/muestra';

/**
 * Datos de muestra del CRM Unificado (doc 40 §8). Cada comando que escribe requiere OK de Carlo.
 *
 *   npx tsx scripts/crm/muestra.ts ensayo                      mapea en una transacción y la revierte (solo conteos)
 *   npx tsx scripts/crm/muestra.ts aplicar                     mapea prospectos y tiendas al Pipeline general
 *   npx tsx scripts/crm/muestra.ts revertir                    regresa la muestra a los embudos de Zoho
 *   npx tsx scripts/crm/muestra.ts limpiar-ensayo              conteos antes/después de la limpieza, sin escribir
 *   npx tsx scripts/crm/muestra.ts limpiar --respaldo <ruta>   borra la muestra y sus archivos (respaldo obligatorio)
 */
async function main() {
  const [comando, ...resto] = process.argv.slice(2);
  const env = await leerEnvLocal();
  const db = new pg.Client({ connectionString: env.get('DATABASE_URL'), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    if (comando === 'ensayo' || comando === 'aplicar') {
      console.log(JSON.stringify(await mapear(db, { ensayo: comando === 'ensayo' }), null, 2));
    } else if (comando === 'revertir') {
      console.log(JSON.stringify(await revertirMapeo(db), null, 2));
    } else if (comando === 'limpiar-ensayo') {
      const r = await limpiar(db, { ensayo: true });
      console.log(JSON.stringify({ ...r, rutas: r.rutas.length }, null, 2));
    } else if (comando === 'limpiar') {
      const i = resto.indexOf('--respaldo');
      const respaldo = i >= 0 ? resto[i + 1] : undefined;
      if (!respaldo) throw new Error('Indica el respaldo verificado: --respaldo <ruta>');
      await access(respaldo);
      const r = await limpiar(db, { ensayo: false });
      // Storage se borra después del commit, con la clave secreta (nunca llega al navegador).
      const sb = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
        auth: { persistSession: false },
      });
      let fallidos = 0;
      for (let k = 0; k < r.rutas.length; k += 100) {
        const { error } = await sb.storage.from('crm-archivos').remove(r.rutas.slice(k, k + 100));
        if (error) fallidos += Math.min(100, r.rutas.length - k);
      }
      console.log(JSON.stringify({ ...r, rutas: r.rutas.length, objetosSinBorrar: fallidos }, null, 2));
      if (fallidos) console.log('Revisa huérfanos con: npx tsx scripts/zoho/archivos.ts huerfanos');
    } else {
      throw new Error('Comando: ensayo | aplicar | revertir | limpiar-ensayo | limpiar --respaldo <ruta>');
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
