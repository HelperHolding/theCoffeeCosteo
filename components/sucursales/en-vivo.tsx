'use client';
import { useEffect, useState } from 'react';
import {
  Banknote,
  Clock,
  Info,
  ReceiptText,
  RefreshCw,
  ShoppingBag,
  TrendingDown,
  TrendingUp,
} from 'lucide-react';
import type { PedidoVista, RespuestaVivo } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { frescura, type Frescura } from '@/lib/sucursales/tiempo';
import { Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { BarraApilada, CurvaAcumulada, PedidosPorHora, Ranking } from './graficas';
import { COLOR_ORIGEN, Delta, Etiqueta, SERIE_HOY, colorPago } from './colores';
import { DetallePedido } from './detalle-pedido';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { diaMes, dinero, hace, horaDe, numero, porcentaje } from './formato';
import { useLectura } from './use-lectura';

export const NOTA_LINEAS =
  'Líneas de producto. Unidades = estimación: una línea por unidad; pendiente de confirmar.';

const textoFrescura: Record<Frescura, { texto: string; clase: string }> = {
  actualizado: { texto: 'En vivo', clase: 'bg-ok-soft text-ok' },
  pendiente: { texto: 'Actualización pendiente', clase: 'bg-warn-soft text-warn' },
  retrasado: { texto: 'Datos retrasados', clase: 'bg-bad-soft text-bad' },
  error: { texto: 'Sin conexión con la API', clase: 'bg-bad-soft text-bad' },
};

const tonos = {
  ok: { clase: 'border-ok bg-ok-soft/50', icon: 'text-ok', icono: TrendingUp },
  bajo: { clase: 'border-warn bg-warn-soft/60', icon: 'text-warn', icono: TrendingDown },
  neutro: { clase: 'border-crema bg-crema-soft/50', icon: 'text-crema-strong', icono: Info },
};

/** Reloj que avanza cada 15 s para recalcular "hace N min" y la frescura sin pedir datos. */
function useReloj(ms = 15_000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setAhora(Date.now()), ms);
    return () => window.clearInterval(id);
  }, [ms]);
  return ahora;
}

