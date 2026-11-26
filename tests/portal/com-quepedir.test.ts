import { describe, expect, it } from 'vitest';
import {
  enCamino,
  filasQuePedir,
  kpisQuePedir,
  FILTRO_QUE_PEDIR,
  leadTimePorSku,
  ocsEnCamino,
  llegadaEnCamino,
  ordenQuePedir,
  proveedoresQuePedir,
  saldoCedis,
  type DatosQuePedir,
} from '../../lib/comercializadora/quepedir';
import { aCsv } from '../../lib/comercializadora/formato';

const cat = (o: Record<string, unknown>) => ({
  sku: 'A',
  nombre: 'Café',
  zoho_stock: 10,
  zoho_stock_fisico: null,
  zoho_sync_at: '2026-11-12T10:00:00Z',
  saldo_cedis: 99,
  saldo_yulius: 0,
  costo_unitario: 50,
  zoho_vendor_id: 'v1',
  zoho_vendor_name: 'Prov 1',
  ...o,
});

describe('saldoCedis (_comSaldoCedis)', () => {
  it('sin sync de Zoho usa saldo_cedis; con sync prefiere el físico y si no el contable', () => {
    expect(saldoCedis(cat({ zoho_sync_at: null }) as never)).toBe(99);
    expect(saldoCedis(cat({ zoho_stock_fisico: 7 }) as never)).toBe(7);
    expect(saldoCedis(cat({}) as never)).toBe(10);
  });
});

describe('enCamino', () => {
  it('suma lo pendiente de OCs abiertas e ignora cerradas, canceladas, void y (sin-sku)', () => {
    expect(
      enCamino([
        { sku: 'A', status: 'open', cantidad: 10, cantidad_recibida: 4 },
        { sku: 'A', status: 'partially_received', cantidad: 5, cantidad_recibida: 0 },
        { sku: 'A', status: 'Closed', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'B', status: 'cancelled', cantidad: 9, cantidad_recibida: 0 },
        { sku: '(sin-sku)', status: 'open', cantidad: 9, cantidad_recibida: 0 },
        { sku: 'C', status: 'open', cantidad: 3, cantidad_recibida: 5 },
      ]),
    ).toEqual({ A: 11 });
  });
  it('con sinFacturadas deja fuera las OCs "billed": sus piezas ya están en el contable', () => {
    const lineas = [
      { sku: 'A', status: 'open', cantidad: 10, cantidad_recibida: 4 },
      { sku: 'A', status: 'Billed', cantidad: 8, cantidad_recibida: 0 },
    ];
    expect(enCamino(lineas)).toEqual({ A: 14 });
    expect(enCamino(lineas, { sinFacturadas: true })).toEqual({ A: 6 });
  });
});

const datos = (o: Partial<DatosQuePedir> = {}): DatosQuePedir => ({
  catalogo: [
    cat({}) as never,
    cat({ sku: 'B', costo_unitario: null, zoho_vendor_id: null, zoho_vendor_name: null }) as never,
  ],
  minmax: [
    { sku: 'A', venta_diaria: 2 },
    { sku: 'B', venta_diaria: 0 },
  ],
  compras: [
    {
      sku: 'A',
      fecha_oc: '2026-11-12',
      cantidad: 5,
      monto: 250,
      adelanto_cierre: true,
      cierre_tarde: false,
      adelanto_minimo: false,
      bajo_minimo: false,
    },
    { sku: 'A', fecha_oc: '2026-12-30', cantidad: 9, monto: 450 },
  ],
  camino: { A: 3 },
  yulius: true,
  resumen: { sinCosto: ['B'], sinProveedor: [] },
  ...o,
});

describe('filasQuePedir (_qpFilas)', () => {
  it('una fila por SKU del mín/máx, con compras dentro del horizonte (las vencidas cuentan)', () => {
    const [a, b] = filasQuePedir(datos(), 15, '2026-11-13');
    expect(a).toMatchObject({
      sku: 'A',
      inventario: 10,
      camino: 3,
      venta: 2,
      dias: 5,
      pedir: true,
      cant: 5,
      monto: 250,
      veces: 1,
      adelanto: true,
      costo: 50,
    });
    expect(b).toMatchObject({
      sku: 'B',
      dias: null,
      pedir: false,
      costo: null,
      vendor: '(sin proveedor)',
      nota: 'sin costo',
    });
  });
  it('el inventario es el contable de Zoho, aunque haya físico', () => {
    const d = datos({
      catalogo: [cat({ zoho_stock: 6, zoho_stock_fisico: 40 }) as never],
      minmax: [{ sku: 'A', venta_diaria: 2 }],
    });
    const [f] = filasQuePedir({ ...d, yulius: false }, 7, '2026-11-13');
    expect(f.inventario).toBe(6);
    expect(f.dias).toBe(3);
    expect(f.fisico).toBe(40); // solo informativo
    expect(filasQuePedir(datos(), 7, '2026-11-13')[0].fisico).toBeNull();
  });
  it('suma saldo de 3PL solo con inv.yulius', () => {
    const d = datos({
      catalogo: [cat({ saldo_yulius: 4 }) as never],
      minmax: [{ sku: 'A', venta_diaria: 1 }],
    });
    expect(filasQuePedir(d, 7, '2026-11-13')[0].inventario).toBe(14);
    expect(filasQuePedir({ ...d, yulius: false }, 7, '2026-11-13')[0].inventario).toBe(10);
  });
});

