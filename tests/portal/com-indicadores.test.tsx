import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, nivel: 'edicion', refresh: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh }) }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: m.nivel },
    nivel: m.nivel,
    db: m.db,
  }),
}));
import { actualizarMotor, guardarMetasKpi } from '../../app/(comercializadora)/comercializadora/acciones';
import { DetalleKpiVista, TarjetasKpi } from '../../components/comercializadora/indicadores';
import { MetasKpi } from '../../components/comercializadora/metas-kpi';
import { KPI_AB_DEF, esDetalle, tonoKpi, validarMetas } from '../../lib/comercializadora/indicadores';
import type { DatosPlan } from '../../supabase/functions/_shared/planDatos.ts';
import { kpiAbCalc, kpiAbEstados, kpiAbTraza } from '../../supabase/functions/_shared/planKpi.ts';

const AHORA = Date.UTC(2026, 10, 13, 18);
const hace = (n: number) => new Date(AHORA - n * 864e5).toISOString();
const art = (o: Record<string, unknown>) => ({
  estatus: 'Compra Recurrente',
  categoria: 'Desechables',
  zoho_sync_at: null,
  cantidad_por_apertura: 0,
  minimo_compra_pzas: 0,
  multiplo_compra: 1,
  proveedor_preferido: 'Vasos SA',
  ...o,
});
/** 84 días de pedidos de A (estable) y B (subió las últimas 2 semanas); C sin venta; B sin inventario y con OC sin fecha. */
const R: DatosPlan = {
  hoy: '2026-11-13',
  hist: 90,
  histReal: 400,
  cat: [
    art({ sku: 'A', nombre: 'Vaso', costo_unitario: 2, saldo_cedis: 30 }),
    art({ sku: 'B', nombre: 'Tapa', costo_unitario: 1, saldo_cedis: 0, proveedor_preferido: null }),
    art({ sku: 'C', nombre: 'Popote', costo_unitario: 5, saldo_cedis: 40 }),
  ],
  pedidos: Array.from({ length: 84 }, (_, k) => ({
    id: 'p' + k,
    apertura_id: null,
    franquiciatario_email: 'f@x.com',
    fecha_pedido: hace(k),
    status: 'enviado',
    items: [
      { sku: 'A', cantidad: 3 + (k % 3) },
      { sku: 'B', cantidad: k < 14 ? 6 : 1 },
    ],
    items_editados: null,
  })),
  lt: [{ sku: 'A', dias: 7 }],
  map: [],
  oc: [
    {
      id: 'o1',
      sku: 'B',
      folio: 'OC-1',
      fecha: '2026-11-05',
      fecha_arribo: null,
      cantidad: 20,
      cantidad_recibida: 0,
      monto: 20,
    },
  ],
  comp: [],
  aperturas: [],
  pedAper: [],
  kit: {},
  conteoUlt: { cedis: {}, yulius: {} },
  ocZohoBorr: [],
  srv: null,
  avisos: [],
  cargadoEn: 1,
};
const K = kpiAbCalc(R, {}, AHORA);
const E = kpiAbEstados(K);

describe('Indicadores: cálculos de la pantalla', () => {
  it('validarMetas: rangos, enteros, coma decimal y pares mínimo < máximo', () => {
    const txt = Object.fromEntries(Object.entries(KPI_AB_DEF).map(([k, v]) => [k, String(v)]));
    expect(validarMetas({ ...txt, prec_min: '72.6', cv_min: '0,8' })).toEqual({
      vals: { ...KPI_AB_DEF, prec_min: 73, cv_min: 0.8 },
    });
    expect(validarMetas({ ...txt, prec_min: '120' })).toEqual({
      error: '"Precisión del forecast mínima" debe ser un número entre 0 y 100.',
    });
    expect(validarMetas({ ...txt, dias_min: '' })).toHaveProperty('error');
    expect(validarMetas({ ...txt, cv_min: '1.2', cv_max: '1.1' })).toEqual({
      error: 'En "Compras vs venta" el mínimo debe ser menor que el máximo.',
    });
  });
  it('tono de cada tarjeta y detalles válidos', () => {
    expect([tonoKpi(true), tonoKpi(null), tonoKpi(false), tonoKpi(undefined)]).toEqual([
      'ok',
      'bajo',
      'pierde',
      'neutro',
    ]);
    expect([esDetalle('fc'), esDetalle('x'), esDetalle(undefined)]).toEqual([true, false, false]);
  });
  it('el fixture produce forecast, riesgo y datos con avisos', () => {
    expect(K.fc.acc).not.toBeNull();
    expect(K.riesgo.filas.map((f: { sku: string; estado: string }) => [f.sku, f.estado])).toEqual([
      ['B', 'confirmar'],
      ['A', 'pronto'],
      ['C', 'sinventa'],
    ]);
  });
});

