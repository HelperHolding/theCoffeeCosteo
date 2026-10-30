'use client';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Info, PanelRightOpen, X } from 'lucide-react';
import type { RespuestaConsumo, SucursalInfo } from '@/lib/sucursales/contratos';
import {
  CATEGORIA_LECHE,
  type ConsumoProducto,
  type InsumoConsumo,
  type MotivoExcluido,
} from '@/lib/sucursales/consumo';
import type { FiltroOrigen } from '@/lib/sucursales/metricas';
import { claseCampo } from '@/lib/crm/formato';
import { Tarjeta, Vacio } from '@/components/portal/piezas';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
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
  personalizacion: { color: '#e87ba4', nombre: 'Con personalización aún sin calcular' },
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
  if (unidad === 'pza') return `${fmt(x, 2)} pza`;
  return `${fmt(x, 1)} ${unidad}`;
}

const MOTIVOS: Record<MotivoExcluido, string> = {
  tamano: 'tamaño sin verificar',
  personalizacion: 'con personalización sin calcular',
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
  const leches = d.insumos.filter((i) => i.categoria === CATEGORIA_LECHE && i.unidades > 0);
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
      <SinRecetaTodavia d={d} />
    </>
  );
}

/** De qué venta salió un producto que se vendió dentro de un combo. */
function EnCombo({ combo }: { combo: string }) {
  return <span className="block text-xs font-normal text-muted-foreground">en {combo}</span>;
}

/** ¿Separar POS y Rappi? Solo si la sucursal tiene Rappi y el filtro de origen incluye los dos. */
const separaRappi = (d: RespuestaConsumo) => d.sucursal.rappi && d.origen === 'todos';

/** Pop-up de detalle (se abre con clic o teclado; Esc y el botón lo cierran). */
function Detalle({
  titulo,
  disparador,
  children,
}: {
  titulo: string;
  disparador: React.ReactElement;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <Popover open={abierto} onOpenChange={setAbierto}>
      <PopoverTrigger asChild>{disparador}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={8}
        // Arriba deja libre la barra fija del portal.
        collisionPadding={{ top: 80, right: 16, bottom: 16, left: 16 }}
        className="con-info-pop max-h-[min(70vh,34rem)] w-[min(24rem,calc(100vw-2rem))] overflow-y-auto rounded-2xl border-white/70 p-0 text-sm"
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4">
          <p className="font-display text-base font-bold">{titulo}</p>
          <button
            type="button"
            onClick={() => setAbierto(false)}
            aria-label="Cerrar"
            className="-mt-1 -mr-1 grid size-7 place-items-center rounded-full text-muted-foreground hover:bg-ink/5"
          >
            <X size={15} aria-hidden="true" />
          </button>
        </div>
        <div className="space-y-3 px-4 pt-1 pb-4 text-ink-2">{children}</div>
      </PopoverContent>
    </Popover>
  );
}

/** Lista corta de cifras (etiqueta → valor) dentro de un pop-up. */
function Cifras({ filas }: { filas: { etiqueta: React.ReactNode; valor: React.ReactNode }[] }) {
  return (
    <dl className="divide-y divide-ink/10 rounded-xl bg-ink/[0.04]">
      {filas.map((f, k) => (
        <div key={k} className="flex items-baseline justify-between gap-3 px-3 py-2">
          <dt className="min-w-0 text-xs text-ink-2">{f.etiqueta}</dt>
          <dd className="tabular shrink-0 text-right font-semibold text-ink">{f.valor}</dd>
        </div>
      ))}
    </dl>
  );
}

const MAX_EN_POPUP = 8;

