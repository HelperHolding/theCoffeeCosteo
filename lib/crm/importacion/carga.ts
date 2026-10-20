// Carga idempotente al CRM en una sola transacción. Corre con DATABASE_URL (dueño de las tablas, sin RLS).
import type { Ejecutor } from '../../../scripts/db/ejecutor';
import {
  huella,
  mapearActividad,
  mapearContacto,
  mapearNota,
  mapearProspecto,
  mapearTienda,
  type Contexto,
  type Relacion,
  type Zoho,
} from './mapeo';

export interface Transicion {
  de: string | null;
  a: string | null;
  fecha: string;
}
export interface Lote {
  runId: string;
  tipo: 'piloto' | 'completa';
  snapshot: string;
  orgId: string | null;
  responsableId: string;
  tiendas: Zoho[];
  prospectos: Zoho[];
  contactos: Zoho[];
  actividades: Zoho[];
  notas: Zoho[];
  /** Estados de Leads en uso, en el orden de Zoho (leads tal cual). */
  estadosProspectos: string[];
  /** Cambios de etapa por tienda (id de Zoho), del timeline. */
  transiciones: Map<string, Transicion[]>;
}
export type Conteo = {
  zoho: number;
  nuevos: number;
  actualizados: number;
  sin_cambio: number;
  omitidos: number;
};
const conteo = (zoho: number): Conteo => ({ zoho, nuevos: 0, actualizados: 0, sin_cambio: 0, omitidos: 0 });

const id = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Upsert por zoho_record_id: inserta, o actualiza solo si cambió la huella. Devuelve zoho id → id del CRM. */
async function upsert(
  db: Ejecutor,
  tabla: string,
  filas: Record<string, unknown>[],
  runId: string,
  c: Conteo,
  soloAlInsertar: string[] = [],
): Promise<Map<string, string>> {
  for (const f of filas) {
    // La huella solo cubre lo que viene de Zoho: los campos que se fijan al insertar (p. ej. la posición
    // en el Kanban, que depende del lote) no deben hacer que un registro sin cambios se reescriba.
    const deZoho = Object.fromEntries(Object.entries(f).filter(([k]) => !soloAlInsertar.includes(k)));
    const fila = {
      ...f,
      import_hash: huella(deZoho),
      imported_at: new Date().toISOString(),
      import_run_id: runId,
    };
    const cols = Object.keys(fila);
    const actualizar = cols.filter((k) => k !== 'zoho_record_id' && !soloAlInsertar.includes(k));
    const r = await db.query<{ insertado: boolean }>(
      `insert into public.${id(tabla)} (${cols.map(id).join(', ')})
       values (${cols.map((_, i) => `$${i + 1}`).join(', ')})
       on conflict (zoho_record_id) do update set ${actualizar.map((k) => `${id(k)} = excluded.${id(k)}`).join(', ')}
       where ${id(tabla)}.import_hash is distinct from excluded.import_hash
       returning (xmax = 0) as insertado`,
      cols.map((k) => fila[k as keyof typeof fila]),
    );
    if (!r.rows.length) c.sin_cambio++;
    else if (r.rows[0].insertado) c.nuevos++;
    else c.actualizados++;
  }
  const ids = filas.map((f) => String(f.zoho_record_id));
  const m = await db.query<{ id: string; zoho_record_id: string }>(
    `select id, zoho_record_id from public.${id(tabla)} where zoho_record_id = any($1::text[])`,
    [ids],
  );
  return new Map(m.rows.map((x) => [x.zoho_record_id, x.id]));
}

