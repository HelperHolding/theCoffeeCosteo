import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario, num } from './utilidades';

// Migración 81: Nivel de servicio y Conectividad de Rappi (docs/rappi-portal/08). Escribe n8n (service_role) con
// rappi_importar_servicio; nadie lee las tablas directo.
let db: PGlite;
let usuario: string;
let gdl: string, ajeno: string;

const NORMAL = 'MX1930270777'; // Namóra
const TURBO = 'MX1930301156';

async function importar(p: unknown) {
  await db.exec('set role service_role');
  try {
    return (
      await db.query<{ r: Record<string, unknown> }>('select public.rappi_importar_servicio($1) r', [
        JSON.stringify(p),
      ])
    ).rows[0].r;
  } finally {
    await db.exec('reset role');
  }
}
const filas = async <T = Record<string, unknown>>(sql: string, args: unknown[] = []) =>
  (await db.query<T>(sql, args)).rows;

beforeAll(async () => {
  db = await crearDbLocal();
  usuario = await crearUsuario(db, 'sucursales');
  gdl = await crearUsuario(db, 'sucursales');
  ajeno = await crearUsuario(db, 'sucursales');
  for (const u of [gdl, ajeno])
    await db.query(
      `insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'sucursales', 'lectura')`,
      [u],
    );
  await db.query('insert into perfil_sucursales (user_id, company_id) values ($1, 513), ($2, 384)', [
    gdl,
    ajeno,
  ]);
});
afterAll(async () => db.close());

