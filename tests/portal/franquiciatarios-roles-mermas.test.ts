import { describe, expect, it } from 'vitest';
import { armarSemana, horaCorta, lunesDe, vigentesAsignacion } from '@/lib/franquiciatarios/roles';
import { compararMermas, toleranciasVigentes, vigentesMerma } from '@/lib/franquiciatarios/mermas';
import type { FranqAsignacion, FranqMerma, FranqPosicion, FranqTurno } from '@/lib/franquiciatarios/tipos';

const t = (id: number, nombre: string, entrada: string, orden: number, activo = true): FranqTurno => ({
  id,
  company_id: 514,
  nombre,
  entrada,
  salida: '15:00:00',
  orden,
  activo,
});
const p = (id: number, nombre: string, orden: number, activo = true): FranqPosicion => ({
  id,
  company_id: 514,
  nombre,
  orden,
  activo,
});
let sec = 0;
const a = (
  dia: string,
  turno: number,
  posicion: number,
  barista: number,
  o: Partial<FranqAsignacion> = {},
) => ({
  id: ++sec,
  company_id: 514,
  dia,
  turno_id: turno,
  posicion_id: posicion,
  barista_id: barista,
  anulada: false,
  corrige_id: null,
  registrado_por: 'u',
  registrado_en: '',
  ...o,
});

describe('matriz de roles', () => {
  it('lunes de la semana y hora corta', () => {
    expect(lunesDe('2026-11-20')).toBe('2026-11-16'); // viernes
    expect(lunesDe('2026-11-16')).toBe('2026-11-16');
    expect(lunesDe('2026-11-22')).toBe('2026-11-16'); // domingo
    expect(horaCorta('07:00:00')).toBe('7:00');
    expect(horaCorta('15:30:00')).toBe('15:30');
  });

  it('vigentes: una anulación quita a la asignación que corrige', () => {
    const x = a('2026-11-16', 1, 1, 7);
    const quita = a('2026-11-16', 1, 1, 7, { anulada: true, corrige_id: x.id });
    expect(vigentesAsignacion([x, quita])).toEqual([]);
  });

  it('arma 7 días con turnos y posiciones activos (y los inactivos que aún tienen gente)', () => {
    const asignaciones = [
      a('2026-11-16', 1, 10, 7),
      a('2026-11-16', 1, 10, 8),
      a('2026-11-17', 2, 11, 7),
      a('2026-11-18', 1, 12, 9), // posición inactiva con gente: se muestra
    ];
    const s = armarSemana(
      '2026-11-16',
      [
        t(2, 'Vespertino', '15:00:00', 2),
        t(1, 'Matutino', '07:00:00', 1),
        t(3, 'Viejo', '06:00:00', 0, false),
      ],
      [
        p(10, 'Caja', 1),
        p(11, 'Barra fría', 2),
        p(12, 'Retirada', 3, false),
        p(13, 'Otra retirada', 4, false),
      ],
      asignaciones,
      [
        { id: 7, nombre: 'Ana' },
        { id: 8, nombre: 'Beto' },
      ],
    );
    expect(s.turnos.map((x) => x.nombre)).toEqual(['Matutino', 'Vespertino']);
    expect(s.posiciones.map((x) => x.nombre)).toEqual(['Caja', 'Barra fría', 'Retirada']);
    expect(s.dias).toHaveLength(7);
    expect(s.dias[0]).toMatchObject({ dia: '2026-11-16', asignados: 2 });
    const caja = s.dias[0].celdas.find((c) => c.turnoId === 1 && c.posicionId === 10)!;
    expect(caja.baristas.map((b) => b.nombre)).toEqual(['Ana', 'Beto']);
    expect(s.dias[2].celdas.find((c) => c.posicionId === 12 && c.turnoId === 1)!.baristas).toEqual([
      { id: 9, nombre: 'Barista' },
    ]);
  });
});

