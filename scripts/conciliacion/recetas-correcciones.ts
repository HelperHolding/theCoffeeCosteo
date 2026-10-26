import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Correcciones de cantidades de recetas según el recetario oficial (docs/conciliacion-brasil/21). UPDATE dirigido a
 * celdas exactas de linea_cantidades, sin pasar por guardar_receta (que reescribe todas las cantidades). Lógica
 * independiente de la conexión: la usa el CLI con pg y las pruebas con PGlite. Todo en UNA transacción:
 *  1. lote aprobado: manifiesto cuya huella está fijada en LOTES_RECETAS_APROBADOS; declara receta, versión esperada y
 *     cada celda (línea, insumo, tamaño, valor previo, valor nuevo y fuente). Cualquier variación detiene todo;
 *  2. perfil obligatorio también en el ensayo (activo, operaciones o admin): updated_by y bitácora;
 *  3. REPEATABLE READ; bloquea la receta y las celdas (FOR UPDATE). El trigger de edición toma además el candado
 *     de recetas, así que una edición del portal espera o la ejecución falla por serialización;
 *  4. bloqueo optimista: versión igual a la del manifiesto y cada celda con su valor previo exacto. Si todas ya tienen
 *     el valor nuevo → «sin cambio» (idempotente); cualquier otra mezcla → problema y no se toca nada;
 *  5. bitácora: solo los registros de esta transacción (fecha = now()), exactamente uno por celda (campo cantidad,
 *     receta resuelta por la línea, origen carga_masiva, autor), con nota que identifica la ejecución;
 *  6. huellas: precios, insumos, líneas, enlaces POS, las demás cantidades y las demás recetas no cambian;
 *  7. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución: devuelve el valor previo solo a las celdas que esa ejecución cambió, si siguen
 * con el valor nuevo y si no hubo ningún registro posterior de la receta en la bitácora (ediciones posteriores).
 */
export type ModoCorreccion = 'ensayo' | 'aplicar' | 'revertir';
export interface Celda {
  linea_id: string;
  insumo_id: string;
  insumo: string;
  tamano_id: string;
  tamano: string;
  previo: number;
  nuevo: number;
  fuente: string;
}
export interface ManifiestoRecetas {
  lote: string;
  fuente: { archivo: string; sha256: string; ficha: string; pagina: number };
  receta: { id: string; nombre: string; version: number };
  celdas: Celda[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_RECETAS_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  'recetario-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/21-lote-1-recetas.manifiesto.json',
    sha256: '97e3f56af242dff45a834eecaf55831a8346f436ab707d892babb9906c7cdb43',
  },
  'recetario-lote-2-urban': {
    manifiesto: 'docs/conciliacion-brasil/21-lote-2-urban-chocolate.manifiesto.json',
    sha256: '79b31a016111f677c058a7a823b4a360a0eae8fc1b7696afcbe0bca18570d899',
  },
  'recetario-lote-2-coldbrew': {
    manifiesto: 'docs/conciliacion-brasil/21-lote-2-cold-brew.manifiesto.json',
    sha256: 'fd9669b63d556bb3071bb1fe8927dcd7744a76e4a8405caf2e7bbd75db1661b8',
  },
  'recetario-lote-3b-coldbrew-agua': {
    manifiesto: 'docs/conciliacion-brasil/24-lote-3b-cold-brew-agua.manifiesto.json',
    sha256: '1995cf248495e3da7ba2e5668ec975638de5ad72584ba9746051db7501101b5d',
  },
};

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const normalizar = (t: string) => t.replace(/^\uFEFF/, '').replace(/\r\n/g, '\n');

