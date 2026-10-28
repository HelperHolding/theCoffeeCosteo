import { readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { configDe } from '../../lib/sucursales/config';
import { CODIGO_GENERICO, ES_TAMANO, identificador } from '../../lib/sucursales/metricas';
import { normalizar, type PedidoNormal } from '../../lib/sucursales/normalizar';
import { TAMANOS_VERIFICADOS } from '../../lib/sucursales/tamanos-verificados';
import { conLectura } from './db-lectura';

/**
 * Doc 30 · Verificación de SOLO LECTURA del portal contra la API de Brasil, antes de cotejar con Zoho.
 * Cruza las ventas reales (crudos de extraer-brasil.ts, fuera del repo) con lo que tiene Costeo hoy:
 *  - catálogo: ¿el código del POS está enlazado a una receta activa?
 *  - recetario: estado frente al PDF oficial, RECALCULADO con las cantidades actuales (matriz del doc 21 como referencia);
 *  - tamaños: ¿el vaso vendido está verificado para esa receta?
 *  - costo: costo actual por tamaño, insumos inactivos, insumos a $0 y costos señalados como dudosos;
 *  - precio: precio de lista de Costeo (y precio de canal Rappi) frente al precio cobrado sin descuento en cada sucursal.
 * No escribe en la base ni en la API. Salida: CSV por código y resumen JSON.
 *   npx tsx scripts/conciliacion/verificacion-portal.ts <desde> <hasta> <salida.csv> 612 583 532
 */
const [desde, hasta, salida, ...ids] = process.argv.slice(2);
if (!desde || !hasta || !salida || !ids.length)
  throw new Error('Uso: verificacion-portal.ts <desde> <hasta> <salida.csv> <ids…>');
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const DUDOSOS = new Set(['JAMON SERRANO 100G TGM', 'ARANDANO CON MATCHA 1 KG']); // K3 y K4 (doc 21)
const SUPUESTOS_CERO = new Set(['AGUA', 'HIELO', 'HIELO (g)']); // $0 sin confirmar por Compras (doc 22, pregunta 7)

// 1. Ventas por sucursal (semanas cerradas dentro del rango).
const semanas: { desde: string; hasta: string }[] = [];
for (
  let d = new Date(`${desde}T00:00:00Z`);
  d.toISOString().slice(0, 10) <= hasta;
  d.setUTCDate(d.getUTCDate() + 7)
) {
  const f = new Date(d);
  f.setUTCDate(f.getUTCDate() + 6);
  semanas.push({ desde: d.toISOString().slice(0, 10), hasta: f.toISOString().slice(0, 10) });
}
const ventas = new Map<number, PedidoNormal[]>();
for (const id of ids.map(Number)) {
  const cfg = configDe(id);
  if (!cfg) throw new Error(`company ${id} no configurada`);
  const ps: PedidoNormal[] = [];
  for (const s of semanas) {
    const crudos = JSON.parse(await readFile(join(DIR, `${id}_${s.desde}_${s.hasta}.json`), 'utf8'));
    const n = normalizar(crudos, cfg, s);
    if (n.invalidos) throw new Error(`${id} ${s.desde}: ${n.invalidos} registros inválidos`);
    ps.push(...n.pedidos);
  }
  ventas.set(id, ps);
}

// 2. Costeo (solo lectura).
type Fila = Record<string, unknown>;
const { resultado: db } = await conLectura(async (q) => ({
  enlaces: (await q(`select codigo, receta_id from producto_codigo_pos`)).rows,
  recetas: (await q(`select id, nombre, activo from recetas where tipo = 'producto'`)).rows,
  tamanos: (
    await q(
      `select pt.producto_id, t.nombre tamano, pt.precio_lista::float8 precio from producto_tamanos pt join tamanos t on t.id = pt.tamano_id`,
    )
  ).rows,
  costos: (
    await q(
      `select v.producto_id, t.nombre tamano, v.costo::float8 costo, v.usa_inactivo from v_costo_producto v join tamanos t on t.id = v.tamano_id`,
    )
  ).rows,
  rappi: (
    await q(`select producto_id, tamano, precio_canal::float8 precio from v_resumen where canal = 'Rappi'`)
  ).rows,
  lineas: (
    await q(`select l.receta_id, coalesce(i.nombre, s.nombre) componente, i.costo_paquete::float8 costo_paquete, i.activo insumo_activo,
                           coalesce(t.nombre, 'Único') tamano, lc.cantidad::float8 cantidad
                      from receta_lineas l left join insumos i on i.id = l.insumo_id left join recetas s on s.id = l.subreceta_id
                      left join linea_cantidades lc on lc.linea_id = l.id left join tamanos t on t.id = lc.tamano_id`)
  ).rows,
}));
const enlace = new Map(db.enlaces.map((e: Fila) => [String(e.codigo), String(e.receta_id)]));
const receta = new Map(db.recetas.map((r: Fila) => [String(r.id), r]));
const porReceta = <T extends Fila>(xs: T[]) => {
  const m = new Map<string, T[]>();
  for (const x of xs)
    m.set(String(x.producto_id ?? x.receta_id), [...(m.get(String(x.producto_id ?? x.receta_id)) ?? []), x]);
  return m;
};
const tamanosDe = porReceta(db.tamanos);
const costosDe = porReceta(db.costos);
const rappiDe = porReceta(db.rappi);
const lineasDe = porReceta(db.lineas);

// 3. Recetario: matriz del doc 21 recalculada con las cantidades actuales.
const csv = (t: string) => {
  const filas: string[][] = [];
  let f: string[] = [],
    c = '',
    q = false;
  for (let i = 0; i < t.length; i++) {
    const ch = t[i];
    if (q) {
      if (ch === '"' && t[i + 1] === '"') ((c += '"'), i++);
      else if (ch === '"') q = false;
      else c += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') (f.push(c), (c = ''));
    else if (ch === '\n') (f.push(c.replace(/\r$/, '')), filas.push(f), (f = []), (c = ''));
    else c += ch;
  }
  if (c || f.length) (f.push(c), filas.push(f));
  const [cab, ...resto] = filas;
  return resto
    .filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(cab.map((k, i) => [k.replace(/^﻿/, ''), r[i] ?? ''])));
};
const matriz = csv(await readFile('docs/conciliacion-brasil/21-matriz-recetario.csv', 'utf8'));
const estadoReceta = new Map<string, { estado: string; detalle: string[] }>();
for (const [rid, filas] of Object.entries(Object.groupBy(matriz, (m) => m.receta_id))) {
  const actuales = lineasDe.get(rid) ?? [];
  const detalle: string[] = [];
  let supuestos = 0,
    discrepancias = 0,
    incomparables = 0;
  for (const m of filas!) {
    // H2 (doc 23) y el lote del doc 29 pasaron líneas de HIELO a HIELO (g) con los mismos números.
    const mismo = (c: unknown) =>
      c === m.componente_costeo || (m.componente_costeo === 'HIELO' && c === 'HIELO (g)');
    const cant = actuales
      .filter((l) => mismo(l.componente) && l.tamano === m.tamano)
      .map((l) => Number(l.cantidad));
    const actual = cant.length ? cant.reduce((a, b) => a + b, 0) : null;
    if (m.esperado === '') {
      incomparables++;
      detalle.push(`${m.tamano} ${m.componente_costeo}: sin cantidad comparable en el PDF`);
      continue;
    }
    const esperado = Number(m.esperado);
    // Si la cantidad es la auditada en el doc 21, vale su calificación (que ya tolera redondeos de subrecetas);
    // si cambió después (lotes aplicados), se recalifica con la misma tolerancia relativa de 1 %.
    const auditada =
      m.actual === ''
        ? actual === null || actual === 0
        : actual !== null && Math.abs(actual - Number(m.actual)) < 1e-6;
    const coincide = auditada
      ? m.estado.startsWith('coincide')
      : Math.abs((actual ?? 0) - esperado) <= Math.max(1e-6, 0.01 * Math.abs(esperado));
    if (!coincide) {
      discrepancias++;
      detalle.push(
        `${m.tamano} ${m.componente_costeo}: Costeo ${actual ?? 'ausente'} vs PDF ${esperado}${m.supuesto === 'true' ? ' (con supuesto)' : ''}`,
      );
    } else if (m.supuesto === 'true') supuestos++;
  }
  estadoReceta.set(rid, {
    estado: discrepancias
      ? 'con discrepancias'
      : incomparables
        ? 'validada parcialmente'
        : supuestos
          ? 'validada con supuestos'
          : 'validada',
    detalle,
  });
}

// 4. Agregado por código del POS (identidad de #40: nombre exacto y código único por sucursal y periodo).
const precioLista = (l: PedidoNormal['lineas'][number]) =>
  l.importeCent + l.customs.filter((c) => ES_TAMANO.test(c.nombre)).reduce((s, c) => s + c.importeCent, 0);
interface Agg {
  codigo: string;
  nombres: Map<string, number>;
  lineas: Record<number, number>;
  importe: Record<number, number>;
  vasos: Map<string, number>;
  conCustom: number;
  precios: Map<string, Map<number, number>>; // "sucursal|origen|vaso" → precio → veces (líneas sin descuento)
}
const aggs = new Map<string, Agg>();
const totalSuc: Record<number, number> = {};
for (const [id, ps] of ventas) {
  const ident = identificador(ps);
  for (const p of ps)
    for (const l of p.lineas) {
      const imp = l.importeCent + l.customs.reduce((s, c) => s + c.importeCent, 0);
      totalSuc[id] = (totalSuc[id] ?? 0) + imp;
      const { codigo, sinCodigo } = ident(l);
      const k = sinCodigo ? `sin código: ${l.nombre}` : codigo;
      const a: Agg = aggs.get(k) ?? {
        codigo: k,
        nombres: new Map(),
        lineas: {},
        importe: {},
        vasos: new Map(),
        conCustom: 0,
        precios: new Map(),
      };
      aggs.set(k, a);
      a.nombres.set(l.nombre, (a.nombres.get(l.nombre) ?? 0) + 1);
      a.lineas[id] = (a.lineas[id] ?? 0) + 1;
      a.importe[id] = (a.importe[id] ?? 0) + imp;
      const vasos = l.customs
        .filter((c) => ES_TAMANO.test(c.nombre))
        .map((c) => (c.nombre.startsWith('Regular') ? 'Regular' : 'Large'));
      const vaso = vasos.length === 1 ? vasos[0] : vasos.length ? 'varios' : 'sin vaso';
      a.vasos.set(vaso, (a.vasos.get(vaso) ?? 0) + 1);
      if (l.customs.some((c) => !ES_TAMANO.test(c.nombre))) a.conCustom++;
      if (l.descuentoPct === 0 && l.customs.every((c) => c.descuentoPct === 0)) {
        const kp = `${id}|${p.origen === 'rappi' ? 'rappi' : 'tienda'}|${vaso}`;
        const m = a.precios.get(kp) ?? new Map<number, number>();
        a.precios.set(kp, m);
        m.set(precioLista(l), (m.get(precioLista(l)) ?? 0) + 1);
      }
    }
}

// 5. Clasificación por código.
const modo = (m?: Map<number, number>) =>
  m ? [...m].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0]?.[0] : undefined;
