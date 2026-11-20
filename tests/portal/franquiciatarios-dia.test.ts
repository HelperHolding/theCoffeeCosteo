import { describe, expect, it } from 'vitest';
import { armarDia, nombreFirma } from '../../lib/franquiciatarios/dia';
import type {
  FranqFirma,
  FranqPunto,
  FranqRespuesta,
  FranqSeccion,
  SeccionClave,
} from '../../lib/franquiciatarios/tipos';

// armarDia con la rutina v2: rondas (próxima y atrasadas), vigencia por corrección y convivencia con la v1.
const DIA = '2026-11-20';
const t = (hhmm: string) => new Date(`${DIA}T${hhmm}:00-06:00`).toISOString(); // hora de CDMX

const seccion = (
  id: number,
  plantilla: number,
  clave: SeccionClave,
  firmas: FranqSeccion['firmas'],
): FranqSeccion => ({
  id,
  plantilla_id: plantilla,
  clave,
  nombre: clave,
  orden: id,
  firmas,
});
const punto = (id: number, seccion_id: number, extra: Partial<FranqPunto> = {}): FranqPunto => ({
  id,
  seccion_id,
  orden: id,
  actividad: `Punto ${id}`,
  estandar: 'x',
  tipo: 'unico',
  cada_min: null,
  margen_min: null,
  dato: null,
  corte: null,
  ...extra,
});
let rid = 1;
const resp = (
  checklist_id: number,
  punto_id: number,
  hora: string,
  extra: Partial<FranqRespuesta> = {},
): FranqRespuesta => ({
  id: rid++,
  checklist_id,
  company_id: 514,
  punto_id,
  cumple: true,
  observacion: null,
  barista_id: 1,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: t(hora),
  sesion: null,
  dispositivo: null,
  corrige_id: null,
  motivo: null,
  dato: null,
  ...extra,
});
const firma = (checklist_id: number, tipo: FranqFirma['tipo'], hora: string): FranqFirma => ({
  id: rid++,
  checklist_id,
  company_id: 514,
  tipo,
  barista_id: 1,
  nombre: 'Ana',
  registrado_por: 'u',
  registrado_en: t(hora),
  sesion: null,
  dispositivo: null,
});

// v1 = plantilla 1 (apertura 1, cambio 2, cierre 3); v2 = plantilla 2 (apertura 11, durante 12, medio 13, cierre 14).
const SECCIONES = [
  seccion(1, 1, 'apertura', ['responsable']),
  seccion(2, 1, 'cambio', ['entrega', 'recibe']),
  seccion(3, 1, 'cierre', ['responsable']),
  seccion(11, 2, 'apertura', ['responsable']),
  seccion(12, 2, 'durante', []),
  seccion(13, 2, 'medio', ['entrega', 'recibe']),
  seccion(14, 2, 'cierre', ['responsable', 'visto_bueno']),
];
const PUNTOS = [
  punto(1, 1),
  punto(2, 2),
  punto(3, 3),
  punto(111, 11),
  punto(121, 12, { tipo: 'recurrente', cada_min: 60, margen_min: 15 }), // baños
  punto(122, 12, { tipo: 'recurrente' }), // según demanda
  punto(131, 13),
  punto(141, 14),
];

