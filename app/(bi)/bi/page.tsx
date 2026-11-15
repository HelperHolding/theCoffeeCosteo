import Link from 'next/link';
import { sesionBi } from '@/lib/supabase/sesion';
import { Encabezado, Tarjeta } from '@/components/portal/piezas';

export default async function TablerosBi() {
  await sesionBi();
  return (
    <>
      <Encabezado area="BI" titulo="Tableros" />
      <Link href="/bi/the-coffee-mexico" className="block">
        <Tarjeta>
          <p className="font-semibold">The Coffee México</p>
          <p className="mt-1 text-sm text-neutral-500">
            Ventas de la red: los 17 filtros y los bloques del tablero de Zoho
          </p>
        </Tarjeta>
      </Link>
    </>
  );
}