const tamCosteo = (rid: string, vaso: string, unicas: boolean) =>
  vaso === 'sin vaso'
    ? unicas
      ? 'Único'
      : null
    : vaso === 'varios'
      ? null
      : (TAMANOS_VERIFICADOS[rid]?.[vaso as 'Regular' | 'Large'] ?? null);
const filas: Fila[] = [];
for (const a of aggs.values()) {
  const total = Object.values(a.importe).reduce((s, x) => s + x, 0);
  const nombre = [...a.nombres].sort((x, y) => y[1] - x[1])[0][0];
  const rid = a.codigo.startsWith('sin código') ? undefined : enlace.get(a.codigo);
  const r = rid ? receta.get(rid) : undefined;
  const ts = rid ? (tamanosDe.get(rid) ?? []) : [];
  const unicas = ts.length === 1 && ts[0].tamano === 'Único';
  const est = rid ? estadoReceta.get(rid) : undefined;
  const lineasR = rid ? (lineasDe.get(rid) ?? []) : [];
  const insumosCero = [
    ...new Set(lineasR.filter((l) => l.costo_paquete === 0).map((l) => String(l.componente))),
  ];
  const inactivos = [
    ...new Set(lineasR.filter((l) => l.insumo_activo === false).map((l) => String(l.componente))),
  ];
  const dudosos = [...new Set(lineasR.map((l) => String(l.componente)).filter((c) => DUDOSOS.has(c)))];
  // Costo por tamaño de Costeo vendido.
  const vendidos = new Map<string, number>();
  let sinTamano = 0;
  for (const [vaso, n] of a.vasos) {
    const t = rid ? tamCosteo(rid, vaso, unicas) : null;
    if (t) vendidos.set(t, (vendidos.get(t) ?? 0) + n);
    else sinTamano += n;
  }
  const costos = rid ? (costosDe.get(rid) ?? []) : [];
  const costoTxt = [...vendidos.keys()].map((t) => {
    const c = costos.find((x) => x.tamano === t);
    return c
      ? `${t} $${Number(c.costo).toFixed(2)}${c.usa_inactivo ? ' (insumo inactivo)' : ''}`
      : `${t} sin costo`;
  });
  const costoProblema = [...vendidos.keys()].some((t) => {
    const c = costos.find((x) => x.tamano === t);
    return !c || !(Number(c.costo) > 0) || c.usa_inactivo;
  });
  // Precios: Costeo (lista y Rappi) frente al cobrado más frecuente sin descuento.
  const comparar: string[] = [];
  let preciosIguales = 0,
    preciosDistintos = 0;
  for (const [kp, m] of a.precios) {
    const [suc, canal, vaso] = kp.split('|');
    const t = rid ? tamCosteo(rid, vaso, unicas) : null;
    if (!t) continue;
    const cobrado = modo(m)! / 100;
    const lista =
      canal === 'rappi'
        ? (rappiDe.get(rid!) ?? []).find((x) => x.tamano === t)?.precio
        : ts.find((x) => x.tamano === t)?.precio;
    if (lista === undefined || lista === null) continue;
    const igual = Math.abs(Number(lista) - cobrado) < 0.005;
    if (igual) preciosIguales++;
    else preciosDistintos++;
    comparar.push(`${suc} ${canal} ${t}: POS $${cobrado} / Costeo $${Number(lista)}${igual ? '' : ' ≠'}`);
  }
  const catalogo =
    a.codigo === CODIGO_GENERICO
      ? 'Generic'
      : a.codigo.startsWith('sin código')
        ? 'sin código'
        : !rid
          ? 'sin enlace'
          : !r?.activo
            ? 'receta inactiva'
            : 'enlazado';
  filas.push({
    codigo: a.codigo,
    nombre_pos: nombre,
    receta: r ? String(r.nombre) : '',
    catalogo,
    recetario: catalogo !== 'enlazado' ? '' : (est?.estado ?? 'sin ficha en el PDF'),
    recetario_detalle: est?.detalle.join('; ') ?? '',
    lineas: Object.values(a.lineas).reduce((s, x) => s + x, 0),
    importe: total / 100,
    ...Object.fromEntries(ids.map((id) => [`importe_${id}`, (a.importe[Number(id)] ?? 0) / 100])),
    lineas_con_personalizacion: a.conCustom,
    lineas_sin_tamano_mapeado: catalogo === 'enlazado' ? sinTamano : '',
    vasos: [...a.vasos].map(([v, n]) => `${v} ${n}`).join(', '),
    costo_actual: costoTxt.join('; '),
    costo:
      catalogo !== 'enlazado'
        ? ''
        : costoProblema
          ? 'falta o inválido'
          : dudosos.length
            ? 'con costo dudoso'
            : 'calculado',
    insumos_costo_cero: insumosCero.join('; '),
    insumos_costo_cero_no_supuesto: insumosCero.filter((x) => !SUPUESTOS_CERO.has(x)).join('; '),
    insumos_inactivos: inactivos.join('; '),
    costos_dudosos: dudosos.join('; '),
    precios: comparar.sort().join('; '),
    precios_iguales: preciosIguales,
    precios_distintos: preciosDistintos,
  });
}
filas.sort((x, y) => Number(y.importe) - Number(x.importe));

