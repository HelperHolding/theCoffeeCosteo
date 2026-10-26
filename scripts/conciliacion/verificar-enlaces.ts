import { readdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/**
 * SKU · Verificación de cada candidato código POS → receta de Costeo (local, sin red, nada se escribe en la base):
 *  - código: un solo nombre observado; no es GENERIC ni vacío;
 *  - nombre: exacto (lote 1) o solo mayúsculas/espacios (pendiente de B2);
 *  - contexto: sucursales y canales donde aparece; precio de 532 Mostrador frente a precio_lista (evidencia, no bloquea);
 *  - variante: otra receta de Costeo con el mismo nombre canónico o el mismo nombre más «Large/Grande» → ambiguo;
 *  - tamaño: vasos observados fuera de Rappi (Regular/Large) frente a tamaños de la receta (Chica+Grande / Único).
 *   npx tsx scripts/conciliacion/verificar-enlaces.ts <inventario.json> <salida.csv>
 */
const [invP, salida] = process.argv.slice(2);
if (!invP || !salida) throw new Error('Uso: verificar-enlaces.ts <inventario.json> <salida.csv>');
type Item = { defaultCode?: string | null; productName: string; amount: number; discount: number; itemsCustom?: Item[] };
type Pedido = { companyId: number; paymentMethod?: string; fromSmartphone?: boolean | null; discount: number; items: Item[] };
const DIR = join(tmpdir(), 'thecoffee-sucursales-api', 'fase2');
const VASO = /^(Regular|Large) - \d{3}ml$/;
const origen = (p: Pedido) =>
  p.paymentMethod === 'RAPPI' ? 'rappi' : p.fromSmartphone === true ? 'app' : p.fromSmartphone === false ? 'mostrador' : '?';

const pedidos: Pedido[] = [];
for (const f of (await readdir(DIR)).filter((x) => /^\d+_\d{4}-\d{2}-\d{2}_/.test(x)))
  pedidos.push(...(JSON.parse(await readFile(join(DIR, f), 'utf8')) as Pedido[]));

interface Obs { nombres: Map<string, number>; contexto: Set<string>; vasos: Map<string, number>; lineasSinRappi: number; sinVasoSinRappi: number; precios532: Map<string, number> }
const obs = new Map<string, Obs>();
for (const p of pedidos)
  for (const i of p.items) {
    if (!i.defaultCode || i.defaultCode === 'GENERIC') continue;
    const o = obs.get(i.defaultCode) ?? { nombres: new Map(), contexto: new Set(), vasos: new Map(), lineasSinRappi: 0, sinVasoSinRappi: 0, precios532: new Map() };
    o.nombres.set(i.productName, (o.nombres.get(i.productName) ?? 0) + 1);
    o.contexto.add(`${p.companyId}·${origen(p)}`);
    const vaso = (i.itemsCustom ?? []).find((c) => VASO.test(c.productName));
    if (origen(p) !== 'rappi') {
      o.lineasSinRappi++;
      if (vaso) o.vasos.set(vaso.productName.split(' - ')[0], (o.vasos.get(vaso.productName.split(' - ')[0]) ?? 0) + 1);
      else o.sinVasoSinRappi++;
    }
    // Precio sin descuento en 532 Mostrador, por vaso (base + extra del vaso).
    if (p.companyId === 532 && origen(p) === 'mostrador' && i.discount === 0 && p.discount === 0) {
      const k = `${vaso ? vaso.productName.split(' - ')[0] : 'Único'}=${i.amount + (vaso?.amount ?? 0)}`;
      o.precios532.set(k, (o.precios532.get(k) ?? 0) + 1);
    }
    obs.set(i.defaultCode, o);
  }

const inv = JSON.parse(await readFile(invP, 'utf8')) as {
  productos: { id: string; nombre: string; tipo: string; activo: boolean }[];
  tamanosProducto: { producto_id: string; tamano: string; precio_lista: string | null }[];
};
const norm = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').replace(/[’']/g, "'").replace(/\s+/g, ' ').trim().toLowerCase();
const canon = (s: string) => norm(s).replace(/\bchocolat\b/, 'chocolate').replace(/\btradicional\b/, 'traditional');
const recetas = inv.productos.filter((r) => r.tipo === 'producto');
const tamanosDe = (id: string) => inv.tamanosProducto.filter((t) => t.producto_id === id);
const moda = (m: Map<string, number>, prefijo: string) =>
  [...m].filter(([k]) => k.startsWith(prefijo + '=')).sort((a, b) => b[1] - a[1])[0]?.[0].split('=')[1];

