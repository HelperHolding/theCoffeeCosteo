'use client';
// Bloques 1 a 3 del tablero BI: números clave, contra meta y P.E. y mezcla de venta.
import { Banknote, Layers, Package, Receipt, Ticket } from 'lucide-react';
import { Barra, Insignia, Kpi, Tarjeta } from '@/components/portal/piezas';
import { cn } from 'cn';
import { AZUL } from '@/components/sucursales/colores';
import { BarraApilada } from '@/components/sucursales/graficas';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import { Cifra } from '@/components/sucursales/graficas-mexico';
import { alcanza, type contraMeta, type numerosClave } from '@/lib/bi/bloques';
import { CAFE, colorDe, enOrden, GRUPOS, SIN_COLOR } from './colores-bi';

const decimales = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/**
 * Bloque 1. Los cocientes sin base (0 tickets) llegan como null y se ven «—». Las cifras cuentan hasta el valor nuevo
 * al cambiar un filtro (Cifra: el lector de pantalla oye solo el valor final; con movimiento reducido no cuentan).
 */
export function NumerosClave({ n }: { n: ReturnType<typeof numerosClave> }) {
  const animada = (v: number | null, formato: (x: number) => string) =>
    v === null ? '—' : <Cifra valor={v} formato={formato} />;
  return (
    <section aria-label="Números clave" className="kpis-bi">
      <Kpi
        etiqueta="Ventas Netas"
        valor={animada(n.ventaCent, (x) => dinero(Math.round(x), 'MXN', false))}
        icono={Banknote}
        nota={`Cobrado: ${dinero(n.cobradoCent)}`}
      />
      <Kpi
        etiqueta="Ticket Promedio"
        valor={animada(n.ticketPromedioCent, (x) => dinero(Math.round(x)))}
        icono={Receipt}
      />
      <Kpi etiqueta="# de Tickets" valor={animada(n.tickets, (x) => numero(Math.round(x)))} icono={Ticket} />
      <Kpi etiqueta="Promedio UPT" valor={animada(n.upt, (x) => decimales.format(x))} icono={Layers} />
      <Kpi
        etiqueta="Total Products"
        valor={animada(n.unidades, (x) => numero(Math.round(x)))}
        icono={Package}
      />
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
    <Tarjeta
      titulo="Contra meta y punto de equilibrio"
      descripcion="Venta de los días con corte del POS contra su meta y su P.E. La meta del periodo incluye los días que faltan."
    >
      <div className="grid gap-4 md:grid-cols-2">
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
    </Tarjeta>
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
export function BarrasShare({ titulo, filas }: { titulo: string; filas: FilaShare[] }) {
  const max = Math.max(0, ...filas.map((f) => f.share ?? 0));
  return (
    <div className="min-w-0 space-y-3">
      <h3 className="text-sm font-semibold text-ink-2">{titulo}</h3>
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

/** Bloque 3. Recibe las filas ya con su share (conShare). Grupos y café: composición con color fijo por entidad. */
export function Mezcla({
  grupos,
  cafe,
  master,
}: {
  grupos: { grupo: string; venta_cent: number; share: number | null }[];
  cafe: { cafe: string; venta_cent: number; share: number | null }[];
  master: { categoria: string; venta_cent: number; share: number | null }[];
}) {
  return (
    <Tarjeta titulo="Mezcla de venta" descripcion="Venta neta y su participación.">
      <div className="grid gap-8 lg:grid-cols-2">
        <div className="space-y-8">
          {grupos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Sin venta en el periodo.</p>
          ) : (
            <BarraApilada
              titulo="Comida, Bebida, Combo y Merch"
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
          {cafe.length === 0 ? null : (
            <BarraApilada
              titulo="Bebidas con café y sin café"
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
        </div>
        <BarrasShare
          titulo="Categoría Master Franchise MX"
          filas={master.map((m) => ({
            clave: m.categoria,
            etiqueta: m.categoria,
            ventaCent: m.venta_cent,
            share: m.share,
          }))}
        />
      </div>
    </Tarjeta>
  );
}
