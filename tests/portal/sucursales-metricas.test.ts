import { describe, expect, it } from 'vitest';
import { centavos, normalizar, type PedidoNormal } from '../../lib/sucursales/normalizar';
import {
  conciliar,
  curvaAcumulada,
  filtrarOrigen,
  hastaCorte,
  insightsVivo,
  pagos,
  personalizaciones,
  productos,
  resumen,
  variacion,
} from '../../lib/sucursales/metricas';
import { pedido } from './sucursales-fixtures';

const cfg = { companyId: 612, modoTiempo: 'local-etiquetada-z' as const, zona: 'America/Ciudad_Juarez' };
const v = { desde: '2026-10-21', hasta: '2026-10-21' };
const norm = (rs: unknown[], ventana = v) => normalizar(rs as Record<string, unknown>[], cfg, ventana);

describe('normalización', () => {
  it('centavos enteros sin errores de punto flotante', () => {
    expect(centavos(116.1)).toBe(11610);
    expect(centavos(54.6)).toBe(5460);
    expect(centavos(0.1 + 0.2)).toBe(30);
  });

  it('venta = líneas + personalizaciones; descuento de línea en % ya aplicado; origen desde fromSmartphone', () => {
    const { pedidos } = norm([
      pedido('2026-10-21', '09:00:00'),
      pedido('2026-10-21', '10:00:00', {
        fromSmartphone: true,
        paymentMethod: 'VIRTUAL_WALLET',
        paymentType: 'WALLET',
        refundId: null,
        grossAmount: 116.1,
        netAmout: 104.6,
        discount: 12.9,
        items: [
          { defaultCode: 'CPU', productName: 'Pumpkin Latte', amount: 116.1, discount: 10, itemsCustom: [] },
        ],
      }),
    ]);
    const [app, mostrador] = pedidos;
    expect(mostrador).toMatchObject({
      ventaCent: 16500,
      origen: 'mostrador',
      cuadra: true,
      hora: '09:00:00',
    });
    expect(app).toMatchObject({ ventaCent: 11610, descuentoCent: 1290, origen: 'app', cuadra: true });
    expect(app.lineas[0]).toMatchObject({ importeCent: 11610, descuentoPct: 10 });
    // No se conservan campos que no deben llegar al navegador.
    expect(JSON.stringify(pedidos)).not.toMatch(/refundId|netAmout|uuid-sintetico|percentageOfTransfer/);
  });

  it('un dato inválido no se vuelve cero: se excluye y se cuenta', () => {
    const r = norm([
      pedido('2026-10-21', '09:00:00', { grossAmount: null as unknown as number }),
      pedido('2026-10-21', '09:00:00', { discount: Number.NaN }),
      pedido('2026-10-21', '09:00:00', { createdAt: '21/10/2026 09:00' }),
      pedido('2026-10-21', '09:00:00', { fromSmartphone: null }),
    ]);
    expect(r.invalidos).toBe(3);
    expect(r.pedidos).toHaveLength(1);
    expect(r.pedidos[0].origen).toBe('desconocido');
  });

  it('un pedido fuera de la ventana delata una interpretación horaria equivocada', () => {
    const r = norm([pedido('2026-10-22', '00:30:00')]);
    expect(r).toMatchObject({ fueraDeVentana: 1, pedidos: [] });
  });

  it('un pedido que no cuadra se marca y se reporta en la conciliación, sin ajustarse', () => {
    const { pedidos } = norm([pedido('2026-10-21', '09:00:00', { grossAmount: 170 })]);
    expect(pedidos[0].cuadra).toBe(false);
    expect(conciliar(pedidos)).toEqual({
      ventaCent: 17000,
      productosCent: 16500,
      diferenciaCent: 500,
      pedidosNoCuadran: 1,
      soloRedondeo: false,
      rappiSinNumeroOrden: 0,
    });
  });

  it('±1 centavo por pedido (redondeo del proveedor con % en líneas y customs) se distingue de un descuadre', () => {
    // Caso real de Polanco: 61.2 + 11.7 = 72.90, pero el proveedor reporta 72.91.
    const { pedidos } = norm([
      pedido('2026-10-21', '09:00:00', {
        grossAmount: 72.91,
        discount: 8.1,
        items: [
          {
            defaultCode: 'X',
            productName: 'Latte',
            amount: 61.2,
            discount: 10,
            itemsCustom: [{ defaultCode: 'Y', productName: 'Shot', amount: 11.7, discount: 10 }],
          },
        ],
      }),
    ]);
    expect(conciliar(pedidos)).toMatchObject({ diferenciaCent: 1, pedidosNoCuadran: 1, soloRedondeo: true });
  });
});

