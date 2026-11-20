import { describe, expect, it } from 'vitest';
import type { FilaDiaRpc, RpcServicio } from '../../lib/sucursales/servicio';
import {
  leerPublicadoHasta,
  recortarAlPublicado,
  ultimoDiaPublicado,
} from '../../lib/sucursales/servicio-publicado';

/**
 * Nivel de servicio: Rappi publica cada día con 1 a 2 días de retraso y el importador ya guarda el renglón del día en
 * ceros (docs/rappi-portal/08). La pantalla abre en el último día publicado y no cuenta los ceros como datos.
 */
const fila = (fecha: string, pedidos: number, disponibilidad: number | null): FilaDiaRpc => ({
  tienda: 'MX1',
  fecha,
  pedidos,
  rech_cbpi: 0,
  rech_cbpr: 0,
  rech_tienda_cerrada: 0,
  rech_sin_stock: 0,
  rech_demora: 0,
  finalizados: pedidos,
  recl_mal_estado: 0,
  recl_faltante: 0,
  recl_incorrecto: 0,
  disponibilidad,
  indisponibilidad: disponibilidad === null ? null : 100 - disponibilidad,
  cocina_pedidos: 0,
  cocina_demorada: 0,
  sin_disp_minutos: null,
  espera_repartidor: null,
});

describe('Nivel de servicio: último día que Rappi ya publicó', () => {
  it('un día en ceros (aún sin publicar) no cuenta; uno con pedidos o con disponibilidad sí', () => {
    expect(
      ultimoDiaPublicado([fila('2026-11-18', 9, 99), fila('2026-11-19', 10, 98.5), fila('2026-11-20', 0, 0)]),
    ).toBe('2026-11-19');
    // Abierta y sin pedidos ese día: con disponibilidad ya está publicado.
    expect(ultimoDiaPublicado([fila('2026-11-19', 0, 100), fila('2026-11-20', 0, 0)])).toBe('2026-11-19');
    expect(ultimoDiaPublicado([fila('2026-11-20', 0, 0)])).toBeNull();
    // Las sumas por día de la RPC nacional.
    expect(
      ultimoDiaPublicado([
        { fecha: '2026-11-19', pedidos: '5021', finalizados: '4980', disp_suma: '10870.5' },
        { fecha: '2026-11-20', pedidos: '0', finalizados: '0', disp_suma: '0' },
      ]),
    ).toBe('2026-11-19');
  });

  it('el recorte quita los días sin publicar y sus reclamos; la conectividad se queda', () => {
    const rpc = {
      tiendas: [{ id: 'MX1', nombre: 'Essentia', canal: 'normal' }],
      dias: [fila('2026-11-19', 10, 98.5), fila('2026-11-20', 0, 0)],
      reclamos: [
        {
          pedido: '1',
          tienda: 'MX1',
          fecha: '2026-11-19',
          motivo: 'x',
          subtipo: null,
          producto: null,
          comentario: null,
          monto: null,
        },
        {
          pedido: '2',
          tienda: 'MX1',
          fecha: '2026-11-20',
          motivo: 'x',
          subtipo: null,
          producto: null,
          comentario: null,
          monto: null,
        },
      ],
      conectividad: [
        {
          tienda: 'MX1',
          estado: 'ACTIVE',
          motivo: null,
          cierra: null,
          desde: '2026-11-20T18:00:00Z',
          visto: '2026-11-20T20:00:00Z',
        },
      ],
      vigente: [],
      primera_foto: null,
      semana: [],
      top: [],
      leido_en: null,
    } as RpcServicio;
    const r = recortarAlPublicado(rpc, '2026-11-19');
    expect(r.dias.map((d) => d.fecha)).toEqual(['2026-11-19']);
    expect(r.reclamos.map((x) => x.pedido)).toEqual(['1']);
    expect(r.conectividad).toHaveLength(1);
  });

  it('se busca primero en la última semana y, sin nada, en los últimos 62 días; si la lectura falla, null', async () => {
    const llamadas: string[] = [];
    const db = (respuestas: ({ por_dia: object[] } | null)[]) => ({
      rpc: async (_fn: 'sucursales_servicio_nacional', a: { p_desde: string; p_hasta: string }) => {
        llamadas.push(`${a.p_desde}…${a.p_hasta}`);
        const data = respuestas.shift() ?? null;
        return { data, error: data ? null : { message: 'falla' } };
      },
    });
    expect(
      await leerPublicadoHasta(
        db([{ por_dia: [{ fecha: '2026-11-19', pedidos: 3, finalizados: 3, disp_suma: 99 }] }]),
        [514],
        '2026-11-20',
      ),
    ).toBe('2026-11-19');
    expect(llamadas).toEqual(['2026-11-14…2026-11-20']);
    llamadas.length = 0;
    expect(
      await leerPublicadoHasta(
        db([
          { por_dia: [] },
          { por_dia: [{ fecha: '2026-10-01', pedidos: 1, finalizados: 1, disp_suma: 100 }] },
        ]),
        [514],
        '2026-11-20',
      ),
    ).toBe('2026-10-01');
    expect(llamadas).toEqual(['2026-11-14…2026-11-20', '2026-09-20…2026-11-20']);
    expect(await leerPublicadoHasta(db([null]), [514], '2026-11-20')).toBeNull();
    expect(await leerPublicadoHasta(db([]), [], '2026-11-20')).toBeNull();
  });
});
