import { describe, expect, it } from 'vitest';
import { destinos } from '@/lib/crm/unificado/reglas';
import { estadoCandado, tramos, type EtapaGeneral } from '@/lib/crm/unificado/modelo';

// Mismo orden que la semilla de la migración 31 (los destinos deben coincidir con crm_avanzar).
const e = (orden: number, clave: string, extra: Partial<EtapaGeneral> = {}): EtapaGeneral => ({
  id: clave,
  clave,
  orden,
  nombre: clave,
  numero: null,
  area: 'ventas',
  card: 'franquiciatario',
  tipo: 'abierta',
  ...extra,
});
const ETAPAS: EtapaGeneral[] = [
  e(1, 'recepcion', { numero: 1 }),
  e(2, 'contacto', { numero: 2 }),
  e(3, 'revision_contrato', { numero: 3, opcional: true }),
  e(4, 'pld', { numero: 4 }),
  e(5, 'bienvenida', { numero: 5 }),
  e(6, 'formalizado', { tipo: 'ganada' }),
  e(7, 'locales', { numero: 6, card: 'sucursal' }),
  e(8, 'constancia', { numero: 7, card: 'sucursal', area: 'legal' }),
  e(9, 'transferencia', { numero: 8, card: 'sucursal', area: 'legal' }),
  e(10, 'p_arquitecta', { card: 'sucursal', area: 'proyectos', provisional: true }),
  e(11, 'p_3d', { card: 'sucursal', area: 'proyectos', provisional: true }),
  e(12, 'cof', { numero: 9, card: 'sucursal', area: 'legal' }),
  e(13, 'contrato', { numero: 10, card: 'sucursal', area: 'legal' }),
  e(14, 'operando', { card: 'sucursal', tipo: 'ganada', area: 'legal' }),
  e(15, 'standby', { card: null, tipo: 'lateral' }),
  e(16, 'descartada', { tipo: 'perdida' }),
  e(17, 'cancelada', { card: 'sucursal', tipo: 'perdida', area: 'legal' }),
];
const de = (clave: string) => ETAPAS.find((x) => x.clave === clave)!;
const claves = (clave: string, tipo: 'franquiciatario' | 'sucursal', previa: string | null = null) =>
  destinos(ETAPAS, de(clave), tipo, previa).map(
    (d) => `${d.tipo}:${d.etapa.clave}${d.requiereMotivo ? '*' : ''}`,
  );

describe('destinos permitidos (menú «Mover a…»)', () => {
  it('desde la 2 se avanza a la 3 o se omite la 3 con motivo; regresar, pausar y descartar piden motivo', () => {
    expect(claves('contacto', 'franquiciatario')).toEqual([
      'siguiente:revision_contrato',
      'omitir:pld*',
      'regresar:recepcion*',
      'standby:standby*',
      'cerrar:descartada*',
    ]);
  });

  it('al cerrar la 5 se formaliza y se pide el nombre de la primera sucursal', () => {
    const d = destinos(ETAPAS, de('bienvenida'), 'franquiciatario', null).find(
      (x) => x.tipo === 'siguiente',
    )!;
    expect(d.etapa.clave).toBe('formalizado');
    expect(d.pideSucursal).toBe(true);
  });

  it('en Proyectos (provisional) se puede pasar a otra provisional o directo a la COF', () => {
    expect(claves('p_arquitecta', 'sucursal').filter((x) => !x.startsWith('regresar'))).toEqual([
      'siguiente:p_3d',
      'proyectos:cof',
      'standby:standby*',
      'cerrar:cancelada*',
    ]);
  });

  it('desde Standby solo se reanuda en la etapa donde estaba (o se cierra)', () => {
    expect(claves('standby', 'sucursal', 'constancia')).toEqual(['volver:constancia', 'cerrar:cancelada*']);
  });

  it('una card cerrada no tiene destinos', () => {
    expect(claves('operando', 'sucursal')).toEqual([]);
  });
});

describe('candado y tramos', () => {
  it('estado del candado: bloqueada, lista, liberada; provisionales y cierres no tienen candado', () => {
    const c = { requisitos: { total: 3, listos: 1, faltante: null }, liberado: false };
    expect(estadoCandado(c, de('pld'))).toBe('bloqueada');
    expect(estadoCandado({ ...c, liberado: true }, de('pld'))).toBe('liberada');
    expect(estadoCandado({ ...c, requisitos: { total: 3, listos: 3, faltante: null } }, de('pld'))).toBe(
      'lista',
    );
    expect(estadoCandado(c, de('p_3d'))).toBe('sin-candado');
    expect(estadoCandado(c, de('operando'))).toBe('sin-candado');
  });

  it('agrupa las etapas en tramos por área en el orden del proceso', () => {
    expect(tramos(ETAPAS).map((t) => [t.clave, t.etapas.map((x) => x.clave)])).toEqual([
      ['ventas', ['recepcion', 'contacto', 'revision_contrato', 'pld', 'bienvenida']],
      ['locales', ['locales', 'constancia', 'transferencia']],
      ['proyectos', ['p_arquitecta', 'p_3d']],
      ['legal', ['cof', 'contrato']],
      ['cierre', ['formalizado', 'operando', 'standby', 'descartada', 'cancelada']],
    ]);
  });
});
