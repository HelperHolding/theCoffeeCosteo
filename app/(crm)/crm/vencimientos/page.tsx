import Link from 'next/link';
import { sesionCrm } from '@/lib/supabase/sesion';
import { vencimientos } from '@/lib/crm/unificado/consultas';
import { usuarioCrm } from '@/lib/crm/unificado/usuario';
import { AREAS } from '@/lib/crm/unificado/modelo';
import { Encabezado, Tarjeta, Vacio } from '@/components/portal/piezas';
import { BandejaAvisos } from '@/components/crm/unificado/avisos';

const TIPO: Record<string, string> = {
  cof: 'COF firmada',
  apertura_5_habiles: '5 días hábiles antes de abrir',
  limite_120: 'Límite de apertura',
  cof_tardia: 'COF tardía',
};
const mes = new Intl.DateTimeFormat('es-MX', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dia = new Intl.DateTimeFormat('es-MX', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  timeZone: 'UTC',
});

/** Fechas clave de las sucursales: COF, 5 días hábiles (con festivos) y límite de 120 días. */
export default async function Vencimientos() {
  const { db, perfil, accesos } = await sesionCrm();
  // Genera los avisos que ya entraron en su ventana (idempotente; pg_cron lo hace a diario).
  await db.rpc('crm_generar_avisos', {});
  const [usuario, { vencimientos: lista, avisos }] = await Promise.all([
    usuarioCrm(db, perfil, accesos),
    vencimientos(db),
  ]);
  const grupos = new Map<string, typeof lista>();
  for (const v of lista) {
    const k = mes.format(new Date(`${v.fecha}T00:00:00Z`));
    grupos.set(k, [...(grupos.get(k) ?? []), v]);
  }
  return (
    <>
      <Encabezado
        area="CRM Franquicias"
        titulo="Vencimientos"
        descripcion="Cuándo hay que actuar en cada sucursal. Los días hábiles saltan fines de semana y festivos."
      />
      <Tarjeta titulo="Avisos sin atender" cuerpo={false}>
        <BandejaAvisos
          avisos={avisos.filter((a) => !a.atendido_en)}
          areas={usuario.areas}
          todas={usuario.desarrollador || usuario.esHead}
        />
      </Tarjeta>
      {lista.length === 0 ? (
        <Tarjeta cuerpo={false}>
          <Vacio titulo="Sin fechas por vigilar">
            Aparecen cuando una sucursal tiene fecha estimada, confirmada o límite de apertura.
          </Vacio>
        </Tarjeta>
      ) : (
        [...grupos.entries()].map(([nombre, vs]) => (
          <Tarjeta key={nombre} titulo={nombre[0].toUpperCase() + nombre.slice(1)} cuerpo={false}>
            <ul role="list" className="divide-y divide-line">
              {vs.map((v) => (
                <li
                  key={`${v.tipo}-${v.tienda_id}`}
                  className="grid gap-1 px-5 py-3 text-sm sm:grid-cols-[8rem_minmax(0,1fr)_auto] sm:items-center sm:gap-4"
                >
                  <span className="font-semibold tabular">
                    {dia.format(new Date(`${v.fecha}T00:00:00Z`))}
                  </span>
                  <span className="min-w-0">
                    <Link href={`/crm/sucursales/${v.tienda_id}`} className="font-medium hover:underline">
                      {v.nombre}
                    </Link>
                    <span className="block text-xs text-muted-foreground">
                      {TIPO[v.tipo]} ·{' '}
                      <span className="inline-flex items-center gap-1">
                        <span
                          aria-hidden="true"
                          className="size-1.5 rounded-full"
                          style={{ background: AREAS[v.area].color }}
                        />
                        {AREAS[v.area].nombre}
                      </span>
                    </span>
                  </span>
                  <span
                    className={
                      v.dias < 0
                        ? 'text-xs font-semibold text-bad'
                        : v.dias <= 7
                          ? 'text-xs font-semibold text-warn'
                          : 'text-xs text-muted-foreground'
                    }
                  >
                    {v.dias < 0 ? `Venció hace ${-v.dias} d` : v.dias === 0 ? 'Hoy' : `En ${v.dias} d`}
                  </span>
                </li>
              ))}
            </ul>
          </Tarjeta>
        ))
      )}
    </>
  );
}
