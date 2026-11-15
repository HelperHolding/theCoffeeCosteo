'use client';
import { Tooltip } from '@/components/sucursales/graficas';
import {
  aPuntos,
  columna,
  LINEA_REJILLA,
  Leyenda,
  marcas,
  TablaEquivalente,
  TEXTO_EJE,
  tramosDe,
  useIndiceActivo,
  W,
  type PropsGrafica,
  type Serie,
} from './graficas-bi-piezas';

export { colorCategoria, type Categoria, type Serie } from './graficas-bi-piezas';

/**
 * Gráficas SVG del tablero BI con las reglas de components/sucursales/graficas.tsx: líneas de 2px, columnas
 * ≤ 24px con extremo redondeado de 4px, rejilla tenue, leyenda visible con 2 series o más, tooltip en hover y
 * en foco de teclado (←/→) y tabla equivalente. No calculan cifras: reciben los valores ya armados.
 * En pantallas angostas la gráfica conserva un ancho mínimo y se desplaza dentro de su contenedor, para que
 * el texto del eje no se encoja hasta volverse ilegible.
 */

/**
 * Columnas (una serie, eje izquierdo) con una línea opcional en su propio eje derecho, p. ej. venta contra
 * transacciones por día.
 */
export function ColumnasYLinea({
  resumen,
  categorias,
  columnas,
  linea,
  anchoMinimo = 'min-w-[34rem]',
}: PropsGrafica & {
  columnas: Serie & { eje: (v: number) => string };
  linea?: Serie & { eje: (v: number) => string };
}) {
  const H = 240;
  const M = { izq: 64, der: linea ? 48 : 12, arr: 14, aba: 28 };
  const n = categorias.length;
  const slot = (W - M.izq - M.der) / Math.max(1, n);
  const ancho = Math.max(2, Math.min(24, slot - 4));
  const xDe = (i: number) => M.izq + (i + 0.5) * slot;
  const tC = marcas(Math.max(0, ...columnas.valores.map((v) => v ?? 0)));
  const tL = linea ? marcas(Math.max(0, ...linea.valores.map((v) => v ?? 0))) : null;
  const yDe = (v: number, tope: number) => H - M.aba - (v / tope) * (H - M.arr - M.aba);
  const cadaCuanto = Math.ceil(n / 12);
  const { indice, props } = useIndiceActivo(n, xDe);
  const puntos = linea
    ? linea.valores.map((v, i) => (v === null ? null : ([xDe(i), yDe(v, tL![2])] as const)))
    : [];
  const tramos = tramosDe(puntos).map(aPuntos);
  const series = linea ? [columnas, linea] : [columnas];

  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto">
        <div className={`relative ${anchoMinimo}`}>
          <svg
            {...props}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${resumen}. Usa las flechas para recorrer; la tabla tiene las cifras.`}
            className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {tC.map((t, k) => (
              <g key={t}>
                <line
                  x1={M.izq}
                  x2={W - M.der}
                  y1={yDe(t, tC[2])}
                  y2={yDe(t, tC[2])}
                  className={LINEA_REJILLA}
                  strokeWidth={1}
                />
                <text x={M.izq - 8} y={yDe(t, tC[2]) + 4} textAnchor="end" className={TEXTO_EJE}>
                  {columnas.eje(t)}
                </text>
                {tL && (
                  <text x={W - M.der + 8} y={yDe(tL[k], tL[2]) + 4} className={TEXTO_EJE}>
                    {linea!.eje(tL[k])}
                  </text>
                )}
              </g>
            ))}
            {categorias.map((c, i) => (
              <g key={c.clave}>
                {indice === i && (
                  <rect
                    x={xDe(i) - slot / 2}
                    y={M.arr}
                    width={slot}
                    height={H - M.arr - M.aba}
                    className="fill-surface-2"
                    rx={4}
                  />
                )}
                <path
                  d={columna(xDe(i), ancho, yDe(columnas.valores[i] ?? 0, tC[2]), yDe(0, tC[2]))}
                  fill={columnas.color}
                />
                {c.eje && i % cadaCuanto === 0 && (
                  <text x={xDe(i)} y={H - 8} textAnchor="middle" className={TEXTO_EJE}>
                    {c.eje}
                  </text>
                )}
              </g>
            ))}
            {linea &&
              tramos.map((t) => (
                <polyline
                  key={t}
                  points={t}
                  fill="none"
                  stroke={linea.color}
                  strokeWidth={2}
                  strokeLinejoin="round"
                  strokeLinecap="round"
                />
              ))}
            {linea && indice !== null && puntos[indice] && (
              <circle
                cx={puntos[indice]![0]}
                cy={puntos[indice]![1]}
                r={4}
                fill={linea.color}
                className="stroke-surface"
                strokeWidth={2}
              />
            )}
          </svg>
          {indice !== null && (
            <Tooltip
              x={xDe(indice)}
              ancho={W}
              titulo={categorias[indice].titulo}
              filas={series.map((s, k) => ({
                color: s.color,
                etiqueta: s.etiqueta,
                valor: s.formato(s.valores[indice] ?? null),
                linea: k === 1,
              }))}
            />
          )}
        </div>
      </div>
      {series.length > 1 && <Leyenda series={series} linea={(i) => i === 1} />}
      <TablaEquivalente resumen={resumen} categorias={categorias} series={series} />
    </figure>
  );
}

/** Una línea por serie (p. ej. un año) sobre las mismas categorías; los huecos (null) cortan la línea. */
export function Lineas({
  resumen,
  categorias,
  series,
  eje,
  anchoMinimo = 'min-w-[34rem]',
}: PropsGrafica & { series: Serie[]; eje: (v: number) => string }) {
  const H = 240;
  const M = { izq: 64, der: 12, arr: 14, aba: 28 };
  const n = categorias.length;
  const xDe = (i: number) => M.izq + (n <= 1 ? 0.5 : i / (n - 1)) * (W - M.izq - M.der);
  const t = marcas(Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0))));
  const yDe = (v: number) => H - M.aba - (v / t[2]) * (H - M.arr - M.aba);
  const cadaCuanto = Math.ceil(n / 12);
  const { indice, props } = useIndiceActivo(n, xDe);
  const tramos = (valores: (number | null)[]) =>
    tramosDe(valores.map((v, i) => (v === null ? null : ([xDe(i), yDe(v)] as const))));

  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto">
        <div className={`relative ${anchoMinimo}`}>
          <svg
            {...props}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${resumen}. Usa las flechas para recorrer; la tabla tiene las cifras.`}
            className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {t.map((m) => (
              <g key={m}>
                <line
                  x1={M.izq}
                  x2={W - M.der}
                  y1={yDe(m)}
                  y2={yDe(m)}
                  className={LINEA_REJILLA}
                  strokeWidth={1}
                />
                <text x={M.izq - 8} y={yDe(m) + 4} textAnchor="end" className={TEXTO_EJE}>
                  {eje(m)}
                </text>
              </g>
            ))}
            {categorias.map(
              (c, i) =>
                c.eje &&
                i % cadaCuanto === 0 && (
                  <text key={c.clave} x={xDe(i)} y={H - 8} textAnchor="middle" className={TEXTO_EJE}>
                    {c.eje}
                  </text>
                ),
            )}
            {indice !== null && (
              <line
                x1={xDe(indice)}
                x2={xDe(indice)}
                y1={M.arr}
                y2={H - M.aba}
                className="stroke-line-strong"
                strokeWidth={1}
              />
            )}
            {series.map((s) =>
              tramos(s.valores).map((tr) =>
                tr.length === 1 ? (
                  <circle
                    key={`${s.etiqueta}-${tr[0][0]}`}
                    cx={tr[0][0]}
                    cy={tr[0][1]}
                    r={2.5}
                    fill={s.color}
                  />
                ) : (
                  <polyline
                    key={`${s.etiqueta}-${tr[0][0]}`}
                    points={aPuntos(tr)}
                    fill="none"
                    stroke={s.color}
                    strokeWidth={2}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ),
              ),
            )}
            {indice !== null &&
              series.map((s) =>
                s.valores[indice] == null ? null : (
                  <circle
                    key={s.etiqueta}
                    cx={xDe(indice)}
                    cy={yDe(s.valores[indice]!)}
                    r={4}
                    fill={s.color}
                    className="stroke-surface"
                    strokeWidth={2}
                  />
                ),
              )}
          </svg>
          {indice !== null && (
            <Tooltip
              x={xDe(indice)}
              ancho={W}
              titulo={categorias[indice].titulo}
              filas={series.map((s) => ({
                color: s.color,
                etiqueta: s.etiqueta,
                valor: s.formato(s.valores[indice] ?? null),
                linea: true,
              }))}
            />
          )}
        </div>
      </div>
      {series.length > 1 && <Leyenda series={series} linea={() => true} />}
      <TablaEquivalente resumen={resumen} categorias={categorias} series={series} />
    </figure>
  );
}
