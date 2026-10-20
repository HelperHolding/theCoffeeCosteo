'use server';
import { revalidatePath } from 'next/cache';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import { camposActividad, camposTienda, validar, validarArchivo } from '@/lib/crm/validacion';
import type { Database } from '@/lib/supabase/database.types';

type Resultado<T = undefined> =
  { error: string } | ({ error?: undefined } & (T extends undefined ? object : T));
type Tablas = Database['public']['Tables'];

/** Sesión para escribir: exige nivel de edición (la RLS lo vuelve a exigir en la base). */
async function editor() {
  const s = await sesionCrm(false);
  if (!puedeEditarCrm(s.accesos)) throw new Error('Tu acceso al CRM es de solo lectura.');
  return s;
}
const fallo = (e: unknown): { error: string } => ({
  error: e instanceof Error ? e.message : 'No se pudo completar la operación. Intenta de nuevo.',
});
const mensaje = (e: { code?: string }) =>
  e.code === '40001'
    ? 'La tienda cambió mientras tanto. Recarga para ver la versión actual.'
    : e.code === '42501'
      ? 'No tienes permiso para este cambio.'
      : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
const refrescar = (tienda?: string) => {
  revalidatePath('/crm', 'layout');
  if (tienda) revalidatePath(`/crm/tiendas/${tienda}`);
};

