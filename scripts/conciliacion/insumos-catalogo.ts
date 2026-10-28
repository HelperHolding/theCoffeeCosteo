import { createHash, randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { cerrarTransaccion, unirErrores, type Cierre } from './cierre';
import type { Conexion } from './fase4';

/**
 * Categoría y proveedor de insumos (doc 32): en UNA transacción, cada cambio declarado en el manifiesto (insumo, campo,
 * valor previo y nuevo por NOMBRE de catálogo). No cambia costos, presentaciones, unidades ni nombres.
 *  1. lote aprobado: manifiesto con huella fijada en LOTES_INSUMOS_APROBADOS;
 *  2. perfil obligatorio también en el ensayo (activo, compras o admin): autor de la bitácora;
 *  3. REPEATABLE READ; bloquea los insumos (FOR UPDATE). Bloqueo optimista: cada campo con su valor previo exacto. Si
 *     todo ya tiene el valor nuevo → «sin cambio»; cualquier mezcla → problema y no se toca nada;
 *  4. bitácora: exactamente un registro por cambio (tabla insumos, campo categoria_id o proveedor_id, valores anterior
 *     y nuevo), de esta transacción, con autor y origen carga_masiva; se les pone la nota de la ejecución;
 *  5. huellas: el resto de insumos, los demás campos de estos insumos, recetas, líneas, cantidades, tamaños, precios,
 *     enlaces POS y costos de productos y subrecetas no cambian;
 *  6. cierre verificado (cierre.ts); COMMIT solo en aplicar/revertir.
 * `revertir` exige el id de ejecución y se niega si los insumos tienen registros posteriores en la bitácora.
 */
export type ModoInsumos = 'ensayo' | 'aplicar' | 'revertir';
export type CampoInsumo = 'categoria' | 'proveedor';
export interface CambioInsumo {
  insumo: string;
  campo: CampoInsumo;
  previo: string;
  nuevo: string;
  motivo: string;
}
export interface ManifiestoInsumos {
  lote: string;
  fuente: { archivo: string; sha256: string };
  cambios: CambioInsumo[];
  aprobacion: string;
}

/** Manifiestos aprobados: nombre → ruta y sha256 (LF, sin BOM). Un lote nuevo entra al revisar este cambio. */
export const LOTES_INSUMOS_APROBADOS: Record<string, { manifiesto: string; sha256: string }> = {
  // Carlo, 2026-10-27 (doc 32): 4 bases de frappé a INGREDIENTES (Zoho) y el creamer duplicado como su gemelo.
  'insumos-categorias-zoho-lote-1': {
    manifiesto: 'docs/conciliacion-brasil/32-insumos-categorias-zoho-lote-1.manifiesto.json',
    sha256: 'f047577a9eb12c5cfe68a32dd79a9cc4338d167db72fc7aeb81683b0855f92f3',
  },
};

const COLUMNA: Record<CampoInsumo, { columna: string; catalogo: string }> = {
  categoria: { columna: 'categoria_id', catalogo: 'categorias_insumo' },
  proveedor: { columna: 'proveedor_id', catalogo: 'proveedores' },
};
const normalizar = (t: string) => t.replace(/^﻿/, '').replace(/\r\n/g, '\n');

export function validarManifiestoInsumos(m: ManifiestoInsumos) {
  if (!m.lote?.trim()) throw new Error('El manifiesto no declara el lote');
  if (!m.fuente?.archivo?.trim() || !/^[0-9a-f]{64}$/.test(m.fuente.sha256 ?? ''))
    throw new Error('El manifiesto no declara la fuente con su sha256');
  if (!Array.isArray(m.cambios) || !m.cambios.length) throw new Error('El manifiesto no tiene cambios');
  const vistos = new Set<string>();
  for (const c of m.cambios) {
    if (!c.insumo?.trim() || !(c.campo in COLUMNA))
      throw new Error(`Cambio inválido: ${c.insumo} ${c.campo}`);
    if (!c.previo?.trim() || !c.nuevo?.trim() || c.previo === c.nuevo)
      throw new Error(`Valores inválidos en ${c.insumo} ${c.campo}`);
    if (!c.motivo?.trim()) throw new Error(`Falta el motivo de ${c.insumo} ${c.campo}`);
    const k = `${c.insumo}|${c.campo}`;
    if (vistos.has(k)) throw new Error(`Cambio repetido: ${c.insumo} ${c.campo}`);
    vistos.add(k);
  }
}

export async function leerLoteInsumos(
  nombre: string,
  raiz = '.',
  aprobados = LOTES_INSUMOS_APROBADOS,
): Promise<ManifiestoInsumos> {
  const entrada = aprobados[nombre];
  if (!entrada)
    throw new Error(`El lote «${nombre}» no está aprobado (no figura en LOTES_INSUMOS_APROBADOS)`);
  const texto = normalizar(await readFile(`${raiz}/${entrada.manifiesto}`, 'utf8'));
  const huella = createHash('sha256').update(texto).digest('hex');
  if (huella !== entrada.sha256)
    throw new Error(`El manifiesto de «${nombre}» no es el aprobado (sha256 ${huella}). Requiere revisión.`);
  const m = JSON.parse(texto) as ManifiestoInsumos;
  if (m.lote !== nombre) throw new Error(`El manifiesto declara «${m.lote}», no «${nombre}»`);
  validarManifiestoInsumos(m);
  return m;
}

export type ResultadoCambio = 'cambiado' | 'sin cambio' | 'revertido' | 'problema';
export interface InformeInsumos {
  modo: ModoInsumos;
  lote: string;
  usuario: string;
  ejecucion: string;
  cambios: {
    insumo: string;
    campo: CampoInsumo;
    detalle: string;
    resultado: ResultadoCambio;
    bitacora?: number;
    problemas: string[];
  }[];
  totales: Record<ResultadoCambio, number>;
  bitacoraPropia: number;
  bitacoraAjena: number;
  costosSinCambios?: boolean;
  restoSinCambios?: boolean;
  transaccion: Cierre;
  error?: string;
}

/** [nombre, consulta]: $1 = nombres de los insumos del lote. */
const HUELLAS: [string, string][] = [
  ['insumos (resto)', 'select * from public.insumos where nombre <> all ($1::text[])'],
  [
    'insumos del lote (otros campos)',
    `select id, nombre, costo_paquete, presentacion, unidad, activo from public.insumos where nombre = any ($1::text[])`,
  ],
  ['recetas', 'select * from public.recetas'],
  ['receta_lineas', 'select * from public.receta_lineas'],
  ['linea_cantidades', 'select * from public.linea_cantidades'],
  ['producto_tamanos', 'select * from public.producto_tamanos'],
  ['precio_canal_manual', 'select * from public.precio_canal_manual'],
  ['producto_codigo_pos', 'select * from public.producto_codigo_pos'],
  ['categorias_insumo', 'select * from public.categorias_insumo'],
  ['proveedores', 'select * from public.proveedores'],
];
const COSTOS = [
  'select producto_id, tamano_id, round(costo, 6), usa_inactivo from public.v_costo_producto',
  'select subreceta_id, round(costo_unitario, 6), usa_inactivo from public.v_costo_subreceta',
];
const huellaDe = `select count(*)::text || ':' || md5(coalesce(string_agg(x::text, '|' order by x::text), '')) as h`;

export async function aplicarInsumos(
  cx: Conexion,
  modo: ModoInsumos,
  m: ManifiestoInsumos,
  opciones: { usuario: string; ejecucion?: string },
): Promise<InformeInsumos> {
  const ejecucion = modo === 'revertir' ? (opciones.ejecucion ?? '') : (opciones.ejecucion ?? randomUUID());
  const informe: InformeInsumos = {
    modo,
    lote: m.lote,
    usuario: opciones.usuario,
    ejecucion,
    cambios: (m.cambios ?? []).map((c) => ({
      insumo: c.insumo,
      campo: c.campo,
      detalle: `${c.previo} → ${c.nuevo}`,
      resultado: 'problema',
      problemas: [],
    })),
    totales: { cambiado: 0, 'sin cambio': 0, revertido: 0, problema: 0 },
    bitacoraPropia: 0,
    bitacoraAjena: 0,
    transaccion: 'rollback',
  };
  if (!opciones.usuario) {
    informe.error = 'Falta --usuario (perfil activo de compras o admin), obligatorio también en el ensayo';
    return informe;
  }
  if (!/^[0-9a-f-]{36}$/.test(ejecucion)) {
    informe.error = modo === 'revertir' ? 'Revertir exige --ejecucion <uuid>' : 'Id de ejecución inválido';
    return informe;
  }
  try {
    validarManifiestoInsumos(m);
  } catch (e) {
    informe.error = e instanceof Error ? e.message : String(e);
    return informe;
  }
  const nombres = [...new Set(m.cambios.map((c) => c.insumo))];
  const notaEjecucion = `${m.lote}, ejecución ${ejecucion} (docs/conciliacion-brasil/32)`;
  const nota =
    modo === 'revertir'
      ? `${m.lote}, reversión de la ejecución ${ejecucion} (docs/conciliacion-brasil/32)`
      : notaEjecucion;
  const huellas = async () => {
    const h: Record<string, string> = {};
    for (const [n, sql] of HUELLAS)
      h[n] = (
        await cx.query<{ h: string }>(`${huellaDe} from (${sql}) x`, sql.includes('$1') ? [nombres] : [])
      ).rows[0].h;
    return h;
  };
  const costos = async () => {
    const h: string[] = [];
    for (const sql of COSTOS)
      h.push((await cx.query<{ h: string }>(`${huellaDe} from (${sql}) x`)).rows[0].h);
    return h.join('/');
  };

  await cx.query('begin isolation level repeatable read');
  let fin: 'commit' | 'rollback' = 'rollback';
  try {
    await cx.query(
      `select set_config('statement_timeout', '15s', true), set_config('lock_timeout', '5s', true),
              set_config('idle_in_transaction_session_timeout', '60s', true), set_config('app.origen', 'carga_masiva', true)`,
    );
    const perfil = await cx.query(
      `select 1 from perfiles where user_id = $1 and activo and rol in ('compras', 'admin')`,
      [opciones.usuario],
    );
    if (perfil.rows.length !== 1)
      throw new Error('El usuario indicado no es un perfil activo de compras o admin');
    await cx.query(`select set_config('request.jwt.claim.sub', $1, true)`, [opciones.usuario]);

    const actuales = new Map(
      (
        await cx.query<{ id: string; nombre: string; activo: boolean; categoria: string; proveedor: string }>(
          `select i.id, i.nombre, i.activo, c.nombre as categoria, p.nombre as proveedor
             from public.insumos i join public.categorias_insumo c on c.id = i.categoria_id join public.proveedores p on p.id = i.proveedor_id
            where i.nombre = any ($1::text[]) order by i.id for update of i`,
          [nombres],
        )
      ).rows.map((x) => [x.nombre, x]),
    );
    const catalogo = async (campo: CampoInsumo, nombre: string) =>
      (
        await cx.query<{ id: string }>(
          `select id from public.${COLUMNA[campo].catalogo} where nombre = $1 and activo`,
          [nombre],
        )
      ).rows[0]?.id;
    const maxBitacora = Number(
      (await cx.query<{ m: string }>(`select coalesce(max(id), 0) as m from bitacora`)).rows[0].m,
    );
    const huellasAntes = await huellas();
    const costosAntes = await costos();

    const objetivo = (c: CambioInsumo) => (modo === 'revertir' ? c.previo : c.nuevo);
    const origen = (c: CambioInsumo) => (modo === 'revertir' ? c.nuevo : c.previo);
    const todosHechos =
      modo !== 'revertir' && m.cambios.every((c) => actuales.get(c.insumo)?.[c.campo] === c.nuevo);
    if (modo === 'revertir') {
      const propios = (
        await cx.query<{ m: string; n: string }>(
          `select max(id)::text as m, count(*)::text as n from bitacora where nota = $1`,
          [notaEjecucion],
        )
      ).rows[0];
      if (!Number(propios.n))
        throw new Error(`No hay registros de la ejecución ${ejecucion}: nada que revertir`);
      const ids = [...actuales.values()].map((x) => x.id);
      const posteriores = Number(
        (
          await cx.query<{ n: string }>(
            `select count(*) as n from bitacora where tabla = 'insumos' and registro_id = any ($1::text[]) and id > $2`,
            [ids, Number(propios.m)],
          )
        ).rows[0].n,
      );
      if (posteriores)
        throw new Error(`Hubo ${posteriores} cambio(s) posterior(es) en los insumos: no se revierte`);
    }

    const ids: Record<string, string> = {};
    for (const [i, c] of m.cambios.entries()) {
      const ic = informe.cambios[i];
      const a = actuales.get(c.insumo);
      if (!a) {
        ic.problemas.push('el insumo no existe');
        continue;
      }
      if (!a.activo) ic.problemas.push('el insumo está inactivo');
      if (todosHechos) {
        if (!ic.problemas.length) ic.resultado = 'sin cambio';
        continue;
      }
      if (a[c.campo] !== origen(c))
        ic.problemas.push(`${c.campo} actual «${a[c.campo]}», se esperaba «${origen(c)}»`);
      const id = await catalogo(c.campo, objetivo(c));
      if (!id) ic.problemas.push(`no existe ${c.campo} activo «${objetivo(c)}»`);
      else ids[`${i}`] = id;
    }
    if (informe.cambios.some((x) => x.problemas.length))
      throw new Error('Algún cambio no está como declara el manifiesto: no se toca nada');

    if (!todosHechos)
      for (const [i, c] of m.cambios.entries()) {
        const hechos = (
          await cx.query(
            `update public.insumos set ${COLUMNA[c.campo].columna} = $1 where id = $2 returning id`,
            [ids[`${i}`], actuales.get(c.insumo)!.id],
          )
        ).rows.length;
        if (hechos !== 1) throw new Error(`No se actualizó ${c.insumo} ${c.campo}`);
      }

    // Verificación: valores finales, bitácora propia, costos y huellas.
    const despues = new Map(
      (
        await cx.query<{ nombre: string; categoria: string; proveedor: string }>(
          `select i.nombre, c.nombre as categoria, p.nombre as proveedor
             from public.insumos i join public.categorias_insumo c on c.id = i.categoria_id join public.proveedores p on p.id = i.proveedor_id
            where i.nombre = any ($1::text[])`,
          [nombres],
        )
      ).rows.map((x) => [x.nombre, x]),
    );
    const propias = (
      await cx.query<{
        id: string;
        propia: boolean;
        tabla: string;
        registro_id: string;
        campo: string;
        valor_anterior: string;
        valor_nuevo: string;
        origen: string;
        usuario_id: string | null;
      }>(
        `select id, fecha = now() as propia, tabla, registro_id, campo, valor_anterior, valor_nuevo, origen, usuario_id from bitacora where id > $1 order by id`,
        [maxBitacora],
      )
    ).rows;
    const mias = propias.filter((b) => b.propia);
    informe.bitacoraPropia = mias.length;
    informe.bitacoraAjena = propias.length - mias.length;
    const usadas = new Set<string>();
    for (const [i, c] of m.cambios.entries()) {
      const ic = informe.cambios[i];
      if (ic.resultado === 'sin cambio') continue;
      if (despues.get(c.insumo)?.[c.campo] !== objetivo(c))
        ic.problemas.push(`quedó en «${despues.get(c.insumo)?.[c.campo]}»`);
      const b = mias.filter(
        (x) =>
          x.tabla === 'insumos' &&
          x.registro_id === actuales.get(c.insumo)!.id &&
          x.campo === COLUMNA[c.campo].columna,
      );
      if (
        b.length !== 1 ||
        b[0].valor_nuevo !== ids[`${i}`] ||
        b[0].origen !== 'carga_masiva' ||
        b[0].usuario_id !== opciones.usuario
      )
        ic.problemas.push(`bitácora inesperada: ${JSON.stringify(b)}`);
      else {
        ic.bitacora = Number(b[0].id);
        usadas.add(b[0].id);
      }
      if (!ic.problemas.length) ic.resultado = modo === 'revertir' ? 'revertido' : 'cambiado';
    }
    const sobrantes = mias.filter((x) => !usadas.has(x.id));
    if (sobrantes.length)
      throw new Error(
        `Esta ejecución dejó ${sobrantes.length} registro(s) de bitácora inesperado(s): no se aplica nada`,
      );
    if (usadas.size)
      await cx.query(`update bitacora set nota = $2 where id = any ($1::bigint[])`, [[...usadas], nota]);
    informe.costosSinCambios = (await costos()) === costosAntes;
    informe.restoSinCambios = JSON.stringify(await huellas()) === JSON.stringify(huellasAntes);
    for (const x of informe.cambios) {
      if (x.problemas.length) x.resultado = 'problema';
      informe.totales[x.resultado]++;
    }
    if (informe.totales.problema)
      throw new Error(`${informe.totales.problema} cambio(s) con problemas: no se aplica nada`);
    if (!informe.costosSinCambios) throw new Error('Cambió algún costo: no se aplica nada');
    if (!informe.restoSinCambios) throw new Error('Cambió algo fuera de los campos del lote');
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