const ps = (): PedidoNormal[] =>
  norm([
    pedido('2026-10-21', '08:10:00'),
    pedido('2026-10-21', '08:40:00', {
      discount: 18,
      grossAmount: 147,
      items: [
        { defaultCode: '4MIL', productName: 'Matcha Iced Latte', amount: 72, discount: 20, itemsCustom: [] },
        { defaultCode: 'BRO13', productName: 'Brownie', amount: 75, discount: 0, itemsCustom: [] },
      ],
    }),
    pedido('2026-10-21', '12:00:00', { fromSmartphone: true, paymentMethod: 'VIRTUAL_WALLET' }),
    pedido('2026-10-21', '12:00:01', { paymentMethod: 'DINHEIRO' }),
  ]).pedidos;

describe('métricas', () => {
  it('resumen: venta, ticket, descuento con base explícita (venta + descuento)', () => {
    const r = resumen(ps());
    expect(r).toMatchObject({
      ventaCent: 16500 * 3 + 14700,
      pedidos: 4,
      descuentoCent: 1800,
      pedidosConDescuento: 1,
      lineas: 8,
    });
    expect(r.ticketCent).toBe(Math.round((16500 * 3 + 14700) / 4));
    expect(r.tasaDescuento).toBeCloseTo(1800 / (16500 * 3 + 14700 + 1800));
    expect(resumen([])).toMatchObject({ ventaCent: 0, ticketCent: null, tasaDescuento: null });
  });

  it('variación sin base comparable nunca divide entre cero', () => {
    expect(variacion(100, 0)).toBeNull();
    expect(variacion(100, null)).toBeNull();
    expect(variacion(150, 100)).toBeCloseTo(0.5);
  });

  it('corte inclusivo al segundo y curva acumulada por hora', () => {
    const corte = 12 * 3600;
    expect(hastaCorte(ps(), corte)).toHaveLength(3);
    const curva = curvaAcumulada(ps());
    expect(curva[7]).toBe(0);
    expect(curva[8]).toBe(16500 + 14700);
    expect(curva[23]).toBe(resumen(ps()).ventaCent);
  });

  it('productos: importe atribuible = línea + customs una sola vez; Σ productos = venta', () => {
    const lista = productos(ps());
    const latte = lista.find((p) => p.codigo === '4MIL')!;
    expect(latte.importeCent).toBe(3 * 9000 + 7200);
    expect(latte.extraCustomsCent).toBe(3 * 1300);
    expect(latte.lineas).toBe(4);
    expect(latte.tamanos).toEqual([{ nombre: 'Regular - 440ml', lineas: 3 }]);
    expect(latte.customs[0]).toMatchObject({ nombre: 'Oatmilk', veces: 3, importeCent: 3900 });
    expect(lista.reduce((s, p) => s + p.importeCent, 0)).toBe(resumen(ps()).ventaCent);
    expect(conciliar(ps()).diferenciaCent).toBe(0);
    expect(personalizaciones(ps()).map((c) => c.nombre)).toEqual(['Oatmilk']);
  });

  // Datos reales: desde el 2026-10-02 la App manda defaultCode null (padre) y "" (customs). Ver conciliacion-brasil/05.
  const sinCodigo = (fecha: string, hora: string) =>
    pedido(fecha, hora, {
      fromSmartphone: true,
      paymentMethod: 'VIRTUAL_WALLET',
      items: [
        {
          defaultCode: null,
          productName: 'Matcha Iced Latte',
          amount: 77,
          discount: 0,
          itemsCustom: [
            { defaultCode: '', productName: 'Large - 600ml', amount: 10, discount: 0 },
            { defaultCode: '', productName: 'Double shot (36ml)', amount: 0, discount: 0 },
          ],
        },
        { defaultCode: null, productName: 'Pan de Muerto', amount: 78, discount: 0, itemsCustom: [] },
      ],
      grossAmount: 165,
    });
  const generico = (hora: string, amount: number) =>
    pedido('2026-10-21', hora, {
      paymentMethod: 'RAPPI',
      paymentType: 'CREDIT',
      items: [{ defaultCode: 'GENERIC', productName: 'Generic', amount, discount: 0, itemsCustom: [] }],
      grossAmount: amount,
    });

  it('productos: una línea sin código se une al código del mismo nombre; los totales no cambian', () => {
    const conMezcla = norm([pedido('2026-10-21', '09:00:00'), sinCodigo('2026-10-21', '10:00:00')]).pedidos;
    const lista = productos(conMezcla);
    expect(lista.filter((p) => p.nombre === 'Matcha Iced Latte')).toHaveLength(1);
    const latte = lista.find((p) => p.codigo === '4MIL')!;
    expect(latte.lineas).toBe(2);
    expect(latte.tamanos).toHaveLength(2);
    expect(latte.tamanos).toEqual(
      expect.arrayContaining([
        { nombre: 'Regular - 440ml', lineas: 1 },
        { nombre: 'Large - 600ml', lineas: 1 },
      ]),
    );
    // Sin ningún código conocido para ese nombre, se agrupa por nombre (no se inventa un código).
    expect(lista.find((p) => p.nombre === 'Pan de Muerto')).toMatchObject({
      codigo: 'Pan de Muerto',
      lineas: 1,
    });
    const venta = conMezcla.reduce((s, p) => s + p.ventaCent, 0);
    expect(lista.reduce((s, p) => s + p.importeCent, 0)).toBe(venta);
    expect(lista.reduce((s, p) => s + p.extraCustomsCent, 0)).toBe(1300 + 1000);
    expect(lista.reduce((s, p) => s + p.lineas, 0)).toBe(4);
  });

  it('tamaños: solo vasos; shots y dosis con ml quedan como personalizaciones', () => {
    const lista = productos(norm([sinCodigo('2026-10-21', '10:00:00')]).pedidos);
    expect(lista[0].tamanos).toEqual([{ nombre: 'Large - 600ml', lineas: 1 }]);
    expect(lista[0].customs.map((c) => c.nombre)).toEqual(['Double shot (36ml)']);
    expect(
      personalizaciones(norm([sinCodigo('2026-10-21', '10:00:00')]).pedidos).map((c) => c.nombre),
    ).toEqual(['Double shot (36ml)']);
  });

  it('Generic: visible con su peso, rotulado sin identificación y con el nombre crudo del proveedor', () => {
    const lista = productos(
      norm([generico('09:00:00', 199), generico('09:30:00', 111), pedido('2026-10-21', '10:00:00')]).pedidos,
    );
    const g = lista.find((p) => p.codigo === 'GENERIC')!;
    expect(g).toMatchObject({
      nombre: 'Generic (sin identificación del proveedor)',
      nombreProveedor: 'Generic',
      importeCent: 31000,
      lineas: 2,
      pedidos: 2,
    });
    expect(lista[0]).toBe(g);
    expect(lista.reduce((s, p) => s + p.importeCent, 0)).toBe(31000 + 16500);
    expect(lista.find((p) => p.codigo === '4MIL')).not.toHaveProperty('nombreProveedor');
  });

  it('filtro de origen y pagos con etiquetas', () => {
    expect(filtrarOrigen(ps(), 'app')).toHaveLength(1);
    expect(filtrarOrigen(ps(), 'mostrador')).toHaveLength(3);
    const p = pagos(ps());
    expect(p.map((x) => x.etiqueta)).toEqual(['Tarjeta', 'Efectivo', 'Monedero virtual']);
    expect(p.reduce((s, x) => s + (x.participacion ?? 0), 0)).toBeCloseTo(1);
  });

  it('insights: sin comparativos si alguna lectura está incompleta; silencio solo con base suficiente', () => {
    const hoy = ps();
    const base = norm(
      Array.from({ length: 6 }, (_, i) => pedido('2026-10-14', `12:${20 + i}:00`)),
      { desde: '2026-10-14', hasta: '2026-10-14' },
    ).pedidos;
    const corte = 12 * 3600 + 40 * 60;
    const completos = insightsVivo({ hoy, base, baseFecha: '2026-10-14', corte, completos: true });
    expect(completos.map((i) => i.id)).toEqual(['comparativo', 'ritmo', 'silencio', 'descuentos', 'top']);
    expect(completos[0].texto).toContain('miércoles');
    const parciales = insightsVivo({ hoy, base, baseFecha: '2026-10-14', corte, completos: false });
    expect(parciales.map((i) => i.id)).toEqual(['top']);
    const sinBase = insightsVivo({ hoy, base: [], baseFecha: '2026-10-14', corte, completos: true });
    expect(sinBase[0].texto).toMatch(/Sin base comparable/);
  });
});
