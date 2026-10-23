import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDe } from '../../lib/sucursales/config';
import { importeLinea, normalizar, type LineaNormal, type PedidoNormal } from '../../lib/sucursales/normalizar';
import { filtrarOrigen, productos, type FiltroOrigen } from '../../lib/sucursales/metricas';

/**
 * Fase 2 · Simulación local del ranking (no modifica el portal). Compara la agrupación actual (`codigo`) con:
 *  A) nombre exacto (`productName`), B) código observado del mismo nombre (alias por ventana) y C) código+nombre.
 * Verifica conservación de venta, líneas e importes de customs, y mide la regex de tamaño del portal.
 *   npx tsx --conditions=react-server scripts/conciliacion/simular-ranking.ts <salida.json>
 */
const salida = process.argv[2];
if (!salida) throw new Error('Uso: simular-ranking.ts <salida.json>');
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const porSucursal = new Map<number, PedidoNormal[]>();
const crudosCodigo = new Map<string, string | null>(); // pedidoId|índice → defaultCode crudo
for (const f of (await readdir(DIR)).filter((x) => /^\d+_\d{4}/.test(x))) {
  const [id, desde, hasta] = f.replace('.json', '').split('_');
  const crudos = JSON.parse(await readFile(join(DIR, f), 'utf8')) as { id: number; items: { defaultCode?: string | null }[] }[];
  for (const p of crudos) p.items.forEach((i, k) => crudosCodigo.set(`${p.id}|${k}`, i.defaultCode ?? null));
  const n = normalizar(crudos as unknown as Record<string, unknown>[], configDe(Number(id))!, { desde, hasta });
  porSucursal.set(Number(id), [...(porSucursal.get(Number(id)) ?? []), ...n.pedidos]);
}

type Clave = (p: PedidoNormal, l: LineaNormal, k: number) => string;
const agrupar = (ps: PedidoNormal[], clave: Clave) => {
  const m = new Map<string, { importeCent: number; lineas: number; customsCent: number; nombres: Set<string> }>();
  for (const p of ps) p.lineas.forEach((l, k) => {
    const c = clave(p, l, k); const x = m.get(c) ?? { importeCent: 0, lineas: 0, customsCent: 0, nombres: new Set() };
    const imp = importeLinea(l); x.importeCent += imp; x.lineas++; x.customsCent += imp - l.importeCent; x.nombres.add(l.nombre); m.set(c, x);
  });
  return m;
};
const tot = (m: Map<string, { importeCent: number; lineas: number; customsCent: number }>) =>
  [...m.values()].reduce((s, x) => ({ importeCent: s.importeCent + x.importeCent, lineas: s.lineas + x.lineas, customsCent: s.customsCent + x.customsCent }),
    { importeCent: 0, lineas: 0, customsCent: 0 });

const resultado = [];
for (const [id, todos] of porSucursal)
  for (const origen of ['todos', 'mostrador', 'app', 'rappi'] as FiltroOrigen[]) {
    const ps = filtrarOrigen(todos, origen);
    if (!ps.length) continue;
    // B) alias: para cada nombre, el código no nulo más frecuente en la ventana de la sucursal.
    const codigoDeNombre = new Map<string, Map<string, number>>();
    for (const p of todos) p.lineas.forEach((l, k) => { const c = crudosCodigo.get(`${p.id}|${k}`); if (!c) return;
      const m = codigoDeNombre.get(l.nombre) ?? new Map(); m.set(c, (m.get(c) ?? 0) + 1); codigoDeNombre.set(l.nombre, m); });
    const alias = (n: string) => [...(codigoDeNombre.get(n) ?? new Map<string, number>())].sort((a, b) => b[1] - a[1])[0]?.[0];
    const actual = agrupar(ps, (_p, l) => l.codigo);
    const A = agrupar(ps, (_p, l) => l.nombre);
    const B = agrupar(ps, (p, l, k) => crudosCodigo.get(`${p.id}|${k}`) ?? alias(l.nombre) ?? l.nombre);
    const C = agrupar(ps, (_p, l) => `${l.codigo}\u0000${l.nombre}`);
    const venta = ps.reduce((s, p) => s + p.ventaCent, 0);
    const portal = productos(ps);
    const partidos = [...actual].filter(([k, v]) => v.nombres.size === 1 && [...actual].some(([k2, v2]) => k2 !== k && v2.nombres.has([...v.nombres][0])));
    const tamanosPortal = portal.flatMap((x) => x.tamanos.map((t) => t.nombre));
    const generic = portal.find((x) => x.codigo === 'GENERIC');
    resultado.push({
      companyId: id, origen, pedidos: ps.length, ventaCent: venta,
      filas: { actual: actual.size, A_nombre: A.size, B_codigoAlias: B.size, C_codigoNombre: C.size, portal: portal.length },
      totales: { actual: tot(actual), A: tot(A), B: tot(B), C: tot(C) },
      residualVentaMenosLineas: venta - tot(actual).importeCent,
      pedidosQueNoCuadran: ps.filter((p) => !p.cuadra).length,
      productosPartidosPorCodigoNulo: partidos.length / 2,
      ejemplosPartidos: [...new Set(partidos.map(([, v]) => [...v.nombres][0]))].slice(0, 6),
      codigosConVariosNombres: [...actual].filter(([, v]) => v.nombres.size > 1).map(([k, v]) => ({ codigo: k, nombres: [...v.nombres] })),
      generic: generic ? { importeCent: generic.importeCent, lineas: generic.lineas, pedidos: generic.pedidos, participacion: generic.participacion,
        posicion: portal.indexOf(generic) + 1 } : null,
      tamanosPortalNoVaso: [...new Set(tamanosPortal.filter((t) => !/^(Regular|Large) - \d{3}ml$/.test(t)))],
    });
  }
await writeFile(salida, JSON.stringify(resultado, null, 1));
for (const r of resultado) console.log(JSON.stringify({ s: r.companyId, o: r.origen, filas: r.filas, partidos: r.productosPartidosPorCodigoNulo,
  conserva: ['A', 'B', 'C'].every((k) => JSON.stringify(r.totales[k as 'A']) === JSON.stringify(r.totales.actual)), residual: r.residualVentaMenosLineas,
  noCuadran: r.pedidosQueNoCuadran, multi: r.codigosConVariosNombres.length, generic: r.generic, noVaso: r.tamanosPortalNoVaso.length }));
