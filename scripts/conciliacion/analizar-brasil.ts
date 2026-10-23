import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDe } from '../../lib/sucursales/config';
import { importeLinea, normalizar, type PedidoNormal } from '../../lib/sucursales/normalizar';
import { productos, resumen } from '../../lib/sucursales/metricas';

/**
 * Fase 2 · Análisis local (sin red) de los crudos extraídos por extraer-brasil.ts.
 * Catálogo observado (código, nombre exacto, contexto), colisiones, búsqueda de "generic" y simulación de ranking.
 *   npx tsx scripts/conciliacion/analizar-brasil.ts <salida.json>
 */
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const salida = process.argv[2];
if (!salida) throw new Error('Uso: analizar-brasil.ts <salida.json>');

type Item = { defaultCode?: string | null; productName: string; amount: number; discount: number; itemsCustom?: Item[] };
type Pedido = {
  id: number; companyId: number; fromSmartphone?: boolean | null; paymentMethod?: string; paymentType?: string;
  grossAmount: number; netAmout?: number | null; discount: number; createdAt: string; items: Item[];
};

const repr = (c: string | null | undefined) => (c === undefined ? '<ausente>' : c === null ? '<null>' : c === '' ? '<vacío>' : c);
const origen = (p: Pedido) =>
  p.paymentMethod === 'RAPPI' ? 'rappi' : p.fromSmartphone === true ? 'app' : p.fromSmartphone === false ? 'mostrador' : 'desconocido';
const cent = (x: number) => Math.round(x * 100);

const archivos = (await readdir(DIR)).filter((f) => /^\d+_\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.json$/.test(f)).sort();
const crudos: { companyId: number; desde: string; hasta: string; pedidos: Pedido[] }[] = [];
for (const f of archivos) {
  const [id, desde, hasta] = f.replace('.json', '').split('_');
  crudos.push({ companyId: Number(id), desde, hasta, pedidos: JSON.parse(await readFile(join(DIR, f), 'utf8')) });
}

interface Obs {
  nivel: 'producto' | 'custom'; codigo: string; nombre: string; lineas: number; pedidos: Set<number>;
  sucursales: Set<number>; origenes: Record<string, number>; importeCent: number; primera: string; ultima: string;
  precios: Map<string, number>; // "origen|precio" solo líneas sin descuento (línea y pedido)
  padres: Map<string, number>; // para customs: nombre del padre
  tamanos: Map<string, number>; // para productos: customs de tamaño
}
const obs = new Map<string, Obs>();
const ES_TAMANO = /\b\d{2,4}\s?ml\b/i;
const registrar = (nivel: Obs['nivel'], i: Item, p: Pedido, fecha: string, padre?: string) => {
  const k = `${nivel}\u0000${repr(i.defaultCode)}\u0000${i.productName}`;
  let o = obs.get(k);
  if (!o) {
    o = { nivel, codigo: repr(i.defaultCode), nombre: i.productName, lineas: 0, pedidos: new Set(), sucursales: new Set(),
      origenes: {}, importeCent: 0, primera: fecha, ultima: fecha, precios: new Map(), padres: new Map(), tamanos: new Map() };
    obs.set(k, o);
  }
  o.lineas++; o.pedidos.add(p.id); o.sucursales.add(p.companyId);
  const og = origen(p); o.origenes[og] = (o.origenes[og] ?? 0) + 1;
  o.importeCent += cent(i.amount);
  if (fecha < o.primera) o.primera = fecha;
  if (fecha > o.ultima) o.ultima = fecha;
  if (i.discount === 0 && p.discount === 0) { const pk = `${p.companyId}|${og}|${i.amount}`; o.precios.set(pk, (o.precios.get(pk) ?? 0) + 1); }
  if (padre) o.padres.set(padre, (o.padres.get(padre) ?? 0) + 1);
  if (nivel === 'producto') for (const c of i.itemsCustom ?? []) if (ES_TAMANO.test(c.productName)) o.tamanos.set(`${c.productName}|${c.amount}`, (o.tamanos.get(`${c.productName}|${c.amount}`) ?? 0) + 1);
};

