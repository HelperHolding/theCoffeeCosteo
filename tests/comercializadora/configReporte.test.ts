// tests/comercializadora/configReporte.test.ts
import { describe, expect, it } from 'vitest';
import { aFormulario, desdeFormulario } from '@/lib/comercializadora/configReporte';
import { configReporteDef } from '../../supabase/functions/_shared/reporte/config.ts';

describe('configuración del reporte en formulario', () => {
  it('ida y vuelta conserva la configuración', () => {
    const c = { ...configReporteDef(), creditos_activos: [{ cliente: 'TANDEM', sucursal: 'Patio Santa Fe', nota: 'crédito 6×6' }] };
    expect(desdeFormulario(aFormulario(c))).toEqual(c);
  });
  it('limpia líneas vacías, créditos sin cliente y acota metas', () => {
    const f = { ...aFormulario(configReporteDef()), excluir_ventas: 'A\n\n B \n', creditos_activos: ' | x | y\nC||', fill: '120' };
    const c = desdeFormulario(f);
    expect(c.excluir_ventas).toEqual(['A', 'B']);
    expect(c.creditos_activos).toEqual([{ cliente: 'C', sucursal: '', nota: '' }]);
    expect(c.metas.fill).toBe(100);
  });
});