/** Qué hay detrás de cada parte de la barra de cobertura: productos y razones, con las mismas cifras. */
function DetalleCobertura({ k, d }: { k: ClaveCobertura; d: RespuestaConsumo }) {
  const c = d.cobertura;
  if (k === 'incluidas')
    return (
      <>
        <p>Su código tiene receta enlazada, su tamaño está verificado y la receta tiene cantidades.</p>
        <Cifras
          filas={[
            ...d.tamanos.map((t) => ({ etiqueta: `Tamaño ${t.tamano}`, valor: numero(t.lineas) })),
            ...(c.ajustadas > 0
              ? [{ etiqueta: 'Con una personalización ya calculada', valor: numero(c.ajustadas) }]
              : []),
            ...(c.sinContar > 0
              ? [
                  {
                    etiqueta: 'Con una opción con costo extra que aún no se cuenta',
                    valor: numero(c.sinContar),
                  },
                ]
              : []),
          ]}
        />
        {c.sinContar > 0 && (
          <p className="text-xs text-muted-foreground">
            Esas unidades cuentan su receta; la opción con costo extra (p. ej. mayonesa o leche de avena) aún
            no. El detalle de cada insumo dice cuál y cuántas.
          </p>
        )}
      </>
    );
  if (k === 'tamano' || k === 'personalizacion' || k === 'receta') {
    const filas = d.productos
      .filter((p) => p.excluidas[k] > 0)
      .sort((a, b) => b.excluidas[k] - a.excluidas[k]);
    return (
      <>
        <p>Tienen receta, pero esta unidad no se puede contar todavía. Por producto y por qué:</p>
        <ul className="divide-y divide-ink/10 rounded-xl bg-ink/[0.04]">
          {filas.slice(0, MAX_EN_POPUP).map((p) => (
            <li key={p.clave} className="px-3 py-2">
              <span className="flex items-baseline justify-between gap-3">
                <span className="min-w-0 font-medium text-ink">
                  {p.receta}
                  {p.combo && <EnCombo combo={p.combo} />}
                </span>
                <span className="tabular shrink-0 font-semibold text-ink">{numero(p.excluidas[k])}</span>
              </span>
              {p.razones
                .filter((r) => r.motivo === k)
                .map((r) => (
                  <span key={r.razon} className="block text-xs text-muted-foreground">
                    {numero(r.unidades)}: {r.razon}
                  </span>
                ))}
            </li>
          ))}
        </ul>
        {filas.length > MAX_EN_POPUP && (
          <p className="text-xs text-muted-foreground">
            Y {numero(filas.length - MAX_EN_POPUP)} productos más: están en «Por producto».
          </p>
        )}
      </>
    );
  }
  if (k === 'sinEnlace' || k === 'sinCodigo') {
    const filas = d.sinReceta.filter((s) => s.sinCodigo === (k === 'sinCodigo'));
    return (
      <>
        <p>
          {k === 'sinEnlace'
            ? 'Su código aún no tiene receta enlazada. En cuanto se enlace, sus unidades entran solas.'
            : 'El nombre se vendió con más de un código en el periodo: no se elige uno.'}
        </p>
        <Cifras
          filas={filas.slice(0, MAX_EN_POPUP).map((s) => ({ etiqueta: s.nombre, valor: numero(s.unidades) }))}
        />
        {filas.length > MAX_EN_POPUP && (
          <p className="text-xs text-muted-foreground">
            Y {numero(filas.length - MAX_EN_POPUP)} más: están en «Se venden sin receta todavía».
          </p>
        )}
      </>
    );
  }
  return (
    <p>Ventas capturadas como Generic en el POS: no dicen qué producto fue, así que no tienen receta.</p>
  );
}

