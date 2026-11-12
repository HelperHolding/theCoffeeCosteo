import type { Consultor } from './conexion';

export interface TablaCom {
  tabla: string;
  llave: string[];
  /** Columna identity a adelantar tras copiar (ids conservados del sitio viejo). */
  secuencia?: string;
  /** Las editan personas: se vuelven a copiar justo antes del cutover (plan 4). */
  editable: boolean;
}

// Plan 2, decisión 6: fuera com_credito_abonos (módulo Pedidos) y com_proveedores (sin uso).
export const TABLAS_COM: readonly TablaCom[] = [
  { tabla: 'com_catalogo', llave: ['sku'], editable: true },
  { tabla: 'com_catalogo_costo_historial', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_kit_apertura', llave: ['sku'], editable: true },
  { tabla: 'com_lead_times', llave: ['sku'], editable: true },
  { tabla: 'com_minmax', llave: ['sku'], editable: true },
  { tabla: 'com_movimientos', llave: ['id'], editable: true },
  { tabla: 'com_oc_auto', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_pago_proyectado', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_parametros', llave: ['clave'], editable: true },
  { tabla: 'com_plan_config', llave: ['id'], editable: true },
  { tabla: 'com_plan_config_historial', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_proveedor_cierre', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_sku_mapping', llave: ['id'], secuencia: 'id', editable: true },
  { tabla: 'com_sync_cambios', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_sync_log', llave: ['id'], secuencia: 'id', editable: false },
  { tabla: 'com_zoho_oc_lineas', llave: ['zoho_po_id', 'sku'], editable: false },
  { tabla: 'com_zoho_proveedor', llave: ['vendor_id'], editable: false },
];

export interface ResultadoCopia {
  tabla: string;
  origen: number;
  nuevas: number;
  actualizadas: number;
  destino: number;
}

const LOTE = 500;
const id = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function columnasPortal(db: Consultor, tabla: string): Promise<string[]> {
  const r = await db.query<{ c: string }>(
    `select column_name c from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [tabla],
  );
  return r.rows.map((f) => f.c);
}

/**
 * Upsert por llave dentro de la transacción de `db` (con app.origen = 'migracion': sin bitácora ni sellos).
 * Solo copia columnas que existen en ambos lados; los tipos los resuelve jsonb_populate_recordset.
 */
export async function copiarTabla(
  db: Consultor,
  t: TablaCom,
  filas: Record<string, unknown>[],
): Promise<{ nuevas: number; actualizadas: number }> {
  const enPortal = await columnasPortal(db, t.tabla);
  const cols = enPortal.filter((c) => filas.some((f) => c in f));
  const resto = cols.filter((c) => !t.llave.includes(c));
  let nuevas = 0;
  let actualizadas = 0;
  for (let i = 0; i < filas.length; i += LOTE) {
    const lote = filas.slice(i, i + LOTE).map((f) => Object.fromEntries(cols.map((c) => [c, f[c] ?? null])));
    const r = await db.query<{ nueva: boolean }>(
      `insert into public.${id(t.tabla)} (${cols.map(id).join(', ')}) overriding system value
       select ${cols.map(id).join(', ')} from jsonb_populate_recordset(null::public.${id(t.tabla)}, $1::jsonb)
       on conflict (${t.llave.map(id).join(', ')}) do ${resto.length ? `update set ${resto.map((c) => `${id(c)} = excluded.${id(c)}`).join(', ')}` : 'nothing'}
       returning (xmax = 0) as nueva`,
      [JSON.stringify(lote)],
    );
    for (const f of r.rows) f.nueva ? nuevas++ : actualizadas++;
  }
  if (t.secuencia)
    await db.query(
      `select setval(pg_get_serial_sequence('public.${t.tabla}', '${t.secuencia}'), m)
       from (select max(${id(t.secuencia)}) m from public.${id(t.tabla)}) x where m is not null`,
    );
  return { nuevas, actualizadas };
}

/** Plan 2, decisión 3: en el portal las OCs automáticas quedan en simulación hasta el cutover. */
export async function forzarSimulacion(db: Consultor): Promise<boolean> {
  const r = await db.query<{ id: number }>(
    `update public.com_plan_config
       set config = jsonb_set(coalesce(config, '{}'::jsonb), '{auto,modo}', '"simulacion"', true)
     where id = 1 and coalesce(config #>> '{auto,modo}', '') <> 'simulacion'
     returning id`,
  );
  return r.rows.length > 0;
}

export function reporteCopia(r: ResultadoCopia[]): string {
  return r
    .map((x) => `${x.tabla.padEnd(30)} origen ${x.origen} · nuevas ${x.nuevas} · actualizadas ${x.actualizadas} · destino ${x.destino}`)
    .join('\n');
}
