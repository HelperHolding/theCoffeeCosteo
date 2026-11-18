// Plan 3e, decisión 3: "Crear OC" de Importaciones y Café prellena el formulario de Órdenes; nada se crea solo.
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

const m = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn(), guardar: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: m.refresh, replace: m.replace }) }));
vi.mock('../../app/(comercializadora)/comercializadora/acciones', () => ({
  guardarOc: m.guardar,
  recibirOc: vi.fn(),
  eliminarOc: vi.fn(),
}));
import { Ordenes } from '../../components/comercializadora/ordenes';
import { enlaceOc, ocCafe, ocImportaciones, prellenadoOc } from '../../lib/comercializadora/crearOc';
import { normalizarCfgMotor } from '../../supabase/functions/_shared/planDatos.ts';
import { impCorrer } from '../../supabase/functions/_shared/planImp.ts';
import { cafeOrdenes } from '../../supabase/functions/_shared/planCafe.ts';
import { datosImp, ZPROV } from '../../supabase/functions/_shared/pruebas/fixturesImp.ts';

const CAT = ['INS-DES-021', 'ins-des-005', 'INS-CAF-002'];
/** Los parámetros como los entrega Next (un valor repetido llega como arreglo). */
const sp = (url: string) => {
  const o: Record<string, string | string[]> = {};
  new URL(url, 'http://x').searchParams.forEach((v, k) => {
    const ya = o[k];
    o[k] = ya === undefined ? v : Array.isArray(ya) ? [...ya, v] : [ya, v];
  });
  return o;
};

describe('prellenado de la OC por la URL', () => {
  it('ida y vuelta: proveedor, líneas, monto y arribo; SKU sin distinguir mayúsculas (se usa el del catálogo)', () => {
    const url = enlaceOc({
      origen: 'Importaciones',
      proveedor: 'Green Packaging & Co',
      lineas: [
        { sku: 'INS-DES-021', cantidad: 120 },
        { sku: 'INS-DES-005', cantidad: 8.5 },
        { sku: 'INS-DES-002', cantidad: 54 },
      ],
      monto: 1234.567,
      arribo: '2027-02-21',
    });
    expect(url.startsWith('/comercializadora/ordenes?nueva=importaciones&')).toBe(true);
    expect(prellenadoOc(sp(url), CAT, '2026-11-13')).toEqual({
      origen: 'Importaciones',
      omitidos: 1,
      folio: '',
      proveedor: 'Green Packaging & Co',
      fecha: '2026-11-13',
      fecha_arribo: '2027-02-21',
      destino: 'CEDIS',
      monto: 1234.57,
      lineas: [
        { sku: 'INS-DES-021', cantidad: 120 },
        { sku: 'ins-des-005', cantidad: 8.5 },
      ],
    });
  });

  it('lista blanca: origen desconocido, sin proveedor o sin líneas válidas no abre nada', () => {
    expect(prellenadoOc({ nueva: 'otro', proveedor: 'X', l: 'INS-DES-021:1' }, CAT, '2026-11-13')).toBeNull();
    expect(
      prellenadoOc({ nueva: 'cafe', proveedor: '  ', l: 'INS-DES-021:1' }, CAT, '2026-11-13'),
    ).toBeNull();
    expect(
      prellenadoOc(
        { nueva: 'cafe', proveedor: 'X', l: ['INS-DES-021:-3', 'INS-DES-021:abc', ':5', 'NO:1'] },
        CAT,
        'h',
      ),
    ).toBeNull();
  });

  it('descarta lo que no sirve: cantidades, repetidos, monto y fecha malos, caracteres de control y más de 60 líneas', () => {
    const r = prellenadoOc(
      {
        nueva: 'cafe',
        proveedor: 'Tostador\u0007 Local',
        l: ['INS-CAF-002:53', 'INS-CAF-002:9', 'INS-DES-021:99999999', 'INS-DES-021:2'],
        monto: '-5',
        arribo: '2027-02-30',
      },
      CAT,
      '2026-11-13',
    );
    expect(r).toMatchObject({
      origen: 'Café',
      proveedor: 'Tostador  Local',
      monto: 0,
      fecha_arribo: '',
      lineas: [
        { sku: 'INS-CAF-002', cantidad: 53 },
        { sku: 'INS-DES-021', cantidad: 2 },
      ],
    });
    const muchos = Array.from({ length: 80 }, (_, i) => `S${i}`);
    const r2 = prellenadoOc({ nueva: 'cafe', proveedor: 'X', l: muchos.map((s) => `${s}:1`) }, muchos, 'h');
    expect(r2?.lineas).toHaveLength(60);
  });
});

