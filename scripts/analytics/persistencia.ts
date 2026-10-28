import type { LecturaDiaria } from '../../lib/analytics/contrato';

/** pg.Client y PGlite comparten esta forma. */
export interface Db {
  query: <T = Record<string, unknown>>(sql: string, params?: unknown[]) => Promise<{ rows: T[] }>;
}

export interface TiendaAnalytics {
  company_id: number;
  store_id: number;
  nombre: string;
  relaciones: ('zoho' | 'crm')[];
}

export type Resultado = 'insertada' | 'actualizada' | 'ignorada';

/**
 * Alta o actualización de las tiendas incluidas. La relación company_id ↔ store_id ya verificada no se
 * reescribe en silencio: si cambia, falla.
 */
export async function guardarTiendas(db: Db, tiendas: TiendaAnalytics[], verificadoEn: string) {
  for (const t of tiendas) {
    const r = await db.query<{ store_id: number }>(
      `insert into public.analytics_tiendas (company_id, store_id, nombre, relaciones, verificado_en)
       values ($1, $2, $3, $4, $5)
       on conflict (company_id) do update set nombre = excluded.nombre, relaciones = excluded.relaciones,
         verificado_en = excluded.verificado_en
       returning store_id`,
      [t.company_id, t.store_id, t.nombre, t.relaciones, verificadoEn],
    );
    if (r.rows[0]?.store_id !== t.store_id)
      throw new Error(`company ${t.company_id}: store_id guardado distinto de ${t.store_id}`);
  }
}

/** Cada lectura es una llamada atómica a la función de la base (ver la migración 23). */
export async function guardarLecturas(db: Db, lecturas: LecturaDiaria[]) {
  const cuenta: Record<Resultado, number> = { insertada: 0, actualizada: 0, ignorada: 0 };
  for (const l of lecturas) {
    const r = await db.query<{ r: Resultado }>('select public.analytics_guardar_lectura($1::jsonb) as r', [
      JSON.stringify(l),
    ]);
    cuenta[r.rows[0].r]++;
  }
  return cuenta;
}

export interface Conciliacion {
  ok: boolean;
  /** Claves fuente|company|fecha[|canal] cuyo contenido en la base no es exactamente el del archivo. */
  diferencias: string[];
  /** POS: (company, fecha) cuya fila de la vista KPI no es mostrador + app del archivo. */
  kpiDiferencias: string[];
}

/**
 * Compara la base contra las lecturas del archivo, SOLO en sus claves (fuente, company, fecha): misma lectura
 * (leido_en, provisional), mismos canales al centavo y la vista KPI = mostrador + app.
 */
export async function conciliar(db: Db, lecturas: LecturaDiaria[]): Promise<Conciliacion> {
  const clave = (f: string, c: number, d: string) => `${f}|${c}|${d}`;
  const claves = new Set(lecturas.map((l) => clave(l.fuente, l.company_id, l.fecha)));
  const fuentes = [...new Set(lecturas.map((l) => l.fuente))];
  const fechas = [...new Set(lecturas.map((l) => l.fecha))];
  const cab = (
    await db.query<{
      fuente: string;
      company_id: number;
      fecha: string;
      leido_en: string;
      provisional: boolean;
    }>(
      `select fuente, company_id, fecha::text fecha, leido_en, provisional from public.analytics_lecturas
       where fuente = any($1) and fecha = any($2::date[])`,
      [fuentes, fechas],
    )
  ).rows.filter((r) => claves.has(clave(r.fuente, r.company_id, r.fecha)));
  const can = (
    await db.query<{
      fuente: string;
      company_id: number;
      fecha: string;
      canal: string;
      venta_cent: string;
      tickets: number;
      unidades: number;
    }>(
      `select fuente, company_id, fecha::text fecha, canal, venta_cent, tickets, unidades
       from public.analytics_ventas_diarias where fuente = any($1) and fecha = any($2::date[])`,
      [fuentes, fechas],
    )
  ).rows.filter((r) => claves.has(clave(r.fuente, r.company_id, r.fecha)));
  const kpi = (
    await db.query<{
      company_id: number;
      fecha: string;
      venta_cent: string;
      tickets: number;
      unidades: number;
    }>(
      `select company_id, fecha::text fecha, venta_cent, tickets, unidades from public.analytics_ventas_kpi
       where fecha = any($1::date[])`,
      [fechas],
    )
  ).rows.filter((r) => claves.has(clave('pos', r.company_id, r.fecha)));

  const diferencias: string[] = [];
  const cabDb = new Map(cab.map((r) => [clave(r.fuente, r.company_id, r.fecha), r]));
  const canDb = new Map(can.map((r) => [`${clave(r.fuente, r.company_id, r.fecha)}|${r.canal}`, r]));
  const kpiDb = new Map(kpi.map((r) => [clave('pos', r.company_id, r.fecha), r]));
  const kpiDiferencias: string[] = [];
  for (const l of lecturas) {
    const k = clave(l.fuente, l.company_id, l.fecha);
    const h = cabDb.get(k);
    if (
      !h ||
      new Date(h.leido_en).getTime() !== new Date(l.leido_en).getTime() ||
      h.provisional !== l.provisional
    )
      diferencias.push(k);
    for (const c of l.canales) {
      const g = canDb.get(`${k}|${c.canal}`);
      if (
        !g ||
        Number(g.venta_cent) !== c.venta_cent ||
        Number(g.tickets) !== c.tickets ||
        Number(g.unidades) !== c.unidades
      )
        diferencias.push(`${k}|${c.canal}`);
    }
    if (can.filter((r) => clave(r.fuente, r.company_id, r.fecha) === k).length !== l.canales.length)
      diferencias.push(`${k}|canales-extra`);
    if (l.fuente === 'pos') {
      const s = l.canales.filter((c) => c.canal === 'mostrador' || c.canal === 'app');
      const v = kpiDb.get(k);
      if (
        !v ||
        Number(v.venta_cent) !== s.reduce((a, c) => a + c.venta_cent, 0) ||
        Number(v.tickets) !== s.reduce((a, c) => a + c.tickets, 0) ||
        Number(v.unidades) !== s.reduce((a, c) => a + c.unidades, 0)
      )
        kpiDiferencias.push(k);
    }
  }
  return { ok: !diferencias.length && !kpiDiferencias.length, diferencias, kpiDiferencias };
}

