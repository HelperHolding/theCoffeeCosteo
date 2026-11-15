import { writeFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { leerEnvLocal } from '../zoho/cliente';
import { sucursalesConfiguradas, type ConfigSucursal } from '../../lib/sucursales/config';
import { leerPedidos } from '../../lib/sucursales/proveedor';
import { pedidoRappiAPos } from '../../lib/sucursales/rappi-pos';
import type { PedidoRappi } from '../../lib/sucursales/rappi-portal';
import type { FilaResumen, PorOrigen, Serie, TotalesOrigen } from '../../lib/sucursales/resumen';
import { enZona, sumarDias } from '../../lib/sucursales/tiempo';

/**
 * Verificación del Tablero de México (docs/sucursales/16), SOLO LECTURA. Compara lo guardado en sucursales_resumen_dia
 * con las fuentes, por un camino distinto al del corte:
 * 1. cobertura: un renglón por sucursal y día desde su primer día, incompletos y días cerrados sin corte de cierre;
 * 2. coherencia interna: Σ horas = totales por origen;
 * 3. POS: para los días de --dias-pos, la API cruda (sin normalizar) sin forma de pago RAPPI, por fromSmartphone;
 * 4. Rappi: rappi_pedidos paginado con .order(), estados que suman y fecha convertida a la zona de la sucursal;
 * 5. hoy: frescura del corte y sucursales sin venta.
 *
 *   npx tsx --conditions=react-server scripts/sucursales/verificar-tablero.ts --desde 2026-11-01 --hasta 2026-11-14 \
 *     --dias-pos 2026-11-14,2026-11-10 [--salida x.json]
 */
const args = process.argv.slice(2);
const opcion = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const desde = opcion('--desde')!;
const hasta = opcion('--hasta')!;
const diasPos = (opcion('--dias-pos') ?? '').split(',').filter(Boolean);
const salida = opcion('--salida');
if (!/^\d{4}-\d{2}-\d{2}$/.test(desde ?? '') || !/^\d{4}-\d{2}-\d{2}$/.test(hasta ?? ''))
  throw new Error('Faltan --desde y --hasta (AAAA-MM-DD)');

const env = await leerEnvLocal();
process.env.THECOFFEE_API_TOKEN = env.get('THECOFFEE_API_TOKEN');
const db = createClient(env.get('NEXT_PUBLIC_SUPABASE_URL')!, env.get('SUPABASE_SECRET_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const POR_PAGINA = 1000;
const cent = (n: number) => Math.round(n * 100);
const suma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const sucursales = sucursalesConfiguradas;

// ——— Renglones guardados (sin productos ni tramos), paginados con .order() ———
type Renglon = Omit<FilaResumen, 'productos' | 'tramos'>;
const COLUMNAS = 'company_id, fecha, leido_en, corte_segundo, completa, origenes, horas';
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function renglones(filtro: (q: any) => any): Promise<Renglon[]> {
  const filas: Renglon[] = [];
  for (let i = 0; ; i += POR_PAGINA) {
    const r = await filtro(db.from('sucursales_resumen_dia').select(COLUMNAS))
      .order('company_id')
      .order('fecha')
      .range(i, i + POR_PAGINA - 1);
    if (r.error) throw new Error(r.error.message);
    filas.push(...(r.data as Renglon[]));
    if (r.data.length < POR_PAGINA) break;
  }
  return filas;
}
const todas = await renglones((q) => q);
const indice = new Map(todas.map((f) => [`${f.company_id}|${f.fecha}`, f]));
const guardado = (id: number, fecha: string) => indice.get(`${id}|${fecha}`);
const porSucursal = new Map<number, Renglon[]>();
for (const f of todas) porSucursal.set(f.company_id, [...(porSucursal.get(f.company_id) ?? []), f]);
const ajenas = [...porSucursal.keys()].filter((id) => !sucursales.some((s) => s.companyId === id));

// 1. Cobertura y 2. coherencia interna.
const cobertura = sucursales.map((cfg) => {
  const fs = porSucursal.get(cfg.companyId) ?? [];
  const hoy = enZona(new Date(), cfg.zona).fecha;
  const primero = fs[0]?.fecha ?? null;
  const fechas = new Set(fs.map((f) => f.fecha));
  const faltan: string[] = [];
  if (primero) for (let d = primero; d <= hoy; d = sumarDias(d, 1)) if (!fechas.has(d)) faltan.push(d);
  const incoherentes = fs
    .filter((f) =>
      (Object.entries(f.origenes) as [keyof PorOrigen<Serie>, TotalesOrigen][]).some(([o, t]) => {
        const h = f.horas[o];
        return !h || suma(h[0]) !== t.pedidos || suma(h[1]) !== t.venta_cent;
      }),
    )
    .map((f) => f.fecha);
  return {
    companyId: cfg.companyId,
    nombre: cfg.nombre,
    ciudad: cfg.ciudad,
    rappiPortal: !!cfg.rappiPortal,
    primero,
    dias: fs.length,
    faltan,
    incompletos: fs.filter((f) => !f.completa && f.fecha < hoy).map((f) => f.fecha),
    cerradosCortos: fs.filter((f) => f.fecha < hoy && f.corte_segundo < 86400).map((f) => f.fecha),
    incoherentes,
    conRappiDesde: fs.find((f) => f.origenes.rappi)?.fecha ?? null,
  };
});

async function enParalelo<T, R>(xs: T[], n: number, f: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(xs.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: n }, async () => {
      while (i < xs.length) {
        const k = i++;
        out[k] = await f(xs[k]);
      }
    }),
  );
  return out;
}

// 3. POS crudo contra lo guardado.
type Par = [number, number];
const ORIGENES_POS = ['mostrador', 'app', 'desconocido'] as const;
const pos = await enParalelo(
  sucursales.flatMap((cfg) => diasPos.map((fecha) => ({ cfg, fecha }))),
  4,
  async ({ cfg, fecha }) => {
    const cruda = await leerPedidos(cfg.companyId, fecha, fecha);
    const api: Record<(typeof ORIGENES_POS)[number] | 'rappiPos', Par> = {
      mostrador: [0, 0],
      app: [0, 0],
      desconocido: [0, 0],
      rappiPos: [0, 0],
    };
    for (const r of cruda.registros as Record<string, unknown>[]) {
      const o =
        r.paymentMethod === 'RAPPI'
          ? 'rappiPos'
          : r.fromSmartphone === true
            ? 'app'
            : r.fromSmartphone === false
              ? 'mostrador'
              : 'desconocido';
      api[o][0]++;
      api[o][1] += cent(Number(r.grossAmount));
    }
    const g = guardado(cfg.companyId, fecha);
    const gu = (o: (typeof ORIGENES_POS)[number]): Par => [
      g?.origenes[o]?.pedidos ?? 0,
      g?.origenes[o]?.venta_cent ?? 0,
    ];
    const dif = ORIGENES_POS.filter((o) => gu(o)[0] !== api[o][0] || gu(o)[1] !== api[o][1]);
    return {
      companyId: cfg.companyId,
      nombre: cfg.nombre,
      fecha,
      apiCompleta: cruda.completo,
      totalDeclarado: cruda.totalDeclarado,
      registros: cruda.registros.length,
      api,
      guardado: g ? Object.fromEntries(ORIGENES_POS.map((o) => [o, gu(o)])) : null,
      completaGuardada: g?.completa ?? null,
      leidoEn: g?.leido_en ?? null,
      cuadra: !!g && dif.length === 0,
      dif,
    };
  },
);

// 4. Rappi del portal contra lo guardado.
const rappi = await enParalelo(
  sucursales.filter((s) => s.rappiPortal),
  4,
  async (cfg: ConfigSucursal) => {
    const crudos: Record<string, unknown>[] = [];
    for (let i = 0; ; i += POR_PAGINA) {
      const r = await db
        .from('rappi_pedidos')
        .select(
          'rappi_pedido_id, rappi_tienda_id, creado_local, fecha_local, estado, estado_nombre, en_disputa, estado_disputa, metodo_pago, bruto, descuento_aliado, estado_anterior, revisar',
        )
        .eq('company_id', cfg.companyId)
        .gte('fecha_local', sumarDias(desde, -1))
        .lte('fecha_local', sumarDias(hasta, 1))
        .order('rappi_pedido_id')
        .range(i, i + POR_PAGINA - 1);
      if (r.error) throw new Error(r.error.message);
      crudos.push(...r.data);
      if (r.data.length < POR_PAGINA) break;
    }
    const porDia = new Map<string, Par>();
    for (const x of crudos) {
      const p = pedidoRappiAPos(
        {
          id: String(x.rappi_pedido_id),
          tienda: String(x.rappi_tienda_id),
          creado: String(x.creado_local),
          fecha: String(x.fecha_local),
          estado: String(x.estado),
          estado_nombre: String(x.estado_nombre),
          en_disputa: Boolean(x.en_disputa),
          estado_disputa: (x.estado_disputa as string | null) ?? null,
          metodo_pago: (x.metodo_pago as string | null) ?? null,
          bruto: Number(x.bruto),
          descuento_aliado: x.descuento_aliado === null ? null : Number(x.descuento_aliado),
          estado_anterior: (x.estado_anterior as string | null) ?? null,
          revisar: Boolean(x.revisar),
          cambios: 0,
          productos: [],
        } as PedidoRappi,
        cfg.zona,
      );
      if (!p || p.fecha < desde || p.fecha > hasta) continue;
      const d = porDia.get(p.fecha) ?? [0, 0];
      d[0]++;
      d[1] += cent(Number(x.bruto));
      porDia.set(p.fecha, d);
    }
    const difs: { fecha: string; portal: Par; guardado: Par }[] = [];
    const portal: Par = [0, 0];
    const tablero: Par = [0, 0];
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      const a = porDia.get(d) ?? [0, 0];
      const g = guardado(cfg.companyId, d);
      const b: Par = [g?.origenes.rappi?.pedidos ?? 0, g?.origenes.rappi?.venta_cent ?? 0];
      portal[0] += a[0];
      portal[1] += a[1];
      tablero[0] += b[0];
      tablero[1] += b[1];
      if (a[0] !== b[0] || a[1] !== b[1]) difs.push({ fecha: d, portal: a, guardado: b });
    }
    return { companyId: cfg.companyId, nombre: cfg.nombre, portal, tablero, difs };
  },
);

