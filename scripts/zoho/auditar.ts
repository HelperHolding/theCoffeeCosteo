import { writeFile } from 'node:fs/promises';
import { ClienteZoho, ErrorZoho, leerEnvLocal } from './cliente';
import { EXCLUIDOS, leerRegistros } from './registros';

/**
 * Auditoría read-only de los módulos en alcance. Lee registros completos en memoria y
 * escribe SOLO agregados (conteos, distribuciones de catálogos, rangos de fechas) en el JSON
 * de salida. Usuarios anonimizados; credenciales excluidas; ningún valor libre de texto sale.
 *
 * Uso: npx tsx scripts/zoho/auditar.ts <salida.json>
 */
const MODULOS = ['Leads', 'Contacts', 'Accounts', 'Franquicias', 'Tasks'] as const;
type Modulo = (typeof MODULOS)[number];
/** Tipos cuyo valor es un catálogo (no texto libre) y pueden reportarse por valor. */
const CATALOGO = new Set(['picklist', 'multiselectpicklist', 'boolean', 'layout']);

type Campo = {
  api_name: string;
  field_label: string;
  data_type: string;
  json_type: string;
  read_only?: boolean;
  field_read_only?: boolean;
  system_mandatory?: boolean;
  custom_field?: boolean;
  length?: number;
  lookup?: { module?: { api_name?: string } };
  pick_list_values?: { display_value: string; actual_value: string; sequence_number: number }[];
};
type Registro = Record<string, unknown>;
type Seccion = { name: string; fields?: { api_name: string; required?: boolean }[] };
type Layout = { name: string; status?: string; sections?: Seccion[] };
type Usuario = { id: string; status?: string; role?: { name?: string }; profile?: { name?: string } };

const contar = (m: Record<string, number>, k: string, n = 1) => ((m[k] = (m[k] ?? 0) + n), m);

function clase(v: unknown, presente: boolean): string {
  if (!presente) return 'ausente';
  if (v === null || v === undefined) return 'nulo';
  if (v === '') return 'texto_vacio';
  if (Array.isArray(v)) return v.length ? 'valor' : 'lista_vacia';
  if (v === false) return 'false';
  if (v === true) return 'true';
  if (v === 0) return 'cero';
  return 'valor';
}

