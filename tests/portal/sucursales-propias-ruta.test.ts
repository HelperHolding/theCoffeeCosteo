import { describe, expect, it, vi } from 'vitest';

const acceso = vi.hoisted(() => ({ valor: null as unknown }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/sesion', () => ({ accesoPagos: async () => acceso.valor }));
const preparar = vi.hoisted(() => vi.fn());
vi.mock('@/lib/sucursales-propias/corrida', async () => {
  const zip = await import('../../lib/sucursales-propias/zip');
  return { ErrorCorrida: zip.ErrorCorrida, MAX_ZIP: 10, prepararCorrida: preparar };
});
import { POST } from '../../app/api/sucursales/propias/pagos/route';

const pedir = (archivo?: File) => {
  const fd = new FormData();
  if (archivo) fd.append('zip', archivo);
  return POST(new Request('http://x/api/sucursales/propias/pagos', { method: 'POST', body: fd }));
};

describe('POST /api/sucursales/propias/pagos', () => {
  it('niega sin acceso y con solo lectura, sin tocar la corrida', async () => {
    acceso.valor = {
      ok: false,
      status: 403,
      destino: '/',
      mensaje: 'No tienes acceso a Pagos de Sucursales propias.',
    };
    expect((await pedir(new File(['x'], 'a.zip'))).status).toBe(403);
    acceso.valor = { ok: true, db: {}, perfil: {}, nivel: 'lectura', puedeAplicar: false };
    const r = await pedir(new File(['x'], 'a.zip'));
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Tu acceso a Pagos es de solo lectura.' });
    expect(preparar).not.toHaveBeenCalled();
  });

  it('valida archivo y tamaño; un ErrorCorrida sale como 422 con su mensaje', async () => {
    acceso.valor = { ok: true, db: {}, perfil: {}, nivel: 'edicion', puedeAplicar: true };
    expect((await pedir()).status).toBe(400);
    expect((await pedir(new File(['01234567890'], 'grande.zip'))).status).toBe(413);
    const { ErrorCorrida } = await import('../../lib/sucursales-propias/zip');
    preparar.mockRejectedValueOnce(new ErrorCorrida('El archivo no es un ZIP válido.'));
    const r = await pedir(new File(['x'], 'a.zip'));
    expect(r.status).toBe(422);
    expect(await r.json()).toEqual({ error: 'El archivo no es un ZIP válido.' });
    preparar.mockResolvedValueOnce({ corridaId: 7, avisos: [] });
    expect(await (await pedir(new File(['x'], 'a.zip'))).json()).toEqual({ corridaId: 7, avisos: [] });
  });
});

describe('registro de errores de la ruta', () => {
  it('un error de supabase-js (objeto plano) no deja la CLABE en los logs', async () => {
    acceso.valor = { ok: true, db: {}, perfil: {}, nivel: 'edicion', puedeAplicar: true };
    const espia = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    preparar.mockRejectedValueOnce({
      message: 'dup',
      code: '23505',
      details: 'Key (clabe)=(012320000000001234)',
      hint: 'clabe 012320000000001234',
    });
    const r = await pedir(new File(['x'], 'a.zip'));
    expect(r.status).toBe(500);
    expect(await r.json()).toEqual({ error: 'No se pudo registrar la corrida. Intenta de nuevo.' });
    expect(espia).toHaveBeenCalled();
    expect(JSON.stringify(espia.mock.calls)).not.toContain('012320000000001234');
    espia.mockRestore();
  });
});
