// supabase/functions/com-oc-whatsapp/whatsapp_test.ts
import { assertEquals } from "@std/assert";
import { autorizadoWhatsapp, manejar, mascara, normalizarTelefono } from "./whatsapp.ts";

type Fila = Record<string, unknown>;
// Base falsa: com_plan_config (bandera) y com_oc_whatsapp en memoria, con la llave primaria de verdad.
function dbFalsa(whatsapp: unknown, filas: Fila[] = [], correos = ["compras@x.mx"]) {
  const tabla = new Map<string, Fila>(filas.map((f) => [String(f.zoho_po_id), { ...f }]));
  const db = {
    from(t: string) {
      if (t === "com_plan_config") {
        const q: Record<string, unknown> = {};
        q.select = () => q; q.eq = () => q;
        q.single = () => Promise.resolve({ data: { config: { whatsapp, auto: { correos } } }, error: null });
        return q;
      }
      if (t !== "com_oc_whatsapp") throw new Error("tabla inesperada " + t);
      const filtros: [string, unknown][] = [];
      let orden: string | null = null;
      const coincide = (f: Fila) => filtros.every(([k, v]) => f[k] === v);
      const q: Record<string, unknown> = {};
      q.eq = (k: string, v: unknown) => { filtros.push([k, v]); return q; };
      q.order = (k: string) => { orden = k; return q; };
      q.limit = () => q;
      q.select = () => q;
      q.insert = (row: Fila) => {
        const id = String(row.zoho_po_id);
        if (tabla.has(id)) return Promise.resolve({ error: { code: "23505", message: "duplicate key" } });
        tabla.set(id, { ...row });
        return Promise.resolve({ error: null });
      };
      q.update = (cambios: Fila) => {
        const u: Record<string, unknown> = {};
        u.eq = (k: string, v: unknown) => { filtros.push([k, v]); return u; };
        u.in = (k: string, vs: unknown[]) => { filtros.push([k, { in: vs }]); return u; };
        u.select = () => {
          const hechas: Fila[] = [];
          for (const f of tabla.values()) {
            const ok = filtros.every(([k, v]) =>
              v && typeof v === "object" && "in" in (v as object) ? ((v as { in: unknown[] }).in).includes(f[k]) : f[k] === v);
            if (ok) { Object.assign(f, cambios); hechas.push(f); }
          }
          return Promise.resolve({ data: hechas, error: null });
        };
        return u;
      };
      q.maybeSingle = () => {
        let xs = [...tabla.values()].filter(coincide);
        if (orden) xs = xs.sort((a, b) => String(b[orden!] ?? "").localeCompare(String(a[orden!] ?? "")));
        return Promise.resolve({ data: xs[0] ?? null, error: null });
      };
      return q;
    },
  } as never;
  return { db, tabla };
}
const sinCorreo = { correo: () => Promise.resolve(true) };
const OC = { accion: "reservar", zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_id: "v1", vendor_name: "ODISA" };

Deno.test("autorizadoWhatsapp: solo con OC_WHATSAPP_SECRETO; COM_SECRETO no sirve", () => {
  Deno.env.set("OC_WHATSAPP_SECRETO", "s3creto-wa");
  Deno.env.set("COM_SECRETO", "otro");
  const req = (h: Record<string, string>) => new Request("https://x", { headers: h });
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "s3creto-wa" })), true);
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "s3creto-wb" })), false);
  assertEquals(autorizadoWhatsapp(req({ "x-com-secreto": "otro" })), false);
  assertEquals(autorizadoWhatsapp(req({})), false);
  Deno.env.delete("OC_WHATSAPP_SECRETO");
  assertEquals(autorizadoWhatsapp(req({ "x-oc-whatsapp-secreto": "" })), false);
});

Deno.test("normalizarTelefono: formatos de México a +52 y 10 dígitos; lo demás null", () => {
  for (const x of ["55 1234 5678", "55-1234-5678", "+52 55 1234 5678", "52 5512345678", "+521 55 1234 5678", "044 55 1234 5678", "045 5512345678", "5512345678"]) {
    assertEquals(normalizarTelefono(x), "+525512345678", String(x));
  }
  for (const x of ["", null, undefined, "12345", "+1 415 555 0101", "55123456789", "abc"]) {
    assertEquals(normalizarTelefono(x), null, String(x));
  }
});

Deno.test("mascara deja solo los últimos 4 dígitos", () => {
  assertEquals(mascara("+525512345678"), "…5678");
  assertEquals(mascara(null), "—");
});

Deno.test("reservar: nueva → enviar; repetida → ya registrada, sin duplicar", async () => {
  const { db, tabla } = dbFalsa({ activo: true, solo_vendor_ids: [] });
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: true });
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: false, motivo: "ya registrada", estado: "reservado" });
  assertEquals(tabla.size, 1);
});

Deno.test("reservar concurrente: solo una de dos recibe enviar", async () => {
  const { db } = dbFalsa({ activo: true });
  const [a, b] = await Promise.all([manejar(db, OC, sinCorreo), manejar(db, OC, sinCorreo)]);
  assertEquals([a.json, b.json].filter((j) => (j as { enviar: boolean }).enviar).length, 1);
});

Deno.test("reservar con bandera apagada o fuera de la lista: omitido y no se manda después", async () => {
  const apagada = dbFalsa({ activo: false });
  assertEquals((await manejar(apagada.db, OC, sinCorreo)).json, { enviar: false, motivo: "WhatsApp apagado" });
  assertEquals(apagada.tabla.get("po1")?.estado, "omitido");
  const lista = dbFalsa({ activo: true, solo_vendor_ids: ["v9"] });
  assertEquals((await manejar(lista.db, OC, sinCorreo)).json, { enviar: false, motivo: "proveedor fuera de la prueba" });
  // Prenderla después no la manda: la fila ya existe.
  const despues = dbFalsa({ activo: true }, [...apagada.tabla.values()]);
  assertEquals((await manejar(despues.db, OC, sinCorreo)).json, { enviar: false, motivo: "ya registrada", estado: "omitido" });
});

