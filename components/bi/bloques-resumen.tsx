'use client';
// Bloques 1 a 3 del tablero BI: números clave, contra P.E. y meta (F5) y mezcla de venta.
import { Banknote, Layers, Package, Receipt, Ticket } from 'lucide-react';
import { Kpi, Tarjeta } from '@/components/portal/piezas';
import { AZUL } from '@/components/sucursales/colores';
import { BarraApilada } from '@/components/sucursales/graficas';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import { Cifra } from '@/components/sucursales/graficas-mexico';
import type { numerosClave } from '@/lib/bi/bloques';
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

/** Bloque 2: metas y punto de equilibrio. Sin fuente todavía: se dice «sin datos», nunca se muestra cero. */
export function ContraMeta() {
  return (
    <Tarjeta titulo="Contra P.E. y meta">
      <dl className="grid gap-4 sm:grid-cols-2">
        {['Meta de venta', 'Punto de equilibrio'].map((n) => (
          <div key={n}>
            <dt className="text-sm text-ink-2">{n}</dt>
            <dd className="mt-1 font-display text-xl font-bold text-muted-foreground">Sin datos</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-xs text-muted-foreground">
        Aún no se cargan metas ni punto de equilibrio en el portal. No se muestra ninguna estimación.
      </p>
    </Tarjeta>
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
