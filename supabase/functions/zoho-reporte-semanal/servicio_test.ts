import { assertEquals, assertThrows } from "@std/assert";
import { usarCache, validarSemana } from "./servicio.ts";

Deno.test("validarSemana: solo lunes ISO", () => {
  assertEquals(validarSemana("2026-11-16"), "2026-11-16");
  assertThrows(() => validarSemana("2026-11-18"), Error, "Semana no válida");
  assertThrows(() => validarSemana(undefined), Error, "Semana no válida");
});

Deno.test("usarCache: 15 minutos, sin forzar y posterior al último cambio de configuración", () => {
  const ahora = new Date("2026-11-24T12:00:00Z");
  const c = { leido_en: "2026-11-24T11:50:00Z" };
  assertEquals(usarCache(c, null, ahora, false), true);
  assertEquals(usarCache(c, null, ahora, true), false);
  assertEquals(usarCache({ leido_en: "2026-11-24T11:40:00Z" }, null, ahora, false), false);
  assertEquals(usarCache(c, "2026-11-24T11:55:00Z", ahora, false), false);
  assertEquals(usarCache(null, null, ahora, false), false);
});
