import { describe, expect, it } from 'vitest';
import {
  CAMPOS_CONFIG,
  claveServidor,
  configPorDefecto,
  difConfig,
  leerRuta,
  normalizarConfig,
  ponerRuta,
  validarCorreos,
} from '../../lib/comercializadora/config';

describe('configuración del cálculo', () => {
  it('normaliza como el servidor: rangos, opciones, booleanos; conserva imp/cafe/zoho_oc/kpi tal cual', () => {
    const c = normalizarConfig({
      seg: { dias: 999 },
      consumo: { metodo: 'otro', alinear: 'si' },
      imp: { x: 1 },
      zoho_oc: { ocs: 3 },
    });
    expect(c.seg.dias).toBe(120);
    expect(c.consumo.metodo).toBe('promedio');
    expect(c.consumo.alinear).toBe(false);
    expect(c.imp).toEqual({ x: 1 });
    expect(c.zoho_oc).toEqual({ ocs: 3 });
    expect(normalizarConfig({}).auto.modo).toBe('simulacion');
  });
  it('cada campo editable apunta a una ruta que existe en los valores por defecto, y auto.modo no es editable', () => {
    const def = configPorDefecto();
    for (const c of CAMPOS_CONFIG) expect(leerRuta(def, c.ruta), c.ruta).not.toBeUndefined();
    expect(CAMPOS_CONFIG.map((c) => c.ruta)).not.toContain('auto.modo');
  });
  it('ponerRuta no muta el original', () => {
    const a = configPorDefecto();
    const b = ponerRuta(a, 'seg.dias', 12);
    expect(leerRuta(a, 'seg.dias')).toBe(10);
    expect(leerRuta(b, 'seg.dias')).toBe(12);
  });
  it('diff por ruta aplanada, sin zoho_oc', () => {
    const a = configPorDefecto();
    const b = ponerRuta(
      ponerRuta(ponerRuta(a, 'seg.dias', 12), 'temp.mes', [2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]),
      'zoho_oc',
      { ocs: 1 },
    );
    expect(difConfig(a, b)).toEqual([
      { clave: 'seg.dias', antes: 10, despues: 12 },
      { clave: 'temp.mes.0', antes: 1, despues: 2 },
    ]);
  });
  it('claves que recalculan el servidor: todas menos imp, cafe y kpi', () => {
    expect(claveServidor('seg.dias')).toBe(true);
    expect(claveServidor('imp.red')).toBe(false);
    expect(claveServidor('kpi.prec_min')).toBe(false);
  });
  it('correos: separa, valida, minúsculas, sin repetidos, máximo 20', () => {
    expect(validarCorreos('Ana@Mx.com; luis@x.mx, ana@mx.com')).toEqual({
      correos: ['ana@mx.com', 'luis@x.mx'],
    });
    expect(validarCorreos('ana@')).toEqual({
      error: 'Correo no válido: ana@. Debe tener la forma nombre@dominio.com',
    });
    expect(validarCorreos('')).toEqual({ correos: [] });
  });
});

describe('revisión final · edición de números y activaciones', () => {
  it('numeroConfig: vacío o inválido conserva el valor previo; fuera de rango se acota; enteros se redondean', async () => {
    const { numeroConfig } = await import('../../lib/comercializadora/config');
    const lt = { min: 1, max: 365, entero: true };
    expect(numeroConfig('', lt, 15)).toBe(15);
    expect(numeroConfig('abc', lt, 15)).toBe(15);
    expect(numeroConfig('500', lt, 15)).toBe(365);
    expect(numeroConfig('7.6', lt, 15)).toBe(8);
    expect(numeroConfig('0,5', { min: 0, max: 1 }, 0.1)).toBe(0.5);
  });
  it('validarEventos: nombre opcional, fechas obligatorias y fin ≥ inicio', async () => {
    const { validarEventos } = await import('../../lib/comercializadora/config');
    expect(validarEventos([{ nombre: 'Buen Fin', ini: '2026-11-13', fin: '2026-11-17' }])).toBeNull();
    expect(validarEventos([{ nombre: 'Sin fechas', ini: '', fin: '' }])).toBe(
      'La activación «Sin fechas» necesita fecha de inicio y de fin',
    );
    expect(validarEventos([{ nombre: '', ini: '2026-11-20', fin: '2026-11-10' }])).toBe(
      'La activación 1 termina antes de empezar',
    );
  });
});
