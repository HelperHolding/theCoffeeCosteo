import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';

// Migración 41: semillas del BI generadas desde las reglas de Zoho.
let db: PGlite;
beforeAll(async () => {
  db = await crearDbLocal();
});
afterAll(async () => db.close());

describe('semillas del BI (migración 41)', () => {
  it('Ventura (384) es la tienda 301 y propia', async () => {
    const r = await db.query<{ store_id: number; tipo: string }>(
      'select store_id, tipo from bi_tiendas where company_id = 384',
    );
    expect(r.rows).toEqual([{ store_id: 301, tipo: 'Sucursales Propias' }]);
  });

  it('SALFRAAPP tiene dos versiones', async () => {
    const r = await db.query<{ categoria_master: string; d: string }>(
      `select categoria_master, vigente_desde::text d from bi_clasificacion_producto where codigo = 'SALFRAAPP' order by vigente_desde`,
    );
    expect(r.rows).toEqual([
      { categoria_master: 'Bebida Fría', d: '2024-01-01' },
      { categoria_master: 'Fraps', d: '2026-09-01' },
    ]);
  });

  it('5IL es Bebida Fría', async () => {
    const r = await db.query<{ categoria_master: string }>(
      `select categoria_master from bi_clasificacion_producto where codigo = '5IL'`,
    );
    expect(r.rows).toEqual([{ categoria_master: 'Bebida Fría' }]);
  });

  it('VIRTUAL_WALLET/WALLET con smartphone es APP - CARD', async () => {
    const r = await db.query<{ etiqueta: string }>(
      `select etiqueta from bi_mapeo_pago where metodo_pos = 'VIRTUAL_WALLET' and tipo_pos = 'WALLET' and smartphone`,
    );
    expect(r.rows).toEqual([{ etiqueta: 'APP - CARD' }]);
  });
});
