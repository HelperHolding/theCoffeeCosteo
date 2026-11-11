import { describe, expect, it } from 'vitest';
import { armar } from '../../lib/areas/armar';
import { Catalogo } from '../../lib/areas/catalogo';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';

const linea = (codigo: string, importeCent: number, extra: Partial<LineaNormal> = {}): LineaNormal => ({
  codigo,
  nombre: `Producto ${codigo}`,
  importeCent,
  descuentoPct: 0,
  customs: [],
  ...extra,
});
let id = 1;
const pedido = (fecha: string, segundo: number, extra: Partial<PedidoNormal> = {}): PedidoNormal => ({
  id: id++,
  fecha,
  segundo,
  hora: new Date(segundo * 1000).toISOString().slice(11, 19),
  origen: 'mostrador',
  ventaCent: 6000,
  netoCent: null,
  descuentoCent: 0,
  metodo: 'DINHEIRO',
  tipo: 'CASH',
  lineas: [linea('LAT', 6000)],
  numeroPedidoRappi: null,
  cuadra: true,
  ...extra,
});

describe('armar', () => {
  it('tickets en orden, un arqueo por día y resumen por día', () => {
    const e = armar(
      [pedido('2026-11-10', 30000), pedido('2026-11-09', 50000), pedido('2026-11-09', 40000)],
      new Catalogo(),
      ['Rubén Darío'],
    );
    expect(e.tickets.map((t) => t.Cabecera.MOM_OPE)).toEqual([
      '2026-11-09 11:06:40',
      '2026-11-09 13:53:20',
      '2026-11-10 08:20:00',
    ]);
    expect(e.arqueos.map((a) => [a.Fecha, a.Hora, a.Monto])).toEqual([
      ['2026-11-09', '2026-11-09T13:53:20', 120],
      ['2026-11-10', '2026-11-10T08:20:00', 60],
    ]);
    expect(e.dias).toEqual([
      { fecha: '2026-11-09', leidos: 2, validos: 2, descartados: 0, monto: 120 },
      { fecha: '2026-11-10', leidos: 1, validos: 1, descartados: 0, monto: 60 },
    ]);
    expect(e.vendidos).toEqual([1001]);
  });

  it('los descartados no cuentan en el arqueo y salen con su motivo', () => {
    const e = armar(
      [pedido('2026-11-09', 40000), pedido('2026-11-09', 41000, { metodo: 'IFOOD', tipo: 'X' })],
      new Catalogo(),
      [],
    );
    expect(e.arqueos[0].Monto).toBe(60);
    expect(e.descartados).toEqual([
      {
        id: expect.any(Number),
        fecha: '2026-11-09',
        hora: '11:23:20',
        motivo: 'Forma de pago sin mapeo: IFOOD / X',
      },
    ]);
    expect(e.dias[0]).toMatchObject({ leidos: 2, validos: 1, descartados: 1 });
  });

  it('un día solo con descartados no tiene arqueo pero sí aparece en el resumen', () => {
    const e = armar([pedido('2026-11-09', 40000, { lineas: [] })], new Catalogo(), []);
    expect(e.arqueos).toEqual([]);
    expect(e.dias).toEqual([{ fecha: '2026-11-09', leidos: 1, validos: 0, descartados: 1, monto: 0 }]);
  });

  it('un recargo (descuento negativo) descarta el ticket con motivo, sin tronar', () => {
    // −10% → PRE_UNI $54.55 < cobrado $60: las líneas suman menos que lo cobrado.
    const e = armar(
      [pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { descuentoPct: -10 })] })],
      new Catalogo(),
      [],
    );
    expect(e.tickets).toEqual([]);
    expect(e.descartados).toHaveLength(1);
    expect(e.descartados[0].motivo).toMatch(/menos que lo cobrado/);
  });

  it('un nombre de producto con el nombre de la tienda descarta el ticket por anonimato', () => {
    const e = armar(
      [pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { nombre: 'Latte Rubén Darío' })] })],
      new Catalogo(),
      ['Rubén Darío'],
    );
    expect(e.descartados[0].motivo).toMatch(/Anonimato/);
  });

  it('fija el precio del catálogo con el PRE_UNI más frecuente', () => {
    const cat = new Catalogo();
    armar(
      [
        pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000)] }),
        pedido('2026-11-09', 40100, { lineas: [linea('LAT', 6500)], ventaCent: 6500 }),
        pedido('2026-11-09', 40200, { lineas: [linea('LAT', 6500)], ventaCent: 6500 }),
      ],
      cat,
      [],
    );
    expect(cat.precioDe('LAT')).toBe(65);
  });
});

