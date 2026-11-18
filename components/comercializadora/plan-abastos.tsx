import Link from 'next/link';
import { claseCampo } from '@/lib/crm/formato';
import { enlaceOc, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { dinero, nf } from '@/lib/comercializadora/importaciones';
import {
  COLOR_CAT,
  dineroCorto,
  etiquetaSem,
  fechaCorta,
  pctSeg,
  PSEM_CATS,
  sinCon,
  type PlanProv,
  type familiasSem,
  type graficaSem,
  type Inc,
  type kpisSem,
  type queTrae,
  type seguimientoSem,
  type tablaArts,
  type tablaProvs,
  type tarjetasCat,
} from '@/lib/comercializadora/planAbastos';
import { CifraPlan, hrefPlan, SeccionPlan } from './vistas-plan';
import { FilaPlegable } from './fila-plegable';

export const RUTA_PLAN = '/comercializadora/plan-abastos';
type Params = Record<string, string | undefined>;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const numero = 'text-right tabular-nums whitespace-nowrap';
const guion = <span className="text-muted-foreground">—</span>;

/** Etiqueta de categoría (_psemTag). */
export function EtiquetaCat({ cat }: { cat: keyof typeof COLOR_CAT }) {
  const nombre = PSEM_CATS.find((d) => d.id === cat)?.nombre;
  return (
    <span
      className="ml-1.5 inline-block rounded-full px-2 py-0.5 align-[1px] text-[10px] font-bold text-white"
      style={{ background: COLOR_CAT[cat] }}
    >
      {nombre}
    </span>
  );
}

/** Aviso de la fuente de las cantidades (servidor o cálculo local) y de lo que no se pudo leer. */
export function AvisosPlanSem(p: {
  fuente: { tono: 'ok' | 'warn'; texto: string; extra: string[] } | null;
  lecturas: string[];
  simple: boolean;
}) {
  return (
    <>
      {p.fuente ? (
        <p
          role="status"
          className={`mb-3 rounded-lg px-3 py-2 text-sm ${p.fuente.tono === 'ok' ? 'bg-surface-2 text-ink-2' : 'bg-warn-soft text-warn'}`}
        >
          {p.fuente.texto}
          {!p.simple && p.fuente.extra.length ? ` ${p.fuente.extra.join(' ')}` : null}
        </p>
      ) : null}
      {p.lecturas.length ? (
        <p role="status" className="mb-3 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
          No se pudieron leer: {p.lecturas.join(', ')}. El cálculo puede salir distinto.
        </p>
      ) : null}
    </>
  );
}

/** _planSemCategoriasHtml: una tarjeta por categoría; un clic la quita o la incluye en el dinero a disponer (?sin=). */
export function TarjetasCategorias(p: {
  tarjetas: ReturnType<typeof tarjetasCat>;
  inc: Inc;
  Wv: number;
  simple: boolean;
  params: Params;
}) {
  return (
    <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {p.tarjetas.map((t) => (
        <Link
          key={t.def.id}
          href={hrefPlan(RUTA_PLAN, p.params, { sin: sinCon(p.inc, t.def.id) })}
          aria-label={`${t.on ? 'Quitar' : 'Incluir'} ${t.def.nombre} ${t.on ? 'del' : 'en el'} plan`}
          className={`block rounded-2xl border border-line border-t-4 p-4 shadow-card ${t.on ? 'bg-surface' : 'bg-surface-2 opacity-70'}`}
          style={{ borderTopColor: t.on ? COLOR_CAT[t.def.id] : undefined }}
        >
          <p className="flex flex-wrap items-center gap-2 text-sm font-bold">
            <span aria-hidden="true">{t.on ? '☑' : '☐'}</span>
            {t.def.nombre}
            {p.simple ? null : <span className="text-xs font-normal text-muted-foreground">{t.def.sub}</span>}
          </p>
          <p className="mt-1 font-display text-2xl font-bold tabular-nums">{dinero(t.total)}</p>
          <p className="text-xs text-ink-2">
            {p.simple ? null : `en las próximas ${p.Wv} semanas · `}
            {t.arts} {t.arts === 1 ? 'artículo' : 'artículos'}
            {p.simple ? null : ` · ${t.provs} ${t.provs === 1 ? 'proveedor' : 'proveedores'}`}
            <br />
            Esta semana <b>{dinero(t.esta)}</b>
            {p.simple ? null : (
              <>
                {' '}
                · próximas {t.k4} semanas <b>{dinero(t.prox4)}</b>
              </>
            )}
          </p>
          {t.aviso ? (
            <p className={`mt-1 text-xs ${t.error ? 'text-bad' : 'text-warn'}`}>
              {t.aviso}
              {t.error ? ' No se cuenta en los totales.' : ''}
            </p>
          ) : null}
          <p className="mt-1 text-xs text-muted-foreground">
            {t.on ? 'Incluido en el plan' : 'No incluido en el plan'}
          </p>
        </Link>
      ))}
    </div>
  );
}

/** _planSemKpisHtml. */
export function CifrasSem(p: { k: ReturnType<typeof kpisSem>; c: PlanProv; Wv: number; simple: boolean }) {
  const { k } = p;
  if (k.ninguna)
    return (
      <div className="mb-4 flex">
        <CifraPlan etiqueta="Compras incluidas" valor="Ninguna" nota="Marca arriba al menos una categoría" />
      </div>
    );
  const des = (d: { def: { id: keyof typeof COLOR_CAT; nombre: string }; monto: number }[]) =>
    d.length ? (
      <span className="block">
        {d.map((x, i) => (
          <span key={x.def.id}>
            {i ? ' · ' : ''}
            {x.def.nombre} <b>{dineroCorto(x.monto)}</b>
          </span>
        ))}
      </span>
    ) : null;
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta="Dinero para esta semana"
        valor={dinero(k.esta.monto)}
        tono="pierde"
        nota={
          <>
            {k.esta.n} {k.esta.n === 1 ? 'artículo' : 'artículos'}
            {k.esta.sinCosto ? ` · ${k.esta.sinCosto} sin costo` : ''}
            {des(k.esta.des)}
          </>
        }
      />
      <CifraPlan
        etiqueta={`Próximas ${k.k4} semanas`}
        valor={dinero(k.prox.monto)}
        tono="bajo"
        nota={
          <>
            {k.prox.sinCosto ? `${k.prox.sinCosto} líneas sin costo` : ''}
            {des(k.prox.des)}
          </>
        }
      />
      <CifraPlan
        etiqueta={`Total de ${p.Wv} semanas`}
        valor={dinero(k.total.monto)}
        nota={
          <>
            {k.total.pico > 0
              ? `Semana de mayor compra: ${etiquetaSem(p.c, k.total.kp, true)} (${dinero(k.total.pico)})`
              : 'sin compras en el horizonte'}
            {des(k.total.des)}
          </>
        }
      />
      {p.simple ? null : (
        <CifraPlan
          etiqueta="Se agotan antes de que llegue"
          valor={nf(k.rot)}
          ayuda="Se agotan antes de que pueda llegar un pedido hecho hoy: ya vas tarde en esos artículos"
          nota='artículos que ya van tarde (inventario + OC no alcanza el lead time; en importaciones, "ya va tarde")'
        />
      )}
    </div>
  );
}

