'use client';
// Bloques 4 y 5 del tablero BI: KPI Venta The Coffee por tienda y promociones.
import { Fragment } from 'react';
import { Barra, Insignia, Tarjeta } from '@/components/portal/piezas';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import { cociente, type kpiTiendas, type promociones } from '@/lib/bi/bloques';

const F5 = (
  <span className="text-muted-foreground" title="Las metas llegan en F5">
    F5
  </span>
);

/** Bloque 4: Propias/Franquicia → tienda, con venta, tickets, ticket promedio y share de la red. */
export function KpiVentaTiendas({ grupos }: { grupos: ReturnType<typeof kpiTiendas> }) {
  const total = grupos.reduce((s, g) => s + g.ventaCent, 0);
  return (
    <Tarjeta
      titulo="KPI Venta The Coffee"
      descripcion="Share: participación de cada tienda en la venta neta del filtro."
      cuerpo={false}
    >
      {grupos.length === 0 ? (
        <p className="p-5 text-sm text-muted-foreground">Sin venta por tienda en el periodo.</p>
      ) : (
        <div className="mt-4 overflow-x-auto">
          <table className="tabla min-w-[44rem]">
            <caption className="sr-only">Venta por tienda agrupada por tipo</caption>
            <thead>
              <tr>
                <th scope="col">Tienda</th>
                <th scope="col" className="numero">
                  Venta
                </th>
                <th scope="col" className="numero">
                  Tickets
                </th>
                <th scope="col" className="numero">
                  Ticket prom.
                </th>
                <th scope="col" className="numero">
                  Share
                </th>
                <th scope="col" className="numero">
                  Meta
                </th>
                <th scope="col" className="numero">
                  Vs meta
                </th>
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <Fragment key={g.tipo}>
                  <tr className="bg-surface-2/60 font-semibold">
                    <th scope="rowgroup">{g.tipo}</th>
                    <td className="numero">{dinero(g.ventaCent)}</td>
                    <td className="numero">{numero(g.tickets)}</td>
                    <td className="numero">{dinero(cociente(g.ventaCent, g.tickets))}</td>
                    <td className="numero">{porcentaje(cociente(g.ventaCent, total))}</td>
                    <td className="numero">{F5}</td>
                    <td className="numero">{F5}</td>
                  </tr>
                  {g.tiendas.map((t) => (
                    <tr key={t.companyId}>
                      <th scope="row" className="pl-7 font-medium">
                        {t.nombre}
                      </th>
                      <td className="numero">{dinero(t.ventaCent)}</td>
                      <td className="numero">{numero(t.tickets)}</td>
                      <td className="numero">{dinero(t.ticketPromedioCent)}</td>
                      <td className="numero">{porcentaje(t.share)}</td>
                      <td className="numero">{F5}</td>
                      <td className="numero">{F5}</td>
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

const CORTO: Record<string, string> = {
  'Promoción alimentos y bebidas': 'Alimentos y bebidas',
  'Promoción café': 'Café',
};

/** Bloque 5: share de cada promoción contra su meta (6 % y 1 %), por tienda y cantidad vendida. */
export function Promociones({ datos }: { datos: ReturnType<typeof promociones> }) {
  const nombres = datos.red.map((r) => r.promocion);
  return (
    <Tarjeta titulo="Promociones" descripcion="Share de la venta neta de cada promoción contra su meta.">
      <div className="grid gap-6 sm:grid-cols-2">
        {datos.red.map((r) => {
          const estado = r.share === null ? 'neutro' : r.share >= r.meta ? 'ok' : 'bajo';
          return (
            <div key={r.promocion} className="space-y-2 rounded-xl border border-line p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ink-2">{r.promocion}</h3>
                <Insignia>Meta {porcentaje(r.meta, 0)}</Insignia>
              </div>
              <p className="font-display text-3xl font-black tabular">{porcentaje(r.share)}</p>
              <Barra valor={r.share ?? 0} max={r.meta * 2} objetivo={r.meta} estado={estado} />
              <p className="text-xs text-muted-foreground">
                {r.share === null
                  ? 'Sin venta en el periodo.'
                  : `${r.share >= r.meta ? 'En meta' : 'Bajo la meta'} · ${numero(r.unidades)} unidades vendidas`}
              </p>
            </div>
          );
        })}
      </div>
      <h3 className="mt-6 text-sm font-semibold text-ink-2">Resultados por tienda</h3>
      {datos.porTienda.length === 0 ? (
        <p className="mt-2 text-sm text-muted-foreground">Ninguna tienda vendió promociones en el periodo.</p>
      ) : (
        <div className="mt-2 overflow-x-auto">
          <table className="tabla min-w-[40rem]">
            <caption className="sr-only">Share y cantidad vendida de cada promoción por tienda</caption>
            <thead>
              <tr>
                <th scope="col">Tienda</th>
                {nombres.map((p) => (
                  <Fragment key={p}>
                    <th scope="col" className="numero">
                      {CORTO[p] ?? p} · share
                    </th>
                    <th scope="col" className="numero">
                      {CORTO[p] ?? p} · unidades
                    </th>
                  </Fragment>
                ))}
              </tr>
            </thead>
            <tbody>
              {datos.porTienda.map((t) => (
                <tr key={t.companyId}>
                  <th scope="row" className="font-medium">
                    {t.nombre}
                  </th>
                  {nombres.map((p) => (
                    <Fragment key={p}>
                      <td className="numero">{porcentaje(t.promos[p].share)}</td>
                      <td className="numero">{numero(t.promos[p].unidades)}</td>
                    </Fragment>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}
