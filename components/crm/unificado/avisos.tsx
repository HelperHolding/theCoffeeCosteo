'use client';
import { useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { BellRing, Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { atenderAviso } from '@/app/(crm)/crm/acciones-pipeline';
import { AREAS } from '@/lib/crm/unificado/modelo';
import type { Aviso, ClaveArea } from '@/lib/crm/tipos';

/** Bandeja de avisos automáticos (COF, 5 días hábiles, 120 días, COF tardía) con «Atendido». */
export function BandejaAvisos({
  avisos,
  areas,
  todas,
}: {
  avisos: Aviso[];
  /** Áreas en las que el usuario opera; con `todas` (head o desarrollador) atiende cualquiera. */
  areas: ClaveArea[];
  todas: boolean;
}) {
  const puede = (a: Aviso) => todas || areas.includes(a.area);
  const [error, setError] = useState('');
  const [pendiente, iniciar] = useTransition();
  const router = useRouter();
  if (!avisos.length)
    return <p className="px-5 py-4 text-sm text-muted-foreground">Sin avisos pendientes.</p>;
  return (
    <ul role="list" className="divide-y divide-line">
      {avisos.map((a) => (
        <li key={a.id} className="flex flex-wrap items-start gap-3 px-5 py-3">
          <BellRing size={16} aria-hidden="true" className="mt-0.5 shrink-0 text-warn" />
          <div className="min-w-0 flex-1">
            <p className="text-sm">
              <Link href={`/crm/sucursales/${a.tienda_id}`} className="hover:underline">
                {a.mensaje}
              </Link>
            </p>
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <span
                aria-hidden="true"
                className="size-1.5 rounded-full"
                style={{ background: AREAS[a.area].color }}
              />
              Para {AREAS[a.area].nombre}
            </p>
          </div>
          {puede(a) && (
            <Button
              size="sm"
              variant="outline"
              disabled={pendiente}
              onClick={() =>
                iniciar(async () => {
                  setError('');
                  const r = await atenderAviso(a.id);
                  if (r.error !== undefined) return setError(r.error);
                  router.refresh();
                })
              }
            >
              <Check aria-hidden="true" /> Atendido
            </Button>
          )}
        </li>
      ))}
      {error && (
        <li role="alert" className="px-5 py-2 text-sm text-bad">
          {error}
        </li>
      )}
    </ul>
  );
}
