import { contextoGestor } from '@/lib/franquiciatarios/pagina';
import { leerServicio } from '@/lib/franquiciatarios/servicio-servidor';
import { Encabezado } from '@/components/portal/piezas';
import { ServicioFranq } from '@/components/franquiciatarios/servicio';

export const dynamic = 'force-dynamic';

/** Tiempo de preparación (nivel de servicio de Rappi). Solo gerencia. */
export default async function PaginaServicio({ params }: { params: Promise<{ companyId: string }> }) {
  const c = await contextoGestor(params);
  const s = await leerServicio(c.db, c.companyId);
  return (
    <>
      <Encabezado
        area={c.cfg.nombre}
        titulo="Tiempo de preparación"
        descripcion="Cocina demorada, rechazos por demora y espera del repartidor según Rappi."
      />
      {s ? (
        <ServicioFranq s={s} />
      ) : (
        <p className="aviso">No se pudo leer el nivel de servicio. Intenta de nuevo.</p>
      )}
    </>
  );
}
