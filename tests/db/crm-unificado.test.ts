import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PGlite } from '@electric-sql/pglite';
import { crearDbLocal } from '../../scripts/db/pglite';
import { comoUsuario, crearUsuario } from './utilidades';

// CRM Unificado (doc 40 §7): candados, permisos por área, franquiciatario → sucursal, bitácora y avisos.
let db: PGlite;
let luis: string, vendedora: string, andres: string, legalMiembro: string, diego: string, proyectos: string;
let sebastian: string, lector: string, sinCrm: string;

const como = <T>(u: string, fn: () => Promise<T>) => comoUsuario(db, u, fn);
const uno = async <T>(u: string, sql: string, p: unknown[] = []) =>
  como(u, async () => (await db.query<T>(sql, p)).rows[0]);
const req = async (clave: string) =>
  (await db.query<{ id: string }>('select id from crm_requisitos where clave = $1', [clave])).rows[0].id;
const version = async (tabla: 'crm_franquiciatarios' | 'crm_tiendas', id: string) =>
  (await db.query<{ version: number }>(`select version from ${tabla} where id = $1`, [id])).rows[0].version;
const etapaDe = async (tabla: 'crm_franquiciatarios' | 'crm_tiendas', id: string) =>
  (
    await db.query<{ clave: string }>(
      `select e.clave from ${tabla} c join crm_etapas e on e.id = c.etapa_id where c.id = $1`,
      [id],
    )
  ).rows[0].clave;

async function usuario(
  rol: 'admin' | 'compras',
  nivel: string | null,
  area?: string,
  rolArea?: string,
  funciones: string[] = [],
) {
  const id = await crearUsuario(db, rol);
  if (nivel)
    await db.query(`insert into perfil_modulos (user_id, modulo, nivel) values ($1, 'crm', $2)`, [id, nivel]);
  if (area)
    await db.query('insert into crm_membresias (user_id, area, rol, funciones) values ($1, $2, $3, $4)', [
      id,
      area,
      rolArea,
      funciones,
    ]);
  return id;
}
const avanzar = (
  u: string,
  tipo: string,
  card: string,
  destino: string,
  v: number,
  motivo: string | null = null,
) =>
  uno<{ r: { etapa: string; sucursal_id: string | null; version: number } }>(
    u,
    'select crm_avanzar($1, $2, $3, $4, $5) as r',
    [tipo, card, destino, v, motivo],
  ).then((x) => x.r);
const cumplir = (
  u: string,
  tipo: string,
  card: string,
  clave: string,
  o: { fecha?: string; archivo?: string; valor?: string } = {},
) =>
  req(clave).then((r) =>
    uno<{ id: string; estado: string; nota: string | null }>(
      u,
      'select * from crm_cumplir($1, $2, $3, $4, $5::date, $6)',
      [tipo, card, r, o.valor ?? null, o.fecha ?? null, o.archivo ?? null],
    ),
  );
const archivo = (u: string, columna: 'franquiciatario_id' | 'tienda_id', card: string, tipo = 'documento') =>
  uno<{ id: string }>(
    u,
    `insert into crm_archivos (nombre, mime, tamano, ${columna}, tipo_documento) values ('doc.pdf', 'application/pdf', 1024, $1, $2) returning id`,
    [card, tipo],
  ).then((x) => x.id);

