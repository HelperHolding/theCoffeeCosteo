import Link from 'next/link';
import {
  AlertTriangle,
  Boxes,
  CalendarClock,
  ClipboardList,
  Clock,
  PackageX,
  Percent,
  ShoppingBag,
  Timer,
  Trash2,
  Truck,
  Wallet,
} from 'lucide-react';
import { Barra, Kpi, Pill, Tarjeta, Vacio } from '@/components/portal/piezas';
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import { textoDestino } from '@/lib/comercializadora/ordenes';
import {
  ESTADOS_PEDIDO,
  relativo,
  type PedidoActivo,
  type ResultadoInicio,
} from '@/lib/comercializadora/inicio';
import type { RiesgoInicio } from '@/lib/comercializadora/doh';

function Panel({
  titulo,
  enlace,
  children,
}: {
  titulo: string;
  enlace?: { href: string; texto: string };
  children: React.ReactNode;
}) {
  return (
    <details open className="placa rounded-xl p-4">
      <summary className="cursor-pointer text-sm font-semibold">{titulo}</summary>
      <div className="mt-3 text-sm">{children}</div>
      {enlace ? (
        <Link
          href={enlace.href}
          className="mt-3 inline-block text-xs font-semibold text-crema-strong underline"
        >
          {enlace.texto} →
        </Link>
      ) : null}
    </details>
  );
}

