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

type Avisar = (asunto: string, html: string) => Promise<boolean>;

/** Firma de Meta: sha256= + HMAC-SHA256 hex del cuerpo crudo con el secreto de la app (META_APP_SECRETO). */
export async function firmaMetaValida(cuerpo: string, firma: string): Promise<boolean> {
  const secreto = Deno.env.get("META_APP_SECRETO") ?? "";
  if (!secreto || !firma.startsWith("sha256=")) return false;
  const k = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const s = new Uint8Array(await crypto.subtle.sign("HMAC", k, new TextEncoder().encode(cuerpo)));
  const esperado = "sha256=" + [...s].map((b) => b.toString(16).padStart(2, "0")).join("");
  if (esperado.length !== firma.length) return false;
  let dif = 0;
  for (let i = 0; i < esperado.length; i++) dif |= esperado.charCodeAt(i) ^ firma.charCodeAt(i);
  return dif === 0;
}

/** Estado de entrega de Meta: solo avanza; "sent" y desconocidos se ignoran (Meta siempre manda "sent" primero). */
async function estadoMeta(db: SupabaseClient, wid: string, estadoMetaTxt: string, error: string, avisar: Avisar) {
  const nuevo = META[estadoMetaTxt];
  if (!wid || !nuevo) return { ok: true, ignorado: true };
  const { data: f } = await db.from("com_oc_whatsapp").select("*").eq("wa_message_id", wid).maybeSingle();
  const fila = f as Record<string, unknown> | null;
  if (!fila) return { ok: false, motivo: "mensaje desconocido" };
  const actual = String(fila.estado);
  const avanza = nuevo === "fallido" ? actual === "enviado" || actual === "entregado" : (ORDEN[nuevo] ?? -1) > (ORDEN[actual] ?? 99);
  if (!avanza) return { ok: true, sin_cambio: true };
  const ahora = new Date().toISOString();
  const { data: hechas, error: e } = await db.from("com_oc_whatsapp").update({ estado: nuevo, actualizado_at: ahora,
    ...(nuevo === "entregado" ? { entregado_at: ahora } : nuevo === "leido" ? { leido_at: ahora } : { error: error || "Meta: no entregado" }) })
    .eq("wa_message_id", wid).eq("estado", actual).select();
  if (e) throw e;
  // Solo quien sí cambió la fila avisa: dos "failed" simultáneos no mandan dos correos.
  if (nuevo === "fallido" && (hechas as unknown[] | null)?.length) {
    await avisar(`WhatsApp: no se entregó la OC ${fila.po_number}`,
      `<p>Meta no entregó la OC <b>${esc(fila.po_number)}</b> a ${esc(fila.vendor_name)} (${esc(mascara(fila.telefono as string))}): ${esc(error)}.</p><p>Mándala a mano.</p>`);
  }
  return { ok: true };
}

/** Respuesta de un proveedor: se liga al último envío que sí salió a ese número y se reenvía a compras. */
async function respuesta(db: SupabaseClient, telefono: unknown, texto: string, avisar: Avisar) {
  const cuerpo = `<p>${esc(texto || "(mensaje sin texto: puede traer un adjunto; revísalo en el panel de WhatsApp)")}</p>`;
  const tel = normalizarTelefono(telefono);
  if (!tel) {
    await avisar(`WhatsApp de ${mascara(String(telefono ?? "").replace(/D/g, ""))} (número no reconocido)`, cuerpo);
    return null;
  }
  const { data } = await db.from("com_oc_whatsapp").select("zoho_po_id,po_number,vendor_name")
    .eq("telefono", tel).not("enviado_at", "is", null).order("enviado_at", { ascending: false }).limit(1).maybeSingle();
  const f = data as { zoho_po_id: string; po_number: string; vendor_name: string | null } | null;
  await avisar(f ? `WhatsApp de ${f.vendor_name ?? mascara(tel)} sobre ${f.po_number}` : `WhatsApp de ${mascara(tel)} sin OC ligada`, cuerpo);
  return f ?? null;
}

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
    case "estado_meta":
      return ok(await estadoMeta(db, txt("wa_message_id"), txt("estado"), txt("error"), avisar));
    case "respuesta":
      return ok(await respuesta(db, body.telefono, txt("texto"), avisar));
    case "meta": {
      // Aviso crudo de Meta reenviado por n8n: se valida la firma X-Hub-Signature-256 antes de leer nada (spec §6).
      const cuerpo = typeof body.cuerpo === "string" ? body.cuerpo : "";
      if (!(await firmaMetaValida(cuerpo, txt("firma")))) return mal("firma de Meta inválida", 403);
      // deno-lint-ignore no-explicit-any
      let ev: any;
      try { ev = JSON.parse(cuerpo); } catch { return mal("aviso de Meta ilegible"); }
      let estados = 0, mensajes = 0;
      for (const e of ev?.entry ?? []) for (const c of e?.changes ?? []) {
        for (const st of c?.value?.statuses ?? []) {
          await estadoMeta(db, String(st?.id ?? ""), String(st?.status ?? ""), String(st?.errors?.[0]?.title ?? ""), avisar);
          estados++;
        }
        for (const m of c?.value?.messages ?? []) {
          await respuesta(db, m?.from, String(m?.text?.body ?? m?.button?.text ?? ""), avisar);
          mensajes++;
        }
      }
      return ok({ ok: true, estados, mensajes });
    }
    default:
      return mal("acción desconocida");
  }
}
export async function responder(req: Request,
  deps: { db: () => SupabaseClient; manejar: typeof manejar }): Promise<Response> {
  const json = (status: number, x: unknown) => new Response(JSON.stringify(x), { status, headers: { "Content-Type": "application/json" } });
  if (!autorizadoWhatsapp(req)) return json(401, { error: "No autorizado" });
  if (req.method !== "POST") return json(405, { error: "Solo POST" });
  const body = await req.json().catch(() => ({}));
  try {
    const r = await deps.manejar(deps.db(), (body ?? {}) as Record<string, unknown>);
    return json(r.status, r.json);
  } catch (e) {
    console.error("com-oc-whatsapp:", (e as Error).message?.slice(0, 200));
    return json(500, { error: "error interno" });
  }
}
