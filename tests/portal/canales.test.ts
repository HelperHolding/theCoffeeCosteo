import { describe, expect, it } from 'vitest';
import type { Resumen } from '@/lib/supabase/database.types';
import { FUSIONADO, esCanal, fusionarCanales } from '@/lib/portal/canales';

const fila = (canal: string, cambios: Partial<Resumen> = {}): Resumen =>
  ({
    producto_id: 'p1',
    tamano_id: 't1',
    canal_id: canal,
    canal,
    canal_orden: { Mostrador: 1, Rappi: 2, 'App propia': 3 }[canal] ?? 9,
    precio_canal: 62,
    precio_calculado: 62,
    precio_manual: null,
    margen: 42.25,
    margen_bruto: 42.25,
    ...cambios,
  }) as Resumen;

describe('fusionarCanales', () => {
  it('une Mostrador y App propia cuando coinciden y deja Rappi aparte', () => {
    const r = fusionarCanales([fila('Mostrador'), fila('Rappi', { precio_canal: 69 }), fila('App propia')]);
    expect(r.map((f) => f.canal)).toEqual([FUSIONADO, 'Rappi']);
    expect(r[0].canal_id).toBe('Mostrador');
  });

  it('los deja separados si el precio o el margen difieren', () => {
    expect(fusionarCanales([fila('Mostrador'), fila('App propia', { precio_manual: 65, precio_canal: 65 })])).toHaveLength(2);
    expect(fusionarCanales([fila('Mostrador'), fila('App propia', { margen: 30 })])).toHaveLength(2);
  });

  it('con campos solo compara esos campos', () => {
    expect(fusionarCanales([fila('Mostrador'), fila('App propia', { margen: 30 })], { campos: ['precio_canal'] })).toHaveLength(1);
  });

  it('no mezcla tamaños distintos y une campos extra', () => {
    const filas = [
      { ...fila('Mostrador'), alerta: null },
      { ...fila('App propia'), alerta: 'Margen bajo el objetivo' },
      { ...fila('Mostrador', { tamano_id: 't2' }), alerta: null },
    ];
    const r = fusionarCanales(filas, { unir: (m, a) => ({ alerta: m.alerta ?? a.alerta }) });
    expect(r.map((f) => [f.tamano_id, f.canal, f.alerta])).toEqual([
      ['t1', FUSIONADO, 'Margen bajo el objetivo'],
      ['t2', 'Mostrador', null],
    ]);
  });

  it('esCanal reconoce los canales dentro del fusionado', () => {
    expect(esCanal(FUSIONADO, 'Mostrador')).toBe(true);
    expect(esCanal(FUSIONADO, 'App propia')).toBe(true);
    expect(esCanal('Rappi', 'Mostrador')).toBe(false);
  });
});