export async function cargar(db: Ejecutor, lote: Lote) {
  const conteos = {
    tiendas: conteo(lote.tiendas.length),
    prospectos: conteo(lote.prospectos.length),
    contactos: conteo(lote.contactos.length),
    actividades: conteo(lote.actividades.length),
    notas: conteo(lote.notas.length),
  };
  const extras = { ligas_tienda_contacto: 0, etiquetas: 0, checklists: 0, historial_zoho: 0, revisar: 0 };
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'importacion', true)`);
    await db.query(`insert into zoho_staging.importaciones (id, tipo, snapshot) values ($1, $2, $3)`, [
      lote.runId,
      lote.tipo,
      lote.snapshot,
    ]);
    for (const [modulo, filas] of [
      ['Franquicias', lote.tiendas],
      ['Leads', lote.prospectos],
      ['Contacts', lote.contactos],
      ['Tasks', lote.actividades],
      ['Notes', lote.notas],
    ] as const) {
      for (const r of filas)
        await db.query(
          `insert into zoho_staging.registros (import_run_id, modulo, zoho_id, payload, hash) values ($1, $2, $3, $4, $5)`,
          [lote.runId, modulo, String(r.id), JSON.stringify(r), huella(r)],
        );
    }

    // Embudo de prospectos: los estados en uso, en el orden de Zoho.
    for (const [i, nombre] of lote.estadosProspectos.entries())
      await db.query(
        `insert into public.crm_etapas (embudo, nombre, orden, zoho_valor) values ('prospectos', $1, $2, $1)
         on conflict (embudo, nombre) do update set orden = excluded.orden`,
        [nombre, i + 1],
      );
    const etapas = await db.query<{ id: string; embudo: string; zoho_valor: string }>(
      `select id, embudo, zoho_valor from public.crm_etapas where zoho_valor is not null`,
    );
    const ctx: Contexto = {
      orgId: lote.orgId,
      responsableId: lote.responsableId,
      etapasTiendas: new Map(
        etapas.rows.filter((e) => e.embudo === 'tiendas').map((e) => [e.zoho_valor, e.id]),
      ),
      etapasProspectos: new Map(
        etapas.rows.filter((e) => e.embudo === 'prospectos').map((e) => [e.zoho_valor, e.id]),
      ),
    };

    // Tiendas: posición inicial por etapa según la última modificación en Zoho (solo al insertar).
    const mapeadas = lote.tiendas.map((r) => ({ r, m: mapearTienda(r, ctx) }));
    const porEtapa = new Map<string, number>();
    const ordenadas = [...mapeadas].sort((a, b) =>
      String(b.r.Modified_Time ?? '').localeCompare(String(a.r.Modified_Time ?? '')),
    );
    for (const x of ordenadas) {
      const e = String(x.m.fila.etapa_id);
      const n = (porEtapa.get(e) ?? 0) + 1;
      porEtapa.set(e, n);
      x.m.fila.posicion = n * 1024;
      if ((x.m.fila.revisar as string[]).length) extras.revisar++;
    }
    const tiendas = await upsert(
      db,
      'crm_tiendas',
      mapeadas.map((x) => x.m.fila),
      lote.runId,
      conteos.tiendas,
      ['posicion'],
    );

    const prospectosM = lote.prospectos.map((r) => mapearProspecto(r, ctx));
    const prospectos = await upsert(
      db,
      'crm_prospectos',
      prospectosM.map((p) => p.fila),
      lote.runId,
      conteos.prospectos,
    );
    const contactosM = lote.contactos.map((r) => mapearContacto(r, ctx));
    const contactos = await upsert(
      db,
      'crm_contactos',
      contactosM.map((c) => c.fila),
      lote.runId,
      conteos.contactos,
    );

    // Tienda ↔ contacto: compartían la misma Cuenta en Zoho (Cuentas no se importa).
    const cuentaDeTienda = new Map(
      lote.tiendas.map((r) => [String(r.id), (r.Cuenta as { id?: string } | null)?.id]),
    );
    for (const [i, c] of contactosM.entries()) {
      if (!c.cuentaZoho) continue;
      for (const [zohoTienda, cuenta] of cuentaDeTienda) {
        if (cuenta !== c.cuentaZoho) continue;
        const r = await db.query(
          `insert into public.crm_tienda_contactos (tienda_id, contacto_id, origen) values ($1, $2, 'importacion')
           on conflict do nothing returning tienda_id`,
          [tiendas.get(zohoTienda), contactos.get(String(lote.contactos[i].id))],
        );
        extras.ligas_tienda_contacto += r.rows.length;
      }
    }

    // Etiquetas que siguen siendo etiquetas (las convertidas a campos ya no se crean).
    const etiquetar = async (
      nombre: string,
      columna: 'tienda_id' | 'prospecto_id',
      registro: string | undefined,
    ) => {
      if (!registro) return;
      const e = await db.query<{ id: string }>(
        `insert into public.crm_etiquetas (nombre) values ($1) on conflict (nombre) do update set nombre = excluded.nombre returning id`,
        [nombre],
      );
      const r = await db.query(
        `insert into public.crm_etiquetas_registro (etiqueta_id, ${columna}) values ($1, $2)
         on conflict (etiqueta_id, ${columna}) where ${columna} is not null do nothing returning id`,
        [e.rows[0].id, registro],
      );
      extras.etiquetas += r.rows.length;
    };
    for (const x of mapeadas)
      for (const t of x.m.etiquetas) await etiquetar(t, 'tienda_id', tiendas.get(String(x.r.id)));
    for (const [i, p] of prospectosM.entries())
      for (const t of p.etiquetas)
        await etiquetar(t, 'prospecto_id', prospectos.get(String(lote.prospectos[i].id)));

    // Checklist "Apertura" una sola vez por tienda (no pisa lo que el equipo marque después).
    for (const x of mapeadas) {
      const tienda = tiendas.get(String(x.r.id));
      const ya = await db.query(
        `select 1 from public.crm_checklists where tienda_id = $1 and nombre = 'Apertura'`,
        [tienda],
      );
      if (ya.rows.length) continue;
      const c = await db.query<{ id: string }>(
        `insert into public.crm_checklists (tienda_id, nombre, orden) values ($1, 'Apertura', 1024) returning id`,
        [tienda],
      );
      for (const [i, item] of x.m.checklist.entries())
        await db.query(
          `insert into public.crm_checklist_items (checklist_id, texto, hecho, url, orden, completado_en)
           values ($1, $2, $3, $4, $5, case when $3 then now() end)`,
          [c.rows[0].id, item.texto, item.hecho, item.url, (i + 1) * 1024],
        );
      extras.checklists++;
    }

    const ids: Record<string, Map<string, string>> = {
      Franquicias: tiendas,
      Leads: prospectos,
      Contacts: contactos,
    };
    const columna = { Franquicias: 'tienda_id', Leads: 'prospecto_id', Contacts: 'contacto_id' } as const;
    const resolver = (modulo: string, zohoId: string): Relacion | null => {
      if (modulo in columna) {
        const crm = ids[modulo].get(zohoId);
        return crm ? { [columna[modulo as keyof typeof columna]]: crm } : null;
      }
      if (modulo === 'Tasks') {
        const crm = ids.Tasks?.get(zohoId);
        return crm ? { actividad_id: crm } : null;
      }
      // Cuentas y módulos fuera de alcance: no se importa el registro relacionado.
      if (modulo === 'Accounts' || modulo === 'Prospectos_Expansion' || modulo === 'Deals') return null;
      return {};
    };
    const actividadesM = lote.actividades.map((r) => mapearActividad(r, ctx, resolver));
    conteos.actividades.omitidos = actividadesM.filter((a) => !a).length;
    ids.Tasks = await upsert(
      db,
      'crm_actividades',
      actividadesM.filter((a) => a !== null).map((a) => a.fila),
      lote.runId,
      conteos.actividades,
    );
    const notasM = lote.notas.map((r) => mapearNota(r, ctx, resolver));
    conteos.notas.omitidos = notasM.filter((n) => !n).length;
    await upsert(
      db,
      'crm_notas',
      notasM.filter((n) => n !== null).map((n) => n.fila),
      lote.runId,
      conteos.notas,
    );

    // La importación deja una sola entrada por registro ("Importado de Zoho"): las altas de sus notas,
    // ítems de checklist y archivos son ruido que taparía los cambios reales en el historial.
    await db.query(
      `delete from public.crm_historial where origen = 'importacion' and accion in ('nota', 'checklist', 'archivo')`,
    );

    // Historial de etapas de Zoho: se reemplaza completo en cada corrida (no tiene id propio).
    const idsTiendas = [...tiendas.values()];
    await db.query(`delete from public.crm_historial where origen = 'zoho' and tienda_id = any($1::uuid[])`, [
      idsTiendas,
    ]);
    for (const [zohoId, lista] of lote.transiciones) {
      const tienda = tiendas.get(zohoId);
      if (!tienda) continue;
      for (const t of lista) {
        await db.query(
          `insert into public.crm_historial (entidad, entidad_id, tienda_id, accion, resumen, origen, fecha)
           values ('crm_tiendas', $1, $1, 'etapa', $2, 'zoho', $3)`,
          [tienda, `Etapa: ${t.de ?? 'sin etapa'} → ${t.a ?? 'sin etapa'}`, t.fecha],
        );
        extras.historial_zoho++;
      }
    }

    await db.query(
      `update zoho_staging.importaciones set estado = 'completa', terminada_en = now(), conteos = $2 where id = $1`,
      [lote.runId, JSON.stringify({ ...conteos, ...extras })],
    );
    await db.query('commit');
    return { conteos, extras };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/** Movimientos hechos por usuarios en el CRM (el historial los marca con origen 'crm'). Si hay, ya pasó el corte. */
export async function cambiosDelCrm(db: Ejecutor): Promise<number> {
  const r = await db.query<{ n: number }>(
    `select count(*)::int n from public.crm_historial where origen = 'crm'`,
  );
  return r.rows[0].n;
}

/**
 * Revierte una corrida antes del corte: borra lo que esa corrida creó o actualizó por última vez.
 * Se niega si ya hay trabajo de usuarios en el CRM o archivos ligados (sus objetos viven en Storage).
 */
export async function revertir(db: Ejecutor, runId: string) {
  await db.query('begin');
  try {
    const t = await db.query<{ id: string }>(`select id from public.crm_tiendas where import_run_id = $1`, [
      runId,
    ]);
    const p = await db.query<{ id: string }>(
      `select id from public.crm_prospectos where import_run_id = $1`,
      [runId],
    );
    const c = await db.query<{ id: string }>(`select id from public.crm_contactos where import_run_id = $1`, [
      runId,
    ]);
    const ti = t.rows.map((x) => x.id);
    const pi = p.rows.map((x) => x.id);
    const ci = c.rows.map((x) => x.id);
    // Lo que cuelga de los registros revertidos también se va, aunque venga de una corrida anterior.
    const act = await db.query<{ id: string }>(
      `select id from public.crm_actividades
       where import_run_id = $1 or tienda_id = any($2::uuid[]) or prospecto_id = any($3::uuid[]) or contacto_id = any($4::uuid[])`,
      [runId, ti, pi, ci],
    );
    const ai = act.rows.map((x) => x.id);
    const archivos = await db.query<{ n: number }>(
      `select count(*)::int n from public.crm_archivos a
       where a.tienda_id = any($1::uuid[]) or a.prospecto_id = any($2::uuid[]) or a.contacto_id = any($3::uuid[])
          or a.nota_id in (select id from public.crm_notas where import_run_id = $4 or tienda_id = any($1::uuid[])
            or prospecto_id = any($2::uuid[]) or contacto_id = any($3::uuid[]) or actividad_id = any($5::uuid[]))`,
      [ti, pi, ci, runId, ai],
    );
    if (archivos.rows[0].n)
      throw new Error(
        `No se revierte: hay ${archivos.rows[0].n} archivos ligados a esos registros (con su objeto en Storage).`,
      );
    const cambios = await cambiosDelCrm(db);
    if (cambios)
      throw new Error(`No se revierte: el CRM ya tiene ${cambios} cambios de usuarios que se perderían.`);
    await db.query(
      `delete from public.crm_notas where import_run_id = $1 or tienda_id = any($2::uuid[])
       or prospecto_id = any($3::uuid[]) or contacto_id = any($4::uuid[]) or actividad_id = any($5::uuid[])`,
      [runId, ti, pi, ci, ai],
    );
    await db.query(`delete from public.crm_actividades where id = any($1::uuid[])`, [ai]);
    await db.query(
      `delete from public.crm_etiquetas_registro where tienda_id = any($1::uuid[]) or prospecto_id = any($2::uuid[])`,
      [ti, pi],
    );
    await db.query(
      `delete from public.crm_tienda_contactos where tienda_id = any($1::uuid[]) or contacto_id = any($2::uuid[])`,
      [ti, ci],
    );
    await db.query(`delete from public.crm_checklists where tienda_id = any($1::uuid[])`, [ti]);
    await db.query(
      `delete from public.crm_historial where tienda_id = any($1::uuid[]) or entidad_id = any($2::uuid[])`,
      [ti, [...pi, ...ci]],
    );
    await db.query(`delete from public.crm_tiendas where import_run_id = $1`, [runId]);
    await db.query(`delete from public.crm_prospectos where import_run_id = $1`, [runId]);
    await db.query(`delete from public.crm_contactos where import_run_id = $1`, [runId]);
    await db.query(`update zoho_staging.importaciones set estado = 'revertida' where id = $1`, [runId]);
    await db.query('commit');
    return { tiendas: ti.length, prospectos: pi.length, contactos: ci.length };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
