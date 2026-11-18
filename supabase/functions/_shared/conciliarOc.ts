// Conciliación pura de las OCs de la plataforma contra las pendientes de Zoho.
// Port de _zocConciliar (app/index.html) con cerrarFuturas=false. Sin base de datos ni red.

const GRACIA = 3; // días

export type LineaZoho = {
  folio: string; sku: string; ped: number; rec: number; pend: number;
  arribo: string | null; fecha: string | null; prov: string; monto: number | null; borrador: boolean;
};
export type FilaPlat = {
  id: number; sku: string; folio: string | null; fecha: string | null; fecha_arribo: string | null;
  cantidad: number | null; cantidad_recibida: number | null; monto: number | null; proveedor: string | null;
};
export type Abierta = {
  id: number; sku: string; skuRaw: string; folio: string | null; key: string; prov: string | null;
  fecha: string | null; arribo: string | null; cant: number; rec: number;
  cantRaw: number | null; recRaw: number | null; monto: number | null; pend: number;
};
export type Z = {
  sku: string; skuRaw: string; folio: string; key: string; prov: string; fecha: string | null;
  arribo: string | null; ped: number; rec: number; pend: number; monto: number | null; borrador: boolean;
};
export type Conciliacion = {
  mantener: { p: Abierta; z: Z }[];
  ajustar: { p: Abierta; z: Z; nuevaCant: number; nuevoRec: number }[];
  cerrar: Abierta[]; respetar: Abierta[]; futuras: Abierta[]; faltan: Z[];
  quitar: { p: Abierta; z: Z }[]; borradores: Z[];
  foliosPlat: Record<string, 1>; abiertas: Abierta[];
};

const nt = (s: unknown) =>
  String(s == null ? "" : s).toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, " ").trim();

// Solo los dígitos sin ceros a la izquierda; las OCs de DODO llevan su propia serie.
function folioKey(folio: unknown): string {
  const s = String(folio || "").toUpperCase();
  const d = s.replace(/\D/g, "").replace(/^0+/, "");
  return d ? (/DODO/.test(s) ? "D" : "") + d : "";
}
const STOP = ["sas", "srl", "the", "los", "las", "del", "coffee"];
const provToks = (n: unknown) => nt(n).split(" ").filter((w) => w.length > 2 && !STOP.includes(w));
function mismoProv(a: unknown, b: unknown): boolean {
  const A = provToks(a), B = provToks(b);
  return A.length > 0 && B.length > 0 && A.some((w) => B.includes(w));
}
function difDias(a: unknown, b: unknown): number | null {
  const x = Date.parse(String(a || "").slice(0, 10) + "T00:00:00");
  const y = Date.parse(String(b || "").slice(0, 10) + "T00:00:00");
  return isFinite(x) && isFinite(y) ? Math.abs(Math.round((x - y) / 864e5)) : null;
}
const up = (s: unknown) => String(s || "").trim().toUpperCase();

export function lineasDesdeZoho(rows: {
  po_number: string; sku: string; cantidad: number; cantidad_recibida: number | null;
  fecha_entrega: string | null; fecha_oc: string | null; vendor_name: string | null;
  precio: number | null; status: string;
}[]): LineaZoho[] {
  const total: Record<string, number> = {};
  for (const r of rows) {
    if (!r.po_number) continue;
    total[r.po_number] = (total[r.po_number] || 0) + Number(r.precio || 0) * Number(r.cantidad || 0);
  }
  const visto: Record<string, boolean> = {};
  const out: LineaZoho[] = [];
  for (const r of rows) {
    if (!r.po_number || !r.sku || r.sku === "(sin-sku)") continue;
    const ped = Number(r.cantidad || 0), rec = Number(r.cantidad_recibida ?? 0);
    let monto: number | null = null;
    if (!visto[r.po_number]) {
      visto[r.po_number] = true;
      const t = Math.round(total[r.po_number] * 100) / 100;
      if (t > 0) monto = t;
    }
    out.push({
      folio: r.po_number, sku: r.sku, ped, rec, pend: Math.max(0, ped - rec),
      arribo: r.fecha_entrega, fecha: r.fecha_oc, prov: r.vendor_name ?? "", monto,
      borrador: String(r.status || "").toLowerCase() === "draft",
    });
  }
  return out;
}

