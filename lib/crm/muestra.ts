import type { Ejecutor } from '../../scripts/db/ejecutor';

/**
 * Datos de muestra del CRM Unificado (doc 40 §8, decisiones Q3/Q4 del 2026-11-03).
 * - mapear: lleva prospectos y tiendas de Zoho al Pipeline general solo para visualizar; guarda la etapa
 *   original (etapa_origen_id) y marca muestra = true. Idempotente.
 * - revertirMapeo: regresa todo a los embudos de Zoho.
 * - limpiar: borra los datos de Zoho para arrancar de cero (con respaldo previo); conserva usuarios,
 *   áreas, membresías, etapas, requisitos, festivos y TODA la bitácora (inalterable).
 * Todo corre en una transacción y con origen 'sistema' en la bitácora.
 */

/** Estado de Zoho (embudo prospectos) → etapa del Pipeline general. Sin estado = 'recepcion'. */
export const MAPA_PROSPECTOS: Record<string, string> = {
  'Interes en Zona Bloqueada': 'recepcion',
  'Correo Inicial Enviado - Agenda tu Cita': 'contacto',
  Contactado: 'contacto',
  'Con Interés': 'contacto',
  'Attempted to Contact': 'contacto',
  'Sin Respuesta - No se pudo contactar': 'contacto',
  'Psible Cierre': 'contacto',
  'Apartado Pagado': 'revision_contrato',
  'Fee Inicial Liquidado': 'pld',
  'Nuevo Franquiciatario': 'bienvenida',
  'Reanudar negociación en un Futuro': 'standby',
  'Lead Pérdido / Sin Interés': 'descartada',
  'Sin Interés': 'descartada',
  'Lead Basura': 'descartada',
};

/** Etapa de Zoho (embudo tiendas) → etapa del Pipeline general. */
export const MAPA_TIENDAS: Record<string, string> = {
  'Firma de contrato': 'locales',
  'En búsqueda de local': 'locales',
  'Local aprobado por México': 'constancia',
  'Local aprobado por Brasil': 'constancia',
  'Arquitecta Asignada': 'p_arquitecta',
  'Proyecto 3D Entregado': 'p_3d',
  'Proyecto Ejecutivo Entregado': 'p_ejecutivo',
  'En remodelación': 'p_remodelacion',
  'Entrega de local': 'p_entrega',
  'Agenda de capacitación': 'p_capacitacion',
  Operando: 'operando',
  Standby: 'standby',
  'Modificaciones pendientes': 'standby',
  Cancelada: 'cancelada',
  Cerrada: 'cerrada',
};

export const SIN_FRANQUICIATARIO = 'Sin franquiciatario (muestra)';

export type Conteos = Record<string, number>;

async function conteosPipeline(db: Ejecutor): Promise<Conteos> {
  const r = await db.query<{ clave: string; n: number }>(
    `select e.clave, count(c.id)::int n
     from crm_etapas e
     left join (select id, etapa_id from crm_franquiciatarios where archivado_en is null
                union all select id, etapa_id from crm_tiendas where embudo = 'general' and archivado_en is null) c
       on c.etapa_id = e.id
     where e.embudo = 'general' group by e.clave, e.orden order by e.orden`,
  );
  return Object.fromEntries(r.rows.map((x) => [x.clave, x.n]));
}

/** Valores JSON del mapa como tabla para SQL: [{origen, destino}]. */
const json = (m: Record<string, string>) =>
  JSON.stringify(Object.entries(m).map(([origen, destino]) => ({ origen, destino })));

