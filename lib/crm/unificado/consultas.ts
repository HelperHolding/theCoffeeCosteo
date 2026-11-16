import 'server-only';
import type { Db } from '../../portal/consultas';
import type {
  Archivo,
  Aviso,
  CandadoCard,
  ClaveArea,
  Etapa,
  Franquiciatario,
  FranquiciatarioFiscal,
  Historial,
  Liberacion,
  Membresia,
  Nota,
  RequisitoCard,
  Tienda,
  TipoCard,
  VencimientoCard,
} from '../tipos';
import { POR_COLUMNA, type CardPipeline, type EtapaGeneral, type Vencimiento } from './modelo';

// Lecturas del CRM Unificado. Todas con la sesión del usuario: la RLS decide qué ve cada quien.

const exigir = <T>(r: { data: T | null; error: unknown }): T => {
  if (r.error) throw new Error('No se pudo consultar el CRM. Intenta de nuevo.');
  return r.data as T;
};
const trozos = <T>(xs: T[], n = 150) =>
  Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const hoyMx = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Mexico_City' }).format(new Date());
export const diasHasta = (fecha: string, hoy = hoyMx()) =>
  Math.round((Date.parse(`${fecha}T00:00:00Z`) - Date.parse(`${hoy}T00:00:00Z`)) / 86_400_000);

export const aEtapaGeneral = (e: Etapa): EtapaGeneral => ({
  id: e.id,
  clave: e.clave ?? e.id,
  numero: e.numero,
  nombre: e.nombre,
  area: e.area ?? 'ventas',
  funcion: e.funcion === 'aprobacion_locales' ? 'Aprobación de locales' : undefined,
  funcionClave: e.funcion === 'aprobacion_locales' ? 'aprobacion_locales' : undefined,
  card: e.card,
  tipo: e.tipo,
  opcional: e.opcional,
  provisional: e.provisional,
  paso: e.paso,
  carril: e.carril,
  orden: e.orden,
});

export async function etapasGenerales(db: Db): Promise<EtapaGeneral[]> {
  const r = exigir(
    await db.from('crm_etapas').select('*').eq('embudo', 'general').eq('activa', true).order('orden'),
  ) as Etapa[];
  return r.map(aEtapaGeneral);
}

/** Nombres de perfiles (para mostrar quién hizo qué). */
export async function nombres(db: Db, ids: (string | null | undefined)[]) {
  const unicos = [...new Set(ids.filter((x): x is string => !!x))];
  const m = new Map<string, string>();
  for (const t of trozos(unicos)) {
    const r = exigir(await db.from('perfiles').select('user_id,nombre').in('user_id', t)) as {
      user_id: string;
      nombre: string;
    }[];
    for (const p of r) m.set(p.user_id, p.nombre);
  }
  return m;
}

/** Mis áreas y si soy head (para mostrar u ocultar acciones; la base vuelve a decidir). */
export async function misAreas(db: Db, userId: string) {
  const r = exigir(await db.from('crm_membresias').select('*').eq('user_id', userId)) as Membresia[];
  return {
    areas: r,
    esHead: r.some((m) => m.rol === 'head'),
    claves: r.filter((m) => m.rol !== 'lectura').map((m) => m.area as ClaveArea),
    funciones: r.flatMap((m) => m.funciones),
  };
}

type FilaLigera = { id: string; etapa_id: string; actualizado_en: string };

/**
 * Pipeline: cards de cada columna (las más recientes primero, hasta POR_COLUMNA) y totales por etapa.
 * Cada etapa se consulta por separado y todas a la vez (conteo + primeras N): antes se leían los
 * ~3,700 leads en páginas de 500, una tras otra, solo para quedarse con 50 por columna.
 */
