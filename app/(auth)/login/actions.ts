'use server';
import { servidor } from '@/lib/supabase/servidor';
import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { rutaInterna } from '@/lib/portal/redireccion';
export async function entrar(_: string, form: FormData) {
  const db = await servidor();
  const email = String(form.get('email') ?? '').trim(),
    password = String(form.get('password') ?? '');
  if (!email || !password) return 'Escribe tu correo y contraseña.';
  const r = await db.auth.signInWithPassword({ email, password });
  if (r.error) return 'No pudimos iniciar sesión. Revisa tu correo y contraseña.';
  redirect(rutaInterna(String(form.get('next') ?? '')));
}
export async function salir() {
  const db = await servidor();
  const r = await db.auth.signOut();
  if (r.error) throw new Error('No se pudo cerrar la sesión');
  redirect('/login');
}
export async function establecer(_: string, form: FormData) {
  const password = String(form.get('password') ?? '');
  if (password.length < 8) return 'Usa al menos 8 caracteres.';
  if (password !== form.get('confirmacion')) return 'Las contraseñas no coinciden.';
  const db = await servidor();
  const user = await db.auth.getUser();
  if (user.error || !user.data.user)
    return 'El enlace venció. Pide uno nuevo en «¿Olvidaste tu contraseña?» o al administrador.';
  const r = await db.auth.updateUser({ password });
  if (r.error) return 'No se pudo establecer la contraseña. Revisa los requisitos de tu cuenta.';
  redirect('/');
}
/**
 * Envía el correo para elegir una contraseña nueva. Siempre responde lo mismo, exista o no la cuenta, para no revelar
 * qué correos tienen acceso. El enlace del correo pasa por /auth/confirm (type=recovery) a /establecer-contrasena.
 */
export async function recuperar(_: string, form: FormData) {
  const email = String(form.get('email') ?? '').trim();
  if (!email) return 'Escribe tu correo.';
  const h = await headers();
  const origen = `${h.get('x-forwarded-proto') ?? 'https'}://${h.get('host')}`;
  const db = await servidor();
  const r = await db.auth.resetPasswordForEmail(email, {
    redirectTo: `${origen}/auth/confirm?next=/establecer-contrasena`,
  });
  // Demasiados intentos: es lo único que se dice distinto, porque no revela nada de la cuenta.
  if (r.error?.status === 429)
    return 'Hiciste varios intentos seguidos. Espera unos minutos y vuelve a intentar.';
  return 'listo';
}
