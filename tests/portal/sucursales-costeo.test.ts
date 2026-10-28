import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { claveCosto, costear, tamanoVerificado, type DatosCosteo } from '../../lib/sucursales/costeo';
import { leerDatosCosteo, puedeVerCostos } from '../../lib/sucursales/costeo-servidor';
import { filtrarOrigen, productos } from '../../lib/sucursales/metricas';
import type { LineaNormal, Origen, PedidoNormal } from '../../lib/sucursales/normalizar';
import { TAMANOS_VERIFICADOS } from '../../lib/sucursales/tamanos-verificados';

// Recetas reales de la lista verificada: Iced Latte (Regular y Large) y Chai Frap (solo Regular).
const ICED_LATTE = 'fcf0d45d-76b2-48a4-8d96-d8abc228eca8';
const CHAI_FRAP = 'a00da002-92a3-4a48-ab47-b62ee9aa6a13';
const BROWNIE = 'b0000000-0000-4000-8000-000000000001'; // Único (no necesita estar en la lista)
const BLUEBERRY = 'b0000000-0000-4000-8000-000000000002'; // Chica+Grande sin tamaño verificado

const datos = (o: Partial<DatosCosteo> = {}): DatosCosteo => ({
  leidoEn: '2026-10-27T03:00:00.000Z',
  iva: 0.16,
  enlaces: new Map([
    ['5IL', { recetaId: ICED_LATTE, receta: 'Iced Latte' }],
    ['FRACHAAPP', { recetaId: CHAI_FRAP, receta: 'Chai Frap' }],
    ['BRO', { recetaId: BROWNIE, receta: 'Brownie' }],
    ['ICEBLMAPP', { recetaId: BLUEBERRY, receta: 'Iced Blueberry Matcha' }],
  ]),
  costos: new Map([
    [claveCosto(ICED_LATTE, 'Chica'), { costoCent: 1544, usaInactivo: false }],
    [claveCosto(ICED_LATTE, 'Grande'), { costoCent: 1828, usaInactivo: false }],
    [claveCosto(CHAI_FRAP, 'Chica'), { costoCent: 1778, usaInactivo: false }],
    [claveCosto(CHAI_FRAP, 'Grande'), { costoCent: 2130, usaInactivo: false }],
    [claveCosto(BROWNIE, 'Único'), { costoCent: 3000, usaInactivo: false }],
    [claveCosto(BLUEBERRY, 'Chica'), { costoCent: 2000, usaInactivo: false }],
  ]),
  unicas: new Set([BROWNIE]),
  ...o,
});

const c = (nombre: string, importeCent = 0) => ({ codigo: nombre, nombre, importeCent, descuentoPct: 0 });
const linea = (
  codigo: string,
  nombre: string,
  importeCent: number,
  customs = [] as ReturnType<typeof c>[],
  sinCodigo = false,
): LineaNormal => ({
  codigo: sinCodigo ? nombre : codigo,
  nombre,
  importeCent,
  descuentoPct: 0,
  customs,
  ...(sinCodigo ? { sinCodigo: true } : {}),
});
let id = 1;
const pedido = (...lineas: LineaNormal[]): PedidoNormal => ({
  id: id++,
  fecha: '2026-10-20',
  segundo: 0,
  hora: '10:00',
  origen: 'mostrador',
  ventaCent: lineas.reduce((s, l) => s + l.importeCent + l.customs.reduce((t, x) => t + x.importeCent, 0), 0),
  netoCent: null,
  descuentoCent: 0,
  metodo: 'CARTAO',
  tipo: 'CREDIT',
  lineas,
  numeroPedidoRappi: null,
  cuadra: true,
});

