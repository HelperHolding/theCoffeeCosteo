import { beforeEach, expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  user: vi.fn(),
  perfil: vi.fn(),
  acceso: vi.fn(),
  cupo: vi.fn(),
  stream: vi.fn(),
}));
vi.mock('../../lib/supabase/servidor', () => ({
  servidor: async () => ({
    auth: { getUser: m.user },
    from: (tabla: string) => ({
      select: () => ({
        eq: () =>
          tabla === 'perfil_modulos' ? { eq: () => ({ maybeSingle: m.acceso }) } : { maybeSingle: m.perfil },
      }),
    }),
    rpc: m.cupo,
  }),
}));
vi.mock('ai', async (original) => ({ ...(await original<typeof import('ai')>()), streamText: m.stream }));
import { POST } from '../../app/api/chat/crm/route';
import { herramientasChat } from '../../lib/chat/herramientas';
import { agentes } from '../../lib/chat/agentes';
import { enlacePortal } from '../../lib/chat/entrada';
import type { Db } from '../../lib/portal/consultas';

const peticion = () =>
  new Request('https://portal.test/api/chat/crm', {
    method: 'POST',
    headers: { origin: 'https://portal.test', 'Content-Type': 'application/json' },
    body: JSON.stringify({
      messages: [{ role: 'user', parts: [{ type: 'text', text: '¿Cómo va Polanco?' }] }],
    }),
  });
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('ANTHROPIC_API_KEY', 'solo-prueba');
  m.user.mockResolvedValue({ data: { user: { id: 'usuario' } }, error: null });
  m.perfil.mockResolvedValue({ data: { activo: true }, error: null });
  m.acceso.mockResolvedValue({ data: { nivel: 'lectura' }, error: null });
  m.cupo.mockResolvedValue({ data: true, error: null });
  m.stream.mockReturnValue({ toUIMessageStreamResponse: () => new Response('ok') });
});

it('exige acceso al CRM antes de reservar cupo', async () => {
  m.acceso.mockResolvedValue({ data: null, error: null });
  expect((await POST(peticion())).status).toBe(403);
  m.acceso.mockResolvedValue({ data: null, error: { message: 'x' } });
  expect((await POST(peticion())).status).toBe(503);
  expect(m.cupo).not.toHaveBeenCalled();
  expect(m.stream).not.toHaveBeenCalled();
});

it('usa las reglas y solo las consultas del CRM', async () => {
  expect((await POST(peticion())).status).toBe(200);
  const opciones = m.stream.mock.calls[0][0];
  expect(opciones.instructions).toContain('CRM Franquicias');
  expect(Object.keys(opciones.tools)).toEqual([
    'resumen_pipeline',
    'buscar_tiendas',
    'consultar_tienda',
    'buscar_actividades',
    'buscar_prospectos',
    'consultar_prospecto',
    'buscar_contactos',
    'historial_cambios',
  ]);
});

it('cada agente queda acotado a su módulo y es de solo lectura', () => {
  const db = {} as Db;
  const senal = new AbortController().signal;
  const costeo = Object.keys(herramientasChat(db, senal, 'costeo'));
  const crm = Object.keys(herramientasChat(db, senal, 'crm'));
  expect(costeo.some((n) => crm.includes(n))).toBe(false);
  expect([...costeo, ...crm].every((n) => /^(buscar|consultar|resumen|historial|recetas)_/.test(n))).toBe(
    true,
  );
  expect(agentes.costeo.instrucciones).toMatch(/SOLO costeo/);
  expect(agentes.costeo.instrucciones).toMatch(/CRM/);
  expect(agentes.crm.instrucciones).toMatch(/SOLO el CRM/);
  for (const a of Object.values(agentes))
    expect(a.instrucciones).toMatch(/no puedes crear, modificar, mover/);
});

it('enlaza solo registros internos del CRM', () => {
  const uuid = '0f8fad5b-d9cb-469f-a165-70867728950e';
  expect(enlacePortal(`/crm/tiendas/${uuid}`)).toBeDefined();
  expect(enlacePortal(`/crm/contactos/${uuid}`)).toBeDefined();
  expect(enlacePortal(`/crm/tiendas/${uuid}/borrar`)).toBeUndefined();
  expect(enlacePortal('https://externo.test/crm/tiendas/x')).toBeUndefined();
});
