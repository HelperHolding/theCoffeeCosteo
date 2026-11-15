import Link from 'next/link';
import { cn } from 'cn';
import { AREAS, type EtapaGeneral } from '@/lib/crm/unificado/modelo';
import { ChipEtapa } from '@/components/crm/unificado/card-pipeline';
import { FichaFecha, PanelCifras, VacioBreve } from '@/components/crm/unificado/piezas';

/** Estado del carril Legal de una sucursal, en el orden del documento (puntos 27–31). */
export type EstadoCarril = 'por_enviar' | 'cof_enviada' | 'cof_firmada' | 'contrato_firmado' | 'liberada';

export const COLUMNAS_CARRIL: { estado: EstadoCarril; titulo: string; ayuda: string }[] = [
  { estado: 'por_enviar', titulo: 'COF por enviar', ayuda: 'Debe firmarse 2 meses antes de la apertura' },
  { estado: 'cof_enviada', titulo: 'COF enviada', ayuda: 'Esperando la firma del franquiciatario' },
  { estado: 'cof_firmada', titulo: 'COF firmada', ayuda: 'Sigue el contrato de franquicia' },
  { estado: 'contrato_firmado', titulo: 'Contrato firmado', ayuda: 'Falta liberar la apertura' },
  { estado: 'liberada', titulo: 'Liberada para abrir', ayuda: 'Proyectos puede cerrar 26.7 y abrir' },
];

/** Claves de requisitos del carril ya validadas → estado. */
export function estadoCarril(validadas: Set<string>): EstadoCarril {
  if (validadas.has('liberacion_apertura')) return 'liberada';
  if (validadas.has('contrato_firmado')) return 'contrato_firmado';
  if (validadas.has('cof_firmada')) return 'cof_firmada';
  if (validadas.has('cof_enviada')) return 'cof_enviada';
  return 'por_enviar';
}

export interface FilaCarril {
  id: string;
  nombre: string;
  franquiciatario: string | null;
  etapa: EtapaGeneral;
  estado: EstadoCarril;
  /** Fecha clave del estado: límite de la COF, o apertura confirmada/estimada. */
  fecha: string | null;
  fechaTexto: string;
  dias: number | null;
}

const diasTexto = (d: number) => (d < 0 ? `venció hace ${-d} d` : d === 0 ? 'hoy' : `en ${d} d`);

/** Tablero de Legal: sucursales de la etapa 8 en adelante, por estado de COF y contrato. */
export function VistaCarrilLegal({ filas }: { filas: FilaCarril[] }) {
  const de = (e: EstadoCarril) => filas.filter((f) => f.estado === e);
  const vencidas = filas.filter((f) => f.estado === 'por_enviar' && f.dias !== null && f.dias < 0).length;
  return (
    <>
      <PanelCifras
        cifras={[
          {
            etiqueta: 'Sucursales en el carril',
            valor: filas.length,
            nota: 'de la transferencia a la apertura',
          },
          {
            etiqueta: 'COF fuera de plazo',
            valor: vencidas,
            tono: vencidas ? 'bad' : undefined,
            nota: 'la apertura se ajusta al plazo legal',
          },
          { etiqueta: 'Contratos por firmar', valor: de('cof_firmada').length, nota: 'COF firmada' },
          {
            etiqueta: 'Listas para abrir',
            valor: de('liberada').length,
            tono: 'ok',
            nota: 'liberadas por Legal',
          },
        ]}
      />
      {filas.length === 0 ? (
        <VacioBreve>
          Aún no hay sucursales en el carril Legal. Entran cuando Legal habilita la transferencia a Proyectos.
        </VacioBreve>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          {COLUMNAS_CARRIL.map((c) => {
            const fs = de(c.estado);
            return (
              <section
                key={c.estado}
                aria-label={c.titulo}
                className="flex min-w-0 flex-col rounded-2xl border border-line bg-surface shadow-card"
              >
                <header className="border-b border-line px-4 pb-2.5 pt-3">
                  <h2 className="flex items-center justify-between gap-2 text-sm font-semibold">
                    {c.titulo}
                    <span className="rounded-full bg-surface-2 px-2 py-0.5 text-xs tabular text-ink-2">
                      {fs.length}
                    </span>
                  </h2>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{c.ayuda}</p>
                </header>
                <ul role="list" className="flex-1 space-y-2 p-2.5">
                  {fs.map((f) => {
                    const tono =
                      f.dias === null ? undefined : f.dias < 0 ? 'bad' : f.dias <= 14 ? 'warn' : undefined;
                    return (
                      <li key={f.id}>
                        <Link
                          href={`/crm/sucursales/${f.id}?tab=requisitos`}
                          className="block space-y-2 rounded-xl border border-line bg-surface p-3 hover:border-line-strong"
                        >
                          <span className="block">
                            <span className="block truncate text-sm font-semibold">{f.nombre}</span>
                            {f.franquiciatario && (
                              <span className="block truncate text-xs text-muted-foreground">
                                {f.franquiciatario}
                              </span>
                            )}
                          </span>
                          <ChipEtapa etapa={f.etapa} />
                          {f.fecha && (
                            <span className="flex items-center gap-2.5">
                              <FichaFecha fecha={f.fecha} tono={tono} />
                              <span className="min-w-0 text-[11px] leading-snug">
                                <span className="block text-ink-2">{f.fechaTexto}</span>
                                {f.dias !== null && (
                                  <span
                                    className={cn(
                                      tono === 'bad'
                                        ? 'font-semibold text-bad'
                                        : tono === 'warn'
                                          ? 'font-semibold text-warn'
                                          : 'text-muted-foreground',
                                    )}
                                  >
                                    {diasTexto(f.dias)}
                                  </span>
                                )}
                              </span>
                            </span>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                  {!fs.length && (
                    <li className="rounded-xl border border-dashed border-line-strong px-3 py-4 text-center text-xs text-muted-foreground">
                      Ninguna
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <span aria-hidden="true" className="size-2 rounded-full" style={{ background: AREAS.legal.color }} />
        Legal registra cada hito en la ficha de la sucursal; la apertura (26.8) exige los cinco.
      </p>
    </>
  );
}
