import { describe, expect, it } from 'vitest';
import {
  claveVigente,
  planUsuarios,
  resumenPlan,
  rolPortal,
  type UsuarioLegado,
} from '../../scripts/migracion-legado/usuarios-lib';

const u = (o: Partial<UsuarioLegado> & Pick<UsuarioLegado, 'id' | 'username'>): UsuarioLegado => ({
  auth_uid: null,
  auth_email: null,
  nombre: o.username,
  correo: null,
  rol: 'comercial',
  subtipo: null,
  supplier_key: null,
  parent_id: null,
  permisos: null,
  activo: true,
  ...o,
});
const UID = (n: number) => `00000000-0000-0000-0000-${String(n).padStart(12, '0')}`;

describe('rolPortal', () => {
  it('franquiciado y proveedor se conservan; todo lo demás es interno', () => {
    expect(rolPortal('franquiciado')).toBe('franquiciado');
    expect(rolPortal('proveedor')).toBe('proveedor');
    for (const r of ['admin', 'ceo', 'comercial', 'supply', 'comercializadora', 'raro']) expect(rolPortal(r)).toBe('interno');
  });
});

describe('planUsuarios', () => {
  it('crea cuentas nuevas con el mismo id de Auth y rol sin Costeo, también si están inactivas', () => {
    const plan = planUsuarios(
      [u({ id: '1', username: 'ana', auth_uid: UID(1), rol: 'franquiciado', activo: false })],
      [],
      [],
    );
    expect(plan).toEqual([{ tipo: 'crear', usuario: expect.objectContaining({ id: '1' }), rol: 'franquiciado' }]);
  });

  it('omite los usuarios excluidos aunque su correo coincida o ya estén vinculados', () => {
    const plan = planUsuarios(
      [
        u({ id: '7', username: 'prueba_x', auth_uid: UID(7), correo: 'admin@ejemplo.mx' }),
        u({ id: '8', username: 'prueba_y', auth_uid: UID(8) }),
      ],
      [{ id: UID(90), email: 'admin@ejemplo.mx' }],
      [{ legado_id: '8', user_id: UID(8), origen: 'creado' }],
      new Set(['prueba_x', 'prueba_y']),
    );
    expect(plan.map((a) => [a.tipo, a.tipo === 'omitir' && a.motivo])).toEqual([
      ['omitir', 'excluido'],
      ['omitir', 'excluido'],
    ]);
  });

  it('vincula por correo sin importar mayúsculas, aunque el admin del sitio viejo sea admin', () => {
    const plan = planUsuarios(
      [u({ id: '2', username: 'sebas', auth_uid: UID(2), rol: 'admin', correo: ' Sebastian@Ejemplo.MX ' })],
      [{ id: UID(90), email: 'sebastian@ejemplo.mx' }],
      [],
    );
    expect(plan).toEqual([{ tipo: 'vincular', usuario: expect.objectContaining({ id: '2' }), userId: UID(90) }]);
  });

  it('dos usuarios viejos con el mismo correo: el segundo se omite', () => {
    const plan = planUsuarios(
      [
        u({ id: '3', username: 'a', auth_uid: UID(3), correo: 'x@ejemplo.mx' }),
        u({ id: '4', username: 'b', auth_uid: UID(4), correo: 'X@ejemplo.mx' }),
      ],
      [{ id: UID(91), email: 'x@ejemplo.mx' }],
      [],
    );
    expect(plan.map((a) => a.tipo)).toEqual(['vincular', 'omitir']);
    expect(plan[1]).toMatchObject({ motivo: 'correo_repetido' });
  });

  it('si el correo de su cuenta de Auth ya existe en el portal (creada a mano), se vincula en vez de chocar', () => {
    const plan = planUsuarios(
      [u({ id: '9', username: 'ana', auth_uid: UID(9), auth_email: 'Ana@thecoffee.internal' })],
      [{ id: UID(95), email: 'ana@thecoffee.internal' }],
      [],
    );
    expect(plan).toEqual([{ tipo: 'vincular', usuario: expect.objectContaining({ id: '9' }), userId: UID(95) }]);
  });

  it('sin cuenta de Auth en el sitio viejo y sin correo del portal: se omite', () => {
    expect(planUsuarios([u({ id: '5', username: 'c' })], [], [])).toEqual([
      { tipo: 'omitir', usuario: expect.objectContaining({ id: '5' }), motivo: 'sin_cuenta_auth' },
    ]);
  });

  it('si el id de Auth ya existe en el portal con otro correo, se omite', () => {
    const plan = planUsuarios(
      [u({ id: '6', username: 'd', auth_uid: UID(6) })],
      [{ id: UID(6), email: 'otro@ejemplo.mx' }],
      [],
    );
    expect(plan[0]).toMatchObject({ tipo: 'omitir', motivo: 'id_ocupado' });
  });

  it('en una segunda corrida actualiza la clave de las cuentas creadas y no toca las vinculadas', () => {
    const plan = planUsuarios(
      [u({ id: '7', username: 'e', auth_uid: UID(7) }), u({ id: '8', username: 'f', auth_uid: UID(8) })],
      [
        { id: UID(7), email: 'e@thecoffee.internal' },
        { id: UID(92), email: 'f@ejemplo.mx' },
      ],
      [
        { legado_id: '7', user_id: UID(7), origen: 'creado' },
        { legado_id: '8', user_id: UID(92), origen: 'vinculado' },
      ],
    );
    expect(plan.map((a) => a.tipo)).toEqual(['actualizar_clave', 'sin_cambios']);
  });
});

describe('resumenPlan', () => {
  it('cuenta por tipo y lista usuarios omitidos con su motivo, sin correos', () => {
    const texto = resumenPlan(
      planUsuarios(
        [u({ id: '1', username: 'ana', auth_uid: UID(1) }), u({ id: '5', username: 'c', correo: 'c@ejemplo.mx' })],
        [],
        [],
      ),
    );
    expect(texto).toContain('crear: 1');
    expect(texto).toContain('omitir: 1');
    expect(texto).toContain('c (sin_cuenta_auth)');
    expect(texto).not.toContain('c@ejemplo.mx');
  });
});

describe('claveVigente', () => {
  it('si Auth conserva la clave inicial del trigger, la vigente es la de usuarios.password', () => {
    expect(claveVigente('$2a$12$abcdefghijklmnopqrstuv', true)).toEqual({ fuente: 'hash', hash: '$2a$12$abcdefghijklmnopqrstuv' });
    expect(claveVigente('miClave123', true)).toEqual({ fuente: 'texto', texto: 'miClave123' });
  });
  it('si Auth ya tiene otra clave (entró, se la cambió o un admin la restableció), manda Auth', () => {
    expect(claveVigente('$2a$12$abcdefghijklmnopqrstuv', false)).toEqual({ fuente: 'auth' });
    expect(claveVigente('miClave123', false)).toEqual({ fuente: 'auth' });
  });
  it('clave inicial en Auth y nada utilizable en usuarios: sin clave (no se hereda la inicial)', () => {
    for (const p of [null, '', 'pbkdf2:sha256:260000$x$y']) expect(claveVigente(p, true)).toEqual({ fuente: 'ninguna' });
  });
});