export async function leerLoteRecetas(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_RECETAS_APROBADOS,
): Promise<ManifiestoRecetas> {
  const entrada = aprobados[nombre];
  if (!entrada)
    throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_RECETAS_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoRecetas;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  if (!UUID.test(m.receta?.id ?? '') || !Number.isInteger(m.receta.version))
    throw new Error('Receta o versión inválidas en el manifiesto');
  if (!Array.isArray(m.celdas) || !m.celdas.length) throw new Error('El manifiesto no tiene celdas');
  const vistas = new Set<string>();
  for (const c of m.celdas) {
    if (![c.linea_id, c.insumo_id, c.tamano_id].every((x) => UUID.test(x ?? '')))
      throw new Error(`Identificadores inválidos en una celda (${c.insumo} ${c.tamano})`);
    if (
      ![c.previo, c.nuevo].every((x) => typeof x === 'number' && Number.isFinite(x) && x >= 0) ||
      c.previo === c.nuevo
    )
      throw new Error(`Valores inválidos en ${c.insumo} ${c.tamano}`);
    if (!c.fuente?.trim()) throw new Error(`Falta la fuente de ${c.insumo} ${c.tamano}`);
    const k = `${c.linea_id}:${c.tamano_id}`;
    if (vistas.has(k)) throw new Error(`Celda repetida: ${c.insumo} ${c.tamano}`);
    vistas.add(k);
  }
  return m;
}

