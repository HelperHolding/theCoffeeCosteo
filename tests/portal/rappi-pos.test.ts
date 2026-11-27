import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { horaRappiEnZona, lineasDe, mismaHoraQueRappi, opcionPos, pedidoRappiAPos } from '@/lib/sucursales/rappi-pos';
import type { PedidoRappi, ProductoRappi } from '@/lib/sucursales/rappi-portal';
import { conRappi, type LecturaNormal } from '@/lib/sucursales/datos';
import { claveCosto, costear, type DatosCosteo } from '@/lib/sucursales/costeo';
import { claveConsumo, consumir, type DatosConsumo } from '@/lib/sucursales/consumo';
import type { PedidoNormal } from '@/lib/sucursales/normalizar';

const producto = (
  nombre: string,
  precio: number,
  opciones: [string, string, number?][] = [],
  unidades = 1,
): ProductoRappi => ({
  nombre,
  unidades,
  precio,
  opciones: opciones.map(([categoria, descripcion, p = 0]) => ({
    categoria,
    descripcion,
    precio: p,
    unidades: 1,
  })),
});
const pedido = (
  id: string,
  estado: string,
  productos: ProductoRappi[],
  creado = '2026-10-27T13:05:09',
): PedidoRappi => ({
  id,
  tienda: 'MX1930270777',
  creado,
  fecha: creado.slice(0, 10),
  estado,
  estado_nombre: 'Terminada',
  en_disputa: false,
  estado_disputa: null,
  metodo_pago: 'Tarjeta de Crédito',
  bruto: productos.reduce((s, x) => s + x.precio, 0),
  descuento_aliado: 12.5,
  estado_anterior: null,
  revisar: false,
  cambios: 0,
  productos,
});
const nombres = (cs: { nombre: string }[]) => cs.map((c) => c.nombre);

// «Crea tu The Coffee» real: bebida y sándwich elegidos, tamaño y leche con precio.
const creaTu = (bebida: string, sandwich: string, extra: [string, string, number?][] = []) =>
  producto('Crea tu The Coffee', 149 + 15, [
    ['Elige tu Bebida', bebida],
    ['Elige el Tamaño', 'Grande 590 ml', 15],
    ['Elige tu Sandwich', sandwich],
    ...extra,
  ]);

describe('acompañamientos de Rappi → personalizaciones del POS', () => {
  it('vasos, leches, shots y jarabes por lista explícita; Rappi escribe la categoría con variantes', () => {
    expect(opcionPos('Elige el Tamaño', 'Grande 590 ml', '5IL')).toBe('Large - 600ml');
    expect(opcionPos('Elige el tamaño', 'Tradicional 240 ml', '4TW')).toBe('Regular - 240ml');
    expect(opcionPos('Elige el tamaño', 'Mediano 440 ml', '5IL')).toBe('Regular - 440ml');
    expect(opcionPos('Leche.', 'Deslactosada', '5IL')).toBe('Lactose free');
    expect(opcionPos('Leche Latte', 'Leche De Coco', '5IL')).toBe('Coconut Milk');
    expect(opcionPos('Café', 'Extra Double Shot (+36ml)', '2AM')).toBe('Extra Double shot (36ml)');
    // La vainilla depende de la receta: 10 ml en Vanilla Latte, 15 ml en Iced Vanilla.
    expect(opcionPos('Vainilla', 'Medio', '2VLT')).toBe('Average Vanilla (10ml)');
    expect(opcionPos('Vainilla', 'Medio', '1IC')).toBe('Average Vanilla (15ml)');
  });

  it('creamer de Pumpkin (solo Rappi): cantidad total, como la vainilla con ml', () => {
    expect(opcionPos('Ajusta tu creamer', 'Medio - 30 ml de creamer', 'CPUMLAAPP')).toBe(
      'Average Creamer (30ml)',
    );
    expect(opcionPos('Ajusta tu creamer', 'Mas - 40 ml de creamer', 'CPUMLAAPP')).toBe('More Creamer (40ml)');
    expect(opcionPos('Ajusta tu creamer', 'Menos - 20 ml de creamer', 'CPUMLAAPP')).toBe(
      'Less Creamer (20ml)',
    );
  });

  it('sin equivalencia conserva el texto de Rappi (no calculado); los descriptivos se omiten', () => {
    expect(opcionPos('Coco Vainilla', 'Promedio', 'SOLAAUAPP')).toBe('Coco Vainilla: Promedio');
    expect(opcionPos('Vainilla', 'Medio', 'CPUMLAAPP')).toBe('Vainilla: Medio');
    expect(opcionPos('Personaliza tu Iced Latte', 'Iced Latte', 'MISICEDAPP')).toBeNull();
  });
});

