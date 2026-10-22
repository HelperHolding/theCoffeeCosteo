import Link from 'next/link';
import { Activity, ArrowUpRight } from 'lucide-react';
import { sesionSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { Encabezado, Vacio } from '@/components/portal/piezas';

/** Directorio: solo sucursales asignadas Y configuradas. No consulta pedidos de ninguna. */
export default async function Directorio() {
  // El layout no se vuelve a ejecutar al navegar: cada página valida su propia sesión.
  const { companias } = await sesionSucursales();
  const lista = sucursalesAccesibles(companias);
  const sinConfigurar = companias.length - lista.length;
  return (
    <>
      <Encabezado
        area="Sucursales"
        titulo="Directorio"
        descripcion="Sucursales habilitadas para ti. Cada una muestra sus ventas POS de la API The Coffee en vivo."
      />
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </div>
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map((s) => (
            <li key={s.companyId}>
              <Link
                href={`/sucursales/${s.companyId}`}
                className="group flex h-full flex-col gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-colors hover:border-ink/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
              >
                <span className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-ink text-crema">
                    <Activity size={20} aria-hidden="true" />
                  </span>
                  <ArrowUpRight
                    size={18}
                    aria-hidden="true"
                    className="text-muted-foreground group-hover:text-ink"
                  />
                </span>
                <span>
                  <span className="block font-display text-lg font-bold">{s.nombre}</span>
                  <span className="mt-1 block text-sm text-muted-foreground">
                    {s.ciudad} · Tienda {s.lookerStoreId} · ID API {s.companyId}
                  </span>
                  <span className="mt-3 block text-xs text-ink-2">Ventas POS · {s.moneda}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
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
