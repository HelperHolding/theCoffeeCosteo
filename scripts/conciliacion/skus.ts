import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * SKUs (defaultCode) · Análisis local (sin red) de la muestra de fase 2 y del inventario de Costeo:
 * 1) presencia de defaultCode en líneas y customs por canal; 2) catálogo observado código ↔ nombre;
 * 3) candidatos de enlace código → receta de Costeo por nombre (solo sugerencia, nada se escribe).
 *   npx tsx scripts/conciliacion/skus.ts <inventario.json> <salida.json>
 */
const [invP, salida] = process.argv.slice(2);
if (!invP || !salida) throw new Error('Uso: skus.ts <inventario.json> <salida.json>');
type Item = { defaultCode?: string | null; productName: string; amount: number; itemsCustom?: Item[] };
type Pedido = { companyId: number; paymentMethod?: string; fromSmartphone?: boolean | null; createdAt: string; items: Item[] };
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const origen = (p: Pedido) =>
  p.paymentMethod === 'RAPPI' ? 'rappi' : p.fromSmartphone === true ? 'app' : p.fromSmartphone === false ? 'mostrador' : '?';
const pedidos: Pedido[] = [];
for (const f of (await readdir(DIR)).filter((x) => /^\d+_\d{4}-\d{2}-\d{2}_/.test(x)))
  pedidos.push(...(JSON.parse(await readFile(join(DIR, f), 'utf8')) as Pedido[]));

const presencia: Record<string, { lineas: number; lineasSinCodigo: number; customs: number; customsSinCodigo: number; generic: number }> = {};
const codigos = new Map<string, { nombres: Map<string, number>; canales: Set<string> }>();
for (const p of pedidos) {
  const k = `${p.companyId}|${origen(p)}`;
  const x = (presencia[k] ??= { lineas: 0, lineasSinCodigo: 0, customs: 0, customsSinCodigo: 0, generic: 0 });
  for (const i of p.items) {
    x.lineas++;
    if (!i.defaultCode) x.lineasSinCodigo++;
    if (i.defaultCode === 'GENERIC') x.generic++;
    else if (i.defaultCode) {
      const c = codigos.get(i.defaultCode) ?? { nombres: new Map(), canales: new Set() };
      c.nombres.set(i.productName, (c.nombres.get(i.productName) ?? 0) + 1);
      c.canales.add(origen(p));
      codigos.set(i.defaultCode, c);
    }
    for (const c of i.itemsCustom ?? []) {
      x.customs++;
      if (!c.defaultCode) x.customsSinCodigo++;
    }
  }
}

const inv = JSON.parse(await readFile(invP, 'utf8')) as { productos: { id: string; nombre: string; tipo: string; activo: boolean }[] };
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/\s+/g, ' ').trim().toLowerCase();
const recetas = inv.productos.filter((r) => r.tipo === 'producto');
const catalogo = [...codigos].map(([codigo, c]) => {
  const nombres = [...c.nombres].sort((a, b) => b[1] - a[1]);
  const nombre = nombres[0][0];
  const exacta = recetas.filter((r) => r.nombre === nombre);
  const parecida = exacta.length ? [] : recetas.filter((r) => norm(r.nombre) === norm(nombre));
  return {
    codigo,
    nombre,
    otrosNombres: nombres.slice(1).map(([n]) => n),
    lineas: nombres.reduce((s, [, n]) => s + n, 0),
    canales: [...c.canales].sort(),
    enlace: exacta.length === 1 ? 'exacta' : parecida.length === 1 ? 'mayusculas/espacios' : exacta.length + parecida.length > 1 ? 'ambigua' : 'sin receta',
    recetaId: (exacta[0] ?? parecida[0])?.id ?? null,
    recetaNombre: (exacta[0] ?? parecida[0])?.nombre ?? null,
  };
}).sort((a, b) => b.lineas - a.lineas);
const resumen = catalogo.reduce<Record<string, { codigos: number; lineas: number }>>((m, c) => {
  m[c.enlace] ??= { codigos: 0, lineas: 0 };
  m[c.enlace].codigos++;
  m[c.enlace].lineas += c.lineas;
  return m;
}, {});
const { writeFile } = await import('node:fs/promises');
await writeFile(salida, JSON.stringify({ presencia, resumen, catalogo }, null, 1));
console.log(JSON.stringify({ presencia, resumen }, null, 1));
