import { readFile, writeFile } from 'node:fs/promises';

/**
 * Fase 2 · Matriz de discrepancias (CSV) a partir de cotejo.json + inventario.json + recetario-indice.json.
 * Ningún estado significa «aprobado». Sin PII: solo PK locales, nombres de producto, precios y contexto.
 *   npx tsx scripts/conciliacion/generar-matriz.ts <cotejo.json> <inventario.json> <recetario-indice.json> <salida.csv> <resumen.json>
 */
const [cotejoP, invP, recP, csvP, resP] = process.argv.slice(2);
if (!resP) throw new Error('Uso: generar-matriz.ts <cotejo> <inventario> <recetario> <salida.csv> <resumen.json>');
const leer = async (p: string) => JSON.parse(await readFile(p, 'utf8'));
const cot = await leer(cotejoP);
const inv = await leer(invP);
const rec = (await leer(recP)) as { pagina: number; titulo: string; tamanos: string[] }[];

const VENTANA = '2026-09-21..2026-10-18 (4 semanas cerradas lun–dom, hora local)';
const COBERTURA = '612·583·532, lecturas completas (5,324 pedidos)';
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, "'").toLowerCase()
  .replace(/frappe/g, 'frap').replace(/[^a-z0-9&+ ]/g, ' ').replace(/\s+/g, ' ').trim();
const tokens = (s: string) => new Set(norm(s).split(' ').filter((t) => t.length > 1));
const jaccard = (a: string, b: string) => { const x = tokens(a), y = tokens(b); const i = [...x].filter((t) => y.has(t)).length; return i / (x.size + y.size - i || 1); };
const lev = (a: string, b: string) => {
  const d = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) { let prev = d[0]; d[0] = i;
    for (let j = 1; j <= b.length; j++) { const t = d[j]; d[j] = Math.min(d[j] + 1, d[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1)); prev = t; } }
  return 1 - d[b.length] / Math.max(a.length, b.length, 1);
};
// Traducciones evidentes observadas en Costeo (solo para sugerir revisión).
const TRADUCCION: [RegExp, string][] = [[/com sorvete/, 'with ice cream'], [/wrap de pollo/, 'chicken wrap'], [/cafes editions/, 'coffee editions'], [/\bchocolat\b/, 'chocolate']];
const canon = (s: string) => TRADUCCION.reduce((x, [r, v]) => x.replace(r, v), norm(s).replace(/ spice\b/g, ''));
/** Similitud solo para sugerir: igualdad canónica, edición ≥ 0.85 o prefijo de ≥ 2 palabras sin combos. */
const parecidos = (a: string, b: string) => {
  const x = canon(a), y = canon(b);
  if (x === y || lev(x, y) >= 0.85) return true;
  const [c, l] = x.length < y.length ? [x, y] : [y, x];
  return !/\+/.test(l) && c.split(' ').length >= 2 && l.startsWith(c + ' ');
};
const recetario = (n: string) => { const m = rec.filter((r) => jaccard(r.titulo.replace('Pumkin', 'Pumpkin'), n) >= 0.6).sort((a, b) => jaccard(b.titulo, n) - jaccard(a.titulo, n))[0]; return m ? `p.${m.pagina} «${m.titulo}»${m.tamanos.length ? ' ' + m.tamanos.join('/') : ''}` : ''; };
const pesos = (c: number) => (c / 100).toFixed(2);

type Fila = Record<string, string>;
const filas: Fila[] = [];
const add = (f: Partial<Fila>) => filas.push({ id: `M${String(filas.length + 1).padStart(3, '0')}`, pk_local: '', entidad: '', campo: '', valor_actual: '',
  valor_observado: '', valor_propuesto: '', codigo_contexto: '', fuente: '', ventana: VENTANA, cobertura: COBERTURA, clase: '', estado: '',
  confianza: '', impacto: '', decision_pendiente: '', ...f } as Fila);

type Ev = { sucursal: number; origen: string; tamano: string; precios: { precioCent: number; lineas: number; primera: string; ultima: string }[] };
type Api = { nombre: string; lineas: number; codigos: Record<string, number>; tamanos: Record<string, number>; evidencia: Ev[] };
type Cot = { id: string; nombre: string; categoria: string; tamanos: { tamano: string; precioLista: string | null }[]; rappiManual: { tamano: string; precio: string }[]; coincidencia: string; api: Api[] };
const MAPA: Record<string, string[]> = { Chica: ['Regular - 240ml', 'Regular - 440ml'], Grande: ['Large - 355ml', 'Large - 600ml'], Único: ['(sin tamaño)'] };
const moda = (ev: Ev[], s: number, og: string, t: string) => ev.find((e) => e.sucursal === s && e.origen === og && e.tamano === t)?.precios ?? [];
const txt = (ps: Ev['precios']) => ps.slice(0, 3).map((p) => `$${pesos(p.precioCent)}×${p.lineas}`).join(', ');
const codigos = (a: Api) => Object.entries(a.codigos).map(([k, n]) => `${k}(${n})`).join(' ');

