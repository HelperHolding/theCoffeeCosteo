import { Suspense } from 'react';
import type { IdModulo } from '@/lib/portal/modulos';
import { Encabezado, Vacio } from '@/components/portal/piezas';
import { EsqueletoBloque } from './bloque';
import { BloqueBi, BloqueComercializadora, BloqueCosteo, BloqueCrm, BloqueFranquiciatarios } from './bloques';
import { MexicoResumen } from './mexico';

/** Bloques de módulo en el orden del dashboard (Sucursales va arriba como Tablero México). */
const ORDEN: { id: Exclude<IdModulo, 'sucursales'>; Bloque: () => Promise<React.ReactNode> }[] = [
  { id: 'bi', Bloque: BloqueBi },
  { id: 'costeo', Bloque: BloqueCosteo },
  { id: 'crm', Bloque: BloqueCrm },
  { id: 'comercializadora', Bloque: BloqueComercializadora },
  { id: 'franquiciatarios', Bloque: BloqueFranquiciatarios },
];

const fechaLarga = () =>
  new Intl.DateTimeFormat('es-MX', {
    timeZone: 'America/Mexico_City',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }).format(new Date());

/**
 * Dashboard de Inicio. Solo monta los bloques de los módulos visibles para el usuario (nunca consulta uno sin acceso)
 * y cada bloque va en su propio Suspense con su esqueleto. Entrada escalonada (vitrina.css, .tarjeta-entrada): el
 * único movimiento orquestado de la portada; con movimiento reducido no se mueve.
 */
export function Dashboard({ nombre, visibles }: { nombre: string; visibles: IdModulo[] }) {
  const bloques = ORDEN.filter((b) => visibles.includes(b.id));
  return (
    <>
      <Encabezado
        area={`Hola, ${nombre}`}
        titulo="Resumen de hoy"
        descripcion={
          <span className="first-letter:uppercase">{fechaLarga()} · lo más importante de cada módulo</span>
        }
      />
      {!visibles.length ? (
        <Vacio titulo="Todavía no tienes módulos">Pide a quien administra el portal que te dé acceso.</Vacio>
      ) : (
        <div className="space-y-5">
          {visibles.includes('sucursales') && (
            <div className="tarjeta-entrada" style={{ '--i': 0 } as React.CSSProperties}>
              <MexicoResumen />
            </div>
          )}
          {bloques.length > 0 && (
            <div className="grid gap-5 md:grid-cols-2 2xl:grid-cols-3">
              {bloques.map(({ id, Bloque }, i) => (
                <div
                  key={id}
                  className="tarjeta-entrada flex [&>*]:flex-1"
                  style={{ '--i': i + 1 } as React.CSSProperties}
                >
                  <Suspense fallback={<EsqueletoBloque modulo={id} className="flex-1" />}>
                    <Bloque />
                  </Suspense>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </>
  );
}
