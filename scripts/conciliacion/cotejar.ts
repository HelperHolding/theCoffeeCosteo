import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDe } from '../../lib/sucursales/config';
import { momentoPedido } from '../../lib/sucursales/tiempo';

/**
 * Fase 2 · Cotejo Costeo ↔ Brasil (local, sin red). Lee crudos de extraer-brasil.ts y el inventario de Costeo
 * (inventario-costeo.ts). Genera evidencia de precios por contexto, candidatos de nombre y detalle de GENERIC y
 * de códigos nulos. Nada se aprueba aquí: los estados son exacta / candidata / ambigua / sin equivalencia.
 *   npx tsx scripts/conciliacion/cotejar.ts <inventario.json> <salida.json>
 */
const [invPath, salida] = process.argv.slice(2);
if (!invPath || !salida) throw new Error('Uso: cotejar.ts <inventario.json> <salida.json>');
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');

type Item = { defaultCode?: string | null; productName: string; amount: number; discount: number; itemsCustom?: Item[] };
type Pedido = { id: number; companyId: number; fromSmartphone?: boolean | null; paymentMethod?: string; paymentType?: string;
  grossAmount: number; netAmout?: number | null; discount: number; percentageOfTransfer?: number; createdAt: string; items: Item[] };
const origen = (p: Pedido) =>
  p.paymentMethod === 'RAPPI' ? 'rappi' : p.fromSmartphone === true ? 'app' : p.fromSmartphone === false ? 'mostrador' : 'desconocido';
// Solo vasos «Regular/Large - N ml». La regex del portal (\d{2,4} ml) también captura shots y dosis de jarabe.
const ES_TAMANO = /^(Regular|Large) - \d{3}ml$/;
const ES_TAMANO_PORTAL = /\b\d{2,4}\s?ml\b/i;
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const cent = (x: number) => Math.round(x * 100);

const pedidos: (Pedido & { fecha: string })[] = [];
for (const f of (await readdir(DIR)).filter((x) => /^\d+_.*\.json$/.test(x) && !x.startsWith('informe'))) {
  const id = Number(f.split('_')[0]);
  const cfg = configDe(id)!;
  for (const p of JSON.parse(await readFile(join(DIR, f), 'utf8')) as Pedido[])
    pedidos.push({ ...p, fecha: momentoPedido(p.createdAt, cfg.modoTiempo, cfg.zona)?.fecha ?? '?' });
}

// 1) Precios observados por nombre exacto, sucursal, origen y tamaño (solo líneas y pedidos sin descuento).
type Clave = string;
const precios = new Map<Clave, Map<number, { lineas: number; primera: string; ultima: string }>>();
const codigosPorNombre = new Map<string, Map<string, number>>();
const tamanosPorNombre = new Map<string, Map<string, number>>();
const lineasPorNombre = new Map<string, number>();
for (const p of pedidos)
  for (const i of p.items) {
    const nombre = i.productName;
    lineasPorNombre.set(nombre, (lineasPorNombre.get(nombre) ?? 0) + 1);
    const cod = i.defaultCode ?? '<null>';
    const mc = codigosPorNombre.get(nombre) ?? new Map(); mc.set(cod, (mc.get(cod) ?? 0) + 1); codigosPorNombre.set(nombre, mc);
    const tam = (i.itemsCustom ?? []).find((c) => ES_TAMANO.test(c.productName));
    const tamano = tam ? tam.productName : '(sin tamaño)';
    const mt = tamanosPorNombre.get(nombre) ?? new Map(); mt.set(tamano, (mt.get(tamano) ?? 0) + 1); tamanosPorNombre.set(nombre, mt);
    if (i.discount !== 0 || p.discount !== 0 || (tam && tam.discount !== 0)) continue;
    // Precio del tamaño = base + extra del custom de tamaño (otros customs no cuentan).
    const precio = cent(i.amount) + (tam ? cent(tam.amount) : 0);
    const k = `${nombre}\u0000${p.companyId}\u0000${origen(p)}\u0000${tamano}`;
    const m = precios.get(k) ?? new Map();
    const x = m.get(precio) ?? { lineas: 0, primera: p.fecha, ultima: p.fecha };
    x.lineas++; if (p.fecha < x.primera) x.primera = p.fecha; if (p.fecha > x.ultima) x.ultima = p.fecha;
    m.set(precio, x); precios.set(k, m);
  }
