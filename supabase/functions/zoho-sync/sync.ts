import { camposDeZoho, difCatalogo, type ItemZohoCompleto, leadTimeDeZoho } from "../_shared/catalogoZoho.ts";
import { type Abierta, conciliar, excedeTope, lineasDesdeZoho } from "../_shared/conciliarOc.ts";
import { enviarCorreo } from "../_shared/correo.ts";
import { cargarConfig, type SupabaseClient, todo } from "../_shared/db.ts";
import { hoyCdmx } from "../_shared/fechas.ts";
import { conciliarMinimo } from "../_shared/minimos.ts";
import { enviarMinimo, MENSAJE_PERMISO, validarMonto } from "../_shared/minimoZoho.ts";
import type { ZohoClient } from "../_shared/zoho.ts";

// Lista negra: cualquier estado de Zoho que no cierre la OC (draft, open, billed, partially_received, …)
// puede traer unidades pendientes por recibir. Lo pendiente se decide por línea (cantidad − recibida).
export const ESTADOS_OC_CERRADOS = new Set(["closed", "cancelled", "void"]);

export function ocAbierta(status: string): boolean {
  return !ESTADOS_OC_CERRADOS.has(String(status ?? "").toLowerCase());
}

/** Minutos mínimos entre syncs exitosos: protege la cuota diaria de la API de Zoho. */
export const SYNC_MIN_MINUTOS = 5;

export async function syncReciente(db: SupabaseClient, ahora = new Date()): Promise<boolean> {
  const { data, error } = await db.from("com_sync_log").select("fin").eq("proceso", "zoho-sync").eq("ok", true)
    .not("fin", "is", null).order("fin", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data?.fin) return false;
  return ahora.getTime() - new Date(data.fin).getTime() < SYNC_MIN_MINUTOS * 60_000;
}

export const SKU_MARCADOR = "(sin-sku)";

export type ItemZoho = ItemZohoCompleto & {
  item_id: string; stock_on_hand?: number; actual_available_stock?: number; vendor_id?: string;
};
export type OcZoho = {
  purchaseorder_id: string; purchaseorder_number: string; status: string; last_modified_time: string;
  vendor_id: string; vendor_name: string; delivery_date?: string; date?: string; reference_number?: string;
  currency_code?: string; // moneda de la OC ("MXN", "USD"…); puede faltar
  received_status?: string; // en la lista: "received", "partially_received", "to_be_received"…; puede faltar
  line_items?: { item_id: string; sku?: string; quantity: number; quantity_received?: number; rate?: number }[];
};

/**
 * OC de la LISTA que vale la pena sincronizar: no cerrada y no recibida por completo.
 * Saltar las "received" antes de pedir el detalle evita cientos de llamadas por OCs "billed" históricas.
 * Sin received_status se decide solo por status.
 */
export function ocParaSincronizar(o: OcZoho): boolean {
  return ocAbierta(o.status) && String(o.received_status ?? "").toLowerCase() !== "received";
}
export type FilaOc = {
  zoho_po_id: string; po_number: string; status: string; po_modified: string; vendor_id: string; vendor_name: string;
  sku: string; cantidad: number; cantidad_recibida: number; fecha_entrega: string | null; es_auto: boolean; synced_at: string;
  precio: number | null; fecha_oc: string | null;
};
export type FilaCatalogo = {
  sku: string; zoho_item_id: string; zoho_stock: number; zoho_stock_fisico: number | null; zoho_vendor_id: string | null;
  zoho_vendor_name: string | null; zoho_lead_time: number | null; zoho_sync_at: string;
};

export type ContactoZoho = {
  contact_id: string; contact_name: string; vendor_name?: string; company_name?: string; status?: string;
  payment_terms?: number | string; payment_terms_label?: string;
  custom_field_hash?: Record<string, unknown>; last_modified_time?: string;
};
export type ResolverProveedor = (nombre: string | null | undefined) => string | null;

/** Normaliza un nombre de proveedor: sin acentos, minúsculas y espacios colapsados. */
export function normalizarNombre(n: string | null | undefined): string {
  return String(n ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "").replace(/\s+/g, " ").trim().toLowerCase();
}

/** Mapa nombre normalizado → contact_id. Gana el primero; los "active" se indexan antes que el resto. */
export function resolverProveedores(contactos: ContactoZoho[]): ResolverProveedor {
  const mapa = new Map<string, string>();
  const activo = (c: ContactoZoho) => String(c.status ?? "").toLowerCase() === "active";
  const ordenados = [...contactos.filter(activo), ...contactos.filter((c) => !activo(c))];
  for (const c of ordenados) {
    for (const n of [c.contact_name, c.vendor_name, c.company_name]) {
      const k = normalizarNombre(n);
      if (k && !mapa.has(k)) mapa.set(k, c.contact_id);
    }
  }
  return (nombre) => mapa.get(normalizarNombre(nombre)) ?? null;
}

