'use server';
import { revalidatePath } from 'next/cache';
import type { SupabaseClient } from '@supabase/supabase-js';
import { accesoPagos } from '@/lib/supabase/sesion';
import { invocarPagos } from '@/lib/sucursales-propias/funcion';
import {
  aAsignacion,
  conProveedor,
  validarAsignaciones,
  type Factura,
  type Proveedor,
} from '@/lib/sucursales-propias/empate';
import { aFila } from '@/lib/sucursales-propias/planear';
import { PREVIOS } from '@/lib/sucursales-propias/estados';

export type Resultado<T = object> = { error: string } | ({ ok: true } & T);

const SOLO_LECTURA = 'Tu acceso a Pagos es de solo lectura.';
const RUTA = '/sucursales/propias/pagos';
const DATOS_INVALIDOS = 'Datos inválidos.';
const idValido = (id: unknown): id is number => Number.isInteger(id) && (id as number) > 0;

async function editor() {
  const a = await accesoPagos();
  return a.ok && a.puedeAplicar ? { ...a, db: a.db as unknown as SupabaseClient } : null;
}

// Solo mensajes fijos: el detalle de Postgres puede traer una CLABE y no se devuelve ni se registra.
const fallo = (e: unknown): { error: string } => {
  const code = (e as { code?: string } | null)?.code;
  if (code === '42501') return { error: SOLO_LECTURA };
  const m = (e as { message?: string } | null)?.message ?? '';
  if (m.includes('ya no se puede cambiar')) return { error: 'Esta transferencia ya se aplicó.' };
  if (m.includes('Lo asignado no es igual')) return { error: 'Lo asignado no es igual a la transferencia.' };
  return { error: 'No se pudo guardar. Intenta de nuevo.' };
};

// Cliente sin tipos generados: las tablas y RPC suc_* aún no están en types (igual que corrida.ts).
type Db = SupabaseClient;

async function transferencia(db: Db, id: number) {
  const { data, error } = await db
    .from('suc_pago_transferencia')
    .select('id, clabe, monto, estado, proveedor_zoho_id, proveedor_nombre, sugerido')
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return { ...data, monto: Number(data.monto) } as {
    id: number;
    clabe: string | null;
    monto: number;
    estado: string;
    proveedor_zoho_id: string | null;
    proveedor_nombre: string | null;
    sugerido: boolean;
  };
}

async function facturasDe(db: Db, vendorId: string): Promise<{ facturas: Factura[] } | { error: string }> {
  const f = await invocarPagos(db, 'facturas', { vendorIds: [vendorId] });
  return f.ok ? { facturas: (f.datos as { facturas: Factura[] }).facturas } : { error: f.error };
}

export async function aplicarTransferencia(
  id: number,
): Promise<Resultado<{ estado: string; mensaje?: string }>> {
  try {
    const a = await editor();
    if (!a) return { error: SOLO_LECTURA };
    if (!idValido(id)) return { error: DATOS_INVALIDOS };
    const r = await invocarPagos(a.db, 'aplicar', { id });
    if (!r.ok) return { error: r.error };
    const d = r.datos as { estado: string; mensaje?: string };
    revalidatePath(RUTA, 'layout');
    return { ok: true, estado: d.estado, mensaje: d.mensaje };
  } catch (e) {
    return fallo(e);
  }
}

export async function leerProveedores(): Promise<Resultado<{ proveedores: Proveedor[] }>> {
  const a = await editor();
  if (!a) return { error: SOLO_LECTURA };
  const r = await invocarPagos(a.db, 'proveedores');
  return r.ok
    ? { ok: true, proveedores: (r.datos as { proveedores: Proveedor[] }).proveedores }
    : { error: r.error };
}