describe('tamaño verificado', () => {
  it('lista explícita: Regular/Large solo donde hay evidencia; Chai Frap sin Grande; sin vaso solo en Único', () => {
    const d = datos();
    expect(tamanoVerificado(linea('5IL', 'Iced Latte', 7000, [c('Regular - 440ml')]), ICED_LATTE, d)).toBe(
      'Chica',
    );
    expect(tamanoVerificado(linea('5IL', 'Iced Latte', 8000, [c('Large - 600ml')]), ICED_LATTE, d)).toBe(
      'Grande',
    );
    expect(
      tamanoVerificado(linea('FRACHAAPP', 'Chai Frap', 9900, [c('Large - 600ml')]), CHAI_FRAP, d),
    ).toBeNull();
    expect(tamanoVerificado(linea('5IL', 'Iced Latte', 7000), ICED_LATTE, d)).toBeNull();
    expect(tamanoVerificado(linea('BRO', 'Brownie', 8900), BROWNIE, d)).toBe('Único');
    expect(
      tamanoVerificado(
        linea('ICEBLMAPP', 'Iced Blueberry Matcha', 9000, [c('Regular - 440ml')]),
        BLUEBERRY,
        d,
      ),
    ).toBeNull();
    // La lista no incluye los pendientes de E1.
    expect(Object.keys(TAMANOS_VERIFICADOS)).toHaveLength(31);
    expect(TAMANOS_VERIFICADOS[CHAI_FRAP]).toEqual({ Regular: 'Chica' });
  });
});

describe('costear', () => {
  const ps = [
    // Completo: Iced Latte Regular sin personalizaciones: 11600 cobrados → 10000 sin IVA − 1544.
    pedido(linea('5IL', 'Iced Latte', 11600, [c('Regular - 440ml')])),
    // Completo: Brownie Único sin vaso: 11600 → 10000 − 3000.
    pedido(linea('BRO', 'Brownie', 11600)),
    // Parcial por personalización con costo (aunque el tamaño esté verificado).
    pedido(linea('5IL', 'Iced Latte', 8000, [c('Large - 600ml'), c('Oatmilk', 1300)])),
    // Parcial por personalización gratuita: el catálogo de efectos aún no existe.
    pedido(linea('5IL', 'Iced Latte', 7000, [c('Regular - 440ml'), c('Double shot (36ml)')])),
    // Parcial por tamaño: Chai Frap Grande y Blueberry sin verificar.
    pedido(linea('FRACHAAPP', 'Chai Frap', 9900, [c('Large - 600ml')])),
    pedido(linea('ICEBLMAPP', 'Iced Blueberry Matcha', 9000, [c('Regular - 440ml')])),
    // Fuera de la cobertura: GENERIC, código sin enlace y línea sin código ambigua.
    pedido(linea('GENERIC', 'Generic', 5000)),
    pedido(linea('ESPTONAPP', 'Espresso Tonic', 9400)),
    pedido(linea('X1', 'Café', 1000), linea('X2', 'Café', 1000), linea('', 'Café', 2000, [], true)),
  ];

  it('cobertura con dos denominadores: A (toda la venta) y B (A − GENERIC)', () => {
    const { resumen } = costear(ps, datos());
    const cob = resumen.cobertura;
    expect(cob.totalCent).toBe(11600 + 11600 + 9300 + 7000 + 9900 + 9000 + 5000 + 9400 + 4000);
    expect(cob.genericoCent).toBe(5000);
    expect(cob.identificableCent).toBe(cob.totalCent - 5000);
    expect(cob.sinCodigoCent).toBe(2000); // «Café» tiene dos códigos en el periodo: ambiguo
    expect(cob.sinEnlaceCent).toBe(9400 + 1000 + 1000);
    expect(cob.conRecetaCent).toBe(11600 + 11600 + 9300 + 7000 + 9900 + 9000);
    expect(cob.sobreTotal).toBeCloseTo(cob.conRecetaCent / cob.totalCent);
    expect(cob.sobreIdentificable).toBeCloseTo(cob.conRecetaCent / cob.identificableCent);
    expect(cob.sobreIdentificable!).toBeGreaterThan(cob.sobreTotal!);
  });

  it('margen solo con costeo completo, sin IVA y con el costo actual; las parciales se informan aparte', () => {
    const { resumen, porClave } = costear(ps, datos());
    expect(resumen.completo).toEqual({
      lineas: 2,
      importeCent: 23200,
      ventaSinIvaCent: 20000,
      costoCent: 1544 + 3000,
      margenCent: 20000 - 4544,
      margenPct: (20000 - 4544) / 20000,
    });
    expect(resumen.parcial).toEqual({
      lineas: 4,
      importeCent: 9300 + 7000 + 9900 + 9000,
      motivos: { tamano: 2, personalizacion: 2, costo: 0 },
    });
    const iced = porClave.get('codigo:5IL')!;
    expect(iced.receta).toBe('Iced Latte');
    expect(iced.completo.lineas).toBe(1);
    expect(iced.parcial.lineas).toBe(2);
    expect(resumen.leidoEn).toBe('2026-10-27T03:00:00.000Z');
  });

  it('costo con insumo inactivo o ausente → parcial (motivo costo)', () => {
    const d = datos();
    d.costos.set(claveCosto(BROWNIE, 'Único'), { costoCent: 3000, usaInactivo: true });
    d.costos.delete(claveCosto(ICED_LATTE, 'Chica'));
    const { resumen } = costear(
      [
        pedido(linea('BRO', 'Brownie', 11600)),
        pedido(linea('5IL', 'Iced Latte', 7000, [c('Regular - 440ml')])),
      ],
      d,
    );
    expect(resumen.completo.lineas).toBe(0);
    expect(resumen.parcial.motivos.costo).toBe(2);
    expect(resumen.completo.margenPct).toBeNull();
  });

  it('una línea sin código se costea si su nombre tiene un único código enlazado en el periodo', () => {
    const { resumen, porClave } = costear(
      [pedido(linea('BRO', 'Brownie', 11600)), pedido(linea('', 'Brownie', 11600, [], true))],
      datos(),
    );
    expect(resumen.cobertura.sinCodigoCent).toBe(0);
    expect(porClave.get('codigo:BRO')!.completo.lineas).toBe(2);
  });
});

