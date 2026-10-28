'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { PanelRightOpen, X } from 'lucide-react';
import type { RespuestaConsumo, SucursalInfo } from '@/lib/sucursales/contratos';
import { CATEGORIA_LECHE, type ConsumoProducto, type MotivoExcluido } from '@/lib/sucursales/consumo';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';
import { claseCampo } from '@/lib/crm/formato';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { AvisosLectura, ErrorCarga, Esqueleto } from './estados';
import { AZUL, BarraCelda, Etiqueta, TIPOS } from './colores';
import { Tooltip } from './graficas';
import { diaMes, fechaCorta, numero, porcentaje } from './formato';
import { rango, SelectorPeriodo, type Periodo } from './periodo';
import { useLectura } from './use-lectura';

/**
 * Colores del Consumo (skill dataviz; validados con validate_palette.js en claro y oscuro).
 * - Cobertura: incluidas en azul y los tres motivos de exclusión en amarillo/magenta/violeta (PASS adyacentes); lo que
 *   no tiene receta va en grises (no son categorías, son «fuera»). Amarillo y magenta < 3:1 → leyenda con cifras.
 * - Leches: la paleta categórica de 8 en orden FIJO por insumo (el color sigue a la leche, no a su rango).
 */
const COBERTURA = {
  incluidas: { color: AZUL.fuerte, nombre: 'Entran al consumo' },
  tamano: { color: '#eda100', nombre: 'Tamaño sin verificar' },
  personalizacion: { color: '#e87ba4', nombre: 'Con personalización (no modelada)' },
  receta: { color: '#6250d6', nombre: 'Receta sin cantidades para ese tamaño' },
  sinEnlace: { color: '#a39e94', nombre: 'Código sin receta enlazada' },
  sinCodigo: { color: '#c9c4ba', nombre: 'Sin código (nombre ambiguo)' },
  generico: { color: '#78736a', nombre: 'Generic (sin identificación)' },
} as const;
type ClaveCobertura = keyof typeof COBERTURA;

const LECHES = [
  'LECHE ENTERA',
  'LECHE DESLACTOSADAS',
  'LECHE ALMENDRA',
  'LECHE AVENA',
  'LECHE COCO',
  'LECHE ALMENDRA CALIFIA',
  'LECHE AVENA CALIFIA',
  'LECHE COCO CALIFIA',
];
const PALETA = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6', '#e34948'];
const colorLeche = (insumo: string) => PALETA[LECHES.indexOf(insumo)] ?? '#a39e94';

/** Etiqueta de categoría de insumo: el texto identifica, el color solo acompaña. */
const CATEGORIAS: Record<string, string> = {
  LECHE: TIPOS.leche.color,
  CAFÉ: TIPOS.cafe.color,
  HIELO: '#86b6ef',
  AGUA: '#86b6ef',
  BEBIDAS: '#e87ba4',
  INGREDIENTES: '#eda100',
  POLVOS: '#eb6834',
  DESECHABLE: '#a39e94',
};
const colorCategoria = (c: string) => CATEGORIAS[c] ?? '#a39e94';

const fmt = (x: number, dec: number) =>
  new Intl.NumberFormat('es-MX', { maximumFractionDigits: dec, minimumFractionDigits: 0 }).format(x);
/** Cantidad legible: g → kg y ml → L desde 1,000; piezas enteras. */
export function cantidad(x: number, unidad: string) {
  if (unidad === 'gr') return x >= 1000 ? `${fmt(x / 1000, 1)} kg` : `${fmt(x, x < 10 ? 1 : 0)} g`;
  if (unidad === 'ml') return x >= 1000 ? `${fmt(x / 1000, 1)} L` : `${fmt(x, x < 10 ? 1 : 0)} ml`;
  if (unidad === 'pza') return `${fmt(x, 1)} pza`;
  return `${fmt(x, 1)} ${unidad}`;
}

const MOTIVOS: Record<MotivoExcluido, string> = {
  tamano: 'tamaño sin verificar',
  personalizacion: 'con personalización',
  receta: 'sin cantidades para el tamaño',
};

