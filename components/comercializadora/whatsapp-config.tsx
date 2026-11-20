'use client';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { guardarWhatsapp } from '@/app/(comercializadora)/comercializadora/acciones';

export function WhatsappConfig(p: {
  activo: boolean;
  solo: string[];
  proveedores: { vendor_id: string; nombre: string | null }[];
  editable: boolean;
}) {
  const router = useRouter();
  const [activo, setActivo] = useState(p.activo);
  const [solo, setSolo] = useState<string[]>(p.solo);
  const [msg, setMsg] = useState<string | null>(null);
  const [pendiente, iniciar] = useTransition();
  const alternar = (id: string) => setSolo((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  return (
    <section className="placa space-y-3 px-4 py-3 text-sm">
      <h2 className="font-semibold">WhatsApp de OCs</h2>
      <p className="text-muted-foreground">
        Cuando una OC pasa a emitida en Zoho, n8n manda el PDF al número del campo &quot;WhatsApp OCs&quot;
        del proveedor. Si eliges proveedores abajo, solo a ellos (para probar).
      </p>
      <label className="flex items-center gap-2">
        <input
          type="checkbox"
          checked={activo}
          disabled={!p.editable}
          onChange={(e) => setActivo(e.target.checked)}
        />
        Mandar OCs emitidas por WhatsApp
      </label>
      <div className="max-h-48 space-y-1 overflow-y-auto">
        {p.proveedores.map((v) => (
          <label key={v.vendor_id} className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={solo.includes(v.vendor_id)}
              disabled={!p.editable}
              onChange={() => alternar(v.vendor_id)}
            />
            Solo a {v.nombre ?? v.vendor_id}
          </label>
        ))}
      </div>
      {p.editable ? (
        <button
          type="button"
          className="h-10 rounded-[10px] bg-ink px-4 text-sm font-semibold text-white"
          disabled={pendiente}
          onClick={() =>
            iniciar(async () => {
              const r = await guardarWhatsapp(activo, solo);
              setMsg('error' in r ? r.error : 'Guardado.');
              if (!('error' in r)) router.refresh();
            })
          }
        >
          Guardar WhatsApp
        </button>
      ) : null}
      {msg ? <p role="status">{msg}</p> : null}
    </section>
  );
}
