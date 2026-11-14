import Link from 'next/link';
import {
  CalendarClock,
  Coins,
  Database,
  PackageCheck,
  ShoppingCart,
  Target,
  TrendingUp,
  type LucideIcon,
} from 'lucide-react';
import { Kpi, Pill, Tarjeta } from '@/components/portal/piezas';
import { numero, pesos } from '@/lib/comercializadora/formato';
import { fechaCorta } from '@/lib/comercializadora/fechas';
import {
  dineroCorto,
  pctTxt,
  semanaTxt,
  tonoKpi,
  type CheckDatos,
  type DetalleKpi,
  type Traza,
} from '@/lib/comercializadora/indicadores';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type K = any;
type Estados = Record<string, boolean | null | undefined>;
const RUTA = '/comercializadora/indicadores';

/** Las siete tarjetas de _kpiAbHtml; cada una abre su detalle (?detalle=). */
export function TarjetasKpi({ K, E }: { K: K; E: Estados }) {
  const m = K.metas;
  const fc = K.fc;
  const dv = fc.desv as number | null;
  const cv = K.cv;
  const iv = K.inv;
  const ex = K.exc;
  const ds = K.disp;
  const dt = K.datos;
  const malos = (dt.checks as CheckDatos[])
    .filter((x) => x.est !== 'ok')
    .sort((a, b) => (a.est === 'mal' ? 0 : 1) - (b.est === 'mal' ? 0 : 1));
  const tarjeta = (
    id: DetalleKpi,
    etiqueta: string,
    valor: string,
    meta: string,
    cumple: boolean | null | undefined,
    nota: string,
    icono: LucideIcon,
  ) => (
    <Kpi
      key={etiqueta}
      etiqueta={etiqueta}
      valor={valor}
      nota={`Meta ${meta}${nota ? ` · ${nota}` : ''}`}
      href={`${RUTA}?detalle=${id}`}
      icono={icono}
      tono={tonoKpi(cumple)}
    />
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {tarjeta(
        'fc',
        'Precisión del forecast',
        fc.acc !== null ? `${Math.round(fc.acc)}%` : 'Sin datos',
        `≥${m.prec_min}%`,
        E.fc,
        fc.acc !== null
          ? `Últimas ${K.nw} semanas · ${fc.n} artículos`
          : 'Todavía no hay semanas suficientes para comparar',
        Target,
      )}
      {tarjeta(
        'fc',
        'Venta vs proyección',
        dv === null ? 'Sin datos' : `${dv > 0 ? '+' : ''}${Math.round(dv)}%`,
        `±${m.sesgo_max}%`,
        E.sesgo,
        dv === null
          ? ''
          : dv > m.sesgo_max
            ? 'Se vendió más de lo proyectado: riesgo de quedarse corto'
            : dv < -m.sesgo_max
              ? 'Se vendió menos de lo proyectado: riesgo de comprar de más'
              : 'La proyección y la venta real van parejas',
        TrendingUp,
      )}
      {tarjeta(
        'cv',
        `Compras vs venta (${K.nw} sem.)`,
        cv.ratio !== null ? `${cv.ratio.toFixed(2)}×` : 'Sin datos',
        `${m.cv_min.toFixed(2)}–${m.cv_max.toFixed(2)}×`,
        E.cv,
        cv.ratio !== null
          ? `OCs registradas ${dineroCorto(cv.comp)} · venta a costo ${dineroCorto(cv.vta)}`
          : 'Sin compras ni venta en el periodo',
        ShoppingCart,
      )}
      {tarjeta(
        'inv',
        'Cobertura de inventario',
        iv.dias !== null ? `${Math.round(iv.dias)} días` : 'Sin datos',
        `${m.dias_min}–${m.dias_max} d`,
        E.inv,
        iv.valor > 0 ? `${dineroCorto(iv.valor)} a costo en inventario` : 'Sin inventario valuado',
        CalendarClock,
      )}
      {tarjeta(
        'exc',
        'Capital en exceso',
        ex.pct !== null ? `${Math.round(ex.pct)}%` : 'Sin datos',
        `≤${m.exc_max}% del inventario`,
        E.exc,
        ex.pct !== null
          ? `${dineroCorto(ex.valor)} parados · ${ex.filas.length} sobre cobertura, ${ex.sinVenta.length} sin venta`
          : '',
        Coins,
      )}
      {tarjeta(
        'disp',
        'Disponibilidad',
        ds.pct !== null ? `${Math.round(ds.pct)}%` : 'Sin datos',
        `≥${m.disp_min}%`,
        E.disp,
        ds.conVenta
          ? ds.agot.length
            ? `${ds.agot.length} de ${ds.conVenta} artículos con venta están agotados hoy`
            : 'Ningún artículo con venta está agotado'
          : '',
        PackageCheck,
      )}
      {tarjeta(
        'datos',
        'Datos del plan',
        `${dt.ok} de ${dt.total}`,
        `${dt.total} de ${dt.total} al día`,
        E.datos,
        malos.length
          ? `Falta: ${malos
              .slice(0, 2)
              .map((x) => x.corto)
              .join(', ')}${malos.length > 2 ? ` y ${malos.length - 2} más` : ''}`
          : 'Todo al día',
        Database,
      )}
    </div>
  );
}

