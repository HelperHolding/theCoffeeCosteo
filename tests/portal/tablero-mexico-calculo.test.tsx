import { describe, expect, it } from 'vitest';
import { ESTADO_DE_CIUDAD, calcular } from '../../components/sucursales/tablero-mexico';
import { ESTADOS_MX } from '../../components/sucursales/mapa-mexico-trazos';
import { configDe, sucursalesConfiguradas } from '../../lib/sucursales/config';
import type { TableroMexico } from '../../lib/sucursales/contratos';
import type { Origen } from '../../lib/sucursales/normalizar';
import {
  TRAMOS,
  armarHoy,
  armarPeriodo,
  armarRango,
  type DiaHoyRpc,
  type PorOrigen,
  type RpcPeriodo,
  type Serie,
  type TotalesOrigen,
} from '../../lib/sucursales/resumen';
import { leerConsulta } from '../../lib/sucursales/tablero-fechas';

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

describe('Tablero de México: fechas de la URL', () => {
  const q = (s: string, ayer = '2026-11-14') => leerConsulta(new URLSearchParams(s), ayer);

  it('sin fechas es hoy en vivo; un día cerrado del historial a ayer', () => {
    expect(q('semanas=8')).toEqual({ modo: 'vivo' });
    expect(q('dia=2026-11-14')).toEqual({ modo: 'dia', dia: '2026-11-14' });
    expect(q('dia=2026-11-15')).toHaveProperty('error'); // hoy todavía no cierra
    expect(q('dia=2026-08-09')).toHaveProperty('error'); // antes del historial
    expect(q('dia=2026-02-30')).toHaveProperty('error');
  });

  it('un rango se compara con los mismos días justo antes y tiene hasta 120 días', () => {
    expect(q('desde=2026-11-02&hasta=2026-11-08')).toEqual({
      modo: 'rango',
      desde: '2026-11-02',
      hasta: '2026-11-08',
      previoDesde: '2026-10-26',
      previoHasta: '2026-11-01',
      dias: 7,
    });
    expect(q('desde=2026-11-08&hasta=2026-11-02')).toHaveProperty('error');
    expect(q('desde=2026-11-02')).toHaveProperty('error');
    expect(q('desde=2026-08-10&hasta=2026-12-07', '2026-12-31')).toHaveProperty('dias', 120);
    expect(q('desde=2026-08-10&hasta=2026-12-08', '2026-12-31')).toHaveProperty('error');
  });
});

