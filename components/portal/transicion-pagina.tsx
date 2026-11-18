import { ViewTransition } from 'react';

/**
 * Entrada y salida de pantalla al navegar dentro de un módulo (va en el template.tsx de cada módulo: Next lo vuelve a
 * montar en cada navegación, el layout no). La pantalla vieja se desvanece rápido y la nueva sube 6 px mientras
 * aparece; la barra superior y el menú no se mueven. `default="none"`: router.refresh(), filtros y Suspense no
 * animan. Sin soporte del navegador o con movimiento reducido, el cambio es instantáneo (globals.css).
 */
export function TransicionPagina({
  children,
  espacio = 'space-y-7',
}: {
  children: React.ReactNode;
  /** La misma separación que el layout daba a los bloques de la pantalla (CRM usa space-y-6). */
  espacio?: 'space-y-6' | 'space-y-7';
}) {
  return (
    <ViewTransition enter="pagina-entra" exit="pagina-sale" default="none">
      <div className={espacio}>{children}</div>
    </ViewTransition>
  );
}
