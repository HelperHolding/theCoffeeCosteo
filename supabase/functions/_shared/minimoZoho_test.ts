import { assertEquals } from "@std/assert";
import { enviarMinimo, guardarMinimoPlataforma, mensajeErrorZoho, MENSAJE_PERMISO, validarMonto } from "./minimoZoho.ts";
import { ZohoError } from "./zoho.ts";

Deno.test("validarMonto acepta números y textos con miles, hasta 2 decimales", () => {
  assertEquals(validarMonto("15,000.50"), 15000.5);
  assertEquals(validarMonto(0), 0);
  assertEquals(validarMonto("0"), 0);
  assertEquals(validarMonto(15000), 15000);
  assertEquals(validarMonto(" 20 "), 20);
  assertEquals(validarMonto("$1,200"), 1200);
});

Deno.test("validarMonto rechaza negativos, texto, vacío, nulo, más de 2 decimales y no finitos", () => {
  for (const x of [-1, "-5", "abc", "", "  ", null, undefined, NaN, Infinity, "1.234", 1.005, {}, [], true]) {
    assertEquals(validarMonto(x), null, String(x));
  }
});

Deno.test("mensajeErrorZoho: 401, 403 y code 57 son falta de permiso; otro, el mensaje de Zoho", () => {
  assertEquals(mensajeErrorZoho(new ZohoError("x", 401)), MENSAJE_PERMISO);
  assertEquals(mensajeErrorZoho(new ZohoError("x", 403)), MENSAJE_PERMISO);
  assertEquals(mensajeErrorZoho(new ZohoError("x", 400, 57)), MENSAJE_PERMISO);
  assertEquals(MENSAJE_PERMISO, "Falta permiso de escritura de contactos en Zoho");
  assertEquals(mensajeErrorZoho(new ZohoError("Campo inválido", 400, 4)), "Campo inválido");
  assertEquals(mensajeErrorZoho(new Error("red caída")), "red caída");
});

type Op = { tabla: string; accion: string; valor?: unknown; filtros: unknown[][] };
function fakeDb(previo: unknown = { minimo_compra: 100 }) {
  const log: Op[] = [];
  const db = {
    from(tabla: string) {
      const op: Op = { tabla, accion: "", filtros: [] };
      const q: Record<string, unknown> = {};
      q.eq = (...a: unknown[]) => { op.filtros.push(["eq", ...a]); return q; };
      q.select = () => { if (!op.accion) op.accion = "select"; return q; };
      q.update = (v: unknown) => { op.accion = "update"; op.valor = v; return q; };
      q.insert = (v: unknown) => { op.accion = "insert"; op.valor = v; return q; };
      q.maybeSingle = q.single = () => q;
      q.then = (ok: (v: unknown) => unknown, ko: (e: unknown) => unknown) => {
        log.push(op);
        return Promise.resolve({ data: op.accion === "select" ? previo : null, error: null }).then(ok, ko);
      };
      return q;
    },
  };
  return { db: db as never, log };
}

Deno.test("enviarMinimo: PUT solo con el campo personalizado y deja el estado al día", async () => {
  const f = fakeDb();
  const puts: unknown[][] = [];
  const z = { put: (p: string, b: unknown) => { puts.push([p, b]); return Promise.resolve({ contact: { custom_field_hash: { cf_x: 15000.5 } } }); } } as never;
  const r = await enviarMinimo(f.db, z, { vendor_id: "V1", monto: 15000.5, apiName: "cf_x" });
  assertEquals(r, { ok: true });
  assertEquals(puts, [["/contacts/V1", { custom_fields: [{ api_name: "cf_x", value: 15000.5 }] }]]);
  const u = f.log.find((o) => o.accion === "update")!;
  assertEquals(u.valor, { minimo_pendiente: false, minimo_zoho_visto: 15000.5, minimo_error: null });
  assertEquals(u.filtros, [["eq", "vendor_id", "V1"], ["eq", "minimo_compra", 15000.5]]);
});

