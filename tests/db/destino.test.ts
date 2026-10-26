import { describe, expect, it } from 'vitest';
import { validarLocal, validarRemoto } from '../../scripts/conciliacion/destino';

// Validación del destino de los scripts que escriben: parser de URL, sin coincidencias amplias de texto.
const P = 'jpqkmnfjwzniptszjuli';

describe('destino de los scripts de escritura', () => {
  it('acepta solo el pooler con usuario postgres.<proyecto> o el host directo del proyecto', () => {
    expect(
      validarRemoto(`postgresql://postgres.${P}:x@aws-1-us-east-2.pooler.supabase.com:6543/postgres`, P).tipo,
    ).toBe('remoto');
    expect(validarRemoto(`postgres://postgres:x@db.${P}.supabase.co:5432/postgres`, P).tipo).toBe('remoto');
  });

  it('rechaza coincidencias accidentales del identificador del proyecto', () => {
    for (const url of [
      `postgres://postgres:x@${P}.atacante.com:5432/postgres`,
      `postgres://postgres:x@db.${P}.supabase.co.atacante.com:5432/postgres`,
      `postgres://postgres.otro:x@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
      `postgres://postgres.${P}x:x@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
      `postgres://usuario.${P}:x@aws-1-us-east-2.pooler.supabase.com:6543/postgres`,
      `postgres://postgres.${P}:x@aws-1-us-east-2.pooler.supabase.com.evil.io:6543/postgres`,
      `https://postgres.${P}:x@aws-1-us-east-2.pooler.supabase.com/postgres`,
      'no es una url',
    ])
      expect(() => validarRemoto(url, P)).toThrow();
  });

  it('local solo con localhost, 127.0.0.1 o [::1]', () => {
    for (const url of [
      'postgres://postgres@localhost:55432/restaurada',
      'postgres://postgres@127.0.0.1:55432/restaurada',
      'postgres://postgres@[::1]:55432/restaurada',
    ])
      expect(validarLocal(url).tipo).toBe('local');
    for (const url of [
      'postgres://postgres@localhost.evil.io:5432/x',
      `postgres://postgres:x@db.${P}.supabase.co:5432/postgres`,
      'mysql://root@localhost/x',
    ])
      expect(() => validarLocal(url)).toThrow();
  });
});
