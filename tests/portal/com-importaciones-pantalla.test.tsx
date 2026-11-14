// Plan 3e: pantalla Importaciones (vistas, filtros por la URL, Crear OC, avisos y el puente caído).
import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, nivel: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/importaciones',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  actualizarMotor: vi.fn(),
  guardarParamsImpCafe: vi.fn(),
}));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: m.nivel }, db: {} }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import ImportacionesPagina from '../../app/(comercializadora)/comercializadora/importaciones/page';
import {
  ContenedoresImp,
  DetalleImp,
  ProyeccionImp,
  QuePedirImp,
} from '../../components/comercializadora/importaciones';
import {
  ahoraImp,
  avisosImp,
  detalleImp,
  escImp,
  fImp,
  lineaImp,
  mesImp,
  porQueImp,
  tonoEstadoImp,
  vistaImp,
} from '../../lib/comercializadora/importaciones';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const R = datosImp({ avisos: ['aperturas'] });
const c = impCorrer(R, normalizarCfgMotor({}));
const listo = { ok: true, R, cfg: normalizarCfgMotor({}), version: 3 };
const pagina = async (sp: Record<string, string>) =>
  render(await ImportacionesPagina({ searchParams: Promise.resolve(sp) }));

describe('lo que calcula la pantalla', () => {
  it('vistas, escenario de la URL, fechas y tono del estado', () => {
    expect([vistaImp('puente', false), vistaImp('puente', true), vistaImp(undefined, true)]).toEqual([
      'ahora',
      'puente',
      'ahora',
    ]);
    expect([escImp('Manual'), escImp('Raro'), escImp(undefined)]).toEqual(['Manual', null, null]);
    expect([fImp('2027-02-21'), mesImp('2027-02-21'), fImp(null), fImp('x')]).toEqual([
      '21 feb 27',
      'feb 27',
      '—',
      'x',
    ]);
    expect([
      tonoEstadoImp('URGENTE: pedir'),
      tonoEstadoImp('Pedir este mes'),
      tonoEstadoImp('Programado'),
      tonoEstadoImp(''),
    ]).toEqual(['pierde', 'bajo', 'ok', 'neutro']);
  });

  it('avisos: aperturas sin leer, vencidas, sin fecha, fuera del catálogo, estatus de Zoho, OC vieja y sin arribo', () => {
    const av = avisosImp(c, R).join('\n');
    expect(av).toContain('No se pudieron leer las aperturas');
    expect(av).toContain('1 apertura en proceso con fecha ya vencida');
    expect(av).toContain('hace más de 45 días no se cuenta');
    expect(av).toContain('1 apertura en proceso sin fecha');
    expect(av).toMatch(/artículos del plan no están en el catálogo \(INS-DES-002/);
    expect(av).toContain('figuran en Zoho como Inactivo');
    expect(av).toContain('con OC cuya fecha de arribo ya pasó');
    expect(av).toContain('la OC no trae fecha de arribo');
    expect(av).not.toContain('Q1');
  });

  it('Qué pedir: esta semana / la próxima, solo con acción y la escala común de la línea de tiempo', () => {
    const todo = ahoraImp(c, { cuando: '', soloAcc: false });
    const esta = ahoraImp(c, { cuando: 'esta', soloAcc: true });
    expect(todo.nE).toBe(16);
    expect(esta.grupos.every((g) => g.filas.every((f) => f.tipo === 'esta'))).toBe(true);
    expect(todo.grupos.flatMap((g) => g.filas).length).toBe(19);
    const f = todo.grupos[0].filas[0];
    expect(f.linea === null || f.linea.ok + f.linea.gap + f.linea.resp <= 100.1).toBe(true);
    expect(lineaImp({ sinQuiebre: true }, '2026-11-13', 90)).toBeNull();
  });

  it('por qué, en texto: lead time, cobertura, lo que falta y la fecha límite', () => {
    const p = c.S.productos.find((x: { quiebre: { cantidadPedir: number } }) => x.quiebre.cantidadPedir > 0);
    const t = porQueImp(p.quiebre, c);
    expect(t).toMatch(/El proveedor tarda \d+ días/);
    expect(t).toContain('Cubrir 3 meses desde esa fecha (más 1 de respaldo)');
    expect(t).not.toMatch(/<b>/);
  });

  it('detalle por artículo: texto, proveedor y solo con acción', () => {
    expect(detalleImp(c, { q: 'termo', prov: '', soloAcc: false }).flatMap((g) => g.productos).length).toBe(
      4,
    );
    expect(detalleImp(c, { q: '', prov: 'LQC Printing', soloAcc: false }).map((g) => g.nombre)).toEqual([
      'LQC Printing (bolsas)',
    ]);
    expect(detalleImp(c, { q: 'zzz', prov: '', soloAcc: false })).toEqual([]);
  });
});

describe('vistas', () => {
  it('Qué pedir con permiso de edición: bandas por proveedor y Crear OC hacia Órdenes prellenada', () => {
    render(<QuePedirImp c={c} cuando="" soloAcc simple={false} editable params={{ vista: 'ahora' }} />);
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.length).toBe(4);
    expect(crear[0].getAttribute('href')).toMatch(
      /^\/comercializadora\/ordenes\?nueva=importaciones&proveedor=/,
    );
    expect(screen.getAllByText(/ESTA SEMANA · \d+ art\./).length).toBe(4);
    expect(screen.getByRole('link', { name: 'Esta semana (16)' }).getAttribute('href')).toContain(
      'cuando=esta',
    );
  });

  it('solo lectura y vista simple: sin Crear OC ni columna "Por qué"', () => {
    render(<QuePedirImp c={c} cuando="" soloAcc simple editable={false} params={{}} />);
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
    expect(screen.queryByRole('columnheader', { name: 'Por qué' })).toBeNull();
  });

  it('Contenedores y Proyección (decisión 9: nombra el escenario que se ve)', () => {
    const p = impCorrer(R, normalizarCfgMotor({}), 'Pesimista');
    const { unmount } = render(<ContenedoresImp c={p} />);
    expect(screen.getByRole('heading', { name: 'Plan de contenedores de Green Packaging' })).toBeTruthy();
    expect(screen.getAllByRole('columnheader', { name: /^C\d+$/ }).length).toBe(11);
    unmount();
    render(<ProyeccionImp c={p} />);
    expect(screen.getByText(/con el escenario Pesimista/)).toBeTruthy();
    expect(screen.getAllByRole('row').length).toBe(16);
  });

  it('sin artículos del proveedor de contenedores (CBM en cero): lo dice en lugar de una tabla vacía', () => {
    const solo = impCorrer(
      R,
      normalizarCfgMotor({
        imp: {
          items: {
            'MER-TER-001': { nombre: 'Termo', familia: 'Termos', prov: 'Easy Drinkware', venta: 0.7, cbm: 0 },
          },
        },
      }),
    );
    render(<ContenedoresImp c={solo} />);
    expect(
      screen.getByText(/No hay artículos asignados al proveedor de contenedores \(Green Packaging\)/),
    ).toBeTruthy();
  });

  it('Detalle: el filtro es un formulario GET que conserva vista y escenario', () => {
    const { container } = render(
      <DetalleImp
        c={c}
        q="vaso"
        prov=""
        soloAcc={false}
        params={{ vista: 'pedir', esc: 'Base', det: '1' }}
      />,
    );
    const form = container.querySelector('form')!;
    expect(form.getAttribute('action')).toBe('/comercializadora/importaciones');
    expect([...form.querySelectorAll('input[type=hidden]')].map((i) => (i as HTMLInputElement).name)).toEqual(
      ['vista', 'esc', 'det'],
    );
    expect(within(container).getAllByText(/Vaso/).length).toBeGreaterThan(0);
  });
});