const m = (id: number, insumo: number, cantidad: number, o: Partial<FranqMerma> = {}): FranqMerma => ({
  id,
  company_id: 514,
  dia: '2026-11-20',
  insumo_id: insumo,
  cantidad,
  motivo: 'caducidad',
  nota: null,
  anulada: false,
  corrige_id: null,
  motivo_correccion: null,
  barista_id: null,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: '',
  ...o,
});
const insumos = [
  { id: 1, insumo_id: 'leche', nombre: 'Leche entera', unidad: 'paquete de 1000 ml', activo: true, orden: 1 },
  { id: 2, insumo_id: 'cafe', nombre: 'Café', unidad: 'gr', activo: true, orden: 2 },
  { id: 3, insumo_id: null, nombre: 'Trapos', unidad: 'pieza', activo: true, orden: 3 },
  { id: 4, insumo_id: 'pan', nombre: 'Pan', unidad: 'pza', activo: false, orden: 4 },
];

describe('mermas contra la tolerancia', () => {
  it('vigentes y tolerancias: corrección y anulación; el último registro de tolerancia manda', () => {
    const v = vigentesMerma([
      m(1, 1, 2),
      m(2, 1, 1, { corrige_id: 1 }),
      m(3, 2, 5),
      m(4, 2, 5, { anulada: true, corrige_id: 3 }),
    ]);
    expect(v.map((x) => x.id)).toEqual([2]);
    const tol = toleranciasVigentes([
      { id: 1, company_id: 514, insumo_id: 1, pct: 5, registrado_por: 'u', registrado_en: '' },
      { id: 2, company_id: 514, insumo_id: 1, pct: 4.5, registrado_por: 'u', registrado_en: '' },
    ]);
    expect(tol.get(1)).toBe(4.5);
  });

  it('convierte el teórico a la unidad de conteo con la presentación; marca fuera de tolerancia y valúa', () => {
    const filas = compararMermas({
      insumos,
      mermas: [m(1, 1, 0.5), m(2, 2, 10), m(3, 3, 2)],
      tolerancias: new Map([[2, 5]]),
      // 12 litros de leche (en ml) y 1,000 g de café vendidos según recetas.
      consumo: new Map([
        ['leche', 12000],
        ['cafe', 1000],
      ]),
      costeo: new Map([
        ['leche', { presentacion: 1000, costoUnitario: 0.03 }],
        ['cafe', { presentacion: 1500, costoUnitario: 0.4 }],
      ]),
    });
    const [leche, cafe, trapos] = filas;
    expect(filas).toHaveLength(3); // el inactivo sin merma no aparece
    // Leche: 0.5 paquetes de 12 = 4.17 % > 3 % (tolerancia por defecto) → fuera. Valor = 0.5 × 1000 ml × 0.03.
    expect(leche).toMatchObject({ merma: 0.5, teorico: 12, tolerancia: 3, fuera: true, valor: 15 });
    expect(leche.pct).toBeCloseTo(0.5 / 12, 6);
    // Café: la gerencia lo cuenta en gr (aunque en Costeo es paquete de 1500): sin conversión; 10 de 1,000 = 1 % ≤ 5 %.
    expect(cafe).toMatchObject({ teorico: 1000, pct: 0.01, tolerancia: 5, fuera: false, valor: 4 });
    // Alta manual: sin teórico ni valor, nunca «fuera».
    expect(trapos).toMatchObject({ merma: 2, teorico: null, pct: null, fuera: false, valor: null });
  });

  it('merma sin venta que la explique (teórico 0) cuenta como fuera; sin cálculo de consumo no se marca', () => {
    const base = { insumos: insumos.slice(0, 1), mermas: [m(1, 1, 1)], tolerancias: new Map() };
    const costeo = new Map([['leche', { presentacion: 1000, costoUnitario: null }]]);
    expect(compararMermas({ ...base, consumo: new Map(), costeo })[0]).toMatchObject({
      teorico: 0,
      pct: null,
      fuera: true,
      valor: null,
    });
    expect(compararMermas({ ...base, consumo: null, costeo })[0]).toMatchObject({
      teorico: null,
      fuera: false,
    });
  });

  it('dentro de tolerancia: no se marca', () => {
    const f = compararMermas({
      insumos: insumos.slice(0, 1),
      mermas: [m(1, 1, 0.3)],
      tolerancias: new Map(),
      consumo: new Map([['leche', 12000]]),
      costeo: new Map([['leche', { presentacion: 1000, costoUnitario: 0.03 }]]),
    })[0];
    expect(f.fuera).toBe(false); // 2.5 % ≤ 3 %
  });
});
