// supabase/functions/zoho-compras-sync/servicio_test.ts
import { assertEquals } from "@std/assert";
import { enfriando, semanasTocadas } from "./servicio.ts";

Deno.test("enfriando: 10 minutos desde la última corrida buena, salvo forzar", () => {
  const ahora = new Date("2026-11-25T12:00:00Z");
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, false), true);
  assertEquals(enfriando("2026-11-25T11:45:00Z", ahora, false), false);
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, true), false);
  assertEquals(enfriando(null, ahora, false), false);
});

Deno.test("semanasTocadas: lunes únicos ordenados; ignora fechas vacías", () => {
  assertEquals(semanasTocadas(["2026-11-22", "2026-11-17", "", "2026-11-24"]), ["2026-11-16", "2026-11-23"]);
});