export async function leerFacturasProveedor(id: number): Promise<Resultado<{ facturas: Factura[] }>> {
  const a = await editor();
  if (!a) return { error: SOLO_LECTURA };
  const t = await transferencia(a.db, id);
  if (!t?.proveedor_zoho_id) return { error: 'Primero elige el proveedor.' };
  const f = await facturasDe(a.db, t.proveedor_zoho_id);
  return 'error' in f ? f : { ok: true, facturas: f.facturas };
}

export async function asignarProveedor(id: number, proveedor: Proveedor): Promise<Resultado> {
  try {
    const a = await editor();
    if (!a) return { error: SOLO_LECTURA };
    if (!idValido(id) || typeof proveedor?.id !== 'string' || !proveedor.id)
      return { error: DATOS_INVALIDOS };
    const t = await transferencia(a.db, id);
    if (!t) return { error: 'No encontré la transferencia.' };
    if (!(PREVIOS as readonly string[]).includes(t.estado))
      return { error: 'Esta transferencia ya se aplicó.' };
    // El proveedor se toma de Zoho, no del navegador: id y nombre del cliente no son de fiar
    // (la equivalencia CLABE -> proveedor es compartida y afecta empates futuros).
    const lista = await invocarPagos(a.db, 'proveedores');
    if (!lista.ok) return { error: lista.error };
    const zoho = (lista.datos as { proveedores: Proveedor[] }).proveedores.find((p) => p.id === proveedor.id);
    if (!zoho) return { error: 'Ese proveedor no está en Zoho.' };
    const f = await facturasDe(a.db, zoho.id);
    if ('error' in f) return f;
    const e = conProveedor(t.monto, zoho, false, f.facturas);
    const { error } = await a.db.rpc('suc_pagos_reemplazar_asignaciones', {
      p_id: id,
      p_estado: e.estado,
      p_proveedor_id: zoho.id,
      p_proveedor_nombre: zoho.nombre,
      p_sugerido: false,
      p_asig: e.asignaciones.map(aFila),
    });
    if (error) return fallo(error);
    if (t.clabe) {
      // Si esto falla la asignación ya quedó guardada: se devuelve ok y solo se pierde la
      // memoria para la próxima corrida (el usuario volverá a elegir el proveedor).
      await a.db
        .from('suc_proveedor_clabe')
        .upsert({ clabe: t.clabe, proveedor_zoho_id: zoho.id, proveedor_nombre: zoho.nombre });
    }
    revalidatePath(RUTA, 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}

export async function guardarAsignaciones(
  id: number,
  asignaciones: { billId: string; monto: number }[],
): Promise<Resultado> {
  try {
    const a = await editor();
    if (!a) return { error: SOLO_LECTURA };
    if (!idValido(id) || !Array.isArray(asignaciones)) return { error: DATOS_INVALIDOS };
    const t = await transferencia(a.db, id);
    if (!t?.proveedor_zoho_id || !t.proveedor_nombre) return { error: 'Primero elige el proveedor.' };
    if (!(PREVIOS as readonly string[]).includes(t.estado))
      return { error: 'Esta transferencia ya se aplicó.' };
    const f = await facturasDe(a.db, t.proveedor_zoho_id);
    if ('error' in f) return f;
    const motivo = validarAsignaciones(t.monto, asignaciones, f.facturas);
    if (motivo) return { error: motivo };
    const filas = asignaciones.map((x) =>
      aFila(
        aAsignacion(
          f.facturas.find((b) => b.billId === x.billId)!,
          x.monto,
        ),
      ),
    );
    const { error } = await a.db.rpc('suc_pagos_reemplazar_asignaciones', {
      p_id: id,
      p_estado: 'cuadra',
      p_proveedor_id: t.proveedor_zoho_id,
      p_proveedor_nombre: t.proveedor_nombre,
      p_sugerido: t.sugerido,
      p_asig: filas,
    });
    if (error) return fallo(error);
    revalidatePath(RUTA, 'layout');
    return { ok: true };
  } catch (e) {
    return fallo(e);
  }
}
