'use client';
// Bloques 1 a 3 del tablero BI: números clave, contra meta y P.E. y mezcla de venta.
import { Barra, Insignia } from '@/components/portal/piezas';
import { cn } from 'cn';
import { AZUL } from '@/components/sucursales/colores';
import { BarraApilada } from '@/components/sucursales/graficas';
import { dinero, fechaCorta, numero, porcentaje } from '@/components/sucursales/formato';
import { Cifra } from '@/components/sucursales/graficas-mexico';
import { cambio } from '@/lib/bi/comparacion';
import { alcanza, type contraMeta, type EstadoComparacion, type numerosClave } from '@/lib/bi/bloques';
import { TarjetaBi } from './tarjeta-bi';
import { CAFE, colorDe, enOrden, GRUPOS, SIN_COLOR } from './colores-bi';

const decimales = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

type Clave = 'ventaCent' | 'ticketPromedioCent' | 'tickets' | 'upt' | 'unidades';

function LineaComparacion({
  actual,
  clave,
  formato,
  c,
}: {
  actual: number | null;
  clave: Clave;
  formato: (x: number) => string;
  c: EstadoComparacion;
}) {
  if (c.estado === 'cargando')
    return <span aria-hidden="true" className="block h-4 w-32 animate-pulse rounded bg-surface-2" />;
  if (c.estado === 'semanas') return <p className="text-xs text-muted-foreground">Sin comparación con filtro de semanas</p>;
  if (c.estado === 'faltan')
    return (
      <p className="text-xs text-muted-foreground">
        Sin comparación: faltan días en {fechaCorta(c.periodo.desde)} – {fechaCorta(c.periodo.hasta)}
      </p>
    );
  if (c.estado === 'error') return <p className="text-xs text-muted-foreground">Sin comparación</p>;
  const anterior = c.anterior[clave];
  const d = cambio(actual, anterior);
  if (!d || anterior === null) return <p className="text-xs text-muted-foreground">Sin comparación</p>;
  const signo = d.dir === 'sube' ? '▲' : d.dir === 'baja' ? '▼' : '=';
  const color = d.dir === 'sube' ? 'text-ok' : d.dir === 'baja' ? 'text-bad' : 'text-muted-foreground';
  return (
    <div className="space-y-0.5 text-xs">
      <p>
        <span className={`font-semibold ${color}`}>
          <span aria-hidden="true">{signo}</span>
          <span className="sr-only">{d.dir}</span>{' '}
          {porcentaje(d.dir === 'igual' ? 0 : Math.abs(d.pct))}
        </span>{' '}
        <span className="text-muted-foreground">vs {formato(anterior)}</span>
      </p>
      <p className="text-muted-foreground">
        {fechaCorta(c.periodo.desde)} – {fechaCorta(c.periodo.hasta)}
      </p>
    </div>
  );
}

/**
 * Bloque 1, estilo Metabase: título chico, número grande y su cambio contra el periodo anterior (mismas fórmulas:
 * el anterior también pasa por numerosClave). Los cocientes sin base llegan null y se ven «—».
 */
export function NumerosClave({ n, comparacion }: { n: ReturnType<typeof numerosClave>; comparacion: EstadoComparacion }) {
  const pesos = (x: number) => dinero(Math.round(x), 'MXN', false);
  const conCentavos = (x: number) => dinero(Math.round(x));
  const entero = (x: number) => numero(Math.round(x));
  const tarjetas: { etiqueta: string; clave: Clave; formato: (x: number) => string; nota?: string }[] = [
    { etiqueta: 'Ventas Netas', clave: 'ventaCent', formato: pesos, nota: `Cobrado: ${dinero(n.cobradoCent)}` },
    { etiqueta: 'Ticket Promedio', clave: 'ticketPromedioCent', formato: conCentavos },
    { etiqueta: '# de Tickets', clave: 'tickets', formato: entero },
    { etiqueta: 'Promedio UPT', clave: 'upt', formato: (x) => decimales.format(x) },
    { etiqueta: 'Total Products', clave: 'unidades', formato: entero },
  ];
  return (
    <section aria-label="Números clave" className="kpis-bi">
      {tarjetas.map((t) => {
        const v = n[t.clave];
        return (
          <div key={t.clave} className="min-w-0 space-y-2 rounded-2xl border border-line bg-surface p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink-2">{t.etiqueta}</h2>
            <p className="font-display text-[clamp(1.5rem,2.2vw,2.25rem)] leading-none font-black tabular">
              {v === null ? '—' : <Cifra valor={v} formato={t.formato} />}
            </p>
            <LineaComparacion actual={v} clave={t.clave} formato={t.formato} c={comparacion} />
            {t.nota && <p className="text-[11px] text-muted-foreground">{t.nota}</p>}
          </div>
        );
      })}
    </section>
  );
}

/** Diferencia con signo: «+$1,200.00» / «−$300.00». */
const conSigno = (cent: number) => `${cent >= 0 ? '+' : '−'}${dinero(Math.abs(cent))}`;

