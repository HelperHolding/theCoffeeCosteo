import Link from 'next/link';
import { enlaceOc, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { dinero, nf } from '@/lib/comercializadora/importaciones';
import {
  diasDet,
  numDet,
  resumenBorradores,
  rutaRiesgo,
  type Borrador,
  type CtxFila,
  type FilaSemana,
  type riesgosVista,
  type tarjetasSemana,
} from '@/lib/comercializadora/estaSemana';
import { COLOR_CAT, fechaCorta } from '@/lib/comercializadora/planAbastos';
import { CopiarTexto } from './copiar-texto';
import { FilaPlegable } from './fila-plegable';
import { EtiquetaCat } from './plan-abastos';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const numero = 'text-right tabular-nums whitespace-nowrap';

/** Tarjetas de arriba: el dinero de la semana y el de cada categoría, con su error si no se pudo calcular. */
export function TarjetasSemana(p: {
  t: ReturnType<typeof tarjetasSemana>;
  k: 0 | 1;
  simple: boolean;
  rango: string;
}) {
  const { t } = p;
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="rounded-2xl border border-line border-t-4 border-t-bad bg-surface p-4 shadow-card">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          {p.k === 0 ? 'Dinero a disponer esta semana' : 'Dinero de la próxima semana'}
        </p>
        <p className="mt-1 font-display text-2xl font-bold tabular-nums text-bad">{dinero(t.total)}</p>
        <p className="text-xs text-ink-2">
          {t.nProv} {t.nProv === 1 ? 'proveedor' : 'proveedores'} · {t.nArt}{' '}
          {t.nArt === 1 ? 'artículo' : 'artículos'}
          {t.sinCosto ? ` · ${t.sinCosto} sin costo (el total es mayor)` : ''}
          {p.simple ? null : <span className="block">{p.rango}</span>}
        </p>
      </div>
      {t.cats.map((c) => (
        <div
          key={c.def.id}
          className="rounded-2xl border border-line border-t-4 bg-surface p-4 shadow-card"
          style={{ borderTopColor: COLOR_CAT[c.def.id] }}
        >
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {c.def.nombre}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{dinero(c.monto)}</p>
          <p className="text-xs text-ink-2">
            {c.n} {c.n === 1 ? 'artículo' : 'artículos'}
            {p.simple ? null : ` · ${c.def.sub}`}
            {c.err ? <span className="block text-bad">{c.err}</span> : null}
          </p>
        </div>
      ))}
    </div>
  );
}

