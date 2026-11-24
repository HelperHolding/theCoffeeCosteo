import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas } from '@/lib/franquiciatarios/servidor';
import { leerEntradasHoy } from '@/lib/franquiciatarios/existencias-servidor';
import { Encabezado } from '@/components/portal/piezas';
import { EntradasFranq } from '@/components/franquiciatarios/existencias';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';

export const dynamic = 'force-dynamic';

/**
 * Entradas de hoy: cualquier rol registra lo que llega de otro proveedor (la cuenta de baristas con su nombre
 * declarado). Los pedidos a la Comercializadora entran solos cuando la gerencia registra su recepción.
 */
export default async function PaginaEntradas({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoSucursal(params);
  const datos = await leerEntradasHoy(c.db, c.cfg);
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Entradas"
      descripcion={
        <span className="first-letter:uppercase">
          {datos ? diaLargo(datos.hoy) : 'Hoy'} · lo que llega a la sucursal y entra al inventario
        </span>
      }
    />
  );
  const baristas = c.rol === 'barista' ? await leerBaristas(c.db, c.companyId) : [];
  const elegido = c.rol === 'barista' ? await baristaElegido(baristas, c.companyId) : null;
  if (c.rol === 'barista' && !elegido)
    return (
      <>
        {encabezado}
        <QuienEres companyId={c.companyId} nombres={baristas.filter((b) => b.activo)} />
      </>
    );
  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {datos ? (
        <EntradasFranq
          companyId={c.companyId}
          insumos={datos.insumos}
          entradas={datos.entradas}
          gestor={c.gestor}
          hoy={datos.hoy}
        />
      ) : (
        <p className="aviso">No se pudieron leer las entradas. Intenta de nuevo.</p>
      )}
    </>
  );
}
