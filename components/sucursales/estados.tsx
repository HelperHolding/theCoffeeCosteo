import Link from 'next/link';
import { CircleAlert, TriangleAlert } from 'lucide-react';
import type { LecturaInfo } from '@/lib/sucursales/contratos';
import type { ErrorLecturaUi } from './use-lectura';

export function Esqueleto({ filas = 2 }: { filas?: number }) {
  const bloque = 'rounded-2xl bg-white/60 motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className={`${bloque} h-32`} />
        ))}
      </div>
      {Array.from({ length: filas }, (_, i) => (
        <div key={i} className={`${bloque} h-56`} />
      ))}
      <span className="sr-only">Cargando datos de la sucursal…</span>
    </div>
  );
}

/** Error de lectura: nunca se presenta como venta cero. */
export function ErrorCarga({ error, alReintentar }: { error: ErrorLecturaUi; alReintentar?: () => void }) {
  const sesion = error.status === 401;
  const permiso = error.status === 403 || error.status === 404;
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-2xl border border-bad/30 bg-bad-soft p-4 text-sm"
    >
      <TriangleAlert size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-bad" />
      <div className="space-y-2">
        <p className="font-semibold text-bad">
          {sesion
            ? 'Tu sesión venció'
            : permiso
              ? 'Sin acceso a esta sucursal'
              : 'No se pudieron leer las ventas'}
        </p>
        <p className="text-ink-2">{error.mensaje} Esto no significa que no haya ventas.</p>
        {sesion ? (
          <Link href="/login" className="font-semibold underline">
            Iniciar sesión
          </Link>
        ) : (
          !permiso &&
          alReintentar && (
            <button type="button" onClick={alReintentar} className="font-semibold underline">
              Reintentar
            </button>
          )
        )}
      </div>
    </div>
  );
}

/** Texto aprobado por Carlo (conciliacion-brasil/14): limitación de la fuente, no un ajuste de cifras. */
export const AVISO_CALIDAD_RAPPI =
  'Datos reportados por el POS de Brasil. Detectamos pedidos Rappi con artículos o cargos de tamaño no desglosados; estos importes pueden diferir de Rappi y no representan una liquidación.';

/** Aviso de calidad de fuente: se muestra siempre que las métricas incluyan el canal Rappi. */
export function AvisoCalidadRappi() {
  return (
    <p
      role="note"
      className="flex items-start gap-2 rounded-2xl border border-warn/30 bg-warn-soft px-4 py-3 text-sm text-ink-2"
    >
      <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <span>{AVISO_CALIDAD_RAPPI}</span>
    </p>
  );
}

/** Avisos de cobertura: lectura parcial o con registros excluidos. */
export function AvisosLectura({ lecturas }: { lecturas: { nombre: string; info: LecturaInfo }[] }) {
  const conAviso = lecturas.filter((l) => l.info.estado !== 'completa' || l.info.avisos.length > 0);
  if (!conAviso.length) return null;
  return (
    <div role="status" className="space-y-1 rounded-2xl border border-warn/30 bg-warn-soft p-4 text-sm">
      {conAviso.map((l) => (
        <p key={l.nombre} className="flex items-start gap-2 text-ink-2">
          <CircleAlert size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <span>
            <strong className="font-semibold">
              {l.nombre}:{' '}
              {l.info.estado === 'error'
                ? 'sin datos'
                : l.info.estado === 'parcial'
                  ? 'lectura parcial'
                  : 'aviso'}
            </strong>
            {l.info.estado === 'parcial' &&
              l.info.totalDeclarado !== null &&
              ` (se leyeron ${l.info.pedidos} de ${l.info.totalDeclarado} pedidos declarados)`}
            . {l.info.error ?? l.info.avisos.join(' ')}
          </span>
        </p>
      ))}
    </div>
  );
}
