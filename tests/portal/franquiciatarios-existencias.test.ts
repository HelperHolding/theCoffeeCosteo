import { describe, expect, it } from 'vitest';
import {
  armarExistencias,
  desdeConsumo,
  entradasDePedido,
  factorConteo,
} from '../../lib/franquiciatarios/existencias';
import type { FranqConteo, FranqEntrada, FranqInsumo, FranqMerma } from '../../lib/franquiciatarios/tipos';

const insumo = (id: number, insumo_id: string | null, unidad = 'paquete de 1000 ml'): FranqInsumo => ({
  id,
  company_id: 514,
  insumo_id,
  nombre: `Insumo ${id}`,
  unidad,
  orden: id,
  activo: true,
  origen: 'sugerido',
  creado_por: 'u',
  creado_en: '2026-11-01T00:00:00Z',
  actualizado_por: null,
  actualizado_en: null,
});
let n = 1;
const conteo = (
  insumo_id: number,
  dia: string,
  hora: string,
  cantidad: number,
  momento: 'apertura' | 'medio' = 'apertura',
): FranqConteo => ({
  id: n++,
  company_id: 514,
  dia,
  momento,
  insumo_id,
  cantidad,
  barista_id: null,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: `${dia}T${hora}:00Z`,
  sesion: null,
  dispositivo: null,
  corrige_id: null,
});
const entrada = (
  insumo_id: number,
  en: string,
  cantidad: number,
  extra: Partial<FranqEntrada> = {},
): FranqEntrada => ({
  id: n++,
  company_id: 514,
  dia: en.slice(0, 10),
  insumo_id,
  cantidad,
  origen: 'proveedor',
  recepcion_id: null,
  sku: null,
  proveedor: 'Lala',
  nota: null,
  anulada: false,
  corrige_id: null,
  motivo_correccion: null,
  barista_id: null,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: en,
  ...extra,
});
const merma = (insumo_id: number, en: string, cantidad: number): FranqMerma => ({
  id: n++,
  company_id: 514,
  dia: en.slice(0, 10),
  insumo_id,
  cantidad,
  motivo: 'caducidad',
  nota: null,
  anulada: false,
  corrige_id: null,
  motivo_correccion: null,
  barista_id: null,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: en,
});

describe('existencias', () => {
  it('factor de conteo: paquete con presentación > 1, si no la unidad base', () => {
    expect(factorConteo('paquete de 1000 ml', 1000)).toBe(1000);
    expect(factorConteo('ml', 1000)).toBe(1);
    expect(factorConteo('pza', 1)).toBe(1);
  });

  it('un pedido recibido se convierte a la unidad de conteo; lo que no se sigue se dice aparte', () => {
    const r = entradasDePedido({
      lineas: [
        { nombre: 'Café White 1.5 kg', sku: 'INS-CAF-003', recibido: 7 },
        { nombre: 'Tote bag', sku: 'MER-TOT-001', recibido: 1 },
        { nombre: 'Leche (no llegó)', sku: 'INS-LEC-001', recibido: 0 },
      ],
      equivalencias: [
        { sku: 'INS-CAF-003', insumoId: 'cafe', factor: 1500 },
        { sku: 'INS-LEC-001', insumoId: 'leche', factor: 1000 },
      ],
      insumos: [insumo(1, 'cafe', 'paquete de 1500 gr'), insumo(2, 'leche')],
      presentaciones: new Map([
        ['cafe', 1500],
        ['leche', 1000],
      ]),
    });
    expect(r.entradas).toEqual([{ insumo: 1, cantidad: 7, sku: 'INS-CAF-003' }]);
    expect(r.sinSeguir).toEqual(['Tote bag']);
  });

  it('esperado = conteo de apertura + entradas − consumo − mermas, y concilia contra el conteo anterior', () => {
    const leche = insumo(1, 'leche');
    const filas = armarExistencias({
      insumos: [leche],
      conteos: [
        conteo(1, '2026-11-23', '13:00', 10),
        conteo(1, '2026-11-23', '19:00', 99, 'medio'), // el de medio turno no es base
        conteo(1, '2026-11-24', '13:00', 7),
      ],
      entradas: [
        entrada(1, '2026-11-23T15:00:00Z', 4), // entre los dos conteos
        entrada(1, '2026-11-24T14:00:00Z', 6), // después del último
        entrada(1, '2026-11-24T12:00:00Z', 50, { anulada: true, corrige_id: 1 }), // anulada: no cuenta
      ],
      mermas: [merma(1, '2026-11-23T16:00:00Z', 1), merma(1, '2026-11-24T16:00:00Z', 0.5)],
      consumo: new Map([
        ['2026-11-23', new Map([['leche', 5000]])],
        ['2026-11-24', new Map([['leche', 2000]])],
      ]),
      presentaciones: new Map([['leche', 1000]]),
      hoy: '2026-11-24',
    });
    // Conciliación del 24: 10 + 4 − 1 − 5 (consumo del 23) = 8 esperado; se contaron 7 → falta 1.
    expect(filas[0].conciliacion).toEqual({ dia: '2026-11-24', esperado: 8, contado: 7, diferencia: -1 });
    // Hoy: 7 + 6 − 2 − 0.5 = 10.5
    expect(filas[0]).toMatchObject({ entradas: 6, consumo: 2, mermas: 0.5, esperado: 10.5 });
  });

  it('sin conteo de apertura no hay base; sin receta no hay esperado', () => {
    const filas = armarExistencias({
      insumos: [insumo(1, 'leche'), insumo(2, null, 'pza')],
      conteos: [conteo(2, '2026-11-24', '13:00', 5)],
      entradas: [],
      mermas: [],
      consumo: new Map(),
      presentaciones: new Map(),
      hoy: '2026-11-24',
    });
    expect(filas[0].base).toBeNull();
    expect(filas[1]).toMatchObject({ consumo: null, esperado: null });
    expect(filas[1].base?.cantidad).toBe(5);
  });

  it('la ventana de ventas empieza en el conteo de apertura anterior, acotada a 14 días', () => {
    const c = [
      conteo(1, '2026-11-20', '13:00', 1),
      conteo(1, '2026-11-24', '13:00', 1),
      conteo(2, '2026-11-01', '13:00', 1),
    ];
    expect(desdeConsumo(c, '2026-11-24')).toBe('2026-11-11');
    expect(desdeConsumo(c.slice(0, 2), '2026-11-24')).toBe('2026-11-20');
  });
});