export type ResultadoCelda = 'cambiada' | 'sin cambio' | 'revertida' | 'problema';
export interface InformeCelda {
  insumo: string;
  tamano: string;
  previo: number;
  nuevo: number;
  antes: number | null;
  despues?: number | null;
  resultado: ResultadoCelda;
  bitacora?: number;
  problemas: string[];
}
export interface InformeCorreccion {
  modo: ModoCorreccion;
  lote: string;
  usuario: string;
  ejecucion: string;
  receta: {
    id: string;
    nombre: string;
    versionEsperada: number;
    versionAntes?: number;
    versionDespues?: number;
  };
  celdas: InformeCelda[];
  totales: Record<ResultadoCelda, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** Tablas cuya huella no debe cambiar (fuera de las celdas del lote y de la versión de la receta). */
/** [nombre, consulta, parámetros]: 'c' = claves de las celdas del lote, 'r' = receta del lote. */
const HUELLAS: [string, string, ('c' | 'r')[]][] = [
  ['producto_tamanos', 'select * from public.producto_tamanos', []],
  ['precio_canal_manual', 'select * from public.precio_canal_manual', []],
  ['insumos', 'select * from public.insumos', []],
  ['receta_lineas', 'select * from public.receta_lineas', []],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos', []],
  [
    'linea_cantidades (resto)',
    `select * from public.linea_cantidades
      where (linea_id::text || ':' || coalesce(tamano_id::text, '')) <> all ($1::text[])`,
    ['c'],
  ],
  ['recetas (resto)', 'select * from public.recetas where id <> $1', ['r']],
  [
    'receta (sin versión)',
    'select id, nombre, tipo, categoria_id, rendimiento, unidad_rendimiento, activo from public.recetas where id = $1',
    ['r'],
  ],
];

export async function corregir(
  cx: Conexion,
  modo: ModoCorreccion,
  m: ManifiestoRecetas,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeCorreccion> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeCorreccion = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    receta: { id: m.receta.id, nombre: m.receta.nombre, versionEsperada: m.receta.version },
    celdas: m.celdas.map((c) => ({
      insumo: c.insumo,
      tamano: c.tamano,
      previo: c.previo,
      nuevo: c.nuevo,
      antes: null,
      resultado: 'problema',
      problemas: [],
    })),
    totales: { cambiada: 0, 'sin cambio': 0, revertida: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error =
      'Falta --usuario (perfil activo de operaciones o admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!UUID.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  const claves = m.celdas.map((c) => `${c.linea_id}:${c.tamano_id}`);
  const nota =
    modo === 'revertir'
      ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/21)`
      : `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/21)`;
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const [nombre, sql, params] of HUELLAS)
      h[nombre] = (
        await cx.query<{ h: string }>(
          `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h
             from (${sql}) x`,
          params.map((p) => (p === 'c' ? claves : m.receta.id)),
        )
      ).rows[0].h;
    return h;
  };
  const leerCeldas = async () =>
    (
      await cx.query<{ clave: string; cantidad: string; receta_id: string; insumo_id: string | null }>(
        `select lc.linea_id::text || ':' || lc.tamano_id::text as clave, lc.cantidad::text as cantidad,
                l.receta_id, l.insumo_id
           from public.linea_cantidades lc join public.receta_lineas l on l.id = lc.linea_id
          where (lc.linea_id::text || ':' || coalesce(lc.tamano_id::text, '')) = any ($1::text[])
          order by 1 for update of lc`,
        [claves],
      )
    ).rows;

  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '15s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(
      `select 1 from perfiles where user_id = $1 and activo and rol in ('operaciones', 'admin')`,
      [opciones.usuario],
    );
    if (perfil.rows.length !== 1)
      throw new Error('El usuario indicado no es un perfil activo de operaciones o admin');
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);

    const r = (
      await cx.query<{ nombre: string; tipo: string; activo: boolean; version: number }>(
        `select nombre, tipo, activo, version from public.recetas where id = $1 for update`,
        [m.receta.id],
      )
    ).rows[0];
    if (!r) throw new Error('La receta del manifiesto no existe');
    informe.receta.versionAntes = Number(r.version);
    if (r.nombre !== m.receta.nombre)
      throw new Error(`La receta se llama «${r.nombre}», no «${m.receta.nombre}»`);
    if (r.tipo !== 'producto' || !r.activo) throw new Error('La receta no es un producto activo');

    const actuales = new Map((await leerCeldas()).map((x) => [x.clave, x]));
    m.celdas.forEach((c, i) => {
      const ic = informe.celdas[i];
      const a = actuales.get(`${c.linea_id}:${c.tamano_id}`);
      if (!a) {
        ic.problemas.push('la celda no existe');
        return;
      }
      ic.antes = Number(a.cantidad);
      if (a.receta_id !== m.receta.id) ic.problemas.push('la línea no pertenece a la receta');
      if (a.insumo_id !== c.insumo_id) ic.problemas.push('la línea no es del insumo declarado');
    });
    const huellasAntes = await huellas();
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    let esperadasBitacora = 0;
    const objetivo = (c: Celda) => (modo === 'revertir' ? c.previo : c.nuevo);
    const origen = (c: Celda) => (modo === 'revertir' ? c.nuevo : c.previo);

    if (modo === 'revertir') {
      // Los registros de la ejecución que se revierte, uno por celda, y ninguno posterior de la receta.
      const propios = (
        await cx.query<{ id: string; registro_id: string; valor_anterior: string; valor_nuevo: string }>(
          `select id, registro_id, valor_anterior, valor_nuevo from bitacora
            where tabla = 'linea_cantidades' and campo = 'cantidad' and receta_id = $1
              and nota = $2 order by id`,
          [m.receta.id, `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/21)`],
        )
      ).rows;
      if (!propios.length)
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
      const ultimo = Math.max(...propios.map((p) => Number(p.id)));
      const posteriores = Number(
        (
          await cx.query<{ n: string }>(
            `select count(*) as n from bitacora where receta_id = $1 and id > $2`,
            [m.receta.id, ultimo],
          )
        ).rows[0].n,
      );
      if (posteriores)
        throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en la receta: no se revierte`);
      m.celdas.forEach((c, i) => {
        const p = propios.find((x) => x.registro_id === `${c.linea_id}:${c.tamano_id}`);
        if (!p || Number(p.valor_anterior) !== c.previo || Number(p.valor_nuevo) !== c.nuevo)
          informe.celdas[i].problemas.push('la ejecución no cambió esta celda como declara el manifiesto');
      });
    } else if (informe.celdas.every((ic, i) => ic.antes === m.celdas[i].nuevo)) {
      for (const ic of informe.celdas) if (!ic.problemas.length) ic.resultado = 'sin cambio';
    } else if (informe.receta.versionAntes !== m.receta.version) {
      throw new Error(
        `La receta cambió: versión ${informe.receta.versionAntes}, el manifiesto espera ${m.receta.version}. No se toca nada.`,
      );
    }

    const aCambiar = m.celdas.filter((c, i) => informe.celdas[i].resultado !== 'sin cambio');
    m.celdas.forEach((c, i) => {
      const ic = informe.celdas[i];
      if (ic.resultado === 'sin cambio' || ic.problemas.length) return;
      if (ic.antes !== origen(c)) ic.problemas.push(`valor actual ${ic.antes}, se esperaba ${origen(c)}`);
    });
    if (informe.celdas.some((ic) => ic.problemas.length))
      throw new Error('Alguna celda no está como declara el manifiesto: no se toca nada');

    if (aCambiar.length) {
      const hechos = (
        await cx.query<{ clave: string }>(
          `update public.linea_cantidades lc set cantidad = v.objetivo
             from unnest($1::uuid[], $2::uuid[], $3::numeric[], $4::numeric[]) as v(linea_id, tamano_id, origen, objetivo)
            where lc.linea_id = v.linea_id and lc.tamano_id = v.tamano_id and lc.cantidad = v.origen
           returning lc.linea_id::text || ':' || lc.tamano_id::text as clave`,
          [
            aCambiar.map((c) => c.linea_id),
            aCambiar.map((c) => c.tamano_id),
            aCambiar.map(origen),
            aCambiar.map(objetivo),
          ],
        )
      ).rows;
      if (hechos.length !== aCambiar.length)
        throw new Error(`Se actualizaron ${hechos.length} celdas y se esperaban ${aCambiar.length}`);
      esperadasBitacora = aCambiar.length;
    }

    // Verificación: valores, versión, bitácora propia y huellas del resto.
    const despues = new Map((await leerCeldas()).map((x) => [x.clave, Number(x.cantidad)]));
    const propias = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string;
        receta_id: string | null;
        campo: string;
        valor_anterior: string;
        valor_nuevo: string;
        origen: string;
        usuario_id: string | null;
      }>(
        `select id, fecha = now() as propia, tabla, registro_id, receta_id, campo, valor_anterior, valor_nuevo, origen,
                usuario_id from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const mias = propias.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = propias.length - mias.length;
    for (const [i, c] of m.celdas.entries()) {
      const ic = informe.celdas[i];
      ic.despues = despues.get(`${c.linea_id}:${c.tamano_id}`) ?? null;
      if (ic.resultado === 'sin cambio') continue;
      if (ic.despues !== objetivo(c)) ic.problemas.push(`quedó en ${ic.despues}, se esperaba ${objetivo(c)}`);
      const b = mias.filter((x) => x.registro_id === `${c.linea_id}:${c.tamano_id}`);
      if (
        b.length !== 1 ||
        b[0].tabla !== 'linea_cantidades' ||
        b[0].campo !== 'cantidad' ||
        b[0].receta_id !== m.receta.id ||
        Number(b[0].valor_anterior) !== origen(c) ||
        Number(b[0].valor_nuevo) !== objetivo(c) ||
        b[0].origen !== 'carga_masiva' ||
        b[0].usuario_id !== opciones.usuario
      )
        ic.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
      else {
        ic.bitacora = Number(b[0].id);
        await cx.query(`update bitacora set nota = $2 where id = $1`, [b[0].id, nota]);
      }
      if (!ic.problemas.length) ic.resultado = modo === 'revertir' ? 'revertida' : 'cambiada';
    }
    if (mias.length !== esperadasBitacora)
      throw new Error(
        `Esta ejecución dejó ${mias.length} registros de bitácora y se esperaban ${esperadasBitacora}: no se aplica nada`,
      );
    informe.receta.versionDespues = Number(
      (await cx.query<{ v: number }>(`select version as v from public.recetas where id = $1`, [m.receta.id]))
        .rows[0].v,
    );
    if (informe.receta.versionDespues !== informe.receta.versionAntes + esperadasBitacora)
      throw new Error(
        `La versión pasó de ${informe.receta.versionAntes} a ${informe.receta.versionDespues}; se esperaba +${esperadasBitacora}`,
      );
    informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    for (const ic of informe.celdas) {
      if (ic.problemas.length) ic.resultado = 'problema';
      informe.totales[ic.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} celda(s) con problemas: no se aplica nada`);
    if (!informe.restoSinCambios)
      throw new Error(
        'Cambió algo fuera de las celdas del lote (precios, insumos, líneas, enlaces u otras recetas)',
      );
    if (modo !== 'ensayo') fin = 'commit';
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    fin = 'rollback';
  }
  const cierre = await cerrarTransaccion(cx, fin);
  informe.transaccion = cierre.transaccion;
  informe.error = unirErrores(informe.error, cierre.error);
  if (!informe.error) delete informe.error;
  return informe;
}