async function franquiciatarioListo(u = vendedora) {
  const f = await uno<{ id: string }>(
    u,
    `insert into crm_franquiciatarios (nombre, correo, ciudad_interes, origen, territorio, responsable_id)
     values ('Prueba Franquiciatario', 'f@prueba.mx', 'Querétaro', 'Sitio web', 'disponible', $1) returning id`,
    [u],
  );
  return f.id;
}
/** Lleva un franquiciatario de la etapa 1 a Formalizado con todos sus requisitos (omite la etapa 3). */
async function formalizar(f: string) {
  await avanzar(vendedora, 'franquiciatario', f, 'contacto', await version('crm_franquiciatarios', f));
  await cumplir(vendedora, 'franquiciatario', f, 'primera_reunion', { fecha: '2026-10-01' });
  await cumplir(vendedora, 'franquiciatario', f, 'info_comercial', { fecha: '2026-10-02' });
  await avanzar(
    vendedora,
    'franquiciatario',
    f,
    'pld',
    await version('crm_franquiciatarios', f),
    'Liquida sin revisar contrato',
  );
  await cumplir(vendedora, 'franquiciatario', f, 'confirmacion_interes', { fecha: '2026-10-03' });
  await cumplir(vendedora, 'franquiciatario', f, 'survey', {
    archivo: await archivo(vendedora, 'franquiciatario_id', f),
  });
  await cumplir(vendedora, 'franquiciatario', f, 'pld_digital', {
    archivo: await archivo(vendedora, 'franquiciatario_id', f),
  });
  await cumplir(vendedora, 'franquiciatario', f, 'instrucciones_pago', { fecha: '2026-10-04' });
  await cumplir(vendedora, 'franquiciatario', f, 'liquidacion_comprobante', {
    archivo: await archivo(vendedora, 'franquiciatario_id', f),
  });
  await cumplir(vendedora, 'franquiciatario', f, 'pago_validado', {
    archivo: await archivo(vendedora, 'franquiciatario_id', f),
  });
  await avanzar(vendedora, 'franquiciatario', f, 'bienvenida', await version('crm_franquiciatarios', f));
  await cumplir(vendedora, 'franquiciatario', f, 'bienvenida', { fecha: '2026-10-05' });
  await cumplir(andres, 'franquiciatario', f, 'carta_intencion', {
    archivo: await archivo(andres, 'franquiciatario_id', f),
    fecha: '2026-10-05',
  });
  await cumplir(vendedora, 'franquiciatario', f, 'factura_csf', {
    archivo: await archivo(vendedora, 'franquiciatario_id', f),
  });
  await cumplir(vendedora, 'franquiciatario', f, 'pld_original', { fecha: '2026-10-08' });
  return avanzar(vendedora, 'franquiciatario', f, 'formalizado', await version('crm_franquiciatarios', f));
}

beforeAll(async () => {
  db = await crearDbLocal();
  luis = await usuario('compras', 'edicion', 'ventas', 'head');
  vendedora = await usuario('compras', 'edicion', 'ventas', 'miembro');
  andres = await usuario('compras', 'edicion', 'legal', 'head');
  legalMiembro = await usuario('compras', 'edicion', 'legal', 'miembro');
  diego = await usuario('compras', 'edicion', 'proyectos', 'head');
  proyectos = await usuario('compras', 'edicion', 'proyectos', 'miembro');
  sebastian = await usuario('admin', 'desarrollador', 'ventas', 'miembro', ['aprobacion_locales']);
  lector = await usuario('compras', 'lectura', 'ventas', 'lectura');
  sinCrm = await usuario('admin', null);
});
afterAll(async () => db.close());