/**
 * Bloque 2: meta de venta y punto de equilibrio. Compara solo los días con corte del POS (la venta de esos días contra
 * su meta y su P.E.); la meta del periodo completo va aparte. Sin meta o P.E. cargados se dice, nunca se muestra cero.
 * Con filtros de producto, pago, hora o monto la venta ya no es de la tienda completa: no se compara.
 */
export function ContraMeta({ datos, filtrosLinea }: { datos: ReturnType<typeof contraMeta>; filtrosLinea: string[] }) {
  const { meta, pe, diasSinMeta } = datos;
  const sinComparar = filtrosLinea.length > 0;
  return (
    <TarjetaBi
      ancho={4}
      titulo="Contra meta y punto de equilibrio"
      descripcion="Venta de los días con corte del POS contra su meta y su P.E. La meta del periodo incluye los días que faltan."
    >
      <div className="grid gap-4">
        <Panel
          titulo="Meta de venta"
          tiendas={meta?.tiendas}
          vacio={meta ? null : 'Sin meta cargada para estas tiendas y fechas.'}
          sinComparar={sinComparar}
          indicador={meta?.cumplimiento ?? null}
          etiquetaIndicador="Cumplimiento"
          venta={meta?.ventaCorrienteCent}
          contra={meta?.metaCorrienteCent}
          etiquetaContra="meta"
          diferencia={meta?.diferenciaCent}
          etiquetaDiferencia="Diferencia vs meta"
          extra={
            meta && (
              <>
                <Dato etiqueta="Meta del periodo" valor={dinero(meta.metaCent)} nota={`Avance ${porcentaje(meta.avance)}`} />
                {!sinComparar && (
                  <>
                    <Dato etiqueta="Tickets vs meta" valor={porcentaje(meta.cumplimientoTickets)} />
                    <Dato
                      etiqueta="Ticket prom."
                      valor={dinero(meta.ticketPromedioCent)}
                      nota={`Meta ${dinero(meta.ticketPromedioMetaCent)}`}
                    />
                  </>
                )}
              </>
            )
          }
        />
        <Panel
          titulo="Punto de equilibrio"
          tiendas={pe?.tiendas}
          vacio={
            pe
              ? null
              : 'Sin P.E. cargado para estas tiendas y fechas. Solo las Sucursales Propias tienen punto de equilibrio.'
          }
          sinComparar={sinComparar}
          indicador={pe?.cobertura ?? null}
          etiquetaIndicador="Venta vs P.E."
          venta={pe?.ventaCorrienteCent}
          contra={pe?.peCorrienteCent}
          etiquetaContra="P.E."
          diferencia={pe?.diferenciaCent}
          etiquetaDiferencia={pe && pe.diferenciaCent < 0 ? 'Falta para el P.E.' : 'Excedente sobre el P.E.'}
          extra={pe && <Dato etiqueta="P.E. del periodo" valor={dinero(pe.peCent)} />}
        />
      </div>
      {(sinComparar || diasSinMeta > 0) && (
        <ul className="mt-4 space-y-1 text-xs text-muted-foreground">
          {sinComparar && (
            <li>
              La meta y el P.E. son de la venta total de la tienda: con el filtro de {filtrosLinea.join(', ')} no se
              comparan.
            </li>
          )}
          {diasSinMeta > 0 && (
            <li>
              {numero(diasSinMeta)} {diasSinMeta === 1 ? 'día de tienda' : 'días de tienda'} del periodo sin meta
              cargada: no entran en la meta.
            </li>
          )}
        </ul>
      )}
    </TarjetaBi>
  );
}

function Panel(p: {
  titulo: string;
  tiendas?: number;
  vacio: string | null;
  sinComparar: boolean;
  indicador: number | null;
  etiquetaIndicador: string;
  venta?: number;
  contra?: number;
  etiquetaContra: string;
  diferencia?: number;
  etiquetaDiferencia: string;
  extra?: React.ReactNode;
}) {
  const estado = p.indicador === null ? 'neutro' : alcanza(p.indicador) ? 'ok' : 'bajo';
  return (
    <div className="rounded-xl border border-line p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-ink-2">{p.titulo}</h3>
        {p.tiendas !== undefined && (
          <Insignia>
            {numero(p.tiendas)} {p.tiendas === 1 ? 'tienda' : 'tiendas'}
          </Insignia>
        )}
      </div>
      {p.vacio ? (
        <>
          <p className="mt-2 font-display text-xl font-bold text-muted-foreground">Sin datos</p>
          <p className="mt-1 text-xs text-muted-foreground">{p.vacio}</p>
        </>
      ) : (
        <>
          {!p.sinComparar &&
            (p.indicador === null ? (
              <p className="mt-2 text-sm text-muted-foreground">Todavía no hay días con corte en el periodo.</p>
            ) : (
              <>
                <p className="mt-2 flex items-baseline gap-2">
                  <span className="font-display text-3xl font-bold text-ink">{porcentaje(p.indicador)}</span>
                  <span className="text-sm text-ink-2">{p.etiquetaIndicador}</span>
                </p>
                <Barra valor={p.indicador} max={1.25} objetivo={1} estado={estado} className="mt-3" />
                <p className="mt-2 text-sm text-ink-2">
                  Venta {dinero(p.venta)} de {dinero(p.contra)} de {p.etiquetaContra}
                </p>
                {p.diferencia !== undefined && (
                  <p className={cn('text-sm font-semibold', p.diferencia >= 0 ? 'text-ok' : 'text-bad')}>
                    {p.etiquetaDiferencia}: {conSigno(p.diferencia)}
                  </p>
                )}
              </>
            ))}
          {p.extra && (
            <dl className="mt-3 grid grid-cols-2 gap-3 border-t border-line pt-3 sm:grid-cols-3">{p.extra}</dl>
          )}
        </>
      )}
    </div>
  );
}

