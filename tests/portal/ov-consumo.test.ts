import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { consumoVentana } from '../../lib/comercializadora/ovConsumo';
import { claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const IL = 'il';
const datos: DatosConsumo = {
  leidoEn: '2026-11-16T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set([IL]),
  recetas: new Map([
    [
      claveConsumo(IL, 'Único'),
      [
        {
          insumoId: 'cafe',
          insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG',
          unidad: 'gr',
          categoria: 'CAFE',
          cantidad: 18,
        },
        { insumoId: 'le', insumo: 'LECHE', unidad: 'ml', categoria: 'LECHE', cantidad: 100 },
      ],
    ],
  ]),
};
const p = (fecha: string, origen: PedidoNormal['origen'], rappi: string | null = null): PedidoNormal => ({
  id: Math.random(),
  fecha,
  segundo: 36000,
  hora: '10:00:00',
  origen,
  ventaCent: 8000,
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'EMV',
  lineas: [{ codigo: '5IL', nombre: 'Iced Latte', importeCent: 8000, descuentoPct: 0, customs: [] }],
  numeroPedidoRappi: rappi,
  cuadra: true,
});
const lectura = (
  desde: string,
  hasta: string,
  pedidos: PedidoNormal[],
  estado: LecturaNormal['estado'] = 'completa',
  avisos: string[] = [],
): LecturaNormal => ({
  desde,
  hasta,
  leidoEn: 0,
  estado,
  error: estado === 'error' ? 'proveedor-no-disponible' : null,
  avisos,
  totalDeclarado: null,
  pedidos,
});
const DESDE = '2026-10-19';
const HASTA = '2026-11-15';
const cfg = configDe(519)!; // La Mexicana, con Rappi del portal

describe('consumo de la ventana de 28 días', () => {
  it('lee la ventana una vez, suma Rappi del portal día por día, quita el Rappi del POS y suma por insumo', async () => {
    const leidas: string[] = [];
    const rappiDias: string[] = [];
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) => {
          leidas.push(`${d}..${h}`);
          return lectura(d, h, [
            p('2026-11-15', 'mostrador'),
            p('2026-10-25', 'rappi', 'X'),
            p('2026-10-20', 'app'),
          ]);
        },
        rappi: () => async (d, h) => {
          rappiDias.push(`${d}..${h}`);
          return d === '2026-11-01' ? [p('2026-11-01', 'rappi', 'R1')] : [];
        },
      },
    });
    expect(leidas).toEqual([`${DESDE}..${HASTA}`]);
    expect(rappiDias).toHaveLength(28);
    expect(r).toEqual({
      ok: true,
      desde: DESDE,
      hasta: HASTA,
      dias: 28,
      completa: true,
      avisos: [],
      pedidos: 3,
      cobertura: 1,
      insumos: [
        { insumoId: 'cafe', insumo: 'CAFÉ TOSTADO EN GRANO WHITE 1.5 KG', cantidad: 54 },
        { insumoId: 'le', insumo: 'LECHE', cantidad: 300 },
      ],
    });
  });

  it('lectura parcial del POS: calcula y lo marca incompleto con su aviso', async () => {
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) =>
          lectura(d, h, [p('2026-11-15', 'mostrador')], 'parcial', ['2 de 28 días con lectura incompleta.']),
        rappi: () => undefined,
      },
    });
    expect(r).toMatchObject({ ok: true, completa: false, avisos: ['2 de 28 días con lectura incompleta.'] });
  });

  it('Rappi del portal sin leer: calcula y lo marca incompleto', async () => {
    const r = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) => lectura(d, h, [p('2026-11-15', 'mostrador')]),
        rappi: () => async () => null,
      },
    });
    expect(r).toMatchObject({
      ok: true,
      completa: false,
      avisos: ['No se pudieron leer los pedidos de Rappi del portal.'],
    });
  });

  it('error del POS o una excepción: no hay consumo y se dice el motivo', async () => {
    const error = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async (_c, d, h) => lectura(d, h, [], 'error', ['El proveedor no respondió.']),
        rappi: () => undefined,
      },
    });
    expect(error).toEqual({ ok: false, motivo: 'El proveedor no respondió.' });
    const lanza = await consumoVentana({
      cfg,
      desde: DESDE,
      hasta: HASTA,
      datos,
      deps: {
        leer: async () => {
          throw new Error('red caída');
        },
        rappi: () => undefined,
      },
    });
    expect(lanza).toEqual({ ok: false, motivo: 'red caída' });
  });
});
