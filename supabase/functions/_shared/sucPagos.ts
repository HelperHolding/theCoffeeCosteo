// Núcleo de pagos de Sucursales propias en Zoho Books (spec §5 y §7). Puro: recibe Zoho y la base como interfaces.
import { ZohoError } from "./zoho.ts";

export interface ZohoPagos {
  get<T>(path: string, params?: Record<string, string>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  subir<T>(path: string, campo: string, datos: Uint8Array, nombre: string): Promise<T>;
  listAll<T>(path: string, key: string, params?: Record<string, string>): Promise<T[]>;
}

export interface FilaTransferencia {
  id: number;
  llave: string;
  clabe: string | null;
  concepto: string;
  monto: number;
  fecha_operacion: string;
  archivo_pdf: string;
  proveedor_zoho_id: string | null;
  proveedor_nombre: string | null;
  /** true si el proveedor salió por nombre parecido y nadie lo ha confirmado. */
  sugerido: boolean;
  estado: string;
  zoho_vendorpayment_id: string | null;
  adjunto_ok: boolean;
}

export interface FilaAsignacion {
  bill_id: string;
  bill_numero: string;
  monto: number;
}

export interface RepoPagos {
  transferencia(id: number): Promise<FilaTransferencia | null>;
  asignaciones(id: number): Promise<FilaAsignacion[]>;
  /** Update condicional: solo cambia la fila si su estado actual está en `desde` (y, si se da `vencidaAntesDe`, su actualizado_en es anterior). true si la cambió. */
  marcar(id: number, desde: string[], cambios: Record<string, unknown>, vencidaAntesDe?: string): Promise<boolean>;
  recibo(ruta: string): Promise<Uint8Array>;
  cuenta(): Promise<{ id: string | null; nombre: string }>;
  guardarCuenta(id: string): Promise<void>;
  guardarEquivalencia(clabe: string, proveedorId: string, nombre: string): Promise<void>;
}

/** Misma forma que `Factura` en lib/sucursales-propias/empate.ts (el portal la recibe tal cual). */
export interface Factura {
  billId: string;
  vendorId: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  saldo: number;
  ubicacion: string;
  notas: string;
}

export type ResultadoAplicar = { estado: string; mensaje?: string; pagoId?: string };

const APLICABLES = ["cuadra", "error", "aplicando"];
const RESERVABLES = ["cuadra", "error"];
/** Una reserva "aplicando" más vieja que esto se considera caída y otra persona puede retomarla. */
const VIGENCIA_RESERVA_MS = 10 * 60_000;
const cent = (n: number) => Math.round(n * 100);
const normal = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
const ahora = () => new Date().toISOString();

export async function pagoConReferencia(zoho: ZohoPagos, vendorId: string, llave: string): Promise<string | null> {
  const j = await zoho.get<{ vendorpayments?: { payment_id: string; reference_number?: string }[] }>(
    "/vendorpayments", { vendor_id: vendorId, search_text: llave },
  );
  return j.vendorpayments?.find((p) => p.reference_number === llave)?.payment_id ?? null;
}

async function cuentaPago(repo: RepoPagos, zoho: ZohoPagos): Promise<string> {
  const c = await repo.cuenta();
  if (c.id) return c.id;
  const cuentas = await zoho.listAll<{ account_id: string; account_name: string; account_type: string }>(
    "/chartofaccounts", "chartofaccounts",
  );
  const objetivo = normal(c.nombre);
  const hallados = cuentas.filter((a) => a.account_type === "bank" && normal(a.account_name).startsWith(objetivo));
  if (hallados.length !== 1) {
    throw new ZohoError(`no encontré una sola cuenta bancaria "${c.nombre}" (encontré ${hallados.length})`, 0);
  }
  await repo.guardarCuenta(hallados[0].account_id);
  return hallados[0].account_id;
}

async function adjuntarYCerrar(
  repo: RepoPagos, zoho: ZohoPagos, t: FilaTransferencia, asig: FilaAsignacion[],
): Promise<ResultadoAplicar> {
  const pagoId = t.zoho_vendorpayment_id!;
  try {
    const pdf = await repo.recibo(t.archivo_pdf);
    const nombre = `recibo-${t.llave.replace(/[^A-Za-z0-9-]/g, "_")}.pdf`;
    try {
      await zoho.subir(`/vendorpayments/${pagoId}/attachment`, "attachment", pdf, nombre);
    } catch (e) {
      // Si la API no admite adjuntos en pagos (spec §5), el recibo va en cada factura liquidada.
      if (!(e instanceof ZohoError) || ![400, 404, 405].includes(e.status)) throw e;
      for (const a of asig) await zoho.subir(`/bills/${a.bill_id}/attachment`, "attachment", pdf, nombre);
    }
    await repo.marcar(t.id, ["aplicada_sin_adjunto"], { estado: "aplicada", adjunto_ok: true, error: null });
    return { estado: "aplicada", pagoId };
  } catch (e) {
    const mensaje = `Pago registrado en Zoho, pero no se pudo adjuntar el recibo: ${e instanceof Error ? e.message : "error"}`;
    await repo.marcar(t.id, ["aplicada_sin_adjunto"], { error: mensaje });
    return { estado: "aplicada_sin_adjunto", pagoId, mensaje };
  }
}

export async function aplicar(repo: RepoPagos, zoho: ZohoPagos, id: number, usuario: string): Promise<ResultadoAplicar> {
  const t = await repo.transferencia(id);
  if (!t) return { estado: "error", mensaje: "La transferencia no existe." };
  if (t.estado === "aplicada" || t.estado === "ya_aplicada") {
    return { estado: t.estado, pagoId: t.zoho_vendorpayment_id ?? undefined };
  }
  if (t.estado === "aplicada_sin_adjunto") return adjuntarYCerrar(repo, zoho, t, await repo.asignaciones(id));
  if (!APLICABLES.includes(t.estado) || !t.proveedor_zoho_id) {
    return { estado: t.estado, mensaje: "La transferencia no está lista para aplicarse." };
  }
  // Reserva antes de llamar a Zoho: dos clics o dos personas no crean dos pagos.
  // "aplicando" solo se retoma si su reserva venció (la comparación va dentro del mismo update condicional).
  const reservada = (await repo.marcar(id, RESERVABLES, { estado: "aplicando", error: null })) ||
    (t.estado === "aplicando" &&
      (await repo.marcar(id, ["aplicando"], { estado: "aplicando", error: null },
        new Date(Date.now() - VIGENCIA_RESERVA_MS).toISOString())));
  if (!reservada) return { estado: t.estado, mensaje: "Otra persona la está aplicando." };
  // Lectura fresca tras reservar: una edición del portal entre la primera lectura y la reserva no manda un proveedor viejo.
  const fresca = await repo.transferencia(id);
  if (!fresca?.proveedor_zoho_id) {
    const mensaje = "La transferencia cambió y ya no tiene proveedor; revísala.";
    await repo.marcar(id, ["aplicando"], { estado: "error", error: mensaje });
    return { estado: "error", mensaje };
  }
  const tf = fresca;
  const vendorId = fresca.proveedor_zoho_id;
  const asig = await repo.asignaciones(id);
  // Compuerta final: la base no obliga en toda escritura que lo asignado sume el monto; se revisa antes de tocar Zoho.
  if (asig.length === 0 || cent(asig.reduce((s, x) => s + x.monto, 0)) !== cent(tf.monto)) {
    const mensaje = "Lo asignado no es igual a la transferencia; revisa el reparto.";
    await repo.marcar(id, ["aplicando"], { estado: "no_cuadra", error: mensaje });
    return { estado: "no_cuadra", mensaje };
  }
  let pagoId: string | null = null;
  try {
    // Cubre el pago creado cuya respuesta se perdió (fila atorada en "aplicando" o en "error").
    const previo = await pagoConReferencia(zoho, vendorId, tf.llave);
    if (previo) {
      await repo.marcar(id, ["aplicando"], {
        estado: "ya_aplicada", zoho_vendorpayment_id: previo, aplicado_por: usuario, aplicado_en: ahora(),
      });
      return { estado: "ya_aplicada", pagoId: previo };
    }
    for (const a of asig) {
      const { bill } = await zoho.get<{ bill: { balance: number; vendor_id: string } }>(`/bills/${a.bill_id}`);
      if (bill.vendor_id !== vendorId) {
        const mensaje = `La factura ${a.bill_numero} es de otro proveedor en Zoho. Revisa la fila.`;
        await repo.marcar(id, ["aplicando"], { estado: "no_cuadra", error: mensaje });
        return { estado: "no_cuadra", mensaje };
      }
      if (cent(bill.balance) < cent(a.monto)) {
        const mensaje = `El saldo de la factura ${a.bill_numero} cambió en Zoho ($${bill.balance.toFixed(2)}). Revisa la fila.`;
        await repo.marcar(id, ["aplicando"], { estado: "no_cuadra", error: mensaje });
        return { estado: "no_cuadra", mensaje };
      }
    }
    const cuenta = await cuentaPago(repo, zoho);
    const r = await zoho.post<{ vendorpayment: { payment_id: string } }>("/vendorpayments", {
      vendor_id: vendorId,
      date: tf.fecha_operacion,
      amount: tf.monto,
      paid_through_account_id: cuenta,
      reference_number: tf.llave,
      description: tf.concepto,
      bills: asig.map((a) => ({ bill_id: a.bill_id, amount_applied: a.monto })),
    });
    pagoId = r.vendorpayment.payment_id;
    await repo.marcar(id, ["aplicando"], {
      estado: "aplicada_sin_adjunto", zoho_vendorpayment_id: pagoId, aplicado_por: usuario, aplicado_en: ahora(),
    });
    if (tf.clabe && tf.proveedor_nombre && !tf.sugerido) {
      // La equivalencia es una ayuda: si no se guarda, el pago ya quedó bien. Un proveedor sugerido por nombre
      // y no confirmado no se memoriza: un empate equivocado se repetiría en cada corrida.
      await repo.guardarEquivalencia(tf.clabe, vendorId, tf.proveedor_nombre).catch(() => {});
    }
    return adjuntarYCerrar(repo, zoho, { ...tf, estado: "aplicada_sin_adjunto", zoho_vendorpayment_id: pagoId }, asig);
  } catch (e) {
    if (pagoId) {
      // El pago ya existe en Zoho: nunca debe quedar como "error" (un reintento lo duplicaría a ojos del usuario).
      const mensaje = `El pago se registró en Zoho (id ${pagoId}) pero no se pudo guardar el resultado; reintenta para adjuntar el recibo.`;
      try {
        await repo.marcar(id, ["aplicando"], { estado: "aplicada_sin_adjunto", zoho_vendorpayment_id: pagoId, error: mensaje });
      } catch { /* sin más recurso: la referencia en Zoho cubre el reintento */ }
      return { estado: "aplicada_sin_adjunto", pagoId, mensaje };
    }
    const mensaje = e instanceof ZohoError ? `Zoho: ${e.message}` : "No se pudo completar el pago.";
    await repo.marcar(id, ["aplicando"], { estado: "error", error: mensaje });
    return { estado: "error", mensaje };
  }
}

interface FacturaZoho {
  bill_id: string;
  vendor_id: string;
  bill_number: string;
  date: string;
  due_date: string;
  balance: number;
  location_name?: string;
  notes?: string;
}

export async function facturasAbiertas(zoho: ZohoPagos, vendorIds: string[]): Promise<Factura[]> {
  const vistas = new Map<string, Factura>();
  for (const vendor_id of [...new Set(vendorIds)]) {
    for (const status of ["open", "overdue", "partially_paid"]) {
      const bills = await zoho.listAll<FacturaZoho>("/bills", "bills", { vendor_id, status });
      for (const b of bills) {
        if (!(b.balance > 0)) continue;
        vistas.set(b.bill_id, {
          billId: b.bill_id, vendorId: b.vendor_id, numero: b.bill_number, fecha: b.date, vencimiento: b.due_date,
          saldo: b.balance, ubicacion: b.location_name ?? "", notas: b.notes ?? "",
        });
      }
    }
  }
  return [...vistas.values()];
}

export async function listarProveedores(zoho: ZohoPagos): Promise<{ id: string; nombre: string }[]> {
  const c = await zoho.listAll<{ contact_id: string; contact_name: string }>(
    "/contacts", "contacts", { contact_type: "vendor", filter_by: "Status.Active" },
  );
  return c.map((x) => ({ id: x.contact_id, nombre: x.contact_name })).sort((a, b) => a.nombre.localeCompare(b.nombre));
}
