'use client';
// Tabla del mosaico BI: columnas ordenables, secciones (grupo con subtotal) y «Ver todas» con scroll interno.
import { Fragment, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { AZUL } from '@/components/sucursales/colores';

export interface ColumnaBi<F> {
  clave: string;
  titulo: string;
  numero?: boolean;
  /** Si está, la columna se puede ordenar por este valor (null va al final). */
  orden?: (f: F) => number | null;
  celda: (f: F) => React.ReactNode;
}
export interface SeccionBi<F> {
  clave: string;
  /** Fila de subtotal (un <tr>) que queda siempre arriba de las filas de la sección. */
  cabecera?: React.ReactNode;
  filas: F[];
}

export function TablaBi<F>({
  resumen,
  columnas,
  secciones,
  claveFila,
  ordenInicial,
  primeras,
  minimo = 'min-w-[36rem]',
}: {
  resumen: string;
  columnas: ColumnaBi<F>[];
  secciones: SeccionBi<F>[];
  claveFila: (f: F) => string;
  ordenInicial: string;
  /** Filas visibles por sección antes de «Ver todas». */
  primeras: number;
  minimo?: string;
}) {
  const [orden, setOrden] = useState<{ clave: string; desc: boolean }>({ clave: ordenInicial, desc: true });
  const [todas, setTodas] = useState(false);
  const col = columnas.find((c) => c.clave === orden.clave && c.orden);
  const ordenar = (filas: F[]) => {
    if (!col?.orden) return filas;
    const v = col.orden;
    return [...filas].sort((a, b) => {
      const x = v(a);
      const y = v(b);
      if (x === null) return 1;
      if (y === null) return -1;
      return orden.desc ? y - x : x - y;
    });
  };
  const total = secciones.reduce((s, x) => s + x.filas.length, 0);
  const hayMas = secciones.some((s) => s.filas.length > primeras);

  return (
    <div>
      <div className={todas ? 'max-h-[600px] overflow-auto' : 'overflow-x-auto'}>
        <table className={`tabla tabla-bi tabla-bi-compacta ${minimo}`}>
          <caption className="sr-only">{resumen}</caption>
          <thead className="sticky top-0 z-[1]">
            <tr>
              {columnas.map((c) => {
                const activa = orden.clave === c.clave;
                return (
                  <th
                    key={c.clave}
                    scope="col"
                    className={c.numero ? 'numero' : undefined}
                    aria-sort={c.orden ? (activa ? (orden.desc ? 'descending' : 'ascending') : 'none') : undefined}
                  >
                    {c.orden ? (
                      <button
                        type="button"
                        className="inline-flex items-center gap-1 font-inherit"
                        onClick={() => setOrden(activa ? { clave: c.clave, desc: !orden.desc } : { clave: c.clave, desc: true })}
                      >
                        {c.titulo}
                        {activa &&
                          (orden.desc ? <ArrowDown size={12} aria-hidden="true" /> : <ArrowUp size={12} aria-hidden="true" />)}
                      </button>
                    ) : (
                      c.titulo
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {secciones.map((s) => {
              const filas = ordenar(s.filas);
              return (
                <Fragment key={s.clave}>
                  {s.cabecera}
                  {(todas ? filas : filas.slice(0, primeras)).map((f) => (
                    <tr key={claveFila(f)}>
                      {columnas.map((c, i) =>
                        i === 0 ? (
                          <th key={c.clave} scope="row" className="font-medium">
                            {c.celda(f)}
                          </th>
                        ) : (
                          <td key={c.clave} className={c.numero ? 'numero' : undefined}>
                            {c.celda(f)}
                          </td>
                        ),
                      )}
                    </tr>
                  ))}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>
      {hayMas && (
        <div className="px-4 py-3">
          <button
            type="button"
            onClick={() => setTodas((v) => !v)}
            className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-semibold"
          >
            {todas ? 'Ver menos' : `Ver todas (${total})`}
          </button>
        </div>
      )}
    </div>
  );
}

/** Barra tenue detrás de un número (estilo Metabase): proporcional al máximo de la columna. */
export function BarraEnCelda({ valor, max, children }: { valor: number | null; max: number; children: React.ReactNode }) {
  const pct = max > 0 && valor ? Math.max(0, Math.min(100, (valor / max) * 100)) : 0;
  return (
    <span className="relative block">
      <span
        aria-hidden="true"
        className="absolute inset-y-0 right-0 rounded-sm opacity-20"
        style={{ width: `${pct}%`, backgroundColor: AZUL.fuerte }}
      />
      <span className="relative">{children}</span>
    </span>
  );
}
