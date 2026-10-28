import { describe, expect, it } from 'vitest';
import { agregarPos, estadoDia, resumir, ventanaDia } from '../../lib/analytics/contrato';
import { construirTablero, lunesDe, type DatosSemana, type FilaKpiDb } from '../../lib/analytics/tablero';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';

const pedido = (o: Partial<PedidoNormal>): PedidoNormal => ({
  id: 1,
  fecha: '2026-10-26',
  segundo: 0,
  hora: '',
  origen: 'mostrador',
  ventaCent: 0,
  netoCent: null,
  descuentoCent: 0,
  metodo: '',
  tipo: '',
  lineas: [],
  numeroPedidoRappi: null,
  cuadra: true,
  ...o,
});
const linea = { codigo: 'X', nombre: 'X', importeCent: 0, descuentoPct: 0, customs: [] };

describe('contrato', () => {
  it('el día empieza en la primera zona de México y termina en la última, con horario de verano', () => {
    // 27-oct empieza a las 05:00 UTC (Cancún, UTC−5).
    expect(ventanaDia('2026-10-27').inicio.toISOString()).toBe('2026-10-27T05:00:00.000Z');
    // 26-oct termina a las 07:00 UTC: Tijuana sigue en horario de verano (UTC−7) hasta el 1-nov.
    expect(ventanaDia('2026-10-26').fin.toISOString()).toBe('2026-10-27T07:00:00.000Z');
    // Desde el 1-nov Tijuana vuelve a UTC−8: el 2-nov termina a las 08:00 UTC.
    expect(ventanaDia('2026-11-02').fin.toISOString()).toBe('2026-11-03T08:00:00.000Z');
    expect(estadoDia('2026-10-26', new Date('2026-10-27T06:59:59Z'))).toBe('provisional');
    expect(estadoDia('2026-10-26', new Date('2026-10-27T07:00:00Z'))).toBe('cerrado');
    expect(estadoDia('2026-10-27', new Date('2026-10-27T04:59:59Z'))).toBe('futuro');
    expect(estadoDia('2026-10-27', new Date('2026-10-27T05:00:00Z'))).toBe('provisional');
    // 06:00 CDMX no es la regla: a las 01:30 CDMX del 27 el 26 ya cerró en todas las zonas.
    expect(estadoDia('2026-10-26', new Date('2026-10-27T07:30:00Z'))).toBe('cerrado');
  });

  it('agregarPos separa canales, rellena ceros y cuenta unidades por línea', () => {
    const r = agregarPos(
      [
        pedido({ id: 1, ventaCent: 10_050, lineas: [linea, linea] }),
        pedido({ id: 2, origen: 'app', ventaCent: 9_900, lineas: [linea] }),
        pedido({ id: 3, origen: 'rappi', ventaCent: 16_500, lineas: [linea] }),
      ],
      ['2026-10-26', '2026-10-27'],
    );
    expect(r.get('2026-10-26')).toEqual([
      { canal: 'app', venta_cent: 9_900, tickets: 1, unidades: 1 },
      { canal: 'desconocido', venta_cent: 0, tickets: 0, unidades: 0 },
      { canal: 'mostrador', venta_cent: 10_050, tickets: 1, unidades: 2 },
      { canal: 'rappi', venta_cent: 16_500, tickets: 1, unidades: 1 },
    ]);
    expect(r.get('2026-10-27')!.every((c) => c.tickets === 0)).toBe(true);
    expect(() => agregarPos([pedido({ fecha: '2026-10-30' })], ['2026-10-26'])).toThrow(/fuera/);
  });

  it('resumir usa cocientes de sumas y null sin tickets', () => {
    expect(
      resumir([
        { venta_cent: 100, tickets: 1, unidades: 3 },
        { venta_cent: 300, tickets: 3, unidades: 3 },
      ]),
    ).toMatchObject({
      ticketPromedioCent: 100,
      unidadesPorTicket: 1.5,
    });
    expect(resumir([{ venta_cent: 0, tickets: 0, unidades: 0 }])).toMatchObject({
      ticketPromedioCent: null,
      unidadesPorTicket: null,
    });
  });
});

