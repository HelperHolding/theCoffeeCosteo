// Cards de práctica para que cada área mueva tarjetas entre etapas (pedido de Carlos, 2026-11-18).
// Por cada etapa abierta del proceso general crea dos cards: una «lista» (candados de su etapa cumplidos, se puede
// avanzar) y una «en curso» (le falta capturar algo). Todo con datos sintéticos, prefijo «Práctica · » y muestra = true,
// así que sale junto con el resto de la muestra cuando se limpie la base.
//
//   npx tsx --conditions=react-server scripts/crm/practica-heads.ts            → ensayo (ROLLBACK, no deja nada)
//   npx tsx --conditions=react-server scripts/crm/practica-heads.ts --aplicar  → la crea en producción
//   npx tsx --conditions=react-server scripts/crm/practica-heads.ts --borrar   → borra solo las cards de práctica
import { randomUUID } from 'node:crypto';
import { leerEnvLocal } from '../zoho/cliente';

const env = await leerEnvLocal();
const ref = new URL(env.get('NEXT_PUBLIC_SUPABASE_URL')!).hostname.split('.')[0];
const sql = async <T = Record<string, unknown>>(query: string): Promise<T[]> => {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.get('SUPABASE_ACCESS_TOKEN')}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 600));
  return j as T[];
};
const PREFIJO = 'Práctica · ';
const lit = (v: unknown) =>
  v === null || v === undefined
    ? 'null'
    : typeof v === 'number'
      ? String(v)
      : `'${String(v).replace(/'/g, "''")}'`;

if (process.argv.includes('--borrar')) {
  const [r] = await sql<{ t: number; f: number }>(`begin;
delete from public.crm_cumplimientos c using public.crm_tiendas t where c.tienda_id = t.id and t.nombre like '${PREFIJO}%' and t.muestra;
delete from public.crm_cumplimientos c using public.crm_franquiciatarios f where c.franquiciatario_id = f.id and f.nombre like '${PREFIJO}%' and f.muestra;
with t as (delete from public.crm_tiendas where nombre like '${PREFIJO}%' and muestra returning 1),
     f as (delete from public.crm_franquiciatarios where nombre like '${PREFIJO}%' and muestra returning 1)
select (select count(*) from t)::int t, (select count(*) from f)::int f;
commit;`);
  console.log('Borradas', r);
  process.exit(0);
}

interface Etapa {
  id: string;
  clave: string;
  orden: number;
  card: 'franquiciatario' | 'sucursal';
}
interface Requisito {
  id: string;
  etapa_id: string;
  campo: string | null;
  obligatorio: boolean;
  orden: number;
}
const etapas = await sql<Etapa>(
  `select id, clave, orden, card from crm_etapas where embudo = 'general' and activa and card is not null order by orden`,
);
const requisitos = await sql<Requisito>(
  `select r.id, r.etapa_id, r.campo, r.obligatorio, r.orden from crm_requisitos r where r.activo order by r.orden`,
);
const [responsable] = await sql<{ user_id: string }>(
  // Vendedor de las cards: el head de Ventas (si hay varios, el primero en darse de alta).
  `select c.user_id from crm_membresias c join perfiles p on p.user_id = c.user_id
   where c.area = 'ventas' and c.rol = 'head' and p.activo order by c.creado_en limit 1`,
);
const ya = await sql<{ n: number }>(
  `select (select count(*) from crm_franquiciatarios where nombre like '${PREFIJO}%')::int
        + (select count(*) from crm_tiendas where nombre like '${PREFIJO}%')::int n`,
);
if (ya[0].n)
  throw new Error(`Ya hay ${ya[0].n} cards de práctica; bórralas con --borrar antes de crearlas otra vez.`);

const etapa = (clave: string) => etapas.find((e) => e.clave === clave)!;
const hoy = new Date();
const dia = (n: number) => new Date(hoy.getTime() + n * 864e5).toISOString().slice(0, 10);