export function EnVivo({ companyId, origen }: { companyId: number; origen: FiltroOrigen }) {
  const { datos, error, cargando, recibidoEn, recargar } = useLectura<RespuestaVivo>(
    `/api/sucursales/${companyId}/vivo?origen=${origen}`,
    { intervaloMs: 60_000 },
  );
  const ahora = useReloj();
  const [pedido, setPedido] = useState<PedidoVista | null>(null);

  if (!datos) return error ? <ErrorCarga error={error} alReintentar={recargar} /> : <Esqueleto />;

  const d = datos;
  const m = d.sucursal.moneda;
  // Reloj del servidor: compensa diferencias con el reloj del navegador.
  const desfase = recibidoEn === null ? 0 : d.corte.generadoEn - recibidoEn;
  const ahoraServidor = ahora + desfase;
  const errorHoy = d.lecturas.hoy.estado === 'error';
  const f = frescura(errorHoy ? null : d.lecturas.hoy.leidoEn, ahoraServidor, errorHoy || error !== null);
  const edadSeg = Math.max(0, Math.round((ahoraServidor - d.lecturas.hoy.leidoEn) / 1000));
  const base = `${d.base.dia} ${diaMes(d.base.fecha)}`;
  const comparable = d.comparativo !== null;
  const horaCorte = Math.floor(d.corte.segundo / 3600);
  const notaComparativo = (v: number | null) =>
    comparable ? (
      <Delta valor={v} sufijo={`vs ${base} a las ${d.corte.hora.slice(0, 5)}`} />
    ) : (
      'Comparativo no disponible: lectura incompleta'
    );
  const ultimoSeg = d.ultimoPedido
    ? d.ultimoPedido.haceSeg + Math.max(0, Math.round((ahoraServidor - d.corte.generadoEn) / 1000))
    : null;

  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-center justify-between gap-3 px-3 py-2 text-sm">
        <div className="flex flex-wrap items-center gap-3">
          <span
            className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${textoFrescura[f].clase}`}
          >
            <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
            {textoFrescura[f].texto}
          </span>
          <span className="text-muted-foreground" aria-live="polite">
            {errorHoy
              ? 'No hay lectura buena de hoy'
              : `Última lectura buena ${horaDe(d.lecturas.hoy.leidoEn, d.sucursal.zona)} (${hace(edadSeg)}) · corte ${d.corte.hora}`}
          </span>
        </div>
        <button
          type="button"
          onClick={recargar}
          disabled={cargando}
          className="inline-flex h-9 items-center gap-2 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold shadow-card disabled:opacity-60"
        >
          <RefreshCw size={15} aria-hidden="true" className={cargando ? 'motion-safe:animate-spin' : ''} />
          Actualizar
        </button>
      </div>

      {error && <ErrorCarga error={error} alReintentar={recargar} />}
      <AvisosLectura
        lecturas={[
          { nombre: 'Hoy', info: d.lecturas.hoy },
          { nombre: `Base (${base})`, info: d.lecturas.base },
        ]}
      />
      {d.posterioresAlCorte > 0 && (
        <p className="placa px-3 py-2 text-xs text-muted-foreground">
          {d.posterioresAlCorte} pedido(s) con hora posterior al corte no se cuentan todavía (reloj del punto
          de venta adelantado); entrarán en la siguiente actualización.
        </p>
      )}

      <div
        className={`space-y-6 transition-opacity ${f === 'error' || f === 'retrasado' ? 'opacity-70' : ''}`}
      >
        {errorHoy ? null : (
          <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              <Kpi
                etiqueta="Venta cobrada hoy"
                valor={dinero(d.kpis.ventaCent, m, false)}
                icono={Banknote}
                nota={notaComparativo(d.comparativo?.venta ?? null)}
              />
              <Kpi
                etiqueta="Pedidos"
                valor={numero(d.kpis.pedidos)}
                icono={ShoppingBag}
                nota={notaComparativo(d.comparativo?.pedidos ?? null)}
              />
              <Kpi
                etiqueta="Ticket promedio"
                valor={d.kpis.ticketCent === null ? '—' : dinero(d.kpis.ticketCent, m, false)}
                icono={ReceiptText}
                nota={
                  d.kpis.ticketCent === null
                    ? 'Sin pedidos todavía'
                    : notaComparativo(d.comparativo?.ticket ?? null)
                }
              />
              <Kpi
                etiqueta="Último pedido"
                valor={d.ultimoPedido ? d.ultimoPedido.hora.slice(0, 5) : '—'}
                icono={Clock}
                nota={
                  d.ultimoPedido && ultimoSeg !== null ? (
                    <span className="flex flex-wrap items-center gap-1.5">
                      <span>{hace(ultimoSeg)}</span>
                      <Etiqueta color={SERIE_HOY}>{d.ritmo.ultimos15} en 15 min</Etiqueta>
                      <Etiqueta color={SERIE_HOY}>{d.ritmo.ultimos60} en 1 h</Etiqueta>
                    </span>
                  ) : (
                    'Sin pedidos hoy todavía'
                  )
                }
              />
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <Tarjeta
                titulo="Venta acumulada"
                descripcion={`Hoy hasta las ${d.corte.hora.slice(0, 5)} frente a ${base}. Pasa el cursor para ver cada hora.`}
              >
                {d.kpis.pedidos === 0 && !d.curva.base ? (
                  <Vacio titulo="Sin pedidos hoy todavía">La curva aparece con el primer pedido.</Vacio>
                ) : (
                  <CurvaAcumulada
                    hoy={d.curva.hoy}
                    base={d.curva.base}
                    horaCorte={horaCorte}
                    horaTexto={d.corte.hora.slice(0, 5)}
                    etiquetaBase={base}
                    moneda={m}
                  />
                )}
              </Tarjeta>
              <Tarjeta
                titulo="Pedidos por hora"
                descripcion={`Ritmo de hoy frente a ${base}, hora por hora.`}
              >
                {d.kpis.pedidos === 0 && !d.porHora.base ? (
                  <Vacio titulo="Sin pedidos hoy todavía" />
                ) : (
                  <PedidosPorHora
                    hoy={d.porHora.hoy}
                    base={d.porHora.base}
                    horaCorte={horaCorte}
                    etiquetaBase={base}
                    moneda={m}
                  />
                )}
              </Tarjeta>
            </div>

            {d.insights.length > 0 && (
              <Tarjeta
                titulo="Lo que dicen los números"
                descripcion="Frases calculadas con las mismas cifras; no atribuyen causas."
              >
                <ul className="grid gap-3 md:grid-cols-2">
                  {d.insights.map((i) => {
                    const t = tonos[i.tono];
                    return (
                      <li key={i.id} className={`flex gap-3 rounded-xl border-l-4 p-3 text-sm ${t.clase}`}>
                        <t.icono size={17} aria-hidden="true" className={`mt-0.5 shrink-0 ${t.icon}`} />
                        <span>{i.texto}</span>
                      </li>
                    );
                  })}
                </ul>
              </Tarjeta>
            )}

            <div className="grid gap-6 xl:grid-cols-2">
              <Tarjeta
                titulo="Lo más vendido hoy"
                descripcion="Por importe atribuible: producto + sus personalizaciones."
              >
                {d.productosTop.length === 0 ? (
                  <Vacio titulo="Sin productos vendidos hoy todavía" />
                ) : (
                  <>
                    <Ranking
                      moneda={m}
                      filas={d.productosTop.map((p) => ({
                        clave: p.codigo,
                        nombre: p.nombre,
                        importeCent: p.importeCent,
                        lineas: p.lineas,
                        participacion: p.participacion,
                      }))}
                    />
                    <p className="mt-4 text-xs text-muted-foreground">* {NOTA_LINEAS}</p>
                  </>
                )}
              </Tarjeta>

              <Tarjeta
                titulo="Últimos pedidos"
                descripcion="Toca un pedido para ver sus productos."
                cuerpo={false}
              >
                {d.ultimosPedidos.length === 0 ? (
                  <Vacio titulo="Sin pedidos hoy todavía" />
                ) : (
                  <ul className="divide-y divide-line">
                    {d.ultimosPedidos.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => setPedido(p)}
                          className="flex w-full items-center gap-3 px-5 py-2.5 text-left text-sm hover:bg-[#faf8f4] focus-visible:outline-2 focus-visible:outline-ink"
                        >
                          <span className="tabular w-12 shrink-0 font-semibold">{p.hora.slice(0, 5)}</span>
                          <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5">
                            <Etiqueta color={colorPago(p.metodo)}>{p.pago}</Etiqueta>
                            {p.origen !== 'mostrador' && (
                              <Etiqueta color={COLOR_ORIGEN[p.origen]}>{etiquetaOrigen[p.origen]}</Etiqueta>
                            )}
                            <span className="text-xs text-muted-foreground">
                              {p.lineas.length} {p.lineas.length === 1 ? 'producto' : 'productos'}
                            </span>
                          </span>
                          <span className="tabular font-semibold">{dinero(p.ventaCent, m)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </Tarjeta>
            </div>

            <Tarjeta
              titulo="Pagos, origen y descuentos de hoy"
              descripcion="Distribución de lo cobrado; no es conciliación bancaria."
            >
              {d.pagos.length === 0 ? (
                <p className="text-sm text-muted-foreground">Sin pedidos hoy todavía.</p>
              ) : (
                <div className="grid gap-8 lg:grid-cols-[3fr_2fr]">
                  <div className="space-y-6">
                    <BarraApilada
                      titulo="Formas de pago"
                      moneda={m}
                      segmentos={d.pagos.map((p) => ({
                        clave: p.metodo,
                        etiqueta: p.etiqueta,
                        color: colorPago(p.metodo),
                        ventaCent: p.ventaCent,
                        pedidos: p.pedidos,
                        participacion: p.participacion,
                      }))}
                    />
                    {d.origen === 'todos' && (
                      <BarraApilada
                        titulo="Origen del pedido"
                        moneda={m}
                        segmentos={d.origenes.map((o) => ({
                          clave: o.origen,
                          etiqueta: etiquetaOrigen[o.origen],
                          color: COLOR_ORIGEN[o.origen],
                          ventaCent: o.ventaCent,
                          pedidos: o.pedidos,
                          participacion: o.participacion,
                        }))}
                      />
                    )}
                  </div>
                  <dl className="grid content-start gap-3 sm:grid-cols-3 lg:grid-cols-1">
                    <div className="rounded-xl bg-crema-soft/60 p-4">
                      <dt className="text-xs font-medium text-ink-2">Descuento otorgado</dt>
                      <dd className="mt-1 font-display text-2xl font-black tabular">
                        {dinero(d.kpis.descuentoCent, m)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-crema-soft/60 p-4">
                      <dt className="text-xs font-medium text-ink-2">% del precio de lista</dt>
                      <dd className="mt-1 font-display text-2xl font-black tabular">
                        {porcentaje(d.kpis.tasaDescuento)}
                      </dd>
                    </div>
                    <div className="rounded-xl bg-crema-soft/60 p-4">
                      <dt className="text-xs font-medium text-ink-2">Pedidos con descuento</dt>
                      <dd className="mt-1 font-display text-2xl font-black tabular">
                        {numero(d.kpis.pedidosConDescuento)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </Tarjeta>

            <p className="placa px-3 py-2 text-xs text-muted-foreground">
              Corte común para KPIs, gráficas y frases: {d.corte.hora} hora local ({d.sucursal.zona}).
              Conciliación: venta {dinero(d.conciliacion.ventaCent, m)} · suma de productos{' '}
              {dinero(d.conciliacion.productosCent, m)}
              {d.conciliacion.diferenciaCent === 0
                ? ' ✓'
                : ` · diferencia ${dinero(d.conciliacion.diferenciaCent, m)}`}
              .
            </p>
          </>
        )}
      </div>
      <DetallePedido pedido={pedido} moneda={m} alCerrar={() => setPedido(null)} />
    </div>
  );
}
