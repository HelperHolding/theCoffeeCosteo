import Link from 'next/link';
import { Pill } from '@/components/portal/piezas';
import {
  kg,
  kpisCafe,
  ordenesCafe,
  ordPorQue,
  ordPorQueLargo,
  ordRevisar,
  type CorridaCafe,
  type PlanCafe,
} from '@/lib/comercializadora/cafe';
import { dinero, nf, pct, type Cuando } from '@/lib/comercializadora/importaciones';
import { enlaceOc, ocCafe } from '@/lib/comercializadora/crearOc';
import { CAFE_PROD } from '@/lib/comercializadora/paramsImpCafe';
import { CifraPlan, hrefPlan, SeccionPlan, TablaQuePedir, type GrupoQuePedir } from './vistas-plan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const RUTA = '/comercializadora/cafe';
const der = 'text-right tabular-nums';
const GRUPOS = ['White', 'Kraft', 'Black'];

/** _cafeKpisHtml. */
export function KpisCafe({ c }: { c: CorridaCafe }) {
  const k = kpisCafe(c),
    cc = c.cfg.cafe;
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta={`Café a comprar en ${cc.anio}`}
        valor={kg(k.kgComprar)}
        nota={`${k.crecimiento >= 0 ? '+' : ''}${Math.round(k.crecimiento * 1000) / 10}% vs ${nf(cc.compra_ant)} kg de ${cc.anio - 1}`}
        ayuda={`Escenario ${c.esc}. Rango de escenarios: ${k.rango}`}
      />
      <CifraPlan etiqueta="Rango de escenarios" valor={k.rango} nota="Pesimista – Optimista" />
      <CifraPlan
        etiqueta="Volumen a comprometer"
        valor={kg(k.comprometer)}
        nota={`${Math.round(cc.comprometer * 100)}% del pronóstico`}
      />
      <CifraPlan etiqueta="Mes más alto" valor={kg(k.pico)} nota={k.mesPico} tono="bajo" />
      <CifraPlan
        etiqueta="Ahorro con precios nuevos"
        valor={dinero(k.ahorro)}
        nota={`${Math.round(k.ahorroPct * 1000) / 10}% del costo vigente`}
        tono="ok"
      />
      <CifraPlan
        etiqueta="Sucursales al cierre"
        valor={nf(k.sucursalesCierre)}
        nota={`Operando en diciembre de ${cc.anio}`}
      />
    </div>
  );
}

/** _ordBarraHtml: lo que tienes, lo que viene y lo que falta para cubrir la necesidad. */
function BarraInventario({
  inv,
  oc,
  nec,
  vieja,
  borr,
  info,
}: {
  inv: number;
  oc: number;
  nec: number;
  vieja: number;
  borr: number;
  info: X;
}) {
  const I = Math.max(0, inv),
    T = Math.max(0, oc),
    N = Math.max(0, nec),
    D = I + T,
    F = Math.max(0, N - D),
    escala = Math.max(N, D, 1e-9);
  const p = (x: number) => `${Math.round((x / escala) * 1000) / 10}%`,
    u = (x: number) => nf(x, x < 10 && x % 1 ? 1 : 0);
  return (
    <>
      <div
        className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2"
        title={`Tienes ${u(inv)} · en camino ${u(T)} · necesitas ${u(N)}`}
      >
        {I > 0 ? <i className="bg-ok" style={{ width: p(I) }} /> : null}
        {T > 0 ? <i className="bg-crema" style={{ width: p(T) }} /> : null}
        {F > 0 ? <i className="bg-bad" style={{ width: p(F) }} /> : null}
        {D > N && N > 0 ? (
          <span
            className="absolute top-0 h-full w-0.5 bg-ink"
            style={{ left: p(N) }}
            title="Lo que necesitas"
          />
        ) : null}
      </div>
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
        <span>
          Tienes <b className={inv < 0 ? 'text-bad' : ''}>{inv < 0 ? u(inv) : u(I)}</b>
        </span>
        <span>
          En camino <b>{u(T)}</b>
          {info.llega ? <span className="text-muted-foreground"> (llega {info.llega})</span> : null}
          {vieja > 0 ? <span className="text-warn"> · vieja</span> : null}
          {borr > 0 ? <span className="text-warn"> · {u(borr)} en borrador</span> : null}
        </span>
        {info.dias ? (
          <span>
            Alcanza <b className={info.riesgo ? 'text-bad' : ''}>{info.dias}</b>
          </span>
        ) : null}
      </p>
    </>
  );
}

