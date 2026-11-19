import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Store } from 'lucide-react';
import { sesionFranquiciatarios } from '@/lib/supabase/sesion';
import { configDe } from '@/lib/sucursales/config';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { MarcoFranq } from '@/components/franquiciatarios/marco-franq';

export const dynamic = 'force-dynamic';

const ROL = { admin: 'Administración', franquiciatario: 'Franquiciatario', gerente: 'Gerente', barista: 'Baristas' };

export default async function Sucursales() {
  const s = await sesionFranquiciatarios();
  const lista = [...s.sucursales]
    .map(([id, rol]) => ({ cfg: configDe(id), rol }))
    .filter((x) => x.cfg !== null)
    .sort((a, b) => a.cfg!.nombre.localeCompare(b.cfg!.nombre, 'es'));
  // Con una sola sucursal (lo normal en tienda), directo a su día.
  if (lista.length === 1 && !s.admin) redirect(`/franquiciatarios/${lista[0].cfg!.companyId}`);
  return (
    <MarcoFranq s={s}>
      <Encabezado area="Operación" titulo="Mis sucursales" descripcion="Elige la sucursal para ver su día." />
      {lista.length === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Aún no tienes sucursales asignadas">Pide al administrador que te asigne tu sucursal.</Vacio>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {lista.map(({ cfg, rol }) => (
            <li key={cfg!.companyId}>
              <Link
                href={`/franquiciatarios/${cfg!.companyId}`}
                className="flex items-center gap-4 rounded-2xl border border-line bg-surface p-5 shadow-card transition-[border-color,box-shadow] hover:border-line-strong hover:shadow-lift focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45"
              >
                <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-ink">
                  <Store size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0">
                  <span className="block font-display text-lg font-bold">{cfg!.nombre}</span>
                  <span className="text-sm text-muted-foreground">
                    {cfg!.ciudad} · {ROL[rol]}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </MarcoFranq>
  );
}
