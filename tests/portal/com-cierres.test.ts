import { describe, expect, it } from 'vitest';
import {
  afectados,
  estadoCierre,
  ultimoDiaPedir,
  uPeriodo,
  validarCierre,
} from '../../lib/comercializadora/cierres';

describe('cierres (port de _cieU, _cieEstado, _cieValidar, _cieAfectados, _cieUPeriodo)', () => {
  it('último día para pedir = ini − ceil(LT) − 1, cruzando meses', () => {
    expect(ultimoDiaPedir('2026-12-20', 5)).toBe('2026-12-14');
    expect(ultimoDiaPedir('2026-12-03', 2.2)).toBe('2026-11-29');
    expect(ultimoDiaPedir('2026-12-20', Number.NaN)).toBe('2026-12-19');
  });
  it('estado: cancelado, terminado, en cierre, ya no alcanza, último día hoy, próximo', () => {
    const c = { ini: '2026-12-20', fin: '2027-01-05', cancelado: false };
    expect(estadoCierre({ ...c, cancelado: true }, '2026-12-01', null).k).toBe('cancelado');
    expect(estadoCierre(c, '2027-01-06', null).k).toBe('terminado');
    expect(estadoCierre(c, '2026-12-21', null)).toEqual({ k: 'encierre', txt: 'En cierre hasta 5 ene' });
    expect(estadoCierre(c, '2026-12-15', '2026-12-14').k).toBe('tarde');
    expect(estadoCierre(c, '2026-12-14', '2026-12-14').k).toBe('ultimo');
    expect(estadoCierre(c, '2026-12-01', '2026-12-14')).toEqual({
      k: 'proximo',
      txt: 'Pide antes del 14 dic',
    });
    expect(estadoCierre(c, '2026-12-01', null).txt).toBe('Sin artículos afectados');
  });
  it('validación del formulario', () => {
    const f = { vendor_id: 'v1', ini: '2026-12-20', fin: '2026-12-30', todo: true, skus: [], notas: '' };
    expect(validarCierre(f, '2026-12-01', true)).toBeNull();
    expect(validarCierre({ ...f, vendor_id: '' }, '2026-12-01', true)).toBe('Elige un proveedor');
    expect(validarCierre({ ...f, fin: '2026-12-10' }, '2026-12-01', true)).toBe(
      'La fecha final no puede ser antes de la inicial',
    );
    expect(validarCierre({ ...f, ini: '2026-11-01', fin: '2026-11-20' }, '2026-12-01', true)).toBe(
      'Ya terminó: la fecha final es antes de hoy',
    );
    expect(validarCierre({ ...f, todo: false, skus: [] }, '2026-12-01', true)).toBe(
      'Elige al menos un artículo o marca todo el proveedor',
    );
    expect(validarCierre({ ...f, notas: 'x'.repeat(501) }, '2026-12-01', true)).toBe(
      'Las notas son de máximo 500 caracteres',
    );
  });
  it('afectados: activos del proveedor, o solo los de la lista', () => {
    const cat = [
      { sku: 'A', zoho_vendor_id: 'v1', estatus: 'Activo' },
      { sku: 'B', zoho_vendor_id: 'v1', estatus: 'Inactivo' },
      { sku: 'C', zoho_vendor_id: 'v2', estatus: 'Activo' },
      { sku: 'D', zoho_vendor_id: 'v1', estatus: null },
    ];
    expect(afectados({ vendor_id: 'v1', skus: null }, cat).map((a) => a.sku)).toEqual(['A', 'D']);
    expect(afectados({ vendor_id: 'v1', skus: ['D'] }, cat).map((a) => a.sku)).toEqual(['D']);
  });
  it('uPeriodo: el del servidor si es el mismo periodo; si no, el local', () => {
    const c = { ini: '2026-12-20', fin: '2026-12-30' };
    expect(uPeriodo(c, { u: '2026-12-10', ini: '2026-12-20', fin: '2026-12-30' }, '2026-12-14')).toBe(
      '2026-12-10',
    );
    expect(uPeriodo(c, { u: '2026-12-10', ini: '2026-12-21', fin: '2026-12-30' }, '2026-12-14')).toBe(
      '2026-12-14',
    );
  });
});
