'use client';
// Bloques 7 y 8 del tablero BI: ranking de productos por mes y tendencias por año y por semana.
import { useState } from 'react';
import { Tarjeta } from '@/components/portal/piezas';
import { AZUL, BarraCelda, COLOR_ORIGEN, SERIE_BASE, TIPOS } from '@/components/sucursales/colores';
import { ErrorCarga } from '@/components/sucursales/estados';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import type { ErrorLecturaUi } from '@/components/sucursales/use-lectura';
import type { rankingPorMes, tendenciaAnual, tendenciaSemanal } from '@/lib/bi/bloques';
import { AvisoDesactualizado } from './estados-bi';
import { Lineas, type Serie } from './graficas-bi';
import { dineroEje } from './graficas-bi-piezas';

const PRIMEROS = 20;
/** «Noviembre de 2026»: mayúscula solo al inicio (capitalize de CSS daría «De»). */
const nombreMes = (mes: string) => {
  const t = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mes.slice(0, 10)}T12:00:00Z`),
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
};

/** Bloque 7: producto × mes, ordenado por venta. Por omisión, el mes más reciente y los 20 primeros. */
export function RankingProductos({ meses }: { meses: ReturnType<typeof rankingPorMes> }) {
  const [elegido, setElegido] = useState<string | null>(null);
  const [todos, setTodos] = useState(false);
  const actual = meses.find((m) => m.mes === elegido) ?? meses[0];
  const filas = actual ? (todos ? actual.productos : actual.productos.slice(0, PRIMEROS)) : [];
  const max = Math.max(0, ...(actual?.productos.map((p) => p.venta_cent) ?? []));

  return (
    <Tarjeta
      titulo="Ranking de Productos"
      descripcion="Ordenado por venta neta del mes. El margen llega en F4.1."
      cuerpo={false}
      acciones={
        meses.length > 0 && (
          <div>
            <label htmlFor="bi-ranking-mes" className="sr-only">
              Mes
            </label>
            <select
              id="bi-ranking-mes"
              value={actual?.mes ?? ''}
              onChange={(e) => {
                setElegido(e.target.value);
                setTodos(false);
              }}
              className="rounded-md border border-line bg-surface px-3 py-2 text-sm"
            >
              {meses.map((m) => (
                <option key={m.mes} value={m.mes}>
                  {nombreMes(m.mes)}
                </option>
              ))}
            </select>
          </div>
        )
      }
    >
      {!actual ? (
        <p className="p-5 text-sm text-muted-foreground">Sin productos vendidos en el periodo.</p>
      ) : (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="tabla min-w-[36rem]">
              <caption className="sr-only">Productos de {nombreMes(actual.mes)} por venta neta</caption>
              <thead>
                <tr>
                  <th scope="col" className="numero">
                    #
                  </th>
                  <th scope="col">Producto</th>
                  <th scope="col" className="numero">
                    Venta
                  </th>
                  <th scope="col" className="numero">
                    Share
                  </th>
                  <th scope="col" className="numero">
                    Unidades
                  </th>
                </tr>
              </thead>
              <tbody>
                {filas.map((p, i) => (
                  <tr key={p.codigo}>
                    <td className="numero text-muted-foreground">{i + 1}</td>
                    <th scope="row" className="font-medium">
                      <span className="block">{p.nombre}</span>
                      <span className="mt-1 block max-w-48">
                        <BarraCelda valor={p.venta_cent} max={max} />
                      </span>
                    </th>
                    <td className="numero">{dinero(p.venta_cent)}</td>
                    <td className="numero">{porcentaje(p.share)}</td>
                    <td className="numero">{numero(p.unidades)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {actual.productos.length > PRIMEROS && (
            <div className="p-5">
              <button
                type="button"
                onClick={() => setTodos((v) => !v)}
                className="rounded-md border border-line bg-surface px-3 py-2 text-sm font-semibold"
              >
                {todos ? `Ver los ${PRIMEROS} primeros` : `Ver todos (${numero(actual.productos.length)})`}
              </button>
            </div>
          )}
        </>
      )}
    </Tarjeta>
  );
}

/** El año más reciente en azul; los anteriores, en colores fijos por antigüedad. */
const COLORES_ANIO = [
  AZUL.fuerte,
  COLOR_ORIGEN.app,
  COLOR_ORIGEN.mostrador,
  COLOR_ORIGEN.rappi,
  TIPOS.dulzor.color,
];
const MESES = Array.from({ length: 12 }, (_, i) => {
  const d = new Date(Date.UTC(2026, i, 15));
  const f = (month: 'short' | 'long') =>
    new Intl.DateTimeFormat('es-MX', { month, timeZone: 'UTC' }).format(d);
  return { clave: String(i + 1), eje: f('short').replace('.', ''), titulo: f('long') };
});
const SEMANAS = Array.from({ length: 53 }, (_, i) => ({
  clave: String(i + 1),
  eje: i % 4 === 0 ? `S${i + 1}` : '',
  titulo: `Semana ${i + 1}`,
}));

function seriesPorAnio(filas: { anio: number; valores: (number | null)[] }[]): Serie[] {
  const n = filas.length;
  return filas.map((f, i) => ({
    etiqueta: String(f.anio),
    color: COLORES_ANIO[n - 1 - i] ?? SERIE_BASE,
    valores: f.valores,
    formato: (v) => dinero(v, 'MXN', false),
  }));
}

/** Bloque 8: lectura propia, con su carga y su error; nunca tumba el resto del tablero. */
export function Tendencias({
  anual,
  semanal,
  vacio,
  error,
  recibidoEn,
  alReintentar,
}: {
  anual: ReturnType<typeof tendenciaAnual> | null;
  semanal: ReturnType<typeof tendenciaSemanal> | null;
  /** La lectura respondió sin tiendas que pasen los filtros. */
  vacio: boolean;
  error: ErrorLecturaUi | null;
  recibidoEn: number | null;
  alReintentar: () => void;
}) {
  const eje = dineroEje;
  return (
    <Tarjeta titulo="Tendencias" descripcion="Ignoran las fechas y las semanas, como en Zoho.">
      {anual && semanal ? (
        <div className="space-y-8">
          {error && <AvisoDesactualizado recibidoEn={recibidoEn} alReintentar={alReintentar} />}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-2">Ventas por Año</h3>
            {anual.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin venta registrada.</p>
            ) : (
              <Lineas
                resumen="Venta neta por mes, una línea por año"
                anchoMinimo="min-w-[30rem]"
                categorias={MESES}
                series={seriesPorAnio(anual.map((a) => ({ anio: a.anio, valores: a.meses })))}
                eje={eje}
              />
            )}
          </section>
          <section className="space-y-3">
            <h3 className="text-sm font-semibold text-ink-2">Ventas por Semana</h3>
            {semanal.length === 0 ? (
              <p className="text-sm text-muted-foreground">Sin venta registrada.</p>
            ) : (
              <Lineas
                resumen="Venta neta por semana, una línea por año"
                anchoMinimo="min-w-[40rem]"
                categorias={SEMANAS}
                series={seriesPorAnio(semanal.map((s) => ({ anio: s.anio, valores: s.semanas })))}
                eje={eje}
              />
            )}
          </section>
        </div>
      ) : error ? (
        <ErrorCarga error={error} alReintentar={alReintentar} />
      ) : vacio ? (
        <p className="text-sm text-muted-foreground">
          Sin tendencias: ninguna tienda pasa los filtros que aplican aquí.
        </p>
      ) : (
        <p role="status" className="text-sm text-muted-foreground motion-safe:animate-pulse">
          Cargando tendencias…
        </p>
      )}
    </Tarjeta>
  );
}
