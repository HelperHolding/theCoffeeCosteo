// supabase/functions/zoho-compras-sync/servicio_test.ts
import { assertEquals } from "@std/assert";
import { debeAvisar, enfriando, faseSinAvance, semanasTocadas } from "./servicio.ts";

Deno.test("enfriando: 10 minutos desde la última corrida buena, salvo forzar", () => {
  const ahora = new Date("2026-11-25T12:00:00Z");
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, false), true);
  assertEquals(enfriando("2026-11-25T11:45:00Z", ahora, false), false);
  assertEquals(enfriando("2026-11-25T11:55:00Z", ahora, true), false);
  assertEquals(enfriando(null, ahora, false), false);
});

Deno.test("semanasTocadas: lunes únicos ordenados; ignora fechas vacías y semanas anteriores al periodo guardado", () => {
  assertEquals(semanasTocadas(["2026-11-22", "2026-11-17", "", "2026-11-24", "2026-03-04"], "2026-08-03"), ["2026-11-16", "2026-11-23"]);
});

Deno.test("debeAvisar: correo solo cuando la corrida que acaba de fallar es la segunda seguida después de una buena", () => {
  assertEquals(debeAvisar([false, false, true]), true);
  assertEquals(debeAvisar([false, true, true]), false);
  assertEquals(debeAvisar([false, false, false]), false);
  assertEquals(debeAvisar([false, false]), false);
});

Deno.test("faseSinAvance: una fase con error y sin filas ni omitidos cuenta como falla de la corrida", () => {
  assertEquals(faseSinAvance({ filas: [], omitidos: [], error: "403" }), true);
  assertEquals(faseSinAvance({ filas: [1], omitidos: [], error: "429" }), false);
  assertEquals(faseSinAvance({ filas: [], omitidos: [], error: null }), false);
});
