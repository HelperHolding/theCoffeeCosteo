import { describe, expect, it } from 'vitest';
import { armarHistorial } from '../../lib/franquiciatarios/conteos';
import type { FranqConteo, FranqInsumo } from '../../lib/franquiciatarios/tipos';

// F2: historial de conteos que ve la gerencia (vigentes, columnas por día y momento, insumos de baja).
const insumo = (id: number, nombre: string, orden: number, activo = true): FranqInsumo => ({
  id,
  company_id: 514,
  insumo_id: null,
  nombre,
  unidad: 'pza',
  orden,
  activo,
  origen: 'sugerido',
  creado_por: 'u',
  creado_en: '2026-11-20T10:00:00Z',
  actualizado_por: null,
  actualizado_en: null,
});
let id = 1;
const conteo = (
  insumo_id: number,
  dia: string,
  momento: 'apertura' | 'medio',
  cantidad: number,
  hora: string,
  corrige_id: number | null = null,
): FranqConteo => ({
  id: id++,
  company_id: 514,
  dia,
  momento,
  insumo_id,
  cantidad,
  barista_id: 1,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: `${dia}T${hora}:00Z`,
  sesion: null,
  dispositivo: null,
  corrige_id,
});

describe('armarHistorial', () => {
  it('columnas del más reciente al más antiguo; vale el recuento; los de baja solo si tienen conteos', () => {
    const a1 = conteo(1, '2026-11-19', 'apertura', 5, '14:00');
    const lista = [
      insumo(1, 'Café', 1),
      insumo(2, 'Leche', 2),
      insumo(3, 'Viejo', 3, false),
      insumo(4, 'Baja con dato', 4, false),
    ];
    const h = armarHistorial(lista, [
      a1,
      conteo(1, '2026-11-19', 'apertura', 4, '14:10', a1.id), // recuento
      conteo(2, '2026-11-19', 'apertura', 12, '14:00'),
      conteo(1, '2026-11-20', 'apertura', 3, '14:00'),
      conteo(1, '2026-11-20', 'medio', 1.5, '20:00'),
      conteo(4, '2026-11-19', 'apertura', 2, '14:00'),
    ]);
    expect(h.columnas.map((c) => `${c.dia} ${c.momento}`)).toEqual([
      '2026-11-20 medio',
      '2026-11-20 apertura',
      '2026-11-19 apertura',
    ]);
    expect(h.filas.map((f) => f.insumo.nombre)).toEqual(['Café', 'Leche', 'Baja con dato']);
    expect(h.filas[0].cantidades).toEqual([1.5, 3, 4]);
    expect(h.filas[1].cantidades).toEqual([null, null, 12]);
  });

  it('sin conteos: sin columnas y solo los activos', () => {
    const h = armarHistorial([insumo(1, 'Café', 1), insumo(2, 'Viejo', 2, false)], []);
    expect(h.columnas).toEqual([]);
    expect(h.filas.map((f) => f.insumo.nombre)).toEqual(['Café']);
  });
});
