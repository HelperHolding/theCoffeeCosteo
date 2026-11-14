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
import { cantidadConteo } from '@/lib/comercializadora/inventario';
import { validarTraspaso, type FormTraspaso } from '@/lib/comercializadora/traspasos';
import { validarMonto } from '@/lib/comercializadora/minimos';
import { kpiAbMetas, normalizarCfgMotor, validarMetas } from '@/lib/comercializadora/indicadores';
import { limpiarMotor } from '@/lib/comercializadora/motor';
import { cafeCfgNorm, impCfgNorm } from '@/lib/comercializadora/paramsImpCafe';

import {
  CAMPOS_CATALOGO,
  validarCampo,
  validarMinMax,
  type CampoCatalogo,
} from '@/lib/comercializadora/catalogo';
import {
  CAMPOS_CONFIG,
  claveServidor,
  difConfig,
  leerRuta,
  normalizarConfig,
  ponerRuta,
  type Config,
} from '@/lib/comercializadora/config';

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

/**
 * _planCfgGuardar: solo los campos editables del portal se toman del borrador (lo demás se conserva tal cual de la
 * base, incluido auto.modo: plan 3b, decisiones 7 y 8). Update condicionado a la misma versión; historial por cambio;
 * recalcula com-minmax si algún cambio toca el servidor.
 */
export async function guardarConfig(
  borrador: Config,
  version: number,
): Promise<Resultado<{ version: number; cambios: number; recalculo: boolean | null }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version))
      return {
        error:
          'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.',
      };
    const antes = normalizarConfig(actual.data.config);
    let nuevo: Config = actual.data.config ?? {};
    const normal = normalizarConfig(borrador);
    for (const c of CAMPOS_CONFIG) nuevo = ponerRuta(nuevo, c.ruta, leerRuta(normal, c.ruta));
    nuevo = ponerRuta(nuevo, 'temp.mes', leerRuta(normal, 'temp.mes'));
    nuevo = ponerRuta(nuevo, 'eventos', leerRuta(normal, 'eventos'));
    nuevo = ponerRuta(nuevo, 'auto.correos', leerRuta(normal, 'auto.correos'));
    const despues = normalizarConfig(nuevo);
    const cambios = difConfig(antes, despues);
    if (!cambios.length) return { error: 'No hay cambios que guardar' };
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: nuevo, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length)
      return {
        error:
          'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.',
      };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(
        cambios.map((c) => ({
          ambito: 'config',
          clave: c.clave,
          valor_anterior: c.antes,
          valor_nuevo: c.despues,
        })),
      );
    const re = cambios.some((c) => claveServidor(c.clave))
      ? await invocarFuncion('com-minmax', {}, { timeoutMs: RECALCULO_MS })
      : null;
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length, recalculo: re ? re.ok : null };
  } catch (e) {
    return fallo(e);
  }
}

/** Marcar enviado (renderComEnvios): solo las líneas 'por_enviar' del folio; el CEDIS lo descuenta Zoho. */
export async function marcarEnviado(folio: string): Promise<Resultado<{ lineas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await com(s.db)
      .from('com_movimientos')
      .update({ estado: 'enviado' })
      .eq('tipo', 'venta')
      .eq('folio', folio)
      .eq('estado', 'por_enviar')
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: 'Ese pedido ya no tiene líneas por enviar; recarga la página' };
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, lineas: r.data.length };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarTraspaso, con las validaciones de la decisión 6 (catálogo y referencia única). */
export async function crearTraspaso(f: FormTraspaso): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const pedidos = f.lineas.map((l) => l.sku.trim()).filter(Boolean);
    const cat = await com(s.db).from('com_catalogo').select('sku').in('sku', pedidos);
    if (cat.error) return fallo(cat.error);
    const error = validarTraspaso(f, new Set((cat.data ?? []).map((c: { sku: string }) => c.sku)));
    if (error) return { error };
    const folio = f.folio.trim();
    const ya = await com(s.db)
      .from('com_movimientos')
      .select('id')
      .eq('tipo', 'traspaso')
      .eq('folio', folio)
      .limit(1);
    if (ya.error) return fallo(ya.error);
    if (ya.data?.length) return { error: `Ya existe un traspaso con la referencia ${folio}` };
    const filas = f.lineas
      .filter((l) => l.sku.trim() && Number(l.cantidad) > 0)
      .map((l) => ({
        tipo: 'traspaso',
        folio,
        sku: l.sku.trim(),
        cantidad: Number(l.cantidad),
        cantidad_original: Number(l.cantidad),
        fecha: f.fecha,
        origen: f.origen,
        destino: f.destino,
        estado: 'ordenado',
      }));
    const r = await com(s.db).from('com_movimientos').insert(filas).select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/traspasos');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarIngreso en una transacción (com_ingresar_traspaso). `recibido`: id de la línea → texto capturado. */
