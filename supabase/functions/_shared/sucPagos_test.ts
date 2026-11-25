import { assertEquals, assertMatch } from "@std/assert";
import { ZohoError } from "./zoho.ts";
import { aplicar, facturasAbiertas, type FilaTransferencia, type RepoPagos, type ZohoPagos } from "./sucPagos.ts";

type Llamada = { m: string; path: string; body?: unknown; params?: Record<string, string> };

function zohoFalso(o: {
  pagosPrevios?: { payment_id: string; reference_number: string }[];
  saldos?: Record<string, number>;
  vendores?: Record<string, string>;
  fallarPost?: boolean;
  adjuntoPago?: "ok" | 404 | 500;
  adjuntoFactura?: "ok" | 500;
}) {
  const llamadas: Llamada[] = [];
  const z: ZohoPagos = {
    async get<T>(path: string, params: Record<string, string> = {}) {
      llamadas.push({ m: "GET", path, params });
      if (path === "/vendorpayments") return { vendorpayments: o.pagosPrevios ?? [] } as T;
      const b = /^\/bills\/(.+)$/.exec(path);
      if (b) return { bill: { balance: o.saldos?.[b[1]] ?? 0, vendor_id: o.vendores?.[b[1]] ?? "v-oh" } } as T;
      throw new Error(`GET inesperado ${path}`);
    },
    async post<T>(path: string, body: unknown) {
      llamadas.push({ m: "POST", path, body });
      if (o.fallarPost) throw new ZohoError("El proveedor está inactivo", 400, 1001);
      return { vendorpayment: { payment_id: "pago-1" } } as T;
    },
    async subir<T>(path: string) {
      llamadas.push({ m: "SUBIR", path });
      const r = path.startsWith("/vendorpayments") ? (o.adjuntoPago ?? "ok") : (o.adjuntoFactura ?? "ok");
      if (r !== "ok") throw new ZohoError("falla adjunto", r);
      return {} as T;
    },
    async listAll<T>(path: string) {
      llamadas.push({ m: "LIST", path });
      if (path === "/chartofaccounts")
        return [
          { account_id: "c-otra", account_name: "BANREGIO - OTRA", account_type: "bank" },
          { account_id: "c-151", account_name: "BANREGIO - CONSOLIDADO SUCURSALES PROPIAS - *0151", account_type: "bank" },
        ] as T[];
      throw new Error(`LIST inesperado ${path}`);
    },
  };
  return { z, llamadas };
}

function repoFalso(t: Partial<FilaTransferencia> = {}) {
  const fila: FilaTransferencia = {
    id: 1, llave: "058-20/11/2026/20-X1", clabe: "012535000000001111", concepto: "PAGO FACTURAS", monto: 400,
    fecha_operacion: "2026-11-20", archivo_pdf: "5/abc.pdf", proveedor_zoho_id: "v-oh", proveedor_nombre: "OH LALA", sugerido: false,
    estado: "cuadra", zoho_vendorpayment_id: null, adjunto_ok: false, ...t,
  };
  const estado = { fila, cuentaId: null as string | null, equivalencias: [] as string[], actualizado: new Date().toISOString(), fallarMarcar: [] as string[] };
  const repo: RepoPagos = {
    async transferencia() { return { ...estado.fila }; },
    async asignaciones() { return [{ bill_id: "b1", bill_numero: "A1", monto: 300 }, { bill_id: "b2", bill_numero: "A2", monto: 100 }]; },
    async marcar(_id, desde, cambios, vencidaAntesDe) {
      if (!desde.includes(estado.fila.estado)) return false;
      if (vencidaAntesDe && !(estado.actualizado < vencidaAntesDe)) return false;
      // Falla simulada de la base al guardar una transición concreta (una sola vez).
      const k = estado.fallarMarcar.indexOf(String(cambios.estado));
      if (k >= 0) { estado.fallarMarcar.splice(k, 1); throw new Error("base caída"); }
      estado.actualizado = new Date().toISOString();
      estado.fila = { ...estado.fila, ...cambios } as FilaTransferencia;
      return true;
    },
    async recibo() { return new Uint8Array([1, 2, 3]); },
    async cuenta() { return { id: estado.cuentaId, nombre: "BANREGIO - CONSOLIDADO SUCURSALES PROPIAS" }; },
    async guardarCuenta(id) { estado.cuentaId = id; },
    async guardarEquivalencia(clabe, pid) { estado.equivalencias.push(`${clabe}:${pid}`); },
  };
  return { repo, estado };
}

const SALDOS = { b1: 300, b2: 500 };

