import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { DescargarExcel } from '@/components/comercializadora/descargar-excel';
import { SeccionPlan, hrefPlan } from '@/components/comercializadora/vistas-plan';
import {
  AvisosPlanSem,
  BarraSem,
  CifrasSem,
  ComoSeLee,
  FamiliasSem,
  GraficaSem,
  QueTrae,
  RUTA_PLAN,
  SeguimientoVentas,
  TablaArtsSem,
  TablaProvsSem,
  TarjetasCategorias,
} from '@/components/comercializadora/plan-abastos';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import {
  cafeOrdenesMotor,
  importacionesMotor,
  motorPlan,
  planLocalMotor,
} from '@/lib/comercializadora/motor';
import { ocGrupoSem, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import { libroPlanAbastos } from '@/lib/comercializadora/excelPlan';
import {
  familiasSem,
  fuenteCant,
  planSemCalc,
  planSemW,
  psemPasadas,
  type FuentesPlan,
  graficaSem,
  hoyTxt,
  incDe,
  kpisSem,
  opcionesSemanas,
  provOpciones,
  provValido,
  PSEM_CATS,
  queTrae,
  seguimientoSem,
  tablaArts,
  tablaProvs,
  tarjetasCat,
  vistaSemDe,
  semanasValidas,
} from '@/lib/comercializadora/planAbastos';

type Sp = Record<string, string | undefined>;

/**
 * Plan de abastos (renderComPlanSemanal): el dinero que hay que disponer cada semana para lo local, el café y las
 * importaciones, de dónde sale y qué proveedor lo pide. Solo lee; "Crear OC" abre Órdenes prellenado.
 */
export default async function PlanAbastosPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1',
    simple = !det;
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Plan de abastos"
      descripcion="Cuánto dinero hay que disponer cada semana para comprar lo local, el café y las importaciones, y a qué proveedores."
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
  const c = planLocalMotor(m);
  const inc = incDe(sp.sin),
    Wv = semanasValidas(c, sp.sem),
    vista = vistaSemDe(sp.vista);
  const f: FuentesPlan = { cafe: null, imp: null };
  const S = planSemCalc(c, inc, Wv, {
    cafe: () => (f.cafe = cafeOrdenesMotor(m)),
    imp: () => (f.imp = importacionesMotor(m, null)),
  });
  const q = sp.q ?? '',
    prov = provValido(S, sp.prov);
  const params: Sp = {
    det: det ? '1' : undefined,
    sin: sp.sin || undefined,
    // Solo el valor aceptado viaja en los enlaces (revisión 3f, I1).
    sem: Wv !== planSemW(c, 0) ? String(Wv) : undefined,
    vista: vista === 'articulo' ? vista : undefined,
    q: q || undefined,
    prov: prov || undefined,
  };
  const pas = psemPasadas(c, m.R),
    hoy = hoyTxt(S, c);
  const ocs: Record<string, PrellenadoOc | { error: string }> = {};
  if (puedeEditarCom(accesos))
    S.provs.forEach((g) => {
      if (g.real && g.n[0] > 0) ocs[g.key] = ocGrupoSem(g, { local: c, cafe: f.cafe, imp: f.imp });
    });
  const fam = familiasSem(S, Wv, m.R.cat);
  const cats = PSEM_CATS.filter((d) => inc[d.id]);
  const detalle = (
    <>
      <BarraSem
        params={params}
        vista={vista}
        q={q}
        prov={prov}
        Wv={Wv}
        semanas={opcionesSemanas(c)}
        proveedores={provOpciones(S)}
      />
      {vista === 'articulo' ? (
        <TablaArtsSem filas={tablaArts(S, Wv, q, prov)} c={c} Wv={Wv} />
      ) : (
        <TablaProvsSem
          t={tablaProvs(S, inc, Wv, q, prov)}
          c={c}
          Wv={Wv}
          ocs={ocs}
          hayCategorias={cats.length > 0}
        />
      )}
      <div className="mt-4">
        <SeguimientoVentas s={seguimientoSem(c.bt)} />
      </div>
      <ComoSeLee c={c} imp={f.imp?.cfg.imp.politica ?? { meses_cobertura: 0, meses_respaldo: 0 }} />
    </>
  );
  return (
    <>
      {encabezado}
      <AvisosPlanSem fuente={fuenteCant(c, m.R, Date.now())} lecturas={m.R.avisos} simple={simple} />
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <Link href="/comercializadora/esta-semana" className="text-sm font-semibold underline">
          Ver lo de esta semana
        </Link>
        <span className="flex-1" />
        <DescargarExcel libro={libroPlanAbastos(S, c, pas, inc)} />
        <Link
          href={hrefPlan(RUTA_PLAN, params, { det: det ? undefined : '1' })}
          className="px-2 py-1.5 text-sm font-semibold underline"
        >
          {det ? 'Vista simple' : 'Ver todo'}
        </Link>
      </div>
      <TarjetasCategorias
        tarjetas={tarjetasCat(S, inc, Wv)}
        inc={inc}
        Wv={Wv}
        simple={simple}
        params={params}
      />
      <CifrasSem k={kpisSem(S, inc, Wv)} c={c} Wv={Wv} simple={simple} />
      {fam ? <FamiliasSem f={fam} Wv={Wv} /> : null}
      <SeccionPlan
        titulo="Compras por semana"
        ayuda={
          <>
            Cuándo sale el dinero (pagos por viernes con los días de crédito):{' '}
            <Link href="/comercializadora/pagos" className="font-semibold underline">
              Ver pagos proyectados
            </Link>
          </>
        }
      >
        <GraficaSem g={graficaSem(S, pas, inc, Wv, c, hoy)} cats={cats} simple={simple} />
        <QueTrae q={queTrae(S, Wv, simple, c, hoy)} simple={simple} />
      </SeccionPlan>
      {simple ? (
        <details className="mb-4" open={!!(params.q || params.prov || params.vista || params.sem)}>
          <summary className="inline-block cursor-pointer rounded-[10px] border border-line px-3 py-1.5 text-sm font-semibold">
            Ver detalle por proveedor y artículo
          </summary>
          <div className="mt-3">{detalle}</div>
        </details>
      ) : (
        detalle
      )}
    </>
  );
}