describe('proveedoresQuePedir (_qpProveedores)', () => {
  it('agrupa en pesos (no suma piezas de artículos distintos) y guarda el día más corto', () => {
    const filas = filasQuePedir(datos(), 15, '2026-11-13');
    const [p] = proveedoresQuePedir(filas).filter((x) => x.vendor === 'v1');
    expect(p).toMatchObject({
      aPedir: 1,
      piezas: 5,
      monto: 250,
      valor: 500,
      ventaValor: 100,
      dias: 5,
      diasMin: 5,
      pedir: true,
    });
  });
});

describe('orden y KPIs', () => {
  it('primero lo que hay que pedir, luego menos días; sin venta al final', () => {
    const f = [
      { pedir: false, dias: 1, sku: 'X' },
      { pedir: true, dias: null, sku: 'Y' },
      { pedir: true, dias: 3, sku: 'Z' },
    ] as never[];
    expect([...f].sort(ordenQuePedir).map((x: { sku: string }) => x.sku)).toEqual(['Z', 'Y', 'X']);
  });
  it('KPIs: artículos, monto, proveedores con pedido y artículos con menos de N días', () => {
    const k = kpisQuePedir(filasQuePedir(datos(), 15, '2026-11-13'), 7);
    expect(k).toEqual({ articulos: 1, monto: 250, proveedores: 1, cortos: 1 });
  });
});

describe('aCsv', () => {
  it('escapa comillas, comas y saltos, con BOM para Excel', () => {
    const t = aCsv(
      [{ a: 'x,"y"', b: 2 }],
      [
        ['a', 'A'],
        ['b', 'B'],
      ],
    );
    expect(t).toBe('﻿A,B\r\n"x,""y""",2\r\n');
  });
});

describe('llegada de lo en camino (pedido del usuario 2026-11-25)', () => {
  const lt = leadTimePorSku(
    [
      { sku: 'A', zoho_lead_time: 10 },
      { sku: 'B', zoho_lead_time: null },
      { sku: 'C', zoho_lead_time: 0 },
    ] as never,
    [{ sku: 'B', dias: 20 }],
    7,
  );
  it('lead time: el de Zoho, si no el de la tabla, si no el de Configuración', () => {
    expect([lt('A'), lt('B'), lt('C'), lt('Z')]).toEqual([10, 20, 7, 7]);
  });
  it('usa la fecha de entrega de Zoho; si no hay, fecha de la OC + lead time (estimada)', () => {
    const r = llegadaEnCamino(
      [
        {
          zoho_po_id: 'p1',
          po_number: 'OC-1',
          sku: 'A',
          status: 'open',
          cantidad: 5,
          cantidad_recibida: 0,
          fecha_oc: '2026-11-20',
          fecha_entrega: '2026-12-01',
        },
        {
          zoho_po_id: 'p2',
          po_number: 'OC-2',
          sku: 'B',
          status: 'draft',
          cantidad: 5,
          cantidad_recibida: 0,
          fecha_oc: '2026-11-20',
          fecha_entrega: null,
        },
      ],
      lt,
      '2026-11-25',
    );
    expect(r.A).toEqual({ fecha: '2026-12-01', estimada: false, atrasada: false, mas: 0 });
    expect(r.B).toEqual({ fecha: '2026-12-10', estimada: true, atrasada: false, mas: 0 });
  });
  it('con varias OCs toma la más próxima y cuenta las demás; marca atrasada si ya pasó', () => {
    const r = llegadaEnCamino(
      [
        {
          zoho_po_id: 'p1',
          sku: 'A',
          status: 'open',
          cantidad: 5,
          cantidad_recibida: 0,
          fecha_oc: '2026-11-01',
        },
        {
          zoho_po_id: 'p2',
          sku: 'A',
          status: 'open',
          cantidad: 5,
          cantidad_recibida: 0,
          fecha_oc: '2026-11-20',
        },
        {
          zoho_po_id: 'p3',
          sku: 'A',
          status: 'open',
          cantidad: 5,
          cantidad_recibida: 5,
          fecha_oc: '2026-10-01',
        },
      ],
      lt,
      '2026-11-25',
    );
    expect(r.A).toEqual({ fecha: '2026-11-11', estimada: true, atrasada: true, mas: 1 });
  });
  it('ignora cerradas, el marcador, sin fecha y (si se pide) las facturadas', () => {
    const lineas = [
      {
        zoho_po_id: 'p1',
        sku: 'A',
        status: 'closed',
        cantidad: 5,
        cantidad_recibida: 0,
        fecha_oc: '2026-11-20',
      },
      {
        zoho_po_id: 'p2',
        sku: '(sin-sku)',
        status: 'open',
        cantidad: 5,
        cantidad_recibida: 0,
        fecha_oc: '2026-11-20',
      },
      { zoho_po_id: 'p3', sku: 'B', status: 'open', cantidad: 5, cantidad_recibida: 0, fecha_oc: null },
      {
        zoho_po_id: 'p4',
        sku: 'C',
        status: 'billed',
        cantidad: 5,
        cantidad_recibida: 0,
        fecha_oc: '2026-11-20',
      },
    ];
    expect(Object.keys(llegadaEnCamino(lineas, lt, '2026-11-25'))).toEqual(['C']);
    expect(llegadaEnCamino(lineas, lt, '2026-11-25', { sinFacturadas: true })).toEqual({});
  });
  it('Qué pedir: la fila lleva la llegada de su SKU', () => {
    const d = {
      catalogo: [{ sku: 'A', nombre: 'A' }],
      minmax: [{ sku: 'A', venta_diaria: 1 }],
      compras: [],
      camino: { A: 5 },
      llegadas: { A: { fecha: '2026-12-01', estimada: true, atrasada: false, mas: 0 } },
      yulius: false,
      resumen: {},
    } as unknown as DatosQuePedir;
    expect(filasQuePedir(d, 30, '2026-11-25')[0].llegada).toEqual({
      fecha: '2026-12-01',
      estimada: true,
      atrasada: false,
      mas: 0,
    });
  });
});

