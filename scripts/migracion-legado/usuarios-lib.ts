export type RolPortal = 'interno' | 'franquiciado' | 'proveedor';

/** Fila de public.usuarios en bliocjvq (ids como texto para no depender de su tipo). */
export interface UsuarioLegado {
  id: string;
  auth_uid: string | null;
  /** Correo de su cuenta de Auth en el sitio viejo (`<usuario>@thecoffee.internal`), si tiene. */
  auth_email: string | null;
  username: string;
  nombre: string;
  correo: string | null;
  rol: string;
  subtipo: string | null;
  supplier_key: string | null;
  parent_id: string | null;
  permisos: unknown;
  activo: boolean;
}
export interface CuentaPortal {
  id: string;
  email: string;
}
export interface VinculoExistente {
  legado_id: string;
  user_id: string;
  origen: 'creado' | 'vinculado';
}
export type Accion =
  | { tipo: 'crear'; usuario: UsuarioLegado; rol: RolPortal }
  | { tipo: 'vincular'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'actualizar_clave'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'sin_cambios'; usuario: UsuarioLegado; userId: string }
  | { tipo: 'omitir'; usuario: UsuarioLegado; motivo: 'sin_cuenta_auth' | 'id_ocupado' | 'correo_repetido' | 'excluido' };

/** El portal no hereda roles internos del sitio viejo: el admin asigna roles de Costeo y módulos. */
export const rolPortal = (rolLegado: string): RolPortal =>
  rolLegado === 'franquiciado' ? 'franquiciado' : rolLegado === 'proveedor' ? 'proveedor' : 'interno';

/**
 * Qué hacer con cada usuario del sitio viejo, en este orden:
 * 0. En `excluidos` (usernames, p. ej. cuentas de prueba): se omite siempre.
 * 1. Ya vinculado: si la cuenta la creó el importador, se actualiza la clave; si se vinculó a una cuenta previa, nada.
 * 2. Su correo, o el de su cuenta de Auth, ya es cuenta del portal: se vincula (una sola vez por cuenta). Así no
 *    choca con una cuenta `<usuario>@thecoffee.internal` creada a mano en el portal.
 * 3. Sin cuenta de Auth en el sitio viejo: se omite (hay que restablecerle la contraseña).
 * 4. Su id de Auth ya existe en el portal: se omite y se revisa a mano.
 * 5. Si no: se crea con el mismo id y hash de contraseña.
 */
export function planUsuarios(
  legado: UsuarioLegado[],
  portal: CuentaPortal[],
  vinculos: VinculoExistente[],
  excluidos: ReadonlySet<string> = new Set(),
): Accion[] {
  const porCorreo = new Map(portal.map((c) => [c.email.trim().toLowerCase(), c.id]));
  const ids = new Set(portal.map((c) => c.id));
  const vinculados = new Map(vinculos.map((v) => [v.legado_id, v]));
  const usados = new Set(vinculos.map((v) => v.user_id));
  return legado.map((usuario): Accion => {
    if (excluidos.has(usuario.username)) return { tipo: 'omitir', usuario, motivo: 'excluido' };
    const v = vinculados.get(usuario.id);
    if (v)
      return v.origen === 'creado'
        ? { tipo: 'actualizar_clave', usuario, userId: v.user_id }
        : { tipo: 'sin_cambios', usuario, userId: v.user_id };
    const coincide = (c: string | null) => (c ? porCorreo.get(c.trim().toLowerCase()) : undefined);
    const porMail = coincide(usuario.correo) ?? coincide(usuario.auth_email);
    if (porMail) {
      if (usados.has(porMail)) return { tipo: 'omitir', usuario, motivo: 'correo_repetido' };
      usados.add(porMail);
      return { tipo: 'vincular', usuario, userId: porMail };
    }
    if (!usuario.auth_uid) return { tipo: 'omitir', usuario, motivo: 'sin_cuenta_auth' };
    if (ids.has(usuario.auth_uid)) return { tipo: 'omitir', usuario, motivo: 'id_ocupado' };
    return { tipo: 'crear', usuario, rol: rolPortal(usuario.rol) };
  });
}

/** Resumen para la consola: conteos y omitidos por usuario. Sin correos, ids ni hashes. */
export function resumenPlan(acciones: Accion[]): string {
  const conteo = new Map<string, number>();
  for (const a of acciones) conteo.set(a.tipo, (conteo.get(a.tipo) ?? 0) + 1);
  const omitidos = acciones
    .filter((a): a is Extract<Accion, { tipo: 'omitir' }> => a.tipo === 'omitir')
    .map((a) => `  - ${a.usuario.username} (${a.motivo})`);
  return [
    ...['crear', 'vincular', 'actualizar_clave', 'sin_cambios', 'omitir'].map((t) => `${t}: ${conteo.get(t) ?? 0}`),
    ...(omitidos.length ? ['Omitidos:', ...omitidos] : []),
  ].join('\n');
}

export type ClaveVigente =
  | { fuente: 'auth' }
  | { fuente: 'hash'; hash: string }
  | { fuente: 'texto'; texto: string }
  | { fuente: 'ninguna' };

/**
 * Qué contraseña vale para cada usuario del sitio viejo. Allá hay dos fuentes: el hash de Auth y usuarios.password.
 * Al crear un usuario, un trigger le pone a Auth una clave inicial fija y la real queda en usuarios.password; solo
 * se copia a Auth cuando la persona entra (authenticate_and_migrate). Los restablecimientos y cambios de clave van
 * a Auth. Por eso: si Auth aún tiene la clave inicial, vale usuarios.password (bcrypt o, en cuentas antiguas, texto);
 * si no, vale Auth. La clave inicial nunca se hereda: con ella cualquiera entraría a esas cuentas.
 */
export function claveVigente(passwordUsuarios: string | null, authTieneClaveInicial: boolean): ClaveVigente {
  if (!authTieneClaveInicial) return { fuente: 'auth' };
  const p = passwordUsuarios ?? '';
  if (!p || p.startsWith('pbkdf2:')) return { fuente: 'ninguna' };
  return p.startsWith('$2') ? { fuente: 'hash', hash: p } : { fuente: 'texto', texto: p };
}
