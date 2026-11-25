import { assertEquals, assertThrows } from "@std/assert";
import type { Lectura } from "../_shared/reporte/reporte.ts";
import { decidirLectura, usarCache, validarSemana } from "./servicio.ts";

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

const ok = <T>(datos: T) => ({ ok: true as const, datos });
const mal = (error: string) => ({ ok: false as const, error });
const lect = (o: Record<string, unknown> = {}) =>
  ({ facturas: ok([]), paquetes: ok([]), ovs: ok([]), descripciones: ok({}), notas: ok([]), pendientes: ok([]), ...o }) as unknown as Lectura;
// deno-lint-ignore no-explicit-any
const cacheFila = { datos: {} as any, leido_en: "2026-11-24T11:45:00Z" };
const ahora2 = new Date("2026-11-24T12:00:00Z");

Deno.test("decidirLectura: todo ok guarda caché", () => {
  assertEquals(decidirLectura(lect(), cacheFila, ahora2), { usar: "nuevo", guardar: true, aviso: null });
  assertEquals(decidirLectura(lect(), null, ahora2), { usar: "nuevo", guardar: true, aviso: null });
});

Deno.test("decidirLectura: una fuente falla con caché devuelve la caché con aviso de la primera fallida", () => {
  const l = lect({ paquetes: mal("Zoho no respondió: paquetes"), notas: mal("Zoho no respondió: notas") });
  assertEquals(decidirLectura(l, cacheFila, ahora2), { usar: "cache", aviso: "Datos de hace 15 min; Zoho no respondió: paquetes" });
});

Deno.test("decidirLectura: una fuente falla sin caché da reporte parcial sin guardar", () => {
  assertEquals(decidirLectura(lect({ notas: mal("x") }), null, ahora2),
    { usar: "nuevo", guardar: false, aviso: "Algunas secciones no se pudieron leer de Zoho." });
});

Deno.test("decidirLectura: todas fallan sin caché es error; con caché usa la caché", () => {
  const l = lect({ facturas: mal("a"), paquetes: mal("b"), ovs: mal("c"), descripciones: mal("d"), notas: mal("e"), pendientes: mal("f") });
  assertEquals(decidirLectura(l, null, ahora2), { usar: "error", error: "a" });
  assertEquals(decidirLectura(l, cacheFila, ahora2), { usar: "cache", aviso: "Datos de hace 15 min; a" });
});
