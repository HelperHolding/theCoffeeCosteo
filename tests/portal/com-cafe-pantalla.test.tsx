// Plan 3e: pantalla Café (Qué pedir con el plan de abasto, proyección del año, mes por mes, precios y el puente caído).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ motor: null as unknown, db: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/cafe',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  actualizarMotor: vi.fn(),
  guardarParamsImpCafe: vi.fn(),
}));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: 'edicion' }, db: m.db }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import CafePagina from '../../app/(comercializadora)/comercializadora/cafe/page';
import { QuePedirCafe } from '../../components/comercializadora/cafe';
import {
  avisosCafe,
  escCafe,
  kg,
  kpisCafe,
  ordDias,
  ordenesCafe,
  ordPorQue,
  ordPorQueLargo,
  vistaCafe,
} from '../../lib/comercializadora/cafe';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { cafeCorrer, cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const R = datosImp({ zprov: ZPROV });
const o = cafeOrdenes(R, normalizarCfgMotor({}));
const SRV = {
  ok: true,
  motivo: null,
  calc: '2026-11-13T12:30:00Z',
  pagos: [],
  sinCosto: [],
  sinProveedor: [],
  compras: [{ sku: 'INS-CAF-001', fecha_oc: '2026-11-13', cantidad: 30, monto: 14850 }],
};
const CON_CAFE = { compra: { excluir_cafe: false } }; // la simulación del servidor solo trae café si no se excluye
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...R, ...extra },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string>) =>
  render(await CafePagina({ searchParams: Promise.resolve(sp) }));

describe('lo que calcula la pantalla', () => {
  it('vistas, escenario, kilos y días', () => {
    expect([vistaCafe('precios', false), vistaCafe('precios', true), vistaCafe('x', true)]).toEqual([
      'pedir',
      'precios',
      'pedir',
    ]);
    expect([escCafe('Optimista'), escCafe('Manual')]).toEqual(['Optimista', null]);
    expect([kg(1234.4), kg(null), ordDias(400), ordDias(1), ordDias(null)]).toEqual([
      '1,234 kg',
      '—',
      'más de un año',
      '1 día',
      null,
    ]);
  });

  it('Qué pedir: conteos, kilos aproximados y grupos ordenados (primero el que pide esta semana)', () => {
    const d = ordenesCafe(o, { cuando: '', soloAcc: true });
    expect(d.d.esta.length).toBe(2);
    expect(d.kgE).toBeGreaterThan(0);
    expect(d.grupos[0].g.nEsta).toBeGreaterThan(0);
    expect(d.grupos.flatMap((x) => x.filas.map((f) => f.estado))).toContain('esta');
    expect(
      ordenesCafe(o, { cuando: 'prox', soloAcc: true }).grupos.every((x) =>
        x.filas.every((f) => f.r.calc.pedirProx > 0),
      ),
    ).toBe(true);
  });

  it('por qué: el cálculo local explica venta, cobertura y kilos; con el servidor, la regla de mínimo y máximo', () => {
    const r = o.rows.find((x) => x.calc.pedirEsta > 0 && x.sku.startsWith('INS-CAF'))!;
    expect(ordPorQue(r, null, null)).toMatch(/^Vende [\d.,]+\/día/);
    expect(ordPorQueLargo(r, null, null)).toMatch(/kg\)/);
    const s = cafeOrdenes(datosImp({ zprov: ZPROV, srv: SRV as never }), normalizarCfgMotor(CON_CAFE));
    const rs = s.rows.find((x) => x.sku === 'INS-CAF-001')!;
    expect(ordPorQue(rs, { 'INS-CAF-001': { minimo: 20, maximo: 60 } }, SRV.calc)).toContain(
      'mínimo (20), se pide hasta el máximo (60)',
    );
    expect(ordPorQue(rs, null, SRV.calc)).toContain('no está en la simulación del servidor');
  });

  it('proyección del año: cifras y avisos (mezcla que no suma 1, optimista con menos aperturas, aperturas sin leer)', () => {
    const c = cafeCorrer(R, normalizarCfgMotor({ cafe: { prod: { white_1kg: { mezcla: 0.5 } } } }));
    const k = kpisCafe(c);
    expect(k.kgComprar).toBeGreaterThan(0);
    expect(k.mesPico).toMatch(/^[A-Z]/);
    const av = avisosCafe(c, { avisos: ['aperturas'] }).join('\n');
    expect(av).toContain('La mezcla de presentaciones suma 61.4%');
    expect(av).toContain('El escenario Optimista abre menos sucursales');
    expect(av).toContain('No se pudieron leer las aperturas');
  });
});

