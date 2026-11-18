// Plan 3f: pantalla Esta semana (tarjetas, pagos, proveedores, Copiar pedido, Crear OC, riesgos, borradores y navegación).
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ motor: null as unknown, acceso: 'edicion' }));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
  usePathname: () => '/comercializadora/esta-semana',
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
import EstaSemanaPagina from '../../app/(comercializadora)/comercializadora/esta-semana/page';
import { gruposDe } from '../../components/portal/navegacion';
import { limpiarMotor } from '../../lib/comercializadora/motor';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { datosSem } from '../../supabase/functions/_shared/pruebas/fixturesSem.ts';

let carga = 500;
const listo = (extra = {}, cfg = {}) => ({
  ok: true,
  R: { ...datosSem(), ...extra, cargadoEn: ++carga },
  cfg: normalizarCfgMotor(cfg),
  version: 3,
});
const pagina = async (sp: Record<string, string> = {}) =>
  render(await EstaSemanaPagina({ searchParams: Promise.resolve(sp) }));
const fila = (nombre: string) =>
  screen.getByRole('button', { name: `Ver los artículos de ${nombre}` }).closest('tr')!;

describe('pantalla Esta semana', () => {
  beforeEach(() => {
    limpiarMotor();
    m.acceso = 'edicion';
    m.motor = listo();
  });

  it('tarjetas de la semana y por categoría, y la línea de pagos por viernes', async () => {
    await pagina();
    expect(screen.getByText('Dinero a disponer esta semana')).toBeTruthy();
    for (const n of ['Todo lo demás', 'Café', 'Importaciones'])
      expect(screen.getAllByText(n).length).toBeGreaterThan(0);
    expect(screen.getByText(/^Estas compras se pagan:/).textContent).toMatch(
      /vie 20 nov \$[\d,]+.*vie 11 dic \$/,
    );
  });

  it('proveedores: pago con crédito, mínimo cumplido, sin proveedor de Zoho y sin proveedor asignado', async () => {
    await pagina();
    expect(within(fila('Vasos SA')).getByText('vie 11 dic')).toBeTruthy();
    expect(within(fila('Vasos SA')).getByText('crédito 30 d')).toBeTruthy();
    expect(within(fila('Jarabes MX')).getByText('Mínimo $5,000 · cumple')).toBeTruthy();
    expect(within(fila('Tisanas')).getByText('sin proveedor de Zoho')).toBeTruthy();
    expect(
      within(fila('Sin proveedor asignado')).getByText('Sin proveedor asignado en el catálogo'),
    ).toBeTruthy();
  });

  it('Crear OC solo esta semana y con permiso; Copiar pedido deja el texto en el portapapeles', async () => {
    const escribir = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText: escribir }, configurable: true });
    await pagina();
    const crear = within(fila('Jarabes MX')).getByRole('link', { name: 'Crear OC' });
    expect(crear.getAttribute('href')).toMatch(
      /^\/comercializadora\/ordenes\?nueva=plan&proveedor=Jarabes\+MX/,
    );
    fireEvent.click(within(fila('Jarabes MX')).getByRole('button', { name: 'Copiar pedido' }));
    await waitFor(() =>
      expect(screen.getByRole('status', { name: '' }).textContent).toContain('Pedido copiado'),
    );
    expect(escribir.mock.calls[0][0]).toMatch(
      /^Pedido a Jarabes MX — 13 nov\n- LOC-JAR-001 · Jarabe vainilla 1 L: 31 \(\$2,945\)/,
    );
  });

  it('la próxima semana: sin Crear OC, el pedido dice "(próxima semana)"', async () => {
    await pagina({ sem: '1' });
    expect(screen.getByText('Dinero de la próxima semana')).toBeTruthy();
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('solo lectura: sin Crear OC', async () => {
    m.acceso = 'lectura';
    await pagina();
    expect(screen.queryByRole('link', { name: 'Crear OC' })).toBeNull();
  });

  it('el detalle de un proveedor muestra lo que se pide y cómo está el inventario hoy', async () => {
    await pagina();
    fireEvent.click(screen.getByRole('button', { name: 'Ver los artículos de Jarabes MX' }));
    expect(screen.getByRole('columnheader', { name: 'Quedas con' })).toBeTruthy();
    expect(screen.getByText('LOC-JAR-001 · $95 c/u · tarda 7 d')).toBeTruthy();
  });

  it('riesgos con enlace a su pantalla y borradores de zoho-sync con qué hacer', async () => {
    await pagina({ det: '1' });
    expect(screen.getByText(/^Se quedarían sin producto antes de que llegue un pedido de hoy/)).toBeTruthy();
    const ver = screen.getAllByRole('link', { name: 'Ver' }).map((a) => a.getAttribute('href'));
    expect(
      ver.every((h) =>
        ['/comercializadora', '/comercializadora/cafe', '/comercializadora/importaciones'].includes(h!),
      ),
    ).toBe(true);
    expect(ver).toContain('/comercializadora/importaciones');
    expect(screen.getByText('Borradores en Zoho por resolver')).toBeTruthy();
    expect(screen.getByText('COM-OC-03001')).toBeTruthy();
    expect(screen.getAllByText('Emitir ajustando').length).toBe(2);
    expect(screen.getByRole('button', { name: 'Copiar folios por borrar (1)' })).toBeTruthy();
    expect(screen.getByText(/Datos de zoho-sync del 13 nov\./)).toBeTruthy();
  });

  it('sin borradores ni nada que pedir: no hay panel de borradores y la tabla lo dice', async () => {
    m.motor = listo({ ocZohoBorr: [], pedidos: [], cat: [] }, { imp: { orden: [], items: {} } });
    await pagina();
    expect(screen.queryByText('Borradores en Zoho por resolver')).toBeNull();
    expect(screen.getByText('No hay nada que pedir esta semana con los datos de hoy.')).toBeTruthy();
  });

  it('si Importaciones no se puede calcular, su tarjeta lo dice y lo demás sigue', async () => {
    m.motor = listo({}, { imp: { orden: [], items: {} } });
    await pagina();
    expect(screen.getByText('No hay artículos activos en el plan de importaciones.')).toBeTruthy();
    expect(within(fila('Jarabes MX')).getByText('vie 20 nov')).toBeTruthy();
  });

  it('sin datos del plan: el error con el enlace a Órdenes', async () => {
    m.motor = { ok: false, error: 'No se pudieron leer los datos del plan. Intenta de nuevo.' };
    await pagina();
    expect(
      within(screen.getByRole('alert')).getByRole('link', { name: 'Ir a Órdenes de compra' }),
    ).toBeTruthy();
  });

  it('navegación: Esta semana va en Comprar, después de Qué pedir', () => {
    const g = gruposDe('comercializadora', ['comercializadora']);
    const comprar = g.find((x) => x.titulo === 'Comprar')!.enlaces.map((e) => e.href);
    expect(comprar.slice(0, 2)).toEqual(['/comercializadora', '/comercializadora/esta-semana']);
  });
});
