import { after } from 'next/server';
import { sesionCrm } from '@/lib/supabase/sesion';
import { nombres, vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { Encabezado } from '@/components/portal/piezas';
import { VistaVencimientos } from '@/components/crm/unificado/vistas/vencimientos';

/** Fechas clave de las sucursales: COF, 5 días hábiles (con festivos) y límite de 120 días. */
export default async function Vencimientos() {
  const { db, perfil, accesos } = await sesionCrm();
  // Genera los avisos que ya entraron en su ventana (idempotente; pg_cron lo hace a diario). Después de responder,
  // para no frenar la página: lo nuevo aparece en la siguiente visita.
  after(async () => {
    await db.rpc('crm_generar_avisos', {});
  });
  const [usuario, { vencimientos: lista, avisos }] = await Promise.all([
    usuarioCrm(db, perfil, accesos),
    vencimientos(db),
  ]);
  const atendidos = avisos
    .filter((a) => a.atendido_en)
    .sort((a, b) => b.atendido_en!.localeCompare(a.atendido_en!))
    .slice(0, 30);
  const quienes = await nombres(
    db,
    atendidos.map((a) => a.atendido_por),
  );
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Vencimientos"
        descripcion="Cuándo hay que actuar en cada sucursal. Los días hábiles saltan fines de semana y festivos."
      />
      <VistaVencimientos
        lista={lista}
        avisos={avisos.filter((a) => !a.atendido_en)}
        atendidos={atendidos.map((a) => ({
          ...a,
          quien: a.atendido_por ? (quienes.get(a.atendido_por) ?? null) : null,
        }))}
        areas={usuario.areas}
        todas={usuario.desarrollador || usuario.esHead}
      />
    </>
  );
}
