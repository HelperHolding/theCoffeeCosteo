import { describe, expect, it, vi } from 'vitest';
vi.mock('next/navigation', () => ({ usePathname: () => '/bi', useSearchParams: () => new URLSearchParams() }));
import { modulos, modulosVisibles } from '@/lib/portal/modulos';
import { gruposDe } from '@/components/portal/navegacion';

describe('módulo BI', () => {
  it('se ve solo con acceso bi', () => {
    expect(modulosVisibles({ bi: 'lectura' }, 'sucursales')).toContain('bi');
    expect(modulosVisibles({ sucursales: 'lectura' }, 'sucursales')).not.toContain('bi');
    expect(modulos.find((m) => m.id === 'bi')?.href).toBe('/bi');
  });

  it('navegación del BI: Portal + tableros', () => {
    const g = gruposDe('bi', ['bi', 'sucursales']);
    expect(g[0].enlaces.map((e) => e.href)).toEqual(['/', '/sucursales']);
    expect(g[1].enlaces.map((e) => e.href)).toEqual(['/bi', '/bi/the-coffee-mexico']);
  });
});
