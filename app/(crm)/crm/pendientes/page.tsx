import { sesionCrm } from '@/lib/supabase/sesion';
import { armarCards, candadosTodos, etapasGenerales, vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado } from '@/components/portal/piezas';
import { VistaPendientes } from '@/components/crm/unificado/vistas/pendientes';
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
  const mias = (a: ClaveArea) => todas || usuario.areas.includes(a);
  // Etapas que piden una función que el usuario no tiene (p. ej. Aprobación de locales): no son suyas.
  const sinFuncion = etapas
    .filter((e) => e.funcionClave && !todas && !usuario.funciones.includes(e.funcionClave))
    .map((e) => e.id);
  const misEtapas = etapas
    .filter((e) => e.tipo === 'abierta' && mias(e.area) && !sinFuncion.includes(e.id))
    .map((e) => e.id);

  const deCarril = todas || usuario.areas.includes('legal');
  const [porValidar, todosCandados, propias, toca] = await Promise.all([
    db.from('crm_cumplimientos').select('*').eq('estado', 'cumplido').order('cumplido_en').limit(200),
    // Una sola lectura completa (sin el tope de 1,000) para mis etapas y para el carril Legal.
    misEtapas.length || deCarril
      ? candadosTodos(db, [
          'card_id',
          'tipo_card',
          'etapa_id',
          'total',
          'listos',
          'liberado',
          'carril_total',
          'carril_listos',
        ] as const)
      : Promise.resolve([]),
    db
      .from('crm_franquiciatarios')
      .select('id')
      .eq('responsable_id', perfil.user_id)
      .is('archivado_en', null)
      .is('formalizado_en', null)
      .order('actualizado_en', { ascending: false })
      .limit(MAX),
    // Te toca registrar: cards cuyo siguiente requisito pendiente lo registra un área mía (incluye Finanzas,
    // que no mueve etapas pero sí confirma pagos).
    usuario.areas.length
      ? db
          .from('crm_v_candados')
          .select('card_id,tipo_card', { count: 'exact' })
          .in('faltante_area', usuario.areas)
          .eq('liberado', false)
          .not('etapa_id', 'in', `(${sinFuncion.join(',') || '00000000-0000-0000-0000-000000000000'})`)
          .range(0, MAX - 1)
      : Promise.resolve({ data: [] as Pick<CandadoCard, 'card_id' | 'tipo_card'>[], count: 0 }),
  ]);
  // Carril Legal (COF y contrato): corre en paralelo a Proyectos, así que no sale en faltante_area.
  const carrilAbierto = deCarril
    ? todosCandados.filter((c) => c.carril_total > 0 && c.carril_listos < c.carril_total)
    : [];
  const enMisEtapas = new Set(misEtapas);
  const tocaIds = new Set(((toca.data ?? []) as Pick<CandadoCard, 'card_id'>[]).map((c) => c.card_id));
  const tocaCarril = carrilAbierto.filter((c) => !tocaIds.has(c.card_id));
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
    return r && mias(r.area_valida) && c.cumplido_por !== perfil.user_id;
  });
  const cs = todosCandados.filter((c) => enMisEtapas.has(c.etapa_id));
  const listas = cs.filter((c) => c.liberado || c.listos >= c.total).slice(0, MAX);
  const bloqueadas = cs.filter((c) => !c.liberado && c.listos < c.total);
  const [cardsListas, cardsValidar, cardsPropias, cardsToca] = await Promise.all([
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
    armarCards(
      db,
      [...((toca.data ?? []) as Pick<CandadoCard, 'card_id' | 'tipo_card'>[]), ...tocaCarril]
        .slice(0, MAX)
        .map((c) => ({ id: c.card_id, tipo: c.tipo_card })),
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
      <VistaPendientes
        etapas={etapas}
        avisos={misAvisos}
        vencidos={vencidos}
        porValidar={cardsValidar}
        totalPorValidar={aValidar.length}
        listas={cardsListas}
        totalListas={cs.filter((c) => c.liberado || c.listos >= c.total).length}
        bloqueadas={bloqueadas.length}
        propias={cardsPropias}
        tocaRegistrar={cardsToca}
        totalTocaRegistrar={(toca.count ?? 0) + tocaCarril.length}
        areas={usuario.areas}
        todas={todas}
        vendedor={todas || usuario.areas.includes('ventas') || cardsPropias.length > 0}
      />
    </>
  );
}
