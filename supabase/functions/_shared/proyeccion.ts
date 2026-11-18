import { cantidadAPedir } from "./calculo.ts";
import { type Cierre, cerradoEn, coberturas, llegadaAjustada, periodosDe } from "./cierres.ts";
import { difDias, sumarDias } from "./fechas.ts";
import type { Fila, LineaAbierta } from "./posicion.ts";

export type FilaPago = {
  tipo: "proyectado" | "comprometido"; sku: string; nombre: string; vendor_id: string; vendor_name: string;
  fecha_oc: string; fecha_llegada: string; fecha_pago: string; cantidad: number; costo: number; monto: number; zoho_po_id: string | null;
  adelanto_cierre: boolean; cierre_tarde: boolean; cierre_id: number | null;
  adelanto_minimo: boolean; bajo_minimo: boolean; // mínimo de compra del proveedor (los marca aplicarMinimos)
};
export type EntradaProyeccion = {
  hoy: string; horizonte: number; base: "llegada" | "oc"; sumarYulius: boolean;
  filas: Fila[];
  curvas: Record<string, number[]>; // D acumulada del forecast regular: curvas[sku][j] = demanda de los días 1..j; [0] = 0
  kit: Record<string, number>;      // piezas por apertura (manual o calculado)
  fechasKit: string[];              // fechas de kit (fechasKit de calculo.ts; nunca antes de hoy)
  credito: Record<string, number>;  // días de crédito por vendor_id
  abiertas: LineaAbierta[];
  ltDefault: number;                // lead time para líneas comprometidas de SKUs fuera de `filas`
  cierres?: Cierre[];               // proveedores sin stock por tiempo definido (por defecto, ninguno)
};

const r2 = (x: number) => Math.round(x * 100) / 100;
const maxFecha = (a: string | null, b: string) => (a == null || b > a ? b : a);

/** Fecha de pago de una OC: base (llegada u OC) más los días de crédito del proveedor. */
export function fechaPago(base: "llegada" | "oc", credito: Record<string, number>, vendor: string, foc: string, llegada: string): string {
  return sumarDias(base === "llegada" ? llegada : foc, credito[vendor] ?? 0);
}

