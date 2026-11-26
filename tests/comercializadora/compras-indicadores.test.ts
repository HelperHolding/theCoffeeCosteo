// tests/comercializadora/compras-indicadores.test.ts
import { describe, expect, it } from 'vitest';
import { tarjetasIndicadores } from '@/lib/comercializadora/compras/indicadores';
import { armarTablero } from '../../supabase/functions/_shared/compras/tablero.ts';

const t = armarTablero({
  ocs: [{ zoho_po_id: 'P1', folio: 'COM-OC-1', proveedor: 'Prov A', comprador: 'CC', emision: '2026-11-17', arribo: '2026-11-19', estado: 'open', received_status: 'received', monto_ins: 1000, por_categoria: { CAF: 1000 }, es_registro: false }],
  recepciones: [{ zoho_po_id: 'P1', fecha: '2026-11-19', monto: 2000, por_categoria: { CAF: 2000 } }],
  ventas: [{ semana: '2026-11-16', venta_total_ci: 4000, por_categoria_ci: { CAF: 4000 } }],
  lineas: [],
}, { periodo: '2026-11-16', categoria: null, proveedor: null, comprador: null }, '2026-11-26');

describe('textos de los indicadores', () => {
  it('nueve tarjetas en orden, con el periodo anterior y el semáforo como tono', () => {
    const xs = tarjetasIndicadores(t, 1234.5);
    expect(xs.map((x) => x.clave)).toEqual(['venta', 'compras', 'ratio', 'llegaron', 'entregas', 'lead', 'mayor', 'vencidas', 'faltan']);
    const por = Object.fromEntries(xs.map((x) => [x.clave, x]));
    expect(por.venta.valor).toBe('$4,000.00');
    expect(por.venta.nota).toBe('Anterior (9 nov – 15 nov 2026): $0.00');
    expect([por.ratio.valor, por.ratio.tono]).toEqual(['50%', 'ok']);
    expect(por.llegaron.nota).toContain('1 elaboradas en el periodo · 0 antes');
    expect(por.entregas.valor).toBe('100%');
    expect(por.lead.valor).toBe('2 días');
    expect([por.mayor.valor, por.mayor.nota]).toEqual(['$2,000.00', 'Prov A']);
    expect(por.faltan.valor).toBe('$1,234.50');
  });
  it('sin plan: «—» y la nota del error; sin compras: mayor compra vacía', () => {
    const xs = tarjetasIndicadores({ ...t, k: { ...t.k, mayor: null } }, null);
    const por = Object.fromEntries(xs.map((x) => [x.clave, x]));
    expect([por.faltan.valor, por.faltan.nota]).toEqual(['—', 'No se pudo calcular el plan']);
    expect([por.mayor.valor, por.mayor.nota]).toEqual(['—', 'Sin compras recibidas']);
  });
});
