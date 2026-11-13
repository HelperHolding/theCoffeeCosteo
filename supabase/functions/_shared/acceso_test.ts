import { assertEquals } from "@std/assert";
import { autorizado, efectosExternos } from "./acceso.ts";

const con = (h: Record<string, string>) => new Request("http://x/", { method: "POST", headers: h });

Deno.test("efectosExternos solo con COM_EFECTOS_EXTERNOS=si", () => {
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
  assertEquals(efectosExternos(), false);
  Deno.env.set("COM_EFECTOS_EXTERNOS", "SI ");
  assertEquals(efectosExternos(), false);
  Deno.env.set("COM_EFECTOS_EXTERNOS", "si");
  assertEquals(efectosExternos(), true);
  Deno.env.delete("COM_EFECTOS_EXTERNOS");
});

Deno.test("autorizado exige x-com-secreto igual a COM_SECRETO; sin secreto configurado, nadie pasa", () => {
  Deno.env.delete("COM_SECRETO");
  assertEquals(autorizado(con({ "x-com-secreto": "" })), false);
  Deno.env.set("COM_SECRETO", "s3cr3to-largo");
  assertEquals(autorizado(con({})), false);
  assertEquals(autorizado(con({ "x-com-secreto": "otro" })), false);
  assertEquals(autorizado(con({ "Authorization": "Bearer s3cr3to-largo" })), false);
  assertEquals(autorizado(con({ "x-com-secreto": "s3cr3to-largo" })), true);
  Deno.env.delete("COM_SECRETO");
});
