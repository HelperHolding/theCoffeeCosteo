import pg from 'pg';
import { conLectura } from './db-lectura';

/**
 * Fase 4 · Permisos efectivos de LECTURA bajo RLS por escenario (solo SELECT, sin escrituras, sin datos impresos):
 * un usuario activo de cada rol, uno sin perfil, una sesión OAuth (MCP) de admin y el rol anon.
 * Se ejecuta contra el proyecto real (READ ONLY) o contra una copia local (p. ej. la restaurada, estado previo).
 *   npx tsx scripts/conciliacion/verificar-permisos.ts [postgres://postgres@localhost:55432/restaurada]
 */
const local = process.argv[2];
const OBJETOS = ['recetas', 'insumos', 'producto_tamanos', 'precio_canal_manual', 'v_resumen', 'v_alerta_producto_canal',
  'perfiles', 'bitacora', 'perfil_modulos', 'perfil_sucursales', 'crm_tiendas'];
type Q = (sql: string, p?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

async function escenarios(q: Q) {
  const usuarios = (await q(`select distinct on (rol) rol, user_id from perfiles where activo order by rol, user_id`)).rows as {
    rol: string;
    user_id: string;
  }[];
  const casos: { nombre: string; rol: 'authenticated' | 'anon'; claims: Record<string, unknown> | null }[] = [
    ...usuarios.map((u) => ({ nombre: `usuario ${u.rol}`, rol: 'authenticated' as const, claims: { sub: u.user_id, role: 'authenticated' } })),
    { nombre: 'sesión sin perfil', rol: 'authenticated', claims: { sub: '00000000-0000-0000-0000-0000000000ff', role: 'authenticated' } },
    {
      nombre: 'OAuth (MCP) de admin',
      rol: 'authenticated',
      claims: { sub: usuarios.find((u) => u.rol === 'admin')?.user_id, role: 'authenticated', client_id: 'verificacion' },
    },
    { nombre: 'anon', rol: 'anon', claims: { role: 'anon' } },
  ];
  const r: Record<string, Record<string, number | string>> = {};
  for (const c of casos) {
    r[c.nombre] = {};
    for (const o of OBJETOS) {
      await q('savepoint e');
      try {
        await q(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(c.claims)]);
        await q(`set local role ${c.rol}`);
        r[c.nombre][o] = Number((await q(`select count(*)::int as n from public.${o}`)).rows[0].n);
      } catch (e) {
        r[c.nombre][o] = (e as { code?: string }).code === '42501' ? 'sin permiso' : `error ${(e as { code?: string }).code}`;
      }
      await q('rollback to savepoint e');
    }
  }
  const funciones = (
    await q(`select p.proname as f, has_function_privilege('anon', p.oid, 'execute') as anon,
             has_function_privilege('authenticated', p.oid, 'execute') as authenticated,
             has_function_privilege('service_role', p.oid, 'execute') as service_role
             from pg_proc p where p.pronamespace = 'public'::regnamespace and p.proname in ('rol_actual', 'tiene_rol', 'registrar_bitacora')
             order by 1`)
  ).rows;
  return { lectura: r, funciones };
}

let salida;
if (local) {
  if (!/@(localhost|127\.0\.0\.1)[:/]/.test(local)) throw new Error('Solo copias locales');
  const c = new pg.Client({ connectionString: local });
  await c.connect();
  await c.query('begin read only');
  salida = await escenarios((sql, p) => c.query(sql, p));
  await c.query('rollback');
  await c.end();
} else salida = (await conLectura((q) => escenarios(q))).resultado;
console.log(JSON.stringify(salida));
