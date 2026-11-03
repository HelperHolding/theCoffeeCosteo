import { writeFileSync } from 'node:fs';
import pg from 'pg';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas, type ConfigSucursal } from '../../lib/sucursales/config';
import { conRappi, leerDias } from '../../lib/sucursales/datos';
import type { PedidoNormal } from '../../lib/sucursales/normalizar';
import type { PedidoRappi } from '../../lib/sucursales/rappi-portal';
import { pedidoRappiAPos } from '../../lib/sucursales/rappi-pos';
import { consumir } from '../../lib/sucursales/consumo';
import { costear } from '../../lib/sucursales/costeo';
import { COMBOS_POS } from '../../lib/sucursales/combos';
import { CODIGO_GENERICO, ES_TAMANO } from '../../lib/sucursales/metricas';
import { ajusteVerificado, personalizacionNeutra } from '../../lib/sucursales/personalizaciones-verificadas';
import { sumarDias } from '../../lib/sucursales/tiempo';
import { cargarRecetas } from './recetas-locales';

/**
 * Qué le falta a cada sucursal para funcionar como Namóra (docs/rappi-portal/06), con datos reales y en solo lectura:
 * ventas del POS por la API; recetas, enlaces, tiendas de Rappi y accesos de la base. Por sucursal:
 * - cobertura de Costeo y de Consumo, con las reglas del piloto de Namóra (combos del POS por sus productos y
 *   personalizaciones sin calcular que no sacan la unidad) y sin ellas;
 * - productos sin enlace, fuera por tamaño y personalizaciones que aún no se calculan;
 * - combos del POS, tiendas de Rappi dadas de alta y usuarios con acceso.
 * Sin --companias, todas las de Guadalajara.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/auditar-replica.ts --hasta 2026-11-01 --dias 30 [--salida x.json]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const hasta = opcion('--hasta')!;
const dias = Number(opcion('--dias') ?? 30);
const salida = opcion('--salida');
const ids = (opcion('--companias') ?? '').split(',').filter(Boolean).map(Number);
const lista: ConfigSucursal[] = ids.length
  ? ids.map((id) => sucursalesConfiguradas.find((s) => s.companyId === id)!).filter(Boolean)
  : sucursalesConfiguradas.filter((s) => s.ciudad === 'Guadalajara');
if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? '')) throw new Error('Falta --hasta AAAA-MM-DD');
const desde = sumarDias(hasta, -(dias - 1));

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = new pg.Client({ connectionString: env.get('DATABASE_URL') });
await db.connect();
await db.query('begin transaction read only');
const { datos, conAjustes, datosCosteo } = await cargarRecetas(db);
const tiendas = (
  await db.query<{ company_id: number; tiendas: string }>(
    `select company_id, string_agg(canal || ' ' || rappi_tienda_id, ', ' order by canal) tiendas
     from rappi_tiendas where activa group by 1`,
  )
).rows;
const accesos = (
  await db.query<{ company_id: number; usuarios: number }>(
    `select company_id, count(*)::int usuarios from perfil_sucursales group by 1`,
  )
).rows;
// Rappi del portal ya guardado, con los campos de sucursales_rappi_portal (esa RPC pide la sesión de un usuario).
const rappiDe = async (companyId: number) =>
  (
    await db.query<PedidoRappi>(
      `select p.rappi_pedido_id::text id, p.rappi_tienda_id tienda,
         to_char(p.creado_local, 'YYYY-MM-DD"T"HH24:MI:SS') creado, p.fecha_local::text fecha, p.estado,
         p.estado_nombre, p.en_disputa, p.estado_disputa, p.metodo_pago, p.bruto::float8 bruto,
         p.descuento_aliado::float8 descuento_aliado, p.estado_anterior, p.revisar, 0 cambios,
         coalesce((select json_agg(json_build_object('nombre', x.nombre, 'unidades', x.unidades,
             'precio', x.precio::float8, 'opciones', x.opciones) order by x.linea)
           from rappi_pedido_productos x where x.rappi_pedido_id = p.rappi_pedido_id), '[]') productos
       from rappi_pedidos p where p.company_id = $1 and p.fecha_local between $2 and $3`,
      [companyId, desde, hasta],
    )
  ).rows;
const rappiPorSucursal = new Map<number, PedidoRappi[]>();
for (const cfg of lista)
  if (tiendas.some((t) => t.company_id === cfg.companyId))
    rappiPorSucursal.set(cfg.companyId, await rappiDe(cfg.companyId));
await db.query('rollback');
await db.end();

const sumar = (m: Map<string, number>, k: string, n = 1) => m.set(k, (m.get(k) ?? 0) + n);
const top = (m: Map<string, number>, n = 12) =>
  [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n);

const resultados = [];
const codigosPorSucursal = new Map<number, Map<string, { nombre: string; unidades: number }>>();
for (const cfg of lista) {
  const t = performance.now();
  const l = await leerDias(cfg, desde, hasta);
  const ps = l.pedidos;
  const costeo = costear(ps, datosCosteo, ps).resumen;
  const piloto = consumir(ps, conAjustes, ps, undefined, [], true);
  const estricto = consumir(ps, conAjustes, ps, undefined, [], false);

  const sinEnlace = new Map<string, number>();
  const combos = new Map<string, number>();
  const personalizaciones = new Map<string, number>();
  const codigos = new Map<string, { nombre: string; unidades: number }>();
  for (const p of ps)
    for (const x of p.lineas) {
      if (x.sinCodigo || x.codigo === CODIGO_GENERICO) continue;
      const c = codigos.get(x.codigo) ?? { nombre: x.nombre, unidades: 0 };
      c.unidades++;
      codigos.set(x.codigo, c);
      if (COMBOS_POS[x.codigo]) sumar(combos, `${x.codigo} ${x.nombre}`);
      const enlace = datos.enlaces.get(x.codigo);
      if (!enlace) {
        if (!COMBOS_POS[x.codigo]) sumar(sinEnlace, `${x.codigo} ${x.nombre}`);
        continue;
      }
      for (const c of x.customs)
        if (
          !ES_TAMANO.test(c.nombre) &&
          !personalizacionNeutra(enlace.recetaId, c.nombre) &&
          !ajusteVerificado(enlace.recetaId, c.nombre)
        )
          sumar(personalizaciones, c.nombre);
    }
  codigosPorSucursal.set(cfg.companyId, codigos);
  const fueraTamano = new Map<string, number>();
  for (const p of piloto.productos)
    for (const r of p.razones)
      if (r.motivo === 'tamano') sumar(fueraTamano, `${p.receta}: ${r.razon}`, r.unidades);

  // Rappi del portal (si la sucursal ya tiene tiendas): solo, y sumado al POS como en la página (conRappi).
  let rappi = null;
  const guardados = rappiPorSucursal.get(cfg.companyId);
  if (guardados) {
    const rps = guardados.map(pedidoRappiAPos).filter((p): p is PedidoNormal => !!p);
    const juntos = await conRappi(l, async () => rps);
    const sinEnlaceRappi = new Map<string, number>();
    for (const p of rps)
      for (const x of p.lineas)
        for (const y of x.partes ?? [x])
          if (!datos.enlaces.has(y.codigo) && !COMBOS_POS[y.codigo])
            sumar(sinEnlaceRappi, y.nombre || y.codigo);
    rappi = {
      pedidosGuardados: guardados.length,
      pedidosQueSuman: rps.length,
      ventaCent: rps.reduce((a, p) => a + p.ventaCent, 0),
      cuadran: rps.filter((p) => p.cuadra).length,
      costeo: (({ completo, parcial }) => ({ completas: completo.lineas, parcial: parcial.motivos }))(
        costear(rps, datosCosteo, rps).resumen,
      ),
      consumoPiloto: consumir(rps, conAjustes, rps, undefined, [], true).cobertura,
      juntos: consumir(juntos.pedidos, conAjustes, juntos.pedidos, undefined, [], true).cobertura,
      sinEnlace: top(sinEnlaceRappi),
    };
  }

  resultados.push({
    companyId: cfg.companyId,
    sucursal: cfg.nombre,
    lectura: l.estado,
    avisos: l.avisos,
    ms: Math.round(performance.now() - t),
    pedidos: ps.length,
    ventaCent: ps.reduce((a, p) => a + p.ventaCent, 0),
    lineasPos: ps.reduce((a, p) => a + p.lineas.length, 0),
    costeo: {
      completas: costeo.completo.lineas,
      parcial: costeo.parcial.motivos,
      importeCompletoCent: costeo.completo.importeCent,
      costoCompletoCent: costeo.completo.costoCent,
    },
    consumoPiloto: piloto.cobertura,
    consumoEstricto: { incluidas: estricto.cobertura.incluidas, excluidas: estricto.cobertura.excluidas },
    sinEnlace: top(sinEnlace),
    fueraTamano: top(fueraTamano, 8),
    personalizacionesSinCalcular: top(personalizaciones, 10),
    combosPos: top(combos, 12),
    rappi,
    rappiTiendas: tiendas.find((x) => x.company_id === cfg.companyId)?.tiendas ?? null,
    usuariosConAcceso: accesos.find((x) => x.company_id === cfg.companyId)?.usuarios ?? 0,
  });
  console.error(`${cfg.nombre}: ${ps.length} pedidos, ${l.estado}, ${Math.round(performance.now() - t)} ms`);
}

// Lo que se vende fuera de Namóra y Namóra no vendió en el periodo (con o sin enlace).
const namora = codigosPorSucursal.get(513);
const fueraDeNamora = new Map<
  string,
  { nombre: string; enlace: boolean; sucursales: string[]; unidades: number }
>();
if (namora)
  for (const r of resultados) {
    if (r.companyId === 513) continue;
    for (const [codigo, c] of codigosPorSucursal.get(r.companyId)!) {
      if (namora.has(codigo)) continue;
      const f = fueraDeNamora.get(codigo) ?? {
        nombre: c.nombre,
        enlace: datos.enlaces.has(codigo) || !!COMBOS_POS[codigo],
        sucursales: [],
        unidades: 0,
      };
      f.sucursales.push(r.sucursal);
      f.unidades += c.unidades;
      fueraDeNamora.set(codigo, f);
    }
  }

const informe = {
  desde,
  hasta,
  recetasConCantidades: datos.recetas.size,
  enlaces: datos.enlaces.size,
  sucursales: resultados,
  fueraDeNamora: [...fueraDeNamora]
    .sort((a, b) => b[1].unidades - a[1].unidades)
    .map(([codigo, f]) => ({ codigo, ...f })),
};
if (salida) writeFileSync(salida, JSON.stringify(informe, null, 1));
else console.log(JSON.stringify(informe, null, 1));
