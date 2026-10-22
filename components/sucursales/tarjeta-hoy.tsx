'use client';
import Link from 'next/link';
import { Activity, ArrowUpRight } from 'lucide-react';
import type { RespuestaVivo } from '@/lib/sucursales/contratos';
import { Delta } from './colores';
import { dinero, hace, numero } from './formato';
import { useLectura } from './use-lectura';

/**
 * Tarjeta del directorio con "hoy": reutiliza la ruta de En vivo de ESA sucursal (misma autorización y
 * caché de 45 s). Solo se monta para sucursales asignadas al usuario; un error se muestra como tal.
 */
export function TarjetaHoy({
  companyId,
  nombre,
  ciudad,
  tienda,
}: {
  companyId: number;
  nombre: string;
  ciudad: string;
  tienda: number;
}) {
  const { datos, error } = useLectura<RespuestaVivo>(`/api/sucursales/${companyId}/vivo?origen=todos`, {
    intervaloMs: 60_000,
  });
  const errorHoy = datos?.lecturas.hoy.estado === 'error';
  return (
    <Link
      href={`/sucursales/${companyId}`}
      className="group flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
    >
      <span className="flex items-center justify-between">
        <span className="grid size-11 place-items-center rounded-xl bg-ink text-crema">
          <Activity size={20} aria-hidden="true" />
        </span>
        <ArrowUpRight size={18} aria-hidden="true" className="text-muted-foreground group-hover:text-ink" />
      </span>
      <span>
        <span className="block font-display text-lg font-bold">{nombre}</span>
        <span className="mt-1 block text-sm text-muted-foreground">
          {ciudad} · Tienda {tienda} · ID API {companyId}
        </span>
      </span>
      <span className="mt-auto block rounded-xl bg-paper px-3 py-2.5" aria-live="polite">
        {!datos && !error ? (
          <span
            className="block h-10 rounded-lg bg-line/60 motion-safe:animate-pulse"
            aria-label="Cargando hoy"
          />
        ) : error || errorHoy ? (
          <span className="block text-xs font-semibold text-bad">
            Sin datos de hoy (error de lectura, no es venta cero)
          </span>
        ) : (
          <span className="flex flex-wrap items-end justify-between gap-2">
            <span>
              <span className="block text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Hoy a las {datos!.corte.hora.slice(0, 5)}
              </span>
              <span className="font-display text-xl font-black tabular">
                {dinero(datos!.kpis.ventaCent, 'MXN', false)}
              </span>
              <span className="ml-2 text-xs text-ink-2 tabular">{numero(datos!.kpis.pedidos)} ped.</span>
            </span>
            <span className="flex flex-col items-end gap-1 text-xs text-muted-foreground">
              {datos!.comparativo && (
                <Delta valor={datos!.comparativo.venta} sufijo={`vs ${datos!.base.dia}`} />
              )}
              <span>
                {datos!.ultimoPedido
                  ? `Último pedido ${hace(datos!.ultimoPedido.haceSeg)}`
                  : 'Sin pedidos aún'}
              </span>
            </span>
          </span>
        )}
      </span>
    </Link>
  );
}
