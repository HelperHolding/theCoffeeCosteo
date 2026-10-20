import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import pg from 'pg';
import { ClienteZoho, ErrorZoho, leerEnvLocal, type Env } from './cliente';
import { EXCLUIDOS, leerRegistros } from './registros';
import { cargar, revertir, type Lote, type Transicion } from '../../lib/crm/importacion/carga';
import {
  etiquetasDe,
  mapearContacto,
  mapearProspecto,
  mapearTienda,
  type Zoho,
} from '../../lib/crm/importacion/mapeo';

/**
 * Importación Zoho → CRM. Zoho solo se lee (ClienteZoho bloquea toda escritura).
 *
 *   npx tsx scripts/zoho/importar.ts ensayo <salida.json> [--tiendas 10]   lee y transforma en memoria; no escribe
 *   npx tsx scripts/zoho/importar.ts piloto [--tiendas 10]                 carga el piloto en la base de DATABASE_URL
 *   npx tsx scripts/zoho/importar.ts completa                              carga todo
 *   npx tsx scripts/zoho/importar.ts revertir <import_run_id>              deshace una corrida (antes del corte)
 */
const RESPONSABLE = 'cvalencia@mx.thecoffee.jp';
type Registro = Record<string, unknown>;

async function campos(z: ClienteZoho, modulo: string) {
  const r = await z.get<{
    fields?: { api_name: string; pick_list_values?: { display_value: string; sequence_number: number }[] }[];
  }>(`/crm/v8/settings/fields?module=${modulo}`);
  return (r?.fields ?? []).filter((c) => !EXCLUIDOS.has(c.api_name));
}

async function transiciones(z: ClienteZoho, tiendaId: string): Promise<Transicion[]> {
  const lista: Transicion[] = [];
  let token: string | undefined;
  for (;;) {
    const r = await z.get<{
      __timeline?: {
        audited_time?: string;
        record?: { module?: { api_name?: string } };
        field_history?: { api_name: string; _value?: { new?: unknown; old?: unknown } }[] | null;
      }[];
      info?: { more_records?: boolean; next_page_token?: string };
    }>(
      token
        ? `/crm/v8/Franquicias/${tiendaId}/__timeline?page_token=${encodeURIComponent(token)}`
        : `/crm/v8/Franquicias/${tiendaId}/__timeline?per_page=200`,
    );
    for (const e of r?.__timeline ?? []) {
      if (e.record?.module?.api_name && e.record.module.api_name !== 'Franquicias') continue;
      for (const h of e.field_history ?? [])
        if (h.api_name === 'Status' && e.audited_time)
          lista.push({
            de: h._value?.old == null ? null : String(h._value.old),
            a: h._value?.new == null ? null : String(h._value.new),
            fecha: e.audited_time,
          });
    }
    if (!r?.info?.more_records) return lista.sort((a, b) => a.fecha.localeCompare(b.fecha));
    token = r.info.next_page_token;
  }
}

const idDe = (v: unknown) =>
  v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null;

