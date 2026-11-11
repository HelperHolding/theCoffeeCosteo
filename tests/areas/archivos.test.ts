import { describe, expect, it } from 'vitest';
import { filasArticulos, filasPagos, reporte } from '../../lib/areas/archivos';
import type { Exportacion } from '../../lib/areas/armar';

describe('filasArticulos', () => {
  it('formato «Carga Art TPVs Externos»: encabezado, columnas y una fila por artículo', () => {
    expect(filasArticulos([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 65 }])).toEqual([
      ['TIPO DE SOLICITUD', null, 'A', 'ALTA DE CODIGOS', null, null, 'COMENTARIOS'],
      [null, null, null, null, null, null, 'ALTA DE CODIGOS. ASOCIAR A GAMA Y TARIFA DE PRECIO.'],
      ['CÓDIGO', 'DESCRIPCIÓN', 'CODIGO DE FAMILIA 3', 'FAMILIA 3', 'IVA', 'TIPO', 'PRECIO VENTA'],
      [1001, 'Latte', null, null, '16%', null, 65],
    ]);
  });
});

describe('filasPagos', () => {
  it('formato «Formas de Pago y Monedas»: solo columnas A y B; Areas llena el resto', () => {
    expect(filasPagos()).toEqual([
      ['CODFPTPVEXT', 'DESCFPTPVEXT', 'CODFPAREAS', 'DESCFAREAS', 'FechaRegistro'],
      [101, 'Efectivo', null, null, null],
      [102, 'Tarjeta', null, null, null],
      [103, 'App - Tarjeta', null, null, null],
      [104, 'App - Saldo', null, null, null],
    ]);
  });
});

describe('reporte', () => {
  const e: Exportacion = {
    tickets: [],
    arqueos: [],
    vendidos: [1001],
    rappiExcluidos: 0,
    dias: [{ fecha: '2026-11-09', leidos: 3, validos: 2, descartados: 1, monto: 120 }],
    descartados: [
      { id: 7, fecha: '2026-11-09', hora: '10:00:00', motivo: 'Forma de pago sin mapeo: IFOOD / X' },
    ],
  };
  it('lectura parcial va arriba como advertencia', () => {
    const r = reporte(e, {
      desde: '2026-11-09',
      hasta: '2026-11-09',
      estado: 'parcial',
      avisos: ['1 de 1 días con lectura incompleta.'],
      nuevos: [],
    });
    expect(r.split('\n').slice(0, 4).join('\n')).toMatch(/INCOMPLETA/);
    expect(r).toMatch(/1 de 1 días con lectura incompleta/);
  });
  it('tabla por día, descartados, pagos sin mapeo y artículos nuevos', () => {
    const r = reporte(e, {
      desde: '2026-11-09',
      hasta: '2026-11-09',
      estado: 'completa',
      avisos: [],
      nuevos: [{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 60 }],
    });
    expect(r).not.toMatch(/INCOMPLETA/);
    expect(r).toMatch(/\| 2026-11-09 \| 3 \| 2 \| 1 \| 120\.00 \|/);
    expect(r).toMatch(/\| 7 \| 2026-11-09 10:00:00 \| Forma de pago sin mapeo: IFOOD \/ X \|/);
    expect(r).toMatch(/- IFOOD \/ X/);
    expect(r).toMatch(/\| 1001 \| LAT \| Latte \| 60\.00 \|/);
    expect(r).toMatch(/TC01/);
  });
});

describe('reporte · días incompletos', () => {
  it('marca cada día con lectura incompleta en la tabla y en la advertencia', () => {
    const e2: Exportacion = {
      tickets: [],
      arqueos: [],
      vendidos: [],
      rappiExcluidos: 0,
      descartados: [],
      dias: [
        { fecha: '2026-11-08', leidos: 1, validos: 1, descartados: 0, monto: 60 },
        { fecha: '2026-11-09', leidos: 1, validos: 1, descartados: 0, monto: 60 },
      ],
    };
    const r = reporte(e2, {
      desde: '2026-11-08',
      hasta: '2026-11-09',
      estado: 'parcial',
      avisos: [],
      nuevos: [],
      incompletos: ['2026-11-09'],
    });
    expect(r).toMatch(/\| 2026-11-08 \| 1 \| 1 \| 0 \| 60\.00 \| completa \|/);
    expect(r).toMatch(/\| 2026-11-09 \| 1 \| 1 \| 0 \| 60\.00 \| INCOMPLETA \|/);
    expect(r.split('\n').slice(0, 4).join('\n')).toMatch(/2026-11-09/);
  });
});

describe('reporte · Rappi', () => {
  it('dice cuántos pedidos de Rappi se excluyeron', () => {
    const e3: Exportacion = {
      tickets: [],
      arqueos: [],
      vendidos: [],
      descartados: [],
      dias: [],
      rappiExcluidos: 61,
    };
    const r = reporte(e3, {
      desde: '2026-11-02',
      hasta: '2026-11-08',
      estado: 'completa',
      avisos: [],
      nuevos: [],
    });
    expect(r).toMatch(/Rappi no se manda a Areas: 61 pedidos excluidos/);
  });
});