const porSucursal: Record<string, unknown>[] = [];
const normalesPorSucursal = new Map<number, PedidoNormal[]>();
for (const w of crudos) {
  const cfg = configDe(w.companyId)!;
  const n = normalizar(w.pedidos as unknown as Record<string, unknown>[], cfg, w);
  normalesPorSucursal.set(w.companyId, [...(normalesPorSucursal.get(w.companyId) ?? []), ...n.pedidos]);
  const fechaDe = new Map(n.pedidos.map((x) => [x.id, x.fecha]));
  for (const p of w.pedidos) {
    const fecha = fechaDe.get(p.id) ?? '?';
    for (const i of p.items) {
      registrar('producto', i, p, fecha);
      for (const c of i.itemsCustom ?? []) registrar('custom', c, p, fecha, i.productName);
    }
  }
}
for (const [id, ps] of normalesPorSucursal) {
  const og: Record<string, { pedidos: number; ventaCent: number }> = {};
  for (const p of ps) { og[p.origen] ??= { pedidos: 0, ventaCent: 0 }; og[p.origen].pedidos++; og[p.origen].ventaCent += p.ventaCent; }
  const r = resumen(ps);
  const lineasCent = ps.reduce((s, p) => s + p.lineas.reduce((t, l) => t + importeLinea(l), 0), 0);
  porSucursal.push({ companyId: id, pedidos: ps.length, ventaCent: r.ventaCent, lineasMasCustomsCent: lineasCent,
    noCuadran: ps.filter((p) => !p.cuadra).length, origenes: og });
}

const lista = [...obs.values()].map((o) => ({
  nivel: o.nivel, codigo: o.codigo, nombre: o.nombre, lineas: o.lineas, pedidos: o.pedidos.size,
  sucursales: [...o.sucursales].sort(), origenes: o.origenes, importeCent: o.importeCent, primera: o.primera, ultima: o.ultima,
  preciosSinDescuento: [...o.precios].map(([k, n]) => { const [s, og, pr] = k.split('|'); return { sucursal: +s, origen: og, precio: +pr, lineas: n }; })
    .sort((a, b) => a.sucursal - b.sucursal || a.origen.localeCompare(b.origen) || b.lineas - a.lineas),
  padresTop: [...o.padres].sort((a, b) => b[1] - a[1]).slice(0, 5),
  tamanos: [...o.tamanos].map(([k, n]) => { const [nm, a] = k.split('|'); return { tamano: nm, extra: +a, lineas: n }; }).sort((a, b) => b.lineas - a.lineas),
}));

const agrupar = (nivel: string, por: 'codigo' | 'nombre') => {
  const m = new Map<string, typeof lista>();
  for (const o of lista.filter((x) => x.nivel === nivel)) m.set(o[por], [...(m.get(o[por]) ?? []), o]);
  return [...m].filter(([, v]) => v.length > 1).map(([k, v]) => ({ clave: k, variantes: v.map((x) => ({ codigo: x.codigo, nombre: x.nombre, lineas: x.lineas, importeCent: x.importeCent, primera: x.primera, ultima: x.ultima, sucursales: x.sucursales })) }));
};

// Simulación de ranking: actual (código) frente a código+nombre, por sucursal, origen "todos".
const simulacion = [...normalesPorSucursal].map(([id, ps]) => {
  const actual = productos(ps);
  const alt = new Map<string, { importeCent: number; lineas: number; customsCent: number }>();
  for (const p of ps) for (const l of p.lineas) {
    const k = `${l.codigo}\u0000${l.nombre}`; const x = alt.get(k) ?? { importeCent: 0, lineas: 0, customsCent: 0 };
    const imp = importeLinea(l); x.importeCent += imp; x.lineas++; x.customsCent += imp - l.importeCent; alt.set(k, x);
  }
  const suma = (xs: { importeCent: number; lineas: number }[]) => ({ importeCent: xs.reduce((s, x) => s + x.importeCent, 0), lineas: xs.reduce((s, x) => s + x.lineas, 0) });
  const venta = ps.reduce((s, p) => s + p.ventaCent, 0);
  return { companyId: id, ventaCent: venta, filasActual: actual.length, filasAlternativa: alt.size,
    actual: { ...suma(actual), customsCent: actual.reduce((s, x) => s + x.extraCustomsCent, 0) },
    alternativa: { ...suma([...alt.values()]), customsCent: [...alt.values()].reduce((s, x) => s + x.customsCent, 0) },
    residualVentaMenosLineas: venta - suma(actual).importeCent,
    top10Actual: actual.slice(0, 10).map((x) => ({ codigo: x.codigo, nombre: x.nombre, importeCent: x.importeCent, lineas: x.lineas })) };
});

const generic = lista.filter((o) => /gen[eé]ric/i.test(o.nombre) || /gen[eé]ric/i.test(o.codigo));
const vacios = lista.filter((o) => o.codigo.startsWith('<'));
const resultado = { ventanas: crudos.map((w) => ({ companyId: w.companyId, desde: w.desde, hasta: w.hasta, registros: w.pedidos.length })),
  porSucursal, catalogo: lista, codigosConVariosNombres: { producto: agrupar('producto', 'codigo'), custom: agrupar('custom', 'codigo') },
  nombresConVariosCodigos: { producto: agrupar('producto', 'nombre'), custom: agrupar('custom', 'nombre') },
  generic, codigosVacios: vacios, simulacion };
await writeFile(salida, JSON.stringify(resultado, null, 1));
console.log(`OK → ${salida}`);