export async function mapear(db: Ejecutor, { ensayo = false } = {}) {
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'sistema', true)`);
    const ya = await db.query<{ n: number }>(
      `select count(*)::int n from crm_franquiciatarios where muestra`,
    );
    if (ya.rows[0].n > 0) {
      await db.query('rollback');
      return { aplicado: false, motivo: 'La muestra ya está mapeada', conteos: await conteosPipeline(db) };
    }
    const sinMapa = await db.query<{ nombre: string; n: number }>(
      `select e.nombre, count(*)::int n from crm_tiendas t join crm_etapas e on e.id = t.etapa_id
       where t.embudo = 'tiendas' and t.archivado_en is null
         and e.nombre not in (select jsonb_array_elements($1::jsonb)->>'origen') group by 1
       union all
       select e.nombre, count(*)::int from crm_prospectos p join crm_etapas e on e.id = p.etapa_id
       where p.archivado_en is null and e.nombre not in (select jsonb_array_elements($2::jsonb)->>'origen') group by 1`,
      [json(MAPA_TIENDAS), json(MAPA_PROSPECTOS)],
    );
    if (sinMapa.rows.length)
      throw new Error(`Etapas sin mapeo: ${sinMapa.rows.map((r) => `${r.nombre} (${r.n})`).join(', ')}`);

    // 1. Prospectos → card de franquiciatario. Zona bloqueada se queda en la etapa 1 (Q3).
    const prospectos = await db.query<{ n: number }>(
      `with mapa as (select x->>'origen' origen, x->>'destino' destino from jsonb_array_elements($1::jsonb) x),
       nuevos as (
         insert into crm_franquiciatarios (nombre, correo, telefono, ciudad_interes, estado_interes, territorio,
           responsable_id, etapa_id, etapa_previa_id, prospecto_id, muestra, etapa_origen_id)
         select coalesce(nullif(btrim(concat_ws(' ', p.nombre, p.apellidos)), ''), 'Prospecto sin nombre'),
           p.correo, p.telefono, p.ciudad_interes, p.estado_interes,
           case when e.nombre = 'Interes en Zona Bloqueada' then 'bloqueada' end,
           p.responsable_id, crm_etapa(coalesce(m.destino, 'recepcion')),
           case when m.destino = 'standby' then crm_etapa('contacto') end,
           p.id, true, p.etapa_id
         from crm_prospectos p
         left join crm_etapas e on e.id = p.etapa_id
         left join mapa m on m.origen = e.nombre
         where p.archivado_en is null
         returning 1)
       select count(*)::int n from nuevos`,
      [json(MAPA_PROSPECTOS)],
    );

    // 2. Franquiciatarios derivados del texto de las tiendas (ya formalizados: tienen tiendas).
    const derivados = await db.query<{ n: number }>(
      `with nombres as (
         select coalesce(nullif(lower(btrim(franquiciatario)), ''), '') clave,
           min(coalesce(nullif(btrim(franquiciatario), ''), $1)) nombre
         from crm_tiendas where embudo = 'tiendas' and archivado_en is null group by 1),
       nuevos as (
         insert into crm_franquiciatarios (nombre, etapa_id, formalizado_en, muestra)
         select nombre, crm_etapa('formalizado'), now(), true from nombres returning 1)
       select count(*)::int n from nuevos`,
      [SIN_FRANQUICIATARIO],
    );

    // 3. Tiendas → card de sucursal del embudo general, ligada a su franquiciatario.
    const tiendas = await db.query<{ n: number }>(
      `with mapa as (select x->>'origen' origen, x->>'destino' destino from jsonb_array_elements($1::jsonb) x),
       fr as (select id, case when nombre = $2 then '' else lower(btrim(nombre)) end clave
              from crm_franquiciatarios where muestra and prospecto_id is null),
       cambio as (
         update crm_tiendas t set embudo = 'general', etapa_origen_id = t.etapa_id, muestra = true,
           etapa_id = crm_etapa(m.destino),
           etapa_previa_id = case when m.destino = 'standby' then crm_etapa('locales') end,
           franquiciatario_id = fr.id,
           fecha_estimada_apertura = coalesce(t.fecha_estimada_apertura, t.fecha_programada_arranque)
         from crm_etapas e, mapa m, fr
         where e.id = t.etapa_id and m.origen = e.nombre and t.embudo = 'tiendas' and t.archivado_en is null
           and fr.clave = coalesce(nullif(lower(btrim(t.franquiciatario)), ''), '')
         returning 1)
       select count(*)::int n from cambio`,
      [json(MAPA_TIENDAS), SIN_FRANQUICIATARIO],
    );
    const conteos = await conteosPipeline(db);
    const resumen = {
      aplicado: !ensayo,
      franquiciatariosDeProspectos: prospectos.rows[0].n,
      franquiciatariosDeTiendas: derivados.rows[0].n,
      sucursales: tiendas.rows[0].n,
      conteos,
    };
    await db.query(ensayo ? 'rollback' : 'commit');
    return resumen;
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/** Cuenta lo que usuarios agregaron a la muestra (se perdería al revertir el mapeo). */
async function trabajoSobreMuestra(db: Ejecutor) {
  const r = await db.query<{ n: number }>(
    `select (select count(*) from crm_cumplimientos c where c.card_id in (
               select id from crm_franquiciatarios where muestra union all select id from crm_tiendas where muestra))
          + (select count(*) from crm_liberaciones l where l.card_id in (
               select id from crm_franquiciatarios where muestra union all select id from crm_tiendas where muestra))
          + (select count(*) from crm_notas where franquiciatario_id in (select id from crm_franquiciatarios where muestra))
          + (select count(*) from crm_archivos where franquiciatario_id in (select id from crm_franquiciatarios where muestra))
          + (select count(*) from crm_actividades where franquiciatario_id in (select id from crm_franquiciatarios where muestra))
          + (select count(*) from crm_tiendas where franquiciatario_id in (select id from crm_franquiciatarios where muestra)
               and not muestra) as n`,
  );
  return Number(r.rows[0].n);
}

export async function revertirMapeo(db: Ejecutor) {
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'sistema', true)`);
    const trabajo = await trabajoSobreMuestra(db);
    if (trabajo)
      throw new Error(
        `No se revierte: hay ${trabajo} registros de usuarios sobre la muestra (requisitos, notas, archivos…).`,
      );
    await db.query(`delete from crm_avisos where tienda_id in (select id from crm_tiendas where muestra)`);
    const t = await db.query<{ n: number }>(
      `with r as (
         update crm_tiendas set embudo = 'tiendas', etapa_id = etapa_origen_id, etapa_origen_id = null, etapa_previa_id = null,
           franquiciatario_id = null, muestra = false
         where muestra and etapa_origen_id is not null returning 1)
       select count(*)::int n from r`,
    );
    const f = await db.query<{ n: number }>(
      `with r as (delete from crm_franquiciatarios where muestra returning 1) select count(*)::int n from r`,
    );
    await db.query('commit');
    return { sucursales: t.rows[0].n, franquiciatarios: f.rows[0].n };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/**
 * Limpieza para arrancar de cero (NO se ejecuta sin OK de Carlo y respaldo). Borra todo lo importado de Zoho
 * y lo marcado como muestra; devuelve las rutas de Storage a borrar después del commit (con la clave secreta).
 */
