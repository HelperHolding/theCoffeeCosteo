import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { agregarLinea, crearInsumo, crearProducto, crearSubreceta } from './fabricas';
import { comoUsuario, crearUsuario, num } from './utilidades';

// Migración 24: rol 'sucursales', Costeo solo para roles de Costeo y RPC de costeo/consumo por sucursal.
let db: PGlite;
let admin: string, compras: string, gdl: string, gdlCosteo: string, sinModulo: string;
let latte: string, leche: string, cafe: string, jarabe: string;

const modulo = (u: string, m: string) =>
  db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, $2, 'lectura')`, [u, m]);
const sucursal = (u: string, c: number) =>
  db.query(`insert into perfil_sucursales (user_id, company_id) values ($1, $2)`, [u, c]);
const rpc = <T>(u: string, f: string, c: number) =>
  comoUsuario(
    db,
    u,
    async () => (await db.query<{ r: T | null }>(`select public.${f}($1) r`, [c])).rows[0].r,
  );

beforeAll(async () => {
  db = await crearDbLocal();
  admin = await crearUsuario(db, 'admin');
  compras = await crearUsuario(db, 'compras');
  gdl = await crearUsuario(db, 'sucursales');
  gdlCosteo = await crearUsuario(db, 'sucursales');
  sinModulo = await crearUsuario(db, 'sucursales');
  for (const u of [admin, compras, gdl, gdlCosteo]) await modulo(u, 'sucursales');
  await modulo(gdlCosteo, 'sucursales_costeo');
  await modulo(sinModulo, 'sucursales_costeo');
  for (const u of [admin, compras, gdl, gdlCosteo, sinModulo]) await sucursal(u, 384);
  await sucursal(admin, 532);

  leche = await crearInsumo(db, {
    nombre: 'LECHE PRUEBA 23',
    costoPaquete: 30,
    presentacion: 1000,
    unidad: 'ml',
  });
  cafe = await crearInsumo(db, { nombre: 'CAFE PRUEBA 23', costoPaquete: 400, presentacion: 1000 });
  jarabe = await crearInsumo(db, { nombre: 'AZUCAR PRUEBA 23', costoPaquete: 20, presentacion: 1000 });
  // Sub-receta: 500 ml de jarabe con 250 g de azúcar → 0.5 g por ml.
  const mix = await crearSubreceta(db, { nombre: 'Jarabe prueba 23', rendimiento: 500 });
  await agregarLinea(db, mix, { insumoId: jarabe, cantidades: 250 });
  latte = await crearProducto(db, { nombre: 'Latte prueba 23', precios: { Chica: 70, Grande: 80 } });
  await agregarLinea(db, latte, { insumoId: leche, cantidades: { Chica: 200, Grande: 300 } });
  await agregarLinea(db, latte, { insumoId: cafe, cantidades: { Chica: 18, Grande: 18 } });
  await agregarLinea(db, latte, { subrecetaId: mix, cantidades: { Chica: 20, Grande: 30 } });
  const unico = await crearProducto(db, { nombre: 'Galleta prueba 23', precios: { Único: 40 } });
  await agregarLinea(db, unico, { insumoId: jarabe, cantidades: { Único: 10 } });
  await db.query(
    `insert into producto_codigo_pos (codigo, receta_id, nombre_observado, evidencia)
     values ('LAT23', $1, 'Latte', 'prueba'), ('GAL23', $2, 'Galleta', 'prueba')`,
    [latte, unico],
  );
});
afterAll(async () => db.close());

describe('rol sucursales', () => {
  it('el rol nuevo existe y los desconocidos siguen rechazados', async () => {
    await expect(db.query(`update perfiles set rol = 'inventado' where user_id = $1`, [gdl])).rejects.toThrow(
      /perfiles_rol_check/,
    );
    await expect(modulo(gdl, 'rappi')).rejects.toThrow(/perfil_modulos_modulo_check/);
  });

  it('sin rol de Costeo no se lee ninguna tabla de Costeo; con rol de Costeo, como antes', async () => {
    const tablas = [
      'parametros',
      'canales',
      'tamanos',
      'proveedores',
      'categorias_insumo',
      'categorias_producto',
      'insumos',
      'recetas',
      'producto_tamanos',
      'receta_lineas',
      'linea_cantidades',
      'bitacora',
      'precio_canal_manual',
      'producto_codigo_pos',
      'v_costo_producto',
      'v_costo_subreceta',
      'v_resumen',
    ];
    for (const t of tablas) {
      const n = (u: string) =>
        comoUsuario(db, u, async () =>
          num((await db.query<{ n: number }>(`select count(*)::int n from ${t}`)).rows[0].n),
        );
      expect(await n(gdlCosteo), t).toBe(0);
      if (!['precio_canal_manual', 'bitacora'].includes(t)) expect(await n(compras), t).toBeGreaterThan(0);
    }
  });

  it('perfiles: el de sucursales ve solo el suyo; los de Costeo ven todos', async () => {
    const ver = (u: string) =>
      comoUsuario(db, u, async () => (await db.query('select user_id from perfiles')).rows.length);
    expect(await ver(gdl)).toBe(1);
    expect(await ver(compras)).toBeGreaterThanOrEqual(5);
  });
});

describe('sucursales_datos_costeo', () => {
  it('rol de Costeo o módulo sucursales_costeo, siempre con la sucursal asignada', async () => {
    expect(await rpc(compras, 'sucursales_datos_costeo', 384)).not.toBeNull();
    expect(await rpc(gdlCosteo, 'sucursales_datos_costeo', 384)).not.toBeNull();
    expect(await rpc(gdl, 'sucursales_datos_costeo', 384)).toBeNull(); // sin permiso de Costeo
    expect(await rpc(gdlCosteo, 'sucursales_datos_costeo', 612)).toBeNull(); // sin la sucursal
    expect(await rpc(sinModulo, 'sucursales_datos_costeo', 384)).toBeNull(); // sin módulo Sucursales
    expect(await rpc(compras, 'sucursales_datos_costeo', 532)).toBeNull(); // ni con rol de Costeo sin fila
  });

  it('migración 25: líneas directas de insumo por receta y tamaño, con costo unitario y activo', async () => {
    const d = (await rpc<{
      lineas: {
        receta_id: string;
        tamano: string;
        insumo_id: string;
        insumo: string;
        cantidad: number;
        costo_unitario: number;
        activo: boolean;
      }[];
    }>(gdlCosteo, 'sucursales_datos_costeo', 384))!;
    const delLatte = d.lineas.filter((l) => l.receta_id === latte && l.tamano === 'Chica');
    // Solo insumos directos: la sub-receta (jarabe) no aparece como línea.
    expect(delLatte.map((l) => [l.insumo, num(l.cantidad)]).sort()).toEqual([
      ['CAFE PRUEBA 23', 18],
      ['LECHE PRUEBA 23', 200],
    ]);
    const lecheLinea = delLatte.find((l) => l.insumo_id === leche)!;
    expect(num(lecheLinea.costo_unitario)).toBeCloseTo(0.03, 6);
    expect(lecheLinea.activo).toBe(true);
    // Mismo permiso: sin Costeo de la sucursal no hay líneas.
    expect(await rpc(gdl, 'sucursales_datos_costeo', 384)).toBeNull();
  });

  it('migración 26: costo de la lista cerrada de sustitutos, y nada más de la lista de compras', async () => {
    await crearInsumo(db, {
      nombre: 'LECHE DESLACTOSADAS',
      costoPaquete: 44,
      presentacion: 2000,
      unidad: 'ml',
    });
    await crearInsumo(db, {
      nombre: 'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG',
      costoPaquete: 640,
      presentacion: 1500,
    });
    await crearInsumo(db, { nombre: 'INSUMO FUERA DE LA LISTA 26', costoPaquete: 99, presentacion: 1 });
    const d = (await rpc<{
      sustitutos: { insumo: string; unidad: string; costo_unitario: number; activo: boolean }[];
    }>(gdlCosteo, 'sucursales_datos_costeo', 384))!;
    expect(d.sustitutos.map((s) => s.insumo)).toEqual([
      'CAFÉ TOSTADO EN GRANO KRAFT 1.5 KG',
      'LECHE DESLACTOSADAS',
    ]);
    const leche = d.sustitutos.find((s) => s.insumo === 'LECHE DESLACTOSADAS')!;
    expect(num(leche.costo_unitario)).toBeCloseTo(0.022, 6);
    expect(leche).toMatchObject({ unidad: 'ml', activo: true });
    // Mismo permiso que antes: sin Costeo de la sucursal, nada.
    expect(await rpc(gdl, 'sucursales_datos_costeo', 384)).toBeNull();
    expect(await rpc(gdlCosteo, 'sucursales_datos_costeo', 612)).toBeNull();
  });

  it('devuelve enlaces, costos por tamaño, recetas Únicas e IVA', async () => {
    const d = (await rpc<{
      iva: number;
      enlaces: { codigo: string; receta_id: string }[];
      costos: { receta_id: string; tamano: string; costo: number }[];
      unicas: string[];
    }>(gdlCosteo, 'sucursales_datos_costeo', 384))!;
    expect(num(d.iva)).toBeGreaterThan(0);
    expect(d.enlaces.map((e) => e.codigo)).toEqual(expect.arrayContaining(['GAL23', 'LAT23']));
    const chica = d.costos.find((c) => c.receta_id === latte && c.tamano === 'Chica')!;
    // 200 ml × 0.03 + 18 g × 0.4 + 20 ml × (250 g × 0.02 / 500 ml)
    expect(num(chica.costo)).toBeCloseTo(6 + 7.2 + 0.2, 6);
    expect(d.unicas).toHaveLength(1);
  });

  it('desde OAuth (MCP) no hay acceso', async () => {
    await db.query(`select set_config('request.jwt.claims', '{"client_id":"mcp"}', false)`);
    try {
      expect(await rpc(compras, 'sucursales_datos_costeo', 384)).toBeNull();
      expect(await rpc(compras, 'sucursales_recetas_consumo', 384)).toBeNull();
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });
});

describe('sucursales_catalogo_pos', () => {
  it('nombres del POS para quien ve la sucursal, con o sin rol de Costeo', async () => {
    const d = await rpc<{ codigo: string; nombre_observado: string }[]>(gdl, 'sucursales_catalogo_pos', 384);
    expect(d).toEqual(expect.arrayContaining([{ codigo: 'LAT23', nombre_observado: 'Latte' }]));
    expect(await rpc(gdl, 'sucursales_catalogo_pos', 612)).toBeNull();
  });
});

describe('sucursales_recetas_consumo', () => {
  it('cualquiera con la sucursal; sin la sucursal o sin módulo, null', async () => {
    expect(await rpc(gdl, 'sucursales_recetas_consumo', 384)).not.toBeNull();
    expect(await rpc(gdl, 'sucursales_recetas_consumo', 612)).toBeNull();
    expect(await rpc(sinModulo, 'sucursales_recetas_consumo', 384)).toBeNull();
  });

  it('solo cantidades, con sub-recetas expandidas', async () => {
    const d = (await rpc<{
      insumos: { receta_id: string; tamano: string; insumo_id: string; cantidad: number; unidad: string }[];
    }>(gdl, 'sucursales_recetas_consumo', 384))!;
    expect(JSON.stringify(d)).not.toMatch(/costo/);
    const de = (tamano: string, insumo: string) =>
      num(
        d.insumos.find((x) => x.receta_id === latte && x.tamano === tamano && x.insumo_id === insumo)
          ?.cantidad,
      );
    expect(de('Chica', leche)).toBe(200);
    expect(de('Grande', leche)).toBe(300);
    expect(de('Chica', jarabe)).toBeCloseTo(10, 6); // 20 ml × 250 g / 500 ml
    expect(de('Grande', jarabe)).toBeCloseTo(15, 6);
  });
});
