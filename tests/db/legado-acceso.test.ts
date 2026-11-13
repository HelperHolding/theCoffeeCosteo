import { describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { crearInsumo } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

describe('roles sin Costeo del sitio viejo (migración 44)', () => {
  it.each(['interno', 'franquiciado', 'proveedor'] as const)(
    '%s no lee Costeo y solo ve su propio perfil',
    async (rol) => {
      const db = await crearDbLocal();
      await crearInsumo(db, { nombre: 'LECHE', costoPaquete: 30, presentacion: 1000, unidad: 'ml' });
      await crearUsuario(db, 'admin');
      const id = await crearUsuario(db, rol);
      const r = await comoUsuario(db, id, async () => ({
        insumos: num((await db.query<{ n: number }>('select count(*) as n from insumos')).rows[0].n),
        costos: num((await db.query<{ n: number }>('select count(*) as n from v_costo_producto')).rows[0].n),
        perfiles: (await db.query<{ user_id: string }>('select user_id from perfiles')).rows.map((f) => f.user_id),
      }));
      expect(r).toEqual({ insumos: 0, costos: 0, perfiles: [id] });
    },
  );

  it('rechaza roles desconocidos', async () => {
    const db = await crearDbLocal();
    await expect(crearUsuario(db, 'otro' as never)).rejects.toThrow(/perfiles_rol_check/);
  });

  it('migracion_legado no es accesible para usuarios del portal, ni siquiera admin', async () => {
    const db = await crearDbLocal();
    const id = await crearUsuario(db, 'admin');
    await expect(
      comoUsuario(db, id, () => db.query('select * from migracion_legado.usuarios')),
    ).rejects.toThrow(/permission denied/);
  });
});
