// Plan 3f: lo que calcula la pantalla Esta semana (crédito por proveedor de Zoho, filas, tarjetas, pagos, riesgos y borradores).
import { describe, expect, it } from 'vitest';
import {
  creditoProv,
  diasDet,
  filasSemana,
  numDet,
  pagosSemana,
  resumenBorradores,
  riesgosVista,
  rutaRiesgo,
  semHoyDe,
  tarjetasSemana,
  type Credito,
} from '../../lib/comercializadora/estaSemana';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { planLocal } from '../../supabase/functions/_shared/planProv.ts';
import { planSemCalc } from '../../supabase/functions/_shared/planSem.ts';
import { borrAnalisis, borrFuenteZoho, hoyRiesgos } from '../../supabase/functions/_shared/planHoy.ts';
import { datosSem, ZPROV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

const R = datosSem(),
  cfg = normalizarCfgMotor({});
const c = planLocal(R, cfg),
  cafe = cafeOrdenes(R, cfg),
  imp = impCorrer(R, cfg);
const S = planSemCalc(c, { local: true, cafe: true, imp: true }, 12, { cafe: () => cafe, imp: () => imp });
const credito: Credito = (g) => creditoProv(g, { local: c.vendorDe, cafe: cafe.vendorDe }, R.zprov);

describe('días de crédito por proveedor (decisión 5)', () => {
  const g = (fuente: '' | 'cafe' | 'imp', pk: string, nombre: string) => ({ fuente, pk, nombre });
  it('por el vendor de Zoho del grupo; si no hay, por nombre completo o sin el paréntesis; si no, contado', () => {
    const vd = { local: c.vendorDe, cafe: cafe.vendorDe };
    expect(creditoProv(g('', 'vasos sa', 'Vasos SA'), vd, ZPROV_SEM)).toEqual({ dias: 30, vendor: 'v3' });
    expect(creditoProv(g('', 'polvos y bases', 'Polvos y Bases'), vd, ZPROV_SEM)).toEqual({
      dias: 7,
      vendor: 'v5',
    });
    expect(creditoProv(g('', 'lácteos (refrigerados)', 'Lácteos (refrigerados)'), vd, ZPROV_SEM)).toEqual({
      dias: 45,
      vendor: 'v6',
    });
    expect(creditoProv(g('cafe', 'caficultores omac', 'CAFICULTORES OMAC'), vd, ZPROV_SEM)).toEqual({
      dias: 15,
      vendor: 'v1',
    });
    expect(
      creditoProv(g('imp', 'Green Packaging', 'Green Packaging (vasos y tapas)'), vd, ZPROV_SEM),
    ).toEqual({ dias: 60, vendor: 'v7' });
    expect(creditoProv(g('', 'tisanas', 'Tisanas'), vd, ZPROV_SEM)).toEqual({ dias: 0, vendor: null });
    expect(creditoProv(g('', 'vasos sa', 'Vasos SA'), vd, null)).toEqual({ dias: 0, vendor: null });
  });

  it('con varios del mismo nombre sin paréntesis, el mayor crédito', () => {
    const zp = [
      { vendor_id: 'a', nombre: 'Easy Drinkware (termos)', minimo_compra: 0, dias_credito: 15 },
      { vendor_id: 'b', nombre: 'Easy Drinkware (tazas)', minimo_compra: 0, dias_credito: 30 },
    ];
    expect(creditoProv(g('imp', 'Easy Drinkware', 'Easy Drinkware'), { local: {}, cafe: null }, zp)).toEqual({
      dias: 30,
      vendor: 'b',
    });
  });
});

describe('filas, tarjetas y pagos de la semana', () => {
  it('esta semana: proveedores por monto, mínimo, viernes de pago con crédito y el texto para copiar', () => {
    expect([semHoyDe('1'), semHoyDe('x'), semHoyDe(undefined)]).toEqual([1, 0, 0]);
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    expect(f.map((x) => x.monto)).toEqual([...f.map((x) => x.monto)].sort((a, b) => b - a));
    const vasos = f.find((x) => x.g.key === 'local|vasos sa')!;
    expect(vasos.pago).toEqual({ iso: '2026-12-11', txt: 'vie 11 dic', dias: 30, vinculado: true });
    const jar = f.find((x) => x.g.key === 'local|jarabes mx')!;
    expect([jar.minimo, jar.bajo, jar.cumple, jar.pago.txt]).toEqual([5000, false, true, 'vie 20 nov']);
    expect(jar.texto).toMatch(/^Pedido a Jarabes MX — 13 nov\n- LOC-JAR-001/);
    const sin = f.find((x) => !x.g.real)!;
    expect([sin.texto, sin.pago.vinculado]).toEqual([null, false]);
    const tis = f.find((x) => x.g.key === 'local|tisanas')!;
    expect([tis.monto, tis.sinCosto]).toEqual([0, 1]);
  });

  it('tarjetas: el total suma las tres categorías; cada una con su número de artículos', () => {
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    const t = tarjetasSemana(S, 0, f);
    expect(t.total).toBeCloseTo(t.cats.reduce((s, x) => s + x.monto, 0));
    expect(t.nProv).toBe(f.length);
    expect(t.cats.map((x) => x.def.id)).toEqual(['local', 'cafe', 'imp']);
    expect(t.sinCosto).toBeGreaterThan(0);
  });

  it('"estas compras se pagan": por viernes, en orden, sumando lo de cada proveedor', () => {
    const f = filasSemana(S, 0, c, '2026-11-13', credito);
    const p = pagosSemana(f, 0, c, '2026-11-13', credito);
    expect(p.map((x) => x.f)).toEqual([...p.map((x) => x.f)].sort());
    expect(p.reduce((s, x) => s + x.m, 0)).toBeCloseTo(f.reduce((s, x) => s + x.monto, 0));
    expect(p.find((x) => x.f === '2026-12-11')?.txt).toBe('vie 11 dic');
  });

  it('la próxima semana se pide el lunes 16 y se paga ese viernes (contado)', () => {
    const f = filasSemana(S, 1, c, '2026-11-13', credito);
    expect(f.find((x) => x.g.key === 'local|mermeladas')?.pago).toEqual({
      iso: '2026-11-20',
      txt: 'vie 20 nov',
      dias: 0,
      vinculado: false,
    });
  });
});

describe('riesgos y borradores', () => {
  it('riesgos: 5 en la vista simple y 12 con "Ver todo"; "Ver" lleva a la pantalla de su categoría', () => {
    const rs = hoyRiesgos(c, { cafe: () => cafe, imp: () => imp });
    expect(rs.length).toBeGreaterThan(0);
    const v = riesgosVista(rs, true);
    expect(v.lista.length).toBe(Math.min(5, rs.length));
    expect(v.mas).toBe(Math.max(0, rs.length - 5));
    expect([rutaRiesgo('plan'), rutaRiesgo('cafe'), rutaRiesgo('imp')]).toEqual([
      '/comercializadora',
      '/comercializadora/cafe',
      '/comercializadora/importaciones',
    ]);
  });

  it('borradores: cuenta por acción, monto y los folios por borrar', () => {
    const A = borrAnalisis(S, borrFuenteZoho(R), '2026-11-13')!;
    const r = resumenBorradores(A.lista);
    expect(r.n).toEqual({ emitir: 1, ajustar: 2, borrar: 1 });
    expect(r.textoBorrar).toBe('Borradores por borrar en Zoho (1): COM-OC-03003');
    expect(r.tot).toBeCloseTo(3800 + 7200 + 800);
  });

  it('formatos del detalle', () => {
    expect([numDet(2.5), numDet(12.5), numDet(3)]).toEqual(['2.5', '13', '3']);
    expect([diasDet(null), diasDet(0.4), diasDet(400), diasDet(12.2)]).toEqual([
      '—',
      'menos de 1 d',
      'más de 1 año',
      '12 d',
    ]);
  });
});
