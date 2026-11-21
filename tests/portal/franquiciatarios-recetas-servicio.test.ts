import { describe, expect, it } from 'vitest';
import { armarFicha, cantidadTexto, type RpcFicha } from '@/lib/franquiciatarios/recetas';
import { armarServicio } from '@/lib/franquiciatarios/servicio';
import type { FilaDiaRpc } from '@/lib/sucursales/servicio';

const rpc: RpcFicha = {
  productos: [{ id: 'p1', nombre: 'Iced Latte', categoria: null, tamanos: ['Chica', 'Grande'] }],
  subrecetas: [{ id: 's1', nombre: 'JARABE', rendimiento: '1000', unidad: 'ml' }],
  lineas: [
    {
      receta_id: 'p1',
      tamano: 'Chica',
      orden: 0,
      insumo: 'CAFÉ',
      subreceta_id: null,
      subreceta: null,
      unidad: 'gr',
      cantidad: '18',
    },
    {
      receta_id: 'p1',
      tamano: 'Chica',
      orden: 1,
      insumo: null,
      subreceta_id: 's1',
      subreceta: 'JARABE',
      unidad: 'ml',
      cantidad: 15,
    },
    {
      receta_id: 's1',
      tamano: null,
      orden: 0,
      insumo: 'AZÚCAR',
      subreceta_id: null,
      subreceta: null,
      unidad: 'gr',
      cantidad: 500,
    },
  ],
};

describe('ficha de receta', () => {
  it('agrupa por producto y tamaño; las sub-recetas llevan su lote; un tamaño sin líneas queda vacío', () => {
    const f = armarFicha(rpc);
    expect(f.productos[0]).toEqual({
      id: 'p1',
      nombre: 'Iced Latte',
      categoria: 'Sin categoría',
      tamanos: [
        {
          tamano: 'Chica',
          lineas: [
            { nombre: 'CAFÉ', cantidad: 18, unidad: 'gr' },
            { nombre: 'JARABE', cantidad: 15, unidad: 'ml', subrecetaId: 's1' },
          ],
        },
        { tamano: 'Grande', lineas: [] },
      ],
    });
    expect(f.subrecetas.s1).toEqual({
      id: 's1',
      nombre: 'JARABE',
      rendimiento: 1000,
      unidad: 'ml',
      lineas: [{ nombre: 'AZÚCAR', cantidad: 500, unidad: 'gr' }],
    });
  });

  it('un campo de costo que llegara de la RPC no pasa (proyección explícita)', () => {
    const conCosto = {
      ...rpc,
      productos: [{ ...rpc.productos[0], costo: 12, precio_lista: 75 }],
      lineas: rpc.lineas.map((l) => ({ ...l, costo_unitario: 0.4 })),
    } as unknown as RpcFicha;
    expect(JSON.stringify(armarFicha(conCosto))).not.toMatch(/costo|precio/);
  });

  it('cantidades legibles', () => {
    expect(cantidadTexto(18)).toBe('18');
    expect(cantidadTexto(0.125)).toBe('0.13');
  });
});

const fila = (tienda: string, fecha: string, o: Partial<FilaDiaRpc> = {}): FilaDiaRpc => ({
  tienda,
  fecha,
  pedidos: 10,
  rech_cbpi: 0,
  rech_cbpr: 0,
  rech_tienda_cerrada: 0,
  rech_sin_stock: 0,
  rech_demora: 0,
  finalizados: 10,
  recl_mal_estado: 0,
  recl_faltante: 0,
  recl_incorrecto: 0,
  disponibilidad: null,
  indisponibilidad: null,
  cocina_pedidos: 10,
  cocina_demorada: 0,
  sin_disp_minutos: null,
  espera_repartidor: null,
  ...o,
});

describe('nivel de servicio', () => {
  it('ventanas de 7 y 30 días que terminan en el último día publicado; por día suma las tiendas', () => {
    const s = armarServicio({
      tiendas: 2,
      actualizado_hasta: '2026-11-18',
      dias: [
        fila('A', '2026-10-01', { cocina_demorada: 9 }), // fuera de los 30 días
        fila('A', '2026-11-10', { cocina_demorada: 5 }), // fuera de la semana
        fila('A', '2026-11-18', { cocina_demorada: 1, espera_repartidor: 6, finalizados: 18 }),
        fila('B', '2026-11-18', {
          cocina_demorada: 2,
          rech_demora: 1,
          espera_repartidor: 10,
          finalizados: 6,
        }),
      ],
    });
    expect(s.semana).toMatchObject({
      desde: '2026-11-12',
      cocinaPedidos: 20,
      cocinaDemorada: 3,
      tasaCocina: 0.15,
    });
    expect(s.semana.rechazos.demora).toBe(1);
    expect(s.semana.espera).toBe(7); // (6·18 + 10·6) / 24
    expect(s.mes).toMatchObject({ desde: '2026-10-20', cocinaPedidos: 30, cocinaDemorada: 8 });
    expect(s.porDia.map((d) => [d.fecha, d.cocinaDemorada])).toEqual([
      ['2026-11-18', 3],
      ['2026-11-10', 5],
      ['2026-10-01', 9],
    ]);
  });

  it('sin datos publicados: ventanas vacías', () => {
    const s = armarServicio({ tiendas: 1, actualizado_hasta: null, dias: [] });
    expect(s.semana.cocinaPedidos).toBe(0);
    expect(s.semana.tasaCocina).toBeNull();
  });
});
