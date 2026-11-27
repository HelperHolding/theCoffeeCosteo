'use client';
import { createContext, useContext, useMemo, type ReactNode } from 'react';
import Link from 'next/link';

/**
 * Qué sucursales se pueden abrir desde un tablero. En el de México todas las listadas son del usuario; en un tablero de
 * ciudad (docs/sucursales/19) se ven todas las de la ciudad, pero solo las asignadas abren su página: las demás
 * llevarían a «Sucursal no disponible». Sin proveedor, todas enlazan (el comportamiento de siempre).
 */
const Enlazable = createContext<(companyId: number) => boolean>(() => true);

export function SucursalesEnlazables({ ids, children }: { ids: number[] | null; children: ReactNode }) {
  const valor = useMemo(() => {
    if (!ids) return () => true;
    const s = new Set(ids);
    return (id: number) => s.has(id);
  }, [ids]);
  return <Enlazable.Provider value={valor}>{children}</Enlazable.Provider>;
}

/** Nombre de la sucursal: enlace a su página si el usuario la tiene; si no, texto con el mismo estilo. */
export function EnlaceSucursal({
  companyId,
  href,
  className,
  children,
}: {
  companyId: number;
  href?: string;
  className?: string;
  children: ReactNode;
}) {
  const puede = useContext(Enlazable)(companyId);
  if (puede)
    return (
      <Link href={href ?? `/sucursales/${companyId}`} className={className}>
        {children}
      </Link>
    );
  return <span className={className?.replace(/\bhover:underline\b/g, '').trim()}>{children}</span>;
}