describe('armarDia · rutina v2', () => {
  it('rondas: cuentan desde la última; atrasada al pasar frecuencia + tolerancia; según demanda nunca', () => {
    const d = armarDia({
      dia: DIA,
      secciones: SECCIONES,
      puntos: PUNTOS,
      checklists: [
        { id: 10, seccion: 'apertura', seccion_id: 11 },
        { id: 20, seccion: 'durante', seccion_id: 12 },
      ],
      respuestas: [
        resp(10, 111, '07:00'),
        resp(20, 121, '08:00'),
        resp(20, 121, '09:00'),
        resp(20, 122, '08:30'),
      ],
      firmas: [firma(10, 'responsable', '07:30')],
      incidencias: [],
      vigente: 2,
      ahora: new Date(t('10:20')),
    });
    expect(d.secciones.map((s) => s.clave)).toEqual(['apertura', 'durante', 'medio', 'cierre']);
    const durante = d.secciones.find((s) => s.clave === 'durante')!;
    const banos = durante.puntos.find((p) => p.id === 121)!;
    expect(banos.rondas.map((r) => r.registrado_en)).toEqual([t('08:00'), t('09:00')]);
    expect(banos.proxima).toBe(t('10:00'));
    expect(banos.atrasada).toBe(true); // 10:20 > 10:00 + 15 min
    expect(durante.puntos.find((p) => p.id === 122)!.atrasada).toBe(false);
    expect(durante.atrasos).toBe(1);
    expect(durante.estado).toBe('en-curso'); // sin firmas nunca queda «completa»
  });

  it('sin registros, la primera ronda cuenta desde la firma de apertura; con el cierre firmado no hay atrasos', () => {
    const base = {
      dia: DIA,
      secciones: SECCIONES,
      puntos: PUNTOS,
      checklists: [
        { id: 10, seccion: 'apertura' as const, seccion_id: 11 },
        { id: 40, seccion: 'cierre' as const, seccion_id: 14 },
      ],
      respuestas: [],
      incidencias: [],
      vigente: 2,
      ahora: new Date(t('09:00')),
    };
    const abierta = armarDia({ ...base, firmas: [firma(10, 'responsable', '07:30')] });
    const banos = abierta.secciones.find((s) => s.clave === 'durante')!.puntos.find((p) => p.id === 121)!;
    expect(banos.proxima).toBe(t('08:30'));
    expect(banos.atrasada).toBe(true);
    const cerrada = armarDia({
      ...base,
      firmas: [firma(10, 'responsable', '07:30'), firma(40, 'responsable', '08:50')],
    });
    expect(cerrada.secciones.find((s) => s.clave === 'durante')!.atrasos).toBe(0);
  });

  it('vigencia: un punto único muestra su última corrección; una ronda corregida sale de las rondas', () => {
    const r1 = resp(10, 111, '07:00', { cumple: false, observacion: 'Sin luz' });
    const r2 = resp(10, 111, '07:10', { corrige_id: r1.id });
    const ronda = resp(20, 121, '08:00', { cumple: false, observacion: 'Sin papel' });
    const corr = resp(20, 121, '08:05', { corrige_id: ronda.id, motivo: 'Sí había' });
    const d = armarDia({
      dia: DIA,
      secciones: SECCIONES,
      puntos: PUNTOS,
      checklists: [
        { id: 10, seccion: 'apertura', seccion_id: 11 },
        { id: 20, seccion: 'durante', seccion_id: 12 },
      ],
      respuestas: [r1, r2, ronda, corr],
      firmas: [],
      incidencias: [],
      vigente: 2,
    });
    const ap = d.secciones.find((s) => s.clave === 'apertura')!.puntos[0];
    expect(ap.respuesta?.id).toBe(r2.id);
    expect(ap.anteriores.map((a) => a.id)).toEqual([r1.id]);
    const banos = d.secciones.find((s) => s.clave === 'durante')!.puntos.find((p) => p.id === 121)!;
    expect(banos.rondas.map((r) => r.id)).toEqual([corr.id]);
    expect(d.secciones.find((s) => s.clave === 'durante')!.noes).toBe(0);
  });

  it('convivencia: hoy, lo empezado con la v1 sigue con la v1 y «cambio» reemplaza a «medio»', () => {
    const d = armarDia({
      dia: DIA,
      secciones: SECCIONES,
      puntos: PUNTOS,
      checklists: [
        { id: 1, seccion: 'apertura', seccion_id: 1 },
        { id: 2, seccion: 'cambio', seccion_id: 2 },
      ],
      respuestas: [],
      firmas: [],
      incidencias: [],
      vigente: 2,
      ahora: new Date(t('12:00')),
    });
    expect(d.secciones.map((s) => [s.clave, s.puntos[0]?.id])).toEqual([
      ['apertura', 1],
      ['durante', 121],
      ['cambio', 2],
      ['cierre', 141],
    ]);
  });

  it('un día anterior llenado con la v1 muestra solo sus fases', () => {
    const d = armarDia({
      dia: '2026-11-19',
      secciones: SECCIONES,
      puntos: PUNTOS,
      checklists: [{ id: 1, seccion: 'apertura', seccion_id: 1 }],
      respuestas: [],
      firmas: [],
      incidencias: [],
      vigente: 2,
    });
    expect(d.secciones.map((s) => s.clave)).toEqual(['apertura']);
  });

  it('nombres de firma por fase', () => {
    expect(nombreFirma('apertura', 'responsable')).toBe('Barista turno mañana');
    expect(nombreFirma('medio', 'recibe')).toBe('Recibe · turno tarde');
    expect(nombreFirma('cierre', 'visto_bueno')).toBe('Visto bueno del gerente');
    expect(nombreFirma('cambio', 'entrega')).toBe('Entrega');
  });
});