describe('en camino sin borradores y en borrador aparte (pedido del usuario 2026-11-26)', () => {
  const lineas = [
    {
      sku: 'A',
      status: 'draft',
      cantidad: 10,
      cantidad_recibida: 0,
      po_number: 'OC-1',
      fecha_oc: '2026-11-20',
    },
    {
      sku: 'A',
      status: 'open',
      cantidad: 5,
      cantidad_recibida: 0,
      po_number: 'OC-2',
      fecha_oc: '2026-11-24',
    },
    {
      sku: 'A',
      status: 'partially_received',
      cantidad: 8,
      cantidad_recibida: 2,
      po_number: 'OC-3',
      fecha_oc: '2026-11-10',
    },
    {
      sku: 'A',
      status: 'billed',
      cantidad: 4,
      cantidad_recibida: 0,
      po_number: 'OC-4',
      fecha_oc: '2026-11-15',
    },
    {
      sku: 'B',
      status: 'draft',
      cantidad: 7,
      cantidad_recibida: 0,
      po_number: 'OC-5',
      fecha_oc: '2026-11-20',
    },
  ];
  it('en camino: emitidas, parcialmente recibidas y facturadas; en borrador: solo borradores', () => {
    expect(enCamino(lineas, { sinBorradores: true })).toEqual({ A: 15 });
    expect(enCamino(lineas, { soloBorradores: true })).toEqual({ A: 10, B: 7 });
    expect(enCamino(lineas)).toEqual({ A: 25, B: 7 });
  });
  it('folios separados igual', () => {
    expect(ocsEnCamino(lineas, { sinBorradores: true })).toEqual({ A: ['OC-2', 'OC-3', 'OC-4'] });
    expect(ocsEnCamino(lineas, { soloBorradores: true })).toEqual({ A: ['OC-1'], B: ['OC-5'] });
  });
  it('la llegada solo mira lo en camino (sin borradores)', () => {
    const r = llegadaEnCamino(lineas, () => 7, '2026-11-26', { sinBorradores: true });
    expect(Object.keys(r)).toEqual(['A']);
    expect(r.A.fecha).toBe('2026-11-17');
  });
});

describe('Qué pedir: en camino sin borradores (pedido del usuario 2026-11-26)', () => {
  it('cuenta emitidas y parcialmente recibidas; deja fuera borradores y facturadas (ya están en el contable)', () => {
    const lineas = [
      { sku: 'A', status: 'draft', cantidad: 10, cantidad_recibida: 0 },
      { sku: 'A', status: 'open', cantidad: 5, cantidad_recibida: 0 },
      { sku: 'A', status: 'partially_received', cantidad: 8, cantidad_recibida: 2 },
      { sku: 'A', status: 'billed', cantidad: 4, cantidad_recibida: 0 },
    ];
    expect(FILTRO_QUE_PEDIR).toEqual({ sinFacturadas: true, sinBorradores: true });
    expect(enCamino(lineas, FILTRO_QUE_PEDIR)).toEqual({ A: 11 });
  });
});