export class ErrorConciliacion extends Error {
  constructor(readonly conciliacion: Conciliacion) {
    super(
      `Conciliación fallida (${conciliacion.diferencias.length} diferencias, ${conciliacion.kpiDiferencias.length} en KPI); se hizo ROLLBACK`,
    );
  }
}

export interface TiendaRespaldo extends TiendaAnalytics {
  verificado_en: string;
}
/** Estado previo exacto de lo que una carga va a tocar: con él la reversión restaura, no solo borra. */
export interface Respaldo {
  /** Lecturas existentes en las claves de la carga (las que serían reemplazadas), con todos sus canales. */
  lecturas: (LecturaDiaria & { cargado_en: string })[];
  /** Tiendas existentes con las company_id de la carga. Las ausentes aquí son altas de esta carga. */
  tiendas: TiendaRespaldo[];
}

export async function respaldar(
  db: Db,
  tiendas: TiendaAnalytics[],
  lecturas: LecturaDiaria[],
): Promise<Respaldo> {
  const clave = (f: string, c: number, d: string) => `${f}|${c}|${d}`;
  const claves = new Set(lecturas.map((l) => clave(l.fuente, l.company_id, l.fecha)));
  const fechas = [...new Set(lecturas.map((l) => l.fecha))];
  const cab = (
    await db.query<Record<string, unknown> & { fuente: string; company_id: number; fecha: string }>(
      `select fuente, company_id, fecha::text fecha, leido_en, provisional, version_calculo, criterio_fecha, origen,
              carga_id::text carga_id, cargado_en from public.analytics_lecturas where fecha = any($1::date[])`,
      [fechas],
    )
  ).rows.filter((r) => claves.has(clave(r.fuente, Number(r.company_id), r.fecha)));
  const can = (
    await db.query<{
      fuente: string;
      company_id: number;
      fecha: string;
      canal: string;
      venta_cent: string;
      tickets: number;
      unidades: number;
    }>(
      `select fuente, company_id, fecha::text fecha, canal, venta_cent, tickets, unidades
       from public.analytics_ventas_diarias where fecha = any($1::date[]) order by canal`,
      [fechas],
    )
  ).rows;
  const previas = cab.map((h) => ({
    fuente: h.fuente as LecturaDiaria['fuente'],
    company_id: Number(h.company_id),
    fecha: h.fecha,
    leido_en: new Date(h.leido_en as string).toISOString(),
    provisional: Boolean(h.provisional),
    completa: true as const,
    version_calculo: String(h.version_calculo),
    criterio_fecha: String(h.criterio_fecha),
    origen: String(h.origen),
    carga_id: String(h.carga_id),
    cargado_en: new Date(h.cargado_en as string).toISOString(),
    canales: can
      .filter(
        (c) => c.fuente === h.fuente && Number(c.company_id) === Number(h.company_id) && c.fecha === h.fecha,
      )
      .map((c) => ({
        canal: c.canal,
        venta_cent: Number(c.venta_cent),
        tickets: Number(c.tickets),
        unidades: Number(c.unidades),
      })),
  }));
  const ts = (
    await db.query<{
      company_id: number;
      store_id: number;
      nombre: string;
      relaciones: ('zoho' | 'crm')[];
      verificado_en: string;
    }>(
      `select company_id, store_id, nombre, relaciones, verificado_en from public.analytics_tiendas
       where company_id = any($1)`,
      [tiendas.map((t) => t.company_id)],
    )
  ).rows.map((t) => ({ ...t, verificado_en: new Date(t.verificado_en).toISOString() }));
  return { lecturas: previas, tiendas: ts };
}

