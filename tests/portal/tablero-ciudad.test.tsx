import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    className,
  }: {
    href: string;
    children: React.ReactNode;
    className?: string;
  }) => (
    <a href={href} className={className}>
      {children}
    </a>
  ),
}));

import { EnlaceSucursal, SucursalesEnlazables } from '../../components/sucursales/enlace-sucursal';
import { conCiudad } from '../../components/sucursales/ciudad-tablero';
import { MAPA_GDL, proyectarGdl } from '../../components/sucursales/mapa-guadalajara-trazos';
import { sucursalesDeCiudad } from '../../lib/sucursales/alcance';

/** Tablero de ciudad (docs/sucursales/19): enlaces solo a lo asignado, la ciudad en la URL y el mapa con las 11. */
describe('tablero de ciudad', () => {
  it('enlaza solo las sucursales asignadas; sin proveedor (Tablero México) enlaza todas', () => {
    render(
      <>
        <SucursalesEnlazables ids={[513]}>
          <EnlaceSucursal companyId={513} className="font-medium hover:underline">
            Namóra
          </EnlaceSucursal>
          <EnlaceSucursal companyId={514} className="font-medium hover:underline">
            Essentia
          </EnlaceSucursal>
        </SucursalesEnlazables>
        <EnlaceSucursal companyId={631} href="/sucursales/631?seccion=servicio">
          Forum
        </EnlaceSucursal>
      </>,
    );
    expect(screen.getByText('Namóra').closest('a')?.getAttribute('href')).toBe('/sucursales/513');
    expect(screen.getByText('Essentia').closest('a')).toBeNull();
    expect(screen.getByText('Essentia').className).toBe('font-medium');
    expect(screen.getByText('Forum').closest('a')?.getAttribute('href')).toBe(
      '/sucursales/631?seccion=servicio',
    );
  });

  it('la URL de la API lleva la ciudad solo en el tablero de ciudad', () => {
    const gdl = { clave: 'guadalajara' as const, nombre: 'Guadalajara' };
    expect(conCiudad('/api/sucursales/menu-nacional', null)).toBe('/api/sucursales/menu-nacional');
    expect(conCiudad('/api/sucursales/menu-nacional', gdl)).toBe(
      '/api/sucursales/menu-nacional?ciudad=guadalajara',
    );
    expect(conCiudad('/api/sucursales/servicio-nacional?ultimo=1', gdl)).toBe(
      '/api/sucursales/servicio-nacional?ultimo=1&ciudad=guadalajara',
    );
  });

  it('las 11 sucursales tienen coordenadas y caen dentro del mapa de Guadalajara', () => {
    const gdl = sucursalesDeCiudad('guadalajara');
    expect(gdl).toHaveLength(11);
    for (const s of gdl) {
      expect(s.coordenadas, s.nombre).toBeDefined();
      const [x, y] = proyectarGdl(s.coordenadas!.lon, s.coordenadas!.lat);
      expect(x, s.nombre).toBeGreaterThan(20);
      expect(x, s.nombre).toBeLessThan(MAPA_GDL.ancho - 20);
      expect(y, s.nombre).toBeGreaterThan(20);
      expect(y, s.nombre).toBeLessThan(MAPA_GDL.alto - 20);
    }
  });
});
