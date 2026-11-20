import { describe, expect, it } from 'vitest';
import { acumular, type FilaDiaRpc } from '../../lib/sucursales/servicio';
import {
  construirServicioNacional,
  sumarSumas,
  type RpcServicioNacional,
} from '../../lib/sucursales/servicio-nacional';
import { hojasServicioNacional } from '../../lib/sucursales/servicio-excel';

// Tablero de México · Nivel de servicio (docs/rappi-portal/08, fase 3).
const fila = (tienda: string, o: Partial<FilaDiaRpc> = {}): FilaDiaRpc => ({
  tienda,
  fecha: '2026-11-18',
  pedidos: 10,
  rech_cbpi: 0,
  rech_cbpr: 0,
  rech_tienda_cerrada: 0,
  rech_sin_stock: 0,
  rech_demora: 0,
  finalizados: 10,
  recl_mal_estado: 1,
  recl_faltante: 0,
  recl_incorrecto: 0,
  disponibilidad: 90,
  indisponibilidad: 10,
  cocina_pedidos: 10,
  cocina_demorada: 1,
  sin_disp_minutos: 30,
  espera_repartidor: 2,
  ...o,
});

const SUCURSALES = [
  { companyId: 513, nombre: 'Namóra', ciudad: 'Zapopan' },
  { companyId: 612, nombre: 'Cd. Juárez', ciudad: 'Ciudad Juárez' },
  { companyId: 469, nombre: 'Roma Sur', ciudad: 'Ciudad de México' },
];
const rpc: RpcServicioNacional = {
  tiendas: [
    { id: 'N513', company_id: 513, nombre: 'The Coffee Namóra', canal: 'normal' },
    { id: 'T513', company_id: 513, nombre: 'The Coffee Namóra - Turbo', canal: 'turbo' },
    { id: 'N612', company_id: 612, nombre: 'The Coffee Cd. Juárez', canal: 'normal' },
  ],
  por_tienda: [
    { tienda: 'N513', ...acumular([fila('N513'), fila('N513', { fecha: '2026-11-19', recl_faltante: 2 })]) },
    {
      tienda: 'T513',
      ...acumular([fila('T513', { pedidos: 4, finalizados: 4, recl_mal_estado: 0, espera_repartidor: 6 })]),
    },
    {
      tienda: 'N612',
      ...acumular([
        fila('N612', { pedidos: 30, finalizados: 30, recl_mal_estado: 0, sin_disp_minutos: null }),
      ]),
    },
  ],
  por_dia: [{ fecha: '2026-11-18', ...acumular([fila('N513'), fila('N612')]) }],
  reclamos: [
    {
      pedido: '1',
      tienda: 'T513',
      fecha: '2026-11-18',
      motivo: 'damaged_item',
      subtipo: 'incorrect_temperature',
      producto: 'True White',
      comentario: 'Llegó tibio',
      monto: 10,
    },
  ],
  vigente: [
    {
      tienda: 'N513',
      estado: 'ACTIVE',
      motivo: null,
      cierra: null,
      desde: '2026-11-20T13:00:00Z',
      visto: '2026-11-20T18:00:00Z',
    },
    {
      tienda: 'N612',
      estado: 'INACTIVE',
      motivo: 'Not ready to sell',
      cierra: null,
      desde: '2026-11-20T17:00:00Z',
      visto: '2026-11-20T18:00:00Z',
    },
  ],
  top: [
    { tienda: 'N513', fecha: '2026-11-20', categoria: '2. Top 20%', proxima: null },
    { tienda: 'N612', fecha: '2026-11-20', categoria: '1. Top 5%', proxima: null },
  ],
  leido_en: '2026-11-20T18:07:00Z',
};

describe('Nivel de servicio nacional', () => {
  it('suma de sumas: espera ponderada por finalizados y minutos sin dato que no cuentan como cero', () => {
    const s = sumarSumas(rpc.por_tienda);
    expect([s.pedidos, s.finalizados, s.recl_mal_estado + s.recl_faltante]).toEqual([54, 54, 4]);
    expect(s.espera_suma / s.espera_peso).toBeCloseTo((2 * 20 + 6 * 4 + 2 * 30) / 54);
    expect(s.sin_disp_minutos).toBe(90);
    expect(sumarSumas([{ ...rpc.por_tienda[2] }]).sin_disp_minutos).toBeNull();
  });

  it('por sucursal, estado de ahora, desactivadas, sin tienda en el portal y Top', () => {
    const d = construirServicioNacional(rpc, '2026-11-18', '2026-11-19', SUCURSALES);
    expect(d.sucursales.map((s) => [s.nombre, s.totales.pedidos, s.totales.reclamosTotal])).toEqual([
      ['Cd. Juárez', 30, 0],
      ['Namóra', 24, 4],
    ]);
    expect(d.sucursales[1].ahora).toEqual({
      normal: { activa: true, motivo: null, desde: '2026-11-20T13:00:00Z' },
    });
    expect(d.ahora).toEqual([
      { canal: 'normal', tiendas: 2, activas: 1 },
      { canal: 'turbo', tiendas: 1, activas: 0 },
    ]);
    expect(d.desactivadas).toEqual([
      {
        companyId: 612,
        sucursal: 'Cd. Juárez',
        canal: 'normal',
        estado: 'INACTIVE',
        motivo: 'Not ready to sell',
        desde: '2026-11-20T17:00:00Z',
      },
    ]);
    expect(d.sinPortal).toEqual([{ companyId: 469, nombre: 'Roma Sur', ciudad: 'Ciudad de México' }]);
    expect(d.top).toEqual([
      { categoria: '1. Top 5%', tiendas: 1 },
      { categoria: '2. Top 20%', tiendas: 1 },
    ]);
    expect(d.reclamos[0]).toMatchObject({
      sucursal: 'Namóra',
      canal: 'turbo',
      tipo: 'mal_estado',
      detalle: 'Temperatura incorrecta',
    });
    expect(d.totales.pedidos).toBe(54);
    expect(d.dias[0].total.pedidos).toBe(20);
  });

  it('Excel nacional: por sucursal, reclamos, desactivadas y el periodo en el nombre', () => {
    const h = hojasServicioNacional(construirServicioNacional(rpc, '2026-11-18', '2026-11-19', SUCURSALES));
    expect(h.nombreArchivo).toBe('nivel-servicio-mexico-2026-11-18_2026-11-19.xlsx');
    expect(h.porSucursal[0]).toMatchObject({
      Sucursal: 'Cd. Juárez',
      'Rappi ahora': 'Desactivada',
      'Top Restaurantes': 'Top 5 %',
    });
    expect(h.reclamos[0]).toMatchObject({ Sucursal: 'Namóra', Tienda: 'Rappi Turbo', Tipo: 'Mal estado' });
    expect(h.desactivadas[0]).toMatchObject({ Sucursal: 'Cd. Juárez', Motivo: 'Not ready to sell' });
    expect(h.resumen.find((x) => x.Concepto === 'Sucursales sin tienda en el portal')?.Valor).toBe(
      'Roma Sur',
    );
  });
});
