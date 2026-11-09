import { describe, expect, it } from 'vitest';
import { filasArticulos, filasPagos, reporte } from '../../lib/areas/archivos';
import type { Exportacion } from '../../lib/areas/armar';

describe('filasArticulos', () => {
  it('formato «Carga Art TPVs Externos»: encabezado, columnas y una fila por artículo', () => {
    expect(filasArticulos([{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 65 }])).toEqual([
      ['TIPO DE SOLICITUD', null, 'A', 'ALTA DE CODIGOS', null, null, 'COMENTARIOS'],
      [null, null, null, null, null, null, 'ALTA DE CODIGOS. ASOCIAR A GAMA Y TARIFA DE PRECIO.'],
      ['CÓDIGO', 'DESCRIPCIÓN', 'CODIGO DE FAMILIA 3', 'FAMILIA 3', 'IVA', 'TIPO', 'PRECIO VENTA'],
      [1001, 'Latte', 0, null, '16%', null, 65],
    ]);
  });
});

describe('filasPagos', () => {
  it('formato «Formas de Pago y Monedas»: solo 101 trae su código de Areas', () => {
    const f = filasPagos('2026-11-09');
    expect(f[0]).toEqual(['CODFPTPVEXT', 'DESCFPTPVEXT', 'CODFPAREAS', 'DESCFAREAS', 'FechaRegistro']);
    expect(f[1]).toEqual([101, 'Efectivo', 1, 'EFECTIVO PESOS MX', '2026-11-09']);
    expect(f[2]).toEqual([102, 'Tarjeta', null, null, '2026-11-09']);
    expect(f).toHaveLength(6);
  });
});

describe('reporte', () => {
  const e: Exportacion = {
    tickets: [], arqueos: [], vendidos: [1001],
    dias: [{ fecha: '2026-11-09', leidos: 3, validos: 2, descartados: 1, monto: 120 }],
    descartados: [{ id: 7, fecha: '2026-11-09', hora: '10:00:00', motivo: 'Forma de pago sin mapeo: IFOOD / X' }],
  };
  it('lectura parcial va arriba como advertencia', () => {
    const r = reporte(e, { desde: '2026-11-09', hasta: '2026-11-09', estado: 'parcial', avisos: ['1 de 1 días con lectura incompleta.'], nuevos: [] });
    expect(r.split('\n').slice(0, 4).join('\n')).toMatch(/INCOMPLETA/);
    expect(r).toMatch(/1 de 1 días con lectura incompleta/);
  });
  it('tabla por día, descartados, pagos sin mapeo y artículos nuevos', () => {
    const r = reporte(e, { desde: '2026-11-09', hasta: '2026-11-09', estado: 'completa', avisos: [], nuevos: [{ cod_art: 1001, codigo: 'LAT', descripcion: 'Latte', precio: 60 }] });
    expect(r).not.toMatch(/INCOMPLETA/);
    expect(r).toMatch(/\| 2026-11-09 \| 3 \| 2 \| 1 \| 120\.00 \|/);
    expect(r).toMatch(/\| 7 \| 2026-11-09 10:00:00 \| Forma de pago sin mapeo: IFOOD \/ X \|/);
    expect(r).toMatch(/- IFOOD \/ X/);
    expect(r).toMatch(/\| 1001 \| LAT \| Latte \| 60\.00 \|/);
    expect(r).toMatch(/TC01/);
  });
});