// 5. Hoy (en la zona de cada sucursal).
const hoy = sucursales.map((cfg) => {
  const f = enZona(new Date(), cfg.zona).fecha;
  const r = guardado(cfg.companyId, f);
  const t = Object.values(r?.origenes ?? {}) as TotalesOrigen[];
  const hhmm = (s: number) =>
    `${String(Math.floor(s / 3600)).padStart(2, '0')}:${String(Math.floor((s % 3600) / 60)).padStart(2, '0')}`;
  return {
    companyId: cfg.companyId,
    nombre: cfg.nombre,
    ciudad: cfg.ciudad,
    fecha: f,
    renglon: !!r,
    leidoEn: r?.leido_en ?? null,
    corte: r ? hhmm(r.corte_segundo) : null,
    completa: r?.completa ?? null,
    pedidos: suma(t.map((x) => x.pedidos)),
    ventaCent: suma(t.map((x) => x.venta_cent)),
    semanaPasada: (() => {
      const b = guardado(cfg.companyId, sumarDias(f, -7));
      return b ? suma((Object.values(b.origenes) as TotalesOrigen[]).map((x) => x.venta_cent)) : null;
    })(),
  };
});

const informe = {
  generado: new Date().toISOString(),
  desde,
  hasta,
  diasPos,
  ajenas,
  cobertura,
  pos,
  rappi,
  hoy,
};
if (salida) writeFileSync(salida, JSON.stringify(informe, null, 1));

