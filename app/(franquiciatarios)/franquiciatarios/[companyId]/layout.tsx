import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { MarcoFranq } from '@/components/franquiciatarios/marco-franq';

export const dynamic = 'force-dynamic';

export default async function SucursalLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ companyId: string }>;
}) {
  const c = await contextoSucursal(params);
  return (
    <MarcoFranq
      s={c}
      franquicia={{
        companyId: c.companyId,
        nombre: c.cfg.nombre,
        gestor: c.gestor,
        varias: c.sucursales.size > 1,
      }}
    >
      {children}
    </MarcoFranq>
  );
}
