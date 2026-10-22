'use client';
import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import type { PedidoVista, RespuestaPedidos } from '@/lib/sucursales/contratos';
import { etiquetaOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import { diasEntre, enZona, fechaValida, sumarDias } from '@/lib/sucursales/tiempo';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { DetallePedido } from './detalle-pedido';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { dinero, fechaCorta, numero } from './formato';
import { useLectura } from './use-lectura';
import { COLOR_ORIGEN, Etiqueta, colorPago } from './colores';

const MAX_DIAS = 7;

export function Pedidos({
  companyId,
  origen,
  zona,
}: {
  companyId: number;
  origen: FiltroOrigen;
  zona: string;
}) {
  const hoy = enZona(new Date(), zona).fecha;
  const [desde, setDesde] = useState(hoy);
  const [hasta, setHasta] = useState(hoy);
  const [pago, setPago] = useState('');
  const [pagina, setPagina] = useState(1);
  const [pedido, setPedido] = useState<PedidoVista | null>(null);
  const valido =
    fechaValida(desde) &&
    fechaValida(hasta) &&
    desde <= hasta &&
    hasta <= hoy &&
    diasEntre(desde, hasta) < MAX_DIAS;
  const q = new URLSearchParams({ desde, hasta, origen, pagina: String(pagina) });
  if (pago) q.set('pago', pago);
  const { datos, error, cargando, recargar } = useLectura<RespuestaPedidos>(
    valido ? `/api/sucursales/${companyId}/pedidos?${q}` : null,
  );
  // Cualquier cambio de filtro vuelve a la página 1.
  const cambiar = (fn: () => void) => {
    fn();
    setPagina(1);
  };
  const m = datos?.sucursal.moneda ?? 'MXN';
  const variosDias = desde !== hasta;

  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Desde</span>
          <input
            type="date"
            value={desde}
            max={hoy}
            onChange={(e) => cambiar(() => setDesde(e.target.value))}
            className={`${claseCampo} w-44`}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Hasta</span>
          <input
            type="date"
            value={hasta}
            max={hoy}
            onChange={(e) => cambiar(() => setHasta(e.target.value))}
            className={`${claseCampo} w-44`}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Forma de pago</span>
          <select
            value={pago}
            onChange={(e) => cambiar(() => setPago(e.target.value))}
            className={`${claseCampo} w-48`}
          >
            <option value="">Todas</option>
            {(datos?.metodos ?? []).map((x) => (
              <option key={x.metodo} value={x.metodo}>
                {x.etiqueta}
              </option>
            ))}
          </select>
        </label>
        <button
          type="button"
          onClick={() => cambiar(() => (setDesde(hoy), setHasta(hoy)))}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
        >
          Hoy
        </button>
        <button
          type="button"
          onClick={() => cambiar(() => (setDesde(sumarDias(hoy, -1)), setHasta(sumarDias(hoy, -1))))}
          className="h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm font-semibold"
        >
          Ayer
        </button>
      </div>

      {!valido ? (
        <p role="alert" className="rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm">
          Elige un periodo de hasta {MAX_DIAS} días, sin fechas futuras y con la fecha inicial antes de la
          final.
        </p>
      ) : !datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={1} />
        )
      ) : (
        <>
          {error && <ErrorCarga error={error} alReintentar={recargar} />}
          <AvisosLectura lecturas={[{ nombre: 'Periodo', info: datos.lectura }]} />
          {datos.lectura.estado !== 'error' && (
            <Tarjeta
              titulo="Pedidos"
              descripcion={`${numero(datos.total)} pedidos del periodo (${datos.lectura.estado === 'completa' ? 'lectura completa' : 'lectura parcial'}). Toca uno para ver el detalle.`}
              cuerpo={false}
            >
              {datos.pedidos.length === 0 ? (
                <Vacio titulo="Sin pedidos con estos filtros" />
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <table className="tabla w-full">
                      <thead>
                        <tr>
                          <th scope="col">{variosDias ? 'Fecha y hora' : 'Hora'}</th>
                          <th scope="col" className="numero">
                            Venta
                          </th>
                          <th scope="col" className="numero">
                            Descuento
                          </th>
                          <th scope="col">Pago</th>
                          <th scope="col">Origen</th>
                          <th scope="col" className="numero">
                            Productos
                          </th>
                          <th scope="col">
                            <span className="sr-only">Detalle</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {datos.pedidos.map((p) => (
                          <tr key={p.id}>
                            <td className="tabular whitespace-nowrap">
                              {variosDias ? `${fechaCorta(p.fecha)} ` : ''}
                              {p.hora}
                            </td>
                            <td className="numero">{dinero(p.ventaCent, m)}</td>
                            <td className="numero">{p.descuentoCent ? dinero(p.descuentoCent, m) : '—'}</td>
                            <td>
                              <Etiqueta color={colorPago(p.metodo)}>{p.pago}</Etiqueta>
                            </td>
                            <td>
                              <Etiqueta color={COLOR_ORIGEN[p.origen]}>{etiquetaOrigen[p.origen]}</Etiqueta>
                            </td>
                            <td className="numero">{numero(p.lineas.length)}</td>
                            <td>
                              <button
                                type="button"
                                onClick={() => setPedido(p)}
                                className="text-sm font-semibold underline"
                              >
                                Ver<span className="sr-only"> pedido {p.id}</span>
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <nav
                    aria-label="Paginación"
                    className="flex items-center justify-between gap-3 px-5 py-4 text-sm text-muted-foreground"
                  >
                    <span>
                      {(datos.pagina - 1) * datos.porPagina + 1}–
                      {Math.min(datos.pagina * datos.porPagina, datos.total)} de {numero(datos.total)}
                    </span>
                    <span className="flex gap-2">
                      <button
                        type="button"
                        disabled={datos.pagina <= 1}
                        onClick={() => setPagina(datos.pagina - 1)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 disabled:opacity-50"
                      >
                        <ChevronLeft size={15} aria-hidden="true" /> Anterior
                      </button>
                      <button
                        type="button"
                        disabled={datos.pagina >= datos.paginas}
                        onClick={() => setPagina(datos.pagina + 1)}
                        className="inline-flex h-9 items-center gap-1 rounded-lg border border-line-strong bg-surface px-3 disabled:opacity-50"
                      >
                        Siguiente <ChevronRight size={15} aria-hidden="true" />
                      </button>
                    </span>
                  </nav>
                </>
              )}
            </Tarjeta>
          )}
        </>
      )}
      <DetallePedido pedido={pedido} moneda={m} alCerrar={() => setPedido(null)} />
    </div>
  );
}