export async function ingresarTraspaso(
  folio: string,
  recibido: Record<string, string>,
): Promise<Resultado<{ lineas: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const cantidades: Record<string, number> = {};
    for (const [id, txt] of Object.entries(recibido)) {
      const c = cantidadConteo(txt);
      if (c == null) return { error: 'Revisa las cantidades recibidas: usa números de 0 en adelante' };
      cantidades[id] = c;
    }
    const r = await com(s.db).rpc('com_ingresar_traspaso', { p_folio: folio, p_recibido: cantidades });
    if (r.error) return r.error.code === 'P0001' ? { error: String(r.error.message) } : fallo(r.error);
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, lineas: Number(r.data) || 0 };
  } catch (e) {
    return fallo(e);
  }
}

/** Decisión 6: solo se elimina lo que no se ha ingresado (borrar uno ingresado dejaría el 3PL sumado). */
export async function eliminarTraspaso(folio: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const ing = await com(s.db)
      .from('com_movimientos')
      .select('id')
      .eq('tipo', 'traspaso')
      .eq('folio', folio)
      .eq('estado', 'ingresado')
      .limit(1);
    if (ing.error) return fallo(ing.error);
    if (ing.data?.length) return { error: 'Solo se puede eliminar un traspaso que aún no se ingresa' };
    const r = await com(s.db)
      .from('com_movimientos')
      .delete()
      .eq('tipo', 'traspaso')
      .eq('folio', folio)
      .eq('estado', 'ordenado')
      .select('id');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/traspasos');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

/** _comGuardarMapeo: upsert por nombre exacto de Shopify (decisión 9); el SKU tiene que existir en el catálogo. */
export async function guardarMapeo(nombre: string, sku: string, notas: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    if (!nombre) return { error: 'Falta el nombre del producto' };
    const art = await com(s.db).from('com_catalogo').select('sku').eq('sku', sku).maybeSingle();
    if (art.error) return fallo(art.error);
    if (!art.data) return { error: 'Elige un SKU del catálogo' };
    const r = await com(s.db)
      .from('com_sku_mapping')
      .upsert({ shopify_nombre: nombre, sku, notas: notas.trim() || null }, { onConflict: 'shopify_nombre' })
      .select('shopify_nombre');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/mapeo');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function borrarMapeo(nombre: string): Promise<Resultado> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const r = await com(s.db)
      .from('com_sku_mapping')
      .delete()
      .eq('shopify_nombre', nombre)
      .select('shopify_nombre');
    if (r.error) return fallo(r.error);
    revalidatePath('/comercializadora/mapeo');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

// ── Plan 3d: Indicadores y piezas por apertura ─────────────────────────────────────────────────────────────────

const CONFIG_OCUPADA =
  'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.';

/**
 * _kpiAbMetasGuardar (decisión 10): solo cfg.kpi.*, con la versión que vio la pantalla y una fila de historial por meta
 * que cambia (ámbito 'config', clave 'kpi.<meta>'). Las metas no cambian el cálculo del servidor: no se recalcula.
 */
export async function guardarMetasKpi(
  txt: Record<string, string>,
  version: number,
): Promise<Resultado<{ version: number; cambios: number }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const v = validarMetas(txt);
    if ('error' in v) return v;
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version)) return { error: CONFIG_OCUPADA };
    const antes = kpiAbMetas(normalizarCfgMotor(actual.data.config));
    const cambios = Object.keys(v.vals).filter((k) => Number(antes[k]) !== v.vals[k]);
    if (!cambios.length) return { ok: true, version: Number(version), cambios: 0 };
    const raw: Config = actual.data.config ?? {};
    const kpi = raw.kpi && typeof raw.kpi === 'object' ? raw.kpi : {};
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: { ...raw, kpi: { ...kpi, ...v.vals } }, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: CONFIG_OCUPADA };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(
        cambios.map((k) => ({
          ambito: 'config',
          clave: `kpi.${k}`,
          valor_anterior: antes[k],
          valor_nuevo: v.vals[k],
        })),
      );
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length };
  } catch (e) {
    return fallo(e);
  }
}

/** "Actualizar" de Indicadores, DOH y Piezas por apertura: vuelve a leer los datos del plan. No escribe nada. */
export async function actualizarMotor(): Promise<Resultado> {
  try {
    await sesionComercializadora(false);
    limpiarMotor();
    revalidatePath('/comercializadora', 'layout');
    return { ok: true };
  } catch {
    return { error: 'No se pudo actualizar. Intenta de nuevo.' };
  }
}

