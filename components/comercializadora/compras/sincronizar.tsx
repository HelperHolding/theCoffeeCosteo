// components/comercializadora/compras/sincronizar.tsx
'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RefreshCw } from 'lucide-react';
import { sincronizarCompras } from '@/app/(comercializadora)/comercializadora/acciones';

export function SincronizarCompras() {
  const router = useRouter();
  const [pendiente, iniciar] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; texto: string } | null>(null);
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <button type="button" disabled={pendiente} className="inline-flex items-center gap-1 text-sm font-semibold underline"
        onClick={() => iniciar(async () => {
          const r = await sincronizarCompras();
          setMsg('error' in r ? { ok: false, texto: r.error } : { ok: true, texto: r.mensaje });
          router.refresh();
        })}>
        <RefreshCw size={14} aria-hidden="true" className={pendiente ? 'animate-spin' : undefined} />
        {pendiente ? 'Leyendo Zoho (hasta 2 min)…' : 'Sincronizar ahora'}
      </button>
      {msg && <span role={msg.ok ? 'status' : 'alert'} className={msg.ok ? 'text-xs text-ok' : 'text-xs text-bad'}>{msg.texto}</span>}
    </span>
  );
}
