// tests/portal/consumo-mes.test.ts
import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { consumir, claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { consumoMesSucursal, elegirSucursales, leerMes, mesCerrado, rappiPorDias } from '../../lib/sucursales/consumo-mes';
import { normalizar, type PedidoNormal } from '../../lib/sucursales/normalizar';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import { pedido } from './sucursales-fixtures';

const cfg = configDe(612)!;
const IL = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8';
const datos: DatosConsumo = {
  leidoEn: '2026-11-05T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set(),
  recetas: new Map([
    [
      claveConsumo(IL, 'Chica'),
      [
        { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'LECHE', cantidad: 180 },
        { insumoId: 'cf', insumo: 'CAFÉ', unidad: 'gr', categoria: 'CAFÉ', cantidad: 18 },
      ],
    ],
  ]),
};
const linea = (code: string, name: string, customs: string[] = []) => ({
  defaultCode: code,
  productName: name,
  amount: 80,
  discount: 0,
  itemsCustom: customs.map((c) => ({ defaultCode: 'X', productName: c, amount: 0, discount: 0 })),
});
const pedidosDe = (fecha: string, origen: PedidoNormal['origen'], items: ReturnType<typeof linea>[]) =>
  normalizar([pedido(fecha, '10:00:00', { items, grossAmount: 80 * items.length })] as never[], cfg, {
    desde: fecha,
    hasta: fecha,
  }).pedidos.map((p) => ({ ...p, origen }));
const lectura = (pedidos: PedidoNormal[], estado: LecturaNormal['estado'] = 'completa'): LecturaNormal => ({
  desde: '2026-10-01',
  hasta: '2026-10-31',
  leidoEn: 0,
  estado,
  error: null,
  avisos: [],
  totalDeclarado: null,
  pedidos,
});

describe('consumo de un mes por sucursal', () => {
  const ps = [
    ...pedidosDe('2026-10-03', 'mostrador', [linea('5IL', 'Iced Latte', ['Regular - 440ml']), linea('GHC', 'Sandwich')]),
    ...pedidosDe('2026-10-10', 'app', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
    ...pedidosDe('2026-10-20', 'rappi', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
    ...pedidosDe('2026-10-21', 'desconocido', [linea('5IL', 'Iced Latte', ['Regular - 440ml'])]),
  ];
  const f = consumoMesSucursal({
    mes: '2026-10-01',
    companyId: 612,
    lectura: lectura(ps),
    datos,
    piloto: false,
  });

  it('la suma de los orígenes es igual a consumir con todos los pedidos', () => {
    const todos = consumir(ps, datos, ps, undefined, [], false);
    for (const i of todos.insumos) {
      const suma = f.insumos.filter((r) => r.insumo_id === i.insumoId).reduce((a, r) => a + r.cantidad, 0);
      expect(suma).toBeCloseTo(i.cantidad, 6);
    }
    const lineas = Object.values(f.cobertura).reduce((a, c) => a + c!.lineas, 0);
    expect(lineas).toBe(todos.cobertura.lineas);
  });

  it('separa por origen, guarda cobertura y productos sin receta', () => {
    expect(f.insumos.filter((r) => r.insumo_id === 'le').map((r) => [r.origen, r.cantidad])).toEqual([
      ['app', 180],
      ['desconocido', 180],
      ['mostrador', 180],
      ['rappi', 180],
    ]);
    expect(f.cobertura.mostrador).toEqual({ lineas: 2, incluidas: 1, generico: 0, sinCodigo: 0, sinEnlace: 1 });
    expect(f.sinReceta.mostrador).toEqual([{ nombre: 'Sandwich', unidades: 1, sinCodigo: false }]);
    expect(f.completa).toBe(true);
    expect(f.recetasLeidasEn).toBe('2026-11-05T00:00:00.000Z');
  });

  it('una lectura parcial queda marcada como incompleta', () => {
    expect(consumoMesSucursal({ mes: '2026-10-01', companyId: 612, lectura: lectura(ps, 'parcial'), datos, piloto: false }).completa).toBe(false);
  });

  it('una sucursal sin pedidos en el mes no tiene renglones', () => {
    const v = consumoMesSucursal({ mes: '2026-10-01', companyId: 612, lectura: lectura([]), datos, piloto: false });
    expect(v.insumos).toEqual([]);
    expect(v.completa).toBe(true);
  });
});

describe('meses', () => {
  it('lee AAAA-MM y da su primer y último día', () => {
    expect(leerMes('2026-10')).toEqual({ mes: '2026-10-01', desde: '2026-10-01', hasta: '2026-10-31' });
    expect(leerMes('2026-02')!.hasta).toBe('2026-02-28');
    expect(leerMes('2026-13')).toBeNull();
    expect(leerMes('octubre')).toBeNull();
  });
  it('solo meses anteriores al actual en la Ciudad de México', () => {
    // 2026-11-01 02:00 UTC = 31 de octubre 20:00 en CDMX: octubre aún no cierra.
    expect(mesCerrado('2026-10-01', new Date('2026-11-01T02:00:00Z'))).toBe(false);
    expect(mesCerrado('2026-10-01', new Date('2026-11-01T07:00:00Z'))).toBe(true);
    expect(mesCerrado('2026-11-01', new Date('2026-11-20T12:00:00Z'))).toBe(false);
    expect(mesCerrado('2026-12-01', new Date('2026-11-20T12:00:00Z'))).toBe(false);
  });
});

describe('Rappi día por día', () => {
  it('pide cada día por separado y junta los pedidos', async () => {
    const llamadas: string[] = [];
    const fuente = vi.fn(async (d: string, h: string) => {
      llamadas.push(`${d}..${h}`);
      return [{ id: d } as unknown as PedidoNormal];
    });
    const r = await rappiPorDias(fuente)!('2026-10-01', '2026-10-03');
    expect(llamadas).toEqual(['2026-10-01..2026-10-01', '2026-10-02..2026-10-02', '2026-10-03..2026-10-03']);
    expect(r).toHaveLength(3);
  });
  it('si un día falla, todo el periodo es null (lectura parcial, nunca pedidos perdidos en silencio)', async () => {
    const fuente = async (d: string) => (d === '2026-10-02' ? null : []);
    expect(await rappiPorDias(fuente)!('2026-10-01', '2026-10-03')).toBeNull();
  });
  it('sin fuente, sin Rappi', () => {
    expect(rappiPorDias(undefined)).toBeUndefined();
  });
});

describe('elegirSucursales', () => {
  const todas = [configDe(513)!, configDe(612)!];
  it('sin ids devuelve todas; con ids, solo esas', () => {
    expect(elegirSucursales([], todas)).toEqual(todas);
    expect(elegirSucursales([612], todas).map((s) => s.companyId)).toEqual([612]);
  });
  it('si ninguna configurada coincide con --companias falla con un mensaje claro', () => {
    expect(() => elegirSucursales([999], todas)).toThrow('Ninguna sucursal configurada coincide con --companias');
  });
});
