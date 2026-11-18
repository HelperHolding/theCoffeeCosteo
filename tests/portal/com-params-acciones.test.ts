// Plan 3e, decisión 7: guardar los parámetros de Importaciones y Café (solo config.imp / config.cafe, con versión e historial).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', invocar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: m.invocar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { guardarParamsImpCafe } from '../../app/(comercializadora)/comercializadora/acciones';
import {
  cafeCfgNorm,
  impCfgNorm,
  numeroParam,
  redConsiderada,
  usarPlataforma,
} from '../../lib/comercializadora/paramsImpCafe';
import { contextoParamsImp } from '../../lib/comercializadora/paramsContexto';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const OCUPADA =
  'Otra persona guardó la configuración mientras trabajabas. Recarga para ver sus cambios y vuelve a intentarlo.';
const base = () =>
  dbFalsa({
    com_plan_config: [{ id: 1, config: { consumo: { ventana: 45 }, kpi: { prec_min: 80 } }, version: 7 }],
    com_plan_config_historial: [],
  });

describe('guardarParamsImpCafe', () => {
  beforeEach(() => {
    m.nivel = 'edicion';
    m.invocar.mockReset();
  });

  it('Importaciones: escribe config.imp normalizada, conserva lo demás y deja historial por clave; no recalcula', async () => {
    const f = base();
    m.db = f.db;
    const b = impCfgNorm({});
    b.items['INS-DES-021'].venta = 0.9;
    b.escenario = 'Optimista';
    b.prov[1].lead = 75;
    expect(await guardarParamsImpCafe('imp', b, 7)).toEqual({ ok: true, version: 8, cambios: 3 });
    const fila = f.tablas.com_plan_config[0] as Record<string, any>;
    expect(fila.version).toBe(8);
    expect(fila.config.consumo).toEqual({ ventana: 45 });
    expect(fila.config.kpi).toEqual({ prec_min: 80 });
    expect(fila.config.imp).toEqual(impCfgNorm(b));
    expect(
      f.tablas.com_plan_config_historial.map((h) => [h.ambito, h.clave, h.valor_anterior, h.valor_nuevo]),
    ).toEqual([
      ['config', 'imp.escenario', 'Base', 'Optimista'],
      ['config', 'imp.items.INS-DES-021.venta', 0.6314, 0.9],
      ['config', 'imp.prov.1.lead', 90, 75],
    ]);
    expect(m.invocar).not.toHaveBeenCalled();
  });

  it('Café: el borrador se normaliza antes de guardar (fuera de rango se acota)', async () => {
    const f = base();
    m.db = f.db;
    const b = cafeCfgNorm({});
    b.prod.white_1kg.mezcla = 2;
    b.anio = '2028';
    const r = await guardarParamsImpCafe('cafe', b, 7);
    expect(r).toEqual({ ok: true, version: 8, cambios: 2 });
    expect((f.tablas.com_plan_config[0] as Record<string, any>).config.cafe.prod.white_1kg.mezcla).toBe(1);
    expect(f.tablas.com_plan_config_historial.map((h) => h.clave)).toEqual([
      'cafe.anio',
      'cafe.prod.white_1kg.mezcla',
    ]);
  });

  it('otra persona guardó antes: no escribe; dos que guardan a la vez con la misma versión, gana el primero', async () => {
    const f = base();
    m.db = f.db;
    const b = impCfgNorm({ escenario: 'Pesimista' });
    expect(await guardarParamsImpCafe('imp', b, 6)).toEqual({ error: OCUPADA });
    expect(f.tablas.com_plan_config[0].version).toBe(7);
    const [a, c] = await Promise.all([
      guardarParamsImpCafe('imp', b, 7),
      guardarParamsImpCafe('cafe', cafeCfgNorm({ ajuste: 0.1 }), 7),
    ]);
    expect([a, c].filter((x) => 'ok' in x)).toHaveLength(1);
    expect([a, c].filter((x) => 'error' in x)).toEqual([{ error: OCUPADA }]);
    expect(f.tablas.com_plan_config[0].version).toBe(8);
  });

  it('sin cambios, ámbito desconocido o solo lectura: no escribe', async () => {
    const f = base();
    m.db = f.db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({}), 7)).toEqual({
      error: 'No hay cambios que guardar',
    });
    expect(await guardarParamsImpCafe('kpi' as 'imp', {}, 7)).toEqual({ error: 'Sección desconocida' });
    m.nivel = 'lectura';
    const g = base();
    m.db = g.db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({ escenario: 'Manual' }), 7)).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(g.consultas).toEqual([]);
    expect(f.tablas.com_plan_config[0].version).toBe(7);
  });

  it('sin configuración guardada o si falla la lectura: no escribe', async () => {
    m.db = dbFalsa({ com_plan_config: [] }).db;
    expect(await guardarParamsImpCafe('imp', impCfgNorm({ escenario: 'Manual' }), 0)).toEqual({
      error: 'No hay configuración guardada todavía',
    });
    m.db = dbFalsa({ com_plan_config: [] }, [{ tabla: 'com_plan_config', op: 'select' }]).db;
    expect(await guardarParamsImpCafe('imp', {}, 0)).toEqual({
      error: 'No se pudo guardar. Intenta de nuevo.',
    });
  });
});