describe('líneas de un producto de Rappi', () => {
  it('una línea por unidad, como el POS; la suma es el precio del renglón', () => {
    const ls = lineasDe(
      producto(
        'Vainilla Latte ',
        248.01,
        [
          ['Leche.', 'Avena', 17],
          ['Vainilla', 'Medio'],
        ],
        3,
      ),
    );
    expect(ls).toHaveLength(3);
    expect(ls.every((l) => l.codigo === '2VLT' && l.nombre === 'Vainilla Latte')).toBe(true);
    expect(nombres(ls[0].customs)).toEqual(['Oatmilk', 'Average Vanilla (10ml)', 'Large - 355ml']);
    const total = ls.reduce(
      (s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0),
      0,
    );
    expect(total).toBe(24801);
    expect(ls.map((l) => l.customs[0].importeCent)).toEqual([566, 566, 568]);
  });

  it('las bebidas que Rappi vende sin tamaño son las grandes, con el vaso Large del POS', () => {
    expect(nombres(lineasDe(producto('Americano', 69, [['Leche', 'Sin Leche']]))[0].customs)).toEqual([
      'No Milk (Americano)',
      'Large - 355ml',
    ]);
    expect(nombres(lineasDe(producto('Taro Frappé', 122, [['Leche.', 'Entera']]))[0].customs)).toEqual([
      'Milk',
      'Large - 600ml',
    ]);
    // Si Rappi sí manda el tamaño, manda Rappi; un producto fuera de la lista no recibe vaso.
    expect(
      nombres(lineasDe(producto('Americano', 69, [['Elige el tamaño', 'Tradicional 240 ml']]))[0].customs),
    ).toEqual(['Regular - 240ml']);
    expect(lineasDe(producto('Pan de Muerto Tradicional', 75))[0].customs).toEqual([]);
  });

  it('desde el 2026-11-03 Rappi manda los dos tamaños: «Elige tu tamaño» cuenta, y un tamaño desconocido no es Grande', () => {
    expect(opcionPos('Elige tu tamaño.', 'Grande 355 ml', '4TW')).toBe('Large - 355ml');
    expect(
      nombres(
        lineasDe(producto('Pumpkin Latte', 89, [['Elige tu tamaño.', 'Tradicional 240 ml']]))[0].customs,
      ),
    ).toEqual(['Regular - 240ml']);
    // Un texto que no está en la lista queda a la vista (fuera por tamaño), sin sumarle el Large por omisión.
    expect(
      nombres(lineasDe(producto('Americano', 59, [['Elige el Tamaño', 'Chica 240 ml']]))[0].customs),
    ).toEqual(['Elige el Tamaño: Chica 240 ml']);
  });

  it('tamaño sin ml (desde el 2026-11-11): la palabra da el tamaño y la bebida los ml (Carlos, 2026-11-18)', () => {
    // Calientes: Tradicional 240 ml y Grande 355 ml; frías: Tradicional 440 ml y Grande 600 ml, en POS y Rappi.
    expect(opcionPos('Elige el Tamaño', 'Tradicional', '4TW')).toBe('Regular - 240ml');
    expect(opcionPos('Elige el Tamaño', 'Grande', '4TW')).toBe('Large - 355ml');
    expect(opcionPos('Elige tu tamaño.', 'Tradicional', '5IL')).toBe('Regular - 440ml');
    expect(opcionPos('Elige tu tamaño.', 'Grande', '1IC')).toBe('Large - 600ml');
    expect(opcionPos('Elige el tamaño caliente', 'Tradicional 240 ml', '4TW')).toBe('Regular - 240ml');
    // Los ml de Rappi no mandan: un Americano «Grande 590 ml» es el Grande caliente (355 ml).
    expect(opcionPos('Elige el Tamaño', 'Grande 590 ml.', '2AM')).toBe('Large - 355ml');
    expect(opcionPos('Elige el Tamaño', 'Mediano 440  ml', '2SC')).toBe('Regular - 440ml');
    expect(
      nombres(lineasDe(producto('Iced Vanilla', 99, [['Elige el Tamaño', 'Grande']]))[0].customs),
    ).toEqual(['Large - 600ml']);
    // Hot Drip V60 solo existe en Tradicional caliente: es de tamaño Único y el tamaño de Rappi no es un vaso.
    expect(lineasDe(producto('Hot Drip V60', 69, [['Elige el Tamaño', 'Tradicional']]))[0].customs).toEqual(
      [],
    );
  });

  it('Métodos: Cold Drip V60 va en el vaso chico; Hot Drip V60 es de tamaño Único y no lleva vaso', () => {
    expect(nombres(lineasDe(producto('Cold Drip V60', 75))[0].customs)).toEqual(['Regular - 440ml']);
    expect(lineasDe(producto('Hot Drip V60', 69))[0].customs).toEqual([]);
  });

  it('un producto sin equivalencia queda con un código que nunca es del POS', () => {
    expect(lineasDe(producto('Triple Frap', 199))[0].codigo).toBe('RAPPI:triple frap');
  });

  it('lo que aún no tiene receta queda ligado a su código del POS: cuenta solo cuando el código tenga receta', () => {
    expect(lineasDe(producto('Spooky Biscuits', 70))[0].codigo).toBe('SPOBISAPP');
    expect(lineasDe(producto('Cookie Matcha & White Chocolate', 70))[0].codigo).toBe('COOMATAPP');
  });

  it('Peppermint Mocha (alta 2026-11-17): los 4 nombres de Rappi van al código del POS, con su vaso y su leche', () => {
    const codigo = (nombre: string) => lineasDe(producto(nombre, 99))[0].codigo;
    expect(codigo('Peppermint Mocha Latte')).toBe('PEPMOLAPP');
    expect(codigo('Peppermint Mocha Iced Latte')).toBe('PEPMIALPP');
    expect(codigo('Peppermint Mocha Matcha Latte')).toBe('PEPMMLAPP');
    // En Rappi el Iced Matcha del POS se llama «Matcha Iced Latte».
    expect(codigo('Peppermint Mocha Matcha Iced Latte')).toBe('PEPIMLAPP');
    // Opciones tal como llegan en los pedidos reales (punto final y espacios dobles incluidos).
    const [l] = lineasDe(
      producto('Peppermint Mocha Iced Latte', 111, [
        ['Elige el tamaño', 'Grande 590 ml.', 12],
        ['Leche.', 'Deslactosada', 13],
        ['Café', 'Double shot (36ml)'],
      ]),
    );
    expect(nombres(l.customs)).toEqual(['Large - 600ml', 'Lactose free', 'Double shot (36ml)']);
    expect(
      nombres(
        lineasDe(
          producto('Peppermint Mocha Matcha Iced Latte', 99, [['Elige el tamaño', 'Mediano 440  ml']]),
        )[0].customs,
      ),
    ).toEqual(['Regular - 440ml']);
  });

  it('auditoría 2026-11-27: los nombres de Rappi del menú del POS quedan ligados a su código, con o sin texto en japonés', () => {
    const codigo = (nombre: string) => lineasDe(producto(nombre, 100))[0].codigo;
    expect(codigo('Croque Monsieur')).toBe('CROQMNAPP');
    expect(codigo('Kit White Bag 1kg')).toBe('KITWHIAPP');
    expect(codigo('Kraft Edition 250g')).toBe('2CBKE');
    expect(codigo('Kraft Edition 250g クラフト版')).toBe('2CBKE');
    expect(codigo('White Bag 250g グラウンドコーヒー')).toBe('1CBWB');
    expect(codigo('Gelato Frappé Chai')).toBe('SHCI');
    expect(codigo('Sandwich Jamón, Queso. Tomate y Orégano.')).toBe('BR3');
    expect(codigo('Zoé Water')).toBe('ZOEWATAPP');
    // Sin receta todavía: ligados a su código, cuentan cuando el código tenga receta.
    expect(codigo('Foam Coconut Matcha')).toBe('FOACMAAPP');
  });

  it('el sabor del Félix Schorle y del Zoe Twist no es personalización: los dos sabores cuestan lo mismo', () => {
    const [felix] = lineasDe(
      producto('Félix Schorle', 82, [['Elige el Sabor de tú Felix Schorle', 'Frambuesa Jalisco']]),
    );
    expect(felix).toMatchObject({ codigo: 'FELSCHAPP', customs: [] });
    const [zoe] = lineasDe(producto('Zoe Water Twist', 58, [['Elige el sabor de tu zoe', 'Frutos Rojos']]));
    expect(zoe).toMatchObject({ codigo: 'ZOETWIAPP', customs: [] });
  });

  it('Pan de Muerto (doc 39): el Tradicional es el del POS; el de Naranja, su código propio de Rappi', () => {
    expect(lineasDe(producto('Pan de Muerto Tradicional.', 80))[0].codigo).toBe('PANMUEAPP');
    expect(lineasDe(producto('Pan de Muerto con Glaseado de Naranja.', 80))[0].codigo).toBe('RAPPIPANMUENAR');
  });

  it('el sabor decide el producto: Kouign Amann Dulce de Leche con «Avellana» es el de avellana', () => {
    const kouign = (sabor?: string) =>
      lineasDe(producto('Kouign Amann Dulce de Leche', 75, sabor ? [['Elige Tu Favorito', sabor]] : []))[0];
    // Toma el nombre del de avellana: el nombre «Dulce de Leche» nunca queda con dos códigos.
    expect(kouign('Avellana')).toMatchObject({
      codigo: 'KOAMAVAPP',
      nombre: 'Kouign Amann Hazelnut',
      importeCent: 7500,
      customs: [],
    });
    expect(kouign('Dulce de Leche')).toMatchObject({
      codigo: 'KOAMDLAPP',
      nombre: 'Kouign Amann Dulce de Leche',
      customs: [],
    });
    expect(kouign().codigo).toBe('KOAMDLAPP');
    expect(lineasDe(producto('Kouign Amann Hazelnut', 75))[0].codigo).toBe('KOAMAVAPP');
  });

  it('combo solo de Rappi: se arma con sus partes y sus personalizaciones; el precio va en la línea', () => {
    const [l] = lineasDe(creaTu('Iced Latte', 'Sándwich Jamón y Queso', [['Leche', 'Avena', 17]]));
    expect(l.codigo).toBe('RAPPI-COMBO:crea tu the coffee');
    expect(l.importeCent + l.customs.reduce((s, c) => s + c.importeCent, 0)).toBe(16400);
    // Las partes conservan el precio de cada opción solo para saber si tuvo costo extra; la venta sale de la línea.
    expect(l.partes).toEqual([
      {
        codigo: '5IL',
        nombre: 'Iced Latte',
        customs: [
          { codigo: 'RAPPI', nombre: 'Large - 600ml', importeCent: 1500, descuentoPct: 0 },
          { codigo: 'RAPPI', nombre: 'Oatmilk', importeCent: 1700, descuentoPct: 0 },
        ],
      },
      { codigo: 'MQ1', nombre: 'Sándwich Jamón y Queso', customs: [] },
    ]);
    const [pan] = lineasDe(
      producto('Pan de Muerto Tradicional + True White', 120, [['Elige el tamaño', 'Tradicional 240 ml']]),
    );
    expect(pan.partes?.map((p) => [p.codigo, nombres(p.customs)])).toEqual([
      ['4TW', ['Regular - 240ml']],
      ['PANMUEAPP', []],
    ]);
  });

  it('The Perfect Match (2026-11-27): bebida y match elegidos, con los jarabes de la bebida', () => {
    const [l] = lineasDe(
      producto('The Perfect Match', 236, [
        ['Elige Tu Bebida', 'Iced Vainilla'],
        ['Elige el Tamaño', 'Tradicional'],
        ['Vainilla', 'Más'],
        ['Leche.', 'Deslactosada'],
        ['Elige Tu Match', 'Croissant Jamón y Queso'],
        ['Con Mayonesa de Chipotle', 'Sin Mayonesa Chipotle'],
      ]),
    );
    expect(l.codigo).toBe('RAPPI-COMBO:the perfect match');
    expect(l.importeCent).toBe(23600);
    expect(l.partes?.map((p) => [p.codigo, nombres(p.customs)])).toEqual([
      ['1IC', ['Regular - 440ml', 'More Vanilla (20ml)', 'Lactose free']],
      ['CROSTUAPP', ['Without Chipotle Mayo']],
    ]);
    const [caramelo] = lineasDe(
      producto('The Perfect Match', 236, [
        ['Elige tu Bebida', 'Salted caramel'],
        ['Caramelo Salado', 'Medio'],
        ['Elige tu Match', 'Cinnamon Roll'],
      ]),
    );
    expect(caramelo.partes?.map((p) => [p.codigo, nombres(p.customs)])).toEqual([
      ['2SC', ['Average Salted Caramel (cold)']],
      ['5CR', []],
    ]);
  });
});