export function conciliar(L: LineaZoho[], rows: FilaPlat[], hoyIso: string): Conciliacion {
  const eps = 0.001;
  const usadaZ = new Set<Z>(), usadaP = new Set<Abierta>();
  const zl: Z[] = L.map((l) => ({
    sku: up(l.sku), skuRaw: l.sku, folio: l.folio, key: folioKey(l.folio), prov: l.prov, fecha: l.fecha,
    arribo: l.arribo, ped: l.ped, rec: l.rec, pend: l.pend, monto: l.monto, borrador: !!l.borrador,
  }));
  const foliosPlat: Record<string, 1> = {};
  (rows || []).forEach((r) => {
    const k = folioKey(r.folio);
    if (k) foliosPlat[k] = 1;
    if (r.folio) foliosPlat["#" + String(r.folio).trim().toUpperCase()] = 1;
  });
  const abiertas: Abierta[] = (rows || []).map((r) => {
    const cant = Number(r.cantidad || 0), rec = Number(r.cantidad_recibida || 0);
    return {
      id: r.id, sku: up(r.sku), skuRaw: r.sku, folio: r.folio, key: folioKey(r.folio), prov: r.proveedor,
      fecha: r.fecha, arribo: r.fecha_arribo, cant, rec, cantRaw: r.cantidad, recRaw: r.cantidad_recibida,
      monto: r.monto, pend: Math.max(0, cant - rec),
    };
  }).filter((p) => p.pend > 0);
  const res: Conciliacion = {
    mantener: [], ajustar: [], cerrar: [], respetar: [], futuras: [], faltan: [], quitar: [], borradores: [],
    foliosPlat, abiertas,
  };
  const idx: Record<string, Z[]> = {};
  zl.forEach((z) => {
    if (!z.key) return;
    (idx[z.key + "|" + z.sku] = idx[z.key + "|" + z.sku] || []).push(z);
  });
  const emparejar = (p: Abierta, c: Z) => {
    usadaZ.add(c); usadaP.add(p);
    if (Math.abs(c.pend - p.pend) < eps) { res.mantener.push({ p, z: c }); return; }
    const nuevaCant = c.pend > p.cant + eps ? c.pend : p.cant;
    res.ajustar.push({ p, z: c, nuevaCant, nuevoRec: Math.round((nuevaCant - c.pend) * 1e4) / 1e4 });
  };
  // 1) mismo folio y mismo SKU
  abiertas.forEach((p) => {
    const cs = p.key ? (idx[p.key + "|" + p.sku] || []).filter((z) => !usadaZ.has(z)) : [];
    if (!cs.length) return;
    const c1 = cs.slice().sort((a, b) => Math.abs(a.pend - p.pend) - Math.abs(b.pend - p.pend))[0];
    if (c1.borrador) { usadaZ.add(c1); usadaP.add(p); res.quitar.push({ p, z: c1 }); return; }
    emparejar(p, c1);
  });
  // 2) otro formato de folio: mismo SKU, proveedor parecido, misma cantidad y fecha cercana.
  // Las líneas ya recibidas del todo (pend 0) solo sirven en el paso 1, para cerrar su fila abierta.
  zl.filter((z) => !usadaZ.has(z) && !z.borrador && z.pend > 0).forEach((z) => {
    const c = abiertas.filter((p) => {
      if (usadaP.has(p) || p.sku !== z.sku || !mismoProv(p.prov, z.prov)) return false;
      if (!(Math.abs(p.pend - z.pend) < eps || Math.abs(p.cant - z.ped) < eps)) return false;
      const d = difDias(p.fecha, z.fecha);
      return d === null || d <= 20;
    })[0];
    if (c) emparejar(c, z);
  });
  // 3) lo que queda: se cierra, salvo recién capturadas (gracia) y con arribo futuro (futuras)
  abiertas.filter((p) => !usadaP.has(p)).forEach((p) => {
    const edad = p.fecha && hoyIso ? difDias(p.fecha, hoyIso) : null;
    if (edad !== null && edad <= GRACIA && String(p.fecha).slice(0, 10) <= hoyIso) res.respetar.push(p);
    else if (p.arribo && hoyIso && String(p.arribo).slice(0, 10) >= hoyIso) res.futuras.push(p);
    else res.cerrar.push(p);
  });
  res.faltan = zl.filter((z) => !usadaZ.has(z) && !z.borrador && z.pend > 0);
  res.borradores = zl.filter((z) => !usadaZ.has(z) && z.borrador);
  return res;
}

export function excedeTope(C: Conciliacion): boolean {
  // Piso de 15: con pocas líneas abiertas, una sola recepción grande no debe disparar el 30 %.
  return C.cerrar.length > 100 || (C.cerrar.length > 15 && C.cerrar.length > 0.3 * C.abiertas.length);
}
