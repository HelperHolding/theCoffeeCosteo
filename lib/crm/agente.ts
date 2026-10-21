import { z } from 'zod';
import type { Db } from '../portal/consultas';
import type { Consulta } from '../mcp/herramientas';
import { resultadoPagina } from '../mcp/herramientas';
import { expediente, leerTodo, tablero } from './consultas';
import { ESTADOS_ACTIVIDAD, PRIORIDADES, TIPOS_FRANQUICIA } from './tipos';
import { vencida } from './formato';

// Consultas del agente del CRM. SOLO lectura: cada herramienta hace select con la sesión del
// usuario (la RLS exige acceso al CRM). No se exponen por MCP; solo las usa /api/chat/crm.
const pagina = z.number().int().min(1).max(10000).default(1);
const limite = z.number().int().min(1).max(50).default(25);
const texto = z.string().trim().max(100).default('');
const id = z.uuid();
const literal = (valor: string) => `%${valor.replace(/[\\%_]/g, '\\$&')}%`;
// En .or() el valor va entre comillas; los caracteres de sintaxis se vuelven comodín de un carácter.
const patron = (valor: string) => `"%${valor.replace(/[\\%_,()"*]/g, '_')}%"`;
const recorte = (s: string | null, n: number) => (s && s.length > n ? `${s.slice(0, n)}…` : s);
const hoy = () => new Date().toISOString().slice(0, 10);
function exigir<T>(r: { data: T | null; error: unknown }): NonNullable<T> {
  if (r.error || r.data === null) throw new Error('No se pudo consultar el CRM. Intenta de nuevo.');
  return r.data as NonNullable<T>;
}
// Zoho a veces repite el nombre dentro de los apellidos.
// Las notas importadas conservan su fecha de Zoho; creado_en es el día de la importación.
const fechaNota = (n: { creado_en: string; zoho_created_at: string | null }) =>
  n.zoho_created_at ?? n.creado_en;
const nombreCompleto = (p: { nombre: string | null; apellidos: string }) =>
  p.nombre && !p.apellidos.includes(p.nombre) ? `${p.nombre} ${p.apellidos}` : p.apellidos;

/** Campos del expediente que, vacíos, indican que algo le falta a la tienda. */
const CAMPOS_CLAVE = {
  franquiciatario: 'Franquiciatario',
  ciudad: 'Ciudad',
  direccion: 'Dirección',
  responsable_id: 'Responsable',
  arquitecto_asignado: 'Arquitecto asignado',
  fecha_firma_contrato: 'Fecha de firma de contrato',
  estatus_contrato_franquicia: 'Estatus del contrato',
  fecha_aprobacion_local: 'Fecha de aprobación del local',
  fecha_entrega_proyecto: 'Fecha de entrega del proyecto',
  fecha_programada_arranque: 'Fecha programada de arranque',
  fecha_apertura: 'Fecha de apertura',
  marca_cafetera: 'Marca de cafetera',
  estatus_cafetera: 'Estatus de cafetera',
  correo_tienda: 'Correo de la tienda',
  url_carpeta_contrato: 'Carpeta del contrato',
  url_dictamen_local: 'Dictamen del local',
} as const;