Deno.test("enviarMinimo: si Zoho falla deja el error, sigue pendiente y no lanza", async () => {
  const f = fakeDb();
  const z = { put: () => Promise.reject(new ZohoError("no", 403)) } as never;
  const r = await enviarMinimo(f.db, z, { vendor_id: "V1", monto: 10, apiName: "cf_x" });
  assertEquals(r, { ok: false, error: MENSAJE_PERMISO });
  const u = f.log.find((o) => o.accion === "update")!;
  assertEquals(u.valor, { minimo_error: MENSAJE_PERMISO });
});

Deno.test("guardarMinimoPlataforma guarda, marca pendiente y registra el cambio", async () => {
  const f = fakeDb({ minimo_compra: 100 });
  await guardarMinimoPlataforma(f.db, { vendor_id: "V1", monto: 250, por: "ana" });
  const u = f.log.find((o) => o.accion === "update")!.valor as Record<string, unknown>;
  assertEquals({ ...u, minimo_editado_at: typeof u.minimo_editado_at }, {
    minimo_compra: 250, minimo_origen: "plataforma", minimo_editado_at: "string", minimo_editado_por: "ana",
    minimo_pendiente: true, minimo_error: null,
  });
  const ins = f.log.find((o) => o.tabla === "com_sync_cambios" && o.accion === "insert")!.valor as Record<string, unknown>;
  assertEquals(ins.tabla, "com_zoho_proveedor");
  assertEquals(ins.clave, "V1");
  assertEquals(ins.campo, "minimo_compra");
  assertEquals(ins.antes, 100);
  assertEquals(ins.despues, 250);
  assertEquals(ins.origen, "plataforma");
  assertEquals(ins.aplicado, true);
  assertEquals(typeof ins.corrida, "string");
});

Deno.test("validarMonto: coma decimal, científica y tope se rechazan; miles válidos se aceptan", () => {
  for (const x of ["1,5", "1,50", "1.234,5", "12,34", "1e5", "1E3", 100_000_001, "100000001"]) assertEquals(validarMonto(x), null, String(x));
  assertEquals(validarMonto("1,234,567.89"), 1234567.89);
  assertEquals(validarMonto(100_000_000), 100_000_000);
  assertEquals(validarMonto("1,500"), 1500);
});

Deno.test("enviarMinimo: limpiar pendiente exige que minimo_compra siga igual al monto enviado", async () => {
  const f = fakeDb();
  const z = { put: () => Promise.resolve({ contact: { custom_field_hash: { cf_x: 10 } } }) } as never;
  await enviarMinimo(f.db, z, { vendor_id: "V1", monto: 10, apiName: "cf_x" });
  const u = f.log.find((o) => o.accion === "update")!;
  assertEquals(u.filtros, [["eq", "vendor_id", "V1"], ["eq", "minimo_compra", 10]]);
});

Deno.test("enviarMinimo: la respuesta no trae el valor (campo inexistente): sigue pendiente con el aviso", async () => {
  for (const resp of [{}, { contact: {} }, { contact: { custom_field_hash: {} } }, { contact: { custom_field_hash: { cf_x: "" } } }, { contact: { custom_field_hash: { cf_x: 5 } } }]) {
    const f = fakeDb();
    const r = await enviarMinimo(f.db, { put: () => Promise.resolve(resp) } as never, { vendor_id: "V1", monto: 10, apiName: "cf_x" });
    assertEquals(r, { ok: false, error: "Zoho no guardó el valor (¿existe el campo?)" });
    const us = f.log.filter((o) => o.accion === "update");
    assertEquals(us.length, 1);
    assertEquals(us[0].valor, { minimo_error: "Zoho no guardó el valor (¿existe el campo?)" });
  }
});

Deno.test("enviarMinimo: el valor vuelto como texto cuenta (\"15000\" y \"15000.00\")", async () => {
  for (const v of ["15000", "15000.00", 15000]) {
    const f = fakeDb();
    const r = await enviarMinimo(f.db, { put: () => Promise.resolve({ contact: { custom_field_hash: { cf_x: v } } }) } as never, { vendor_id: "V1", monto: 15000, apiName: "cf_x" });
    assertEquals(r, { ok: true });
    assertEquals(f.log.find((o) => o.accion === "update")!.valor, { minimo_pendiente: false, minimo_zoho_visto: 15000, minimo_error: null });
  }
});