Deno.test("sin configuración de whatsapp cuenta como apagado", async () => {
  const { db } = dbFalsa(undefined);
  assertEquals((await manejar(db, OC, sinCorreo)).json, { enviar: false, motivo: "WhatsApp apagado" });
});

Deno.test("resultado enviado guarda teléfono e id; fallido y sin_numero avisan a compras con número enmascarado", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_name: "ODISA", estado: "reservado" }]);
  await manejar(db, { accion: "resultado", zoho_po_id: "po1", estado: "enviado", telefono: "55 1234 5678", wa_message_id: "wamid.1" }, sinCorreo);
  assertEquals([tabla.get("po1")?.estado, tabla.get("po1")?.telefono, tabla.get("po1")?.wa_message_id], ["enviado", "+525512345678", "wamid.1"]);

  const correos: { asunto: string; html: string }[] = [];
  const correo = (_to: string[], asunto: string, html: string) => { correos.push({ asunto, html }); return Promise.resolve(true); };
  const f = dbFalsa({ activo: true }, [{ zoho_po_id: "po2", po_number: "COM-OC-01501", vendor_name: "MAHA", estado: "reservado" }]);
  await manejar(f.db, { accion: "resultado", zoho_po_id: "po2", estado: "fallido", telefono: "5598765432", error: "Meta 131026" }, { correo });
  assertEquals(f.tabla.get("po2")?.estado, "fallido");
  assertEquals(correos[0].asunto, "WhatsApp: no se mandó la OC COM-OC-01501");
  assertEquals(correos[0].html.includes("…5432"), true);
  assertEquals(correos[0].html.includes("5598765432"), false);

  const g = dbFalsa({ activo: true }, [{ zoho_po_id: "po3", po_number: "COM-OC-01502", vendor_name: "B&<C>", estado: "reservado" }]);
  await manejar(g.db, { accion: "resultado", zoho_po_id: "po3", estado: "sin_numero" }, { correo });
  assertEquals(correos[1].html.includes("B&amp;&lt;C&gt;"), true);
  assertEquals(correos[1].html.includes("WhatsApp OCs"), true);
});

Deno.test("resultado solo actúa sobre una fila reservada", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "X", estado: "leido" }]);
  const r = await manejar(db, { accion: "resultado", zoho_po_id: "po1", estado: "fallido" }, sinCorreo);
  assertEquals(r.status, 409);
  assertEquals(tabla.get("po1")?.estado, "leido");
});

Deno.test("estado_meta avanza y nunca retrocede; failed avisa", async () => {
  const { db, tabla } = dbFalsa({ activo: true }, [{ zoho_po_id: "po1", po_number: "COM-OC-01500", vendor_name: "ODISA", estado: "enviado", wa_message_id: "w1" }]);
  await manejar(db, { accion: "estado_meta", wa_message_id: "w1", estado: "read" }, sinCorreo);
  assertEquals(tabla.get("po1")?.estado, "leido");
  await manejar(db, { accion: "estado_meta", wa_message_id: "w1", estado: "delivered" }, sinCorreo);
  assertEquals(tabla.get("po1")?.estado, "leido");
  let avisos = 0;
  const f = dbFalsa({ activo: true }, [{ zoho_po_id: "po2", po_number: "COM-OC-01501", vendor_name: "MAHA", estado: "enviado", wa_message_id: "w2" }]);
  await manejar(f.db, { accion: "estado_meta", wa_message_id: "w2", estado: "failed", error: "no entregable" }, { correo: () => { avisos++; return Promise.resolve(true); } });
  assertEquals([f.tabla.get("po2")?.estado, avisos], ["fallido", 1]);
});

Deno.test("respuesta: liga al último envío del número y reenvía a compras; sin OC dice sin OC ligada", async () => {
  const correos: { asunto: string; html: string }[] = [];
  const correo = (_to: string[], asunto: string, html: string) => { correos.push({ asunto, html }); return Promise.resolve(true); };
  const { db } = dbFalsa({ activo: true }, [
    { zoho_po_id: "a", po_number: "COM-OC-01", vendor_name: "ODISA", telefono: "+525512345678", estado: "leido", enviado_at: "2026-11-20T10:00:00Z" },
    { zoho_po_id: "b", po_number: "COM-OC-02", vendor_name: "ODISA", telefono: "+525512345678", estado: "enviado", enviado_at: "2026-11-21T10:00:00Z" },
  ]);
  const r = await manejar(db, { accion: "respuesta", telefono: "5215512345678", texto: "Recibido <ok>" }, { correo });
  assertEquals((r.json as { po_number: string }).po_number, "COM-OC-02");
  assertEquals(correos[0].asunto, "WhatsApp de ODISA sobre COM-OC-02");
  assertEquals(correos[0].html.includes("Recibido &lt;ok&gt;"), true);
  await manejar(db, { accion: "respuesta", telefono: "5500000000", texto: "hola" }, { correo });
  assertEquals(correos[1].asunto, "WhatsApp de …0000 sin OC ligada");
});

Deno.test("acción desconocida o datos faltantes → 400", async () => {
  const { db } = dbFalsa({ activo: true });
  assertEquals((await manejar(db, { accion: "x" }, sinCorreo)).status, 400);
  assertEquals((await manejar(db, { accion: "reservar", zoho_po_id: "" }, sinCorreo)).status, 400);
});
