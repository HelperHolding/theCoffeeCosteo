import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/', useSearchParams: () => new URLSearchParams() }));
import { esHolding } from '../../lib/portal/roles';
import { modulosVisibles, puedeAplicarPagos, puedeVerPagos } from '../../lib/portal/modulos';
import { gruposDe } from '../../components/portal/navegacion';

describe('permisos de Pagos de Sucursales propias', () => {
  it('solo empleados Holding', () => {
    for (const r of ['compras', 'operaciones', 'finanzas', 'admin', 'sucursales', 'interno'])
      expect(esHolding(r)).toBe(true);
    for (const r of ['franquiciado', 'tienda', 'proveedor', 'otro']) expect(esHolding(r)).toBe(false);
  });

  it('ver con cualquier nivel; aplicar con edición o desarrollador; nunca fuera de Holding', () => {
    expect(puedeVerPagos({ sucursales_pagos: 'lectura' }, 'finanzas')).toBe(true);
    expect(puedeAplicarPagos({ sucursales_pagos: 'lectura' }, 'finanzas')).toBe(false);
    expect(puedeAplicarPagos({ sucursales_pagos: 'edicion' }, 'interno')).toBe(true);
    expect(puedeAplicarPagos({ sucursales_pagos: 'desarrollador' }, 'admin')).toBe(true);
    expect(puedeVerPagos({ sucursales_pagos: 'edicion' }, 'tienda')).toBe(false);
    expect(puedeAplicarPagos({ sucursales_pagos: 'edicion' }, 'franquiciado')).toBe(false);
    expect(puedeVerPagos({ sucursales: 'lectura' }, 'admin')).toBe(false);
  });

  it('el módulo Sucursales aparece con solo el acceso de pagos', () => {
    expect(modulosVisibles({ sucursales_pagos: 'lectura' }, 'finanzas')).toContain('sucursales');
    expect(modulosVisibles({ sucursales_pagos: 'lectura' }, 'tienda')).not.toContain('sucursales');
  });

  it('el menú separa Red y Sucursales propias', () => {
    const titulos = (o: { red?: boolean; propias?: boolean }) =>
      gruposDe('sucursales', ['sucursales'], undefined, o).map((g) => g.titulo);
    expect(titulos({ red: true, propias: false })).toEqual(['Módulos', 'Red']);
    expect(titulos({ red: true, propias: true })).toEqual([
      'Módulos',
      'Red',
      'Sucursales propias · Helper Holding',
    ]);
    expect(titulos({ red: false, propias: true })).toEqual([
      'Módulos',
      'Sucursales propias · Helper Holding',
    ]);
    const propias = gruposDe('sucursales', ['sucursales'], undefined, { propias: true }).at(-1)!;
    expect(propias.enlaces.map((e) => e.href)).toEqual(['/sucursales/propias/pagos']);
  });
});