describe('pedido de Rappi en la forma del POS', () => {
  it('origen rappi, hora local del portal, ID de Rappi y descuento del aliado; cancelados fuera', () => {
    const p = pedidoRappiAPos(
      pedido('2950000001', 'finished', [producto('Iced Latte', 89), producto('Brownie', 59)]),
    )!;
    expect(p).toMatchObject({
      fecha: '2026-10-27',
      hora: '13:05:09',
      segundo: 13 * 3600 + 5 * 60 + 9,
      origen: 'rappi',
      metodo: 'RAPPI',
      tipo: 'RAPPI_PORTAL',
      // Sin descuento_venta (la RPC no lo trae), nada se resta: el descuento del aliado queda como de Rappi.
      ventaCent: 14800,
      brutoCent: 14800,
      descuentoCent: 0,
      descuentoRappiCent: 1250,
      netoCent: null,
      numeroPedidoRappi: '2950000001',
      cuadra: true,
    });
    expect(p.lineas.map((l) => l.codigo)).toEqual(['5IL', 'BRO13']);
    expect(pedidoRappiAPos(pedido('2', 'canceled_by_automation', [producto('Iced Latte', 89)]))).toBeNull();
    expect(
      pedidoRappiAPos({ ...pedido('3', 'finished', [producto('Iced Latte', 89)]), bruto: 90 })!.cuadra,
    ).toBe(false);
  });
  it('venta neta = bruto − descuento que paga la tienda; Pro Rewards aparte; líneas prorrateadas a la venta', () => {
    const base = pedido('2950000002', 'finished', [producto('Iced Latte', 89), producto('Brownie', 59)]);
    const p = pedidoRappiAPos({ ...base, descuento_aliado: 30, descuento_venta: 12.5 })!;
    expect(p).toMatchObject({
      ventaCent: 13550,
      brutoCent: 14800,
      descuentoCent: 1250,
      descuentoRappiCent: 1750,
      cuadra: true,
    });
    const suma = p.lineas.reduce(
      (s, l) => s + l.importeCent + l.customs.reduce((t, c) => t + c.importeCent, 0),
      0,
    );
    expect(suma).toBe(13550);
    // Nunca más descuento que el bruto ni negativo.
    expect(pedidoRappiAPos({ ...base, descuento_aliado: 500, descuento_venta: 500 })!.ventaCent).toBe(0);
    expect(pedidoRappiAPos({ ...base, descuento_aliado: 5, descuento_venta: -3 })!.ventaCent).toBe(14800);
  });
});

