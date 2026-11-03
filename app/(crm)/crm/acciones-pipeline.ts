'use server';
import { sesionCrm } from '@/lib/supabase/sesion';
import { puedeEditarCrm } from '@/lib/portal/modulos';
import {
  camposFranquiciatario,
  camposSucursal,
  TIPOS_DOCUMENTO,
  validar,
  validarArchivo,
} from '@/lib/crm/validacion';
import type { ClaveArea, Requisito, RolArea, TipoCard } from '@/lib/crm/tipos';

// Escrituras del CRM Unificado. Los candados, permisos por área y la bitácora los aplica la base
// (crm_avanzar, crm_cumplir, …); aquí solo se valida la forma y se traducen los errores.

type Resultado<T = undefined> =
  { error: string } | ({ error?: undefined } & (T extends undefined ? object : T));

async function editor() {
  const s = await sesionCrm(false);
  if (!puedeEditarCrm(s.accesos)) throw new Error('Tu acceso al CRM es de solo lectura.');
  return s;
}
const fallo = (e: unknown): { error: string } => ({
  error: e instanceof Error ? e.message : 'No se pudo completar la operación. Intenta de nuevo.',
});
/** Los mensajes de la base ya están en español y dicen qué falta; los demás se generalizan. */
const mensaje = (e: { code?: string; message?: string }) =>
  e.code === '40001'
    ? 'La card cambió mientras la veías. Recarga para ver la versión actual.'
    : ['42501', '22023', '23514', 'P0002'].includes(e.code ?? '') && e.message
      ? e.message
      : e.code === '42501'
        ? 'No tienes permiso para este cambio.'
        : 'No se pudo guardar. Revisa la conexión e intenta de nuevo.';
const tipoValido = (t: string): t is TipoCard => t === 'franquiciatario' || t === 'sucursal';

export async function avanzarCard(
  tipo: TipoCard,
  id: string,
  destino: string,
  version: number,
  motivo?: string | null,
  nombreSucursal?: string | null,
): Promise<Resultado<{ version: number; sucursal: string | null }>> {
  try {
    if (!tipoValido(tipo)) return { error: 'Tipo de card no válido.' };
    const { db } = await editor();
    const r = await db.rpc('crm_avanzar', {
      p_tipo: tipo,
      p_card: id,
      p_destino: destino,
      p_version: version,
      p_motivo: motivo?.trim().slice(0, 1000) || null,
      p_nombre_sucursal: nombreSucursal?.trim().slice(0, 200) || null,
    });
    if (r.error) return { error: mensaje(r.error) };
    const d = r.data as { version: number; sucursal_id: string | null };
    return { version: d.version, sucursal: d.sucursal_id };
  } catch (e) {
    return fallo(e);
  }
}

