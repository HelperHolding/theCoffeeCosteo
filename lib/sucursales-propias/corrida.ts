import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { ErrorCorrida, leerZip } from './zip';
import { unir } from './recibos';
import type { Factura, Proveedor } from './empate';
import { armarCorrida, proveedoresAConsultar, separarNuevas, type Previa } from './planear';
import { invocarPagos } from './funcion';

export const MAX_ZIP = 4 * 1024 * 1024;
export { ErrorCorrida };

/** Lee el ZIP, empata con Zoho, registra la corrida (una transacción) y sube los recibos (spec §4 paso 1). */
export async function prepararCorrida(
  db: SupabaseClient,
  archivo: string,
  bytes: Uint8Array,
): Promise<{ corridaId: number; avisos: string[] }> {
  const zip = await leerZip(bytes);
  const unidas = unir(zip.resumen, zip.recibos);
  const { data: previas, error: e1 } = await db
    .from('suc_pago_transferencia')
    .select('llave, corrida_id, estado')
    .in(
      'llave',
      unidas.transferencias.map((t) => t.llave),
    );
  if (e1) throw e1;
  const { nuevas, avisos: repetidas } = separarNuevas(unidas.transferencias, (previas ?? []) as Previa[]);
  if (!nuevas.length)
    throw new ErrorCorrida(
      `Todas las transferencias de este ZIP ya estaban registradas. ${repetidas[0] ?? ''}`.trim(),
    );

  const prov = await invocarPagos(db, 'proveedores');
  if (!prov.ok) throw new ErrorCorrida(prov.error);
  const proveedores = (prov.datos as { proveedores: Proveedor[] }).proveedores;
  const { data: eq, error: e2 } = await db
    .from('suc_proveedor_clabe')
    .select('clabe, proveedor_zoho_id, proveedor_nombre');
  if (e2) throw e2;
  const equivalencias = new Map(
    (eq ?? []).map((e) => [
      e.clabe as string,
      { id: e.proveedor_zoho_id as string, nombre: e.proveedor_nombre as string },
    ]),
  );
  const ids = proveedoresAConsultar(nuevas, equivalencias, proveedores);
  let facturas: Factura[] = [];
  if (ids.length) {
    const f = await invocarPagos(db, 'facturas', { vendorIds: ids });
    if (!f.ok) throw new ErrorCorrida(f.error);
    facturas = (f.datos as { facturas: Factura[] }).facturas;
  }

  const avisos = [...zip.avisos, ...unidas.avisos, ...repetidas];
  const payload = armarCorrida({
    archivo,
    resumen: zip.resumen,
    todas: unidas.transferencias,
    nuevas,
    avisos,
    equivalencias,
    proveedores,
    facturas,
  });
  const { data, error } = await db.rpc('suc_pagos_registrar_corrida', { p: payload });
  if (error) throw error;
  const { corrida_id, rutas } = data as { corrida_id: number; rutas: { llave: string; ruta: string }[] };

  const pdfs = new Map(zip.recibos.map((r) => [r.archivo, r.pdf]));
  const fallidos: string[] = [];
  for (const { llave, ruta } of rutas) {
    const t = nuevas.find((x) => x.llave === llave)!;
    const { error: eu } = await db.storage
      .from('suc-pagos-recibos')
      .upload(ruta, pdfs.get(t.archivo)!, { contentType: 'application/pdf', upsert: false });
    if (eu) fallidos.push(`No se pudo guardar el recibo de ${t.alias}; al aplicar quedará sin adjunto.`);
  }
  if (fallidos.length) {
    await db
      .from('suc_pago_corrida')
      .update({ avisos: [...avisos, ...fallidos] })
      .eq('id', corrida_id);
  }
  return { corridaId: corrida_id, avisos: [...avisos, ...fallidos] };
}
