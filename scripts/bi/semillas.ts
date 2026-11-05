import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Genera la migración 41 (semillas del BI) desde la evidencia de Zoho en docs/bi/zoho/.
 * No se edita a mano la migración: se corre `npx.cmd tsx scripts/bi/semillas.ts` de nuevo.
 */

const ORIGEN = 'zoho-2026-11-05';
const DESDE_INICIAL = '2024-01-01';
const LOTE = 100;

export interface EntradaSemillas {
  tiendas: string;
  productos: string;
  pagos: { mapeo: { metodo_pos: string; tipo_pos: string; smartphone: boolean; etiqueta: string }[] };
  configuradas: { companyId: number; lookerStoreId: number }[];
}

export interface SalidaSemillas {
  sql: string;
  tiendasSinConfig: number[];
  configSinZoho: number[];
  conflictos: string[];
  resumen: { tiendas: number; clasificaciones: number; codigos: number; pagos: number };
}

/** Texto separado por «|» con el encabezado en la primera línea. No recorta los valores. */
export function leerPsv(texto: string): Record<string, string>[] {
  const lineas = texto.split(/\r?\n/).filter((l) => l !== '');
  if (lineas.length === 0) return [];
  const cols = lineas[0].split('|');
  return lineas.slice(1).map((l) => {
    const v = l.split('|');
    return Object.fromEntries(cols.map((c, i) => [c, v[i] ?? '']));
  });
}

const q = (s: string) => `'${s.replace(/'/g, "''")}'`;
const qn = (s: string | null) => (s === null ? 'null' : q(s));
const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function insertar(tabla: string, columnas: string, filas: string[]): string {
  const bloques: string[] = [];
  for (let i = 0; i < filas.length; i += LOTE) {
    bloques.push(
      `insert into public.${tabla} (${columnas}) values\n${filas.slice(i, i + LOTE).join(',\n')}\non conflict do nothing;`,
    );
  }
  return bloques.join('\n\n');
}

interface Clasif {
  categoria: string;
  grupo: string;
  cafe: string | null;
  promocion: string;
  primera: string;
  unidades: number;
}

