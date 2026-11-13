import { assertEquals, assertRejects } from "@std/assert";
import { ZohoClient, ZohoError } from "./zoho.ts";

type Resp = { status: number; body: unknown };
function fakeFetch(seq: Resp[], log: string[]) {
  return (input: string | URL | Request, init?: RequestInit) => {
    log.push(`${init?.method ?? "GET"} ${String(input)}`);
    const r = seq.shift();
    if (!r) throw new Error("sin respuesta preparada");
    return Promise.resolve(new Response(JSON.stringify(r.body), { status: r.status }));
  };
}
const tok = { status: 200, body: { access_token: "T1", expires_in: 3600 } };
const cfg = (seq: Resp[], log: string[]) => ({
  clientId: "c", clientSecret: "s", refreshToken: "r", orgId: "891749429",
  fetchFn: fakeFetch(seq, log) as typeof fetch, sleep: () => Promise.resolve(),
});

Deno.test("listAll pagina hasta has_more_page=false y reutiliza el token", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([
    tok,
    { status: 200, body: { code: 0, items: [{ sku: "A" }], page_context: { has_more_page: true } } },
    { status: 200, body: { code: 0, items: [{ sku: "B" }], page_context: { has_more_page: false } } },
  ], log));
  const items = await z.listAll<{ sku: string }>("/items", "items");
  assertEquals(items.map((i) => i.sku), ["A", "B"]);
  assertEquals(log.filter((l) => l.includes("oauth")).length, 1);
  assertEquals(log[1].includes("organization_id=891749429") && log[1].includes("page=1"), true);
  assertEquals(log[2].includes("page=2"), true);
  assertEquals(z.llamadas, 2);
});

Deno.test("reintenta 429 y luego responde", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 429, body: {} }, { status: 200, body: { code: 0, ok: 1 } }], log));
  assertEquals((await z.get<{ ok: number }>("/x")).ok, 1);
  assertEquals(z.llamadas, 2);
});

Deno.test("POST con 500 lanza sin reintentar (evita OC duplicada)", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 500, body: {} }], log));
  await assertRejects(() => z.post("/purchaseorders", {}), ZohoError);
  assertEquals(z.llamadas, 1);
  assertEquals(log.filter((l) => l.startsWith("POST ") && l.includes("/purchaseorders")).length, 1);
});

Deno.test("POST con 429 reintenta y luego responde", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 429, body: {} }, { status: 200, body: { code: 0, ok: 1 } }], log));
  assertEquals((await z.post<{ ok: number }>("/purchaseorders", {})).ok, 1);
  assertEquals(z.llamadas, 2);
});

Deno.test("refresca el token ante 401 una vez", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 401, body: { code: 57 } }, tok, { status: 200, body: { code: 0, ok: 1 } }], log));
  assertEquals((await z.get<{ ok: number }>("/x")).ok, 1);
});

Deno.test("error de negocio (code != 0) lanza ZohoError", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 400, body: { code: 1001, message: "malo" } }], log));
  await assertRejects(() => z.post("/purchaseorders", {}), ZohoError, "malo");
});

Deno.test("falla de token lanza ZohoError", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([{ status: 200, body: { error: "invalid_code" } }], log));
  await assertRejects(() => z.get("/x"), ZohoError, "invalid_code");
});

Deno.test("error a media paginación propaga (no devuelve parcial)", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([
    tok,
    { status: 200, body: { code: 0, items: [{ sku: "A" }], page_context: { has_more_page: true } } },
    { status: 500, body: {} }, { status: 500, body: {} }, { status: 500, body: {} },
  ], log));
  await assertRejects(() => z.listAll("/items", "items"), ZohoError);
});

Deno.test("PUT con 500 lanza sin reintentar y con 429 reintenta", async () => {
  const log: string[] = [];
  const z = new ZohoClient(cfg([tok, { status: 500, body: {} }], log));
  await assertRejects(() => z.put("/contacts/1", {}), ZohoError);
  assertEquals(log.filter((l) => l.startsWith("PUT ")).length, 1);
  const log2: string[] = [];
  const z2 = new ZohoClient(cfg([tok, { status: 429, body: {} }, { status: 200, body: { code: 0, ok: 1 } }], log2));
  assertEquals((await z2.put<{ ok: number }>("/contacts/1", {})).ok, 1);
});

Deno.test("soloLectura: GET pasa; POST y PUT se bloquean sin llamar a Zoho", async () => {
  const log: string[] = [];
  const z = new ZohoClient({ ...cfg([tok, { status: 200, body: { code: 0, contacts: [] } }], log), soloLectura: true });
  await z.get("/contacts");
  await assertRejects(() => z.post("/purchaseorders", {}), ZohoError, "sin efectos externos");
  await assertRejects(() => z.put("/contacts/1", {}), ZohoError, "sin efectos externos");
  assertEquals(log.filter((l) => !l.includes("/oauth/")).map((l) => l.split(" ")[0]), ["GET"]);
});
