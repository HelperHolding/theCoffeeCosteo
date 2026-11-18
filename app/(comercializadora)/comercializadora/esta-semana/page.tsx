import Link from 'next/link';
import { Encabezado } from '@/components/portal/piezas';
import { ActualizarMotor } from '@/components/comercializadora/actualizar-motor';
import { hrefPlan } from '@/components/comercializadora/vistas-plan';
import { AvisosPlanSem } from '@/components/comercializadora/plan-abastos';
import {
  BorradoresSemana,
  ProveedoresSemana,
  RiesgosSemana,
  TarjetasSemana,
} from '@/components/comercializadora/esta-semana';
import { sesionComercializadora } from '@/lib/supabase/sesion';
import { puedeEditarCom } from '@/lib/portal/modulos';
import {
  cafeOrdenesMotor,
  importacionesMotor,
  motorPlan,
  planLocalMotor,
} from '@/lib/comercializadora/motor';
import { ocGrupoSem, type PrellenadoOc } from '@/lib/comercializadora/crearOc';
import {
  etiquetaSem,
  fuenteCant,
  planSemCalc,
  planSemW,
  type FuentesPlan,
} from '@/lib/comercializadora/planAbastos';
import {
  borrAnalisis,
  borrFuenteZoho,
  creditoProv,
  ctxFila,
  filasSemana,
  hoyRiesgos,
  pagosSemana,
  riesgosVista,
  semHoyDe,
  tarjetasSemana,
  type Credito,
} from '@/lib/comercializadora/estaSemana';
import { dinero } from '@/lib/comercializadora/importaciones';

type Sp = Record<string, string | undefined>;
const RUTA = '/comercializadora/esta-semana';
const TODAS = { local: true, cafe: true, imp: true };

/**
 * Esta semana (renderComHoy): lo que hay que ordenar esta semana o la próxima de las tres categorías, por proveedor, con
 * el dinero, el viernes de pago, el mínimo, los riesgos de quedarse sin producto y los borradores de Zoho por resolver.
 */
export default async function EstaSemanaPagina({ searchParams }: { searchParams: Promise<Sp> }) {
  const { db, accesos } = await sesionComercializadora();
  const sp = await searchParams;
  const det = sp.det === '1',
    simple = !det,
    k = semHoyDe(sp.sem);
  const params: Sp = { det: det ? '1' : undefined, sem: k ? '1' : undefined };
  const m = await motorPlan(db);
  const encabezado = (
    <Encabezado
      area="Comercializadora"
      titulo="Esta semana"
      descripcion="Lo que hay que ordenar de todo lo local, el café y las importaciones: a qué proveedor, cuánto dinero, cuándo se paga y qué se quedaría sin producto."
    >
      <ActualizarMotor />
    </Encabezado>
  );
  if (!m.ok)
    return (
      <>
        {encabezado}
        <p role="alert" className="rounded-lg bg-bad-soft px-3 py-2 text-sm text-bad">
          {m.error}{' '}
          <Link href="/comercializadora/ordenes" className="font-semibold underline">
            Ir a Órdenes de compra
          </Link>
        </p>
      </>
    );
  const c = planLocalMotor(m);
  const f: FuentesPlan = { cafe: null, imp: null };
  const fuentes = {
    cafe: () => (f.cafe = cafeOrdenesMotor(m)),
    imp: () => (f.imp = importacionesMotor(m, null)),
  };
  const S = planSemCalc(c, TODAS, planSemW(c, 0), fuentes);
  const credito: Credito = (g) =>
    creditoProv(g, { local: c.vendorDe, cafe: f.cafe?.vendorDe ?? null }, m.R.zprov);
  const filas = filasSemana(S, k, c, c.hoyIso, credito);
  const pagos = pagosSemana(filas, k, c, c.hoyIso, credito);
  const ocs: Record<string, PrellenadoOc | { error: string }> = {};
  if (k === 0 && puedeEditarCom(accesos))
    filas.forEach(({ g }) => {
      if (g.real && g.n[0] > 0) ocs[g.key] = ocGrupoSem(g, { local: c, cafe: f.cafe, imp: f.imp });
    });
  const borr = borrAnalisis(S, borrFuenteZoho(m.R), c.hoyIso);
  const boton = (s: 0 | 1, t: string) => (
    <Link
      href={hrefPlan(RUTA, params, { sem: s ? '1' : undefined })}
      aria-current={k === s ? 'page' : undefined}
      className={`rounded-[10px] border px-3 py-1.5 text-sm ${k === s ? 'border-ink font-bold' : 'border-line text-ink-2'}`}
    >
      {t}
    </Link>
  );
  return (
    <>
      {encabezado}
      <AvisosPlanSem fuente={fuenteCant(c, m.R, Date.now())} lecturas={m.R.avisos} simple={simple} />
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <nav aria-label="Semana" className="flex gap-1.5">
          {boton(0, 'Esta semana')}
          {boton(1, 'Próxima semana')}
        </nav>
        <span className="flex-1" />
        <Link href="/comercializadora/plan-abastos" className="text-sm font-semibold underline">
          Ver el plan de {c.W} semanas
        </Link>
        <Link
          href={hrefPlan(RUTA, params, { det: det ? undefined : '1' })}
          className="px-2 py-1.5 text-sm font-semibold underline"
        >
          {det ? 'Vista simple' : 'Ver todo'}
        </Link>
      </div>
      <TarjetasSemana
        t={tarjetasSemana(S, k, filas)}
        k={k}
        simple={simple}
        rango={c.W ? etiquetaSem(c, k, true) : ''}
      />
      {pagos.length ? (
        <p className="mb-3 text-sm text-ink-2">
          Estas compras se pagan:{' '}
          {pagos.map((p, i) => (
            <span key={p.f}>
              {i ? ' · ' : ''}
              <b>{p.txt}</b> {dinero(p.m)}
            </span>
          ))}
        </p>
      ) : null}
      <ProveedoresSemana filas={filas} k={k} simple={simple} ocs={ocs} ctx={(r) => ctxFila(r, k)} />
      <RiesgosSemana v={riesgosVista(hoyRiesgos(c, fuentes), simple)} simple={simple} />
      {borr ? <BorradoresSemana A={borr} simple={simple} /> : null}
      {simple ? null : (
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          Esta pantalla junta lo que toca pedir en <b>Todo lo demás</b>, <b>Café</b> e <b>Importaciones</b>{' '}
          (cada una se calcula con su método). Clic en un proveedor para ver qué hay que pedirle. &quot;Copiar
          pedido&quot; deja la lista en el portapapeles para mandarla al proveedor; &quot;Crear OC&quot; abre
          la orden de compra con esas cantidades.
        </p>
      )}
    </>
  );
}
