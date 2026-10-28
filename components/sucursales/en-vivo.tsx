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
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { PedidoVista, RespuestaVivo } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { frescura, type Frescura } from '@/lib/sucursales/tiempo';
import { Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { ConInfo, type InfoTablero } from '@/components/portal/con-info';
import { BarraApilada, CurvaAcumulada, PedidosPorHora, Ranking } from './graficas';
import { COLOR_ORIGEN, Delta, Etiqueta, SERIE_HOY, colorPago } from './colores';
import { DetallePedido } from './detalle-pedido';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import {
  diaMes,
  dinero,
  hace,
  horaDe,
  numero,
  porcentaje,
  textoConciliacion,
  variacionTexto,
} from './formato';
import { useLectura } from './use-lectura';
import { useSonidoVentas } from './sonido-ventas';
import { NetoRappi } from './neto-rappi';

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
  // TEMPORAL: "cuac" por cada pedido nuevo (solo sucursales con sonidoVenta y lecturas completas).
  const completa = datos?.lecturas.hoy.estado === 'completa';
  const sonido = useSonidoVentas(
    datos?.sucursal.sonidoVenta ?? null,
    completa ? datos!.corte.fecha : null,
    completa ? datos!.kpis.pedidos : null,
  );

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
  const info = infoVivo(d, base);

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
        <div className="flex flex-wrap items-center gap-2">
          {sonido.disponible && origen !== 'rappi' && (
            <button
              type="button"
              onClick={sonido.alternar}
              aria-pressed={sonido.activo}
              title="Suena un “cuac” por cada pedido nuevo mientras esta página esté abierta"
              className={`inline-flex h-9 items-center gap-2 rounded-[10px] border px-3 text-sm font-semibold shadow-card ${
                sonido.activo ? 'border-ok bg-ok-soft text-ok' : 'border-line-strong bg-surface'
              }`}
            >
              {sonido.activo ? (
                <Volume2 size={15} aria-hidden="true" />
              ) : (
                <VolumeX size={15} aria-hidden="true" />
              )}
              Sonido de ventas {sonido.activo ? 'activado' : 'apagado'}
            </button>
          )}
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
              <ConInfo info={info.venta}>
                <Kpi
                  etiqueta="Venta cobrada hoy"
                  valor={dinero(d.kpis.ventaCent, m, false)}
                  icono={Banknote}
                  nota={notaComparativo(d.comparativo?.venta ?? null)}
                />
              </ConInfo>
              <ConInfo info={info.pedidos}>
                <Kpi
                  etiqueta="Pedidos"
                  valor={numero(d.kpis.pedidos)}
                  icono={ShoppingBag}
                  nota={notaComparativo(d.comparativo?.pedidos ?? null)}
                />
              </ConInfo>
              <ConInfo info={info.ticket}>
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
              </ConInfo>
              <ConInfo info={info.ultimo}>
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
              </ConInfo>
            </div>

            <div className="grid gap-6 xl:grid-cols-2">
              <ConInfo info={info.acumulada}>
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
              </ConInfo>
              <ConInfo info={info.porHora}>
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
              </ConInfo>
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
              <ConInfo info={info.top}>
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
                          clave: p.clave,
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
              </ConInfo>

              <ConInfo info={info.ultimos}>
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
                              {p.origen !== 'mostrador' && p.origen !== 'rappi' && (
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
              </ConInfo>
            </div>

            {origen === 'rappi' ? (
              <NetoRappi kpis={d.kpis} moneda={m} />
            ) : (
              <ConInfo info={info.pagos}>
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
              </ConInfo>
            )}

            <p className="placa px-3 py-2 text-xs text-muted-foreground">
              Corte común para KPIs, gráficas y frases: {d.corte.hora} hora local ({d.sucursal.zona}).
              Conciliación: venta {dinero(d.conciliacion.ventaCent, m)} · suma de productos{' '}
              {dinero(d.conciliacion.productosCent, m)}
              {textoConciliacion(d.conciliacion, m)}.
            </p>
          </>
        )}
      </div>
      <DetallePedido pedido={pedido} moneda={m} alCerrar={() => setPedido(null)} />
    </div>
  );
}

