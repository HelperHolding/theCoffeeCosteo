import type { FormOc } from './ordenes';
import { masDias } from './fechas';
import { impAhoraDatos, type CorridaImp } from '../../supabase/functions/_shared/planImp.ts';
import { planCantOC, type PlanCafe } from '../../supabase/functions/_shared/planCafe.ts';

/** De dónde viene la OC sugerida (el viejo lo mostraba como "sugerido por …"). */
export type OrigenOc = 'Importaciones' | 'Café';
const ORIGEN: Record<string, OrigenOc> = { importaciones: 'Importaciones', cafe: 'Café' };
const CLAVE: Record<OrigenOc, string> = { Importaciones: 'importaciones', Café: 'cafe' };
export const MAX_LINEAS_OC = 60;

export interface PrellenadoOc {
  origen: OrigenOc;
  proveedor: string;
  lineas: { sku: string; cantidad: number }[];
  monto: number | null;
  arribo: string | null;
}
/** Formulario de Órdenes con lo sugerido; `origen` y `omitidos` (líneas con SKU fuera del catálogo) solo se muestran. */
export type FormPrellenado = FormOc & { origen: OrigenOc; omitidos: number };

/**
 * Enlace a Órdenes con el formulario de nueva OC prellenado (plan 3e, decisión 3): proveedor, artículos y cantidades,
 * monto y fecha de arribo estimados. Nada se guarda hasta que la persona revisa y pulsa Guardar.
 */
export function enlaceOc(p: PrellenadoOc): string {
  const q = new URLSearchParams({ nueva: CLAVE[p.origen], proveedor: p.proveedor });
  for (const l of p.lineas.slice(0, MAX_LINEAS_OC)) q.append('l', `${l.sku}:${l.cantidad}`);
  if (p.monto != null && p.monto > 0) q.set('monto', String(p.monto));
  if (p.arribo) q.set('arribo', p.arribo);
  return `/comercializadora/ordenes?${q.toString()}`;
}

const uno = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const fechaOk = (s: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;

/**
 * Lee el prellenado de la URL con lista blanca: origen conocido, proveedor de texto (sin caracteres de control, 120 como
 * máximo), SKUs del catálogo (sin distinguir mayúsculas; se usa el del catálogo), cantidades mayores a 0 (hasta 10
 * millones), 60 líneas como máximo, monto de 0 a 10 mil millones y fecha real. Lo demás se descarta; las líneas con un SKU
 * que no está en el catálogo se cuentan en `omitidos`. Sin origen, proveedor o líneas válidas: null (no abre el formulario).
 */
export function prellenadoOc(
  sp: Record<string, string | string[] | undefined>,
  catalogo: string[],
  hoy: string,
): FormPrellenado | null {
  const origen = ORIGEN[uno(sp.nueva) ?? ''];
  const proveedor = String(uno(sp.proveedor) ?? '')
    .replace(/[\u0000-\u001f]/g, ' ')
    .trim()
    .slice(0, 120);
  if (!origen || !proveedor) return null;
  const crudas = sp.l == null ? [] : Array.isArray(sp.l) ? sp.l : [sp.l];
  const canon = new Map(catalogo.map((s) => [s.trim().toUpperCase(), s]));
  const lineas: FormOc['lineas'] = [];
  let omitidos = 0;
  for (const t of crudas) {
    const i = t.lastIndexOf(':');
    if (i <= 0) continue;
    const sku = canon.get(t.slice(0, i).trim().toUpperCase()),
      cantidad = Number(t.slice(i + 1));
    if (!sku) {
      omitidos++;
      continue;
    }
    if (!(cantidad > 0 && cantidad <= 1e7) || lineas.some((l) => l.sku === sku)) continue;
    lineas.push({ sku, cantidad });
    if (lineas.length >= MAX_LINEAS_OC) break;
  }
  if (!lineas.length) return null;
  const monto = Number(uno(sp.monto));
  const arribo = String(uno(sp.arribo) ?? '');
  return {
    origen,
    omitidos,
    folio: '',
    proveedor,
    fecha: hoy,
    fecha_arribo: fechaOk(arribo) ? arribo : '',
    destino: 'CEDIS',
    monto: monto >= 0 && monto <= 1e10 ? Math.round(monto * 100) / 100 : 0,
    lineas,
  };
}

/**
 * window._impCrearOC: lo que hay que colocar ESTA semana con el proveedor. El proveedor es el del catálogo del primer
 * artículo (o el nombre del plan), el monto la inversión del modelo y el arribo la llegada más tardía.
 */
export function ocImportaciones(c: CorridaImp, clave: string): PrellenadoOc | { error: string } {
  if (!c.S) return { error: 'No hay un cálculo de importaciones.' };
  const gr = impAhoraDatos(c).g[clave];
  if (!gr || !gr.esta.length) return { error: 'Nada que pedir esta semana a este proveedor' };
  const items = gr.esta;
  const pd = c.ent.meta.items[items[0].it.sku]?.cat;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const monto = items.reduce((s: number, o: any) => s + (o.q.inversion || 0), 0);
  return {
    origen: 'Importaciones',
    proveedor: (pd && pd.proveedor) || gr.prov.nombre,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    lineas: items.map((o: any) => ({ sku: o.it.sku, cantidad: o.q.cantidadPedir })),
    monto: monto > 0 ? Math.round(monto * 100) / 100 : null,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    arribo:
      items.reduce(
        (mx: string, o: any) => (o.q.llegaCedis && o.q.llegaCedis > mx ? o.q.llegaCedis : mx),
        '',
      ) || null,
  };
}

/**
 * window._planCrearOC(key, 'cafe'): lo de hoy del proveedor (pedirHoy del servidor o pedirEsta local). Monto solo si
 * todos tienen costo; arribo = hoy + el lead time más largo.
 */
export function ocCafe(c: PlanCafe, key: string): PrellenadoOc | { error: string } {
  const g = c.provs.find((x) => x.key === key);
  if (!g || !g.real) return { error: 'Asigna un proveedor a estos artículos antes de crear la OC' };
  const items = g.rows.filter((r) => planCantOC(r) > 0);
  if (!items.length)
    return {
      error: g.rows.some((r) => r.calc.pedirEsta > 0)
        ? 'Nada que pedir hoy a este proveedor: lo de esta semana toca en los próximos días'
        : 'Nada que pedir esta semana a este proveedor',
    };
  let mOC = 0,
    sinC = 0;
  items.forEach((r) => (r.costo > 0 ? (mOC += planCantOC(r) * r.costo) : sinC++));
  const ltMax = Math.max(...items.map((r) => Number(r.s.lt) || 0));
  return {
    origen: 'Café',
    proveedor: g.nombre,
    lineas: items.map((r) => ({ sku: r.sku, cantidad: planCantOC(r) })),
    monto: sinC === 0 && mOC > 0 ? Math.round(mOC * 100) / 100 : null,
    arribo: masDias(c.hoyIso, ltMax),
  };
}