function Dato({ etiqueta, valor, nota }: { etiqueta: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{etiqueta}</dt>
      <dd className="text-sm font-semibold tabular-nums text-ink">{valor}</dd>
      {nota && <dd className="text-xs text-muted-foreground">{nota}</dd>}
    </div>
  );
}

export interface FilaShare {
  clave: string;
  etiqueta: string;
  ventaCent: number;
  share: number | null;
}

/** Barras horizontales de magnitud (un solo tono) con venta y porcentaje, en la escala de la fila mayor. */
export function BarrasShare({ titulo, filas }: { titulo?: string; filas: FilaShare[] }) {
  const max = Math.max(0, ...filas.map((f) => f.share ?? 0));
  return (
    <div className="min-w-0 space-y-3">
      {titulo && <h3 className="text-sm font-semibold text-ink-2">{titulo}</h3>}
      {filas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>
      ) : (
        <ul className="space-y-3">
          {filas.map((f) => (
            <li key={f.clave} className="space-y-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="min-w-0 truncate font-medium" title={f.etiqueta}>
                  {f.etiqueta}
                </span>
                <span className="shrink-0 tabular">
                  <span className="text-ink-2">{dinero(f.ventaCent, 'MXN', false)}</span>
                  <span className="ml-2 inline-block w-12 text-right font-semibold">
                    {porcentaje(f.share)}
                  </span>
                </span>
              </div>
              <span aria-hidden="true" className="block h-2 overflow-hidden rounded-full bg-surface-2">
                <span
                  className="block h-full rounded-full"
                  style={{
                    width: `${max > 0 ? ((f.share ?? 0) / max) * 100 : 0}%`,
                    backgroundColor: AZUL.fuerte,
                  }}
                />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NOMBRE_CAFE: Record<string, string> = { Sí: 'Con café', No: 'Sin café' };

type Grupos = { grupo: string; venta_cent: number; share: number | null }[];
type Cafes = { cafe: string; venta_cent: number; share: number | null }[];
type Masters = { categoria: string; venta_cent: number; share: number | null }[];

/** Bloque 3, tarjeta 1. Recibe las filas ya con su share (conShare). Composición con color fijo por entidad. */
export function MezclaGrupos({ grupos }: { grupos: Grupos }) {
  return (
    <TarjetaBi ancho={4} titulo="Comida, Bebida, Combo y Merch" descripcion="Venta neta y su participación.">
      {grupos.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>
      ) : (
        <BarraApilada
          apilada
          moneda="MXN"
          segmentos={enOrden(grupos, GRUPOS, (g) => g.grupo).map((g) => ({
            clave: g.grupo,
            etiqueta: g.grupo,
            color: colorDe(GRUPOS, g.grupo),
            ventaCent: g.venta_cent,
            pedidos: null,
            participacion: g.share,
          }))}
        />
      )}
    </TarjetaBi>
  );
}

/** Bloque 3, tarjeta 2: bebidas con café y sin café. */
export function MezclaCafe({ cafe }: { cafe: Cafes }) {
  return (
    <TarjetaBi ancho={4} titulo="Bebidas con café y sin café" descripcion="Venta neta y su participación.">
      {cafe.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>
      ) : (
        <BarraApilada
          apilada
          moneda="MXN"
          segmentos={[...cafe]
            .sort((a, b) => (a.cafe === 'Sí' ? -1 : b.cafe === 'Sí' ? 1 : 0))
            .map((c) => ({
              clave: c.cafe,
              etiqueta: NOMBRE_CAFE[c.cafe] ?? c.cafe,
              color: CAFE[c.cafe] ?? SIN_COLOR,
              ventaCent: c.venta_cent,
              pedidos: null,
              participacion: c.share,
            }))}
        />
      )}
    </TarjetaBi>
  );
}

/** Bloque 3, tarjeta 3: categoría Master Franchise MX. */
export function CategoriaMaster({ master }: { master: Masters }) {
  return (
    <TarjetaBi ancho={6} titulo="Categoría Master Franchise MX" descripcion="Venta neta y su participación.">
      <BarrasShare
        filas={master.map((m) => ({
          clave: m.categoria,
          etiqueta: m.categoria,
          ventaCent: m.venta_cent,
          share: m.share,
        }))}
      />
    </TarjetaBi>
  );
}