export async function pipeline(db: Db, { soloMuestra }: { soloMuestra?: boolean } = {}) {
  const etapas = await etapasGenerales(db);
  const fuentes = (e: EtapaGeneral) =>
    (e.card ? [e.card] : (['franquiciatario', 'sucursal'] as const)).map((tipo) => ({ e, tipo }));
  const consulta = (tipo: TipoCard, columnas: string, opciones?: { count: 'exact'; head: true }) => {
    let q =
      tipo === 'franquiciatario'
        ? db.from('crm_franquiciatarios').select(columnas, opciones)
        : db.from('crm_tiendas').select(columnas, opciones).eq('embudo', 'general');
    q = q.is('archivado_en', null);
    return soloMuestra === false ? q.eq('muestra', false) : q;
  };
  const porFuente = await Promise.all(
    etapas.flatMap(fuentes).map(async ({ e, tipo }) => {
      const [conteo, primeras] = await Promise.all([
        consulta(tipo, 'id', { count: 'exact', head: true }).eq('etapa_id', e.id),
        consulta(tipo, 'id,etapa_id,actualizado_en')
          .eq('etapa_id', e.id)
          .order('actualizado_en', { ascending: false })
          .limit(POR_COLUMNA),
      ]);
      if (conteo.error || primeras.error) throw new Error('No se pudo consultar el CRM. Intenta de nuevo.');
      return {
        etapa: e.id,
        total: conteo.count ?? 0,
        filas: ((primeras.data ?? []) as unknown as FilaLigera[]).map((f) => ({ ...f, tipo })),
      };
    }),
  );
  const muestra =
    soloMuestra === false
      ? 0
      : (
          await Promise.all(
            (['franquiciatario', 'sucursal'] as const).map((tipo) =>
              consulta(tipo, 'id', { count: 'exact', head: true }).eq('muestra', true),
            ),
          )
        ).reduce((s, r) => s + (r.count ?? 0), 0);
  const totales: Record<string, number> = {};
  const porEtapa = new Map<string, (FilaLigera & { tipo: TipoCard })[]>();
  for (const f of porFuente) {
    totales[f.etapa] = (totales[f.etapa] ?? 0) + f.total;
    porEtapa.set(f.etapa, [...(porEtapa.get(f.etapa) ?? []), ...f.filas]);
  }
  const visibles = [...porEtapa.values()].flatMap((xs) =>
    xs.sort((a, b) => b.actualizado_en.localeCompare(a.actualizado_en)).slice(0, POR_COLUMNA),
  );
  const cards = await armarCards(db, visibles);
  return { etapas, cards, totales, muestra };
}

