import 'server-only';
import type { ConfigSucursal } from '../sucursales/config';
import { recetasServicio } from '../sucursales/consumo-mes-servidor';
import { catalogoServicio, clienteServicio, rappiServicio } from '../sucursales/corte-servidor';
import { conRappi, leerDias } from '../sucursales/datos';
import { rappiPorDias } from '../sucursales/consumo-mes';
import { consumir } from '../sucursales/consumo';
import { diaOperacion, sumarDias } from './dia';
import type { Db } from './servidor';
import {
  armarExistencias,
  DIAS_EXISTENCIAS,
  desdeConsumo,
  vigentesEntrada,
  type ConsumoPorDia,
  type EquivalenciaSku,
  type FilaExistencia,
} from './existencias';
import type { FranqEntrada, FranqInsumo } from './tipos';

export interface ExistenciasSucursal {
  hoy: string;
  insumos: FranqInsumo[];
  filas: FilaExistencia[];
  /** Entradas vigentes de los últimos días, más recientes primero (las ve toda la sucursal). */
  entradas: FranqEntrada[];
  aviso: string | null;
}

/**
 * Consumo teórico por día de operación con el MISMO motor que Sucursales, mermas y la OV sugerida (ventas del POS +
 * Rappi del portal × recetas): una sola lectura de la ventana y un cálculo por día. null si no se pudo.
 */
async function consumoPorDia(
  cfg: ConfigSucursal,
  desde: string,
  hasta: string,
): Promise<{ consumo: ConsumoPorDia | null; aviso: string | null }> {
  const servicio = clienteServicio();
  if (!servicio)
    return { consumo: null, aviso: 'No se pudo calcular el consumo teórico (falta la llave de servicio).' };
  try {
    const [datos, catalogo] = await Promise.all([
      recetasServicio(servicio),
      catalogoServicio(servicio).catch(() => undefined),
    ]);
    if (!datos) return { consumo: null, aviso: 'No se pudieron leer las recetas para el consumo teórico.' };
    const l = await conRappi(await leerDias(cfg, desde, hasta), rappiPorDias(rappiServicio(servicio, cfg)));
    if (l.estado === 'error')
      return {
        consumo: null,
        aviso: `No se pudo calcular el consumo teórico: ${l.avisos[0] ?? l.error ?? 'POS'}`,
      };
    const consumo: ConsumoPorDia = new Map();
    for (let d = desde; d <= hasta; d = sumarDias(d, 1)) {
      const r = consumir(
        l.pedidos.filter((p) => p.fecha === d),
        datos,
        l.pedidos,
        catalogo,
        [d],
        !!cfg.rappiPortal,
      );
      consumo.set(d, new Map(r.insumos.map((i) => [i.insumoId, i.cantidad])));
    }
    return {
      consumo,
      aviso:
        l.estado === 'completa'
          ? null
          : 'Las ventas llegaron incompletas: el consumo teórico puede quedar corto.',
    };
  } catch (e) {
    return {
      consumo: null,
      aviso: `No se pudo calcular el consumo teórico: ${e instanceof Error ? e.message : String(e)}`,
    };
  }
}

/** Presentación (unidades base por paquete) de los insumos de Costeo de la lista. Llave de servicio, solo servidor. */
async function presentacionesDe(insumos: FranqInsumo[]): Promise<Map<string, number>> {
  const ids = [...new Set(insumos.map((i) => i.insumo_id).filter((x): x is string => !!x))];
  const servicio = clienteServicio();
  if (!servicio || !ids.length) return new Map();
  const r = await servicio.from('insumos').select('id,presentacion').in('id', ids);
  return new Map(
    ((r.data ?? []) as { id: string; presentacion: number }[]).map((x) => [
      x.id,
      Number(x.presentacion) || 1,
    ]),
  );
}

/**
 * Existencias de la sucursal (gerencia: la página exigió rol de gestor antes de llamar). Tablas del módulo con la
 * sesión del usuario (RLS); recetas, ventas y presentaciones con la llave de servicio.
 */
export async function leerExistencias(db: Db, cfg: ConfigSucursal): Promise<ExistenciasSucursal | null> {
  const hoy = diaOperacion();
  const desde = sumarDias(hoy, -(DIAS_EXISTENCIAS - 1));
  const [insumos, conteos, entradas, mermas] = await Promise.all([
    db.from('franq_insumos').select('*').eq('company_id', cfg.companyId),
    db.from('franq_conteos').select('*').eq('company_id', cfg.companyId).gte('dia', desde),
    db.from('franq_entradas').select('*').eq('company_id', cfg.companyId).gte('dia', desde).order('id'),
    db.from('franq_mermas').select('*').eq('company_id', cfg.companyId).gte('dia', desde).order('id'),
  ]);
  if (insumos.error || conteos.error || entradas.error || mermas.error) return null;
  const lista = insumos.data ?? [];
  const [presentaciones, c] = await Promise.all([
    presentacionesDe(lista),
    consumoPorDia(cfg, desdeConsumo(conteos.data ?? [], hoy), hoy),
  ]);
  return {
    hoy,
    insumos: lista,
    filas: armarExistencias({
      insumos: lista,
      conteos: conteos.data ?? [],
      entradas: entradas.data ?? [],
      mermas: mermas.data ?? [],
      consumo: c.consumo,
      presentaciones,
      hoy,
    }),
    entradas: vigentesEntrada(entradas.data ?? []).reverse(),
    aviso: c.aviso,
  };
}

/** Entradas vigentes de hoy (la pantalla de entradas que ve toda la sucursal, sin consumo ni costos). */
export async function leerEntradasHoy(db: Db, cfg: ConfigSucursal) {
  const hoy = diaOperacion();
  const [insumos, entradas] = await Promise.all([
    db.from('franq_insumos').select('*').eq('company_id', cfg.companyId),
    db.from('franq_entradas').select('*').eq('company_id', cfg.companyId).eq('dia', hoy).order('id'),
  ]);
  if (insumos.error || entradas.error) return null;
  return { hoy, insumos: insumos.data ?? [], entradas: vigentesEntrada(entradas.data ?? []).reverse() };
}

/** Equivalencias SKU → insumo de la OV sugerida para la lista de la sucursal, y sus presentaciones. */
export async function equivalenciasLista(
  insumos: FranqInsumo[],
): Promise<{ equivalencias: EquivalenciaSku[]; presentaciones: Map<string, number> } | null> {
  const ids = [
    ...new Set(
      insumos
        .filter((i) => i.activo)
        .map((i) => i.insumo_id)
        .filter((x): x is string => !!x),
    ),
  ];
  const servicio = clienteServicio();
  if (!servicio) return null;
  if (!ids.length) return { equivalencias: [], presentaciones: new Map() };
  const [eq, presentaciones] = await Promise.all([
    servicio.from('com_insumo_sku').select('insumo_id,sku,factor').eq('activo', true).in('insumo_id', ids),
    presentacionesDe(insumos),
  ]);
  if (eq.error) return null;
  return {
    equivalencias: ((eq.data ?? []) as { insumo_id: string; sku: string; factor: number }[]).map((x) => ({
      sku: x.sku,
      insumoId: x.insumo_id,
      factor: Number(x.factor),
    })),
    presentaciones,
  };
}