describe('filtro de origen: la identidad se aprende de todo el periodo', () => {
  const de = (origen: Origen, ...lineas: LineaNormal[]): PedidoNormal => ({ ...pedido(...lineas), origen });
  // Como en 532: la App manda «Brownie» sin código; el código BRO solo llega en Mostrador y Rappi.
  const periodo = [
    de('mostrador', linea('BRO', 'Brownie', 11600)),
    de('rappi', linea('BRO', 'Brownie', 13000), linea('GENERIC', 'Generic', 19900)),
    de('app', linea('', 'Brownie', 11600, [], true)),
    de('app', linea('', 'Croissant', 5000, [], true)), // ningún código en el periodo: sigue sin código
  ];
  const app = filtrarOrigen(periodo, 'app');

  it('antes: filtrar perdía la evidencia y la línea de la App quedaba «sin código»', () => {
    expect(costear(app, datos()).resumen.cobertura).toMatchObject({ sinCodigoCent: 16600, conRecetaCent: 0 });
  });

  it('después: la línea de la App se une al único código del periodo; el denominador y el POS no cambian', () => {
    const { resumen } = costear(app, datos(), periodo);
    expect(resumen.cobertura).toMatchObject({
      totalCent: 16600, // solo la venta de la App: el denominador es el mismo
      genericoCent: 0,
      sinCodigoCent: 5000, // «Croissant» no tiene código en ningún origen
      sinEnlaceCent: 0,
      conRecetaCent: 11600,
    });
    expect(resumen.completo).toMatchObject({ lineas: 1, importeCent: 11600, costoCent: 3000 });
    const antes = productos(app);
    const despues = productos(app, periodo);
    expect(despues.map((x) => [x.clave, x.nombre, x.importeCent, x.lineas, !!x.sinCodigo])).toEqual([
      ['codigo:BRO', 'Brownie', 11600, 1, false],
      ['nombre:Croissant', 'Croissant', 5000, 1, true],
    ]);
    // Mismos nombres, importes y líneas que antes; solo cambia la identidad de la línea sin código.
    const sinId = (l: typeof antes) => l.map((x) => [x.nombre, x.importeCent, x.lineas, x.pedidos]).sort();
    expect(sinId(despues)).toEqual(sinId(antes));
  });

  it('no amplía coincidencias: un nombre con dos códigos en el periodo queda sin código aunque el filtro vea uno', () => {
    const ambiguo = [
      de('mostrador', linea('X2', 'Latte', 9000)),
      de('app', linea('X1', 'Latte', 9000)),
      de('app', linea('', 'Latte', 9000, [], true)),
    ];
    const soloApp = filtrarOrigen(ambiguo, 'app');
    expect(productos(soloApp, ambiguo).find((x) => x.sinCodigo)).toMatchObject({
      nombre: 'Latte',
      importeCent: 9000,
    });
  });

  it('Todos no cambia y los cuatro filtros son consistentes: App + Mostrador + Rappi = Todos', () => {
    expect(costear(periodo, datos(), periodo)).toEqual(costear(periodo, datos()));
    const todos = costear(periodo, datos(), periodo).resumen.cobertura;
    const suma = (['app', 'mostrador', 'rappi'] as const)
      .map((o) => costear(filtrarOrigen(periodo, o), datos(), periodo).resumen.cobertura)
      .map(({ totalCent, genericoCent, sinCodigoCent, sinEnlaceCent, conRecetaCent }) => ({
        totalCent,
        genericoCent,
        sinCodigoCent,
        sinEnlaceCent,
        conRecetaCent,
      }))
      .reduce((a, c) => ({
        totalCent: a.totalCent + c.totalCent,
        genericoCent: a.genericoCent + c.genericoCent,
        sinCodigoCent: a.sinCodigoCent + c.sinCodigoCent,
        sinEnlaceCent: a.sinEnlaceCent + c.sinEnlaceCent,
        conRecetaCent: a.conRecetaCent + c.conRecetaCent,
      }));
    expect(suma).toMatchObject({
      totalCent: todos.totalCent,
      genericoCent: todos.genericoCent,
      sinCodigoCent: todos.sinCodigoCent,
      sinEnlaceCent: todos.sinEnlaceCent,
      conRecetaCent: todos.conRecetaCent,
    });
  });
});

