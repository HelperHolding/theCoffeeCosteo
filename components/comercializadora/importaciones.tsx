import Link from 'next/link';
import { Pill } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import {
  ahoraImp,
  detalleImp,
  dinero,
  fImp,
  kpisImp,
  mesImp,
  nf,
  nu,
  porQueImp,
  textoContenedores,
  tonoEstadoImp,
  type Cuando,
  type CorridaImp,
} from '@/lib/comercializadora/importaciones';
import { enlaceOc, ocImportaciones } from '@/lib/comercializadora/crearOc';
import { masDias } from '@/lib/comercializadora/fechas';
import { CifraPlan, hrefPlan, SeccionPlan, TablaQuePedir, type GrupoQuePedir } from './vistas-plan';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const RUTA = '/comercializadora/importaciones';
const der = 'text-right tabular-nums';

function Estado({ e }: { e: string }) {
  return <Pill estado={tonoEstadoImp(e)}>{e}</Pill>;
}

/** _impKpisHtml: pedir en 30 días, ya va tarde, primer quiebre, próximo contenedor y sucursales. */
export function KpisImp({ c }: { c: CorridaImp }) {
  const k = kpisImp(c);
  return (
    <div className="mb-4 flex flex-wrap gap-3">
      <CifraPlan
        etiqueta="Pedir en los próximos 30 días"
        valor={`${k.pedir30.n} ${k.pedir30.n === 1 ? 'producto' : 'productos'}`}
        nota={`Inversión ${dinero(k.pedir30.inversion)}`}
        tono="pierde"
      />
      <CifraPlan
        etiqueta="Pedido ya va tarde"
        valor={k.tarde}
        nota={`En riesgo de quedarse sin producto: ${k.riesgo}`}
        tono="bajo"
      />
      <CifraPlan
        etiqueta="Primer quiebre"
        valor={k.quiebre ? k.quiebre.producto : 'Sin quiebre'}
        nota={k.quiebre ? `Se acaba el ${fImp(k.quiebre.fecha)}` : 'En todo el horizonte'}
      />
      <CifraPlan
        etiqueta="Próximo contenedor"
        valor={k.contenedor ? fImp(k.contenedor.colocar) : '—'}
        nota={
          k.contenedor
            ? `Colocar · llega ${fImp(k.contenedor.llega)} · ${k.contenedor.estado}`
            : 'Sin pedido de contenedor'
        }
        ayuda={`Fecha en la que hay que colocar el pedido del siguiente contenedor de ${k.proveedorContenedor}`}
      />
      <CifraPlan
        etiqueta="Sucursales"
        valor={nf(k.sucursales.hoy)}
        nota={`Fin del horizonte (${k.sucursales.mesFin}): ${nf(k.sucursales.fin)}`}
      />
    </div>
  );
}

/** _impLineaHtml: con producto (verde), sin producto (rojo) y ya repuesto; marcas de cuándo pedir y cuándo llega. */
function LineaTiempo({ q, linea, fin, simple }: { q: X; linea: X; fin: string; simple: boolean }) {
  if (!linea)
    return (
      <>
        {simple ? null : <div className="h-2.5 rounded-full bg-ok" />}
        <p className="mt-1 text-xs text-muted-foreground">Alcanza más allá de {fin}</p>
      </>
    );
  return (
    <>
      {simple ? null : (
        <div
          className="relative flex h-2.5 overflow-hidden rounded-full bg-surface-2"
          title={`Con producto hasta el ${fImp(q.seAcaba)}`}
        >
          {linea.ok ? <i className="bg-ok" style={{ width: `${linea.ok}%` }} /> : null}
          {linea.gap ? (
            <i className="bg-bad" style={{ width: `${linea.gap}%` }} title="Sin producto" />
          ) : null}
          {linea.resp ? <i className="bg-ok-soft" style={{ width: `${linea.resp}%` }} /> : null}
          {linea.pedir !== null ? (
            <span
              className="absolute top-0 h-full w-0.5 bg-ink"
              style={{ left: `${linea.pedir}%` }}
              title={`Colocar el pedido: ${fImp(q.colocarPedido)}`}
            />
          ) : null}
          {linea.llega !== null ? (
            <span
              className="absolute top-0 h-full w-0.5 bg-crema-strong"
              style={{ left: `${linea.llega}%` }}
              title={`Llega: ${fImp(q.llegaCedis)}`}
            />
          ) : null}
        </div>
      )}
      <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-ink-2">
        <span>
          Se acaba <b>{fImp(q.seAcaba)}</b>
        </span>
        {q.cantidadPedir > 0 && q.colocarPedido ? (
          <>
            <span>
              Pedir el <b>{fImp(q.colocarPedido)}</b>
            </span>
            <span>
              Llega <b>{fImp(q.llegaCedis)}</b>
            </span>
          </>
        ) : null}
        {q.diasSinProducto > 0 ? <b className="text-bad">{nf(q.diasSinProducto)} días sin producto</b> : null}
      </p>
    </>
  );
}