describe('qué se prellena desde cada pantalla', () => {
  it('Importaciones: lo de esta semana del proveedor, inversión del modelo y la llegada más tardía', () => {
    const c = impCorrer(datosImp(), normalizarCfgMotor({}));
    const oc = ocImportaciones(c, 'Green Packaging');
    if ('error' in oc) throw new Error(oc.error);
    expect(oc.origen).toBe('Importaciones');
    expect(oc.proveedor).toBe('Green Packaging (vasos y tapas)'); // el primero no está en el catálogo: nombre del plan
    expect(oc.lineas.map((l) => l.sku)).toContain('INS-DES-005');
    expect(oc.arribo).toBe('2027-02-21');
    expect(oc.monto).toBeGreaterThan(0);
    expect(ocImportaciones(c, 'No existe')).toEqual({ error: 'Nada que pedir esta semana a este proveedor' });
  });

  it('Café: la cantidad de hoy; sin costo no hay monto; arribo = hoy + el lead time más largo', () => {
    const c = cafeOrdenes(datosImp({ zprov: ZPROV }), normalizarCfgMotor({}));
    const omac = ocCafe(c, 'caficultores omac');
    if ('error' in omac) throw new Error(omac.error);
    expect(omac).toMatchObject({ origen: 'Café', proveedor: 'CAFICULTORES OMAC', arribo: '2026-11-20' });
    expect(omac.monto).toBe(Math.round(omac.lineas[0].cantidad * 494 * 100) / 100);
    const tost = ocCafe(c, 'tostador local');
    expect('error' in tost ? null : tost.monto).toBeNull();
    expect(ocCafe(c, '__sin__')).toEqual({
      error: 'Asigna un proveedor a estos artículos antes de crear la OC',
    });
  });
});

describe('Órdenes con el formulario prellenado', () => {
  const base = {
    grupos: [],
    proveedores: ['Otro'],
    catalogo: [{ sku: 'INS-CAF-002', nombre: 'Café Kraft' }],
    ultimoSync: null,
    hoy: '2026-11-13',
  };
  const pre = prellenadoOc(
    { nueva: 'cafe', proveedor: 'CAFICULTORES OMAC', l: ['INS-CAF-002:53', 'NO-ESTA:2'], monto: '26182' },
    ['INS-CAF-002'],
    '2026-11-13',
  );

  it('abre la nueva OC con el aviso, el proveedor fijo y las líneas; al guardar no manda origen', async () => {
    m.guardar.mockResolvedValue({ ok: true });
    render(<Ordenes {...base} editable prellenado={pre} />);
    const aviso = screen.getByText(/Revisa cantidades, proveedor y SKUs/);
    expect(aviso.textContent).toContain('1 artículo sugerido por Café para CAFICULTORES OMAC');
    expect(aviso.textContent).toContain('1 artículo no está en el catálogo');
    expect(screen.getByText('sugerido por Café, no editable')).toBeTruthy();
    expect((screen.getByLabelText('Cantidad 1') as HTMLInputElement).value).toBe('53');
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'OC-77' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.guardar).toHaveBeenCalled());
    expect(m.guardar.mock.calls[0][0]).toEqual({
      folio: 'OC-77',
      proveedor: 'CAFICULTORES OMAC',
      fecha: '2026-11-13',
      fecha_arribo: '',
      destino: 'CEDIS',
      monto: 26182,
      lineas: [{ sku: 'INS-CAF-002', cantidad: 53 }],
    });
  });

  it('revisión 3e (I3): al guardar o cerrar la OC sugerida, la URL pierde el prellenado (recargar no la vuelve a abrir)', async () => {
    m.guardar.mockResolvedValue({ ok: true });
    m.replace.mockClear();
    const { unmount } = render(<Ordenes {...base} editable prellenado={pre} />);
    fireEvent.change(screen.getAllByRole('textbox')[0], { target: { value: 'OC-78' } });
    fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(m.replace).toHaveBeenCalledWith('/comercializadora/ordenes'));
    unmount();
    m.replace.mockClear();
    render(<Ordenes {...base} editable prellenado={pre} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar' }));
    expect(m.replace).toHaveBeenCalledWith('/comercializadora/ordenes');
  });

  it('solo lectura: no abre el formulario', () => {
    render(<Ordenes {...base} editable={false} prellenado={pre} />);
    expect(screen.queryByText('Nueva orden de compra')).toBeNull();
  });
});
