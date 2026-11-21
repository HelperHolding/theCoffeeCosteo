import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta } from './fabricas';

// Migración 91: ficha de receta sin costo (toda la sucursal) y nivel de servicio de Rappi (solo gestores).
let db: PGlite;
let gerente: string;
let tienda: string;
let ajeno: string;
let sinModulo: string;
let latte: string;
const E = 514;
const OTRA = 532;
type F = Record<string, any>;

const uno = async (u: string, sql: string, p: unknown[] = []) =>
  comoUsuario(db, u, async () => (await db.query<F>(sql, p)).rows[0]);
const ficha = (u: string, c = E) => uno(u, 'select public.franq_ficha_recetas($1) r', [c]).then((x) => x.r);
const servicio = (u: string, desde = '2026-11-01', hasta = '2026-11-30', c = E) =>
  uno(u, 'select public.franq_nivel_servicio($1,$2,$3) r', [c, desde, hasta]).then((x) => x.r);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  ajeno = await crearUsuario(db, 'franquiciado');
  sinModulo = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, ajeno]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente'),($6,$4,'gerente')`,
    [gerente, tienda, ajeno, E, OTRA, sinModulo],
  );
  // Receta: Iced Latte (Chica/Grande) con café, leche y una sub-receta de jarabe; otro producto sin código POS.
  const cafe = await crearInsumo(db, {
    nombre: 'CAFÉ WHITE',
    costoPaquete: 600,
    presentacion: 1500,
    unidad: 'gr',
  });
  const leche = await crearInsumo(db, {
    nombre: 'LECHE ENTERA',
    costoPaquete: 30,
    presentacion: 1000,
    unidad: 'ml',
  });
  const azucar = await crearInsumo(db, {
    nombre: 'AZÚCAR',
    costoPaquete: 25,
    presentacion: 1000,
    unidad: 'gr',
  });
  const jarabe = await crearSubreceta(db, { nombre: 'JARABE NATURAL', rendimiento: 1000, unidad: 'ml' });
  await agregarLinea(db, jarabe, { insumoId: azucar, cantidades: 500 });
  latte = await crearProducto(db, {
    nombre: 'Iced Latte',
    precios: { Chica: 75, Grande: 89 },
    categoria: 'Fríos',
  });
  await agregarLinea(db, latte, { insumoId: cafe, cantidades: { Chica: 18, Grande: 36 } });
  await agregarLinea(db, latte, { insumoId: leche, cantidades: { Chica: 200, Grande: 300 } });
  await agregarLinea(db, latte, { subrecetaId: jarabe, cantidades: { Chica: 15, Grande: 20 } });
  const sinPos = await crearProducto(db, { nombre: 'Sin código', precios: { Único: 50 } });
  await agregarLinea(db, sinPos, { insumoId: cafe, cantidades: { Único: 10 } });
  await db.query(
    `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia) values ('5IL', $1, 'Iced Latte', 'prueba')`,
    [latte],
  );
  // Rappi: dos tiendas de Essentia (normal y Turbo) y una de otra sucursal.
  await db.query(`delete from rappi_tiendas where company_id in ($1, $2)`, [E, OTRA]).catch(() => undefined);
  await db.query(
    `insert into rappi_tiendas (rappi_tienda_id, company_id, nombre, canal) values
       ('MX9000001', $1, 'Essentia', 'normal'), ('MX9000002', $1, 'Essentia Turbo', 'turbo'),
       ('MX9000003', $2, 'Otra', 'normal')
     on conflict (rappi_tienda_id) do nothing`,
    [E, OTRA],
  );
  await db.query(
    `insert into rappi_servicio_dia (rappi_tienda_id, fecha, pedidos, finalizados, cocina_pedidos, cocina_demorada,
       rech_demora, espera_repartidor) values
       ('MX9000001', '2026-11-17', 20, 18, 18, 3, 1, 6),
       ('MX9000002', '2026-11-17', 10, 6, 6, 0, 0, 10),
       ('MX9000001', '2026-11-18', 12, 12, 12, 1, 0, null),
       ('MX9000003', '2026-11-18', 99, 99, 99, 99, 9, 30)`,
  );
});
afterAll(async () => db.close());

describe('migración 91 · ficha de receta', () => {
  it('la ve toda la sucursal (barista incluido), con tamaños, líneas y sub-recetas', async () => {
    for (const u of [gerente, tienda]) {
      const r = await ficha(u);
      expect(r.productos).toEqual([
        { id: latte, nombre: 'Iced Latte', categoria: 'Fríos', tamanos: ['Chica', 'Grande'] },
      ]);
      const grande = r.lineas.filter((l: F) => l.receta_id === latte && l.tamano === 'Grande');
      expect(grande.map((l: F) => [l.insumo ?? l.subreceta, l.unidad, Number(l.cantidad)])).toEqual([
        // Mismo orden capturado (0): por nombre.
        ['CAFÉ WHITE', 'gr', 36],
        ['JARABE NATURAL', 'ml', 20],
        ['LECHE ENTERA', 'ml', 300],
      ]);
      expect(r.subrecetas).toMatchObject([{ nombre: 'JARABE NATURAL', unidad: 'ml' }]);
      const lote = r.lineas.filter((l: F) => l.tamano === null);
      expect(lote.map((l: F) => [l.insumo, Number(l.cantidad)])).toEqual([['AZÚCAR', 500]]);
    }
  });

  it('nunca trae costos ni precios', async () => {
    const texto = JSON.stringify(await ficha(tienda));
    expect(texto).not.toMatch(/costo|precio|margen|comision|"75"|"89"|\b600\b/i);
  });

  it('sin rol en la sucursal, sin módulo o con OAuth: null', async () => {
    expect(await ficha(ajeno)).toBeNull();
    expect(await ficha(sinModulo)).toBeNull();
    const oauth = await comoUsuario(db, gerente, async () => {
      await db.query(`select set_config('request.jwt.claims', $1, false)`, [
        JSON.stringify({ sub: gerente, client_id: 'mcp' }),
      ]);
      try {
        return (await db.query<F>('select public.franq_ficha_recetas($1) r', [E])).rows[0].r;
      } finally {
        await db.query(`select set_config('request.jwt.claims', '', false)`);
      }
    });
    expect(oauth).toBeNull();
  });

  it('la cuenta de baristas sigue sin leer Costeo directo', async () => {
    const r = await comoUsuario(
      db,
      tienda,
      async () => (await db.query('select costo_paquete from insumos')).rows,
    );
    expect(r).toEqual([]);
  });
});

describe('migración 91 · nivel de servicio de Rappi', () => {
  it('devuelve los renglones por tienda y día de la sucursal (no los de otra)', async () => {
    const r = await servicio(gerente);
    expect(r.tiendas).toBe(2);
    expect(r.actualizado_hasta).toBe('2026-11-18');
    expect(r.dias.map((d: F) => [d.tienda, d.fecha, d.cocina_pedidos, d.cocina_demorada])).toEqual([
      ['MX9000001', '2026-11-17', 18, 3],
      ['MX9000002', '2026-11-17', 6, 0],
      ['MX9000001', '2026-11-18', 12, 1],
    ]);
    expect(JSON.stringify(r)).not.toMatch(/comentario|reclamos/);
  });

  it('solo gestores de la sucursal; periodo de 62 días como máximo', async () => {
    expect(await servicio(tienda)).toBeNull();
    expect(await servicio(ajeno)).toBeNull();
    await expect(servicio(gerente, '2026-08-01', '2026-11-30')).rejects.toThrow(/Periodo inválido/);
  });
});