let sinDiscNombre = 0, preciosIguales = 0;
const productosLocales = (cot.cotejo as Cot[]);
const nombresApiSinLocal = (cot.apiSinLocal as { nombre: string; lineas: number; codigos: Record<string, number> }[]);

for (const c of productosLocales) {
  const a = c.api[0];
  // Nombre
  if (c.coincidencia === 'exacta') sinDiscNombre++;
  else if (a) add({ pk_local: c.id, entidad: 'recetas', campo: 'nombre', valor_actual: c.nombre, valor_observado: a.nombre, valor_propuesto: a.nombre,
    codigo_contexto: codigos(a), fuente: 'API pedidos items.productName', clase: c.coincidencia === 'mayusculas' ? 'nombre/capitalización' : 'nombre/espacios',
    estado: 'candidata', confianza: 'media (nombre observado en pedidos; no prueba catálogo vigente)', impacto: 'Solo nombre visible; recetas.nombre es único global',
    decision_pendiente: 'Adoptar la forma exacta de la API o confirmar con catálogo del proveedor' });
  else {
    const sim = nombresApiSinLocal.map((x) => x.nombre).filter((n) => parecidos(n, c.nombre)).map((n) => [n, lev(canon(n), canon(c.nombre))] as const).sort((x, y) => y[1] - x[1]);
    add({ pk_local: c.id, entidad: 'recetas', campo: 'nombre/identidad', valor_actual: c.nombre, valor_observado: sim.length ? sim.map(([n]) => n).join(' | ') : '(no observado)',
      codigo_contexto: sim.map(([n]) => codigos(nombresApiSinLocal.find((x) => x.nombre === n) as unknown as Api)).join(' | '),
      fuente: sim.length ? 'Similitud de nombre (solo sugerencia)' : 'API pedidos', clase: sim.length ? 'alias/renombre' : 'sin observación en ventana',
      estado: sim.length ? 'ambigua' : 'sin equivalencia', confianza: sim.length ? 'baja (similitud)' : 'n/a — ausencia en 4 semanas no prueba descatalogado',
      impacto: sim.length ? 'Si se confirma, ranking y costeo hablarían del mismo producto' : 'Ninguno inmediato',
      decision_pendiente: sim.length ? 'Confirmar si es el mismo producto (y nombre vigente)' : `Confirmar si sigue en catálogo (${c.categoria ?? 'sin categoría'})` });
  }
  if (!a) continue;
  // Precio de lista por tamaño (Mostrador) — evidencia por tienda
  for (const t of c.tamanos) {
    const claves = MAPA[t.tamano].filter((k) => a.tamanos[k]);
    if (!claves.length) {
      add({ pk_local: c.id, entidad: 'producto_tamanos', campo: `tamaño ${t.tamano}`, valor_actual: `${c.nombre} · ${t.tamano}`, valor_observado: Object.keys(a.tamanos).join(' / '),
        codigo_contexto: codigos(a), fuente: 'API customs de tamaño', clase: 'tamaño/unidad', estado: 'ambigua', confianza: 'media',
        impacto: 'No se puede cotejar el precio de este tamaño', decision_pendiente: 'Definir a qué vaso corresponde el tamaño local' });
      continue;
    }
    const k = claves[0];
    const [m612, m583, m532] = [612, 583, 532].map((s) => moda(a.evidencia, s, 'mostrador', k));
    const local = t.precioLista === null ? null : Math.round(Number(t.precioLista) * 100);
    const top = (x: Ev['precios']) => x[0]?.precioCent;
    const obs = `612: ${txt(m612) || '—'} · 583: ${txt(m583) || '—'} · 532: ${txt(m532) || '—'}`;
    const iguales = [m612, m583, m532].filter((x) => x.length).every((x) => top(x) === local);
    if (local !== null && iguales) { preciosIguales++; continue; }
    const solo532 = local !== null && top(m532) === local;
    add({ pk_local: c.id, entidad: 'producto_tamanos', campo: `precio_lista (${t.tamano}↔${k})`, valor_actual: local === null ? '(null)' : `$${pesos(local)}`,
      valor_observado: obs, codigo_contexto: `${codigos(a)} · Mostrador · sin descuento`, fuente: 'API items.amount + extra custom de tamaño',
      clase: local === null ? 'dato faltante' : solo532 ? 'precio/contexto por tienda' : 'precio/contexto',
      estado: local === null ? 'candidata' : solo532 ? 'ambigua' : 'candidata',
      confianza: [m612, m583, m532].some((x) => x.length && x[0].lineas >= 10) ? 'alta (evidencia de transacción)' : 'baja (pocas líneas)',
      impacto: 'Margen y alertas de v_resumen; precio Rappi por fórmula si no hay manual',
      decision_pendiente: local === null ? 'Definir si se captura precio y de qué tienda/lista' : solo532 ? 'Definir qué lista representa precio_lista (coincide con 532; 612/583 cobran distinto)' : 'Revisar precio local frente a todas las tiendas' });
  }
  // Rappi manual vs Rappi observado (solo 532 tiene Rappi)
  for (const t of c.tamanos) {
    const k = MAPA[t.tamano].find((x) => a.tamanos[x]);
    if (!k) continue;
    const r = moda(a.evidencia, 532, 'rappi', k);
    if (!r.length) continue;
    const man = c.rappiManual.find((m) => m.tamano === t.tamano);
    const local = man ? Math.round(Number(man.precio) * 100) : null;
    if (local === r[0].precioCent) { preciosIguales++; continue; }
    add({ pk_local: c.id, entidad: 'precio_canal_manual', campo: `precio Rappi (${t.tamano}↔${k})`, valor_actual: local === null ? '(sin manual; usa fórmula)' : `$${pesos(local)}`,
      valor_observado: `532 Rappi: ${txt(r)}`, codigo_contexto: `${codigos(a)} · Rappi · sin descuento de línea ni pedido`, fuente: 'API pedidos RAPPI',
      clase: local === null ? 'dato faltante' : 'precio/contexto', estado: 'candidata', confianza: r[0].lineas >= 5 ? 'media' : 'baja (pocas líneas sin descuento)',
      impacto: 'Margen Rappi', decision_pendiente: 'Confirmar precio Rappi vigente (cambia por fecha en combos)' });
  }
}
for (const n of nombresApiSinLocal) {
  const sim = productosLocales.filter((c) => c.coincidencia === 'sin-coincidencia' && parecidos(n.nombre, c.nombre)).map((c) => [c, lev(canon(n.nombre), canon(c.nombre))] as const).sort((x, y) => y[1] - x[1]);
  add({ entidad: 'producto API', campo: 'identidad', valor_observado: n.nombre, valor_propuesto: '', codigo_contexto: Object.entries(n.codigos).map(([k, v]) => `${k}(${v})`).join(' '),
    valor_actual: sim.length ? sim.map(([c]) => `${c.nombre} [${c.id}]`).join(' | ') : '(sin receta local)', fuente: `API pedidos · ${n.lineas} líneas`,
    clase: n.nombre === 'Generic' ? 'genérico del proveedor' : sim.length ? 'alias/renombre' : 'sin equivalencia local', estado: n.nombre === 'Generic' ? 'sin equivalencia' : sim.length ? 'ambigua' : 'sin equivalencia',
    confianza: sim.length ? 'baja (similitud)' : 'n/a', impacto: n.nombre === 'Generic' ? 'Ver 05-GENERIC.md' : 'Producto vendido sin costeo',
    decision_pendiente: n.nombre === 'Generic' ? 'Pedir identificación al proveedor' : sim.length ? 'Confirmar correspondencia' : 'Decidir si se costea' });
}
// Duplicados probables dentro de Costeo
const prods = inv.productos.filter((p: { tipo: string }) => p.tipo === 'producto') as { id: string; nombre: string }[];
for (let i = 0; i < prods.length; i++) for (let j = i + 1; j < prods.length; j++) {
  const a = prods[i], b = prods[j];
  const [x, y] = [canon(a.nombre), canon(b.nombre)];
  const digitos = (s: string) => s.replace(/\D/g, '');
  const sabores = /\b(matcha|mocha|chai|coffee|chocolate|horchai)\b/g;
  const otroSabor = (x.match(sabores) ?? []).join() !== (y.match(sabores) ?? []).join();
  if (x === y || (lev(x, y) >= 0.85 && !/\+/.test(x + y) && digitos(x) === digitos(y) && !otroSabor))
    add({ pk_local: `${a.id} | ${b.id}`, entidad: 'recetas', campo: 'duplicado probable', valor_actual: `${a.nombre} | ${b.nombre}`, fuente: 'Costeo (comparación interna)',
      ventana: 'n/a', cobertura: 'Costeo completo (154 productos)', clase: 'duplicado', estado: 'ambigua', confianza: 'media', impacto: 'Doble receta/costo para un mismo artículo',
      decision_pendiente: 'Confirmar si son el mismo producto; nunca borrar/recrear (CASCADE)' });
}
// Anomalía de caracteres
for (const p of inv.productos.filter((x: { caracteres_raros: boolean }) => x.caracteres_raros))
  add({ pk_local: p.id, entidad: 'recetas', campo: 'nombre (caracteres)', valor_actual: p.nombre, valor_observado: 'U+2019 (apóstrofo tipográfico)', fuente: 'Costeo',
    ventana: 'n/a', cobertura: 'Costeo completo', clase: 'codificación', estado: 'candidata', confianza: 'alta', impacto: 'Búsqueda por apóstrofo recto no lo encuentra',
    decision_pendiente: 'Confirmar forma oficial (no observado en pedidos de la ventana)' });
