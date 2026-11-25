import { assertEquals, assertRejects } from "@std/assert";
import { ZohoClient, ZohoError } from "./zoho.ts";

const cfg = { clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "999", sleep: async () => {} };
const token = () => new Response(JSON.stringify({ access_token: "tk", expires_in: 3600 }));

Deno.test("subir manda multipart con el archivo, sin Content-Type JSON", async () => {
  const vistos: { url: string; init?: RequestInit }[] = [];
  const fetchFn = (async (url: string, init?: RequestInit) => {
    if (url.includes("/oauth/")) return token();
    vistos.push({ url, init });
    return new Response(JSON.stringify({ code: 0, message: "ok" }));
  }) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn });
  await z.subir("/vendorpayments/p1/attachment", "attachment", new Uint8Array([37, 80, 68, 70]), "recibo.pdf");
  assertEquals(vistos.length, 1);
  assertEquals(vistos[0].url, "https://www.zohoapis.com/books/v3/vendorpayments/p1/attachment?organization_id=999");
  const h = vistos[0].init!.headers as Record<string, string>;
  assertEquals(h.Authorization, "Zoho-oauthtoken tk");
  assertEquals(h["Content-Type"], undefined);
  const form = vistos[0].init!.body as FormData;
  const archivo = form.get("attachment") as File;
  assertEquals(archivo.name, "recibo.pdf");
  assertEquals(archivo.type, "application/pdf");
  assertEquals(archivo.size, 4);
});

Deno.test("subir no envía nada en modo sin efectos externos", async () => {
  let llamadas = 0;
  const fetchFn = (async () => { llamadas++; return token(); }) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn, soloLectura: true });
  await assertRejects(() => z.subir("/bills/b1/attachment", "attachment", new Uint8Array([1]), "a.pdf"), ZohoError);
  assertEquals(llamadas, 0);
});

Deno.test("subir propaga el error de Zoho con su status", async () => {
  const fetchFn = (async (url: string) =>
    url.includes("/oauth/") ? token() : new Response(JSON.stringify({ code: 5, message: "URL inválida" }), { status: 404 })) as typeof fetch;
  const z = new ZohoClient({ ...cfg, fetchFn });
  const e = await assertRejects(() => z.subir("/x", "attachment", new Uint8Array([1]), "a.pdf"), ZohoError);
  assertEquals((e as ZohoError).status, 404);
});
