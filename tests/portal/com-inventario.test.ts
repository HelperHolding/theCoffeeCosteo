import { describe, expect, it } from 'vitest';
import {
  cantidadConteo,
  comprometido,
  filasInventario,
  pegarConteo,
  semaforo,
  tresPlViejo,
  valorInventario,
} from '../../lib/comercializadora/inventario';

const cat = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  categoria: 'Insumos',
  estatus: 'Activo',
  zoho_stock: 12,
  zoho_stock_fisico: 10,
  zoho_sync_at: 'x',
  saldo_cedis: 0,
  saldo_yulius: 5,
  yulius_actualizado_at: '2026-11-01T00:00:00Z',
  costo_unitario: 50,
  zoho_vendor_id: 'v1',
  zoho_vendor_name: 'Prov',
  ...o,
});

describe('inventario (port de renderComInventario)', () => {
  it('semáforo: rojo ≤ mínimo, amarillo ≤ mínimo + 7 × venta, verde; sin min/máx = null', () => {
    const mm = { minimo: 20, venta_diaria: 2 };
    expect(semaforo(15, 5, mm)).toBe('rojo');
    expect(semaforo(30, 0, mm)).toBe('amarillo');
    expect(semaforo(35, 0, mm)).toBe('verde');
    expect(semaforo(1, 0, null)).toBeNull();
  });
  it('comprometido = ventas por enviar por SKU', () => {
    expect(
      comprometido([
        { sku: 'A', cantidad: 3 },
        { sku: 'A', cantidad: 2 },
        { sku: 'B', cantidad: 1 },
      ]),
    ).toEqual({ A: 5, B: 1 });
  });
  it('fila: disponible con 3PL solo si inv.yulius no es false; cobertura redondeada; contable solo con sync', () => {
    const d = {
      catalogo: [cat({}) as never],
      minmax: [{ sku: 'A', minimo: 20, maximo: 40, minimo_manual: null, maximo_manual: 45, venta_diaria: 2 }],
      ventas: [{ sku: 'A', cantidad: 4 }],
      lineas: [{ sku: 'A', status: 'open', cantidad: 9, cantidad_recibida: 0 }],
      yulius: true,
    };
    const [f] = filasInventario(d);
    expect(f).toMatchObject({
      fisico: 10,
      contable: 12,
      comprometido: 4,
      disponible: 15,
      camino: 9,
      minimo: 20,
      maximo: 40,
      maxManual: true,
      minManual: false,
      cobertura: 12,
      estado: 'amarillo',
      tresPl: 5,
    }); // posición 24 ≤ 20 + 7×2
    expect(filasInventario({ ...d, yulius: false })[0].disponible).toBe(10);
    expect(
      filasInventario({ ...d, catalogo: [cat({ zoho_sync_at: null, saldo_cedis: 7 }) as never] })[0],
    ).toMatchObject({ fisico: 7, contable: null });
  });
  it('en camino: pendiente de OCs abiertas (borradores sí), sin cerradas, recibidas ni marcador, con sus folios', () => {
    const lineas = [
      { sku: 'EQ-DEL-001', status: 'open', cantidad: 8, cantidad_recibida: 8, po_number: 'COM-OC-01325' },
      { sku: 'EQ-DEL-001', status: 'open', cantidad: 25, cantidad_recibida: 0, po_number: 'COM-OC-01342' },
      { sku: 'EQ-DEL-001', status: 'Closed', cantidad: 10, cantidad_recibida: 0, po_number: 'COM-OC-01200' },
      { sku: 'EQ-DEL-001', status: 'void', cantidad: 4, cantidad_recibida: 0, po_number: 'COM-OC-01201' },
      { sku: 'B', status: 'draft', cantidad: 6, cantidad_recibida: 1, po_number: 'COM-OC-01350' },
      { sku: 'B', status: 'billed', cantidad: 3, cantidad_recibida: 0, po_number: 'COM-OC-01343' },
      { sku: 'B', status: 'open', cantidad: 2, cantidad_recibida: 0, po_number: 'COM-OC-01343' },
      { sku: '(sin-sku)', status: 'open', cantidad: 5, cantidad_recibida: 0, po_number: 'COM-OC-01342' },
    ];
    const filas = filasInventario({
      catalogo: [cat({ sku: 'EQ-DEL-001' }), cat({ sku: 'B' }), cat({ sku: 'C' })] as never,
      minmax: [],
      ventas: [],
      lineas,
      yulius: true,
    });
    expect(filas.map((f) => [f.sku, f.camino, f.ocsCamino])).toEqual([
      ['EQ-DEL-001', 25, 'COM-OC-01342'],
      ['B', 10, 'COM-OC-01343, COM-OC-01350'],
      ['C', 0, ''],
    ]);
  });
  it('valor del inventario: CEDIS + 3PL siempre, solo activos con costo; cuenta los que tienen stock sin costo', () => {
    expect(
      valorInventario([
        cat({}) as never,
        cat({ sku: 'B', costo_unitario: null }) as never,
        cat({ sku: 'C', estatus: 'Inactivo' }) as never,
      ]),
    ).toEqual({ valor: 750, sinCosto: 1 });
  });
  it('3PL sin actualizar: con saldo y más de 15 días', () => {
    expect(tresPlViejo(cat({}) as never, '2026-11-20')).toBe(true);
    expect(tresPlViejo(cat({}) as never, '2026-11-10')).toBe(false);
    expect(tresPlViejo(cat({ saldo_yulius: 0 }) as never, '2026-12-30')).toBe(false);
  });
});

describe('conteo (port de _planConteoCantidad y _planConteoPegar)', () => {
  it('números al estilo es-MX', () => {
    expect(cantidadConteo('1,200')).toBe(1200);
    expect(cantidadConteo('1,5')).toBe(1.5);
    expect(cantidadConteo('1.200,50')).toBe(1200.5);
    expect(cantidadConteo('12')).toBe(12);
    expect(cantidadConteo('')).toBeNull();
    expect(cantidadConteo('-3')).toBeNull();
    expect(cantidadConteo('abc')).toBeNull();
  });
  it('pegar desde Excel: tab, ; , o espacio; suma repetidos; tolera encabezado', () => {
    expect(pegarConteo('SKU\tCantidad\nA\t3\nB;2\nA 1,5\n\n')).toEqual([
      { sku: 'A', cantidad: 4.5 },
      { sku: 'B', cantidad: 2 },
    ]);
  });
});

describe('revisión final · números del conteo y del ajuste', () => {
  it('punto con tres decimales NO son miles si no hay coma decimal (como _planConteoCantidad)', async () => {
    expect(cantidadConteo('0.250')).toBe(0.25);
    expect(cantidadConteo('12.125')).toBe(12.125);
    expect(cantidadConteo('1.500')).toBe(1.5);
    expect(cantidadConteo('1.200,50')).toBe(1200.5);
  });
  it('sumar/restar: signo aparte, miles con coma, vacío inválido', async () => {
    const { cantidadAjuste } = await import('../../lib/comercializadora/inventario');
    expect(cantidadAjuste('1,200')).toBe(1200);
    expect(cantidadAjuste('-1,200')).toBe(-1200);
    expect(cantidadAjuste('-0.5')).toBe(-0.5);
    expect(cantidadAjuste('')).toBeNull();
    expect(cantidadAjuste('1,200,5')).toBeNull();
  });
});