/** Extrae de Zoho y arma el lote. `limite` = número de tiendas del piloto (null = todo). */
async function extraer(z: ClienteZoho, env: Env, limite: number | null) {
  const snapshot = new Date().toISOString();
  const [cTiendas, cLeads, cContactos, cTareas] = await Promise.all(
    ['Franquicias', 'Leads', 'Contacts', 'Tasks'].map((m) => campos(z, m)),
  );
  // Integridad: el módulo debe traer tantos registros como cuenta COQL y cada registro todos sus campos.
  // Si no, se detiene: nunca se carga una extracción parcial.
  const leer = async (m: string, c: { api_name: string }[]) => {
    const campos = c.map((x) => x.api_name);
    const inaccesibles = new Set<string>();
    const filas = await leerRegistros(z, m, campos, inaccesibles);
    const total = Number(
      ((await z.coql<{ 'COUNT(id)': number }>(`select COUNT(id) from ${m} where id is not null`))?.data ??
        [])[0]?.['COUNT(id)'] ?? -1,
    );
    const esperados = campos.filter((k) => !inaccesibles.has(k));
    const incompletos = filas.filter((f) =>
      esperados.some((k) => !Object.prototype.hasOwnProperty.call(f, k)),
    ).length;
    if (filas.length !== total || incompletos > 0)
      throw new Error(
        `Extracción incompleta de ${m}: ${filas.length} de ${total} registros, ${incompletos} sin todos sus campos. Reintenta.`,
      );
    return filas;
  };
  const todas = {
    tiendas: await leer('Franquicias', cTiendas),
    prospectos: await leer('Leads', cLeads),
    contactos: await leer('Contacts', cContactos),
    actividades: await leer('Tasks', cTareas),
    // Notas por Records API: trae Parent_Id con su módulo (COQL no devuelve $se_module en un SELECT simple).
    notas: await leerRegistros(
      z,
      'Notes',
      ['Note_Title', 'Note_Content', 'Parent_Id', 'Created_Time', 'Modified_Time'],
      new Set(),
    ),
  };
  for (const n of todas.notas) {
    const p = n.Parent_Id as { module?: { api_name?: string } } | null;
    if (!n.$se_module && p?.module?.api_name) n.$se_module = p.module.api_name;
  }

  let tiendas = todas.tiendas;
  let prospectos = todas.prospectos;
  if (limite !== null) {
    // Piloto variado: en rondas, una tienda por etapa (empezando por las etapas más pobladas),
    // eligiendo la que más notas, tareas y archivos tiene para probar todo el expediente.
    const peso = new Map<string, number>();
    const sumar = (id: string | null, n = 1) => id && peso.set(id, (peso.get(id) ?? 0) + n);
    for (const n of todas.notas) sumar(idDe(n.Parent_Id));
    for (const a of todas.actividades) if (a.$se_module === 'Franquicias') sumar(idDe(a.What_Id), 3);
    for (const t of todas.tiendas)
      for (const k of ['Proyecto_3D', 'Proyecto_Ejecutivo'])
        if (Array.isArray(t[k]) && (t[k] as unknown[]).length) sumar(String(t.id), 5);
    const grupos = new Map<string, Registro[]>();
    for (const t of todas.tiendas) grupos.set(String(t.Status), [...(grupos.get(String(t.Status)) ?? []), t]);
    const porEtapa = [...grupos.values()].sort((a, b) => b.length - a.length);
    for (const l of porEtapa) l.sort((a, b) => (peso.get(String(b.id)) ?? 0) - (peso.get(String(a.id)) ?? 0));
    const elegidas: Registro[] = [];
    while (elegidas.length < limite && porEtapa.some((l) => l.length))
      for (const l of porEtapa) if (l.length && elegidas.length < limite) elegidas.push(l.shift()!);
    tiendas = elegidas;
    // Prospectos del piloto: los que tienen notas o tareas, completando con estados distintos.
    const conSeguimiento = new Set([
      ...todas.notas.filter((n) => n.$se_module === 'Leads').map((n) => idDe(n.Parent_Id)),
      ...todas.actividades.filter((a) => a.$se_module === 'Leads').map((a) => idDe(a.What_Id)),
    ]);
    const vistos = new Set<string>();
    prospectos = [
      ...todas.prospectos.filter((p) => conSeguimiento.has(String(p.id))),
      ...todas.prospectos.filter((p) => {
        const e = String(p.Lead_Status ?? 'sin');
        if (vistos.has(e)) return false;
        vistos.add(e);
        return true;
      }),
    ]
      .filter((p, i, a) => a.findIndex((x) => x.id === p.id) === i)
      .slice(0, limite);
  }
  const idsT = new Set(tiendas.map((t) => String(t.id)));
  const idsP = new Set(prospectos.map((p) => String(p.id)));
  const cuentas = new Set(tiendas.map((t) => idDe(t.Cuenta)).filter(Boolean));
  const contactos =
    limite === null ? todas.contactos : todas.contactos.filter((c) => cuentas.has(idDe(c.Account_Name)));
  const idsC = new Set(contactos.map((c) => String(c.id)));
  const pertenece = (modulo: unknown, id: string | null) =>
    !!id &&
    ((modulo === 'Franquicias' && idsT.has(id)) ||
      (modulo === 'Leads' && idsP.has(id)) ||
      (modulo === 'Contacts' && idsC.has(id)));
  const actividades =
    limite === null
      ? todas.actividades
      : todas.actividades.filter((a) => pertenece(a.$se_module, idDe(a.What_Id)));
  const idsA = new Set(actividades.map((a) => String(a.id)));
  const notas =
    limite === null
      ? todas.notas
      : todas.notas.filter(
          (n) =>
            pertenece(n.$se_module, idDe(n.Parent_Id)) ||
            (n.$se_module === 'Tasks' && idsA.has(String(idDe(n.Parent_Id)))),
        );

  const usados = new Set(
    todas.prospectos
      .map((p) => p.Lead_Status)
      .filter(Boolean)
      .map(String),
  );
  const estadosProspectos = (cLeads.find((c) => c.api_name === 'Lead_Status')?.pick_list_values ?? [])
    .sort((a, b) => a.sequence_number - b.sequence_number)
    .map((v) => v.display_value)
    .filter((v) => usados.has(v));

  const tr = new Map<string, Transicion[]>();
  for (const t of tiendas) tr.set(String(t.id), await transiciones(z, String(t.id)));

  return {
    snapshot,
    tiendas,
    prospectos,
    contactos,
    actividades,
    notas,
    estadosProspectos,
    transiciones: tr,
    orgId: env.get('ZOHO_ORG_ID') ?? null,
  };
}

