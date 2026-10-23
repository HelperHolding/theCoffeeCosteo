import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { leerEnvLocal } from '../zoho/cliente';
import { PROYECTO } from './db-lectura';

/**
 * Fase 4 · Respaldo lógico del proyecto real con los binarios oficiales de PostgreSQL 17 (pg_dump / pg_dumpall).
 * - Credenciales: DATABASE_URL con el cargador existente → variables PG* SOLO del proceso hijo. Nunca en argumentos,
 *   archivos ni salida.
 * - Salida en una carpeta privada fuera del repo: roles (sin contraseñas), base completa en formato custom (esquema +
 *   datos, incluye supabase_migrations) y un manifiesto con tamaños y sha256 (sin datos).
 *   npx tsx scripts/conciliacion/respaldo-logico.ts <bin de PostgreSQL 17> <carpeta destino>
 */
const [bin, destino] = process.argv.slice(2);
if (!bin || !destino) throw new Error('Uso: respaldo-logico.ts <bin> <destino>');
if (/theCoffeeCosteo/i.test(destino)) throw new Error('El respaldo no puede quedar dentro del repo');

const url = (await leerEnvLocal()).get('DATABASE_URL');
if (!url) throw new Error('Falta DATABASE_URL en .env.local');
const u = new URL(url);
if (!(u.username.endsWith(`.${PROYECTO}`) || u.hostname.includes(PROYECTO)))
  throw new Error(`DATABASE_URL no corresponde al proyecto ${PROYECTO}`);
const env = {
  ...process.env,
  PGHOST: u.hostname,
  PGPORT: u.port || '5432',
  PGUSER: decodeURIComponent(u.username),
  PGPASSWORD: decodeURIComponent(u.password),
  PGDATABASE: u.pathname.slice(1) || 'postgres',
  PGSSLMODE: 'require',
  PGAPPNAME: 'conciliacion-fase4-respaldo',
};

/** Ejecuta un binario; la salida de error se resume (sin credenciales: nunca se pasan por argumentos). */
const correr = (exe: string, args: string[]) =>
  new Promise<{ codigo: number; errores: string[] }>((ok) => {
    const p = spawn(join(bin, exe), args, { env, windowsHide: true });
    let err = '';
    p.stderr.on('data', (d) => (err += d));
    p.stdout.on('data', () => {});
    p.on('close', (codigo) => ok({ codigo: codigo ?? -1, errores: err.split(/\r?\n/).filter(Boolean).slice(0, 40) }));
  });

await mkdir(destino, { recursive: true });
const inicio = new Date().toISOString();
const pasos = [
  { archivo: 'roles.sql', exe: 'pg_dumpall.exe', args: ['--roles-only', '--no-role-passwords', '-f', join(destino, 'roles.sql')] },
  // Base completa (todos los esquemas a los que postgres tiene acceso): esquema + datos + privilegios + registro.
  { archivo: 'base.dump', exe: 'pg_dump.exe', args: ['-Fc', '--no-sync', '-f', join(destino, 'base.dump')] },
  // Copia en texto solo del esquema, para revisión humana y diff.
  { archivo: 'esquema.sql', exe: 'pg_dump.exe', args: ['--schema-only', '-f', join(destino, 'esquema.sql')] },
];
const resultado = [];
for (const p of pasos) {
  const r = await correr(p.exe, p.args);
  const ruta = join(destino, p.archivo);
  const existe = await stat(ruta).catch(() => null);
  resultado.push({
    archivo: p.archivo,
    codigo: r.codigo,
    bytes: existe?.size ?? 0,
    sha256: existe ? createHash('sha256').update(await readFile(ruta)).digest('hex') : null,
    errores: r.errores,
  });
}
const manifiesto = { proyecto: PROYECTO, inicio, fin: new Date().toISOString(), herramienta: bin, archivos: resultado };
await writeFile(join(destino, 'manifiesto.json'), JSON.stringify(manifiesto, null, 1));
console.log(JSON.stringify(manifiesto, null, 1));