/** Datos de las cards a mostrar: nombre, candado, vencimiento, contadores y último movimiento. */
export async function armarCards(db: Db, lista: { id: string; tipo: TipoCard }[]): Promise<CardPipeline[]> {
  const idsF = lista.filter((c) => c.tipo === 'franquiciatario').map((c) => c.id);
  const idsS = lista.filter((c) => c.tipo === 'sucursal').map((c) => c.id);
  const ids = [...idsF, ...idsS];
  const fs: Franquiciatario[] = [];
  const ss: Tienda[] = [];
  const candados: CandadoCard[] = [];
  const venc: VencimientoCard[] = [];
  const archivos: { franquiciatario_id: string | null; tienda_id: string | null }[] = [];
  const notas: { franquiciatario_id: string | null; tienda_id: string | null }[] = [];
  const hist: Pick<Historial, 'tienda_id' | 'franquiciatario_id' | 'actor_nombre' | 'fecha' | 'origen'>[] =
    [];
  await Promise.all([
    ...trozos(idsF).map(async (t) =>
      fs.push(
        ...(exigir(await db.from('crm_franquiciatarios').select('*').in('id', t)) as Franquiciatario[]),
      ),
    ),
    ...trozos(idsS).map(async (t) =>
      ss.push(...(exigir(await db.from('crm_tiendas').select('*').in('id', t)) as Tienda[])),
    ),
    ...trozos(ids).map(async (t) =>
      candados.push(
        ...(exigir(await db.from('crm_v_candados').select('*').in('card_id', t)) as CandadoCard[]),
      ),
    ),
    ...trozos(idsS).map(async (t) =>
      venc.push(
        ...(exigir(await db.from('crm_v_vencimientos').select('*').in('tienda_id', t)) as VencimientoCard[]),
      ),
    ),
    // Archivos, notas e historial de cada trozo van a la vez (antes uno tras otro).
    ...trozos(idsF).flatMap((t) => [
      db
        .from('crm_archivos')
        .select('franquiciatario_id,tienda_id')
        .in('franquiciatario_id', t)
        .is('archivado_en', null)
        .then((r) => archivos.push(...(exigir(r) as typeof archivos))),
      db
        .from('crm_notas')
        .select('franquiciatario_id,tienda_id')
        .in('franquiciatario_id', t)
        .is('archivado_en', null)
        .then((r) => notas.push(...(exigir(r) as typeof notas))),
      db
        .from('crm_historial')
        .select('tienda_id,franquiciatario_id,actor_nombre,fecha,origen')
        .in('franquiciatario_id', t)
        .neq('origen', 'importacion')
        .order('fecha', { ascending: false })
        .limit(t.length * 3)
        .then((r) => hist.push(...(exigir(r) as typeof hist))),
    ]),
    // Archivos, notas e historial de cada trozo van a la vez (antes uno tras otro).
    ...trozos(idsS).flatMap((t) => [
      db
        .from('crm_archivos')
        .select('franquiciatario_id,tienda_id')
        .in('tienda_id', t)
        .is('archivado_en', null)
        .then((r) => archivos.push(...(exigir(r) as typeof archivos))),
      db
        .from('crm_notas')
        .select('franquiciatario_id,tienda_id')
        .in('tienda_id', t)
        .is('archivado_en', null)
        .then((r) => notas.push(...(exigir(r) as typeof notas))),
      db
        .from('crm_historial')
        .select('tienda_id,franquiciatario_id,actor_nombre,fecha,origen')
        .in('tienda_id', t)
        .neq('origen', 'importacion')
        .order('fecha', { ascending: false })
        .limit(t.length * 3)
        .then((r) => hist.push(...(exigir(r) as typeof hist))),
    ]),
  ]);
  const cuenta = (
    xs: { franquiciatario_id: string | null; tienda_id: string | null }[],
    id: string,
    tipo: TipoCard,
  ) =>
    xs.filter((x) => (tipo === 'franquiciatario' ? x.franquiciatario_id === id : x.tienda_id === id)).length;
  const candadoDe = new Map(candados.map((c) => [c.card_id, c]));
  const hoy = hoyMx();
  const tipoVenc: Record<string, Vencimiento['tipo']> = {
    cof: 'cof',
    apertura_5_habiles: 'apertura_5_habiles',
    limite_120: 'limite_120',
    limite_vencido: 'limite_vencido',
    cof_tardia: 'limite_120',
    transferencia: 'transferencia',
  };
  const etiquetaVenc: Record<string, string> = {
    cof: 'COF firmada',
    apertura_5_habiles: 'Fecha confirmada a Legal',
    limite_120: 'Límite de apertura',
    limite_vencido: 'Límite vencido: multa',
    cof_tardia: 'COF tardía',
    transferencia: 'Transferencia a Proyectos',
  };
  const ultimo = (id: string, tipo: TipoCard) => {
    const h = hist.find((x) =>
      tipo === 'franquiciatario' ? x.franquiciatario_id === id : x.tienda_id === id,
    );
    return h ? { actor: h.actor_nombre ?? (h.origen === 'zoho' ? 'Zoho' : 'Sistema'), fecha: h.fecha } : null;
  };
  const armar = (
    id: string,
    tipo: TipoCard,
    base: {
      nombre: string;
      franquiciatario: string | null;
      ciudad: string | null;
      etapa_id: string;
      muestra: boolean;
      version: number;
      etapa_previa_id: string | null;
    },
  ): CardPipeline => {
    const c = candadoDe.get(id);
    const v = venc.filter((x) => x.tienda_id === id).sort((a, b) => a.fecha.localeCompare(b.fecha))[0];
    return {
      id,
      tipo,
      nombre: base.nombre,
      franquiciatario: base.franquiciatario,
      ciudad: base.ciudad,
      etapaId: base.etapa_id,
      version: base.version,
      etapaPreviaId: base.etapa_previa_id,
      requisitos: {
        total: c?.total ?? 0,
        listos: c?.listos ?? 0,
        faltante: c?.faltante ? { nombre: c.faltante, area: c.faltante_area ?? 'ventas' } : null,
      },
      liberado: c?.liberado ?? false,
      vencimiento: v
        ? {
            tipo: tipoVenc[v.tipo],
            etiqueta: etiquetaVenc[v.tipo],
            fecha: v.fecha,
            dias: diasHasta(v.fecha, hoy),
          }
        : null,
      archivos: cuenta(archivos, id, tipo),
      notas: cuenta(notas, id, tipo),
      ultimo: ultimo(id, tipo),
      muestra: base.muestra,
    };
  };
  const salida = new Map<string, CardPipeline>();
  for (const f of fs)
    salida.set(
      f.id,
      armar(f.id, 'franquiciatario', {
        nombre: f.nombre,
        franquiciatario: null,
        ciudad: f.ciudad_interes,
        etapa_id: f.etapa_id,
        muestra: f.muestra,
        version: f.version,
        etapa_previa_id: f.etapa_previa_id,
      }),
    );
  for (const s of ss)
    salida.set(
      s.id,
      armar(s.id, 'sucursal', {
        nombre: s.nombre,
        franquiciatario: s.franquiciatario,
        ciudad: s.ciudad,
        etapa_id: s.etapa_id,
        muestra: s.muestra,
        version: s.version,
        etapa_previa_id: s.etapa_previa_id,
      }),
    );
  return lista.map((c) => salida.get(c.id)).filter((c): c is CardPipeline => !!c);
}

