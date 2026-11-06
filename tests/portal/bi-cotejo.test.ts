import { describe, expect, it } from 'vitest';
import { aCsv, totalesPorDia } from '@/lib/bi/cotejo';

const tiendas = [
  { company_id: 384, store_id: 1, nombre: 'Roma' },
  { company_id: 532, store_id: 2, nombre: 'Condesa' },
];
const mapeo = [{ metodo_pos: 'Tarjeta', tipo_pos: 'credito', smartphone: false, etiqueta: 'Tarjeta crédito' }];
const base = { fuente: 'pos', canal: 'Mostrador', metodo_pago: 'Tarjeta', tipo_pago: 'credito', smartphone: false };

describe('totalesPorDia', () => {
  it('agrupa por tienda, fecha, fuente, canal y pago; sin mapear cae al método crudo', () => {
    const r = totalesPorDia(
      [
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 1000 },
        { ...base, company_id: 384, fecha: '2026-10-02', pedido: 'B', importe_cent: 500 },
        { ...base, company_id: 532, fecha: '2026-10-01', pedido: 'C', importe_cent: 700, metodo_pago: 'Efectivo', tipo_pago: '' },
      ],
      mapeo,
      tiendas,
    );
    expect(r).toHaveLength(3);
    const roma1 = r.find((f) => f.company_id === 384 && f.fecha === '2026-10-01')!;
    expect(roma1).toMatchObject({ store_id: 1, nombre: 'Roma', etiqueta_pago: 'Tarjeta crédito', venta_cent: 1000 });
    expect(r.find((f) => f.company_id === 532)!.etiqueta_pago).toBe('Efectivo');
  });

  it('resuelve la etiqueta de pago por la vigencia en la fecha de la línea', () => {
    const w = { fuente: 'pos', canal: 'app', metodo_pago: 'WALLET_BALANCE', tipo_pago: 'WALLET', smartphone: true, company_id: 384 };
    const vigencias = [
      { metodo_pos: 'WALLET_BALANCE', tipo_pos: 'WALLET', smartphone: true, etiqueta: 'APP - WALLET', vigente_desde: '2026-03-01', vigente_hasta: null },
      { metodo_pos: 'WALLET_BALANCE', tipo_pos: 'WALLET', smartphone: true, etiqueta: 'WALLET', vigente_desde: '2000-01-01', vigente_hasta: '2026-02-28' },
    ];
    const r = totalesPorDia(
      [
        { ...w, fecha: '2026-02-28', pedido: 'A', importe_cent: 1000 },
        { ...w, fecha: '2026-03-01', pedido: 'B', importe_cent: 1000 },
      ],
      vigencias,
      tiendas,
    );
    expect(r.map((f) => [f.fecha, f.etiqueta_pago])).toEqual([
      ['2026-02-28', 'WALLET'],
      ['2026-03-01', 'APP - WALLET'],
    ]);
  });

  it('cuenta pedidos distintos como tickets y todas las filas como líneas', () => {
    const r = totalesPorDia(
      [
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 100 },
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 200 },
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'B', importe_cent: 300 },
      ],
      mapeo,
      tiendas,
    );
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ venta_cent: 600, tickets: 2, lineas: 3 });
  });

  it('separa fuentes distintas', () => {
    const r = totalesPorDia(
      [
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 100 },
        { ...base, fuente: 'zoho', company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 100 },
      ],
      mapeo,
      tiendas,
    );
    expect(r.map((f) => f.fuente).sort()).toEqual(['pos', 'zoho']);
  });
});

describe('totalesPorDia, neto y bruto', () => {
  it('venta_cent suma el neto (coalesce al bruto) y venta_bruta_cent lo cobrado', () => {
    const r = totalesPorDia(
      [
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'A', importe_cent: 1000, importe_neto_cent: 970 },
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'B', importe_cent: 500, importe_neto_cent: null },
        { ...base, company_id: 384, fecha: '2026-10-01', pedido: 'C', importe_cent: 200 },
      ],
      mapeo,
      tiendas,
    );
    expect(r[0]).toMatchObject({ venta_cent: 970 + 500 + 200, venta_bruta_cent: 1700 });
  });
});

describe('aCsv', () => {
  it('escapa comas y comillas', () => {
    const csv = aCsv([
      { company_id: 1, store_id: 2, nombre: 'Roma, "Norte"', fecha: '2026-10-01', fuente: 'pos', canal: 'M', etiqueta_pago: 'x', venta_cent: 5, venta_bruta_cent: 6, tickets: 1, lineas: 1 },
    ]);
    const [cab, fila] = csv.trim().split('\n');
    expect(cab).toBe('company_id,store_id,nombre,fecha,fuente,canal,etiqueta_pago,venta_cent,venta_bruta_cent,tickets,lineas');
    expect(fila).toBe('1,2,"Roma, ""Norte""",2026-10-01,pos,M,x,5,6,1,1');
  });
});