/** Clave para contar valores únicos sin guardar el valor (hash simple, no reversible a la salida). */
function clave(v: unknown): string {
  if (v && typeof v === 'object' && !Array.isArray(v) && 'id' in v) return String((v as { id: unknown }).id);
  if (Array.isArray(v))
    return v
      .map((x) =>
        x && typeof x === 'object' ? String((x as Registro).id ?? (x as Registro).name ?? '') : String(x),
      )
      .sort()
      .join('|');
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

function idDe(v: unknown): string | null {
  return v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null;
}

function extension(nombre: unknown): string {
  const m = /\.([a-z0-9]{1,6})$/i.exec(String(nombre ?? ''));
  return m ? m[1].toLowerCase() : '(sin extensión)';
}

async function main() {
  const salida = process.argv[2];
  if (!salida) throw new Error('Uso: npx tsx scripts/zoho/auditar.ts <salida.json>');
  const z = new ClienteZoho(await leerEnvLocal());
  const errores: string[] = [];
  const inicio = new Date().toISOString();

  // Usuarios: alias estable por orden de id; los nombres nunca salen.
  const usuarios = (
    (await z.get<{ users?: Usuario[] }>('/crm/v8/users?type=AllUsers&per_page=200'))?.users ?? []
  ).sort((a, b) => a.id.localeCompare(b.id));
  const alias = new Map(usuarios.map((u, i) => [u.id, `Usuario ${String(i + 1).padStart(2, '0')}`]));
  const aliasDe = (v: unknown) =>
    idDe(v) ? (alias.get(idDe(v)!) ?? 'Usuario externo/desconocido') : '(vacío)';
  const roles = ((await z.get<{ roles?: { name: string }[] }>('/crm/v8/settings/roles'))?.roles ?? []).map(
    (r) => r.name,
  );
  const perfiles = (
    (await z.get<{ profiles?: { name: string }[] }>('/crm/v8/settings/profiles'))?.profiles ?? []
  ).map((p) => p.name);

  const registros = new Map<Modulo, Registro[]>();
  const modulos: Record<string, unknown> = {};
  const propiedad: Record<string, Record<string, Record<string, number>>> = {};
  const excluidosDe = new Map<Modulo, string[]>();

  for (const m of MODULOS) {
    const todos = (await z.get<{ fields?: Campo[] }>(`/crm/v8/settings/fields?module=${m}`))?.fields ?? [];
    excluidosDe.set(
      m,
      todos.filter((c) => EXCLUIDOS.has(c.api_name)).map((c) => c.api_name),
    );
    const campos = todos.filter((c) => !EXCLUIDOS.has(c.api_name));
    const layouts =
      (await z.get<{ layouts?: Layout[] }>(`/crm/v8/settings/layouts?module=${m}`))?.layouts ?? [];
    const enLayout = new Map<string, { layout: string; seccion: string; requerido: boolean }[]>();
    for (const l of layouts)
      for (const s of l.sections ?? [])
        for (const f of s.fields ?? [])
          enLayout.set(f.api_name, [
            ...(enLayout.get(f.api_name) ?? []),
            { layout: l.name, seccion: s.name, requerido: !!f.required },
          ]);

    const total = Number(
      ((await z.coql<{ 'COUNT(id)': number }>(`select COUNT(id) from ${m} where id is not null`))?.data ??
        [])[0]?.['COUNT(id)'] ?? -1,
    );
    const inaccesibles = new Set<string>();
    const filas = await leerRegistros(
      z,
      m,
      campos.map((c) => c.api_name),
      inaccesibles,
    );
    registros.set(m, filas);

    const resumenCampos = campos.map((c) => {
      const clases: Record<string, number> = {};
      const unicos = new Set<string>();
      const valores: Record<string, number> = {};
      let fechaMin: string | null = null;
      let fechaMax: string | null = null;
      let largoMax = 0;
      const archivos = { archivos: 0, bytes: 0, maxBytes: 0, ext: {} as Record<string, number> };
      for (const f of filas) {
        const presente = Object.prototype.hasOwnProperty.call(f, c.api_name);
        const v = f[c.api_name];
        const k = clase(v, presente);
        contar(clases, k);
        if (k !== 'valor' && k !== 'true' && k !== 'cero') {
          if (CATALOGO.has(c.data_type) && k === 'false') contar(valores, 'false');
          continue;
        }
        unicos.add(clave(v));
        if (CATALOGO.has(c.data_type)) {
          for (const x of Array.isArray(v) ? v : [v])
            contar(valores, typeof x === 'object' && x ? String((x as Registro).name ?? '') : String(x));
        }
        if (c.data_type === 'date' || c.data_type === 'datetime') {
          const s = String(v).slice(0, 10);
          if (!fechaMin || s < fechaMin) fechaMin = s;
          if (!fechaMax || s > fechaMax) fechaMax = s;
        }
        if (typeof v === 'string') largoMax = Math.max(largoMax, v.length);
        if (c.data_type === 'fileupload' && Array.isArray(v)) {
          for (const a of v as Registro[]) {
            const b = Number(a.Size__s ?? 0);
            archivos.archivos++;
            archivos.bytes += b;
            archivos.maxBytes = Math.max(archivos.maxBytes, b);
            contar(archivos.ext, extension(a.File_Name__s));
          }
        }
      }
      const llenos = (clases.valor ?? 0) + (clases.true ?? 0) + (clases.cero ?? 0);
      const opciones = (c.pick_list_values ?? []).filter((p) => p.display_value !== '-None-');
      return {
        api_name: c.api_name,
        field_label: c.field_label,
        data_type: c.data_type,
        custom: !!c.custom_field,
        read_only: !!(c.read_only || c.field_read_only),
        system_mandatory: !!c.system_mandatory,
        length: c.length,
        lookup: c.lookup?.module?.api_name ?? null,
        layouts: enLayout.get(c.api_name) ?? [],
        inaccesible: inaccesibles.has(c.api_name),
        clases,
        llenos,
        unicos: unicos.size,
        // Usuarios: distribución anonimizada en `propiedad`, no aquí.
        valores: CATALOGO.has(c.data_type) ? valores : undefined,
        opciones: opciones.length ? opciones.map((p) => p.display_value) : undefined,
        opciones_sin_uso: opciones.length
          ? opciones.filter((p) => !valores[p.display_value]).map((p) => p.display_value)
          : undefined,
        fecha_min: fechaMin,
        fecha_max: fechaMax,
        largo_max: c.data_type === 'text' || c.data_type === 'textarea' ? largoMax : undefined,
        archivos: c.data_type === 'fileupload' ? archivos : undefined,
      };
    });

    const etiquetas: Record<string, number> = {};
    for (const f of filas)
      for (const t of (Array.isArray(f.Tag) ? f.Tag : []) as Registro[]) contar(etiquetas, String(t.name));
    const catalogoEtiquetas = (
      (await z.get<{ tags?: { name: string }[] }>(`/crm/v8/settings/tags?module=${m}`))?.tags ?? []
    ).map((t) => t.name);

    for (const campoUsuario of ['Owner', 'Created_By', 'Modified_By']) {
      for (const f of filas) contar(((propiedad[m] ??= {})[campoUsuario] ??= {}), aliasDe(f[campoUsuario]));
    }

    modulos[m] = {
      total_coql: total,
      total_api: filas.length,
      conciliado: total === filas.length,
      layouts: layouts.map((l) => ({
        name: l.name,
        status: l.status,
        secciones: (l.sections ?? []).map((s) => s.name),
      })),
      campos: resumenCampos,
      etiquetas_en_uso: etiquetas,
      etiquetas_catalogo: catalogoEtiquetas,
      excluidos: excluidosDe.get(m) ?? [],
    };
  }

  // Huérfanos: lookups hacia módulos en alcance cuyo id no existe allí.
  const ids = new Map(MODULOS.map((m) => [m, new Set((registros.get(m) ?? []).map((f) => String(f.id)))]));
  const huerfanos: Record<string, { con_valor: number; huerfanos: number; destino: string }> = {};
  for (const m of MODULOS) {
    for (const c of (modulos[m] as { campos: { api_name: string; lookup: string | null }[] }).campos) {
      if (!c.lookup || !ids.has(c.lookup as Modulo)) continue;
      let con = 0;
      let sin = 0;
      for (const f of registros.get(m) ?? []) {
        const id = idDe(f[c.api_name]);
        if (!id) continue;
        con++;
        if (!ids.get(c.lookup as Modulo)!.has(id)) sin++;
      }
      huerfanos[`${m}.${c.api_name}`] = { con_valor: con, huerfanos: sin, destino: c.lookup };
    }
  }
  // Tareas: relación polimórfica What_Id + $se_module.
  const tareasRel: Record<string, { total: number; huerfanos: number }> = {};
  for (const t of registros.get('Tasks') ?? []) {
    const mod = String(t.$se_module ?? '(sin relación)');
    const id = idDe(t.What_Id);
    const fila = (tareasRel[mod] ??= { total: 0, huerfanos: 0 });
    fila.total++;
    if (id && ids.has(mod as Modulo) && !ids.get(mod as Modulo)!.has(id)) fila.huerfanos++;
  }

  // Transiciones de etapa de Tiendas desde el timeline (solo old→new del picklist Status).
  const transiciones: Record<string, number> = {};
  const fuentes: Record<string, number> = {};
  const cambiosPorCampo: Record<string, number> = {};
  let conAutomatizacion = 0;
  let tiendasConTimeline = 0;
  let historialDesde: string | null = null;
  let historialHasta: string | null = null;
  for (const t of registros.get('Franquicias') ?? []) {
    let token: string | undefined;
    let alguno = false;
    try {
      for (;;) {
        const r = await z.get<{
          __timeline?: {
            source?: string;
            audited_time?: string;
            automation_details?: unknown;
            record?: { module?: { api_name?: string } };
            field_history?: { api_name: string; _value?: { new?: unknown; old?: unknown } }[] | null;
          }[];
          info?: { more_records?: boolean; next_page_token?: string };
        }>(
          token
            ? `/crm/v8/Franquicias/${t.id}/__timeline?page_token=${encodeURIComponent(token)}`
            : `/crm/v8/Franquicias/${t.id}/__timeline?per_page=200`,
        );
        for (const e of r?.__timeline ?? []) {
          // El timeline incluye cambios de registros relacionados (p. ej. tareas): solo la tienda.
          if (e.record?.module?.api_name && e.record.module.api_name !== 'Franquicias') continue;
          const cuando = String(e.audited_time ?? '').slice(0, 10);
          if (cuando && (!historialDesde || cuando < historialDesde)) historialDesde = cuando;
          if (cuando && (!historialHasta || cuando > historialHasta)) historialHasta = cuando;
          for (const h of e.field_history ?? []) {
            contar(cambiosPorCampo, h.api_name);
            if (h.api_name !== 'Status') continue;
            alguno = true;
            contar(
              transiciones,
              `${String(h._value?.old ?? '(vacío)')} → ${String(h._value?.new ?? '(vacío)')}`,
            );
            contar(fuentes, String(e.source ?? 'desconocida'));
            if (e.automation_details) conAutomatizacion++;
          }
        }
        if (!r?.info?.more_records) break;
        token = r.info.next_page_token;
      }
    } catch (e) {
      errores.push(`timeline: ${e instanceof ErrorZoho ? `${e.status} ${e.code}` : (e as Error).message}`);
      break;
    }
    if (alguno) tiendasConTimeline++;
  }

  // COQL no devuelve $se_module en un SELECT simple; sí con GROUP BY.
  const porModulo = async (desde: string) =>
    (
      (
        await z.coql<Record<string, unknown>>(
          `select $se_module, COUNT(id) from ${desde} where id is not null group by $se_module`,
        )
      )?.data ?? []
    ).map((g) => ({ modulo: String(g.$se_module), n: Number(g['COUNT(id)']) }));

  // Notas: conteo por módulo y por registro; del contenido solo la longitud.
  const notas = await z.coqlTodo<Registro>(
    'select id, $se_module, Parent_Id, Note_Content',
    'Notes',
    'id is not null',
  );
  const notasPorModulo: Record<string, number> = {};
  const notasPorRegistro = new Map<string, number>();
  let largoNotas = 0;
  for (const g of await porModulo('Notes')) contar(notasPorModulo, g.modulo, g.n);
  for (const n of notas) {
    const p = idDe(n.Parent_Id) ?? '?';
    notasPorRegistro.set(p, (notasPorRegistro.get(p) ?? 0) + 1);
    largoNotas = Math.max(largoNotas, String(n.Note_Content ?? '').length);
  }

  // Adjuntos (related list Attachments): extensión, tamaño, duplicados por nombre+tamaño.
  let adjuntos: unknown;
  try {
    const a = await z.coqlTodo<Registro>(
      'select id, $se_module, Parent_Id, File_Name, Size',
      'Attachments',
      'id is not null',
    );
    const ext: Record<string, number> = {};
    const porMod: Record<string, number> = {};
    for (const g of await porModulo('Attachments')) contar(porMod, g.modulo, g.n);
    const firmas = new Map<string, number>();
    let bytes = 0;
    let maxBytes = 0;
    for (const x of a) {
      const b = Number(x.Size ?? 0);
      bytes += b;
      maxBytes = Math.max(maxBytes, b);
      contar(ext, extension(x.File_Name));
      const f = `${x.File_Name}|${b}`;
      firmas.set(f, (firmas.get(f) ?? 0) + 1);
    }
    adjuntos = {
      total: a.length,
      por_modulo: porMod,
      extensiones: ext,
      bytes_total: bytes,
      bytes_max: maxBytes,
      grupos_duplicados: [...firmas.values()].filter((n) => n > 1).length,
      archivos_en_duplicados: [...firmas.values()].filter((n) => n > 1).reduce((s, n) => s + n, 0),
    };
  } catch (e) {
    adjuntos = { error: e instanceof ErrorZoho ? `${e.status} ${e.code}` : (e as Error).message };
  }

  const resumenUsuarios = usuarios.map((u) => ({
    alias: alias.get(u.id),
    status: u.status,
    rol: u.role?.name ?? null,
    perfil: u.profile?.name ?? null,
    propietario_de: Object.fromEntries(MODULOS.map((m) => [m, propiedad[m]?.Owner?.[alias.get(u.id)!] ?? 0])),
  }));

  await writeFile(
    salida,
    JSON.stringify(
      {
        snapshot: inicio,
        fin: new Date().toISOString(),
        llamadas: z.llamadas,
        errores,
        roles,
        perfiles,
        usuarios: resumenUsuarios,
        propiedad,
        modulos,
        huerfanos,
        tareas_relacion: tareasRel,
        pipeline_tiendas: {
          tiendas_con_cambios_de_etapa: tiendasConTimeline,
          transiciones,
          fuentes,
          con_automatizacion: conAutomatizacion,
          historial_desde: historialDesde,
          historial_hasta: historialHasta,
          cambios_por_campo: cambiosPorCampo,
          campos_en_historial_que_ya_no_existen: Object.keys(cambiosPorCampo).filter(
            (k) =>
              !(modulos.Franquicias as { campos: { api_name: string }[] }).campos.some(
                (c) => c.api_name === k,
              ) && !EXCLUIDOS.has(k),
          ),
        },
        notas: {
          total: notas.length,
          por_modulo: notasPorModulo,
          registros_con_notas: notasPorRegistro.size,
          max_por_registro: Math.max(0, ...notasPorRegistro.values()),
          largo_max: largoNotas,
        },
        adjuntos,
      },
      null,
      2,
    ),
  );
  console.log(`Listo: ${z.llamadas} llamadas, ${errores.length} errores. Salida: ${salida}`);
}

main().catch((e: Error) => {
  console.error(e instanceof ErrorZoho ? `${e.status} ${e.code} ${e.ruta}` : e.message);
  process.exit(1);
});
