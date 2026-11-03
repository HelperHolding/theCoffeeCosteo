import Link from 'next/link';
import { sesionCrm } from '@/lib/supabase/sesion';
import { armarCards, etapasGenerales, vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado, Tarjeta } from '@/components/portal/piezas';
import { TablaCards } from '@/components/crm/unificado/pipeline';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';
import type { CandadoCard, ClaveArea, Cumplimiento, Requisito } from '@/lib/crm/tipos';

const MAX = 50;

/** Lo que le toca al usuario o a su área, por urgencia: avisos, validaciones y cards por mover. */
export default async function MisPendientes() {
  const { db, perfil, accesos } = await sesionCrm();
  const [usuario, etapas, { avisos, vencimientos: venc }] = await Promise.all([
    usuarioCrm(db, perfil, accesos),
    etapasGenerales(db),
    vencimientos(db),
  ]);
  const todas = usuario.desarrollador || usuario.esHead;
  const mias = (a: ClaveArea) => todas || usuario.areas.includes(a === 'finanzas' ? 'ventas' : a);
  const misEtapas = etapas.filter((e) => e.tipo === 'abierta' && mias(e.area)).map((e) => e.id);

  const [porValidar, candados, propias] = await Promise.all([
    db.from('crm_cumplimientos').select('*').eq('estado', 'cumplido').order('cumplido_en').limit(200),
    misEtapas.length
      ? db.from('crm_v_candados').select('*').in('etapa_id', misEtapas).limit(5000)
      : Promise.resolve({ data: [] as CandadoCard[] }),
    db
      .from('crm_franquiciatarios')
      .select('id')
      .eq('responsable_id', perfil.user_id)
      .is('archivado_en', null)
      .is('formalizado_en', null)
      .order('actualizado_en', { ascending: false })
      .limit(MAX),
  ]);
  const cumplidos = (porValidar.data ?? []) as Cumplimiento[];
  const requisitos = cumplidos.length
    ? (((
        await db
          .from('crm_requisitos')
          .select('*')
          .in('id', [...new Set(cumplidos.map((c) => c.requisito_id))])
      ).data ?? []) as Requisito[])
    : [];
  const reqDe = new Map(requisitos.map((r) => [r.id, r]));
  const aValidar = cumplidos.filter((c) => {
    const r = reqDe.get(c.requisito_id);
    return r && mias(r.area_valida);
  });
  const cs = (candados.data ?? []) as CandadoCard[];
  const listas = cs.filter((c) => c.liberado || c.listos >= c.total).slice(0, MAX);
  const bloqueadas = cs.filter((c) => !c.liberado && c.listos < c.total);
  const [cardsListas, cardsValidar, cardsPropias] = await Promise.all([
    armarCards(
      db,
      listas.map((c) => ({ id: c.card_id, tipo: c.tipo_card })),
    ),
    armarCards(
      db,
      aValidar
        .slice(0, MAX)
        .map((c) => ({ id: c.card_id, tipo: c.franquiciatario_id ? 'franquiciatario' : 'sucursal' })),
    ),
    armarCards(
      db,
      ((propias.data ?? []) as { id: string }[]).map((x) => ({ id: x.id, tipo: 'franquiciatario' as const })),
    ),
  ]);
  const misAvisos = avisos.filter((a) => !a.atendido_en && mias(a.area));
  const vencidos = venc.filter((v) => v.dias <= 7 && mias(v.area)).slice(0, 20);
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Mis pendientes"
        descripcion={
          todas
            ? 'Vista de head o desarrollador: pendientes de todas las áreas.'
            : `Lo que le toca a ${usuario.areas.map((a) => a[0].toUpperCase() + a.slice(1)).join(' y ') || 'tu área'}, por urgencia.`
        }
      />
      <Tarjeta
        titulo="Avisos sin atender"
        descripcion="COF a 2 meses, 5 días hábiles antes de abrir y límite de 120 días."
        cuerpo={false}
      >
        <BandejaAvisos avisos={misAvisos} areas={usuario.areas} todas={todas} />
      </Tarjeta>
      {vencidos.length > 0 && (
        <Tarjeta titulo="Vencen en 7 días o ya vencieron" cuerpo={false}>
          <ul role="list" className="divide-y divide-line">
            {vencidos.map((v) => (
              <li
                key={`${v.tipo}-${v.tienda_id}`}
                className="flex flex-wrap justify-between gap-2 px-5 py-3 text-sm"
              >
                <Link href={`/crm/sucursales/${v.tienda_id}`} className="hover:underline">
                  {v.mensaje}
                </Link>
                <span className={v.dias < 0 ? 'font-semibold text-bad' : 'text-warn'}>
                  {v.dias < 0 ? `venció hace ${-v.dias} d` : v.dias === 0 ? 'hoy' : `en ${v.dias} d`}
                </span>
              </li>
            ))}
          </ul>
        </Tarjeta>
      )}
      <section className="space-y-2">
        <h2 className="placa inline-block px-3 py-1.5 text-sm">Requisitos por validar ({aValidar.length})</h2>
        <TablaCards cards={cardsValidar} etapas={etapas} />
      </section>
      <section className="space-y-2">
        <h2 className="placa inline-block px-3 py-1.5 text-sm">
          Listas para avanzar en etapas de mi área ({listas.length}) · bloqueadas:{' '}
          {bloqueadas.length.toLocaleString('es-MX')}
        </h2>
        <TablaCards cards={cardsListas} etapas={etapas} />
      </section>
      <section className="space-y-2">
        <h2 className="placa inline-block px-3 py-1.5 text-sm">
          Mis leads como vendedor ({cardsPropias.length})
        </h2>
        <TablaCards cards={cardsPropias} etapas={etapas} />
      </section>
    </>
  );
}
