'use client';

// Barra de filtros del tablero BI en píldoras: 5 visibles + 12 tras «Más filtros», con Limpiar. Controlada:
// el orquestador escribe la URL a partir de `alCambiar`.
import { useEffect, useMemo, useState } from 'react';
import type { RpcOpciones } from '@/lib/bi/tipos';
import { FR_POR_OMISION, hoyMexico, leerUrl, OPCIONES_FR, resolverPeriodo, type FiltrosUrl } from '@/lib/bi/url';
import { Pildora, ListaUnica } from './pildora-filtro';
import { ListaMultiple } from './selector-multiple';

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
const CLASE_BOTON = 'rounded-md bg-ink px-3 py-1.5 text-sm font-semibold text-surface';

const dinero = (n: number) => `$${Number.isInteger(n) ? n : n.toFixed(2)}`;
const textoMonto = (min?: number, max?: number) =>
  min !== undefined && max !== undefined
    ? `${dinero(min)} – ${dinero(max)}`
    : min !== undefined
      ? `desde ${dinero(min)}`
      : `hasta ${dinero(max ?? 0)}`;

/** Texto de una píldora de lista: «Etiqueta», «Etiqueta: Ventura» o «Etiqueta: 3». */
const textoLista = (etiqueta: string, valores: (string | number)[], nombre: (v: string) => string) =>
  valores.length === 0 ? etiqueta : valores.length === 1 ? `${etiqueta}: ${nombre(String(valores[0]))}` : `${etiqueta}: ${valores.length}`;