describe('hora de Rappi en la zona de la sucursal', () => {
  // El portal manda la hora del centro para todas las tiendas (número de pedido correlativo, 2026-11-15).
  const h = (fecha: string, hhmm: string, zona: string) => {
    const [a, b] = hhmm.split(':').map(Number);
    const r = horaRappiEnZona(fecha, a * 3600 + b * 60, zona);
    return `${r.fecha} ${String(Math.floor(r.segundo / 3600)).padStart(2, '0')}:${String((r.segundo % 3600) / 60).padStart(2, '0')}`;
  };
  it('el centro y Juárez (reloj del POS en UTC−6) no cambian', () => {
    expect(h('2026-11-12', '13:05', 'America/Mexico_City')).toBe('2026-11-12 13:05');
    expect(h('2026-11-12', '13:05', 'Etc/GMT+6')).toBe('2026-11-12 13:05');
    expect(h('2026-11-12', '13:05', 'America/Monterrey')).toBe('2026-11-12 13:05');
  });
  it('Tijuana (reloj del POS en UTC−7) y Hermosillo una hora antes; Cancún una después', () => {
    expect(h('2026-11-12', '13:05', 'Etc/GMT+7')).toBe('2026-11-12 12:05');
    expect(h('2026-11-12', '13:05', 'America/Hermosillo')).toBe('2026-11-12 12:05');
    expect(h('2026-11-12', '13:05', 'America/Cancun')).toBe('2026-11-12 14:05');
  });
  it('cerca de la medianoche cambia de día', () => {
    expect(h('2026-11-12', '00:30', 'America/Hermosillo')).toBe('2026-11-11 23:30');
    expect(h('2026-11-12', '23:30', 'America/Cancun')).toBe('2026-11-13 00:30');
  });
  it('solo las zonas con otra hora leen días de más', () => {
    for (const z of ['America/Mexico_City', 'America/Monterrey', 'America/Merida', 'Etc/GMT+6'])
      expect(mismaHoraQueRappi(z, '2026-11-12')).toBe(true);
    for (const z of ['Etc/GMT+7', 'America/Hermosillo', 'America/Cancun'])
      expect(mismaHoraQueRappi(z, '2026-11-12')).toBe(false);
  });
  it('pedidoRappiAPos usa la zona de la sucursal', () => {
    const p = pedidoRappiAPos(pedido('7', 'finished', [producto('Iced Latte', 89)], '2026-11-12T00:15:09'), 'Etc/GMT+7')!;
    expect(p).toMatchObject({ fecha: '2026-11-11', hora: '23:15:09', segundo: 23 * 3600 + 15 * 60 + 9 });
  });
});

