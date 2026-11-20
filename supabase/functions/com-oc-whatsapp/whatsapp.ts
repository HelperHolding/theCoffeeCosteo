import { enviarCorreo } from "../_shared/correo.ts";
import { leerConfig, type SupabaseClient } from "../_shared/db.ts";

/** n8n manda x-oc-whatsapp-secreto; COM_SECRETO no abre esta función (spec §4). */
export function autorizadoWhatsapp(req: Request): boolean {
  const esperado = Deno.env.get("OC_WHATSAPP_SECRETO") ?? "";
  const recibido = req.headers.get("x-oc-whatsapp-secreto") ?? "";
  if (!esperado || recibido.length !== esperado.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ recibido.charCodeAt(i);
  return dif === 0;
}

/** Número de México a +52 y 10 dígitos; quita lada 52, 521 y los prefijos 044/045. */
export function normalizarTelefono(x: unknown): string | null {
  let d = String(x ?? "").replace(/\D/g, "");
  if (d.length === 13 && d.startsWith("044")) d = d.slice(3);
  else if (d.length === 13 && d.startsWith("045")) d = d.slice(3);
  else if (d.length === 13 && d.startsWith("521")) d = d.slice(3);
  else if (d.length === 12 && d.startsWith("52")) d = d.slice(2);
  return d.length === 10 ? "+52" + d : null;
}

export const mascara = (tel: string | null | undefined) => (tel ? "…" + String(tel).slice(-4) : "—");
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]!));
const ORDEN: Record<string, number> = { reservado: 0, enviado: 1, entregado: 2, leido: 3 };
const META: Record<string, "entregado" | "leido" | "fallido"> = { delivered: "entregado", read: "leido", failed: "fallido" };

type Resp = { status: number; json: unknown };
const ok = (json: unknown): Resp => ({ status: 200, json });
const mal = (error: string, status = 400): Resp => ({ status, json: { error } });

