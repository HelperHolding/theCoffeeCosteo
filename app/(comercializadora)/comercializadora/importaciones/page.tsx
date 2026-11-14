import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SelectorEscenario } from '@/components/comercializadora/selector-escenario';
import { ParametrosImp } from '@/components/comercializadora/parametros-imp-cafe';
import { AvisosPlan, NavVistas } from '@/components/comercializadora/vistas-plan';
import {
  ContenedoresImp,
  DetalleImp,
  KpisImp,
  ProyeccionImp,
  PuenteImp,
  QuePedirImp,
  ResumenImp,
} from '@/components/comercializadora/importaciones';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import { importacionesMotor, motorPlan } from '@/lib/comercializadora/motor';
import {
  avisosImp,
  cuandoDe,
  escImp,
  VISTAS_IMP,
  VISTAS_IMP_SIMPLE,
  vistaImp,
} from '@/lib/comercializadora/importaciones';
import { libroImportaciones } from '@/lib/comercializadora/excelImpCafe';
import { contextoParamsImp } from '@/lib/comercializadora/paramsContexto';
import { IMP_ESCS } from '@/lib/comercializadora/paramsImpCafe';

type Sp = Record<string, string | undefined>;

/** Importaciones (renderComImportaciones): el modelo de la Sheet de importados con los datos del plan del servidor. */
export default async function ImportacionesPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1';
  const vista = vistaImp(sp.vista, det);
  const esc = escImp(sp.esc);
  const params: Sp = { vista, esc: esc ?? undefined, det: det ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Importaciones"
      descripcion="El modelo de tu Sheet de importados (escenarios, contenedores y compra puente) con el inventario, las OCs y las aperturas de la plataforma."
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
  const c = importacionesMotor(m, esc);
  const editable = puedeEditarCom(accesos);
  const nav = (
    <NavVistas
      ruta="/comercializadora/importaciones"
      vistas={det ? VISTAS_IMP : VISTAS_IMP_SIMPLE}
      activa={vista}
      params={params}
    />
  );
  const lecturas = m.R.avisos.length ? (
    <p role="status" className="mb-4 rounded-lg bg-warn-soft px-3 py-2 text-sm text-warn">
      No se pudieron leer: {m.R.avisos.join(', ')}. El cálculo puede salir distinto.
    </p>
  ) : null;
  if (vista === 'params')
    return (
      <>
        {encabezado}
        {nav}
        <ParametrosImp
          imp={c.cfg.imp}
          version={m.version}
          editable={editable}
          esc={c.esc}
          ctx={contextoParamsImp(c, m.R)}
        />
      </>
    );
  if (!c.S)
    return (
      <>
        {encabezado}
        {nav}
        <p role="alert" className="rounded-lg bg-surface-2 px-4 py-3 text-sm text-ink-2">
          {c.err || 'No se pudo calcular.'} Revisa los parámetros.
        </p>
      </>
    );
  const avisos = avisosImp(c, m.R);
  const libro = libroImportaciones(c);
  if (vista === 'ahora')
    return (
      <>
        {encabezado}
        {lecturas}
        {nav}
        <div className="mb-3 flex justify-end">
          <DescargarExcel libro={libro} />
        </div>
        <QuePedirImp
          c={c}
          cuando={cuandoDe(sp.cuando)}
          soloAcc={sp.todos !== '1'}
          simple={!det}
          editable={editable}
          params={{ ...params, cuando: sp.cuando, todos: sp.todos }}
        />
        {det ? <AvisosPlan avisos={avisos} plegado /> : null}
      </>
    );
  const escenarios = IMP_ESCS.map((k): [string, string] => {
    const e = c.cfg.imp.escenarios[k];
    return [k, `${k} (${Math.round(e.crec * 100)}% crec. · ${Math.round(e.cumpl * 100)}% aperturas)`];
  });
  return (
    <>
      {encabezado}
      {lecturas}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <SelectorEscenario opciones={escenarios} valor={c.esc} />
        <span className="flex-1" />
        <DescargarExcel libro={libro} />
      </div>
      <KpisImp c={c} />
      <AvisosPlan avisos={avisos} />
      {nav}
      {vista === 'pedir' ? (
        <DetalleImp c={c} q={sp.q ?? ''} prov={sp.prov ?? ''} soloAcc={sp.solo === '1'} params={params} />
      ) : vista === 'embarques' ? (
        <ContenedoresImp c={c} />
      ) : vista === 'proyeccion' ? (
        <ProyeccionImp c={c} />
      ) : vista === 'puente' ? (
        <PuenteImp c={c} />
      ) : (
        <ResumenImp c={c} />
      )}
    </>
  );
}
