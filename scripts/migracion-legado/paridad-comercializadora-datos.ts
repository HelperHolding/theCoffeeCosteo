import type { Consultor } from './conexion';
import type { AccionOv, Lado } from './paridad-comercializadora-lib';

/**
 * Plan 4 · Lecturas de la paridad. Mismo SQL en los dos lados (bliocjvq y portal tienen las mismas tablas com_*).
 * Solo select: se corre dentro de conLegado / conPortalLectura (begin read only).
 */

/** Firma de las entradas por SKU que usa com-minmax (catálogo, lead time, manuales y kit). */
const SQL_FIRMAS_SKU = `
  select c.sku, md5(concat_ws('|', c.estatus, trim_scale(c.cantidad_por_apertura)::text, trim_scale(c.dias_seguridad)::text,
           c.zoho_lead_time::text, lt.dias::text, trim_scale(mm.minimo_manual)::text, trim_scale(mm.maximo_manual)::text,
           trim_scale(k.manual)::text)) firma
  from public.com_catalogo c
  left join public.com_lead_times lt on lt.sku = c.sku
  left join public.com_minmax mm on mm.sku = c.sku
  left join public.com_kit_apertura k on k.sku = c.sku`;

/** Firma por proveedor: mínimo de compra y cierres vigentes ese día. */
const SQL_FIRMAS_PROV = `
  select z.vendor_id, md5(concat_ws('|', trim_scale(z.minimo_compra)::text,
           (select string_agg(concat_ws(',', c.ini::text, c.fin::text, array_to_string(c.skus, ';')), '/' order by c.ini, c.id)
            from public.com_proveedor_cierre c
            where c.vendor_id = z.vendor_id and not c.cancelado and c.fin >= $1::date))) firma
  from public.com_zoho_proveedor z`;

/** Firma global: configuración sin auto.modo (viejo en real, portal en simulación), parámetros y mapeo. */
const SQL_FIRMA_GLOBAL = `
  select md5(concat_ws('|',
    (select (config #- '{auto,modo}')::text from public.com_plan_config where id = 1),
    (select string_agg(clave || '=' || trim_scale(valor)::text, ',' order by clave) from public.com_parametros),
    (select string_agg(shopify_nombre || '=' || sku, ',' order by shopify_nombre) from public.com_sku_mapping))) firma`;

/**
 * `modo` = cómo guarda ese lado la OC automática del cron: el viejo 'real' (creada, o error si Zoho falló: igual era
 * su propuesta) y el portal 'simulacion' (simulada). `fecha` = día de CDMX (AAAA-MM-DD).
 */
export async function leerLado(db: Consultor, fecha: string, modo: 'real' | 'simulacion'): Promise<Lado> {
  const minmax = await db.query<{ sku: string; minimo: number | null; maximo: number | null; calculado_at: string | null }>(
    `select sku, coalesce(minimo_manual, minimo_calc)::float8 minimo, coalesce(maximo_manual, maximo_calc)::float8 maximo,
            calculado_at::text calculado_at
     from public.com_minmax order by sku`,
  );
  const ocs = await db.query<{ vendor_id: string | null; vendor_name: string | null; lineas: unknown }>(
    `select vendor_id, vendor_name, lineas from public.com_oc_auto
     where fecha = $1::date and origen = 'cron' and modo = $2
       and estado = any(case when $2 = 'real' then array['creada', 'error'] else array['simulada'] end)
     order by id`,
    [fecha, modo],
  );
  const corridas = await db.query<{ proceso: string; ok: boolean | null }>(
    `select proceso, ok from public.com_sync_log
     where proceso in ('com-minmax', 'zoho-generar-oc') and fin is not null
       and (inicio at time zone 'America/Mexico_City')::date = $1::date`,
    [fecha],
  );
  const sku = await db.query<{ sku: string; firma: string }>(SQL_FIRMAS_SKU);
  const prov = await db.query<{ vendor_id: string; firma: string }>(SQL_FIRMAS_PROV, [fecha]);
  const global = await db.query<{ firma: string }>(SQL_FIRMA_GLOBAL);
  const lineas = (x: unknown) =>
    (Array.isArray(x) ? x : typeof x === 'string' ? (JSON.parse(x) as unknown[]) : []).map((l) => {
      const o = l as { sku?: unknown; cantidad?: unknown };
      return { sku: String(o.sku), cantidad: Number(o.cantidad) };
    });
  return {
    minmax: minmax.rows.map((f) => ({
      ...f,
      minimo: f.minimo == null ? null : Number(f.minimo),
      maximo: f.maximo == null ? null : Number(f.maximo),
    })),
    ocs: ocs.rows.map((o) => ({ vendor_id: o.vendor_id, vendor_name: o.vendor_name, lineas: lineas(o.lineas) })),
    corridas: corridas.rows,
    firmasSku: Object.fromEntries(sku.rows.map((f) => [f.sku, f.firma])),
    firmasProv: Object.fromEntries(prov.rows.map((f) => [f.vendor_id, f.firma])),
    firmaGlobal: global.rows[0]?.firma ?? '',
  };
}

export interface VentaVieja {
  id: string;
  folio: string;
  estado: string | null;
}

/** Filas venta del viejo (lado bliocjvq). */
export async function leerVentasViejas(db: Consultor): Promise<VentaVieja[]> {
  return (
    await db.query<VentaVieja>(
      `select id, folio, estado from public.com_movimientos where tipo = 'venta' and folio is not null order by id`,
    )
  ).rows;
}

/** Lo que la derivación del portal (com_ov_plan) haría sobre las filas del viejo. Lado portal, solo lectura. */
export async function planOv(db: Consultor, existentes: VentaVieja[], ventanaDias = 45): Promise<AccionOv[]> {
  return (
    await db.query<AccionOv>(
      `select accion, folio, sku, estado_antes, estado from public.com_ov_plan($1::jsonb, $2)
       order by accion, folio, sku nulls first`,
      [JSON.stringify(existentes), ventanaDias],
    )
  ).rows;
}