/**
 * Sección Consumo: consumo TEÓRICO según receta de lo vendido en el periodo (solo cantidades, nunca dinero). Misma
 * identidad de líneas que Productos y Costeo; cobertura explícita de lo que no entra y por qué.
 */
export function SeccionConsumo({
  sucursal,
  origen,
  periodo,
  alCambiarPeriodo,
}: {
  sucursal: SucursalInfo;
  origen: FiltroOrigen;
  periodo: Periodo;
  alCambiarPeriodo: (p: Periodo) => void;
}) {
  const { desde, hasta } = rango(periodo, sucursal.zona);
  const { datos, error, cargando, recargar } = useLectura<RespuestaConsumo>(
    `/api/sucursales/${sucursal.companyId}/consumo?desde=${desde}&hasta=${hasta}&origen=${origen}`,
  );
  return (
    <div className="space-y-6" aria-busy={cargando}>
      <div className="placa flex flex-wrap items-end gap-3 p-3">
        <SelectorPeriodo periodo={periodo} zona={sucursal.zona} alCambiar={alCambiarPeriodo} />
      </div>
      {!datos ? (
        error ? (
          <ErrorCarga error={error} alReintentar={recargar} />
        ) : (
          <Esqueleto filas={2} />
        )
      ) : (
        <>
          {error && <ErrorCarga error={error} alReintentar={recargar} />}
          <AvisosLectura lecturas={[{ nombre: 'Periodo', info: datos.lectura }]} />
          {datos.lectura.estado !== 'error' &&
            (datos.cobertura.lineas === 0 ? (
              <div className="rounded-2xl border border-line bg-surface shadow-card">
                <Vacio titulo="Sin ventas en el periodo">
                  Elige otro periodo u origen para ver el consumo teórico.
                </Vacio>
              </div>
            ) : (
              <Contenido d={datos} />
            ))}
        </>
      )}
    </div>
  );
}

function Contenido({ d }: { d: RespuestaConsumo }) {
  const leches = d.insumos.filter((i) => i.categoria === CATEGORIA_LECHE);
  return (
    <>
      <Cobertura d={d} />
      {d.cobertura.incluidas === 0 ? (
        <div className="rounded-2xl border border-line bg-surface shadow-card">
          <Vacio titulo="Ninguna unidad vendida tiene receta completa en el periodo">
            La cobertura de arriba dice por qué quedaron fuera.
          </Vacio>
        </div>
      ) : (
        <>
          <div className="grid gap-6 xl:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
            <Leches leches={leches} />
            <TendenciaDiaria d={d} />
          </div>
          <Categorias d={d} />
          <Insumos d={d} />
          <Productos d={d} />
        </>
      )}
    </>
  );
}