describe('rappi_importar_servicio', () => {
  it('solo la llave de servicio importa; las tablas no se leen desde el portal', async () => {
    await expect(
      comoUsuario(db, usuario, () => db.query('select public.rappi_importar_servicio($1)', ['{}'])),
    ).rejects.toThrow(/permission denied/);
    for (const t of [
      'rappi_servicio_dia',
      'rappi_reclamos',
      'rappi_conectividad',
      'rappi_disponibilidad_semana',
    ])
      await expect(comoUsuario(db, usuario, () => db.query(`select * from ${t}`))).rejects.toThrow(
        /permission denied/,
      );
  });

  it('indicadores por día: cada fuente llena sus columnas y no borra las de las otras', async () => {
    await importar({
      dias: [
        {
          tienda: NORMAL,
          fecha: '2026-11-18',
          pedidos: 9,
          rech_cbpi: 0,
          rech_cbpr: 0,
          rech_tienda_cerrada: 0,
          rech_sin_stock: 1,
          rech_demora: 0,
          finalizados: 8,
          recl_mal_estado: 1,
          recl_faltante: 0,
          recl_incorrecto: 0,
          disponibilidad: 93.26,
          indisponibilidad: 6.74,
          cocina_pedidos: 8,
          cocina_demorada: 3,
        },
      ],
    });
    // Después llegan los minutos sin disponibilidad y la espera del repartidor por separado.
    const r = await importar({
      dias: [
        {
          tienda: NORMAL,
          fecha: '2026-11-18',
          sin_disp_minutos: 30,
          sin_disp_franjas: { madrugada: 0, manana: 0, mediodia: 1, tarde: 1, noche: 1 },
        },
        { tienda: NORMAL, fecha: '2026-11-18', espera_repartidor: 2.8 },
      ],
    });
    expect(r.dias).toBe(2);
    const [d] = await filas('select * from rappi_servicio_dia where rappi_tienda_id = $1', [NORMAL]);
    expect([d.pedidos, d.rech_sin_stock, d.finalizados, d.recl_mal_estado, d.cocina_demorada]).toEqual([
      9, 1, 8, 1, 3,
    ]);
    expect([num(d.disponibilidad), d.sin_disp_minutos, num(d.espera_repartidor)]).toEqual([93.26, 30, 2.8]);
    expect(d.sin_disp_franjas).toEqual({ madrugada: 0, manana: 0, mediodia: 1, tarde: 1, noche: 1 });
    // Rappi corrige el día: se pisa lo que trae, el resto queda.
    await importar({ dias: [{ tienda: NORMAL, fecha: '2026-11-18', recl_mal_estado: 2 }] });
    const [d2] = await filas('select * from rappi_servicio_dia where rappi_tienda_id = $1', [NORMAL]);
    expect([d2.recl_mal_estado, d2.pedidos, num(d2.espera_repartidor)]).toEqual([2, 9, 2.8]);
  });

  it('conectividad: la foto extiende el tramo o abre otro; una foto vieja no cambia nada', async () => {
    const foto = (momento: string, estado: string, motivo = '', cierre = 'Until 20/11/2026 - 20:30:00') =>
      importar({ momento, conectividad: [{ tienda: NORMAL, estado, motivo, cierre }] });
    await foto('2026-11-20T12:07:00-06:00', 'ACTIVE');
    await foto('2026-11-20T12:17:00-06:00', 'ACTIVE');
    const r = await foto('2026-11-20T12:27:00-06:00', 'INACTIVE', 'Not ready to sell', '-');
    expect(r).toMatchObject({ fotos: 1, cambios_conectividad: 1 });
    await foto('2026-11-20T12:20:00-06:00', 'ACTIVE'); // llegó tarde: se ignora
    await foto('2026-11-20T12:37:00-06:00', 'ACTIVE');
    const t = await filas<{
      estado: string;
      motivo: string | null;
      desde: Date;
      visto: Date;
      hasta: Date | null;
      cierra: Date | null;
    }>(
      'select estado, motivo, desde, visto, hasta, cierra from rappi_conectividad where rappi_tienda_id = $1 order by desde',
      [NORMAL],
    );
    const hora = (x: Date | null) => (x ? new Date(x).toISOString().slice(11, 16) : null);
    expect(t.map((x) => [x.estado, x.motivo, hora(x.desde), hora(x.visto), hora(x.hasta)])).toEqual([
      ['ACTIVE', null, '18:07', '18:17', '18:27'],
      ['INACTIVE', 'Not ready to sell', '18:27', '18:27', '18:37'],
      ['ACTIVE', null, '18:37', '18:37', null],
    ]);
    // «Until 20/11/2026 - 20:30:00» en hora del centro = 02:30 UTC del día siguiente.
    expect(new Date(t[2].cierra!).toISOString()).toBe('2026-11-21T02:30:00.000Z');
    expect(t[1].cierra).toBeNull();
  });

  it('reclamos, calor de 15 días y Top Restaurantes; una tienda sin alta se ignora sin romper el lote', async () => {
    const reclamo = {
      pedido: 2489855527,
      tienda: TURBO,
      fecha: '2026-11-18',
      motivo: 'missing_item',
      subtipo: 'missing_ingredient',
      producto: 'Miel',
      comentario: ' Lo pedí con miel de agave y no le pusieron ',
      monto: 2.13,
    };
    const r = await importar({
      reclamos: [reclamo, { ...reclamo, pedido: 1, tienda: 'MX1' }],
      disponibilidad_semana: [
        { tienda: NORMAL, fecha: '2026-11-20', matriz: { '09:00': { mon: 0.71, sun: 0.8 } } },
      ],
      top: [{ tienda: NORMAL, fecha: '2026-11-20', categoria: '4. Beginner', proxima: '1. Top 5%' }],
    });
    expect(r).toMatchObject({ reclamos: 1, disponibilidad_semana: 1, top: 1, ignoradas: ['MX1'] });
    await importar({ reclamos: [{ ...reclamo, monto: 4.26 }] });
    const [c] = await filas('select * from rappi_reclamos');
    expect([c.rappi_tienda_id, c.comentario, num(c.monto)]).toEqual([
      TURBO,
      'Lo pedí con miel de agave y no le pusieron',
      4.26,
    ]);
    expect((await filas('select matriz from rappi_disponibilidad_semana'))[0].matriz).toEqual({
      '09:00': { mon: 0.71, sun: 0.8 },
    });
    expect((await filas('select categoria, proxima from rappi_top_restaurantes'))[0]).toEqual({
      categoria: '4. Beginner',
      proxima: '1. Top 5%',
    });
  });
});