// Recetario y tamaños
add({ entidad: 'tamanos', campo: 'Grande caliente (ml)', valor_actual: 'Grande (sin ml en Costeo)', valor_observado: 'API «Large - 355ml» · Recetario «Grande (360 ml)» pp.18–35',
  fuente: 'API customs + Recetario', clase: 'tamaño/unidad', estado: 'ambigua', confianza: 'alta (ambas fuentes leídas)', impacto: 'Solo etiqueta; Costeo usa vaso 12 oz',
  decision_pendiente: 'Confirmar volumen oficial del vaso grande caliente (355 vs 360 ml)' });
add({ entidad: 'tamanos', campo: 'Chica ↔ Regular / Grande ↔ Large', valor_actual: 'Chica/Grande/Único', valor_observado: 'Regular - 240/440ml · Large - 355/600ml (custom, extra típico $10)',
  fuente: 'API customs + precios 532', clase: 'tamaño/unidad', estado: 'candidata', confianza: 'alta por producto donde el precio Chica=Regular y Grande=Large en 532',
  impacto: 'Base de toda correspondencia de precios por tamaño', decision_pendiente: 'Aprobar el mapeo por producto (no global)' });
add({ entidad: 'recetas', campo: 'Gelato Frappé: tamaños', valor_actual: 'Único (6 productos)', valor_observado: 'API: sin tamaño y a veces Regular/Large · Recetario pp.46–48 Regular 440 / Grande 600',
  fuente: 'API + Recetario', clase: 'tamaño/unidad', estado: 'ambigua', confianza: 'media', impacto: 'Costo y precio por tamaño de gelato frappés', decision_pendiente: 'Confirmar si el gelato frappé se vende en dos tamaños' });