/** Cómo se cuenta: las reglas del consumo, en el pop-up del encabezado. */
function ComoSeCuenta({ d }: { d: RespuestaConsumo }) {
  return (
    <Detalle
      titulo="Cómo se cuenta"
      disparador={
        <button
          type="button"
          className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs font-medium text-ink-2 hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ink"
        >
          <Info size={14} aria-hidden="true" />
          Cómo se cuenta
        </button>
      }
    >
      <ul className="list-disc space-y-2 pl-4 text-xs">
        <li>
          Cada producto vendido es una unidad. Entra si su código tiene receta enlazada, su tamaño está
          verificado para esa receta y la receta tiene cantidades para ese tamaño.
        </li>
        <li>
          Las personalizaciones usan las mismas listas revisadas que Costeo: «Lactose free» descuenta
          deslactosada en lugar de entera, la vainilla con ml usa esa cantidad y el grano White o Kraft
          sustituye al Black. Café por shot: el Single y el Double usan los 18 g de la receta y el Extra
          Double, 36 g.
        </li>
        <li>
          {d.sucursal.rappiPortal
            ? 'Lo que aún no se calcula (miel, leches vegetales, mayonesa…) no saca la unidad: entra con su receta. Las opciones con costo extra quedan anotadas en el detalle de cada insumo.'
            : 'Una personalización que aún no se calcula (miel, leches vegetales…) deja fuera esa unidad completa.'}
        </li>
        {d.sucursal.rappiPortal && (
          <li>
            Un combo cuenta como sus productos, en Rappi y en el POS: la bebida y el pan entran cada uno con
            su receta, igual que sueltos, marcados con el combo en el que se vendieron.
          </li>
        )}
        <li>
          Las sub-recetas se expanden hasta sus insumos con su rendimiento. Solo cantidades, sin dinero.
        </li>
        <li>
          {d.sucursal.rappiPortal
            ? 'Rappi se lee del portal de Rappi (tienda normal y Turbo, cada 10 minutos) con las mismas reglas que el POS.'
            : d.sucursal.rappi
              ? 'Rappi entra con las mismas reglas que el POS.'
              : 'Rappi de esta sucursal no llega por la API: su consumo no está aquí.'}
        </li>
        <li>
          No es inventario ni merma: es lo que piden las recetas de Costeo, leídas el{' '}
          {new Date(d.recetasLeidasEn).toLocaleString('es-MX', { dateStyle: 'medium', timeStyle: 'short' })}.
        </li>
      </ul>
    </Detalle>
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
  // Solo las partes con unidades: lo que está en cero no ocupa lugar.
  const claves = (Object.keys(COBERTURA) as ClaveCobertura[]).filter((k) => valores[k] > 0);
  return (
    <Tarjeta
      titulo="Consumo teórico según receta"
      descripcion="Lo que piden las recetas de Costeo para lo vendido. No es inventario ni merma."
      acciones={<ComoSeCuenta d={d} />}
    >
      <div className="space-y-3 text-sm">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1">
          <p className="text-ink-2">
            <span className="font-display text-3xl font-black tabular text-ink">{numero(c.incluidas)}</span>{' '}
            de {numero(c.lineas)} unidades vendidas entran al consumo
          </p>
          <p className="text-xs text-muted-foreground">
            <strong className="text-sm text-ink">{porcentaje(c.sobreTotal)}</strong> de todas ·{' '}
            <strong className="text-sm text-ink">{porcentaje(c.sobreIdentificable)}</strong> sin Generic
          </p>
        </div>
        <div
          className="flex h-3 w-full gap-[2px] overflow-hidden rounded-[4px]"
          role="img"
          aria-label={`Cobertura en unidades: ${claves.map((k) => `${COBERTURA[k].nombre} ${numero(valores[k])}`).join(', ')}`}
        >
          {claves.map((k) => (
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
        <ul
          className="flex flex-wrap gap-2"
          aria-label="Partes de la cobertura (abre una para ver el detalle)"
        >
          {claves.map((k) => (
            <li key={k}>
              <Detalle
                titulo={`${COBERTURA[k].nombre}: ${numero(valores[k])}`}
                disparador={
                  <button
                    type="button"
                    onPointerEnter={() => setActivo(k)}
                    onPointerLeave={() => setActivo(null)}
                    onFocus={() => setActivo(k)}
                    onBlur={() => setActivo(null)}
                    className={`flex items-center gap-2 rounded-full border border-line px-3 py-1.5 text-left transition-colors hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-ink ${activo === k ? 'bg-surface-2' : ''}`}
                  >
                    <span
                      aria-hidden="true"
                      className="size-2.5 shrink-0 rounded-[3px]"
                      style={{ backgroundColor: COBERTURA[k].color }}
                    />
                    <span>{COBERTURA[k].nombre}</span>
                    <span className="tabular font-semibold">{numero(valores[k])}</span>
                    <span className="tabular text-xs text-muted-foreground">
                      {porcentaje(valores[k] / c.lineas, 0)}
                    </span>
                    <ChevronDown size={13} aria-hidden="true" className="text-muted-foreground" />
                  </button>
                }
              >
                <DetalleCobertura k={k} d={d} />
              </Detalle>
            </li>
          ))}
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
      descripcion="La leche que piden las recetas, con «Lactose free» ya como deslactosada. Las leches vegetales pedidas como personalización aún no se calculan (esas unidades quedan fuera)."
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
    () =>
      d.insumos
        .filter((i) => i.unidades > 0)
        .sort((a, b) => b.productos - a.productos || b.cantidad - a.cantidad),
    [d],
  );
  const porDefecto =
    candidatos.filter((i) => i.categoria === CATEGORIA_LECHE).sort((a, b) => b.cantidad - a.cantidad)[0] ??
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
              {separaRappi(d) &&
                c.totales.some((t) => t.rappi > 0) &&
                ` · Rappi ${c.totales
                  .filter((t) => t.rappi > 0)
                  .map((t) => cantidad(t.rappi, t.unidad))
                  .join(' + ')}`}
            </p>
          </li>
        ))}
      </ul>
    </Tarjeta>
  );
}