export async function limpiar(db: Ejecutor, { ensayo = true } = {}) {
  await db.query('begin');
  try {
    await db.query(`select set_config('app.origen', 'sistema', true)`);
    const antes = await db.query<Record<string, number>>(
      `select (select count(*) from crm_franquiciatarios)::int franquiciatarios, (select count(*) from crm_tiendas)::int tiendas,
         (select count(*) from crm_prospectos)::int prospectos, (select count(*) from crm_contactos)::int contactos,
         (select count(*) from crm_actividades)::int actividades, (select count(*) from crm_notas)::int notas,
         (select count(*) from crm_archivos)::int archivos, (select count(*) from crm_historial)::int bitacora`,
    );
    // Solo datos de muestra o importados; lo capturado en el CRM después del arranque no se toca.
    const muestra = `(select id from crm_franquiciatarios where muestra)`;
    const tiendas = `(select id from crm_tiendas where muestra or imported_at is not null)`;
    const prospectos = `(select id from crm_prospectos where imported_at is not null)`;
    const contactos = `(select id from crm_contactos where imported_at is not null)`;
    const rutas = await db.query<{ ruta: string }>(
      `select ruta from crm_archivos where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
         or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null
         or nota_id in (select id from crm_notas where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
           or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null)`,
    );
    const pasos = [
      `delete from crm_cumplimientos where card_id in (select id from crm_franquiciatarios where muestra
         union all select id from crm_tiendas where muestra or imported_at is not null)`,
      `delete from crm_liberaciones where card_id in (select id from crm_franquiciatarios where muestra
         union all select id from crm_tiendas where muestra or imported_at is not null)`,
      `delete from crm_avisos where tienda_id in ${tiendas}`,
      `delete from crm_archivos where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
         or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null
         or nota_id in (select id from crm_notas where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
           or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null)`,
      `delete from crm_notas where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
         or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null
         or actividad_id in (select id from crm_actividades where imported_at is not null)`,
      `delete from crm_actividades where franquiciatario_id in ${muestra} or tienda_id in ${tiendas}
         or prospecto_id in ${prospectos} or contacto_id in ${contactos} or imported_at is not null`,
      `delete from crm_checklists where tienda_id in ${tiendas}`,
      `delete from crm_etiquetas_registro where tienda_id in ${tiendas} or prospecto_id in ${prospectos}
         or contacto_id in ${contactos}`,
      `delete from crm_tienda_contactos where tienda_id in ${tiendas} or contacto_id in ${contactos}`,
      `delete from crm_tiendas where muestra or imported_at is not null`,
      `delete from crm_franquiciatarios where muestra`,
      `delete from crm_prospectos where imported_at is not null`,
      `delete from crm_contactos where imported_at is not null`,
    ];
    for (const sql of pasos) await db.query(sql);
    await db.query(
      `insert into crm_historial (entidad, accion, resumen, origen, actor_nombre)
       values ('crm', 'eliminado', 'Limpieza de datos de muestra para el arranque', 'sistema', 'Sistema')`,
    );
    const despues = await db.query<Record<string, number>>(
      `select (select count(*) from crm_franquiciatarios)::int franquiciatarios, (select count(*) from crm_tiendas)::int tiendas,
         (select count(*) from crm_prospectos)::int prospectos, (select count(*) from crm_contactos)::int contactos,
         (select count(*) from crm_actividades)::int actividades, (select count(*) from crm_notas)::int notas,
         (select count(*) from crm_archivos)::int archivos, (select count(*) from crm_historial)::int bitacora`,
    );
    await db.query(ensayo ? 'rollback' : 'commit');
    return {
      aplicado: !ensayo,
      antes: antes.rows[0],
      despues: despues.rows[0],
      rutas: rutas.rows.map((r) => r.ruta),
    };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
