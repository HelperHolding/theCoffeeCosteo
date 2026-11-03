import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { sucursalesConfiguradas, type ConfigSucursal } from './config';
import { conRappi, hoyLocal, leerVentana, type FuenteRappi } from './datos';
import type { CatalogoNombres } from './metricas';
import type { PedidoNormal } from './normalizar';
import type { PedidoRappi } from './rappi-portal';
import { pedidoRappiAPos } from './rappi-pos';
import { resumirDia, type FilaResumen } from './resumen';
import { sumarDias } from './tiempo';

/**
 * Corte del Tablero de México (docs/sucursales/16): por cada sucursal configurada, lee sus días con las MISMAS
 * funciones que su página (leerVentana y conRappi), los resume (resumirDia) y guarda los totales en
 * sucursales_resumen_dia. Corre en el servidor con la llave de servicio: el usuario nunca escribe aquí.
 * Un día que no se pudo leer no se escribe (queda el corte anterior): nunca se guarda una venta cero por error.
 */

type Servicio = SupabaseClient;

/** Igual que el semáforo de proveedor.ts (4): más lecturas a la vez solo esperarían en su cola. */
const LECTURAS_A_LA_VEZ = 4;

export function clienteServicio(): Servicio | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

/** Nombres del POS de nuestros enlaces → código (igual que leerCatalogoPos, sin pasar por la sesión del usuario). */
async function catalogo(db: Servicio): Promise<CatalogoNombres | undefined> {
  const r = await db.from('producto_codigo_pos').select('codigo, nombre_observado');
  if (r.error || !r.data) return undefined;
  const codigos = new Map<string, Set<string>>();
  for (const e of r.data as { codigo: string; nombre_observado: string | null }[])
    if (e.nombre_observado && e.codigo)
      codigos.set(e.nombre_observado, (codigos.get(e.nombre_observado) ?? new Set<string>()).add(e.codigo));
  return new Map([...codigos].filter(([, cs]) => cs.size === 1).map(([n, cs]) => [n, [...cs][0]]));
}

/**
 * Rappi del portal de una sucursal (los mismos campos que sucursales_rappi_portal, que pide la sesión de un usuario),
 * ya en la forma del POS con pedidoRappiAPos. Solo sucursales con rappiPortal.
 */
export function rappiServicio(db: Servicio, cfg: ConfigSucursal): FuenteRappi | undefined {
  if (!cfg.rappiPortal) return undefined;
  return async (desde, hasta) => {
    const r = await db
      .from('rappi_pedidos')
      .select(
        'rappi_pedido_id, rappi_tienda_id, creado_local, fecha_local, estado, estado_nombre, en_disputa, estado_disputa, metodo_pago, bruto, descuento_aliado, estado_anterior, revisar, rappi_pedido_productos(linea, nombre, unidades, precio, opciones)',
      )
      .eq('company_id', cfg.companyId)
      .gte('fecha_local', desde)
      .lte('fecha_local', hasta)
      .limit(5000);
    if (r.error || !r.data) return null;
    const pedidos: PedidoNormal[] = [];
    for (const x of r.data as Record<string, unknown>[]) {
      const prods = ((x.rappi_pedido_productos as Record<string, unknown>[]) ?? []).sort(
        (a, b) => Number(a.linea) - Number(b.linea),
      );
      const p = pedidoRappiAPos({
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
        productos: prods.map((y) => ({
          nombre: String(y.nombre),
          unidades: Number(y.unidades),
          precio: Number(y.precio),
          opciones: (y.opciones ?? []) as PedidoRappi['productos'][number]['opciones'],
        })),
      } as PedidoRappi);
      if (p) pedidos.push(p);
    }
    return pedidos;
  };
}

export interface ResultadoCorte {
  fechas: string;
  sucursales: number;
  escritas: number;
  completas: number;
  fallidas: { companyId: number; fecha: string; motivo: string }[];
  ms: number;
}

