import Link from 'next/link';
import { CalendarX2 } from 'lucide-react';
import { difDias, fechaCorta } from '@/lib/comercializadora/fechas';

export interface AvisoFranja {
  id: number;
  vendor_name: string;
  ini: string;
  fin: string;
  u: string | null;
}

export function AvisosCierre({ avisos, hoy }: { avisos: AvisoFranja[]; hoy: string }) {
  const lista = avisos.filter((c) => hoy >= c.ini.slice(0, 10) || (c.u != null && difDias(hoy, c.u) <= 14));
  if (!lista.length) return null;
  return (
    <div role="note" className="placa flex gap-3 border-warn/40 bg-warn-soft px-4 py-3 text-sm">
      <CalendarX2 size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
      <ul className="space-y-1">
        {lista.map((c) => (
          <li key={c.id}>
            <b>{c.vendor_name}</b> sin stock del {fechaCorta(c.ini)} al {fechaCorta(c.fin)}
            {hoy >= c.ini.slice(0, 10)
              ? ' (en cierre)'
              : c.u
                ? hoy > c.u
                  ? ' · ya no alcanza a llegar antes'
                  : ` · último día para pedir: ${fechaCorta(c.u)}`
                : ''}
          </li>
        ))}
        <li>
          <Link href="/comercializadora/proveedores-sin-stock" className="font-semibold underline">
            Ver proveedores sin stock
          </Link>
        </li>
      </ul>
    </div>
  );
}
