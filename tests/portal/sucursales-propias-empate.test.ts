import { describe, expect, it } from 'vitest';
import {
  conProveedor,
  empatar,
  normalizarNombre,
  repartir,
  sugerirProveedor,
  validarAsignaciones,
  type Factura,
  type Proveedor,
} from '../../lib/sucursales-propias/empate';
import { armarCorrida, proveedoresAConsultar, separarNuevas } from '../../lib/sucursales-propias/planear';
import type { Transferencia } from '../../lib/sucursales-propias/recibos';

// Nombres de la corrida real del 20 nov 2026 (banco vs. Zoho).
const PROVEEDORES: Proveedor[] = [
  { id: 'v-oh', nombre: 'OH LALA (PRODUCTORA DE ALIMENTOS OH)' },
  { id: 'v-fs', nombre: 'FOOD SERVICE DE MEXICO' },
  { id: 'v-cr', nombre: 'CESAR RAUL MARTINEZ VILLASEÑOR' },
  { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' },
  { id: 'v-pk', nombre: 'PINKBOOK' },
  { id: 'v-sg', nombre: 'SIGMA FOODSERVICE COMERCIAL' },
];

const f = (billId: string, vendorId: string, fecha: string, saldo: number): Factura => ({
  billId,
  vendorId,
  numero: billId.toUpperCase(),
  fecha,
  vencimiento: fecha,
  saldo,
  ubicacion: 'DARIO',
  notas: '',
});

const t = (o: Partial<Transferencia>): Transferencia => ({
  llave: 'L1',
  tipo: 'SPEI',
  clabe: '012320000000001111',
  alias: 'OH LALA',
  concepto: 'PAGO',
  monto: 100,
  fecha: '2026-11-20',
  claveRastreo: 'L1',
  archivo: 'a.pdf',
  ruta: 'a.pdf',
  secuencia: 1,
  ...o,
});

describe('normalizarNombre y sugerirProveedor', () => {
  it('quita acentos, puntuación y la razón social', () => {
    expect(normalizarNombre('FOOD SERVICE DE MEXICO SA DE CV')).toBe('FOOD SERVICE DE MEXICO');
    expect(normalizarNombre('PINKBOOK S DE RL DE CV')).toBe('PINKBOOK');
    expect(normalizarNombre('Francisco Román González')).toBe('FRANCISCO ROMAN GONZALEZ');
  });

  it('normaliza las variantes de la razón social igual', () => {
    const base = normalizarNombre('EMPAQUES DEMO SA DE CV');
    expect(base).toBe('EMPAQUES DEMO');
    for (const v of [
      'EMPAQUES DEMO S A DE C V',
      'Empaques Demo, S.A. de C.V.',
      'EMPAQUES DEMO SA',
      'EMPAQUES DEMO SAPI DE CV',
      'EMPAQUES DEMO S DE RL',
      'EMPAQUES DEMO S. de R.L. de C.V.',
    ])
      expect(normalizarNombre(v)).toBe(base);
  });

  it('una S sola al final es parte del nombre, no razón social', () => {
    expect(normalizarNombre('JUAN PEREZ S')).toBe('JUAN PEREZ S');
    const otros: Proveedor[] = [{ id: 'v-jp', nombre: 'JUAN PEREZ' }];
    // No es empate exacto; sí es contenido (2+ palabras), así que se sugiere y queda marcado para revisar.
    expect(normalizarNombre('JUAN PEREZ S')).not.toBe(normalizarNombre('JUAN PEREZ'));
    expect(sugerirProveedor('JUAN PEREZ S', otros)?.id).toBe('v-jp');
  });

  it('un nombre de persona de 2 palabras contenido en otro más largo se sugiere (comportamiento actual)', () => {
    const lista: Proveedor[] = [
      { id: 'v-jpg', nombre: 'JUAN PEREZ GARCIA' },
      { id: 'v-otro', nombre: 'MARIA LOPEZ' },
    ];
    expect(sugerirProveedor('JUAN PEREZ', lista)?.id).toBe('v-jpg');
    // Con dos candidatos que lo contienen, no se sugiere ninguno.
    expect(sugerirProveedor('JUAN PEREZ', [...lista, { id: 'v-jpl', nombre: 'JUAN PEREZ LUNA' }])).toBeNull();
  });

  it('empata por nombre exacto o contenido, nunca con dos candidatos', () => {
    expect(sugerirProveedor('FOOD SERVICE DE MEXICO SA DE CV', PROVEEDORES)?.id).toBe('v-fs');
    expect(sugerirProveedor('OH LALA', PROVEEDORES)?.id).toBe('v-oh');
    expect(sugerirProveedor('HIBRIDO DISEÑO CESAR RAUL MARTINEZ VILLASEÑOR', PROVEEDORES)?.id).toBe('v-cr');
    expect(sugerirProveedor('PINKBOOK S DE RL DE CV', PROVEEDORES)?.id).toBe('v-pk');
    expect(sugerirProveedor('ALPINA TEPEYAC', PROVEEDORES)).toBeNull();
    const dobles = [...PROVEEDORES, { id: 'v-oh2', nombre: 'OH LALA CEDIS' }];
    expect(sugerirProveedor('OH LALA', dobles)).toBeNull();
  });
});

describe('empatar', () => {
  const sin = new Map<string, Proveedor>();

  it('cuadra: el monto es la suma exacta de saldos, incluso con centavos', () => {
    const facturas = [
      f('b2', 'v-sg', '2026-11-14', 0.2),
      f('b1', 'v-sg', '2026-11-05', 1088.5),
      f('b3', 'v-sg', '2026-11-06', 0.1),
    ];
    const e = empatar(t({ alias: 'SIGMA FOODSERVICE COMERCIAL', monto: 1088.8 }), sin, PROVEEDORES, facturas);
    expect(e.estado).toBe('cuadra');
    expect(e.sugerido).toBe(true);
    expect(e.asignaciones.map((a) => [a.billId, a.monto])).toEqual([
      ['b1', 1088.5],
      ['b3', 0.1],
      ['b2', 0.2],
    ]);
  });

  it('la equivalencia guardada por CLABE gana sobre el nombre', () => {
    const eq = new Map([['030320900000001111', { id: 'v-mp', nombre: 'MATERIAS PRIMAS EL REFUGIO' }]]);
    const e = empatar(
      t({ alias: 'ALPINA TEPEYAC', clabe: '030320900000001111', monto: 3740 }),
      eq,
      PROVEEDORES,
      [f('b9', 'v-mp', '2026-11-18', 3740)],
    );
    expect(e).toMatchObject({ estado: 'cuadra', sugerido: false, proveedor: { id: 'v-mp' } });
  });

  it('desconocido sin equivalencia ni nombre; sin_facturas si el proveedor no debe nada', () => {
    expect(empatar(t({ alias: 'ALPINA TEPEYAC' }), sin, PROVEEDORES, []).estado).toBe('desconocido');
    expect(
      empatar(t({ alias: 'PINKBOOK' }), sin, PROVEEDORES, [f('x', 'v-pk', '2026-11-01', 0)]).estado,
    ).toBe('sin_facturas');
  });

  it('no cuadra: reparte de la más antigua a la más nueva hasta agotar el monto', () => {
    const facturas = [f('b2', 'v-oh', '2026-11-08', 500), f('b1', 'v-oh', '2026-11-06', 300)];
    const e = empatar(t({ monto: 400 }), sin, PROVEEDORES, facturas);
    expect(e.estado).toBe('no_cuadra');
    expect(e.asignaciones.map((a) => [a.billId, a.monto])).toEqual([
      ['b1', 300],
      ['b2', 100],
    ]);
    expect(repartir(1000, facturas).reduce((s, a) => s + a.monto, 0)).toBe(800);
  });

  it('conProveedor ignora facturas de otros proveedores', () => {
    const e = conProveedor(10, PROVEEDORES[0], false, [f('a', 'v-fs', '2026-11-01', 10)]);
    expect(e.estado).toBe('sin_facturas');
  });
});

describe('validarAsignaciones', () => {
  const facturas = [f('b1', 'v-oh', '2026-11-06', 300), f('b2', 'v-oh', '2026-11-08', 500)];
  it('acepta un reparto que suma exacto', () => {
    expect(
      validarAsignaciones(
        400,
        [
          { billId: 'b1', monto: 300 },
          { billId: 'b2', monto: 100 },
        ],
        facturas,
      ),
    ).toBeNull();
  });
  it('rechaza sumas distintas, montos mayores al saldo, ceros, repetidas y facturas ajenas', () => {
    expect(validarAsignaciones(400, [{ billId: 'b1', monto: 300 }], facturas)).toMatch(/no es igual/);
    expect(validarAsignaciones(400, [{ billId: 'b1', monto: 400 }], facturas)).toMatch(/mayor que su saldo/);
    expect(validarAsignaciones(0, [{ billId: 'b1', monto: 0 }], facturas)).toMatch(/mayor a cero/);
    expect(
      validarAsignaciones(
        600,
        [
          { billId: 'b1', monto: 300 },
          { billId: 'b1', monto: 300 },
        ],
        facturas,
      ),
    ).toMatch(/dos veces/);
    expect(validarAsignaciones(1, [{ billId: 'zz', monto: 1 }], facturas)).toMatch(/ya no está abierta/);
    expect(validarAsignaciones(1, [], facturas)).toMatch(/al menos una/);
  });
});

describe('planear', () => {
  it('separarNuevas deja fuera las llaves ya registradas y lo avisa', () => {
    const r = separarNuevas(
      [t({ llave: 'L1' }), t({ llave: 'L2', alias: 'PINKBOOK', monto: 552.21 })],
      [{ llave: 'L2', corrida_id: 7, estado: 'aplicada' }],
    );
    expect(r.nuevas.map((x) => x.llave)).toEqual(['L1']);
    expect(r.avisos).toEqual(['PINKBOOK ($552.21): ya registrada en la corrida #7 (aplicada).']);
  });

  it('proveedoresAConsultar junta equivalencias y sugeridos sin repetir', () => {
    const eq = new Map([['030320900000001111', { id: 'v-mp', nombre: 'MP' }]]);
    const ids = proveedoresAConsultar(
      [
        t({ alias: 'OH LALA' }),
        t({ alias: 'OH LALA', llave: 'L3' }),
        t({ alias: 'ALPINA', clabe: '030320900000001111' }),
        t({ alias: 'NADIE' }),
      ],
      eq,
      PROVEEDORES,
    );
    expect(ids.sort()).toEqual(['v-mp', 'v-oh']);
  });

  it('armarCorrida arma el payload de la RPC con totales en centavos exactos', () => {
    const todas = [t({ monto: 0.1 }), t({ llave: 'L2', monto: 0.2 })];
    const p = armarCorrida({
      archivo: 'z.zip',
      resumen: null,
      todas,
      nuevas: todas,
      avisos: ['a'],
      equivalencias: new Map(),
      proveedores: PROVEEDORES,
      facturas: [f('b1', 'v-oh', '2026-11-06', 0.3)],
    });
    expect(p.total_recibos).toBe(0.3);
    expect(p.n_recibos).toBe(2);
    expect(p.transferencias[0]).toMatchObject({
      llave: 'L1',
      estado: 'no_cuadra',
      proveedor_zoho_id: 'v-oh',
      fecha_operacion: '2026-11-20',
    });
    expect(p.transferencias[0].asignaciones[0]).toEqual({
      bill_id: 'b1',
      bill_numero: 'B1',
      ubicacion: 'DARIO',
      fecha: '2026-11-06',
      saldo: 0.3,
      monto: 0.1,
    });
  });
});
