// tests/comercializadora/exportar-compras.test.ts
import { describe, expect, it } from 'vitest';
import { archivoCompras, htmlTableroCompras } from '@/lib/comercializadora/exportar/reporteCompras';
import type { PlanCompra } from '@/lib/comercializadora/compras/plan';
import { armarTablero, type DatosCompras } from '../../supabase/functions/_shared/compras/tablero.ts';

const oc = (i: number) => ({
  zoho_po_id: `P${i}`, folio: `COM-OC-${i}`, proveedor: i === 0 ? 'Prov <A> & "B"' : `Prov ${i}`, comprador: 'CC', emision: '2026-11-17',
  arribo: '2026-11-20', estado: 'open', received_status: '', monto_ins: 100, por_categoria: { CAF: 100 }, es_registro: false,
});
const datos = (): DatosCompras => ({
  ocs: Array.from({ length: 60 }, (_, i) => oc(i)),
  recepciones: [],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [{ zoho_po_id: 'P0', sku: 'INS-CAF-001', nombre: 'Café <grano>', pendiente: 5 }],
});
const t = armarTablero(datos(), { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');
const plan: PlanCompra = {
  filas: Array.from({ length: 100 }, (_, i) => ({ urgencia: 'Normal' as const, sku: `INS-CAF-${i}`, nombre: `Art ${i}`, proveedor: 'Prov 1', categoria: 'CAF' as const, decision: 'PEDIR', inventario: 1, faltaSurtir: 0, dias: 12, pedir: [1, 0] as [number, number], costo: [10, 0] as [number, number], llega: null, llegaVencida: false })),
  urgentes: { n: 0, monto: 0 }, pronto: { n: 0, monto: 0 }, faltan: 1000,
};
const opts = { plan, errorPlan: null, leidoEn: '2026-11-26T18:00:00Z', ultimaSync: '2026-11-26T17:52:00Z' };

describe('descarga del tablero de compras', () => {
  it('documento completo sin scripts, con filtros y hora en el encabezado y las 5 secciones', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h.startsWith('<!doctype html>')).toBe(true);
    expect(h).not.toMatch(/<script|<link|https?:\/\/(?!www\.w3\.org)/);
    expect(h).toContain('Filtros: 16 nov – 22 nov 2026 · Todas las categorías');
    expect(h).toContain('Leído de Supabase el 26 nov 2026');
    for (const s of ['Indicadores', 'Evolución', 'Plan de compra', 'OCs por proveedor del periodo', 'OCs por llegar']) expect(h).toContain(s);
    expect(h).toContain('<svg');
    expect(h).toContain('class="sec"><h2><span class="num">03</span>');
    expect(h).toMatch(/class="salto"/);
  });
  it('listas completas: 60 OCs por llegar y 100 artículos del plan', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h).toContain('COM-OC-59');
    expect(h).toContain('INS-CAF-99');
  });
  it('escapa el texto que viene de Zoho', () => {
    const h = htmlTableroCompras(t, opts);
    expect(h).toContain('Prov &lt;A&gt; &amp; &quot;B&quot;');
    expect(h).toContain('Café &lt;grano&gt;');
    expect(h).not.toContain('Prov <A>');
  });
  it('sincronización de más de 36 h: el archivo lo avisa, como la pantalla', () => {
    expect(htmlTableroCompras(t, { ...opts, syncVieja: true })).toContain('La última sincronización buena tiene más de 36 horas');
    expect(htmlTableroCompras(t, opts)).not.toContain('más de 36 horas');
  });
  it('si el plan falla, sale el error y el resto del archivo', () => {
    const h = htmlTableroCompras(t, { ...opts, plan: null, errorPlan: 'Motor sin datos' });
    expect(h).toContain('No se pudo calcular el plan de compra: Motor sin datos');
    expect(h).toContain('OCs por llegar');
  });
  it('solo símbolos que tiene Open Sans (la fuente de Chromium en Vercel)', () => {
    expect(htmlTableroCompras(t, opts)).not.toMatch(/[▲▼≥≤→]/);
  });
  it('nombre del archivo: periodo, categoría (o todas), proveedor y comprador, sin acentos', () => {
    expect(archivoCompras(t, 'pdf')).toBe('compras-2026-11-16-todas.pdf');
    const f = armarTablero(datos(), { periodo: '2026-11', categoria: 'CAF', proveedor: 'JOSÉ & HIJOS', comprador: 'Compras Comercializadora' }, '2026-11-26');
    expect(archivoCompras(f, 'html')).toBe('compras-2026-11-caf-jose-hijos-compras-comercializadora.html');
  });
});
