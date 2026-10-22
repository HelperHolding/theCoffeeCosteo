import type { Resumen } from '@/lib/sucursales/metricas';
import { Tarjeta } from '@/components/portal/piezas';
import { COLOR_ORIGEN } from './colores';
import { dinero, numero, porcentaje } from './formato';

/**
 * Cobrado frente a neto en Rappi. `netAmout` es el "neto reportado por la API": en Rappi es menor que lo
 * cobrado y la diferencia parece la comisión del agregador, pero la definición está pendiente con el
 * proveedor, así que se rotula como diferencia reportada, no como comisión confirmada.
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
  const neto = kpis.netoCent;
  const diferencia = neto === null ? null : kpis.ventaCent - neto;
  const pct = diferencia === null || kpis.ventaCent === 0 ? null : diferencia / kpis.ventaCent;
  return (
    <Tarjeta
      titulo={`Cobrado y neto de Rappi (${periodo})`}
      descripcion="Neto reportado por la API (netAmout). La diferencia parece la comisión de Rappi; definición pendiente con el proveedor."
    >
      {kpis.pedidos === 0 ? (
        <p className="text-sm text-muted-foreground">Sin pedidos de Rappi en el periodo.</p>
      ) : (
        <div className="space-y-4">
          <div
            className="flex h-3.5 w-full gap-[2px] overflow-hidden rounded-[4px]"
            role="img"
            aria-label={`Neto ${porcentaje(neto === null ? null : neto / kpis.ventaCent, 0)} de lo cobrado`}
          >
            {neto !== null && kpis.ventaCent > 0 && (
              <>
                <span
                  className="h-full"
                  style={{ width: `${(neto / kpis.ventaCent) * 100}%`, backgroundColor: COLOR_ORIGEN.rappi }}
                />
                <span className="h-full flex-1 bg-line-strong" />
              </>
            )}
          </div>
          <dl className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-xl bg-crema-soft/60 p-4">
              <dt className="text-xs font-medium text-ink-2">Cobrado (precio Rappi)</dt>
              <dd className="mt-1 font-display text-2xl font-black tabular">
                {dinero(kpis.ventaCent, moneda)}
              </dd>
            </div>
            <div className="rounded-xl bg-crema-soft/60 p-4">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                <span
                  aria-hidden="true"
                  className="size-2 rounded-full"
                  style={{ backgroundColor: COLOR_ORIGEN.rappi }}
                />
                Neto reportado (API)
              </dt>
              <dd className="mt-1 font-display text-2xl font-black tabular">{dinero(neto, moneda)}</dd>
            </div>
            <div className="rounded-xl bg-crema-soft/60 p-4">
              <dt className="flex items-center gap-1.5 text-xs font-medium text-ink-2">
                <span aria-hidden="true" className="size-2 rounded-full bg-line-strong" />
                Diferencia
              </dt>
              <dd className="mt-1 font-display text-2xl font-black tabular">
                {dinero(diferencia, moneda)}{' '}
                <span className="text-sm font-semibold text-ink-2">{porcentaje(pct)}</span>
              </dd>
            </div>
            <div className="rounded-xl bg-crema-soft/60 p-4">
              <dt className="text-xs font-medium text-ink-2">Pedidos con descuento</dt>
              <dd className="mt-1 font-display text-2xl font-black tabular">
                {numero(kpis.pedidosConDescuento)}{' '}
                <span className="text-sm font-semibold text-ink-2">
                  · {dinero(kpis.descuentoCent, moneda)}
                </span>
              </dd>
            </div>
          </dl>
        </div>
      )}
    </Tarjeta>
  );
}