describe('Tablero de México: un día cerrado y un rango', () => {
  const cfgs = [configDe(513)!, configDe(384)!];
  // Día cerrado de hace más de 8 días: sin tramos, solo horas. Un pedido de mostrador por hora de 7 a 21 y, si se
  // pide, uno de Rappi a las 13.
  function cerrado(companyId: number, fecha: string, hoy: boolean, porPedido: number, rappi = 0): DiaHoyRpc {
    const p = Array<number>(24).fill(0);
    const v = Array<number>(24).fill(0);
    for (let h = 7; h < 21; h++) {
      p[h] = 1;
      v[h] = porPedido;
    }
    const horas: PorOrigen<Serie> = { mostrador: [p, v] };
    const origenes: PorOrigen<TotalesOrigen> = {
      mostrador: { pedidos: 14, venta_cent: 14 * porPedido, descuento_cent: 0, lineas: 14 },
    };
    if (rappi) {
      const pr = Array<number>(24).fill(0);
      const vr = Array<number>(24).fill(0);
      pr[13] = 1;
      vr[13] = rappi;
      horas.rappi = [pr, vr];
      origenes.rappi = { pedidos: 1, venta_cent: rappi, descuento_cent: 0, lineas: 1 };
    }
    return {
      company_id: companyId,
      fecha,
      hoy,
      leido_en: '2026-10-04T08:00:00Z',
      corte_segundo: 86400,
      completa: true,
      origenes,
      horas,
      tramos: null,
    };
  }
  const hoy = armarHoy(
    {
      ultimo_corte: null,
      dias: [
        cerrado(513, '2026-10-03', true, 200_00, 300_00),
        cerrado(384, '2026-10-03', true, 200_00, 300_00),
        cerrado(513, '2026-09-26', false, 100_00),
        cerrado(384, '2026-09-26', false, 100_00),
      ],
    },
    cfgs,
  );
  const tablero: TableroMexico = {
    generadoEn: '2026-11-15T22:12:00Z',
    semanas: 8,
    modo: 'dia',
    fecha: '2026-10-03',
    hoy,
    periodo: armarPeriodo(periodoVacio, '2026-09-14', '2026-11-08', cfgs),
  };

  it('sin tramos, la curva sale de las horas (por hora) y se compara el día completo', () => {
    expect(hoy.curva.paso).toBe(6);
    expect(hoy.curva.hastaTramo).toBe(144);
    // Cada hora en su último tramo: el acumulado es exacto en cada hora en punto.
    expect(hoy.curva.hoy.mostrador![1][13 * 6 + 5]).toBe(400_00);
    expect(hoy.curva.hoy.rappi![1][13 * 6 + 5]).toBe(600_00);
    expect(hoy.curva.hoy.mostrador![1][13 * 6]).toBe(0);
    expect(hoy.sucursales[0].comparable!.hoy).toEqual(hoy.sucursales[0].hoy);
    expect(hoy.sucursales[0].comparable!.base.mostrador!.venta_cent).toBe(14 * 100_00);
  });

  it('textos del día, hora pico y aviso cuando la base no tiene Rappi', () => {
    const v = calcular(tablero, 'todos');
    expect(v.titulo).toBe('Venta del sábado 3 oct');
    expect(v.momento.cuando).toBe('el sábado 3 oct');
    expect(v.comparable!.sufijo).toBe('vs el sábado 26 sep, día completo');
    expect(v.ultimaHora).toBeNull();
    expect(v.horaEnCurso).toBeNull();
    expect(v.pico).toEqual({ hora: 13, pedidos: 4, venta: 1_000_00 });
    expect(v.pedidosHora.mostrador[7]).toBe(2);
    expect(v.avisos.some((a) => /no tiene venta de Rappi del portal/.test(a))).toBe(true);
    expect(calcular(tablero, 'mostrador').avisos.some((a) => /Rappi del portal/.test(a))).toBe(false);
  });

  it('rango: total por sucursal, cambio contra los días de antes y cada día contra la semana anterior', () => {
    const c = leerConsulta(new URLSearchParams('desde=2026-11-02&hasta=2026-11-08'), '2026-11-14');
    if ('error' in c || c.modo !== 'rango') throw new Error('rango');
    const rpc = (dias: [string, number, Origen][]): RpcPeriodo => ({
      dias_leidos: dias.length,
      incompletos: 0,
      semanas: dias.map(([f, v, o]) => ({
        company_id: 513,
        semana: f < '2026-11-02' ? '2026-10-26' : '2026-11-02',
        origen: o,
        pedidos: 1,
        venta_cent: v,
        descuento_cent: 0,
        lineas: 1,
        dias: 1,
      })),
      dias: dias.map(([f, v, o]) => ({ fecha: f, origen: o, pedidos: 1, venta_cent: v })),
      productos: [],
    });
    // 4 de noviembre sin venta; Rappi solo el 8.
    const actual = armarPeriodo(
      rpc([
        ['2026-11-02', 100_00, 'mostrador'],
        ['2026-11-03', 100_00, 'mostrador'],
        ['2026-11-05', 100_00, 'mostrador'],
        ['2026-11-06', 100_00, 'mostrador'],
        ['2026-11-07', 100_00, 'mostrador'],
        ['2026-11-08', 100_00, 'mostrador'],
        ['2026-11-08', 50_00, 'rappi'],
      ]),
      c.desde,
      c.hasta,
      cfgs,
    );
    const antes = [
      '2026-10-26',
      '2026-10-27',
      '2026-10-28',
      '2026-10-29',
      '2026-10-30',
      '2026-10-31',
      '2026-11-01',
    ];
    const previo = armarPeriodo(
      rpc(antes.map((f): [string, number, Origen] => [f, 80_00, 'mostrador'])),
      c.previoDesde,
      c.previoHasta,
      cfgs,
    );
    const t: TableroMexico = {
      ...tablero,
      modo: 'rango',
      fecha: undefined,
      rango: {
        desde: c.desde,
        hasta: c.hasta,
        previoDesde: c.previoDesde,
        previoHasta: c.previoHasta,
        dias: actual.dias,
        diasPrevio: previo.dias,
        productos: [],
        diasLeidos: actual.diasLeidos,
        incompletos: 0,
      },
      hoy: armarRango(actual, previo, cfgs),
    };
    const v = calcular(t, 'todos');
    expect(v.titulo).toBe('Venta del 2 nov al 8 nov');
    // 384 no vendió en ninguno de los dos: no entra en la comparación y la frase lo dice.
    expect(v.comparable!.sufijo).toBe('vs los 7 días anteriores (26 oct – 1 nov), 1 de 2 sucursales');
    expect(v.hoy.venta).toBe(650_00);
    expect(v.comparable!.venta).toBeCloseTo(650 / 560 - 1);
    // 384 no vendió en el rango: cuenta como sin venta, no se pierde.
    expect(v.total).toBe(2);
    expect(v.conVenta).toBe(1);
    expect(v.rango!.columnas).toHaveLength(7);
    expect(v.rango!.columnas[2]).toMatchObject({ clave: '2026-11-04', delta: -1 });
    expect(v.rango!.columnas[0].delta).toBeCloseTo(0.25);
    expect(v.rango!.porDia).toBeCloseTo(650_00 / 7);
    expect(v.ultimaHora).toBeNull();
    expect(v.avisos.some((a) => /no tienen venta de Rappi del portal/.test(a))).toBe(true);
  });
});

