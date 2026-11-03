import { notFound } from 'next/navigation';
import { sesionCrm } from '@/lib/supabase/sesion';
import { expedienteCard } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado } from '@/components/portal/piezas';
import { ExpedienteCard } from './expediente';
import type { Actividad, TipoCard } from '@/lib/crm/tipos';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Página de expediente (servidor) compartida por franquiciatarios y sucursales. */
export async function PaginaExpediente({ tipo, id, tab }: { tipo: TipoCard; id: string; tab?: string }) {
  if (!UUID.test(id)) notFound();
  const { db, perfil, accesos } = await sesionCrm();
  const relacion = tipo === 'franquiciatario' ? 'franquiciatario_id' : 'tienda_id';
  const [e, usuario, actividades] = await Promise.all([
    expedienteCard(db, tipo, id),
    usuarioCrm(db, perfil, accesos),
    db
      .from('crm_actividades')
      .select('*')
      .eq(relacion, id)
      .is('archivado_en', null)
      .order('fecha_vencimiento'),
  ]);
  if (!e || !e.card) notFound();
  const subtitulo =
    tipo === 'franquiciatario'
      ? ['Franquiciatario', e.franquiciatario?.ciudad_interes].filter(Boolean).join(' · ')
      : [e.franquiciatario ? `Sucursal de ${e.franquiciatario.nombre}` : 'Sucursal', e.sucursal?.ciudad]
          .filter(Boolean)
          .join(' · ');
  return (
    <>
      <Encabezado
        titulo={e.card.nombre}
        descripcion={subtitulo}
        migas={[
          { href: '/crm', nombre: 'CRM' },
          { href: '/crm/pipeline', nombre: 'Pipeline' },
          ...(tipo === 'sucursal' && e.franquiciatario
            ? [{ href: `/crm/franquiciatarios/${e.franquiciatario.id}`, nombre: e.franquiciatario.nombre }]
            : []),
        ]}
      />
      <ExpedienteCard
        datos={{ ...e, card: e.card, actividades: (actividades.data ?? []) as Actividad[] }}
        usuario={usuario}
        pestana={tab}
      />
    </>
  );
}
