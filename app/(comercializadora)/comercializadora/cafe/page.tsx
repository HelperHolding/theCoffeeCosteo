import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SelectorEscenario } from '@/components/comercializadora/selector-escenario';
import { ParametrosCafe } from '@/components/comercializadora/parametros-imp-cafe';
import { AvisosPlan, NavVistas } from '@/components/comercializadora/vistas-plan';
import {
  KpisCafe,
  MensualCafe,
  PreciosCafe,
  QuePedirCafe,
  ResumenCafe,
} from '@/components/comercializadora/cafe';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { leerTodoCom } from '@/lib/comercializadora/consultas';
import { cafeMotor, cafeOrdenesMotor, motorPlan } from '@/lib/comercializadora/motor';
import { avisosCafe, escCafe, VISTAS_CAFE, VISTAS_CAFE_SIMPLE, vistaCafe } from '@/lib/comercializadora/cafe';
import { cuandoDe, nf } from '@/lib/comercializadora/importaciones';
import { libroCafe } from '@/lib/comercializadora/excelImpCafe';
import { contextoParamsCafe } from '@/lib/comercializadora/paramsContexto';
import { CAFE_ESCS } from '@/lib/comercializadora/paramsImpCafe';

type Sp = Record<string, string | undefined>;

/** Café (renderComCafe): Qué pedir con el plan de abasto y la proyección del año con el modelo de la Sheet de café. */
export default async function CafePagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1';
  const vista = vistaCafe(sp.vista, det);
  const esc = escCafe(sp.esc);
  const params: Sp = { vista, esc: esc ?? undefined, det: det ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Café"
      descripcion="Qué pedir de café tostado con el mismo cálculo del plan de abasto, y la compra del año con el modelo de tu Sheet de café."
    >
      <ActualizarMotor />
    </Encabezado>
  );
  if (!m.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {m.error}
        </p>
      </>
    );
  const editable = puedeEditarCom(accesos);
  const nav = (
    <NavVistas
      ruta="/comercializadora/cafe"
      vistas={det ? VISTAS_CAFE : VISTAS_CAFE_SIMPLE}
      activa={vista}
      params={params}
    />
  );
  const lecturas = m.R.avisos.length ? (
    <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
    </p>
  ) : null;
  if (vista === 'pedir') {
    const o = cafeOrdenesMotor(m);
    // Mínimo y máximo de la simulación (R.mm del viejo) de los artículos con cantidades del servidor (con compra.excluir_cafe
    // = false): solo explica la regla en "Por qué"; si falla, "Por qué" usa el texto general.
    let mm: Record<string, { minimo: number | null; maximo: number | null }> | null = null;
    const delServidor = o.rows.filter((r) => r.calc.fuente === 'servidor').map((r) => r.sku);
    if (delServidor.length) {
      try {
        const filas = await leerTodoCom<{ sku: string; minimo: number | null; maximo: number | null }>(
          db,
          'com_minmax',
          'sku,minimo,maximo',
          'sku',
          (q) =>
            q.in(
              'sku',
              o.rows.map((r) => r.sku),
            ),
        );
        mm = Object.fromEntries(filas.map((x) => [x.sku, { minimo: x.minimo, maximo: x.maximo }]));
      } catch {
        mm = null;
      }
    }
    return (
      <>
        {encabezado}
        {lecturas}
        {nav}
        <QuePedirCafe
          c={o}
          cuando={cuandoDe(sp.cuando)}
          soloAcc={sp.todos !== '1'}
          simple={!det}
          editable={editable}
          mm={mm}
          srvCalc={m.R.srv?.calc ?? null}
          params={{ ...params, cuando: sp.cuando, todos: sp.todos }}
        />
      </>
    );
  }
  const c = cafeMotor(m, esc);
  if (vista === 'params')
    return (
      <>
        {encabezado}
        {nav}
        <ParametrosCafe
          cafe={c.cfg.cafe}
          version={m.version}
          editable={editable}
          ctx={contextoParamsCafe(c)}
        />
      </>
    );
  const escenarios = CAFE_ESCS.map((k): [string, string] => {
    const e = c.cfg.cafe.escenarios[k];
    return [k, `${k} (${Math.round(e.crec * 100)}% crec. · ${nf(e.madura)} kg por sucursal)`];
  });
  return (
    <>
      {encabezado}
      {lecturas}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SelectorEscenario opciones={escenarios} valor={c.esc} />
        <span className="flex-1" />
        <DescargarExcel libro={libroCafe(c)} />
      </div>
      {c.R ? (
        <>
          <KpisCafe c={c} />
          <AvisosPlan avisos={avisosCafe(c, m.R)} />
        </>
      ) : null}
      {nav}
      {!c.R ? (
        <p role="alert" className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {c.err || 'No se pudo calcular.'} Revisa los parámetros.
        </p>
      ) : vista === 'mensual' ? (
        <MensualCafe c={c} />
      ) : vista === 'precios' ? (
        <PreciosCafe c={c} />
      ) : (
        <ResumenCafe c={c} />
      )}
    </>
  );
}
