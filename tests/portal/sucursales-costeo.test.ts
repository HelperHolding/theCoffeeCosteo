import { describe, expect, it, vi } from 'vitest';
vi.mock('server-only', () => ({}));

import { claveCosto, costear, tamanoVerificado, type DatosCosteo } from '../../lib/sucursales/costeo';
import { leerDatosCosteo, puedeVerCostos } from '../../lib/sucursales/costeo-servidor';
import type { LineaNormal, PedidoNormal } from '../../lib/sucursales/normalizar';
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

describe('permisos y lectura en el servidor', () => {
  it('solo perfiles con rol de Costeo; sin perfil no se lee nada', async () => {
    expect(puedeVerCostos({ rol: 'admin' })).toBe(true);
    expect(puedeVerCostos({ rol: 'compras' })).toBe(true);
    expect(puedeVerCostos({ rol: 'visitante' })).toBe(false);
    expect(puedeVerCostos(null)).toBe(false);
    const db = { from: vi.fn() };
    expect(await leerDatosCosteo(db as never, null)).toBeNull();
    expect(db.from).not.toHaveBeenCalled();
  });

  /** Base falsa con la forma mínima del cliente de Supabase. */
  const baseFalsa = (filas: Record<string, unknown[]>, conError: string[] = []) => ({
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

  it('lee enlaces, costos actuales (en centavos) y recetas Únicas con la sesión del usuario', async () => {
    const d = await leerDatosCosteo(
      baseFalsa(filas) as never,
      { rol: 'admin' },
      () => new Date('2026-10-27T03:00:00Z'),
    );
    expect(d).not.toBeNull();
    expect(d!.iva).toBe(0.16);
    expect(d!.enlaces.get('5IL')).toEqual({ recetaId: ICED_LATTE, receta: 'Iced Latte' });
    expect(d!.costos.get(claveCosto(ICED_LATTE, 'Chica'))).toEqual({ costoCent: 1544, usaInactivo: false });
    expect([...d!.unicas]).toEqual([BROWNIE]);
    expect(d!.leidoEn).toBe('2026-10-27T03:00:00.000Z');
  });

  it('falla cerrado: cualquier error de lectura (p. ej. RLS) → sin costeo', async () => {
    for (const t of ['producto_codigo_pos', 'v_costo_producto', 'parametros', 'recetas'])
      expect(await leerDatosCosteo(baseFalsa(filas, [t]) as never, { rol: 'admin' })).toBeNull();
  });
});