// Nombres e historias sintéticos.
const PROSPECTOS: Record<string, [string, string][]> = {
  recepcion: [
    ['Mónica Ibarra', 'Puebla'],
    ['Raúl Mendoza', 'Querétaro'],
  ],
  contacto: [
    ['Teresa Valdés', 'Mérida'],
    ['Octavio Lara', 'León'],
  ],
  revision_contrato: [
    ['Lorena Paredes', 'Monterrey'],
    ['Iván Cortés', 'Toluca'],
  ],
  pld: [
    ['Silvia Quintero', 'Guadalajara'],
    ['Marco Treviño', 'Saltillo'],
  ],
  bienvenida: [
    ['Adriana Solís', 'Cancún'],
    ['Héctor Navarro', 'Morelia'],
  ],
};
const DUENOS: [string, string][] = [
  ['Grupo Altamira', 'Querétaro'],
  ['Inversiones Del Valle', 'Puebla'],
  ['Café del Norte', 'Monterrey'],
];
const SUCURSALES: Record<string, [string, string][]> = {
  locales: [
    ['Querétaro Centro Sur', 'Querétaro'],
    ['León Altacia', 'León'],
  ],
  constancia: [
    ['Puebla Angelópolis', 'Puebla'],
    ['Morelia Altozano', 'Morelia'],
  ],
  transferencia: [
    ['Mérida Altabrisa', 'Mérida'],
    ['Saltillo Galerías', 'Saltillo'],
  ],
  levantamiento: [
    ['Toluca Metepec', 'Toluca'],
    ['Aguascalientes Norte', 'Aguascalientes'],
  ],
  boceto: [
    ['Monterrey Valle', 'Monterrey'],
    ['Chihuahua Distrito', 'Chihuahua'],
  ],
  envio_brasil: [
    ['Cancún Malecón', 'Cancún'],
    ['Veracruz Boca', 'Veracruz'],
  ],
  proyecto_3d: [
    ['Tijuana Río', 'Tijuana'],
    ['Hermosillo Pitic', 'Hermosillo'],
  ],
  proyecto_ejecutivo: [
    ['Culiacán Tres Ríos', 'Culiacán'],
    ['Oaxaca Reforma', 'Oaxaca'],
  ],
  obra: [
    ['San Luis Potosí Lomas', 'San Luis Potosí'],
    ['Durango Paseo', 'Durango'],
  ],
  capacitacion: [
    ['Pachuca Plaza', 'Pachuca'],
    ['Tuxtla Poliforum', 'Tuxtla Gutiérrez'],
  ],
  cof: [
    ['Celaya Galerías', 'Celaya'],
    ['Irapuato Cibeles', 'Irapuato'],
  ],
  contrato: [
    ['Zacatecas Centro', 'Zacatecas'],
    ['Tepic Forum', 'Tepic'],
  ],
};

let jestor = 9900;
const sentencias: string[] = [];
const cumplir = (
  tabla: 'franquiciatario_id' | 'tienda_id',
  card: string,
  r: Requisito,
  estado: string,
  i: number,
) =>
  sentencias.push(
    `insert into public.crm_cumplimientos (requisito_id, ${tabla}, estado, fecha, cumplido_en, validado_en, nota)
     values (${lit(r.id)}, ${lit(card)}, ${lit(estado)}, ${lit(dia(-20 + i))}, now(), ${
       estado === 'validado' ? 'now()' : 'null'
     }, 'Dato de práctica');`,
  );

/** Requisitos a cumplir: todos los de etapas anteriores del mismo tipo (fuera del carril Legal, que va aparte) y,
 *  en la etapa actual, todos si la card está «lista» o todos menos el último si va «en curso». */
function plan(actual: Etapa, lista: boolean) {
  const previas = etapas.filter(
    (e) => e.card === actual.card && e.orden < actual.orden && !['cof', 'contrato'].includes(e.clave),
  );
  const ids = new Set(previas.map((e) => e.id));
  const anteriores = requisitos.filter((r) => ids.has(r.etapa_id));
  const propios = requisitos.filter((r) => r.etapa_id === actual.id && r.obligatorio);
  return { anteriores, propios: lista ? propios : propios.slice(0, -1) };
}

const VALOR_CAMPO: Record<string, (i: number) => unknown> = {
  ciudad_interes: () => null, // se pone con la ciudad de la card
  origen: () => 'Sitio web',
  territorio: () => 'disponible',
  responsable_id: () => responsable?.user_id ?? null,
  fecha_limite_apertura: (i) => dia(180 + i),
  fecha_estimada_apertura: (i) => dia(150 + i),
  numero_tienda_jestor: () => ++jestor,
  fecha_apertura: (i) => dia(-3 - i),
  fecha_confirmada_apertura: (i) => dia(30 + i),
};