/** actual_available_stock de Zoho como número, o null si no viene o no es numérico. */
export function fisicoDe(x: unknown): number | null {
  if (x === null || x === undefined || (typeof x === "string" && x.trim() === "")) return null;
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

const inactivo = (i: { status?: string }) => String(i.status ?? "").toLowerCase() === "inactive";

/**
 * Un artículo por SKU (los sin SKU pasan tal cual). Con Status.All puede haber un activo y un inactivo
 * con el mismo SKU: gana el activo; entre iguales, el primero.
 */
export function unoPorSku<T extends { sku?: string; status?: string }>(items: T[]): T[] {
  const pos = new Map<string, number>();
  const out: T[] = [];
  for (const i of items) {
    if (!i.sku) { out.push(i); continue; }
    const k = pos.get(i.sku);
    if (k === undefined) { pos.set(i.sku, out.length); out.push(i); }
    else if (inactivo(out[k]) && !inactivo(i)) out[k] = i;
  }
  return out;
}

export function filasCatalogo(
  items: ItemZoho[], skusConocidos: Set<string>, ahora: string,
  resolver: ResolverProveedor = () => null, proveedorPorSku: Record<string, string | null | undefined> = {},
) {
  const filas: FilaCatalogo[] = [];
  const desconocidos: string[] = [];
  const sinId = new Set<string>();
  let sinSku = 0;
  for (const i of unoPorSku(items)) {
    if (!i.sku) { sinSku++; continue; }
    if (!skusConocidos.has(i.sku)) { desconocidos.push(i.sku); continue; }
    const lt = parseInt(i.cf_lead_time_proveedor ?? "", 10);
    const nombre = i.vendor_name || proveedorPorSku[i.sku] || null;
    const vendorId = i.vendor_id || resolver(nombre) || null;
    if (nombre && !vendorId) sinId.add(nombre);
    filas.push({
      sku: i.sku, zoho_item_id: i.item_id, zoho_stock: Number(i.stock_on_hand ?? 0),
      // Físico en mano. Ausente o no numérico → null (el cálculo cae al contable); nunca 0 inventado.
      zoho_stock_fisico: fisicoDe(i.actual_available_stock),
      zoho_vendor_id: vendorId, zoho_vendor_name: nombre,
      zoho_lead_time: Number.isFinite(lt) ? lt : null, zoho_sync_at: ahora,
    });
  }
  return { filas, desconocidos, sinSku, proveedoresSinId: [...sinId] };
}

export function filasProveedor(contactos: ContactoZoho[], ahora: string) {
  return contactos.map((c) => {
    const n = Math.round(Number(c.payment_terms));
    return {
      vendor_id: c.contact_id, nombre: c.contact_name, dias_credito: Number.isFinite(n) && n > 0 ? n : 0,
      etiqueta: c.payment_terms_label ?? null, synced_at: ahora,
    };
  });
}

export function filasOc(oc: OcZoho, skuPorItem: Record<string, string>, ahora: string): FilaOc[] {
  const porSku = new Map<string, FilaOc>();
  // Precio ponderado por cantidad, solo con las líneas que traen rate.
  const acum = new Map<string, { sumQR: number; qConRate: number }>();
  for (const l of oc.line_items ?? []) {
    const sku = l.sku || skuPorItem[l.item_id];
    if (!sku) continue;
    const f = porSku.get(sku) ?? {
      zoho_po_id: oc.purchaseorder_id, po_number: oc.purchaseorder_number, status: oc.status,
      po_modified: oc.last_modified_time, vendor_id: oc.vendor_id, vendor_name: oc.vendor_name, sku,
      cantidad: 0, cantidad_recibida: 0, fecha_entrega: oc.delivery_date || null,
      es_auto: (oc.reference_number ?? "").startsWith("AUTO-"), synced_at: ahora,
      precio: null, fecha_oc: oc.date || null,
    };
    const q = Number(l.quantity || 0);
    f.cantidad += q;
    f.cantidad_recibida += Number(l.quantity_received || 0);
    porSku.set(sku, f);
    const rate = l.rate == null ? NaN : Number(l.rate);
    if (Number.isFinite(rate)) {
      const a = acum.get(sku) ?? { sumQR: 0, qConRate: 0 };
      a.sumQR += q * rate;
      a.qConRate += q;
      acum.set(sku, a);
    }
  }
  // Una OC en otra moneda nunca se suma como pesos: sin precio, la proyección la lista en sinCosto.
  const enPesos = oc.currency_code == null || oc.currency_code === "MXN";
  for (const [sku, f] of porSku) {
    const a = acum.get(sku);
    // Precio unitario sin redondear: solo el monto se redondea (en proyectar).
    f.precio = enPesos && a && a.qConRate > 0 ? a.sumQR / a.qConRate : null;
  }
  return [...porSku.values()];
}

export async function sincronizar(db: SupabaseClient, z: ZohoClient, ahora = new Date().toISOString()) {
  // 1. Todo lo de Zoho se lee completo ANTES de escribir; si algo falla, no se toca la base.
  // Todos los artículos (también inactivos): el estatus Inactivo de Zoho debe llegar al catálogo.
  const items = await z.listAll<ItemZoho>("/items", "items", { filter_by: "Status.All" });
  const lista = await z.listAll<OcZoho>("/purchaseorders", "purchaseorders");
  // El listado de items trae vendor_name pero no vendor_id: el id se resuelve por nombre contra los proveedores.
  const contactos = await z.listAll<ContactoZoho>("/contacts", "contacts", { contact_type: "vendor" });
  const abiertas = lista.filter(ocParaSincronizar);

  const { data: cat, error: e1 } = await db.from("com_catalogo").select("sku, proveedor_preferido");
  if (e1) throw e1;
  const { data: prev, error: e2 } = await db.from("com_zoho_oc_lineas").select("*");
  if (e2) throw e2;

  const catalogo = (cat ?? []) as { sku: string; proveedor_preferido?: string | null }[];
  const cf = filasCatalogo(
    items, new Set(catalogo.map((c) => c.sku)), ahora, resolverProveedores(contactos),
    Object.fromEntries(catalogo.map((c) => [c.sku, c.proveedor_preferido])),
  );
  const skuPorItem = Object.fromEntries(items.filter((i) => i.sku).map((i) => [i.item_id, i.sku!]));

  const previasPorOc = new Map<string, FilaOc[]>();
  for (const p of (prev ?? []) as FilaOc[]) previasPorOc.set(p.zoho_po_id, [...(previasPorOc.get(p.zoho_po_id) ?? []), p]);

  const nuevas: FilaOc[] = [];
  let detallesPedidos = 0;
  for (const o of abiertas) {
    const previas = previasPorOc.get(o.purchaseorder_id);
    if (
      previas && previas[0].po_modified === o.last_modified_time && previas[0].status === o.status &&
      !previas.some((p) => p.sku !== SKU_MARCADOR && p.precio == null)
    ) {
      nuevas.push(...previas.map((p) => ({ ...p, synced_at: ahora })));
      continue;
    }
    const d = await z.get<{ purchaseorder: OcZoho }>(`/purchaseorders/${o.purchaseorder_id}`);
    detallesPedidos++;
    const filas = filasOc(d.purchaseorder, skuPorItem, ahora);
    if (filas.length) nuevas.push(...filas);
    else {
      // Marcador: sin filas útiles igual se cachea para no volver a pedir el detalle.
      const p = d.purchaseorder;
      nuevas.push({
        zoho_po_id: p.purchaseorder_id, po_number: p.purchaseorder_number, status: p.status,
        po_modified: p.last_modified_time, vendor_id: p.vendor_id, vendor_name: p.vendor_name,
        sku: SKU_MARCADOR, cantidad: 0, cantidad_recibida: 0, fecha_entrega: p.delivery_date || null,
        es_auto: (p.reference_number ?? "").startsWith("AUTO-"), synced_at: ahora,
        precio: null, fecha_oc: p.date || null,
      });
    }
  }

  // 2. Escribir
  for (let i = 0; i < cf.filas.length; i += 200) {
    for (const f of cf.filas.slice(i, i + 200)) {
      const { error } = await db.from("com_catalogo").update(f).eq("sku", f.sku);
      if (error) throw error;
    }
  }
  // Upsert primero y luego borrar lo no tocado: nunca queda la tabla vacía a medias.
  if (nuevas.length) {
    const { error: e4 } = await db.from("com_zoho_oc_lineas").upsert(nuevas, { onConflict: "zoho_po_id,sku" });
    if (e4) throw e4;
  }
  const { error: e3 } = await db.from("com_zoho_oc_lineas").delete().lt("synced_at", ahora);
  if (e3) throw e3;

  // 3. Plataforma al día con Zoho (artículos y lista de OCs). Nunca tumba el sync: los errores van al resumen.
  const corrida = crypto.randomUUID();
  let modo: ModoCatalogo = "registrar", correos: string[] = [];
  try {
    const cfg = await cargarConfig(db);
    modo = cfg.auto.sync_catalogo;
    correos = cfg.auto.correos;
  } catch { /* sin configuración: solo se registra */ }
  let articulos = { articulosCambiados: 0, articulosPropuestos: 0, leadTimesCambiados: 0 };
  let articulosError: string | undefined;
  try {
    articulos = await aplicarCatalogo(db, items, corrida, modo);
  } catch (err) {
    articulosError = String((err as Error)?.message ?? err);
  }
  let oc: ResultadoConciliacion = { ocCerradas: 0, ocAgregadas: 0, ocAjustadas: 0, ocQuitadas: 0, ocRetenidas: 0, ocFallas: 0 };
  let conciliacionError: string | undefined;
  try {
    oc = await conciliarPlataforma(db, corrida, hoyCdmx(new Date(ahora)), correos);
  } catch (err) {
    conciliacionError = String((err as Error)?.message ?? err);
  }

  // Días de crédito: solo alimentan la proyección de pagos, así que un fallo aquí nunca tumba el sync (ni la generación de OCs).
  let proveedoresError: string | undefined;
  let minimoCampo: "ok" | "falta" | undefined;
  let minimos = { aplicados_zoho: 0, enviados: 0, errores: 0 };
  try {
    const proveedores = filasProveedor(contactos, ahora);
    for (let i = 0; i < proveedores.length; i += 500) {
      const { error } = await db.from("com_zoho_proveedor").upsert(proveedores.slice(i, i + 500), { onConflict: "vendor_id" });
      if (error) throw error;
    }
    const m = await conciliarMinimos(db, z, contactos, corrida);
    minimoCampo = m.minimoCampo;
    minimos = m.minimos;
  } catch (err) {
    proveedoresError = String((err as Error)?.message ?? err);
  }
  return {
    articulos: cf.filas.length, sinFisico: cf.filas.filter((f) => f.zoho_stock_fisico === null).length, ocs: abiertas.length, detallesPedidos, desconocidos: cf.desconocidos, proveedoresSinId: cf.proveedoresSinId,
    llamadas: z.llamadas, articulosModo: modo, ...articulos, ...oc,
    ...(articulosError ? { articulosError } : {}), ...(conciliacionError ? { conciliacionError } : {}),
    ...(proveedoresError ? { proveedoresError } : {}),
    ...(minimoCampo ? { minimoCampo } : {}), minimos,
  };
}

// --- Mínimo de compra del proveedor <-> campo del contacto en Zoho ---

/** ¿Existe el campo personalizado en los contactos/proveedores de Zoho? */
function campoExiste(resp: unknown, apiName: string): boolean {
  const cf = (resp as { customfields?: unknown } | null)?.customfields;
  // El identificador cf_… puede venir en api_name o en placeholder (no confirmado en vivo): vale cualquiera de los dos.
  const coincide = (c: unknown) => {
    const x = c as { api_name?: string; placeholder?: string } | null;
    return x?.api_name === apiName || x?.placeholder === apiName;
  };
  const tiene = (l: unknown) => Array.isArray(l) && l.some(coincide);
  if (Array.isArray(cf)) return cf.some(coincide);
  const o = (cf ?? {}) as Record<string, unknown>;
  return tiene(o.contact) || tiene(o.vendor);
}

type EstadoProveedor = { vendor_id: string; minimo_compra: number; minimo_zoho_visto: number | null; minimo_pendiente: boolean; minimo_editado_at: string | null };

/**
 * Concilia el mínimo de cada proveedor con el campo de Zoho. Si el campo no existe no hace nada
 * (ausente nunca se toma como 0). A lo más un envío por proveedor por corrida; un error de permiso
 * detiene los demás envíos de la corrida (quedan pendientes).
 */
async function conciliarMinimos(db: SupabaseClient, z: ZohoClient, contactos: ContactoZoho[], corrida: string) {
  const minimos = { aplicados_zoho: 0, enviados: 0, errores: 0 };
  const apiName = (await cargarConfig(db)).auto.zoho_cf_minimo;
  const campos = await z.get<unknown>("/settings/customfields");
  if (!campoExiste(campos, apiName)) return { minimoCampo: "falta" as const, minimos };

  const estados = new Map((await todo<EstadoProveedor>((a, b) =>
    db.from("com_zoho_proveedor").select("vendor_id, minimo_compra, minimo_zoho_visto, minimo_pendiente, minimo_editado_at")
      .order("vendor_id").range(a, b))).map((e) => [e.vendor_id, e]));
  const log: Cambio[] = [];
  let sinPermiso = false;
  for (const c of contactos) {
    const e = estados.get(c.contact_id);
    if (!e) continue;
    const crudo = c.custom_field_hash?.[apiName];
    const vacio = crudo === undefined || crudo === null || (typeof crudo === "string" && crudo.trim() === "");
    const zv = vacio ? 0 : validarMonto(crudo); // el campo existe: vacío = 0; un valor ilegible se ignora
    if (zv === null) continue;
    const est: EstadoProveedor = {
      ...e, minimo_compra: Number(e.minimo_compra) || 0,
      minimo_zoho_visto: e.minimo_zoho_visto === null || e.minimo_zoho_visto === undefined ? null : Number(e.minimo_zoho_visto),
      minimo_pendiente: !!e.minimo_pendiente,
    };
    const r = conciliarMinimo(est, zv, c.last_modified_time ?? null);
    // Compare-and-set: solo escribe si la fila sigue como en la lectura (una edición simultánea de la plataforma no se pisa).
    const cas = async (valores: Record<string, unknown>): Promise<boolean> => {
      let q = db.from("com_zoho_proveedor").update(valores).eq("vendor_id", c.contact_id).eq("minimo_pendiente", est.minimo_pendiente);
      q = est.minimo_editado_at === null || est.minimo_editado_at === undefined
        ? q.is("minimo_editado_at", null) : q.eq("minimo_editado_at", est.minimo_editado_at);
      const { data, error } = await q.select("vendor_id");
      if (error) throw error;
      return (data ?? []).length > 0;
    };
    if (r.accion === "aplicar_zoho") {
      const cambia = r.valor !== est.minimo_compra;
      const aplicado = await cas(cambia
        ? { minimo_compra: r.valor, minimo_origen: "zoho", minimo_editado_at: c.last_modified_time ?? null, minimo_editado_por: "zoho",
          minimo_zoho_visto: zv, minimo_pendiente: false, minimo_error: null }
        : { minimo_zoho_visto: zv, minimo_pendiente: false, minimo_error: null });
      if (aplicado && cambia) {
        log.push(cambio(corrida, "com_zoho_proveedor", c.contact_id, "minimo_compra", est.minimo_compra, r.valor, true));
        minimos.aplicados_zoho++;
      }
    } else if (r.accion === "reenviar") {
      if (sinPermiso) continue;
      const env = await enviarMinimo(db, z, { vendor_id: c.contact_id, monto: r.valor, apiName });
      if (env.ok) minimos.enviados++;
      else {
        minimos.errores++;
        if (env.error === MENSAJE_PERMISO) sinPermiso = true;
      }
    } else if (est.minimo_zoho_visto === null && !est.minimo_pendiente) {
      await cas({ minimo_zoho_visto: zv });
    }
  }
  await guardarCambios(db, log);
  return { minimoCampo: "ok" as const, minimos };
}

// --- Artículos y lista de OCs de la plataforma al día con Zoho ---

type ModoCatalogo = "aplicar" | "registrar";
type Cambio = { corrida: string; tabla: string; clave: string; campo: string; antes: unknown; despues: unknown; aplicado: boolean; origen: string };

const cambio = (corrida: string, tabla: string, clave: unknown, campo: string, antes: unknown, despues: unknown, aplicado: boolean): Cambio =>
  ({ corrida, tabla, clave: String(clave), campo, antes: antes ?? null, despues: despues ?? null, aplicado, origen: "zoho-sync" });

async function guardarCambios(db: SupabaseClient, filas: Cambio[]) {
  for (let i = 0; i < filas.length; i += 500) {
    const { error } = await db.from("com_sync_cambios").insert(filas.slice(i, i + 500));
    if (error) throw error;
  }
}

/**
 * Modo registrar: una propuesta ya registrada (la última fila aplicado=false de la misma tabla, clave y campo
 * trae el mismo "después") no se vuelve a registrar en cada corrida.
 */
async function sinRepetirPropuestas(db: SupabaseClient, log: Cambio[]): Promise<Cambio[]> {
  if (!log.length) return log;
  const previas = await todo<{ tabla: string; clave: string; campo: string; despues: unknown }>((a, b) =>
    db.from("com_sync_cambios").select("id, tabla, clave, campo, despues").eq("aplicado", false)
      .in("tabla", ["com_catalogo", "com_lead_times"]).order("id").range(a, b));
  const k = (c: { tabla: string; clave: string; campo: string }) => `${c.tabla}|${c.clave}|${c.campo}`;
  const ultima = new Map<string, string>();
  for (const p of previas) ultima.set(k(p), JSON.stringify(p.despues ?? null)); // en orden de id: queda la última
  return log.filter((c) => ultima.get(k(c)) !== JSON.stringify(c.despues));
}

const CAMPOS_CATALOGO ="sku, estatus, origen, costo_unitario, proveedor_preferido, modelo_negocio, clasificacion, clasificacion_detallada, exclusivo_gdl";

/**
 * Campos del catálogo y lead time desde Zoho. En modo "registrar" solo deja la bitácora (aplicado=false).
 * La bitácora se guarda antes de aplicar: si no se puede registrar, no se cambia nada.
 */
export async function aplicarCatalogo(db: SupabaseClient, items: ItemZoho[], corrida: string, modo: ModoCatalogo) {
  const [cat, lts] = await Promise.all([
    todo<Record<string, unknown>>((a, b) => db.from("com_catalogo").select(CAMPOS_CATALOGO).order("sku").range(a, b)),
    todo<{ sku: string; dias: number | null }>((a, b) => db.from("com_lead_times").select("sku,dias").order("sku").range(a, b)),
  ]);
  const porSku = new Map(cat.map((r) => [String(r.sku), r]));
  const dias = new Map(lts.map((r) => [r.sku, r.dias]));
  const aplicar = modo === "aplicar";
  const log: Cambio[] = [];
  const parches: { sku: string; patch: Record<string, unknown> }[] = [];
  const leadTimes: { sku: string; dias: number; existe: boolean }[] = [];
  for (const i of unoPorSku(items)) {
    if (!i.sku || !porSku.has(i.sku)) continue;
    const dif = difCatalogo(porSku.get(i.sku)!, camposDeZoho(i));
    if (dif.length) {
      parches.push({ sku: i.sku, patch: Object.fromEntries(dif.map((d) => [d.campo, d.despues])) });
      for (const d of dif) log.push(cambio(corrida, "com_catalogo", i.sku, d.campo, d.antes, d.despues, aplicar));
    }
    const lt = leadTimeDeZoho(i);
    const actual = dias.get(i.sku);
    if (lt !== null && Number(actual) !== lt) {
      leadTimes.push({ sku: i.sku, dias: lt, existe: dias.has(i.sku) });
      log.push(cambio(corrida, "com_lead_times", i.sku, "dias", actual, lt, aplicar));
    }
  }
  await guardarCambios(db, aplicar ? log : await sinRepetirPropuestas(db, log));
  if (aplicar) {
    for (const p of parches) {
      const { error } = await db.from("com_catalogo").update(p.patch).eq("sku", p.sku);
      if (error) throw error;
    }
    for (const l of leadTimes) {
      // Sin llave única garantizada en com_lead_times: actualizar y, si no había fila, insertar.
      if (l.existe) {
        const { data, error } = await db.from("com_lead_times").update({ dias: l.dias }).eq("sku", l.sku).select("sku");
        if (error) throw error;
        if (data?.length) continue;
      }
      const { error } = await db.from("com_lead_times").insert({ sku: l.sku, dias: l.dias });
      if (error) throw error;
    }
  }
  // articulosCambiados: aplicados (0 en registrar); articulosPropuestos: propuestas en modo registrar.
  return {
    articulosCambiados: aplicar ? parches.length : 0, articulosPropuestos: aplicar ? 0 : parches.length,
    leadTimesCambiados: leadTimes.length,
  };
}

type ResultadoConciliacion = {
  ocCerradas: number; ocAgregadas: number; ocAjustadas: number; ocQuitadas: number; ocRetenidas: number; ocFallas: number;
  ocRetenidasFirma?: string; // SHA-256 de los ids retenidos: evita repetir aviso y bitácora cada 30 min
};

async function firma(s: string): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
type FilaMov = { id: number; sku: string; folio: string | null; fecha: string | null; fecha_arribo: string | null;
  cantidad: number | null; cantidad_recibida: number | null; monto: number | null; proveedor: string | null };

const esc = (s: unknown) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[c]!);

