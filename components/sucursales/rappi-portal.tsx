'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ReceiptText,
  ShoppingBag,
  X,
} from 'lucide-react';
import type { CanalRappi, ClaseEstado, RappiPortalVista } from '@/lib/sucursales/rappi-portal';
import { Kpi, Tarjeta, Vacio } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { BarraCelda, COLOR_ORIGEN, Etiqueta, TIPOS, type TipoPersonalizacion } from './colores';
import { ErrorCarga, Esqueleto } from './estados';
import { dinero, fechaCorta, hace, numero } from './formato';
import { rango, SelectorPeriodo, type Periodo } from './periodo';
import { useLectura } from './use-lectura';

/**
 * Tienda normal y Turbo (validados con validate_palette.js: PASS; el aqua queda < 3:1 sobre la superficie, así que
 * siempre va con su nombre visible).
 */
const CANAL: Record<CanalRappi, { nombre: string; color: string }> = {
  normal: { nombre: 'Normal', color: COLOR_ORIGEN.rappi },
  turbo: { nombre: 'Turbo', color: '#6250d6' },
};

const ESTADO: Record<ClaseEstado, { icono: typeof CheckCircle2; clase: string }> = {
  terminado: { icono: CheckCircle2, clase: 'text-ok' },
  cancelado: { icono: Ban, clase: 'text-bad' },
  otro: { icono: Clock3, clase: 'text-ink-2' },
};

/** «2026-10-27T07:43:02» (hora local de la tienda, tal como la guarda el portal) → «07:43». */
const hora = (creado: string) => creado.slice(11, 16);

/** Color de una opción por su categoría en el menú de Rappi (heurística visual; no cambia ninguna cifra). */
function tipoOpcion(categoria: string): TipoPersonalizacion {
  const c = categoria.toLocaleLowerCase('es-MX');
  if (/tama/.test(c)) return 'tamano';
  if (/leche|creamer/.test(c)) return 'leche';
  if (/caf[eé]/.test(c)) return 'cafe';
  if (/miel|vainilla|caramelo|coco|jengibre|menta|chispitas|dulz/.test(c)) return 'dulzor';
  return 'extra';
}

/**
 * Pestaña Rappi · Portal de Rappi (docs/rappi-portal). Pedidos de la tienda normal y la Turbo que guarda el cron de n8n
 * cada 10 minutos. Venta = suma de productos antes de descuentos, con precio Rappi. Solo datos del portal.
 */