describe('POS + Rappi del portal', () => {
  const pos = (numeroPedidoRappi: string | null, fecha = '2026-10-27'): PedidoNormal => ({
    id: 1,
    fecha,
    segundo: 36000,
    hora: '10:00:00',
    origen: numeroPedidoRappi ? 'rappi' : 'mostrador',
    ventaCent: 8900,
    netoCent: null,
    descuentoCent: 0,
    metodo: 'CARTAO',
    tipo: 'CREDIT',
    lineas: [],
    numeroPedidoRappi,
    cuadra: true,
  });
  const lectura = (o: Partial<LecturaNormal> = {}): LecturaNormal => ({
    desde: '2026-10-27',
    hasta: '2026-10-27',
    leidoEn: 0,
    estado: 'completa',
    error: null,
    avisos: [],
    totalDeclarado: 2,
    pedidos: [pos(null), pos('2950000009')],
    ...o,
  });
  const rappi = [
    pedidoRappiAPos(pedido('2950000001', 'finished', [producto('Iced Latte', 89)], '2026-10-27T18:00:00'))!,
    pedidoRappiAPos(pedido('2950000009', 'finished', [producto('Iced Latte', 89)]))!,
    pedidoRappiAPos(pedido('2950000002', 'finished', [producto('Iced Latte', 89)], '2026-10-28T09:00:00'))!,
  ];

  it('suma los del periodo, sin repetir los que ya llegaron por el POS, y ordena del más reciente', async () => {
    const l = await conRappi(lectura(), async () => rappi);
    // El repetido (…09) lleva la hora del portal (13:05), más tarde que el del mostrador (10:00).
    expect(l.pedidos.map((p) => p.numeroPedidoRappi)).toEqual(['2950000001', '2950000009', null]);
    expect(l.totalDeclarado).toBe(3);
    expect(l.estado).toBe('completa');
  });

  it('el Rappi del POS (forma de pago RAPPI) no cuenta: solo el del portal, también sin portal (Carlo, 2026-11-15)', async () => {
    const l = await conRappi(lectura(), async () => rappi);
    const doble = l.pedidos.find((p) => p.numeroPedidoRappi === '2950000009')!;
    expect(doble).toBe(rappi[1]);
    expect(doble.tipo).toBe('RAPPI_PORTAL');
    // Solo el POS lo tiene: también se quita.
    const soloPos = await conRappi(lectura(), async () => [rappi[0]]);
    expect(soloPos.pedidos.find((p) => p.numeroPedidoRappi === '2950000009')).toBeUndefined();
    // Sin portal (sin fuente): el POS se queda sin Rappi y el total declarado baja.
    const sinPortal = await conRappi(lectura());
    expect(sinPortal.pedidos.map((p) => p.origen)).toEqual(['mostrador']);
    expect(sinPortal.totalDeclarado).toBe(1);
  });

  it('si Rappi no se pudo leer la lectura queda parcial y lo dice; sin fuente o con error del POS, no cambia', async () => {
    const l = await conRappi(lectura(), async () => null);
    expect(l.estado).toBe('parcial');
    expect(l.avisos[0]).toMatch(/Rappi/);
    expect(l.pedidos).toHaveLength(1);
    const base = lectura({ pedidos: [pos(null)], totalDeclarado: 1 });
    expect(await conRappi(base)).toBe(base);
    const conError = lectura({ estado: 'error', pedidos: [] });
    expect(await conRappi(conError, async () => rappi)).toBe(conError);
  });
});

