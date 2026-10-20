import { createHash, randomUUID } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import { ClienteZoho, ErrorZoho, leerEnvLocal } from './cliente';
import { TAMANO_MAXIMO, TIPOS_ARCHIVO } from '../../lib/crm/validacion';

/**
 * Copia los archivos de Zoho (adjuntos y campos de archivo) al bucket privado crm-archivos.
 * Zoho solo se lee. Idempotente por zoho_attachment_id. Requiere DATABASE_URL y SUPABASE_SECRET_KEY.
 *
 *   npx tsx scripts/zoho/archivos.ts inventario          cuenta y clasifica, sin descargar
 *   npx tsx scripts/zoho/archivos.ts copiar --limite 5   piloto
 *   npx tsx scripts/zoho/archivos.ts copiar              todos
 */
type Destino = {
  columna: 'tienda_id' | 'prospecto_id' | 'contacto_id' | 'nota_id';
  id: string;
  modulo: string;
};
interface Candidato {
  clave: string;
  nombre: string;
  tamano: number;
  ruta: string;
  destino: Destino;
  seccion: string;
  campo: string | null;
  zohoFileId: string | null;
  creado: string | null;
}

const MIME_POR_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  xml: 'application/xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};
const mimeDe = (nombre: string, tipo: string | null) => {
  const ext = /\.([a-z0-9]{1,5})$/i.exec(nombre)?.[1]?.toLowerCase();
  if (ext && MIME_POR_EXT[ext]) return MIME_POR_EXT[ext];
  const t = tipo?.split(';')[0].trim().toLowerCase();
  return t && TIPOS_ARCHIVO[t] ? t : null;
};
/** Zoho guarda algunos nombres en NFD y con UTF-8 leído como Latin-1 ("PresentaciÃ³n"): se reparan. */
export const nombreLimpio = (v: unknown) => {
  const n =
    String(v ?? '')
      .normalize('NFC')
      .trim() || 'archivo';
  if (!/[ÃÂ]/.test(n)) return n;
  const d = Buffer.from(n, 'latin1').toString('utf8').normalize('NFC');
  return d.includes('�') ? n : d;
};
const idDe = (v: unknown) =>
  v && typeof v === 'object' && 'id' in v ? String((v as { id: unknown }).id) : null;

