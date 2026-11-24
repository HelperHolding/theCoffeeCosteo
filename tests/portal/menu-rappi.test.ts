import { describe, expect, it } from 'vitest';
import muestra from './vista/menu-essentia.json';
import {
  construirMenu,
  construirMenuNacional,
  lecturaDe,
  tiempoDe,
  type ProductoMenuRpc,
  type RpcMenuNacional,
  type RpcMenuRappi,
} from '../../lib/sucursales/menu-rappi';

/**
 * Menú/Carta de Rappi (docs/rappi-portal/09). La muestra es el menú real de Essentia (normal y Turbo) del 2026-11-23,
 * ya en la forma de la RPC: 158 productos (27 apagados), 166 toppings (7 apagados) y The Perfect Match de Turbo encendido
 * pero sin opción en «Elige tu Match».
 */
const PRIMERA = '2026-11-23T18:07:00Z';
const AHORA = new Date('2026-11-23T19:20:00Z');
const corrida = (fin: string, detalle: { tienda: string }[] = []) => ({
  inicio: fin,
  fin,
  tiendas: 2,
  leidas: 2 - detalle.length,
  fallidas: detalle.length,
  completa: detalle.length === 0,
  detalle,
});
const base = (o: Partial<RpcMenuRappi> = {}): RpcMenuRappi => ({
  ...(muestra as unknown as Pick<RpcMenuRappi, 'tiendas' | 'productos' | 'toppings'>),
  primera_lectura: PRIMERA,
  corrida: corrida('2026-11-23T19:07:00Z'),
  cambios: [],
  ...o,
});

