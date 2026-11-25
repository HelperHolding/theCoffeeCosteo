// Uso: npx tsx scripts/sucursales-propias/probar-zip.ts "<ruta al ZIP>"
// Lee el ZIP con el mismo código del portal e imprime lo que entendió. No guarda nada ni llama a Zoho.
import { readFileSync } from 'node:fs';
import { leerZip } from '../../lib/sucursales-propias/zip';
import { unir } from '../../lib/sucursales-propias/recibos';

const ruta = process.argv[2];
if (!ruta) throw new Error('Pasa la ruta del ZIP.');
const zip = await leerZip(new Uint8Array(readFileSync(ruta)));
const { transferencias, avisos } = unir(zip.resumen, zip.recibos);
console.table(
  transferencias.map((t) => ({
    sec: t.secuencia,
    tipo: t.tipo,
    alias: t.alias,
    cuenta: t.clabe ? `…${t.clabe.slice(-4)}` : '(sin CLABE)',
    monto: t.monto.toFixed(2),
    fecha: t.fecha,
    llave: t.llave,
  })),
);
for (const a of [...zip.avisos, ...avisos]) console.log('Aviso:', a);
