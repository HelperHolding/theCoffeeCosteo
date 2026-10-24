import { writeFile } from 'node:fs/promises';
import { conLectura } from './db-lectura';
import { capturar } from './fase4';

/**
 * Fase 4 · Captura de SOLO LECTURA del estado de partida en el proyecto real (políticas y funciones con firma,
 * definición, dueño, SECURITY DEFINER/configuración, ACL y privilegios efectivos). Sin PII ni datos de negocio.
 *   npx tsx scripts/conciliacion/fase4-capturar.ts docs/conciliacion-brasil/fase4/estado-antes-produccion.json
 */
const salida = process.argv[2];
if (!salida) throw new Error('Uso: fase4-capturar.ts <salida.json>');
const { resultado } = await conLectura((q) => capturar({ query: (sql, p) => q(sql, p) as never }));
await writeFile(salida, JSON.stringify(resultado, null, 1) + '\n');
console.log(JSON.stringify({ politicas: resultado.politicas.length, funciones: resultado.funciones.length, salida }));
