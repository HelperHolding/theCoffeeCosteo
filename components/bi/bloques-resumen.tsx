'use client';
// Bloques 1 a 3 del tablero BI: números clave, contra P.E. y meta (F5) y mezcla de venta.
import { Banknote, Layers, Package, Receipt, Ticket } from 'lucide-react';
import { Barra, Kpi, Tarjeta } from '@/components/portal/piezas';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import type { numerosClave } from '@/lib/bi/bloques';

const decimales = new Intl.NumberFormat('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Bloque 1. Los cocientes sin base (0 tickets) llegan como null y se ven «—». */
export function NumerosClave({ n }: { n: ReturnType<typeof numerosClave> }) {
  return (
    <section aria-label="Números clave" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-5">
      <Kpi
        etiqueta="Ventas Netas"
        valor={dinero(n.ventaCent, 'MXN', false)}
        icono={Banknote}
        nota={`Cobrado: ${dinero(n.cobradoCent)}`}
      />
      <Kpi etiqueta="Ticket Promedio" valor={dinero(n.ticketPromedioCent)} icono={Receipt} />
      <Kpi etiqueta="# de Tickets" valor={numero(n.tickets)} icono={Ticket} />
      <Kpi etiqueta="Promedio UPT" valor={n.upt === null ? '—' : decimales.format(n.upt)} icono={Layers} />
      <Kpi etiqueta="Total Products" valor={numero(n.unidades)} icono={Package} />
    </section>
  );
}

/** Bloque 2: las metas y el punto de equilibrio llegan en F5. */
export function ContraMeta() {
  return (
    <Tarjeta titulo="Contra P.E. y meta">
      <p className="text-sm text-muted-foreground">Disponible en F5: metas y punto de equilibrio.</p>
    </Tarjeta>
  );
}

export interface FilaShare {
  clave: string;
  etiqueta: string;
  ventaCent: number;
  share: number | null;
}

/** Barras horizontales con venta y porcentaje, en la escala de la fila mayor. */
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
              <Barra valor={f.share ?? 0} max={max} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const NOMBRE_CAFE: Record<string, string> = { Sí: 'Con café', No: 'Sin café' };

/** Bloque 3. Recibe las filas ya con su share (conShare). */
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
          <BarrasShare
            titulo="Comida, Bebida, Combo y Merch"
            filas={grupos.map((g) => ({
              clave: g.grupo,
              etiqueta: g.grupo,
              ventaCent: g.venta_cent,
              share: g.share,
            }))}
          />
          <BarrasShare
            titulo="Bebidas con café y sin café"
            filas={cafe.map((c) => ({
              clave: c.cafe,
              etiqueta: NOMBRE_CAFE[c.cafe] ?? c.cafe,
              ventaCent: c.venta_cent,
              share: c.share,
            }))}
          />
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
