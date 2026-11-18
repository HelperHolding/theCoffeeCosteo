import { describe, expect, it, vi } from 'vitest';
import { crearConsultasCrm } from '@/lib/crm/agente';
import type { Db } from '@/lib/portal/consultas';

// Cliente falso con lo mínimo del constructor de consultas de Supabase: filtra filas en memoria.
type Fila = Record<string, unknown>;
function dbFalsa(tablas: Record<string, Fila[]>, rpc: Record<string, unknown>) {
  const consulta = (filas: Fila[]) => {
    let r = filas;
    const q = {
      select: () => q,
      eq: (c: string, v: unknown) => ((r = r.filter((f) => f[c] === v)), q),
      in: (c: string, v: unknown[]) => ((r = r.filter((f) => v.includes(f[c]))), q),
      ilike: (c: string, v: string) => {
        const t = v.replaceAll('%', '').toLowerCase();
        r = r.filter((f) => String(f[c]).toLowerCase().includes(t));
        return q;
      },
      order: () => q,
      limit: (n: number) => ((r = r.slice(0, n)), q),
      single: () => Promise.resolve({ data: r[0] ?? null, error: r[0] ? null : 'sin fila' }),
      maybeSingle: () => Promise.resolve({ data: r[0] ?? null, error: null }),
      then: (ok: (v: unknown) => unknown) => Promise.resolve({ data: r, error: null }).then(ok),
    };
    return q;
  };
  return {
    from: (t: string) => consulta(tablas[t] ?? []),
    rpc: vi.fn((n: string) => Promise.resolve({ data: rpc[n], error: null })),
  } as unknown as Db;
}

const etapas = [
  {
    id: 'e5',
    clave: 'bienvenida',
    nombre: 'Bienvenida',
    numero: 5,
    paso: null,
    carril: null,
    embudo: 'general',
  },
  { id: 'e266', clave: 'obra', nombre: 'Obra', numero: null, paso: '26.6', carril: null, embudo: 'general' },
  { id: 'ecof', clave: 'cof', nombre: 'COF', numero: 9, paso: null, carril: 'legal', embudo: 'general' },
  {
    id: 'econ',
    clave: 'contrato',
    nombre: 'Contrato',
    numero: 10,
    paso: null,
    carril: 'legal',
    embudo: 'general',
  },
];
const req = (etapa_id: string, nombre: string, estado: string, area_cumple = 'proyectos') => ({
  etapa_id,
  nombre,
  estado,
  obligatorio: true,
  area_cumple,
  area_valida: area_cumple,
});

function consultaCard(db: Db) {
  const c = crearConsultasCrm(db).find((x) => x.nombre === 'consultar_card');
  if (!c) throw new Error('falta consultar_card');
  return c;
}

describe('consultar_card', () => {
  it('resume paso, faltantes, carril Legal y plazo de una sucursal', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-15T12:00:00Z'));
    const db = dbFalsa(
      {
        crm_franquiciatarios: [],
        crm_tiendas: [
          {
            id: 's1',
            nombre: 'Querétaro Juriquilla',
            ciudad: 'Querétaro',
            franquiciatario: 'Mariana Ortiz',
            embudo: 'general',
            etapa_id: 'e266',
            fecha_estimada_apertura: '2027-01-20',
            fecha_confirmada_apertura: null,
            fecha_limite_apertura: '2027-01-28',
          },
        ],
        crm_etapas: etapas,
        crm_v_candados: [{ card_id: 's1', liberado: false }],
      },
      {
        crm_requisitos_de: [
          req('e266', 'Fotos de terminación de obra', 'pendiente'),
          req('e266', 'Proyecto ejecutivo', 'validado'),
          req('ecof', 'COF enviada', 'validado', 'legal'),
          req('ecof', 'COF firmada', 'cumplido', 'legal'),
          req('econ', 'Contrato firmado', 'pendiente', 'legal'),
        ],
      },
    );
    const r = (await consultaCard(db).ejecutar({ nombre: 'juriquilla' })) as Record<string, any>;
    vi.useRealTimers();
    expect(r.card).toMatchObject({ id: 's1', tipo: 'sucursal', enlace: '/crm/sucursales/s1' });
    expect(r.paso).toEqual({ numero: '26.6', nombre: 'Obra' });
    expect(r.requisitos_etapa.listos).toBe('1/2');
    expect(r.requisitos_etapa.detalle[0]).toEqual({
      requisito: 'Fotos de terminación de obra',
      obligatorio: true,
      estado: 'pendiente, lo registra proyectos',
    });
    expect(r.carril_legal.listos).toBe('1/3');
    expect(r.carril_legal.detalle[1]).toMatchObject({
      etapa: 'COF',
      estado: 'registrado, falta que lo valide legal',
    });
    expect(r.apertura).toEqual({
      estimada: '2027-01-20',
      confirmada: null,
      limite_120_dias: '2027-01-28',
      dias_restantes: 74,
    });
  });

  it('un franquiciatario no trae carril Legal ni plazo, y sin candado no truena', async () => {
    const db = dbFalsa(
      {
        crm_franquiciatarios: [
          { id: 'f1', nombre: 'Mariana Ortiz', ciudad_interes: 'Querétaro', etapa_id: 'e5' },
        ],
        crm_tiendas: [],
        crm_etapas: etapas,
        crm_v_candados: [],
      },
      { crm_requisitos_de: [req('e5', 'Carta de intención', 'no_aplica', 'ventas')] },
    );
    const r = (await consultaCard(db).ejecutar({ nombre: 'mariana' })) as Record<string, any>;
    expect(r.paso).toEqual({ numero: '5', nombre: 'Bienvenida' });
    expect(r.requisitos_etapa).toMatchObject({ listos: '1/1', candado_liberado: false });
    expect(r).not.toHaveProperty('carril_legal');
    expect(r).not.toHaveProperty('apertura');
  });

  it('pide el nombre o avisa cuando hay varias coincidencias', async () => {
    const db = dbFalsa(
      {
        crm_franquiciatarios: [{ id: 'f1', nombre: 'Puebla Centro SA', ciudad_interes: 'Puebla' }],
        crm_tiendas: [
          { id: 's2', nombre: 'Puebla Centro', ciudad: 'Puebla', franquiciatario: null, embudo: 'general' },
        ],
      },
      {},
    );
    expect(await consultaCard(db).ejecutar({})).toEqual({ error: 'Indica el nombre de la card o su ID.' });
    const r = (await consultaCard(db).ejecutar({ nombre: 'puebla' })) as Record<string, any>;
    expect(r.varias_coincidencias).toHaveLength(2);
  });
});