// ——— Resumen en consola ———
const peso = (c: number) => `$${(c / 100).toLocaleString('es-MX', { maximumFractionDigits: 0 })}`;
console.log(`Renglones guardados: ${todas.length}; fuera de config: ${ajenas.join(', ') || 'ninguna'}`);
console.log(`Cobertura: ${cobertura.filter((c) => c.dias).length}/${sucursales.length} con renglones`);
for (const c of cobertura)
  if (!c.dias || c.faltan.length || c.incompletos.length || c.incoherentes.length || c.cerradosCortos.length)
    console.log(
      `  ${c.companyId} ${c.nombre}: ${c.dias} días desde ${c.primero}; faltan ${c.faltan.length} (${c.faltan.slice(0, 5).join(', ')}); incompletos ${c.incompletos.length} (${c.incompletos.slice(-5).join(', ')}); cerrados sin corte de cierre ${c.cerradosCortos.length} (${c.cerradosCortos.slice(-5).join(', ')}); incoherentes ${c.incoherentes.length}`,
    );
for (const fecha of diasPos) {
  const xs = pos.filter((p) => p.fecha === fecha);
  const sinRappi = (p: (typeof xs)[number]) => ORIGENES_POS.reduce((a, o) => a + p.api[o][0], 0);
  const ventaSinRappi = (p: (typeof xs)[number]) => ORIGENES_POS.reduce((a, o) => a + p.api[o][1], 0);
  console.log(
    `POS ${fecha}: ${xs.filter((p) => p.cuadra).length}/${xs.length} cuadran; API ${suma(xs.map(sinRappi))} pedidos sin RAPPI (${peso(suma(xs.map(ventaSinRappi)))}); RAPPI del POS quitados: ${suma(xs.map((p) => p.api.rappiPos[0]))}`,
  );
  for (const p of xs.filter((p) => !p.cuadra))
    console.log(
      `  ${p.companyId} ${p.nombre}: api ${JSON.stringify(p.api)} guardado ${JSON.stringify(p.guardado)} completa=${p.completaGuardada} apiCompleta=${p.apiCompleta} leído ${p.leidoEn}`,
    );
}
console.log(
  `Rappi ${desde}…${hasta}: ${rappi.filter((r) => !r.difs.length).length}/${rappi.length} cuadran; portal ${suma(rappi.map((r) => r.portal[0]))} pedidos ${peso(suma(rappi.map((r) => r.portal[1])))}; tablero ${suma(rappi.map((r) => r.tablero[0]))} ${peso(suma(rappi.map((r) => r.tablero[1])))}`,
);
for (const r of rappi.filter((r) => r.difs.length))
  console.log(
    `  ${r.companyId} ${r.nombre}: ${r.difs.map((d) => `${d.fecha} portal ${d.portal} tablero ${d.guardado}`).join('; ')}`,
  );
const sinVenta = hoy.filter((h) => !h.pedidos);
console.log(
  `Hoy: ${hoy.filter((h) => h.renglon).length}/${hoy.length} con renglón; sin venta: ${sinVenta.map((h) => `${h.companyId} ${h.nombre} (${h.renglon ? `corte ${h.corte}` : 'sin renglón'}; semana pasada ${h.semanaPasada === null ? 'sin renglón' : peso(h.semanaPasada)})`).join(', ') || 'ninguna'}`,
);
const lecturas = hoy.flatMap((h) => (h.leidoEn ? [h.leidoEn] : [])).sort();
console.log(
  `Hoy: lectura más vieja ${lecturas[0]}, más nueva ${lecturas.at(-1)}; incompletas: ${
    hoy
      .filter((h) => h.completa === false)
      .map((h) => h.companyId)
      .join(', ') || 'ninguna'
  }`,
);
console.log(`Hoy: ${suma(hoy.map((h) => h.pedidos))} pedidos, ${peso(suma(hoy.map((h) => h.ventaCent)))}`);