function Cobertura({ d }: { d: RespuestaConsumo }) {
  const c = d.cobertura;
  const [activo, setActivo] = useState<ClaveCobertura | null>(null);
  const valores: Record<ClaveCobertura, number> = {
    incluidas: c.incluidas,
    tamano: c.excluidas.tamano,
    personalizacion: c.excluidas.personalizacion,
    receta: c.excluidas.receta,
    sinEnlace: c.sinEnlace,
    sinCodigo: c.sinCodigo,
    generico: c.generico,
  };
  const claves = Object.keys(COBERTURA) as ClaveCobertura[];
  return (
    <Tarjeta
      titulo="Consumo teórico según receta"
      descripcion={`Lo que piden las recetas de Costeo para las unidades vendidas. No es inventario ni merma: no sale de un conteo. Recetas leídas el ${new Date(d.recetasLeidasEn).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.`}
    >
      <div className="space-y-4 text-sm">
        <p className="text-base text-ink">
          <span className="font-display text-3xl font-black tabular">{numero(c.incluidas)}</span>{' '}
          <span className="text-ink-2">
            de {numero(c.lineas)} unidades vendidas entran al consumo:{' '}
            <strong className="text-ink">{porcentaje(c.sobreTotal)}</strong> de todas (A) y{' '}
            <strong className="text-ink">{porcentaje(c.sobreIdentificable)}</strong> de las identificables (B
            = A − Generic).
          </span>
        </p>
        <div
          className="flex h-4 w-full gap-[2px] overflow-hidden rounded-[4px]"
          role="img"
          aria-label={`Cobertura en unidades: ${claves
            .filter((k) => valores[k] > 0)
            .map((k) => `${COBERTURA[k].nombre} ${numero(valores[k])}`)
            .join(', ')}`}
        >
          {claves
            .filter((k) => valores[k] > 0)
            .map((k) => (
              <span
                key={k}
                onPointerEnter={() => setActivo(k)}
                onPointerLeave={() => setActivo(null)}
                className="h-full transition-opacity"
                style={{
                  width: `${(valores[k] / c.lineas) * 100}%`,
                  backgroundColor: COBERTURA[k].color,
                  opacity: activo && activo !== k ? 0.35 : 1,
                }}
              />
            ))}
        </div>
        <ul className="grid grid-cols-1 gap-x-6 gap-y-1.5 sm:grid-cols-2 xl:grid-cols-3">
          {claves.map((k) => (
            <li
              key={k}
              onPointerEnter={() => setActivo(k)}
              onPointerLeave={() => setActivo(null)}
              className={`flex items-center gap-2 rounded-lg px-1.5 py-1 transition-colors ${activo === k ? 'bg-surface-2' : ''}`}
            >
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-[3px]"
                style={{ backgroundColor: COBERTURA[k].color }}
              />
              <span className="min-w-0 flex-1 truncate">{COBERTURA[k].nombre}</span>
              <span className="tabular font-semibold">{numero(valores[k])}</span>
              <span className="w-11 text-right text-xs tabular text-muted-foreground">
                {porcentaje(c.lineas ? valores[k] / c.lineas : null, 0)}
              </span>
            </li>
          ))}
        </ul>
        {d.tamanos.length > 0 && (
          <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            Tamaños de lo que entra:
            {d.tamanos.map((t) => (
              <Etiqueta key={t.tamano} color={TIPOS.tamano.color}>
                {t.tamano} · {numero(t.lineas)}
              </Etiqueta>
            ))}
          </p>
        )}
        <ul className="list-disc space-y-1 pl-5 text-xs text-muted-foreground">
          <li>
            Una línea del POS es una unidad. Entra si su código tiene receta enlazada, su tamaño está
            verificado para esa receta y no lleva personalizaciones: no hay recetas de personalizaciones, así
            que un cambio de leche o un shot extra no se modela y esa unidad queda fuera completa.
          </li>
          <li>
            Las sub-recetas se expanden hasta sus insumos con su rendimiento. Solo cantidades: sin costos ni
            dinero.
          </li>
          {!d.sucursal.rappi && <li>Rappi de esta sucursal no llega por la API: su consumo no está aquí.</li>}
        </ul>
      </div>
    </Tarjeta>
  );
}

function Leches({ leches }: { leches: RespuestaConsumo['insumos'] }) {
  const total = leches.reduce((a, l) => a + l.cantidad, 0);
  const max = Math.max(1, ...leches.map((l) => l.cantidad));
  const orden = [...leches].sort((a, b) => b.cantidad - a.cantidad);
  return (
    <Tarjeta
      titulo="Leche por tipo"
      descripcion="La leche que piden las recetas base. Los cambios de leche pedidos como personalización no están aquí (esas unidades quedan fuera)."
    >
      {orden.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Lo vendido en el periodo no lleva leche según sus recetas.
        </p>
      ) : (
        <ul className="space-y-3">
          {orden.map((l) => (
            <li key={l.insumoId} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="flex min-w-0 items-center gap-2 text-sm font-medium">
                <span
                  aria-hidden="true"
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: colorLeche(l.insumo) }}
                />
                <span className="truncate">{l.insumo.replace(/^LECHE /, '').toLocaleLowerCase('es-MX')}</span>
              </span>
              <span className="text-right text-sm tabular">
                <span className="font-semibold">{cantidad(l.cantidad, l.unidad)}</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {porcentaje(total ? l.cantidad / total : null, 0)}
                </span>
              </span>
              <span
                aria-hidden="true"
                className="col-span-2 block h-2 overflow-hidden rounded-full bg-surface-2"
              >
                <span
                  className="block h-full rounded-full"
                  style={{ width: `${(l.cantidad / max) * 100}%`, backgroundColor: colorLeche(l.insumo) }}
                />
              </span>
            </li>
          ))}
          <li className="border-t border-line pt-2 text-xs text-muted-foreground">
            Total de leche: <span className="font-semibold text-ink tabular">{cantidad(total, 'ml')}</span>
          </li>
        </ul>
      )}
    </Tarjeta>
  );
}