/** Solo si la línea sigue como se leyó (mismo criterio que _zohoOcAplicar en la app). */
// deno-lint-ignore no-explicit-any
function siSigueIgual(q: any, p: Abierta) {
  q = p.recRaw == null ? q.is("cantidad_recibida", null) : q.eq("cantidad_recibida", p.recRaw);
  return p.cantRaw == null ? q.is("cantidad", null) : q.eq("cantidad", p.cantRaw);
}

async function enLotes<T>(xs: T[], n: number, fn: (x: T) => Promise<void>) {
  for (let i = 0; i < xs.length; i += n) await Promise.all(xs.slice(i, i + n).map(fn));
}

/**
 * Lista de OCs de la plataforma (com_movimientos tipo compra) contra las pendientes de Zoho, como "Poner al día" de la app.
 * Si cerraría demasiadas líneas (excedeTope) no cierra ninguna: registra los cierres (aplicado=false) y avisa por correo;
 * ajustes, borradores y altas se aplican igual.
 */
export async function conciliarPlataforma(db: SupabaseClient, corrida: string, hoy: string, correos: string[] = []): Promise<ResultadoConciliacion> {
  // Sin bitácora no se concilia: cada cambio debe poder revisarse y deshacerse.
  const { error: sinBitacora } = await db.from("com_sync_cambios").select("id").limit(1);
  if (sinBitacora) throw sinBitacora;
  const [lineas, rows, cat] = await Promise.all([
    todo<Parameters<typeof lineasDesdeZoho>[0][number]>((a, b) => db.from("com_zoho_oc_lineas")
      .select("po_number, sku, cantidad, cantidad_recibida, fecha_entrega, fecha_oc, vendor_name, precio, status")
      .order("zoho_po_id").order("sku").range(a, b)),
    todo<FilaMov>((a, b) => db.from("com_movimientos")
      .select("id, sku, folio, fecha, fecha_arribo, cantidad, cantidad_recibida, monto, proveedor")
      .eq("tipo", "compra").order("id").range(a, b)),
    todo<{ sku: string }>((a, b) => db.from("com_catalogo").select("sku").order("sku").range(a, b)),
  ]);
  const skuReal = new Map(cat.map((c) => [String(c.sku).trim().toUpperCase(), c.sku]));
  const C = conciliar(lineasDesdeZoho(lineas), rows, hoy);
  const r: ResultadoConciliacion = { ocCerradas: 0, ocAgregadas: 0, ocAjustadas: 0, ocQuitadas: 0, ocRetenidas: 0, ocFallas: 0 };

  // Tope: solo se retienen los cierres; ajustes, borradores y altas se aplican igual.
  const retenida = excedeTope(C);
  if (retenida) {
    r.ocRetenidas = C.cerrar.length;
    // Mismo conjunto retenido que la corrida exitosa anterior: ya se avisó y ya está en la bitácora.
    r.ocRetenidasFirma = await firma(C.cerrar.map((p) => p.id).sort((a, b) => a - b).join(","));
    const { data: previa } = await db.from("com_sync_log").select("resumen").eq("proceso", "zoho-sync").eq("ok", true)
      .not("fin", "is", null).order("inicio", { ascending: false }).limit(1).maybeSingle();
    if (previa?.resumen?.ocRetenidasFirma !== r.ocRetenidasFirma) {
      const folios = [...new Set(C.cerrar.map((p) => p.folio || "(sin folio)"))];
      await enviarCorreo(correos, "⚠ Sincronización con Zoho: conciliación retenida",
        `<p>La sincronización con Zoho iba a cerrar ${C.cerrar.length} de ${C.abiertas.length} líneas de OC abiertas en la plataforma y se detuvo por seguridad. No se cerró ninguna; los demás ajustes sí se aplicaron.</p>` +
        `<p>Folios (primeros 20 de ${folios.length}): ${folios.slice(0, 20).map(esc).join(", ")}</p>` +
        `<p>Revisa con "Poner al día con Zoho" en la app antes de aplicar.</p>`, "Sincronización con Zoho");
      await guardarCambios(db, C.cerrar.map((p) => cambio(corrida, "com_movimientos", p.id, "cantidad_recibida", p.recRaw, p.cant, false)));
    }
  }

  const log: Cambio[] = [];
  // Una fila que cambió mientras tanto (0 filas afectadas) no es falla: se reintenta en la siguiente corrida.
  const actualizar = async (p: Abierta, patch: { cantidad?: number; cantidad_recibida: number }) => {
    const { data, error } = await siSigueIgual(db.from("com_movimientos").update(patch).eq("id", p.id), p).select("id");
    if (error) { r.ocFallas++; return false; }
    if (!data?.length) return false;
    if (patch.cantidad !== undefined) log.push(cambio(corrida, "com_movimientos", p.id, "cantidad", p.cantRaw, patch.cantidad, true));
    log.push(cambio(corrida, "com_movimientos", p.id, "cantidad_recibida", p.recRaw, patch.cantidad_recibida, true));
    return true;
  };
  await enLotes(retenida ? [] : C.cerrar, 15, async (p) => { if (await actualizar(p, { cantidad_recibida: p.cant })) r.ocCerradas++; });
  await enLotes(C.ajustar, 15, async (x) => {
    const patch = x.nuevaCant !== x.p.cant ? { cantidad: x.nuevaCant, cantidad_recibida: x.nuevoRec } : { cantidad_recibida: x.nuevoRec };
    if (await actualizar(x.p, patch)) r.ocAjustadas++;
  });

  // Borradores en Zoho: no son compras. Se guarda la fila completa en la bitácora para poder deshacer.
  const completas = new Map<number, Record<string, unknown>>();
  for (let i = 0; i < C.quitar.length; i += 50) {
    const lote = C.quitar.slice(i, i + 50);
    const { data, error } = await db.from("com_movimientos").select("*").in("id", lote.map((x) => x.p.id));
    if (error) { r.ocFallas += lote.length; continue; }
    for (const row of data ?? []) completas.set(row.id, row);
  }
  // La fila completa se registra ANTES de borrar: si la bitácora no se puede escribir, no se borra nada.
  let quitables = C.quitar.filter((x) => completas.has(x.p.id)); // las que no se leyeron ya no existen o se contaron arriba
  try {
    await guardarCambios(db, quitables.map(({ p }) => cambio(corrida, "com_movimientos", p.id, "quitada", completas.get(p.id), null, true)));
  } catch {
    r.ocFallas += quitables.length;
    quitables = [];
  }
  const noQuitadas: string[] = [];
  await enLotes(quitables, 15, async ({ p }) => {
    const { data, error } = await siSigueIgual(db.from("com_movimientos").delete().eq("id", p.id), p).select("id");
    if (error) r.ocFallas++;
    if (error || !data?.length) { noQuitadas.push(String(p.id)); return; }
    r.ocQuitadas++;
  });
  // La bitácora nunca dice que se quitó algo que sigue ahí.
  let errorBitacora: unknown;
  for (let i = 0; i < noQuitadas.length; i += 200) {
    const { error } = await db.from("com_sync_cambios").update({ aplicado: false }).eq("corrida", corrida)
      .eq("tabla", "com_movimientos").eq("campo", "quitada").in("clave", noQuitadas.slice(i, i + 200));
    if (error) errorBitacora ??= error;
  }

  // Lo pendiente en Zoho que falta en la plataforma (solo SKUs del catálogo). Monto solo en la primera línea de un folio nuevo.
  const porFolio = new Set<string>();
  const nuevos = C.faltan.filter((z) => skuReal.has(z.sku)).map((z) => {
    const esNuevo = !C.foliosPlat[z.key] && !C.foliosPlat["#" + String(z.folio).trim().toUpperCase()];
    const primera = !porFolio.has(z.folio);
    porFolio.add(z.folio);
    return {
      tipo: "compra", folio: z.folio, sku: skuReal.get(z.sku)!, cantidad: z.ped > 0 ? z.ped : z.pend, cantidad_recibida: z.rec || 0,
      fecha: z.fecha || hoy, fecha_arribo: z.arribo || null, destino: "CEDIS", estado: "emitida",
      monto: primera && esNuevo && z.monto ? z.monto : null, proveedor: z.prov || null,
    };
  });
  for (let i = 0; i < nuevos.length; i += 50) {
    const lote = nuevos.slice(i, i + 50);
    const { data, error } = await db.from("com_movimientos").insert(lote).select("*");
    if (error) { r.ocFallas += lote.length; continue; }
    for (const row of data ?? []) log.push(cambio(corrida, "com_movimientos", row.id, "agregada", null, row, true));
    r.ocAgregadas += data?.length ?? lote.length;
  }

  await guardarCambios(db, log);
  if (errorBitacora) throw errorBitacora;
  return r;
}

/**
 * Tras un sync fallido: si el anterior también falló y el de antes fue exitoso (la racha acaba de llegar a 2), avisa por correo.
 * Nunca lanza.
 */
export async function avisarRachaFallas(db: SupabaseClient, mensaje: string, enviar = enviarCorreo): Promise<void> {
  try {
    const { data, error } = await db.from("com_sync_log").select("ok").eq("proceso", "zoho-sync").not("fin", "is", null)
      .order("inicio", { ascending: false }).limit(3);
    if (error || !data || data.length < 3) return;
    // data[0] es la corrida que acaba de fallar.
    if (!(data[1].ok === false && data[2].ok === true)) return;
    const cfg = await cargarConfig(db);
    await enviar(cfg.auto.correos, "⚠ Sincronización con Zoho falló 2 veces seguidas",
      `<p>La sincronización con Zoho falló dos veces seguidas. Último error:</p><pre>${esc(mensaje)}</pre>` +
      `<p>Mientras no se resuelva, la plataforma no recibe cambios de Zoho.</p>`, "Sincronización con Zoho");
  } catch (e) {
    console.error(`avisarRachaFallas: ${(e as Error)?.message ?? e}`);
  }
}
