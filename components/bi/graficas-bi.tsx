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
  useAncho,
  useIndiceActivo,
  type PropsGrafica,
  type Serie,
} from './graficas-bi-piezas';

export { colorCategoria, type Categoria, type Serie } from './graficas-bi-piezas';

/**
 * Gráficas SVG del tablero BI (skill dataviz): líneas de 2px, columnas ≤ 24px con extremo redondeado de 4px,
 * rejilla tenue, leyenda visible con 2 series o más, tooltip en hover y en foco de teclado (←/→) y tabla equivalente.
 * - El viewBox usa el ancho real del contenedor (useAncho): el texto mide 11px en cualquier pantalla.
 * - En pantallas angostas la gráfica conserva un ancho mínimo y se desplaza dentro de su contenedor.
 * No calculan cifras: reciben los valores ya armados.
 */

type SerieConEje = Serie & { eje: (v: number) => string };

/** Pasos «redondos» para la mitad del eje: el tope queda cerca del máximo (mejor que solo 1, 2, 5). */
const PASOS = [1, 1.5, 2, 2.5, 3, 4, 5, 6, 7.5, 8, 10];

/** Tres marcas (0, mitad y tope) con el tope redondo más cercano por encima del máximo. */
function marcasFinas(max: number) {
  const mitad = Math.max(1, max) / 2;
  const p = 10 ** Math.floor(Math.log10(mitad));
  const n = (PASOS.find((s) => s * p >= mitad) ?? 10) * p;
  return [0, n, n * 2];
}

/** Con línea, las columnas llegan a ~70 % del alto: la línea corre por encima en vez de taparles la punta. */
const HOLGURA_COLUMNAS = 0.7;

/**
 * Columnas (venta) con una línea opcional encima (tickets): la forma del tablero de Zoho, hecha legible.
 * Las dos medidas tienen unidades distintas, así que cada una lleva su eje, pero sin las trampas del doble eje:
 * - los dos ejes empiezan en cero y marcan las MISMAS fracciones (0, mitad, tope): una sola rejilla, no dos;
 * - las columnas usan ~70 % del alto y la línea el resto: no se cruzan ni se tapan aunque se muevan juntas;
 * - cada eje lleva arriba su rótulo con la muestra de su serie (cuadro = columnas, trazo = línea), en tinta;
 * - la línea lleva contorno del color de la tarjeta y un punto por categoría para leerse sobre las columnas;
 * - el tooltip y la tabla dan las cifras exactas y la medida `extra` (p. ej. ticket promedio).
 */