describe('armar · hallazgos de la revisión', () => {
  it('un descarte por anonimato no deja el nombre en el motivo ni toca el catálogo', () => {
    const cat = new Catalogo([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 60 }]);
    const e = armar(
      [
        pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { nombre: 'Latte Rubén Darío' })] }),
        pedido('2026-11-09', 40100, { lineas: [linea('NUEVO', 6000, { nombre: 'Nuevo Ruben Dario' })] }),
      ],
      cat,
      ['Rubén Darío'],
    );
    expect(e.descartados).toHaveLength(2);
    for (const d of e.descartados) expect(d.motivo).not.toMatch(/rub[eé]n|dar[ií]o/i);
    expect(cat.nuevos()).toEqual([]);
    expect(cat.lista()).toEqual([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 60 }]);
  });

  it('un ticket descartado por validación no asigna códigos', () => {
    const cat = new Catalogo();
    armar([pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { descuentoPct: -10 })] })], cat, []);
    expect(cat.nuevos()).toEqual([]);
  });

  it('una línea al 100% usa el precio de lista visto en la misma corrida aunque el catálogo esté vacío', () => {
    const cat = new Catalogo();
    const e = armar(
      [
        pedido('2026-11-09', 40000, { lineas: [linea('LAT', 0, { descuentoPct: 100 })], ventaCent: 0 }),
        pedido('2026-11-09', 40100, { lineas: [linea('LAT', 6000)] }),
      ],
      cat,
      [],
    );
    expect(e.tickets[0].Detalles[0]).toMatchObject({ PRE_FIN: 60, IMP_DTO: 60 });
    expect(cat.precioDe('LAT')).toBe(60);
  });
});

describe('armar · personalizaciones', () => {
  it('una personalización al 100% toma el precio de lista visto en la misma corrida', () => {
    const avena = (importeCent: number, descuentoPct: number) => ({
      codigo: 'LVG',
      nombre: 'Oatmilk',
      importeCent,
      descuentoPct,
    });
    const e = armar(
      [
        pedido('2026-11-09', 40000, { lineas: [linea('LAT', 6000, { customs: [avena(0, 100)] })] }),
        pedido('2026-11-09', 40100, {
          lineas: [linea('LAT', 6000, { customs: [avena(1300, 0)] })],
          ventaCent: 7300,
        }),
      ],
      new Catalogo(),
      [],
    );
    expect(e.tickets[0].Detalles[1]).toMatchObject({ DES_ART: 'Oatmilk', PRE_FIN: 13, IMP_DTO: 13 });
    expect(e.arqueos[0].Monto).toBe(133);
  });
});

describe('armar · sin Rappi', () => {
  it('los pedidos de Rappi no se mandan ni cuentan en el resumen: solo se reportan como excluidos', () => {
    const e = armar(
      [
        pedido('2026-11-09', 40000),
        pedido('2026-11-09', 40100, {
          origen: 'rappi',
          metodo: 'RAPPI',
          tipo: 'CREDIT',
          ventaCent: 9900,
          lineas: [linea('LAT', 9900)],
        }),
        pedido('2026-11-10', 40200, {
          origen: 'rappi',
          metodo: 'RAPPI',
          tipo: 'RAPPI_PORTAL',
          ventaCent: 5000,
          lineas: [linea('X', 5000)],
        }),
      ],
      new Catalogo(),
      [],
    );
    expect(e.tickets).toHaveLength(1);
    expect(e.descartados).toEqual([]);
    expect(e.dias).toEqual([{ fecha: '2026-11-09', leidos: 1, validos: 1, descartados: 0, monto: 60 }]);
    expect(e.arqueos.map((a) => a.Monto)).toEqual([60]);
    expect(e.rappiExcluidos).toBe(2);
  });
});
