import Link from 'next/link';
import { cn } from 'cn';
import { contextoSucursal } from '@/lib/franquiciatarios/pagina';
import { baristaElegido, leerBaristas, leerDia } from '@/lib/franquiciatarios/servidor';
import { diaOperacion, esFecha } from '@/lib/franquiciatarios/dia';
import type { SeccionClave } from '@/lib/franquiciatarios/tipos';
import { Encabezado } from '@/components/portal/piezas';
import { Checklist } from '@/components/franquiciatarios/checklist';
import { NombreDeclarado, QuienEres } from '@/components/franquiciatarios/quien-eres';
import { diaLargo } from '@/components/franquiciatarios/formato';
import { ICONO_SECCION, TONO } from '@/components/franquiciatarios/colores';

const CLAVES: SeccionClave[] = ['apertura', 'durante', 'cambio', 'medio', 'cierre'];

export default async function PaginaChecklist({
  params,
  searchParams,
}: {
  params: Promise<{ companyId: string }>;
  searchParams: Promise<{ seccion?: string; dia?: string }>;
}) {
  const c = await contextoSucursal(params);
  const q = await searchParams;
  const hoy = diaOperacion();
  // Solo gerente y franquiciatario consultan días anteriores; la cuenta de baristas, solo hoy.
  const dia = c.gestor && esFecha(q.dia) && q.dia <= hoy ? q.dia : hoy;
  const esHoy = dia === hoy;
  const base = `/franquiciatarios/${c.companyId}`;
  const [estado, baristas] = await Promise.all([
    leerDia(c.db, c.companyId, dia),
    leerBaristas(c.db, c.companyId),
  ]);
  const elegido = c.rol === 'barista' ? await baristaElegido(baristas, c.companyId) : null;
  const encabezado = (
    <Encabezado
      area={c.cfg.nombre}
      titulo="Checklist de turno"
      descripcion={
        <span className="first-letter:uppercase">
          {diaLargo(dia)}
          {esHoy ? ' · hoy' : ' · consulta de un día anterior'}. Todo «No» se explica en Observaciones y se
          comunica.
        </span>
      }
    />
  );
  if (c.rol === 'barista' && !elegido)
    return (
      <>
        {encabezado}
        <QuienEres companyId={c.companyId} nombres={baristas.filter((b) => b.activo)} />
      </>
    );

  // Sección pedida; si no, la primera que no esté completa.
  const pedida = CLAVES.find((k) => k === q.seccion);
  const actual =
    estado.secciones.find((s) => s.clave === pedida) ??
    estado.secciones.find((s) => s.firmasRequeridas.length > 0 && s.estado !== 'completa') ??
    estado.secciones[0];
  const consultaDia = esHoy ? '' : `&dia=${dia}`;

  return (
    <>
      {encabezado}
      {elegido && <NombreDeclarado companyId={c.companyId} nombre={elegido.nombre} />}
      {c.gestor && (
        <form className="flex flex-wrap items-end gap-2" action={`${base}/checklist`}>
          <input type="hidden" name="seccion" value={actual?.clave ?? 'apertura'} />
          <label className="text-sm font-medium text-ink">
            Día de operación
            <input
              type="date"
              name="dia"
              defaultValue={dia}
              max={hoy}
              className="mt-1 block h-10 rounded-[10px] border border-line-strong bg-surface px-3 text-sm text-ink"
            />
          </label>
          <button className="h-10 rounded-[10px] border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:border-ink/40">
            Ver día
          </button>
        </form>
      )}
      {!actual ? (
        <p className="aviso">No hay plantilla de checklist para esta sucursal. Avisa al administrador.</p>
      ) : (
        <>
          <nav aria-label="Secciones del checklist" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {estado.secciones.map((s) => {
              const t = TONO[s.clave];
              const Icono = ICONO_SECCION[s.clave];
              const activa = s.clave === actual.clave;
              return (
                <Link
                  key={s.clave}
                  href={`${base}/checklist?seccion=${s.clave}${consultaDia}`}
                  aria-current={activa ? 'page' : undefined}
                  className={cn(
                    'relative flex min-h-14 flex-col items-center justify-center overflow-hidden rounded-xl border px-3 py-2 text-center text-ink transition-colors focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-crema/45',
                    activa
                      ? cn(t.brillo, t.borde, 'shadow-card')
                      : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span
                    aria-hidden="true"
                    className={cn('absolute inset-x-0 top-0', activa ? 'h-1' : 'h-0.5', t.marca)}
                  />
                  <span className="flex items-center gap-1.5 text-sm font-bold leading-tight">
                    <Icono size={14} aria-hidden="true" className="hidden sm:block" />
                    {s.nombre}
                  </span>
                  <span className="text-xs tabular text-ink-2">
                    {s.firmasRequeridas.length === 0
                      ? s.atrasos > 0
                        ? `${s.atrasos} atrasada${s.atrasos === 1 ? '' : 's'}`
                        : `${s.puntos.reduce((n, p) => n + p.rondas.length, 0)} registros`
                      : s.estado === 'completa'
                        ? 'Completa'
                        : `${s.respondidos}/${s.puntos.length}`}
                    {s.noes > 0 && ` · ${s.noes} No`}
                  </span>
                </Link>
              );
            })}
          </nav>
          <Checklist
            key={`${actual.clave}-${dia}`}
            companyId={c.companyId}
            seccion={actual}
            quien={elegido?.nombre ?? c.perfil.nombre}
            gestor={c.gestor}
            editable={esHoy}
          />
        </>
      )}
    </>
  );
}
