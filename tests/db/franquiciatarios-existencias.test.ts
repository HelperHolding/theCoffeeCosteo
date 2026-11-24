import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, darModulo } from './utilidades';

// Migración 96: entradas a existencias (pedidos recibidos y otros proveedores), solo inserción.
let db: PGlite;
let gerente: string;
let tienda: string;
let gerenteOtra: string;
let ana: number;
let leche: number;
let cafe: number;
let ajeno: number;
const E = 514;
const OTRA = 532;
const P1 = '04598135-cfcd-428c-96f8-4f9e8627bab4';
const P2 = '1f48253a-28bf-4f73-9ef3-9b52cf3d89a7';
type F = Record<string, any>;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows[0]);
const filas = async (u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<F>(sql, p)).rows);
const falla = async (u: string, sql: string, p: unknown[] = []) => {
  try {
    await como(u, () => db.query(sql, p));
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`No falló: ${sql}`);
};
const entrada = (
  u: string,
  a: {
    company?: number;
    insumo?: number | null;
    cantidad?: number | null;
    proveedor?: string | null;
    barista?: number | null;
    corrige?: number | null;
    anular?: boolean;
    motivo?: string | null;
  },
) =>
  uno(u, 'select public.franq_registrar_entrada($1,$2,$3,$4,null,$5,$6,$7,$8,$9) id', [
    a.company ?? E,
    a.insumo ?? null,
    a.cantidad ?? null,
    a.proveedor ?? null,
    a.barista ?? null,
    'tablet prueba',
    a.corrige ?? null,
    a.anular ?? false,
    a.motivo ?? null,
  ]);
const recibir = (u: string, pedido: string, entradas: unknown[]) =>
  uno(u, 'select public.franq_recibir($1,$2,$3,$4::jsonb,null,null,$5,$6::jsonb) id', [
    E,
    pedido,
    '#CMS1',
    '[]',
    'tablet prueba',
    JSON.stringify(entradas),
  ]);

beforeAll(async () => {
  db = await crearDbLocal();
  gerente = await crearUsuario(db, 'franquiciado');
  tienda = await crearUsuario(db, 'tienda');
  gerenteOtra = await crearUsuario(db, 'franquiciado');
  for (const u of [gerente, tienda, gerenteOtra]) await darModulo(db, u, 'franquiciatarios', 'lectura');
  await db.query(
    `insert into franq_miembros (user_id, company_id, rol) values ($1,$4,'gerente'),($2,$4,'barista'),($3,$5,'gerente')`,
    [gerente, tienda, gerenteOtra, E, OTRA],
  );
  ana = Number((await uno(gerente, `select public.franq_barista_guardar($1,null,'Ana',true) id`, [E])).id);
  const ins = async (company: number, nombre: string) =>
    Number(
      (
        await db.query<F>(
          `insert into franq_insumos (company_id, nombre, unidad, orden, activo, origen, creado_por)
           values ($1,$2,'paquete de 1000 ml',1,true,'manual',$3) returning id`,
          [company, nombre, gerente],
        )
      ).rows[0].id,
    );
  leche = await ins(E, 'Leche entera');
  cafe = await ins(E, 'Café en grano');
  ajeno = await ins(OTRA, 'Leche de otra sucursal');
});
afterAll(async () => db.close());