async function inventario(z: ClienteZoho, db: pg.Client) {
  const destinos = new Map<string, Destino>();
  for (const [tabla, columna, modulo] of [
    ['crm_tiendas', 'tienda_id', 'Franquicias'],
    ['crm_prospectos', 'prospecto_id', 'Leads'],
    ['crm_contactos', 'contacto_id', 'Contacts'],
    ['crm_notas', 'nota_id', 'Notes'],
  ] as const) {
    const r = await db.query<{ id: string; z: string }>(
      `select id, zoho_record_id z from public.${tabla} where zoho_record_id is not null`,
    );
    for (const f of r.rows) destinos.set(f.z, { columna, id: f.id, modulo });
  }

  // Campos de archivo de Tiendas, desde el staging de la última corrida completa.
  const st = await db.query<{ payload: Record<string, unknown> }>(
    `select r.payload from zoho_staging.registros r join zoho_staging.importaciones i on i.id = r.import_run_id
     where r.modulo = 'Franquicias' and i.id = (select id from zoho_staging.importaciones
       where tipo = 'completa' and estado = 'completa' order by iniciada_en desc limit 1)`,
  );
  const candidatos: Candidato[] = [];
  const omitidos: Record<string, number> = {};
  const omitir = (motivo: string) => (omitidos[motivo] = (omitidos[motivo] ?? 0) + 1);
  const porTienda = new Map<string, Set<string>>();
  for (const { payload: t } of st.rows) {
    const destino = destinos.get(String(t.id));
    if (!destino) continue;
    for (const campo of ['Proyecto_3D', 'Proyecto_Ejecutivo']) {
      for (const a of (Array.isArray(t[campo]) ? t[campo] : []) as Record<string, unknown>[]) {
        const nombre = nombreLimpio(a.File_Name__s);
        const tamano = Number(a.Size__s ?? 0);
        const firmas = porTienda.get(destino.id) ?? new Set();
        firmas.add(nombre);
        porTienda.set(destino.id, firmas);
        if (tamano === 0) {
          omitir('vacío en Zoho (0 bytes)');
          continue;
        }
        candidatos.push({
          clave: `campo:${a.id}`,
          nombre,
          tamano,
          ruta: `/crm/v8/Franquicias/${t.id}/actions/download_fields_attachment?fields_attachment_id=${a.id}`,
          destino,
          seccion: 'Información Proyecto',
          campo,
          zohoFileId: a.File_Id__s ? String(a.File_Id__s) : null,
          creado: a.Created_Time__s ? String(a.Created_Time__s) : null,
        });
      }
    }
  }

  const adjuntos = await z.coqlTodo<Record<string, unknown>>(
    'select id, File_Name, Size, Parent_Id, Created_Time',
    'Attachments',
    'id is not null',
  );
  for (const a of adjuntos) {
    const padre = idDe(a.Parent_Id);
    const destino = padre ? destinos.get(padre) : undefined;
    if (!destino) {
      omitir('registro fuera de alcance (Cuentas, Prospectos_Expansion)');
      continue;
    }
    const nombre = nombreLimpio(a.File_Name);
    const tamano = Number(a.Size ?? 0);
    // Zoho lista también como adjunto el archivo de un campo: se conserva una sola copia (la del campo).
    if (destino.columna === 'tienda_id' && porTienda.get(destino.id)?.has(nombre)) {
      omitir('duplicado de un campo de archivo');
      continue;
    }
    // Zoho los lista, pero su descarga llega vacía (verificado con muestras): no hay contenido que copiar.
    if (tamano === 0) {
      omitir('vacío en Zoho (0 bytes)');
      continue;
    }
    candidatos.push({
      clave: String(a.id),
      nombre,
      tamano,
      ruta: `/crm/v8/${destino.modulo}/${padre}/Attachments/${a.id}`,
      destino,
      seccion: 'adjuntos',
      campo: null,
      zohoFileId: null,
      creado: a.Created_Time ? String(a.Created_Time) : null,
    });
  }
  return { candidatos, omitidos, adjuntosZoho: adjuntos.length };
}

/** Piloto variado: archivos de campo y adjuntos de tiendas, prospectos, contactos y notas. */
function elegir(c: Candidato[], limite: number) {
  const grupos = [
    c.filter((x) => x.campo === 'Proyecto_3D'),
    c.filter((x) => x.campo === 'Proyecto_Ejecutivo'),
    ...(['tienda_id', 'prospecto_id', 'contacto_id', 'nota_id'] as const).map((col) =>
      c.filter((x) => !x.campo && x.destino.columna === col),
    ),
  ];
  const elegidos: Candidato[] = [];
  while (elegidos.length < limite && grupos.some((g) => g.length))
    for (const g of grupos) if (g.length && elegidos.length < limite) elegidos.push(g.shift()!);
  return elegidos;
}

