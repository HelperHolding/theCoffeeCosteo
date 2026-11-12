// Campos de catálogo a partir del listado de artículos de Zoho (misma regla que el Excel de Artículos de la app).
export type ItemZohoCompleto = { sku?: string; status?: string; purchase_rate?: number | string; vendor_name?: string;
  cf_estatus_operativo?: string; cf_local_o_importado?: string; cf_lead_time_proveedor?: string; cf_modelo_de_negocio?: string;
  cf_clasificacion?: string; cf_clasificacion_detallada?: string; cf_exclusivo_gdl?: string };
export type CamposCatalogo = { estatus?: string; origen?: string; costo_unitario?: number; proveedor_preferido?: string;
  modelo_negocio?: string; clasificacion?: string; clasificacion_detallada?: string; exclusivo_gdl?: boolean };

const txt = (v: unknown) => (v === null || v === undefined ? "" : String(v).trim());
const VALIDOS = ["Compra Recurrente", "Compra Unica", "Prueba", "Hasta Agotar Existencias"];

export function estatusDeZoho(i: ItemZohoCompleto): string | null {
  const op = txt(i.cf_estatus_operativo), st = txt(i.status).toLowerCase();
  if (st === "inactive" || op === "Inactivo") return "Inactivo";
  return VALIDOS.includes(op) ? op : null;
}

export function camposDeZoho(i: ItemZohoCompleto): CamposCatalogo {
  const c: CamposCatalogo = {};
  const e = estatusDeZoho(i); if (e) c.estatus = e;
  const o = txt(i.cf_local_o_importado).toUpperCase(); if (o) c.origen = o;
  const p = Number(i.purchase_rate); if (txt(i.purchase_rate) !== "" && Number.isFinite(p) && p > 0) c.costo_unitario = p;
  const v = txt(i.vendor_name); if (v) c.proveedor_preferido = v;
  const m = txt(i.cf_modelo_de_negocio); if (m) c.modelo_negocio = m;
  const k = txt(i.cf_clasificacion); if (k) c.clasificacion = k;
  const kd = txt(i.cf_clasificacion_detallada); if (kd) c.clasificacion_detallada = kd;
  const g = txt(i.cf_exclusivo_gdl).toLowerCase();
  if (g === "si" || g === "sí" || g === "yes") c.exclusivo_gdl = true; else if (g === "no") c.exclusivo_gdl = false;
  return c;
}

export function leadTimeDeZoho(i: ItemZohoCompleto): number | null {
  const n = parseInt(txt(i.cf_lead_time_proveedor), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

export function difCatalogo(actual: Record<string, unknown>, nuevos: CamposCatalogo) {
  const out: { campo: string; antes: unknown; despues: unknown }[] = [];
  for (const [campo, despues] of Object.entries(nuevos)) {
    const antes = actual[campo];
    const igual = typeof despues === "number" ? Number(antes) === despues && antes !== null && antes !== "" : antes === despues;
    if (!igual) out.push({ campo, antes: antes ?? null, despues });
  }
  return out;
}
