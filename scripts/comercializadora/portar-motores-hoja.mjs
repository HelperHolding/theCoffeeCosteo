// Copia byte por byte los dos motores de las Sheets del HTML viejo (a9e4a22) a supabase/functions/_shared/.
// Uso: node scripts/comercializadora/portar-motores-hoja.mjs <app-vieja-a9e4a22.html> <raíz del repo>
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [html, raiz] = process.argv.slice(2);
const L = readFileSync(html, 'utf8').replace(/\r\n/g, '\n').split('\n');
const lineas = (a, b) => L.slice(a - 1, b).join('\n');
const exige = (n, texto) => {
  if (L[n - 1] !== texto) throw new Error(`Línea ${n}: esperaba ${JSON.stringify(texto)} y hay ${JSON.stringify(L[n - 1])}`);
};
exige(36040, 'var _impEngine=(function(){');
exige(36042, 'var module={exports:{}};');
exige(36921, 'module.exports = {');
exige(36928, 'var _cafeEngine=(function(){');
exige(36930, 'var module={exports:{}};');
exige(37566, 'module.exports = cafeEngine;');

const cabeza = (que, a, b) =>
  [
    '// @ts-nocheck',
    '// deno-lint-ignore-file',
    `// Copia EXACTA del motor ${que} del sitio viejo: app/index.html a9e4a22, líneas ${a}–${b}, el cuerpo del IIFE`,
    '// (función pura, CommonJS, validada contra los valores de la Sheet). No se edita a mano: se vuelve a generar con',
    '// scripts/comercializadora/portar-motores-hoja.mjs (plan 3e, Tarea 2). Solo cambia la última línea: `export` en lugar de `module.exports`.',
    '',
  ].join('\n');

const imp =
  cabeza('de importaciones (_impEngine)', 36043, 36920) +
  lineas(36043, 36920) +
  '\nexport { impEngine };\nexport const helpers = { ROUND, CEILING, EDATE, ISO, parseDate, serFromYMD, T0, T1, TPCT, TMIL, DDMMMYY, DDMMM, MMMYY, MMM, DEF };\n';
const cafe =
  cabeza('de café (_cafeEngine)', 36931, 37565) +
  lineas(36931, 37565) +
  '\nexport { cafeEngine, roundUp0, fmt0, num, esVacio, calcularBloque };\n';
writeFileSync(join(raiz, 'supabase/functions/_shared/impEngine.ts'), imp);
writeFileSync(join(raiz, 'supabase/functions/_shared/cafeEngine.ts'), cafe);
console.log('impEngine.ts', imp.split('\n').length, 'líneas · cafeEngine.ts', cafe.split('\n').length, 'líneas');
