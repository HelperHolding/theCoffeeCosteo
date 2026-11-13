'use server';
import { revalidatePath } from 'next/cache';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { invocarFuncion } from '@/lib/comercializadora/funciones';
import { validarCierre, type FormCierre } from '@/lib/comercializadora/cierres';
import { hoyCdmx } from '@/lib/comercializadora/fechas';

export type Resultado<T = object> = { error: string } | ({ ok: true } & T);

const SOLO_LECTURA = 'Tu acceso a Comercializadora es de solo lectura.';

/** Sesión con permiso de escritura; sin él, null (la acción responde SOLO_LECTURA sin tocar la base). */
export async function editorCom() {
  const s = await sesionComercializadora(false);
  return puedeEditarCom(s.accesos) ? s : null;
}

const fallo = (e: unknown): { error: string } => {
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return { error: SOLO_LECTURA };
  return { error: 'No se pudo guardar. Intenta de nuevo.' };
};

export async function guardarCierre(f: FormCierre): Promise<Resultado<{ recalculo: boolean }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const error = validarCierre(f, hoyCdmx(), !f.id);
    if (error) return { error };
    const datos = {
      vendor_id: f.vendor_id,
      vendor_name: f.vendor_name,
      ini: f.ini,
      fin: f.fin,
      motivo: f.motivo,
      skus: f.todo ? null : f.skus,
      notas: f.notas.trim() || null,
      actualizado_at: new Date().toISOString(),
    };
    // Cambiar fechas o alcance vuelve a mandar los avisos (_cieGuardar): en una edición se reinician siempre.
    const r = f.id
      ? await s.db
          .from('com_proveedor_cierre' as never)
          .update({ ...datos, aviso7_at: null, aviso0_at: null } as never)
          .eq('id' as never, f.id as never)
          .select('id')
      : await s.db
          .from('com_proveedor_cierre' as never)
          .insert({ ...datos, creado_por: s.perfil.nombre } as never)
          .select('id');
    if (r.error) return fallo(r.error);
    const re = await invocarFuncion('com-minmax', {});
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, recalculo: re.ok };
  } catch (e) {
    return fallo(e);
  }
}

export async function cancelarCierre(id: number): Promise<Resultado<{ recalculo: boolean }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await s.db
      .from('com_proveedor_cierre' as never)
      .update({ cancelado: true, actualizado_at: new Date().toISOString() } as never)
      .eq('id' as never, id as never)
      .select('id');
    if (r.error) return fallo(r.error);
    const re = await invocarFuncion('com-minmax', {});
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, recalculo: re.ok };
  } catch (e) {
    return fallo(e);
  }
}
