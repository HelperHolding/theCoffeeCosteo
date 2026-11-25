// components/comercializadora/reporte-semanal/config.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Tarjeta } from '@/components/portal/piezas';
import { guardarConfigReporte } from '@/app/(comercializadora)/comercializadora/acciones';
import type { FormConfigReporte } from '@/lib/comercializadora/configReporte';

const LISTAS: [keyof FormConfigReporte, string, string][] = [
  ['excluir_ventas', 'Excluir de ventas y surtido', 'Un cliente de Zoho por línea'],
  ['corporativo_ap', 'Clientes de Corporativo AP', 'Se suman en el top de clientes'],
  ['excluir_saldos', 'Excluir de saldos externos', 'Se mencionan al pie'],
  ['excluir_saldos_sucursales', 'Sucursales propias fuera de saldos', 'Nombre de la sucursal'],
  ['deuda_interna', 'Deuda interna (mismo corporativo)', 'Se muestran aparte'],
  ['creditos_activos', 'Créditos activos', 'Cliente | Sucursal | Nota (Sucursal vacía = todas)'],
];
const NUMEROS: [keyof FormConfigReporte, string][] = [
  ['fill', 'Meta fill rate (≥ %)'], ['stock', 'Meta faltante por stock (≤ %)'], ['pickeo', 'Meta precisión de pickeo (≥ %)'],
  ['fisica', 'Meta calidad física (≤ %)'], ['envio', 'Meta envío en tiempo (≥ %)'], ['dias_envio', 'Días hábiles para enviar'],
  ['dias_incidencias', 'Días de incidencias abiertas a revisar'],
];

export function ConfigReporteVista({ inicial }: { inicial: FormConfigReporte }) {
  const router = useRouter();
  const [f, setF] = useState(inicial);
  const [pendiente, iniciar] = useTransition();
  const [msj, setMsj] = useState<{ ok: boolean; texto: string } | null>(null);
  const campo = (k: keyof FormConfigReporte) => ({ value: f[k], onChange: (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value }) });
  return (
    <details className="mt-8">
      <summary className="cursor-pointer text-sm font-semibold">Configuración del reporte</summary>
      <Tarjeta className="mt-3">
        <form
          className="grid gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            iniciar(async () => {
              const r = await guardarConfigReporte(f);
              setMsj('error' in r ? { ok: false, texto: r.error } : { ok: true, texto: 'Guardado. La próxima lectura usa la configuración nueva.' });
              router.refresh();
            });
          }}
        >
          <div className="grid gap-4 md:grid-cols-2">
            {LISTAS.map(([k, etiqueta, ayuda]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="font-medium">{etiqueta}</span>
                <textarea rows={4} className="rounded-lg border border-line bg-surface px-2 py-1 font-mono text-xs" {...campo(k)} />
                <span className="text-xs text-muted-foreground">{ayuda}</span>
              </label>
            ))}
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {NUMEROS.map(([k, etiqueta]) => (
              <label key={k} className="grid gap-1 text-sm">
                <span className="font-medium">{etiqueta}</span>
                <input inputMode="decimal" className="rounded-lg border border-line bg-surface px-2 py-1 tabular" {...campo(k)} />
              </label>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button type="submit" disabled={pendiente} className="rounded-lg bg-ink px-3 py-1.5 text-sm font-semibold text-surface">
              {pendiente ? 'Guardando…' : 'Guardar'}
            </button>
            {msj && <span role={msj.ok ? 'status' : 'alert'} className={msj.ok ? 'text-sm text-ok' : 'text-sm text-bad'}>{msj.texto}</span>}
          </div>
        </form>
      </Tarjeta>
    </details>
  );
}
