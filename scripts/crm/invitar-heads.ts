// Alta de usuarios del CRM por invitación (pedido de Carlos, 2026-11-18). A cada persona:
//   1. le manda la invitación de Supabase Auth (plantilla en español, sale de notificaciones@) para elegir contraseña;
//   2. le crea el perfil con rol 'sucursales' (perfil sin Costeo: solo ve los módulos que tenga en perfil_modulos);
//   3. le da el CRM en nivel 'edicion' y su membresía de área (head o miembro).
// Quien no tenga correo todavía se omite y se avisa.
//
// Las personas (nombre y correo son datos personales) NO van en el repositorio: se leen de un JSON local, fuera del
// repo, con la forma [{ "nombre": "…", "correo": "…" | null, "area": "ventas", "rol": "head" }].
//
//   npx tsx --conditions=react-server scripts/crm/invitar-heads.ts <personas.json>            → solo muestra el plan
//   npx tsx --conditions=react-server scripts/crm/invitar-heads.ts <personas.json> --aplicar  → invita y da accesos
import { readFileSync } from 'node:fs';
import { leerEnvLocal } from '../zoho/cliente';

interface Persona {
  nombre: string;
  correo: string | null;
  area: 'ventas' | 'legal' | 'proyectos' | 'finanzas';
  rol: 'head' | 'miembro';
}
const archivo = process.argv.slice(2).find((a) => !a.startsWith('--'));
if (!archivo) throw new Error('Pasa la ruta del JSON de personas (fuera del repositorio).');
const PERSONAS = JSON.parse(readFileSync(archivo, 'utf8')) as Persona[];
for (const p of PERSONAS)
  if (!['ventas', 'legal', 'proyectos', 'finanzas'].includes(p.area) || !['head', 'miembro'].includes(p.rol))
    throw new Error(`Área o rol inválido para ${p.nombre}`);

const env = await leerEnvLocal();
const url = env.get('NEXT_PUBLIC_SUPABASE_URL')!;
const ref = new URL(url).hostname.split('.')[0];
const admin = {
  Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
  'Content-Type': 'application/json',
};
const sql = async <T = Record<string, unknown>>(query: string): Promise<T[]> => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: admin,
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 500));
  return j as T[];
};
const lit = (v: string) => `'${v.replace(/'/g, "''")}'`;
const aplicar = process.argv.includes('--aplicar');

// La llave de servicio se pide a la API de administración en cada corrida y no se guarda ni se imprime.
const llaves = (await (
  await fetch(`https://api.supabase.com/v1/projects/${ref}/api-keys?reveal=true`, { headers: admin })
).json()) as { name: string; api_key: string }[];
const servicio = llaves.find((k) => k.name === 'service_role')?.api_key;
if (!servicio) throw new Error('No se encontró la llave de servicio del proyecto.');

const resultado: Record<string, string>[] = [];
for (const p of PERSONAS) {
  if (!p.correo) {
    resultado.push({ nombre: p.nombre, area: p.area, rol: p.rol, estado: 'omitido: falta el correo' });
    continue;
  }
  const [existe] = await sql<{ id: string }>(
    `select id from auth.users where lower(email) = lower(${lit(p.correo)})`,
  );
  if (!aplicar) {
    resultado.push({
      nombre: p.nombre,
      area: p.area,
      rol: p.rol,
      estado: existe ? 'ya existe: solo se darían accesos' : 'se invitaría',
    });
    continue;
  }
  let id = existe?.id;
  if (!id) {
    const r = await fetch(`${url}/auth/v1/invite`, {
      method: 'POST',
      headers: { apikey: servicio, Authorization: `Bearer ${servicio}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: p.correo, data: { nombre: p.nombre } }),
    });
    const j = await r.json();
    if (!r.ok)
      throw new Error(`Invitación a ${p.nombre}: HTTP ${r.status} ${JSON.stringify(j).slice(0, 200)}`);
    id = j.id as string;
  }
  await sql(`begin;
insert into public.perfiles (user_id, nombre, rol, activo) values (${lit(id)}, ${lit(p.nombre)}, 'sucursales', true)
  on conflict (user_id) do update set nombre = excluded.nombre, activo = true;
insert into public.perfil_modulos (user_id, modulo, nivel) values (${lit(id)}, 'crm', 'edicion')
  on conflict (user_id, modulo) do update set nivel = excluded.nivel;
insert into public.crm_membresias (user_id, area, rol) values (${lit(id)}, ${lit(p.area)}, ${lit(p.rol)})
  on conflict (user_id, area) do update set rol = excluded.rol;
commit;`);
  resultado.push({
    nombre: p.nombre,
    area: p.area,
    rol: p.rol,
    estado: existe ? 'accesos dados' : 'invitado',
  });
}
console.table(resultado);

if (aplicar)
  console.table(
    await sql(`select p.nombre, p.rol perfil, m.nivel crm, c.area, c.rol, u.invited_at is not null invitado
      from perfiles p join auth.users u on u.id = p.user_id
      left join perfil_modulos m on m.user_id = p.user_id and m.modulo = 'crm'
      left join crm_membresias c on c.user_id = p.user_id
      where lower(u.email) in (${PERSONAS.filter((p) => p.correo)
        .map((p) => lit(p.correo!.toLowerCase()))
        .join(', ')})`),
  );