describe('página', () => {
  beforeEach(() => {
    limpiarMotor();
    m.nivel = 'edicion';
  });

  it('sin puente: muestra el error y nada más', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los pedidos del sitio viejo.' };
    await pagina({});
    expect(screen.getByRole('alert').textContent).toBe('No se pudieron leer los pedidos del sitio viejo.');
    expect(screen.queryByRole('navigation', { name: 'Vistas' })).toBeNull();
  });

  it('Qué pedir por defecto, con el aviso de lecturas y las vistas de la vista simple', async () => {
    m.motor = listo;
    await pagina({});
    expect(screen.getByRole('status').textContent).toContain('No se pudieron leer: aperturas');
    const nav = screen.getByRole('navigation', { name: 'Vistas' });
    expect(
      within(nav)
        .getAllByRole('link')
        .map((a) => a.textContent),
    ).toEqual(['Qué pedir', 'Contenedores', 'Proyección mensual', 'Parámetros', 'Ver todo']);
    expect(screen.getByRole('button', { name: 'Exportar Excel' })).toBeTruthy();
  });

  it('una vista de detalle trae el selector de escenario, las cifras y los avisos; parámetros abre el editor', async () => {
    m.motor = listo;
    const { unmount } = await pagina({ vista: 'puente', det: '1', esc: 'Optimista' });
    expect((screen.getByLabelText('Escenario') as HTMLSelectElement).value).toBe('Optimista');
    expect(screen.getByText('Pedir en los próximos 30 días')).toBeTruthy();
    expect(screen.getByRole('heading', { name: 'Compra puente' })).toBeTruthy();
    unmount();
    await pagina({ vista: 'params' });
    expect(screen.getByRole('button', { name: 'Guardar cambios' })).toBeTruthy();
  });
});
