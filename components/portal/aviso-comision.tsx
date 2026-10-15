import Link from 'next/link';
import { Info } from 'lucide-react';
export function AvisoComision({ pendiente }: { pendiente: boolean }) {
  return pendiente ? (
    <p className="aviso flex flex-wrap items-center gap-2">
      <Info size={16} aria-hidden="true" />
      <span>Comisión de App propia por confirmar. Sus márgenes son provisionales.</span>
      <Link href="/configuracion?tab=canales" className="ml-auto font-semibold underline">
        Revisar canales
      </Link>
    </p>
  ) : null;
}