/** Reporte del ensayo: solo agregados y nombres de tienda (sin datos de personas). */
function reporte(x: Awaited<ReturnType<typeof extraer>>) {
  const ctx = {
    orgId: x.orgId,
    responsableId: '(responsable)',
    etapasTiendas: new Map(
      [
        'Firma de contrato',
        'En búsqueda de local',
        'Local aprobado por México',
        'Local aprobado por Brasil',
        'Arquitecta Asignada',
        'Proyecto 3D Entregado',
        'Proyecto Ejecutivo Entregado',
        'En remodelación',
        'Entrega de local',
        'Agenda de capacitación',
        'Operando',
        'Standby',
        'Modificaciones pendientes',
        'Cancelada',
        'Cerrada',
      ].map((e) => [e, e]),
    ),
    etapasProspectos: new Map(x.estadosProspectos.map((e) => [e, e])),
  };
  const cuenta = <T>(l: T[], f: (v: T) => string) =>
    l.reduce<Record<string, number>>((a, v) => ((a[f(v)] = (a[f(v)] ?? 0) + 1), a), {});
  const tiendas = x.tiendas.map((r) => ({ r, m: mapearTienda(r, ctx) }));
  const contactos = x.contactos.map((r) => mapearContacto(r, ctx));
  const fuera = (m: unknown) => m === 'Accounts' || m === 'Prospectos_Expansion' || m === 'Deals';
  return {
    snapshot: x.snapshot,
    totales: {
      tiendas: x.tiendas.length,
      prospectos: x.prospectos.length,
      contactos: x.contactos.length,
      actividades: x.actividades.length,
      notas: x.notas.length,
      cambios_de_etapa_zoho: [...x.transiciones.values()].reduce((n, l) => n + l.length, 0),
    },
    tiendas: tiendas.map(({ r, m }) => ({
      nombre: m.fila.nombre,
      etapa: m.etapaZoho,
      tipo: m.fila.tipo_franquicia,
      revisar: m.fila.revisar,
      etiquetas: m.etiquetas,
      checklist_hechos: m.checklist.filter((i) => i.hecho).length,
      archivos_en_campos: ['Proyecto_3D', 'Proyecto_Ejecutivo'].reduce(
        (n, k) => n + (Array.isArray(r[k]) ? (r[k] as unknown[]).length : 0),
        0,
      ),
      notas: x.notas.filter((n) => idDe(n.Parent_Id) === String(r.id)).length,
      actividades: x.actividades.filter((a) => idDe(a.What_Id) === String(r.id)).length,
      cambios_de_etapa: x.transiciones.get(String(r.id))?.length ?? 0,
    })),
    tiendas_con_etapa_desconocida: tiendas.filter(({ m }) => (m.fila.revisar as string[]).includes('etapa'))
      .length,
    prospectos_por_estado: cuenta(
      x.prospectos.map((r) => mapearProspecto(r, ctx)),
      (p) => p.estadoZoho ?? '(sin estado)',
    ),
    etiquetas_de_prospectos: cuenta(x.prospectos.flatMap(etiquetasDe), (t) => t),
    contactos_con_varias_plazas: contactos.filter((c) => c.plazas > 1).length,
    actividades_por_modulo: cuenta(x.actividades, (a) => String(a.$se_module ?? '(sin relación)')),
    actividades_omitidas_por_cuentas: x.actividades.filter((a) => fuera(a.$se_module)).length,
    notas_por_modulo: cuenta(x.notas, (n) => String(n.$se_module ?? '(sin módulo)')),
    notas_omitidas_fuera_de_alcance: x.notas.filter((n) => fuera(n.$se_module)).length,
    estados_prospectos: x.estadosProspectos,
  };
}