/** _impVistaAhora: esta semana y la próxima, por proveedor, con la línea de tiempo y Crear OC. */
export function QuePedirImp(p: {
  c: CorridaImp;
  cuando: Cuando;
  soloAcc: boolean;
  simple: boolean;
  editable: boolean;
  params: Record<string, string | undefined>;
}) {
  const { c, simple } = p;
  const d = ahoraImp(c, { cuando: p.cuando, soloAcc: p.soloAcc });
  const total = d.nE + d.nP + d.espera + d.ok;
  const grupos: GrupoQuePedir[] = d.grupos.map((g) => {
    const oc = g.esta && p.editable ? ocImportaciones(c, g.clave) : null;
    return {
      clave: g.clave,
      nombre: g.nombre,
      chips: [
        ...(g.esta
          ? [{ texto: `ESTA SEMANA · ${g.esta} art. · ${dinero(g.montoEsta)}`, estado: 'pierde' as const }]
          : []),
        ...(g.prox
          ? [{ texto: `PRÓXIMA · ${g.prox} art. · ${dinero(g.montoProx)}`, estado: 'bajo' as const }]
          : []),
      ],
      accion:
        oc && !('error' in oc) ? (
          <Link
            href={enlaceOc(oc)}
            className="rounded-[10px] bg-ink px-3 py-1.5 text-sm font-semibold text-white"
          >
            Crear OC
          </Link>
        ) : null,
      filas: g.filas.map((f) => {
        const q = f.q;
        return {
          clave: f.sku,
          nombre: q.producto,
          sku: f.sku,
          marca: f.urgente ? <b className="ml-2 text-bad">YA VA TARDE</b> : null,
          detalle: (
            <span className="mt-1 block text-xs text-ink-2">
              Tienes <b>{nu(q.stockHoy, 1)}</b>
              {q.yaComprado > 0 ? (
                <>
                  {' '}
                  · En camino <b>{nu(q.yaComprado)}</b>
                  {f.borrador > 0 ? <span className="text-warn"> ({nu(f.borrador)} en borrador)</span> : null}
                </>
              ) : null}
            </span>
          ),
          visual: <LineaTiempo q={q} linea={f.linea} fin={d.fin} simple={simple} />,
          pedir:
            q.cantidadPedir > 0 ? (
              <div>
                <p
                  className={`font-display text-lg font-bold tabular-nums ${f.tipo === 'prox' ? 'text-warn' : ''}`}
                >
                  {nu(q.cantidadPedir)} <small className="text-xs font-normal">{q.unidad}</small>
                </p>
                <p className="text-xs text-muted-foreground">
                  {q.inversion > 0 ? dinero(q.inversion) : 'sin costo'}
                </p>
                <Pill estado={f.tipo === 'esta' ? 'pierde' : f.tipo === 'prox' ? 'bajo' : 'neutro'}>
                  {f.tipo === 'esta'
                    ? 'ESTA SEMANA'
                    : f.tipo === 'prox'
                      ? 'PRÓXIMA SEMANA'
                      : `COLOCAR EL ${fImp(q.colocarPedido).toUpperCase()}`}
                </Pill>
              </div>
            ) : (
              <Pill estado="ok">ALCANZA</Pill>
            ),
          quedas:
            f.queda !== null ? (
              <div>
                <p className="font-semibold tabular-nums">{nu(f.queda)}</p>
                <p className="text-xs text-muted-foreground">
                  {f.mesesQueda !== null ? `≈ ${nf(f.mesesQueda, 1)} meses · ` : ''}al llegar
                </p>
              </div>
            ) : (
              <span className="text-muted-foreground">—</span>
            ),
          porQue: (
            <>
              {porQueImp(q, c)}
              {f.nota ? <span className="mt-1 block text-muted-foreground">{f.nota}</span> : null}
            </>
          ),
          ayuda: porQueImp(q, c),
          tono: (f.tipo ?? '') as 'esta' | 'prox' | '',
        };
      }),
    };
  });
  const cuandoHref = (k: Cuando) => hrefPlan(RUTA, p.params, { cuando: p.cuando === k ? undefined : k });
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-3">
        <CifraPlan
          etiqueta="Pedir esta semana"
          valor={`${d.nE} ${d.nE === 1 ? 'artículo' : 'artículos'}`}
          nota={dinero(d.mE)}
          tono="pierde"
        />
        <CifraPlan
          etiqueta="Pedir la próxima semana"
          valor={`${d.nP} ${d.nP === 1 ? 'artículo' : 'artículos'}`}
          nota={dinero(d.mP)}
          tono="bajo"
        />
        {simple ? null : (
          <>
            <CifraPlan
              etiqueta="Pedido ya va tarde"
              valor={d.urg}
              nota="se acaba antes de que llegue un pedido hecho hoy"
              tono="pierde"
            />
            <CifraPlan
              etiqueta="Sin pedido por ahora"
              valor={d.ok}
              nota={`alcanzan más allá de ${d.fin}`}
              tono="ok"
            />
          </>
        )}
      </div>
      {simple || !total ? null : (
        <div className="mb-4">
          <div className="flex h-2.5 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
            {(
              [
                [d.nE, 'bg-bad'],
                [d.nP, 'bg-warn'],
                [d.espera, 'bg-line-strong'],
                [d.ok, 'bg-ok'],
              ] as const
            ).map(([v, cl], i) =>
              v ? <i key={i} className={cl} style={{ width: `${(v / total) * 100}%` }} /> : null,
            )}
          </div>
          <p className="mt-1 text-xs text-ink-2">
            <b>{d.nE}</b> pedir esta semana · <b>{d.nP}</b> la próxima · <b>{d.espera}</b> se pedirán después
            · <b>{d.ok}</b> sin pedido por ahora
          </p>
        </div>
      )}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        {(
          [
            ['esta', `Esta semana (${d.nE})`],
            ['prox', `Próxima semana (${d.nP})`],
          ] as const
        ).map(([k, t]) => (
          <Link
            key={k}
            href={cuandoHref(k)}
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
        columnaVisual="Cuándo se acaba y cuándo llega"
        vacio={
          p.cuando === 'esta'
            ? 'Nada que pedir esta semana.'
            : p.cuando === 'prox'
              ? 'Nada que pedir la próxima semana.'
              : 'Nada que pedir esta semana ni la próxima.'
        }
      />
      {simple ? null : (
        <p className="mt-3 max-w-4xl text-xs text-muted-foreground">
          Calculado con el modelo de tu Sheet de importados: cada pedido cubre{' '}
          {c.cfg.imp.politica.meses_cobertura} meses más {c.cfg.imp.politica.meses_respaldo} de respaldo, con
          el lead time de cada proveedor. En la línea de tiempo, la marca oscura es cuándo pedir y la café
          cuándo llega; el tramo rojo son los días sin producto.
        </p>
      )}
    </div>
  );
}

/** _impVistaPedir: detalle por artículo, agrupado por proveedor, con búsqueda, proveedor y solo con acción. */
export function DetalleImp(p: {
  c: CorridaImp;
  q: string;
  prov: string;
  soloAcc: boolean;
  params: Record<string, string | undefined>;
}) {
  const { c } = p;
  const grupos = detalleImp(c, { q: p.q, prov: p.prov, soloAcc: p.soloAcc });
  const m = c.ent.meta;
  return (
    <div>
      <form action={RUTA} className="mb-3 flex flex-wrap items-center gap-2">
        {['vista', 'esc', 'det'].map((k) =>
          p.params[k] ? <input key={k} type="hidden" name={k} value={p.params[k]} /> : null,
        )}
        <input
          name="q"
          defaultValue={p.q}
          aria-label="Buscar"
          placeholder="Buscar artículo o SKU..."
          className={`${claseCampo} max-w-64`}
        />
        <select name="prov" defaultValue={p.prov} aria-label="Proveedor" className={`${claseCampo} max-w-56`}>
          <option value="">Todos los proveedores</option>
          {c.cfg.imp.prov.map((x: X) => (
            <option key={x.clave} value={x.clave}>
              {x.nombre}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" name="solo" value="1" defaultChecked={p.soloAcc} />
          Solo los que requieren acción
        </label>
        <button type="submit" className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white">
          Filtrar
        </button>
      </form>
      {!grupos.length ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          Ningún artículo coincide con el filtro.
        </p>
      ) : (
        grupos.map((g) => (
          <div key={g.nombre} className="mb-5">
            <p className="mb-2 flex flex-wrap items-baseline gap-3">
              <b>{g.nombre}</b>
              <span className="text-xs text-ink-2">
                {g.resumen
                  ? `Próximo pedido: colocar ${fImp(g.resumen.colocar)} · llega ${fImp(g.resumen.llega)} · ${g.resumen.productos} ${g.resumen.productos === 1 ? 'producto' : 'productos'} · inversión ${dinero(g.resumen.inversion)}${g.resumen.contenedores ? ` · ${nu(g.resumen.contenedores, 1)} ${g.resumen.contenedores > 1.05 ? 'contenedores' : 'contenedor'}` : ''}`
                  : 'Sin pedido en el horizonte'}
              </span>
            </p>
            <div className="placa overflow-x-auto">
              <table className="tabla text-xs">
                <thead>
                  <tr>
                    <th>Artículo</th>
                    <th className="text-right" title="Inventario con el que arranca el cálculo">
                      Inventario
                    </th>
                    <th className="text-right" title="Pendiente de llegar en OCs abiertas">
                      En camino
                    </th>
                    <th className="text-right" title="Promedio de los próximos 3 meses del modelo">
                      Venta al mes
                    </th>
                    <th className="text-right" title="Meses que alcanza el inventario más lo que viene">
                      Alcanza (meses)
                    </th>
                    <th className="text-right">Se acaba</th>
                    <th className="text-right" title="Se acaba menos lead time menos margen">
                      Pedir a más tardar
                    </th>
                    <th
                      className="text-right"
                      title="Se junta con otros del mismo proveedor dentro de la ventana de días"
                    >
                      Colocar pedido
                    </th>
                    <th className="text-right">Llega a CEDIS</th>
                    <th className="text-right">Cantidad</th>
                    <th className="text-right">Inversión</th>
                    <th>Estado</th>
                    <th>Nota</th>
                  </tr>
                </thead>
                <tbody>
                  {g.productos.map((x: X) => {
                    const q = x.quiebre,
                      mi = m.items[x.sku] || {};
                    const nota = [
                      q.nota,
                      q.compraPuente > 0 ? `Compra puente: ${nf(q.compraPuente)} ${q.unidad}` : '',
                    ]
                      .filter(Boolean)
                      .join(' · ');
                    return (
                      <tr key={x.sku}>
                        <td className="min-w-48">
                          <b>{q.producto}</b>
                          <span className="block font-mono text-[10px] text-muted-foreground">
                            {x.sku}
                            {mi.aviso && mi.aviso.length ? (
                              <span className="text-warn"> · {mi.aviso[0]}</span>
                            ) : null}
                          </span>
                        </td>
                        <td
                          className={der}
                          title={
                            mi.stockAjuste
                              ? `Inventario real ${nf(mi.stockReal, 1)} + ${nf(mi.stockAjuste, 1)} ya vendido este mes (el modelo cuenta el mes completo)`
                              : 'Inventario de la plataforma'
                          }
                        >
                          {nu(q.stockHoy, 1)}
                        </td>
                        <td className={der}>{nu(q.yaComprado)}</td>
                        <td className={der}>{nu(q.ventaMes3, 1)}</td>
                        <td className={der}>{q.mesesAlcanza == null ? '—' : nf(q.mesesAlcanza, 1)}</td>
                        <td className={der}>
                          {q.sinQuiebre ? (
                            <span className="text-muted-foreground">No en el horizonte</span>
                          ) : (
                            fImp(q.seAcaba)
                          )}
                        </td>
                        <td className={der}>{fImp(q.pedirATardar)}</td>
                        <td className={der}>{fImp(q.colocarPedido)}</td>
                        <td className={der}>{fImp(q.llegaCedis)}</td>
                        <td className={der}>{q.cantidadPedir > 0 ? <b>{nu(q.cantidadPedir)}</b> : '—'}</td>
                        <td className={der}>{q.inversion > 0 ? dinero(q.inversion) : '—'}</td>
                        <td>
                          <Estado e={q.estado} />
                        </td>
                        <td className="min-w-56 text-ink-2">{nota}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/** _impGraficaCbm: consumo mensual de vasos y tapas (CBM), lo que llega y el stock al cierre. */
export function GraficaCbm({ S }: { S: X }) {
  const ms = S.meses,
    n = ms.length,
    Wd = 900,
    Hd = 240,
    ml = 48,
    mr = 10,
    mt = 16,
    mb = 34,
    bw = (Wd - ml - mr) / n,
    ph = Hd - mt - mb;
  let mx = 0;
  ms.forEach(
    (m: X) => (mx = Math.max(mx, m.cbmVasosTapas || 0, m.cbmQueLlega || 0, m.stockVasosTapasCbm || 0)),
  );
  if (mx <= 0) mx = 1;
  const y = (v: number) => mt + ph - (v / mx) * ph;
  const pts: string[] = [];
  return (
    <div>
      <p className="mb-1 flex flex-wrap gap-4 text-xs text-ink-2">
        <span>▮ Consumo del mes (CBM)</span>
        <span className="text-crema-strong">▮ CBM que llega</span>
        <span className="text-bad">— Stock de vasos y tapas al cierre</span>
      </p>
      <div className="overflow-x-auto">
        <svg
          viewBox={`0 0 ${Wd} ${Hd}`}
          role="img"
          aria-label="CBM de vasos y tapas por mes"
          className="block h-auto w-full min-w-[620px]"
        >
          {[0, 0.5, 1].map((f) => (
            <g key={f}>
              <line
                x1={ml}
                x2={Wd - mr}
                y1={y(mx * f)}
                y2={y(mx * f)}
                style={{ stroke: 'var(--color-line)' }}
                strokeDasharray={f ? '3 3' : '0'}
              />
              <text
                x={ml - 6}
                y={y(mx * f) + 3}
                textAnchor="end"
                fontSize="10"
                style={{ fill: 'var(--color-muted-foreground)' }}
              >
                {nf(mx * f)}
              </text>
            </g>
          ))}
          {ms.map((m: X, j: number) => {
            const x = ml + j * bw + bw * 0.12,
              w = bw * 0.36,
              h1 = Math.max(0, ((m.cbmVasosTapas || 0) / mx) * ph),
              h2 = Math.max(0, ((m.cbmQueLlega || 0) / mx) * ph);
            pts.push(`${x + w},${y(m.stockVasosTapasCbm || 0)}`);
            return (
              <g key={j}>
                <rect
                  x={x}
                  y={mt + ph - h1}
                  width={w}
                  height={h1}
                  rx="2"
                  style={{ fill: 'var(--color-line-strong)' }}
                >
                  <title>{`${mesImp(m.inicio)}: consumo ${nf(m.cbmVasosTapas, 1)} CBM`}</title>
                </rect>
                <rect
                  x={x + w + 2}
                  y={mt + ph - h2}
                  width={w}
                  height={h2}
                  rx="2"
                  style={{ fill: 'var(--color-crema-strong)' }}
                >
                  <title>{`${mesImp(m.inicio)}: llegan ${nf(m.cbmQueLlega, 1)} CBM${m.llegaContenedor ? ` (${m.llegaContenedor})` : ''}`}</title>
                </rect>
                <text
                  x={x + w}
                  y={Hd - 18}
                  textAnchor="middle"
                  fontSize="9.5"
                  style={{ fill: 'var(--color-muted-foreground)' }}
                >
                  {mesImp(m.inicio)}
                </text>
              </g>
            );
          })}
          <polyline
            points={pts.join(' ')}
            fill="none"
            style={{ stroke: 'var(--color-bad)' }}
            strokeWidth="2"
          />
        </svg>
      </div>
    </div>
  );
}

/** _impVistaEmbarques: plan de contenedores del proveedor de contenedores, cantidades y cuántos caben. */
export function ContenedoresImp({ c }: { c: CorridaImp }) {
  const S = c.S,
    pl = S.plan,
    cont = c.ent.P.constantes.proveedorContenedor;
  if (!c.ent.items.some((it: X) => String(it.proveedor).toLowerCase() === String(cont).toLowerCase()))
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No hay artículos asignados al proveedor de contenedores ({cont}). Asigna los vasos y tapas a ese
        proveedor en Parámetros.
      </p>
    );
  const n = Math.min(pl.contenedores.length, 11),
    cs = pl.contenedores.slice(0, n),
    ct = S.contenedores;
  const color = (e: string) =>
    /PEDIR YA/.test(e)
      ? 'text-bad'
      : /este mes/.test(e)
        ? 'text-warn'
        : /Fuera/.test(e)
          ? 'text-muted-foreground'
          : 'text-ink-2';
  return (
    <>
      <SeccionPlan
        titulo={`Plan de contenedores de ${cont}`}
        ayuda="Cada contenedor se llena por CBM: cuántas cajas de cada artículo caben para que salga lleno, y cuándo hay que colocarlo para que llegue antes de que se acabe el anterior."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>#</th>
                <th className="text-right">Colocar</th>
                <th className="text-right">Llega</th>
                <th className="text-right">Alcanza hasta</th>
                <th className="text-right">Días que alcanza</th>
                <th
                  className="text-right"
                  title="CBM de vasos y tapas que se venden al día en el mes de llegada"
                >
                  CBM por día
                </th>
                <th className="text-right">Sucursales</th>
                <th className="text-right">CBM</th>
                <th className="text-right">Inversión</th>
                <th>Estado</th>
              </tr>
            </thead>
            <tbody>
              {cs.map((x: X) => (
                <tr key={x.n}>
                  <td className="font-semibold">{x.n}</td>
                  <td className={der}>{fImp(x.colocar)}</td>
                  <td className={der}>{fImp(x.llega)}</td>
                  <td className={der}>{fImp(x.alcanzaHasta)}</td>
                  <td className={der}>{nu(x.diasAlcanza)}</td>
                  <td className={der}>{nu(x.cbmDia, 1)}</td>
                  <td className={der}>{nu(x.sucursales)}</td>
                  <td className={der}>{nu(x.cbm, 1)}</td>
                  <td className={der}>{dinero(x.inversion)}</td>
                  <td className={`whitespace-nowrap font-semibold ${color(String(x.estado))}`}>
                    {String(x.estado).replace('(dic-27)', `(${mesImp(S.meses[14].inicio)})`)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan
        titulo="Cantidades por contenedor"
        ayuda="Cajas de cada artículo en cada contenedor. En rojo: cantidad menor al mínimo del proveedor (negocia o junta colores)."
      >
        <div className="overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th className="text-right">CBM por caja</th>
                {cs.map((x: X) => (
                  <th
                    key={x.n}
                    className="text-right"
                    title={`Colocar ${fImp(x.colocar)} · llega ${fImp(x.llega)}`}
                  >
                    C{x.n}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pl.cantidades.map((a: X) => (
                <tr key={a.producto}>
                  <td>
                    {a.producto}
                    {a.alias ? (
                      <span className="block text-[10px] text-muted-foreground">{a.alias}</span>
                    ) : null}
                  </td>
                  <td className={der}>{nf(a.cbmCaja, 4)}</td>
                  {a.porContenedor.slice(0, n).map((q: number, j: number) => (
                    <td
                      key={j}
                      className={`${der} ${a.minimoProveedor > 0 && q > 0 && q < a.minimoProveedor ? 'font-semibold text-bad' : ''}`}
                    >
                      {q > 0 ? nu(q) : '—'}
                    </td>
                  ))}
                </tr>
              ))}
              <tr className="font-bold">
                <td>CBM del contenedor</td>
                <td />
                {pl.totalCbm.slice(0, n).map((v: number, j: number) => (
                  <td key={j} className={der}>
                    {nu(v, 1)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      </SeccionPlan>
      <SeccionPlan titulo="Cuántos contenedores caben">
        <p className="text-sm text-ink-2">
          El próximo pedido necesita <b>{nu(ct.contenedoresProximoPedido, 1)}</b> contenedor(es).{' '}
          {ct.mesNoCabeEn1Texto === 'Ya desde hoy'
            ? 'Un solo contenedor ya no alcanza para un trimestre desde hoy.'
            : ct.mesNoCabeEn1
              ? `Desde ${mesImp(ct.mesNoCabeEn1)} un contenedor ya no alcanza para un trimestre.`
              : 'Un contenedor alcanza para un trimestre en todo el horizonte.'}
          {ct.mesNoCabeEn2
            ? ` Desde ${mesImp(ct.mesNoCabeEn2)} ni dos contenedores alcanzan: conviene pasar a embarques programados.`
            : ''}
        </p>
        <div className="mt-3 overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Sucursales</th>
                <th className="text-right">CBM consumidos</th>
                <th
                  className="text-right"
                  title={`Lo que cubre un pedido de ${c.cfg.imp.politica.meses_cobertura} meses`}
                >
                  CBM de un pedido
                </th>
                <th className="text-right">Contenedores necesarios</th>
                <th className="text-right">Meses que cubre 1</th>
                <th>Qué conviene</th>
              </tr>
            </thead>
            <tbody>
              {ct.meses.map((m: X) => (
                <tr key={m.mes}>
                  <td>{mesImp(m.mes)}</td>
                  <td className={der}>{nu(m.sucursales)}</td>
                  <td className={der}>{nu(m.cbmConsumidos, 1)}</td>
                  <td className={der}>{nu(m.cbmPedido, 1)}</td>
                  <td className={`${der} ${m.contenedoresNecesarios > 2 ? 'font-semibold text-bad' : ''}`}>
                    {nu(m.contenedoresNecesarios, 2)}
                  </td>
                  <td className={der}>{nu(m.mesesCubre1, 1)}</td>
                  <td className="text-xs">{m.queConviene}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}

/** _impVistaProyeccion. Decisión 9: el texto nombra el escenario que se está viendo (el viejo ponía el guardado). */
export function ProyeccionImp({ c }: { c: CorridaImp }) {
  const S = c.S;
  return (
    <SeccionPlan
      titulo="Proyección mensual"
      ayuda={`Cómo evoluciona la red de sucursales y el consumo de vasos y tapas durante los próximos 15 meses con el escenario ${c.esc}. El inventario en días es lo que queda al cierre del mes dividido entre el consumo diario: en rojo menos de 15 días, en ámbar menos de 30.`}
    >
      <div className="mb-3">
        <GraficaCbm S={S} />
      </div>
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Mes</th>
              <th className="text-right" title="Sucursales operando al inicio del mes">
                Sucursales
              </th>
              <th className="text-right">Aperturas</th>
              <th className="text-right" title="Vasos y tapas">
                CBM consumidos
              </th>
              <th className="text-right" title="Contenedores y compras ya hechas">
                CBM que llega
              </th>
              <th className="text-right">Stock al cierre (CBM)</th>
              <th className="text-right">Inventario (días)</th>
              <th>Pedidos</th>
            </tr>
          </thead>
          <tbody>
            {S.meses.map((m: X) => (
              <tr key={m.inicio}>
                <td className="font-semibold">{mesImp(m.inicio)}</td>
                <td className={der}>{nu(m.sucursalesInicio)}</td>
                <td className={der}>{m.aperturas > 0 ? `+${m.aperturas}` : '0'}</td>
                <td className={der}>{nu(m.cbmVasosTapas, 1)}</td>
                <td className={der}>{nu(m.cbmQueLlega, 1)}</td>
                <td className={der}>{nu(m.stockVasosTapasCbm, 1)}</td>
                <td
                  className={`${der} font-semibold ${m.inventarioDiasCierre == null ? '' : m.inventarioDiasCierre < 15 ? 'text-bad' : m.inventarioDiasCierre < 30 ? 'text-warn' : 'text-ok'}`}
                >
                  {nu(m.inventarioDiasCierre)}
                </td>
                <td className="text-xs text-ink-2">
                  {[
                    m.colocarContenedor ? `Colocar ${m.colocarContenedor}` : '',
                    m.llegaContenedor ? `Llega ${m.llegaContenedor}` : '',
                    m.colocarTermos ? `Termos: ${m.colocarTermos}` : '',
                    m.colocarTazasParaguas ? `Tazas y paraguas: ${m.colocarTazasParaguas}` : '',
                    m.colocarBolsas ? `Bolsas: ${m.colocarBolsas}` : '',
                  ]
                    .filter(Boolean)
                    .join(' · ')}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _impVistaPuente. */
export function PuenteImp({ c }: { c: CorridaImp }) {
  const ci = c.cfg.imp;
  const ps = c.S.productos.filter((x: X) => x.compraPuente.compraPuente > 0 || x.compraPuente.yaComprado > 0);
  if (!ps.length)
    return (
      <p className="py-10 text-center text-sm text-muted-foreground">
        No hay nada en camino ni compras puente que calcular.
      </p>
    );
  return (
    <SeccionPlan
      titulo="Compra puente"
      ayuda={`Mientras llega lo que ya está pedido, ¿alcanza el inventario? Si faltan unidades antes de la llegada se calcula una compra puente local (o por aéreo en termos): lo que falta más un colchón de ${ci.puente.dias_colchon} días, redondeado a múltiplos de ${ci.puente.multiplo}.`}
    >
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="text-right">Inventario</th>
              <th className="text-right">Ya pedido</th>
              <th className="text-right">Llega</th>
              <th className="text-right">Venta hasta que llega</th>
              <th className="text-right">Faltante</th>
              <th className="text-right">Colchón</th>
              <th className="text-right">Compra puente</th>
              <th>Cómo cubrir</th>
            </tr>
          </thead>
          <tbody>
            {ps.map((x: X) => {
              const cp = x.compraPuente;
              return (
                <tr key={x.sku}>
                  <td>
                    {x.quiebre.producto}
                    <span className="block font-mono text-[10px] text-muted-foreground">{x.sku}</span>
                  </td>
                  <td className={der}>{nu(cp.stockHoy, 1)}</td>
                  <td className={der}>{nu(cp.yaComprado)}</td>
                  <td className={der}>{fImp(cp.llega)}</td>
                  <td className={der}>{nu(cp.ventaHastaLlegar, 1)}</td>
                  <td className={der}>{nu(cp.faltante, 1)}</td>
                  <td className={der}>{nu(cp.colchon, 1)}</td>
                  <td className={der}>{cp.compraPuente > 0 ? <b>{nu(cp.compraPuente)}</b> : '—'}</td>
                  <td className="text-xs">{cp.comoCubrir}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </SeccionPlan>
  );
}

/** _impVistaResumen: qué pedir ahora y este mes, contenedores con la gráfica y las aperturas que usa el plan. */
export function ResumenImp({ c }: { c: CorridaImp }) {
  const S = c.S,
    hoy = c.ent.P.fechaCorte,
    d7 = masDias(hoy, 7),
    d30 = masDias(hoy, 30);
  const ahora = S.productos.filter(
    (x: X) => x.quiebre.cantidadPedir > 0 && x.quiebre.colocarPedido && x.quiebre.colocarPedido <= d7,
  );
  const mes = S.productos.filter(
    (x: X) =>
      x.quiebre.cantidadPedir > 0 &&
      x.quiebre.colocarPedido &&
      x.quiebre.colocarPedido > d7 &&
      x.quiebre.colocarPedido <= d30,
  );
  const tabla = (lista: X[], vacio: string) =>
    !lista.length ? (
      <p className="text-xs text-muted-foreground">{vacio}</p>
    ) : (
      <div className="overflow-x-auto">
        <table className="tabla">
          <thead>
            <tr>
              <th>Artículo</th>
              <th className="text-right">Cantidad</th>
              <th className="text-right">Colocar</th>
              <th className="text-right">Llega</th>
              <th className="text-right">Inversión</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((x: X) => {
              const q = x.quiebre;
              return (
                <tr key={x.sku}>
                  <td>
                    {q.producto}
                    <span className="block text-[10px] text-muted-foreground">
                      {x.sku} · {q.proveedorNombre}
                    </span>
                  </td>
                  <td className={der}>
                    {nu(q.cantidadPedir)} <small>{q.unidad}</small>
                  </td>
                  <td className={der}>{fImp(q.colocarPedido)}</td>
                  <td className={der}>{fImp(q.llegaCedis)}</td>
                  <td className={der}>{dinero(q.inversion)}</td>
                  <td>
                    <Estado e={q.estado} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  const red = c.ent.meta.red;
  return (
    <>
      <SeccionPlan
        titulo="Qué hay que pedir ahora"
        ayuda="Lo que ya hay que colocar en los próximos 7 días para que el producto llegue antes de que se acabe (lead time + días de margen)."
      >
        {tabla(ahora, 'Nada urgente: ningún artículo tiene que pedirse en los próximos 7 días.')}
      </SeccionPlan>
      <SeccionPlan
        titulo="Qué pedir este mes"
        ayuda="Pedidos que hay que colocar entre 8 y 30 días a partir de hoy."
      >
        {tabla(mes, 'Ningún otro pedido en los próximos 30 días.')}
      </SeccionPlan>
      <SeccionPlan titulo="Contenedores de vasos y tapas" ayuda={textoContenedores(S)}>
        <p className="mb-3 text-sm text-ink-2">
          Volumen de vasos y tapas: <b>{nu(S.meses[0].cbmVasosTapas)} CBM al mes hoy</b> →{' '}
          <b>
            {nu(S.meses[14].cbmVasosTapas)} CBM al mes en {mesImp(S.meses[14].inicio)}
          </b>
          . Un contenedor de {nu(S.cbmUtilContenedor)} CBM alcanza para{' '}
          {nu(S.contenedores.meses[0].mesesCubre1, 1)} meses hoy y para{' '}
          {nu(S.contenedores.meses[14].mesesCubre1, 1)} meses en {mesImp(S.meses[14].inicio)}.
        </p>
        <GraficaCbm S={S} />
      </SeccionPlan>
      <SeccionPlan
        titulo="Aperturas que usa el plan"
        ayuda={`Operan ${red.sucHoy} sucursales hoy. Para cada mes, el plan usa el pipeline registrado en la plataforma y, donde todavía no hay aperturas registradas, el plan de Dirección.`}
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                <th className="text-right">Plan de Dirección</th>
                <th className="text-right">Se usa</th>
                <th>De dónde</th>
              </tr>
            </thead>
            <tbody>
              {red.filas.slice(0, 6).map((f: X) => (
                <tr key={f.key}>
                  <td className="font-semibold">{mesImp(f.key + '-01')}</td>
                  <td className={der}>{f.pipeline}</td>
                  <td className={der}>{f.plan}</td>
                  <td className={der}>
                    <b>{f.considerada}</b>
                  </td>
                  <td className="text-xs text-muted-foreground">
                    {f.fuente === 'pipeline' ? 'pipeline' : 'plan de Dirección'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </SeccionPlan>
    </>
  );
}