describe('Indicadores: pantalla', () => {
  it('siete tarjetas, cada una abre su detalle', () => {
    render(<TarjetasKpi K={K} E={E} />);
    const enlaces = screen.getAllByRole('link').map((a) => a.getAttribute('href'));
    expect(enlaces).toHaveLength(7);
    expect(enlaces).toContain('/comercializadora/indicadores?detalle=datos');
    expect(screen.getByText('Precisión del forecast')).toBeInTheDocument();
  });

  it('detalle de datos: las revisiones que fallan llevan a la pantalla del portal que lo corrige', () => {
    render(<DetalleKpiVista K={K} E={E} detalle="datos" ventanas={[]} traza={null} />);
    expect(screen.getByText('Inventario sincronizado con Zoho')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: /Abrir el catálogo/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/catalogo',
    );
    expect(screen.getAllByRole('link', { name: /Ver inventario/ })[0]).toHaveAttribute(
      'href',
      '/comercializadora/inventario',
    );
  });

  it('detalle de exceso: el artículo sin venta aparece con su valor', () => {
    render(<DetalleKpiVista K={K} E={E} detalle="exc" ventanas={[]} traza={null} />);
    expect(screen.getByText('Popote')).toBeInTheDocument();
  });

  it('traza de un artículo: semana a semana y regreso al forecast', () => {
    const traza = kpiAbTraza(R, K, 'B');
    render(<DetalleKpiVista K={K} E={E} detalle="fc" ventanas={[]} traza={traza} />);
    expect(screen.getByRole('heading', { name: 'Tapa' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Volver al forecast/ })).toHaveAttribute(
      'href',
      '/comercializadora/indicadores?detalle=fc',
    );
    expect(screen.getAllByRole('row')).toHaveLength(K.NB + 1);
  });

  it('metas: solo lectura no muestra Guardar; edición guarda y refresca', async () => {
    const { unmount } = render(<MetasKpi metas={K.metas} version={1} editable={false} />);
    expect(screen.queryByRole('button', { name: 'Guardar metas' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Precisión del forecast mínima')).toBeDisabled();
    unmount();
    m.nivel = 'edicion';
    m.db = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 1 }],
      com_plan_config_historial: [],
    }).db;
    render(<MetasKpi metas={K.metas} version={1} editable />);
    fireEvent.change(screen.getByLabelText('Precisión del forecast mínima'), { target: { value: '80' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar metas' }));
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Metas guardadas (1 cambio)'));
    expect(m.refresh).toHaveBeenCalled();
  });
});

describe('acciones: metas y actualizar', () => {
  const txt = (o: Record<string, string> = {}) => ({
    ...Object.fromEntries(Object.entries(KPI_AB_DEF).map(([k, v]) => [k, String(v)])),
    ...o,
  });
  beforeEach(() => {
    m.nivel = 'edicion';
  });

  it('guarda solo cfg.kpi, sube la versión y deja historial por meta (ámbito config)', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: { consumo: { ventana: 45 }, kpi: { otra: 1 } }, version: 7 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80', exc_margen: '20' }), 7)).toEqual({
      ok: true,
      version: 8,
      cambios: 2,
    });
    expect(f.tablas.com_plan_config[0]).toMatchObject({
      version: 8,
      config: { consumo: { ventana: 45 }, kpi: { otra: 1, ...KPI_AB_DEF, prec_min: 80, exc_margen: 20 } },
    });
    expect(f.tablas.com_plan_config_historial.map((h) => [h.clave, h.valor_anterior, h.valor_nuevo])).toEqual(
      [
        ['kpi.prec_min', 70, 80],
        ['kpi.exc_margen', 30, 20],
      ],
    );
  });

  it('otra persona guardó antes: no escribe', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 8 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80' }), 7)).toHaveProperty('error');
    expect(f.tablas.com_plan_config[0].version).toBe(8);
    expect(f.tablas.com_plan_config_historial).toEqual([]);
  });

  it('sin cambios no escribe; con un valor fuera de rango responde el error', async () => {
    const f = dbFalsa({
      com_plan_config: [{ id: 1, config: {}, version: 2 }],
      com_plan_config_historial: [],
    });
    m.db = f.db;
    expect(await guardarMetasKpi(txt(), 2)).toEqual({ ok: true, version: 2, cambios: 0 });
    expect(await guardarMetasKpi(txt({ disp_min: '101' }), 2)).toHaveProperty('error');
    expect(f.tablas.com_plan_config[0].version).toBe(2);
  });

  it('solo lectura: no toca la base; actualizar sí se permite (no escribe)', async () => {
    m.nivel = 'lectura';
    const f = dbFalsa({ com_plan_config: [{ id: 1, config: {}, version: 2 }] });
    m.db = f.db;
    expect(await guardarMetasKpi(txt({ prec_min: '80' }), 2)).toEqual({
      error: 'Tu acceso a Comercializadora es de solo lectura.',
    });
    expect(await actualizarMotor()).toEqual({ ok: true });
    expect(f.consultas).toEqual([]);
  });
});
