import { readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * Caso Rappi 2 · Análisis local (sin red) de la muestra de fase 2: líneas de bebidas «con vaso» que llegan SIN custom
 * de tamaño, por sucursal, origen y producto; precio base de esas líneas frente a las que sí traen Regular/Large.
 * Bebida «con vaso» = producto que en la muestra aparece al menos una vez con «Regular/Large - N ml».
 *   npx tsx scripts/conciliacion/tamanos-faltantes.ts
 */
type Item = { defaultCode?: string | null; productName: string; amount: number; discount: number; itemsCustom?: Item[] };
type Pedido = { id: number; companyId: number; paymentMethod?: string; fromSmartphone?: boolean | null; discount: number;
  grossAmount: number; netAmout?: number | null; items: Item[] };
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const VASO = /^(Regular|Large) - \d{3}ml$/;
const origen = (p: Pedido) =>
  p.paymentMethod === 'RAPPI' ? 'rappi' : p.fromSmartphone === true ? 'app' : p.fromSmartphone === false ? 'mostrador' : 'desconocido';

const pedidos: Pedido[] = [];
for (const f of (await readdir(DIR)).filter((x) => /^\d+_\d{4}-\d{2}-\d{2}_/.test(x)))
  pedidos.push(...(JSON.parse(await readFile(join(DIR, f), 'utf8')) as Pedido[]));

const conVaso = new Set<string>();
for (const p of pedidos) for (const i of p.items) if ((i.itemsCustom ?? []).some((c) => VASO.test(c.productName))) conVaso.add(i.productName);

const porCanal: Record<string, { lineas: number; sinVaso: number }> = {};
const porProducto: Record<string, Record<string, { lineas: number; sinVaso: number; base: Record<string, number> }>> = {};
const pedidosRappiSinVaso = new Set<number>();
for (const p of pedidos)
  for (const i of p.items) {
    if (!conVaso.has(i.productName)) continue;
    const vaso = (i.itemsCustom ?? []).find((c) => VASO.test(c.productName));
    const k = `${p.companyId}|${origen(p)}`;
    porCanal[k] ??= { lineas: 0, sinVaso: 0 };
    porCanal[k].lineas++;
    const prod = (porProducto[i.productName] ??= {});
    const x = (prod[k] ??= { lineas: 0, sinVaso: 0, base: {} });
    x.lineas++;
    const etiqueta = vaso ? `${vaso.productName.split(' - ')[0]}+${vaso.amount}` : 'SIN VASO';
    const clave = `${etiqueta}@${i.amount}`;
    x.base[clave] = (x.base[clave] ?? 0) + 1;
    if (!vaso) {
      porCanal[k].sinVaso++;
      x.sinVaso++;
      if (origen(p) === 'rappi') pedidosRappiSinVaso.add(p.id);
    }
  }
const rappi = pedidos.filter((p) => origen(p) === 'rappi');
const netMayor = rappi.filter((p) => p.netAmout != null && p.netAmout > p.grossAmount);
console.log(
  JSON.stringify(
    {
      pedidos: pedidos.length,
      productosConVaso: conVaso.size,
      porCanal,
      productosConSinVasoEnRappi: Object.fromEntries(
        Object.entries(porProducto)
          .filter(([, v]) => Object.entries(v).some(([k, y]) => k.endsWith('|rappi') && y.sinVaso > 0))
          .map(([n, v]) => [n, v]),
      ),
      rappi: {
        pedidos: rappi.length,
        conAlgunaBebidaSinVaso: pedidosRappiSinVaso.size,
        netMayorQueGross: netMayor.length,
        netMayorQueGrossYSinVaso: netMayor.filter((p) => pedidosRappiSinVaso.has(p.id)).length,
      },
    },
    null,
    1,
  ),
);