/** _hoyDetalleHtml: lo que se pide, cuánto cuesta y cómo está el inventario HOY. */
function DetalleProveedor({
  items,
  k,
  ctx,
  colSpan,
}: {
  items: X[];
  k: 0 | 1;
  ctx: (r: X) => CtxFila | null;
  colSpan: number;
}) {
  return (
    <tr className="bg-surface-2">
      <td colSpan={colSpan} className="py-2 pl-8 pr-3">
        <div className="overflow-x-auto rounded-lg border border-line bg-surface">
          <table className="tabla min-w-[520px] text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className={numero}>Pides</th>
                <th className={numero}>Monto</th>
                <th className={numero} title="Físico menos comprometido">
                  Tienes hoy
                </th>
                <th className={numero}>Vendes / día</th>
                <th className={numero} title="Días que dura lo que hay hoy, sin contar lo que viene">
                  Alcanza
                </th>
                <th className={numero} title="Lo que tienes, más lo que viene, más lo que pides">
                  Quedas con
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((r) => {
                const q = r.sem[k],
                  c = ctx(r),
                  cont = !!r.contenedor;
                return (
                  <tr key={r.sku}>
                    <td>
                      {r.nombre}
                      <span className="block text-[10px] text-muted-foreground">
                        {r.sku}
                        {r.imp && cont ? ' · plan de contenedores' : ''}
                        {r.costo > 0 && !cont ? ` · ${dinero(r.costo)} c/u` : ''}
                        {r.s && r.s.lt ? ` · tarda ${r.s.lt} d` : ''}
                      </span>
                    </td>
                    <td className={numero}>
                      <b>{nf(q)}</b>
                      {cont ? ' cont.' : ''}
                    </td>
                    <td className={numero}>
                      {r.costo > 0 ? (
                        dinero(cont ? r.costo : q * r.costo)
                      ) : (
                        <span className="text-warn">sin costo</span>
                      )}
                    </td>
                    {c ? (
                      <>
                        <td
                          className={`${numero} ${c.tienes < 0 ? 'text-bad' : ''}`}
                          title={c.tienes < 0 ? 'Lo comprometido supera lo que hay en físico' : undefined}
                        >
                          <b>{numDet(c.tienes)}</b>
                          {c.enOC > 0 ? (
                            <span className="block text-[10px] text-muted-foreground">
                              +{numDet(c.enOC)} en camino
                            </span>
                          ) : null}
                        </td>
                        <td className={numero}>{c.consumo > 0 ? numDet(c.consumo) : '—'}</td>
                        <td className={numero}>{diasDet(c.diasHoy)}</td>
                        <td className={numero}>
                          <b>{numDet(c.quedas)}</b>
                          {c.diasQuedas === null ? null : (
                            <span className="block text-[10px] text-muted-foreground">
                              {diasDet(c.diasQuedas)}
                            </span>
                          )}
                        </td>
                      </>
                    ) : (
                      <td colSpan={4} className="text-muted-foreground">
                        Un contenedor junta varios productos: el detalle está en Importaciones
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </td>
    </tr>
  );
}

/** La tabla de proveedores de la semana: monto, pago, mínimo, Copiar pedido y Crear OC (solo esta semana). */
export function ProveedoresSemana(p: {
  filas: FilaSemana[];
  k: 0 | 1;
  simple: boolean;
  ocs: Record<string, PrellenadoOc | { error: string }>;
  ctx: (r: X) => CtxFila | null;
}) {
  const { filas, k } = p;
  if (!filas.length)
    return (
      <p className="py-6 text-center text-sm text-ink-2">
        No hay nada que pedir {k === 0 ? 'esta semana' : 'la próxima semana'} con los datos de hoy.
      </p>
    );
  const hayMin = !p.simple || filas.some((f) => f.minimo > 0);
  const cols = 5 + (hayMin ? 1 : 0);
  return (
    <div className="placa mb-4 overflow-x-auto">
      <table className="tabla min-w-[560px] text-sm">
        <thead>
          <tr>
            <th>Proveedor</th>
            <th className={numero}>Artículos</th>
            <th className={numero}>Monto</th>
            <th>Pago</th>
            {hayMin ? <th>Mínimo del proveedor</th> : null}
            <th />
          </tr>
        </thead>
        <tbody>
          {filas.map((f) => {
            const g = f.g,
              oc = p.ocs[g.key];
            return (
              <FilaPlegable
                key={g.key}
                etiqueta={g.nombre}
                claseTitulo="font-semibold"
                titulo={
                  <>
                    {g.nombre}
                    <EtiquetaCat cat={g.cat} />
                  </>
                }
                celdas={
                  <>
                    <td className={numero}>{f.n}</td>
                    <td className={`${numero} font-bold`}>
                      {f.monto > 0 ? dinero(f.monto) : '—'}
                      {f.sinCosto ? (
                        <span className="block text-[10px] font-normal text-warn">
                          +{f.sinCosto} sin costo
                        </span>
                      ) : null}
                    </td>
                    <td className="whitespace-nowrap text-xs">
                      {f.pago.txt}
                      {f.pago.dias > 0 ? (
                        <span className="block text-[10px] text-muted-foreground">
                          crédito {f.pago.dias} d
                        </span>
                      ) : null}
                      {!f.pago.vinculado ? (
                        <span
                          className="block text-[10px] text-muted-foreground"
                          title="No se encontró este proveedor en Zoho: se asume pago de contado"
                        >
                          sin proveedor de Zoho
                        </span>
                      ) : null}
                    </td>
                    {hayMin ? (
                      <td className="text-xs">
                        {f.minimo > 0 ? (
                          f.bajo ? (
                            <span className="text-warn">
                              Bajo el mínimo del proveedor ({dinero(f.minimo)}): faltan{' '}
                              {dinero(f.minimo - f.monto)}
                            </span>
                          ) : (
                            <span className="text-muted-foreground">
                              Mínimo {dinero(f.minimo)}
                              {f.cumple ? ' · cumple' : ''}
                            </span>
                          )
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ) : null}
                    <td className="whitespace-nowrap text-right">
                      <span className="inline-flex flex-wrap items-center justify-end gap-2">
                        {f.texto ? (
                          <CopiarTexto
                            texto={f.texto}
                            etiqueta="Copiar pedido"
                            ok="Pedido copiado: pégalo en el correo o WhatsApp del proveedor"
                          />
                        ) : (
                          <span className="text-xs text-warn">Sin proveedor asignado en el catálogo</span>
                        )}
                        {oc && !('error' in oc) ? (
                          <Link
                            href={enlaceOc(oc)}
                            className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
                          >
                            Crear OC
                          </Link>
                        ) : oc ? (
                          <span className="text-xs text-muted-foreground">{oc.error}</span>
                        ) : null}
                      </span>
                    </td>
                  </>
                }
                detalle={<DetalleProveedor items={f.items} k={k} ctx={p.ctx} colSpan={cols} />}
              />
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** "Se quedarían sin producto antes de que llegue un pedido de hoy" (_hoyRiesgos), los más graves primero. */
export function RiesgosSemana({ v, simple }: { v: ReturnType<typeof riesgosVista>; simple: boolean }) {
  if (!v.total) return null;
  return (
    <section className="mb-4 rounded-2xl border border-line bg-surface p-5 shadow-card">
      <h2 title="Lo que tienes (y lo que ya viene) dura menos que lo que tarda el proveedor: aunque pidas hoy habría días sin producto">
        Se quedarían sin producto antes de que llegue un pedido de hoy{' '}
        <span className="font-normal text-muted-foreground">({v.total})</span>
      </h2>
      {simple ? null : (
        <p className="mt-1 text-xs text-muted-foreground">
          {v.total} {v.total === 1 ? 'artículo' : 'artículos'}: lo que tienes (y lo que ya viene) dura menos
          que lo que tarda el proveedor. Aunque pidas hoy, habría días sin producto. Los más graves primero.
        </p>
      )}
      <div className="placa mt-3 overflow-x-auto">
        <table className="tabla text-xs">
          <thead>
            <tr>
              <th>Artículo</th>
              {simple ? null : <th>Proveedor</th>}
              <th className={numero}>Alcanza</th>
              <th className={numero}>El proveedor tarda</th>
              <th className={numero}>Días sin producto</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {v.lista.map((r) => (
              <tr key={r.cat + r.sku}>
                <td>
                  {r.nombre}
                  <EtiquetaCat cat={r.cat} />
                  {simple ? null : <span className="block text-[10px] text-muted-foreground">{r.sku}</span>}
                </td>
                {simple ? null : <td>{r.prov}</td>}
                <td className={numero}>{nf(r.alcanza)} d</td>
                <td className={numero}>{nf(r.lt)} d</td>
                <td className={`${numero} font-bold text-bad`}>{nf(r.gap)} d</td>
                <td className="text-right">
                  <Link href={rutaRiesgo(r.tab)} className="text-xs underline">
                    Ver
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.mas ? (
        <p className="mt-1.5 text-xs text-muted-foreground">
          +{v.mas} más: están en las pantallas de cada categoría.
        </p>
      ) : null}
    </section>
  );
}

const ACCION = {
  emitir: ['Emitir', 'border-ok text-ok'],
  ajustar: ['Emitir ajustando', 'border-warn text-warn'],
  borrar: ['Borrar', 'border-bad text-bad'],
} as const;
/**
 * "Borradores en Zoho por resolver" (_borrResolverHtml) con los borradores de zoho-sync (decisión 3): qué hacer con cada
 * uno según lo que pide el plan esta semana y la próxima. Abierto con "Ver todo"; plegado en la vista simple.
 */
export function BorradoresSemana({
  A,
  simple,
}: {
  A: { fecha: string; lista: Borrador[] };
  simple: boolean;
}) {
  if (!A.lista.length) return null;
  const r = resumenBorradores(A.lista);
  return (
    <details open={!simple} className="mb-4 rounded-2xl border border-line bg-surface p-4 shadow-card">
      <summary className="cursor-pointer text-sm">
        <b>Borradores en Zoho por resolver</b>{' '}
        <span className="text-ink-2">
          ({A.lista.length} · {dinero(r.tot)})
        </span>
        {simple ? <span className="ml-2 text-xs text-crema-strong">ver qué hacer con cada uno</span> : null}
      </summary>
      <p className="mb-2 mt-1 text-xs text-ink-2">
        Un borrador no es una compra: se emite o se borra el mismo día. Según lo que pide el plan (esta semana
        y la próxima): <b className="text-ok">{r.n.emitir} para emitir</b> ·{' '}
        <b className="text-warn">{r.n.ajustar} para emitir ajustando</b> ·{' '}
        <b className="text-bad">{r.n.borrar} para borrar</b>. Datos de zoho-sync
        {A.fecha ? ` del ${fechaCorta(A.fecha)}` : ''}.
      </p>
      <div className="placa mb-2 overflow-x-auto">
        <table className="tabla min-w-[560px] text-xs">
          <thead>
            <tr>
              <th>Folio</th>
              <th>Proveedor</th>
              <th className={numero} title="En pesos; las OCs en otra moneda no traen precio">
                Monto
              </th>
              <th>En borrador desde hace</th>
              <th>Qué pide el plan</th>
              <th>Qué hacer</th>
            </tr>
          </thead>
          <tbody>
            {A.lista.map((o) => (
              <FilaPlegable
                key={o.folio}
                etiqueta={o.folio}
                claseTitulo="whitespace-nowrap font-bold"
                titulo={o.folio}
                celdas={
                  <>
                    <td>{o.prov}</td>
                    <td className={numero}>{o.monto > 0 ? dinero(o.monto) : '—'}</td>
                    <td className="whitespace-nowrap">
                      {o.dias === null ? '—' : `${o.dias} ${o.dias === 1 ? 'día' : 'días'}`}
                    </td>
                    <td>
                      {o.nPlan} de {o.lineas.length} {o.lineas.length === 1 ? 'artículo' : 'artículos'}
                      <span className="block text-[10.5px] text-muted-foreground">{o.motivo}</span>
                    </td>
                    <td>
                      <span
                        className={`inline-block whitespace-nowrap rounded-md border px-2 py-0.5 text-[11px] font-bold ${ACCION[o.accion][1]}`}
                      >
                        {ACCION[o.accion][0]}
                      </span>
                    </td>
                  </>
                }
                detalle={o.lineas.map((l) => (
                  <tr key={o.folio + '|' + l.sku} className="bg-surface-2">
                    <td colSpan={2} className="pl-8">
                      {l.nom || l.sku}
                      <span className="block text-[10px] text-muted-foreground">{l.sku}</span>
                    </td>
                    <td className={numero}>{nf(l.q)} en el borrador</td>
                    <td colSpan={2}>
                      El plan pide <b>{nf(l.plan)}</b>
                      {l.viene > 0 ? ` · ya vienen ${nf(l.viene)}` : ''}
                    </td>
                    <td />
                  </tr>
                ))}
              />
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        {r.n.borrar ? (
          <CopiarTexto
            texto={r.textoBorrar}
            etiqueta={`Copiar folios por borrar (${r.n.borrar})`}
            ok="Folios copiados: bórralos en Zoho"
          />
        ) : null}
        <span>Emitir o borrar se hace en Zoho; al siguiente zoho-sync la lista se pone al día.</span>
      </div>
    </details>
  );
}