export async function cumplirRequisito(
  tipo: TipoCard,
  id: string,
  requisito: string,
  datos: { valor?: string | null; fecha?: string | null; archivo?: string | null; nota?: string | null },
): Promise<Resultado> {
  try {
    if (!tipoValido(tipo)) return { error: 'Tipo de card no válido.' };
    if (datos.fecha && !/^\d{4}-\d{2}-\d{2}$/.test(datos.fecha)) return { error: 'Usa una fecha válida.' };
    const { db } = await editor();
    const r = await db.rpc('crm_cumplir', {
      p_tipo: tipo,
      p_card: id,
      p_requisito: requisito,
      p_valor: datos.valor?.trim().slice(0, 500) || null,
      p_fecha: datos.fecha || null,
      p_archivo: datos.archivo || null,
      p_nota: datos.nota?.trim().slice(0, 1000) || null,
    });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function validarRequisito(cumplimiento: string, nota?: string | null): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db.rpc('crm_validar', {
      p_cumplimiento: cumplimiento,
      p_nota: nota?.trim().slice(0, 1000) || null,
    });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function revertirRequisito(cumplimiento: string, motivo: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db.rpc('crm_revertir_requisito', {
      p_cumplimiento: cumplimiento,
      p_motivo: motivo.trim().slice(0, 1000),
    });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function liberarCandado(tipo: TipoCard, id: string, motivo: string): Promise<Resultado> {
  try {
    if (!tipoValido(tipo)) return { error: 'Tipo de card no válido.' };
    const { db } = await editor();
    const r = await db.rpc('crm_liberar_candado', {
      p_tipo: tipo,
      p_card: id,
      p_motivo: motivo.trim().slice(0, 1000),
    });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarEnCascada(
  franquiciatario: string,
  motivo: string,
): Promise<Resultado<{ sucursales: number }>> {
  try {
    const { db } = await editor();
    const r = await db.rpc('crm_cancelar_cascada', {
      p_franquiciatario: franquiciatario,
      p_motivo: motivo.trim().slice(0, 1000),
    });
    if (r.error) return { error: mensaje(r.error) };
    return { sucursales: r.data as number };
  } catch (e) {
    return fallo(e);
  }
}

export async function crearFranquiciatario(
  datos: Record<string, unknown>,
): Promise<Resultado<{ id: string }>> {
  try {
    const { db, perfil } = await editor();
    const v = validar(camposFranquiciatario, { nombre: '', ...datos });
    // Entra en la etapa 1 (la base lo fuerza) con quien lo registra como vendedor.
    const r = await db
      .from('crm_franquiciatarios')
      .insert({
        ...v,
        responsable_id: perfil.user_id,
        etapa_id: '00000000-0000-0000-0000-000000000000',
      } as never)
      .select('id')
      .single();
    if (r.error) return { error: mensaje(r.error) };
    return { id: (r.data as { id: string }).id };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarCard(
  tipo: TipoCard,
  id: string,
  version: number,
  datos: Record<string, unknown>,
): Promise<Resultado<{ version: number }>> {
  try {
    if (!tipoValido(tipo)) return { error: 'Tipo de card no válido.' };
    const { db } = await editor();
    const campos = tipo === 'franquiciatario' ? camposFranquiciatario : camposSucursal;
    const v = validar(campos as typeof camposFranquiciatario, datos);
    if (!Object.keys(v).length) return { error: 'No hay cambios.' };
    const r = await db
      .from(tipo === 'franquiciatario' ? 'crm_franquiciatarios' : 'crm_tiendas')
      .update(v as never)
      .eq('id', id)
      .eq('version', version)
      .select('version');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length)
      return { error: 'La card cambió mientras la editabas. Recarga para ver la versión actual.' };
    return { version: (r.data[0] as { version: number }).version };
  } catch (e) {
    return fallo(e);
  }
}

export async function asignarVendedor(
  id: string,
  version: number,
  usuario: string | null,
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_franquiciatarios')
      .update({ responsable_id: usuario })
      .eq('id', id)
      .eq('version', version)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: 'La card cambió mientras tanto. Recarga.' };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function crearSucursal(
  franquiciatario: string,
  nombre: string,
  ciudad: string,
): Promise<Resultado<{ id: string }>> {
  try {
    const { db } = await editor();
    if (!nombre.trim()) return { error: 'Escribe el nombre de la sucursal.' };
    const r = await db.rpc('crm_crear_sucursal', {
      p_franquiciatario: franquiciatario,
      p_nombre: nombre.trim().slice(0, 200),
      p_ciudad: ciudad.trim().slice(0, 120) || null,
    });
    if (r.error) return { error: mensaje(r.error) };
    return { id: r.data as string };
  } catch (e) {
    return fallo(e);
  }
}

/** Paso 1 de la subida al expediente: registra el archivo (y su versión) y devuelve la ruta aleatoria. */
export async function prepararDocumento(
  tipo: TipoCard,
  id: string,
  archivo: { nombre: string; mime: string; tamano: number },
  tipoDocumento: string,
  reemplazaA?: string | null,
): Promise<Resultado<{ id: string; ruta: string }>> {
  try {
    if (!tipoValido(tipo)) return { error: 'Tipo de card no válido.' };
    if (!(tipoDocumento in TIPOS_DOCUMENTO)) return { error: 'Elige el tipo de documento.' };
    const { db } = await editor();
    validarArchivo(archivo.nombre, archivo.mime, archivo.tamano);
    const r = await db
      .from('crm_archivos')
      .insert({
        franquiciatario_id: tipo === 'franquiciatario' ? id : null,
        tienda_id: tipo === 'sucursal' ? id : null,
        nombre: archivo.nombre.trim(),
        mime: archivo.mime,
        tamano: archivo.tamano,
        seccion: 'expediente',
        tipo_documento: tipoDocumento,
        reemplaza_a: reemplazaA || null,
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

export async function retirarDocumento(id: string, motivo: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    if (motivo.trim().length < 5) return { error: 'Escribe por qué se retira el documento.' };
    const r = await db
      .from('crm_archivos')
      .update({ archivado_en: new Date().toISOString(), motivo_retiro: motivo.trim().slice(0, 500) })
      .eq('id', id)
      .is('archivado_en', null)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function atenderAviso(id: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db.rpc('crm_atender_aviso', { p_aviso: id });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

// Administración (heads y desarrolladores; la base lo vuelve a exigir).

export async function guardarMembresia(
  usuario: string,
  area: ClaveArea,
  rol: RolArea,
  funciones: string[],
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_membresias')
      .upsert({ user_id: usuario, area, rol, funciones: funciones.filter((f) => f === 'aprobacion_locales') })
      .select('user_id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: 'Solo un desarrollador administra accesos.' };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function quitarMembresia(usuario: string, area: ClaveArea): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db
      .from('crm_membresias')
      .delete()
      .eq('user_id', usuario)
      .eq('area', area)
      .select('user_id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: 'Solo un desarrollador administra accesos.' };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function agregarFestivo(fecha: string, nombre: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || !nombre.trim())
      return { error: 'Indica la fecha y el nombre del festivo.' };
    const r = await db.from('crm_festivos').insert({ fecha, nombre: nombre.trim().slice(0, 120) });
    if (r.error) return { error: mensaje(r.error) };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function quitarFestivo(fecha: string): Promise<Resultado> {
  try {
    const { db } = await editor();
    const r = await db.from('crm_festivos').delete().eq('fecha', fecha).select('fecha');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length) return { error: 'Solo un head o un desarrollador edita los festivos.' };
    return {};
  } catch (e) {
    return fallo(e);
  }
}

export async function editarRequisito(
  id: string,
  version: number,
  datos: { nombre?: string; ayuda?: string; obligatorio?: boolean; activo?: boolean },
): Promise<Resultado> {
  try {
    const { db } = await editor();
    const cambios: Partial<Pick<Requisito, 'nombre' | 'ayuda' | 'obligatorio' | 'activo'>> = {};
    if (datos.nombre !== undefined) {
      if (!datos.nombre.trim()) return { error: 'El nombre no puede quedar vacío.' };
      cambios.nombre = datos.nombre.trim().slice(0, 200);
    }
    if (datos.ayuda !== undefined) cambios.ayuda = datos.ayuda.trim().slice(0, 1000);
    if (datos.obligatorio !== undefined) cambios.obligatorio = datos.obligatorio;
    if (datos.activo !== undefined) cambios.activo = datos.activo;
    const r = await db
      .from('crm_requisitos')
      .update(cambios)
      .eq('id', id)
      .eq('version', version)
      .select('id');
    if (r.error) return { error: mensaje(r.error) };
    if (!r.data.length)
      return { error: 'Solo un head o un desarrollador edita requisitos (o cambió mientras tanto).' };
    return {};
  } catch (e) {
    return fallo(e);
  }
}
