import { redirect } from 'next/navigation';
import { sesionFranquiciatarios } from '@/lib/supabase/sesion';
import { configDe } from '@/lib/sucursales/config';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { MarcoFranq } from '@/components/franquiciatarios/marco-franq';
import { TarjetaSucursal } from '@/components/franquiciatarios/mis-sucursales';
import { leerMisSucursales, MAX_DETALLE } from '@/lib/franquiciatarios/mis-sucursales';

export const dynamic = 'force-dynamic';

const ROL = {
  admin: 'Administración',
  franquiciatario: 'Franquiciatario',
  gerente: 'Gerente',
  barista: 'Baristas',
};

export default async function Sucursales() {
  const s = await sesionFranquiciatarios();
  const lista = [...s.sucursales]
    .map(([id, rol]) => ({ cfg: configDe(id), rol }))
    .filter((x) => x.cfg !== null)
    .sort((a, b) => a.cfg!.nombre.localeCompare(b.cfg!.nombre, 'es'));
  // Con una sola sucursal (lo normal en tienda), directo a su día.
  if (lista.length === 1 && !s.admin) redirect(`/franquiciatarios/${lista[0].cfg!.companyId}`);
  // Con pocas sucursales (un franquiciatario), cada tarjeta trae su día: checklists, avisos y venta de hoy.
  const resumen =
    lista.length <= MAX_DETALLE
      ? await leerMisSucursales(
          s.db,
          lista.map((x) => x.cfg!.companyId),
        )
      : null;
  return (
    <MarcoFranq s={s}>
      <Encabezado
        area="Operación"
        titulo="Mis sucursales"
        descripcion={
          resumen
            ? 'El día de cada sucursal: avance de los checklists, avisos y venta de hoy. Ábrela para ver el detalle.'
            : 'Elige la sucursal para ver su día.'
        }
      />
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Aún no tienes sucursales asignadas">
            Pide al administrador que te asigne tu sucursal.
          </Vacio>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map(({ cfg, rol }) => (
            <li key={cfg!.companyId}>
              <TarjetaSucursal
                companyId={cfg!.companyId}
                nombre={cfg!.nombre}
                detalle={`${cfg!.ciudad} · ${ROL[rol]}`}
                r={resumen?.get(cfg!.companyId)}
              />
            </li>
          ))}
        </ul>
      )}
    </MarcoFranq>
  );
}
