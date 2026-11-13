'use server';
import { revalidatePath } from 'next/cache';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { invocarFuncion } from '@/lib/comercializadora/funciones';
import { validarCierre, type FormCierre } from '@/lib/comercializadora/cierres';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { validarOc, type FormOc } from '@/lib/comercializadora/ordenes';
import { validarMonto } from '@/lib/comercializadora/minimos';

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

export async function correrOcAuto(
  modo: 'simulacion' | 'real',
): Promise<Resultado<{ ocs: number; modo: string }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const r = await invocarFuncion('zoho-generar-oc', {
    origen: 'manual',
    modo: modo === 'real' ? 'real' : 'simulacion',
  });
  if (!r.ok) return { error: r.error };
  const d = r.datos as { ocs?: number; modo?: string };
  revalidatePath('/comercializadora', 'layout');
  return { ok: true, ocs: Number(d.ocs) || 0, modo: String(d.modo ?? modo) };
}

/** OC de plataforma (_comGuardarOC): una fila tipo compra por artículo; el monto total va en la primera. */
export async function guardarOc(f: FormOc, folioAnterior?: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const error = validarOc(f);
    if (error) return { error };
    const filas = f.lineas
      .filter((l) => l.sku && Number(l.cantidad) > 0)
      .map((l, i) => ({
        tipo: 'compra',
        folio: f.folio.trim(),
        sku: l.sku,
        cantidad: Number(l.cantidad),
        cantidad_recibida: 0,
        fecha: f.fecha,
        fecha_arribo: f.fecha_arribo || null,
        destino: f.destino,
        estado: 'emitida',
        monto: i === 0 ? Number(f.monto) : null,
        proveedor: f.proveedor,
      }));
    const ins = await s.db
      .from('com_movimientos' as never)
      .insert(filas as never)
      .select('id');
    if (ins.error) return fallo(ins.error);
    // Editar = insertar las nuevas y borrar las anteriores (_comEditarOC), solo si el alta salió bien.
    if (folioAnterior) {
      const ids = new Set((ins.data as { id: string }[]).map((x) => x.id));
      const viejas = await s.db
        .from('com_movimientos' as never)
        .select('id')
        .eq('tipo' as never, 'compra' as never)
        .eq('folio' as never, folioAnterior as never);
      const borrar = ((viejas.data ?? []) as { id: string }[]).map((x) => x.id).filter((id) => !ids.has(id));
      if (borrar.length)
        await s.db
          .from('com_movimientos' as never)
          .delete()
          .in('id' as never, borrar as never);
    }
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarRecepcion: actualiza cantidad_recibida por fila (Zoho manda en el saldo: no toca com_catalogo). */
export async function recibirOc(folio: string, recibido: Record<string, number>): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    for (const [id, cant] of Object.entries(recibido)) {
      if (!(Number(cant) >= 0)) return { error: 'La cantidad recibida no es válida' };
      const r = await s.db
        .from('com_movimientos' as never)
        .update({ cantidad_recibida: Number(cant) } as never)
        .eq('id' as never, id as never)
        .eq('folio' as never, folio as never)
        .select('id');
      if (r.error) return fallo(r.error);
    }
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function eliminarOc(folio: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await s.db
      .from('com_movimientos' as never)
      .delete()
      .eq('tipo' as never, 'compra' as never)
      .eq('folio' as never, folio as never)
      .select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/ordenes');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _minGuardar: la función guarda en la plataforma y envía a Zoho; lo guardado queda aunque Zoho falle. */
export async function guardarMinimo(
  vendor_id: string,
  monto: string,
): Promise<Resultado<{ enviado: boolean; aviso?: string }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const valor = validarMonto(monto);
  if (valor === null) return { error: 'Monto inválido: usa pesos con hasta 2 decimales' };
  const r = await invocarFuncion('zoho-proveedor-minimo', { vendor_id, monto: valor, por: s.perfil.nombre });
  if (!r.ok) return { error: r.error };
  const d = r.datos as { enviado?: boolean; error?: string };
  revalidatePath('/comercializadora', 'layout');
  return d.enviado ? { ok: true, enviado: true } : { ok: true, enviado: false, aviso: d.error };
}