const evidenciaPrecio = (nombre: string) =>
  [...precios].filter(([k]) => k.split('\u0000')[0] === nombre).map(([k, m]) => {
    const [, s, og, tam] = k.split('\u0000');
    const vals = [...m].sort((a, b) => b[1].lineas - a[1].lineas);
    return { sucursal: +s, origen: og, tamano: tam, precios: vals.map(([pc, v]) => ({ precioCent: pc, ...v })) };
  }).sort((a, b) => a.sucursal - b.sucursal || a.origen.localeCompare(b.origen) || a.tamano.localeCompare(b.tamano));

// 2) Candidatos Costeo ↔ API por nombre (exacto / sin mayúsculas / normalizado). Solo sugerencias.
const inv = JSON.parse(await readFile(invPath, 'utf8')) as {
  productos: { id: string; nombre: string; tipo: string; categoria: string | null }[];
  tamanosProducto: { producto_id: string; tamano: string; precio_lista: string | null }[];
  preciosManuales: { producto_id: string; tamano: string; canal: string; precio: string }[];
};
const nombresApi = [...lineasPorNombre.keys()];
const cotejo = inv.productos.filter((r) => r.tipo === 'producto').map((r) => {
  const exacta = nombresApi.filter((n) => n === r.nombre);
  const mayus = exacta.length ? [] : nombresApi.filter((n) => n.toLowerCase() === r.nombre.toLowerCase());
  const normal = exacta.length || mayus.length ? [] : nombresApi.filter((n) => norm(n) === norm(r.nombre));
  const candidatos = [...exacta, ...mayus, ...normal];
  return {
    id: r.id, nombre: r.nombre, categoria: r.categoria,
    tamanos: inv.tamanosProducto.filter((t) => t.producto_id === r.id).map((t) => ({ tamano: t.tamano, precioLista: t.precio_lista })),
    rappiManual: inv.preciosManuales.filter((m) => m.producto_id === r.id).map((m) => ({ tamano: m.tamano, precio: m.precio })),
    coincidencia: exacta.length ? 'exacta' : mayus.length ? 'mayusculas' : normal.length ? 'normalizada' : 'sin-coincidencia',
    api: candidatos.map((n) => ({ nombre: n, lineas: lineasPorNombre.get(n), codigos: Object.fromEntries(codigosPorNombre.get(n)!),
      tamanos: Object.fromEntries(tamanosPorNombre.get(n)!), evidencia: evidenciaPrecio(n) })),
  };
});
const usados = new Set(cotejo.flatMap((c) => c.api.map((a) => a.nombre)));
const apiSinLocal = nombresApi.filter((n) => !usados.has(n)).map((n) => ({ nombre: n, lineas: lineasPorNombre.get(n),
  codigos: Object.fromEntries(codigosPorNombre.get(n)!), tamanos: Object.fromEntries(tamanosPorNombre.get(n)!) }))
  .sort((a, b) => b.lineas! - a.lineas!);

// 3) GENERIC: composición de pedidos, precios, customs, semanas, neto.
const conGeneric = pedidos.filter((p) => p.items.some((i) => i.defaultCode === 'GENERIC' || /gen[eé]ric/i.test(i.productName)));
const lineasGeneric = conGeneric.flatMap((p) => p.items.filter((i) => i.defaultCode === 'GENERIC').map((i) => ({ p, i })));
const histo = (xs: (string | number)[]) => Object.entries(xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {}))
  .sort((a, b) => b[1] - a[1]);
