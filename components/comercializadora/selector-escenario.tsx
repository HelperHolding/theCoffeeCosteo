'use client';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { claseCampo } from '@/lib/crm/formato';

/** Selector de escenario (_impSetEscenario / _cafeSetEscenario): solo cambia lo que se ve (?esc=), no lo guarda. */
export function SelectorEscenario({ opciones, valor }: { opciones: [string, string][]; valor: string }) {
  const router = useRouter();
  const ruta = usePathname();
  const sp = useSearchParams();
  return (
    <label className="flex items-center gap-2 text-sm text-ink-2">
      Escenario
      <select
        aria-label="Escenario"
        className={`${claseCampo} max-w-md`}
        value={valor}
        onChange={(e) => {
          const q = new URLSearchParams(sp.toString());
          q.set('esc', e.target.value);
          router.push(`${ruta}?${q.toString()}`);
        }}
      >
        {opciones.map(([v, t]) => (
          <option key={v} value={v}>
            {t}
          </option>
        ))}
      </select>
    </label>
  );
}
