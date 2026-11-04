import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));
import { calcularMes } from '../../lib/sucursales/consumo-mes-servidor';
import { claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { configDe } from '../../lib/sucursales/config';
import type { LecturaNormal } from '../../lib/sucursales/datos';
import type { FilaConsumoMes } from '../../lib/sucursales/consumo-mes';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const IL = 'il';
const datos: DatosConsumo = {
  leidoEn: '2026-11-05T00:00:00.000Z',
  enlaces: new Map([['5IL', { recetaId: IL, receta: 'Iced Latte' }]]),
  unicas: new Set([IL]),
  recetas: new Map([[claveConsumo(IL, 'Único'), [{ insumoId: 'le', insumo: 'LECHE', unidad: 'ml', categoria: 'LECHE', cantidad: 100 }]]]),
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
const lectura = (desde: string, hasta: string, pedidos: PedidoNormal[], estado: LecturaNormal['estado'] = 'completa'): LecturaNormal => ({
  desde, hasta, leidoEn: 0, estado, error: estado === 'error' ? 'proveedor-no-disponible' : null, avisos: [], totalDeclarado: null, pedidos,
});

describe('recorrido de un mes', () => {
  it('lee el mes completo de cada sucursal, suma Rappi del portal día por día y guarda una fila por sucursal', async () => {
    const guardadas: FilaConsumoMes[] = [];
    const rappiDias: string[] = [];
    const namora = configDe(513)!; // rappiPortal
    const juarez = configDe(612)!;
    const r = await calcularMes({
      mes: '2026-10-01',
      sucursales: [namora, juarez],
      datos,
      deps: {
        leer: async (cfg, d, h) => {
          expect([d, h]).toEqual(['2026-10-01', '2026-10-31']);
          return lectura(d, h, [p('2026-10-05', 'mostrador')], cfg.companyId === 612 ? 'parcial' : 'completa');
        },
        rappi: (cfg) =>
          cfg.rappiPortal
            ? async (d, h) => {
                rappiDias.push(`${d}..${h}`);
                return d === '2026-10-09' ? [p('2026-10-09', 'rappi', 'R1')] : [];
              }
            : undefined,
        guardar: async (f) => {
          guardadas.push(f);
          return f.insumos.length;
        },
      },
    });
    expect(rappiDias).toHaveLength(31);
    expect(rappiDias[0]).toBe('2026-10-01..2026-10-01');
    expect(guardadas.map((g) => g.companyId)).toEqual([513, 612]);
    expect(guardadas[0].insumos.map((i) => [i.origen, i.cantidad])).toEqual([
      ['mostrador', 100],
      ['rappi', 100],
    ]);
    expect(r.guardadas).toBe(2);
    expect(r.incompletas).toEqual([612]);
    expect(r.fallidas).toEqual([]);
  });

  it('una sucursal que no se pudo leer no se guarda y se reporta', async () => {
    const guardar = vi.fn(async () => 0);
    const r = await calcularMes({
      mes: '2026-10-01',
      sucursales: [configDe(612)!],
      datos,
      deps: { leer: async (_c, d, h) => lectura(d, h, [], 'error'), rappi: () => undefined, guardar },
    });
    expect(guardar).not.toHaveBeenCalled();
    expect(r.fallidas).toEqual([{ companyId: 612, motivo: expect.any(String) }]);
  });

  it('rechaza un mes que no está cerrado', async () => {
    await expect(
      calcularMes({
        mes: '2999-01-01',
        sucursales: [],
        datos,
        deps: { leer: vi.fn(), rappi: () => undefined, guardar: vi.fn() },
      }),
    ).rejects.toThrow(/no ha cerrado/);
  });
});
