'use client';
import { Tag } from 'lucide-react';
import { cn } from 'cn';
import type { PedidoVista } from '@/lib/sucursales/contratos';
import { datosEtiquetas, htmlEtiquetas } from '@/lib/sucursales/etiqueta';

/**
 * Imprime las etiquetas desde un marco oculto (sin abrir otra ventana ni salir de la pantalla): el navegador abre su
 * diálogo de impresión con el tamaño de etiqueta (58 × 80 mm). El marco se quita al terminar.
 */
export function imprimirEtiquetas(pedido: PedidoVista, sucursal: string, indices?: number[]) {
  const etiquetas = datosEtiquetas(pedido, sucursal, indices);
  if (!etiquetas.length) return;
  const marco = document.createElement('iframe');
  marco.setAttribute('aria-hidden', 'true');
  marco.tabIndex = -1;
  Object.assign(marco.style, {
    position: 'fixed',
    right: '0',
    bottom: '0',
    width: '0',
    height: '0',
    border: '0',
  });
  document.body.appendChild(marco);
  const quitar = () => setTimeout(() => marco.remove(), 1000);
  const doc = marco.contentDocument;
  const win = marco.contentWindow;
  if (!doc || !win) return quitar();
  doc.open();
  doc.write(htmlEtiquetas(etiquetas));
  doc.close();
  win.addEventListener('afterprint', quitar, { once: true });
  // Espera un cuadro para que el marco tenga el contenido antes de imprimir.
  setTimeout(() => {
    win.focus();
    win.print();
    // Respaldo: algunos navegadores no avisan afterprint desde un marco.
    setTimeout(quitar, 60_000);
  }, 50);
}

/** Botón «Etiqueta»: imprime una etiqueta por producto del pedido (o solo de `indices`). */
export function BotonEtiqueta({
  pedido,
  sucursal,
  indices,
  texto = 'Etiqueta',
  className,
}: {
  pedido: PedidoVista;
  sucursal: string;
  indices?: number[];
  texto?: string;
  className?: string;
}) {
  const n = indices?.length ?? pedido.lineas.length;
  return (
    <button
      type="button"
      onClick={() => imprimirEtiquetas(pedido, sucursal, indices)}
      title={`Imprimir ${n} ${n === 1 ? 'etiqueta' : 'etiquetas'} (58 × 80 mm)`}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-tira/50 bg-tira-soft px-3 text-xs font-semibold text-ink hover:border-tira focus-visible:outline-2 focus-visible:outline-ink',
        className,
      )}
    >
      <Tag size={13} aria-hidden="true" className="text-tira" />
      {texto}
      <span className="sr-only"> del pedido {pedido.id}</span>
    </button>
  );
}
