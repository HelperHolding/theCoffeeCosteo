'use client';
import { claseCampo } from '@/lib/crm/formato';
import { diasEntre, enZona, sumarDias } from '@/lib/sucursales/tiempo';
import { DIAS_MAXIMOS, PRESETS, rango, type IdPreset, type Periodo } from '@/lib/sucursales/periodo';
import { fechaCorta, numero } from './formato';

/** Selector del periodo compartido (las reglas puras viven en lib/sucursales/periodo.ts). */
export { rango, type Periodo } from '@/lib/sucursales/periodo';

export function guardarPeriodoEnUrl(p: Periodo) {
  const params = new URLSearchParams(window.location.search);
  params.delete('desde');
  params.delete('hasta');
  params.delete('periodo');
  if (p.id === 'rango') {
    params.set('desde', p.desde);
    params.set('hasta', p.hasta);
  } else params.set('periodo', p.id);
  window.history.replaceState(null, '', `${window.location.pathname}?${params}`);
}

/**
 * `ultimo` (opcional, Nivel de servicio): agrega «Último día con datos» al principio. Mientras esté activo, el periodo
 * compartido no cambia; al elegir otro, `alCambiar` lo cambia como siempre.
 */
export function SelectorPeriodo({
  periodo,
  zona,
  alCambiar,
  ultimo,
}: {
  periodo: Periodo;
  zona: string;
  alCambiar: (p: Periodo) => void;
  ultimo?: { activo: boolean; fecha: string | null; alElegir: () => void };
}) {
  const { desde, hasta } = rango(periodo, zona);
  const hoy = enZona(new Date(), zona).fecha;
  const dias = diasEntre(desde, hasta) + 1;
  const cambiarRango = (d: string, h: string) => {
    if (!d || !h) return;
    const [a, b] = d <= h ? [d, h] : [h, d];
    // Si el rango pasa de 62 días, se recorta desde la fecha final (nunca se pide algo que la API rechaza).
    const inicio = diasEntre(a, b) >= DIAS_MAXIMOS ? sumarDias(b, -(DIAS_MAXIMOS - 1)) : a;
    alCambiar({ id: 'rango', desde: inicio, hasta: b });
  };
  return (
    <div className="flex flex-wrap items-end gap-3">
      <label className="text-sm">
        <span className="mb-1 block font-medium text-ink-2">Periodo</span>
        <select
          value={ultimo?.activo ? 'ultimo' : periodo.id}
          onChange={(e) =>
            e.target.value === 'ultimo'
              ? ultimo?.alElegir()
              : e.target.value === 'rango'
                ? alCambiar({ id: 'rango', desde, hasta })
                : alCambiar({ id: e.target.value as IdPreset })
          }
          className={`${claseCampo} w-48`}
        >
          {ultimo && <option value="ultimo">Último día con datos</option>}
          {PRESETS.map((x) => (
            <option key={x.id} value={x.id}>
              {x.nombre}
            </option>
          ))}
          <option value="rango">Elegir fechas…</option>
        </select>
      </label>
      {periodo.id === 'rango' && !ultimo?.activo ? (
        <>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-2">Desde</span>
            <input
              type="date"
              value={desde}
              max={hasta}
              min={sumarDias(hasta, -(DIAS_MAXIMOS - 1))}
              onChange={(e) => cambiarRango(e.target.value, hasta)}
              className={`${claseCampo} w-40`}
            />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-medium text-ink-2">Hasta</span>
            <input
              type="date"
              value={hasta}
              max={hoy}
              onChange={(e) => cambiarRango(desde, e.target.value)}
              className={`${claseCampo} w-40`}
            />
          </label>
        </>
      ) : null}
      <p className="pb-2 text-xs text-muted-foreground tabular">
        {ultimo?.activo ? (
          ultimo.fecha ? (
            fechaCorta(ultimo.fecha)
          ) : (
            '—'
          )
        ) : (
          <>
            {desde === hasta ? fechaCorta(desde) : `${fechaCorta(desde)} – ${fechaCorta(hasta)}`}
            {dias > 1 && ` (${numero(dias)} días)`}
          </>
        )}
      </p>
    </div>
  );
}
