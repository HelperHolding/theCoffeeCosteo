'use client';

// Barra de filtros del tablero BI: 5 visibles + 12 desplegables, chips y Limpiar. Controlada:
// el orquestador escribe la URL a partir de `alCambiar`.
import { useEffect, useMemo, useRef, useState } from 'react';
import type { RpcOpciones } from '@/lib/bi/tipos';
import { FR_POR_OMISION, leerUrl, OPCIONES_FR, type FiltrosUrl } from '@/lib/bi/url';
import { SelectorMultiple } from './selector-multiple';

const RETRASO_MS = 400;
const DIAS_SEMANA = [
  { v: 1, n: 'Lunes' }, { v: 2, n: 'Martes' }, { v: 3, n: 'Miércoles' }, { v: 4, n: 'Jueves' },
  { v: 5, n: 'Viernes' }, { v: 6, n: 'Sábado' }, { v: 0, n: 'Domingo' },
];
const NOMBRE_DIA: Record<string, string> = Object.fromEntries(DIAS_SEMANA.map((d) => [String(d.v), d.n]));
const ANIOS = Array.from({ length: 11 }, (_, i) => String(i));
const HORAS = Array.from({ length: 24 }, (_, i) => String(i));
const NOMBRE_HORA: Record<string, string> = Object.fromEntries(HORAS.map((h) => [h, `${h.padStart(2, '0')}:00`]));
const CAFE = ['Sí', 'No'];
const MADURACION = ['Menor de 3 meses', 'Mayor de 3 meses'];

const CLASE_CAMPO = 'w-full rounded-md border border-line bg-surface px-3 py-2 text-sm';
const CLASE_ETIQUETA = 'mb-1 block text-xs font-semibold text-ink-2';

const dinero = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const textoMonto = (min?: number, max?: number) =>
  min !== undefined && max !== undefined
    ? `${dinero(min)} – ${dinero(max)}`
    : min !== undefined
      ? `desde ${dinero(min)}`
      : `hasta ${dinero(max ?? 0)}`;

interface Chip {
  id: string;
  filtro: string;
  valor: string;
  quitar: () => FiltrosUrl;
}

function CampoSelect(props: {
  id: string;
  etiqueta: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0">
      <label htmlFor={props.id} className={CLASE_ETIQUETA}>{props.etiqueta}</label>
      <select id={props.id} value={props.value} onChange={(e) => props.onChange(e.target.value)} className={CLASE_CAMPO}>
        {props.children}
      </select>
    </div>
  );
}