describe('etapas y requisitos sembrados', () => {
  it('el embudo general tiene las 10 etapas del documento, 6 provisionales y la 3 opcional', async () => {
    const r = await db.query<{
      clave: string;
      numero: number | null;
      provisional: boolean;
      opcional: boolean;
    }>(`select clave, numero, provisional, opcional from crm_etapas where embudo = 'general' order by orden`);
    expect(r.rows.filter((e) => e.numero).map((e) => e.numero)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(r.rows.filter((e) => e.provisional)).toHaveLength(6);
    expect(r.rows.find((e) => e.clave === 'revision_contrato')?.opcional).toBe(true);
    const n = await db.query<{ n: number }>('select count(*)::int n from crm_requisitos');
    expect(n.rows[0].n).toBe(37);
  });
});

describe('candados (§5.4)', () => {
  it('un franquiciatario nuevo empieza en la etapa 1 aunque pida otra', async () => {
    const otra = (await db.query<{ id: string }>(`select crm_etapa('pld') id`)).rows[0].id;
    const f = await uno<{ id: string }>(
      vendedora,
      `insert into crm_franquiciatarios (nombre, etapa_id) values ('Atajo', $1) returning id`,
      [otra],
    );
    expect(await etapaDe('crm_franquiciatarios', f.id)).toBe('recepcion');
  });

  it('cambiar la etapa directo por la API se rechaza; solo crm_avanzar', async () => {
    const f = await franquiciatarioListo();
    const pld = (await db.query<{ id: string }>(`select crm_etapa('pld') id`)).rows[0].id;
    await expect(
      como(vendedora, () =>
        db.query('update crm_franquiciatarios set etapa_id = $1 where id = $2', [pld, f]),
      ),
    ).rejects.toThrow('Avanzar');
  });

  it('sin requisitos no avanza; con los datos de la card, sí', async () => {
    const f = await uno<{ id: string }>(
      vendedora,
      `insert into crm_franquiciatarios (nombre) values ('Incompleto') returning id`,
    );
    await expect(avanzar(vendedora, 'franquiciatario', f.id, 'contacto', 1)).rejects.toThrow(
      'Bloqueada: faltan 5',
    );
    await como(vendedora, () =>
      db.query(
        `update crm_franquiciatarios set telefono = '55', ciudad_interes = 'León', origen = 'Evento', territorio = 'disponible', responsable_id = $2 where id = $1`,
        [f.id, vendedora],
      ),
    );
    const r = await avanzar(
      vendedora,
      'franquiciatario',
      f.id,
      'contacto',
      await version('crm_franquiciatarios', f.id),
    );
    expect(r.etapa).toBe('contacto');
  });

  it('territorio bloqueado no avanza aunque tenga todos los datos', async () => {
    const f = await franquiciatarioListo();
    await como(vendedora, () =>
      db.query(`update crm_franquiciatarios set territorio = 'bloqueada' where id = $1`, [f]),
    );
    await expect(
      avanzar(vendedora, 'franquiciatario', f, 'contacto', await version('crm_franquiciatarios', f)),
    ).rejects.toThrow('Bloqueada');
  });

  it('solo avanza a la siguiente etapa; la 3 se omite con motivo y queda «no aplica»', async () => {
    const f = await franquiciatarioListo();
    await expect(avanzar(vendedora, 'franquiciatario', f, 'pld', 1)).rejects.toThrow('siguiente etapa');
    await avanzar(vendedora, 'franquiciatario', f, 'contacto', 1);
    await cumplir(vendedora, 'franquiciatario', f, 'primera_reunion', { fecha: '2026-10-01' });
    await cumplir(vendedora, 'franquiciatario', f, 'info_comercial', { fecha: '2026-10-02' });
    const v = await version('crm_franquiciatarios', f);
    await expect(avanzar(vendedora, 'franquiciatario', f, 'pld', v)).rejects.toThrow('no aplica');
    const r = await avanzar(vendedora, 'franquiciatario', f, 'pld', v, 'No pidió revisar el contrato');
    expect(r.etapa).toBe('pld');
    const na = await db.query<{ n: number }>(
      `select count(*)::int n from crm_cumplimientos where card_id = $1 and estado = 'no_aplica'`,
      [f],
    );
    expect(na.rows[0].n).toBe(4);
  });

  it('un área ajena no mueve la etapa ni cumple sus requisitos', async () => {
    const f = await franquiciatarioListo();
    await expect(avanzar(legalMiembro, 'franquiciatario', f, 'contacto', 1)).rejects.toThrow(
      'la mueve Ventas',
    );
    await avanzar(vendedora, 'franquiciatario', f, 'contacto', 1);
    await expect(
      cumplir(legalMiembro, 'franquiciatario', f, 'primera_reunion', { fecha: '2026-10-01' }),
    ).rejects.toThrow('lo registra Ventas');
  });

  it('las dependencias y la evidencia se exigen (Legal no envía el contrato sin apartado validado)', async () => {
    const f = await franquiciatarioListo();
    await avanzar(vendedora, 'franquiciatario', f, 'contacto', 1);
    await cumplir(vendedora, 'franquiciatario', f, 'primera_reunion', { fecha: '2026-10-01' });
    await cumplir(vendedora, 'franquiciatario', f, 'info_comercial', { fecha: '2026-10-02' });
    await avanzar(
      vendedora,
      'franquiciatario',
      f,
      'revision_contrato',
      await version('crm_franquiciatarios', f),
    );
    await expect(
      cumplir(andres, 'franquiciatario', f, 'contrato_enviado', { fecha: '2026-10-03' }),
    ).rejects.toThrow('Primero');
    await expect(cumplir(vendedora, 'franquiciatario', f, 'apartado_comprobante')).rejects.toThrow(
      'Adjunta el documento',
    );
    await cumplir(vendedora, 'franquiciatario', f, 'apartado_comprobante', {
      archivo: await archivo(vendedora, 'franquiciatario_id', f),
    });
    // P1: Finanzas inactiva; Ventas registra su validación con evidencia y queda la nota.
    const v = await cumplir(vendedora, 'franquiciatario', f, 'apartado_validado', {
      archivo: await archivo(vendedora, 'franquiciatario_id', f),
    });
    expect(v.estado).toBe('validado');
    expect(v.nota).toMatch(/^Validado por Finanzas \(registrado por /);
  });

  it('un head libera el candado con motivo; un miembro no; la liberación se consume al avanzar', async () => {
    const f = await franquiciatarioListo();
    await avanzar(vendedora, 'franquiciatario', f, 'contacto', 1);
    await expect(
      uno(
        vendedora,
        `select crm_liberar_candado('franquiciatario', $1, 'Autorizado por Dirección comercial')`,
        [f],
      ),
    ).rejects.toThrow('Solo un head');
    await expect(
      uno(luis, `select crm_liberar_candado('franquiciatario', $1, 'corto')`, [f]),
    ).rejects.toThrow('motivo');
    await uno(
      luis,
      `select crm_liberar_candado('franquiciatario', $1, 'Reunión hecha por teléfono, sin fecha')`,
      [f],
    );
    const c = await uno<{ liberado: boolean }>(
      vendedora,
      'select liberado from crm_v_candados where card_id = $1',
      [f],
    );
    expect(c.liberado).toBe(true);
    const r = await avanzar(
      vendedora,
      'franquiciatario',
      f,
      'revision_contrato',
      await version('crm_franquiciatarios', f),
    );
    expect(r.etapa).toBe('revision_contrato');
    const l = await db.query<{ consumida_en: string | null }>(
      'select consumida_en from crm_liberaciones where card_id = $1',
      [f],
    );
    expect(l.rows[0].consumida_en).not.toBeNull();
    const h = await db.query<{ actor_nombre: string; motivo: string }>(
      `select actor_nombre, motivo from crm_historial where franquiciatario_id = $1 and accion = 'candado_liberado'`,
      [f],
    );
    expect(h.rows[0].motivo).toBe('Reunión hecha por teléfono, sin fecha');
    expect(h.rows[0].actor_nombre).toBe('Usuario compras');
  });
});

describe('franquiciatario → sucursal (D2)', () => {
  let f: string, s: string;
  it('al cerrar la etapa 5 se formaliza y nace la sucursal en la etapa 6', async () => {
    f = await franquiciatarioListo();
    const r = await formalizar(f);
    expect(r.etapa).toBe('formalizado');
    s = r.sucursal_id!;
    expect(await etapaDe('crm_tiendas', s)).toBe('locales');
    const t = await db.query<{ franquiciatario_id: string; embudo: string }>(
      'select franquiciatario_id, embudo from crm_tiendas where id = $1',
      [s],
    );
    expect(t.rows[0]).toEqual({ franquiciatario_id: f, embudo: 'general' });
  });

  it('un franquiciatario puede tener varias sucursales; antes de formalizar, no', async () => {
    const otra = await uno<{ id: string }>(vendedora, `select crm_crear_sucursal($1, 'Segunda', 'León') id`, [
      f,
    ]);
    expect(otra.id).toBeTruthy();
    const nuevo = await franquiciatarioListo();
    await expect(uno(vendedora, `select crm_crear_sucursal($1, 'X')`, [nuevo])).rejects.toThrow('etapa 5');
    await expect(
      como(vendedora, () =>
        db.query(
          `insert into crm_tiendas (nombre, embudo, etapa_id) values ('Directa', 'general', crm_etapa('locales'))`,
        ),
      ),
    ).rejects.toThrow('desde el franquiciatario');
  });

  it('la etapa 6 la mueve Aprobación de locales; COF y contrato son por sucursal con carril paralelo', async () => {
    await expect(
      avanzar(vendedora, 'sucursal', s, 'constancia', await version('crm_tiendas', s)),
    ).rejects.toThrow('Aprobación de locales');
    for (const [clave, extra] of [
      ['lineamientos', { fecha: '2026-10-10' }],
      ['propuestas', { archivo: await archivo(sebastian, 'tienda_id', s) }],
      ['dictamen', { archivo: await archivo(sebastian, 'tienda_id', s) }],
      ['dictamen_firmado', { archivo: await archivo(sebastian, 'tienda_id', s), fecha: '2026-10-12' }],
    ] as const)
      await cumplir(sebastian, 'sucursal', s, clave, extra);
    await avanzar(sebastian, 'sucursal', s, 'constancia', await version('crm_tiendas', s));
    await cumplir(sebastian, 'sucursal', s, 'arrendamiento', {
      archivo: await archivo(sebastian, 'tienda_id', s),
    });
    await cumplir(sebastian, 'sucursal', s, 'solicitud_constancia', { fecha: '2026-10-13' });
    await cumplir(andres, 'sucursal', s, 'constancia_firmada', {
      archivo: await archivo(andres, 'tienda_id', s),
      fecha: '2026-10-13',
    });
    await como(andres, () =>
      db.query(
        `update crm_tiendas set fecha_limite_apertura = '2027-02-10', fecha_estimada_apertura = '2027-01-15' where id = $1`,
        [s],
      ),
    );
    await avanzar(andres, 'sucursal', s, 'transferencia', await version('crm_tiendas', s));
    await cumplir(andres, 'sucursal', s, 'transferencia_habilitada');
    await avanzar(legalMiembro, 'sucursal', s, 'p_arquitecta', await version('crm_tiendas', s));
    // Carril paralelo (Q2): Legal registra la COF mientras la sucursal está en Proyectos.
    const cof = await cumplir(andres, 'sucursal', s, 'cof_enviada', { fecha: '2026-11-10' });
    expect(cof.estado).toBe('validado');
    await expect(
      avanzar(legalMiembro, 'sucursal', s, 'p_3d', await version('crm_tiendas', s)),
    ).rejects.toThrow('la mueve Proyectos');
    await avanzar(proyectos, 'sucursal', s, 'p_capacitacion', await version('crm_tiendas', s));
    await avanzar(proyectos, 'sucursal', s, 'cof', await version('crm_tiendas', s));
    const c = await uno<{ total: number; listos: number }>(
      andres,
      'select total, listos from crm_v_candados where card_id = $1',
      [s],
    );
    expect(c).toEqual({ total: 2, listos: 1 });
  });

  it('no se descarta un franquiciatario con sucursales en proceso; un head cancela en cascada', async () => {
    await expect(
      avanzar(
        luis,
        'franquiciatario',
        f,
        'descartada',
        await version('crm_franquiciatarios', f),
        'Ya no sigue',
      ),
    ).rejects.toThrow('cerrada');
    const otro = await franquiciatarioListo();
    const r = await formalizar(otro);
    await expect(
      uno(vendedora, `select crm_cancelar_cascada($1, 'Se retiró del proyecto por salud')`, [otro]),
    ).rejects.toThrow('Solo un head');
    const n = await uno<{ n: number }>(
      luis,
      `select crm_cancelar_cascada($1, 'Se retiró del proyecto por salud') n`,
      [otro],
    );
    expect(n.n).toBe(1);
    expect(await etapaDe('crm_tiendas', r.sucursal_id!)).toBe('cancelada');
  });
});

describe('permisos (§5.5)', () => {
  it('lectura no cumple ni mueve; sin módulo no ve nada; OAuth bloqueado', async () => {
    const f = await franquiciatarioListo();
    await expect(avanzar(lector, 'franquiciatario', f, 'contacto', 1)).rejects.toThrow('Sin permiso');
    const visto = await uno<{ n: number }>(sinCrm, 'select count(*)::int n from crm_franquiciatarios');
    expect(visto.n).toBe(0);
    const vistoReq = await uno<{ n: number }>(sinCrm, 'select count(*)::int n from crm_requisitos');
    expect(vistoReq.n).toBe(0);
    await db.query(`select set_config('request.jwt.claims', $1, false)`, [
      JSON.stringify({ client_id: 'claude' }),
    ]);
    try {
      const n = await uno<{ n: number }>(vendedora, 'select count(*)::int n from crm_franquiciatarios');
      expect(n.n).toBe(0);
      await expect(avanzar(vendedora, 'franquiciatario', f, 'contacto', 1)).rejects.toThrow('Sin permiso');
    } finally {
      await db.query(`select set_config('request.jwt.claims', '', false)`);
    }
  });

  it('solo un desarrollador administra membresías', async () => {
    await expect(
      como(luis, () =>
        db.query(`insert into crm_membresias (user_id, area, rol) values ($1, 'legal', 'head')`, [vendedora]),
      ),
    ).rejects.toThrow();
    await como(sebastian, () =>
      db.query(`insert into crm_membresias (user_id, area, rol) values ($1, 'legal', 'lectura')`, [
        vendedora,
      ]),
    );
    const h = await db.query<{ resumen: string; actor_nombre: string }>(
      `select resumen, actor_nombre from crm_historial where accion = 'acceso' order by id desc limit 1`,
    );
    expect(h.rows[0].resumen).toBe('Área Legal: lectura');
    await como(sebastian, () =>
      db.query(`delete from crm_membresias where user_id = $1 and area = 'legal'`, [vendedora]),
    );
  });
});

describe('bitácora inalterable (§5.6)', () => {
  it('cada acción deja actor, nombre, área y fecha; los borrados también', async () => {
    const f = await franquiciatarioListo();
    const n = await uno<{ id: string }>(
      vendedora,
      `insert into crm_notas (franquiciatario_id, contenido) values ($1, 'x') returning id`,
      [f],
    );
    const ck = await uno<{ id: string }>(
      vendedora,
      `insert into crm_checklists (tienda_id, nombre) select id, 'Lista' from crm_tiendas where embudo = 'general' limit 1 returning id`,
    );
    const it = await uno<{ id: string }>(
      vendedora,
      `insert into crm_checklist_items (checklist_id, texto, orden) values ($1, 'a', 1) returning id`,
      [ck.id],
    );
    await como(vendedora, () => db.query('delete from crm_checklist_items where id = $1', [it.id]));
    const h = await db.query<{ accion: string; actor_nombre: string; actor_area: string; origen: string }>(
      `select accion, actor_nombre, actor_area, origen from crm_historial where entidad_id = any($1) order by id`,
      [[n.id, it.id]],
    );
    expect(h.rows.map((x) => x.accion)).toEqual(['nota', 'checklist', 'checklist']);
    expect(
      h.rows.every(
        (x) => x.actor_nombre === 'Usuario compras' && x.actor_area === 'ventas' && x.origen === 'crm',
      ),
    ).toBe(true);
  });

  it('nadie edita ni borra eventos del CRM: ni usuarios, ni el dueño de la base, ni TRUNCATE', async () => {
    await expect(como(sebastian, () => db.query('delete from crm_historial'))).rejects.toThrow();
    await expect(db.query(`update crm_historial set resumen = 'x' where origen = 'crm'`)).rejects.toThrow(
      'no se edita',
    );
    await expect(db.query(`delete from crm_historial where origen = 'crm'`)).rejects.toThrow('no se edita');
    await expect(db.query('truncate crm_historial')).rejects.toThrow('no se vacía');
  });

  it('retirar un archivo exige motivo; una versión nueva conserva la anterior', async () => {
    const f = await franquiciatarioListo();
    const a = await archivo(vendedora, 'franquiciatario_id', f, 'survey');
    await expect(
      como(vendedora, () => db.query('update crm_archivos set archivado_en = now() where id = $1', [a])),
    ).rejects.toThrow('motivo');
    const b = await uno<{ id: string; version_documento: number; tipo_documento: string }>(
      vendedora,
      `insert into crm_archivos (nombre, mime, tamano, franquiciatario_id, reemplaza_a) values ('v2.pdf', 'application/pdf', 1, $1, $2)
       returning id, version_documento, tipo_documento`,
      [f, a],
    );
    expect(b).toMatchObject({ version_documento: 2, tipo_documento: 'survey' });
    await uno(vendedora, 'select crm_registrar_descarga($1)', [b.id]);
    const h = await db.query<{ accion: string }>(
      `select accion from crm_historial where entidad = 'crm_archivos' and entidad_id = any($1) order by id`,
      [[a, b.id]],
    );
    expect(h.rows.map((x) => x.accion)).toEqual(['archivo', 'archivo_version', 'archivo_descargado']);
  });
});

describe('avisos de tiempo (§7)', () => {
  it('5 días hábiles saltan fines de semana y festivos', async () => {
    // Jueves 19-nov-2026; el lunes 16 es festivo (Revolución): 18, 17, 13, 12, 11.
    const r = await db.query<{ f: string }>(`select crm_restar_dias_habiles('2026-11-19', 5)::text f`);
    expect(r.rows[0].f).toBe('2026-11-11');
  });

  it('el aviso de COF aparece a 2 meses de la apertura estimada y no se duplica', async () => {
    const f = await franquiciatarioListo();
    const { sucursal_id: s } = await formalizar(f);
    await db.query(
      `update crm_tiendas set fecha_estimada_apertura = '2027-03-20', fecha_confirmada_apertura = '2027-03-19' where id = $1`,
      [s],
    );
    const antes = await uno<{ n: number }>(vendedora, `select crm_generar_avisos('2027-01-19') n`);
    const cof = await db.query<{ n: number }>(
      `select count(*)::int n from crm_avisos where tienda_id = $1 and tipo = 'cof'`,
      [s],
    );
    expect(cof.rows[0].n).toBe(0);
    expect(antes.n).toBeGreaterThanOrEqual(0);
    await uno(vendedora, `select crm_generar_avisos('2027-01-20') n`);
    await uno(vendedora, `select crm_generar_avisos('2027-01-21') n`);
    const despues = await db.query<{ n: number; origen: string }>(
      `select count(*)::int n from crm_avisos where tienda_id = $1 and tipo = 'cof'`,
      [s],
    );
    expect(despues.rows[0].n).toBe(1);
    const h = await db.query<{ origen: string; actor_nombre: string }>(
      `select origen, actor_nombre from crm_historial where accion = 'aviso' and tienda_id = $1`,
      [s],
    );
    expect(h.rows[0]).toEqual({ origen: 'sistema', actor_nombre: 'Sistema' });
    await expect(
      uno(proyectos, `select crm_atender_aviso(id) from crm_avisos where tienda_id = $1 and tipo = 'cof'`, [
        s,
      ]),
    ).rejects.toThrow('lo atiende Legal');
    await uno(
      legalMiembro,
      `select crm_atender_aviso(id) from crm_avisos where tienda_id = $1 and tipo = 'cof'`,
      [s],
    );
  });
});
