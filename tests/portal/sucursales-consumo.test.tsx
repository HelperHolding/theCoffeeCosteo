import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/link', () => ({
  default: ({ href, children, ...p }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...p}>
      {children}
    </a>
  ),
}));

import { consumir, claveConsumo, type DatosConsumo } from '../../lib/sucursales/consumo';
import { normalizar } from '../../lib/sucursales/normalizar';
import { configDe } from '../../lib/sucursales/config';
import { periodoDeUrl, rango } from '../../lib/sucursales/periodo';
import { sucursalInfo } from '../../lib/sucursales/datos';
import { SeccionesSucursal } from '../../components/sucursales/secciones';
import { cantidad } from '../../components/sucursales/consumo';
import { pedido } from './sucursales-fixtures';

const cfg = configDe(612)!;
const IL = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8'; // Iced Latte: Regular → Chica verificado
const BRO = 'r-bro';
const datos: DatosConsumo = {
  leidoEn: '2026-10-28T00:00:00.000Z',
  enlaces: new Map([
    ['5IL', { recetaId: IL, receta: 'Iced Latte' }],
    ['BRO13', { recetaId: BRO, receta: 'Brownie' }],
  ]),
  unicas: new Set([BRO]),
  recetas: new Map([
    [
      claveConsumo(IL, 'Chica'),
      [
        { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'LECHE', cantidad: 180 },
        { insumoId: 'cf', insumo: 'CAFÉ', unidad: 'gr', categoria: 'CAFÉ', cantidad: 18 },
      ],
    ],
    [
      claveConsumo(BRO, 'Único'),
      [{ insumoId: 'br', insumo: 'BROWNIE', unidad: 'pza', categoria: 'PANADERIA', cantidad: 1 }],
    ],
  ]),
};
const linea = (defaultCode: string | null, productName: string, customs: string[] = []) => ({
  defaultCode,
  productName,
  amount: 80,
  discount: 0,
  itemsCustom: customs.map((c) => ({ defaultCode: 'X', productName: c, amount: 0, discount: 0 })),
});
const ps = (items: ReturnType<typeof linea>[], fecha = '2026-10-22') =>
  normalizar([pedido(fecha, '10:00:00', { items, grossAmount: 80 * items.length })] as never[], cfg, {
    desde: fecha,
    hasta: fecha,
  }).pedidos;

describe('consumo teórico según receta', () => {
  it('suma cantidades de las unidades completas y explica cada exclusión', () => {
    const p = [
      ...ps([
        linea('5IL', 'Iced Latte', ['Regular - 440ml']),
        linea('5IL', 'Iced Latte', ['Regular - 440ml']),
        linea('5IL', 'Iced Latte', ['Regular - 440ml', 'Oatmilk']), // personalización
        linea('5IL', 'Iced Latte', ['Large - 600ml']), // Large sin cantidades: tamaño sin verificar
        linea('BRO13', 'Brownie'),
        linea('GHC', 'Sandwich'), // sin enlace
        linea('GENERIC', 'Generic'),
      ]),
    ];
    const r = consumir(p, datos, p, undefined, ['2026-10-21', '2026-10-22']);
    expect(r.cobertura).toMatchObject({
      lineas: 7,
      generico: 1,
      identificables: 6,
      sinEnlace: 1,
      conReceta: 5,
      incluidas: 3,
    });
    expect(r.cobertura.excluidas.personalizacion).toBe(1);
    expect(r.cobertura.excluidas.tamano + r.cobertura.excluidas.receta).toBe(1);
    expect(r.cobertura.sobreIdentificable).toBeCloseTo(3 / 6);
    expect(r.insumos.map((i) => [i.insumo, i.cantidad, i.productos])).toEqual([
      ['CAFÉ', 36, 1],
      ['LECHE ENTERA', 360, 1],
      ['BROWNIE', 1, 1],
    ]);
    expect(r.categorias.find((c) => c.categoria === 'LECHE')?.totales).toEqual([
      { unidad: 'ml', cantidad: 360 },
    ]);
    expect(r.productos[0]).toMatchObject({
      receta: 'Iced Latte',
      lineas: 2,
      excluidas: { personalizacion: 1 },
    });
    // Los días sin ventas aparecen en cero (la tendencia no se salta días).
    expect(r.diario.map((d) => [d.fecha, d.incluidas, d.cantidades.le ?? 0])).toEqual([
      ['2026-10-21', 0, 0],
      ['2026-10-22', 3, 360],
    ]);
    // Solo cantidades: nada de dinero.
    expect(JSON.stringify(r)).not.toMatch(/Cent|costo|margen/);
  });

  it('una línea sin código usa la misma identidad que Productos (código único del periodo)', () => {
    const p = ps([linea('BRO13', 'Brownie'), linea(null, 'Brownie')]);
    expect(consumir(p, datos, p).cobertura).toMatchObject({ sinCodigo: 0, incluidas: 2 });
  });

  it('cantidades legibles: kg y L desde mil', () => {
    expect(cantidad(1500, 'ml')).toBe('1.5 L');
    expect(cantidad(360, 'ml')).toBe('360 ml');
    expect(cantidad(2500, 'gr')).toBe('2.5 kg');
    expect(cantidad(4.5, 'pza')).toBe('4.5 pza');
  });
});

describe('periodo compartido', () => {
  it('62 días como máximo predefinido y rango por URL', () => {
    const ahora = new Date('2026-10-28T18:00:00Z');
    expect(rango({ id: '62d' }, 'America/Mexico_City', ahora)).toEqual({
      desde: '2026-08-28',
      hasta: '2026-10-28',
    });
    expect(periodoDeUrl(new URLSearchParams('desde=2026-10-01&hasta=2026-10-07'), 'hoy')).toEqual({
      id: 'rango',
      desde: '2026-10-01',
      hasta: '2026-10-07',
    });
    expect(periodoDeUrl(new URLSearchParams('periodo=x'), 'hoy')).toEqual({ id: 'hoy' });
  });
});

describe('secciones de la sucursal', () => {
  const montar = (id: number, puedeCostear: boolean) =>
    render(
      <SeccionesSucursal
        sucursal={sucursalInfo(configDe(id)!)}
        puedeCostear={puedeCostear}
        seccionInicial="ventas"
        tabInicial="productos"
        origenInicial="todos"
        periodoInicial={{ id: 'hoy' }}
      />,
    );

  it('Costeo solo aparece con permiso; Consumo siempre', () => {
    montar(612, false);
    expect(screen.queryByRole('button', { name: /Costeo/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Consumo/ })).toBeInTheDocument();
  });

  it('GDL sin Rappi en la API: sin pestaña ni filtro de Rappi, y «todos» es Mostrador + App', () => {
    montar(384, true);
    expect(screen.getByText('Sin Rappi en la API')).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'Rappi' })).toBeNull();
    expect(screen.queryByRole('radio', { name: 'Rappi' })).toBeNull();
    expect(screen.getByRole('radio', { name: 'Mostrador + App' })).toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: /Consumo/ }));
    expect(screen.getByRole('button', { name: /Consumo/ })).toHaveAttribute('aria-current', 'page');
    expect(window.location.search).toContain('seccion=consumo');
  });
});
