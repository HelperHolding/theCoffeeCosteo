// Accesos de Dione y Claudia (docs/sucursales/18 y 19), orden de Carlos del 2026-11-27:
// - Sucursales: exactamente las 11 de Guadalajara (perfil_sucursales).
// - Costeo: rol `operaciones` (productos y recetas, sin precios; D1). Su módulo sucursales_costeo se queda.
// Candados: cada una por su user_id, con nombre, rol actual y correo esperados; si algo no coincide, no se toca nada.
// Sin --aplicar solo muestra el estado. Con --aplicar guarda antes el estado previo en --respaldo <archivo.json>.
//   npx tsx scripts/sucursales/accesos-gdl.ts [--aplicar --respaldo previo.json]
import { readFileSync, writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { sucursalesDeCiudad } from '../../lib/sucursales/alcance';

const args = process.argv.slice(2);
const aplicar = args.includes('--aplicar');
const respaldo = args.includes('--respaldo') ? args[args.indexOf('--respaldo') + 1] : undefined;
if (aplicar && !respaldo)
  throw new Error('Con --aplicar, indica --respaldo <archivo.json> para el estado previo.');

const env = Object.fromEntries(
  readFileSync('.env.local', 'utf8')
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf('=')), l.slice(l.indexOf('=') + 1).replace(/^"|"$/g, '')]),
);
const db = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SECRET_KEY, {
  auth: { persistSession: false },
});

// Quiénes: el nombre del perfil, su rol de hoy y el inicio de su correo (hay perfiles franquiciado parecidos).
const PERSONAS = [
  { nombre: 'Dione', correo: 'dacuna@' },
  { nombre: 'Claudia', correo: 'clarios@' },
];
const GDL = sucursalesDeCiudad('guadalajara')
  .map((s) => s.companyId)
  .sort((a, b) => a - b);

async function estado(userId: string) {
  const [p, m, s] = await Promise.all([
    db.from('perfiles').select('user_id, nombre, rol, activo').eq('user_id', userId).single(),
    db.from('perfil_modulos').select('modulo, nivel').eq('user_id', userId).order('modulo'),
    db.from('perfil_sucursales').select('company_id').eq('user_id', userId).order('company_id'),
  ]);
  if (p.error || m.error || s.error) throw new Error('No se pudo leer el estado.');
  return { perfil: p.data, modulos: m.data, sucursales: s.data.map((x) => x.company_id as number) };
}

(async () => {
  const { data: usuarios, error } = await db.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const quienes = [];
  for (const x of PERSONAS) {
    const { data: perfiles } = await db
      .from('perfiles')
      .select('user_id, nombre, rol')
      .eq('nombre', x.nombre)
      .eq('rol', 'sucursales');
    const candidatos = (perfiles ?? []).filter((p) =>
      usuarios.users.find((u) => u.id === p.user_id)?.email?.startsWith(x.correo),
    );
    if (candidatos.length !== 1)
      throw new Error(
        `${x.nombre}: ${candidatos.length} perfiles coinciden (se esperaba 1). No se toca nada.`,
      );
    quienes.push({ ...x, userId: candidatos[0].user_id as string });
  }

  const previo = Object.fromEntries(
    await Promise.all(
      quienes.map(async (q) => [q.nombre, { userId: q.userId, ...(await estado(q.userId)) }]),
    ),
  );
  for (const [n, e] of Object.entries(previo))
    console.log(
      `${n}: rol ${e.perfil.rol}, módulos ${e.modulos.map((m) => m.modulo).join('+')}, ${e.sucursales.length} sucursales`,
    );
  if (!aplicar) return;

  writeFileSync(respaldo!, JSON.stringify({ fecha: new Date().toISOString(), previo }, null, 1));
  for (const q of quienes) {
    const quitar = previo[q.nombre].sucursales.filter((c: number) => !GDL.includes(c));
    if (quitar.length) {
      const r = await db.from('perfil_sucursales').delete().eq('user_id', q.userId).in('company_id', quitar);
      if (r.error) throw new Error(`${q.nombre}: no se pudieron quitar sucursales (${r.error.message}).`);
    }
    const faltan = GDL.filter((c) => !previo[q.nombre].sucursales.includes(c));
    if (faltan.length) {
      const r = await db
        .from('perfil_sucursales')
        .insert(faltan.map((c) => ({ user_id: q.userId, company_id: c })));
      if (r.error) throw new Error(`${q.nombre}: no se pudieron agregar sucursales (${r.error.message}).`);
    }
    const r = await db
      .from('perfiles')
      .update({ rol: 'operaciones' })
      .eq('user_id', q.userId)
      .eq('rol', 'sucursales');
    if (r.error) throw new Error(`${q.nombre}: no se pudo cambiar el rol (${r.error.message}).`);
    const e = await estado(q.userId);
    const ok = e.perfil.rol === 'operaciones' && JSON.stringify(e.sucursales) === JSON.stringify(GDL);
    console.log(
      `${q.nombre}: ahora rol ${e.perfil.rol}, ${e.sucursales.length} sucursales (${e.sucursales.join(', ')}) — ${ok ? 'OK' : 'REVISAR'}`,
    );
    if (!ok) throw new Error(`${q.nombre}: el resultado no es el esperado.`);
  }
})();
