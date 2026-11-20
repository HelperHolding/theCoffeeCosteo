import { describe, expect, it } from 'vitest';
import {
  conectividadDe,
  diasDeMetricas,
  esperaDia,
  matrizSemana,
  planServicio,
  reclamosDe,
  topDe,
} from '../../servicios/rappi-portal/servicio.mjs';

// Respuestas del portal vistas el 2026-11-20 en solo lectura (docs/rappi-portal/08), recortadas.
const col = (fecha: string, total: number, partitions: unknown[]) => ({
  total_orders: total,
  key: 0,
  col_key: fecha,
  year_key: fecha,
  partitions,
});
const metricas = {
  display_mode: 'DAYS',
  rejection_metrics: {
    columns: [
      col('2026-11-18', 9, [
        { type: 'REJECTION_CBPI', quantity: 0 },
        { type: 'REJECTION_CBPR', quantity: 0 },
        { type: 'REJECTION_CLOSED_STORE', quantity: 0 },
        { type: 'REJECTION_STOCK_OUT', quantity: 1 },
        { type: 'REJECTION_DELAY_IN_STORE', quantity: 0 },
      ]),
    ],
    lost_opportunity: 0,
  },
  error_metrics: {
    columns: [
      col('2026-11-18', 8, [
        { type: 'ERROR_DAMAGED', quantity: 1 },
        { type: 'ERROR_MISSING', quantity: 0 },
        { type: 'ERROR_WRONG', quantity: 0 },
      ]),
    ],
  },
  availability_metrics: { columns: [col('2026-11-18', 0, [{ type: 'AVAILABILITY', percentage: 93.26 }])] },
  unavailability_metrics: { columns: [col('2026-11-18', 0, [{ type: 'UNAVAILABILITY', percentage: 6.74 }])] },
  cooking_time_metrics: {
    columns: [col('2026-11-18', 8, [{ type: 'COOKINGTIME_DELAY', quantity: 3, percentage: 37.5 }])],
  },
};

