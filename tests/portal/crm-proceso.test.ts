import { describe, expect, it } from 'vitest';
import { CONTENIDO, pasosProceso } from '@/lib/crm/unificado/proceso';
import { estadoCarril } from '@/components/crm/unificado/vistas/carril-legal';
import type { EtapaGeneral } from '@/lib/crm/unificado/modelo';

// Mismas claves y orden que la migración 50 (crm_etapas, embudo general).
const e = (orden: number, clave: string, extra: Partial<EtapaGeneral> = {}): EtapaGeneral => ({
  id: clave,
  clave,
  orden,
  nombre: clave,
  numero: null,
  area: 'ventas',
  card: 'sucursal',
  tipo: 'abierta',
  ...extra,
});
const ETAPAS: EtapaGeneral[] = [
  e(1, 'recepcion', { numero: 1, card: 'franquiciatario' }),
  e(2, 'contacto', { numero: 2, card: 'franquiciatario' }),
  e(3, 'revision_contrato', { numero: 3, card: 'franquiciatario', opcional: true }),
  e(4, 'pld', { numero: 4, card: 'franquiciatario' }),
  e(5, 'bienvenida', { numero: 5, card: 'franquiciatario' }),
  e(6, 'formalizado', { card: 'franquiciatario', tipo: 'ganada' }),
  e(7, 'locales', { numero: 6 }),
  e(8, 'constancia', { numero: 7, area: 'legal' }),
  e(9, 'transferencia', { numero: 8, area: 'legal' }),
  e(10, 'levantamiento', { paso: '26.1', area: 'proyectos' }),
  e(11, 'boceto', { paso: '26.2', area: 'proyectos' }),
  e(12, 'envio_brasil', { paso: '26.3', area: 'proyectos' }),
  e(13, 'proyecto_3d', { paso: '26.4', area: 'proyectos' }),
  e(14, 'proyecto_ejecutivo', { paso: '26.5', area: 'proyectos' }),
  e(15, 'obra', { paso: '26.6', area: 'proyectos' }),
  e(16, 'capacitacion', { paso: '26.7', area: 'proyectos' }),
  e(17, 'cof', { numero: 9, area: 'legal', carril: 'legal' }),
  e(18, 'contrato', { numero: 10, area: 'legal', carril: 'legal' }),
  e(19, 'operando', { paso: '26.8', area: 'proyectos', tipo: 'ganada' }),
  e(20, 'standby', { card: null, tipo: 'lateral' }),
];

describe('mapa del proceso (doc 41 §2)', () => {
  it('cubre las 10 etapas, los 7 subpasos, el carril Legal y la apertura, en ese orden', () => {
    const pasos = pasosProceso(ETAPAS, [
      {
        etapa_id: 'pld',
        nombre: 'Survey',
        tipo: 'documento',
        area_cumple: 'ventas',
        area_valida: 'ventas',
        obligatorio: true,
      },
    ]);
    expect(pasos.map((p) => p.etapa.clave)).toEqual([
      'recepcion',
      'contacto',
      'revision_contrato',
      'pld',
      'bienvenida',
      'locales',
      'constancia',
      'transferencia',
      'levantamiento',
      'boceto',
      'envio_brasil',
      'proyecto_3d',
      'proyecto_ejecutivo',
      'obra',
      'capacitacion',
      'cof',
      'contrato',
      'operando',
    ]);
    // Lo que se registra sale del catálogo de requisitos, no del texto.
    expect(pasos.find((p) => p.etapa.clave === 'pld')?.requisitos.map((r) => r.nombre)).toEqual(['Survey']);
  });

  it('cada paso dice qué se hace, quién, dónde y qué sigue', () => {
    for (const [clave, c] of Object.entries(CONTENIDO)) {
      expect(c.hace.length, clave).toBeGreaterThan(0);
      expect(c.quien && c.donde && c.sigue, clave).toBeTruthy();
    }
  });
});

describe('carril Legal', () => {
  it('el estado avanza por COF enviada, COF firmada, contrato firmado y liberación', () => {
    expect(estadoCarril(new Set())).toBe('por_enviar');
    expect(estadoCarril(new Set(['cof_enviada']))).toBe('cof_enviada');
    expect(estadoCarril(new Set(['cof_enviada', 'cof_firmada']))).toBe('cof_firmada');
    expect(estadoCarril(new Set(['cof_enviada', 'cof_firmada', 'contrato_firmado']))).toBe(
      'contrato_firmado',
    );
    expect(estadoCarril(new Set(['contrato_firmado', 'liberacion_apertura']))).toBe('liberada');
  });
});