export function generarSemillas(e: EntradaSemillas): SalidaSemillas {
  // Tiendas
  const porStore = new Map(e.configuradas.map((c) => [c.lookerStoreId, c.companyId]));
  const tiendas: { company: number; fila: string }[] = [];
  const tiendasSinConfig: number[] = [];
  const vistas = new Set<number>();
  for (const t of leerPsv(e.tiendas)) {
    const store = Number(t.store_id);
    const company = porStore.get(store);
    if (company === undefined) {
      tiendasSinConfig.push(store);
      continue;
    }
    vistas.add(company);
    tiendas.push({
      company,
      fila: `(${company}, ${store}, ${q(t.nombre_de_tienda)}, ${qn(t.franquiciatario === '' ? null : t.franquiciatario)}, ${q(t.franquicia_o_propia)}, ${q(t.primera_venta_zoho)}, 'zoho')`,
    });
  }
  tiendas.sort((a, b) => a.company - b.company);
  tiendasSinConfig.sort((a, b) => a - b);
  const configSinZoho = e.configuradas
    .map((c) => c.companyId)
    .filter((c) => !vistas.has(c))
    .sort((a, b) => a - b);

  // Productos: clave = default_code o el nombre exacto cuando viene vacío (como el POS)
  const porCodigo = new Map<string, Map<string, Clasif>>();
  for (const p of leerPsv(e.productos)) {
    const codigo = p.default_code !== '' ? p.default_code : p.product;
    if (codigo === '') continue;
    const cafe = p.contiene_cafe === '' || p.contiene_cafe === 'No definido' ? null : p.contiene_cafe;
    const clave = JSON.stringify([p.categoria_master, p.comida_bebida_combo_merch, cafe, p.promocion]);
    const mapa = porCodigo.get(codigo) ?? new Map<string, Clasif>();
    porCodigo.set(codigo, mapa);
    const previa = mapa.get(clave);
    const unidades = Number(p.unidades) || 0;
    if (previa) {
      if (p.primera < previa.primera) previa.primera = p.primera;
      previa.unidades += unidades;
    } else {
      mapa.set(clave, {
        categoria: p.categoria_master,
        grupo: p.comida_bebida_combo_merch,
        cafe,
        promocion: p.promocion,
        primera: p.primera,
        unidades,
      });
    }
  }

  const conflictos: string[] = [];
  const clasifs: { codigo: string; desde: string; fila: string }[] = [];
  for (const [codigo, mapa] of porCodigo) {
    // Por fecha de primera venta; ante empate gana la de más unidades
    const ordenadas = [...mapa.values()].sort((a, b) => cmp(a.primera, b.primera) || b.unidades - a.unidades);
    const elegidas: Clasif[] = [];
    for (const c of ordenadas) {
      const ultima = elegidas[elegidas.length - 1];
      if (ultima && ultima.primera === c.primera) {
        conflictos.push(
          `${codigo}: dos clasificaciones desde ${c.primera}; se conserva ${ultima.categoria}/${ultima.grupo} (${ultima.unidades} unidades) y se descarta ${c.categoria}/${c.grupo} (${c.unidades})`,
        );
        continue;
      }
      elegidas.push(c);
    }
    elegidas.forEach((c, i) => {
      const desde = i === 0 ? DESDE_INICIAL : c.primera;
      clasifs.push({
        codigo,
        desde,
        fila: `(${q(codigo)}, ${q(desde)}, ${q(c.categoria)}, ${q(c.grupo)}, ${qn(c.cafe)}, ${q(c.promocion)}, ${q(ORIGEN)})`,
      });
    });
  }
  clasifs.sort((a, b) => cmp(a.codigo, b.codigo) || cmp(a.desde, b.desde));
  conflictos.sort();

  // Pagos
  const pagos = [...e.pagos.mapeo].sort(
    (a, b) => cmp(a.metodo_pos, b.metodo_pos) || cmp(a.tipo_pos, b.tipo_pos) || Number(a.smartphone) - Number(b.smartphone),
  );

  const encabezado = [
    '-- Migración 41: semillas del BI (tiendas, clasificación de productos y mapeo de pagos).',
    '-- Archivo GENERADO por scripts/bi/semillas.ts desde docs/bi/zoho/ (extraído de Zoho el 2026-11-05). No editar a mano:',
    '-- se corrige la evidencia o el script y se vuelve a generar. Es idempotente (on conflict do nothing).',
  ].join('\n');
  const sql =
    [
      encabezado,
      insertar(
        'bi_tiendas',
        'company_id, store_id, nombre, franquiciatario, tipo, fecha_apertura, origen_apertura',
        tiendas.map((t) => t.fila),
      ),
      insertar(
        'bi_clasificacion_producto',
        'codigo, vigente_desde, categoria_master, grupo, contiene_cafe, promocion, origen',
        clasifs.map((c) => c.fila),
      ),
      insertar(
        'bi_mapeo_pago',
        'metodo_pos, tipo_pos, smartphone, etiqueta',
        pagos.map((p) => `(${q(p.metodo_pos)}, ${q(p.tipo_pos)}, ${p.smartphone}, ${q(p.etiqueta)})`),
      ),
    ]
      .join('\n\n') + '\n';

  return {
    sql,
    tiendasSinConfig,
    configSinZoho,
    conflictos,
    resumen: { tiendas: tiendas.length, clasificaciones: clasifs.length, codigos: porCodigo.size, pagos: pagos.length },
  };
}

async function main() {
  const raiz = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
  const { sucursalesConfiguradas } = await import('../../lib/sucursales/config');
  const leer = (f: string) => readFileSync(join(raiz, 'docs/bi/zoho', f), 'utf8');
  const r = generarSemillas({
    tiendas: leer('tiendas-zoho.psv'),
    productos: leer('productos-zoho.psv'),
    pagos: JSON.parse(leer('pagos.json')),
    configuradas: sucursalesConfiguradas,
  });
  writeFileSync(join(raiz, 'supabase/migrations/20261105000041_bi_semillas.sql'), r.sql, 'utf8');
  console.log('Resumen:', JSON.stringify(r.resumen));
  console.log('tiendasSinConfig (store_id):', JSON.stringify(r.tiendasSinConfig));
  console.log('configSinZoho (companyId):', JSON.stringify(r.configSinZoho));
  console.log('conflictos:', JSON.stringify(r.conflictos, null, 2));
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