describe('permisos y lectura en el servidor', () => {
  it('solo perfiles con rol de Costeo; sin perfil no se lee nada', async () => {
    expect(puedeVerCostos({ rol: 'admin' })).toBe(true);
    expect(puedeVerCostos({ rol: 'compras' })).toBe(true);
    expect(puedeVerCostos({ rol: 'visitante' })).toBe(false);
    expect(puedeVerCostos(null)).toBe(false);
    const db = { from: vi.fn(), rpc: async () => ({ data: null, error: { code: 'PGRST202' } }) };
    expect(await leerDatosCosteo(db as never, null, 612)).toEqual({ estado: 'sin-permiso' });
    expect(db.from).not.toHaveBeenCalled();
  });

  /** Base falsa con la forma mínima del cliente de Supabase. */
  const baseFalsa = (filas: Record<string, unknown[]>, conError: string[] = []) => ({
    rpc: async () => ({ data: null, error: { code: 'PGRST202', message: 'sin migración 24' } }),
    from: (t: string) => {
      const r = {
        data: conError.includes(t) ? null : filas[t],
        error: conError.includes(t) ? { message: 'rls' } : null,
      };
      const q = {
        select: () => q,
        in: () => Promise.resolve(r),
        limit: () => q,
        maybeSingle: () => Promise.resolve({ ...r, data: r.data ? (r.data as unknown[])[0] : null }),
        then: (ok: (x: typeof r) => unknown) => Promise.resolve(r).then(ok),
      };
      return q;
    },
  });
  const filas = {
    producto_codigo_pos: [
      { codigo: '5IL', receta_id: ICED_LATTE },
      { codigo: 'BRO', receta_id: BROWNIE },
    ],
    tamanos: [
      { id: 't1', nombre: 'Chica' },
      { id: 't2', nombre: 'Grande' },
      { id: 't3', nombre: 'Único' },
    ],
    parametros: [{ iva: 0.16 }],
    recetas: [
      { id: ICED_LATTE, nombre: 'Iced Latte' },
      { id: BROWNIE, nombre: 'Brownie' },
    ],
    v_costo_producto: [
      { producto_id: ICED_LATTE, tamano_id: 't1', costo: 15.44, usa_inactivo: false },
      { producto_id: BROWNIE, tamano_id: 't3', costo: 30, usa_inactivo: false },
    ],
    producto_tamanos: [
      { producto_id: ICED_LATTE, tamano_id: 't1' },
      { producto_id: ICED_LATTE, tamano_id: 't2' },
      { producto_id: BROWNIE, tamano_id: 't3' },
    ],
  };

  it('sin la migración 24: lee enlaces, costos (en centavos) y Únicas bajo RLS, como antes', async () => {
    const l = await leerDatosCosteo(
      baseFalsa(filas) as never,
      { rol: 'admin' },
      612,
      () => new Date('2026-10-27T03:00:00Z'),
    );
    expect(l.estado).toBe('ok');
    const d = l.estado === 'ok' ? l.datos : null;
    expect(d!.iva).toBe(0.16);
    expect(d!.enlaces.get('5IL')).toEqual({ recetaId: ICED_LATTE, receta: 'Iced Latte' });
    expect(d!.costos.get(claveCosto(ICED_LATTE, 'Chica'))).toEqual({ costoCent: 1544, usaInactivo: false });
    expect([...d!.unicas]).toEqual([BROWNIE]);
    expect(d!.leidoEn).toBe('2026-10-27T03:00:00.000Z');
  });

  it('falla cerrado: cualquier error de lectura (p. ej. RLS) → sin costeo', async () => {
    for (const t of ['producto_codigo_pos', 'v_costo_producto', 'parametros', 'recetas'])
      expect(await leerDatosCosteo(baseFalsa(filas, [t]) as never, { rol: 'admin' }, 612)).toEqual({
        estado: 'error',
      });
  });

  const rpcFalsa = (data: unknown, error: unknown = null) => ({
    rpc: vi.fn(async () => ({ data, error })),
    from: vi.fn(),
  });

  it('con la migración 24: la RPC de la sucursal decide el permiso y trae los mismos datos', async () => {
    const db = rpcFalsa({
      iva: '0.16',
      enlaces: [
        { codigo: '5IL', receta_id: ICED_LATTE, receta: 'Iced Latte' },
        { codigo: 'BRO', receta_id: BROWNIE, receta: 'Brownie' },
      ],
      costos: [
        { receta_id: ICED_LATTE, tamano: 'Chica', costo: '15.44', usa_inactivo: false },
        { receta_id: BROWNIE, tamano: 'Único', costo: 30, usa_inactivo: false },
      ],
      unicas: [BROWNIE],
      lineas: [
        {
          receta_id: ICED_LATTE,
          tamano: 'Chica',
          linea_id: 'l1',
          insumo_id: 'le',
          insumo: 'LECHE ENTERA',
          unidad: 'ml',
          cantidad: '180',
          costo_unitario: '0.0285',
          activo: true,
        },
      ],
    });
    const l = await leerDatosCosteo(
      db as never,
      { rol: 'sucursales' },
      532,
      () => new Date('2026-10-27T03:00:00Z'),
    );
    expect(db.rpc).toHaveBeenCalledWith('sucursales_datos_costeo', { p_company: 532 });
    expect(db.from).not.toHaveBeenCalled();
    const d = l.estado === 'ok' ? l.datos : null;
    expect(d!.iva).toBe(0.16);
    expect(d!.costos.get(claveCosto(ICED_LATTE, 'Chica'))).toEqual({ costoCent: 1544, usaInactivo: false });
    expect([...d!.unicas]).toEqual([BROWNIE]);
    // Migración 25: líneas directas de insumo por receta y tamaño (para la etapa 1b de personalizaciones).
    expect(d!.lineas?.get(claveCosto(ICED_LATTE, 'Chica'))).toEqual([
      {
        lineaId: 'l1',
        insumoId: 'le',
        insumo: 'LECHE ENTERA',
        unidad: 'ml',
        cantidad: 180,
        costoUnitario: 0.0285,
        activo: true,
      },
    ]);
  });

  it('con la migración 24: null = sin permiso (aunque el rol sea de Costeo); otro error = error', async () => {
    expect(await leerDatosCosteo(rpcFalsa(null) as never, { rol: 'admin' }, 532)).toEqual({
      estado: 'sin-permiso',
    });
    expect(
      await leerDatosCosteo(
        rpcFalsa(null, { code: '57014', message: 'timeout' }) as never,
        { rol: 'admin' },
        532,
      ),
    ).toEqual({ estado: 'error' });
  });
});