add({ pk_local: '', entidad: 'linea_cantidades', campo: 'Chai Latte: dosis de chai', valor_actual: 'CHAI 4 g / 5 g + AGUA 42 / 50 ml', valor_observado: 'Recetario p.26: 36 / 45 ml de preparado (50 g en 400 ml) + 10 ml agua',
  fuente: 'Recetario', ventana: 'n/a', cobertura: 'Muestra de 6 recetas', clase: 'unidad/cantidad', estado: 'candidata', confianza: 'media (requiere conversión preparado→gramos)',
  impacto: 'Costo de Chai Latte', decision_pendiente: 'Confirmar conversión; el resto de la muestra coincide' });
add({ entidad: 'insumos / subrecetas / rendimientos', campo: 'costo', valor_actual: 'Costeo (164 insumos, 6 subrecetas)', valor_observado: '(la API no expone costos)', fuente: 'API + Recetario',
  ventana: 'n/a', cobertura: 'n/a', clase: 'sin fuente equivalente', estado: 'sin equivalencia', confianza: 'alta', impacto: 'Ninguno: se conservan los costos locales',
  decision_pendiente: 'Ninguna (no derivar costo de netAmout ni de importes)' });

const cols = Object.keys(filas[0]);
const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
await writeFile(csvP, '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc(f[c] ?? '')).join(','))].join('\n'));
const porClase: Record<string, number> = {}, porEstado: Record<string, number> = {};
for (const f of filas) { porClase[f.clase] = (porClase[f.clase] ?? 0) + 1; porEstado[f.estado] = (porEstado[f.estado] ?? 0) + 1; }
await writeFile(resP, JSON.stringify({ filas: filas.length, porClase, porEstado, sinDiscNombre, preciosIguales }, null, 1));
console.log(JSON.stringify({ filas: filas.length, porClase, porEstado, sinDiscNombre, preciosIguales }));