/** _kpiAbParamsHtml: lo que mueve a los indicadores, con enlace a Configuración. */
export function ParametrosKpi({ params }: { params: [string, string][] }) {
  return (
    <p className="placa rounded-lg px-3 py-2 text-xs leading-6 text-muted-foreground">
      <b className="text-ink-2">Parámetros vigentes</b> ·{' '}
      {params.map(([k, v]) => (
        <span key={k}>
          {k}: <b className="font-semibold text-ink-2">{v}</b> ·{' '}
        </span>
      ))}
      <Link href="/comercializadora/configuracion" className="font-semibold underline">
        Modificar
      </Link>
    </p>
  );
}

function Tabla({
  cab,
  filas,
  vacio = 'Sin datos',
}: {
  cab: [string, boolean?][];
  filas: React.ReactNode[];
  vacio?: string;
}) {
  return (
    <div className="placa mt-2 overflow-x-auto">
      <table className="tabla">
        <thead>
          <tr>
            {cab.map(([t, der]) => (
              <th key={t} className={der ? 'text-right' : ''}>
                {t}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {filas.length ? (
            filas
          ) : (
            <tr>
              <td colSpan={cab.length} className="py-3 text-center text-muted-foreground">
                {vacio}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
function Caja({ t, v, sub, e }: { t: string; v: string; sub?: string; e?: boolean | null }) {
  const color = e === true ? 'text-ok' : e === false ? 'text-bad' : e === null ? 'text-warn' : '';
  return (
    <div className="min-w-32 flex-1 rounded-lg border border-line px-3 py-2">
      <p className="text-xs font-bold uppercase text-muted-foreground">{t}</p>
      <p className={`text-lg font-extrabold ${color}`}>{v}</p>
      {sub ? <p className="text-xs text-muted-foreground">{sub}</p> : null}
    </div>
  );
}
const Articulo = ({ a }: { a: { nombre: string; sku: string } }) => (
  <>
    <b>{a.nombre}</b>
    <span className="block font-mono text-xs text-muted-foreground">{a.sku}</span>
  </>
);
const Sub = ({ t, s }: { t: string; s?: string }) => (
  <h3 className="mt-4 font-bold">
    {t} {s ? <span className="font-normal text-muted-foreground">{s}</span> : null}
  </h3>
);
const der = 'text-right tabular-nums';

/** Detalle de cada indicador (_kpiAbDetalle) y la traza de un artículo (_kpiAbTraza). */
export function DetalleKpiVista({
  K,
  E,
  detalle,
  ventanas,
  traza,
}: {
  K: K;
  E: Estados;
  detalle: DetalleKpi;
  ventanas: { v: number; acc: number; actual: boolean }[];
  traza: Traza | null;
}) {
  const m = K.metas;
  let titulo = '';
  let cuerpo: React.ReactNode = null;
  if (detalle === 'fc' && traza) {
    titulo = traza.nombre;
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          El plan proyecta cada semana con el promedio de venta de los días anteriores a esa semana. Hoy ese
          promedio es{' '}
          <b>{numero(traza.tasa >= 10 ? Math.round(traza.tasa) : Math.round(traza.tasa * 10) / 10)}</b> pzas
          al día, unas <b>{numero(Math.round(traza.tasa * 7))}</b> por semana (
          {numero(Math.round(traza.venta30))} pzas en la ventana).{' '}
          {traza.motivo || 'La proyección y la venta van parejas.'}
        </p>
        <Tabla
          cab={[
            ['Semana'],
            ['Se pidió', true],
            ['De qué pedidos'],
            ['El plan esperaba', true],
            ['Diferencia', true],
          ]}
          filas={traza.filas.map((f, i) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(f.ini, f.fin)}</td>
              <td className={`${der} font-semibold`}>
                {f.real == null ? '—' : `${numero(Math.round(f.real))} pzas`}
              </td>
              <td className="text-xs text-muted-foreground">
                {f.tipos.length
                  ? f.tipos.map(([t, q]) => `${t} ${numero(Math.round(q))}`).join(' · ')
                  : 'sin pedidos'}
              </td>
              <td className={der}>{f.proy == null ? '—' : `${numero(Math.round(f.proy))} pzas`}</td>
              <td
                className={`${der} ${f.dif !== null && Math.abs(f.dif) >= 25 ? 'font-semibold text-bad' : ''}`}
              >
                {pctTxt(f.dif)}
              </td>
            </tr>
          ))}
        />
        <Link href={`${RUTA}?detalle=fc`} className="mt-3 inline-block text-sm font-semibold underline">
          ← Volver al forecast
        </Link>
      </>
    );
  } else if (detalle === 'fc') {
    const fc = K.fc;
    titulo = 'Forecast: qué tanto acierta el plan';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Cada semana el plan proyecta cuánto se va a pedir de cada artículo con el promedio de venta de la
          ventana. Aquí se compara esa proyección con lo que las sucursales realmente pidieron: en las últimas{' '}
          {K.nw} semanas se proyectaron <b>{dineroCorto(fc.proy)}</b> (a costo) y se vendieron{' '}
          <b>{dineroCorto(fc.real)}</b>
          {fc.desv !== null ? ` (${pctTxt(fc.desv)})` : ''}. Cuando la venta cambia de golpe, el promedio
          tarda semanas en alcanzarla.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Precisión por artículo"
            v={fc.acc !== null ? `${Math.round(fc.acc)}%` : '—'}
            e={E.fc}
            sub={`meta ≥${m.prec_min}%`}
          />
          <Caja
            t="Venta vs proyección"
            v={fc.desv !== null ? pctTxt(fc.desv) : '—'}
            e={E.sesgo}
            sub={`meta ±${m.sesgo_max}%`}
          />
        </div>
        <Sub t="Semana a semana" s="(a costo)" />
        <Tabla
          cab={[['Semana'], ['Proyectado', true], ['Vendido', true], ['Diferencia', true]]}
          filas={fc.sem.slice(0, K.nw).map((s: K, i: number) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(s.ini, s.fin)}</td>
              <td className={der}>{s.n ? pesos(s.proy) : '—'}</td>
              <td className={der}>{s.n ? pesos(s.real) : '—'}</td>
              <td
                className={`${der} ${s.desv !== null && Math.abs(s.desv) > m.sesgo_max ? 'font-semibold text-bad' : ''}`}
              >
                {pctTxt(s.desv)}
              </td>
            </tr>
          ))}
        />
        <Sub t="Donde más se aleja" s="(artículos con diferencia de 20% o más)" />
        <Tabla
          cab={[['Artículo'], ['Proyectado', true], ['Vendido', true], ['Diferencia', true], ['Por qué']]}
          filas={fc.top.map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Link
                  href={`${RUTA}?detalle=fc&traza=${encodeURIComponent(a.sku)}`}
                  title="Ver de dónde sale la proyección"
                >
                  <Articulo a={a} />
                </Link>
              </td>
              <td className={der}>{numero(Math.round(a.proy))} pzas</td>
              <td className={der}>{numero(Math.round(a.real))} pzas</td>
              <td
                className={`${der} font-semibold ${a.desv !== null && a.desv > 0 ? 'text-bad' : 'text-warn'}`}
              >
                {pctTxt(a.desv === null ? null : a.desv * 100)}
              </td>
              <td className="text-xs text-muted-foreground">{a.motivo}</td>
            </tr>
          ))}
        />
        {ventanas.length > 1 ? (
          <p className="mt-3 text-sm text-muted-foreground">
            Con la misma cuenta y otra ventana de venta:{' '}
            {ventanas
              .map((o) => `${o.v} días ${Math.round(o.acc)}%${o.actual ? ' (actual)' : ''}`)
              .join(' · ')}
            . Se cambia en Configuración &gt; Consumo.
          </p>
        ) : null}
      </>
    );
  } else if (detalle === 'cv') {
    const cv = K.cv;
    titulo = 'Compras vs venta';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Compras son las OCs emitidas en las últimas {K.nw} semanas (sin borradores) que están registradas en
          la plataforma; venta es lo que pidieron las sucursales, a costo. Cerca de 1× el inventario se
          mantiene. Solo cuenta lo registrado aquí: si se emiten OCs directo en Zoho, las compras salen más
          bajas de lo real.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Compras / venta"
            v={cv.ratio !== null ? `${cv.ratio.toFixed(2)}×` : '—'}
            e={E.cv}
            sub={`meta ${m.cv_min.toFixed(2)}–${m.cv_max.toFixed(2)}×`}
          />
          <Caja t="Compras" v={dineroCorto(cv.comp)} sub={`${K.nw} semanas`} />
          <Caja t="Venta a costo" v={dineroCorto(cv.vta)} sub={`${K.nw} semanas`} />
        </div>
        <Tabla
          cab={[
            ['Semana'],
            ['OCs', true],
            ['Compras', true],
            ['Venta a costo', true],
            ['Compras / venta', true],
          ]}
          filas={cv.sem.slice(0, K.nw).map((s: K, i: number) => (
            <tr key={i}>
              <td className="whitespace-nowrap">{semanaTxt(s.ini, s.fin)}</td>
              <td className={der}>{s.n || 0}</td>
              <td className={`${der} font-semibold`}>{pesos(s.comp + s.compImp)}</td>
              <td className={der}>{pesos(s.vta)}</td>
              <td className={der}>{s.ratio !== null ? `${s.ratio.toFixed(2)}×` : '—'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'inv') {
    const iv = K.inv;
    titulo = 'Cobertura de inventario';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Cuántos días de venta cubre el inventario de hoy, a costo{K.cfg.inv.yulius ? ' (CEDIS y 3PL)' : ''}.
          El total engaña: unos artículos tienen de sobra y otros no alcanzan, por eso se ve por categoría. No
          incluye artículos de compra única (equipo).
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Cobertura"
            v={iv.dias !== null ? `${Math.round(iv.dias)} días` : '—'}
            e={E.inv}
            sub={`meta ${m.dias_min}–${m.dias_max} d`}
          />
          <Caja t="Inventario a costo" v={dineroCorto(iv.valor)} />
          <Caja t="Venta diaria a costo" v={dineroCorto(iv.cogsDia)} />
        </div>
        <Tabla
          cab={[['Categoría'], ['Inventario', true], ['% del total', true], ['Cobertura', true]]}
          filas={iv.cats.map((g: K) => (
            <tr key={g.nombre}>
              <td>{g.nombre}</td>
              <td className={`${der} font-semibold`}>{pesos(g.valor)}</td>
              <td className={der}>{g.pct.toFixed(0)}%</td>
              <td
                className={`${der} ${g.dias !== null && (g.dias < m.dias_min || g.dias > m.dias_max) ? 'font-semibold text-warn' : ''}`}
              >
                {g.dias !== null ? `${Math.round(g.dias)} d` : 'sin venta'}
              </td>
            </tr>
          ))}
        />
        <Sub t="Donde está el dinero" s="(los 8 artículos con más inventario)" />
        <Tabla
          cab={[['Artículo'], ['Inventario', true], ['Cobertura', true]]}
          filas={iv.top.slice(0, 8).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={`${der} font-semibold`}>{pesos(a.valor)}</td>
              <td className={der}>{a.dias !== null ? `${Math.round(a.dias)} d` : 'sin venta'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'exc') {
    const ex = K.exc;
    titulo = 'Capital en exceso';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          Inventario (a costo) que rebasa lo que pide el plan —lead time más seguridad más ciclo de compra— y{' '}
          {m.exc_margen} días más, y existencias de artículos que no se vendieron en la ventana.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Exceso total"
            v={ex.pct !== null ? `${Math.round(ex.pct)}%` : '—'}
            e={E.exc}
            sub={`meta ≤${m.exc_max}% · ${dineroCorto(ex.valor)}`}
          />
          <Caja t="Sobre la cobertura" v={dineroCorto(ex.exceso)} sub={`${ex.filas.length} artículos`} />
          <Caja t="Sin venta" v={dineroCorto(ex.sinVentaVal)} sub={`${ex.sinVenta.length} artículos`} />
        </div>
        <Sub t="Sobre la cobertura" s="(los 10 de más valor)" />
        <Tabla
          cab={[['Artículo'], ['Hay', true], ['Alcanza', true], ['Debería', true], ['Exceso a costo', true]]}
          filas={ex.filas.slice(0, 10).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={der}>{numero(Math.round(a.uds))} pzas</td>
              <td className={der}>{Math.round(a.dias)} d</td>
              <td className={der}>{Math.round(a.obj)} d</td>
              <td className={`${der} font-semibold`}>{pesos(a.exVal)}</td>
            </tr>
          ))}
        />
        <Sub t="Sin venta en la ventana" s="(los 10 de más valor)" />
        <Tabla
          cab={[['Artículo'], ['Hay', true], ['Inventario a costo', true]]}
          filas={ex.sinVenta.slice(0, 10).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td className={der}>{numero(Math.round(a.uds))} pzas</td>
              <td className={`${der} font-semibold`}>{pesos(a.valor)}</td>
            </tr>
          ))}
        />
      </>
    );
  } else if (detalle === 'disp') {
    const ds = K.disp;
    titulo = 'Disponibilidad de producto';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          De los artículos que se vendieron en la ventana, cuántos tienen hoy inventario disponible (después
          de lo reservado por pedidos pagados). Un agotado hoy es un pedido incompleto mañana.
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Caja
            t="Disponibilidad"
            v={ds.pct !== null ? `${Math.round(ds.pct)}%` : '—'}
            e={E.disp}
            sub={`meta ≥${m.disp_min}%`}
          />
          <Caja
            t="Agotados hoy"
            v={String(ds.agot.length)}
            e={ds.agot.length ? false : undefined}
            sub={`de ${ds.conVenta} con venta`}
          />
        </div>
        <Tabla
          cab={[['Artículo'], ['Proveedor'], ['Venta diaria', true], ['En camino', true], ['Llega']]}
          filas={ds.agot.slice(0, 15).map((a: K) => (
            <tr key={a.sku}>
              <td>
                <Articulo a={a} />
              </td>
              <td>{a.prov || '—'}</td>
              <td className={der}>
                {numero(a.cons >= 10 ? Math.round(a.cons) : Math.round(a.cons * 10) / 10)} pzas
              </td>
              <td className={der}>
                {a.enOC > 0 ? `${numero(Math.round(a.enOC))} pzas` : <span className="text-bad">nada</span>}
              </td>
              <td className="whitespace-nowrap">{a.llega ? fechaCorta(a.llega) : '—'}</td>
            </tr>
          ))}
        />
      </>
    );
  } else {
    titulo = 'Datos del plan';
    cuerpo = (
      <>
        <p className="text-sm text-muted-foreground">
          El plan solo es tan bueno como los datos que lo alimentan. Cada fila dice si esa revisión está al
          día y a dónde ir para corregirla.
        </p>
        <ul className="placa mt-3 divide-y divide-line rounded-lg">
          {(K.datos.checks as CheckDatos[]).map((c) => (
            <li key={c.id} className="flex flex-wrap items-start gap-3 px-3 py-2">
              <Pill estado={c.est === 'ok' ? 'ok' : c.est === 'aviso' ? 'bajo' : 'pierde'}>{c.valor}</Pill>
              <div className="min-w-0 flex-1">
                <b>{c.titulo}</b>
                {c.est !== 'ok' ? <p className="text-xs text-muted-foreground">{c.detalle}</p> : null}
              </div>
              {c.est !== 'ok' && c.lnk ? (
                <Link href={c.lnk} className="whitespace-nowrap text-xs font-semibold underline">
                  {c.acc} →
                </Link>
              ) : null}
            </li>
          ))}
        </ul>
      </>
    );
  }
  return (
    <Tarjeta
      titulo={titulo}
      acciones={
        <Link href={RUTA} className="text-sm underline">
          Cerrar
        </Link>
      }
      cuerpo
    >
      {cuerpo}
    </Tarjeta>
  );
}
