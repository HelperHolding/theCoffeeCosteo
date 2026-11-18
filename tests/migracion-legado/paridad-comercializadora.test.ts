import { describe, expect, it } from 'vitest';
import {
  type AccionOv,
  compararMinmax,
  compararOcs,
  diferenciasOv,
  evaluarDia,
  type Lado,
  racha,
  reporteParidad,
} from '../../scripts/migracion-legado/paridad-comercializadora-lib';

const lado = (o: Partial<Lado> = {}): Lado => ({
  minmax: [{ sku: 'A', minimo: 10, maximo: 20, calculado_at: '2026-11-20 12:30:01+00' }],
  ocs: [{ vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 5 }] }],
  corridas: [
    { proceso: 'com-minmax', ok: true },
    { proceso: 'zoho-generar-oc', ok: true },
  ],
  firmasSku: { A: 'fa', B: 'fb' },
  firmasProv: { V1: 'p1' },
  firmaGlobal: 'g',
  ...o,
});

describe('paridad: mín/máx', () => {
  it('igual (dentro de la tolerancia) no da diferencias', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 10.004, maximo: 20, calculado_at: null }] });
    expect(compararMinmax(lado(), p)).toEqual([]);
  });

  it('un mínimo distinto con las mismas entradas es del motor; con otras entradas, no comparable', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 12, maximo: 20, calculado_at: null }] });
    expect(compararMinmax(lado(), p)).toEqual([
      { clave: 'minmax:A:minimo', seccion: 'minmax', detalle: 'minimo', viejo: 10, portal: 12, causa: 'motor' },
    ]);
    expect(compararMinmax(lado(), { ...p, firmasSku: { A: 'otra' } })[0].causa).toBe('entrada');
  });

  it('un SKU de un solo lado se reporta; null contra número también', () => {
    const p = lado({
      minmax: [
        { sku: 'A', minimo: null, maximo: 20, calculado_at: null },
        { sku: 'B', minimo: 1, maximo: 2, calculado_at: null },
      ],
    });
    expect(compararMinmax(lado(), p).map((d) => [d.clave, d.detalle])).toEqual([
      ['minmax:A:minimo', 'minimo'],
      ['minmax:B:falta', 'solo en el portal'],
    ]);
  });
});

describe('paridad: OCs automáticas', () => {
  it('suma por proveedor y SKU aunque vengan en varias OCs', () => {
    const p = lado({
      ocs: [
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 2 }] },
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 3 }] },
      ],
    });
    expect(compararOcs(lado(), p)).toEqual([]);
  });

  it('cantidad distinta, SKU de más y proveedor que solo pidió uno de los dos', () => {
    const p = lado({
      ocs: [
        { vendor_id: 'V1', vendor_name: 'Jarabes', lineas: [{ sku: 'A', cantidad: 6 }, { sku: 'B', cantidad: 1 }] },
        { vendor_id: 'V2', vendor_name: 'Vasos', lineas: [{ sku: 'C', cantidad: 4 }] },
      ],
      firmasProv: { V1: 'p1', V2: 'p2' },
    });
    expect(compararOcs(lado(), p).map((d) => [d.clave, d.viejo, d.portal, d.causa])).toEqual([
      ['oc:V1:A', 5, 6, 'motor'],
      ['oc:V1:B', 0, 1, 'motor'],
      ['oc:V2:C', 0, 4, 'entrada'], // V2 no existe en com_zoho_proveedor del viejo: entradas distintas
    ]);
  });
});

describe('paridad: OVs', () => {
  it('cada acción de com_ov_plan es una diferencia; avanzar se agrupa por folio', () => {
    const acciones: AccionOv[] = [
      { accion: 'insertar', folio: '#1', sku: 'A', estado_antes: null, estado: 'por_enviar' },
      { accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' },
      { accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' },
      { accion: 'ambiguo', folio: '#9', sku: null, estado_antes: null, estado: null },
    ];
    expect(diferenciasOv(acciones).map((d) => d.clave)).toEqual([
      'ov:insertar:#1:A',
      'ov:avanzar:#2:por_enviar>cancelado',
      'ov:ambiguo:#9',
    ]);
  });
});

describe('paridad: el día', () => {
  it('verde: completo y sin diferencias del motor (las de entrada no cuentan)', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 99, maximo: 20, calculado_at: null }], firmasSku: { A: 'x' } });
    const r = evaluarDia('2026-11-20', lado(), p, [], []);
    expect(r).toMatchObject({ completo: true, verde: true, faltan: [] });
    expect(r.diferencias[0].causa).toBe('entrada');
  });

  it('una diferencia explicada no rompe el verde y lleva su motivo', () => {
    const acc: AccionOv[] = [{ accion: 'avanzar', folio: '#2', sku: null, estado_antes: 'por_enviar', estado: 'cancelado' }];
    const r = evaluarDia('2026-11-20', lado(), lado(), acc, [
      { clave: 'ov:avanzar:#2:por_enviar>cancelado', motivo: 'cancelación masiva del viejo no liberaba' },
    ]);
    expect(r.verde).toBe(true);
    expect(r.diferencias[0]).toMatchObject({ causa: 'explicada', motivo: 'cancelación masiva del viejo no liberaba' });
  });

  it('incompleto si un lado no corrió com-minmax o la OC ese día, o si la configuración difiere', () => {
    const r = evaluarDia('2026-11-20', lado({ corridas: [{ proceso: 'com-minmax', ok: true }] }), lado({ firmaGlobal: 'h' }), [], []);
    expect(r.completo).toBe(false);
    expect(r.verde).toBe(false);
    expect(r.faltan).toEqual([
      'viejo: sin zoho-generar-oc correcto ese día',
      'configuración, parámetros o mapeo distintos (copiar editables)',
    ]);
  });

  it('racha: días de calendario seguidos y verdes que terminan en la fecha', () => {
    const d = (fecha: string, verde = true) => ({ fecha, verde });
    expect(racha([d('2026-11-28'), d('2026-11-29'), d('2026-11-30'), d('2026-12-01')], '2026-12-01')).toBe(4);
    expect(racha([d('2026-11-28'), d('2026-11-30'), d('2026-12-01')], '2026-12-01')).toBe(2);
    expect(racha([d('2026-11-29'), d('2026-11-30', false), d('2026-12-01')], '2026-12-01')).toBe(1);
    expect(racha([d('2026-11-29'), d('2026-11-30')], '2026-12-01')).toBe(0);
  });

  it('reporte legible con el estado, las secciones y la racha', () => {
    const p = lado({ minmax: [{ sku: 'A', minimo: 12, maximo: 20, calculado_at: null }] });
    const txt = reporteParidad(evaluarDia('2026-11-20', lado(), p, [], []), 0);
    expect(txt).toContain('Paridad Comercializadora 2026-11-20: CON DIFERENCIAS');
    expect(txt).toContain('Diferencias sin explicar (1):');
    expect(txt).toContain('minmax:A:minimo  viejo=10 portal=12  minimo');
    expect(txt).toContain('Racha: 0 de 3 días seguidos sin diferencias.');
  });
});