export function Inicio({
  r,
  ventas,
  pedidos,
  hoy,
  riesgo,
}: {
  r: ResultadoInicio;
  ventas: boolean;
  pedidos: { total: number; top: PedidoActivo[] } | null;
  hoy: string;
  /** Plan 3d: riesgo de quiebre del motor. undefined = no se muestra; null = no se pudo calcular. */
  riesgo?: RiesgoInicio | null;
}) {
  const mes = r.mes;
  const inv = r.inventario;
  return (
    <div className="space-y-5">
      {!ventas ? (
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          No se pudieron leer los pedidos del sitio viejo: las ventas, el % y los pedidos activos no se
          muestran. Lo demás está al día.
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <Kpi
          etiqueta="Ventas facturadas (mes)"
          valor={ventas ? pesos(mes.ventas) : '—'}
          nota={ventas ? `${mes.pedidos} pedidos` : undefined}
          icono={ShoppingBag}
        />
        <Kpi
          etiqueta="Compras operativas (mes)"
          valor={pesos(mes.compras)}
          nota={
            mes.sinMonto ? 'Hay OCs del mes sin monto capturado' : `${mes.ocs} OCs · sin compras de Equipo`
          }
          icono={Wallet}
          tono={mes.sinMonto ? 'bajo' : 'neutro'}
        />
        <Kpi
          etiqueta="% Compras / Ventas"
          valor={ventas && mes.pct != null ? `${mes.pct}%` : '—'}
          nota={ventas ? mes.texto : undefined}
          icono={Percent}
          tono={ventas ? mes.tono : 'neutro'}
        />
      </div>

      {r.proximas.folios.length ? (
        <p className="placa rounded-lg px-4 py-3 text-sm">
          <b>
            {r.proximas.folios.length} OC{r.proximas.folios.length === 1 ? '' : 's'} con arribo en los
            próximos 7 días
          </b>{' '}
          ({r.proximas.folios.join(' · ')}): {pesos(r.proximas.monto)}
        </p>
      ) : null}

      <Tarjeta
        titulo="Tendencia: % Compras / Ventas (5 meses)"
        descripcion="Rango óptimo 45–55 %. Las compras cuentan por la fecha de emisión de la OC."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Ventas</th>
                <th className="text-right">Compras</th>
                <th className="text-right">%</th>
                <th className="min-w-32" />
              </tr>
            </thead>
            <tbody>
              {r.tendencia.map((t) => (
                <tr key={t.mes}>
                  <td>
                    {t.etiqueta}
                    {t.actual ? <span className="text-muted-foreground"> · en curso</span> : null}
                  </td>
                  <td className="text-right tabular-nums">{ventas ? pesos(t.ventas) : '—'}</td>
                  <td className="text-right tabular-nums">{pesos(t.compras)}</td>
                  <td className="text-right font-semibold tabular-nums">
                    {ventas && t.pct != null ? `${t.pct}%` : '—'}
                  </td>
                  <td>
                    {ventas && t.pct != null ? (
                      <Barra valor={Math.min(t.pct, 100)} max={100} objetivo={55} estado={t.tono} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Kpi
          etiqueta="Pedidos activos"
          valor={pedidos ? pedidos.total : '—'}
          nota="Sin terminar ni cancelar"
          icono={ClipboardList}
        />
        <Kpi
          etiqueta="Salidas 30 días"
          valor={r.salidas.folios}
          nota={`${numero(r.salidas.uds)} piezas enviadas`}
          icono={Truck}
        />
        <Kpi etiqueta="OCs en tránsito" valor={r.transito.length} nota="Por recibir" icono={CalendarClock} />
        <Kpi
          etiqueta="Sin stock"
          valor={inv.sinStock.length}
          nota="Artículos en cero"
          icono={PackageX}
          tono={inv.sinStock.length ? 'pierde' : 'ok'}
        />
        <Kpi
          etiqueta="Inventario crítico"
          valor={inv.criticos}
          nota="Urgente + pronto por días de inventario"
          icono={AlertTriangle}
          tono={inv.criticos ? 'bajo' : 'ok'}
        />
        <Kpi
          etiqueta="CEDIS total"
          valor={numero(inv.cedisTotal)}
          nota={`${inv.activos} artículos activos`}
          icono={Boxes}
        />
      </div>

      <Tarjeta
        titulo="Compras y mermas"
        descripcion="Arribo vencido usa la fecha estimada de la OC: es un aviso, no un atraso confirmado."
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi
            etiqueta="OCs con arribo vencido"
            valor={r.compras.atrasadas}
            nota={`de ${r.compras.abiertas} abiertas`}
            icono={Clock}
            tono={r.compras.atrasadas === 0 ? 'ok' : r.compras.atrasadas <= 2 ? 'bajo' : 'pierde'}
          />
          <Kpi
            etiqueta="OCs abiertas"
            valor={r.compras.abiertas}
            nota={pesos(r.compras.montoAbiertas)}
            icono={ClipboardList}
          />
          <Kpi
            etiqueta="Lead time prometido"
            valor={r.compras.leadTime.dias == null ? '—' : `${r.compras.leadTime.dias} días`}
            nota={`${r.compras.leadTime.ocs} OCs con ambas fechas`}
            icono={Timer}
          />
          <Kpi
            etiqueta="Mermas del mes"
            valor={r.mermas.pct == null ? 'Sin datos' : `${r.mermas.pct}%`}
            nota={`${r.mermas.n} ajustes con motivo Merma · meta ≤ 1 %`}
            icono={Trash2}
            tono={
              r.mermas.pct == null
                ? 'neutro'
                : r.mermas.pct <= 1
                  ? 'ok'
                  : r.mermas.pct <= 2
                    ? 'bajo'
                    : 'pierde'
            }
          />
        </div>
      </Tarjeta>

      <div className="grid gap-4 lg:grid-cols-2">
        <Panel titulo="Pedidos activos">
          {!pedidos ? (
            <p className="text-muted-foreground">No disponible por ahora.</p>
          ) : !pedidos.top.length ? (
            <Vacio titulo="Sin pedidos activos" />
          ) : (
            <ul className="divide-y divide-line">
              {pedidos.top.map((p) => {
                const e = ESTADOS_PEDIDO[p.status] ?? { texto: p.status, tono: 'neutro' as const };
                return (
                  <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
                    <span>
                      <b>{p.numero}</b> <span className="text-muted-foreground">{p.sucursal}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <Pill estado={e.tono}>{e.texto}</Pill>
                      <span className="tabular-nums">{pesos(p.monto)}</span>
                      <span className="text-muted-foreground">{p.fecha ? fechaCorta(p.fecha) : '—'}</span>
                    </span>
                  </li>
                );
              })}
              {pedidos.total > pedidos.top.length ? (
                <li className="py-2 text-muted-foreground">
                  y {pedidos.total - pedidos.top.length} pedidos más
                </li>
              ) : null}
            </ul>
          )}
        </Panel>

        {riesgo !== undefined ? (
          <Panel
            titulo="Riesgo de quiebre"
            enlace={{ href: '/comercializadora/doh?estado=pedir', texto: 'Ver en DOH' }}
          >
            {riesgo === null ? (
              <p className="text-muted-foreground">No se pudo calcular el riesgo de quiebre.</p>
            ) : (
              <>
                <p className="mb-2 text-xs text-muted-foreground">
                  <b className="text-bad">{riesgo.pedir}</b> por pedir ·{' '}
                  <b className="text-warn">{riesgo.confirmar}</b> con OC por confirmar ·{' '}
                  <b className="text-ok">{riesgo.cubierto}</b> cubiertos con OC
                  {riesgo.negativos ? ` · ${riesgo.negativos} con inventario negativo (revisar)` : ''}
                </p>
                {!riesgo.lista.length ? (
                  <Vacio titulo="Nada por pedir ni por confirmar" />
                ) : (
                  <ul className="divide-y divide-line">
                    {riesgo.lista.map((f) => (
                      <li key={f.sku} className="flex justify-between gap-2 py-2">
                        <span>
                          {f.nombre}{' '}
                          <span className="text-xs text-muted-foreground">
                            {f.sku} · {numero(Math.round(f.inv))} uds · {numero(Math.round(f.cons * 10) / 10)}
                            /día
                          </span>
                        </span>
                        <span className="flex items-center gap-2">
                          <b className={f.estado === 'pedir' ? 'text-bad' : 'text-warn'}>
                            {f.dias !== null ? `${Math.round(f.dias)} d` : '—'}
                          </b>
                          <Pill estado={f.estado === 'pedir' ? 'pierde' : 'bajo'}>
                            {f.estado === 'pedir' ? 'Pedir ya' : 'OC por confirmar'}
                          </Pill>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
          </Panel>
        ) : null}

        <Panel titulo="Sin stock" enlace={{ href: '/comercializadora/doh', texto: 'Ver DOH' }}>
          {!inv.sinStock.length ? (
            <Vacio titulo="Ningún artículo en cero" />
          ) : (
            <ul className="divide-y divide-line">
              {inv.sinStock.slice(0, 12).map((f) => (
                <li key={f.sku} className="flex justify-between gap-2 py-2">
                  <span>
                    {f.nombre} <span className="text-xs text-muted-foreground">{f.sku}</span>
                  </span>
                  {f.comprometido ? <span className="text-bad">−{numero(f.comprometido)} pend.</span> : null}
                </li>
              ))}
              {inv.sinStock.length > 12 ? (
                <li className="py-2 text-muted-foreground">y {inv.sinStock.length - 12} más</li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel titulo="Compras en tránsito">
          {!r.transito.length ? (
            <Vacio titulo="Sin OCs por recibir" />
          ) : (
            <ul className="divide-y divide-line">
              {r.transito.slice(0, 6).map((g) => (
                <li key={g.folio} className="flex flex-wrap justify-between gap-2 py-2">
                  <span>
                    <b>{g.folio}</b>{' '}
                    <span className="text-muted-foreground">
                      → {textoDestino(g.destino)} · {g.skus} SKUs · {numero(g.uds)} pzas
                    </span>
                  </span>
                  <span>{relativo(g.fecha_arribo, hoy)}</span>
                </li>
              ))}
              {r.transito.length > 6 ? (
                <li className="py-2 text-muted-foreground">y {r.transito.length - 6} más</li>
              ) : null}
            </ul>
          )}
        </Panel>

        <Panel titulo="Inventario crítico" enlace={{ href: '/comercializadora/doh', texto: 'Ver DOH' }}>
          {!inv.faltantes.length && !inv.stockBajo.length ? (
            <p className="text-muted-foreground">
              {inv.criticos} artículos urgentes o pronto por días de inventario; ninguno corto para pedidos
              pendientes.
            </p>
          ) : null}
          {inv.faltantes.length ? (
            <>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Insuficiente para pedidos pendientes
              </h3>
              <ul className="mb-3 divide-y divide-line">
                {inv.faltantes.slice(0, 4).map((f) => (
                  <li key={f.sku} className="flex justify-between gap-2 py-2">
                    <span>
                      {f.nombre}{' '}
                      <span className="text-xs text-muted-foreground">
                        {f.sku} · stock {numero(f.saldo)}
                      </span>
                    </span>
                    <span className="text-right">
                      <b className="text-bad">−{numero(f.faltante)}</b>
                      <span className="block text-xs text-muted-foreground">
                        comprometido {numero(f.comprometido)}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
          {inv.stockBajo.length ? (
            <>
              <h3 className="mb-1 text-xs font-semibold uppercase text-muted-foreground">
                Stock bajo (≤ 10 piezas, sin venta reciente)
              </h3>
              <ul className="divide-y divide-line">
                {inv.stockBajo.slice(0, 6).map((f) => (
                  <li key={f.sku} className="flex justify-between gap-2 py-2">
                    <span>
                      {f.nombre} <span className="text-xs text-muted-foreground">{f.sku}</span>
                    </span>
                    <Pill estado={f.saldo <= 3 ? 'pierde' : 'bajo'}>
                      {f.saldo <= 3 ? 'Crítico' : 'Bajo'} · {numero(f.saldo)}
                    </Pill>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </Panel>
      </div>
    </div>
  );
}
