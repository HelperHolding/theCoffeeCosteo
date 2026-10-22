import Link from 'next/link';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { TarjetaHoy } from '@/components/sucursales/tarjeta-hoy';

/** Máximo de sucursales con lectura de "hoy" en el directorio (el resto se abre bajo demanda). */
const MAX_HOY = 12;

/**
 * Directorio: solo sucursales asignadas Y configuradas. Cada tarjeta lee "hoy" de su propia sucursal
 * (máx. 12); nunca se leen pedidos de sucursales no asignadas.
 */
export default async function Directorio() {
  // El layout no se vuelve a ejecutar al navegar: cada página valida su propia sesión.
  const { companias } = await sesionSucursales();
  const lista = sucursalesAccesibles(companias).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'));
  const sinConfigurar = companias.length - lista.length;
  return (
    <>
      <Encabezado
        area="Sucursales"
        titulo="Directorio"
        descripcion="Sucursales habilitadas para ti, con su venta de hoy (mostrador, app y Rappi) (API The Coffee, se actualiza cada minuto)."
      />
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s, i) => (
            <li key={s.companyId}>
              {i < MAX_HOY ? (
                <TarjetaHoy
                  companyId={s.companyId}
                  nombre={s.nombre}
                  ciudad={s.ciudad}
                  tienda={s.lookerStoreId}
                />
              ) : (
                <Link
                  href={`/sucursales/${s.companyId}`}
                  className="flex h-full flex-col gap-1 rounded-2xl border border-line bg-surface p-5 shadow-card hover:border-ink/30"
                >
                  <span className="font-display text-lg font-bold">{s.nombre}</span>
                  <span className="text-sm text-muted-foreground">
                    {s.ciudad} · Tienda {s.lookerStoreId} · ID API {s.companyId}
                  </span>
                </Link>
              )}
            </li>
          ))}
        </ul>
      )}
      {lista.length > MAX_HOY && (
        <p className="placa px-3 py-2 text-xs text-muted-foreground">
          La venta de hoy se muestra en las primeras {MAX_HOY} sucursales; las demás la muestran al abrirlas.
        </p>
      )}
      {sinConfigurar > 0 && (
        <p className="placa px-3 py-2 text-xs text-muted-foreground">
          {sinConfigurar} sucursal(es) asignada(s) aún no están habilitadas en el portal (falta revisar
          moneda, zona horaria e identidad).
        </p>
      )}
    </>
  );
}
