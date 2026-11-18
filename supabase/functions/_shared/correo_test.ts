import { assertEquals } from "@std/assert";
import { enviarCorreo } from "./correo.ts";

Deno.test("sin efectos externos no manda correos y responde ok", async () => {
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
  const original = globalThis.fetch;
  let llamadas = 0;
  globalThis.fetch = (() => { llamadas++; return Promise.resolve(new Response("{}")); }) as typeof fetch;
  try {
    assertEquals(await enviarCorreo(["a@b.mx"], "x", "<p>x</p>"), true);
    assertEquals(llamadas, 0);
  } finally {
    globalThis.fetch = original;
  }
});

Deno.test("con efectos usa CORREO_URL y CORREO_LLAVE", async () => {
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si");
  Deno.env.set("CORREO_URL", "https://viejo.example/functions/v1/send-email");
  Deno.env.set("CORREO_LLAVE", "llave-vieja");
  const original = globalThis.fetch;
  const vistos: string[] = [];
  globalThis.fetch = ((u: string, i?: RequestInit) => {
    vistos.push(`${u} ${(i?.headers as Record<string, string>).Authorization}`);
    return Promise.resolve(new Response("{}"));
  }) as typeof fetch;
  try {
    assertEquals(await enviarCorreo(["a@b.mx"], "x", "<p>x</p>"), true);
    assertEquals(vistos, ["https://viejo.example/functions/v1/send-email Bearer llave-vieja"]);
  } finally {
    globalThis.fetch = original;
    for (const k of ["COM_EFECTOS_EXTERNOS", "CORREO_URL", "CORREO_LLAVE"]) Deno.env.delete(k);
  }
});
