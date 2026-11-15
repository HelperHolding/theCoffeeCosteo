import { describe, expect, it } from 'vitest';
import { calcular } from '../../components/sucursales/tablero-mexico';
import { configDe } from '../../lib/sucursales/config';
import type { TableroMexico } from '../../lib/sucursales/contratos';
import type { Origen } from '../../lib/sucursales/normalizar';
import {
  TRAMOS,
  armarHoy,
  armarPeriodo,
  type DiaHoyRpc,
  type RpcPeriodo,
  type Serie,
  type TotalesOrigen,
} from '../../lib/sucursales/resumen';

/**
 * Cálculos del Tablero de México (docs/sucursales/16) que se ven en pantalla: el corte de referencia entre zonas, la
 * frase de la comparación, la hora en curso, el aviso de Rappi en el periodo y el top 5 con sus ciudades.
 */

// Un pedido de $100 por tramo de 10 min entre las 7:00 y el corte, solo de mostrador.
function dia(companyId: number, fecha: string, hoy: boolean, corte: number, porTramo = 100_00): DiaHoyRpc {
  const k = Math.floor(corte / 600);
  const s: Serie = [Array<number>(TRAMOS).fill(0), Array<number>(TRAMOS).fill(0)];
  for (let j = 42; j < k; j++) {
    s[0][j] = 1;
    s[1][j] = porTramo;
  }
  const pedidos = s[0].reduce((a, b) => a + b, 0);
  const origenes: Partial<Record<Origen, TotalesOrigen>> = {
    mostrador: { pedidos, venta_cent: pedidos * porTramo, descuento_cent: 0, lineas: pedidos },
  };
  return {
    company_id: companyId,
    fecha,
    hoy,
    leido_en: '2026-11-15T22:10:00Z',
    corte_segundo: corte,
    completa: true,
    origenes,
    horas: {},
    tramos: { mostrador: s },
  };
}

const periodoVacio: RpcPeriodo = { dias_leidos: 0, incompletos: 0, semanas: [], dias: [], productos: [] };

describe('Tablero de México: lo que se pinta', () => {
  // Dos de Guadalajara (corte 16:10) y una de Cancún (17:10 en su hora local).
  const cfgs = [configDe(513)!, configDe(384)!, configDe(552)!];
  const rpc = {
    ultimo_corte: '2026-11-15T22:10:00Z',
    dias: [
      dia(513, '2026-11-15', true, 16 * 3600 + 10 * 60),
      dia(384, '2026-11-15', true, 16 * 3600 + 10 * 60),
      dia(552, '2026-11-15', true, 17 * 3600 + 10 * 60),
      dia(513, '2026-11-08', false, 86400, 50_00),
      dia(384, '2026-11-08', false, 86400, 50_00),
      dia(552, '2026-11-08', false, 86400, 50_00),
    ],
  };
  const hoy = armarHoy(rpc, cfgs);
  const tablero: TableroMexico = {
    generadoEn: '2026-11-15T22:12:00Z',
    semanas: 8,
    hoy,
    periodo: armarPeriodo(periodoVacio, '2026-09-14', '2026-11-08', cfgs),
  };

  it('la curva se corta en el corte más común; Cancún no deja una cola de una hora', () => {
    expect(hoy.curva.hastaTramo).toBe(97);
    // Hoy y la semana pasada, cortados en el mismo tramo de cada sucursal y nunca después del 97.
    const hoyM = hoy.curva.hoy.mostrador!;
    const baseHasta = hoy.curva.baseHasta.mostrador!;
    expect(hoyM[0][96]).toBe(3);
    expect(hoyM[0][97]).toBe(0);
    expect(baseHasta[0][96]).toBe(3);
    expect(baseHasta[0][97]).toBe(0);
    // La semana pasada completa sigue como referencia del resto del día.
    expect(hoy.curva.base.mostrador![0][120]).toBe(3);
  });

  it('la frase de la comparación lleva una hora real, y «hora local» si hay otra zona', () => {
    const v = calcular(tablero, 'todos');
    expect(v.comparable!.sufijo).toBe('vs el domingo 8 nov a las 16:10 (hora local)');
    expect(v.comparable!.sufijo).not.toMatch(/la misma hora local/);
    // Hoy a $100 por tramo contra $50 la semana pasada, hasta el mismo tramo de cada una: +100 %.
    expect(v.comparable!.venta).toBeCloseTo(1);
  });

  it('hora en curso: el corte de las 16:10 deja la hora 16 en curso y la última hora completa es 15:00 a 16:00', () => {
    const v = calcular(tablero, 'todos');
    expect(v.horaEnCurso).toBe(16);
    expect(v.ultimaHoraConDatos).toBe(16);
    expect(v.ultimaHora!.etiqueta).toBe('15:00 a 16:00');
    // 6 tramos × 3 sucursales × $100.
    expect(v.ultimaHora!.venta).toBe(1_800_00);
    expect(v.ultimaHora!.delta).toBeCloseTo(1);
    // La semana pasada en la hora en curso llega solo hasta el mismo corte (1 tramo por sucursal).
    expect(v.baseHastaPedidosHora![16]).toBe(3);
    expect(v.basePedidosHora![16]).toBe(18);
  });

  it('con el corte justo en la hora no hay hora en curso', () => {
    const r = armarHoy({ ultimo_corte: rpc.ultimo_corte, dias: [dia(513, '2026-11-15', true, 16 * 3600)] }, [
      configDe(513)!,
    ]);
    const v = calcular({ ...tablero, hoy: r }, 'todos');
    expect(v.horaEnCurso).toBeNull();
    expect(v.ultimaHoraConDatos).toBe(15);
  });

  it('top 5 y ciudades: de más a menos venta, con todas las sucursales de cada ciudad', () => {
    const v = calcular(tablero, 'todos');
    expect(v.top.map((s) => s.companyId)).toEqual([552, 513, 384]); // Empate de venta: por nombre (Namóra antes que Ventura).
    expect(v.ciudades.map((c) => c.ciudad)).toEqual(['Guadalajara', 'Cancún']);
    expect(v.ciudades[0].sucursales).toHaveLength(2);
    expect(v.ciudades[0].venta).toBe(v.ciudades[0].sucursales.reduce((a, s) => a + s.venta, 0));
  });

  it('Rappi en el periodo: se marca la semana en que empieza y solo con Todo o Rappi', () => {
    const periodo = armarPeriodo(
      {
        dias_leidos: 3,
        incompletos: 0,
        semanas: [],
        dias: [
          { fecha: '2026-09-30', origen: 'mostrador', pedidos: 10, venta_cent: 1_000_00 },
          { fecha: '2026-10-01', origen: 'mostrador', pedidos: 10, venta_cent: 1_000_00 },
          { fecha: '2026-10-01', origen: 'rappi', pedidos: 2, venta_cent: 400_00 },
        ],
        productos: [],
      },
      '2026-09-14',
      '2026-11-08',
      cfgs,
    );
    const t = { ...tablero, periodo };
    expect(calcular(t, 'todos').rappi).toEqual({ desde: '2026-10-01', semana: '2026-09-28' });
    expect(calcular(t, 'rappi').rappi).toEqual({ desde: '2026-10-01', semana: '2026-09-28' });
    expect(calcular(t, 'mostrador').rappi).toBeNull();
  });
});
