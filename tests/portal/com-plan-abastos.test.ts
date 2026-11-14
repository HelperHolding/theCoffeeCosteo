// Plan 3f: lo que calcula la pantalla Plan de abastos (parámetros, aviso de la fuente, cifras, familias, gráfica,
// "qué trae cada barra", matrices y seguimiento de ventas).
import { describe, expect, it } from 'vitest';
import {
  dineroCorto,
  etiquetaSem,
  familiasSem,
  filtrarProvs,
  fuenteCant,
  graficaSem,
  hoyTxt,
  incDe,
  kpisSem,
  opcionesSemanas,
  provOpciones,
  provValido,
  queTrae,
  seguimientoSem,
  sinCon,
  tablaArts,
  tablaProvs,
  tarjetasCat,
  vistaSemDe,
} from '../../lib/comercializadora/planAbastos';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc, psemPasadas, type Inc } from '../../supabase/functions/_shared/planSem.ts';
import { datosSem, SRV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const TODAS: Inc = { local: true, cafe: true, imp: true };
const armar = (R = datosSem(), inc: Inc = TODAS, Wv = 12, c0: Record<string, unknown> = {}) => {
  const cfg = normalizarCfgMotor(c0),
    c = planLocal(R, cfg);
  return {
    R,
    c,
    S: planSemCalc(c, inc, Wv, { cafe: () => cafeOrdenes(R, cfg), imp: () => impCorrer(R, cfg) }),
  };
};

describe('parámetros de la URL', () => {
  it('categorías incluidas (?sin=), vista, semanas y etiquetas', () => {
    expect(incDe(undefined)).toEqual(TODAS);
    expect(incDe('imp,cafe,otra')).toEqual({ local: true, cafe: false, imp: false });
    expect([sinCon(TODAS, 'imp'), sinCon({ local: true, cafe: true, imp: false }, 'imp')]).toEqual([
      'imp',
      undefined,
    ]);
    expect([vistaSemDe('articulo'), vistaSemDe('x')]).toEqual(['articulo', 'proveedor']);
    expect([opcionesSemanas({ W: 12 }), opcionesSemanas({ W: 8 }), opcionesSemanas({ W: 6 })]).toEqual([
      [4, 8, 12],
      [4, 8],
      [4, 6],
    ]);
    const c = { semIni: ['2026-11-13', '2026-11-20'], P: 7 };
    expect([etiquetaSem(c, 0), etiquetaSem(c, 0, true), etiquetaSem(c, 1, true)]).toEqual([
      'Hoy',
      'Hoy – 19 nov',
      '20 nov – 26 nov',
    ]);
    expect([dineroCorto(850), dineroCorto(12400), dineroCorto(1340000)]).toEqual(['$850', '$12 k', '$1.3 M']);
  });
});

describe('aviso de la fuente de las cantidades', () => {
  it('servidor (de hoy, de ayer o más vieja) y cálculo local con el motivo', () => {
    const c = planLocal(datosSem({ srv: SRV_SEM }), normalizarCfgMotor({}));
    const hoy = fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-13T18:00:00Z'))!;
    expect(hoy.tono).toBe('ok');
    expect(hoy.texto).toMatch(/^Cantidades: simulación del servidor 13 nov 2026/);
    expect(hoy.extra).toEqual([
      '1 artículo de la simulación no aparece en el Plan.',
      '1 artículo sin proveedor o costo en Zoho: se muestran con el cálculo local.',
    ]);
    expect(fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-14T18:00:00Z'))!.texto).toContain(
      'servidor de ayer',
    );
    expect(fuenteCant(c, { srv: SRV_SEM }, Date.parse('2026-11-16T18:00:00Z'))!.texto).toContain(
      'servidor del ',
    );
    const vieja = { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h' };
    const local = planLocal(datosSem({ srv: vieja }), normalizarCfgMotor({}));
    expect(fuenteCant(local, { srv: vieja }, 0)).toEqual({
      tono: 'warn',
      texto:
        'Usando el cálculo local del Plan: la simulación del servidor no está disponible (corrida de hace 40 h). Los números pueden no coincidir con Qué pedir ni con la OC automática.',
      extra: [],
    });
    expect(fuenteCant(local, { srv: null }, 0)).toBeNull();
  });
});

describe('tarjetas, cifras y familias', () => {
  it('tarjetas por categoría (con el error de la que no se pudo calcular) y cifras de lo incluido', () => {
    const { S } = armar(datosSem(), { local: true, cafe: true, imp: false }, 4, {
      imp: { orden: [], items: {} },
    });
    const t = tarjetasCat(S, { local: true, cafe: true, imp: false }, 4);
    expect(t.map((x) => [x.def.id, x.on])).toEqual([
      ['local', true],
      ['cafe', true],
      ['imp', false],
    ]);
    expect(t[2]).toMatchObject({
      aviso: 'No hay artículos activos en el plan de importaciones.',
      error: true,
    });
    const k = kpisSem(S, { local: true, cafe: true, imp: false }, 4);
    expect(k.ninguna).toBe(false);
    expect(k.esta.monto).toBe(S.tot.monto[0]);
    expect(k.esta.des.map((d) => d.def.id)).toEqual(['local', 'cafe']);
    expect(k.total.monto).toBeCloseTo(S.tot.monto.slice(0, 4).reduce((a, b) => a + b, 0));
    expect(kpisSem(S, { local: false, cafe: false, imp: false }, 4).ninguna).toBe(true);
  });

  it('dónde se va el dinero: familias por clasificación de Zoho y nombre, "Otros" al final', () => {
    const { R, S } = armar();
    const f = familiasSem(S, 12, R.cat)!;
    const nombres = f.lista.map((x) => x.nombre);
    expect(nombres.at(-1)).toBe('Otros');
    // La tisana no tiene costo: no suma dinero a ninguna familia.
    expect(nombres).toEqual(['Café', 'Polvos', 'Jarabes', 'Desechables', 'Otros']);
    expect(f.lista.reduce((s, x) => s + x.monto, 0)).toBeCloseTo(f.tot);
    expect(f.lista.find((x) => x.nombre === 'Jarabes')!.provs).toBe('Jarabes MX 100%');
    const vacio = armar(datosSem(), { local: false, cafe: false, imp: false }).S;
    expect(familiasSem(vacio, 12, R.cat)).toBeNull();
  });
});

describe('gráfica y "qué trae cada barra"', () => {
  it('6 semanas emitidas y las del plan, apiladas por categoría incluida; la primera del plan dice lo de hoy con servidor', () => {
    const { R, c, S } = armar(datosSem({ srv: SRV_SEM }), TODAS, 8);
    const g = graficaSem(S, psemPasadas(c, R), TODAS, 8, c, hoyTxt(S, c));
    expect(g.barras).toHaveLength(14);
    expect(g.barras.slice(0, 6).every((b) => b.tipo === 'pas')).toBe(true);
    expect(g.barras[6]).toMatchObject({ tipo: 'plan', etiqueta: 'Esta semana', k: 0 });
    expect(g.barras[6].tip).toContain('Hoy (igual a la OC automática): $');
    expect(g.barras[6].seg.map((s) => s.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(g.contenedor).toBeGreaterThan(0);
    const sinImp = graficaSem(S, psemPasadas(c, R), { local: true, cafe: true, imp: false }, 8, c, '');
    expect(sinImp.barras[6].seg.map((s) => s.def.id)).toEqual(['local', 'cafe']);
    expect(hoyTxt(S, planLocal(datosSem(), normalizarCfgMotor({})))).toBe('');
  });

  it('qué trae: esta semana y las barras altas, con lo más caro arriba y "y N más"', () => {
    const { c, S } = armar();
    const q = queTrae(S, 12, false, c, '');
    expect(q[0].k).toBe(0);
    expect(q.length).toBeLessThanOrEqual(4);
    q.forEach((x) => {
      expect(x.top.length).toBeLessThanOrEqual(4);
      expect(x.top.map((t) => t.monto)).toEqual([...x.top.map((t) => t.monto)].sort((a, b) => b - a));
      const resto = x.mas ? x.mas.monto : 0;
      expect(x.top.reduce((s, t) => s + t.monto, 0) + resto).toBeCloseTo(x.total);
    });
    expect(queTrae(S, 12, true, c, '')[0].top.length).toBeLessThanOrEqual(3);
  });
});

describe('matrices por proveedor y por artículo', () => {
  it('por proveedor: categorías incluidas con subtotal; el filtro por texto y proveedor; un proveedor que ya no existe se ignora', () => {
    const { S } = armar();
    const t = tablaProvs(S, TODAS, 4, '', '');
    expect(t.cats.map((x) => x.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(t.gran).toBeCloseTo(t.tot.reduce((a, b) => a + b, 0));
    expect(t.cats[0].subT).toBeCloseTo(t.cats[0].filas.reduce((s, f) => s + f.total, 0));
    expect(filtrarProvs(S, 'vainilla', '').map((g) => g.key)).toEqual(['local|jarabes mx']);
    expect(tablaProvs(S, TODAS, 4, '', 'local|jarabes mx').nProv).toBe(1);
    expect([
      provValido(S, 'local|jarabes mx'),
      provValido(S, 'local|nadie'),
      provValido(S, undefined),
    ]).toEqual(['local|jarabes mx', '', '']);
    expect(provOpciones(S).find(([k]) => k.startsWith('imp|'))![1]).toMatch(/\(Importaciones\)$/);
  });

  it('por artículo: del primer pedido al último; importaciones con su llegada; el texto busca también el proveedor', () => {
    const { S } = armar();
    const a = tablaArts(S, 12, '', '');
    expect(a.map((x) => x.r.fechaLimite || '9')).toEqual([...a.map((x) => x.r.fechaLimite || '9')].sort());
    const imp = a.find((x) => x.r.imp && !x.r.contenedor);
    expect(imp?.llega).toBe(imp?.r.llega);
    expect(tablaArts(S, 12, 'jarabes mx', '').every((x) => x.g.nombre === 'Jarabes MX')).toBe(true);
  });
});

describe('seguimiento de ventas', () => {
  const semana = (j: number, proy: number, real: number) => ({
    j,
    ini: 'a',
    fin: 'b',
    proy,
    real,
    n: 3,
    desv: proy > 0 ? (real - proy) / proy : null,
  });
  it('apagado, sin historia y la alerta de ±15% en las dos últimas semanas completas', () => {
    expect(seguimientoSem({ n: 0 }).estado).toBe('apagado');
    expect(seguimientoSem({ n: 4, semanas: [{ n: 0 }], arts: [] }).estado).toBe('sin-historia');
    const arriba = seguimientoSem({
      n: 4,
      semanas: [semana(1, 100, 300), semana(2, 100, 120), semana(3, 100, 130)],
      arts: [],
      comprasSinMonto: 0,
    });
    expect(arriba).toMatchObject({ estado: 'ok', alerta: { dir: 'arriba' } });
    if (arriba.estado === 'ok') expect(arriba.alerta!.pct).toBeCloseTo(25);
    const normal = seguimientoSem({
      n: 4,
      semanas: [semana(1, 100, 10), semana(2, 100, 110), semana(3, 100, 95)],
      arts: [],
      comprasSinMonto: 0,
    });
    expect(normal.estado === 'ok' && normal.alerta).toBe(null);
  });

  it('los 8 artículos que más se desvían, con al menos 2 semanas y costo', () => {
    const arts = Array.from({ length: 12 }, (_, i) => ({
      sku: 'S' + i,
      n: i === 0 ? 1 : 2,
      valor: i === 1 ? null : i * 10,
    }));
    const s = seguimientoSem({ n: 2, semanas: [semana(1, 1, 1)], arts, comprasSinMonto: 2 });
    if (s.estado !== 'ok') throw new Error(s.estado);
    expect(s.arts.map((a) => a.sku)).toEqual(['S11', 'S10', 'S9', 'S8', 'S7', 'S6', 'S5', 'S4']);
    expect(s.sinMonto).toBe(2);
  });

  it('con datos reales del plan', () => {
    const { c } = armar();
    expect(['ok', 'sin-historia']).toContain(seguimientoSem(c.bt).estado);
  });
});

describe('plan grande', () => {
  it('600 artículos de 40 proveedores: todos entran a la matriz (sin paginar) y los totales cuadran', () => {
    const base = datosSem();
    const cat = Array.from({ length: 600 }, (_, i) => ({
      sku: `GRD-${String(i).padStart(3, '0')}`,
      nombre: `Artículo ${i}`,
      estatus: 'Compra Recurrente',
      categoria: 'Barra',
      costo_unitario: 10 + (i % 7),
      saldo_cedis: 0,
      saldo_yulius: 0,
      cantidad_por_apertura: 0,
      minimo_compra_pzas: 0,
      multiplo_compra: 1,
      dias_seguridad: null,
      created_at: '2024-01-10T15:00:00+00:00',
      proveedor_preferido: `Proveedor ${i % 40}`,
      origen: 'LOCAL',
    }));
    const pedidos = Array.from({ length: 300 }, (_, j) => ({
      id: 'g' + j,
      fecha_pedido: new Date(Date.UTC(2026, 10, 12, 18) - (j % 25) * 864e5).toISOString(),
      status: 'enviado',
      apertura_id: 's1',
      franquiciatario_email: 'f@x.com',
      items: cat
        .filter((_, i) => i % 300 === j || (i + 1) % 300 === j)
        .map((x) => ({ sku: x.sku, nombre: 'x', cantidad: 5 })),
      items_editados: null,
    }));
    const R = { ...base, cat: [...base.cat, ...cat], pedidos: [...base.pedidos, ...pedidos] };
    const { S } = armar(R, { local: true, cafe: false, imp: false }, 12);
    const t = tablaProvs(S, { local: true, cafe: false, imp: false }, 12, '', '');
    expect(t.cats[0].filas.filter((f) => f.g.nombre.startsWith('Proveedor ')).length).toBe(40);
    expect(tablaArts(S, 12, 'GRD-', '').length).toBe(600);
    expect(t.gran).toBeCloseTo(t.tot.reduce((a, b) => a + b, 0));
  });
});