Deno.test("cuadra: crea el pago repartido, adjunta al pago, guarda cuenta y equivalencia", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "aplicada", pagoId: "pago-1" });
  const post = llamadas.find((l) => l.m === "POST")!;
  assertEquals(post.path, "/vendorpayments");
  assertEquals(post.body, {
    vendor_id: "v-oh", date: "2026-11-20", amount: 400, paid_through_account_id: "c-151",
    reference_number: "058-20/11/2026/20-X1", description: "PAGO FACTURAS",
    bills: [{ bill_id: "b1", amount_applied: 300 }, { bill_id: "b2", amount_applied: 100 }],
  });
  assertEquals(llamadas.filter((l) => l.m === "SUBIR").map((l) => l.path), ["/vendorpayments/pago-1/attachment"]);
  assertEquals(estado.fila.estado, "aplicada");
  assertEquals(estado.fila.adjunto_ok, true);
  assertEquals((estado.fila as unknown as Record<string, unknown>).aplicado_por, "u1");
  assertEquals(estado.cuentaId, "c-151");
  assertEquals(estado.equivalencias, ["012535000000001111:v-oh"]);
});

Deno.test("si el pago ya existe en Zoho con esa referencia, no crea otro", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, pagosPrevios: [{ payment_id: "viejo", reference_number: "058-20/11/2026/20-X1" }] });
  const { repo, estado } = repoFalso({ estado: "error" });
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "ya_aplicada", pagoId: "viejo" });
  assertEquals(llamadas.some((l) => l.m === "POST"), false);
  assertEquals(estado.fila.zoho_vendorpayment_id, "viejo");
});

Deno.test("una referencia que solo se parece no cuenta como pago previo", async () => {
  const { z } = zohoFalso({ saldos: SALDOS, pagosPrevios: [{ payment_id: "otro", reference_number: "058-20/11/2026/20-X10" }] });
  const { repo } = repoFalso();
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
});

Deno.test("si un saldo bajó en Zoho, no paga y regresa a no_cuadra", async () => {
  const { z, llamadas } = zohoFalso({ saldos: { b1: 300, b2: 50 } });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r.estado, "no_cuadra");
  assertMatch(r.mensaje!, /A2 cambió en Zoho \(\$50\.00\)/);
  assertEquals(llamadas.some((l) => l.m === "POST"), false);
  assertEquals(estado.fila.estado, "no_cuadra");
});

Deno.test("error de Zoho al crear el pago: queda en error con el mensaje", async () => {
  const { z } = zohoFalso({ saldos: SALDOS, fallarPost: true });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "error", mensaje: "Zoho: El proveedor está inactivo" });
  assertEquals(estado.fila.estado, "error");
});

Deno.test("si Zoho no acepta adjunto en el pago, adjunta a cada factura", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, adjuntoPago: 404 });
  const { repo } = repoFalso();
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
  assertEquals(llamadas.filter((l) => l.m === "SUBIR").map((l) => l.path), [
    "/vendorpayments/pago-1/attachment", "/bills/b1/attachment", "/bills/b2/attachment",
  ]);
});

Deno.test("si el adjunto falla, queda aplicada_sin_adjunto y el reintento solo adjunta", async () => {
  const z1 = zohoFalso({ saldos: SALDOS, adjuntoPago: 500 });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z1.z, 1, "u1");
  assertEquals(r.estado, "aplicada_sin_adjunto");
  assertEquals(estado.fila.estado, "aplicada_sin_adjunto");
  const z2 = zohoFalso({ saldos: SALDOS });
  assertEquals((await aplicar(repo, z2.z, 1, "u1")).estado, "aplicada");
  assertEquals(z2.llamadas.some((l) => l.m === "POST"), false);
  assertEquals(z2.llamadas.map((l) => l.m), ["SUBIR"]);
});

Deno.test("una transferencia ya aplicada, no lista o tomada por otro no llama a Zoho", async () => {
  for (const [estado, esperado] of [["aplicada", "aplicada"], ["desconocido", "desconocido"], ["no_cuadra", "no_cuadra"]]) {
    const { z, llamadas } = zohoFalso({ saldos: SALDOS });
    const { repo } = repoFalso({ estado, zoho_vendorpayment_id: estado === "aplicada" ? "p" : null });
    assertEquals((await aplicar(repo, z, 1, "u1")).estado, esperado);
    assertEquals(llamadas.length, 0);
  }
  const { z } = zohoFalso({ saldos: SALDOS });
  const { repo } = repoFalso();
  repo.marcar = async () => false;
  assertMatch((await aplicar(repo, z, 1, "u1")).mensaje!, /Otra persona/);
});

Deno.test("la cuenta guardada se usa sin volver a listar el catálogo", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  estado.cuentaId = "c-guardada";
  await aplicar(repo, z, 1, "u1");
  assertEquals(llamadas.some((l) => l.m === "LIST"), false);
  assertEquals((llamadas.find((l) => l.m === "POST")!.body as { paid_through_account_id: string }).paid_through_account_id, "c-guardada");
});

