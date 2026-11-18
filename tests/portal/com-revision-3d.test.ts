// Correcciones de la revisión final del plan 3d (I1 e I3; I2 está en com-motor.test.ts).
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dbFalsa } from './db-falsa';

const m = vi.hoisted(() => ({ db: null as unknown, limpiar: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('../../lib/comercializadora/funciones', () => ({ invocarFuncion: vi.fn() }));
vi.mock('../../lib/comercializadora/motor', () => ({ limpiarMotor: m.limpiar }));
vi.mock('../../lib/supabase/sesion', () => ({
  sesionComercializadora: async () => ({
    perfil: { user_id: 'u1', nombre: 'Ana', rol: 'interno' },
    accesos: { comercializadora: 'edicion' },
    nivel: 'edicion',
    db: m.db,
  }),
}));
import { aplicarPiezasApertura } from '../../app/(comercializadora)/comercializadora/acciones';

const base = () =>
  dbFalsa({
    com_catalogo: [
      { sku: 'A', cantidad_por_apertura: 0 },
      { sku: 'B', cantidad_por_apertura: 0 },
    ],
    com_plan_config_historial: [],
  });

describe('revisión 3d: aplicar piezas por apertura', () => {
  beforeEach(() => m.limpiar.mockClear());

  it('I1: al guardar, el motor vuelve a leer (DOH, Indicadores e Inicio ven el valor nuevo)', async () => {
    m.db = base().db;
    expect(await aplicarPiezasApertura([{ sku: 'A', valor: '3', antes: 0 }])).toEqual({
      ok: true,
      guardados: 1,
      fallas: [],
    });
    expect(m.limpiar).toHaveBeenCalledTimes(1);
  });

  it('I1: si no se guardó nada, la caché se queda', async () => {
    m.db = base().db;
    await aplicarPiezasApertura([{ sku: 'A', valor: '3', antes: 9 }]);
    expect(m.limpiar).not.toHaveBeenCalled();
  });

  it('I3: un valor inválido no desaparece en silencio: se reporta como falla', async () => {
    const f = base();
    m.db = f.db;
    expect(
      await aplicarPiezasApertura([
        { sku: 'A', valor: 'abc', antes: 0 },
        { sku: 'B', valor: '-2', antes: 0 },
        { sku: 'C', valor: '', antes: 0 },
        { sku: 'B', valor: '4', antes: 0 },
      ]),
    ).toEqual({
      ok: true,
      guardados: 1,
      fallas: [
        'A: valor no válido (usa un número de 0 en adelante)',
        'B: valor no válido (usa un número de 0 en adelante)',
        'C: valor no válido (usa un número de 0 en adelante)',
      ],
    });
    expect(f.tablas.com_catalogo.find((c) => c.sku === 'B')?.cantidad_por_apertura).toBe(4);
  });
});
