// tests/comercializadora/compras-grafica.test.ts
import { describe, expect, it } from 'vitest';
import { graficaCompras } from '@/lib/comercializadora/compras/grafica';
import { estadoSync, mensajeSync } from '@/lib/comercializadora/compras/sync';

const serie = Array.from({ length: 16 }, (_, i) => ({ semana: `2026-08-${String(3 + i).padStart(2, '0')}`, venta: 1000 * (i + 1), compras: 400 * (i + 1), presupuesto: 500 * (i + 1) }));

describe('gráfica de compras', () => {
  it('SVG autocontenido: una barra de venta y una de compras por semana, línea de presupuesto y títulos al pasar el cursor', () => {
    const s = graficaCompras(serie);
    expect(s.startsWith('<svg')).toBe(true);
    expect(s).toContain('width="100%"');
    expect(s.match(/<g class="semana"/g)).toHaveLength(16);
    expect(s).toContain('<polyline');
    expect(s).toContain('Venta $16,000');
    expect(s).toContain('Compras $6,400.00 (40%)'); // pesos() lleva centavos
    expect(s).not.toContain('<script');
  });
  it('sin datos no divide entre cero', () => {
    const s = graficaCompras(serie.map((p) => ({ ...p, venta: 0, compras: 0, presupuesto: 0 })));
    expect(s).not.toContain('NaN');
    expect(s).not.toContain('Infinity');
  });
});

describe('estado de la sincronización', () => {
  const ahora = new Date('2026-11-26T18:00:00Z');
  it('nunca, reciente y vieja (más de 36 h)', () => {
    expect(estadoSync(null, ahora)).toMatchObject({ nunca: true, viejo: true, texto: 'Sin sincronizar todavía' });
    expect(estadoSync('2026-11-26T17:40:00Z', ahora)).toMatchObject({ nunca: false, viejo: false, texto: 'Sincronizado hace 20 min' });
    expect(estadoSync('2026-11-24T12:00:00Z', ahora).viejo).toBe(true);
  });
  it('mensajes de la acción', () => {
    expect(mensajeSync({ omitida: 'sincronización reciente' })).toBe('Se sincronizó hace menos de 10 minutos; intenta más tarde.');
    expect(mensajeSync({ ocs: 3, recepciones: 2, facturas: 40, pendientes: true }))
      .toBe('Listo: 3 OCs, 2 recepciones y 40 facturas leídas de Zoho; aún faltan documentos por leer, el siguiente ciclo sigue.');
  });
});
