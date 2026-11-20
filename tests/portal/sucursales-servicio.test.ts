import { describe, expect, it } from 'vitest';
import {
  construirServicio,
  nombreSubtipo,
  nombreTop,
  sumar,
  type FilaDiaRpc,
  type RpcServicio,
} from '../../lib/sucursales/servicio';
import { hojasServicio } from '../../lib/sucursales/servicio-excel';

// Nivel de servicio de una sucursal (docs/rappi-portal/08): se suma lo que da Rappi; nada se inventa.
const fila = (o: Partial<FilaDiaRpc>): FilaDiaRpc => ({
  tienda: 'N',
  fecha: '2026-11-18',
  pedidos: 10,
  rech_cbpi: 0,
  rech_cbpr: 0,
  rech_tienda_cerrada: 0,
  rech_sin_stock: 1,
  rech_demora: 0,
  finalizados: 9,
  recl_mal_estado: 1,
  recl_faltante: 0,
  recl_incorrecto: 0,
  disponibilidad: 90,
  indisponibilidad: 10,
  cocina_pedidos: 9,
  cocina_demorada: 3,
  sin_disp_minutos: 30,
  espera_repartidor: 2,
  ...o,
});

const rpc = (o: Partial<RpcServicio> = {}): RpcServicio => ({
  tiendas: [
    { id: 'N', nombre: 'The Coffee Namóra', canal: 'normal' },
    { id: 'T', nombre: 'The Coffee Namóra - Turbo', canal: 'turbo' },
  ],
  dias: [
    fila({}),
    fila({ tienda: 'T', pedidos: 5, finalizados: 3, espera_repartidor: 6, sin_disp_minutos: null }),
  ],
  reclamos: [
    {
      pedido: '1',
      tienda: 'T',
      fecha: '2026-11-18',
      motivo: 'missing_item',
      subtipo: 'Not_arrived_bag_closed',
      producto: 'True White',
      comentario: 'No llegó',
      monto: 47.8,
    },
    {
      pedido: '2',
      tienda: 'N',
      fecha: '2026-11-18',
      motivo: 'wrong_item',
      subtipo: 'algo_nuevo',
      producto: 'True White',
      comentario: null,
      monto: null,
    },
  ],
  conectividad: [],
  vigente: [],
  primera_foto: null,
  semana: [],
  top: [{ tienda: 'N', fecha: '2026-11-20', categoria: '1. Top 5%', proxima: '5. Warning' }],
  leido_en: null,
  ...o,
});

