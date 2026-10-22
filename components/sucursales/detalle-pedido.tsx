'use client';
import type { PedidoVista } from '@/lib/sucursales/contratos';
import { etiquetaOrigen } from '@/lib/sucursales/metricas';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { dinero, fechaCorta } from './formato';
import { COLOR_ORIGEN, Etiqueta, TIPOS, colorPago, tipoPersonalizacion } from './colores';

/** Detalle de un pedido: líneas y personalizaciones con su importe, descuento en % (ya aplicado). */
export function DetallePedido({
  pedido,
  moneda,
  alCerrar,
}: {
  pedido: PedidoVista | null;
  moneda: string;
  alCerrar: () => void;
}) {
  return (
    <Dialog open={pedido !== null} onOpenChange={(o) => !o && alCerrar()}>
      <DialogContent className="max-h-[90vh] overflow-y-auto rounded-2xl border-line bg-surface sm:max-w-xl">
        {pedido && (
          <>
            <DialogHeader>
              <DialogTitle className="font-display">
                Pedido {pedido.id} · {dinero(pedido.ventaCent, moneda)}
              </DialogTitle>
              <DialogDescription className="flex flex-wrap items-center gap-1.5">
                <span>
                  {fechaCorta(pedido.fecha)}, {pedido.hora}
                </span>
                <Etiqueta color={colorPago(pedido.metodo)}>{pedido.pago}</Etiqueta>
                <Etiqueta color={COLOR_ORIGEN[pedido.origen]}>{etiquetaOrigen[pedido.origen]}</Etiqueta>
                {pedido.descuentoCent > 0 && <span>Descuento {dinero(pedido.descuentoCent, moneda)}</span>}
              </DialogDescription>
            </DialogHeader>
            <table className="tabla w-full text-sm">
              <caption className="sr-only">Productos del pedido</caption>
              <thead>
                <tr>
                  <th scope="col">Producto y personalizaciones</th>
                  <th scope="col" className="numero">
                    Importe
                  </th>
                </tr>
              </thead>
              <tbody>
                {pedido.lineas.map((l, i) => (
                  <tr key={`${l.codigo}-${i}`} className="align-top">
                    <td>
                      <p className="font-medium">{l.nombre}</p>
                      {l.descuentoPct > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Descuento {l.descuentoPct} % (ya aplicado)
                        </p>
                      )}
                      {l.customs.length > 0 && (
                        <ul className="mt-1.5 flex flex-wrap gap-1.5" aria-label="Personalizaciones">
                          {l.customs.map((c, j) => {
                            const tipo = TIPOS[tipoPersonalizacion(c.nombre)];
                            return (
                              <li key={`${c.codigo}-${j}`}>
                                <Etiqueta color={tipo.color} titulo={tipo.nombre}>
                                  {c.nombre}
                                  {c.importeCent !== 0 && (
                                    <span className="tabular text-muted-foreground">
                                      +{dinero(c.importeCent, moneda)}
                                    </span>
                                  )}
                                </Etiqueta>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </td>
                    <td className="numero">{dinero(l.importeCent, moneda)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground">
              El importe de cada producto ya tiene aplicado su descuento; las personalizaciones con costo se
              suman aparte. Total del pedido = productos + personalizaciones.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
