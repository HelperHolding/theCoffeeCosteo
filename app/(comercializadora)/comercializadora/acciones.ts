'use server';
import { revalidatePath } from 'next/cache';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { invocarFuncion } from '@/lib/comercializadora/funciones';
import {
  alcanceCambio,
  fechasCambiaron,
  validarCierre,
  type FormCierre,
} from '@/lib/comercializadora/cierres';
import { com } from '@/lib/comercializadora/consultas';
import { hoyCdmx } from '@/lib/comercializadora/fechas';
import { validarOc, type FormOc } from '@/lib/comercializadora/ordenes';
import { validarMonto } from '@/lib/comercializadora/minimos';
import {
  CAMPOS_CATALOGO,
  validarCampo,
  validarMinMax,
  type CampoCatalogo,
} from '@/lib/comercializadora/catalogo';

export type Resultado<T = object> = { error: string } | ({ ok: true } & T);

const SOLO_LECTURA = 'Tu acceso a Comercializadora es de solo lectura.';
// El recálculo tras guardar un cierre no debe colgar la acción: si tarda más, se informa y lo hace la corrida diaria.
const RECALCULO_MS = 25_000;

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
    let r;
    if (f.id) {
      const antes = await com(s.db)
        .from('com_proveedor_cierre')
        .select('ini,fin,vendor_id,skus')
        .eq('id', f.id)
        .maybeSingle();
      if (antes.error) return fallo(antes.error);
      if (!antes.data) return { error: 'Ese periodo ya no existe; recarga la página' };
      // _cieGuardar: los avisos vuelven a mandarse solo si cambian las fechas o el alcance (proveedor o artículos).
      const reiniciar =
        fechasCambiaron(antes.data, f) ||
        alcanceCambio(antes.data, { vendor_id: f.vendor_id, skus: datos.skus });
      r = await com(s.db)
        .from('com_proveedor_cierre')
        .update(reiniciar ? { ...datos, aviso7_at: null, aviso0_at: null } : datos)
        .eq('id', f.id)
        .select('id');
    } else {
      r = await com(s.db)
        .from('com_proveedor_cierre')
        .insert({ ...datos, creado_por: s.perfil.nombre })
        .select('id');
    }
    if (r.error) return fallo(r.error);
    const re = await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS });
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
    const re = await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS });
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
    const folio = f.folio.trim();
    const t = () => com(s.db).from('com_movimientos');
    // _comGuardarOC: un folio no se repite (ni al crear ni al renombrar en una edición).
    if (folio !== folioAnterior) {
      const ya = await t().select('id').eq('tipo', 'compra').eq('folio', folio).limit(1);
      if (ya.error) return fallo(ya.error);
      if (ya.data?.length) return { error: `Ya existe una OC con el folio ${folio}` };
    }
    // Editar (_comGuardarEditOC): cada línea conserva sus columnas y lo recibido, acotado a la nueva cantidad.
    let viejas: Record<string, unknown>[] = [];
    if (folioAnterior) {
      const r = await t().select('*').eq('tipo', 'compra').eq('folio', folioAnterior);
      if (r.error) return fallo(r.error);
      viejas = r.data ?? [];
    }
    const porSku = new Map(viejas.map((v) => [String(v.sku), v]));
    const filas = f.lineas
      .filter((l) => l.sku && Number(l.cantidad) > 0)
      .map((l, i) => {
        const cantidad = Number(l.cantidad);
        const { id: _id, ...antes } = porSku.get(l.sku) ?? {};
        const recibido = Math.min(Number(antes.cantidad_recibida) || 0, cantidad);
        return {
          ...antes,
          tipo: 'compra',
          folio,
          sku: l.sku,
          cantidad,
          cantidad_recibida: recibido,
          estado: recibido <= 0 ? 'emitida' : recibido >= cantidad ? 'recibida' : 'parcial',
          fecha: f.fecha,
          fecha_arribo: f.fecha_arribo || null,
          destino: f.destino,
          monto: i === 0 ? Number(f.monto) : null,
          proveedor: f.proveedor,
        };
      });
    const ins = await t().insert(filas).select('id');
    if (ins.error) return fallo(ins.error);
    if (viejas.length) {
      const borrado = await t()
        .delete()
        .in(
          'id',
          viejas.map((v) => v.id),
        )
        .select('id');
      if (borrado.error) {
        // Sin las anteriores borradas la OC quedaría duplicada: se deshace el alta.
        await t()
          .delete()
          .in(
            'id',
            (ins.data as { id: string }[]).map((x) => x.id),
          );
        return fallo(borrado.error);
      }
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
    const ids = Object.keys(recibido);
    const lineas = await com(s.db)
      .from('com_movimientos')
      .select('id,sku,cantidad')
      .eq('tipo', 'compra')
      .eq('folio', folio)
      .in('id', ids);
    if (lineas.error) return fallo(lineas.error);
    const porId = new Map(
      (lineas.data as { id: string; sku: string; cantidad: number }[]).map((x) => [String(x.id), x]),
    );
    // Todo se valida antes de escribir: una línea inválida no deja la OC a medias.
    for (const id of ids) {
      const l = porId.get(id);
      const cant = Number(recibido[id]);
      if (!l) return { error: 'Una línea ya no existe en esta OC; recarga la página' };
      if (!(cant >= 0)) return { error: `${l.sku}: la cantidad recibida no es válida` };
      if (cant > Number(l.cantidad))
        return { error: `${l.sku}: no puedes recibir más de lo pedido (${l.cantidad})` };
    }
    for (const id of ids) {
      const r = await com(s.db)
        .from('com_movimientos')
        .update({ cantidad_recibida: Number(recibido[id]) })
        .eq('id', id)
        .eq('folio', folio)
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

export interface FormAjuste3pl {
  realizado: string;
  autorizado: string;
  fecha_conteo: string;
  motivo: string;
  lineas: { sku: string; actual: number | null; nuevo: number; costo: number | null }[];
}

const MOTIVOS_AJUSTE = ['Conteo físico', 'Merma', 'Reposición', 'Corrección de error', 'Ingreso 3PL', 'Otro'];

/** Ajuste/conteo de 3PL (plan 3b, decisiones 2 y 3): valida como _comGuardarAjuste/_planConteoGuardar y aplica todo o nada. */
export async function ajustar3pl(f: FormAjuste3pl): Promise<Resultado<{ aplicadas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!f.autorizado?.trim()) return { error: 'Selecciona quién autoriza este ajuste' };
    if (f.fecha_conteo && f.fecha_conteo > hoyCdmx())
      return { error: 'La fecha del conteo no puede ser futura' };
    if (!MOTIVOS_AJUSTE.includes(f.motivo)) return { error: 'Elige el motivo del ajuste' };
    if (!f.lineas.length) return { error: 'Agrega al menos una línea' };
    for (const l of f.lineas) {
      if (!(Number.isFinite(l.nuevo) && l.nuevo >= 0))
        return { error: `${l.sku}: el ajuste dejaría el saldo en ${l.nuevo} — no puede ser negativo` };
    }
    const r = await com(s.db).rpc('com_ajustar_3pl', {
      p_lineas: f.lineas,
      p_realizado: f.realizado?.trim() || s.perfil.nombre,
      p_autorizado: f.autorizado.trim(),
      p_fecha_conteo: f.fecha_conteo || null,
      p_motivo: f.motivo,
    });
    if (r.error) return r.error.code === 'P0001' ? { error: String(r.error.message) } : fallo(r.error);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, aplicadas: Number(r.data) || 0 };
  } catch (e) {
    return fallo(e);
  }
}