describe('Nivel de servicio · armado', () => {
  it('suma de Rappi: tasas sobre sumas, espera ponderada por finalizados, un dato faltante no es cero', () => {
    const t = sumar([
      fila({}),
      fila({
        tienda: 'T',
        pedidos: 5,
        finalizados: 3,
        cocina_pedidos: 3,
        espera_repartidor: 6,
        sin_disp_minutos: null,
      }),
    ]);
    expect([t.pedidos, t.finalizados, t.reclamosTotal, t.rechazosTotal]).toEqual([15, 12, 2, 2]);
    expect(t.tasaReclamos).toBeCloseTo(2 / 12);
    expect(t.espera).toBeCloseTo((2 * 9 + 6 * 3) / 12);
    expect(t.sinDispMinutos).toBe(30);
    const vacio = sumar([
      fila({
        sin_disp_minutos: null,
        espera_repartidor: null,
        disponibilidad: null,
        finalizados: 0,
        cocina_pedidos: 0,
      }),
    ]);
    expect([vacio.sinDispMinutos, vacio.espera, vacio.disponibilidad, vacio.tasaReclamos]).toEqual([
      null,
      null,
      null,
      null,
    ]);
  });

  it('por tienda, reclamos con canal y nombres en español, productos y Top Restaurantes', () => {
    const d = construirServicio(rpc(), '2026-11-18', '2026-11-18', 'America/Mexico_City', false);
    expect(d.porCanal.normal!.pedidos).toBe(10);
    expect(d.porCanal.turbo!.pedidos).toBe(5);
    expect(d.reclamos.map((r) => [r.pedido, r.canal, r.tipo, r.detalle])).toEqual([
      ['1', 'turbo', 'faltante', 'No llegó (bolsa cerrada)'],
      ['2', 'normal', 'incorrecto', 'algo_nuevo'],
    ]);
    expect(d.compensado).toBe(47.8);
    expect(d.productos).toEqual([
      { producto: 'True White', reclamos: 2, tipos: { mal_estado: 0, faltante: 1, incorrecto: 1 } },
    ]);
    expect(d.canales[0].top?.categoria).toBe('1. Top 5%');
    expect([
      nombreTop('1. Top 5%'),
      nombreTop('5. Warning'),
      nombreTop('Fuera del Top 20'),
      nombreSubtipo(null),
    ]).toEqual(['Top 5 %', 'En advertencia', 'Fuera del Top 20', null]);
  });

  it('conectividad: tramos por día local, hueco sin foto y estado de ahora con hora de cierre local', () => {
    const t = (iso: string) => new Date(iso).toISOString();
    const d = construirServicio(
      rpc({
        conectividad: [
          // Activa 7:00–12:20 (hora del centro = UTC−6); se apagó 12:20–13:00; luego 1 h sin foto (13:10–14:10).
          {
            tienda: 'N',
            estado: 'ACTIVE',
            motivo: null,
            cierra: null,
            desde: t('2026-11-18T13:00:00Z'),
            visto: t('2026-11-18T18:10:00Z'),
            hasta: t('2026-11-18T18:20:00Z'),
          },
          {
            tienda: 'N',
            estado: 'INACTIVE',
            motivo: 'Not ready to sell',
            cierra: null,
            desde: t('2026-11-18T18:20:00Z'),
            visto: t('2026-11-18T19:10:00Z'),
            hasta: t('2026-11-18T20:10:00Z'),
          },
        ],
        vigente: [
          {
            tienda: 'N',
            estado: 'ACTIVE',
            motivo: null,
            cierra: t('2026-11-19T04:00:00Z'),
            desde: t('2026-11-18T20:10:00Z'),
            visto: t('2026-11-18T20:30:00Z'),
          },
        ],
      }),
      '2026-11-18',
      '2026-11-18',
      'America/Mexico_City',
      false,
    );
    const hh = (s: number) =>
      `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String((s % 3600) / 60).padStart(2, '0')}`;
    expect(d.cintas).toHaveLength(1);
    expect(d.cintas[0].tramos.map((x) => [x.estado, hh(x.inicio), hh(x.fin)])).toEqual([
      ['activa', '07:00', '12:20'],
      ['inactiva', '12:20', '13:10'],
      ['sin_dato', '13:10', '14:10'],
    ]);
    // En Tijuana (UTC−7 fijo) la misma cinta va una hora antes.
    const tj = construirServicio(
      rpc({
        conectividad: [
          rpc().conectividad[0] ?? {
            tienda: 'N',
            estado: 'ACTIVE',
            motivo: null,
            cierra: null,
            desde: t('2026-11-18T13:00:00Z'),
            visto: t('2026-11-18T18:10:00Z'),
            hasta: t('2026-11-18T18:20:00Z'),
          },
        ],
      }),
      '2026-11-18',
      '2026-11-18',
      'Etc/GMT+7',
      true,
    );
    expect(tj.cintas[0].tramos.map((x) => [hh(x.inicio), hh(x.fin)])).toEqual([['06:00', '11:20']]);
    expect(d.canales[0].ahora).toMatchObject({ activa: true, cierra: '22:00' });
    expect(d.canales[1].ahora).toBeNull();
    expect(d.tramos.map((x) => [x.estado, x.desde, x.hasta, x.minutos])).toEqual([
      ['ACTIVE', '2026-11-18 07:00', '2026-11-18 12:20', 320],
      ['INACTIVE', '2026-11-18 12:20', '2026-11-18 13:10', 50],
    ]);
  });

  it('Excel: hojas con el periodo de pantalla, encabezados en español y el periodo en el nombre', () => {
    const d = construirServicio(rpc(), '2026-11-18', '2026-11-18', 'America/Mexico_City', false);
    const h = hojasServicio(d, 'Namóra');
    expect(h.nombreArchivo).toBe('nivel-servicio-namóra-2026-11-18.xlsx');
    expect(h.dias).toHaveLength(1);
    expect(h.dias[0]).toMatchObject({
      Fecha: '2026-11-18',
      'Pedidos creados': 15,
      Reclamos: 2,
      'Rechazo: Sin producto': 2,
    });
    expect(h.porCanal.map((x) => x.Tienda)).toEqual(['Rappi', 'Rappi Turbo']);
    expect(h.reclamos[0]).toMatchObject({
      Tienda: 'Rappi Turbo',
      Tipo: 'Ítem faltante',
      'Compensado (MXN)': 47.8,
    });
    expect(h.resumen.find((x) => x.Concepto === 'Top Restaurantes (Rappi)')?.Valor).toContain('Top 5 %');
    const rango = hojasServicio(
      construirServicio(rpc(), '2026-11-01', '2026-11-18', 'America/Mexico_City', false),
      'Namóra',
    );
    expect(rango.nombreArchivo).toBe('nivel-servicio-namóra-2026-11-01_2026-11-18.xlsx');
  });
});