export function crearConsultasCrm(db: Db): Consulta[] {
  const consultas: Consulta[] = [];
  const registrar = <S extends z.ZodRawShape>(
    nombre: string,
    descripcion: string,
    esquema: z.ZodObject<S>,
    consultar: (entrada: z.output<z.ZodObject<S>>) => Promise<Record<string, unknown>>,
  ) => consultas.push({ nombre, descripcion, esquema, ejecutar: (e) => consultar(esquema.parse(e)) });

  // Nombres de usuarios del portal y etapas: se leen una vez por conversación.
  let personas: Promise<Map<string, string>> | undefined;
  const quien = async (uid: string | null) => {
    personas ??= Promise.resolve(db.from('perfiles').select('user_id,nombre')).then(
      (r) => new Map(exigir(r).map((p) => [p.user_id, p.nombre])),
    );
    return uid ? ((await personas).get(uid) ?? 'Usuario del portal') : null;
  };
  let etapas:
    Promise<{ id: string; nombre: string; orden: number; tipo: string; embudo: string }[]> | undefined;
  const leerEtapas = () =>
    (etapas ??= leerTodo(db, 'crm_etapas', 'id,nombre,orden,tipo,embudo,activa', (q) =>
      q.eq('activa', true),
    ));
  const etapaDe = async (eid: string | null) =>
    eid ? (await leerEtapas()).find((e) => e.id === eid) : undefined;
  const sinAcentos = (v: string) => v.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
  /** Resuelve una etapa por nombre aproximado; si no existe devuelve las válidas para que el agente reintente. */
  const etapaPorNombre = async (embudo: string, nombre: string) => {
    if (!nombre) return {};
    const n = sinAcentos(nombre);
    const candidatas = (await leerEtapas()).filter((e) => e.embudo === embudo);
    const etapa =
      candidatas.find((x) => sinAcentos(x.nombre) === n) ??
      candidatas.find((x) => sinAcentos(x.nombre).includes(n) || n.includes(sinAcentos(x.nombre)));
    return etapa
      ? { etapa }
      : { invalida: { error: 'Etapa no encontrada', etapas_validas: candidatas.map((x) => x.nombre) } };
  };
  /** Última modificación: en el portal tiene autor; si viene de Zoho, solo su fecha en Zoho (sin autor). */
  const autoria = async (r: {
    actualizado_en: string;
    actualizado_por: string | null;
    zoho_modified_at?: string | null;
  }) =>
    r.actualizado_por
      ? {
          ultima_modificacion: r.actualizado_en,
          modificado_por: await quien(r.actualizado_por),
          modificado_en: 'portal',
        }
      : {
          ultima_modificacion: r.zoho_modified_at ?? null,
          modificado_por: null,
          modificado_en:
            'Zoho (sin autor registrado; importado al portal el ' + r.actualizado_en.slice(0, 10) + ')',
        };

  /** Detalle legible de eventos del historial: elemento afectado y valores antes/después. */
  const detallar = async (
    filas: {
      entidad: string;
      entidad_id: string;
      cambios: unknown;
      actor_id: string | null;
      origen: string;
    }[],
  ) => {
    const ids = (entidad: string) => [
      ...new Set(filas.filter((f) => f.entidad === entidad).map((f) => f.entidad_id)),
    ];
    const [items, actividades] = await Promise.all([
      ids('crm_checklist_items').length
        ? db.from('crm_checklist_items').select('id,texto').in('id', ids('crm_checklist_items'))
        : { data: [], error: null },
      ids('crm_actividades').length
        ? db.from('crm_actividades').select('id,asunto').in('id', ids('crm_actividades'))
        : { data: [], error: null },
    ]);
    const nombres = new Map<string, string>([
      ...exigir(items).map((i): [string, string] => [i.id, i.texto]),
      ...exigir(actividades).map((a): [string, string] => [a.id, a.asunto]),
    ]);
    const valor = async (campo: string, v: unknown) =>
      campo.endsWith('_por') || campo === 'responsable_id'
        ? await quien(typeof v === 'string' ? v : null)
        : typeof v === 'string'
          ? recorte(v, 80)
          : v;
    return Promise.all(
      filas.map(async (h) => ({
        elemento: nombres.get(h.entidad_id) ?? null,
        // Contenido de notas/descripciones nunca se guarda: solo consta que cambió. Las etapas ya van en el resumen.
        cambios:
          h.cambios && typeof h.cambios === 'object'
            ? Object.fromEntries(
                await Promise.all(
                  Object.entries(h.cambios as Record<string, { antes?: unknown; despues?: unknown }>)
                    .filter(([k]) => k !== 'etapa_id')
                    .map(async ([k, c]) => [
                      k,
                      'antes' in c
                        ? { antes: await valor(k, c.antes), despues: await valor(k, c.despues) }
                        : 'modificado',
                    ]),
                ),
              )
            : null,
        quien: (await quien(h.actor_id)) ?? (h.origen === 'crm' ? 'Sistema' : 'Zoho (sin autor)'),
      })),
    );
  };

  registrar(
    'resumen_pipeline',
    'Resumen del pipeline: etapas del embudo de tiendas (en orden) con cuántas tiendas hay en cada una y sus nombres, o del embudo de prospectos con conteos. Úsalo para preguntas generales de avance.',
    z.object({ embudo: z.enum(['tiendas', 'prospectos']).default('tiendas') }),
    async (e) => {
      if (e.embudo === 'prospectos') {
        const [lista, prospectos] = await Promise.all([
          leerEtapas(),
          leerTodo<{ etapa_id: string | null }>(db, 'crm_prospectos', 'etapa_id', (q) =>
            q.is('archivado_en', null),
          ),
        ]);
        const conteo = new Map<string | null, number>();
        for (const p of prospectos) conteo.set(p.etapa_id, (conteo.get(p.etapa_id) ?? 0) + 1);
        return {
          total: prospectos.length,
          sin_etapa: conteo.get(null) ?? 0,
          etapas: lista
            .filter((x) => x.embudo === 'prospectos')
            .sort((a, b) => a.orden - b.orden)
            .map((x) => ({ etapa: x.nombre, prospectos: conteo.get(x.id) ?? 0 })),
        };
      }
      const t = await tablero(db);
      return {
        total: t.tarjetas.length,
        etapas: t.etapas
          .sort((a, b) => a.orden - b.orden)
          .map((x) => {
            const tiendas = t.tarjetas.filter((c) => c.etapa_id === x.id);
            return {
              etapa: x.nombre,
              tipo: x.tipo,
              cantidad: tiendas.length,
              // Las etapas grandes (p. ej. Operando) se listan sin detalle para no saturar.
              tiendas: tiendas.length > 25 ? undefined : tiendas.map((c) => ({ id: c.id, nombre: c.nombre })),
            };
          }),
      };
    },
  );

  registrar(
    'buscar_tiendas',
    'Busca tiendas (franquicias) por nombre, franquiciatario o ciudad, opcionalmente por etapa. Devuelve ID, etapa, responsable, avance de checklist y quién la modificó por última vez. Usa el ID en consultar_tienda.',
    z.object({ texto, etapa: texto, pagina, limite }),
    async (e) => {
      const { etapa, invalida } = await etapaPorNombre('tiendas', e.etapa);
      if (invalida) return invalida;
      let q = db
        .from('crm_tiendas')
        .select(
          'id,nombre,ciudad,franquiciatario,etapa_id,responsable_id,fecha_programada_arranque,fecha_apertura,actualizado_en,actualizado_por,zoho_modified_at',
          { count: 'exact' },
        )
        .is('archivado_en', null)
        .order('nombre')
        .order('id');
      if (e.texto) {
        const l = patron(e.texto);
        q = q.or(`nombre.ilike.${l},franquiciatario.ilike.${l},ciudad.ilike.${l}`);
      }
      if (etapa) q = q.eq('etapa_id', etapa.id);
      const r = await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite);
      const filas = exigir(r);
      const datos = await Promise.all(
        filas.map(async (t) => ({
          id: t.id,
          nombre: t.nombre,
          ciudad: t.ciudad,
          franquiciatario: t.franquiciatario,
          etapa: (await etapaDe(t.etapa_id))?.nombre ?? null,
          responsable: await quien(t.responsable_id),
          fecha_programada_arranque: t.fecha_programada_arranque,
          fecha_apertura: t.fecha_apertura,
          ...(await autoria(t)),
        })),
      );
      return { total_coincidencias: r.count, ...resultadoPagina(datos, e.pagina, e.limite) };
    },
  );

  registrar(
    'consultar_tienda',
    'Expediente completo de una tienda: datos, etapa actual y siguiente, campos clave vacíos, checklists con pendientes, actividades abiertas/vencidas, notas recientes, documentos, contactos e historial de cambios con quién los hizo. Úsalo para "cómo va", "qué le falta" o "quién la modificó".',
    z.object({ tienda_id: id }),
    async (e) => {
      const x = await expediente(db, e.tienda_id);
      if (!x) throw new Error('No existe la tienda');
      const t = x.tienda;
      const orden = x.etapas.filter((s) => s.tipo === 'abierta' || s.tipo === 'ganada');
      const actual = x.etapas.find((s) => s.id === t.etapa_id);
      const i = orden.findIndex((s) => s.id === t.etapa_id);
      const items = x.checklists.flatMap((c) => c.items.map((it) => ({ ...it, lista: c.nombre })));
      const abiertas = x.actividades.filter((a) => a.estado !== 'Completed');
      const recientes = x.historial.filter((h) => h.accion !== 'importado').slice(0, 15);
      const detalles = await detallar(recientes);
      const historial = recientes.map((h, n) => ({
        fecha: h.fecha,
        accion: h.accion,
        resumen: h.resumen,
        ...detalles[n],
        origen: h.origen,
      }));
      return {
        tienda: {
          id: t.id,
          nombre: t.nombre,
          franquiciatario: t.franquiciatario,
          tipo_franquicia: t.tipo_franquicia ? TIPOS_FRANQUICIA[t.tipo_franquicia] : null,
          ciudad: t.ciudad,
          direccion: t.direccion,
          numero_tienda_jestor: t.numero_tienda_jestor,
          responsable: await quien(t.responsable_id),
          arquitecto_asignado: t.arquitecto_asignado,
          fecha_aprobacion_local: t.fecha_aprobacion_local,
          fecha_entrega_proyecto: t.fecha_entrega_proyecto,
          fecha_firma_contrato: t.fecha_firma_contrato,
          fecha_firma_franquicia: t.fecha_firma_franquicia,
          estatus_contrato_franquicia: t.estatus_contrato_franquicia,
          fecha_vencimiento_franquicia: t.fecha_vencimiento_franquicia,
          fecha_programada_arranque: t.fecha_programada_arranque,
          fecha_apertura: t.fecha_apertura,
          marca_cafetera: t.marca_cafetera,
          estatus_cafetera: t.estatus_cafetera,
          rappi: t.rappi,
          rollout: t.rollout,
          correo_tienda: t.correo_tienda,
          datos_por_revisar_de_importacion: t.revisar ?? [],
          creado_en: t.creado_en,
          creado_por: (await quien(t.creado_por)) ?? 'Importación de Zoho',
          ...(await autoria(t)),
        },
        etapa: {
          actual: actual?.nombre ?? null,
          tipo: actual?.tipo ?? null,
          posicion: i >= 0 ? `${i + 1} de ${orden.length}` : null,
          siguiente: i >= 0 ? (orden[i + 1]?.nombre ?? null) : null,
        },
        campos_clave_vacios: Object.entries(CAMPOS_CLAVE)
          .filter(([k]) => t[k as keyof typeof t] == null || t[k as keyof typeof t] === '')
          .map(([, v]) => v),
        checklist: {
          hechos: items.filter((it) => it.hecho).length,
          total: items.length,
          pendientes: await Promise.all(
            items
              .filter((it) => !it.hecho)
              .slice(0, 40)
              .map(async (it) => ({
                lista: it.lista,
                texto: it.texto,
                responsable: await quien(it.responsable_id),
                fecha_limite: it.fecha_limite,
                vencido: !!it.fecha_limite && it.fecha_limite < hoy(),
              })),
          ),
          completados_recientes: await Promise.all(
            items
              .filter((it) => it.hecho && it.completado_en)
              .sort((a, b) => b.completado_en!.localeCompare(a.completado_en!))
              .slice(0, 5)
              .map(async (it) => ({
                texto: it.texto,
                completado_por: await quien(it.completado_por),
                completado_en: it.completado_en,
              })),
          ),
        },
        actividades: {
          abiertas: abiertas.length,
          vencidas: abiertas.filter(vencida).length,
          completadas: x.actividades.length - abiertas.length,
          lista: await Promise.all(
            abiertas.slice(0, 20).map(async (a) => ({
              id: a.id,
              asunto: a.asunto,
              estado: ESTADOS_ACTIVIDAD[a.estado] ?? a.estado,
              prioridad: a.prioridad ? PRIORIDADES[a.prioridad] : null,
              fecha_vencimiento: a.fecha_vencimiento,
              vencida: vencida(a),
              responsable: await quien(a.responsable_id),
            })),
          ),
        },
        notas: {
          total: x.notas.length,
          recientes: await Promise.all(
            [...x.notas]
              .sort((a, b) => fechaNota(b).localeCompare(fechaNota(a)))
              .slice(0, 8)
              .map(async (n) => ({
                fecha: fechaNota(n),
                titulo: n.titulo,
                contenido: recorte(n.contenido, 400),
                autor: (await quien(n.autor_id)) ?? 'Zoho',
              })),
          ),
        },
        documentos: {
          total: x.archivos.length,
          lista: x.archivos
            .slice(0, 25)
            .map((a) => ({ nombre: a.nombre, seccion: a.seccion, subido_en: a.subido_en })),
        },
        contactos: x.contactos.map((c) => ({
          id: c.id,
          nombre: nombreCompleto(c),
          puesto: c.puesto,
          correo: c.correo,
          telefono: c.telefono,
        })),
        historial: { total: x.historial.length, recientes: historial },
      };
    },
  );

  registrar(
    'buscar_actividades',
    'Lista tareas/actividades del CRM con filtros: texto en el asunto, estado (Sin iniciar, En curso, En espera, Pospuesta, Completada, Interesado), solo vencidas, solo abiertas o de una tienda. Incluye la tienda/prospecto/contacto relacionado, el responsable y total_coincidencias (el total exacto, no solo la página).',
    z.object({
      texto,
      estado: z.enum(Object.values(ESTADOS_ACTIVIDAD) as [string, ...string[]]).optional(),
      solo_abiertas: z.boolean().default(false),
      solo_vencidas: z.boolean().default(false),
      tienda_id: id.optional(),
      pagina,
      limite,
    }),
    async (e) => {
      let q = db
        .from('crm_actividades')
        .select(
          'id,asunto,estado,prioridad,fecha_vencimiento,cerrada_en,descripcion,responsable_id,tienda_id,prospecto_id,contacto_id,actualizado_en,actualizado_por,zoho_modified_at',
          { count: 'exact' },
        )
        .is('archivado_en', null)
        .order('fecha_vencimiento', { nullsFirst: false })
        .order('id');
      if (e.texto) q = q.ilike('asunto', literal(e.texto));
      if (e.estado) {
        const clave = Object.entries(ESTADOS_ACTIVIDAD).find(([, v]) => v === e.estado)![0];
        q = q.eq('estado', clave as keyof typeof ESTADOS_ACTIVIDAD);
      }
      if (e.solo_abiertas || e.solo_vencidas) q = q.neq('estado', 'Completed');
      if (e.solo_vencidas) q = q.lt('fecha_vencimiento', hoy());
      if (e.tienda_id) q = q.eq('tienda_id', e.tienda_id);
      const r = await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite);
      const filas = exigir(r);
      const ids = (k: 'tienda_id' | 'prospecto_id' | 'contacto_id') => [
        ...new Set(filas.flatMap((f) => (f[k] ? [f[k]!] : []))),
      ];
      const [tiendas, prospectos, contactos] = await Promise.all([
        ids('tienda_id').length
          ? db.from('crm_tiendas').select('id,nombre').in('id', ids('tienda_id'))
          : { data: [], error: null },
        ids('prospecto_id').length
          ? db.from('crm_prospectos').select('id,nombre,apellidos').in('id', ids('prospecto_id'))
          : { data: [], error: null },
        ids('contacto_id').length
          ? db.from('crm_contactos').select('id,nombre,apellidos').in('id', ids('contacto_id'))
          : { data: [], error: null },
      ]);
      const [ts, ps, cs] = [exigir(tiendas), exigir(prospectos), exigir(contactos)];
      const datos = await Promise.all(
        filas.map(async (a) => ({
          id: a.id,
          asunto: a.asunto,
          estado: ESTADOS_ACTIVIDAD[a.estado as keyof typeof ESTADOS_ACTIVIDAD] ?? a.estado,
          prioridad: a.prioridad ? PRIORIDADES[a.prioridad as keyof typeof PRIORIDADES] : null,
          fecha_vencimiento: a.fecha_vencimiento,
          vencida: vencida(a as Parameters<typeof vencida>[0]),
          cerrada_en: a.cerrada_en,
          descripcion: recorte(a.descripcion, 300),
          responsable: await quien(a.responsable_id),
          tienda: a.tienda_id
            ? { id: a.tienda_id, nombre: ts.find((t) => t.id === a.tienda_id)?.nombre }
            : null,
          prospecto: a.prospecto_id
            ? {
                id: a.prospecto_id,
                nombre: nombreCompleto(
                  ps.find((p) => p.id === a.prospecto_id) ?? { nombre: null, apellidos: '' },
                ),
              }
            : null,
          contacto: a.contacto_id
            ? {
                id: a.contacto_id,
                nombre: nombreCompleto(
                  cs.find((c) => c.id === a.contacto_id) ?? { nombre: null, apellidos: '' },
                ),
              }
            : null,
          ...(await autoria(a)),
        })),
      );
      return { hoy: hoy(), total_coincidencias: r.count, ...resultadoPagina(datos, e.pagina, e.limite) };
    },
  );

  registrar(
    'buscar_prospectos',
    'Busca prospectos (leads de franquicia) por nombre, apellidos, empresa, correo o ciudad de interés, opcionalmente por etapa. Hay miles: usa filtros y paginación.',
    z.object({ texto, etapa: texto, pagina, limite }),
    async (e) => {
      const { etapa, invalida } = await etapaPorNombre('prospectos', e.etapa);
      if (invalida) return invalida;
      let q = db
        .from('crm_prospectos')
        .select(
          'id,nombre,apellidos,empresa,correo,telefono,ciudad_interes,estado_interes,etapa_id,responsable_id,actualizado_en,actualizado_por,zoho_modified_at',
          { count: 'exact' },
        )
        .is('archivado_en', null)
        .order('apellidos')
        .order('id');
      if (e.texto) {
        const l = patron(e.texto);
        q = q.or(
          `nombre.ilike.${l},apellidos.ilike.${l},empresa.ilike.${l},correo.ilike.${l},ciudad_interes.ilike.${l}`,
        );
      }
      if (etapa) q = q.eq('etapa_id', etapa.id);
      const r = await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite);
      const filas = exigir(r);
      const datos = await Promise.all(
        filas.map(async (p) => ({
          id: p.id,
          nombre: nombreCompleto(p),
          empresa: p.empresa,
          correo: p.correo,
          telefono: p.telefono,
          ciudad_interes: [p.ciudad_interes, p.estado_interes].filter(Boolean).join(', ') || null,
          etapa: (await etapaDe(p.etapa_id))?.nombre ?? null,
          responsable: await quien(p.responsable_id),
          ...(await autoria(p)),
        })),
      );
      return { total_coincidencias: r.count, ...resultadoPagina(datos, e.pagina, e.limite) };
    },
  );

  registrar(
    'consultar_prospecto',
    'Ficha completa de un prospecto: datos, etapa, perfil de inversión, notas recientes, actividades e historial con quién lo modificó.',
    z.object({ prospecto_id: id }),
    async (e) => {
      const [p, notas, actividades, historial] = await Promise.all([
        db.from('crm_prospectos').select('*').eq('id', e.prospecto_id).maybeSingle(),
        db
          .from('crm_notas')
          .select('titulo,contenido,autor_id,creado_en,zoho_created_at')
          .eq('prospecto_id', e.prospecto_id)
          .is('archivado_en', null)
          .order('zoho_created_at', { ascending: false, nullsFirst: true })
          .order('creado_en', { ascending: false })
          .limit(8),
        db
          .from('crm_actividades')
          .select('asunto,estado,fecha_vencimiento,responsable_id')
          .eq('prospecto_id', e.prospecto_id)
          .is('archivado_en', null)
          .order('fecha_vencimiento')
          .limit(20),
        db
          .from('crm_historial')
          .select('fecha,accion,resumen,actor_id,origen')
          .eq('entidad', 'crm_prospectos')
          .eq('entidad_id', e.prospecto_id)
          .order('fecha', { ascending: false })
          .limit(10),
      ]);
      const x = exigir(p);
      return {
        prospecto: {
          id: x.id,
          nombre: nombreCompleto(x),
          empresa: x.empresa,
          correo: x.correo,
          telefono: x.telefono,
          etapa: (await etapaDe(x.etapa_id))?.nombre ?? null,
          responsable: await quien(x.responsable_id),
          ciudad_interes: x.ciudad_interes,
          estado_interes: x.estado_interes,
          ciudad_residencia: x.ciudad_residencia,
          estado_residencia: x.estado_residencia,
          pais: x.pais,
          inversion: x.inversion,
          capital_disponible: x.capital_disponible,
          fuente_capital: x.fuente_capital,
          interes_en_the_coffee: recorte(x.interes_en_the_coffee, 400),
          plan_operacion: recorte(x.plan_operacion, 400),
          involucrado_otra_marca: x.involucrado_otra_marca,
          creado_en: x.creado_en,
          ...(await autoria(x)),
        },
        notas: await Promise.all(
          exigir(notas).map(async (n) => ({
            fecha: fechaNota(n),
            titulo: n.titulo,
            contenido: recorte(n.contenido, 400),
            autor: (await quien(n.autor_id)) ?? 'Zoho',
          })),
        ),
        actividades: await Promise.all(
          exigir(actividades).map(async (a) => ({
            asunto: a.asunto,
            estado: ESTADOS_ACTIVIDAD[a.estado as keyof typeof ESTADOS_ACTIVIDAD] ?? a.estado,
            fecha_vencimiento: a.fecha_vencimiento,
            responsable: await quien(a.responsable_id),
          })),
        ),
        historial: await Promise.all(
          exigir(historial).map(async (h) => ({
            fecha: h.fecha,
            resumen: h.resumen,
            quien: (await quien(h.actor_id)) ?? (h.origen === 'crm' ? 'Sistema' : 'Zoho (sin autor)'),
          })),
        ),
      };
    },
  );

  registrar(
    'buscar_contactos',
    'Busca contactos (franquiciatarios, gerentes, directores, etc.) por nombre, correo, franquiciatario o plaza. Incluye las tiendas ligadas.',
    z.object({ texto, pagina, limite }),
    async (e) => {
      let q = db
        .from('crm_contactos')
        .select(
          'id,nombre,apellidos,correo,telefono,puesto,tipo_contacto,franquiciatario,plaza,fee_pagado,actualizado_en,actualizado_por,zoho_modified_at',
          { count: 'exact' },
        )
        .is('archivado_en', null)
        .order('apellidos')
        .order('id');
      if (e.texto) {
        const l = patron(e.texto);
        q = q.or(
          `nombre.ilike.${l},apellidos.ilike.${l},correo.ilike.${l},franquiciatario.ilike.${l},plaza.ilike.${l}`,
        );
      }
      const r = await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite);
      const filas = exigir(r);
      const ligas = filas.length
        ? exigir(
            await db
              .from('crm_tienda_contactos')
              .select('contacto_id,tienda_id')
              .in(
                'contacto_id',
                filas.map((f) => f.id),
              ),
          )
        : [];
      const idsTiendas = [...new Set(ligas.map((l) => l.tienda_id))];
      const tiendas = idsTiendas.length
        ? exigir(await db.from('crm_tiendas').select('id,nombre').in('id', idsTiendas))
        : [];
      const datos = await Promise.all(
        filas.map(async (c) => ({
          id: c.id,
          nombre: nombreCompleto(c),
          correo: c.correo,
          telefono: c.telefono,
          puesto: c.puesto,
          tipo_contacto: c.tipo_contacto,
          franquiciatario: c.franquiciatario,
          plaza: c.plaza,
          fee_pagado: c.fee_pagado,
          tiendas: ligas
            .filter((l) => l.contacto_id === c.id)
            .map((l) => ({ id: l.tienda_id, nombre: tiendas.find((t) => t.id === l.tienda_id)?.nombre })),
          ...(await autoria(c)),
        })),
      );
      return { total_coincidencias: r.count, ...resultadoPagina(datos, e.pagina, e.limite) };
    },
  );

  registrar(
    'historial_cambios',
    'Últimos cambios registrados en el CRM (quién, cuándo y qué), del más reciente al más antiguo. Filtra por tienda o por origen: "crm" (hechos en el portal, con autor) o "zoho" (cambios de etapa traídos de Zoho, sin autor). Excluye la carga inicial de importación.',
    z.object({ tienda_id: id.optional(), origen: z.enum(['crm', 'zoho']).optional(), pagina, limite }),
    async (e) => {
      let q = db
        .from('crm_historial')
        .select('fecha,entidad,entidad_id,tienda_id,accion,resumen,cambios,actor_id,origen')
        .neq('accion', 'importado')
        .order('fecha', { ascending: false })
        .order('id', { ascending: false });
      if (e.tienda_id) q = q.eq('tienda_id', e.tienda_id);
      if (e.origen) q = q.eq('origen', e.origen);
      const filas = exigir(await q.range((e.pagina - 1) * e.limite, e.pagina * e.limite));
      const idsTiendas = [...new Set(filas.flatMap((f) => (f.tienda_id ? [f.tienda_id] : [])))];
      const tiendas = idsTiendas.length
        ? exigir(await db.from('crm_tiendas').select('id,nombre').in('id', idsTiendas))
        : [];
      const entidades: Record<string, string> = {
        crm_tiendas: 'Tienda',
        crm_checklist_items: 'Checklist',
        crm_actividades: 'Actividad',
        crm_notas: 'Nota',
        crm_archivos: 'Documento',
        crm_prospectos: 'Prospecto',
        crm_contactos: 'Contacto',
      };
      const detalles = await detallar(filas);
      const datos = filas.map((h, n) => ({
        fecha: h.fecha,
        tipo: entidades[h.entidad] ?? h.entidad,
        tienda: h.tienda_id
          ? { id: h.tienda_id, nombre: tiendas.find((t) => t.id === h.tienda_id)?.nombre }
          : null,
        resumen: h.resumen,
        ...detalles[n],
        origen: h.origen,
      }));
      return resultadoPagina(datos, e.pagina, e.limite);
    },
  );

  return consultas;
}
