'use client';
import { useEffect, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { claseCampo } from '@/lib/crm/formato';
import { leerRuta, ponerRuta } from '@/lib/comercializadora/config';
import {
  CAFE_ESCS,
  CAFE_PROD,
  IMP_CONT_TIPOS,
  IMP_ESCS,
  MESES_ABR,
  impMesTxt,
  numeroParam,
  redConsiderada,
  usarPlataforma,
  type ContextoParamsCafe,
  type ContextoParamsImp,
} from '@/lib/comercializadora/paramsImpCafe';
import { guardarParamsImpCafe } from '@/app/(comercializadora)/comercializadora/acciones';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type X = any;
const chico = 'h-8 w-20 rounded-md border border-line bg-surface-2 px-1.5 text-right text-xs tabular-nums';

/** Campo numérico del borrador (_impIn): se escribe libre y al salir se acota como _impEdit. */
function Num(p: {
  valor: number | null;
  min: number;
  max: number;
  entero?: boolean;
  nulo?: boolean;
  ph?: string;
  etiqueta: string;
  deshabilitado: boolean;
  clase?: string;
  alCambiar: (v: number | null) => void;
}) {
  const [txt, setTxt] = useState(p.valor == null ? '' : String(p.valor));
  useEffect(() => setTxt(p.valor == null ? '' : String(p.valor)), [p.valor]);
  return (
    <input
      aria-label={p.etiqueta}
      inputMode="decimal"
      className={p.clase ?? chico}
      value={txt}
      placeholder={p.ph}
      disabled={p.deshabilitado}
      onChange={(e) => setTxt(e.target.value)}
      onBlur={() => {
        const v = numeroParam(txt, p, p.valor);
        setTxt(v == null ? '' : String(v));
        if (v !== p.valor) p.alCambiar(v);
      }}
    />
  );
}

/** Borrador de una sección (imp o cafe): rutas relativas a la sección, Guardar y Descartar. */
function useBorrador(ambito: 'imp' | 'cafe', guardado: X, version: number) {
  const router = useRouter();
  const [b, setB] = useState<X>(guardado);
  const [msg, setMsg] = useState<{ ok: boolean; t: string } | null>(null);
  const [pendiente, iniciar] = useTransition();
  useEffect(() => setB(guardado), [guardado]);
  const sucio = JSON.stringify(b) !== JSON.stringify(guardado);
  return {
    b,
    setB,
    sucio,
    msg,
    pendiente,
    val: (ruta: string) => leerRuta(b, ruta) as X,
    poner: (ruta: string, v: unknown) => setB((x: X) => ponerRuta(x, ruta, v)),
    guardar: () =>
      iniciar(async () => {
        const r = await guardarParamsImpCafe(ambito, b, version);
        if ('error' in r) return setMsg({ ok: false, t: r.error });
        setMsg({ ok: true, t: `Guardado: ${r.cambios} ${r.cambios === 1 ? 'cambio' : 'cambios'}.` });
        router.refresh();
      }),
    descartar: () => (setB(guardado), setMsg(null)),
  };
}
type Borrador = ReturnType<typeof useBorrador>;

function Barra({ d, editable }: { d: Borrador; editable: boolean }) {
  return (
    <div className="sticky top-0 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3 shadow-card">
      <span className="text-sm text-ink-2">
        {!editable
          ? 'Tu acceso es de solo lectura.'
          : d.sucio
            ? 'Hay cambios sin guardar.'
            : 'Sin cambios. Lo que guardes aquí es la configuración oficial de esta sección.'}
      </span>
      <span className="flex-1" />
      {d.msg ? (
        <span role={d.msg.ok ? 'status' : 'alert'} className={`text-sm ${d.msg.ok ? 'text-ok' : 'text-bad'}`}>
          {d.msg.t}
        </span>
      ) : null}
      {editable ? (
        <>
          <button
            type="button"
            disabled={!d.sucio || d.pendiente}
            onClick={d.descartar}
            className="h-9 rounded-[10px] border border-line-strong px-3 text-sm font-semibold disabled:opacity-50"
          >
            Descartar
          </button>
          <button
            type="button"
            disabled={!d.sucio || d.pendiente}
            onClick={d.guardar}
            className="h-9 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white disabled:opacity-50"
          >
            {d.pendiente ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </>
      ) : null}
    </div>
  );
}

function Campo({
  etiqueta,
  ayuda,
  children,
}: {
  etiqueta: string;
  ayuda?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="grid gap-1 text-sm" title={ayuda}>
      <span className="text-ink-2">{etiqueta}</span>
      {children}
    </label>
  );
}
function Sel(p: {
  etiqueta: string;
  valor: string;
  opciones: [string, string][];
  deshabilitado: boolean;
  alCambiar: (v: string) => void;
  clase?: string;
}) {
  return (
    <select
      aria-label={p.etiqueta}
      className={p.clase ?? claseCampo}
      value={p.valor}
      disabled={p.deshabilitado}
      onChange={(e) => p.alCambiar(e.target.value)}
    >
      {p.opciones.map(([v, t]) => (
        <option key={v} value={v}>
          {t}
        </option>
      ))}
    </select>
  );
}

/** Parámetros de Importaciones (_impVistaParams): escenarios, red, política, proveedores, contenedor, fuentes, temporada y artículos. */
export function ParametrosImp(p: {
  imp: X;
  version: number;
  editable: boolean;
  esc: string;
  ctx: ContextoParamsImp;
}) {
  const d = useBorrador('imp', p.imp, p.version);
  const b = d.b,
    no = !p.editable;
  const n = (
    ruta: string,
    et: string,
    r: { min: number; max: number; entero?: boolean; nulo?: boolean },
    o: { ph?: string; clase?: string } = {},
  ) => (
    <Num
      etiqueta={et}
      valor={d.val(ruta) ?? null}
      {...r}
      ph={o.ph}
      clase={o.clase}
      deshabilitado={no}
      alCambiar={(v) => d.poner(ruta, v)}
    />
  );
  const red = redConsiderada(
    p.ctx.pipeline,
    p.ctx.claves,
    b,
    IMP_ESCS.includes(p.esc) ? p.esc : b.escenario,
    p.ctx.aperIncluir,
  );
  const usados: Record<string, number> = {};
  b.orden.forEach((k: string) => {
    const it = b.items[k];
    if (it) usados[String(it.prov).toLowerCase()] = (usados[String(it.prov).toLowerCase()] || 0) + 1;
  });
  const provOpts: [string, string][] = b.prov.map((x: X) => [x.clave, x.nombre]);
  const famOpts: [string, string][] = Object.keys(b.temporada).map((f) => [f, f]);
  const cmp = (hoja: number, plat: number | null, campo: 'venta' | 'kit', sku: string) =>
    plat == null ? (
      <span className="block text-[10px] text-muted-foreground">Plataforma: sin datos</span>
    ) : (
      <span
        className={`block text-[10px] ${hoja > 0 && Math.abs((plat - hoja) / hoja) > 0.25 ? 'text-warn' : 'text-muted-foreground'}`}
      >
        Plataforma: {plat.toLocaleString('es-MX', { maximumFractionDigits: campo === 'venta' ? 3 : 2 })}
        {hoja > 0 ? ` (${plat > hoja ? '+' : ''}${Math.round(((plat - hoja) / hoja) * 100)}%)` : ''}{' '}
        {p.editable ? (
          <button
            type="button"
            className="font-semibold underline"
            onClick={() => d.setB(usarPlataforma(b, p.ctx.meta, campo, sku).imp)}
          >
            usar
          </button>
        ) : null}
      </span>
    );

  return (
    <div className="space-y-5">
      <Barra d={d} editable={p.editable} />
      <p className="max-w-3xl text-sm text-muted-foreground">
        Los valores iniciales salieron de tu Sheet &quot;Calculadora de abasto de importados&quot;. El
        inventario, las OCs en camino y las aperturas vienen siempre de la plataforma. Lo que muestra el resto
        de la pantalla se actualiza al guardar.
      </p>

      <Tarjeta
        titulo="Escenarios"
        descripcion="El selector de arriba solo cambia lo que ves; aquí eliges el escenario con el que abre la pantalla. Crecimiento: cuánto crece al año la venta de cada sucursal (0.10 = 10%). Cumplimiento de aperturas: qué parte se cumple (1 = todas). Ajuste de demanda: sube o baja toda la demanda."
      >
        <div className="mb-3 max-w-xs">
          <Campo etiqueta="Escenario de referencia">
            <Sel
              etiqueta="Escenario de referencia"
              valor={b.escenario}
              opciones={IMP_ESCS.map((k) => [k, k])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('escenario', v)}
            />
          </Campo>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla max-w-xl">
            <thead>
              <tr>
                <th>Escenario</th>
                <th className="text-right">Crecimiento anual</th>
                <th className="text-right">Cumplimiento de aperturas</th>
                <th className="text-right">Ajuste de demanda</th>
              </tr>
            </thead>
            <tbody>
              {IMP_ESCS.map((k) => (
                <tr key={k}>
                  <td className="font-semibold">{k}</td>
                  <td className="text-right">
                    {n(`escenarios.${k}.crec`, `Crecimiento ${k}`, { min: -0.5, max: 1 })}
                  </td>
                  <td className="text-right">
                    {n(`escenarios.${k}.cumpl`, `Cumplimiento ${k}`, { min: 0, max: 3 })}
                  </td>
                  <td className="text-right">
                    {n(`escenarios.${k}.ajuste`, `Ajuste ${k}`, { min: -0.9, max: 2 })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Red de sucursales y aperturas"
        descripcion="El pipeline se actualiza solo con los registros de aperturas. El plan de Dirección cubre los meses en los que todavía no hay aperturas registradas; el plan de cada mes queda fijo en su mes calendario (vacío usa el valor general)."
      >
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Sucursales operando hoy" ayuda="Automático = aperturas activas de la plataforma">
            <Sel
              etiqueta="Sucursales operando hoy"
              valor={b.red.suc_hoy_modo}
              opciones={[
                ['auto', `Automático (aperturas activas: ${p.ctx.sucHoyAuto})`],
                ['manual', 'Capturar a mano'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('red.suc_hoy_modo', v)}
            />
          </Campo>
          {b.red.suc_hoy_modo === 'manual' ? (
            <Campo etiqueta="Sucursales hoy">
              {n('red.suc_hoy', 'Sucursales hoy', { min: 0, max: 5000, entero: true }, { clase: claseCampo })}
            </Campo>
          ) : null}
          <Campo etiqueta="Meses en los que manda el pipeline">
            {n(
              'red.meses_pipeline',
              'Meses en los que manda el pipeline',
              { min: 0, max: 15, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Aperturas por mes sin plan propio">
            {n(
              'red.plan_def',
              'Aperturas por mes sin plan propio',
              { min: 0, max: 500, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <p className="my-3 text-xs text-muted-foreground">
          Pipeline: {p.ctx.pl.total} aperturas en proceso
          {p.ctx.pl.vencidas ? ` (${p.ctx.pl.vencidas} con fecha vencida cuentan en el mes en curso)` : ''}
          {p.ctx.pl.sinFecha ? `, ${p.ctx.pl.sinFecha} sin fecha` : ''}
          {p.ctx.pl.despues ? `, ${p.ctx.pl.despues} después de 15 meses` : ''}. &quot;Considerado&quot; ya
          incluye el cumplimiento del escenario.
        </p>
        <div className="overflow-x-auto">
          <table className="tabla max-w-3xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                <th className="text-right">Plan de Dirección</th>
                <th className="text-right">Cierres</th>
                <th className="text-right">Aperturas consideradas</th>
                <th>De dónde</th>
              </tr>
            </thead>
            <tbody>
              {red.map((f) => (
                <tr key={f.key}>
                  <td className="font-semibold">{impMesTxt(f.key)}</td>
                  <td className="text-right tabular-nums">{f.pipeline}</td>
                  <td className="text-right">
                    {n(
                      `red.plan.${f.key}`,
                      `Plan ${f.key}`,
                      { min: 0, max: 500, entero: true, nulo: true },
                      { ph: String(b.red.plan_def) },
                    )}
                  </td>
                  <td className="text-right">
                    {n(
                      `red.cierres.${f.key}`,
                      `Cierres ${f.key}`,
                      { min: 0, max: 500, entero: true, nulo: true },
                      { ph: '0' },
                    )}
                  </td>
                  <td className="text-right font-bold tabular-nums">{f.considerada}</td>
                  <td className="text-xs text-muted-foreground">
                    {f.fuente === 'pipeline'
                      ? 'pipeline'
                      : f.fuente === 'plan'
                        ? 'plan de Dirección'
                        : f.fuente}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Política de compra">
        <div className="grid gap-3 sm:grid-cols-5">
          <Campo etiqueta="Meses que cubre cada pedido">
            {n(
              'politica.meses_cobertura',
              'Meses que cubre cada pedido',
              { min: 1, max: 14, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Meses de respaldo">
            {n('politica.meses_respaldo', 'Meses de respaldo', { min: 0, max: 6 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Días de margen">
            {n(
              'politica.dias_margen',
              'Días de margen',
              { min: 0, max: 60, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Días para juntar pedidos">
            {n(
              'politica.dias_juntar',
              'Días para juntar pedidos',
              { min: 0, max: 180, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Días de respaldo del siguiente contenedor">
            {n(
              'contenedor.dias_respaldo',
              'Días de respaldo del siguiente contenedor',
              { min: 0, max: 120, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Proveedores y lead times"
        descripcion="Días desde que se coloca el pedido hasta que llega a CEDIS; cierres son los días extra por cierres de fábrica o de fin de año. El proveedor de contenedores se planea por contenedor lleno (vasos y tapas)."
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Proveedor</th>
                <th className="text-right">Lead time normal</th>
                <th className="text-right">Días extra por cierres</th>
                <th className="text-right">Total</th>
                <th>Contenedores</th>
                <th>Nota</th>
              </tr>
            </thead>
            <tbody>
              {b.prov.map((x: X, i: number) => (
                <tr key={x.clave}>
                  <td className="min-w-48">
                    <input
                      aria-label={`Nombre de ${x.clave}`}
                      className={claseCampo}
                      value={x.nombre}
                      disabled={no}
                      onChange={(e) => d.poner(`prov.${i}.nombre`, e.target.value)}
                    />
                    <span className="block text-[10px] text-muted-foreground">
                      Clave: {x.clave} · {usados[x.clave.toLowerCase()] || 0} artículo(s)
                    </span>
                  </td>
                  <td className="text-right">
                    {n(`prov.${i}.lead`, `Lead time ${x.clave}`, { min: 1, max: 400, entero: true })}
                  </td>
                  <td className="text-right">
                    {n(`prov.${i}.cierres`, `Cierres ${x.clave}`, { min: 0, max: 120, entero: true })}
                  </td>
                  <td className="text-right font-bold tabular-nums">{x.lead + x.cierres}</td>
                  <td className="text-center">
                    <input
                      type="radio"
                      name="imp-prov-cont"
                      aria-label={`Contenedores: ${x.clave}`}
                      checked={!!x.contenedor}
                      disabled={no}
                      onChange={() =>
                        d.poner(
                          'prov',
                          b.prov.map((y: X, j: number) => ({ ...y, contenedor: j === i })),
                        )
                      }
                    />
                  </td>
                  <td className="min-w-56">
                    <input
                      aria-label={`Nota de ${x.clave}`}
                      className={claseCampo}
                      value={x.nota}
                      disabled={no}
                      onChange={(e) => d.poner(`prov.${i}.nota`, e.target.value)}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {p.editable ? (
          <div className="mt-3 flex gap-3">
            <button
              type="button"
              disabled={b.prov.length >= 12}
              className="text-sm font-semibold underline disabled:opacity-50"
              onClick={() => {
                let k = b.prov.length + 1,
                  clave = `Proveedor nuevo ${k}`;
                while (b.prov.some((x: X) => x.clave.toLowerCase() === clave.toLowerCase()))
                  clave = `Proveedor nuevo ${++k}`;
                d.poner('prov', [
                  ...b.prov,
                  { clave, nombre: clave, lead: 90, cierres: 0, nota: '', contenedor: false },
                ]);
              }}
            >
              Agregar proveedor
            </button>
            {b.prov.length > 1 && !usados[b.prov[b.prov.length - 1].clave.toLowerCase()] ? (
              <button
                type="button"
                className="text-sm font-semibold underline"
                onClick={() => {
                  const resto = b.prov.slice(0, -1);
                  if (b.prov[b.prov.length - 1].contenedor) resto[0] = { ...resto[0], contenedor: true };
                  d.poner('prov', resto);
                }}
              >
                Quitar el último
              </button>
            ) : null}
          </div>
        ) : null}
      </Tarjeta>

      <Tarjeta titulo="Contenedor y compra puente">
        <div className="grid gap-3 sm:grid-cols-4">
          <Campo etiqueta="Tipo de contenedor">
            <Sel
              etiqueta="Tipo de contenedor"
              valor={b.contenedor.tipo}
              opciones={IMP_CONT_TIPOS.map((t) => [t, t])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('contenedor.tipo', v)}
            />
          </Campo>
          <Campo etiqueta="CBM del 40' HQ">
            {n('contenedor.cbm40', "CBM del 40' HQ", { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="CBM del 45' HQ">
            {n('contenedor.cbm45', "CBM del 45' HQ", { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="CBM personalizado">
            {n('contenedor.cbmp', 'CBM personalizado', { min: 1, max: 300 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Llenado real" ayuda="Qué parte del volumen nominal se aprovecha (1 = 100%)">
            {n('contenedor.llenado', 'Llenado real', { min: 0.1, max: 1 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Contenedores por embarque">
            {n(
              'contenedor.por_embarque',
              'Contenedores por embarque',
              { min: 1, max: 10, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Colchón de la compra puente (días)">
            {n(
              'puente.dias_colchon',
              'Colchón de la compra puente',
              { min: 0, max: 60, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
          <Campo etiqueta="Múltiplo de la compra puente">
            {n(
              'puente.multiplo',
              'Múltiplo de la compra puente',
              { min: 1, max: 1000, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Cómo se calcula con los datos de la plataforma"
        descripcion="La venta por sucursal y el kit por apertura pueden venir de tu hoja (los valores de abajo) o de la plataforma (ventas reales y piezas por apertura del catálogo)."
      >
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Venta por sucursal">
            <Sel
              etiqueta="Venta por sucursal"
              valor={b.fuentes.venta}
              opciones={[
                ['hoja', 'De la hoja (valores guardados)'],
                ['plataforma', 'De la plataforma'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('fuentes.venta', v)}
            />
          </Campo>
          <Campo etiqueta="Kit por apertura">
            <Sel
              etiqueta="Kit por apertura"
              valor={b.fuentes.kit}
              opciones={[
                ['hoja', 'De la hoja (valores guardados)'],
                ['plataforma', 'Del catálogo (piezas por apertura)'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('fuentes.kit', v)}
            />
          </Campo>
          <Campo etiqueta="Ventana de venta de la plataforma (días)">
            {n(
              'venta_ventana',
              'Ventana de venta de la plataforma',
              { min: 30, max: 365, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <div className="mt-3 grid gap-2 text-sm">
          {(
            [
              [
                'prorratear_mes1',
                'Ajustar el mes en curso',
                'El modelo cuenta el mes completo; con esto se le suma al inventario lo que ya se vendió este mes, como si se calculara el día 1',
              ],
              [
                'corregir_hoja',
                'Corregir tres errores de la hoja',
                'La hoja lee la demanda de otro producto en el contenedor 10, no valida el horizonte en el 11 y deja un contenedor fuera del calendario. Apágalo para reproducir la hoja tal cual',
              ],
            ] as const
          ).map(([k, t, ayuda]) => (
            <label key={k} className="flex items-center gap-2" title={ayuda}>
              <input
                type="checkbox"
                checked={!!b[k]}
                disabled={no}
                onChange={(e) => d.poner(k, e.target.checked)}
              />
              {t}
            </label>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Estacionalidad por familia"
        descripcion='Índice de venta por mes calendario (1 = mes normal, 2 = el doble). La familia "General" no tiene estacionalidad.'
      >
        <div className="overflow-x-auto">
          <table className="tabla">
            <thead>
              <tr>
                <th>Familia</th>
                {MESES_ABR.map((m) => (
                  <th key={m} className="text-right">
                    {m}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {Object.keys(b.temporada).map((f) => (
                <tr key={f}>
                  <td className="min-w-40 font-semibold">
                    {f}
                    <span className="block text-[10px] font-normal text-muted-foreground">
                      {b.orden.filter((k: string) => b.items[k] && b.items[k].familia === f).length}{' '}
                      artículo(s)
                    </span>
                  </td>
                  {MESES_ABR.map((m, i) => (
                    <td key={m} className="text-right">
                      {n(`temporada.${f}.${i}`, `${f} ${m}`, { min: 0, max: 10 }, { clase: `${chico} w-14` })}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Artículos del plan de importaciones"
        descripcion='Venta por sucursal: unidades por sucursal al mes (sin estacionalidad). Kit por apertura: unidades que lleva cada sucursal nueva. "En camino manual" es para compras sin OC en la plataforma (quítalo cuando la registres).'
      >
        {p.editable ? (
          <div className="mb-3 flex flex-wrap gap-3">
            {(['venta', 'kit'] as const).map((campo) => (
              <button
                key={campo}
                type="button"
                className="text-sm font-semibold underline"
                onClick={() => d.setB(usarPlataforma(b, p.ctx.meta, campo).imp)}
              >
                Usar {campo === 'venta' ? 'la venta' : 'el kit'} de la plataforma en todos
              </button>
            ))}
          </div>
        ) : null}
        <div className="overflow-x-auto">
          <table className="tabla text-xs">
            <thead>
              <tr>
                <th>Artículo</th>
                <th>Familia</th>
                <th>Proveedor</th>
                <th>Unidad</th>
                <th className="text-right">Venta por sucursal al mes</th>
                <th className="text-right">Kit por apertura</th>
                <th className="text-right">Empaque</th>
                <th className="text-right">Mínimo del proveedor</th>
                <th className="text-right">Costo</th>
                <th className="text-right">CBM por unidad</th>
                <th>En camino manual</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {b.orden.map((sku: string) => {
                const it = b.items[sku];
                if (!it) return null;
                const mt = p.ctx.meta[sku],
                  pd = mt?.cat,
                  pv = b.prov.find((x: X) => x.clave.toLowerCase() === String(it.prov).toLowerCase());
                const P = `items.${sku}.`;
                return (
                  <tr key={sku} className={it.activo === false ? 'opacity-55' : ''}>
                    <td className="min-w-56">
                      <label className="flex items-start gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Incluir ${sku}`}
                          checked={it.activo !== false}
                          disabled={no}
                          onChange={(e) => d.poner(P + 'activo', e.target.checked)}
                        />
                        <span>
                          <b>{it.nombre}</b>
                          <span className="block font-mono text-[10px] text-muted-foreground">{sku}</span>
                          <span className="block text-[10px]">
                            {!pd ? (
                              <span className="text-bad">No está en el catálogo</span>
                            ) : (
                              [
                                pd.estatus && pd.estatus !== 'Compra Recurrente' ? pd.estatus : '',
                                pd.origen && pd.origen !== 'IMPORTADO'
                                  ? `Zoho: ${pd.origen === 'LOCAL' ? 'local' : pd.origen.toLowerCase()}`
                                  : '',
                                pd.lt && pv && Math.abs(pd.lt - (pv.lead + pv.cierres)) > 15
                                  ? `Lead time en Zoho: ${pd.lt} d`
                                  : '',
                              ]
                                .filter(Boolean)
                                .join(' · ')
                            )}
                          </span>
                        </span>
                      </label>
                    </td>
                    <td>
                      <Sel
                        etiqueta={`Familia ${sku}`}
                        valor={it.familia}
                        opciones={famOpts}
                        deshabilitado={no}
                        clase={chico + ' w-32 text-left'}
                        alCambiar={(v) => d.poner(P + 'familia', v)}
                      />
                    </td>
                    <td>
                      <Sel
                        etiqueta={`Proveedor ${sku}`}
                        valor={it.prov}
                        opciones={pv ? provOpts : [...provOpts, [it.prov, `${it.prov} (no existe)`]]}
                        deshabilitado={no}
                        clase={chico + ' w-36 text-left'}
                        alCambiar={(v) => d.poner(P + 'prov', v)}
                      />
                    </td>
                    <td>
                      <input
                        aria-label={`Unidad ${sku}`}
                        className={chico + ' w-16 text-left'}
                        value={it.unidad}
                        disabled={no}
                        onChange={(e) => d.poner(P + 'unidad', e.target.value)}
                      />
                    </td>
                    <td className="text-right">
                      {n(P + 'venta', `Venta ${sku}`, { min: 0, max: 10000 })}
                      {mt ? cmp(it.venta, mt.vPlat, 'venta', sku) : null}
                    </td>
                    <td className="text-right">
                      {n(P + 'kit', `Kit ${sku}`, { min: 0, max: 10000 })}
                      {mt ? cmp(it.kit, mt.kPlat, 'kit', sku) : null}
                    </td>
                    <td className="text-right">
                      {n(P + 'empaque', `Empaque ${sku}`, { min: 1, max: 1e6 })}
                      {pd && pd.multiplo > 1 && pd.multiplo !== it.empaque ? (
                        <span className="block text-[10px] text-muted-foreground">
                          Catálogo: {pd.multiplo}
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">{n(P + 'minimo', `Mínimo ${sku}`, { min: 0, max: 1e7 })}</td>
                    <td className="text-right">
                      {n(P + 'costo', `Costo ${sku}`, { min: 0, max: 1e7 })}
                      {pd && pd.costo > 0 ? (
                        <span className="block text-[10px] text-muted-foreground">
                          Catálogo: {pd.costo} (se usa)
                        </span>
                      ) : null}
                    </td>
                    <td className="text-right">{n(P + 'cbm', `CBM ${sku}`, { min: 0, max: 100 })}</td>
                    <td className="whitespace-nowrap">
                      {n(
                        P + 'camino_qty',
                        `En camino ${sku}`,
                        { min: 0, max: 1e7 },
                        { clase: chico + ' w-16' },
                      )}{' '}
                      <input
                        type="date"
                        aria-label={`Fecha en camino ${sku}`}
                        className="h-8 rounded-md border border-line bg-surface-2 px-1 text-xs"
                        value={it.camino_fecha || ''}
                        disabled={no}
                        onChange={(e) =>
                          d.poner(
                            P + 'camino_fecha',
                            /^20\d\d-\d\d-\d\d$/.test(e.target.value) ? e.target.value : '',
                          )
                        }
                      />
                      {mt && mt.ocN ? (
                        <span className="block text-[10px] text-muted-foreground">
                          En OCs: {mt.ocQ.toLocaleString('es-MX')} ({mt.ocN}{' '}
                          {mt.ocN === 1 ? 'línea' : 'líneas'})
                        </span>
                      ) : null}
                    </td>
                    <td>
                      {p.editable ? (
                        <button
                          type="button"
                          className="text-xs font-semibold underline"
                          onClick={() => {
                            if (
                              !confirm(
                                `¿Quitar ${sku} del plan de importaciones? Se guarda hasta que pulses Guardar cambios.`,
                              )
                            )
                              return;
                            const items = { ...b.items };
                            delete items[sku];
                            d.setB({ ...b, items, orden: b.orden.filter((k: string) => k !== sku) });
                          }}
                        >
                          Quitar
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {p.ctx.candidatos.filter((x) => !b.items[x.sku]).length ? (
          <div className="mt-5">
            <h3 className="text-sm font-bold">Importados del catálogo que no están en el plan</h3>
            <p className="mb-2 text-xs text-muted-foreground">
              Zoho los marca como importados (o con lead time mayor a {p.ctx.entregaMax} días). Agrégalos y
              revisa su proveedor, familia y CBM.
            </p>
            <div className="overflow-x-auto">
              <table className="tabla text-xs">
                <thead>
                  <tr>
                    <th>SKU</th>
                    <th>Artículo</th>
                    <th>Estatus</th>
                    <th>Proveedor preferido</th>
                    <th className="text-right">Inventario</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {p.ctx.candidatos
                    .filter((x) => !b.items[x.sku])
                    .map((x) => (
                      <tr key={x.sku}>
                        <td className="font-mono">{x.sku}</td>
                        <td>{x.nombre}</td>
                        <td>{x.estatus}</td>
                        <td>{x.proveedor || '—'}</td>
                        <td className="text-right tabular-nums">{x.inventario.toLocaleString('es-MX')}</td>
                        <td>
                          {p.editable ? (
                            <button
                              type="button"
                              className="font-semibold underline"
                              onClick={() =>
                                d.setB({
                                  ...b,
                                  items: { ...b.items, [x.sku]: x.item },
                                  orden: [...b.orden, x.sku],
                                })
                              }
                            >
                              Agregar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </Tarjeta>
    </div>
  );
}

/** Parámetros de Café (_cafeVistaParams): escenarios, aperturas y cierres del año, ajustes generales y presentaciones. */
export function ParametrosCafe(p: { cafe: X; version: number; editable: boolean; ctx: ContextoParamsCafe }) {
  const d = useBorrador('cafe', p.cafe, p.version);
  const b = d.b,
    no = !p.editable,
    auto = b.q4_modo === 'auto';
  const n = (
    ruta: string,
    et: string,
    r: { min: number; max: number; entero?: boolean; nulo?: boolean },
    o: { ph?: string; clase?: string } = {},
  ) => (
    <Num
      etiqueta={et}
      valor={d.val(ruta) ?? null}
      {...r}
      ph={o.ph}
      clase={o.clase}
      deshabilitado={no}
      alCambiar={(v) => d.poner(ruta, v)}
    />
  );
  const suma = CAFE_PROD.reduce((s, x) => s + Number(b.prod[x.id].mezcla || 0), 0);
  return (
    <div className="space-y-5">
      <Barra d={d} editable={p.editable} />
      <Tarjeta
        titulo="Escenarios"
        descripcion="Crecimiento: cuánto crece al año la compra por posicionamiento (0.10 = 10%). Sucursal madura: kg al mes con 7 meses o más. Mes de apertura: kg que compra una sucursal el mes que abre (incluye su inventario inicial)."
      >
        <div className="mb-3 grid gap-3 sm:grid-cols-3">
          <Campo
            etiqueta="Año del cálculo"
            ayuda="Las cohortes de octubre a diciembre son las del año anterior"
          >
            {n('anio', 'Año del cálculo', { min: 2026, max: 2040, entero: true }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Arranque del año">
            <Sel
              etiqueta="Arranque del año"
              valor={b.q4_modo}
              opciones={[
                ['auto', 'Automático (plataforma)'],
                ['manual', 'Capturar a mano por escenario'],
              ]}
              deshabilitado={no}
              alCambiar={(v) => d.poner('q4_modo', v)}
            />
          </Campo>
          <Campo etiqueta="Escenario de referencia">
            <Sel
              etiqueta="Escenario de referencia"
              valor={b.escenario}
              opciones={CAFE_ESCS.map((k) => [k, k])}
              deshabilitado={no}
              alCambiar={(v) => d.poner('escenario', v)}
            />
          </Campo>
        </div>
        <div className="overflow-x-auto">
          <table className="tabla max-w-4xl">
            <thead>
              <tr>
                <th>Escenario</th>
                <th className="text-right">Crecimiento anual</th>
                <th className="text-right">Sucursal madura (kg/mes)</th>
                <th className="text-right">Mes de apertura (kg)</th>
                <th className="text-right">Sucursales al 1 de enero</th>
                <th className="text-right">Aperturas al mes (oct-dic)</th>
              </tr>
            </thead>
            <tbody>
              {CAFE_ESCS.map((k) => {
                const P = `escenarios.${k}.`;
                return (
                  <tr key={k}>
                    <td className="font-semibold">{k}</td>
                    <td className="text-right">{n(P + 'crec', `Crecimiento ${k}`, { min: -0.5, max: 1 })}</td>
                    <td className="text-right">{n(P + 'madura', `Madura ${k}`, { min: 0, max: 1000 })}</td>
                    <td className="text-right">
                      {n(P + 'apertura', `Apertura ${k}`, { min: 0, max: 1000 })}
                    </td>
                    <td className="text-right">
                      {auto ? (
                        <span className="text-muted-foreground">{p.ctx.ini} (plataforma)</span>
                      ) : (
                        n(P + 'ini', `Sucursales ${k}`, { min: 0, max: 5000, entero: true })
                      )}
                    </td>
                    <td className="text-right">
                      {auto ? (
                        <span className="text-muted-foreground">{p.ctx.a0} (plataforma)</span>
                      ) : (
                        n(P + 'a0', `Aperturas oct-dic ${k}`, { min: 0, max: 200, entero: true })
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Aperturas y cierres del año"
        descripcion={`Aperturas de cada mes por escenario. "Pipeline registrado" es lo que ya hay en la plataforma con fecha de ese mes de ${p.ctx.anio}.`}
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-3xl">
            <thead>
              <tr>
                <th>Mes</th>
                <th className="text-right">Pipeline registrado</th>
                {CAFE_ESCS.map((k) => (
                  <th key={k} className="text-right">
                    {k}
                  </th>
                ))}
                <th className="text-right">Cierres</th>
              </tr>
            </thead>
            <tbody>
              {MESES_ABR.map((m, i) => (
                <tr key={m}>
                  <td className="font-semibold">
                    {m} {String(b.anio).slice(2)}
                  </td>
                  <td className="text-right tabular-nums">{p.ctx.pipeAnio[i]}</td>
                  {CAFE_ESCS.map((k) => (
                    <td key={k} className="text-right">
                      {n(`escenarios.${k}.aper.${i}`, `Aperturas ${k} ${m}`, {
                        min: 0,
                        max: 200,
                        entero: true,
                      })}
                    </td>
                  ))}
                  <td className="text-right">
                    {n(`cierres.${i}`, `Cierres ${m}`, { min: 0, max: 200, entero: true })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Tarjeta>

      <Tarjeta titulo="Ajustes generales">
        <div className="grid gap-3 sm:grid-cols-3">
          <Campo etiqueta="Ajuste general" ayuda="Sube o baja todos los kilos del año (-0.05 = 5% menos)">
            {n('ajuste', 'Ajuste general', { min: -0.9, max: 2 }, { clase: claseCampo })}
          </Campo>
          <Campo
            etiqueta="Volumen a comprometer"
            ayuda="Parte del pronóstico que se compromete con el proveedor"
          >
            {n('comprometer', 'Volumen a comprometer', { min: 0, max: 1 }, { clase: claseCampo })}
          </Campo>
          <Campo etiqueta="Compra estimada del año anterior (kg)">
            {n(
              'compra_ant',
              'Compra del año anterior',
              { min: 0, max: 1e8, entero: true },
              { clase: claseCampo },
            )}
          </Campo>
        </div>
        <p className="mb-2 mt-4 text-sm font-bold">Curva de compra por sucursal (kg al mes), meses 2 a 6</p>
        <div className="flex flex-wrap gap-2">
          {b.curva.map((_: number, j: number) => (
            <label key={j} className="grid gap-1 text-xs text-ink-2">
              Mes {j + 2}
              {n(`curva.${j}`, `Curva mes ${j + 2}`, { min: 0, max: 1000 })}
            </label>
          ))}
        </div>
        <p className="mb-2 mt-4 text-sm font-bold">Estacionalidad (índice por mes calendario)</p>
        <div className="flex flex-wrap gap-2">
          {MESES_ABR.map((m, j) => (
            <label key={m} className="grid gap-1 text-xs text-ink-2">
              {m}
              {n(
                `estacionalidad.${j}`,
                `Estacionalidad ${m}`,
                { min: 0, max: 10 },
                { clase: `${chico} w-14` },
              )}
            </label>
          ))}
        </div>
      </Tarjeta>

      <Tarjeta
        titulo="Mezcla y precios por presentación"
        descripcion="Mezcla: parte de los kilos en cada presentación (debe sumar 1). Precio nuevo vacío = usa el vigente."
      >
        <div className="overflow-x-auto">
          <table className="tabla max-w-4xl">
            <thead>
              <tr>
                <th>Presentación</th>
                <th className="text-right">Mezcla</th>
                <th className="text-right">Café vigente $/kg</th>
                <th className="text-right">Empaque vigente</th>
                <th className="text-right">Precio de venta</th>
                <th className="text-right">Café nuevo $/kg</th>
                <th className="text-right">Empaque nuevo</th>
              </tr>
            </thead>
            <tbody>
              {CAFE_PROD.map((x) => {
                const P = `prod.${x.id}.`;
                return (
                  <tr key={x.id}>
                    <td className="font-semibold">{x.nombre}</td>
                    <td className="text-right">
                      {n(P + 'mezcla', `Mezcla ${x.nombre}`, { min: 0, max: 1 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'precio', `Precio ${x.nombre}`, { min: 0, max: 1e5 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'empaque', `Empaque ${x.nombre}`, { min: 0, max: 1e4 })}
                    </td>
                    <td className="text-right">
                      {n(P + 'venta', `Venta ${x.nombre}`, { min: 0, max: 1e5 })}
                    </td>
                    <td className="text-right">
                      {n(
                        P + 'nuevo_precio',
                        `Precio nuevo ${x.nombre}`,
                        { min: 0, max: 1e5, nulo: true },
                        { ph: 'vigente' },
                      )}
                    </td>
                    <td className="text-right">
                      {n(
                        P + 'nuevo_empaque',
                        `Empaque nuevo ${x.nombre}`,
                        { min: 0, max: 1e4, nulo: true },
                        { ph: 'vigente' },
                      )}
                    </td>
                  </tr>
                );
              })}
              <tr>
                <td className="font-bold">Suma de la mezcla</td>
                <td
                  className={`text-right font-bold tabular-nums ${Math.abs(suma - 1) > 0.0005 ? 'text-bad' : ''}`}
                >
                  {Math.round(suma * 1000) / 1000}
                </td>
                <td colSpan={5} />
              </tr>
            </tbody>
          </table>
        </div>
      </Tarjeta>
    </div>
  );
}