const filas = [...obs].map(([codigo, o]) => {
  const nombres = [...o.nombres].sort((a, b) => b[1] - a[1]);
  const nombre = nombres[0][0];
  const lineas = nombres.reduce((s, [, n]) => s + n, 0);
  const motivos: string[] = [];
  if (nombres.length > 1) motivos.push(`código con ${nombres.length} nombres`);
  const exactas = recetas.filter((r) => r.nombre === nombre);
  const parecidas = exactas.length ? [] : recetas.filter((r) => norm(r.nombre) === norm(nombre));
  const receta = exactas.length === 1 ? exactas[0] : parecidas.length === 1 ? parecidas[0] : null;
  let nombreCheck = 'exacto';
  if (!exactas.length && parecidas.length === 1) { nombreCheck = 'solo mayúsculas/espacios'; motivos.push('forma del nombre (B2)'); }
  if (!receta) { nombreCheck = exactas.length + parecidas.length > 1 ? 'varias recetas' : 'sin receta'; motivos.push(nombreCheck === 'sin receta' ? 'sin receta local (B3/B6)' : 'varias recetas con ese nombre'); }
  // Variantes: otras recetas con el mismo nombre canónico, o el mismo nombre + tamaño en el nombre.
  const variantes = receta
    ? recetas.filter((r) => r.id !== receta.id && (canon(r.nombre) === canon(receta.nombre) || new RegExp(`^${canon(receta.nombre).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} (large|grande|chica|regular)$`).test(canon(r.nombre))))
    : [];
  if (variantes.length) motivos.push(`variante en Costeo: ${variantes.map((v) => v.nombre).join(' | ')}`);
  // Tamaños: estructura observada fuera de Rappi frente a la receta.
  const t = receta ? tamanosDe(receta.id).map((x) => x.tamano).sort() : [];
  const local = t.length === 0 ? 'sin tamaños' : t.includes('Único') && t.length === 1 ? 'Único' : t.join('+');
  const conVaso = o.lineasSinRappi > 0 && o.sinVasoSinRappi / o.lineasSinRappi < 0.1;
  const sinVaso = o.lineasSinRappi > 0 && o.sinVasoSinRappi / o.lineasSinRappi > 0.9;
  const api = o.lineasSinRappi === 0 ? 'solo Rappi' : conVaso ? [...o.vasos.keys()].sort().join('+') : sinVaso ? 'sin vaso' : `mixto (${o.sinVasoSinRappi}/${o.lineasSinRappi} sin vaso)`;
  let tamanoCheck = 'coherente';
  if (receta) {
    if (o.lineasSinRappi === 0) { tamanoCheck = 'sin evidencia fuera de Rappi'; motivos.push('tamaño sin evidencia fuera de Rappi'); }
    else if (conVaso && local !== 'Chica+Grande') { tamanoCheck = 'API con vasos, receta ' + local; motivos.push(tamanoCheck); }
    else if (sinVaso && local !== 'Único') { tamanoCheck = 'API sin vaso, receta ' + local; motivos.push(tamanoCheck); }
    else if (!conVaso && !sinVaso) { tamanoCheck = 'API ' + api; motivos.push('tamaño mixto en la API'); }
  }
  // Precio de 532 Mostrador frente a precio_lista: solo evidencia de contexto.
  let precio = 'sin ventas sin descuento en 532';
  if (receta) {
    const comp = tamanosDe(receta.id).map((x) => {
      const clave = x.tamano === 'Chica' ? 'Regular' : x.tamano === 'Grande' ? 'Large' : 'Único';
      const p532 = moda(o.precios532, clave);
      return p532 === undefined ? null : `${x.tamano} ${x.precio_lista ?? '∅'}${Number(p532) === Number(x.precio_lista) ? '=' : '≠'}${p532}`;
    }).filter(Boolean);
    if (comp.length) precio = comp.join(' · ');
  }
  const estado = motivos.length === 0 ? 'lote 1 (verificado)' : 'pendiente';
  return { codigo, nombre, lineas, contexto: [...o.contexto].sort().join(' '), receta_id: receta?.id ?? '', receta_nombre: receta?.nombre ?? '',
    nombre_check: nombreCheck, variante_check: variantes.length ? 'ambiguo' : 'sin variante', tamano_api: api, tamano_receta: local,
    tamano_check: tamanoCheck, precio_532: precio, estado, motivos: motivos.join('; ') };
}).sort((a, b) => a.estado.localeCompare(b.estado) || b.lineas - a.lineas);

const cols = Object.keys(filas[0]);
const esc = (v: unknown) => (/[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v));
await writeFile(salida, '﻿' + [cols.join(','), ...filas.map((f) => cols.map((c) => esc((f as Record<string, unknown>)[c])).join(','))].join('\n') + '\n');
const resumen: Record<string, number> = {};
for (const f of filas) resumen[f.estado] = (resumen[f.estado] ?? 0) + 1;
console.log(JSON.stringify({ codigos: filas.length, resumen, lineasLote1: filas.filter((f) => f.estado.startsWith('lote')).reduce((s, f) => s + f.lineas, 0) }));
for (const f of filas.filter((x) => x.estado === 'pendiente')) console.log(`${f.codigo} ${f.nombre} → ${f.receta_nombre || '—'} | ${f.motivos}`);