export function RappiPortal({
  companyId,
  zona,
  moneda,
  periodo,
  alCambiarPeriodo,
}: {
  companyId: number;
  zona: string;
  moneda: string;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const [buscar, setBuscar] = useState('');
  const [canal, setCanal] = useState<CanalRappi | 'todos'>('todos');
  const [abierto, setAbierto] = useState<string | null>(null);
  const [pedidoAbierto, setPedidoAbierto] = useState<string | null>(null);
  const { desde, hasta } = rango(periodo, zona);
  const { datos, error, cargando, recargar } = useLectura<RappiPortalVista>(
    `/api/sucursales/${companyId}/rappi-portal?desde=${desde}&hasta=${hasta}`,
    { intervaloMs: 120_000 },
  );

  const q = buscar.trim().toLocaleLowerCase('es-MX');
  const productos = useMemo(() => {
    if (!datos) return [];
    const lista = datos.productos.filter((p) => !q || p.nombre.toLocaleLowerCase('es-MX').includes(q));
    return canal === 'todos' ? lista : lista.filter((p) => p.porCanal[canal] > 0);
  }, [datos, q, canal]);
  const pedidos = useMemo(() => {
    if (!datos) return [];
    return datos.pedidos.filter(
      (p) =>
        (canal === 'todos' || p.canal === canal) &&
        (!q || p.id.includes(q) || p.productos.some((x) => x.nombre.toLocaleLowerCase('es-MX').includes(q))),
    );
  }, [datos, q, canal]);

  const t = datos ? (canal === 'todos' ? datos.totales : datos.porCanal[canal]) : null;
  const maxVenta = Math.max(1, ...productos.map((p) => p.ventaCent));
  const sinLectura = datos && !datos.ultimaOk;
  const falla = datos?.ultimaCorrida && !['ok', 'sin_ordenes'].includes(datos.ultimaCorrida.estado);

  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <SelectorPeriodo periodo={periodo} zona={zona} alCambiar={alCambiarPeriodo} />
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Tienda de Rappi</span>
          <select
            value={canal}
            onChange={(e) => setCanal(e.target.value as CanalRappi | 'todos')}
            className={`${claseCampo} w-40`}
          >
            <option value="todos">Normal + Turbo</option>
            <option value="normal">Normal</option>
            <option value="turbo">Turbo</option>
          </select>
        </label>
        <label className="min-w-48 flex-1 text-sm sm:max-w-xs">
          <span className="mb-1 block font-medium text-ink-2">Buscar producto o pedido</span>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className={claseCampo}
          />
        </label>
        {datos?.ultimaOk && (
          <p className="ml-auto text-xs text-ink-2">
            Última lectura del portal: {hace(Math.max(0, (Date.now() - Date.parse(datos.ultimaOk)) / 1000))}
          </p>
        )}
      </div>

      {!datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={2} />
        )
      ) : (
        <>
          {error && <ErrorCarga error={error} alReintentar={recargar} />}
          {falla && (
            <p className="placa flex items-start gap-2 px-3 py-2 text-sm text-ink-2" role="status">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
              <span>
                La última lectura del portal no terminó (
                {datos.ultimaCorrida?.estado === 'sesion_expirada' ? 'la sesión de Rappi caducó' : 'error'}).
                Lo de abajo es lo guardado hasta la última lectura correcta.
              </span>
            </p>
          )}
          {datos.faltantes.length > 0 && (
            <p className="placa flex items-start gap-2 px-3 py-2 text-sm text-ink-2">
              <AlertTriangle size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
              <span>
                El listado de Rappi contó pedidos que no devolvió, así que no aparecen aquí:{' '}
                {datos.faltantes
                  .map((f) => `${fechaCorta(f.fecha)} ${CANAL[f.canal].nombre} ${f.total - f.devueltos}`)
                  .join(' · ')}
                .
              </span>
            </p>
          )}

          {sinLectura ? (
            <Tarjeta>
              <Vacio titulo="Todavía no hay lecturas del portal de Rappi">
                Los pedidos aparecen aquí en cuanto corra el cron de n8n (cada 10 minutos).
              </Vacio>
            </Tarjeta>
          ) : (
            <>
              {t && (
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
                  <Kpi
                    etiqueta="Pedidos terminados"
                    valor={numero(t.pedidos)}
                    icono={ShoppingBag}
                    nota={
                      canal === 'todos'
                        ? `Normal ${numero(datos.porCanal.normal.pedidos)} · Turbo ${numero(datos.porCanal.turbo.pedidos)}`
                        : undefined
                    }
                  />
                  <Kpi
                    etiqueta="Venta en Rappi"
                    valor={dinero(t.ventaCent, moneda, false)}
                    icono={ReceiptText}
                    nota="Suma de productos con precio Rappi, antes de descuentos."
                  />
                  <Kpi
                    etiqueta="Cancelados o rechazados"
                    valor={numero(t.cancelados)}
                    icono={Ban}
                    nota={
                      t.cancelados ? `${dinero(t.canceladosCent, moneda, false)} en productos` : undefined
                    }
                  />
                  <Kpi
                    etiqueta="Con reclamo"
                    valor={numero(t.enDisputa)}
                    icono={AlertTriangle}
                    tono={t.enDisputa ? 'bajo' : 'neutro'}
                    nota={t.otros ? `${numero(t.otros)} en otro estado (en curso)` : undefined}
                  />
                </div>
              )}

              <Tarjeta
                titulo="Productos"
                descripcion="Pedidos terminados. Al abrir un producto se ven las opciones que eligieron los clientes (bebida, leche, café, tamaño, miel…), con los nombres del menú de Rappi."
                cuerpo={false}
              >
                {productos.length === 0 ? (
                  <Vacio titulo={q ? 'Ningún producto coincide' : 'Sin pedidos terminados en el periodo'} />
                ) : (
                  <div className="overflow-x-auto">
                    <table className="tabla w-full">
                      <thead>
                        <tr>
                          <th scope="col">Producto</th>
                          <th scope="col" className="numero">
                            Unidades
                          </th>
                          <th scope="col">Tienda</th>
                          <th scope="col" className="numero">
                            Venta
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {productos.map((p) => {
                          const open = abierto === p.nombre;
                          const categorias = [...new Set(p.opciones.map((o) => o.categoria))];
                          return (
                            <Fragment key={p.nombre}>
                              <tr>
                                <td className="font-medium">
                                  {p.opciones.length ? (
                                    <button
                                      type="button"
                                      aria-expanded={open}
                                      onClick={() => setAbierto(open ? null : p.nombre)}
                                      className="inline-flex items-center gap-1.5 text-left hover:underline"
                                    >
                                      {open ? (
                                        <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
                                      ) : (
                                        <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                                      )}
                                      {p.nombre}
                                    </button>
                                  ) : (
                                    <span className="pl-5">{p.nombre}</span>
                                  )}
                                </td>
                                <td className="numero tabular">{numero(p.unidades)}</td>
                                <td>
                                  <span className="flex flex-wrap gap-1.5">
                                    {(['normal', 'turbo'] as const)
                                      .filter((c) => p.porCanal[c] > 0)
                                      .map((c) => (
                                        <Etiqueta key={c} color={CANAL[c].color}>
                                          {CANAL[c].nombre} {numero(p.porCanal[c])}
                                        </Etiqueta>
                                      ))}
                                  </span>
                                </td>
                                <td className="numero">
                                  <span className="flex items-center justify-end gap-2">
                                    <span className="w-20">
                                      <BarraCelda
                                        valor={p.ventaCent}
                                        max={maxVenta}
                                        color={COLOR_ORIGEN.rappi}
                                      />
                                    </span>
                                    <span className="tabular">{dinero(p.ventaCent, moneda, false)}</span>
                                  </span>
                                </td>
                              </tr>
                              {open && (
                                <tr>
                                  <td colSpan={4} className="bg-surface-2/60">
                                    <div className="grid gap-4 py-2 sm:grid-cols-2 lg:grid-cols-3">
                                      {categorias.map((c) => (
                                        <div key={c}>
                                          <p className="mb-1.5 text-xs font-semibold text-ink-2">{c}</p>
                                          <ul className="flex flex-wrap gap-1.5">
                                            {p.opciones
                                              .filter((o) => o.categoria === c)
                                              .map((o) => (
                                                <li key={o.descripcion}>
                                                  <Etiqueta color={TIPOS[tipoOpcion(o.categoria)].color}>
                                                    {o.descripcion} · {numero(o.veces)}
                                                  </Etiqueta>
                                                </li>
                                              ))}
                                          </ul>
                                        </div>
                                      ))}
                                    </div>
                                  </td>
                                </tr>
                              )}
                            </Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Tarjeta>

              <Tarjeta
                titulo="Pedidos"
                descripcion="Todos los estados. Hora local de la tienda. «Ver detalle» abre el resumen de la orden como en el portal de Rappi."
                cuerpo={false}
              >
                {pedidos.length === 0 ? (
                  <Vacio titulo={q ? 'Ningún pedido coincide' : 'Sin pedidos en el periodo'} />
                ) : (
                  <div className="relative overflow-x-auto">
                    <table className="tabla w-full">
                      <thead>
                        <tr>
                          <th scope="col">Pedido</th>
                          <th scope="col">Tienda</th>
                          <th scope="col">Estado</th>
                          <th scope="col">Productos</th>
                          <th scope="col" className="numero">
                            Total
                          </th>
                          <th scope="col">
                            <span className="sr-only">Detalle</span>
                          </th>
                        </tr>
                      </thead>
                      <tbody>
                        {pedidos.map((p) => {
                          const E = ESTADO[p.clase];
                          return (
                            <tr key={p.id}>
                              <td className="whitespace-nowrap font-medium">
                                <span className="tabular">
                                  {fechaCorta(p.fecha)} {hora(p.creado)}
                                </span>
                                <span className="block text-xs font-normal text-muted-foreground tabular">
                                  #{p.id}
                                </span>
                              </td>
                              <td>
                                <Etiqueta color={CANAL[p.canal].color}>{CANAL[p.canal].nombre}</Etiqueta>
                              </td>
                              <td className="text-sm">
                                <span className="inline-flex items-center gap-1.5">
                                  <E.icono size={15} aria-hidden="true" className={E.clase} />
                                  {p.estado_nombre}
                                </span>
                                {p.en_disputa && (
                                  <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-2">
                                    <AlertTriangle size={12} aria-hidden="true" className="text-warn" />
                                    Con reclamo
                                  </span>
                                )}
                                {p.revisar && (
                                  <span className="block text-xs text-muted-foreground">
                                    Ya no aparece en el portal
                                  </span>
                                )}
                              </td>
                              <td className="max-w-md text-sm">
                                {p.productos.map((x) => `${x.unidades}× ${x.nombre.trim()}`).join(', ')}
                              </td>
                              <td className="numero tabular">{dinero(Math.round(p.bruto * 100), moneda)}</td>
                              <td className="whitespace-nowrap text-right">
                                <button
                                  type="button"
                                  onClick={() => setPedidoAbierto(p.id)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-line px-2.5 py-1 text-xs font-semibold text-ink-2 hover:bg-surface-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-ink"
                                >
                                  Ver detalle
                                  <span className="sr-only"> del pedido {p.id}</span>
                                </button>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Tarjeta>
            </>
          )}
        </>
      )}
      <DetalleOrden
        pedido={datos?.pedidos.find((p) => p.id === pedidoAbierto) ?? null}
        moneda={moneda}
        alCerrar={() => setPedidoAbierto(null)}
      />
    </div>
  );
}

type PedidoVista = RappiPortalVista['pedidos'][number];

/**
 * Resumen de una orden, con la misma estructura que el panel del portal de Rappi: cada producto con su precio, sus
 * acompañamientos (también los de $0.00), subtotal y total después de descuentos. Cajón lateral (dialog nativo: foco
 * atrapado y Esc cierra). Total después de descuentos = subtotal − descuento del aliado (discount_info del detalle).
 */
function DetalleOrden({
  pedido,
  moneda,
  alCerrar,
}: {
  pedido: PedidoVista | null;
  moneda: string;
  alCerrar: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (pedido && !d.open) d.showModal();
    if (!pedido && d.open) d.close();
  }, [pedido]);
  const pesos = (valor: number) => dinero(Math.round(valor * 100), moneda);
  const E = pedido ? ESTADO[pedido.clase] : null;
  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={(e) => e.target === ref.current && alCerrar()}
      aria-labelledby="cajon-rappi-titulo"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md overflow-y-auto border-l border-line bg-surface p-0 shadow-lift backdrop:bg-ink/40"
    >
      {pedido && E && (
        <div className="space-y-4 p-5">
          <header className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h2 id="cajon-rappi-titulo" className="font-display text-xl font-bold tabular">
                Orden {pedido.id}
              </h2>
              <p className="mt-1.5 flex flex-wrap items-center gap-2 text-sm text-ink-2">
                <span className="inline-flex items-center gap-1.5">
                  <E.icono size={15} aria-hidden="true" className={E.clase} />
                  {pedido.estado_nombre}
                </span>
                <Etiqueta color={CANAL[pedido.canal].color}>{CANAL[pedido.canal].nombre}</Etiqueta>
              </p>
            </div>
            <button
              type="button"
              onClick={alCerrar}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-line hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ink"
            >
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Cerrar</span>
            </button>
          </header>

          <section className="rounded-xl border border-line p-4">
            <div className="flex items-baseline justify-between gap-3 border-b border-line pb-3">
              <h3 className="font-display font-bold">Resumen de la orden</h3>
              <span className="text-xs text-muted-foreground tabular">
                {fechaCorta(pedido.fecha)} · {hora(pedido.creado)}
              </span>
            </div>
            <ul className="divide-y divide-line">
              {pedido.productos.map((x, i) => (
                <li key={i} className="py-3">
                  <p className="flex items-baseline justify-between gap-3">
                    <span>
                      <span className="mr-2 text-ink-2 tabular">{x.unidades}</span>
                      {x.nombre.trim()}
                    </span>
                    <span className="tabular">{pesos(x.precio)}</span>
                  </p>
                  {x.opciones.length > 0 && (
                    <>
                      <p className="mt-2 text-xs font-semibold text-ink-2">Acompañamientos</p>
                      <ul className="mt-1 space-y-1">
                        {x.opciones.map((o, j) => (
                          <li key={j} className="flex items-baseline justify-between gap-3 text-xs">
                            <span className="flex min-w-0 items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className="size-1.5 shrink-0 rounded-full"
                                style={{ backgroundColor: TIPOS[tipoOpcion(o.categoria)].color }}
                              />
                              <span className="truncate">
                                {o.unidades > 1 ? `${o.unidades}× ` : ''}
                                {o.descripcion.trim()}
                                <span className="text-muted-foreground">
                                  {' '}
                                  · {o.categoria.trim().replace(/\.$/, '')}
                                </span>
                              </span>
                            </span>
                            <span className="text-ink-2 tabular">{pesos(o.precio)}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </li>
              ))}
            </ul>
            <dl className="space-y-1.5 border-t border-line pt-3 text-sm">
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Subtotal</dt>
                <dd className="tabular">{pesos(pedido.bruto)}</dd>
              </div>
              {pedido.descuento_aliado !== null ? (
                <>
                  <div className="flex justify-between gap-3">
                    <dt className="text-ink-2">Descuento del aliado</dt>
                    <dd className="tabular">−{pesos(pedido.descuento_aliado)}</dd>
                  </div>
                  <div className="flex justify-between gap-3 pt-1 text-base">
                    <dt className="font-display font-bold">Total después de descuentos</dt>
                    <dd className="font-display font-bold tabular">
                      {pesos(pedido.bruto - pedido.descuento_aliado)}
                    </dd>
                  </div>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  El descuento de esta orden aún no se lee del portal.
                </p>
              )}
            </dl>
          </section>

          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
            <dt className="text-ink-2">Pago</dt>
            <dd>{pedido.metodo_pago ?? 'Sin dato'}</dd>
            {pedido.en_disputa && (
              <>
                <dt className="text-ink-2">Reclamo</dt>
                <dd>Abierto{pedido.estado_disputa ? ` (${pedido.estado_disputa})` : ''}</dd>
              </>
            )}
            {pedido.estado_anterior && (
              <>
                <dt className="text-ink-2">Antes</dt>
                <dd>{pedido.estado_anterior}</dd>
              </>
            )}
            {pedido.cambios > 0 && (
              <>
                <dt className="text-ink-2">Cambios</dt>
                <dd>
                  {pedido.cambios} {pedido.cambios === 1 ? 'registrado' : 'registrados'} desde que se leyó
                </dd>
              </>
            )}
            {pedido.revisar && (
              <>
                <dt className="text-ink-2">Aviso</dt>
                <dd>Ya no aparece en el portal de Rappi</dd>
              </>
            )}
          </dl>
          <p className="text-xs text-muted-foreground">
            Datos del portal de Rappi. No incluye nombre ni datos del cliente.
          </p>
        </div>
      )}
    </dialog>
  );
}