/** Historial del plan (_planCfgLog): autor y hora los pone el trigger com_plan_sello_usuario. */
async function registrarHistorial(
  db: unknown,
  ambito: string,
  clave: string,
  antes: unknown,
  despues: unknown,
) {
  await com(db)
    .from('com_plan_config_historial')
    .insert({ ambito, clave, valor_anterior: antes ?? null, valor_nuevo: despues ?? null });
}

/** _planEditarCampo: lead time en com_lead_times (upsert); el resto en com_catalogo. Registra historial ambito 'sku'. */
export async function guardarCampoCatalogo(
  sku: string,
  campo: CampoCatalogo,
  txt: string,
): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!(campo in CAMPOS_CATALOGO)) return { error: 'Campo no válido' };
    const v = validarCampo(campo, txt);
    if ('error' in v) return v;
    if (campo === 'lt') {
      const antes = await com(s.db).from('com_lead_times').select('dias').eq('sku', sku).maybeSingle();
      if (antes.error) return fallo(antes.error);
      const r = antes.data
        ? await com(s.db).from('com_lead_times').update({ dias: v.valor }).eq('sku', sku).select('sku')
        : await com(s.db).from('com_lead_times').insert({ sku, dias: v.valor }).select('sku');
      if (r.error) return fallo(r.error);
      await registrarHistorial(s.db, 'sku', `${sku}:lead_time`, antes.data?.dias ?? null, v.valor);
    } else {
      const col = CAMPOS_CATALOGO[campo].columna;
      const antes = await com(s.db).from('com_catalogo').select(col).eq('sku', sku).maybeSingle();
      if (antes.error) return fallo(antes.error);
      if (!antes.data) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
      const r = await com(s.db)
        .from('com_catalogo')
        .update({ [col]: v.valor })
        .eq('sku', sku)
        .select('sku');
      if (r.error) return fallo(r.error);
      if (!r.data?.length)
        return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
      await registrarHistorial(s.db, 'sku', `${sku}:${col}`, antes.data[col] ?? null, v.valor);
    }
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comEditarMinMax: mínimo/máximo manual (vacío = calculado); minimo/maximo se recalculan solos (columnas generadas). */
export async function guardarMinMaxManual(sku: string, minTxt: string, maxTxt: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const v = validarMinMax(minTxt, maxTxt);
    if ('error' in v) return v;
    const antes = await com(s.db)
      .from('com_minmax')
      .select('minimo_manual,maximo_manual')
      .eq('sku', sku)
      .maybeSingle();
    if (antes.error) return fallo(antes.error);
    if (!antes.data) return { error: 'Ese artículo no tiene mín/máx calculado todavía' };
    const nuevo = { minimo_manual: v.min, maximo_manual: v.max };
    const r = await com(s.db).from('com_minmax').update(nuevo).eq('sku', sku).select('sku');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
    await registrarHistorial(s.db, 'minmax', sku, antes.data, nuevo);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comKitEditar: kit manual ≥ 0 o vacío (= usar el promedio calculado; kit es columna generada). */
export async function guardarKitManual(sku: string, txt: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const t = String(txt ?? '')
      .trim()
      .replace(',', '.');
    const manual = t === '' ? null : Number(t);
    if (manual !== null && !(Number.isFinite(manual) && manual >= 0))
      return {
        error: 'Valor inválido: usa un número mayor o igual a 0, o déjalo vacío para usar el calculado',
      };
    const antes = await com(s.db).from('com_kit_apertura').select('manual').eq('sku', sku).maybeSingle();
    if (antes.error) return fallo(antes.error);
    const r = await com(s.db).from('com_kit_apertura').update({ manual }).eq('sku', sku).select('sku');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Sin permiso para modificar este dato o el artículo ya no existe' };
    await registrarHistorial(s.db, 'kit_apertura', sku, antes.data?.manual ?? null, manual);
    revalidatePath('/comercializadora/kit');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comKitRecalcular: com-minmax recalcula el kit, el mín/máx y la proyección. */
export async function recalcularKit(): Promise<Resultado<{ skus: number }>> {
  const s = await editorCom().catch(() => null);
  if (!s) return { error: SOLO_LECTURA };
  const r = await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS });
  if (!r.ok) return { error: r.error };
  revalidatePath('/comercializadora', 'layout');
  return { ok: true, skus: Number((r.datos as { skus?: number }).skus) || 0 };
}
