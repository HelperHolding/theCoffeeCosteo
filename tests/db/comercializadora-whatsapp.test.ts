import type { PGlite } from '@electric-sql/pglite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 78: envíos de OC por WhatsApp (spec 2026-11-20-oc-whatsapp-proveedor-design.md, §3 y §7).
async function comoServicio<T>(db: PGlite, fn: () => Promise<T>): Promise<T> {
  await db.exec('set role service_role');
  try {
    return await fn();
  } finally {
    await db.exec('reset role');
  }
}
const fila = (db: PGlite, id: string, estado: string) =>
  comoServicio(db, () =>
    db.query(
      `insert into com_oc_whatsapp (zoho_po_id, po_number, vendor_id, vendor_name, estado) values ($1, $2, 'v1', 'Prov', $3)`,
      [id, 'COM-OC-' + id, estado],
    ),
  );

describe('migración 78: envíos de OC por WhatsApp', () => {
  let db: PGlite;
  beforeAll(async () => {
    db = await crearDbLocal();
  });
  afterAll(async () => db.close());

  it('solo acepta los estados de la spec', async () => {
    await fila(db, '1', 'reservado');
    await expect(fila(db, '2', 'otro')).rejects.toThrow();
  });

  it('una OC es una sola fila (la llave es la reserva)', async () => {
    await expect(fila(db, '1', 'reservado')).rejects.toThrow(/duplicate key|unique/);
  });

  it('wa_message_id es único', async () => {
    await comoServicio(db, () =>
      db.query(`update com_oc_whatsapp set wa_message_id = 'w1' where zoho_po_id = '1'`),
    );
    await fila(db, '3', 'enviado');
    await expect(
      comoServicio(db, () =>
        db.query(`update com_oc_whatsapp set wa_message_id = 'w1' where zoho_po_id = '3'`),
      ),
    ).rejects.toThrow();
  });

  it('lectura con Comercializadora; sin módulo no ve nada; nadie autenticado escribe', async () => {
    const lector = await crearUsuario(db, 'interno');
    await darModulo(db, lector, 'comercializadora', 'lectura');
    const otro = await crearUsuario(db, 'admin');
    const n = await comoUsuario(db, lector, () =>
      db.query<{ n: number }>('select count(*)::int n from com_oc_whatsapp'),
    );
    expect(n.rows[0].n).toBeGreaterThan(0);
    const m = await comoUsuario(db, otro, () =>
      db.query<{ n: number }>('select count(*)::int n from com_oc_whatsapp'),
    );
    expect(m.rows[0].n).toBe(0);
    await expect(
      comoUsuario(db, lector, () =>
        db.query(
          `insert into com_oc_whatsapp (zoho_po_id, po_number, estado) values ('9', 'X', 'reservado')`,
        ),
      ),
    ).rejects.toThrow(/permission denied/);
  });

  it('reintentar: con edición borra fallido/sin_numero/omitido; nunca enviado; sin edición falla', async () => {
    await fila(db, '10', 'fallido');
    await fila(db, '11', 'sin_numero');
    await fila(db, '12', 'enviado');
    const editor = await crearUsuario(db, 'interno');
    await darModulo(db, editor, 'comercializadora', 'edicion');
    const lector = await crearUsuario(db, 'interno');
    await darModulo(db, lector, 'comercializadora', 'lectura');
    const r = (u: string, id: string) =>
      comoUsuario(db, u, () =>
        db.query<{ ok: boolean }>('select public.com_oc_whatsapp_reintentar($1) ok', [id]),
      );
    expect((await r(editor, '10')).rows[0].ok).toBe(true);
    expect((await r(editor, '11')).rows[0].ok).toBe(true);
    expect((await r(editor, '12')).rows[0].ok).toBe(false);
    await expect(r(lector, '12')).rejects.toThrow(/permiso/);
    const quedan = await db.query<{ zoho_po_id: string }>(
      `select zoho_po_id from com_oc_whatsapp where zoho_po_id in ('10','11','12') order by 1`,
    );
    expect(quedan.rows.map((x) => x.zoho_po_id)).toEqual(['12']);
  });
});
