import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { leerBaristas } from '@/lib/franquiciatarios/servidor';
import { Encabezado } from '@/components/portal/piezas';
import { Equipo } from '@/components/franquiciatarios/equipo';

export default async function PaginaEquipo({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoGestor(params);
  const baristas = await leerBaristas(c.db, c.companyId);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Baristas"
        descripcion="Nombres de la cuenta de baristas de la sucursal. Cada registro guarda el nombre que eligió quien lo hizo."
      />
      <Equipo companyId={c.companyId} baristas={baristas} />
    </>
  );
}