describe('Costeo y Consumo de un combo armado con sus partes', () => {
  const IL = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8'; // Iced Latte: Large → Grande verificado
  const MQ = 'r-mq1'; // Sándwich jamón y queso, tamaño Único
  const enlaces = new Map([
    ['5IL', { recetaId: IL, receta: 'Iced Latte' }],
    ['MQ1', { recetaId: MQ, receta: 'Sándwich jamón y queso' }],
  ]);
  const costeo: DatosCosteo = {
    leidoEn: '2026-10-29T00:00:00.000Z',
    iva: 0.16,
    enlaces,
    costos: new Map([
      [claveCosto(IL, 'Grande'), { costoCent: 1828, usaInactivo: false }],
      [claveCosto(MQ, 'Único'), { costoCent: 3000, usaInactivo: false }],
    ]),
    unicas: new Set([MQ]),
  };
  const consumo: DatosConsumo = {
    leidoEn: '2026-10-29T00:00:00.000Z',
    enlaces,
    unicas: new Set([MQ]),
    recetas: new Map([
      [
        claveConsumo(IL, 'Grande'),
        [{ insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'LECHE', cantidad: 240 }],
      ],
      [
        claveConsumo(MQ, 'Único'),
        [
          { insumoId: 'pan', insumo: 'PAN', unidad: 'pza', categoria: 'PANADERIA', cantidad: 1 },
          { insumoId: 'le', insumo: 'LECHE ENTERA', unidad: 'ml', categoria: 'LECHE', cantidad: 10 },
        ],
      ],
    ]),
  };
  const de = (...xs: ProductoRappi[]) => [pedidoRappiAPos(pedido('1', 'finished', xs))!];

  it('costo = suma de las partes con la receta vigente; la venta es la del combo', () => {
    const { resumen } = costear(de(creaTu('Iced Latte', 'Sándwich Jamón y Queso')), costeo);
    expect(resumen.completo).toMatchObject({ lineas: 1, importeCent: 16400, costoCent: 1828 + 3000 });
    expect(resumen.cobertura.conRecetaCent).toBe(16400);
  });

  it('consume los insumos de todas sus partes', () => {
    const r = consumir(
      de(creaTu('Iced Latte', 'Sándwich Jamón y Queso'), creaTu('Iced Latte', 'Sándwich Jamón y Queso')),
      consumo,
    );
    // Un combo cuenta como sus productos: 2 combos = 4 unidades (2 bebidas y 2 sándwiches).
    expect(r.cobertura).toMatchObject({ lineas: 4, conReceta: 4, incluidas: 4 });
    expect(r.insumos.map((i) => [i.insumo, i.cantidad])).toEqual([
      ['LECHE ENTERA', 500],
      ['PAN', 2],
    ]);
    expect(r.tamanos).toEqual(
      expect.arrayContaining([
        { tamano: 'Grande', lineas: 2 },
        { tamano: 'Único', lineas: 2 },
      ]),
    );
  });

  it('Costeo necesita todas las partes; en Consumo cada producto del combo entra o queda fuera por sí mismo', () => {
    const sinParte = de(creaTu('Iced Latte', 'Sándwich Misterioso'));
    expect(costear(sinParte, costeo).resumen.cobertura.sinEnlaceCent).toBe(16400);
    expect(consumir(sinParte, consumo).cobertura).toMatchObject({ lineas: 2, sinEnlace: 1, incluidas: 1 });
    // La bebida con miel aún no se calcula, pero el sándwich del combo sí suma.
    const miel = de(creaTu('Iced Latte', 'Sándwich Jamón y Queso', [['Miel', 'Promedio']]));
    expect(costear(miel, costeo).resumen.parcial.motivos.personalizacion).toBe(1);
    const r = consumir(miel, consumo);
    expect(r.cobertura).toMatchObject({ lineas: 2, incluidas: 1, excluidas: { personalizacion: 1 } });
    expect(r.insumos.find((i) => i.insumo === 'PAN')).toMatchObject({ cantidad: 1, rappi: 1 });
    // Cuadre de la leche: 2 unidades la llevan; entra el sándwich y la bebida queda fuera con su razón.
    const leche = r.insumos.find((i) => i.insumo === 'LECHE ENTERA')!;
    expect(leche).toMatchObject({ cantidad: 10, unidades: 1 });
    expect(leche.fuera).toEqual([
      {
        receta: 'Iced Latte',
        combo: 'Crea tu The Coffee',
        unidades: 1,
        rappi: 1,
        motivo: 'personalizacion',
        razon: 'lleva «Average Honey», que aún no se calcula',
      },
    ]);
    expect(r.productos.find((p) => p.recetaId === IL)!.razones).toEqual([
      { motivo: 'personalizacion', razon: 'lleva «Average Honey», que aún no se calcula', unidades: 1 },
    ]);
  });

  it('piloto: lo que aún no se calcula no saca la unidad; si tuvo costo extra queda anotado en el detalle', () => {
    // Miel con precio de ejemplo: lo que importa es que tuvo costo extra.
    const miel = de(creaTu('Iced Latte', 'Sándwich Jamón y Queso', [['Miel', 'Mucho', 5]]));
    const r = consumir(miel, consumo, miel, undefined, [], true);
    expect(r.cobertura).toMatchObject({
      lineas: 2,
      incluidas: 2,
      sinContar: 1,
      excluidas: { personalizacion: 0 },
    });
    // Se cuenta su receta (leche entera); la miel, con costo extra, queda anotada sin contar.
    const leche = r.insumos.find((i) => i.insumo === 'LECHE ENTERA')!;
    expect(leche).toMatchObject({ cantidad: 250, rappi: 250, unidades: 2, fuera: [] });
    expect(leche.detalle).toEqual([
      {
        receta: 'Iced Latte',
        combo: 'Crea tu The Coffee',
        unidades: 1,
        cantidad: 240,
        rappi: 240,
        sinContar: [{ nombre: 'More Honey', unidades: 1 }],
      },
      {
        receta: 'Sándwich jamón y queso',
        combo: 'Crea tu The Coffee',
        unidades: 1,
        cantidad: 10,
        rappi: 10,
        sinContar: [],
      },
    ]);
  });

  it('leches vegetales: cambian la entera de la receta por la normal, con los mismos ml (como la deslactosada)', () => {
    // Iced Latte real: «Oatmilk», «Almond Milk» y «Coconut Milk» están verificadas (Carlo, 2026-10-30).
    const conLineas: DatosConsumo = {
      ...consumo,
      lineas: new Map([[claveConsumo(IL, 'Grande'), [{ insumo: 'LECHE ENTERA', cantidad: 240 }]]]),
      sustitutos: new Map(
        ['LECHE AVENA', 'LECHE ALMENDRA', 'LECHE COCO'].map((n) => [
          n,
          { insumoId: n, insumo: n, unidad: 'ml', categoria: 'LECHE' },
        ]),
      ),
    };
    const ps = de(
      producto('Iced Latte', 106, [
        ['Elige el Tamaño', 'Grande 590 ml'],
        ['Leche', 'Avena', 17],
      ]),
      producto('Iced Latte', 106, [
        ['Elige el Tamaño', 'Grande 590 ml'],
        ['Leche', 'Almendra', 17],
      ]),
      producto('Iced Latte', 106, [
        ['Elige el Tamaño', 'Grande 590 ml'],
        ['Leche', 'Leche de coco', 17],
      ]),
      producto('Iced Latte', 89, [
        ['Elige el Tamaño', 'Grande 590 ml'],
        ['Leche', 'Entera'],
      ]),
    );
    const r = consumir(ps, conLineas);
    expect(r.cobertura).toMatchObject({ lineas: 4, incluidas: 4, ajustadas: 3 });
    // Una bebida por leche: 240 ml cada una, en su propio insumo.
    expect(r.insumos.map((i) => [i.insumo, i.cantidad, i.unidades]).sort()).toEqual([
      ['LECHE ALMENDRA', 240, 1],
      ['LECHE AVENA', 240, 1],
      ['LECHE COCO', 240, 1],
      ['LECHE ENTERA', 240, 1],
    ]);
  });

  it('un insumo que solo llevan unidades fuera aparece en cero con su cuadre, pero no suma a su categoría', () => {
    const r = consumir(de(producto('Iced Latte', 89, [['Miel', 'Promedio']])), consumo);
    expect(r.insumos).toEqual([
      expect.objectContaining({
        insumo: 'LECHE ENTERA',
        cantidad: 0,
        unidades: 0,
        productos: 0,
        detalle: [],
      }),
    ]);
    expect(r.insumos[0].fuera).toHaveLength(1);
    expect(r.categorias).toEqual([]);
  });

  it('cada insumo dice cuánto es de Rappi y qué productos lo consumen; lo que no tiene receta queda listado', () => {
    // Un sándwich del POS (mostrador) y un combo de Rappi; un producto del POS y otro de Rappi sin receta.
    const pos: PedidoNormal = {
      ...de(producto('Sándwich Jamón y Queso', 70))[0],
      origen: 'mostrador',
      numeroPedidoRappi: null,
    };
    pos.lineas.push({
      codigo: 'ESPTONAPP',
      nombre: 'Espresso Tonic',
      importeCent: 9400,
      descuentoPct: 0,
      customs: [],
    });
    const ps = [pos, ...de(creaTu('Iced Latte', 'Sándwich Jamón y Queso'), producto('Triple Frap', 199))];
    const r = consumir(ps, consumo);
    const leche = r.insumos.find((i) => i.insumo === 'LECHE ENTERA')!;
    expect(leche).toMatchObject({ cantidad: 260, rappi: 250 });
    expect(leche.detalle).toEqual([
      {
        receta: 'Iced Latte',
        combo: 'Crea tu The Coffee',
        unidades: 1,
        cantidad: 240,
        rappi: 240,
        sinContar: [],
      },
      { receta: 'Sándwich jamón y queso', unidades: 1, cantidad: 10, rappi: 0, sinContar: [] },
      {
        receta: 'Sándwich jamón y queso',
        combo: 'Crea tu The Coffee',
        unidades: 1,
        cantidad: 10,
        rappi: 10,
        sinContar: [],
      },
    ]);
    // Cuadra: 3 unidades vendidas llevan leche y las 3 entran.
    expect(leche).toMatchObject({ unidades: 3, fuera: [] });
    // Por día: cuántos productos llevan cada insumo, aparte de la cobertura de todo lo vendido.
    expect(r.diario).toEqual([
      expect.objectContaining({ fecha: '2026-10-27', lineas: 5, incluidas: 3, unidades: { le: 3, pan: 2 } }),
    ]);
    // El mismo sándwich, suelto en el POS y dentro del combo de Rappi: dos filas, cada una con su venta.
    expect(r.productos.filter((p) => p.recetaId === MQ).map((p) => [p.combo ?? 'suelto', p.lineas])).toEqual([
      ['suelto', 1],
      ['Crea tu The Coffee', 1],
    ]);
    expect(r.insumos.find((i) => i.insumo === 'PAN')).toMatchObject({ cantidad: 2, rappi: 1 });
    expect(r.categorias.find((c) => c.categoria === 'LECHE')!.totales).toEqual([
      { unidad: 'ml', cantidad: 260, rappi: 250 },
    ]);
    expect(r.sinReceta).toEqual([
      { nombre: 'Espresso Tonic', unidades: 1, rappi: 0, sinCodigo: false },
      { nombre: 'Triple Frap', unidades: 1, rappi: 1, sinCodigo: false },
    ]);
    // Un combo de Rappi al que le falta una parte se lista por esa parte.
    expect(consumir(de(creaTu('Iced Latte', 'Sándwich Misterioso')), consumo).sinReceta).toEqual([
      { nombre: 'Sándwich Misterioso', unidades: 1, rappi: 1, sinCodigo: false },
    ]);
  });

  it('combos del POS por sus productos (solo donde se activa, hoy Namóra): la mayonesa va al sándwich y lo demás a la bebida', () => {
    const combo: PedidoNormal = {
      ...de(producto('Iced Latte', 1))[0],
      origen: 'mostrador',
      numeroPedidoRappi: null,
      lineas: [
        {
          codigo: 'MISICEDAPP',
          nombre: 'Iced Latte + Ham & Cheese Sandwich',
          importeCent: 13900,
          descuentoPct: 0,
          customs: [
            { codigo: 'X', nombre: 'Large - 600ml', importeCent: 0, descuentoPct: 0 },
            { codigo: 'X', nombre: 'Chipotle Mayo', importeCent: 0, descuentoPct: 0 },
          ],
        },
      ],
    };
    // Sin activar: el combo del POS va con su propio código (aquí sin receta enlazada).
    expect(consumir([combo], consumo).cobertura).toMatchObject({ lineas: 1, sinEnlace: 1 });
    const r = consumir([combo], consumo, [combo], undefined, [], true);
    // La bebida Grande entra y el sándwich también: la mayonesa de chipotle aún no se calcula, pero ya no lo saca
    // (Carlo, 2026-10-30). Sin costo extra, no queda anotada.
    expect(r.cobertura).toMatchObject({
      lineas: 2,
      incluidas: 2,
      sinContar: 0,
      excluidas: { personalizacion: 0 },
    });
    expect(r.productos.map((p) => [p.receta, p.combo, p.lineas])).toEqual([
      ['Iced Latte', 'Iced Latte + Ham & Cheese Sandwich', 1],
      ['Sándwich jamón y queso', 'Iced Latte + Ham & Cheese Sandwich', 1],
    ]);
    expect(r.insumos.find((i) => i.insumo === 'LECHE ENTERA')).toMatchObject({
      cantidad: 250,
      rappi: 0,
      unidades: 2,
    });
    expect(r.insumos.find((i) => i.insumo === 'PAN')!.detalle[0].sinContar).toEqual([]);
    // Con costo extra, la mayonesa queda anotada en el sándwich (no en la bebida).
    const conCosto = {
      ...combo,
      lineas: [
        {
          ...combo.lineas[0],
          customs: [combo.lineas[0].customs[0], { ...combo.lineas[0].customs[1], importeCent: 1000 }],
        },
      ],
    };
    const pan = consumir([conCosto], consumo, [conCosto], undefined, [], true).insumos.find(
      (i) => i.insumo === 'PAN',
    )!;
    expect(pan.detalle[0].sinContar).toEqual([{ nombre: 'Chipotle Mayo', unidades: 1 }]);
  });
  it('un combo es uno aunque venga escrito distinto (POS y Rappi, mayúsculas): una fila con el nombre del POS', () => {
    const pos: PedidoNormal = {
      ...de(producto('Iced Latte', 1))[0],
      origen: 'mostrador',
      numeroPedidoRappi: null,
      lineas: [
        {
          codigo: 'MISICEDAPP',
          nombre: 'Iced Latte + Ham & Cheese Sandwich',
          importeCent: 13900,
          descuentoPct: 0,
          customs: [],
        },
      ],
    };
    const ps = [
      ...de(
        producto('Iced Latte + Sandwich jamón y queso', 139),
        creaTu('Iced Latte', 'Sándwich Jamón y Queso'),
      ),
      pos,
      ...de(
        producto('Crea Tu The Coffee', 164, [
          ['Elige tu Bebida', 'Iced Latte'],
          ['Elige el Tamaño', 'Grande 590 ml', 15],
          ['Elige tu Sandwich', 'Sándwich Jamón y Queso'],
        ]),
      ),
    ];
    const r = consumir(ps, consumo, ps, undefined, [], true);
    const porCombo = (xs: { combo?: string; unidades?: number; lineas?: number }[]) =>
      xs
        .map((x) => [x.combo, x.unidades ?? x.lineas])
        .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    // Dos filas, no cuatro: el combo del POS con su nombre del POS y «Crea tu» con el primero que llegó.
    const esperado = [
      ['Crea tu The Coffee', 2],
      ['Iced Latte + Ham & Cheese Sandwich', 2],
    ];
    expect(porCombo(r.insumos.find((x) => x.insumo === 'PAN')!.detalle)).toEqual(esperado);
    expect(porCombo(r.productos.filter((p) => p.recetaId === MQ))).toEqual(esperado);
  });
});