export interface ExpedienteUnificado {
  tipo: TipoCard;
  card: CardPipeline;
  franquiciatario: Franquiciatario | null;
  sucursal: Tienda | null;
  etapa: EtapaGeneral;
  etapas: EtapaGeneral[];
  requisitos: RequisitoCard[];
  archivos: Archivo[];
  notas: Nota[];
  historial: Historial[];
  liberaciones: Liberacion[];
  sucursales: { id: string; nombre: string; etapa: EtapaGeneral }[];
  nombres: Record<string, string>;
  fiscal: FranquiciatarioFiscal | null;
  veSensibles: boolean;
  /** Personas de Ventas (head o miembro): a quién puede reasignar un head el lead. */
  vendedores: { id: string; nombre: string }[];
}

/**
 * Los requisitos que se cumplen con un dato (fecha límite, Jestor…) no tienen cumplimiento propio: quién y cuándo
 * salen del último cambio de ese campo en la bitácora de la card.
 */
export function autorDeCampos(requisitos: RequisitoCard[], historial: Historial[]): RequisitoCard[] {
  return requisitos.map((r) => {
    if (!r.campo || r.cumplido_por || r.estado !== 'validado') return r;
    const llaves = r.campo === 'contacto' ? ['correo', 'telefono'] : [r.campo];
    const h = historial.find(
      (x) =>
        (x.entidad === 'crm_franquiciatarios' || x.entidad === 'crm_tiendas') &&
        x.actor_id &&
        x.cambios &&
        llaves.some((k) => k in (x.cambios as Record<string, unknown>)),
    );
    return h
      ? {
          ...r,
          cumplido_por: h.actor_id,
          cumplido_en: h.fecha,
          validado_por: h.actor_id,
          validado_en: h.fecha,
        }
      : r;
  });
}