describe('lo que usan los editores', () => {
  const c = impCorrer(datosImp(), normalizarCfgMotor({}));
  const ctx = contextoParamsImp(c, datosImp());

  it('redConsiderada con lo guardado da la misma tabla que _impRed del motor', () => {
    const red = redConsiderada(ctx.pipeline, ctx.claves, c.cfg.imp, 'Base', true);
    expect(
      red.map(({ key, pipeline, plan, cierres, considerada, fuente }) => ({
        key,
        pipeline,
        plan,
        cierres,
        considerada,
        fuente,
      })),
    ).toEqual(
      c.ent.meta.red.filas.map(
        ({ key, pipeline, plan, cierres, considerada, fuente }: Record<string, unknown>) => ({
          key,
          pipeline,
          plan,
          cierres,
          considerada,
          fuente,
        }),
      ),
    );
    expect(
      redConsiderada(ctx.pipeline, ctx.claves, c.cfg.imp, 'Base', false).every((f) => f.considerada === 0),
    ).toBe(true);
  });

  it('contexto: candidatos importados fuera del plan, con su renglón; meta por artículo con la plataforma', () => {
    expect(ctx.candidatos.map((x) => x.sku)).toEqual(['IMP-NUE-900']);
    expect(ctx.candidatos[0].item).toMatchObject({
      prov: 'Easy Drinkware',
      familia: 'General',
      activo: true,
    });
    expect(ctx.meta['INS-DES-021'].cat).toMatchObject({ costo: 600 });
    expect(ctx.meta['INS-DES-002'].cat).toBeNull();
    expect(ctx.claves[0]).toBe('2026-11');
  });

  it('numeroParam: vacío, texto, fuera de rango, enteros y coma decimal', () => {
    const r = { min: 0, max: 10, entero: true };
    expect(numeroParam('', r, 4)).toBe(4);
    expect(numeroParam('', { ...r, nulo: true }, 4)).toBeNull();
    expect(numeroParam('abc', r, 4)).toBe(4);
    expect(numeroParam('99', r, 4)).toBe(10);
    expect(numeroParam('2,6', r, 4)).toBe(3);
    expect(numeroParam('2,6', { min: 0, max: 10 }, 4)).toBe(2.6);
  });

  it('usarPlataforma: copia la venta de la plataforma (4 decimales) a uno o a todos los que tienen dato', () => {
    const uno = usarPlataforma(c.cfg.imp, ctx.meta, 'venta', 'INS-DES-021');
    expect(uno.n).toBe(1);
    expect(uno.imp.items['INS-DES-021'].venta).toBe(
      Math.round((ctx.meta['INS-DES-021'].vPlat as number) * 10000) / 10000,
    );
    expect(usarPlataforma(c.cfg.imp, ctx.meta, 'kit').n).toBe(1); // solo INS-DES-021 tiene piezas por apertura
  });
});