describe('Pumpkin Latte de Rappi (grande, con creamer)', () => {
  const PL = '170be377-ff76-4bbc-b6d5-85cd9708b21c'; // Pumpkin Latte: 30 ml de creamer en Chica y Grande
  const PIL = '38847fe5-2d6f-4050-9fd7-aa94bb3d4024'; // Pumpkin Iced Latte: 40 ml (Rappi dice Medio = 30 ml)
  const linea = (insumo: string, cantidad: number, costoUnitario: number) => ({
    lineaId: insumo,
    insumoId: insumo,
    insumo,
    unidad: 'ml',
    cantidad,
    costoUnitario,
    activo: true,
  });
  const datos: DatosCosteo = {
    leidoEn: '2026-10-29T00:00:00.000Z',
    iva: 0.16,
    enlaces: new Map([
      ['CPUMLAAPP', { recetaId: PL, receta: 'Pumpkin Latte' }],
      ['CPUMICAPP', { recetaId: PIL, receta: 'Pumpkin Iced Latte' }],
    ]),
    costos: new Map([
      [claveCosto(PL, 'Grande'), { costoCent: 2368, usaInactivo: false }],
      [claveCosto(PIL, 'Grande'), { costoCent: 2759, usaInactivo: false }],
    ]),
    unicas: new Set(),
    lineas: new Map([
      [
        claveCosto(PL, 'Grande'),
        [linea('CHOBANI D.CREAMER PUMPKIN SPICE', 30, 0.25), linea('LECHE ENTERA', 220, 0.022)],
      ],
      [
        claveCosto(PIL, 'Grande'),
        [linea('CHOBANI D.CREAMER PUMPKIN SPICE', 40, 0.25), linea('LECHE ENTERA', 250, 0.022)],
      ],
    ]),
  };
  const pumpkin = (creamer: string, nombre = 'Pumpkin Latte', tamano: [string, string][] = []) =>
    costear(
      [
        pedidoRappiAPos(
          pedido('1', 'finished', [
            producto(nombre, 122, [['Leche.', 'Entera'], ['Ajusta tu creamer', creamer], ...tamano]),
          ]),
        )!,
      ],
      datos,
    ).resumen;

  it('sin tamaño en Rappi es Grande; leche entera y creamer Medio son la receta', () => {
    expect(pumpkin('Medio - 30 ml de creamer').completo).toMatchObject({ lineas: 1, costoCent: 2368 });
  });

  it('Más y Menos creamer cambian la cantidad total sobre la receta', () => {
    expect(pumpkin('Mas - 40 ml de creamer').completo.costoCent).toBe(2368 + 250);
    expect(pumpkin('Menos - 20 ml de creamer').completo.costoCent).toBe(2368 - 250);
  });

  it('Pumpkin Iced Latte: el creamer queda pendiente (la receta lleva 40 ml, Rappi dice Medio = 30 ml)', () => {
    const r = pumpkin('Medio - 30 ml de creamer', 'Pumpkin Iced Latte', [
      ['Elige el tamaño', 'Grande 590 ml'],
    ]);
    expect(r.parcial.motivos.personalizacion).toBe(1);
  });
});