describe('Menú de Rappi de una sucursal', () => {
  it('cuenta lo apagado como el portal y marca lo que no se puede pedir', () => {
    const m = construirMenu(base(), AHORA);
    expect(m.totales).toMatchObject({
      productos: 158,
      apagados: 27,
      toppingsApagados: 7,
      noSePuedenPedir: 1,
    });
    expect(m.canales.map((c) => [c.canal, c.conteo.apagados, c.conteo.productos])).toEqual([
      ['normal', 14, 80],
      ['turbo', 13, 78],
    ]);
    const grave = m.revisar[0];
    expect(grave).toMatchObject({ nivel: 'grave', nombre: 'The Perfect Match', canal: 'turbo' });
    expect(grave.motivo).toContain('«Elige tu Match»');
    expect(m.lectura).toMatchObject({ estado: 'al-dia', minutos: 13, completa: true });
  });

  it('sin «desde» de Rappi: lo apagado desde la primera lectura no inventa hora y no llega a «por revisar» antes de 24 h', () => {
    const m = construirMenu(base(), AHORA);
    const apagado = m.revisar.find((x) => x.tipo === 'producto' && x.nivel === 'medio')!;
    expect(apagado).toMatchObject({ previo: true, desde: null });
    expect(apagado.horas).toBeCloseTo(73 / 60);
    expect(m.totales.revisar).toBe(0);
    // Dos días después, lo mismo ya es «por revisar» (al menos 24 h).
    const despues = construirMenu(base(), new Date('2026-11-25T19:20:00Z'));
    expect(despues.totales.revisar).toBe(27 + 7);
    expect(despues.revisar.find((x) => x.nivel === 'alto')?.motivo).toBe('Apagado hace más de 24 h');
  });

  it('un apagado visto en una lectura posterior tiene su hora; inactivos y eliminados no cuentan', () => {
    const p0 = (muestra.productos as ProductoMenuRpc[]).find((p) => p.disponible)!;
    const productos = [
      {
        ...p0,
        id: 'X1',
        nombre: 'Latte nuevo',
        nombre_norm: 'latte nuevo',
        disponible: false,
        desde: '2026-11-22T10:07:00Z',
      },
      { ...p0, id: 'X2', nombre: 'Viejo', nombre_norm: 'viejo', disponible: false, activo: false },
    ];
    const m = construirMenu(
      base({ productos, toppings: [], primera_lectura: '2026-11-20T00:07:00Z' }),
      AHORA,
    );
    expect(m.totales).toMatchObject({ productos: 1, apagados: 1, revisar: 1 });
    expect(m.revisar[0]).toMatchObject({ nivel: 'alto', previo: false, desde: '2026-11-22T10:07:00Z' });
    expect(m.revisar[0].horas).toBeCloseTo(33.2167, 2);
  });

  it('precio distinto entre Rappi y Turbo del mismo producto se avisa una vez, como información', () => {
    const [n, t] = muestra.tiendas;
    const p0 = (muestra.productos as ProductoMenuRpc[])[0];
    const productos = [
      { ...p0, tienda: n.id, id: 'A', nombre: 'Latte', nombre_norm: 'latte', precio: 70, disponible: true },
      { ...p0, tienda: t.id, id: 'B', nombre: 'Latte ', nombre_norm: 'latte', precio: 75, disponible: true },
    ];
    const m = construirMenu(base({ productos, toppings: [] }), AHORA);
    const info = m.revisar.filter((x) => x.motivo.startsWith('Precio distinto'));
    expect(info).toHaveLength(1);
    expect(info[0]).toMatchObject({ nivel: 'info', canal: 'normal' });
    expect(info[0].motivo).toBe('Precio distinto: $70 en Rappi, $75 en Turbo');
  });

  it('lectura: más de 45 min es «retrasada» y nombra las tiendas que fallaron; sin corrida, «sin lectura»', () => {
    const nombre = (id: string) => (id === 'MX1' ? 'Essentia' : null);
    expect(
      lecturaDe(corrida('2026-11-23T18:20:00Z', [{ tienda: 'MX1' }]), PRIMERA, nombre, AHORA),
    ).toMatchObject({
      estado: 'retrasada',
      minutos: 60,
      completa: false,
      fallidas: ['Essentia'],
    });
    expect(lecturaDe(null, null, nombre, AHORA).estado).toBe('sin');
  });

  it('cambios de las últimas 24 h, sin la foto inicial', () => {
    const [n] = muestra.tiendas;
    const p = (muestra.productos as ProductoMenuRpc[]).find((x) => x.tienda === n.id)!;
    const m = construirMenu(
      base({
        cambios: [
          { tienda: n.id, tipo: 'producto', item_id: p.id, disponible: false, desde: PRIMERA, hasta: null },
          {
            tienda: n.id,
            tipo: 'producto',
            item_id: p.id,
            disponible: true,
            desde: '2026-11-23T19:07:00Z',
            hasta: null,
          },
        ],
      }),
      AHORA,
    );
    expect(m.cambios).toEqual([
      {
        cuando: '2026-11-23T19:07:00Z',
        canal: 'normal',
        tipo: 'producto',
        nombre: p.nombre,
        disponible: true,
      },
    ]);
    expect(tiempoDe(PRIMERA, PRIMERA, AHORA).previo).toBe(true);
  });
});

