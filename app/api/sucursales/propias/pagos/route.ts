import { accesoPagos } from '@/lib/supabase/sesion';
import { ErrorCorrida, MAX_ZIP, prepararCorrida } from '@/lib/sucursales-propias/corrida';

export const runtime = 'nodejs';
// Lee hasta ~20 PDF y consulta Zoho (proveedores + facturas de ~16 proveedores): unos segundos, con margen.
export const maxDuration = 120;

/** Sube el ZIP de recibos de una corrida (spec §4 paso 1). Por route handler: las server actions aceptan 1 MB. */
export async function POST(req: Request) {
  const a = await accesoPagos();
  if (!a.ok) return Response.json({ error: a.mensaje }, { status: a.status });
  if (!a.puedeAplicar)
    return Response.json({ error: 'Tu acceso a Pagos es de solo lectura.' }, { status: 403 });
  const form = await req.formData().catch(() => null);
  const zip = form?.get('zip');
  if (!(zip instanceof File)) return Response.json({ error: 'Sube el ZIP de recibos.' }, { status: 400 });
  if (zip.size > MAX_ZIP) return Response.json({ error: 'El ZIP pesa más de 4 MB.' }, { status: 413 });
  try {
    return Response.json(await prepararCorrida(a.db, zip.name, new Uint8Array(await zip.arrayBuffer())));
  } catch (e) {
    if (e instanceof ErrorCorrida) return Response.json({ error: e.message }, { status: 422 });
    // Solo message y code: supabase-js lanza objetos planos cuyo details/hint puede traer una CLABE.
    const { message, code } = (e ?? {}) as { message?: unknown; code?: unknown };
    console.error(
      '[sucursales-propias] subir corrida',
      typeof message === 'string' ? message : 'error',
      typeof code === 'string' ? code : '',
    );
    return Response.json({ error: 'No se pudo registrar la corrida. Intenta de nuevo.' }, { status: 500 });
  }
}