async function main() {
  const [comando] = process.argv.slice(2);
  const i = process.argv.indexOf('--limite');
  const limite = i > 0 ? Number(process.argv[i + 1]) : null;
  const env = await leerEnvLocal();
  for (const k of ['DATABASE_URL', 'SUPABASE_SECRET_KEY', 'NEXT_PUBLIC_SUPABASE_URL'])
    if (!env.get(k)) throw new Error(`Falta ${k} en .env.local`);
  const z = new ClienteZoho(env);
  const db = new pg.Client({ connectionString: env.get('DATABASE_URL'), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const inv = await inventario(z, db);
    const ya = new Set(
      (
        await db.query<{ k: string }>(
          `select zoho_attachment_id k from public.crm_archivos where zoho_attachment_id is not null`,
        )
      ).rows.map((r) => r.k),
    );
    const pendientes = inv.candidatos.filter((c) => !ya.has(c.clave));
    const resumen = {
      adjuntos_en_zoho: inv.adjuntosZoho,
      candidatos: inv.candidatos.length,
      ya_copiados: inv.candidatos.length - pendientes.length,
      pendientes: pendientes.length,
      bytes_pendientes: pendientes.reduce((s, c) => s + c.tamano, 0),
      omitidos: inv.omitidos,
      por_destino: pendientes.reduce<Record<string, number>>(
        (a, c) => ((a[c.campo ?? c.destino.columna] = (a[c.campo ?? c.destino.columna] ?? 0) + 1), a),
        {},
      ),
    };
    if (comando === 'inventario') {
      console.log(JSON.stringify(resumen, null, 2));
      return;
    }
    if (comando !== 'copiar') throw new Error('Comando: inventario | copiar [--limite N]');

    const lote = limite ? elegir(pendientes, limite) : pendientes;
    const supa = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const run = randomUUID();
    await db.query(
      `insert into zoho_staging.importaciones (id, tipo, snapshot) values ($1, 'archivos', now())`,
      [run],
    );
    await db.query(`select set_config('app.origen', 'importacion', false)`);
    const r = { copiados: 0, bytes: 0, rechazados: [] as string[], errores: [] as string[] };
    for (const c of lote) {
      try {
        const { datos, tipo } = await z.descargar(c.ruta);
        const mime = mimeDe(c.nombre, tipo);
        if (!mime) {
          r.rechazados.push(`tipo no permitido (${tipo ?? 'desconocido'})`);
          continue;
        }
        if (datos.length === 0 || datos.length > TAMANO_MAXIMO) {
          r.rechazados.push(`tamaño fuera de rango (${datos.length} bytes)`);
          continue;
        }
        const fila = await db.query<{ id: string; ruta: string }>(
          `insert into public.crm_archivos (nombre, mime, tamano, sha256, seccion, campo, ${c.destino.columna},
             zoho_attachment_id, zoho_file_id, zoho_org_id, zoho_module_api_name, zoho_created_at, imported_at, import_run_id)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now(), $13)
           on conflict (zoho_attachment_id) do nothing returning id, ruta`,
          [
            c.nombre,
            mime,
            datos.length,
            createHash('sha256').update(datos).digest('hex'),
            c.seccion,
            c.campo,
            c.destino.id,
            c.clave,
            c.zohoFileId,
            env.get('ZOHO_ORG_ID') ?? null,
            c.destino.modulo,
            c.creado,
            run,
          ],
        );
        if (!fila.rows[0]) continue;
        const subida = await supa.storage
          .from('crm-archivos')
          .upload(fila.rows[0].ruta, datos, { contentType: mime, upsert: false });
        if (subida.error) {
          await db.query(`delete from public.crm_archivos where id = $1`, [fila.rows[0].id]);
          r.errores.push(`subida: ${subida.error.message}`);
          continue;
        }
        r.copiados++;
        r.bytes += datos.length;
      } catch (e) {
        r.errores.push(
          e instanceof ErrorZoho
            ? `${e.status} ${e.code} ${e.ruta.replace(/\/\d+/g, '/…')}`
            : (e as Error).message,
        );
      }
    }
    // Una entrada por archivo en el historial sería ruido de la importación.
    await db.query(`delete from public.crm_historial where origen = 'importacion' and accion = 'archivo'`);
    await db.query(
      `update zoho_staging.importaciones set estado = $2, terminada_en = now(), conteos = $3, errores = $4 where id = $1`,
      [
        run,
        r.errores.length ? 'fallida' : 'completa',
        JSON.stringify({ ...resumen, copiados: r.copiados, bytes: r.bytes }),
        JSON.stringify([...r.rechazados, ...r.errores]),
      ],
    );
    console.log(
      JSON.stringify({ import_run_id: run, lote: lote.length, ...r, llamadas_zoho: z.llamadas }, null, 2),
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1]?.endsWith('archivos.ts'))
  main().catch((e: Error) => {
    console.error(e instanceof ErrorZoho ? `${e.status} ${e.code} ${e.ruta}` : e.message);
    process.exit(1);
  });
