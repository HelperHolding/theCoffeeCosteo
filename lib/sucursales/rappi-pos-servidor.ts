import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { ConfigSucursal } from './config';
import type { FuenteRappi } from './datos';
import type { RpcRappiPortal } from './rappi-portal';
import { pedidoRappiAPos } from './rappi-pos';
import type { PedidoNormal } from './normalizar';
import { sumarDias } from './tiempo';

type Db = Awaited<ReturnType<typeof servidor>>;

/**
 * Pedidos de Rappi del portal (los guarda el cron de n8n) de un periodo, ya en la forma del POS, para sumarlos en
 * Ventas, Costeo y Consumo. Se leen bajo el acceso del usuario a la sucursal (sucursales_rappi_portal), en tramos de
 * 62 días. Solo sucursales con `rappiPortal`; null si no se pudo leer (la lectura queda parcial, nunca Rappi en cero).
 */
export function fuenteRappi(db: Db, cfg: ConfigSucursal): FuenteRappi | undefined {
  if (!cfg.rappiPortal) return undefined;
  return async (desde, hasta) => {
    const pedidos: PedidoNormal[] = [];
    for (let inicio = desde; inicio <= hasta; inicio = sumarDias(inicio, 62)) {
      const fin = sumarDias(inicio, 61) < hasta ? sumarDias(inicio, 61) : hasta;
      const r = await db.rpc('sucursales_rappi_portal', {
        p_company: cfg.companyId,
        p_desde: inicio,
        p_hasta: fin,
      });
      if (r.error || !r.data) return null;
      for (const p of (r.data as unknown as RpcRappiPortal).pedidos) {
        const x = pedidoRappiAPos(p);
        if (x) pedidos.push(x);
      }
    }
    return pedidos;
  };
}
