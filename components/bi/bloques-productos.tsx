'use client';
// Bloques 7 y 8 del tablero BI: ranking de productos por mes y tendencias por año y por semana (una tarjeta cada una).
import { useState } from 'react';
import { AZUL, COLOR_ORIGEN, SERIE_BASE, TIPOS } from '@/components/sucursales/colores';
import { ErrorCarga } from '@/components/sucursales/estados';
import { dinero, numero, porcentaje } from '@/components/sucursales/formato';
import type { ErrorLecturaUi } from '@/components/sucursales/use-lectura';
import type { rankingPorMes, tendenciaAnual, tendenciaSemanal } from '@/lib/bi/bloques';
import { AvisoDesactualizado } from './estados-bi';
import { Lineas, type Serie } from './graficas-bi';
import { dineroEje } from './graficas-bi-piezas';
import { BarraEnCelda, TablaBi, type ColumnaBi } from './tabla-bi';
import { TarjetaBi } from './tarjeta-bi';

const PRIMEROS = 10;
/** «Noviembre de 2026»: mayúscula solo al inicio (capitalize de CSS daría «De»). */
const nombreMes = (mes: string) => {
  const t = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(`${mes.slice(0, 10)}T12:00:00Z`),
  );
  return t.charAt(0).toUpperCase() + t.slice(1);
};

type Producto = ReturnType<typeof rankingPorMes>[number]['productos'][number];
type FilaRanking = Producto & { rango: number };

/** Bloque 7: producto × mes, ordenado por venta. Por omisión, el mes más reciente y los 10 primeros. */
export function RankingProductos({ meses }: { meses: ReturnType<typeof rankingPorMes> }) {
  const [elegido, setElegido] = useState<string | null>(null);
  const actual = meses.find((m) => m.mes === elegido) ?? meses[0];
  // El # es la posición por venta, calculada antes de que la tabla reordene.
  const filas: FilaRanking[] = actual ? actual.productos.map((p, i) => ({ ...p, rango: i + 1 })) : [];
  const max = Math.max(0, ...filas.map((p) => p.venta_cent));
  const columnas: ColumnaBi<FilaRanking>[] = [
    { clave: 'rango', titulo: '#', numero: true, celda: (p) => <span className="text-muted-foreground">{p.rango}</span> },
    { clave: 'producto', titulo: 'Producto', celda: (p) => p.nombre },
    {
      clave: 'venta',
      titulo: 'Venta',
      numero: true,
      orden: (p) => p.venta_cent,
      celda: (p) => (
        <BarraEnCelda valor={p.venta_cent} max={max}>
          {dinero(p.venta_cent)}
        </BarraEnCelda>
      ),
    },
    { clave: 'share', titulo: 'Share', numero: true, orden: (p) => p.share, celda: (p) => porcentaje(p.share) },
    { clave: 'unidades', titulo: 'Unidades', numero: true, orden: (p) => p.unidades, celda: (p) => numero(p.unidades) },
  ];

  return (
    <TarjetaBi
      ancho={6}
      titulo="Ranking de Productos"
      descripcion="Ordenado por venta neta del mes. Sin margen todavía: falta definir la fuente del costo."
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
              onChange={(e) => setElegido(e.target.value)}
              className="rounded-md border border-line bg-surface px-3 py-1.5 text-sm"
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
        <p className="px-4 pb-4 text-sm text-muted-foreground">Sin productos vendidos en el periodo.</p>
      ) : (
        <TablaBi
          // El mes es parte de la clave: al cambiarlo, la tabla vuelve a las primeras filas.
          key={actual.mes}
          resumen={`Productos de ${nombreMes(actual.mes)} por venta neta`}
          columnas={columnas}
          secciones={[{ clave: actual.mes, filas }]}
          claveFila={(p) => p.codigo}
          ordenInicial="venta"
          primeras={PRIMEROS}
          minimo="min-w-[30rem]"
        />
      )}
    </TarjetaBi>
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
  const descripcion = 'Ignoran las fechas y las semanas, como en Zoho.';
  if (!(anual && semanal)) {
    return (
      <TarjetaBi ancho={12} titulo="Tendencias" descripcion={descripcion}>
        {error ? (
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
      </TarjetaBi>
    );
  }
  return (
    <>
      {error && (
        <div className="sm:col-span-2 lg:col-span-12">
          <AvisoDesactualizado recibidoEn={recibidoEn} alReintentar={alReintentar} />
        </div>
      )}
      <TarjetaBi ancho={6} titulo="Ventas por año" descripcion={descripcion}>
        {anual.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin venta registrada.</p>
        ) : (
          <Lineas
            resumen="Venta neta por mes, una línea por año"
            anchoMinimo="min-w-[30rem]"
            alto={220}
            categorias={MESES}
            series={seriesPorAnio(anual.map((a) => ({ anio: a.anio, valores: a.meses })))}
            eje={eje}
          />
        )}
      </TarjetaBi>
      <TarjetaBi ancho={6} titulo="Ventas por semana" descripcion={descripcion}>
        {semanal.length === 0 ? (
          <p className="text-sm text-muted-foreground">Sin venta registrada.</p>
        ) : (
          <Lineas
            resumen="Venta neta por semana, una línea por año"
            anchoMinimo="min-w-[40rem]"
            alto={220}
            categorias={SEMANAS}
            series={seriesPorAnio(semanal.map((s) => ({ anio: s.anio, valores: s.semanas })))}
            eje={eje}
          />
        )}
      </TarjetaBi>
    </>
  );
}
