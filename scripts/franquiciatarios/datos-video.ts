// Copia de SOLO LECTURA de una sucursal para grabar los videos del módulo en el arnés visual (?franquiciatarios&grabar).
// Lee producción con las mismas funciones del portal (P&L, consumo por recetas, pedidos) y deja JSON en
// tests/portal/vista/datos-reales/ (excluido de git: son datos reales). No escribe nada en ninguna base.
//
//   npx tsx --conditions=react-server scripts/franquiciatarios/datos-video.ts <extraccion-pos.json> [companyId] [usuario-admin]
//
// <extraccion-pos.json>: salida de scripts/sucursales/explorar-api.ts extraer (pedidos crudos del POS).
// [usuario-admin]: uuid de un admin del módulo; las RPC que autorizan por sesión (recetas, nivel de servicio, Rappi del
// portal) se leen como ese usuario dentro de una transacción de solo lectura.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const RAIZ = process.cwd();
for (const l of readFileSync(join(RAIZ, '.env.local'), 'utf8').split(/\r?\n/)) {
  const i = l.indexOf('=');
  if (i > 0 && !l.startsWith('#')) process.env[l.slice(0, i)] ??= l.slice(i + 1).replace(/^"|"$/g, '');
}

const [archivoPos, companyArg, adminArg] = process.argv.slice(2);
if (!archivoPos) throw new Error('Pasa la extracción del POS (explorar-api.ts extraer).');
const COMPANY = Number(companyArg ?? 514);
const ADMIN = adminArg ?? '63e994a6-5cbc-4605-b0d0-78bde4264890';
const SALIDA = join(RAIZ, 'tests/portal/vista/datos-reales');
mkdirSync(SALIDA, { recursive: true });
const guardar = (n: string, x: unknown) => {
  writeFileSync(join(SALIDA, n), JSON.stringify(x));
  console.log('✓', n);
};

const { configDe, sucursalesConfiguradas } = await import('../../lib/sucursales/config');
const { clienteServicio } = await import('../../lib/sucursales/corte-servidor');
const { leerPedidosSucursal } = await import('../../lib/franquiciatarios/pedidos-servidor');
const { leerPyl } = await import('../../lib/franquiciatarios/pyl-servidor');
const { consumoPorDia, equivalenciasLista } = await import('../../lib/franquiciatarios/existencias-servidor');
const { diaOperacion, sumarDias } = await import('../../lib/franquiciatarios/dia');

const cfg = configDe(COMPANY);
if (!cfg) throw new Error(`Sucursal ${COMPANY} sin configuración.`);
const db = clienteServicio();
if (!db) throw new Error('Falta la llave de servicio en .env.local.');
const hoy = diaOperacion();

// 1. POS crudo por día (la hora del POS viene etiquetada con Z pero es local: el día es el prefijo).
const pos = JSON.parse(readFileSync(archivoPos, 'utf8')) as { pedidos: { createdAt: string }[] };
const porDia: Record<string, unknown[]> = {};
for (const p of pos.pedidos) (porDia[p.createdAt.slice(0, 10)] ??= []).push(p);
guardar('pos.json', porDia);
const dias = Object.keys(porDia).sort();
const [desde, hasta] = [dias[0], dias.at(-1)!];

// 2. RPC que autorizan por sesión: como el admin, en una transacción que se revierte.
const ref = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).hostname.split('.')[0];
async function comoAdmin(sql: string) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      query: `begin read only;
select set_config('request.jwt.claims', '${JSON.stringify({ sub: ADMIN, role: 'authenticated' })}', true);
set local role authenticated;
select (${sql})::jsonb as r;`,
    }),
  });
  const j = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(j).slice(0, 400));
  return (j as { r: unknown }[])[0].r;
}
guardar('rappi.json', await comoAdmin(`public.sucursales_rappi_portal(${COMPANY}, '${desde}', '${hasta}')`));
guardar(
  'servicio.json',
  await comoAdmin(`public.franq_nivel_servicio(${COMPANY}, '${sumarDias(hoy, -34)}', '${hoy}')`),
);
guardar('ficha.json', await comoAdmin(`public.franq_ficha_recetas(${COMPANY})`));

// 3. Lista de insumos, equivalencias de la OV sugerida y presentaciones.
const insumos =
  (await db.from('franq_insumos').select('*').eq('company_id', COMPANY).order('orden')).data ?? [];
const eq = await equivalenciasLista(insumos);
const ids = insumos.map((i) => i.insumo_id).filter((x): x is string => !!x);
const costos = ids.length
  ? ((await db.from('insumos').select('id,costo_unitario').in('id', ids)).data ?? [])
  : [];
guardar('insumos.json', {
  insumos,
  equivalencias: eq?.equivalencias ?? [],
  presentaciones: Object.fromEntries(eq?.presentaciones ?? []),
  // Costo por unidad base: solo lo ve la gerencia en mermas (valor a costo).
  costos: Object.fromEntries(
    (costos as { id: string; costo_unitario: number | null }[]).map((c) => [c.id, c.costo_unitario]),
  ),
});

// 4. Pedidos a la Comercializadora (sitio viejo, candado de apertura).
const pedidos = await leerPedidosSucursal(cfg);
if (!pedidos.ok) throw new Error(pedidos.error);
guardar('pedidos.json', pedidos.filas);

// 5. P&L del mes en curso (ventas, compras, fijos de Zoho y metas).
guardar('pyl.json', await leerPyl(db as never, cfg, hoy.slice(0, 7)));

// 6. Consumo teórico por día (recetas × ventas) para mermas y existencias.
const c = await consumoPorDia(cfg, sumarDias(hoy, -3), hoy);
guardar('consumo.json', {
  aviso: c.aviso,
  dias: c.consumo ? Object.fromEntries([...c.consumo].map(([d, m]) => [d, Object.fromEntries(m)])) : null,
});

// 7. Sucursales de la ciudad (para «Mis sucursales» del franquiciatario), con su venta de hoy del resumen del corte.
const ciudad = sucursalesConfiguradas.filter((s) => s.ciudad === cfg.ciudad);
const resumenes =
  (
    await db
      .from('sucursales_resumen_dia')
      .select('company_id,origenes,corte_segundo')
      .eq('fecha', hoy)
      .in(
        'company_id',
        ciudad.map((s) => s.companyId),
      )
  ).data ?? [];
type Resumen = {
  company_id: number;
  origenes: Record<string, { venta_cent?: number }>;
  corte_segundo: number;
};
const ventaDe = new Map(
  (resumenes as Resumen[]).map((r) => [
    r.company_id,
    {
      ventaCent: Object.values(r.origenes ?? {}).reduce((s, o) => s + Number(o?.venta_cent ?? 0), 0),
      corteSegundo: r.corte_segundo,
    },
  ]),
);
guardar(
  'sucursales.json',
  ciudad.map((s) => ({
    companyId: s.companyId,
    nombre: s.nombre,
    ciudad: s.ciudad,
    ubicacion: s.ubicacion ?? null,
    ventaCent: ventaDe.get(s.companyId)?.ventaCent ?? null,
    corteSegundo: ventaDe.get(s.companyId)?.corteSegundo ?? null,
  })),
);
guardar('meta.json', {
  company: COMPANY,
  nombre: cfg.nombre,
  hoy,
  desde,
  hasta,
  generado: new Date().toISOString(),
});
