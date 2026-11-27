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
import { LIMITES_GDL } from '../../components/sucursales/mapa-guadalajara-limites';
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

  it('las 11 sucursales tienen coordenadas dentro del área metropolitana de los límites del mapa', () => {
    const gdl = sucursalesDeCiudad('guadalajara');
    expect(gdl).toHaveLength(11);
    const pts = LIMITES_GDL.features.flatMap((f) => f.geometry.coordinates.flat());
    const [lon0, lon1] = [Math.min(...pts.map((p) => p[0])), Math.max(...pts.map((p) => p[0]))];
    const [lat0, lat1] = [Math.min(...pts.map((p) => p[1])), Math.max(...pts.map((p) => p[1]))];
    expect(
      LIMITES_GDL.features.filter((f) => f.properties.principal).map((f) => f.properties.nombre),
    ).toEqual(['Guadalajara']);
    for (const s of gdl) {
      expect(s.coordenadas, s.nombre).toBeDefined();
      expect(s.coordenadas!.lon, s.nombre).toBeGreaterThan(lon0);
      expect(s.coordenadas!.lon, s.nombre).toBeLessThan(lon1);
      expect(s.coordenadas!.lat, s.nombre).toBeGreaterThan(lat0);
      expect(s.coordenadas!.lat, s.nombre).toBeLessThan(lat1);
    }
  });
});

describe('worker de MapLibre', () => {
  it('public/maplibre trae el worker de la versión instalada, idéntico al del paquete', async () => {
    const { readFileSync, existsSync } = await import('node:fs');
    const { join } = await import('node:path');
    const raiz = join(__dirname, '..', '..');
    const version = JSON.parse(
      readFileSync(join(raiz, 'node_modules/maplibre-gl/package.json'), 'utf8'),
    ).version;
    const copia = join(raiz, `public/maplibre/maplibre-gl-worker-${version}.mjs`);
    expect(
      existsSync(copia),
      `falta ${copia}: cópialo de node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs`,
    ).toBe(true);
    expect(
      readFileSync(copia).equals(
        readFileSync(join(raiz, 'node_modules/maplibre-gl/dist/maplibre-gl-worker.mjs')),
      ),
    ).toBe(true);
  });
});
