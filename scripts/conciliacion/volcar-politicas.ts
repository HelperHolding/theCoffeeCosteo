import { writeFile } from 'node:fs/promises';
import { crearDbLocal } from '../db/pglite';

/** Fase 3 · Vuelca pg_policies + privilegios de funciones de una BD PGlite con las migraciones del repo (sin red). */
const db = await crearDbLocal();
const r = await db.query(`select tablename, policyname, permissive, roles::text, cmd, qual, with_check from pg_policies
  where schemaname in ('public', 'storage') order by 1, 2`);
const f = await db.query(`select p.proname, p.proconfig, has_function_privilege('anon', p.oid, 'execute') as anon,
  has_function_privilege('authenticated', p.oid, 'execute') as auth from pg_proc p where p.pronamespace = 'public'::regnamespace order by 1`);
await writeFile(process.argv[2], JSON.stringify({ politicas: r.rows, funciones: f.rows }, null, 1));
console.log('OK', r.rows.length);