/**
 * Carga completa en UNA transacción: respaldo del estado previo, tiendas, lecturas, segunda pasada (debe
 * ignorarlo todo) y conciliación. Cualquier error o diferencia → ROLLBACK: la base queda como estaba.
 */
export async function aplicarCarga(
  db: Db,
  tiendas: TiendaAnalytics[],
  verificadoEn: string,
  lecturas: LecturaDiaria[],
) {
  await db.query('begin');
  try {
    // Foto del estado previo DENTRO de la transacción: es exactamente lo que esta carga reemplaza.
    const respaldo = await respaldar(db, tiendas, lecturas);
    await guardarTiendas(db, tiendas, verificadoEn);
    const primera = await guardarLecturas(db, lecturas);
    const segunda = await guardarLecturas(db, lecturas);
    const conciliacion = await conciliar(db, lecturas);
    if (segunda.insertada || segunda.actualizada) {
      conciliacion.diferencias.push(`reejecucion-no-idempotente:${JSON.stringify(segunda)}`);
      conciliacion.ok = false;
    }
    if (!conciliacion.ok) throw new ErrorConciliacion(conciliacion);
    await db.query('commit');
    return { primera, segunda, conciliacion, respaldo };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}

/**
 * Revierte una carga en UNA transacción: borra sus lecturas (por carga_id), vuelve a guardar las versiones previas
 * del respaldo, restaura las tiendas que ya existían y quita las que la carga dio de alta y quedaron sin lecturas.
 * Si una clave del respaldo ya pertenece a otra carga posterior, aborta: primero se revierte la posterior.
 */
export async function revertirCarga(db: Db, cargaIds: string[], respaldo: Respaldo, tiendasCarga: number[]) {
  await db.query('begin');
  try {
    for (const p of respaldo.lecturas) {
      const r = (
        await db.query<{ carga_id: string }>(
          `select carga_id::text carga_id from public.analytics_lecturas
           where fuente = $1 and company_id = $2 and fecha = $3`,
          [p.fuente, p.company_id, p.fecha],
        )
      ).rows[0];
      if (r && !cargaIds.includes(r.carga_id))
        throw new Error(
          `${p.fuente}|${p.company_id}|${p.fecha} pertenece a otra carga (${r.carga_id}); revertir esa primero`,
        );
    }
    const borradas = Number(
      (
        await db.query<{ n: string }>(
          `with b as (delete from public.analytics_lecturas where carga_id::text = any($1) returning 1)
           select count(*) n from b`,
          [cargaIds],
        )
      ).rows[0].n,
    );
    const restauradas = await guardarLecturas(
      db,
      respaldo.lecturas.map(({ cargado_en: _c, ...l }) => l),
    );
    for (const t of respaldo.tiendas)
      await db.query(
        `update public.analytics_tiendas set nombre = $2, relaciones = $3, verificado_en = $4 where company_id = $1`,
        [t.company_id, t.nombre, t.relaciones, t.verificado_en],
      );
    const previas = new Set(respaldo.tiendas.map((t) => t.company_id));
    const tiendasBorradas = Number(
      (
        await db.query<{ n: string }>(
          `with b as (delete from public.analytics_tiendas t where t.company_id = any($1)
             and not exists (select 1 from public.analytics_lecturas l where l.company_id = t.company_id)
             returning 1)
           select count(*) n from b`,
          [tiendasCarga.filter((c) => !previas.has(c))],
        )
      ).rows[0].n,
    );
    await db.query('commit');
    return { borradas, restauradas, tiendasBorradas };
  } catch (e) {
    await db.query('rollback');
    throw e;
  }
}