/** Expediente completo de una card (franquiciatario o sucursal). Nulo si no existe o no se puede ver. */
export async function expedienteCard(
  db: Db,
  tipo: TipoCard,
  id: string,
): Promise<ExpedienteUnificado | null> {
  const fila =
    tipo === 'franquiciatario'
      ? (exigir(
          await db.from('crm_franquiciatarios').select('*').eq('id', id).maybeSingle(),
        ) as Franquiciatario | null)
      : (exigir(
          await db.from('crm_tiendas').select('*').eq('id', id).eq('embudo', 'general').maybeSingle(),
        ) as Tienda | null);
  if (!fila) return null;
  const relacion = tipo === 'franquiciatario' ? 'franquiciatario_id' : 'tienda_id';
  const [etapas, [card], req, archivos, notas, historial, liberaciones, sucursales, franq, fiscal, ve] =
    await Promise.all([
      etapasGenerales(db),
      armarCards(db, [{ id, tipo }]),
      db.rpc('crm_requisitos_de', { p_tipo: tipo, p_card: id, p_todas: true }),
      db.from('crm_archivos').select('*').eq(relacion, id).order('subido_en', { ascending: false }),
      db
        .from('crm_notas')
        .select('*')
        .eq(relacion, id)
        .is('archivado_en', null)
        .order('creado_en', { ascending: false }),
      db.from('crm_historial').select('*').eq(relacion, id).order('fecha', { ascending: false }).limit(300),
      db.from('crm_liberaciones').select('*').eq('card_id', id).order('liberado_en', { ascending: false }),
      tipo === 'franquiciatario'
        ? db
            .from('crm_tiendas')
            .select('id,nombre,etapa_id')
            .eq('franquiciatario_id', id)
            .is('archivado_en', null)
        : Promise.resolve({ data: [], error: null }),
      tipo === 'sucursal' && (fila as Tienda).franquiciatario_id
        ? db
            .from('crm_franquiciatarios')
            .select('*')
            .eq('id', (fila as Tienda).franquiciatario_id!)
            .maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      // La RLS devuelve vacío a quien no ve datos sensibles.
      tipo === 'franquiciatario'
        ? db.from('crm_franquiciatario_fiscal').select('*').eq('franquiciatario_id', id).maybeSingle()
        : Promise.resolve({ data: null, error: null }),
      db.rpc('crm_ve_sensibles'),
    ]);
  const hist = exigir(historial) as Historial[];
  const requisitos = autorDeCampos(exigir(req) as RequisitoCard[], hist);
  const ventas =
    tipo === 'franquiciatario'
      ? (((
          await db
            .from('crm_membresias')
            .select('user_id')
            .eq('area', 'ventas')
            .in('rol', ['head', 'miembro'])
        ).data ?? []) as { user_id: string }[])
      : [];
  const libs = exigir(liberaciones) as Liberacion[];
  const quienes = await nombres(db, [
    ...requisitos.flatMap((r) => [r.cumplido_por, r.validado_por]),
    ...libs.map((l) => l.liberado_por),
    ...(exigir(archivos) as Archivo[]).map((a) => a.subido_por),
    ...(exigir(notas) as Nota[]).map((n) => n.autor_id),
    fila.responsable_id,
    ...ventas.map((v) => v.user_id),
  ]);
  const etapa = etapas.find((e) => e.id === fila.etapa_id)!;
  return {
    tipo,
    card,
    franquiciatario:
      tipo === 'franquiciatario' ? (fila as Franquiciatario) : (exigir(franq) as Franquiciatario | null),
    sucursal: tipo === 'sucursal' ? (fila as Tienda) : null,
    etapa,
    etapas,
    requisitos,
    archivos: exigir(archivos) as Archivo[],
    notas: exigir(notas) as Nota[],
    historial: hist,
    liberaciones: libs,
    sucursales: (exigir(sucursales) as { id: string; nombre: string; etapa_id: string }[]).map((s) => ({
      id: s.id,
      nombre: s.nombre,
      etapa: etapas.find((e) => e.id === s.etapa_id)!,
    })),
    nombres: Object.fromEntries(quienes),
    fiscal: exigir(fiscal) as FranquiciatarioFiscal | null,
    veSensibles: exigir(ve) === true,
    vendedores: ventas
      .map((v) => ({ id: v.user_id, nombre: quienes.get(v.user_id) ?? '' }))
      .filter((v) => v.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es')),
  };
}

/** Vencimientos y avisos (Panel, Mis pendientes y Vencimientos). */
export async function vencimientos(db: Db) {
  const [v, a] = await Promise.all([
    db.from('crm_v_vencimientos').select('*').order('fecha'),
    db.from('crm_avisos').select('*').order('fecha_objetivo'),
  ]);
  const hoy = hoyMx();
  return {
    vencimientos: (exigir(v) as VencimientoCard[]).map((x) => ({ ...x, dias: diasHasta(x.fecha, hoy) })),
    avisos: exigir(a) as Aviso[],
  };
}

export interface FiltrosBitacora {
  actor?: string;
  accion?: string;
  area?: string;
  desde?: string;
  hasta?: string;
  buscar?: string;
  pagina?: number;
  conMuestra?: boolean;
}
export const POR_PAGINA_BITACORA = 50;

/** Bitácora global con filtros, paginada en el servidor (más reciente primero). */
export async function bitacora(db: Db, f: FiltrosBitacora) {
  let q = db
    .from('crm_historial')
    .select('*', { count: 'exact' })
    .order('fecha', { ascending: false })
    .order('id', { ascending: false });
  if (f.actor) q = q.eq('actor_id', f.actor);
  if (f.accion) q = q.eq('accion', f.accion as Historial['accion']);
  if (f.area) q = q.ilike('actor_area', `%${f.area}%`);
  if (f.desde) q = q.gte('fecha', `${f.desde}T00:00:00-06:00`);
  if (f.hasta) q = q.lte('fecha', `${f.hasta}T23:59:59-06:00`);
  if (f.buscar) q = q.ilike('resumen', `%${f.buscar.replace(/[%_,()"]/g, ' ')}%`);
  if (!f.conMuestra) q = q.not('origen', 'in', '(importacion,zoho)');
  const pagina = Math.max(1, f.pagina ?? 1);
  const r = await q.range((pagina - 1) * POR_PAGINA_BITACORA, pagina * POR_PAGINA_BITACORA - 1);
  return { filas: exigir(r) as Historial[], total: r.count ?? 0, pagina };
}