describe('Tablero de México: estado de cada ciudad en el mapa', () => {
  it('cada ciudad configurada tiene un estado que existe en el mapa (un lote nuevo no se queda fuera)', () => {
    const claves = new Set(ESTADOS_MX.map((e) => e.clave));
    const sinEstado = sucursalesConfiguradas
      .filter((s) => !claves.has(ESTADO_DE_CIUDAD[s.ciudad] ?? ''))
      .map((s) => `${s.companyId} ${s.nombre} (${s.ciudad})`);
    expect(sinEstado).toEqual([]);
  });

  it('Los Cabos va en Baja California Sur', () => {
    expect(ESTADO_DE_CIUDAD['Los Cabos']).toBe('BCS');
  });

  it('una ciudad sin estado se avisa arriba y bajo el mapa, y su venta cuenta en los totales', () => {
    const cfg = { ...configDe(513)!, ciudad: 'Ciudad Nueva' };
    const hoy = armarHoy(
      { ultimo_corte: '2026-11-15T22:10:00Z', dias: [dia(513, '2026-11-15', true, 16 * 3600)] },
      [cfg],
    );
    const v = calcular(
      {
        generadoEn: '2026-11-15T22:12:00Z',
        semanas: 8,
        hoy,
        periodo: armarPeriodo(periodoVacio, '2026-09-14', '2026-11-08', [cfg]),
      },
      'todos',
    );
    expect(v.sinEstado).toEqual(['Ciudad Nueva']);
    expect(v.avisos).toContain(
      'Ciudad Nueva no tiene estado en el mapa: su venta cuenta en los totales, pero no se pinta.',
    );
    expect(v.hoy.venta).toBeGreaterThan(0);
  });
});