/** Columnas por día de un insumo (una sola serie, un eje). Hover, foco y flechas muestran el día. */
function TendenciaDiaria({ d }: { d: RespuestaConsumo }) {
  const candidatos = useMemo(
    () => [...d.insumos].sort((a, b) => b.productos - a.productos || b.cantidad - a.cantidad),
    [d],
  );
  const porDefecto =
    d.insumos.filter((i) => i.categoria === CATEGORIA_LECHE).sort((a, b) => b.cantidad - a.cantidad)[0] ??
    candidatos[0];
  const [id, setId] = useState(porDefecto?.insumoId ?? '');
  const insumo = d.insumos.find((i) => i.insumoId === id) ?? porDefecto;
  const [activo, setActivo] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  if (!insumo) return null;
  const dias = d.diario;
  const valores = dias.map((x) => x.cantidades[insumo.insumoId] ?? 0);
  const maxV = Math.max(...valores, 1);
  const paso = 10 ** Math.floor(Math.log10(maxV / 2));
  const tope = Math.ceil(maxV / 2 / paso) * paso * 2;
  const W = 720;
  const H = 220;
  const M = { izq: 56, der: 8, arr: 12, aba: 28 };
  const slot = (W - M.izq - M.der) / Math.max(1, dias.length);
  const ancho = Math.max(2, Math.min(24, slot - 2));
  const y = (v: number) => H - M.aba - (v / tope) * (H - M.arr - M.aba);
  const xDe = (i: number) => M.izq + (i + 0.5) * slot;
  const columna = (i: number, v: number) => {
    const top = y(v);
    const bottom = y(0);
    if (bottom - top < 0.5) return '';
    const r = Math.min(4, (bottom - top) / 2, ancho / 2);
    const l = xDe(i) - ancho / 2;
    const rr = l + ancho;
    return `M${l},${bottom} L${l},${top + r} Q${l},${top} ${l + r},${top} L${rr - r},${top} Q${rr},${top} ${rr},${top + r} L${rr},${bottom} Z`;
  };
  const cadaCuanto = Math.ceil(dias.length / 8);
  const alMover = (e: React.PointerEvent<SVGSVGElement>) => {
    const r = ref.current!.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    setActivo(Math.min(dias.length - 1, Math.max(0, Math.floor((x - M.izq) / slot))));
  };
  return (
    <Tarjeta
      titulo="Consumo por día"
      descripcion="Un insumo a la vez, de las unidades que entran al consumo."
      acciones={
        <label className="text-sm">
          <span className="sr-only">Insumo</span>
          <select
            value={insumo.insumoId}
            onChange={(e) => setId(e.target.value)}
            className={`${claseCampo} w-56`}
          >
            {candidatos.map((i) => (
              <option key={i.insumoId} value={i.insumoId}>
                {i.insumo}
              </option>
            ))}
          </select>
        </label>
      }
    >
      <figure className="space-y-2">
        <div className="relative">
          <svg
            ref={ref}
            tabIndex={0}
            viewBox={`0 0 ${W} ${H}`}
            role="img"
            aria-label={`${insumo.insumo} por día. Usa las flechas para recorrer los días; la tabla tiene las cifras.`}
            className="h-auto w-full touch-pan-y rounded-lg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink"
            onPointerMove={alMover}
            onPointerLeave={() => setActivo(null)}
            onFocus={() => setActivo(dias.length - 1)}
            onBlur={() => setActivo(null)}
            onKeyDown={(e) => {
              if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
              e.preventDefault();
              setActivo((a) =>
                Math.min(
                  dias.length - 1,
                  Math.max(0, (a ?? dias.length - 1) + (e.key === 'ArrowRight' ? 1 : -1)),
                ),
              );
            }}
          >
            {[0, tope / 2, tope].map((t) => (
              <g key={t}>
                <line x1={M.izq} x2={W - M.der} y1={y(t)} y2={y(t)} stroke="#e3ded4" strokeWidth={1} />
                <text
                  x={M.izq - 8}
                  y={y(t) + 4}
                  textAnchor="end"
                  className="fill-muted-foreground text-[11px]"
                >
                  {t === 0 ? '0' : cantidad(t, insumo.unidad)}
                </text>
              </g>
            ))}
            {dias.map((x, i) => (
              <g key={x.fecha}>
                {activo === i && (
                  <rect
                    x={xDe(i) - slot / 2}
                    y={M.arr}
                    width={slot}
                    height={H - M.arr - M.aba}
                    fill="#efece5"
                    rx={3}
                  />
                )}
                <path d={columna(i, valores[i])} fill={AZUL.fuerte} />
                {(i % cadaCuanto === 0 || i === dias.length - 1) && (
                  <text
                    x={xDe(i)}
                    y={H - 8}
                    textAnchor="middle"
                    className="fill-muted-foreground text-[11px]"
                  >
                    {diaMes(x.fecha)}
                  </text>
                )}
              </g>
            ))}
          </svg>
          {activo !== null && dias[activo] && (
            <Tooltip
              x={xDe(activo)}
              ancho={W}
              titulo={fechaCorta(dias[activo].fecha)}
              filas={[
                {
                  color: AZUL.fuerte,
                  etiqueta: insumo.insumo.toLocaleLowerCase('es-MX'),
                  valor: cantidad(valores[activo], insumo.unidad),
                },
                {
                  color: '#a39e94',
                  etiqueta: `de ${numero(dias[activo].lineas)} vendidas`,
                  valor: `${numero(dias[activo].incluidas)} unidades`,
                },
              ]}
            />
          )}
        </div>
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Ver la tabla por día</summary>
          <div className="mt-2 max-h-64 overflow-auto">
            <table className="tabla w-full">
              <thead>
                <tr>
                  <th scope="col">Día</th>
                  <th scope="col" className="numero">
                    {insumo.insumo.toLocaleLowerCase('es-MX')}
                  </th>
                  <th scope="col" className="numero">
                    Unidades que entran
                  </th>
                </tr>
              </thead>
              <tbody>
                {dias.map((x, i) => (
                  <tr key={x.fecha}>
                    <td>{fechaCorta(x.fecha)}</td>
                    <td className="numero">{cantidad(valores[i], insumo.unidad)}</td>
                    <td className="numero">
                      {numero(x.incluidas)} de {numero(x.lineas)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </figure>
    </Tarjeta>
  );
}

function Categorias({ d }: { d: RespuestaConsumo }) {
  return (
    <Tarjeta
      titulo="Por categoría de insumo"
      descripcion="Totales por unidad de medida: gramos, mililitros y piezas no se suman entre sí."
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {d.categorias.map((c) => (
          <li key={c.categoria} className="rounded-xl border border-line bg-paper px-3 py-2.5">
            <Etiqueta color={colorCategoria(c.categoria)}>{c.categoria.toLocaleLowerCase('es-MX')}</Etiqueta>
            <p className="mt-1.5 font-display text-lg font-bold tabular">
              {c.totales.map((t) => cantidad(t.cantidad, t.unidad)).join(' + ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {numero(c.insumos)} {c.insumos === 1 ? 'insumo' : 'insumos'}
            </p>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

function Insumos({ d }: { d: RespuestaConsumo }) {
  const [buscar, setBuscar] = useState('');
  const [categoria, setCategoria] = useState('');
  const lista = d.insumos.filter(
    (i) =>
      (!categoria || i.categoria === categoria) &&
      i.insumo.toLocaleLowerCase('es-MX').includes(buscar.trim().toLocaleLowerCase('es-MX')),
  );
  // La barra compara solo cantidades de la misma unidad.
  const maxPorUnidad = new Map<string, number>();
  for (const i of d.insumos)
    maxPorUnidad.set(i.unidad, Math.max(maxPorUnidad.get(i.unidad) ?? 0, i.cantidad));
  return (
    <Tarjeta
      titulo="Insumos"
      descripcion="Cantidad teórica del periodo y en cuántos productos aparece. La barra compara insumos de la misma unidad."
      cuerpo={false}
    >
      <div className="flex flex-wrap items-end gap-3 px-5 pb-3 pt-4">
        <label className="min-w-48 flex-1 text-sm sm:max-w-xs">
          <span className="mb-1 block font-medium text-ink-2">Buscar insumo</span>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className={claseCampo}
          />
        </label>
        <label className="text-sm">
          <span className="mb-1 block font-medium text-ink-2">Categoría</span>
          <select
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            className={`${claseCampo} w-48`}
          >
            <option value="">Todas</option>
            {d.categorias.map((c) => (
              <option key={c.categoria} value={c.categoria}>
                {c.categoria.toLocaleLowerCase('es-MX')}
              </option>
            ))}
          </select>
        </label>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Ningún insumo coincide" />
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla w-full">
            <thead>
              <tr>
                <th scope="col">Insumo</th>
                <th scope="col">Categoría</th>
                <th scope="col" className="numero">
                  Cantidad teórica
                </th>
                <th scope="col" className="numero">
                  Productos
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => (
                <tr key={i.insumoId}>
                  <td className="font-medium">{i.insumo}</td>
                  <td>
                    <Etiqueta color={colorCategoria(i.categoria)}>
                      {i.categoria.toLocaleLowerCase('es-MX')}
                    </Etiqueta>
                  </td>
                  <td className="numero">
                    <span className="flex items-center justify-end gap-2">
                      <span className="w-20">
                        <BarraCelda valor={i.cantidad} max={maxPorUnidad.get(i.unidad) ?? 1} />
                      </span>
                      <span className="w-24">{cantidad(i.cantidad, i.unidad)}</span>
                    </span>
                  </td>
                  <td className="numero">{numero(i.productos)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Tarjeta>
  );
}

function Productos({ d }: { d: RespuestaConsumo }) {
  const [abierto, setAbierto] = useState<ConsumoProducto | null>(null);
  const [buscar, setBuscar] = useState('');
  const lista = d.productos.filter((p) =>
    p.receta.toLocaleLowerCase('es-MX').includes(buscar.trim().toLocaleLowerCase('es-MX')),
  );
  const max = Math.max(1, ...d.productos.map((p) => p.lineas));
  return (
    <Tarjeta
      titulo="Por producto"
      descripcion="Productos con receta enlazada. Abre uno para ver sus insumos en el periodo."
      cuerpo={false}
    >
      <div className="px-5 pb-3 pt-4">
        <label className="block max-w-xs text-sm">
          <span className="mb-1 block font-medium text-ink-2">Buscar receta</span>
          <input
            type="search"
            value={buscar}
            onChange={(e) => setBuscar(e.target.value)}
            className={claseCampo}
          />
        </label>
      </div>
      {lista.length === 0 ? (
        <Vacio titulo="Ningún producto coincide" />
      ) : (
        <div className="overflow-x-auto">
          <table className="tabla w-full">
            <thead>
              <tr>
                <th scope="col">Receta</th>
                <th scope="col" className="numero">
                  Unidades que entran
                </th>
                <th scope="col">Tamaños</th>
                <th scope="col">Fuera del consumo</th>
              </tr>
            </thead>
            <tbody>
              {lista.map((p) => {
                const fuera = (Object.keys(MOTIVOS) as MotivoExcluido[]).filter((k) => p.excluidas[k] > 0);
                return (
                  <tr key={p.clave}>
                    <td>
                      <button
                        type="button"
                        onClick={() => setAbierto(p)}
                        disabled={p.lineas === 0}
                        className="flex items-center gap-1.5 text-left font-medium hover:underline disabled:no-underline disabled:opacity-60"
                      >
                        <PanelRightOpen size={14} aria-hidden="true" className="shrink-0" />
                        {p.receta}
                      </button>
                    </td>
                    <td className="numero">
                      <span className="flex items-center justify-end gap-2">
                        <span className="w-20">
                          <BarraCelda valor={p.lineas} max={max} />
                        </span>
                        <span className="w-10">{numero(p.lineas)}</span>
                      </span>
                    </td>
                    <td>
                      <span className="flex flex-wrap gap-1">
                        {p.tamanos.map((t) => (
                          <Etiqueta key={t.tamano} color={TIPOS.tamano.color}>
                            {t.tamano} · {numero(t.lineas)}
                          </Etiqueta>
                        ))}
                      </span>
                    </td>
                    <td className="text-xs text-muted-foreground">
                      {fuera.length
                        ? fuera.map((k) => `${numero(p.excluidas[k])} ${MOTIVOS[k]}`).join(' · ')
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Cajon producto={abierto} alCerrar={() => setAbierto(null)} />
    </Tarjeta>
  );
}

/** Cajón lateral con los insumos de un producto (dialog nativo: foco atrapado y Esc cierra). */
function Cajon({ producto, alCerrar }: { producto: ConsumoProducto | null; alCerrar: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (producto && !d.open) d.showModal();
    if (!producto && d.open) d.close();
  }, [producto]);
  return (
    <dialog
      ref={ref}
      onClose={alCerrar}
      onClick={(e) => e.target === ref.current && alCerrar()}
      aria-labelledby="cajon-consumo-titulo"
      className="fixed inset-y-0 right-0 left-auto m-0 h-dvh max-h-dvh w-full max-w-md overflow-y-auto border-l border-line bg-surface p-0 shadow-lift backdrop:bg-ink/40 motion-safe:transition-transform"
    >
      {producto && (
        <div className="space-y-4 p-5">
          <header className="flex items-start justify-between gap-3">
            <div>
              <h2 id="cajon-consumo-titulo" className="font-display text-xl font-bold">
                {producto.receta}
              </h2>
              <p className="mt-1 text-xs text-muted-foreground">
                {numero(producto.lineas)} unidades entran al consumo
                {producto.tamanos.length > 0 &&
                  ` (${producto.tamanos.map((t) => `${t.tamano} ${numero(t.lineas)}`).join(', ')})`}
                .
              </p>
            </div>
            <button
              type="button"
              onClick={alCerrar}
              className="grid size-9 shrink-0 place-items-center rounded-lg border border-line hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ink"
            >
              <X size={16} aria-hidden="true" />
              <span className="sr-only">Cerrar</span>
            </button>
          </header>
          <table className="tabla w-full">
            <thead>
              <tr>
                <th scope="col">Insumo</th>
                <th scope="col" className="numero">
                  En el periodo
                </th>
              </tr>
            </thead>
            <tbody>
              {producto.insumos.map((i) => (
                <tr key={i.insumoId}>
                  <td>
                    <span className="block font-medium">{i.insumo}</span>
                    <span className="text-xs text-muted-foreground">
                      {i.categoria.toLocaleLowerCase('es-MX')}
                    </span>
                  </td>
                  <td className="numero">
                    <span className="block">{cantidad(i.cantidad, i.unidad)}</span>
                    <span className="text-xs text-muted-foreground">
                      {cantidad(i.cantidad / Math.max(1, producto.lineas), i.unidad)} por unidad (promedio)
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {(Object.keys(MOTIVOS) as MotivoExcluido[]).some((k) => producto.excluidas[k] > 0) && (
            <p className="rounded-xl bg-paper px-3 py-2 text-xs text-muted-foreground">
              Fuera del consumo:{' '}
              {(Object.keys(MOTIVOS) as MotivoExcluido[])
                .filter((k) => producto.excluidas[k] > 0)
                .map((k) => `${numero(producto.excluidas[k])} ${MOTIVOS[k]}`)
                .join(' · ')}
              .
            </p>
          )}
        </div>
      )}
    </dialog>
  );
}
