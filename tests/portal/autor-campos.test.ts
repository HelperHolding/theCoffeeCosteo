import { expect, it, vi } from 'vitest';
import type { Historial, RequisitoCard } from '@/lib/crm/tipos';

vi.mock('server-only', () => ({}));
const { autorDeCampos } = await import('@/lib/crm/unificado/consultas');

const req = (o: Partial<RequisitoCard>) =>
  ({ requisito_id: o.campo ?? 'x', estado: 'validado', cumplido_por: null, ...o }) as RequisitoCard;
const hist = (o: Partial<Historial>) => ({ entidad: 'crm_tiendas', origen: 'crm', ...o }) as Historial;

it('quién capturó un dato sale del último cambio de ese campo en la bitácora', () => {
  const [limite, jestor, pendiente, documento] = autorDeCampos(
    [
      req({ campo: 'fecha_limite_apertura' }),
      req({ campo: 'numero_tienda_jestor' }),
      req({ campo: 'fecha_apertura', estado: 'pendiente' }),
      req({ campo: null, cumplido_por: 'ana', cumplido_en: '2026-11-01T10:00:00Z' }),
    ],
    [
      // Más reciente primero, como lo carga el expediente.
      hist({ actor_id: 'luis', fecha: '2026-11-10T10:00:00Z', cambios: { direccion: {} } }),
      hist({ actor_id: 'andres', fecha: '2026-11-09T10:00:00Z', cambios: { fecha_limite_apertura: {} } }),
      hist({ actor_id: 'otro', fecha: '2026-11-01T10:00:00Z', cambios: { fecha_limite_apertura: {} } }),
      hist({
        actor_id: null,
        origen: 'zoho',
        fecha: '2026-10-01T10:00:00Z',
        cambios: { numero_tienda_jestor: {} },
      }),
    ],
  );
  expect(limite).toMatchObject({
    cumplido_por: 'andres',
    cumplido_en: '2026-11-09T10:00:00Z',
    validado_por: 'andres',
  });
  // Lo trajo Zoho sin autor: no se le atribuye a nadie.
  expect(jestor.cumplido_por).toBeNull();
  expect(pendiente.cumplido_por).toBeNull();
  expect(documento.cumplido_por).toBe('ana');
});
