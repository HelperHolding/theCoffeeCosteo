import type { Db } from '../portal/consultas';
import type { Database } from '../supabase/database.types';
import type { TarjetaTienda } from './kanban';
import type { Etapa } from './tipos';

type Tablas = Database['public']['Tables'];
type TablaCrm = Extract<keyof Tablas, `crm_${string}`>;

/** Los filtros que usan las lecturas masivas (subconjunto del constructor de PostgREST). */
interface Filtro {
  eq(columna: string, valor: unknown): Filtro;
  neq(columna: string, valor: unknown): Filtro;
  is(columna: string, valor: null | boolean): Filtro;
  not(columna: string, operador: string, valor: unknown): Filtro;
}
type Consulta = Filtro & {
  range(desde: number, hasta: number): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Lee todas las filas (paginado bajo el límite de PostgREST) con solo las columnas pedidas. */
export async function leerTodo<R>(
  db: Db,
  tabla: TablaCrm,
  columnas: string,
  filtro?: (q: Filtro) => Filtro,
): Promise<R[]> {
  const filas: R[] = [];
  for (let desde = 0; ; desde += 500) {
    let q = db.from(tabla).select(columnas).order('id') as unknown as Consulta;
    if (filtro) q = filtro(q) as Consulta;
    const r = await q.range(desde, desde + 499);
    if (r.error) throw new Error('No se pudo consultar el CRM. Intenta de nuevo.');
    const pagina = r.data as unknown as R[];
    filas.push(...pagina);
    if (pagina.length < 500) return filas;
  }
}

const contar = (filas: { tienda_id: string | null }[]) => {
  const m = new Map<string, number>();
  for (const f of filas) if (f.tienda_id) m.set(f.tienda_id, (m.get(f.tienda_id) ?? 0) + 1);
  return m;
};

/** Etapas y tarjetas del pipeline de tiendas con sus contadores. */
export async function tablero(db: Db) {
  const [etapas, tiendas, notas, archivos, checklists, items, actividades] = await Promise.all([
    leerTodo<Pick<Etapa, 'id' | 'nombre' | 'orden' | 'tipo' | 'activa' | 'embudo'>>(
      db,
      'crm_etapas',
      'id,nombre,orden,tipo,activa,embudo',
      (q) => q.eq('embudo', 'tiendas'),
    ),
    leerTodo<Omit<TarjetaTienda, 'notas' | 'archivos' | 'checklist' | 'actividadesAbiertas'>>(
      db,
      'crm_tiendas',
      'id,nombre,etapa_id,posicion,version,franquiciatario,ciudad,tipo_franquicia,fecha_programada_arranque,revisar',
      (q) => q.is('archivado_en', null),
    ),
    leerTodo<{ tienda_id: string | null }>(db, 'crm_notas', 'tienda_id', (q) =>
      q.not('tienda_id', 'is', null).is('archivado_en', null),
    ),
    leerTodo<{ tienda_id: string | null }>(db, 'crm_archivos', 'tienda_id', (q) =>
      q.not('tienda_id', 'is', null).is('archivado_en', null),
    ),
    leerTodo<{ id: string; tienda_id: string }>(db, 'crm_checklists', 'id,tienda_id', (q) =>
      q.is('archivado_en', null),
    ),
    leerTodo<{ checklist_id: string; hecho: boolean }>(db, 'crm_checklist_items', 'checklist_id,hecho'),
    leerTodo<{ tienda_id: string | null }>(db, 'crm_actividades', 'tienda_id', (q) =>
      q.not('tienda_id', 'is', null).neq('estado', 'Completed').is('archivado_en', null),
    ),
  ]);
  const nNotas = contar(notas);
  const nArchivos = contar(archivos);
  const nActividades = contar(actividades);
  const tiendaDeLista = new Map(checklists.map((c) => [c.id, c.tienda_id]));
  const avance = new Map<string, { hechos: number; total: number }>();
  for (const i of items) {
    const t = tiendaDeLista.get(i.checklist_id);
    if (!t) continue;
    const a = avance.get(t) ?? { hechos: 0, total: 0 };
    a.total++;
    if (i.hecho) a.hechos++;
    avance.set(t, a);
  }
  return {
    etapas: etapas.filter((e) => e.activa),
    tarjetas: tiendas.map((t): TarjetaTienda => ({
      ...t,
      revisar: t.revisar ?? [],
      notas: nNotas.get(t.id) ?? 0,
      archivos: nArchivos.get(t.id) ?? 0,
      checklist: avance.get(t.id) ?? { hechos: 0, total: 0 },
      actividadesAbiertas: nActividades.get(t.id) ?? 0,
    })),
  };
}

/** Todo lo que muestra el expediente de una tienda: dos rondas de consultas en paralelo. */
export async function expediente(db: Db, id: string) {
  // La tienda va en la misma ronda que sus listas (todas filtran por tienda_id); si no existe, se descartan.
  const [t, etapas, notas, actividades, checklists, archivos, historial, ligas] = await Promise.all([
    db.from('crm_tiendas').select('*').eq('id', id).maybeSingle(),
    leerTodo<Pick<Etapa, 'id' | 'nombre' | 'orden' | 'tipo' | 'activa' | 'embudo'>>(
      db,
      'crm_etapas',
      'id,nombre,orden,tipo,activa,embudo',
      (q) => q.eq('embudo', 'tiendas'),
    ),
    db
      .from('crm_notas')
      .select('*')
      .eq('tienda_id', id)
      .is('archivado_en', null)
      .order('creado_en', { ascending: false }),
    db
      .from('crm_actividades')
      .select('*')
      .eq('tienda_id', id)
      .is('archivado_en', null)
      .order('fecha_vencimiento'),
    db.from('crm_checklists').select('*').eq('tienda_id', id).is('archivado_en', null).order('orden'),
    db
      .from('crm_archivos')
      .select('*')
      .eq('tienda_id', id)
      .is('archivado_en', null)
      .order('subido_en', { ascending: false }),
    db.from('crm_historial').select('*').eq('tienda_id', id).order('fecha', { ascending: false }).limit(200),
    db.from('crm_tienda_contactos').select('contacto_id').eq('tienda_id', id),
  ]);
  if (t.error) throw new Error('No se pudo consultar la tienda. Intenta de nuevo.');
  if (!t.data) return null;
  for (const r of [notas, actividades, checklists, archivos, historial, ligas])
    if (r.error) throw new Error('No se pudo consultar el expediente. Intenta de nuevo.');
  const idsListas = (checklists.data ?? []).map((c) => c.id);
  const idsContactos = (ligas.data ?? []).map((l) => l.contacto_id);
  const [items, contactos] = await Promise.all([
    idsListas.length
      ? db.from('crm_checklist_items').select('*').in('checklist_id', idsListas).order('orden')
      : Promise.resolve({ data: [], error: null }),
    idsContactos.length
      ? db.from('crm_contactos').select('id,nombre,apellidos,correo,telefono,puesto').in('id', idsContactos)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (items.error || contactos.error)
    throw new Error('No se pudo consultar el expediente. Intenta de nuevo.');
  return {
    tienda: t.data,
    etapas: etapas.filter((e) => e.activa).sort((a, b) => a.orden - b.orden),
    notas: notas.data ?? [],
    actividades: actividades.data ?? [],
    checklists: (checklists.data ?? []).map((c) => ({
      ...c,
      items: (items.data ?? []).filter((i) => i.checklist_id === c.id),
    })),
    archivos: archivos.data ?? [],
    historial: historial.data ?? [],
    contactos: contactos.data ?? [],
  };
}
export type Expediente = NonNullable<Awaited<ReturnType<typeof expediente>>>;