describe('tablero', () => {
  const kpi = (company_id: number, fecha: string, o: Partial<FilaKpiDb> = {}): FilaKpiDb => ({
    company_id,
    fecha,
    provisional: false,
    leido_en: '2026-10-27T17:00:00Z',
    venta_cent: 1_000,
    tickets: 2,
    unidades: 3,
    mostrador_cent: 700,
    app_cent: 300,
    rappi_pos_tickets: 0,
    rappi_pos_cent: 0,
    sin_origen_tickets: 0,
    ...o,
  });
  const datos: DatosSemana = {
    tiendas: [
      { company_id: 1, store_id: 11, nombre: 'A' },
      { company_id: 2, store_id: 22, nombre: 'B' },
      { company_id: 3, store_id: 33, nombre: 'C' },
    ],
    kpi: [
      kpi(1, '2026-10-26', { rappi_pos_tickets: 24, rappi_pos_cent: 516_300 }),
      kpi(2, '2026-10-26', { venta_cent: 0, tickets: 0, unidades: 0, mostrador_cent: 0, app_cent: 0 }),
      kpi(3, '2026-10-26'),
      kpi(1, '2026-10-27', { provisional: true, leido_en: '2026-10-27T18:00:00Z' }),
    ],
    rappiZoho: [{ company_id: 1, fecha: '2026-10-26', venta_cent: 466_680, tickets: 24 }],
  };
  const t = construirTablero(datos, '2026-10-26', new Date('2026-10-27T19:00:00Z'));

  it('distingue cerrado, parcial, futuro y sin lectura; sin ventas es dato', () => {
    expect(t.dias.map((d) => d.estado)).toEqual([
      'cerrado',
      'parcial',
      'futuro',
      'futuro',
      'futuro',
      'futuro',
      'futuro',
    ]);
    expect(t.lecturasEsperadas).toBe(6);
    expect(t.lecturasObtenidas).toBe(4);
    expect(t.faltantes).toEqual([{ fecha: '2026-10-27', tiendas: 2 }]);
    expect(t.tiendas.find((f) => f.company_id === 2)!.resumen!.tickets).toBe(0);
    const sinLectura = construirTablero(
      { ...datos, kpi: [] },
      '2026-10-19',
      new Date('2026-10-27T19:00:00Z'),
    );
    expect(sinLectura.dias.every((d) => d.estado === 'sin-lectura')).toBe(true);
    expect(sinLectura.total).toBeNull();
  });

  it('desglosa por canal y arma la matriz de cobertura en el orden del ranking', () => {
    expect(t.dias[0].canales).toEqual({ mostrador_cent: 1_400, app_cent: 600 });
    expect(t.dias[2].canales).toBeNull();
    expect(t.cobertura.map((c) => c.fecha)).toEqual(['2026-10-26', '2026-10-27']);
    const orden = t.tiendas.map((x) => x.company_id);
    const celda = (dia: number, company: number) => t.cobertura[dia].celdas[orden.indexOf(company)];
    expect(celda(0, 2)).toBe('sin-ventas');
    expect(celda(0, 3)).toBe('ventas');
    expect(celda(1, 3)).toBe('sin-lectura');
  });

  it('Rappi (POS y Zoho) nunca entra en los totales', () => {
    expect(t.total).toMatchObject({ venta_cent: 3_000, tickets: 6, unidades: 9 });
    expect(t.excluido.rappiPos).toEqual({ tickets: 24, venta_cent: 516_300 });
    expect(t.excluido.rappiZoho).toEqual({ tickets: 24, venta_cent: 466_680, fechas: ['2026-10-26'] });
    expect(t.hayProvisional).toBe(true);
    expect(t.ultimaLectura).toBe('2026-10-27T18:00:00Z');
  });

  it('un día terminado con lectura provisional queda pendiente de cierre; lo viejo del día en curso, desactualizado', () => {
    const despues = construirTablero(
      { ...datos, kpi: datos.kpi.map((k) => ({ ...k, provisional: k.fecha === '2026-10-26' })) },
      '2026-10-26',
      new Date('2026-10-27T19:00:00Z'),
    );
    expect(despues.dias[0].estado).toBe('pendiente-cierre');
    expect(despues.pendientesCierre).toEqual(['2026-10-26']);
    expect(t.pendientesCierre).toEqual([]);
    expect(t.desactualizado).toBe(false);
    const tarde = construirTablero(datos, '2026-10-26', new Date('2026-10-27T21:30:00Z'));
    expect(tarde.desactualizado).toBe(true);
  });

  it('semanas: lunes y sin navegar al futuro', () => {
    expect(lunesDe('2026-11-01')).toBe('2026-10-26');
    expect(lunesDe('2026-10-26')).toBe('2026-10-26');
    expect(t.semana.siguiente).toBeNull();
    expect(t.semana.anterior).toBe('2026-10-19');
  });
});
