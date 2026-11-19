'use client';
import { useState } from 'react';
import { FileDown, Printer, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useLectura } from '@/components/sucursales/use-lectura';
import { Esqueleto, ErrorCarga } from '@/components/sucursales/estados';
import { dinero, numero } from '@/components/sucursales/formato';
import { etiquetaOrigen, type FiltroOrigen } from '@/lib/sucursales/metricas';
import type { Tira } from '@/lib/franquiciatarios/ventas';
import { FiltroOrigenFranq } from './ventas';
import { diaLargo } from './formato';
import './tira.css';

/** Imprime solo el ticket con el tamaño de hoja elegido; «PDF» es la impresión del navegador en A4. */
function imprimir(formato: '80mm' | 'a4') {
  const html = document.documentElement;
  const estilo = document.createElement('style');
  estilo.textContent =
    formato === '80mm' ? '@page { size: 80mm auto; margin: 4mm; }' : '@page { size: A4; margin: 18mm; }';
  html.dataset.tira = formato;
  document.head.appendChild(estilo);
  const limpiar = () => {
    estilo.remove();
    delete html.dataset.tira;
    window.removeEventListener('afterprint', limpiar);
  };
  window.addEventListener('afterprint', limpiar);
  window.print();
}

export function TiraVenta({
  companyId,
  dias,
  rappi,
}: {
  companyId: number;
  /** Días que se pueden consultar (hoy primero), en fecha local de la sucursal. */
  dias: string[];
  rappi: boolean;
}) {
  const [dia, setDia] = useState(dias[0]);
  const [origen, setOrigen] = useState<FiltroOrigen>('todos');
  const { datos, error, cargando, recargar } = useLectura<Tira>(
    `/api/franquiciatarios/${companyId}/tira?dia=${dia}&origen=${origen}`,
  );
  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <FiltroOrigenFranq origen={origen} rappi={rappi} alCambiar={setOrigen} />
        <label className="text-sm font-medium text-ink">
          Día
          <select
            value={dia}
            onChange={(e) => setDia(e.target.value)}
            className="mt-2 block h-12 w-full rounded-xl border border-line-strong bg-surface px-3 text-[15px] text-ink lg:w-64"
          >
            {dias.map((d, i) => (
              <option key={d} value={d}>
                {i === 0 ? 'Hoy · ' : ''}
                {diaLargo(d)}
              </option>
            ))}
          </select>
        </label>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="lg" disabled={!datos} onClick={() => imprimir('80mm')}>
          <Printer aria-hidden="true" /> Imprimir ticket (80 mm)
        </Button>
        <Button size="lg" variant="outline" disabled={!datos} onClick={() => imprimir('a4')}>
          <FileDown aria-hidden="true" /> Guardar PDF o imprimir en hoja
        </Button>
        <Button size="lg" variant="ghost" disabled={cargando} onClick={() => recargar()}>
          <RefreshCw aria-hidden="true" className={cargando ? 'animate-spin' : undefined} /> Actualizar
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        Para el PDF, elige «Guardar como PDF» en el cuadro de impresión.
      </p>
      {!datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto />
        )
      ) : (
        <Ticket t={datos} />
      )}
    </div>
  );
}

export function Ticket({ t }: { t: Tira }) {
  const m = t.sucursal.moneda;
  const impreso = new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    dateStyle: 'short',
    timeStyle: 'short',
  }).format(new Date(t.generadoEn));
  return (
    <article
      aria-label="Tira de venta"
      className="tira-ticket mx-auto max-w-sm rounded-2xl border border-line bg-surface p-6 text-[14px] text-ink shadow-card"
    >
      <header className="text-center">
        <p className="font-display text-xl font-black lowercase tracking-[-0.03em]">the coffee.</p>
        <p className="mt-1 font-semibold">{t.sucursal.nombre}</p>
        <p className="text-xs text-ink-2">{t.sucursal.ciudad}</p>
        <p className="mt-3 font-display text-base font-bold">Tira de venta</p>
        <p className="first-letter:uppercase">{diaLargo(t.dia)}</p>
        {t.origen !== 'todos' && <p className="text-xs">Solo {etiquetaOrigen[t.origen]}</p>}
      </header>

      {(t.parcial || t.lectura.estado !== 'completa') && (
        <p className="mt-4 rounded-lg border border-warn/40 bg-warn-soft px-3 py-2 text-center text-xs font-semibold text-warn">
          {t.parcial
            ? `PARCIAL · el día no ha cerrado · corte ${t.corte}`
            : 'Lectura parcial: faltan datos de la fuente'}
          {t.lectura.avisos.length > 0 && (
            <span className="mt-1 block font-normal">{t.lectura.avisos.join(' ')}</span>
          )}
        </p>
      )}

      <div className="tira-regla my-4" />
      <dl className="space-y-1.5">
        <div className="tira-fila text-base font-bold">
          <dt>Venta total</dt>
          <dd>{dinero(t.totales.ventaCent, m)}</dd>
        </div>
        <div className="tira-fila">
          <dt>Pedidos</dt>
          <dd>{numero(t.totales.pedidos)}</dd>
        </div>
        <div className="tira-fila">
          <dt>Ticket promedio</dt>
          <dd>{dinero(t.totales.ticketCent, m)}</dd>
        </div>
        {t.totales.descuentoCent > 0 && (
          <div className="tira-fila">
            <dt>Descuentos</dt>
            <dd>{dinero(t.totales.descuentoCent, m)}</dd>
          </div>
        )}
      </dl>

      <Bloque titulo="Por origen">
        {t.origenes.map((o) => (
          <Fila
            key={o.origen}
            izq={`${etiquetaOrigen[o.origen]} (${o.pedidos})`}
            der={dinero(o.ventaCent, m)}
          />
        ))}
      </Bloque>
      <Bloque titulo="Por forma de pago">
        {t.pagos.map((p) => (
          <Fila key={p.metodo} izq={`${p.etiqueta} (${p.pedidos})`} der={dinero(p.ventaCent, m)} />
        ))}
      </Bloque>
      <Bloque titulo="Productos vendidos">
        {t.productos.length === 0 ? (
          <p className="text-xs text-ink-2">Sin productos.</p>
        ) : (
          t.productos.map((p) => (
            <Fila key={p.clave} izq={`${p.lineas} × ${p.nombre}`} der={dinero(p.importeCent, m)} />
          ))
        )}
      </Bloque>

      {t.conciliacion.diferenciaCent !== 0 && (
        <p className="mt-3 text-xs text-ink-2">
          Diferencia entre venta y productos: {dinero(t.conciliacion.diferenciaCent, m)}
          {t.conciliacion.soloRedondeo
            ? ' (redondeo del proveedor)'
            : ` en ${t.conciliacion.pedidosNoCuadran} pedidos`}
          .
        </p>
      )}
      <div className="tira-regla my-4" />
      <footer className="text-center text-[11px] text-ink-2">
        <p>Impreso {impreso}</p>
        <p className="mt-1">Cifras de la fuente (POS y portal de Rappi), sin estimaciones.</p>
      </footer>
    </article>
  );
}

function Bloque({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <div className="tira-regla mb-3" />
      <h3 className="mb-1.5 text-xs font-bold">{titulo}</h3>
      <div className="space-y-1">{children}</div>
    </section>
  );
}

function Fila({ izq, der }: { izq: string; der: string }) {
  return (
    <div className="tira-fila text-[13px]">
      <span className="min-w-0 break-words">{izq}</span>
      <span className="shrink-0">{der}</span>
    </div>
  );
}
