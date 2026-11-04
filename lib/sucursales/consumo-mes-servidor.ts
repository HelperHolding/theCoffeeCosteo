import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { ConfigSucursal } from './config';
import type { DatosConsumo } from './consumo';
import { consumoMesSucursal, leerMes, mesCerrado, rappiPorDias, type FilaConsumoMes } from './consumo-mes';
import { datosConsumoDeRpc, type ConsumoRpc } from './consumo-servidor';
import { conRappi, type FuenteRappi, type LecturaNormal } from './datos';
import type { CatalogoNombres } from './metricas';

/**
 * Consumo nacional por mes (docs/sucursales/17): recorre las sucursales UNA POR UNA (cada una ya lee sus 31 días con 4
 * lecturas a la vez, el semáforo del proveedor; más sucursales a la vez solo harían esperar y agotar lecturas, como
 * pasó en el historial del corte). Una sucursal que no se pudo leer no se escribe: conserva su cálculo anterior.
 */
export interface DependenciasMes {
  leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>;
  rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined;
  guardar: (f: FilaConsumoMes) => Promise<number>;
  avance?: (texto: string) => void;
}
export interface ResultadoMes {
  mes: string;
  guardadas: number;
  incompletas: number[];
  fallidas: { companyId: number; motivo: string }[];
  ms: number;
}

export async function calcularMes(a: {
  mes: string;
  sucursales: ConfigSucursal[];
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  deps: DependenciasMes;
}): Promise<ResultadoMes> {
  if (!mesCerrado(a.mes)) throw new Error(`El mes ${a.mes.slice(0, 7)} no ha cerrado: solo meses anteriores al actual.`);
  const inicio = Date.now();
  const hasta = leerMes(a.mes.slice(0, 7))!.hasta;
  const r: ResultadoMes = { mes: a.mes, guardadas: 0, incompletas: [], fallidas: [], ms: 0 };
  for (const cfg of a.sucursales) {
    const t = Date.now();
    const l = await conRappi(await a.deps.leer(cfg, a.mes, hasta), rappiPorDias(a.deps.rappi(cfg)));
    if (l.estado === 'error') {
      r.fallidas.push({ companyId: cfg.companyId, motivo: l.avisos[0] ?? l.error ?? 'error' });
      a.deps.avance?.(`${cfg.companyId} ${cfg.nombre}: sin leer (${l.avisos[0] ?? l.error})`);
      continue;
    }
    const fila = consumoMesSucursal({
      mes: a.mes,
      companyId: cfg.companyId,
      lectura: l,
      datos: a.datos,
      catalogo: a.catalogo,
      piloto: !!cfg.rappiPortal,
    });
    const n = await a.deps.guardar(fila);
    r.guardadas++;
    if (!fila.completa) r.incompletas.push(cfg.companyId);
    a.deps.avance?.(
      `${cfg.companyId} ${cfg.nombre}: ${l.pedidos.length} pedidos, ${n} renglones${fila.completa ? '' : ' (INCOMPLETA)'} en ${Math.round((Date.now() - t) / 1000)} s`,
    );
  }
  r.ms = Date.now() - inicio;
  return r;
}

/** Recetas por la función interna (solo service_role), con el mismo armado que la sección Consumo. */
export async function recetasServicio(db: SupabaseClient): Promise<DatosConsumo | null> {
  const r = await db.rpc('sucursales_recetas_consumo_datos');
  if (r.error || !r.data) return null;
  return datosConsumoDeRpc(r.data as unknown as ConsumoRpc, new Date().toISOString());
}

export function guardarServicio(db: SupabaseClient): DependenciasMes['guardar'] {
  return async (f) => {
    const r = await db.rpc('sucursales_guardar_consumo_mes', {
      p_mes: f.mes,
      p_company: f.companyId,
      p_meta: {
        completa: f.completa,
        recetas_leidas_en: f.recetasLeidasEn,
        cobertura: f.cobertura,
        sin_receta: f.sinReceta,
      },
      p_insumos: f.insumos,
    });
    if (r.error) throw new Error(`No se pudo guardar ${f.companyId}: ${r.error.message}`);
    return Number(r.data);
  };
}