/**
 * _planPzasApAplicar: guarda las piezas por apertura marcadas. Cada artículo es un update condicional al valor que se vio
 * (si otra persona lo cambió mientras se revisaba, no se pisa) y deja su historial como el Catálogo.
 */
export async function aplicarPiezasApertura(
  cambios: { sku: string; valor: string; antes: number }[],
): Promise<Resultado<{ guardados: number; fallas: string[] }>> {
  try {
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const leidos = cambios.map((c) => ({ ...c, v: Number(String(c.valor).trim().replace(',', '.')) }));
    const esValido = (c: (typeof leidos)[number]) =>
      String(c.valor).trim() !== '' && Number.isFinite(c.v) && c.v >= 0;
    const validos = leidos.filter(esValido).map((c) => ({ ...c, v: Math.round(c.v * 100) / 100 }));
    if (!validos.length) return { error: 'No hay filas marcadas con un valor válido' };
    let guardados = 0;
    // Revisión 3d (I3): un valor inválido se reporta; antes desaparecía y el mensaje decía solo "Guardadas: N".
    const fallas: string[] = leidos
      .filter((c) => !esValido(c))
      .map((c) => `${c.sku}: valor no válido (usa un número de 0 en adelante)`);
    for (const c of validos) {
      const r = await com(s.db)
        .from('com_catalogo')
        .update({ cantidad_por_apertura: c.v })
        .eq('sku', c.sku)
        .eq('cantidad_por_apertura', c.antes)
        .select('sku');
      if (r.error) {
        fallas.push(`${c.sku}: ${fallo(r.error).error}`);
        continue;
      }
      if (!r.data?.length) {
        fallas.push(
          `${c.sku}: el valor cambió mientras revisabas (o no tienes permiso); recarga y vuelve a revisar`,
        );
        continue;
      }
      await registrarHistorial(s.db, 'sku', `${c.sku}:cantidad_por_apertura`, c.antes, c.v);
      guardados++;
    }
    if (guardados) {
      // Revisión 3d (I1): como el viejo (que escribía en _planRaw.cat), el plan ve el valor nuevo sin esperar 10 minutos.
      limpiarMotor();
      revalidatePath('/comercializadora', 'layout');
    }
    return { ok: true, guardados, fallas };
  } catch (e) {
    return fallo(e);
  }
}

// ── Plan 3e: parámetros de Importaciones y Café ────────────────────────────────────────────────────────────────

/**
 * _planCfgGuardar('imp' | 'cafe') (decisión 7): solo escribe config.imp o config.cafe, normalizada con _impCfgNorm o
 * _cafeCfgNorm; lo demás de la configuración se conserva tal cual. Update condicionado a la versión que vio la pantalla y
 * una fila de historial por cambio (ámbito 'config', claves como 'imp.items.SKU.venta' o 'cafe.prod.white_1kg.precio').
 * No recalcula com-minmax: el servidor no lee estas secciones.
 */
export async function guardarParamsImpCafe(
  ambito: 'imp' | 'cafe',
  borrador: unknown,
  version: number,
): Promise<Resultado<{ version: number; cambios: number }>> {
  try {
    if (ambito !== 'imp' && ambito !== 'cafe') return { error: 'Sección desconocida' };
    const s = await editorCom();
    if (!s) return { error: SOLO_LECTURA };
    const actual = await com(s.db).from('com_plan_config').select('config,version').eq('id', 1).maybeSingle();
    if (actual.error) return fallo(actual.error);
    if (!actual.data) return { error: 'No hay configuración guardada todavía' };
    if (Number(actual.data.version) !== Number(version)) return { error: CONFIG_OCUPADA };
    const norm = ambito === 'imp' ? impCfgNorm : cafeCfgNorm;
    const raw: Config = actual.data.config ?? {};
    const antes = norm(raw[ambito]);
    const despues = norm(borrador);
    const cambios = difConfig({ [ambito]: antes }, { [ambito]: despues });
    if (!cambios.length) return { error: 'No hay cambios que guardar' };
    const r = await com(s.db)
      .from('com_plan_config')
      .update({ config: { ...raw, [ambito]: despues }, version: Number(version) + 1 })
      .eq('id', 1)
      .eq('version', version)
      .select('id');
    if (r.error) return fallo(r.error);
    if (!r.data?.length) return { error: CONFIG_OCUPADA };
    await com(s.db)
      .from('com_plan_config_historial')
      .insert(
        cambios.map((c) => ({
          ambito: 'config',
          clave: c.clave,
          valor_anterior: c.antes,
          valor_nuevo: c.despues,
        })),
      );
    revalidatePath('/comercializadora', 'layout');
    return { ok: true, version: Number(version) + 1, cambios: cambios.length };
  } catch (e) {
    return fallo(e);
  }
}