describe('Menú de Rappi en el Tablero de México', () => {
  const rpc: RpcMenuNacional = {
    tiendas: [
      { id: 'N1', company_id: 514, nombre: 'Essentia', canal: 'normal' },
      { id: 'T1', company_id: 514, nombre: 'Essentia Turbo', canal: 'turbo' },
      { id: 'N2', company_id: 513, nombre: 'Namóra', canal: 'normal' },
    ],
    por_tienda: [
      {
        tienda: 'N1',
        productos: 80,
        apagados: 14,
        toppings: 75,
        toppings_apagados: 4,
        sin_opcion: 0,
        sin_foto: 0,
        sin_descripcion: 0,
      },
      {
        tienda: 'T1',
        productos: 78,
        apagados: 13,
        toppings: 91,
        toppings_apagados: 3,
        sin_opcion: 1,
        sin_foto: 0,
        sin_descripcion: 0,
      },
      {
        tienda: 'N2',
        productos: 70,
        apagados: 2,
        toppings: 60,
        toppings_apagados: 0,
        sin_opcion: 0,
        sin_foto: 1,
        sin_descripcion: 0,
      },
    ],
    apagados: [
      {
        tienda: 'N1',
        tipo: 'producto',
        id: '1',
        nombre: 'Brownie',
        nombre_norm: 'brownie',
        categoria: 'Postres',
        desde: null,
      },
      {
        tienda: 'N2',
        tipo: 'producto',
        id: '9',
        nombre: 'Brownie ',
        nombre_norm: 'brownie',
        categoria: 'Postres',
        desde: '2026-11-21T10:07:00Z',
      },
      {
        tienda: 'T1',
        tipo: 'topping',
        id: '5',
        nombre: 'Avena',
        nombre_norm: 'avena',
        categoria: 'Leche',
        desde: null,
      },
    ],
    sin_opcion: [
      { tienda: 'T1', nombre: 'The Perfect Match', categoria: 'Combos', grupos: ['Elige tu Match'] },
    ],
    presencia: [{ nombre_norm: 'brownie', tiendas: 5 }],
    primera_lectura: PRIMERA,
    corrida: corrida('2026-11-23T19:07:00Z'),
  };
  const sucursales = [
    { companyId: 514, nombre: 'Essentia', ciudad: 'Guadalajara', rappiPortal: true },
    { companyId: 513, nombre: 'Namóra', ciudad: 'Guadalajara', rappiPortal: true },
    { companyId: 469, nombre: 'Roma Sur', ciudad: 'Ciudad de México', rappiPortal: false },
    { companyId: 545, nombre: 'Polanco', ciudad: 'Ciudad de México', rappiPortal: true },
  ];

  it('suma por sucursal (normal y Turbo juntas), ordena por apagados y separa sin tienda y sin lectura', () => {
    const m = construirMenuNacional(rpc, sucursales, AHORA);
    expect(m.sucursales.map((s) => [s.nombre, s.conteo.apagados, s.conteo.productos])).toEqual([
      ['Essentia', 27, 158],
      ['Namóra', 2, 70],
    ]);
    expect(m.totales).toMatchObject({
      productos: 228,
      apagados: 29,
      toppingsApagados: 7,
      noSePuedenPedir: 1,
    });
    expect(m.sinTienda).toEqual(['Roma Sur']);
    expect(m.sinLectura).toEqual(['Polanco']);
  });

  it('«apagado en varias sucursales» por nombre, con alerta de abasto desde 30 % de las tiendas que lo tienen', () => {
    const m = construirMenuNacional(rpc, sucursales, AHORA);
    expect(m.enVarias).toEqual([
      {
        nombre: 'Brownie',
        nombre_norm: 'brownie',
        sucursales: [
          { companyId: 514, nombre: 'Essentia' },
          { companyId: 513, nombre: 'Namóra' },
        ],
        tiendasApagado: 2,
        tiendasConProducto: 5,
        parte: 0.4,
        abasto: true,
      },
    ]);
  });

  it('por revisar: lo que no se puede pedir primero, luego lo apagado hace más de 24 h (lo más antiguo arriba)', () => {
    // Lecturas desde el 20-nov: lo que ya estaba apagado ahí lleva «al menos» 91 h; el Brownie de Namóra, 57 h.
    const m = construirMenuNacional({ ...rpc, primera_lectura: '2026-11-20T00:07:00Z' }, sucursales, AHORA);
    expect(m.revisar.map((x) => [x.nivel, x.sucursal, x.nombre, x.previo])).toEqual([
      ['grave', 'Essentia', 'The Perfect Match', false],
      ['alto', 'Essentia', 'Brownie', true],
      ['alto', 'Essentia', 'Avena', true],
      ['alto', 'Namóra', 'Brownie ', false],
    ]);
    expect(m.sucursales.find((s) => s.companyId === 513)?.conteo.revisar).toBe(1);
    expect(m.sucursales.find((s) => s.companyId === 514)?.conteo.revisar).toBe(2);
    // Con lecturas de hoy, nada lleva 24 h todavía: solo lo grave.
    expect(construirMenuNacional(rpc, sucursales, AHORA).revisar.map((x) => x.nivel)).toEqual(['grave']);
  });
});
