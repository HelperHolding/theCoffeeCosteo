'use client';
import { Fragment, useMemo, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock3,
  ReceiptText,
  ShoppingBag,
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
                descripcion="Todos los estados. Hora local de la tienda. Un pedido que cambió después (cancelación, reclamo) lo indica."
                cuerpo={false}
              >
                {pedidos.length === 0 ? (
                  <Vacio titulo={q ? 'Ningún pedido coincide' : 'Sin pedidos en el periodo'} />
                ) : (
                  <div className="overflow-x-auto">
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
                        </tr>
                      </thead>
                      <tbody>
                        {pedidos.map((p) => {
                          const open = pedidoAbierto === p.id;
                          const E = ESTADO[p.clase];
                          return (
                            <Fragment key={p.id}>
                              <tr>
                                <td className="whitespace-nowrap font-medium">
                                  <button
                                    type="button"
                                    aria-expanded={open}
                                    onClick={() => setPedidoAbierto(open ? null : p.id)}
                                    className="inline-flex items-center gap-1.5 text-left hover:underline"
                                  >
                                    {open ? (
                                      <ChevronDown size={14} aria-hidden="true" className="shrink-0" />
                                    ) : (
                                      <ChevronRight size={14} aria-hidden="true" className="shrink-0" />
                                    )}
                                    <span className="tabular">
                                      {fechaCorta(p.fecha)} {hora(p.creado)}
                                    </span>
                                  </button>
                                  <span className="block pl-5 text-xs font-normal text-muted-foreground tabular">
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
                                  {p.estado_anterior && (
                                    <span className="block text-xs text-muted-foreground">
                                      Antes: {p.estado_anterior}
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
                                <td className="numero tabular">
                                  {dinero(Math.round(p.bruto * 100), moneda)}
                                </td>
                              </tr>
                              {open && (
                                <tr>
                                  <td colSpan={5} className="bg-surface-2/60">
                                    <ul className="space-y-2 py-2 text-sm">
                                      {p.productos.map((x, i) => (
                                        <li key={i}>
                                          <p className="font-medium">
                                            {x.unidades}× {x.nombre.trim()}{' '}
                                            <span className="font-normal text-ink-2 tabular">
                                              {dinero(Math.round(x.precio * 100), moneda)}
                                            </span>
                                          </p>
                                          {x.opciones.length > 0 && (
                                            <ul className="mt-1 flex flex-wrap gap-1.5">
                                              {x.opciones.map((o, j) => (
                                                <li key={j}>
                                                  <Etiqueta
                                                    color={TIPOS[tipoOpcion(o.categoria)].color}
                                                    titulo={o.categoria.trim()}
                                                  >
                                                    {o.descripcion.trim()}
                                                    {o.precio
                                                      ? ` +${dinero(Math.round(o.precio * 100), moneda)}`
                                                      : ''}
                                                  </Etiqueta>
                                                </li>
                                              ))}
                                            </ul>
                                          )}
                                        </li>
                                      ))}
                                      <li className="text-xs text-ink-2">
                                        Pago: {p.metodo_pago ?? 'sin dato'}
                                        {p.descuento_aliado !== null &&
                                          ` · descuento del aliado (Rappi) ${dinero(Math.round(p.descuento_aliado * 100), moneda)}`}
                                        {p.cambios > 0 &&
                                          ` · ${p.cambios} ${p.cambios === 1 ? 'cambio registrado' : 'cambios registrados'}`}
                                      </li>
                                    </ul>
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
            </>
          )}
        </>
      )}
    </div>
  );
}