describe('migración 96 · entradas a existencias', () => {
  it('la cuenta de baristas registra lo que llega de otro proveedor con su nombre declarado', async () => {
    const r = await entrada(tienda, { insumo: leche, cantidad: 12, proveedor: 'Lala', barista: ana });
    const f = await uno(tienda, 'select * from franq_entradas where id = $1', [r.id]);
    expect(f).toMatchObject({ origen: 'proveedor', proveedor: 'Lala', nombre: 'Ana', anulada: false });
    expect(Number(f.cantidad)).toBe(12);
  });

  it('pide proveedor, cantidad positiva e insumo de la lista de ESA sucursal', async () => {
    expect(
      await falla(
        gerente,
        'select public.franq_registrar_entrada(514,$1,5,null,null,null,null,null,false,null)',
        [leche],
      ),
    ).toMatch(/proveedor/);
    expect(
      await falla(
        gerente,
        'select public.franq_registrar_entrada(514,$1,0,$2,null,null,null,null,false,null)',
        [leche, 'Lala'],
      ),
    ).toMatch(/más de 0/);
    expect(
      await falla(
        gerente,
        'select public.franq_registrar_entrada(514,$1,5,$2,null,null,null,null,false,null)',
        [ajeno, 'Lala'],
      ),
    ).toMatch(/no está en la lista/);
  });

  it('otra sucursal no registra ni lee entradas ajenas', async () => {
    expect(
      await falla(
        gerenteOtra,
        'select public.franq_registrar_entrada(514,$1,5,$2,null,null,null,null,false,null)',
        [leche, 'Lala'],
      ),
    ).toBeTruthy();
    expect(await filas(gerenteOtra, 'select id from franq_entradas where company_id = 514')).toHaveLength(0);
  });

  it('nadie edita ni borra: anular deja un renglón nuevo ligado al original', async () => {
    const r = await entrada(tienda, { insumo: cafe, cantidad: 3, proveedor: 'Tostador', barista: ana });
    expect(await falla(gerente, 'update franq_entradas set cantidad = 1 where id = $1', [r.id])).toBeTruthy();
    expect(await falla(gerente, 'delete from franq_entradas where id = $1', [r.id])).toBeTruthy();
    const a = await entrada(tienda, { corrige: r.id, anular: true, barista: ana });
    const f = await uno(tienda, 'select anulada, corrige_id, cantidad from franq_entradas where id = $1', [
      a.id,
    ]);
    expect(f).toMatchObject({ anulada: true, corrige_id: Number(r.id) });
    expect(
      await falla(
        tienda,
        'select public.franq_registrar_entrada(514,null,null,null,null,$1,null,$2,true,null)',
        [ana, r.id],
      ),
    ).toMatch(/ya no está vigente/);
  });

  it('la recepción de un pedido guarda sus entradas en la misma transacción', async () => {
    const r = await recibir(gerente, P1, [
      { insumo: leche, cantidad: 6, sku: 'INS-LEC-001' },
      { insumo: cafe, cantidad: 7, sku: 'INS-CAF-003' },
    ]);
    const es = await filas(
      gerente,
      'select origen, recepcion_id, sku, cantidad from franq_entradas where recepcion_id = $1 order by sku',
      [r.id],
    );
    expect(es.map((e) => [e.origen, e.sku, Number(e.cantidad)])).toEqual([
      ['pedido', 'INS-CAF-003', 7],
      ['pedido', 'INS-LEC-001', 6],
    ]);
  });

  it('una entrada inválida en el pedido no deja la recepción a medias', async () => {
    expect(
      await falla(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,null,null,$3::jsonb)', [
        P2,
        '[]',
        JSON.stringify([{ insumo: ajeno, cantidad: 1 }]),
      ]),
    ).toMatch(/insumo de la lista/);
    expect(await filas(gerente, 'select id from franq_recepciones where pedido_id = $1', [P2])).toHaveLength(
      0,
    );
  });

  it('la recepción de 7 argumentos (sin entradas) sigue funcionando', async () => {
    const r = await uno(gerente, 'select public.franq_recibir(514,$1,null,$2::jsonb,null,null,null) id', [
      P2,
      '[]',
    ]);
    expect(Number(r.id)).toBeGreaterThan(0);
  });

  it('una entrada de pedido solo la anula la gerencia, con motivo', async () => {
    const e = await uno(gerente, `select id from franq_entradas where origen = 'pedido' order by id limit 1`);
    expect(
      await falla(
        tienda,
        'select public.franq_registrar_entrada(514,null,null,null,null,$1,null,$2,true,null)',
        [ana, e.id],
      ),
    ).toMatch(/Solo la gerencia/);
    expect(
      await falla(
        gerente,
        'select public.franq_registrar_entrada(514,null,null,null,null,null,null,$1,true,null)',
        [e.id],
      ),
    ).toMatch(/motivo/);
    const a = await entrada(gerente, {
      corrige: Number(e.id),
      anular: true,
      motivo: 'Llegó caducada, se devolvió',
    });
    expect(Number(a.id)).toBeGreaterThan(0);
  });
});