const semana = (f: string) => { const d = new Date(`${f}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
const rappi532 = pedidos.filter((p) => p.companyId === 532 && origen(p) === 'rappi');
const generic = {
  pedidos: conGeneric.length, lineas: lineasGeneric.length,
  importeCent: lineasGeneric.reduce((s, x) => s + cent(x.i.amount) + (x.i.itemsCustom ?? []).reduce((t, c) => t + cent(c.amount), 0), 0),
  porSucursalOrigen: histo(conGeneric.map((p) => `${p.companyId}|${origen(p)}|${p.paymentMethod}|${p.paymentType}`)),
  porSemana: histo(conGeneric.map((p) => semana(p.fecha))),
  pedidosSoloGeneric: conGeneric.filter((p) => p.items.every((i) => i.defaultCode === 'GENERIC')).length,
  otrosProductosEnMismoPedido: histo(conGeneric.flatMap((p) => p.items.filter((i) => i.defaultCode !== 'GENERIC').map((i) => i.productName))).slice(0, 15),
  lineasConCustoms: lineasGeneric.filter((x) => (x.i.itemsCustom ?? []).length > 0).length,
  customs: histo(lineasGeneric.flatMap((x) => (x.i.itemsCustom ?? []).map((c) => `${c.defaultCode ?? '<null>'}|${c.productName}|${c.amount}`))),
  descuentoLinea: histo(lineasGeneric.map((x) => x.i.discount)),
  conDescuentoPedido: conGeneric.filter((p) => p.discount !== 0).length,
  importes: histo(lineasGeneric.map((x) => x.i.amount)),
  rappi532: { pedidos: rappi532.length, ventaCent: rappi532.reduce((s, p) => s + cent(p.grossAmount), 0) },
  rappi532PorSemanaConGeneric: Object.fromEntries(histo(rappi532.map((p) => semana(p.fecha)))),
  otrosRappi532Codigos: histo(rappi532.flatMap((p) => p.items.filter((i) => i.defaultCode !== 'GENERIC').map((i) => i.defaultCode ?? '<null>'))).length,
  ejemploRedactado: conGeneric.slice(0, 3).map((p) => ({ origen: origen(p), fecha: p.fecha, grossAmount: p.grossAmount, netAmout: p.netAmout,
    discount: p.discount, items: p.items.map((i) => ({ defaultCode: i.defaultCode, productName: i.productName, amount: i.amount, discount: i.discount,
      itemsCustom: (i.itemsCustom ?? []).map((c) => ({ defaultCode: c.defaultCode, productName: c.productName, amount: c.amount })) })) })),
};

// 4) Códigos nulos en productos padre: origen, sucursal, fecha.
const nulos = pedidos.flatMap((p) => p.items.filter((i) => i.defaultCode === null || i.defaultCode === undefined || i.defaultCode === '').map(() => p));
const codigosNulos = {
  lineas: nulos.length,
  porOrigen: histo(nulos.map((p) => origen(p))), porSucursal: histo(nulos.map((p) => String(p.companyId))),
  porFecha: histo(nulos.map((p) => p.fecha)).sort((a, b) => a[0].localeCompare(b[0])),
  porMetodo: histo(nulos.map((p) => `${p.paymentMethod}|${p.paymentType}|${p.fromSmartphone}`)),
  pedidosConCodigoYSinCodigo: pedidos.filter((p) => p.items.some((i) => !i.defaultCode) && p.items.some((i) => !!i.defaultCode)).length,
  appTotalesPorFecha: histo(pedidos.filter((p) => origen(p) === 'app').map((p) => p.fecha)).sort((a, b) => a[0].localeCompare(b[0])),
};
// 5) Customs: códigos con varios nombres (excluye vacío) y catálogo de tamaños.
const customPorCodigo = new Map<string, Map<string, number>>();
const tamanos = new Map<string, { lineas: number; extras: Map<number, number>; padres: Map<string, number> }>();
for (const p of pedidos) for (const i of p.items) for (const c of i.itemsCustom ?? []) {
  if (c.defaultCode) { const m = customPorCodigo.get(c.defaultCode) ?? new Map(); m.set(c.productName, (m.get(c.productName) ?? 0) + 1); customPorCodigo.set(c.defaultCode, m); }
  if (ES_TAMANO_PORTAL.test(c.productName)) {
    const t = tamanos.get(c.productName) ?? { lineas: 0, extras: new Map(), padres: new Map() };
    t.lineas++; t.extras.set(c.amount, (t.extras.get(c.amount) ?? 0) + 1); t.padres.set(i.productName, (t.padres.get(i.productName) ?? 0) + 1); tamanos.set(c.productName, t);
  }
}
const customsMultiNombre = [...customPorCodigo].filter(([, m]) => m.size > 1).map(([k, m]) => ({ codigo: k, nombres: Object.fromEntries(m) }));
const catalogoTamanos = [...tamanos].map(([n, t]) => ({ tamano: n, lineas: t.lineas, extras: Object.fromEntries(t.extras), padres: t.padres.size,
  padresTop: [...t.padres].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([k]) => k) }));

await writeFile(salida, JSON.stringify({ cotejo, apiSinLocal, generic, codigosNulos, customsMultiNombre, catalogoTamanos }, null, 1));
console.log(`OK → ${salida}`);