async function base(env: Env) {
  const url = env.get('DATABASE_URL');
  if (!url) throw new Error('Falta DATABASE_URL en .env.local');
  const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();
  return c;
}

async function main() {
  const [comando, arg] = process.argv.slice(2);
  const i = process.argv.indexOf('--tiendas');
  const limite = i > 0 ? Number(process.argv[i + 1]) : 10;
  const env = await leerEnvLocal();
  if (comando === 'revertir') {
    if (!arg) throw new Error('Indica el import_run_id a revertir');
    const db = await base(env);
    try {
      console.log('Revertido:', await revertir(db, arg));
    } finally {
      await db.end();
    }
    return;
  }
  const z = new ClienteZoho(env);
  if (comando === 'ensayo') {
    if (!arg) throw new Error('Indica el archivo de salida del ensayo');
    const x = await extraer(z, env, limite);
    await writeFile(arg, JSON.stringify(reporte(x), null, 2));
    console.log(`Ensayo listo (${z.llamadas} llamadas a Zoho, nada escrito en la base): ${arg}`);
    return;
  }
  if (comando !== 'piloto' && comando !== 'completa')
    throw new Error('Comando: ensayo | piloto | completa | revertir');
  const db = await base(env);
  try {
    const u = await db.query<{ id: string }>(
      `select u.id from auth.users u join public.perfiles p on p.user_id = u.id where lower(u.email) = $1 and p.activo`,
      [RESPONSABLE],
    );
    if (!u.rows[0]) throw new Error('No existe el perfil activo del responsable');
    const x = await extraer(z, env, comando === 'piloto' ? limite : null);
    const lote: Lote = { runId: randomUUID(), tipo: comando, responsableId: u.rows[0].id, ...x };
    const r = await cargar(db, lote);
    console.log(
      JSON.stringify(
        { import_run_id: lote.runId, snapshot: x.snapshot, llamadas_zoho: z.llamadas, ...r },
        null,
        2,
      ),
    );
  } finally {
    await db.end();
  }
}

main().catch((e: Error) => {
  console.error(e instanceof ErrorZoho ? `${e.status} ${e.code} ${e.ruta}` : e.message);
  process.exit(1);
});