export async function moverTienda(
  tienda: string,
  etapa: string,
  posicion: number | null,
  version: number,
): Promise<Resultado<{ version: number; posicion: number }>> {
  try {
    const { db } = await editor();
    let p = posicion;
    if (p === null) {
      // Sin espacio entre vecinos: se reparte la columna y la tarjeta queda al final.
      await db.rpc('crm_renumerar_etapa', { p_etapa: etapa });
      const ultima = await db
        .from('crm_tiendas')
        .select('posicion')
        .eq('etapa_id', etapa)
        .is('archivado_en', null)
        .order('posicion', { ascending: false })
        .limit(1);
      p = (ultima.data?.[0]?.posicion ?? 0) + 1024;
    }
    const r = await db.rpc('crm_mover_tienda', {
      p_tienda: tienda,
      p_etapa: etapa,
      p_posicion: p,
      p_version: version,
    });
    if (r.error) return { error: mensaje(r.error) };
    refrescar(tienda);
    return { version: r.data.version, posicion: r.data.posicion };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearTienda(datos: Record<string, unknown>): Promise<Resultado<{ id: string }>> {
  try {
    const { db, perfil } = await editor();
    const d = validar(camposTienda, datos) as Tablas['crm_tiendas']['Insert'];
    const etapa = String(datos.etapa_id ?? '');
    const r = await db
      .from('crm_tiendas')
      .insert({ ...d, etapa_id: etapa, responsable_id: perfil.user_id })
      .select('id')
      .single();
    if (r.error) return { error: mensaje(r.error) };
    refrescar();
    return { id: r.data.id };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarTienda(
  id: string,
  version: number,
  datos: Record<string, unknown>,
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const d = validar(camposTienda, datos) as Tablas['crm_tiendas']['Update'];
    const r = await db.from('crm_tiendas').update(d).eq('id', id).eq('version', version).select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: mensaje({ code: '40001' }) };
    refrescar(id);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function archivarTienda(id: string, version: number): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_tiendas')
      .update({ archivado_en: new Date().toISOString() })
      .eq('id', id)
      .eq('version', version)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: mensaje({ code: '40001' }) };
    refrescar(id);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

type Relacion = { tienda_id?: string; prospecto_id?: string; contacto_id?: string };
const relacion = (r: Relacion) => {
  const ids = Object.entries(r).filter(([, v]) => typeof v === 'string' && v);
  if (ids.length !== 1) throw new Error('La nota o actividad debe pertenecer a un solo registro.');
  return Object.fromEntries(ids) as Relacion;
};

export async function agregarNota(rel: Relacion, contenido: string): Promise<Resultado> {
  try {
    const { db, perfil } = await editor();
    const texto = contenido.trim();
    if (!texto) return { error: 'Escribe la nota.' };
    if (texto.length > 10000) return { error: 'La nota es demasiado larga (máximo 10,000 caracteres).' };
    const r = await db
      .from('crm_notas')
      .insert({ ...relacion(rel), contenido: texto, autor_id: perfil.user_id });
    if (r.error) return { error: mensaje(r.error) };
    refrescar(rel.tienda_id);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function crearActividad(rel: Relacion, datos: Record<string, unknown>): Promise<Resultado> {
  try {
    const { db, perfil } = await editor();
    const d = validar(camposActividad, datos) as Tablas['crm_actividades']['Insert'];
    if (!d.asunto) return { error: 'Escribe el asunto de la actividad.' };
    const r = await db
      .from('crm_actividades')
      .insert({ ...d, ...relacion(rel), responsable_id: perfil.user_id });
    if (r.error) return { error: mensaje(r.error) };
    refrescar(rel.tienda_id);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEstadoActividad(
  id: string,
  version: number,
  estado: string,
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const d = validar(camposActividad, { estado }) as Tablas['crm_actividades']['Update'];
    const r = await db
      .from('crm_actividades')
      .update({ ...d, cerrada_en: estado === 'Completed' ? new Date().toISOString() : null })
      .eq('id', id)
      .eq('version', version)
      .select('tienda_id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length)
      return { error: 'La actividad cambió mientras tanto. Recarga para ver la versión actual.' };
    refrescar(r.data[0].tienda_id ?? undefined);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function crearChecklist(tienda: string, nombre: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    if (!nombre.trim()) return { error: 'Escribe el nombre de la lista.' };
    const r = await db
      .from('crm_checklists')
      .insert({ tienda_id: tienda, nombre: nombre.trim().slice(0, 120) });
    if (r.error) return { error: mensaje(r.error) };
    refrescar(tienda);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function agregarElemento(tienda: string, checklist: string, texto: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    if (!texto.trim()) return { error: 'Escribe el elemento.' };
    const ultimo = await db
      .from('crm_checklist_items')
      .select('orden')
      .eq('checklist_id', checklist)
      .order('orden', { ascending: false })
      .limit(1);
    const r = await db.from('crm_checklist_items').insert({
      checklist_id: checklist,
      texto: texto.trim().slice(0, 300),
      orden: (ultimo.data?.[0]?.orden ?? 0) + 1024,
    });
    if (r.error) return { error: mensaje(r.error) };
    refrescar(tienda);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function marcarElemento(tienda: string, id: string, hecho: boolean): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db.from('crm_checklist_items').update({ hecho }).eq('id', id).select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: 'No se encontró el elemento.' };
    refrescar(tienda);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

/** Paso 1 de la subida: registra el archivo y devuelve la ruta (generada por la base) para subirlo. */
export async function prepararArchivo(
  tienda: string,
  archivo: { nombre: string; mime: string; tamano: number },
  seccion = 'adjuntos',
): Promise<Resultado<{ id: string; ruta: string }>> {
  try {
    const { db } = await editor();
    validarArchivo(archivo.nombre, archivo.mime, archivo.tamano);
    const r = await db
      .from('crm_archivos')
      .insert({
        tienda_id: tienda,
        nombre: archivo.nombre.trim(),
        mime: archivo.mime,
        tamano: archivo.tamano,
        seccion: seccion.slice(0, 80),
        // La base sobrescribe la ruta con una no predecible; este valor solo cumple el NOT NULL.
        ruta: 'pendiente',
      })
      .select('id,ruta')
      .single();
    if (r.error) return { error: mensaje(r.error) };
    return { id: r.data.id, ruta: r.data.ruta };
  } catch (e) {
    return fallo(e);
  }
}

/** Paso 2: confirma la subida (o archiva la fila si falló, para no dejar fantasmas visibles). */
export async function confirmarArchivo(tienda: string, id: string, subido: boolean): Promise<Resultado> {
  try {
    const { db } = await editor();
    if (!subido)
      await db.from('crm_archivos').update({ archivado_en: new Date().toISOString() }).eq('id', id);
    refrescar(tienda);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function archivarArchivo(tienda: string, id: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_archivos')
      .update({ archivado_en: new Date().toISOString() })
      .eq('id', id)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    refrescar(tienda);
    return {};
  } catch (e) {
    return fallo(e);
  }
}

/** Liga de descarga corta (60 s), firmada después de validar la sesión y la RLS del archivo. */
export async function enlaceArchivo(id: string): Promise<Resultado<{ url: string }>> {
  try {
    const { db } = await sesionCrm(false);
    const a = await db
      .from('crm_archivos')
      .select('ruta,nombre')
      .eq('id', id)
      .is('archivado_en', null)
      .maybeSingle();
    if (a.error || !a.data) return { error: 'No se encontró el archivo.' };
    const r = await db.storage
      .from('crm-archivos')
      .createSignedUrl(a.data.ruta, 60, { download: a.data.nombre });
    if (r.error || !r.data) return { error: 'No se pudo preparar la descarga. Intenta de nuevo.' };
    return { url: r.data.signedUrl };
  } catch (e) {
    return fallo(e);
  }
}

export async function cambiarEtapaProspecto(
  id: string,
  version: number,
  etapa: string | null,
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_prospectos')
      .update({ etapa_id: etapa || null })
      .eq('id', id)
      .eq('version', version)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length)
      return { error: 'El prospecto cambió mientras tanto. Recarga para ver la versión actual.' };
    revalidatePath('/crm', 'layout');
    return {};
  } catch (e) {
    return fallo(e);
  }
}