// Migración 87: lectura para la sección «Nivel de servicio» de la sucursal.
describe('sucursales_nivel_servicio', () => {
  const leer = (u: string, c = 513, desde = '2026-11-18', hasta = '2026-11-20') =>
    comoUsuario(
      db,
      u,
      async () =>
        (
          await db.query<{ r: Record<string, unknown> | null }>(
            'select public.sucursales_nivel_servicio($1, $2, $3) r',
            [c, desde, hasta],
          )
        ).rows[0].r,
    );

  it('quien ve la sucursal lee sus dos tiendas; otra sucursal o anon no', async () => {
    const r = (await leer(gdl))!;
    expect((r.tiendas as { canal: string }[]).map((t) => t.canal)).toEqual(['normal', 'turbo']);
    expect((r.dias as unknown[]).length).toBe(1);
    expect((r.reclamos as { pedido: string }[]).map((x) => x.pedido)).toEqual(['2489855527']);
    expect((r.vigente as { estado: string }[]).map((x) => x.estado)).toEqual(['ACTIVE']);
    expect((r.conectividad as unknown[]).length).toBe(3);
    expect((r.semana as unknown[]).length).toBe(1);
    expect((r.top as { categoria: string }[])[0].categoria).toBe('4. Beginner');
    expect(await leer(ajeno)).toBeNull();
    await expect(leer(gdl, 513, '2026-08-01', '2026-11-20')).rejects.toThrow(/62 días/);
    await db.exec('set role anon');
    await expect(
      db.query("select public.sucursales_nivel_servicio(513, '2026-11-18', '2026-11-20')"),
    ).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });

  it('el periodo filtra días y reclamos; el estado vigente y el calor de 15 días no dependen del periodo', async () => {
    const r = (await leer(gdl, 513, '2026-11-01', '2026-11-02'))!;
    expect([
      (r.dias as unknown[]).length,
      (r.reclamos as unknown[]).length,
      (r.conectividad as unknown[]).length,
    ]).toEqual([0, 0, 0]);
    expect((r.vigente as unknown[]).length).toBe(1);
    expect((r.semana as unknown[]).length).toBe(1);
  });
});

// Migración 89: Nivel de servicio de todas las sucursales del usuario para el Tablero de México.
describe('sucursales_servicio_nacional', () => {
  const leer = (u: string, companias: number[], desde = '2026-11-18', hasta = '2026-11-20') =>
    comoUsuario(
      db,
      u,
      async () =>
        (
          await db.query<{ r: Record<string, unknown> }>(
            'select public.sucursales_servicio_nacional($1, $2, $3) r',
            [companias, desde, hasta],
          )
        ).rows[0].r,
    );

  it('solo las sucursales que el usuario ve, aunque pida otras; sumas por tienda y por día', async () => {
    const r = await leer(gdl, [513, 384]);
    expect((r.tiendas as { company_id: number }[]).every((t) => t.company_id === 513)).toBe(true);
    const tienda = (r.por_tienda as Record<string, unknown>[]).find((x) => x.tienda === NORMAL)!;
    expect([
      num(tienda.pedidos),
      num(tienda.recl_mal_estado),
      num(tienda.espera_peso),
      num(tienda.espera_suma),
    ]).toEqual([9, 2, 8, 22.4]);
    expect((r.por_dia as { fecha: string }[]).map((x) => x.fecha)).toEqual(['2026-11-18']);
    expect((r.reclamos as unknown[]).length).toBe(1);
    expect((r.vigente as unknown[]).length).toBe(1);
    const ajeno_ = await leer(ajeno, [513]);
    expect([(ajeno_.tiendas as unknown[]).length, (ajeno_.por_tienda as unknown[]).length]).toEqual([0, 0]);
    await expect(leer(gdl, [513], '2026-08-01', '2026-11-20')).rejects.toThrow(/62 días/);
    await db.exec('set role anon');
    await expect(
      db.query("select public.sucursales_servicio_nacional('{513}', '2026-11-18', '2026-11-20')"),
    ).rejects.toThrow(/permission denied/);
    await db.exec('reset role');
  });
});