/** _psemFamiliasHtml. */
export function FamiliasSem({ f, Wv }: { f: NonNullable<ReturnType<typeof familiasSem>>; Wv: number }) {
  return (
    <SeccionPlan titulo="Dónde se va el dinero" ayuda={`Próximas ${Wv} semanas · ${dinero(f.tot)}`}>
      <ul className="grid gap-2 text-sm">
        {f.lista.map((F) => (
          <li
            key={F.nombre}
            className="grid grid-cols-[88px_minmax(0,1fr)_104px] items-center gap-x-3 gap-y-1 md:grid-cols-[96px_minmax(80px,1fr)_118px_minmax(120px,1.3fr)]"
          >
            <span className="font-semibold">{F.nombre}</span>
            <span className="h-3 overflow-hidden rounded-md bg-surface-2">
              <i className="block h-full rounded-md bg-ink-2" style={{ width: `${F.ancho}%` }} />
            </span>
            <span className="whitespace-nowrap font-bold tabular-nums">
              {dineroCorto(F.monto)} <span className="font-normal text-muted-foreground">{F.pct}%</span>
            </span>
            <span className="col-span-full truncate text-xs text-ink-2 md:col-span-1" title={F.provs}>
              {F.provs}
            </span>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-xs text-muted-foreground">
        Jarabes, polvos, tisanas, desechables y café = <b>{f.cinco}%</b> de lo que se planea comprar.
      </p>
    </SeccionPlan>
  );
}

/**
 * _planSemGraficaComprasHtml: barras apiladas por categoría (claras = OCs ya emitidas, fuertes = plan), con 2 px de
 * superficie entre segmentos, leyenda siempre y el detalle de cada barra al pasar el cursor (title).
 */
export function GraficaSem(p: {
  g: ReturnType<typeof graficaSem>;
  cats: { id: keyof typeof COLOR_CAT; nombre: string }[];
  simple: boolean;
}) {
  const { g } = p,
    n = g.barras.length,
    max = g.vacio ? 1 : g.max;
  const Wd = 900,
    Hd = 240,
    ml = 58,
    mr = 10,
    mt = 16,
    mb = 36,
    bw = (Wd - ml - mr) / Math.max(1, n),
    ph = Hd - mt - mb;
  const y = (v: number) => mt + ph - (v / max) * ph;
  const xs = ml + g.np * bw;
  return (
    <div>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="Compras por semana y por categoría"
          className="block h-auto w-full"
          style={{ minWidth: Math.max(560, n * 38) }}
        >
          {(g.vacio ? [0] : [0, 0.5, 1]).map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(max * f)}
                y2={y(max * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(max * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {g.vacio ? '$0' : dineroCorto(max * f)}
              </text>
            </g>
          ))}
          {g.vacio ? (
            <text
              x={Wd / 2}
              y={mt + ph / 2}
              textAnchor="middle"
              fontSize="12"
              style={{ fill: 'var(--color-muted-foreground)' }}
            >
              Sin compras previstas ni emitidas en este periodo
            </text>
          ) : null}
          {g.barras.map((b, i) => {
            const x = ml + i * bw + bw * 0.19,
              w = bw * 0.62;
            let base = mt + ph;
            return (
              <g key={i}>
                <title>{b.tip}</title>
                <rect x={ml + i * bw} y={mt} width={bw} height={ph} fill="transparent" />
                {b.seg.map((s) => {
                  if (!(s.v > 0)) return null;
                  const h = Math.max(1.5, (s.v / max) * ph);
                  base -= h;
                  return (
                    <rect
                      key={s.def.id}
                      x={x}
                      y={base}
                      width={w}
                      height={Math.max(0.5, h - 2)}
                      rx="2"
                      style={{ fill: COLOR_CAT[s.def.id], opacity: b.tipo === 'pas' ? 0.4 : 1 }}
                    />
                  );
                })}
                {b.tot > 0 && bw >= 40 ? (
                  <text
                    x={x + w / 2}
                    y={base - 4}
                    textAnchor="middle"
                    fontSize="9.5"
                    style={{ fill: 'var(--color-ink-2)' }}
                  >
                    {dineroCorto(b.tot)}
                  </text>
                ) : null}
                {bw >= 30 || i % 2 === 0 ? (
                  <text
                    x={x + w / 2}
                    y={Hd - 20}
                    textAnchor="middle"
                    fontSize="9.5"
                    fontWeight={b.k === 0 ? 700 : 400}
                    style={{ fill: 'var(--color-muted-foreground)' }}
                  >
                    {b.etiqueta}
                  </text>
                ) : null}
              </g>
            );
          })}
          <line
            x1={xs}
            x2={xs}
            y1={mt}
            y2={mt + ph}
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeDasharray="2 3"
          />
          <text
            x={xs - 6}
            y={Hd - 4}
            textAnchor="end"
            fontSize="10"
            style={{ fill: 'var(--color-muted-foreground)' }}
          >
            compras ya emitidas
          </text>
          <text x={xs + 6} y={Hd - 4} fontSize="10" style={{ fill: 'var(--color-muted-foreground)' }}>
            plan de compra
          </text>
        </svg>
      </div>
      <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {p.cats.map((d) => (
          <span key={d.id}>
            <i
              className="mr-1 inline-block size-2.5 rounded-sm align-[-1px]"
              style={{ background: COLOR_CAT[d.id] }}
            />
            {d.nombre}
          </span>
        ))}
        <span className="text-muted-foreground">
          {p.simple
            ? 'Claras = OCs ya emitidas · fuertes = lo que toca comprar'
            : `Barras claras = OCs ya emitidas; barras fuertes = lo que toca comprar. Cada pedido se cuenta completo en la semana en que se hace${g.contenedor ? ` (un contenedor de importación son unos ${dineroCorto(g.contenedor)} de una vez)` : ''}${g.sinMonto ? ` · ${g.sinMonto} OC sin monto capturado no se grafican` : ''}`}
        </span>
      </p>
    </div>
  );
}

/** _psemQueTrae. */
export function QueTrae({ q, simple }: { q: ReturnType<typeof queTrae>; simple: boolean }) {
  if (!q.length) return null;
  return (
    <div className="mt-3 grid gap-1.5 border-t border-line pt-3 text-xs text-ink-2">
      <p className="font-bold text-ink">Qué trae cada barra alta</p>
      {q.map((x) => (
        <p key={x.k}>
          <b className="text-ink">
            {x.titulo} · {dineroCorto(x.total)}
          </b>
          {x.urgente > 0 ? (
            <span className="ml-1 font-bold text-bad">{dineroCorto(x.urgente)} ya va tarde</span>
          ) : null}
          {x.hoy ? ` · ${x.hoy}` : null}
          <br />
          {x.top.map((t, i) => (
            <span key={i}>
              {i ? ' · ' : ''}
              {t.nombre} <b>{dineroCorto(t.monto)}</b>
              {t.urg ? <span className="ml-1 font-bold text-bad">urgente</span> : null}
            </span>
          ))}
          {x.mas ? (
            <>
              {' '}
              · y {x.mas.n} más <b>{dineroCorto(x.mas.monto)}</b>
            </>
          ) : null}
        </p>
      ))}
      {simple ? null : (
        <p className="text-muted-foreground">
          &quot;Ya va tarde&quot; = el modelo cree que se agota antes de que pueda llegar un pedido hecho hoy.
          Si el inventario o las OCs no están al día (ver &quot;Datos del plan&quot; en Indicadores), estas
          barras salen infladas.
        </p>
      )}
    </div>
  );
}

/** _planSemToolbarHtml: vista, búsqueda, proveedor y semanas (GET, conserva los demás parámetros). */
export function BarraSem(p: {
  params: Params;
  vista: 'proveedor' | 'articulo';
  q: string;
  prov: string;
  Wv: number;
  semanas: number[];
  proveedores: [string, string][];
}) {
  return (
    <div className="mb-3 flex flex-wrap items-center gap-2">
      <nav aria-label="Vista de la tabla" className="flex gap-1.5">
        {(
          [
            ['proveedor', 'Por proveedor'],
            ['articulo', 'Por artículo'],
          ] as const
        ).map(([v, t]) => (
          <Link
            key={v}
            href={hrefPlan(RUTA_PLAN, p.params, { vista: v === 'proveedor' ? undefined : v })}
            aria-current={p.vista === v ? 'page' : undefined}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.vista === v ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
          >
            {t}
          </Link>
        ))}
      </nav>
      <form action={RUTA_PLAN} className="flex flex-1 flex-wrap items-center gap-2">
        {['det', 'sin', 'vista'].map((k) =>
          p.params[k] ? <input key={k} type="hidden" name={k} value={p.params[k]} /> : null,
        )}
        <input
          name="q"
          defaultValue={p.q}
          aria-label="Buscar"
          placeholder="Buscar proveedor, artículo o SKU..."
          className={`${claseCampo} min-w-44 flex-1`}
        />
        <select name="prov" defaultValue={p.prov} aria-label="Proveedor" className={`${claseCampo} max-w-64`}>
          <option value="">Todos los proveedores</option>
          {p.proveedores.map(([k, t]) => (
            <option key={k} value={k}>
              {t}
            </option>
          ))}
        </select>
        <select
          name="sem"
          defaultValue={String(p.Wv)}
          aria-label="Semanas"
          className={`${claseCampo} max-w-36`}
        >
          {p.semanas.map((n) => (
            <option key={n} value={n}>
              {n} semanas
            </option>
          ))}
        </select>
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>
    </div>
  );
}

/** _planSemCelda: monto de un proveedor en una semana, con "sin costo" y "bajo mínimo". */
function CeldaSem({
  v,
  sinCosto,
  k,
  minimo,
  uds,
}: {
  v: number;
  sinCosto: number;
  k: number;
  minimo: number;
  uds: number;
}) {
  // "bajo mínimo" solo se afirma cuando todos los artículos de la celda tienen costo: con costos faltantes el monto es parcial
  const bajo = minimo > 0 && v > 0 && v < minimo && !sinCosto;
  return (
    <td className={`${numero} ${k === 0 && (v > 0 || sinCosto) ? 'bg-bad-soft' : ''}`}>
      {v > 0 ? (
        <span title={uds ? `${nf(uds)} piezas` : undefined} className={k === 0 ? 'font-bold' : 'font-medium'}>
          {dinero(v)}
        </span>
      ) : sinCosto ? (
        <span className="text-xs text-warn">sin costo</span>
      ) : (
        guion
      )}
      {v > 0 && sinCosto ? (
        <span
          className="block text-[10px] text-warn"
          title={`El monto no incluye ${sinCosto} ${sinCosto === 1 ? 'artículo' : 'artículos'} sin costo capturado: el total real es mayor`}
        >
          +{sinCosto} sin costo
        </span>
      ) : null}
      {bajo ? (
        <span
          className="block text-[10px] text-warn"
          title={`Menor al mínimo de compra del proveedor (${dinero(minimo)})`}
        >
          bajo mínimo
        </span>
      ) : null}
    </td>
  );
}

const cabSemanas = (c: PlanProv, Wv: number) =>
  Array.from({ length: Wv }, (_, k) => (
    <th key={k} className={numero} title={etiquetaSem(c, k, true)}>
      {k === 0 ? <b>Hoy</b> : fechaCorta(c.semIni[k])}
    </th>
  ));

/** _planSemTablaProvsHtml: categorías → proveedores → artículos × semanas, con "Crear OC" de lo que toca hoy. */
export function TablaProvsSem(p: {
  t: ReturnType<typeof tablaProvs>;
  c: PlanProv;
  Wv: number;
  /** "Crear OC" por grupo (solo con permiso de edición y si toca pedir hoy). */
  ocs: Record<string, PrellenadoOc | { error: string }>;
  hayCategorias: boolean;
}) {
  const { t, c, Wv } = p;
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {t.nProv} {t.nProv === 1 ? 'proveedor' : 'proveedores'} · clic en un proveedor para ver el detalle ·
        cada columna es una semana de {c.P} días (&quot;Hoy&quot; = lo que toca pedir ahora; el resto es lo
        que se prevé pedir). Los montos no incluyen artículos sin costo capturado (se avisa en cada celda).
      </p>
      <div className="placa overflow-x-auto">
        <table className="tabla text-xs" style={{ minWidth: 380 + Wv * 84 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-surface">Proveedor</th>
              {cabSemanas(c, Wv)}
              <th className={numero}>Total</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {!t.nProv ? (
              <tr>
                <td colSpan={Wv + 3} className="py-6 text-center text-ink-2">
                  {p.hayCategorias
                    ? 'Sin resultados con estos filtros'
                    : 'Marca arriba al menos una categoría para ver sus compras'}
                </td>
              </tr>
            ) : (
              <>
                {t.cats.map((cat) => [
                  <tr key={cat.def.id} className="bg-surface-2 font-bold">
                    <td className="sticky left-0 z-[1] bg-surface-2">
                      <span
                        className="mr-2 inline-block size-2.5 rounded-sm"
                        style={{ background: COLOR_CAT[cat.def.id] }}
                      />
                      {cat.def.nombre}{' '}
                      <span className="text-[10.5px] font-normal text-muted-foreground">
                        {cat.filas.length} {cat.filas.length === 1 ? 'proveedor' : 'proveedores'}
                      </span>
                    </td>
                    {cat.sub.map((v, k) => (
                      <td key={k} className={numero}>
                        {v > 0 ? dinero(v) : guion}
                      </td>
                    ))}
                    <td className={numero}>{dinero(cat.subT)}</td>
                    <td />
                  </tr>,
                  ...cat.filas.map(({ g, total, sinCosto, conCompra }) => {
                    const oc = p.ocs[g.key];
                    return (
                      <FilaPlegable
                        key={g.key}
                        etiqueta={g.nombre}
                        titulo={
                          <>
                            {g.nombre}
                            {g.minimo > 0 ? (
                              <span
                                className="ml-1 text-[10px] font-normal text-muted-foreground"
                                title="Mínimo de compra capturado"
                              >
                                mín. {dinero(g.minimo)}
                              </span>
                            ) : null}{' '}
                            <span className="text-[10px] font-normal text-muted-foreground">
                              {conCompra.length} art.
                            </span>
                          </>
                        }
                        celdas={
                          <>
                            {Array.from({ length: Wv }, (_, k) => (
                              <CeldaSem
                                key={k}
                                v={g.monto[k]}
                                sinCosto={g.sinCosto[k]}
                                k={k}
                                minimo={g.minimo}
                                uds={g.uds[k]}
                              />
                            ))}
                            <td className={`${numero} font-bold`}>
                              {total > 0 ? dinero(total) : '—'}
                              {sinCosto > 0 ? (
                                <span
                                  className="block text-[10px] font-normal text-warn"
                                  title="El total no incluye artículos sin costo capturado"
                                >
                                  +{sinCosto} sin costo
                                </span>
                              ) : null}
                            </td>
                            <td className="whitespace-nowrap text-right">
                              {oc && !('error' in oc) ? (
                                <Link
                                  href={enlaceOc(oc)}
                                  title="Abre una orden de compra con lo que toca pedir hoy a este proveedor"
                                  className="rounded-[10px] bg-ink px-3 py-1.5 text-xs font-semibold text-white"
                                >
                                  Crear OC
                                </Link>
                              ) : oc ? (
                                <span className="text-[10.5px] text-muted-foreground">{oc.error}</span>
                              ) : null}
                            </td>
                          </>
                        }
                        detalle={conCompra.map((r: X) => (
                          <tr key={g.key + '|' + r.sku} className="bg-surface-2">
                            <td className="sticky left-0 z-[1] bg-surface-2 pl-8">
                              {r.nombre}
                              <span className="block text-[10px] text-muted-foreground">
                                {r.contenedor
                                  ? `plan de contenedores · se coloca ${fechaCorta(r.fechaLimite)}${r.llega ? ` · llega ${fechaCorta(r.llega)}` : ''}`
                                  : `${r.sku} · lead time ${r.s.lt} d${r.costo > 0 ? ` · ${dinero(r.costo)} c/u` : ' · sin costo'}`}
                              </span>
                            </td>
                            {Array.from({ length: Wv }, (_, k) => (
                              <td
                                key={k}
                                className={`${numero} ${k === 0 && r.sem[k] > 0 ? 'bg-bad-soft font-bold' : ''}`}
                              >
                                {r.sem[k] > 0 ? nf(r.sem[k]) : guion}
                              </td>
                            ))}
                            <td className={numero}>
                              {nf(r.sem.slice(0, Wv).reduce((a: number, b: number) => a + b, 0))}{' '}
                              {r.contenedor ? 'cont.' : 'pzas'}
                            </td>
                            <td />
                          </tr>
                        ))}
                      />
                    );
                  }),
                ])}
                <tr className="border-t-2 border-line font-bold">
                  <td className="sticky left-0 z-[1] bg-surface">Total de lo incluido</td>
                  {t.tot.map((v, k) => (
                    <td key={k} className={numero}>
                      {v > 0 ? dinero(v) : '—'}
                      {t.totSC[k] ? (
                        <span className="block text-[10px] font-normal text-warn">
                          +{t.totSC[k]} sin costo
                        </span>
                      ) : null}
                    </td>
                  ))}
                  <td className={numero}>{dinero(t.gran)}</td>
                  <td />
                </tr>
              </>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** _planSemTablaArtsHtml. */
export function TablaArtsSem({
  filas,
  c,
  Wv,
}: {
  filas: ReturnType<typeof tablaArts>;
  c: PlanProv;
  Wv: number;
}) {
  return (
    <div>
      <p className="mb-1.5 text-xs text-muted-foreground">
        {filas.length} {filas.length === 1 ? 'artículo' : 'artículos'} con compra prevista en las próximas{' '}
        {Wv} semanas (piezas por semana).
      </p>
      <div className="placa overflow-x-auto">
        <table className="tabla text-xs" style={{ minWidth: 800 + Wv * 70 }}>
          <thead>
            <tr>
              <th className="sticky left-0 z-[1] bg-surface">Artículo</th>
              <th className={numero} title="Inventario base + OC abiertas">
                Disponible
              </th>
              <th className={numero} title="Consumo diario esperado">
                Consumo/día
              </th>
              <th className={numero} title="Venta regular al mes">
                Venta al mes
              </th>
              <th className={numero}>Lead time</th>
              <th className={numero} title="Fecha del primer pedido del calendario (Hoy = ya toca pedir)">
                Primer pedido
              </th>
              <th className={numero} title="Cuándo llegaría ese primer pedido">
                Llegaría
              </th>
              {cabSemanas(c, Wv)}
              <th className={numero}>Total pzas</th>
              <th className={numero}>$ total</th>
            </tr>
          </thead>
          <tbody>
            {!filas.length ? (
              <tr>
                <td colSpan={Wv + 9} className="py-6 text-center text-ink-2">
                  Sin resultados con estos filtros
                </td>
              </tr>
            ) : (
              filas.map(({ r, g, llega }) => {
                const imp = !!r.imp;
                let tq = 0,
                  tm = 0;
                for (let k = 0; k < Wv; k++) {
                  tq += r.sem[k];
                  if (r.costo > 0) tm += r.sem[k] * r.costo;
                }
                return (
                  <tr key={g.key + '|' + r.sku}>
                    <td className="sticky left-0 z-[1] bg-surface">
                      <span className="font-medium">{r.nombre}</span>
                      <EtiquetaCat cat={g.cat} />
                      {!imp && r.calc.urgencia === 'Urgente' ? (
                        <span className="ml-1 font-bold text-bad">Urgente</span>
                      ) : null}
                      <span className="block text-[10px] text-muted-foreground">
                        {r.sku} · {r.provNombre}
                      </span>
                    </td>
                    <td className={`${numero} ${!imp && r.calc.disponible < 0 ? 'text-bad' : ''}`}>
                      {imp ? guion : nf(r.calc.disponible)}
                    </td>
                    <td className={numero}>
                      {!imp && r.calc.consumo > 0
                        ? nf(r.calc.consumo, 1)
                        : imp && r.ventaMes > 0
                          ? nf(r.ventaMes / 30, 1)
                          : '—'}
                    </td>
                    <td className={numero}>
                      {imp
                        ? r.ventaMes > 0
                          ? nf(r.ventaMes)
                          : '—'
                        : r.calc.tasa > 0
                          ? nf(r.calc.tasa * 30)
                          : '—'}
                    </td>
                    <td className={numero}>{r.s.lt ? `${r.s.lt} d` : '—'}</td>
                    <td className={numero}>
                      {r.fechaLimite == null ? (
                        '—'
                      ) : r.fechaLimite <= c.hoyIso ? (
                        <b>Hoy</b>
                      ) : (
                        fechaCorta(r.fechaLimite)
                      )}
                    </td>
                    <td className={`${numero} text-ink-2`}>{llega ? fechaCorta(llega) : '—'}</td>
                    {Array.from({ length: Wv }, (_, k) => (
                      <td
                        key={k}
                        className={`${numero} ${k === 0 && r.sem[k] > 0 ? 'bg-bad-soft font-bold' : ''}`}
                      >
                        {r.sem[k] > 0 ? nf(r.sem[k]) : guion}
                      </td>
                    ))}
                    <td className={`${numero} font-bold`}>{nf(tq)}</td>
                    <td className={numero}>
                      {r.costo > 0 ? dinero(tm) : <span className="text-warn">sin costo</span>}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** _planSemSeguimientoHtml: lo proyectado frente a lo vendido, con la alerta de las dos últimas semanas completas. */
export function SeguimientoVentas({ s }: { s: ReturnType<typeof seguimientoSem> }) {
  if (s.estado === 'apagado')
    return (
      <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted-foreground">
        Seguimiento de ventas apagado: actívalo en Configuración &gt; Compras (semanas de seguimiento).
      </p>
    );
  if (s.estado === 'sin-historia')
    return (
      <p className="mb-4 rounded-xl border border-line bg-surface px-4 py-3 text-xs text-muted-foreground">
        Todavía no hay historia suficiente para comparar lo proyectado con lo vendido (se necesitan al menos
        14 días antes de cada semana).
      </p>
    );
  const tono = (d: number | null) =>
    d === null
      ? 'text-muted-foreground'
      : Math.abs(d) <= 0.1
        ? 'text-ok'
        : d > 0
          ? 'text-warn'
          : 'text-crema-strong';
  return (
    <SeccionPlan
      titulo="Seguimiento de ventas"
      ayuda={`Cada semana pasada: lo que el modelo habría proyectado con la historia anterior (venta valuada a costo) contra lo realmente vendido. Si lo real se aleja de lo proyectado, el plan lo va absorbiendo solo; aquí ves cuánto y en qué artículos.${s.sinMonto > 0 ? ` · ${s.sinMonto} OC locales sin monto capturado no se grafican` : ''}${s.mostradas < s.configuradas ? ` · se muestran ${s.mostradas} de las ${s.configuradas} semanas configuradas: las demás no tienen historia suficiente` : ''}`}
    >
      {s.alerta ? (
        <p role="status" className="mb-3 rounded-lg border border-warn/30 bg-warn-soft px-3 py-2 text-xs">
          Las ventas de las últimas 2 semanas completas van{' '}
          <b>{`${nf(s.alerta.pct)}% ${s.alerta.dir === 'arriba' ? 'por encima' : 'por debajo'}`}</b> de lo
          proyectado.{' '}
          {s.alerta.dir === 'arriba'
            ? 'El plan ya sube su ritmo conforme entran las ventas; si la tendencia sigue, conviene adelantar compras de los artículos de abajo.'
            : 'El plan ya baja su ritmo; revisa antes de comprar de más los artículos de abajo.'}
        </p>
      ) : null}
      <div className="flex flex-wrap items-start gap-4">
        <div className="placa min-w-0 flex-[1_1_280px] overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Semana</th>
                <th className={numero}>Proyectado</th>
                <th className={numero}>Vendido</th>
                <th className={numero}>Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {s.semanas.map((w) => (
                <tr key={w.j}>
                  <td className="whitespace-nowrap">
                    {fechaCorta(w.ini)} – {fechaCorta(w.fin)}
                    {w.j === 1 ? (
                      <span
                        className="ml-1 text-[10px] text-muted-foreground"
                        title="Incluye hoy, con el día todavía incompleto: no entra en la alerta"
                      >
                        (en curso)
                      </span>
                    ) : null}
                  </td>
                  <td className={numero}>{dinero(w.proy)}</td>
                  <td className={`${numero} font-semibold`}>{dinero(w.real)}</td>
                  <td className={`${numero} font-bold ${tono(w.desv)}`}>{pctSeg(w.desv)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {s.arts.length ? (
          <div className="placa min-w-0 flex-[1_1_280px] overflow-x-auto">
            <p className="px-3 pt-2 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              Artículos que más se desvían (piezas, semanas con proyección)
            </p>
            <table className="tabla text-xs">
              <thead>
                <tr>
                  <th>Artículo</th>
                  <th className={numero}>Proyectado</th>
                  <th className={numero}>Vendido</th>
                  <th className={numero}>Dif.</th>
                </tr>
              </thead>
              <tbody>
                {s.arts.map((a) => (
                  <tr key={a.sku}>
                    <td>
                      {a.nombre}
                      <span className="block text-[10px] text-muted-foreground">{a.sku}</span>
                    </td>
                    <td className={numero}>{nf(a.proy)}</td>
                    <td className={`${numero} font-semibold`}>{nf(a.real)}</td>
                    <td className={`${numero} font-bold ${a.dif > 0 ? 'text-warn' : 'text-crema-strong'}`}>
                      {pctSeg(a.desv)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>
    </SeccionPlan>
  );
}

/** _planSemComoHtml (40159) y _planSegTxt. */
export function ComoSeLee({
  c,
  imp,
}: {
  c: PlanProv;
  imp: { meses_cobertura: number; meses_respaldo: number };
}) {
  const cfg = c.cfg;
  const seg =
    cfg.seg.metodo === 'estadistico'
      ? `lead time + ${cfg.seg.revision} días de revisión + stock de seguridad estadístico (nivel de servicio ${Math.round(cfg.seg.servicio * 1000) / 10}%)`
      : `lead time + ${cfg.seg.dias} días de seguridad`;
  return (
    <details className="mt-4 text-xs leading-relaxed text-ink-2">
      <summary className="cursor-pointer font-semibold text-ink">Cómo se lee este plan</summary>
      <ul className="ml-5 mt-2 grid list-disc gap-1">
        <li>
          <b>Tres categorías</b>, cada una con su método: <b>Todo lo demás</b> y <b>Café</b> usan el cálculo
          del Plan de abasto (venta diaria, lead time y días de seguridad: {seg}); <b>Importaciones</b> usa el
          modelo de contenedores (cada pedido cubre {imp.meses_cobertura} meses más {imp.meses_respaldo} de
          respaldo). Marca o desmarca arriba qué categorías incluir en el dinero a disponer.
        </li>
        <li>
          <b>Hoy</b> es lo que toca pedir ahora. En Todo lo demás y Café las semanas siguientes siguen el
          mismo cálculo; en Importaciones se cuenta el primer pedido de cada producto (en la semana en que hay
          que colocarlo) y los contenedores del plan de embarques que caen dentro de las {c.W} semanas.
        </li>
        <li>
          <b>Se recalcula con las ventas</b>: cada pedido nuevo cambia el consumo y, con él, las semanas. Las
          semanas de {c.P} días se cuentan desde hoy.
        </li>
        <li>
          <b>Los $ de las semanas futuras son una previsión</b>, no un compromiso: lo que toca pedir ahora es
          la columna Hoy. &quot;Bajo mínimo&quot; significa que esa semana sola no alcanza el mínimo de compra
          del proveedor: se puede juntar con la semana siguiente.
        </li>
        <li>
          <b>Compras ya emitidas</b> (barras claras de la gráfica): OCs con monto de las últimas 6 semanas,
          separadas por categoría según sus artículos. Un borrador de Zoho no cuenta. Si faltan, ponlas al día
          con Zoho en Órdenes de compra.
        </li>
      </ul>
    </details>
  );
}