Deno.test("facturasAbiertas junta los tres estados sin repetir y deja solo saldo > 0", async () => {
  const pedidas: Record<string, string>[] = [];
  const z = {
    async listAll<T>(_p: string, _k: string, params: Record<string, string>) {
      pedidas.push(params);
      const base = { vendor_id: params.vendor_id, date: "2026-11-06", due_date: "2026-11-13", location_name: "DARIO" };
      if (params.status === "overdue") return [{ ...base, bill_id: "b1", bill_number: "A1", balance: 300 }] as T[];
      if (params.status === "partially_paid") return [{ ...base, bill_id: "b1", bill_number: "A1", balance: 300 }, { ...base, bill_id: "b0", bill_number: "A0", balance: 0 }] as T[];
      return [] as T[];
    },
  } as unknown as ZohoPagos;
  const f = await facturasAbiertas(z, ["v1", "v1"]);
  assertEquals(pedidas.length, 3);
  assertEquals(f, [{ billId: "b1", vendorId: "v1", numero: "A1", fecha: "2026-11-06", vencimiento: "2026-11-13", saldo: 300, ubicacion: "DARIO", notas: "" }]);
});

Deno.test("si lo asignado no suma el monto, no llama a Zoho y queda no_cuadra", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso({ monto: 500 }); // asignaciones falsas suman 400
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "no_cuadra", mensaje: "Lo asignado no es igual a la transferencia; revisa el reparto." });
  assertEquals(llamadas.length, 0);
  assertEquals(estado.fila.estado, "no_cuadra");
});

Deno.test("sin asignaciones tampoco llama a Zoho", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  repo.asignaciones = async () => [];
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "no_cuadra");
  assertEquals(llamadas.length, 0);
  assertEquals(estado.fila.estado, "no_cuadra");
});

Deno.test("una segunda llamada con la fila en aplicando vigente no llama a Zoho", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo } = repoFalso({ estado: "aplicando" });
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r.estado, "aplicando");
  assertMatch(r.mensaje!, /Otra persona/);
  assertEquals(llamadas.length, 0);
});

Deno.test("una reserva aplicando de hace 11 minutos se retoma", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso({ estado: "aplicando" });
  estado.actualizado = new Date(Date.now() - 11 * 60_000).toISOString();
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
  assertEquals(llamadas.some((l) => l.m === "GET" && l.path === "/vendorpayments"), true);
});

Deno.test("si el pago se creó y falla guardar el resultado, queda aplicada_sin_adjunto y no error", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso();
  estado.fallarMarcar.push("aplicada_sin_adjunto");
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r.estado, "aplicada_sin_adjunto");
  assertEquals(r.pagoId, "pago-1");
  assertMatch(r.mensaje!, /pago-1/);
  assertEquals(estado.fila.estado, "aplicada_sin_adjunto");
  assertEquals(estado.fila.zoho_vendorpayment_id, "pago-1");
  assertEquals(llamadas.filter((l) => l.m === "POST").length, 1);
});

Deno.test("usa la fila fresca tras reservar (proveedor editado entre lecturas)", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, vendores: { b1: "v-nuevo", b2: "v-nuevo" } });
  const { repo, estado } = repoFalso();
  const original = repo.marcar;
  repo.marcar = async (...a) => {
    const ok = await original(...a);
    if (ok && a[2].estado === "aplicando") estado.fila = { ...estado.fila, proveedor_zoho_id: "v-nuevo" };
    return ok;
  };
  await aplicar(repo, z, 1, "u1");
  assertEquals((llamadas.find((l) => l.m === "POST")!.body as { vendor_id: string }).vendor_id, "v-nuevo");
});

Deno.test("un proveedor sugerido por nombre se paga pero no se guarda como equivalencia", async () => {
  const { z } = zohoFalso({ saldos: SALDOS });
  const { repo, estado } = repoFalso({ sugerido: true });
  assertEquals((await aplicar(repo, z, 1, "u1")).estado, "aplicada");
  assertEquals(estado.equivalencias, []);
});

Deno.test("si una factura es de otro proveedor en Zoho, no paga y queda no_cuadra", async () => {
  const { z, llamadas } = zohoFalso({ saldos: SALDOS, vendores: { b2: "v-otro" } });
  const { repo, estado } = repoFalso();
  const r = await aplicar(repo, z, 1, "u1");
  assertEquals(r, { estado: "no_cuadra", mensaje: "La factura A2 es de otro proveedor en Zoho. Revisa la fila." });
  assertEquals(llamadas.some((l) => l.m === "POST"), false);
  assertEquals(estado.fila.estado, "no_cuadra");
});
