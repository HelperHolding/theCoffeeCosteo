import { expect, it } from 'vitest';
import { PROYECTO_LEGADO, PROYECTO_PORTAL, verificarProyecto } from '../../scripts/migracion-legado/conexion';

it('acepta la URL del pooler del proyecto esperado y rechaza otra', () => {
  const legado = `postgresql://postgres.${PROYECTO_LEGADO}:x@aws-0-us-east-1.pooler.supabase.com:5432/postgres`;
  expect(() => verificarProyecto(legado, PROYECTO_LEGADO)).not.toThrow();
  expect(() => verificarProyecto(legado, PROYECTO_PORTAL)).toThrow(/no corresponde al proyecto/);
});

it('acepta la conexión directa db.<proyecto>.supabase.co', () => {
  expect(() =>
    verificarProyecto(`postgresql://postgres:x@db.${PROYECTO_PORTAL}.supabase.co:5432/postgres`, PROYECTO_PORTAL),
  ).not.toThrow();
});

it('una URL mal formada falla sin mostrar la contraseña', () => {
  let mensaje = '';
  try {
    verificarProyecto('postgresql://usuario:pa#ss@host:5432/postgres', PROYECTO_LEGADO);
  } catch (e) {
    mensaje = `${(e as Error).message} ${JSON.stringify(e)}`;
  }
  expect(mensaje).toMatch(/no es válida/);
  expect(mensaje).not.toMatch(/pa#ss|usuario:pa/);
});
