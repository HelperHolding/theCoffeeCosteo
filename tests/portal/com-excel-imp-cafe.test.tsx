// Plan 3e, decisión 2: "Exportar Excel" de Importaciones (7 hojas) y Café (4 hojas), como el sitio viejo.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as XLSX from 'xlsx';

const x = vi.hoisted(() => ({ writeFile: vi.fn(), fallar: false }));
vi.mock('xlsx', async (original) => {
  const real = await original<typeof import('xlsx')>();
  return {
    ...real,
    utils: real.utils,
    writeFile: (...a: unknown[]) => {
      if (x.fallar) throw new Error('sin librería');
      x.writeFile(...a);
    },
  };
});
import { DescargarExcel } from '../../components/comercializadora/descargar-excel';
import { filasParametros, libroCafe, libroImportaciones } from '../../lib/comercializadora/excelImpCafe';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeCorrer } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const imp = impCorrer(datosImp(), normalizarCfgMotor({}), 'Pesimista');
const cafe = cafeCorrer(datosImp(), normalizarCfgMotor({}), 'Optimista');

describe('libros de Excel', () => {
  it('Importaciones: siete hojas en el orden del viejo, con sus columnas', () => {
    const l = libroImportaciones(imp)!;
    expect(l.archivo).toBe('Importaciones_2026-11-13.xlsx');
    expect(l.hojas.map((h) => h.nombre)).toEqual([
      'Qué pedir',
      'Contenedores',
      'Cantidades por contenedor',
      'Proyección mensual',
      'Compra puente',
      'Aperturas consideradas',
      'Parámetros',
    ]);
    expect(l.hojas[0].filas).toHaveLength(imp.S.productos.length);
    expect(Object.keys(l.hojas[0].filas[0]).slice(0, 5)).toEqual([
      'SKU',
      'Artículo',
      'Proveedor',
      'Unidad',
      'Inventario',
    ]);
    expect(l.hojas[3].filas).toHaveLength(15);
    expect(l.hojas[5].filas).toHaveLength(15);
    const par = l.hojas[6].filas.map((f) => f['Parámetro']);
    expect(par).toContain('imp.escenario');
    expect(par.some((k) => String(k).startsWith('imp.items.'))).toBe(false);
  });

  it('Café: cuatro hojas y el nombre con año y escenario', () => {
    const l = libroCafe(cafe)!;
    expect(l.archivo).toBe('Cafe_2027_Optimista.xlsx');
    expect(l.hojas.map((h) => [h.nombre, h.filas.length > 0])).toEqual([
      ['Kg por mes', true],
      ['Presentaciones', true],
      ['Ahorro por mes', true],
      ['Parámetros', true],
    ]);
    expect(l.hojas[0].filas).toHaveLength(12);
  });

  it('sin cálculo no hay libro; los parámetros aplanan listas y escriben las de objetos como JSON', () => {
    expect(libroImportaciones({ ...imp, S: null })).toBeNull();
    expect(libroCafe({ ...cafe, R: null })).toBeNull();
    expect(filasParametros('imp', { b: [1, 2], a: [{ k: 1 }], c: { d: true } })).toEqual([
      { Parámetro: 'imp.a', Valor: '[{"k":1}]' },
      { Parámetro: 'imp.b.0', Valor: 1 },
      { Parámetro: 'imp.b.1', Valor: 2 },
      { Parámetro: 'imp.c.d', Valor: true },
    ]);
  });

  it('el .xlsx que arma SheetJS se vuelve a leer con las mismas hojas y valores', () => {
    const l = libroImportaciones(imp)!;
    const wb = XLSX.utils.book_new();
    for (const h of l.hojas) XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(h.filas), h.nombre);
    const leido = XLSX.read(XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }), { type: 'buffer' });
    expect(leido.SheetNames).toEqual(l.hojas.map((h) => h.nombre));
    const filas = XLSX.utils.sheet_to_json<Record<string, unknown>>(leido.Sheets['Qué pedir']);
    expect(filas[0].SKU).toBe(imp.S.productos[0].sku);
  });
});

describe('botón Exportar Excel', () => {
  it('escribe el archivo con el nombre del libro', async () => {
    render(<DescargarExcel libro={libroCafe(cafe)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    await waitFor(() => expect(x.writeFile).toHaveBeenCalled());
    expect(x.writeFile.mock.calls[0][1]).toBe('Cafe_2027_Optimista.xlsx');
    expect(x.writeFile.mock.calls[0][0].SheetNames).toHaveLength(4);
  });

  it('si la librería falla, lo dice; sin libro no hay botón', async () => {
    x.fallar = true;
    const { unmount } = render(<DescargarExcel libro={libroCafe(cafe)} />);
    fireEvent.click(screen.getByRole('button', { name: 'Exportar Excel' }));
    expect(await screen.findByRole('alert')).toBeTruthy();
    unmount();
    render(<DescargarExcel libro={null} />);
    expect(screen.queryByRole('button')).toBeNull();
  });
});
