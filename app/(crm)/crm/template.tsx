import { TransicionPagina } from '@/components/portal/transicion-pagina';

/** Se vuelve a montar en cada navegación del módulo: anima la entrada de la pantalla nueva. */
export default function Plantilla({ children }: { children: React.ReactNode }) {
  return <TransicionPagina espacio="space-y-6">{children}</TransicionPagina>;
}
