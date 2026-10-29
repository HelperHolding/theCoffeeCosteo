import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { lineasDe, opcionPos, pedidoRappiAPos } from '@/lib/sucursales/rappi-pos';
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
    expect(lineasDe(producto('Cold Drip V60', 75))[0].customs).toEqual([]);
  });

  it('un producto sin equivalencia queda con un código que nunca es del POS', () => {
    expect(lineasDe(producto('Spooky Biscuits', 70))[0].codigo).toBe('RAPPI:spooky biscuits');
  });

  it('Pan de Muerto (doc 39): el Tradicional es el del POS; el de Naranja, su código propio de Rappi', () => {
    expect(lineasDe(producto('Pan de Muerto Tradicional.', 80))[0].codigo).toBe('PANMUEAPP');
    expect(lineasDe(producto('Pan de Muerto con Glaseado de Naranja.', 80))[0].codigo).toBe('RAPPIPANMUENAR');
  });

  it('combo solo de Rappi: se arma con sus partes y sus personalizaciones; el precio va en la línea', () => {
    const [l] = lineasDe(creaTu('Iced Latte', 'Sándwich Jamón y Queso', [['Leche', 'Avena', 17]]));
    expect(l.codigo).toBe('RAPPI-COMBO:crea tu the coffee');
    expect(l.importeCent + l.customs.reduce((s, c) => s + c.importeCent, 0)).toBe(16400);
    expect(l.partes).toEqual([
      {
        codigo: '5IL',
        nombre: 'Iced Latte',
        customs: [
          { codigo: 'RAPPI', nombre: 'Large - 600ml', importeCent: 0, descuentoPct: 0 },
          { codigo: 'RAPPI', nombre: 'Oatmilk', importeCent: 0, descuentoPct: 0 },
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
      ventaCent: 14800,
      descuentoCent: 1250,
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
    expect(l.pedidos.map((p) => p.numeroPedidoRappi)).toEqual(['2950000001', null, '2950000009']);
    expect(l.totalDeclarado).toBe(3);
    expect(l.estado).toBe('completa');
  });

  it('si Rappi no se pudo leer la lectura queda parcial y lo dice; sin fuente o con error del POS, no cambia', async () => {
    const l = await conRappi(lectura(), async () => null);
    expect(l.estado).toBe('parcial');
    expect(l.avisos[0]).toMatch(/Rappi/);
    expect(l.pedidos).toHaveLength(2);
    const base = lectura();
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
    expect(r.cobertura).toMatchObject({ lineas: 2, conReceta: 2, incluidas: 2 });
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

  it('una parte sin receta deja el combo sin enlace; una personalización no calculada, fuera por personalización', () => {
    const sinParte = de(creaTu('Iced Latte', 'Sándwich Misterioso'));
    expect(costear(sinParte, costeo).resumen.cobertura.sinEnlaceCent).toBe(16400);
    expect(consumir(sinParte, consumo).cobertura.sinEnlace).toBe(1);
    const avena = de(creaTu('Iced Latte', 'Sándwich Jamón y Queso', [['Leche', 'Avena', 17]]));
    expect(costear(avena, costeo).resumen.parcial.motivos.personalizacion).toBe(1);
    expect(consumir(avena, consumo).cobertura.excluidas.personalizacion).toBe(1);
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