export async function manejar(db: SupabaseClient, body: Record<string, unknown>,
  deps: { correo?: typeof enviarCorreo } = {}): Promise<Resp> {
  const correo = deps.correo ?? enviarCorreo;
  const txt = (k: string) => (typeof body[k] === "string" ? (body[k] as string).trim() : "");
  // deno-lint-ignore no-explicit-any
  const cfg: any = await leerConfig(db);
  const destinos: string[] = Array.isArray(cfg?.auto?.correos) ? cfg.auto.correos : [];
  const avisar = (asunto: string, html: string) => correo(destinos, asunto, html, "WhatsApp de OCs");

  switch (body.accion) {
    case "reservar": {
      const id = txt("zoho_po_id"), folio = txt("po_number");
      if (!id || !folio) return mal("faltan zoho_po_id o po_number");
      const wa = cfg?.whatsapp ?? {};
      const lista: string[] = Array.isArray(wa.solo_vendor_ids) ? wa.solo_vendor_ids.map(String) : [];
      const motivo = wa.activo !== true ? "WhatsApp apagado"
        : lista.length && !lista.includes(txt("vendor_id")) ? "proveedor fuera de la prueba" : null;
      const fila = { zoho_po_id: id, po_number: folio, vendor_id: txt("vendor_id") || null, vendor_name: txt("vendor_name") || null,
        estado: motivo ? "omitido" : "reservado", ...(motivo ? { error: motivo } : {}) };
      const { error } = await db.from("com_oc_whatsapp").insert(fila);
      if (error && (error as { code?: string }).code === "23505") {
        const { data } = await db.from("com_oc_whatsapp").select("estado").eq("zoho_po_id", id).maybeSingle();
        return ok({ enviar: false, motivo: "ya registrada", estado: (data as { estado?: string } | null)?.estado ?? null });
      }
      if (error) throw error;
      return ok(motivo ? { enviar: false, motivo } : { enviar: true });
    }
    case "resultado": {
      const id = txt("zoho_po_id"), estado = txt("estado");
      if (!id || !["enviado", "fallido", "sin_numero"].includes(estado)) return mal("resultado inválido");
      const tel = normalizarTelefono(body.telefono);
      const ahora = new Date().toISOString();
      const cambios = { estado, telefono: tel, actualizado_at: ahora, error: txt("error") || null,
        ...(estado === "enviado" ? { wa_message_id: txt("wa_message_id") || null, enviado_at: ahora } : {}) };
      const { data, error } = await db.from("com_oc_whatsapp").update(cambios).eq("zoho_po_id", id).eq("estado", "reservado").select();
      if (error) throw error;
      const f = (data as Record<string, unknown>[] | null)?.[0];
      if (!f) return mal("la OC no está reservada", 409);
      if (estado !== "enviado") {
        const porque = estado === "sin_numero"
          ? "el proveedor no tiene número en el campo <b>WhatsApp OCs</b> de Zoho"
          : `falló el envío al ${esc(mascara(tel))}: ${esc(txt("error"))}`;
        await avisar(`WhatsApp: no se mandó la OC ${f.po_number}`,
          `<p>La OC <b>${esc(f.po_number)}</b> de ${esc(f.vendor_name)} no se mandó por WhatsApp: ${porque}.</p><p>Mándala a mano y, si corriges el número, usa "Reintentar WhatsApp" en Órdenes.</p>`);
      }
      return ok({ ok: true });
    }
    case "estado_meta": {
      const wid = txt("wa_message_id"), nuevo = META[txt("estado")];
      if (!wid || !nuevo) return mal("estado de Meta inválido");
      const { data: f } = await db.from("com_oc_whatsapp").select("*").eq("wa_message_id", wid).maybeSingle();
      const fila = f as Record<string, unknown> | null;
      if (!fila) return ok({ ok: false, motivo: "mensaje desconocido" });
      const actual = String(fila.estado);
      const avanza = nuevo === "fallido" ? actual === "enviado" || actual === "entregado" : (ORDEN[nuevo] ?? -1) > (ORDEN[actual] ?? 99);
      if (!avanza) return ok({ ok: true, sin_cambio: true });
      const ahora = new Date().toISOString();
      await db.from("com_oc_whatsapp").update({ estado: nuevo, actualizado_at: ahora,
        ...(nuevo === "entregado" ? { entregado_at: ahora } : nuevo === "leido" ? { leido_at: ahora } : { error: txt("error") || "Meta: no entregado" }) })
        .eq("wa_message_id", wid).eq("estado", actual).select();
      if (nuevo === "fallido") {
        await avisar(`WhatsApp: no se entregó la OC ${fila.po_number}`,
          `<p>Meta no entregó la OC <b>${esc(fila.po_number)}</b> a ${esc(fila.vendor_name)} (${esc(mascara(fila.telefono as string))}): ${esc(txt("error"))}.</p><p>Mándala a mano.</p>`);
      }
      return ok({ ok: true });
    }
    case "respuesta": {
      const tel = normalizarTelefono(body.telefono);
      if (!tel) return mal("teléfono inválido");
      const { data } = await db.from("com_oc_whatsapp").select("zoho_po_id,po_number,vendor_name")
        .eq("telefono", tel).order("enviado_at", { ascending: false }).limit(1).maybeSingle();
      const f = data as { zoho_po_id: string; po_number: string; vendor_name: string | null } | null;
      const asunto = f ? `WhatsApp de ${f.vendor_name ?? mascara(tel)} sobre ${f.po_number}` : `WhatsApp de ${mascara(tel)} sin OC ligada`;
      await avisar(asunto, `<p>${esc(txt("texto") || "(mensaje sin texto: puede traer un adjunto; revísalo en el panel de WhatsApp)")}</p>`);
      return ok(f ?? null);
    }
    default:
      return mal("acción desconocida");
  }
}
