import { AREAS } from '@/lib/crm/unificado/modelo';
import { Pestanas } from '@/components/portal/pestanas';
import { Avatar, PanelCifras } from '@/components/crm/unificado/piezas';
import type { ClaveArea, Membresia } from '@/lib/crm/tipos';

const ROL: Record<string, string> = { head: 'Head', miembro: 'Miembro', lectura: 'Solo lectura' };

/** Administración en pestañas, con un resumen de equipos por área arriba. */
export function VistaAdmin({
  personas,
  membresias,
  requisitosActivos,
  requisitosTotal,
  festivosAnio,
  usuarios,
  requisitos,
  festivos,
  pestana,
}: {
  personas: { user_id: string; nombre: string }[];
  membresias: Membresia[];
  requisitosActivos: number;
  requisitosTotal: number;
  festivosAnio: number;
  usuarios: React.ReactNode;
  requisitos: React.ReactNode;
  festivos: React.ReactNode;
  pestana?: string;
}) {
  const nombre = new Map(personas.map((p) => [p.user_id, p.nombre]));
  const sinArea = personas.filter((p) => !membresias.some((m) => m.user_id === p.user_id)).length;
  return (
    <>
      <PanelCifras
        cifras={[
          { etiqueta: 'Personas con acceso al CRM', valor: personas.length },
          {
            etiqueta: 'Sin área asignada',
            valor: sinArea,
            tono: sinArea ? 'warn' : undefined,
            nota: 'solo pueden consultar',
          },
          {
            etiqueta: 'Requisitos activos',
            valor: requisitosActivos,
            nota: `de ${requisitosTotal} definidos`,
          },
          { etiqueta: 'Festivos este año', valor: festivosAnio, nota: 'para los días hábiles' },
        ]}
      />
      <section aria-label="Equipos por área" className="grid gap-3 md:grid-cols-3">
        {(['ventas', 'legal', 'proyectos'] as ClaveArea[]).map((a) => {
          const ms = membresias
            .filter((m) => m.area === a)
            .sort((x, y) => (x.rol === 'head' ? -1 : y.rol === 'head' ? 1 : 0));
          return (
            <article
              key={a}
              className="relative overflow-hidden rounded-2xl border border-line bg-surface p-4 shadow-card"
            >
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1"
                style={{ background: AREAS[a].color }}
              />
              <h3 className="flex items-center justify-between text-sm font-semibold">
                {AREAS[a].nombre}
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular text-ink-2">
                  {ms.length}
                </span>
              </h3>
              {ms.length ? (
                <ul role="list" className="mt-3 space-y-2">
                  {ms.slice(0, 5).map((m) => (
                    <li key={m.user_id} className="flex items-center gap-2.5">
                      <Avatar
                        nombre={nombre.get(m.user_id) ?? 'Usuario'}
                        area={m.rol === 'head' ? a : null}
                        tam={28}
                      />
                      <span className="min-w-0 flex-1 truncate text-sm">
                        {nombre.get(m.user_id) ?? 'Usuario'}
                      </span>
                      <span className="shrink-0 text-xs text-muted-foreground">{ROL[m.rol] ?? m.rol}</span>
                    </li>
                  ))}
                  {ms.length > 5 && <li className="text-xs text-muted-foreground">y {ms.length - 5} más</li>}
                </ul>
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">Sin integrantes todavía.</p>
              )}
            </article>
          );
        })}
      </section>
      <Pestanas
        inicial={pestana}
        pestanas={[
          { id: 'usuarios', nombre: 'Usuarios por área', contador: personas.length, contenido: usuarios },
          {
            id: 'requisitos',
            nombre: 'Requisitos por etapa',
            contador: requisitosActivos,
            contenido: requisitos,
          },
          { id: 'festivos', nombre: 'Festivos', contador: festivosAnio, contenido: festivos },
        ]}
      />
    </>
  );
}
