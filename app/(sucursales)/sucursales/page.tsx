import { sesionSucursales } from '@/lib/supabase/sesion';
import { sucursalesAccesibles } from '@/lib/sucursales/acceso';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { TarjetaHoy } from '@/components/sucursales/tarjeta-hoy';
import { AvisoCalidadRappi } from '@/components/sucursales/estados';

/**
 * Directorio: solo sucursales asignadas Y configuradas, agrupadas por ciudad. Cada tarjeta lee "hoy" de su propia
 * sucursal cuando entra en pantalla; nunca se leen pedidos de sucursales no asignadas.
 */
export default async function Directorio() {
  // El layout no se vuelve a ejecutar al navegar: cada página valida su propia sesión.
  const { companias } = await sesionSucursales();
  const lista = sucursalesAccesibles(companias).sort((a, b) => a.nombre.localeCompare(b.nombre, 'es-MX'));
  const sinConfigurar = companias.length - lista.length;
  const ciudades = [...new Set(lista.map((s) => s.ciudad))].sort((a, b) => a.localeCompare(b, 'es-MX'));
  const conRappi = lista.filter((s) => s.rappi);
  return (
    <>
      <Encabezado
        area="Sucursales"
        titulo="Directorio"
        descripcion="Sucursales habilitadas para ti, con su venta de hoy (API The Coffee, se actualiza cada minuto)."
      />
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne una sucursal habilitada.
          </Vacio>
        </div>
      ) : (
        <>
          {/* La venta de hoy de las sucursales con Rappi en la API lo incluye. */}
          {conRappi.length > 0 && <AvisoCalidadRappi />}
          {conRappi.length > 0 && conRappi.length < lista.length && (
            <p className="placa px-3 py-2 text-xs text-muted-foreground">
              Rappi llega por la API solo en {conRappi.map((s) => s.nombre).join(', ')}. En las demás, la
              venta de hoy es Mostrador + App.
            </p>
          )}
          {ciudades.map((ciudad) => {
            const deCiudad = lista.filter((s) => s.ciudad === ciudad);
            return (
              <section key={ciudad} aria-labelledby={`ciudad-${ciudad}`} className="space-y-3">
                <h2 id={`ciudad-${ciudad}`} className="placa inline-flex items-baseline gap-2 px-3 py-1.5">
                  <span className="font-display text-lg font-bold">{ciudad}</span>
                  <span className="text-xs text-muted-foreground">
                    {deCiudad.length} {deCiudad.length === 1 ? 'sucursal' : 'sucursales'}
                  </span>
                </h2>
                <ul className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {deCiudad.map((s) => (
                    <li key={s.companyId}>
                      <TarjetaHoy
                        companyId={s.companyId}
                        nombre={s.nombre}
                        ciudad={s.ubicacion ?? s.ciudad}
                        tienda={s.lookerStoreId}
                      />
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
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