export function FiltrosBi({
  filtros,
  opciones,
  alCambiar,
}: {
  filtros: FiltrosUrl;
  opciones: RpcOpciones | null;
  alCambiar: (f: FiltrosUrl) => void;
}) {
  const [masFiltros, setMasFiltros] = useState(false);
  const [rango, setRango] = useState({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' });
  const [monto, setMonto] = useState({ min: filtros.montoMin?.toString() ?? '', max: filtros.montoMax?.toString() ?? '' });
  const temporizador = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendiente = useRef<Partial<FiltrosUrl> | null>(null);

  // La URL manda: si cambia desde fuera, los borradores se alinean.
  useEffect(() => setRango({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' }), [filtros.desde, filtros.hasta]);
  useEffect(
    () => setMonto({ min: filtros.montoMin?.toString() ?? '', max: filtros.montoMax?.toString() ?? '' }),
    [filtros.montoMin, filtros.montoMax],
  );
  useEffect(() => () => { if (temporizador.current) clearTimeout(temporizador.current); }, []);

  const cancelarPendiente = () => {
    if (temporizador.current) clearTimeout(temporizador.current);
    temporizador.current = null;
    pendiente.current = null;
  };
  const sincronizarBorradores = (f: FiltrosUrl) => {
    setRango({ desde: f.desde ?? '', hasta: f.hasta ?? '' });
    setMonto({ min: f.montoMin?.toString() ?? '', max: f.montoMax?.toString() ?? '' });
  };
  const aplicar = (cambio: Partial<FiltrosUrl>) => {
    // Un monto por aplicar viaja en esta misma llamada en vez de perderse.
    const siguiente = { ...filtros, ...pendiente.current, ...cambio };
    cancelarPendiente();
    sincronizarBorradores(siguiente);
    alCambiar(siguiente);
  };
  const aplicarConRetraso = (cambio: Partial<FiltrosUrl>) => {
    cancelarPendiente();
    pendiente.current = cambio;
    temporizador.current = setTimeout(() => {
      temporizador.current = null;
      pendiente.current = null;
      alCambiar({ ...filtros, ...cambio });
    }, RETRASO_MS);
  };

  const tiendas = useMemo(() => {
    const nombres: Record<string, string> = {};
    for (const t of opciones?.tiendas ?? []) nombres[String(t.company_id)] = t.nombre;
    return nombres;
  }, [opciones]);

  const num = (v: string[]) => v.map(Number);

  const cambiarRango = (desde: string, hasta: string) => {
    setRango({ desde, hasta });
    if (desde && hasta) aplicar({ fr: undefined, desde, hasta });
    else if (!desde && !hasta && filtros.desde) aplicar({ fr: FR_POR_OMISION, desde: undefined, hasta: undefined });
  };
  const cambiarMonto = (lado: 'min' | 'max', texto: string) => {
    const siguiente = { ...monto, [lado]: texto };
    setMonto(siguiente);
    const leer = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : undefined);
    aplicarConRetraso({ montoMin: leer(siguiente.min), montoMax: leer(siguiente.max) });
  };

  const chips: Chip[] = [];
  const sinFr = { fr: FR_POR_OMISION, desde: undefined, hasta: undefined };
  if (filtros.desde && filtros.hasta)
    chips.push({ id: 'rango', filtro: 'Rango de Fechas', valor: `${filtros.desde} – ${filtros.hasta}`, quitar: () => ({ ...filtros, ...sinFr }) });
  else if (filtros.fr && filtros.fr !== FR_POR_OMISION)
    chips.push({
      id: 'fr',
      filtro: 'Fecha Relativa',
      valor: OPCIONES_FR.find((o) => o.clave === filtros.fr)?.etiqueta ?? filtros.fr,
      quitar: () => ({ ...filtros, fr: FR_POR_OMISION }),
    });
  if (filtros.comparable !== undefined)
    chips.push({
      id: 'comp',
      filtro: 'Comparable',
      valor: filtros.comparable ? 'Comparable' : 'No Comparable',
      quitar: () => ({ ...filtros, comparable: undefined }),
    });
  const chipsLista = <T extends string | number>(
    clave: string,
    filtro: string,
    valores: T[],
    texto: (v: T) => string,
    sin: (resto: T[]) => Partial<FiltrosUrl>,
  ) =>
    valores.forEach((v) =>
      chips.push({
        id: `${clave}-${v}`,
        filtro,
        valor: texto(v),
        quitar: () => ({ ...filtros, ...sin(valores.filter((x) => x !== v)) }),
      }),
    );
  chipsLista('anios', 'Años Operando', filtros.aniosOperando, String, (r) => ({ aniosOperando: r }));
  chipsLista('dias', 'Día de la Semana', filtros.dias, (d) => NOMBRE_DIA[String(d)] ?? String(d), (r) => ({ dias: r }));
  chipsLista('tiendas', 'Nombre de Tienda', filtros.companias, (c) => tiendas[String(c)] ?? `Tienda ${c}`, (r) => ({ companias: r }));
  chipsLista('franq', 'Franquiciatario', filtros.franquiciatarios, String, (r) => ({ franquiciatarios: r }));
  chipsLista('tipo', 'Franquicia o Sucursales Propias', filtros.tipos, String, (r) => ({ tipos: r }));
  chipsLista('cat', 'Categoría Master Franchise MX', filtros.categorias, String, (r) => ({ categorias: r }));
  chipsLista('grupo', 'Comida, Bebida, Combo y Merch', filtros.grupos, String, (r) => ({ grupos: r }));
  chipsLista('cafe', 'Contiene Café', filtros.cafe, String, (r) => ({ cafe: r }));
  chipsLista('prod', 'Product', filtros.productos, String, (r) => ({ productos: r }));
  chipsLista('pago', 'Método de Pago', filtros.pagos, String, (r) => ({ pagos: r }));
  chipsLista('hora', 'Hora', filtros.horas, (h) => NOMBRE_HORA[String(h)] ?? String(h), (r) => ({ horas: r }));
  chipsLista('mad', 'Estatus de Maduración', filtros.maduracion, String, (r) => ({ maduracion: r }));
  if (filtros.montoMin !== undefined || filtros.montoMax !== undefined)
    chips.push({
      id: 'monto',
      filtro: 'Net Amount (Local)',
      valor: textoMonto(filtros.montoMin, filtros.montoMax),
      quitar: () => ({ ...filtros, montoMin: undefined, montoMax: undefined }),
    });
  chipsLista('sem', 'Semanas y año', filtros.semanas, String, (r) => ({ semanas: r }));

  const o = opciones;
  return (
    <section aria-label="Filtros" className="sticky top-0 z-20 border-b border-line bg-surface px-4 py-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <CampoSelect
          id="bi-fr"
          etiqueta="Fecha Relativa"
          value={filtros.desde && filtros.hasta ? '' : (filtros.fr ?? FR_POR_OMISION)}
          onChange={(v) => aplicar({ fr: v, desde: undefined, hasta: undefined })}
        >
          {filtros.desde && filtros.hasta && <option value="" disabled>Rango personalizado</option>}
          {OPCIONES_FR.map((op) => <option key={op.clave} value={op.clave}>{op.etiqueta}</option>)}
        </CampoSelect>
        <CampoSelect
          id="bi-comp"
          etiqueta="Comparable"
          value={filtros.comparable === undefined ? '' : filtros.comparable ? 'si' : 'no'}
          onChange={(v) => aplicar({ comparable: v === 'si' ? true : v === 'no' ? false : undefined })}
        >
          <option value="">Todas</option>
          <option value="si">Comparable</option>
          <option value="no">No Comparable</option>
        </CampoSelect>
        <SelectorMultiple
          etiqueta="Años Operando"
          valores={ANIOS}
          elegidos={filtros.aniosOperando.map(String)}
          alCambiar={(v) => aplicar({ aniosOperando: num(v) })}
        />
        <fieldset className="min-w-0">
          <legend className={CLASE_ETIQUETA}>Rango de Fechas</legend>
          <div className="grid grid-cols-2 gap-2">
            <div className="min-w-0">
              <label htmlFor="bi-desde" className="sr-only">Desde</label>
              <input id="bi-desde" type="date" value={rango.desde} onChange={(e) => cambiarRango(e.target.value, rango.hasta)} className={CLASE_CAMPO} />
            </div>
            <div className="min-w-0">
              <label htmlFor="bi-hasta" className="sr-only">Hasta</label>
              <input id="bi-hasta" type="date" value={rango.hasta} onChange={(e) => cambiarRango(rango.desde, e.target.value)} className={CLASE_CAMPO} />
            </div>
          </div>
        </fieldset>
        <SelectorMultiple
          etiqueta="Día de la Semana"
          valores={DIAS_SEMANA.map((d) => String(d.v))}
          nombres={NOMBRE_DIA}
          elegidos={filtros.dias.map(String)}
          alCambiar={(v) => aplicar({ dias: num(v) })}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          aria-expanded={masFiltros}
          aria-controls="bi-mas-filtros"
          onClick={() => setMasFiltros((m) => !m)}
          className="rounded-md border border-line px-3 py-1.5 text-sm font-semibold text-ink-2"
        >
          {masFiltros ? 'Mostrar menos filtros' : 'Mostrar más filtros'}
        </button>
        <button
          type="button"
          onClick={() => {
            cancelarPendiente();
            const limpio = leerUrl(new URLSearchParams());
            sincronizarBorradores(limpio);
            alCambiar(limpio);
          }}
          className="rounded-md px-3 py-1.5 text-sm font-semibold text-crema-strong underline"
        >
          Limpiar
        </button>
      </div>

      {masFiltros && (
        <div id="bi-mas-filtros" className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <SelectorMultiple
            etiqueta="Nombre de Tienda"
            valores={Object.keys(tiendas)}
            nombres={tiendas}
            buscar
            elegidos={filtros.companias.map(String)}
            alCambiar={(v) => aplicar({ companias: num(v) })}
          />
          <SelectorMultiple etiqueta="Franquiciatario" valores={o?.franquiciatarios ?? []} buscar elegidos={filtros.franquiciatarios} alCambiar={(v) => aplicar({ franquiciatarios: v })} />
          <SelectorMultiple etiqueta="Franquicia o Sucursales Propias" valores={o?.tipos ?? []} elegidos={filtros.tipos} alCambiar={(v) => aplicar({ tipos: v })} />
          <SelectorMultiple etiqueta="Categoría Master Franchise MX" valores={o?.categorias ?? []} elegidos={filtros.categorias} alCambiar={(v) => aplicar({ categorias: v })} />
          <SelectorMultiple etiqueta="Comida, Bebida, Combo y Merch" valores={o?.grupos ?? []} elegidos={filtros.grupos} alCambiar={(v) => aplicar({ grupos: v })} />
          <SelectorMultiple etiqueta="Contiene Café" valores={CAFE} elegidos={filtros.cafe} alCambiar={(v) => aplicar({ cafe: v as ('Sí' | 'No')[] })} />
          <SelectorMultiple etiqueta="Product" valores={o?.productos ?? []} buscar elegidos={filtros.productos} alCambiar={(v) => aplicar({ productos: v })} />
          <SelectorMultiple etiqueta="Método de Pago" valores={o?.pagos ?? []} elegidos={filtros.pagos} alCambiar={(v) => aplicar({ pagos: v })} />
          <SelectorMultiple
            etiqueta="Hora"
            valores={HORAS}
            nombres={NOMBRE_HORA}
            elegidos={filtros.horas.map(String)}
            alCambiar={(v) => aplicar({ horas: num(v) })}
          />
          <SelectorMultiple etiqueta="Estatus de Maduración" valores={MADURACION} elegidos={filtros.maduracion} alCambiar={(v) => aplicar({ maduracion: v })} />
          <fieldset className="min-w-0">
            <legend className={CLASE_ETIQUETA}>Net Amount (Local)</legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="min-w-0">
                <label htmlFor="bi-monto-min" className="sr-only">Net Amount mínimo</label>
                <input id="bi-monto-min" type="number" min={0} step={0.01} placeholder="Mín." value={monto.min} onChange={(e) => cambiarMonto('min', e.target.value)} className={CLASE_CAMPO} />
              </div>
              <div className="min-w-0">
                <label htmlFor="bi-monto-max" className="sr-only">Net Amount máximo</label>
                <input id="bi-monto-max" type="number" min={0} step={0.01} placeholder="Máx." value={monto.max} onChange={(e) => cambiarMonto('max', e.target.value)} className={CLASE_CAMPO} />
              </div>
            </div>
          </fieldset>
          <SelectorMultiple etiqueta="Semanas y año" valores={o?.semanas ?? []} buscar elegidos={filtros.semanas} alCambiar={(v) => aplicar({ semanas: v })} />
        </div>
      )}

      {chips.length > 0 && (
        <ul aria-label="Filtros activos" className="mt-3 flex flex-wrap gap-2">
          {chips.map((c) => (
            <li key={c.id} className="inline-flex max-w-full items-center gap-1 rounded-full bg-crema-soft px-3 py-1 text-xs text-ink">
              <span className="min-w-0 truncate">{c.filtro}: {c.valor}</span>
              <button
                type="button"
                aria-label={`Quitar ${c.filtro}: ${c.valor}`}
                onClick={() => aplicar(c.quitar())}
                className="font-bold text-crema-strong"
              >
                <span aria-hidden="true">✕</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