// Franquiciatarios en las etapas de Ventas.
let n = 0;
for (const [clave, lista] of Object.entries(PROSPECTOS)) {
  const e = etapa(clave);
  for (const [k, [nombre, ciudad]] of lista.entries()) {
    const id = randomUUID();
    const listo = k === 0;
    const { anteriores, propios } = plan(e, listo);
    const campos: Record<string, unknown> = {
      correo: `practica${++n}@example.com`,
      telefono: `55000000${String(n).padStart(2, '0')}`,
      ciudad_interes: ciudad,
    };
    for (const r of [...anteriores, ...propios])
      if (r.campo && r.campo !== 'contacto' && r.campo !== 'ciudad_interes')
        campos[r.campo] = VALOR_CAMPO[r.campo]?.(n);
    const cols = Object.keys(campos);
    sentencias.push(
      `insert into public.crm_franquiciatarios (id, nombre, tipo_persona, embudo, etapa_id, muestra, ${cols.join(', ')})
       values (${lit(id)}, ${lit(PREFIJO + nombre)}, 'fisica', 'general', ${lit(e.id)}, true, ${cols
         .map((c) => lit(campos[c]))
         .join(', ')});`,
    );
    for (const r of [...anteriores, ...propios].filter((r) => !r.campo))
      cumplir('franquiciatario_id', id, r, 'validado', n);
  }
}

// Dueños formalizados de las sucursales de práctica.
const formalizado = etapa('formalizado');
const duenos = DUENOS.map(([nombre, ciudad]) => {
  const id = randomUUID();
  ++n;
  sentencias.push(
    `insert into public.crm_franquiciatarios (id, nombre, tipo_persona, embudo, etapa_id, muestra, correo, telefono,
       ciudad_interes, origen, territorio, responsable_id, formalizado_en)
     values (${lit(id)}, ${lit(PREFIJO + nombre)}, 'moral', 'general', ${lit(formalizado.id)}, true,
       ${lit(`practica${n}@example.com`)}, ${lit(`55000000${String(n).padStart(2, '0')}`)}, ${lit(ciudad)},
       'Referido', 'disponible', ${lit(responsable?.user_id ?? null)}, now() - interval '30 days');`,
  );
  return { id, nombre };
});

// Sucursales en las etapas de Ventas (locales), Legal y Proyectos.
let s = 0;
for (const [clave, lista] of Object.entries(SUCURSALES)) {
  const e = etapa(clave);
  for (const [k, [nombre, ciudad]] of lista.entries()) {
    const id = randomUUID();
    const dueno = duenos[s++ % duenos.length];
    const listo = k === 0;
    const { anteriores, propios } = plan(e, listo);
    const campos: Record<string, unknown> = {};
    for (const r of [...anteriores, ...propios]) if (r.campo) campos[r.campo] = VALOR_CAMPO[r.campo]?.(s);
    const cols = Object.keys(campos);
    sentencias.push(
      `insert into public.crm_tiendas (id, nombre, embudo, etapa_id, muestra, franquiciatario_id, franquiciatario,
         tipo_franquicia, ciudad${cols.map((c) => `, ${c}`).join('')})
       values (${lit(id)}, ${lit(PREFIJO + nombre)}, 'general', ${lit(e.id)}, true, ${lit(dueno.id)},
         ${lit(dueno.nombre)}, 'franquiciatario', ${lit(ciudad)}${cols.map((c) => `, ${lit(campos[c])}`).join('')});`,
    );
    for (const r of [...anteriores, ...propios].filter((r) => !r.campo))
      cumplir('tienda_id', id, r, 'validado', s);
  }
}

const verificacion = `select e.clave, c.tipo_card, count(*)::int cards,
  count(*) filter (where c.total > 0 and c.listos = c.total)::int listas,
  count(*) filter (where c.listos < c.total)::int en_curso
from crm_v_candados c join crm_etapas e on e.id = c.etapa_id
where c.card_id in (select id from crm_franquiciatarios where nombre like '${PREFIJO}%'
                    union all select id from crm_tiendas where nombre like '${PREFIJO}%')
group by e.clave, e.orden, c.tipo_card order by e.orden`;

const aplicar = process.argv.includes('--aplicar');
const res = await sql(`begin;
${sentencias.join('\n')}
${verificacion};
${aplicar ? 'commit;' : 'rollback;'}`);
console.table(res);
console.log(
  aplicar ? 'APLICADO' : 'ENSAYO (rollback, no quedó nada)',
  `· ${sentencias.length} sentencias · vendedor: ${responsable ? 'asignado' : 'sin vendedor'}`,
);