// 6. CSV y resumen ponderado por venta.
const esc = (v: unknown) => (/[",\n;]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
const cols = Object.keys(filas[0]);
await writeFile(
  salida,
  '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c])).join(','))].join('\n') + '\n',
);
const suma = (pred: (f: Fila) => boolean) => filas.filter(pred).reduce((s, f) => s + Number(f.importe), 0);
const total = suma(() => true);
const pct = (x: number) => `${((100 * x) / total).toFixed(1)}%`;
const grupo = (campo: string, pred: (f: Fila) => boolean = () => true) =>
  Object.fromEntries(
    Object.entries(Object.groupBy(filas.filter(pred), (f) => String(f[campo]))).map(([k, fs]) => [
      k || '(n/a)',
      {
        codigos: fs!.length,
        importe: Math.round(fs!.reduce((s, f) => s + Number(f.importe), 0)),
        pct: pct(fs!.reduce((s, f) => s + Number(f.importe), 0)),
      },
    ]),
  );
const enl = (f: Fila) => f.catalogo === 'enlazado';
console.log(
  JSON.stringify(
    {
      periodo: { desde, hasta, semanas: semanas.length, sucursales: ids },
      pedidos: Object.fromEntries([...ventas].map(([id, ps]) => [id, ps.length])),
      venta: Object.fromEntries(Object.entries(totalSuc).map(([k, v]) => [k, v / 100])),
      total,
      codigos: filas.length,
      catalogo: grupo('catalogo'),
      recetario: grupo('recetario', enl),
      costo: grupo('costo', enl),
      precios: {
        comparaciones: filas.reduce((s, f) => s + Number(f.precios_iguales) + Number(f.precios_distintos), 0),
        iguales: filas.reduce((s, f) => s + Number(f.precios_iguales), 0),
        distintos: filas.reduce((s, f) => s + Number(f.precios_distintos), 0),
      },
      costeoSinVentas: db.recetas.filter(
        (r: Fila) => r.activo && ![...enlace.entries()].some(([c, id]) => id === r.id && aggs.has(c)),
      ).length,
      enlacesSinVentas: [...enlace.keys()].filter((c) => !aggs.has(c)),
    },
    null,
    1,
  ),
);
