import type { PGlite } from '@electric-sql/pglite';
import { beforeEach, describe, expect, it } from 'vitest';
import { crearDbLocal } from '../../scripts/db/pglite';
import {
  copiarTabla,
  forzarSimulacion,
  reporteCopia,
  TABLAS_COM,
} from '../../scripts/migracion-legado/comercializadora-lib';

const t = (nombre: string) => TABLAS_COM.find((x) => x.tabla === nombre)!;
const enMigracion = async <T>(db: PGlite, fn: () => Promise<T>) => {
  await db.exec(`begin; set local app.origen = 'migracion';`);
  try {
    const r = await fn();
    await db.exec('commit');
    return r;
  } catch (e) {
    await db.exec('rollback');
    throw e;
  }
};

describe('copia de Comercializadora', () => {
  let db: PGlite;
  beforeEach(async () => {
    db = await crearDbLocal();
  });

  it('cubre las 17 tablas y excluye créditos y proveedores sin uso', () => {
    expect(TABLAS_COM).toHaveLength(17);
    expect(TABLAS_COM.map((x) => x.tabla)).not.toContain('com_credito_abonos');
    expect(TABLAS_COM.map((x) => x.tabla)).not.toContain('com_proveedores');
  });

  it('inserta, y en una segunda corrida actualiza sin duplicar', async () => {
    const filas = [{ sku: 'A', dias: 3 }, { sku: 'B', dias: 4 }];
    expect(await enMigracion(db, () => copiarTabla(db, t('com_lead_times'), filas))).toEqual({ nuevas: 2, actualizadas: 0 });
    const r = await enMigracion(db, () => copiarTabla(db, t('com_lead_times'), [{ sku: 'A', dias: 9 }, { sku: 'B', dias: 4 }]));
    expect(r).toEqual({ nuevas: 0, actualizadas: 2 });
    expect((await db.query(`select sku, dias from com_lead_times order by sku`)).rows).toEqual([
      { sku: 'A', dias: 9 }, { sku: 'B', dias: 4 },
    ]);
  });

  it('conserva ids, arreglos y jsonb, y adelanta la secuencia', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_proveedor_cierre'), [{
      id: 41, vendor_id: 'v1', vendor_name: 'Prov', ini: '2026-12-20', fin: '2027-01-05', motivo: 'vacaciones',
      skus: ['A', 'B'], cancelado: false, creado_at: '2026-11-01T10:00:00Z', actualizado_at: '2026-11-01T10:00:00Z',
    }]));
    await enMigracion(db, () => copiarTabla(db, t('com_oc_auto'), [{
      id: 7, corrida_id: '00000000-0000-0000-0000-000000000007', creada_at: '2026-11-10T13:05:00Z', fecha: '2026-11-10',
      origen: 'cron', modo: 'real', vendor_id: 'v1', lineas: [{ sku: 'A', cantidad: 5 }], monto: 100, estado: 'creada',
    }]));
    const c = await db.query<{ skus: string[] }>(`select skus from com_proveedor_cierre where id = 41`);
    expect(c.rows[0].skus).toEqual(['A', 'B']);
    const o = await db.query<{ lineas: unknown }>(`select lineas from com_oc_auto where id = 7`);
    expect(o.rows[0].lineas).toEqual([{ sku: 'A', cantidad: 5 }]);
    const n = await db.query<{ id: number }>(
      `insert into com_proveedor_cierre (vendor_id, vendor_name, ini, fin, motivo) values ('v2','P','2027-01-01','2027-01-02','otro') returning id`);
    expect(Number(n.rows[0].id)).toBe(42);
  });

  it('ignora columnas que el portal no tiene y no escribe bitácora', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_catalogo'), [{ sku: 'A', nombre: 'Café', columna_vieja: 'x' }]));
    expect((await db.query(`select nombre from com_catalogo`)).rows).toEqual([{ nombre: 'Café' }]);
    expect((await db.query(`select * from bitacora where tabla like 'com\\_%'`)).rows).toHaveLength(0);
  });

  it('conserva fecha y autor del historial del plan', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_plan_config_historial'), [{
      id: 3, clave: 'seg.dias', username: 'ana', modificado_por: 'Ana', created_at: '2026-10-01T12:00:00Z',
    }]));
    const h = await db.query<{ u: string; f: string }>(`select username u, created_at::date::text f from com_plan_config_historial`);
    expect(h.rows).toEqual([{ u: 'ana', f: '2026-10-01' }]);
  });

  it('forzarSimulacion deja auto.modo en simulacion y conserva lo demás', async () => {
    await enMigracion(db, () => copiarTabla(db, t('com_plan_config'), [{
      id: 1, config: { auto: { modo: 'real', cobertura_dias: 15 }, seg: { dias: 10 } }, version: 4,
    }]));
    expect(await enMigracion(db, () => forzarSimulacion(db))).toBe(true);
    expect(await enMigracion(db, () => forzarSimulacion(db))).toBe(false);
    const c = await db.query<{ config: unknown }>(`select config from com_plan_config`);
    expect(c.rows[0].config).toEqual({ auto: { modo: 'simulacion', cobertura_dias: 15 }, seg: { dias: 10 } });
  });

  it('el reporte trae conteos por tabla, sin datos', () => {
    const txt = reporteCopia([{ tabla: 'com_lead_times', origen: 2, nuevas: 1, actualizadas: 1, destino: 2 }]);
    expect(txt).toContain('com_lead_times');
    expect(txt).toMatch(/origen 2 · nuevas 1 · actualizadas 1 · destino 2/);
  });
});