describe('servicio del lector de Rappi', () => {
  it('métricas por día de una tienda; un rango agrupado por mes se rechaza', () => {
    expect(diasDeMetricas('MX1930384164', metricas)).toEqual([
      {
        tienda: 'MX1930384164',
        fecha: '2026-11-18',
        pedidos: 9,
        rech_cbpi: 0,
        rech_cbpr: 0,
        rech_tienda_cerrada: 0,
        rech_sin_stock: 1,
        rech_demora: 0,
        finalizados: 8,
        recl_mal_estado: 1,
        recl_faltante: 0,
        recl_incorrecto: 0,
        disponibilidad: 93.26,
        indisponibilidad: 6.74,
        cocina_pedidos: 8,
        cocina_demorada: 3,
      },
    ]);
    expect(() => diasDeMetricas('MX1', { ...metricas, display_mode: 'MONTHS' })).toThrow(/DAYS/);
  });

  it('espera, conectividad, calor de 15 días y Top Restaurantes', () => {
    expect(esperaDia('MX1', '2026-11-18', { rt_wait_time: { average: { value: 2.8 } } })).toEqual({
      tienda: 'MX1',
      fecha: '2026-11-18',
      espera_repartidor: 2.8,
    });
    expect(esperaDia('MX1', '2026-11-18', {})).toBeNull();
    expect(
      conectividadDe([
        { store_id: 1930455612, status: 'INACTIVE', first_message: '-', second_message: 'Not ready to sell' },
        {
          store_id: 1930260682,
          status: 'ACTIVE',
          first_message: 'Until 20/11/2026 - 20:30:00',
          second_message: '',
        },
      ]),
    ).toEqual([
      { tienda: 'MX1930455612', estado: 'INACTIVE', motivo: 'Not ready to sell', cierre: '' },
      { tienda: 'MX1930260682', estado: 'ACTIVE', motivo: '', cierre: 'Until 20/11/2026 - 20:30:00' },
    ]);
    expect(
      matrizSemana({
        availability: {
          '09:00': [
            { day: 'mon', value: 0.714286 },
            { day: 'sun', value: 0.8 },
          ],
        },
      }),
    ).toEqual({ '09:00': { mon: 0.714, sun: 0.8 } });
    expect(
      topDe('2026-11-20', {
        performance: [{ store_id: 1930258127, cal_actual: '5. Warning', prox_cal: '1. Top 5%' }],
      }),
    ).toEqual([
      { tienda: 'MX1930258127', fecha: '2026-11-20', categoria: '5. Warning', proxima: '1. Top 5%' },
    ]);
  });

  it('reclamos: la tienda sale del pedido o del nombre; si no se sabe, no se adivina', () => {
    const r = reclamosDe(
      [
        {
          reason: 'missing_item',
          comments: 'Lo pedí con miel de agave y no le pusieron',
          order_id: 2489855527,
          order_date: '2026-11-18T00:00',
          store_name: 'The Coffee Gran Plaza',
          product_name: 'Miel',
          level_1: 'missing_ingredient',
          amount_local_currency: 2.13,
        },
        {
          reason: 'wrong_item',
          order_id: 2488568290,
          order_date: '2026-11-14T00:00',
          store_name: 'The Coffee Ventura',
        },
        { reason: 'wrong_item', order_id: 1111111111, order_date: '2026-11-14T00:00', store_name: 'Otra' },
      ],
      {
        tiendaDePedido: new Map([['2489855527', 'MX1930384164']]),
        tiendaDeNombre: new Map([['The Coffee Ventura', 'MX1930213018']]),
      },
    );
    expect(r.reclamos.map((x) => [x.pedido, x.tienda, x.fecha, x.monto])).toEqual([
      ['2489855527', 'MX1930384164', '2026-11-18', 2.13],
      ['2488568290', 'MX1930213018', '2026-11-14', null],
    ]);
    expect(r.sinTienda).toEqual(['1111111111']);
  });

  it('plan por tipo de corrida', () => {
    const hoy = '2026-11-20';
    expect(planServicio({ tipo: 'vivo', hoy, minuto: 17 })).toMatchObject({
      conectividad: true,
      dias: null,
      espera: [],
      top: false,
    });
    // Rappi responde ceros para el día en curso: la corrida de cada hora lee los indicadores de AYER.
    expect(planServicio({ tipo: 'vivo', hoy, minuto: 7 })).toMatchObject({
      dias: { desde: '2026-11-19', hasta: '2026-11-19' },
      espera: ['2026-11-19'],
      reclamos: { desde: '2026-11-19', hasta: hoy },
      top: true,
    });
    expect(planServicio({ tipo: 'cierre', hoy, minuto: 7 })).toMatchObject({
      dias: { desde: '2026-11-13', hasta: '2026-11-19' },
      espera: ['2026-11-19'],
      semana: true,
    });
    expect(
      planServicio({ tipo: 'manual', desde: '2026-08-10', hasta: '2026-08-12', hoy, minuto: 0 }),
    ).toBeNull();
    expect(
      planServicio({
        tipo: 'manual',
        desde: '2026-08-10',
        hasta: '2026-08-12',
        servicio: true,
        espera: true,
        hoy,
        minuto: 0,
      }),
    ).toMatchObject({ conectividad: false, espera: ['2026-08-10', '2026-08-11', '2026-08-12'] });
    // Una reposición que llega a hoy pide indicadores solo hasta ayer; si es solo hoy, solo reclamos.
    expect(
      planServicio({
        tipo: 'manual',
        desde: '2026-11-18',
        hasta: hoy,
        servicio: true,
        espera: true,
        hoy,
        minuto: 0,
      }),
    ).toMatchObject({
      dias: { desde: '2026-11-18', hasta: '2026-11-19' },
      espera: ['2026-11-18', '2026-11-19'],
      reclamos: { desde: '2026-11-18', hasta: hoy },
    });
    expect(
      planServicio({ tipo: 'manual', desde: hoy, hasta: hoy, servicio: true, hoy, minuto: 0 }),
    ).toMatchObject({
      dias: null,
      espera: [],
      reclamos: { desde: hoy, hasta: hoy },
    });
  });
});