/**
 * Cuadre de un insumo: las unidades vendidas cuya receta lo lleva = las que entran (por producto, con cuánto
 * consumen) + las que quedan fuera (con la razón). Las opciones con costo extra que aún no se cuentan quedan anotadas
 * en su producto.
 */
function CuadreInsumo({ i, separa }: { i: InsumoConsumo; separa: boolean }) {
  const fuera = i.fuera.reduce((a, f) => a + f.unidades, 0);
  const columnas = separa ? 5 : 3;
  const encabezado = 'bg-transparent py-1 font-medium normal-case tracking-normal text-muted-foreground';
  const th = `${encabezado} text-right`;
  const num = 'py-1 text-right tabular';
  const total = 'font-semibold text-ink';
  return (
    <div className="space-y-2 py-1 pl-6 text-xs">
      <p className="text-sm text-ink-2">
        <strong className="text-ink">{numero(i.unidades + fuera)}</strong> unidades vendidas llevan {i.insumo}{' '}
        en su receta: <strong className="text-ink">{numero(i.unidades)} entran</strong> (
        {cantidad(i.cantidad, i.unidad)})
        {fuera > 0 ? (
          <>
            {' '}
            y <strong className="text-ink">{numero(fuera)} quedan fuera</strong>, cada una con su razón.
          </>
        ) : (
          '; ninguna queda fuera.'
        )}
      </p>
      <table className="w-full">
        <caption className="sr-only">Cuadre de {i.insumo}: unidades que entran y que quedan fuera</caption>
        <thead>
          <tr>
            <th scope="col" className={`${encabezado} text-left`}>
              Producto
            </th>
            <th scope="col" className={th}>
              Unidades
            </th>
            <th scope="col" className={th}>
              Cantidad
            </th>
            {separa && (
              <>
                <th scope="col" className={th}>
                  POS
                </th>
                <th scope="col" className={th}>
                  Rappi
                </th>
              </>
            )}
          </tr>
        </thead>
        {i.detalle.length > 0 && (
          <tbody>
            {i.detalle.map((p, n) => (
              <tr key={`${n}-${p.receta}`} className="align-top">
                <td className="py-1">
                  {p.receta}
                  {p.combo && <EnCombo combo={p.combo} />}
                  {p.sinContar.length > 0 && (
                    <span className="block text-muted-foreground">
                      {p.sinContar.map((s) => `${numero(s.unidades)} con «${s.nombre}»`).join(', ')}: costo
                      extra que aún no se cuenta
                    </span>
                  )}
                </td>
                <td className={num}>{numero(p.unidades)}</td>
                <td className={num}>{cantidad(p.cantidad, i.unidad)}</td>
                {separa && (
                  <>
                    <td className={num}>{cantidad(p.cantidad - p.rappi, i.unidad)}</td>
                    <td className={num}>{p.rappi ? cantidad(p.rappi, i.unidad) : '—'}</td>
                  </>
                )}
              </tr>
            ))}
            <tr className={total}>
              <td className="py-1">Entran</td>
              <td className={num}>{numero(i.unidades)}</td>
              <td className={num}>{cantidad(i.cantidad, i.unidad)}</td>
              {separa && (
                <>
                  <td className={num}>{cantidad(i.cantidad - i.rappi, i.unidad)}</td>
                  <td className={num}>{i.rappi ? cantidad(i.rappi, i.unidad) : '—'}</td>
                </>
              )}
            </tr>
          </tbody>
        )}
        {fuera > 0 && (
          <tbody>
            {i.fuera.map((f, n) => (
              <tr key={`${n}-${f.receta}`} className="align-top">
                <td className="py-1">
                  {f.receta}
                  {f.combo && <EnCombo combo={f.combo} />}
                  <span className="block text-muted-foreground">Fuera: {f.razon}</span>
                </td>
                <td className={num}>
                  {numero(f.unidades)}
                  {separa && f.rappi > 0 && (
                    <span className="block text-muted-foreground">{numero(f.rappi)} de Rappi</span>
                  )}
                </td>
                <td className={`${num} text-muted-foreground`}>no suma</td>
                {separa && <td colSpan={2} />}
              </tr>
            ))}
            <tr className={total}>
              <td className="py-1">Quedan fuera</td>
              <td className={num}>{numero(fuera)}</td>
              <td colSpan={columnas - 2} />
            </tr>
          </tbody>
        )}
        <tfoot>
          <tr className={total}>
            <td className="py-1">Vendidas que llevan este insumo</td>
            <td className={num}>{numero(i.unidades + fuera)}</td>
            <td colSpan={columnas - 2} />
          </tr>
        </tfoot>
      </table>
    </div>
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
  const [abiertos, setAbiertos] = useState<Set<string>>(new Set());
  const alternar = (id: string) =>
    setAbiertos((a) => {
      const n = new Set(a);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const separa = separaRappi(d);
  const columnas = separa ? 6 : 4;
  return (
    <Tarjeta
      titulo="Insumos"
      descripcion={`Cantidad teórica del periodo${separa ? ', separada en POS (Mostrador + App) y Rappi' : ''}. Abre un insumo para ver su cuadre: qué productos lo consumen y qué unidades que lo llevan quedaron fuera y por qué. La barra compara insumos de la misma unidad.`}
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
                {separa && (
                  <>
                    <th scope="col" className="numero">
                      POS
                    </th>
                    <th scope="col" className="numero">
                      Rappi
                    </th>
                  </>
                )}
                <th scope="col" className="numero">
                  Productos
                </th>
              </tr>
            </thead>
            <tbody>
              {lista.map((i) => {
                const abierto = abiertos.has(i.insumoId);
                return (
                  <Fragment key={i.insumoId}>
                    <tr>
                      <td className="font-medium">
                        <button
                          type="button"
                          onClick={() => alternar(i.insumoId)}
                          aria-expanded={abierto}
                          aria-controls={`desglose-${i.insumoId}`}
                          className="flex items-center gap-1.5 text-left hover:underline"
                        >
                          <ChevronRight
                            size={14}
                            aria-hidden="true"
                            className={`shrink-0 transition-transform motion-reduce:transition-none ${abierto ? 'rotate-90' : ''}`}
                          />
                          {i.insumo}
                        </button>
                      </td>
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
                      {separa && (
                        <>
                          <td className="numero">{cantidad(i.cantidad - i.rappi, i.unidad)}</td>
                          <td className="numero">{i.rappi ? cantidad(i.rappi, i.unidad) : '—'}</td>
                        </>
                      )}
                      <td className="numero">{numero(i.productos)}</td>
                    </tr>
                    {abierto && (
                      <tr id={`desglose-${i.insumoId}`} className="bg-surface-2/60">
                        <td colSpan={columnas} className="!py-2">
                          <CuadreInsumo i={i} separa={separa} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
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
                      {p.combo && <EnCombo combo={p.combo} />}
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

/**
 * Lo que se vende sin receta enlazada (o sin código). No suma al consumo, pero queda a la vista: el consumo se calcula
 * al leer, así que cuando su código tenga receta sus unidades entran solas, también las de periodos pasados.
 */
function SinRecetaTodavia({ d }: { d: RespuestaConsumo }) {
  if (!d.sinReceta.length) return null;
  const separa = separaRappi(d);
  return (
    <Tarjeta
      titulo="Se venden sin receta todavía"
      descripcion="Todavía no suman al consumo. En cuanto su receta quede enlazada, sus unidades entran solas, también las de este periodo."
      cuerpo={false}
    >
      <div className="overflow-x-auto">
        <table className="tabla w-full">
          <thead>
            <tr>
              <th scope="col">Producto</th>
              <th scope="col" className="numero">
                Unidades
              </th>
              {separa && (
                <th scope="col" className="numero">
                  De Rappi
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {d.sinReceta.map((s, k) => (
              <tr key={`${k}-${s.nombre}`}>
                <td>
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium">{s.nombre}</span>
                    {s.sinCodigo && <Etiqueta color={COBERTURA.sinCodigo.color}>sin código</Etiqueta>}
                  </span>
                </td>
                <td className="numero">{numero(s.unidades)}</td>
                {separa && <td className="numero">{s.rappi ? numero(s.rappi) : '—'}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
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
              {producto.combo && <EnCombo combo={producto.combo} />}
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
          {producto.razones.length > 0 && (
            <div className="rounded-xl bg-paper px-3 py-2 text-xs text-muted-foreground">
              <p className="font-medium text-ink-2">Unidades fuera del consumo y por qué</p>
              <ul className="mt-1 space-y-0.5">
                {producto.razones.map((r) => (
                  <li key={`${r.motivo}|${r.razon}`}>
                    {numero(r.unidades)}: {r.razon}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
