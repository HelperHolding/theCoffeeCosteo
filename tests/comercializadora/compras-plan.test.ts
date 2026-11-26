// tests/comercializadora/compras-plan.test.ts
import { describe, expect, it } from 'vitest';
import { planCompra, urgenciaDe } from '@/lib/comercializadora/compras/plan';

const fila = (o: Record<string, unknown>) => ({ sku: 'INS-CAF-001', nombre: 'Café', costo: 10, sem: [0, 0], calc: { accion: 'PEDIR', invBase: 50, consumo: 10, diasHoy: 5, disponible: 50 }, llegaOC: null, ...o });
const grupo = (nombre: string, rows: unknown[]) => ({ key: nombre, pk: nombre, cat: 'local', fuente: '', nombre, real: true, rows, monto: [0, 0], n: [0, 0], uds: [0, 0], sinCosto: [0, 0], minimo: 0 });
const S = (provs: unknown[]) => ({ cat: { local: { provs }, cafe: { provs: [] }, imp: { provs: [] } } }) as never;

describe('plan de compra', () => {
  it('urgencia por días que alcanza: <5 urgente, 5–10 pronto', () => {
    expect([0, 4.9, 5, 9.9, 10, null].map(urgenciaDe)).toEqual(['Urgente', 'Urgente', 'Pronto', 'Pronto', 'Normal', 'Normal']);
  });
  it('filas a pedir esta o la próxima semana, con costos, inventario sin negativos y orden por urgencia', () => {
    const p = planCompra(S([
      grupo('JOSÉ Pérez', [
        fila({ sku: 'INS-CAF-001', nombre: 'B café', sem: [3, 0], calc: { accion: 'PEDIR', invBase: -4, consumo: 2, diasHoy: 0, disponible: -4 }, llegaOC: '2026-11-20' }),
        fila({ sku: 'INS-DES-001', nombre: 'A vaso', sem: [0, 2], calc: { accion: 'PRÓXIMA', invBase: 70, consumo: 10, diasHoy: 7, disponible: 70 } }),
        fila({ sku: 'INS-BEB-001', nombre: 'Nada', sem: [0, 0] }),
      ]),
    ]), { categoria: null, proveedor: null }, '2026-11-26');
    expect(p.filas.map((f) => [f.sku, f.urgencia, f.inventario, f.faltaSurtir, f.pedir, f.costo, f.llegaVencida])).toEqual([
      ['INS-CAF-001', 'Urgente', 0, 4, [3, 0], [30, 0], true],
      ['INS-DES-001', 'Pronto', 70, 0, [0, 2], [0, 20], false],
    ]);
    expect(p.urgentes).toEqual({ n: 1, monto: 30 });
    expect(p.pronto).toEqual({ n: 1, monto: 20 });
    expect(p.faltan).toBe(30);
  });
  it('filtra por categoría de SKU y por proveedor sin acentos ni mayúsculas', () => {
    const s = S([grupo('JOSÉ Pérez', [fila({ sku: 'INS-CAF-001', sem: [1, 0] }), fila({ sku: 'INS-DES-001', sem: [1, 0] })]), grupo('Otro', [fila({ sku: 'INS-CAF-002', sem: [1, 0] })])]);
    expect(planCompra(s, { categoria: 'CAF', proveedor: 'jose perez' }, '2026-11-26').filas.map((f) => f.sku)).toEqual(['INS-CAF-001']);
    expect(planCompra(s, { categoria: null, proveedor: 'No existe' }, '2026-11-26').filas).toEqual([]);
  });
});