describe('Qué pedir de café', () => {
  it('con edición: Crear OC solo en el proveedor que pide esta semana, hacia Órdenes prellenada', () => {
    render(
      <QuePedirCafe c={o} cuando="" soloAcc simple={false} editable mm={null} srvCalc={null} params={{}} />,
    );
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.length).toBe(2);
    expect(crear[0].getAttribute('href')).toMatch(/^\/comercializadora\/ordenes\?nueva=cafe&proveedor=/);
    expect(screen.getAllByText(/≈ [\d.,]+ kg/).length).toBeGreaterThan(0);
  });

  it('sin artículos de café lo dice', () => {
    const vacio = cafeOrdenes(
      datosImp({ cat: R.cat.filter((x) => !/caf/i.test(String(x.nombre))) }),
      normalizarCfgMotor({}),
    );
    render(<QuePedirCafe c={vacio} cuando="" soloAcc simple editable mm={null} srvCalc={null} params={{}} />);
    expect(screen.getByText(/No encontré artículos de café tostado/)).toBeTruthy();
  });
});

describe('página', () => {
  beforeEach(() => limpiarMotor());

  it('sin puente: muestra el error', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los pedidos del sitio viejo.' };
    await pagina({});
    expect(screen.getByRole('alert').textContent).toBe('No se pudieron leer los pedidos del sitio viejo.');
  });

  it('Qué pedir por defecto; con cantidades del servidor lee el mínimo y máximo de esos artículos (si no, no lee)', async () => {
    m.motor = listo({ srv: SRV }, CON_CAFE);
    const f = dbFalsa({ com_minmax: [{ sku: 'INS-CAF-001', minimo: 20, maximo: 60 }] });
    m.db = f.db;
    await pagina({ det: '1' });
    expect(f.consultas.map((x) => x.tabla)).toEqual(['com_minmax']);
    expect(screen.getAllByText(/mínimo \(20\), se pide hasta el máximo \(60\)/).length).toBeGreaterThan(0);
    const nav = screen.getByRole('navigation', { name: 'Vistas' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual([
      'Qué pedir',
      'Proyección del año',
      'Mes por mes',
      'Presentaciones y precios',
      'Parámetros',
      'Vista simple',
    ]);
  });

  it('con café excluido de la simulación (lo normal) el Qué pedir de café es local y no lee com_minmax', async () => {
    m.motor = listo({ srv: SRV });
    const f = dbFalsa({});
    m.db = f.db;
    await pagina({});
    expect(f.consultas).toEqual([]);
  });

  it('proyección, mes por mes y precios con el escenario de la URL; parámetros abre el editor', async () => {
    m.motor = listo();
    m.db = dbFalsa({}).db;
    const a = await pagina({ vista: 'resumen', esc: 'Optimista' });
    expect((screen.getByLabelText('Escenario') as HTMLSelectElement).value).toBe('Optimista');
    expect(screen.getByText(/Café a comprar en 2027/)).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
    a.unmount();
    const b = await pagina({ vista: 'mensual', det: '1' });
    expect(screen.getAllByRole('row').length).toBe(14);
    b.unmount();
    const c = await pagina({ vista: 'precios', det: '1' });
    expect(screen.getByRole('heading', { name: 'Margen bruto' })).toBeTruthy();
    c.unmount();
    await pagina({ vista: 'params' });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });
});