export function proyectar(e: EntradaProyeccion): { filas: FilaPago[]; sinCosto: string[]; sinProveedor: string[] } {
  const H = Math.max(0, Math.floor(e.horizonte));
  const out: FilaPago[] = [];
  const sinCosto = new Set<string>(), sinProveedor = new Set<string>();
  const pagoDe = (vendor: string, foc: string, llegada: string) => fechaPago(e.base, e.credito, vendor, foc, llegada);

  const ltPor = new Map(e.filas.map((f) => [f.sku, f.lead_time]));
  const cierres = e.cierres ?? [];
  const vendorDeSku = new Map(e.filas.map((f) => [f.sku, f.zoho_vendor_id]));
  // Periodos y coberturas por fila (antes de dimensionar los kits: la cobertura mira hasta R, que puede pasar de H).
  const plan = e.filas.map((f) => {
    const ps = periodosDe(cierres, f.sku, f.zoho_vendor_id, e.hoy);
    return { ps, cobs: new Map(coberturas(ps, e.hoy, f.lead_time).map((c) => [c.dia, c])) };
  });
  let jRmax = H;
  for (const pl of plan) for (const c of pl.cobs.values()) jRmax = Math.max(jRmax, difDias(e.hoy, c.R));

  // Kits por día de la simulación: los de hoy (o antes) se consumen el día 1.
  const kitsDia = new Array(jRmax + 1).fill(0);
  for (const f of e.fechasKit) {
    const i = Math.max(1, difDias(e.hoy, f));
    if (i <= jRmax) kitsDia[i]++;
  }
  // Llegada de una línea abierta, recorrida si cae en un cierre del proveedor. `periodo` = cierre que la movió.
  const llegadaLinea = (l: LineaAbierta) => {
    const original = l.fecha_entrega ?? sumarDias(l.fecha_oc ?? e.hoy, ltPor.get(l.sku) ?? e.ltDefault);
    const ps = periodosDe(cierres, l.sku, l.vendor_id ?? vendorDeSku.get(l.sku) ?? null, e.hoy);
    const llegada = llegadaAjustada(ps, original);
    return { llegada, periodo: llegada !== original ? cerradoEn(ps, original) : null };
  };
  // Llegada esperada más tardía de las OCs abiertas por SKU (bloquea recompras como en real).
  const bloqueoAbiertas = new Map<string, string>();
  for (const l of e.abiertas) {
    const { llegada } = llegadaLinea(l);
    bloqueoAbiertas.set(l.sku, maxFecha(bloqueoAbiertas.get(l.sku) ?? null, llegada));
  }

  // OC automática más nueva que el último sync: no está en las líneas de Zoho, pero bloquea hasta su llegada esperada.
  for (const f of e.filas) {
    if (f.enOcAbierta && !bloqueoAbiertas.has(f.sku)) bloqueoAbiertas.set(f.sku, sumarDias(e.hoy, f.lead_time));
  }

  for (const [fi, f] of e.filas.entries()) {
    const { ps, cobs } = plan[fi];
    const curva = e.curvas[f.sku] ?? [0];
    const D = (j: number) => { const v = curva[Math.min(j, curva.length - 1)]; return Number.isFinite(v) ? v : 0; };
    const kit = e.kit[f.sku] ?? 0;
    let pos = f.fisico + (e.sumarYulius ? f.saldo_yulius : 0) + f.enCamino;
    let bloqueo: string | null = bloqueoAbiertas.get(f.sku) ?? null;
    const valido = !!f.zoho_item_id && !!f.zoho_vendor_id;
    for (let j = 0; j <= H; j++) {
      const fecha = sumarDias(e.hoy, j);
      if (j > 0) pos -= (D(j) - D(j - 1)) + kit * kitsDia[j];
      if (cerradoEn(ps, fecha)) continue; // en un día cerrado no se compra
      const bloqueado = j === 0 ? f.enOcAbierta : bloqueo != null && fecha <= bloqueo;
      const qNormal = cantidadAPedir({ disponible: pos, enCamino: 0, minimo: f.minimo, maximo: f.maximo,
        multiplo: f.multiplo, minimoPzas: f.minimoPzas, enOcAbierta: bloqueado });
      let q = qNormal;
      const cob = Math.max(f.maximo, f.minimo) > 0 ? cobs.get(fecha) : undefined; // sin mín ni máx no se compra (igual que cantidadAPedir)
      if (cob) {
        // Cobertura del cierre: llegar a R con el mínimo en mano. Ignora `bloqueado` (pos ya incluye lo que viene en camino).
        const jR = difDias(e.hoy, cob.R);
        let kits = 0;
        for (let i = j + 1; i <= jR; i++) kits += kitsDia[i] ?? 0;
        const necesidad = f.minimo + (D(jR) - D(j)) + kit * kits - pos;
        if (necesidad > 1e-9) {
          let qCob = Math.ceil(necesidad - 1e-9);
          if (f.multiplo && f.multiplo > 1) qCob = Math.ceil(qCob / f.multiplo) * f.multiplo;
          if (f.minimoPzas && qCob < f.minimoPzas) qCob = f.minimoPzas;
          q = Math.max(qNormal, qCob);
        }
      }
      if (q <= 0) continue;
      pos += q;
      const llegada = llegadaAjustada(ps, sumarDias(fecha, f.lead_time));
      bloqueo = maxFecha(bloqueo, llegada);
      if (!valido) { sinProveedor.add(f.sku); continue; }
      if (!f.costo) { sinCosto.add(f.sku); continue; }
      out.push({ tipo: "proyectado", sku: f.sku, nombre: f.nombre, vendor_id: f.zoho_vendor_id!, vendor_name: f.zoho_vendor_name ?? "",
        fecha_oc: fecha, fecha_llegada: llegada, fecha_pago: pagoDe(f.zoho_vendor_id!, fecha, llegada),
        cantidad: q, costo: f.costo, monto: r2(q * f.costo), zoho_po_id: null,
        adelanto_cierre: !!cob && q > qNormal, cierre_tarde: !!cob && cob.tarde, cierre_id: cob ? cob.periodo.id : null, adelanto_minimo: false, bajo_minimo: false });
    }
  }

  const nombrePor = new Map(e.filas.map((f) => [f.sku, f.nombre]));
  for (const l of e.abiertas) {
    // Facturada: ya está en cuentas por pagar (fuera de alcance); solo cuenta arriba para bloquear recompras.
    if (!(l.pendiente > 0) || l.facturada) continue;
    if (!l.precio) { sinCosto.add(l.sku); continue; }
    const foc = l.fecha_oc ?? e.hoy;
    const { llegada, periodo } = llegadaLinea(l);
    const vendor = l.vendor_id ?? l.vendor_name ?? "";
    const pago = pagoDe(vendor, foc, llegada);
    out.push({ tipo: "comprometido", sku: l.sku, nombre: nombrePor.get(l.sku) ?? l.sku, vendor_id: vendor, vendor_name: l.vendor_name ?? "",
      fecha_oc: foc, fecha_llegada: llegada, fecha_pago: pago < e.hoy ? e.hoy : pago,
      cantidad: l.pendiente, costo: l.precio, monto: r2(l.pendiente * l.precio), zoho_po_id: l.zoho_po_id,
      adelanto_cierre: false, cierre_tarde: false, cierre_id: periodo?.id ?? null, adelanto_minimo: false, bajo_minimo: false });
  }
  return { filas: out, sinCosto: [...sinCosto].sort(), sinProveedor: [...sinProveedor].sort() };
}