/** Textos de los pop-ups de "En vivo": qué mide cada tarjeta, sus cifras de contexto y cómo se calcula. */
function infoVivo(d: RespuestaVivo, base: string): Record<string, InfoTablero> {
  const m = d.sucursal.moneda;
  const corte = d.corte.hora.slice(0, 5);
  const b = d.kpisBase;
  const aLaHora = `${base} a las ${corte}`;
  const fuente = `API The Coffee, hora local ${d.sucursal.zona}. Corte de las ${corte}; el filtro de origen aplica.`;
  const hh = (h: number) => `${String(h).padStart(2, '0')}:00`;
  const pico = (xs: { pedidos: number }[] | null) =>
    (xs ?? []).reduce<{ hora: number; pedidos: number } | null>(
      (a, h, hora) => (h.pedidos > (a?.pedidos ?? 0) ? { hora, pedidos: h.pedidos } : a),
      null,
    );
  const picoHoy = pico(d.porHora.hoy);
  const picoBase = pico(d.porHora.base);
  const pagoTop = [...d.pagos].sort((x, y) => y.ventaCent - x.ventaCent)[0];
  const top = d.productosTop[0];
  return {
    venta: {
      titulo: 'Venta cobrada hoy',
      mide: 'Lo que la sucursal lleva cobrado hoy, ya con descuentos aplicados.',
      cifras: [
        { etiqueta: `Hoy a las ${corte}`, valor: dinero(d.kpis.ventaCent, m) },
        { etiqueta: aLaHora, valor: b ? dinero(b.ventaCent, m) : 'Sin lectura' },
        { etiqueta: 'Diferencia', valor: d.comparativo ? variacionTexto(d.comparativo.venta) : '—' },
        { etiqueta: 'Descuento otorgado', valor: dinero(d.kpis.descuentoCent, m) },
      ],
      calculo: `Suma del importe cobrado de cada pedido desde las 00:00, comparada con el mismo día de la semana pasada hasta la misma hora. ${fuente}`,
    },
    pedidos: {
      titulo: 'Pedidos',
      mide: 'Cuántos pedidos se han cobrado hoy. Cada pedido cuenta una vez, lleve los productos que lleve.',
      cifras: [
        { etiqueta: `Hoy a las ${corte}`, valor: numero(d.kpis.pedidos) },
        { etiqueta: aLaHora, valor: b ? numero(b.pedidos) : 'Sin lectura' },
        { etiqueta: 'Diferencia', valor: d.comparativo ? variacionTexto(d.comparativo.pedidos) : '—' },
        { etiqueta: 'Con descuento', valor: numero(d.kpis.pedidosConDescuento) },
      ],
      calculo: fuente,
    },
    ticket: {
      titulo: 'Ticket promedio',
      mide: 'Lo que deja en promedio cada pedido. Sube cuando se agregan más productos o tamaños grandes.',
      cifras: [
        { etiqueta: 'Hoy', valor: d.kpis.ticketCent === null ? '—' : dinero(d.kpis.ticketCent, m) },
        { etiqueta: aLaHora, valor: b?.ticketCent ? dinero(b.ticketCent, m) : 'Sin lectura' },
        {
          etiqueta: 'Productos por pedido',
          valor: d.kpis.pedidos ? (d.kpis.lineas / d.kpis.pedidos).toFixed(1) : '—',
        },
      ],
      calculo: `Venta cobrada ÷ pedidos. Productos por pedido es una estimación (una línea por unidad). ${fuente}`,
    },
    ultimo: {
      titulo: 'Último pedido',
      mide: 'Cuándo entró el último pedido y cuántos han llegado en los últimos minutos.',
      cifras: [
        { etiqueta: 'Último pedido', valor: d.ultimoPedido ? d.ultimoPedido.hora.slice(0, 5) : '—' },
        { etiqueta: 'Últimos 15 minutos', valor: numero(d.ritmo.ultimos15) },
        { etiqueta: 'Última hora', valor: numero(d.ritmo.ultimos60) },
      ],
      calculo: `Hora registrada por el punto de venta. Un hueco largo en horas de venta puede ser una caja sin conexión. ${fuente}`,
    },
    acumulada: {
      titulo: 'Venta acumulada',
      mide: `Cómo se va juntando la venta del día, hora por hora, frente al ${base}.`,
      cifras: [
        { etiqueta: `Hoy a las ${corte}`, valor: dinero(d.kpis.ventaCent, m) },
        { etiqueta: aLaHora, valor: b ? dinero(b.ventaCent, m) : 'Sin lectura' },
        {
          etiqueta: `${base}, día completo`,
          valor: d.curva.base?.length ? dinero(d.curva.base[d.curva.base.length - 1], m) : 'Sin lectura',
        },
      ],
      calculo:
        'Cada punto es la venta sumada al cierre de esa hora; la de hoy llega hasta el corte. La curva de la semana pasada sigue hasta el cierre para ver cuánto falta.',
    },
    porHora: {
      titulo: 'Pedidos por hora',
      mide: 'En qué horas entran más pedidos hoy y cómo se compara con la semana pasada.',
      cifras: [
        {
          etiqueta: 'Hora con más pedidos hoy',
          valor: picoHoy ? `${hh(picoHoy.hora)} · ${picoHoy.pedidos}` : '—',
        },
        {
          etiqueta: `Hora pico del ${base}`,
          valor: picoBase ? `${hh(picoBase.hora)} · ${picoBase.pedidos}` : 'Sin lectura',
        },
      ],
      calculo: 'Pedidos agrupados por la hora en que se cobraron. Sirve para planear turnos y producción.',
    },
    top: {
      titulo: 'Lo más vendido hoy',
      mide: 'Los productos que más dinero han dejado hoy, contando sus personalizaciones.',
      cifras: top
        ? [
            { etiqueta: 'Primer lugar', valor: top.nombre },
            { etiqueta: 'Importe', valor: dinero(top.importeCent, m) },
            { etiqueta: 'Parte de la venta', valor: porcentaje(top.participacion) },
          ]
        : [],
      calculo: `Importe atribuible a cada producto: su precio más sus extras. ${NOTA_LINEAS}`,
    },
    ultimos: {
      titulo: 'Últimos pedidos',
      mide: 'Los pedidos más recientes con su forma de pago. Toca uno para ver qué llevaba.',
      cifras: [
        { etiqueta: 'Mostrados', valor: numero(d.ultimosPedidos.length) },
        { etiqueta: 'Pedidos de hoy', valor: numero(d.kpis.pedidos) },
      ],
      calculo: fuente,
    },
    pagos: {
      titulo: 'Pagos, origen y descuentos',
      mide: 'Cómo se repartió lo cobrado hoy entre formas de pago y orígenes, y cuánto se descontó.',
      cifras: [
        {
          etiqueta: 'Forma de pago principal',
          valor: pagoTop ? `${pagoTop.etiqueta} · ${porcentaje(pagoTop.participacion)}` : '—',
        },
        { etiqueta: 'Descuento sobre precio de lista', valor: porcentaje(d.kpis.tasaDescuento) },
        { etiqueta: 'Pedidos con descuento', valor: numero(d.kpis.pedidosConDescuento) },
      ],
      calculo: 'Es la distribución de lo cobrado en el punto de venta; no es conciliación bancaria.',
    },
  };
}
