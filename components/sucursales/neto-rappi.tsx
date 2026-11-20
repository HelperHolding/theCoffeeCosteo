import type { Resumen } from '@/lib/sucursales/metricas';
import { Tarjeta } from '@/components/portal/piezas';
import { ConInfo } from '@/components/portal/con-info';
import { infoNetoRappi } from './info-tableros';
import { COLOR_ORIGEN } from './colores';
import { dinero, numero, porcentaje } from './formato';

/**
 * Venta de Rappi con sus dos cifras: la completa (precio de lista, antes de descuentos; la que sigue el equipo de
 * delivery) y la neta (completa − descuento que paga la tienda), que es la que suma a la venta de la sucursal. Las
 * promociones que paga Rappi («Pro Rewards») se muestran aparte y no se restan.
 */
export function NetoRappi({
  kpis,
  moneda,
  periodo = 'hoy',
}: {
  kpis: Resumen;
  moneda: string;
  periodo?: string;
}) {
  const completa = kpis.brutoCent;
  const neta = kpis.ventaCent;
  const tienda = kpis.descuentoCent;
  return (
    <ConInfo info={infoNetoRappi(kpis, moneda, periodo)}>
      <Tarjeta
        titulo={`Venta de Rappi: completa y neta (${periodo})`}
        descripcion="Completa: precio Rappi antes de descuentos. Neta: después del descuento que paga la tienda; es la que suma a la venta de la sucursal."
      >
        {kpis.pedidos === 0 ? (
          <p className="text-sm text-muted-foreground">Sin pedidos de Rappi en el periodo.</p>
        ) : (
          <div className="space-y-4">
            <div
              className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]"
              role="img"
              aria-label={`Venta neta ${porcentaje(completa > 0 ? neta / completa : null, 0)} de la venta completa`}
            >
              {completa > 0 && (
                <>
                  <span
                    className="h-full"
                    style={{ width: `${(neta / completa) * 100}%`, backgroundColor: COLOR_ORIGEN.rappi }}
                  />
                  <span className="h-full flex-1 bg-line-strong" />
                </>
              )}
            </div>
            <dl className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <div className="rounded-xl bg-crema-soft/60 p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <span aria-hidden="true" className="size-2 rounded-full bg-line-strong" />
                  Venta completa (sin descuentos)
                </dt>
                <dd className="mt-1 font-display text-2xl font-black tabular">{dinero(completa, moneda)}</dd>
              </div>
              <div className="rounded-xl bg-crema-soft/60 p-4">
                <dt className="text-xs font-medium text-ink-2">Descuento que paga la tienda</dt>
                <dd className="mt-1 font-display text-2xl font-black tabular">
                  {dinero(tienda, moneda)}{' '}
                  <span className="text-sm font-semibold text-ink-2">
                    {numero(kpis.pedidosConDescuento)} pedidos
                  </span>
                </dd>
              </div>
              <div className="rounded-xl bg-crema-soft/60 p-4">
                <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                  <span
                    aria-hidden="true"
                    className="size-2 rounded-full"
                    style={{ backgroundColor: COLOR_ORIGEN.rappi }}
                  />
                  Venta neta (con descuentos)
                </dt>
                <dd className="mt-1 font-display text-2xl font-black tabular">{dinero(neta, moneda)}</dd>
              </div>
              <div className="rounded-xl bg-crema-soft/60 p-4">
                <dt className="text-xs font-medium text-ink-2">Promociones que paga Rappi</dt>
                <dd className="mt-1 font-display text-2xl font-black tabular">
                  {dinero(kpis.descuentoRappiCent, moneda)}
                </dd>
              </div>
            </dl>
          </div>
        )}
      </Tarjeta>
    </ConInfo>
  );
}