/** _cafeVistaPedir / _ordVistaHtml: el plan de abasto solo con café, por proveedor, con kilos y Crear OC. */
export function QuePedirCafe(p: {
  c: PlanCafe;
  cuando: Cuando;
  soloAcc: boolean;
  simple: boolean;
  editable: boolean;
  mm: Record<string, { minimo: number | null; maximo: number | null }> | null;
  srvCalc: string | null;
  params: Record<string, string | undefined>;
}) {
  const { c, simple } = p;
  if (!c.rows.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No encontré artículos de café tostado en el catálogo (busco nombres con &quot;café tostado&quot; o SKU
        que empiecen con INS-CAF-).
      </p>
    );
  const o = ordenesCafe(c, { cuando: p.cuando, soloAcc: p.soloAcc });
  const calc = p.srvCalc;
  const grupos: GrupoQuePedir[] = o.grupos.map(({ g, filas }) => {
    const oc = g.real && g.nEsta > 0 && p.editable ? ocCafe(c, g.key) : null;
    return {
      clave: g.key,
      nombre: g.nombre,
      chips: [
        ...(g.nEsta > 0
          ? [{ texto: `ESTA SEMANA · ${g.nEsta} art. · ${dinero(g.montoEsta)}`, estado: 'pierde' as const }]
          : []),
        ...(g.nProx > 0
          ? [{ texto: `PRÓXIMA · ${g.nProx} art. · ${dinero(g.montoProx)}`, estado: 'bajo' as const }]
          : []),
      ],
      accion: !g.real ? (
        <span className="text-xs text-warn">
          Sin proveedor asignado: asígnalo en el catálogo para crear la OC
        </span>
      ) : oc && !('error' in oc) ? (
        <Link
          href={enlaceOc(oc)}
          className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
        >
          Crear OC
        </Link>
      ) : null,
      filas: filas.map((f) => {
        const r = f.r,
          k = r.calc,
          kgT = (q: number) => (f.kgu && q > 0 ? ` · ≈ ${nf(q * f.kgu, 1)} kg` : '');
        const largo = ordPorQueLargo(r, p.mm, calc);
        return {
          clave: r.sku,
          nombre: r.nombre,
          sku: r.sku,
          visual: (
            <BarraInventario
              inv={k.invBase}
              oc={r.s.enOC}
              nec={k.necesito}
              vieja={r.stale}
              borr={r.borr}
              info={f}
            />
          ),
          pedir: (
            <div>
              {f.estado === 'esta' ? (
                <>
                  <p className="font-display text-lg font-bold tabular-nums">{nf(k.pedirEsta)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.montoEsta > 0 ? dinero(r.montoEsta) : 'sin costo'}
                    {kgT(k.pedirEsta)}
                  </p>
                  <Pill estado="pierde">ESTA SEMANA</Pill>
                  {k.pedirProx > 0 ? (
                    <p className="mt-1 text-xs">
                      y la próxima: <b>{nf(k.pedirProx)}</b>
                    </p>
                  ) : null}
                </>
              ) : f.estado === 'prox' ? (
                <>
                  <p className="font-display text-lg font-bold tabular-nums text-warn">{nf(k.pedirProx)}</p>
                  <p className="text-xs text-muted-foreground">
                    {r.montoProx > 0 ? dinero(r.montoProx) : 'sin costo'}
                    {kgT(k.pedirProx)}
                  </p>
                  <Pill estado="bajo">PRÓXIMA SEMANA</Pill>
                </>
              ) : f.estado === 'espera' ? (
                <Pill estado="neutro">ESPERAR OC</Pill>
              ) : f.estado === 'revisar' ? (
                <span title={`Parece cubierto, pero ${ordRevisar(r)}`}>
                  <Pill estado="bajo">REVISAR DATOS</Pill>
                </span>
              ) : (
                <Pill estado="ok">CUBIERTO</Pill>
              )}
              {k.fuente === 'local-sin-datos' ? (
                <p className="mt-1">
                  <Pill estado="bajo">REVISAR DATOS: falta proveedor o costo en Zoho</Pill>
                </p>
              ) : null}
            </div>
          ),
          quedas:
            f.quedas !== null ? (
              <div>
                <p className="font-semibold tabular-nums">{nf(f.quedas)}</p>
                <p className="text-xs text-muted-foreground">
                  {[
                    f.diasQuedas !== null ? `${nf(f.diasQuedas)} días` : '',
                    f.kgu && f.quedas > 0 ? `≈ ${nf(f.quedas * f.kgu, 1)} kg` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          porQue: ordPorQue(r, p.mm, calc),
          ayuda: largo,
          tono: (f.estado === 'esta'
            ? 'esta'
            : f.estado === 'prox'
              ? 'prox'
              : f.estado === 'espera'
                ? 'espera'
                : '') as GrupoQuePedir['filas'][number]['tono'],
        };
      }),
    };
  });
  const n = o.n,
    total = n.esta + n.prox + n.wait + n.ok + n.rev;
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <CifraPlan
          etiqueta="Pedir esta semana"
          valor={`${o.d.esta.length} ${o.d.esta.length === 1 ? 'artículo' : 'artículos'}`}
          nota={`${dinero(o.d.montoEsta)}${o.kgE > 0 ? ` · ≈ ${nf(o.kgE)} kg` : ''}${o.d.sinCostoE ? ` · ${o.d.sinCostoE} sin costo` : ''}`}
          tono="pierde"
        />
        <CifraPlan
          etiqueta="Pedir la próxima semana"
          valor={`${o.d.prox.length} ${o.d.prox.length === 1 ? 'artículo' : 'artículos'}`}
          nota={`${dinero(o.d.montoProx)}${o.kgP > 0 ? ` · ≈ ${nf(o.kgP)} kg` : ''}`}
          tono="bajo"
        />
        {simple ? null : (
          <>
            <CifraPlan
              etiqueta="Urgentes"
              valor={o.d.urg}
              nota="menos de 5 días de inventario"
              tono="pierde"
            />
            <CifraPlan
              etiqueta="Cubiertos"
              valor={n.ok}
              nota={`no hay que pedir todavía${n.rev ? ` · ${n.rev} por revisar datos` : ''}`}
              tono="ok"
            />
          </>
        )}
      </div>
      {simple || !total ? null : (
        <p className="mb-4 text-xs text-ink-2">
          <b>{n.esta}</b> pedir esta semana · <b>{n.prox}</b> la próxima · <b>{n.wait}</b> esperando OC
          {n.rev ? (
            <>
              {' '}
              · <b>{n.rev}</b> por revisar datos
            </>
          ) : null}{' '}
          · <b>{n.ok}</b> cubiertos
        </p>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['esta', `Esta semana (${o.d.esta.length})`],
            ['prox', `Próxima semana (${o.d.prox.length})`],
          ] as const
        ).map(([k, t]) => (
          <Link
            key={k}
            href={hrefPlan(RUTA, p.params, { cuando: p.cuando === k ? undefined : k })}
            aria-current={p.cuando === k ? 'true' : undefined}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${p.cuando === k ? 'border-ink font-bold' : 'border-line'}`}
          >
            {t}
          </Link>
        ))}
        {simple || p.cuando ? null : (
          <Link
            href={hrefPlan(RUTA, p.params, { todos: p.soloAcc ? '1' : undefined })}
            className="text-sm underline"
          >
            {p.soloAcc ? 'Ver todos los artículos' : 'Solo los que requieren acción'}
          </Link>
        )}
      </div>
      <TablaQuePedir
        grupos={grupos}
        simple={simple}
        columnaVisual="Inventario"
        vacio={
          p.cuando === 'esta'
            ? 'Nada que pedir esta semana.'
            : p.cuando === 'prox'
              ? 'Nada que pedir la próxima semana.'
              : 'Nada que pedir esta semana ni la próxima: el café está cubierto.'
        }
      />
      {simple ? null : (
        <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
          Calculado con el mismo cálculo del plan de abasto: consumo de los últimos {c.cfg.consumo.ventana}{' '}
          días, inventario disponible, OCs abiertas, lead time y {c.cfg.seg.dias} días de seguridad (se
          cambian en Configuración). Necesitas = venta diaria × (entrega del proveedor + seguridad) +
          aperturas.
        </p>
      )}
    </div>
  );
}

/** _cafeGrafica: kg por mes del escenario Base, con el mínimo y el máximo. */
function GraficaCafe({ R }: { R: X }) {
  const tl = R.timeline,
    mn = tl.total.min.mes,
    es = tl.total.esperado.mes,
    mx = tl.total.max.mes,
    lab = R.etiquetasMes,
    n = 12,
    Wd = 900,
    Hd = 240,
    ml = 52,
    mr = 10,
    mt = 14,
    mb = 34,
    bw = (Wd - ml - mr) / n,
    ph = Hd - mt - mb;
  let top = 0;
  for (let i = 0; i < n; i++) top = Math.max(top, mn[i], es[i], mx[i]);
  if (top <= 0) top = 1;
  const y = (v: number) => mt + ph - (v / top) * ph;
  const linea = (arr: number[]) => arr.map((v, j) => `${ml + j * bw + bw / 2},${y(v)}`).join(' ');
  return (
    <div>
      <p className="mb-1 flex flex-wrap gap-4 text-xs text-ink-2">
        <span className="text-crema-strong">— Esperado (Base)</span>
        <span>- - Mínimo (Pesimista) y máximo (Optimista)</span>
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="Kg de café por mes"
          className="block h-auto w-full min-w-[620px]"
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(top * f)}
                y2={y(top * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(top * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {nf(top * f)}
              </text>
            </g>
          ))}
          {es.map((v: number, i: number) => (
            <g key={i}>
              <rect
                x={ml + i * bw + bw * 0.2}
                y={mt + ph - Math.max(0, (v / top) * ph)}
                width={bw * 0.6}
                height={Math.max(0, (v / top) * ph)}
                rx="2"
                style={{ fill: 'var(--color-crema-soft)' }}
              >
                <title>{`${lab[i]}: ${nf(v)} kg (esperado) · mín ${nf(mn[i])} · máx ${nf(mx[i])}`}</title>
              </rect>
              <text
                x={ml + i * bw + bw / 2}
                y={Hd - 18}
                textAnchor="middle"
                fontSize="9.5"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {lab[i]}
              </text>
            </g>
          ))}
          <polyline
            points={linea(mn)}
            fill="none"
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <polyline
            points={linea(mx)}
            fill="none"
            style={{ stroke: 'var(--color-muted-foreground)' }}
            strokeWidth="1.5"
            strokeDasharray="4 3"
          />
          <polyline
            points={linea(es)}
            fill="none"
            style={{ stroke: 'var(--color-crema-strong)' }}
            strokeWidth="2.5"
          />
        </svg>
      </div>
    </div>
  );
}

/** _cafeVistaResumen: gráfica del año, de dónde sale el volumen y el arranque del año. */
export function ResumenCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    cr = R.calculadora,
    cc = c.cfg.cafe,
    red = c.ent.red;
  return (
    <>
      <SeccionPlan
        titulo="Café mes por mes"
        ayuda={`La compra de café de ${cc.anio} en los tres escenarios. Cada sucursal compra según los meses que lleva abierta (el mes de apertura incluye el inventario inicial), la estacionalidad del mes y el crecimiento por posicionamiento.`}
      >
        <GraficaCafe R={R} />
      </SeccionPlan>
      <SeccionPlan titulo="De dónde sale el volumen" ayuda={`Con el escenario ${c.esc}.`}>
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Concepto</th>
                <th className="text-right">Kg</th>
                <th className="text-right">% del total</th>
              </tr>
            </thead>
            <tbody>
              {cr.origenVolumen.filas.map((f: X) => (
                <tr key={f.concepto}>
                  <td>{f.concepto}</td>
                  <td className={der}>{kg(f.kg)}</td>
                  <td className={der}>{pct(f.pct, 1)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Total</td>
                <td className={der}>{kg(cr.origenVolumen.total.kg)}</td>
                <td className={der}>{pct(cr.origenVolumen.total.pct, 1)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Arranque del año">
        <p className="text-sm text-ink-2">
          {cc.q4_modo === 'auto'
            ? `El arranque del año sale de la plataforma: ${red.ini} sucursales operando (o por abrir antes del 1 de enero) y ${red.a0} aperturas al mes en octubre, noviembre y diciembre (${red.q4.join(' + ')} registradas por mes de apertura). Hoy operan ${red.activas}.`
            : `El arranque del año está capturado a mano en Parámetros (${nf(cc.escenarios[c.esc].ini)} sucursales al 1 de enero).`}
        </p>
      </SeccionPlan>
    </>
  );
}

/** _cafeVistaMensual. */
export function MensualCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    tl = R.timeline,
    lab = R.etiquetasMes,
    dm = R.detalleMensual;
  return (
    <SeccionPlan
      titulo="Kilos de café por mes"
      ayuda='Kg de café tostado por color. "Esperado", "Mínimo" y "Máximo" son los escenarios Base, Pesimista y Optimista. "A comprar" es el escenario activo con el ajuste general aplicado.'
    >
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              {GRUPOS.map((g) => (
                <th key={g} className="text-right">
                  {g} (esperado)
                </th>
              ))}
              <th className="text-right">Total esperado</th>
              <th className="text-right">Mínimo</th>
              <th className="text-right">Máximo</th>
              <th className="text-right">A comprar (escenario {c.esc})</th>
              <th className="text-right">Sucursales (cierre)</th>
              <th className="text-right">Kg por sucursal</th>
            </tr>
          </thead>
          <tbody>
            {lab.map((l: string, i: number) => (
              <tr key={l}>
                <td className="font-semibold">{l}</td>
                {GRUPOS.map((g) => (
                  <td key={g} className={der}>
                    {nf(tl.grupos[g].esperado.mes[i])}
                  </td>
                ))}
                <td className={der}>
                  <b>{nf(tl.total.esperado.mes[i])}</b>
                </td>
                <td className={der}>{nf(tl.total.min.mes[i])}</td>
                <td className={der}>{nf(tl.total.max.mes[i])}</td>
                <td className={der}>
                  <b>{nf(dm.kgComprar.mes[i])}</b>
                </td>
                <td className={der}>{nf(dm.sucursalesActivas[i])}</td>
                <td className={der}>{nf(dm.kgPorSucursal[i], 1)}</td>
              </tr>
            ))}
            <tr className="font-bold">
              <td>Total</td>
              {GRUPOS.map((g) => (
                <td key={g} className={der}>
                  {nf(tl.grupos[g].esperado.total)}
                </td>
              ))}
              <td className={der}>{nf(tl.total.esperado.total)}</td>
              <td className={der}>{nf(tl.total.min.total)}</td>
              <td className={der}>{nf(tl.total.max.total)}</td>
              <td className={der}>{nf(dm.kgComprar.total)}</td>
              <td />
              <td />
            </tr>
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _cafeVistaPrecios: compra por presentación, margen bruto, precios por bolsa y ahorro mes por mes. */
export function PreciosCafe({ c }: { c: CorridaCafe }) {
  const R = c.R,
    cp = R.comparativa,
    pv = R.precios,
    mb = cp.margenBruto;
  const nom: Record<string, string> = {};
  CAFE_PROD.forEach((x) => (nom[x.id] = x.nombre));
  return (
    <>
      <SeccionPlan
        titulo="Compra por presentación"
        ayuda="Bolsas, kilos y costo de compra del año con el precio vigente y con el precio nuevo. La venta a sucursales no cambia con el precio nuevo: el ahorro cae completo al margen."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Bolsas</th>
                <th className="text-right">Kg</th>
                <th className="text-right">Costo vigente</th>
                <th className="text-right">Costo nuevo</th>
                <th className="text-right">Ahorro</th>
                <th className="text-right">Ahorro %</th>
              </tr>
            </thead>
            <tbody>
              {[...cp.porPresentacion, { ...cp.total, id: 'Total' }].map((f: X) => (
                <tr key={f.id} className={f.id === 'Total' ? 'font-bold' : ''}>
                  <td className="font-semibold">{nom[f.id] || f.id}</td>
                  <td className={der}>{nf(f.bolsas)}</td>
                  <td className={der}>{nf(f.kg)}</td>
                  <td className={der}>{dinero(f.costoVigente)}</td>
                  <td className={der}>{dinero(f.costoNuevo)}</td>
                  <td className={der}>{dinero(f.ahorro)}</td>
                  <td className={der}>{pct(f.ahorroPct, 1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Margen bruto">
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th />
                <th className="text-right">Precio vigente</th>
                <th className="text-right">Precio nuevo</th>
                <th className="text-right">Diferencia</th>
              </tr>
            </thead>
            <tbody>
              {(
                [
                  ['Venta a sucursales', mb.ventaSucursales],
                  ['Costo de compra', mb.costoCompra],
                  ['Margen bruto', mb.margenBruto],
                ] as const
              ).map(([t, v]) => (
                <tr key={t}>
                  <td>{t}</td>
                  <td className={der}>{dinero(v.vigente)}</td>
                  <td className={der}>{dinero(v.nuevo)}</td>
                  <td className={der}>{dinero(v.diferencia)}</td>
                </tr>
              ))}
              <tr className="font-bold">
                <td>Margen %</td>
                <td className={der}>{pct(mb.margenPct.vigente, 1)}</td>
                <td className={der}>{pct(mb.margenPct.nuevo, 1)}</td>
                <td className={der}>{pct(mb.margenPct.diferencia, 1)} pts</td>
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan
        titulo="Precios por bolsa"
        ayuda="Costo de cada bolsa: el café por el peso de la bolsa más el empaque. Margen sobre el precio de venta a sucursal."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Café $/kg</th>
                <th className="text-right">Empaque</th>
                <th className="text-right">Costo bolsa</th>
                <th className="text-right">Precio de venta</th>
                <th className="text-right">Margen</th>
                <th className="text-right">Café nuevo $/kg</th>
                <th className="text-right">Costo bolsa nuevo</th>
                <th className="text-right">Ahorro por bolsa</th>
                <th className="text-right">Ahorro %</th>
              </tr>
            </thead>
            <tbody>
              {pv.vigentes.map((v: X, i: number) => {
                const nn = pv.nuevos[i];
                return (
                  <tr key={v.id}>
                    <td className="font-semibold">{nom[v.id] || v.id}</td>
                    <td className={der}>{dinero(v.precioKg)}</td>
                    <td className={der}>{nf(v.empaque, 2)}</td>
                    <td className={der}>{nf(v.costoBolsa, 2)}</td>
                    <td className={der}>{nf(v.precioVentaBolsa, 2)}</td>
                    <td className={der}>{pct(v.margen, 1)}</td>
                    <td className={der}>{dinero(nn.precioKgEfectivo)}</td>
                    <td className={der}>{nf(nn.costoBolsa, 2)}</td>
                    <td className={der}>{nf(nn.ahorroBolsa, 2)}</td>
                    <td className={der}>{pct(nn.ahorroPct, 1)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Ahorro mes por mes">
        <div className="overflow-x-auto">
          <table className="tabla max-w-2xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Costo vigente</th>
                <th className="text-right">Costo nuevo</th>
                <th className="text-right">Ahorro</th>
                <th className="text-right">Ahorro acumulado</th>
              </tr>
            </thead>
            <tbody>
              {cp.mensual.map((m: X) => (
                <tr key={m.etiqueta}>
                  <td className="font-semibold">{m.etiqueta}</td>
                  <td className={der}>{dinero(m.costoVigente)}</td>
                  <td className={der}>{dinero(m.costoNuevo)}</td>
                  <td className={der}>{dinero(m.ahorro)}</td>
                  <td className={der}>{dinero(m.ahorroAcumulado)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}
