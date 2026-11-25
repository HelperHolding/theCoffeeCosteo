// RepoPagos sobre Supabase con service role (solo la Edge Function escribe el resultado de Zoho; spec §6).
import type { SupabaseClient } from "./db.ts";
import type { RepoPagos } from "./sucPagos.ts";

export function repoSupabase(db: SupabaseClient): RepoPagos {
  return {
    async transferencia(id) {
      const { data, error } = await db.from("suc_pago_transferencia")
        .select("id,llave,clabe,concepto,monto,fecha_operacion,archivo_pdf,proveedor_zoho_id,proveedor_nombre,estado,zoho_vendorpayment_id,adjunto_ok")
        .eq("id", id).maybeSingle();
      if (error) throw error;
      return data ? { ...data, monto: Number(data.monto) } : null;
    },
    async asignaciones(id) {
      const { data, error } = await db.from("suc_pago_asignacion")
        .select("bill_id,bill_numero,monto").eq("transferencia_id", id).order("fecha", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, monto: Number(a.monto) }));
    },
    async marcar(id, desde, cambios, vencidaAntesDe) {
      let q = db.from("suc_pago_transferencia")
        .update({ ...cambios, actualizado_en: new Date().toISOString() })
        .eq("id", id).in("estado", desde);
      // Retomar una reserva caída: la antigüedad se evalúa en el mismo update, sin carrera.
      if (vencidaAntesDe) q = q.lt("actualizado_en", vencidaAntesDe);
      const { data, error } = await q.select("id");
      if (error) throw error;
      return (data ?? []).length > 0;
    },
    async recibo(ruta) {
      const { data, error } = await db.storage.from("suc-pagos-recibos").download(ruta);
      if (error || !data) throw new Error("no encontré el recibo PDF");
      return new Uint8Array(await data.arrayBuffer());
    },
    async cuenta() {
      const { data, error } = await db.from("suc_pago_config").select("cuenta_zoho_id,cuenta_nombre").eq("id", 1).single();
      if (error) throw error;
      return { id: data.cuenta_zoho_id, nombre: data.cuenta_nombre };
    },
    async guardarCuenta(id) {
      const { error } = await db.from("suc_pago_config").update({ cuenta_zoho_id: id }).eq("id", 1);
      if (error) throw error;
    },
    async guardarEquivalencia(clabe, proveedorId, nombre) {
      const { error } = await db.from("suc_proveedor_clabe")
        .upsert({ clabe, proveedor_zoho_id: proveedorId, proveedor_nombre: nombre });
      if (error) throw error;
    },
  };
}
