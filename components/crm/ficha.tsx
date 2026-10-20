'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { cambiarEtapaProspecto } from '@/app/(crm)/crm/acciones';

/** Secciones de solo lectura (etiqueta → valor), en el orden del layout de Zoho. */
export function SeccionesFicha({
  secciones,
}: {
  secciones: { titulo: string; campos: [string, React.ReactNode][] }[];
}) {
  return (
    <div className="space-y-5">
      {secciones.map((s) => (
        <section key={s.titulo} className="rounded-2xl border border-line bg-surface p-5 shadow-card">
          <h2 className="mb-4 text-base">{s.titulo}</h2>
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-2 lg:grid-cols-3">
            {s.campos.map(([etiqueta, valor]) => (
              <div key={etiqueta}>
                <dt className="text-xs font-medium text-muted-foreground">{etiqueta}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm">
                  {valor === null || valor === undefined || valor === '' ? (
                    <span className="text-muted-foreground">—</span>
                  ) : (
                    valor
                  )}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      ))}
    </div>
  );
}

export function EtapaProspecto({
  prospecto,
  etapas,
  editable,
}: {
  prospecto: { id: string; version: number; etapa_id: string | null };
  etapas: { id: string; nombre: string }[];
  editable: boolean;
}) {
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  const actual = etapas.find((e) => e.id === prospecto.etapa_id)?.nombre ?? 'Sin estado';
  if (!editable)
    return (
      <span className="inline-flex rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-white">
        {actual}
      </span>
    );
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label htmlFor="etapa-prospecto" className="text-sm font-medium">
        Estado
      </label>
      <select
        id="etapa-prospecto"
        value={prospecto.etapa_id ?? ''}
        disabled={pendiente}
        onChange={(e) =>
          iniciar(async () => {
            setError('');
            const r = await cambiarEtapaProspecto(prospecto.id, prospecto.version, e.target.value || null);
            if (r.error !== undefined) return setError(r.error);
            router.refresh();
          })
        }
        className="h-9 rounded-lg border border-line-strong bg-surface px-3 text-sm"
      >
        <option value="">Sin estado</option>
        {etapas.map((e) => (
          <option key={e.id} value={e.id}>
            {e.nombre}
          </option>
        ))}
      </select>
      {error && (
        <p role="alert" className="text-sm text-bad">
          {error}
        </p>
      )}
    </div>
  );
}
