import 'server-only';
import type { ConfigSucursal } from '../sucursales/config';
import { consumir, type DatosConsumo } from '../sucursales/consumo';
import { rappiPorDias } from '../sucursales/consumo-mes';
import { conRappi, type FuenteRappi, type LecturaNormal } from '../sucursales/datos';
import type { CatalogoNombres } from '../sucursales/metricas';
import { diasEntre, sumarDias } from '../sucursales/tiempo';
import type { InsumoConsumido } from './ovSugerida';

/**
 * Consumo por receta de una tienda en una ventana (spec OV sugerida §4.3: hoy-28 … hoy-1) con el MISMO motor que
 * Sucursales: la lectura de calcularMes (leer + conRappi con Rappi del portal día por día) y consumir con todos los
 * pedidos como evidencia. consumoMesSucursal separa por origen; aquí se calcula una vez con todos, que es su suma.
 * Nunca lanza: un error de lectura o de cálculo se devuelve como motivo.
 */
export type ConsumoTienda =
  | {
      ok: true;
      desde: string;
      hasta: string;
      dias: number;
      completa: boolean;
      avisos: string[];
      pedidos: number;
      /** Unidades vendidas que entran al consumo ÷ todas (cobertura de recetas); null sin ventas. */
      cobertura: number | null;
      insumos: InsumoConsumido[];
    }
  | { ok: false; motivo: string };

export interface DepsConsumoTienda {
  leer: (cfg: ConfigSucursal, desde: string, hasta: string) => Promise<LecturaNormal>;
  rappi: (cfg: ConfigSucursal) => FuenteRappi | undefined;
}

export async function consumoVentana(a: {
  cfg: ConfigSucursal;
  desde: string;
  hasta: string;
  datos: DatosConsumo;
  catalogo?: CatalogoNombres;
  deps: DepsConsumoTienda;
}): Promise<ConsumoTienda> {
  try {
    const l = await conRappi(await a.deps.leer(a.cfg, a.desde, a.hasta), rappiPorDias(a.deps.rappi(a.cfg)));
    if (l.estado === 'error')
      return { ok: false, motivo: l.avisos[0] ?? l.error ?? 'No se pudo leer el POS.' };
    const dias = diasEntre(a.desde, a.hasta) + 1;
    const fechas = Array.from({ length: dias }, (_, i) => sumarDias(a.desde, i));
    const r = consumir(l.pedidos, a.datos, l.pedidos, a.catalogo, fechas, !!a.cfg.rappiPortal);
    return {
      ok: true,
      desde: a.desde,
      hasta: a.hasta,
      dias,
      completa: l.estado === 'completa',
      avisos: l.avisos,
      pedidos: l.pedidos.length,
      cobertura: r.cobertura.sobreTotal,
      insumos: r.insumos
        .filter((i) => i.cantidad > 0)
        .map((i) => ({ insumoId: i.insumoId, insumo: i.insumo, cantidad: i.cantidad }))
        .sort((x, y) => x.insumoId.localeCompare(y.insumoId)),
    };
  } catch (e) {
    return { ok: false, motivo: e instanceof Error ? e.message : String(e) };
  }
}
