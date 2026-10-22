'use client';
import { useState } from 'react';
import { Banknote, ReceiptText, ShoppingBag, TrendingUp } from 'lucide-react';
import type { RespuestaTendencias } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, etiquetaPago, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { AZUL, BarraCelda, COLOR_ORIGEN, Delta, colorPago } from './colores';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { dinero, fechaCorta, numero, porcentaje, textoConciliacion } from './formato';
import {
  ColumnasSemana,
  FilasApiladas,
  LineaSemanal,
  MapaCalor,
  etiquetaSemana,
} from './graficas-tendencias';
import { useLectura } from './use-lectura';
import { NetoRappi } from './neto-rappi';

const OPCIONES = [4, 8, 12] as const;

/** Tendencias por semanas cerradas (lunes–domingo, hora local). Solo semanas completas cuentan en totales. */
export function Tendencias({ companyId, origen }: { companyId: number; origen: FiltroOrigen }) {
  const [semanas, setSemanas] = useState<(typeof OPCIONES)[number]>(4);
  const { datos, error, cargando, recargar } = useLectura<RespuestaTendencias>(
    `/api/sucursales/${companyId}/tendencias?semanas=${semanas}&origen=${origen}`,
  );
  const m = datos?.sucursal.moneda ?? 'MXN';

  const selector = (
    <div className="placa flex flex-wrap items-center gap-3 px-3 py-2">
      <span className="text-sm font-medium text-ink-2">Periodo</span>
      <div
        className="flex rounded-[10px] border border-line-strong bg-paper p-0.5"
        role="group"
        aria-label="Semanas"
      >
        {OPCIONES.map((n) => (
          <button
            key={n}
            type="button"
            aria-pressed={semanas === n}
            onClick={() => setSemanas(n)}
            className={`rounded-lg px-3 py-1.5 text-xs font-semibold ${semanas === n ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
          >
            {n} semanas
          </button>
        ))}
      </div>
      {datos && datos.semanas.length > 0 && (
        <span className="text-xs text-muted-foreground">
          {datos.semanasCompletas} de {datos.semanas.length} semanas completas ·{' '}
          {fechaCorta(datos.semanas[0].desde)} – {fechaCorta(datos.semanas.at(-1)!.hasta)} · lunes a domingo,
          hora local
        </span>
      )}
    </div>
  );

  if (!datos)
    return (
      <div className="space-y-6">
        {selector}
        {error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto filas={2} />}
      </div>
    );

  const d = datos;
  const ss = d.semanas.map((s) => ({ ...s, etiqueta: etiquetaSemana(s.desde, s.hasta) }));
  const ultima = ss.at(-1);
  const metodos = [...new Set(ss.flatMap((s) => s.pagos.map((p) => p.metodo)))];
  const maxVenta = Math.max(1, ...ss.map((s) => s.kpis?.ventaCent ?? 0));

  return (
    <div className="space-y-6" aria-busy={cargando}>
      {selector}
      {error && <ErrorCarga error={error} alReintentar={recargar} />}
      <AvisosLectura lecturas={ss.map((s) => ({ nombre: `Semana ${s.etiqueta}`, info: s.lectura }))} />

      {d.semanasCompletas === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Sin semanas completas para mostrar">Reintenta en unos minutos.</Vacio>
        </div>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <Kpi
              etiqueta={`Venta (${d.semanasCompletas} semanas)`}
              valor={dinero(d.totales.ventaCent, m, false)}
              icono={Banknote}
              nota={`Promedio semanal ${dinero(Math.round(d.totales.ventaCent / d.semanasCompletas), m, false)}`}
            />
            <Kpi
              etiqueta="Pedidos"
              valor={numero(d.totales.pedidos)}
              icono={ShoppingBag}
              nota={`${numero(Math.round(d.totales.pedidos / (d.semanasCompletas * 7)))} por día en promedio`}
            />
            <Kpi
              etiqueta="Ticket promedio"
              valor={d.totales.ticketCent === null ? '—' : dinero(d.totales.ticketCent, m, false)}
              icono={ReceiptText}
              nota={`Descuentos ${porcentaje(d.totales.tasaDescuento)} del precio de lista`}
            />
            <Kpi
              etiqueta="Última semana"
              valor={ultima?.kpis ? dinero(ultima.kpis.ventaCent, m, false) : '—'}
              icono={TrendingUp}
              nota={
                ultima?.kpis ? (
                  <Delta valor={ultima.variacionVenta} sufijo="vs la semana anterior" />
                ) : (
                  'Lectura incompleta'
                )
              }
            />
          </div>

          <div className="grid gap-6 xl:grid-cols-2">
            <Tarjeta
              titulo="Venta por semana"
              descripcion="Lunes a domingo. Una semana rayada tuvo lectura incompleta."
            >
              <ColumnasSemana
                titulo="Venta cobrada"
                formato={(v) => dinero(v, m, false)}
                semanas={ss.map((s) => ({
                  clave: s.desde,
                  etiqueta: s.etiqueta,
                  valor: s.kpis?.ventaCent ?? null,
                }))}
              />
            </Tarjeta>
            <Tarjeta
              titulo="Ticket promedio por semana"
              descripcion="Venta cobrada ÷ pedidos de cada semana."
            >
              <LineaSemanal
                titulo="Ticket promedio"
                formato={(v) => dinero(v, m, false)}
                semanas={ss.map((s) => ({
                  clave: s.desde,
                  etiqueta: s.etiqueta,
                  valor: s.kpis?.ticketCent ?? null,
                }))}
              />
            </Tarjeta>
          </div>

          <Tarjeta
            titulo="¿Cuándo se vende? Pedidos promedio por día y hora"
            descripcion={`Promedio de ${d.semanasCompletas} semanas completas. Más oscuro = más pedidos.`}
          >
            <MapaCalor celdas={d.mapa} semanas={d.semanasCompletas} />
          </Tarjeta>

          {origen === 'rappi' ? (
            <NetoRappi kpis={d.totales} moneda={m} periodo={`${d.semanasCompletas} semanas`} />
          ) : (
            <div className="grid gap-6 xl:grid-cols-2">
              <Tarjeta titulo="Formas de pago por semana" descripcion="Participación en la venta cobrada.">
                <FilasApiladas
                  claves={metodos.map((k) => ({ clave: k, etiqueta: etiquetaPago(k), color: colorPago(k) }))}
                  filas={ss.map((s) => ({
                    clave: s.desde,
                    etiqueta: s.etiqueta,
                    segmentos: s.pagos.map((p) => ({ clave: p.metodo, participacion: p.participacion })),
                  }))}
                />
              </Tarjeta>
              <Tarjeta titulo="Origen por semana" descripcion="Mostrador, App The Coffee y Rappi.">
                <FilasApiladas
                  claves={(['mostrador', 'app', 'rappi', 'desconocido'] as const)
                    .filter((o) => ss.some((s) => s.origenes.some((x) => x.origen === o)))
                    .map((o) => ({ clave: o, etiqueta: etiquetaOrigen[o], color: COLOR_ORIGEN[o] }))}
                  filas={ss.map((s) => ({
                    clave: s.desde,
                    etiqueta: s.etiqueta,
                    segmentos: s.origenes.map((o) => ({ clave: o.origen, participacion: o.participacion })),
                  }))}
                />
              </Tarjeta>
            </div>
          )}

          <Tarjeta
            titulo="Detalle por semana"
            descripcion="Cifras de cada semana; la variación es contra la semana anterior."
            cuerpo={false}
          >
            <div className="overflow-x-auto">
              <table className="tabla w-full">
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    <th scope="col" className="numero">
                      Venta
                    </th>
                    <th scope="col">Variación</th>
                    <th scope="col" className="numero">
                      Pedidos
                    </th>
                    <th scope="col" className="numero">
                      Ticket
                    </th>
                    <th scope="col" className="numero">
                      Descuento
                    </th>
                    <th scope="col" className="numero">
                      % lista
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {ss.map((s) => (
                    <tr key={s.desde}>
                      <th
                        scope="row"
                        className="whitespace-nowrap !bg-transparent text-sm font-medium !normal-case !tracking-normal text-ink"
                      >
                        {s.etiqueta}
                      </th>
                      {s.kpis ? (
                        <>
                          <td className="numero">
                            <span className="flex items-center justify-end gap-2">
                              <span className="w-20">
                                <BarraCelda valor={s.kpis.ventaCent} max={maxVenta} color={AZUL.fuerte} />
                              </span>
                              {dinero(s.kpis.ventaCent, m, false)}
                            </span>
                          </td>
                          <td>
                            <Delta valor={s.variacionVenta} />
                          </td>
                          <td className="numero">{numero(s.kpis.pedidos)}</td>
                          <td className="numero">
                            {s.kpis.ticketCent === null ? '—' : dinero(s.kpis.ticketCent, m)}
                          </td>
                          <td className="numero">{dinero(s.kpis.descuentoCent, m)}</td>
                          <td className="numero">{porcentaje(s.kpis.tasaDescuento)}</td>
                        </>
                      ) : (
                        <td colSpan={6} className="text-muted-foreground">
                          Lectura incompleta: {s.lectura.error ?? s.lectura.avisos.join(' ')}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Tarjeta>

          <p className="placa px-3 py-2 text-xs text-muted-foreground">
            Totales y mapa solo con semanas completas. Conciliación: venta{' '}
            {dinero(d.conciliacion.ventaCent, m)} · suma de productos{' '}
            {dinero(d.conciliacion.productosCent, m)}
            {textoConciliacion(d.conciliacion, m)}.
          </p>
        </>
      )}
    </div>
  );
}
