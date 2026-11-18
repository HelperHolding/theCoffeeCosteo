import 'server-only';
import type { servidor } from '../supabase/servidor';
import type { ConfigSucursal } from './config';
import type { FuenteRappi } from './datos';
import type { RpcRappiPortal } from './rappi-portal';
import { mismaHoraQueRappi, pedidoRappiAPos } from './rappi-pos';
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
    // El portal guarda la fecha en hora del centro: fuera de esa zona un pedido cerca de la medianoche cambia de día al
    // convertirlo, así que se lee un día de más a cada lado y se filtra ya con la fecha de la sucursal.
    const otraZona = !mismaHoraQueRappi(cfg.zona, desde) || !mismaHoraQueRappi(cfg.zona, hasta);
    const d0 = otraZona ? sumarDias(desde, -1) : desde;
    const h0 = otraZona ? sumarDias(hasta, 1) : hasta;
    for (let inicio = d0; inicio <= h0; inicio = sumarDias(inicio, 62)) {
      const fin = sumarDias(inicio, 61) < h0 ? sumarDias(inicio, 61) : h0;
      const r = await db.rpc('sucursales_rappi_portal', {
        p_company: cfg.companyId,
        p_desde: inicio,
        p_hasta: fin,
      });
      if (r.error || !r.data) return null;
      for (const p of (r.data as unknown as RpcRappiPortal).pedidos) {
        const x = pedidoRappiAPos(p, cfg.zona);
        if (x && x.fecha >= desde && x.fecha <= hasta) pedidos.push(x);
      }
    }
    return pedidos;
  };
}