export function ColumnasYLinea({
  resumen,
  categorias,
  columnas,
  linea,
  extra,
  anchoMinimo = 'min-w-[34rem]',
}: PropsGrafica & { columnas: SerieConEje; linea?: SerieConEje; extra?: Serie }) {
  const { ref: caja, ancho: W } = useAncho<HTMLDivElement>();
  const H = 264;
  const M = { izq: 56, der: linea ? 48 : 12, arr: 34, aba: 26 };
  const n = categorias.length;
  const slot = (W - M.izq - M.der) / Math.max(1, n);
  const ancho = Math.max(2, Math.min(24, slot - 6));
  const xDe = (i: number) => M.izq + (i + 0.5) * slot;
  const alto = H - M.arr - M.aba;
  const maxC = Math.max(0, ...columnas.valores.map((v) => v ?? 0));
  const tC = linea ? marcasFinas(maxC / HOLGURA_COLUMNAS) : marcas(maxC);
  const tL = linea ? marcasFinas(Math.max(0, ...linea.valores.map((v) => v ?? 0))) : null;
  const yC = (v: number) => H - M.aba - (v / tC[2]) * alto;
  const yL = (v: number) => H - M.aba - (v / tL![2]) * alto;
  const cadaCuanto = Math.ceil(n / Math.max(4, Math.floor((W - M.izq - M.der) / 52)));
  const { indice, props } = useIndiceActivo(n, xDe, W);
  const puntos = linea ? linea.valores.map((v, i) => (v === null ? null : ([xDe(i), yL(v)] as const))) : [];
  const tramos = tramosDe(puntos).map(aPuntos);
  const conPuntos = slot >= 14;
  const series = [columnas, ...(linea ? [linea] : []), ...(extra ? [extra] : [])];

  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto">
        <div ref={caja} className={`relative ${anchoMinimo}`}>
          <svg
            {...props}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${resumen}. Usa las flechas para recorrer; la tabla tiene las cifras.`}
            className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
          >
            {/* Rótulo de cada eje con la muestra de su serie: sirve de leyenda y dice qué eje es de quién. */}
            <rect x={0} y={7} width={9} height={9} rx={2} fill={columnas.color} />
            <text x={14} y={15} className="fill-ink-2 text-[11px] font-semibold">
              {columnas.etiqueta}
            </text>
            {linea && (
              <>
                <line
                  x1={W - 14}
                  x2={W}
                  y1={11.5}
                  y2={11.5}
                  stroke={linea.color}
                  strokeWidth={2.5}
                  strokeLinecap="round"
                />
                <text x={W - 20} y={15} textAnchor="end" className="fill-ink-2 text-[11px] font-semibold">
                  {linea.etiqueta}
                </text>
              </>
            )}
            {indice !== null && (
              <rect
                x={xDe(indice) - slot / 2}
                y={M.arr}
                width={slot}
                height={alto}
                className="fill-surface-2"
                rx={4}
              />
            )}
            {tC.map((m, k) => (
              <g key={m}>
                <line
                  x1={M.izq}
                  x2={W - M.der}
                  y1={yC(m)}
                  y2={yC(m)}
                  className={LINEA_REJILLA}
                  strokeWidth={1}
                />
                <text x={M.izq - 8} y={yC(m) + 4} textAnchor="end" className={TEXTO_EJE}>
                  {columnas.eje(m)}
                </text>
                {tL && linea && (
                  <text x={W - M.der + 8} y={yC(m) + 4} className={TEXTO_EJE}>
                    {linea.eje(tL[k])}
                  </text>
                )}
              </g>
            ))}
            {categorias.map((c, i) => (
              <path
                key={c.clave}
                d={columna(xDe(i), ancho, yC(columnas.valores[i] ?? 0), yC(0))}
                fill={columnas.color}
              />
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
            {linea && (
              <g>
                {tramos.map((t) => (
                  <polyline
                    key={`halo-${t}`}
                    points={t}
                    fill="none"
                    className="stroke-surface"
                    strokeWidth={5}
                    strokeLinejoin="round"
                    strokeLinecap="round"
                  />
                ))}
                {tramos.map((t) => (
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
                {puntos.map((p, i) =>
                  p && (conPuntos || indice === i) ? (
                    <circle
                      key={categorias[i].clave}
                      cx={p[0]}
                      cy={p[1]}
                      r={indice === i ? 4.5 : 3}
                      fill={linea.color}
                      className="stroke-surface"
                      strokeWidth={indice === i ? 2 : 1.5}
                    />
                  ) : null,
                )}
              </g>
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
                linea: s === linea,
              }))}
            />
          )}
        </div>
      </div>
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
  const { ref: caja, ancho: W } = useAncho<HTMLDivElement>();
  const H = 240;
  const M = { izq: 60, der: 12, arr: 14, aba: 28 };
  const n = categorias.length;
  const xDe = (i: number) => M.izq + (n <= 1 ? 0.5 : i / (n - 1)) * (W - M.izq - M.der);
  const t = marcas(Math.max(0, ...series.flatMap((s) => s.valores.map((v) => v ?? 0))));
  const yDe = (v: number) => H - M.aba - (v / t[2]) * (H - M.arr - M.aba);
  const conEje = categorias.filter((c) => c.eje).length;
  const cadaCuanto = Math.max(1, Math.ceil(conEje / Math.max(4, Math.floor((W - M.izq) / 52))));
  const { indice, props } = useIndiceActivo(n, xDe, W);
  const tramos = (valores: (number | null)[]) =>
    tramosDe(valores.map((v, i) => (v === null ? null : ([xDe(i), yDe(v)] as const))));
  // La última serie es la del año más reciente: se dibuja encima y un poco más gruesa.
  const ultima = series.length - 1;
  let k = 0;

  return (
    <figure className="space-y-3">
      <div className="overflow-x-auto">
        <div ref={caja} className={`relative ${anchoMinimo}`}>
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
            {categorias.map((c, i) => {
              if (!c.eje) return null;
              const mostrar = k++ % cadaCuanto === 0;
              return (
                mostrar && (
                  <text key={c.clave} x={xDe(i)} y={H - 8} textAnchor="middle" className={TEXTO_EJE}>
                    {c.eje}
                  </text>
                )
              );
            })}
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
            {series.map((s, si) =>
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
                    strokeWidth={si === ultima ? 2.5 : 2}
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