/**
 * Corta `dias` días por sucursal: hoy (en su zona) y los anteriores. Hoy queda hasta la hora del corte; los demás,
 * cerrados (86400). Con `fechas`, esas fechas exactas (reposición del historial).
 */
export async function cortar(
  db: Servicio,
  {
    dias = 1,
    fechas,
    sucursales = sucursalesConfiguradas,
  }: { dias?: number; fechas?: string[]; sucursales?: ConfigSucursal[] } = {},
): Promise<ResultadoCorte> {
  const inicio = new Date();
  const cat = await catalogo(db);
  const filas: FilaResumen[] = [];
  const fallidas: ResultadoCorte['fallidas'] = [];
  const trabajos = sucursales.flatMap((cfg) => {
    const ahora = hoyLocal(cfg);
    const fs = fechas ?? Array.from({ length: dias }, (_, i) => sumarDias(ahora.fecha, -i));
    return fs
      .filter((f) => f <= ahora.fecha)
      .map((fecha) => ({ cfg, fecha, corte: fecha === ahora.fecha ? ahora.segundo : 86400 }));
  });
  // De LECTURAS_A_LA_VEZ en LECTURAS_A_LA_VEZ, como el semáforo del proveedor: si se lanzan todas juntas, cada
  // lectura cuenta su presupuesto de 25 s mientras espera turno y muchas se agotan (historial del 2026-11-03: 35 de 161
  // días sin leer en el primer bloque).
  const cortarUno = async ({ cfg, fecha, corte }: (typeof trabajos)[number]) => {
    const leidoEn = new Date();
    const l = await conRappi(
      await leerVentana(cfg, fecha, fecha, { forzar: corte < 86400 }),
      rappiServicio(db, cfg),
    );
    if (l.estado === 'error') {
      fallidas.push({ companyId: cfg.companyId, fecha, motivo: l.error ?? 'error' });
      return;
    }
    filas.push(
      resumirDia({
        companyId: cfg.companyId,
        fecha,
        leidoEn,
        corteSegundo: corte,
        completa: l.estado === 'completa',
        pedidos: l.pedidos,
        catalogo: cat,
      }),
    );
  };
  let siguiente = 0;
  await Promise.all(
    Array.from({ length: Math.min(LECTURAS_A_LA_VEZ, trabajos.length) }, async () => {
      while (siguiente < trabajos.length) await cortarUno(trabajos[siguiente++]);
    }),
  );
  for (let i = 0; i < filas.length; i += 50) {
    const r = await db.from('sucursales_resumen_dia').upsert(filas.slice(i, i + 50));
    if (r.error) throw new Error(`No se pudo guardar el resumen: ${r.error.message}`);
  }
  // Los tramos de 10 min solo hacen falta para comparar con la semana pasada.
  const hoy = hoyLocal(sucursales[0] ?? sucursalesConfiguradas[0]).fecha;
  await db
    .from('sucursales_resumen_dia')
    .update({ tramos: null })
    .lt('fecha', sumarDias(hoy, -8))
    .not('tramos', 'is', null);
  const completas = filas.filter((f) => f.completa).length;
  const resultado: ResultadoCorte = {
    fechas: fechas ? `${fechas[0]}…${fechas.at(-1)}` : `hoy y ${dias - 1} días antes`,
    sucursales: sucursales.length,
    escritas: filas.length,
    completas,
    fallidas,
    ms: Date.now() - inicio.getTime(),
  };
  await db.from('sucursales_cortes').insert({
    inicio: inicio.toISOString(),
    fechas: resultado.fechas,
    sucursales: resultado.sucursales,
    completas,
    mensaje: fallidas.length
      ? `Sin leer: ${fallidas.map((f) => `${f.companyId} ${f.fecha} (${f.motivo})`).join(', ')}`.slice(
          0,
          1000,
        )
      : null,
  });
  return resultado;
}
