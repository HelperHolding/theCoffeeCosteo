import Link from 'next/link';
import { BellRing, Store } from 'lucide-react';
import { cn } from 'cn';
import type { ResumenSucursalHoy } from '@/lib/franquiciatarios/mis-sucursales';

const COLOR: Record<string, string> = {
  apertura: 'bg-apertura',
  durante: 'bg-durante',
  cambio: 'bg-cambio',
  medio: 'bg-cambio',
  cierre: 'bg-cierre',
};
const CORTO: Record<string, string> = {
  apertura: 'Apertura',
  durante: 'Durante',
  cambio: 'Medio',
  medio: 'Medio',
  cierre: 'Cierre',
};
const pesos = (cent: number) =>
  (cent / 100).toLocaleString('es-MX', { style: 'currency', currency: 'MXN', maximumFractionDigits: 0 });
const corte = (seg: number) =>
  `${String(Math.floor(seg / 3600)).padStart(2, '0')}:${String(Math.floor((seg % 3600) / 60)).padStart(2, '0')}`;

/**
 * Tarjeta de una sucursal en «Mis sucursales»: con su resumen de hoy (checklists, avisos y venta) cuando el usuario
 * tiene pocas sucursales; si no, solo nombre y rol.
 */
export function TarjetaSucursal({
  companyId,
  nombre,
  detalle,
  r,
}: {
  companyId: number;
  nombre: string;
  /** «Guadalajara · Franquiciatario». */
  detalle: string;
  r?: ResumenSucursalHoy | null;
}) {
  return (
    <Link
      href={`/franquiciatarios/${companyId}`}
      className="flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45"
    >
      <span className="flex items-center gap-4">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink">
          <Store size={20} aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block font-display text-lg font-bold">{nombre}</span>
          <span className="text-sm text-muted-foreground">{detalle}</span>
        </span>
        {r && r.avisos > 0 && (
          <span
            className="inline-flex shrink-0 items-center gap-1 rounded-full bg-bad-soft px-2.5 py-1 text-xs font-semibold text-bad"
            title="«No» e incidencias de hoy"
          >
            <BellRing size={13} aria-hidden="true" /> {r.avisos}
          </span>
        )}
      </span>
      {r && (
        <>
          <span className="flex items-end justify-between gap-3">
            <span>
              <span className="block text-xs font-semibold text-ink-2">Venta de hoy</span>
              <span className="font-display text-2xl leading-tight font-black tabular">
                {r.ventaCent === null ? '—' : pesos(r.ventaCent)}
              </span>
            </span>
            {r.corteSegundo !== null && r.corteSegundo < 86_400 && (
              <span className="text-xs text-ink-2">al corte de las {corte(r.corteSegundo)}</span>
            )}
          </span>
          {r.secciones.length > 0 && (
            <span className="grid grid-cols-4 gap-2">
              {r.secciones.slice(0, 4).map((s) => (
                <span key={s.clave} className="space-y-1">
                  <span className="block text-[11px] font-semibold text-ink-2">
                    {CORTO[s.clave] ?? s.nombre}
                  </span>
                  <span
                    className="block h-2 rounded-full bg-ink/10"
                    role="img"
                    aria-label={`${s.nombre}: ${Math.round(s.avance * 100)} %`}
                  >
                    <span
                      className={cn('block h-full rounded-full', COLOR[s.clave] ?? 'bg-ink')}
                      style={{ width: `${Math.max(s.avance > 0 ? 6 : 0, s.avance * 100)}%` }}
                    />
                  </span>
                </span>
              ))}
            </span>
          )}
        </>
      )}
    </Link>
  );
}
