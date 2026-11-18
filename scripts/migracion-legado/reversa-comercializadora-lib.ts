import type { TablaCom } from './comercializadora-lib';
import type { Consultor } from './conexion';

/**
 * Plan 4 · Reversa del cutover (spec: "lo capturado en el nuevo se copia de regreso; solo las tablas editables").
 * migracion_lectura es de solo lectura en bliocjvq, así que la reversa no escribe: arma un SQL con solo lo que cambió
 * (upsert de lo nuevo o distinto y borrado de lo que el portal ya no tiene) para pegarlo en el SQL Editor de bliocjvq.
 */

export type Fila = Record<string, unknown>;

export interface DeltaTabla {
  tabla: string;
  llave: string[];
  secuencia?: string;
  columnas: string[];
  upserts: Fila[];
  borrar: Record<string, string | null>[];
}

/** Columnas escribibles (no generadas) de una tabla en ese lado. */
export async function columnasEscribibles(db: Consultor, tabla: string): Promise<string[]> {
  const r = await db.query<{ c: string }>(
    `select column_name c from information_schema.columns
     where table_schema = 'public' and table_name = $1 and is_generated = 'NEVER' order by ordinal_position`,
    [tabla],
  );
  return r.rows.map((f) => f.c);
}

/** Todas las filas como JSON de Postgres (la conexión ya está en UTC: conLegado / conPortalLectura). */
export async function leerFilas(db: Consultor, tabla: string): Promise<Fila[]> {
  return (await db.query<{ f: Fila }>(`select to_jsonb(x) f from public.${tabla} x`)).rows.map((r) => r.f);
}

const ordenado = (v: unknown): unknown =>
  Array.isArray(v)
    ? v.map(ordenado)
    : v && typeof v === 'object'
      ? Object.fromEntries(
          Object.keys(v as object)
            .sort()
            .map((k) => [k, ordenado((v as Fila)[k])]),
        )
      : v;
const firma = (f: Fila, cols: string[]) => JSON.stringify(cols.map((c) => ordenado(f[c] ?? null)));
const clave = (f: Fila, llave: string[]) =>
  JSON.stringify(llave.map((k) => (f[k] == null ? null : String(f[k]))));

/**
 * `columnasViejo`: las escribibles en bliocjvq. Se copian las que también trae el portal, incluidas las generadas allá
 * (com_minmax.minimo/maximo son generadas en el portal y columnas normales en el viejo).
 */
export function deltaTabla(t: TablaCom, columnasViejo: string[], portal0: Fila[], viejo: Fila[]): DeltaTabla {
  const columnas = columnasViejo.filter((c) => portal0.some((f) => c in f));
  const enViejo = new Map(viejo.map((f) => [clave(f, t.llave), f]));
  // Revisión plan 4 (I1): en la reversa el portal ya está en simulación; el modo de OC del viejo se conserva, si no
  // el viejo volvería sin OCs reales (es el espejo de la copia, que fuerza simulación en el portal).
  const portal =
    t.tabla === 'com_plan_config'
      ? portal0.map((f) => conModoDelViejo(f, enViejo.get(clave(f, t.llave))))
      : portal0;
  const enPortal = new Set(portal.map((f) => clave(f, t.llave)));
  const upserts = portal
    .filter((f) => {
      const v = enViejo.get(clave(f, t.llave));
      return !v || firma(v, columnas) !== firma(f, columnas);
    })
    .map((f) => Object.fromEntries(columnas.map((c) => [c, f[c] ?? null])));
  const borrar = viejo
    .filter((f) => !enPortal.has(clave(f, t.llave)))
    .map((f) => Object.fromEntries(t.llave.map((k) => [k, f[k] == null ? null : String(f[k])])));
  return { tabla: t.tabla, llave: t.llave, secuencia: t.secuencia, columnas, upserts, borrar };
}

function conModoDelViejo(f: Fila, v: Fila | undefined): Fila {
  const modo = (v?.config as { auto?: { modo?: unknown } } | null | undefined)?.auto?.modo;
  if (modo === undefined) return f;
  const cfg = (f.config ?? {}) as { auto?: Record<string, unknown> };
  return { ...f, config: { ...cfg, auto: { ...(cfg.auto ?? {}), modo } } };
}

const id = (s: string) => `"${s.replace(/"/g, '""')}"`;
const literal = (json: string) => {
  if (json.includes('$rev$')) throw new Error('El JSON contiene la marca $rev$; no se puede armar el SQL');
  return `$rev$${json}$rev$::jsonb`;
};

/** Un solo bloque begin…commit para el SQL Editor de bliocjvq. Vacío si no hay cambios. */
export function sqlReversa(deltas: DeltaTabla[], marca: string): string {
  const cuerpo: string[] = [];
  for (const d of deltas) {
    if (d.borrar.length)
      cuerpo.push(
        `delete from public.${id(d.tabla)} x where exists (select 1 from jsonb_array_elements(${literal(JSON.stringify(d.borrar))}) e\n` +
          `  where ${d.llave.map((k) => `e ->> '${k.replace(/'/g, "''")}' = x.${id(k)}::text`).join(' and ')});`,
      );
    if (d.upserts.length) {
      const cols = d.columnas.map(id).join(', ');
      const resto = d.columnas.filter((c) => !d.llave.includes(c));
      cuerpo.push(
        `insert into public.${id(d.tabla)} (${cols}) overriding system value\n` +
          `select ${cols} from jsonb_populate_recordset(null::public.${id(d.tabla)}, ${literal(JSON.stringify(d.upserts))})\n` +
          `on conflict (${d.llave.map(id).join(', ')}) do ${resto.length ? `update set ${resto.map((c) => `${id(c)} = excluded.${id(c)}`).join(', ')}` : 'nothing'};`,
      );
      if (d.secuencia)
        cuerpo.push(
          `select setval(pg_get_serial_sequence('public.${d.tabla}', '${d.secuencia}'), m)\n` +
            `from (select max(${id(d.secuencia)}) m from public.${id(d.tabla)}) x where m is not null;`,
        );
    }
  }
  if (!cuerpo.length) return '';
  return [
    `-- Reversa Comercializadora ${marca}: portal → bliocjvq (solo tablas editables). Pegar completo.`,
    'begin;',
    "set local app.origen = 'migracion';",
    ...cuerpo,
    'commit;',
    '',
  ].join('\n');
}

export function reporteReversa(deltas: DeltaTabla[]): string {
  return deltas
    .map((d) => `${d.tabla.padEnd(30)} a escribir ${d.upserts.length} · a borrar ${d.borrar.length}`)
    .join('\n');
}