type FiltroLista = {
  id: string;
  etiqueta: string;
  valores: string[];
  elegidos: string[];
  nombres?: Record<string, string>;
  buscar?: boolean;
  poner: (v: string[]) => Partial<FiltrosUrl>;
  extra: boolean;
};

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
  const [errorRango, setErrorRango] = useState<string | null>(null);
  const [rango, setRango] = useState({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' });
  const [monto, setMonto] = useState({ min: filtros.montoMin?.toString() ?? '', max: filtros.montoMax?.toString() ?? '' });

  // La URL manda: si cambia desde fuera, los borradores se alinean.
  useEffect(() => setRango({ desde: filtros.desde ?? '', hasta: filtros.hasta ?? '' }), [filtros.desde, filtros.hasta]);
  useEffect(
    () => setMonto({ min: filtros.montoMin?.toString() ?? '', max: filtros.montoMax?.toString() ?? '' }),
    [filtros.montoMin, filtros.montoMax],
  );

  const sincronizarBorradores = (f: FiltrosUrl) => {
    setRango({ desde: f.desde ?? '', hasta: f.hasta ?? '' });
    setMonto({ min: f.montoMin?.toString() ?? '', max: f.montoMax?.toString() ?? '' });
  };
  const aplicar = (cambio: Partial<FiltrosUrl>) => {
    const siguiente = { ...filtros, ...cambio };
    sincronizarBorradores(siguiente);
    alCambiar(siguiente);
  };

  const tiendas = useMemo(() => {
    const nombres: Record<string, string> = {};
    for (const t of opciones?.tiendas ?? []) nombres[String(t.company_id)] = t.nombre;
    return nombres;
  }, [opciones]);

  const num = (v: string[]) => v.map(Number);

  const aplicarRango = (cerrar: () => void) => {
    const { desde, hasta } = rango;
    if (!desde && !hasta) {
      setErrorRango(null);
      if (filtros.desde) aplicar({ fr: FR_POR_OMISION, desde: undefined, hasta: undefined });
      cerrar();
      return;
    }
    if (!desde || !hasta) {
      setErrorRango('Elige las dos fechas.');
      return;
    }
    // Periodo inválido o de más de 1,100 días: mensaje dentro del recuadro y sin llamar a la base.
    const p = resolverPeriodo({ ...filtros, fr: undefined, desde, hasta }, hoyMexico(new Date()));
    if (!p.ok) {
      setErrorRango(p.error);
      return;
    }
    setErrorRango(null);
    aplicar({ fr: undefined, desde, hasta });
    cerrar();
  };
  const aplicarMonto = (cerrar: () => void) => {
    const leer = (s: string) => (s.trim() !== '' && Number.isFinite(Number(s)) && Number(s) >= 0 ? Number(s) : undefined);
    aplicar({ montoMin: leer(monto.min), montoMax: leer(monto.max) });
    cerrar();
  };

  // Estado de «hay algo activo» (los chips ya no se pintan).
  const chips: { id: string }[] = [];
  const hayRango = Boolean(filtros.desde && filtros.hasta);
  if (hayRango) chips.push({ id: 'rango' });
  else if (filtros.fr && filtros.fr !== FR_POR_OMISION) chips.push({ id: 'fr' });
  if (filtros.comparable !== undefined) chips.push({ id: 'comp' });

  const o = opciones;
  const listas: FiltroLista[] = [
    { id: 'anios', etiqueta: 'Años Operando', valores: ANIOS, elegidos: filtros.aniosOperando.map(String), poner: (v) => ({ aniosOperando: num(v) }), extra: false },
    { id: 'dias', etiqueta: 'Día de la Semana', valores: DIAS_SEMANA.map((d) => String(d.v)), nombres: NOMBRE_DIA, elegidos: filtros.dias.map(String), poner: (v) => ({ dias: num(v) }), extra: false },
    { id: 'tiendas', etiqueta: 'Nombre de Tienda', valores: Object.keys(tiendas), nombres: tiendas, buscar: true, elegidos: filtros.companias.map(String), poner: (v) => ({ companias: num(v) }), extra: true },
    { id: 'franq', etiqueta: 'Franquiciatario', valores: o?.franquiciatarios ?? [], buscar: true, elegidos: filtros.franquiciatarios, poner: (v) => ({ franquiciatarios: v }), extra: true },
    { id: 'tipo', etiqueta: 'Franquicia o Sucursales Propias', valores: o?.tipos ?? [], elegidos: filtros.tipos, poner: (v) => ({ tipos: v }), extra: true },
    { id: 'cat', etiqueta: 'Categoría Master Franchise MX', valores: o?.categorias ?? [], elegidos: filtros.categorias, poner: (v) => ({ categorias: v }), extra: true },
    { id: 'grupo', etiqueta: 'Comida, Bebida, Combo y Merch', valores: o?.grupos ?? [], elegidos: filtros.grupos, poner: (v) => ({ grupos: v }), extra: true },
    { id: 'cafe', etiqueta: 'Contiene Café', valores: CAFE, elegidos: filtros.cafe, poner: (v) => ({ cafe: v as ('Sí' | 'No')[] }), extra: true },
    { id: 'prod', etiqueta: 'Product', valores: o?.productos ?? [], buscar: true, elegidos: filtros.productos, poner: (v) => ({ productos: v }), extra: true },
    { id: 'pago', etiqueta: 'Método de Pago', valores: o?.pagos ?? [], elegidos: filtros.pagos, poner: (v) => ({ pagos: v }), extra: true },
    { id: 'hora', etiqueta: 'Hora', valores: HORAS, nombres: NOMBRE_HORA, elegidos: filtros.horas.map(String), poner: (v) => ({ horas: num(v) }), extra: true },
    { id: 'mad', etiqueta: 'Estatus de Maduración', valores: MADURACION, elegidos: filtros.maduracion, poner: (v) => ({ maduracion: v }), extra: true },
    { id: 'sem', etiqueta: 'Semanas y año', valores: o?.semanas ?? [], buscar: true, elegidos: filtros.semanas, poner: (v) => ({ semanas: v }), extra: true },
  ];
  const hayMonto = filtros.montoMin !== undefined || filtros.montoMax !== undefined;
  const activosExtra = listas.filter((l) => l.extra && l.elegidos.length > 0).length + (hayMonto ? 1 : 0);
  const hayActivos = chips.length > 0 || listas.some((l) => l.elegidos.length > 0) || hayMonto;

  const pildoraLista = (id: string) => {
    const l = listas.find((x) => x.id === id)!;
    const nombre = (v: string) => l.nombres?.[v] ?? v;
    const texto = textoLista(l.etiqueta, l.elegidos, nombre);
    return (
      <Pildora
        key={l.id}
        etiqueta={l.etiqueta}
        texto={texto}
        activa={l.elegidos.length > 0}
        alQuitar={() => aplicar(l.poner([]))}
        quitarEtiqueta={`Quitar ${texto}`}
      >
        {() => (
          <ListaMultiple
            etiqueta={l.etiqueta}
            valores={l.valores}
            elegidos={l.elegidos}
            nombres={l.nombres}
            buscar={l.buscar}
            alCambiar={(v) => aplicar(l.poner(v))}
          />
        )}
      </Pildora>
    );
  };

  const frActual = filtros.fr ?? FR_POR_OMISION;
  const textoFr = hayRango ? `${filtros.desde} – ${filtros.hasta}` : (OPCIONES_FR.find((op) => op.clave === frActual)?.etiqueta ?? frActual);
  const compValor = filtros.comparable === undefined ? '' : filtros.comparable ? 'si' : 'no';
  const OPCIONES_COMP = [
    { valor: '', texto: 'Todas' },
    { valor: 'si', texto: 'Comparable' },
    { valor: 'no', texto: 'No Comparable' },
  ];

  return (
    <section aria-label="Filtros" className="z-20 rounded-2xl border border-line bg-surface px-4 py-3 lg:sticky lg:top-[65px]">
      <div className="flex flex-wrap items-center gap-2">
        <Pildora
          etiqueta="Fecha Relativa"
          texto={textoFr}
          activa={hayRango || frActual !== FR_POR_OMISION}
          alQuitar={() => aplicar({ fr: FR_POR_OMISION, desde: undefined, hasta: undefined })}
        >
          {(cerrar) => (
            <ListaUnica
              opciones={OPCIONES_FR.map((op) => ({ valor: op.clave, texto: op.etiqueta }))}
              valor={hayRango ? '' : frActual}
              alElegir={(v) => {
                aplicar({ fr: v, desde: undefined, hasta: undefined });
                cerrar();
              }}
            />
          )}
        </Pildora>
        <Pildora
          etiqueta="Comparable"
          texto={compValor ? `Comparable: ${OPCIONES_COMP.find((c) => c.valor === compValor)?.texto}` : 'Comparable'}
          activa={compValor !== ''}
          alQuitar={() => aplicar({ comparable: undefined })}
        >
          {(cerrar) => (
            <ListaUnica
              opciones={OPCIONES_COMP}
              valor={compValor}
              alElegir={(v) => {
                aplicar({ comparable: v === 'si' ? true : v === 'no' ? false : undefined });
                cerrar();
              }}
            />
          )}
        </Pildora>
        {pildoraLista('anios')}
        <Pildora
          etiqueta="Rango de Fechas"
          texto={hayRango ? `Rango de Fechas: ${filtros.desde} – ${filtros.hasta}` : 'Rango de Fechas'}
          activa={hayRango}
          alQuitar={() => aplicar({ fr: FR_POR_OMISION, desde: undefined, hasta: undefined })}
        >
          {(cerrar) => (
            <div className="grid gap-2">
              <input
                type="date"
                aria-label="Desde"
                value={rango.desde}
                onChange={(e) => setRango({ ...rango, desde: e.target.value })}
                className={CLASE_CAMPO}
              />
              <input
                type="date"
                aria-label="Hasta"
                value={rango.hasta}
                onChange={(e) => setRango({ ...rango, hasta: e.target.value })}
                className={CLASE_CAMPO}
              />
              {errorRango && (
                <p role="alert" className="text-xs font-semibold text-bad">
                  {errorRango}
                </p>
              )}
              <button type="button" onClick={() => aplicarRango(cerrar)} className={CLASE_BOTON}>
                Aplicar
              </button>
            </div>
          )}
        </Pildora>
        {pildoraLista('dias')}
        <button
          type="button"
          aria-expanded={masFiltros}
          aria-controls="bi-mas-filtros"
          onClick={() => setMasFiltros((m) => !m)}
          className="rounded-full border border-dashed border-line px-3 py-1.5 text-sm font-semibold text-ink-2"
        >
          {`Más filtros${activosExtra > 0 ? ` · ${activosExtra} activo${activosExtra > 1 ? 's' : ''}` : ''}`} ▾
        </button>
        {hayActivos && (
          <button
            type="button"
            onClick={() => {
              const limpio = leerUrl(new URLSearchParams());
              sincronizarBorradores(limpio);
              setErrorRango(null);
              alCambiar(limpio);
            }}
            className="px-2 py-1.5 text-sm font-semibold text-crema-strong underline"
          >
            Limpiar
          </button>
        )}
      </div>

      {masFiltros && (
        <div id="bi-mas-filtros" className="mt-2 flex flex-wrap gap-2">
          {['tiendas', 'franq', 'tipo', 'cat', 'grupo', 'cafe', 'prod', 'pago', 'hora', 'mad'].map(pildoraLista)}
          <Pildora
            etiqueta="Net Amount (Local)"
            texto={hayMonto ? `Net Amount (Local): ${textoMonto(filtros.montoMin, filtros.montoMax)}` : 'Net Amount (Local)'}
            activa={hayMonto}
            alQuitar={() => aplicar({ montoMin: undefined, montoMax: undefined })}
          >
            {(cerrar) => (
              <div className="grid gap-2">
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Mín."
                  aria-label="Net Amount mínimo"
                  value={monto.min}
                  onChange={(e) => setMonto({ ...monto, min: e.target.value })}
                  className={CLASE_CAMPO}
                />
                <input
                  type="number"
                  min={0}
                  step={0.01}
                  placeholder="Máx."
                  aria-label="Net Amount máximo"
                  value={monto.max}
                  onChange={(e) => setMonto({ ...monto, max: e.target.value })}
                  className={CLASE_CAMPO}
                />
                <button type="button" onClick={() => aplicarMonto(cerrar)} className={CLASE_BOTON}>
                  Aplicar
                </button>
              </div>
            )}
          </Pildora>
          {pildoraLista('sem')}
        </div>
      )}
    </section>
  );
}
