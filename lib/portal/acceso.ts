/** Dominio de las cuentas de Auth del sitio viejo (thecoffeemexico): `<usuario>@thecoffee.internal`. */
export const DOMINIO_USUARIOS = 'thecoffee.internal';

/**
 * Correo de Auth para lo que escribe la persona: un correo tal cual, o un usuario del sitio viejo
 * (`Ana.Lopez` → `ana.lopez@thecoffee.internal`). Null si no es ninguno de los dos.
 */
export function correoDeAcceso(entrada: string): string | null {
  const t = entrada.trim().normalize('NFC');
  if (!t) return null;
  if (t.includes('@')) return t;
  // Letras con acento o ñ: el sitio viejo las aceptaba en el usuario (p. ej. csánchez).
  return /^[\p{L}\p{N}._-]+$/u.test(t) ? `${t.toLowerCase()}@${DOMINIO_USUARIOS}` : null;
}
