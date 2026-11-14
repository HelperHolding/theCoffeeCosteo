// Plan 3f: pantalla Plan de abastos (categorías, cifras, gráfica, matrices, Crear OC, avisos y navegación).
import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, acceso: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/plan-abastos',
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({ actualizarMotor: vi.fn() }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({ accesos: { comercializadora: m.acceso }, db: null }),
}));
vi.mock('../../lib/comercializadora/motor', async (original) => ({
  ...(await original<typeof import('../../lib/comercializadora/motor')>()),
  motorPlan: async () => m.motor,
}));
import PlanAbastosPagina from '../../app/(comercializadora)/comercializadora/plan-abastos/page';
import { gruposDe } from '../../components/portal/navegacion';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosSem, SRV_SEM } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

let carga = 100;
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...datosSem(), ...extra, cargadoEn: ++carga },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string> = {}) =>
  render(await PlanAbastosPagina({ searchParams: Promise.resolve(sp) }));

describe('pantalla Plan de abastos', () => {
  beforeEach(() => {
    limpiarMotor();
    m.acceso = 'edicion';
    m.motor = listo();
  });

  it('tres categorías, cifras, familias, la gráfica y el enlace a Pagos proyectados en lugar de "Pagos por viernes"', async () => {
    await pagina();
    expect(screen.getByRole('heading', { name: 'Plan de abastos' })).toBeTruthy();
    for (const n of ['Todo lo demás', 'Café', 'Importaciones'])
      expect(screen.getByRole('link', { name: `Quitar ${n} del plan` })).toBeTruthy();
    expect(screen.getByText('Dinero para esta semana')).toBeTruthy();
    expect(screen.getByText('Dónde se va el dinero')).toBeTruthy();
    expect(screen.getByRole('img', { name: 'Compras por semana y por categoría' })).toBeTruthy();
    expect(screen.getByText('Qué trae cada barra alta')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Ver pagos proyectados' }).getAttribute('href')).toBe(
      '/comercializadora/pagos',
    );
    expect(screen.queryByText('Pagos por viernes')).toBeNull();
    // Vista simple: el detalle va plegado y sin la cifra de "se agotan".
    expect(screen.getByText('Ver detalle por proveedor y artículo')).toBeTruthy();
    expect(screen.queryByText('Se agotan antes de que llegue')).toBeNull();
  });

  it('?sin=imp deja fuera Importaciones del dinero y de la tabla; la tarjeta la vuelve a incluir', async () => {
    await pagina({ sin: 'imp' });
    const t = screen.getByRole('link', { name: 'Incluir Importaciones en el plan' });
    expect(t.getAttribute('href')).toBe('/comercializadora/plan-abastos');
    expect(within(t).getByText('No incluido en el plan')).toBeTruthy();
    expect(screen.queryByText('Total de lo incluido')).toBeTruthy();
    expect(screen.queryByText('Green Packaging (vasos y tapas)')).toBeNull();
  });

  it('por proveedor: Crear OC de lo que toca hoy (nueva=plan) y el detalle por artículo al abrir el renglón', async () => {
    await pagina({ det: '1' });
    const crear = screen.getAllByRole('link', { name: 'Crear OC' });
    expect(crear.some((a) => /nueva=plan&proveedor=Jarabes\+MX/.test(a.getAttribute('href') ?? ''))).toBe(
      true,
    );
    expect(crear.some((a) => /nueva=importaciones/.test(a.getAttribute('href') ?? ''))).toBe(true);
    expect(screen.queryByText('LOC-JAR-001 · lead time 7 d · $95 c/u')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Ver los artículos de Jarabes MX' }));
    expect(screen.getByText('LOC-JAR-001 · lead time 7 d · $95 c/u')).toBeTruthy();
    expect(screen.getByText('Se agotan antes de que llegue')).toBeTruthy();
    expect(screen.getByText('Seguimiento de ventas')).toBeTruthy();
  });

  it('solo lectura: sin Crear OC', async () => {
    m.acceso = 'lectura';
    await pagina({ det: '1' });
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('por artículo, con búsqueda: solo lo que coincide, con su categoría', async () => {
    await pagina({ det: '1', vista: 'articulo', q: 'jarabe' });
    const tabla = screen.getByRole('columnheader', { name: 'Primer pedido' }).closest('table')!;
    expect(within(tabla).getByText('Jarabe vainilla 1 L')).toBeTruthy();
    expect(within(tabla).getAllByText('Todo lo demás').length).toBeGreaterThan(0);
    expect(within(tabla).queryByText('Vaso papel 8 oz')).toBeNull();
  });

  it('avisa de dónde salen las cantidades: simulación vigente o cálculo local con el motivo', async () => {
    m.motor = listo({ srv: SRV_SEM });
    const { unmount } = await pagina();
    expect(screen.getByText(/^Cantidades: simulación del servidor/)).toBeTruthy();
    unmount();
    limpiarMotor();
    m.motor = listo({ srv: { ...SRV_SEM, ok: false, motivo: 'corrida de hace 40 h', compras: [] } });
    await pagina();
    expect(
      screen.getByText(/la simulación del servidor no está disponible \(corrida de hace 40 h\)/),
    ).toBeTruthy();
  });

  it('si Importaciones no se puede calcular, lo local se muestra y la tarjeta dice por qué', async () => {
    m.motor = listo({}, { imp: { orden: [], items: {} } });
    await pagina();
    expect(
      screen.getByText(
        /No hay artículos activos en el plan de importaciones\. No se cuenta en los totales\./,
      ),
    ).toBeTruthy();
    expect(screen.getByText('Dinero para esta semana')).toBeTruthy();
  });

  it('sin datos del plan (puente caído o base): el error, sin números', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los datos del plan. Intenta de nuevo.' };
    await pagina();
    expect(screen.getByRole('alert').textContent).toBe(
      'No se pudieron leer los datos del plan. Intenta de nuevo.',
    );
    expect(screen.queryByText('Dinero para esta semana')).toBeNull();
  });

  it('plan sin compras: la gráfica lo dice y la tabla también', async () => {
    m.motor = listo({ pedidos: [], cat: [], oc: [] });
    await pagina({ det: '1', sin: 'imp' });
    expect(screen.getByText('Sin compras previstas ni emitidas en este periodo')).toBeTruthy();
    expect(screen.getByText('Sin resultados con estos filtros')).toBeTruthy();
  });

  it('navegación: Plan de abastos encabeza Planear y pagar', () => {
    const g = gruposDe('comercializadora', ['comercializadora']);
    const de = (t: string) => g.find((x) => x.titulo === t)!.enlaces.map((e) => e.href);
    expect(de('Planear y pagar')[0]).toBe('/comercializadora/plan-abastos');
  });
});
